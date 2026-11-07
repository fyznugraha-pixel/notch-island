import React, { useState } from "react";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import {
  PrayerScheduleData,
  PrayerToastPayload,
  PRAYER_META,
  PRAYER_ORDER,
  getImmediatePrayerSchedule,
  getPrayerDisplayName,
} from "../../../services/prayerService";
import { getLanguage } from "../../../services/i18n";
import {
  PRAYER_ACCENT,
  PrayerIcon,
  PrayerCheckIcon,
  PrayerSpeakerIcon,
} from "./PrayerIcons";

export interface PrayerNotchToastProps {
  toast: PrayerToastPayload;
  schedule?: PrayerScheduleData;
  isLightMode: boolean;
  onMarkCompleted: () => void;
  onOpenPrayerTab: () => void;
  onSnooze?: (minutes: number) => void;
  onDismiss: () => void;
}

export const PrayerNotchToast: React.FC<PrayerNotchToastProps> = ({
  toast,
  schedule,
  isLightMode,
  onMarkCompleted,
  onOpenPrayerTab,
  onSnooze,
  onDismiss,
}) => {
  const lang = getLanguage();
  const isEn = lang === "en";
  const activeSchedule = schedule || getImmediatePrayerSchedule();
  const prayerName = getPrayerDisplayName(toast.prayerId, lang);
  const meta = PRAYER_META[toast.prayerId];
  const [isMuted, setIsMuted] = useState(false);

  // ==========================================================================
  // 1. PRE-REMINDER (-5m / -10m / -15m): Compact Notch Toast (448 x 68)
  // ==========================================================================
  if (toast.type !== "prayer_time") {
    const textColor = isLightMode ? "#101828" : "#ffffff";
    const textSub = isLightMode ? "#475467" : "#a1a1aa";
    const borderPill = isLightMode ? "#CBD2DC" : "#2a2a31";

    return (
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 450, damping: 30 }}
        role="status"
        className="relative w-full h-full px-3.5 py-1.5 flex items-center gap-2.5 select-none"
        style={{ color: textColor }}
      >
        <span
          className="w-[36px] h-[36px] rounded-[11px] flex items-center justify-center shrink-0"
          style={{
            background: "rgba(48, 209, 88, 0.14)",
            boxShadow: "inset 0 0 0 1px rgba(48, 209, 88, 0.35)",
          }}
        >
          <PrayerIcon prayerId={toast.prayerId} size={20} colored={true} />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[9.5px] font-bold tracking-[0.06em] uppercase"
              style={{ color: PRAYER_ACCENT }}
            >
              {isEn
                ? `${toast.minutesLeft || 5} MIN TO PRAYER`
                : `${toast.minutesLeft || 5} MENIT MENUJU SHOLAT`}
            </span>
            <span
              className="inline-flex items-center gap-0.5 h-[15px] px-1.5 rounded-[4px] font-semibold text-[9.5px] truncate max-w-[110px]"
              style={{
                background: isLightMode
                  ? "rgba(48,209,88,0.14)"
                  : "rgba(48,209,88,0.16)",
                color: isLightMode ? "#047857" : PRAYER_ACCENT,
              }}
            >
              <MapPin size={8.5} />
              {toast.locationName}
            </span>
          </div>

          <div className="text-[12.5px] font-bold tracking-tight mt-[1px] leading-tight truncate">
            {isEn
              ? `Upcoming ${prayerName} at ${toast.prayerTime}`
              : `Persiapan Sholat ${prayerName} pukul ${toast.prayerTime}`}
          </div>

          <div className="text-[10px] truncate mt-[1px]" style={{ color: textSub }}>
            {isEn
              ? `${meta.rakat} Rakaat · Prepare for prayer`
              : `${meta.rakat} Rakaat · Bersiap menjelang waktu adzan`}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              onOpenPrayerTab();
              onDismiss();
            }}
            style={{
              height: 28,
              padding: "0 11px",
              borderRadius: 14,
              border: 0,
              background: "linear-gradient(180deg, #3BE07A, #22C55E)",
              color: "#04210F",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {isEn ? "Schedule" : "Jadwal"}
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="h-[28px] px-2.5 rounded-[14px] border bg-transparent text-[11px] font-medium cursor-pointer active:scale-95 transition-transform"
            style={{
              borderColor: borderPill,
              color: textColor,
            }}
          >
            {isEn ? "Dismiss" : "Tutup"}
          </button>
        </div>
      </motion.div>
    );
  }

  // ==========================================================================
  // 2. EXACT PRAYER TIME (ADZAN MASUK): Full Hero Alert (680 x 242 - Board 3)
  // ==========================================================================
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      role="status"
      className="relative w-full h-full box-border flex flex-col select-none"
      style={{
        padding: "12px 28px 14px",
        color: isLightMode ? "#18181b" : "#fff",
      }}
    >
      {/* Main Hero Adzan Banner */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 22,
          marginTop: 10,
          padding: "18px 22px",
          borderRadius: 28,
          background: "linear-gradient(150deg, #0E3B2C, #0A2119 55%, #060B09)",
          boxShadow:
            "inset 0 0 0 1px rgba(48,209,88,.3), inset 0 1px 0 rgba(255,255,255,.14)",
          overflow: "hidden",
          color: "#fff",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -30,
            top: -60,
            width: 320,
            height: 320,
            borderRadius: 160,
            background: "radial-gradient(circle, rgba(48,209,88,.34), transparent 66%)",
            pointerEvents: "none",
          }}
        />

        {/* Left Concentric Pulsing Prayer Icon */}
        <div
          onClick={onOpenPrayerTab}
          style={{
            position: "relative",
            width: 104,
            height: 104,
            flexShrink: 0,
            cursor: "pointer",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -14,
              borderRadius: 66,
              border: "1.5px solid rgba(48,209,88,.22)",
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -4,
              borderRadius: 56,
              border: "1.5px solid rgba(48,209,88,.4)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 52,
              background: "rgba(48,209,88,.14)",
              boxShadow: "inset 0 0 0 1px rgba(48,209,88,.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: PRAYER_ACCENT,
            }}
          >
            <PrayerIcon
              prayerId={toast.prayerId}
              size={52}
              strokeWidth={1.5}
              colored={false}
            />
          </div>
        </div>

        {/* Center Prayer Details */}
        <div
          onClick={onOpenPrayerTab}
          style={{ flex: 1, minWidth: 0, position: "relative", cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: PRAYER_ACCENT,
                boxShadow: `0 0 8px ${PRAYER_ACCENT}`,
              }}
            />
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: ".16em",
                color: PRAYER_ACCENT,
              }}
            >
              {isEn ? "ADZAN NOW" : "ADZAN SEKARANG"}
            </span>
          </div>

          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: "-.035em",
              lineHeight: "44px",
              marginTop: 6,
            }}
            className="truncate"
          >
            {prayerName}
          </div>

          <div
            style={{
              fontSize: 15,
              color: "#a1a1aa",
              marginTop: 2,
              fontVariantNumeric: "tabular-nums",
            }}
            className="truncate"
          >
            {toast.prayerTime} <span style={{ color: "#48484a" }}>·</span> {toast.locationName}
          </div>
        </div>

        {/* Right Action Buttons */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            gap: 9,
            width: 196,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onMarkCompleted}
            style={{
              height: 42,
              borderRadius: 21,
              border: 0,
              background: "linear-gradient(180deg, #3BE07A, #22C55E)",
              color: "#04210F",
              fontSize: 14,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow:
                "0 6px 20px rgba(48,209,88,.4), inset 0 1px 0 rgba(255,255,255,.45)",
            }}
          >
            <PrayerCheckIcon size={16} strokeWidth={3} />
            <span>{isEn ? "Mark as prayed" : "Sudah sholat"}</span>
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                if (onSnooze) {
                  onSnooze(5);
                } else {
                  onDismiss();
                }
              }}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 18,
                border: 0,
                background: "rgba(255,255,255,.1)",
                color: "#f5f5f7",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)",
              }}
            >
              {isEn ? "Snooze 5m" : "Ingatkan 5 mnt"}
            </button>

            <button
              type="button"
              aria-label={isEn ? "Mute adzan audio" : "Matikan suara adzan"}
              onClick={() => {
                setIsMuted((prev) => !prev);
                onDismiss();
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                border: 0,
                background: "rgba(255,255,255,.1)",
                color: "#f5f5f7",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)",
              }}
            >
              <PrayerSpeakerIcon size={16} muted={isMuted} />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom 5-Prayer Schedule Pill Strip */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 14,
          position: "relative",
        }}
      >
        {PRAYER_ORDER.map((pId) => {
          const isCurrentAlert = pId === toast.prayerId;
          const pName = getPrayerDisplayName(pId, lang);
          const pTime = activeSchedule.timings[pId];

          return (
            <button
              key={pId}
              type="button"
              onClick={onOpenPrayerTab}
              style={{
                flex: 1,
                height: 30,
                borderRadius: 10,
                border: 0,
                background: isCurrentAlert
                  ? "rgba(48,209,88,.16)"
                  : isLightMode
                  ? "rgba(0,0,0,.05)"
                  : "rgba(255,255,255,.06)",
                boxShadow: isCurrentAlert
                  ? "inset 0 0 0 1px rgba(48,209,88,.45)"
                  : isLightMode
                  ? "inset 0 0 0 1px rgba(0,0,0,.06)"
                  : "inset 0 0 0 1px rgba(255,255,255,.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 600,
                color: isCurrentAlert ? PRAYER_ACCENT : "#8e8e93",
                fontVariantNumeric: "tabular-nums",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {pName} {pTime}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
};
