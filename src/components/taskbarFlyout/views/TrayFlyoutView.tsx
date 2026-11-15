import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { normalizeIconUrl } from "../../navbar/groups/appIcons";
import { Settings, ExternalLink, RefreshCw } from "lucide-react";
import {
  TrayBackgroundAppEntry,
  launchSystemTarget,
  launchWindowsApp,
} from "../../../services/taskbarLaunchService";
import { useTaskbarLang, tx } from "../../../services/taskbarI18n";
import { Tooltip } from "../../ui/Tooltip";

interface TrayFlyoutViewProps {
  onClose: () => void;
}

export const TrayFlyoutView: React.FC<TrayFlyoutViewProps> = ({ onClose }) => {
  const lang = useTaskbarLang();
  const [apps, setApps] = useState<TrayBackgroundAppEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTrayApps = useCallback(() => {
    setIsLoading(true);
    invoke<TrayBackgroundAppEntry[]>("get_tray_background_apps")
      .then((list) => {
        if (Array.isArray(list)) {
          setApps(list.slice(0, 16));
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadTrayApps();

    const unlisten = listen<{ isOpen?: boolean; target?: string }>(
      "taskbar-flyout-state-changed",
      (ev) => {
        if (ev.payload?.isOpen && ev.payload?.target === "tray") {
          loadTrayApps();
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadTrayApps]);

  const handleOpenTaskbarSettings = () => {
    launchSystemTarget("ms-settings:taskbar").catch(() => {});
    onClose();
  };

  const handleAppClick = (app: TrayBackgroundAppEntry) => {
    if (app.hwnd) {
      invoke("activate_or_toggle_window", { hwnd: app.hwnd }).catch(() => {});
    } else if (app.exe_path) {
      launchWindowsApp({ target_path: app.exe_path }).catch(() => {});
    }
    onClose();
  };

  return (
    <div className="flex flex-col h-full select-none text-[var(--taskbar-text)] justify-between">
      {/* Header */}
      <div className="flex items-center justify-between h-7 px-1 border-b border-[var(--taskbar-separator)] pb-1.5">
        <span className="text-[12px] font-semibold tracking-tight text-[var(--taskbar-text)]">
          {tx(lang, "Background Apps", "Aplikasi Latar Belakang")}
        </span>
        <div className="flex items-center gap-1">
          <Tooltip content={tx(lang, "Refresh", "Muat ulang")} allowFlip>
            <button
              type="button"
              onClick={loadTrayApps}
              aria-label={tx(
                lang,
                "Refresh background apps list",
                "Muat ulang daftar aplikasi latar belakang"
              )}
              className="w-6 h-6 rounded-md hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </Tooltip>
          <Tooltip
            content={tx(lang, "Windows taskbar settings", "Pengaturan taskbar Windows")}
            allowFlip
          >
            <button
              type="button"
              onClick={handleOpenTaskbarSettings}
              aria-label={tx(lang, "Windows taskbar settings", "Pengaturan taskbar Windows")}
              className="w-6 h-6 rounded-md hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Grid of Background / Minimized / Active System Apps */}
      <div className="flex-1 py-2 grid grid-cols-4 gap-2 items-center justify-items-center overflow-y-auto custom-scrollbar">
        {isLoading && apps.length === 0 ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-xl bg-[var(--taskbar-chip)] animate-pulse" />
          ))
        ) : apps.length === 0 ? (
          <div className="col-span-4 py-8 text-center text-[11px] text-[var(--taskbar-text-2)]">
            {tx(
              lang,
              "No background apps detected",
              "Tidak ada aplikasi latar belakang terdeteksi"
            )}
          </div>
        ) : (
          apps.map((app) => {
            const iconUrl = normalizeIconUrl(app.icon_base64);
            const statusHint = app.hwnd
              ? app.is_minimized
                ? tx(lang, "Minimized", "Diminimalkan")
                : tx(lang, "Running", "Berjalan")
              : tx(lang, "Background", "Latar belakang");

            return (
              <Tooltip
                key={`${app.pid}-${app.process_name}`}
                content={`${app.name} (${statusHint})`}
                allowFlip
              >
                <button
                  type="button"
                  onClick={() => handleAppClick(app)}
                  aria-label={`${app.name} (${statusHint})`}
                  className="w-10 h-10 rounded-xl bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] active:scale-95 flex items-center justify-center transition-all cursor-pointer group relative"
                >
                  {iconUrl ? (
                    <img
                      src={iconUrl}
                      alt={app.name}
                      className="w-5 h-5 object-contain group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <span className="text-[11px] font-bold text-[var(--taskbar-link)]">
                      {app.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  {app.is_background_tray && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--taskbar-accent)]"
                    />
                  )}
                </button>
              </Tooltip>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--taskbar-separator)] pt-2 flex items-center justify-center">
        <button
          type="button"
          onClick={handleOpenTaskbarSettings}
          className="text-[11px] text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] flex items-center gap-1 transition-colors cursor-pointer"
        >
          <span>{tx(lang, "Windows taskbar settings", "Pengaturan taskbar Windows")}</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
