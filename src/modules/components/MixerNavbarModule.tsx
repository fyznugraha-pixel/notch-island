import React, { useState, useEffect, useRef, useCallback } from "react";
import { Sliders, Headphones, Speaker, VolumeX, Volume2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

interface AudioSessionItem {
  pid: number;
  name: string;
  volume: number;
  muted: boolean;
}

interface AudioEndpointItem {
  id: string;
  name: string;
  is_default: boolean;
}

export const MixerNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<AudioSessionItem[]>([]);
  const [masterVol, setMasterVol] = useState<number | null>(null);

  const loadAudio = useCallback(async () => {
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
            name: s.name || `App ${s.pid}`,
            volume:
              typeof s.volume === "number"
                ? s.volume <= 1
                  ? Math.round(s.volume * 100)
                  : Math.round(s.volume)
                : 100,
            muted: Boolean(s.muted),
          }))
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadAudio();
    const unlisten = listen<number>("master-volume-changed", (ev) => {
      if (typeof ev.payload === "number") {
        setMasterVol(
          ev.payload <= 1 ? Math.round(ev.payload * 100) : Math.round(ev.payload)
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadAudio]);

  const handleMasterChange = async (val: number) => {
    setMasterVol(val);
    try {
      await invoke("set_master_volume", { level: val / 100 });
    } catch {}
  };

  const handleAppVolChange = async (s: AudioSessionItem, val: number) => {
    setSessions((prev) =>
      prev.map((item) =>
        item.pid === s.pid ? { ...item, volume: val, muted: false } : item
      )
    );
    try {
      await invoke("set_app_volume", {
        pid: s.pid,
        volume: val / 100,
        name: s.name,
      });
    } catch {}
  };

  const handleToggleAppMute = async (s: AudioSessionItem) => {
    const nextMuted = !s.muted;
    setSessions((prev) =>
      prev.map((item) =>
        item.pid === s.pid ? { ...item, muted: nextMuted } : item
      )
    );
    try {
      await invoke("set_app_mute", {
        pid: s.pid,
        mute: nextMuted,
        name: s.name,
      });
    } catch {}
  };

  const handleToggle = () => {
    if (!isOpen) loadAudio();
    setIsOpen((v) => !v);
  };

  const volLabel = masterVol !== null ? `${masterVol}%` : "--";
  const mixerAppsCount =
    lang === "en"
      ? `${sessions.length} ${sessions.length === 1 ? "app" : "apps"}`
      : `${sessions.length} aplikasi`;
  const mixerActiveTooltip =
    lang === "en"
      ? `Sound Mixer (${sessions.length} active ${sessions.length === 1 ? "app" : "apps"})`
      : `Mixer Suara (${sessions.length} aplikasi aktif)`;

  return (
    <>
      <Tooltip
        content={mixerActiveTooltip}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            `${tx(lang, "Sound Mixer", "Mixer Suara")} (${mixerAppsCount})`,
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
          {isCompact ? (
            <Sliders size={15} className="text-zinc-200" />
          ) : (
            <>
              <div className="flex items-end gap-[3px] h-[16px] shrink-0">
                <i className="w-[3px] h-[12px] rounded-[1.5px] bg-[#22c55e]" />
                <i className="w-[3px] h-[8px] rounded-[1.5px] bg-[#3882F6]" />
                <i className="w-[3px] h-[15px] rounded-[1.5px] bg-[#a855f7]" />
              </div>
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[115px]">
                <span className="text-[11.5px] font-semibold text-white truncate">
                  Mixer
                </span>
                <span className="text-[10px] text-zinc-400 truncate">
                  {sessions.length > 0 ? mixerAppsCount : `Master ${volLabel}`}
                </span>
              </div>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "App Sound Mixer", "Mixer Suara Aplikasi")}
        moduleId="mixer_suara"
        currentView={view}
        config={config}
        width={265}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1 pb-2 border-b border-white/[0.08]">
            <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
              <span className="text-zinc-200 font-semibold truncate">
                {tx(lang, "Master Volume", "Volume Utama")}
              </span>
              <span className="text-zinc-300 tabular-nums shrink-0">{volLabel}</span>
            </div>
            <input
              type="range"
              aria-label={tx(lang, "Master Volume", "Volume Utama")}
              min={0}
              max={100}
              value={masterVol ?? 0}
              onChange={(e) => handleMasterChange(Number(e.target.value))}
              className="w-full accent-[#3882F6] h-1.5 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-0.5">
            {sessions.length === 0 ? (
              <div className="text-[11px] text-zinc-400 py-2 text-center">
                {tx(
                  lang,
                  "No separate apps are currently playing audio.",
                  "Tidak ada aplikasi terpisah yang sedang memutar audio."
                )}
              </div>
            ) : (
              sessions.map((s) => (
                <div key={`${s.pid}_${s.name}`} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                    <span className="text-zinc-200 truncate flex-1 min-w-0">{s.name}</span>
                    <Tooltip
                      content={
                        s.muted
                          ? tx(lang, "Unmute", "Bunyikan")
                          : tx(lang, "Mute", "Bisukan")
                      }
                      side="top"
                      isLightMode={isLight}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleAppMute(s)}
                        className={`p-1 rounded hover:bg-white/10 cursor-pointer shrink-0 ${TRIGGER_FOCUS_RING} ${
                          s.muted ? "text-rose-400" : "text-zinc-300"
                        }`}
                      >
                        {s.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                      </button>
                    </Tooltip>
                    <span className="text-zinc-300 tabular-nums w-9 text-right shrink-0">
                      {s.muted ? tx(lang, "Muted", "Bisu") : `${s.volume}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label={tx(lang, `${s.name} volume`, `Volume ${s.name}`)}
                    min={0}
                    max={100}
                    value={s.muted ? 0 : s.volume}
                    onChange={(e) =>
                      handleAppVolChange(s, Number(e.target.value))
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

export const AudioOutputNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [endpoints, setEndpoints] = useState<AudioEndpointItem[]>([]);
  const [masterVol, setMasterVol] = useState<number | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const loadEndpoints = useCallback(async () => {
    try {
      const m = await invoke<number>("get_master_volume");
      if (typeof m === "number") {
        setMasterVol(m <= 1 ? Math.round(m * 100) : Math.round(m));
      }
    } catch {}
    try {
      const list = await invoke<AudioEndpointItem[]>("get_audio_endpoints");
      if (Array.isArray(list)) {
        setEndpoints(list);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadEndpoints();
    const unlistenVol = listen<number>("master-volume-changed", (ev) => {
      if (typeof ev.payload === "number") {
        setMasterVol(
          ev.payload <= 1 ? Math.round(ev.payload * 100) : Math.round(ev.payload)
        );
      }
    });
    const unlistenDev = listen("audio-connected", () => {
      loadEndpoints();
    });
    return () => {
      unlistenVol.then((fn) => fn());
      unlistenDev.then((fn) => fn());
    };
  }, [loadEndpoints]);

  const currentDevice =
    endpoints.find((e) => e.is_default)?.name || "Speaker / Headset";

  const handleSelectEndpoint = async (id: string) => {
    setSwitchError(null);
    const prev = endpoints;
    setEndpoints((list) => list.map((e) => ({ ...e, is_default: e.id === id })));
    try {
      await invoke("set_default_audio_endpoint", { id });
      await loadEndpoints();
    } catch {
      setEndpoints(prev);
      setSwitchError(
        tx(lang, "Failed to switch output device.", "Gagal mengganti perangkat output.")
      );
    }
  };

  const handleVolChange = async (val: number) => {
    setMasterVol(val);
    try {
      await invoke("set_master_volume", { level: val / 100 });
    } catch {}
  };

  const handleToggle = () => {
    if (!isOpen) loadEndpoints();
    setIsOpen((v) => !v);
  };

  const volLabel = masterVol !== null ? `${masterVol}%` : "--";
  const outputTitle = tx(lang, "Audio Output", "Output Audio");

  return (
    <>
      <Tooltip
        content={`${outputTitle}: ${currentDevice} (${volLabel})`}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            `${outputTitle}: ${currentDevice}`,
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
          <Headphones size={15} className="text-[#60a5fa] shrink-0" />
          {!isCompact && (
            <div className="flex flex-col leading-[1.15] min-w-0 max-w-[115px]">
              <span className="text-[11.5px] font-semibold text-white truncate">
                {currentDevice}
              </span>
              <span className="text-[10px] text-zinc-400 tabular-nums truncate">
                Vol {volLabel}
              </span>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={outputTitle}
        moduleId="output_audio"
        currentView={view}
        config={config}
        width={260}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-300">
                {tx(lang, "Output Volume", "Volume Output")}
              </span>
              <span className="font-bold text-white tabular-nums">
                {volLabel}
              </span>
            </div>
            <input
              type="range"
              aria-label={tx(lang, "Output Volume", "Volume Output")}
              min={0}
              max={100}
              value={masterVol ?? 0}
              onChange={(e) => handleVolChange(Number(e.target.value))}
              className="w-full accent-[#3882F6] h-1.5 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto pr-0.5">
            {endpoints.length === 0 ? (
              <div className="text-[11px] text-zinc-400 py-1 break-words">
                {tx(lang, `Active device: ${currentDevice}`, `Perangkat aktif: ${currentDevice}`)}
              </div>
            ) : (
              endpoints.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => handleSelectEndpoint(ep.id)}
                  className={`w-full min-w-0 overflow-hidden flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-[11.5px] text-left transition-colors cursor-pointer border ${TRIGGER_FOCUS_RING} ${
                    ep.is_default
                      ? isLight
                        ? "bg-blue-600/15 border-blue-600/40 text-zinc-900 font-semibold"
                        : "bg-[#3882F6]/20 border-[#3882F6]/40 text-white font-semibold"
                      : "bg-white/[0.04] border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]"
                  }`}
                >
                  <Speaker size={13} className="shrink-0 text-[#60a5fa]" />
                  <span className="truncate flex-1 min-w-0">{ep.name}</span>
                </button>
              ))
            )}
          </div>
          {switchError && (
            <div className="text-[10.5px] text-rose-400">{switchError}</div>
          )}
        </div>
      </NavbarPopoverShell>
    </>
  );
};
