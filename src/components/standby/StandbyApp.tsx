import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { load as loadStore } from "@tauri-apps/plugin-store";
import { Clock, CloudSun, LayoutGrid, Moon, Music, Settings, Sun, X } from "lucide-react";
import {
  DEFAULT_STANDBY_CONFIG,
  StandbyClockStyle,
  StandbyConfig,
  StandbyLaunchContext,
  StandbyLeftWidget,
  StandbyRightWidget,
  StandbyScreen,
  closeStandbyWindow,
  getStandbyConfig,
  getStandbyLaunchContext,
  isNightShiftActive,
  isStandbyDeepEcoActive,
  notifyStandbyReady,
  saveStandbyConfig,
  subscribeStandbyConfig,
  subscribeStandbyDeepEco,
} from "../../services/standbyService";
import { Language, getLanguage, setLanguage } from "../../services/i18n";
import {
  WeatherData,
  getCachedWeather,
  startWeatherAutoSync,
  subscribeWeatherChange,
} from "../../services/weatherService";
import {
  PrayerId,
  PrayerScheduleData,
  fetchPrayerSchedule,
  getCompletedPrayersForDate,
  getImmediatePrayerSchedule,
  togglePrayerCompleted,
} from "../../services/prayerService";
import {
  LyricsPayload,
  MediaPayload,
  getCurrentLyrics,
  getCurrentMedia,
  initMediaLyricsStore,
  subscribeLyrics,
  subscribeMedia,
} from "../../services/mediaLyricsStore";
import { prefetchArtwork } from "../../services/artworkService";
import { useLyricsSync } from "../miniplayer/lyricsSync";
import { useResolvedThumbnail } from "../ui/MediaThumbnail";
import { extractDominantColor } from "../miniplayer/colorExtractor";
import { usePomodoro } from "../../hooks/usePomodoro";
import {
  TODO_STORAGE_KEY,
  TodoItem,
  loadCanonicalTodos,
  toggleCanonicalTodo,
} from "../../services/todoUtils";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { resolveStandbyPalette } from "./standbyTheme";
import {
  computeNextClockDelayMs,
  isStandbyMediaSurfaceVisible,
  standbyLyricsTickIntervalMs,
  standbyNeedsSecondTicks,
} from "./standbyClockPolicy";
import { StandbyPowerState } from "./widgets/StandbyDigitalClockWidget";
import { StandbyWidgetStack } from "./views/StandbyWidgetStack";
import { StandbyClockFaceView } from "./views/StandbyClockFaceView";
import { StandbyMediaView } from "./views/StandbyMediaView";
import { StandbyWeatherBoardView } from "./views/StandbyWeatherBoardView";

const SCREENS: StandbyScreen[] = ["widgets", "clock", "media", "weather"];
const CLOCK_STYLES: StandbyClockStyle[] = [
  "bold_duo",
  "editorial_serif",
  "minimal_mono",
  "analog_rail",
];
const BURN_IN_OFFSETS: [number, number][] = [
  [0, 0],
  [2, 0],
  [2, 2],
  [0, 2],
  [-2, 2],
  [-2, 0],
  [-2, -2],
  [0, -2],
];

