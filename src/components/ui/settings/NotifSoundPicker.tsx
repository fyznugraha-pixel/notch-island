import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Volume2 } from "lucide-react";
import {
  NOTIF_SOUND_LIST,
  previewNotificationSound,
} from "../../../services/soundService";

export interface NotifSoundPickerProps {
  value: string;
  onChange: (soundId: string) => void;
}

export const NotifSoundPicker: React.FC<NotifSoundPickerProps> = ({
  value,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentItem =
    NOTIF_SOUND_LIST.find((s) => s.id === value) || NOTIF_SOUND_LIST[0];

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  const handleSelect = (soundId: string) => {
    onChange(soundId);
    previewNotificationSound(soundId);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-block select-none">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-[10px] bg-white/[0.06] hover:bg-white/[0.1] active:bg-white/[0.14] border border-white/10 text-white text-[11.5px] font-medium transition-colors cursor-pointer"
      >
        <Volume2 size={13} className="text-[#af52de] shrink-0" />
        <span className="truncate max-w-[120px]">{currentItem.name}</span>
        <ChevronDown
          size={12}
          className={`text-white/50 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-white" : ""
          }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            data-scrollable="true"
            className="absolute bottom-full mb-1.5 right-0 z-50 w-[190px] max-h-[220px] overflow-y-auto settings-scroll bg-[#18181c]/95 backdrop-blur-xl border border-white/15 rounded-[14px] p-1 shadow-[0_12px_36px_rgba(0,0,0,0.7)] flex flex-col gap-0.5"
          >
            {NOTIF_SOUND_LIST.map((item) => {
              const isSelected = item.id === value;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[9px] text-[12px] text-left transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-[#0a84ff]/20 text-[#0a84ff] font-semibold"
                      : "text-white/80 hover:bg-white/[0.08] hover:text-white font-medium"
                  }`}
                >
                  <span className="truncate pr-2">{item.name}</span>
                  {isSelected && (
                    <Check size={13} className="text-[#0a84ff] shrink-0" />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
