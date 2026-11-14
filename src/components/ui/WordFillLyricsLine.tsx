import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { LyricLine, LyricWord } from "../../services/lyrics/types";
import { resolveLineWords } from "../../services/lyrics/wordTiming";

export { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

export interface WordFillLyricsLineProps {
  line: LyricLine;
  nextLineTime?: number;
  effectiveTime: number;
  /** Optional live clock reader so timer sync stays tight without parent re-renders. */
  getEffectiveTime?: () => number;
  isActive: boolean;
  isPlaying?: boolean;
  prefersReducedMotion?: boolean;
  baseColor?: string;
  fillColor?: string;
  className?: string;
  singleLine?: boolean;
}

type WordGlowPhase = "future" | "active" | "past";

function splitTrailingSpace(text: string): { core: string; space: string } {
  const match = text.match(/^([\s\S]*?)(\s*)$/);
  if (!match) return { core: text, space: "" };
  return { core: match[1], space: match[2] };
}

function getWordGlowPhase(
  word: LyricWord,
  fallbackEndTime: number,
  effectiveTime: number
): WordGlowPhase {
  if (effectiveTime < word.time) return "future";
  const end = Math.max(word.time + 0.06, word.endTime ?? fallbackEndTime);
  if (effectiveTime < end) return "active";
  return "past";
}

function getPhaseVisualStyle(
  phase: WordGlowPhase,
  baseColor: string,
  fillColor: string,
  prefersReducedMotion: boolean
): { color: string; textShadow: string } {
  if (phase === "future") {
    return { color: baseColor, textShadow: "none" };
  }
  if (prefersReducedMotion) {
    return { color: fillColor, textShadow: "none" };
  }
  if (phase === "active") {
    return {
      color: fillColor,
      textShadow: "0 0 12px rgba(255, 255, 255, 0.58), 0 0 4px rgba(255, 255, 255, 0.32)",
    };
  }
  return {
    color: fillColor,
    textShadow: "0 0 6px rgba(255, 255, 255, 0.14)",
  };
}

export const WordFillLyricsLine: React.FC<WordFillLyricsLineProps> = ({
  line,
  nextLineTime,
  effectiveTime,
  getEffectiveTime,
  isActive,
  isPlaying = true,
  prefersReducedMotion = false,
  baseColor = "rgba(255, 255, 255, 0.36)",
  fillColor = "#ffffff",
  className = "",
  singleLine = false,
}) => {
  const resolved = useMemo(
    () => resolveLineWords(line, nextLineTime),
    [line, nextLineTime]
  );

  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lastPhaseRef = useRef<WordGlowPhase[]>([]);
  const clockRef = useRef<{ time: number; perfMs: number }>({
    time: effectiveTime,
    perfMs: typeof performance !== "undefined" ? performance.now() : 0,
  });
  const effectiveTimeRef = useRef(effectiveTime);
  const getEffectiveTimeRef = useRef(getEffectiveTime);
  const prevLineKeyRef = useRef("");

  effectiveTimeRef.current = effectiveTime;
  getEffectiveTimeRef.current = getEffectiveTime;
  const lineKey = `${line.time}:${line.text}:${resolved.words.length}`;

  useEffect(() => {
    const now = performance.now();
    const predicted = isPlaying
      ? clockRef.current.time + (now - clockRef.current.perfMs) / 1000
      : clockRef.current.time;
    const lineChanged = prevLineKeyRef.current !== lineKey;
    prevLineKeyRef.current = lineKey;

    if (lineChanged || !isPlaying || Math.abs(effectiveTime - predicted) > 0.09) {
      clockRef.current = { time: effectiveTime, perfMs: now };
    }
  }, [effectiveTime, isPlaying, lineKey]);

  useEffect(() => {
    lastPhaseRef.current = [];
  }, [lineKey, isActive, prefersReducedMotion, baseColor, fillColor]);

  const paintWords = useCallback(
    (curTime: number) => {
      const words = resolved.words;
      for (let i = 0; i < words.length; i++) {
        const el = wordRefs.current[i];
        if (!el) continue;
        const phase = getWordGlowPhase(words[i], resolved.lineEndTime, curTime);
        if (lastPhaseRef.current[i] === phase) continue;
        lastPhaseRef.current[i] = phase;
        const visual = getPhaseVisualStyle(phase, baseColor, fillColor, prefersReducedMotion);
        el.style.color = visual.color;
        el.style.textShadow = visual.textShadow;
      }
    },
    [resolved, baseColor, fillColor, prefersReducedMotion]
  );

  useEffect(() => {
    if (!isActive || !resolved.isRealWordTiming || resolved.words.length === 0 || isPlaying) {
      return;
    }
    const pausedTime = getEffectiveTimeRef.current ? getEffectiveTimeRef.current() : effectiveTime;
    paintWords(pausedTime);
  }, [effectiveTime, isActive, isPlaying, resolved, paintWords]);

  useEffect(() => {
    if (!isActive || !resolved.isRealWordTiming || resolved.words.length === 0 || !isPlaying) {
      return;
    }

    let rafId: number | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      if (getEffectiveTimeRef.current) {
        paintWords(getEffectiveTimeRef.current());
      } else {
        const now = performance.now();
        const freeRun = clockRef.current.time + (now - clockRef.current.perfMs) / 1000;
        const cappedTime = Math.min(freeRun, effectiveTimeRef.current + 0.22);
        paintWords(cappedTime);
      }
      rafId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isActive, isPlaying, resolved, paintWords]);

  const wrapperModeClass = singleLine ? "inline whitespace-nowrap" : "inline";
  const renderTime = getEffectiveTime ? getEffectiveTime() : effectiveTime;

  if (!isActive) {
    return <span className={`${wrapperModeClass} ${className}`.trim()}>{line.text}</span>;
  }

  // Honest fallback: line-timed sources (e.g. LRCLIB) glow the whole line uniformly at [mm:ss.xx].
  if (!resolved.isRealWordTiming || resolved.words.length === 0) {
    return (
      <span
        className={`${wrapperModeClass} ${className}`.trim()}
        style={{
          color: fillColor,
          textShadow: prefersReducedMotion
            ? "none"
            : "0 0 10px rgba(255, 255, 255, 0.34), 0 0 3px rgba(255, 255, 255, 0.16)",
          transition: prefersReducedMotion
            ? "none"
            : "color 180ms ease-out, text-shadow 240ms ease-out",
        }}
      >
        {line.text}
      </span>
    );
  }

  return (
    <span className={`${wrapperModeClass} ${className}`.trim()}>
      <span className="sr-only">{line.text}</span>
      <span aria-hidden="true" className={wrapperModeClass}>
        {resolved.words.map((word, idx) => {
          const { core, space } = splitTrailingSpace(word.text);
          if (!core) {
            return <React.Fragment key={`${idx}-${word.time}`}>{space}</React.Fragment>;
          }

          const initPhase = getWordGlowPhase(word, resolved.lineEndTime, renderTime);
          const initVisual = getPhaseVisualStyle(initPhase, baseColor, fillColor, prefersReducedMotion);

          return (
            <React.Fragment key={`${idx}-${word.time}`}>
              <span
                ref={(el) => {
                  wordRefs.current[idx] = el;
                }}
                style={{
                  color: initVisual.color,
                  textShadow: initVisual.textShadow,
                  transition: prefersReducedMotion
                    ? "none"
                    : "color 180ms ease-out, text-shadow 240ms ease-out",
                }}
              >
                {core}
              </span>
              {space}
            </React.Fragment>
          );
        })}
      </span>
    </span>
  );
};
