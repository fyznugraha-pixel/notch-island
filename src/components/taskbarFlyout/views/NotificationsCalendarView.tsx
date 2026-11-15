import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  setDndStatus,
} from "../../../services/notificationHistoryService";
import {
  formatPomodoroTime,
  recordCompletedFocusSession,
} from "../../../services/pomodoroService";
import { normalizeIconUrl } from "../../navbar/groups/appIcons";
import { useTaskbarLang, tx, dateLocale } from "../../../services/taskbarI18n";
import { Tooltip } from "../../ui/Tooltip";

const renderNotificationAppIcon = (appName?: string, icon?: string) => {
  const isDirectImage =
    typeof icon === "string" &&
    (icon.startsWith("data:") ||
      icon.startsWith("/") ||
      icon.startsWith("http") ||
      icon.length > 40);

  if (isDirectImage) {
    const url = normalizeIconUrl(icon);
    if (url) {
      return (
        <img
          src={url}
          alt=""
          className="w-3.5 h-3.5 object-contain rounded-[3px] shrink-0"
        />
      );
    }
  }
  const lower = (appName || "").toLowerCase();
  if (lower.includes("discord")) {
    return <img src="/logo/discord.webp" alt="Discord" className="w-3.5 h-3.5 object-contain shrink-0" />;
  }
  if (lower.includes("whatsapp")) {
    return <img src="/logo/whatsapp.svg" alt="WhatsApp" className="w-3.5 h-3.5 object-contain shrink-0" />;
  }
  if (lower.includes("telegram")) {
    return <img src="/logo/telegram.svg" alt="Telegram" className="w-3.5 h-3.5 object-contain shrink-0" />;
  }
  if (lower.includes("spotify")) {
    return <img src="/logo/spotify.png" alt="Spotify" className="w-3.5 h-3.5 object-contain shrink-0" />;
  }
  if (lower.includes("chrome")) {
    return <img src="/logo/chrome.png" alt="Chrome" className="w-3.5 h-3.5 object-contain shrink-0" />;
  }
  if (lower.includes("brave")) {
    return <img src="/logo/brave.png" alt="Brave" className="w-3.5 h-3.5 object-contain shrink-0" />;
  }
  return <Bell className="w-3 h-3 text-[var(--taskbar-accent)] shrink-0" />;
};

interface NotificationsCalendarViewProps {
  onClose?: () => void;
}

