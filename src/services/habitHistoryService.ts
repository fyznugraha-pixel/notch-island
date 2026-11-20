export interface HabitStreakRecord {
  title: string;
  count: number;
  lastCheckedDate: string | null;
  history: Record<string, number>;
}

export const HABIT_STREAK_STORAGE_KEY = "gili_habit_streak_v2";

/**
 * Backward-compatible loader: preserves v2 fields (title, count, lastCheckedDate)
 * and initializes daily `history` map without fabricating past dates.
 */
export function parseHabitStreakRecord(
  raw: unknown,
  defaultTitle: string
): HabitStreakRecord {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title =
    typeof obj.title === "string" && obj.title.trim() ? obj.title : defaultTitle;
  const count =
    typeof obj.count === "number" && Number.isFinite(obj.count) && obj.count >= 0
      ? Math.floor(obj.count)
      : 0;
  const lastCheckedDate =
    typeof obj.lastCheckedDate === "string" && obj.lastCheckedDate.trim()
      ? obj.lastCheckedDate
      : null;

  const history: Record<string, number> = {};
  if (obj.history && typeof obj.history === "object" && !Array.isArray(obj.history)) {
    for (const [k, v] of Object.entries(obj.history as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        history[k] = Math.floor(v);
      }
    }
  }
  if (lastCheckedDate && history[lastCheckedDate] === undefined && count > 0) {
    history[lastCheckedDate] = 1;
  }

  return { title, count, lastCheckedDate, history };
}

export function applyHabitToggleForDate(
  current: HabitStreakRecord,
  todayKey: string,
  yesterdayKey: string
): HabitStreakRecord {
  const checkedToday = current.lastCheckedDate === todayKey;
  const nextHistory = { ...current.history };

  if (checkedToday) {
    delete nextHistory[todayKey];
    return {
      ...current,
      count: Math.max(0, current.count - 1),
      lastCheckedDate: current.count > 1 ? yesterdayKey : null,
      history: nextHistory,
    };
  }

  nextHistory[todayKey] = (nextHistory[todayKey] ?? 0) + 1;
  return {
    ...current,
    count: current.count + 1,
    lastCheckedDate: todayKey,
    history: nextHistory,
  };
}
