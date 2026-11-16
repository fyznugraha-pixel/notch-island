import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import { NavbarConfig, NavbarModuleView } from "../../types/navbar";
import { saveNavbarConfig } from "../../services/navbarConfigService";
import { useNavbarPopupHit } from "../../services/navbarPopupService";
import { MODULE_ID_ALIASES } from "./NavbarModuleUnifiedPreview";
import { TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { Tooltip } from "../../components/ui/Tooltip";
import { useNavbarLightMode } from "../../components/navbar/navbarThemeUtils";
import { useNotchTheme } from "../../hooks/useNotchTheme";
import { tx, useTaskbarLang } from "../../services/taskbarI18n";

export interface NavbarPopoverShellProps {
  isOpen: boolean;
  onClose: () => void;
  config: NavbarConfig;
  moduleId?: string;
  title?: string;
  needsKeyboardFocus?: boolean;
  widthClass?: string;
  width?: number;
  currentView?: NavbarModuleView;
  anchorRef?: React.RefObject<HTMLElement | null>;
  trigger?: React.ReactNode;
  children: React.ReactNode;
}

const VIEWPORT_SAFE_MARGIN_PX = 12;
const POPOVER_ANCHOR_GAP_PX = 12;

function isHexLight(hex: string): boolean {
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return false;
  return (r * 299 + g * 587 + b * 114) / 1000 > 165;
}

export function useNavbarIsLightSurface(config?: NavbarConfig): boolean {
  const docLight = useNavbarLightMode();
  const { notchMode } = useNotchTheme();
  if (!config) return docLight;
  const isFollowNotch =
    config.style === "followNotch" || config.background === "followNotch";
  if (isFollowNotch) {
    return notchMode === "light";
  }
  if (config.background === "custom") {
    return isHexLight(config.customColor || "#0f172a");
  }
  return false;
}

export const NavbarPopoverShell: React.FC<NavbarPopoverShellProps> = ({
  isOpen,
  onClose,
  config,
  moduleId,
  title,
  needsKeyboardFocus = false,
  widthClass = "w-[260px]",
  width,
  currentView: propView,
  anchorRef,
  trigger,
  children,
}) => {
  const lang = useTaskbarLang();
  const isLightSurface = useNavbarIsLightSurface(config);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverCardRef = useRef<HTMLDivElement>(null);
  type PopoverCoords = {
    left: number;
    top: number;
    originX: number;
    originY: number;
    enterX: number;
    enterY: number;
  };
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const lastCoordsRef = useRef<PopoverCoords | null>(null);
  const hasMeasuredOnceRef = useRef(false);

  useNavbarPopupHit({
    idPrefix: moduleId || "popover",
    open: isOpen,
    elementRef: popoverCardRef,
    focusable: needsKeyboardFocus,
    onDismiss: onClose,
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inPopover = wrapperRef.current?.contains(target);
      const inAnchor = anchorRef?.current?.contains(target);
      if (!inPopover && !inAnchor) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen, onClose, anchorRef]);

  const pos = config.position || "bottom";

  useLayoutEffect(() => {
    if (!isOpen) {
      hasMeasuredOnceRef.current = false;
      setCoords(null);
      return;
    }

    const syncDockAnchor = (anchor: HTMLElement) => {
      const r = anchor.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        invoke("set_dock_action_anchor", {
          anchor: {
            x: r.left,
            y: r.top,
            width: r.width,
            height: r.height,
            position: pos,
          },
        }).catch(() => {});
      }
    };

    const computeCoords = () => {
      const card = popoverCardRef.current;
      const wrapper = wrapperRef.current;
      const anchor = anchorRef?.current || wrapper;
      if (!card || !wrapper || !anchor) return;

      const aRect = anchor.getBoundingClientRect();
      const wRect = wrapper.getBoundingClientRect();
      const scale = anchor.offsetWidth > 0 ? aRect.width / anchor.offsetWidth : 1;
      const safeScale = scale > 0.1 ? scale : 1;
      const unscaledW = card.offsetWidth || width || 260;
      const unscaledH = card.offsetHeight || 180;
      const cardW = unscaledW * safeScale;
      const cardH = unscaledH * safeScale;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let targetLeft = aRect.left + aRect.width / 2 - cardW / 2;
      let targetTop = aRect.top - POPOVER_ANCHOR_GAP_PX - cardH;

      if (pos === "top") {
        targetLeft = aRect.left + aRect.width / 2 - cardW / 2;
        targetTop = aRect.bottom + POPOVER_ANCHOR_GAP_PX;
        if (
          targetTop + cardH > vh - VIEWPORT_SAFE_MARGIN_PX &&
          aRect.top - POPOVER_ANCHOR_GAP_PX - cardH >= VIEWPORT_SAFE_MARGIN_PX
        ) {
          targetTop = aRect.top - POPOVER_ANCHOR_GAP_PX - cardH;
        }
      } else if (pos === "bottom") {
        targetLeft = aRect.left + aRect.width / 2 - cardW / 2;
        targetTop = aRect.top - POPOVER_ANCHOR_GAP_PX - cardH;
        if (
          targetTop < VIEWPORT_SAFE_MARGIN_PX &&
          aRect.bottom + POPOVER_ANCHOR_GAP_PX + cardH <= vh - VIEWPORT_SAFE_MARGIN_PX
        ) {
          targetTop = aRect.bottom + POPOVER_ANCHOR_GAP_PX;
        }
      } else if (pos === "left") {
        targetLeft = aRect.right + POPOVER_ANCHOR_GAP_PX;
        targetTop = aRect.top + aRect.height / 2 - cardH / 2;
        if (
          targetLeft + cardW > vw - VIEWPORT_SAFE_MARGIN_PX &&
          aRect.left - POPOVER_ANCHOR_GAP_PX - cardW >= VIEWPORT_SAFE_MARGIN_PX
        ) {
          targetLeft = aRect.left - POPOVER_ANCHOR_GAP_PX - cardW;
        }
      } else if (pos === "right") {
        targetLeft = aRect.left - POPOVER_ANCHOR_GAP_PX - cardW;
        targetTop = aRect.top + aRect.height / 2 - cardH / 2;
        if (
          targetLeft < VIEWPORT_SAFE_MARGIN_PX &&
          aRect.right + POPOVER_ANCHOR_GAP_PX + cardW <= vw - VIEWPORT_SAFE_MARGIN_PX
        ) {
          targetLeft = aRect.right + POPOVER_ANCHOR_GAP_PX;
        }
      }

      const maxLeft = Math.max(VIEWPORT_SAFE_MARGIN_PX, vw - VIEWPORT_SAFE_MARGIN_PX - cardW);
      const maxTop = Math.max(VIEWPORT_SAFE_MARGIN_PX, vh - VIEWPORT_SAFE_MARGIN_PX - cardH);
      const clampedLeft = Math.min(Math.max(targetLeft, VIEWPORT_SAFE_MARGIN_PX), maxLeft);
      const clampedTop = Math.min(Math.max(targetTop, VIEWPORT_SAFE_MARGIN_PX), maxTop);

      const relLeft = Math.round((clampedLeft - wRect.left) / safeScale);
      const relTop = Math.round((clampedTop - wRect.top) / safeScale);

      const anchorRelX = Math.max(
        14,
        Math.min(unscaledW - 14, (aRect.left + aRect.width / 2 - clampedLeft) / safeScale),
      );
      const anchorRelY = Math.max(
        14,
        Math.min(unscaledH - 14, (aRect.top + aRect.height / 2 - clampedTop) / safeScale),
      );

      let originX = Math.round(anchorRelX);
      let originY = unscaledH;
      let enterX = 0;
      let enterY = 18;
      if (pos === "top") {
        originY = 0;
        enterY = -18;
      } else if (pos === "left") {
        originX = 0;
        originY = Math.round(anchorRelY);
        enterX = -18;
        enterY = 0;
      } else if (pos === "right") {
        originX = unscaledW;
        originY = Math.round(anchorRelY);
        enterX = 18;
        enterY = 0;
      }

      const nextCoords: PopoverCoords = {
        left: relLeft,
        top: relTop,
        originX,
        originY,
        enterX,
        enterY,
      };
      lastCoordsRef.current = nextCoords;

      setCoords((prev) =>
        prev &&
        prev.left === nextCoords.left &&
        prev.top === nextCoords.top &&
        prev.originX === nextCoords.originX &&
        prev.originY === nextCoords.originY
          ? prev
          : nextCoords
      );
    };

    const anchorEl = anchorRef?.current || wrapperRef.current;
    if (anchorEl) {
      syncDockAnchor(anchorEl);
    }

    computeCoords();
    const rafId = window.requestAnimationFrame(() => {
      hasMeasuredOnceRef.current = true;
    });
    const ro = new ResizeObserver(computeCoords);
    if (popoverCardRef.current) ro.observe(popoverCardRef.current);
    if (anchorRef?.current) ro.observe(anchorRef.current);
    window.addEventListener("resize", computeCoords);
    return () => {
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("resize", computeCoords);
    };
  }, [isOpen, pos, width, anchorRef]);

  const currentModuleEntry = moduleId
    ? config.modules.find((m) => {
        const canonicalM = MODULE_ID_ALIASES[m.id] || m.id;
        const canonicalTarget = MODULE_ID_ALIASES[moduleId] || moduleId;
        return canonicalM === canonicalTarget || m.id === moduleId;
      })
    : undefined;

  const activeView: NavbarModuleView =
    currentModuleEntry?.view || propView || "compact";

  const handleSwitchView = async (
    nextView: NavbarModuleView,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!moduleId) return;
    const canonicalTarget = MODULE_ID_ALIASES[moduleId] || moduleId;
    const nextModules = config.modules.map((m) => {
      const canonicalM = MODULE_ID_ALIASES[m.id] || m.id;
      if (canonicalM === canonicalTarget || m.id === moduleId) {
        return { ...m, view: nextView };
      }
      return m;
    });
    const nextConfig: NavbarConfig = { ...config, modules: nextModules };
    try {
      await saveNavbarConfig(nextConfig);
    } catch {}
    try {
      await invoke("broadcast_navbar_config_update", { config: nextConfig });
    } catch {}
    try {
      await emit("navbar_config_updated", nextConfig);
      await emit("gili-navbar-config-sync", nextConfig);
    } catch {}
  };

  const prevIsOpenRef = useRef(isOpen);
  const [isExiting, setIsExiting] = useState(false);
  if (prevIsOpenRef.current !== isOpen) {
    prevIsOpenRef.current = isOpen;
    if (!isOpen && (coords || lastCoordsRef.current)) {
      setIsExiting(true);
    } else if (isOpen && isExiting) {
      setIsExiting(false);
    }
  }

  if (!isOpen && !isExiting && !trigger) return null;

  const fallbackTitle = tx(lang, "Navbar Module", "Modul Navbar");
  const displayTitle = title || fallbackTitle;
  const viewSwitchTip = tx(
    lang,
    "Switch taskbar module view",
    "Ubah tampilan modul di taskbar"
  );

  const activeCoords = coords ?? lastCoordsRef.current;
  const useGenie = config.windowAnimation !== "normal";
  const isVert = pos === "left" || pos === "right";
  const tiltX = pos === "bottom" ? 15 : pos === "top" ? -15 : 0;
  const tiltY = pos === "left" ? 15 : pos === "right" ? -15 : 0;
  const normalSlideX = pos === "left" ? -10 : pos === "right" ? 10 : 0;
  const normalSlideY = pos === "top" ? -10 : isVert ? 0 : 10;

  const hiddenTransform = useGenie
    ? {
        opacity: 0,
        scaleX: isVert ? 0.07 : 0.14,
        scaleY: isVert ? 0.14 : 0.07,
        x: activeCoords
          ? activeCoords.enterX
          : pos === "left"
          ? -18
          : pos === "right"
          ? 18
          : 0,
        y: activeCoords
          ? activeCoords.enterY
          : pos === "top"
          ? -18
          : isVert
          ? 0
          : 18,
        rotateX: tiltX,
        rotateY: tiltY,
        transformPerspective: 620,
      }
    : {
        opacity: 0,
        scaleX: 0.96,
        scaleY: 0.96,
        x: normalSlideX,
        y: normalSlideY,
        rotateX: 0,
        rotateY: 0,
        transformPerspective: 620,
      };
  const openTransform = {
    opacity: 1,
    scaleX: 1,
    scaleY: 1,
    x: 0,
    y: 0,
    rotateX: 0,
    rotateY: 0,
    transformPerspective: 620,
    transition: useGenie
      ? {
          x: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
          y: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
          scaleX: isVert
            ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const }
            : { duration: 0.23, delay: 0.03, ease: [0.22, 1, 0.36, 1] as const },
          scaleY: isVert
            ? { duration: 0.23, delay: 0.03, ease: [0.22, 1, 0.36, 1] as const }
            : { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
          rotateX: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
          rotateY: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
          opacity: { duration: 0.14, ease: "easeOut" as const },
        }
      : {
          duration: 0.16,
          ease: [0.22, 1, 0.36, 1] as const,
        },
  };
  const exitTransform = useGenie
    ? {
        ...hiddenTransform,
        scaleX: isVert ? 0.05 : 0.1,
        scaleY: isVert ? 0.1 : 0.05,
        transition: {
          scaleX: isVert
            ? { duration: 0.15, delay: 0.025, ease: [0.36, 0, 0.8, 0.15] as const }
            : { duration: 0.13, ease: [0.4, 0, 0.85, 0.6] as const },
          scaleY: isVert
            ? { duration: 0.13, ease: [0.4, 0, 0.85, 0.6] as const }
            : { duration: 0.15, delay: 0.025, ease: [0.36, 0, 0.8, 0.15] as const },
          x: { duration: 0.155, delay: 0.02, ease: [0.36, 0, 0.8, 0.15] as const },
          y: { duration: 0.155, delay: 0.02, ease: [0.36, 0, 0.8, 0.15] as const },
          rotateX: { duration: 0.16, ease: [0.36, 0, 0.8, 0.15] as const },
          rotateY: { duration: 0.16, ease: [0.36, 0, 0.8, 0.15] as const },
          opacity: { duration: 0.12, delay: 0.055, ease: "easeIn" as const },
        },
      }
    : {
        ...hiddenTransform,
        transition: {
          duration: 0.12,
          ease: [0.32, 0, 0.67, 0] as const,
        },
      };
  const defaultOrigin =
    pos === "top"
      ? "50% 0%"
      : pos === "left"
      ? "0% 50%"
      : pos === "right"
      ? "100% 50%"
      : "50% 100%";

  return (
    <div ref={wrapperRef} className="relative flex items-center shrink-0">
      {(isOpen || isExiting) && (
        <div
          ref={popoverCardRef}
          data-module-popover
          role="dialog"
          aria-label={displayTitle}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            ...(width ? { width: `${width}px` } : {}),
            left: activeCoords ? `${activeCoords.left}px` : "0px",
            top: activeCoords ? `${activeCoords.top}px` : "0px",
            visibility:
              coords || (!isOpen && activeCoords) ? "visible" : "hidden",
            pointerEvents: isOpen ? "auto" : "none",
            transition: hasMeasuredOnceRef.current
              ? "left 0.18s cubic-bezier(0.22, 1, 0.36, 1), top 0.18s cubic-bezier(0.22, 1, 0.36, 1)"
              : "none",
          }}
          className={`absolute z-50 ${
            width ? "" : widthClass
          } max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)]`}
        >
          <AnimatePresence onExitComplete={() => setIsExiting(false)}>
            {isOpen && (
              <motion.div
                key="module-popover-card"
                initial={hiddenTransform}
                animate={coords ? openTransform : hiddenTransform}
                exit={exitTransform}
                style={{
                  willChange: "transform, opacity",
                  transformOrigin:
                    useGenie && activeCoords
                      ? `${activeCoords.originX}px ${activeCoords.originY}px`
                      : defaultOrigin,
                }}
                className={`${
                  isLightSurface
                    ? "navbar-surface-light bg-[#f8fafc]/95 border-black/15 shadow-[0_20px_50px_rgba(15,23,42,0.18)] text-[#18181b]"
                    : "navbar-preview-dark bg-[#11131a]/95 border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.75)] text-white"
                } w-full max-h-[calc(100vh-24px)] overflow-y-auto p-3 rounded-[16px] backdrop-blur-2xl border flex flex-col gap-2.5 whitespace-normal break-words select-none`}
              >
                {(title || moduleId) && (
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/[0.1] shrink-0 min-w-0">
                    <span className="text-[11px] font-semibold text-white/90 truncate min-w-0 flex-1">
                      {displayTitle}
                    </span>
                    {moduleId && (
                      <Tooltip
                        content={viewSwitchTip}
                        side="top"
                        isLightMode={isLightSurface}
                      >
                        <div className="flex items-center bg-white/[0.06] rounded-[7px] p-0.5 border border-white/[0.08] shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleSwitchView("compact", e)}
                            className={`px-1.5 py-0.5 rounded-[5px] text-[9.5px] font-semibold transition-all cursor-pointer ${TRIGGER_FOCUS_RING} ${
                              activeView === "compact"
                                ? "bg-[#3882F6] text-[#ffffff]"
                                : "text-zinc-300 hover:text-white"
                            }`}
                          >
                            {tx(lang, "Icon", "Ikon")}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleSwitchView("full", e)}
                            className={`px-1.5 py-0.5 rounded-[5px] text-[9.5px] font-semibold transition-all cursor-pointer ${TRIGGER_FOCUS_RING} ${
                              activeView === "full"
                                ? "bg-[#3882F6] text-[#ffffff]"
                                : "text-zinc-300 hover:text-white"
                            }`}
                          >
                            {tx(lang, "Pill", "Panjang")}
                          </button>
                        </div>
                      </Tooltip>
                    )}
                  </div>
                )}
                <div className="flex flex-col gap-2.5 flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain px-1 -mx-1 py-0.5 -my-0.5">
                  {children}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      {trigger}
    </div>
  );
};

export const CircularRingSvg: React.FC<{
  percent?: number;
  progress?: number;
  color: string;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}> = ({
  percent,
  progress,
  color,
  size = 24,
  strokeWidth = 2.2,
  children,
}) => {
  const r = 11;
  const circ = 2 * Math.PI * r;
  const rawPct =
    typeof percent === "number"
      ? percent
      : typeof progress === "number"
      ? progress * 100
      : 50;
  const clamped = Math.max(0, Math.min(100, rawPct));
  const offset = circ - (clamped / 100) * circ;

  return (
    <div
      style={{ width: `${size}px`, height: `${size}px` }}
      className="relative shrink-0 flex items-center justify-center"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 26 26"
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="13"
          cy="13"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeWidth={strokeWidth}
        />
        <circle
          cx="13"
          cy="13"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circ.toFixed(1)}
          strokeDashoffset={offset.toFixed(1)}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[8.5px] font-bold leading-none text-white">
        {children}
      </div>
    </div>
  );
};
