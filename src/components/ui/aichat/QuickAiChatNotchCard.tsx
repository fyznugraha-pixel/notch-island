import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  Route,
  ArrowUp,
  X,
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
  Clipboard,
  Square,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { AiBrandLogo, detectAiBrand } from "./AiBrandLogos";
import { AiNotchActionCard } from "./AiNotchActionCard";
import type {
  AiModelConfig,
  AiProviderId,
  AiChatMessage,
} from "./AiChatTypes";
import {
  streamChatCompletion,
  loadActiveProvider,
  getEffectiveApiKey,
  loadSavedBaseUrls,
  AI_MODELS,
} from "../../../services/aiChatService";
import {
  getRegisteredModels,
  verifyAndRegisterModels,
} from "../../../services/aiModelRegistry";
import {
  loadRouterConfig,
  evaluatePromptHeuristics,
  resolveTierModel,
} from "../../../services/aiRouterService";
import {
  parseAndExecuteGiliActions,
  type GiliActionResult,
} from "../../../services/aiNotchTools";
import {
  createConversation,
  updateConversationMessages,
  setActiveConversationId,
  generateTitleFromPrompt,
} from "../../../services/aiConversationService";
import {
  GILI_FREE_MODEL,
  isGiliFreeEnabled,
  describeGiliFreeError,
} from "../../../services/giliFreeService";

export interface QuickAiChatNotchCardProps {
  isLightMode?: boolean;
  isIsland?: boolean;
  shortcutLabel?: string;
  onExpandedChange?: (expanded: boolean) => void;
  onOpenFullChat: (initialPrompt?: string, messages?: AiChatMessage[]) => void;
  onCancel: () => void;
}

