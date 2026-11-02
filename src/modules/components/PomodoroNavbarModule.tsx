import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, CircularRingSvg } from "./NavbarPopoverShell";

interface PomodoroLiveState {
  secondsLeft: number;
  totalSeconds: number;
  isRunning: boolean;
  mode: "work" | "break";
  cycle: number;
}

const POMO_KEY = "gili_pomodoro_live_state";

export const PomodoroNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<PomodoroLiveState>(() => {
    try {
      const raw = localStorage.getItem(POMO_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.secondsLeft === "number") {
          return {
            secondsLeft: p.secondsLeft,
            totalSeconds: p.totalSeconds || (p.mode === "break" ? 300 : 1500),
            isRunning: Boolean(p.isRunning),
            mode: p.mode === "break" ? "break" : "work",
            cycle: p.cycle || 2,
          };
        }
      }
    } catch {}
    return {
      secondsLeft: 17 * 60 + 40,
      totalSeconds: 25 * 60,
      isRunning: false,
      mode: "work",
      cycle: 2,
    };
  });

  const persist = (next: PomodoroLiveState) => {
    setState(next);
    try {
      localStorage.setItem(POMO_KEY, JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    if (!state.isRunning) return;
    const id = setInterval(() => {
      setState((prev) => {
        if (!prev.isRunning) return prev;
        if (prev.secondsLeft <= 1) {
          const nextMode = prev.mode === "work" ? "break" : "work";
          const nextTotal = nextMode === "work" ? 25 * 60 : 5 * 60;
          const nextCycle =
            nextMode === "work" ? (prev.cycle % 4) + 1 : prev.cycle;
          const nextState: PomodoroLiveState = {
            secondsLeft: nextTotal,
            totalSeconds: nextTotal,
            isRunning: false,
            mode: nextMode,
            cycle: nextCycle,
          };
          try {
            localStorage.setItem(POMO_KEY, JSON.stringify(nextState));
          } catch {}
          return nextState;
        }
        const nextState = { ...prev, secondsLeft: prev.secondsLeft - 1 };
        try {
          localStorage.setItem(POMO_KEY, JSON.stringify(nextState));
        } catch {}
        return nextState;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state.isRunning]);

  const mins = Math.floor(state.secondsLeft / 60);
  const secs = state.secondsLeft % 60;
  const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(
    2,
    "0"
  )}`;
  const progress =
    state.totalSeconds > 0 ? state.secondsLeft / state.totalSeconds : 0.7;
  const ringColor = state.mode === "work" ? "#ef4444" : "#22c55e";

  const toggleRun = (e: React.MouseEvent) => {
    e.stopPropagation();
    persist({ ...state, isRunning: !state.isRunning });
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Pomodoro ${timeStr} (${
          state.mode === "work" ? `Fokus ${state.cycle}/4` : "Istirahat"
        })`}
      >
        <CircularRingSvg
          size={22}
          strokeWidth={2.5}
          progress={progress}
          color={ringColor}
        />
        {!isCompact && (
          <>
            <div className="flex flex-col leading-[1.15]">
              <span className="text-[12px] font-bold text-white tabular-nums">
                {timeStr}
              </span>
              <span className="text-[10px] text-zinc-400">
                {state.mode === "work"
                  ? `Fokus ${state.cycle}/4`
                  : "Istirahat"}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleRun}
              className="w-5 h-5 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-200 transition-colors cursor-pointer ml-0.5"
              title={state.isRunning ? "Jeda" : "Mulai"}
            >
              {state.isRunning ? <Pause size={10} /> : <Play size={10} />}
            </button>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Pomodoro Timer"
        moduleId="pomodoro"
        currentView={view}
        config={config}
        width={240}
      >
        <div className="flex flex-col items-center gap-3 py-1">
          <div className="text-[28px] font-bold text-white tabular-nums tracking-tight">
            {timeStr}
          </div>

          <div className="flex items-center gap-1.5 w-full">
            <button
              type="button"
              onClick={() =>
                persist({
                  secondsLeft: 25 * 60,
                  totalSeconds: 25 * 60,
                  isRunning: false,
                  mode: "work",
                  cycle: state.cycle,
                })
              }
              className={`flex-1 py-1.5 rounded-[8px] text-[11px] font-semibold cursor-pointer transition-colors ${
                state.mode === "work"
                  ? "bg-[#ef4444]/20 text-rose-300 border border-[#ef4444]/40"
                  : "bg-white/[0.05] text-zinc-400 hover:text-white"
              }`}
            >
              Fokus (25m)
            </button>
            <button
              type="button"
              onClick={() =>
                persist({
                  secondsLeft: 5 * 60,
                  totalSeconds: 5 * 60,
                  isRunning: false,
                  mode: "break",
                  cycle: state.cycle,
                })
              }
              className={`flex-1 py-1.5 rounded-[8px] text-[11px] font-semibold cursor-pointer transition-colors ${
                state.mode === "break"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-white/[0.05] text-zinc-400 hover:text-white"
              }`}
            >
              Rehat (5m)
            </button>
          </div>

          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={() => persist({ ...state, isRunning: !state.isRunning })}
              className="flex-1 h-8 rounded-[9px] bg-[#ef4444] hover:bg-[#dc2626] text-white text-[11.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {state.isRunning ? <Pause size={13} /> : <Play size={13} />}
              <span>{state.isRunning ? "Jeda" : "Mulai"}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                persist({
                  ...state,
                  secondsLeft: state.totalSeconds,
                  isRunning: false,
                })
              }
              className="w-8 h-8 rounded-[9px] bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
              title="Reset timer"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
