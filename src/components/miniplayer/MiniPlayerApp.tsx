import React, { useEffect, useState, useRef, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
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
  const [positionBottom, setPositionBottom] = useState(false);
  const [isInZone, setIsInZone] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dwellTimerRef = useRef<NodeJS.Timeout | null>(null);
  const exitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ctrlPollRef = useRef<NodeJS.Timeout | null>(null);
  const dragCheckPollRef = useRef<NodeJS.Timeout | null>(null);
  // Track whether the user is currently dragging the window
  const isDraggingRef = useRef(false);

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

  // Enforce click-through from frontend side on mount.
  // This handles the race where Rust sets ignore_cursor before WebView2 is ready.
  useEffect(() => {
    const timer = setTimeout(() => {
      invoke("set_miniplayer_ignore_cursor", { ignore: true }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
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
          setPositionBottom(snappedY < 48);
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
        setPositionBottom(snappedY < 48);
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

                const finalCheck = await invoke<{ is_near: boolean; is_in_zone: boolean }>(
                  "check_notch_proximity",
                  {
                    x,
                    y,
                    width: currentW,
                    height: currentH,
                  }
                ).catch(() => ({ is_near: false, is_in_zone: false }));

                await emit("miniplayer:drag-proximity", { is_near: false, is_in_zone: false });
                setIsInZone(false);

                if (finalCheck.is_in_zone) {
                  await invoke("close_miniplayer");
                  await emit("miniplayer:return-to-notch");
                }
              }
            }, 40);
          }
        } else {
          setIsInZone(false);
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

  // Hover dwell behavior (M4):
  // 1. Cursor enters: fade to 30% immediately during the first 350ms.
  // 2. If cursor dwells > 350ms or user clicks: restore 100% and show toolbar.
  // 3. Fast pass-through: stays faded, restores upon exit.
  // 4. Cursor exits: 120ms debounce to prevent flicker before hiding toolbar and restoring opacity.
  const handleMouseEnter = useCallback(() => {
    // Re-enable cursor events so the user can interact with controls and drag
    invoke("set_miniplayer_ignore_cursor", { ignore: false }).catch(() => {});
    isDraggingRef.current = false;

    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }

    if (fadeOnHover) {
      setIsFaded(true);
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = setTimeout(() => {
        setIsFaded(false);
        setShowToolbar(true);
        dwellTimerRef.current = null;
      }, 350);
    } else {
      setIsFaded(false);
      setShowToolbar(true);
    }
  }, [fadeOnHover]);

  const handleMouseLeave = useCallback(() => {
    // If the user is dragging, don't go click-through — that would kill the drag
    if (isDraggingRef.current) return;

    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }

    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => {
      setShowToolbar(false);
      setIsFaded(false);
      // Return to click-through so the window doesn't block apps underneath
      invoke("set_miniplayer_ignore_cursor", { ignore: true }).catch(() => {});
      exitTimerRef.current = null;
    }, 120);
  }, []);

  const handleMouseDown = useCallback(() => {
    isDraggingRef.current = true;
    // Ensure cursor events stay on during the drag
    invoke("set_miniplayer_ignore_cursor", { ignore: false }).catch(() => {});

    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mouseup", onMouseUp);
      // After drag ends, restore click-through after a short delay.
      // The delay lets onMouseEnter fire first if cursor is still inside.
      setTimeout(() => {
        if (!isDraggingRef.current) {
          invoke("set_miniplayer_ignore_cursor", { ignore: true }).catch(() => {});
        }
      }, 150);
    };
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  const handleClick = useCallback(() => {
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    setIsFaded(false);
    setShowToolbar(true);
  }, []);

  // Ctrl key temporary click-through (M4):
  // Holding Ctrl ignores cursor events so mouse clicks go straight through to apps underneath.
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
      // Don't force-enable cursor events on unmount; leave it in click-through state
      // since the window will be hidden/closed anyway
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
      await emit("miniplayer:return-to-notch");
    } catch (e) {
      console.error("Failed to return to notch:", e);
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      await invoke("close_miniplayer");
    } catch (e) {
      console.error("Failed to close miniplayer:", e);
    }
  }, []);

  const handleOffsetChange = useCallback(
    async (delta: number) => {
      if (!media?.title) return;
      const current = lyrics?.offset ?? 0;
      const next = Math.round((current + delta) * 10) / 10;
      await setSongLyricsOffset(media.artist || "", media.title, next);
    },
    [media?.artist, media?.title, lyrics?.offset]
  );

  const handleResetOffset = useCallback(async () => {
    if (!media?.title) return;
    await setSongLyricsOffset(media.artist || "", media.title, 0);
  }, [media?.artist, media?.title]);

  const currentOffset = lyrics?.offset ?? 0;

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      style={{
        opacity: isFaded ? fadeOpacity : 1,
        transform: isInZone ? "scale(0.85)" : "scale(1)",
        transition: "opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      className={`relative overflow-hidden select-none transition-[width,height] duration-200 ease-out ${
        mode === "card" ? "w-[380px] h-[440px]" : "w-[440px] h-[88px]"
      }`}
    >
      {/* Floating Toolbar with seamless fade and position adaptation */}
      <div
        className={`transition-all duration-150 ease-out ${
          showToolbar
            ? "opacity-100 pointer-events-auto scale-100"
            : "opacity-0 pointer-events-none scale-95"
        }`}
      >
        <MiniPlayerToolbar
          mode={mode}
          onSetMode={handleSetMode}
          offset={currentOffset}
          onOffsetChange={handleOffsetChange}
          onResetOffset={handleResetOffset}
          isPinned={isPinned}
          onTogglePin={handleTogglePin}
          onReturnToNotch={handleReturnToNotch}
          onClose={handleClose}
          media={media}
          positionBottom={positionBottom}
        />
      </div>

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
