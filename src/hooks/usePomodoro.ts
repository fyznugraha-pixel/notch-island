import { useState, useEffect, useRef, useCallback } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  PomodoroMode,
  PomodoroSettings,
  PomodoroDailyStats,
  loadPomodoroSettings,
  savePomodoroSettings,
  loadPomodoroDailyStats,
  recordPomodoroSession,
  getModeDurationSeconds,
  normalizePomodoroMode,
} from "../services/pomodoroService";
import { playPomodoroAlertSound } from "../services/soundService";
import { emitCrossWindowEvent, listenCrossWindowEvent } from "../utils/crossWindowSync";

export interface PomodoroCompleteAlert {
  finishedMode: PomodoroMode;
  nextMode: PomodoroMode;
  nextDurationMin: number;
  cycleSession: number;
  sessionsPerCycle: number;
  focusedTaskId: string | null;
}

interface MigratedLegacyPomodoro {
  mode: PomodoroMode;
  remainingSec: number;
  isRunning: boolean;
  cycleSession: number;
}

function migrateLegacyNavbarPomodoroState(): MigratedLegacyPomodoro | null {
  if (typeof window === "undefined") return null;
  try {
    const legacyRaw = localStorage.getItem("gili_pomodoro_live_state_v2");
    if (!legacyRaw) return null;
    let migrated: MigratedLegacyPomodoro | null = null;
    if (!localStorage.getItem("gili_pomodoro_live_state")) {
      const p = JSON.parse(legacyRaw);
      if (p && typeof p.secondsLeft === "number") {
        const mappedMode: PomodoroMode = p.mode === "break" ? "short_break" : "focus";
        let remainingSec = Math.max(0, Math.round(p.secondsLeft));
        let isRunning = Boolean(p.isRunning);
        if (isRunning && typeof p.endAtMs === "number") {
          remainingSec = Math.max(0, Math.ceil((p.endAtMs - Date.now()) / 1000));
          if (remainingSec === 0) isRunning = false;
        }
        const cfg = loadPomodoroSettings();
        const payload = {
          mode: mappedMode,
          remainingSec,
          totalSec:
            typeof p.totalSeconds === "number" && p.totalSeconds > 0
              ? p.totalSeconds
              : getModeDurationSeconds(mappedMode, cfg),
          isRunning,
          cycleSession: typeof p.cycle === "number" && p.cycle > 0 ? p.cycle : 1,
          sessionsPerCycle: cfg.sessionsPerCycle || 4,
        };
        localStorage.setItem("gili_pomodoro_live_state", JSON.stringify(payload));
        migrated = {
          mode: mappedMode,
          remainingSec,
          isRunning: isRunning && remainingSec > 0,
          cycleSession: payload.cycleSession,
        };
      }
    }
    localStorage.removeItem("gili_pomodoro_live_state_v2");
    return migrated;
  } catch {
    return null;
  }
}

