import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Route, X } from "lucide-react";
import { AiBrandLogo, detectAiBrand } from "./AiBrandLogos";
import { ScrollingText } from "../ScrollingText";
import { getLanguage, t } from "../../../services/i18n";
import { getGiliFreeModel, isGiliFreeEnabled } from "../../../services/giliFreeService";
import { getRegisteredModels, registerCustomModel } from "../../../services/aiModelRegistry";
import type { AiModelConfig, AiProviderId } from "./AiChatTypes";

interface AiChatModelDropdownProps {
  provider: AiProviderId;
  models: AiModelConfig[];
  selectedModelId: string;
  onSelectModel: (model: AiModelConfig) => void;
  onSelectAuto?: () => void;
  onClose: () => void;
  onOpenConnect?: () => void;
  accentColor?: string;
  isLightMode?: boolean;
}

function getDisplayLogoProvider(model: AiModelConfig): string {
  return detectAiBrand(`${model.id} ${model.name}`, model.provider);
}

export const AiChatModelDropdown: React.FC<AiChatModelDropdownProps> = ({
  provider,
  models,
  selectedModelId,
  onSelectModel,
  onSelectAuto,
  onClose,
  onOpenConnect,
  accentColor = "#3882F6",
  isLightMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [customModelId, setCustomModelId] = useState("");
  const [registeredSnapshot, setRegisteredSnapshot] = useState<AiModelConfig[]>(() =>
    getRegisteredModels(provider)
  );
  const [domLightMode, setDomLightMode] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("light")
  );
  const activeLight = isLightMode ?? domLightMode;
  const isEn = getLanguage() === "en";

  useEffect(() => {
    setRegisteredSnapshot(getRegisteredModels(provider));
  }, [provider, models]);

  useEffect(() => {
    if (isCustomOpen) {
      customInputRef.current?.focus();
    }
  }, [isCustomOpen]);

  const displayModels = useMemo(() => {
    if (models.length === 0 && registeredSnapshot.length === 0) return [];
    const byId = new Map<string, AiModelConfig>();
    for (const m of models) {
      byId.set(m.id.toLowerCase(), m);
    }
    for (const m of registeredSnapshot) {
      if (!byId.has(m.id.toLowerCase())) {
        byId.set(m.id.toLowerCase(), m);
      }
    }
    return [...byId.values()];
  }, [models, registeredSnapshot]);

  const handleApplyCustomModel = () => {
    const trimmed = customModelId.trim();
    if (!trimmed) return;
    const newModel = registerCustomModel(provider, trimmed);
    setRegisteredSnapshot(getRegisteredModels(provider));
    setCustomModelId("");
    setIsCustomOpen(false);
    onSelectModel(newModel);
    onClose();
  };

  useEffect(() => {
    if (typeof isLightMode === "boolean" || typeof document === "undefined") return;
    const syncLight = () => {
      setDomLightMode(document.documentElement.classList.contains("light"));
    };
    syncLight();
    const observer = new MutationObserver(syncLight);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [isLightMode]);

  // Close on outside click
  useEffect(() => {
    const handleDown = (e: MouseEvent | PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-dropdown-trigger="ai-model-selector"]')) {
        return;
      }
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("pointerdown", handleDown);
    return () => window.removeEventListener("pointerdown", handleDown);
  }, [onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (isCustomOpen) {
          setIsCustomOpen(false);
          setCustomModelId("");
        } else {
          onClose();
        }
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (document.activeElement?.tagName === "INPUT") return;
        e.preventDefault();
        const selectableItems: { id: string; select: () => void }[] = [
          {
            id: "auto",
            select: () => {
              if (onSelectAuto) {
                onSelectAuto();
              } else {
                onSelectModel({
                  id: "auto",
                  name: t("aichat_auto_mode_badge"),
                  provider,
                  tier: "Fast",
                  description: t("aichat_auto_desc"),
                  inputCostPer1M: 0,
                  outputCostPer1M: 0,
                });
              }
            },
          },
          ...(isGiliFreeEnabled()
            ? [{ id: "gili-free", select: () => onSelectModel(getGiliFreeModel()) }]
            : []),
          ...displayModels.map((m) => ({ id: m.id, select: () => onSelectModel(m) })),
        ];
        const currentIndex = selectableItems.findIndex((item) => item.id === selectedModelId);
        const nextIndex =
          e.key === "ArrowDown"
            ? (currentIndex + 1) % selectableItems.length
            : (currentIndex - 1 + selectableItems.length) % selectableItems.length;
        selectableItems[nextIndex]?.select();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [displayModels, selectedModelId, onSelectModel, onSelectAuto, onClose, provider, isCustomOpen]);

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label={t("aichat_aria_select_model")}
      className={`absolute left-6 top-[48px] w-[385px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-80px)] overflow-y-auto z-50 p-2 rounded-[22px] border backdrop-blur-2xl flex flex-col gap-1 select-none animate-in fade-in zoom-in-95 duration-150 ${
        activeLight
          ? "border-black/[0.12] bg-white/95 shadow-[0_20px_50px_rgba(0,0,0,0.16)]"
          : "border-white/[0.14] bg-[#101015]/98 shadow-[0_24px_60px_rgba(0,0,0,0.85)]"
      }`}
    >
      <div className="flex items-center justify-between px-2.5 pt-1 pb-1">
        <span className={`text-[11px] font-semibold tracking-[0.06em] ${activeLight ? "text-neutral-600" : "text-[#a1a1aa]"}`}>
          {t("aichat_dropdown_title")}
        </span>
        <span className={`text-[10.5px] font-medium flex items-center gap-1 ${activeLight ? "text-emerald-700" : "text-emerald-400"}`}>
          <Check size={11} strokeWidth={2.5} />
          {displayModels.length > 0
            ? t("aichat_verified_badge")
            : isGiliFreeEnabled()
            ? t("aichat_tier_free")
            : t("aichat_verified_badge")}
        </span>
      </div>

      <div
        data-scrollable="true"
        className="flex flex-col gap-1 max-h-[220px] overflow-y-auto settings-scroll pr-0.5"
      >
        {/* Entri Mode Auto (BYOK Protocol A1) */}
        <button
          type="button"
          role="option"
          aria-selected={selectedModelId === "auto"}
          onClick={() => {
            if (onSelectAuto) {
              onSelectAuto();
            } else {
              onSelectModel({
                id: "auto",
                name: t("aichat_auto_mode_badge"),
                provider,
                tier: "Fast",
                description: t("aichat_auto_desc"),
                inputCostPer1M: 0,
                outputCostPer1M: 0,
              });
            }
            onClose();
          }}
          style={{
            backgroundColor: selectedModelId === "auto" ? (activeLight ? "rgba(56,130,246,0.14)" : "rgba(56,130,246,0.22)") : "transparent",
            borderColor: selectedModelId === "auto" ? accentColor : "transparent",
          }}
          className={`w-full flex items-center gap-2.5 h-14 px-2.5 rounded-[16px] border text-left cursor-pointer transition-all ${
            activeLight ? "hover:bg-black/[0.05]" : "hover:bg-white/[0.06]"
          }`}
        >
          <span className="w-7 h-7 rounded-[9px] bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shrink-0 shadow-sm !text-white">
            <Route size={15} />
          </span>
          <div className="grow min-w-0 pr-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-[13px] font-semibold truncate shrink min-w-0 ${activeLight ? "text-[#1d1d1f]" : "text-white"}`}>
                {t("aichat_auto_mode_badge")}
              </span>
              <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap ${
                activeLight ? "bg-blue-500/15 text-blue-700" : "bg-blue-500/25 text-blue-300"
              }`}>
                {t("aichat_default_badge")}
              </span>
            </div>
            <ScrollingText
              text={t("aichat_auto_desc")}
              className={`text-[11px] mt-0.5 ${activeLight ? "text-neutral-600" : "text-[#a1a1aa]"}`}
            />
          </div>
          {selectedModelId === "auto" ? (
            <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
              activeLight ? "bg-[#1d1d1f] !text-white" : "bg-[#f4f4f5] text-black"
            }`}>
              <Check size={12} strokeWidth={3} />
            </span>
          ) : (
            <span className={`h-5 px-2 rounded-full flex items-center text-[10.5px] font-medium shrink-0 ${
              activeLight ? "bg-black/[0.06] text-neutral-700" : "bg-white/[0.08] text-[#c4c4cc]"
            }`}>
              {t("aichat_adaptive_badge")}
            </span>
          )}
        </button>

        {/* Entri Mode Gratis Gili */}
        {isGiliFreeEnabled() && (
          <button
            type="button"
            role="option"
            aria-selected={selectedModelId === "gili-free"}
            onClick={() => {
              onSelectModel(getGiliFreeModel());
              onClose();
            }}
            style={{
              backgroundColor: selectedModelId === "gili-free" ? (activeLight ? "rgba(16,185,129,0.14)" : "rgba(16,185,129,0.22)") : "transparent",
              borderColor: selectedModelId === "gili-free" ? "#10b981" : "transparent",
            }}
            className={`w-full flex items-center gap-2.5 h-14 px-2.5 rounded-[16px] border text-left cursor-pointer transition-all ${
              activeLight ? "hover:bg-black/[0.05]" : "hover:bg-white/[0.06]"
            }`}
          >
            <AiBrandLogo provider="gemini" size={28} withContainer />
            <div className="grow min-w-0 pr-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`text-[13px] font-semibold truncate shrink min-w-0 ${activeLight ? "text-[#1d1d1f]" : "text-white"}`}>
                  {getGiliFreeModel().name}
                </span>
                <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap ${
                  activeLight ? "bg-emerald-500/15 text-emerald-700" : "bg-emerald-500/25 text-emerald-300"
                }`}>
                  {t("aichat_tier_free")}
                </span>
              </div>
              <ScrollingText
                text={getGiliFreeModel().description || ""}
                className={`text-[11px] mt-0.5 ${activeLight ? "text-neutral-600" : "text-[#a1a1aa]"}`}
              />
            </div>
            {selectedModelId === "gili-free" ? (
              <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
              activeLight ? "bg-[#1d1d1f] !text-white" : "bg-[#f4f4f5] text-black"
            }`}>
                <Check size={12} strokeWidth={3} />
              </span>
            ) : (
              <span className={`h-5 px-2 rounded-full bg-emerald-500/15 flex items-center text-[10.5px] font-medium shrink-0 ${
                activeLight ? "text-emerald-700" : "text-emerald-400"
              }`}>
                {t("aichat_tier_free")}
              </span>
            )}
          </button>
        )}

        {displayModels.map((model) => {
          const isSelected = model.id === selectedModelId;
          return (
            <button
              key={model.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                onSelectModel(model);
                onClose();
              }}
              style={{
                backgroundColor: isSelected ? (activeLight ? "rgba(56,130,246,0.14)" : "rgba(56,130,246,0.22)") : "transparent",
                borderColor: isSelected ? accentColor : "transparent",
              }}
              className={`w-full flex items-center gap-2.5 h-14 px-2.5 rounded-[16px] border text-left cursor-pointer transition-all ${
                activeLight ? "hover:bg-black/[0.05]" : "hover:bg-white/[0.06]"
              }`}
            >
              <AiBrandLogo provider={getDisplayLogoProvider(model)} size={28} withContainer />
              <div className="grow min-w-0 pr-1">
                <div className={`text-[13px] font-semibold truncate shrink min-w-0 ${activeLight ? "text-[#1d1d1f]" : "text-white"}`}>
                  {model.name}
                </div>
                {model.description ? (
                  <ScrollingText
                    text={model.description}
                    className={`text-[11px] mt-0.5 ${activeLight ? "text-neutral-600" : "text-[#a1a1aa]"}`}
                  />
                ) : null}
              </div>
              {isSelected ? (
                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
              activeLight ? "bg-[#1d1d1f] !text-white" : "bg-[#f4f4f5] text-black"
            }`}>
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : (
                <span className={`h-5 px-2 rounded-full flex items-center text-[11px] font-medium shrink-0 ${
                  activeLight ? "bg-black/[0.06] text-neutral-700" : "bg-white/[0.08] text-[#c4c4cc]"
                }`}>
                  {model.tier}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mx-1 mt-1">
        {isCustomOpen ? (
          <div
            className={`flex items-center gap-1.5 p-1 rounded-[12px] border ${
              activeLight
                ? "bg-black/[0.03] border-black/[0.12] focus-within:border-blue-600"
                : "bg-white/[0.04] border-white/[0.12] focus-within:border-blue-500"
            }`}
          >
            <input
              ref={customInputRef}
              type="text"
              value={customModelId}
              onChange={(e) => setCustomModelId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleApplyCustomModel();
                }
              }}
              aria-label={isEn ? "Custom model ID" : "ID model manual"}
              placeholder={
                isEn
                  ? "Custom model ID (e.g. gemini-3.8-flash)"
                  : "ID model manual (mis. gemini-3.8-flash)"
              }
              className={`grow min-w-0 h-7 px-2 bg-transparent border-0 outline-none text-[11.5px] font-mono ${
                activeLight
                  ? "text-[#1d1d1f] placeholder-neutral-500"
                  : "text-white placeholder-[#8f8f99]"
              }`}
            />
            <button
              type="button"
              onClick={handleApplyCustomModel}
              disabled={!customModelId.trim()}
              className="h-7 px-2.5 rounded-[9px] bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-medium shrink-0 cursor-pointer transition-colors"
            >
              {isEn ? "Use" : "Pakai"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCustomOpen(false);
                setCustomModelId("");
              }}
              aria-label={t("action_cancel")}
              className={`w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                activeLight
                  ? "text-neutral-600 hover:bg-black/[0.08]"
                  : "text-[#a1a1aa] hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsCustomOpen(true)}
            className={`w-full h-7.5 px-3 rounded-[12px] text-[11.5px] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              activeLight
                ? "bg-black/[0.04] hover:bg-black/[0.08] text-neutral-700"
                : "bg-white/[0.04] hover:bg-white/[0.08] text-[#d4d4d8]"
            }`}
          >
            <Plus size={12} aria-hidden="true" />
            <span>{isEn ? "Custom model ID..." : "ID model manual..."}</span>
          </button>
        )}
      </div>

      {onOpenConnect && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenConnect();
          }}
          className={`h-7.5 px-3 mx-1 mt-1 rounded-[12px] text-[11.5px] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
            activeLight
              ? "bg-black/[0.04] hover:bg-black/[0.08] text-[#0066cc]"
              : "bg-white/[0.04] hover:bg-white/[0.08] text-[#8db8ff]"
          }`}
        >
          <span>{t("aichat_manage_keys")}</span>
        </button>
      )}

      <div className={`flex items-center justify-center gap-2.5 h-7 mt-0.5 border-t text-[11px] ${
        activeLight ? "border-black/[0.08] text-neutral-600" : "border-white/[0.08] text-[#a1a1aa]"
      }`}>
        <span>{t("aichat_keys_hint")}</span>
      </div>
    </div>
  );
};
