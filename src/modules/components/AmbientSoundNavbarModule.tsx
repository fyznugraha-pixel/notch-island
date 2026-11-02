import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CloudRain,
  Coffee,
  Waves,
  Flame,
  Volume2,
  Play,
  Square,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { NavbarModuleContext } from "../types";
import { saveNavbarConfig } from "../../services/navbarConfigService";
import { Tooltip } from "../../components/ui/Tooltip";

export interface AmbientPreset {
  id: "rain" | "cafe" | "waves" | "fire";
  name: string;
  desc: string;
}

const AMBIENT_PRESETS: AmbientPreset[] = [
  { id: "rain", name: "Hujan", desc: "Rintik hujan deras & gemuruh lembut" },
  { id: "cafe", name: "Kafe", desc: "Suasana ruangan hangat & dengung akustik" },
  { id: "waves", name: "Ombak", desc: "Alunan pasang-surut pantai berirama" },
  { id: "fire", name: "Api Unggun", desc: "Hangat perapian & letupan kayu bakar" },
];

interface ActiveSoundGraph {
  ctx: AudioContext;
  timers: number[];
  masterGain: GainNode;
}

function buildSoundscapeGraph(
  mode: AmbientPreset["id"],
  volume: number
): ActiveSoundGraph {
  const ctx = new AudioContext();
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  const masterGain = ctx.createGain();
  masterGain.gain.value = Math.max(0.05, Math.min(1, volume));
  masterGain.connect(ctx.destination);

  const timers: number[] = [];
  const sampleRate = ctx.sampleRate;
  const bufLen = sampleRate * 3;
  const noiseBuf = ctx.createBuffer(1, bufLen, sampleRate);
  const data = noiseBuf.getChannelData(0);

  if (mode === "rain") {
    // Pink-ish rain wash + random water droplet pings
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.035;
      b6 = w * 0.115926;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1350;
    bp.Q.value = 0.65;

    src.connect(bp);
    bp.connect(masterGain);
    src.start();

    // Subtle raindrop patters
    const dropTimer = window.setInterval(() => {
      if (ctx.state !== "running") return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      const freq = 1600 + Math.random() * 1800;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.6, ctx.currentTime + 0.035);
      g.gain.setValueAtTime(0.025, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
      osc.connect(g);
      g.connect(masterGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.045);
    }, 110);
    timers.push(dropTimer);
  } else if (mode === "cafe") {
    // Warm room murmur (formant-filtered noise + gentle clink/chime)
    let last = 0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.04 * w) / 1.04;
      data[i] = last * 0.28;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 420;
    f1.Q.value = 1.4;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(f1.frequency);
    lfo.start();

    src.connect(f1);
    f1.connect(masterGain);
    src.start();

    // Occasional soft ceramic cup / acoustic chime
    const cupTimer = window.setInterval(() => {
      if (ctx.state !== "running") return;
      if (Math.random() > 0.55) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];
      const note = notes[Math.floor(Math.random() * notes.length)];
      osc.frequency.setValueAtTime(note, ctx.currentTime);
      g.gain.setValueAtTime(0.022, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      osc.connect(g);
      g.connect(masterGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.48);
    }, 950);
    timers.push(cupTimer);
  } else if (mode === "waves") {
    // Ocean waves: slow LFO sweeping both filter cutoff (180Hz..950Hz) and amplitude
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.14;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 480;

    const waveGain = ctx.createGain();
    waveGain.gain.value = 0.5;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.14; // ~7 sec per wave cycle

    const lfoFreqGain = ctx.createGain();
    lfoFreqGain.gain.value = 340;
    lfo.connect(lfoFreqGain);
    lfoFreqGain.connect(lp.frequency);

    const lfoAmpGain = ctx.createGain();
    lfoAmpGain.gain.value = 0.38;
    lfo.connect(lfoAmpGain);
    lfoAmpGain.connect(waveGain.gain);

    lfo.start();
    src.connect(lp);
    lp.connect(waveGain);
    waveGain.connect(masterGain);
    src.start();
  } else {
    // Campfire ("fire"): deep warm rumble + distinct wood crackle snaps
    let last = 0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.015 * w) / 1.015;
      data[i] = last * 0.32;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 210;

    src.connect(lp);
    lp.connect(masterGain);
    src.start();

    const crackleTimer = window.setInterval(() => {
      if (ctx.state !== "running") return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      const freq = 2200 + Math.random() * 2800;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.setValueAtTime(0.035, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.018);
      osc.connect(g);
      g.connect(masterGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.02);
    }, 90);
    timers.push(crackleTimer);
  }

  return { ctx, timers, masterGain };
}

