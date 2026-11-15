/**
 * Water Reminder & Hydration Tracking Service
 * Handles data persistence, streak tracking, and reminder schedules.
 */

import { getLanguage } from "./i18n.ts";
import { emitCrossWindowEvent } from "../utils/crossWindowSync.ts";

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

export const WATER_STORAGE_KEY = "gili_water_data";
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
  frozenDateKeys?: string[];
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
    frozenDateKeys: [],
  };
}

function sortRecordsDesc(records: WaterIntakeRecord[]): WaterIntakeRecord[] {
  return [...records].sort((a, b) => b.timestamp - a.timestamp);
}

function formatLocalDateKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseLocalDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

function shiftLocalDateKey(dateKey: string, deltaDays: number): Date {
  const d = parseLocalDateKey(dateKey);
  d.setDate(d.getDate() + deltaDays);
  return d;
}

export function loadWaterData(): WaterData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Clean out any mock/sample data previously seeded from templates
      const cleanRecords = sortRecordsDesc(
        (parsed.records || []).filter(
          (r: WaterIntakeRecord) =>
            typeof r.id === "string" &&
            !r.id.startsWith("sample-") &&
            !r.id.startsWith("past-")
        )
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
        frozenDateKeys: Array.isArray(parsed.frozenDateKeys) ? parsed.frozenDateKeys : [],
        settings: {
          ...DEFAULT_WATER_SETTINGS,
          ...(parsed.settings || {}),
          reminderEnabled: userConfigured
            ? Boolean(parsed.settings?.reminderEnabled)
            : false,
        },
      };

      const resolved = applyPendingAutoFreezes(data);
      if (hadMockData) {
        saveWaterData(resolved);
      } else if (resolved !== data) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
        } catch {}
      }
      return resolved;
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
    emitCrossWindowEvent("gili_water_changed", data);
  } catch (err) {
    console.error("Failed to save water data:", err);
  }
}

/**
 * Normalizes date to the user's custom "day start hour" (e.g., 03:00 rollover).
 */
export function getLogicalDateKey(timestamp: number, dayStartHour = 3): string {
  const d = new Date(timestamp);
  // Anchor to local noon before shifting calendar day to avoid DST 02:xx duplicate keys.
  const logical =
    d.getHours() < dayStartHour
      ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12, 0, 0)
      : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  return formatLocalDateKey(logical);
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

  const updatedRecords = sortRecordsDesc([record, ...data.records]);
  const celebrated = [...(data.celebratedMilestones || [])];

  const intermediateData: WaterData = {
    ...data,
    records: updatedRecords,
    lastDrinkTimestamp: updatedRecords[0]?.timestamp ?? null,
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
    emitCrossWindowEvent("gili_streak_celebration", celebration);
  }

  return { record, celebration, streakIncreased, targetAchieved };
}

export function useStreakFreeze(targetDateKey?: string): boolean {
  const data = loadWaterData();
  if (data.settings.freezeCount <= 0) return false;

  const dayStartHour = data.settings.dayStartHour;
  const todayKey = getLogicalDateKey(Date.now(), dayStartHour);
  const yesterdayKey = formatLocalDateKey(shiftLocalDateKey(todayKey, -1));
  const frozenSet = new Set(data.frozenDateKeys || []);

  let keyToFreeze = targetDateKey;
  if (!keyToFreeze) {
    const thresholdMl = Math.round(
      data.settings.dailyTargetMl * (data.settings.streakThresholdPercent / 100)
    );
    const todayTotal = getDailyIntake(parseLocalDateKey(todayKey), data).totalMl;
    const yesterdayTotal = getDailyIntake(parseLocalDateKey(yesterdayKey), data).totalMl;

    if (todayTotal < thresholdMl && !frozenSet.has(todayKey)) {
      keyToFreeze = todayKey;
    } else if (yesterdayTotal < thresholdMl && !frozenSet.has(yesterdayKey)) {
      keyToFreeze = yesterdayKey;
    } else {
      keyToFreeze = todayKey;
    }
  }

  if (frozenSet.has(keyToFreeze)) return false;

  const updated: WaterData = {
    ...data,
    frozenDateKeys: [...frozenSet, keyToFreeze],
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
    emitCrossWindowEvent("gili_trigger_water_toast", { type, amount });
  }
}

