import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
import { MiniPlayerBackground } from "./MiniPlayerBackground";
import { extractDominantColor } from "./colorExtractor";
import { useResolvedThumbnail } from "../ui/MediaThumbnail";
import { prefetchArtwork } from "../../services/artworkService";
import { useSystemTextScale } from "../../hooks/useSystemTextScale";
import { getLanguage, setLanguage, Language } from "../../services/i18n";
import { setSoundEffectsEnabled } from "../../services/soundService";

interface MiniplayerCursorHoverPayload {
  in_window: boolean;
  in_toolbar: boolean;
  is_anchored_right?: boolean;
}

function resolveMiniPlayerTheme(): "solid" | "liquid" {
  try {
    const preset = localStorage.getItem("island_transparency_preset");
    if (preset === "liquid_glass") return "liquid";
    if (preset === "solid") return "solid";
    const opacityRaw = localStorage.getItem("island_opacity");
    const blurRaw = localStorage.getItem("island_blur");
    const opacity = opacityRaw !== null ? Number(opacityRaw) : 1.0;
    const blur = blurRaw !== null ? Number(blurRaw) : 0;
    return (!Number.isNaN(opacity) && opacity < 0.92) || (!Number.isNaN(blur) && blur > 5)
      ? "liquid"
      : "solid";
  } catch {
    return "solid";
  }
}

