import React, { useMemo, useEffect } from "react";
import { MediaPayload, LyricsPayload } from "../../services/mediaLyricsStore";
import { useLyricsSync, BASE_LYRICS_OFFSET } from "./lyricsSync";
import type { LyricLine } from "../../services/lyrics/types";
import { usePrefersReducedMotion } from "../ui/WordFillLyricsLine";
import {
  computeBarLyricLayout,
  findContextLineText,
  sanitizeLyricText,
} from "./lyricsLayout";
import { BarLyricSlot } from "./BarLyricSlot";
import { MiniPlayerEqualizer } from "./MiniPlayerEqualizer";
import { MiniPlayerProgressBar } from "./MiniPlayerProgressBar";
import { MediaThumbnail } from "../ui/MediaThumbnail";
import { ScrollingText } from "../ui/ScrollingText";
import { Tooltip } from "../ui/Tooltip";
import { useTaskbarLang, tx } from "../../services/taskbarI18n";

export interface MiniPlayerBarModeProps {
  media: MediaPayload | null;
  lyrics: LyricsPayload | null;
  theme: "solid" | "liquid";
  tintColor: string;
  showToolbar: boolean;
  toolbarNode: React.ReactNode;
  effectiveScale?: number;
  isHidden?: boolean;
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
  effectiveScale = 1.0,
  isHidden = false,
  onToggleMode,
  onWidthChange,
}) => {
  const isPlaying = Boolean(media?.is_playing);
  const position = media?.position || 0;
  const duration = media?.duration || 0;

  const currentBarWidth = BAR_WIDTH;
  const currentSlotWidth = LYRIC_SLOT_WIDTH;

  const offset =
    typeof lyrics?.offset === "number"
      ? lyrics.offset
      : parseFloat(localStorage.getItem("notch_lyrics_offset") || "0") || 0;

  const { activeIndex, activeLine, livePosition, liveDuration, seekLocal } = useLyricsSync(
    lyrics,
    position,
    duration,
    isPlaying,
    offset,
    isHidden
  );

  const prefersReducedMotion = usePrefersReducedMotion();
  const effectivePosition = livePosition + offset + BASE_LYRICS_OFFSET;

  useEffect(() => {
    onWidthChange?.(currentBarWidth);
  }, [onWidthChange, currentBarWidth]);

  const totalDuration = liveDuration || duration;
  const canSeek = Boolean(
    media?.title && totalDuration > 0 && media?.can_seek !== false
  );

  const lang = useTaskbarLang();

  // Compute active text, context text, and line timestamps ONLY when active line or state changes
  const { activeText, contextText, currentLineTime, nextLineTime, lineKey } = useMemo(() => {
    const fallbackArtist = media?.artist || tx(lang, "Unknown artist", "Artis tidak diketahui");

    if (!media?.title) {
      return {
        activeText: "Gili Mini Player",
        contextText: tx(lang, "Waiting for music playback...", "Menunggu pemutaran musik..."),
        currentLineTime: null,
        nextLineTime: null,
        lineKey: "idle",
      };
    }

    if (lyrics?.state === "loading") {
      return {
        activeText: tx(lang, "Loading lyrics...", "Memuat lirik..."),
        contextText: fallbackArtist,
        currentLineTime: null,
        nextLineTime: null,
        lineKey: "loading",
      };
    }

    if (lyrics?.state === "instrumental") {
      return {
        activeText: tx(lang, "♪ Instrumental Track ♪", "♪ Lagu Instrumental ♪"),
        contextText: fallbackArtist,
        currentLineTime: null,
        nextLineTime: null,
        lineKey: "instrumental",
      };
    }

    if (lyrics?.state === "not_found") {
      return {
        activeText: tx(lang, "Lyrics not found", "Lirik tidak ditemukan"),
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
      activeText: tx(lang, "Lyrics unavailable", "Lirik tidak tersedia"),
      contextText: fallbackArtist,
      currentLineTime: null,
      nextLineTime: null,
      lineKey: "empty",
    };
  }, [
    lang,
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
      slotWidth: currentSlotWidth,
      prefersReducedMotion,
      scale: effectiveScale,
    });
  }, [activeText, contextText, prefersReducedMotion, currentSlotWidth, effectiveScale]);

  const activeLyricLine = useMemo<LyricLine | null>(() => {
    if (!lyrics?.synced || activeIndex < 0 || !activeLine) return null;
    const cleaned = sanitizeLyricText(activeLine.text);
    if (!cleaned) return null;
    return cleaned === activeLine.text
      ? activeLine
      : { ...activeLine, text: cleaned };
  }, [lyrics?.synced, activeIndex, activeLine]);

  const titleArtistText = media?.title
    ? `${media.title} · ${media.artist || tx(lang, "Unknown artist", "Artis tidak diketahui")}`
    : "Gili Mini Player";

  return (
    <div
      onDoubleClick={onToggleMode}
      className="relative box-border w-full h-full text-white select-none p-[14px_16px_18px] flex flex-col justify-end overflow-hidden"
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
      <div className="flex items-center gap-3 min-h-14 h-auto flex-1 shrink-0 pointer-events-none">
        {/* Album Art: 56px, radius 12px */}
        <div
          role="img"
          aria-label={tx(lang, "Album art", "Sampul album")}
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
        <div className="min-w-0 flex-1 min-h-14 flex flex-col justify-between items-start overflow-hidden text-start">
          <Tooltip
            content={titleArtistText}
            allowFlip
            wrapperClassName="w-full min-w-0 justify-start"
          >
            <div
              dir="auto"
              className="w-full h-4 flex items-center overflow-hidden text-start"
            >
              <ScrollingText
                text={titleArtistText}
                className="text-[11.5px] text-white/60 leading-none w-full"
              />
            </div>
          </Tooltip>

          <BarLyricSlot
            lineKey={lineKey}
            layout={lyricLayout}
            activeLyricLine={activeLyricLine}
            effectivePosition={effectivePosition}
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
