import { load, Store } from "@tauri-apps/plugin-store";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  NavbarConfig,
  NavbarModuleConfig,
  DEFAULT_NAVBAR_CONFIG,
  DEFAULT_NAVBAR_MODULES,
  NAVBAR_ACCENT_COLORS,
} from "../types/navbar";

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "").trim();
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.substring(0, 2), 16) || 0;
    const g = parseInt(clean.substring(2, 4), 16) || 0;
    const b = parseInt(clean.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
  }
  return `rgba(0, 0, 0, ${safeAlpha})`;
}

export function darkenHex(hex: string, keep: number): string {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const channel = (start: number) =>
    Math.round((parseInt(full.substring(start, start + 2), 16) || 0) * keep)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

const STORE_FILENAME = "settings.json";
const STORE_KEY = "opt_navbar_config";
const LOCAL_STORAGE_KEY = "island_navbar_config_v1";
const BROADCAST_CHANNEL_NAME = "gili_navbar_sync_channel";

let storeInstance: Store | null = null;
let storeInitPromise: Promise<Store | null> | null = null;
let syncChannel: BroadcastChannel | null = null;
let debouncedSaveTimer: any = null;
let pendingConfigToSave: NavbarConfig | null = null;
let lastSavedSwitchesHash = "";

function getSyncChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!syncChannel) {
    try {
      syncChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    } catch {}
  }
  return syncChannel;
}

async function flushConfigToStore(normalized: NavbarConfig): Promise<void> {
  try {
    const store = await getSettingsStore();
    if (store) {
      await store.set(STORE_KEY, normalized);
      await store.save();
    }
  } catch (err) {
    console.error("Failed to save navbar config to store:", err);
  }
}

export function subscribeToNavbarConfig(
  onUpdate: (config: NavbarConfig) => void
): () => void {
  const unlistenFns: (() => void)[] = [];

  // 1. BroadcastChannel (zero-IPC, instant cross-window sync across WebViews)
  const channel = getSyncChannel();
  if (channel) {
    const handler = (e: MessageEvent) => {
      if (e.data && typeof e.data === "object") {
        onUpdate(normalizeNavbarConfig(e.data));
      }
    };
    channel.addEventListener("message", handler);
    unlistenFns.push(() => channel.removeEventListener("message", handler));
  }

  // 2. Storage event (cross-webview fallback)
  if (typeof window !== "undefined") {
    const storageHandler = (e: StorageEvent) => {
      if (e.key === LOCAL_STORAGE_KEY && e.newValue) {
        try {
          onUpdate(normalizeNavbarConfig(JSON.parse(e.newValue)));
        } catch {}
      }
    };
    window.addEventListener("storage", storageHandler);
    unlistenFns.push(() => window.removeEventListener("storage", storageHandler));

    // 3. Custom DOM event (same window)
    const domHandler = (e: Event) => {
      const custom = e as CustomEvent<NavbarConfig>;
      if (custom.detail) {
        onUpdate(normalizeNavbarConfig(custom.detail));
      }
    };
    window.addEventListener("gili-navbar-config-sync", domHandler);
    unlistenFns.push(() => window.removeEventListener("gili-navbar-config-sync", domHandler));
  }

  return () => {
    unlistenFns.forEach((fn) => fn());
  };
}