export function usePomodoro(options: { isSecondary?: boolean } = {}) {
  const initialMigratedRef = useRef<MigratedLegacyPomodoro | null | undefined>(undefined);
  if (initialMigratedRef.current === undefined) {
    initialMigratedRef.current = migrateLegacyNavbarPomodoroState();
  }
  const initialMigrated = initialMigratedRef.current;

  const [settings, setSettings] = useState<PomodoroSettings>(() => loadPomodoroSettings());
  const [dailyStats, setDailyStats] = useState<PomodoroDailyStats>(() => loadPomodoroDailyStats());
  const [mode, setMode] = useState<PomodoroMode>(() => initialMigrated?.mode ?? "focus");
  const [remainingSec, setRemainingSec] = useState<number>(() =>
    initialMigrated ? initialMigrated.remainingSec : getModeDurationSeconds("focus", loadPomodoroSettings())
  );
  const [isRunning, setIsRunning] = useState<boolean>(() => initialMigrated?.isRunning ?? false);
  const [cycleSession, setCycleSession] = useState<number>(() => initialMigrated?.cycleSession ?? 1);
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

  const remainingSecRef = useRef(remainingSec);
  useEffect(() => {
    remainingSecRef.current = remainingSec;
  }, [remainingSec]);

  const isRunningRef = useRef(isRunning);
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

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

      cycleRef.current = nextCycle;
      setCycleSession(nextCycle);
      modeRef.current = nextMode;
      setMode(nextMode);
      const nextTotal = getModeDurationSeconds(nextMode, cfg);
      remainingSecRef.current = nextTotal;
      setRemainingSec(nextTotal);
      if (autoStart) {
        sessionStartRef.current = Date.now();
        deadlineRef.current = Date.now() + nextTotal * 1000;
        completionFiredRef.current = false;
      } else {
        sessionStartRef.current = null;
        deadlineRef.current = null;
      }
      isRunningRef.current = autoStart;
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

    if (!options.isSecondary && currentCfg.soundOnComplete) {
      playPomodoroAlertSound();
    }

    if (finished === "focus") {
      if (!options.isSecondary) {
        const updatedStats = recordPomodoroSession(currentCfg.focusMinutes);
        setDailyStats(updatedStats);
      } else {
        setDailyStats(loadPomodoroDailyStats());
      }
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
      isRunningRef.current = false;
      setIsRunning(false);
      deadlineRef.current = null;
      sessionStartRef.current = null;
    }
  }, [advanceToNextMode, options.isSecondary]);

  useEffect(() => {
    if (options.isSecondary || !isRunning) return;

    if (deadlineRef.current == null) {
      const base =
        remainingSecRef.current > 0
          ? remainingSecRef.current
          : getModeDurationSeconds(modeRef.current, settingsRef.current);
      remainingSecRef.current = base;
      setRemainingSec(base);
      deadlineRef.current = Date.now() + base * 1000;
      if (sessionStartRef.current == null) sessionStartRef.current = Date.now();
      completionFiredRef.current = false;
    }

    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline == null) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      remainingSecRef.current = remaining;
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
      if (options.isSecondary) {
        const act = `mode:${nextMode}`;
        emit("gili-pomodoro-action", act).catch(() => {});
        emitCrossWindowEvent("gili-pomodoro-action", act);
      }
      isRunningRef.current = false;
      setIsRunning(false);
      setCompleteAlert(null);
      modeRef.current = nextMode;
      setMode(nextMode);
      const nextTotal = getModeDurationSeconds(nextMode, settingsRef.current);
      remainingSecRef.current = nextTotal;
      setRemainingSec(nextTotal);
      sessionStartRef.current = null;
      deadlineRef.current = null;
    },
    [options.isSecondary]
  );

  const handleToggleRunning = useCallback(() => {
    if (options.isSecondary) {
      emit("gili-pomodoro-action", "toggle").catch(() => {});
      emitCrossWindowEvent("gili-pomodoro-action", "toggle");
      return;
    }
    setCompleteAlert(null);
    if (isRunningRef.current) {
      deadlineRef.current = null;
      sessionStartRef.current = null;
      isRunningRef.current = false;
      setIsRunning(false);
      return;
    }
    const base =
      remainingSecRef.current > 0
        ? remainingSecRef.current
        : getModeDurationSeconds(modeRef.current, settingsRef.current);
    remainingSecRef.current = base;
    setRemainingSec(base);
    sessionStartRef.current = Date.now();
    deadlineRef.current = Date.now() + base * 1000;
    completionFiredRef.current = false;
    isRunningRef.current = true;
    setIsRunning(true);
  }, [options.isSecondary]);

  const handleReset = useCallback(() => {
    if (options.isSecondary) {
      emit("gili-pomodoro-action", "reset").catch(() => {});
      emitCrossWindowEvent("gili-pomodoro-action", "reset");
      return;
    }
    isRunningRef.current = false;
    setIsRunning(false);
    setCompleteAlert(null);
    const total = getModeDurationSeconds(modeRef.current, settingsRef.current);
    remainingSecRef.current = total;
    setRemainingSec(total);
    sessionStartRef.current = null;
    deadlineRef.current = null;
  }, [options.isSecondary]);

  const handleSkip = useCallback(() => {
    if (options.isSecondary) {
      emit("gili-pomodoro-action", "skip").catch(() => {});
      emitCrossWindowEvent("gili-pomodoro-action", "skip");
      return;
    }
    setCompleteAlert(null);
    advanceToNextMode(modeRef.current, false);
  }, [advanceToNextMode, options.isSecondary]);

  const handleUpdateSettings = useCallback((next: PomodoroSettings) => {
    settingsRef.current = next;
    setSettings(next);
    savePomodoroSettings(next);
    if (!isRunningRef.current) {
      const nextTotal = getModeDurationSeconds(modeRef.current, next);
      remainingSecRef.current = nextTotal;
      setRemainingSec(nextTotal);
      deadlineRef.current = null;
      sessionStartRef.current = null;
    }
    emitCrossWindowEvent("gili_pomodoro_settings_updated", { fromHook: true });
  }, []);

  const applyRemoteCommand = useCallback(
    (cmd: { action?: string; durationMinutes?: number; mode?: string }) => {
      const action = (cmd.action || "start").toLowerCase();
      const parsedMode = normalizePomodoroMode(cmd.mode);
      const targetMode = parsedMode ?? modeRef.current;

      if (parsedMode) {
        modeRef.current = parsedMode;
        setMode(parsedMode);
      }

      let nextSettings = settingsRef.current;
      const mins =
        typeof cmd.durationMinutes === "number" && Number.isFinite(cmd.durationMinutes) && cmd.durationMinutes > 0
          ? Math.round(cmd.durationMinutes)
          : undefined;
      if (mins) {
        if (targetMode === "short_break") {
          nextSettings = { ...nextSettings, shortBreakMinutes: mins };
        } else if (targetMode === "long_break") {
          nextSettings = { ...nextSettings, longBreakMinutes: mins };
        } else {
          nextSettings = { ...nextSettings, focusMinutes: mins };
        }
        settingsRef.current = nextSettings;
        setSettings(nextSettings);
        savePomodoroSettings(nextSettings);
      }

      if (action === "start") {
        setCompleteAlert(null);
        const shouldResetDuration = Boolean(parsedMode || mins || remainingSecRef.current <= 0);
        const nextTotal = shouldResetDuration
          ? getModeDurationSeconds(targetMode, nextSettings)
          : remainingSecRef.current;
        remainingSecRef.current = nextTotal;
        setRemainingSec(nextTotal);
        sessionStartRef.current = Date.now();
        deadlineRef.current = Date.now() + nextTotal * 1000;
        completionFiredRef.current = false;
        isRunningRef.current = true;
        setIsRunning(true);
      } else if (action === "pause") {
        if (isRunningRef.current) {
          deadlineRef.current = null;
          sessionStartRef.current = null;
          isRunningRef.current = false;
          setIsRunning(false);
        }
      } else if (action === "reset") {
        handleReset();
      } else if (action === "skip") {
        handleSkip();
      }
    },
    [handleReset, handleSkip]
  );

  const startFocusOnTask = useCallback((taskId: string) => {
    setFocusedTaskId(taskId);
    setCompleteAlert(null);
    modeRef.current = "focus";
    setMode("focus");
    const total = getModeDurationSeconds("focus", settingsRef.current);
    remainingSecRef.current = total;
    setRemainingSec(total);
    sessionStartRef.current = Date.now();
    deadlineRef.current = Date.now() + total * 1000;
    completionFiredRef.current = false;
    isRunningRef.current = true;
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
      cycleRef.current = nextCycle;
      setCycleSession(nextCycle);
      modeRef.current = "focus";
      setMode("focus");
      const nextTotal = getModeDurationSeconds("focus", cfg);
      remainingSecRef.current = nextTotal;
      setRemainingSec(nextTotal);
      isRunningRef.current = false;
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

  // Broadcast live state to Navbar Dock and any external modules (primary window only)
  useEffect(() => {
    if (options.isSecondary) return;
    const payload = {
      mode,
      remainingSec,
      totalSec,
      isRunning,
      cycleSession,
      sessionsPerCycle: settings.sessionsPerCycle,
    };
    try {
      localStorage.setItem("gili_pomodoro_live_state", JSON.stringify(payload));
    } catch {}
    emit("gili-pomodoro-sync", payload).catch(() => {});
    emitCrossWindowEvent("gili-pomodoro-sync", payload);
  }, [mode, remainingSec, totalSec, isRunning, cycleSession, settings.sessionsPerCycle, options.isSecondary]);

  const lastChannelActionRef = useRef<{ act: string; source: "tauri" | "cross"; at: number } | null>(null);

  // Remote control listener: actions from Navbar Dock / secondary windows (toggle, reset, skip, mode:<mode>)
  useEffect(() => {
    if (options.isSecondary) return;

    const handleAction = (act: string, source: "tauri" | "cross") => {
      const now = Date.now();
      const prev = lastChannelActionRef.current;
      if (prev && prev.act === act && prev.source !== source && now - prev.at < 100) {
        lastChannelActionRef.current = null;
        return;
      }
      lastChannelActionRef.current = { act, source, at: now };

      if (act === "toggle") {
        handleToggleRunning();
      } else if (act === "reset") {
        handleReset();
      } else if (act === "skip") {
        handleSkip();
      } else if (act.startsWith("mode:")) {
        const m = normalizePomodoroMode(act.slice(5));
        if (m) handleSelectMode(m);
      }
    };

    const unlistenPromise = listen<string>("gili-pomodoro-action", (event) => {
      if (typeof event.payload === "string") {
        handleAction(event.payload, "tauri");
      }
    });
    const unlistenCross = listenCrossWindowEvent<string>("gili-pomodoro-action", (act) => {
      if (typeof act === "string" && act) {
        handleAction(act, "cross");
      }
    });

    return () => {
      unlistenPromise.then((fn) => fn());
      unlistenCross();
    };
  }, [handleToggleRunning, handleReset, handleSkip, handleSelectMode, options.isSecondary]);

  // Sync Pomodoro settings across tabs & windows (e.g. Idle Timer toggle in Settings)
  useEffect(() => {
    return listenCrossWindowEvent("gili_pomodoro_settings_updated", () => {
      const fresh = loadPomodoroSettings();
      settingsRef.current = fresh;
      setSettings(fresh);
      if (!isRunningRef.current) {
        const nextTotal = getModeDurationSeconds(modeRef.current, fresh);
        remainingSecRef.current = nextTotal;
        setRemainingSec(nextTotal);
      }
    });
  }, []);

  // Secondary windows follow live state emitted by primary window
  useEffect(() => {
    if (!options.isSecondary) return;
    migrateLegacyNavbarPomodoroState();

    const applyLivePayload = (payload: any) => {
      if (!payload || typeof payload !== "object") return;
      if (
        payload.mode === "focus" ||
        payload.mode === "short_break" ||
        payload.mode === "long_break"
      ) {
        modeRef.current = payload.mode;
        setMode(payload.mode);
      }
      if (typeof payload.remainingSec === "number" && Number.isFinite(payload.remainingSec)) {
        remainingSecRef.current = payload.remainingSec;
        setRemainingSec(payload.remainingSec);
      }
      if (typeof payload.isRunning === "boolean") {
        isRunningRef.current = payload.isRunning;
        setIsRunning(payload.isRunning);
      }
      if (typeof payload.cycleSession === "number" && Number.isFinite(payload.cycleSession)) {
        cycleRef.current = payload.cycleSession;
        setCycleSession(payload.cycleSession);
      }
      if (
        typeof payload.sessionsPerCycle === "number" &&
        Number.isFinite(payload.sessionsPerCycle) &&
        payload.sessionsPerCycle !== settingsRef.current.sessionsPerCycle
      ) {
        const nextCfg = { ...settingsRef.current, sessionsPerCycle: payload.sessionsPerCycle };
        settingsRef.current = nextCfg;
        setSettings(nextCfg);
      }
    };

    try {
      const cached = localStorage.getItem("gili_pomodoro_live_state");
      if (cached) applyLivePayload(JSON.parse(cached));
    } catch {}

    let disposed = false;
    let unlistenSync: (() => void) | null = null;
    listen<any>("gili-pomodoro-sync", (event) => {
      applyLivePayload(event.payload);
    }).then((fn) => {
      if (disposed) fn();
      else unlistenSync = fn;
    });
    const unlistenCross = listenCrossWindowEvent<any>("gili-pomodoro-sync", (payload) => {
      applyLivePayload(payload);
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === "gili_pomodoro_live_state" && e.newValue) {
        try {
          applyLivePayload(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      disposed = true;
      unlistenSync?.();
      unlistenCross();
      window.removeEventListener("storage", onStorage);
    };
  }, [options.isSecondary]);

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
    applyRemoteCommand,
    startFocusOnTask,
    acceptCompleteAlert,
    skipCompleteAlert,
    dismissCompleteAlert,
  };
}
