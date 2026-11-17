import React, { useCallback, useEffect, useRef, useState } from "react";
import { CloudRain, Coffee, Flame, Pause, Play, Volume2, Waves } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import {
  ActiveSoundGraph,
  AMBIENT_PRESETS,
  AmbientPreset,
  AmbientPresetId,
  buildSoundscapeGraph,
  setGraphVolume,
  stopSoundGraph,
} from "../../utils/ambientSoundEngine";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

export type { AmbientPreset };

const AMBIENT_PREFS_KEY = "gili_ambient_prefs_v1";

function getLocalizedPresetCopy(id: AmbientPresetId, lang: "en" | "id") {
  switch (id) {
    case "rain":
      return {
        label: tx(lang, "Rain", "Hujan"),
        subtitle: tx(lang, "Calm drizzle", "Rintik tenang"),
      };
    case "cafe":
      return {
        label: tx(lang, "Cafe", "Kafe"),
        subtitle: tx(lang, "Room ambience", "Suasana ruangan"),
      };
    case "waves":
      return {
        label: tx(lang, "Waves", "Ombak"),
        subtitle: tx(lang, "Tidal swell", "Pasang surut"),
      };
    case "fire":
      return {
        label: tx(lang, "Fireplace", "Api Unggun"),
        subtitle: tx(lang, "Wood & embers", "Kayu & bara"),
      };
  }
}

function loadAmbientPrefs(): { modeIdx: number; volume: number } {
  try {
    const raw = localStorage.getItem(AMBIENT_PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const modeIdx =
        typeof p?.modeIdx === "number" && p.modeIdx >= 0 && p.modeIdx < AMBIENT_PRESETS.length
          ? p.modeIdx
          : 0;
      const volume =
        typeof p?.volume === "number" && p.volume >= 0 && p.volume <= 1 ? p.volume : 0.65;
      return { modeIdx, volume };
    }
  } catch {}
  return { modeIdx: 0, volume: 0.65 };
}

function getPresetIcon(id: AmbientPresetId, size = 14) {
  switch (id) {
    case "rain":
      return <CloudRain size={size} />;
    case "cafe":
      return <Coffee size={size} />;
    case "waves":
      return <Waves size={size} />;
    case "fire":
      return <Flame size={size} />;
  }
}

