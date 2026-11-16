import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import {
  getCachedNavbarConfigSync,
  loadNavbarConfig,
  subscribeToNavbarConfig,
} from "../../services/navbarConfigService";
import type { NavbarConfig } from "../../types/navbar";
import { useTaskbarLang, tx } from "../../services/taskbarI18n";
import { StartMenuView } from "./views/StartMenuView";
import { SearchView } from "./views/SearchView";
const SoundOutputMixerView = React.lazy(() =>
  import("./views/SoundOutputMixerView").then((m) => ({ default: m.SoundOutputMixerView }))
);
const QuickSettingsView = React.lazy(() =>
  import("./views/QuickSettingsView").then((m) => ({ default: m.QuickSettingsView }))
);
const NotificationsCalendarView = React.lazy(() =>
  import("./views/NotificationsCalendarView").then((m) => ({ default: m.NotificationsCalendarView }))
);
const TrayFlyoutView = React.lazy(() =>
  import("./views/TrayFlyoutView").then((m) => ({ default: m.TrayFlyoutView }))
);
import { switchFlyoutTarget } from "../../services/taskbarLaunchService";
import { FrostedGlassOverlay } from "../ui/FrostedGlassOverlay";
import { computeCalibratedGlassPalette } from "../../utils/frostedGlass";

interface FlyoutAnchorInfo {
  originX: number;
  originY: number;
  position?: string;
  seq?: number;
}

interface FlyoutStatePayload {
  isOpen: boolean;
  target: string;
  theme?: "solid" | "liquid";
  isLight?: boolean;
  width?: number;
  height?: number;
  anchor?: FlyoutAnchorInfo;
  closing?: boolean;
}

function buildFlyoutKeyframes(
  pos: string,
  isExit: boolean,
  useGenie: boolean
): Keyframe[] {
  const isVert = pos === "left" || pos === "right";
  if (!useGenie) {
    const slide = 10;
    const dx = pos === "left" ? -slide : pos === "right" ? slide : 0;
    const dy = pos === "top" ? -slide : isVert ? 0 : slide;
    const hidden: Keyframe = {
      opacity: 0,
      transform: `translate3d(${dx}px, ${dy}px, 0px) scale(0.97, 0.97)`,
    };
    const visible: Keyframe = {
      opacity: 1,
      transform: "translate3d(0px, 0px, 0px) scale(1, 1)",
    };
    return isExit ? [visible, hidden] : [hidden, visible];
  }

  const delta = 24;
  const dx = pos === "left" ? -delta : pos === "right" ? delta : 0;
  const dy = pos === "top" ? -delta : isVert ? 0 : delta;
  const rotAxis = isVert ? "rotateY" : "rotateX";
  const tiltDeg = pos === "bottom" || pos === "left" ? 13 : -13;
  const restTransform = `perspective(680px) translate3d(0px, 0px, 0px) ${rotAxis}(0deg) scale(1, 1)`;

  const pinchSx = isVert ? 0.08 : 0.14;
  const pinchSy = isVert ? 0.14 : 0.08;
  const midSx = isVert ? 1.02 : 0.58;
  const midSy = isVert ? 0.58 : 1.02;

  const pinch: Keyframe = {
    opacity: 0,
    offset: isExit ? 1 : 0,
    transform: `perspective(680px) translate3d(${dx}px, ${dy}px, 0px) ${rotAxis}(${tiltDeg}deg) scale(${pinchSx}, ${pinchSy})`,
  };
  const throat: Keyframe = {
    opacity: isExit ? 0.92 : 0.88,
    offset: isExit ? 0.38 : 0.42,
    transform: `perspective(680px) translate3d(${(dx * 0.22).toFixed(1)}px, ${(dy * 0.22).toFixed(1)}px, 0px) ${rotAxis}(${(tiltDeg * 0.35).toFixed(1)}deg) scale(${midSx}, ${midSy})`,
  };
  const full: Keyframe = {
    opacity: 1,
    offset: isExit ? 0 : 1,
    transform: restTransform,
  };
  return isExit ? [full, throat, pinch] : [pinch, throat, full];
}

