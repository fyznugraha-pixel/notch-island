import React, { useEffect, useRef } from "react";
import { Check, Route } from "lucide-react";
import { AiBrandLogo, detectAiBrand } from "./AiBrandLogos";
import { ScrollingText } from "../ScrollingText";
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

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
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const currentIndex = models.findIndex((m) => m.id === selectedModelId);
        const nextIndex =
          e.key === "ArrowDown"
            ? (currentIndex + 1) % models.length
            : (currentIndex - 1 + models.length) % models.length;
        if (models[nextIndex]) {
          onSelectModel(models[nextIndex]);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [models, selectedModelId, onSelectModel, onClose]);

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Pilih model"
      className="absolute left-6 top-[48px] w-[385px] z-50 p-2 rounded-[22px] border border-white/[0.14] bg-[#101015]/98 backdrop-blur-2xl shadow-[0_24px_60px_rgba(0,0,0,0.85)] flex flex-col gap-1 select-none animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="flex items-center justify-between px-2.5 pt-1 pb-1">
        <span className="text-[11px] font-semibold tracking-[0.06em] text-[#a1a1aa]">
          PILIH MODEL / MODE
        </span>
        <span className="text-[10.5px] text-emerald-400 font-medium flex items-center gap-1">
          <Check size={11} strokeWidth={2.5} />
          Terverifikasi
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
                name: "Auto (Hemat & Cerdas)",
                provider,
                tier: "Fast",
                description: "Memilih model sesuai kesulitan pesan untuk menghemat kuota",
                inputCostPer1M: 0,
                outputCostPer1M: 0,
              });
            }
            onClose();
          }}
          style={{
            backgroundColor: selectedModelId === "auto" ? "rgba(56,130,246,0.22)" : "transparent",
            borderColor: selectedModelId === "auto" ? accentColor : "transparent",
          }}
          className="w-full flex items-center gap-2.5 h-14 px-2.5 rounded-[16px] border text-left cursor-pointer transition-all hover:bg-white/[0.06]"
        >
          <span className="w-7 h-7 rounded-[9px] bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shrink-0 shadow-sm text-white">
            <Route size={15} />
          </span>
          <div className="grow min-w-0 pr-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[13px] font-semibold text-white truncate shrink min-w-0">
                Auto (Hemat & Cerdas)
              </span>
              <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-blue-500/25 text-blue-300 font-medium shrink-0 whitespace-nowrap">
                Bawaan
              </span>
            </div>
            <ScrollingText
              text="Memilih model sesuai kesulitan pesan untuk menghemat kuota"
              className="text-[11px] text-[#a1a1aa] mt-0.5"
            />
          </div>
          {selectedModelId === "auto" ? (
            <span className="w-5 h-5 rounded-full bg-[#f4f4f5] text-black flex items-center justify-center shrink-0 shadow-sm">
              <Check size={12} strokeWidth={3} />
            </span>
          ) : (
            <span className="h-5 px-2 rounded-full bg-white/[0.08] flex items-center text-[10.5px] font-medium text-[#c4c4cc] shrink-0">
              Adaptif
            </span>
          )}
        </button>

        {models.map((model) => {
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
                backgroundColor: isSelected ? "rgba(56,130,246,0.22)" : "transparent",
                borderColor: isSelected ? accentColor : "transparent",
              }}
              className="w-full flex items-center gap-2.5 h-14 px-2.5 rounded-[16px] border text-left cursor-pointer transition-all hover:bg-white/[0.06]"
            >
              <AiBrandLogo provider={getDisplayLogoProvider(model)} size={28} withContainer />
              <div className="grow min-w-0 pr-1">
                <div className="text-[13px] font-semibold text-white truncate shrink min-w-0">
                  {model.name}
                </div>
                {model.description ? (
                  <ScrollingText
                    text={model.description}
                    className="text-[11px] text-[#a1a1aa] mt-0.5"
                  />
                ) : null}
              </div>
              {isSelected ? (
                <span className="w-5 h-5 rounded-full bg-[#f4f4f5] text-black flex items-center justify-center shrink-0 shadow-sm">
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : (
                <span className="h-5 px-2 rounded-full bg-white/[0.08] flex items-center text-[11px] font-medium text-[#c4c4cc] shrink-0">
                  {model.tier}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {onOpenConnect && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenConnect();
          }}
          className="h-7.5 px-3 mx-1 mt-1 rounded-[12px] bg-white/[0.04] hover:bg-white/[0.08] text-[11.5px] font-medium text-[#8db8ff] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
        >
          <span>+ Hubungkan / Kelola API Key</span>
        </button>
      )}

      <div className="flex items-center justify-center gap-2.5 h-7 mt-0.5 border-t border-white/[0.08] text-[11px] text-[#a1a1aa]">
        <span>↑↓ pilih</span>
        <span aria-hidden="true">·</span>
        <span>Enter konfirmasi</span>
        <span aria-hidden="true">·</span>
        <span>Esc tutup</span>
      </div>
    </div>
  );
};
