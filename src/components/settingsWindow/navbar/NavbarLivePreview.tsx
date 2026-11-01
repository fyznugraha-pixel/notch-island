import React from "react";
import { NavbarConfig } from "../../../types/navbar";
import { NavbarDock } from "../../navbar/NavbarDock";

interface NavbarLivePreviewProps {
  config: NavbarConfig;
  isLightMode?: boolean;
}

export const NavbarLivePreview: React.FC<NavbarLivePreviewProps> = ({
  config,
  isLightMode = false,
}) => {
  const shapeLabel = config.shape === "anchored" ? "Nempel (Anchored)" : "Melayang (Floating)";
  const positionLabel =
    config.position === "bottom"
      ? "Bawah"
      : config.position === "top"
      ? "Atas"
      : config.position === "left"
      ? "Kiri"
      : "Kanan";

  return (
    <div
      className={`sticky top-0 z-20 w-full rounded-[16px] border p-4 shadow-sm backdrop-blur-md transition-colors ${
        isLightMode
          ? "bg-white/80 border-black/[0.08]"
          : "bg-[#15151a]/85 border-white/[0.08]"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold tracking-wider uppercase text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
            Pratinjau Langsung
          </span>
          <span
            className={`text-[11px] font-medium ${
              isLightMode ? "text-neutral-500" : "text-zinc-400"
            }`}
          >
            {shapeLabel} · {positionLabel} · {config.cornerRadius}px
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span
            className={`text-[10.5px] font-medium ${
              isLightMode ? "text-neutral-600" : "text-zinc-300"
            }`}
          >
            {config.enabled ? "Aktif" : "Nonaktif"}
          </span>
        </div>
      </div>

      {/* Simulated Screen Area */}
      <div
        className={`relative w-full h-[100px] rounded-[12px] border overflow-hidden flex items-end justify-center pb-2 select-none ${
          isLightMode
            ? "bg-[#e5e5ea] border-black/[0.06]"
            : "bg-[#0c0c10] border-white/[0.06]"
        }`}
      >
        {/* Subtle desktop mockup lines */}
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#8db8ff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        <div className="scale-90 origin-bottom transform">
          <NavbarDock config={config} />
        </div>
      </div>
    </div>
  );
};

