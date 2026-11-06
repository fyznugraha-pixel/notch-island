import React, { useEffect, useState, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { initMediaLyricsStore, subscribeMedia, subscribeLyrics, MediaPayload, LyricsPayload } from "../../services/mediaLyricsStore";

export const MiniPlayerApp: React.FC = () => {
  const [media, setMedia] = useState<MediaPayload | null>(null);
  const [lyrics, setLyrics] = useState<LyricsPayload | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize media & lyrics store as listener (not coordinator)
  useEffect(() => {
    let unlistenLyrics: (() => void) | null = null;
    let unlistenMedia: (() => void) | null = null;

    initMediaLyricsStore(false).then(() => {
      unlistenMedia = subscribeMedia((m) => setMedia(m));
      unlistenLyrics = subscribeLyrics((l) => setLyrics(l));
    });

    return () => {
      if (unlistenMedia) unlistenMedia();
      if (unlistenLyrics) unlistenLyrics();
    };
  }, []);

  // Restore position and listen to move/drag snapping
  useEffect(() => {
    const win = getCurrentWindow();

    const restorePosition = async () => {
      try {
        const saved = localStorage.getItem("gili_miniplayer_pos");
        if (saved) {
          const { x, y, w = 440, h = 88 } = JSON.parse(saved);
          const [snappedX, snappedY] = await invoke<[number, number]>("snap_miniplayer_position", {
            x,
            y,
            width: w,
            height: h,
          });
          await win.setPosition(new LogicalPosition(snappedX, snappedY));
        }
      } catch (e) {
        console.error("Failed to restore miniplayer position:", e);
      }
    };

    restorePosition();

    // Track window moves to save clamped position
    const unlistenMove = win.onMoved(async (event) => {
      try {
        const { x, y } = event.payload;
        const [snappedX, snappedY] = await invoke<[number, number]>("snap_miniplayer_position", {
          x,
          y,
          width: 440,
          height: 88,
        });
        localStorage.setItem(
          "gili_miniplayer_pos",
          JSON.stringify({ x: snappedX, y: snappedY, w: 440, h: 88 })
        );
      } catch {}
    });

    return () => {
      unlistenMove.then((f) => f());
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-tauri-drag-region
      className="w-full h-full select-none cursor-move flex items-center justify-between px-4 py-2 bg-[#121216] text-white rounded-[20px] shadow-2xl border border-white/10"
      style={{ width: "440px", height: "88px" }}
    >
      <div className="flex items-center gap-3 pointer-events-none">
        {media?.thumbnail ? (
          <img
            src={media.thumbnail}
            alt={media.title || "Album Cover"}
            className="w-14 h-14 rounded-xl object-cover shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <span className="text-xl">🎵</span>
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-[11.5px] text-white/60 truncate">
            {media?.title ? `${media.title} • ${media.artist || "Unknown"}` : "Gili Mini Player"}
          </span>
          <span className="text-[14.5px] font-bold text-white truncate mt-0.5">
            {lyrics?.lines && lyrics.lines.length > 0
              ? lyrics.lines[0].text
              : lyrics?.state === "loading"
              ? "Memuat lirik..."
              : "Siap memutar"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={async () => {
            await invoke("close_miniplayer");
          }}
          className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer"
          aria-label="Tutup Mini Player"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
