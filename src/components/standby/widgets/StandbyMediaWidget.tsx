import React, { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Music, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { StandbyPalette } from "../standbyTheme";
import { Language } from "../../../services/i18n";
import { LyricsPayload, MediaPayload } from "../../../services/mediaLyricsStore";
import { useResolvedThumbnail } from "../../ui/MediaThumbnail";
import { WordFillLyricsLine } from "../../ui/WordFillLyricsLine";
import { BASE_LYRICS_OFFSET } from "../../miniplayer/lyricsSync";

interface StandbyMediaWidgetProps {
  media: MediaPayload;
  lyrics: LyricsPayload;
  livePosition: number;
  liveDuration: number;
  activeLyricIndex: number;
  onSeekLocal: (pos: number) => void;
  palette: StandbyPalette;
  language: Language;
  reducedMotion: boolean;
}

function fmtSec(sec: number): string {
  const safe = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const StandbyMediaWidget: React.FC<StandbyMediaWidgetProps> = ({
  media,
  lyrics,
  livePosition,
  liveDuration,
  activeLyricIndex,
  onSeekLocal,
  palette,
  language,
  reducedMotion,
}) => {
  const isId = language === "id";
  const resolvedArt = useResolvedThumbnail(media);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const hasTrack = Boolean(media.title && media.title.trim().length > 0);
  const pct = liveDuration > 0 ? Math.min(100, Math.max(0, (livePosition / liveDuration) * 100)) : 0;
  const syncedCount = lyrics.synced ? lyrics.lines.length : 0;

  useEffect(() => {
    const container = lyricsContainerRef.current;
    const btn = activeLineRef.current;
    if (!container || !btn) return;
    const targetTop = Math.max(0, btn.offsetTop - container.clientHeight / 2 + btn.offsetHeight / 2);
    container.scrollTo({
      top: targetTop,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [activeLyricIndex, syncedCount, reducedMotion]);

  if (!hasTrack) {
    return (
      <div className="flex flex-col items-center justify-center text-center w-full h-full p-8 gap-3 select-none">
        <div
          className="w-14 h-14 rounded-[16px] flex items-center justify-center"
          style={{ backgroundColor: palette.mutedChipBg, color: palette.textSecondary }}
        >
          <Music size={24} />
        </div>
        <div>
          <p className="text-[17px] font-semibold" style={{ color: palette.textPrimary }}>
            {isId ? "Tidak ada pemutaran aktif" : "Nothing playing"}
          </p>
          <p className="text-[13.5px] mt-1" style={{ color: palette.textSecondary }}>
            {isId
              ? "Putar lagu di Spotify, Apple Music, atau browser untuk kontrol dari sini"
              : "Start playback in Spotify, Apple Music, or your browser to control it here"}
          </p>
        </div>
      </div>
    );
  }

  const syncedLines = lyrics.synced && lyrics.lines.length > 0 ? lyrics.lines : null;
  const effectiveTime = livePosition + (lyrics.offset || 0) + BASE_LYRICS_OFFSET;

  const plainLines =
    !syncedLines && lyrics.plain_lyrics
      ? lyrics.plain_lyrics
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];

  const statusText =
    lyrics.state === "loading"
      ? isId
        ? "Mencari lirik lagu..."
        : "Finding lyrics..."
      : lyrics.state === "instrumental"
      ? isId
        ? "Musik instrumental"
        : "Instrumental track"
      : isId
      ? "Lirik tidak tersedia"
      : "Lyrics unavailable";

  return (
    <div className="relative flex flex-col w-full h-full px-3 sm:px-5 py-2 select-none overflow-hidden">
      <div className="relative z-10 flex items-center gap-4 min-w-0 shrink-0">
        <div
          className="w-[clamp(58px,7.5vh,84px)] h-[clamp(58px,7.5vh,84px)] rounded-[16px] overflow-hidden shrink-0 flex items-center justify-center shadow-lg"
          style={{ backgroundColor: palette.mutedChipBg }}
        >
          {resolvedArt ? (
            <img
              src={resolvedArt}
              alt={media.title}
              width={84}
              height={84}
              className="w-full h-full object-cover"
              style={
                palette.night
                  ? { filter: "brightness(0.45) sepia(1) hue-rotate(-48deg) saturate(2.5)" }
                  : undefined
              }
            />
          ) : (
            <Music size={26} style={{ color: palette.textSecondary }} />
          )}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: palette.textSecondary }}>
              {media.is_playing
                ? isId
                  ? "Sedang Diputar"
                  : "Now Playing"
                : isId
                ? "Dijeda"
                : "Paused"}
            </span>
            {media.is_playing && !reducedMotion && (
              <span className="inline-flex items-end gap-[2px] h-2.5">
                <span className="w-[2.5px] h-full rounded-full animate-eq-bar" style={{ backgroundColor: palette.accent }} />
                <span className="w-[2.5px] h-full rounded-full animate-eq-bar" style={{ backgroundColor: palette.accent, animationDelay: "0.2s" }} />
                <span className="w-[2.5px] h-full rounded-full animate-eq-bar" style={{ backgroundColor: palette.accent, animationDelay: "0.4s" }} />
              </span>
            )}
          </div>
          <h3 className="text-[clamp(18px,2vw,26px)] font-bold truncate mt-0.5 leading-tight" style={{ color: palette.textPrimary }}>
            {media.title}
          </h3>
          <p className="text-[clamp(13px,1.25vw,17px)] font-medium truncate" style={{ color: palette.textSecondary }}>
            {media.artist || (isId ? "Artis Tidak Diketahui" : "Unknown Artist")}
          </p>
        </div>
      </div>

      {/* Frameless 4-5 Line Live Lyrics Filling the Middle Space */}
      <div
        ref={lyricsContainerRef}
        className="relative z-10 flex-1 min-h-0 my-3 overflow-hidden flex flex-col justify-start"
        style={{
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0%, #000 18%, #000 82%, transparent 100%)",
          maskImage:
            "linear-gradient(180deg, transparent 0%, #000 18%, #000 82%, transparent 100%)",
        }}
      >
        {syncedLines ? (
          <div className="flex flex-col gap-2.5 py-16 items-start">
            {syncedLines.map((line, idx) => {
              const isActive = idx === activeLyricIndex;
              const isPast = activeLyricIndex >= 0 && idx < activeLyricIndex;
              const nextLineTime =
                idx + 1 < syncedLines.length
                  ? syncedLines[idx + 1].time
                  : liveDuration > 0
                  ? liveDuration
                  : undefined;

              return (
                <button
                  key={`${idx}-${line.time}`}
                  ref={isActive ? activeLineRef : undefined}
                  type="button"
                  onClick={() => {
                    if (Number.isFinite(line.time)) {
                      const target = Math.max(0, line.time);
                      onSeekLocal(target);
                      invoke("smtc_seek", { positionSec: target }).catch(() => {});
                    }
                  }}
                  className={`text-left leading-snug tracking-[-0.015em] transition-all duration-300 cursor-pointer hover:opacity-100 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff] ${
                    isActive
                      ? "text-[clamp(16px,1.55vw,22px)] font-bold"
                      : "text-[clamp(14px,1.3vw,18px)] font-semibold"
                  }`}
                  style={{
                    color: isActive
                      ? palette.textPrimary
                      : palette.night
                      ? palette.textSecondary
                      : "rgba(255,255,255,0.74)",
                    opacity: isActive ? 1 : isPast ? 0.34 : 0.56,
                    transform: isActive && !reducedMotion ? "scale(1.015)" : "scale(1)",
                    transformOrigin: "left center",
                  }}
                >
                  {isActive && line.text ? (
                    <WordFillLyricsLine
                      line={line}
                      nextLineTime={nextLineTime}
                      effectiveTime={effectiveTime}
                      isActive={isActive}
                      isPlaying={media.is_playing}
                      prefersReducedMotion={reducedMotion}
                      baseColor={
                        palette.night
                          ? "rgba(255, 69, 58, 0.4)"
                          : "rgba(255, 255, 255, 0.38)"
                      }
                      fillColor={palette.textPrimary}
                    />
                  ) : (
                    line.text || "..."
                  )}
                </button>
              );
            })}
          </div>
        ) : plainLines.length > 0 ? (
          <div className="my-auto flex flex-col gap-2 py-2">
            {plainLines.map((line, idx) => (
              <p
                key={idx}
                className="text-[clamp(14px,1.3vw,18px)] font-semibold leading-snug"
                style={{
                  color: idx === 0 ? palette.textPrimary : palette.textSecondary,
                  opacity: idx === 0 ? 0.96 : 0.64,
                }}
              >
                {line}
              </p>
            ))}
          </div>
        ) : (
          <div className="my-auto flex flex-col gap-1">
            <p className="text-[clamp(14px,1.3vw,17px)] font-semibold" style={{ color: palette.textSecondary }}>
              {statusText}
            </p>
            {media.album && (
              <p className="text-[clamp(12.5px,1.15vw,15px)] font-medium opacity-70 truncate" style={{ color: palette.textSecondary }}>
                {media.album}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="relative z-10 flex flex-col gap-3 shrink-0">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-label={isId ? "Geser posisi lagu" : "Seek playback position"}
            onClick={(e) => {
              if (liveDuration <= 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              const nextPos = ratio * liveDuration;
              onSeekLocal(nextPos);
              invoke("smtc_seek", { positionSec: nextPos }).catch(() => {});
            }}
            className="w-full py-1.5 group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff] rounded-full"
          >
            <div
              className="w-full h-[4px] group-hover:h-[6px] rounded-full overflow-hidden transition-all"
              style={{ backgroundColor: palette.mutedChipBg }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: palette.night ? palette.textPrimary : "#f5f5f7" }}
              />
            </div>
          </button>
          <div className="flex justify-between text-[11.5px] font-medium tabular-nums" style={{ color: palette.textSecondary }}>
            <span>{fmtSec(livePosition)}</span>
            <span>{liveDuration > 0 ? fmtSec(liveDuration) : "--:--"}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-7">
          <button
            type="button"
            aria-label={isId ? "Lagu sebelumnya" : "Previous track"}
            onClick={() => invoke("smtc_action", { action: "prev" }).catch(() => {})}
            className="w-10 h-10 rounded-full flex items-center justify-center opacity-75 hover:opacity-100 transition-all hover:scale-110 active:scale-95 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
            style={{ color: palette.textPrimary }}
          >
            <SkipBack size={21} fill="currentColor" />
          </button>

          <button
            type="button"
            aria-label={media.is_playing ? (isId ? "Jeda" : "Pause") : isId ? "Putar" : "Play"}
            onClick={() => invoke("smtc_action", { action: "toggle" }).catch(() => {})}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
            style={{
              backgroundColor: palette.night ? palette.textPrimary : "#f5f5f7",
              color: "#000000",
            }}
          >
            {media.is_playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" className="translate-x-[1px]" />}
          </button>

          <button
            type="button"
            aria-label={isId ? "Lagu berikutnya" : "Next track"}
            onClick={() => invoke("smtc_action", { action: "next" }).catch(() => {})}
            className="w-10 h-10 rounded-full flex items-center justify-center opacity-75 hover:opacity-100 transition-all hover:scale-110 active:scale-95 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
            style={{ color: palette.textPrimary }}
          >
            <SkipForward size={21} fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
};