export const AmbientSoundNavbarModule: React.FC<NavbarModuleContext> = ({
  view,
  config,
}) => {
  const [modeIdx, setModeIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);
  const [volume, setVolume] = useState(0.65);
  const graphRef = useRef<ActiveSoundGraph | null>(null);

  const stopAudio = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.timers.forEach((t) => clearInterval(t));
      graphRef.current.ctx.close().catch(() => {});
      graphRef.current = null;
    }
  }, []);

  const startOrSwitchAudio = useCallback(
    (targetIdx: number, vol: number) => {
      stopAudio();
      try {
        const preset = AMBIENT_PRESETS[targetIdx % AMBIENT_PRESETS.length];
        graphRef.current = buildSoundscapeGraph(preset.id, vol);
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    },
    [stopAudio]
  );

  useEffect(() => {
    return () => stopAudio();
  }, [stopAudio]);

  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.masterGain.gain.value = Math.max(0.05, Math.min(1, volume));
    }
  }, [volume]);

  useEffect(() => {
    if (!open) return;
    invoke("set_navbar_popup_open", { open: true }).catch(() => {});
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest("[data-ambient-module-root]")) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => {
      window.removeEventListener("pointerdown", handleOutside);
      invoke("set_navbar_popup_open", { open: false }).catch(() => {});
    };
  }, [open]);

  const currentPreset = AMBIENT_PRESETS[modeIdx % AMBIENT_PRESETS.length];

  const handleSelectMode = (newIdx: number) => {
    setModeIdx(newIdx);
    // Immediately play the selected soundscape so the user hears the difference right away
    startOrSwitchAudio(newIdx, volume);
  };

  const handleTogglePlay = () => {
    if (playing) {
      stopAudio();
      setPlaying(false);
    } else {
      startOrSwitchAudio(modeIdx, volume);
    }
  };

  const renderPresetIcon = (id: AmbientPreset["id"], active: boolean) => {
    const cls = active ? "text-[#bf5af2]" : "text-white/70";
    switch (id) {
      case "rain":
        return <CloudRain size={13.5} className={cls} />;
      case "cafe":
        return <Coffee size={13.5} className={cls} />;
      case "waves":
        return <Waves size={13.5} className={cls} />;
      case "fire":
        return <Flame size={13.5} className={cls} />;
    }
  };

  const pos = config.position || "bottom";
  const popupPosClass =
    pos === "top"
      ? "top-full left-1/2 -translate-x-1/2 mt-2.5"
      : pos === "left"
      ? "left-full top-1/2 -translate-y-1/2 ml-2.5"
      : pos === "right"
      ? "right-full top-1/2 -translate-y-1/2 mr-2.5"
      : "bottom-full left-1/2 -translate-x-1/2 mb-2.5";

  return (
    <div data-ambient-module-root className="relative flex items-center">
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: "#141419",
            borderColor: "rgba(255,255,255,0.1)",
            boxShadow:
              "0 18px 40px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
          className={`navbar-preview-dark absolute ${popupPosClass} z-50 w-[235px] p-3 rounded-[16px] border backdrop-blur-2xl text-white select-none pointer-events-auto`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-white/85 flex items-center gap-1.5">
              {renderPresetIcon(currentPreset.id, true)}
              Suara Ambient Fokus
            </span>
            <div className="flex items-center gap-1">
              <div className="flex items-center bg-white/[0.06] rounded-[7px] p-0.5 border border-white/[0.06]">
                {(["compact", "full"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const nextMods = config.modules.map((m) =>
                        m.id === "suara_ambient" ? { ...m, view: v } : m
                      );
                      const nextCfg = { ...config, modules: nextMods };
                      await saveNavbarConfig(nextCfg).catch(() => {});
                      await invoke("broadcast_navbar_config_update", { config: nextCfg }).catch(() => {});
                      await emit("navbar_config_updated", nextCfg).catch(() => {});
                      await emit("gili-navbar-config-sync", nextCfg).catch(() => {});
                    }}
                    className={`px-1.5 py-0.5 rounded-[5px] text-[9.5px] font-semibold cursor-pointer ${
                      view === v
                        ? "bg-[#3882F6] text-white"
                        : "text-white/50 hover:text-white"
                    }`}
                  >
                    {v === "compact" ? "Ikon" : "Panjang"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleTogglePlay}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 cursor-pointer ${
                  playing
                    ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                    : "bg-[#bf5af2]/25 text-[#d98ff8] hover:bg-[#bf5af2]/35"
                }`}
              >
                {playing ? (
                  <>
                    <Square size={9} fill="currentColor" /> Henti
                  </>
                ) : (
                  <>
                    <Play size={9} fill="currentColor" /> Putar
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white cursor-pointer"
              >
                <X size={11} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1 mb-2.5">
            {AMBIENT_PRESETS.map((p, idx) => {
              const isSelected = idx === modeIdx;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectMode(idx)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[9px] text-left transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#bf5af2]/20 border border-[#bf5af2]/40 text-white"
                      : "bg-white/[0.04] hover:bg-white/[0.1] border border-transparent text-white/80"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {renderPresetIcon(p.id, isSelected)}
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11.5px] font-semibold leading-tight">
                        {p.name}
                      </span>
                      <span className="text-[9.5px] text-white/45 truncate max-w-[145px]">
                        {p.desc}
                      </span>
                    </div>
                  </div>
                  {isSelected && playing && (
                    <span className="w-2 h-2 rounded-full bg-[#bf5af2] animate-ping shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Volume Slider */}
          <div className="flex items-center gap-2 pt-1.5 border-t border-white/[0.08]">
            <Volume2 size={13} className="text-white/60 shrink-0" />
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              style={{ accentColor: "#bf5af2" }}
              className="w-full cursor-pointer h-1"
            />
            <span className="text-[10px] font-mono text-white/60 w-7 text-right">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>
      )}

      <Tooltip
        side="top"
        delay={150}
        content={
          open
            ? null
            : `Suara Ambient: ${currentPreset.name} (${
                playing ? "Berputar" : "Mati"
              }) · Klik pilih suasana, Klik kanan ganti cepat`
        }
      >
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          onContextMenu={(e) => {
            e.preventDefault();
            const next = (modeIdx + 1) % AMBIENT_PRESETS.length;
            handleSelectMode(next);
          }}
          className={`transition-all flex items-center cursor-pointer text-white shrink-0 select-none ${
            view === "compact"
              ? "w-10 h-10 justify-center rounded-[12px]"
              : "h-10 px-3 gap-2 rounded-[12px]"
          } ${
            playing
              ? "bg-[#bf5af2]/20 border border-[#bf5af2]/40"
              : "bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          {renderPresetIcon(currentPreset.id, playing)}
          {view !== "compact" && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11.5px] font-semibold">
                {currentPreset.name}
              </span>
              <span className="text-[10px] text-white/55">
                · {playing ? `${Math.round(volume * 100)}%` : "Ambient"}
              </span>
            </div>
          )}
        </button>
      </Tooltip>
    </div>
  );
};

