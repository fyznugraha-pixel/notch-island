import React, { useMemo, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MediaPayload, LyricsPayload } from "../../services/mediaLyricsStore";
import { useLyricsSync } from "./lyricsSync";
import { ScrollingText } from "../ui/ScrollingText";

export interface MiniPlayerCardModeProps {
  media: MediaPayload | null;
  lyrics: LyricsPayload | null;
  theme: "solid" | "liquid";
  tintColor: string;
  showToolbar: boolean;
  toolbarNode: React.ReactNode;
  onToggleMode?: () => void;
}

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

  const { activeIndex } = useLyricsSync(
    lyrics,
    position,
    duration,
    isPlaying,
    lyrics?.offset || 0
  );

  const containerStyle = useMemo(() => {
    if (theme === "solid") {
      return {
        background: `linear-gradient(135deg, ${tintColor || "#3a1414"}, #0c0c10 125%)`,
        opacity: 1.0,
      };
    }
    return {
      backgroundColor: "rgba(18, 18, 24, 0.75)",
      backdropFilter: "blur(28px) saturate(180%)",
      WebkitBackdropFilter: "blur(28px) saturate(180%)",
    };
  }, [theme, tintColor]);

  // Smooth lyrics auto-scroll refs
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const userScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to center active lyric line
  useEffect(() => {
    if (userScrollingRef.current) return;
    if (activeIndex >= 0 && lyricsContainerRef.current && activeLineRef.current) {
      const container = lyricsContainerRef.current;
      const line = activeLineRef.current;
      const containerRect = container.getBoundingClientRect();
      const lineRect = line.getBoundingClientRect();

      const targetScrollTop =
        container.scrollTop +
        (lineRect.top - containerRect.top) -
        containerRect.height / 2 +
        lineRect.height / 2;

      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: "smooth",
      });
    }
  }, [activeIndex]);

  // Reset scroll when track changes
  useEffect(() => {
    userScrollingRef.current = false;
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
      userScrollTimeoutRef.current = null;
    }
    if (lyricsContainerRef.current) {
      lyricsContainerRef.current.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [lyrics?.title, lyrics?.artist]);

  // Wheel interaction: temporarily pause auto-scroll, then resume after 2.5s
  const handleWheel = useCallback(() => {
    userScrollingRef.current = true;
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false;
      if (activeIndex >= 0 && lyricsContainerRef.current && activeLineRef.current) {
        const container = lyricsContainerRef.current;
        const line = activeLineRef.current;
        const containerRect = container.getBoundingClientRect();
        const lineRect = line.getBoundingClientRect();

        const targetScrollTop =
          container.scrollTop +
          (lineRect.top - containerRect.top) -
          containerRect.height / 2 +
          lineRect.height / 2;

        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth",
        });
      }
    }, 2500);
  }, [activeIndex]);

  const handleLineClick = useCallback(async (e: React.MouseEvent, lineTime: number) => {
    e.stopPropagation();
    userScrollingRef.current = false;
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
      userScrollTimeoutRef.current = null;
    }
    try {
      await invoke("smtc_seek", { positionSec: lineTime });
    } catch {}
  }, []);

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={onToggleMode}
      className={`relative box-border w-[380px] h-[340px] text-white select-none cursor-move rounded-[28px] p-[6px_18px_14px] flex flex-col justify-between overflow-hidden shadow-none ${
        theme === "solid" ? "border border-white/[0.09]" : "border border-white/[0.16]"
      }`}
      style={containerStyle}
    >
      {/* Top 36px Slot: Grab Handle (normal) or Toolbar (hover) */}
      <div data-tauri-drag-region className="h-9 w-full shrink-0 flex items-center justify-center cursor-move">
        {showToolbar ? (
          <div className="w-full h-full flex items-center">{toolbarNode}</div>
        ) : (
          <span
            aria-hidden="true"
            className="w-9 h-1 rounded-full bg-white/20 pointer-events-none"
          />
        )}
      </div>

      {/* Header: 60px Album Art + Title/Artist + Equalizer */}
      <div data-tauri-drag-region className="flex items-center gap-3.5 shrink-0 mt-1 cursor-move">
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

        <div className="flex flex-col min-w-0 flex-1">
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
        <svg
          width="20"
          height="22"
          viewBox="0 0 25 28"
          role="img"
          aria-label="Sedang memutar"
          className="shrink-0"
        >
          <rect
            x="0"
            y={isPlaying ? "9" : "15"}
            width="3.5"
            height={isPlaying ? "10" : "4"}
            rx="1.75"
            fill="#3B9DF8"
            className={isPlaying ? "animate-pulse" : ""}
          />
          <rect
            x="5.5"
            y={isPlaying ? "5" : "15"}
            width="3.5"
            height={isPlaying ? "18" : "4"}
            rx="1.75"
            fill="#3B9DF8"
            className={isPlaying ? "animate-pulse" : ""}
          />
          <rect
            x="11"
            y={isPlaying ? "1" : "15"}
            width="3.5"
            height={isPlaying ? "26" : "4"}
            rx="1.75"
            fill="#3B9DF8"
            className={isPlaying ? "animate-pulse" : ""}
          />
          <rect
            x="16.5"
            y={isPlaying ? "6" : "15"}
            width="3.5"
            height={isPlaying ? "16" : "4"}
            rx="1.75"
            fill="#3B9DF8"
            className={isPlaying ? "animate-pulse" : ""}
          />
          <rect
            x="22"
            y={isPlaying ? "10" : "15"}
            width="3.5"
            height={isPlaying ? "8" : "4"}
            rx="1.75"
            fill="#3B9DF8"
            className={isPlaying ? "animate-pulse" : ""}
          />
        </svg>
      </div>

      {/* Center: Synced Lyrics Display */}
      <div
        ref={lyricsContainerRef}
        onWheel={handleWheel}
        data-no-drag
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 16%, black 84%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 16%, black 84%, transparent 100%)",
        }}
        className="flex-1 my-1 overflow-y-auto overflow-x-hidden relative select-none scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {lyrics?.state === "loading" ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-white/50 text-sm py-12">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
            <span>Memuat lirik...</span>
          </div>
        ) : lyrics?.state === "instrumental" ? (
          <div className="h-full flex items-center justify-center text-center text-white/60 text-[15px] font-medium py-12">
            ♪ Lagu Instrumental ♪
          </div>
        ) : lyrics?.state === "not_found" ? (
          <div className="h-full flex items-center justify-center text-center text-white/50 text-[13.5px] py-12">
            Lirik tidak ditemukan
          </div>
        ) : lyrics?.synced && lyrics.lines && lyrics.lines.length > 0 ? (
          <div className="flex flex-col items-center space-y-2 pt-[92px] pb-[100px] px-2 w-full">
            {lyrics.lines.map((line, index) => {
              const distance = Math.abs(index - activeIndex);
              const isActive = index === activeIndex;
              const isNear = distance === 1;
              const isMid = distance === 2;

              return (
                <div
                  key={`${index}-${line.time}`}
                  ref={isActive ? activeLineRef : null}
                  onClick={(e) => handleLineClick(e, line.time)}
                  className={`cursor-pointer transition-all duration-300 ease-out h-[32px] flex items-center justify-center w-full max-w-[340px] px-2 rounded-xl select-none ${
                    isActive
                      ? "text-[14px] font-bold text-white scale-100"
                      : isNear
                      ? "text-[13px] font-medium text-white/50 hover:text-white/80 scale-[0.98]"
                      : isMid
                      ? "text-[12.5px] font-normal text-white/30 hover:text-white/60 scale-[0.96]"
                      : "text-[12px] font-normal text-white/18 hover:text-white/50 scale-[0.94]"
                  }`}
                  style={
                    isActive
                      ? { textShadow: "0 0 14px rgba(255, 255, 255, 0.4)" }
                      : undefined
                  }
                >
                  {isActive ? (
                    <ScrollingText
                      text={line.text || "•••"}
                      speed={28}
                      pauseSeconds={1.5}
                      align="center"
                      className="w-full text-center text-[14px] font-bold text-white"
                    />
                  ) : (
                    <span className="truncate w-full text-center whitespace-nowrap">
                      {line.text || "•••"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : lyrics?.plain_lyrics ? (
          <div className="text-center text-white/70 text-[13px] py-4 px-3 overflow-y-auto max-h-[190px] leading-relaxed whitespace-pre-wrap">
            {lyrics.plain_lyrics}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-center text-white/40 text-[13.5px] py-12">
            {media?.title ? "Lirik tidak tersedia" : "Menunggu pemutaran musik..."}
          </div>
        )}
      </div>
    </div>
  );
};
