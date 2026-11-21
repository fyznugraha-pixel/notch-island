import { StandbyConfig } from "../../services/standbyService";

export type StandbyClockTickConfig = Pick<
  StandbyConfig,
  "active_screen" | "left_widget" | "show_seconds"
>;

export type StandbyMediaVisibilityConfig = Pick<
  StandbyConfig,
  "active_screen" | "right_widget"
>;

export function standbyNeedsSecondTicks(config: StandbyClockTickConfig): boolean {
  if (!config.show_seconds) return false;
  if (config.active_screen === "clock") return true;
  if (config.active_screen === "widgets") {
    return config.left_widget === "clock_analog" || config.left_widget === "clock_digital";
  }
  return false;
}

export function computeNextClockDelayMs(nowMs: number, needsSeconds: boolean): number {
  const safeNow = Number.isFinite(nowMs) && nowMs >= 0 ? nowMs : 0;
  if (needsSeconds) {
    const remainder = safeNow % 1000;
    return Math.max(100, 1000 - remainder + 15);
  }
  const remainder = safeNow % 60_000;
  return Math.max(1000, 60_000 - remainder + 25);
}

export function isStandbyMediaSurfaceVisible(config: StandbyMediaVisibilityConfig): boolean {
  return (
    config.active_screen === "media" ||
    (config.active_screen === "widgets" && config.right_widget === "media")
  );
}

export function standbyLyricsTickIntervalMs(
  lyricsSynced: boolean,
  deepEcoActive: boolean,
): number {
  if (deepEcoActive) return 1000;
  return lyricsSynced ? 120 : 500;
}

export function shouldStepStandbyColon(
  showSeconds: boolean,
  reducedMotion: boolean,
  deepEcoActive: boolean,
): boolean {
  return showSeconds && !reducedMotion && !deepEcoActive;
}
