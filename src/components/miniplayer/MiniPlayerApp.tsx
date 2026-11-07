import React, { useEffect, useState, useRef, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import {
  initMediaLyricsStore,
  subscribeMedia,
  subscribeLyrics,
  setSongLyricsOffset,
  MediaPayload,
  LyricsPayload,
} from "../../services/mediaLyricsStore";
import { MiniPlayerBarMode } from "./MiniPlayerBarMode";
import { MiniPlayerCardMode } from "./MiniPlayerCardMode";
import { MiniPlayerToolbar } from "./MiniPlayerToolbar";
import { extractDominantColor } from "./colorExtractor";

interface MiniplayerCursorHoverPayload {
  in_window: boolean;
  in_toolbar: boolean;
}

export const MiniPlayerApp: React.FC = () => {
  const [media, setMedia] = useState<MediaPayload | null>(null);
  const [lyrics, setLyrics] = useState<LyricsPayload | null>(null);
  const [tintColor, setTintColor] = useState<string>("#3a1414");
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

  const [isPinned, setIsPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gili_miniplayer_pinned") !== "false";
    } catch {
      return true;
    }
  });

  const [fadeOnHover] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gili_miniplayer_fade_on_hover") !== "false";
    } catch {
      return true;
    }
  });

  const [fadeOpacity] = useState<number>(() => {
    try {
      const val = localStorage.getItem("gili_miniplayer_fade_opacity");
      return val ? parseFloat(val) : 0.3;
    } catch {
      return 0.3;
    }
  });

  const [isFaded, setIsFaded] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [isInZone, setIsInZone] = useState(false);
  const [barWidth, setBarWidth] = useState<number>(440);

  const handleBarWidthChange = useCallback((w: number) => {
    setBarWidth((prev) => (prev !== w ? w : prev));
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const exitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ctrlPollRef = useRef<NodeJS.Timeout | null>(null);
  const dragCheckPollRef = useRef<NodeJS.Timeout | null>(null);
  const latestPosRef = useRef({ x: 0, y: 0, w: 440, h: 130 });
  const isInZoneRef = useRef(false);
  const inWindowRef = useRef(false);

  // Initialize media & lyrics store as listener
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

  // Restore position and track dragging
  useEffect(() => {
    const win = getCurrentWindow();

    const restorePosition = async () => {
      try {
        const saved = localStorage.getItem("gili_miniplayer_pos");
        if (saved) {
          const { x, y, w = 440, h = 130 } = JSON.parse(saved);
          const [snappedX, snappedY] = await invoke<[number, number]>("snap_miniplayer_position", {
            x,
            y,
            width: w,
            height: h,
          });
          await win.setPosition(new LogicalPosition(snappedX, snappedY));
          latestPosRef.current = { x: snappedX, y: snappedY, w, h };
        }
      } catch (e) {
        console.error("Failed to restore miniplayer position:", e);
      }
    };

    restorePosition();

    // Dynamic window resizing following active lyric width (auto layout like notch idle lyrics)
    useEffect(() => {
      if (mode !== "bar") return;
      invoke("resize_miniplayer", { width: barWidth, height: 130 }).catch(() => {});
    }, [mode, barWidth]);

    // Track window moves to check notch proximity and snap
    const unlistenMove = win.onMoved(async (event) => {
      try {
        const { x, y } = event.payload;
        const currentW = mode === "card" ? 380 : barWidth;
        const currentH = mode === "card" ? 340 : 130;
        latestPosRef.current = { x, y, w: currentW, h: currentH };

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

        // Check proximity to notch target zone (M5 Drag-to-merge)
        const prox = await invoke<{ is_near: boolean; is_in_zone: boolean }>("check_notch_proximity", {
          x,
          y,
          width: currentW,
          height: currentH,
        }).catch(() => ({ is_near: false, is_in_zone: false }));

        setIsInZone(prox.is_in_zone);
        isInZoneRef.current = prox.is_in_zone;
        await emit("miniplayer:drag-proximity", prox);

        if (prox.is_near || prox.is_in_zone) {
          if (!dragCheckPollRef.current) {
            dragCheckPollRef.current = setInterval(async () => {
              const isDown = await invoke<boolean>("is_lbutton_down").catch(() => false);
              if (!isDown) {
                if (dragCheckPollRef.current) {
                  clearInterval(dragCheckPollRef.current);
                  dragCheckPollRef.current = null;
                }

                const currentOuterPos = await win.outerPosition().catch(() => null);
                const checkX = currentOuterPos ? currentOuterPos.x : latestPosRef.current.x;
                const checkY = currentOuterPos ? currentOuterPos.y : latestPosRef.current.y;

                const finalCheck = await invoke<{ is_near: boolean; is_in_zone: boolean }>(
                  "check_notch_proximity",
                  {
                    x: checkX,
                    y: checkY,
                    width: currentW,
                    height: currentH,
                  }
                ).catch(() => ({ is_near: false, is_in_zone: false }));

                const shouldMerge = finalCheck.is_in_zone || isInZoneRef.current;

                await emit("miniplayer:drag-proximity", { is_near: false, is_in_zone: false });
                setIsInZone(false);
                isInZoneRef.current = false;

                if (shouldMerge) {
                  await invoke("close_miniplayer");
                  await invoke("reset_miniplayer_position");
                  await emit("miniplayer:return-to-notch");
                }
              }
            }, 35);
          }
        } else {
          setIsInZone(false);
          isInZoneRef.current = false;
          if (dragCheckPollRef.current) {
            clearInterval(dragCheckPollRef.current);
            dragCheckPollRef.current = null;
          }
        }
      } catch {}
    });

    return () => {
      unlistenMove.then((f) => f());
      if (dragCheckPollRef.current) {
        clearInterval(dragCheckPollRef.current);
        dragCheckPollRef.current = null;
      }
    };
  }, [mode]);

  // Listen to Rust cursor hit-testing across click-through boundaries
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<MiniplayerCursorHoverPayload>("miniplayer:cursor-hover", (event) => {
      const { in_window, in_toolbar } = event.payload;
      inWindowRef.current = in_window;

      if (in_window) {
        if (exitTimerRef.current) {
          clearTimeout(exitTimerRef.current);
          exitTimerRef.current = null;
        }
        setShowToolbar(true);
        if (in_toolbar) {
          // Cursor is directly over toolbar: 100% opacity for clear viewing & dragging
          setIsFaded(false);
        } else {
          // Cursor is over any window part except toolbar: lowered opacity for click-through
          if (fadeOnHover) {
            setIsFaded(true);
          }
        }
      } else {
        if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        exitTimerRef.current = setTimeout(() => {
          setIsFaded(false);
          setShowToolbar(false);
          exitTimerRef.current = null;
        }, 120);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [fadeOnHover]);

  // Hover behavior: shows toolbar when entering window
  const handleMouseEnter = useCallback(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setShowToolbar(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    // If Win32 cursor tracking says cursor is still inside window, ignore DOM mouseleave
    if (inWindowRef.current) return;

    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => {
      setShowToolbar(false);
      setIsFaded(false);
      exitTimerRef.current = null;
    }, 120);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest("a")
    ) {
      return;
    }

    if (e.button === 0) {
      getCurrentWindow().startDragging().catch(() => {});
    }
  }, []);

  const handleClick = useCallback(() => {
    setShowToolbar(true);
  }, []);

  // Ctrl key temporary click-through
  useEffect(() => {
    const handleCheckCtrl = (e: KeyboardEvent | MouseEvent) => {
      if (e.ctrlKey) {
        invoke("set_miniplayer_ignore_cursor", { ignore: true }).catch(() => {});
        if (!ctrlPollRef.current) {
          ctrlPollRef.current = setInterval(async () => {
            const isDown = await invoke<boolean>("is_ctrl_down").catch(() => false);
            if (!isDown) {
              if (ctrlPollRef.current) {
                clearInterval(ctrlPollRef.current);
                ctrlPollRef.current = null;
              }
              await invoke("set_miniplayer_ignore_cursor", { ignore: false }).catch(() => {});
            }
          }, 50);
        }
      }
    };

    window.addEventListener("keydown", handleCheckCtrl);
    window.addEventListener("mousemove", handleCheckCtrl);

    return () => {
      window.removeEventListener("keydown", handleCheckCtrl);
      window.removeEventListener("mousemove", handleCheckCtrl);
      if (ctrlPollRef.current) {
        clearInterval(ctrlPollRef.current);
        ctrlPollRef.current = null;
      }
    };
  }, []);

  // Toolbar actions
  const handleTogglePin = useCallback(async () => {
    const next = !isPinned;
    setIsPinned(next);
    try {
      localStorage.setItem("gili_miniplayer_pinned", String(next));
      await invoke("set_miniplayer_always_on_top", { alwaysOnTop: next });
    } catch (e) {
      console.error("Failed to toggle miniplayer pin:", e);
    }
  }, [isPinned]);

  const handleReturnToNotch = useCallback(async () => {
    try {
      await invoke("close_miniplayer");
      await invoke("reset_miniplayer_position");
      await emit("miniplayer:return-to-notch");
    } catch (e) {
      console.error("Failed to return to notch:", e);
    }
  }, []);

  const handleOffsetChange = useCallback(
    async (delta: number) => {
      if (!media?.title) return;
      const current = lyrics?.offset ?? 0;
      const next = Math.round((current + delta) * 10) / 10;
      const clamped = Math.max(-5, Math.min(5, next));
      await setSongLyricsOffset(media.artist || "", media.title, clamped);
    },
    [media?.artist, media?.title, lyrics?.offset]
  );

  const handleResetOffset = useCallback(async () => {
    if (!media?.title) return;
    await setSongLyricsOffset(media.artist || "", media.title, 0);
  }, [media?.artist, media?.title]);

  const currentOffset = lyrics?.offset ?? 0;

  const toolbarNode = (
    <MiniPlayerToolbar
      mode={mode}
      onSetMode={handleSetMode}
      offset={currentOffset}
      onOffsetChange={handleOffsetChange}
      onResetOffset={handleResetOffset}
      isPinned={isPinned}
      onTogglePin={handleTogglePin}
      onReturnToNotch={handleReturnToNotch}
      media={media}
      lyrics={lyrics}
    />
  );

  const currentW = mode === "card" ? 380 : barWidth;

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      style={{
        width: `${currentW}px`,
        opacity: isFaded ? fadeOpacity : isInZone ? 0.8 : 1,
        transform: isInZone ? "scale(0.6)" : "scale(1)",
        transformOrigin: "bottom center",
        transition: "width 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms cubic-bezier(0.16, 1, 0.3, 1), transform 180ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      className={`relative overflow-hidden select-none bg-transparent transition-[height] duration-200 ease-out ${
        mode === "card"
          ? "h-[340px]"
          : "h-[130px] flex flex-col justify-end items-end"
      }`}
    >
      {mode === "card" ? (
        <MiniPlayerCardMode
          media={media}
          lyrics={lyrics}
          theme={theme}
          tintColor={tintColor}
          showToolbar={showToolbar}
          toolbarNode={toolbarNode}
          onToggleMode={() => handleSetMode("bar")}
        />
      ) : (
        <MiniPlayerBarMode
          media={media}
          lyrics={lyrics}
          theme={theme}
          tintColor={tintColor}
          showToolbar={showToolbar}
          toolbarNode={toolbarNode}
          onToggleMode={() => handleSetMode("card")}
          onWidthChange={handleBarWidthChange}
        />
      )}
    </div>
  );
};
