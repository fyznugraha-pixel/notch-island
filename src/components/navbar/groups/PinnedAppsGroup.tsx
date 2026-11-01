import React from "react";
import { Folder, Globe, Code2, Terminal, Settings } from "lucide-react";
import { Tooltip } from "../../ui/Tooltip";

export interface NavbarAppItem {
  id: string;
  name: string;
  icon?: string;
  iconType?: "folder" | "browser" | "code" | "terminal" | "settings";
  isRunning: boolean;
  isActive: boolean;
}

interface PinnedAppsGroupProps {
  apps?: NavbarAppItem[];
  iconSize?: number;
  magnifyOnHover?: boolean;
  accentColor?: string;
  onAppClick?: (app: NavbarAppItem) => void;
}

const DEFAULT_APPS: NavbarAppItem[] = [
  { id: "explorer", name: "File Explorer", iconType: "folder", isRunning: true, isActive: false },
  { id: "chrome", name: "Google Chrome", iconType: "browser", isRunning: true, isActive: true },
  { id: "vscode", name: "VS Code", iconType: "code", isRunning: true, isActive: false },
  { id: "terminal", name: "Terminal", iconType: "terminal", isRunning: false, isActive: false },
  { id: "settings", name: "Settings", iconType: "settings", isRunning: false, isActive: false },
];

export const PinnedAppsGroup: React.FC<PinnedAppsGroupProps> = ({
  apps = DEFAULT_APPS,
  iconSize = 40,
  magnifyOnHover = false,
  accentColor = "#0a84ff",
  onAppClick,
}) => {
  const renderAppIcon = (app: NavbarAppItem) => {
    switch (app.iconType) {
      case "folder":
        return <Folder size={19} strokeWidth={1.6} />;
      case "browser":
        return <Globe size={19} strokeWidth={1.6} />;
      case "code":
        return <Code2 size={19} strokeWidth={1.6} />;
      case "terminal":
        return <Terminal size={18} strokeWidth={1.6} />;
      case "settings":
        return <Settings size={18} strokeWidth={1.6} />;
      default:
        return <Folder size={19} strokeWidth={1.6} />;
    }
  };

  return (
    <div className="flex items-center gap-1 shrink-0">
      {apps.map((app) => {
        const btnStyle: React.CSSProperties = {
          width: `${iconSize}px`,
          height: `${iconSize}px`,
        };

        const hoverTransform = magnifyOnHover
          ? "hover:scale-[1.18] hover:-translate-y-1"
          : "hover:bg-white/[0.08]";

        return (
          <Tooltip
            key={app.id}
            side="top"
            delay={120}
            content={
              <div className="flex items-center gap-1.5 font-medium text-[11.5px]">
                <span>{app.name}</span>
                {app.isActive && (
                  <span className="text-[9.5px] px-1 py-0.2 rounded bg-white/20 font-semibold text-white">
                    Aktif
                  </span>
                )}
              </div>
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
                <span className="absolute left-1/2 -translate-x-1/2 bottom-[3px] w-[4px] h-[4px] rounded-full bg-white/30" />
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
};
