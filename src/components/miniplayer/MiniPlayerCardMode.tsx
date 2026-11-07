import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MediaPayload, LyricsPayload } from "../../services/mediaLyricsStore";
import { useLyricsSync } from "./lyricsSync";
import { MiniPlayerBackground } from "./MiniPlayerBackground";
import { MiniPlayerEqualizer } from "./MiniPlayerEqualizer";
import { MiniPlayerProgressBar } from "./MiniPlayerProgressBar";
import {
  sanitizeLyricText,
  clampExtremeText,
  preventOrphanWord,
} from "./lyricsLayout";

export interface MiniPlayerCardModeProps {
  media: MediaPayload | null;
  lyrics: LyricsPayload | null;
  theme: "solid" | "liquid";
  tintColor: string;
  showToolbar: boolean;
  toolbarNode: React.ReactNode;
  onToggleMode?: () => void;
}

const MANUAL_SCROLL_HOLD_MS = 3000;

export const MiniPlayerCardMode: React.FC<MiniPlayerCardModeProps> = ({
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
  const offset = lyrics?.offset || 0;

  const { activeIndex, livePosition, liveDuration, seekLocal } = useLyricsSync(
    lyrics,
    position,
    duration,
    isPlaying,
    offset
  );

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const totalDuration = liveDuration || duration;
  const canSeek = Boolean(
    media?.title && totalDuration > 0 && media?.can_seek !== false
  );

  const containerStyle = useMemo(() => {
    return {
      backdropFilter: theme === "liquid" ? "blur(28px) saturate(180%)" : undefined,
      WebkitBackdropFilter: theme === "liquid" ? "blur(28px) saturate(180%)" : undefined,
    };
  }, [theme]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const plainRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [autoTranslateY, setAutoTranslateY] = useState<number>(0);
  const [manualTranslateY, setManualTranslateY] = useState<number>(0);
  const [isManualScrolling, setIsManualScrolling] = useState<boolean>(false);
  const [plainTranslateY, setPlainTranslateY] = useState<number>(0);
  const manualTimeoutRef = useRef<number | null>(null);

  const computeCenteredTranslateY = useCallback((index: number): number => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return 0;

    const viewportH = viewport.clientHeight;
    const targetIdx = index >= 0 ? index : 0;
    const activeEl = lineRefs.current[targetIdx];
    if (!activeEl) return 0;

    const lineCenter = activeEl.offsetTop + activeEl.offsetHeight / 2;
    return Math.round(viewportH / 2 - lineCenter);
  }, []);

  // Recalculate centered transform when activeIndex or lyrics lines change
  useEffect(() => {
    const nextY = computeCenteredTranslateY(activeIndex);
    setAutoTranslateY(nextY);
    if (!isManualScrolling) {
      setManualTranslateY(nextY);
    }
  }, [activeIndex, lyrics?.lines, computeCenteredTranslateY, isManualScrolling]);

  // Reset scroll state when track changes
  useEffect(() => {
    setIsManualScrolling(false);
    setPlainTranslateY(0);
    if (manualTimeoutRef.current) {
      window.clearTimeout(manualTimeoutRef.current);
      manualTimeoutRef.current = null;
    }
    const initialY = computeCenteredTranslateY(activeIndex);
    setAutoTranslateY(initialY);
    setManualTranslateY(initialY);
  }, [lyrics?.title, lyrics?.artist]);

  useEffect(() => {
    return () => {
      if (manualTimeoutRef.current) {
        window.clearTimeout(manualTimeoutRef.current);
      }
    };
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const viewportH = viewport.clientHeight;

      if (lyrics?.plain_lyrics && (!lyrics.synced || lyrics.lines.length === 0)) {
        const plainEl = plainRef.current;
        if (!plainEl) return;
        const contentH = plainEl.offsetHeight;
        const minPlainY = Math.min(0, viewportH - contentH - 16);
        setPlainTranslateY((prev) =>
          Math.max(minPlainY, Math.min(0, Math.round(prev - e.deltaY * 0.75)))
        );
        return;
      }

      if (!lyrics?.synced || !lyrics.lines.length) return;
      const list = listRef.current;
      if (!list) return;

      const listH = list.offsetHeight;
      const minY = Math.min(0, Math.round(viewportH / 2 - listH + 24));
      const maxY = Math.round(viewportH / 2 - 16);

      setIsManualScrolling(true);
      setManualTranslateY((prev) => {
        const base = isManualScrolling ? prev : autoTranslateY;
        return Math.max(minY, Math.min(maxY, Math.round(base - e.deltaY * 0.75)));
      });

      if (manualTimeoutRef.current) {
        window.clearTimeout(manualTimeoutRef.current);
      }
      manualTimeoutRef.current = window.setTimeout(() => {
        setIsManualScrolling(false);
        manualTimeoutRef.current = null;
      }, MANUAL_SCROLL_HOLD_MS);
    },
    [
      lyrics?.plain_lyrics,
      lyrics?.synced,
      lyrics?.lines?.length,
      isManualScrolling,
      autoTranslateY,
    ]
  );

  const handleLineClick = useCallback(
    async (e: React.MouseEvent, lineTime: number) => {
      e.stopPropagation();
      if (!canSeek) return;

      setIsManualScrolling(false);
      if (manualTimeoutRef.current) {
        window.clearTimeout(manualTimeoutRef.current);
        manualTimeoutRef.current = null;
      }
      seekLocal(lineTime);
      try {
        await invoke("smtc_seek", { positionSec: lineTime });
      } catch {}
    },
    [canSeek, seekLocal]
  );

  const currentTranslateY = isManualScrolling ? manualTranslateY : autoTranslateY;
  const effectivePosition = livePosition - offset;

  return (
    <div
      onDoubleClick={onToggleMode}
      className={`relative box-border w-[380px] text-white select-none rounded-[28px] p-[14px_18px_20px] flex flex-col justify-end overflow-hidden shadow-none transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        theme === "solid" ? "border border-white/[0.09]" : "border border-white/[0.16]"
      } ${showToolbar ? "h-[340px]" : "h-[298px]"}`}
      style={containerStyle}
    >
      <MiniPlayerBackground
        thumbnail={media?.thumbnail}
        tintColor={tintColor}
        theme={theme}
      />

      {/* Top Slot for Toolbar on Hover (expands upward just like Bar Mode) */}
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

      {/* Header: 60px Album Art + Title/Artist + Equalizer */}
      <div className="flex items-center gap-3.5 h-[60px] shrink-0 pointer-events-none">
        <div
          role="img"
          aria-label="Sampul album"
          className="w-[60px] h-[60px] rounded-[13px] overflow-hidden bg-white/5 shrink-0 shadow-lg border border-white/10 flex items-center justify-center"
        >
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

        <div className="flex flex-col min-w-0 flex-1 text-start" dir="auto">
          <span
            className="text-[15px] font-semibold text-white truncate leading-snug tracking-[-0.01em]"
            title={media?.title || "Gili Mini Player"}
          >
            {media?.title || "Gili Mini Player"}
          </span>
          <span
            className="text-[12px] text-white/60 truncate leading-snug mt-[3px]"
            title={media?.artist || "Belum ada media aktif"}
          >
            {media?.artist || "Belum ada media aktif"}
          </span>
        </div>

        {/* Right: Equalizer 5 bars (Blue #3B9DF8) */}
        <MiniPlayerEqualizer isPlaying={isPlaying} />
      </div>

      {/* Fixed-Height Lyric Slot Viewport (transform-driven scroll, zero CLS) */}
      <div
        ref={viewportRef}
        onWheel={handleWheel}
        data-no-drag
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)",
        }}
        className="h-[196px] min-h-[196px] max-h-[196px] mt-[8px] shrink-0 overflow-hidden relative select-none"
      >
        {lyrics?.state === "loading" ? (
          <div
            dir="auto"
            className="h-full flex items-center justify-start gap-2.5 text-white/55 text-[13.5px] text-start"
          >
            <div className="w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin shrink-0" />
            <span>Memuat lirik...</span>
          </div>
        ) : lyrics?.state === "instrumental" ? (
          <div
            dir="auto"
            className="h-full flex items-center justify-start text-start text-white/65 text-[14.5px] font-medium"
          >
            ♪ Lagu Instrumental
          </div>
        ) : lyrics?.state === "not_found" ? (
          <div
            dir="auto"
            className="h-full flex items-center justify-start text-start text-white/50 text-[13.5px]"
          >
            Lirik tidak ditemukan
          </div>
        ) : lyrics?.synced && lyrics.lines && lyrics.lines.length > 0 ? (
          <div
            ref={listRef}
            style={{
              transform: `translate3d(0, ${currentTranslateY}px, 0)`,
              transition:
                prefersReducedMotion || isManualScrolling
                  ? "none"
                  : "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: "transform",
            }}
            className="flex flex-col items-start w-full py-2"
          >
            {lyrics.lines.map((line, index) => {
              const effectiveIdx = activeIndex >= 0 ? activeIndex : 0;
              const distance = Math.abs(index - effectiveIdx);
              const isActive = index === activeIndex;

              const lineOpacity = isActive
                ? 1
                : distance === 1
                ? 0.55
                : distance === 2
                ? 0.3
                : 0.16;

              const lineScale = prefersReducedMotion
                ? 1
                : isActive
                ? 1
                : distance === 1
                ? 0.97
                : distance === 2
                ? 0.95
                : 0.93;

              const cleaned = sanitizeLyricText(line.text);
              const displayLine = cleaned
                ? preventOrphanWord(clampExtremeText(cleaned, 200))
                : "♪ •••";

              return (
                <div
                  key={`${index}-${line.time}`}
                  ref={(el) => {
                    lineRefs.current[index] = el;
                  }}
                  dir="auto"
                  onClick={(e) => handleLineClick(e, line.time)}
                  style={{
                    opacity: lineOpacity,
                    transform: `scale(${lineScale})`,
                    transformOrigin: "left center",
                    transition: prefersReducedMotion
                      ? "none"
                      : "transform 270ms cubic-bezier(0.22, 1, 0.36, 1), opacity 270ms cubic-bezier(0.22, 1, 0.36, 1)",
                    textWrap: "balance",
                    textShadow: isActive
                      ? "0 1px 10px rgba(0, 0, 0, 0.45)"
                      : "0 1px 4px rgba(0, 0, 0, 0.3)",
                  }}
                  className={`w-full py-[5px] pr-2 text-start select-none line-clamp-3 break-words ${
                    canSeek ? "cursor-pointer hover:opacity-90" : "cursor-default"
                  } ${
                    isActive
                      ? "text-[14.5px] font-bold text-white leading-[1.35]"
                      : "text-[13px] font-medium text-white leading-[1.35]"
                  }`}
                >
                  {isActive && line.words && line.words.length > 0 ? (
                    line.words.map((word, wIdx) => {
                      const wordActive = effectivePosition >= word.time;
                      return (
                        <span
                          key={`${wIdx}-${word.time}`}
                          style={{
                            opacity: wordActive ? 1 : 0.45,
                            transition: prefersReducedMotion
                              ? "none"
                              : "opacity 160ms ease-out",
                          }}
                        >
                          {word.text}
                          {wIdx < line.words!.length - 1 ? " " : ""}
                        </span>
                      );
                    })
                  ) : (
                    displayLine
                  )}
                </div>
              );
            })}
          </div>
        ) : lyrics?.plain_lyrics ? (
          <div
            ref={plainRef}
            dir="auto"
            style={{
              transform: `translate3d(0, ${plainTranslateY}px, 0)`,
              transition: prefersReducedMotion ? "none" : "transform 180ms ease-out",
              textWrap: "balance",
            }}
            className="text-start text-white/75 text-[13px] py-2 pr-2 leading-relaxed whitespace-pre-wrap w-full"
          >
            {lyrics.plain_lyrics}
          </div>
        ) : (
          <div
            dir="auto"
            className="h-full flex items-center justify-start text-start text-white/45 text-[13.5px]"
          >
            {media?.title ? "Lirik tidak tersedia" : "Menunggu pemutaran musik..."}
          </div>
        )}
      </div>

      {/* Bottom: Interactive Adjustable Music Progress Bar */}
      <MiniPlayerProgressBar
        variant="card"
        position={livePosition}
        duration={totalDuration}
        canSeek={canSeek}
        prefersReducedMotion={prefersReducedMotion}
        onSeek={seekLocal}
      />
    </div>
  );
};
