import { load, Store } from "@tauri-apps/plugin-store";
import { emit } from "@tauri-apps/api/event";
import {
  NavbarConfig,
  NavbarModuleConfig,
  DEFAULT_NAVBAR_CONFIG,
  DEFAULT_NAVBAR_MODULES,
  NAVBAR_ACCENT_COLORS,
} from "../types/navbar";

const STORE_FILENAME = "settings.json";
const STORE_KEY = "opt_navbar_config";
const LOCAL_STORAGE_KEY = "island_navbar_config_v1";

let storeInstance: Store | null = null;
let storeInitPromise: Promise<Store | null> | null = null;

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
    style,
    background,
    customColor: typeof r.customColor === "string" ? r.customColor : null,
    accent,
    opacity: clamp(r.opacity, 20, 100, DEFAULT_NAVBAR_CONFIG.opacity),
    autoHide: typeof r.autoHide === "boolean" ? r.autoHide : DEFAULT_NAVBAR_CONFIG.autoHide,
    windowPreviews:
      typeof r.windowPreviews === "boolean" ? r.windowPreviews : DEFAULT_NAVBAR_CONFIG.windowPreviews,
    magnify: typeof r.magnify === "boolean" ? r.magnify : DEFAULT_NAVBAR_CONFIG.magnify,
    appLabels: typeof r.appLabels === "boolean" ? r.appLabels : DEFAULT_NAVBAR_CONFIG.appLabels,
    clock24h: typeof r.clock24h === "boolean" ? r.clock24h : DEFAULT_NAVBAR_CONFIG.clock24h,
    hideWindowsTaskbar:
      typeof r.hideWindowsTaskbar === "boolean"
        ? r.hideWindowsTaskbar
        : DEFAULT_NAVBAR_CONFIG.hideWindowsTaskbar,
    modules: normalizeModules(r.modules),
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
    } catch {}
  }

  const normalized = normalizeNavbarConfig(loadedData);

  // Write through to localStorage for synchronous instant access on load
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
    } catch {}
  }

  return normalized;
}

export async function saveNavbarConfig(config: NavbarConfig): Promise<NavbarConfig> {
  const normalized = normalizeNavbarConfig(config);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
    } catch {}
  }

  try {
    const store = await getSettingsStore();
    if (store) {
      await store.set(STORE_KEY, normalized);
      await store.save();
    }
  } catch (err) {
    console.error("Failed to save navbar config to store:", err);
  }

  // Broadcast sync event to all windows
  try {
    await emit("gili-navbar-config-sync", normalized);
  } catch {}

  return normalized;
}
