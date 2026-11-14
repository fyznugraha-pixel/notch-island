import React, { useState, useEffect } from "react";
import { readText as tauriReadText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ChevronLeft,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  Lock,
  ExternalLink,
  Save,
  Trash2,
} from "lucide-react";
import { Tooltip } from "../Tooltip";
import { AiBrandLogo } from "./AiBrandLogos";
import { AiChatConnectModelSection } from "./AiChatConnectModelSection";
import { t } from "../../../services/i18n";
import {
  AI_MODELS,
  isApiKeyFormatValid,
  loadSavedApiKeys,
  loadSavedModelKeys,
  loadSavedBaseUrls,
  saveApiKey,
  saveActiveProvider,
  saveModelKey,
  saveBaseUrl,
  removeModelKey,
  maskApiKey,
} from "../../../services/aiChatService";
import {
  initCredentials,
  getSecureApiKey,
  getEffectiveApiKeySync,
} from "../../../services/aiCredentialService";
import {
  getRegisteredModels,
  clearRegisteredModels,
  verifyAndRegisterModels,
} from "../../../services/aiModelRegistry";
import {
  loadRouterConfig,
  saveRouterConfig,
} from "../../../services/aiRouterService";
import type { AiProviderId, AiModelConfig, ResponseLengthMode } from "./AiChatTypes";

interface AiChatConnectViewProps {
  initialProvider: AiProviderId;
  initialKey: string;
  initialModel: AiModelConfig;
  onKeyChanged?: () => void;
  onBack: () => void;
  onSave: (provider: AiProviderId, key: string, model: AiModelConfig) => void;
  accentColor?: string;
}

const GERAIKITA_AFFILIATE_URL = "https://ai.geraikita.com/masuk?ref=CKBCJWMP";

const PROVIDERS: { id: AiProviderId; name: string; docUrl: string }[] = [
  { id: "claude", name: "Claude", docUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", name: "OpenAI", docUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", name: "Gemini", docUrl: "https://aistudio.google.com/app/apikey" },
  { id: "openrouter", name: "OpenRouter", docUrl: "https://openrouter.ai/keys" },
  { id: "deepseek", name: "DeepSeek", docUrl: "https://platform.deepseek.com/api_keys" },
  { id: "grok", name: "Grok", docUrl: "https://console.x.ai/" },
  { id: "custom", name: "Custom / Proxy", docUrl: GERAIKITA_AFFILIATE_URL },
];

function getDraftKey(provider: AiProviderId, modelId?: string): string {
  try {
    const k = modelId
      ? localStorage.getItem(`island_ai_draft_model_key_${modelId}`)
      : localStorage.getItem(`island_ai_draft_key_${provider}`);
    if (k !== null) return k;
  } catch {}
  return "";
}

function setDraftKey(provider: AiProviderId, val: string, modelId?: string): void {
  try {
    if (modelId) {
      if (val) localStorage.setItem(`island_ai_draft_model_key_${modelId}`, val);
      else localStorage.removeItem(`island_ai_draft_model_key_${modelId}`);
    } else {
      if (val) localStorage.setItem(`island_ai_draft_key_${provider}`, val);
      else localStorage.removeItem(`island_ai_draft_key_${provider}`);
    }
  } catch {}
}

function getDraftBaseUrl(provider: AiProviderId): string {
  try {
    const u = localStorage.getItem(`island_ai_draft_base_url_${provider}`);
    if (u !== null) return u;
  } catch {}
  return "";
}

function setDraftBaseUrl(provider: AiProviderId, val: string): void {
  try {
    if (val) localStorage.setItem(`island_ai_draft_base_url_${provider}`, val);
    else localStorage.removeItem(`island_ai_draft_base_url_${provider}`);
  } catch {}
}

