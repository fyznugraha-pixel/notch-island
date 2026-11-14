import React, { useEffect, useMemo, useState } from "react";
import type { LyricLine } from "../../services/lyrics/types";
import { resolveLineWords, splitWordsForWrappedRows } from "../../services/lyrics/wordTiming";
import { BarLyricLayoutResult, computeMarqueeTiming } from "./lyricsLayout";
import { WordFillLyricsLine } from "../ui/WordFillLyricsLine";

export interface BarLyricSlotProps {
  lineKey: string;
  layout: BarLyricLayoutResult;
  activeLyricLine?: LyricLine | null;
  effectivePosition?: number;
  currentLineTime: number | null;
  nextLineTime: number | null;
  isPlaying: boolean;
  prefersReducedMotion: boolean;
}

export const BarLyricSlot: React.FC<BarLyricSlotProps> = ({
  lineKey,
  layout,
  activeLyricLine,
  effectivePosition,
  currentLineTime,
  nextLineTime,
  isPlaying,
  prefersReducedMotion,
}) => {
  const [entered, setEntered] = useState(true);
  const [marqueeMoved, setMarqueeMoved] = useState(false);

  // Trigger 260ms ease-out slide-up + fade transition when lineKey changes
  useEffect(() => {
    setMarqueeMoved(false);
    if (prefersReducedMotion) {
      setEntered(true);
      return;
    }

    let cancelled = false;
    let innerRafId = 0;
    setEntered(false);
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      innerRafId = requestAnimationFrame(() => {
        if (!cancelled) {
          setEntered(true);
        }
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (innerRafId) {
        cancelAnimationFrame(innerRafId);
      }
    };
  }, [lineKey, prefersReducedMotion]);

  // Trigger single-run marquee after 500ms pause when in marquee mode
  const marqueeTiming = computeMarqueeTiming(
    currentLineTime,
    nextLineTime,
    layout.overflowPx
  );

  useEffect(() => {
    if (
      layout.mode !== "marquee" ||
      prefersReducedMotion ||
      !isPlaying ||
      layout.overflowPx <= 0
    ) {
      setMarqueeMoved(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setMarqueeMoved(true);
    }, marqueeTiming.delayMs);

    return () => window.clearTimeout(timer);
  }, [
    lineKey,
    layout.mode,
    layout.overflowPx,
    isPlaying,
    prefersReducedMotion,
    marqueeTiming.delayMs,
  ]);

  const transitionStyle: React.CSSProperties = prefersReducedMotion
    ? { opacity: 1, transform: "none" }
    : {
        opacity: entered ? 1 : 0,
        transform: entered
          ? "translate3d(0, 0px, 0) scale(1)"
          : "translate3d(0, 5px, 0) scale(0.985)",
        transformOrigin: "left center",
        transition: entered
          ? "transform 270ms cubic-bezier(0.22, 1, 0.36, 1), opacity 270ms ease-out"
          : "none",
      };

  const wrappedRows = useMemo(() => {
    if (
      !activeLyricLine ||
      effectivePosition === undefined ||
      (layout.mode !== "wrapped" && layout.mode !== "wrapped-clamped")
    ) {
      return null;
    }
    const resolved = resolveLineWords(activeLyricLine, nextLineTime ?? undefined);
    return splitWordsForWrappedRows(resolved, layout.lines[0] || "", layout.lines[1]);
  }, [activeLyricLine, effectivePosition, layout.mode, layout.lines, nextLineTime]);

  const singleLinePayload = useMemo<LyricLine | null>(() => {
    if (!activeLyricLine || effectivePosition === undefined) return null;
    const raw0 = layout.lines[0] || "";
    if (!raw0) return null;
    const normalizedDisplay = raw0.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
    const normalizedSource = activeLyricLine.text.replace(/\s+/g, " ").trim();
    return normalizedDisplay === normalizedSource
      ? activeLyricLine
      : { time: activeLyricLine.time, text: raw0 };
  }, [activeLyricLine, effectivePosition, layout.lines]);

  const fillBaseColor = "rgba(255, 255, 255, 0.42)";
  const fillHighlightColor = "#ffffff";

  return (
    <div
      className="flex-1 min-h-[38px] w-full overflow-hidden flex flex-col justify-center select-none"
      dir="auto"
    >
      <div
        style={transitionStyle}
        className="w-full h-full flex flex-col justify-center text-start"
      >
        {layout.mode === "wrapped" || layout.mode === "wrapped-clamped" ? (
          <div
            dir="auto"
            style={{
              fontSize: `${layout.fontSize}px`,
              textWrap: "balance",
              transformOrigin: "left center",
            }}
            className="w-full text-start font-semibold text-white leading-snug tracking-[-0.01em] line-clamp-2 overflow-hidden"
            title={layout.lines.join(" ")}
          >
            {wrappedRows && effectivePosition !== undefined ? (
              <>
                <div>
                  <WordFillLyricsLine
                    line={wrappedRows.row0}
                    nextLineTime={wrappedRows.row0NextTime}
                    effectiveTime={effectivePosition}
                    isActive
                    isPlaying={isPlaying}
                    prefersReducedMotion={prefersReducedMotion}
                    baseColor={fillBaseColor}
                    fillColor={fillHighlightColor}
                  />
                </div>
                {layout.lines[1] && wrappedRows.row1 && (
                  <div>
                    <WordFillLyricsLine
                      line={wrappedRows.row1}
                      nextLineTime={wrappedRows.row1NextTime}
                      effectiveTime={effectivePosition}
                      isActive
                      isPlaying={isPlaying}
                      prefersReducedMotion={prefersReducedMotion}
                      baseColor={fillBaseColor}
                      fillColor={fillHighlightColor}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <div>{layout.lines[0]}</div>
                {layout.lines[1] && <div>{layout.lines[1]}</div>}
              </>
            )}
          </div>
        ) : layout.mode === "marquee" ? (
          <>
            <div
              dir="auto"
              style={{
                maskImage:
                  "linear-gradient(to right, transparent 0%, black 10px, black calc(100% - 10px), transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 0%, black 10px, black calc(100% - 10px), transparent 100%)",
              }}
              className="w-full min-h-[20px] h-auto flex items-center overflow-hidden whitespace-nowrap"
              title={layout.lines[0]}
            >
              <span
                style={{
                  fontSize: `${layout.fontSize}px`,
                  transformOrigin: "left center",
                  transform: marqueeMoved
                    ? `translate3d(-${layout.overflowPx}px, 0, 0)`
                    : "translate3d(0, 0, 0)",
                  transition: marqueeMoved
                    ? `transform ${marqueeTiming.durationSec}s ease-in-out`
                    : "none",
                }}
                className="inline-block pl-[2px] pr-3 font-semibold text-white leading-snug tracking-[-0.01em]"
              >
                {singleLinePayload && effectivePosition !== undefined ? (
                  <WordFillLyricsLine
                    line={singleLinePayload}
                    nextLineTime={nextLineTime ?? undefined}
                    effectiveTime={effectivePosition}
                    isActive
                    isPlaying={isPlaying}
                    prefersReducedMotion={prefersReducedMotion}
                    singleLine
                    baseColor={fillBaseColor}
                    fillColor={fillHighlightColor}
                  />
                ) : (
                  layout.lines[0]
                )}
              </span>
            </div>
            <div
              dir="auto"
              className="w-full min-h-[16px] h-auto flex items-center text-[12px] font-normal text-white/50 leading-snug truncate text-start"
            >
              {layout.contextText}
            </div>
          </>
        ) : (
          <>
            <div
              dir="auto"
              style={{
                fontSize: `${layout.fontSize}px`,
                transformOrigin: "left center",
              }}
              className="w-full min-h-[20px] h-auto flex items-center font-semibold text-white leading-snug tracking-[-0.01em] truncate text-start"
              title={layout.lines[0]}
            >
              {singleLinePayload && effectivePosition !== undefined ? (
                <WordFillLyricsLine
                  line={singleLinePayload}
                  nextLineTime={nextLineTime ?? undefined}
                  effectiveTime={effectivePosition}
                  isActive
                  isPlaying={isPlaying}
                  prefersReducedMotion={prefersReducedMotion}
                  singleLine
                  baseColor={fillBaseColor}
                  fillColor={fillHighlightColor}
                />
              ) : (
                layout.lines[0]
              )}
            </div>
            <div
              dir="auto"
              className="w-full min-h-[16px] h-auto flex items-center text-[12px] font-normal text-white/50 leading-snug truncate text-start"
            >
              {layout.contextText}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
