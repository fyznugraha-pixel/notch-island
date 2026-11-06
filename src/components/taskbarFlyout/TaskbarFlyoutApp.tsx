import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  getCachedNavbarConfigSync,
  subscribeToNavbarConfig,
} from "../../services/navbarConfigService";
import { SoundOutputMixerView } from "./views/SoundOutputMixerView";
import { QuickSettingsView } from "./views/QuickSettingsView";
import { NotificationsCalendarView } from "./views/NotificationsCalendarView";
import { StartMenuView } from "./views/StartMenuView";
import { SearchView } from "./views/SearchView";
import { TrayFlyoutView } from "./views/TrayFlyoutView";

interface FlyoutStatePayload {
  isOpen: boolean;
  target: string;
  theme?: "solid" | "liquid";
  width?: number;
  height?: number;
  backdropUrl?: string | null;
}

export const TaskbarFlyoutApp: React.FC = () => {
  const [target, setTarget] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [theme, setTheme] = useState<"solid" | "liquid">(() => {
    const cfg = getCachedNavbarConfigSync();
    return cfg.style === "liquid" ? "liquid" : "solid";
  });
  const [opacity, setOpacity] = useState<number>(() => {
    const cfg = getCachedNavbarConfigSync();
    return cfg.opacity ?? 100;
  });
  const [desktopBackdropUrl, setDesktopBackdropUrl] = useState<string | null>(null);

  useEffect(() => {
    // 1. Direct synchronous hook called from Rust before show() to guarantee zero view flicker
    (window as any).__setTaskbarFlyoutState = (
      newTarget: string,
      newTheme: "solid" | "liquid",
      backdrop?: string | null
    ) => {
      setTarget(newTarget);
      if (newTheme) setTheme(newTheme);
      if (backdrop) setDesktopBackdropUrl(backdrop);
      const cfg = getCachedNavbarConfigSync();
      if (cfg.opacity !== undefined) setOpacity(cfg.opacity);
      setIsOpen(true);
    };

    (window as any).__resetTaskbarFlyoutState = () => {
      setIsOpen(false);
      setTarget(null);
      setDesktopBackdropUrl(null);
    };

    // 2. Esc key dismiss handler
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        invoke("close_taskbar_flyout").catch(() => {});
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // 3. Instant live sync from Settings
    const unsubscribeConfig = subscribeToNavbarConfig((newCfg) => {
      setTheme(newCfg.style === "liquid" ? "liquid" : "solid");
      if (newCfg.opacity !== undefined) {
        setOpacity(newCfg.opacity);
      }
    });

    // 4. Listen to state changes from Rust window manager
    const unlisten = listen<FlyoutStatePayload>(
      "taskbar-flyout-state-changed",
      (event) => {
        if (event.payload) {
          if (event.payload.isOpen) {
            if (event.payload.target) {
              setTarget(event.payload.target);
            }
            if (event.payload.theme) {
              setTheme(event.payload.theme);
            }
            if (event.payload.backdropUrl !== undefined) {
              setDesktopBackdropUrl(event.payload.backdropUrl);
            }
            const cfg = getCachedNavbarConfigSync();
            if (cfg.opacity !== undefined) setOpacity(cfg.opacity);
            setIsOpen(true);
          } else {
            setIsOpen(false);
            setTarget(null);
            setDesktopBackdropUrl(null);
          }
        }
      }
    );

    return () => {
      delete (window as any).__setTaskbarFlyoutState;
      delete (window as any).__resetTaskbarFlyoutState;
      window.removeEventListener("keydown", handleKeyDown);
      unsubscribeConfig();
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleClose = () => {
    invoke("close_taskbar_flyout").catch(() => {});
  };

  if (!isOpen || !target) {
    return <div className="w-screen h-screen bg-transparent pointer-events-none" />;
  }

  const alpha = Math.max(0.12, Math.min(1, opacity / 100));

  const dynamicSurfaceStyle: React.CSSProperties =
    theme === "liquid"
      ? {
          background: `linear-gradient(180deg, rgba(255, 255, 255, ${(
            0.2 * alpha
          ).toFixed(3)}) 0%, rgba(255, 255, 255, ${(0.07 * alpha).toFixed(
            3
          )}) 50%, rgba(255, 255, 255, ${(0.1 * alpha).toFixed(
            3
          )}) 100%), rgba(22, 16, 72, ${(0.5 * alpha).toFixed(3)})`,
          backdropFilter: "blur(26px) saturate(175%) brightness(1.05)",
          WebkitBackdropFilter: "blur(26px) saturate(175%) brightness(1.05)",
        }
      : {
          background: `rgba(17, 17, 20, ${alpha.toFixed(3)})`,
          backdropFilter:
            alpha < 0.98 ? "blur(24px) saturate(160%)" : "none",
          WebkitBackdropFilter:
            alpha < 0.98 ? "blur(24px) saturate(160%)" : "none",
        };

  return (
    <div
      data-taskbar-theme={theme}
      className="w-screen h-screen overflow-hidden bg-transparent flex flex-col select-none"
    >
      <div
        role="dialog"
        aria-label={`Gili ${target}`}
        style={dynamicSurfaceStyle}
        className="gili-flyout-container w-full h-full flex flex-col relative p-3.5 box-border overflow-hidden"
      >
        {/* Authentic Liquid Glass Wallpaper Blur (Pre-captured, zero delay, zero jump) */}
        {theme === "liquid" && desktopBackdropUrl && (
          <div className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none z-0">
            <img
              src={desktopBackdropUrl}
              alt=""
              className="w-full h-full object-cover select-none pointer-events-none"
              style={{
                filter: "blur(26px) saturate(175%) brightness(1.05)",
                transform: "scale(1.06)",
                opacity: Math.max(0.25, Math.min(1, alpha * 1.15)),
              }}
            />
          </div>
        )}

        <div className="relative z-10 w-full h-full flex flex-col">
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
          ) : target === "tray" ? (
            <TrayFlyoutView onClose={handleClose} />
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
    </div>
  );
};


