import {
  WeatherLocation,
  resolveWeatherLocation,
  getSavedCustomCity,
  getSavedLastLocation,
} from "./weatherService";
import { getLanguage } from "./i18n";

export type PrayerId = "Fajr" | "Dhuhr" | "Asr" | "Maghrib" | "Isha";

export const PRAYER_ORDER: PrayerId[] = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

export interface PrayerMeta {
  id: PrayerId;
  nameId: string;
  nameEn: string;
  shortId: string;
  shortEn: string;
  rakat: number;
}

export const PRAYER_META: Record<PrayerId, PrayerMeta> = {
  Fajr: {
    id: "Fajr",
    nameId: "Subuh",
    nameEn: "Fajr",
    shortId: "Sub",
    shortEn: "Fajr",
    rakat: 2,
  },
  Dhuhr: {
    id: "Dhuhr",
    nameId: "Dzuhur",
    nameEn: "Dhuhr",
    shortId: "Dzu",
    shortEn: "Dhuhr",
    rakat: 4,
  },
  Asr: {
    id: "Asr",
    nameId: "Ashar",
    nameEn: "Asr",
    shortId: "Ash",
    shortEn: "Asr",
    rakat: 4,
  },
  Maghrib: {
    id: "Maghrib",
    nameId: "Maghrib",
    nameEn: "Maghrib",
    shortId: "Mag",
    shortEn: "Magh",
    rakat: 3,
  },
  Isha: {
    id: "Isha",
    nameId: "Isya",
    nameEn: "Isha",
    shortId: "Isy",
    shortEn: "Isha",
    rakat: 4,
  },
};

export interface PrayerScheduleData {
  dateKey: string; // YYYY-MM-DD
  locationName: string;
  latitude: number;
  longitude: number;
  hijriDate: string;
  timings: {
    Imsak: string;
    Fajr: string;
    Sunrise: string;
    Dhuhr: string;
    Asr: string;
    Maghrib: string;
    Isha: string;
  };
  source: "aladhan" | "calculated";
}

export interface PrayerSettings {
  reminderEnabled: boolean;
  preReminderEnabled: boolean;
  preReminderMinutes: number; // 5 | 10 | 15
  enabledPrayers: Record<PrayerId, boolean>;
  calculationMethod: number; // 20 = Kemenag RI, 3 = MWL, 4 = Umm al-Qura, 11 = MUIS
  soundEnabled: boolean;
  dndFocus: boolean;
}

export type PrayerToastType = "prayer_time" | "pre_reminder" | "completed";

export interface PrayerToastPayload {
  type: PrayerToastType;
  prayerId: PrayerId;
  prayerTime: string;
  minutesLeft?: number;
  locationName: string;
}

const SETTINGS_KEY = "gili_prayer_settings_v1";
const COMPLETED_KEY = "gili_prayer_completed_v1";
const SCHEDULE_CACHE_KEY = "gili_prayer_schedule_cache_v1";

export const DEFAULT_PRAYER_SETTINGS: PrayerSettings = {
  reminderEnabled: true,
  preReminderEnabled: true,
  preReminderMinutes: 10,
  enabledPrayers: {
    Fajr: true,
    Dhuhr: true,
    Asr: true,
    Maghrib: true,
    Isha: true,
  },
  calculationMethod: 20, // Kementerian Agama Republik Indonesia
  soundEnabled: true,
  dndFocus: false,
};

