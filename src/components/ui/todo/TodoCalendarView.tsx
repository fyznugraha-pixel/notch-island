import React, { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Clock, Bell, Check } from "lucide-react";
import { t, getLanguage, Language } from "../../../services/i18n";

export interface TodoCalendarViewProps {
  taskTitle: string;
  initialDueAt?: number | null;
  initialReminders?: number[];
  optAccent?: string;
  optLanguage?: Language;
  onSave: (dueAt: number | null, reminders: number[]) => void;
  onCancel: () => void;
}

const REMINDER_OPTIONS = [
  { offsetMin: 0, labelKey: "todo_remind_on_time" as const },
  { offsetMin: 10, labelKey: "todo_remind_10m" as const },
  { offsetMin: 60, labelKey: "todo_remind_1h" as const },
  { offsetMin: 1440, labelKey: "todo_remind_1d" as const },
];

const HOURS_LIST = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_LIST = Array.from({ length: 60 }, (_, i) => i);

export const TodoCalendarView: React.FC<TodoCalendarViewProps> = ({
  taskTitle,
  initialDueAt,
  initialReminders,
  optAccent = "#3882F6",
  optLanguage,
  onSave,
  onCancel,
}) => {
  const isEn = (optLanguage || getLanguage()) === "en";
  const now = new Date();
  const initialDate = useMemo(() => {
    if (initialDueAt) return new Date(initialDueAt);
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  }, [initialDueAt]);

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), initialDate.getDate())
  );
  const [selectedHour, setSelectedHour] = useState<number>(() => initialDate.getHours());
  const [selectedMinute, setSelectedMinute] = useState<number>(() => initialDate.getMinutes());
  const [isTimePopoverOpen, setIsTimePopoverOpen] = useState(false);

  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);

  const [reminders, setReminders] = useState<number[]>(
    initialReminders && initialReminders.length > 0 ? initialReminders : [0, 10]
  );

  useEffect(() => {
    if (!isTimePopoverOpen) return;
    const timer = window.setTimeout(() => {
      if (hourListRef.current) {
        const activeHourEl = hourListRef.current.querySelector(
          `[data-hour="${selectedHour}"]`
        ) as HTMLElement | null;
        activeHourEl?.scrollIntoView({ block: "center" });
      }
      if (minuteListRef.current) {
        const activeMinEl = minuteListRef.current.querySelector(
          `[data-minute="${selectedMinute}"]`
        ) as HTMLElement | null;
        activeMinEl?.scrollIntoView({ block: "center" });
      }
    }, 15);
    return () => clearTimeout(timer);
  }, [isTimePopoverOpen]);

  const timeStr = useMemo(() => {
    const hh = String(selectedHour).padStart(2, "0");
    const mm = String(selectedMinute).padStart(2, "0");
    return `${hh}:${mm}`;
  }, [selectedHour, selectedMinute]);

  const stepMinutes = (deltaMin: number) => {
    const total = (selectedHour * 60 + selectedMinute + deltaMin + 1440) % 1440;
    setSelectedHour(Math.floor(total / 60));
    setSelectedMinute(total % 60);
  };

  const effectiveLang = optLanguage || getLanguage();
  const locale = effectiveLang === "id" ? "id-ID" : "en-US";
  const dayHeaders =
    effectiveLang === "id"
      ? ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const monthTitle = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  }, [viewYear, viewMonth, locale]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const applyPreset = (preset: "today" | "tomorrow" | "weekend" | "next_week") => {
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (preset === "tomorrow") {
      target.setDate(target.getDate() + 1);
    } else if (preset === "weekend") {
      const day = target.getDay();
      const diffToSat = day === 6 ? 7 : (6 - day + 7) % 7;
      target.setDate(target.getDate() + (diffToSat === 0 ? 1 : diffToSat));
    } else if (preset === "next_week") {
      const day = target.getDay();
      const diffToMon = (1 - day + 7) % 7 || 7;
      target.setDate(target.getDate() + diffToMon);
    }
    setSelectedDate(target);
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
  };

  const toggleReminder = (offsetMin: number) => {
    setReminders((prev) =>
      prev.includes(offsetMin)
        ? prev.filter((r) => r !== offsetMin)
        : [...prev, offsetMin].sort((a, b) => a - b)
    );
  };

  const computedDueTimestamp = useMemo(() => {
    const dt = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      selectedHour,
      selectedMinute,
      0,
      0
    );
    return dt.getTime();
  }, [selectedDate, selectedHour, selectedMinute]);

  const summaryDateText = useMemo(() => {
    const dt = new Date(computedDueTimestamp);
    const datePart = dt.toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    return `${datePart}, ${timeStr}`;
  }, [computedDueTimestamp, locale, timeStr]);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  return (
    <div className="relative flex flex-col w-full h-full min-h-0 px-6 pb-1 select-none text-white">
      {isTimePopoverOpen && (
        <div
          className="fixed inset-0 z-30 bg-transparent"
          onClick={(e) => {
            e.stopPropagation();
            setIsTimePopoverOpen(false);
          }}
        />
      )}

      {/* Header Row */}
      <div className="flex items-center gap-2.5 shrink-0 mb-2">
        <button
          type="button"
          onClick={onCancel}
          className="w-7 h-7 rounded-full bg-[#17171c] hover:bg-[#23232a] text-zinc-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
        >
          <ChevronLeft size={15} />
        </button>
        <h2 className="text-[14px] font-semibold tracking-tight truncate flex-1 min-w-0">
          {taskTitle || t("todo_set_reminder")}
        </h2>
        <button
          type="button"
          onClick={() => onSave(computedDueTimestamp, reminders)}
          style={{ backgroundColor: optAccent }}
          className="h-7 px-3.5 rounded-full text-white text-[12px] font-semibold hover:brightness-110 active:scale-95 transition-all cursor-pointer shrink-0"
        >
          {t("todo_save")}
        </button>
      </div>

      {/* Main Body: Left Calendar + Right Options */}
      <div className="flex gap-4 flex-1 min-h-0 items-stretch">
        {/* Left: Compact Monthly Calendar */}
        <div className="w-[245px] shrink-0 flex flex-col justify-between bg-[#101015] border border-[#1e1e25] rounded-2xl px-3 py-2">
          <div className="flex items-center justify-between h-6">
            <span className="text-[12.5px] font-semibold capitalize">{monthTitle}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 0) {
                    setViewMonth(11);
                    setViewYear((y) => y - 1);
                  } else {
                    setViewMonth((m) => m - 1);
                  }
                }}
                className="w-6 h-6 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 11) {
                    setViewMonth(0);
                    setViewYear((y) => y + 1);
                  } else {
                    setViewMonth((m) => m + 1);
                  }
                }}
                className="w-6 h-6 rounded-full hover:bg-white/10 text-zinc-200 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center text-[10px] text-zinc-400 font-medium my-0.5">
            {dayHeaders.map((dh) => (
              <span key={dh}>{dh}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5 justify-items-center text-[11.5px] tabular-nums flex-1 items-center">
            {calendarCells.map((day, idx) => {
              if (!day) return <span key={`empty-${idx}`} className="w-7 h-6" />;
              const cellDate = new Date(viewYear, viewMonth, day);
              const cellTime = cellDate.getTime();
              const isPast = cellTime < todayMidnight;
              const isToday = cellTime === todayMidnight;
              const isSelected = isSameDay(cellDate, selectedDate);

              return (
                <button
                  key={day}
                  type="button"
                  disabled={isPast}
                  onClick={() => setSelectedDate(cellDate)}
                  style={
                    isSelected
                      ? { backgroundColor: optAccent, color: "#ffffff" }
                      : isToday
                      ? { borderColor: optAccent, color: "#8db8ff" }
                      : undefined
                  }
                  className={`w-7 h-6 rounded-full flex items-center justify-center transition-colors ${
                    isSelected
                      ? "font-semibold shadow-sm cursor-pointer"
                      : isToday
                      ? "border font-semibold cursor-pointer"
                      : isPast
                      ? "text-zinc-600 cursor-not-allowed"
                      : "text-zinc-200 hover:bg-white/10 cursor-pointer"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Quick Presets + Custom Time Picker + Multi-Reminder */}
        <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
          {/* Quick Date Presets */}
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: "today" as const, label: t("todo_preset_today"), active: isSameDay(selectedDate, now) },
              {
                id: "tomorrow" as const,
                label: t("todo_preset_tomorrow"),
                active: isSameDay(selectedDate, tomorrowDate),
              },
              { id: "weekend" as const, label: t("todo_preset_weekend"), active: false },
              { id: "next_week" as const, label: t("todo_preset_next_week"), active: false },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`h-7 rounded-xl border text-[11.5px] transition-colors cursor-pointer ${
                  p.active
                    ? "border-[#3882F6] bg-[#3882F6]/15 text-[#8db8ff] font-semibold"
                    : "border-[#2a2a31] bg-transparent text-zinc-300 hover:bg-white/5 font-medium"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Gili Time Picker */}
          <div className="relative flex flex-col gap-1">
            <label className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
              {t("todo_time_label")}
            </label>
            <div className="flex items-center gap-1.5" data-no-swipe="true">
              {/* Interactive Hour : Minute Trigger Pill */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTimePopoverOpen((v) => !v);
                }}
                className={`flex-1 h-8 rounded-xl border bg-[#101015] px-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                  isTimePopoverOpen
                    ? "border-[#3882F6] bg-[#15151d]"
                    : "border-[#2a2a31] hover:border-[#3c3c46]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock size={13} className="text-[#3882F6] shrink-0" />
                  <div className="flex items-center gap-0.5 text-[13.5px] font-bold tabular-nums text-white">
                    <span
                      title={isEn ? "Scroll to adjust hour" : "Gulir untuk mengatur jam"}
                      onWheel={(e) => {
                        if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
                          e.stopPropagation();
                          if (Math.abs(e.deltaY) < 1) return;
                          setSelectedHour((h) => (h + (e.deltaY < 0 ? 1 : -1) + 24) % 24);
                        }
                      }}
                      className="px-1 py-0.5 rounded hover:bg-white/10 transition-colors"
                    >
                      {String(selectedHour).padStart(2, "0")}
                    </span>
                    <span className="text-zinc-500">:</span>
                    <span
                      title={isEn ? "Scroll to adjust minute" : "Gulir untuk mengatur menit"}
                      onWheel={(e) => {
                        if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
                          e.stopPropagation();
                          if (Math.abs(e.deltaY) < 1) return;
                          setSelectedMinute((m) => (m + (e.deltaY < 0 ? 1 : -1) + 60) % 60);
                        }
                      }}
                      className="px-1 py-0.5 rounded hover:bg-white/10 transition-colors"
                    >
                      {String(selectedMinute).padStart(2, "0")}
                    </span>
                  </div>
                </div>
                <ChevronDown
                  size={13}
                  className={`text-zinc-400 transition-transform ${
                    isTimePopoverOpen ? "rotate-180 text-white" : ""
                  }`}
                />
              </div>

              {/* Quick Steppers: -15m / +15m */}
              <button
                type="button"
                onClick={() => stepMinutes(-15)}
                className="h-8 px-2.5 rounded-xl border border-[#2a2a31] bg-[#101015] hover:bg-white/5 text-[11px] font-semibold text-zinc-300 hover:text-white tabular-nums transition-colors cursor-pointer shrink-0"
              >
                -15m
              </button>
              <button
                type="button"
                onClick={() => stepMinutes(15)}
                className="h-8 px-2.5 rounded-xl border border-[#2a2a31] bg-[#101015] hover:bg-white/5 text-[11px] font-semibold text-zinc-300 hover:text-white tabular-nums transition-colors cursor-pointer shrink-0"
              >
                +15m
              </button>
            </div>

            {/* Custom Dark Dual-Column Time Popover */}
            {isTimePopoverOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                data-no-swipe="true"
                className="absolute left-0 top-[calc(100%+4px)] z-50 w-[196px] h-[142px] p-1.5 rounded-2xl bg-[#15151c] border border-[#2e2e38] shadow-[0_10px_26px_rgba(0,0,0,0.65)] flex gap-1.5"
              >
                {/* Hours Column */}
                <div
                  ref={hourListRef}
                  onWheel={(e) => e.stopPropagation()}
                  className="flex-1 h-full overflow-y-auto todo-scroll flex flex-col gap-0.5 pr-0.5"
                >
                  {HOURS_LIST.map((h) => {
                    const active = h === selectedHour;
                    return (
                      <button
                        key={h}
                        type="button"
                        data-hour={h}
                        onClick={() => setSelectedHour(h)}
                        className={`h-7 shrink-0 rounded-lg text-[12.5px] font-semibold tabular-nums flex items-center justify-center transition-colors cursor-pointer ${
                          active
                            ? "bg-[#3882F6] text-white"
                            : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                        }`}
                      >
                        {String(h).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>

                <div className="w-[1px] bg-white/[0.06] my-1 shrink-0" />

                {/* Minutes Column */}
                <div
                  ref={minuteListRef}
                  onWheel={(e) => e.stopPropagation()}
                  className="flex-1 h-full overflow-y-auto todo-scroll flex flex-col gap-0.5 pr-0.5"
                >
                  {MINUTES_LIST.map((m) => {
                    const active = m === selectedMinute;
                    return (
                      <button
                        key={m}
                        type="button"
                        data-minute={m}
                        onClick={() => {
                          setSelectedMinute(m);
                          setIsTimePopoverOpen(false);
                        }}
                        className={`h-7 shrink-0 rounded-lg text-[12.5px] font-semibold tabular-nums flex items-center justify-center transition-colors cursor-pointer ${
                          active
                            ? "bg-[#3882F6] text-white"
                            : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                        }`}
                      >
                        {String(m).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Remind Me Multi-Select */}
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                {t("todo_remind_me")}
              </span>
              <span className="text-[10px] text-zinc-500">{t("todo_remind_multi")}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {REMINDER_OPTIONS.map((opt) => {
                const active = reminders.includes(opt.offsetMin);
                return (
                  <button
                    key={opt.offsetMin}
                    type="button"
                    onClick={() => toggleReminder(opt.offsetMin)}
                    className={`h-7 rounded-xl border text-[11.5px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      active
                        ? "border-[#3882F6] bg-[#3882F6]/15 text-[#8db8ff] font-semibold"
                        : "border-[#2a2a31] bg-transparent text-zinc-300 hover:bg-white/5 font-medium"
                    }`}
                  >
                    {active && <Check size={11} strokeWidth={2.8} />}
                    <span>{t(opt.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Summary Bar */}
      <div className="mt-2 h-8 rounded-xl bg-[#101015] border border-[#1e1e25] px-3 flex items-center gap-2 shrink-0">
        <Bell size={13} className="text-amber-400 shrink-0" />
        <span className="text-[12px] font-semibold text-white truncate">{summaryDateText}</span>
        <div className="flex-1" />
        {initialDueAt && (
          <button
            type="button"
            onClick={() => onSave(null, [])}
            className="h-6 px-2 rounded-lg text-[11px] font-medium text-[#ff9b8f] hover:bg-[#ff6b5a]/15 transition-colors cursor-pointer"
          >
            {t("todo_remove_deadline")}
          </button>
        )}
      </div>
    </div>
  );
};
