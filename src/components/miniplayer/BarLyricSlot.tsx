import React, { useEffect, useState } from "react";
import { BarLyricLayoutResult, computeMarqueeTiming } from "./lyricsLayout";

export interface BarLyricSlotProps {
  lineKey: string;
  layout: BarLyricLayoutResult;
  currentLineTime: number | null;
  nextLineTime: number | null;
  isPlaying: boolean;
  prefersReducedMotion: boolean;
}

export const BarLyricSlot: React.FC<BarLyricSlotProps> = ({
  lineKey,
  layout,
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

    setEntered(false);
    const rafId = requestAnimationFrame(() => {
      const innerRafId = requestAnimationFrame(() => {
        setEntered(true);
      });
      return () => cancelAnimationFrame(innerRafId);
    });

    return () => cancelAnimationFrame(rafId);
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

  return (
    <div
      className="h-[38px] min-h-[38px] max-h-[38px] w-full overflow-hidden flex flex-col justify-center select-none"
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
            className="w-full text-start font-semibold text-white leading-[18.5px] tracking-[-0.01em] line-clamp-2 overflow-hidden"
            title={layout.lines.join(" ")}
          >
            <div>{layout.lines[0]}</div>
            {layout.lines[1] && <div>{layout.lines[1]}</div>}
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
              className="w-full h-[20px] flex items-center overflow-hidden whitespace-nowrap"
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
                className="inline-block pl-[2px] pr-3 font-semibold text-white leading-[19px] tracking-[-0.01em]"
              >
                {layout.lines[0]}
              </span>
            </div>
            <div
              dir="auto"
              className="w-full h-[18px] flex items-center text-[12px] font-normal text-white/50 leading-[17px] truncate text-start"
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
              className="w-full h-[20px] flex items-center font-semibold text-white leading-[19px] tracking-[-0.01em] truncate text-start"
              title={layout.lines[0]}
            >
              {layout.lines[0]}
            </div>
            <div
              dir="auto"
              className="w-full h-[18px] flex items-center text-[12px] font-normal text-white/50 leading-[17px] truncate text-start"
            >
              {layout.contextText}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
