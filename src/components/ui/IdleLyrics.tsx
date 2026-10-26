import React, { useEffect, useRef, useState, useCallback } from "react";
import { Music2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LyricsData } from "../../services/lyricsService";
import { t } from "../../services/i18n";
import { MediaPayload } from "../../types";
import { MediaThumbnail } from "./MediaThumbnail";
import { AudioVisualizer } from "./AudioVisualizer";
import { ScrollingText } from "./ScrollingText";

export interface IdleLyricsProps {
  lyricsData: LyricsData | null;
  currentTime: number;
  isPlaying: boolean;
  songTitle?: string;
  artist?: string;
  media?: MediaPayload | null;
  optAccent?: string;
  optFontSize?: "small" | "default" | "large";
  isLoading?: boolean;
  onActiveLineChange?: (current: string, prev: string, next: string) => void;
  onTogglePlay?: () => void;
  onClick?: () => void;
}

const computeActiveIndex = (
  time: number,
  lyrics: LyricsData | null,
  timeOffset: number
): number => {
  if (!lyrics?.synced || !lyrics.lines.length) return -1;
  const lines = lyrics.lines;
  const safeOffset = typeof timeOffset === "number" && !isNaN(timeOffset) ? timeOffset : 0;
  const effectiveTime = time + safeOffset;
  return lines.findIndex(
    (line, i) =>
      effectiveTime >= line.time &&
      (i === lines.length - 1 || effectiveTime < lines[i + 1].time)
  );
};