export function undoLastDrink(): boolean {
  const data = loadWaterData();
  if (data.records.length === 0) return false;

  const sorted = sortRecordsDesc(data.records);
  const [last, ...rest] = sorted;
  const updatedData: WaterData = {
    ...data,
    records: rest,
    lastUndoneRecord: last,
    lastDrinkTimestamp: rest[0]?.timestamp ?? null,
  };
  saveWaterData(updatedData);
  return true;
}

export function deleteDrink(id: string): void {
  const data = loadWaterData();
  const updated = sortRecordsDesc(data.records.filter((r) => r.id !== id));
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
    frozenDateKeys: [],
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

function evaluateStreakChain(
  data: WaterData,
  refDate: Date = new Date()
): {
  todayKey: string;
  todayAnchor: Date;
  dateTotals: Record<string, number>;
  thresholdMl: number;
  effectiveFrozenDates: Set<string>;
  autoFrozenKeys: string[];
  currentStreak: number;
  remainingFreezeCount: number;
} {
  const dayStartHour = data.settings.dayStartHour;
  const todayKey = getLogicalDateKey(refDate.getTime(), dayStartHour);

  const dateTotals: Record<string, number> = {};
  for (const r of data.records) {
    const k = getLogicalDateKey(r.timestamp, dayStartHour);
    dateTotals[k] = (dateTotals[k] || 0) + r.amountMl;
  }

  const thresholdMl = Math.round(
    data.settings.dailyTargetMl * (data.settings.streakThresholdPercent / 100)
  );

  const todayAnchor = parseLocalDateKey(todayKey);
  const frozenDates = new Set(data.frozenDateKeys || []);

  let currentStreak = 0;
  const cursor = new Date(todayAnchor);

  const todayTotal = dateTotals[todayKey] || 0;
  if (todayTotal >= thresholdMl) {
    currentStreak++;
  }

  // Walk backwards day by day from yesterday (noon-anchored so DST never duplicates keys)
  cursor.setDate(cursor.getDate() - 1);
  let availableFreezes = Math.max(0, data.settings.freezeCount);
  const pendingFreezes: string[] = [];
  const autoFrozenKeys: string[] = [];

  for (let i = 0; i < 365; i++) {
    const key = formatLocalDateKey(cursor);
    const dayTotal = dateTotals[key] || 0;

    if (dayTotal >= thresholdMl) {
      if (pendingFreezes.length > 0) {
        autoFrozenKeys.push(...pendingFreezes);
        pendingFreezes.length = 0;
      }
      currentStreak++;
    } else if (frozenDates.has(key)) {
      // Explicitly frozen date already consumed freezeCount when applied
    } else if (data.settings.autoUseFreeze && availableFreezes > 0) {
      availableFreezes--;
      pendingFreezes.push(key);
    } else {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  const effectiveFrozenDates = new Set(frozenDates);
  for (const k of autoFrozenKeys) {
    effectiveFrozenDates.add(k);
  }

  return {
    todayKey,
    todayAnchor,
    dateTotals,
    thresholdMl,
    effectiveFrozenDates,
    autoFrozenKeys,
    currentStreak,
    remainingFreezeCount: Math.max(0, data.settings.freezeCount - autoFrozenKeys.length),
  };
}

function applyPendingAutoFreezes(data: WaterData, refDate: Date = new Date()): WaterData {
  if (!data.settings.autoUseFreeze || data.settings.freezeCount <= 0) return data;
  const { autoFrozenKeys, remainingFreezeCount } = evaluateStreakChain(data, refDate);
  if (autoFrozenKeys.length === 0) return data;

  const existing = new Set(data.frozenDateKeys || []);
  for (const k of autoFrozenKeys) existing.add(k);

  return {
    ...data,
    frozenDateKeys: Array.from(existing),
    settings: {
      ...data.settings,
      freezeCount: remainingFreezeCount,
    },
  };
}

/**
 * Calculates current consecutive streak and past 7 days history.
 */
export function getStreakInfo(dataOverride?: WaterData, refDate: Date = new Date()) {
  const data = dataOverride || loadWaterData();
  const {
    todayKey,
    todayAnchor,
    dateTotals,
    thresholdMl,
    effectiveFrozenDates,
    currentStreak,
    remainingFreezeCount,
  } = evaluateStreakChain(data, refDate);

  // Pure read: never mutate the caller's object or persist here. Best-streak and
  // pending auto-freezes are persisted on load / write points instead.
  const bestStreak = Math.max(data.bestStreakDays, currentStreak);

  // Generate 7-day display list:
  // - If streak is active (currentStreak > 0): follow the day the streak started ("ikutin hari dimana iya mulai")
  // - If streak hasn't started (currentStreak === 0): follow standard Windows system calendar week (Senin - Minggu)
  const dayLabels = getDayLabels();
  const sevenDayHistory = [];

  if (currentStreak > 0) {
    // Follow the start of the active streak cycle
    const streakOffset = Math.min(6, currentStreak - 1);
    const startDate = shiftLocalDateKey(todayKey, -streakOffset);

    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const k = formatLocalDateKey(d);
      const amount = dateTotals[k] || 0;
      const percent = Math.min(100, Math.round((amount / data.settings.dailyTargetMl) * 100));
      const isToday = k === todayKey;
      const achieved =
        i <= streakOffset &&
        (amount >= thresholdMl || effectiveFrozenDates.has(k));

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
    const dayOfWeek = todayAnchor.getDay(); // 0: Min, 1: Sen, 2: Sel, ...
    const diffToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(todayAnchor);
    monday.setDate(todayAnchor.getDate() - diffToMonday);

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const k = formatLocalDateKey(d);
      const amount = dateTotals[k] || 0;
      const percent = Math.min(100, Math.round((amount / data.settings.dailyTargetMl) * 100));
      const isToday = k === todayKey;
      const achieved = amount >= thresholdMl || effectiveFrozenDates.has(k);

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
    freezeCount: remainingFreezeCount,
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
  const todayKey = getLogicalDateKey(Date.now(), dayStartHour);
  const now = shiftLocalDateKey(todayKey, weekOffset * 7);
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
    monthNames[parseLocalDateKey(endDay.dateKey).getMonth()]
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

export function isHourInActiveWindow(
  hour: number,
  startHour: number,
  endHour: number
): boolean {
  if (startHour === endHour) return true;
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  // Overnight window (e.g. 20:00 -> 04:00)
  return hour >= startHour || hour < endHour;
}

export function isNearEndOfActiveWindow(
  hour: number,
  startHour: number,
  endHour: number,
  lookbackHours = 3
): boolean {
  if (startHour === endHour || !isHourInActiveWindow(hour, startHour, endHour)) {
    return false;
  }
  const hoursUntilEnd = (endHour - hour + 24) % 24;
  return hoursUntilEnd >= 1 && hoursUntilEnd <= lookbackHours;
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

  const { activeStartHour, activeEndHour } = data.settings;
  const intervalMs = data.settings.reminderIntervalHours * 60 * 60 * 1000;
  let next: Date;

  if (!data.lastDrinkTimestamp) {
    if (!isHourInActiveWindow(now.getHours(), activeStartHour, activeEndHour)) {
      return `${String(activeStartHour).padStart(2, "0")}:00`;
    }
    next = new Date(now.getTime() + intervalMs);
  } else {
    next = new Date(data.lastDrinkTimestamp + intervalMs);
    if (next.getTime() <= now.getTime()) {
      next = new Date(now.getTime() + 15 * 60 * 1000);
    }
  }

  // Clamp within active hours (supporting both same-day and overnight windows)
  if (!isHourInActiveWindow(next.getHours(), activeStartHour, activeEndHour)) {
    const clamped = new Date(next);
    clamped.setHours(activeStartHour, 0, 0, 0);
    if (clamped.getTime() < next.getTime()) {
      clamped.setDate(clamped.getDate() + 1);
    }
    next = clamped;
  }

  return `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
}
