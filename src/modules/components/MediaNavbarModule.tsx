import React, { useState, useEffect, useRef } from "react";
import {
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ExternalLink,
  MessageSquareQuote,
  Radio,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MediaPayload } from "../../types";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";
import { ScrollingText } from "../../components/ui/ScrollingText";
import { getMediaBranding } from "../../utils/playerBranding";

const MEDIA_STORAGE_KEY = "gili_live_media_v1";

function formatTime(seconds?: number): string {
  if (typeof seconds !== "number" || isNaN(seconds) || seconds < 0) {
    return "0:00";
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const MediaNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const [media, setMedia] = useState<MediaPayload | null>(() => {
    try {
      const raw = localStorage.getItem(MEDIA_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.title) return parsed;
      }
    } catch {}
    return null;
  });

  const [progress, setProgress] = useState<{ position: number; duration: number }>({
    position: 0,
    duration: 0,
  });

  useEffect(() => {
    const unlistenMedia = listen<MediaPayload>("media-update", (ev) => {
      if (ev.payload?.title || ev.payload?.artist) {
        setMedia(ev.payload);
        if (ev.payload.position !== undefined && ev.payload.duration !== undefined) {
          setProgress({
            position: ev.payload.position,
            duration: ev.payload.duration,
          });
        }
        try {
          localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(ev.payload));
        } catch {}
      } else if (ev.payload && !ev.payload.is_playing) {
        setMedia((prev) => (prev ? { ...prev, is_playing: false } : null));
      }
    });

    const unlistenProgress = listen<{ position: number; duration: number }>(
      "media-progress",
      (ev) => {
        if (typeof ev.payload?.position === "number") {
          setProgress({
            position: ev.payload.position,
            duration: ev.payload.duration || 0,
          });
        }
      }
    );

    return () => {
      unlistenMedia.then((fn) => fn());
      unlistenProgress.then((fn) => fn());
    };
  }, []);

  const isPlaying = Boolean(media?.is_playing);
  const title = media?.title?.trim() || "Tidak ada media";
  const artist = media?.artist?.trim() || "Island Music";
  const hasMedia = Boolean(media?.title);
  const branding = getMediaBranding(media);

  const triggerAction = async (
    action: "toggle" | "next" | "prev",
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    try {
      await invoke("smtc_action", { action });
      if (action === "toggle") {
        setMedia((m) => (m ? { ...m, is_playing: !m.is_playing } : null));
      }
    } catch {}
  };

  const handleSeek = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPos = parseFloat(e.target.value);
    setProgress((p) => ({ ...p, position: newPos }));
    try {
      await invoke("smtc_seek", { positionSec: newPos });
    } catch {}
  };

  const handleOpenNotchMedia = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    invoke("trigger_notch_action", { action: "open_tab:media_expanded" }).catch(
      () => {}
    );
    setIsOpen(false);
  };

  const pct =
    progress.duration > 0
      ? Math.min(100, Math.max(0, (progress.position / progress.duration) * 100))
      : 0;

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`relative flex items-center cursor-pointer select-none group/mediapill ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08]"
            : "h-10 px-2.5 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] shadow-sm overflow-hidden"
        }`}
        style={{
          transition:
            "all 0.35s cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms ease",
        }}
        title={`Musik: ${title} — ${artist} (${isPlaying ? "Sedang diputar" : "Jeda"})`}
      >
        {isCompact ? (
          <div className="relative w-[28px] h-[28px] rounded-[8px] bg-gradient-to-br from-pink-500 via-rose-500 to-indigo-600 flex items-center justify-center overflow-hidden shrink-0 shadow-sm ring-1 ring-white/10">
            {media?.thumbnail ? (
              <img
                src={media.thumbnail}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <Music size={13} className="text-white/90" />
            )}
            {isPlaying && (
              <div className="absolute bottom-0.5 right-0.5 px-[2px] py-[1.5px] rounded-[3px] bg-black/80 backdrop-blur-sm flex items-end gap-[1px] ring-1 ring-white/10 pointer-events-none">
                <span className="w-[1.5px] h-[6px] bg-emerald-400 rounded-full animate-eq-bar" style={{ animationDelay: "0ms" }} />
                <span className="w-[1.5px] h-[6px] bg-emerald-400 rounded-full animate-eq-bar" style={{ animationDelay: "180ms" }} />
                <span className="w-[1.5px] h-[6px] bg-emerald-400 rounded-full animate-eq-bar" style={{ animationDelay: "360ms" }} />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="relative w-[26px] h-[26px] rounded-[7px] bg-gradient-to-br from-pink-500 via-rose-500 to-indigo-600 flex items-center justify-center overflow-hidden shrink-0 shadow-sm ring-1 ring-white/10">
              {media?.thumbnail ? (
                <img
                  src={media.thumbnail}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music size={13} className="text-white/90" />
              )}
            </div>

            <div className="flex flex-col justify-center min-w-0 max-w-[125px] overflow-hidden leading-tight flex-1">
              <ScrollingText
                text={title}
                className="text-[11.5px] font-semibold text-white/95 tracking-tight leading-tight"
              />
              <ScrollingText
                text={artist}
                className="text-[10px] text-white/50 font-medium tracking-tight leading-tight mt-0.5"
              />
            </div>

            {hasMedia && (
              <button
                type="button"
                onClick={(e) => triggerAction("toggle", e)}
                className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.2] flex items-center justify-center text-white/90 hover:text-white transition-all active:scale-90 cursor-pointer shrink-0 ml-0.5 border border-white/[0.06] shadow-sm"
                title={isPlaying ? "Jeda" : "Putar"}
              >
                {isPlaying ? (
                  <Pause size={10} className="fill-current" />
                ) : (
                  <Play size={10} className="ml-0.5 fill-current" />
                )}
              </button>
            )}

            {/* Hairline subtle progress track at the bottom of the pill */}
            {progress.duration > 0 && isPlaying && (
              <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-white/[0.08] overflow-hidden pointer-events-none">
                <div
                  className="h-full bg-gradient-to-r from-pink-500 via-rose-400 to-indigo-400 transition-all duration-300 shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Sedang Diputar"
        moduleId="sedang_diputar"
        currentView={view}
        config={config}
        width={280}
      >
        <div className="flex flex-col gap-3">
          {/* Card Container with subtle backdrop aura */}
          <div className="relative p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-md flex items-center gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden">
            {/* Ambient colorful glow behind artwork */}
            <div className="absolute -left-4 -top-4 w-24 h-24 rounded-full bg-gradient-to-tr from-pink-500/20 via-rose-500/15 to-indigo-500/10 blur-xl pointer-events-none" />

            {/* Artwork thumbnail */}
            <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-pink-500 via-rose-500 to-indigo-600 flex items-center justify-center overflow-hidden shrink-0 shadow-[0_8px_20px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
              {media?.thumbnail ? (
                <img
                  src={media.thumbnail}
                  alt=""
                  className="w-full h-full object-cover select-none pointer-events-none"
                />
              ) : (
                <Music size={22} className="text-white/85" />
              )}
            </div>

            {/* Metadata with Running Text */}
            <div className="min-w-0 flex-1 overflow-hidden">
              <ScrollingText
                text={title}
                className="text-[13px] font-semibold text-white tracking-tight leading-snug"
              />
              <ScrollingText
                text={artist}
                className="text-[11px] text-white/60 font-medium tracking-tight leading-snug mt-0.5"
              />

              {/* Source & Live Equalizer Badge */}
              <div className="flex items-center gap-2 mt-1.5">
                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] bg-white/[0.06] border border-white/[0.08] text-[9.5px] font-medium text-white/75 select-none">
                  {media?.web_source ? (
                    <Radio size={9} className="text-pink-400" />
                  ) : (
                    <Music size={9} className="text-pink-400" />
                  )}
                  <span className="truncate max-w-[90px]">
                    {media?.web_source || branding.name}
                  </span>
                </div>

                {isPlaying && (
                  <div className="flex items-end gap-[1.5px] h-2.5 px-0.5 pointer-events-none">
                    <span className="w-[1.5px] h-2.5 bg-pink-400 rounded-full animate-eq-bar" style={{ animationDelay: "0ms" }} />
                    <span className="w-[1.5px] h-2.5 bg-pink-400 rounded-full animate-eq-bar" style={{ animationDelay: "150ms" }} />
                    <span className="w-[1.5px] h-2.5 bg-pink-400 rounded-full animate-eq-bar" style={{ animationDelay: "300ms" }} />
                    <span className="w-[1.5px] h-2.5 bg-pink-400 rounded-full animate-eq-bar" style={{ animationDelay: "450ms" }} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Minimalist Scrubber & Timestamps */}
          {progress.duration > 0 && (
            <div className="flex flex-col gap-1.5 px-0.5 pt-0.5">
              <div className="relative w-full h-3.5 flex items-center group/scrubber cursor-pointer">
                {/* Background Track */}
                <div className="w-full h-1 group-hover/scrubber:h-1.5 rounded-full bg-white/[0.1] transition-all overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-pink-500 via-rose-400 to-amber-300 rounded-full transition-all duration-150 shadow-[0_0_8px_rgba(244,63,94,0.35)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {/* Micro Hover Thumb */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.6)] scale-0 group-hover/scrubber:scale-100 transition-transform pointer-events-none"
                  style={{ left: `${pct}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={progress.duration}
                  step={1}
                  value={progress.position}
                  onChange={handleSeek}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  title={`Geser: ${formatTime(progress.position)}`}
                />
              </div>

              <div className="flex justify-between items-center text-[10px] text-white/45 font-mono select-none px-0.5">
                <span className="tabular-nums font-medium">{formatTime(progress.position)}</span>
                <span className="tabular-nums font-medium">-{formatTime(Math.max(0, progress.duration - progress.position))}</span>
              </div>
            </div>
          )}

          {/* Premium Playback Controls */}
          <div className="flex items-center justify-center gap-4 py-0.5">
            <button
              type="button"
              onClick={() => triggerAction("prev")}
              className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.12] active:scale-90 flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer border border-white/[0.06] shadow-sm"
              title="Lagu Sebelumnya"
            >
              <SkipBack size={15} className="fill-current text-white/70" />
            </button>
            <button
              type="button"
              onClick={() => triggerAction("toggle")}
              className="w-12 h-12 rounded-full bg-white hover:bg-neutral-100 text-neutral-900 hover:scale-105 active:scale-95 flex items-center justify-center transition-all cursor-pointer shadow-[0_4px_18px_rgba(255,255,255,0.25)]"
              title={isPlaying ? "Jeda" : "Putar"}
            >
              {isPlaying ? (
                <Pause size={18} className="fill-current text-neutral-900" />
              ) : (
                <Play size={18} className="ml-0.5 fill-current text-neutral-900" />
              )}
            </button>
            <button
              type="button"
              onClick={() => triggerAction("next")}
              className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.12] active:scale-90 flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer border border-white/[0.06] shadow-sm"
              title="Lagu Berikutnya"
            >
              <SkipForward size={15} className="fill-current text-white/70" />
            </button>
          </div>

          {/* Open in Island / Notch Media Button */}
          <button
            type="button"
            onClick={handleOpenNotchMedia}
            className="group h-8.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] active:scale-[0.98] border border-white/[0.07] text-white/80 hover:text-white text-[11px] font-medium flex items-center justify-between transition-all cursor-pointer shadow-sm"
          >
            <div className="flex items-center gap-2">
              <MessageSquareQuote size={13} className="text-pink-400 transition-transform group-hover:scale-110" />
              <span>Buka di Island (Lirik & Antrean)</span>
            </div>
            <ExternalLink size={11} className="text-white/35 group-hover:text-white/75 transition-colors" />
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
