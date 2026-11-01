import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tooltip } from "../../ui/Tooltip";
import { WindowPreviewCard, WindowPreviewItem } from "../WindowPreviewCard";
import { AnimatePresence } from "framer-motion";

export interface NavbarAppItem {
  id: string;
  name: string;
  icon?: string;
  iconType?: "folder" | "browser" | "code" | "terminal" | "settings" | "spotify" | "discord" | "whatsapp" | "brave";
  isRunning: boolean;
  isActive: boolean;
  hwnd?: number;
  windows?: WindowPreviewItem[];
}

interface RunningWindowInfo {
  hwnd: number;
  title: string;
  process_name: string;
  is_active: boolean;
  is_minimized: boolean;
}

interface PinnedAppsGroupProps {
  apps?: NavbarAppItem[];
  iconSize?: number;
  magnifyOnHover?: boolean;
  windowPreviews?: boolean;
  accentColor?: string;
  onAppClick?: (app: NavbarAppItem) => void;
}

// Crisp official logos for Windows applications
const ExplorerIcon = () => (
  <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
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

const VSCodeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 256 256" fill="none">
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

const TerminalIcon = () => (
  <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
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

const SettingsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
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

const DEFAULT_PINNED_APPS: NavbarAppItem[] = [
  {
    id: "explorer",
    name: "File Explorer",
    iconType: "folder",
    isRunning: false,
    isActive: false,
  },
  {
    id: "chrome",
    name: "Google Chrome",
    iconType: "browser",
    isRunning: false,
    isActive: false,
  },
  {
    id: "vscode",
    name: "Visual Studio Code",
    iconType: "code",
    isRunning: false,
    isActive: false,
  },
  {
    id: "terminal",
    name: "Terminal",
    iconType: "terminal",
    isRunning: false,
    isActive: false,
  },
  {
    id: "settings",
    name: "Settings",
    iconType: "settings",
    isRunning: false,
    isActive: false,
  },
];

export const PinnedAppsGroup: React.FC<PinnedAppsGroupProps> = ({
  apps = DEFAULT_PINNED_APPS,
  iconSize = 40,
  magnifyOnHover = false,
  windowPreviews = true,
  accentColor = "#0a84ff",
  onAppClick,
}) => {
  const [hoveredAppId, setHoveredAppId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const [runningWindows, setRunningWindows] = useState<RunningWindowInfo[]>([]);

  // Synchronize real running windows from Windows system
  useEffect(() => {
    let isCancelled = false;
    const syncWindows = async () => {
      try {
        const windows = await invoke<RunningWindowInfo[]>("get_running_windows");
        if (!isCancelled && windows) {
          setRunningWindows(windows);
        }
      } catch {}
    };

    syncWindows();
    const interval = setInterval(syncWindows, 1200);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Compute live state for pinned apps
  const liveApps = apps.map((app) => {
    const procMatch = (pattern: string) =>
      runningWindows.find((w) => w.process_name.toLowerCase().includes(pattern.toLowerCase()));

    let matchingWin: RunningWindowInfo | undefined;
    switch (app.id) {
      case "explorer":
        matchingWin = procMatch("explorer");
        break;
      case "chrome":
        matchingWin = procMatch("chrome");
        break;
      case "vscode":
        matchingWin = procMatch("code");
        break;
      case "terminal":
        matchingWin =
          procMatch("windowsterminal") || procMatch("cmd") || procMatch("powershell");
        break;
      case "settings":
        matchingWin = procMatch("systemsettings") || procMatch("applicationframehost");
        break;
      case "spotify":
        matchingWin = procMatch("spotify");
        break;
      case "discord":
        matchingWin = procMatch("discord");
        break;
      default:
        matchingWin = procMatch(app.id);
        break;
    }

    const isRunning = matchingWin !== undefined;
    const isActive = matchingWin?.is_active ?? false;
    const hwnd = matchingWin?.hwnd;
    const title = matchingWin?.title || app.name;

    const windowsList: WindowPreviewItem[] = isRunning && matchingWin
      ? [{ id: `win-${matchingWin.hwnd}`, title: matchingWin.title }]
      : app.windows || [];

    return {
      ...app,
      name: title,
      isRunning,
      isActive,
      hwnd,
      windows: windowsList,
    };
  });

  const renderAppIcon = (app: NavbarAppItem) => {
    switch (app.iconType) {
      case "folder":
        return <ExplorerIcon />;
      case "browser":
        return (
          <img
            src="/logo/chrome.png"
            alt={app.name}
            draggable={false}
            className="w-[22px] h-[22px] object-contain drop-shadow"
          />
        );
      case "code":
        return <VSCodeIcon />;
      case "terminal":
        return <TerminalIcon />;
      case "settings":
        return <SettingsIcon />;
      case "spotify":
        return (
          <img
            src="/logo/spotify.png"
            alt={app.name}
            draggable={false}
            className="w-[22px] h-[22px] object-contain drop-shadow"
          />
        );
      case "discord":
        return (
          <img
            src="/logo/discord.webp"
            alt={app.name}
            draggable={false}
            className="w-[22px] h-[22px] object-contain drop-shadow"
          />
        );
      case "whatsapp":
        return (
          <img
            src="/logo/whatsapp.svg"
            alt={app.name}
            draggable={false}
            className="w-[22px] h-[22px] object-contain drop-shadow"
          />
        );
      case "brave":
        return (
          <img
            src="/logo/brave.png"
            alt={app.name}
            draggable={false}
            className="w-[22px] h-[22px] object-contain drop-shadow"
          />
        );
      default:
        if (app.icon) {
          return (
            <img
              src={app.icon}
              alt={app.name}
              draggable={false}
              className="w-[22px] h-[22px] object-contain drop-shadow"
            />
          );
        }
        return <ExplorerIcon />;
    }
  };

  const handleMouseEnter = (app: NavbarAppItem) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (windowPreviews && app.isRunning && (app.windows?.length ?? 0) > 0) {
      hoverTimeoutRef.current = window.setTimeout(() => {
        setHoveredAppId(app.id);
      }, 250);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredAppId(null);
    }, 200);
  };

  return (
    <div className="flex items-center gap-1 shrink-0">
      {liveApps.map((app) => {
        const btnStyle: React.CSSProperties = {
          width: `${iconSize}px`,
          height: `${iconSize}px`,
        };

        const hoverTransform = magnifyOnHover
          ? "hover:scale-[1.18] hover:-translate-y-1"
          : "hover:bg-white/[0.08]";

        const isShowingPreview = hoveredAppId === app.id;

        return (
          <div
            key={app.id}
            onMouseEnter={() => handleMouseEnter(app)}
            onMouseLeave={handleMouseLeave}
            className="relative"
          >
            {/* Window Preview Dialog */}
            <AnimatePresence>
              {isShowingPreview && app.windows && app.windows.length > 0 && (
                <WindowPreviewCard
                  appName={app.name}
                  windows={app.windows}
                  accentColor={accentColor}
                  onSelectWindow={() => {
                    setHoveredAppId(null);
                    onAppClick?.(app);
                  }}
                  onCloseWindow={(winId) => {
                    app.windows = app.windows?.filter((w) => w.id !== winId);
                    if (!app.windows || app.windows.length === 0) {
                      setHoveredAppId(null);
                    }
                  }}
                />
              )}
            </AnimatePresence>

            <Tooltip
              side="top"
              delay={120}
              content={
                isShowingPreview ? null : (
                  <div className="flex items-center gap-1.5 font-medium text-[11.5px]">
                    <span>{app.name}</span>
                    {app.isActive && (
                      <span className="text-[9.5px] px-1 py-0.2 rounded bg-white/20 font-semibold text-white">
                        Aktif
                      </span>
                    )}
                  </div>
                )
              }
            >
              <button
                type="button"
                onClick={() => onAppClick?.(app)}
                aria-label={app.name}
                style={btnStyle}
                className={`relative rounded-[12px] flex items-center justify-center p-0 cursor-pointer shrink-0 transition-all origin-bottom active:scale-95 ${
                  app.isActive
                    ? "bg-white/[0.07] text-white shadow-sm"
                    : "bg-transparent text-white/60 hover:text-white"
                } ${hoverTransform}`}
              >
                {renderAppIcon(app)}

                {/* Indicator: Active 12x3px bar with accent glow */}
                {app.isActive && (
                  <span
                    style={{
                      backgroundColor: accentColor,
                      boxShadow: `0 0 8px ${accentColor}`,
                    }}
                    className="absolute left-1/2 -translate-x-1/2 bottom-[2px] w-[12px] h-[3px] rounded-[2px]"
                  />
                )}

                {/* Indicator: Running dot 4x4px */}
                {app.isRunning && !app.isActive && (
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-[3px] w-[4px] h-[4px] rounded-full bg-white/50 shadow-sm" />
                )}
              </button>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
};
