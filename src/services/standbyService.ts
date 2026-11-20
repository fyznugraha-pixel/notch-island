import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { emitCrossWindowEvent, listenCrossWindowEvent } from "../utils/crossWindowSync";

export type StandbyActivationMode = "off" | "auto_idle" | "secondary_permanent";
export type StandbyScreen = "widgets" | "clock" | "media" | "weather";
export type StandbyLeftWidget = "clock_analog" | "clock_digital" | "pomodoro" | "todo";
export type StandbyRightWidget = "weather_prayer" | "media" | "calendar" | "hydration" | "system";
export type StandbyClockStyle = "bold_duo" | "editorial_serif" | "minimal_mono" | "analog_rail";
export type StandbyNightMode = "off" | "auto" | "always";

export interface StandbyConfig {
  activation_mode: StandbyActivationMode;
  target_monitor_id: string | null;
  idle_minutes: number;
  exit_on_mouse_move: boolean;
  pause_during_fullscreen: boolean;
  always_on_top: boolean;
  active_screen: StandbyScreen;
  left_widget: StandbyLeftWidget;
  right_widget: StandbyRightWidget;
  clock_style: StandbyClockStyle;
  clock_accent: string;
  use_24h: boolean;
  show_seconds: boolean;
  night_mode: StandbyNightMode;
  burn_in_protection: boolean;
}

export interface StandbyLaunchContext {
  trigger: "manual" | "idle" | "secondary_permanent" | string;
  close_on_activity: boolean;
  monitor_id: string | null;
  is_secondary_monitor: boolean;
}

export const DEFAULT_STANDBY_CONFIG: StandbyConfig = {
  activation_mode: "off",
  target_monitor_id: null,
  idle_minutes: 5,
  exit_on_mouse_move: true,
  pause_during_fullscreen: true,
  always_on_top: true,
  active_screen: "widgets",
  left_widget: "clock_analog",
  right_widget: "weather_prayer",
  clock_style: "bold_duo",
  clock_accent: "#f5f5f7",
  use_24h: true,
  show_seconds: true,
  night_mode: "auto",
  burn_in_protection: true,
};

export const STANDBY_ACCENTS = [
  { id: "#f5f5f7", labelEn: "Mist", labelId: "Putih OLED" },
  { id: "#ff9f0a", labelEn: "Amber", labelId: "Amber" },
  { id: "#ff453a", labelEn: "Crimson", labelId: "Merah" },
  { id: "#30d158", labelEn: "Emerald", labelId: "Hijau" },
  { id: "#32ade6", labelEn: "Sky", labelId: "Biru" },
  { id: "#5e5ce6", labelEn: "Indigo", labelId: "Indigo" },
] as const;

export const STANDBY_CONFIG_EVENT = "standby:config-updated";

export async function getStandbyConfig(): Promise<StandbyConfig> {
  try {
    const raw = await invoke<StandbyConfig>("get_standby_config");
    return { ...DEFAULT_STANDBY_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_STANDBY_CONFIG };
  }
}

export async function saveStandbyConfig(config: StandbyConfig): Promise<StandbyConfig> {
  try {
    const saved = await invoke<StandbyConfig>("save_standby_config", { config });
    emitCrossWindowEvent(STANDBY_CONFIG_EVENT, saved);
    return saved;
  } catch {
    return config;
  }
}

export async function getStandbyLaunchContext(): Promise<StandbyLaunchContext> {
  try {
    return await invoke<StandbyLaunchContext>("get_standby_launch_context");
  } catch {
    return {
      trigger: "manual",
      close_on_activity: false,
      monitor_id: null,
      is_secondary_monitor: false,
    };
  }
}

export async function openStandbyWindow(trigger: "manual" | "idle" | "secondary_permanent" = "manual"): Promise<void> {
  await invoke("open_standby_window", { trigger });
}

export async function closeStandbyWindow(): Promise<void> {
  await invoke("close_standby_window");
}

export async function notifyStandbyReady(): Promise<void> {
  try {
    await invoke("notify_standby_ready");
  } catch {}
}

export async function toggleStandbyWindow(): Promise<void> {
  await invoke("toggle_standby_window");
}

export async function isStandbyOpen(): Promise<boolean> {
  try {
    return await invoke<boolean>("is_standby_open");
  } catch {
    return false;
  }
}

export function subscribeStandbyConfig(handler: (config: StandbyConfig) => void): () => void {
  let disposed = false;
  let unlistenTauri: (() => void) | null = null;

  listen<StandbyConfig>(STANDBY_CONFIG_EVENT, (event) => {
    if (!disposed && event.payload) {
      handler({ ...DEFAULT_STANDBY_CONFIG, ...event.payload });
    }
  })
    .then((fn) => {
      if (disposed) fn();
      else unlistenTauri = fn;
    })
    .catch(() => {});

  const unsubCross = listenCrossWindowEvent<StandbyConfig>(STANDBY_CONFIG_EVENT, (detail) => {
    if (!disposed && detail) {
      handler({ ...DEFAULT_STANDBY_CONFIG, ...detail });
    }
  });

  return () => {
    disposed = true;
    unsubCross();
    if (unlistenTauri) unlistenTauri();
  };
}

export function isNightShiftActive(mode: StandbyNightMode, now: Date): boolean {
  if (mode === "always") return true;
  if (mode === "off") return false;
  const hour = now.getHours();
  return hour >= 21 || hour < 6;
}
