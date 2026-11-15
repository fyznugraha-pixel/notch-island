import React from "react";
import { ArrowDown } from "lucide-react";
import { useTaskbarLang, tx } from "../../services/taskbarI18n";

export interface MiniPlayerDropTargetProps {
  isNear: boolean;
  isInZone: boolean;
  notchShape: "notch" | "island";
}

export const MiniPlayerDropTarget: React.FC<MiniPlayerDropTargetProps> = ({
  isNear,
  isInZone,
  notchShape,
}) => {
  const lang = useTaskbarLang();

  if (!isNear && !isInZone) return null;

  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-40 pointer-events-none select-none flex flex-col items-center max-w-full px-3">
      <div
        className={`w-[360px] max-w-[calc(100vw-24px)] h-[92px] px-4 flex flex-col items-center justify-center gap-1.5 text-center transition-all duration-200 ${
          notchShape === "notch"
            ? "rounded-b-[28px] rounded-t-none"
            : "rounded-[28px] mt-2"
        } ${
          isInZone
            ? "border-2 border-[#38bdf8] bg-[#38bdf8]/15 [html.light_&]:bg-white/90 [html.light_&]:border-[#0284c7] shadow-[0_0_36px_rgba(56,189,248,0.45)] scale-100"
            : "border-2 border-dashed border-white/40 bg-black/30 [html.light_&]:border-black/25 [html.light_&]:bg-white/85 backdrop-blur-md shadow-xl scale-95"
        }`}
      >
        <ArrowDown
          size={18}
          aria-hidden="true"
          className={`transition-colors duration-200 ${
            isInZone
              ? "text-[#38bdf8] [html.light_&]:text-[#0369a1] animate-bounce"
              : "text-white/60 [html.light_&]:text-neutral-600"
          }`}
        />
        <span
          className={`text-[12.5px] font-medium tracking-wide transition-colors duration-200 ${
            isInZone
              ? "text-[#38bdf8] [html.light_&]:text-[#0369a1] font-bold"
              : "text-white/80 [html.light_&]:text-neutral-800"
          }`}
        >
          {tx(
            lang,
            "Drop here to merge into notch",
            "Lepas di sini untuk menyatu ke notch"
          )}
        </span>
      </div>
    </div>
  );
};

