import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { load } from "@tauri-apps/plugin-store";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, ShortcutActionId, ShortcutStatus, shortcutManager, formatShortcutForBadge } from "./services/shortcuts";
import { motion, AnimatePresence } from "framer-motion";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  Bell,
  BellOff,
  Gamepad2,
  BedDouble,
  UploadCloud,
} from "lucide-react";
import "./App.css";

import { MediaPayload, NotifPayload } from "./types";
import { NotifIcon } from "./components/ui/NotifIcon";
import { MediaThumbnail, useResolvedThumbnail } from "./components/ui/MediaThumbnail";
import { prefetchArtwork, getResolvedArtworkUrl } from "./services/artworkService";
import { AudioVisualizer } from "./components/ui/AudioVisualizer";
import { ScrollingText } from "./components/ui/ScrollingText";
import { NotchSurface } from "./components/ui/NotchSurface";
import {
  getDefaultBlurForOpacity,
  resolveNotchThemeMode,
  computeNotchGlassCssVars,
} from "./components/ui/settings/TransparencyControlSection";
import {
  NotchPosition,
  isValidNotchPosition,
  isBottomNotchPosition,
  isTopNotchPosition,
  isLeftNotchPosition,
  isRightNotchPosition,
  isSideCenterNotchPosition,
} from "./utils/notchGeometry";
import { PanelFrame } from "./components/ui/PanelNavHeader";
import type { MonitorInfo } from "./components/ui/settings/MonitorSelector";
import { getTextWidth } from "./utils/text";
import { LyricsData, LyricsProviderId, fetchLyrics, clearLyricsCacheForTrack } from "./services/lyricsService";
import { getInitialShelfFiles, loadPersistedShelfFiles, persistShelfFiles, queueFilePreviews, clearShelfPreviewCache } from "./services/shelfService";
import { fetchCurrentWeather, subscribeWeatherChange, getCachedWeather } from "./services/weatherService";
import { checkForAppUpdate } from "./services/updateService";
import type { ClipboardItem } from "./components/ui/ClipboardPanel";
import {
  NotificationHistoryItem,
  loadNotificationHistory,
  addNotificationHistoryItem,
  categorizeNotification,
  isAppMuted,
  getDndStatus,
  setDndStatus,
} from "./services/notificationHistoryService";
import { type TodoItem, type TodoRepeatRule, computeNextRepeatDue } from "./services/todoUtils";
import type { StashedFile } from "./components/ui/DropShelfPanel";
import {
  NotchTabsPreferences,
  loadTabsPreferences,
  normalizeTabsPreferences,
  getOrderedEnabledTabs,
} from "./services/tabConfigService";
import { createQuickNoteItem, deleteQuickNoteItem } from "./services/noteUtils";
import { WaterNotchToast, WaterToastType } from "./components/ui/water/WaterNotchToast";
import {
  loadWaterData,
  logDrink,
  undoLastDrink,
  useStreakFreeze,
  WaterData,
} from "./services/waterService";
import { useWaterReminder } from "./hooks/useWaterReminder";
import { PrayerNotchToast } from "./components/ui/prayer/PrayerNotchToast";
import { PrayerToastPayload, togglePrayerCompleted, getPrayerDisplayName } from "./services/prayerService";
import { usePrayerReminder } from "./hooks/usePrayerReminder";
import { fetchHotspotStatus, toggleHotspotState } from "./services/connectivityService";
import { usePomodoro } from "./hooks/usePomodoro";
import { useTodoReminders } from "./hooks/useTodoReminders";
import {
  UniformHudPill,
  PomodoroIdlePill,
  PomodoroCompleteAlertCard,
} from "./components/ui/NotchNotifications";
import {
  playVolumeTick,
  playChargingSound,
  playDeviceConnectSound,
  playNotificationSound,
  playTaskCompleteSound,
  playWaterDrinkSound,
  playReminderSound,
  isSoundEffectsEnabled,
  setSoundEffectsEnabled,
  getSavedNotifSound,
  setSavedNotifSound,
} from "./services/soundService";
import {
  IdleLayoutConfig,
  IdleRuntimeData,
  IdleSlotView,
  getSavedIdleLayout,
  parseIdleLayout,
  measureIdleLayoutWidth,
} from "./components/ui/IdleLayoutSetting";
import type { QueueTrackItem } from "./components/ui/MediaQueueView";
import { IdleLyrics } from "./components/ui/IdleLyrics";

const ControlCenterPanel = React.lazy(() =>
  import("./components/ui/ControlCenterPanel").then((m) => ({ default: m.ControlCenterPanel }))
);
const ClipboardPanel = React.lazy(() =>
  import("./components/ui/ClipboardPanel").then((m) => ({ default: m.ClipboardPanel }))
);
const NotificationCenterPanel = React.lazy(() =>
  import("./components/ui/NotificationCenterPanel").then((m) => ({ default: m.NotificationCenterPanel }))
);
const TodoListPanel = React.lazy(() =>
  import("./components/ui/TodoListPanel").then((m) => ({ default: m.TodoListPanel }))
);
const DropShelfPanel = React.lazy(() =>
  import("./components/ui/DropShelfPanel").then((m) => ({ default: m.DropShelfPanel }))
);
const SettingsPanel = React.lazy(() =>
  import("./components/ui/SettingsPanel").then((m) => ({ default: m.SettingsPanel }))
);
const PomodoroPanel = React.lazy(() =>
  import("./components/ui/PomodoroPanel").then((m) => ({ default: m.PomodoroPanel }))
);
const SystemMonitorPanel = React.lazy(() =>
  import("./components/ui/SystemMonitorPanel").then((m) => ({ default: m.SystemMonitorPanel }))
);
const MiniNotePanel = React.lazy(() =>
  import("./components/ui/MiniNotePanel").then((m) => ({ default: m.MiniNotePanel }))
);
const WaterReminderPanel = React.lazy(() =>
  import("./components/ui/water/WaterReminderPanel").then((m) => ({ default: m.WaterReminderPanel }))
);
const PrayerReminderPanel = React.lazy(() =>
  import("./components/ui/prayer/PrayerReminderPanel").then((m) => ({ default: m.PrayerReminderPanel }))
);
const VolumeMixerPanel = React.lazy(() =>
  import("./components/ui/VolumeMixerPanel").then((m) => ({ default: m.VolumeMixerPanel }))
);
const MediaExpandedPanel = React.lazy(() =>
  import("./components/ui/MediaExpandedPanel").then((m) => ({ default: m.MediaExpandedPanel }))
);
const QuickNoteNotchCard = React.lazy(() =>
  import("./components/ui/MiniNotePanel").then((m) => ({ default: m.QuickNoteNotchCard }))
);
const QuickTodoNotchCard = React.lazy(() =>
  import("./components/ui/QuickTodoNotchCard").then((m) => ({ default: m.QuickTodoNotchCard }))
);
import { getWheelVerticalDirection } from "./utils/gesture";
import { iosSpring } from "./utils/iosMotion";
import { t, getLanguage, setLanguage, Language } from "./services/i18n";
import { GreetingNotification } from "./components/ui/GreetingNotification";

