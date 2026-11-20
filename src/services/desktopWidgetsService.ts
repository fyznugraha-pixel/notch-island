import { invoke } from "@tauri-apps/api/core";
import { loadActiveProvider } from "./aiChatService";
import { getSecureApiKey } from "./aiCredentialService";
import { HABIT_STREAK_STORAGE_KEY, parseHabitStreakRecord } from "./habitHistoryService";
import { getLanguage } from "./languageStore";

export type WidgetSize = "small" | "medium" | "large";
export type BackgroundMode = "none" | "subtle_tint" | "glass" | "solid";
export type DisplayMode = "desktop_attached" | "widget_board";

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type ColorRoleSource =
  | { mode: "auto_contrast" }
  | { mode: "wallpaper_dominant" }
  | { mode: "custom"; color: RgbaColor };

export interface WidgetStyleConfig {
  background_mode: BackgroundMode;
  tint_opacity: number;
  text_primary: ColorRoleSource;
  text_secondary: ColorRoleSource;
  accent: ColorRoleSource;
  card_color: ColorRoleSource;
  shadow_color: RgbaColor;
  shadow_enabled: boolean;
  halo_enabled: boolean;
  font_family: string;
  font_weight: number;
  text_scale: number;
}

export interface ColorPreset {
  id: string;
  name: string;
  style: WidgetStyleConfig;
}

export interface WidgetInstance {
  instance_id: string;
  widget_type: string;
  style_override: WidgetStyleConfig | null;
  settings: Record<string, unknown>;
}

export interface WidgetStackSlot {
  slot_id: string;
  monitor_id: string;
  size: WidgetSize;
  grid_col: number;
  grid_row: number;
  pos_x?: number | null;
  pos_y?: number | null;
  active_index: number;
  auto_rotate_minutes: number;
  widgets: WidgetInstance[];
}

export interface DesktopWidgetsConfig {
  schema_version: number;
  enabled: boolean;
  display_mode: DisplayMode;
  board_hotkey: string;
  grid_scale: number;
  positions_locked: boolean;
  auto_pause_fullscreen: boolean;
  auto_pause_power_saver: boolean;
  global_theme: WidgetStyleConfig;
  presets: ColorPreset[];
  recent_colors: string[];
  slots: WidgetStackSlot[];
}

export interface WidgetCatalogEntry {
  widget_type: string;
  group: string;
  group_label: string;
  name: string;
  description: string;
  supported_sizes: WidgetSize[];
  default_size: WidgetSize;
  data_source: string;
  requires_setup: boolean;
  deep_link_feature: string | null;
}

export interface WallpaperRegionAnalysis {
  avg_luminance: number;
  recommended_text_primary: RgbaColor;
  recommended_text_secondary: RgbaColor;
  dominant_accent: RgbaColor;
  palette: string[];
  low_contrast_warning: boolean;
  measured_contrast_ratio: number;
  wallpaper_available: boolean;
}

export interface WidgetRuntimeMetrics {
  running: boolean;
  edit_mode: boolean;
  board_visible: boolean;
  monitor_count: number;
  active_widget_count: number;
  gpu_adapter: string;
  target_fps: number;
  last_dirty_rects: number;
  paused_reason: string | null;
  working_set_mb: number;
  power_saver: boolean;
  high_contrast: boolean;
  reduced_motion: boolean;
  text_scale_factor: number;
}

export function rgbaToHex(c: RgbaColor): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(c.r), clamp(c.g), clamp(c.b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function hexToRgba(hex: string, alpha = 1): RgbaColor | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
    a: Math.max(0, Math.min(1, alpha)),
  };
}

export async function getDesktopWidgetsConfig(): Promise<DesktopWidgetsConfig> {
  return invoke<DesktopWidgetsConfig>("get_desktop_widgets_config");
}

export async function saveDesktopWidgetsConfig(
  config: DesktopWidgetsConfig
): Promise<DesktopWidgetsConfig> {
  return invoke<DesktopWidgetsConfig>("save_desktop_widgets_config", { config });
}

export async function getDesktopWidgetsCatalog(): Promise<WidgetCatalogEntry[]> {
  return invoke<WidgetCatalogEntry[]>("get_desktop_widgets_catalog");
}

export async function toggleDesktopWidgetBoard(visible?: boolean): Promise<boolean> {
  return invoke<boolean>("toggle_desktop_widget_board", { visible: visible ?? null });
}

export async function setDesktopWidgetEditMode(enabled: boolean): Promise<void> {
  await invoke("set_desktop_widget_edit_mode", { enabled });
}

export async function getDesktopWidgetsRuntimeMetrics(): Promise<WidgetRuntimeMetrics> {
  return invoke<WidgetRuntimeMetrics>("get_desktop_widgets_runtime_metrics");
}

export async function analyzeWidgetWallpaperContrast(
  style: WidgetStyleConfig,
  nx = 0.05,
  ny = 0.05,
  nw = 0.25,
  nh = 0.25
): Promise<WallpaperRegionAnalysis> {
  return invoke<WallpaperRegionAnalysis>("analyze_widget_wallpaper_contrast", {
    style,
    nx,
    ny,
    nw,
    nh,
  });
}

export interface WidgetIcalStatus {
  configured: boolean;
  synced_count: number;
  updated_label: string;
  error: string | null;
}

export async function saveWidgetIcalUrl(url: string): Promise<number> {
  return invoke<number>("save_widget_ical_url", { url });
}

export async function clearWidgetIcalUrl(): Promise<void> {
  await invoke("clear_widget_ical_url");
}

export async function getWidgetIcalStatus(): Promise<WidgetIcalStatus> {
  return invoke<WidgetIcalStatus>("get_widget_ical_status");
}

