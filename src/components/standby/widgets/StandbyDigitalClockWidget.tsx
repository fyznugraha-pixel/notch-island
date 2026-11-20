import React from "react";
import { Battery, BatteryCharging } from "lucide-react";
import { StandbyPalette, formatTimeParts } from "../standbyTheme";
import { Language } from "../../../services/i18n";

export interface StandbyPowerState {
  percent: number;
  is_charging: boolean;
}

interface StandbyDigitalClockWidgetProps {
  now: Date;
  palette: StandbyPalette;
  use24h: boolean;
  showSeconds: boolean;
  reducedMotion?: boolean;
  language: Language;
  battery: StandbyPowerState | null;
}

export const StandbyDigitalClockWidget: React.FC<StandbyDigitalClockWidgetProps> = ({
  now,
  palette,
  use24h,
  showSeconds,
  reducedMotion = false,
  language,
  battery,
}) => {
  const { hours, minutes, seconds, period } = formatTimeParts(now, use24h);
  const locale = language === "id" ? "id-ID" : "en-US";
  const dateLabel = now.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="flex flex-col justify-between w-full h-full px-3 sm:px-5 py-2 select-none overflow-hidden">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span
          className="font-semibold tracking-tight truncate"
          style={{ color: palette.textSecondary, fontSize: "clamp(13.5px, min(1.3vw, 2.2vh), 18px)" }}
        >
          {dateLabel}
        </span>
        {battery && (
          <div
            className="flex items-center gap-1.5 text-[13px] font-semibold shrink-0"
            style={{
              color: battery.is_charging && !palette.night ? "#30d158" : palette.textSecondary,
            }}
          >
            {battery.is_charging ? <BatteryCharging size={15} /> : <Battery size={15} />}
            <span className="tabular-nums">{battery.percent}%</span>
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2.5 my-auto py-2 min-w-0">
        <span
          className="font-black tracking-[-0.05em] leading-[0.95] tabular-nums whitespace-nowrap"
          style={{
            color: palette.night ? palette.textPrimary : palette.accent,
            fontSize: "clamp(58px, min(7.8vw, 13.5vh), 130px)",
          }}
        >
          {hours}
          <span className={reducedMotion ? "" : "animate-standby-colon"}>:</span>
          {minutes}
        </span>
        <div className="flex flex-col items-start justify-end gap-1 pb-1 shrink-0">
          {showSeconds && (
            <span
              className="font-bold tracking-tight tabular-nums leading-none"
              style={{
                color: palette.textSecondary,
                fontSize: "clamp(18px, min(2.2vw, 4vh), 34px)",
              }}
            >
              {seconds}
            </span>
          )}
          {period && (
            <span
              className="font-bold tracking-[0.1em]"
              style={{
                color: palette.textSecondary,
                fontSize: "clamp(12px, min(1.2vw, 2vh), 17px)",
              }}
            >
              {period}
            </span>
          )}
        </div>
      </div>

      <div className="h-2 shrink-0" aria-hidden="true" />
    </div>
  );
};
