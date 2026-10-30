import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { load, Store } from "@tauri-apps/plugin-store";
import { Minus, X, Clock, Volume2, Send } from "lucide-react";

import { Language, getLanguage, setLanguage, t } from "../../services/i18n";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  ShortcutActionId,
  ShortcutStatus,
} from "../../services/shortcuts";
import {
  IdleLayoutConfig,
  IdleRuntimeData,
  getSavedIdleLayout,
  parseIdleLayout,
} from "../ui/IdleLayoutSetting";
import {
  NotchTabsPreferences,
  loadTabsPreferences,
  saveTabsPreferences,
  normalizeTabsPreferences,
} from "../../services/tabConfigService";
import {
  isSoundEffectsEnabled,
  setSoundEffectsEnabled,
  getSavedNotifSound,
  setSavedNotifSound,
} from "../../services/soundService";
import {
  checkForAppUpdate,
  downloadAndInstallAppUpdate,
  UpdateInfo,
  UpdateStatus,
} from "../../services/updateService";
import { clearAllLyricsCache } from "../../services/lyricsService";
import { clearArtworkCache } from "../../services/artworkService";
import { clearShelfPreviewCache } from "../../services/shelfService";
import { clearWeatherCache, getCachedWeather } from "../../services/weatherService";

import {
  SettingsSidebar,
  SettingsWindowSection,
  SIDEBAR_SECTIONS,
} from "./SettingsSidebar";
import { TabsManagerView } from "./TabsManagerView";
import { SupportView } from "./SupportView";
import { AboutView } from "./AboutView";
import { AppearanceTab } from "../ui/settings/AppearanceTab";
import { IdleTab } from "../ui/settings/IdleTab";
import { GeneralTab } from "../ui/settings/GeneralTab";
import { ModulesTab } from "../ui/settings/ModulesTab";
import { KeyboardShortcutsCard } from "../ui/settings/KeyboardShortcutsCard";
import { AdvancedTab } from "../ui/settings/AdvancedTab";
import { SearchResults } from "../ui/settings/SearchResults";
import { SettingRow } from "../ui/settings/SettingRow";
import { IosSegmentedControl } from "../ios/IosSegmentedControl";
import { NotifSoundPicker } from "../ui/settings/NotifSoundPicker";
import { WindowsBannerRow } from "../ui/settings/WindowsBannerRow";

const sectionVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.16, ease: "easeOut" as const },
  },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

