import React from "react";
import { Battery, BatteryCharging, Music } from "lucide-react";
import { StandbyClockStyle } from "../../../services/standbyService";
import { Language } from "../../../services/i18n";
import { WeatherData } from "../../../services/weatherService";
import { MediaPayload } from "../../../services/mediaLyricsStore";
import { useResolvedThumbnail } from "../../ui/MediaThumbnail";
import { StandbyPalette, formatTimeParts } from "../standbyTheme";
import { StandbyAnalogClockWidget } from "../widgets/StandbyAnalogClockWidget";
import { StandbyPowerState } from "../widgets/StandbyDigitalClockWidget";
import { describeWeatherCode, renderWeatherIcon } from "../widgets/StandbyWeatherPrayerWidget";

interface StandbyClockFaceViewProps {
  now: Date;
  style: StandbyClockStyle;
  palette: StandbyPalette;
  use24h: boolean;
  showSeconds: boolean;
  reducedMotion?: boolean;
  language: Language;
  battery: StandbyPowerState | null;
  weather: WeatherData | null;
  media: MediaPayload;
  onSelectMediaScreen: () => void;
  onCycleClockStyle: () => void;
}

export const StandbyClockFaceView: React.FC<StandbyClockFaceViewProps> = ({
  now,
  style,
  palette,
  use24h,
  showSeconds,
  reducedMotion = false,
  language,
  battery,
  weather,
  media,
  onSelectMediaScreen,
  onCycleClockStyle,
}) => {
  const isId = language === "id";
  const locale = isId ? "id-ID" : "en-US";
  const { hours, minutes, seconds, period } = formatTimeParts(now, use24h);
  const fullDate = now.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const isNightHour = now.getHours() >= 18 || now.getHours() < 6;
  const primaryColor = palette.night ? palette.textPrimary : palette.accent;
  const hasMedia = Boolean(media.title && media.title.trim().length > 0);
  const resolvedArt = useResolvedThumbnail(media);

  const shouldUseGlassNumeralGradient = !palette.night && primaryColor.toLowerCase() === "#f5f5f7";
  const numeralGradientStyle: React.CSSProperties = shouldUseGlassNumeralGradient
    ? {
        backgroundImage: "linear-gradient(180deg, #ffffff 28%, rgba(255,255,255,0.72) 100%)",
        WebkitBackgroundClip: "text",
        color: "transparent",
      }
    : {
        color: primaryColor,
      };
  const colonClass = reducedMotion ? "" : "animate-standby-colon";

  return (
    <div className="w-[min(94vw,1540px)] max-h-screen mx-auto px-6 py-16 flex flex-col items-center justify-center gap-6 select-none">
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <span
          className="font-semibold tracking-wide"
          style={{ color: palette.textSecondary, fontSize: "clamp(14px, min(1.3vw, 2.2vh), 18px)" }}
        >
          {fullDate}
        </span>

        {weather && (
          <span
            className="font-semibold flex items-center gap-2"
            style={{ color: palette.textPrimary, fontSize: "clamp(14px, min(1.3vw, 2.2vh), 18px)" }}
          >
            <span className="opacity-35">·</span>
            {renderWeatherIcon(
              weather.code,
              isNightHour,
              17,
              palette.night ? palette.textPrimary : "#ff9f0a",
            )}
            <span className="tabular-nums">{weather.temp}</span>
            <span style={{ color: palette.textSecondary }}>
              {describeWeatherCode(weather.code, language)}
            </span>
          </span>
        )}

        {battery && (
          <span
            className="font-semibold flex items-center gap-2 tabular-nums"
            style={{
              color: battery.is_charging && !palette.night ? "#30d158" : palette.textPrimary,
              fontSize: "clamp(14px, min(1.3vw, 2.2vh), 18px)",
            }}
          >
            <span className="opacity-35" style={{ color: palette.textSecondary }}>·</span>
            {battery.is_charging ? <BatteryCharging size={17} /> : <Battery size={17} />}
            <span>{battery.percent}%</span>
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onCycleClockStyle}
        aria-label={isId ? "Ubah gaya jam" : "Switch clock style"}
        className="group max-w-full cursor-pointer rounded-[32px] px-4 sm:px-6 py-3 transition-transform active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
      >
        {style === "analog_rail" ? (
          <div className="flex items-center justify-center">
            <StandbyAnalogClockWidget
              now={now}
              palette={palette}
              showSeconds={showSeconds}
              reducedMotion={reducedMotion}
              language={language}
              fillHeight={false}
            />
          </div>
        ) : style === "editorial_serif" ? (
          <div className="flex items-baseline justify-center gap-4 max-w-full">
            <span
              className="font-bold tracking-[-0.03em] leading-[0.98] tabular-nums whitespace-nowrap px-2 py-2"
              style={{
                ...numeralGradientStyle,
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: "clamp(88px, min(15.5vw, 28vh), 275px)",
              }}
            >
              {hours}
              <span className={colonClass}>:</span>
              {minutes}
            </span>
            {showSeconds && (
              <span
                className="font-semibold tabular-nums whitespace-nowrap"
                style={{
                  color: palette.textSecondary,
                  fontSize: "clamp(26px, min(3.4vw, 6vh), 58px)",
                }}
              >
                {seconds}
              </span>
            )}
          </div>
        ) : style === "minimal_mono" ? (
          <div className="flex flex-col items-center max-w-full">
            <div className="flex items-baseline justify-center gap-4 font-mono">
              <span
                className="font-light tracking-[-0.04em] leading-[1] tabular-nums whitespace-nowrap px-2 py-1"
                style={{
                  ...numeralGradientStyle,
                  fontSize: "clamp(82px, min(14vw, 26vh), 248px)",
                }}
              >
                {hours}
                <span className={colonClass}>:</span>
                {minutes}
              </span>
              {showSeconds && (
                <span
                  className="font-normal tabular-nums whitespace-nowrap"
                  style={{
                    color: palette.textSecondary,
                    fontSize: "clamp(24px, min(3.2vw, 5.5vh), 54px)",
                  }}
                >
                  {seconds}
                </span>
              )}
            </div>
            {period && (
              <span
                className="font-semibold tracking-[0.22em] mt-2"
                style={{
                  color: palette.textSecondary,
                  fontSize: "clamp(14px, min(1.6vw, 2.8vh), 22px)",
                }}
              >
                {period}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-baseline justify-center gap-4 max-w-full">
            <span
              className="font-black tracking-[-0.05em] leading-[0.96] tabular-nums whitespace-nowrap px-2 py-2"
              style={{
                ...numeralGradientStyle,
                fontSize: "clamp(92px, min(16.5vw, 29vh), 290px)",
              }}
            >
              {hours}
              <span className={colonClass}>:</span>
              {minutes}
            </span>
            <div className="flex flex-col items-start gap-1.5">
              {showSeconds && (
                <span
                  className="font-bold tabular-nums leading-none whitespace-nowrap"
                  style={{
                    color: palette.textSecondary,
                    fontSize: "clamp(28px, min(3.8vw, 6.6vh), 64px)",
                  }}
                >
                  {seconds}
                </span>
              )}
              {period && (
                <span
                  className="font-bold tracking-[0.14em]"
                  style={{
                    color: palette.textSecondary,
                    fontSize: "clamp(14px, min(1.7vw, 3vh), 24px)",
                  }}
                >
                  {period}
                </span>
              )}
            </div>
          </div>
        )}
      </button>

      {hasMedia && (
        <button
          type="button"
          onClick={onSelectMediaScreen}
          className="px-3 py-1.5 rounded-full flex items-center gap-3 font-semibold transition-opacity hover:opacity-100 opacity-90 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff] max-w-[90vw]"
          style={{ color: palette.textPrimary, fontSize: "clamp(13.5px, min(1.25vw, 2.1vh), 17px)" }}
        >
          <div
            className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0"
            style={{ backgroundColor: palette.mutedChipBg }}
          >
            {resolvedArt ? (
              <img
                src={resolvedArt}
                alt={media.title}
                width={32}
                height={32}
                className="w-full h-full object-cover"
              />
            ) : (
              <Music size={15} style={{ color: palette.night ? palette.textPrimary : "#ff9f0a" }} />
            )}
          </div>
          <span className="truncate max-w-[360px]">{media.title}</span>
          {media.artist && (
            <span className="truncate max-w-[240px]" style={{ color: palette.textSecondary }}>
              · {media.artist}
            </span>
          )}
        </button>
      )}
    </div>
  );
};
