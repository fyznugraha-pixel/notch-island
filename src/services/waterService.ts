/**
 * Water Reminder & Hydration Tracking Service
 * Handles data persistence, streak tracking, and reminder schedules.
 */

import { getLanguage } from "./i18n.ts";

export interface WaterIntakeRecord {
  id: string;
  timestamp: number; // Unix ms
  amountMl: number;
  isManual?: boolean;
}

export interface WaterSettings {
  dailyTargetMl: number; // e.g. 3000 (3.0 L)
  defaultCupMl: number; // e.g. 250
  unit: "ml" | "oz"; // 1 oz ≈ 29.5735 ml
  dayStartHour: number; // default: 3 (03:00)
  reminderEnabled: boolean; // default: false
  reminderIntervalHours: number; // default: 2 (1, 1.5, 2, 3)
  activeStartHour: number; // default: 8 (08:00)
  activeEndHour: number; // default: 21 (21:00)
  dndFocus: boolean; // default: true
  snoozeDurationMinutes: number; // default: 10 (5, 10, 15)
  streakThresholdPercent: number; // default: 80 (50, 75, 80, 100)
  autoUseFreeze: boolean; // default: true
  freezeCount: number; // default: 1 (max: 2)
}

export const STREAK_CHECKPOINTS = [3, 10, 30, 50, 100, 150, 200, 250, 300, 365];

const getDayLabels = () =>
  getLanguage() === "en"
    ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const getMonthNamesShort = () =>
  getLanguage() === "en"
    ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    : ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const getMonthNamesFull = () =>
  getLanguage() === "en"
    ? [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ]
    : [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
      ];

export interface StreakCelebrationEvent {
  type: "streak_opened" | "checkpoint_reached";
  streakDays: number;
}

export type WaterToastType =
  | "time_to_drink"
  | "logged"
  | "streak_threatened"
  | "streak_increased";

export interface WaterData {
  records: WaterIntakeRecord[];
  settings: WaterSettings;
  snoozedUntil: number | null;
  bestStreakDays: number;
  lastDrinkTimestamp: number | null;
  lastUndoneRecord: WaterIntakeRecord | null;
  celebratedMilestones: number[];
}

const STORAGE_KEY = "gili_water_data";

export const DEFAULT_WATER_SETTINGS: WaterSettings = {
  dailyTargetMl: 3000,
  defaultCupMl: 250,
  unit: "ml",
  dayStartHour: 3,
  reminderEnabled: false,
  reminderIntervalHours: 2,
  activeStartHour: 8,
  activeEndHour: 21,
  dndFocus: true,
  snoozeDurationMinutes: 10,
  streakThresholdPercent: 80,
  autoUseFreeze: true,
  freezeCount: 1,
};

function createInitialData(): WaterData {
  return {
    records: [],
    settings: DEFAULT_WATER_SETTINGS,
    snoozedUntil: null,
    bestStreakDays: 0,
    lastDrinkTimestamp: null,
    lastUndoneRecord: null,
    celebratedMilestones: [],
  };
}

export function loadWaterData(): WaterData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Clean out any mock/sample data previously seeded from templates
      const cleanRecords = (parsed.records || []).filter(
        (r: WaterIntakeRecord) =>
          typeof r.id === "string" &&
          !r.id.startsWith("sample-") &&
          !r.id.startsWith("past-")
      );
      const hadMockData = cleanRecords.length !== (parsed.records || []).length;

      const userConfigured =
        typeof window !== "undefined" &&
        localStorage.getItem("island_water_reminder_configured") === "true";

      const data: WaterData = {
        ...parsed,
        records: cleanRecords,
        bestStreakDays: hadMockData && parsed.bestStreakDays === 14 ? 0 : (parsed.bestStreakDays || 0),
        lastDrinkTimestamp: cleanRecords.length > 0 ? cleanRecords[0].timestamp : null,
        celebratedMilestones: parsed.celebratedMilestones || [],
        settings: {
          ...DEFAULT_WATER_SETTINGS,
          ...(parsed.settings || {}),
          reminderEnabled: userConfigured
            ? Boolean(parsed.settings?.reminderEnabled)
            : false,
        },
      };

      if (hadMockData) {
        saveWaterData(data);
      }
      return data;
    }
  } catch (err) {
    console.error("Failed to load water data:", err);
  }
  const initial = createInitialData();
  saveWaterData(initial);
  return initial;
}

