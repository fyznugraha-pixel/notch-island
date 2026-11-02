import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderDown, Trash2, FolderOpen, Check, Info, ChevronLeft } from "lucide-react";
import { IosSwitch } from "../../ios/IosSwitch";
import { t, getLanguage } from "../../../services/i18n";
import {
  loadShelfSettings,
  saveShelfSettings,
  clearShelfPreviewCache,
  type ShelfSettings,
} from "../../../services/shelfService";

export interface DropShelfSettingsViewProps {
  isLightMode?: boolean;
  onBack: () => void;
}

export const DropShelfSettingsView: React.FC<DropShelfSettingsViewProps> = ({
  isLightMode = false,
  onBack,
}) => {
  const [settings, setSettings] = useState<ShelfSettings>(() => loadShelfSettings());
  const [isCacheCleared, setIsCacheCleared] = useState(false);
  const isId = getLanguage() === "id";

  const handleToggleAutoRemove = () => {
    const next: ShelfSettings = {
      ...settings,
      autoRemoveOnDrop: !settings.autoRemoveOnDrop,
    };
    setSettings(next);
    saveShelfSettings(next);
  };

  const handleClearCache = () => {
    clearShelfPreviewCache();
    setIsCacheCleared(true);
    setTimeout(() => {
      setIsCacheCleared(false);
    }, 2000);
  };

  const handleOpenReceivedFolder = () => {
    invoke("open_shelf_received_folder").catch(() => {
      // Fallback: try showing generic user downloads directory
      invoke("show_in_folder", { path: "" }).catch(console.error);
    });
  };

  return (
    <div className="w-full h-full flex flex-col min-w-0 select-none overflow-hidden px-6 pb-2 pt-1">
      {/* Top Bar with Back Button */}
      <div className="flex items-center justify-between h-[28px] mb-1.5 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer border ${
            isLightMode
              ? "bg-black/5 hover:bg-black/10 border-black/10 text-neutral-700"
              : "bg-white/[0.06] hover:bg-white/[0.1] border-white/8 text-zinc-200"
          }`}
        >
          <ChevronLeft size={13} />
          <span>{isId ? "Kembali ke Berkas" : "Back to Shelf"}</span>
        </button>

        <span className={`text-[10px] font-medium ${isLightMode ? "text-neutral-400" : "text-zinc-500"}`}>
          {isId ? "Pengaturan Rak Berkas" : "Shelf Preferences"}
        </span>
      </div>

      {/* Settings Scrollable Body */}
      <div className="flex-1 overflow-y-auto no-scrollbar space-y-2.5 pr-0.5">
        {/* Card 1: Perilaku Drag & Drop */}
        <div
          className={`rounded-[16px] border p-3 flex flex-col gap-2.5 transition-colors ${
            isLightMode
              ? "bg-white/80 border-black/10 shadow-sm"
              : "bg-[#141418] border-white/[0.08]"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-[8px] bg-[#3882f6]/15 text-[#3882f6] flex items-center justify-center">
              <FolderDown size={14} />
            </div>
            <span
              className={`text-[12px] font-semibold tracking-tight ${
                isLightMode ? "text-neutral-900" : "text-white"
              }`}
            >
              {isId ? "Perilaku Drag & Drop" : "Drag & Drop Behavior"}
            </span>
          </div>

          <div
            className={`flex items-center justify-between p-2.5 rounded-[12px] border ${
              isLightMode
                ? "bg-neutral-50/80 border-neutral-200/80"
                : "bg-white/[0.03] border-white/5"
            }`}
          >
            <div className="flex flex-col pr-3">
              <span
                className={`text-[11.5px] font-medium leading-tight ${
                  isLightMode ? "text-neutral-800" : "text-zinc-200"
                }`}
              >
                {t("shelf_settings_auto_remove")}
              </span>
              <span
                className={`text-[10px] leading-relaxed mt-0.5 ${
                  isLightMode ? "text-neutral-500" : "text-zinc-400"
                }`}
              >
                {t("shelf_settings_auto_remove_desc")}
              </span>
            </div>

            <IosSwitch
              checked={settings.autoRemoveOnDrop}
              onChange={handleToggleAutoRemove}
              activeColor="blue"
            />
          </div>
        </div>

        {/* Card 2: Penyimpanan & Folder HP */}
        <div
          className={`rounded-[16px] border p-3 flex flex-col gap-2.5 transition-colors ${
            isLightMode
              ? "bg-white/80 border-black/10 shadow-sm"
              : "bg-[#141418] border-white/[0.08]"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-[8px] bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <FolderOpen size={14} />
            </div>
            <span
              className={`text-[12px] font-semibold tracking-tight ${
                isLightMode ? "text-neutral-900" : "text-white"
              }`}
            >
              {isId ? "Penyimpanan & Cache" : "Storage & Cache"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Open Folder Button */}
            <button
              type="button"
              onClick={handleOpenReceivedFolder}
              className={`flex items-center justify-between p-2.5 rounded-[12px] border text-left transition-all cursor-pointer ${
                isLightMode
                  ? "bg-neutral-50/80 border-neutral-200/80 hover:bg-neutral-100"
                  : "bg-white/[0.03] border-white/5 hover:bg-white/[0.06]"
              }`}
            >
              <div className="flex flex-col">
                <span
                  className={`text-[11px] font-medium leading-tight ${
                    isLightMode ? "text-neutral-800" : "text-zinc-200"
                  }`}
                >
                  {t("shelf_settings_open_folder")}
                </span>
                <span
                  className={`text-[9.5px] leading-tight mt-0.5 ${
                    isLightMode ? "text-neutral-500" : "text-zinc-400"
                  }`}
                >
                  Downloads\Gili Shelf
                </span>
              </div>
              <FolderOpen
                size={14}
                className={isLightMode ? "text-neutral-500 shrink-0" : "text-zinc-400 shrink-0"}
              />
            </button>

            {/* Clear Preview Cache Button */}
            <button
              type="button"
              onClick={handleClearCache}
              className={`flex items-center justify-between p-2.5 rounded-[12px] border text-left transition-all cursor-pointer ${
                isLightMode
                  ? "bg-neutral-50/80 border-neutral-200/80 hover:bg-neutral-100"
                  : "bg-white/[0.03] border-white/5 hover:bg-white/[0.06]"
              }`}
            >
              <div className="flex flex-col">
                <span
                  className={`text-[11px] font-medium leading-tight ${
                    isCacheCleared
                      ? "text-emerald-400 font-semibold"
                      : isLightMode
                      ? "text-neutral-800"
                      : "text-zinc-200"
                  }`}
                >
                  {isCacheCleared
                    ? t("shelf_settings_cache_cleared")
                    : t("shelf_settings_clear_cache")}
                </span>
                <span
                  className={`text-[9.5px] leading-tight mt-0.5 ${
                    isLightMode ? "text-neutral-500" : "text-zinc-400"
                  }`}
                >
                  {isId ? "Segarkan pratinjau" : "Refresh thumbnail previews"}
                </span>
              </div>
              {isCacheCleared ? (
                <Check size={14} className="text-emerald-400 shrink-0" />
              ) : (
                <Trash2
                  size={14}
                  className={isLightMode ? "text-neutral-500 shrink-0" : "text-zinc-400 shrink-0"}
                />
              )}
            </button>
          </div>
        </div>

        {/* Card 3: Tips & Petunjuk */}
        <div
          className={`flex items-start gap-2.5 p-2.5 rounded-[14px] border ${
            isLightMode
              ? "bg-blue-50/60 border-blue-200/60 text-blue-900"
              : "bg-[#3882f6]/10 border-[#3882f6]/20 text-[#bfdbfe]"
          }`}
        >
          <Info size={14} className="shrink-0 mt-0.5 opacity-80" />
          <div className="text-[10px] leading-relaxed">
            {isId ? (
              <span>
                <strong>Tips:</strong> Tarik file apapun langsung ke Notch untuk menampungnya sementara. Anda bisa men-drag satu file berkali-kali ke WhatsApp, Discord, atau dokumen kerja tanpa khawatir file terhapus secara tiba-tiba.
              </span>
            ) : (
              <span>
                <strong>Tip:</strong> Drag any files directly onto the Notch to hold them temporarily. You can drag a file multiple times into chats or folders without fear of accidental removal.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
