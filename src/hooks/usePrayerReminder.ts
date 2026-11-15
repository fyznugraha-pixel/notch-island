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
  enabled?: boolean;
  isFocusMode: boolean;
  onTriggerToast: (toast: PrayerToastPayload) => void;
  isSecondary?: boolean;
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
  enabled = true,
  isFocusMode,
  onTriggerToast,
  isSecondary = false,
}: UsePrayerReminderOptions) {
  const [schedule, setSchedule] = useState<PrayerScheduleData>(() =>
    getImmediatePrayerSchedule()
  );
  const scheduleRef = useRef<PrayerScheduleData>(schedule);
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);
  const currentTodayKeyRef = useRef<string>(getTodayDateKey());
  const triggeredSetRef = useRef<Set<string>>(loadTriggeredKeys(currentTodayKeyRef.current));
  const refreshingDateKeyRef = useRef<string | null>(null);

  const refreshSchedule = useCallback(async (force = false) => {
    try {
      const next = await fetchPrayerSchedule(force);
      setSchedule(next);
    } catch {}
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!isSecondary) {
      refreshSchedule(false);
    } else {
      setSchedule(getImmediatePrayerSchedule());
    }
    const unsubLoc = subscribeWeatherChange(() => {
      if (!isSecondary) {
        refreshSchedule(true);
      } else {
        setSchedule(getImmediatePrayerSchedule());
      }
    });
    const handlePrayerUpdate = () => {
      if (isSecondary) {
        setSchedule(getImmediatePrayerSchedule());
        return;
      }
      const latestSettings = loadPrayerSettings();
      if (
        scheduleRef.current.calculationMethod &&
        scheduleRef.current.calculationMethod !== latestSettings.calculationMethod
      ) {
        refreshSchedule(false);
      }
    };
    window.addEventListener("gili_prayer_updated", handlePrayerUpdate);
    return () => {
      unsubLoc();
      window.removeEventListener("gili_prayer_updated", handlePrayerUpdate);
    };
  }, [refreshSchedule, enabled, isSecondary]);

  const checkPrayerTimes = useCallback(() => {
    try {
      if (!enabled) return;
      const settings = loadPrayerSettings();
      if (!settings.reminderEnabled) return;
      if (settings.dndFocus && isFocusMode) return;

      const now = new Date();
      const todayKey = getTodayDateKey(now);

      if (currentTodayKeyRef.current !== todayKey) {
        currentTodayKeyRef.current = todayKey;
        triggeredSetRef.current = loadTriggeredKeys(todayKey);
      }

      let activeSchedule = scheduleRef.current;
      if (activeSchedule.dateKey !== todayKey) {
        // Immediately switch to today's synchronous/cached schedule instead of checking yesterday's timings
        activeSchedule = getImmediatePrayerSchedule();
        setSchedule(activeSchedule);
        if (!isSecondary && refreshingDateKeyRef.current !== todayKey) {
          refreshingDateKeyRef.current = todayKey;
          refreshSchedule(false).finally(() => {
            if (refreshingDateKeyRef.current === todayKey) {
              refreshingDateKeyRef.current = null;
            }
          });
        }
        if (activeSchedule.dateKey !== todayKey) {
          return;
        }
      }

      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      for (const prayerId of PRAYER_ORDER) {
        if (!settings.enabledPrayers[prayerId]) continue;

        const timeStr = activeSchedule.timings[prayerId];
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
            if (!isSecondary) {
              persistTriggeredKeys(todayKey, triggeredSetRef.current);
            }
            onTriggerToast({
              type: "pre_reminder",
              prayerId,
              prayerTime: timeStr,
              minutesLeft: settings.preReminderMinutes,
              locationName: activeSchedule.locationName,
            });
            return;
          }
        }

        // 2. Exact Prayer Time (Adzan time).
        // Tight 1-minute window so waking up or booting after adzan time never fires late.
        const shouldNotifyAtAdzan =
          settings.alsoAtAdzan !== false || !settings.preReminderEnabled;
        if (shouldNotifyAtAdzan && diff <= 0 && diff >= -1) {
          const exactKey = `${todayKey}_${prayerId}_exact`;
          if (!triggeredSetRef.current.has(exactKey)) {
            triggeredSetRef.current.add(exactKey);
            if (!isSecondary) {
              persistTriggeredKeys(todayKey, triggeredSetRef.current);
            }
            onTriggerToast({
              type: "prayer_time",
              prayerId,
              prayerTime: timeStr,
              locationName: activeSchedule.locationName,
            });
            return;
          }
        }
      }
    } catch (err) {
      console.error("Prayer reminder check error:", err);
    }
  }, [isFocusMode, onTriggerToast, refreshSchedule, enabled, isSecondary]);

  useEffect(() => {
    if (!enabled) return;
    const initialTimer = setTimeout(checkPrayerTimes, 2500);
    const interval = setInterval(checkPrayerTimes, 15_000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [checkPrayerTimes, enabled]);

  return {
    schedule,
    refreshSchedule,
  };
}
