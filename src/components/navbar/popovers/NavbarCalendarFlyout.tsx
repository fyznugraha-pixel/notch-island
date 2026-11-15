import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { hexToRgba } from "../../../services/navbarConfigService";
import { Tooltip } from "../../ui/Tooltip";
import {
  useTaskbarLang,
  tx,
  dateLocale,
  getNavbarTooltipSide,
  type DockPosition,
} from "../../../services/taskbarI18n";
import {
  useNavbarLightMode,
  getInlineFlyoutPositionClass,
  getInlineFlyoutMotionOffset,
} from "../navbarThemeUtils";

interface NavbarCalendarFlyoutProps {
  onClose: () => void;
  accentColor?: string;
  position?: DockPosition;
  isLightMode?: boolean;
}

export const NavbarCalendarFlyout: React.FC<NavbarCalendarFlyoutProps> = ({
  onClose,
  accentColor = "#3882F6",
  position = "bottom",
  isLightMode: isLightModeProp,
}) => {
  const lang = useTaskbarLang();
  const locale = dateLocale(lang);
  const isLightMode = useNavbarLightMode(isLightModeProp);
  const tooltipSide = getNavbarTooltipSide(position);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [timeStr, setTimeStr] = useState("");
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString(locale, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [locale]);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (flyoutRef.current && flyoutRef.current.contains(target)) return;
      if (target?.closest('[data-flyout-trigger="calendar"]')) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handleDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month;

  const monthNames =
    lang === "en"
      ? [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ]
      : [
          "Januari",
          "Februari",
          "Maret",
          "April",
          "Mei",
          "Juni",
          "Juli",
          "Agustus",
          "September",
          "Oktober",
          "November",
          "Desember",
        ];

  const dayHeaders =
    lang === "en"
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const prevMonthLabel = tx(lang, "Previous month", "Bulan sebelumnya");
  const nextMonthLabel = tx(lang, "Next month", "Bulan berikutnya");
  const motionInitial = getInlineFlyoutMotionOffset(position);
  const placementClass = getInlineFlyoutPositionClass(
    position,
    "right-2",
    "bottom-2"
  );

  return (
    <motion.div
      ref={flyoutRef}
      data-navbar-flyout="true"
      data-module-popover="true"
      initial={motionInitial}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={motionInitial}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        borderColor: isLightMode ? "rgba(0,0,0,0.1)" : hexToRgba(accentColor, 0.22),
        boxShadow: isLightMode
          ? `0 20px 44px rgba(15,23,42,0.16), 0 0 0 1px ${hexToRgba(accentColor, 0.14)}`
          : `0 24px 50px rgba(0,0,0,0.85), inset 0 1px 0 ${hexToRgba(accentColor, 0.35)}, 0 0 0 1px ${hexToRgba(accentColor, 0.18)}, 0 8px 30px ${hexToRgba(accentColor, 0.1)}`,
      }}
      className={`absolute ${placementClass} w-[310px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto p-4 rounded-[22px] border backdrop-blur-2xl select-none pointer-events-auto z-50 flex flex-col gap-3.5 ${
        isLightMode
          ? "bg-white/95 text-zinc-900"
          : "bg-[#0c0c10] text-white"
      }`}
    >
      {/* Big Digital Clock Header */}
      <div
        className={`flex flex-col items-center justify-center pt-1 pb-2 border-b ${
          isLightMode ? "border-black/[0.08]" : "border-white/[0.06]"
        }`}
      >
        <span
          style={{
            textShadow: isLightMode
              ? undefined
              : `0 0 24px ${hexToRgba(accentColor, 0.3)}`,
          }}
          className={`text-[32px] font-bold tracking-tight tabular-nums leading-none ${
            isLightMode ? "text-zinc-900" : "text-white"
          }`}
        >
          {timeStr}
        </span>
        <span
          className={`text-[12px] font-medium mt-1 ${
            isLightMode ? "text-zinc-600" : "text-white/50"
          }`}
        >
          {today.toLocaleDateString(locale, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center justify-between px-1">
        <span
          className={`text-[13px] font-semibold ${
            isLightMode ? "text-zinc-900" : "text-white"
          }`}
        >
          {monthNames[month]} {year}
        </span>
        <div className="flex items-center gap-1">
          <Tooltip
            side={tooltipSide}
            delay={150}
            content={prevMonthLabel}
            isLightMode={isLightMode}
          >
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label={prevMonthLabel}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                isLightMode
                  ? "hover:bg-black/[0.07] text-zinc-600 hover:text-zinc-900"
                  : "hover:bg-white/10 text-white/70 hover:text-white"
              }`}
            >
              <ChevronLeft size={15} />
            </button>
          </Tooltip>
          <Tooltip
            side={tooltipSide}
            delay={150}
            content={nextMonthLabel}
            isLightMode={isLightMode}
          >
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label={nextMonthLabel}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                isLightMode
                  ? "hover:bg-black/[0.07] text-zinc-600 hover:text-zinc-900"
                  : "hover:bg-white/10 text-white/70 hover:text-white"
              }`}
            >
              <ChevronRight size={15} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {dayHeaders.map((day) => (
          <span
            key={day}
            className={`font-medium py-1 ${
              isLightMode ? "text-zinc-500" : "text-white/40"
            }`}
          >
            {day}
          </span>
        ))}

        {/* Empty slots before first day */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <span key={`empty-${i}`} />
        ))}

        {/* Days */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const isToday = isCurrentMonth && today.getDate() === dayNum;

          return (
            <button
              key={dayNum}
              type="button"
              style={{
                backgroundColor: isToday ? accentColor : undefined,
                boxShadow: isToday
                  ? `0 0 12px ${hexToRgba(accentColor, 0.55)}`
                  : undefined,
              }}
              className={`h-7 w-7 mx-auto rounded-full flex items-center justify-center text-[11.5px] font-medium transition-all cursor-pointer ${
                isToday
                  ? "text-[#ffffff] font-bold scale-105"
                  : isLightMode
                  ? "text-zinc-800 hover:bg-black/[0.07]"
                  : "text-white/80 hover:bg-white/10"
              }`}
            >
              {dayNum}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
};
