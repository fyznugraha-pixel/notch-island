import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  WaterData,
  WaterToastType,
  getDailyIntake,
  getStreakInfo,
} from "../../../services/waterService";
import { t, getLanguage } from "../../../services/i18n";

export type { WaterToastType };

export interface WaterNotchToastProps {
  type: WaterToastType;
  data: WaterData;
  isLightMode: boolean;
  loggedAmount?: number;
  onDrinkQuick: (amountMl: number) => void;
  onSnooze: (minutes: number) => void;
  onUndo: () => void;
  onFreeze: () => void;
  onViewWaterTab: () => void;
  onDismiss: () => void;
}

export const WaterNotchToast: React.FC<WaterNotchToastProps> = ({
  type,
  data,
  isLightMode,
  loggedAmount = 250,
  onDrinkQuick,
  onSnooze,
  onUndo,
  onFreeze,
  onViewWaterTab,
  onDismiss,
}) => {
  const daily = useMemo(() => getDailyIntake(new Date(), data), [data]);
  const streak = useMemo(() => getStreakInfo(data), [data]);

  const accent = isLightMode ? "#0284C7" : "#38BDF8";
  const tint = isLightMode ? "#FFFFFF" : "#000000";
  const textColor = isLightMode ? "#101828" : "#ffffff";
  const textSub = isLightMode ? "#475467" : "#a1a1aa";
  const borderPill = isLightMode ? "#CBD2DC" : "#2a2a31";

  const isEn = getLanguage() === "en";
  const locale = isEn ? "en-US" : "id-ID";

  const streakThresholdMl = Math.round(
    data.settings.dailyTargetMl * (data.settings.streakThresholdPercent / 100)
  );
  const remainingForStreak = Math.max(0, streakThresholdMl - daily.totalMl);

  // Dynamic elapsed text for time_to_drink reminder
  const elapsedText = useMemo(() => {
    if (!data.lastDrinkTimestamp) {
      return isEn
        ? `It's been ${data.settings.reminderIntervalHours} hours since last drink`
        : `Sudah ${data.settings.reminderIntervalHours} jam sejak minum terakhir`;
    }
    const elapsedMinutes = Math.max(1, Math.round((Date.now() - data.lastDrinkTimestamp) / 60000));
    if (elapsedMinutes >= 120) {
      const elapsedHours = (elapsedMinutes / 60).toFixed(1).replace(".0", "");
      const formattedHours = isEn ? elapsedHours : elapsedHours.replace(".", ",");
      return isEn
        ? `It's been ${formattedHours} hours since last drink`
        : `Sudah ${formattedHours} jam sejak minum terakhir`;
    } else if (elapsedMinutes >= 60) {
      return isEn
        ? `It's been 1 hour since last drink`
        : `Sudah 1 jam sejak minum terakhir`;
    } else {
      return isEn
        ? `It's been ${elapsedMinutes} minutes since last drink`
        : `Sudah ${elapsedMinutes} menit sejak minum terakhir`;
    }
  }, [data.lastDrinkTimestamp, data.settings.reminderIntervalHours, isEn]);

  const endHour = data.settings.activeEndHour || 21;
  const currentHour = new Date().getHours();
  const endFormatted = currentHour >= endHour
    ? "23:59"
    : isEn
    ? `${String(endHour).padStart(2, "0")}:00`
    : `${String(endHour).padStart(2, "0")}.00`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 450, damping: 30 }}
      role="status"
      className="relative w-full h-full rounded-b-[20px] px-3.5 py-1.5 flex items-center gap-2.5 overflow-visible select-none"
      style={{
        background: tint,
        color: textColor,
      }}
    >
      {/* Dynamic Notch Concave Corner Cutouts */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-[-20px] w-[20px] h-[20px] pointer-events-none"
        style={{
          background: `radial-gradient(circle at 0 100%, transparent 19px, ${tint} 20px)`,
        }}
      />
      <div
        aria-hidden="true"
        className="absolute top-0 right-[-20px] w-[20px] h-[20px] pointer-events-none"
        style={{
          background: `radial-gradient(circle at 100% 100%, transparent 19px, ${tint} 20px)`,
        }}
      />

      {/* =============================================================
          VARIANT 1: WAKTUNYA MINUM (Screen 43 - Notif 1)
          ============================================================= */}
      {type === "time_to_drink" && (
        <>
          <span
            className="w-[32px] h-[32px] rounded-[10px] flex items-center justify-center shrink-0"
            style={{
              background: isLightMode ? "rgba(2,132,199,0.12)" : "rgba(56,189,248,0.16)",
              color: accent,
            }}
          >
            <svg
              width="16"
              height="16"
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

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[9.5px] font-bold tracking-[0.06em] uppercase"
                style={{ color: accent }}
              >
                {t("water_notif_time_to_drink")}
              </span>
              <span
                aria-label={isEn ? `Streak ${streak.currentStreak} days` : `Streak ${streak.currentStreak} hari`}
                className="inline-flex items-center gap-1 h-[16px] px-1.5 rounded-[5px] font-bold text-[10px] tabular-nums"
                style={{
                  background: isLightMode ? "rgba(234,88,12,0.12)" : "rgba(251,146,60,0.16)",
                  color: isLightMode ? "#C2410C" : "#FB923C",
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />
                </svg>
                {streak.currentStreak}
              </span>
            </div>

            <div className="text-[12.5px] font-bold tracking-tight mt-[1px] leading-tight truncate">
              {elapsedText}
            </div>

            <div className="text-[10px] truncate mt-[1px]" style={{ color: textSub }}>
              {daily.totalMl.toLocaleString(locale)} / {data.settings.dailyTargetMl.toLocaleString(locale)} ml
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                onDrinkQuick(data.settings.defaultCupMl);
              }}
              className="h-[28px] px-2.5 rounded-[14px] border-0 font-bold text-[11.5px] cursor-pointer active:scale-95 transition-transform"
              style={{
                backgroundColor: accent,
                color: isLightMode ? "#ffffff" : "#04202e",
              }}
            >
              +{data.settings.defaultCupMl} ml
            </button>

            <button
              type="button"
              onClick={() => {
                onSnooze(data.settings.snoozeDurationMinutes);
                onDismiss();
              }}
              className="h-[28px] px-2 rounded-[14px] border bg-transparent text-[11px] font-medium cursor-pointer active:scale-95 transition-transform"
              style={{
                borderColor: borderPill,
                color: textColor,
              }}
            >
              {isEn ? `Snooze ${data.settings.snoozeDurationMinutes || 10}m` : `Tunda ${data.settings.snoozeDurationMinutes || 10}m`}
            </button>
          </div>
        </>
      )}

      {/* =============================================================
          VARIANT 2: TERCATAT (Screen 43 - Notif 2)
          ============================================================= */}
      {type === "logged" && (
        <>
          <span
            className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0"
            style={{
              background: isLightMode ? "rgba(2,132,199,0.12)" : "rgba(56,189,248,0.16)",
              color: accent,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12l5 5L20 7" />
            </svg>
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[9px] font-bold tracking-[0.06em] uppercase"
                style={{ color: accent }}
              >
                {t("water_notif_logged")}
              </span>
              <span
                aria-label={isEn ? `Streak ${streak.currentStreak} days` : `Streak ${streak.currentStreak} hari`}
                className="inline-flex items-center gap-1 h-[15px] px-1.5 rounded-[4px] font-bold text-[9.5px] tabular-nums"
                style={{
                  background: isLightMode ? "rgba(234,88,12,0.12)" : "rgba(251,146,60,0.16)",
                  color: isLightMode ? "#C2410C" : "#FB923C",
                }}
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />
                </svg>
                {streak.currentStreak}
              </span>
            </div>

            <div className="text-[12px] font-bold tracking-tight truncate leading-tight mt-[1px]">
              +{loggedAmount} ml · {daily.totalMl.toLocaleString(locale)} ml {isEn ? "today" : "hari ini"}
            </div>

            <div className="text-[10px] truncate mt-[0.5px]" style={{ color: textSub }}>
              {remainingForStreak > 0
                ? isEn
                  ? `${remainingForStreak.toLocaleString(locale)} ml left to keep streak`
                  : `Tinggal ${remainingForStreak.toLocaleString(locale)} ml untuk menjaga streak`
                : daily.totalMl < data.settings.dailyTargetMl
                ? isEn
                  ? `${(data.settings.dailyTargetMl - daily.totalMl).toLocaleString(locale)} ml left to reach goal`
                  : `Tinggal ${(data.settings.dailyTargetMl - daily.totalMl).toLocaleString(locale)} ml menuju target`
                : isEn
                ? "Daily goal achieved! Streak safe for today"
                : "Target harian tercapai! Streak hari ini aman"}
            </div>

            {/* Streak progress mini bar */}
            <div
              role="progressbar"
              aria-label={isEn ? "Towards streak threshold" : "Menuju batas streak"}
              className="relative h-[2.5px] rounded-full mt-[3px]"
              style={{ background: isLightMode ? "#E4E7EC" : "#1d1d23" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (daily.totalMl / data.settings.dailyTargetMl) * 100)}%`,
                  backgroundColor: accent,
                }}
              />
              <span
                aria-hidden="true"
                className="absolute top-[-2px] w-[2px] h-[6.5px] bg-[#FB923C] rounded-full"
                style={{ left: `${data.settings.streakThresholdPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                onUndo();
                onDismiss();
              }}
              className="h-[24px] px-1.5 border-0 bg-transparent text-[10.5px] font-medium cursor-pointer hover:underline"
              style={{ color: textSub }}
            >
              {t("water_notif_undo")}
            </button>
          </div>
        </>
      )}

      {/* =============================================================
          VARIANT 3: STREAK TERANCAM (Screen 43 - Notif 3)
          ============================================================= */}
      {type === "streak_threatened" && (
        <>
          <span
            className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0"
            style={{
              background: isLightMode ? "rgba(234,88,12,0.12)" : "rgba(251,146,60,0.18)",
              color: "#FB923C",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />
            </svg>
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[9.5px] font-bold tracking-[0.06em] uppercase text-[#FB923C]">
                {t("water_notif_streak_threatened")}
              </span>
              <span
                aria-label={isEn ? `Streak ${streak.currentStreak} days` : `Streak ${streak.currentStreak} hari`}
                className="inline-flex items-center gap-1 h-[15px] px-1.5 rounded-[4px] font-bold text-[9.5px] tabular-nums"
                style={{
                  background: isLightMode ? "rgba(234,88,12,0.12)" : "rgba(251,146,60,0.16)",
                  color: isLightMode ? "#C2410C" : "#FB923C",
                }}
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />
                </svg>
                {streak.currentStreak}
              </span>
            </div>

            <div className="text-[12px] font-bold tracking-tight truncate leading-tight mt-[1px]">
              {isEn ? "Streak might break tonight" : "Streak bisa putus malam ini"}
            </div>

            <div className="text-[10px] truncate mt-[1px]" style={{ color: textSub }}>
              {isEn
                ? `${remainingForStreak.toLocaleString(locale)} ml left before ${endFormatted}`
                : `Tinggal ${remainingForStreak.toLocaleString(locale)} ml sebelum ${endFormatted}`}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                const amt = remainingForStreak > 0 ? remainingForStreak : data.settings.defaultCupMl;
                onDrinkQuick(amt);
              }}
              className="h-[28px] px-2.5 rounded-[14px] border-0 font-bold text-[11px] cursor-pointer bg-[#FB923C] text-[#2a1200] active:scale-95 transition-transform"
            >
              +{remainingForStreak > 0 ? remainingForStreak : data.settings.defaultCupMl} ml
            </button>

            <button
              type="button"
              disabled={data.settings.freezeCount <= 0}
              onClick={() => {
                onFreeze();
                onDismiss();
              }}
              className="h-[28px] px-2 rounded-[14px] border bg-transparent text-[10.5px] font-medium cursor-pointer active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderColor: borderPill,
                color: textColor,
              }}
            >
              {data.settings.freezeCount > 0
                ? isEn ? "Freeze" : "Bekukan"
                : isEn ? "Freeze (0)" : "Bekukan (0)"}
            </button>
          </div>
        </>
      )}

      {/* =============================================================
          VARIANT 4: STREAK BERTAMBAH (Screen 43 - Notif 4)
          ============================================================= */}
      {type === "streak_increased" && (
        <>
          <span className="w-[28px] h-[28px] rounded-[8px] bg-[#FB923C] text-[#2a1200] flex items-center justify-center shrink-0">
            <span className="text-[15px] font-black tabular-nums">
              {streak.currentStreak}
            </span>
          </span>

          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-bold tracking-[0.06em] uppercase text-[#FB923C]">
              {t("water_notif_streak_increased")}
            </div>

            <div className="text-[12px] font-bold tracking-tight truncate leading-tight mt-[1px]">
              {isEn ? `${streak.currentStreak} day streak!` : `${streak.currentStreak} hari beruntun!`}
            </div>

            <div className="text-[10px] truncate mt-[0.5px]" style={{ color: textSub }}>
              {isEn
                ? `Goal ${data.settings.dailyTargetMl.toLocaleString(locale)} ml reached. Record: ${streak.bestStreak} days.`
                : `Target ${data.settings.dailyTargetMl.toLocaleString(locale)} ml tercapai. Rekor ${streak.bestStreak} hari.`}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                onViewWaterTab();
                onDismiss();
              }}
              className="h-[26px] px-2.5 rounded-[13px] border bg-transparent text-[11px] font-medium cursor-pointer active:scale-95 transition-transform"
              style={{
                borderColor: borderPill,
                color: textColor,
              }}
            >
              {t("water_notif_view")}
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
};
