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
import { StyledAppIconFrame, StyledIconVariant } from "../../navbar/groups/StyledAppIcons";
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
    ? "bg-white border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
    : "bg-[#121318] border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]";
  const previewTrayBg = isLightMode ? "bg-black/10" : "bg-black/25";
  const textTitle = isLightMode ? "text-neutral-900" : "text-white";
  const textSub = isLightMode ? "text-neutral-500" : "text-zinc-400";

  const renderStyledPreview = (variant: StyledIconVariant) => (
    <div
      className={`flex items-center gap-2 p-1.5 rounded-[8px] ${previewTrayBg}`}
    >
      <StyledAppIconFrame
        variant={variant}
        tileSize={22}
        accentColor={config.accent}
        isLightSurface={isLightMode}
      >
        <FluentExplorerIcon size={14} />
      </StyledAppIconFrame>
      <StyledAppIconFrame
        variant={variant}
        tileSize={22}
        accentColor={config.accent}
        isLightSurface={isLightMode}
      >
        <img
          src="/logo/chrome.png"
          alt="Chrome"
          className="w-[14px] h-[14px] object-contain select-none"
        />
      </StyledAppIconFrame>
      <StyledAppIconFrame
        variant={variant}
        tileSize={22}
        accentColor={config.accent}
        isLightSurface={isLightMode}
      >
        <FluentVSCodeIcon size={14} />
      </StyledAppIconFrame>
    </div>
  );

  const themes: ThemeOption[] = [
    {
      id: "fluent",
      title: "Modern Fluent",
      badge: isId ? "Bawaan Gili" : "Gili Default",
      desc: isId
        ? "Vektor tajam, modern & warna aksen dinamis"
        : "Crisp modern vectors with dynamic accent tint",
      renderPreview: () => (
        <div className={`flex items-center gap-2 p-1.5 rounded-[8px] ${previewTrayBg}`}>
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
        <div className={`flex items-center gap-2 p-1.5 rounded-[8px] ${previewTrayBg}`}>
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
      title: isId ? "Gaya macOS Sequoia" : "macOS Sequoia Style",
      badge: "macOS Sequoia",
      desc: isId
        ? "Squircle 3D glossy ala macOS Sequoia untuk 40+ app populer"
        : "Glossy 3D macOS Sequoia squircles for 40+ popular apps",
      renderPreview: () => (
        <div className={`flex items-center gap-2 p-1.5 rounded-[8px] ${previewTrayBg}`}>
          <IOSExplorerIcon size={22} />
          <IOSChromeIcon size={22} />
          <IOSVSCodeIcon size={22} />
        </div>
      ),
    },
    {
      id: "glass",
      title: "Liquid Glass",
      badge: isId ? "Kaca Frost" : "Frosted Lens",
      desc: isId
        ? "Squircle kaca bening dengan kilau tepi ala visionOS & Tahoe"
        : "Frosted translucent glass squircles with specular highlights",
      renderPreview: () => renderStyledPreview("glass"),
    },
    {
      id: "monochrome",
      title: isId ? "Monokrom" : "Monochrome",
      badge: isId ? "Minimalis" : "Minimal",
      desc: isId
        ? "Nuansa abu-putih seragam, bersih tanpa warna mencolok"
        : "Uniform grayscale minimal aesthetic without color clutter",
      renderPreview: () => renderStyledPreview("monochrome"),
    },
    {
      id: "tinted",
      title: "Accent Tinted",
      badge: isId ? "Ikut Aksen" : "Matches Accent",
      desc: isId
        ? "Tile gelap dengan tint warna aksen pilihanmu di setiap ikon"
        : "Satin dark tiles tinted dynamically with your chosen accent color",
      renderPreview: () => renderStyledPreview("tinted"),
    },
    {
      id: "circle",
      title: isId ? "Sirkular" : "Circular",
      badge: isId ? "Lencana Bulat" : "Pixel / Round",
      desc: isId
        ? "Ikon terbingkai dalam lencana bulat rapih ala Pixel & Ubuntu"
        : "Apps framed cleanly inside circular medallions like Pixel dock",
      renderPreview: () => renderStyledPreview("circle"),
    },
    {
      id: "retro",
      title: isId ? "Retro Klasik" : "Retro Classic",
      badge: "95 / Classic",
      desc: isId
        ? "Tombol bevel 3D bernuansa komputer desktop era klasik"
        : "Classic desktop 3D beveled button tiles with nostalgic feel",
      renderPreview: () => renderStyledPreview("retro"),
    },
    {
      id: "neon",
      title: "Neon Edge",
      badge: isId ? "Glow Aksen" : "Accent Glow",
      desc: isId
        ? "Tile gelap pekat dengan garis tepi neon mengikuti warna aksen"
        : "Deep dark tiles with crisp neon outline matching your accent",
      renderPreview: () => renderStyledPreview("neon"),
    },
    {
      id: "clay",
      title: "Soft Clay",
      badge: "Neumorphic",
      desc: isId
        ? "Bantalan squircle 3D empuk dengan bayangan taktil halus"
        : "Tactile 3D cushioned squircles with dual soft shadows",
      renderPreview: () => renderStyledPreview("clay"),
    },
    {
      id: "outline",
      title: "Wireframe",
      badge: isId ? "Transparan" : "Minimal Stroke",
      desc: isId
        ? "Garis tepi tipis transparan agar wallpaper di belakang tetap menonjol"
        : "Ultra-clean translucent outline letting your wallpaper shine through",
      renderPreview: () => renderStyledPreview("outline"),
    },
    {
      id: "pastel",
      title: "Pastel Aurora",
      badge: isId ? "Lembut & Cerah" : "Soft Pastel",
      desc: isId
        ? "Tile warna pastel terang lembut bergradasi sesuai warna aksen"
        : "Bright soft pastel squircles tinted subtly with your accent",
      renderPreview: () => renderStyledPreview("pastel"),
    },
    {
      id: "sticker",
      title: "Sticker Card",
      badge: isId ? "Datar & Tegas" : "Crisp Flat",
      desc: isId
        ? "Kartu solid bersih bertepi tegas ala stiker minimalis modern"
        : "Crisp opaque cards with sharp borders and tactile sticker offset",
      renderPreview: () => renderStyledPreview("sticker"),
    },
    {
      id: "contrast",
      title: isId ? "Kontras Tinggi" : "High Contrast",
      badge: isId ? "Keterbacaan" : "Accessibility",
      desc: isId
        ? "Latar solid kontras tinggi hitam/putih agar ikon terbaca sangat jelas"
        : "Bold inverted solid tiles maximizing visibility on any background",
      renderPreview: () => renderStyledPreview("contrast"),
    },
  ];

  return (
    <div className={`flex flex-col gap-3.5 p-5 rounded-[18px] border ${cardBg}`}>
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
              ? "Pilih gaya visual ikon aplikasi pada dock sesuai tampilan taskbar"
              : "Choose visual icon style for dock apps to match your taskbar"}
          </span>
        </div>
      </div>

      {/* Interactive Theme Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
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
                  <span className={`text-[12.5px] font-bold leading-tight ${textTitle}`}>
                    {t.title}
                  </span>
                </div>
                <span
                  className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full inline-block mb-2 ${
                    isLightMode
                      ? "bg-black/[0.06] text-neutral-700"
                      : "bg-white/10 text-white/70"
                  }`}
                >
                  {t.badge}
                </span>
                <p
                  className={`text-[10.5px] leading-relaxed mb-3 ${
                    isSelected
                      ? isLightMode
                        ? "text-neutral-700"
                        : "text-zinc-200"
                      : textSub
                  }`}
                >
                  {t.desc}
                </p>
              </div>

              {/* Miniature Icon Preview */}
              <div
                className={`mt-auto pt-2 border-t flex items-center justify-center ${
                  isLightMode ? "border-black/[0.07]" : "border-white/[0.06]"
                }`}
              >
                {t.renderPreview()}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

