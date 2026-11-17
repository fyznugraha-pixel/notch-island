import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { normalizeIconUrl } from "../../navbar/groups/appIcons";
import { Settings, ExternalLink, RefreshCw, ChevronUp, X } from "lucide-react";
import {
  TrayBackgroundAppEntry,
  CloseTrayAppResult,
  launchSystemTarget,
  launchWindowsApp,
} from "../../../services/taskbarLaunchService";
import { useTaskbarLang, tx } from "../../../services/taskbarI18n";
import { Tooltip } from "../../ui/Tooltip";

export interface TrayItemEntry extends TrayBackgroundAppEntry {
  is_system_tray?: boolean;
  tray_item_id?: string | null;
  tooltip?: string | null;
}

interface TrayFlyoutViewProps {
  onClose: () => void;
}

const TRAY_CACHE_TTL_MS = 1200;
const MAX_RENDERED_TRAY_ITEMS = 48;

let cachedTrayApps: TrayItemEntry[] | null = null;
let cachedTrayAppsAt = 0;
let inflightTrayAppsPromise: Promise<TrayItemEntry[]> | null = null;

async function fetchTrayAppsDeduped(force = false): Promise<TrayItemEntry[]> {
  const now = Date.now();
  if (!force && cachedTrayApps !== null && now - cachedTrayAppsAt < TRAY_CACHE_TTL_MS) {
    return cachedTrayApps;
  }
  if (inflightTrayAppsPromise) {
    return inflightTrayAppsPromise;
  }
  const req = invoke<TrayItemEntry[]>("get_tray_background_apps")
    .then((list) => {
      const normalized = Array.isArray(list) ? list.slice(0, MAX_RENDERED_TRAY_ITEMS) : [];
      cachedTrayApps = normalized;
      cachedTrayAppsAt = Date.now();
      return normalized;
    })
    .finally(() => {
      if (inflightTrayAppsPromise === req) {
        inflightTrayAppsPromise = null;
      }
    });
  inflightTrayAppsPromise = req;
  return req;
}

export function prewarmTrayAppsCache(): Promise<TrayItemEntry[]> {
  return fetchTrayAppsDeduped(false).catch(() => cachedTrayApps ?? []);
}

