import React from "react";
import { Check, Droplets, MapPin } from "lucide-react";
import { StandbyPalette } from "../standbyTheme";
import { Language } from "../../../services/i18n";
import { WeatherData } from "../../../services/weatherService";
import {
  PRAYER_ORDER,
  PrayerId,
  PrayerScheduleData,
  getNextPrayerStatus,
  getPrayerDisplayName,
} from "../../../services/prayerService";
import { TodoItem } from "../../../services/todoUtils";
import { getDailyIntake, loadWaterData } from "../../../services/waterService";
import { describeWeatherCode, renderWeatherIcon } from "../widgets/StandbyWeatherPrayerWidget";

interface StandbyWeatherBoardViewProps {
  now: Date;
  palette: StandbyPalette;
  language: Language;
  weather: WeatherData | null;
  weatherLoading: boolean;
  schedule: PrayerScheduleData;
  completedPrayers: PrayerId[];
  todos: TodoItem[];
  onTogglePrayer: (id: PrayerId) => void;
}

export const StandbyWeatherBoardView: React.FC<StandbyWeatherBoardViewProps> = ({
  now,
  palette,
  language,
  weather,
  weatherLoading,
  schedule,
  completedPrayers,
  todos,
  onTogglePrayer,
}) => {
  const isId = language === "id";
  const nextStatus = getNextPrayerStatus(schedule, now);
  const dailyWater = getDailyIntake(now, loadWaterData());
  const pendingTodos = todos.filter((t) => !t.completed);
  const isNightHour = now.getHours() >= 18 || now.getHours() < 6;
  const iconColor = palette.night ? palette.textPrimary : "#ff9f0a";

  return (
    <div className="w-[min(90vw,1460px)] max-h-screen mx-auto px-6 sm:px-10 py-16 flex flex-col justify-center gap-10 select-none">
      {/* Top Hero Row: Frameless Weather Summary + Hydration / Tasks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-center">
        <div className="md:col-span-2 flex items-center justify-between gap-6 min-w-0">
          <div className="flex flex-col min-w-0">
            <div
              className="flex items-center gap-2 font-semibold"
              style={{ color: palette.textSecondary, fontSize: "clamp(13px, min(1.2vw, 2.1vh), 17px)" }}
            >
              <MapPin size={16} className="shrink-0" />
              <span className="truncate">{weather?.locationName || schedule.locationName}</span>
            </div>
            {weather ? (
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mt-2">
                <span
                  className="font-bold tracking-[-0.045em] leading-none tabular-nums"
                  style={{
                    color: palette.textPrimary,
                    fontSize: "clamp(64px, min(7.8vw, 13vh), 124px)",
                  }}
                >
                  {weather.temp}
                </span>
                <div className="flex flex-col min-w-0">
                  <span
                    className="font-semibold truncate"
                    style={{
                      color: palette.textPrimary,
                      fontSize: "clamp(20px, min(2.2vw, 3.8vh), 32px)",
                    }}
                  >
                    {describeWeatherCode(weather.code, language)}
                  </span>
                  <span
                    className="mt-1 truncate"
                    style={{
                      color: palette.textSecondary,
                      fontSize: "clamp(13px, min(1.15vw, 2vh), 16px)",
                    }}
                  >
                    {schedule.hijriDate || (isId ? "Cuaca langsung" : "Live weather")}
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="mt-4 text-[16px] font-medium"
                style={{ color: palette.textSecondary }}
              >
                {weatherLoading
                  ? isId
                    ? "Mengambil data cuaca terbaru..."
                    : "Fetching latest weather..."
                  : isId
                  ? "Data cuaca belum tersedia"
                  : "Weather data unavailable"}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center shrink-0">
            {renderWeatherIcon(weather?.code ?? 1, isNightHour, 58, iconColor)}
          </div>
        </div>

        <div
          className="flex flex-col justify-between gap-4 min-w-0 md:border-l md:pl-10"
          style={{ borderColor: palette.cardBorder }}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[12.5px] font-bold uppercase tracking-[0.08em] truncate"
              style={{ color: palette.night ? palette.textPrimary : "#32ade6" }}
            >
              <Droplets size={15} className="inline mr-1.5" />
              {isId ? "Hidrasi & Tugas" : "Hydration & Tasks"}
            </span>
            <span
              className="text-[13.5px] font-bold tabular-nums shrink-0"
              style={{ color: palette.textSecondary }}
            >
              {dailyWater.percent}%
            </span>
          </div>

          <div>
            <div
              className="font-bold tabular-nums leading-tight"
              style={{
                color: palette.textPrimary,
                fontSize: "clamp(34px, min(3.6vw, 6.2vh), 54px)",
              }}
            >
              {dailyWater.totalL.toFixed(2)} L
            </div>
            <div
              className="mt-1 tabular-nums truncate"
              style={{
                color: palette.textSecondary,
                fontSize: "clamp(13px, min(1.15vw, 2vh), 15.5px)",
              }}
            >
              {isId
                ? `Target ${dailyWater.targetL.toFixed(1)} L · ${pendingTodos.length} tugas tersisa`
                : `Goal ${dailyWater.targetL.toFixed(1)} L · ${pendingTodos.length} tasks remaining`}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Strip: Frameless 5-Prayer Daily Schedule */}
      <div
        className="pt-8 border-t flex flex-col gap-5"
        style={{ borderColor: palette.cardBorder }}
      >
        <div className="flex items-center justify-between gap-3">
          <span
            className="text-[13px] font-bold uppercase tracking-[0.08em] truncate"
            style={{ color: palette.night ? palette.textPrimary : "#30d158" }}
          >
            {isId
              ? `Jadwal Sholat · Berikutnya ${getPrayerDisplayName(nextStatus.nextPrayer, language)} dalam ${nextStatus.countdownText}`
              : `Prayer Times · Next ${getPrayerDisplayName(nextStatus.nextPrayer, language)} in ${nextStatus.countdownText}`}
          </span>
          <span
            className="text-[13px] font-medium tabular-nums shrink-0"
            style={{ color: palette.textSecondary }}
          >
            {completedPrayers.length}/5 {isId ? "selesai" : "completed"}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-6">
          {PRAYER_ORDER.map((id) => {
            const isNext = nextStatus.nextPrayer === id && !nextStatus.isTomorrow;
            const isDone = completedPrayers.includes(id);
            const activeHighlight = palette.night ? palette.textPrimary : "#30d158";
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTogglePrayer(id)}
                className="py-2 flex flex-col items-start justify-between gap-2 text-left transition-opacity hover:opacity-100 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff] rounded-xl min-w-0"
                style={{
                  opacity: isNext ? 1 : isDone ? 0.55 : 0.8,
                }}
              >
                <div className="flex items-center gap-2 w-full">
                  <span
                    className="font-semibold truncate"
                    style={{
                      color: isNext ? activeHighlight : palette.textSecondary,
                      fontSize: "clamp(13.5px, min(1.25vw, 2.2vh), 18px)",
                    }}
                  >
                    {getPrayerDisplayName(id, language)}
                  </span>
                  {isDone && (
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: activeHighlight, color: "#000000" }}
                    >
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <span
                  className="font-bold tabular-nums leading-none"
                  style={{
                    color: isNext ? activeHighlight : palette.textPrimary,
                    fontSize: "clamp(24px, min(2.6vw, 4.6vh), 40px)",
                  }}
                >
                  {schedule.timings[id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
