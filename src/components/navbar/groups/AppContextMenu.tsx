import React, { useEffect } from "react";
import { ExternalLink, Pin, PinOff, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarPosition } from "../../../types/navbar";
import type { NavbarAppItem } from "./PinnedAppsGroup";

interface AppContextMenuProps {
  app: NavbarAppItem;
  isPinned: boolean;
  position: NavbarPosition;
  onNewWindow: () => void;
  onTogglePin: () => void;
  onCloseAllWindows: () => void;
  onCloseMenu: () => void;
}

export const AppContextMenu: React.FC<AppContextMenuProps> = ({
  app,
  isPinned,
  position,
  onNewWindow,
  onTogglePin,
  onCloseAllWindows,
  onCloseMenu,
}) => {
  useEffect(() => {
    invoke("set_navbar_popup_open", { open: true }).catch(() => {});
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest("[data-app-context-menu]")) {
        onCloseMenu();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseMenu();
    };
    window.addEventListener("pointerdown", handleOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handleOutside);
      window.removeEventListener("keydown", handleKey);
      invoke("set_navbar_popup_open", { open: false }).catch(() => {});
    };
  }, [onCloseMenu]);

  const placementClass =
    position === "top"
      ? "top-full left-1/2 -translate-x-1/2 mt-2"
      : position === "left"
      ? "left-full top-1/2 -translate-y-1/2 ml-2"
      : position === "right"
      ? "right-full top-1/2 -translate-y-1/2 mr-2"
      : "bottom-full left-1/2 -translate-x-1/2 mb-2";

  return (
    <div
      data-app-context-menu
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        backgroundColor: "#141419",
        borderColor: "rgba(255,255,255,0.1)",
        boxShadow:
          "0 18px 40px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
      className={`navbar-preview-dark absolute ${placementClass} z-50 min-w-[195px] p-1.5 rounded-[14px] border backdrop-blur-2xl text-white select-none pointer-events-auto`}
    >
      <div className="px-2.5 py-1.5 border-b border-white/[0.07] mb-1">
        <div className="text-[11.5px] font-semibold text-white/95 truncate max-w-[170px]">
          {app.name}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          onNewWindow();
          onCloseMenu();
        }}
        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[9px] text-[11.5px] text-white/85 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer text-left"
      >
        <ExternalLink size={13.5} className="text-white/60 shrink-0" />
        <span>Buka jendela baru</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onTogglePin();
          onCloseMenu();
        }}
        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[9px] text-[11.5px] text-white/85 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer text-left"
      >
        {isPinned ? (
          <>
            <PinOff size={13.5} className="text-white/60 shrink-0" />
            <span>Lepas sematan dari taskbar</span>
          </>
        ) : (
          <>
            <Pin size={13.5} className="text-white/60 shrink-0" />
            <span>Sematkan ke taskbar</span>
          </>
        )}
      </button>

      {app.isRunning && (
        <>
          <div className="my-1 border-t border-white/[0.07]" />
          <button
            type="button"
            onClick={() => {
              onCloseAllWindows();
              onCloseMenu();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[9px] text-[11.5px] text-red-400 hover:text-red-300 hover:bg-red-500/15 transition-colors cursor-pointer text-left"
          >
            <X size={13.5} className="shrink-0" />
            <span>
              {app.windows && app.windows.length > 1
                ? `Tutup semua jendela (${app.windows.length})`
                : "Tutup jendela"}
            </span>
          </button>
        </>
      )}
    </div>
  );
};