async function getSettingsStore(): Promise<Store | null> {
  if (typeof window === "undefined") return null;
  if (!storeInstance && !storeInitPromise) {
    storeInitPromise = load(STORE_FILENAME, { autoSave: true })
      .then((s) => {
        storeInstance = s;
        return s;
      })
      .catch((err) => {
        console.error("Failed to load settings store for navbar:", err);
        return null;
      })
      .finally(() => {
        storeInitPromise = null;
      });
  }
  if (storeInstance) return storeInstance;
  return storeInitPromise;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || isNaN(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function normalizeModules(rawModules: unknown): NavbarModuleConfig[] {
  if (!Array.isArray(rawModules)) {
    return DEFAULT_NAVBAR_MODULES.map((m) => ({ ...m }));
  }

  const seenIds = new Set<string>();
  const validModules: NavbarModuleConfig[] = [];

  for (const item of rawModules) {
    if (!item || typeof item !== "object" || typeof item.id !== "string") continue;
    const cleanId = item.id.trim();
    if (!cleanId || seenIds.has(cleanId)) continue;

    seenIds.add(cleanId);
    const group = item.group === 1 || item.group === 2 || item.group === 3 ? item.group : 2;
    const enabled = typeof item.enabled === "boolean" ? item.enabled : true;
    const view = item.view === "full" ? "full" : "compact";

    validModules.push({
      id: cleanId,
      group,
      enabled,
      view,
    });
  }

  // Ensure all built-in modules are present in the list
  for (const defaultMod of DEFAULT_NAVBAR_MODULES) {
    if (!seenIds.has(defaultMod.id)) {
      validModules.push({ ...defaultMod });
      seenIds.add(defaultMod.id);
    }
  }

  return validModules;
}

export function normalizeNavbarConfig(raw: unknown): NavbarConfig {
  if (!raw || typeof raw !== "object") {
    return {
      ...DEFAULT_NAVBAR_CONFIG,
      modules: DEFAULT_NAVBAR_MODULES.map((m) => ({ ...m })),
    };
  }

  const r = raw as Record<string, any>;

  const shape = r.shape === "anchored" ? "anchored" : "floating";
  const position =
    r.position === "top" || r.position === "left" || r.position === "right"
      ? r.position
      : "bottom";
  const style =
    r.style === "liquid" || r.style === "followNotch" ? r.style : "solid";
  const background =
    r.background === "followNotch" || r.background === "custom"
      ? r.background
      : "black";
  const iconSpacing =
    r.iconSpacing === "normal" || r.iconSpacing === "roomy"
      ? r.iconSpacing
      : "tight";

  const iconTheme =
    r.iconTheme === "windows" || r.iconTheme === "ios"
      ? r.iconTheme
      : "fluent";

  const accent =
    typeof r.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(r.accent)
      ? r.accent
      : NAVBAR_ACCENT_COLORS[0];

  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_NAVBAR_CONFIG.enabled,
    shape,
    position,
    monitorId: typeof r.monitorId === "string" && r.monitorId.trim() ? r.monitorId.trim() : "primary",
    cornerRadius: clamp(r.cornerRadius, 0, 30, DEFAULT_NAVBAR_CONFIG.cornerRadius),
    distanceFromEdge: clamp(r.distanceFromEdge, 0, 40, DEFAULT_NAVBAR_CONFIG.distanceFromEdge),
    iconSize: clamp(r.iconSize, 28, 56, DEFAULT_NAVBAR_CONFIG.iconSize),
    iconSpacing,
    iconTheme,
    style,
    background,
    customColor: typeof r.customColor === "string" ? r.customColor : null,
    accent,
    opacity: clamp(r.opacity, 20, 100, DEFAULT_NAVBAR_CONFIG.opacity),
    autoHide: typeof r.autoHide === "boolean" ? r.autoHide : DEFAULT_NAVBAR_CONFIG.autoHide,
    autoHideMode: r.autoHideMode === "maxsize" ? "maxsize" : "normal",
    windowPreviews:
      typeof r.windowPreviews === "boolean" ? r.windowPreviews : DEFAULT_NAVBAR_CONFIG.windowPreviews,
    magnify: typeof r.magnify === "boolean" ? r.magnify : DEFAULT_NAVBAR_CONFIG.magnify,
    appLabels: typeof r.appLabels === "boolean" ? r.appLabels : DEFAULT_NAVBAR_CONFIG.appLabels,
    clock24h: typeof r.clock24h === "boolean" ? r.clock24h : DEFAULT_NAVBAR_CONFIG.clock24h,
    hideWindowsTaskbar:
      typeof r.hideWindowsTaskbar === "boolean"
        ? r.hideWindowsTaskbar
        : DEFAULT_NAVBAR_CONFIG.hideWindowsTaskbar,
    useGiliStart: typeof r.useGiliStart === "boolean" ? r.useGiliStart : false,
    useGiliSearch: typeof r.useGiliSearch === "boolean" ? r.useGiliSearch : false,
    useGiliQuickSettings: typeof r.useGiliQuickSettings === "boolean" ? r.useGiliQuickSettings : false,
    useGiliVolumeOutput: typeof r.useGiliVolumeOutput === "boolean" ? r.useGiliVolumeOutput : false,
    useGiliNotificationsCalendar:
      typeof r.useGiliNotificationsCalendar === "boolean"
        ? r.useGiliNotificationsCalendar
        : false,
    useGiliTray: typeof r.useGiliTray === "boolean" ? r.useGiliTray : false,
    modules: normalizeModules(r.modules),
  };
}

export function getCachedNavbarConfigSync(): NavbarConfig {
  if (typeof window !== "undefined") {
    try {
      const rawLocal = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (rawLocal) {
        return normalizeNavbarConfig(JSON.parse(rawLocal));
      }
    } catch { }
  }
  return {
    ...DEFAULT_NAVBAR_CONFIG,
    modules: DEFAULT_NAVBAR_MODULES.map((m) => ({ ...m })),
  };
}

export async function loadNavbarConfig(): Promise<NavbarConfig> {
  let loadedData: unknown = null;

  try {
    const store = await getSettingsStore();
    if (store) {
      loadedData = await store.get<unknown>(STORE_KEY);
    }
  } catch (err) {
    console.error("Error loading navbar config from store:", err);
  }

  if (!loadedData && typeof window !== "undefined") {
    try {
      const rawLocal = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (rawLocal) {
        loadedData = JSON.parse(rawLocal);
      }
    } catch { }
  }

  const normalized = normalizeNavbarConfig(loadedData);

  // Write through to localStorage for synchronous instant access on load
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
    } catch { }
  }

  return normalized;
}

