import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { WaterData, getStreakInfo } from "../../../services/waterService";
import { t, getLanguage } from "../../../services/i18n";

export interface WaterStreakViewProps {
  data: WaterData;
  isLightMode: boolean;
  onBack: () => void;
}

export const WaterStreakView: React.FC<WaterStreakViewProps> = ({
  data,
  isLightMode,
  onBack,
}) => {
  const [burstCount, setBurstCount] = useState(0);
  const checkpointsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScrollButtons = useCallback(() => {
    const el = checkpointsScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScrollButtons();
    const timer = setTimeout(checkScrollButtons, 150);
    return () => clearTimeout(timer);
  }, [checkScrollButtons]);

  const handleScrollCheckpoints = (direction: "left" | "right") => {
    const el = checkpointsScrollRef.current;
    if (!el) return;
    const delta = direction === "left" ? -140 : 140;
    el.scrollBy({ left: delta, behavior: "smooth" });
    setTimeout(checkScrollButtons, 220);
  };
  const streak = useMemo(() => getStreakInfo(data), [data]);
  const isEn = getLanguage() === "en";

  const textColor = isLightMode ? "#101828" : "#ffffff";
  const textSub = isLightMode ? "#667085" : "#a1a1aa";
  const btnBg = isLightMode ? "#E7ECF3" : "#17171c";
  const btnColor = isLightMode ? "#344054" : "#e4e4e7";
  const lineBg = isLightMode ? "#E4E7EC" : "#1d1d23";
  const ringTrack = isLightMode ? "#CBD2DC" : "#2a2a31";

  // Calculate today's ring circumference
  const todayItem = streak.sevenDayHistory.find((d) => d.isToday);
  const todayPercent = todayItem ? Math.min(100, Math.max(0, todayItem.percent)) : 0;
  const radius = 11;
  const circumference = 2 * Math.PI * radius; // ~69.115
  const dashOffset = (circumference * (100 - todayPercent)) / 100;

  // Completed count for connecting line
  let lastContiguousAchievedIdx = -1;
  for (let i = 0; i < streak.sevenDayHistory.length; i++) {
    if (streak.sevenDayHistory[i].achieved) {
      lastContiguousAchievedIdx = i;
    } else {
      break;
    }
  }
  const filledLineWidthPercent =
    lastContiguousAchievedIdx > 0
      ? (lastContiguousAchievedIdx / 6) * 100
      : 0;

  return (
    <div className="w-full h-full flex flex-col select-none overflow-hidden pb-1">
      {/* Top Header */}
      <div className="relative flex items-center justify-between h-[32px] w-full mt-0.5 shrink-0">
        <div className="flex gap-2 shrink-0 z-10">
          <button
            type="button"
            aria-label={t("action_back")}
            onClick={onBack}
            className="w-[32px] h-[32px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer transition-transform active:scale-95"
            style={{ background: btnBg, color: btnColor }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        <h1
          className="m-0 absolute inset-x-0 text-center text-[17px] font-semibold tracking-[-0.01em] pointer-events-none"
          style={{ color: textColor }}
        >
          {t("water_streak_title")}
        </h1>

        <div className="w-[32px] h-[32px] shrink-0" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-between py-0.5 overflow-visible min-h-0">
        {/* Animated & Interactive Flame Graphic - Perfectly Round Aura */}
        <div className="relative w-[190px] h-[106px] shrink-0 flex items-center justify-center my-0 overflow-visible">
          <svg
            width="190"
            height="106"
            viewBox="0 0 190 106"
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none overflow-visible"
          >
            <defs>
              <linearGradient id="flame-outer-grad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#EA580C" />
                <stop offset="55%" stopColor="#FB923C" />
                <stop offset="100%" stopColor="#FDE047" />
              </linearGradient>
              <linearGradient id="flame-core-grad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#FEF08A" />
              </linearGradient>
              <style>{`
                @keyframes flameFlickerOuter {
                  0%, 100% { transform: scale(1, 1) translateY(0) rotate(0deg); }
                  25% { transform: scale(1.06, 0.96) translateY(-2px) rotate(-2deg); }
                  50% { transform: scale(0.97, 1.05) translateY(1px) rotate(2deg); }
                  75% { transform: scale(1.04, 0.98) translateY(-1px) rotate(-1deg); }
                }
                @keyframes flameFlickerInner {
                  0%, 100% { transform: scale(1, 1) translateY(0) rotate(0deg); }
                  30% { transform: scale(0.93, 1.08) translateY(1.5px) rotate(2.5deg); }
                  70% { transform: scale(1.1, 0.94) translateY(-1.5px) rotate(-2.5deg); }
                }
                @keyframes emberRise1 {
                  0% { transform: translate(0, 0) scale(1); opacity: 0; }
                  20% { opacity: 0.95; }
                  75% { opacity: 0.85; }
                  100% { transform: translate(-6px, -26px) scale(0.3); opacity: 0; }
                }
                @keyframes emberRise2 {
                  0% { transform: translate(0, 0) scale(1.2); opacity: 0; }
                  25% { opacity: 1; }
                  70% { opacity: 0.85; }
                  100% { transform: translate(8px, -28px) scale(0.35); opacity: 0; }
                }
                @keyframes emberRise3 {
                  0% { transform: translate(0, 0) scale(0.9); opacity: 0; }
                  25% { opacity: 0.85; }
                  75% { opacity: 0.7; }
                  100% { transform: translate(-4px, -22px) scale(0.25); opacity: 0; }
                }
                @keyframes auraPulse1 {
                  0%, 100% { transform: scale(1); opacity: 0.04; }
                  50% { transform: scale(1.1); opacity: 0.1; }
                }
                @keyframes auraPulse2 {
                  0%, 100% { transform: scale(1); opacity: 0.08; }
                  50% { transform: scale(1.08); opacity: 0.17; }
                }
                @keyframes starTwinkle1 {
                  0%, 100% { transform: rotate(0deg) scale(0.85); opacity: 0.6; }
                  50% { transform: rotate(180deg) scale(1.25); opacity: 1; }
                }
                @keyframes starTwinkle2 {
                  0%, 100% { transform: rotate(360deg) scale(0.75); opacity: 0.55; }
                  50% { transform: rotate(180deg) scale(1.2); opacity: 0.95; }
                }
              `}</style>
            </defs>

            {/* Breathing Ambient Aura Rings - Perfectly Round & Unclipped */}
            <circle
              cx="95"
              cy="53"
              r="44"
              fill="#FB923C"
              style={{
                animation: "auraPulse1 3.2s ease-in-out infinite",
                transformOrigin: "95px 53px",
              }}
            />
            <circle
              cx="95"
              cy="53"
              r="34"
              fill="#FB923C"
              style={{
                animation: "auraPulse2 2.5s ease-in-out infinite 0.3s",
                transformOrigin: "95px 53px",
              }}
            />
            <circle
              cx="95"
              cy="53"
              r="23"
              fill="#F97316"
              style={{
                animation: "auraPulse1 1.8s ease-in-out infinite 0.6s",
                transformOrigin: "95px 53px",
              }}
            />

            {/* Rotating & Twinkling Sparkle Stars */}
            <g
              style={{
                animation: "starTwinkle1 4.5s ease-in-out infinite",
                transformOrigin: "36px 26px",
              }}
            >
              <path
                d="M0-4.5L1.1-1.1L4.5 0L1.1 1.1L0 4.5L-1.1 1.1L-4.5 0L-1.1-1.1Z"
                transform="translate(36 26) scale(1)"
                fill="#FB923C"
                fillOpacity="0.85"
              />
            </g>

            <g
              style={{
                animation: "starTwinkle2 3.8s ease-in-out infinite 0.5s",
                transformOrigin: "154px 32px",
              }}
            >
              <path
                d="M0-4.5L1.1-1.1L4.5 0L1.1 1.1L0 4.5L-1.1 1.1L-4.5 0L-1.1-1.1Z"
                transform="translate(154 32) scale(0.85)"
                fill="#FBBF24"
                fillOpacity="0.8"
              />
            </g>

            <g
              style={{
                animation: "starTwinkle1 3s ease-in-out infinite 1s",
                transformOrigin: "148px 80px",
              }}
            >
              <path
                d="M0-4.5L1.1-1.1L4.5 0L1.1 1.1L0 4.5L-1.1 1.1L-4.5 0L-1.1-1.1Z"
                transform="translate(148 80) scale(0.9)"
                fill="#FB923C"
              />
            </g>

            <g
              style={{
                animation: "starTwinkle2 3.4s ease-in-out infinite 1.5s",
                transformOrigin: "42px 76px",
              }}
            >
              <path
                d="M0-4.5L1.1-1.1L4.5 0L1.1 1.1L0 4.5L-1.1 1.1L-4.5 0L-1.1-1.1Z"
                transform="translate(42 76) scale(0.75)"
                fill="#FB923C"
              />
            </g>

            {/* Rising Embers from Flame */}
            <circle
              cx={95}
              cy={38}
              r={1.6}
              fill="#FEF08A"
              style={{ animation: "emberRise1 1.7s ease-out infinite 0.1s" }}
            />
            <circle
              cx={98}
              cy={36}
              r={1.8}
              fill="#FDBA74"
              style={{ animation: "emberRise2 2.1s ease-out infinite 0.7s" }}
            />
            <circle
              cx={92}
              cy={40}
              r={1.3}
              fill="#FB923C"
              style={{ animation: "emberRise3 1.5s ease-out infinite 1.3s" }}
            />
          </svg>

          {/* Interactive Alive Dancing Flame */}
          <motion.div
            key={`flame-${burstCount}`}
            whileHover={{ scale: 1.2, rotate: [-2, 2, 0] }}
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 450, damping: 16 }}
            onClick={() => setBurstCount((prev) => prev + 1)}
            role="button"
            tabIndex={0}
            aria-label={isEn ? "Streak flame glowing, click to enlarge" : "Api streak menyala, klik untuk membesarkan"}
            className="relative z-10 cursor-pointer p-1.5 flex items-center justify-center select-none"
            style={{
              filter:
                "drop-shadow(0 0 14px rgba(251,146,60,0.85)) drop-shadow(0 -3px 8px rgba(249,115,22,0.55))",
            }}
          >
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="overflow-visible"
            >
              {/* Outer Dancing Flame */}
              <path
                d="M12 2c1.2 4.2 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.2 1.1-3.3 2.2-4.4 0 2.2 1.1 3.3 2.2 3.3 0-3.3-1.1-5.5 1.1-9.9z"
                fill="url(#flame-outer-grad)"
                style={{
                  animation: "flameFlickerOuter 1.6s ease-in-out infinite",
                  transformOrigin: "12px 18px",
                }}
              />

              {/* Inner Glowing Core Flame */}
              <path
                d="M12 8.5c0.7 2.2 2.8 2.8 2.8 5.6a2.8 2.8 0 0 1-5.6 0c0-1.1 0.6-1.7 1.1-2.2 0 1.1 0.6 1.7 1.1 1.7 0-1.7-0.6-2.8 0.6-5.1z"
                fill="url(#flame-core-grad)"
                style={{
                  animation: "flameFlickerInner 1.2s ease-in-out infinite",
                  transformOrigin: "12px 15px",
                }}
              />
            </svg>
          </motion.div>
        </div>

        {/* Large Numbers */}
        <div className="text-center -mt-1 shrink-0">
          <div
            className={`text-[58px] font-bold tracking-[-0.045em] leading-none tabular-nums ${
              isLightMode ? "text-[#101828]" : "text-white"
            }`}
          >
            {streak.currentStreak}
          </div>
          <div
            className="text-[13px] tracking-[0.03em] mt-1 font-medium"
            style={{ color: textSub }}
          >
            {t("water_days_consecutive")}
          </div>
        </div>

        {/* 7-Day Visual Row */}
        <div
          role="group"
          aria-label={isEn ? "Last seven days" : "Tujuh hari terakhir"}
          className="relative w-[440px] grid grid-cols-7 my-1 shrink-0"
        >
          {/* Background Connector Line */}
          <div
            aria-hidden="true"
            className="absolute top-[13px] left-[calc(100%/14)] right-[calc(100%/14)] h-[2px]"
            style={{ background: lineBg }}
          />

          {/* Active Streak Connector Line */}
          <div
            aria-hidden="true"
            className="absolute top-[13px] left-[calc(100%/14)] h-[2px] transition-all duration-300"
            style={{
              width: `calc((100% - 100%/7) * ${filledLineWidthPercent / 100})`,
              background: "#FB923C",
            }}
          />

          {streak.sevenDayHistory.map((day) => (
            <div key={day.dateKey} className="flex flex-col items-center gap-1.5 z-10">
              <div className="h-[26px] flex items-center justify-center">
                {day.isToday ? (
                  /* Today Circular Progress Ring */
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 28 28"
                    role="img"
                    aria-label={isEn ? `Today ${todayPercent} percent` : `Hari ini ${todayPercent} persen`}
                  >
                    <circle
                      cx="14"
                      cy="14"
                      r={radius}
                      fill="none"
                      stroke={ringTrack}
                      strokeWidth="3"
                    />
                    <circle
                      cx="14"
                      cy="14"
                      r={radius}
                      fill="none"
                      stroke="#FB923C"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${circumference} ${circumference}`}
                      strokeDashoffset={dashOffset}
                      transform="rotate(-90 14 14)"
                    />
                  </svg>
                ) : (
                  /* Past / Future Days Dot */
                  <span
                    className="w-[11px] h-[11px] rounded-full transition-colors"
                    style={{
                      background: day.achieved
                        ? "#FB923C"
                        : isLightMode
                        ? "#CBD2DC"
                        : "#2a2a31",
                    }}
                  />
                )}
              </div>

              <span
                className={`text-[10px] tracking-[0.03em] ${
                  day.isToday
                    ? isLightMode
                      ? "text-[#101828] font-bold"
                      : "text-white font-bold"
                    : textSub
                }`}
              >
                {day.dayLabel}
              </span>
            </div>
          ))}
        </div>

        {/* Milestone Checkpoints Row */}
        <div
          data-no-swipe="true"
          className="w-[440px] flex flex-col gap-1 px-2.5 py-1.5 rounded-xl select-none shrink-0"
          style={{ background: isLightMode ? "#F2F4F8" : "#17171d" }}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold px-0.5">
            <span className="flex items-center gap-1.5 text-orange-400 font-extrabold tracking-wider text-[10px] uppercase">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />
              </svg>
              <span>{isEn ? "Streak Checkpoints" : "Checkpoint Streak"}</span>
            </span>
            <span className="text-[10.5px] text-[#FB923C] font-bold">
              {streak.daysToNextMilestone > 0
                ? isEn
                  ? `${streak.daysToNextMilestone} days left to ${streak.nextMilestoneTarget} milestone`
                  : `${streak.daysToNextMilestone} hari lagi ke target ${streak.nextMilestoneTarget}`
                : isEn
                ? "All checkpoints completed!"
                : "Semua checkpoint selesai!"}
            </span>
          </div>

          {/* Swipe Buttons on Left & Right Flanking Scrollable Container */}
          <div className="flex items-center gap-1 w-full">
            <button
              type="button"
              disabled={!canScrollLeft}
              onClick={() => handleScrollCheckpoints("left")}
              aria-label={isEn ? "Scroll checkpoints left" : "Geser checkpoint ke kiri"}
              className={`w-[22px] h-[26px] rounded-lg border-0 shrink-0 flex items-center justify-center transition-all ${
                canScrollLeft
                  ? "cursor-pointer hover:bg-orange-500/20 active:scale-90 text-orange-400"
                  : "opacity-20 cursor-default text-zinc-500"
              }`}
              style={{
                background: canScrollLeft ? (isLightMode ? "rgba(251,146,60,0.12)" : "rgba(251,146,60,0.16)") : "transparent",
              }}
            >
              <ChevronLeft size={14} strokeWidth={2.4} />
            </button>

            <div
              ref={checkpointsScrollRef}
              onScroll={checkScrollButtons}
              onWheel={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              data-no-swipe="true"
              className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 scroll-smooth"
            >
              {[3, 10, 30, 50, 100, 150, 200, 250, 300, 365].map((cp) => {
                const isAchieved = streak.currentStreak >= cp;
                const isNext = cp === streak.nextCheckpoint;

                return (
                  <div
                    key={cp}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-lg shrink-0 transition-all ${
                      isNext
                        ? "bg-orange-500/20 border border-orange-500/60 shadow-sm"
                        : isAchieved
                        ? isLightMode
                          ? "bg-amber-100/70 border border-amber-300 text-amber-800"
                          : "bg-orange-950/40 border border-orange-500/40 text-orange-300"
                        : isLightMode
                        ? "bg-white/60 border border-gray-200 text-gray-400"
                        : "bg-white/5 border border-white/5 text-zinc-500"
                    }`}
                  >
                    <span className="flex items-center">
                      {isAchieved ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-orange-400" aria-hidden="true">
                          <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />
                        </svg>
                      ) : isNext ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-orange-400" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <circle cx="12" cy="12" r="4" />
                        </svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50" aria-hidden="true">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      )}
                    </span>
                    <span className={`text-[10.5px] font-bold tabular-nums ${isNext ? "text-orange-400 font-extrabold" : ""}`}>
                      {cp} {t("water_days") || (isEn ? "days" : "hari")}
                    </span>
                    {isAchieved && (
                      <span className="text-[9.5px] text-emerald-500 font-bold">✓</span>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!canScrollRight}
              onClick={() => handleScrollCheckpoints("right")}
              aria-label={isEn ? "Scroll checkpoints right" : "Geser checkpoint ke kanan"}
              className={`w-[22px] h-[26px] rounded-lg border-0 shrink-0 flex items-center justify-center transition-all ${
                canScrollRight
                  ? "cursor-pointer hover:bg-orange-500/20 active:scale-90 text-orange-400"
                  : "opacity-20 cursor-default text-zinc-500"
              }`}
              style={{
                background: canScrollRight ? (isLightMode ? "rgba(251,146,60,0.12)" : "rgba(251,146,60,0.16)") : "transparent",
              }}
            >
              <ChevronRight size={14} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        {/* Stats Summary Footer */}
        <div className="flex items-center gap-3.5 text-[11.5px] mb-0.5 pb-0.5 shrink-0" style={{ color: textSub }}>
          <span>
            {t("water_record")}{" "}
            <b className={isLightMode ? "text-[#101828] font-bold" : "text-white font-bold"}>
              {streak.bestStreak} {t("water_days") || (isEn ? "days" : "hari")}
            </b>
          </span>
          <span
            aria-hidden="true"
            className="w-[3px] h-[3px] rounded-full"
            style={{ background: isLightMode ? "#CBD2DC" : "#3f3f46" }}
          />
          <span>
            {t("water_freeze")}{" "}
            <b className="text-[#7DD3FC] dark:text-[#7DD3FC] font-bold">
              {streak.freezeCount}
            </b>
          </span>
          <span
            aria-hidden="true"
            className="w-[3px] h-[3px] rounded-full"
            style={{ background: isLightMode ? "#CBD2DC" : "#3f3f46" }}
          />
          <span>
            {streak.daysToNextMilestone}{" "}
            {t("water_days_to_next")}{" "}
            <b className="text-[#FB923C] font-bold">
              {streak.nextMilestoneTarget}
            </b>
          </span>
        </div>
      </div>
    </div>
  );
};
