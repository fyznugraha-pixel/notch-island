import { useState, useEffect, useRef, useCallback } from "react";
import { TodoItem } from "../components/ui/TodoListPanel";
import { playReminderSound } from "../services/soundService";

export interface TodoDeadlineAlert {
  task: TodoItem;
  diffMinutes: number;
  triggeredOffset: number;
}

export interface IdleUrgentTodo {
  task: TodoItem;
  diffMinutes: number;
}

const FIRED_REMINDERS_KEY = "gili_fired_todo_reminders";

function loadFiredReminders(): Set<string> {
  try {
    const raw = sessionStorage.getItem(FIRED_REMINDERS_KEY);
    if (raw) {
      return new Set(JSON.parse(raw));
    }
  } catch {}
  return new Set();
}

function saveFiredReminders(set: Set<string>) {
  try {
    sessionStorage.setItem(FIRED_REMINDERS_KEY, JSON.stringify(Array.from(set).slice(-200)));
  } catch {}
}

export function useTodoReminders(
  todoItems: TodoItem[],
  muteNotifs: boolean,
  onCompleteTask: (id: string) => void,
  onNotifyReminder?: (task: TodoItem, offset: number) => void
) {
  const [deadlineAlert, setDeadlineAlert] = useState<TodoDeadlineAlert | null>(null);
  const [snoozedUntilMap, setSnoozedUntilMap] = useState<Record<string, number>>({});
  const firedSetRef = useRef<Set<string>>(loadFiredReminders());

  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();

      if (muteNotifs) return;

      for (const item of todoItems) {
        if (item.completed || !item.dueAt) continue;

        const snoozedTarget = snoozedUntilMap[item.id];
        if (snoozedTarget) {
          if (now >= snoozedTarget) {
            setSnoozedUntilMap((prev) => {
              const next = { ...prev };
              delete next[item.id];
              return next;
            });
            const diffMin = Math.round((item.dueAt - now) / 60000);
            playReminderSound();
            if (onNotifyReminder) {
              onNotifyReminder(item, Math.max(0, diffMin));
            }
            break;
          }
          continue;
        }

        const offsets = item.reminders && item.reminders.length > 0 ? item.reminders : [0, 10];
        const diffMs = item.dueAt - now;
        const diffMinutes = Math.ceil(diffMs / 60000);

        for (const offset of offsets) {
          const key = `${item.id}_${item.dueAt}_${offset}`;
          if (firedSetRef.current.has(key)) continue;

          // Trigger if within [offset - 1, offset] minutes window
          if (diffMinutes <= offset && diffMinutes >= offset - 2) {
            firedSetRef.current.add(key);
            saveFiredReminders(firedSetRef.current);
            playReminderSound();
            if (onNotifyReminder) {
              onNotifyReminder(item, offset);
            }
            return;
          }
        }
      }
    };

    checkReminders();
    const interval = window.setInterval(checkReminders, 5000);

    return () => clearInterval(interval);
  }, [todoItems, muteNotifs, snoozedUntilMap, onNotifyReminder]);

  // Clear alert if the task was completed or deleted
  useEffect(() => {
    if (!deadlineAlert) return;
    const found = todoItems.find((t) => t.id === deadlineAlert.task.id);
    if (!found || found.completed) {
      setDeadlineAlert(null);
    }
  }, [todoItems, deadlineAlert]);

  const snoozeDeadlineAlert = useCallback((minutes: number = 10) => {
    if (!deadlineAlert) return;
    const taskId = deadlineAlert.task.id;
    setSnoozedUntilMap((prev) => ({
      ...prev,
      [taskId]: Date.now() + minutes * 60000,
    }));
    setDeadlineAlert(null);
  }, [deadlineAlert]);

  const completeDeadlineAlertTask = useCallback(() => {
    if (!deadlineAlert) return;
    onCompleteTask(deadlineAlert.task.id);
    setDeadlineAlert(null);
  }, [deadlineAlert, onCompleteTask]);

  const dismissDeadlineAlert = useCallback(() => {
    setDeadlineAlert(null);
  }, []);

  return {
    deadlineAlert,
    idleUrgentTodo: null as IdleUrgentTodo | null,
    snoozeDeadlineAlert,
    completeDeadlineAlertTask,
    dismissDeadlineAlert,
  };
}
