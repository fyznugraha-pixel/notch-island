import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Volume2,
  VolumeX,
  Volume1,
  Headphones,
  Tv,
  Bluetooth,
  ChevronLeft,
  ChevronRight,
  Settings,
  Music,
  Globe,
  MessageSquare,
  Radio,
} from "lucide-react";

interface AudioEndpoint {
  id: string;
  name: string;
  desc: string;
  is_default: boolean;
  device_type: "speaker" | "headphones" | "bluetooth" | "display" | "other";
}

interface AudioSession {
  pid: number;
  name: string;
  volume: number;
  muted: boolean;
  icon?: string;
}

interface SpatialAudioInfo {
  format_name: string;
  is_enabled: boolean;
  supported: boolean;
}

interface SoundOutputMixerViewProps {
  onClose?: () => void;
}

export const SoundOutputMixerView: React.FC<SoundOutputMixerViewProps> = ({
  onClose,
}) => {
  const [endpoints, setEndpoints] = useState<AudioEndpoint[]>([]);
  const [masterVolume, setMasterVolume] = useState<number>(1.0);
  const [isMasterMuted, setIsMasterMuted] = useState<boolean>(false);
  const [appSessions, setAppSessions] = useState<AudioSession[]>([]);
  const [spatialInfo, setSpatialInfo] = useState<SpatialAudioInfo>({
    format_name: "Windows Sonic untuk Headphone",
    is_enabled: false,
    supported: true,
  });

  const masterSliderRef = useRef<HTMLDivElement>(null);
  const isDraggingMasterRef = useRef<boolean>(false);
  const draggingAppPidRef = useRef<number | null>(null);

  // 1. Initial Load of Audio Data
  const refreshAudioData = useCallback(async () => {
    try {
      const [eps, vol, muted, sessions, spatial] = await Promise.all([
        invoke<AudioEndpoint[]>("get_audio_endpoints"),
        invoke<number>("get_master_volume"),
        invoke<boolean>("get_master_mute"),
        invoke<AudioSession[]>("get_audio_sessions"),
        invoke<SpatialAudioInfo>("get_spatial_audio_status"),
      ]);

      setEndpoints(eps || []);
      setMasterVolume(typeof vol === "number" ? vol : 1.0);
      setIsMasterMuted(!!muted);
      setAppSessions(sessions || []);
      if (spatial) setSpatialInfo(spatial);
    } catch (err) {
      console.error("Failed to fetch audio data:", err);
    }
  }, []);

  useEffect(() => {
    refreshAudioData();

    // Poll sessions every 2.5s for apps that start/stop playing audio
    const pollInterval = window.setInterval(() => {
      invoke<AudioSession[]>("get_audio_sessions")
        .then((sessions) => {
          if (!draggingAppPidRef.current) {
            setAppSessions(sessions || []);
          }
        })
        .catch(() => {});
    }, 2500);

    // Two-way real-time master volume listener from Rust background thread
    const unlistenVol = listen<{ volume: number; muted: boolean }>(
      "master-volume-changed",
      (event) => {
        if (!isDraggingMasterRef.current && event.payload) {
          setMasterVolume(event.payload.volume);
          setIsMasterMuted(event.payload.muted);
        }
      }
    );

    const unlistenAudioDev = listen("audio-connected", () => {
      invoke<AudioEndpoint[]>("get_audio_endpoints")
        .then((eps) => setEndpoints(eps || []))
        .catch(() => {});
    });

    return () => {
      clearInterval(pollInterval);
      unlistenVol.then((fn) => fn());
      unlistenAudioDev.then((fn) => fn());
    };
  }, [refreshAudioData]);

  // 2. Select Default Output Device
  const handleSelectDevice = async (endpointId: string) => {
    try {
      await invoke("set_default_audio_endpoint", { id: endpointId });
      setEndpoints((prev) =>
        prev.map((ep) => ({
          ...ep,
          is_default: ep.id === endpointId,
        }))
      );
    } catch {
      // Fallback already opens ms-settings:sound in Rust backend
    }
  };

  // 3. Master Volume Drag Handler
  const updateMasterFromPointer = (clientX: number) => {
    const el = masterSliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setMasterVolume(ratio);
    if (isMasterMuted && ratio > 0) {
      setIsMasterMuted(false);
    }
    invoke("set_master_volume", { level: ratio }).catch(() => {});
  };

  const handleMasterPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDraggingMasterRef.current = true;
    updateMasterFromPointer(e.clientX);

    const handlePointerMove = (ev: PointerEvent) => {
      if (isDraggingMasterRef.current) {
        updateMasterFromPointer(ev.clientX);
      }
    };

    const handlePointerUp = () => {
      isDraggingMasterRef.current = false;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleToggleMasterMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMute = !isMasterMuted;
    setIsMasterMuted(nextMute);
    invoke("set_master_mute", { mute: nextMute }).catch(() => {});
  };

  // 4. Per-App Volume Drag Handler
  const updateAppVolumeFromPointer = (
    pid: number,
    clientX: number,
    trackEl: HTMLDivElement
  ) => {
    const rect = trackEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setAppSessions((prev) =>
      prev.map((s) => (s.pid === pid ? { ...s, volume: ratio, muted: false } : s))
    );
    invoke("set_app_volume", { pid, volume: ratio }).catch(() => {});
  };

  const handleAppPointerDown = (
    pid: number,
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    draggingAppPidRef.current = pid;
    const trackEl = e.currentTarget;
    updateAppVolumeFromPointer(pid, e.clientX, trackEl);

    const handlePointerMove = (ev: PointerEvent) => {
      if (draggingAppPidRef.current === pid) {
        updateAppVolumeFromPointer(pid, ev.clientX, trackEl);
      }
    };

    const handlePointerUp = () => {
      draggingAppPidRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  // 5. Open Settings URI Fallbacks
  const handleOpenMixerSettings = () => {
    invoke("open_sound_settings", { page: "apps-volume" }).catch(() => {});
  };

  const handleOpenSoundSettings = () => {
    invoke("open_sound_settings", { page: "sound" }).catch(() => {});
  };

  const renderDeviceIcon = (type: AudioEndpoint["device_type"]) => {
    switch (type) {
      case "headphones":
        return <Headphones size={17} strokeWidth={1.6} />;
      case "bluetooth":
        return <Bluetooth size={17} strokeWidth={1.6} />;
      case "display":
        return <Tv size={17} strokeWidth={1.6} />;
      default:
        return <Volume2 size={17} strokeWidth={1.6} />;
    }
  };

  const renderAppIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("spotify") || lower.includes("music")) {
      return <Music size={15} strokeWidth={1.6} />;
    }
    if (lower.includes("chrome") || lower.includes("edge") || lower.includes("firefox")) {
      return <Globe size={15} strokeWidth={1.6} />;
    }
    if (lower.includes("discord") || lower.includes("chat")) {
      return <MessageSquare size={15} strokeWidth={1.6} />;
    }
    return <Radio size={15} strokeWidth={1.6} />;
  };

  const masterVolPercent = isMasterMuted ? 0 : Math.round(masterVolume * 100);

  return (
    <div className="flex flex-col w-full h-full text-[var(--taskbar-text)]">
      {/* Header */}
      <div className="flex items-center gap-3 h-10 shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Kembali"
          className="w-8 h-8 rounded-full gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-white"
        >
          <ChevronLeft size={16} strokeWidth={2.2} />
        </button>
        <span className="flex-1 text-[15px] font-semibold tracking-tight">
          Output suara
        </span>
        <span className="text-[10.5px] font-semibold text-[var(--taskbar-text-muted)] border border-[var(--taskbar-separator)] rounded-[7px] px-2 py-0.5">
          Win + Ctrl + V
        </span>
      </div>

      <div className="flex-1 flex flex-col overflow-y-auto pr-0.5 space-y-3 mt-2">
        {/* Section 1: Output Devices */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between h-7">
            <span className="text-[12px] font-semibold tracking-wide text-[var(--taskbar-text)]">
              Perangkat keluaran
            </span>
          </div>

          <div className="flex flex-col gap-1">
            {endpoints.length === 0 ? (
              <div className="h-12 flex items-center justify-center text-[12px] text-[var(--taskbar-text-muted)]">
                Mencari perangkat audio...
              </div>
            ) : (
              endpoints.map((device) => {
                const isSelected = device.is_default;
                return (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => handleSelectDevice(device.id)}
                    className={`h-[50px] w-full rounded-[13px] border-0 flex items-center gap-3 px-2.5 text-left cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[var(--taskbar-item-selected)] text-white"
                        : "bg-transparent text-[var(--taskbar-text-2)] hover:bg-[var(--taskbar-item-hover)] hover:text-white"
                    }`}
                  >
                    <span className="w-[34px] h-[34px] rounded-[10px] gili-flyout-card flex items-center justify-center shrink-0 text-[var(--taskbar-text-2)]">
                      {renderDeviceIcon(device.device_type)}
                    </span>

                    <span className="flex-1 flex flex-col min-w-0">
                      <span className="text-[13px] font-medium truncate text-white">
                        {device.name}
                      </span>
                      <span className="text-[11px] text-[var(--taskbar-text-muted)] truncate">
                        {device.desc || "Perangkat Audio"}
                      </span>
                    </span>

                    {/* Radio indicator */}
                    <span
                      className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "border-[var(--taskbar-accent)]"
                          : "border-white/30"
                      }`}
                    >
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-[var(--taskbar-accent)]" />
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Section 2: Spatial Audio */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between h-7">
            <span className="text-[12px] font-semibold tracking-wide text-[var(--taskbar-text)]">
              Suara spasial
            </span>
          </div>

          <div className="flex flex-col gap-1">
            {/* Option: Mati */}
            <button
              type="button"
              onClick={handleOpenSoundSettings}
              className={`h-[42px] w-full rounded-[12px] border-0 flex items-center gap-3 px-2.5 text-[13px] font-medium text-left cursor-pointer transition-colors ${
                !spatialInfo.is_enabled
                  ? "bg-[var(--taskbar-item-selected)] text-white"
                  : "bg-transparent text-[var(--taskbar-text-2)] hover:bg-[var(--taskbar-item-hover)] hover:text-white"
              }`}
            >
              <span className="flex-1">Mati</span>
              <span
                className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
                  !spatialInfo.is_enabled
                    ? "border-[var(--taskbar-accent)]"
                    : "border-white/30"
                }`}
              >
                {!spatialInfo.is_enabled && (
                  <span className="w-2 h-2 rounded-full bg-[var(--taskbar-accent)]" />
                )}
              </span>
            </button>

            {/* Option: Windows Sonic */}
            <button
              type="button"
              onClick={handleOpenSoundSettings}
              className={`h-[42px] w-full rounded-[12px] border-0 flex items-center gap-3 px-2.5 text-[13px] font-medium text-left cursor-pointer transition-colors ${
                spatialInfo.is_enabled
                  ? "bg-[var(--taskbar-item-selected)] text-white"
                  : "bg-transparent text-[var(--taskbar-text-2)] hover:bg-[var(--taskbar-item-hover)] hover:text-white"
              }`}
            >
              <span className="flex-1 truncate">
                {spatialInfo.format_name || "Windows Sonic untuk Headphone"}
              </span>
              <span
                className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
                  spatialInfo.is_enabled
                    ? "border-[var(--taskbar-accent)]"
                    : "border-white/30"
                }`}
              >
                {spatialInfo.is_enabled && (
                  <span className="w-2 h-2 rounded-full bg-[var(--taskbar-accent)]" />
                )}
              </span>
            </button>
          </div>
        </div>

        {/* Section 3: Volume Mixer */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between h-7">
            <span className="text-[12px] font-semibold text-[var(--taskbar-text)]">
              Mixer volume
            </span>
            <button
              type="button"
              onClick={handleOpenMixerSettings}
              aria-label="Pengaturan mixer"
              title="Buka pengaturan mixer di Windows"
              className="w-7 h-7 rounded-[9px] gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-white"
            >
              <Settings size={14} strokeWidth={1.8} />
            </button>
          </div>

          {/* Master Volume Slider Row */}
          <div className="flex items-center gap-2.5 h-11 mt-0.5">
            <div
              ref={masterSliderRef}
              onPointerDown={handleMasterPointerDown}
              role="slider"
              aria-label={`Volume Master ${masterVolPercent}%`}
              aria-valuenow={masterVolPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const next = Math.min(1, masterVolume + 0.05);
                  setMasterVolume(next);
                  setIsMasterMuted(false);
                  invoke("set_master_volume", { level: next }).catch(() => {});
                } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                  e.preventDefault();
                  const next = Math.max(0, masterVolume - 0.05);
                  setMasterVolume(next);
                  invoke("set_master_volume", { level: next }).catch(() => {});
                } else if (e.key === "m" || e.key === "M") {
                  handleToggleMasterMute(e as unknown as React.MouseEvent);
                }
              }}
              className="flex-1 h-9 rounded-[12px] bg-[var(--taskbar-slider-track)] overflow-hidden relative cursor-pointer select-none focus:outline-none"
            >
              <div
                style={{ width: `${masterVolPercent}%` }}
                className="h-full bg-[var(--taskbar-slider-fill)] flex items-center pl-3 box-border text-neutral-900 transition-[width] duration-75"
              >
                <button
                  type="button"
                  onClick={handleToggleMasterMute}
                  aria-label={isMasterMuted ? "Bunyikan" : "Bisukan"}
                  className="bg-transparent border-0 p-0 cursor-pointer text-inherit flex items-center justify-center shrink-0"
                >
                  {isMasterMuted || masterVolPercent === 0 ? (
                    <VolumeX size={16} strokeWidth={2.2} />
                  ) : masterVolPercent < 45 ? (
                    <Volume1 size={16} strokeWidth={2.2} />
                  ) : (
                    <Volume2 size={16} strokeWidth={2.2} />
                  )}
                </button>
              </div>
            </div>

            <span className="w-10 text-right text-[12px] font-semibold tabular-nums text-[var(--taskbar-text)]">
              {masterVolPercent}%
            </span>
          </div>

          {/* Per-App Audio Sessions */}
          {appSessions.length > 0 && (
            <div className="border-t border-[var(--taskbar-separator)] mt-1.5 pt-1.5 flex flex-col gap-1">
              {appSessions.map((session) => {
                const appVolPercent = session.muted
                  ? 0
                  : Math.round((session.volume || 0) * 100);

                return (
                  <div
                    key={session.pid}
                    className="flex items-center gap-2.5 h-[42px]"
                  >
                    <span className="w-[30px] h-[30px] rounded-[9px] gili-flyout-card flex items-center justify-center shrink-0 text-[var(--taskbar-text-2)]">
                      {renderAppIcon(session.name)}
                    </span>

                    <span
                      title={session.name}
                      className="w-[68px] text-[12px] text-[var(--taskbar-text-2)] truncate shrink-0"
                    >
                      {session.name.replace(/\.exe$/i, "")}
                    </span>

                    {/* App Volume Slider */}
                    <div
                      onPointerDown={(e) => handleAppPointerDown(session.pid, e)}
                      role="slider"
                      aria-label={`${session.name} ${appVolPercent}%`}
                      aria-valuenow={appVolPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      tabIndex={0}
                      className="flex-1 h-[30px] rounded-[12px] bg-[var(--taskbar-slider-track)] overflow-hidden relative cursor-pointer select-none focus:outline-none"
                    >
                      <div
                        style={{ width: `${appVolPercent}%` }}
                        className="h-full bg-[var(--taskbar-slider-fill)] flex items-center pl-2.5 box-border text-neutral-900 transition-[width] duration-75"
                      >
                        <Volume2 size={15} strokeWidth={2} />
                      </div>
                    </div>

                    <span className="w-[34px] text-right text-[11.5px] tabular-nums text-[var(--taskbar-text-2)]">
                      {appVolPercent}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-2 -mx-3.5 -mb-3.5 border-t border-[var(--taskbar-separator)] h-11 flex items-center px-3.5 shrink-0">
        <button
          type="button"
          onClick={handleOpenMixerSettings}
          className="text-[12px] text-[var(--taskbar-text-2)] hover:text-white flex items-center gap-1.5 bg-transparent border-0 cursor-pointer p-0 transition-colors"
        >
          <span>Pengaturan volume lainnya</span>
          <ChevronRight size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};
