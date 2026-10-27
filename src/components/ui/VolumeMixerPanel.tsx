import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Volume2,
  Globe,
  AppWindow,
  ChevronRight,
  Speaker,
  Headphones,
  Tv,
  Bluetooth,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { AudioOutputPanel, AudioEndpoint } from "./AudioOutputPanel";
import { t, getLanguage } from "../../services/i18n";

export interface AudioSession {
  pid: number;
  name: string;
  volume: number;
  muted: boolean;
  pids?: number[];
}

export interface VolumeMixerPanelProps {
  slideDirection: number;
  soundLevel: number;
  onSetSoundLevel: (level: number) => void;
  audioSessions: AudioSession[];
  onUpdateAudioSessions: React.Dispatch<React.SetStateAction<AudioSession[]>>;
}

const tabVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 16 : dir < 0 ? -16 : 0,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      x: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
      opacity: { duration: 0.18, ease: "easeOut" as const },
    },
    transitionEnd: { transform: "none" },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -16 : dir < 0 ? 16 : 0,
    opacity: 0,
    transition: { duration: 0.12 },
  }),
};

const getAppIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("discord")) {
    return <img src="/logo/discord.webp" alt="Discord" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("spotify")) {
    return <img src="/logo/spotify.png" alt="Spotify" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("apple") || lower.includes("itunes")) {
    return <img src="/logo/apple-music.png" alt="Apple Music" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("netflix")) {
    return <img src="/logo/Netflix_icon.svg.webp" alt="Netflix" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("tiktok")) {
    return <img src="/logo/tiktok.webp" alt="TikTok" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("instagram")) {
    return <img src="/logo/Instagram_icon.png" alt="Instagram" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("threads")) {
    return <img src="/logo/threads.png" alt="Threads" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("vlc")) {
    return <img src="/logo/vlc.png" alt="VLC" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("wmplayer") || lower.includes("zune")) {
    return <img src="/logo/windows-media-player.png" alt="WMP" className="w-4 h-4 object-contain" />;
  }
  if (
    lower.includes("edge") ||
    lower.includes("chrome") ||
    lower.includes("firefox") ||
    lower.includes("brave") ||
    lower.includes("opera") ||
    lower.includes("arc")
  ) {
    return <Globe size={16} className="text-[#0a84ff]" />;
  }
  return <AppWindow size={16} className="text-neutral-300" />;
};

