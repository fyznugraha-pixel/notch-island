import React from "react";
import { NavbarIconTheme } from "../../../types/navbar";
import { NavbarAppItem, normalizeIconUrl } from "./macosIconMap";
import { renderMacOSAppIcon } from "./MacOSAppIcons";
import { isStyledIconVariant, StyledAppIconFrame } from "./StyledAppIcons";

export type { NavbarAppItem } from "./macosIconMap";
export { normalizeIconUrl } from "./macosIconMap";
export {
  IOSSquircleWrapper,
  MacOSSquircleImage,
  IOSExplorerIcon,
  IOSChromeIcon,
  IOSVSCodeIcon,
  IOSTerminalIcon,
  IOSSettingsIcon,
  IOSSpotifyIcon,
  IOSDiscordIcon,
  IOSWhatsAppIcon,
} from "./MacOSAppIcons";

// ==========================================
// 1. THEME: FLUENT (Modern Vector / Default)
// ==========================================
export const FluentExplorerIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <path
      d="M4 10C4 7.79086 5.79086 6 8 6H19L24 12H40C42.2091 12 44 13.7909 44 16V38C44 40.2091 42.2091 42 40 42H8C5.79086 42 4 40.2091 4 38V10Z"
      fill="#FFA000"
    />
    <path
      d="M4 18H44V38C44 40.2091 42.2091 42 40 42H8C5.79086 42 4 40.2091 4 38V18Z"
      fill="#FFCA28"
    />
    <rect x="18" y="22" width="12" height="14" rx="2" fill="#0288D1" />
    <rect x="21" y="25" width="6" height="2" rx="1" fill="#FFFFFF" />
  </svg>
);

export const FluentVSCodeIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 256 256" fill="none">
    <path
      d="M192.5 247.5L250.5 219.5V36.5L192.5 8.5L96.5 101.5L42.5 60.5L6.5 78.5L64.5 128L6.5 177.5L42.5 195.5L96.5 154.5L192.5 247.5Z"
      fill="#0065A9"
    />
    <path
      d="M192.5 247.5L250.5 219.5V36.5L192.5 8.5L160.5 128L192.5 247.5Z"
      fill="#007ACC"
    />
    <path
      d="M192.5 8.5L96.5 101.5L42.5 60.5L6.5 78.5L64.5 128L192.5 8.5Z"
      fill="#1F9CF0"
    />
    <path
      d="M192.5 247.5L96.5 154.5L42.5 195.5L6.5 177.5L64.5 128L192.5 247.5Z"
      fill="#0065A9"
    />
  </svg>
);

export const FluentTerminalIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <rect width="48" height="48" rx="10" fill="#1E1E1E" />
    <path
      d="M12 16L22 24L12 32"
      stroke="#4AF626"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line x1="24" y1="32" x2="36" y2="32" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

export const FluentSettingsIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="22" fill="#0078D4" />
    <path
      d="M24 16C19.58 16 16 19.58 16 24C16 28.42 19.58 32 24 32C28.42 32 32 28.42 32 24C32 19.58 28.42 16 24 16Z"
      fill="#FFFFFF"
      fillOpacity="0.25"
    />
    <path
      d="M24 19C21.24 19 19 21.24 19 24C19 26.76 21.24 29 24 29C26.76 29 29 26.76 29 24C29 21.24 26.76 19 24 19Z"
      fill="#FFFFFF"
    />
    <circle cx="24" cy="8" r="3" fill="#FFFFFF" />
    <circle cx="24" cy="40" r="3" fill="#FFFFFF" />
    <circle cx="8" cy="24" r="3" fill="#FFFFFF" />
    <circle cx="40" cy="24" r="3" fill="#FFFFFF" />
    <circle cx="12.7" cy="12.7" r="3" fill="#FFFFFF" />
    <circle cx="35.3" cy="35.3" r="3" fill="#FFFFFF" />
    <circle cx="12.7" cy="35.3" r="3" fill="#FFFFFF" />
    <circle cx="35.3" cy="12.7" r="3" fill="#FFFFFF" />
  </svg>
);

export const FluentCalculatorIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <rect x="8" y="4" width="32" height="40" rx="6" fill="#2B2D33" stroke="#525660" strokeWidth="1.5" />
    <rect x="13" y="9" width="22" height="9" rx="2.5" fill="#4FC3F7" />
    <rect x="13" y="22" width="6" height="5" rx="1.5" fill="#E5E7EB" />
    <rect x="21" y="22" width="6" height="5" rx="1.5" fill="#E5E7EB" />
    <rect x="29" y="22" width="6" height="5" rx="1.5" fill="#E5E7EB" />
    <rect x="13" y="29" width="6" height="5" rx="1.5" fill="#E5E7EB" />
    <rect x="21" y="29" width="6" height="5" rx="1.5" fill="#E5E7EB" />
    <rect x="29" y="29" width="6" height="11" rx="1.5" fill="#0078D4" />
    <rect x="13" y="36" width="14" height="4" rx="1.5" fill="#E5E7EB" />
  </svg>
);

