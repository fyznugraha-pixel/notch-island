import React from "react";
import { StandbyPalette } from "../standbyTheme";
import { Language } from "../../../services/i18n";

interface StandbyAnalogClockWidgetProps {
  now: Date;
  palette: StandbyPalette;
  showSeconds: boolean;
  reducedMotion?: boolean;
  language: Language;
  fillHeight?: boolean;
}

const RAILWAY_TICKS = Array.from({ length: 60 }, (_, idx) => {
  const isHour = idx % 5 === 0;
  const angle = (idx * 6 * Math.PI) / 180;
  const innerR = isHour ? 89 : 93;
  const outerR = 98;
  return {
    idx,
    isHour,
    x1: 110 + Math.sin(angle) * innerR,
    y1: 110 - Math.cos(angle) * innerR,
    x2: 110 + Math.sin(angle) * outerR,
    y2: 110 - Math.cos(angle) * outerR,
  };
});

const CLOCK_NUMERALS = Array.from({ length: 12 }, (_, i) => {
  const num = i === 0 ? 12 : i;
  const isCardinal = num % 3 === 0;
  const angle = (i * 30 * Math.PI) / 180;
  const r = 74;
  return {
    num,
    isCardinal,
    x: 110 + Math.sin(angle) * r,
    y: 110 - Math.cos(angle) * r + (isCardinal ? 5.2 : 4.6),
  };
});

interface StaticClockDialProps {
  night: boolean;
  textPrimary: string;
  textSecondary: string;
  accentColor: string;
  weekdayLabel: string;
  dayNum: string;
}

const StaticClockDial = React.memo<StaticClockDialProps>(
  ({ night, textPrimary, textSecondary, accentColor, weekdayLabel, dayNum }) => {
    const dialGradId = night ? "standby-dial-night" : "standby-dial-day";

    return (
      <svg viewBox="0 0 220 220" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <defs>
          <radialGradient id={dialGradId} cx="50%" cy="24%" r="76%">
            <stop offset="0%" stopColor={night ? "#120406" : "#15161b"} />
            <stop offset="100%" stopColor={night ? "#000000" : "#070709"} />
          </radialGradient>
        </defs>

        <circle
          cx="110"
          cy="110"
          r="105"
          fill={`url(#${dialGradId})`}
          stroke={night ? "rgba(255,69,58,0.24)" : "rgba(255,255,255,0.12)"}
          strokeWidth="1.2"
        />

        {RAILWAY_TICKS.map((tick) => (
          <line
            key={tick.idx}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke={tick.isHour ? textPrimary : textSecondary}
            strokeOpacity={tick.isHour ? 0.92 : 0.34}
            strokeWidth={tick.isHour ? 2.1 : 1}
            strokeLinecap="round"
          />
        ))}

        {CLOCK_NUMERALS.map((item) => (
          <text
            key={item.num}
            x={item.x}
            y={item.y}
            textAnchor="middle"
            fill={textPrimary}
            fillOpacity={item.isCardinal ? 0.98 : 0.78}
            fontSize={item.isCardinal ? "15.5" : "13"}
            fontWeight={item.isCardinal ? "700" : "600"}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {item.num}
          </text>
        ))}

        <g transform="translate(110, 148)">
          <text
            x="0"
            y="0"
            textAnchor="middle"
            fill={accentColor}
            fontSize="10.5"
            fontWeight="700"
            letterSpacing="0.14em"
          >
            {weekdayLabel} {dayNum}
          </text>
        </g>
      </svg>
    );
  },
);

interface HourMinuteHandsProps {
  hourAngle: number;
  minuteAngle: number;
  textPrimary: string;
}

const HourMinuteHands = React.memo<HourMinuteHandsProps>(
  ({ hourAngle, minuteAngle, textPrimary }) => (
    <svg viewBox="0 0 220 220" className="absolute inset-0 w-full h-full" aria-hidden="true">
      <g transform={`rotate(${hourAngle} 110 110)`}>
        <line
          x1="110"
          y1="110"
          x2="110"
          y2="92"
          stroke={textPrimary}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <rect x="106.7" y="59" width="6.6" height="36" rx="3.3" fill={textPrimary} />
      </g>

      <g transform={`rotate(${minuteAngle} 110 110)`}>
        <line
          x1="110"
          y1="110"
          x2="110"
          y2="90"
          stroke={textPrimary}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <rect x="107.4" y="34" width="5.2" height="58" rx="2.6" fill={textPrimary} />
      </g>
    </svg>
  ),
);

export const StandbyAnalogClockWidget: React.FC<StandbyAnalogClockWidgetProps> = React.memo(
  ({ now, palette, showSeconds, language, fillHeight = true }) => {
    const hours = now.getHours() % 12;
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    // Update hour/minute geometry on minute boundaries so 1Hz ticks never repaint them.
    const hourAngle = hours * 30 + minutes * 0.5;
    const minuteAngle = minutes * 6;
    const secondAngle = seconds * 6;

    const locale = language === "id" ? "id-ID" : "en-US";
    const weekdayLabel = now.toLocaleDateString(locale, { weekday: "short" }).toUpperCase();
    const dayNum = String(now.getDate());
    const accentColor = palette.night ? palette.textPrimary : "#ff9f0a";
    const ariaTimeLabel = now.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Put drop elevation on a static circular box-shadow instead of SVG filter: drop-shadow()
    // so ticking the second hand never invalidates or re-blurs the 60-tick dial.
    const dialFrameStyle: React.CSSProperties = fillHeight
      ? {
          maxWidth: "min(100%, 58vh, 560px)",
          maxHeight: "min(100%, 58vh, 560px)",
          boxShadow: palette.night ? "none" : "0 28px 64px rgba(0, 0, 0, 0.7)",
        }
      : {
          width: "clamp(250px, min(46vw, 54vh), 480px)",
          height: "clamp(250px, min(46vw, 54vh), 480px)",
          boxShadow: palette.night ? "none" : "0 32px 72px rgba(0, 0, 0, 0.75)",
        };

    return (
      <div
        className={
          fillHeight
            ? "flex flex-col items-center justify-center w-full h-full select-none"
            : "inline-flex items-center justify-center select-none"
        }
      >
        <div
          className={
            fillHeight
              ? "relative w-full h-full aspect-square rounded-full"
              : "relative aspect-square shrink-0 rounded-full"
          }
          style={dialFrameStyle}
          role="img"
          aria-label={ariaTimeLabel}
        >
          <StaticClockDial
            night={palette.night}
            textPrimary={palette.textPrimary}
            textSecondary={palette.textSecondary}
            accentColor={accentColor}
            weekdayLabel={weekdayLabel}
            dayNum={dayNum}
          />

          <HourMinuteHands
            hourAngle={hourAngle}
            minuteAngle={minuteAngle}
            textPrimary={palette.textPrimary}
          />

          <svg viewBox="0 0 220 220" className="absolute inset-0 w-full h-full" aria-hidden="true">
            {showSeconds && (
              <g transform={`rotate(${secondAngle} 110 110)`}>
                <line
                  x1="110"
                  y1="127"
                  x2="110"
                  y2="25"
                  stroke={accentColor}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <circle cx="110" cy="127" r="2.2" fill={accentColor} />
              </g>
            )}
            <circle cx="110" cy="110" r="4.6" fill={accentColor} />
            <circle cx="110" cy="110" r="1.9" fill="#000000" />
          </svg>
        </div>
      </div>
    );
  },
);