export const AiChatConnectView: React.FC<AiChatConnectViewProps> = ({
  initialProvider,
  initialKey,
  initialModel,
  onKeyChanged,
  onBack,
  onSave,
  accentColor = "#3882F6",
}) => {
  const [selectedProvider, setSelectedProvider] = useState<AiProviderId>(initialProvider);
  const [selectedModel, setSelectedModel] = useState<AiModelConfig>(initialModel);
  const [defaultLength, setDefaultLength] = useState<ResponseLengthMode>(
    () => loadRouterConfig().defaultLength || "normal"
  );

  const handleLengthChange = (mode: ResponseLengthMode) => {
    setDefaultLength(mode);
    const cfg = loadRouterConfig();
    saveRouterConfig({ ...cfg, defaultLength: mode });
  };

  const [isModelCustomKey, setIsModelCustomKey] = useState<boolean>(() => {
    const modelKeys = loadSavedModelKeys();
    return Boolean(modelKeys[initialModel.id]);
  });

  const [apiKey, setApiKey] = useState<string>(() => {
    const isCustom = Boolean(loadSavedModelKeys()[initialModel.id]);
    const draft = getDraftKey(initialProvider, isCustom ? initialModel.id : undefined);
    if (draft !== "") return draft;
    if (isCustom) return loadSavedModelKeys()[initialModel.id] || "";
    return getEffectiveApiKeySync(initialProvider) || initialKey || "";
  });

  useEffect(() => {
    let cancelled = false;
    initCredentials().then(() => {
      if (cancelled) return;
      const modelKeys = loadSavedModelKeys();
      const customKey = modelKeys[selectedModel.id];
      if (customKey) {
        setIsModelCustomKey(true);
        setApiKey((prev) => prev || getDraftKey(selectedProvider, selectedModel.id) || customKey);
        return;
      }
      if (!isModelCustomKey) {
        getSecureApiKey(selectedProvider).then((secKey) => {
          if (!cancelled && secKey) {
            setApiKey((prev) => prev || secKey);
          }
        });
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedProvider, selectedModel.id, isModelCustomKey]);

  const [baseUrl, setBaseUrl] = useState<string>(() => {
    const draft = getDraftBaseUrl(initialProvider);
    const saved = loadSavedBaseUrls()[initialProvider] || "";
    return draft !== "" ? draft : saved;
  });

  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "fail" | null>(null);
  const [testFailReason, setTestFailReason] = useState("");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const [availableModels, setAvailableModels] = useState<AiModelConfig[]>(() =>
    getRegisteredModels(initialProvider)
  );
  const isFormatOk = isApiKeyFormatValid(selectedProvider, apiKey);

  // Check what is currently saved in storage for this provider & model
  const savedProviderKey = loadSavedApiKeys()[selectedProvider] || "";
  const savedModelKey = loadSavedModelKeys()[selectedModel.id] || "";
  const activeSavedKey = isModelCustomKey ? savedModelKey : savedProviderKey;

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    setDraftKey(selectedProvider, val, isModelCustomKey ? selectedModel.id : undefined);
    setTestResult(null);
    setSavedNotice(null);
  };

  const handleBaseUrlChange = (val: string) => {
    setBaseUrl(val);
    setDraftBaseUrl(selectedProvider, val);
    setTestResult(null);
  };

  const handleProviderChange = (prov: AiProviderId) => {
    setSelectedProvider(prov);
    const models = getRegisteredModels(prov);
    setAvailableModels(models);
    const defaultModel =
      models[0] || AI_MODELS.find((m) => m.provider === prov) || AI_MODELS[0];
    setSelectedModel(defaultModel);

    const provDraftUrl = getDraftBaseUrl(prov);
    const provSavedUrl = loadSavedBaseUrls()[prov] || "";
    setBaseUrl(provDraftUrl || provSavedUrl);

    // Load saved or draft key for this provider or model
    const modelKeys = loadSavedModelKeys();
    if (modelKeys[defaultModel.id]) {
      setIsModelCustomKey(true);
      const draft = getDraftKey(prov, defaultModel.id);
      setApiKey(draft || modelKeys[defaultModel.id]);
    } else {
      setIsModelCustomKey(false);
      const provDraftKey = getDraftKey(prov);
      const provSavedKey = loadSavedApiKeys()[prov] || "";
      setApiKey(provDraftKey || provSavedKey);
    }
    setTestResult(null);
    setSavedNotice(null);
  };

  const handleModelChange = (model: AiModelConfig) => {
    setSelectedModel(model);

    // If this specific model has a custom key saved or drafted, load it
    const modelKeys = loadSavedModelKeys();
    if (modelKeys[model.id]) {
      setIsModelCustomKey(true);
      const draft = getDraftKey(selectedProvider, model.id);
      setApiKey(draft || modelKeys[model.id]);
    } else if (isModelCustomKey) {
      setApiKey("");
    } else {
      const provDraftKey = getDraftKey(selectedProvider);
      const provSavedKey = loadSavedApiKeys()[selectedProvider] || "";
      setApiKey(provDraftKey || provSavedKey);
    }
    setTestResult(null);
  };

  const handleToggleModelCustomKey = (enabled: boolean) => {
    setIsModelCustomKey(enabled);
    if (enabled) {
      const modelKeys = loadSavedModelKeys();
      const draft = getDraftKey(selectedProvider, selectedModel.id);
      setApiKey(draft || modelKeys[selectedModel.id] || "");
    } else {
      removeModelKey(selectedModel.id);
      setDraftKey(selectedProvider, "", selectedModel.id);
      const provDraftKey = getDraftKey(selectedProvider);
      const provKeys = loadSavedApiKeys();
      setApiKey(provDraftKey || provKeys[selectedProvider] || "");
    }
    setSavedNotice(null);
  };

  const persistKey = (clean: string) => {
    if (isModelCustomKey) {
      saveModelKey(selectedModel.id, clean);
    } else {
      saveApiKey(selectedProvider, clean);
    }
  };

  // Saves the key, sets provider as active, and automatically tests & loads models
  const handleSaveCurrentKey = () => {
    const clean = apiKey.trim();
    if (!clean) return;
    persistKey(clean);
    saveActiveProvider(selectedProvider);
    if (baseUrl.trim()) {
      saveBaseUrl(selectedProvider, baseUrl.trim());
    }
    // Automatically trigger test & register models so user is immediately connected
    handleTestAndSave();
  };

  const handleClearKey = () => {
    if (isModelCustomKey) {
      removeModelKey(selectedModel.id);
      setDraftKey(selectedProvider, "", selectedModel.id);
      setApiKey("");
    } else {
      saveApiKey(selectedProvider, "");
      saveBaseUrl(selectedProvider, "");
      setDraftKey(selectedProvider, "");
      setDraftBaseUrl(selectedProvider, "");
      clearRegisteredModels(selectedProvider);
      setAvailableModels([]);
      setApiKey("");
      setBaseUrl("");
    }
    onKeyChanged?.();
    setTestResult(null);
    setSavedNotice(t("aichat_connect_key_deleted"));
    setTimeout(() => setSavedNotice(null), 2000);
  };

  const handlePaste = async () => {
    try {
      const text = await tauriReadText();
      if (text) {
        handleApiKeyChange(text.trim());
      }
    } catch {}
  };

  const handleTestAndSave = async () => {
    const clean = apiKey.trim();
    if (!clean || isTesting) return;

    if (selectedProvider === "custom" && !baseUrl.trim()) {
      setTestResult("fail");
      setTestFailReason(t("aichat_connect_base_url_required"));
      return;
    }

    const effectiveBaseUrl = baseUrl.trim() || undefined;

    setIsTesting(true);
    setTestResult(null);
    const result = await verifyAndRegisterModels(selectedProvider, clean, effectiveBaseUrl);
    setIsTesting(false);

    if (!result.ok) {
      setTestResult("fail");
      setTestFailReason(result.reason);
      return;
    }

    setTestResult("success");
    setAvailableModels(result.models);
    const modelToUse = result.models.find((m) => m.id === selectedModel.id) || result.models[0];
    setSelectedModel(modelToUse);
    persistKey(clean);
    saveBaseUrl(selectedProvider, baseUrl.trim());
    onSave(selectedProvider, clean, modelToUse);
  };

  const activeProviderMeta = PROVIDERS.find((p) => p.id === selectedProvider) || PROVIDERS[0];

  const handleOpenExternalUrl = async (url: string) => {
    try {
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="grow flex flex-col justify-between w-full h-full select-none pt-2">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          aria-label={t("aichat_tooltip_prev")}
          onClick={onBack}
          className="w-[34px] h-[34px] rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <div className="text-[18px] font-semibold tracking-[-0.02em] text-white grow">
          {t("aichat_connect_title")}
        </div>
        <Tooltip content={t("aichat_connect_promo_desc")} side="bottom">
          <button
            type="button"
            onClick={() => handleOpenExternalUrl(GERAIKITA_AFFILIATE_URL)}
            className="h-[34px] px-3 rounded-[14px] bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 text-white flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-[0_0_16px_rgba(56,130,246,0.22)] shrink-0"
          >
            <span
              style={{ background: accentColor, color: "#04101f" }}
              className="w-5 h-5 rounded-[7px] flex items-center justify-center shrink-0"
            >
              <KeyRound size={12} strokeWidth={2.4} />
            </span>
            <span className="text-[12px] font-semibold text-white whitespace-nowrap">
              {t("aichat_connect_promo_header_btn")}
            </span>
            <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30 leading-none shrink-0">
              {t("aichat_connect_promo_badge")}
            </span>
            <ExternalLink size={12} strokeWidth={2.2} className="text-blue-300 shrink-0" />
          </button>
        </Tooltip>
      </div>

      {/* Main Two Columns */}
      <div className="flex gap-4 mt-2 grow min-h-0 overflow-hidden">
        {/* Left: Providers List */}
        <div className="w-[210px] shrink-0 flex flex-col gap-1.5 min-h-0">
          <span className="text-[11px] font-semibold tracking-[0.06em] text-[#a1a1aa] pl-1 shrink-0">
            {t("aichat_connect_provider_header")}
          </span>
          <div
            role="radiogroup"
            data-scrollable="true"
            className="flex-1 min-h-0 max-h-[220px] overflow-y-auto settings-scroll flex flex-col gap-1 pr-1.5"
          >
            {PROVIDERS.map((prov) => {
              const isSelected = prov.id === selectedProvider;
              const hasSavedKey = Boolean(loadSavedApiKeys()[prov.id]);
              return (
                <button
                  key={prov.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleProviderChange(prov.id)}
                  style={
                    isSelected
                      ? {
                          backgroundColor: "rgba(56,130,246,0.25)",
                          borderColor: "rgba(56,130,246,0.45)",
                        }
                      : undefined
                  }
                  className={`w-full flex items-center gap-2.5 h-9 px-3 rounded-[14px] border text-left cursor-pointer transition-all active:scale-[0.98] shrink-0 ${
                    isSelected
                      ? ""
                      : "bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.07]"
                  }`}
                >
                  <AiBrandLogo provider={prov.id} size={22} withContainer />
                  <span className={`grow text-[13px] ${isSelected ? "font-semibold text-white" : "font-medium text-[#d4d4d8]"}`}>
                    {prov.name}
                  </span>
                  {hasSavedKey && !isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1" />
                  )}
                  {isSelected ? (
                    <span className="w-[18px] h-[18px] rounded-full bg-[#f4f4f5] text-black flex items-center justify-center shrink-0">
                      <Check size={11} strokeWidth={3.4} />
                    </span>
                  ) : (
                    <span className="w-[18px] h-[18px] rounded-full border-[1.5px] border-[#7a7a86] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: API Key & Model Configuration */}
        <div
          data-scrollable="true"
          className="grow min-w-0 min-h-0 flex flex-col gap-1.5 overflow-y-auto settings-scroll pr-1.5 pb-2"
        >
          <div className="flex items-center justify-between pl-1 shrink-0">
            <span className="text-[11px] font-semibold tracking-[0.06em] text-[#a1a1aa]">
              {isModelCustomKey
                ? t("aichat_connect_custom_key_for", { model: selectedModel.name })
                : t("aichat_connect_key_for", { provider: activeProviderMeta.name })}
            </span>
            {activeSavedKey && (
              <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                <Check size={11} strokeWidth={2.5} />
                {t("aichat_connect_saved_badge")}
              </span>
            )}
          </div>

          {/* Input Box with Eye, Paste, and Save Buttons */}
          <div className="flex items-center h-10 pl-3 pr-1 rounded-[14px] bg-white/[0.06] border border-blue-500/50 shadow-[0_0_20px_rgba(56,130,246,0.16)] shrink-0">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder={
                selectedProvider === "custom"
                  ? t("aichat_connect_proxy_placeholder")
                  : t("aichat_connect_key_placeholder", { name: activeProviderMeta.name })
              }
              className="grow min-w-0 bg-transparent border-0 outline-none text-white text-[12.5px] font-mono placeholder-[#a1a1aa]"
            />
            <div className="flex items-center gap-1.5 shrink-0 ml-auto pr-1.5">
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? t("aichat_connect_toggle_hide") : t("aichat_connect_toggle_show")}
                title={showKey ? t("aichat_connect_toggle_hide") : t("aichat_connect_toggle_show")}
                className="w-7 h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-[#e4e4e7] flex items-center justify-center p-0 shrink-0 cursor-pointer transition-all active:scale-95"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                type="button"
                onClick={handlePaste}
                title={t("aichat_connect_paste_tooltip")}
                className="h-7 px-2.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-[#e4e4e7] text-[12px] font-medium shrink-0 flex items-center justify-center cursor-pointer transition-all active:scale-95"
              >
                {t("aichat_connect_paste_btn")}
              </button>
            </div>
            <button
              type="button"
              onClick={handleSaveCurrentKey}
              disabled={!apiKey.trim()}
              title={t("aichat_connect_save_tooltip")}
              aria-label={t("aichat_connect_save_key")}
              className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-default text-white flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95 shadow-sm"
            >
              <Save size={14} strokeWidth={2.4} />
            </button>
          </div>

          {/* Status line & saved preview */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap shrink-0">
            {savedNotice ? (
              <div className="inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full bg-blue-500/20 text-blue-300 text-[11px] font-medium animate-in fade-in">
                <Check size={11} strokeWidth={2.8} />
                {savedNotice}
              </div>
            ) : isFormatOk ? (
              <div className="inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full bg-teal-500/15 text-teal-300 text-[11px] font-medium">
                <Check size={11} strokeWidth={2.8} />
                {t("aichat_connect_format_valid")}
              </div>
            ) : null}

            {activeSavedKey && (
              <div className="inline-flex items-center gap-2 text-[11px] text-[#a1a1aa] ml-auto">
                <span>{maskApiKey(activeSavedKey)}</span>
                <button
                  type="button"
                  onClick={handleClearKey}
                  title={t("aichat_connect_remove_key")}
                  className="text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash2 size={11} />
                  {t("action_delete")}
                </button>
              </div>
            )}

            {testResult === "success" && (
              <div className="inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-medium">
                <Check size={11} strokeWidth={2.8} />
                {t("aichat_connect_verified_success_short")}
              </div>
            )}
            {testResult === "fail" && (
              <div className="inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full bg-rose-500/15 text-rose-300 text-[11px] font-medium">
                {testFailReason || t("aichat_connect_verify_failed_short")}
              </div>
            )}
          </div>

          {/* Base URL (User enters proxy / custom endpoint) */}
          <div className="flex flex-col gap-1 mt-0.5 shrink-0">
            <div className="flex items-center justify-between pl-1">
              <span className="text-[11px] font-semibold tracking-[0.06em] text-[#a1a1aa]">
                {selectedProvider === "custom"
                  ? t("aichat_connect_base_url_required")
                  : t("aichat_connect_base_url_optional")}
              </span>
              {baseUrl.trim() && (
                <button
                  type="button"
                  onClick={() => handleBaseUrlChange("")}
                  className="text-[10px] text-[#71717a] hover:text-white cursor-pointer transition-colors"
                >
                  {t("aichat_connect_clear_base_url")}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 h-8.5 px-3 rounded-[14px] bg-white/[0.04] border border-white/[0.08] focus-within:border-blue-500/50 transition-colors">
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => handleBaseUrlChange(e.target.value)}
                placeholder={
                  selectedProvider === "custom"
                    ? "Misal: https://ai.geraikita.com/v1 atau http://localhost:11434/v1"
                    : "Misal: https://api.example.com/v1 (kosongkan untuk default resmi)"
                }
                className="grow min-w-0 bg-transparent border-0 outline-none text-white text-[12px] font-mono placeholder-[#52525b]"
              />
            </div>
            {selectedProvider === "custom" && (
              <span className="text-[10.5px] text-[#71717a] pl-1 leading-normal">
                {t("aichat_connect_custom_proxy_hint")}
              </span>
            )}
          </div>

          {/* Default Response Length Setting (Protocol A4) */}
          <div className="flex flex-col gap-1 mt-0.5 shrink-0">
            <span className="text-[11px] font-semibold tracking-[0.06em] text-[#a1a1aa] pl-1">
              {t("aichat_connect_response_length_header")}
            </span>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-[14px] bg-white/[0.04] border border-white/[0.08]">
              {(
                [
                  { id: "compact", label: t("aichat_mode_compact"), sub: t("aichat_mode_compact_sub") },
                  { id: "normal", label: t("aichat_mode_normal"), sub: t("aichat_mode_normal_sub") },
                  { id: "detailed", label: t("aichat_mode_detailed"), sub: t("aichat_mode_detailed_sub") },
                ] as const
              ).map((mode) => {
                const isSelected = defaultLength === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => handleLengthChange(mode.id)}
                    className={`flex flex-col items-center justify-center py-1 px-2 rounded-[10px] text-center transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-600/30 border border-blue-500/50 text-white shadow-sm"
                        : "bg-transparent hover:bg-white/[0.05] text-[#a1a1aa] border border-transparent"
                    }`}
                  >
                    <span className="text-[11.5px] font-semibold">{mode.label}</span>
                    <span className="text-[9.5px] text-[#71717a] truncate max-w-full">
                      {mode.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 flex flex-col gap-1 mt-0.5">
            <AiChatConnectModelSection
              models={availableModels}
              selectedModel={selectedModel}
              onSelectModel={handleModelChange}
              isModelCustomKey={isModelCustomKey}
              onToggleModelCustomKey={handleToggleModelCustomKey}
              isVerifying={isTesting}
            />
          </div>

          {/* External Docs Link */}
          <button
            type="button"
            onClick={() => handleOpenExternalUrl(activeProviderMeta.docUrl || GERAIKITA_AFFILIATE_URL)}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#8db8ff] hover:underline pl-1 mt-1 mb-1 shrink-0 w-fit cursor-pointer bg-transparent border-0 p-0 text-left"
          >
            {t("aichat_connect_how_to_get", { provider: activeProviderMeta.name })}
            <ExternalLink size={12} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Bottom Privacy Reassurance & Save Action */}
      <div className="flex items-center gap-3 h-[50px] px-3.5 rounded-[26px] border border-white/[0.08] bg-[#121216]/95 backdrop-blur-md mt-2 shrink-0">
        <div className="w-7 h-7 rounded-full bg-white/[0.08] text-[#c4c4cc] flex items-center justify-center shrink-0">
          <Lock size={14} strokeWidth={2} />
        </div>
        <div className="grow text-[12px] text-[#a1a1aa] leading-tight">
          {t("aichat_connect_encryption_desc")}
        </div>
        <button
          type="button"
          onClick={handleTestAndSave}
          disabled={isTesting || !apiKey.trim()}
          style={{ background: accentColor }}
          className="h-9 px-4 rounded-full text-black text-[13px] font-semibold flex items-center gap-2 cursor-pointer active:scale-95 shadow-md shrink-0 transition-transform"
        >
          {isTesting ? t("aichat_connect_verifying") : t("aichat_connect_test_and_save")}
          <span className="text-[11px] font-medium border border-black/35 rounded-md px-1.5">
            Enter
          </span>
        </button>
      </div>
    </div>
  );
};