export const INDONESIAN_PRESET_CITIES: WeatherLocation[] = [
  { name: "Jakarta", admin1: "DKI Jakarta", country: "Indonesia", latitude: -6.2088, longitude: 106.8456, source: "custom" },
  { name: "Bandung", admin1: "Jawa Barat", country: "Indonesia", latitude: -6.9175, longitude: 107.6191, source: "custom" },
  { name: "Surabaya", admin1: "Jawa Timur", country: "Indonesia", latitude: -7.2575, longitude: 112.7521, source: "custom" },
  { name: "Yogyakarta", admin1: "DI Yogyakarta", country: "Indonesia", latitude: -7.7956, longitude: 110.3695, source: "custom" },
  { name: "Semarang", admin1: "Jawa Tengah", country: "Indonesia", latitude: -6.9667, longitude: 110.4167, source: "custom" },
  { name: "Malang", admin1: "Jawa Timur", country: "Indonesia", latitude: -7.9666, longitude: 112.6326, source: "custom" },
  { name: "Medan", admin1: "Sumatera Utara", country: "Indonesia", latitude: 3.5952, longitude: 98.6722, source: "custom" },
  { name: "Makassar", admin1: "Sulawesi Selatan", country: "Indonesia", latitude: -5.1477, longitude: 119.4327, source: "custom" },
  { name: "Denpasar", admin1: "Bali", country: "Indonesia", latitude: -8.6705, longitude: 115.2126, source: "custom" },
  { name: "Balikpapan", admin1: "Kalimantan Timur", country: "Indonesia", latitude: -1.2379, longitude: 116.8529, source: "custom" },
];

export function getTodayDateKey(now = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function loadPrayerSettings(): PrayerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_PRAYER_SETTINGS,
        ...parsed,
        enabledPrayers: {
          ...DEFAULT_PRAYER_SETTINGS.enabledPrayers,
          ...(parsed.enabledPrayers || {}),
        },
      };
    }
  } catch {}
  return { ...DEFAULT_PRAYER_SETTINGS };
}

export function savePrayerSettings(next: PrayerSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("gili_prayer_updated"));
    }
  } catch {}
}

export function updatePrayerSettings(partial: Partial<PrayerSettings>): PrayerSettings {
  const current = loadPrayerSettings();
  const updated: PrayerSettings = {
    ...current,
    ...partial,
    enabledPrayers: partial.enabledPrayers
      ? { ...current.enabledPrayers, ...partial.enabledPrayers }
      : current.enabledPrayers,
  };
  savePrayerSettings(updated);
  return updated;
}

export function getCompletedPrayersForDate(dateKey = getTodayDateKey()): PrayerId[] {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, PrayerId[]>;
    return Array.isArray(map[dateKey]) ? map[dateKey] : [];
  } catch {
    return [];
  }
}

export function togglePrayerCompleted(prayerId: PrayerId, dateKey = getTodayDateKey()): {
  completed: PrayerId[];
  isNowCompleted: boolean;
} {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    const map: Record<string, PrayerId[]> = raw ? JSON.parse(raw) : {};
    const list = Array.isArray(map[dateKey]) ? [...map[dateKey]] : [];
    const idx = list.indexOf(prayerId);
    let isNowCompleted = false;

    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(prayerId);
      isNowCompleted = true;
    }

    map[dateKey] = list;
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(map));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("gili_prayer_updated"));
    }
    return { completed: list, isNowCompleted };
  } catch {
    return { completed: [], isNowCompleted: false };
  }
}

function cleanTimeStr(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  return `${ match[1].padStart(2, "0") }:${ match[2] }`;
}

/**
 * Offline solar calculation fallback (Kemenag RI angles: Fajr -20 deg, Isha -18 deg)
 */
