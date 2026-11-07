import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  PrayerScheduleData,
  PrayerToastPayload,
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
  const [isMuted, setIsMuted] = useState(false);

  const isPre = toast.type === "pre_reminder";
  const isDone = toast.type === "completed";

  const statusBadgeText = isDone
    ? isEn
      ? "PRAYER COMPLETED"
      : "SHOLAT TERCATAT"
    : isPre
    ? isEn
      ? `${toast.minutesLeft || 5} MIN TO ADZAN`
      : `${toast.minutesLeft || 5} MENIT MENUJU ADZAN`
    : isEn
    ? "ADZAN NOW"
    : "ADZAN SEKARANG";

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
            <PrayerIcon prayerId={toast.prayerId} size={52} strokeWidth={1.5} />
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
              {statusBadgeText}
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
            onClick={isDone ? onDismiss : onMarkCompleted}
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
            <span>
              {isDone
                ? isEn
                  ? "Done"
                  : "Selesai"
                : isEn
                ? "Mark as prayed"
                : "Sudah sholat"}
            </span>
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