export const TrayFlyoutView: React.FC<TrayFlyoutViewProps> = ({ onClose }) => {
  const lang = useTaskbarLang();
  const [apps, setApps] = useState<TrayItemEntry[]>(() => cachedTrayApps ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(() => cachedTrayApps === null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [closingKeys, setClosingKeys] = useState<Set<string>>(() => new Set());
  const [closeFeedback, setCloseFeedback] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const mountedRef = useRef(true);
  const feedbackTimerRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const loadTrayApps = useCallback((force = false) => {
    if (cachedTrayApps === null) {
      setIsLoading(true);
    } else if (force) {
      setIsRefreshing(true);
    }
    setLoadError(false);

    fetchTrayAppsDeduped(force)
      .then((list) => {
        if (!mountedRef.current) return;
        setApps(list);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        if (cachedTrayApps === null) {
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!mountedRef.current) return;
        setIsLoading(false);
        setIsRefreshing(false);
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadTrayApps(false);

    const unlisten = listen<{ isOpen?: boolean; target?: string }>(
      "taskbar-flyout-state-changed",
      (ev) => {
        if (ev.payload?.isOpen && ev.payload?.target === "tray") {
          loadTrayApps(false);
        }
      }
    );

    return () => {
      mountedRef.current = false;
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      unlisten.then((fn) => fn());
    };
  }, [loadTrayApps]);

  const getTrayItemKey = (app: TrayItemEntry) =>
    `${app.pid}-${app.process_name}-${app.tray_item_id ?? ""}`;

  const showFeedback = useCallback((kind: "error" | "ok", text: string) => {
    setCloseFeedback({ kind, text });
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setCloseFeedback(null);
    }, 3200);
  }, []);

  const handleOpenTaskbarSettings = () => {
    launchSystemTarget("ms-settings:taskbar").catch(() => {});
    onClose();
  };

  const handleOpenNativeOverflow = () => {
    invoke("open_windows_tray_overflow_from_flyout").catch(() => {});
  };

  const handleAppClick = (app: TrayItemEntry) => {
    if (app.is_system_tray) {
      invoke("invoke_system_tray_item", {
        itemId: app.tray_item_id ?? null,
        name: app.tooltip || app.name,
        exePath: app.exe_path || null,
        hwnd: app.hwnd ?? null,
      }).catch(() => {});
      return;
    }
    if (app.hwnd) {
      invoke("activate_or_toggle_window", { hwnd: app.hwnd }).catch(() => {});
    } else if (app.exe_path) {
      launchWindowsApp({ target_path: app.exe_path }).catch(() => {});
    }
    onClose();
  };

  const handleAppContextMenu = (e: React.SyntheticEvent, app: TrayItemEntry) => {
    e.preventDefault();
    e.stopPropagation();
    invoke("open_system_tray_item_menu", {
      itemId: app.tray_item_id ?? null,
      name: app.tooltip || app.name,
      exePath: app.exe_path || null,
      hwnd: app.hwnd ?? null,
    }).catch(() => {});
  };

  const handleCloseApp = async (e: React.SyntheticEvent, app: TrayItemEntry) => {
    e.preventDefault();
    e.stopPropagation();
    const key = getTrayItemKey(app);
    if (!app.can_close || closingKeys.has(key)) return;

    const displayName = app.tooltip || app.name;
    setClosingKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    try {
      const res = await invoke<CloseTrayAppResult>("close_tray_background_app", {
        pid: app.pid,
        processName: app.process_name,
        exePath: app.exe_path || null,
      });
      if (!mountedRef.current) return;

      if (res?.closed) {
        const closedProcLower = app.process_name.toLowerCase();
        const remaining = (cachedTrayApps ?? apps).filter(
          (item) => !(item.pid === app.pid && item.process_name.toLowerCase() === closedProcLower)
        );
        cachedTrayApps = remaining;
        cachedTrayAppsAt = Date.now();
        setApps(remaining);
        showFeedback("ok", tx(lang, `Closed ${displayName}`, `${displayName} ditutup`));
        if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = window.setTimeout(() => {
          if (mountedRef.current) loadTrayApps(true);
        }, 280);
      } else {
        showFeedback(
          "error",
          res?.requires_admin
            ? tx(lang, `${displayName} needs Administrator permission to close.`, `${displayName} butuh izin Administrator untuk ditutup.`)
            : tx(lang, `Could not close ${displayName}.`, `Gagal menutup ${displayName}.`)
        );
      }
    } catch {
      if (mountedRef.current) {
        showFeedback("error", tx(lang, `Could not close ${displayName}.`, `Gagal menutup ${displayName}.`));
      }
    } finally {
      if (mountedRef.current) {
        setClosingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    }
  };

  const handleAppKeyDown = (e: React.KeyboardEvent, app: TrayItemEntry) => {
    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      handleAppContextMenu(e, app);
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && app.can_close) {
      void handleCloseApp(e, app);
    }
  };

  const focusRingClass =
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--taskbar-accent)]";

  return (
    <div className="flex flex-col h-full select-none text-[var(--taskbar-text)] justify-between">
      {/* Header */}
      <div className="flex items-center justify-between h-7 px-1 border-b border-[var(--taskbar-separator)] pb-1.5 gap-1">
        <span className="text-[12px] font-semibold tracking-tight text-[var(--taskbar-text)] truncate">
          {tx(lang, "System Tray", "Tray Sistem")}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip
            content={tx(
              lang,
              "Open native Windows tray overflow (^)",
              "Buka tray Windows asli (^)"
            )}
            allowFlip
          >
            <button
              type="button"
              onClick={handleOpenNativeOverflow}
              aria-label={tx(
                lang,
                "Open native Windows tray overflow",
                "Buka tray Windows asli"
              )}
              className={`h-6 px-1.5 rounded-md hover:bg-[var(--taskbar-chip-hover)] flex items-center gap-0.5 text-[10.5px] font-medium text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] transition-colors cursor-pointer ${focusRingClass}`}
            >
              <ChevronUp className="w-3 h-3" aria-hidden="true" />
              <span>Windows</span>
            </button>
          </Tooltip>
          <Tooltip content={tx(lang, "Refresh", "Muat ulang")} allowFlip>
            <button
              type="button"
              onClick={() => loadTrayApps(true)}
              aria-label={tx(
                lang,
                "Refresh tray and background apps list",
                "Muat ulang daftar ikon tray dan aplikasi"
              )}
              className={`w-6 h-6 rounded-md hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] transition-colors cursor-pointer ${focusRingClass}`}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
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
              className={`w-6 h-6 rounded-md hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] transition-colors cursor-pointer ${focusRingClass}`}
            >
              <Settings className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Grid of System Tray Icons & Background / Minimized Apps */}
      <div className="flex-1 py-2 px-1.5 grid grid-cols-4 gap-2 content-start items-center justify-items-center overflow-y-auto overflow-x-hidden custom-scrollbar">
        {isLoading && apps.length === 0 ? (
          <div className="col-span-4 w-full grid grid-cols-4 gap-2 justify-items-center" aria-live="polite">
            <span className="sr-only">
              {tx(lang, "Loading system tray icons...", "Memuat ikon system tray...")}
            </span>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-10 h-10 rounded-xl bg-[var(--taskbar-chip)] animate-pulse" />
            ))}
          </div>
        ) : loadError && apps.length === 0 ? (
          <div className="col-span-4 py-7 px-2 flex flex-col items-center gap-2 text-center">
            <span className="text-[11px] text-[var(--taskbar-text-2)]">
              {tx(
                lang,
                "Could not read system tray apps.",
                "Gagal membaca daftar aplikasi tray."
              )}
            </span>
            <button
              type="button"
              onClick={() => loadTrayApps(true)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] text-[var(--taskbar-text)] cursor-pointer ${focusRingClass}`}
            >
              {tx(lang, "Retry", "Coba lagi")}
            </button>
          </div>
        ) : apps.length === 0 ? (
          <div className="col-span-4 py-7 px-2 flex flex-col items-center gap-2 text-center">
            <span className="text-[11px] text-[var(--taskbar-text-2)]">
              {tx(
                lang,
                "No tray or background apps detected",
                "Tidak ada ikon tray atau aplikasi latar belakang"
              )}
            </span>
            <button
              type="button"
              onClick={handleOpenNativeOverflow}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] text-[var(--taskbar-text)] cursor-pointer ${focusRingClass}`}
            >
              {tx(lang, "Open Windows Tray (^)", "Buka Tray Windows (^)")}
            </button>
          </div>
        ) : (
          apps.map((app) => {
            const itemKey = getTrayItemKey(app);
            const isClosing = closingKeys.has(itemKey);
            const iconUrl = normalizeIconUrl(app.icon_base64);
            const displayName = app.tooltip || app.name;
            const statusHint = app.is_system_tray
              ? tx(lang, "Right-click for menu", "Klik kanan untuk menu")
              : app.hwnd
              ? app.is_minimized
                ? tx(lang, "Minimized", "Diminimalkan")
                : tx(lang, "Running", "Berjalan")
              : tx(lang, "Background", "Latar belakang");

            return (
              <div key={itemKey} className={`relative group w-10 h-10 ${isClosing ? "opacity-50" : ""}`}>
                <Tooltip content={`${displayName} (${statusHint})`} allowFlip>
                  <button
                    type="button"
                    onClick={() => handleAppClick(app)}
                    onContextMenu={(e) => handleAppContextMenu(e, app)}
                    onKeyDown={(e) => handleAppKeyDown(e, app)}
                    disabled={isClosing}
                    aria-label={`${displayName} (${statusHint})`}
                    className={`w-full h-full rounded-xl bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] active:scale-95 flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed relative ${focusRingClass}`}
                  >
                    {iconUrl ? (
                      <img
                        src={iconUrl}
                        alt={displayName}
                        width={20}
                        height={20}
                        className="w-5 h-5 object-contain group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <span className="text-[11px] font-bold text-[var(--taskbar-link)]">
                        {displayName.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    {(app.is_system_tray || app.is_background_tray) && (
                      <span
                        aria-hidden="true"
                        className={`absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ${
                          app.is_system_tray
                            ? "bg-[var(--taskbar-accent)]"
                            : "bg-[var(--taskbar-text-muted)]"
                        }`}
                      />
                    )}
                  </button>
                </Tooltip>
                {app.can_close && (
                  <Tooltip content={tx(lang, `Close ${displayName}`, `Tutup ${displayName}`)} allowFlip>
                    <button
                      type="button"
                      onClick={(e) => void handleCloseApp(e, app)}
                      disabled={isClosing}
                      aria-label={tx(lang, `Close ${displayName}`, `Tutup ${displayName}`)}
                      className={`absolute -top-1 -right-1 z-20 w-4 h-4 rounded-full bg-[var(--taskbar-card)] border border-[var(--taskbar-border)] text-[var(--taskbar-text-2)] hover:bg-rose-500 hover:border-rose-500 hover:text-white shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed ${focusRingClass}`}
                    >
                      <X className="w-2.5 h-2.5" strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </Tooltip>
                )}
              </div>
            );
          })
        )}
      </div>

      {closeFeedback && (
        <div
          role="status"
          className={`mb-1.5 px-2 py-1 rounded-lg text-[10.5px] font-medium truncate text-center ${
            closeFeedback.kind === "error"
              ? "bg-[var(--taskbar-danger-bg)] text-[var(--taskbar-danger-text)]"
              : "bg-[var(--taskbar-chip)] text-[var(--taskbar-text-2)]"
          }`}
        >
          {closeFeedback.text}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-[var(--taskbar-separator)] pt-2 flex items-center justify-center">
        <button
          type="button"
          onClick={handleOpenTaskbarSettings}
          className={`text-[11px] text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] flex items-center gap-1 transition-colors cursor-pointer rounded px-1 ${focusRingClass}`}
        >
          <span>{tx(lang, "Windows taskbar settings", "Pengaturan taskbar Windows")}</span>
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
