import React from "react";
import { X, Globe } from "lucide-react";
import { motion } from "framer-motion";

export interface WindowPreviewItem {
  id: string;
  title: string;
  icon?: React.ReactNode;
  thumbnailUrl?: string;
}

interface WindowPreviewCardProps {
  appName: string;
  windows: WindowPreviewItem[];
  accentColor?: string;
  tintColor?: string;
  onSelectWindow?: (windowId: string) => void;
  onCloseWindow?: (windowId: string) => void;
}

export const WindowPreviewCard: React.FC<WindowPreviewCardProps> = ({
  appName,
  windows,
  accentColor = "#0a84ff",
  tintColor = "#15151a",
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
        boxShadow: "0 18px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
      className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 p-3.5 rounded-[22px] border border-white/[0.08] backdrop-blur-2xl z-50 select-none text-white pointer-events-auto"
    >
      {/* Header */}
      <div className="flex justify-between items-center px-1 pb-2.5 text-[11px] font-medium text-white/50 tracking-wide">
        <span className="font-semibold text-white/80">{appName}</span>
        <span>
          {windows.length} {windows.length > 1 ? "jendela" : "jendela"}
        </span>
      </div>

      {/* Windows list */}
      <div className="flex items-center gap-2">
        {windows.map((win) => (
          <div
            key={win.id}
            onClick={() => onSelectWindow?.(win.id)}
            className="group relative w-[180px] p-2.5 rounded-[14px] bg-[#0b0b0e] border border-white/[0.08] hover:border-white/30 transition-all cursor-pointer shadow-sm"
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
                  onCloseWindow?.(win.id);
                }}
                className="w-4 h-4 rounded-full bg-white/10 hover:bg-red-500 text-white/70 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={10} />
              </button>
            </div>

            {/* Thumbnail Mockup */}
            <div className="w-full h-[88px] rounded-[8px] bg-[#141419] border border-white/[0.04] overflow-hidden flex flex-col p-2 gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
              <div
                style={{ backgroundColor: accentColor }}
                className="w-1/3 h-1.5 rounded-full opacity-70"
              />
              <div className="w-4/5 h-1.5 rounded-full bg-white/10" />
              <div className="w-3/5 h-1.5 rounded-full bg-white/10" />
              <div className="w-1/2 h-1.5 rounded-full bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
