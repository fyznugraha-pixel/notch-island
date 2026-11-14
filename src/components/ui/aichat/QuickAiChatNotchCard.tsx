import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
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
  Image as ImageIcon,
} from "lucide-react";
import { AiBrandLogo, detectAiBrand } from "./AiBrandLogos";
import { readRasterImageFileForVision } from "../../../utils/imageUtils";
import { AiNotchActionCard } from "./AiNotchActionCard";
import type {
  AiModelConfig,
  AiProviderId,
  AiChatMessage,
  AiMessageContext,
} from "./AiChatTypes";
import {
  streamChatCompletion,
  recordTokenUsage,
  loadUsageStats,
  estimateTextTokens,
  loadActiveProvider,
  getEffectiveApiKey,
  loadSavedBaseUrls,
  AI_MODELS,
} from "../../../services/aiChatService";
import { initCredentials } from "../../../services/aiCredentialService";
import { isAbortError } from "../../../services/aiHttp";
import { formatIdrCostInCurrency } from "../../../services/aiCurrencyService";
import {
  getRegisteredModels,
  verifyAndRegisterModels,
} from "../../../services/aiModelRegistry";
import {
  loadRouterConfig,
  evaluatePromptHeuristics,
  resolveTierModel,
  evaluateBudgetPolicy,
  isVisionCapableModel,
} from "../../../services/aiRouterService";
import {
  parseAndExecuteGiliActions,
  stripActionBlocksForDisplay,
  type GiliActionResult,
} from "../../../services/aiNotchTools";
import {
  createConversation,
  updateConversationMessages,
  setActiveConversationId,
  generateTitleFromPrompt,
} from "../../../services/aiConversationService";
import {
  getGiliFreeModel,
  isGiliFreeEnabled,
  describeGiliFreeError,
} from "../../../services/giliFreeService";
import { t, type Language } from "../../../services/i18n";

