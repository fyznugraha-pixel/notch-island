import React, { useState } from "react";
import {
  NAVBAR_MODULE_CATALOG,
} from "../../../modules/registry";
import { NavbarConfig } from "../../../types/navbar";
import { NavbarModuleCategory } from "../../../modules/types";
import { Search, X, Plus, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AddModuleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  config: NavbarConfig;
  onAddModule: (moduleId: string) => void;
  onRemoveModule: (moduleId: string) => void;
  isLightMode?: boolean;
}

export const AddModuleDialog: React.FC<AddModuleDialogProps> = ({
  isOpen,
  onClose,
  config,
  onAddModule,
  onRemoveModule,
  isLightMode = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | NavbarModuleCategory
  >("all");

  if (!isOpen) return null;

  const categories: { id: "all" | NavbarModuleCategory; label: string }[] = [
    { id: "all", label: "Semua" },
    { id: "produktif", label: "Produktif" },
    { id: "sistem", label: "Sistem" },
    { id: "media", label: "Media & estetika" },
    { id: "gayahidup", label: "Gaya hidup" },
  ];

  const filteredModules = NAVBAR_MODULE_CATALOG.filter((m) => {
    const matchesCat =
      selectedCategory === "all" || m.category === selectedCategory;
    const matchesSearch =
      !searchQuery.trim() ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.desc.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const isModuleAdded = (id: string) =>
    config.modules.some((m) => m.id === id);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18 }}
          className={`relative w-full max-w-[680px] h-[600px] flex flex-col rounded-[20px] border shadow-2xl overflow-hidden ${
            isLightMode
              ? "bg-[#f5f5f7] border-black/10 text-neutral-900"
              : "bg-[#18181d] border-white/10 text-white"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h2 className="text-[17px] font-bold tracking-tight">
              Tambah Modul Navbar
            </h2>
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

          {/* Search bar & Category filters */}
          <div className="px-6 flex flex-col gap-3 pb-3">
            {/* Search Input */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[10px] border ${
                isLightMode
                  ? "bg-white border-black/10"
                  : "bg-[#202026] border-white/10"
              }`}
            >
              <Search size={14} className="text-zinc-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari modul..."
                className="w-full bg-transparent text-[12.5px] outline-none placeholder-zinc-500"
              />
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1 rounded-full text-[11.5px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? "bg-[#0a84ff] text-white shadow-sm"
                        : isLightMode
                        ? "bg-black/5 hover:bg-black/10 text-neutral-600"
                        : "bg-white/5 hover:bg-white/10 text-zinc-400"
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modules Grid */}
          <div className="flex-1 overflow-y-auto px-6 py-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredModules.map((module) => {
              const added = isModuleAdded(module.id);
              return (
                <div
                  key={module.id}
                  className={`p-3 rounded-[14px] border flex flex-col justify-between transition-all ${
                    isLightMode
                      ? "bg-white border-black/8 hover:border-black/20"
                      : "bg-[#202026] border-white/6 hover:border-white/15"
                  }`}
                >
                  <div>
                    {/* Live Preview Chip at top of card */}
                    <div className="w-full p-2 rounded-[9px] bg-black/40 border border-white/5 mb-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          style={{ backgroundColor: module.accentColor }}
                          className="w-2 h-2 rounded-full"
                        />
                        <span className="text-[12px] font-semibold text-white">
                          {module.chipLabel}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400">
                        {module.chipSub}
                      </span>
                    </div>

                    {/* Title row */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[13px] font-semibold truncate">
                        {module.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          added
                            ? onRemoveModule(module.id)
                            : onAddModule(module.id)
                        }
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                          added
                            ? "bg-white/10 text-zinc-300 hover:bg-red-500/20 hover:text-red-400"
                            : "bg-[#0a84ff] text-white hover:bg-[#0071e3] shadow-sm"
                        }`}
                      >
                        {added ? (
                          <>
                            <Check size={11} strokeWidth={2.5} />
                            <span>Ditambah</span>
                          </>
                        ) : (
                          <>
                            <Plus size={11} strokeWidth={2.5} />
                            <span>Tambah</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Description */}
                    <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                      {module.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            className={`px-6 py-3 border-t flex items-center justify-between ${
              isLightMode ? "border-black/8 bg-black/[0.02]" : "border-white/8 bg-black/20"
            }`}
          >
            <span className="text-[11.5px] text-zinc-400">
              Menampilkan {filteredModules.length} dari {NAVBAR_MODULE_CATALOG.length} modul
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-[9px] bg-[#0a84ff] text-white text-[12px] font-semibold hover:bg-[#0071e3] transition-colors cursor-pointer"
            >
              Selesai
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
