import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  Plus,
  Trash2,
  Check,
  Pencil,
  Clock,
  Bell,
  Timer,
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronDown,
  CornerDownLeft,
} from "lucide-react";
import { t, getLanguage, Language } from "../../services/i18n";
import { TodoCalendarView } from "./todo/TodoCalendarView";
import { playTaskCompleteSound } from "../../services/soundService";

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  dueAt?: number | null;
  reminders?: number[];
  remindedOffsets?: number[];
  snoozedUntil?: number | null;
}

export interface TodoListPanelProps {
  items: TodoItem[];
  optAccent?: string;
  optLanguage?: Language;
  onAddItem: (text: string, dueAt?: number | null, reminders?: number[]) => void;
  onToggleItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onUpdateItem?: (id: string, text: string) => void;
  onUpdateDeadline?: (id: string, dueAt: number | null, reminders: number[]) => void;
  onStartPomodoroForTask?: (task: TodoItem) => void;
  onClearCompleted?: () => void;
  onClearAll?: () => void;
  onHeightChange?: (heightPx: number) => void;
}

function getDefaultEveningToday(): number {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0, 0);
  if (target.getTime() <= now.getTime() + 15 * 60_000) {
    target.setHours(now.getHours() + 1, 0, 0, 0);
  }
  return target.getTime();
}

function getDefaultMorningTomorrow(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0).getTime();
}

function formatDueBadge(dueAt: number): {
  badgeText: string;
  timeLabel: string;
  status: "overdue" | "urgent" | "soon" | "upcoming";
} {
  const nowMs = Date.now();
  const diffMin = Math.round((dueAt - nowMs) / 60_000);
  const dt = new Date(dueAt);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const timeLabel = `${hh}:${mm}`;

  if (diffMin < 0) {
    const absMin = Math.abs(diffMin);
    if (absMin >= 60) {
      const h = Math.floor(absMin / 60);
      const m = absMin % 60;
      const unitH = getLanguage() === "id" ? "j" : "h";
      return {
        badgeText: `${t("todo_overdue_prefix")} ${h}${unitH}${m > 0 ? ` ${m}m` : ""}`,
        timeLabel,
        status: "overdue",
      };
    }
    return {
      badgeText: `${t("todo_overdue_prefix")} ${Math.max(1, absMin)}m`,
      timeLabel,
      status: "overdue",
    };
  }

  if (diffMin <= 15) {
    const unitMin = getLanguage() === "id" ? "mnt" : "min";
    return {
      badgeText: `${Math.max(1, diffMin)} ${unitMin}`,
      timeLabel,
      status: "urgent",
    };
  }

  if (diffMin <= 60) {
    const unitMin = getLanguage() === "id" ? "mnt" : "min";
    return {
      badgeText: `${diffMin} ${unitMin}`,
      timeLabel,
      status: "soon",
    };
  }

  const today = new Date();
  const isToday =
    dt.getFullYear() === today.getFullYear() &&
    dt.getMonth() === today.getMonth() &&
    dt.getDate() === today.getDate();

  if (isToday) {
    return { badgeText: "", timeLabel, status: "upcoming" };
  }

  const locale = getLanguage() === "id" ? "id-ID" : "en-US";
  const shortDate = dt.toLocaleDateString(locale, { day: "numeric", month: "short" });
  return { badgeText: shortDate, timeLabel, status: "upcoming" };
}

