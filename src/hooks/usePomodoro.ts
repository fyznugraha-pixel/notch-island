import { useState, useEffect, useRef, useCallback } from "react";
import {
  PomodoroMode,
  PomodoroSettings,
  PomodoroDailyStats,
  loadPomodoroSettings,
  savePomodoroSettings,
  loadPomodoroDailyStats,
  recordPomodoroSession,
  getModeDurationSeconds,
} from "../services/pomodoroService";
import { playPomodoroAlertSound } from "../services/soundService";

export interface PomodoroCompleteAlert {
  finishedMode: PomodoroMode;
  nextMode: PomodoroMode;
  nextDurationMin: number;
  cycleSession: number;
  sessionsPerCycle: number;
  focusedTaskId: string | null;
}

export function usePomodoro() {
  const [settings, setSettings] = useState<PomodoroSettings>(() => loadPomodoroSettings());
  const [dailyStats, setDailyStats] = useState<PomodoroDailyStats>(() => loadPomodoroDailyStats());
  const [mode, setMode] = useState<PomodoroMode>("focus");
  const [remainingSec, setRemainingSec] = useState<number>(() =>
    getModeDurationSeconds("focus", loadPomodoroSettings())
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [cycleSession, setCycleSession] = useState<number>(1);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [completeAlert, setCompleteAlert] = useState<PomodoroCompleteAlert | null>(null);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const cycleRef = useRef(cycleSession);
  useEffect(() => {
    cycleRef.current = cycleSession;
  }, [cycleSession]);

  const focusedTaskRef = useRef(focusedTaskId);
  useEffect(() => {
    focusedTaskRef.current = focusedTaskId;
  }, [focusedTaskId]);

  // Deadline-anchored countdown: immune to WebView2 timer throttling when the
  // window is hidden/background. remainingSec is always derived from wall clock,
  // never from "ticks so far".
  const deadlineRef = useRef<number | null>(null); // epoch ms when the current phase ends
  const sessionStartRef = useRef<number | null>(null); // epoch ms when this phase started
  const completionFiredRef = useRef(false);

  const totalSec = getModeDurationSeconds(mode, settings);
  const hasStartedSession = remainingSec < totalSec || isRunning;

  const advanceToNextMode = useCallback(
    (fromMode: PomodoroMode, autoStart: boolean) => {
      const cfg = settingsRef.current;
      let nextMode: PomodoroMode = "focus";
      let nextCycle = cycleRef.current;

      if (fromMode === "focus") {
        if (cycleRef.current >= cfg.sessionsPerCycle) {
          nextMode = "long_break";
        } else {
          nextMode = "short_break";
        }
      } else {
        nextMode = "focus";
        if (fromMode === "long_break" || cycleRef.current >= cfg.sessionsPerCycle) {
          nextCycle = 1;
        } else {
          nextCycle = cycleRef.current + 1;
        }
      }

      setCycleSession(nextCycle);
      setMode(nextMode);
      const nextTotal = getModeDurationSeconds(nextMode, cfg);
      setRemainingSec(nextTotal);
      if (autoStart) {
        sessionStartRef.current = Date.now();
        deadlineRef.current = Date.now() + nextTotal * 1000;
        completionFiredRef.current = false;
      } else {
        sessionStartRef.current = null;
        deadlineRef.current = null;
      }
      setIsRunning(autoStart);
    },
    []
  );

  // Handle phase completion OUTSIDE the state updater (updaters may run twice in
  // StrictMode; persistence writes and sounds must fire exactly once).
  const handlePhaseComplete = useCallback(() => {
    if (completionFiredRef.current) return;
    completionFiredRef.current = true;

    const currentCfg = settingsRef.current;
    const finished = modeRef.current;

    if (currentCfg.soundOnComplete) {
      playPomodoroAlertSound();
    }

    if (finished === "focus") {
      const updatedStats = recordPomodoroSession(currentCfg.focusMinutes);
      setDailyStats(updatedStats);
    }

    const nextMode: PomodoroMode =
      finished === "focus"
        ? cycleRef.current >= currentCfg.sessionsPerCycle
          ? "long_break"
          : "short_break"
        : "focus";

    const nextDurationMin =
      nextMode === "focus"
        ? currentCfg.focusMinutes
        : nextMode === "short_break"
        ? currentCfg.shortBreakMinutes
        : currentCfg.longBreakMinutes;

    setCompleteAlert({
      finishedMode: finished,
      nextMode,
      nextDurationMin,
      cycleSession: cycleRef.current,
      sessionsPerCycle: currentCfg.sessionsPerCycle,
      focusedTaskId: focusedTaskRef.current,
    });

    if (currentCfg.autoStartNext) {
      advanceToNextMode(finished, true);
    } else {
      setIsRunning(false);
      deadlineRef.current = null;
      sessionStartRef.current = null;
    }
  }, [advanceToNextMode]);

  useEffect(() => {
    if (!isRunning) return;

    // Establish a wall-clock deadline when one is missing (e.g. toggled on via
    // handlers that only flip isRunning).
    if (deadlineRef.current == null) {
      setRemainingSec((prev) => {
        const base = prev > 0 ? prev : getModeDurationSeconds(modeRef.current, settingsRef.current);
        deadlineRef.current = Date.now() + base * 1000;
        if (sessionStartRef.current == null) sessionStartRef.current = Date.now();
        completionFiredRef.current = false;
        return base;
      });
    }

    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline == null) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSec(remaining);
      if (remaining <= 0) {
        handlePhaseComplete();
      }
    };

    tick();
    const interval = window.setInterval(tick, 500);
    // Fire immediately when the window becomes visible again after throttling.
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isRunning, handlePhaseComplete]);

  const handleSelectMode = useCallback(
    (nextMode: PomodoroMode) => {
      setIsRunning(false);
      setCompleteAlert(null);
      setMode(nextMode);
      setRemainingSec(getModeDurationSeconds(nextMode, settingsRef.current));
      sessionStartRef.current = null;
      deadlineRef.current = null;
    },
    []
  );

  const handleToggleRunning = useCallback(() => {
    setCompleteAlert(null);
    if (isRunning) {
      // pausing: keep remaining as-is; clear the deadline so resuming re-anchors it
      deadlineRef.current = null;
      sessionStartRef.current = null;
      setIsRunning(false);
      return;
    }
    setRemainingSec((prev) => {
      const base = prev > 0 ? prev : getModeDurationSeconds(modeRef.current, settingsRef.current);
      sessionStartRef.current = Date.now();
      deadlineRef.current = Date.now() + base * 1000;
      completionFiredRef.current = false;
      return base;
    });
    setIsRunning(true);
  }, [isRunning]);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    setCompleteAlert(null);
    setRemainingSec(getModeDurationSeconds(modeRef.current, settingsRef.current));
    sessionStartRef.current = null;
    deadlineRef.current = null;
  }, []);

  const handleSkip = useCallback(() => {
    setCompleteAlert(null);
    advanceToNextMode(modeRef.current, false);
  }, [advanceToNextMode]);

  const handleUpdateSettings = useCallback((next: PomodoroSettings) => {
    setSettings(next);
    savePomodoroSettings(next);
    setIsRunning((running) => {
      if (!running) {
        setRemainingSec(getModeDurationSeconds(modeRef.current, next));
      }
      return running;
    });
  }, []);

  const startFocusOnTask = useCallback((taskId: string) => {
    setFocusedTaskId(taskId);
    setCompleteAlert(null);
    setMode("focus");
    const total = getModeDurationSeconds("focus", settingsRef.current);
    setRemainingSec(total);
    sessionStartRef.current = Date.now();
    deadlineRef.current = Date.now() + total * 1000;
    completionFiredRef.current = false;
    setIsRunning(true);
  }, []);

  const acceptCompleteAlert = useCallback(() => {
    if (!completeAlert) return;
    const finished = completeAlert.finishedMode;
    setCompleteAlert(null);
    advanceToNextMode(finished, true);
  }, [completeAlert, advanceToNextMode]);

  const skipCompleteAlert = useCallback(() => {
    if (!completeAlert) return;
    const finished = completeAlert.finishedMode;
    setCompleteAlert(null);
    if (finished === "focus") {
      // Skip break and go straight to next focus session
      const cfg = settingsRef.current;
      const nextCycle = cycleRef.current >= cfg.sessionsPerCycle ? 1 : cycleRef.current + 1;
      setCycleSession(nextCycle);
      setMode("focus");
      setRemainingSec(getModeDurationSeconds("focus", cfg));
      setIsRunning(false);
      sessionStartRef.current = null;
      deadlineRef.current = null;
    } else {
      advanceToNextMode(finished, false);
    }
  }, [completeAlert, advanceToNextMode]);

  const dismissCompleteAlert = useCallback(() => {
    if (!completeAlert) return;
    const finished = completeAlert.finishedMode;
    setCompleteAlert(null);
    if (!isRunning) {
      advanceToNextMode(finished, false);
    }
  }, [completeAlert, isRunning, advanceToNextMode]);

  return {
    mode,
    remainingSec,
    totalSec,
    isRunning,
    hasStartedSession,
    cycleSession,
    settings,
    dailyStats,
    focusedTaskId,
    completeAlert,
    setFocusedTaskId,
    handleSelectMode,
    handleToggleRunning,
    handleReset,
    handleSkip,
    handleUpdateSettings,
    startFocusOnTask,
    acceptCompleteAlert,
    skipCompleteAlert,
    dismissCompleteAlert,
  };
}
