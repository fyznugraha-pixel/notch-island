import React, { useState } from "react";
import {
  SkipBack,
  Play,
  Pause,
  SkipForward,
  RotateCw,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { MediaPayload, LyricsPayload, requestLyricsRefresh } from "../../services/mediaLyricsStore";
import { LyricsProviderId } from "../../services/lyrics/types";

export interface MiniPlayerToolbarProps {
  mode: "bar" | "card";
  onSetMode: (mode: "bar" | "card") => void;
  offset: number;
  onOffsetChange: (delta: number) => void;
  onResetOffset: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onReturnToNotch: () => void;
  onClose: () => void;
  media: MediaPayload | null;
  lyrics: LyricsPayload | null;
}

const PROVIDERS: { id: LyricsProviderId; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "lrclib", label: "LRCLIB" },
  { id: "qqmusic", label: "QQ" },
  { id: "netease", label: "NetEase" },
];

export const MiniPlayerToolbar: React.FC<MiniPlayerToolbarProps> = ({
  mode,
  onSetMode,
  offset,
  onOffsetChange,
  onResetOffset,
  isPinned,
  onTogglePin,
  onReturnToNotch,
  onClose,
  media,
  lyrics,
}) => {
  const isPlaying = Boolean(media?.is_playing);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [currentProvider, setCurrentProvider] = useState<LyricsProviderId>(() => {
    try {
      const saved = localStorage.getItem("notch_lyrics_provider") as LyricsProviderId;
      return saved || (lyrics?.provider as LyricsProviderId) || "auto";
    } catch {
      return "auto";
    }
  });

  const handleMediaControl = async (e: React.MouseEvent, action: "prev" | "toggle" | "next") => {
    e.stopPropagation();
    try {
      await invoke("smtc_action", { action });
    } catch {}
  };

  const handleCycleProvider = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const currIdx = PROVIDERS.findIndex((p) => p.id === currentProvider);
    const nextIdx = (currIdx + 1) % PROVIDERS.length;
    const nextProvider = PROVIDERS[nextIdx].id;
    setCurrentProvider(nextProvider);

    try {
      localStorage.setItem("notch_lyrics_provider", nextProvider);
      window.dispatchEvent(
        new CustomEvent("notch_lyrics_provider_changed", { detail: nextProvider })
      );
    } catch {}

    if (media?.title) {
      setIsRefreshing(true);
      await requestLyricsRefresh(media.artist || "", media.title, nextProvider);
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!media?.title) return;
    setIsRefreshing(true);
    await requestLyricsRefresh(media.artist || "", media.title, currentProvider);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const formattedOffset =
    offset === 0 ? "0.0s" : `${offset > 0 ? "+" : ""}${offset.toFixed(1)}s`;

  const providerLabel =
    PROVIDERS.find((p) => p.id === currentProvider)?.label || currentProvider;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      data-no-drag
      className="flex items-center justify-between h-9 gap-2 select-none text-white w-full"
    >
      {/* Left: Mode Segmented Switcher (Bar vs Card) */}
      <div className="flex gap-0.5 p-0.5 rounded-[11px] bg-white/10 shrink-0">
        <button
          onClick={() => onSetMode("bar")}
          className={`w-7 h-7 rounded-[9px] flex items-center justify-center transition-colors ${
            mode === "bar" ? "bg-white/25 text-white" : "bg-transparent text-white/60 hover:text-white"
          }`}
          aria-label="Mode bar"
          title="Mode Bar (Ringkas)"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="8" width="18" height="8" rx="3" />
            <path d="M8 12h8" />
          </svg>
        </button>
        <button
          onClick={() => onSetMode("card")}
          className={`w-7 h-7 rounded-[9px] flex items-center justify-center transition-colors ${
            mode === "card" ? "bg-white/25 text-white" : "bg-transparent text-white/60 hover:text-white"
          }`}
          aria-label="Mode kartu"
          title="Mode Kartu (5 Baris Lirik)"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="6" y="3" width="12" height="18" rx="3" />
            <path d="M9 9h6M9 13h6M9 17h3" />
          </svg>
        </button>
      </div>

      {/* Center: Playback Controls (Bar Mode only) */}
      {mode === "bar" && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => handleMediaControl(e, "prev")}
            className="w-[30px] h-[30px] flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            aria-label="Sebelumnya"
          >
            <SkipBack size={14} fill="currentColor" />
          </button>
          <button
            onClick={(e) => handleMediaControl(e, "toggle")}
            className="w-[30px] h-[30px] rounded-full bg-white text-[#111] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-md"
            aria-label={isPlaying ? "Jeda" : "Putar"}
          >
            {isPlaying ? (
              <Pause size={13} fill="currentColor" />
            ) : (
              <Play size={13} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <button
            onClick={(e) => handleMediaControl(e, "next")}
            className="w-[30px] h-[30px] flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            aria-label="Berikutnya"
          >
            <SkipForward size={14} fill="currentColor" />
          </button>
        </div>
      )}

      {/* Right Controls: Provider, Refresh, Offset, Pin, Return to Notch, Close */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Lyrics Provider Selector Pill */}
        <button
          onClick={handleCycleProvider}
          className="h-[26px] px-2 rounded-[13px] border border-white/15 bg-white/10 hover:bg-white/20 text-[11px] font-medium text-white/90 transition-colors flex items-center gap-1"
          title={`Sumber lirik aktif: ${providerLabel}. Klik untuk ganti.`}
          aria-label="Ganti sumber lirik"
        >
          <span className="text-[10px] text-white/60">Src:</span>
          <span>{providerLabel}</span>
        </button>

        {/* Refresh Lyrics Button */}
        <button
          onClick={handleRefresh}
          className="w-7 h-7 rounded-[9px] flex items-center justify-center text-white/75 hover:text-white hover:bg-white/15 transition-colors"
          title="Muat ulang lirik"
          aria-label="Muat ulang lirik"
        >
          <RotateCw size={13} className={isRefreshing ? "animate-spin text-[#3B9DF8]" : ""} />
        </button>

        {/* Offset Calibration: - 0.0s + */}
        <div className="flex items-center gap-2 h-[26px] px-2.5 rounded-[13px] border border-white/15 bg-white/5 text-[11px] font-mono text-white/90">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOffsetChange(-0.5);
            }}
            className="text-white/60 hover:text-white text-[13px] font-bold leading-none p-0.5"
            aria-label="Mundurkan lirik"
            title="Mundurkan 0.5s"
          >
            -
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onResetOffset();
            }}
            className="hover:text-white cursor-pointer select-none"
            title="Klik untuk reset offset ke 0.0s"
          >
            {formattedOffset}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOffsetChange(0.5);
            }}
            className="text-white/60 hover:text-white text-[13px] font-bold leading-none p-0.5"
            aria-label="Majukan lirik"
            title="Majukan 0.5s"
          >
            +
          </button>
        </div>

        {/* Action Icon Buttons */}
        <div className="flex items-center gap-0.5">
          {/* Pin Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={`w-7 h-7 rounded-[9px] flex items-center justify-center transition-colors ${
              isPinned
                ? "bg-white/25 text-[#3B9DF8]"
                : "text-white/70 hover:text-white hover:bg-white/15"
            }`}
            aria-label="Sematkan di atas"
            title={isPinned ? "Lepas sematan" : "Sematkan di atas"}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 17v5M8 3h8l-1 6 3 3H6l3-3z" />
            </svg>
          </button>

          {/* Return to Notch */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReturnToNotch();
            }}
            className="w-7 h-7 rounded-[9px] flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-colors"
            aria-label="Kembali ke notch"
            title="Kembali ke notch"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4h16M12 20V8M8 12l4-4 4 4" />
            </svg>
          </button>

          {/* Close */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-7 h-7 rounded-[9px] flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-colors"
            aria-label="Tutup"
            title="Tutup mini player"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
