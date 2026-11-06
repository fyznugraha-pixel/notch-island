import React, { useState, useEffect } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Play,
  Square,
  Moon,
  Trash2,
  X,
} from "lucide-react";
import {
  loadNotificationHistory,
  clearNotificationHistory,
  deleteNotificationHistoryItem,
  NotificationHistoryItem,
} from "../../../services/notificationHistoryService";

interface NotificationsCalendarViewProps {
  onClose?: () => void;
}

export const NotificationsCalendarView: React.FC<NotificationsCalendarViewProps> = () => {
  const [notifications, setNotifications] = useState<NotificationHistoryItem[]>(() =>
    loadNotificationHistory()
  );
  const [isFocusActive, setIsFocusActive] = useState<boolean>(false);
  const [focusMinutes, setFocusMinutes] = useState<number>(30);
  const [currentDate] = useState<Date>(() => new Date());
  const [viewMonthOffset, setViewMonthOffset] = useState<number>(0);
  const [isCalendarCollapsed, setIsCalendarCollapsed] = useState<boolean>(false);

  useEffect(() => {
    const handleUpdate = () => {
      setNotifications(loadNotificationHistory());
    };
    window.addEventListener("island_notification_history_updated", handleUpdate);
    return () => {
      window.removeEventListener("island_notification_history_updated", handleUpdate);
    };
  }, []);

  const handleClearAll = () => {
    clearNotificationHistory();
    setNotifications([]);
  };

  const handleRemoveItem = (id: string) => {
    deleteNotificationHistoryItem(id);
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  };

  // Calendar calculations
  const displayDate = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + viewMonthOffset,
    1
  );
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
  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const dayHeaders = ["Mg", "Sn", "Sl", "Rb", "Km", "Jm", "Sb"];

  const currentMonthName = `${monthNames[displayDate.getMonth()]} ${displayDate.getFullYear()}`;
  const todayDayName = dayNames[currentDate.getDay()];
  const todayDateStr = `${todayDayName}, ${String(currentDate.getDate()).padStart(2, "0")} ${
    monthNames[currentDate.getMonth()]
  }`;

  const firstDayIndex = displayDate.getDay();
  const daysInMonth = new Date(
    displayDate.getFullYear(),
    displayDate.getMonth() + 1,
    0
  ).getDate();
  const daysInPrevMonth = new Date(
    displayDate.getFullYear(),
    displayDate.getMonth(),
    0
  ).getDate();

  const calendarCells = [];
  // Previous month trailing days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    calendarCells.push({
      day: daysInPrevMonth - i,
      isCurrentMonth: false,
      isToday: false,
    });
  }
  // Current month days
  const isViewingCurrentMonth = viewMonthOffset === 0;
  const todayDateNum = currentDate.getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    calendarCells.push({
      day,
      isCurrentMonth: true,
      isToday: isViewingCurrentMonth && day === todayDateNum,
    });
  }
  // Next month leading days (fill to multiple of 7)
  const remaining = (7 - (calendarCells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    calendarCells.push({
      day: i,
      isCurrentMonth: false,
      isToday: false,
    });
  }

  return (
    <div className="flex flex-col h-full gap-3 select-none text-[var(--taskbar-text)]">
      {/* 1. NOTIFIKASI SECTION (Board 96 / 98) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between h-8">
          <div className="flex items-center gap-2">
            <span className="text-[14.5px] font-semibold tracking-tight">Notifikasi</span>
            {notifications.length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--taskbar-chip)] text-[var(--taskbar-text-2)] font-medium">
                {notifications.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsFocusActive(!isFocusActive)}
              title="Mode Fokus (Jangan Ganggu)"
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                isFocusActive
                  ? "bg-[var(--taskbar-accent)] text-white"
                  : "bg-[var(--taskbar-chip)] text-[var(--taskbar-text-2)] hover:bg-[var(--taskbar-chip-hover)]"
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="h-7 px-2.5 rounded-lg bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] text-[11.5px] font-medium text-[var(--taskbar-text-2)] flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Hapus semua</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications list */}
        <div className="max-h-[170px] overflow-y-auto flex flex-col gap-2 pr-0.5 custom-scrollbar">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-5 text-center text-[var(--taskbar-text-muted)] gap-1">
              <Bell className="w-5 h-5 opacity-40 mb-1" />
              <span className="text-[12px] font-medium">Tidak ada notifikasi baru</span>
              <span className="text-[10.5px]">Anda sudah mengetahui semuanya</span>
            </div>
          ) : (
            notifications.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="gili-flyout-card p-2.5 flex flex-col gap-1 relative group transition-colors hover:bg-[var(--taskbar-item-hover)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10.5px] font-medium text-[var(--taskbar-text-muted)]">
                      {item.appName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[var(--taskbar-text-muted)]">
                      {new Date(item.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--taskbar-text-muted)] hover:text-white transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <span className="text-[12px] font-semibold text-[var(--taskbar-text)] leading-tight">
                  {item.title}
                </span>
                <span className="text-[11px] text-[var(--taskbar-text-2)] line-clamp-2 leading-relaxed">
                  {item.body}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="w-full h-px bg-[var(--taskbar-separator)] shrink-0" />

      {/* 2. KALENDER SECTION (Board 96 / 98) */}
      <div className="flex flex-col flex-1 gap-2">
        <div className="flex items-center justify-between h-7">
          <span className="text-[13px] font-semibold tracking-tight text-[var(--taskbar-text)]">
            {todayDateStr}
          </span>
          <button
            type="button"
            onClick={() => setIsCalendarCollapsed(!isCalendarCollapsed)}
            className="w-6 h-6 rounded-md bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text-2)] transition-colors"
          >
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isCalendarCollapsed ? "" : "rotate-90"
              }`}
            />
          </button>
        </div>

        {!isCalendarCollapsed && (
          <>
            {/* Month selector */}
            <div className="flex items-center justify-between h-7">
              <span className="text-[12px] font-semibold text-[var(--taskbar-text)]">
                {currentMonthName}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setViewMonthOffset((prev) => prev - 1)}
                  className="w-6 h-6 rounded-md hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text-2)]"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMonthOffset((prev) => prev + 1)}
                  className="w-6 h-6 rounded-md hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text-2)]"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Day of week headers */}
            <div className="grid grid-cols-7 text-center">
              {dayHeaders.map((dh) => (
                <span
                  key={dh}
                  className="text-[10.5px] font-semibold text-[var(--taskbar-text-muted)] py-1"
                >
                  {dh}
                </span>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {calendarCells.map((cell, idx) => (
                <div key={idx} className="flex items-center justify-center h-7">
                  <span
                    className={`w-6 h-6 flex items-center justify-center text-[11.5px] rounded-full transition-colors ${
                      cell.isToday
                        ? "bg-[var(--taskbar-accent)] text-white font-bold shadow-sm"
                        : cell.isCurrentMonth
                        ? "text-[var(--taskbar-text)] hover:bg-[var(--taskbar-chip)] cursor-pointer"
                        : "text-[var(--taskbar-text-muted)] opacity-35"
                    }`}
                  >
                    {cell.day}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 3. SESI FOKUS BAR (Board 96 / 98 bottom bar) */}
        <div className="mt-auto pt-2 border-t border-[var(--taskbar-separator)] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFocusMinutes((prev) => Math.max(15, prev - 15))}
              className="w-7 h-7 rounded-lg bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text)] transition-colors"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-[12px] font-semibold min-w-[50px] text-center text-[var(--taskbar-text)] tabular-nums">
              {focusMinutes} mnt
            </span>
            <button
              type="button"
              onClick={() => setFocusMinutes((prev) => Math.min(240, prev + 15))}
              className="w-7 h-7 rounded-lg bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text)] transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsFocusActive(!isFocusActive)}
            className={`h-7 px-3 rounded-lg flex items-center gap-1.5 text-[11.5px] font-semibold transition-all ${
              isFocusActive
                ? "bg-[var(--taskbar-status-red)] text-white shadow-sm"
                : "bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] text-[var(--taskbar-text)]"
            }`}
          >
            {isFocusActive ? (
              <>
                <Square className="w-3 h-3 fill-current" />
                <span>Berhenti</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span>Fokus</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
