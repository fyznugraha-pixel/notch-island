import React from "react";
import { Sparkles, Layers, Maximize2, Tag } from "lucide-react";
import { Language } from "../../../services/i18n";
import { NavbarStylePatch } from "../../../services/navbarStyleShareService";

interface NavbarStyleSummaryCardProps {
  styleData: NavbarStylePatch;
  title?: string;
  isLightMode?: boolean;
  optLanguage?: Language;
}

const ICON_THEME_LABELS: Record<string, string> = {
  fluent: "Modern Fluent",
  windows: "Windows Native",
  ios: "macOS / iOS",
  glass: "Frosted Glass",
  monochrome: "Monochrome",
  tinted: "Tinted Accent",
  circle: "Circle Capsule",
  retro: "Pixel Retro",
  neon: "Neon Glow",
  clay: "Soft Clay",
  outline: "Outline Line",
  pastel: "Pastel Soft",
  sticker: "Sticker Pop",
  contrast: "High Contrast",
};

export const NavbarStyleSummaryCard: React.FC<NavbarStyleSummaryCardProps> = ({
  styleData,
  title,
  isLightMode = false,
  optLanguage = "id",
}) => {
  const isId = optLanguage === "id";
  const surfaceHex =
    styleData.background === "custom" && styleData.customColor
      ? styleData.customColor
      : "#000000";

  const surfaceText =
    styleData.style === "followNotch"
      ? isId
        ? "Ikut Notch"
        : "Follow Notch"
      : styleData.style === "liquid"
      ? `Liquid · ${styleData.opacity}% · Blur ${styleData.blur}%`
      : `Solid · ${styleData.opacity}%`;

  const spacingText =
    styleData.iconSpacing === "tight"
      ? isId
        ? "Rapat"
        : "Tight"
      : styleData.iconSpacing === "normal"
      ? "Normal"
      : isId
      ? "Lega"
      : "Roomy";

  const boxClass = isLightMode
    ? "bg-white border-black/[0.08] text-neutral-900"
    : "bg-[#111624] border-[#21293d] text-white";
  const chipClass = isLightMode
    ? "bg-black/[0.05] text-neutral-700 border-black/[0.07]"
    : "bg-white/[0.06] text-zinc-200 border-white/[0.08]";
  const mutedText = isLightMode ? "text-neutral-600" : "text-[#9ca3af]";

  return (
    <div className={`p-3 rounded-[13px] border flex flex-col gap-2.5 ${boxClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {styleData.shape === "anchored" ? (
            <Layers size={14} className="text-[#3882F6] shrink-0" />
          ) : (
            <Maximize2 size={14} className="text-[#3882F6] shrink-0" />
          )}
          <span className="text-[12.5px] font-semibold truncate">
            {title || (isId ? "Ringkasan Style Taskbar" : "Taskbar Style Summary")}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            title={
              styleData.background === "followNotch"
                ? isId
                  ? "Latar ikut Notch"
                  : "Background follows Notch"
                : surfaceHex
            }
            style={{ backgroundColor: surfaceHex }}
            className={`w-4 h-4 rounded-full border ${
              isLightMode ? "border-black/20" : "border-white/25"
            }`}
          />
          <span
            title={styleData.accent}
            style={{ backgroundColor: styleData.accent }}
            className={`w-4 h-4 rounded-full border ${
              isLightMode ? "border-black/20" : "border-white/25"
            }`}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10.5px] font-medium">
        <span className={`px-2 py-0.5 rounded-[7px] border ${chipClass}`}>
          {styleData.shape === "anchored" ? "Anchored" : "Floating"} · r{styleData.cornerRadius}px
        </span>
        <span className={`px-2 py-0.5 rounded-[7px] border ${chipClass}`}>{surfaceText}</span>
        <span className={`px-2 py-0.5 rounded-[7px] border ${chipClass}`}>
          {ICON_THEME_LABELS[styleData.iconTheme] || styleData.iconTheme}
        </span>
        <span className={`px-2 py-0.5 rounded-[7px] border ${chipClass}`}>
          {styleData.taskbarHeight}px · {styleData.iconSize}px · {spacingText}
        </span>
        <span className={`px-2 py-0.5 rounded-[7px] border inline-flex items-center gap-1 ${chipClass}`}>
          <Sparkles size={10} />
          Magnify: {styleData.magnify ? (isId ? "Aktif" : "On") : isId ? "Mati" : "Off"}
        </span>
        <span className={`px-2 py-0.5 rounded-[7px] border inline-flex items-center gap-1 ${chipClass}`}>
          <Tag size={10} />
          Label: {styleData.appLabels ? (isId ? "Aktif" : "On") : isId ? "Mati" : "Off"}
        </span>
      </div>

      <div className={`text-[10.5px] ${mutedText}`}>
        {isId
          ? "Posisi layar, monitor, susunan modul, dan setting lainnya di PC Anda tetap aman dan tidak berubah."
          : "Screen position, monitor, module layout, and all other PC settings remain untouched."}
      </div>
    </div>
  );
};
