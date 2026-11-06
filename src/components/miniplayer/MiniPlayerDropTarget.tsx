import React from "react";
import { ArrowDown } from "lucide-react";

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
  if (!isNear && !isInZone) return null;

  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-40 pointer-events-none select-none flex flex-col items-center">
      <div
        className={`w-[360px] h-[92px] flex flex-col items-center justify-center gap-1.5 transition-all duration-200 ${
          notchShape === "notch"
            ? "rounded-b-[28px] rounded-t-none"
            : "rounded-[28px] mt-2"
        } ${
          isInZone
            ? "border-2 border-[#38bdf8] bg-[#38bdf8]/15 shadow-[0_0_36px_rgba(56,189,248,0.45)] scale-100"
            : "border-2 border-dashed border-white/40 bg-black/30 backdrop-blur-md shadow-xl scale-95"
        }`}
      >
        <ArrowDown
          size={18}
          className={`transition-colors duration-200 ${
            isInZone ? "text-[#38bdf8] animate-bounce" : "text-white/60"
          }`}
        />
        <span
          className={`text-[12.5px] font-medium tracking-wide transition-colors duration-200 ${
            isInZone ? "text-[#38bdf8] font-bold" : "text-white/80"
          }`}
        >
          Lepas di sini untuk menyatu ke notch
        </span>
      </div>
    </div>
  );
};

