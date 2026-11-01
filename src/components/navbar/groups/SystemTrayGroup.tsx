import React, { useState, useEffect } from "react";
import { Bell, Wifi, Volume2 } from "lucide-react";
import { Tooltip } from "../../ui/Tooltip";

interface SystemTrayGroupProps {
  accentColor?: string;
  showSeconds?: boolean;
  use24HourClock?: boolean;
  showDayOfWeek?: boolean;
  locale?: string;
  unreadCount?: number;
  onControlCenterClick?: () => void;
  onNotificationsClick?: () => void;
  onClockClick?: () => void;
}

export const SystemTrayGroup: React.FC<SystemTrayGroupProps> = ({
  accentColor = "#0a84ff",
  showSeconds = false,
  use24HourClock = true,
  showDayOfWeek = true,
  locale = "id-ID",
  unreadCount = 2,
  onControlCenterClick,
  onNotificationsClick,
  onClockClick,
}) => {
  const [timeStr, setTimeStr] = useState("");
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();

      // Time format
      const hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const seconds = now.getSeconds().toString().padStart(2, "0");

      if (use24HourClock) {
        const hStr = hours.toString().padStart(2, "0");
        setTimeStr(showSeconds ? `${hStr}:${minutes}:${seconds}` : `${hStr}:${minutes}`);
      } else {
        const period = hours >= 12 ? "PM" : "AM";
        const h12 = hours % 12 || 12;
        setTimeStr(showSeconds ? `${h12}:${minutes}:${seconds} ${period}` : `${h12}:${minutes} ${period}`);
      }

      // Date format (e.g., "Sab, 24 Okt" or "Sat, Oct 24")
      const dayName = showDayOfWeek
        ? now.toLocaleDateString(locale, { weekday: "short" }) + ", "
        : "";
      const dateNum = now.getDate();
      const monthName = now.toLocaleDateString(locale, { month: "short" });
      setDateStr(`${dayName}${dateNum} ${monthName}`);
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, showSeconds ? 1000 : 10000);
    return () => clearInterval(interval);
  }, [showSeconds, use24HourClock, showDayOfWeek, locale]);

  return (
    <div className="flex items-center gap-1 shrink-0">
      {/* Control Center Pill */}
      <Tooltip side="top" delay={150} content="Pusat Kontrol">
        <button
          type="button"
          onClick={onControlCenterClick}
          aria-label="Pusat kontrol"
          className="h-10 rounded-[12px] bg-transparent flex items-center px-2 cursor-pointer text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
        >
          <div className="flex items-center gap-2.5 px-0.5">
            <Wifi size={15} strokeWidth={2} />
            <Volume2 size={15} strokeWidth={2} />
            {/* Battery Icon (20x10) */}
            <svg
              width="20"
              height="10"
              viewBox="0 0 22 11"
              fill="none"
              aria-hidden="true"
              className="text-white/80"
            >
              <rect x="0.5" y="0.5" width="18" height="10" rx="3" stroke="currentColor" />
              <rect x="2" y="2" width="14" height="7" rx="1.8" fill="currentColor" />
              <rect x="19.5" y="3.5" width="2" height="4" rx="1" fill="currentColor" />
            </svg>
          </div>
        </button>
      </Tooltip>

      {/* Notifications Bell */}
      <Tooltip
        side="top"
        delay={150}
        content={
          <div className="flex items-center gap-1.5 font-medium text-[11.5px]">
            <span>Notifikasi</span>
            {unreadCount > 0 && (
              <span className="text-[9.5px] px-1 py-0.2 rounded-full bg-blue-500/30 text-blue-200 font-semibold">
                {unreadCount} baru
              </span>
            )}
          </div>
        }
      >
        <button
          type="button"
          onClick={onNotificationsClick}
          aria-label={`Notifikasi, ${unreadCount} baru`}
          className="relative w-9 h-10 rounded-[12px] bg-transparent text-white/60 hover:text-white hover:bg-white/[0.08] flex items-center justify-center p-0 cursor-pointer transition-colors shrink-0"
        >
          <Bell size={17} strokeWidth={1.8} />
          {unreadCount > 0 && (
            <span
              style={{ backgroundColor: accentColor }}
              className="absolute right-2 top-2.5 w-1.5 h-1.5 rounded-full ring-1 ring-black/40"
            />
          )}
        </button>
      </Tooltip>

      {/* Clock & Calendar */}
      <Tooltip side="top" delay={150} content="Kalender & Waktu">
        <button
          type="button"
          onClick={onClockClick}
          aria-label="Jam dan kalender"
          className="rounded-[12px] bg-transparent text-white flex flex-col items-end px-2 py-1 cursor-pointer hover:bg-white/[0.08] transition-colors shrink-0"
        >
          <span className="text-[13px] font-semibold tabular-nums leading-4 tracking-tight">
            {timeStr || "--:--"}
          </span>
          <span className="text-[10px] text-white/55 leading-3 whitespace-nowrap mt-0.5">
            {dateStr || "---"}
          </span>
        </button>
      </Tooltip>
    </div>
  );
};
