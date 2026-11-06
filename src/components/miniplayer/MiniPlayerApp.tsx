import React, { useEffect, useState, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { initMediaLyricsStore, subscribeMedia, subscribeLyrics, MediaPayload, LyricsPayload } from "../../services/mediaLyricsStore";
import { MiniPlayerBarMode } from "./MiniPlayerBarMode";
import { extractDominantColor } from "./colorExtractor";

export const MiniPlayerApp: React.FC = () => {
  const [media, setMedia] = useState<MediaPayload | null>(null);
  const [lyrics, setLyrics] = useState<LyricsPayload | null>(null);
  const [tintColor, setTintColor] = useState<string>("#121216");
  const [theme] = useState<"solid" | "liquid">(() => {
    try {
      const preset = localStorage.getItem("island_transparency_preset");
      return preset === "liquid_glass" ? "liquid" : "solid";
    } catch {
      return "solid";
    }
  });

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

  // Extract dominant color when media thumbnail changes
  useEffect(() => {
    let isCancelled = false;
    extractDominantColor(media?.thumbnail).then((color) => {
      if (!isCancelled) setTintColor(color);
    });
    return () => {
      isCancelled = true;
    };
  }, [media?.thumbnail]);

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
    <div ref={containerRef} className="w-[440px] h-[88px] overflow-hidden select-none">
      <MiniPlayerBarMode
        media={media}
        lyrics={lyrics}
        theme={theme}
        tintColor={tintColor}
      />
    </div>
  );
};
