import React, { useState, useEffect, useRef } from "react";
import { Bell, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import {
  NotificationHistoryItem,
  loadNotificationHistory,
  clearNotificationHistory,
} from "../../../services/notificationHistoryService";
import {
  useTaskbarLang,
  tx,
  dateLocale,
  type DockPosition,
} from "../../../services/taskbarI18n";
import {
  useNavbarLightMode,
  getInlineFlyoutPositionClass,
  getInlineFlyoutMotionOffset,
} from "../navbarThemeUtils";

interface NavbarNotificationsFlyoutProps {
  onClose: () => void;
  position?: DockPosition;
  isLightMode?: boolean;
}

export const NavbarNotificationsFlyout: React.FC<NavbarNotificationsFlyoutProps> = ({
  onClose,
  position = "bottom",
  isLightMode: isLightModeProp,
}) => {
  const lang = useTaskbarLang();
  const locale = dateLocale(lang);
  const isLightMode = useNavbarLightMode(isLightModeProp);
  const [items, setItems] = useState<NotificationHistoryItem[]>(() =>
    loadNotificationHistory()
  );
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(loadNotificationHistory());
  }, []);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (flyoutRef.current && flyoutRef.current.contains(target)) return;
      if (target?.closest('[data-flyout-trigger="notifications"]')) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handleDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const handleClear = () => {
    clearNotificationHistory();
    setItems([]);
  };

  const motionInitial = getInlineFlyoutMotionOffset(position);
  const placementClass = getInlineFlyoutPositionClass(
    position,
    "right-6",
    "bottom-2"
  );

  return (
    <motion.div
      ref={flyoutRef}
      data-navbar-flyout="true"
      data-module-popover="true"
      initial={motionInitial}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={motionInitial}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        boxShadow: isLightMode
          ? "0 20px 44px rgba(15,23,42,0.16), 0 0 0 1px rgba(0,0,0,0.08)"
          : "0 24px 50px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
      className={`absolute ${placementClass} w-[330px] max-w-[calc(100vw-24px)] max-h-[min(380px,calc(100vh-24px))] overflow-y-auto p-4 rounded-[22px] border backdrop-blur-2xl select-none pointer-events-auto z-50 flex flex-col gap-3 ${
        isLightMode
          ? "bg-white/95 border-black/[0.1] text-zinc-900"
          : "bg-[#0c0c10] border-white/[0.08] text-white"
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between pb-2 border-b ${
          isLightMode ? "border-black/[0.08]" : "border-white/[0.06]"
        }`}
      >
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-blue-500" />
          <span
            className={`font-semibold text-[13px] ${
              isLightMode ? "text-zinc-900" : "text-white"
            }`}
          >
            {tx(lang, "Notifications", "Notifikasi")}
          </span>
          {items.length > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                isLightMode
                  ? "bg-blue-500/15 text-blue-700"
                  : "bg-blue-500/20 text-blue-300"
              }`}
            >
              {items.length}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className={`text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
              isLightMode
                ? "text-zinc-600 hover:text-red-600"
                : "text-white/50 hover:text-red-400"
            }`}
          >
            <Trash2 size={12} />
            <span>{tx(lang, "Clear All", "Hapus Semua")}</span>
          </button>
        )}
      </div>

      {/* Notifications list */}
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[280px] pr-1">
        {items.length === 0 ? (
          <div
            className={`py-8 text-center text-[12px] flex flex-col items-center gap-2 ${
              isLightMode ? "text-zinc-500" : "text-white/40"
            }`}
          >
            <Bell size={24} className="opacity-35" />
            <span>{tx(lang, "No new notifications", "Tidak ada notifikasi baru")}</span>
          </div>
        ) : (
          items.slice(0, 8).map((item) => (
            <div
              key={item.id}
              className={`p-2.5 rounded-[12px] border flex flex-col gap-1 transition-colors ${
                isLightMode
                  ? "bg-zinc-100/90 border-black/[0.06] hover:border-black/[0.14]"
                  : "bg-[#16161c] border-white/[0.04] hover:border-white/10"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-medium text-[12px] truncate ${
                    isLightMode ? "text-zinc-900" : "text-white/90"
                  }`}
                >
                  {item.appName || tx(lang, "System", "Sistem")}
                </span>
                <span
                  className={`text-[10px] shrink-0 ${
                    isLightMode ? "text-zinc-500" : "text-white/40"
                  }`}
                >
                  {new Date(item.timestamp).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p
                className={`text-[11.5px] line-clamp-2 leading-relaxed ${
                  isLightMode ? "text-zinc-700" : "text-white/70"
                }`}
              >
                {item.title}
              </p>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};