// ==========================================
// 2. THEME: ASLI WINDOWS (Native Windows 11 Taskbar)
// ==========================================
export const WindowsExplorerIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <defs>
      <linearGradient id="win11FolderBack" x1="0" y1="6" x2="0" y2="40" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFA000" />
        <stop offset="100%" stopColor="#E65100" />
      </linearGradient>
      <linearGradient id="win11FolderFront" x1="0" y1="17" x2="0" y2="42" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFE082" />
        <stop offset="100%" stopColor="#FFB300" />
      </linearGradient>
      <linearGradient id="win11Doc" x1="14" y1="12" x2="34" y2="30" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#29B6F6" />
        <stop offset="100%" stopColor="#0288D1" />
      </linearGradient>
      <filter id="win11Drop" x="2" y="15" width="44" height="28" filterUnits="userSpaceOnUse">
        <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.25" />
      </filter>
    </defs>
    {/* Back tab folder */}
    <path
      d="M5 9.5C5 7.57 6.57 6 8.5 6H19.2C20.3 6 21.35 6.53 22 7.42L24.2 10.3H40.5C42.43 10.3 44 11.87 44 13.8V36C44 37.93 42.43 39.5 40.5 39.5H8.5C6.57 39.5 5 37.93 5 36V9.5Z"
      fill="url(#win11FolderBack)"
    />
    {/* Document insert */}
    <rect x="15" y="11" width="19" height="15" rx="2" fill="url(#win11Doc)" />
    <line x1="18" y1="15" x2="30" y2="15" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" opacity="0.9" />
    <line x1="18" y1="19" x2="26" y2="19" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" opacity="0.9" />
    {/* Front golden pocket flap with shadow */}
    <path
      d="M4 18C4 16.34 5.34 15 7 15H41C42.66 15 44 16.34 44 18V36.5C44 38.43 42.43 40 40.5 40H7.5C5.57 40 4 38.43 4 36.5V18Z"
      fill="url(#win11FolderFront)"
      filter="url(#win11Drop)"
    />
  </svg>
);

export const WindowsSettingsIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <defs>
      <linearGradient id="win11GearGrad" x1="24" y1="4" x2="24" y2="44" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#0078D4" />
        <stop offset="100%" stopColor="#004E8C" />
      </linearGradient>
    </defs>
    {/* Authentic Windows 11 8-tooth fluent gear */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M21.5 4.5C21.5 3.67 22.17 3 23 3H25C25.83 3 26.5 3.67 26.5 4.5V6.76C27.94 7.15 29.28 7.79 30.47 8.65L32.14 7.23C32.75 6.71 33.67 6.77 34.22 7.37L35.63 8.78C36.23 9.33 36.29 10.25 35.77 10.86L34.35 12.53C35.21 13.72 35.85 15.06 36.24 16.5H38.5C39.33 16.5 40 17.17 40 18V20C40 20.83 39.33 21.5 38.5 21.5H36.24C35.85 22.94 35.21 24.28 34.35 25.47L35.77 27.14C36.29 27.75 36.23 28.67 35.63 29.22L34.22 30.63C33.67 31.23 32.75 31.29 32.14 30.77L30.47 29.35C29.28 30.21 27.94 30.85 26.5 31.24V33.5C26.5 34.33 25.83 35 25 35H23C22.17 35 21.5 34.33 21.5 33.5V31.24C20.06 30.85 18.72 30.21 17.53 29.35L15.86 30.77C15.25 31.29 14.33 31.23 13.78 30.63L12.37 29.22C11.77 28.67 11.71 27.75 12.23 27.14L13.65 25.47C12.79 24.28 12.15 22.94 11.76 21.5H9.5C8.67 21.5 8 20.83 8 20V18C8 17.17 8.67 16.5 9.5 16.5H11.76C12.15 15.06 12.79 13.72 13.65 12.53L12.23 10.86C11.71 10.25 11.77 9.33 12.37 8.78L13.78 7.37C14.33 6.77 15.25 6.71 15.86 7.23L17.53 8.65C18.72 7.79 20.06 7.15 21.5 6.76V4.5ZM24 14C18.48 14 14 18.48 14 24C14 29.52 18.48 34 24 34C29.52 34 34 29.52 34 24C34 18.48 29.52 14 24 14ZM24 18C20.69 18 18 20.69 18 24C18 27.31 20.69 30 24 30C27.31 30 30 27.31 30 24C30 20.69 27.31 18 24 18Z"
      fill="url(#win11GearGrad)"
      transform="scale(1.05) translate(-1.2, 5)"
    />
  </svg>
);

export const WindowsTerminalIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <rect x="3" y="6" width="42" height="36" rx="8" fill="#1C1C1F" stroke="#3A3A3C" strokeWidth="1.5" />
    <path d="M12 16L21 24L12 32" stroke="#4AF626" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="24" y1="32" x2="35" y2="32" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
  </svg>
);

