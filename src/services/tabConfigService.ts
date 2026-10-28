import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";

export type ManageableTabId =
  | "media_expanded"
  | "quick_control"
  | "todo"
  | "mini_note"
  | "drop_shelf"
  | "pomodoro"
  | "water_reminder"
  | "prayer_reminder"
  | "sys_monitor"
  | "clipboard"
  | "volume_mixer"
  | "notif_center";

export interface TabItemConfig {
  id: ManageableTabId;
  enabled: boolean;
}

export type DefaultTabBehavior = "remember_last" | "first_tab" | "quick_control";

export interface NotchTabsPreferences {
  items: TabItemConfig[];
  includeSettingsInDock: boolean;
  showPageDots: boolean;
  defaultOpenBehavior: DefaultTabBehavior;
}

const STORAGE_KEY = "island_tabs_preferences_v1";
const STORE_KEY = "opt_tabs_preferences";

export const DEFAULT_TAB_ITEMS: TabItemConfig[] = [
  { id: "media_expanded", enabled: true },
  { id: "quick_control", enabled: true },
  { id: "todo", enabled: true },
  { id: "mini_note", enabled: true },
  { id: "drop_shelf", enabled: true },
  { id: "pomodoro", enabled: true },
  { id: "water_reminder", enabled: true },
  { id: "prayer_reminder", enabled: true },
  { id: "sys_monitor", enabled: true },
  { id: "clipboard", enabled: false },
  { id: "volume_mixer", enabled: false },
  { id: "notif_center", enabled: false },
];

export const DEFAULT_TABS_PREFERENCES: NotchTabsPreferences = {
  items: DEFAULT_TAB_ITEMS,
  includeSettingsInDock: true,
  showPageDots: true,
  defaultOpenBehavior: "remember_last",
};

const ALL_VALID_TAB_IDS = new Set<ManageableTabId>(DEFAULT_TAB_ITEMS.map((t) => t.id));

export function normalizeTabsPreferences(raw: unknown): NotchTabsPreferences {
  if (!raw || typeof raw !== "object") {
    return {
      ...DEFAULT_TABS_PREFERENCES,
      items: DEFAULT_TAB_ITEMS.map((item) => ({ ...item })),
    };
  }

  const obj = raw as Partial<NotchTabsPreferences>;
  const seen = new Set<ManageableTabId>();
  const normalizedItems: TabItemConfig[] = [];

  if (Array.isArray(obj.items)) {
    for (const entry of obj.items) {
      if (
        entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        ALL_VALID_TAB_IDS.has(entry.id as ManageableTabId) &&
        !seen.has(entry.id as ManageableTabId)
      ) {
        const id = entry.id as ManageableTabId;
        seen.add(id);
        normalizedItems.push({
          id,
          enabled: typeof entry.enabled === "boolean" ? entry.enabled : true,
        });
      }
    }
  }

  // Append any missing known tabs at the end with their default enabled state
  for (const def of DEFAULT_TAB_ITEMS) {
    if (!seen.has(def.id)) {
      normalizedItems.push({ ...def });
    }
  }

  // Ensure at least one core tab remains enabled so the notch is never empty
  if (!normalizedItems.some((item) => item.enabled)) {
    const qc = normalizedItems.find((item) => item.id === "quick_control") || normalizedItems[0];
    if (qc) qc.enabled = true;
  }

  const includeSettingsInDock =
    typeof obj.includeSettingsInDock === "boolean"
      ? obj.includeSettingsInDock
      : DEFAULT_TABS_PREFERENCES.includeSettingsInDock;

  const showPageDots =
    typeof obj.showPageDots === "boolean"
      ? obj.showPageDots
      : DEFAULT_TABS_PREFERENCES.showPageDots;

  const defaultOpenBehavior: DefaultTabBehavior =
    obj.defaultOpenBehavior === "first_tab" ||
    obj.defaultOpenBehavior === "quick_control" ||
    obj.defaultOpenBehavior === "remember_last"
      ? obj.defaultOpenBehavior
      : DEFAULT_TABS_PREFERENCES.defaultOpenBehavior;

  return {
    items: normalizedItems,
    includeSettingsInDock,
    showPageDots,
    defaultOpenBehavior,
  };
}

export function loadTabsPreferences(): NotchTabsPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeTabsPreferences(JSON.parse(raw));
    }
  } catch {}
  return normalizeTabsPreferences(null);
}

export async function saveTabsPreferences(
  prefs: NotchTabsPreferences,
  broadcast = true
): Promise<NotchTabsPreferences> {
  const normalized = normalizeTabsPreferences(prefs);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {}

  try {
    const s = await load("settings.json", { autoSave: true });
    await s.set(STORE_KEY, normalized);
    await s.save();
  } catch {}

  window.dispatchEvent(new CustomEvent("gili_tabs_preferences_updated", { detail: normalized }));

  if (broadcast) {
    invoke("broadcast_settings_sync", {
      payload: { type: "tabs_preferences", data: normalized },
    }).catch(() => {});
  }

  return normalized;
}

export function getOrderedEnabledTabs(prefs: NotchTabsPreferences): string[] {
  const active: string[] = prefs.items.filter((item) => item.enabled).map((item) => item.id);
  if (active.length === 0) {
    active.push("quick_control");
  }
  if (prefs.includeSettingsInDock && !active.includes("settings")) {
    active.push("settings");
  }
  return active;
}
