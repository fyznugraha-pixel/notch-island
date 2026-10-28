import { useEffect, useRef, useState, useCallback } from "react";
import {
  PrayerScheduleData,
  PrayerToastPayload,
  PRAYER_ORDER,
  fetchPrayerSchedule,
  getImmediatePrayerSchedule,
  getTodayDateKey,
  loadPrayerSettings,
  timeStringToMinutes,
} from "../services/prayerService";
import { subscribeWeatherChange } from "../services/weatherService";

interface UsePrayerReminderOptions {
  isFocusMode: boolean;
  onTriggerToast: (toast: PrayerToastPayload) => void;
}

export function usePrayerReminder({
  isFocusMode,
  onTriggerToast,
}: UsePrayerReminderOptions) {
  const [schedule, setSchedule] = useState<PrayerScheduleData>(() =>
    getImmediatePrayerSchedule()
  );
  const triggeredSetRef = useRef<Set<string>>(new Set());

  const refreshSchedule = useCallback(async (force = false) => {
    try {
      const next = await fetchPrayerSchedule(force);
      setSchedule(next);
    } catch {}
  }, []);

  useEffect(() => {
    refreshSchedule(false);
    const unsubLoc = subscribeWeatherChange(() => {
      refreshSchedule(true);
    });
    const handlePrayerUpdate = () => {
      refreshSchedule(false);
    };
    window.addEventListener("gili_prayer_updated", handlePrayerUpdate);
    return () => {
      unsubLoc();
      window.removeEventListener("gili_prayer_updated", handlePrayerUpdate);
    };
  }, [refreshSchedule]);

  const checkPrayerTimes = useCallback(() => {
    try {
      const settings = loadPrayerSettings();
      if (!settings.reminderEnabled) return;
      if (settings.dndFocus && isFocusMode) return;

      const now = new Date();
      const todayKey = getTodayDateKey(now);

      if (schedule.dateKey !== todayKey) {
        refreshSchedule(true);
      }

      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      for (const prayerId of PRAYER_ORDER) {
        if (!settings.enabledPrayers[prayerId]) continue;

        const timeStr = schedule.timings[prayerId];
        if (!timeStr) continue;

        const targetMinutes = timeStringToMinutes(timeStr);
        const diff = targetMinutes - currentMinutes;

        // 1. Pre-reminder (e.g., 10 minutes before prayer time)
        if (
          settings.preReminderEnabled &&
          diff === settings.preReminderMinutes
        ) {
          const preKey = `${todayKey}_${prayerId}_pre_${settings.preReminderMinutes}`;
          if (!triggeredSetRef.current.has(preKey)) {
            triggeredSetRef.current.add(preKey);
            onTriggerToast({
              type: "pre_reminder",
              prayerId,
              prayerTime: timeStr,
              minutesLeft: settings.preReminderMinutes,
              locationName: schedule.locationName,
            });
            return;
          }
        }

        // 2. Exact Prayer Time (Adzan time)
        if (diff === 0) {
          const exactKey = `${todayKey}_${prayerId}_exact`;
          if (!triggeredSetRef.current.has(exactKey)) {
            triggeredSetRef.current.add(exactKey);
            onTriggerToast({
              type: "prayer_time",
              prayerId,
              prayerTime: timeStr,
              locationName: schedule.locationName,
            });
            return;
          }
        }
      }
    } catch (err) {
      console.error("Prayer reminder check error:", err);
    }
  }, [isFocusMode, onTriggerToast, refreshSchedule, schedule]);

  useEffect(() => {
    const initialTimer = setTimeout(checkPrayerTimes, 2500);
    const interval = setInterval(checkPrayerTimes, 15_000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [checkPrayerTimes]);

  return {
    schedule,
    refreshSchedule,
  };
}
