import React, { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { AiBrandLogo, detectAiBrand } from "./AiBrandLogos";
import { t } from "../../../services/i18n";
import type { AiModelConfig } from "./AiChatTypes";

interface AiChatConnectModelSectionProps {
  models: AiModelConfig[];
  selectedModel: AiModelConfig;
  onSelectModel: (model: AiModelConfig) => void;
  isModelCustomKey: boolean;
  onToggleModelCustomKey: (enabled: boolean) => void;
  isVerifying: boolean;
}

export const AiChatConnectModelSection: React.FC<AiChatConnectModelSectionProps> = ({
  models,
  selectedModel,
  onSelectModel,
  isModelCustomKey,
  onToggleModelCustomKey,
  isVerifying,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasModels = models.length > 0;

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleDown = (e: MouseEvent | PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", handleDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handleDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [isMenuOpen]);

  const handleToggleMenu = () => {
    if (!isMenuOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setOpenUpward(rect.top >= 170);
    }
    setIsMenuOpen((prev) => !prev);
  };

  const handlePick = (model: AiModelConfig) => {
    setIsMenuOpen(false);
    onSelectModel(model);
  };

  return (
    <>
      <div className="flex items-center justify-between pl-1 mt-1">
        <span className="text-[11px] font-semibold tracking-[0.06em] text-[#a1a1aa]">{t("aichat_connect_model_header")}</span>
        {hasModels && (
          <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <Check size={11} strokeWidth={2.5} />
            {t("aichat_connect_models_available", { count: models.length })}
          </span>
        )}
      </div>

      {!hasModels ? (
        <div className="h-9.5 px-3.5 rounded-[13px] border border-dashed border-white/12 flex items-center gap-2 text-[12px] text-[#a1a1aa]">
          {isVerifying ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              {t("aichat_connect_loading_models")}
            </>
          ) : (
            t("aichat_connect_models_hint")
          )}
        </div>
      ) : (
        <>
          <div ref={containerRef} className="relative">
            <button
              type="button"
              data-dropdown-trigger="ai-connect-model-selector"
              onClick={handleToggleMenu}
              className="w-full h-9.5 px-3 rounded-[13px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center gap-2 text-left cursor-pointer transition-all"
            >
              <AiBrandLogo
                provider={detectAiBrand(`${selectedModel.id} ${selectedModel.name}`, selectedModel.provider)}
                size={20}
                withContainer
              />
              <span className="grow text-[12.5px] font-medium text-white truncate">
                {selectedModel.name}
              </span>
              <span className="h-5 px-2 rounded-full bg-white/[0.08] flex items-center text-[10.5px] text-[#c4c4cc]">
                {selectedModel.tier}
              </span>
              <ChevronDown
                size={14}
                className={`text-[#a1a1aa] transition-transform duration-200 ${
                  isMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isMenuOpen && (
              <div
                data-scrollable="true"
                data-no-swipe="true"
                className={`absolute left-0 right-0 z-30 p-1.5 rounded-[16px] bg-[#101015] border border-white/14 shadow-2xl flex flex-col gap-1 max-h-44 overflow-y-auto settings-scroll ${
                  openUpward ? "bottom-full mb-1.5" : "top-full mt-1.5"
                }`}
              >
                {models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handlePick(model)}
                    className={`h-8.5 px-2.5 rounded-[12px] text-left text-[12px] flex items-center gap-2 shrink-0 cursor-pointer transition-colors ${
                      model.id === selectedModel.id
                        ? "bg-blue-600/30 text-white font-semibold"
                        : "hover:bg-white/[0.06] text-[#d4d4d8]"
                    }`}
                  >
                    <AiBrandLogo
                      provider={detectAiBrand(`${model.id} ${model.name}`, model.provider)}
                      size={18}
                      withContainer
                    />
                    <span className="truncate grow">{model.name}</span>
                    <span className="text-[10px] text-[#a1a1aa] shrink-0 ml-1">{model.tier}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 pl-1">
            <input
              id="model-custom-key-toggle"
              type="checkbox"
              checked={isModelCustomKey}
              onChange={(e) => onToggleModelCustomKey(e.target.checked)}
              className="rounded border-white/20 bg-white/10 text-blue-600 cursor-pointer"
            />
            <label htmlFor="model-custom-key-toggle" className="text-[11.5px] text-[#d4d4d8] cursor-pointer">
              {t("aichat_connect_use_custom_key", { model: selectedModel.name })}
            </label>
          </div>
        </>
      )}
    </>
  );
};

