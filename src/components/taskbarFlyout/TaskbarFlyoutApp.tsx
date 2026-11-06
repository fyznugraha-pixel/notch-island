import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCachedNavbarConfigSync } from "../../services/navbarConfigService";
import { SoundOutputMixerView } from "./views/SoundOutputMixerView";
import { QuickSettingsView } from "./views/QuickSettingsView";
import { NotificationsCalendarView } from "./views/NotificationsCalendarView";
import { StartMenuView } from "./views/StartMenuView";
import { SearchView } from "./views/SearchView";

interface FlyoutStatePayload {
  isOpen: boolean;
  target: string;
  theme?: "solid" | "liquid";
  width?: number;
  height?: number;
}

export const TaskbarFlyoutApp: React.FC = () => {
  const [target, setTarget] = useState<string>("volume");
  const [theme, setTheme] = useState<"solid" | "liquid">(() => {
    const cfg = getCachedNavbarConfigSync();
    return cfg.style === "liquid" ? "liquid" : "solid";
  });

  const syncStateFromRust = useCallback(async () => {
    try {
      const st = await invoke<{ isOpen: boolean; target: string }>(
        "get_taskbar_flyout_state"
      );
      if (st && st.target) {
        setTarget(st.target);
      }
    } catch {}
  }, []);

  useEffect(() => {
    // 1. Immediately sync active target from Rust on mount
    syncStateFromRust();

    // 2. Esc key dismiss handler
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        invoke("close_taskbar_flyout").catch(() => {});
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // 3. Re-sync on window focus
    const handleFocus = () => {
      syncStateFromRust();
    };
    window.addEventListener("focus", handleFocus);

    // 4. Listen to state changes from Rust window manager
    const unlisten = listen<FlyoutStatePayload>(
      "taskbar-flyout-state-changed",
      (event) => {
        if (event.payload) {
          if (event.payload.target) {
            setTarget(event.payload.target);
          }
          if (event.payload.theme) {
            setTheme(event.payload.theme);
          }
        }
      }
    );

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focus", handleFocus);
      unlisten.then((fn) => fn());
    };
  }, [syncStateFromRust]);

  const handleClose = () => {
    invoke("close_taskbar_flyout").catch(() => {});
  };

  return (
    <div
      data-taskbar-theme={theme}
      className="w-screen h-screen overflow-hidden bg-transparent flex flex-col select-none p-1.5"
    >
      <div
        role="dialog"
        aria-label={`Gili ${target}`}
        className="gili-flyout-container w-full h-full flex flex-col relative p-3.5 box-border"
      >
        {target === "volume" ? (
          <SoundOutputMixerView
            onClose={handleClose}
            onBack={() => setTarget("quickSettings")}
          />
        ) : target === "quickSettings" ? (
          <QuickSettingsView
            onClose={handleClose}
            onSwitchToVolumeMixer={() => setTarget("volume")}
          />
        ) : target === "notificationsCalendar" ? (
          <NotificationsCalendarView onClose={handleClose} />
        ) : target === "start" ? (
          <StartMenuView
            onClose={handleClose}
            onOpenSearch={() => setTarget("search")}
          />
        ) : target === "search" ? (
          <SearchView onClose={handleClose} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="gili-flyout-card p-5 flex flex-col items-center gap-2 max-w-xs">
              <span className="text-[13px] font-semibold text-[var(--taskbar-text)]">
                Gili Flyout ({target})
              </span>
              <span className="text-[11px] text-[var(--taskbar-text-2)]">
                Tema aktif: <strong className="capitalize">{theme}</strong>
              </span>
              <button
                type="button"
                onClick={handleClose}
                className="gili-flyout-chip px-3 py-1.5 rounded-lg text-[11px] font-medium mt-2 cursor-pointer text-[var(--taskbar-text)]"
              >
                Tutup (Esc)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


