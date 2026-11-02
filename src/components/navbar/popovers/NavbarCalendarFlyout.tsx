import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { hexToRgba } from "../../../services/navbarConfigService";

interface NavbarCalendarFlyoutProps {
  onClose: () => void;
  accentColor?: string;
}

export const NavbarCalendarFlyout: React.FC<NavbarCalendarFlyoutProps> = ({
  onClose,
  accentColor = "#3882F6",
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [timeStr, setTimeStr] = useState("");
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], {
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
  }, []);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (flyoutRef.current && flyoutRef.current.contains(target)) return;
      if (target?.closest('[data-flyout-trigger="calendar"]')) return;
      onClose();
    };
    window.addEventListener("mousedown", handleDown);
    return () => window.removeEventListener("mousedown", handleDown);
  }, [onClose]);

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month;

  const monthNames = [
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

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  return (
    <motion.div
      ref={flyoutRef}
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        borderColor: hexToRgba(accentColor, 0.22),
        boxShadow: `0 24px 50px rgba(0,0,0,0.85), inset 0 1px 0 ${hexToRgba(accentColor, 0.35)}, 0 0 0 1px ${hexToRgba(accentColor, 0.18)}, 0 8px 30px ${hexToRgba(accentColor, 0.1)}`,
      }}
      className="absolute bottom-full mb-3.5 right-2 w-[310px] p-4 rounded-[22px] bg-[#0c0c10] border backdrop-blur-2xl text-white select-none pointer-events-auto z-50 flex flex-col gap-3.5"
    >
      {/* Big Digital Clock Header */}
      <div className="flex flex-col items-center justify-center pt-1 pb-2 border-b border-white/[0.06]">
        <span
          style={{ textShadow: `0 0 24px ${hexToRgba(accentColor, 0.3)}` }}
          className="text-[32px] font-bold tracking-tight tabular-nums text-white leading-none"
        >
          {timeStr}
        </span>
        <span className="text-[12px] font-medium text-white/50 mt-1">
          {today.toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[13px] font-semibold text-white">
          {monthNames[month]} {year}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => (
          <span key={day} className="text-white/40 font-medium py-1">
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
                boxShadow: isToday ? `0 0 12px ${hexToRgba(accentColor, 0.55)}` : undefined,
              }}
              className={`h-7 w-7 mx-auto rounded-full flex items-center justify-center text-[11.5px] font-medium transition-all cursor-pointer ${
                isToday
                  ? "text-white font-bold scale-105"
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
