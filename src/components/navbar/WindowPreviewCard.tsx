import React, { useState, useEffect } from "react";
import { X, Globe } from "lucide-react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";

export interface WindowPreviewItem {
  id: string;
  hwnd?: number;
  title: string;
  icon?: React.ReactNode;
  thumbnailUrl?: string;
}

interface WindowPreviewCardProps {
  appName: string;
  windows: WindowPreviewItem[];
  accentColor?: string;
  tintColor?: string;
  onSelectWindow?: (windowId: string, hwnd?: number) => void;
  onCloseWindow?: (windowId: string, hwnd?: number) => void;
}

const LiveThumbnail: React.FC<{ win: WindowPreviewItem; accentColor: string }> = ({
  win,
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
    <div className="w-full h-[95px] rounded-[8px] bg-[#141419] border border-white/[0.06] overflow-hidden relative flex items-center justify-center">
      {thumb ? (
        <img
          src={thumb}
          alt={win.title}
          draggable={false}
          className="w-full h-full object-cover object-top rounded-[8px] transition-transform duration-200 group-hover:scale-105"
        />
      ) : loading ? (
        <div className="flex items-center gap-1.5 text-white/40 text-[10px]">
          <span className="w-2 h-2 rounded-full border border-white/40 border-t-transparent animate-spin" />
          <span>Memuat pratinjau...</span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1 p-2 text-white/30 text-[10px] text-center">
          <span className="truncate max-w-[150px]">{win.title}</span>
        </div>
      )}
    </div>
  );
};

export const WindowPreviewCard: React.FC<WindowPreviewCardProps> = ({
  appName,
  windows,
  accentColor = "#0a84ff",
  tintColor = "#121217",
  onSelectWindow,
  onCloseWindow,
}) => {
  if (!windows.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      role="dialog"
      aria-label={`Jendela ${appName}`}
      style={{
        backgroundColor: tintColor,
        boxShadow: "0 18px 40px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
      className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 p-3 rounded-[20px] border border-white/[0.08] backdrop-blur-2xl z-50 select-none text-white pointer-events-auto"
    >
      {/* Header */}
      <div className="flex justify-between items-center px-1 pb-2 text-[11px] font-medium text-white/50 tracking-wide">
        <span className="font-semibold text-white/90">{appName}</span>
        <span>
          {windows.length} {windows.length > 1 ? "jendela" : "jendela"}
        </span>
      </div>

      {/* Windows list */}
      <div className="flex items-center gap-2">
        {windows.map((win) => (
          <div
            key={win.id}
            onClick={() => onSelectWindow?.(win.id, win.hwnd)}
            className="group relative w-[190px] p-2.5 rounded-[12px] bg-[#0b0b0e] border border-white/[0.08] hover:border-white/30 transition-all cursor-pointer shadow-sm"
          >
            {/* Window title bar */}
            <div className="flex items-center gap-2 h-5 mb-2">
              <span className="text-white/60 shrink-0">
                {win.icon || <Globe size={13} strokeWidth={1.8} />}
              </span>
              <span className="flex-1 min-w-0 text-[11.5px] font-medium text-white/90 truncate">
                {win.title}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseWindow?.(win.id, win.hwnd);
                }}
                className="w-4 h-4 rounded-full bg-white/10 hover:bg-red-500 text-white/70 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={10} />
              </button>
            </div>

            {/* Live Captured Thumbnail */}
            <LiveThumbnail win={win} accentColor={accentColor} />
          </div>
        ))}
      </div>
    </motion.div>
  );
};
