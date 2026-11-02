import React from "react";
import { NavbarIconTheme } from "../../../types/navbar";

export interface NavbarAppItem {
  id: string;
  name: string;
  icon?: string;
  iconType?: string;
  isRunning?: boolean;
  isActive?: boolean;
  hwnd?: number;
  windows?: any[];
}

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

// ==========================================
// 3. THEME: iOS / macOS (Apple Squircle)
// ==========================================
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
      boxShadow: "0 2px 6px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.4)",
    }}
    className="relative flex items-center justify-center shrink-0 overflow-hidden select-none pointer-events-none"
  >
    {/* Subtle Apple Top Specular Sheen */}
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 65%)",
      }}
    />
    <div className="relative z-10 flex items-center justify-center text-white">
      {children}
    </div>
  </div>
);

export const IOSExplorerIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <IOSSquircleWrapper gradient="linear-gradient(180deg, #38A0F8 0%, #007AFF 100%)" size={size}>
    {/* Authentic macOS Finder Split Smiling Face */}
    <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 32 32" fill="none">
      <defs>
        <clipPath id="finderLeftClip">
          <rect x="0" y="0" width="16" height="32" />
        </clipPath>
      </defs>
      {/* Light sky-blue left half */}
      <rect width="32" height="32" rx="7" fill="#157EFB" />
      <rect width="32" height="32" rx="7" fill="#47A7FF" clipPath="url(#finderLeftClip)" />
      {/* Eyes */}
      <circle cx="10" cy="13" r="1.8" fill="#1C1C1E" />
      <circle cx="22" cy="13" r="1.8" fill="#1C1C1E" />
      {/* Curved Split Nose Line */}
      <path
        d="M16 6V17C16 18.5 14.8 19.5 13.5 19.5H12"
        stroke="#1C1C1E"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Smiling Mouth */}
      <path
        d="M9 21.5C11.5 24.5 20.5 24.5 23 21.5"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  </IOSSquircleWrapper>
);

export const IOSChromeIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <IOSSquircleWrapper gradient="linear-gradient(180deg, #FFFFFF 0%, #F2F2F7 100%)" size={size}>
    {/* Authentic Chrome 4-color aperture on frosted white Apple squircle */}
    <svg width={size * 0.68} height={size * 0.68} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" fill="#EA4335" />
      <path d="M24 24L34 41.32C39.5 38.14 43.2 32.5 43.9 26H24V24Z" fill="#34A853" />
      <path d="M24 24L14 6.68C8.5 9.86 4.8 15.5 4.1 22H24V24Z" fill="#FBBC05" />
      <path d="M24 4C30.6 4 36.4 7.2 40 12.2L24 24V4Z" fill="#EA4335" />
      <path d="M4 24C4 32.8 9.8 40.2 18 43.1L24 24H4Z" fill="#34A853" />
      <circle cx="24" cy="24" r="9" fill="#FFFFFF" />
      <circle cx="24" cy="24" r="7.5" fill="#4285F4" />
    </svg>
  </IOSSquircleWrapper>
);

export const IOSVSCodeIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <IOSSquircleWrapper gradient="linear-gradient(180deg, #24292E 0%, #181A1F 100%)" size={size}>
    <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 256 256" fill="none">
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
  </IOSSquircleWrapper>
);

export const IOSTerminalIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <IOSSquircleWrapper gradient="linear-gradient(180deg, #2C2C2E 0%, #141416 100%)" size={size}>
    <div className="flex items-center gap-0.5 font-mono font-bold">
      <span style={{ fontSize: `${size * 0.44}px` }} className="text-[#30D158] leading-none">
        &gt;
      </span>
      <span style={{ width: `${size * 0.22}px`, height: "2px" }} className="bg-white/90 rounded-full animate-pulse" />
    </div>
  </IOSSquircleWrapper>
);

export const IOSSettingsIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <IOSSquircleWrapper gradient="linear-gradient(135deg, #E5E5EA 0%, #8E8E93 50%, #636366 100%)" size={size}>
    {/* Authentic iOS Mechanical Multi-tooth Gear */}
    <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="16" fill="#D1D1D6" stroke="#48484A" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="6" fill="#48484A" />
      <circle cx="24" cy="24" r="3.5" fill="#E5E5EA" />
      {/* 8 Gear Teeth */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <rect
          key={angle}
          x="21.5"
          y="4.5"
          width="5"
          height="6"
          rx="1.5"
          fill="#48484A"
          transform={`rotate(${angle} 24 24)`}
        />
      ))}
    </svg>
  </IOSSquircleWrapper>
);

