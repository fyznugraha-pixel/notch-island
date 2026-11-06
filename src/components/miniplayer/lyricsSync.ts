import { useState, useEffect, useRef } from "react";
import { LyricLine, LyricsPayload, subscribeProgress } from "../../services/mediaLyricsStore";

export function findActiveLyricIndex(lines: LyricLine[], liveTime: number): number {
  if (!lines || lines.length === 0) return -1;
  if (liveTime < lines[0].time) return -1;
  const last = lines.length - 1;
  if (liveTime >= lines[last].time) return last;

  let low = 0;
  let high = last;
  let best = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= liveTime) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

export function useLyricsSync(
  lyrics: LyricsPayload | null,
  initialPosition: number,
  initialDuration: number,
  isPlaying: boolean,
  offset: number = 0
) {
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [livePosition, setLivePosition] = useState<number>(initialPosition);
  const [liveDuration, setLiveDuration] = useState<number>(initialDuration);

  const anchorRef = useRef<{ time: number; timestamp: number }>({
    time: initialPosition,
    timestamp: performance.now(),
  });
  const activeIndexRef = useRef<number>(-1);

  // Subscribe to live backend progress stream
  useEffect(() => {
    const unsubscribe = subscribeProgress((p) => {
      if (typeof p.duration === "number" && p.duration > 0) {
        setLiveDuration(p.duration);
      }
      const now = performance.now();
      const elapsed = (now - anchorRef.current.timestamp) / 1000;
      const estimated = isPlaying ? anchorRef.current.time + elapsed : anchorRef.current.time;

      if (Math.abs(estimated - p.position) > 0.35 || !isPlaying) {
        anchorRef.current = { time: p.position, timestamp: now };
        setLivePosition(p.position);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isPlaying]);

  // Tick loop for binary search and progress bar (runs when playing)
  useEffect(() => {
    const effectiveOffset = typeof lyrics?.offset === "number" ? lyrics.offset : offset;

    if (!isPlaying) {
      if (lyrics?.synced && lyrics.lines.length > 0) {
        const effective = anchorRef.current.time + effectiveOffset;
        const idx = findActiveLyricIndex(lyrics.lines, effective);
        if (idx !== activeIndexRef.current) {
          activeIndexRef.current = idx;
          setActiveIndex(idx);
        }
      }
      return;
    }

    const interval = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - anchorRef.current.timestamp) / 1000;
      const current = Math.min(liveDuration || 9999, anchorRef.current.time + elapsed);
      setLivePosition(current);

      if (lyrics?.synced && lyrics.lines.length > 0) {
        const effectiveTime = current + effectiveOffset;
        const idx = findActiveLyricIndex(lyrics.lines, effectiveTime);
        if (idx !== activeIndexRef.current) {
          activeIndexRef.current = idx;
          setActiveIndex(idx);
        }
      }
    }, 50);

    return () => clearInterval(interval);
  }, [lyrics?.synced, lyrics?.lines, lyrics?.offset, isPlaying, liveDuration, offset]);

  // When lyrics track changes or offset changes, re-evaluate immediately
  useEffect(() => {
    const effectiveOffset = typeof lyrics?.offset === "number" ? lyrics.offset : offset;
    if (!lyrics?.synced || !lyrics.lines.length) {
      activeIndexRef.current = -1;
      setActiveIndex(-1);
    } else {
      const effective = anchorRef.current.time + effectiveOffset;
      const idx = findActiveLyricIndex(lyrics.lines, effective);
      activeIndexRef.current = idx;
      setActiveIndex(idx);
    }
  }, [lyrics?.title, lyrics?.artist, lyrics?.synced, lyrics?.offset, offset]);

  const activeLine =
    lyrics?.synced && activeIndex >= 0 && activeIndex < (lyrics.lines?.length || 0)
      ? lyrics.lines[activeIndex]
      : null;

  return {
    activeIndex,
    activeLine,
    livePosition,
    liveDuration,
  };
}
