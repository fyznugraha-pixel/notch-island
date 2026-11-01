import React from "react";
import { NavbarConfig, NavbarIconSpacing } from "../../../types/navbar";
import { Layers, Maximize2, Shield } from "lucide-react";

interface NavbarShapeCardProps {
  config: NavbarConfig;
  onChange: (patch: Partial<NavbarConfig>) => void;
  isLightMode?: boolean;
}

export const NavbarShapeCard: React.FC<NavbarShapeCardProps> = ({
  config,
  onChange,
  isLightMode = false,
}) => {
  const isAnchored = config.shape === "anchored";

  const cardBg = isLightMode
    ? "bg-white/70 border-black/[0.08]"
    : "bg-white/[0.03] border-white/[0.07]";
  const textTitle = isLightMode ? "text-neutral-900" : "text-white";
  const textSub = isLightMode ? "text-neutral-500" : "text-zinc-400";

  return (
    <div className={`flex flex-col gap-4 p-4 rounded-[16px] border ${cardBg}`}>
      {/* 1. Master Enable Toggle */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <Shield size={18} />
          </div>
          <div className="flex flex-col">
            <span className={`text-[13px] font-semibold ${textTitle}`}>
              Aktifkan Navbar Gili
            </span>
            <span className={`text-[11px] ${textSub}`}>
              Jadikan dock fleksibel sebagai navigasi aplikasi & status utama
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange({ enabled: !config.enabled })}
          aria-label="Toggle Navbar"
          className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
            config.enabled ? "bg-[#0a84ff]" : isLightMode ? "bg-black/20" : "bg-white/20"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
              config.enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* 2. Shape Selection (Anchored vs Floating) */}
      <div className="flex flex-col gap-2">
        <label className={`text-[12px] font-semibold ${textTitle}`}>
          Bentuk Bingkai (Shape)
        </label>
        <div className="grid grid-cols-2 gap-2">
          {/* Anchored Button */}
          <button
            type="button"
            onClick={() => onChange({ shape: "anchored" })}
            className={`flex flex-col items-start p-3 rounded-[12px] border text-left transition-all cursor-pointer ${
              isAnchored
                ? "bg-blue-500/10 border-blue-500 text-blue-500"
                : isLightMode
                ? "bg-black/[0.03] border-black/[0.06] hover:bg-black/[0.06] text-neutral-700"
                : "bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08] text-zinc-300"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Layers size={15} />
              <span className="text-[12.5px] font-semibold">Nempel (Anchored)</span>
            </div>
            <span className={`text-[10.5px] ${isAnchored ? "text-blue-400" : textSub}`}>
              Rapat di tepi layar bawah dengan sayap lekukan estetik
            </span>
          </button>

          {/* Floating Button */}
          <button
            type="button"
            onClick={() => onChange({ shape: "floating" })}
            className={`flex flex-col items-start p-3 rounded-[12px] border text-left transition-all cursor-pointer ${
              !isAnchored
                ? "bg-blue-500/10 border-blue-500 text-blue-500"
                : isLightMode
                ? "bg-black/[0.03] border-black/[0.06] hover:bg-black/[0.06] text-neutral-700"
                : "bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08] text-zinc-300"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Maximize2 size={15} />
              <span className="text-[12.5px] font-semibold">Melayang (Floating)</span>
            </div>
            <span className={`text-[10.5px] ${!isAnchored ? "text-blue-400" : textSub}`}>
              Satu kapsul melayang dengan elevasi bayangan halus
            </span>
          </button>
        </div>
      </div>

      {/* 3. Sliders: Radius, Distance, Icon Size */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        {/* Corner Radius */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-[11.5px]">
            <span className={`font-medium ${textTitle}`}>Radius Sudut</span>
            <span className={`font-semibold tabular-nums text-blue-500`}>
              {config.cornerRadius}px
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={24}
            value={config.cornerRadius}
            onChange={(e) => onChange({ cornerRadius: Number(e.target.value) })}
            className="w-full accent-[#0a84ff] cursor-pointer"
          />
        </div>

        {/* Distance from bottom (Disabled if anchored) */}
        <div
          className={`flex flex-col gap-1.5 transition-opacity ${
            isAnchored ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          <div className="flex justify-between items-center text-[11.5px]">
            <span className={`font-medium ${textTitle}`}>Jarak dari Tepi Layar</span>
            <span className={`font-semibold tabular-nums text-blue-500`}>
              {isAnchored ? "0px" : `${config.distanceFromEdge}px`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={32}
            disabled={isAnchored}
            value={config.distanceFromEdge}
            onChange={(e) => onChange({ distanceFromEdge: Number(e.target.value) })}
            className="w-full accent-[#0a84ff] cursor-pointer"
          />
        </div>

        {/* Icon Size */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-[11.5px]">
            <span className={`font-medium ${textTitle}`}>Ukuran Ikon</span>
            <span className={`font-semibold tabular-nums text-blue-500`}>
              {config.iconSize}px
            </span>
          </div>
          <input
            type="range"
            min={24}
            max={56}
            value={config.iconSize}
            onChange={(e) => onChange({ iconSize: Number(e.target.value) })}
            className="w-full accent-[#0a84ff] cursor-pointer"
          />
        </div>

        {/* Icon Spacing Segmented Control */}
        <div className="flex flex-col gap-1.5">
          <span className={`text-[11.5px] font-medium ${textTitle}`}>
            Jarak Antar Ikon
          </span>
          <div
            className={`flex items-center p-0.5 rounded-[9px] border ${
              isLightMode
                ? "bg-black/[0.04] border-black/[0.06]"
                : "bg-white/[0.05] border-white/[0.06]"
            }`}
          >
            {(["tight", "normal", "roomy"] as NavbarIconSpacing[]).map((spacing) => {
              const label =
                spacing === "tight" ? "Rapat" : spacing === "normal" ? "Normal" : "Lega";
              const isSelected = config.iconSpacing === spacing;
              return (
                <button
                  key={spacing}
                  type="button"
                  onClick={() => onChange({ iconSpacing: spacing })}
                  className={`flex-1 py-1 rounded-[7px] text-[11px] font-medium transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#0a84ff] text-white shadow-sm"
                      : isLightMode
                      ? "text-neutral-600 hover:text-neutral-900"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
