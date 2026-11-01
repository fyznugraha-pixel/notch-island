import React from "react";
import { NavbarConfig } from "../../../types/navbar";
import { X, Sparkles, Check, GraduationCap, Activity, Sparkle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface NavbarPresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPreset: (presetPatch: Partial<NavbarConfig>) => void;
  isLightMode?: boolean;
}

interface PresetItem {
  id: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  badge: string;
  configPatch: Partial<NavbarConfig>;
}

export const NavbarPresetsModal: React.FC<NavbarPresetsModalProps> = ({
  isOpen,
  onClose,
  onApplyPreset,
  isLightMode = false,
}) => {
  if (!isOpen) return null;

  const presets: PresetItem[] = [
    {
      id: "study_focus",
      title: "Fokus Kuliah & Belajar",
      desc: "Kombinasi Todo, Pomodoro dan Acara Berikutnya untuk produktivitas maksimal tanpa distraksi.",
      icon: <GraduationCap size={18} className="text-blue-400" />,
      badge: "Produktivitas",
      configPatch: {
        shape: "floating",
        cornerRadius: 15,
        distanceFromEdge: 14,
        style: "solid",
        accent: "#3882F6",
        modules: [
          { id: "startSearch", group: 1, enabled: true, view: "compact" },
          { id: "pinnedApps", group: 2, enabled: true, view: "compact" },
          { id: "todo", group: 2, enabled: true, view: "compact" },
          { id: "pomodoro", group: 2, enabled: true, view: "compact" },
          { id: "event", group: 2, enabled: true, view: "compact" },
          { id: "clockDate", group: 3, enabled: true, view: "compact" },
        ],
      },
    },
    {
      id: "system_monitor",
      title: "Pantau Sistem & Power User",
      desc: "Dock menempel di tepi bawah dengan telemetri CPU, RAM, kecepatan internet dan audio switch.",
      icon: <Activity size={18} className="text-emerald-400" />,
      badge: "Power User",
      configPatch: {
        shape: "anchored",
        cornerRadius: 15,
        distanceFromEdge: 0,
        style: "solid",
        accent: "#10b981",
        modules: [
          { id: "startSearch", group: 1, enabled: true, view: "compact" },
          { id: "runningApps", group: 2, enabled: true, view: "compact" },
          { id: "system", group: 3, enabled: true, view: "compact" },
          { id: "net", group: 3, enabled: true, view: "compact" },
          { id: "audiodevice", group: 3, enabled: true, view: "compact" },
          { id: "clockDate", group: 3, enabled: true, view: "compact" },
        ],
      },
    },
    {
      id: "aesthetic_minimal",
      title: "Estetik Minimal",
      desc: "Tampilan melayang dengan gaya liquid glassmorphism, cuaca terkini dan jam elegan.",
      icon: <Sparkle size={18} className="text-purple-400" />,
      badge: "Minimalis",
      configPatch: {
        shape: "floating",
        cornerRadius: 18,
        distanceFromEdge: 18,
        style: "liquid",
        accent: "#a855f7",
        modules: [
          { id: "startSearch", group: 1, enabled: true, view: "compact" },
          { id: "pinnedApps", group: 2, enabled: true, view: "compact" },
          { id: "weather", group: 3, enabled: true, view: "compact" },
          { id: "clockDate", group: 3, enabled: true, view: "compact" },
        ],
      },
    },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18 }}
          className={`relative w-full max-w-[560px] flex flex-col rounded-[20px] border shadow-2xl overflow-hidden ${
            isLightMode
              ? "bg-[#f5f5f7] border-black/10 text-neutral-900"
              : "bg-[#18181d] border-white/10 text-white"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-400" />
              <h2 className="text-[17px] font-bold tracking-tight">
                Pilih Preset Navbar
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                isLightMode ? "hover:bg-black/10" : "hover:bg-white/10 text-white"
              }`}
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-6 pb-2 text-[12px] text-zinc-400">
            Terapkan konfigurasi modul, bentuk bingkai dan gaya visual siap pakai sekali klik.
          </div>

          {/* Preset list */}
          <div className="flex flex-col gap-3 px-6 py-3">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className={`p-3.5 rounded-[14px] border flex items-center justify-between transition-all ${
                  isLightMode
                    ? "bg-white border-black/8 hover:border-blue-500/50 shadow-sm"
                    : "bg-[#202026] border-white/6 hover:border-blue-500/40"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 pr-3">
                  <div className="w-9 h-9 rounded-[10px] bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                    {preset.icon}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold truncate">
                        {preset.title}
                      </span>
                      <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-blue-500/15 text-blue-400 font-semibold shrink-0">
                        {preset.badge}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 leading-snug mt-1">
                      {preset.desc}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onApplyPreset(preset.configPatch);
                    onClose();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] bg-[#0a84ff] text-white text-[11.5px] font-semibold hover:bg-[#0071e3] transition-colors shrink-0 shadow-sm cursor-pointer"
                >
                  <Check size={12} strokeWidth={2.4} />
                  <span>Terapkan</span>
                </button>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div
            className={`px-6 py-3.5 border-t flex items-center justify-end ${
              isLightMode ? "border-black/8 bg-black/[0.02]" : "border-white/8 bg-black/20"
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-1.5 rounded-[9px] text-[12px] font-medium transition-colors cursor-pointer ${
                isLightMode ? "text-neutral-600 hover:bg-black/5" : "text-zinc-400 hover:text-white"
              }`}
            >
              Batal
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