export const NotificationsCalendarView: React.FC<NotificationsCalendarViewProps> = ({
  onClose,
}) => {
  const lang = useTaskbarLang();
  const [notifications, setNotifications] = useState<NotificationHistoryItem[]>(() =>
    loadNotificationHistory()
  );
  const [isDndActive, setIsDndActive] = useState<boolean>(false);
  const [isFocusRunning, setIsFocusRunning] = useState<boolean>(false);
  const [focusMinutes, setFocusMinutes] = useState<number>(30);
  const [focusSecondsLeft, setFocusSecondsLeft] = useState<number>(30 * 60);
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [viewMonthOffset, setViewMonthOffset] = useState<number>(0);
  const [isCalendarCollapsed, setIsCalendarCollapsed] = useState<boolean>(false);
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);

  useEffect(() => {
    if (!confirmClearAll) return;
    const timer = window.setTimeout(() => setConfirmClearAll(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmClearAll]);

  const syncDndAndNotifications = useCallback(() => {
    setNotifications(loadNotificationHistory());
    invoke<boolean>("get_windows_dnd")
      .then((enabled) => {
        setIsDndActive(!!enabled);
        setDndStatus(!!enabled);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    syncDndAndNotifications();

    const handleUpdate = () => setNotifications(loadNotificationHistory());
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "island_notification_history") {
        setNotifications(loadNotificationHistory());
      }
    };
    const handleFocus = () => syncDndAndNotifications();
    const unlistenFlyout = listen<{ isOpen?: boolean; target?: string }>(
      "taskbar-flyout-state-changed",
      (ev) => {
        if (ev.payload?.isOpen && ev.payload?.target === "notificationsCalendar") {
          syncDndAndNotifications();
        }
      }
    );

    // Refresh date every minute for midnight rollover
    const dateTimer = setInterval(() => {
      const now = new Date();
      setCurrentDate((prev) => (prev.getDate() === now.getDate() ? prev : now));
    }, 60_000);

    window.addEventListener("island_notification_history_updated", handleUpdate);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(dateTimer);
      window.removeEventListener("island_notification_history_updated", handleUpdate);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      unlistenFlyout.then((fn) => fn());
    };
  }, [syncDndAndNotifications]);

  // Countdown tick for live Focus Session
  useEffect(() => {
    if (!isFocusRunning) return;
    const id = setInterval(() => {
      setFocusSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsFocusRunning(false);
          recordCompletedFocusSession(focusMinutes);
          setIsDndActive(false);
          setDndStatus(false);
          invoke("set_windows_dnd", { enabled: false }).catch(() => {});
          return focusMinutes * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isFocusRunning, focusMinutes]);

  const handleToggleDnd = () => {
    const next = !isDndActive;
    setIsDndActive(next);
    setDndStatus(next);
    invoke("set_windows_dnd", { enabled: next }).catch(() => {});
  };

  const handleAdjustFocusMinutes = (delta: number) => {
    if (isFocusRunning) return;
    const next = Math.max(15, Math.min(240, focusMinutes + delta));
    setFocusMinutes(next);
    setFocusSecondsLeft(next * 60);
  };

  const handleToggleFocusSession = () => {
    if (isFocusRunning) {
      setIsFocusRunning(false);
      setFocusSecondsLeft(focusMinutes * 60);
      setIsDndActive(false);
      setDndStatus(false);
      invoke("set_windows_dnd", { enabled: false }).catch(() => {});
    } else {
      setFocusSecondsLeft(focusMinutes * 60);
      setIsFocusRunning(true);
      setIsDndActive(true);
      setDndStatus(true);
      invoke("set_windows_dnd", { enabled: true }).catch(() => {});
    }
  };

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
  const locale = dateLocale(lang);
  const dayHeaders =
    lang === "id"
      ? ["Mg", "Sn", "Sl", "Rb", "Km", "Jm", "Sb"]
      : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const currentMonthName = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(displayDate);
  const todayDateStr = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(currentDate);

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
    <div className="flex flex-col h-full min-h-0 gap-2.5 overflow-hidden select-none text-[var(--taskbar-text)]">
      {/* 1. NOTIFICATIONS SECTION (Board 96 / 98) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between h-8">
          <div className="flex items-center gap-2">
            <span className="text-[14.5px] font-semibold tracking-tight">
              {tx(lang, "Notifications", "Notifikasi")}
            </span>
            {notifications.length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--taskbar-chip)] text-[var(--taskbar-text-2)] font-medium">
                {notifications.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Tooltip
              content={
                isDndActive
                  ? tx(
                      lang,
                      "Do not disturb active (click to turn off)",
                      "Jangan Ganggu aktif (klik untuk matikan)"
                    )
                  : tx(lang, "Turn on Windows Do not disturb", "Aktifkan Jangan Ganggu Windows")
              }
              allowFlip
            >
              <button
                type="button"
                onClick={handleToggleDnd}
                aria-pressed={isDndActive}
                aria-label={
                  isDndActive
                    ? tx(
                        lang,
                        "Do not disturb active (click to turn off)",
                        "Jangan Ganggu aktif (klik untuk matikan)"
                      )
                    : tx(lang, "Turn on Windows Do not disturb", "Aktifkan Jangan Ganggu Windows")
                }
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  isDndActive
                    ? "bg-[var(--taskbar-accent)] text-[var(--taskbar-accent-text)]"
                    : "bg-[var(--taskbar-chip)] text-[var(--taskbar-text-2)] hover:bg-[var(--taskbar-chip-hover)]"
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
            {notifications.length > 0 && (
              <Tooltip
                content={
                  confirmClearAll
                    ? tx(
                        lang,
                        "Click again to clear all notifications",
                        "Klik lagi untuk menghapus semua notifikasi"
                      )
                    : tx(lang, "Clear all notifications", "Hapus semua notifikasi")
                }
                allowFlip
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmClearAll) {
                      setConfirmClearAll(true);
                      return;
                    }
                    setConfirmClearAll(false);
                    handleClearAll();
                  }}
                  className={`h-7 px-2.5 rounded-lg text-[11.5px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                    confirmClearAll
                      ? "bg-[var(--taskbar-danger-bg)] text-[var(--taskbar-danger-text)] border border-[var(--taskbar-status-red)]"
                      : "bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] text-[var(--taskbar-text-2)]"
                  }`}
                >
                  <Trash2 className="w-3 h-3" />
                  <span>
                    {confirmClearAll
                      ? tx(lang, "Confirm clear?", "Yakin hapus?")
                      : tx(lang, "Clear all", "Hapus semua")}
                  </span>
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Notifications list */}
        <div className={`${isCalendarCollapsed ? "flex-1 min-h-0" : "min-h-[120px] max-h-[210px] shrink"} overflow-y-auto flex flex-col gap-2 pr-0.5 custom-scrollbar`}>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-5 text-center text-[var(--taskbar-text-muted)] gap-1">
              <Bell className="w-5 h-5 opacity-50 mb-1" />
              <span className="text-[12px] font-medium">
                {tx(lang, "No new notifications", "Tidak ada notifikasi baru")}
              </span>
              <span className="text-[10.5px]">
                {tx(lang, "You are all caught up", "Anda sudah mengetahui semuanya")}
              </span>
            </div>
          ) : (
            notifications.slice(0, 12).map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  invoke("activate_notification_app", {
                    appName: item.appName,
                    aumid: item.aumid ?? null,
                  }).catch(() => {});
                  onClose?.();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    invoke("activate_notification_app", {
                      appName: item.appName,
                      aumid: item.aumid ?? null,
                    }).catch(() => {});
                    onClose?.();
                  }
                }}
                className="gili-flyout-card p-2.5 flex flex-col gap-1 relative group cursor-pointer transition-colors hover:bg-[var(--taskbar-item-hover)]"
              >
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {renderNotificationAppIcon(item.appName, item.icon)}
                    <span className="text-[10.5px] font-medium text-[var(--taskbar-text-muted)] truncate">
                      {item.appName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-[var(--taskbar-text-muted)] tabular-nums">
                      {new Date(item.timestamp).toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Tooltip
                      content={tx(lang, "Dismiss notification", "Hapus notifikasi")}
                      allowFlip
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveItem(item.id);
                        }}
                        aria-label={tx(lang, "Dismiss notification", "Hapus notifikasi")}
                        className="opacity-65 group-hover:opacity-100 p-0.5 rounded text-[var(--taskbar-text-muted)] hover:text-[var(--taskbar-text)] cursor-pointer transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
                <span className="text-[12px] font-semibold text-[var(--taskbar-text)] leading-tight break-words [overflow-wrap:anywhere] line-clamp-1">
                  {item.title}
                </span>
                <span className="text-[11px] text-[var(--taskbar-text-2)] line-clamp-2 leading-relaxed break-words [overflow-wrap:anywhere]">
                  {item.body}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="w-full h-px bg-[var(--taskbar-separator)] shrink-0" />

      {/* 2. CALENDAR SECTION (Board 96 / 98) */}
      <div className="flex flex-col shrink-0 gap-2">
        <div className="flex items-center justify-between h-7">
          <span className="text-[13px] font-semibold tracking-tight text-[var(--taskbar-text)]">
            {todayDateStr}
          </span>
          <Tooltip
            content={
              isCalendarCollapsed
                ? tx(lang, "Expand calendar", "Perluas kalender")
                : tx(lang, "Collapse calendar", "Ciutkan kalender")
            }
            allowFlip
          >
            <button
              type="button"
              onClick={() => setIsCalendarCollapsed(!isCalendarCollapsed)}
              aria-label={
                isCalendarCollapsed
                  ? tx(lang, "Expand calendar", "Perluas kalender")
                  : tx(lang, "Collapse calendar", "Ciutkan kalender")
              }
              className="w-6 h-6 rounded-md bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text-2)] transition-colors cursor-pointer"
            >
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isCalendarCollapsed ? "" : "rotate-90"
                }`}
              />
            </button>
          </Tooltip>
        </div>

        {!isCalendarCollapsed && (
          <>
            {/* Month selector */}
            <div className="flex items-center justify-between h-7">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[12px] font-semibold text-[var(--taskbar-text)] truncate">
                  {currentMonthName}
                </span>
                {viewMonthOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => setViewMonthOffset(0)}
                    className="h-5 px-2 rounded-full bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] text-[10px] font-medium text-[var(--taskbar-link)] cursor-pointer transition-colors shrink-0"
                  >
                    {tx(lang, "Today", "Hari ini")}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip content={tx(lang, "Previous month", "Bulan sebelumnya")} allowFlip>
                  <button
                    type="button"
                    onClick={() => setViewMonthOffset((prev) => prev - 1)}
                    aria-label={tx(lang, "Previous month", "Bulan sebelumnya")}
                    className="w-6 h-6 rounded-md hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text-2)] cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
                <Tooltip content={tx(lang, "Next month", "Bulan berikutnya")} allowFlip>
                  <button
                    type="button"
                    onClick={() => setViewMonthOffset((prev) => prev + 1)}
                    aria-label={tx(lang, "Next month", "Bulan berikutnya")}
                    className="w-6 h-6 rounded-md hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text-2)] cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Day of week headers */}
            <div className="grid grid-cols-7 text-center">
              {dayHeaders.map((dh) => (
                <span
                  key={dh}
                  className="text-[10.5px] font-semibold text-[var(--taskbar-text-muted)] py-0.5"
                >
                  {dh}
                </span>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-y-0.5 text-center">
              {calendarCells.map((cell, idx) => (
                <div key={idx} className="flex items-center justify-center h-6">
                  <span
                    className={`w-6 h-6 flex items-center justify-center text-[11.5px] rounded-full transition-colors ${
                      cell.isToday
                        ? "bg-[var(--taskbar-accent)] text-[var(--taskbar-accent-text)] font-bold shadow-sm"
                        : cell.isCurrentMonth
                        ? "text-[var(--taskbar-text)] hover:bg-[var(--taskbar-chip)] cursor-pointer"
                        : "text-[var(--taskbar-text-muted)] opacity-45"
                    }`}
                  >
                    {cell.day}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 3. FOCUS SESSION BAR (Live Countdown + DND Sync) */}
        <div className="mt-1 pt-2 border-t border-[var(--taskbar-separator)] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Tooltip
              content={tx(lang, "Decrease focus duration", "Kurangi durasi fokus")}
              allowFlip
            >
              <button
                type="button"
                disabled={isFocusRunning}
                onClick={() => handleAdjustFocusMinutes(-15)}
                aria-label={tx(lang, "Decrease focus duration", "Kurangi durasi fokus")}
                className="w-7 h-7 rounded-lg bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] disabled:opacity-40 flex items-center justify-center text-[var(--taskbar-text)] transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <Minus className="w-3 h-3" />
              </button>
            </Tooltip>
            <span className="text-[12px] font-semibold min-w-[56px] text-center text-[var(--taskbar-text)] tabular-nums">
              {isFocusRunning
                ? formatPomodoroTime(focusSecondsLeft)
                : tx(lang, `${focusMinutes} min`, `${focusMinutes} mnt`)}
            </span>
            <Tooltip
              content={tx(lang, "Increase focus duration", "Tambah durasi fokus")}
              allowFlip
            >
              <button
                type="button"
                disabled={isFocusRunning}
                onClick={() => handleAdjustFocusMinutes(15)}
                aria-label={tx(lang, "Increase focus duration", "Tambah durasi fokus")}
                className="w-7 h-7 rounded-lg bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] disabled:opacity-40 flex items-center justify-center text-[var(--taskbar-text)] transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <Plus className="w-3 h-3" />
              </button>
            </Tooltip>
          </div>

          <button
            type="button"
            onClick={handleToggleFocusSession}
            className={`h-7 px-3 rounded-lg flex items-center gap-1.5 text-[11.5px] font-semibold transition-all cursor-pointer ${
              isFocusRunning
                ? "bg-[#dc2626] hover:bg-[#b91c1c] text-[var(--taskbar-accent-text)] shadow-sm"
                : "bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] text-[var(--taskbar-text)]"
            }`}
          >
            {isFocusRunning ? (
              <>
                <Square className="w-3 h-3 fill-current" />
                <span>{tx(lang, "Stop", "Berhenti")}</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span>{tx(lang, "Focus", "Fokus")}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
