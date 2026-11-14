import { useEffect, useRef, useCallback } from "react";
import {
  loadWaterData,
  saveWaterData,
  getDailyIntake,
  getStreakInfo,
  getLogicalDateKey,
  isHourInActiveWindow,
  isNearEndOfActiveWindow,
} from "../services/waterService";
import type { WaterToastType } from "../components/ui/water/WaterNotchToast";

interface UseWaterReminderOptions {
  enabled?: boolean;
  isFocusMode: boolean;
  onTriggerToast: (toast: { type: WaterToastType; amount?: number }) => void;
}

export function useWaterReminder({ enabled = true, isFocusMode, onTriggerToast }: UseWaterReminderOptions) {
  const lastDrinkReminderRef = useRef<number>(0);
  const warnedStreakDateRef = useRef<string>("");
  const noDrinkBaselineRef = useRef<number | null>(null);

  const checkReminders = useCallback(() => {
    try {
      if (!enabled) {
        noDrinkBaselineRef.current = null;
        return;
      }
      const data = loadWaterData();
      if (!data.settings.reminderEnabled) {
        noDrinkBaselineRef.current = null;
        return;
      }

      // Honor Focus Mode DND if enabled
      if (data.settings.dndFocus && isFocusMode) return;

      const now = new Date();
      const currentMs = now.getTime();

      // Check active snooze
      if (data.snoozedUntil && currentMs < data.snoozedUntil) {
        return;
      }

      const currentHour = now.getHours();
      const { activeStartHour, activeEndHour } = data.settings;

      // Check active hours (supports both daytime and overnight windows)
      if (!isHourInActiveWindow(currentHour, activeStartHour, activeEndHour)) {
        return;
      }

      // Check Streak Threatened (last 3 hours of active window)
      const isNearEndOfDay = isNearEndOfActiveWindow(currentHour, activeStartHour, activeEndHour, 3);
      const todayKey = getLogicalDateKey(currentMs, data.settings.dayStartHour);

      if (
        isNearEndOfDay &&
        warnedStreakDateRef.current !== todayKey &&
        !(data.frozenDateKeys || []).includes(todayKey)
      ) {
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
      if (!data.lastDrinkTimestamp) {
        // First boot / empty history: start waiting a full interval instead of firing immediately.
        if (noDrinkBaselineRef.current === null) {
          noDrinkBaselineRef.current = currentMs;
        }
      } else {
        noDrinkBaselineRef.current = null;
      }
      const baseMs = data.lastDrinkTimestamp ?? noDrinkBaselineRef.current ?? currentMs;

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
  }, [enabled, isFocusMode, onTriggerToast]);

  const snooze = useCallback((minutes?: number) => {
    const data = loadWaterData();
    const duration = minutes ?? data.settings.snoozeDurationMinutes ?? 10;
    data.snoozedUntil = Date.now() + duration * 60 * 1000;
    saveWaterData(data);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Initial check after 3 seconds
    const initialTimer = setTimeout(checkReminders, 3000);
    // Recurring check every 30 seconds
    const interval = setInterval(checkReminders, 30_000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [checkReminders, enabled]);

  return {
    snooze,
    checkReminders,
  };
}
