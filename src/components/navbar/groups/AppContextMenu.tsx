import React, { useEffect, useRef } from "react";
import { ExternalLink, Pin, PinOff, X } from "lucide-react";
import { NavbarPosition } from "../../../types/navbar";
import { useNavbarPopupHit } from "../../../services/navbarPopupService";
import type { NavbarAppItem } from "./PinnedAppsGroup";
import { useTaskbarLang, tx } from "../../../services/taskbarI18n";
import { useNavbarLightMode } from "../navbarThemeUtils";

interface AppContextMenuProps {
  app: NavbarAppItem;
  isPinned: boolean;
  position: NavbarPosition;
  isLightMode?: boolean;
  onNewWindow: () => void;
  onTogglePin: () => void;
  onCloseAllWindows: () => void;
  onCloseMenu: () => void;
}

export const AppContextMenu: React.FC<AppContextMenuProps> = ({
  app,
  isPinned,
  position,
  isLightMode: isLightModeProp,
  onNewWindow,
  onTogglePin,
  onCloseAllWindows,
  onCloseMenu,
}) => {
  const lang = useTaskbarLang();
  const isLightMode = useNavbarLightMode(isLightModeProp);
  const menuRef = useRef<HTMLDivElement>(null);

  useNavbarPopupHit({
    idPrefix: "app-context-menu",
    open: true,
    elementRef: menuRef,
    onDismiss: onCloseMenu,
  });

  useEffect(() => {
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
      ref={menuRef}
      data-app-context-menu
      data-module-popover="true"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={
        isLightMode
          ? {
              backgroundColor: "rgba(255,255,255,0.96)",
              borderColor: "rgba(0,0,0,0.1)",
              boxShadow:
                "0 18px 40px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.8)",
            }
          : {
              backgroundColor: "#141419",
              borderColor: "rgba(255,255,255,0.1)",
              boxShadow:
                "0 18px 40px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.08)",
            }
      }
      className={`${
        isLightMode ? "text-zinc-900" : "navbar-preview-dark text-white"
      } absolute ${placementClass} z-50 min-w-[195px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto p-1.5 rounded-[14px] border backdrop-blur-2xl select-none pointer-events-auto`}
    >
      <div
        className={`px-2.5 py-1.5 border-b mb-1 ${
          isLightMode ? "border-black/[0.08]" : "border-white/[0.07]"
        }`}
      >
        <div
          className={`text-[11.5px] font-semibold truncate max-w-[170px] ${
            isLightMode ? "text-zinc-900" : "text-white/95"
          }`}
        >
          {app.name}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          onNewWindow();
          onCloseMenu();
        }}
        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[9px] text-[11.5px] transition-colors cursor-pointer text-left ${
          isLightMode
            ? "text-zinc-800 hover:text-zinc-950 hover:bg-black/[0.06]"
            : "text-white/85 hover:text-white hover:bg-white/[0.08]"
        }`}
      >
        <ExternalLink
          size={13.5}
          className={`shrink-0 ${isLightMode ? "text-zinc-500" : "text-white/60"}`}
        />
        <span>{tx(lang, "Open new window", "Buka jendela baru")}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onTogglePin();
          onCloseMenu();
        }}
        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[9px] text-[11.5px] transition-colors cursor-pointer text-left ${
          isLightMode
            ? "text-zinc-800 hover:text-zinc-950 hover:bg-black/[0.06]"
            : "text-white/85 hover:text-white hover:bg-white/[0.08]"
        }`}
      >
        {isPinned ? (
          <>
            <PinOff
              size={13.5}
              className={`shrink-0 ${isLightMode ? "text-zinc-500" : "text-white/60"}`}
            />
            <span>{tx(lang, "Unpin from taskbar", "Lepas sematan dari taskbar")}</span>
          </>
        ) : (
          <>
            <Pin
              size={13.5}
              className={`shrink-0 ${isLightMode ? "text-zinc-500" : "text-white/60"}`}
            />
            <span>{tx(lang, "Pin to taskbar", "Sematkan ke taskbar")}</span>
          </>
        )}
      </button>

      {app.isRunning && (
        <>
          <div
            className={`my-1 border-t ${
              isLightMode ? "border-black/[0.08]" : "border-white/[0.07]"
            }`}
          />
          <button
            type="button"
            onClick={() => {
              onCloseAllWindows();
              onCloseMenu();
            }}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[9px] text-[11.5px] transition-colors cursor-pointer text-left ${
              isLightMode
                ? "text-red-600 hover:text-red-700 hover:bg-red-500/10"
                : "text-red-400 hover:text-red-300 hover:bg-red-500/15"
            }`}
          >
            <X size={13.5} className="shrink-0" />
            <span>
              {app.windows && app.windows.length > 1
                ? `${tx(lang, "Close all windows", "Tutup semua jendela")} (${app.windows.length})`
                : tx(lang, "Close window", "Tutup jendela")}
            </span>
          </button>
        </>
      )}
    </div>
  );
};

