import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music2 } from "lucide-react";
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
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const anchorRef = useRef<{ time: number; timestamp: number }>({
    time: currentTime,
    timestamp: performance.now(),
  });
  const lastEmittedRef = useRef({ curr: "", prev: "", next: "" });

  // Re sync
  useEffect(() => {
    const now = performance.now();
    const estimatedTime = isPlaying
      ? anchorRef.current.time + (now - anchorRef.current.timestamp) / 1000
      : anchorRef.current.time;

    if (Math.abs(estimatedTime - currentTime) > 0.4 || !isPlaying) {
      anchorRef.current = { time: currentTime, timestamp: now };
    }
  }, [currentTime, isPlaying]);

  const [offset, setOffset] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("notch_lyrics_offset");
      return saved !== null ? parseFloat(saved) : 0.0;
    } catch {
      return 0.0;
    }
  });

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

  // Loop real time   
  useEffect(() => {
    if (!lyricsData?.synced || !lyricsData.lines.length) {
      setActiveIndex(-1);
      return;
    }

    let rafId: number;

    const tick = () => {
      const now = performance.now();
      const liveTime = isPlaying
        ? anchorRef.current.time + (now - anchorRef.current.timestamp) / 1000
        : anchorRef.current.time;
      const effectiveTime = liveTime + offset;

      const lines = lyricsData.lines;
      const idx = lines.findIndex(
        (line, i) =>
          effectiveTime >= line.time &&
          (i === lines.length - 1 || effectiveTime < lines[i + 1].time)
      );

      setActiveIndex((prev) => (prev !== idx ? idx : prev));

      if (isPlaying) {
        rafId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [lyricsData, isPlaying, offset]);

  const isInstrumental = lyricsData?.instrumental;
  const lines = lyricsData?.lines || [];
  const hasSyncedLyrics = lyricsData?.synced && lines.length > 0;

  const prevLine = isInstrumental
    ? artist || ""
    : hasSyncedLyrics && activeIndex > 0
    ? lines[activeIndex - 1]?.text || ""
    : activeIndex === -1 && lines.length > 0
    ? artist || ""
    : "";

  const currLine = isInstrumental
    ? t("lyrics_idle_instrumental")
    : hasSyncedLyrics && activeIndex >= 0
    ? lines[activeIndex]?.text || ""
    : songTitle || (isPlaying ? "♪ ♪ ♪" : "Paused");

  const nextLine = isInstrumental
    ? songTitle || ""
    : hasSyncedLyrics && activeIndex < lines.length - 1
    ? lines[activeIndex + 1]?.text || ""
    : activeIndex === -1 && lines.length > 0
    ? lines[0]?.text || ""
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

  if (isLoading) {
    return (
      <div
        className="w-full h-full flex items-center justify-between px-2.5 cursor-pointer select-none"
        onClick={onClick}
      >
        <div className="w-[28px] h-[28px] rounded-[8px] bg-neutral-900 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden relative shadow-sm">
          {media ? <MediaThumbnail media={media} /> : <Music2 size={13} className="text-white/60" />}
        </div>

        <div className="flex-1 flex items-center justify-center gap-1.5 text-white/50 animate-pulse text-[11px] font-medium min-w-0 px-2">
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
      className="w-full h-full flex items-center justify-between px-3.5 cursor-pointer select-none overflow-hidden relative group gap-2.5"
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

      {/* Center: 3-line synced lyrics with smooth karaoke motion */}
      <div className="flex-1 min-w-0 h-full flex flex-col justify-center px-1 overflow-hidden relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={activeIndex >= 0 ? activeIndex : currLine}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transitionEnd: { transform: "none" } }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="w-full flex flex-col items-center justify-center text-center gap-[1px]"
          >
            {/* Top Line: Previous lyric (Subtle muted) */}
            <span className={`${optFontSize === "small" ? "text-[9px] min-h-[12px]" : optFontSize === "large" ? "text-[11.5px] min-h-[15px]" : "text-[10px] min-h-[13px]"} block font-medium text-white/35 idle-lyrics-sub truncate w-full text-center leading-tight tracking-tight select-none`}>
              {prevLine || "\u00A0"}
            </span>

            {/* Middle Line: Active lyric (Bold, crisp) */}
            <div className="w-full flex items-center justify-center overflow-hidden select-none">
              <ScrollingText
                text={currLine}
                className={`${optFontSize === "small" ? "text-[11.5px]" : optFontSize === "large" ? "text-[15.5px]" : "text-[13px]"} font-bold text-white idle-lyrics-text tracking-tight leading-snug w-full text-center`}
              />
            </div>

            {/* Bottom Line: Next lyric (Subtle muted) */}
            <span className={`${optFontSize === "small" ? "text-[9px] min-h-[12px]" : optFontSize === "large" ? "text-[11.5px] min-h-[15px]" : "text-[10px] min-h-[13px]"} block font-medium text-white/40 idle-lyrics-sub truncate w-full text-center leading-tight tracking-tight select-none`}>
              {nextLine || "\u00A0"}
            </span>
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
