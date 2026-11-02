import React from "react";
import {
  NavbarBackground,
  NavbarConfig,
  NavbarStyle,
  NAVBAR_ACCENT_COLORS,
} from "../../../types/navbar";
import { Palette, Check, Square, Droplets, Compass, Lock } from "lucide-react";
import { hexToRgba } from "../../../services/navbarConfigService";
import { useNotchTheme } from "../../../hooks/useNotchTheme";
import { Language } from "../../../services/i18n";
import { CustomColorPicker } from "./CustomColorPicker";

const ACCENT_COLOR_NAMES: Record<string, { id: string; en: string }> = {
  "#3882f6": { id: "Biru Safir", en: "Sapphire Blue" },
  "#14b8a6": { id: "Teal Segar", en: "Fresh Teal" },
  "#a855f7": { id: "Ungu Lavender", en: "Lavender Purple" },
  "#f43f5e": { id: "Mawar Crimson", en: "Crimson Rose" },
  "#f59e0b": { id: "Amber Hangat", en: "Warm Amber" },
  "#22c55e": { id: "Hijau Zamrud", en: "Emerald Green" },
};

interface NavbarLookCardProps {
  config: NavbarConfig;
  onChange: (patch: Partial<NavbarConfig>) => void;
  isLightMode?: boolean;
  optLanguage?: Language;
}