export function calculateOfflinePrayerSchedule(
  date: Date,
  loc: WeatherLocation
): PrayerScheduleData {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / 86400000);

  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + 0.5);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const tzOffsetHours = -date.getTimezoneOffset() / 60;
  const solarNoonHours = 12 + tzOffsetHours - loc.longitude / 15 - eqTime / 60;

  const hourAngleForAltitude = (altDeg: number): number => {
    const latRad = loc.latitude * rad;
    const altRad = altDeg * rad;
    const cosH =
      (Math.sin(altRad) - Math.sin(latRad) * Math.sin(decl)) /
      (Math.cos(latRad) * Math.cos(decl));
    const clamped = Math.max(-1, Math.min(1, cosH));
    return (Math.acos(clamped) * deg) / 15;
  };

  // Shafi'i Asr shadow factor = 1
  const latRad = loc.latitude * rad;
  const asrAltRad = Math.atan(1 / (1 + Math.tan(Math.abs(latRad - decl))));
  const asrHours = hourAngleForAltitude(asrAltRad * deg);

  const fajrHours = hourAngleForAltitude(-20);
  const sunriseHours = hourAngleForAltitude(-0.833);
  const ishaHours = hourAngleForAltitude(-18);

  const ihtiyat = 2 / 60; // +2 minutes Kemenag RI safety margin

  const toHHMM = (h: number): string => {
    const wrapped = ((h % 24) + 24) % 24;
    const totalMins = Math.round(wrapped * 60);
    const hh = Math.floor(totalMins / 60) % 24;
    const mm = totalMins % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  const fajrVal = solarNoonHours - fajrHours + ihtiyat;
  const imsakVal = fajrVal - 10 / 60;
  const sunriseVal = solarNoonHours - sunriseHours;
  const dhuhrVal = solarNoonHours + ihtiyat;
  const asrVal = solarNoonHours + asrHours + ihtiyat;
  const maghribVal = solarNoonHours + sunriseHours + ihtiyat;
  const ishaVal = solarNoonHours + ishaHours + ihtiyat;

  let hijriDate = "";
  try {
    hijriDate = new Intl.DateTimeFormat("id-ID-u-ca-islamic", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    hijriDate = "";
  }

  return {
    dateKey: getTodayDateKey(date),
    locationName: loc.name || "Jakarta",
    latitude: loc.latitude,
    longitude: loc.longitude,
    hijriDate,
    timings: {
      Imsak: toHHMM(imsakVal),
      Fajr: toHHMM(fajrVal),
      Sunrise: toHHMM(sunriseVal),
      Dhuhr: toHHMM(dhuhrVal),
      Asr: toHHMM(asrVal),
      Maghrib: toHHMM(maghribVal),
      Isha: toHHMM(ishaVal),
    },
    source: "calculated",
  };
}

export function getCachedPrayerSchedule(): PrayerScheduleData | null {
  try {
    const raw = localStorage.getItem(SCHEDULE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PrayerScheduleData;
    if (parsed && parsed.dateKey === getTodayDateKey() && parsed.timings?.Fajr) {
      return parsed;
    }
  } catch {}
  return null;
}

export function getImmediatePrayerSchedule(): PrayerScheduleData {
  const cached = getCachedPrayerSchedule();
  const custom = getSavedCustomCity();
  const lastLoc = custom || getSavedLastLocation() || INDONESIAN_PRESET_CITIES[0];

  if (
    cached &&
    Math.abs(cached.latitude - lastLoc.latitude) < 0.08 &&
    Math.abs(cached.longitude - lastLoc.longitude) < 0.08
  ) {
    return cached;
  }

  return calculateOfflinePrayerSchedule(new Date(), lastLoc);
}

export async function fetchPrayerSchedule(forceRefresh = false): Promise<PrayerScheduleData> {
  if (forceRefresh) {
    try {
      localStorage.removeItem(SCHEDULE_CACHE_KEY);
      if (!getSavedCustomCity()) {
        localStorage.removeItem("island_cached_weather_location");
      }
    } catch {}
  }
  const loc = await resolveWeatherLocation();
  const settings = loadPrayerSettings();
  const now = new Date();
  const todayKey = getTodayDateKey(now);

  if (!forceRefresh) {
    const cached = getCachedPrayerSchedule();
    if (
      cached &&
      cached.dateKey === todayKey &&
      Math.abs(cached.latitude - loc.latitude) < 0.05 &&
      Math.abs(cached.longitude - loc.longitude) < 0.05 &&
      cached.source === "aladhan"
    ) {
      return { ...cached, locationName: loc.name };
    }
  }

  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);

  try {
    const url = `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}?latitude=${loc.latitude}&longitude=${loc.longitude}&method=${settings.calculationMethod}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const json = await res.json();
      const tData = json?.data?.timings;
      const hijri = json?.data?.date?.hijri;
      if (tData) {
        const hijriStr = hijri
          ? `${hijri.day} ${hijri.month?.en || ""} ${hijri.year} H`
          : "";
        const fallback = calculateOfflinePrayerSchedule(now, loc);
        const schedule: PrayerScheduleData = {
          dateKey: todayKey,
          locationName: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          hijriDate: hijriStr || fallback.hijriDate,
          timings: {
            Imsak: cleanTimeStr(tData.Imsak, fallback.timings.Imsak),
            Fajr: cleanTimeStr(tData.Fajr, fallback.timings.Fajr),
            Sunrise: cleanTimeStr(tData.Sunrise, fallback.timings.Sunrise),
            Dhuhr: cleanTimeStr(tData.Dhuhr, fallback.timings.Dhuhr),
            Asr: cleanTimeStr(tData.Asr, fallback.timings.Asr),
            Maghrib: cleanTimeStr(tData.Maghrib, fallback.timings.Maghrib),
            Isha: cleanTimeStr(tData.Isha, fallback.timings.Isha),
          },
          source: "aladhan",
        };
        try {
          localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(schedule));
        } catch {}
        return schedule;
      }
    }
  } catch {
    clearTimeout(timer);
  }

  const offline = calculateOfflinePrayerSchedule(now, loc);
  try {
    localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(offline));
  } catch {}
  return offline;
}

export function timeStringToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  return h * 60 + m;
}

export interface NextPrayerStatus {
  currentPrayer: PrayerId | null;
  nextPrayer: PrayerId;
  nextPrayerTime: string;
  minutesUntilNext: number;
  countdownText: string;
  isTomorrow: boolean;
}

export function getNextPrayerStatus(
  schedule: PrayerScheduleData,
  now = new Date()
): NextPrayerStatus {
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const isEn = getLanguage() === "en";

  let currentPrayer: PrayerId | null = null;
  let nextPrayer: PrayerId | null = null;
  let nextPrayerTime = schedule.timings.Fajr;
  let minutesUntilNext = 0;
  let isTomorrow = false;

  for (let i = 0; i < PRAYER_ORDER.length; i++) {
    const pId = PRAYER_ORDER[i];
    const pMins = timeStringToMinutes(schedule.timings[pId]);
    if (currentMins >= pMins) {
      currentPrayer = pId;
    } else if (!nextPrayer) {
      nextPrayer = pId;
      nextPrayerTime = schedule.timings[pId];
      minutesUntilNext = pMins - currentMins;
    }
  }

  if (!nextPrayer) {
    nextPrayer = "Fajr";
    nextPrayerTime = schedule.timings.Fajr;
    const fajrMins = timeStringToMinutes(schedule.timings.Fajr);
    minutesUntilNext = 24 * 60 - currentMins + fajrMins;
    isTomorrow = true;
  }

  const hours = Math.floor(minutesUntilNext / 60);
  const mins = minutesUntilNext % 60;
  const countdownText =
    hours > 0
      ? isEn
        ? `${hours}h ${mins}m`
        : `${hours}j ${mins}m`
      : isEn
      ? `${mins}m`
      : `${mins} mnt`;

  return {
    currentPrayer,
    nextPrayer,
    nextPrayerTime,
    minutesUntilNext,
    countdownText,
    isTomorrow,
  };
}

export function getPrayerDisplayName(id: PrayerId, lang = getLanguage()): string {
  return lang === "en" ? PRAYER_META[id].nameEn : PRAYER_META[id].nameId;
}

export function getPrayerShortName(id: PrayerId, lang = getLanguage()): string {
  return lang === "en" ? PRAYER_META[id].shortEn : PRAYER_META[id].shortId;
}