export const IOSSpotifyIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <IOSSquircleWrapper gradient="linear-gradient(180deg, #1ED760 0%, #169C46 100%)" size={size}>
    {/* Authentic Spotify Soundwaves */}
    <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
      <path
        d="M4.5 8.5C10 6.8 16.5 7.5 20.5 10"
        stroke="#121212"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M5.5 12.2C10 10.8 15.5 11.4 19 13.5"
        stroke="#121212"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M6.5 16C10 15 14.5 15.4 17.5 17"
        stroke="#121212"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  </IOSSquircleWrapper>
);

export const IOSDiscordIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <IOSSquircleWrapper gradient="linear-gradient(180deg, #5865F2 0%, #4752C4 100%)" size={size}>
    {/* Authentic Discord Clyde Gaming Controller */}
    <svg width={size * 0.64} height={size * 0.64} viewBox="0 0 24 24" fill="#FFFFFF">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  </IOSSquircleWrapper>
);

export const IOSWhatsAppIcon: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <IOSSquircleWrapper gradient="linear-gradient(180deg, #25D366 0%, #1EBE5D 100%)" size={size}>
    {/* Authentic WhatsApp Bubble & Handset */}
    <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="#FFFFFF">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 20.15C10.57 20.15 9.12 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.68 12.05 3.68C14.25 3.68 16.32 4.54 17.87 6.09C19.42 7.64 20.28 9.72 20.27 11.92C20.28 16.46 16.59 20.15 12.05 20.15ZM16.56 14.33C16.31 14.21 15.09 13.61 14.86 13.52C14.64 13.44 14.47 13.4 14.31 13.65C14.14 13.89 13.67 14.45 13.52 14.62C13.38 14.78 13.23 14.8 12.98 14.68C12.73 14.55 11.93 14.29 10.98 13.44C10.24 12.78 9.74 11.97 9.6 11.72C9.45 11.47 9.58 11.34 9.71 11.22C9.82 11.11 9.96 10.93 10.08 10.79C10.21 10.64 10.25 10.54 10.33 10.38C10.41 10.21 10.37 10.07 10.31 9.95C10.25 9.82 9.76 8.62 9.55 8.12C9.35 7.63 9.15 7.7 9 7.69C8.86 7.68 8.69 7.68 8.52 7.68C8.36 7.68 8.09 7.74 7.86 7.99C7.64 8.24 7 8.84 7 10.05C7 11.27 7.88 12.44 8.01 12.61C8.13 12.77 9.75 15.28 12.24 16.35C12.83 16.61 13.29 16.76 13.65 16.88C14.24 17.07 14.78 17.04 15.21 16.98C15.69 16.91 16.68 16.38 16.89 15.8C17.09 15.21 17.09 14.71 17.03 14.61C16.97 14.5 16.81 14.45 16.56 14.33Z" />
    </svg>
  </IOSSquircleWrapper>
);