export const IdleLyrics: React.FC<IdleLyricsProps> = ({
  lyricsData,
  currentTime,
  isPlaying,
  songTitle,
  artist,
  media,
  optAccent,
  optFontSize = "default",
  isLoading = false,
  onActiveLineChange,
  onTogglePlay,
  onClick,
}) => {
  const safeTime = typeof currentTime === "number" && !isNaN(currentTime) ? currentTime : 0;

  const [offset, setOffset] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("notch_lyrics_offset");
      return saved !== null ? parseFloat(saved) : 0.0;
    } catch {
      return 0.0;
    }
  });

  // Calculate the active index immediately on initial mount so it never flashes top/title
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    computeActiveIndex(safeTime, lyricsData, offset)
  );

  const anchorRef = useRef<{ time: number; timestamp: number }>({
    time: safeTime,
    timestamp: performance.now(),
  });
  const lastEmittedRef = useRef({ curr: "", prev: "", next: "" });

  const tick = useCallback(() => {
    if (!lyricsData?.synced || !lyricsData.lines.length) {
      setActiveIndex(-1);
      return;
    }

    const now = performance.now();
    const liveTime = isPlaying
      ? anchorRef.current.time + (now - anchorRef.current.timestamp) / 1000
      : anchorRef.current.time;

    const idx = computeActiveIndex(liveTime, lyricsData, offset);
    setActiveIndex((prev) => (prev !== idx ? idx : prev));
  }, [lyricsData, isPlaying, offset]);

  // Re-sync anchor when currentTime from SMTC updates or isPlaying toggles
  useEffect(() => {
    const now = performance.now();
    const estimatedTime = isPlaying
      ? anchorRef.current.time + (now - anchorRef.current.timestamp) / 1000
      : anchorRef.current.time;

    if (Math.abs(estimatedTime - safeTime) > 0.35 || !isPlaying) {
      anchorRef.current = { time: safeTime, timestamp: now };
    }
    tick();
  }, [safeTime, isPlaying, tick]);

  // When lyrics track changes, immediately jump to current line
  useEffect(() => {
    setActiveIndex(computeActiveIndex(safeTime, lyricsData, offset));
  }, [lyricsData]);

  // Sync offset calibration from custom events
  useEffect(() => {
    const handleOffsetEvent = (e: any) => {
      if (e?.detail !== undefined && typeof e.detail === "number") {
        setOffset(e.detail);
      } else {
        try {
          const saved = localStorage.getItem("notch_lyrics_offset");
          setOffset(saved !== null ? parseFloat(saved) : 0.0);
        } catch {
          setOffset(0.0);
        }
      }
    };
    window.addEventListener("notch_lyrics_offset_changed", handleOffsetEvent);
    return () => window.removeEventListener("notch_lyrics_offset_changed", handleOffsetEvent);
  }, []);

  // 100ms interval for smooth live sync
  useEffect(() => {
    if (!lyricsData?.synced || !lyricsData.lines.length) {
      setActiveIndex(-1);
      return;
    }

    tick();

    if (!isPlaying) return;
    const intervalId = window.setInterval(tick, 100);
    return () => window.clearInterval(intervalId);
  }, [lyricsData, isPlaying, offset, tick]);

  const isInstrumental = lyricsData?.instrumental;
  const lines = lyricsData?.lines || [];
  const hasSyncedLyrics = lyricsData?.synced && lines.length > 0;

  const prevLine = isInstrumental
    ? artist || ""
    : hasSyncedLyrics && activeIndex > 0
    ? lines[activeIndex - 1]?.text?.trim() || ""
    : "";

  const currLine = isInstrumental
    ? t("lyrics_idle_instrumental")
    : hasSyncedLyrics && activeIndex >= 0
    ? lines[activeIndex]?.text?.trim() || "•••"
    : songTitle || (isPlaying ? "♪ ♪ ♪" : "Paused");

  const nextLine = isInstrumental
    ? songTitle || ""
    : hasSyncedLyrics && activeIndex < lines.length - 1
    ? lines[activeIndex + 1]?.text?.trim() || ""
    : activeIndex === -1 && lines.length > 0
    ? lines[0]?.text?.trim() || ""
    : "";

  // Notify parent of line updates for auto-layout width calculation
  useEffect(() => {
    if (!onActiveLineChange) return;
    if (
      lastEmittedRef.current.curr === currLine &&
      lastEmittedRef.current.prev === prevLine &&
      lastEmittedRef.current.next === nextLine
    ) {
      return;
    }
    lastEmittedRef.current = { curr: currLine, prev: prevLine, next: nextLine };
    onActiveLineChange(currLine, prevLine, nextLine);
  }, [currLine, prevLine, nextLine, onActiveLineChange]);

  const activeFontClass =
    optFontSize === "small"
      ? "text-[11.5px]"
      : optFontSize === "large"
      ? "text-[15px]"
      : "text-[13px]";

  const inactiveFontClass =
    optFontSize === "small"
      ? "text-[9px]"
      : optFontSize === "large"
      ? "text-[11px]"
      : "text-[9.5px]";

  if (isLoading) {
    return (
      <div
        className="w-full h-full flex items-center justify-between px-2.5 cursor-pointer select-none gap-2"
        onClick={onClick}
      >
        <div className="w-[28px] h-[28px] rounded-[8px] bg-neutral-900 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden relative shadow-sm">
          {media ? <MediaThumbnail media={media} /> : <Music2 size={13} className="text-white/60" />}
        </div>

        <div className="flex-1 flex items-center justify-center gap-1.5 text-white/50 animate-pulse text-[11px] font-medium min-w-0 px-1">
          <Music2 size={12} className="text-white/60 shrink-0" />
          <span className="truncate">{t("lyrics_searching")}</span>
        </div>

        <div className="flex items-center shrink-0">
          <AudioVisualizer isPlaying={isPlaying} onToggle={onTogglePlay || (() => {})} optAccent={optAccent} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex items-center justify-between px-2.5 cursor-pointer select-none overflow-hidden relative group gap-2"
      onClick={onClick}
    >
      {/* Left: Mini Album Art / App Icon */}
      <div className="w-[32px] h-[32px] rounded-[9px] bg-neutral-900 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden relative shadow-sm group-hover:scale-105 transition-transform duration-200">
        {media ? (
          <MediaThumbnail media={media} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/10 text-white/60">
            <Music2 size={14} />
          </div>
        )}
      </div>

      {/* Center: Exactly 3 lines (previous, active synced in middle, next) */}
      <div className="flex-1 min-w-0 h-full flex flex-col justify-center items-center overflow-hidden relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={hasSyncedLyrics ? `line-${activeIndex}` : `track-${songTitle}-${currLine}`}
            initial={{ opacity: 0.85, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full flex flex-col justify-center items-center select-none pointer-events-none gap-[2px]"
          >
            {/* Top Line: Previous Lyric */}
            <div className="w-full h-[11px] flex items-center justify-center overflow-hidden">
              <span
                className={`${inactiveFontClass} font-medium text-white/35 truncate w-full text-center leading-none`}
              >
                {prevLine || "\u00A0"}
              </span>
            </div>

            {/* Middle Line: Synced Active Lyric (Centered, Bold, Highlighted) */}
            <div className="w-full h-[17px] flex items-center justify-center overflow-hidden">
              <ScrollingText
                text={currLine}
                className={`${activeFontClass} font-bold text-white tracking-tight leading-none w-full text-center`}
              />
            </div>

            {/* Bottom Line: Next Lyric */}
            <div className="w-full h-[11px] flex items-center justify-center overflow-hidden">
              <span
                className={`${inactiveFontClass} font-medium text-white/35 truncate w-full text-center leading-none`}
              >
                {nextLine || "\u00A0"}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Right: Audio Visualizer */}
      <div className="flex items-center shrink-0">
        <AudioVisualizer isPlaying={isPlaying} onToggle={onTogglePlay || (() => {})} optAccent={optAccent} />
      </div>
    </div>
  );
};