export const AmbientSoundNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const initialPrefs = useRef(loadAmbientPrefs()).current;
  const [modeIdx, setModeIdx] = useState(initialPrefs.modeIdx);
  const [volume, setVolume] = useState(initialPrefs.volume);
  const [playing, setPlaying] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [suppressOuterTip, setSuppressOuterTip] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ActiveSoundGraph | null>(null);

  const persistPrefs = (nextIdx: number, nextVol: number) => {
    try {
      localStorage.setItem(AMBIENT_PREFS_KEY, JSON.stringify({ modeIdx: nextIdx, volume: nextVol }));
    } catch {}
  };

  const stopAudio = useCallback(() => {
    stopSoundGraph(graphRef.current);
    graphRef.current = null;
    setPlaying(false);
  }, []);

  const startOrSwitchAudio = useCallback(
    (targetIdx: number, vol: number) => {
      stopSoundGraph(graphRef.current);
      graphRef.current = null;
      try {
        const preset = AMBIENT_PRESETS[targetIdx % AMBIENT_PRESETS.length];
        graphRef.current = buildSoundscapeGraph(preset.id, vol);
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      stopSoundGraph(graphRef.current);
      graphRef.current = null;
    };
  }, []);

  const activePreset = AMBIENT_PRESETS[modeIdx % AMBIENT_PRESETS.length];
  const activeCopy = getLocalizedPresetCopy(activePreset.id, lang);

  const handleTogglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (playing) {
      stopAudio();
    } else {
      startOrSwitchAudio(modeIdx, volume);
    }
  };

  const handleSelectPreset = (idx: number) => {
    setModeIdx(idx);
    persistPrefs(idx, volume);
    if (playing) {
      startOrSwitchAudio(idx, volume);
    }
  };

  const handleVolumeChange = (nextVol: number) => {
    setVolume(nextVol);
    persistPrefs(modeIdx, nextVol);
    setGraphVolume(graphRef.current, nextVol);
  };

  const handleToggle = () => setIsOpen((v) => !v);
  const outerTooltip = tx(
    lang,
    `Ambient sound: ${activeCopy.label} (${playing ? "Playing" : "Stopped"})`,
    `Suara ambient: ${activeCopy.label} (${playing ? "Diputar" : "Berhenti"})`
  );

  return (
    <>
      <Tooltip
        content={outerTooltip}
        side={tooltipSide}
        disabled={isOpen || suppressOuterTip}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : ""}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            tx(lang, `Ambient sound ${activeCopy.label}`, `Suara ambient ${activeCopy.label}`),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? isVertical
                ? "gili-mod-compact gili-mod-vertical justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] relative"
                : "gili-mod-compact justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] relative"
              : "gili-mod-pill px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <span style={{ color: activePreset.accent }} className="shrink-0">
            {getPresetIcon(activePreset.id, 16)}
          </span>
          {isCompact && playing && (
            <span
              className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: activePreset.accent }}
            />
          )}
          {!isCompact && (
            <>
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[110px]">
                <span className="text-[12px] font-semibold text-white truncate">
                  {activeCopy.label}
                </span>
                <span className="text-[10px] text-zinc-300 truncate">
                  {playing ? tx(lang, "Now playing", "Sedang diputar") : tx(lang, "Ambient", "Ambient")}
                </span>
              </div>
              <div
                onMouseEnter={() => setSuppressOuterTip(true)}
                onMouseLeave={() => setSuppressOuterTip(false)}
              >
                <Tooltip
                  content={playing ? tx(lang, "Pause", "Hentikan") : tx(lang, "Play", "Putar")}
                  side={tooltipSide}
                  isLightMode={isLight}
                >
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    aria-label={
                      playing
                        ? tx(lang, "Stop ambient sound", "Hentikan suara ambient")
                        : tx(lang, "Play ambient sound", "Putar suara ambient")
                    }
                    className={`w-6 h-6 rounded-full bg-white/[0.09] hover:bg-white/[0.18] flex items-center justify-center text-white cursor-pointer ml-0.5 shrink-0 ${TRIGGER_FOCUS_RING}`}
                  >
                    {playing ? <Pause size={10} /> : <Play size={10} />}
                  </button>
                </Tooltip>
              </div>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Ambient Sound", "Suara Ambient")}
        moduleId="suara_ambient"
        currentView={view}
        config={config}
        width={268}
      >
        <div className="grid grid-cols-2 gap-1.5">
          {AMBIENT_PRESETS.map((preset, idx) => {
            const isSelected = idx === modeIdx;
            const copy = getLocalizedPresetCopy(preset.id, lang);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(idx)}
                className={`min-w-0 overflow-hidden flex items-center gap-2 p-2 rounded-[9px] border text-left cursor-pointer transition-colors ${TRIGGER_FOCUS_RING} ${
                  isSelected
                    ? "bg-white/[0.12] border-white/25 text-white"
                    : "bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] text-zinc-300"
                }`}
              >
                <span style={{ color: preset.accent }} className="shrink-0">
                  {getPresetIcon(preset.id, 15)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-white truncate">
                    {copy.label}
                  </div>
                  <div className="text-[9.5px] text-zinc-400 truncate">
                    {copy.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pt-1 min-w-0">
          <Volume2 size={14} className="text-zinc-300 shrink-0" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            aria-label={tx(lang, "Ambient sound volume", "Volume suara ambient")}
            className={`flex-1 min-w-0 accent-sky-400 cursor-pointer h-1.5 ${TRIGGER_FOCUS_RING}`}
          />
          <span className="text-[10.5px] text-zinc-300 tabular-nums w-8 text-right shrink-0">
            {Math.round(volume * 100)}%
          </span>
        </div>

        <button
          type="button"
          onClick={() => handleTogglePlay()}
          className={`w-full min-w-0 px-3 py-2 rounded-[9px] text-[11.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${TRIGGER_FOCUS_RING} ${
            playing
              ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40"
              : "bg-[#3882F6] hover:bg-blue-500 text-[#ffffff]"
          }`}
        >
          {playing ? <Pause size={12} className="shrink-0" /> : <Play size={12} className="shrink-0" />}
          <span className="truncate">
            {playing
              ? tx(lang, `Stop ${activeCopy.label}`, `Hentikan ${activeCopy.label}`)
              : tx(lang, `Play ${activeCopy.label}`, `Putar ${activeCopy.label}`)}
          </span>
        </button>
      </NavbarPopoverShell>
    </>
  );
};
