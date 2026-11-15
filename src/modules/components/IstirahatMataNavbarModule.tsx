import React, { useEffect, useRef, useState } from "react";
import { Eye, Pause, Play, RotateCcw } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import {
  NavbarPopoverShell,
  CircularRingSvg,
  useNavbarIsLightSurface,
} from "./NavbarPopoverShell";
import { getLocalDateKey } from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

const WORK_SECONDS = 20 * 60;
const BREAK_SECONDS = 20;
const EYE_REST_KEY = "gili_eye_rest_v2";

interface EyeRestState {
  mode: "work" | "break";
  secondsLeft: number;
  totalSeconds: number;
  isRunning: boolean;
  endAtMs: number | null;
  completedBreaks: number;
  dateKey: string;
}

function defaultEyeRestState(running = true): EyeRestState {
  const now = Date.now();
  return {
    mode: "work",
    secondsLeft: WORK_SECONDS,
    totalSeconds: WORK_SECONDS,
    isRunning: running,
    endAtMs: running ? now + WORK_SECONDS * 1000 : null,
    completedBreaks: 0,
    dateKey: getLocalDateKey(),
  };
}

function loadInitialEyeRest(): EyeRestState {
  const today = getLocalDateKey();
  try {
    const raw = localStorage.getItem(EYE_REST_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const count = p.dateKey === today && typeof p.completedBreaks === "number"
        ? p.completedBreaks
        : 0;
      const mode: "work" | "break" = p.mode === "break" ? "break" : "work";
      const total = mode === "break" ? BREAK_SECONDS : WORK_SECONDS;
      let secs = typeof p.secondsLeft === "number" ? Math.max(0, Math.min(total, p.secondsLeft)) : total;
      let running = Boolean(p.isRunning);
      let endAtMs: number | null = typeof p.endAtMs === "number" ? p.endAtMs : null;

      if (running && endAtMs) {
        const rem = Math.max(0, Math.ceil((endAtMs - Date.now()) / 1000));
        if (rem <= 0) {
          secs = WORK_SECONDS;
          running = false;
          endAtMs = null;
          return {
            mode: "work",
            secondsLeft: secs,
            totalSeconds: WORK_SECONDS,
            isRunning: false,
            endAtMs: null,
            completedBreaks: count,
            dateKey: today,
          };
        }
        secs = rem;
      }

      return {
        mode,
        secondsLeft: secs,
        totalSeconds: total,
        isRunning: running,
        endAtMs: running ? endAtMs : null,
        completedBreaks: count,
        dateKey: today,
      };
    }
  } catch {}
  return defaultEyeRestState(true);
}