export interface QuickAiChatNotchCardProps {
  isLightMode?: boolean;
  isIsland?: boolean;
  shortcutLabel?: string;
  onExpandedChange?: (expanded: boolean) => void;
  onOpenFullChat: (
    initialPrompt?: string,
    messages?: AiChatMessage[],
    conversationId?: string,
    initialContext?: AiMessageContext
  ) => void;
  onCancel: () => void;
  optLanguage?: Language;
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
  const [clipboardImage, setClipboardImage] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const [attachedImage, setAttachedImage] = useState<{
    dataUrl: string;
    title: string;
    sizeKb: number;
  } | null>(null);
  const [submittedImage, setSubmittedImage] = useState<{
    dataUrl: string;
    title: string;
    sizeKb: number;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const responseScrollRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const isSendingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    initCredentials().catch(() => {});
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

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

  // Check clipboard snippet & clipboard image for quick summary / paste chips
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

    invoke<{ thumbnail?: string; vision_data_url?: string; width?: number; height?: number } | null>(
      "read_clipboard_image",
      { persistFile: false, includeVision: true }
    )
      .then((res) => {
        if (!isMounted) return;
        const imgUrl = res?.vision_data_url || res?.thumbnail;
        if (res && imgUrl) {
          setClipboardImage({
            dataUrl: imgUrl,
            width: res.width || 0,
            height: res.height || 0,
          });
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const attachImageFile = useCallback(async (file: File) => {
    const dataUrl = await readRasterImageFileForVision(file);
    if (dataUrl) {
      setAttachedImage({
        dataUrl,
        title: file.name || "Pasted Image",
        sizeKb: Math.max(1, Math.round((dataUrl.length * 0.75) / 1024)),
      });
      inputRef.current?.focus();
    }
  }, []);

  const handlePasteClipboardImage = useCallback(async () => {
    if (clipboardImage) {
      setAttachedImage({
        dataUrl: clipboardImage.dataUrl,
        title:
          clipboardImage.width && clipboardImage.height
            ? `Clipboard (${clipboardImage.width}x${clipboardImage.height})`
            : "Clipboard Image",
        sizeKb: Math.max(1, Math.round((clipboardImage.dataUrl.length * 0.75) / 1024)),
      });
      inputRef.current?.focus();
      return;
    }

    try {
      const res = await invoke<{
        thumbnail?: string;
        vision_data_url?: string;
        width?: number;
        height?: number;
      } | null>("read_clipboard_image", { persistFile: false, includeVision: true });
      const imgUrl = res?.vision_data_url || res?.thumbnail;
      if (res && imgUrl) {
        setAttachedImage({
          dataUrl: imgUrl,
          title:
            res.width && res.height
              ? `Clipboard (${res.width}x${res.height})`
              : "Clipboard Image",
          sizeKb: Math.max(1, Math.round((imgUrl.length * 0.75) / 1024)),
        });
        inputRef.current?.focus();
        return;
      }
    } catch {}

    // If no image in clipboard, open file picker as fallback
    fileInputRef.current?.click();
  }, [clipboardImage]);

  const handleInputPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLInputElement>) => {
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith("image/")) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
              attachImageFile(file);
            }
            return;
          }
        }
      }

      // If no text was pasted (e.g. native Windows screenshot in clipboard), read via Tauri command
      const pastedText = e.clipboardData?.getData("text/plain");
      if (!pastedText) {
        try {
          const res = await invoke<{
            thumbnail?: string;
            vision_data_url?: string;
            width?: number;
            height?: number;
          } | null>("read_clipboard_image", { persistFile: false, includeVision: true });
          const imgUrl = res?.vision_data_url || res?.thumbnail;
          if (res && imgUrl) {
            setAttachedImage({
              dataUrl: imgUrl,
              title:
                res.width && res.height
                  ? `Clipboard (${res.width}x${res.height})`
                  : "Clipboard Image",
              sizeKb: Math.max(1, Math.round((imgUrl.length * 0.75) / 1024)),
            });
          }
        } catch {}
      }
    },
    [attachImageFile]
  );

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
        if ((isStreaming || isThinking) && abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
          isSendingRef.current = false;
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
  }, [isStreaming, isThinking, onCancel]);

  // Scroll response down while streaming
  useEffect(() => {
    if (responseScrollRef.current) {
      responseScrollRef.current.scrollTop = responseScrollRef.current.scrollHeight;
    }
  }, [responseContent]);

  // Resolve Auto model selection (prioritizes Fast tier for cost saving, and vision-capable models when an image is attached)
  const resolveAutoModel = useCallback(async (userPrompt: string, hasImage = false) => {
    const routerConfig = loadRouterConfig();
    const heuristics = evaluatePromptHeuristics(userPrompt);
    const targetTier = heuristics.tier;

    const activeProvider = loadActiveProvider();
    const registered = getRegisteredModels(activeProvider);
    let candidateModels: AiModelConfig[] = [];

    if (
      registered.length > 0 &&
      (!hasImage || (activeProvider !== "deepseek" && registered.some(isVisionCapableModel)))
    ) {
      candidateModels = registered;
    } else {
      const providers: AiProviderId[] = [
        "custom",
        "openai",
        "gemini",
        "claude",
        "openrouter",
        "grok",
        ...(hasImage ? [] : (["deepseek"] as AiProviderId[])),
      ];
      for (const p of providers) {
        const k = getEffectiveApiKey(p);
        const reg = getRegisteredModels(p);
        if (k && reg.length > 0) {
          candidateModels.push(...reg);
        }
      }
    }

    if (
      candidateModels.length === 0 ||
      (hasImage && !candidateModels.some(isVisionCapableModel))
    ) {
      const activeKey = getEffectiveApiKey(activeProvider);
      if (activeKey && (!hasImage || activeProvider !== "deepseek")) {
        try {
          const customBase = loadSavedBaseUrls()[activeProvider]?.trim();
          const regResult = await verifyAndRegisterModels(activeProvider, activeKey, customBase);
          if (regResult.ok && regResult.models.length > 0) {
            candidateModels = [...candidateModels, ...regResult.models];
          }
        } catch {}
      }
    }

    const visionCandidates = hasImage
      ? candidateModels.filter(isVisionCapableModel)
      : candidateModels;

    if (visionCandidates.length === 0) {
      if (isGiliFreeEnabled()) {
        const giliFreeModel = getGiliFreeModel();
        return {
          modelToUse: giliFreeModel,
          providerToUse: giliFreeModel.provider,
          keyToUse: "",
        };
      }
      const staticPool = AI_MODELS.filter(
        (m) => m.provider === activeProvider && (!hasImage || isVisionCapableModel(m))
      );
      candidateModels =
        staticPool.length > 0
          ? staticPool
          : hasImage
            ? AI_MODELS.filter(isVisionCapableModel)
            : AI_MODELS;
    } else {
      candidateModels = visionCandidates;
    }

    const resolved = resolveTierModel(targetTier, candidateModels, routerConfig, hasImage);
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

  const handleSendPrompt = async (
    overridePrompt?: string,
    overrideImage?: { dataUrl: string; title: string; sizeKb: number } | null
  ) => {
    const imgToSend = overrideImage !== undefined ? overrideImage : attachedImage;
    const rawText = (overridePrompt ?? prompt).trim();
    const textToSend =
      rawText || (imgToSend ? t("quick_ai_explain_image_default") : "");
    if ((!textToSend && !imgToSend) || isStreaming || isThinking || isSendingRef.current) return;

    isSendingRef.current = true;
    const myController = new AbortController();
    abortControllerRef.current = myController;

    setSubmittedPrompt(textToSend);
    setSubmittedImage(imgToSend);
    setPrompt("");
    setAttachedImage(null);
    setResponseContent("");
    setErrorMessage(null);
    setExecutedActions([]);
    setIsThinking(true);

    try {
      const resolvedRoute = await resolveAutoModel(textToSend, Boolean(imgToSend));
      if (!isMountedRef.current || myController.signal.aborted) return;

      const isExplicitFree = resolvedRoute.modelToUse.id === "gili-free";
      let useGiliFree = (isExplicitFree || !resolvedRoute.keyToUse) && isGiliFreeEnabled();
      const giliFreeModel = getGiliFreeModel();
      let modelToUse = useGiliFree ? giliFreeModel : resolvedRoute.modelToUse;
      let providerToUse = useGiliFree ? giliFreeModel.provider : resolvedRoute.providerToUse;
      let keyToUse = useGiliFree ? "" : resolvedRoute.keyToUse;

      if (!useGiliFree && modelToUse.id !== "gili-free") {
        const routerCfg = loadRouterConfig();
        const budgetEval = evaluateBudgetPolicy(routerCfg, loadUsageStats());
        if (budgetEval.isExceeded && budgetEval.action === "block") {
          setIsThinking(false);
          setErrorMessage(
            `${t("aichat_usage_limit_reached")} (${formatIdrCostInCurrency(budgetEval.spentIdr)} / ${formatIdrCostInCurrency(budgetEval.limitIdr)})`
          );
          return;
        }
        if (budgetEval.isExceeded && budgetEval.action === "downgrade_to_t0") {
          const t0Spec = routerCfg.tierMapping.T0;
          const canUseModel = (m: AiModelConfig) =>
            !imgToSend || (m.provider !== "deepseek" && isVisionCapableModel(m));
          const t0Models = getRegisteredModels(t0Spec.provider).filter(canUseModel);
          const providerPool = getRegisteredModels(providerToUse).filter(canUseModel);
          const fallbackT0 =
            t0Models.find((m) => m.id === t0Spec.modelId) ||
            t0Models[0] ||
            providerPool[0];
          if (fallbackT0) {
            const t0Key = getEffectiveApiKey(fallbackT0.provider, fallbackT0.id);
            if (t0Key) {
              modelToUse = fallbackT0;
              providerToUse = fallbackT0.provider;
              keyToUse = t0Key;
            }
          }
        }
      }

      setRoutedModel(modelToUse);
      setRoutedProvider(providerToUse);

      if (!keyToUse && !useGiliFree) {
        setIsThinking(false);
        setErrorMessage(t("quick_ai_no_key_error"));
        return;
      }

      let accumulated = "";

      const userMsg: AiChatMessage = {
        id: `usr-${Date.now()}`,
        role: "user",
        content: textToSend,
        timestamp: Date.now(),
        context: imgToSend
          ? {
              type: "image",
              title: imgToSend.title,
              characterCount: imgToSend.sizeKb,
              previewText: imgToSend.title,
              imageDataUrl: imgToSend.dataUrl,
            }
          : undefined,
      };

      const result = await streamChatCompletion({
        provider: providerToUse,
        apiKey: keyToUse,
        model: modelToUse,
        messages: [userMsg],
        lengthMode: "compact", // Fast, hemat & ringkas
        useGiliFree,
        signal: myController.signal,
        onChunk: (chunk: string) => {
          if (myController?.signal.aborted || !isMountedRef.current) return;
          setIsThinking(false);
          setIsStreaming(true);
          accumulated += chunk;
          setResponseContent(stripActionBlocksForDisplay(accumulated));
        },
      });

      if (myController.signal.aborted || !isMountedRef.current) {
        return;
      }

      recordTokenUsage(modelToUse, result.inputTokens, result.outputTokens);

      setIsStreaming(false);
      setIsThinking(false);

      // Execute embedded Gili notch actions
      const { cleanText, results } = await parseAndExecuteGiliActions(accumulated);
      if (myController.signal.aborted || !isMountedRef.current) {
        return;
      }
      if (results.length > 0) {
        setExecutedActions(results);
        setResponseContent(cleanText);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      if (!isAbortError(err) && !myController?.signal.aborted) {
        const errorText = err instanceof Error ? err.message : String(err);
        setErrorMessage(
          describeGiliFreeError(errorText) || t("quick_ai_failed_error")
        );
      }
    } finally {
      if (abortControllerRef.current === myController) {
        abortControllerRef.current = null;
        isSendingRef.current = false;
        if (isMountedRef.current) {
          setIsThinking(false);
          setIsStreaming(false);
        }
      }
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      isSendingRef.current = false;
      setIsStreaming(false);
      setIsThinking(false);
    }
  };

  const handleResetPrompt = () => {
    handleStopStreaming();
    setSubmittedPrompt(null);
    setSubmittedImage(null);
    setAttachedImage(null);
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
    try {
      sessionStorage.setItem("island_ai_active_view_state", "chat");
    } catch {}

    if (!submittedPrompt) {
      const draftContext: AiMessageContext | undefined = attachedImage
        ? {
            type: "image",
            title: attachedImage.title,
            characterCount: attachedImage.sizeKb,
            previewText: attachedImage.title,
            imageDataUrl: attachedImage.dataUrl,
          }
        : undefined;
      onOpenFullChat(prompt, undefined, undefined, draftContext);
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
          context: submittedImage
            ? {
                type: "image",
                title: submittedImage.title,
                characterCount: submittedImage.sizeKb,
                previewText: submittedImage.title,
                imageDataUrl: submittedImage.dataUrl,
              }
            : undefined,
        },
        {
          id: `ast-${Date.now()}`,
          role: "assistant",
          content: responseContent,
          timestamp: Date.now(),
          tokens: estimateTextTokens(responseContent),
          provider: activeProv,
          modelId: modelId,
          modelName: routedModel?.name,
          notchActions: executedActions.length > 0 ? executedActions : undefined,
          error: errorMessage || undefined,
        },
      ];

      updateConversationMessages(conv.id, msgs);
      setActiveConversationId(conv.id);
      window.dispatchEvent(
        new CustomEvent("gili_ai_conversation_switch", { detail: { conversationId: conv.id } })
      );
      onOpenFullChat(undefined, msgs, conv.id);
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
            title={t("quick_ai_tooltip_auto_saver")}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/12 text-emerald-400 border border-emerald-500/20"
          >
            <Route size={9.5} className="text-emerald-400 shrink-0" />
            <span>{t("quick_ai_badge_auto")}</span>
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
            disabled={isStreaming || isThinking}
            title={t("quick_ai_tooltip_full_chat")}
            onClick={handleOpenInFullChat}
            className="w-6 h-6 rounded-[6px] flex items-center justify-center text-[#a1a1aa] hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ExternalLink size={12.5} strokeWidth={2} />
          </button>

          <button
            type="button"
            title={t("quick_ai_tooltip_close")}
            onClick={onCancel}
            className="w-6 h-6 rounded-[6px] flex items-center justify-center text-[#a1a1aa] hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer active:scale-95"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* 2. Middle Body */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            attachImageFile(file);
            e.target.value = "";
          }
        }}
      />

      {!submittedPrompt ? (
        /* IDLE STATE: Ultra-compact Search Input & Suggestion Chips */
        <div className="my-auto flex flex-col justify-center min-h-0 gap-2">
          {/* Modern Input Bar */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer?.files?.[0];
              if (file) {
                attachImageFile(file);
              }
            }}
            className={`flex items-center w-full h-[36px] rounded-[11px] pl-3 pr-1.5 gap-1.5 transition-all ${
              isLightMode
                ? "bg-black/[0.04] border border-black/10 focus-within:border-black/25 focus-within:bg-black/[0.06]"
                : "bg-white/[0.04] border border-white/10 focus-within:border-white/25 focus-within:bg-white/[0.07]"
            }`}
          >
            {attachedImage && (
              <div className="shrink-0 flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-[7px] bg-blue-500/15 border border-blue-500/30 text-blue-200 max-w-[140px]">
                <img
                  src={attachedImage.dataUrl}
                  alt={attachedImage.title}
                  className="w-4 h-4 rounded-[4px] object-cover shrink-0 border border-white/15"
                />
                <span className="text-[10.5px] font-medium truncate">
                  {attachedImage.title}
                </span>
                <button
                  type="button"
                  title={t("quick_ai_remove_image")}
                  onClick={() => setAttachedImage(null)}
                  className="w-3.5 h-3.5 rounded-full hover:bg-white/15 flex items-center justify-center text-blue-300 hover:text-white cursor-pointer shrink-0"
                >
                  <X size={9} strokeWidth={2.5} />
                </button>
              </div>
            )}

            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onPaste={handleInputPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSendPrompt();
                } else if (e.key === "Backspace" && !prompt && attachedImage) {
                  setAttachedImage(null);
                }
              }}
              placeholder={
                attachedImage
                  ? t("quick_ai_explain_image_default")
                  : t("quick_ai_placeholder")
              }
              className={`w-full bg-transparent text-[13px] focus:outline-none transition-all placeholder:text-zinc-500 font-sans select-text ${
                isLightMode ? "text-[#1d1d1f]" : "text-zinc-100"
              }`}
            />

            <button
              type="button"
              onClick={handlePasteClipboardImage}
              title={t("quick_ai_tooltip_paste_image")}
              className={`w-6 h-6 rounded-[7px] flex items-center justify-center cursor-pointer transition-all active:scale-95 shrink-0 ${
                attachedImage
                  ? "text-blue-400 bg-blue-500/15 hover:bg-blue-500/25"
                  : isLightMode
                  ? "text-zinc-500 hover:text-zinc-800 hover:bg-black/[0.06]"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]"
              }`}
            >
              <ImageIcon size={13.5} strokeWidth={2} />
            </button>

            {(prompt.trim() || attachedImage) && (
              <button
                type="button"
                onClick={() => handleSendPrompt()}
                title={t("aichat_tooltip_send_enter")}
                className="w-6 h-6 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center cursor-pointer transition-all active:scale-95 shadow-sm shrink-0"
              >
                <ArrowUp size={13} strokeWidth={2.4} />
              </button>
            )}
          </div>

          {/* Clean Suggestion Chips Row */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[10.5px]">
            {clipboardImage && !attachedImage && (
              <button
                type="button"
                onClick={handlePasteClipboardImage}
                className="shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] border border-indigo-500/35 bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25 cursor-pointer transition-all active:scale-95 font-medium"
              >
                <img
                  src={clipboardImage.dataUrl}
                  alt="Clipboard"
                  className="w-3.5 h-3.5 rounded-[3px] object-cover shrink-0 border border-white/20"
                />
                <span className="truncate max-w-[140px]">
                  {t("quick_ai_paste_image_chip")}
                </span>
              </button>
            )}

            {clipboardSnippet && (
              <button
                type="button"
                onClick={() => handleSendPrompt(t("quick_ai_summarize_prompt", { text: clipboardSnippet }))}
                className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-[6px] border border-blue-500/30 bg-blue-500/12 text-blue-300 hover:bg-blue-500/22 cursor-pointer transition-all active:scale-95 font-medium"
              >
                <Clipboard size={10} strokeWidth={2} />
                <span className="truncate max-w-[140px]">{t("quick_ai_summarize_clipboard")}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSendPrompt(t("quick_ai_chip_focus_prompt"))}
              className="shrink-0 px-2 py-0.5 rounded-[6px] border border-white/[0.08] hover:border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white cursor-pointer transition-all active:scale-95"
            >
              {t("quick_ai_chip_focus_btn")}
            </button>

            <button
              type="button"
              onClick={() => handleSendPrompt(t("quick_ai_chip_timer_prompt"))}
              className="shrink-0 px-2 py-0.5 rounded-[6px] border border-white/[0.08] hover:border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white cursor-pointer transition-all active:scale-95"
            >
              {t("quick_ai_chip_timer_btn")}
            </button>

            <button
              type="button"
              onClick={() => {
                setPrompt(t("quick_ai_chip_explain_prompt"));
                inputRef.current?.focus();
              }}
              className="shrink-0 px-2 py-0.5 rounded-[6px] border border-white/[0.08] hover:border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white cursor-pointer transition-all active:scale-95"
            >
              {t("quick_ai_chip_explain_btn")}
            </button>
          </div>
        </div>
      ) : (
        /* ANSWER STATE: User Prompt Pill, Live Response & Footer */
        <div className="grow flex flex-col justify-between min-h-0 gap-2 pt-1">
          {/* User question pill */}
          <div className="shrink-0 flex items-center justify-between px-3 py-1.5 rounded-[10px] bg-white/[0.04] border border-white/10 text-[12px] text-zinc-300">
            <div className="flex items-center gap-2 min-w-0">
              {submittedImage && (
                <img
                  src={submittedImage.dataUrl}
                  alt={submittedImage.title}
                  className="w-5 h-5 rounded-[4px] object-cover shrink-0 border border-white/15"
                />
              )}
              <span className="truncate max-w-[380px] font-medium text-zinc-200">
                "{submittedPrompt}"
              </span>
            </div>
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
                <span>{t("quick_ai_thinking")}</span>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-start gap-2 p-2.5 rounded-[12px] bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[12px]">
                <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">{t("quick_ai_failed_title")}</span>
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
                    {routedModel.tier === "Fast" ? t("quick_ai_tier_fast") : routedModel.tier}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {isStreaming || isThinking ? (
                <button
                  type="button"
                  onClick={handleStopStreaming}
                  className="h-6 px-2.5 rounded-full border border-rose-500/30 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                >
                  <Square size={10} strokeWidth={2.5} />
                  <span>{t("aichat_tooltip_stop")}</span>
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
                        <span className="text-emerald-400 font-medium">{t("quick_ai_copied")}</span>
                      </>
                    ) : (
                      <>
                        <Copy size={11} />
                        <span>{t("quick_ai_copy")}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenInFullChat}
                    className="h-6 px-2.5 rounded-full border border-blue-500/30 bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                  >
                    <ExternalLink size={11} />
                    <span>{t("quick_ai_open_full_chat_button")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetPrompt}
                    title={t("quick_ai_new_prompt")}
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