export async function takePendingWidgetProvider(): Promise<string | null> {
  return invoke<string | null>("take_pending_widget_provider");
}

export async function saveGithubWidgetToken(token: string, repo: string): Promise<void> {
  await invoke("save_github_widget_token", { token, repo });
}

export async function triggerWidgetStorageScan(rootPath?: string): Promise<void> {
  await invoke("trigger_widget_storage_scan", { rootPath: rootPath ?? null });
}

export async function exportWidgetTimeTrackerCsv(): Promise<string> {
  return invoke<string>("export_widget_time_tracker_csv");
}

export async function setWidgetExpenseBudget(budgetIdr: number): Promise<void> {
  await invoke("set_widget_expense_budget", { budgetIdr });
}

export async function addWidgetUptimeSite(name: string, url: string): Promise<void> {
  await invoke("add_widget_uptime_site", { name, url });
}

export async function addWidgetTimeProject(name: string): Promise<void> {
  await invoke("add_widget_time_project", { name });
}

export async function addWidgetShortcut(name: string, targetPath: string): Promise<void> {
  await invoke("add_widget_shortcut", { name, targetPath });
}

export async function configureWidgetPhotoFolder(folderPath: string): Promise<number> {
  return invoke<number>("configure_widget_photo_folder", { folderPath });
}

export async function pickWidgetPhotosDialog(): Promise<number> {
  return invoke<number>("pick_widget_photos_dialog");
}

export async function pickWidgetPhotoFolderDialog(): Promise<number> {
  return invoke<number>("pick_widget_photo_folder_dialog");
}

export async function configureWidgetRecentFolders(
  enabled: boolean,
  folders: string[],
  excluded: string[]
): Promise<void> {
  await invoke("configure_widget_recent_folders", { enabled, folders, excluded });
}

export async function addWidgetCountdown(title: string, targetDate: string): Promise<void> {
  await invoke("add_widget_countdown", { title, targetDate });
}

export async function addWidgetSnippet(label: string, content: string): Promise<void> {
  await invoke("add_widget_snippet", { label, content });
}

export async function addWidgetWorldClock(
  city: string,
  code: string,
  utcOffsetHours: number
): Promise<void> {
  await invoke("add_widget_world_clock", { city, code, utcOffsetHours });
}

/**
 * Mirrors existing Gili localStorage module state into the Rust WidgetDataHub
 * so desktop widgets reuse the exact same user data without duplicating business logic.
 */
export async function syncFrontendWidgetMirror(): Promise<void> {
  try {
    const parseJson = (key: string): any => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };

    const rawEvents = parseJson("gili_navbar_events_v1");
    const events = Array.isArray(rawEvents)
      ? rawEvents.map((e: any, idx: number) => ({
        id: String(e?.id ?? idx),
        title: String(e?.title ?? e?.name ?? ""),
        time: String(e?.time ?? e?.date ?? ""),
        date_key: typeof e?.date === "string" ? e.date : null,
      }))
      : [];

    const rawClasses = parseJson("gili_class_schedule_v1");
    const classes = Array.isArray(rawClasses)
      ? rawClasses.map((c: any, idx: number) => ({
        id: String(c?.id ?? idx),
        subject: String(c?.subject ?? c?.name ?? ""),
        room: String(c?.room ?? ""),
        time: String(c?.time ?? ""),
        day: typeof c?.day === "number" ? c.day : null,
      }))
      : [];

    const rawTodos = parseJson("island_todo_list");
    const todos = Array.isArray(rawTodos)
      ? rawTodos.map((t: any, idx: number) => ({
        id: String(t?.id ?? idx),
        text: String(t?.text ?? t?.title ?? ""),
        completed: Boolean(t?.completed ?? t?.done),
        group: typeof t?.group === "string" ? t.group : null,
      }))
      : [];

    const rawShelf = parseJson("island_drop_shelf");
    const shelf_files = Array.isArray(rawShelf)
      ? rawShelf.map((f: any, idx: number) => ({
        id: String(f?.id ?? idx),
        name: String(f?.name ?? ""),
        path: String(f?.path ?? ""),
        size_formatted: String(f?.sizeFormatted ?? f?.size ?? ""),
      }))
      : [];

    const streak = parseHabitStreakRecord(
      parseJson(HABIT_STREAK_STORAGE_KEY),
      "Fokus Harian"
    );

    const rawQuote = parseJson("gili_quote_daily_v1");
    const quote = {
      text: typeof rawQuote?.text === "string" ? rawQuote.text : "",
      author: typeof rawQuote?.author === "string" ? rawQuote.author : "",
      custom_text: typeof rawQuote?.customText === "string" ? rawQuote.customText : null,
    };

    const activeProvider = loadActiveProvider();
    const apiKey = await getSecureApiKey(activeProvider).catch(() => "");

    const rawCity = parseJson("island_weather_custom_city");
    const lang = getLanguage();
    const mirror = {
      events,
      classes,
      todos,
      shelf_files,
      quote,
      ai_quick: {
        configured: Boolean(apiKey.trim()),
        active_model_label: activeProvider.toUpperCase(),
        last_prompt: "",
        last_response: "",
        is_streaming: false,
        error: null,
      },
      habit_title: streak.title,
      habit_count: streak.count,
      habit_last_checked: streak.lastCheckedDate,
      habit_history: streak.history,
      custom_city_name: typeof rawCity?.name === "string" ? rawCity.name : null,
      custom_lat: typeof rawCity?.latitude === "number" ? rawCity.latitude : null,
      custom_lon: typeof rawCity?.longitude === "number" ? rawCity.longitude : null,
      language: lang,
    };

    await invoke("sync_frontend_widget_mirror", { mirror });
  } catch {
    // Non-fatal if running outside Tauri webview
  }
}