export const IstirahatMataNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const [state, setState] = useState<EyeRestState>(loadInitialEyeRest);

  const persist = (next: EyeRestState) => {
    setState(next);
    try {
      localStorage.setItem(EYE_REST_KEY, JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    if (!state.isRunning || !state.endAtMs) return;
    const id = setInterval(() => {
      const rem = Math.max(0, Math.ceil((state.endAtMs! - Date.now()) / 1000));
      if (rem <= 0) {
        const today = getLocalDateKey();
        const prevCount = state.dateKey === today ? state.completedBreaks : 0;
        if (state.mode === "work") {
          persist({
            mode: "break",
            secondsLeft: BREAK_SECONDS,
            totalSeconds: BREAK_SECONDS,
            isRunning: true,
            endAtMs: Date.now() + BREAK_SECONDS * 1000,
            completedBreaks: prevCount,
            dateKey: today,
          });
        } else {
          persist({
            mode: "work",
            secondsLeft: WORK_SECONDS,
            totalSeconds: WORK_SECONDS,
            isRunning: true,
            endAtMs: Date.now() + WORK_SECONDS * 1000,
            completedBreaks: prevCount + 1,
            dateKey: today,
          });
        }
      } else {
        setState((prev) =>
          prev.secondsLeft === rem ? prev : { ...prev, secondsLeft: rem }
        );
      }
    }, 500);
    return () => clearInterval(id);
  }, [state.isRunning, state.endAtMs, state.mode, state.completedBreaks, state.dateKey]);

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

  const startBreakNow = () => {
    persist({
      ...state,
      mode: "break",
      secondsLeft: BREAK_SECONDS,
      totalSeconds: BREAK_SECONDS,
      isRunning: true,
      endAtMs: Date.now() + BREAK_SECONDS * 1000,
    });
  };

  const resetCycle = () => {
    persist({
      ...state,
      mode: "work",
      secondsLeft: WORK_SECONDS,
      totalSeconds: WORK_SECONDS,
      isRunning: false,
      endAtMs: null,
    });
  };

  const mins = Math.floor(state.secondsLeft / 60);
  const secs = state.secondsLeft % 60;
  const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const progress = state.totalSeconds > 0 ? state.secondsLeft / state.totalSeconds : 1;
  const ringColor = state.mode === "break" ? "#34d399" : "#38bdf8";
  const handleToggle = () => setIsOpen((v) => !v);

  const outerTip =
    state.mode === "break"
      ? tx(
          lang,
          `Look at an object 20ft (6m) away for ${state.secondsLeft}s`,
          `Lihat objek jauh (6m) selama ${state.secondsLeft} detik`
        )
      : tx(
          lang,
          `20-20-20 reminder: ${timeStr} until eye rest`,
          `Pengingat 20-20-20: ${timeStr} menuju istirahat mata`
        );

  return (
    <>
      <Tooltip
        content={outerTip}
        side={tooltipSide}
        disabled={isOpen || suppressOuterTip}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : ""}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            tx(lang, `Eye rest ${timeStr}`, `Istirahat mata ${timeStr}`),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? isVertical
                ? "w-full max-w-full h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] relative"
                : "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] relative"
              : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <CircularRingSvg size={24} strokeWidth={2.5} progress={progress} color={ringColor}>
            <Eye size={10} style={{ color: ringColor }} />
          </CircularRingSvg>
          {!isCompact && (
            <>
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[105px]">
                <span className="text-[12px] font-semibold text-white tabular-nums truncate">
                  {state.mode === "break"
                    ? tx(lang, `Look far ${state.secondsLeft}s`, `Lihat jauh ${state.secondsLeft}d`)
                    : timeStr}
                </span>
                <span className="text-[10px] text-zinc-300 truncate">
                  {state.isRunning
                    ? tx(lang, "20-20-20 active", "20-20-20 aktif")
                    : tx(lang, "Paused", "Dijeda")}
                </span>
              </div>
              <div
                onMouseEnter={() => setSuppressOuterTip(true)}
                onMouseLeave={() => setSuppressOuterTip(false)}
              >
                <Tooltip
                  content={
                    state.isRunning
                      ? tx(lang, "Pause reminder", "Jeda pengingat mata")
                      : tx(lang, "Resume reminder", "Mulai pengingat mata")
                  }
                  side={tooltipSide}
                  isLightMode={isLight}
                >
                  <button
                    type="button"
                    onClick={toggleRun}
                    aria-label={
                      state.isRunning
                        ? tx(lang, "Pause eye reminder", "Jeda pengingat mata")
                        : tx(lang, "Start eye reminder", "Mulai pengingat mata")
                    }
                    className={`w-5 h-5 rounded-full bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-200 cursor-pointer ml-0.5 shrink-0 ${TRIGGER_FOCUS_RING}`}
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
        title={tx(lang, "Eye Rest (20-20-20)", "Istirahat Mata (20-20-20)")}
        moduleId="istirahat_mata"
        currentView={view}
        config={config}
        width={268}
      >
        <div className="flex flex-col items-center gap-2 py-1">
          <div
            className={`text-[26px] font-bold tabular-nums tracking-tight ${
              state.mode === "break" ? "text-emerald-400" : "text-white"
            }`}
          >
            {timeStr}
          </div>
          <p className="text-[10.5px] text-zinc-300 text-center leading-snug">
            {state.mode === "break"
              ? tx(
                  lang,
                  "Look at an object 20 feet (6 meters) away for 20 seconds.",
                  "Alihkan pandangan ke objek sejauh 6 meter selama 20 detik."
                )
              : tx(
                  lang,
                  "Every 20 minutes of screen time, rest your eyes for 20 seconds.",
                  "Tiap 20 menit melihat layar, istirahatkan mata 20 detik."
                )}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleRun}
            className={`flex-1 min-w-0 px-2 py-1.5 rounded-[8px] text-[11.5px] font-semibold text-[#ffffff] flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${TRIGGER_FOCUS_RING}`}
            style={{ backgroundColor: state.mode === "break" ? "#059669" : "#0284c7" }}
          >
            {state.isRunning ? <Pause size={12} className="shrink-0" /> : <Play size={12} className="shrink-0" />}
            <span className="truncate">
              {state.isRunning ? tx(lang, "Pause", "Jeda") : tx(lang, "Resume", "Lanjut")}
            </span>
          </button>
          <button
            type="button"
            onClick={startBreakNow}
            className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-[8px] bg-white/[0.08] hover:bg-white/[0.15] text-[11px] font-semibold text-zinc-100 cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            {tx(lang, "Rest 20s", "Istirahat 20d")}
          </button>
          <Tooltip content={tx(lang, "Reset to 20:00", "Reset ke 20:00")} side="top" isLightMode={isLight}>
            <button
              type="button"
              onClick={resetCycle}
              aria-label={tx(lang, "Reset 20-minute cycle", "Reset siklus 20 menit")}
              className={`w-8 h-8 shrink-0 rounded-[8px] bg-white/[0.07] hover:bg-white/[0.14] flex items-center justify-center text-zinc-200 cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              <RotateCcw size={13} />
            </button>
          </Tooltip>
        </div>

        <div className="text-[10px] text-zinc-400 text-center border-t border-white/[0.08] pt-1.5">
          {tx(lang, "Breaks completed today: ", "Istirahat selesai hari ini: ")}
          <strong className="text-zinc-200">{state.completedBreaks}x</strong>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
