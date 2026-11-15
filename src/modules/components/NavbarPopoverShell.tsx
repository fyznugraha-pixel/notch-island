import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
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
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

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
      setCoords(null);
      return;
    }

    const computeCoords = () => {
      const card = popoverCardRef.current;
      const wrapper = wrapperRef.current;
      const anchor = anchorRef?.current || wrapper;
      if (!card || !wrapper || !anchor) return;

      const aRect = anchor.getBoundingClientRect();
      const wRect = wrapper.getBoundingClientRect();
      const scale = anchor.offsetWidth > 0 ? aRect.width / anchor.offsetWidth : 1;
      const safeScale = scale > 0.1 ? scale : 1;
      const cardW = (card.offsetWidth || width || 260) * safeScale;
      const cardH = (card.offsetHeight || 180) * safeScale;
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

      setCoords((prev) =>
        prev && prev.left === relLeft && prev.top === relTop
          ? prev
          : { left: relLeft, top: relTop }
      );
    };

    computeCoords();
    const ro = new ResizeObserver(computeCoords);
    if (popoverCardRef.current) ro.observe(popoverCardRef.current);
    if (anchorRef?.current) ro.observe(anchorRef.current);
    window.addEventListener("resize", computeCoords);
    return () => {
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

  if (!isOpen && !trigger) return null;

  const fallbackTitle = tx(lang, "Navbar Module", "Modul Navbar");
  const displayTitle = title || fallbackTitle;
  const viewSwitchTip = tx(
    lang,
    "Switch taskbar module view",
    "Ubah tampilan modul di taskbar"
  );

  return (
    <div ref={wrapperRef} className="relative flex items-center shrink-0">
      {isOpen && (
        <div
          ref={popoverCardRef}
          data-module-popover
          role="dialog"
          aria-label={displayTitle}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            ...(width ? { width: `${width}px` } : {}),
            left: coords ? `${coords.left}px` : "0px",
            top: coords ? `${coords.top}px` : "0px",
            visibility: coords ? "visible" : "hidden",
            transition:
              "left 0.2s cubic-bezier(0.22, 1, 0.36, 1), top 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
          className={`${
            isLightSurface
              ? "navbar-surface-light bg-[#f8fafc]/95 border-black/15 shadow-[0_20px_50px_rgba(15,23,42,0.18)] text-[#18181b]"
              : "navbar-preview-dark bg-[#11131a]/95 border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.75)] text-white"
          } absolute z-50 ${
            width ? "" : widthClass
          } max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto p-3 rounded-[16px] backdrop-blur-2xl border flex flex-col gap-2.5 whitespace-normal break-words select-none animate-in fade-in zoom-in-95 duration-150`}
        >
          {(title || moduleId) && (
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/[0.1] shrink-0 min-w-0">
              <span className="text-[11px] font-semibold text-white/90 truncate min-w-0 flex-1">
                {displayTitle}
              </span>
              {moduleId && (
                <Tooltip content={viewSwitchTip} side="top" isLightMode={isLightSurface}>
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