export const TodoListPanel = React.memo<TodoListPanelProps>(({
  items,
  optAccent = "#3882F6",
  optLanguage,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onUpdateItem,
  onUpdateDeadline,
  onStartPomodoroForTask,
  onHeightChange,
}) => {
  const [filter, setFilter] = useState<"today" | "upcoming" | "all">("all");
  const [inputText, setInputText] = useState("");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [newDuePreset, setNewDuePreset] = useState<"today" | "tomorrow" | "none" | "custom">("today");
  const [customNewDueAt, setCustomNewDueAt] = useState<number | null>(null);
  const [customNewReminders, setCustomNewReminders] = useState<number[]>([0, 10]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  // Calendar view state (either for an existing task id, or "__new__" for the new task composer)
  const [calendarTargetId, setCalendarTargetId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const completedItems = useMemo(() => items.filter((i) => i.completed), [items]);
  const pendingItems = useMemo(() => {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    return items
      .filter((i) => !i.completed)
      .filter((i) => {
        if (filter === "today") {
          return !i.dueAt || i.dueAt <= endOfToday;
        }
        if (filter === "upcoming") {
          return Boolean(i.dueAt && i.dueAt > endOfToday);
        }
        return true;
      })
      .sort((a, b) => {
        if (a.dueAt && b.dueAt) return a.dueAt - b.dueAt;
        if (a.dueAt) return -1;
        if (b.dueAt) return 1;
        return b.createdAt - a.createdAt;
      });
  }, [items, filter]);

  const totalCount = items.length;
  const doneCount = completedItems.length;
  const progressRatio = totalCount > 0 ? doneCount / totalCount : 0;
  const ringCircumference = 69.1; // 2 * pi * 11
  const ringDash = `${(progressRatio * ringCircumference).toFixed(1)} ${ringCircumference}`;

  const composerExpanded = isComposerOpen || inputText.trim().length > 0;

  const handleCancelComposer = () => {
    setIsComposerOpen(false);
    setInputText("");
    setNewDuePreset("today");
    setCustomNewDueAt(null);
    inputRef.current?.blur();
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (isComposerOpen || inputText.trim().length > 0)) {
        e.preventDefault();
        handleCancelComposer();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isComposerOpen, inputText]);

  useEffect(() => {
    if (!onHeightChange) return;
    if (calendarTargetId) {
      onHeightChange(418);
      return;
    }
    const baseChrome = 208;
    const composerExtra = composerExpanded ? 44 : 0;
    const visibleSlots = Math.min(4, Math.max(1, pendingItems.length));
    const tasksHeight =
      pendingItems.length === 0
        ? 52
        : visibleSlots * 40 + (visibleSlots - 1) * 4 + 10;
    const completedExtra =
      completedItems.length > 0
        ? 32 + (showCompleted ? Math.min(2, completedItems.length) * 36 : 0)
        : 0;
    onHeightChange(Math.min(446, baseChrome + composerExtra + tasksHeight + completedExtra));
  }, [
    onHeightChange,
    calendarTargetId,
    composerExpanded,
    pendingItems.length,
    completedItems.length,
    showCompleted,
  ]);

  const resolveNewTaskDue = (): { dueAt: number | null; reminders: number[] } => {
    if (newDuePreset === "none") return { dueAt: null, reminders: [] };
    if (newDuePreset === "custom" && customNewDueAt) {
      return { dueAt: customNewDueAt, reminders: customNewReminders };
    }
    if (newDuePreset === "tomorrow") {
      return { dueAt: getDefaultMorningTomorrow(), reminders: [0, 10] };
    }
    return { dueAt: getDefaultEveningToday(), reminders: [0, 10] };
  };

  const handleCreateTask = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;
    const { dueAt, reminders } = resolveNewTaskDue();
    onAddItem(trimmed, dueAt, reminders);
    setInputText("");
    setIsComposerOpen(false);
    setNewDuePreset("today");
    setCustomNewDueAt(null);
  };

  const handleSaveInlineEdit = (id: string) => {
    const trimmed = editingText.trim();
    if (trimmed && onUpdateItem) {
      onUpdateItem(id, trimmed);
    }
    setEditingId(null);
    setEditingText("");
  };

  const handleSnoozeOneHour = (task: TodoItem) => {
    if (!onUpdateDeadline) return;
    const base = task.dueAt && task.dueAt > Date.now() ? task.dueAt : Date.now();
    const nextDue = base + 60 * 60_000;
    onUpdateDeadline(task.id, nextDue, task.reminders || [0, 10]);
  };

  // Render Calendar & Reminder Subview when active (Board 10)
  if (calendarTargetId) {
    const isNewTarget = calendarTargetId === "__new__";
    const targetTask = isNewTarget ? null : items.find((i) => i.id === calendarTargetId);

    return (
      <TodoCalendarView
        taskTitle={isNewTarget ? inputText.trim() || t("todo_add_task") : targetTask?.text || ""}
        initialDueAt={isNewTarget ? customNewDueAt || getDefaultEveningToday() : targetTask?.dueAt}
        initialReminders={isNewTarget ? customNewReminders : targetTask?.reminders}
        optAccent={optAccent}
        optLanguage={optLanguage}
        onCancel={() => setCalendarTargetId(null)}
        onSave={(dueAt, reminders) => {
          if (isNewTarget) {
            if (dueAt) {
              setNewDuePreset("custom");
              setCustomNewDueAt(dueAt);
              setCustomNewReminders(reminders);
            } else {
              setNewDuePreset("none");
              setCustomNewDueAt(null);
            }
            setIsComposerOpen(true);
          } else if (targetTask && onUpdateDeadline) {
            onUpdateDeadline(targetTask.id, dueAt, reminders);
          }
          setCalendarTargetId(null);
        }}
      />
    );
  }

  const todayEveningDate = new Date(getDefaultEveningToday());
  const todayEveningStr = `${String(todayEveningDate.getHours()).padStart(2, "0")}:${String(
    todayEveningDate.getMinutes()
  ).padStart(2, "0")}`;

  return (
    <div className="flex flex-col w-full h-full min-h-0 px-6 pb-2 select-none text-white overflow-hidden">
      {/* Top Row: Progress Ring Summary + Filter Tabs (Hari ini | Mendatang | Semua) */}
      <div className="flex items-center justify-between gap-2 shrink-0 mb-2">
        <div className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
            <circle cx="14" cy="14" r="11" fill="none" stroke="#2a2a31" strokeWidth="3" />
            <circle
              cx="14"
              cy="14"
              r="11"
              fill="none"
              stroke={totalCount > 0 && doneCount === totalCount ? "#34c3a0" : optAccent}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={ringDash}
              transform="rotate(-90 14 14)"
              className="transition-all duration-300"
            />
          </svg>
          <span className="text-[11.5px] font-medium text-zinc-400 tabular-nums">
            {t("todo_progress_summary", { done: doneCount, total: totalCount })}
          </span>
        </div>

        <div
          role="tablist"
          className="flex items-center gap-0.5 p-0.5 bg-[#121216] rounded-[10px] border border-white/5"
        >
          {[
            { id: "today" as const, label: t("todo_filter_today") },
            { id: "upcoming" as const, label: t("todo_filter_upcoming") },
            { id: "all" as const, label: t("todo_filter_all") },
          ].map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.id)}
                className={`h-6 px-2.5 rounded-[8px] text-[11px] font-medium transition-colors cursor-pointer ${
                  active ? "bg-[#2a2a31] text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* New Task Composer AT THE TOP with Time/Deadline Button */}
      <div
        className={`shrink-0 rounded-xl transition-all mb-2 ${
          isComposerOpen || inputText.trim().length > 0
            ? "bg-[#101015] border-[1.5px] px-3 py-2 flex flex-col gap-2"
            : "border border-dashed border-[#34343c] hover:border-zinc-500 px-3 h-9 flex items-center"
        }`}
        style={
          isComposerOpen || inputText.trim().length > 0 ? { borderColor: optAccent } : undefined
        }
      >
        <form onSubmit={handleCreateTask} className="flex items-center gap-2.5 w-full">
          <Plus
            size={16}
            style={
              isComposerOpen || inputText.trim().length > 0 ? { color: optAccent } : undefined
            }
            className="text-zinc-400 shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onFocus={() => setIsComposerOpen(true)}
            onChange={(e) => {
              setInputText(e.target.value);
              if (!isComposerOpen) setIsComposerOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                handleCancelComposer();
              }
            }}
            placeholder={t("todo_placeholder")}
            className="flex-1 bg-transparent border-0 outline-none text-[13px] font-medium text-white placeholder-zinc-500 min-w-0"
          />
          <div className="flex items-center gap-1 shrink-0">
            {(isComposerOpen || inputText.trim().length > 0) && (
              <button
                type="button"
                onClick={handleCancelComposer}
                title={t("todo_cancel_esc")}
                className="text-[10px] font-medium text-zinc-400 hover:text-white hover:bg-white/10 border border-[#34343c] hover:border-zinc-500 rounded-md px-1.5 py-0.5 transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
              >
                <span>Esc</span>
              </button>
            )}
            <button
              type="submit"
              title={t("todo_add_task_enter")}
              className="text-[10px] font-medium text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 border border-[#34343c] hover:border-zinc-500 rounded-md px-1.5 py-0.5 transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
            >
              <CornerDownLeft size={10} className="text-zinc-400" />
              <span>Enter</span>
            </button>
          </div>
        </form>

        {(isComposerOpen || inputText.trim().length > 0) && (
          <div className="flex items-center gap-1.5 pl-6 flex-wrap">
            <button
              type="button"
              onClick={() => setNewDuePreset("today")}
              style={
                newDuePreset === "today"
                  ? { borderColor: optAccent, backgroundColor: "rgba(56,130,246,0.16)" }
                  : undefined
              }
              className={`h-6 px-2.5 rounded-full border text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                newDuePreset === "today"
                  ? "text-[#8db8ff]"
                  : "border-[#34343c] text-zinc-300 hover:bg-white/5"
              }`}
            >
              <Bell size={10} />
              <span>
                {t("todo_preset_today")}, {todayEveningStr}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setNewDuePreset("tomorrow")}
              style={
                newDuePreset === "tomorrow"
                  ? { borderColor: optAccent, backgroundColor: "rgba(56,130,246,0.16)" }
                  : undefined
              }
              className={`h-6 px-2.5 rounded-full border text-[11px] font-medium cursor-pointer transition-colors ${
                newDuePreset === "tomorrow"
                  ? "text-[#8db8ff]"
                  : "border-[#34343c] text-zinc-300 hover:bg-white/5"
              }`}
            >
              {t("todo_preset_tomorrow")}
            </button>

            <button
              type="button"
              onClick={() => setNewDuePreset("none")}
              style={
                newDuePreset === "none"
                  ? { borderColor: optAccent, backgroundColor: "rgba(56,130,246,0.16)" }
                  : undefined
              }
              className={`h-6 px-2.5 rounded-full border text-[11px] font-medium cursor-pointer transition-colors ${
                newDuePreset === "none"
                  ? "text-[#8db8ff]"
                  : "border-[#34343c] text-zinc-300 hover:bg-white/5"
              }`}
            >
              {t("todo_preset_no_time")}
            </button>

            <button
              type="button"
              onClick={() => setCalendarTargetId("__new__")}
              style={
                newDuePreset === "custom"
                  ? { borderColor: optAccent, backgroundColor: "rgba(56,130,246,0.16)" }
                  : undefined
              }
              className={`h-6 px-2.5 rounded-full border border-dashed text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                newDuePreset === "custom"
                  ? "text-[#8db8ff]"
                  : "border-[#34343c] text-zinc-300 hover:bg-white/5"
              }`}
            >
              <CalendarIcon size={10} />
              <span>
                {newDuePreset === "custom" && customNewDueAt
                  ? new Date(customNewDueAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : t("todo_pick_time")}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Scrollable Task List */}
      <div className="flex-1 min-h-0 overflow-y-auto todo-scroll flex flex-col gap-1.5 pr-0.5 pb-3">
        {pendingItems.length === 0 && completedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-2 text-zinc-400">
            <span className="text-[12.5px] font-medium text-zinc-300">{t("todo_empty")}</span>
            <span className="text-[11px] text-zinc-500 mt-0.5">{t("todo_empty_sub")}</span>
          </div>
        ) : pendingItems.length === 0 && completedItems.length > 0 ? (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[#101015] border border-[#1e1e25]">
            <div className="w-8 h-8 rounded-full bg-[#34c3a0]/15 border border-[#34c3a0]/40 text-[#5eead4] flex items-center justify-center shrink-0">
              <Check size={16} strokeWidth={2.6} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-semibold text-white">
                {t("todo_all_done_title")}
              </span>
              <span className="text-[11px] text-zinc-400 truncate">{t("todo_all_done_sub")}</span>
            </div>
          </div>
        ) : (
          pendingItems.map((task) => {
            const dueInfo = task.dueAt ? formatDueBadge(task.dueAt) : null;

            return (
              <div
                key={task.id}
                className="group h-[38px] min-h-[38px] rounded-xl px-2.5 flex items-center gap-2.5 bg-[#121217]/90 hover:bg-[#18181f] border border-white/[0.04] transition-colors shrink-0"
              >
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => {
                    playTaskCompleteSound();
                    onToggleItem(task.id);
                  }}
                  className="w-[18px] h-[18px] rounded-full border-[1.5px] border-zinc-500 hover:border-[#3882F6] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                />

                {/* Title or Inline Edit */}
                {editingId === task.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSaveInlineEdit(task.id);
                    }}
                    className="flex-1 flex items-center gap-1.5 min-w-0"
                  >
                    <input
                      type="text"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => handleSaveInlineEdit(task.id)}
                      autoFocus
                      className="flex-1 bg-transparent text-[13px] font-medium text-white outline-none border-b border-[#3882F6]"
                    />
                  </form>
                ) : (
                  <div
                    onDoubleClick={() => {
                      setEditingId(task.id);
                      setEditingText(task.text);
                    }}
                    className="flex-1 text-[13px] font-medium text-white truncate min-w-0"
                  >
                    {task.text}
                  </div>
                )}

                {/* Hover Action Buttons: Timer (Pomodoro), Reminder/Calendar, Snooze +1h, Edit, Delete */}
                <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                  {onStartPomodoroForTask && (
                    <button
                      type="button"
                      onClick={() => onStartPomodoroForTask(task)}
                      title={t("todo_start_focus")}
                      className="w-6 h-6 rounded-lg bg-[#23232a] hover:bg-[#ff8a7a]/20 text-zinc-300 hover:text-[#ff9b8f] flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Timer size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCalendarTargetId(task.id)}
                    title={t("todo_set_reminder")}
                    className="w-6 h-6 rounded-lg bg-[#23232a] hover:bg-[#3882F6]/20 text-zinc-300 hover:text-[#8db8ff] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Bell size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSnoozeOneHour(task)}
                    title={t("todo_snooze_1h")}
                    className="w-6 h-6 rounded-lg bg-[#23232a] hover:bg-white/15 text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Clock size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(task.id);
                      setEditingText(task.text);
                    }}
                    title={t("todo_edit_tip")}
                    className="w-6 h-6 rounded-lg bg-[#23232a] hover:bg-white/15 text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteItem(task.id)}
                    title={t("todo_delete_tip")}
                    className="w-6 h-6 rounded-lg bg-[#23232a] hover:bg-[#ff6b5a]/20 text-[#ff9b8f] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Deadline & Overdue Badges */}
                {dueInfo && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {dueInfo.badgeText && (
                      <button
                        type="button"
                        onClick={() => setCalendarTargetId(task.id)}
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-lg tabular-nums cursor-pointer ${
                          dueInfo.status === "overdue" || dueInfo.status === "urgent"
                            ? "text-[#ff9b8f] bg-[#ff6b5a]/15"
                            : dueInfo.status === "soon"
                            ? "text-amber-300 bg-amber-400/15"
                            : "text-zinc-300 bg-white/10"
                        }`}
                      >
                        {dueInfo.badgeText}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setCalendarTargetId(task.id)}
                      className="text-[11.5px] text-zinc-400 hover:text-zinc-200 tabular-nums w-9 text-right cursor-pointer"
                    >
                      {dueInfo.timeLabel}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Collapsible Completed Section */}
        {completedItems.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              className="h-6 self-start px-1.5 text-[11.5px] font-medium text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 cursor-pointer"
            >
              {showCompleted ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>
                {t("todo_completed")} ({completedItems.length})
              </span>
            </button>

            {showCompleted &&
              completedItems.map((task) => (
                <div
                  key={task.id}
                  className="group h-8 rounded-xl px-2.5 flex items-center gap-2.5 bg-white/[0.02] text-zinc-500 shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => onToggleItem(task.id)}
                    style={{ backgroundColor: optAccent }}
                    className="w-[17px] h-[17px] rounded-full text-white flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <Check size={10} strokeWidth={3} />
                  </button>
                  <span className="flex-1 text-[12.5px] line-through truncate min-w-0">
                    {task.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteItem(task.id)}
                    className="w-6 h-6 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/10 text-zinc-400 hover:text-[#ff9b8f] flex items-center justify-center cursor-pointer transition-opacity"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
});
