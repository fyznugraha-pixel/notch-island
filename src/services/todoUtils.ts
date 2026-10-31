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
}

export function computeNextRepeatDue(baseMs: number, rule: TodoRepeatRule): number {
  const now = Date.now();
  const d = new Date(baseMs);
  const targetHour = d.getHours();
  const targetMin = d.getMinutes();
  const targetSec = d.getSeconds();

  if (rule === "daily") {
    d.setDate(d.getDate() + 1);
    while (d.getTime() < now) {
      d.setDate(d.getDate() + 1);
    }
  } else if (rule === "weekdays") {
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getDay() === 0 || d.getDay() === 6 || d.getTime() < now);
  } else if (rule === "weekly") {
    d.setDate(d.getDate() + 7);
    while (d.getTime() < now) {
      d.setDate(d.getDate() + 7);
    }
  } else if (rule === "monthly") {
    d.setMonth(d.getMonth() + 1);
    while (d.getTime() < now) {
      d.setMonth(d.getMonth() + 1);
    }
  }
  d.setHours(targetHour, targetMin, targetSec, 0);
  return d.getTime();
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

