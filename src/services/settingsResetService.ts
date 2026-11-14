import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { DEFAULT_WATER_SETTINGS, updateWaterSettings } from "./waterService";

const LOCAL_SETTING_KEYS: readonly string[] = [
  "island_onboarding_completed",
  "island_theme",
  "island_idle_layout",
  "island_idle_size",
  "island_idle_slot",
  "island_font_size",
  "island_tab_size",
  "island_ears",
  "island_transparency",
  "island_transparency_preset",
  "island_opacity",
  "island_blur",
  "island_auto_compact",
  "island_auto_compact_mode",
  "island_show_greeting",
  "island_greeting_name_mode",
  "island_custom_greeting_name",
  "island_close_delay",
  "island_position",
  "island_target_monitor",
  "island_notch_shape",
  "island_top_offset",
  "island_idle_color_enabled",
  "island_idle_color",
  "island_idle_text_color_enabled",
  "island_idle_text_color",
  "island_language",
  "island_notif_sound",
  "island_sound_effects",
  "island_shortcuts",
  "island_shortcuts_enabled",
  "island_tabs_preferences_v1",
  "island_last_active_tab",
  "island_last_panel_closed_at",
  "island_muted_apps",
  "island_dnd_mode",
  "island_weather_custom_city",
  "island_cached_weather_data",
  "island_cached_weather_location",
  "island_water_reminder_configured",
  "island_shelf_settings",
  "island_show_lyrics",
  "island_ai_router_config_v1",
  "island_ai_currency_v1",
  "island_ai_limit_customized_v1",
  "island_ai_window_read_mode",
  "gili_pomodoro_settings",
  "gili_prayer_settings_v1",
  "gili_prayer_reminder_configured_v1",
  "gili_follow_system_text_scale",
  "gili_system_text_scale",
  "gili_miniplayer_mode",
  "gili_miniplayer_pinned",
  "gili_miniplayer_pos",
  "gili_miniplayer_fade_opacity",
  "notch_lyrics_provider",
  "notch_lyrics_offset",
];

// Preference keys persisted inside settings.json (keeps ai_provider_keys intact).
const SETTINGS_STORE_KEYS: readonly string[] = [
  "opt_tabs_preferences",
  "autostart_initialized",
  "opt_autostart",
  "show_greeting",
  "greeting_name_mode",
  "custom_greeting_name",
  "opt_volume",
  "opt_clipboard",
  "opt_ocr",
  "opt_media",
  "opt_sound_fx",
  "opt_position",
  "opt_target_monitor",
  "opt_opacity",
  "opt_blur",
  "opt_anim_speed",
  "opt_accent",
  "opt_notif_time",
  "opt_notif_sound",
  "opt_close_delay",
  "notch_shape",
  "island_top_offset",
  "opt_ears",
  "opt_auto_compact",
  "opt_auto_compact_mode",
  "opt_idle_color_enabled",
  "opt_idle_color",
  "opt_idle_text_color_enabled",
  "opt_idle_text_color",
  "opt_language",
  "opt_theme",
  "opt_idle_layout",
  "opt_idle_size",
  "opt_tab_size",
  "opt_font_size",
  "shortcuts",
  "shortcuts_enabled",
];

export async function resetAllAppSettings(): Promise<void> {
  try {
    updateWaterSettings(DEFAULT_WATER_SETTINGS);
  } catch {}

  try {
    for (const key of LOCAL_SETTING_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {}

  try {
    const store = await load("settings.json", { autoSave: true });
    for (const key of SETTINGS_STORE_KEYS) {
      await store.delete(key);
    }
    await store.save();
  } catch {}

  try {
    await invoke("broadcast_settings_sync", {
      payload: { type: "settings_reset" },
    });
  } catch {}
}
