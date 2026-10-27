import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Check,
  Plus,
  Volume2,
  Headphones,
  Tv,
  Bluetooth,
  Play,
  Speaker,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { playAudioTestSound } from "../../services/soundService";
import { t, getLanguage } from "../../services/i18n";

export interface AudioEndpoint {
  id: string;
  name: string;
  desc: string;
  is_default: boolean;
  device_type: "speaker" | "headphones" | "bluetooth" | "display" | "other";
}

export interface AudioOutputPanelProps {
  onBack: () => void;
  soundLevel: number;
  onSetSoundLevel: (level: number) => void;
}

const slideVariants = {
  enter: { x: 24, opacity: 0 },
  center: {
    x: 0,
    opacity: 1,
    transition: {
      x: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
      opacity: { duration: 0.18, ease: "easeOut" as const },
    },
    transitionEnd: { transform: "none" },
  },
  exit: { x: -24, opacity: 0, transition: { duration: 0.15 } },
};

export const AudioOutputPanel: React.FC<AudioOutputPanelProps> = ({
  onBack,
  soundLevel,
  onSetSoundLevel,
}) => {
  const isEn = getLanguage() === "en";
  const [endpoints, setEndpoints] = useState<AudioEndpoint[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>("");

  const fetchEndpoints = () => {
    invoke<AudioEndpoint[]>("get_audio_endpoints")
      .then((list) => {
        if (Array.isArray(list)) {
          setEndpoints(list);
          const def = list.find((e) => e.is_default);
          if (def) setActiveDeviceId(def.id);
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchEndpoints();
    const interval = setInterval(fetchEndpoints, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectDevice = async (endpoint: AudioEndpoint) => {
    if (endpoint.id === activeDeviceId) return;
    setActiveDeviceId(endpoint.id);
    setEndpoints((prev) =>
      prev.map((e) => ({ ...e, is_default: e.id === endpoint.id }))
    );

    try {
      await invoke("set_default_audio_endpoint", { id: endpoint.id });
      fetchEndpoints();
    } catch (err) {
      console.error("Failed to set default audio endpoint:", err);
      fetchEndpoints();
    }
  };

  const handleAddBluetooth = async () => {
    try {
      await invoke("system_power_action", { action: "bluetooth" });
    } catch {
      try {
        await openUrl("ms-settings:bluetooth");
      } catch {
        window.open("ms-settings:bluetooth");
      }
    }
  };

  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const lastVolInvokeRef = React.useRef(0);
  const pendingVolRef = React.useRef<number | null>(null);
  const volTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const throttledSetMasterVolume = React.useCallback((level: number) => {
    pendingVolRef.current = level;
    const now = Date.now();
    if (now - lastVolInvokeRef.current >= 18) {
      lastVolInvokeRef.current = now;
      if (volTimeoutRef.current) clearTimeout(volTimeoutRef.current);
      invoke("set_master_volume", { level: level / 100.0 }).catch(console.error);
    } else if (!volTimeoutRef.current) {
      volTimeoutRef.current = setTimeout(() => {
        volTimeoutRef.current = null;
        if (pendingVolRef.current !== null) {
          lastVolInvokeRef.current = Date.now();
          invoke("set_master_volume", { level: pendingVolRef.current / 100.0 }).catch(console.error);
        }
      }, 18);
    }
  }, []);

  const handleMasterVolumeChange = (newLevel: number, isFinal = false) => {
    const clamped = Math.max(0, Math.min(100, Math.round(newLevel)));
    onSetSoundLevel(clamped);
    if (isFinal) {
      if (volTimeoutRef.current) clearTimeout(volTimeoutRef.current);
      lastVolInvokeRef.current = Date.now();
      invoke("set_master_volume", { level: clamped / 100.0 }).catch(console.error);
    } else {
      throttledSetMasterVolume(clamped);
    }
  };

  const handleTestSound = () => {
    playAudioTestSound();
  };

  const getDeviceIcon = (type: string) => {
    const size = 18;
    const strokeWidth = 2;
    if (type === "headphones") {
      return <Headphones size={size} strokeWidth={strokeWidth} />;
    }
    if (type === "display") {
      return <Tv size={size} strokeWidth={strokeWidth} />;
    }
    if (type === "bluetooth") {
      return <Bluetooth size={size} strokeWidth={strokeWidth} />;
    }
    return <Speaker size={size} strokeWidth={strokeWidth} />;
  };

  return (
    <motion.div
      key="audio_output_panel"
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      data-no-swipe="true"
      className="absolute inset-0 w-full h-full flex flex-col px-3 pb-3 min-w-0 cursor-default gpu-accelerated select-none overflow-hidden"
    >
      {/* 1. Header Bar */}
      <div
        className="flex items-center justify-between h-[34px] mb-2 px-0.5 shrink-0"
      >
        <button
          type="button"
          onClick={onBack}
          aria-label={t("nav_back") || "Kembali"}
          className="w-[34px] h-[34px] rounded-full bg-[#17171c] hover:bg-white/10 text-[#e4e4e7] border border-white/10 flex items-center justify-center transition-colors cursor-pointer"
        >
          <ChevronLeft size={16} strokeWidth={2.2} />
        </button>

        <h1 className="text-[17px] font-semibold text-white tracking-[-0.01em]">
          {t("audio_output_title") || "Audio Output"}
        </h1>

        <div className="w-[34px] h-[34px]" />
      </div>

      {/* 2. Main Content Layout */}
      <div
        className="flex-1 min-h-0 flex flex-col justify-between gap-3 px-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Device Cards Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pr-0.5">
          <div className="grid grid-cols-3 gap-2">
            {endpoints.map((device) => {
              const isActive = device.id === activeDeviceId || device.is_default;

              return (
                <div
                  key={device.id}
                  role="radio"
                  aria-checked={isActive}
                  tabIndex={0}
                  onClick={() => handleSelectDevice(device)}
                  className={`relative box-border h-[96px] rounded-[18px] p-2.5 px-3 flex flex-col justify-between transition-all cursor-pointer ${
                    isActive
                      ? "border border-[#3882F6] bg-[#3882F6]/15 shadow-[0_2px_12px_rgba(56,130,246,0.25)]"
                      : "border border-[#23232a] bg-[#1c1c1e]/90 hover:bg-white/[0.08]"
                  }`}
                >
                  {/* Active Checkmark Badge */}
                  {isActive && (
                    <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#3882F6] text-white flex items-center justify-center shadow-sm">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}

                  {/* Device Icon Badge */}
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                      isActive ? "bg-[#3882F6] text-white" : "bg-[#1b1b21] text-[#d4d4d8]"
                    }`}
                  >
                    {getDeviceIcon(device.device_type)}
                  </span>

                  {/* Device Name & Status */}
                  <div className="min-w-0 pr-1">
                    <div className="text-[13.5px] font-semibold text-white truncate leading-tight">
                      {device.name}
                    </div>
                    <div className="flex items-center justify-between text-[11px] mt-1 gap-1">
                      <span className="text-[#a1a1aa] truncate flex-1">
                        {device.desc || "Audio Device"}
                      </span>
                      <span
                        className={`font-semibold shrink-0 ${
                          isActive ? "text-[#8DB8FF]" : "text-[#4ADE80]"
                        }`}
                      >
                        {isActive ? "Default" : "Tersambung"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Tambah Bluetooth Button Card */}
            <button
              type="button"
              onClick={handleAddBluetooth}
              className="box-border h-[96px] rounded-[18px] border-[1.5px] border-dashed border-[#34343c] bg-transparent hover:bg-white/[0.04] text-[#a1a1aa] hover:text-white flex flex-col items-center justify-center gap-1.5 text-xs font-medium cursor-pointer transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                <Plus size={16} strokeWidth={2.2} />
              </div>
              <span>{t("audio_add_bluetooth")}</span>
            </button>
          </div>
        </div>

        {/* 3. Bottom Active Device Volume Bar & Sound Test */}
        <div className="shrink-0 box-border rounded-[18px] border border-[#23232a] bg-[#1c1c1e]/95 backdrop-blur-md h-[58px] px-3.5 flex items-center gap-3 shadow-sm">
          <span className="text-[#e4e4e7] shrink-0">
            <Volume2 size={18} />
          </span>

          {/* Interactive Horizontal Slider */}
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              setIsDraggingVolume(true);
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(
                0,
                Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))
              );
              handleMasterVolumeChange(pct, false);
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (isDraggingVolume) {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(
                  0,
                  Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))
                );
                handleMasterVolumeChange(pct, false);
              }
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              setIsDraggingVolume(false);
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(
                0,
                Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))
              );
              handleMasterVolumeChange(pct, true);
              if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              }
            }}
            onPointerCancel={(e) => {
              e.stopPropagation();
              setIsDraggingVolume(false);
              if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              }
            }}
            className="flex-1 relative h-2 rounded-full bg-[#2a2a31] overflow-hidden cursor-pointer touch-none"
          >
            <div
              className={`h-full bg-[#3882F6] pointer-events-none rounded-full ${
                isDraggingVolume ? "" : "transition-[width] duration-150 ease-out"
              }`}
              style={{ width: `${soundLevel}%` }}
            />
          </div>

          <span className="w-9 text-right text-[13px] font-bold font-mono text-white tabular-nums shrink-0">
            {soundLevel}%
          </span>

          <button
            type="button"
            onClick={handleTestSound}
            title={isEn ? "Test audio output sound" : "Uji suara audio output"}
            className="h-[34px] px-3.5 rounded-xl border border-[#2a2a31] bg-white/[0.04] hover:bg-white/[0.12] text-[#e4e4e7] flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors shrink-0"
          >
            <Play size={11} fill="currentColor" strokeWidth={2} />
            <span>{isEn ? "Test sound" : "Tes suara"}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
};
