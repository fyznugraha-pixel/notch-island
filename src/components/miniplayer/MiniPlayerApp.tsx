import React, { useEffect, useState, useRef, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { initMediaLyricsStore, subscribeMedia, subscribeLyrics, MediaPayload, LyricsPayload } from "../../services/mediaLyricsStore";
import { MiniPlayerBarMode } from "./MiniPlayerBarMode";
import { MiniPlayerCardMode } from "./MiniPlayerCardMode";
import { extractDominantColor } from "./colorExtractor";

export const MiniPlayerApp: React.FC = () => {
  const [media, setMedia] = useState<MediaPayload | null>(null);
  const [lyrics, setLyrics] = useState<LyricsPayload | null>(null);
  const [tintColor, setTintColor] = useState<string>("#121216");
  const [mode, setMode] = useState<"bar" | "card">(() => {
    try {
      const saved = localStorage.getItem("gili_miniplayer_mode");
      return saved === "card" ? "card" : "bar";
    } catch {
      return "bar";
    }
  });

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

  // Sync mode with window size on initial mount
  useEffect(() => {
    if (mode === "card") {
      invoke("set_miniplayer_mode", { mode: "card" }).catch(() => {});
    }
  }, []);

  const handleSetMode = useCallback(async (nextMode: "bar" | "card") => {
    setMode(nextMode);
    try {
      localStorage.setItem("gili_miniplayer_mode", nextMode);
      await invoke("set_miniplayer_mode", { mode: nextMode });
    } catch (e) {
      console.error("Failed to switch miniplayer mode:", e);
    }
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
        const currentW = mode === "card" ? 380 : 440;
        const currentH = mode === "card" ? 440 : 88;
        const [snappedX, snappedY] = await invoke<[number, number]>("snap_miniplayer_position", {
          x,
          y,
          width: currentW,
          height: currentH,
        });
        localStorage.setItem(
          "gili_miniplayer_pos",
          JSON.stringify({ x: snappedX, y: snappedY, w: currentW, h: currentH })
        );
      } catch {}
    });

    return () => {
      unlistenMove.then((f) => f());
    };
  }, [mode]);

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden select-none transition-[width,height] duration-200 ease-out ${
        mode === "card" ? "w-[380px] h-[440px]" : "w-[440px] h-[88px]"
      }`}
    >
      {mode === "card" ? (
        <MiniPlayerCardMode
          media={media}
          lyrics={lyrics}
          theme={theme}
          tintColor={tintColor}
          onToggleMode={() => handleSetMode("bar")}
        />
      ) : (
        <MiniPlayerBarMode
          media={media}
          lyrics={lyrics}
          theme={theme}
          tintColor={tintColor}
          onToggleMode={() => handleSetMode("card")}
        />
      )}
    </div>
  );
};