export async function saveNavbarConfig(config: NavbarConfig): Promise<NavbarConfig> {
  const normalized = normalizeNavbarConfig(config);

  // 1. Instant synchronous write to localStorage
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
    } catch { }
  }

  // 2. Instant cross-window broadcast via BroadcastChannel (zero latency)
  try {
    const ch = getSyncChannel();
    if (ch) ch.postMessage(normalized);
  } catch {}

  // 3. Same-window custom event dispatch
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("gili-navbar-config-sync", { detail: normalized })
      );
    } catch {}
  }

  // 4. Tauri event broadcast (Rust + cross-window emit) - runs immediately without waiting for disk I/O
  try {
    invoke("broadcast_navbar_config_update", { config: normalized }).catch(() => {});
  } catch { }
  try {
    emit("navbar_config_updated", normalized).catch(() => {});
    emit("gili-navbar-config-sync", normalized).catch(() => {});
  } catch { }

  // 5. Only notify flyout switches if actual switch values changed (avoids spamming log during slider drag)
  const switchesHash = `${!!normalized.useGiliStart}:${!!normalized.useGiliSearch}:${!!normalized.useGiliQuickSettings}:${!!normalized.useGiliVolumeOutput}:${!!normalized.useGiliNotificationsCalendar}:${!!normalized.useGiliTray}`;
  if (switchesHash !== lastSavedSwitchesHash) {
    lastSavedSwitchesHash = switchesHash;
    try {
      invoke("set_taskbar_window_switches", {
        switches: {
          use_gili_start: !!normalized.useGiliStart,
          use_gili_search: !!normalized.useGiliSearch,
          use_gili_quick_settings: !!normalized.useGiliQuickSettings,
          use_gili_volume_output: !!normalized.useGiliVolumeOutput,
          use_gili_notif_cal: !!normalized.useGiliNotificationsCalendar,
          use_gili_tray: !!normalized.useGiliTray,
        },
      }).catch(() => {});
    } catch {}
  }

  // 6. Debounced disk persistence to store (never blocks UI or IPC thread)
  pendingConfigToSave = normalized;
  if (debouncedSaveTimer) clearTimeout(debouncedSaveTimer);
  debouncedSaveTimer = setTimeout(() => {
    if (pendingConfigToSave) {
      flushConfigToStore(pendingConfigToSave);
      pendingConfigToSave = null;
    }
  }, 250);

  return normalized;
}
