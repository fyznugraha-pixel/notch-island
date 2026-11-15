import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, CircularRingSvg, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

interface PomodoroLiveState {
  secondsLeft: number;
  totalSeconds: number;
  isRunning: boolean;
  mode: "work" | "break";
  cycle: number;
  endAtMs: number | null;
}

const POMO_KEY = "gili_pomodoro_live_state_v2";

function loadInitialPomodoro(): PomodoroLiveState {
  try {
    const raw = localStorage.getItem(POMO_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p.secondsLeft === "number") {
        let secs = p.secondsLeft;
        let running = Boolean(p.isRunning);
        if (running && typeof p.endAtMs === "number") {
          const rem = Math.max(0, Math.ceil((p.endAtMs - Date.now()) / 1000));
          secs = rem;
          if (rem === 0) running = false;
        }
        return {
          secondsLeft: secs,
          totalSeconds: p.totalSeconds || (p.mode === "break" ? 300 : 1500),
          isRunning: running,
          mode: p.mode === "break" ? "break" : "work",
          cycle: p.cycle || 1,
          endAtMs: running && p.endAtMs ? p.endAtMs : null,
        };
      }
    }
  } catch {}
  return {
    secondsLeft: 25 * 60,
    totalSeconds: 25 * 60,
    isRunning: false,
    mode: "work",
    cycle: 1,
    endAtMs: null,
  };
}

export const PomodoroNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const [suppressOuterTip, setSuppressOuterTip] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PomodoroLiveState>(loadInitialPomodoro);

  const persist = (next: PomodoroLiveState) => {
    setState(next);
    try {
      localStorage.setItem(POMO_KEY, JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    if (!state.isRunning || !state.endAtMs) return;
    const id = setInterval(() => {
      const rem = Math.max(0, Math.ceil((state.endAtMs! - Date.now()) / 1000));
      if (rem <= 0) {
        const nextMode = state.mode === "work" ? "break" : "work";
        const nextTotal = nextMode === "work" ? 25 * 60 : 5 * 60;
        const nextCycle =
          nextMode === "work" ? (state.cycle % 4) + 1 : state.cycle;
        persist({
          secondsLeft: nextTotal,
          totalSeconds: nextTotal,
          isRunning: false,
          mode: nextMode,
          cycle: nextCycle,
          endAtMs: null,
        });
      } else {
        setState((prev) =>
          prev.secondsLeft === rem ? prev : { ...prev, secondsLeft: rem }
        );
      }
    }, 500);
    return () => clearInterval(id);
  }, [state.isRunning, state.endAtMs, state.mode, state.cycle]);

  const toggleRun = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (state.isRunning) {
      const rem = state.endAtMs
        ? Math.max(1, Math.ceil((state.endAtMs - Date.now()) / 1000))
        : state.secondsLeft;
      persist({ ...state, secondsLeft: rem, isRunning: false, endAtMs: null });
    } else {
      persist({
        ...state,
        isRunning: true,
        endAtMs: Date.now() + state.secondsLeft * 1000,
      });
    }
  };

  const mins = Math.floor(state.secondsLeft / 60);
  const secs = state.secondsLeft % 60;
  const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(
    2,
    "0"
  )}`;
  const progress =
    state.totalSeconds > 0 ? state.secondsLeft / state.totalSeconds : 1;
  const ringColor = state.mode === "work" ? "#ef4444" : "#22c55e";
  const handleToggle = () => setIsOpen((v) => !v);

  const modeStatusLabel =
    state.mode === "work"
      ? tx(lang, `Focus ${state.cycle}/4`, `Fokus ${state.cycle}/4`)
      : tx(lang, "Break", "Istirahat");
  const toggleBtnLabel = state.isRunning
    ? tx(lang, "Pause", "Jeda")
    : tx(lang, "Start", "Mulai");

  return (
    <>
      <Tooltip
        content={`Pomodoro ${timeStr} (${modeStatusLabel})`}
        side={tooltipSide}
        disabled={isOpen || suppressOuterTip}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            `Pomodoro ${timeStr}`,
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `${
                  isVertical ? "w-full max-w-full" : "w-10"
                } h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <CircularRingSvg
            size={22}
            strokeWidth={2.5}
            progress={progress}
            color={ringColor}
          />
          {!isCompact && (
            <>
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[100px]">
                <span className="text-[12px] font-bold text-white tabular-nums truncate">
                  {timeStr}
                </span>
                <span className="text-[10px] text-zinc-400 truncate">
                  {modeStatusLabel}
                </span>
              </div>
              <div
                className="shrink-0 ml-0.5 flex items-center"
                onMouseEnter={() => setSuppressOuterTip(true)}
                onMouseLeave={() => setSuppressOuterTip(false)}
              >
                <Tooltip content={toggleBtnLabel} side={tooltipSide} isLightMode={isLight}>
                  <button
                    type="button"
                    onClick={toggleRun}
                    className={`w-5 h-5 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-200 transition-colors cursor-pointer ${TRIGGER_FOCUS_RING}`}
                  >
                    {state.isRunning ? <Pause size={10} /> : <Play size={10} />}
                  </button>
                </Tooltip>
              </div>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Pomodoro Timer"
        moduleId="pomodoro"
        currentView={view}
        config={config}
        width={256}
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
                  endAtMs: null,
                })
              }
              className={`flex-1 min-w-0 px-2 py-1.5 rounded-[8px] text-[11px] font-semibold truncate cursor-pointer transition-colors ${TRIGGER_FOCUS_RING} ${
                state.mode === "work"
                  ? isLight
                    ? "bg-rose-600/15 text-rose-700 border border-rose-600/35"
                    : "bg-[#ef4444]/20 text-rose-300 border border-[#ef4444]/40"
                  : "bg-white/[0.05] text-zinc-300 hover:text-white"
              }`}
            >
              {tx(lang, "Focus (25m)", "Fokus (25m)")}
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
                  endAtMs: null,
                })
              }
              className={`flex-1 min-w-0 px-2 py-1.5 rounded-[8px] text-[11px] font-semibold truncate cursor-pointer transition-colors ${TRIGGER_FOCUS_RING} ${
                state.mode === "break"
                  ? isLight
                    ? "bg-emerald-600/15 text-emerald-700 border border-emerald-600/35"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-white/[0.05] text-zinc-300 hover:text-white"
              }`}
            >
              {tx(lang, "Break (5m)", "Rehat (5m)")}
            </button>
          </div>

          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={() => toggleRun()}
              className={`flex-1 min-w-0 h-8 rounded-[9px] bg-[#ef4444] hover:bg-[#dc2626] text-[#ffffff] text-[11.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              {state.isRunning ? <Pause size={13} className="shrink-0" /> : <Play size={13} className="shrink-0" />}
              <span>{toggleBtnLabel}</span>
            </button>
            <Tooltip
              content={tx(lang, "Reset timer", "Atur ulang timer")}
              side="top"
              isLightMode={isLight}
            >
              <button
                type="button"
                onClick={() =>
                  persist({
                    ...state,
                    secondsLeft: state.totalSeconds,
                    isRunning: false,
                    endAtMs: null,
                  })
                }
                className={`w-8 h-8 shrink-0 rounded-[9px] bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 flex items-center justify-center transition-colors cursor-pointer ${TRIGGER_FOCUS_RING}`}
              >
                <RotateCcw size={13} />
              </button>
            </Tooltip>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
