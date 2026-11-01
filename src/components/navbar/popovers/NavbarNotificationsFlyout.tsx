import React, { useState, useEffect, useRef } from "react";
import { Bell, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import {
  NotificationHistoryItem,
  loadNotificationHistory,
  clearNotificationHistory,
} from "../../../services/notificationHistoryService";

interface NavbarNotificationsFlyoutProps {
  onClose: () => void;
}

export const NavbarNotificationsFlyout: React.FC<NavbarNotificationsFlyoutProps> = ({
  onClose,
}) => {
  const [items, setItems] = useState<NotificationHistoryItem[]>(() =>
    loadNotificationHistory()
  );
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(loadNotificationHistory());
  }, []);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleDown);
    return () => window.removeEventListener("mousedown", handleDown);
  }, [onClose]);

  const handleClear = () => {
    clearNotificationHistory();
    setItems([]);
  };

  return (
    <motion.div
      ref={flyoutRef}
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        boxShadow:
          "0 24px 50px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
      className="absolute bottom-full mb-3.5 right-6 w-[330px] p-4 rounded-[22px] bg-[#0c0c10] border border-white/[0.08] backdrop-blur-2xl text-white select-none pointer-events-auto z-50 flex flex-col gap-3 max-h-[380px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-blue-400" />
          <span className="font-semibold text-[13px] text-white">Notifikasi</span>
          {items.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold">
              {items.length}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="text-[11px] text-white/50 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Trash2 size={12} />
            <span>Hapus Semua</span>
          </button>
        )}
      </div>

      {/* Notifications list */}
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[280px] pr-1">
        {items.length === 0 ? (
          <div className="py-8 text-center text-white/40 text-[12px] flex flex-col items-center gap-2">
            <Bell size={24} className="opacity-30" />
            <span>Tidak ada notifikasi baru</span>
          </div>
        ) : (
          items.slice(0, 8).map((item) => (
            <div
              key={item.id}
              className="p-2.5 rounded-[12px] bg-[#16161c] border border-white/[0.04] flex flex-col gap-1 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-[12px] text-white/90 truncate">
                  {item.appName || "Sistem"}
                </span>
                <span className="text-[10px] text-white/40">
                  {new Date(item.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-[11.5px] text-white/70 line-clamp-2 leading-relaxed">
                {item.title}
              </p>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};
