import React from "react";
import type { LyricLine } from "../../services/mediaLyricsStore";
import { WordFillLyricsLine } from "../ui/WordFillLyricsLine";

interface StandbyLyricsRowProps {
  line: LyricLine;
  nextLineTime?: number;
  isActive: boolean;
  isPast: boolean;
  effectiveTime: number;
  isPlaying: boolean;
  reducedMotion: boolean;
  deepEcoActive: boolean;
  night: boolean;
  textPrimary: string;
  textSecondary: string;
  variant: "fullscreen" | "widget";
  activeRef?: React.RefObject<HTMLButtonElement | null>;
  onSeekLine: (timeSec: number) => void;
}

const StandbyLyricsRowComponent: React.FC<StandbyLyricsRowProps> = ({
  line,
  nextLineTime,
  isActive,
  isPast,
  effectiveTime,
  isPlaying,
  reducedMotion,
  deepEcoActive,
  night,
  textPrimary,
  textSecondary,
  variant,
  activeRef,
  onSeekLine,
}) => {
  const isFullscreen = variant === "fullscreen";
  const inactiveBaseColor = night
    ? "rgba(255, 69, 58, 0.38)"
    : isFullscreen
      ? "rgba(255, 255, 255, 0.36)"
      : "rgba(255, 255, 255, 0.38)";

  const className = isFullscreen
    ? "text-left font-bold leading-snug tracking-[-0.02em] transition-all duration-300 cursor-pointer hover:opacity-100 rounded-xl px-2 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff] max-w-full"
    : `text-left leading-snug tracking-[-0.015em] transition-all duration-300 cursor-pointer hover:opacity-100 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff] ${
        isActive
          ? "text-[clamp(16px,1.55vw,22px)] font-bold"
          : "text-[clamp(14px,1.3vw,18px)] font-semibold"
      }`;

  return (
    <button
      ref={isActive ? activeRef : undefined}
      type="button"
      onClick={() => {
        if (Number.isFinite(line.time)) {
          onSeekLine(Math.max(0, line.time));
        }
      }}
      className={className}
      style={{
        fontSize: isFullscreen ? "clamp(22px, min(2.4vw, 4vh), 40px)" : undefined,
        color: isActive
          ? textPrimary
          : night
            ? textSecondary
            : isFullscreen
              ? "rgba(255,255,255,0.72)"
              : "rgba(255,255,255,0.74)",
        opacity: isActive ? 1 : isPast ? (isFullscreen ? 0.36 : 0.34) : 0.56,
        transform: isActive && !reducedMotion ? (isFullscreen ? "scale(1.02)" : "scale(1.015)") : "scale(1)",
        transformOrigin: "left center",
      }}
    >
      {isActive && line.text ? (
        <WordFillLyricsLine
          line={line}
          nextLineTime={nextLineTime}
          effectiveTime={effectiveTime}
          isActive={isActive}
          isPlaying={isPlaying && !deepEcoActive}
          prefersReducedMotion={reducedMotion || deepEcoActive}
          baseColor={night ? "rgba(255, 69, 58, 0.4)" : inactiveBaseColor}
          fillColor={textPrimary}
          lowPower={true}
        />
      ) : (
        line.text || "..."
      )}
    </button>
  );
};

export const StandbyLyricsRow = React.memo(StandbyLyricsRowComponent);