export const MiniPlayerApp: React.FC = () => {
  const effectiveTextScale = useSystemTextScale();
  const [, setOptLanguage] = useState<Language>(() => getLanguage());
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
  const modeRef = useRef<"bar" | "card">(mode);
  modeRef.current = mode;
  const effectiveTextScaleRef = useRef<number>(effectiveTextScale);
  effectiveTextScaleRef.current = effectiveTextScale;

  const [theme, setTheme] = useState<"solid" | "liquid">(resolveMiniPlayerTheme);

  const [isPinned, setIsPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gili_miniplayer_pinned") !== "false";
    } catch {
      return true;
    }
  });

  const fadeOnHover = true;

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
  const [isAnchoredRight, setIsAnchoredRight] = useState(true);
  const [exitState, setExitState] = useState<"idle" | "closing" | "to-notch">("idle");
  const [enterKey, setEnterKey] = useState(1);
  const isExitingRef = useRef(false);
  const triggerExitTimerRef = useRef<number | null>(null);

  const triggerExit = useCallback((type: "closing" | "to-notch") => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;
    setExitState(type);

    try {
      localStorage.removeItem("gili_miniplayer_pos");
    } catch {}

    const durationMs = 240;
    if (triggerExitTimerRef.current) {
      window.clearTimeout(triggerExitTimerRef.current);
    }
    triggerExitTimerRef.current = window.setTimeout(async () => {
      triggerExitTimerRef.current = null;
      try {
        await invoke("close_miniplayer");
        await invoke("reset_miniplayer_position");
        if (type === "to-notch") {
          await emit("miniplayer:return-to-notch");
        }
      } catch (e) {
        console.error("Failed to close miniplayer:", e);
      } finally {
        isExitingRef.current = false;
      }
    }, durationMs);
  }, []);

  const resizeTimerRef = useRef<number | null>(null);
  const modeTransitionTimerRef = useRef<number | null>(null);
  const currentWinWidthRef = useRef<number>(440);

  const checkAnchor = useCallback((x: number, w: number) => {
    const screenW = window.screen.availWidth || 1920;
    const centerX = x + w / 2;
    setIsAnchoredRight(centerX > screenW / 2);
  }, []);

  const handleBarWidthChange = useCallback(
    (newWidth: number) => {
      setBarWidth(newWidth);

      if (mode !== "bar") return;

      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }

      const currentWinW = currentWinWidthRef.current;

      if (newWidth > currentWinW) {
        // Expand immediately so Framer Motion spring has full space without clipping
        currentWinWidthRef.current = newWidth;
        invoke("resize_miniplayer", { width: newWidth, height: 130 }).catch(() => {});
      } else if (newWidth < currentWinW) {
        // Delay shrinking native window until spring animation finishes (~400ms)
        resizeTimerRef.current = window.setTimeout(() => {
          currentWinWidthRef.current = newWidth;
          invoke("resize_miniplayer", { width: newWidth, height: 130 }).catch(() => {});
          resizeTimerRef.current = null;
        }, 420);
      }
    },
    [mode]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const exitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ctrlPollRef = useRef<NodeJS.Timeout | null>(null);
  const dragCheckPollRef = useRef<NodeJS.Timeout | null>(null);
  const latestPosRef = useRef({ x: 0, y: 0, w: 440, h: 130 });
  const isInZoneRef = useRef(false);
  const inWindowRef = useRef(false);
  const inToolbarRef = useRef(false);

  // Initialize media & lyrics store as listener
  useEffect(() => {
    const unlistenMedia = subscribeMedia((m) => {
      if (m && (m.title || m.artist)) {
        prefetchArtwork(m);
      }
      setMedia(m);
    });
    const unlistenLyrics = subscribeLyrics((l) => setLyrics(l));
    initMediaLyricsStore(false);

    let isMounted = true;
    let unlistenSettings: (() => void) | null = null;
    listen<any>("gili-settings-sync", (event) => {
      const payload = event.payload;
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "settings_reset") {
        window.location.reload();
        return;
      }
      if (payload.type !== "setting_key") return;
      const { key, value } = payload;
      if (key === "opt_language") {
        setLanguage(value as Language, false);
        setOptLanguage(value as Language);
      } else if (key === "opt_sound_fx") {
        setSoundEffectsEnabled(Boolean(value));
      } else if (key === "opt_opacity" || key === "opt_blur") {
        if (key === "opt_opacity") {
          try { localStorage.setItem("island_opacity", String(value)); } catch {}
        } else {
          try { localStorage.setItem("island_blur", String(value)); } catch {}
        }
        setTheme(resolveMiniPlayerTheme());
      }
    }).then((fn) => {
      if (!isMounted) fn();
      else unlistenSettings = fn;
    });

    const handleStorageSync = (e: StorageEvent) => {
      if (e.key === "island_opacity" || e.key === "island_blur" || e.key === "island_transparency_preset") {
        setTheme(resolveMiniPlayerTheme());
      }
    };
    window.addEventListener("storage", handleStorageSync);

    return () => {
      isMounted = false;
      unlistenMedia();
      unlistenLyrics();
      unlistenSettings?.();
      window.removeEventListener("storage", handleStorageSync);
    };
  }, []);

  // Listen for window visibility to trigger enter animation and close requests
  useEffect(() => {
    let isMounted = true;
    let unlistenVis: (() => void) | null = null;
    let unlistenCloseReq: (() => void) | null = null;

    listen<boolean>("miniplayer:visibility-changed", (event) => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      inWindowRef.current = false;
      inToolbarRef.current = false;
      setShowToolbar(false);
      setIsFaded(false);

      if (event.payload) {
        isExitingRef.current = false;
        setExitState("idle");
        setIsAnchoredRight(true);
        setEnterKey((k) => k + 1);
        invoke<MediaPayload>("get_current_media")
          .then((m) => {
            if (isMounted && m && (m.title || m.artist)) {
              prefetchArtwork(m);
              setMedia(m);
            }
          })
          .catch(() => {});
      } else {
        try {
          localStorage.removeItem("gili_miniplayer_pos");
        } catch {}
      }
    }).then((un) => {
      if (!isMounted) un();
      else unlistenVis = un;
    });

    listen("miniplayer:request-close", () => {
      triggerExit("closing");
    }).then((un) => {
      if (!isMounted) un();
      else unlistenCloseReq = un;
    });

    return () => {
      isMounted = false;
      if (unlistenVis) unlistenVis();
      if (unlistenCloseReq) unlistenCloseReq();
    };
  }, [triggerExit]);

  // Sync mode with window size on initial mount
  useEffect(() => {
    invoke("set_miniplayer_mode", { mode }).catch(() => {});
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

  const resolvedThumbnail = useResolvedThumbnail(media);
  const effectiveThumbnail = resolvedThumbnail || media?.thumbnail;

  // Extract dominant color when media thumbnail changes
  useEffect(() => {
    let isCancelled = false;
    extractDominantColor(effectiveThumbnail).then((color) => {
      if (!isCancelled) setTintColor(color);
    });
    return () => {
      isCancelled = true;
    };
  }, [effectiveThumbnail]);

  // Track dragging and check notch proximity
  useEffect(() => {
    const win = getCurrentWindow();
    try {
      localStorage.removeItem("gili_miniplayer_pos");
    } catch {}

    let isMounted = true;
    // Track window moves to check notch proximity and snap
    let unlistenMoveFn: (() => void) | null = null;
    win.onMoved(async (event) => {
      if (!isMounted || isExitingRef.current) return;
      try {
        const { x, y } = event.payload;
        const liveMode = modeRef.current;
        const liveScale = effectiveTextScaleRef.current;
        const currentW = Math.round((liveMode === "card" ? 380 : 440) * liveScale);
        const currentH = Math.round((liveMode === "card" ? 340 : 130) * liveScale);
        latestPosRef.current = { x, y, w: currentW, h: currentH };

        const dpr = window.devicePixelRatio || 1;
        checkAnchor(x / dpr, currentW);

        // If user was in the Notch zone and just released LButton, Windows OS may snap y < 0 back to y = 0.
        // Detect that release immediately before any snapped coordinates overwrite isInZoneRef.
        const isDownNow = await invoke<boolean>("is_lbutton_down").catch(() => false);
        if (!isMounted) return;
        if (!isDownNow) {
          if (isInZoneRef.current) {
            if (dragCheckPollRef.current) {
              clearInterval(dragCheckPollRef.current);
              dragCheckPollRef.current = null;
            }
            isInZoneRef.current = false;
            setIsInZone(false);
            await emit("miniplayer:drag-proximity", { is_near: false, is_in_zone: false });
            triggerExit("to-notch");
          }
          return;
        }

        // Check proximity to notch target zone (M5 Drag-to-merge)
        const prox = await invoke<{ is_near: boolean; is_in_zone: boolean }>("check_notch_proximity", {
          x,
          y,
          width: currentW,
          height: currentH,
        }).catch(() => ({ is_near: false, is_in_zone: false }));
        if (!isMounted) return;

        setIsInZone(prox.is_in_zone);
        isInZoneRef.current = prox.is_in_zone;
        await emit("miniplayer:drag-proximity", prox);
        if (!isMounted) return;

        if (prox.is_near || prox.is_in_zone) {
          if (!dragCheckPollRef.current) {
            dragCheckPollRef.current = setInterval(async () => {
              if (!isMounted) return;
              const isDown = await invoke<boolean>("is_lbutton_down").catch(() => false);
              if (!isMounted) return;
              if (!isDown) {
                if (dragCheckPollRef.current) {
                  clearInterval(dragCheckPollRef.current);
                  dragCheckPollRef.current = null;
                }

                const currentOuterPos = await win.outerPosition().catch(() => null);
                if (!isMounted) return;
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
                if (!isMounted) return;

                const shouldMerge = finalCheck.is_in_zone || isInZoneRef.current;

                await emit("miniplayer:drag-proximity", { is_near: false, is_in_zone: false });
                if (!isMounted) return;
                setIsInZone(false);
                isInZoneRef.current = false;

                if (shouldMerge) {
                  triggerExit("to-notch");
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
    }).then((fn) => {
      if (!isMounted) fn();
      else unlistenMoveFn = fn;
    });

    return () => {
      isMounted = false;
      unlistenMoveFn?.();
      if (dragCheckPollRef.current) {
        clearInterval(dragCheckPollRef.current);
        dragCheckPollRef.current = null;
      }
    };
  }, [checkAnchor, triggerExit]);

  // Keep window width ref in sync across mode switches
  useEffect(() => {
    if (mode === "card") {
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      currentWinWidthRef.current = 380;
    } else {
      currentWinWidthRef.current = barWidth;
    }
  }, [mode, barWidth]);

  useEffect(() => {
    return () => {
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
      }
      if (modeTransitionTimerRef.current) {
        window.clearTimeout(modeTransitionTimerRef.current);
      }
      if (triggerExitTimerRef.current) {
        window.clearTimeout(triggerExitTimerRef.current);
        triggerExitTimerRef.current = null;
      }
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, []);

  // Listen to Rust cursor hit-testing across click-through boundaries
  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | null = null;
    listen<MiniplayerCursorHoverPayload>("miniplayer:cursor-hover", (event) => {
      if (!isMounted) return;
      const { in_window, in_toolbar, is_anchored_right } = event.payload;
      inWindowRef.current = in_window;
      inToolbarRef.current = in_toolbar;
      if (typeof is_anchored_right === "boolean") {
        setIsAnchoredRight(is_anchored_right);
      }

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
          if (!isMounted) return;
          setIsFaded(false);
          setShowToolbar(false);
          exitTimerRef.current = null;
        }, 80);
      }
    }).then((fn) => {
      if (!isMounted) fn();
      else unlisten = fn;
    });

    return () => {
      isMounted = false;
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
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
    }, 80);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest("a") ||
      target.closest("[data-no-drag]")
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

  const handleReturnToNotch = useCallback(() => {
    triggerExit("to-notch");
  }, [triggerExit]);

  const handleOffsetChange = useCallback(
    async (delta: number) => {
      if (!media?.title) return;
      const current =
        typeof lyrics?.offset === "number"
          ? lyrics.offset
          : parseFloat(localStorage.getItem("notch_lyrics_offset") || "0") || 0;
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

  const currentOffset =
    typeof lyrics?.offset === "number"
      ? lyrics.offset
      : parseFloat(localStorage.getItem("notch_lyrics_offset") || "0") || 0;

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

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const motionVariants: Variants = {
    initial: prefersReducedMotion
      ? { opacity: 0 }
      : {
          opacity: 0,
          scale: 0.88,
          y: 20,
          filter: "blur(8px)",
        },
    animate: {
      opacity: isFaded ? fadeOpacity : isInZone ? 0.8 : 1,
      scale: isInZone ? 0.6 : 1,
      y: 0,
      filter: "blur(0px)",
      transition: prefersReducedMotion
        ? { duration: 0.15 }
        : {
            opacity: { duration: 0.22, ease: "easeOut" },
            scale: { type: "spring", stiffness: 320, damping: 25, mass: 0.72 },
            y: { type: "spring", stiffness: 320, damping: 25, mass: 0.72 },
            filter: { duration: 0.22, ease: "easeOut" },
          },
    },
    closing: prefersReducedMotion
      ? { opacity: 0 }
      : {
          opacity: 0,
          scale: 0.88,
          y: 16,
          filter: "blur(6px)",
          transition: { duration: 0.2, ease: [0.32, 0, 0.67, 0] as const },
        },
    "to-notch": prefersReducedMotion
      ? { opacity: 0 }
      : {
          opacity: 0,
          scale: 0.45,
          y: -44,
          filter: "blur(6px)",
          transition: { duration: 0.22, ease: [0.32, 0, 0.67, 0] as const },
        },
  };

  const anchorOrigin = isAnchoredRight ? "bottom right" : "bottom left";
  const targetShellWidth = mode === "card" ? 380 : 440;
  const targetShellHeight =
    mode === "card"
      ? showToolbar
        ? 340
        : 298
      : showToolbar
      ? 130
      : 88;
  const targetShellRadius = mode === "card" ? 20 : 24;

  return (
    <motion.div
      key={enterKey}
      ref={containerRef}
      initial="initial"
      animate={exitState === "idle" ? "animate" : exitState}
      variants={motionVariants}
      style={{
        width: "100vw",
        height: "100vh",
        transformOrigin: anchorOrigin,
      }}
      className={`relative w-screen h-screen overflow-hidden select-none bg-transparent pointer-events-none flex flex-col justify-end ${
        isAnchoredRight ? "items-end" : "items-start"
      }`}
    >
      {/* Unified Morphing Shell: animates width, height, and borderRadius smoothly like Notch */}
      <motion.div
        initial={false}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        animate={{
          width: targetShellWidth,
          height: targetShellHeight,
          borderRadius: targetShellRadius,
        }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : {
                width: { type: "spring", stiffness: 320, damping: 30, mass: 0.78 },
                height: { type: "spring", stiffness: 320, damping: 30, mass: 0.78 },
                borderRadius: { duration: 0.25, ease: "easeOut" },
              }
        }
        style={{
          transformOrigin: anchorOrigin,
          backdropFilter: theme === "liquid" ? "blur(28px) saturate(180%)" : undefined,
          WebkitBackdropFilter: theme === "liquid" ? "blur(28px) saturate(180%)" : undefined,
        }}
        className={`relative box-border overflow-hidden shadow-none pointer-events-auto ${
          theme === "solid" ? "border border-white/[0.09]" : "border border-white/[0.16]"
        }`}
      >
        <MiniPlayerBackground
          thumbnail={effectiveThumbnail}
          tintColor={tintColor}
          theme={theme}
        />

        <AnimatePresence mode="popLayout" initial={false}>
          {mode === "card" ? (
            <motion.div
              key="card-mode"
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: prefersReducedMotion
                  ? { duration: 0.1 }
                  : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
              }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      y: 8,
                      transition: { duration: 0.16, ease: "easeOut" },
                    }
              }
              className="w-full h-full flex flex-col justify-start overflow-hidden"
            >
              <MiniPlayerCardMode
                media={media}
                lyrics={lyrics}
                theme={theme}
                tintColor={tintColor}
                showToolbar={showToolbar}
                toolbarNode={toolbarNode}
                onToggleMode={() => handleSetMode("bar")}
              />
            </motion.div>
          ) : (
            <motion.div
              key="bar-mode"
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: prefersReducedMotion
                  ? { duration: 0.1 }
                  : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
              }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      y: -6,
                      transition: { duration: 0.16, ease: "easeOut" },
                    }
              }
              className="w-full h-full flex flex-col justify-start overflow-hidden"
            >
              <MiniPlayerBarMode
                media={media}
                lyrics={lyrics}
                theme={theme}
                tintColor={tintColor}
                showToolbar={showToolbar}
                toolbarNode={toolbarNode}
                effectiveScale={effectiveTextScale}
                onToggleMode={() => handleSetMode("card")}
                onWidthChange={handleBarWidthChange}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};
