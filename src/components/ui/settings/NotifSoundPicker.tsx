import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Volume2, UploadCloud, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  NOTIF_SOUND_LIST,
  previewNotificationSound,
  setSavedNotifSound,
} from "../../../services/soundService";
import {
  getAllCustomSounds,
  saveCustomSound,
  saveCustomSoundFromBuffer,
  deleteCustomSound,
  CustomSoundRecord,
} from "../../../services/customSoundStorage";
import { t, getLanguage } from "../../../services/i18n";

export interface NotifSoundPickerProps {
  value: string;
  onChange: (soundId: string) => void;
}

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

export const NotifSoundPicker: React.FC<NotifSoundPickerProps> = ({
  value,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customSounds, setCustomSounds] = useState<CustomSoundRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;
    getAllCustomSounds().then((sounds) => {
      if (isMounted) setCustomSounds(sounds);
    });
    return () => {
      isMounted = false;
    };
  }, []);

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

  const currentCustomItem = customSounds.find((s) => s.id === value);
  const currentPresetItem = NOTIF_SOUND_LIST.find((s) => s.id === value);
  const currentDisplayName =
    currentCustomItem?.name ||
    currentPresetItem?.name ||
    (value.startsWith("custom_") ? "Custom Audio" : NOTIF_SOUND_LIST[0].name);

  const handleSelect = (soundId: string) => {
    onChange(soundId);
    previewNotificationSound(soundId);
    setIsOpen(false);
  };

  const handleUploadClick = async () => {
    setErrorMessage(null);
    try {
      setIsUploading(true);
      const res = await invoke<{ file_name: string; bytes: number[] } | null>("pick_audio_file_dialog");
      if (res && res.bytes && res.bytes.length > 0) {
        const arrayBuffer = new Uint8Array(res.bytes).buffer;
        const record = await saveCustomSoundFromBuffer(res.file_name, arrayBuffer);
        setCustomSounds((prev) => [...prev, record]);
        onChange(record.id);
        previewNotificationSound(record.id);
        return;
      }
    } catch (err) {
      console.debug("Native file dialog fallback to HTML input:", err);
      fileInputRef.current?.click();
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);

    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage(t("sound_upload_error_size"));
      setTimeout(() => setErrorMessage(null), 3500);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      setIsUploading(true);
      const record = await saveCustomSound(file);
      setCustomSounds((prev) => [...prev, record]);
      onChange(record.id);
      previewNotificationSound(record.id);
    } catch (err) {
      console.error("Failed to upload custom sound:", err);
      setErrorMessage(getLanguage() === "id" ? "Gagal memproses file audio" : "Failed to process audio file");
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsUploading(false);
    }
  };

  const handleDelete = async (soundId: string) => {
    try {
      await deleteCustomSound(soundId);
      setCustomSounds((prev) => prev.filter((s) => s.id !== soundId));
      if (value === soundId) {
        onChange("glass");
        setSavedNotifSound("glass");
      }
    } catch (err) {
      console.error("Failed to delete custom sound:", err);
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/m4a,audio/*,.mp3,.wav,.ogg,.m4a"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-[10px] bg-white/[0.06] hover:bg-white/[0.1] active:bg-white/[0.14] border border-white/10 text-white text-[11.5px] font-medium transition-colors cursor-pointer"
      >
        <Volume2 size={13} className="text-[#af52de] shrink-0" />
        <span className="truncate max-w-[130px]">{currentDisplayName}</span>
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
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            data-scrollable="true"
            className="absolute top-full mt-1.5 right-0 z-50 w-[215px] max-h-[280px] overflow-y-auto settings-scroll bg-[#18181c]/95 backdrop-blur-xl border border-white/15 rounded-[14px] p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.7)] flex flex-col gap-0.5"
          >
            {errorMessage && (
              <div className="px-2 py-1 text-[10px] text-red-300 bg-red-500/15 border border-red-500/20 rounded-lg text-center font-medium animate-in fade-in">
                {errorMessage}
              </div>
            )}

            {/* Preset Section */}
            <div className="px-2 py-1 text-[9.5px] font-bold text-white/40 uppercase tracking-wider">
              {t("sound_preset_section")}
            </div>

            {NOTIF_SOUND_LIST.map((item) => {
              const isSelected = item.id === value;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[9px] text-[11.5px] text-left transition-colors cursor-pointer ${
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

            {/* Custom Sounds Section */}
            {customSounds.length > 0 && (
              <>
                <div className="my-1 border-t border-white/10" />
                <div className="px-2 py-1 text-[9.5px] font-bold text-white/40 uppercase tracking-wider">
                  {t("sound_custom_section")}
                </div>

                {customSounds.map((item) => {
                  const isSelected = item.id === value;
                  return (
                    <div
                      key={item.id}
                      className={`w-full group flex items-center justify-between px-2 py-1 rounded-[9px] transition-colors ${
                        isSelected
                          ? "bg-[#af52de]/20 text-[#d896ff]"
                          : "hover:bg-white/[0.08] text-white/85"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(item.id)}
                        className="flex-1 flex items-center justify-between min-w-0 pr-1 text-left cursor-pointer"
                      >
                        <span className="truncate text-[11.5px] font-medium">
                          {item.name}
                        </span>
                        {isSelected && (
                          <Check size={13} className="text-[#af52de] shrink-0 ml-1.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        title={t("sound_delete_tooltip")}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                        className="opacity-60 group-hover:opacity-100 hover:text-red-400 p-1 rounded transition-all cursor-pointer shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </>
            )}

            {/* Upload Button */}
            <div className="my-1 border-t border-white/10" />
            <button
              type="button"
              disabled={isUploading}
              onClick={handleUploadClick}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-[9px] text-[11px] font-medium text-[#af52de] hover:bg-[#af52de]/15 border border-dashed border-[#af52de]/30 hover:border-[#af52de]/60 transition-all cursor-pointer select-none disabled:opacity-50"
            >
              <UploadCloud size={13} className="shrink-0" />
              <span>
                {isUploading ? "Uploading..." : t("sound_upload_mp3")}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