export const SettingsWindowApp: React.FC = () => {
  const initialSection = useMemo<SettingsWindowSection>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sec = params.get("section") as SettingsWindowSection | null;
      if (sec && SIDEBAR_SECTIONS.some((s) => s.id === sec)) {
        return sec;
      }
    } catch {}
    return "about";
  }, []);

  const [activeSection, setActiveSection] = useState<SettingsWindowSection>(initialSection);
  const [searchQuery, setSearchQuery] = useState("");
  const [store, setStore] = useState<Store | null>(null);
  const [currentAppVersion, setCurrentAppVersion] = useState("4.2.2");

  // Preferences State
  const [tabsPrefs, setTabsPrefs] = useState<NotchTabsPreferences>(() => loadTabsPreferences());
  const [optLanguage, setOptLanguage] = useState<Language>(() => getLanguage());
  const [isAutostart, setIsAutostart] = useState(false);
  const [showGreeting, setShowGreeting] = useState<boolean>(() => {
    try {
      return localStorage.getItem("island_show_greeting") !== "false";
    } catch {
      return true;
    }
  });
  const [greetingNameMode, setGreetingNameMode] = useState<"auto" | "custom">(() => {
    try {
      return localStorage.getItem("island_greeting_name_mode") === "custom" ? "custom" : "auto";
    } catch {
      return "auto";
    }
  });
  const [customGreetingName, setCustomGreetingName] = useState<string>(() => {
    try {
      const v = localStorage.getItem("island_custom_greeting_name");
      return v && v !== "undefined" && v !== "null" ? v : "";
    } catch {
      return "";
    }
  });
  const [optAutoCompact, setOptAutoCompact] = useState(true);
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
  const [optNotifTime, setOptNotifTime] = useState<number>(3);
  const [optNotifSound, setOptNotifSound] = useState<string>(() => getSavedNotifSound());

  // Appearance State
  const [optTheme, setOptTheme] = useState<"dark" | "light" | "auto">(() => {
    try {
      const tVal = localStorage.getItem("island_theme");
      if (tVal === "dark" || tVal === "light" || tVal === "auto") return tVal;
    } catch {}
    return "dark";
  });
  const [systemPrefersLight, setSystemPrefersLight] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: light)").matches;
    }
    return false;
  });
  const [notchShape, setNotchShape] = useState<"notch" | "island">(() => {
    try {
      return localStorage.getItem("island_notch_shape") === "island" ? "island" : "notch";
    } catch {
      return "notch";
    }
  });
  const [islandTopOffset, setIslandTopOffset] = useState<number>(() => {
    try {
      const n = Number(localStorage.getItem("island_top_offset"));
      if (n >= 6 && n <= 16) return n;
    } catch {}
    return 10;
  });
  const [optPosition, setOptPosition] = useState<"top" | "bottom">(() => {
    try {
      return localStorage.getItem("island_position") === "bottom" ? "bottom" : "top";
    } catch {
      return "top";
    }
  });
  const [optFontSize, setOptFontSize] = useState<"small" | "default" | "large">("default");
  const [optIdleSize, setOptIdleSize] = useState<"compact" | "default" | "large">("default");
  const [optTabSize, setOptTabSize] = useState<"compact" | "default" | "large">("default");
  const [optEars, setOptEars] = useState(true);
  const [optOpacity, setOptOpacity] = useState(1.0);
  const [optAnimSpeed, setOptAnimSpeed] = useState<"snappy" | "smooth" | "bouncy">("smooth");

  // Idle Layout State
  const [idleLayout, setIdleLayout] = useState<IdleLayoutConfig>(() => getSavedIdleLayout());
  const [battery, setBattery] = useState<{ is_charging: boolean; percent: number } | null>({
    is_charging: true,
    percent: 88,
  });

  // Modules State
  const [optVolume, setOptVolume] = useState(true);
  const [optClipboard, setOptClipboard] = useState(true);
  const [optOcr, setOptOcr] = useState(false);
  const [optMedia, setOptMedia] = useState(true);
  const [optSoundFx, setOptSoundFx] = useState<boolean>(() => isSoundEffectsEnabled());

  // Shortcuts State
  const [shortcuts, setShortcuts] = useState<Record<ShortcutActionId, string | null>>(() => {
    try {
      const raw = localStorage.getItem("island_shortcuts");
      if (raw) return { ...DEFAULT_SHORTCUTS, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULT_SHORTCUTS };
  });
  const [shortcutsEnabled, setShortcutsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("island_shortcuts_enabled") !== "false";
    } catch {
      return true;
    }
  });
  const [shortcutStatuses, setShortcutStatuses] = useState<Record<ShortcutActionId, ShortcutStatus>>(() => {
    const init = {} as Record<ShortcutActionId, ShortcutStatus>;
    for (const action of SHORTCUT_ACTIONS) {
      init[action.id] = "ok";
    }
    return init;
  });

  // System / Update State
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [clearTempStatus, setClearTempStatus] = useState<"idle" | "cleaning" | "done" | "error">("idle");
  const [clearedResult, setClearedResult] = useState<{
    freed_bytes: number;
    deleted_count: number;
    freed_formatted: string;
  } | null>(null);

  const isLightMode = optTheme === "light" || (optTheme === "auto" && systemPrefersLight);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("light", isLightMode);
    }
  }, [isLightMode]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const listener = (e: MediaQueryListEvent) => setSystemPrefersLight(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  const broadcastSetting = useCallback((key: string, value: unknown) => {
    invoke("broadcast_settings_sync", {
      payload: { type: "setting_key", key, value },
    }).catch(() => {});
  }, []);

  // Load persisted store values on mount
  useEffect(() => {
    invoke<string | null>("take_pending_settings_section")
      .then((sec) => {
        if (sec && SIDEBAR_SECTIONS.some((s) => s.id === sec)) {
          setActiveSection(sec as SettingsWindowSection);
        }
      })
      .catch(() => {});
    getVersion().then(setCurrentAppVersion).catch(() => {});
    checkForAppUpdate()
      .then((info) => {
        setUpdateInfo(info);
        if (info.available) {
          setUpdateStatus("available");
        }
      })
      .catch(() => {});
    invoke<[boolean, number] | null>("get_battery_status")
      .then((res) => {
        if (res && res[1] <= 100) {
          setBattery({ is_charging: res[0], percent: res[1] });
        }
      })
      .catch(() => {});

    const initStore = async () => {
      try {
        const s = await load("settings.json", { autoSave: true });
        setStore(s);

        const savedTabs = await s.get("opt_tabs_preferences");
        if (savedTabs) {
          setTabsPrefs(normalizeTabsPreferences(savedTabs));
        }

        const greet = await s.get("show_greeting");
        if (typeof greet === "boolean") setShowGreeting(greet);

        const nameMode = await s.get("greeting_name_mode");
        if (nameMode === "custom" || nameMode === "auto") setGreetingNameMode(nameMode);

        const customName = await s.get("custom_greeting_name");
        if (typeof customName === "string" && customName !== "undefined" && customName !== "null") {
          setCustomGreetingName(customName);
        }

        const v = await s.get("opt_volume");
        if (typeof v === "boolean") setOptVolume(v);
        const c = await s.get("opt_clipboard");
        if (typeof c === "boolean") setOptClipboard(c);
        const ocr = await s.get("opt_ocr");
        if (typeof ocr === "boolean") setOptOcr(ocr);
        const m = await s.get("opt_media");
        if (typeof m === "boolean") setOptMedia(m);

        const p = await s.get("opt_position");
        if (p === "top" || p === "bottom") setOptPosition(p);

        const o = await s.get("opt_opacity");
        if (o !== null && o !== undefined) setOptOpacity(Number(o));

        const a = await s.get("opt_anim_speed");
        if (a === "snappy" || a === "smooth" || a === "bouncy") setOptAnimSpeed(a);

        const nt = await s.get("opt_notif_time");
        if (typeof nt === "number") setOptNotifTime(nt);

        const ns = await s.get("opt_notif_sound");
        if (typeof ns === "string") setOptNotifSound(ns);

        const cd = await s.get("opt_close_delay");
        if (cd === 0 || cd === 1 || cd === 3 || cd === -1) setOptCloseDelay(cd);

        const shape = await s.get("notch_shape");
        if (shape === "notch" || shape === "island") setNotchShape(shape);

        const topOff = await s.get("island_top_offset");
        if (typeof topOff === "number" && topOff >= 6 && topOff <= 16) setIslandTopOffset(topOff);

        const ears = await s.get("opt_ears");
        if (typeof ears === "boolean") setOptEars(ears);

        const ac = await s.get("opt_auto_compact");
        if (typeof ac === "boolean") setOptAutoCompact(ac);

        const lang = await s.get("opt_language");
        if (lang === "en" || lang === "id") {
          setLanguage(lang, false);
          setOptLanguage(lang);
        }

        const th = await s.get("opt_theme");
        if (th === "dark" || th === "light" || th === "auto") setOptTheme(th);

        const savedLayout = await s.get("opt_idle_layout");
        if (savedLayout) setIdleLayout(parseIdleLayout(savedLayout));

        const isz = await s.get("opt_idle_size");
        if (isz === "compact" || isz === "default" || isz === "large") setOptIdleSize(isz);

        const tsz = await s.get("opt_tab_size");
        if (tsz === "compact" || tsz === "default" || tsz === "large") setOptTabSize(tsz);

        const fsz = await s.get("opt_font_size");
        if (fsz === "small" || fsz === "default" || fsz === "large") setOptFontSize(fsz);

        const savedShortcuts = await s.get("shortcuts");
        if (savedShortcuts && typeof savedShortcuts === "object") {
          setShortcuts({ ...DEFAULT_SHORTCUTS, ...(savedShortcuts as Record<ShortcutActionId, string | null>) });
        }

        const savedShortcutsEnabled = await s.get("shortcuts_enabled");
        if (typeof savedShortcutsEnabled === "boolean") setShortcutsEnabled(savedShortcutsEnabled);

        const auto = await isEnabled();
        setIsAutostart(auto);
      } catch (e) {
        console.error("Failed to load settings store in SettingsWindow:", e);
      }
    };
    initStore();

    const unlistenNav = listen<string>("settings-navigate", (event) => {
      const target = event.payload as SettingsWindowSection;
      if (SIDEBAR_SECTIONS.some((sec) => sec.id === target)) {
        setSearchQuery("");
        setActiveSection(target);
      }
    });

    const unlistenSync = listen<any>("gili-settings-sync", (event) => {
      const payload = event.payload;
      if (!payload || typeof payload !== "object") return;

      if (payload.type === "tabs_preferences" && payload.data) {
        setTabsPrefs(normalizeTabsPreferences(payload.data));
        return;
      }

      if (payload.type === "shortcut_statuses" && payload.statuses) {
        setShortcutStatuses(payload.statuses);
        return;
      }

      if (payload.type === "setting_key") {
        const { key, value } = payload;
        switch (key) {
          case "opt_language":
            setLanguage(value as Language, false);
            setOptLanguage(value as Language);
            break;
          case "opt_theme":
            setOptTheme(value);
            break;
          case "notch_shape":
            setNotchShape(value);
            break;
          case "island_top_offset":
            setIslandTopOffset(Number(value));
            break;
          case "opt_position":
            setOptPosition(value);
            break;
          case "opt_ears":
            setOptEars(Boolean(value));
            break;
          case "opt_opacity":
            setOptOpacity(Number(value));
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
          case "opt_close_delay":
            setOptCloseDelay(Number(value));
            break;
          case "opt_auto_compact":
            setOptAutoCompact(Boolean(value));
            break;
          case "opt_sound_fx":
            setOptSoundFx(Boolean(value));
            break;
          case "opt_idle_layout":
            setIdleLayout(parseIdleLayout(value));
            break;
          default:
            break;
        }
      }
    });

    return () => {
      unlistenNav.then((f) => f());
      unlistenSync.then((f) => f());
    };
  }, []);

  // Handlers with persistence + real-time cross-window sync
  const handleChangeTabsPrefs = async (next: NotchTabsPreferences) => {
    setTabsPrefs(next);
    await saveTabsPreferences(next, true);
  };

  const handleChangeLanguage = async (lang: Language) => {
    setLanguage(lang);
    setOptLanguage(lang);
    if (store) await store.set("opt_language", lang);
    broadcastSetting("opt_language", lang);
  };

  const handleToggleAutostart = async () => {
    try {
      const next = !isAutostart;
      if (next) await enable();
      else await disable();
      setIsAutostart(next);
      if (store) {
        await store.set("autostart_initialized", true);
        await store.set("opt_autostart", next);
      }
      broadcastSetting("opt_autostart", next);
    } catch {}
  };

  const handleToggleGreeting = async () => {
    const next = !showGreeting;
    setShowGreeting(next);
    try {
      localStorage.setItem("island_show_greeting", String(next));
    } catch {}
    if (store) await store.set("show_greeting", next);
    broadcastSetting("show_greeting", next);
    if (next) {
      invoke("trigger_notch_action", { action: "test_greeting" }).catch(() => {});
    }
  };

  const handleChangeGreetingNameMode = async (mode: "auto" | "custom") => {
    setGreetingNameMode(mode);
    try {
      localStorage.setItem("island_greeting_name_mode", mode);
    } catch {}
    if (store) await store.set("greeting_name_mode", mode);
    broadcastSetting("greeting_name_mode", mode);
  };

  const handleChangeCustomGreetingName = async (name: string) => {
    const clean = name && name !== "undefined" && name !== "null" ? name : "";
    setCustomGreetingName(clean);
    try {
      if (clean) localStorage.setItem("island_custom_greeting_name", clean);
      else localStorage.removeItem("island_custom_greeting_name");
    } catch {}
    if (store) await store.set("custom_greeting_name", clean);
    broadcastSetting("custom_greeting_name", clean);
  };

  const handleToggleAutoCompact = async () => {
    const next = !optAutoCompact;
    setOptAutoCompact(next);
    if (store) await store.set("opt_auto_compact", next);
    broadcastSetting("opt_auto_compact", next);
  };

  const handleChangeCloseDelay = async (sec: number) => {
    setOptCloseDelay(sec);
    try {
      localStorage.setItem("island_close_delay", String(sec));
    } catch {}
    if (store) {
      await store.set("opt_close_delay", sec);
      await store.save();
    }
    broadcastSetting("opt_close_delay", sec);
  };

  const handleChangeNotifTime = async (sec: number) => {
    setOptNotifTime(sec);
    if (store) await store.set("opt_notif_time", sec);
    broadcastSetting("opt_notif_time", sec);
  };

  const handleChangeNotifSound = async (soundId: string) => {
    setOptNotifSound(soundId);
    setSavedNotifSound(soundId);
    if (store) await store.set("opt_notif_sound", soundId);
    broadcastSetting("opt_notif_sound", soundId);
  };

  const handleChangeTheme = async (theme: "dark" | "light" | "auto") => {
    setOptTheme(theme);
    try {
      localStorage.setItem("island_theme", theme);
    } catch {}
    if (store) await store.set("opt_theme", theme);
    broadcastSetting("opt_theme", theme);
  };

  const handleChangeNotchShape = async (shape: "notch" | "island") => {
    setNotchShape(shape);
    try {
      localStorage.setItem("island_notch_shape", shape);
    } catch {}
    if (store) await store.set("notch_shape", shape);
    broadcastSetting("notch_shape", shape);
  };

  const handleChangeIslandTopOffset = async (offset: number) => {
    const clamped = Math.max(6, Math.min(16, Math.round(offset)));
    setIslandTopOffset(clamped);
    try {
      localStorage.setItem("island_top_offset", String(clamped));
    } catch {}
    if (store) await store.set("island_top_offset", clamped);
    broadcastSetting("island_top_offset", clamped);
  };

  const handleChangePosition = async (pos: "top" | "bottom") => {
    setOptPosition(pos);
    try {
      localStorage.setItem("island_position", pos);
    } catch {}
    if (store) {
      await store.set("opt_position", pos);
      await store.save();
    }
    broadcastSetting("opt_position", pos);
  };

  const handleToggleEars = async () => {
    if (notchShape === "island") return;
    const next = !optEars;
    setOptEars(next);
    if (store) await store.set("opt_ears", next);
    broadcastSetting("opt_ears", next);
  };

  const handleChangeOpacity = async (val: number) => {
    setOptOpacity(val);
    if (store) await store.set("opt_opacity", val);
    broadcastSetting("opt_opacity", val);
  };

  const handleChangeAnimSpeed = async (speed: "snappy" | "smooth" | "bouncy") => {
    setOptAnimSpeed(speed);
    if (store) await store.set("opt_anim_speed", speed);
    broadcastSetting("opt_anim_speed", speed);
  };

  const handleChangeIdleSize = async (size: "compact" | "default" | "large") => {
    setOptIdleSize(size);
    if (store) await store.set("opt_idle_size", size);
    broadcastSetting("opt_idle_size", size);
  };

  const handleChangeTabSize = async (size: "compact" | "default" | "large") => {
    setOptTabSize(size);
    if (store) await store.set("opt_tab_size", size);
    broadcastSetting("opt_tab_size", size);
  };

  const handleChangeFontSize = async (size: "small" | "default" | "large") => {
    setOptFontSize(size);
    if (store) await store.set("opt_font_size", size);
    broadcastSetting("opt_font_size", size);
  };

  const handleChangeIdleLayout = async (nextLayout: IdleLayoutConfig) => {
    setIdleLayout(nextLayout);
    try {
      localStorage.setItem("island_idle_layout", JSON.stringify(nextLayout));
    } catch {}
    if (store) await store.set("opt_idle_layout", nextLayout);
    broadcastSetting("opt_idle_layout", nextLayout);
  };

  const handleToggleVolume = async () => {
    const next = !optVolume;
    setOptVolume(next);
    if (store) await store.set("opt_volume", next);
    broadcastSetting("opt_volume", next);
  };

  const handleToggleClipboard = async () => {
    const next = !optClipboard;
    setOptClipboard(next);
    if (store) await store.set("opt_clipboard", next);
    broadcastSetting("opt_clipboard", next);
  };

  const handleToggleOcr = async () => {
    const next = !optOcr;
    setOptOcr(next);
    if (store) await store.set("opt_ocr", next);
    broadcastSetting("opt_ocr", next);
  };

  const handleToggleMedia = async () => {
    const next = !optMedia;
    setOptMedia(next);
    if (store) await store.set("opt_media", next);
    broadcastSetting("opt_media", next);
  };

  const handleToggleSoundFx = () => {
    const next = !optSoundFx;
    setOptSoundFx(next);
    setSoundEffectsEnabled(next);
    broadcastSetting("opt_sound_fx", next);
  };

  const handleUpdateShortcut = async (
    actionId: ShortcutActionId,
    newShortcut: string | null
  ): Promise<{ success: boolean; error?: string }> => {
    const updated = { ...shortcuts, [actionId]: newShortcut };
    setShortcuts(updated);
    try {
      localStorage.setItem("island_shortcuts", JSON.stringify(updated));
    } catch {}
    if (store) await store.set("shortcuts", updated);
    invoke("broadcast_settings_sync", {
      payload: { type: "shortcuts_update", actionId, newShortcut, shortcuts: updated, shortcutsEnabled },
    }).catch(() => {});
    return { success: true };
  };

  const handleResetShortcut = async (actionId: ShortcutActionId) => {
    const defaultKey = DEFAULT_SHORTCUTS[actionId];
    await handleUpdateShortcut(actionId, defaultKey);
  };

  const handleToggleShortcutsEnabled = async (enabled: boolean) => {
    setShortcutsEnabled(enabled);
    try {
      localStorage.setItem("island_shortcuts_enabled", String(enabled));
    } catch {}
    if (store) await store.set("shortcuts_enabled", enabled);
    invoke("broadcast_settings_sync", {
      payload: { type: "shortcuts_enabled", enabled, shortcuts },
    }).catch(() => {});
  };

  const handleClearTempFiles = async () => {
    if (clearTempStatus === "cleaning") return;
    setClearTempStatus("cleaning");
    try {
      clearAllLyricsCache();
      clearArtworkCache();
      clearShelfPreviewCache();
      clearWeatherCache();

      const res = await invoke<{ freed_bytes: number; deleted_count: number; freed_formatted: string }>(
        "clear_temp_files"
      );
      setClearedResult(res);
      setClearTempStatus("done");
      window.setTimeout(() => setClearTempStatus("idle"), 4500);
    } catch {
      setClearTempStatus("error");
      window.setTimeout(() => setClearTempStatus("idle"), 3500);
    }
  };

  const handleCheckUpdate = async () => {
    if (updateStatus === "checking" || updateStatus === "downloading" || updateStatus === "installing") return;
    setUpdateStatus("checking");
    try {
      const info = await checkForAppUpdate();
      setUpdateInfo(info);
      setUpdateStatus(info.available ? "available" : "up_to_date");
    } catch {
      setUpdateStatus("error");
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateInfo?.update) return;
    setUpdateStatus("downloading");
    setDownloadProgress(0);
    try {
      await downloadAndInstallAppUpdate(updateInfo.update, (percent) => {
        setDownloadProgress(percent);
        if (percent >= 100) setUpdateStatus("installing");
      });
    } catch {
      setUpdateStatus("error");
    }
  };

  const idleRuntimeData: IdleRuntimeData = useMemo(() => {
    const now = new Date();
    const locale = optLanguage === "id" ? "id-ID" : "en-US";
    return {
      battery,
      time: now,
      dateDisplay: now.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }),
      fullDateTitle: now.toLocaleDateString(locale, { dateStyle: "full" }),
      weather: getCachedWeather() || { temp: "28°C", code: 1, locationName: "Jakarta" },
      networkPing: 18,
      pendingTodosCount: 2,
      stashedFilesCount: 1,
      fps: 60,
      cpuUsage: 14,
      ramUsage: 48,
      ramUsedGb: 7.6,
      ramTotalGb: 16,
      netDownMbps: 12.4,
      netUpMbps: 3.2,
      focusMode: "Normal",
      optLanguage,
      isLightMode,
    };
  }, [battery, optLanguage, isLightMode]);

  const currentSectionMeta =
    SIDEBAR_SECTIONS.find((s) => s.id === activeSection) || SIDEBAR_SECTIONS[0];
  const isId = optLanguage === "id";

  return (
    <div
      className={`w-screen h-screen overflow-hidden flex flex-col select-none ${
        isLightMode
          ? "light bg-[#f5f5f7] text-[#1d1d1f]"
          : "bg-[#0c0c10] text-white"
      }`}
    >
      {/* Top Frameless Window Titlebar */}
      <header
        data-tauri-drag-region
        onDoubleClick={(e) => e.preventDefault()}
        className={`h-[44px] shrink-0 w-full flex items-center justify-between pl-4 pr-2.5 border-b ${
          isLightMode
            ? "bg-[#ebebef]/95 border-black/[0.08]"
            : "bg-[#141419]/95 border-white/[0.07]"
        }`}
      >
        {/* Left: Gili Logo + Window Title */}
        <div className="flex items-center gap-2.5 pointer-events-none">
          <img
            src="/logo/LOGO-GILI.png"
            alt="Gili"
            draggable={false}
            className="w-5 h-5 rounded-[5px] object-contain shrink-0"
          />
          <span className={`text-[13px] font-semibold tracking-tight ${isLightMode ? "text-neutral-800" : "text-zinc-100"}`}>
            {isId ? "Pengaturan Gili" : "Gili Settings"}
          </span>
        </div>

        {/* Right: Minimize & Close Buttons */}
        <div className="flex items-center gap-1 pointer-events-auto">
          <button
            type="button"
            onClick={() => getCurrentWindow().minimize()}
            title={isId ? "Minimalkan" : "Minimize"}
            className={`w-8 h-7 rounded-[8px] flex items-center justify-center transition-colors cursor-pointer ${
              isLightMode
                ? "text-neutral-600 hover:text-neutral-900 hover:bg-black/[0.07]"
                : "text-zinc-400 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            <Minus size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => getCurrentWindow().hide()}
            title={isId ? "Tutup" : "Close"}
            className={`w-8 h-7 rounded-[8px] flex items-center justify-center transition-colors cursor-pointer ${
              isLightMode
                ? "text-neutral-600 hover:bg-[#e81123] hover:text-white"
                : "text-zinc-400 hover:bg-[#e81123] hover:text-white"
            }`}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* Main 2-Column Body: Left Sidebar + Right Scrollable Canvas */}
      <div className="flex-1 flex min-h-0 w-full overflow-hidden">
        <SettingsSidebar
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          optLanguage={optLanguage}
          isLightMode={isLightMode}
          appVersion={currentAppVersion}
          hasUpdate={Boolean(updateInfo?.available) || updateStatus === "available"}
          updateVersion={updateInfo?.version}
        />

        <main
          className={`flex-1 h-full overflow-y-auto overflow-x-hidden settings-scroll px-7 py-6 ${
            isLightMode ? "bg-[#f5f5f7]" : "bg-[#0c0c10]"
          }`}
        >
          <div className="max-w-[640px] mx-auto w-full flex flex-col gap-5">
            {/* Section Title Header */}
            {!searchQuery.trim() && (
              <div className="flex items-center justify-between pb-1 border-b border-white/[0.06] [html.light_&]:border-black/[0.07]">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-[12px] flex items-center justify-center text-white shadow-md ${currentSectionMeta.bgClass}`}
                  >
                    {currentSectionMeta.icon}
                  </div>
                  <div className="flex flex-col">
                    <h1
                      className={`text-[18px] font-bold tracking-tight leading-tight ${
                        isLightMode ? "text-neutral-900" : "text-white"
                      }`}
                    >
                      {isId ? currentSectionMeta.labelId : currentSectionMeta.labelEn}
                    </h1>
                    <p
                      className={`text-[12px] mt-0.5 ${
                        isLightMode ? "text-neutral-500" : "text-zinc-400"
                      }`}
                    >
                      {isId ? currentSectionMeta.subId : currentSectionMeta.subEn}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Dynamic Section Content */}
            <AnimatePresence mode="wait">
              {searchQuery.trim().length > 0 ? (
                <motion.div
                  key="search-results"
                  variants={sectionVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="w-full"
                >
                  <SearchResults
                    searchQuery={searchQuery}
                    onNavigateTab={(subtab) => {
                      setSearchQuery("");
                      if (subtab === "general") setActiveSection("general");
                      else if (subtab === "appearance") setActiveSection("appearance");
                      else if (subtab === "idle") setActiveSection("idle");
                      else if (subtab === "modules") setActiveSection("notifications");
                      else if (subtab === "advanced") setActiveSection("system");
                    }}
                    optLanguage={optLanguage}
                    onChangeLanguage={handleChangeLanguage}
                    isAutostart={isAutostart}
                    onToggleAutostart={handleToggleAutostart}
                    showGreeting={showGreeting}
                    onToggleGreeting={handleToggleGreeting}
                    greetingNameMode={greetingNameMode}
                    onChangeGreetingNameMode={handleChangeGreetingNameMode}
                    customGreetingName={customGreetingName}
                    onChangeCustomGreetingName={handleChangeCustomGreetingName}
                    optAutoCompact={optAutoCompact}
                    onToggleAutoCompact={handleToggleAutoCompact}
                    optNotifTime={optNotifTime}
                    onChangeNotifTime={handleChangeNotifTime}
                    optNotifSound={optNotifSound}
                    onChangeNotifSound={handleChangeNotifSound}
                    optCloseDelay={optCloseDelay}
                    onChangeCloseDelay={handleChangeCloseDelay}
                    optTheme={optTheme}
                    onChangeTheme={handleChangeTheme}
                    notchShape={notchShape}
                    onChangeNotchShape={handleChangeNotchShape}
                    islandTopOffset={islandTopOffset}
                    onChangeIslandTopOffset={handleChangeIslandTopOffset}
                    optPosition={optPosition}
                    onChangePosition={handleChangePosition}
                    isLightMode={isLightMode}
                    optFontSize={optFontSize}
                    onChangeFontSize={handleChangeFontSize}
                    optIdleSize={optIdleSize}
                    onChangeIdleSize={handleChangeIdleSize}
                    optTabSize={optTabSize}
                    onChangeTabSize={handleChangeTabSize}
                    optEars={optEars}
                    onToggleEars={handleToggleEars}
                    optOpacity={optOpacity}
                    onChangeOpacity={handleChangeOpacity}
                    optAnimSpeed={optAnimSpeed}
                    onChangeAnimSpeed={handleChangeAnimSpeed}
                    optVolume={optVolume}
                    onToggleVolume={handleToggleVolume}
                    optClipboard={optClipboard}
                    onToggleClipboard={handleToggleClipboard}
                    optOcr={optOcr}
                    onToggleOcr={handleToggleOcr}
                    optMedia={optMedia}
                    onToggleMedia={handleToggleMedia}
                    optSoundFx={optSoundFx}
                    onToggleSoundFx={handleToggleSoundFx}
                    currentAppVersion={currentAppVersion}
                    updateStatus={updateStatus}
                    updateInfo={updateInfo}
                    downloadProgress={downloadProgress}
                    onCheckUpdate={handleCheckUpdate}
                    onInstallUpdate={handleInstallUpdate}
                    clearTempStatus={clearTempStatus}
                    clearedResult={clearedResult}
                    onClearTempFiles={handleClearTempFiles}
                    onTestNotification={() => {
                      invoke("trigger_notch_action", { action: "test_notification" }).catch(() => {});
                    }}
                    onClose={() => getCurrentWindow().hide()}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key={activeSection}
                  variants={sectionVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="w-full"
                >
                  {activeSection === "tabs" && (
                    <TabsManagerView
                      prefs={tabsPrefs}
                      onChangePrefs={handleChangeTabsPrefs}
                      optLanguage={optLanguage}
                      isLightMode={isLightMode}
                    />
                  )}

                  {activeSection === "appearance" && (
                    <AppearanceTab
                      optTheme={optTheme}
                      onChangeTheme={handleChangeTheme}
                      notchShape={notchShape}
                      onChangeNotchShape={handleChangeNotchShape}
                      islandTopOffset={islandTopOffset}
                      onChangeIslandTopOffset={handleChangeIslandTopOffset}
                      optPosition={optPosition}
                      onChangePosition={handleChangePosition}
                      isLightMode={isLightMode}
                      optFontSize={optFontSize}
                      onChangeFontSize={handleChangeFontSize}
                      optIdleSize={optIdleSize}
                      onChangeIdleSize={handleChangeIdleSize}
                      optTabSize={optTabSize}
                      onChangeTabSize={handleChangeTabSize}
                      optEars={optEars}
                      onToggleEars={handleToggleEars}
                      optOpacity={optOpacity}
                      onChangeOpacity={handleChangeOpacity}
                      optAnimSpeed={optAnimSpeed}
                      onChangeAnimSpeed={handleChangeAnimSpeed}
                    />
                  )}

                  {activeSection === "idle" && (
                    <IdleTab
                      layout={idleLayout}
                      onChangeLayout={handleChangeIdleLayout}
                      runtimeData={idleRuntimeData}
                    />
                  )}

                  {activeSection === "general" && (
                    <GeneralTab
                      optLanguage={optLanguage}
                      onChangeLanguage={handleChangeLanguage}
                      isAutostart={isAutostart}
                      onToggleAutostart={handleToggleAutostart}
                      showGreeting={showGreeting}
                      onToggleGreeting={handleToggleGreeting}
                      greetingNameMode={greetingNameMode}
                      onChangeGreetingNameMode={handleChangeGreetingNameMode}
                      customGreetingName={customGreetingName}
                      onChangeCustomGreetingName={handleChangeCustomGreetingName}
                      onTestGreeting={() => {
                        invoke("trigger_notch_action", { action: "test_greeting" }).catch(() => {});
                      }}
                      optAutoCompact={optAutoCompact}
                      onToggleAutoCompact={handleToggleAutoCompact}
                      optNotifTime={optNotifTime}
                      onChangeNotifTime={handleChangeNotifTime}
                      optNotifSound={optNotifSound}
                      onChangeNotifSound={handleChangeNotifSound}
                      optCloseDelay={optCloseDelay}
                      onChangeCloseDelay={handleChangeCloseDelay}
                      shortcuts={shortcuts}
                      shortcutsEnabled={shortcutsEnabled}
                      shortcutStatuses={shortcutStatuses}
                      onUpdateShortcut={handleUpdateShortcut}
                      onResetShortcut={handleResetShortcut}
                      onToggleShortcutsEnabled={handleToggleShortcutsEnabled}
                      isLightMode={isLightMode}
                    />
                  )}

                  {activeSection === "notifications" && (
                    <div className="flex flex-col gap-4 w-full">
                      <div
                        className={`w-full rounded-[22px] p-2 flex flex-col gap-1 ${
                          isLightMode
                            ? "bg-white/85 border border-black/10 shadow-sm"
                            : "bg-[#111114] border border-white/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                        }`}
                      >
                        <SettingRow
                          icon={<Clock size={18} />}
                          iconBgClass="bg-[#2e161c]"
                          iconColorClass="text-[#ff375f]"
                          title={t("settings_notif_duration")}
                          subtitle={t("settings_notif_duration_desc")}
                          control={
                            <IosSegmentedControl
                              value={optNotifTime}
                              onChange={handleChangeNotifTime}
                              options={[
                                { value: 3, label: isId ? "3 dtk" : "3s" },
                                { value: 5, label: isId ? "5 dtk" : "5s" },
                                { value: 7, label: isId ? "7 dtk" : "7s" },
                              ]}
                            />
                          }
                        />

                        <SettingRow
                          icon={<Volume2 size={18} />}
                          iconBgClass="bg-[#26182e]"
                          iconColorClass="text-[#af52de]"
                          title={t("settings_notif_sound")}
                          subtitle={t("settings_notif_sound_desc")}
                          control={
                            <NotifSoundPicker
                              value={optNotifSound}
                              onChange={handleChangeNotifSound}
                            />
                          }
                        />

                        <WindowsBannerRow />

                        <SettingRow
                          icon={<Send size={18} />}
                          iconBgClass="bg-[#241c30]"
                          iconColorClass="text-[#bf5af2]"
                          title={t("settings_adv_test_notif")}
                          subtitle={t("settings_adv_test_notif_desc")}
                          control={
                            <button
                              type="button"
                              onClick={() => {
                                invoke("trigger_notch_action", { action: "test_notification" }).catch(() => {});
                              }}
                              className="px-3.5 py-1.5 rounded-full bg-[#1e1e24] hover:bg-[#282830] text-white text-[12px] font-medium transition-colors cursor-pointer"
                            >
                              {t("settings_adv_test_notif_btn")}
                            </button>
                          }
                        />
                      </div>

                      <ModulesTab
                        optVolume={optVolume}
                        onToggleVolume={handleToggleVolume}
                        optClipboard={optClipboard}
                        onToggleClipboard={handleToggleClipboard}
                        optOcr={optOcr}
                        onToggleOcr={handleToggleOcr}
                        optMedia={optMedia}
                        onToggleMedia={handleToggleMedia}
                        optSoundFx={optSoundFx}
                        onToggleSoundFx={handleToggleSoundFx}
                      />
                    </div>
                  )}

                  {activeSection === "shortcuts" && (
                    <KeyboardShortcutsCard
                      shortcuts={shortcuts}
                      shortcutsEnabled={shortcutsEnabled}
                      shortcutStatuses={shortcutStatuses}
                      onUpdateShortcut={handleUpdateShortcut}
                      onResetShortcut={handleResetShortcut}
                      onToggleShortcutsEnabled={handleToggleShortcutsEnabled}
                      isLightMode={isLightMode}
                    />
                  )}

                  {activeSection === "system" && (
                    <AdvancedTab
                      currentAppVersion={currentAppVersion}
                      updateStatus={updateStatus}
                      updateInfo={updateInfo}
                      downloadProgress={downloadProgress}
                      onCheckUpdate={handleCheckUpdate}
                      onInstallUpdate={handleInstallUpdate}
                      clearTempStatus={clearTempStatus}
                      clearedResult={clearedResult}
                      onClearTempFiles={handleClearTempFiles}
                      onTestNotification={() => {
                        invoke("trigger_notch_action", { action: "test_notification" }).catch(() => {});
                      }}
                      onClose={() => {
                        invoke("trigger_notch_action", { action: "restart_onboarding" }).catch(() => {});
                      }}
                    />
                  )}

                  {activeSection === "about" && (
                    <AboutView
                      appVersion={currentAppVersion}
                      optLanguage={optLanguage}
                      isLightMode={isLightMode}
                    />
                  )}

                  {activeSection === "support" && (
                    <SupportView
                      optLanguage={optLanguage}
                      isLightMode={isLightMode}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
};
