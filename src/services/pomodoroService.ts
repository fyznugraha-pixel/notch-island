export type PomodoroMode = "focus" | "short_break" | "long_break";

export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  sessionsPerCycle: number;
  autoStartNext: boolean;
  soundOnComplete: boolean;
  showIdleTimer: boolean;
  muteNotifsOnFocus: boolean;
}

export interface PomodoroDailyStats {
  dateKey: string;
  completedSessions: number;
  focusMinutesToday: number;
}

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsPerCycle: 4,
  autoStartNext: false,
  soundOnComplete: true,
  showIdleTimer: true,
  muteNotifsOnFocus: false,
};

const SETTINGS_KEY = "gili_pomodoro_settings";
const STATS_KEY = "gili_pomodoro_daily_stats";

function getTodayDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

export function loadPomodoroSettings(): PomodoroSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_POMODORO_SETTINGS;
    return { ...DEFAULT_POMODORO_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_POMODORO_SETTINGS;
  }
}

export function savePomodoroSettings(settings: PomodoroSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export function loadPomodoroDailyStats(): PomodoroDailyStats {
  const today = getTodayDateKey();
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const parsed: PomodoroDailyStats = JSON.parse(raw);
      if (parsed.dateKey === today) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { dateKey: today, completedSessions: 0, focusMinutesToday: 0 };
}

export function recordCompletedFocusSession(durationMinutes: number): PomodoroDailyStats {
  const current = loadPomodoroDailyStats();
  const updated: PomodoroDailyStats = {
    dateKey: getTodayDateKey(),
    completedSessions: current.completedSessions + 1,
    focusMinutesToday: current.focusMinutesToday + durationMinutes,
  };
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export const recordPomodoroSession = recordCompletedFocusSession;

export function getModeDurationSeconds(mode: PomodoroMode, settings: PomodoroSettings): number {
  if (mode === "short_break") return Math.max(1, settings.shortBreakMinutes) * 60;
  if (mode === "long_break") return Math.max(1, settings.longBreakMinutes) * 60;
  return Math.max(1, settings.focusMinutes) * 60;
}

export function formatPomodoroTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export const formatSecondsMMSS = formatPomodoroTime;
