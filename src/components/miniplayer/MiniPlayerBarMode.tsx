import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MediaPayload, LyricsPayload } from "../../services/mediaLyricsStore";
import { useLyricsSync } from "./lyricsSync";
import { ScrollingText } from "../ui/ScrollingText";
import { MiniPlayerBackground } from "./MiniPlayerBackground";

export interface MiniPlayerBarModeProps {
  media: MediaPayload | null;
  lyrics: LyricsPayload | null;
  theme: "solid" | "liquid";
  tintColor: string;
  showToolbar: boolean;
  toolbarNode: React.ReactNode;
  onToggleMode?: () => void;
}

export const MiniPlayerBarMode: React.FC<MiniPlayerBarModeProps> = ({
  media,
  lyrics,
  theme,
  tintColor,
  showToolbar,
  toolbarNode,
  onToggleMode,
}) => {
  const isPlaying = Boolean(media?.is_playing);
  const position = media?.position || 0;
  const duration = media?.duration || 0;

  const { activeLine, livePosition, liveDuration } = useLyricsSync(
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

  const totalDuration = liveDuration || duration;
  const progressPercent = useMemo(() => {
    if (!totalDuration || totalDuration <= 0) return 0;
    return Math.min(100, Math.max(0, (livePosition / totalDuration) * 100));
  }, [livePosition, totalDuration]);

  // Determine active lyric text to display
  const activeLyricText = useMemo(() => {
    if (!media?.title) return "Gili Mini Player";
    if (lyrics?.state === "loading") return "Memuat lirik...";
    if (lyrics?.state === "instrumental") return "♪ Lagu Instrumental ♪";
    if (lyrics?.state === "not_found") return "Lirik tidak ditemukan";
    if (activeLine?.text) return activeLine.text;
    if (lyrics?.lines && lyrics.lines.length > 0) return lyrics.lines[0].text;
    return "Lirik tidak tersedia";
  }, [media?.title, lyrics?.state, activeLine?.text, lyrics?.lines]);

  const containerStyle = useMemo(() => {
    return {
      backdropFilter: theme === "liquid" ? "blur(28px) saturate(180%)" : undefined,
      WebkitBackdropFilter: theme === "liquid" ? "blur(28px) saturate(180%)" : undefined,
    };
  }, [theme]);

  return (
    <div
      onDoubleClick={onToggleMode}
      className={`relative box-border w-[440px] text-white select-none rounded-[24px] shadow-none transition-[height] duration-200 ease-out p-[14px_16px_18px] overflow-hidden ${
        theme === "solid" ? "border border-white/[0.09]" : "border border-white/[0.16]"
      } ${showToolbar ? "h-[130px]" : "h-[88px]"}`}
      style={containerStyle}
    >
      <MiniPlayerBackground
        thumbnail={media?.thumbnail}
        tintColor={tintColor}
        theme={theme}
      />
      {/* Top Slot for Toolbar on Hover */}
      <div
        data-tauri-drag-region
        className={`w-full flex items-center transition-all duration-200 ease-out overflow-hidden ${
          showToolbar
            ? "opacity-100 max-h-10 mb-1.5 -mt-1 pointer-events-auto cursor-move"
            : "opacity-0 max-h-0 mb-0 -mt-0 pointer-events-none"
        }`}
      >
        {toolbarNode}
      </div>

      {/* Media Row: 56px Album Art + Title/Artist + Equalizer */}
      <div className="flex items-center gap-3 pointer-events-none">
        {/* Album Art: 56px, radius 12px */}
        <div
          role="img"
          aria-label="Sampul album"
          className="w-14 h-14 rounded-xl overflow-hidden bg-white/5 shrink-0 border border-white/10 flex items-center justify-center shadow-md"
        >
          {media?.thumbnail ? (
            <img
              src={media.thumbnail}
              alt={media.title || "Album Art"}
              className="w-full h-full object-cover select-none pointer-events-none"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/40 text-lg">
              🎵
            </div>
          )}
        </div>

        {/* Title, Artist, and Live Lyric */}
        <div className="min-w-0 flex-1">
          <div className="h-4 relative overflow-hidden flex items-center">
            <ScrollingText
              text={media?.title ? `${media.title} · ${media.artist || "Artis tidak diketahui"}` : "Gili Mini Player"}
              speed={24}
              pauseSeconds={2}
              align="left"
              className="w-full text-[11.5px] text-white/60 leading-tight"
            />
          </div>

          <div className="h-[22px] mt-[3px] relative overflow-hidden flex items-center">
            {prefersReducedMotion ? (
              <ScrollingText
                key={activeLyricText}
                text={activeLyricText}
                speed={28}
                pauseSeconds={1.5}
                align="left"
                className="w-full text-[13px] font-semibold text-white tracking-[-0.01em]"
              />
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={activeLyricText}
                  initial={{ opacity: 0, y: 10, filter: "blur(3px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(3px)" }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full h-full flex items-center absolute inset-0"
                  title={activeLyricText}
                >
                  <ScrollingText
                    text={activeLyricText}
                    speed={28}
                    pauseSeconds={1.5}
                    align="left"
                    className="w-full text-[13px] font-semibold text-white tracking-[-0.01em]"
                  />
                </motion.div>
              </AnimatePresence>
            )}
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
      <div
        role="progressbar"
        aria-label="Posisi lagu"
        aria-valuenow={Math.round(progressPercent)}
        className="absolute left-4 right-4 bottom-[9px] h-[3px] rounded-full bg-white/20 overflow-hidden pointer-events-none"
      >
        <div
          className="h-full bg-white transition-[width] duration-150 ease-linear rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};