export const StandbyApp: React.FC = () => {
  const reducedMotion = usePrefersReducedMotion();
  const [optLanguage, setOptLanguage] = useState<Language>(() => getLanguage());
  const isId = optLanguage === "id";

  const [config, setConfig] = useState<StandbyConfig>(DEFAULT_STANDBY_CONFIG);
  const [launchContext, setLaunchContext] = useState<StandbyLaunchContext>({
    trigger: "manual",
    close_on_activity: false,
    monitor_id: null,
    is_secondary_monitor: false,
  });
  const [nightOverride, setNightOverride] = useState<boolean | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [hudVisible, setHudVisible] = useState(true);
  const [deepEcoActive, setDeepEcoActive] = useState(false);
  const [shiftIndex, setShiftIndex] = useState(0);
  const [transitionPhase, setTransitionPhase] = useState<"entering" | "visible" | "exiting">(
    () => (reducedMotion ? "visible" : "entering"),
  );

  const [weather, setWeather] = useState<WeatherData | null>(() => getCachedWeather());
  const [weatherLoading, setWeatherLoading] = useState<boolean>(() => !getCachedWeather());
  const [schedule, setSchedule] = useState<PrayerScheduleData>(() =>
    getImmediatePrayerSchedule(),
  );
  const [completedPrayers, setCompletedPrayers] = useState<PrayerId[]>(() =>
    getCompletedPrayersForDate(),
  );
  const [battery, setBattery] = useState<StandbyPowerState | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>(() => loadCanonicalTodos());
  const [media, setMedia] = useState<MediaPayload>(() => getCurrentMedia());
  const [lyrics, setLyrics] = useState<LyricsPayload>(() => getCurrentLyrics());
  const resolvedMediaArt = useResolvedThumbnail(media);
  const [mediaGlowHex, setMediaGlowHex] = useState<string | null>(null);

  const mediaSurfaceVisible = isStandbyMediaSurfaceVisible(config);

  useEffect(() => {
    if (!resolvedMediaArt || !mediaSurfaceVisible) {
      setMediaGlowHex(null);
      return;
    }
    let cancelled = false;
    extractDominantColor(resolvedMediaArt).then((hex) => {
      if (!cancelled) setMediaGlowHex(hex);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedMediaArt, mediaSurfaceVisible]);

  const pomodoro = usePomodoro({ isSecondary: true });
  const lyricsTickMs = standbyLyricsTickIntervalMs(
    Boolean(lyrics.synced && lyrics.lines.length > 0),
    deepEcoActive,
  );
  const { activeIndex, livePosition, liveDuration, seekLocal } = useLyricsSync(
    lyrics,
    media.position || 0,
    media.duration || 0,
    media.is_playing,
    lyrics.offset || 0,
    !mediaSurfaceVisible,
    lyricsTickMs,
  );

  const dismissingRef = useRef(false);
  const mountAtRef = useRef(performance.now());
  const initialPointerRef = useRef<{ x: number; y: number } | null>(null);
  const hudTimerRef = useRef<number | null>(null);
  const dismissFallbackRef = useRef<number | null>(null);

  const handleDismiss = useCallback(async () => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    setTransitionPhase("exiting");
    if (dismissFallbackRef.current) window.clearTimeout(dismissFallbackRef.current);
    dismissFallbackRef.current = window.setTimeout(() => {
      getCurrentWindow().destroy().catch(() => {
        getCurrentWindow().close().catch(() => {});
      });
    }, 650);
    try {
      await closeStandbyWindow();
    } catch {
      try {
        await getCurrentWindow().destroy();
      } catch {
        try {
          await getCurrentWindow().close();
        } catch {}
      }
    }
  }, []);

  const bumpHud = useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
    hudTimerRef.current = window.setTimeout(() => {
      setHudVisible(false);
    }, 4500);
  }, []);

  useEffect(() => {
    mountAtRef.current = performance.now();
    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;

    Promise.all([getStandbyConfig(), getStandbyLaunchContext(), isStandbyDeepEcoActive()]).then(
      ([cfg, ctx, eco]) => {
        if (cancelled) return;
        setConfig(cfg);
        setLaunchContext(ctx);
        setDeepEcoActive(eco);
        raf1 = window.requestAnimationFrame(() => {
          raf2 = window.requestAnimationFrame(() => {
            if (cancelled) return;
            notifyStandbyReady();
            setTransitionPhase("visible");
          });
        });
      },
    );
    bumpHud();

    const unsubCfg = subscribeStandbyConfig((cfg) => {
      setConfig((prev) => {
        if (prev.night_mode !== cfg.night_mode) {
          setNightOverride(null);
        }
        return cfg;
      });
    });
    const unsubEco = subscribeStandbyDeepEco((active) => {
      if (!cancelled) setDeepEcoActive(active);
    });

    let unsubCtx: (() => void) | null = null;
    listen<StandbyLaunchContext>("standby:context-updated", (ev) => {
      if (ev.payload) {
        mountAtRef.current = performance.now();
        initialPointerRef.current = null;
        dismissingRef.current = false;
        if (dismissFallbackRef.current) {
          window.clearTimeout(dismissFallbackRef.current);
          dismissFallbackRef.current = null;
        }
        setLaunchContext(ev.payload);
        setTransitionPhase("visible");
      }
    })
      .then((fn) => {
        if (cancelled) fn();
        else unsubCtx = fn;
      })
      .catch(() => {});

    let unsubClosing: (() => void) | null = null;
    listen<boolean>("standby:closing", () => {
      dismissingRef.current = true;
      setTransitionPhase("exiting");
    })
      .then((fn) => {
        if (cancelled) fn();
        else unsubClosing = fn;
      })
      .catch(() => {});

    let unsubSync: (() => void) | null = null;
    listen<any>("gili-settings-sync", (ev) => {
      const p = ev.payload;
      if (!p || typeof p !== "object") return;
      if (p.type === "setting_key" && p.key === "opt_language") {
        setLanguage(p.value as Language, false);
        setOptLanguage(p.value as Language);
      }
    })
      .then((fn) => {
        if (cancelled) fn();
        else unsubSync = fn;
      })
      .catch(() => {});

    // Hydrate saved language from persistent settings store so English/Indonesian stays in sync
    loadStore("settings.json")
      .then((store) => store.get<string>("opt_language"))
      .then((savedLang) => {
        if (!cancelled && (savedLang === "en" || savedLang === "id")) {
          setLanguage(savedLang, false);
          setOptLanguage(savedLang);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
      unsubCfg();
      unsubEco();
      if (unsubCtx) unsubCtx();
      if (unsubClosing) unsubClosing();
      if (unsubSync) unsubSync();
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
      if (dismissFallbackRef.current) window.clearTimeout(dismissFallbackRef.current);
    };
  }, [bumpHud]);

  const needsSecondTicks = standbyNeedsSecondTicks(config);

  useEffect(() => {
    let timerId: number | null = null;
    let disposed = false;

    const scheduleNextTick = () => {
      if (disposed) return;
      const delayMs = computeNextClockDelayMs(Date.now(), needsSecondTicks);
      timerId = window.setTimeout(() => {
        if (disposed) return;
        setNow(new Date());
        scheduleNextTick();
      }, delayMs);
    };

    setNow(new Date());
    scheduleNextTick();

    return () => {
      disposed = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [needsSecondTicks]);

  useEffect(() => {
    if (!config.burn_in_protection || reducedMotion) {
      setShiftIndex(0);
      return;
    }
    const shiftTimer = window.setInterval(() => {
      setShiftIndex((prev) => (prev + 1) % BURN_IN_OFFSETS.length);
    }, 60_000);
    return () => window.clearInterval(shiftTimer);
  }, [config.burn_in_protection, reducedMotion]);

  useEffect(() => {
    const unsubMedia = subscribeMedia((m) => {
      if (m && (m.title || m.artist)) prefetchArtwork(m);
      setMedia(m);
    });
    const unsubLyrics = subscribeLyrics(setLyrics);
    initMediaLyricsStore(false);

    const stopWeather = startWeatherAutoSync((data) => {
      setWeather(data);
      setWeatherLoading(false);
    });
    const unsubWeather = subscribeWeatherChange(() => {
      fetchPrayerSchedule(true).then(setSchedule).catch(() => {});
    });

    fetchPrayerSchedule(false).then(setSchedule).catch(() => {});

    const onStorage = (e: StorageEvent) => {
      if (e.key === TODO_STORAGE_KEY) {
        setTodos(loadCanonicalTodos());
      } else if (e.key === "gili_prayer_completed_v1") {
        setCompletedPrayers(getCompletedPrayersForDate());
      } else if (
        e.key === "gili_prayer_settings_v1" ||
        e.key === "gili_prayer_schedule_cache_v1"
      ) {
        fetchPrayerSchedule(true).then(setSchedule).catch(() => {});
        setCompletedPrayers(getCompletedPrayersForDate());
      } else if (e.key === "island_language" && (e.newValue === "en" || e.newValue === "id")) {
        setOptLanguage(e.newValue);
      }
    };
    const onPrayerUpdated = () => {
      fetchPrayerSchedule(true).then(setSchedule).catch(() => {});
      setCompletedPrayers(getCompletedPrayersForDate());
    };
    let lastDateKey = new Date().toDateString();
    const midnightTimer = window.setInterval(() => {
      const todayKey = new Date().toDateString();
      if (todayKey !== lastDateKey) {
        lastDateKey = todayKey;
        fetchPrayerSchedule(true).then(setSchedule).catch(() => {});
        setCompletedPrayers(getCompletedPrayersForDate());
      }
    }, 30_000);
    window.addEventListener("storage", onStorage);
    window.addEventListener("gili_prayer_updated", onPrayerUpdated);

    return () => {
      unsubMedia();
      unsubLyrics();
      stopWeather();
      unsubWeather();
      window.clearInterval(midnightTimer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("gili_prayer_updated", onPrayerUpdated);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pollBattery = () => {
      invoke<StandbyPowerState | null>("get_system_power_info")
        .then((info) => {
          if (!cancelled) setBattery(info);
        })
        .catch(() => {});
    };
    pollBattery();
    const batteryTimer = window.setInterval(pollBattery, deepEcoActive ? 120_000 : 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(batteryTimer);
    };
  }, [deepEcoActive]);

  const persistUpdate = useCallback((patch: Partial<StandbyConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveStandbyConfig(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const closeOnAct = launchContext.close_on_activity;

    const onPointerMove = (e: PointerEvent) => {
      if (closeOnAct) {
        if (performance.now() - mountAtRef.current < 850) return;
        if (!initialPointerRef.current) {
          initialPointerRef.current = { x: e.clientX, y: e.clientY };
          return;
        }
        const dist = Math.hypot(
          e.clientX - initialPointerRef.current.x,
          e.clientY - initialPointerRef.current.y,
        );
        if (dist > 12) handleDismiss();
        return;
      }
      bumpHud();
    };

    const onActivityExitOrBump = () => {
      if (closeOnAct) {
        if (performance.now() - mountAtRef.current >= 500) handleDismiss();
      } else {
        bumpHud();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (closeOnAct) {
        if (performance.now() - mountAtRef.current >= 500) handleDismiss();
        return;
      }
      bumpHud();
      if (e.key === "Escape" || e.code === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleDismiss();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const nextIdx = (SCREENS.indexOf(config.active_screen) + 1) % SCREENS.length;
        persistUpdate({ active_screen: SCREENS[nextIdx] });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prevIdx = (SCREENS.indexOf(config.active_screen) - 1 + SCREENS.length) % SCREENS.length;
        persistUpdate({ active_screen: SCREENS[prevIdx] });
      } else if (e.code === "KeyN") {
        setNightOverride((prev) => !(prev ?? isNightShiftActive(config.night_mode, new Date())));
      } else if (e.code === "Space" && (e.target as HTMLElement)?.tagName !== "BUTTON") {
        e.preventDefault();
        invoke("smtc_action", { action: "toggle" }).catch(() => {});
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("mousedown", onActivityExitOrBump, { passive: true });
    window.addEventListener("wheel", onActivityExitOrBump, { passive: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("mousedown", onActivityExitOrBump);
      window.removeEventListener("wheel", onActivityExitOrBump);
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [launchContext.close_on_activity, config.active_screen, config.night_mode, handleDismiss, bumpHud, persistUpdate]);

  const nightActive = useMemo(() => {
    if (nightOverride !== null) return nightOverride;
    return isNightShiftActive(config.night_mode, now);
  }, [nightOverride, config.night_mode, now]);

  const palette = useMemo(
    () => resolveStandbyPalette(nightActive, config.clock_accent),
    [nightActive, config.clock_accent],
  );

  const [rawShiftX, rawShiftY] = BURN_IN_OFFSETS[shiftIndex] || [0, 0];
  const shiftScale = deepEcoActive ? 1.5 : 1;
  const shiftX = Math.round(rawShiftX * shiftScale);
  const shiftY = Math.round(rawShiftY * shiftScale);

  const handleToggleTodo = useCallback((id: string) => {
    setTodos(toggleCanonicalTodo(id));
  }, []);

  const handleTogglePrayer = useCallback((id: PrayerId) => {
    const res = togglePrayerCompleted(id);
    setCompletedPrayers(res.completed);
  }, []);

  const handleCycleClockStyle = useCallback(() => {
    const nextIdx = (CLOCK_STYLES.indexOf(config.clock_style) + 1) % CLOCK_STYLES.length;
    persistUpdate({ clock_style: CLOCK_STYLES[nextIdx] });
  }, [config.clock_style, persistUpdate]);

  const hudPhaseHidden = transitionPhase !== "visible";
  const topHudVisible = !hudPhaseHidden && (launchContext.close_on_activity || hudVisible);
  const bottomHudVisible = !hudPhaseHidden && hudVisible && !launchContext.close_on_activity;

  const makeHudSurfaceStyle = (visible: boolean): React.CSSProperties => ({
    backgroundColor: palette.hudBg,
    borderColor: palette.cardBorder,
    backdropFilter:
      !palette.night && !deepEcoActive && visible ? "blur(26px) saturate(180%)" : "none",
    boxShadow:
      !palette.night && visible
        ? "0 14px 34px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.16)"
        : "none",
  });
  const topHudSurfaceStyle = makeHudSurfaceStyle(topHudVisible);
  const bottomHudSurfaceStyle = makeHudSurfaceStyle(bottomHudVisible);

  const stageMotionStyle: React.CSSProperties = reducedMotion
    ? { opacity: transitionPhase === "exiting" ? 0 : 1 }
    : transitionPhase === "entering"
    ? {
        opacity: 0,
        transform: "scale(1.032)",
        willChange: "transform, opacity",
        transition: "opacity 420ms cubic-bezier(0.22, 1, 0.36, 1), transform 460ms cubic-bezier(0.22, 1, 0.36, 1)",
      }
    : transitionPhase === "exiting"
    ? {
        opacity: 0,
        transform: "scale(0.972)",
        willChange: "transform, opacity",
        transition: "opacity 230ms cubic-bezier(0.4, 0, 0.2, 1), transform 230ms cubic-bezier(0.4, 0, 0.2, 1)",
      }
    : {
        opacity: 1,
        transform: "scale(1)",
        willChange: "auto",
        transition: "opacity 420ms cubic-bezier(0.22, 1, 0.36, 1), transform 460ms cubic-bezier(0.22, 1, 0.36, 1)",
      };

  const screensaverDimActive =
    deepEcoActive &&
    config.screensaver_dim_enabled &&
    (launchContext.close_on_activity || !hudVisible);
  const showWidgetMediaGlow =
    !palette.night &&
    !screensaverDimActive &&
    config.active_screen === "widgets" &&
    config.right_widget === "media" &&
    Boolean(mediaGlowHex && media.title && media.title.trim().length > 0);

  return (
    <main
      className="relative w-screen h-screen overflow-hidden select-none"
      style={{
        background: palette.ambientGradient,
        color: palette.textPrimary,
        cursor: launchContext.close_on_activity || !hudVisible ? "none" : "default",
      }}
    >
      {/* Whisper-soft album color glow on OLED black when Media widget is active */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-1000"
        style={{
          opacity: showWidgetMediaGlow ? 1 : 0,
          background: mediaGlowHex
            ? `radial-gradient(circle at 74% 50%, ${mediaGlowHex}2e 0%, ${mediaGlowHex}10 34%, transparent 62%)`
            : "none",
        }}
      />
      {/* Floating Top macOS Vibrancy HUD (overlaid without black bars) */}
      <header
        className={`absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 pt-5 transition-all duration-300 ${
          hudPhaseHidden
            ? "opacity-0 -translate-y-2 pointer-events-none"
            : launchContext.close_on_activity
            ? "opacity-90 pointer-events-none"
            : hudVisible
            ? "opacity-100 translate-y-0"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          className="px-3.5 py-1.5 rounded-full border text-[12px] font-semibold flex items-center gap-2"
          style={{ ...topHudSurfaceStyle, color: palette.textSecondary }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: palette.night ? palette.textPrimary : "#30d158" }}
          />
          <span>
            {launchContext.close_on_activity
              ? deepEcoActive
                ? isId
                  ? "Screensaver Hemat Daya · Gerakkan mouse untuk keluar"
                  : "Screensaver Eco · Move mouse to exit"
                : isId
                ? "StandBy Idle · Gerakkan mouse untuk keluar"
                : "StandBy Idle · Move mouse to exit"
              : launchContext.trigger === "secondary_permanent"
              ? deepEcoActive
                ? isId
                  ? "Monitor Ke-2 · Mode Screensaver Hemat Daya"
                  : "2nd Display · Screensaver Eco Mode"
                : isId
                ? "Monitor Ke-2 · Always-On"
                : "2nd Display · Always-On"
              : deepEcoActive
              ? isId
                ? "StandBy · Mode Screensaver Hemat Daya · Tekan Esc"
                : "StandBy · Screensaver Eco Mode · Press Esc"
              : isId
              ? "StandBy · Tekan Esc untuk keluar"
              : "StandBy · Press Esc to exit"}
          </span>
        </div>

        {!launchContext.close_on_activity && (
          <nav
            aria-label={isId ? "Mode Layar StandBy" : "StandBy Screen Modes"}
            className="flex items-center gap-1 p-1 rounded-full border"
            style={topHudSurfaceStyle}
          >
            {(
              [
                { id: "widgets", icon: <LayoutGrid size={14} />, label: isId ? "Widget" : "Widgets" },
                { id: "clock", icon: <Clock size={14} />, label: isId ? "Jam" : "Clock" },
                { id: "media", icon: <Music size={14} />, label: "Media" },
                { id: "weather", icon: <CloudSun size={14} />, label: isId ? "Cuaca" : "Weather" },
              ] as const
            ).map((item) => {
              const active = config.active_screen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => persistUpdate({ active_screen: item.id })}
                  className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
                  style={{
                    backgroundColor: active
                      ? palette.night
                        ? palette.textPrimary
                        : "#ffffff"
                      : "transparent",
                    color: active ? "#000000" : palette.textSecondary,
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        {!launchContext.close_on_activity && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              title={isId ? "Ubah Mode Malam" : "Toggle Night Mode"}
              aria-label={isId ? "Ubah Mode Malam" : "Toggle Night Mode"}
              onClick={() => setNightOverride((prev) => !(prev ?? nightActive))}
              className="w-9 h-9 rounded-full border flex items-center justify-center cursor-pointer transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
              style={{ ...topHudSurfaceStyle, color: palette.textPrimary }}
            >
              {nightActive ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <button
              type="button"
              title={isId ? "Pengaturan StandBy" : "StandBy Settings"}
              aria-label={isId ? "Pengaturan StandBy" : "StandBy Settings"}
              onClick={async () => {
                await invoke("open_settings_window", { section: "standby" }).catch(() => {});
                if (!launchContext.is_secondary_monitor) {
                  handleDismiss();
                }
              }}
              className="w-9 h-9 rounded-full border flex items-center justify-center cursor-pointer transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
              style={{ ...topHudSurfaceStyle, color: palette.textPrimary }}
            >
              <Settings size={16} />
            </button>

            <button
              type="button"
              aria-label={isId ? "Tutup StandBy" : "Exit StandBy"}
              onClick={handleDismiss}
              className="px-3.5 h-9 rounded-full border flex items-center gap-1.5 text-[12px] font-semibold cursor-pointer transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
              style={{ ...topHudSurfaceStyle, color: palette.textPrimary }}
            >
              <X size={15} />
              <span>{isId ? "Keluar" : "Exit"}</span>
            </button>
          </div>
        )}
      </header>

      {/* Full-Bleed Screen Stage (100vw x 100vh) */}
      <div
        className="absolute inset-0 w-full h-full flex items-center justify-center"
        style={stageMotionStyle}
      >
        <div
          key={config.active_screen}
          className={`w-full h-full flex items-center justify-center ${
            reducedMotion ? "" : "animate-standby-view-enter"
          }`}
          style={{
            transform: `translate(${shiftX}px, ${shiftY}px)`,
            // Dim via opacity alone over #000000 to avoid a fullscreen CSS filter pass.
            opacity: screensaverDimActive ? 0.66 : 1,
            transition: reducedMotion
              ? "none"
              : "transform 1000ms ease, opacity 1400ms ease",
          }}
        >
          {config.active_screen === "widgets" && (
            <StandbyWidgetStack
              now={now}
              palette={palette}
              language={optLanguage}
              leftWidget={config.left_widget}
              rightWidget={config.right_widget}
              onChangeLeft={(left_widget: StandbyLeftWidget) => persistUpdate({ left_widget })}
              onChangeRight={(right_widget: StandbyRightWidget) => persistUpdate({ right_widget })}
              interactiveControlsVisible={!launchContext.close_on_activity && hudVisible}
              use24h={config.use_24h}
              showSeconds={config.show_seconds}
              reducedMotion={reducedMotion}
              deepEcoActive={deepEcoActive}
              battery={battery}
              weather={weather}
              weatherLoading={weatherLoading}
              schedule={schedule}
              media={media}
              lyrics={lyrics}
              livePosition={livePosition}
              liveDuration={liveDuration}
              activeLyricIndex={activeIndex}
              onSeekLocal={seekLocal}
              pomoMode={pomodoro.mode}
              remainingSec={pomodoro.remainingSec}
              totalSec={pomodoro.totalSec}
              pomoRunning={pomodoro.isRunning}
              onTogglePomo={pomodoro.handleToggleRunning}
              onResetPomo={pomodoro.handleReset}
              todos={todos}
              onToggleTodo={handleToggleTodo}
            />
          )}

          {config.active_screen === "clock" && (
            <StandbyClockFaceView
              now={now}
              style={config.clock_style}
              palette={palette}
              use24h={config.use_24h}
              showSeconds={config.show_seconds}
              reducedMotion={reducedMotion}
              deepEcoActive={deepEcoActive}
              language={optLanguage}
              battery={battery}
              weather={weather}
              media={media}
              onSelectMediaScreen={() => persistUpdate({ active_screen: "media" })}
              onCycleClockStyle={handleCycleClockStyle}
            />
          )}

          {config.active_screen === "media" && (
            <StandbyMediaView
              media={media}
              lyrics={lyrics}
              livePosition={livePosition}
              liveDuration={liveDuration}
              activeLyricIndex={activeIndex}
              onSeekLocal={seekLocal}
              palette={palette}
              language={optLanguage}
              reducedMotion={reducedMotion}
              deepEcoActive={deepEcoActive}
            />
          )}

          {config.active_screen === "weather" && (
            <StandbyWeatherBoardView
              now={now}
              palette={palette}
              language={optLanguage}
              weather={weather}
              weatherLoading={weatherLoading}
              schedule={schedule}
              completedPrayers={completedPrayers}
              todos={todos}
              onTogglePrayer={handleTogglePrayer}
            />
          )}
        </div>
      </div>

      {/* Floating Bottom Page Indicator (auto-hides with HUD for pure OLED minimalism) */}
      <footer
        className={`absolute inset-x-0 bottom-0 z-30 flex items-center justify-center pb-5 pointer-events-none transition-all duration-300 ${
          hudPhaseHidden || !hudVisible || launchContext.close_on_activity
            ? "opacity-0 translate-y-2"
            : "opacity-100 translate-y-0"
        }`}
      >
        <div
          className={`px-3 py-1.5 rounded-full border flex items-center gap-2 ${
            hudPhaseHidden || !hudVisible || launchContext.close_on_activity
              ? "pointer-events-none"
              : "pointer-events-auto"
          }`}
          style={bottomHudSurfaceStyle}
        >
          {SCREENS.map((scr) => {
            const active = config.active_screen === scr;
            const scrLabel =
              scr === "widgets"
                ? isId
                  ? "Widget"
                  : "Widgets"
                : scr === "clock"
                ? isId
                  ? "Jam"
                  : "Clock"
                : scr === "media"
                ? "Media"
                : isId
                ? "Cuaca"
                : "Weather";
            return (
              <button
                key={scr}
                type="button"
                aria-label={scrLabel}
                disabled={launchContext.close_on_activity}
                onClick={() => persistUpdate({ active_screen: scr })}
                className={`h-1.5 rounded-full transition-all ${
                  launchContext.close_on_activity ? "cursor-default" : "cursor-pointer"
                } focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]`}
                style={{
                  width: active ? 22 : 6,
                  backgroundColor: active ? palette.textPrimary : palette.textSecondary,
                  opacity: active ? 0.95 : 0.36,
                }}
              />
            );
          })}
        </div>
      </footer>
    </main>
  );
};