export default function App() {
  const [media, setMedia] = useState<MediaPayload | null>(null);
  const mediaRef = useRef<MediaPayload | null>(null);
  useEffect(() => { mediaRef.current = media; }, [media]);
  const activePlayingTrackRef = useRef<QueueTrackItem | null>(null);

  const [notif, setNotif] = useState<NotifPayload | null>(null);
  const currentNotifRef = useRef<NotifPayload | null>(null);
  
  useEffect(() => {
    currentNotifRef.current = notif;
  }, [notif]);

  const [notificationsHistory, setNotificationsHistory] = useState<NotificationHistoryItem[]>(() =>
    loadNotificationHistory()
  );
  useEffect(() => {
    setNotificationsHistory(loadNotificationHistory());
  }, []);
  const unreadNotifCount = useMemo(
    () => notificationsHistory.filter((item) => !item.read).length,
    [notificationsHistory]
  );

  const [isNotifications, setIsNotifications] = useState(false);
  const isNotificationsRef = useRef(false);
  useEffect(() => { isNotificationsRef.current = isNotifications; }, [isNotifications]);
  const tabBeforeNotifRef = useRef<ExpandedTab | null>(null);

  const isVolumeMixerRef = useRef(false);
  const isOcrWritingRef = useRef(false);
  type FocusModeType = "Normal" | "DND" | "Gaming" | "Sleep";
  const initialFocusMode: FocusModeType = getDndStatus() ? "DND" : "Normal";
  const focusModeRef = useRef<FocusModeType>(initialFocusMode);
  const pomoMuteNotifsRef = useRef<boolean>(false);
  const isIdleRef = useRef(true);
  const variantRef = useRef<string>("idle");
  const notchPillRef = useRef<HTMLDivElement>(null);

  const triggerNotificationAudio = (notifItem: NotifPayload) => {
    if (!notifItem) return;
    if ((notifItem as any)._soundPlayed) return;

    // Do not play if DND or Pomodoro mute is active
    if (focusModeRef.current === "DND" || pomoMuteNotifsRef.current) return;

    // Do not play sound for hardware HUDs, system toggles, greetings, or explicitly silent items
    const silentIcons = [
      "volume",
      "brightness",
      "capslock",
      "battery",
      "bluetooth",
      "usb",
      "headphones",
      "sun",
      "moon",
      "wifi",
    ];
    if (
      silentIcons.includes(notifItem.icon || "") ||
      notifItem.type === "greeting" ||
      (notifItem as any).silent
    ) {
      return;
    }

    // Do not play sound if source app is muted in settings
    const app = notifItem.appName || notifItem.title || "";
    if (app && isAppMuted(app)) {
      return;
    }

    (notifItem as any)._soundPlayed = true;
    playNotificationSound();
  };

  const showNotif = (newNotif: NotifPayload) => {
    // Record only real app/reminder notifications to history (ignore transient hardware/system status HUDs like CapsLock, battery, volume, brightness, Wi-Fi/Hotspot, Bluetooth/USB/Audio connect, greetings, and clipboard copy toasts)
    const isGreeting = newNotif.type === "greeting" || newNotif.icon === "sun" || newNotif.icon === "moon";
    const isHardwareHud = newNotif.icon === "volume" || newNotif.icon === "brightness";
    const isClipboardNotif = newNotif.icon === "clipboard";
    const transientSystemIcons = [
      "volume",
      "brightness",
      "capslock",
      "battery",
      "wifi",
      "bluetooth",
      "usb",
      "headphones",
      "sun",
      "moon",
      "clipboard",
      "monitor",
    ];
    const isTransientSystemNotif =
      isGreeting ||
      isHardwareHud ||
      isClipboardNotif ||
      transientSystemIcons.includes(newNotif.icon || "");

    if (!isTransientSystemNotif) {
      const { appName } = categorizeNotification(newNotif);
      if (!isAppMuted(appName)) {
        const saved = addNotificationHistoryItem(newNotif);
        setNotificationsHistory((prev) => [saved, ...prev.filter((i) => i.id !== saved.id)].slice(0, 50));
      } else {
        return; // App notifications muted
      }
    }

    const isDndActive = focusModeRef.current === "DND" || pomoMuteNotifsRef.current;
    if (isDndActive && newNotif.icon !== "battery" && !(newNotif as any).forceShow) return;
    if (newNotif.icon === "volume" && !(newNotif as any).forceShow && (!optVolumeRef.current || isVolumeMixerRef.current || isQuickControlRef.current)) return;
    if (newNotif.icon === "clipboard" && !optClipboardRef.current) return;

    if (!isPlayingRef.current) {
      clearPausedMediaTimer();
      isPausedMediaCollapsedRef.current = true;
      setIsPausedMediaCollapsed(true);
    }

    const active = currentNotifRef.current;

    // Drop exact duplicate notifications already displaying
    if (
      active &&
      active.title === newNotif.title &&
      active.body === newNotif.body &&
      active.appName === newNotif.appName
    ) {
      return;
    }

    if (isHardwareHud) {
      if (active && active.icon !== newNotif.icon) {
        // Preserve active notification in queue so it can resume after volume/brightness HUD dismisses
        setNotifQueue((q) => [active, ...q.filter((n) => n.icon !== active.icon && n.icon !== newNotif.icon)]);
      }
      currentNotifRef.current = newNotif;
      setNotif(newNotif);
      return;
    }

    if (active && active.icon === newNotif.icon && (newNotif.icon === "battery" || newNotif.icon === "capslock")) {
      currentNotifRef.current = newNotif;
      setNotif(newNotif);
    } else if (active) {
      setNotifQueue((q) => {
        // Prevent duplicate queued notifications
        const isDuplicate = q.some(
          (n) => n.title === newNotif.title && n.body === newNotif.body && n.appName === newNotif.appName
        );
        if (isDuplicate) return q;
        const filtered = q.filter((n) => n.icon !== newNotif.icon || n.appName !== newNotif.appName);
        return [...filtered, newNotif];
      });
    } else {
      currentNotifRef.current = newNotif;
      setNotif(newNotif);
      triggerNotificationAudio(newNotif);
    }
  };

  const triggerGreeting = async () => {
    try {
      let username = "";
      let nameMode = "auto";
      let customName = "";
      try {
        nameMode = localStorage.getItem("island_greeting_name_mode") || "auto";
        const rawCustom = localStorage.getItem("island_custom_greeting_name");
        customName = (rawCustom && rawCustom !== "undefined" && rawCustom !== "null" ? rawCustom : "").trim();
      } catch {}

      if (nameMode === "custom" && customName) {
        username = customName;
      } else {
        try {
          username = localStorage.getItem("island_username") || "";
        } catch {}

        if (!username) {
          username = await invoke<string>("get_username");
          try {
            if (username) localStorage.setItem("island_username", username);
          } catch {}
        } else {
          invoke<string>("get_username")
            .then((u) => {
              if (u) {
                try {
                  localStorage.setItem("island_username", u);
                } catch {}
              }
            })
            .catch(() => {});
        }
      }

      const hour = new Date().getHours();
      const isNight = hour >= 18 || hour < 5;
      const isMorning = hour >= 5 && hour < 12;
      const isAfternoon = hour >= 12 && hour < 18;
      const greeting = isNight 
        ? t("greeting_evening") 
        : isMorning 
        ? t("greeting_morning") 
        : isAfternoon
        ? t("greeting_afternoon")
        : t("greeting_welcome");
      
      showNotif({
        title: username ? `Hi, ${username}` : t("greeting_welcome"),
        body: `${greeting}!`,
        icon: isNight ? "moon" : "sun",
        type: "greeting"
      });
    } catch (e) {
      console.error("Failed to trigger greeting", e);
    }
  };

  const [isExpanded, setIsExpanded] = useState(false);
  const isExpandedRef = useRef(false);
  useEffect(() => { isExpandedRef.current = isExpanded; }, [isExpanded]);
  const [isHidden, setIsHidden] = useState(false);
  const [isVolumeMixer, setIsVolumeMixer] = useState(false);
  useEffect(() => { isVolumeMixerRef.current = isVolumeMixer; }, [isVolumeMixer]);
  const [networkPing, setNetworkPing] = useState<number | null>(null);
  const [audioSessions, setAudioSessions] = useState<{pid: number, name: string, volume: number, muted: boolean}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  const hasEverPlayedRef = useRef(false);
  const [isPausedMediaCollapsed, setIsPausedMediaCollapsed] = useState(false);
  const isPausedMediaCollapsedRef = useRef(false);
  useEffect(() => { isPausedMediaCollapsedRef.current = isPausedMediaCollapsed; }, [isPausedMediaCollapsed]);
  const pausedMediaCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPausedMediaTimer = useCallback(() => {
    if (pausedMediaCollapseTimerRef.current) {
      clearTimeout(pausedMediaCollapseTimerRef.current);
      pausedMediaCollapseTimerRef.current = null;
    }
  }, []);

  const startPausedMediaCollapseTimer = useCallback((delayMs: number = 5000) => {
    clearPausedMediaTimer();
    pausedMediaCollapseTimerRef.current = setTimeout(() => {
      isPausedMediaCollapsedRef.current = true;
      setIsPausedMediaCollapsed(true);
    }, delayMs);
  }, [clearPausedMediaTimer]);
  const [mediaProgress, setMediaProgress] = useState({ position: 0, duration: 0 });
  const latestMediaProgressRef = useRef({ position: 0, duration: 0, updatedAt: performance.now() });
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [brightnessMode, setBrightnessMode] = useState<"auto" | "manual" | "reading">("manual");
  const isAdjustingVolumeRef = useRef(false);
  const [showLyrics, setShowLyrics] = useState<boolean>(() => {
    try {
      return localStorage.getItem("island_show_lyrics") === "true";
    } catch {
      return false;
    }
  });
  const showLyricsRef = useRef(showLyrics);
  useEffect(() => {
    showLyricsRef.current = showLyrics;
  }, [showLyrics]);
  useEffect(() => {
    if (isExpanded || showLyrics) {
      const snap = latestMediaProgressRef.current;
      const elapsedSec = isPlayingRef.current
        ? Math.max(0, (performance.now() - snap.updatedAt) / 1000)
        : 0;
      const nextPos = snap.duration > 0 ? Math.min(snap.duration, snap.position + elapsedSec) : snap.position + elapsedSec;
      setMediaProgress({ position: nextPos, duration: snap.duration });
    }
  }, [isExpanded, showLyrics]);
  const [queueHistory, setQueueHistory] = useState<QueueTrackItem[]>(() => {
    try {
      const saved = localStorage.getItem("island_queue_history");
      return saved ? JSON.parse(saved).slice(0, 10) : [];
    } catch {
      return [];
    }
  });
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);
  const [lyricsProvider, setLyricsProvider] = useState<LyricsProviderId>(() => {
    try {
      return (localStorage.getItem("notch_lyrics_provider") as LyricsProviderId) || "auto";
    } catch {
      return "auto";
    }
  });
  const [activeIdleLyric, setActiveIdleLyric] = useState<{ curr: string; prev: string; next: string }>({
    curr: "",
    prev: "",
    next: "",
  });

  const handleActiveIdleLyricChange = useCallback((curr: string, prev: string, next: string) => {
    setActiveIdleLyric((old) => {
      if (old.curr === curr && old.prev === prev && old.next === next) return old;
      return { curr, prev, next };
    });
  }, []);
  
  const collapseTimerRef = useRef<number | null>(null);
  const isCursorInsideNotchRef = useRef(false);
  const isShortcutPinnedRef = useRef(false);
  const shortcutPinnedTimerRef = useRef<number | null>(null);
  const isClosingRef = useRef(false);
  const closeGraceUntilRef = useRef<number>(0);
  const finishClosingTimerRef = useRef<number | null>(null);
  const variantsRef = useRef<Record<string, { width: number; height: number }> | null>(null);
  const notchHoverEnterRef = useRef<() => void>(() => {});

  const finishClosing = () => {
    isClosingRef.current = false;
  };

  useEffect(() => {
    setLyricsData(null);
    setActiveIdleLyric({ curr: "", prev: "", next: "" });
  }, [media?.title, media?.artist]);

  useEffect(() => {
    if (!showLyrics || !media?.title) {
      setIsLyricsLoading(false);
      return;
    }
    let isCancelled = false;
    setIsLyricsLoading(true);
    fetchLyrics(media.artist || "", media.title, media.duration || mediaProgress.duration, lyricsProvider)
      .then((res) => {
        if (!isCancelled) {
          setLyricsData(res);
          setIsLyricsLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLyricsData(null);
          setIsLyricsLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [showLyrics, media?.title, media?.artist, lyricsProvider]);

  const handleChangeLyricsProvider = useCallback(async (newProvider: LyricsProviderId) => {
    setLyricsProvider(newProvider);
    try {
      localStorage.setItem("notch_lyrics_provider", newProvider);
    } catch {}
    if (!media?.title) return;
    setIsLyricsLoading(true);
    try {
      clearLyricsCacheForTrack(media.artist || "", media.title);
      const res = await fetchLyrics(
        media.artist || "",
        media.title,
        media.duration || mediaProgress.duration,
        newProvider,
        true
      );
      setLyricsData(res);
    } catch {
      setLyricsData(null);
    } finally {
      setIsLyricsLoading(false);
    }
  }, [media?.artist, media?.title, media?.duration, mediaProgress.duration]);

  const handleRefreshLyrics = useCallback(async () => {
    if (!media?.title) return;
    setIsLyricsLoading(true);
    try {
      clearLyricsCacheForTrack(media.artist || "", media.title);
      const res = await fetchLyrics(
        media.artist || "",
        media.title,
        media.duration || mediaProgress.duration,
        lyricsProvider,
        true
      );
      setLyricsData(res);
    } catch {
      setLyricsData(null);
    } finally {
      setIsLyricsLoading(false);
    }
  }, [media?.artist, media?.title, media?.duration, mediaProgress.duration, lyricsProvider]);

  const [notifQueue, setNotifQueue] = useState<NotifPayload[]>([]);
  const musicAmbientUrl = useResolvedThumbnail(media);
  const [battery, setBattery] = useState<{ is_charging: boolean, percent: number } | null>(null);
  const [time, setTime] = useState<Date>(new Date());

  const [weather, setWeather] = useState<{ temp: string, code: number, locationName?: string } | null>(() => {
    const cached = getCachedWeather();
    if (cached) {
      return { temp: cached.temp, code: cached.code, locationName: cached.locationName };
    }
    return null;
  });
  const [isQuickControl, setIsQuickControl] = useState(false);
  const isQuickControlRef = useRef(isQuickControl);
  useEffect(() => { isQuickControlRef.current = isQuickControl; }, [isQuickControl]);
  const [isClipboard, setIsClipboard] = useState(false);
  const isClipboardRef = useRef(false);
  useEffect(() => { isClipboardRef.current = isClipboard; }, [isClipboard]);
  const [isSettings, setIsSettings] = useState(false);
  const isSettingsRef = useRef(false);
  useEffect(() => { isSettingsRef.current = isSettings; }, [isSettings]);
  useEffect(() => {
    const handleOpenInitialSettings = () => {
      try {
        localStorage.setItem("island_onboarding_completed", "true");
      } catch {}
      invoke("open_settings_window", { section: "about" }).catch(() => {});
    };
    window.addEventListener("island_trigger_onboarding", handleOpenInitialSettings);

    // First install or post-update: open Settings to About & News
    getVersion().then((currentVersion) => {
      try {
        const lastSeen = localStorage.getItem("island_last_seen_version");
        const onboardingDone = localStorage.getItem("island_onboarding_completed");

        const isFreshInstall = !onboardingDone;
        const isVersionChanged = !lastSeen || lastSeen !== currentVersion;

        if (isFreshInstall || isVersionChanged) {
          localStorage.setItem("island_onboarding_completed", "true");
          localStorage.setItem("island_last_seen_version", currentVersion);
          setTimeout(() => {
            invoke("open_settings_window", { section: "about" }).catch(() => {});
          }, 800);
        }
      } catch {}
    }).catch(() => {});

    return () => window.removeEventListener("island_trigger_onboarding", handleOpenInitialSettings);
  }, []);
  const [wifiName, setWifiName] = useState("Loading...");
  const [btName, setBtName] = useState("Loading...");
  const [displayLevel, setDisplayLevel] = useState(85);
  const [soundLevel, setSoundLevel] = useState(60);
  const [store, setStore] = useState<any>(null);
  const [isAutostart, setIsAutostart] = useState(false);
  const [showGreeting, setShowGreeting] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem("island_show_greeting");
      if (s === "false") return false;
    } catch {}
    return true;
  });
  const [greetingNameMode, setGreetingNameMode] = useState<"auto" | "custom">(() => {
    try {
      const m = localStorage.getItem("island_greeting_name_mode");
      if (m === "custom") return "custom";
    } catch {}
    return "auto";
  });
  const [customGreetingName, setCustomGreetingName] = useState<string>(() => {
    try {
      const v = localStorage.getItem("island_custom_greeting_name");
      if (v && v !== "undefined" && v !== "null") return v;
    } catch {}
    return "";
  });
  const [greetingStage, setGreetingStage] = useState<"compact" | "expanded">("compact");

  useEffect(() => {
    if (notif && (notif.type === "greeting" || notif.icon === "sun" || notif.icon === "moon")) {
      setGreetingStage("compact");
      const stageTimer = setTimeout(() => {
        setGreetingStage("expanded");
      }, 3000);
      return () => clearTimeout(stageTimer);
    } else {
      setGreetingStage("compact");
    }
  }, [notif]);
  const [isBooting, setIsBooting] = useState(false);
  const [optLanguage, setOptLanguage] = useState<Language>(() => getLanguage());

  const [focusMode, setFocusMode] = useState<FocusModeType>(initialFocusMode);
  useEffect(() => { focusModeRef.current = focusMode; }, [focusMode]);
  const [isHotspotOn, setIsHotspotOn] = useState(false);
  const previousBrightnessRef = useRef<number>(85);

  const selectFocusMode = (nextMode: FocusModeType) => {
    const wasSleep = focusMode === "Sleep";
    setFocusMode(nextMode);
    focusModeRef.current = nextMode;
    const isDnd = nextMode === "DND";
    setDndStatus(isDnd);
    invoke("set_windows_dnd", { enabled: isDnd }).catch(console.error);

    if (nextMode === "DND") {
      setNotif(null);
      setNotifQueue([]);
      if (wasSleep && previousBrightnessRef.current) {
        invoke("set_brightness", { level: previousBrightnessRef.current }).catch(console.error);
        setDisplayLevel(previousBrightnessRef.current);
      }
    } else if (nextMode === "Gaming") {
      if (wasSleep && previousBrightnessRef.current) {
        invoke("set_brightness", { level: previousBrightnessRef.current }).catch(console.error);
        setDisplayLevel(previousBrightnessRef.current);
      }
    } else if (nextMode === "Sleep") {
      if (!wasSleep) {
        previousBrightnessRef.current = displayLevel;
      }
      invoke("set_brightness", { level: 35 }).catch(console.error);
      setDisplayLevel(35);
    } else {
      if (wasSleep && previousBrightnessRef.current) {
        invoke("set_brightness", { level: previousBrightnessRef.current }).catch(console.error);
        setDisplayLevel(previousBrightnessRef.current);
      }
    }
  };

  const focusModeOptions: { id: FocusModeType; label: string; desc: string; icon: React.ReactNode; color: string }[] = React.useMemo(() => [
    { id: "Normal", label: t("cc_focus_normal"), desc: t("cc_focus_normal_desc"), icon: <Bell size={13} className="text-amber-300" />, color: "bg-amber-500/20 text-amber-300 border border-amber-500/30" },
    { id: "DND", label: t("cc_focus_dnd"), desc: t("cc_focus_dnd_desc"), icon: <BellOff size={13} className="text-indigo-200" />, color: "bg-indigo-500/25 border border-indigo-500/35 text-indigo-200" },
    { id: "Gaming", label: t("cc_focus_gaming"), desc: t("cc_focus_gaming_desc"), icon: <Gamepad2 size={13} className="text-rose-200" />, color: "bg-rose-500/25 border border-rose-500/35 text-rose-200" },
    { id: "Sleep", label: t("cc_focus_sleep"), desc: t("cc_focus_sleep_desc"), icon: <BedDouble size={13} className="text-teal-200" />, color: "bg-teal-500/25 border border-teal-500/35 text-teal-200" },
  ], [optLanguage]);

  const handleToggleHotspot = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !isHotspotOn;
    setIsHotspotOn(nextState);
    try {
      const finalState = await toggleHotspotState(nextState);
      setIsHotspotOn(finalState);
      showNotif({
        title: t("cc_hotspot"),
        body: finalState ? t("cc_hotspot_on") : t("cc_hotspot_off"),
        icon: "wifi",
        forceShow: true,
      } as any);
    } catch (err: any) {
      setIsHotspotOn(!nextState);
      const errMsg = typeof err === "string" ? err : (err?.message || (getLanguage() === "id" ? "Gagal mengubah status Hotspot" : "Failed to change Hotspot status"));
      showNotif({
        title: t("cc_hotspot"),
        body: errMsg,
        icon: "wifi",
        forceShow: true,
      } as any);
    }
  };

  const [clipboardHistory, setClipboardHistory] = useState<ClipboardItem[]>(() => {
    try {
      const saved = localStorage.getItem("island_clipboard_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const addClipboardItem = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setClipboardHistory((prev) => {
      if (prev.length > 0 && prev[0].text === trimmed) return prev;
      const existing = prev.find((item) => item.text === trimmed);
      const filtered = prev.filter((item) => item.text !== trimmed);
      const updated = [
        {
          id: existing?.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          text: trimmed,
          timestamp: Date.now(),
          pinned: existing?.pinned || false,
        },
        ...filtered,
      ].slice(0, 50);
      try {
        localStorage.setItem("island_clipboard_history", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const addClipboardImageItem = (item: {
    imagePath: string;
    thumbnail: string;
    width: number;
    height: number;
    ocrText?: string;
  }): ClipboardItem => {
    const newItem: ClipboardItem = {
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: "image",
      text: item.ocrText || "",
      timestamp: Date.now(),
      pinned: false,
      imagePath: item.imagePath,
      thumbnail: item.thumbnail,
      width: item.width,
      height: item.height,
    };
    setClipboardHistory((prev) => {
      if (prev.length > 0 && prev[0].imagePath === item.imagePath) return prev;
      const updated = [newItem, ...prev.filter((p) => p.imagePath !== item.imagePath)].slice(0, 50);
      try {
        localStorage.setItem("island_clipboard_history", JSON.stringify(updated));
      } catch {}
      return updated;
    });
    return newItem;
  };

  const togglePinClipboardItem = (id: string) => {
    setClipboardHistory((prev) => {
      const updated = prev.map((item) =>
        item.id === id ? { ...item, pinned: !item.pinned } : item
      );
      try {
        localStorage.setItem("island_clipboard_history", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const updateClipboardItem = (id: string, updates: Partial<ClipboardItem>) => {
    setClipboardHistory((prev) => {
      const updated = prev.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      );
      try {
        localStorage.setItem("island_clipboard_history", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const deleteClipboardItem = (id: string) => {
    setClipboardHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem("island_clipboard_history", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const clearAllClipboard = () => {
    setClipboardHistory((prev) => {
      const pinnedOnly = prev.filter((item) => item.pinned);
      try {
        if (pinnedOnly.length > 0) {
          localStorage.setItem("island_clipboard_history", JSON.stringify(pinnedOnly));
        } else {
          localStorage.removeItem("island_clipboard_history");
        }
      } catch {}
      return pinnedOnly;
    });
  };

  const [isTodo, setIsTodo] = useState(false);
  const isTodoRef = useRef(false);
  useEffect(() => { isTodoRef.current = isTodo; }, [isTodo]);
  const [todoItems, setTodoItems] = useState<TodoItem[]>(() => {
    try {
      const saved = localStorage.getItem("island_todo_list");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const pendingTodos = React.useMemo(() => {
    return todoItems.filter((t) => !t.completed);
  }, [todoItems]);
  const pendingTodosRef = useRef(pendingTodos);
  useEffect(() => {
    pendingTodosRef.current = pendingTodos;
  }, [pendingTodos]);

  const addTodoItem = (
    text: string,
    dueAt?: number | null,
    reminders?: number[],
    repeat?: TodoRepeatRule
  ): TodoItem | undefined => {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    const newItem: TodoItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      completed: false,
      createdAt: Date.now(),
      dueAt: dueAt ?? null,
      reminders: reminders ?? (dueAt ? [0, 10] : []),
      repeat: repeat && repeat !== "none" ? repeat : undefined,
    };
    setTodoItems((prev) => {
      const updated = [newItem, ...prev];
      try {
        localStorage.setItem("island_todo_list", JSON.stringify(updated));
      } catch {}
      return updated;
    });
    return newItem;
  };

  const todoItemsRef = useRef<TodoItem[]>([]);
  useEffect(() => {
    todoItemsRef.current = todoItems;
  }, [todoItems]);

  const toggleTodoItem = useCallback((id: string) => {
    // Decide the sound OUTSIDE the updater: React may run updaters twice in dev
    // StrictMode, which would play the completion sound (and any side effect) twice.
    const target = todoItemsRef.current.find((item) => item.id === id);
    if (target && !target.completed) {
      playTaskCompleteSound();
    }
    setTodoItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (!item) return prev;

      // Recurring task: completing it spawns the next occurrence
      if (!item.completed && item.repeat && item.repeat !== "none") {
        const nextDueAt = computeNextRepeatDue(item.dueAt || Date.now(), item.repeat);
        const completedTask: TodoItem = {
          ...item,
          completed: true,
        };
        const nextTask: TodoItem = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          text: item.text,
          completed: false,
          createdAt: Date.now(),
          dueAt: nextDueAt,
          reminders: item.reminders,
          repeat: item.repeat,
        };
        const updated = [nextTask, ...prev.map((i) => (i.id === id ? completedTask : i))];
        try {
          localStorage.setItem("island_todo_list", JSON.stringify(updated));
        } catch {}
        return updated;
      }

      const updated = prev.map((i) =>
        i.id === id ? { ...i, completed: !i.completed } : i
      );
      try {
        localStorage.setItem("island_todo_list", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const deleteTodoItem = (id: string) => {
    setTodoItems((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem("island_todo_list", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const updateTodoItem = (id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTodoItems((prev) => {
      const updated = prev.map((item) =>
        item.id === id ? { ...item, text: trimmed } : item
      );
      try {
        localStorage.setItem("island_todo_list", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const updateTodoDeadline = (
    id: string,
    dueAt: number | null,
    reminders: number[],
    repeat?: TodoRepeatRule
  ) => {
    setTodoItems((prev) => {
      const updated = prev.map((item) =>
        item.id === id
          ? {
              ...item,
              dueAt,
              reminders,
              repeat: repeat && repeat !== "none" ? repeat : undefined,
            }
          : item
      );
      try {
        localStorage.setItem("island_todo_list", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const clearCompletedTodos = () => {
    setTodoItems((prev) => {
      const updated = prev.filter((item) => !item.completed);
      try {
        localStorage.setItem("island_todo_list", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const clearAllTodos = () => {
    setTodoItems([]);
    try {
      localStorage.removeItem("island_todo_list");
    } catch {}
  };

  const pomodoro = usePomodoro();
  useEffect(() => {
    pomoMuteNotifsRef.current = Boolean(
      pomodoro.isRunning && pomodoro.mode === "focus" && pomodoro.settings.muteNotifsOnFocus
    );
  }, [pomodoro.isRunning, pomodoro.mode, pomodoro.settings.muteNotifsOnFocus]);

  useTodoReminders(
    todoItems,
    focusMode === "DND",
    toggleTodoItem,
    (task, offset) => {
      const bodyText =
        offset <= 0
          ? t("todo_alert_due_now")
          : t("todo_alert_due_in", { min: offset, m: offset });
      showNotif({
        title: task.text,
        body: bodyText,
        icon: "bell",
        onClick: () => goToTab("todo"),
      });
    }
  );

  const [stashedFiles, setStashedFiles] = useState<StashedFile[]>(getInitialShelfFiles);
  const [isDropShelf, setIsDropShelf] = useState(false);
  const isDropShelfRef = useRef(false);
  useEffect(() => { isDropShelfRef.current = isDropShelf; }, [isDropShelf]);
  const [isDragOver, setIsDragOver] = useState(false);
  const isShelfDraggingRef = useRef(false);
  const outgoingShelfPathsRef = useRef<Set<string>>(new Set());

  const [isBrowserActive, setIsBrowserActive] = useState(false);
  const [optAutoCompact, setOptAutoCompact] = useState(true);

  const lastDropTimeRef = useRef<number>(0);

  const addStashedFiles = async (paths: string[]) => {
    if (isShelfDraggingRef.current) return;
    if (!paths || paths.length === 0) return;

    // Clean paths and only accept real filesystem paths (ignore bare DOM filenames without directory separators)
    const cleaned = paths
      .map((p) => p.replace(/^"|"$/g, "").trim())
      .filter((p) => Boolean(p) && (p.includes("\\") || p.includes("/")));
    if (cleaned.length === 0) return;

    // Guard against rapid duplicate drop events (e.g. OS drop + DOM onDrop within 250ms)
    const now = Date.now();
    if (now - lastDropTimeRef.current < 250) {
      return;
    }
    lastDropTimeRef.current = now;

    const uniqueIncoming = Array.from(new Set(cleaned));

    // Don't duplicate paths that are already in the shelf
    const existingPaths = new Set(stashedFiles.map((f) => f.path.toLowerCase()));
    const finalPaths = uniqueIncoming.filter((p) => !existingPaths.has(p.toLowerCase()));

    if (finalPaths.length === 0) {
      goToTab("drop_shelf");
      return;
    }

    const newItems: StashedFile[] = finalPaths.map((cleanPath) => {
      const name = cleanPath.split(/[\\/]/).pop() || "File";
      const ext = name.includes(".") ? name.split(".").pop() || "" : "";
      return {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        path: cleanPath,
        ext,
        addedAt: Date.now(),
      };
    });

    setStashedFiles((prev) => {
      const updated = [...newItems, ...prev].slice(0, 50);
      persistShelfFiles(updated, true);
      return updated;
    });

    goToTab("drop_shelf");

    // Pre-resolve previews & metadata through the controlled concurrency queue
    queueFilePreviews(newItems, (batch) => {
      setStashedFiles((prev) => {
        let hasChanges = false;
        const updated = prev.map((f) => {
          const res = batch[f.id];
          if (res && !f.sizeFormatted) {
            hasChanges = true;
            return {
              ...f,
              sizeFormatted: res.sizeFormatted,
            };
          }
          return f;
        });
        if (hasChanges) {
          persistShelfFiles(updated, false);
          return updated;
        }
        return prev;
      });
    });
  };


  const removeStashedFile = (id: string) => {
    setStashedFiles((prev) => {
      const updated = prev.filter((f) => f.id !== id);
      persistShelfFiles(updated, true);
      return updated;
    });
  };

  const removeStashedFiles = (ids: string[]) => {
    const idSet = new Set(ids);
    setStashedFiles((prev) => {
      const updated = prev.filter((f) => !idSet.has(f.id));
      persistShelfFiles(updated, true);
      return updated;
    });
  };

  const clearAllStashedFiles = () => {
    clearShelfPreviewCache();
    setStashedFiles([]);
    persistShelfFiles([], true);
  };

  type ExpandedTab =
    | "media_expanded"
    | "quick_control"
    | "todo"
    | "pomodoro"
    | "drop_shelf"
    | "sys_monitor"
    | "mini_note"
    | "water_reminder"
    | "prayer_reminder"
    | "clipboard"
    | "volume_mixer"
    | "notif_center"
    | "settings";

  const [isPrayerReminder, setIsPrayerReminder] = useState(false);
  const isPrayerReminderRef = useRef(false);
  useEffect(() => { isPrayerReminderRef.current = isPrayerReminder; }, [isPrayerReminder]);
  const [prayerToast, setPrayerToast] = useState<PrayerToastPayload | null>(null);

  const [isWaterReminder, setIsWaterReminder] = useState(false);
  const isWaterReminderRef = useRef(false);
  useEffect(() => { isWaterReminderRef.current = isWaterReminder; }, [isWaterReminder]);

  const [waterToast, setWaterToast] = useState<{
    type: WaterToastType;
    amount?: number;
  } | null>(null);
  const [waterData, setWaterData] = useState<WaterData>(() => loadWaterData());

  useEffect(() => {
    const handleWaterChanged = (e: Event) => {
      const custom = e as CustomEvent<WaterData>;
      if (custom.detail) {
        setWaterData(custom.detail);
      } else {
        setWaterData(loadWaterData());
      }
    };
    const handleTriggerToast = (e: Event) => {
      const custom = e as CustomEvent<{ type: WaterToastType; amount?: number }>;
      if (custom.detail) {
        if (!isPlayingRef.current) {
          clearPausedMediaTimer();
          isPausedMediaCollapsedRef.current = true;
          setIsPausedMediaCollapsed(true);
        }
        setWaterToast(custom.detail);
        setIsHidden(false);
        playReminderSound();
      }
    };
    window.addEventListener("gili_water_changed", handleWaterChanged);
    window.addEventListener("gili_trigger_water_toast", handleTriggerToast);
    return () => {
      window.removeEventListener("gili_water_changed", handleWaterChanged);
      window.removeEventListener("gili_trigger_water_toast", handleTriggerToast);
    };
  }, [clearPausedMediaTimer]);

  const { snooze: snoozeWaterReminder } = useWaterReminder({
    isFocusMode: focusMode === "DND" || pomodoro.isRunning,
    onTriggerToast: useCallback((toast: { type: WaterToastType; amount?: number }) => {
      if (!isPlayingRef.current) {
        clearPausedMediaTimer();
        isPausedMediaCollapsedRef.current = true;
        setIsPausedMediaCollapsed(true);
      }
      setWaterToast(toast);
      setIsHidden(false);
      playReminderSound();
    }, [clearPausedMediaTimer]),
  });

  useEffect(() => {
    if (!waterToast) return;
    const timeoutMs = waterToast.type === "time_to_drink" ? 14000 : 5000;
    const timer = setTimeout(() => {
      setWaterToast(null);
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [waterToast]);

  const { schedule: prayerSchedule, refreshSchedule: refreshPrayerSchedule } = usePrayerReminder({
    isFocusMode: focusMode === "DND" || pomodoro.isRunning,
    onTriggerToast: useCallback((toast: PrayerToastPayload) => {
      if (!isPlayingRef.current) {
        clearPausedMediaTimer();
        isPausedMediaCollapsedRef.current = true;
        setIsPausedMediaCollapsed(true);
      }
      setPrayerToast(toast);
      setIsHidden(false);
      playReminderSound();
      if (toast.type === "prayer_time" || toast.type === "pre_reminder") {
        const isId = getLanguage() === "id";
        const pName = getPrayerDisplayName(toast.prayerId, isId ? "id" : "en");
        const saved = addNotificationHistoryItem({
          title:
            toast.type === "pre_reminder"
              ? isId
                ? `${toast.minutesLeft || 10} Menit Menuju Sholat ${pName}`
                : `${toast.minutesLeft || 10}m Until ${pName} Prayer`
              : isId
              ? `Waktunya Sholat ${pName}`
              : `Time for ${pName} Prayer`,
          body: `${toast.prayerTime} · ${toast.locationName}`,
          appName: isId ? "Pengingat" : "Reminders",
          icon: "bell",
        });
        setNotificationsHistory((prev) => [saved, ...prev.filter((i) => i.id !== saved.id)].slice(0, 50));
      }
    }, []),
  });

  useEffect(() => {
    if (!prayerToast) return;
    const timeoutMs = prayerToast.type === "completed" ? 4500 : 15000;
    const timer = setTimeout(() => {
      setPrayerToast(null);
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [prayerToast]);

  const [isPomodoro, setIsPomodoro] = useState(false);
  const isPomodoroRef = useRef(false);
  useEffect(() => { isPomodoroRef.current = isPomodoro; }, [isPomodoro]);

  const [isSysMonitor, setIsSysMonitor] = useState(false);
  const isSysMonitorRef = useRef(false);
  useEffect(() => { isSysMonitorRef.current = isSysMonitor; }, [isSysMonitor]);

  const [isMiniNote, setIsMiniNote] = useState(false);
  const isMiniNoteRef = useRef(false);
  useEffect(() => { isMiniNoteRef.current = isMiniNote; }, [isMiniNote]);

  const [isQuickNoteOpen, setIsQuickNoteOpen] = useState(false);
  const isQuickNoteOpenRef = useRef(false);
  useEffect(() => { isQuickNoteOpenRef.current = isQuickNoteOpen; }, [isQuickNoteOpen]);

  const [isQuickTodoOpen, setIsQuickTodoOpen] = useState(false);
  const isQuickTodoOpenRef = useRef(false);
  useEffect(() => { isQuickTodoOpenRef.current = isQuickTodoOpen; }, [isQuickTodoOpen]);
  const [isQuickTodoSaved, setIsQuickTodoSaved] = useState(false);
  const [isQuickNoteSaved, setIsQuickNoteSaved] = useState(false);

  useEffect(() => {
    const isInteractive = isQuickNoteOpen || isQuickTodoOpen;
    invoke("set_interactive_mode", { active: isInteractive }).catch(console.error);
    if (isInteractive) {
      invoke("focus_notch_window").catch(console.error);
    }
  }, [isQuickNoteOpen, isQuickTodoOpen]);

  const [slideDirection, setSlideDirection] = useState<number>(0);
  const [controlCenterSubmenu, setControlCenterSubmenu] = useState<null | "wifi" | "bluetooth">(null);

  const [tabsPrefs, setTabsPrefs] = useState<NotchTabsPreferences>(() => loadTabsPreferences());
  const tabsPrefsRef = useRef(tabsPrefs);
  useEffect(() => {
    tabsPrefsRef.current = tabsPrefs;
  }, [tabsPrefs]);

  const availableTabs: ExpandedTab[] = React.useMemo(() => {
    return getOrderedEnabledTabs(tabsPrefs) as ExpandedTab[];
  }, [tabsPrefs]);

  const currentTab: ExpandedTab | null = React.useMemo(() => {
    if (isSettings) return "settings";
    if (isNotifications) return "notif_center";
    if (isVolumeMixer) return "volume_mixer";
    if (isClipboard) return "clipboard";
    if (isPrayerReminder) return "prayer_reminder";
    if (isWaterReminder) return "water_reminder";
    if (isMiniNote) return "mini_note";
    if (isSysMonitor) return "sys_monitor";
    if (isDropShelf) return "drop_shelf";
    if (isPomodoro) return "pomodoro";
    if (isTodo) return "todo";
    if (isQuickControl) return "quick_control";
    if (isExpanded) return "media_expanded";
    return null;
  }, [isSettings, isNotifications, isVolumeMixer, isClipboard, isPrayerReminder, isWaterReminder, isMiniNote, isSysMonitor, isDropShelf, isPomodoro, isTodo, isQuickControl, isExpanded]);

  const isSubPage = Boolean(
    currentTab &&
      (currentTab === "clipboard" || currentTab === "volume_mixer" || currentTab === "notif_center") &&
      !availableTabs.includes(currentTab)
  );

  const currentTabIndex = React.useMemo(() => {
    if (!currentTab) return -1;
    return availableTabs.indexOf(currentTab);
  }, [currentTab, availableTabs]);

  const lastActiveTabRef = useRef<ExpandedTab>((() => {
    try {
      const saved = localStorage.getItem("island_last_active_tab");
      if (saved) return saved as ExpandedTab;
    } catch {}
    return "quick_control";
  })());
  const lastPanelClosedAtRef = useRef<number>((() => {
    try {
      const saved = localStorage.getItem("island_last_panel_closed_at");
      if (saved) return parseInt(saved, 10);
    } catch {}
    return 0;
  })());

  const currentTabRef = useRef<ExpandedTab | null>(currentTab);
  useEffect(() => {
    currentTabRef.current = currentTab;
    if (currentTab) {
      lastActiveTabRef.current = currentTab;
      try {
        localStorage.setItem("island_last_active_tab", currentTab);
      } catch {}
    }
    if (currentTab === "quick_control") {
      fetchHotspotStatus().then(setIsHotspotOn).catch(() => {});
    }
  }, [currentTab]);

  const cancelCollapseTimer = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  };

  const compactHoverTimerRef = useRef<number | null>(null);

  const cancelCompactHoverTimer = () => {
    if (compactHoverTimerRef.current) {
      clearTimeout(compactHoverTimerRef.current);
      compactHoverTimerRef.current = null;
    }
  };

  const handleCloseImmediate = useCallback(() => {
    if (isSwitchingTabRef.current) return;
    const hadOpenPanel =
      isExpandedRef.current ||
      isQuickControlRef.current ||
      isTodoRef.current ||
      isPomodoroRef.current ||
      isDropShelfRef.current ||
      isSysMonitorRef.current ||
      isMiniNoteRef.current ||
      isPrayerReminderRef.current ||
      isWaterReminderRef.current ||
      isQuickNoteOpenRef.current ||
      isQuickTodoOpenRef.current ||
      isClipboardRef.current ||
      isVolumeMixerRef.current ||
      isNotificationsRef.current ||
      isSettingsRef.current ||
      currentTabRef.current !== null;

    if (hadOpenPanel) {
      isClosingRef.current = true;
      closeGraceUntilRef.current = Date.now() + 450;
      if (finishClosingTimerRef.current) {
        clearTimeout(finishClosingTimerRef.current);
      }
      finishClosingTimerRef.current = window.setTimeout(finishClosing, 450);
    } else {
      isClosingRef.current = false;
    }
    isCursorInsideNotchRef.current = false;
    isShortcutPinnedRef.current = false;
    if (shortcutPinnedTimerRef.current) {
      clearTimeout(shortcutPinnedTimerRef.current);
      shortcutPinnedTimerRef.current = null;
    }
    cancelCollapseTimer();
    cancelCompactHoverTimer();
    setSlideDirection(0);
    setIsDragOver(false);
    setIsSettings(false);
    isSettingsRef.current = false;
    setIsNotifications(false);
    isNotificationsRef.current = false;
    setIsVolumeMixer(false);
    isVolumeMixerRef.current = false;
    setIsClipboard(false);
    isClipboardRef.current = false;
    setIsPrayerReminder(false);
    isPrayerReminderRef.current = false;
    setIsWaterReminder(false);
    isWaterReminderRef.current = false;
    setIsMiniNote(false);
    isMiniNoteRef.current = false;
    setIsSysMonitor(false);
    isSysMonitorRef.current = false;
    setIsPomodoro(false);
    isPomodoroRef.current = false;
    setIsTodo(false);
    isTodoRef.current = false;
    setIsDropShelf(false);
    isDropShelfRef.current = false;
    setIsQuickControl(false);
    isQuickControlRef.current = false;
    setIsExpanded(false);
    isExpandedRef.current = false;
    currentTabRef.current = null;
    setIsQuickNoteOpen(false);
    setIsQuickNoteSaved(false);
    setIsQuickTodoOpen(false);
    setIsQuickTodoSaved(false);
    const now = Date.now();
    lastPanelClosedAtRef.current = now;
    try {
      localStorage.setItem("island_last_panel_closed_at", String(now));
    } catch {}
    if (!isPlayingRef.current) {
      clearPausedMediaTimer();
      isPausedMediaCollapsedRef.current = true;
      setIsPausedMediaCollapsed(true);
    }
    invoke("broadcast_settings_sync", {
      payload: { type: "notch_tab_state", tab: null, isOpen: false },
    }).catch(() => {});

    if (hadOpenPanel) {
      const idleSize = variantsRef.current?.idle || { width: 120, height: 35 };
      invoke("update_pill_size", {
        width: idleSize.width,
        height: idleSize.height,
        isBottom: isBottomNotchPosition(optPositionRef.current),
        position: optPositionRef.current,
        topOffset: islandTopOffsetRef.current,
        isIsland: isIslandRef.current,
        dpr: window.devicePixelRatio || 1.0,
      }).catch(() => {});
    }
  }, [clearPausedMediaTimer]);

  const openLastOrPreferredTab = (forceTab?: ExpandedTab) => {
    if (isClosingRef.current || Date.now() < closeGraceUntilRef.current) return;
    cancelCollapseTimer();
    setSlideDirection(0);
    isClosingRef.current = false;
    setTabSwitchGrace(600);
    const elapsed = lastPanelClosedAtRef.current > 0
      ? Date.now() - lastPanelClosedAtRef.current
      : Infinity;
    const tabExpired = elapsed > 3 * 60 * 1000;
    
    let target: ExpandedTab = forceTab || "quick_control";
    if (!forceTab) {
      const hasMediaTrack = Boolean(mediaRef.current?.title || lastMediaPayloadRef.current?.title);
      const isMusicActive = Boolean(
        hasMediaTrack && (isPlayingRef.current || ((variantRef.current === "media" || variantRef.current === "lyrics_idle") && !isPausedMediaCollapsedRef.current))
      );
      const openBehavior = tabsPrefsRef.current.defaultOpenBehavior;
      if (isMusicActive) {
        target = "media_expanded";
      } else if (openBehavior === "first_tab") {
        target = (availableTabs[0] as ExpandedTab) || "quick_control";
      } else if (openBehavior === "quick_control") {
        target = "quick_control";
      } else if (!tabExpired && lastActiveTabRef.current) {
        target = lastActiveTabRef.current;
      } else {
        target = (availableTabs[0] as ExpandedTab) || "quick_control";
      }

      if (target === "media_expanded" && !hasMediaTrack) {
        target = "quick_control";
      }
      if (!availableTabs.includes(target)) {
        target = availableTabs.includes("quick_control")
          ? "quick_control"
          : (availableTabs[0] || "quick_control");
      }
    }

    currentTabRef.current = null;
    goToTab(target, 0);
  };

  const handleCompactHoverTrigger = () => {
    if (!isCursorInsideNotchRef.current) return;
    openLastOrPreferredTab();
  };

  const startCompactHoverTimer = (delayMs: number = 80) => {
    cancelCompactHoverTimer();
    compactHoverTimerRef.current = window.setTimeout(() => {
      handleCompactHoverTrigger();
    }, delayMs);
  };

  const [optCloseDelay, setOptCloseDelay] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("island_close_delay");
      if (saved !== null) {
        const num = Number(saved);
        if (num === 0 || num === 1 || num === 3 || num === -1) return num;
      }
    } catch {}
    return 0;
  });
  const optCloseDelayRef = useRef(optCloseDelay);
  useEffect(() => { optCloseDelayRef.current = optCloseDelay; }, [optCloseDelay]);

  const isSwitchingTabRef = useRef(false);
  const tabSwitchTimerRef = useRef<number | null>(null);

  const setTabSwitchGrace = (durationMs = 500) => {
    isSwitchingTabRef.current = true;
    if (tabSwitchTimerRef.current) clearTimeout(tabSwitchTimerRef.current);
    tabSwitchTimerRef.current = window.setTimeout(() => {
      isSwitchingTabRef.current = false;
      tabSwitchTimerRef.current = null;
      if (!isCursorInsideNotchRef.current) {
        startCollapseTimer();
      }
    }, durationMs);
  };

  // Reads refs, not state: this gets called from listeners registered once on mount
  const startCollapseTimer = (_delayMs: number = 0) => {
    cancelCollapseTimer();
    cancelCompactHoverTimer();
    if (isCursorInsideNotchRef.current || isSwitchingTabRef.current || isShortcutPinnedRef.current) return;

    const pillEl = notchPillRef.current;
    if (pillEl) {
      if (pillEl.matches(":hover")) {
        isCursorInsideNotchRef.current = true;
        return;
      }
      const activeEl = document.activeElement;
      if (
        activeEl &&
        pillEl.contains(activeEl) &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")
      ) {
        return;
      }
    }

    const hasOpenPanel =
      isExpandedRef.current ||
      isQuickControlRef.current ||
      isTodoRef.current ||
      isPomodoroRef.current ||
      isDropShelfRef.current ||
      isSysMonitorRef.current ||
      isMiniNoteRef.current ||
      isPrayerReminderRef.current ||
      isWaterReminderRef.current ||
      isQuickNoteOpenRef.current ||
      isQuickTodoOpenRef.current ||
      isClipboardRef.current ||
      isVolumeMixerRef.current ||
      isNotificationsRef.current ||
      isSettingsRef.current;

    if (hasOpenPanel) {
      const configuredSec = optCloseDelayRef.current;
      if (configuredSec === -1) {
        return;
      }
      // When user configures "Instant" (0s), keep a minimal 90ms debounce buffer.
      // A pure 0ms timeout executes on the next event loop tick and can mistakenly
      // collapse the panel during sub-pixel DOM reflows, re-renders, or transient pointerleave events.
      const effectiveDelay =
        configuredSec === 0
          ? 90
          : configuredSec > 0
          ? configuredSec * 1000
          : Math.max(_delayMs, 280);

      collapseTimerRef.current = window.setTimeout(async () => {
        if (isCursorInsideNotchRef.current || isSwitchingTabRef.current || isShortcutPinnedRef.current) return;
        if (optCloseDelayRef.current === -1) return;

        const currentPillEl = notchPillRef.current;
        if (currentPillEl) {
          if (currentPillEl.matches(":hover")) {
            isCursorInsideNotchRef.current = true;
            cancelCollapseTimer();
            return;
          }
          const activeEl = document.activeElement;
          if (
            activeEl &&
            currentPillEl.contains(activeEl) &&
            (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")
          ) {
            cancelCollapseTimer();
            return;
          }
        }

        try {
          const inNotch = await invoke<boolean>("is_cursor_in_notch");
          if (inNotch) {
            isCursorInsideNotchRef.current = true;
            cancelCollapseTimer();
            return;
          }
        } catch {}

        handleCloseImmediate();
      }, effectiveDelay);
    }
  };

  const lastSysInfoFetchRef = useRef<number>(0);
  const fetchSystemStatus = () => {
    const now = Date.now();
    if (now - lastSysInfoFetchRef.current < 4000) return;
    lastSysInfoFetchRef.current = now;

    invoke<[string, string]>("get_system_info").then(res => {
      setWifiName(res[0]);
      setBtName(res[1]);
    }).catch(console.error);
    invoke<number>("get_master_volume").then(v => setSoundLevel(Math.round(v * 100))).catch(console.error);
    invoke<number>("get_brightness").then(b => setDisplayLevel(b)).catch(console.error);
  };

  const goToTab = (targetTab: ExpandedTab, direction?: 1 | -1 | 0) => {
    cancelCollapseTimer();
    if (currentTab === targetTab) return;
    const wasAlreadyOpen = Boolean(currentTab);
    isClosingRef.current = false;
    setTabSwitchGrace(600);
    const currentIndex = currentTabIndex;
    const targetIndex = availableTabs.indexOf(targetTab);
    const resolvedDirection = direction !== undefined 
      ? direction 
      : (targetIndex >= 0 && currentIndex >= 0 ? (targetIndex >= currentIndex ? 1 : -1) : 0);

    setSlideDirection(resolvedDirection);
    setControlCenterSubmenu(null);
    setIsNoteEditing(false);

    if (targetTab === "settings" && currentTab && currentTab !== "settings") {
      tabBeforeSettingsRef.current = currentTab;
    }
    if (targetTab === "notif_center" && currentTab && currentTab !== "notif_center") {
      tabBeforeNotifRef.current = currentTab;
    }

    isExpandedRef.current = targetTab === "media_expanded";
    setIsExpanded(targetTab === "media_expanded");

    isQuickControlRef.current = targetTab === "quick_control";
    setIsQuickControl(targetTab === "quick_control");

    isTodoRef.current = targetTab === "todo";
    setIsTodo(targetTab === "todo");

    isPomodoroRef.current = targetTab === "pomodoro";
    setIsPomodoro(targetTab === "pomodoro");

    isDropShelfRef.current = targetTab === "drop_shelf";
    setIsDropShelf(targetTab === "drop_shelf");

    isSysMonitorRef.current = targetTab === "sys_monitor";
    setIsSysMonitor(targetTab === "sys_monitor");

    isMiniNoteRef.current = targetTab === "mini_note";
    setIsMiniNote(targetTab === "mini_note");

    isWaterReminderRef.current = targetTab === "water_reminder";
    setIsWaterReminder(targetTab === "water_reminder");

    isPrayerReminderRef.current = targetTab === "prayer_reminder";
    setIsPrayerReminder(targetTab === "prayer_reminder");

    isClipboardRef.current = targetTab === "clipboard";
    setIsClipboard(targetTab === "clipboard");

    isVolumeMixerRef.current = targetTab === "volume_mixer";
    setIsVolumeMixer(targetTab === "volume_mixer");

    isSettingsRef.current = targetTab === "settings";
    setIsSettings(targetTab === "settings");

    isNotificationsRef.current = targetTab === "notif_center";
    setIsNotifications(targetTab === "notif_center");

    // Defer background status refresh until after the expand animation settles so it never stutters mid-spring
    invoke("broadcast_settings_sync", {
      payload: { type: "notch_tab_state", tab: targetTab, isOpen: true },
    }).catch(() => {});
    const fetchDelay = wasAlreadyOpen ? 40 : 260;
    if (targetTab === "quick_control") {
      window.setTimeout(() => fetchSystemStatus(), fetchDelay);
    } else if (targetTab === "volume_mixer") {
      window.setTimeout(() => {
        invoke<any[]>("get_audio_sessions").then(setAudioSessions).catch(console.error);
      }, fetchDelay);
    }
  };

  notchHoverEnterRef.current = () => {
    if (isClosingRef.current || Date.now() < closeGraceUntilRef.current) return;
    isCursorInsideNotchRef.current = true;
    isShortcutPinnedRef.current = false;
    if (shortcutPinnedTimerRef.current) {
      clearTimeout(shortcutPinnedTimerRef.current);
      shortcutPinnedTimerRef.current = null;
    }
    cancelCollapseTimer();
    if (currentNotifRef.current) return;
    if (focusModeRef.current === "Gaming") return;
    if (variantRef.current === "compact") {
      startCompactHoverTimer(80);
    } else if (variantRef.current === "media" || variantRef.current === "lyrics_idle") {
      goToTab("media_expanded", 0);
    } else if (variantRef.current === "idle" || currentTabRef.current === null) {
      openLastOrPreferredTab();
    }
  };

  const handlePrevTab = () => {
    if (currentTabIndex > 0) {
      goToTab(availableTabs[currentTabIndex - 1], -1);
    }
  };

  const handleNextTab = () => {
    if (currentTabIndex >= 0 && currentTabIndex < availableTabs.length - 1) {
      goToTab(availableTabs[currentTabIndex + 1], 1);
    }
  };

  const handleSelectTab = (idx: number) => {
    if (idx >= 0 && idx < availableTabs.length && idx !== currentTabIndex) {
      const dir = idx > currentTabIndex ? 1 : -1;
      goToTab(availableTabs[idx], dir);
    }
  };

  const tabBeforeSettingsRef = useRef<ExpandedTab | null>(null);

  const handleToggleSettings = () => {
    if (currentTab === "settings") {
      const fallbackTab: ExpandedTab =
        lastActiveTabRef.current && (lastActiveTabRef.current as string) !== "settings"
          ? lastActiveTabRef.current
          : (availableTabs[0] as ExpandedTab) || "quick_control";
      const target =
        tabBeforeSettingsRef.current && (tabBeforeSettingsRef.current as string) !== "settings"
          ? tabBeforeSettingsRef.current
          : fallbackTab;
      tabBeforeSettingsRef.current = null;
      goToTab(target, -1);
      return;
    }
    tabBeforeSettingsRef.current = currentTab;
    goToTab("settings", 1);
  };

  const handleToggleNotifications = () => {
    if (currentTab === "notif_center") {
      const fallbackTab: ExpandedTab =
        lastActiveTabRef.current && (lastActiveTabRef.current as string) !== "notif_center"
          ? lastActiveTabRef.current
          : (availableTabs[0] as ExpandedTab) || "quick_control";
      const target =
        tabBeforeNotifRef.current && (tabBeforeNotifRef.current as string) !== "notif_center"
          ? tabBeforeNotifRef.current
          : fallbackTab;
      tabBeforeNotifRef.current = null;
      goToTab(target, -1);
      return;
    }
    tabBeforeNotifRef.current = currentTab;
    goToTab("notif_center", 1);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isQuickTodoOpenRef.current || isQuickNoteOpenRef.current) {
          setIsQuickTodoOpen(false);
          setIsQuickTodoSaved(false);
          setIsQuickNoteOpen(false);
          setIsQuickNoteSaved(false);
          invoke("restore_previous_foreground_window").catch(() => {});
          return;
        }
        if (isShortcutPinnedRef.current || currentTabRef.current) {
          isShortcutPinnedRef.current = false;
          handleCloseImmediate();
          return;
        }
      }

      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if (!currentTab) return;
      if (currentTab === "clipboard" || currentTab === "volume_mixer" || currentTab === "notif_center") {
        if (e.key === "Escape" || e.key === "ArrowLeft") {
          if (currentTab === "notif_center") {
            goToTab(tabBeforeNotifRef.current ?? (media ? "media_expanded" : "quick_control"), -1);
          } else {
            goToTab("quick_control", -1);
          }
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        handlePrevTab();
      } else if (e.key === "ArrowRight") {
        handleNextTab();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTab, currentTabIndex, availableTabs]);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, []);
  
  const [optVolume, setOptVolume] = useState(true);
  const [optClipboard, setOptClipboard] = useState(true);
  const [optOcr, setOptOcr] = useState(false);
  const [optMedia, setOptMedia] = useState(true);
  const [optSoundFx, setOptSoundFx] = useState<boolean>(() => isSoundEffectsEnabled());
  const [optPosition, setOptPosition] = useState<NotchPosition>(() => {
    try {
      const p = localStorage.getItem("island_position");
      if (isValidNotchPosition(p)) return p;
    } catch {}
    return "top";
  });
  const optPositionRef = useRef<NotchPosition>(optPosition);
  useEffect(() => {
    optPositionRef.current = optPosition;
  }, [optPosition]);
  const [optTargetMonitor, setOptTargetMonitor] = useState<string>(() => {
    try {
      return localStorage.getItem("island_target_monitor") || "primary";
    } catch {
      return "primary";
    }
  });
  const optTargetMonitorRef = useRef<string>(optTargetMonitor);
  useEffect(() => {
    optTargetMonitorRef.current = optTargetMonitor;
  }, [optTargetMonitor]);
  const [optOpacity, setOptOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("island_opacity");
      if (saved !== null) {
        const n = Number(saved);
        if (!isNaN(n) && n >= 0.15 && n <= 1.0) return n;
      }
    } catch {}
    return 1.0;
  });
  const [optBlur, setOptBlur] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("island_blur");
      if (saved !== null) {
        const n = Number(saved);
        if (!isNaN(n) && n >= 0 && n <= 100) return n;
      }
    } catch {}
    return 0;
  });
  const [optAnimSpeed, setOptAnimSpeed] = useState<"snappy"|"smooth"|"bouncy">("smooth");
  const [optAccent, setOptAccent] = useState<"default"|"pink"|"blue"|"green">("default");
  const [optNotifTime, setOptNotifTime] = useState<number>(3);
  const [optNotifSound, setOptNotifSound] = useState<string>(() => getSavedNotifSound());
  const optNotifSoundRef = useRef(optNotifSound);
  useEffect(() => { optNotifSoundRef.current = optNotifSound; }, [optNotifSound]);
  const [notchShape, setNotchShape] = useState<"notch" | "island">(() => {
    try {
      const s = localStorage.getItem("island_notch_shape");
      if (s === "island" || s === "notch") return s;
    } catch {}
    return "notch";
  });
  const [islandTopOffset, setIslandTopOffset] = useState<number>(() => {
    try {
      const o = Number(localStorage.getItem("island_top_offset"));
      if (!isNaN(o) && o >= 6 && o <= 16) return o;
    } catch {}
    return 10;
  });
  const [shapeTransitionY, setShapeTransitionY] = useState(0);
  const [optEars, setOptEars] = useState<boolean>(true);
  const [optTheme, setOptTheme] = useState<"dark" | "light" | "auto">(() => {
    try {
      const s = localStorage.getItem("island_theme");
      if (s === "dark" || s === "light" || s === "auto") return s;
    } catch {}
    return "dark";
  });
  const [idleLayout, setIdleLayout] = useState<IdleLayoutConfig>(() => getSavedIdleLayout());
  const [optIdleSize, setOptIdleSize] = useState<"compact" | "default" | "large">("default");
  const [optTabSize, setOptTabSize] = useState<"compact" | "default" | "large">("default");
  const [optFontSize, setOptFontSize] = useState<"small" | "default" | "large">("default");

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const isLightMode = optTheme === "light" || (optTheme === "auto" && !systemPrefersDark);

  const dateDisplay = useMemo(() => {
    try {
      const weekday = time.toLocaleDateString(optLanguage === "id" ? "id-ID" : "en-US", { weekday: "short" }).replace(".", "");
      return `${weekday}, ${time.getDate()}`;
    } catch {
      return `${time.getDate()}`;
    }
  }, [time, optLanguage]);

  const fullDateTitle = useMemo(() => {
    try {
      return time.toLocaleDateString(optLanguage === "id" ? "id-ID" : "en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return "";
    }
  }, [time, optLanguage]);

  useEffect(() => {
    if (isLightMode) {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }, [isLightMode]);

  const handleChangeLanguage = async (newLang: Language) => {
    setLanguage(newLang, false);
    setOptLanguage(newLang);
    if (store) {
      try {
        await store.set("opt_language", newLang);
        await store.save();
      } catch {}
    }
  };

  const handleChangeNotchShape = useCallback(async (shape: "notch" | "island") => {
    if (shape !== notchShape) {
      const offset = islandTopOffset || 10;
      // Counter-offset Y for butter-smooth physical detachment/docking spring
      setShapeTransitionY(shape === "island" ? -offset : offset);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShapeTransitionY(0);
        });
      });
    }

    setNotchShape(shape);
    try { localStorage.setItem("island_notch_shape", shape); } catch {}
    if (store) {
      try {
        await store.set("notch_shape", shape);
        await store.save();
      } catch {}
    }
    invoke("set_window_position", {
      isBottom: isBottomNotchPosition(optPosition),
      position: optPosition,
      topOffset: islandTopOffset,
      isIsland: shape === "island",
      targetMonitor: optTargetMonitorRef.current,
    }).catch(console.error);
  }, [store, optPosition, islandTopOffset, notchShape]);

  const handleChangeIslandTopOffset = useCallback(async (offset: number) => {
    const clamped = Math.max(6, Math.min(16, Math.round(offset)));
    setIslandTopOffset(clamped);
    try { localStorage.setItem("island_top_offset", String(clamped)); } catch {}
    if (store) {
      try {
        await store.set("island_top_offset", clamped);
        await store.save();
      } catch {}
    }
    invoke("set_window_position", {
      isBottom: isBottomNotchPosition(optPosition),
      position: optPosition,
      topOffset: clamped,
      isIsland: notchShape === "island",
      targetMonitor: optTargetMonitorRef.current,
    }).catch(console.error);
  }, [store, optPosition, notchShape]);
  
  const [camActive, setCamActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const optVolumeRef = useRef(optVolume);
  useEffect(() => { optVolumeRef.current = optVolume; }, [optVolume]);
  const optClipboardRef = useRef(optClipboard);
  useEffect(() => { optClipboardRef.current = optClipboard; }, [optClipboard]);
  const optOcrRef = useRef(optOcr);
  useEffect(() => { optOcrRef.current = optOcr; }, [optOcr]);
  const optNotifTimeRef = useRef(optNotifTime);
  useEffect(() => { optNotifTimeRef.current = optNotifTime; }, [optNotifTime]);
  const lastMediaPayloadRef = useRef<MediaPayload | null>(null);
  const optMediaRef = useRef(optMedia);
  useEffect(() => {
    optMediaRef.current = optMedia;
    if (!optMedia) {
      setMedia(null);
      setIsExpanded(false);
    } else {
      if (lastMediaPayloadRef.current && (lastMediaPayloadRef.current.title || lastMediaPayloadRef.current.artist)) {
        setMedia(lastMediaPayloadRef.current);
        setIsPlaying(lastMediaPayloadRef.current.is_playing);
      }
    }
  }, [optMedia]);

  

  const [shortcuts, setShortcuts] = useState<Record<ShortcutActionId, string | null>>(() => {
    try {
      const saved = localStorage.getItem("island_shortcuts");
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged: Record<ShortcutActionId, string | null> = { ...DEFAULT_SHORTCUTS, ...parsed };
        for (const action of SHORTCUT_ACTIONS) {
          if (action.defaultShortcut && !merged[action.id]) {
            merged[action.id] = action.defaultShortcut;
          }
        }
        return merged;
      }
    } catch {}
    return { ...DEFAULT_SHORTCUTS };
  });

  const [shortcutsEnabled, setShortcutsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("island_shortcuts_enabled");
      if (saved !== null) {
        return saved === "true";
      }
    } catch {}
    return true;
  });

  const [shortcutStatuses, setShortcutStatuses] = useState<Record<ShortcutActionId, ShortcutStatus>>({
    toggle_notch: "inactive",
    quick_task: "inactive",
    quick_note: "inactive",
    open_media: "inactive",
    toggle_media_playback: "inactive",
    toggle_focus_mode: "inactive",
    toggle_hide: "inactive",
    switch_monitor: "inactive",
  });

  const handleShortcutToggleNotch = useCallback(() => {
    if (isExpandedRef.current || currentTabRef.current !== null) {
      isShortcutPinnedRef.current = false;
      if (shortcutPinnedTimerRef.current) {
        clearTimeout(shortcutPinnedTimerRef.current);
        shortcutPinnedTimerRef.current = null;
      }
      handleCloseImmediate();
    } else {
      setIsHidden(false);
      openLastOrPreferredTab();
      invoke("focus_notch_window").catch(() => {});
      isShortcutPinnedRef.current = true;
      if (shortcutPinnedTimerRef.current) clearTimeout(shortcutPinnedTimerRef.current);
      shortcutPinnedTimerRef.current = window.setTimeout(() => {
        const pillEl = notchPillRef.current;
        const activeEl = document.activeElement;
        const isTyping = activeEl && pillEl?.contains(activeEl) && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
        if (!isTyping && !isCursorInsideNotchRef.current && isShortcutPinnedRef.current) {
          isShortcutPinnedRef.current = false;
          handleCloseImmediate();
        }
      }, 6000);
    }
  }, [handleCloseImmediate, openLastOrPreferredTab]);

  const handleShortcutQuickTask = useCallback(async () => {
    try {
      await invoke("save_previous_foreground_window");
    } catch {}
    setIsHidden(false);
    setIsQuickControl(false);
    setIsTodo(false);
    setIsPomodoro(false);
    setIsDropShelf(false);
    setIsSysMonitor(false);
    setIsMiniNote(false);
    setIsPrayerReminder(false);
    setIsWaterReminder(false);
    setIsClipboard(false);
    setIsSettings(false);
    setIsVolumeMixer(false);
    setIsExpanded(false);
    setIsQuickNoteOpen(false);
    setIsQuickNoteSaved(false);
    setIsQuickTodoSaved(false);
    setIsQuickTodoOpen((prev) => !prev);
    invoke("focus_notch_window").catch(() => {});
  }, []);

  const handleShortcutQuickNote = useCallback(async () => {
    try {
      await invoke("save_previous_foreground_window");
    } catch {}
    setIsHidden(false);
    setIsQuickControl(false);
    setIsTodo(false);
    setIsPomodoro(false);
    setIsDropShelf(false);
    setIsSysMonitor(false);
    setIsMiniNote(false);
    setIsPrayerReminder(false);
    setIsWaterReminder(false);
    setIsClipboard(false);
    setIsSettings(false);
    setIsVolumeMixer(false);
    setIsExpanded(false);
    setIsQuickTodoOpen(false);
    setIsQuickTodoSaved(false);
    setIsQuickNoteSaved(false);
    setIsQuickNoteOpen((prev) => !prev);
    invoke("focus_notch_window").catch(() => {});
  }, []);

  const handleShortcutOpenMedia = useCallback(() => {
    setIsHidden(false);
    goToTab("media_expanded", 0);
    invoke("focus_notch_window").catch(() => {});
    isShortcutPinnedRef.current = true;
    if (shortcutPinnedTimerRef.current) clearTimeout(shortcutPinnedTimerRef.current);
    shortcutPinnedTimerRef.current = window.setTimeout(() => {
      if (!isCursorInsideNotchRef.current && isShortcutPinnedRef.current) {
        isShortcutPinnedRef.current = false;
        handleCloseImmediate();
      }
    }, 6000);
  }, [handleCloseImmediate]);

  const handleShortcutToggleMediaPlayback = useCallback(() => {
    invoke("smtc_action", { action: "toggle" }).catch(console.error);
  }, []);

  const handleShortcutToggleFocusMode = useCallback(() => {
    const nextMode = focusModeRef.current === "Normal" ? "DND" : "Normal";
    selectFocusMode(nextMode);
  }, []);

  const handleShortcutToggleHide = useCallback(() => {
    setIsHidden((prev) => !prev);
  }, []);

  const handleShortcutSwitchMonitor = useCallback(async () => {
    try {
      const monitors = await invoke<MonitorInfo[]>("get_available_monitors");
      if (!Array.isArray(monitors) || monitors.length === 0) return;

      if (monitors.length <= 1) {
        showNotif({
          title: "Gili Notch",
          body: t("monitor_single_detected"),
          icon: "monitor",
          type: "system",
        });
        return;
      }

      const currentTarget = optTargetMonitorRef.current || "primary";
      let currentIndex = monitors.findIndex(
        (m) => m.id === currentTarget || (currentTarget === "primary" && m.is_primary)
      );
      if (currentIndex === -1) {
        currentIndex = monitors.findIndex((m) => m.is_current);
      }
      if (currentIndex === -1) currentIndex = 0;

      const nextIndex = (currentIndex + 1) % monitors.length;
      const targetMon = monitors[nextIndex];
      const nextId = targetMon.id;

      setOptTargetMonitor(nextId);
      optTargetMonitorRef.current = nextId;

      try {
        localStorage.setItem("island_target_monitor", nextId);
      } catch {}

      if (store) {
        try {
          await store.set("opt_target_monitor", nextId);
          await store.save();
        } catch (err) {
          console.error("Failed to save target monitor:", err);
        }
      }

      await invoke("set_target_monitor", { targetMonitor: nextId });
      invoke("broadcast_settings_sync", {
        payload: { type: "opt_target_monitor", value: nextId },
      }).catch(() => {});

      const label = targetMon.name
        ? `${targetMon.name} (${targetMon.width}x${targetMon.height})`
        : `Monitor ${nextIndex + 1} (${targetMon.width}x${targetMon.height})`;

      showNotif({
        title: "Gili Notch",
        body: `${t("monitor_switched_to")} ${label}`,
        icon: "monitor",
        type: "system",
      });
    } catch (err) {
      console.error("[Shortcut] Failed to switch monitor:", err);
    }
  }, [store]);

  const shortcutHandlersRef = useRef({
    toggle_notch: handleShortcutToggleNotch,
    quick_task: handleShortcutQuickTask,
    quick_note: handleShortcutQuickNote,
    open_media: handleShortcutOpenMedia,
    toggle_media_playback: handleShortcutToggleMediaPlayback,
    toggle_focus_mode: handleShortcutToggleFocusMode,
    toggle_hide: handleShortcutToggleHide,
    switch_monitor: handleShortcutSwitchMonitor,
  });

  useEffect(() => {
    shortcutHandlersRef.current = {
      toggle_notch: handleShortcutToggleNotch,
      quick_task: handleShortcutQuickTask,
      quick_note: handleShortcutQuickNote,
      open_media: handleShortcutOpenMedia,
      toggle_media_playback: handleShortcutToggleMediaPlayback,
      toggle_focus_mode: handleShortcutToggleFocusMode,
      toggle_hide: handleShortcutToggleHide,
      switch_monitor: handleShortcutSwitchMonitor,
    };
    shortcutManager.updateHandlers(shortcutHandlersRef.current);
  }, [
    handleShortcutToggleNotch,
    handleShortcutQuickTask,
    handleShortcutQuickNote,
    handleShortcutOpenMedia,
    handleShortcutToggleMediaPlayback,
    handleShortcutToggleFocusMode,
    handleShortcutToggleHide,
    handleShortcutSwitchMonitor,
  ]);

  useEffect(() => {
    let isCancelled = false;
    const applyShortcuts = async () => {
      const statuses = await shortcutManager.applyAll(
        shortcuts,
        shortcutsEnabled,
        shortcutHandlersRef.current
      );
      if (!isCancelled) {
        setShortcutStatuses(statuses);
      }
    };
    applyShortcuts();
    return () => {
      isCancelled = true;
    };
  }, [shortcuts, shortcutsEnabled]);

  const handleUpdateShortcut = useCallback(
    async (actionId: ShortcutActionId, newShortcut: string | null): Promise<{ success: boolean; error?: string }> => {
      const prevShortcut = shortcuts[actionId];
      if (prevShortcut) {
        await shortcutManager.unregisterShortcut(prevShortcut);
      }

      if (newShortcut) {
        const testStatus = await shortcutManager.testRegister(actionId, newShortcut, shortcutHandlersRef.current[actionId]);
        if (testStatus !== "ok") {
          if (prevShortcut) {
            await shortcutManager.testRegister(actionId, prevShortcut, shortcutHandlersRef.current[actionId]);
          }
          return { success: false, error: t("shortcut_err_conflict") };
        }
      }

      const updated = { ...shortcuts, [actionId]: newShortcut };
      setShortcuts(updated);
      try {
        localStorage.setItem("island_shortcuts", JSON.stringify(updated));
      } catch {}
      if (store) {
        await store.set("shortcuts", updated);
      }

      const statuses = await shortcutManager.applyAll(updated, shortcutsEnabled, shortcutHandlersRef.current);
      setShortcutStatuses(statuses);
      return { success: true };
    },
    [shortcuts, shortcutsEnabled, store]
  );

  const handleResetShortcut = useCallback(
    async (actionId: ShortcutActionId) => {
      const defaultKey = DEFAULT_SHORTCUTS[actionId];
      await handleUpdateShortcut(actionId, defaultKey);
      await shortcutManager.resumeAll(shortcutsEnabled);
    },
    [handleUpdateShortcut, shortcutsEnabled]
  );

  const handleToggleShortcutsEnabled = useCallback(
    async (enabled: boolean) => {
      setShortcutsEnabled(enabled);
      try {
        localStorage.setItem("island_shortcuts_enabled", String(enabled));
      } catch {}
      if (store) {
        await store.set("shortcuts_enabled", enabled);
      }
      const statuses = await shortcutManager.applyAll(shortcuts, enabled, shortcutHandlersRef.current);
      setShortcutStatuses(statuses);
    },
    [shortcuts, store]
  );

  useEffect(() => {
    const initSettings = async () => {
      invoke<[string, string]>("get_system_info").then(res => {
        setWifiName(res[0]);
        setBtName(res[1]);
      }).catch(console.error);
      invoke<number>("get_master_volume").then(v => setSoundLevel(Math.round(v * 100))).catch(console.error);
      invoke<number>("get_brightness").then(b => setDisplayLevel(b)).catch(console.error);

      try {
        const s = await load('settings.json', { autoSave: true });
        setStore(s);
        const savedTabsPrefs = await s.get('opt_tabs_preferences');
        if (savedTabsPrefs) {
          const normTabs = normalizeTabsPreferences(savedTabsPrefs);
          setTabsPrefs(normTabs);
          try { localStorage.setItem("island_tabs_preferences_v1", JSON.stringify(normTabs)); } catch {}
        }
        
        const greet = await s.get('show_greeting');
        if (greet !== null) {
          setShowGreeting(greet as boolean);
          try {
            localStorage.setItem("island_show_greeting", String(greet));
          } catch {}
        }
        const nameMode = await s.get('greeting_name_mode');
        if (nameMode !== null) {
          const modeVal = nameMode === "custom" ? "custom" : "auto";
          setGreetingNameMode(modeVal);
          try {
            localStorage.setItem("island_greeting_name_mode", modeVal);
          } catch {}
        }
        const customName = await s.get('custom_greeting_name');
        if (typeof customName === 'string' && customName !== "undefined" && customName !== "null") {
          setCustomGreetingName(customName);
          try {
            localStorage.setItem("island_custom_greeting_name", customName);
          } catch {}
        } else {
          try {
            const cached = localStorage.getItem("island_custom_greeting_name");
            if (cached === "undefined" || cached === "null") {
              localStorage.removeItem("island_custom_greeting_name");
              setCustomGreetingName("");
            }
          } catch {}
        }
        const v = await s.get('opt_volume'); if (v !== null) setOptVolume(v as boolean);
        const c = await s.get('opt_clipboard'); if (c !== null) setOptClipboard(c as boolean);
        const ocr = await s.get('opt_ocr'); if (ocr !== null) setOptOcr(ocr as boolean);
        const m = await s.get('opt_media'); if (m !== null) setOptMedia(m as boolean);
        const p = await s.get('opt_position');
        if (isValidNotchPosition(p)) {
          setOptPosition(p);
          try { localStorage.setItem("island_position", p); } catch {}
        }
        const mon = await s.get('opt_target_monitor');
        if (typeof mon === 'string' && mon) {
          setOptTargetMonitor(mon);
          try { localStorage.setItem("island_target_monitor", mon); } catch {}
        }
        const o = await s.get('opt_opacity'); if (o !== null) setOptOpacity(Number(o));
        const bl = await s.get('opt_blur');
        if (bl !== null && bl !== undefined) {
          setOptBlur(Number(bl));
        } else if (o !== null) {
          setOptBlur(getDefaultBlurForOpacity(Number(o)));
        }
        const a = await s.get('opt_anim_speed'); if (a !== null) setOptAnimSpeed(a as string as any);
        const acc = await s.get('opt_accent'); if (acc !== null) setOptAccent(acc as string as any);
        const nt = await s.get('opt_notif_time'); if (nt !== null) setOptNotifTime(nt as number);
        const ns = await s.get('opt_notif_sound');
        if (typeof ns === 'string') {
          setOptNotifSound(ns);
          setSavedNotifSound(ns);
        }
        const cd = await s.get('opt_close_delay');
        if (cd === 0 || cd === 1 || cd === 3 || cd === -1) {
          setOptCloseDelay(cd as number);
          try { localStorage.setItem("island_close_delay", String(cd)); } catch {}
        }
        const shape = await s.get('notch_shape');
        if (shape === 'notch' || shape === 'island') {
          setNotchShape(shape);
          try { localStorage.setItem("island_notch_shape", shape); } catch {}
        }
        const topOff = await s.get('island_top_offset');
        if (typeof topOff === 'number' && topOff >= 6 && topOff <= 16) {
          setIslandTopOffset(topOff);
          try { localStorage.setItem("island_top_offset", String(topOff)); } catch {}
        }
        const ears = await s.get('opt_ears'); if (typeof ears === 'boolean') setOptEars(ears);
        const ac = await s.get('opt_auto_compact'); if (typeof ac === 'boolean') setOptAutoCompact(ac);
        const lang = await s.get('opt_language');
        if (lang === 'en' || lang === 'id') {
          setLanguage(lang as Language, false);
          setOptLanguage(lang as Language);
        }
        const th = await s.get('opt_theme'); if (th === 'dark' || th === 'light' || th === 'auto') setOptTheme(th);
        const savedLayout = await s.get('opt_idle_layout');
        if (savedLayout) {
          const parsed = parseIdleLayout(savedLayout);
          setIdleLayout(parsed);
          try { localStorage.setItem("island_idle_layout", JSON.stringify(parsed)); } catch {}
        }
        const isz = await s.get('opt_idle_size'); if (isz === 'compact' || isz === 'default' || isz === 'large') setOptIdleSize(isz);
        const tsz = await s.get('opt_tab_size'); if (tsz === 'compact' || tsz === 'default' || tsz === 'large') setOptTabSize(tsz);
        const fsz = await s.get('opt_font_size'); if (fsz === 'small' || fsz === 'default' || fsz === 'large') setOptFontSize(fsz);

        const savedShortcuts = await s.get('shortcuts');
        if (savedShortcuts && typeof savedShortcuts === 'object') {
          const loaded: Record<ShortcutActionId, string | null> = {
            ...DEFAULT_SHORTCUTS,
            ...(savedShortcuts as any),
          };
          for (const action of SHORTCUT_ACTIONS) {
            if (action.defaultShortcut && !loaded[action.id]) {
              loaded[action.id] = action.defaultShortcut;
            }
          }
          setShortcuts(loaded);
          try {
            localStorage.setItem("island_shortcuts", JSON.stringify(loaded));
          } catch {}
        }
        const savedShortcutsEnabled = await s.get('shortcuts_enabled');
        if (typeof savedShortcutsEnabled === 'boolean') {
          setShortcutsEnabled(savedShortcutsEnabled);
          try {
            localStorage.setItem("island_shortcuts_enabled", String(savedShortcutsEnabled));
          } catch {}
        }
        
        const autostartInit = await s.get('autostart_initialized');
        if (!autostartInit) {
          try {
            if (!(await isEnabled())) await enable();
            await s.set('autostart_initialized', true);
            await s.set('opt_autostart', true);
          } catch (e) {
            console.error("Failed to initialize autostart", e);
          }
        } else {
          const savedAutostart = await s.get('opt_autostart');
          if (typeof savedAutostart === 'boolean') {
            try {
              const currentEnabled = await isEnabled();
              if (savedAutostart && !currentEnabled) await enable();
              else if (!savedAutostart && currentEnabled) await disable();
            } catch {}
          }
        }

        const auto = await isEnabled();
        setIsAutostart(auto);
      } catch (e) {
        console.error("Failed to init store", e);
      }
    };
    initSettings();
    loadPersistedShelfFiles().then((saved) => {
      // Never clobber files the user dropped during the async load window:
      // merge persisted + current, dedup by path, keep newest.
      setStashedFiles((current) => {
        if (saved.length === 0) return current;
        if (current.length === 0) return saved;
        const byPath = new Map<string, StashedFile>();
        for (const f of [...saved, ...current]) {
          const prev = byPath.get(f.path);
          if (!prev || f.addedAt >= prev.addedAt) byPath.set(f.path, f);
        }
        return Array.from(byPath.values()).sort((a, b) => b.addedAt - a.addedAt);
      });
    });

    const bootGreeting = async () => {
      try {
        const cachedGreet = localStorage.getItem("island_show_greeting");
        if (cachedGreet === "false") {
          setIsBooting(false);
          return;
        }
        await triggerGreeting();
      } catch (e) {
        console.error("Failed to run boot greeting", e);
      } finally {
        setIsBooting(false);
      }
    };
    bootGreeting();
    fetchHotspotStatus().then(setIsHotspotOn).catch(() => {});

    const updateCheckTimeout = window.setTimeout(async () => {
      try {
        const updateInfo = await checkForAppUpdate();
        if (updateInfo.available && updateInfo.version) {
          showNotif({
            title: t("settings_update_available"),
            body: `v${updateInfo.version} - Click to install`,
            icon: "update",
            onClick: () => {
              goToTab("settings");
            },
          });
        }
      } catch {}
    }, 12000);

    const unlistenClickOutside = listen("click-outside", () => {
      if (isSwitchingTabRef.current || isShelfDraggingRef.current || isShortcutPinnedRef.current) return;
      isCursorInsideNotchRef.current = false;
      handleCloseImmediate();
    });

    const unlistenMouseLeave = listen("notch-mouse-leave", () => {
      cancelCompactHoverTimer();
      isCursorInsideNotchRef.current = false;
      setIsDragOver(false);
      if (isSwitchingTabRef.current || isShelfDraggingRef.current || isShortcutPinnedRef.current) return;
      startCollapseTimer(350);
    });

    const unlistenMouseEnter = listen("notch-mouse-enter", () => {
      if (isShelfDraggingRef.current) return;
      if (isClosingRef.current || Date.now() < closeGraceUntilRef.current) return;
      isCursorInsideNotchRef.current = true;
      notchHoverEnterRef.current();
    });

    const handleGlobalPointerDown = (e: MouseEvent | PointerEvent) => {
      if (isSwitchingTabRef.current || isShelfDraggingRef.current) return;
      const notchElement = document.getElementById("notch-pill");
      if (notchElement) {
        const rect = notchElement.getBoundingClientRect();
        // Guard against clicking elements that unmount on click (detached from DOM)
        const isClickWithinBounds =
          e.clientX >= rect.left - 4 &&
          e.clientX <= rect.right + 4 &&
          e.clientY >= rect.top - 4 &&
          e.clientY <= rect.bottom + 4;
        if (!notchElement.contains(e.target as Node) && !isClickWithinBounds) {
          const hasOpenPanel =
            isExpandedRef.current ||
            isQuickControlRef.current ||
            isTodoRef.current ||
            isPomodoroRef.current ||
            isDropShelfRef.current ||
            isSysMonitorRef.current ||
            isMiniNoteRef.current ||
            isPrayerReminderRef.current ||
            isWaterReminderRef.current ||
            isClipboardRef.current ||
            isVolumeMixerRef.current ||
            isNotificationsRef.current ||
            isSettingsRef.current;
          if (hasOpenPanel) {
            isCursorInsideNotchRef.current = false;
            handleCloseImmediate();
          } else {
            // When notch is closed, clicking anywhere in the floating margin area near the notch opens it
            const island = isIslandRef.current;
            const topOffset = islandTopOffsetRef.current;
            const margin = island ? Math.max(26, topOffset + 14) : 14;
            const isNearNotch =
              e.clientX >= rect.left - margin &&
              e.clientX <= rect.right + margin &&
              e.clientY >= rect.top - margin &&
              e.clientY <= rect.bottom + margin;
            if (isNearNotch) {
              if (variantRef.current === "media" || variantRef.current === "lyrics_idle") {
                goToTab("media_expanded", 0);
              } else if (variantRef.current === "idle") {
                openLastOrPreferredTab();
              }
            }
          }
        }
      }
    };

    let pointerMoveRafId: number | null = null;
    let lastClientX = 0;
    let lastClientY = 0;

    const processPointerMove = () => {
      pointerMoveRafId = null;
      if (isShelfDraggingRef.current) return;
      const pillElement = document.getElementById("notch-pill");
      if (pillElement) {
        const rect = pillElement.getBoundingClientRect();
        const currentVariant = variantRef.current;
        const currentVariants = variantsRef.current;
        const currentSize = currentVariants?.[currentVariant as keyof typeof currentVariants] || currentVariants?.idle || { width: 120, height: 35 };
        const anyOpen = isAnyPanelOpenRef.current;
        const targetWidth = anyOpen ? Math.max(currentSize.width, rect.width) : rect.width;
        const targetHeight = anyOpen ? Math.max(currentSize.height, rect.height) : rect.height;
        const pos = optPositionRef.current;
        const island = isIslandRef.current;
        const topOffset = islandTopOffsetRef.current;
        const pad = island ? Math.max(26, topOffset + 14) : 14;

        const minX = isLeftNotchPosition(pos)
          ? rect.left - pad
          : isRightNotchPosition(pos)
          ? rect.right - targetWidth - 14
          : (rect.left + rect.right) / 2 - targetWidth / 2 - 14;
        const maxX = isLeftNotchPosition(pos)
          ? rect.left + targetWidth + 14
          : isRightNotchPosition(pos)
          ? rect.right + pad
          : (rect.left + rect.right) / 2 + targetWidth / 2 + 14;

        const minY = isBottomNotchPosition(pos)
          ? rect.bottom - targetHeight - 14
          : isTopNotchPosition(pos)
          ? rect.top - pad
          : (rect.top + rect.bottom) / 2 - targetHeight / 2 - 14;
        const maxY = isBottomNotchPosition(pos)
          ? rect.bottom + pad
          : isTopNotchPosition(pos)
          ? rect.top + targetHeight + 14
          : (rect.top + rect.bottom) / 2 + targetHeight / 2 + 14;

        const isInside =
          lastClientX >= minX &&
          lastClientX <= maxX &&
          lastClientY >= minY &&
          lastClientY <= maxY;
        if (isInside) {
          isCursorInsideNotchRef.current = true;
          isShortcutPinnedRef.current = false;
          if (shortcutPinnedTimerRef.current) {
            clearTimeout(shortcutPinnedTimerRef.current);
            shortcutPinnedTimerRef.current = null;
          }
          cancelCollapseTimer();
          if (focusModeRef.current === "Gaming") return;
          const hasOpenPanel = anyOpen;
          if (currentVariant === "compact" && !compactHoverTimerRef.current && !hasOpenPanel) {
            startCompactHoverTimer(80);
          } else if (!hasOpenPanel && !isClosingRef.current) {
            if (currentVariant === "media" || currentVariant === "lyrics_idle") {
              goToTab("media_expanded", 0);
            } else if (currentVariant === "idle") {
              openLastOrPreferredTab();
            }
          }
        } else if (isCursorInsideNotchRef.current) {
          cancelCompactHoverTimer();
        }
      }
    };

    const handleGlobalPointerMove = (e: MouseEvent | PointerEvent) => {
      if (isShelfDraggingRef.current) return;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      if (pointerMoveRafId === null) {
        pointerMoveRafId = requestAnimationFrame(processPointerMove);
      }
    };

    window.addEventListener("pointerdown", handleGlobalPointerDown, true);
    window.addEventListener("pointermove", handleGlobalPointerMove, { passive: true });

    const unlistenBrowser = listen<boolean>("foreground-app-browser", (event) => {
      setIsBrowserActive(Boolean(event.payload));
    });
    invoke<boolean>("check_foreground_browser").then(setIsBrowserActive).catch(console.error);
    invoke<boolean>("request_notification_access").catch(() => {});

    let unlistenDragDrop: (() => void) | undefined;
    try {
      getCurrentWebview().onDragDropEvent((event) => {
        if (isShelfDraggingRef.current) return;
        if (event.payload.type === "over" || event.payload.type === "enter") {
          setIsDragOver(true);
        } else if (event.payload.type === "leave") {
          setIsDragOver(false);
        } else if (event.payload.type === "drop") {
          setIsDragOver(false);
          const paths = event.payload.paths;
          if (paths && paths.length > 0) {
            const valid = paths.filter((p) => !outgoingShelfPathsRef.current.has(p.toLowerCase()));
            if (valid.length > 0) {
              addStashedFiles(valid);
              goToTab("drop_shelf", 0);
            }
          }
        }
      }).then((u) => { unlistenDragDrop = u; });
    } catch (e) {
      console.error("Failed to setup onDragDropEvent", e);
    }
    
    return () => {
      if (pointerMoveRafId !== null) cancelAnimationFrame(pointerMoveRafId);
      window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      unlistenClickOutside.then(unlisten => unlisten());
      unlistenMouseLeave.then(unlisten => unlisten());
      unlistenMouseEnter.then(unlisten => unlisten());
      unlistenBrowser.then(unlisten => unlisten());
      if (unlistenDragDrop) unlistenDragDrop();
      clearTimeout(updateCheckTimeout);
      shortcutManager.destroy().catch(() => {});
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const updateWeather = async () => {
      const data = await fetchCurrentWeather();
      if (isMounted && data) {
        setWeather({
          temp: data.temp,
          code: data.code,
          locationName: data.locationName,
        });
      }
    };

    updateWeather();
    const interval = setInterval(updateWeather, 1000 * 60 * 10);
    const unsubscribe = subscribeWeatherChange(() => {
      updateWeather();
    });

    return () => {
      isMounted = false;
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTime((prev) => (prev.getMinutes() === now.getMinutes() && prev.getHours() === now.getHours() ? prev : now));
    }, 5000);
    invoke<[boolean, number] | null>("get_battery_status")
      .then(res => {
        if (res && res[1] <= 100) {
          setBattery({ is_charging: res[0], percent: res[1] });
        } else {
          setBattery(null);
        }
      })
      .catch(console.error);
      
    invoke<[boolean, boolean]>("get_privacy_status")
      .then(([cam, mic]) => {
        setCamActive(cam);
        setMicActive(mic);
      })
      .catch(console.error);

    invoke<boolean>("get_windows_dnd")
      .then((isWinDnd) => {
        if (isWinDnd) {
          // Windows DND wins on boot: sync Gili into DND.
          setFocusMode("DND");
          focusModeRef.current = "DND";
          setDndStatus(true);
        } else if (getDndStatus()) {
          // Reverse path (was missing): local flag says DND but the user turned
          // Windows DND off externally — reconcile instead of muting forever.
          setFocusMode("Normal");
          focusModeRef.current = "Normal";
          setDndStatus(false);
        }
      })
      .catch(() => {});

    // Keep Gili's DND in sync when Windows Focus Assist is toggled outside Gili.
    let dndPollTimer: number | undefined;
    const pollWindowsDnd = async () => {
      try {
        const isWinDnd = await invoke<boolean>("get_windows_dnd");
        const giliDnd = focusModeRef.current === "DND";
        if (isWinDnd && !giliDnd) {
          setFocusMode("DND");
          focusModeRef.current = "DND";
          setDndStatus(true);
        } else if (!isWinDnd && giliDnd) {
          setFocusMode("Normal");
          focusModeRef.current = "Normal";
          setDndStatus(false);
        }
      } catch {
        /* ignore transient query failures */
      }
    };
    dndPollTimer = window.setInterval(pollWindowsDnd, 15_000);

    const unlistenPrivacy = listen<{cam: boolean, mic: boolean}>("privacy-update", (event) => {
      setCamActive(event.payload.cam);
      setMicActive(event.payload.mic);
    });

    const unlistenUsb = listen<{name: string, letter: string}>("usb-connected", (event) => {
      if (focusModeRef.current !== "DND" && !pomoMuteNotifsRef.current) {
        playDeviceConnectSound();
      }
      showNotif({
        title: "USB Connected",
        body: `${event.payload.name} (${event.payload.letter})`,
        icon: "usb",
        onClick: () => {
          setNotif(null);
          invoke("show_in_folder", { path: event.payload.letter }).catch(console.error);
        },
      });
    });

    const unlistenAudio = listen<{name: string, icon: string}>("audio-connected", (event) => {
      if (focusModeRef.current !== "DND" && !pomoMuteNotifsRef.current) {
        playDeviceConnectSound();
      }
      showNotif({
        title: "Audio Device Connected",
        body: event.payload.name,
        icon: "headphones"
      });
    });

    return () => {
      clearInterval(timer);
      if (dndPollTimer !== undefined) window.clearInterval(dndPollTimer);
      unlistenPrivacy.then(f => f());
      unlistenUsb.then(f => f());
      unlistenAudio.then(f => f());
    };
  }, []);

  useEffect(() => {
    const unlistenMedia = listen<MediaPayload>("media-update", (event) => {
      lastMediaPayloadRef.current = event.payload;
      if (event.payload.position !== undefined && event.payload.duration !== undefined) {
        latestMediaProgressRef.current = {
          position: event.payload.position,
          duration: event.payload.duration,
          updatedAt: performance.now(),
        };
        setMediaProgress({ position: event.payload.position, duration: event.payload.duration });
      }
      if (!optMediaRef.current) {
        setMedia(null);
        return;
      }
      if (event.payload.title || event.payload.artist) {
        prefetchArtwork(event.payload);
        const isNowPlaying = Boolean(event.payload.is_playing);
        isPlayingRef.current = isNowPlaying;
        setIsPlaying(isNowPlaying);

        if (isNowPlaying) {
          hasEverPlayedRef.current = true;
          isPausedMediaCollapsedRef.current = false;
          setIsPausedMediaCollapsed(false);
          clearPausedMediaTimer();
        } else {
          if (!hasEverPlayedRef.current || isPausedMediaCollapsedRef.current) {
            isPausedMediaCollapsedRef.current = true;
            setIsPausedMediaCollapsed(true);
          } else if (!pausedMediaCollapseTimerRef.current) {
            startPausedMediaCollapseTimer(5000);
          }
        }

        const currentTitle = (event.payload.title || "").trim();
        const currentArtist = (event.payload.artist || "").trim();
        const currentThumbnail = event.payload.thumbnail || null;

        if (currentTitle) {
          const prevActive = activePlayingTrackRef.current;

          // If a track was active and now a different track started playing ("pas pindah lagu")
          if (
            prevActive &&
            prevActive.title &&
            (prevActive.title.toLowerCase() !== currentTitle.toLowerCase() ||
              (prevActive.artist && currentArtist && prevActive.artist.toLowerCase() !== currentArtist.toLowerCase()))
          ) {
            const resolvedPrevThumb =
              getResolvedArtworkUrl(
                {
                  title: prevActive.title,
                  artist: prevActive.artist,
                  thumbnail: prevActive.thumbnail,
                } as any,
                false
              ) || prevActive.thumbnail;

            setQueueHistory((prev) => {
              const updated = [
                {
                  id: `${prevActive.title}-${Date.now()}`,
                  title: prevActive.title,
                  artist: prevActive.artist || "",
                  thumbnail: resolvedPrevThumb,
                  timestamp: Date.now(),
                },
                ...prev.filter(
                  (item) =>
                    item.title.toLowerCase() !== prevActive.title.toLowerCase() ||
                    (item.artist && prevActive.artist && item.artist.toLowerCase() !== prevActive.artist.toLowerCase())
                ),
              ].slice(0, 10);
              try {
                localStorage.setItem("island_queue_history", JSON.stringify(updated));
              } catch {}
              return updated;
            });
          }

          const resolvedCurrentThumb =
            getResolvedArtworkUrl(
              {
                title: currentTitle,
                artist: currentArtist,
                thumbnail: currentThumbnail,
              } as any,
              false
            ) || currentThumbnail;

          // Keep activePlayingTrackRef updated with the current playing track
          if (!prevActive || prevActive.title.toLowerCase() !== currentTitle.toLowerCase()) {
            activePlayingTrackRef.current = {
              id: `${currentTitle}-${Date.now()}`,
              title: currentTitle,
              artist: currentArtist,
              thumbnail: resolvedCurrentThumb,
              timestamp: Date.now(),
            };
          } else if (resolvedCurrentThumb && prevActive.thumbnail !== resolvedCurrentThumb) {
            prevActive.thumbnail = resolvedCurrentThumb;
          }

          // Backfill or refresh thumbnail if arrived/updated for index 0 in queueHistory
          const thumbToBackfill = resolvedCurrentThumb || currentThumbnail;
          if (thumbToBackfill) {
            setQueueHistory((prev) => {
              if (
                prev.length > 0 &&
                prev[0].title.toLowerCase() === currentTitle.toLowerCase() &&
                prev[0].thumbnail !== thumbToBackfill
              ) {
                const updated = [...prev];
                updated[0] = { ...updated[0], thumbnail: thumbToBackfill };
                try {
                  localStorage.setItem("island_queue_history", JSON.stringify(updated));
                } catch {}
                return updated;
              }
              return prev;
            });
          }
        }

        setMedia(event.payload);
      } else {
        clearPausedMediaTimer();
        setMedia(null);
        setIsPlaying(false);
        setIsPausedMediaCollapsed(false);
      }
    });

    const unlistenProgress = listen<{position: number, duration: number}>("media-progress", (event) => {
      const prev = latestMediaProgressRef.current;
      latestMediaProgressRef.current = {
        position: event.payload.position,
        duration: event.payload.duration,
        updatedAt: performance.now(),
      };
      if (
        isExpandedRef.current ||
        showLyricsRef.current ||
        Math.abs(event.payload.duration - prev.duration) > 1.0
      ) {
        setMediaProgress(event.payload);
      }
    });

    const unlistenBattery = listen<{is_charging: boolean, percent: number}>("battery-update", (event) => {
      if (event.payload.percent > 100) return;
      setBattery((prev) => {

        if (prev && prev.is_charging !== event.payload.is_charging) {
          if (event.payload.is_charging) {
            playChargingSound();
            showNotif({ title: t("notif_charging"), body: `${event.payload.percent}%`, icon: "battery" });
          } else {
            showNotif({ title: t("notif_on_battery"), body: t("notif_battery_remaining", { percent: event.payload.percent }), icon: "battery" });
          }
        }
        return event.payload;
      });
    });

    const unlistenVolume = listen<{level: number}>("volume-update", (event) => {
      if (isQuickControlRef.current || isVolumeMixerRef.current || isAdjustingVolumeRef.current) return;
      const vol = Math.round(event.payload.level * 100);
      setSoundLevel(vol);
      playVolumeTick(vol);
      showNotif({ title: t("cc_volume"), body: `${vol}%`, icon: "volume" });
    });

    let clipboardDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unlistenClipboard = listen("clipboard-update", () => {
      if (!optClipboardRef.current || isOcrWritingRef.current) return;

      if (clipboardDebounceTimer) clearTimeout(clipboardDebounceTimer);
      clipboardDebounceTimer = setTimeout(async () => {
        if (!optClipboardRef.current || isOcrWritingRef.current) return;
        try {
          // Cek teks terlebih dahulu
          const copiedText = await invoke<string>("read_clipboard_text").catch(() => "");
          if (copiedText && copiedText.trim().length > 0) {
            addClipboardItem(copiedText);
            if (!isClipboardRef.current) {
              const snippet = copiedText.trim().length > 110
                ? `${copiedText.trim().slice(0, 110)}…`
                : copiedText.trim();
              showNotif({
                title: t("notif_copied_clipboard"),
                body: snippet,
                headline: snippet,
                icon: "clipboard"
              });
            }
            return;
          }

          // Jika bukan teks (misal: screenshot/gambar), periksa apakah clipboard berisi gambar
          const clipImage = await invoke<{
            id: string;
            path: string;
            thumbnail: string;
            width: number;
            height: number;
          } | null>("read_clipboard_image").catch(() => null);

          if (clipImage && clipImage.path) {
            const addedItem = addClipboardImageItem({
              imagePath: clipImage.path,
              thumbnail: clipImage.thumbnail,
              width: clipImage.width,
              height: clipImage.height,
              ocrText: "",
            });

            if (!isClipboardRef.current) {
              const dimText = `${clipImage.width} × ${clipImage.height} px`;
              showNotif({
                title: t("notif_image_copied_clipboard"),
                body: dimText,
                headline: dimText,
                icon: "clipboard",
              });
            }

            // Hanya jalankan OCR kalau fitur diaktifkan di settings
            if (!optOcrRef.current) return;

            invoke<string>("extract_image_text", { path: clipImage.path })
              .then((ocrText) => {
                const cleanOcr = ocrText ? ocrText.trim() : "";
                if (!cleanOcr) return;

                updateClipboardItem(addedItem.id, { text: cleanOcr });

                if (!isClipboardRef.current) {
                  const notifSubtitle = cleanOcr.length > 80 ? `${cleanOcr.slice(0, 80)}…` : cleanOcr;
                  showNotif({
                    title: t("notif_ocr_detected"),
                    body: notifSubtitle,
                    headline: notifSubtitle,
                    icon: "clipboard",
                    onClick: () => {
                      isOcrWritingRef.current = true;
                      writeText(cleanOcr)
                        .then(() => {
                          addClipboardItem(cleanOcr);
                          showNotif({ title: t("notif_ocr_copied"), body: "", icon: "clipboard" });
                        })
                        .catch((err) => {
                          console.error(err);
                          showNotif({ title: t("notif_ocr_copy_failed"), body: "", icon: "clipboard" });
                        })
                        .finally(() => {
                          setTimeout(() => { isOcrWritingRef.current = false; }, 500);
                        });
                    },
                  });
                }
              })
              .catch((err) => {
                console.debug("OCR extraction error:", err);
              });

            return;
          }
        } catch (err) {
          console.debug("Clipboard handler error:", err);
        }
      }, 350);
    });

    const unlistenCaps = listen<{is_on: boolean}>("caps-update", (event) => {
      showNotif({ title: event.payload.is_on ? t("notif_caps_on") : t("notif_caps_off"), body: "", icon: "capslock" });
    });

    const unlistenBt = listen<{name: string, battery: string}>("bt-connected", (event) => {
      if (focusModeRef.current !== "DND" && !pomoMuteNotifsRef.current) {
        playDeviceConnectSound();
      }
      let body = t("notif_connected");
      if (event.payload.battery) {
        body += ` • Battery: ${event.payload.battery}`;
      }
      showNotif({ title: event.payload.name, body, icon: "bluetooth" });
    });

    interface RealNotifPayload {
      app_name: string;
      title: string;
      body: string;
      aumid?: string;
    }

    const unlistenRealNotif = listen<RealNotifPayload>("real-notif", (event) => {
      const { app_name, title, body, aumid } = event.payload;
      if (!title && !body) return;

      const lowerApp = (app_name || "").toLowerCase();
      const lowerAumid = (aumid || "").toLowerCase();

      // Abaikan notifikasi dari Gili Island sendiri
      if (lowerApp.includes("gili") || lowerAumid.includes("gili")) return;

      // Abaikan notif dari Snipping Tool / ScreenSketch karena ditangani via clipboard
      if (
        lowerApp.includes("snipping tool") ||
        lowerApp.includes("screensketch") ||
        lowerAumid.includes("screensketch")
      ) {
        return;
      }

      const lowerTitle = (title || "").toLowerCase();
      const lowerBody = (body || "").toLowerCase();

      const isWa =
        lowerTitle.includes("whatsapp") ||
        lowerBody.includes("whatsapp") ||
        lowerBody.includes("web.whatsapp.com") ||
        lowerTitle.includes("web.whatsapp.com") ||
        lowerApp.includes("whatsapp");

      let resolvedApp = app_name || "Notification";
      let resolvedIcon = "bell";
      let cleanTitle = (title || "").trim();
      let cleanBody = (body || "").trim();

      if (isWa) {
        resolvedApp =
          lowerApp.includes("chrome") ||
          lowerApp.includes("edge") ||
          lowerApp.includes("brave") ||
          lowerApp.includes("firefox") ||
          lowerTitle.includes("web.whatsapp.com") ||
          lowerBody.includes("web.whatsapp.com")
            ? "WhatsApp Web"
            : "WhatsApp";
        resolvedIcon = "whatsapp";

        if (cleanTitle.toLowerCase().includes("web.whatsapp.com") || cleanTitle.toLowerCase() === "whatsapp web") {
          const lines = cleanBody.split("\n").filter((l) => l.trim().length > 0);
          if (lines.length >= 2) {
            cleanTitle = lines[0];
            cleanBody = lines.slice(1).join("\n");
          }
        }

        cleanBody = cleanBody
          .split("\n")
          .filter((line) => !line.toLowerCase().includes("web.whatsapp.com"))
          .join("\n")
          .trim();
      } else if (lowerApp.includes("telegram") || lowerTitle.includes("telegram") || lowerBody.includes("web.telegram.org")) {
        resolvedApp = "Telegram";
        resolvedIcon = "telegram";
      } else if (lowerApp.includes("discord") || lowerTitle.includes("discord")) {
        resolvedApp = "Discord";
        resolvedIcon = "discord";
      } else if (lowerApp.includes("slack") || lowerApp.includes("teams")) {
        resolvedApp = lowerApp.includes("slack") ? "Slack" : "Microsoft Teams";
        resolvedIcon = "slack";
      } else if (lowerApp.includes("mail") || lowerApp.includes("outlook")) {
        resolvedApp = lowerApp.includes("outlook") ? "Outlook" : "Mail";
        resolvedIcon = "mail";
      } else if (lowerApp.includes("chrome")) {
        resolvedApp = "Google Chrome";
        resolvedIcon = "chrome";
      } else if (lowerApp.includes("edge")) {
        resolvedApp = "Microsoft Edge";
        resolvedIcon = "edge";
      } else if (lowerApp.includes("brave")) {
        resolvedApp = "Brave";
        resolvedIcon = "brave";
      } else if (lowerApp.includes("firefox")) {
        resolvedApp = "Firefox";
        resolvedIcon = "firefox";
      } else if (lowerApp.includes("spotify")) {
        resolvedApp = "Spotify";
        resolvedIcon = "spotify";
      } else if (lowerApp.includes("youtube")) {
        resolvedApp = "YouTube";
        resolvedIcon = "youtube";
      } else if (lowerApp.includes("instagram")) {
        resolvedApp = "Instagram";
        resolvedIcon = "instagram";
      } else if (lowerApp.includes("threads")) {
        resolvedApp = "Threads";
        resolvedIcon = "threads";
      } else if (lowerApp.includes("tiktok")) {
        resolvedApp = "TikTok";
        resolvedIcon = "tiktok";
      } else if (lowerApp.includes("netflix")) {
        resolvedApp = "Netflix";
        resolvedIcon = "netflix";
      } else if (lowerApp.includes("reddit")) {
        resolvedApp = "Reddit";
        resolvedIcon = "reddit";
      } else if (lowerApp.includes("vlc")) {
        resolvedApp = "VLC";
        resolvedIcon = "vlc";
      } else if (lowerApp.includes("media player") || lowerApp.includes("wmplayer")) {
        resolvedApp = "Windows Media Player";
        resolvedIcon = "windows-media-player";
      } else if (lowerApp.includes("x") || lowerApp.includes("twitter")) {
        resolvedApp = "X";
        resolvedIcon = "x";
      }

      showNotif({
        title: cleanTitle || resolvedApp,
        body: cleanBody,
        appName: resolvedApp,
        icon: resolvedIcon,
        aumid,
        type: isWa ? "message" : "system",
      });
    });

    const unlistenNetwork = listen<number | null>("network-ping", (event) => {
      setNetworkPing(event.payload);
    });

    const unlistenSysInfo = listen<[string, string]>("system-info-update", (event) => {
      setWifiName(event.payload[0]);
      setBtName(event.payload[1]);
    });

    const unlistenBrightness = listen<number>("brightness-update", (event) => {
      setDisplayLevel(event.payload);
    });

    const unlistenTrayToggle = listen("tray-toggle-visibility", () => {
      setIsHidden((prev) => !prev);
    });

    const unlistenTrayCC = listen("tray-open-control-center", () => {
      setIsHidden(false);
      setTabSwitchGrace(1200);
      goToTab("quick_control", 0);
    });

    const unlistenTraySettings = listen("tray-open-settings", () => {
      invoke("open_settings_window", { section: null }).catch(() => {});
    });

    const unlistenSettingsSync = listen<any>("gili-settings-sync", (event) => {
      const payload = event.payload;
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "tabs_preferences" && payload.data) {
        const norm = normalizeTabsPreferences(payload.data);
        setTabsPrefs(norm);
        try { localStorage.setItem("island_tabs_preferences_v1", JSON.stringify(norm)); } catch {}
        return;
      }
      if (payload.type === "shortcuts_update" && payload.shortcuts) {
        setShortcuts(payload.shortcuts);
        return;
      }
      if (payload.type === "shortcuts_enabled" && typeof payload.enabled === "boolean") {
        setShortcutsEnabled(payload.enabled);
        return;
      }
      if (payload.type === "setting_key") {
        const { key, value } = payload;
        switch (key) {
          case "opt_language":
            setLanguage(value as Language, false);
            setOptLanguage(value as Language);
            break;
          case "show_greeting":
            setShowGreeting(Boolean(value));
            break;
          case "greeting_name_mode":
            setGreetingNameMode(value === "custom" ? "custom" : "auto");
            break;
          case "custom_greeting_name":
            setCustomGreetingName(typeof value === "string" ? value : "");
            break;
          case "opt_auto_compact":
            setOptAutoCompact(Boolean(value));
            break;
          case "opt_close_delay":
            optCloseDelayRef.current = Number(value);
            setOptCloseDelay(Number(value));
            break;
          case "opt_notif_time":
            setOptNotifTime(Number(value));
            break;
          case "opt_notif_sound":
            if (typeof value === "string") {
              setOptNotifSound(value);
              setSavedNotifSound(value);
            }
            break;
          case "opt_theme":
            setOptTheme(value);
            break;
          case "notch_shape":
            handleChangeNotchShape(value);
            break;
          case "island_top_offset":
            handleChangeIslandTopOffset(Number(value));
            break;
          case "opt_position":
            if (isValidNotchPosition(value)) {
              setOptPosition(value);
              try { localStorage.setItem("island_position", value); } catch {}
              invoke("set_window_position", {
                isBottom: isBottomNotchPosition(value),
                position: value,
                topOffset: islandTopOffsetRef.current,
                isIsland: isIslandRef.current,
                targetMonitor: optTargetMonitorRef.current,
              }).catch(console.error);
            }
            break;
          case "opt_target_monitor":
            if (typeof value === "string") {
              setOptTargetMonitor(value);
              try { localStorage.setItem("island_target_monitor", value); } catch {}
              invoke("set_target_monitor", { targetMonitor: value }).catch(console.error);
            }
            break;
          case "opt_ears":
            setOptEars(Boolean(value));
            break;
          case "opt_opacity":
            setOptOpacity(Number(value));
            break;
          case "opt_blur":
            setOptBlur(Number(value));
            break;
          case "opt_anim_speed":
            setOptAnimSpeed(value);
            break;
          case "opt_idle_size":
            setOptIdleSize(value);
            break;
          case "opt_tab_size":
            setOptTabSize(value);
            break;
          case "opt_font_size":
            setOptFontSize(value);
            break;
          case "opt_idle_layout":
            setIdleLayout(parseIdleLayout(value));
            break;
          case "opt_volume":
            setOptVolume(Boolean(value));
            break;
          case "opt_clipboard":
            setOptClipboard(Boolean(value));
            break;
          case "opt_ocr":
            setOptOcr(Boolean(value));
            break;
          case "opt_media":
            setOptMedia(Boolean(value));
            break;
          case "opt_sound_fx":
            setOptSoundFx(Boolean(value));
            setSoundEffectsEnabled(Boolean(value));
            break;
          default:
            break;
        }
      }
    });

    const unlistenTriggerAction = listen<string>("settings-trigger-action", (event) => {
      const act = event.payload;
      if (act === "test_greeting") {
        triggerGreeting();
      } else if (act === "test_notification") {
        const isId = getLanguage() === "id";
        showNotif({
          title: isId ? "Dukung Pengembang · Gili" : "Support Developer · Gili",
          body: isId
            ? "Notifikasi percobaan dari Jendela Pengaturan Gili berjalan lancar! ✨"
            : "Test notification from Gili Settings Window is working smoothly! ✨",
          subtitle: "Gili Island",
          headline: isId ? "Uji Notifikasi Berhasil" : "Notification Test Passed",
          icon: "coffee",
        });
      } else if (act === "restart_onboarding") {
        window.dispatchEvent(new CustomEvent("island_trigger_onboarding"));
      } else if (act === "close_preview_tab" || act === "close_tab") {
        isShortcutPinnedRef.current = false;
        if (shortcutPinnedTimerRef.current) {
          clearTimeout(shortcutPinnedTimerRef.current);
          shortcutPinnedTimerRef.current = null;
        }
        handleCloseImmediate();
      } else if (act === "toggle_preview" || act.startsWith("preview_tab:") || act.startsWith("open_tab:")) {
        const rawTarget = act.includes(":") ? act.split(":")[1] : "quick_control";
        const targetTab = (availableTabs.includes(rawTarget as any) ? rawTarget : (availableTabs[0] || "quick_control")) as ExpandedTab;

        if (currentTabRef.current === targetTab && isExpandedPanel) {
          isShortcutPinnedRef.current = false;
          if (shortcutPinnedTimerRef.current) {
            clearTimeout(shortcutPinnedTimerRef.current);
            shortcutPinnedTimerRef.current = null;
          }
          handleCloseImmediate();
          return;
        }

        setIsHidden(false);
        isClosingRef.current = false;
        currentTabRef.current = null;
        goToTab(targetTab, 0);
        isShortcutPinnedRef.current = true;
        if (shortcutPinnedTimerRef.current) clearTimeout(shortcutPinnedTimerRef.current);
        shortcutPinnedTimerRef.current = window.setTimeout(() => {
          if (!isCursorInsideNotchRef.current && isShortcutPinnedRef.current) {
            isShortcutPinnedRef.current = false;
            handleCloseImmediate();
          }
        }, 45000);
      }
    });

    return () => {
      if (clipboardDebounceTimer) clearTimeout(clipboardDebounceTimer);
      unlistenMedia.then((f) => f());
      unlistenProgress.then((f) => f());
      unlistenBattery.then((f) => f());
      unlistenVolume.then((f) => f());
      unlistenClipboard.then((f) => f());
      unlistenCaps.then((f) => f());
      unlistenBt.then((f) => f());
      unlistenRealNotif.then((f) => f());
      unlistenNetwork.then((f) => f());
      unlistenSysInfo.then((f) => f());
      unlistenBrightness.then((f) => f());
      unlistenTrayToggle.then((f) => f());
      unlistenTrayCC.then((f) => f());
      unlistenTraySettings.then((f) => f());
      unlistenSettingsSync.then((f) => f());
      unlistenTriggerAction.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!notif && notifQueue.length > 0) {
      let nextNotif = notifQueue[0];
      const isDndActive = focusModeRef.current === "DND" || pomoMuteNotifsRef.current;
      if (isDndActive && nextNotif.icon !== "battery" && !(nextNotif as any).forceShow) {
        setNotifQueue((q) => q.slice(1));
        return;
      }
      if (nextNotif.icon === "volume" && !optVolumeRef.current) {
        setNotifQueue(q => q.slice(1));
        return;
      }
      if (nextNotif.icon === "clipboard" && !optClipboardRef.current) {
        setNotifQueue(q => q.slice(1));
        return;
      }
      currentNotifRef.current = nextNotif;
      setNotif(nextNotif);
      setNotifQueue(q => q.slice(1));
      triggerNotificationAudio(nextNotif);
    } else if (notif) {
      let duration = optNotifTimeRef.current * 1000;
      const shortIcons = ["volume", "brightness", "battery", "bluetooth"];
      if (notif.type === "greeting" || notif.icon === "sun" || notif.icon === "moon") {
        duration = 6000;
      } else if (notif.icon === "capslock") {
        duration = 1000;
      } else if (notif.icon === "clipboard" && !notif.body) {
        duration = 1500;
      } else if (shortIcons.includes(notif.icon || "")) {
        duration = 1500;
      }
      
      const timer = setTimeout(() => {
        currentNotifRef.current = null;
        setNotif(null);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [notif, notifQueue]);



  useEffect(() => {
    if (!pomodoro.completeAlert) return;
    const duration = Math.max(5000, optNotifTimeRef.current * 1000);
    const timer = window.setTimeout(() => {
      pomodoro.dismissCompleteAlert();
    }, duration);
    return () => clearTimeout(timer);
  }, [pomodoro.completeAlert]);

  const handleNotifClick = async (e?: React.MouseEvent, targetNotif?: NotifPayload) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const active = targetNotif || notif;
    if (!active) return;
    
    if (active.onClick) {
      active.onClick();
      // Let onClick handle its own unmount or notification replacement
      return;
    }
    
    if (targetNotif && targetNotif !== notif) {
      setNotifQueue((q) => q.filter((n) => n !== targetNotif));
    } else {
      setTimeout(() => setNotif(null), 50);
    }

    try {
      const activated = await invoke<boolean>("activate_notification_app", {
        appName: active.title,
        aumid: active.aumid || null,
      });
      if (activated) return;
    } catch (err) {
      console.error("Failed to activate notification app natively:", err);
    }

    const title = active.title.toLowerCase();
    
    let url = "";
    if (title.includes("whatsapp")) url = "whatsapp://";
    else if (title.includes("telegram")) url = "tg://";
    else if (title.includes("discord")) url = "discord://";
    else if (title.includes("spotify")) url = "spotify://";
    else if (title.includes("slack")) url = "slack://";
    else if (title.includes("teams")) url = "msteams://";
    else if (title.includes("zoom")) url = "zoommtg://";
    else if (title.includes("line")) url = "line://";
    else if (title.includes("mail") || title.includes("outlook")) url = "mailto:";
    else if (title.includes("instagram")) url = "https://instagram.com";
    else if (title === "x" || title.includes("twitter")) url = "https://x.com";
    else if (title.includes("facebook")) url = "https://facebook.com";
    else if (title.includes("youtube")) url = "https://youtube.com";

    if (url) {
      try {
        await openUrl(url);
      } catch (e) {
        console.error("Failed to open app:", e);
      }
    }
  };

  const handleMediaControl = async (action: string) => {
    try {
      await invoke("smtc_action", { action });
      if (action === "toggle") {
        setIsPlaying((prev) => {
          const next = !prev;
          isPlayingRef.current = next;
          if (next) {
            hasEverPlayedRef.current = true;
            isPausedMediaCollapsedRef.current = false;
            setIsPausedMediaCollapsed(false);
            clearPausedMediaTimer();
          } else {
            startPausedMediaCollapseTimer(5000);
          }
          return next;
        });
      }
    } catch (e) {
      console.error(e);
    }
  };





  const [screenRefreshRate, setScreenRefreshRate] = useState<number>(60);
  const [fps, setFps] = useState<number>(60);

  useEffect(() => {
    invoke<number>("get_screen_refresh_rate")
      .then((hz) => {
        if (hz && hz >= 30) {
          setScreenRefreshRate(hz);
          setFps(hz);
        }
      })
      .catch(console.error);
  }, []);

  const needsFpsCounter =
    idleLayout.left === "fps" ||
    idleLayout.center === "fps" ||
    idleLayout.right === "fps" ||
    isSettings;

  useEffect(() => {
    if (!needsFpsCounter) return;
    let frameCount = 0;
    let lastTime = performance.now();
    let rafId: number | null = null;
    let pauseTimer: number | null = null;
    const maxHz = screenRefreshRate || 60;

    const tick = (now: number) => {
      frameCount++;
      const elapsed = now - lastTime;
      if (elapsed >= 350) {
        const rawFps = (frameCount * 1000) / elapsed;
        const measured = Math.max(1, Math.min(maxHz, Math.round(rawFps)));
        const displayFps = Math.abs(measured - maxHz) <= Math.max(2, Math.round(maxHz * 0.04)) ? maxHz : measured;
        setFps((prev) => (prev === displayFps ? prev : displayFps));
        rafId = null;
        pauseTimer = window.setTimeout(() => {
          frameCount = 0;
          lastTime = performance.now();
          rafId = requestAnimationFrame(tick);
        }, 2500);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (pauseTimer !== null) clearTimeout(pauseTimer);
    };
  }, [needsFpsCounter, screenRefreshRate]);

  const needsSystemMetrics =
    idleLayout.left === "cpu" ||
    idleLayout.left === "ram" ||
    idleLayout.left === "netspeed" ||
    idleLayout.center === "cpu" ||
    idleLayout.center === "ram" ||
    idleLayout.center === "netspeed" ||
    idleLayout.right === "cpu" ||
    idleLayout.right === "ram" ||
    idleLayout.right === "netspeed" ||
    isSettings;

  const [sysMetrics, setSysMetrics] = useState<{
    cpu_usage: number;
    mem_usage: number;
    mem_used_gb: number;
    mem_total_gb: number;
    wifi_down_mbps: number;
    wifi_up_mbps: number;
  } | null>(null);

  useEffect(() => {
    if (!needsSystemMetrics) return;
    let mounted = true;

    const fetchMetrics = async () => {
      try {
        const res = await invoke<{
          cpu_usage: number;
          mem_usage: number;
          mem_used_gb: number;
          mem_total_gb: number;
          wifi_down_mbps: number;
          wifi_up_mbps: number;
        }>("get_system_metrics");
        if (!mounted) return;
        setSysMetrics(res);
      } catch {
        // ignore
      }
    };

    fetchMetrics();
    const id = window.setInterval(fetchMetrics, 1500);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [needsSystemMetrics]);

  const idleRuntimeData: IdleRuntimeData = useMemo(() => ({
    battery,
    time,
    dateDisplay,
    fullDateTitle,
    weather,
    networkPing,
    pendingTodosCount: pendingTodos.length,
    stashedFilesCount: stashedFiles.length,
    fps,
    cpuUsage: sysMetrics?.cpu_usage,
    ramUsage: sysMetrics?.mem_usage,
    ramUsedGb: sysMetrics?.mem_used_gb,
    ramTotalGb: sysMetrics?.mem_total_gb,
    netDownMbps: sysMetrics?.wifi_down_mbps,
    netUpMbps: sysMetrics?.wifi_up_mbps,
    focusMode,
    optLanguage,
    isLightMode,
    onOpenTab: (tab) => goToTab(tab),
  }), [battery, time, dateDisplay, fullDateTitle, weather, networkPing, pendingTodos.length, stashedFiles.length, fps, sysMetrics, focusMode, optLanguage, isLightMode]);

  const isSingleLine = notif && (!notif.body || notif.body.trim() === "");
  const isSmallNotif = notif?.icon === "battery" || notif?.icon === "volume" || notif?.icon === "capslock";
  const isMediumNotif = notif?.title === t("notif_on_battery") || notif?.title === "On Battery" || (notif?.icon === "clipboard" && !notif?.body) || isSingleLine;

  const bodyTextFont = optFontSize === "small" ? "500 11px 'Inter', sans-serif" : optFontSize === "large" ? "500 13.5px 'Inter', sans-serif" : "500 12.5px 'Inter', sans-serif";
  const bodyTextWidth = notif?.body ? getTextWidth(notif.body, bodyTextFont) : 0;
  const isMultilineBody = Boolean(
    notif &&
      !isSmallNotif &&
      !isMediumNotif &&
      notif.body &&
      (notif.body.includes("\n") || bodyTextWidth > 320)
  );

  const effectiveIdleSize = optIdleSize;
  const effectiveTabSize = optTabSize;

  const statFont = optFontSize === "small" ? "bold 9px 'SF Pro Display', sans-serif" : optFontSize === "large" ? "bold 11.5px 'SF Pro Display', sans-serif" : "bold 10px 'SF Pro Display', sans-serif";

  const idleWidth = React.useMemo(() => {
    return measureIdleLayoutWidth(idleLayout, idleRuntimeData, statFont, camActive, micActive, effectiveIdleSize);
  }, [idleLayout, idleRuntimeData, statFont, camActive, micActive, effectiveIdleSize]);

  const mediaPillWidth = React.useMemo(() => {
    if (!media) return idleWidth;
    const titleFont = optFontSize === "small" ? "600 12.5px 'Inter', sans-serif" : optFontSize === "large" ? "600 15.5px 'Inter', sans-serif" : "600 14px 'Inter', sans-serif";
    const artistFont = optFontSize === "small" ? "500 10px 'Inter', sans-serif" : optFontSize === "large" ? "500 12.5px 'Inter', sans-serif" : "500 11px 'Inter', sans-serif";
    const titleWidth = getTextWidth(media.title || "", titleFont);
    const artistWidth = getTextWidth(media.artist || "", artistFont);
    const maxTextWidth = Math.max(titleWidth, artistWidth);
    const baseWidth = Math.min(300, Math.max(175, Math.ceil(108 + maxTextWidth)));
    return Math.round(baseWidth * (effectiveIdleSize === "compact" ? 0.96 : effectiveIdleSize === "large" ? 1.08 : 1.0));
  }, [media, optFontSize, effectiveIdleSize, idleWidth]);

  const lyricsIdleWidth = React.useMemo(() => {
    if (!media) return idleWidth;
    const isCompact = effectiveIdleSize === "compact";
    const lyricFont =
      optFontSize === "small"
        ? "bold 12px 'Inter', sans-serif"
        : optFontSize === "large"
        ? "bold 15px 'Inter', sans-serif"
        : "bold 13px 'Inter', sans-serif";
    const subFont =
      optFontSize === "small"
        ? "500 9px 'Inter', sans-serif"
        : optFontSize === "large"
        ? "500 11px 'Inter', sans-serif"
        : "500 9.5px 'Inter', sans-serif";
    const textToMeasure = activeIdleLyric.curr || media.title || "Now Playing";
    const currWidth = getTextWidth(textToMeasure, lyricFont);
    const nextWidth = activeIdleLyric.next ? getTextWidth(activeIdleLyric.next, subFont) : 0;
    const maxText = Math.max(currWidth, Math.min(currWidth + 24, nextWidth));
    // UI footprint: art (26-34px) + visualizer (24px) + padding (20px) + gaps (16px) + buffer
    const basePadding = isCompact ? 90 : 96;
    return Math.min(560, Math.max(160, Math.ceil(maxText + basePadding)));
  }, [media, activeIdleLyric, optFontSize, effectiveIdleSize, idleWidth]);

  const getDynamicWidth = () => {
    if (notif && (notif.type === "greeting" || notif.icon === "sun" || notif.icon === "moon")) {
      if (greetingStage === "compact") {
        return 76;
      }
      const rawTitle = (notif.title || "").replace(/^Hi,\s*/i, "").trim();
      const titleWidth = getTextWidth(rawTitle, "bold 13.5px 'Inter', sans-serif");
      const rawBody = notif.body ? notif.body.replace(/[!.,]/g, "").trim().toUpperCase() : "";
      const bodyWidth = getTextWidth(rawBody, "bold 10px 'Inter', sans-serif") + Math.round(rawBody.length * 0.85);
      const contentTextWidth = Math.max(titleWidth, bodyWidth);
      return Math.min(380, Math.ceil(contentTextWidth + 116));
    }

    if (notif && !isSmallNotif && !isMediumNotif) {
      const titleFont = optFontSize === "small" ? "600 12px 'Inter', sans-serif" : optFontSize === "large" ? "600 14.5px 'Inter', sans-serif" : "600 13px 'Inter', sans-serif";
      const bodyFont = optFontSize === "small" ? "500 11px 'Inter', sans-serif" : optFontSize === "large" ? "500 13.5px 'Inter', sans-serif" : "500 12.5px 'Inter', sans-serif";
      const titleWidth = getTextWidth(notif.title || "", titleFont);
      const bodyWidth = notif.body ? getTextWidth(notif.body, bodyFont) : 0;

      const overhead = 92;
      const minTitleNeeded = Math.ceil(titleWidth + overhead);

      let contentNeeded = minTitleNeeded;
      if (notif.body) {
        if (isMultilineBody) {
          const multilineLineWidth = Math.ceil(bodyWidth / 1.85);
          contentNeeded = Math.max(minTitleNeeded, Math.ceil(multilineLineWidth + overhead));
        } else {
          contentNeeded = Math.max(minTitleNeeded, Math.ceil(bodyWidth + overhead));
        }
      }

      const targetWidth = Math.max(minTitleNeeded, contentNeeded);
      return Math.min(460, Math.max(160, targetWidth));
    }

    if (notif) {
      const fontScale = optFontSize === "large" ? 1.12 : optFontSize === "small" ? 0.92 : 1.0;
      const titleFont = optFontSize === "large" ? "bold 15px 'SF Pro Display', sans-serif" : optFontSize === "small" ? "bold 13px 'SF Pro Display', sans-serif" : "bold 14px 'SF Pro Display', sans-serif";
      const bodyFont = optFontSize === "large" ? "15px 'SF Pro Display', sans-serif" : optFontSize === "small" ? "13px 'SF Pro Display', sans-serif" : "14px 'SF Pro Display', sans-serif";
      const titleWidth = getTextWidth(notif.title || "", titleFont);
      const bodyWidth = notif.body ? getTextWidth(notif.body, bodyFont) : 0;
      
      let baseWidth = Math.round((32 + 32 + 12) * fontScale);
      if (notif.body) baseWidth += 8;

      if (notif.icon === "clipboard") {
        if (!notif.body) return Math.round(215 * fontScale);
        return Math.min(360, Math.max(Math.round(215 * fontScale), Math.ceil(baseWidth + Math.max(titleWidth, bodyWidth) + 16)));
      }

      if (notif.icon === "volume" || notif.icon === "brightness") {
        return Math.round(250 * fontScale);
      }
      
      return Math.min(440, Math.max(Math.round(175 * fontScale), Math.ceil(baseWidth + titleWidth + bodyWidth + 12)));
    }

    if (media && (!isPausedMediaCollapsed || isPlaying) && !isExpanded) {
      return showLyrics ? lyricsIdleWidth : mediaPillWidth;
    }

    return idleWidth;
  };

  const dynamicWidth = React.useMemo(
    () => getDynamicWidth(),
    [greetingStage, media, notif, isExpanded, isSmallNotif, isMediumNotif, isMultilineBody, weather, camActive, micActive, isPlaying, isPausedMediaCollapsed, pendingTodos, stashedFiles.length, fps, focusMode, networkPing, idleLayout, idleRuntimeData, showLyrics, activeIdleLyric, battery, dateDisplay, optFontSize, optLanguage, time.getHours(), time.getMinutes(), effectiveIdleSize, idleWidth, mediaPillWidth, lyricsIdleWidth]
  );

  const [isNoteEditing, setIsNoteEditing] = useState(false);
  const [todoDynamicHeight, setTodoDynamicHeight] = useState<number>(() => {
    const visibleSlots = Math.min(4, Math.max(1, pendingTodos.length));
    const tasksH = pendingTodos.length === 0 ? 52 : visibleSlots * 40 + (visibleSlots - 1) * 4 + 10;
    return 208 + tasksH;
  });

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    listen("quick-note-shortcut", () => {
      setIsQuickControl(false);
      setIsTodo(false);
      setIsPomodoro(false);
      setIsDropShelf(false);
      setIsSysMonitor(false);
      setIsMiniNote(false);
      setIsWaterReminder(false);
      setIsClipboard(false);
      setIsSettings(false);
      setIsVolumeMixer(false);
      setIsExpanded(false);
      setIsQuickNoteOpen((prev) => !prev);
    })
      .then((u) => {
        unlistenFn = u;
      })
      .catch(console.error);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        ((e.ctrlKey || e.metaKey) && (e.key === "/" || e.code === "Slash")) ||
        (e.ctrlKey && e.shiftKey && (e.key.toLowerCase() === "d" || e.code === "KeyD"))
      ) {
        e.preventDefault();
        setIsHidden((prev) => !prev);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setIsQuickControl(false);
        setIsTodo(false);
        setIsPomodoro(false);
        setIsDropShelf(false);
        setIsSysMonitor(false);
        setIsMiniNote(false);
        setIsPrayerReminder(false);
        setIsWaterReminder(false);
        setIsQuickNoteOpen(false);
        setIsQuickNoteSaved(false);
        setIsQuickTodoOpen(false);
        setIsQuickTodoSaved(false);
        setIsClipboard(false);
        setIsSettings(false);
        setIsVolumeMixer(false);
        setIsExpanded(false);
        setIsQuickNoteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      if (unlistenFn) unlistenFn();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  let variant = "idle";
  if (isBooting) {
    variant = "hidden";
  } else if (isSettings) {
    variant = "settings";
  } else if (isNotifications) {
    variant = "notif_center";
  } else if (isVolumeMixer) {
    variant = "volume_mixer";
  } else if (isClipboard) {
    variant = "clipboard";
  } else if (prayerToast) {
    variant = "prayer_toast";
  } else if (waterToast) {
    variant = "water_toast";
  } else if (isPrayerReminder) {
    variant = "prayer_reminder";
  } else if (isWaterReminder) {
    variant = "water_reminder";
  } else if (isMiniNote) {
    variant = "mini_note";
  } else if (isSysMonitor) {
    variant = "sys_monitor";
  } else if (isDropShelf) {
    variant = "drop_shelf";
  } else if (isPomodoro) {
    variant = "pomodoro";
  } else if (isTodo) {
    variant = "todo";
  } else if (isQuickControl) {
    variant = "quick_control";
  } else if (isExpanded) {
    variant = showLyrics ? "media_expanded_lyrics" : "media_expanded";
  } else if (isDragOver) {
    variant = "drag_over";
  } else if (isQuickTodoOpen) {
    variant = "quick_todo";
  } else if (isQuickNoteOpen) {
    variant = "quick_note";
  } else if (notif && (notif.type === "greeting" || notif.icon === "sun" || notif.icon === "moon")) {
    variant = "notif_greeting";
  } else if (notif) {
    if (notif.icon === "volume" || notif.icon === "brightness") variant = "notif_volume";
    else if (notif.icon === "clipboard" && !notif.body) variant = "notif_clipboard";
    else if (isMediumNotif) variant = "notif_medium";
    else if (isSmallNotif) variant = "notif_small";
    else variant = "notif";
  } else if (pomodoro.completeAlert) {
    variant = "pomo_complete_alert";
  } else if (optAutoCompact && isBrowserActive) {
    variant = "compact";
  } else if (pomodoro.isRunning && pomodoro.settings.showIdleTimer) {
    variant = "pomo_idle";
  } else if (media && (!isPausedMediaCollapsed || isPlaying)) {
    variant = showLyrics ? "lyrics_idle" : "media";
  }

  if (isHidden) {
    variant = "hidden";
  }

  variantRef.current = variant;

  const isIdle =
    variant === "idle" ||
    variant === "media" ||
    variant === "lyrics_idle" ||
    variant === "pomo_idle";

  useEffect(() => {
    variantRef.current = variant;
    isIdleRef.current = isIdle;
  }, [isIdle, variant]);

  const isExpandedPanel = Boolean(
    currentTab &&
      (variant === "quick_control" ||
        variant === "todo" ||
        variant === "pomodoro" ||
        variant === "drop_shelf" ||
        variant === "sys_monitor" ||
        variant === "mini_note" ||
        variant === "water_reminder" ||
        variant === "prayer_reminder" ||
        variant === "clipboard" ||
        variant === "settings" ||
        variant === "volume_mixer" ||
        variant === "notif_center" ||
        variant === "media_expanded" ||
        variant === "media_expanded_lyrics")
  );

  const isAnyPanelOpen = Boolean(
    isExpandedPanel ||
      variant === "water_reminder" ||
      variant === "water_toast" ||
      variant === "prayer_reminder" ||
      variant === "prayer_toast" ||
      variant === "quick_control" ||
      variant === "todo" ||
      variant === "pomodoro" ||
      variant === "drop_shelf" ||
      variant === "sys_monitor" ||
      variant === "mini_note" ||
      variant === "clipboard" ||
      variant === "settings" ||
      variant === "volume_mixer" ||
      variant === "notif_center" ||
      variant === "media_expanded" ||
      variant === "media_expanded_lyrics" ||
      variant === "quick_todo" ||
      variant === "quick_note" ||
      variant === "drag_over"
  );

  const panelTitle = 
    currentTab === "media_expanded" ? t("tab_now_playing") :
    currentTab === "quick_control" ? t("tab_control_center") :
    currentTab === "todo" ? t("tab_todo_list") :
    currentTab === "pomodoro" ? t("tab_pomodoro") :
    currentTab === "drop_shelf" ? t("tab_file_shelf") :
    currentTab === "sys_monitor" ? t("tab_sys_monitor") :
    currentTab === "mini_note" ? t("tab_mini_note") :
    currentTab === "water_reminder" ? (t("tab_water_reminder") || "Air") :
    currentTab === "prayer_reminder" ? (t("tab_prayer_reminder") || "Sholat") :
    currentTab === "clipboard" ? t("tab_clipboard") :
    currentTab === "volume_mixer" ? t("tab_volume_mixer") :
    currentTab === "notif_center" ? (t("tab_notifications") || "Notifikasi") :
    t("tab_settings");

  const isIsland = notchShape === "island";
  const effectiveEars = notchShape === "notch" && (optEars ?? true);
  const isBot = isBottomNotchPosition(optPosition);
  const isTopPos = isTopNotchPosition(optPosition);
  const isLeftPos = isLeftNotchPosition(optPosition);
  const isRightPos = isRightNotchPosition(optPosition);
  const isSideCenter = isSideCenterNotchPosition(optPosition);

  const radius = (bottomR: string, islandR?: string) => {
    if (isIsland) {
      const r = islandR ?? (isExpandedPanel ? "32px" : bottomR);
      return `${r} ${r} ${r} ${r}`;
    }
    if (optPosition === "left") return `0px ${bottomR} ${bottomR} 0px`;
    if (optPosition === "right") return `${bottomR} 0px 0px ${bottomR}`;
    return isBot ? `${bottomR} ${bottomR} 0px 0px` : `0px 0px ${bottomR} ${bottomR}`;
  };
  const startY = isSideCenter ? 0 : isBot ? 20 : -20;
  const startX = optPosition === "left" ? -20 : optPosition === "right" ? 20 : 0;

  const idleMultiplier = effectiveIdleSize === "compact" ? 0.88 : effectiveIdleSize === "large" ? 1.15 : 1.0;
  const idleHeight = effectiveIdleSize === "compact" ? 28 : effectiveIdleSize === "large" ? 36 : 32;
  const activeIdleSlotsCount =
    (idleLayout.left !== "none" ? 1 : 0) +
    (idleLayout.center !== "none" ? 1 : 0) +
    (idleLayout.right !== "none" ? 1 : 0) +
    (camActive || micActive ? 1 : 0);
  const idleSideWidth = Math.round(
    (effectiveIdleSize === "compact" ? 64 : effectiveIdleSize === "large" ? 80 : 72) *
      (optFontSize === "large" ? 1.08 : optFontSize === "small" ? 0.94 : 1.0)
  );
  const idleSideHeight = Math.round(
    Math.max(46, Math.max(1, activeIdleSlotsCount) * 20 + 18) * (idleHeight / 32)
  );

  const lyricsIdleBaseHeight =
    optFontSize === "large" || effectiveIdleSize === "large"
      ? 54
      : effectiveIdleSize === "compact"
      ? 44
      : 48;

  const lyricsExpandedWidth = effectiveTabSize === "compact" ? 652 : effectiveTabSize === "large" ? 740 : 680;
  const tabWidth = lyricsExpandedWidth;
  const tabHeightMultiplier = effectiveTabSize === "large" ? 1.06 : 1.0;
  const unifiedTabHeight = Math.round((isBot ? 330 : 292) * tabHeightMultiplier);

  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let smoothSpring: any = prefersReducedMotion 
    ? { duration: 0 } 
    : { type: "spring", stiffness: 290, damping: 24, mass: 0.76 };
  if (!prefersReducedMotion && optAnimSpeed === "snappy") smoothSpring = { type: "spring", stiffness: 380, damping: 27, mass: 0.68 };
  if (!prefersReducedMotion && optAnimSpeed === "bouncy") smoothSpring = { type: "spring", stiffness: 260, damping: 19, mass: 0.78 };

  const currentY = isSideCenter ? 0 : isBot ? -shapeTransitionY : shapeTransitionY;
  const currentX = optPosition === "left" ? shapeTransitionY : optPosition === "right" ? -shapeTransitionY : 0;

  const variants = {
    initialState: { width: 0, height: 0, x: startX, y: startY, opacity: 0, borderRadius: radius("16px") },
    hidden: { width: 0, height: 0, x: startX, y: startY, opacity: 0, scale: 0.8, borderRadius: radius("16px") },
    compact: {
      width: isSideCenter ? Math.round(7 * (idleHeight / 32)) : Math.round(52 * idleMultiplier),
      height: isSideCenter ? Math.round(52 * idleMultiplier) : Math.round(7 * (idleHeight / 32)),
      x: currentX,
      y: currentY,
      opacity: 0.95,
      borderRadius: radius("4px", `${Math.round(7 * (idleHeight / 32) / 2)}px`),
    },
    idle: {
      width: isSideCenter ? idleSideWidth : idleWidth,
      height: isSideCenter ? idleSideHeight : idleHeight,
      x: currentX,
      y: currentY,
      opacity: 1,
      borderRadius: radius(idleHeight >= 36 ? "14px" : "12px", `${Math.round(idleHeight / 2)}px`),
    },
    pomo_idle: { width: Math.round(280 * idleMultiplier), height: Math.round(40 * (idleHeight / 32)), x: 0, y: currentY, opacity: 1, borderRadius: radius("20px", `${Math.round(40 * (idleHeight / 32) / 2)}px`) },
    pomo_complete_alert: { width: 520, height: 112, x: 0, y: currentY, opacity: 1, borderRadius: radius("28px") },
    quick_todo: {
      width: 560,
      height: isQuickTodoSaved ? (isIsland ? 342 : 330) : (isIsland ? 218 : 204),
      x: 0,
      y: currentY,
      opacity: 1,
      borderRadius: radius("28px"),
    },
    quick_note: {
      width: 520,
      height: isQuickNoteSaved ? (isIsland ? 342 : 330) : (isIsland ? 168 : 156),
      x: 0,
      y: currentY,
      opacity: 1,
      borderRadius: radius("28px"),
    },
    drag_over: { width: tabWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    media: { width: mediaPillWidth, height: Math.round(48 * (idleHeight / 32)), x: 0, y: currentY, opacity: 1, borderRadius: radius("16px", `${Math.round(48 * (idleHeight / 32) / 2)}px`) },
    lyrics_idle: { width: lyricsIdleWidth, height: lyricsIdleBaseHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("16px", `${Math.round(lyricsIdleBaseHeight / 2)}px`) },
    media_expanded: { width: lyricsExpandedWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    media_expanded_lyrics: { width: lyricsExpandedWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    notif_greeting: { width: dynamicWidth, height: 52, x: 0, y: currentY, opacity: 1, borderRadius: radius("18px", "26px") },
    notif: { width: dynamicWidth, height: Math.round((isMultilineBody ? 82 : 68) * (idleHeight / 32)), x: 0, y: currentY, opacity: 1, borderRadius: radius(isMultilineBody ? "22px" : "18px", "28px") },
    notif_small: { width: dynamicWidth, height: Math.round(48 * (idleHeight / 32)), x: 0, y: currentY, opacity: 1, borderRadius: radius("16px", "24px") },
    notif_volume: { width: dynamicWidth, height: Math.round(48 * (idleHeight / 32)), x: 0, y: currentY, opacity: 1, borderRadius: radius("16px", "24px") },
    notif_clipboard: { width: dynamicWidth, height: Math.round(48 * (idleHeight / 32)), x: 0, y: currentY, opacity: 1, borderRadius: radius("16px", "24px") },
    notif_medium: { width: dynamicWidth, height: Math.round(48 * (idleHeight / 32)), x: 0, y: currentY, opacity: 1, borderRadius: radius("16px", "24px") },
    quick_control: { width: tabWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    todo: { width: tabWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    pomodoro: { width: tabWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    drop_shelf: { width: tabWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    sys_monitor: { width: tabWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    mini_note: { width: tabWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    water_reminder: { width: tabWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    prayer_reminder: { width: tabWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    prayer_toast: {
      width: 448,
      height: 68,
      x: 0,
      y: currentY,
      opacity: 1,
      borderRadius: radius("20px", "24px"),
    },
    water_toast: {
      width: waterToast?.type === "time_to_drink" ? 440 : waterToast?.type === "streak_threatened" ? 430 : 380,
      height: waterToast?.type === "time_to_drink" ? 70 : waterToast?.type === "streak_threatened" ? 66 : 58,
      x: 0,
      y: currentY,
      opacity: 1,
      borderRadius: radius("20px", "24px"),
    },
    clipboard: { width: tabWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    settings: { width: tabWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    volume_mixer: { width: tabWidth, height: unifiedTabHeight, x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    notif_center: { width: tabWidth, height: Math.round((isBot ? 400 : 376) * tabHeightMultiplier), x: 0, y: currentY, opacity: 1, borderRadius: radius("32px") },
    onboarding: { width: Math.min(tabWidth, 460), height: 195, x: 0, y: currentY, opacity: 1, borderRadius: radius("26px") },
  };

  const tabVariants: any = {
    enter: (direction: number) => ({
      x: direction > 0 ? 16 : direction < 0 ? -16 : 0,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
      transition: {
        x: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.18, ease: "easeOut" },
        staggerChildren: 0.05,
        delayChildren: 0.03,
      },
      transitionEnd: { transform: "none" },
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -16 : direction < 0 ? 16 : 0,
      opacity: 0,
      transition: {
        x: { duration: 0.08, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.08, ease: "easeIn" },
      },
    }),
  };

  const currentVariantSize = variants[variant as keyof typeof variants] || variants.idle;
  const lastExpandedSizeRef = useRef({ width: tabWidth, height: Math.round(385 * tabHeightMultiplier) });
  if (isExpandedPanel) {
    lastExpandedSizeRef.current = {
      width: currentVariantSize.width,
      height: currentVariantSize.height,
    };
  }

  const isAnyPanelOpenRef = useRef(isAnyPanelOpen);
  isAnyPanelOpenRef.current = isAnyPanelOpen;
  variantsRef.current = variants;
  const isIslandRef = useRef(isIsland);
  isIslandRef.current = isIsland;
  const islandTopOffsetRef = useRef(islandTopOffset);
  islandTopOffsetRef.current = islandTopOffset;
  const isBotRef = useRef(isBot);
  isBotRef.current = isBot;

  useEffect(() => {
    const currentSize = variants[variant as keyof typeof variants] || variants.idle;
    const isCollapsed = !isAnyPanelOpen;
    const pillEl = document.getElementById("notch-pill");
    const rect = pillEl ? pillEl.getBoundingClientRect() : null;
    const measuredWidth = rect && rect.width > 0 ? Math.round(rect.width) : currentSize.width;
    const measuredHeight = rect && rect.height > 0 ? Math.round(rect.height) : currentSize.height;

    const targetWidth = isCollapsed ? currentSize.width : Math.max(currentSize.width, measuredWidth);
    const targetHeight = isCollapsed ? currentSize.height : Math.max(currentSize.height, measuredHeight);

    invoke("update_pill_size", { 
      width: targetWidth, 
      height: targetHeight,
      isBottom: isBottomNotchPosition(optPosition),
      position: optPosition,
      topOffset: islandTopOffset,
      isIsland: notchShape === "island",
      dpr: window.devicePixelRatio || 1.0,
    }).catch(console.error);
    invoke("enforce_always_on_top").catch(console.error);
  }, [variant, optPosition, notchShape, islandTopOffset, showLyrics, dynamicWidth, idleWidth, idleSideWidth, idleSideHeight, mediaPillWidth, lyricsIdleWidth, effectiveIdleSize, effectiveTabSize, optFontSize, controlCenterSubmenu, isNoteEditing, todoDynamicHeight, isAnyPanelOpen, waterToast]);

  useEffect(() => {
    const handleDprOrResize = () => {
      const currentSize = variants[variant as keyof typeof variants] || variants.idle;
      const isCollapsed = !isAnyPanelOpen;
      const pillEl = document.getElementById("notch-pill");
      const rect = !isCollapsed && pillEl ? pillEl.getBoundingClientRect() : null;
      invoke("update_pill_size", {
        width: isCollapsed ? currentSize.width : (rect && rect.width > currentSize.width ? Math.round(rect.width) : currentSize.width),
        height: isCollapsed ? currentSize.height : (rect && rect.height > currentSize.height ? Math.round(rect.height) : currentSize.height),
        isBottom: isBottomNotchPosition(optPosition),
        position: optPosition,
        topOffset: islandTopOffset,
        isIsland: notchShape === "island",
        dpr: window.devicePixelRatio || 1.0,
      }).catch(console.error);
    };

    window.addEventListener("resize", handleDprOrResize);
    const mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mediaQuery.addEventListener?.("change", handleDprOrResize);

    return () => {
      window.removeEventListener("resize", handleDprOrResize);
      mediaQuery.removeEventListener?.("change", handleDprOrResize);
    };
  }, [variant, optPosition, notchShape, islandTopOffset, isAnyPanelOpen]);
  
  useEffect(() => {
    invoke("set_window_position", { 
      isBottom: isBottomNotchPosition(optPosition),
      position: optPosition,
      topOffset: islandTopOffset,
      isIsland: notchShape === "island",
      targetMonitor: optTargetMonitor,
    }).catch(console.error);
  }, [optPosition, notchShape, islandTopOffset, optTargetMonitor]);

  useEffect(() => {
    const handleFocus = () => {
      invoke("enforce_always_on_top").catch(console.error);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const lastVolInvokeRef = useRef(0);
  const pendingVolRef = useRef<number | null>(null);
  const volTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volAdjustResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const throttledSetVolume = useCallback((v: number) => {
    isAdjustingVolumeRef.current = true;
    pendingVolRef.current = v;
    const now = Date.now();
    if (now - lastVolInvokeRef.current >= 18) {
      lastVolInvokeRef.current = now;
      if (volTimeoutRef.current) clearTimeout(volTimeoutRef.current);
      invoke("set_master_volume", { level: v / 100.0 }).catch(console.error);
    } else {
      if (!volTimeoutRef.current) {
        volTimeoutRef.current = setTimeout(() => {
          volTimeoutRef.current = null;
          if (pendingVolRef.current !== null) {
            lastVolInvokeRef.current = Date.now();
            invoke("set_master_volume", { level: pendingVolRef.current / 100.0 }).catch(console.error);
          }
        }, 18);
      }
    }
    if (volAdjustResetTimerRef.current) clearTimeout(volAdjustResetTimerRef.current);
    volAdjustResetTimerRef.current = setTimeout(() => {
      isAdjustingVolumeRef.current = false;
    }, 350);
  }, []);

  const lastBrightInvokeRef = useRef(0);
  const pendingBrightRef = useRef<number | null>(null);
  const brightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const throttledSetBrightness = useCallback((v: number) => {
    pendingBrightRef.current = v;
    const now = Date.now();
    if (now - lastBrightInvokeRef.current >= 40) {
      lastBrightInvokeRef.current = now;
      if (brightTimeoutRef.current) clearTimeout(brightTimeoutRef.current);
      invoke("set_brightness", { level: v }).catch(console.error);
    } else {
      if (!brightTimeoutRef.current) {
        brightTimeoutRef.current = setTimeout(() => {
          brightTimeoutRef.current = null;
          if (pendingBrightRef.current !== null) {
            lastBrightInvokeRef.current = Date.now();
            invoke("set_brightness", { level: pendingBrightRef.current }).catch(console.error);
          }
        }, 40);
      }
    }
  }, []);

  const wheelAccumulatorRef = useRef<number>(0);
  const lastWheelTimeRef = useRef<number>(0);

  const handleNotchWheel = useCallback((e: React.WheelEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      target.closest(
        '.settings-scroll, .overflow-y-auto, .overflow-x-auto, [data-scrollable="true"], .notes-horizontal-scroll'
      )
    ) {
      return;
    }

    const isShift = e.shiftKey;

    // In Chromium / WebView2, holding Shift converts vertical wheel/touchpad scroll into deltaX
    const effectiveDelta = isShift && Math.abs(e.deltaY) < 1 ? e.deltaX : e.deltaY;
    if (Math.abs(effectiveDelta) < 1) return;

    // When NOT holding Shift, ignore horizontal gestures so they can be handled as tab navigation
    if (!isShift && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

    const dir = getWheelVerticalDirection(e);

    const now = Date.now();
    if (now - lastWheelTimeRef.current > 220) {
      wheelAccumulatorRef.current = 0;
    }
    lastWheelTimeRef.current = now;
    wheelAccumulatorRef.current += Math.abs(effectiveDelta) * dir;

    const THRESHOLD = 10;
    if (Math.abs(wheelAccumulatorRef.current) >= THRESHOLD) {
      const steps = Math.trunc(wheelAccumulatorRef.current / THRESHOLD);
      wheelAccumulatorRef.current -= steps * THRESHOLD;
      const change = steps * 2;

      // Shift + 2 fingers: Brightness (strictly Control Panel only)
      if (isShift) {
        if (currentTab === "quick_control") {
          setDisplayLevel((prev) => {
            const next = Math.max(0, Math.min(100, prev + change));
            throttledSetBrightness(next);
            playVolumeTick(next);
            showNotif({ title: t("cc_brightness"), body: `${next}%`, icon: "brightness", forceShow: true } as any);
            return next;
          });
        }
        return;
      }

      // When any expanded panel is open, do not hijack wheel for master volume (panels have their own dedicated sliders)
      if (currentTab !== null) {
        return;
      }

      // 2 fingers: Volume (available on idle notch, music tab, and control panel)
      setSoundLevel((prev) => {
        const next = Math.max(0, Math.min(100, prev + change));
        throttledSetVolume(next);
        playVolumeTick(next);
        showNotif({ title: t("cc_volume"), body: `${next}%`, icon: "volume", forceShow: true } as any);
        return next;
      });
    }
  }, [currentTab, throttledSetBrightness, throttledSetVolume]);

  const focusedTaskTitle = useMemo(() => {
    if (!pomodoro.focusedTaskId) return null;
    return todoItems.find((t) => t.id === pomodoro.focusedTaskId)?.text || null;
  }, [pomodoro.focusedTaskId, todoItems]);

  const isMusicExpandedTab = isExpandedPanel && (currentTab === "media_expanded" || variant === "media_expanded" || variant === "media_expanded_lyrics");
  const activeEffectiveThemeMode = variant === "notif_greeting" || isMusicExpandedTab
    ? "solid"
    : resolveNotchThemeMode(Number(optOpacity), Number(optBlur));
  const activeEffectiveOpacity = isMusicExpandedTab ? 1.0 : Number(optOpacity);
  const activeEffectiveBlur = isMusicExpandedTab ? 0 : Number(optBlur);

  return (
    <div
      className={`w-screen h-screen flex bg-transparent pointer-events-none ${
        isLeftPos ? "justify-start" : isRightPos ? "justify-end" : "justify-center"
      } ${isTopPos ? "items-start" : isBot ? "items-end" : "items-center"}`}
    >
      <motion.div
        ref={notchPillRef}
        id="notch-pill"
        data-position={optPosition}
        data-notch-shape={notchShape}
        data-theme-mode={activeEffectiveThemeMode}
        data-font-size={optFontSize}
        data-idle-size={effectiveIdleSize}
        data-tab-size={effectiveTabSize}
        style={{
          "--shape-radius-top": isIsland ? (isExpandedPanel ? "32px" : `${Math.round(idleHeight / 2)}px`) : (isBot ? "32px" : "0px"),
          "--shape-radius-bottom": isExpandedPanel ? "32px" : `${Math.round(idleHeight / 2)}px`,
          "--top-offset": isIsland ? `${islandTopOffset}px` : "0px",
          ...computeNotchGlassCssVars(activeEffectiveOpacity, activeEffectiveBlur, isLightMode, isExpandedPanel),
        } as React.CSSProperties}
        initial="initialState"
        animate={variant}
        variants={variants}
        transition={smoothSpring}
        onAnimationComplete={() => {
          const pillEl = document.getElementById("notch-pill");
          if (pillEl) {
            const rect = pillEl.getBoundingClientRect();
            const currentSize = variants[variant as keyof typeof variants] || variants.idle;
            const isCollapsed = !isAnyPanelOpen;
            const finalWidth = isCollapsed
              ? currentSize.width
              : Math.max(currentSize.width, rect.width > 0 ? Math.round(rect.width) : currentSize.width);
            const finalHeight = isCollapsed
              ? currentSize.height
              : Math.max(currentSize.height, rect.height > 0 ? Math.round(rect.height) : currentSize.height);

            invoke("update_pill_size", {
              width: finalWidth,
              height: finalHeight,
              isBottom: isBottomNotchPosition(optPosition),
              position: optPosition,
              topOffset: islandTopOffset,
              isIsland: notchShape === "island",
              dpr: window.devicePixelRatio || 1.0,
            }).catch(console.error);
          }
          // After update_pill_size so a replayed hover is checked against the collapsed hit zone
          finishClosing();
        }}
        onWheel={handleNotchWheel}
        onMouseMove={() => {
          if (isClosingRef.current || Date.now() < closeGraceUntilRef.current) return;
          isCursorInsideNotchRef.current = true;
          cancelCollapseTimer();
          if (
            notif ||
            isDragOver ||
            variant === "pomo_complete_alert" ||
            variant === "todo_deadline_alert"
          ) {
            return;
          }
          if (focusModeRef.current === "Gaming") {
            return;
          }
          if (variant === "compact" && !compactHoverTimerRef.current && !isQuickControl && !isExpanded) {
            startCompactHoverTimer(80);
          }
        }}
        onMouseEnter={() => {
          if (isClosingRef.current || Date.now() < closeGraceUntilRef.current) {
            return;
          }
          isCursorInsideNotchRef.current = true;
          isShortcutPinnedRef.current = false;
          if (shortcutPinnedTimerRef.current) {
            clearTimeout(shortcutPinnedTimerRef.current);
            shortcutPinnedTimerRef.current = null;
          }
          cancelCollapseTimer();
          setSlideDirection(0);
          if (
            notif ||
            isDragOver ||
            variant === "pomo_complete_alert" ||
            variant === "todo_deadline_alert"
          ) {
            return;
          }
          if (currentTab !== null) {
            return;
          }
          if (focusModeRef.current === "Gaming") {
            return;
          }
          if (variant === "compact") {
            startCompactHoverTimer(80);
            return;
          }
          if (variant === "media" || variant === "lyrics_idle") {
            goToTab("media_expanded", 0);
            return;
          }
          if (variant === "pomo_idle") {
            goToTab("pomodoro", 0);
            return;
          }
          if (variant === "todo_idle_countdown") {
            goToTab("todo", 0);
            return;
          }
          if (variant === "idle") {
            openLastOrPreferredTab();
          }
        }}
        onClick={() => {
          if (isClosingRef.current || Date.now() < closeGraceUntilRef.current) return;
          if (currentTab !== null || isExpandedPanel) return;
          if (
            notif ||
            isDragOver ||
            variant === "pomo_complete_alert" ||
            variant === "todo_deadline_alert"
          ) {
            return;
          }
          if (variant === "compact") {
            cancelCompactHoverTimer();
            handleCompactHoverTrigger();
          } else if (variant === "media" || variant === "lyrics_idle") {
            goToTab("media_expanded", 0);
          } else if (variant === "pomo_idle") {
            goToTab("pomodoro", 0);
          } else if (variant === "todo_idle_countdown") {
            goToTab("todo", 0);
          } else if (variant === "idle") {
            openLastOrPreferredTab();
          }
        }}
        onMouseLeave={() => {
          cancelCompactHoverTimer();
          if (isSwitchingTabRef.current) return;
          isCursorInsideNotchRef.current = false;
          startCollapseTimer(350);
          if (!isPlayingRef.current && mediaRef.current && !isPausedMediaCollapsedRef.current) {
            startPausedMediaCollapseTimer(3000);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isDragOver) setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX <= rect.left ||
            e.clientX >= rect.right ||
            e.clientY <= rect.top ||
            e.clientY >= rect.bottom
          ) {
            setIsDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
          if (isShelfDraggingRef.current) return;
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const paths: string[] = [];
            for (let i = 0; i < e.dataTransfer.files.length; i++) {
              const file = e.dataTransfer.files[i];
              const p = (file as any).path;
              if (typeof p === "string" && (p.includes("\\") || p.includes("/"))) {
                if (!outgoingShelfPathsRef.current.has(p.toLowerCase())) {
                  paths.push(p);
                }
              }
            }
            if (paths.length > 0) {
              addStashedFiles(paths);
              goToTab("drop_shelf", 0);
            }
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          cancelCollapseTimer();
          if (notif) {
            setNotif(null);
          } else if (isExpandedPanel) {
            handleCloseImmediate();
          } else if (variant === "media" || variant === "lyrics_idle") {
            if (!isPlayingRef.current) {
              clearPausedMediaTimer();
              setIsPausedMediaCollapsed(true);
            } else {
              openLastOrPreferredTab();
            }
          } else {
            openLastOrPreferredTab();
          }
        }}
        className={`${isLightMode ? "light" : "text-white"} ${isHidden ? "pointer-events-none" : "pointer-events-auto"} relative shrink-0 bg-transparent`}
      >
        <NotchSurface
          containerRef={notchPillRef}
          position={optPosition}
          notchShape={notchShape}
          withEars={Boolean(effectiveEars && variant !== "compact" && variant !== "hidden")}
          isExpanded={Boolean(
            isExpandedPanel ||
            isExpanded ||
            isSettings ||
            isNotifications ||
            isQuickControl ||
            isTodo ||
            isPomodoro ||
            isDropShelf ||
            isSysMonitor ||
            isMiniNote ||
            isClipboard ||
            isVolumeMixer ||
            variant === "quick_todo" ||
            variant === "quick_note" ||
            variant === "drag_over" ||
            variant === "pomo_complete_alert" ||
            (notif && !isSmallNotif && !isMediumNotif)
          )}
          ambientImageUrl={
            isExpandedPanel && (currentTab === "media_expanded" || variant === "media_expanded" || variant === "media_expanded_lyrics")
              ? musicAmbientUrl
              : null
          }
          surfaceTone={
            isDragOver
              ? "drag_over"
              : "default"
          }
          themeMode={activeEffectiveThemeMode}
          opacity={activeEffectiveOpacity}
          blur={activeEffectiveBlur}
          isLightMode={isLightMode}
        />

        <div className="absolute inset-0 z-10 overflow-hidden rounded-[inherit] pointer-events-auto">
          <AnimatePresence>
            {isDragOver && (
              <motion.div
                key="drag-over-overlay"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="absolute inset-0 z-50 rounded-[inherit] bg-black/80 backdrop-blur-md p-3.5 flex flex-col pointer-events-none select-none"
              >
                <div className="w-full h-full rounded-[22px] border-2 border-dashed border-cyan-400/50 bg-cyan-950/25 flex flex-col items-center justify-center gap-2.5 text-center p-4">
                  <div className="w-13 h-13 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shrink-0 shadow-[0_0_24px_rgba(6,182,212,0.35)]">
                    <UploadCloud size={26} className="text-cyan-300 animate-bounce" />
                  </div>
                  <div className="text-[15px] font-bold tracking-tight text-white">
                    {t("shelf_drop_title")}
                  </div>
                  <div className="text-[11.5px] font-medium text-cyan-200/70 max-w-[340px] leading-snug">
                    {t("shelf_drop_desc")}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {variant === "compact" && (
              <motion.div
                key="compact"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 flex items-center justify-center cursor-pointer select-none"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelCompactHoverTimer();
                  handleCompactHoverTrigger();
                }}
              >
                <div
                  className={`${
                    isSideCenter ? "w-[2px] h-6" : "w-6 h-[2px]"
                  } rounded-full bg-white/70 shadow-[0_0_3px_rgba(255,255,255,0.6)]`}
                />
              </motion.div>
            )}

            {variant === "pomo_idle" && (
              <PomodoroIdlePill
                mode={pomodoro.mode}
                remainingSec={pomodoro.remainingSec}
                totalSec={pomodoro.totalSec}
                isRunning={pomodoro.isRunning}
                taskTitle={focusedTaskTitle}
                isLightMode={isLightMode}
                onClick={() => goToTab("pomodoro", 0)}
              />
            )}

            {variant === "pomo_complete_alert" && pomodoro.completeAlert && (
              <PomodoroCompleteAlertCard
                alert={pomodoro.completeAlert}
                focusedTaskTitle={focusedTaskTitle}
                todayFocusMinutes={pomodoro.dailyStats.focusMinutesToday}
                isLightMode={isLightMode}
                onAccept={pomodoro.acceptCompleteAlert}
                onSkip={pomodoro.skipCompleteAlert}
                onDismiss={pomodoro.dismissCompleteAlert}
              />
            )}

            {variant === "quick_todo" && isQuickTodoOpen && (
              <motion.div key="quick_todo" className="absolute inset-0 w-full h-full">
                <React.Suspense fallback={null}>
                  <QuickTodoNotchCard
                    todoItems={todoItems}
                    optAccent={optAccent}
                    optLanguage={optLanguage}
                    isIsland={isIsland}
                    isLightMode={isLightMode}
                    shortcutLabel={formatShortcutForBadge(shortcuts.quick_task)}
                    onSave={(text, dueAt, reminders, repeatRule) => {
                      const created = addTodoItem(text, dueAt, reminders, repeatRule);
                      playTaskCompleteSound();
                      return created;
                    }}
                    onToggleTodo={toggleTodoItem}
                    onDeleteTodo={deleteTodoItem}
                    onSavedStateChange={setIsQuickTodoSaved}
                    onOpenTodoList={() => {
                      setIsQuickTodoOpen(false);
                      setIsQuickTodoSaved(false);
                      goToTab("todo", 0);
                    }}
                    onCancel={() => {
                      setIsQuickTodoOpen(false);
                      setIsQuickTodoSaved(false);
                      invoke("restore_previous_foreground_window").catch(() => {});
                    }}
                  />
                </React.Suspense>
              </motion.div>
            )}

            {variant === "quick_note" && isQuickNoteOpen && (
              <motion.div key="quick_note" className="absolute inset-0 w-full h-full">
                <React.Suspense fallback={null}>
                  <QuickNoteNotchCard
                    isLightMode={isLightMode}
                    isIsland={isIsland}
                    shortcutLabel={formatShortcutForBadge(shortcuts.quick_note)}
                    onSave={(text, color, pinned) => {
                      const created = createQuickNoteItem(text, color, pinned);
                      playTaskCompleteSound();
                      return created;
                    }}
                    onDeleteNote={(id) => {
                      deleteQuickNoteItem(id);
                    }}
                    onSavedStateChange={setIsQuickNoteSaved}
                    onOpenNotesList={() => {
                      setIsQuickNoteOpen(false);
                      setIsQuickNoteSaved(false);
                      goToTab("mini_note", 0);
                    }}
                    onCancel={() => {
                      setIsQuickNoteOpen(false);
                      setIsQuickNoteSaved(false);
                      invoke("restore_previous_foreground_window").catch(() => {});
                    }}
                  />
                </React.Suspense>
              </motion.div>
            )}

            {variant === "prayer_toast" && prayerToast && (
              <PrayerNotchToast
                toast={prayerToast}
                isLightMode={isLightMode}
                onMarkCompleted={() => {
                  const res = togglePrayerCompleted(prayerToast.prayerId);
                  if (res.isNowCompleted) {
                    setPrayerToast({
                      ...prayerToast,
                      type: "completed",
                    });
                  } else {
                    setPrayerToast(null);
                  }
                }}
                onOpenPrayerTab={() => {
                  setPrayerToast(null);
                  goToTab("prayer_reminder", 0);
                }}
                onDismiss={() => setPrayerToast(null)}
              />
            )}

            {variant === "water_toast" && waterToast && (
              <WaterNotchToast
                type={waterToast.type}
                data={waterData}
                isLightMode={isLightMode}
                loggedAmount={waterToast.amount}
                onDrinkQuick={(amt) => {
                  const result = logDrink(amt);
                  playWaterDrinkSound();
                  if (result.targetAchieved || result.streakIncreased) {
                    setWaterToast({ type: "streak_increased", amount: amt });
                  } else {
                    setWaterToast({ type: "logged", amount: amt });
                  }
                }}
                onUndo={() => {
                  undoLastDrink();
                  setWaterToast(null);
                }}
                onSnooze={(mins) => {
                  snoozeWaterReminder(mins);
                  setWaterToast(null);
                }}
                onFreeze={() => {
                  useStreakFreeze();
                  setWaterToast(null);
                }}
                onViewWaterTab={() => {
                  setWaterToast(null);
                  goToTab("water_reminder", 0);
                }}
                onDismiss={() => {
                  setWaterToast(null);
                }}
              />
            )}

            {variant === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{
                  opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                  scale: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                }}
                className={`absolute inset-0 flex items-center justify-center cursor-pointer overflow-hidden ${
                  isSideCenter
                    ? "px-1.5 py-2"
                    : effectiveIdleSize === "compact"
                    ? "px-[14px]"
                    : effectiveIdleSize === "large"
                    ? "px-5"
                    : "px-4"
                }`}
                onClick={() => openLastOrPreferredTab()}
              >
                <div
                  className={`flex ${
                    isSideCenter ? "flex-col gap-1" : effectiveIdleSize === "compact" ? "gap-2" : effectiveIdleSize === "large" ? "gap-3" : "gap-2.5"
                  } items-center justify-center w-full`}
                >
                  {idleLayout.left !== "none" && (
                    <motion.div key={`idle-left-${idleLayout.left}`} layout transition={smoothSpring} className="flex items-center shrink-0">
                      <IdleSlotView item={idleLayout.left} data={idleRuntimeData} />
                    </motion.div>
                  )}

                  {idleLayout.center !== "none" && (
                    <motion.div key={`idle-center-${idleLayout.center}`} layout transition={smoothSpring} className="flex items-center shrink-0">
                      <IdleSlotView item={idleLayout.center} data={idleRuntimeData} />
                    </motion.div>
                  )}

                  {idleLayout.right !== "none" && (
                    <motion.div key={`idle-right-${idleLayout.right}`} layout transition={smoothSpring} className="flex items-center shrink-0">
                      <IdleSlotView item={idleLayout.right} data={idleRuntimeData} />
                    </motion.div>
                  )}

                  {(camActive || micActive) && (
                    <motion.div
                      key="privacy-indicators"
                      layout
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={smoothSpring}
                      className="flex items-center gap-1.5 shrink-0 ml-0.5"
                    >
                      {camActive && (
                        <div
                          className="w-2 h-2 rounded-full bg-[#30d158] shadow-[0_0_8px_rgba(48,209,88,0.9)] animate-pulse shrink-0"
                          title={optLanguage === "id" ? "Kamera sedang digunakan" : "Camera in use"}
                        />
                      )}
                      {micActive && (
                        <div
                          className="w-2 h-2 rounded-full bg-[#ff9f0a] shadow-[0_0_8px_rgba(255,159,10,0.9)] animate-pulse shrink-0"
                          title={optLanguage === "id" ? "Mikrofon sedang digunakan" : "Microphone in use"}
                        />
                      )}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            {variant === "media" && (
              <motion.div
                key="media"
                onClick={() => {
                  goToTab("media_expanded", 0);
                }}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{
                  opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                  scale: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                }}
                className="absolute inset-0 flex items-center justify-between gap-2.5 px-3 cursor-pointer"
              >
                <div className="w-full flex items-center justify-between gap-2.5 overflow-hidden">
                  <div className={`${effectiveIdleSize === "compact" ? "w-[26px] h-[26px] rounded-[7px]" : "w-8 h-8 rounded-[9px]"} bg-neutral-800/80 border border-white/10 shadow-sm flex items-center justify-center shrink-0 overflow-hidden relative`}>
                    <MediaThumbnail media={media!} />
                  </div>
                  <div className="flex flex-col justify-center overflow-hidden whitespace-nowrap flex-1 min-w-0">
                    <ScrollingText
                      text={media!.title}
                      className={`${
                        optFontSize === "small"
                          ? "text-[12px]"
                          : optFontSize === "large"
                          ? "text-[14.5px]"
                          : "text-[13px]"
                      } font-semibold tracking-tight leading-[1.2] translate-y-[3.5px] ${
                        isLightMode ? "text-[#1d1d1f]" : "text-white"
                      }`}
                    />
                    <ScrollingText
                      text={media!.artist}
                      className={`${
                        optFontSize === "small"
                          ? "text-[9.5px]"
                          : optFontSize === "large"
                          ? "text-[11.5px]"
                          : "text-[10.5px]"
                      } font-medium leading-[1.2] mt-[1px] ${
                        isLightMode ? "text-neutral-500" : "text-white/55"
                      }`}
                    />
                  </div>
                  <div className="flex items-center shrink-0">
                    <AudioVisualizer isPlaying={isPlaying} onToggle={() => handleMediaControl("toggle")} optAccent={optAccent} />
                  </div>
                </div>
              </motion.div>
            )}

            {variant === "lyrics_idle" && (
              <motion.div
                key="lyrics_idle"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{
                  opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                  scale: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                }}
                className="absolute inset-0 flex items-center justify-between cursor-pointer"
              >
                <IdleLyrics
                  lyricsData={lyricsData}
                  currentTime={mediaProgress.position}
                  isPlaying={isPlaying}
                  songTitle={media?.title}
                  artist={media?.artist}
                  media={media}
                  optAccent={optAccent}
                  optFontSize={optFontSize}
                  optIdleSize={effectiveIdleSize}
                  isLoading={isLyricsLoading}
                  onActiveLineChange={handleActiveIdleLyricChange}
                  onTogglePlay={() => handleMediaControl("toggle")}
                  onClick={() => {
                    goToTab("media_expanded", 0);
                  }}
                />
              </motion.div>
            )}

            {isExpandedPanel && (
              <motion.div
                key="expanded_panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1, ease: "easeIn" } }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className={`absolute inset-x-0 ${
                  isTopPos ? "top-0" : isBot ? "bottom-0" : "inset-y-0 items-center"
                } flex ${
                  isLeftPos ? "justify-start" : isRightPos ? "justify-end" : "justify-center"
                } pointer-events-none`}
              >
                <motion.div
                  style={{
                    width: lastExpandedSizeRef.current.width,
                    height: lastExpandedSizeRef.current.height,
                  }}
                  initial={{
                    scale: 0.90,
                    x: isLeftPos ? -12 : isRightPos ? 12 : 0,
                    y: isSideCenter ? 0 : isBot ? 12 : -12,
                  }}
                  animate={{
                    scale: 1,
                    x: 0,
                    y: 0,
                    transitionEnd: { transform: "none" },
                  }}
                  exit={{ opacity: 0, transition: { duration: 0.1, ease: "easeIn" } }}
                  transition={{
                    scale: smoothSpring,
                    x: smoothSpring,
                    y: smoothSpring,
                  }}
                  className={`flex flex-col overflow-hidden pointer-events-auto shrink-0 gpu-accelerated ${
                    optPosition === "top-left"
                      ? "origin-top-left"
                      : optPosition === "top-right"
                      ? "origin-top-right"
                      : optPosition === "left"
                      ? "origin-left"
                      : optPosition === "right"
                      ? "origin-right"
                      : optPosition === "bottom-left"
                      ? "origin-bottom-left"
                      : optPosition === "bottom-right"
                      ? "origin-bottom-right"
                      : isBot
                      ? "origin-bottom"
                      : "origin-top"
                  }`}
                >
                  <PanelFrame
                    title={panelTitle}
                    hasPrev={currentTab === "settings" || isSubPage ? true : currentTabIndex > 0}
                    hasNext={currentTab === "settings" || isSubPage ? false : currentTabIndex < availableTabs.length - 1}
                    onPrev={
                      currentTab === "settings"
                        ? handleToggleSettings
                        : currentTab === "notif_center"
                        ? handleToggleNotifications
                        : isSubPage
                        ? () => goToTab("quick_control", -1)
                        : handlePrevTab
                    }
                    onNext={handleNextTab}
                    prevTooltip={currentTab === "settings" || isSubPage ? t("nav_back") : t("nav_prev")}
                    nextTooltip={t("nav_next")}
                    onToggleSettings={isSubPage ? undefined : handleToggleSettings}
                    isSettingsActive={currentTab === "settings"}
                    onToggleNotifications={handleToggleNotifications}
                    isNotificationsActive={currentTab === "notif_center"}
                    unreadNotificationsCount={unreadNotifCount}
                    hideTitleBar={currentTab === "mini_note" && isNoteEditing}
                    totalPages={!tabsPrefs.showPageDots || isSubPage || (currentTab === "mini_note" && isNoteEditing) ? 0 : availableTabs.length}
                    currentPageIndex={isSubPage ? -1 : currentTabIndex}
                    onSelectPage={handleSelectTab}
                    hideDotsBg={false}
                    isMusicPage={currentTab === "media_expanded"}
                    tabs={availableTabs}
                    optLanguage={optLanguage}
                    disableSwipe={isSubPage}
                    battery={battery}
                    time={time}
                    weather={weather}
                    camActive={camActive}
                    micActive={micActive}
                    isLightMode={isLightMode}
                    optAnimSpeed={optAnimSpeed}
                    themeMode={activeEffectiveThemeMode}
                  >
                    <div className="relative w-full h-full min-w-0 overflow-hidden">
                      <AnimatePresence mode="wait" custom={slideDirection} initial={false}>
                        {currentTab === "quick_control" && (
                          <motion.div
                            key="quick_control"
                            custom={slideDirection}
                            variants={tabVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 w-full h-full flex flex-col min-w-0 gpu-accelerated overflow-hidden"
                          >
                            <React.Suspense fallback={null}>
                              <ControlCenterPanel
                                slideDirection={slideDirection}
                                displayLevel={displayLevel}
                                onSetDisplayLevel={setDisplayLevel}
                                brightnessMode={brightnessMode}
                                onSetBrightnessMode={setBrightnessMode}
                                soundLevel={soundLevel}
                                onSetSoundLevel={setSoundLevel}
                                wifiName={wifiName}
                                networkPing={networkPing}
                                btName={btName}
                                isHotspotOn={isHotspotOn}
                                onToggleHotspot={handleToggleHotspot}
                                focusMode={focusMode}
                                onSelectFocusMode={selectFocusMode}
                                focusModeOptions={focusModeOptions}
                                stashedFilesCount={stashedFiles.length}
                                onGoToTab={goToTab}
                                onClose={() => {
                                  setIsQuickControl(false);
                                  setControlCenterSubmenu(null);
                                }}
                                onSubmenuChange={setControlCenterSubmenu}
                                isLightMode={isLightMode}
                              />
                            </React.Suspense>
                          </motion.div>
                        )}

                        {currentTab === "clipboard" && (
                          <motion.div
                            key="clipboard"
                            custom={slideDirection}
                            variants={tabVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 w-full h-full flex flex-col min-w-0 gpu-accelerated overflow-hidden"
                          >
                            <React.Suspense fallback={null}>
                              <ClipboardPanel
                                items={clipboardHistory}
                                onCopyItem={(item) => {
                                  if (item.type === "image" && item.imagePath) {
                                    invoke("copy_image_to_clipboard", { path: item.imagePath }).catch(console.error);
                                  } else {
                                    writeText(item.text).catch(console.error);
                                    addClipboardItem(item.text);
                                  }
                                }}
                                onCopyText={(text) => {
                                  writeText(text).catch(console.error);
                                  addClipboardItem(text);
                                }}
                                onTogglePinItem={togglePinClipboardItem}
                                onUpdateItem={updateClipboardItem}
                                onDeleteItem={deleteClipboardItem}
                                onClearAll={clearAllClipboard}
                              />
                            </React.Suspense>
                          </motion.div>
                        )}

                        {currentTab === "todo" && (
                          <motion.div
                            key="todo"
                            custom={slideDirection}
                            variants={tabVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 w-full h-full flex flex-col min-w-0 gpu-accelerated overflow-hidden"
                          >
                            <React.Suspense fallback={null}>
                              <TodoListPanel
                                items={todoItems}
                                optLanguage={optLanguage}
                                isLightMode={isLightMode}
                                onAddItem={addTodoItem}
                                onToggleItem={toggleTodoItem}
                                onDeleteItem={deleteTodoItem}
                                onUpdateItem={updateTodoItem}
                                onUpdateDeadline={updateTodoDeadline}
                                onStartPomodoroForTask={(task) => {
                                  pomodoro.startFocusOnTask(task.id);
                                  goToTab("pomodoro", 1);
                                }}
                                onClearCompleted={clearCompletedTodos}
                                onClearAll={clearAllTodos}
                                onHeightChange={setTodoDynamicHeight}
                              />
                            </React.Suspense>
                          </motion.div>
                        )}

                        {currentTab === "pomodoro" && (
                          <motion.div
                            key="pomodoro"
                            custom={slideDirection}
                            variants={tabVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 w-full h-full flex flex-col min-w-0 gpu-accelerated overflow-hidden"
                          >
                            <React.Suspense fallback={null}>
                              <PomodoroPanel
                                mode={pomodoro.mode}
                                remainingSeconds={pomodoro.remainingSec}
                                totalSeconds={pomodoro.totalSec}
                                isRunning={pomodoro.isRunning}
                                currentCycleSession={pomodoro.cycleSession}
                                settings={pomodoro.settings}
                                dailyStats={pomodoro.dailyStats}
                                focusedTaskId={pomodoro.focusedTaskId}
                                todoItems={todoItems}
                                onSelectMode={pomodoro.handleSelectMode}
                                onToggleRun={pomodoro.handleToggleRunning}
                                onResetSession={pomodoro.handleReset}
                                onSkipSession={pomodoro.handleSkip}
                                onSelectFocusedTask={pomodoro.setFocusedTaskId}
                                onUpdateSettings={pomodoro.handleUpdateSettings}
                              />
                            </React.Suspense>
                          </motion.div>
                        )}

                        {currentTab === "drop_shelf" && (
                          <motion.div
                            key="drop_shelf"
                            custom={slideDirection}
                            variants={tabVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 w-full h-full flex flex-col min-w-0 gpu-accelerated overflow-hidden"
                          >
                            <React.Suspense fallback={null}>
                              <DropShelfPanel
                                files={stashedFiles}
                                onRemoveFile={removeStashedFile}
                                onRemoveFiles={removeStashedFiles}
                                onClearAll={clearAllStashedFiles}
                                onAddFiles={addStashedFiles}
                                onFileTransferred={removeStashedFile}
                                onFilesTransferred={removeStashedFiles}
                                onDragStateChange={(active, paths) => {
                                  isShelfDraggingRef.current = active;
                                  if (active) {
                                    if (paths) {
                                      outgoingShelfPathsRef.current = new Set(paths.map((p) => p.toLowerCase()));
                                    }
                                    handleCloseImmediate();
                                  } else {
                                    setTimeout(() => {
                                      outgoingShelfPathsRef.current.clear();
                                    }, 500);
                                  }
                                }}
                              />
                            </React.Suspense>
                          </motion.div>
                        )}

                        {currentTab === "sys_monitor" && (
                          <motion.div
                            key="sys_monitor"
                            custom={slideDirection}
                            variants={tabVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 w-full h-full flex flex-col min-w-0 gpu-accelerated overflow-hidden"
                          >
                            <React.Suspense fallback={null}>
                              <SystemMonitorPanel ping={networkPing} wifiSsid={wifiName} />
                            </React.Suspense>
                          </motion.div>
                        )}

                        {currentTab === "mini_note" && (
                          <motion.div
                            key="mini_note"
                            custom={slideDirection}
                            variants={tabVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 w-full h-full flex flex-col min-w-0 gpu-accelerated overflow-hidden"
                          >
                            <React.Suspense fallback={null}>
                              <MiniNotePanel optLanguage={optLanguage} onEditingChange={setIsNoteEditing} />
                            </React.Suspense>
                          </motion.div>
                        )}

                        {currentTab === "water_reminder" && (
                          <motion.div
                            key="water_reminder"
                            custom={slideDirection}
                            variants={tabVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 w-full h-full flex flex-col min-w-0 gpu-accelerated overflow-hidden"
                          >
                            <React.Suspense fallback={null}>
                              <WaterReminderPanel
                                optLanguage={optLanguage}
                                isLightMode={isLightMode}
                                onTriggerToast={(type, amount) => {
                                  setWaterToast({ type, amount });
                                }}
                              />
                            </React.Suspense>
                          </motion.div>
                        )}

                        {currentTab === "prayer_reminder" && (
                          <motion.div
                            key="prayer_reminder"
                            custom={slideDirection}
                            variants={tabVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 w-full h-full flex flex-col min-w-0 gpu-accelerated overflow-hidden"
                          >
                            <React.Suspense fallback={null}>
                              <PrayerReminderPanel
                                schedule={prayerSchedule}
                                onRefreshSchedule={refreshPrayerSchedule}
                                onTriggerToast={(toast) => {
                                  setPrayerToast(toast);
                                  playReminderSound();
                                }}
                                optLanguage={optLanguage}
                                isLightMode={isLightMode}
                              />
                            </React.Suspense>
                          </motion.div>
                        )}

                        {currentTab === "settings" && (
                          <motion.div
                            key="settings"
                            custom={slideDirection}
                            variants={tabVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 w-full h-full flex flex-col min-w-0 gpu-accelerated overflow-hidden"
                          >
                            <React.Suspense fallback={null}>
                              <SettingsPanel
                                slideDirection={slideDirection}
                                optLanguage={optLanguage}
                                onChangeLanguage={handleChangeLanguage}
                                optAutoCompact={optAutoCompact}
                                onToggleAutoCompact={async () => {
                                  const next = !optAutoCompact;
                                  setOptAutoCompact(next);
                                  if (store) await store.set("opt_auto_compact", next);
                                }}
                            isAutostart={isAutostart}
                            onToggleAutostart={async () => {
                              try {
                                const next = !isAutostart;
                                if (next) await enable();
                                else await disable();
                                setIsAutostart(next);
                                if (store) {
                                  await store.set("autostart_initialized", true);
                                  await store.set("opt_autostart", next);
                                }
                              } catch {}
                            }}
                            showGreeting={showGreeting}
                            onToggleGreeting={async () => {
                              const next = !showGreeting;
                              setShowGreeting(next);
                              try {
                                localStorage.setItem("island_show_greeting", String(next));
                              } catch {}
                              if (store) await store.set("show_greeting", next);
                              if (next) {
                                setTimeout(() => triggerGreeting(), 150);
                              }
                            }}
                            greetingNameMode={greetingNameMode}
                            onChangeGreetingNameMode={async (mode) => {
                              setGreetingNameMode(mode);
                              try {
                                localStorage.setItem("island_greeting_name_mode", mode);
                              } catch {}
                              if (store) await store.set("greeting_name_mode", mode);
                            }}
                            customGreetingName={customGreetingName}
                            onChangeCustomGreetingName={async (name) => {
                              const cleanName = (name && name !== "undefined" && name !== "null") ? name : "";
                              setCustomGreetingName(cleanName);
                              try {
                                if (cleanName) {
                                  localStorage.setItem("island_custom_greeting_name", cleanName);
                                } else {
                                  localStorage.removeItem("island_custom_greeting_name");
                                }
                              } catch {}
                              if (store) await store.set("custom_greeting_name", cleanName);
                            }}
                            onTestGreeting={() => {
                              triggerGreeting();
                            }}
                            optNotifTime={optNotifTime}
                            onChangeNotifTime={async (sec) => {
                              setOptNotifTime(sec);
                              if (store) await store.set("opt_notif_time", sec);
                            }}
                            optNotifSound={optNotifSound}
                            onChangeNotifSound={async (soundId) => {
                              setOptNotifSound(soundId);
                              setSavedNotifSound(soundId);
                              if (store) await store.set("opt_notif_sound", soundId);
                            }}
                            onTestNotification={() => {
                              handleCloseImmediate();
                              window.setTimeout(() => {
                                const isId = getLanguage() === "id";
                                const samples: NotifPayload[] = isId
                                  ? [
                                      {
                                        title: "Dukung Pengembang · Gili",
                                        body: "Jangan lupa support dev yaa! Traktir kopi biar makin semangat update fitur keren ☕",
                                        subtitle: "Traktir Dev Kopi ☕",
                                        headline: "Suka pakai Gili Island?",
                                        secondaryText: "Dukungan dan secangkir kopi darimu sangat berarti untuk kelanjutan projek ini! ❤️",
                                        icon: "coffee",
                                      },
                                      {
                                        title: "Support Developer · Gili",
                                        body: "Yuk dukung dev dengan traktir secangkir kopi! Bikin coding malam-malam makin kenceng 🚀",
                                        subtitle: "Beliin Dev Kopi ☕",
                                        headline: "Traktir Dev Kopi",
                                        secondaryText: "Terima kasih banyak sudah menggunakan dan mendukung Gili Island!",
                                        icon: "coffee",
                                      },
                                      {
                                        title: "Traktir Kopi Dev ☕",
                                        body: "Hai! Kalau kamu suka Gili, jangan lupa traktir dev kopi ya. Bikin hari dev makin cerah ✨",
                                        subtitle: "Support Dev · Gili Island",
                                        headline: "Yuk Traktir Dev Kopi!",
                                        secondaryText: "Setiap cangkir kopi bikin dev makin rajin nambahin fitur dan perbaiki bug!",
                                        icon: "heart",
                                      },
                                    ]
                                  : [
                                      {
                                        title: "Support Developer · Gili",
                                        body: "Don't forget to support the dev! Buy a coffee to keep awesome new updates coming ☕",
                                        subtitle: "Buy Dev a Coffee ☕",
                                        headline: "Enjoying Gili Island?",
                                        secondaryText: "Your support and a cup of coffee mean a lot to keep this project going! ❤️",
                                        icon: "coffee",
                                      },
                                      {
                                        title: "Support Developer · Gili",
                                        body: "Support the dev with a cup of coffee! Keeps late-night coding sessions fueled 🚀",
                                        subtitle: "Buy Dev a Coffee ☕",
                                        headline: "Treat Dev to Coffee",
                                        secondaryText: "Thank you so much for using and supporting Gili Island!",
                                        icon: "coffee",
                                      },
                                      {
                                        title: "Treat Dev to Coffee ☕",
                                        body: "Hey! If you enjoy Gili, consider treating the dev to coffee. It truly brightens my day ✨",
                                        subtitle: "Support Dev · Gili Island",
                                        headline: "Buy Dev a Coffee!",
                                        secondaryText: "Every cup of coffee helps fuel new features and swift bug fixes!",
                                        icon: "heart",
                                      },
                                    ];
                                const randomSample = samples[Math.floor(Math.random() * samples.length)];
                                showNotif(randomSample);
                              }, 400);
                            }}
                            optCloseDelay={optCloseDelay}
                            onChangeCloseDelay={async (sec) => {
                              optCloseDelayRef.current = sec;
                              setOptCloseDelay(sec);
                              try {
                                localStorage.setItem("island_close_delay", String(sec));
                              } catch {}
                              if (store) {
                                await store.set("opt_close_delay", sec);
                                await store.save();
                              }
                            }}
                            shortcuts={shortcuts}
                            shortcutsEnabled={shortcutsEnabled}
                            shortcutStatuses={shortcutStatuses}
                            onUpdateShortcut={handleUpdateShortcut}
                            onResetShortcut={handleResetShortcut}
                            onToggleShortcutsEnabled={handleToggleShortcutsEnabled}
                            optTheme={optTheme}
                            onChangeTheme={async (theme) => {
                              setOptTheme(theme);
                              try {
                                localStorage.setItem("island_theme", theme);
                              } catch {}
                              if (store) await store.set("opt_theme", theme);
                            }}
                            idleLayout={idleLayout}
                            onChangeIdleLayout={async (nextLayout) => {
                              setIdleLayout(nextLayout);
                              try {
                                localStorage.setItem("island_idle_layout", JSON.stringify(nextLayout));
                              } catch {}
                              if (store) await store.set("opt_idle_layout", nextLayout);
                            }}
                            idleRuntimeData={idleRuntimeData}
                            optIdleSize={optIdleSize}
                            onChangeIdleSize={async (size) => {
                              setOptIdleSize(size);
                              if (store) await store.set("opt_idle_size", size);
                            }}
                            optTabSize={optTabSize}
                            onChangeTabSize={async (size) => {
                              setOptTabSize(size);
                              if (store) await store.set("opt_tab_size", size);
                            }}
                            optFontSize={optFontSize}
                            onChangeFontSize={async (size) => {
                              setOptFontSize(size);
                              if (store) await store.set("opt_font_size", size);
                            }}
                            notchShape={notchShape}
                            onChangeNotchShape={handleChangeNotchShape}
                            islandTopOffset={islandTopOffset}
                            onChangeIslandTopOffset={handleChangeIslandTopOffset}
                            isLightMode={isLightMode}
                            optEars={optEars}
                            onToggleEars={async () => {
                              if (notchShape === "island") return;
                              const next = !optEars;
                              setOptEars(next);
                              if (store) await store.set("opt_ears", next);
                            }}
                            optPosition={optPosition}
                            onChangePosition={async (pos) => {
                              setOptPosition(pos);
                              try { localStorage.setItem("island_position", pos); } catch {}
                              if (store) {
                                try {
                                  await store.set("opt_position", pos);
                                  await store.save();
                                } catch {}
                              }
                              invoke("set_window_position", {
                                isBottom: isBottomNotchPosition(pos),
                                position: pos,
                                topOffset: islandTopOffset,
                                isIsland: notchShape === "island",
                                targetMonitor: optTargetMonitorRef.current,
                              }).catch(console.error);
                            }}
                            optOpacity={optOpacity}
                            onChangeOpacity={async (val) => {
                              setOptOpacity(val);
                              try { localStorage.setItem("island_opacity", String(val)); } catch {}
                              if (store) {
                                try {
                                  await store.set("opt_opacity", val);
                                  await store.save();
                                } catch {}
                              }
                              invoke("broadcast_settings_sync", {
                                payload: { type: "setting_key", key: "opt_opacity", value: val },
                              }).catch(() => {});
                            }}
                            optBlur={optBlur}
                            onChangeBlur={async (val) => {
                              setOptBlur(val);
                              try { localStorage.setItem("island_blur", String(val)); } catch {}
                              if (store) {
                                try {
                                  await store.set("opt_blur", val);
                                  await store.save();
                                } catch {}
                              }
                              invoke("broadcast_settings_sync", {
                                payload: { type: "setting_key", key: "opt_blur", value: val },
                              }).catch(() => {});
                            }}
                            optAnimSpeed={optAnimSpeed}
                            onChangeAnimSpeed={async (speed) => {
                              setOptAnimSpeed(speed);
                              if (store) await store.set("opt_anim_speed", speed);
                            }}
                            optVolume={optVolume}
                            onToggleVolume={async () => {
                              const next = !optVolume;
                              setOptVolume(next);
                              if (store) await store.set("opt_volume", next);
                            }}
                            optClipboard={optClipboard}
                            onToggleClipboard={async () => {
                              const next = !optClipboard;
                              setOptClipboard(next);
                              if (store) await store.set("opt_clipboard", next);
                            }}
                            optMedia={optMedia}
                            onToggleMedia={async () => {
                              const next = !optMedia;
                              setOptMedia(next);
                              if (store) await store.set("opt_media", next);
                            }}
                            optSoundFx={optSoundFx}
                            onToggleSoundFx={() => {
                              const next = !optSoundFx;
                              setOptSoundFx(next);
                              setSoundEffectsEnabled(next);
                            }}
                            onClose={() => setIsSettings(false)}
                              />
                            </React.Suspense>
                          </motion.div>
                        )}

                        {currentTab === "volume_mixer" && (
                          <motion.div
                            key="volume_mixer"
                            custom={slideDirection}
                            variants={tabVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 w-full h-full flex flex-col min-w-0 gpu-accelerated overflow-hidden"
                          >
                            <React.Suspense fallback={null}>
                              <VolumeMixerPanel
                                slideDirection={slideDirection}
                                soundLevel={soundLevel}
                                onSetSoundLevel={setSoundLevel}
                                audioSessions={audioSessions}
                                onUpdateAudioSessions={setAudioSessions}
                              />
                            </React.Suspense>
                          </motion.div>
                        )}

                        {currentTab === "notif_center" && (
                          <motion.div
                            key="notif_center"
                            custom={slideDirection}
                            variants={tabVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 w-full h-full flex flex-col min-w-0 gpu-accelerated overflow-hidden"
                          >
                            <React.Suspense fallback={null}>
                              <NotificationCenterPanel
                                notifications={notificationsHistory}
                                onUpdateNotifications={setNotificationsHistory}
                                isDndActive={focusMode === "DND"}
                                isLightMode={isLightMode}
                                onDndChange={(enabled) => {
                                  selectFocusMode(enabled ? "DND" : "Normal");
                                }}
                                onGoToTab={(tab) => goToTab(tab as any)}
                              />
                            </React.Suspense>
                          </motion.div>
                        )}

                        {currentTab === "media_expanded" && (
                          <motion.div
                            key="media_expanded"
                            custom={slideDirection}
                            variants={tabVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 w-full h-full flex flex-col min-w-0 gpu-accelerated overflow-hidden"
                          >
                            <React.Suspense fallback={null}>
                              <MediaExpandedPanel
                                tabWidth={tabWidth}
                                slideDirection={slideDirection}
                                media={media || (lastMediaPayloadRef.current?.title ? lastMediaPayloadRef.current : null)}
                                isPlaying={Boolean(media && isPlaying)}
                                onMediaControl={handleMediaControl}
                                optAccent={optAccent}
                                showLyrics={showLyrics}
                                onToggleLyrics={() => {
                                  setShowLyrics((prev) => {
                                    const next = !prev;
                                    try {
                                      localStorage.setItem("island_show_lyrics", String(next));
                                    } catch {}
                                    return next;
                                  });
                                }}
                                onRefreshLyrics={handleRefreshLyrics}
                                currentLyricsProvider={lyricsProvider}
                                onChangeLyricsProvider={handleChangeLyricsProvider}
                                lyricsData={lyricsData}
                                isLyricsLoading={isLyricsLoading}
                                mediaProgress={mediaProgress}
                                onSetMediaProgress={setMediaProgress}
                                isSeeking={isSeeking}
                                onSetIsSeeking={setIsSeeking}
                                seekValue={seekValue}
                                onSetSeekValue={setSeekValue}
                                soundLevel={soundLevel}
                                onSetSoundLevel={setSoundLevel}
                                isAdjustingVolumeRef={isAdjustingVolumeRef}
                                queueHistory={queueHistory}
                              />
                            </React.Suspense>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </PanelFrame>
                </motion.div>
              </motion.div>
            )}

            {variant === "notif_greeting" && notif && (
              <GreetingNotification
                key="notif_greeting"
                notif={notif}
                isLightMode={isLightMode}
                onClick={handleNotifClick}
                isBot={isBot}
                greetingStage={greetingStage}
              />
            )}

            {variant === "notif_volume" && notif && (
              <UniformHudPill
                key="notif_volume"
                notif={notif}
                isLightMode={isLightMode}
                isBot={isBot}
                onClick={handleNotifClick}
              />
            )}

            {(variant === "notif" || variant === "notif_small" || variant === "notif_medium" || variant === "notif_clipboard") && notif && (
              <motion.div
                key="notif"
                onClick={handleNotifClick}
                initial={{ opacity: 0, y: isBot ? -8 : 8, scale: 0.92, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none", transform: "none" } }}
                exit={{ opacity: 0, transition: { duration: 0.1, ease: "easeIn" } }}
                transition={iosSpring.snappy}
                className="absolute inset-0 flex items-center gap-2.5 px-3.5 cursor-pointer justify-center select-none"
              >
                <div className="shrink-0 transition-transform hover:scale-105 active:scale-95">
                  <NotifIcon type={notif.icon} appName={notif.appName} />
                </div>
                {(variant === "notif_small" || variant === "notif_medium" || variant === "notif_clipboard") ? (
                  <div className="flex items-center min-w-0 overflow-hidden">
                    <p className="text-[13px] font-semibold tracking-tight leading-tight truncate">
                      <span className={isLightMode ? 'text-[#1d1d1f]' : 'text-white'}>
                        {notif.title}
                      </span>
                      {notif.body && (
                        <span className={`ml-1.5 tabular-nums ${isLightMode ? 'text-emerald-700' : 'text-ios-green'}`}>
                          {notif.body}
                        </span>
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col justify-center overflow-hidden min-w-0 flex-1">
                    <ScrollingText text={notif.title} className={`text-[13px] font-semibold tracking-tight leading-tight w-full ${isLightMode ? 'text-[#1d1d1f]' : 'text-white'}`} />
                    {notif.body && (
                      <AnimatePresence mode="popLayout">
                        <motion.div 
                          key={notif.body}
                          initial={{ opacity: 0, y: 6, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.96 }}
                          transition={iosSpring.smooth}
                          className="min-w-0 flex items-center w-full"
                        >
                          {isMultilineBody ? (
                            <p className={`text-[12px] leading-snug tracking-tight line-clamp-2 break-words font-medium ${isLightMode ? 'text-neutral-600' : 'text-ios-secondary'}`}>
                              {notif.body}
                            </p>
                          ) : (
                            <ScrollingText text={notif.body} className={`text-[12.5px] leading-tight tracking-tight ${isLightMode ? 'text-neutral-500 font-medium' : 'text-ios-secondary font-medium'}`} />
                          )}
                        </motion.div>
                      </AnimatePresence>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
