import { useEffect, useRef, useCallback } from "react";
import {
  loadWaterData,
  saveWaterData,
  getDailyIntake,
  getStreakInfo,
  getLogicalDateKey,
} from "../services/waterService";
import type { WaterToastType } from "../components/ui/water/WaterNotchToast";

interface UseWaterReminderOptions {
  isFocusMode: boolean;
  onTriggerToast: (toast: { type: WaterToastType; amount?: number }) => void;
}

export function useWaterReminder({ isFocusMode, onTriggerToast }: UseWaterReminderOptions) {
  const lastDrinkReminderRef = useRef<number>(0);
  const warnedStreakDateRef = useRef<string>("");

  const checkReminders = useCallback(() => {
    try {
      const data = loadWaterData();
      if (!data.settings.reminderEnabled) return;

      // Honor Focus Mode DND if enabled
      if (data.settings.dndFocus && isFocusMode) return;

      const now = new Date();
      const currentMs = now.getTime();

      // Check active snooze
      if (data.snoozedUntil && currentMs < data.snoozedUntil) {
        return;
      }

      const currentHour = now.getHours();

      // Check active hours (e.g. 08:00 to 21:00)
      if (
        currentHour < data.settings.activeStartHour ||
        currentHour >= data.settings.activeEndHour
      ) {
        return;
      }

      // Check Streak Threatened (last 3 hours of active window)
      const isNearEndOfDay = currentHour >= data.settings.activeEndHour - 3;
      const todayKey = getLogicalDateKey(currentMs, data.settings.dayStartHour);

      if (isNearEndOfDay && warnedStreakDateRef.current !== todayKey) {
        const daily = getDailyIntake(now, data);
        const streakInfo = getStreakInfo(data);
        const streakGoal = (data.settings.dailyTargetMl * data.settings.streakThresholdPercent) / 100;
        if (streakInfo.currentStreak > 0 && daily.totalMl < streakGoal) {
          warnedStreakDateRef.current = todayKey;
          onTriggerToast({
            type: "streak_threatened",
            amount: data.settings.defaultCupMl,
          });
          return;
        }
      }

      // Check Interval Drink Reminder
      const intervalMs = data.settings.reminderIntervalHours * 60 * 60 * 1000;
      const baseMs = data.lastDrinkTimestamp || (currentMs - intervalMs - 1000);

      // Minimum 10 minute cooldown between consecutive popups so it doesn't spam
      const cooldownMs = Math.max(10 * 60 * 1000, (data.settings.snoozeDurationMinutes || 10) * 60 * 1000);

      if (
        currentMs - baseMs >= intervalMs &&
        currentMs - lastDrinkReminderRef.current >= cooldownMs
      ) {
        lastDrinkReminderRef.current = currentMs;
        onTriggerToast({
          type: "time_to_drink",
          amount: data.settings.defaultCupMl,
        });
      }
    } catch (err) {
      console.error("Water reminder check error:", err);
    }
  }, [isFocusMode, onTriggerToast]);

  const snooze = useCallback((minutes?: number) => {
    const data = loadWaterData();
    const duration = minutes ?? data.settings.snoozeDurationMinutes ?? 10;
    data.snoozedUntil = Date.now() + duration * 60 * 1000;
    saveWaterData(data);
  }, []);

  useEffect(() => {
    // Initial check after 3 seconds
    const initialTimer = setTimeout(checkReminders, 3000);
    // Recurring check every 30 seconds
    const interval = setInterval(checkReminders, 30_000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [checkReminders]);

  return {
    snooze,
    checkReminders,
  };
}
