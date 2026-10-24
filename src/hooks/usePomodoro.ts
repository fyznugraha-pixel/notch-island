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
      setRemainingSec(getModeDurationSeconds(nextMode, cfg));
      setIsRunning(autoStart);
    },
    []
  );

  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      setRemainingSec((prev) => {
        if (prev > 1) {
          return prev - 1;
        }

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
          window.setTimeout(() => {
            advanceToNextMode(finished, true);
          }, 50);
        } else {
          setIsRunning(false);
        }

        return 0;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, advanceToNextMode]);

  const handleSelectMode = useCallback(
    (nextMode: PomodoroMode) => {
      setIsRunning(false);
      setCompleteAlert(null);
      setMode(nextMode);
      setRemainingSec(getModeDurationSeconds(nextMode, settingsRef.current));
    },
    []
  );

  const handleToggleRunning = useCallback(() => {
    setCompleteAlert(null);
    setRemainingSec((prev) => {
      if (prev <= 0) {
        return getModeDurationSeconds(modeRef.current, settingsRef.current);
      }
      return prev;
    });
    setIsRunning((prev) => !prev);
  }, []);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    setCompleteAlert(null);
    setRemainingSec(getModeDurationSeconds(modeRef.current, settingsRef.current));
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
    setRemainingSec(getModeDurationSeconds("focus", settingsRef.current));
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
