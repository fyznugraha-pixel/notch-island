
import React, { useState, useRef, useEffect } from "react";
import { readText as tauriReadText } from "@tauri-apps/plugin-clipboard-manager";
import { invoke } from "@tauri-apps/api/core";
import { AiChatHeader } from "./AiChatHeader";
import { AiChatModelDropdown } from "./AiChatModelDropdown";
import { AiChatEmptyView } from "./AiChatEmptyView";
import { AiChatConversationView } from "./AiChatConversationView";
import { AiChatInputBar } from "./AiChatInputBar";
import { AiChatConnectView } from "./AiChatConnectView";
import { AiChatUsageView } from "./AiChatUsageView";
import { AiChatWindowPickerModal } from "./AiChatWindowPickerModal";
import { AiChatHistoryModal } from "./AiChatHistoryModal";
import {
  loadActiveProvider,
  saveActiveProvider,
  loadUsageStats,
  resetUsageStats,
  saveMonthlyLimit,
  recordTokenUsage,
  streamChatCompletion,
  estimateTextTokens,
  getEffectiveApiKey,
  loadSavedBaseUrls,
  loadSavedApiKeys,
  loadSavedModelKeys,
} from "../../../services/aiChatService";
import {
  initCredentials,
} from "../../../services/aiCredentialService";
import {
  loadRouterConfig,
  saveRouterConfig,
  evaluatePromptHeuristics,
  resolveTierModel,
  calculateEstimatedCostIdr,
} from "../../../services/aiRouterService";
import {
  getRegisteredModels,
  loadActiveModel,
  saveActiveModel,
  verifyAndRegisterModels,
} from "../../../services/aiModelRegistry";
import {
  getOrCreateActiveConversation,
  getConversationById,
  createConversation,
  updateConversationMessages,
  setActiveConversationId,
  generateTitleFromPrompt,
  pruneInactiveConversations,
} from "../../../services/aiConversationService";
import {
  parseAndExecuteGiliActions,
  stripActionBlocksForDisplay,
} from "../../../services/aiNotchTools";
import {
  getGiliFreeModel,
  getGiliFreeNotice,
  isGiliFreeEnabled,
  describeGiliFreeError,
} from "../../../services/giliFreeService";
import { t, type Language } from "../../../services/i18n";
import type {
  AiProviderId,
  AiModelConfig,
  AiChatMessage,
  AiMessageContext,
  AiConversation,
  RouterTier,
  ResponseLengthMode,
} from "./AiChatTypes";

interface AiChatPanelProps {
  onPrevTab?: () => void;
  accentColor?: string;
  optLanguage?: Language;
}

