import React from "react";
import { ChevronLeft, ChevronRight, Settings, House, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getWeatherIcon } from "./NotifIcon";
import { Tooltip } from "./Tooltip";
import { iosSpring } from "../../utils/iosMotion";
import { t, getLanguage } from "../../services/i18n";

export interface PanelNavHeaderProps {
  title: string;
  battery?: { is_charging: boolean; percent: number } | null;
  time?: Date;
  weather?: { temp: string; code: number; locationName?: string } | null;
  camActive?: boolean;
  micActive?: boolean;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  prevTooltip?: string;
  nextTooltip?: string;
  onToggleSettings?: () => void;
  isSettingsActive?: boolean;
}

export interface PanelPageDotsProps {
  totalPages: number;
  currentPageIndex: number;
  onSelectPage?: (index: number) => void;
  hideDotsBg?: boolean;
  isMusicPage?: boolean;
}

export interface PanelFrameProps extends PanelNavHeaderProps, PanelPageDotsProps {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  children: React.ReactNode;
  contentClassName?: string;
  hideDotsBg?: boolean;
  isMusicPage?: boolean;
}

export const PanelNavHeader = React.memo<PanelNavHeaderProps>(({
  title,
  battery,
  time,
  weather,
  camActive,
  micActive,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  prevTooltip,
  nextTooltip,
  onToggleSettings,
  isSettingsActive = false,
}) => {
  const lang = getLanguage();
  const locale = lang === "id" ? "id-ID" : "en-US";
  const dateObj = time || new Date();
  const dayName = dateObj.toLocaleDateString(locale, { weekday: "short" });
  const day = dateObj.getDate();
  const month = dateObj.toLocaleDateString(locale, { month: "short" });
  const hours = dateObj.getHours().toString().padStart(2, "0");
  const minutes = dateObj.getMinutes().toString().padStart(2, "0");

  // On the last page (Settings) the next slot is empty, so the return button takes it over
  const settingsInNextSlot = isSettingsActive && !hasNext;

  const settingsButton = onToggleSettings && (
    <Tooltip content={isSettingsActive ? t("nav_back") : t("tab_settings")} side="bottom" align="end">
      <motion.button
        whileTap={{ scale: 0.88 }}
        transition={iosSpring.press}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSettings();
        }}
        className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.18] flex items-center justify-center text-white/85 hover:text-white border border-white/[0.06] transition-colors cursor-pointer shrink-0"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isSettingsActive ? "home" : "gear"}
            initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex items-center justify-center"
          >
            {isSettingsActive ? <House size={12.5} strokeWidth={2.2} /> : <Settings size={12.5} strokeWidth={2.2} />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </Tooltip>
  );

  return (
    <div
      className="flex flex-col shrink-0 select-none w-full mb-1"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Status Bar: Battery Capsule | Date & Time | Weather */}
      <div className="flex items-center justify-between px-3 pt-1.5 pb-1 w-full">
        {/* Left: iOS Battery Capsule or Desktop AC Power */}
        <div className="flex items-center gap-1.5 min-w-[55px] shrink-0">
          {battery && battery.percent <= 100 ? (
            <>
              <div className="relative w-[19px] h-[9.5px] rounded-[3px] border-[1.2px] border-white/60 p-[1px] flex items-center">
                <div 
                  className={`h-full rounded-[1px] transition-all duration-300 ${
                    battery.is_charging 
                      ? "bg-[#34c759]" 
                      : battery.percent <= 20
                      ? "bg-[#ff453a]" 
                      : "bg-white"
                  }`} 
                  style={{ width: `${Math.max(10, Math.min(100, battery.percent))}%` }} 
                />
                <div className="absolute -right-[2.5px] top-[2px] bottom-[2px] w-[1.5px] bg-white/60 rounded-r-[1px]" />
              </div>
              <span className={`text-[10px] font-semibold tabular-nums leading-none ${battery.is_charging ? "text-[#34c759]" : battery.percent <= 20 ? "text-[#ff453a]" : "text-white/85"}`}>
                {`${battery.percent}%`}
              </span>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <Zap size={11} className="text-[#34c759]" />
              <span className="text-[10px] font-semibold tabular-nums leading-none text-white/80">AC Power</span>
            </div>
          )}
        </div>

        {/* Center: Full Date and Time */}
        <div className="flex items-center gap-1.5 text-[10.5px] tracking-tight">
          <span className="font-medium text-white/60">
            {dayName}, {day} {month}
          </span>
          <span className="font-semibold text-white tabular-nums idle-stat-number">
            {hours}:{minutes}
          </span>
        </div>

        {/* Right: Weather & Privacy Indicators */}
        <div className="flex items-center justify-end gap-1.5 min-w-[55px] shrink-0">
          {weather && (
            <div
              className="flex items-center gap-1 text-[10px] font-bold text-neutral-300 idle-stat-number cursor-default"
              title={weather.locationName || undefined}
            >
              {getWeatherIcon(weather.code)}
              <span>{weather.temp}</span>
            </div>
          )}
          {(camActive || micActive) && (
            <div className="flex items-center gap-1 ml-0.5">
              {camActive && <div className="w-1.5 h-1.5 rounded-full bg-[#34c759] shadow-[0_0_6px_#34c759]" />}
              {micActive && <div className="w-1.5 h-1.5 rounded-full bg-[#ff9f0a] shadow-[0_0_6px_#ff9f0a]" />}
            </div>
          )}
        </div>
      </div>

      {/* Title Bar with Prev & Next Buttons flanking the Title */}
      <div className="flex items-center justify-between gap-1 px-3 py-0.5 w-full">
        {/* Prev Button */}
        {hasPrev ? (
          <Tooltip content={prevTooltip || t("nav_prev")} side="bottom" align="start">
            <motion.button
              whileTap={{ scale: 0.88 }}
              transition={iosSpring.press}
              onClick={(e) => {
                e.stopPropagation();
                onPrev?.();
              }}
              className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.18] flex items-center justify-center text-white/85 hover:text-white border border-white/[0.06] transition-colors cursor-pointer shrink-0"
            >
              <ChevronLeft size={14} strokeWidth={2.2} className="shrink-0 -translate-x-[0.5px]" />
            </motion.button>
          </Tooltip>
        ) : (
          <div className="w-6 h-6 shrink-0 opacity-0 pointer-events-none" />
        )}

        {/* Mirrors the settings button so the title stays centered */}
        {onToggleSettings && <div className="w-6 h-6 shrink-0" />}

        {/* Center Section Title with smooth cross-fade (iOS Title Case typography) */}
        <div className="flex-1 flex items-center justify-center overflow-hidden h-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={title}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="text-[12px] font-semibold tracking-tight text-white/85 truncate max-w-[200px] leading-tight text-center"
            >
              {title}
            </motion.span>
          </AnimatePresence>
        </div>

        {onToggleSettings && (settingsInNextSlot ? <div className="w-6 h-6 shrink-0" /> : settingsButton)}

        {/* Next Button */}
        {hasNext ? (
          <Tooltip content={nextTooltip || t("nav_next")} side="bottom" align="end">
            <motion.button
              whileTap={{ scale: 0.88 }}
              transition={iosSpring.press}
              onClick={(e) => {
                e.stopPropagation();
                onNext?.();
              }}
              className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.18] flex items-center justify-center text-white/85 hover:text-white border border-white/[0.06] transition-colors cursor-pointer shrink-0"
            >
              <ChevronRight size={14} strokeWidth={2.2} className="shrink-0 translate-x-[0.5px]" />
            </motion.button>
          </Tooltip>
        ) : settingsInNextSlot ? (
          settingsButton
        ) : (
          <div className="w-6 h-6 shrink-0 opacity-0 pointer-events-none" />
        )}
      </div>
    </div>
  );
});