const BRAND_LOGO_MAP: Record<string, string> = {
  browser: "/logo/chrome.png",
  chrome: "/logo/chrome.png",
  gili: "/gili-icons/app-icon/gili-app-icon.svg",
  spotify: "/logo/spotify.png",
  discord: "/logo/discord.webp",
  whatsapp: "/logo/whatsapp.svg",
  brave: "/logo/brave.png",
};

function renderAppImg(src: string, alt: string, sizePx: number, extraShadow = "drop-shadow") {
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
      className={`object-contain select-none pointer-events-none ${extraShadow}`}
    />
  );
}

function renderResolvedGlyph(
  app: NavbarAppItem,
  glyphSize: number,
  preferNativeAppIcon: boolean,
  useWindowsBuiltins: boolean,
  maxGlyphSize?: number
): React.ReactNode {
  if (preferNativeAppIcon && app.icon) {
    return renderAppImg(
      normalizeIconUrl(app.icon)!,
      app.name,
      glyphSize,
      "drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)]"
    );
  }

  const brandSrc = app.iconType ? BRAND_LOGO_MAP[app.iconType] : undefined;
  if (brandSrc) {
    const rawSized = app.iconType === "gili" ? Math.round(glyphSize * 1.06) : glyphSize;
    const sized = maxGlyphSize ? Math.min(maxGlyphSize, rawSized) : rawSized;
    return renderAppImg(brandSrc, app.name, sized);
  }

  switch (app.iconType) {
    case "folder":
      return useWindowsBuiltins ? (
        <WindowsExplorerIcon size={glyphSize} />
      ) : (
        <FluentExplorerIcon size={glyphSize} />
      );
    case "code":
    case "vscode":
      return <FluentVSCodeIcon size={glyphSize} />;
    case "terminal":
      return useWindowsBuiltins ? (
        <WindowsTerminalIcon size={glyphSize} />
      ) : (
        <FluentTerminalIcon size={glyphSize} />
      );
    case "settings":
      return useWindowsBuiltins ? (
        <WindowsSettingsIcon size={glyphSize} />
      ) : (
        <FluentSettingsIcon size={glyphSize} />
      );
    case "calculator":
      if (app.icon) {
        return renderAppImg(normalizeIconUrl(app.icon)!, app.name, glyphSize);
      }
      return <FluentCalculatorIcon size={glyphSize} />;
    default:
      if (app.icon) {
        return renderAppImg(normalizeIconUrl(app.icon)!, app.name, glyphSize);
      }
      return useWindowsBuiltins ? (
        <WindowsExplorerIcon size={glyphSize} />
      ) : (
        <FluentExplorerIcon size={glyphSize} />
      );
  }
}

// ==========================================
// MASTER DISPATCHER: AppIcon & renderAppIcon
// ==========================================
export const AppIcon: React.FC<{
  app: NavbarAppItem;
  theme?: NavbarIconTheme;
  iconSize?: number;
  accentColor?: string;
  isLightSurface?: boolean;
  maxSize?: number;
}> = ({
  app,
  theme = "fluent",
  iconSize = 40,
  accentColor = "#3882F6",
  isLightSurface = false,
  maxSize,
}) => {
  const clampArtwork = (rawPx: number) =>
    maxSize ? Math.min(maxSize, rawPx) : rawPx;

  const innerSize = clampArtwork(Math.max(13, Math.round(iconSize * 0.55)));
  const squircleSize = clampArtwork(Math.max(17, Math.round(iconSize * 0.7)));

  if (theme === "ios") {
    return <>{renderMacOSAppIcon(app, squircleSize)}</>;
  }

  if (isStyledIconVariant(theme)) {
    const innerGlyph = Math.max(11, Math.round(squircleSize * (theme === "circle" ? 0.58 : 0.64)));
    return (
      <StyledAppIconFrame
        variant={theme}
        tileSize={squircleSize}
        accentColor={accentColor}
        isLightSurface={isLightSurface}
      >
        {renderResolvedGlyph(app, innerGlyph, true, theme === "retro")}
      </StyledAppIconFrame>
    );
  }

  if (theme === "windows") {
    const nativePx = clampArtwork(Math.max(14, Math.round(iconSize * 0.6)));
    return <>{renderResolvedGlyph(app, nativePx, true, true, maxSize)}</>;
  }

  return <>{renderResolvedGlyph(app, innerSize, false, false, maxSize)}</>;
};

export const renderAppIcon = (
  app: NavbarAppItem,
  theme: NavbarIconTheme = "fluent",
  iconSize = 40,
  accentColor = "#3882F6",
  isLightSurface = false,
  maxSize?: number
): React.ReactNode => (
  <AppIcon
    app={app}
    theme={theme}
    iconSize={iconSize}
    accentColor={accentColor}
    isLightSurface={isLightSurface}
    maxSize={maxSize}
  />
);