type ThemePreference = "dark" | "light" | "auto";

function isHexLightColor(hex?: string): boolean {
  if (!hex) return false;
  const cleaned = hex.trim().replace(/^#/, "");
  if (cleaned.length !== 3 && cleaned.length !== 6) return false;
  const full =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : cleaned;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return false;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 >= 0.55;
}

function readStoredThemePref(): ThemePreference {
  try {
    const val = localStorage.getItem("island_theme");
    if (val === "light" || val === "dark" || val === "auto") return val;
  } catch {
    // Ignore storage read errors in restricted contexts
  }
  return "dark";
}

export const TaskbarFlyoutApp: React.FC = () => {
  const lang = useTaskbarLang();
  const [target, setTarget] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [searchInitialTab, setSearchInitialTab] = useState<"all" | "apps">("all");
  const [searchInitialQuery, setSearchInitialQuery] = useState<string>("");
  const targetRef = useRef<string | null>(target);
  const isOpenRef = useRef<boolean>(isOpen);
  targetRef.current = target;
  isOpenRef.current = isOpen;
  const [navbarConfig, setNavbarConfig] = useState<NavbarConfig>(() =>
    getCachedNavbarConfigSync()
  );
  const [theme, setTheme] = useState<"solid" | "liquid">(() => {
    const cfg = getCachedNavbarConfigSync();
    return cfg.style === "liquid" ? "liquid" : "solid";
  });
  const [themePref, setThemePref] = useState<ThemePreference>(() => readStoredThemePref());
  const [systemPrefersLight, setSystemPrefersLight] = useState<boolean>(() => {
    try {
      return window.matchMedia("(prefers-color-scheme: light)").matches;
    } catch {
      return false;
    }
  });
  const [desktopLuminance, setDesktopLuminance] = useState<number | null>(null);
  const [payloadLightOverride, setPayloadLightOverride] = useState<boolean | null>(null);
  const [anchorInfo, setAnchorInfo] = useState<FlyoutAnchorInfo | null>(null);
  const flyoutContainerRef = useRef<HTMLDivElement>(null);
  const flyoutAnimRef = useRef<Animation | null>(null);
  const lastAnimatedSeqRef = useRef<number>(0);
  const anchorInfoRef = useRef<FlyoutAnchorInfo | null>(null);
  const posRef = useRef<string>(navbarConfig.position || "bottom");
  const windowAnimGenieRef = useRef<boolean>(navbarConfig.windowAnimation !== "normal");
  anchorInfoRef.current = anchorInfo;
  posRef.current = anchorInfo?.position || navbarConfig.position || "bottom";
  windowAnimGenieRef.current = navbarConfig.windowAnimation !== "normal";

  const syncThemeFromStore = useCallback(async () => {
    try {
      const store = await load("settings.json");
      const savedTheme = await store.get<string>("opt_theme");
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "auto") {
        setThemePref(savedTheme);
      }
    } catch {
      // Fallback gracefully to cached localStorage preference
    }
  }, []);

  const refreshAutoLuminance = useCallback(async () => {
    try {
      const lum = await invoke<number>("get_desktop_luminance");
      if (typeof lum === "number" && Number.isFinite(lum)) {
        setDesktopLuminance(lum);
      }
    } catch {
      // Fall back to system media query when desktop luminance is unavailable
    }
  }, []);

  const isLight = useMemo(() => {
    if (payloadLightOverride !== null) return payloadLightOverride;
    if (navbarConfig.background === "custom" && navbarConfig.customColor) {
      return isHexLightColor(navbarConfig.customColor);
    }
    if (navbarConfig.background === "black") {
      return false;
    }
    if (themePref === "light") return true;
    if (themePref === "dark") return false;
    if (desktopLuminance !== null) return desktopLuminance >= 0.58;
    return systemPrefersLight;
  }, [
    payloadLightOverride,
    navbarConfig.background,
    navbarConfig.customColor,
    themePref,
    desktopLuminance,
    systemPrefersLight,
  ]);

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-taskbar-light",
      isLight ? "true" : "false"
    );
    document.documentElement.classList.toggle("light", isLight);
  }, [isLight]);

  useEffect(() => {
    void syncThemeFromStore();
    void loadNavbarConfig().then((cfg) => {
      setNavbarConfig(cfg);
      if (cfg.style === "liquid" || cfg.style === "solid") {
        setTheme(cfg.style);
      }
    });

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setSystemPrefersLight(e.matches);
    };
    mediaQuery.addEventListener?.("change", handleMediaChange);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "island_theme") {
        setThemePref(readStoredThemePref());
      }
    };
    window.addEventListener("storage", handleStorage);

    const unlistenSettingsSync = listen<{ type?: string; key?: string; value?: unknown }>(
      "gili-settings-sync",
      (event) => {
        const p = event.payload;
        if (!p) return;
        if (p.type === "setting_key" && p.key === "opt_theme") {
          const val = p.value;
          if (val === "light" || val === "dark" || val === "auto") {
            setThemePref(val);
          }
        } else {
          void syncThemeFromStore();
        }
      }
    );

    return () => {
      mediaQuery.removeEventListener?.("change", handleMediaChange);
      window.removeEventListener("storage", handleStorage);
      unlistenSettingsSync.then((fn) => fn());
    };
  }, [syncThemeFromStore]);

  useEffect(() => {
    if (isOpen && themePref === "auto") {
      void refreshAutoLuminance();
    }
    if (isOpen) {
      void syncThemeFromStore();
    }
  }, [isOpen, themePref, refreshAutoLuminance, syncThemeFromStore]);

  useEffect(() => {
    let cancelled = false;
    let hasLiveStateUpdate = false;

    const applyFlyoutOpen = (
      nextTarget?: string,
      nextTheme?: "solid" | "liquid",
      nextIsLight?: boolean,
      nextAnchor?: FlyoutAnchorInfo
    ) => {
      if (nextTarget) {
        if (nextTarget !== "search") {
          setSearchInitialQuery("");
        }
        targetRef.current = nextTarget;
        setTarget(nextTarget);
      }
      if (nextTheme === "solid" || nextTheme === "liquid") {
        setTheme(nextTheme);
      }
      if (nextAnchor) {
        setAnchorInfo(nextAnchor);
      }
      setPayloadLightOverride(typeof nextIsLight === "boolean" ? nextIsLight : null);
      isOpenRef.current = true;
      setIsOpen(true);
    };

    // 1. Direct synchronous hook called from Rust before show() to guarantee zero view flicker
    (window as any).__setTaskbarFlyoutState = (
      newTarget: string,
      newTheme: "solid" | "liquid",
      newAnchor?: FlyoutAnchorInfo
    ) => {
      hasLiveStateUpdate = true;
      applyFlyoutOpen(newTarget, newTheme, undefined, newAnchor);
    };

    (window as any).__resetTaskbarFlyoutState = () => {
      hasLiveStateUpdate = true;
      isOpenRef.current = false;
      targetRef.current = null;
      setIsOpen(false);
      setTarget(null);
      setSearchInitialTab("all");
      setSearchInitialQuery("");
      setPayloadLightOverride(null);
      setAnchorInfo(null);
    };

    (window as any).__playTaskbarFlyoutClose = () => {
      const el = flyoutContainerRef.current;
      if (!el || typeof el.animate !== "function") return;
      const curPos = posRef.current || "bottom";
      const curAnchor = anchorInfoRef.current;
      const useGenie = windowAnimGenieRef.current;
      if (useGenie) {
        const ox = curAnchor ? `${Math.round(curAnchor.originX)}px` : "50%";
        const oy = curAnchor
          ? `${Math.round(curAnchor.originY)}px`
          : curPos === "top"
          ? "0%"
          : curPos === "left" || curPos === "right"
          ? "50%"
          : "100%";
        el.style.transformOrigin = `${ox} ${oy}`;
      } else {
        el.style.transformOrigin = "50% 50%";
      }
      flyoutAnimRef.current?.cancel();
      flyoutAnimRef.current = el.animate(buildFlyoutKeyframes(curPos, true, useGenie), {
        duration: useGenie ? 170 : 120,
        easing: useGenie
          ? "cubic-bezier(0.36, 0, 0.72, 0.15)"
          : "cubic-bezier(0.32, 0, 0.67, 0)",
        fill: "forwards",
      });
    };

    const pendingState = (window as any).__PENDING_TASKBAR_FLYOUT__ as
      | Partial<FlyoutStatePayload>
      | undefined;
    if (pendingState) {
      delete (window as any).__PENDING_TASKBAR_FLYOUT__;
      if (pendingState.isOpen !== false && pendingState.target) {
        hasLiveStateUpdate = true;
        applyFlyoutOpen(
          pendingState.target,
          pendingState.theme,
          pendingState.isLight,
          pendingState.anchor
        );
      }
    }

    if (!hasLiveStateUpdate) {
      invoke<Partial<FlyoutStatePayload>>("get_taskbar_flyout_state")
        .then((state) => {
          if (cancelled || hasLiveStateUpdate || !state?.isOpen || !state.target) return;
          applyFlyoutOpen(state.target, state.theme, state.isLight, state.anchor);
        })
        .catch(() => {});
    }

    // 2. Esc key dismiss & Start-to-Search typeahead handler
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        invoke("close_taskbar_flyout").catch(() => {});
        return;
      }

      if (
        isOpenRef.current &&
        targetRef.current === "start" &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        setSearchInitialTab("all");
        setSearchInitialQuery((prev) => prev + e.key);
        targetRef.current = "search";
        setTarget("search");
        switchFlyoutTarget("search").catch(() => {});
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // 3. Instant live sync from Settings
    const unsubscribeConfig = subscribeToNavbarConfig((newCfg) => {
      setNavbarConfig(newCfg);
      setTheme(newCfg.style === "liquid" ? "liquid" : "solid");
    });

    // 4. Listen to state changes from Rust window manager
    const unlisten = listen<FlyoutStatePayload>(
      "taskbar-flyout-state-changed",
      (event) => {
        if (event.payload) {
          hasLiveStateUpdate = true;
          if (event.payload.isOpen) {
            applyFlyoutOpen(
              event.payload.target,
              event.payload.theme,
              event.payload.isLight,
              event.payload.anchor
            );
          } else if (!event.payload.closing) {
            isOpenRef.current = false;
            targetRef.current = null;
            setIsOpen(false);
            setTarget(null);
            setSearchInitialQuery("");
            setPayloadLightOverride(null);
            setAnchorInfo(null);
          }
        }
      }
    );

    return () => {
      cancelled = true;
      delete (window as any).__setTaskbarFlyoutState;
      delete (window as any).__resetTaskbarFlyoutState;
      delete (window as any).__playTaskbarFlyoutClose;
      window.removeEventListener("keydown", handleKeyDown);
      unsubscribeConfig();
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleClose = () => {
    invoke("close_taskbar_flyout").catch(() => {});
  };

  const consumeInitialQuery = useCallback(() => {
    setSearchInitialQuery("");
  }, []);

  const handleSwitchTarget = (
    nextTarget: "start" | "search" | "tray" | "quickSettings" | "volume" | "notificationsCalendar",
    initialSearchTab: "all" | "apps" = "all",
    initialQuery?: string
  ) => {
    if (nextTarget === "search") {
      setSearchInitialTab(initialSearchTab);
      if (initialQuery) {
        setSearchInitialQuery((prev) => prev + initialQuery);
      }
    } else {
      setSearchInitialQuery("");
    }
    targetRef.current = nextTarget;
    setTarget(nextTarget);
    switchFlyoutTarget(nextTarget).catch(() => {});
  };

  useLayoutEffect(() => {
    if (!isOpen || !target) return;
    const el = flyoutContainerRef.current;
    if (!el || typeof el.animate !== "function") return;

    const seq = anchorInfo?.seq ?? 0;
    if (seq > 0 && seq === lastAnimatedSeqRef.current) return;
    lastAnimatedSeqRef.current = seq;

    const pos = anchorInfo?.position || navbarConfig.position || "bottom";
    const useGenie = navbarConfig.windowAnimation !== "normal";
    if (useGenie) {
      const ox = anchorInfo ? `${Math.round(anchorInfo.originX)}px` : "50%";
      const oy = anchorInfo
        ? `${Math.round(anchorInfo.originY)}px`
        : pos === "top"
        ? "0%"
        : pos === "left"
        ? "50%"
        : pos === "right"
        ? "50%"
        : "100%";
      el.style.transformOrigin = `${ox} ${oy}`;
    } else {
      el.style.transformOrigin = "50% 50%";
    }

    flyoutAnimRef.current?.cancel();
    flyoutAnimRef.current = el.animate(buildFlyoutKeyframes(pos, false, useGenie), {
      duration: useGenie ? 240 : 160,
      easing: useGenie
        ? "cubic-bezier(0.22, 1, 0.36, 1)"
        : "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "none",
    });
  }, [isOpen, target, anchorInfo, theme, navbarConfig.position, navbarConfig.windowAnimation]);

  if (!isOpen || !target) {
    return <div className="w-screen h-screen bg-transparent pointer-events-none" />;
  }

  return (
    <div
      data-taskbar-theme={theme}
      data-taskbar-light={isLight ? "true" : "false"}
      className="w-screen h-screen overflow-hidden bg-transparent flex flex-col select-none"
    >
      <div
        ref={flyoutContainerRef}
        role="dialog"
        aria-label={`Gili ${target}`}
        className="gili-flyout-container w-full h-full flex flex-col relative p-3.5 box-border overflow-hidden"
      >
        {/* Notch-calibrated frosted grain & specular overlay layered over native Win11 DWM Acrylic */}
        {theme === "liquid" && (
          <FrostedGlassOverlay
            palette={computeCalibratedGlassPalette({
              opacity: 0.78,
              blur: 68,
              isLight,
              customColor:
                navbarConfig.background === "custom"
                  ? navbarConfig.customColor
                  : undefined,
            })}
            isLight={isLight}
            borderRadius="inherit"
            showBevelBorder={false}
          />
        )}

        <div className="relative z-10 w-full h-full flex flex-col">
          <React.Suspense fallback={null}>
            {target === "volume" ? (
              <SoundOutputMixerView
                onClose={handleClose}
                onBack={() => handleSwitchTarget("quickSettings")}
              />
            ) : target === "quickSettings" ? (
              <QuickSettingsView
                onClose={handleClose}
                onSwitchToVolumeMixer={() => handleSwitchTarget("volume")}
              />
            ) : target === "notificationsCalendar" ? (
              <NotificationsCalendarView onClose={handleClose} />
            ) : target === "start" ? (
              <StartMenuView
                onClose={handleClose}
                onOpenSearch={(tab, q) => handleSwitchTarget("search", tab ?? "all", q)}
              />
            ) : target === "search" ? (
              <SearchView
                onClose={handleClose}
                initialTab={searchInitialTab}
                initialQuery={searchInitialQuery}
                onConsumeInitialQuery={consumeInitialQuery}
              />
            ) : target === "tray" ? (
              <TrayFlyoutView onClose={handleClose} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="gili-flyout-card p-5 flex flex-col items-center gap-2 max-w-xs">
                  <span className="text-[13px] font-semibold text-[var(--taskbar-text)]">
                    Gili Flyout ({target})
                  </span>
                  <span className="text-[11px] text-[var(--taskbar-text-2)]">
                    {tx(lang, "Active theme:", "Tema aktif:")}{" "}
                    <strong className="capitalize">{theme}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="gili-flyout-chip px-3 py-1.5 rounded-lg text-[11px] font-medium mt-2 cursor-pointer text-[var(--taskbar-text)]"
                  >
                    {tx(lang, "Close (Esc)", "Tutup (Esc)")}
                  </button>
                </div>
              </div>
            )}
          </React.Suspense>
        </div>
      </div>
    </div>
  );
};