export const PanelPageDots = React.memo<PanelPageDotsProps>(({
  totalPages,
  currentPageIndex,
  onSelectPage,
  hideDotsBg = false,
  isMusicPage = false,
}) => {
  if (totalPages <= 1) return null;

  return (
    <div
      className={`relative z-10 flex items-center justify-center gap-1.5 pt-1.5 pb-1 w-full select-none shrink-0 transition-colors duration-300 ${
        isMusicPage || hideDotsBg 
          ? "bg-transparent border-none shadow-none backdrop-blur-none" 
          : "bg-gradient-to-t from-black/30 via-black/10 to-transparent"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {Array.from({ length: totalPages }).map((_, idx) => {
        const isCurrent = idx === currentPageIndex;
        return (
          <motion.button
            key={idx}
            layout
            transition={iosSpring.smooth}
            onClick={(e) => {
              e.stopPropagation();
              onSelectPage?.(idx);
            }}
            className={`h-1.5 rounded-full cursor-pointer transition-colors ${
              isCurrent
                ? "w-4 bg-white shadow-[0_0_8px_rgba(255,255,255,0.75)]"
                : isMusicPage
                ? "w-1.5 bg-white/45 hover:bg-white/70"
                : "w-1.5 bg-white/25 hover:bg-white/50"
            }`}
          />
        );
      })}
    </div>
  );
});

export const PanelFrame = React.memo<PanelFrameProps>(({
  title,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  prevTooltip,
  nextTooltip,
  onToggleSettings,
  isSettingsActive,
  totalPages,
  currentPageIndex,
  onSelectPage,
  hideDotsBg = false,
  isMusicPage = false,
  battery,
  time,
  weather,
  camActive,
  micActive,
  children,
  contentClassName = "flex-1 min-w-0 w-full h-full relative z-10 overflow-hidden flex flex-col",
}) => {
  const lastWheelTimeRef = React.useRef(0);
  const wheelDeltaXRef = React.useRef(0);
  const wheelResetTimerRef = React.useRef<number | null>(null);

  const handleWheel = (e: React.WheelEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.closest("input, [data-no-swipe]"))) {
      return;
    }

    // If vertical scroll is dominant (e.g. scrolling lyrics), preserve natural vertical scroll
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) * 1.4) {
      wheelDeltaXRef.current = 0;
      return;
    }

    wheelDeltaXRef.current += e.deltaX;
    if (wheelResetTimerRef.current) clearTimeout(wheelResetTimerRef.current);
    wheelResetTimerRef.current = window.setTimeout(() => {
      wheelDeltaXRef.current = 0;
    }, 200);

    const now = Date.now();
    if (now - lastWheelTimeRef.current < 380) return;

    if (Math.abs(wheelDeltaXRef.current) > 25) {
      const delta = wheelDeltaXRef.current;
      wheelDeltaXRef.current = 0;
      lastWheelTimeRef.current = now;
      if (delta > 0 && hasNext) {
        onNext();
      } else if (delta < 0 && hasPrev) {
        onPrev();
      }
    }
  };

  const handlePanEnd = (e: any, info: { offset: { x: number; y: number } }) => {
    // If the pan originated from an interactive element (e.g. slider input, button), ignore swipe navigation
    const target = (e?.target || e?.srcElement) as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "BUTTON" ||
        target.tagName === "TEXTAREA" ||
        target.closest("input, button, textarea, [data-no-swipe]"))
    ) {
      return;
    }

    if (
      Math.abs(info.offset.x) > 35 &&
      Math.abs(info.offset.x) > Math.abs(info.offset.y) * 1.2
    ) {
      if (info.offset.x < 0 && hasNext) {
        onNext();
      } else if (info.offset.x > 0 && hasPrev) {
        onPrev();
      }
    }
  };

  return (
    <motion.div
      data-page={isMusicPage ? "music" : undefined}
      className="relative w-full h-full flex flex-col justify-between overflow-hidden select-none touch-pan-y rounded-[inherit]"
      onWheel={handleWheel}
      onPanEnd={handlePanEnd}
    >
      {/* Header at Top: Status Bar + Title Bar with Prev/Next Buttons */}
      <div className="relative z-10 w-full shrink-0">
        <PanelNavHeader
          title={title}
          battery={battery}
          time={time}
          weather={weather}
          camActive={camActive}
          micActive={micActive}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onPrev={onPrev}
          onNext={onNext}
          prevTooltip={prevTooltip}
          nextTooltip={nextTooltip}
          onToggleSettings={onToggleSettings}
          isSettingsActive={isSettingsActive}
        />
      </div>

      {/* Middle Body Content (Full Width) */}
      <div className={contentClassName}>
        {children}
      </div>

      {/* Bottom Page Bar (Pagination Dots) */}
      <PanelPageDots
        totalPages={totalPages}
        currentPageIndex={currentPageIndex}
        onSelectPage={onSelectPage}
        hideDotsBg={hideDotsBg}
        isMusicPage={isMusicPage}
      />
    </motion.div>
  );
});
