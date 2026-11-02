import React, { useState, useEffect } from "react";
import { X, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { NavbarPosition } from "../../types/navbar";

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
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onSelectWindow?: (windowId: string, hwnd?: number) => void;
  onCloseWindow?: (windowId: string, hwnd?: number) => void;
}

const LiveThumbnail: React.FC<{ win: WindowPreviewItem; accentColor: string }> = ({
  win,
  accentColor,
}) => {
  const [thumb, setThumb] = useState<string | null>(win.thumbnailUrl || null);
  const [loading, setLoading] = useState(!win.thumbnailUrl && !!win.hwnd);

  useEffect(() => {
    if (win.thumbnailUrl) {
      setThumb(win.thumbnailUrl);
      return;
    }
    if (!win.hwnd) return;

    let isCancelled = false;
    invoke<string>("capture_window_thumbnail", { hwnd: win.hwnd })
      .then((dataUrl) => {
        if (!isCancelled && dataUrl) {
          setThumb(dataUrl);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [win.hwnd, win.thumbnailUrl]);

  return (
    <div className="w-full h-[126px] rounded-[8px] bg-[#0c0c11] border border-white/[0.08] overflow-hidden relative flex items-center justify-center shadow-inner">
      {thumb ? (
        <img
          src={thumb}
          alt={win.title}
          draggable={false}
          className="w-full h-full object-cover object-top rounded-[8px] transition-transform duration-200 group-hover:scale-[1.025]"
        />
      ) : loading ? (
        <div className="flex flex-col items-center justify-center gap-2 text-white/50 text-[10px]">
          <span
            style={{ borderTopColor: accentColor }}
            className="w-4 h-4 rounded-full border-2 border-white/15 animate-spin"
          />
          <span className="tracking-wide text-white/40">Mengambil jendela...</span>
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-gradient-to-b from-white/[0.06] via-transparent to-black/20">
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
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center mb-2 shadow">
              <Globe size={18} className="text-white/60" />
            </div>
          )}
          <span className="text-[11.5px] font-semibold text-white/90 truncate max-w-[170px] text-center">
            {win.title}
          </span>
          <span className="text-[9.5px] text-white/45 mt-0.5">
            {win.isMinimized ? "Jendela diminimalkan" : "Klik untuk membuka"}
          </span>
        </div>
      )}
    </div>
  );
};

export const WindowPreviewCard: React.FC<WindowPreviewCardProps> = ({
  appName,
  windows,
  position = "bottom",
  accentColor = "#0a84ff",
  tintColor = "#141419",
  onMouseEnter,
  onMouseLeave,
  onSelectWindow,
  onCloseWindow,
}) => {
  useEffect(() => {
    invoke("set_navbar_popup_open", { open: true }).catch(() => {});
    return () => {
      invoke("set_navbar_popup_open", { open: false }).catch(() => {});
    };
  }, []);

  if (!windows.length) return null;

  const placementClass =
    position === "top"
      ? "top-full left-1/2 -translate-x-1/2 pt-3"
      : position === "left"
      ? "left-full top-1/2 -translate-y-1/2 pl-3"
      : position === "right"
      ? "right-full top-1/2 -translate-y-1/2 pr-3"
      : "bottom-full left-1/2 -translate-x-1/2 pb-3";

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`navbar-preview-dark absolute ${placementClass} pointer-events-auto z-50 select-none`}
    >
      <motion.div
        initial={{ opacity: 0, y: position === "top" ? -8 : 8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: position === "top" ? -6 : 6, scale: 0.95 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-label={`Jendela ${appName}`}
        className="flex items-center gap-2 max-w-[760px]"
      >
        <AnimatePresence mode="popLayout">
          {windows.slice(0, 4).map((win) => (
            <motion.div
              key={win.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.14 }}
              onClick={() => onSelectWindow?.(win.id, win.hwnd)}
              style={{
                backgroundColor: tintColor || "#141419",
                borderColor: "rgba(255,255,255,0.12)",
                boxShadow:
                  "0 18px 42px -6px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.12)",
              }}
              className="group relative w-[228px] shrink-0 p-2.5 rounded-[13px] border backdrop-blur-3xl hover:border-white/30 transition-all cursor-pointer text-white hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]"
            >
              {/* Window Title Bar */}
              <div className="flex items-center justify-between gap-1.5 h-6 mb-2 px-0.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="shrink-0 flex items-center justify-center w-4 h-4">
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
                      <Globe size={13} strokeWidth={1.8} className="text-white/60" />
                    )}
                  </span>
                  <span className="text-[12px] font-medium text-white/90 truncate leading-none">
                    {win.title}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseWindow?.(win.id, win.hwnd);
                  }}
                  title="Tutup jendela"
                  className="w-5 h-5 rounded-[5px] bg-transparent hover:bg-[#e81123] text-white/60 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <X size={11} strokeWidth={2.2} />
                </button>
              </div>

              {/* Live Captured Thumbnail Surface */}
              <LiveThumbnail win={win} accentColor={accentColor} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
