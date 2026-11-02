import React, { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { NavbarConfig, NavbarModuleView } from "../../types/navbar";
import { saveNavbarConfig } from "../../services/navbarConfigService";
import { MODULE_ID_ALIASES } from "./NavbarModuleUnifiedPreview";

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
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      invoke("set_navbar_popup_open", { open: true }).catch(() => {});
      if (needsKeyboardFocus) {
        invoke("set_navbar_focusable", { focusable: true }).catch(() => {});
      }
    } else {
      if (needsKeyboardFocus) {
        invoke("set_navbar_focusable", { focusable: false }).catch(() => {});
      }
      invoke("set_navbar_popup_open", { open: false }).catch(() => {});
    }

    return () => {
      if (isOpen) {
        if (needsKeyboardFocus) {
          invoke("set_navbar_focusable", { focusable: false }).catch(() => {});
        }
        invoke("set_navbar_popup_open", { open: false }).catch(() => {});
      }
    };
  }, [isOpen, needsKeyboardFocus]);

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
  const popupPosClass =
    pos === "top"
      ? "top-[calc(100%+12px)] left-1/2 -translate-x-1/2"
      : pos === "left"
      ? "left-[calc(100%+12px)] bottom-0"
      : pos === "right"
      ? "right-[calc(100%+12px)] bottom-0"
      : "bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2";

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

  const anchorCenterOffset =
    !trigger && anchorRef?.current ? -(anchorRef.current.offsetWidth / 2) : 0;

  return (
    <div
      ref={wrapperRef}
      style={
        anchorCenterOffset
          ? {
              marginLeft: `${anchorCenterOffset}px`,
              marginRight: `${-anchorCenterOffset}px`,
              transition: "margin 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
            }
          : undefined
      }
      className="relative flex items-center shrink-0"
    >
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            ...(width ? { width: `${width}px` } : {}),
            transition:
              "left 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
          className={`navbar-preview-dark absolute ${popupPosClass} z-50 ${
            width ? "" : widthClass
          } p-3 rounded-[16px] bg-[#11131a]/95 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.75)] text-white flex flex-col gap-2.5 select-none animate-in fade-in zoom-in-95 duration-150`}
        >
          {(title || moduleId) && (
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/[0.07]">
              <span className="text-[11px] font-semibold text-white/80 truncate">
                {title || "Modul Navbar"}
              </span>
              {moduleId && (
                <div
                  className="flex items-center bg-white/[0.06] rounded-[7px] p-0.5 border border-white/[0.06] shrink-0"
                  title="Ubah tampilan modul di taskbar"
                >
                  <button
                    type="button"
                    onClick={(e) => handleSwitchView("compact", e)}
                    className={`px-1.5 py-0.5 rounded-[5px] text-[9.5px] font-semibold transition-all cursor-pointer ${
                      activeView === "compact"
                        ? "bg-[#3882F6] text-white"
                        : "text-white/50 hover:text-white"
                    }`}
                  >
                    Ikon
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleSwitchView("full", e)}
                    className={`px-1.5 py-0.5 rounded-[5px] text-[9.5px] font-semibold transition-all cursor-pointer ${
                      activeView === "full"
                        ? "bg-[#3882F6] text-white"
                        : "text-white/50 hover:text-white"
                    }`}
                  >
                    Panjang
                  </button>
                </div>
              )}
            </div>
          )}
          {children}
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
  strokeWidth = 2.6,
  children,
}) => {
  const r = 10;
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
          stroke="rgba(255,255,255,0.14)"
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
      <div className="absolute inset-0 flex items-center justify-center text-[8.5px] font-bold text-white">
        {children}
      </div>
    </div>
  );
};
