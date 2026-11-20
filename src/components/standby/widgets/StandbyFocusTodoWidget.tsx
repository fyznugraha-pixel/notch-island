import React from "react";
import { Check, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { StandbyPalette } from "../standbyTheme";
import { Language } from "../../../services/i18n";
import { formatPomodoroTime, PomodoroMode } from "../../../services/pomodoroService";
import { TodoItem } from "../../../services/todoUtils";

interface StandbyFocusTodoWidgetProps {
  mode: "pomodoro" | "todo";
  palette: StandbyPalette;
  language: Language;
  pomoMode: PomodoroMode;
  remainingSec: number;
  totalSec: number;
  pomoRunning: boolean;
  onTogglePomo: () => void;
  onResetPomo: () => void;
  todos: TodoItem[];
  onToggleTodo: (id: string) => void;
}

export const StandbyFocusTodoWidget: React.FC<StandbyFocusTodoWidgetProps> = ({
  mode,
  palette,
  language,
  pomoMode,
  remainingSec,
  totalSec,
  pomoRunning,
  onTogglePomo,
  onResetPomo,
  todos,
  onToggleTodo,
}) => {
  const isId = language === "id";

  if (mode === "pomodoro") {
    const progress = totalSec > 0 ? Math.max(0, Math.min(1, 1 - remainingSec / totalSec)) : 0;
    const circumference = 2 * Math.PI * 66;
    const strokeOffset = circumference * (1 - progress);
    const modeLabel =
      pomoMode === "focus"
        ? isId
          ? "Sesi Fokus"
          : "Focus"
        : pomoMode === "short_break"
        ? isId
          ? "Istirahat Singkat"
          : "Short Break"
        : isId
        ? "Istirahat Panjang"
        : "Long Break";

    return (
      <div className="flex flex-col items-center justify-between w-full h-full px-3 sm:px-5 py-2 select-none overflow-hidden">
        <div className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.08em] shrink-0" style={{ color: palette.textSecondary }}>
          <Timer size={15} style={{ color: palette.accent }} />
          <span>{modeLabel}</span>
        </div>

        <div
          className="relative flex items-center justify-center aspect-square my-auto shrink-0"
          style={{ width: "clamp(140px, min(22vw, 27vh), 230px)" }}
        >
          <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
            <circle
              cx="80"
              cy="80"
              r="66"
              fill="none"
              stroke={palette.mutedChipBg}
              strokeWidth="8"
            />
            <circle
              cx="80"
              cy="80"
              r="66"
              fill="none"
              stroke={palette.night ? palette.textPrimary : "#ff9f0a"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
            />
          </svg>
          <span
            className="absolute font-bold tabular-nums tracking-tight"
            style={{
              color: palette.textPrimary,
              fontSize: "clamp(26px, min(3vw, 5vh), 44px)",
            }}
          >
            {formatPomodoroTime(remainingSec)}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            aria-label={pomoRunning ? (isId ? "Jeda Pomodoro" : "Pause Pomodoro") : isId ? "Mulai Pomodoro" : "Start Pomodoro"}
            onClick={onTogglePomo}
            className="px-5 py-2 rounded-full text-[14px] font-semibold flex items-center gap-1.5 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
            style={{
              backgroundColor: palette.night ? palette.textPrimary : "#ff9f0a",
              color: "#000000",
            }}
          >
            {pomoRunning ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
            <span>{pomoRunning ? (isId ? "Jeda" : "Pause") : isId ? "Mulai" : "Start"}</span>
          </button>

          <button
            type="button"
            aria-label={isId ? "Reset Pomodoro" : "Reset Pomodoro"}
            onClick={onResetPomo}
            className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
            style={{ backgroundColor: palette.controlBg, color: palette.textPrimary }}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
    );
  }

  const pending = todos.filter((t) => !t.completed).slice(0, 5);
  const doneCount = todos.filter((t) => t.completed).length;

  return (
    <div className="flex flex-col w-full h-full px-3 sm:px-5 py-2 select-none overflow-hidden">
      <div className="flex items-center justify-between gap-2 shrink-0 mb-3">
        <span
          className="text-[12.5px] font-bold uppercase tracking-[0.08em]"
          style={{ color: palette.night ? palette.textPrimary : "#0a84ff" }}
        >
          {isId ? "Daftar Tugas" : "Reminders"}
        </span>
        <span className="text-[13px] font-medium tabular-nums" style={{ color: palette.textSecondary }}>
          {doneCount}/{todos.length}
        </span>
      </div>

      {pending.length === 0 ? (
        <div className="my-auto text-center py-4">
          <p className="text-[18px] font-semibold" style={{ color: palette.textPrimary }}>
            {todos.length === 0
              ? isId
                ? "Belum ada tugas"
                : "No tasks yet"
              : isId
              ? "Semua tugas selesai"
              : "All tasks done"}
          </p>
          <p className="text-[13.5px] mt-1" style={{ color: palette.textSecondary }}>
            {isId ? "Tambahkan tugas dari panel Notch atau Ctrl+Alt+T" : "Add tasks from Notch or Ctrl+Alt+T"}
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2 justify-center">
          {pending.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggleTodo(item.id)}
              className="flex items-center gap-3.5 w-full text-left py-2.5 border-b transition-opacity hover:opacity-100 opacity-90 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff] shrink-0"
              style={{ borderColor: palette.cardBorder }}
            >
              <span
                className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0"
                style={{ borderColor: palette.textSecondary }}
              >
                {item.completed && <Check size={12} />}
              </span>
              <span
                className="font-medium truncate"
                style={{
                  color: palette.textPrimary,
                  fontSize: "clamp(15px, min(1.4vw, 2.4vh), 19px)",
                }}
              >
                {item.text}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
