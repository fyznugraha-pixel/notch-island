import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTaskbarLang, tx } from "../../../services/taskbarI18n";
import { Tooltip } from "../../ui/Tooltip";
import { MixerAppIcon } from "../../ui/MixerAppIcon";
import { dedupeAudioSessions, getAudioSessionKey } from "../../../utils/audioSessionUtils";
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
  pids?: number[];
  name: string;
  path?: string | null;
  volume: number;
  muted: boolean;
  icon?: string | null;
}

interface SpatialAudioInfo {
  format_name: string;
  is_enabled: boolean;
  supported: boolean;
}

interface SoundOutputMixerViewProps {
  onClose?: () => void;
  onBack?: () => void;
}

export const SoundOutputMixerView: React.FC<SoundOutputMixerViewProps> = ({
  onClose,
  onBack,
}) => {
  const lang = useTaskbarLang();
  const [endpoints, setEndpoints] = useState<AudioEndpoint[]>([]);
  const [masterVolume, setMasterVolume] = useState<number>(1.0);
  const [isMasterMuted, setIsMasterMuted] = useState<boolean>(false);
  const [appSessions, setAppSessions] = useState<AudioSession[]>([]);
  const [spatialInfo, setSpatialInfo] = useState<SpatialAudioInfo>({
    format_name: "",
    is_enabled: false,
    supported: true,
  });

  const masterSliderRef = useRef<HTMLDivElement>(null);
  const isDraggingMasterRef = useRef<boolean>(false);
  const draggingAppKeyRef = useRef<string | null>(null);

  const aggregatedSessions = useMemo(
    () => dedupeAudioSessions(appSessions),
    [appSessions]
  );

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
          if (!draggingAppKeyRef.current) {
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

  // 4. Per-App Volume & Mute Handlers
  const updateAppVolume = (session: AudioSession, nextVol: number) => {
    const clamped = Math.max(0, Math.min(1, nextVol));
    const groupKey = getAudioSessionKey(session.name);
    setAppSessions((prev) =>
      prev.map((s) =>
        getAudioSessionKey(s.name) === groupKey
          ? { ...s, volume: clamped, muted: clamped > 0 ? false : s.muted }
          : s
      )
    );
    if (session.muted && clamped > 0) {
      invoke("set_app_mute", {
        pid: session.pid,
        mute: false,
        name: session.name,
      }).catch(() => {});
    }
    invoke("set_app_volume", {
      pid: session.pid,
      volume: clamped,
      name: session.name,
    }).catch(() => {});
  };

  const handleToggleAppMute = (session: AudioSession) => {
    const nextMuted = !session.muted;
    const groupKey = getAudioSessionKey(session.name);
    setAppSessions((prev) =>
      prev.map((s) =>
        getAudioSessionKey(s.name) === groupKey ? { ...s, muted: nextMuted } : s
      )
    );
    invoke("set_app_mute", {
      pid: session.pid,
      mute: nextMuted,
      name: session.name,
    }).catch(() => {});
  };

  const handleAppKeyDown = (session: AudioSession, e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      updateAppVolume(session, (session.volume || 0) - 0.05);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      updateAppVolume(session, (session.volume || 0) + 0.05);
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      handleToggleAppMute(session);
    }
  };

  const updateAppVolumeFromPointer = (
    session: AudioSession,
    clientX: number,
    trackEl: HTMLDivElement
  ) => {
    const rect = trackEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    updateAppVolume(session, ratio);
  };

  const handleAppPointerDown = (
    session: AudioSession,
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    const groupKey = getAudioSessionKey(session.name);
    draggingAppKeyRef.current = groupKey;
    const trackEl = e.currentTarget;
    updateAppVolumeFromPointer(session, e.clientX, trackEl);

    const handlePointerMove = (ev: PointerEvent) => {
      if (draggingAppKeyRef.current === groupKey) {
        updateAppVolumeFromPointer(session, ev.clientX, trackEl);
      }
    };

    const handlePointerUp = () => {
      draggingAppKeyRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  // 5. Open Settings URI Fallbacks
  const handleOpenMixerSettings = () => {
    invoke("open_sound_settings", { page: "apps-volume" }).catch(() => {});
    onClose?.();
  };

  const handleOpenSoundSettings = () => {
    invoke("open_sound_settings", { page: "sound" }).catch(() => {});
    onClose?.();
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

  const masterVolPercent = isMasterMuted ? 0 : Math.round(masterVolume * 100);

  return (
    <div className="flex flex-col w-full h-full text-[var(--taskbar-text)]">
      {/* Header */}
      <div className="flex items-center gap-3 h-10 shrink-0">
        <Tooltip content={tx(lang, "Back", "Kembali")} allowFlip>
          <button
            type="button"
            onClick={onBack || onClose}
            aria-label={tx(lang, "Back", "Kembali")}
            className="w-8 h-8 rounded-full gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)]"
          >
            <ChevronLeft size={16} strokeWidth={2.2} />
          </button>
        </Tooltip>
        <span className="flex-1 text-[15px] font-semibold tracking-tight">
          {tx(lang, "Sound output", "Output suara")}
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
              {tx(lang, "Output devices", "Perangkat keluaran")}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            {endpoints.length === 0 ? (
              <div className="h-12 flex items-center justify-center text-[12px] text-[var(--taskbar-text-muted)]">
                {tx(lang, "Looking for audio devices...", "Mencari perangkat audio...")}
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
                        ? "bg-[var(--taskbar-item-selected)] text-[var(--taskbar-text)]"
                        : "bg-transparent text-[var(--taskbar-text-2)] hover:bg-[var(--taskbar-item-hover)] hover:text-[var(--taskbar-text)]"
                    }`}
                  >
                    <span className="w-[34px] h-[34px] rounded-[10px] gili-flyout-card flex items-center justify-center shrink-0 text-[var(--taskbar-text-2)]">
                      {renderDeviceIcon(device.device_type)}
                    </span>

                    <span className="flex-1 flex flex-col min-w-0">
                      <span className="text-[13px] font-medium truncate text-[var(--taskbar-text)]">
                        {device.name}
                      </span>
                      <span className="text-[11px] text-[var(--taskbar-text-muted)] truncate">
                        {device.desc || tx(lang, "Audio Device", "Perangkat Audio")}
                      </span>
                    </span>

                    {/* Radio indicator */}
                    <span
                      className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "border-[var(--taskbar-accent)]"
                          : "border-[var(--taskbar-text-muted)]"
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
              {tx(lang, "Spatial sound", "Suara spasial")}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            {/* Option: Off */}
            <button
              type="button"
              onClick={handleOpenSoundSettings}
              className={`h-[42px] w-full rounded-[12px] border-0 flex items-center gap-3 px-2.5 text-[13px] font-medium text-left cursor-pointer transition-colors ${
                !spatialInfo.is_enabled
                  ? "bg-[var(--taskbar-item-selected)] text-[var(--taskbar-text)]"
                  : "bg-transparent text-[var(--taskbar-text-2)] hover:bg-[var(--taskbar-item-hover)] hover:text-[var(--taskbar-text)]"
              }`}
            >
              <span className="flex-1">{tx(lang, "Off", "Mati")}</span>
              <span
                className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
                  !spatialInfo.is_enabled
                    ? "border-[var(--taskbar-accent)]"
                    : "border-[var(--taskbar-text-muted)]"
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
                  ? "bg-[var(--taskbar-item-selected)] text-[var(--taskbar-text)]"
                  : "bg-transparent text-[var(--taskbar-text-2)] hover:bg-[var(--taskbar-item-hover)] hover:text-[var(--taskbar-text)]"
              }`}
            >
              <span className="flex-1 truncate">
                {spatialInfo.format_name ||
                  tx(lang, "Windows Sonic for Headphones", "Windows Sonic untuk Headphone")}
              </span>
              <span
                className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
                  spatialInfo.is_enabled
                    ? "border-[var(--taskbar-accent)]"
                    : "border-[var(--taskbar-text-muted)]"
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
              {tx(lang, "Volume mixer", "Mixer volume")}
            </span>
            <Tooltip
              content={tx(
                lang,
                "Open Windows mixer settings",
                "Buka pengaturan mixer di Windows"
              )}
              allowFlip
            >
              <button
                type="button"
                onClick={handleOpenMixerSettings}
                aria-label={tx(lang, "Mixer settings", "Pengaturan mixer")}
                className="w-7 h-7 rounded-[9px] gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)]"
              >
                <Settings size={14} strokeWidth={1.8} />
              </button>
            </Tooltip>
          </div>

          {/* Master Volume Slider Row */}
          <div className="flex items-center gap-2.5 h-11 mt-0.5">
            <div
              ref={masterSliderRef}
              onPointerDown={handleMasterPointerDown}
              role="slider"
              aria-label={tx(
                lang,
                `Master volume ${masterVolPercent}%`,
                `Volume Master ${masterVolPercent}%`
              )}
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
              className="flex-1 h-9 rounded-[12px] bg-[var(--taskbar-slider-track)] overflow-hidden relative cursor-pointer select-none border border-[var(--taskbar-card-border)]"
            >
              <div
                style={{ width: `${masterVolPercent}%` }}
                className="h-full bg-[var(--taskbar-slider-fill)] transition-[width] duration-75"
              />
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleToggleMasterMute}
                aria-label={
                  isMasterMuted
                    ? tx(lang, "Unmute", "Bunyikan")
                    : tx(lang, "Mute", "Bisukan")
                }
                className={`bg-transparent border-0 p-0 cursor-pointer absolute inset-y-0 left-3 flex items-center justify-center shrink-0 ${
                  masterVolPercent < 14
                    ? "text-[var(--taskbar-text)]"
                    : "text-[var(--taskbar-accent-text)]"
                }`}
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

            <span className="w-10 text-right text-[12px] font-semibold tabular-nums text-[var(--taskbar-text)]">
              {masterVolPercent}%
            </span>
          </div>

          {/* Per-App Audio Sessions */}
          {aggregatedSessions.length > 0 && (
            <div className="border-t border-[var(--taskbar-separator)] mt-1.5 pt-1.5 flex flex-col gap-1">
              {aggregatedSessions.map((session) => {
                const appVolPercent = session.muted
                  ? 0
                  : Math.round((session.volume || 0) * 100);
                const muteLabel = session.muted
                  ? tx(lang, `Unmute ${session.displayName}`, `Bunyikan ${session.displayName}`)
                  : tx(lang, `Mute ${session.displayName}`, `Bisukan ${session.displayName}`);

                return (
                  <div
                    key={getAudioSessionKey(session.name)}
                    className="flex items-center gap-2.5 h-[42px]"
                  >
                    <Tooltip content={muteLabel} allowFlip wrapperClassName="shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleAppMute(session)}
                        aria-label={muteLabel}
                        className="w-[30px] h-[30px] rounded-[9px] gili-flyout-card flex items-center justify-center shrink-0 overflow-hidden text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] cursor-pointer border-0 p-0 relative"
                      >
                        <MixerAppIcon
                          name={session.name}
                          exePath={session.path}
                          icon={session.icon}
                          size={19}
                          className={`transition-opacity ${session.muted ? "opacity-40" : "opacity-100"}`}
                        />
                      </button>
                    </Tooltip>

                    <Tooltip
                      content={session.displayName}
                      allowFlip
                      wrapperClassName="w-[74px] justify-start shrink-0"
                    >
                      <span className="w-full text-[12px] text-[var(--taskbar-text-2)] truncate block">
                        {session.displayName}
                      </span>
                    </Tooltip>

                    {/* App Volume Slider */}
                    <div
                      onPointerDown={(e) => handleAppPointerDown(session, e)}
                      onKeyDown={(e) => handleAppKeyDown(session, e)}
                      role="slider"
                      aria-label={tx(lang, `${session.displayName} volume`, `Volume ${session.displayName}`)}
                      aria-valuenow={appVolPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      tabIndex={0}
                      className="flex-1 h-[30px] rounded-[12px] bg-[var(--taskbar-slider-track)] overflow-hidden relative cursor-pointer select-none border border-[var(--taskbar-card-border)]"
                    >
                      <div
                        style={{ width: `${appVolPercent}%` }}
                        className="h-full bg-[var(--taskbar-slider-fill)] transition-[width] duration-75"
                      />
                      <span
                        className={`pointer-events-none absolute inset-y-0 left-2.5 flex items-center ${
                          appVolPercent < 14
                            ? "text-[var(--taskbar-text)]"
                            : "text-[var(--taskbar-accent-text)]"
                        }`}
                      >
                        {session.muted || appVolPercent === 0 ? (
                          <VolumeX size={15} strokeWidth={2} />
                        ) : (
                          <Volume2 size={15} strokeWidth={2} />
                        )}
                      </span>
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
          className="text-[12px] text-[var(--taskbar-link)] hover:underline flex items-center gap-1.5 bg-transparent border-0 cursor-pointer p-0 transition-colors"
        >
          <span>{tx(lang, "More volume settings", "Pengaturan volume lainnya")}</span>
          <ChevronRight size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};