// ==========================================
// MASTER DISPATCHER: AppIcon & renderAppIcon
// ==========================================
export const AppIcon: React.FC<{
  app: NavbarAppItem;
  theme?: NavbarIconTheme;
  iconSize?: number;
}> = ({ app, theme = "fluent", iconSize = 40 }) => {
  const innerSize = Math.max(20, Math.round(iconSize * 0.55));
  const squircleSize = Math.max(24, Math.round(iconSize * 0.65));

  // 1. iOS Theme
  if (theme === "ios") {
    switch (app.iconType) {
      case "folder":
        return <IOSExplorerIcon size={squircleSize} />;
      case "browser":
      case "chrome":
      case "brave":
        return <IOSChromeIcon size={squircleSize} />;
      case "code":
      case "vscode":
        return <IOSVSCodeIcon size={squircleSize} />;
      case "terminal":
        return <IOSTerminalIcon size={squircleSize} />;
      case "settings":
        return <IOSSettingsIcon size={squircleSize} />;
      case "gili":
        return (
          <IOSSquircleWrapper gradient="linear-gradient(180deg, #18202F 0%, #0B0F14 100%)" size={squircleSize}>
            <img
              src="/gili-icons/gili-icon.svg"
              alt={app.name}
              draggable={false}
              className="w-[20px] h-[20px] object-contain drop-shadow pointer-events-none select-none"
            />
          </IOSSquircleWrapper>
        );
      case "spotify":
        return <IOSSpotifyIcon size={squircleSize} />;
      case "discord":
        return <IOSDiscordIcon size={squircleSize} />;
      case "whatsapp":
        return <IOSWhatsAppIcon size={squircleSize} />;
      default:
        if (app.icon) {
          return (
            <IOSSquircleWrapper gradient="linear-gradient(180deg, #3A3A3C 0%, #1C1C1E 100%)" size={squircleSize}>
              <img
                src={app.icon}
                alt={app.name}
                draggable={false}
                className="w-[18px] h-[18px] object-contain drop-shadow pointer-events-none select-none"
              />
            </IOSSquircleWrapper>
          );
        }
        return <IOSExplorerIcon size={squircleSize} />;
    }
  }

  // 2. Windows Native Theme (100% Authentic Laptop .exe / .lnk / UWP 256x256 Icons)
  const nativePx = Math.max(20, Math.round(iconSize * 0.6));
  if (theme === "windows") {
    if (app.icon) {
      return (
        <img
          src={app.icon}
          alt={app.name}
          draggable={false}
          style={{ width: `${nativePx}px`, height: `${nativePx}px` }}
          className="object-contain select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)]"
        />
      );
    }
    switch (app.iconType) {
      case "folder":
        return <WindowsExplorerIcon size={nativePx} />;
      case "browser":
      case "chrome":
        return (
          <img
            src="/logo/chrome.png"
            alt={app.name}
            draggable={false}
            style={{ width: `${nativePx}px`, height: `${nativePx}px` }}
            className="object-contain select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)]"
          />
        );
      case "code":
      case "vscode":
        return <FluentVSCodeIcon size={nativePx} />;
      case "terminal":
        return <FluentTerminalIcon size={nativePx} />;
      case "settings":
        return <WindowsSettingsIcon size={nativePx} />;
      case "gili":
        return (
          <img
            src="/gili-icons/app-icon/gili-app-icon.svg"
            alt={app.name}
            draggable={false}
            style={{ width: `${nativePx}px`, height: `${nativePx}px` }}
            className="object-contain select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)]"
          />
        );
      case "spotify":
        return (
          <img
            src="/logo/spotify.png"
            alt={app.name}
            draggable={false}
            style={{ width: `${nativePx}px`, height: `${nativePx}px` }}
            className="object-contain select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)]"
          />
        );
      case "discord":
        return (
          <img
            src="/logo/discord.webp"
            alt={app.name}
            draggable={false}
            style={{ width: `${nativePx}px`, height: `${nativePx}px` }}
            className="object-contain select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)]"
          />
        );
      case "whatsapp":
        return (
          <img
            src="/logo/whatsapp.svg"
            alt={app.name}
            draggable={false}
            style={{ width: `${nativePx}px`, height: `${nativePx}px` }}
            className="object-contain select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)]"
          />
        );
      case "brave":
        return (
          <img
            src="/logo/brave.png"
            alt={app.name}
            draggable={false}
            style={{ width: `${nativePx}px`, height: `${nativePx}px` }}
            className="object-contain select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)]"
          />
        );
      default:
        return <WindowsExplorerIcon size={nativePx} />;
    }
  }

  // 3. Default Fluent Theme
  switch (app.iconType) {
    case "folder":
      return <FluentExplorerIcon size={innerSize} />;
    case "browser":
    case "chrome":
      return (
        <img
          src="/logo/chrome.png"
          alt={app.name}
          draggable={false}
          className="w-[22px] h-[22px] object-contain drop-shadow pointer-events-none select-none"
        />
      );
    case "code":
    case "vscode":
      return <FluentVSCodeIcon size={innerSize} />;
    case "terminal":
      return <FluentTerminalIcon size={innerSize} />;
    case "settings":
      return <FluentSettingsIcon size={innerSize} />;
    case "gili":
      return (
        <img
          src="/gili-icons/app-icon/gili-app-icon.svg"
          alt={app.name}
          draggable={false}
          className="w-[24px] h-[24px] object-contain drop-shadow pointer-events-none select-none"
        />
      );
    case "spotify":
      return (
        <img
          src="/logo/spotify.png"
          alt={app.name}
          draggable={false}
          className="w-[22px] h-[22px] object-contain drop-shadow pointer-events-none select-none"
        />
      );
    case "discord":
      return (
        <img
          src="/logo/discord.webp"
          alt={app.name}
          draggable={false}
          className="w-[22px] h-[22px] object-contain drop-shadow pointer-events-none select-none"
        />
      );
    case "whatsapp":
      return (
        <img
          src="/logo/whatsapp.svg"
          alt={app.name}
          draggable={false}
          className="w-[22px] h-[22px] object-contain drop-shadow pointer-events-none select-none"
        />
      );
    case "brave":
      return (
        <img
          src="/logo/brave.png"
          alt={app.name}
          draggable={false}
          className="w-[22px] h-[22px] object-contain drop-shadow pointer-events-none select-none"
        />
      );
    default:
      if (app.icon) {
        return (
          <img
            src={app.icon}
            alt={app.name}
            draggable={false}
            className="w-[22px] h-[22px] object-contain drop-shadow pointer-events-none select-none"
          />
        );
      }
      return <FluentExplorerIcon size={innerSize} />;
  }
};

export const renderAppIcon = (
  app: NavbarAppItem,
  theme: NavbarIconTheme = "fluent",
  iconSize = 40
): React.ReactNode => (
  <AppIcon app={app} theme={theme} iconSize={iconSize} />
);

