import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  WaterData,
  getDailyIntake,
  getStreakInfo,
  getTwoHourDistribution,
  getNextReminderTimeString,
  updateWaterSettings,
} from "../../../services/waterService";
import { Bell, BellOff } from "lucide-react";
import { Tooltip } from "../Tooltip";
import { playWaterDrinkSound } from "../../../services/soundService";
import { t, getLanguage } from "../../../services/i18n";

export interface WaterCapsuleViewProps {
  data: WaterData;
  isLightMode: boolean;
  onDrink: () => void;
  onAdjustCup: (delta: number) => void;
  onOpenStreak: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}

export const WaterCapsuleView: React.FC<WaterCapsuleViewProps> = ({
  data,
  isLightMode,
  onDrink,
  onAdjustCup,
  onOpenStreak,
  onOpenHistory,
  onOpenSettings,
}) => {
  const [sloshEnergy, setSloshEnergy] = React.useState(0);
  const daily = useMemo(() => getDailyIntake(new Date(), data), [data]);
  const streak = useMemo(() => getStreakInfo(data), [data]);
  const distribution = useMemo(() => getTwoHourDistribution(new Date(), data), [data]);
  const nextReminderStr = useMemo(() => getNextReminderTimeString(data), [data]);

  const accent = isLightMode ? "#0284C7" : "#38BDF8";
  const accentDeep = isLightMode ? "#0369A1" : "#0284C7";
  const strokeColor = isLightMode ? "#CBD2DC" : "#2a2a31";
  const cardBg = isLightMode ? "#E7ECF3" : "#17171c";
  const textColor = isLightMode ? "#344054" : "#e4e4e7";
  const textSub = isLightMode ? "#667085" : "#71717a";
  const borderBtn = isLightMode ? "#CBD2DC" : "#2a2a31";

  // Calculate wave position
  const percent = Math.min(100, Math.max(0, daily.percent));
  const isGoalAchieved = daily.isTargetAchieved || percent >= 100 || daily.totalMl >= daily.targetMl;
  const isEn = getLanguage() === "en";
  const waterHeight = Math.round((percent / 100) * 140);
  const waveY = percent > 0 ? Math.max(10, 146 - waterHeight) : 155;

  // Dynamic ink color for percentage text (stays centered at y: 75)
  const isInsideWater = percent >= 50;
  const inkColor = isInsideWater
    ? (isLightMode ? "#FFFFFF" : "#04202e")
    : (isLightMode ? "#101828" : "#ffffff");

  // Dynamic slosh response
  const isSloshing = sloshEnergy > 0;
  const waveAmp = isSloshing ? 9 : 5;
  const waveDuration = isSloshing ? 2.2 : 3.8;

  // Format total amount according to unit
  const isOz = data.settings.unit === "oz";
  const formatVolumeL = (ml: number) => {
    const val = (ml / 1000).toFixed(1);
    return isEn ? val : val.replace(".", ",");
  };
  const currentVal = isOz
    ? (daily.totalMl / 29.5735).toFixed(1)
    : formatVolumeL(daily.totalMl);
  const targetVal = isOz
    ? (daily.targetMl / 29.5735).toFixed(1)
    : formatVolumeL(daily.targetMl);
  const unitLabel = isOz ? "oz" : "L";

  const defaultCupLabel = isOz
    ? `${Math.round(data.settings.defaultCupMl / 29.5735)} oz`
    : `${data.settings.defaultCupMl} ml`;

  return (
    <div className="w-full flex flex-col justify-between select-none pt-3">
      <div className="flex items-center gap-5">
        {/* Animated Interactive Water Capsule SVG */}
        <Tooltip
          content={
            isGoalAchieved
              ? (isEn ? "Daily target achieved! Click to make water ripple!" : "Target harian tercapai! Klik untuk membuat air bergoyang!")
              : (isEn ? "Click to make water ripple!" : "Klik untuk membuat air bergoyang!")
          }
          side="right"
          align="center"
          delay={200}
        >
          <motion.div
            whileHover={{ scale: 1.05, rotate: [-1, 1, -0.5, 0] }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 450, damping: 18 }}
            onClick={() => {
              setSloshEnergy((prev) => prev + 1);
              playWaterDrinkSound();
            }}
            className="shrink-0 relative cursor-pointer group"
            style={{
              filter: isGoalAchieved
                ? "drop-shadow(0 0 12px rgba(56,189,248,0.5)) drop-shadow(0 0 4px rgba(52,211,153,0.6))"
                : undefined,
            }}
          >
            <svg
              width="76"
              height="150"
              viewBox="0 0 76 150"
              role="img"
              aria-label={isEn ? `Today water level ${percent} percent` : `Level air hari ini ${percent} persen`}
              className="shrink-0"
            >
            <defs>
              <clipPath id="water-capsule-clip">
                <rect x="2" y="2" width="72" height="146" rx="36" />
              </clipPath>
              <linearGradient id="water-front-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} />
                <stop offset="100%" stopColor={accentDeep} />
              </linearGradient>
              <style>{`
                @keyframes waterFlowLeft {
                  0% { transform: translateX(0px); }
                  100% { transform: translateX(-76px); }
                }
                @keyframes waterFlowRight {
                  0% { transform: translateX(-76px); }
                  100% { transform: translateX(0px); }
                }
                @keyframes waterWaveBob {
                  0%, 100% { transform: translateY(0px); }
                  50% { transform: translateY(${waveAmp > 5 ? "4px" : "2.5px"}); }
                }
                @keyframes bubbleAscend1 {
                  0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
                  20% { opacity: 0.8; }
                  80% { opacity: 0.7; }
                  100% { transform: translate(3px, -${Math.max(12, 142 - waveY)}px) scale(1); opacity: 0; }
                }
                @keyframes bubbleAscend2 {
                  0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
                  25% { opacity: 0.85; }
                  75% { opacity: 0.75; }
                  100% { transform: translate(-4px, -${Math.max(12, 145 - waveY)}px) scale(1.1); opacity: 0; }
                }
                @keyframes bubbleAscend3 {
                  0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
                  30% { opacity: 0.65; }
                  70% { opacity: 0.6; }
                  100% { transform: translate(2px, -${Math.max(12, 138 - waveY)}px) scale(0.9); opacity: 0; }
                }
                @keyframes flameFlickerSmall {
                  0%, 100% { transform: scale(1) rotate(0deg); filter: drop-shadow(0 0 2px rgba(251,146,60,0.4)); }
                  25% { transform: scale(1.18) rotate(-4deg); filter: drop-shadow(0 0 7px rgba(251,146,60,0.9)); }
                  50% { transform: scale(0.95) rotate(3deg); filter: drop-shadow(0 0 3px rgba(251,146,60,0.5)); }
                  75% { transform: scale(1.12) rotate(-2deg); filter: drop-shadow(0 0 6px rgba(251,146,60,0.8)); }
                }
                @keyframes goalSparkle1 {
                  0%, 100% { transform: scale(0.7) rotate(0deg); opacity: 0.35; }
                  50% { transform: scale(1.3) rotate(180deg); opacity: 1; }
                }
                @keyframes goalSparkle2 {
                  0%, 100% { transform: scale(1.2) rotate(180deg); opacity: 0.95; }
                  50% { transform: scale(0.65) rotate(0deg); opacity: 0.3; }
                }
                @keyframes waterGoalIdlePulse {
                  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 2px rgba(52,211,153,0.3)); }
                  50% { transform: scale(1.05); filter: drop-shadow(0 0 8px rgba(52,211,153,0.7)); }
                }
              `}</style>
            </defs>

            {/* Capsule Outline */}
            <rect
              x="1"
              y="1"
              width="74"
              height="148"
              rx="37"
              fill="none"
              stroke={strokeColor}
              strokeWidth="2"
            />

            {/* Water Waves & Floating Bubbles */}
            <g clipPath="url(#water-capsule-clip)">
              {/* Back wave */}
              <g style={{ transform: `translateY(${waveY - 4}px)` }}>
                <g style={{ animation: `waterWaveBob 3s ease-in-out infinite` }}>
                  <path
                    d={`M 0 0 q 19 ${waveAmp} 38 0 t 38 0 q 19 ${waveAmp} 38 0 t 38 0 V 160 H 0 Z`}
                    style={{
                      animation: `waterFlowLeft ${waveDuration * 1.3}s linear infinite`,
                      fill: accent,
                    }}
                    fillOpacity=".35"
                  />
                </g>
              </g>

              {/* Front wave */}
              <g style={{ transform: `translateY(${waveY}px)` }}>
                <g style={{ animation: `waterWaveBob 2.2s ease-in-out infinite alternate` }}>
                  <path
                    d={`M 0 0 q 19 -${waveAmp} 38 0 t 38 0 q 19 -${waveAmp} 38 0 t 38 0 V 160 H 0 Z`}
                    style={{
                      animation: `waterFlowRight ${waveDuration}s linear infinite`,
                      fill: "url(#water-front-grad)",
                    }}
                  />
                </g>
              </g>

              {/* Animated Floating Bubbles */}
              {percent > 0 && (
                <g>
                  <circle
                    cx="25"
                    cy="142"
                    r="2.2"
                    fill="#FFFFFF"
                    style={{
                      animation: "bubbleAscend1 3s ease-out infinite 0.2s",
                    }}
                  />
                  <circle
                    cx="50"
                    cy="145"
                    r="3"
                    fill="#FFFFFF"
                    style={{
                      animation: "bubbleAscend2 3.6s ease-out infinite 1.1s",
                    }}
                  />
                  <circle
                    cx="36"
                    cy="138"
                    r="1.8"
                    fill="#FFFFFF"
                    style={{
                      animation: "bubbleAscend3 2.5s ease-out infinite 1.9s",
                    }}
                  />
                </g>
              )}

              {/* Percentage Label - Fixed at center of capsule */}
              <text
                x="38"
                y="75"
                textAnchor="middle"
                dominantBaseline="central"
                aria-hidden="true"
                style={{
                  fill: inkColor,
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontSize: "17px",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  transition: "fill 0.25s ease",
                }}
              >
                {percent}%
              </text>
            </g>

            {/* Glossy Glass Curvature Highlights */}
            <path
              d="M10 24 C 7 45, 7 105, 10 126"
              stroke="#FFFFFF"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeOpacity={isLightMode ? "0.4" : "0.22"}
              fill="none"
              pointerEvents="none"
            />
            <path
              d="M26 8 A 14 14 0 0 1 50 8"
              stroke="#FFFFFF"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeOpacity={isLightMode ? "0.45" : "0.24"}
              fill="none"
              pointerEvents="none"
            />


          </svg>
        </motion.div>
        </Tooltip>

        {/* Center: Stats & 2-Hour Bar Chart */}
        <div className="flex-1 min-w-0 flex flex-col justify-between h-[150px]">
          <div>
            {/* Top row indicators */}
            <div className="flex items-center gap-1.5 text-[12px] text-[#a1a1aa]">
              <span style={{ color: accent }} className="flex items-center">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3z" />
                </svg>
              </span>
              <span className={isLightMode ? "text-[#475467]" : "text-[#a1a1aa]"}>
                {t("water_today")}
              </span>

              {/* Streak Pill */}
              <button
                type="button"
                onClick={onOpenStreak}
                aria-label={isEn ? `Streak ${streak.currentStreak} days` : `Streak ${streak.currentStreak} hari`}
                className="inline-flex items-center gap-1.5 h-[21px] px-2 rounded-full font-bold text-[12px] tabular-nums transition-transform active:scale-95 cursor-pointer border-0"
                style={{
                  background: "rgba(251,146,60,0.16)",
                  color: "#FB923C",
                }}
              >
                <span
                  style={{
                    animation: "flameFlickerSmall 1.8s ease-in-out infinite",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                  className="flex items-center"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />
                  </svg>
                </span>
                <span>{streak.currentStreak}</span>
              </button>

              {/* Target Achieved Appreciation Badge */}
              {isGoalAchieved && (
                <span
                  className="inline-flex items-center gap-1 h-[21px] px-2 rounded-full text-[10.5px] font-bold bg-emerald-500/15 border border-emerald-400/40 text-emerald-400 dark:text-emerald-300 shadow-sm"
                  style={{ animation: "waterGoalIdlePulse 2.8s ease-in-out infinite" }}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  <span>{isEn ? "Goal!" : "Target!"}</span>
                </span>
              )}
            </div>

            {/* Middle Row: Fixed On/Off Reminder Toggle Button (Always in the middle, never jumps to top row) */}
            <div className="flex items-center my-1.5">
              <Tooltip
                content={
                  data.settings.reminderEnabled
                    ? (isEn
                      ? `Reminders are ACTIVE (Next: ${nextReminderStr || "scheduled"}). Click to turn OFF.`
                      : `Pengingat AKTIF (Berikutnya: ${nextReminderStr || "terjadwal"}). Klik untuk MATIKAN.`)
                    : (isEn ? "Reminders are OFF. Click to turn ON." : "Pengingat MATI. Klik untuk HIDUPKAN.")
                }
                side="top"
                align="start"
                delay={200}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={data.settings.reminderEnabled}
                  onClick={() => {
                    try {
                      localStorage.setItem("island_water_reminder_configured", "true");
                    } catch {}
                    updateWaterSettings({ reminderEnabled: !data.settings.reminderEnabled });
                  }}
                  className={`inline-flex items-center gap-1.5 h-[24px] px-2.5 rounded-full text-[11px] font-bold transition-all cursor-pointer border select-none active:scale-95 ${
                    data.settings.reminderEnabled
                      ? isLightMode
                        ? "bg-sky-50 text-sky-700 border-sky-200/90 shadow-sm hover:bg-sky-100"
                        : "bg-sky-500/15 text-sky-300 border-sky-400/30 shadow-sm hover:bg-sky-500/25"
                      : isLightMode
                      ? "bg-neutral-100 text-neutral-500 border-neutral-200 hover:bg-neutral-200"
                      : "bg-white/[0.06] text-neutral-400 border-white/10 hover:bg-white/[0.10]"
                  }`}
                >
                  {data.settings.reminderEnabled ? (
                    <Bell size={11} strokeWidth={2.4} className="shrink-0" />
                  ) : (
                    <BellOff size={11} strokeWidth={2.2} className="shrink-0 opacity-70" />
                  )}
                  <span>
                    {data.settings.reminderEnabled
                      ? (nextReminderStr ? `${t("water_reminder_status_on")} · ${nextReminderStr}` : t("water_reminder_status_on"))
                      : t("water_reminder_status_off")}
                  </span>
                  {/* Mini iOS Switch Track */}
                  <div
                    className={`w-[20px] h-[12px] rounded-full transition-colors relative flex items-center p-0.5 ml-0.5 ${
                      data.settings.reminderEnabled
                        ? isLightMode ? "bg-sky-500" : "bg-sky-400"
                        : isLightMode ? "bg-neutral-300" : "bg-neutral-600"
                    }`}
                  >
                    <div
                      className={`w-[8px] h-[8px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        data.settings.reminderEnabled ? "translate-x-[8px]" : "translate-x-0"
                      }`}
                    />
                  </div>
                </button>
              </Tooltip>
            </div>

            {/* Giant Numbers: 1,9 / 3,0 L */}
            <div className="flex items-baseline gap-2 mt-0.5">
              <span
                className={`text-[58px] font-bold tracking-[-0.045em] leading-none tabular-nums ${
                  isGoalAchieved
                    ? "text-emerald-400 dark:text-emerald-400"
                    : isLightMode
                    ? "text-[#101828]"
                    : "text-white"
                }`}
                style={
                  isGoalAchieved
                    ? {
                        textShadow: isLightMode
                          ? "0 2px 10px rgba(5,150,105,0.3)"
                          : "0 0 24px rgba(52,211,153,0.45)",
                      }
                    : undefined
                }
              >
                {currentVal}
              </span>
              <span className="text-[17px] font-medium" style={{ color: textSub }}>
                / {targetVal} {unitLabel}
              </span>
              {isGoalAchieved && (
                <Tooltip
                  content={isEn ? "Daily goal successfully achieved!" : "Target harian sukses tercapai!"}
                  side="top"
                  delay={200}
                >
                  <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full bg-emerald-500/20 text-emerald-400 font-extrabold text-[13px] ml-1 shadow-sm">
                    ✓
                  </span>
                </Tooltip>
              )}
            </div>
          </div>

          {/* 2-Hour Intake Distribution */}
          <div
            role="img"
            aria-label={isEn ? "2-hour intake distribution" : "Asupan per dua jam"}
            className="flex items-end gap-1.5 w-full pt-1"
          >
            {distribution.map((slot) => {
              const tipContent = slot.hasIntake
                ? isEn
                  ? `${slot.label}:00: ${slot.amountMl} ml`
                  : `Jam ${slot.label}.00: ${slot.amountMl} ml`
                : isEn
                ? `${slot.label}:00: No intake yet`
                : `Jam ${slot.label}.00: Belum ada minum`;

              return (
                <Tooltip
                  key={slot.hour}
                  content={tipContent}
                  side="top"
                  align="center"
                  delay={150}
                  wrapperClassName="flex-1"
                >
                  <div className="w-full flex flex-col items-center gap-1 cursor-default group">
                    <div className="w-full h-[40px] flex items-end justify-center">
                      {slot.hasIntake ? (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: slot.heightPx }}
                          transition={{ type: "spring", stiffness: 300, damping: 25 }}
                          className="w-full rounded-[4px]"
                          style={{
                            backgroundColor: accent,
                            opacity: slot.opacity || 0.6,
                          }}
                        />
                      ) : (
                        <div
                          className="w-full h-[4px] rounded-[4px] box-border"
                          style={{
                            border: `1px dashed ${isLightMode ? "#B8C0CC" : "#34343c"}`,
                          }}
                        />
                      )}
                    </div>
                    <span
                      className="text-[10px] tabular-nums font-medium"
                      style={{ color: textSub }}
                    >
                      {slot.label}
                    </span>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Right Side: Quick Intake Controls */}
        <div className="w-[196px] shrink-0 flex flex-col gap-2">
          {/* Stepper: - 250 ml + */}
          <div
            role="group"
            aria-label={isEn ? "Drink size" : "Ukuran minum"}
            className="flex items-center justify-between h-[40px] rounded-full px-1"
            style={{ background: cardBg }}
          >
            <button
              type="button"
              aria-label={isEn ? "Decrease 50 ml" : "Kurangi 50 ml"}
              onClick={() => onAdjustCup(-50)}
              className="w-[32px] h-[32px] rounded-full border-0 bg-transparent flex items-center justify-center p-0 cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-transform"
              style={{ color: textColor }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
              </svg>
            </button>

            <span
              className={`text-[14px] font-bold tabular-nums ${
                isLightMode ? "text-[#101828]" : "text-white"
              }`}
            >
              {defaultCupLabel}
            </span>

            <button
              type="button"
              aria-label={isEn ? "Increase 50 ml" : "Tambah 50 ml"}
              onClick={() => onAdjustCup(50)}
              className="w-[32px] h-[32px] rounded-full border-0 bg-transparent flex items-center justify-center p-0 cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-transform"
              style={{ color: textColor }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          {/* Big Drink Button */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={onDrink}
            className="h-[46px] rounded-full border-0 flex items-center justify-center gap-2 font-bold text-[15px] cursor-pointer shadow-sm transition-all hover:brightness-105 active:brightness-95"
            style={{
              backgroundColor: isLightMode ? accentDeep : accent,
              color: isLightMode ? "#FFFFFF" : "#04202e",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3z" />
            </svg>
            {t("water_drink_button")}
          </motion.button>

          {/* Bottom Dual Buttons: Riwayat & Atur */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onOpenHistory}
              className="flex-1 h-[34px] rounded-full bg-transparent flex items-center justify-center gap-1.5 text-[12px] font-medium cursor-pointer transition-colors hover:bg-white/5 active:scale-95"
              style={{
                border: `1px solid ${borderBtn}`,
                color: textColor,
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              {t("water_history_button")}
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="flex-1 h-[34px] rounded-full bg-transparent flex items-center justify-center gap-1.5 text-[12px] font-medium cursor-pointer transition-colors hover:bg-white/5 active:scale-95"
              style={{
                border: `1px solid ${borderBtn}`,
                color: textColor,
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h11M19 18h1" />
                <circle cx="14" cy="6" r="2" />
                <circle cx="9" cy="12" r="2" />
                <circle cx="17" cy="18" r="2" />
              </svg>
              {t("water_settings_button")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
