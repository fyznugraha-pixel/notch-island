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

const TRIGGERED_STORAGE_KEY_PREFIX = "island_prayer_triggered_";

function loadTriggeredKeys(todayKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${TRIGGERED_STORAGE_KEY_PREFIX}${todayKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {}
  return new Set();
}

function persistTriggeredKeys(todayKey: string, keys: Set<string>) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(TRIGGERED_STORAGE_KEY_PREFIX) && k !== `${TRIGGERED_STORAGE_KEY_PREFIX}${todayKey}`) {
        localStorage.removeItem(k);
      }
    }
    localStorage.setItem(
      `${TRIGGERED_STORAGE_KEY_PREFIX}${todayKey}`,
      JSON.stringify(Array.from(keys))
    );
  } catch {}
}

export function usePrayerReminder({
  isFocusMode,
  onTriggerToast,
}: UsePrayerReminderOptions) {
  const [schedule, setSchedule] = useState<PrayerScheduleData>(() =>
    getImmediatePrayerSchedule()
  );
  const currentTodayKeyRef = useRef<string>(getTodayDateKey());
  const triggeredSetRef = useRef<Set<string>>(loadTriggeredKeys(currentTodayKeyRef.current));

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

      if (currentTodayKeyRef.current !== todayKey) {
        currentTodayKeyRef.current = todayKey;
        triggeredSetRef.current = loadTriggeredKeys(todayKey);
      }

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

        // 1. Pre-reminder (e.g., 10 minutes before prayer time).
        // 1-minute window to handle polling interval jitter.
        if (
          settings.preReminderEnabled &&
          diff <= settings.preReminderMinutes &&
          diff >= settings.preReminderMinutes - 1
        ) {
          const preKey = `${todayKey}_${prayerId}_pre_${settings.preReminderMinutes}`;
          if (!triggeredSetRef.current.has(preKey)) {
            triggeredSetRef.current.add(preKey);
            persistTriggeredKeys(todayKey, triggeredSetRef.current);
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

        // 2. Exact Prayer Time (Adzan time).
        // Tight 1-minute window so waking up or booting after adzan time never fires late.
        if (diff <= 0 && diff >= -1) {
          const exactKey = `${todayKey}_${prayerId}_exact`;
          if (!triggeredSetRef.current.has(exactKey)) {
            triggeredSetRef.current.add(exactKey);
            persistTriggeredKeys(todayKey, triggeredSetRef.current);
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
