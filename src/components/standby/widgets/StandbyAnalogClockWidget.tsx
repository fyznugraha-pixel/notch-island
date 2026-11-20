import React, { useEffect, useRef } from "react";
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

export const StandbyAnalogClockWidget: React.FC<StandbyAnalogClockWidgetProps> = ({
  now,
  palette,
  showSeconds,
  reducedMotion = false,
  language,
  fillHeight = true,
}) => {
  const secondHandRef = useRef<SVGGElement | null>(null);

  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const millis = now.getMilliseconds();

  const hourAngle = hours * 30 + minutes * 0.5 + seconds * (0.5 / 60);
  const minuteAngle = minutes * 6 + seconds * 0.1;
  const initialSecondAngle = (seconds + (reducedMotion ? 0 : millis / 1000)) * 6;

  // 60fps mechanical sweep on the SVG transform attribute directly (zero React re-renders)
  useEffect(() => {
    if (!showSeconds || reducedMotion) return;
    let rafId = 0;
    const tick = () => {
      const el = secondHandRef.current;
      if (el) {
        const d = new Date();
        const angle = (d.getSeconds() + d.getMilliseconds() / 1000) * 6;
        el.setAttribute("transform", `rotate(${angle.toFixed(2)} 110 110)`);
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [showSeconds, reducedMotion]);

  const locale = language === "id" ? "id-ID" : "en-US";
  const weekdayLabel = now.toLocaleDateString(locale, { weekday: "short" }).toUpperCase();
  const dayNum = String(now.getDate());
  const accentColor = palette.night ? palette.textPrimary : "#ff9f0a";
  const dialGradId = palette.night ? "standby-dial-night" : "standby-dial-day";

  return (
    <div
      className={
        fillHeight
          ? "flex flex-col items-center justify-center w-full h-full select-none"
          : "inline-flex items-center justify-center select-none"
      }
    >
      <svg
        viewBox="0 0 220 220"
        className={
          fillHeight
            ? "w-full h-full aspect-square"
            : "aspect-square shrink-0"
        }
        style={
          fillHeight
            ? {
                maxWidth: "min(100%, 58vh, 560px)",
                maxHeight: "min(100%, 58vh, 560px)",
                filter: palette.night
                  ? "none"
                  : "drop-shadow(0 28px 64px rgba(0, 0, 0, 0.7))",
              }
            : {
                width: "clamp(250px, min(46vw, 54vh), 480px)",
                height: "clamp(250px, min(46vw, 54vh), 480px)",
                filter: palette.night
                  ? "none"
                  : "drop-shadow(0 32px 72px rgba(0, 0, 0, 0.75))",
              }
        }
        role="img"
        aria-label={now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
      >
        <defs>
          <radialGradient id={dialGradId} cx="50%" cy="24%" r="76%">
            <stop offset="0%" stopColor={palette.night ? "#120406" : "#15161b"} />
            <stop offset="100%" stopColor={palette.night ? "#000000" : "#070709"} />
          </radialGradient>
        </defs>

        {/* Subtle obsidian dial surface */}
        <circle
          cx="110"
          cy="110"
          r="105"
          fill={`url(#${dialGradId})`}
          stroke={palette.night ? "rgba(255,69,58,0.24)" : "rgba(255,255,255,0.12)"}
          strokeWidth="1.2"
        />

        {/* Precision 60-minute railway ticks */}
        {Array.from({ length: 60 }, (_, idx) => {
          const isHour = idx % 5 === 0;
          const angle = (idx * 6 * Math.PI) / 180;
          const innerR = isHour ? 89 : 93;
          const outerR = 98;
          const x1 = 110 + Math.sin(angle) * innerR;
          const y1 = 110 - Math.cos(angle) * innerR;
          const x2 = 110 + Math.sin(angle) * outerR;
          const y2 = 110 - Math.cos(angle) * outerR;
          return (
            <line
              key={idx}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isHour ? palette.textPrimary : palette.textSecondary}
              strokeOpacity={isHour ? 0.92 : 0.34}
              strokeWidth={isHour ? 2.1 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Full 1-12 horology numerals */}
        {Array.from({ length: 12 }, (_, i) => {
          const num = i === 0 ? 12 : i;
          const isCardinal = num % 3 === 0;
          const angle = (i * 30 * Math.PI) / 180;
          const r = 74;
          const x = 110 + Math.sin(angle) * r;
          const y = 110 - Math.cos(angle) * r;
          return (
            <text
              key={num}
              x={x}
              y={y + (isCardinal ? 5.2 : 4.6)}
              textAnchor="middle"
              fill={palette.textPrimary}
              fillOpacity={isCardinal ? 0.98 : 0.78}
              fontSize={isCardinal ? "15.5" : "13"}
              fontWeight={isCardinal ? "700" : "600"}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {num}
            </text>
          );
        })}

        {/* Frameless horology date complication at 6 o'clock */}
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

        {/* Sculpted Apple Watch baton hour hand */}
        <g transform={`rotate(${hourAngle} 110 110)`}>
          <line
            x1="110"
            y1="110"
            x2="110"
            y2="92"
            stroke={palette.textPrimary}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <rect
            x="106.7"
            y="59"
            width="6.6"
            height="36"
            rx="3.3"
            fill={palette.textPrimary}
          />
        </g>

        {/* Sculpted Apple Watch baton minute hand */}
        <g transform={`rotate(${minuteAngle} 110 110)`}>
          <line
            x1="110"
            y1="110"
            x2="110"
            y2="90"
            stroke={palette.textPrimary}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <rect
            x="107.4"
            y="34"
            width="5.2"
            height="58"
            rx="2.6"
            fill={palette.textPrimary}
          />
        </g>

        {/* Smooth sweeping second hand with counterweight */}
        {showSeconds && (
          <g
            ref={secondHandRef}
            transform={`rotate(${initialSecondAngle} 110 110)`}
          >
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

        {/* Concentric center pinion cap */}
        <circle cx="110" cy="110" r="4.6" fill={accentColor} />
        <circle cx="110" cy="110" r="1.9" fill="#000000" />
      </svg>
    </div>
  );
};
