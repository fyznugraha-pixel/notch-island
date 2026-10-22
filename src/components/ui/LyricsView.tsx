import React, { useEffect, useRef, useState } from "react";
import { Music } from "lucide-react";
import { LyricsData } from "../../services/lyricsService";
import { t } from "../../services/i18n";

export interface LyricsViewProps {
  lyrics: LyricsData | null;
  isLoading: boolean;
  currentTime: number;
  isPlaying?: boolean;
  onSeek?: (time: number) => void;
  songTitle?: string;
  artist?: string;
}

export const LyricsView = React.memo<LyricsViewProps>(({
  lyrics,
  isLoading,
  currentTime,
  isPlaying = false,
  onSeek,
  songTitle,
  artist,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const lastActiveIndexRef = useRef<number>(-1);

  // Sync offset calibration (default 0.0s)
  const [offset, setOffset] = useState<number>(() => {
    const saved = localStorage.getItem("notch_lyrics_offset");
    return saved !== null ? parseFloat(saved) : 0.0;
  });

  const handleOffsetChange = (delta: number) => {
    setOffset((prev) => {
      const next = Math.round((prev + delta) * 10) / 10;
      const clamped = Math.max(-5, Math.min(5, next));
      localStorage.setItem("notch_lyrics_offset", clamped.toString());
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("notch_lyrics_offset_changed", { detail: clamped }));
      }
      return clamped;
    });
  };

  const handleResetOffset = () => {
    const defaultVal = 0.0;
    setOffset(defaultVal);
    localStorage.setItem("notch_lyrics_offset", defaultVal.toString());
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("notch_lyrics_offset_changed", { detail: defaultVal }));
    }
  };

  // High-precision live time tracking
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const anchorRef = useRef<{ time: number; timestamp: number }>({
    time: currentTime,
    timestamp: performance.now(),
  });

  // Re-sync anchor when currentTime from SMTC updates or isPlaying toggles
  useEffect(() => {
    const now = performance.now();
    const estimatedTime = isPlaying
      ? anchorRef.current.time + (now - anchorRef.current.timestamp) / 1000
      : anchorRef.current.time;

    // Resync immediately if drift is noticeable (>0.4s), or if paused / seeked
    if (Math.abs(estimatedTime - currentTime) > 0.4 || !isPlaying) {
      anchorRef.current = { time: currentTime, timestamp: now };
    }
  }, [currentTime, isPlaying]);

  // Real-time animation loop for zero-delay line transitions
  useEffect(() => {
    if (!lyrics?.synced || !lyrics.lines.length) {
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

      const lines = lyrics.lines;
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
  }, [lyrics, isPlaying, offset]);

  // Reset active line and scroll position when lyrics change to a new track
  useEffect(() => {
    lastActiveIndexRef.current = -1;
    setActiveIndex(-1);
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0 });
    }
  }, [lyrics]);

  // Auto-scroll when active line changes - ONLY scrolls the lyrics container, never ancestors
  useEffect(() => {
    if (activeIndex !== -1 && activeIndex !== lastActiveIndexRef.current) {
      lastActiveIndexRef.current = activeIndex;
      if (containerRef.current && activeLineRef.current) {
        const container = containerRef.current;
        const line = activeLineRef.current;
        const containerRect = container.getBoundingClientRect();
        const lineRect = line.getBoundingClientRect();
        const targetScrollTop =
          container.scrollTop +
          (lineRect.top - containerRect.top) -
          (containerRect.height / 2) +
          (lineRect.height / 2);

        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth",
        });
      }
    }
  }, [activeIndex]);

  return (
    <div className="relative w-full h-full flex flex-col select-none overflow-hidden">
      {/* Top Header: Floating, spacious, crisp and fully visible */}
      <div className="flex items-center justify-between py-2 px-2 shrink-0 z-30">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-white/80 uppercase tracking-widest leading-normal">
            {t("lyrics_title")}
          </span>
          {lyrics?.synced && (
            <span className="text-[9.5px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold tracking-wider border border-blue-400/25 shadow-sm leading-normal">
              {t("lyrics_live_sync")}
            </span>
          )}
        </div>

        {/* Sync Offset Calibration */}
        {lyrics?.synced && (
          <div className="flex items-center gap-1 bg-white/[0.06] hover:bg-white/[0.09] border border-white/10 rounded-full px-2 py-0.5 text-[10px] text-white/70 transition-colors">
            <button
              onClick={() => handleOffsetChange(-0.2)}
              title={t("lyrics_advance")}
              className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/15 text-white/60 hover:text-white transition-colors font-mono font-bold leading-none cursor-pointer"
            >
              -
            </button>
            <button
              onClick={handleResetOffset}
              title={t("lyrics_reset_offset")}
              className="px-1 font-mono text-[9.5px] font-medium text-white/80 hover:text-blue-300 transition-colors cursor-pointer"
            >
              {offset === 0 ? "0.0s" : `${offset > 0 ? "+" : ""}${offset.toFixed(1)}s`}
            </button>
            <button
              onClick={() => handleOffsetChange(0.2)}
              title={t("lyrics_delay")}
              className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/15 text-white/60 hover:text-white transition-colors font-mono font-bold leading-none cursor-pointer"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area with CSS Mask so scrolling text fades gracefully at top and bottom */}
      <div
        ref={containerRef}
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0%, black 14%, black 72%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 14%, black 72%, transparent 100%)",
        }}
        className="flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-2 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden relative z-10 touch-pan-y"
      >
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-white/40 py-8">
            <div className="w-5 h-5 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
            <span className="text-xs font-medium tracking-tight">{t("lyrics_searching")}</span>
          </div>
        ) : lyrics?.instrumental ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-white/50 text-center px-4 py-8">
            <Music size={22} className="text-blue-400/80 animate-pulse" />
            <span className="text-xs font-semibold text-white/80">{t("lyrics_instrumental")}</span>
            <span className="text-[11px] text-white/40">{t("lyrics_instrumental_sub")}</span>
          </div>
        ) : !lyrics || (!lyrics.lines.length && !lyrics.plainLyrics) ? (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-white/40 text-center px-3 py-8">
            <span className="text-xs font-medium">{t("lyrics_not_found")}</span>
            <span className="text-[11px] text-white/30 truncate max-w-[200px]">
              {songTitle || artist || "..."}
            </span>
          </div>
        ) : lyrics.synced ? (
          /* Synced Lyrics with interactive time jumping */
          <div className="flex flex-col space-y-3 py-6">
            {lyrics.lines.map((line, index) => {
              const isActive = index === activeIndex;
              return (
                <div
                  key={`${index}-${line.time}`}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => {
                    onSeek?.(line.time);
                    anchorRef.current = { time: line.time, timestamp: performance.now() };
                    setActiveIndex(index);
                  }}
                  className={`cursor-pointer transition-all duration-300 transform origin-left rounded px-1 py-0.5 select-none ${
                    isActive
                      ? "text-white font-bold text-[14.5px] leading-snug scale-[1.02]"
                      : "text-white/30 font-medium text-[12.5px] leading-snug hover:text-white/70 hover:scale-[1.01]"
                  }`}
                  style={isActive ? { textShadow: "0 0 16px rgba(255,255,255,0.4)" } : undefined}
                >
                  {line.text || "•••"}
                </div>
              );
            })}
          </div>
        ) : (
          /* Plain Lyrics */
          <div className="flex flex-col space-y-2 py-4">
            {lyrics.lines.map((line, index) => (
              <p
                key={index}
                className="text-[12.5px] font-medium leading-relaxed text-white/60 hover:text-white/80 transition-colors"
              >
                {line.text}
              </p>
            ))}
          </div>
        )}
      </div>

    </div>
  );
});
