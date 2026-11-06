import React from "react";
import {
  Minus,
  Plus,
  Pin,
  ArrowUpToLine,
  X,
  SkipBack,
  Play,
  Pause,
  SkipForward,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { MediaPayload } from "../../services/mediaLyricsStore";

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
  positionBottom?: boolean;
}

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
  positionBottom = false,
}) => {
  const isPlaying = Boolean(media?.is_playing);

  const handleMediaControl = async (e: React.MouseEvent, action: "prev" | "toggle" | "next") => {
    e.stopPropagation();
    try {
      await invoke("smtc_action", { action });
    } catch {}
  };

  const formattedOffset =
    offset === 0 ? "0.0s" : `${offset > 0 ? "+" : ""}${offset.toFixed(1)}s`;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className={`absolute left-2 right-2 z-50 flex items-center justify-between px-2.5 py-1.5 rounded-full bg-black/65 backdrop-blur-xl border border-white/15 shadow-xl text-white transition-all select-none ${
        positionBottom ? "bottom-2" : "top-2"
      }`}
    >
      {/* Left: Mode Toggle (Bar vs Card) */}
      <div className="flex items-center p-0.5 rounded-full bg-white/10 border border-white/5">
        <button
          onClick={() => onSetMode("bar")}
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1 transition-colors ${
            mode === "bar"
              ? "bg-white text-black shadow-sm"
              : "text-white/70 hover:text-white"
          }`}
          aria-label="Mode Bar"
        >
          <span className="w-3.5 h-1.5 rounded-full border border-current" />
        </button>
        <button
          onClick={() => onSetMode("card")}
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1 transition-colors ${
            mode === "card"
              ? "bg-white text-black shadow-sm"
              : "text-white/70 hover:text-white"
          }`}
          aria-label="Mode Kartu"
        >
          <span className="w-2.5 h-3 rounded-sm border border-current" />
        </button>
      </div>

      {/* Center: Playback Controls (Bar Mode only) */}
      {mode === "bar" && (
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => handleMediaControl(e, "prev")}
            className="w-7 h-7 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors"
            aria-label="Sebelumnya"
          >
            <SkipBack size={15} fill="currentColor" />
          </button>
          <button
            onClick={(e) => handleMediaControl(e, "toggle")}
            className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            aria-label={isPlaying ? "Jeda" : "Putar"}
          >
            {isPlaying ? (
              <Pause size={14} fill="currentColor" />
            ) : (
              <Play size={14} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <button
            onClick={(e) => handleMediaControl(e, "next")}
            className="w-7 h-7 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors"
            aria-label="Berikutnya"
          >
            <SkipForward size={15} fill="currentColor" />
          </button>
        </div>
      )}

      {/* Right Controls: Offset (-/+ 0.5s), Pin, Return to Notch, Close */}
      <div className="flex items-center gap-1.5">
        {/* Offset Control: - / 0.0s / + */}
        <div className="flex items-center px-1.5 py-0.5 rounded-full bg-white/10 text-[11.5px] font-mono text-white/80">
          <button
            onClick={() => onOffsetChange(-0.5)}
            className="w-4 h-4 flex items-center justify-center hover:text-white text-white/60 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Kurang offset 0.5 detik"
          >
            <Minus size={11} />
          </button>
          <button
            onClick={onResetOffset}
            className="px-1.5 hover:text-white cursor-pointer select-none"
            title="Klik untuk reset offset ke 0.0s"
          >
            {formattedOffset}
          </button>
          <button
            onClick={() => onOffsetChange(0.5)}
            className="w-4 h-4 flex items-center justify-center hover:text-white text-white/60 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Tambah offset 0.5 detik"
          >
            <Plus size={11} />
          </button>
        </div>

        {/* Pin Button */}
        <button
          onClick={onTogglePin}
          className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
            isPinned
              ? "bg-blue-500/20 text-blue-400 border border-blue-400/40"
              : "text-white/70 hover:text-white hover:bg-white/15"
          }`}
          aria-label={isPinned ? "Lepas sematan" : "Sematkan di atas"}
          title={isPinned ? "Disematkan selalu di atas" : "Sematkan"}
        >
          <Pin size={13} className={isPinned ? "fill-current" : ""} />
        </button>

        {/* Return to Notch */}
        <button
          onClick={onReturnToNotch}
          className="w-6 h-6 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-colors"
          aria-label="Kembali ke notch"
          title="Kembali ke notch"
        >
          <ArrowUpToLine size={13} />
        </button>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-colors"
          aria-label="Tutup mini player"
          title="Tutup"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
};