export const QuickAiChatNotchCard: React.FC<QuickAiChatNotchCardProps> = ({
  isLightMode = false,
  isIsland = false,
  shortcutLabel = "CTRL ALT A",
  onExpandedChange,
  onOpenFullChat,
  onCancel,
}) => {
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [responseContent, setResponseContent] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [executedActions, setExecutedActions] = useState<GiliActionResult[]>([]);
  const [submittedPrompt, setSubmittedPrompt] = useState<string | null>(null);
  const [routedModel, setRoutedModel] = useState<AiModelConfig | null>(null);
  const [routedProvider, setRoutedProvider] = useState<AiProviderId | null>(null);
  const [copied, setCopied] = useState(false);
  const [clipboardSnippet, setClipboardSnippet] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const responseScrollRef = useRef<HTMLDivElement>(null);

  // Focus input automatically on mount
  useEffect(() => {
    const focusInput = () => {
      inputRef.current?.focus();
    };
    focusInput();
    const t1 = setTimeout(focusInput, 30);
    const t2 = setTimeout(focusInput, 80);
    const t3 = setTimeout(focusInput, 200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // Check clipboard snippet for quick summary chip
  useEffect(() => {
    let isMounted = true;
    if (navigator?.clipboard?.readText) {
      navigator.clipboard
        .readText()
        .then((clipText) => {
          if (!isMounted) return;
          const clean = clipText?.trim();
          if (clean && clean.length > 3 && clean.length < 500) {
            setClipboardSnippet(clean);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync expanded status to parent notch
  const isExpanded = Boolean(submittedPrompt || isThinking || isStreaming || responseContent);
  useEffect(() => {
    onExpandedChange?.(isExpanded);
  }, [isExpanded, onExpandedChange]);

  // Handle global Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (isStreaming && abortControllerRef.current) {
          abortControllerRef.current.abort();
          setIsStreaming(false);
          setIsThinking(false);
        } else {
          onCancel();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isStreaming, onCancel]);

  // Scroll response down while streaming
  useEffect(() => {
    if (responseScrollRef.current) {
      responseScrollRef.current.scrollTop = responseScrollRef.current.scrollHeight;
    }
  }, [responseContent]);

  // Resolve Auto model selection (prioritizes Fast tier for cost saving)
  const resolveAutoModel = useCallback(async (userPrompt: string) => {
    const routerConfig = loadRouterConfig();
    const heuristics = evaluatePromptHeuristics(userPrompt);
    const targetTier = heuristics.tier;

    const activeProvider = loadActiveProvider();
    const registered = getRegisteredModels(activeProvider);
    let candidateModels: AiModelConfig[] = [];

    if (registered.length > 0) {
      candidateModels = registered;
    } else {
      const providers: AiProviderId[] = [
        "custom",
        "openai",
        "deepseek",
        "gemini",
        "claude",
        "openrouter",
        "grok",
      ];
      for (const p of providers) {
        const k = getEffectiveApiKey(p);
        const reg = getRegisteredModels(p);
        if (k && reg.length > 0) {
          candidateModels.push(...reg);
        }
      }
    }

    if (candidateModels.length === 0) {
      const activeKey = getEffectiveApiKey(activeProvider);
      if (activeKey) {
        try {
          const customBase = loadSavedBaseUrls()[activeProvider]?.trim();
          const regResult = await verifyAndRegisterModels(activeProvider, activeKey, customBase);
          if (regResult.ok && regResult.models.length > 0) {
            candidateModels = regResult.models;
          }
        } catch {}
      }
      if (candidateModels.length === 0) {
        candidateModels = AI_MODELS.filter((m) => m.provider === activeProvider);
      }
    }

    const resolved = resolveTierModel(targetTier, candidateModels, routerConfig);
    const modelToUse = resolved?.targetModel || candidateModels[0] || AI_MODELS[0];
    const providerToUse = resolved?.targetProvider || modelToUse.provider;
    const keyToUse =
      getEffectiveApiKey(providerToUse, modelToUse.id) ||
      getEffectiveApiKey(providerToUse);

    return {
      modelToUse,
      providerToUse,
      keyToUse,
    };
  }, []);

  const handleSendPrompt = async (overridePrompt?: string) => {
    const textToSend = (overridePrompt ?? prompt).trim();
    if (!textToSend || isStreaming) return;

    setSubmittedPrompt(textToSend);
    setPrompt("");
    setResponseContent("");
    setErrorMessage(null);
    setExecutedActions([]);
    setIsThinking(true);

    try {
      const resolvedRoute = await resolveAutoModel(textToSend);
      const useGiliFree = !resolvedRoute.keyToUse && isGiliFreeEnabled();
      const modelToUse = useGiliFree ? GILI_FREE_MODEL : resolvedRoute.modelToUse;
      const providerToUse = useGiliFree ? GILI_FREE_MODEL.provider : resolvedRoute.providerToUse;
      const keyToUse = resolvedRoute.keyToUse;
      setRoutedModel(modelToUse);
      setRoutedProvider(providerToUse);

      if (!keyToUse && !useGiliFree) {
        setIsThinking(false);
        setErrorMessage("API key belum terpasang. Silakan hubungkan API key di panel AI Chat.");
        return;
      }

      abortControllerRef.current = new AbortController();
      let accumulated = "";

      const userMsg: AiChatMessage = {
        id: `usr-${Date.now()}`,
        role: "user",
        content: textToSend,
        timestamp: Date.now(),
      };

      await streamChatCompletion({
        provider: providerToUse,
        apiKey: keyToUse,
        model: modelToUse,
        messages: [userMsg],
        lengthMode: "compact", // Fast, hemat & ringkas
        useGiliFree,
        signal: abortControllerRef.current.signal,
        onChunk: (chunk: string) => {
          setIsThinking(false);
          setIsStreaming(true);
          accumulated += chunk;
          setResponseContent(accumulated);
        },
      });

      setIsStreaming(false);
      setIsThinking(false);

      // Execute embedded Gili notch actions
      const { cleanText, results } = await parseAndExecuteGiliActions(accumulated);
      if (results.length > 0) {
        setExecutedActions(results);
        setResponseContent(cleanText);
      }
    } catch (err: unknown) {
      setIsThinking(false);
      setIsStreaming(false);
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (!isAbort) {
        const errorText = err instanceof Error ? err.message : String(err);
        setErrorMessage(
          describeGiliFreeError(errorText) || "Gagal menghubungkan ke AI. Periksa internet atau API key Anda."
        );
      }
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setIsThinking(false);
    }
  };

  const handleResetPrompt = () => {
    handleStopStreaming();
    setSubmittedPrompt(null);
    setResponseContent("");
    setErrorMessage(null);
    setExecutedActions([]);
    setPrompt("");
    setTimeout(() => {
      inputRef.current?.focus();
    }, 40);
  };

  const handleCopyResponse = async () => {
    if (!responseContent) return;
    try {
      await navigator.clipboard.writeText(responseContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const handleOpenInFullChat = () => {
    if (!submittedPrompt) {
      onOpenFullChat(prompt);
      return;
    }

    try {
      const activeProv = routedProvider || loadActiveProvider();
      const modelId = routedModel?.id || "auto";
      const conv = createConversation(
        activeProv,
        modelId,
        generateTitleFromPrompt(submittedPrompt)
      );

      const msgs: AiChatMessage[] = [
        {
          id: `usr-${Date.now() - 1000}`,
          role: "user",
          content: submittedPrompt,
          timestamp: Date.now() - 1000,
        },
        {
          id: `ast-${Date.now()}`,
          role: "assistant",
          content: responseContent,
          timestamp: Date.now(),
          provider: activeProv,
          modelId: modelId,
          modelName: routedModel?.name,
          notchActions: executedActions.length > 0 ? executedActions : undefined,
        },
      ];

      updateConversationMessages(conv.id, msgs);
      setActiveConversationId(conv.id);
      window.dispatchEvent(
        new CustomEvent("gili_ai_conversation_switch", { detail: { conversationId: conv.id } })
      );
      onOpenFullChat(undefined, msgs);
    } catch {
      onOpenFullChat(submittedPrompt);
    }
  };

  const brandKey = routedModel
    ? detectAiBrand(`${routedModel.id} ${routedModel.name}`, routedProvider || undefined)
    : "auto";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className={`w-full h-full flex flex-col justify-between select-none font-sans ${
        isLightMode ? "text-[#1d1d1f]" : "text-white"
      }`}
      style={{
        padding: isIsland ? "14px 20px 14px" : "12px 18px 12px",
        boxSizing: "border-box",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. Header Row */}
      <div className="flex items-center justify-between shrink-0 h-7">
        <div className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-[8px] flex items-center justify-center shrink-0 ${
              isLightMode
                ? "bg-[#3882F6]/15 text-[#2563eb]"
                : "bg-[#3882F6]/20 text-[#60a5fa]"
            }`}
          >
            <Bot size={14} strokeWidth={2.2} />
          </div>

          <span
            className={`text-[12.5px] font-semibold tracking-tight ${
              isLightMode ? "text-[#27272a]" : "text-[#f4f4f5]"
            }`}
          >
            Quick AI
          </span>

          <div
            title="Model otomatis memilih yang paling hemat dan cerdas"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/12 text-emerald-400 border border-emerald-500/20"
          >
            <Route size={9.5} className="text-emerald-400 shrink-0" />
            <span>Auto (Hemat)</span>
          </div>
        </div>

        {/* Right shortcut & actions */}
        <div className="flex items-center gap-1">
          {shortcutLabel ? (
            <span
              className={`text-[10px] rounded-[5px] px-1.5 py-0.5 tracking-wider uppercase font-mono ${
                isLightMode
                  ? "border border-black/10 bg-black/[0.04] text-[#71717a]"
                  : "text-[#a1a1aa] border border-white/10 bg-white/[0.04]"
              }`}
            >
              {shortcutLabel}
            </span>
          ) : null}

          <button
            type="button"
            title="Buka AI Chat penuh"
            onClick={handleOpenInFullChat}
            className="w-6 h-6 rounded-[6px] flex items-center justify-center text-[#a1a1aa] hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer active:scale-95"
          >
            <ExternalLink size={12.5} strokeWidth={2} />
          </button>

          <button
            type="button"
            title="Tutup (Esc)"
            onClick={onCancel}
            className="w-6 h-6 rounded-[6px] flex items-center justify-center text-[#a1a1aa] hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer active:scale-95"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* 2. Middle Body */}
      {!submittedPrompt ? (
        /* IDLE STATE: Ultra-compact Search Input & Suggestion Chips */
        <div className="my-auto flex flex-col justify-center min-h-0 gap-2">
          {/* Modern Input Bar */}
          <div
            className={`flex items-center w-full h-[36px] rounded-[11px] px-3 transition-all ${
              isLightMode
                ? "bg-black/[0.04] border border-black/10 focus-within:border-black/25 focus-within:bg-black/[0.06]"
                : "bg-white/[0.04] border border-white/10 focus-within:border-white/25 focus-within:bg-white/[0.07]"
            }`}
          >
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSendPrompt();
                }
              }}
              placeholder="Tanya apa saja, minta ringkas, atau jalankan perintah..."
              className={`w-full bg-transparent text-[13px] focus:outline-none transition-all placeholder:text-zinc-500 font-sans select-text ${
                isLightMode ? "text-[#1d1d1f]" : "text-zinc-100"
              }`}
            />

            <button
              type="button"
              disabled={!prompt.trim()}
              onClick={() => handleSendPrompt()}
              title="Kirim (Enter)"
              className="w-6 h-6 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-0 disabled:pointer-events-none text-white flex items-center justify-center cursor-pointer transition-all active:scale-95 shadow-sm shrink-0 ml-1.5"
            >
              <ArrowUp size={13} strokeWidth={2.4} />
            </button>
          </div>

          {/* Clean Suggestion Chips Row */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[10.5px]">
            {clipboardSnippet && (
              <button
                type="button"
                onClick={() => handleSendPrompt(`Ringkas teks berikut:\n\n"${clipboardSnippet}"`)}
                className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-[6px] border border-blue-500/30 bg-blue-500/12 text-blue-300 hover:bg-blue-500/22 cursor-pointer transition-all active:scale-95 font-medium"
              >
                <Clipboard size={10} strokeWidth={2} />
                <span className="truncate max-w-[140px]">Ringkas clipboard</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSendPrompt("Rekomendasikan fokus kerja hari ini berdasarkan to-do saya")}
              className="shrink-0 px-2 py-0.5 rounded-[6px] border border-white/[0.08] hover:border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white cursor-pointer transition-all active:scale-95"
            >
              Fokus kerja
            </button>

            <button
              type="button"
              onClick={() => handleSendPrompt("Mulai timer pomodoro 25 menit")}
              className="shrink-0 px-2 py-0.5 rounded-[6px] border border-white/[0.08] hover:border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white cursor-pointer transition-all active:scale-95"
            >
              Timer 25m
            </button>

            <button
              type="button"
              onClick={() => {
                setPrompt("Jelaskan secara ringkas: ");
                inputRef.current?.focus();
              }}
              className="shrink-0 px-2 py-0.5 rounded-[6px] border border-white/[0.08] hover:border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white cursor-pointer transition-all active:scale-95"
            >
              Jelaskan konsep...
            </button>
          </div>
        </div>
      ) : (
        /* ANSWER STATE: User Prompt Pill, Live Response & Footer */
        <div className="grow flex flex-col justify-between min-h-0 gap-2 pt-1">
          {/* User question pill */}
          <div className="shrink-0 flex items-center justify-between px-3 py-1.5 rounded-[10px] bg-white/[0.04] border border-white/10 text-[12px] text-zinc-300">
            <span className="truncate max-w-[400px] font-medium text-zinc-200">
              "{submittedPrompt}"
            </span>
            <span className="text-[10.5px] text-zinc-400 shrink-0 font-mono ml-2">
              {routedModel?.name || "Auto"}
            </span>
          </div>

          {/* Response Scrollable Body */}
          <div
            ref={responseScrollRef}
            data-scrollable="true"
            className="grow min-h-0 overflow-y-auto no-scrollbar pr-1 select-text text-[13px] leading-relaxed text-zinc-200 flex flex-col gap-2"
          >
            {isThinking && (
              <div className="flex items-center gap-2 h-7 px-2.5 rounded-[10px] bg-blue-500/15 border border-blue-500/25 text-blue-300 text-[12px] font-medium w-fit animate-pulse">
                <Loader2 size={12} className="animate-spin text-blue-400" />
                <span>Memilih model hemat & memproses jawaban...</span>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-start gap-2 p-2.5 rounded-[12px] bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[12px]">
                <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">Gagal memproses permintaan</span>
                  <span className="opacity-90 leading-snug">{errorMessage}</span>
                </div>
              </div>
            )}

            {responseContent ? (
              <div className="whitespace-pre-wrap break-words">
                {responseContent}
                {isStreaming && (
                  <span
                    aria-hidden="true"
                    className="inline-block w-[2px] h-3.5 ml-0.5 align-[-2px] bg-blue-400 rounded-sm animate-pulse"
                  />
                )}
              </div>
            ) : null}

            {/* Render any Gili Notch Action results */}
            {executedActions.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-1.5">
                {executedActions.map((action, idx) => (
                  <AiNotchActionCard key={idx} action={action} />
                ))}
              </div>
            )}
          </div>

          {/* Bottom Action Footer */}
          <div className="shrink-0 flex items-center justify-between pt-1.5 border-t border-white/[0.08] text-[11px]">
            <div className="flex items-center gap-2 text-zinc-400">
              {routedModel && (
                <div className="flex items-center gap-1.5">
                  <AiBrandLogo provider={brandKey} size={15} />
                  <span className="text-[11px] font-medium text-zinc-300">
                    {routedModel.name}
                  </span>
                  <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-400 font-medium border border-emerald-500/20">
                    {routedModel.tier === "Fast" ? "Hemat" : routedModel.tier}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStopStreaming}
                  className="h-6 px-2.5 rounded-full border border-rose-500/30 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                >
                  <Square size={10} strokeWidth={2.5} />
                  <span>Hentikan</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCopyResponse}
                    disabled={!responseContent}
                    className="h-6 px-2.5 rounded-full border border-white/10 hover:border-white/20 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 flex items-center gap-1 cursor-pointer transition-all active:scale-95 disabled:opacity-40"
                  >
                    {copied ? (
                      <>
                        <Check size={11} className="text-emerald-400" />
                        <span className="text-emerald-400 font-medium">Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy size={11} />
                        <span>Salin</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenInFullChat}
                    className="h-6 px-2.5 rounded-full border border-blue-500/30 bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                  >
                    <ExternalLink size={11} />
                    <span>Chat Penuh</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetPrompt}
                    title="Tanya pertanyaan baru"
                    className="h-6 px-2 rounded-full border border-white/10 hover:border-white/20 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-all active:scale-95"
                  >
                    <RotateCcw size={11} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