export const NavbarLookCard: React.FC<NavbarLookCardProps> = ({
  config,
  onChange,
  isLightMode = false,
  optLanguage = "id",
}) => {
  const isId = optLanguage === "id";
  const { notchBgHex, notchLabel } = useNotchTheme();

  const cardBg = isLightMode
    ? "bg-white/70 border-black/[0.08]"
    : "bg-white/[0.03] border-white/[0.07]";
  const textTitle = isLightMode ? "text-neutral-900" : "text-white";
  const textSub = isLightMode ? "text-neutral-500" : "text-zinc-400";

  const isFollowNotch =
    config.style === "followNotch" || config.background === "followNotch";

  const styles: { id: NavbarStyle; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      id: "solid",
      label: "Solid",
      desc: isId ? "Permukaan solid, hemat daya & tajam" : "Solid surface, power-efficient & crisp",
      icon: <Square size={14} />,
    },
    {
      id: "liquid",
      label: "Liquid",
      desc: isId ? "Kaca bening dengan blur & highlight" : "Clear glass with blur & specular highlights",
      icon: <Droplets size={14} />,
    },
    {
      id: "followNotch",
      label: isId ? "Ikut Notch" : "Follow Notch",
      desc: isId
        ? `Otomatis ikut warna idle Notch (${notchLabel})`
        : `Automatically matches Notch idle color (${notchLabel})`,
      icon: <Compass size={14} />,
    },
  ];

  const backgrounds: { id: NavbarBackground; label: string; desc: string }[] = [
    {
      id: "black",
      label: isId ? "Hitam Pekat" : "True Black",
      desc: isId ? "Hitam OLED murni (#000000)" : "Pure OLED black (#000000)",
    },
    {
      id: "followNotch",
      label: isId ? "Ikut Notch" : "Follow Notch",
      desc: isId
        ? `Terkunci ikut idle Notch (${notchLabel})`
        : `Locked to Notch idle (${notchLabel})`,
    },
    {
      id: "custom",
      label: isId ? "Warna Kustom" : "Custom Color",
      desc: isId
        ? "Bebas ganti warna latar belakang dock"
        : "Choose custom background color for dock",
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
            {isId ? "Tampilan & Gaya" : "Appearance & Style"}
          </span>
          <span className={`text-[11px] ${textSub}`}>
            {isId
              ? "Kustomisasi gaya material permukaan dock, warna latar, aksen, dan transparansi"
              : "Customize dock surface material, background color, accent & opacity"}
          </span>
        </div>
      </div>

      {/* 1. Style Selection (Artboard 83) */}
      <div className="flex flex-col gap-2">
        <label className={`text-[11.5px] font-medium ${textTitle}`}>
          {isId ? "Pilihan Gaya Permukaan" : "Surface Material Style"}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {styles.map((s) => {
            const isSelected = (config.style || "solid") === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  const patch: Partial<NavbarConfig> = { style: s.id };
                  if (s.id === "followNotch") {
                    patch.background = "followNotch";
                  } else if (config.background === "followNotch") {
                    patch.background = "black";
                  }
                  onChange(patch);
                }}
                style={
                  isSelected
                    ? {
                        backgroundColor: hexToRgba(config.accent, 0.12),
                        borderColor: config.accent,
                        color: config.accent,
                      }
                    : undefined
                }
                className={`flex flex-col items-start p-2.5 rounded-[11px] border text-left transition-all cursor-pointer ${
                  isSelected
                    ? "shadow-sm"
                    : isLightMode
                    ? "bg-black/[0.03] border-black/[0.06] hover:bg-black/[0.06] text-neutral-700"
                    : "bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08] text-zinc-300"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span style={{ color: isSelected ? config.accent : undefined }}>
                    {s.icon}
                  </span>
                  <span className="text-[12px] font-semibold">{s.label}</span>
                </div>
                <span
                  style={{ color: isSelected ? hexToRgba(config.accent, 0.85) : undefined }}
                  className={`text-[10px] ${!isSelected ? textSub : ""}`}
                >
                  {s.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Background Selection */}
      <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.06]">
        <div className="flex items-center justify-between">
          <label className={`text-[11.5px] font-medium ${textTitle}`}>
            {isId ? "Warna Latar Belakang Dock" : "Dock Background Color"}
          </label>
          {isFollowNotch && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.07] text-zinc-300 border border-white/10">
              <Lock size={10} />
              {isId ? `Terkunci ke Notch: ${notchLabel}` : `Locked to Notch: ${notchLabel}`}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {backgrounds.map((bg) => {
            const isSelected = isFollowNotch
              ? bg.id === "followNotch"
              : config.background === bg.id;
            return (
              <button
                key={bg.id}
                type="button"
                onClick={() => {
                  const patch: Partial<NavbarConfig> = { background: bg.id };
                  if (bg.id === "followNotch") {
                    patch.style = "followNotch";
                  } else if (bg.id === "black") {
                    if (config.style === "followNotch") patch.style = "solid";
                  } else if (bg.id === "custom") {
                    if (config.style === "followNotch") patch.style = "solid";
                    if (!config.customColor) patch.customColor = "#0f172a";
                  }
                  onChange(patch);
                }}
                style={
                  isSelected
                    ? {
                        backgroundColor: hexToRgba(config.accent, 0.12),
                        borderColor: config.accent,
                        color: config.accent,
                      }
                    : undefined
                }
                className={`flex flex-col items-start p-2.5 rounded-[11px] border text-left transition-all cursor-pointer ${
                  isSelected
                    ? "shadow-sm"
                    : isLightMode
                    ? "bg-black/[0.03] border-black/[0.06] hover:bg-black/[0.06] text-neutral-700"
                    : "bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08] text-zinc-300"
                }`}
              >
                <span className="text-[12px] font-semibold mb-0.5">
                  {bg.label}
                </span>
                <span
                  style={{ color: isSelected ? hexToRgba(config.accent, 0.85) : undefined }}
                  className={`text-[10px] ${!isSelected ? textSub : ""}`}
                >
                  {bg.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* Locked info banner when "followNotch" is active */}
        {isFollowNotch && (
          <div className="flex items-center justify-between p-2.5 mt-1 rounded-[11px] bg-white/[0.03] border border-white/[0.07] text-[11px]">
            <div className="flex items-center gap-2.5">
              <span
                style={{ backgroundColor: notchBgHex }}
                className="w-5 h-5 rounded-full border border-white/25 shrink-0 shadow-sm"
              />
              <span className={textSub}>
                {isId ? (
                  <>
                    Warna latar dock otomatis mengikuti warna idle Gili Notch saat ini (<strong>{notchLabel}</strong>) dan tidak bisa diubah manual. Pilih <strong>Warna Kustom</strong> jika ingin mengganti warna latar belakang.
                  </>
                ) : (
                  <>
                    Dock background automatically matches Gili Notch idle color (<strong>{notchLabel}</strong>) and cannot be changed manually. Choose <strong>Custom Color</strong> if you want a custom background.
                  </>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Custom Color Studio ONLY when "custom" is selected */}
        {!isFollowNotch && config.background === "custom" && (
          <div className="flex flex-col gap-2 mt-1">
            <CustomColorPicker
              value={config.customColor || "#0f172a"}
              onChange={(nextHex) => onChange({ customColor: nextHex })}
              isLightMode={isLightMode}
              isId={isId}
            />
          </div>
        )}
      </div>

      {/* 3. Accent Color Dots (Only for active app indicator & rim highlight) */}
      <div className="flex flex-col gap-2.5 pt-1 border-t border-white/[0.06]">
        <div className="flex items-center justify-between">
          <label className={`text-[11.5px] font-medium ${textTitle}`}>
            {isId
              ? "Warna Aksen Indikator (Titik Aplikasi Aktif & Highlight)"
              : "Accent Color (Active App Dots & Highlights)"}
          </label>
          <div
            style={{
              backgroundColor: hexToRgba(config.accent, 0.14),
              borderColor: hexToRgba(config.accent, 0.4),
              color: config.accent,
            }}
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10.5px] font-semibold"
          >
            <span
              style={{
                backgroundColor: config.accent,
                boxShadow: `0 0 6px ${config.accent}`,
              }}
              className="w-2 h-2 rounded-full"
            />
            <span>
              {ACCENT_COLOR_NAMES[config.accent.toLowerCase()]
                ? isId
                  ? ACCENT_COLOR_NAMES[config.accent.toLowerCase()].id
                  : ACCENT_COLOR_NAMES[config.accent.toLowerCase()].en
                : config.accent}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {NAVBAR_ACCENT_COLORS.map((hex) => {
            const isSelected = config.accent.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={hex}
                type="button"
                onClick={() => onChange({ accent: hex })}
                style={{
                  backgroundColor: hex,
                  boxShadow: isSelected ? `0 0 14px ${hex}` : undefined,
                }}
                className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  isSelected
                    ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#121216]"
                    : "hover:scale-105 opacity-80 hover:opacity-100"
                }`}
              >
                {isSelected && <Check size={14} className="text-white drop-shadow" />}
              </button>
            );
          })}
        </div>

        {/* Live Accent Feature Feedback */}
        <div
          style={{
            borderColor: hexToRgba(config.accent, 0.25),
            backgroundColor: hexToRgba(config.accent, 0.06),
          }}
          className="flex items-center justify-between p-2 rounded-[10px] border text-[10.5px]"
        >
          <div className="flex items-center gap-2">
            <span
              style={{
                backgroundColor: config.accent,
                boxShadow: `0 0 8px ${config.accent}`,
              }}
              className="w-1.5 h-1.5 rounded-full shrink-0"
            />
            <span className={textSub}>
              {isId
                ? "Highlight dock, garis aplikasi aktif, tombol pusat kontrol & slider"
                : "Dock highlights, active app indicators, control center buttons & sliders"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pl-2">
            <div
              style={{
                backgroundColor: hexToRgba(config.accent, 0.2),
                borderColor: hexToRgba(config.accent, 0.4),
              }}
              className="px-2 py-0.5 rounded-[6px] border flex items-center gap-1"
            >
              <span
                style={{
                  backgroundColor: config.accent,
                  boxShadow: `0 0 6px ${config.accent}`,
                }}
                className="w-2.5 h-1 rounded-full"
              />
              <span style={{ color: config.accent }} className="font-semibold text-[9.5px]">
                {isId ? "Aktif" : "Active"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Opacity Slider */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-white/[0.06]">
        <div className="flex justify-between items-center text-[11.5px]">
          <span className={`font-medium ${textTitle}`}>
            {isId ? "Transparansi Permukaan" : "Surface Opacity"}
          </span>
          <span
            style={{ color: config.accent }}
            className="font-semibold tabular-nums"
          >
            {config.opacity}%
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          value={config.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          style={{ accentColor: config.accent }}
          className="w-full cursor-pointer"
        />
      </div>
    </div>
  );
};