export const VolumeMixerPanel: React.FC<VolumeMixerPanelProps> = ({
  slideDirection,
  soundLevel,
  onSetSoundLevel,
  audioSessions,
  onUpdateAudioSessions,
}) => {
  const isEn = getLanguage() === "en";
  const [activeView, setActiveView] = useState<"mixer" | "output">("mixer");
  const [activeOutputDevice, setActiveOutputDevice] = useState<AudioEndpoint | null>(null);

  // Poll sessions and active audio endpoint
  useEffect(() => {
    const fetchSessionsAndEndpoints = () => {
      invoke<AudioSession[]>("get_audio_sessions")
        .then((sessions) => {
          if (Array.isArray(sessions)) onUpdateAudioSessions(sessions);
        })
        .catch(console.error);

      invoke<AudioEndpoint[]>("get_audio_endpoints")
        .then((list) => {
          if (Array.isArray(list)) {
            const def = list.find((e) => e.is_default);
            if (def) setActiveOutputDevice(def);
          }
        })
        .catch(console.error);
    };

    fetchSessionsAndEndpoints();
    const intervalId = window.setInterval(fetchSessionsAndEndpoints, 2500);
    return () => window.clearInterval(intervalId);
  }, [onUpdateAudioSessions]);

  // Aggregate sessions by case-insensitive name
  const aggregatedSessions = useMemo(() => {
    return audioSessions
      .filter((s) => s.pid > 0 && s.name.trim() !== "")
      .reduce<AudioSession[]>((acc, curr) => {
        const existing = acc.find((s) => s.name.toLowerCase() === curr.name.toLowerCase());
        if (!existing) {
          acc.push({ ...curr, pids: [curr.pid] });
        } else if (existing.pids && !existing.pids.includes(curr.pid)) {
          existing.pids.push(curr.pid);
        }
        return acc;
      }, []);
  }, [audioSessions]);

  const [isDraggingMaster, setIsDraggingMaster] = useState(false);
  const [draggingSessionName, setDraggingSessionName] = useState<string | null>(null);

  const lastMasterVolInvokeRef = React.useRef(0);
  const pendingMasterVolRef = React.useRef<number | null>(null);
  const masterVolTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const throttledSetMasterVolume = React.useCallback((level: number) => {
    pendingMasterVolRef.current = level;
    const now = Date.now();
    if (now - lastMasterVolInvokeRef.current >= 18) {
      lastMasterVolInvokeRef.current = now;
      if (masterVolTimeoutRef.current) clearTimeout(masterVolTimeoutRef.current);
      invoke("set_master_volume", { level: level / 100.0 }).catch(console.error);
    } else if (!masterVolTimeoutRef.current) {
      masterVolTimeoutRef.current = setTimeout(() => {
        masterVolTimeoutRef.current = null;
        if (pendingMasterVolRef.current !== null) {
          lastMasterVolInvokeRef.current = Date.now();
          invoke("set_master_volume", { level: pendingMasterVolRef.current / 100.0 }).catch(console.error);
        }
      }, 18);
    }
  }, []);

  const handleMasterVolumeChange = (newLevel: number, isFinal = false) => {
    const clamped = Math.max(0, Math.min(100, Math.round(newLevel)));
    onSetSoundLevel(clamped);
    if (isFinal) {
      if (masterVolTimeoutRef.current) clearTimeout(masterVolTimeoutRef.current);
      lastMasterVolInvokeRef.current = Date.now();
      invoke("set_master_volume", { level: clamped / 100.0 }).catch(console.error);
    } else {
      throttledSetMasterVolume(clamped);
    }
  };

  const appVolTimeoutRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastAppVolInvokeRef = React.useRef<Record<string, number>>({});
  const pendingAppVolRef = React.useRef<Record<string, number>>({});

  const throttledSetAppVolume = React.useCallback((session: AudioSession, percent: number) => {
    const key = session.name.toLowerCase();
    pendingAppVolRef.current[key] = percent;
    const now = Date.now();
    const lastTime = lastAppVolInvokeRef.current[key] || 0;
    const pids = session.pids && session.pids.length > 0 ? session.pids : [session.pid];
    const v = Math.max(0, Math.min(1, percent / 100.0));

    if (now - lastTime >= 20) {
      lastAppVolInvokeRef.current[key] = now;
      if (appVolTimeoutRef.current[key]) clearTimeout(appVolTimeoutRef.current[key]);
      for (const pid of pids) {
        invoke("set_app_volume", { pid, volume: v, name: session.name }).catch(console.error);
      }
    } else if (!appVolTimeoutRef.current[key]) {
      appVolTimeoutRef.current[key] = setTimeout(() => {
        delete appVolTimeoutRef.current[key];
        const latestPct = pendingAppVolRef.current[key];
        if (latestPct !== undefined) {
          lastAppVolInvokeRef.current[key] = Date.now();
          const finalV = Math.max(0, Math.min(1, latestPct / 100.0));
          for (const pid of pids) {
            invoke("set_app_volume", { pid, volume: finalV, name: session.name }).catch(console.error);
          }
        }
      }, 20);
    }
  }, []);

  const handleAppVolumeChange = (session: AudioSession, percent: number, isFinal = false) => {
    const clampedPct = Math.max(0, Math.min(100, Math.round(percent)));
    const v = clampedPct / 100.0;
    onUpdateAudioSessions((prev) =>
      prev.map((s) => (s.name.toLowerCase() === session.name.toLowerCase() ? { ...s, volume: v } : s))
    );
    const key = session.name.toLowerCase();
    if (isFinal) {
      if (appVolTimeoutRef.current[key]) {
        clearTimeout(appVolTimeoutRef.current[key]);
        delete appVolTimeoutRef.current[key];
      }
      lastAppVolInvokeRef.current[key] = Date.now();
      const pids = session.pids && session.pids.length > 0 ? session.pids : [session.pid];
      for (const pid of pids) {
        invoke("set_app_volume", { pid, volume: v, name: session.name }).catch(console.error);
      }
    } else {
      throttledSetAppVolume(session, clampedPct);
    }
  };

  // If user opened Audio Output view
  if (activeView === "output") {
    return (
      <AudioOutputPanel
        onBack={() => setActiveView("mixer")}
        soundLevel={soundLevel}
        onSetSoundLevel={onSetSoundLevel}
      />
    );
  }

  const getOutputIcon = (type?: string) => {
    if (type === "headphones") return <Headphones size={16} strokeWidth={2.2} />;
    if (type === "display") return <Tv size={16} strokeWidth={2.2} />;
    if (type === "bluetooth") return <Bluetooth size={16} strokeWidth={2.2} />;
    return <Speaker size={16} strokeWidth={2.2} />;
  };

  return (
    <motion.div
      key="volume_mixer_ios"
      custom={slideDirection}
      variants={tabVariants}
      initial="enter"
      animate="center"
      exit="exit"
      data-no-swipe="true"
      className="absolute inset-0 w-full h-full flex flex-col px-3 pb-3 min-w-0 cursor-default gpu-accelerated select-none overflow-hidden"
    >
      {/* Main Split: Left (Vertical Master Capsule) + Right (Output & App List) */}
      <div
        className="flex-1 min-h-0 flex items-stretch gap-4 px-0.5 overflow-hidden"
      >
        {/* Left Column: Vertical iOS Master Volume Capsule */}
        <div
          role="slider"
          aria-label={isEn ? "Master volume" : "Volume master"}
          aria-orientation="vertical"
          aria-valuenow={soundLevel}
          onPointerDown={(e) => {
            e.stopPropagation();
            setIsDraggingMaster(true);
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(
              0,
              Math.min(100, Math.round(((rect.bottom - e.clientY) / rect.height) * 100))
            );
            handleMasterVolumeChange(pct, false);
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (isDraggingMaster) {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(
                0,
                Math.min(100, Math.round(((rect.bottom - e.clientY) / rect.height) * 100))
              );
              handleMasterVolumeChange(pct, false);
            }
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            setIsDraggingMaster(false);
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(
              0,
              Math.min(100, Math.round(((rect.bottom - e.clientY) / rect.height) * 100))
            );
            handleMasterVolumeChange(pct, true);
            if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }
          }}
          onPointerCancel={(e) => {
            e.stopPropagation();
            setIsDraggingMaster(false);
            if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }
          }}
          className="w-[54px] h-full flex-shrink-0 rounded-[18px] bg-[#2c2c2e] overflow-hidden flex flex-col justify-end relative cursor-pointer touch-none shadow-sm"
        >
          {/* Top percentage text */}
          <div className="absolute top-4 left-0 right-0 text-center text-[13.5px] font-bold font-mono text-white tabular-nums z-10 pointer-events-none drop-shadow-sm">
            {soundLevel}%
          </div>

          {/* Bottom white filled portion with speaker icon */}
          <div
            className={`w-full bg-white flex items-end justify-center pb-4 text-[#1c1c1e] pointer-events-none ${
              isDraggingMaster ? "" : "transition-[height] duration-150 ease-out"
            }`}
            style={{ height: `${soundLevel}%` }}
          >
            <span className="relative">
              <Volume2 size={24} strokeWidth={2.4} />
            </span>
          </div>
        </div>

        {/* Right Column: Output Card & Apps Section */}
        <div className="flex-1 min-w-0 flex flex-col gap-2 overflow-hidden">
          {/* 1. Output Section Header & Card */}
          <div className="shrink-0 flex flex-col">
            <div className="flex justify-between items-center text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider px-2 h-[20px]">
              <span>{t("mixer_output") || "Output"}</span>
            </div>

            <button
              type="button"
              onClick={() => setActiveView("output")}
              title={t("audio_select_device") || (getLanguage() === "id" ? "Pilih perangkat audio output" : "Select audio output device")}
              className="bg-[#1c1c1e]/90 hover:bg-white/[0.08] active:scale-[0.99] border border-white/10 rounded-[14px] w-full h-[46px] flex items-center gap-3 px-3 text-white cursor-pointer transition-all shadow-sm text-left"
            >
              <span className="w-[30px] h-[30px] rounded-[8px] bg-[#0a84ff] text-white flex items-center justify-center shrink-0 shadow-sm">
                {getOutputIcon(activeOutputDevice?.device_type)}
              </span>

              <span className="flex-1 truncate text-[14px] font-medium text-white">
                {activeOutputDevice?.name || "Speakers (Realtek Audio)"}
              </span>

              <span className="text-[#8e8e93] shrink-0">
                <ChevronRight size={16} strokeWidth={2.2} />
              </span>
            </button>
          </div>

          {/* 2. Apps Section Header & Scrollable List */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider px-2 h-[20px] shrink-0">
              <span>{t("mixer_apps") || "Aplikasi"}</span>
              <span className="text-white/40 font-mono text-[10.5px]">
                {aggregatedSessions.length}
              </span>
            </div>

            <div className="flex-1 min-h-0 bg-[#1c1c1e]/90 rounded-[14px] border border-white/10 overflow-y-auto no-scrollbar shadow-sm backdrop-blur-md">
              {aggregatedSessions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/40 text-[12px] py-8 font-medium">
                  {t("mixer_empty") || "Tidak ada aplikasi aktif"}
                </div>
              ) : (
                aggregatedSessions.map((session, idx) => {
                  const volPercent = Math.round(session.volume * 100);
                  const isMuted = session.muted || volPercent === 0;

                  return (
                    <div
                      key={`${session.name}-${idx}`}
                      className="relative flex items-center gap-3 h-[52px] px-3.5 border-b border-[#38383a]/40 last:border-b-0"
                    >
                      {/* App Icon Badge */}
                      <span className="w-[34px] h-[34px] rounded-[9px] bg-white/10 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                        {getAppIcon(session.name)}
                      </span>

                      {/* Info & Slider */}
                      <div className="flex-1 min-w-0">
                        {/* Top Line: App Name & Vol */}
                        <div className="flex items-center justify-between text-[13.5px] mb-2 leading-none">
                          <span className="font-medium text-white truncate capitalize pr-2">
                            {session.name.replace(/\.exe$/i, "")}
                          </span>
                          <span
                            className={`text-[11px] font-mono tabular-nums shrink-0 ${
                              isMuted ? "text-[#FF453A] font-semibold" : "text-[#8e8e93]"
                            }`}
                          >
                            {isMuted ? "Bisu" : `${volPercent}%`}
                          </span>
                        </div>

                        {/* Bottom Line: iOS Slider Track & Knob */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setDraggingSessionName(session.name);
                            const rect = e.currentTarget.getBoundingClientRect();
                            const pct = Math.max(
                              0,
                              Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))
                            );
                            handleAppVolumeChange(session, pct, false);
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          }}
                          onPointerMove={(e) => {
                            if (draggingSessionName === session.name) {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const pct = Math.max(
                                0,
                                Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))
                              );
                              handleAppVolumeChange(session, pct, false);
                            }
                          }}
                          onPointerUp={(e) => {
                            e.stopPropagation();
                            setDraggingSessionName(null);
                            const rect = e.currentTarget.getBoundingClientRect();
                            const pct = Math.max(
                              0,
                              Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))
                            );
                            handleAppVolumeChange(session, pct, true);
                            if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
                              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                            }
                          }}
                          onPointerCancel={(e) => {
                            e.stopPropagation();
                            setDraggingSessionName(null);
                            if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
                              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                            }
                          }}
                          className="relative h-[4px] rounded-[2px] bg-[#3a3a3c] cursor-pointer touch-none"
                        >
                          {/* Active Blue Fill */}
                          <div
                            className={`h-[4px] rounded-[2px] bg-[#0a84ff] pointer-events-none ${
                              draggingSessionName === session.name ? "" : "transition-[width] duration-150 ease-out"
                            }`}
                            style={{ width: `${volPercent}%` }}
                          />

                          {/* Circular White Thumb Knob */}
                          <span
                            className={`absolute top-[-9px] w-[22px] h-[22px] -ml-[11px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.4)] pointer-events-none ${
                              draggingSessionName === session.name ? "" : "transition-[left] duration-150 ease-out"
                            }`}
                            style={{ left: `${volPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
