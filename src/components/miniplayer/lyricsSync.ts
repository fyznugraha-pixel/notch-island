import { useState, useEffect, useRef } from "react";
import { LyricLine, LyricsPayload } from "../../services/mediaLyricsStore";

export function findActiveLyricIndex(lines: LyricLine[], liveTime: number): number {
  if (!lines || lines.length === 0) return -1;
  if (liveTime < lines[0].time) return -1;
  if (liveTime >= lines[lines.length - 1].time) return lines.length - 1;

  let low = 0;
  let high = lines.length - 1;
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
  position: number,
  duration: number,
  isPlaying: boolean,
  offset: number = 0
) {
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [livePosition, setLivePosition] = useState<number>(position);

  const anchorRef = useRef<{ time: number; timestamp: number }>({
    time: position,
    timestamp: performance.now(),
  });
  const activeIndexRef = useRef<number>(-1);

  // Re-sync anchor when position updates from SMTC / seek
  useEffect(() => {
    const now = performance.now();
    const elapsed = (now - anchorRef.current.timestamp) / 1000;
    const estimated = isPlaying ? anchorRef.current.time + elapsed : anchorRef.current.time;

    // Detect seek jump > 1.5s or pause/play toggle
    if (Math.abs(estimated - position) > 1.5 || !isPlaying) {
      anchorRef.current = { time: position, timestamp: now };
      setLivePosition(position);
    }
  }, [position, isPlaying]);

  // Tick loop for binary search and progress bar (runs only when playing)
  useEffect(() => {
    if (!isPlaying) {
      // Static evaluation on pause
      if (lyrics?.synced && lyrics.lines.length > 0) {
        const effective = position + (lyrics.offset ?? offset);
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
      const current = Math.min(duration || 9999, anchorRef.current.time + elapsed);
      setLivePosition(current);

      if (lyrics?.synced && lyrics.lines.length > 0) {
        const effectiveTime = current + (lyrics.offset ?? offset);
        const idx = findActiveLyricIndex(lyrics.lines, effectiveTime);
        if (idx !== activeIndexRef.current) {
          activeIndexRef.current = idx;
          setActiveIndex(idx);
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [lyrics, isPlaying, duration, offset]);

  // When lyrics track changes, reset immediately
  useEffect(() => {
    if (!lyrics?.synced || !lyrics.lines.length) {
      activeIndexRef.current = -1;
      setActiveIndex(-1);
    } else {
      const effective = anchorRef.current.time + (lyrics.offset ?? offset);
      const idx = findActiveLyricIndex(lyrics.lines, effective);
      activeIndexRef.current = idx;
      setActiveIndex(idx);
    }
  }, [lyrics?.title, lyrics?.artist, lyrics?.synced, lyrics?.offset]);

  const activeLine =
    lyrics?.synced && activeIndex >= 0 && activeIndex < (lyrics.lines?.length || 0)
      ? lyrics.lines[activeIndex]
      : null;

  return {
    activeIndex,
    activeLine,
    livePosition,
  };
}

