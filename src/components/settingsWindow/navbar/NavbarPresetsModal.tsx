import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { NavbarConfig } from "../../../types/navbar";
import { Language } from "../../../services/i18n";
import {
  X,
  Check,
  GraduationCap,
  Activity,
  Palette,
  LayoutTemplate,
  Bookmark,
  Plus,
  Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip } from "../../ui/Tooltip";

interface NavbarPresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: NavbarConfig;
  onApplyPreset: (presetPatch: Partial<NavbarConfig>, presetTitle: string) => void;
  isLightMode?: boolean;
  optLanguage?: Language;
}

interface PresetItem {
  id: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  badge: string;
  configPatch: Partial<NavbarConfig>;
}

export interface UserSavedPreset {
  id: string;
  title: string;
  createdAt: number;
  config: Partial<NavbarConfig>;
}

const STORAGE_KEY = "gili_user_navbar_presets_v1";

export const NavbarPresetsModal: React.FC<NavbarPresetsModalProps> = ({
  isOpen,
  onClose,
  config,
  onApplyPreset,
  isLightMode = false,
  optLanguage = "id",
}) => {
  const isId = optLanguage === "id";
  const [activeTab, setActiveTab] = useState<"all" | "custom" | "builtin">("all");
  const [newPresetName, setNewPresetName] = useState("");
  const [userPresets, setUserPresets] = useState<UserSavedPreset[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setUserPresets(parsed);
        }
      }
    } catch {}
  }, [isOpen]);

  const saveUserPresets = (next: UserSavedPreset[]) => {
    setUserPresets(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const handleCreatePreset = (e: React.FormEvent) => {
    e.preventDefault();
    const defaultTitle = isId
      ? `Preset Saya ${userPresets.length + 1}`
      : `My Preset ${userPresets.length + 1}`;
    const title = newPresetName.trim() || defaultTitle;

    const newPreset: UserSavedPreset = {
      id: `usr_${Date.now()}`,
      title,
      createdAt: Date.now(),
      config: {
        shape: config.shape,
        cornerRadius: config.cornerRadius,
        distanceFromEdge: config.distanceFromEdge,
        taskbarHeight: config.taskbarHeight,
        iconSize: config.iconSize,
        style: config.style,
        background: config.background,
        accent: config.accent,
        iconTheme: config.iconTheme,
        iconSpacing: config.iconSpacing,
        modules: config.modules,
        magnify: config.magnify,
        windowAnimation: config.windowAnimation,
        windowPreviews: config.windowPreviews,
        appLabels: config.appLabels,
      },
    };

    saveUserPresets([newPreset, ...userPresets]);
    setNewPresetName("");
  };

  const handleDeleteUserPreset = (id: string) => {
    saveUserPresets(userPresets.filter((p) => p.id !== id));
  };

  if (!isOpen) return null;

  // Built-in Presets
  const builtinPresets: PresetItem[] = [
    {
      id: "study_focus",
      title: isId ? "Preset Fokus Kuliah" : "Study & Focus Preset",
      desc: isId
        ? "To-Do fokus, Pomodoro, dan acara berikutnya di tengah bar."
        : "Focus To-Do, Pomodoro, and next calendar event centered on dock.",
      icon: <GraduationCap size={18} className="text-blue-400" />,
      badge: isId ? "Produktif" : "Productivity",
      configPatch: {
        shape: "floating",
        cornerRadius: 26,
        distanceFromEdge: 12,
        style: "solid",
        accent: "#3882F6",
        modules: [
          { id: "startSearch", group: 1, enabled: true, view: "compact" },
          { id: "pinnedApps", group: 1, enabled: true, view: "compact" },
          { id: "runningApps", group: 1, enabled: true, view: "compact" },
          { id: "to_do_fokus", group: 2, enabled: true, view: "full" },
          { id: "pomodoro", group: 2, enabled: true, view: "full" },
          { id: "acara_berikutnya", group: 2, enabled: true, view: "full" },
          { id: "hiddenTray", group: 3, enabled: true, view: "compact" },
          { id: "systemIcons", group: 3, enabled: true, view: "compact" },
          { id: "clockDate", group: 3, enabled: true, view: "compact" },
        ],
      },
    },
    {
      id: "system_monitor",
      title: isId ? "Preset Pantau Sistem" : "System Monitor Preset",
      desc: isId
        ? "CPU/RAM, jaringan, baterai, dan output audio dalam satu pandangan."
        : "CPU/RAM, network, battery, and audio output at a glance.",
      icon: <Activity size={18} className="text-emerald-400" />,
      badge: isId ? "Sistem" : "System",
      configPatch: {
        shape: "floating",
        cornerRadius: 26,
        distanceFromEdge: 12,
        style: "solid",
        accent: "#34c3a0",
        modules: [
          { id: "startSearch", group: 1, enabled: true, view: "compact" },
          { id: "pinnedApps", group: 1, enabled: true, view: "compact" },
          { id: "runningApps", group: 1, enabled: true, view: "compact" },
          { id: "pantau_sistem", group: 2, enabled: true, view: "full" },
          { id: "jaringan", group: 2, enabled: true, view: "full" },
          { id: "baterai_daya", group: 2, enabled: true, view: "full" },
          { id: "output_audio", group: 2, enabled: true, view: "full" },
          { id: "hiddenTray", group: 3, enabled: true, view: "compact" },
          { id: "clockDate", group: 3, enabled: true, view: "compact" },
        ],
      },
    },
    {
      id: "aesthetic_minimal",
      title: isId ? "Preset Estetik Minimal" : "Aesthetic Minimal Preset",
      desc: isId
        ? "Sedang diputar, cuaca, dan desktop virtual, bar tetap ringan."
        : "Now playing, weather, and virtual desktop for a clean setup.",
      icon: <Palette size={18} className="text-pink-400" />,
      badge: isId ? "Media & Estetika" : "Media & Aesthetics",
      configPatch: {
        shape: "floating",
        cornerRadius: 28,
        distanceFromEdge: 14,
        style: "solid",
        accent: "#3882F6",
        modules: [
          { id: "startSearch", group: 1, enabled: true, view: "compact" },
          { id: "pinnedApps", group: 1, enabled: true, view: "compact" },
          { id: "runningApps", group: 1, enabled: true, view: "compact" },
          { id: "sedang_diputar", group: 2, enabled: true, view: "full" },
          { id: "cuaca", group: 2, enabled: true, view: "full" },
          { id: "desktop_virtual", group: 2, enabled: true, view: "compact" },
          { id: "hiddenTray", group: 3, enabled: true, view: "compact" },
          { id: "clockDate", group: 3, enabled: true, view: "compact" },
        ],
      },
    },
  ];

  const modal = (
    <AnimatePresence>
      <div
        className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 select-none ${
          isLightMode ? "bg-black/35 backdrop-blur-xs" : "bg-[#04060c]/85"
        }`}
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={isId ? "Preset Taskbar" : "Taskbar Presets"}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => e.stopPropagation()}
          className={`relative w-full max-w-[min(620px,calc(100vw-32px))] max-h-[calc(100vh-32px)] flex flex-col rounded-[20px] border shadow-2xl overflow-hidden ${
            isLightMode
              ? "bg-[#f5f5f7] border-black/10 text-neutral-900"
              : "bg-[#0d1017] border-[#232838] text-white"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-[9px] bg-[#3882F6]/15 flex items-center justify-center text-[#3882F6] shrink-0">
                <LayoutTemplate size={17} />
              </div>
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold tracking-tight">
                  {isId ? "Preset Taskbar" : "Taskbar Presets"}
                </h2>
                <div
                  className={`text-[11.5px] ${
                    isLightMode ? "text-neutral-600" : "text-[#8a8fa0]"
                  }`}
                >
                  {isId
                    ? "Pilih preset siap pakai atau simpan setup taskbar favorit Anda."
                    : "Use ready-made presets or save your own favorite dock setups."}
                </div>
              </div>
            </div>
            <button
              type="button"
              aria-label={isId ? "Tutup" : "Close"}
              onClick={onClose}
              className={`w-8 h-8 rounded-[10px] flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                isLightMode
                  ? "bg-black/[0.06] text-neutral-600 hover:text-neutral-900 hover:bg-black/[0.1]"
                  : "bg-[#141926] text-[#cfd3e0] hover:text-white hover:bg-[#1c2334]"
              }`}
            >
              <X size={16} />
            </button>
          </div>

          {/* Form Simpan Preset Saat Ini */}
          <div className="px-6 py-2.5 shrink-0">
            <form
              onSubmit={handleCreatePreset}
              className={`p-3 rounded-[13px] border flex flex-col gap-2 ${
                isLightMode
                  ? "bg-white border-black/[0.08] shadow-xs"
                  : "bg-[#141926] border-[#232b3d]"
              }`}
            >
              <div
                className={`flex items-center justify-between text-[11px] font-semibold ${
                  isLightMode ? "text-neutral-800" : "text-zinc-300"
                }`}
              >
                <span className="flex items-center gap-1.5 text-[#3882F6]">
                  <Bookmark size={13} />
                  {isId ? "Simpan Konfigurasi Saat Ini" : "Save Current Configuration"}
                </span>
                <span
                  className={`text-[10px] ${
                    isLightMode ? "text-neutral-500" : "text-zinc-400"
                  }`}
                >
                  {isId
                    ? `${config.modules.filter((m) => m.enabled).length} modul aktif`
                    : `${config.modules.filter((m) => m.enabled).length} active modules`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder={
                    isId
                      ? "Beri nama preset (cth: Setup Kerja, Setup Malam)..."
                      : "Preset name (e.g. Work Setup, Night Setup)..."
                  }
                  className={`flex-1 min-w-0 h-8 px-3 rounded-[8px] border text-[12px] outline-none focus:border-[#3882F6] ${
                    isLightMode
                      ? "bg-neutral-50 border-black/15 text-neutral-900 placeholder-neutral-400"
                      : "bg-black/40 border-white/10 text-white placeholder-zinc-500"
                  }`}
                />
                <button
                  type="submit"
                  className="h-8 px-3.5 rounded-[8px] bg-[#3882F6] hover:bg-[#2563eb] text-white text-[11.5px] font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                >
                  <Plus size={14} />
                  <span>{isId ? "Simpan Preset" : "Save Preset"}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Tab Filter */}
          <div className="flex items-center gap-1.5 px-6 pb-2 shrink-0 overflow-x-auto no-scrollbar">
            {[
              { id: "all", label: isId ? "Semua" : "All", count: builtinPresets.length + userPresets.length },
              { id: "custom", label: isId ? "Preset Saya" : "My Presets", count: userPresets.length },
              { id: "builtin", label: isId ? "Preset Bawaan" : "Built-in Presets", count: builtinPresets.length },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-[8px] text-[11.5px] font-semibold transition-all cursor-pointer shrink-0 ${
                  activeTab === tab.id
                    ? isLightMode
                      ? "bg-blue-500/12 text-blue-700 border border-blue-500/35"
                      : "bg-[#1b2233] text-white border border-[#2f8bff]/50"
                    : isLightMode
                    ? "text-neutral-600 hover:text-neutral-900 bg-transparent"
                    : "text-zinc-400 hover:text-white bg-transparent"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Preset list with smooth scrolling */}
          <div className="flex-1 overflow-y-auto settings-scroll px-6 py-2 flex flex-col gap-2.5 overscroll-contain">
            {/* 1. User Custom Presets */}
            {(activeTab === "all" || activeTab === "custom") &&
              userPresets.map((preset) => {
                const activeMods =
                  preset.config.modules?.filter((m) => m.enabled).length ?? 0;
                const dateStr = new Date(preset.createdAt).toLocaleDateString(
                  isId ? "id-ID" : "en-US",
                  { day: "numeric", month: "short", year: "numeric" }
                );

                return (
                  <div
                    key={preset.id}
                    className={`p-3 rounded-[13px] border flex items-center justify-between transition-all ${
                      isLightMode
                        ? "bg-white border-black/[0.08] hover:border-blue-500/50 shadow-xs"
                        : "bg-[#111624] border-[#1e273b] hover:border-[#3882F6]/60"
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 pr-3">
                      <div
                        className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5 ${
                          isLightMode
                            ? "bg-blue-500/12 text-blue-600"
                            : "bg-[#3882F6]/20 text-[#60a5fa]"
                        }`}
                      >
                        <Bookmark size={18} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[13px] font-semibold truncate ${
                              isLightMode ? "text-neutral-900" : "text-white"
                            }`}
                          >
                            {preset.title}
                          </span>
                          <span
                            className={`text-[9.5px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                              isLightMode
                                ? "bg-blue-500/12 text-blue-700"
                                : "bg-[#3882F6]/20 text-[#60a5fa]"
                            }`}
                          >
                            {isId ? "Kustom Saya" : "Custom"}
                          </span>
                        </div>
                        <span
                          className={`text-[11px] leading-snug mt-0.5 ${
                            isLightMode ? "text-neutral-600" : "text-[#8a8fa0]"
                          }`}
                        >
                          {isId
                            ? `${activeMods} modul · Dibuat ${dateStr}`
                            : `${activeMods} modules · Created ${dateStr}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onApplyPreset(preset.config, preset.title);
                          onClose();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[#3882F6] text-white text-[11.5px] font-semibold hover:bg-[#2563eb] transition-colors cursor-pointer"
                      >
                        <Check size={12} strokeWidth={2.5} />
                        <span>{isId ? "Terapkan" : "Apply"}</span>
                      </button>
                      <Tooltip
                        content={isId ? "Hapus preset kustom ini" : "Delete this custom preset"}
                        allowFlip
                        isLightMode={isLightMode}
                        wrapperClassName="shrink-0"
                      >
                        <button
                          type="button"
                          aria-label={isId ? "Hapus preset kustom ini" : "Delete this custom preset"}
                          onClick={() => handleDeleteUserPreset(preset.id)}
                          className={`w-8 h-8 rounded-[8px] flex items-center justify-center cursor-pointer transition-colors ${
                            isLightMode
                              ? "bg-black/[0.05] hover:bg-rose-500/15 text-neutral-500 hover:text-rose-600"
                              : "bg-white/[0.05] hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400"
                          }`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}

            {/* 2. Builtin Presets */}
            {(activeTab === "all" || activeTab === "builtin") &&
              builtinPresets.map((preset) => (
                <div
                  key={preset.id}
                  className={`p-3 rounded-[13px] border flex items-center justify-between transition-all ${
                    isLightMode
                      ? "bg-white border-black/[0.08] hover:border-blue-500/50 shadow-xs"
                      : "bg-[#131722] border-[#1f2536] hover:border-[#2f8bff]/50"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 pr-3">
                    <div
                      className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5 ${
                        isLightMode ? "bg-black/[0.05]" : "bg-white/[0.06]"
                      }`}
                    >
                      {preset.icon}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[13px] font-semibold truncate ${
                            isLightMode ? "text-neutral-900" : "text-white"
                          }`}
                        >
                          {preset.title}
                        </span>
                        <span
                          className={`text-[9.5px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                            isLightMode
                              ? "bg-blue-500/12 text-blue-700"
                              : "bg-blue-500/15 text-blue-400"
                          }`}
                        >
                          {preset.badge}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] leading-snug mt-0.5 ${
                          isLightMode ? "text-neutral-600" : "text-[#8a8fa0]"
                        }`}
                      >
                        {preset.desc}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onApplyPreset(preset.configPatch, preset.title);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[#2f8bff] text-white text-[11.5px] font-semibold hover:bg-[#1c75e8] transition-colors shrink-0 shadow-sm cursor-pointer"
                  >
                    <Check size={12} strokeWidth={2.5} />
                    <span>{isId ? "Terapkan" : "Apply"}</span>
                  </button>
                </div>
              ))}

            {activeTab === "custom" && userPresets.length === 0 && (
              <div
                className={`py-8 text-center text-[12px] ${
                  isLightMode ? "text-neutral-500" : "text-zinc-500"
                }`}
              >
                {isId
                  ? 'Belum ada preset kustom yang disimpan. Ketik nama di atas lalu klik "Simpan Preset".'
                  : 'No custom presets saved yet. Type a name above and click "Save Preset".'}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className={`px-6 py-3 border-t flex items-center justify-end shrink-0 ${
              isLightMode
                ? "border-black/[0.08] bg-white/85"
                : "border-[#1a1e29] bg-[#0b0e14]"
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-1.5 rounded-[9px] text-[12px] font-semibold transition-colors cursor-pointer ${
                isLightMode
                  ? "bg-black/[0.06] hover:bg-black/[0.1] text-neutral-800 hover:text-neutral-950"
                  : "bg-[#141926] text-[#cfd3e0] hover:text-white"
              }`}
            >
              {isId ? "Tutup" : "Close"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
};
