import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MediaPayload, LyricsPayload } from "../../services/mediaLyricsStore";
import { useLyricsSync } from "./lyricsSync";

export interface MiniPlayerBarModeProps {
  media: MediaPayload | null;
  lyrics: LyricsPayload | null;
  theme: "solid" | "liquid";
  tintColor: string;
  onToggleMode?: () => void;
}

export const MiniPlayerBarMode: React.FC<MiniPlayerBarModeProps> = ({
  media,
  lyrics,
  theme,
  tintColor,
  onToggleMode: _onToggleMode,
}) => {
  const isPlaying = Boolean(media?.is_playing);
  const position = media?.position || 0;
  const duration = media?.duration || 0;

  const { activeLine, livePosition } = useLyricsSync(
    lyrics,
    position,
    duration,
    isPlaying,
    lyrics?.offset || 0
  );

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const progressPercent = useMemo(() => {
    if (!duration || duration <= 0) return 0;
    return Math.min(100, Math.max(0, (livePosition / duration) * 100));
  }, [livePosition, duration]);

  // Determine active lyric text to display
  const activeLyricText = useMemo(() => {
    if (!media?.title) return "Gili Mini Player";
    if (lyrics?.state === "loading") return "Memuat lirik...";
    if (lyrics?.state === "instrumental") return "♪ Instrumental ♪";
    if (lyrics?.state === "not_found") return "Lirik tidak ditemukan";
    if (activeLine?.text) return activeLine.text;
    if (lyrics?.lines && lyrics.lines.length > 0) return lyrics.lines[0].text;
    if (lyrics?.plain_lyrics) {
      const firstLine = lyrics.plain_lyrics.split("\n").find((l) => l.trim().length > 0);
      return firstLine || media.title;
    }
    return media.title;
  }, [media?.title, lyrics?.state, lyrics?.lines, lyrics?.plain_lyrics, activeLine?.text]);

  const titleArtistText = useMemo(() => {
    if (!media?.title) return "Belum ada media aktif";
    return media.artist ? `${media.title} • ${media.artist}` : media.title;
  }, [media?.title, media?.artist]);

  // Theme styling: Solid must be 100% OPAQUE with gradient. Liquid uses approved frosted glass backdrop.
  const containerStyle = useMemo(() => {
    if (theme === "solid") {
      return {
        background: `linear-gradient(135deg, ${tintColor || "#3a1414"}, #0c0c10 125%)`,
        opacity: 1.0,
      };
    }
    return {
      backgroundColor: "rgba(18, 18, 24, 0.72)",
      backdropFilter: "blur(28px) saturate(180%)",
      WebkitBackdropFilter: "blur(28px) saturate(180%)",
    };
  }, [theme, tintColor]);

  return (
    <div
      data-tauri-drag-region
      className={`relative w-[440px] h-[88px] rounded-[24px] overflow-hidden select-none cursor-move flex flex-col justify-between ${
        theme === "solid" ? "border border-white/[0.09]" : "border border-white/[0.16]"
      } shadow-[0_18px_40px_rgba(0,0,0,0.55)]`}
      style={containerStyle}
    >
      {/* Main Content Area */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2 gap-3 flex-1 min-w-0 pointer-events-none">
        {/* Left: 56px Album Cover */}
        <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/5 shrink-0 shadow-md border border-white/10 flex items-center justify-center">
          {media?.thumbnail ? (
            <img
              src={media.thumbnail}
              alt={media.title || "Album Art"}
              className="w-full h-full object-cover select-none"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/40 text-lg">
              🎵
            </div>
          )}
        </div>

        {/* Center: Title + Artist (11.5px) and Active Lyric Line (14.5px Bold) */}
        <div className="flex flex-col justify-center flex-1 min-w-0 pr-1">
          {/* Title • Artist */}
          <span
            className="text-[11.5px] leading-tight text-white/60 font-medium truncate"
            title={titleArtistText}
          >
            {titleArtistText}
          </span>

          {/* Active Synced Lyric (Crossfade 200-250ms) */}
          <div className="h-[22px] flex items-center mt-1 overflow-hidden relative">
            <AnimatePresence mode="wait">
              <motion.span
                key={activeLyricText}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -3 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: "easeOut" }}
                className="text-[14.5px] leading-tight font-bold text-white truncate block w-full tracking-[-0.005em]"
                title={activeLyricText}
              >
                {activeLyricText}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Equalizer 5 bars (Blue #3B9DF8) */}
        <svg
          width="20"
          height="22"
          viewBox="0 0 25 28"
          role="img"
          aria-label="Sedang memutar"
          className="shrink-0"
        >
          <rect
            x="0"
            y={isPlaying ? "9" : "15"}
            width="3.5"
            height={isPlaying ? "10" : "4"}
            rx="1.75"
            fill="#3B9DF8"
            className={isPlaying ? "animate-pulse" : ""}
          />
          <rect
            x="5.5"
            y={isPlaying ? "5" : "15"}
            width="3.5"
            height={isPlaying ? "18" : "4"}
            rx="1.75"
            fill="#3B9DF8"
            className={isPlaying ? "animate-pulse" : ""}
          />
          <rect
            x="11"
            y={isPlaying ? "1" : "15"}
            width="3.5"
            height={isPlaying ? "26" : "4"}
            rx="1.75"
            fill="#3B9DF8"
            className={isPlaying ? "animate-pulse" : ""}
          />
          <rect
            x="16.5"
            y={isPlaying ? "6" : "15"}
            width="3.5"
            height={isPlaying ? "16" : "4"}
            rx="1.75"
            fill="#3B9DF8"
            className={isPlaying ? "animate-pulse" : ""}
          />
          <rect
            x="22"
            y={isPlaying ? "10" : "15"}
            width="3.5"
            height={isPlaying ? "8" : "4"}
            rx="1.75"
            fill="#3B9DF8"
            className={isPlaying ? "animate-pulse" : ""}
          />
        </svg>
      </div>

      {/* Bottom: 3px Progress Bar */}
      <div className="mx-4 mb-2 h-[3px] bg-white/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-white transition-[width] duration-200 ease-linear rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};

