import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { normalizeIconUrl } from "../../navbar/groups/appIcons";
import { Settings, ExternalLink } from "lucide-react";

interface TrayApp {
  id: string;
  name: string;
  icon?: string;
  tooltip?: string;
  hwnd?: number;
}

interface TrayFlyoutViewProps {
  onClose: () => void;
}

export const TrayFlyoutView: React.FC<TrayFlyoutViewProps> = ({ onClose }) => {
  const [runningApps, setRunningApps] = useState<TrayApp[]>([]);

  useEffect(() => {
    // Collect running windows to populate tray app icons
    invoke<any[]>("get_running_windows")
      .then((wins) => {
        if (Array.isArray(wins) && wins.length > 0) {
          const map = new Map<string, TrayApp>();
          wins.forEach((w) => {
            const p = w.process_name?.replace(/\.exe$/i, "") || "App";
            if (!map.has(p)) {
              map.set(p, {
                id: `tray-${w.hwnd || p}`,
                name: p,
                icon: normalizeIconUrl(w.icon_base64),
                tooltip: w.title || p,
                hwnd: w.hwnd,
              });
            }
          });
          setRunningApps(Array.from(map.values()).slice(0, 16));
        }
      })
      .catch(() => {});
  }, []);

  const handleOpenTaskbarSettings = () => {
    invoke("launch_target", { target: "ms-settings:taskbar" }).catch(() => {});
    onClose();
  };

  const handleAppClick = (app: TrayApp) => {
    if (app.hwnd) {
      invoke("activate_or_toggle_window", { hwnd: app.hwnd }).catch(() => {});
    }
    onClose();
  };

  return (
    <div className="flex flex-col h-full select-none text-[var(--taskbar-text)] justify-between">
      {/* Header */}
      <div className="flex items-center justify-between h-7 px-1 border-b border-[var(--taskbar-separator)] pb-1.5">
        <span className="text-[12px] font-semibold tracking-tight text-[var(--taskbar-text)]">
          Ikon tersembunyi
        </span>
        <button
          type="button"
          onClick={handleOpenTaskbarSettings}
          title="Pengaturan taskbar"
          className="w-6 h-6 rounded-md hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text-muted)] hover:text-white transition-colors cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Grid of Tray Icons (Board 89 / 93) */}
      <div className="flex-1 py-2 grid grid-cols-4 gap-2 items-center justify-items-center overflow-y-auto custom-scrollbar">
        {runningApps.length === 0 ? (
          <div className="col-span-4 py-8 text-center text-[11px] text-[var(--taskbar-text-muted)]">
            Tidak ada ikon tersembunyi
          </div>
        ) : (
          runningApps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => handleAppClick(app)}
              title={app.tooltip || app.name}
              className="w-10 h-10 rounded-xl bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] active:scale-95 flex items-center justify-center transition-all cursor-pointer group"
            >
              {app.icon ? (
                <img
                  src={app.icon}
                  alt={app.name}
                  className="w-5 h-5 object-contain group-hover:scale-105 transition-transform"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const fb = e.currentTarget.parentElement?.querySelector(".tray-app-fallback") as HTMLElement;
                    if (fb) fb.style.display = "inline";
                  }}
                />
              ) : null}
              <span
                className="tray-app-fallback text-[11px] font-bold text-[var(--taskbar-accent)]"
                style={{ display: app.icon ? "none" : "inline" }}
              >
                {app.name.slice(0, 1).toUpperCase()}
              </span>
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--taskbar-separator)] pt-2 flex items-center justify-center">
        <button
          type="button"
          onClick={handleOpenTaskbarSettings}
          className="text-[11px] text-[var(--taskbar-text-muted)] hover:text-[var(--taskbar-text)] flex items-center gap-1 transition-colors cursor-pointer"
        >
          <span>Pengaturan taskbar Windows</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
