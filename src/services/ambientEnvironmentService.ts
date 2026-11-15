import { getLocalDateKey } from "../utils/dateTime";

export interface GeoLocationResult {
  name: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
}

export interface WeatherInfo {
  city: string;
  temp: number;
  condition: string;
  isRain: boolean;
  humidity: number;
  updatedAt: number;
}

export interface AirQualityInfo {
  city: string;
  aqi: number;
  pm25: number;
  pm10: number;
  updatedAt: number;
}

export interface PrayerScheduleItem {
  name: string;
  time: string;
}

export interface PrayerScheduleData {
  city: string;
  dateKey: string;
  source: "aladhan" | "fallback";
  timings: PrayerScheduleItem[];
}

export const DEFAULT_PRAYER_TIMINGS: PrayerScheduleItem[] = [
  { name: "Subuh", time: "04:32" },
  { name: "Dzuhur", time: "11:51" },
  { name: "Ashar", time: "15:12" },
  { name: "Maghrib", time: "17:54" },
  { name: "Isya", time: "19:04" },
];

export async function geocodeCity(city: string): Promise<GeoLocationResult | null> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city.trim()
    )}&count=1&language=id`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const loc = data?.results?.[0];
  if (!loc) return null;
  return {
    name: loc.name || city.trim(),
    latitude: loc.latitude,
    longitude: loc.longitude,
    countryCode: loc.country_code,
  };
}

function describeWmoCode(code: number): { label: string; isRain: boolean } {
  if (code >= 95) return { label: "Hujan petir", isRain: true };
  if (code >= 80) return { label: "Hujan lebat", isRain: true };
  if (code >= 61) return { label: "Hujan", isRain: true };
  if (code >= 51) return { label: "Gerimis", isRain: true };
  if (code === 45 || code === 48) return { label: "Berkabut", isRain: false };
  if (code >= 2) return { label: "Berawan", isRain: false };
  return { label: "Cerah", isRain: false };
}

export async function fetchLiveWeather(city: string): Promise<WeatherInfo | null> {
  const loc = await geocodeCity(city);
  if (!loc) return null;
  const wRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,weather_code`
  );
  if (!wRes.ok) return null;
  const wData = await wRes.json();
  if (!wData?.current) return null;
  const code = Number(wData.current.weather_code ?? 0);
  const desc = describeWmoCode(code);
  return {
    city: loc.name,
    temp: Math.round(Number(wData.current.temperature_2m ?? 0)),
    condition: desc.label,
    isRain: desc.isRain,
    humidity: Math.round(Number(wData.current.relative_humidity_2m ?? 0)),
    updatedAt: Date.now(),
  };
}

export async function fetchLiveAirQuality(city: string): Promise<AirQualityInfo | null> {
  const loc = await geocodeCity(city);
  if (!loc) return null;
  const aqRes = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.latitude}&longitude=${loc.longitude}&current=us_aqi,pm2_5,pm10`
  );
  if (!aqRes.ok) return null;
  const aqData = await aqRes.json();
  if (!aqData?.current) return null;
  return {
    city: loc.name,
    aqi: Math.round(Number(aqData.current.us_aqi ?? 0)),
    pm25: Math.round(Number(aqData.current.pm2_5 ?? 0) * 10) / 10,
    pm10: Math.round(Number(aqData.current.pm10 ?? 0) * 10) / 10,
    updatedAt: Date.now(),
  };
}

function cleanAladhanTime(raw?: string): string {
  if (!raw) return "00:00";
  return raw.split(" ")[0].slice(0, 5);
}

export async function fetchLivePrayerTimes(
  city: string,
  country = "ID"
): Promise<PrayerScheduleData | null> {
  const dateKey = getLocalDateKey();
  const [y, m, d] = dateKey.split("-");
  // Aladhan endpoint expects DD-MM-YYYY and method=20 (Kemenag RI)
  const url = `https://api.aladhan.com/v1/timingsByCity/${d}-${m}-${y}?city=${encodeURIComponent(
    city.trim()
  )}&country=${encodeURIComponent(country)}&method=20`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const t = json?.data?.timings;
  if (!t) return null;
  return {
    city: city.trim(),
    dateKey,
    source: "aladhan",
    timings: [
      { name: "Subuh", time: cleanAladhanTime(t.Fajr) },
      { name: "Dzuhur", time: cleanAladhanTime(t.Dhuhr) },
      { name: "Ashar", time: cleanAladhanTime(t.Asr) },
      { name: "Maghrib", time: cleanAladhanTime(t.Maghrib) },
      { name: "Isya", time: cleanAladhanTime(t.Isha) },
    ],
  };
}
