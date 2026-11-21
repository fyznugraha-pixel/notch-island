import React from "react";
import { Cloud, CloudLightning, CloudRain, CloudSun, MapPin, Moon, Sun } from "lucide-react";
import { StandbyPalette } from "../standbyTheme";
import { Language } from "../../../services/i18n";
import { WeatherData } from "../../../services/weatherService";
import {
  PrayerScheduleData,
  getNextPrayerStatus,
  getPrayerDisplayName,
} from "../../../services/prayerService";

export function describeWeatherCode(code: number, language: Language): string {
  const isId = language === "id";
  if (code === 0) return isId ? "Cerah" : "Clear Sky";
  if (code >= 1 && code <= 3) return isId ? "Berawan" : "Partly Cloudy";
  if (code === 45 || code === 48) return isId ? "Berkabut" : "Foggy";
  if (code >= 51 && code <= 67) return isId ? "Hujan Ringan" : "Rain";
  if (code >= 71 && code <= 77) return isId ? "Salju" : "Snow";
  if (code >= 80 && code <= 82) return isId ? "Hujan Deras" : "Showers";
  if (code >= 95) return isId ? "Badai Petir" : "Thunderstorm";
  return isId ? "Cerah Berawan" : "Fair";
}

export function renderWeatherIcon(code: number, night: boolean, size: number, color: string) {
  if (code >= 95) return <CloudLightning size={size} style={{ color }} />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return <CloudRain size={size} style={{ color }} />;
  }
  if (code >= 1 && code <= 3) {
    return night ? <Moon size={size} style={{ color }} /> : <CloudSun size={size} style={{ color }} />;
  }
  if (code === 45 || code === 48) return <Cloud size={size} style={{ color }} />;
  return night ? <Moon size={size} style={{ color }} /> : <Sun size={size} style={{ color }} />;
}

interface StandbyWeatherPrayerWidgetProps {
  now: Date;
  palette: StandbyPalette;
  language: Language;
  weather: WeatherData | null;
  weatherLoading: boolean;
  schedule: PrayerScheduleData;
}

export const StandbyWeatherPrayerWidget: React.FC<StandbyWeatherPrayerWidgetProps> = ({
  now,
  palette,
  language,
  weather,
  weatherLoading,
  schedule,
}) => {
  const isId = language === "id";
  const nextPrayer = getNextPrayerStatus(schedule, now);
  const prayerLabel = getPrayerDisplayName(nextPrayer.nextPrayer, language);
  const isNightHour = now.getHours() >= 18 || now.getHours() < 6;
  const iconColor = palette.night ? palette.textPrimary : "#ff9f0a";

  return (
    <div className="flex flex-col justify-between w-full h-full px-3 sm:px-5 py-2 select-none overflow-hidden">
      <div className="flex items-start justify-between gap-4 min-w-0">
        <div className="flex flex-col min-w-0">
          <div
            className="flex items-center gap-1.5 font-semibold"
            style={{ color: palette.textSecondary, fontSize: "clamp(13px, min(1.2vw, 2.1vh), 17px)" }}
          >
            <MapPin size={15} className="shrink-0" />
            <span className="truncate">{weather?.locationName || schedule.locationName}</span>
          </div>
          {weather ? (
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 mt-2">
              <span
                className="font-bold tracking-[-0.04em] leading-none tabular-nums"
                style={{
                  color: palette.textPrimary,
                  fontSize: "clamp(54px, min(6.6vw, 11.5vh), 98px)",
                }}
              >
                {weather.temp}
              </span>
              <span
                className="font-medium truncate"
                style={{
                  color: palette.textSecondary,
                  fontSize: "clamp(15px, min(1.6vw, 2.8vh), 22px)",
                }}
              >
                {describeWeatherCode(weather.code, language)}
              </span>
            </div>
          ) : (
            <div
              className="mt-3 text-[15px] font-medium"
              style={{ color: palette.textSecondary }}
            >
              {weatherLoading
                ? isId
                  ? "Memuat info cuaca..."
                  : "Loading weather..."
                : isId
                  ? "Cuaca tidak tersedia"
                  : "Weather unavailable"}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center shrink-0 pt-2">
          {renderWeatherIcon(weather?.code ?? 1, isNightHour, 46, iconColor)}
        </div>
      </div>

      <div
        className="mt-4 pt-5 flex items-center justify-between gap-4 border-t shrink-0"
        style={{ borderColor: palette.cardBorder }}
      >
        <div className="flex flex-col min-w-0">
          <span
            className="text-[11.5px] font-bold uppercase tracking-[0.08em]"
            style={{ color: palette.night ? palette.textPrimary : "#30d158" }}
          >
            {isId ? "Sholat Berikutnya" : "Next Prayer"}
          </span>
          <span
            className="font-bold mt-0.5 leading-tight truncate"
            style={{
              color: palette.textPrimary,
              fontSize: "clamp(20px, min(2.2vw, 4vh), 32px)",
            }}
          >
            {prayerLabel}
          </span>
        </div>

        <div className="flex flex-col items-end shrink-0">
          <span
            className="font-bold tabular-nums leading-none"
            style={{
              color: palette.textPrimary,
              fontSize: "clamp(22px, min(2.5vw, 4.4vh), 36px)",
            }}
          >
            {nextPrayer.nextPrayerTime}
          </span>
          <span
            className="font-medium mt-1 tabular-nums"
            style={{
              color: palette.textSecondary,
              fontSize: "clamp(12px, min(1.05vw, 1.9vh), 14.5px)",
            }}
          >
            {isId ? `dalam ${nextPrayer.countdownText}` : `in ${nextPrayer.countdownText}`}
          </span>
        </div>
      </div>
    </div>
  );
};
