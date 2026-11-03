import { t } from "./i18n";

export type TodoRepeatRule = "none" | "daily" | "weekdays" | "weekly" | "monthly";

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  dueAt?: number | null;
  reminders?: number[];
  remindedOffsets?: number[];
  snoozedUntil?: number | null;
  repeat?: TodoRepeatRule;
  lastCompletedAt?: number | null;
  previousDueAt?: number | null;
}

export function computeNextRepeatDue(
  baseMs: number,
  rule: TodoRepeatRule,
  referenceMs: number = Date.now()
): number {
  const refDate = new Date(referenceMs);
  const endOfRefDay = new Date(
    refDate.getFullYear(),
    refDate.getMonth(),
    refDate.getDate(),
    23,
    59,
    59,
    999
  ).getTime();

  const d = new Date(baseMs);
  const targetHour = d.getHours();
  const targetMin = d.getMinutes();
  const targetSec = d.getSeconds();

  if (rule === "daily") {
    do {
      d.setDate(d.getDate() + 1);
      d.setHours(targetHour, targetMin, targetSec, 0);
    } while (d.getTime() <= endOfRefDay);
  } else if (rule === "weekdays") {
    do {
      d.setDate(d.getDate() + 1);
      d.setHours(targetHour, targetMin, targetSec, 0);
    } while (d.getDay() === 0 || d.getDay() === 6 || d.getTime() <= endOfRefDay);
  } else if (rule === "weekly") {
    do {
      d.setDate(d.getDate() + 7);
      d.setHours(targetHour, targetMin, targetSec, 0);
    } while (d.getTime() <= endOfRefDay);
  } else if (rule === "monthly") {
    const targetDay = d.getDate();
    do {
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(targetDay, daysInMonth));
      d.setHours(targetHour, targetMin, targetSec, 0);
    } while (d.getTime() <= endOfRefDay);
  }

  return d.getTime();
}

export function shouldRecurringTaskRollover(
  item: TodoItem,
  nowMs: number = Date.now()
): boolean {
  if (!item.completed || !item.repeat || item.repeat === "none") {
    return false;
  }

  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();

  // If completed today, never rollover today
  if (item.lastCompletedAt && item.lastCompletedAt >= startOfToday) {
    return false;
  }

  // If item has a specific due date computed for the next cycle
  if (item.dueAt) {
    const dueStartOfDay = new Date(item.dueAt);
    dueStartOfDay.setHours(0, 0, 0, 0);
    return startOfToday >= dueStartOfDay.getTime();
  }

  // Legacy completed recurring task with no lastCompletedAt
  if (!item.lastCompletedAt) {
    return true;
  }

  // If no dueAt was set:
  if (item.repeat === "daily") {
    return true;
  }

  if (item.repeat === "weekdays") {
    const day = now.getDay();
    return day !== 0 && day !== 6;
  }

  if (item.repeat === "weekly") {
    const nextDue = computeNextRepeatDue(item.lastCompletedAt, "weekly", item.lastCompletedAt);
    const nextDueStart = new Date(nextDue);
    nextDueStart.setHours(0, 0, 0, 0);
    return startOfToday >= nextDueStart.getTime();
  }

  if (item.repeat === "monthly") {
    const nextDue = computeNextRepeatDue(item.lastCompletedAt, "monthly", item.lastCompletedAt);
    const nextDueStart = new Date(nextDue);
    nextDueStart.setHours(0, 0, 0, 0);
    return startOfToday >= nextDueStart.getTime();
  }

  return false;
}

export function rolloverRecurringTasks(
  items: TodoItem[],
  nowMs: number = Date.now()
): { updated: TodoItem[]; changed: boolean } {
  let changed = false;
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();

  const updated = items.map((item) => {
    if (!shouldRecurringTaskRollover(item, nowMs)) {
      return item;
    }

    changed = true;
    let nextDue = item.dueAt;
    if (nextDue && nextDue < startOfToday) {
      const d = new Date(nextDue);
      nextDue = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        d.getHours(),
        d.getMinutes(),
        d.getSeconds(),
        0
      ).getTime();
    }

    return {
      ...item,
      completed: false,
      dueAt: nextDue,
      lastCompletedAt: null,
      previousDueAt: null,
    };
  });

  return { updated, changed };
}

export function getRepeatBadgeText(rule?: TodoRepeatRule): string {
  switch (rule) {
    case "daily":
      return t("todo_repeat_badge_daily");
    case "weekdays":
      return t("todo_repeat_badge_weekdays");
    case "weekly":
      return t("todo_repeat_badge_weekly");
    case "monthly":
      return t("todo_repeat_badge_monthly");
    default:
      return "";
  }
}

export function getRepeatLabel(rule?: TodoRepeatRule): string {
  switch (rule) {
    case "daily":
      return t("todo_repeat_daily");
    case "weekdays":
      return t("todo_repeat_weekdays");
    case "weekly":
      return t("todo_repeat_weekly");
    case "monthly":
      return t("todo_repeat_monthly");
    default:
      return t("todo_repeat_none");
  }
}
