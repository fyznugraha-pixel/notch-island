import {
  DEFAULT_WATER_SETTINGS,
  getLogicalDateKey,
  getDailyIntake,
  getStreakInfo,
  getTwoHourDistribution,
  getWeeklyHistory,
  getMonthlyHistory,
} from "../src/services/waterService.ts";
import type { WaterData } from "../src/services/waterService.ts";

function runTests() {
  console.log("========================================");
  console.log("RUNNING WATER SERVICE UNIT TESTS");
  console.log("========================================");

  let passed = 0;

  // Case 1: Logical date calculation with 03:00 rollover
  const before3am = new Date("2026-10-27T02:45:00").getTime();
  const after3am = new Date("2026-10-27T03:15:00").getTime();

  const key1 = getLogicalDateKey(before3am, 3);
  const key2 = getLogicalDateKey(after3am, 3);

  if (key1 === "2026-10-26" && key2 === "2026-10-27") {
    console.log("  ✓ Case 1: Day rollover before 03:00 belongs to yesterday");
    passed++;
  } else {
    console.error(`  ❌ Case 1 failed: key1=${key1}, key2=${key2}`);
  }

  // Case 2: Daily intake summary calculation
  const mockData: WaterData = {
    records: [
      { id: "1", timestamp: new Date("2026-10-27T08:15:00").getTime(), amountMl: 350 },
      { id: "2", timestamp: new Date("2026-10-27T10:30:00").getTime(), amountMl: 250 },
      { id: "3", timestamp: new Date("2026-10-27T12:00:00").getTime(), amountMl: 500 },
      { id: "4", timestamp: new Date("2026-10-27T14:45:00").getTime(), amountMl: 800 },
    ],
    settings: { ...DEFAULT_WATER_SETTINGS, dailyTargetMl: 2000, streakThresholdPercent: 80 },
    snoozedUntil: null,
    bestStreakDays: 10,
    celebratedMilestones: [],
    lastDrinkTimestamp: Date.now(),
    lastUndoneRecord: null,
  };

  const daily = getDailyIntake(new Date("2026-10-27T12:00:00"), mockData);
  // Total: 350 + 250 + 500 + 800 = 1900 ml.
  // Target: 2000 ml. 1900 / 2000 = 95%.
  // Streak threshold: 80% of 2000 = 1600 ml.
  if (
    daily.totalMl === 1900 &&
    daily.percent === 95 &&
    daily.isStreakMaintained === true &&
    daily.isTargetAchieved === false
  ) {
    console.log("  ✓ Case 2: Daily intake total, percent, and streak threshold match");
    passed++;
  } else {
    console.error("  ❌ Case 2 failed:", daily);
  }

  // Case 3: 2-hour distribution buckets
  const dist = getTwoHourDistribution(new Date("2026-10-27T12:00:00"), mockData);
  const slot8 = dist.find((s) => s.hour === 8);
  const slot10 = dist.find((s) => s.hour === 10);
  const slot12 = dist.find((s) => s.hour === 12);
  const slot14 = dist.find((s) => s.hour === 14);

  if (
    slot8?.amountMl === 350 &&
    slot10?.amountMl === 250 &&
    slot12?.amountMl === 500 &&
    slot14?.amountMl === 800
  ) {
    console.log("  ✓ Case 3: 2-hour distribution correctly buckets drinks");
    passed++;
  } else {
    console.error("  ❌ Case 3 failed:", dist);
  }

  // Case 4: Streak info calculation
  const streak = getStreakInfo(mockData);
  if (streak.currentStreak >= 1 && streak.sevenDayHistory.length === 7) {
    console.log("  ✓ Case 4: Streak info returns valid streak and 7-day history");
    passed++;
  } else {
    console.error("  ❌ Case 4 failed:", streak);
  }

  // Case 5: Weekly history calculation
  const weekly = getWeeklyHistory(0, mockData);
  if (weekly.days.length === 7 && weekly.targetL === 2.0 && weekly.streakThresholdL === 1.6) {
    console.log("  ✓ Case 5: Weekly history calculates 7 days with targets");
    passed++;
  } else {
    console.error("  ❌ Case 5 failed:", weekly);
  }

  // Case 6: Clean initial state starts from 0 with next milestone at 3 days
  const cleanData: WaterData = {
    records: [],
    settings: DEFAULT_WATER_SETTINGS,
    snoozedUntil: null,
    bestStreakDays: 0,
    celebratedMilestones: [],
    lastDrinkTimestamp: null,
    lastUndoneRecord: null,
  };
  const cleanDaily = getDailyIntake(new Date(), cleanData);
  const cleanStreak = getStreakInfo(cleanData);
  if (
    cleanDaily.totalMl === 0 &&
    cleanDaily.percent === 0 &&
    cleanStreak.currentStreak === 0 &&
    cleanStreak.nextCheckpoint === 3 &&
    cleanStreak.daysToNextMilestone === 3
  ) {
    console.log("  ✓ Case 6: Clean initial state starts from 0 ml, 0 streak, and 3-day checkpoint");
    passed++;
  } else {
    console.error("  ❌ Case 6 failed:", cleanDaily, cleanStreak);
  }

  // Case 7: Checkpoint milestones validation
  const expectedCheckpoints = [3, 10, 30, 50, 100, 150, 200, 250, 300, 365];
  const matchesCheckpoints =
    cleanStreak.checkpoints.length === expectedCheckpoints.length &&
    cleanStreak.checkpoints.every((cp, i) => cp === expectedCheckpoints[i]);
  if (matchesCheckpoints) {
    console.log("  ✓ Case 7: Milestone checkpoints correctly defined [3, 10, 30, 50, 100, 150, 200, 250, 300, 365]");
    passed++;
  } else {
    console.error("  ❌ Case 7 failed: Checkpoints mismatch", cleanStreak.checkpoints);
  }

  // Case 8: Water progress and threshold calculation for notifications
  const notifThreshold = Math.round(mockData.settings.dailyTargetMl * (mockData.settings.streakThresholdPercent / 100));
  const remainingStreak = Math.max(0, notifThreshold - daily.totalMl);
  if (notifThreshold === 1600 && remainingStreak === 0 && daily.totalMl === 1900) {
    console.log("  ✓ Case 8: Notification threshold & water progress accurately compute remaining ml");
    passed++;
  } else {
    console.error("  ❌ Case 8 failed: notif calculation", { notifThreshold, remainingStreak, total: daily.totalMl });
  }

  // Case 9: Monthly history calculation
  const monthly = getMonthlyHistory(0, mockData);
  if (
    monthly.totalDaysInMonth >= 28 &&
    monthly.days.length === monthly.totalDaysInMonth &&
    monthly.monthNameStr.length > 0 &&
    typeof monthly.dailyAverageL === "number"
  ) {
    console.log("  ✓ Case 9: Monthly history correctly builds calendar days matrix and statistics");
    passed++;
  } else {
    console.error("  ❌ Case 9 failed: monthly history", monthly);
  }

  console.log(`\nResult: ${passed}/9 passed.`);
  if (passed !== 9) {
    process.exit(1);
  }
}

runTests();
