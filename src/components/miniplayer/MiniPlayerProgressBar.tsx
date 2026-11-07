import React, { useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface MiniPlayerProgressBarProps {
  position: number;
  duration: number;
  canSeek: boolean;
  variant: "bar" | "card";
  prefersReducedMotion?: boolean;
  onSeek?: (targetSec: number) => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const totalSec = Math.floor(sec);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export const MiniPlayerProgressBar: React.FC<MiniPlayerProgressBarProps> = ({
  position,
  duration,
  canSeek,
  variant,
  prefersReducedMotion = false,
  onSeek,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrubSec, setScrubSec] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const effectivePos = scrubSec !== null ? scrubSec : position;
  const ratio =
    duration > 0 ? Math.min(1, Math.max(0, effectivePos / duration)) : 0;

  const computeTimeFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return pct * duration;
    },
    [duration]
  );

  const commitSeek = useCallback(
    async (targetSec: number) => {
      onSeek?.(targetSec);
      try {
        await invoke("smtc_seek", { positionSec: targetSec });
      } catch {}
    },
    [onSeek]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (!canSeek || duration <= 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const nextSec = computeTimeFromClientX(e.clientX);
      setScrubSec(nextSec);
      onSeek?.(nextSec);
    },
    [canSeek, duration, computeTimeFromClientX, onSeek]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (scrubSec === null || !canSeek) return;
      e.stopPropagation();
      const nextSec = computeTimeFromClientX(e.clientX);
      setScrubSec(nextSec);
      onSeek?.(nextSec);
    },
    [scrubSec, canSeek, computeTimeFromClientX, onSeek]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (scrubSec === null) return;
      e.stopPropagation();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const finalSec = computeTimeFromClientX(e.clientX);
      setScrubSec(null);
      commitSeek(finalSec);
    },
    [scrubSec, computeTimeFromClientX, commitSeek]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (scrubSec === null) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setScrubSec(null);
    },
    [scrubSec]
  );

  const isInteracting = isHovered || scrubSec !== null;

  if (variant === "bar") {
    return (
      <div
        ref={trackRef}
        data-no-drag
        role="slider"
        aria-label="Posisi lagu"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(effectivePos)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className={`absolute left-4 right-4 bottom-[4px] h-[14px] flex items-center select-none ${
          canSeek ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <div
          className={`relative w-full rounded-full bg-white/20 overflow-visible transition-[height] duration-150 ${
            isInteracting && canSeek ? "h-[4.5px]" : "h-[3px]"
          }`}
        >
          <div className="w-full h-full rounded-full overflow-hidden">
            <div
              className="h-full bg-white w-full origin-left rounded-full"
              style={{
                transform: `scaleX(${ratio})`,
                transition:
                  prefersReducedMotion || scrubSec !== null
                    ? "none"
                    : "transform 150ms linear",
              }}
            />
          </div>
          {isInteracting && canSeek && (
            <span
              style={{
                left: `${ratio * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
              className="
                absolute top-1/2 w-2.5 h-2.5 rounded-full bg-white
                shadow-[0_0_6px_rgba(0,0,0,0.45)] pointer-events-none
              "
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-no-drag
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full shrink-0 pt-1 flex items-center gap-2.5 select-none"
    >
      <span className="text-[10.5px] font-medium text-white/55 tabular-nums w-[30px] text-start leading-none">
        {formatTime(effectivePos)}
      </span>

      <div
        ref={trackRef}
        role="slider"
        aria-label="Posisi lagu"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(effectivePos)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className={`flex-1 h-[18px] flex items-center ${
          canSeek ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <div
          className={`relative w-full rounded-full bg-white/20 overflow-visible transition-[height] duration-150 ${
            isInteracting && canSeek ? "h-[5px]" : "h-[3.5px]"
          }`}
        >
          <div className="w-full h-full rounded-full overflow-hidden">
            <div
              className="h-full bg-white w-full origin-left rounded-full"
              style={{
                transform: `scaleX(${ratio})`,
                transition:
                  prefersReducedMotion || scrubSec !== null
                    ? "none"
                    : "transform 150ms linear",
              }}
            />
          </div>
          {isInteracting && canSeek && (
            <span
              style={{
                left: `${ratio * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
              className="
                absolute top-1/2 w-2.5 h-2.5 rounded-full bg-white
                shadow-[0_0_8px_rgba(0,0,0,0.5)] pointer-events-none
              "
            />
          )}
        </div>
      </div>

      <span className="text-[10.5px] font-medium text-white/55 tabular-nums w-[30px] text-end leading-none">
        {formatTime(duration)}
      </span>
    </div>
  );
};

