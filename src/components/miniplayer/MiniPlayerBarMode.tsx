import React, { useMemo, useEffect, useState } from "react";
import { MediaPayload, LyricsPayload } from "../../services/mediaLyricsStore";
import { useLyricsSync } from "./lyricsSync";
import {
  computeBarLyricLayout,
  findContextLineText,
  sanitizeLyricText,
} from "./lyricsLayout";
import { BarLyricSlot } from "./BarLyricSlot";
import { MiniPlayerEqualizer } from "./MiniPlayerEqualizer";
import { MiniPlayerProgressBar } from "./MiniPlayerProgressBar";
import { MediaThumbnail } from "../ui/MediaThumbnail";

export interface MiniPlayerBarModeProps {
  media: MediaPayload | null;
  lyrics: LyricsPayload | null;
  theme: "solid" | "liquid";
  tintColor: string;
  showToolbar: boolean;
  toolbarNode: React.ReactNode;
  onToggleMode?: () => void;
  onWidthChange?: (width: number) => void;
}

const BAR_WIDTH = 440;
const LYRIC_SLOT_WIDTH = 304;

export const MiniPlayerBarMode: React.FC<MiniPlayerBarModeProps> = ({
  media,
  lyrics,
  theme: _theme,
  tintColor: _tintColor,
  showToolbar,
  toolbarNode,
  onToggleMode,
  onWidthChange,
}) => {
  const isPlaying = Boolean(media?.is_playing);
  const position = media?.position || 0;
  const duration = media?.duration || 0;

  const { activeIndex, activeLine, livePosition, liveDuration, seekLocal } = useLyricsSync(
    lyrics,
    position,
    duration,
    isPlaying,
    lyrics?.offset || 0
  );

  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    onWidthChange?.(BAR_WIDTH);
  }, [onWidthChange]);

  const totalDuration = liveDuration || duration;
  const canSeek = Boolean(
    media?.title && totalDuration > 0 && media?.can_seek !== false
  );

  // Compute active text, context text, and line timestamps ONLY when active line or state changes
  const { activeText, contextText, currentLineTime, nextLineTime, lineKey } = useMemo(() => {
    const fallbackArtist = media?.artist || "Artis tidak diketahui";

    if (!media?.title) {
      return {
        activeText: "Gili Mini Player",
        contextText: "Menunggu pemutaran musik...",
        currentLineTime: null,
        nextLineTime: null,
        lineKey: "idle",
      };
    }

    if (lyrics?.state === "loading") {
      return {
        activeText: "Memuat lirik...",
        contextText: fallbackArtist,
        currentLineTime: null,
        nextLineTime: null,
        lineKey: "loading",
      };
    }

    if (lyrics?.state === "instrumental") {
      return {
        activeText: "♪ Lagu Instrumental ♪",
        contextText: fallbackArtist,
        currentLineTime: null,
        nextLineTime: null,
        lineKey: "instrumental",
      };
    }

    if (lyrics?.state === "not_found") {
      return {
        activeText: "Lirik tidak ditemukan",
        contextText: fallbackArtist,
        currentLineTime: null,
        nextLineTime: null,
        lineKey: "not_found",
      };
    }

    if (lyrics?.synced && lyrics.lines && lyrics.lines.length > 0) {
      const lines = lyrics.lines;
      if (activeIndex < 0) {
        const firstLine = sanitizeLyricText(lines[0]?.text) || fallbackArtist;
        return {
          activeText: "♪ •••",
          contextText: firstLine,
          currentLineTime: 0,
          nextLineTime: lines[0]?.time ?? null,
          lineKey: `intro-${lyrics.title}`,
        };
      }

      const rawActive = sanitizeLyricText(activeLine?.text);
      const effectiveActive = rawActive || "♪ •••";
      const ctx = findContextLineText(lines, activeIndex, fallbackArtist);
      const currTime = lines[activeIndex]?.time ?? null;
      const nextTime =
        activeIndex + 1 < lines.length ? lines[activeIndex + 1].time : (totalDuration || null);

      return {
        activeText: effectiveActive,
        contextText: ctx,
        currentLineTime: currTime,
        nextLineTime: nextTime,
        lineKey: `line-${activeIndex}-${currTime}`,
      };
    }

    if (lyrics?.plain_lyrics) {
      const plainLines = lyrics.plain_lyrics
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      return {
        activeText: plainLines[0] || media.title,
        contextText: plainLines[1] || fallbackArtist,
        currentLineTime: null,
        nextLineTime: null,
        lineKey: `plain-${lyrics.title}`,
      };
    }

    return {
      activeText: "Lirik tidak tersedia",
      contextText: fallbackArtist,
      currentLineTime: null,
      nextLineTime: null,
      lineKey: "empty",
    };
  }, [
    media?.title,
    media?.artist,
    lyrics?.state,
    lyrics?.synced,
    lyrics?.lines,
    lyrics?.plain_lyrics,
    lyrics?.title,
    activeIndex,
    activeLine?.text,
    totalDuration,
  ]);

  // Recalculate layout only when line changes or reduced-motion toggles
  const lyricLayout = useMemo(() => {
    return computeBarLyricLayout({
      activeText,
      contextText,
      slotWidth: LYRIC_SLOT_WIDTH,
      prefersReducedMotion,
    });
  }, [activeText, contextText, prefersReducedMotion]);

  const titleArtistText = media?.title
    ? `${media.title} · ${media.artist || "Artis tidak diketahui"}`
    : "Gili Mini Player";

  return (
    <div
      onDoubleClick={onToggleMode}
      className="relative box-border w-[440px] h-full text-white select-none p-[14px_16px_18px] flex flex-col justify-end overflow-hidden"
    >
      {/* Top Slot for Toolbar on Hover */}
      <div
        data-tauri-drag-region
        className={`w-full shrink-0 flex items-center overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          showToolbar
            ? "opacity-100 h-[36px] mb-[6px] pointer-events-auto cursor-move"
            : "opacity-0 h-0 mb-0 pointer-events-none"
        }`}
      >
        {toolbarNode}
      </div>

      {/* Media Row: 56px Album Art + Left-Aligned Title/Lyrics + Equalizer */}
      <div className="flex items-center gap-3 h-14 shrink-0 pointer-events-none">
        {/* Album Art: 56px, radius 12px */}
        <div
          role="img"
          aria-label="Sampul album"
          className="w-14 h-14 rounded-xl overflow-hidden bg-white/5 shrink-0 border border-white/10 flex items-center justify-center shadow-md"
        >
          {media && (media.title || media.artist) ? (
            <MediaThumbnail media={media} />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/40 text-lg">
              🎵
            </div>
          )}
        </div>

        {/* Left-Aligned Title/Artist + Fixed 2-Line Lyric Slot */}
        <div className="min-w-0 flex-1 h-14 flex flex-col justify-between items-start text-start">
          <div
            dir="auto"
            className="w-full h-4 flex items-center text-[11.5px] text-white/60 leading-none truncate text-start"
            title={titleArtistText}
          >
            {titleArtistText}
          </div>

          <BarLyricSlot
            lineKey={lineKey}
            layout={lyricLayout}
            currentLineTime={currentLineTime}
            nextLineTime={nextLineTime}
            isPlaying={isPlaying}
            prefersReducedMotion={prefersReducedMotion}
          />
        </div>

        {/* Right: Equalizer 5 bars (Blue #3B9DF8) */}
        <MiniPlayerEqualizer isPlaying={isPlaying} />
      </div>

      {/* Bottom: Interactive Adjustable Progress Bar */}
      <MiniPlayerProgressBar
        variant="bar"
        position={livePosition}
        duration={totalDuration}
        canSeek={canSeek}
        prefersReducedMotion={prefersReducedMotion}
        onSeek={seekLocal}
      />
    </div>
  );
};
