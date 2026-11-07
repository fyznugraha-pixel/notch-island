import React from "react";
import {
  PrayerId,
  PrayerScheduleData,
  PRAYER_ORDER,
  timeStringToMinutes,
} from "../../../services/prayerService";

export const PRAYER_ACCENT = "#30D158";

export const PrayerIcon: React.FC<{
  prayerId: PrayerId;
  size?: number;
  strokeWidth?: number;
}> = ({ prayerId, size = 19, strokeWidth = 1.8 }) => {
  switch (prayerId) {
    case "Fajr":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ display: "block" }}
        >
          <path d="M12 2v8M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0" />
        </svg>
      );
    case "Dhuhr":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ display: "block" }}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      );
    case "Asr":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ display: "block" }}
        >
          <path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.95 12.65a4 4 0 0 0-5.93-4.13M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6z" />
        </svg>
      );
    case "Maghrib":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ display: "block" }}
        >
          <path d="M12 10V2M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M16 6l-4 4-4-4M16 18a4 4 0 0 0-8 0" />
        </svg>
      );
    case "Isha":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ display: "block" }}
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
        </svg>
      );
  }
};

export const PrayerBellIcon: React.FC<{ size?: number; strokeWidth?: number }> = ({
  size = 14,
  strokeWidth = 1.9,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0" />
  </svg>
);

export const PrayerBellOffIcon: React.FC<{ size?: number; strokeWidth?: number }> = ({
  size = 14,
  strokeWidth = 1.9,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 9a6 6 0 0 1 9.5-4.8M18 9c0 3.2.7 4.9 1.4 5.9M4 16s2-1 2-7M10 20a2 2 0 0 0 4 0M3 3l18 18" />
  </svg>
);

export const PrayerPinIcon: React.FC<{ size?: number }> = ({ size = 10 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export const PrayerCheckIcon: React.FC<{ size?: number; strokeWidth?: number }> = ({
  size = 14,
  strokeWidth = 3,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const PrayerSpeakerIcon: React.FC<{ size?: number; muted?: boolean }> = ({
  size = 16,
  muted = false,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {muted ? (
      <>
        <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
        <path d="M22 9l-6 6M16 9l6 6" />
      </>
    ) : (
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
    )}
  </svg>
);

export function getNextPrayerProgressFraction(
  schedule: PrayerScheduleData,
  now: Date
): number {
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const fajrMins = timeStringToMinutes(schedule.timings.Fajr);
  const ishaMins = timeStringToMinutes(schedule.timings.Isha);

  let prevMins = fajrMins;
  let nextMins = ishaMins;
  let foundNext = false;

  for (let i = 0; i < PRAYER_ORDER.length; i++) {
    const pMins = timeStringToMinutes(schedule.timings[PRAYER_ORDER[i]]);
    if (currentMins < pMins) {
      nextMins = pMins;
      prevMins = i === 0 ? pMins - (24 * 60 - ishaMins + fajrMins) : timeStringToMinutes(schedule.timings[PRAYER_ORDER[i - 1]]);
      foundNext = true;
      break;
    }
  }

  if (!foundNext) {
    prevMins = ishaMins;
    nextMins = 24 * 60 + fajrMins;
  }

  const adjCurrent = !foundNext && currentMins < fajrMins ? currentMins + 24 * 60 : currentMins;
  const span = Math.max(1, nextMins - prevMins);
  const elapsed = Math.max(0, Math.min(span, adjCurrent - prevMins));
  return Math.max(0.06, Math.min(0.98, elapsed / span));
}

export function getDayTimelinePositions(
  schedule: PrayerScheduleData,
  now: Date
): {
  currentPct: number;
  milestones: Record<PrayerId, number>;
} {
  const fajrMins = timeStringToMinutes(schedule.timings.Fajr);
  const ishaMins = timeStringToMinutes(schedule.timings.Isha);
  const totalSpan = Math.max(1, ishaMins - fajrMins);

  const milestones: Record<PrayerId, number> = {
    Fajr: 0,
    Dhuhr: 50.4,
    Asr: 72.8,
    Maghrib: 91.9,
    Isha: 100,
  };

  for (const pId of PRAYER_ORDER) {
    const pMins = timeStringToMinutes(schedule.timings[pId]);
    const pct = ((pMins - fajrMins) / totalSpan) * 100;
    milestones[pId] = Math.max(0, Math.min(100, Number(pct.toFixed(1))));
  }

  const currentMins = now.getHours() * 60 + now.getMinutes();
  const rawCurrentPct = ((currentMins - fajrMins) / totalSpan) * 100;
  const currentPct = Math.max(0, Math.min(100, Number(rawCurrentPct.toFixed(1))));

  return { currentPct, milestones };
}
