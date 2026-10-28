import React from "react";
import { motion } from "framer-motion";
import { Moon, Clock, Check, MapPin } from "lucide-react";
import {
  PrayerToastPayload,
  PRAYER_META,
  getPrayerDisplayName,
} from "../../../services/prayerService";
import { getLanguage } from "../../../services/i18n";

export interface PrayerNotchToastProps {
  toast: PrayerToastPayload;
  isLightMode: boolean;
  onMarkCompleted: () => void;
  onOpenPrayerTab: () => void;
  onDismiss: () => void;
}

export const PrayerNotchToast: React.FC<PrayerNotchToastProps> = ({
  toast,
  isLightMode,
  onMarkCompleted,
  onOpenPrayerTab,
  onDismiss,
}) => {
  const isEn = getLanguage() === "en";
  const prayerName = getPrayerDisplayName(toast.prayerId, isEn ? "en" : "id");
  const meta = PRAYER_META[toast.prayerId];

  const isPre = toast.type === "pre_reminder";
  const isDone = toast.type === "completed";

  const accentColor = isPre ? "#f59e0b" : "#10b981";
  const tint = isLightMode ? "#FFFFFF" : "#000000";
  const textColor = isLightMode ? "#101828" : "#ffffff";
  const textSub = isLightMode ? "#475467" : "#a1a1aa";
  const borderPill = isLightMode ? "#CBD2DC" : "#2a2a31";

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

      {/* Icon Box (Flat Solid Frame) */}
      <span
        className="w-[32px] h-[32px] rounded-[10px] flex items-center justify-center shrink-0 text-white"
        style={{
          backgroundColor: accentColor,
        }}
      >
        {isDone ? (
          <Check size={16} strokeWidth={2.6} />
        ) : isPre ? (
          <Clock size={16} strokeWidth={2.3} />
        ) : (
          <Moon size={16} strokeWidth={2.3} />
        )}
      </span>

      {/* Center Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9.5px] font-bold tracking-[0.06em] uppercase"
            style={{ color: accentColor }}
          >
            {isDone
              ? isEn
                ? "PRAYER COMPLETED"
                : "ALHAMDULILLAH TERCATAT"
              : isPre
              ? isEn
                ? `${toast.minutesLeft || 10} MIN TO PRAYER`
                : `${toast.minutesLeft || 10} MENIT MENUJU SHOLAT`
              : isEn
              ? "TIME FOR PRAYER"
              : "WAKTUNYA SHOLAT"}
          </span>
          <span
            className="inline-flex items-center gap-0.5 h-[15px] px-1.5 rounded-[4px] font-semibold text-[9.5px] truncate max-w-[110px]"
            style={{
              background: isLightMode ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.16)",
              color: isLightMode ? "#047857" : "#34d399",
            }}
          >
            <MapPin size={8.5} />
            {toast.locationName}
          </span>
        </div>

        <div className="text-[12.5px] font-bold tracking-tight mt-[1px] leading-tight truncate">
          {isDone
            ? isEn
              ? `${prayerName} prayer marked as done`
              : `Sholat ${prayerName} telah ditandai selesai`
            : isPre
            ? isEn
              ? `Upcoming ${prayerName} at ${toast.prayerTime}`
              : `Persiapan Sholat ${prayerName} pukul ${toast.prayerTime}`
            : isEn
            ? `It's time for ${prayerName} (${toast.prayerTime})`
            : `Saatnya Sholat ${prayerName} (${toast.prayerTime})`}
        </div>

        <div className="text-[10px] truncate mt-[1px]" style={{ color: textSub }}>
          {isEn
            ? `${meta.rakat} Rakaat • Take a moment for prayer`
            : `${meta.rakat} Rakaat • Mari tunaikan ibadah tepat waktu`}
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {!isDone && !isPre && (
          <button
            type="button"
            onClick={onMarkCompleted}
            className="h-[28px] px-2.5 rounded-[14px] border-0 font-bold text-[11px] cursor-pointer active:scale-95 transition-transform text-white flex items-center gap-1"
            style={{
              backgroundColor: accentColor,
            }}
          >
            <Check size={12} strokeWidth={2.5} />
            {isEn ? "Done" : "Sudah Sholat"}
          </button>
        )}

        {isPre && (
          <button
            type="button"
            onClick={() => {
              onOpenPrayerTab();
              onDismiss();
            }}
            className="h-[28px] px-2.5 rounded-[14px] border-0 font-bold text-[11px] cursor-pointer active:scale-95 transition-transform text-neutral-950"
            style={{
              backgroundColor: accentColor,
            }}
          >
            {isEn ? "Schedule" : "Jadwal"}
          </button>
        )}

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
};
