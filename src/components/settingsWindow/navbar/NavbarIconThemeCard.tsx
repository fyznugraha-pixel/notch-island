import React from "react";
import { NavbarConfig, NavbarIconTheme } from "../../../types/navbar";
import { AppWindow, Check } from "lucide-react";
import { hexToRgba } from "../../../services/navbarConfigService";
import { Language } from "../../../services/i18n";
import {
  FluentExplorerIcon,
  FluentVSCodeIcon,
  WindowsExplorerIcon,
  WindowsSettingsIcon,
  IOSExplorerIcon,
  IOSChromeIcon,
  IOSVSCodeIcon,
} from "../../navbar/groups/appIcons";
import { useWindowsPinnedApps } from "../../../hooks/useWindowsPinnedApps";

interface NavbarIconThemeCardProps {
  config: NavbarConfig;
  onChange: (patch: Partial<NavbarConfig>) => void;
  isLightMode?: boolean;
  optLanguage?: Language;
}

interface ThemeOption {
  id: NavbarIconTheme;
  title: string;
  badge: string;
  desc: string;
  renderPreview: () => React.ReactNode;
}

export const NavbarIconThemeCard: React.FC<NavbarIconThemeCardProps> = ({
  config,
  onChange,
  isLightMode = false,
  optLanguage = "id",
}) => {
  const isId = optLanguage === "id";
  const { pinnedApps } = useWindowsPinnedApps(true);
  const nativePreviewIcons = pinnedApps
    .filter((a) => a.icon_base64)
    .slice(0, 3);

  const cardBg = isLightMode
    ? "bg-white/70 border-black/[0.08]"
    : "bg-white/[0.03] border-white/[0.07]";
  const textTitle = isLightMode ? "text-neutral-900" : "text-white";
  const textSub = isLightMode ? "text-neutral-500" : "text-zinc-400";

  const themes: ThemeOption[] = [
    {
      id: "fluent",
      title: "Modern Fluent",
      badge: isId ? "Bawaan Gili" : "Gili Default",
      desc: isId
        ? "Vektor tajam, modern & warna aksen dinamis"
        : "Crisp modern vectors with dynamic accent tint",
      renderPreview: () => (
        <div className="flex items-center gap-2 p-1.5 rounded-[8px] bg-black/25">
          <FluentExplorerIcon size={18} />
          <img src="/logo/chrome.png" alt="Chrome" className="w-[18px] h-[18px] object-contain" />
          <FluentVSCodeIcon size={18} />
        </div>
      ),
    },
    {
      id: "windows",
      title: isId ? "Asli Windows" : "Native Windows",
      badge: isId ? "Sistem Asli" : "System Native",
      desc: isId
        ? "Ikon resmi taskbar Windows 11 & file .exe (256px)"
        : "Official Windows 11 taskbar icons & .exe assets (256px)",
      renderPreview: () => (
        <div className="flex items-center gap-2 p-1.5 rounded-[8px] bg-black/25">
          {nativePreviewIcons.length > 0 ? (
            nativePreviewIcons.map((app) => (
              <img
                key={app.id}
                src={app.icon_base64!}
                alt={app.name}
                className="w-[18px] h-[18px] object-contain select-none"
              />
            ))
          ) : (
            <>
              <WindowsExplorerIcon size={18} />
              <img src="/logo/chrome.png" alt="Chrome" className="w-[18px] h-[18px] object-contain" />
              <WindowsSettingsIcon size={18} />
            </>
          )}
        </div>
      ),
    },
    {
      id: "ios",
      title: isId ? "Gaya iOS / macOS" : "iOS / macOS Style",
      badge: "Apple Squircle",
      desc: isId
        ? "Squircle seragam, gradasi halus & efek glossy"
        : "Uniform squircles with subtle gradients & gloss",
      renderPreview: () => (
        <div className="flex items-center gap-2 p-1.5 rounded-[8px] bg-black/25">
          <IOSExplorerIcon size={20} />
          <IOSChromeIcon size={20} />
          <IOSVSCodeIcon size={20} />
        </div>
      ),
    },
  ];

  return (
    <div className={`flex flex-col gap-3.5 p-4 rounded-[16px] border ${cardBg}`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
          <AppWindow size={18} />
        </div>
        <div className="flex flex-col">
          <span className={`text-[13px] font-semibold ${textTitle}`}>
            {isId ? "Tema Ikon Aplikasi" : "App Icon Themes"}
          </span>
          <span className={`text-[11px] ${textSub}`}>
            {isId
              ? "Pilih gaya visual ikon aplikasi pada dock (Fluent, Asli Windows, atau iOS Squircle)"
              : "Choose visual icon style for dock apps (Fluent, Native Windows, or iOS Squircle)"}
          </span>
        </div>
      </div>

      {/* 3 Interactive Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {themes.map((t) => {
          const isSelected = (config.iconTheme || "fluent") === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange({ iconTheme: t.id })}
              style={
                isSelected
                  ? {
                      backgroundColor: hexToRgba(config.accent, 0.12),
                      borderColor: config.accent,
                      color: config.accent,
                    }
                  : undefined
              }
              className={`flex flex-col justify-between p-3 rounded-[12px] border text-left transition-all cursor-pointer relative ${
                isSelected
                  ? "shadow-sm"
                  : isLightMode
                  ? "bg-black/[0.03] border-black/[0.06] hover:bg-black/[0.06] text-neutral-700"
                  : "bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08] text-zinc-300"
              }`}
            >
              {/* Check indicator if selected */}
              {isSelected && (
                <span
                  style={{ backgroundColor: config.accent }}
                  className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full text-white flex items-center justify-center shadow-sm"
                >
                  <Check size={11} strokeWidth={3} />
                </span>
              )}

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[12.5px] font-bold text-white leading-tight">
                    {t.title}
                  </span>
                </div>
                <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-white/10 text-white/70 inline-block mb-2">
                  {t.badge}
                </span>
                <p className={`text-[10.5px] leading-relaxed mb-3 ${isSelected ? "text-blue-300" : textSub}`}>
                  {t.desc}
                </p>
              </div>

              {/* Miniature Icon Preview */}
              <div className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-center">
                {t.renderPreview()}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

