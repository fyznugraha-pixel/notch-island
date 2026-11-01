import React from "react";
import {
  NavbarBackground,
  NavbarConfig,
  NAVBAR_ACCENT_COLORS,
} from "../../../types/navbar";
import { Palette, Check } from "lucide-react";

interface NavbarLookCardProps {
  config: NavbarConfig;
  onChange: (patch: Partial<NavbarConfig>) => void;
  isLightMode?: boolean;
}

export const NavbarLookCard: React.FC<NavbarLookCardProps> = ({
  config,
  onChange,
  isLightMode = false,
}) => {
  const cardBg = isLightMode
    ? "bg-white/70 border-black/[0.08]"
    : "bg-white/[0.03] border-white/[0.07]";
  const textTitle = isLightMode ? "text-neutral-900" : "text-white";
  const textSub = isLightMode ? "text-neutral-500" : "text-zinc-400";

  const backgrounds: { id: NavbarBackground; label: string; desc: string }[] = [
    {
      id: "followNotch",
      label: "Ikut Notch",
      desc: "Menyesuaikan tema & saturasi Gili Notch",
    },
    {
      id: "black",
      label: "Hitam Pekat",
      desc: "Kontras tinggi OLED murni",
    },
    {
      id: "custom",
      label: "Warna Kustom",
      desc: "Pilih warna hex pribadi",
    },
  ];

  return (
    <div className={`flex flex-col gap-4 p-4 rounded-[16px] border ${cardBg}`}>
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
          <Palette size={18} />
        </div>
        <div className="flex flex-col">
          <span className={`text-[13px] font-semibold ${textTitle}`}>
            Tampilan & Warna
          </span>
          <span className={`text-[11px] ${textSub}`}>
            Kustomisasi warna permukaan, transparansi dan aksen aktif
          </span>
        </div>
      </div>

      {/* 1. Background Selection */}
      <div className="flex flex-col gap-2">
        <label className={`text-[11.5px] font-medium ${textTitle}`}>
          Warna Latar Belakang
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {backgrounds.map((bg) => {
            const isSelected = config.background === bg.id;
            return (
              <button
                key={bg.id}
                type="button"
                onClick={() => onChange({ background: bg.id })}
                className={`flex flex-col items-start p-2.5 rounded-[11px] border text-left transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[#0a84ff]/10 border-[#0a84ff] text-[#0a84ff]"
                    : isLightMode
                    ? "bg-black/[0.03] border-black/[0.06] hover:bg-black/[0.06] text-neutral-700"
                    : "bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08] text-zinc-300"
                }`}
              >
                <span className="text-[12px] font-semibold mb-0.5">
                  {bg.label}
                </span>
                <span className={`text-[10px] ${isSelected ? "text-blue-400" : textSub}`}>
                  {bg.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* Custom Color Input if "custom" selected */}
        {config.background === "custom" && (
          <div className="flex items-center gap-3 mt-1 p-2 rounded-[10px] bg-white/[0.04] border border-white/[0.06]">
            <input
              type="color"
              value={config.customColor || "#1b1b20"}
              onChange={(e) => onChange({ customColor: e.target.value })}
              className="w-8 h-8 rounded-[7px] border-0 cursor-pointer bg-transparent"
            />
            <input
              type="text"
              value={config.customColor || "#1b1b20"}
              onChange={(e) => onChange({ customColor: e.target.value })}
              placeholder="#1b1b20"
              className={`text-[12px] font-mono px-2 py-1 rounded-[6px] border outline-none ${
                isLightMode
                  ? "bg-white border-black/10 text-black"
                  : "bg-black/30 border-white/10 text-white"
              }`}
            />
            <span className={`text-[11px] ${textSub}`}>
              Warna dasar permukaan dock
            </span>
          </div>
        )}
      </div>

      {/* 2. Accent Color Dots */}
      <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.06]">
        <label className={`text-[11.5px] font-medium ${textTitle}`}>
          Warna Aksen Aktif
        </label>
        <div className="flex items-center gap-3">
          {NAVBAR_ACCENT_COLORS.map((hex) => {
            const isSelected = config.accent.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={hex}
                type="button"
                onClick={() => onChange({ accent: hex })}
                style={{ backgroundColor: hex }}
                className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                  isSelected ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#121216]" : "hover:scale-105 opacity-85 hover:opacity-100"
                }`}
              >
                {isSelected && <Check size={14} className="text-white drop-shadow" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Opacity Slider */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-white/[0.06]">
        <div className="flex justify-between items-center text-[11.5px]">
          <span className={`font-medium ${textTitle}`}>Transparansi Permukaan</span>
          <span className={`font-semibold tabular-nums text-blue-500`}>
            {config.opacity}%
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          value={config.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          className="w-full accent-[#0a84ff] cursor-pointer"
        />
      </div>
    </div>
  );
};

