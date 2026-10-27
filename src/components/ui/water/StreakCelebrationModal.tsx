import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { playStreakFanfareSound } from "../../../services/soundService";
import { getLanguage } from "../../../services/i18n";

export interface StreakCelebrationModalProps {
  type: "streak_opened" | "checkpoint_reached";
  streakDays: number;
  isLightMode: boolean;
  onClose: () => void;
}

export const StreakCelebrationModal: React.FC<StreakCelebrationModalProps> = ({
  type,
  streakDays,
  onClose,
}) => {
  const isOpened = type === "streak_opened";
  const isEn = getLanguage() === "en";

  useEffect(() => {
    playStreakFanfareSound();
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        key="frameless-streak-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={onClose}
        className="absolute inset-0 z-50 flex flex-col items-center justify-center p-3 bg-black/60 backdrop-blur-md select-none rounded-[inherit] cursor-pointer"
        title={isEn ? "Tap to close" : "Ketuk untuk menutup"}
      >
        <motion.div
          key="frameless-streak-content"
          initial={{ scale: 0.5, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.7, opacity: 0, y: -10 }}
          transition={{ type: "spring", stiffness: 440, damping: 22 }}
          onClick={(e) => e.stopPropagation()}
          className="relative flex flex-col items-center justify-center pointer-events-auto"
        >
          {/* Ambient Warm Fire Aura (Frameless Soft Light) */}
          <div
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 pointer-events-none rounded-full blur-3xl opacity-50"
            style={{
              background: "radial-gradient(circle, #FB923C 0%, #EA580C 50%, transparent 75%)",
            }}
          />

          {/* Api Besar dengan Angka Streak di Dalamnya */}
          <div className="relative w-[124px] h-[134px] flex items-center justify-center">
            {/* Spinning Golden Sparkle Stars / Rays around flame */}
            <motion.svg
              animate={{ rotate: 360 }}
              transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
              width="134"
              height="134"
              viewBox="0 0 134 134"
              className="absolute pointer-events-none overflow-visible"
            >
              <defs>
                <linearGradient id="orbit-stars-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FDE047" stopOpacity="0.9" />
                  <stop offset="50%" stopColor="#FB923C" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#EA580C" stopOpacity="0.1" />
                </linearGradient>
              </defs>
              <circle
                cx="67"
                cy="67"
                r="58"
                stroke="url(#orbit-stars-grad)"
                strokeWidth="1.8"
                strokeDasharray="8 12 16 8"
                fill="none"
              />
            </motion.svg>

            {/* Alive Dancing Big Flame SVG */}
            <motion.div
              animate={{
                scale: [1, 1.08, 0.95, 1.05, 1],
                rotate: [0, -2, 2, -1, 0],
              }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              className="relative w-full h-full flex items-center justify-center"
              style={{
                filter: "drop-shadow(0 0 24px rgba(251,146,60,0.95)) drop-shadow(0 -4px 18px rgba(234,88,12,0.8))",
              }}
            >
              <svg
                width="120"
                height="130"
                viewBox="0 0 120 130"
                fill="none"
                aria-hidden="true"
                className="overflow-visible"
              >
                <defs>
                  <linearGradient id="big-flame-outer" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#C2410C" />
                    <stop offset="30%" stopColor="#EA580C" />
                    <stop offset="65%" stopColor="#FB923C" />
                    <stop offset="100%" stopColor="#FDE047" />
                  </linearGradient>
                  <linearGradient id="big-flame-mid" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#EA580C" />
                    <stop offset="45%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#FEF08A" />
                  </linearGradient>
                  <linearGradient id="big-flame-core" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#F97316" />
                    <stop offset="100%" stopColor="#FFFBEB" />
                  </linearGradient>
                </defs>

                {/* Outer Big Flame Body */}
                <path
                  d="M60 8 C68 28 92 36 92 72 C92 98 78 122 60 122 C42 122 28 98 28 72 C28 56 36 48 44 40 C44 56 52 64 60 64 C60 42 50 26 60 8 Z"
                  fill="url(#big-flame-outer)"
                />

                {/* Middle Radiant Flame Layer */}
                <path
                  d="M60 32 C65 46 80 52 80 78 C80 96 71 112 60 112 C49 112 40 96 40 78 C40 68 46 62 50 56 C50 66 55 72 60 72 C60 56 54 44 60 32 Z"
                  fill="url(#big-flame-mid)"
                />

                {/* Inner Core Flame */}
                <path
                  d="M60 54 C63 64 72 68 72 84 C72 96 66 104 60 104 C54 104 48 96 48 84 C48 78 52 74 54 70 C54 76 57 80 60 80 C60 70 56 62 60 54 Z"
                  fill="url(#big-flame-core)"
                  opacity="0.85"
                />
              </svg>

              {/* Angka Dalam Apinya (Centered in heart of flame) */}
              <div
                className="absolute inset-0 flex items-center justify-center pt-8 pointer-events-none select-none"
              >
                <span
                  className="text-[44px] font-black tracking-[-0.04em] leading-none tabular-nums text-white"
                  style={{
                    textShadow:
                      "0 2px 8px rgba(0,0,0,0.85), 0 0 20px rgba(180,50,0,0.9), 0 0 4px rgba(0,0,0,0.9)",
                    fontFamily: "'Inter', -apple-system, sans-serif",
                  }}
                >
                  {streakDays}
                </span>
              </div>
            </motion.div>
          </div>

          {/* Keterangan Singkat 1 Baris di Bawahnya (Tanpa Frame) */}
          <div className="mt-2 text-center select-none">
            <span
              className="text-[12.5px] font-bold text-orange-400 tracking-wide inline-block"
              style={{
                textShadow: "0 2px 10px rgba(0,0,0,0.9), 0 0 12px rgba(251,146,60,0.6)",
              }}
            >
              {isOpened
                ? isEn
                  ? "Day 1 Streak · Keep the flame burning!"
                  : "Streak 1 Hari · Jaga apinya tetap menyala!"
                : isEn
                ? `${streakDays} Days Checkpoint · Outstanding consistency!`
                : `Checkpoint ${streakDays} Hari · Konsistensi luar biasa!`}
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
