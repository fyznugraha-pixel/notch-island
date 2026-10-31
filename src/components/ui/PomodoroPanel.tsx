import React, { useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  SlidersHorizontal,
  ChevronDown,
  ChevronLeft,
  ListTodo,
  Check,
} from "lucide-react";
import {
  PomodoroMode,
  PomodoroSettings,
  PomodoroDailyStats,
  DEFAULT_POMODORO_SETTINGS,
  formatPomodoroTime,
} from "../../services/pomodoroService";
import { TodoItem } from "./TodoListPanel";
import { t } from "../../services/i18n";

export interface PomodoroPanelProps {
  mode: PomodoroMode;
  remainingSeconds: number;
  totalSeconds: number;
  isRunning: boolean;
  currentCycleSession: number;
  settings: PomodoroSettings;
  dailyStats: PomodoroDailyStats;
  todoItems: TodoItem[];
  focusedTaskId: string | null;
  onSelectMode: (mode: PomodoroMode) => void;
  onToggleRun: () => void;
  onResetSession: () => void;
  onSkipSession: () => void;
  onUpdateSettings: (next: PomodoroSettings) => void;
  onSelectFocusedTask: (taskId: string | null) => void;
}

export const PomodoroPanel: React.FC<PomodoroPanelProps> = ({
  mode,
  remainingSeconds,
  totalSeconds,
  isRunning,
  currentCycleSession,
  settings,
  dailyStats,
  todoItems,
  focusedTaskId,
  onSelectMode,
  onToggleRun,
  onResetSession,
  onSkipSession,
  onUpdateSettings,
  onSelectFocusedTask,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showTaskDropdown, setShowTaskDropdown] = useState(false);

  const pendingTasks = todoItems.filter((item) => !item.completed);
  const focusedTask = pendingTasks.find((item) => item.id === focusedTaskId) || null;

  const modeColor =
    mode === "focus" ? "#ff8a7a" : mode === "short_break" ? "#5eead4" : "#3882F6";

  const modeLabel =
    mode === "focus"
      ? t("pomo_focus")
      : mode === "short_break"
      ? t("pomo_short_break")
      : t("pomo_long_break");

  const progressRatio =
    totalSeconds > 0 ? Math.max(0, Math.min(1, remainingSeconds / totalSeconds)) : 1;
  const elapsedRatio = 1 - progressRatio;

  const ringRadius = 64;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDash = `${(progressRatio * ringCircumference).toFixed(1)} ${ringCircumference.toFixed(
    1
  )}`;

  if (showSettings) {
    const adjustSetting = (
      field: "focusMinutes" | "shortBreakMinutes" | "longBreakMinutes" | "sessionsPerCycle",
      delta: number,
      min: number,
      max: number
    ) => {
      const nextVal = Math.max(min, Math.min(max, settings[field] + delta));
      onUpdateSettings({ ...settings, [field]: nextVal });
    };

    const toggleBehavior = (
      field: "autoStartNext" | "soundOnComplete" | "showIdleTimer" | "muteNotifsOnFocus"
    ) => {
      onUpdateSettings({ ...settings, [field]: !settings[field] });
    };

    return (
      <div className="flex flex-col w-full h-full min-h-0 px-6 pb-1 select-none text-white">
        {/* Settings Header */}
        <div className="flex items-center justify-between gap-2 shrink-0 mb-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="w-6 h-6 rounded-full bg-[#17171c] hover:bg-[#23232a] text-zinc-200 flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <h2 className="text-[13.5px] font-semibold tracking-tight">{t("pomo_settings_title")}</h2>
          </div>

          <button
            type="button"
            onClick={() => onUpdateSettings(DEFAULT_POMODORO_SETTINGS)}
            className="h-6 px-2 rounded-lg text-[10.5px] font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            {t("pomo_reset_default")}
          </button>
        </div>

        {/* Two Columns: Duration & Behavior (Board 18) */}
        <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
          {/* Duration Card */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[9.5px] font-semibold tracking-wider text-zinc-400 pl-1">
              {t("pomo_durations")}
            </span>
            <div className="rounded-2xl bg-[#101015] border border-[#1e1e25] px-3 py-0.5 flex flex-col justify-between flex-1">
              {[
                {
                  label: t("pomo_focus"),
                  field: "focusMinutes" as const,
                  val: `${settings.focusMinutes} ${t("unit_min")}`,
                  step: 5,
                  min: 5,
                  max: 90,
                },
                {
                  label: t("pomo_short_break"),
                  field: "shortBreakMinutes" as const,
                  val: `${settings.shortBreakMinutes} ${t("unit_min")}`,
                  step: 1,
                  min: 1,
                  max: 30,
                },
                {
                  label: t("pomo_long_break"),
                  field: "longBreakMinutes" as const,
                  val: `${settings.longBreakMinutes} ${t("unit_min")}`,
                  step: 5,
                  min: 5,
                  max: 60,
                },
                {
                  label: t("pomo_sessions_per_cycle"),
                  field: "sessionsPerCycle" as const,
                  val: `${settings.sessionsPerCycle} ${t("unit_sessions")}`,
                  step: 1,
                  min: 2,
                  max: 8,
                },
              ].map((row, i, arr) => (
                <React.Fragment key={row.field}>
                  <div className="flex items-center justify-between h-7">
                    <span className="text-[11.5px] font-medium text-zinc-200 truncate pr-2">
                      {row.label}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => adjustSetting(row.field, -row.step, row.min, row.max)}
                        className="w-5 h-5 rounded-full bg-[#1d1d25] hover:bg-[#2a2a35] text-zinc-200 text-[13px] flex items-center justify-center cursor-pointer"
                      >
                        −
                      </button>
                      <span className="w-12 text-center text-[11px] font-semibold tabular-nums">
                        {row.val}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustSetting(row.field, row.step, row.min, row.max)}
                        className="w-5 h-5 rounded-full bg-[#1d1d25] hover:bg-[#2a2a35] text-zinc-200 text-[13px] flex items-center justify-center cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {i < arr.length - 1 && <div className="h-[1px] bg-[#1e1e25]" />}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Behavior Card */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[9.5px] font-semibold tracking-wider text-zinc-400 pl-1">
              {t("pomo_behavior")}
            </span>
            <div className="rounded-2xl bg-[#101015] border border-[#1e1e25] px-3 py-0.5 flex flex-col justify-between flex-1">
              {[
                { label: t("pomo_auto_start"), field: "autoStartNext" as const },
                { label: t("pomo_sound_on_done"), field: "soundOnComplete" as const },
                { label: t("pomo_idle_timer"), field: "showIdleTimer" as const },
                { label: t("pomo_mute_notifs"), field: "muteNotifsOnFocus" as const },
              ].map((row, i, arr) => {
                const checked = settings[row.field];
                return (
                  <React.Fragment key={row.field}>
                    <div className="flex items-center justify-between gap-2 h-7">
                      <span className="text-[11px] font-medium text-zinc-200 leading-tight">
                        {row.label}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        onClick={() => toggleBehavior(row.field)}
                        className={`w-8 h-4.5 rounded-full p-0.5 flex items-center transition-colors shrink-0 cursor-pointer ${
                          checked ? "bg-[#3882F6] justify-end" : "bg-[#2a2a31] justify-start"
                        }`}
                      >
                        <span className="w-3.5 h-3.5 rounded-full bg-white shadow-sm" />
                      </button>
                    </div>
                    {i < arr.length - 1 && <div className="h-[1px] bg-[#1e1e25]" />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-5 w-full h-full min-h-0 px-6 pb-1 select-none text-white">
      {/* Left: Circular Countdown Ring */}
      <div className="relative w-[152px] h-[152px] shrink-0 flex items-center justify-center">
        <svg
          width="152"
          height="152"
          viewBox="0 0 152 152"
          aria-hidden="true"
          className="absolute inset-0"
        >
          <circle cx="76" cy="76" r={ringRadius} fill="none" stroke="#1d1d25" strokeWidth="9" />
          <circle
            cx="76"
            cy="76"
            r={ringRadius}
            fill="none"
            stroke={modeColor}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={ringDash}
            transform="rotate(-90 76 76)"
            className="transition-all duration-300"
          />
        </svg>
        <div className="flex flex-col items-center justify-center z-10">
          <div
            role="timer"
            className="text-[33px] font-semibold tracking-tight tabular-nums leading-none"
          >
            {formatPomodoroTime(remainingSeconds)}
          </div>
          <div
            style={{ color: modeColor }}
            className="text-[11px] font-medium mt-1 tracking-tight"
          >
            {modeLabel}
          </div>
        </div>
      </div>

      {/* Right Column: Mode Tabs, Task Selector, Cycle Progress, Controls */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-2 relative">
        {/* Top Row: Mode Switcher + Settings Button */}
        <div className="flex items-center gap-2">
          <div
            role="tablist"
            className="flex-1 min-w-0 flex gap-0.5 p-0.5 bg-[#121216] rounded-xl border border-white/5"
          >
            {[
              { id: "focus" as const, label: t("pomo_focus") },
              { id: "short_break" as const, label: t("pomo_short_break") },
              { id: "long_break" as const, label: t("pomo_long_break") },
            ].map((tab) => {
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelectMode(tab.id)}
                  className={`flex-1 h-6.5 rounded-[9px] text-[11px] transition-colors cursor-pointer truncate px-1.5 ${
                    active
                      ? "bg-[#2a2a31] text-white font-semibold"
                      : "text-zinc-400 hover:text-zinc-200 font-medium"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowSettings(true)}
            title={t("pomo_settings_title")}
            className="w-7 h-7 rounded-full bg-[#17171c] hover:bg-[#23232a] text-zinc-200 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
          >
            <SlidersHorizontal size={13} />
          </button>
        </div>

        {/* Task Selector (FOKUS PADA) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTaskDropdown((v) => !v)}
            className="w-full h-9.5 rounded-xl border border-[#1e1e25] bg-[#101015] hover:bg-[#15151c] px-2.5 flex items-center gap-2 text-left transition-colors cursor-pointer"
          >
            <span className="w-6 h-6 rounded-full bg-[#1d1d25] text-zinc-300 flex items-center justify-center shrink-0">
              <ListTodo size={13} />
            </span>
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-[9px] font-semibold tracking-wider text-zinc-400 uppercase leading-none">
                {t("pomo_focus_on")}
              </span>
              <span className="text-[11.5px] font-semibold text-white truncate mt-0.5">
                {focusedTask ? focusedTask.text : t("pomo_no_task")}
              </span>
            </span>
            <ChevronDown size={14} className="text-zinc-400 shrink-0" />
          </button>

          {showTaskDropdown && (
            <div className="absolute left-0 right-0 top-10.5 z-30 rounded-xl bg-[#17171d] border border-[#2a2a31] shadow-2xl p-1 max-h-32 overflow-y-auto todo-scroll flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => {
                  onSelectFocusedTask(null);
                  setShowTaskDropdown(false);
                }}
                className={`h-6.5 px-2 rounded-lg text-[11.5px] flex items-center justify-between text-left cursor-pointer ${
                  !focusedTaskId ? "bg-[#23232a] text-white font-semibold" : "text-zinc-300 hover:bg-white/5"
                }`}
              >
                <span className="truncate">{t("pomo_no_task")}</span>
                {!focusedTaskId && <Check size={11.5} className="text-[#3882F6] shrink-0" />}
              </button>
              {pendingTasks.map((task) => {
                const selected = task.id === focusedTaskId;
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => {
                      onSelectFocusedTask(task.id);
                      setShowTaskDropdown(false);
                    }}
                    className={`h-6.5 px-2 rounded-lg text-[11.5px] flex items-center justify-between text-left cursor-pointer ${
                      selected ? "bg-[#23232a] text-white font-semibold" : "text-zinc-300 hover:bg-white/5"
                    }`}
                  >
                    <span className="truncate">{task.text}</span>
                    {selected && <Check size={11.5} className="text-[#3882F6] shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cycle Session Progress Bar */}
        <div>
          <div className="flex gap-1.5">
            {Array.from({ length: settings.sessionsPerCycle }).map((_, idx) => {
              const sessionNum = idx + 1;
              const isPast = sessionNum < currentCycleSession;
              const isCurrent = sessionNum === currentCycleSession;
              const fillPct = isPast
                ? 100
                : isCurrent && mode === "focus"
                ? Math.round(elapsedRatio * 100)
                : 0;

              return (
                <div
                  key={idx}
                  className="flex-1 h-1.5 rounded-full bg-[#2a2a31] overflow-hidden"
                >
                  <div
                    style={{
                      width: `${fillPct}%`,
                      backgroundColor: "#ff8a7a",
                    }}
                    className="h-full rounded-full transition-all duration-300"
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-zinc-400 tabular-nums">
            <span>
              {t("pomo_session_of", {
                curr: currentCycleSession,
                total: settings.sessionsPerCycle,
              })}
            </span>
            <span>
              {t("pomo_today_stats", {
                s: dailyStats.completedSessions,
                m: dailyStats.focusMinutesToday,
              })}
            </span>
          </div>
        </div>

        {/* Transport Controls: Reset / Play-Pause / Skip */}
        <div className="flex items-center justify-center gap-3.5">
          <button
            type="button"
            onClick={onResetSession}
            className="w-8 h-8 rounded-full bg-[#17171c] hover:bg-[#23232a] text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <RotateCcw size={14} />
          </button>

          <button
            type="button"
            onClick={onToggleRun}
            style={{ backgroundColor: modeColor }}
            className="w-10 h-10 rounded-full text-[#0b0b0d] flex items-center justify-center shadow-lg hover:brightness-105 active:scale-95 transition-all cursor-pointer"
          >
            {isRunning ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" className="ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onSkipSession}
            className="w-8 h-8 rounded-full bg-[#17171c] hover:bg-[#23232a] text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <SkipForward size={14} fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
};
