import React, { useState, useEffect, useRef } from "react";
import { Sliders, Headphones, Speaker } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

interface AudioSessionItem {
  pid: number;
  name: string;
  volume: number; // 0..100 or 0..1
  muted?: boolean;
}

interface AudioEndpointItem {
  id: string;
  name: string;
  is_default: boolean;
}

// 21. Mixer suara (Per-application volume mixer)
export const MixerNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<AudioSessionItem[]>([]);
  const [masterVol, setMasterVol] = useState(75);

  const loadAudio = async () => {
    try {
      const m = await invoke<number>("get_master_volume");
      if (typeof m === "number") {
        setMasterVol(m <= 1 ? Math.round(m * 100) : Math.round(m));
      }
    } catch {}
    try {
      const list = await invoke<any[]>("get_audio_sessions");
      if (Array.isArray(list)) {
        setSessions(
          list.map((s) => ({
            pid: s.pid,
            name: s.name || s.display_name || `App ${s.pid}`,
            volume:
              typeof s.volume === "number"
                ? s.volume <= 1
                  ? Math.round(s.volume * 100)
                  : Math.round(s.volume)
                : 80,
          }))
        );
      }
    } catch {}
  };

  useEffect(() => {
    loadAudio();
  }, []);

  const handleMasterChange = async (val: number) => {
    setMasterVol(val);
    try {
      await invoke("set_master_volume", { level: val / 100 });
    } catch {}
  };

  const handleAppVolChange = async (pid: number, val: number) => {
    setSessions((prev) =>
      prev.map((s) => (s.pid === pid ? { ...s, volume: val } : s))
    );
    try {
      await invoke("set_app_volume", { pid, volume: val / 100 });
    } catch {}
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => {
          loadAudio();
          setIsOpen((v) => !v);
        }}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Mixer Suara (${sessions.length || 1} aplikasi aktif)`}
      >
        {isCompact ? (
          <Sliders size={15} className="text-zinc-200" />
        ) : (
          <>
            <div className="flex items-end gap-[3px] h-[16px]">
              <i className="w-[3px] h-[12px] rounded-[1.5px] bg-[#22c55e]" />
              <i className="w-[3px] h-[8px] rounded-[1.5px] bg-[#3882F6]" />
              <i className="w-[3px] h-[15px] rounded-[1.5px] bg-[#a855f7]" />
            </div>
            <div className="flex flex-col leading-[1.15]">
              <span className="text-[11.5px] font-semibold text-white">
                Mixer
              </span>
              <span className="text-[10px] text-zinc-400">
                {sessions.length > 0
                  ? `${sessions.length} aplikasi`
                  : `Master ${masterVol}%`}
              </span>
            </div>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Mixer Suara Aplikasi"
        moduleId="mixer_suara"
        currentView={view}
        config={config}
        width={265}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1 pb-2 border-b border-white/[0.07]">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-300 font-semibold">Volume Utama</span>
              <span className="text-zinc-400 tabular-nums">{masterVol}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={masterVol}
              onChange={(e) => handleMasterChange(Number(e.target.value))}
              className="w-full accent-[#3882F6] h-1.5 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-0.5">
            {sessions.length === 0 ? (
              <div className="text-[11px] text-zinc-500 py-2 text-center">
                Tidak ada aplikasi terpisah yang sedang memutar audio.
              </div>
            ) : (
              sessions.map((s) => (
                <div key={s.pid} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-200 truncate max-w-[175px]">
                      {s.name}
                    </span>
                    <span className="text-zinc-400 tabular-nums">
                      {s.volume}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={s.volume}
                    onChange={(e) =>
                      handleAppVolChange(s.pid, Number(e.target.value))
                    }
                    className="w-full accent-emerald-400 h-1.5 cursor-pointer"
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 20. Output audio (Speaker / Headset / TWS switcher + volume)
export const AudioOutputNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [endpoints, setEndpoints] = useState<AudioEndpointItem[]>([]);
  const [masterVol, setMasterVol] = useState(68);

  const loadEndpoints = async () => {
    try {
      const m = await invoke<number>("get_master_volume");
      if (typeof m === "number") {
        setMasterVol(m <= 1 ? Math.round(m * 100) : Math.round(m));
      }
    } catch {}
    try {
      const list = await invoke<AudioEndpointItem[]>("get_audio_endpoints");
      if (Array.isArray(list) && list.length > 0) {
        setEndpoints(list);
      }
    } catch {}
  };

  useEffect(() => {
    loadEndpoints();
  }, []);

  const currentDevice =
    endpoints.find((e) => e.is_default)?.name || "Speaker / Headset";

  const handleSelectEndpoint = async (id: string) => {
    setEndpoints((prev) =>
      prev.map((e) => ({ ...e, is_default: e.id === id }))
    );
    try {
      await invoke("set_default_audio_endpoint", { deviceId: id });
    } catch {}
  };

  const handleVolChange = async (val: number) => {
    setMasterVol(val);
    try {
      await invoke("set_master_volume", { level: val / 100 });
    } catch {}
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => {
          loadEndpoints();
          setIsOpen((v) => !v);
        }}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Output Audio: ${currentDevice} (${masterVol}%)`}
      >
        <Headphones size={15} className="text-[#60a5fa] shrink-0" />
        {!isCompact && (
          <div className="flex flex-col leading-[1.15] min-w-0">
            <span className="text-[11.5px] font-semibold text-white truncate max-w-[110px]">
              {currentDevice}
            </span>
            <span className="text-[10px] text-zinc-400 tabular-nums">
              Vol {masterVol}%
            </span>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Output Audio"
        moduleId="output_audio"
        currentView={view}
        config={config}
        width={260}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-400">Volume Output</span>
              <span className="font-bold text-white tabular-nums">
                {masterVol}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={masterVol}
              onChange={(e) => handleVolChange(Number(e.target.value))}
              className="w-full accent-[#3882F6] h-1.5 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto">
            {endpoints.length === 0 ? (
              <div className="text-[11px] text-zinc-400 py-1">
                Perangkat aktif: {currentDevice}
              </div>
            ) : (
              endpoints.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => handleSelectEndpoint(ep.id)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-[11.5px] text-left transition-colors cursor-pointer border ${
                    ep.is_default
                      ? "bg-[#3882F6]/20 border-[#3882F6]/40 text-white font-semibold"
                      : "bg-white/[0.04] border-white/[0.05] text-zinc-300 hover:bg-white/[0.08]"
                  }`}
                >
                  <Speaker size={13} className="shrink-0 text-[#60a5fa]" />
                  <span className="truncate flex-1">{ep.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