export function saveWaterData(data: WaterData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("gili_water_changed", { detail: data }));
    }
  } catch (err) {
    console.error("Failed to save water data:", err);
  }
}

/**
 * Normalizes date to the user's custom "day start hour" (e.g., 03:00 rollover).
 */
export function getLogicalDateKey(timestamp: number, dayStartHour = 3): string {
  const d = new Date(timestamp);
  // If hour is before dayStartHour, consider it part of the previous day
  if (d.getHours() < dayStartHour) {
    d.setDate(d.getDate() - 1);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function logDrink(amountMl: number, isManual = false, timestamp?: number): {
  record: WaterIntakeRecord;
  celebration?: StreakCelebrationEvent;
  streakIncreased?: boolean;
  targetAchieved?: boolean;
} {
  const data = loadWaterData();
  const prevStreak = getStreakInfo(data).currentStreak;
  const prevDaily = getDailyIntake(new Date(), data);

  const record: WaterIntakeRecord = {
    id: `drink_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: timestamp || Date.now(),
    amountMl,
    isManual,
  };

  const updatedRecords = [record, ...data.records];
  const celebrated = [...(data.celebratedMilestones || [])];

  const intermediateData: WaterData = {
    ...data,
    records: updatedRecords,
    lastDrinkTimestamp: record.timestamp,
    snoozedUntil: null,
    lastUndoneRecord: null,
  };

  const newStreak = getStreakInfo(intermediateData).currentStreak;
  const newDaily = getDailyIntake(new Date(), intermediateData);

  const targetAchieved = !prevDaily.isTargetAchieved && newDaily.isTargetAchieved;
  const streakIncreased = newStreak > prevStreak;

  let celebration: StreakCelebrationEvent | undefined;

  // Case 1: First time starting streak (Day 1)
  if (prevStreak === 0 && newStreak >= 1 && !celebrated.includes(1)) {
    celebration = {
      type: "streak_opened",
      streakDays: newStreak,
    };
    celebrated.push(1);
  }
  // Case 2: Milestone checkpoint reached (3, 10, 30, 50, 100, 150, 200, etc.)
  else if (
    newStreak > prevStreak &&
    STREAK_CHECKPOINTS.includes(newStreak) &&
    !celebrated.includes(newStreak)
  ) {
    celebration = {
      type: "checkpoint_reached",
      streakDays: newStreak,
    };
    celebrated.push(newStreak);
  }

  const finalData: WaterData = {
    ...intermediateData,
    celebratedMilestones: celebrated,
    // Persist best-streak here (the write point), not inside the pure getter.
    bestStreakDays: Math.max(data.bestStreakDays, getStreakInfo(intermediateData).bestStreak),
  };

  saveWaterData(finalData);

  if (celebration && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("gili_streak_celebration", { detail: celebration })
    );
  }

  return { record, celebration, streakIncreased, targetAchieved };
}

export function useStreakFreeze(): boolean {
  const data = loadWaterData();
  if (data.settings.freezeCount <= 0) return false;
  const updated: WaterData = {
    ...data,
    settings: {
      ...data.settings,
      freezeCount: data.settings.freezeCount - 1,
    },
  };
  saveWaterData(updated);
  return true;
}

export function triggerWaterToast(type: WaterToastType, amount?: number): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("gili_trigger_water_toast", { detail: { type, amount } })
    );
  }
}

export function undoLastDrink(): boolean {
  const data = loadWaterData();
  if (data.records.length === 0) return false;

  const [last, ...rest] = data.records;
  const updatedData: WaterData = {
    ...data,
    records: rest,
    lastUndoneRecord: last,
    lastDrinkTimestamp: rest[0]?.timestamp || null,
  };
  saveWaterData(updatedData);
  return true;
}

export function deleteDrink(id: string): void {
  const data = loadWaterData();
  const updated = data.records.filter((r) => r.id !== id);
  const nextLastTimestamp = updated.length > 0 ? updated[0].timestamp : null;
  saveWaterData({ ...data, records: updated, lastDrinkTimestamp: nextLastTimestamp });
}

export function updateDrink(id: string, amountMl: number, timestamp: number): void {
  const data = loadWaterData();
  const updated = data.records.map((r) => (r.id === id ? { ...r, amountMl, timestamp } : r));
  updated.sort((a, b) => b.timestamp - a.timestamp);
  const nextLastTimestamp = updated.length > 0 ? updated[0].timestamp : null;
  saveWaterData({ ...data, records: updated, lastDrinkTimestamp: nextLastTimestamp });
}

export function updateWaterSettings(settingsUpdate: Partial<WaterSettings>): WaterSettings {
  if (typeof window !== "undefined" && settingsUpdate.reminderEnabled !== undefined) {
    try {
      localStorage.setItem("island_water_reminder_configured", "true");
    } catch {}
  }
  const data = loadWaterData();
  const newSettings = { ...data.settings, ...settingsUpdate };
  saveWaterData({ ...data, settings: newSettings });
  return newSettings;
}

export function resetAllWaterData(): void {
  const reset: WaterData = {
    records: [],
    settings: DEFAULT_WATER_SETTINGS,
    snoozedUntil: null,
    bestStreakDays: 0,
    celebratedMilestones: [],
    lastDrinkTimestamp: null,
    lastUndoneRecord: null,
  };
  saveWaterData(reset);
}

/**
 * Retrieves daily intake metrics for the logical day containing targetDate.
 */
export function getDailyIntake(targetDate = new Date(), dataOverride?: WaterData) {
  const data = dataOverride || loadWaterData();
  const dayStartHour = data.settings.dayStartHour;
  const targetKey = getLogicalDateKey(targetDate.getTime(), dayStartHour);

  const dayRecords = data.records.filter(
    (r) => getLogicalDateKey(r.timestamp, dayStartHour) === targetKey
  );

  const totalMl = dayRecords.reduce((acc, r) => acc + r.amountMl, 0);
  const targetMl = data.settings.dailyTargetMl;
  const streakThresholdMl = Math.round(targetMl * (data.settings.streakThresholdPercent / 100));
  const percent = targetMl > 0 ? Math.min(100, Math.round((totalMl / targetMl) * 100)) : 0;
  const isTargetAchieved = totalMl >= targetMl;
  const isStreakMaintained = totalMl >= streakThresholdMl;

  return {
    dateKey: targetKey,
    totalMl,
    totalL: totalMl / 1000,
    targetMl,
    targetL: targetMl / 1000,
    streakThresholdMl,
    streakThresholdL: streakThresholdMl / 1000,
    percent,
    isTargetAchieved,
    isStreakMaintained,
    records: dayRecords.sort((a, b) => a.timestamp - b.timestamp),
    drinkCount: dayRecords.length,
    averageDrinkMl: dayRecords.length > 0 ? Math.round(totalMl / dayRecords.length) : 0,
  };
}

/**
 * Calculates current consecutive streak and past 7 days history.
 */
export function getStreakInfo(dataOverride?: WaterData) {
  const data = dataOverride || loadWaterData();
  const dayStartHour = data.settings.dayStartHour;
  const now = new Date();
  const todayKey = getLogicalDateKey(now.getTime(), dayStartHour);

  // Group all records by logical date
  const dateTotals: Record<string, number> = {};
  for (const r of data.records) {
    const k = getLogicalDateKey(r.timestamp, dayStartHour);
    dateTotals[k] = (dateTotals[k] || 0) + r.amountMl;
  }

  const thresholdMl = Math.round(
    data.settings.dailyTargetMl * (data.settings.streakThresholdPercent / 100)
  );

  // Calculate streak looking backwards
  let currentStreak = 0;
  let cursor = new Date(now);

  // Check today first: logging any drink today activates today's streak
  const todayTotal = dateTotals[todayKey] || 0;
  const todayHasDrinks = todayTotal > 0;

  if (todayHasDrinks) {
    currentStreak++;
  }

  // Walk backwards day by day from yesterday
  cursor.setDate(cursor.getDate() - 1);
  let availableFreezes = data.settings.freezeCount;

  for (let i = 0; i < 365; i++) {
    const key = getLogicalDateKey(cursor.getTime(), dayStartHour);
    const dayTotal = dateTotals[key] || 0;

    if (dayTotal >= thresholdMl) {
      currentStreak++;
    } else {
      // Check if we can freeze
      if (data.settings.autoUseFreeze && availableFreezes > 0) {
        availableFreezes--;
        // Freeze sustains the streak but doesn't increment days count
      } else {
        break;
      }
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  // Pure read: never mutate the caller's object or persist here. Best-streak is
  // persisted at write points (logDrink) instead.
  const bestStreak = Math.max(data.bestStreakDays, currentStreak);

  // Generate 7-day display list:
  // - If streak is active (currentStreak > 0): follow the day the streak started ("ikutin hari dimana iya mulai")
  // - If streak hasn't started (currentStreak === 0): follow standard Windows system calendar week (Senin - Minggu)
  const dayLabels = getDayLabels();
  const sevenDayHistory = [];

  if (currentStreak > 0) {
    // Follow the start of the active streak cycle
    const streakOffset = Math.min(6, currentStreak - 1);
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - streakOffset);

    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const k = getLogicalDateKey(d.getTime(), dayStartHour);
      const amount = dateTotals[k] || 0;
      const percent = Math.min(100, Math.round((amount / data.settings.dailyTargetMl) * 100));
      const isToday = k === todayKey;
      const achieved = i <= streakOffset && (amount >= thresholdMl || (isToday && amount > 0));

      sevenDayHistory.push({
        dateKey: k,
        dateNum: d.getDate(),
        dayLabel: dayLabels[d.getDay()],
        amountMl: amount,
        percent,
        achieved,
        isToday,
      });
    }
  } else {
    // Streak not started: follow standard Windows system week starting on Senin (Monday)
    const dayOfWeek = now.getDay(); // 0: Min, 1: Sen, 2: Sel, ...
    const diffToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const k = getLogicalDateKey(d.getTime(), dayStartHour);
      const amount = dateTotals[k] || 0;
      const percent = Math.min(100, Math.round((amount / data.settings.dailyTargetMl) * 100));
      const isToday = k === todayKey;
      const achieved = amount >= thresholdMl || (isToday && amount > 0);

      sevenDayHistory.push({
        dateKey: k,
        dateNum: d.getDate(),
        dayLabel: dayLabels[d.getDay()],
        amountMl: amount,
        percent,
        achieved,
        isToday,
      });
    }
  }

  const nextCheckpoint = STREAK_CHECKPOINTS.find((cp) => cp > currentStreak) || null;
  const daysToNextMilestone = nextCheckpoint ? nextCheckpoint - currentStreak : 0;
  const nextMilestoneTarget = nextCheckpoint || (currentStreak + 7);

  return {
    currentStreak,
    bestStreak,
    freezeCount: data.settings.freezeCount,
    daysToNextMilestone,
    nextMilestoneTarget,
    nextCheckpoint,
    sevenDayHistory,
    checkpoints: STREAK_CHECKPOINTS,
  };
}

/**
 * Computes 2-hour distribution for Screen 42:
 * 08, 10, 12, 14, 16, 18, 20
 */
export function getTwoHourDistribution(targetDate = new Date(), dataOverride?: WaterData) {
  const data = dataOverride || loadWaterData();
  const dayStartHour = data.settings.dayStartHour;
  const daily = getDailyIntake(targetDate, data);
  const slots = [8, 10, 12, 14, 16, 18, 20];
  const maxSlotMl = 500; // Reference max for bar height calculation (40px)

  return slots.map((hour, idx) => {
    // Records bucketed by 2-hour intervals, with edge padding for early mornings and late nights
    const slotRecords = daily.records.filter((r) => {
      const d = new Date(r.timestamp);
      const h = d.getHours();
      if (idx === 0) return h >= dayStartHour && h < 10;
      if (idx === slots.length - 1) return h >= 20 || h < dayStartHour;
      return h >= hour && h < hour + 2;
    });

    const amountMl = slotRecords.reduce((sum, r) => sum + r.amountMl, 0);
    const fillRatio = Math.min(1, amountMl / maxSlotMl);
    const heightPx = amountMl > 0 ? Math.max(8, Math.round(fillRatio * 38)) : 4;

    return {
      hour,
      label: String(hour).padStart(2, "0"),
      amountMl,
      heightPx,
      hasIntake: amountMl > 0,
      opacity: fillRatio > 0.6 ? 1 : fillRatio > 0 ? 0.55 : 0,
    };
  });
}

/**
 * Computes weekly history for Screen 45.
 */
export function getWeeklyHistory(weekOffset = 0, dataOverride?: WaterData) {
  const data = dataOverride || loadWaterData();
  const dayStartHour = data.settings.dayStartHour;
  const now = new Date();
  now.setDate(now.getDate() + weekOffset * 7);

  const todayKey = getLogicalDateKey(new Date().getTime(), dayStartHour);
  const targetL = data.settings.dailyTargetMl / 1000;
  const streakThresholdL =
    (data.settings.dailyTargetMl * (data.settings.streakThresholdPercent / 100)) / 1000;

  const dayLabels = getDayLabels();
  const monthNames = getMonthNamesShort();

  const rawDays = [];
  let totalWeekMl = 0;
  let targetAchievedDays = 0;
  let bestDay = { dayName: "", amountL: 0 };
  let maxIntakeL = 0;

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const daily = getDailyIntake(d, data);

    totalWeekMl += daily.totalMl;
    if (daily.isTargetAchieved) {
      targetAchievedDays++;
    }

    if (daily.totalL > bestDay.amountL) {
      bestDay = {
        dayName: dayLabels[d.getDay()],
        amountL: Number(daily.totalL.toFixed(1)),
      };
    }
    if (daily.totalL > maxIntakeL) {
      maxIntakeL = daily.totalL;
    }

    rawDays.push({ d, daily });
  }

  // Chart coordinate space: 100px available height for bars
  const CHART_BAR_MAX_PX = 100;
  const maxScaleL = Math.max(targetL * 1.25, maxIntakeL * 1.1, 1.0);
  const targetHeightPx = Math.round((targetL / maxScaleL) * CHART_BAR_MAX_PX);
  const streakHeightPx = Math.round((streakThresholdL / maxScaleL) * CHART_BAR_MAX_PX);

  const days = rawDays.map(({ d, daily }) => {
    const amountL = Number(daily.totalL.toFixed(1));
    const heightPx =
      amountL > 0
        ? Math.max(8, Math.min(CHART_BAR_MAX_PX, Math.round((daily.totalL / maxScaleL) * CHART_BAR_MAX_PX)))
        : 0;

    return {
      dateKey: daily.dateKey,
      dayLabel: dayLabels[d.getDay()],
      dateNum: d.getDate(),
      amountL,
      targetL,
      streakThresholdL,
      isTargetAchieved: daily.isTargetAchieved,
      isStreakMaintained: daily.isStreakMaintained,
      isToday: daily.dateKey === todayKey,
      heightPx,
    };
  });

  const startDay = days[0];
  const endDay = days[days.length - 1];
  const dateRangeStr = `${startDay.dateNum}-${endDay.dateNum} ${
    monthNames[new Date(endDay.dateKey).getMonth()]
  }`;

  const dailyAverageL = Number((totalWeekMl / 7 / 1000).toFixed(1));

  return {
    dateRangeStr,
    dailyAverageL,
    targetAchievedDays,
    bestDay,
    days,
    targetL,
    streakThresholdL,
    targetHeightPx,
    streakHeightPx,
    maxScaleL,
  };
}

export interface MonthHistoryDay {
  dateKey: string;
  dayOfWeek: number;
  dayLabel: string;
  dateNum: number;
  amountL: number;
  targetL: number;
  streakThresholdL: number;
  isTargetAchieved: boolean;
  isStreakMaintained: boolean;
  isToday: boolean;
  percent: number;
}

export interface MonthHistoryData {
  monthNameStr: string;
  year: number;
  monthIndex: number;
  dailyAverageL: number;
  targetAchievedDays: number;
  totalDaysInMonth: number;
  daysElapsed: number;
  bestDay: { dateNum: number; amountL: number };
  days: MonthHistoryDay[];
  targetL: number;
  streakThresholdL: number;
}

/**
 * Calculates calendar month metrics and daily completion matrix.
 */
export function getMonthlyHistory(
  monthOffset = 0,
  dataOverride?: WaterData
): MonthHistoryData {
  const data = dataOverride || loadWaterData();
  const dayStartHour = data.settings.dayStartHour;
  const now = new Date();

  const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = targetDate.getFullYear();
  const monthIndex = targetDate.getMonth();

  const monthNamesFull = getMonthNamesFull();
  const dayLabels = getDayLabels();

  const monthNameStr = `${monthNamesFull[monthIndex]} ${year}`;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayKey = getLogicalDateKey(now.getTime(), dayStartHour);
  const targetL = data.settings.dailyTargetMl / 1000;
  const streakThresholdL =
    (data.settings.dailyTargetMl * (data.settings.streakThresholdPercent / 100)) / 1000;

  const days: MonthHistoryDay[] = [];
  let totalMonthMl = 0;
  let targetAchievedDays = 0;
  let bestDay = { dateNum: 1, amountL: 0 };

  for (let d = 1; d <= daysInMonth; d++) {
    const dayDate = new Date(year, monthIndex, d, 12, 0, 0);
    const daily = getDailyIntake(dayDate, data);
    totalMonthMl += daily.totalMl;
    if (daily.isTargetAchieved) {
      targetAchievedDays++;
    }
    if (daily.totalL > bestDay.amountL) {
      bestDay = {
        dateNum: d,
        amountL: Number(daily.totalL.toFixed(1)),
      };
    }
    days.push({
      dateKey: daily.dateKey,
      dayOfWeek: dayDate.getDay(),
      dayLabel: dayLabels[dayDate.getDay()],
      dateNum: d,
      amountL: Number(daily.totalL.toFixed(1)),
      targetL,
      streakThresholdL,
      isTargetAchieved: daily.isTargetAchieved,
      isStreakMaintained: daily.isStreakMaintained,
      isToday: daily.dateKey === todayKey,
      percent: Math.min(100, Math.round((daily.totalMl / data.settings.dailyTargetMl) * 100)),
    });
  }

  const daysElapsed = monthOffset === 0 ? Math.min(daysInMonth, now.getDate()) : daysInMonth;
  const dailyAverageL = daysElapsed > 0 ? Number((totalMonthMl / daysElapsed / 1000).toFixed(1)) : 0;

  return {
    monthNameStr,
    year,
    monthIndex,
    dailyAverageL,
    targetAchievedDays,
    totalDaysInMonth: daysInMonth,
    daysElapsed,
    bestDay,
    days,
    targetL,
    streakThresholdL,
  };
}

/**
 * Formats next reminder time string like "15:30".
 */
export function getNextReminderTimeString(dataOverride?: WaterData): string {
  const data = dataOverride || loadWaterData();
  if (!data.settings.reminderEnabled) return "--:--";

  const now = new Date();
  if (data.snoozedUntil && data.snoozedUntil > now.getTime()) {
    const d = new Date(data.snoozedUntil);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  const intervalMs = data.settings.reminderIntervalHours * 60 * 60 * 1000;
  let next: Date;

  if (!data.lastDrinkTimestamp) {
    if (now.getHours() < data.settings.activeStartHour) {
      return `${String(data.settings.activeStartHour).padStart(2, "0")}:00`;
    }
    if (now.getHours() >= data.settings.activeEndHour) {
      return `${String(data.settings.activeStartHour).padStart(2, "0")}:00`;
    }
    next = new Date(now.getTime() + intervalMs);
  } else {
    next = new Date(data.lastDrinkTimestamp + intervalMs);
    if (next.getTime() <= now.getTime()) {
      next = new Date(now.getTime() + 15 * 60 * 1000);
    }
  }

  // Clamp within active hours
  if (next.getHours() < data.settings.activeStartHour) {
    next.setHours(data.settings.activeStartHour, 0, 0, 0);
  } else if (next.getHours() >= data.settings.activeEndHour) {
    next.setDate(next.getDate() + 1);
    next.setHours(data.settings.activeStartHour, 0, 0, 0);
  }

  return `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
}
