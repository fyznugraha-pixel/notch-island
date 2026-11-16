import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { X, Globe } from "lucide-react";
import { motion, useIsPresent } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { NavbarPosition } from "../../types/navbar";
import { useNavbarPopupHit } from "../../services/navbarPopupService";
import { Tooltip } from "../ui/Tooltip";
import {
  useTaskbarLang,
  tx,
  getNavbarTooltipSide,
} from "../../services/taskbarI18n";
import { useNavbarLightMode } from "./navbarThemeUtils";

const MAX_VISIBLE_CARDS = 4;
const VIEWPORT_EDGE_MARGIN = 10;

interface WindowPreviewSlotPayload {
  hwnd: number;
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
}

let activePreviewSession = 0;

function sameHwndList(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function computeResponsiveCardWidth(count: number, isVertical: boolean): number {
  if (isVertical) {
    return count >= 3 ? 196 : 216;
  }
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const maxTrayW = Math.max(320, vw - VIEWPORT_EDGE_MARGIN * 2 - 16);
  const gaps = Math.max(0, count - 1) * 8;
  return Math.min(224, Math.max(176, Math.floor((maxTrayW - gaps) / Math.max(1, count))));
}

export interface WindowPreviewItem {
  id: string;
  hwnd?: number;
  title: string;
  icon?: React.ReactNode | string;
  thumbnailUrl?: string;
  isMinimized?: boolean;
}

interface WindowPreviewCardProps {
  appName: string;
  windows: WindowPreviewItem[];
  position?: NavbarPosition;
  accentColor?: string;
  tintColor?: string;
  isLightMode?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onSelectWindow?: (windowId: string, hwnd?: number) => void;
  onCloseWindow?: (windowId: string, hwnd?: number) => void;
}

interface LiveThumbnailProps {
  win: WindowPreviewItem;
  accentColor: string;
  hasLiveDwm: boolean;
  isLightMode: boolean;
  minimizedLabel: string;
  clickToOpenLabel: string;
  onSlotElement: (hwnd: number | undefined, el: HTMLDivElement | null) => void;
}

const LiveThumbnail: React.FC<LiveThumbnailProps> = ({
  win,
  accentColor,
  hasLiveDwm,
  isLightMode,
  minimizedLabel,
  clickToOpenLabel,
  onSlotElement,
}) => {
  const [thumb, setThumb] = useState<string | null>(win.thumbnailUrl || null);
  const [loading, setLoading] = useState(!win.thumbnailUrl && !!win.hwnd);

  useEffect(() => {
    if (win.thumbnailUrl) {
      setThumb(win.thumbnailUrl);
      setLoading(false);
      return;
    }
    if (!win.hwnd || hasLiveDwm) {
      setLoading(false);
      return;
    }

    let isCancelled = false;
    let retryTimer: number | null = null;
    const delays = [0, 500, 1300];

    const attemptCapture = (attemptIdx: number) => {
      if (isCancelled) return;
      invoke<string>("capture_window_thumbnail", { hwnd: win.hwnd })
        .then((dataUrl) => {
          if (isCancelled) return;
          if (dataUrl) {
            setThumb(dataUrl);
            setLoading(false);
          } else {
            scheduleNext(attemptIdx);
          }
        })
        .catch(() => {
          scheduleNext(attemptIdx);
        });
    };

    const scheduleNext = (attemptIdx: number) => {
      if (isCancelled) return;
      const nextIdx = attemptIdx + 1;
      if (nextIdx < delays.length) {
        retryTimer = window.setTimeout(() => attemptCapture(nextIdx), delays[nextIdx]);
      } else {
        setLoading(false);
      }
    };

    attemptCapture(0);

    return () => {
      isCancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [win.hwnd, win.thumbnailUrl, win.isMinimized, hasLiveDwm]);

  return (
    <div
      className={`w-full h-[122px] rounded-[8px] border overflow-hidden relative shadow-inner ${
        isLightMode
          ? "bg-zinc-100 border-black/[0.08]"
          : "bg-[#0c0d12] border-white/[0.08]"
      }`}
    >
      <div
        ref={(el) => onSlotElement(win.hwnd, el)}
        className="w-full h-full rounded-[7px] overflow-hidden relative flex items-center justify-center"
      >
        {hasLiveDwm ? null : thumb ? (
          <img
            src={thumb}
            alt={win.title}
            draggable={false}
            className={`w-full h-full object-contain ${
              isLightMode ? "bg-zinc-100" : "bg-[#0c0d12]"
            }`}
          />
        ) : loading ? (
          <div
            className={`w-full h-full flex items-center justify-center animate-pulse ${
              isLightMode ? "bg-black/[0.02]" : "bg-white/[0.02]"
            }`}
          >
            <span
              style={{ borderTopColor: accentColor }}
              className={`w-4 h-4 rounded-full border-2 animate-spin opacity-75 ${
                isLightMode ? "border-black/15" : "border-white/15"
              }`}
            />
          </div>
        ) : (
          <div
            className={`w-full h-full flex flex-col items-center justify-center p-3 bg-gradient-to-b ${
              isLightMode
                ? "from-black/[0.03] via-transparent to-black/[0.06]"
                : "from-white/[0.05] via-transparent to-black/25"
            }`}
          >
            {win.icon ? (
              typeof win.icon === "string" ? (
                <img
                  src={win.icon}
                  alt=""
                  className="w-9 h-9 object-contain mb-2 drop-shadow-md"
                />
              ) : (
                <div className="mb-2">{win.icon}</div>
              )
            ) : (
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 shadow ${
                  isLightMode ? "bg-black/[0.07]" : "bg-white/10"
                }`}
              >
                <Globe
                  size={18}
                  className={isLightMode ? "text-zinc-500" : "text-white/60"}
                />
              </div>
            )}
            <span
              className={`text-[11px] font-medium truncate max-w-[164px] text-center ${
                isLightMode ? "text-zinc-800" : "text-white/85"
              }`}
            >
              {win.title}
            </span>
            <span
              className={`text-[9.5px] mt-0.5 ${
                isLightMode ? "text-zinc-500" : "text-white/45"
              }`}
            >
              {win.isMinimized ? minimizedLabel : clickToOpenLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const WindowPreviewCard: React.FC<WindowPreviewCardProps> = ({
  appName,
  windows,
  position = "bottom",
  accentColor = "#0a84ff",
  isLightMode: isLightModeProp,
  onMouseEnter,
  onMouseLeave,
  onSelectWindow,
  onCloseWindow,
}) => {
  const lang = useTaskbarLang();
  const isLightMode = useNavbarLightMode(isLightModeProp);
  const tooltipSide = getNavbarTooltipSide(position);
  const minimizedLabel = tx(lang, "Minimized", "Diminimalkan");
  const clickToOpenLabel = tx(lang, "Click to open", "Klik untuk membuka");
  const closeWindowTooltip = tx(lang, "Close window", "Tutup jendela");
  const trayRef = useRef<HTMLDivElement>(null);
  const slotElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const sessionIdRef = useRef<number>(0);
  const isPresent = useIsPresent();
  const [settled, setSettled] = useState(false);
  const [liveDwmHwnds, setLiveDwmHwnds] = useState<number[]>([]);
  const [clampShift, setClampShift] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const clampShiftRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  clampShiftRef.current = clampShift;

  useNavbarPopupHit({
    idPrefix: "window-preview",
    open: windows.length > 0 && isPresent,
    elementRef: trayRef,
  });

  const handleSlotElement = useCallback((hwnd: number | undefined, el: HTMLDivElement | null) => {
    if (!hwnd) return;
    if (el) {
      slotElementsRef.current.set(hwnd, el);
    } else {
      slotElementsRef.current.delete(hwnd);
    }
  }, []);

  const syncOverlaySlots = useCallback(() => {
    if (!isPresent || !settled || activePreviewSession !== sessionIdRef.current) {
      return;
    }

    const visibleWindows = windows.slice(0, MAX_VISIBLE_CARDS);
    const slots: WindowPreviewSlotPayload[] = [];
    for (const win of visibleWindows) {
      if (!win.hwnd) continue;
      const el = slotElementsRef.current.get(win.hwnd);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (
        rect.width < 20 ||
        rect.height < 20 ||
        rect.right <= 0 ||
        rect.left >= window.innerWidth ||
        rect.bottom <= 0 ||
        rect.top >= window.innerHeight
      ) {
        continue;
      }
      slots.push({
        hwnd: win.hwnd,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        cornerRadius: 7,
      });
    }

    if (!slots.length) {
      invoke("clear_window_previews").catch(() => {});
      setLiveDwmHwnds((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    invoke<number[]>("sync_window_previews", { slots })
      .then((live) => {
        if (activePreviewSession === sessionIdRef.current && Array.isArray(live)) {
          setLiveDwmHwnds((prev) => (sameHwndList(prev, live) ? prev : live));
        }
      })
      .catch(() => {});
  }, [isPresent, settled, windows]);

  // Clamp outer preview tray cleanly inside viewport bounds so edge items never slice off-screen.
  useLayoutEffect(() => {
    const el = trayRef.current;
    if (!el || !windows.length) {
      if (clampShiftRef.current.x !== 0 || clampShiftRef.current.y !== 0) {
        setClampShift({ x: 0, y: 0 });
      }
      return;
    }

    const prev = clampShiftRef.current;
    const rect = el.getBoundingClientRect();
    const naturalLeft = rect.left - prev.x;
    const naturalRight = rect.right - prev.x;
    const naturalTop = rect.top - prev.y;
    const naturalBottom = rect.bottom - prev.y;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nextX = 0;
    let nextY = 0;

    if (naturalLeft < VIEWPORT_EDGE_MARGIN) {
      nextX = VIEWPORT_EDGE_MARGIN - naturalLeft;
    } else if (naturalRight > vw - VIEWPORT_EDGE_MARGIN) {
      nextX = vw - VIEWPORT_EDGE_MARGIN - naturalRight;
    }

    if (naturalTop < VIEWPORT_EDGE_MARGIN) {
      nextY = VIEWPORT_EDGE_MARGIN - naturalTop;
    } else if (naturalBottom > vh - VIEWPORT_EDGE_MARGIN) {
      nextY = vh - VIEWPORT_EDGE_MARGIN - naturalBottom;
    }

    if (Math.abs(nextX - prev.x) > 0.5 || Math.abs(nextY - prev.y) > 0.5) {
      setClampShift({ x: nextX, y: nextY });
    }
  }, [windows.length, position]);

  useEffect(() => {
    const mySession = ++activePreviewSession;
    sessionIdRef.current = mySession;
    setSettled(false);
    invoke("clear_window_previews").catch(() => {});

    const fallbackTimer = window.setTimeout(() => {
      if (activePreviewSession === mySession) {
        setSettled(true);
      }
    }, 90);

    return () => {
      window.clearTimeout(fallbackTimer);
      if (activePreviewSession === mySession) {
        invoke("clear_window_previews").catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!isPresent || windows.length === 0) {
      if (activePreviewSession === sessionIdRef.current) {
        invoke("clear_window_previews").catch(() => {});
      }
      return;
    }
    if (!settled) return;

    const rafId = window.requestAnimationFrame(syncOverlaySlots);
    const resyncInterval = window.setInterval(syncOverlaySlots, 280);

    let observer: ResizeObserver | null = null;
    if (trayRef.current && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        window.requestAnimationFrame(syncOverlaySlots);
      });
      observer.observe(trayRef.current);
    }

    window.addEventListener("resize", syncOverlaySlots);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearInterval(resyncInterval);
      window.removeEventListener("resize", syncOverlaySlots);
      observer?.disconnect();
    };
  }, [isPresent, settled, windows, clampShift, syncOverlaySlots]);

  if (!windows.length) return null;

  const isVerticalDock = position === "left" || position === "right";
  const visibleWindows = windows.slice(0, MAX_VISIBLE_CARDS);
  const overflowCount = Math.max(0, windows.length - MAX_VISIBLE_CARDS);
  const cardWidth = computeResponsiveCardWidth(visibleWindows.length, isVerticalDock);

  const placementClass =
    position === "top"
      ? "top-full left-1/2 -translate-x-1/2"
      : position === "left"
      ? "left-full top-1/2 -translate-y-1/2"
      : position === "right"
      ? "right-full top-1/2 -translate-y-1/2"
      : "bottom-full left-1/2 -translate-x-1/2";

  const bridgePaddingClass =
    position === "top"
      ? "pt-3"
      : position === "left"
      ? "pl-3"
      : position === "right"
      ? "pr-3"
      : "pb-3";

  const cardsContainerClass = isVerticalDock
    ? visibleWindows.length >= 3
      ? "grid grid-cols-2 gap-2"
      : "flex flex-col gap-2"
    : "flex items-center gap-2";

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={(e) => e.stopPropagation()}
      className={`${
        isLightMode ? "" : "navbar-preview-dark"
      } absolute ${placementClass} max-w-[calc(100vw-24px)] pointer-events-auto z-50 select-none`}
    >
      <div
        ref={trayRef}
        data-module-popover="true"
        style={{
          transform: `translate3d(${clampShift.x}px, ${clampShift.y}px, 0)`,
        }}
        className={`${bridgePaddingClass} max-w-[calc(100vw-24px)]`}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.1, ease: "easeOut" }}
          onAnimationComplete={() => {
            if (isPresent) setSettled(true);
          }}
          role="dialog"
          aria-label={tx(lang, `${appName} windows`, `Jendela ${appName}`)}
          className="max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-visible"
        >
        <div className={cardsContainerClass}>
          {visibleWindows.map((win) => (
            <div
              key={win.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectWindow?.(win.id, win.hwnd)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectWindow?.(win.id, win.hwnd);
                }
              }}
              style={{ width: cardWidth }}
              className={`group relative shrink-0 max-w-full p-2 rounded-[13px] border ring-1 ring-inset transition-colors duration-150 cursor-pointer ${
                isLightMode
                  ? "border-black/[0.1] ring-black/[0.04] bg-white/[0.96] hover:bg-white hover:border-black/[0.18] shadow-[0_14px_34px_rgba(15,23,42,0.18)] text-zinc-900"
                  : "border-white/[0.14] ring-white/[0.06] bg-[#13141a]/[0.96] hover:bg-[#191b23] hover:border-white/[0.24] shadow-[0_16px_40px_rgba(0,0,0,0.72)] text-white"
              }`}
            >
              <div className="flex items-center justify-between gap-1.5 h-5 mb-1.5 px-0.5">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="shrink-0 flex items-center justify-center w-3.5 h-3.5">
                    {win.icon ? (
                      typeof win.icon === "string" ? (
                        <img
                          src={win.icon}
                          alt=""
                          draggable={false}
                          className="w-3.5 h-3.5 object-contain rounded-[2px]"
                        />
                      ) : (
                        win.icon
                      )
                    ) : (
                      <Globe
                        size={13}
                        strokeWidth={1.8}
                        className={isLightMode ? "text-zinc-500" : "text-white/60"}
                      />
                    )}
                  </span>
                  <span
                    className={`text-[11.5px] font-medium truncate leading-none ${
                      isLightMode ? "text-zinc-900" : "text-white/90"
                    }`}
                  >
                    {win.title}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {win.isMinimized && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-medium leading-none ${
                        isLightMode
                          ? "bg-black/[0.07] text-zinc-600"
                          : "bg-white/[0.09] text-white/65"
                      }`}
                    >
                      Min
                    </span>
                  )}
                  <Tooltip
                    side={tooltipSide}
                    delay={150}
                    content={closeWindowTooltip}
                    isLightMode={isLightMode}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseWindow?.(win.id, win.hwnd);
                      }}
                      aria-label={tx(lang, `Close ${win.title}`, `Tutup ${win.title}`)}
                      className={`w-5 h-5 rounded-[5px] bg-transparent hover:bg-[#e81123] hover:text-[#ffffff] flex items-center justify-center transition-colors cursor-pointer ${
                        isLightMode ? "text-zinc-500" : "text-white/55"
                      }`}
                    >
                      <X size={11} strokeWidth={2.2} />
                    </button>
                  </Tooltip>
                </div>
              </div>

              <LiveThumbnail
                win={win}
                accentColor={accentColor}
                hasLiveDwm={!!win.hwnd && liveDwmHwnds.includes(win.hwnd)}
                isLightMode={isLightMode}
                minimizedLabel={minimizedLabel}
                clickToOpenLabel={clickToOpenLabel}
                onSlotElement={handleSlotElement}
              />
            </div>
          ))}
        </div>

        {overflowCount > 0 && (
          <div className="mt-1.5 flex items-center justify-end">
            <span
              className={`px-2.5 py-0.5 rounded-full border text-[10px] font-medium shadow-md ${
                isLightMode
                  ? "bg-white/[0.96] border-black/[0.1] text-zinc-700"
                  : "bg-[#13141a]/[0.96] border-white/[0.14] text-white/80"
              }`}
            >
              +{overflowCount}{" "}
              {tx(
                lang,
                overflowCount === 1 ? "more window" : "more windows",
                "jendela lainnya"
              )}
            </span>
          </div>
        )}
        </motion.div>
      </div>
    </div>
  );
};