export const AiChatPanel: React.FC<AiChatPanelProps> = ({
  onPrevTab,
  accentColor = "#3882F6",
  optLanguage,
}) => {
  void optLanguage;
  const [provider, setProvider] = useState<AiProviderId>(loadActiveProvider);
  const [routerConfig, setRouterConfig] = useState(() => loadRouterConfig());
  const [selectedMode, setSelectedMode] = useState<"auto" | string>(
    () => routerConfig.selectedMode || "auto"
  );
  const [activeModel, setActiveModel] = useState<AiModelConfig>(() => {
    const routerCfg = loadRouterConfig();
    if (routerCfg.selectedMode === "gili-free") {
      return getGiliFreeModel();
    }
    return loadActiveModel(loadActiveProvider());
  });
  const [keysVersion, setKeysVersion] = useState(0);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  useEffect(() => {
    initCredentials()
      .then(() => {
        setKeysVersion((v) => v + 1);
      })
      .catch((err) =>
        console.warn("initCredentials migration warning:", err)
      );
  }, []);

  const activeKey = React.useMemo(
    () => getEffectiveApiKey(provider, activeModel.id),
    [provider, activeModel.id, keysVersion]
  );

  const isFreeMode = React.useMemo(() => {
    if (!isGiliFreeEnabled()) return false;
    if (selectedMode === "gili-free" || activeModel.id === "gili-free") return true;
    const hasProviderKey = Object.values(loadSavedApiKeys()).some(Boolean);
    const hasModelKey = Object.values(loadSavedModelKeys()).some(Boolean);
    return !hasProviderKey && !hasModelKey;
  }, [keysVersion, selectedMode, activeModel.id]);

  const [activeView, setActiveView] = useState<
    "chat" | "connect" | "usage" | "window_picker" | "history"
  >(() => {
    try {
      const saved = sessionStorage.getItem("island_ai_active_view_state");
      if (saved === "connect" || saved === "usage" || saved === "history") {
        return saved as any;
      }
    } catch { }
    const prov = loadActiveProvider();
    const model = loadActiveModel(prov);
    const key = getEffectiveApiKey(prov, model.id);
    if (!key.trim() && isGiliFreeEnabled()) return "chat";
    const hasVerifiedModels = getRegisteredModels(prov).length > 0;
    return key.trim() && hasVerifiedModels ? "chat" : "connect";
  });

  const [usageStats, setUsageStats] = useState(() => loadUsageStats());

  // Conversation persistence across notch open/close
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(() => {
    pruneInactiveConversations();
    const prov = loadActiveProvider();
    const model = loadActiveModel(prov);
    const initialConv = getOrCreateActiveConversation(prov, model.id);
    return initialConv.id;
  });

  const [messages, setMessages] = useState<AiChatMessage[]>(() => {
    const prov = loadActiveProvider();
    const model = loadActiveModel(prov);
    const initialConv = getOrCreateActiveConversation(prov, model.id);
    return initialConv.messages || [];
  });

  const [inputPrompt, setInputPrompt] = useState("");
  const [activeContext, setActiveContext] = useState<AiMessageContext | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingTokens, setStreamingTokens] = useState(0);
  const [sessionTokens, setSessionTokens] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeConvIdRef = useRef(activeConversationId);
  useEffect(() => {
    activeConvIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Save current conversation on unmount (e.g. notch collapsed or tab changed)
  useEffect(() => {
    return () => {
      if (activeConvIdRef.current && messagesRef.current.length > 0) {
        updateConversationMessages(activeConvIdRef.current, messagesRef.current);
      }
    };
  }, []);

  // Listen for conversation switch from Quick AI Chat or external events
  useEffect(() => {
    const handleSwitch = (e: any) => {
      const convId = e.detail?.conversationId;
      if (convId) {
        const found = getConversationById(convId);
        if (found) {
          setActiveConversationId(found.id);
          setActiveConversationIdState(found.id);
          setMessages(found.messages || []);
          setActiveView("chat");
        }
      }
    };
    window.addEventListener("gili_ai_conversation_switch" as any, handleSwitch);
    return () => window.removeEventListener("gili_ai_conversation_switch" as any, handleSwitch);
  }, []);

  React.useEffect(() => {
    try {
      sessionStorage.setItem("island_ai_active_view_state", activeView);
    } catch { }
  }, [activeView]);

  const availableModelsForProvider = React.useMemo(
    () => getRegisteredModels(provider),
    [provider, keysVersion]
  );

  // Auto-sync / pre-warm registered models if key exists but registered list is empty
  useEffect(() => {
    const k = getEffectiveApiKey(provider);
    const reg = getRegisteredModels(provider);
    if (k && reg.length === 0) {
      const customBase = loadSavedBaseUrls()[provider]?.trim();
      verifyAndRegisterModels(provider, k, customBase).then((res) => {
        if (res.ok && res.models.length > 0) {
          setKeysVersion((v) => v + 1);
          setActiveModel((prev) => {
            const exists = res.models.some((m) => m.id === prev.id);
            return exists ? prev : res.models[0];
          });
        }
      }).catch(() => {});
    }
  }, [provider, keysVersion]);

  const handleSelectAuto = () => {
    setSelectedMode("auto");
    const updated = { ...routerConfig, selectedMode: "auto" as const };
    setRouterConfig(updated);
    saveRouterConfig(updated);
    setIsModelDropdownOpen(false);
  };

  const handleSelectModel = (model: AiModelConfig) => {
    setActiveModel(model);
    setSelectedMode(model.id);
    const updated = { ...routerConfig, selectedMode: model.id };
    setRouterConfig(updated);
    saveRouterConfig(updated);
    if (model.id === "gili-free") {
      setProvider("gemini");
    } else {
      saveActiveModel(provider, model.id);
    }
    setIsModelDropdownOpen(false);
  };

  const handleSaveConnect = (
    newProvider: AiProviderId,
    _newKey: string,
    newModel: AiModelConfig
  ) => {
    saveActiveProvider(newProvider);
    saveActiveModel(newProvider, newModel.id);

    setProvider(newProvider);
    setKeysVersion((v) => v + 1);
    setActiveModel(newModel);
    setActiveView("chat");
  };

  const handleNewConversation = () => {
    if (isStreaming && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const newConv = createConversation(provider, activeModel.id);
    setActiveConversationId(newConv.id);
    setActiveConversationIdState(newConv.id);
    setMessages([]);
    setInputPrompt("");
    setActiveContext(null);
    setIsStreaming(false);
  };

  const handleSelectConversationFromHistory = (conv: AiConversation) => {
    if (isStreaming && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
    setActiveConversationId(conv.id);
    setActiveConversationIdState(conv.id);
    setMessages(conv.messages || []);
    setInputPrompt("");
    setActiveContext(null);

    if (conv.providerId && conv.providerId !== provider) {
      setProvider(conv.providerId);
      saveActiveProvider(conv.providerId);
    }
    if (conv.modelId) {
      const models = getRegisteredModels(conv.providerId || provider);
      const targetModel = models.find((m) => m.id === conv.modelId);
      if (targetModel) {
        setActiveModel(targetModel);
        saveActiveModel(conv.providerId || provider, targetModel.id);
      }
    }

    setActiveView("chat");
  };

  const handleAttachClipboard = async () => {
    try {
      // 1. Check if clipboard has an image first (e.g. Snipping tool, copy image)
      try {
        const clipImg = await invoke<any>("read_clipboard_image");
        if (clipImg && clipImg.thumbnail) {
          setActiveContext({
            type: "image",
            title: `Clipboard (Gambar) · ${clipImg.width}x${clipImg.height}`,
            characterCount: Math.round((clipImg.thumbnail.length * 0.75) / 1024),
            previewText: `[Gambar dari clipboard: ${clipImg.width}x${clipImg.height}]`,
            imageDataUrl: clipImg.thumbnail,
          });
          return;
        }
      } catch { }

      // 2. Check if clipboard has text
      let text = "";
      try {
        text = await tauriReadText();
      } catch {
        try {
          text = await invoke<string>("read_clipboard_text");
        } catch { }
      }

      if (text && text.trim()) {
        if (!inputPrompt.trim()) {
          setInputPrompt(text);
        } else {
          setActiveContext({
            type: "clipboard",
            title: `Clipboard · ${text.length} karakter`,
            characterCount: text.length,
            previewText: text.slice(0, 500),
          });
        }
      }
    } catch (err) {
      console.warn("handleAttachClipboard error:", err);
    }
  };

  const handleSelectClipboardPrompt = (text: string) => {
    setInputPrompt(text);
    handleAttachClipboard();
  };

  const handleAttachImageClick = async () => {
    try {
      const paths = await invoke<string[]>("pick_files_dialog");
      if (Array.isArray(paths) && paths.length > 0 && paths[0]) {
        const filePath = paths[0];
        const preview: any = await invoke("get_file_preview", { path: filePath });
        if (preview && preview.thumbnail) {
          const fileName = filePath.split(/[/\\]/).pop() || "Gambar";
          setActiveContext({
            type: "image",
            title: `Gambar · ${fileName}`,
            characterCount: typeof preview.sizeFormatted === "number" ? preview.sizeFormatted : 0,
            previewText: `[Gambar terlampir: ${fileName}]`,
            imageDataUrl: preview.thumbnail,
          });
          return;
        }
      }
    } catch {
      fileInputRef.current?.click();
    }
  };

  const handleAttachImageContext = (
    dataUrl: string,
    fileName = "Gambar",
    fileSize?: number
  ) => {
    setActiveContext({
      type: "image",
      title: `Gambar · ${fileName}`,
      characterCount: fileSize ? Math.round(fileSize / 1024) : 0,
      previewText: `[Gambar terlampir: ${fileName}]`,
      imageDataUrl: dataUrl,
    });
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      handleAttachImageContext(dataUrl, file.name, file.size);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsStreaming(false);
  };

  const handleSendPrompt = async (
    promptToSend?: string,
    overrideTier?: RouterTier,
    overrideLength?: ResponseLengthMode,
    editOptions?: {
      truncatedHistory: AiChatMessage[];
      userMessage: AiChatMessage;
    }
  ) => {
    let prompt = (promptToSend ?? inputPrompt).trim();
    if (!prompt || isStreaming) return;

    // Detect slash commands (/ringkas, /lengkap, /normal)
    let promptLengthOverride: ResponseLengthMode | undefined = overrideLength;
    if (/^\/ringkas(\s+|$)/i.test(prompt)) {
      promptLengthOverride = "compact";
      prompt = prompt.replace(/^\/ringkas\s*/i, "").trim() || "Jawab secara ringkas";
    } else if (/^\/lengkap(\s+|$)/i.test(prompt)) {
      promptLengthOverride = "detailed";
      prompt = prompt.replace(/^\/lengkap\s*/i, "").trim() || "Jawab secara lengkap";
    } else if (/^\/normal(\s+|$)/i.test(prompt)) {
      promptLengthOverride = "normal";
      prompt = prompt.replace(/^\/normal\s*/i, "").trim() || "Jawab secara normal";
    }

    // Determine routing mode
    const isAuto = selectedMode === "auto" || Boolean(overrideTier);

    let targetTier: RouterTier | undefined;
    let targetLengthMode: ResponseLengthMode = routerConfig.defaultLength;
    let modelToUse = activeModel;
    let providerToUse = provider;
    let keyToUse = activeKey;
    let isAutoRouted = false;
    let estCostIdr: number | undefined;

    if (isAuto) {
      // 1. Context inheritance: check last assistant message tier
      const baseHistory = editOptions ? editOptions.truncatedHistory : messages;
      const lastAssistant = [...baseHistory].reverse().find((m) => m.role === "assistant");
      const lastTier = lastAssistant?.tier;

      // 2. Evaluate heuristics with bias upward & vision awareness
      const heuristic = evaluatePromptHeuristics(
        prompt,
        lastTier,
        Boolean(activeContext?.imageDataUrl || editOptions?.userMessage?.context?.imageDataUrl)
      );
      targetTier = overrideTier || heuristic.tier;
      targetLengthMode =
        overrideLength ||
        (heuristic.lengthMode === "auto"
          ? routerConfig.defaultLength
          : heuristic.lengthMode);

      // 3. Resolve tier model: prioritize verified models of the current active provider first
      const currentActiveRegistered = getRegisteredModels(provider);
      let candidateModels: AiModelConfig[] = [];

      if (currentActiveRegistered.length > 0) {
        candidateModels = currentActiveRegistered;
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
          const registered = getRegisteredModels(p);
          if (k && registered.length > 0) {
            candidateModels.push(...registered);
          }
        }
        if (candidateModels.length === 0 && availableModelsForProvider.length > 0) {
          candidateModels.push(...availableModelsForProvider);
        }
      }

      if (candidateModels.length === 0) {
        const k = getEffectiveApiKey(provider);
        const customBase = loadSavedBaseUrls()[provider]?.trim();
        if (k) {
          try {
            const regResult = await verifyAndRegisterModels(provider, k, customBase);
            if (regResult.ok && regResult.models.length > 0) {
              candidateModels = regResult.models;
              setKeysVersion((v) => v + 1);
            }
          } catch {}
        }
      }

      if (candidateModels.length === 0 && isGiliFreeEnabled()) {
        modelToUse = getGiliFreeModel();
        providerToUse = getGiliFreeModel().provider;
        keyToUse = "";
      } else {
        const resolved = resolveTierModel(targetTier, candidateModels, routerConfig);
        if (resolved) {
          modelToUse = resolved.targetModel;
          providerToUse = resolved.targetProvider;
          keyToUse = getEffectiveApiKey(providerToUse, modelToUse.id) || activeKey;
        } else if (candidateModels.length > 0) {
          modelToUse = candidateModels[0];
          providerToUse = candidateModels[0].provider;
          keyToUse = getEffectiveApiKey(providerToUse, modelToUse.id) || activeKey;
        }
      }
      isAutoRouted = true;
      estCostIdr =
        modelToUse.id === "gili-free"
          ? undefined
          : calculateEstimatedCostIdr(
              modelToUse,
              Math.round(prompt.length / 4),
              300
            );
    } else {
      // Manual mode: Gate G10 preservation (never route)
      targetTier = undefined;
      targetLengthMode = routerConfig.defaultLength;
      modelToUse = activeModel;
      providerToUse = provider;
      keyToUse = activeModel.id === "gili-free" ? "" : activeKey;
      isAutoRouted = false;
      estCostIdr = undefined;
    }

    if (promptLengthOverride) {
      targetLengthMode = promptLengthOverride;
    }

    const isExplicitFree =
      selectedMode === "gili-free" ||
      activeModel.id === "gili-free" ||
      modelToUse.id === "gili-free";
    const useGiliFree = isExplicitFree || (!keyToUse && isGiliFreeEnabled());
    if (useGiliFree) {
      modelToUse = getGiliFreeModel();
      providerToUse = getGiliFreeModel().provider;
      keyToUse = "";
      estCostIdr = undefined;
    } else if (!keyToUse) {
      setActiveView("connect");
      return;
    }

    // Ensure we have an active conversation ID
    let currentConvId = activeConversationId;
    if (!currentConvId) {
      const newConv = createConversation(
        providerToUse,
        modelToUse.id,
        generateTitleFromPrompt(prompt)
      );
      currentConvId = newConv.id;
      setActiveConversationId(newConv.id);
      setActiveConversationIdState(newConv.id);
    }

    let userMessage: AiChatMessage;
    let updatedMessages: AiChatMessage[];

    if (editOptions) {
      userMessage = editOptions.userMessage;
      updatedMessages = editOptions.truncatedHistory;
    } else {
      userMessage = {
        id: `usr-${Date.now()}`,
        role: "user",
        content: prompt,
        timestamp: Date.now(),
        context: activeContext || undefined,
      };
      updatedMessages = [...messages, userMessage];
      setInputPrompt("");
      setActiveContext(null);
    }

    setMessages(updatedMessages);
    updateConversationMessages(currentConvId, updatedMessages);

    setIsStreaming(true);
    setStreamingTokens(0);

    const assistantMsgId = `ast-${Date.now()}`;
    const initialAssistantMessage: AiChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      provider: providerToUse,
      modelId: modelToUse.id,
      modelName: modelToUse.name,
      tier: targetTier,
      lengthMode: targetLengthMode,
      isAutoRouted,
      estimatedCostIdr: estCostIdr,
    };

    const messagesWithAssistant = [...updatedMessages, initialAssistantMessage];
    setMessages(messagesWithAssistant);
    updateConversationMessages(currentConvId, messagesWithAssistant);

    abortControllerRef.current = new AbortController();

    try {
      let accumulated = "";
      let accumulatedReasoning = "";
      let isTruncated = false;
      const result = await streamChatCompletion({
        provider: providerToUse,
        apiKey: keyToUse,
        model: modelToUse,
        messages: updatedMessages,
        lengthMode: targetLengthMode,
        historyWindowSize: routerConfig.historyWindowSize,
        useGiliFree,
        signal: abortControllerRef.current.signal,
        onTruncated: () => {
          isTruncated = true;
        },
        onReasoningChunk: (reasoningChunk: string) => {
          accumulatedReasoning += reasoningChunk;
          setStreamingTokens(estimateTextTokens(accumulated + accumulatedReasoning));
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, reasoning: accumulatedReasoning } : msg
            )
          );
        },
        onChunk: (chunk: string) => {
          accumulated += chunk;
          setStreamingTokens(estimateTextTokens(accumulated + accumulatedReasoning));
          const displayContent = stripActionBlocksForDisplay(accumulated);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: displayContent, reasoning: accumulatedReasoning || undefined }
                : msg
            )
          );
        },
      });

      const totalTokens = result.inputTokens + result.outputTokens;
      setSessionTokens((prev) => prev + totalTokens);

      const actualCostIdr =
        modelToUse.id === "gili-free" || useGiliFree
          ? undefined
          : calculateEstimatedCostIdr(modelToUse, result.inputTokens, result.outputTokens);

      // Execute any Gili notch actions embedded by the AI
      const { cleanText, results: executedActions } = await parseAndExecuteGiliActions(accumulated);

      const finalMessages = messagesWithAssistant.map((msg) =>
        msg.id === assistantMsgId
          ? {
            ...msg,
            content: cleanText || accumulated,
            reasoning: accumulatedReasoning || undefined,
            tokens: result.outputTokens,
            provider: providerToUse,
            modelId: modelToUse.id,
            modelName: modelToUse.name,
            tier: targetTier,
            lengthMode: targetLengthMode,
            isAutoRouted,
            estimatedCostIdr: actualCostIdr,
            isTruncated,
            notchActions: executedActions.length > 0 ? executedActions : undefined,
          }
          : msg
      );
      setMessages(finalMessages);
      updateConversationMessages(currentConvId, finalMessages, totalTokens);

      recordTokenUsage(modelToUse, result.inputTokens, result.outputTokens);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        // Aborted intentionally by user
        if (currentConvId) {
          updateConversationMessages(currentConvId, messagesRef.current);
        }
      } else {
        let errorMsg =
          err?.message || "Terjadi kesalahan saat memproses jawaban.";
        if (useGiliFree) {
          errorMsg = describeGiliFreeError(errorMsg);
        }
        // Clean HTTP / JSON errors from proxies (e.g. "HTTP 401: {"error":{"message":"..."}}")
        if (typeof errorMsg === "string" && errorMsg.includes("HTTP ")) {
          try {
            const jsonPart = errorMsg.replace(/^HTTP \d+:\s*/, "").trim();
            const parsed = JSON.parse(jsonPart);
            if (parsed?.error?.message) {
              errorMsg = parsed.error.message;
            } else if (parsed?.message) {
              errorMsg = parsed.message;
            }
          } catch {}
        }
        const errorMessages = messagesWithAssistant.map((msg) =>
          msg.id === assistantMsgId
            ? {
              ...msg,
              error: errorMsg,
              provider: providerToUse,
              modelId: modelToUse.id,
              modelName: modelToUse.name,
              tier: targetTier,
              lengthMode: targetLengthMode,
              isAutoRouted,
              estimatedCostIdr: estCostIdr,
            }
            : msg
        );
        setMessages(errorMessages);
        if (currentConvId) {
          updateConversationMessages(currentConvId, errorMessages);
        }
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleEscalateMessage = (msg: AiChatMessage) => {
    if (isStreaming) return;
    const msgIdx = messages.findIndex((m) => m.id === msg.id);
    if (msgIdx <= 0) return;
    const userMsg = messages[msgIdx - 1];
    if (!userMsg || userMsg.role !== "user") return;

    let nextTier: RouterTier = "T2";
    if (msg.tier === "T0") {
      nextTier = "T1";
    } else if (msg.tier === "T1") {
      nextTier = "T2";
    }

    handleSendPrompt(userMsg.content, nextTier, "detailed");
  };

  const handleContinueMessage = (msg: AiChatMessage) => {
    if (isStreaming) return;
    handleSendPrompt(
      t("aichat_continue_prompt"),
      msg.tier,
      msg.lengthMode || "detailed"
    );
  };

  const handleRetryLast = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      setMessages((prev) => prev.filter((m) => !m.error));
      handleSendPrompt(lastUserMsg.content);
    }
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    if (isStreaming || !newContent.trim()) return;
    const targetIdx = messages.findIndex((m) => m.id === messageId);
    if (targetIdx === -1) return;

    const oldMsg = messages[targetIdx];
    const historyBefore = messages.slice(0, targetIdx);
    const updatedUserMsg: AiChatMessage = {
      ...oldMsg,
      content: newContent.trim(),
      timestamp: Date.now(),
    };
    const truncatedHistory = [...historyBefore, updatedUserMsg];

    handleSendPrompt(newContent.trim(), undefined, undefined, {
      truncatedHistory,
      userMessage: updatedUserMsg,
    });
  };

  return (
    <div className="relative w-full h-full flex flex-col justify-between px-6 pt-1 pb-3 overflow-hidden select-none text-white">
      {/* Background ambient radial glow */}
      <div
        aria-hidden="true"
        style={{
          background: `radial-gradient(80% 55% at 50% 38%, rgba(56,130,246,0.16), rgba(0,0,0,0) 70%)`,
        }}
        className="absolute inset-0 z-0 pointer-events-none rounded-b-[32px]"
      />

      {/* Subviews */}
      {activeView === "connect" && (
        <AiChatConnectView
          initialProvider={provider}
          initialKey={activeKey}
          initialModel={activeModel}
          onBack={() => {
            if (activeKey || isGiliFreeEnabled()) {
              setActiveView("chat");
            } else if (onPrevTab) {
              onPrevTab();
            } else {
              setActiveView("chat");
            }
          }}
          onSave={handleSaveConnect}
          accentColor={accentColor}
        />
      )}

      {activeView === "usage" && (
        <AiChatUsageView
          stats={usageStats}
          onBack={() => setActiveView("chat")}
          onReset={() => setUsageStats(resetUsageStats())}
          onUpdateLimit={(limit) => setUsageStats(saveMonthlyLimit(limit))}
          accentColor={accentColor}
        />
      )}

      {activeView === "history" && (
        <AiChatHistoryModal
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversationFromHistory}
          onNewConversation={() => {
            handleNewConversation();
            setActiveView("chat");
          }}
          onBack={() => setActiveView("chat")}
          accentColor={accentColor}
        />
      )}

      {activeView === "window_picker" && (
        <AiChatWindowPickerModal
          onClose={() => setActiveView("chat")}
          onAttachContext={(ctx) => {
            setActiveContext(ctx);
            setActiveView("chat");
          }}
          accentColor={accentColor}
        />
      )}

      {/* Main Chat View */}
      {activeView === "chat" && (
        <>
          {/* Header */}
          <AiChatHeader
            activeModel={activeModel}
            selectedMode={selectedMode}
            isModelDropdownOpen={isModelDropdownOpen}
            onToggleModelDropdown={() =>
              setIsModelDropdownOpen((prev) => !prev)
            }
            onNewConversation={handleNewConversation}
            onOpenHistory={() => setActiveView("history")}
            onOpenSettings={() => setActiveView("connect")}
            onOpenUsage={() => {
              setUsageStats(loadUsageStats());
              setActiveView("usage");
            }}
            onPrevTab={onPrevTab}
            accentColor={accentColor}
          />

          {/* Model Dropdown Menu */}
          {isModelDropdownOpen && (
            <AiChatModelDropdown
              provider={provider}
              models={availableModelsForProvider}
              selectedModelId={
                selectedMode === "auto"
                  ? "auto"
                  : selectedMode === "gili-free" || activeModel.id === "gili-free"
                  ? "gili-free"
                  : activeModel.id
              }
              onSelectModel={handleSelectModel}
              onSelectAuto={handleSelectAuto}
              onClose={() => setIsModelDropdownOpen(false)}
              onOpenConnect={() => setActiveView("connect")}
              accentColor={accentColor}
            />
          )}

          {/* Hidden File Input for Image Attachment */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleImageFileChange}
            className="hidden"
            aria-hidden="true"
          />

          {/* Body: Empty State vs Conversation */}
          <div data-no-swipe="true" className="relative grow min-h-0 flex flex-col select-text">
            {messages.length === 0 ? (
              <AiChatEmptyView
                onSelectPrompt={(text) => {
                  setInputPrompt(text);
                }}
                onSelectClipboardPrompt={handleSelectClipboardPrompt}
                accentColor={accentColor}
                freeModeNotice={isFreeMode ? getGiliFreeNotice() : undefined}
              />
            ) : (
              <AiChatConversationView
                messages={messages}
                isStreaming={isStreaming}
                streamingTokens={streamingTokens}
                activeProvider={provider}
                activeModel={activeModel}
                onRetryLast={handleRetryLast}
                onOpenSettings={() => setActiveView("connect")}
                onEscalateMessage={handleEscalateMessage}
                onContinueMessage={handleContinueMessage}
                onEditMessage={handleEditMessage}
                onPopulateInput={(text) => {
                  setInputPrompt(text);
                }}
                onSwitchToFree={() => {
                  handleSelectModel(getGiliFreeModel());
                  setTimeout(() => handleRetryLast(), 50);
                }}
                accentColor={accentColor}
              />
            )}
          </div>

          {/* Context Preview Banner before sending */}
          {activeContext && (
            <div className="flex items-center gap-2.5 h-8 px-3 rounded-[14px] bg-white/[0.08] border border-blue-500/40 text-[12px] text-white shrink-0 mb-1 animate-in fade-in">
              {activeContext.imageDataUrl ? (
                <img
                  src={activeContext.imageDataUrl}
                  alt="Thumbnail lampiran"
                  className="w-5 h-5 rounded object-cover shrink-0"
                />
              ) : null}
              <span className="truncate grow font-medium">
                {activeContext.title}
              </span>
              <button
                type="button"
                onClick={() => setActiveContext(null)}
                className="text-[#a1a1aa] hover:text-white cursor-pointer"
              >
                Lepas
              </button>
            </div>
          )}

          {/* Floating Input Bar */}
          <AiChatInputBar
            inputPrompt={inputPrompt}
            onChangePrompt={setInputPrompt}
            onSend={() => handleSendPrompt()}
            onStopStreaming={handleStopStreaming}
            isStreaming={isStreaming}
            onAttachImage={handleAttachImageClick}
            onAttachImageContext={handleAttachImageContext}
            onReadWindow={() => setActiveView("window_picker")}
            onAttachClipboard={handleAttachClipboard}
            sessionTokens={sessionTokens}
            placeholder={
              messages.length === 0 ? "Tanya apa saja..." : "Balas..."
            }
            hasActiveContext={Boolean(activeContext)}
            accentColor={accentColor}
            responseLength={routerConfig.defaultLength}
            onChangeResponseLength={(mode) => {
              const updated = { ...routerConfig, defaultLength: mode };
              setRouterConfig(updated);
              saveRouterConfig(updated);
            }}
          />
        </>
      )}
    </div>
  );
};

export default AiChatPanel;
