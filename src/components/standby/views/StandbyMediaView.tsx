import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Music, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { StandbyPalette } from "../standbyTheme";
import { Language } from "../../../services/i18n";
import { LyricsPayload, MediaPayload } from "../../../services/mediaLyricsStore";
import { useResolvedThumbnail } from "../../ui/MediaThumbnail";
import { extractDominantColor } from "../../miniplayer/colorExtractor";
import { BASE_LYRICS_OFFSET } from "../../miniplayer/lyricsSync";
import { StandbyLyricsRow } from "../StandbyLyricsRow";

interface StandbyMediaViewProps {
  media: MediaPayload;
  lyrics: LyricsPayload;
  livePosition: number;
  liveDuration: number;
  activeLyricIndex: number;
  onSeekLocal: (pos: number) => void;
  palette: StandbyPalette;
  language: Language;
  reducedMotion: boolean;
  deepEcoActive?: boolean;
}

function fmtSec(sec: number): string {
  const safe = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const StandbyMediaView: React.FC<StandbyMediaViewProps> = ({
  media,
  lyrics,
  livePosition,
  liveDuration,
  activeLyricIndex,
  onSeekLocal,
  palette,
  language,
  reducedMotion,
  deepEcoActive = false,
}) => {
  const isId = language === "id";
  const resolvedArt = useResolvedThumbnail(media);
  const [tintHex, setTintHex] = useState("#1a1423");
  const [preblurredBackdrop, setPreblurredBackdrop] = useState<string | null>(null);
  const lyricsViewportRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const manualScrollUntilRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    extractDominantColor(resolvedArt).then((hex) => {
      if (!cancelled) setTintHex(hex);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedArt]);

  // Bake the ambient blur once onto a 96x96 canvas instead of running a live 95px fullscreen CSS blur.
  useEffect(() => {
    if (!resolvedArt || palette.night || deepEcoActive) {
      setPreblurredBackdrop(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 96;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.filter = "blur(10px) saturate(1.85) brightness(0.55)";
        ctx.drawImage(img, -12, -12, 120, 120);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
        if (!cancelled) setPreblurredBackdrop(dataUrl);
      } catch {
        if (!cancelled) setPreblurredBackdrop(null);
      }
    };
    img.onerror = () => {
      if (!cancelled) setPreblurredBackdrop(null);
    };
    img.src = resolvedArt;
    return () => {
      cancelled = true;
    };
  }, [resolvedArt, palette.night, deepEcoActive]);

  useEffect(() => {
    if (performance.now() < manualScrollUntilRef.current) return;
    const container = lyricsViewportRef.current;
    const btn = activeLineRef.current;
    if (!container || !btn) return;
    const targetTop = Math.max(0, btn.offsetTop - container.clientHeight / 2 + btn.offsetHeight / 2);
    container.scrollTo({
      top: targetTop,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [activeLyricIndex, reducedMotion]);

  const hasTrack = Boolean(media.title && media.title.trim().length > 0);
  const pct = liveDuration > 0 ? Math.min(100, Math.max(0, (livePosition / liveDuration) * 100)) : 0;
  const effectiveTime = livePosition + (lyrics.offset || 0) + BASE_LYRICS_OFFSET;

  const handleSeekLine = useCallback(
    (target: number) => {
      onSeekLocal(target);
      invoke("smtc_seek", { positionSec: target }).catch(() => { });
    },
    [onSeekLocal]
  );

  const handleSeekRatio = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (liveDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const nextPos = ratio * liveDuration;
    onSeekLocal(nextPos);
    invoke("smtc_seek", { positionSec: nextPos }).catch(() => { });
  };

  if (!hasTrack) {
    return (
      <div className="relative w-screen h-screen flex flex-col items-center justify-center text-center px-8 gap-4 select-none overflow-hidden">
        <div
          className="relative z-10 w-24 h-24 rounded-[28px] flex items-center justify-center"
          style={{
            backgroundColor: palette.mutedChipBg,
            color: palette.textSecondary,
          }}
        >
          <Music size={38} />
        </div>
        <h2 className="relative z-10 text-[30px] font-bold tracking-tight" style={{ color: palette.textPrimary }}>
          {isId ? "Belum Ada Media Diputar" : "No Active Playback"}
        </h2>
        <p className="relative z-10 text-[15px] max-w-[440px]" style={{ color: palette.textSecondary }}>
          {isId
            ? "Saat Anda memutar musik atau video di perangkat ini, sampul album dan lirik sinkron akan tampil penuh selayar."
            : "Start audio or video playback on your PC to fill the screen with album art and live synced lyrics."}
        </p>
      </div>
    );
  }

  const hasSyncedLines = lyrics.synced && lyrics.lines.length > 0;
  const plainLines =
    !hasSyncedLines && lyrics.plain_lyrics
      ? lyrics.plain_lyrics
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
      : [];

  return (
    <div className="relative w-screen h-screen flex items-center justify-center select-none overflow-hidden">
      {/* Full-bleed edge-to-edge macOS Apple Music backdrop */}
      {!palette.night && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden bg-[#070709]">
          {!deepEcoActive && preblurredBackdrop ? (
            <img
              src={preblurredBackdrop}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-110 transition-opacity duration-700"
            />
          ) : null}
          <div
            className="absolute inset-0 transition-colors duration-700"
            style={{
              background: `radial-gradient(circle at 26% 48%, ${tintHex}88 0%, rgba(7,7,11,0.52) 56%, rgba(4,4,8,0.8) 100%)`,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0.06) 28%, rgba(0,0,0,0.12) 74%, rgba(0,0,0,0.44) 100%)",
            }}
          />
        </div>
      )}

      <div className="relative z-10 w-[min(92vw,1540px)] max-h-screen mx-auto px-8 sm:px-12 py-16 grid grid-cols-1 md:grid-cols-12 gap-10 items-center">
        {/* Left: Sculptural Album Cover & Smoked Glass Transport */}
        <div className="md:col-span-5 flex flex-col items-center md:items-start gap-5 min-w-0">
          <div
            className="aspect-square rounded-[32px] overflow-hidden border flex items-center justify-center shrink-0 transition-transform duration-500"
            style={{
              width: "clamp(190px, min(25vw, 38vh), 380px)",
              background: palette.cardBg,
              borderColor: palette.night ? palette.cardBorder : "rgba(255,255,255,0.24)",
              boxShadow: palette.night
                ? "none"
                : "0 32px 84px rgba(0,0,0,0.64), inset 0 1px 0 rgba(255,255,255,0.26)",
              transform: media.is_playing || reducedMotion ? "scale(1)" : "scale(0.96)",
            }}
          >
            {resolvedArt ? (
              <img
                src={resolvedArt}
                alt={media.title}
                width={420}
                height={420}
                className="w-full h-full object-cover"
                style={
                  palette.night
                    ? { filter: "brightness(0.45) sepia(1) hue-rotate(-48deg) saturate(2.5)" }
                    : undefined
                }
              />
            ) : (
              <Music size={72} style={{ color: palette.textSecondary }} />
            )}
          </div>

          <div
            className="w-full flex flex-col gap-3"
            style={{ maxWidth: "clamp(240px, min(25vw, 38vh), 380px)" }}
          >
            <div className="text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                {media.is_playing && !reducedMotion && !deepEcoActive && (
                  <span className="inline-flex items-end gap-[2.5px] h-3">
                    <span className="w-[3px] h-full rounded-full animate-eq-bar" style={{ backgroundColor: palette.textPrimary }} />
                    <span className="w-[3px] h-full rounded-full animate-eq-bar" style={{ backgroundColor: palette.textPrimary, animationDelay: "0.18s" }} />
                    <span className="w-[3px] h-full rounded-full animate-eq-bar" style={{ backgroundColor: palette.textPrimary, animationDelay: "0.36s" }} />
                  </span>
                )}
                <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: palette.textSecondary }}>
                  {media.is_playing ? (isId ? "Sedang Diputar" : "Now Playing") : isId ? "Dijeda" : "Paused"}
                </span>
              </div>
              <h2 className="text-[26px] font-bold tracking-[-0.02em] truncate leading-tight" style={{ color: palette.textPrimary }}>
                {media.title}
              </h2>
              <p className="text-[16px] font-medium truncate mt-0.5" style={{ color: palette.textSecondary }}>
                {media.artist || (isId ? "Artis Tidak Diketahui" : "Unknown Artist")}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                aria-label={isId ? "Geser posisi lagu" : "Seek playback position"}
                onClick={handleSeekRatio}
                className="w-full py-2 cursor-pointer group focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff] rounded-full"
              >
                <div
                  className="w-full h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: palette.night ? palette.mutedChipBg : "rgba(255,255,255,0.18)" }}
                >
                  <div
                    className="w-full h-full rounded-full origin-left transition-transform duration-150 ease-linear"
                    style={{
                      transform: `scaleX(${pct / 100})`,
                      backgroundColor: palette.night ? palette.textPrimary : "#ffffff",
                    }}
                  />
                </div>
              </button>
              <div className="flex justify-between text-[12px] font-semibold tabular-nums" style={{ color: palette.textSecondary }}>
                <span>{fmtSec(livePosition)}</span>
                <span>{liveDuration > 0 ? fmtSec(liveDuration) : "--:--"}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-7 pt-1">
              <button
                type="button"
                aria-label={isId ? "Lagu sebelumnya" : "Previous track"}
                onClick={() => invoke("smtc_action", { action: "prev" }).catch(() => { })}
                className="w-11 h-11 rounded-full flex items-center justify-center opacity-75 hover:opacity-100 transition-all hover:scale-110 active:scale-95 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
                style={{ color: palette.textPrimary }}
              >
                <SkipBack size={23} fill="currentColor" />
              </button>

              <button
                type="button"
                aria-label={media.is_playing ? (isId ? "Jeda" : "Pause") : isId ? "Putar" : "Play"}
                onClick={() => invoke("smtc_action", { action: "toggle" }).catch(() => { })}
                className="w-14 h-14 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff] shadow-xl"
                style={{
                  backgroundColor: palette.night ? palette.textPrimary : "#ffffff",
                  color: "#000000",
                }}
              >
                {media.is_playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="translate-x-[1px]" />}
              </button>

              <button
                type="button"
                aria-label={isId ? "Lagu berikutnya" : "Next track"}
                onClick={() => invoke("smtc_action", { action: "next" }).catch(() => { })}
                className="w-11 h-11 rounded-full flex items-center justify-center opacity-75 hover:opacity-100 transition-all hover:scale-110 active:scale-95 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
                style={{ color: palette.textPrimary }}
              >
                <SkipForward size={23} fill="currentColor" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Word-by-Word Animated Lyrics (Apple Music Karaoke Fill + Click to Seek) */}
        <div
          ref={lyricsViewportRef}
          onWheel={() => {
            manualScrollUntilRef.current = performance.now() + 2600;
          }}
          onTouchMove={() => {
            manualScrollUntilRef.current = performance.now() + 2600;
          }}
          className="relative md:col-span-7 overflow-y-auto no-scrollbar px-3 flex flex-col justify-start min-w-0 overscroll-contain"
          style={{
            height: "min(66vh, 620px)",
            WebkitMaskImage:
              "linear-gradient(180deg, transparent 0%, #000 16%, #000 84%, transparent 100%)",
            maskImage:
              "linear-gradient(180deg, transparent 0%, #000 16%, #000 84%, transparent 100%)",
          }}
        >
          {hasSyncedLines ? (
            <div className="flex flex-col gap-5 py-36 items-start">
              {lyrics.lines.map((line, idx) => {
                const isActive = idx === activeLyricIndex;
                const isPast = activeLyricIndex >= 0 && idx < activeLyricIndex;
                const nextLineTime =
                  idx + 1 < lyrics.lines.length
                    ? lyrics.lines[idx + 1].time
                    : liveDuration > 0
                      ? liveDuration
                      : undefined;

                return (
                  <StandbyLyricsRow
                    key={`${idx}-${line.time}`}
                    line={line}
                    nextLineTime={nextLineTime}
                    isActive={isActive}
                    isPast={isPast}
                    effectiveTime={isActive ? effectiveTime : 0}
                    isPlaying={isActive && media.is_playing && !deepEcoActive}
                    reducedMotion={reducedMotion}
                    deepEcoActive={deepEcoActive}
                    night={palette.night}
                    textPrimary={palette.textPrimary}
                    textSecondary={palette.textSecondary}
                    variant="fullscreen"
                    activeRef={isActive ? activeLineRef : undefined}
                    onSeekLine={handleSeekLine}
                  />
                );
              })}
            </div>
          ) : plainLines.length > 0 ? (
            <div className="flex flex-col gap-4 py-16">
              {plainLines.map((line, idx) => (
                <p
                  key={idx}
                  className="text-[22px] font-semibold leading-relaxed"
                  style={{ color: palette.textPrimary }}
                >
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <div className="my-auto flex flex-col gap-2 text-center md:text-left">
              <span className="text-[12px] font-bold uppercase tracking-[0.1em]" style={{ color: palette.textSecondary }}>
                {lyrics.state === "loading"
                  ? isId
                    ? "Mencari lirik..."
                    : "Searching lyrics..."
                  : lyrics.state === "instrumental"
                    ? isId
                      ? "Musik Instrumental"
                      : "Instrumental Track"
                    : isId
                      ? "Lirik tidak tersedia untuk lagu ini"
                      : "Lyrics unavailable for this track"}
              </span>
              <p className="text-[24px] font-semibold" style={{ color: palette.textPrimary }}>
                {media.album || media.artist || media.title}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
