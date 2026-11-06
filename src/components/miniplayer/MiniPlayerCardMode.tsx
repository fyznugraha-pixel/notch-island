import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { SkipBack, Play, Pause, SkipForward } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { MediaPayload, LyricsPayload } from "../../services/mediaLyricsStore";
import { useLyricsSync } from "./lyricsSync";
import { formatMediaTime } from "../../utils/time";

export interface MiniPlayerCardModeProps {
  media: MediaPayload | null;
  lyrics: LyricsPayload | null;
  theme: "solid" | "liquid";
  tintColor: string;
  onToggleMode?: () => void;
}

export const MiniPlayerCardMode: React.FC<MiniPlayerCardModeProps> = ({
  media,
  lyrics,
  theme,
  tintColor,
}) => {
  const isPlaying = Boolean(media?.is_playing);
  const position = media?.position || 0;
  const duration = media?.duration || 0;

  const { activeIndex, livePosition } = useLyricsSync(
    lyrics,
    position,
    duration,
    isPlaying,
    lyrics?.offset || 0
  );

  const progressPercent = useMemo(() => {
    if (!duration || duration <= 0) return 0;
    return Math.min(100, Math.max(0, (livePosition / duration) * 100));
  }, [livePosition, duration]);

  const remainingSeconds = Math.max(0, duration - livePosition);

  // Five lines of lyrics window around activeIndex
  const fiveLines = useMemo(() => {
    if (!lyrics?.synced || !lyrics.lines || lyrics.lines.length === 0) return [];
    const lines = lyrics.lines;
    const center = Math.max(0, activeIndex);

    // Indices: center - 2, center - 1, center, center + 1, center + 2
    const result = [];
    for (let offset = -2; offset <= 2; offset++) {
      const idx = center + offset;
      if (idx >= 0 && idx < lines.length) {
        result.push({
          index: idx,
          offset,
          line: lines[idx],
        });
      } else {
        result.push({
          index: idx,
          offset,
          line: null,
        });
      }
    }
    return result;
  }, [lyrics?.synced, lyrics?.lines, activeIndex]);

  const containerStyle = useMemo(() => {
    if (theme === "solid") {
      return {
        backgroundColor: tintColor || "#121216",
        opacity: 1.0,
      };
    }
    return {
      backgroundColor: "rgba(18, 18, 24, 0.75)",
      backdropFilter: "blur(28px) saturate(180%)",
      WebkitBackdropFilter: "blur(28px) saturate(180%)",
    };
  }, [theme, tintColor]);

  const handleSeek = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * duration;
    try {
      await invoke("smtc_seek", { positionSec: targetTime });
    } catch {}
  };

  const handleMediaControl = async (action: "prev" | "toggle" | "next") => {
    try {
      await invoke("smtc_action", { action });
    } catch {}
  };

  return (
    <div
      data-tauri-drag-region
      className={`relative w-[380px] h-[440px] rounded-[28px] overflow-hidden select-none cursor-move flex flex-col justify-between p-5 ${
        theme === "solid" ? "border border-white/[0.08]" : "border border-white/[0.16]"
      } shadow-[0_16px_48px_rgba(0,0,0,0.65)]`}
      style={containerStyle}
    >
      {/* Reserved top 36px toolbar slot (toolbar hovers here) */}
      <div className="h-9 w-full shrink-0 flex items-center justify-between" />

      {/* Header: 60px Album Art + Title/Artist + Equalizer */}
      <div className="flex items-center gap-3.5 shrink-0">
        <div className="w-[60px] h-[60px] rounded-2xl overflow-hidden bg-white/5 shrink-0 shadow-lg border border-white/10 flex items-center justify-center">
          {media?.thumbnail ? (
            <img
              src={media.thumbnail}
              alt={media.title || "Album Art"}
              className="w-full h-full object-cover select-none pointer-events-none"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/40 text-xl">
              🎵
            </div>
          )}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <span
            className="text-[16px] font-bold text-white truncate leading-snug"
            title={media?.title || "Gili Mini Player"}
          >
            {media?.title || "Gili Mini Player"}
          </span>
          <span
            className="text-[13px] text-white/70 truncate leading-snug mt-0.5"
            title={media?.artist || "Belum ada media aktif"}
          >
            {media?.artist || "Belum ada media aktif"}
          </span>
        </div>

        {/* Animated Equalizer Wave (Cyan #38bdf8) */}
        <div className="flex items-end justify-center gap-[3px] h-5 w-6 shrink-0 pb-1">
          {[
            { delay: "0s", duration: "0.85s" },
            { delay: "0.2s", duration: "0.75s" },
            { delay: "0.4s", duration: "0.95s" },
            { delay: "0.15s", duration: "0.8s" },
          ].map((bar, i) => (
            <div
              key={i}
              className={`w-[2.5px] rounded-full bg-[#38bdf8] transition-all ${
                isPlaying ? "animate-eq-bar" : "h-[4px]"
              }`}
              style={
                isPlaying
                  ? {
                      animationDuration: bar.duration,
                      animationDelay: bar.delay,
                      minHeight: "4px",
                    }
                  : { height: "4px" }
              }
            />
          ))}
        </div>
      </div>

      {/* Center: 5 Lines of Synced Lyrics with Mask Fade */}
      <div
        className="flex-1 my-3 flex flex-col justify-center overflow-hidden relative"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
        }}
      >
        {lyrics?.state === "loading" ? (
          <div className="flex flex-col items-center justify-center gap-2 text-white/50 text-sm py-8">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
            <span>Memuat lirik...</span>
          </div>
        ) : lyrics?.state === "instrumental" ? (
          <div className="text-center text-white/60 text-[15px] font-medium py-8">
            ♪ Lagu Instrumental ♪
          </div>
        ) : lyrics?.state === "not_found" ? (
          <div className="text-center text-white/50 text-[13.5px] py-8">
            Lirik tidak ditemukan
          </div>
        ) : lyrics?.synced && fiveLines.length > 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-2 text-center">
            {fiveLines.map(({ index, offset, line }) => {
              if (!line) {
                return <div key={`empty-${offset}`} className="h-6" />;
              }

              const isActive = offset === 0;
              const isNear = Math.abs(offset) === 1;

              return (
                <motion.div
                  key={`${index}-${line.time}`}
                  layout="position"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await invoke("smtc_seek", { positionSec: line.time });
                    } catch {}
                  }}
                  className={`cursor-pointer transition-all duration-200 px-3 py-1 select-none ${
                    isActive
                      ? "text-[20px] font-bold text-white scale-100 line-clamp-3 leading-snug"
                      : isNear
                      ? "text-[15px] font-medium text-white/60 hover:text-white/80"
                      : "text-[13px] font-normal text-white/35 hover:text-white/60"
                  }`}
                  style={{
                    opacity: isActive ? 1.0 : isNear ? 0.6 : 0.35,
                  }}
                >
                  {line.text}
                </motion.div>
              );
            })}
          </div>
        ) : lyrics?.plain_lyrics ? (
          <div className="h-full overflow-y-auto px-4 py-2 text-center text-[14px] text-white/70 whitespace-pre-wrap leading-relaxed">
            {lyrics.plain_lyrics}
          </div>
        ) : (
          <div className="text-center text-white/40 text-[13.5px] py-8">
            Siap memutar musik
          </div>
        )}
      </div>

      {/* Bottom: Progress Bar + Playback Controls */}
      <div className="flex flex-col gap-2 shrink-0 pt-1">
        {/* Progress Bar with Timers */}
        <div className="flex items-center gap-2.5">
          <span className="text-[11.5px] font-mono text-white/60 min-w-[32px] text-right select-none">
            {formatMediaTime(livePosition)}
          </span>
          <div
            onClick={handleSeek}
            className="flex-1 h-3 flex items-center cursor-pointer group"
          >
            <div className="w-full h-[3px] bg-white/15 rounded-full overflow-hidden relative group-hover:h-[4px] transition-all">
              <div
                className="h-full bg-white/90 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <span className="text-[11.5px] font-mono text-white/60 min-w-[36px] text-left select-none">
            -{formatMediaTime(remainingSeconds)}
          </span>
        </div>

        {/* Playback Controls (Previous, 46px White Play/Pause, Next) */}
        <div className="flex items-center justify-center gap-8 pt-1">
          <button
            onClick={() => handleMediaControl("prev")}
            className="w-10 h-10 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Sebelumnya"
          >
            <SkipBack size={22} fill="currentColor" />
          </button>

          <button
            onClick={() => handleMediaControl("toggle")}
            className="w-[46px] h-[46px] rounded-full bg-white text-black shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer"
            aria-label={isPlaying ? "Jeda" : "Putar"}
          >
            {isPlaying ? (
              <Pause size={22} fill="currentColor" />
            ) : (
              <Play size={22} fill="currentColor" className="ml-0.5" />
            )}
          </button>

          <button
            onClick={() => handleMediaControl("next")}
            className="w-10 h-10 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Berikutnya"
          >
            <SkipForward size={22} fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
};
