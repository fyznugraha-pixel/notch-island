import React from "react";
import {
  getMacOSIconSrc,
  MacOSIconSlug,
  NavbarAppItem,
  normalizeIconUrl,
  resolveMacOSIconSlug,
} from "./macosIconMap";

export const IOSSquircleWrapper: React.FC<{
  children: React.ReactNode;
  gradient: string;
  size?: number;
}> = ({ children, gradient, size = 26 }) => (
  <div
    style={{
      width: `${size}px`,
      height: `${size}px`,
      background: gradient,
      borderRadius: `${Math.round(size * 0.225)}px`,
      boxShadow:
        "0 2px 5px rgba(0,0,0,0.34), inset 0 1px 0.5px rgba(255,255,255,0.42), inset 0 -1px 1px rgba(0,0,0,0.22)",
    }}
    className="relative flex items-center justify-center shrink-0 overflow-hidden select-none pointer-events-none"
  >
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 45%, rgba(0,0,0,0.08) 100%)",
      }}
    />
    <div className="relative z-10 flex items-center justify-center text-white">
      {children}
    </div>
  </div>
);

interface MacOSSquircleImageProps {
  slug: MacOSIconSlug;
  alt: string;
  size?: number;
}

export const MacOSSquircleImage: React.FC<MacOSSquircleImageProps> = ({
  slug,
  alt,
  size = 26,
}) => (
  <img
    src={getMacOSIconSrc(slug)}
    alt={alt}
    width={size}
    height={size}
    draggable={false}
    decoding="async"
    style={{ width: `${size}px`, height: `${size}px` }}
    className="block shrink-0 object-contain select-none pointer-events-none"
  />
);

export const IOSExplorerIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <MacOSSquircleImage slug="finder" alt="Finder" size={size} />
);

export const IOSChromeIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <MacOSSquircleImage slug="chrome" alt="Google Chrome" size={size} />
);

export const IOSVSCodeIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <MacOSSquircleImage slug="vscode" alt="Visual Studio Code" size={size} />
);

export const IOSTerminalIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <MacOSSquircleImage slug="terminal" alt="Terminal" size={size} />
);

export const IOSSettingsIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <MacOSSquircleImage slug="settings" alt="Settings" size={size} />
);

export const IOSSpotifyIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <MacOSSquircleImage slug="spotify" alt="Spotify" size={size} />
);

export const IOSDiscordIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <MacOSSquircleImage slug="discord" alt="Discord" size={size} />
);

export const IOSWhatsAppIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <MacOSSquircleImage slug="whatsapp" alt="WhatsApp" size={size} />
);

export function renderMacOSAppIcon(app: NavbarAppItem, squircleSize: number): React.ReactNode {
  if (app.iconType === "gili" || app.id.toLowerCase() === "gili") {
    const logoSize = Math.max(14, Math.round(squircleSize * 0.68));
    return (
      <IOSSquircleWrapper
        gradient="linear-gradient(180deg, #1E293B 0%, #0B111C 100%)"
        size={squircleSize}
      >
        <img
          src="/gili-icons/gili-icon.svg"
          alt={app.name}
          width={logoSize}
          height={logoSize}
          draggable={false}
          style={{ width: `${logoSize}px`, height: `${logoSize}px` }}
          className="object-contain drop-shadow pointer-events-none select-none"
        />
      </IOSSquircleWrapper>
    );
  }

  const slug = resolveMacOSIconSlug(app);
  if (slug) {
    return <MacOSSquircleImage slug={slug} alt={app.name} size={squircleSize} />;
  }

  const fallbackIcon = normalizeIconUrl(app.icon);
  if (fallbackIcon) {
    // Frame unmapped Windows .exe icons inside a glossy Sequoia graphite tile so the dock stays uniform.
    const tileSize = Math.max(22, Math.round(squircleSize * 0.93));
    const innerGlyph = Math.max(14, Math.round(tileSize * 0.68));
    return (
      <IOSSquircleWrapper
        gradient="linear-gradient(180deg, #3D3F46 0%, #202227 100%)"
        size={tileSize}
      >
        <img
          src={fallbackIcon}
          alt={app.name}
          width={innerGlyph}
          height={innerGlyph}
          draggable={false}
          style={{ width: `${innerGlyph}px`, height: `${innerGlyph}px` }}
          className="object-contain drop-shadow pointer-events-none select-none"
        />
      </IOSSquircleWrapper>
    );
  }

  return <IOSExplorerIcon size={squircleSize} />;
}
