import { t } from "./i18n";
import { emitCrossWindowEvent } from "../utils/crossWindowSync";

export const TODO_STORAGE_KEY = "island_todo_list";
const LEGACY_NAVBAR_TODOS_KEY = "gili_todos";

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
      if (item.repeat && item.repeat !== "none") {
        nextDue = computeNextRepeatDue(nextDue, item.repeat, startOfToday - 1);
      } else {
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

function isLegacyDummyTodo(item: { id?: unknown; text?: unknown }): boolean {
  const id = typeof item.id === "string" ? item.id : "";
  const text = typeof item.text === "string" ? item.text.trim() : "";
  if (id === "td_1" && (text === "Tubes SIA BAB 1" || text === "Review project milestones")) {
    return true;
  }
  if (id === "td_2" && (text === "Kirim laporan mingguan" || text === "Send weekly report")) {
    return true;
  }
  return false;
}

export function loadCanonicalTodos(): TodoItem[] {
  let list: TodoItem[] = [];
  let dirty = false;

  try {
    const raw = localStorage.getItem(TODO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed;
      }
    }
  } catch {
    list = [];
  }

  try {
    const legacyRaw = localStorage.getItem(LEGACY_NAVBAR_TODOS_KEY);
    if (legacyRaw !== null) {
      localStorage.removeItem(LEGACY_NAVBAR_TODOS_KEY);
      const parsedLegacy = JSON.parse(legacyRaw);
      if (Array.isArray(parsedLegacy)) {
        const existingIds = new Set(list.map((t) => t.id));
        const existingTexts = new Set(list.map((t) => t.text.trim().toLowerCase()));
        const migrated: TodoItem[] = [];
        for (const item of parsedLegacy) {
          if (!item || typeof item !== "object" || isLegacyDummyTodo(item)) continue;
          const text = typeof item.text === "string" ? item.text.trim() : "";
          if (!text) continue;
          const id =
            typeof item.id === "string" && item.id
              ? item.id
              : `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          if (existingIds.has(id) || existingTexts.has(text.toLowerCase())) continue;
          migrated.push({
            id,
            text,
            completed: Boolean(item.completed),
            createdAt: Date.now(),
            dueAt: null,
            reminders: [],
          });
          existingIds.add(id);
          existingTexts.add(text.toLowerCase());
        }
        if (migrated.length > 0) {
          list = [...migrated, ...list];
          dirty = true;
        }
      }
    }
  } catch {}

  const { updated, changed } = rolloverRecurringTasks(list);
  if (dirty || changed) {
    try {
      localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }
  return updated;
}

export function saveCanonicalTodos(items: TodoItem[]): void {
  try {
    localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(items));
  } catch {}
  emitCrossWindowEvent("gili_todos_updated");
}

export function addCanonicalTodo(text: string): TodoItem[] {
  const trimmed = text.trim();
  const current = loadCanonicalTodos();
  if (!trimmed) return current;
  const newItem: TodoItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text: trimmed,
    completed: false,
    createdAt: Date.now(),
    dueAt: null,
    reminders: [],
  };
  const updated = [newItem, ...current];
  saveCanonicalTodos(updated);
  return updated;
}

export function toggleCanonicalTodo(id: string): TodoItem[] {
  const current = loadCanonicalTodos();
  const target = current.find((i) => i.id === id);
  if (!target) return current;

  const updated = current.map((i) => {
    if (i.id !== id) return i;
    if (i.repeat && i.repeat !== "none") {
      if (!i.completed) {
        const nextDueAt = i.dueAt ? computeNextRepeatDue(i.dueAt, i.repeat) : null;
        return {
          ...i,
          completed: true,
          lastCompletedAt: Date.now(),
          previousDueAt: i.dueAt ?? null,
          dueAt: nextDueAt,
        };
      }
      return {
        ...i,
        completed: false,
        lastCompletedAt: null,
        dueAt: i.previousDueAt !== undefined ? i.previousDueAt : i.dueAt,
        previousDueAt: null,
      };
    }
    return { ...i, completed: !i.completed };
  });

  saveCanonicalTodos(updated);
  return updated;
}

export function deleteCanonicalTodo(id: string): TodoItem[] {
  const updated = loadCanonicalTodos().filter((item) => item.id !== id);
  saveCanonicalTodos(updated);
  return updated;
}
