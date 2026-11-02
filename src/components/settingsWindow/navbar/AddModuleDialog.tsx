import React, { useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { NavbarConfig } from "../../../types/navbar";
import { Language } from "../../../services/i18n";
import {
  MODULE_CATALOG,
  MODULE_ID_ALIASES,
  NavbarModuleUnifiedPreview,
  CatalogModuleItem,
} from "../../../modules/components/NavbarModuleUnifiedPreview";

interface AddModuleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  config: NavbarConfig;
  onAddModule: (moduleId: string, preferredView?: "compact" | "full") => void;
  onRemoveModule: (moduleId: string) => void;
  onChangeModuleView?: (moduleId: string, view: "compact" | "full") => void;
  isLightMode?: boolean;
  optLanguage?: Language;
}

type CategoryFilter =
  | "Semua"
  | "Produktif"
  | "Sistem"
  | "Media & estetika"
  | "Gaya hidup";

const BUILTIN_IDS = new Set([
  "startSearch",
  "pinnedApps",
  "runningApps",
  "systemIcons",
  "notifications",
  "clockDate",
]);

interface ModuleCardProps {
  item: CatalogModuleItem;
  added: boolean;
  activeView: "compact" | "full";
  onSelectView: (catalogId: string, view: "compact" | "full") => void;
  onAdd: (catalogId: string, view: "compact" | "full") => void;
  onRemove: (catalogId: string) => void;
  isId?: boolean;
}

const ModuleCard: React.FC<ModuleCardProps> = React.memo(
  ({ item, added, activeView, onSelectView, onAdd, onRemove, isId = true }) => {
    return (
      <div
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 165px" }}
        className="bg-[#232329] hover:bg-[#27272e] transition-colors rounded-[12px] p-[10px] flex flex-col gap-[8px] overflow-hidden select-none"
      >
        {/* Interactive Dual Preview Box: Click Left for Ikon (compact) or Right for Panjang (full) */}
        <div className="h-[64px] rounded-[10px] bg-black px-2 flex items-center justify-center gap-2 overflow-hidden">
          <button
            type="button"
            onClick={() => onSelectView(item.id, "compact")}
            title={isId ? "Pilih tampilan Hanya Ikon (Ringkas)" : "Select Icon Only (Compact) view"}
            className={`p-1 rounded-[12px] transition-all cursor-pointer flex items-center justify-center shrink-0 ${
              activeView === "compact"
                ? "ring-1.5 ring-[#3882F6] bg-[#3882F6]/15 shadow-[0_0_12px_rgba(56,130,246,0.28)]"
                : "opacity-65 hover:opacity-100"
            }`}
          >
            <NavbarModuleUnifiedPreview
              moduleId={item.id}
              variant="compact"
            />
          </button>

          <button
            type="button"
            onClick={() => onSelectView(item.id, "full")}
            title={isId ? "Pilih tampilan Versi Panjang (Lengkap)" : "Select Full Version (Expanded) view"}
            className={`p-1 rounded-[12px] transition-all cursor-pointer flex items-center justify-center min-w-0 overflow-hidden ${
              activeView === "full"
                ? "ring-1.5 ring-[#3882F6] bg-[#3882F6]/15 shadow-[0_0_12px_rgba(56,130,246,0.28)]"
                : "opacity-65 hover:opacity-100"
            }`}
          >
            <NavbarModuleUnifiedPreview
              moduleId={item.id}
              variant="pill"
            />
          </button>
        </div>

        {/* Title row with Category dot, View Switcher [Ikon | Panjang], & + Tambah / ✓ Ditambah */}
        <div className="flex items-center gap-[6px] min-w-0">
          <i
            className="w-[7px] h-[7px] rounded-full shrink-0"
            style={{ background: item.categoryColor }}
          />
          <div
            className="text-[12.5px] font-semibold text-[#f4f4f5] flex-1 min-w-0 truncate"
            title={item.name}
          >
            {item.name}
          </div>

          {/* Explicit [Ikon | Panjang] selector */}
          <div className="inline-flex items-center rounded-[7px] bg-[#16171d] p-[2px] border border-white/[0.07] shrink-0">
            <button
              type="button"
              onClick={() => onSelectView(item.id, "compact")}
              className={`px-1.5 py-0.5 rounded-[5px] text-[10px] font-semibold transition-all cursor-pointer ${
                activeView === "compact"
                  ? "bg-[#3882F6] text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title={isId ? "Tampilkan hanya ikon di taskbar" : "Show icon only in taskbar"}
            >
              {isId ? "Ikon" : "Icon"}
            </button>
            <button
              type="button"
              onClick={() => onSelectView(item.id, "full")}
              className={`px-1.5 py-0.5 rounded-[5px] text-[10px] font-semibold transition-all cursor-pointer ${
                activeView === "full"
                  ? "bg-[#3882F6] text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title={isId ? "Tampilkan versi panjang (info lengkap) di taskbar" : "Show full info in taskbar"}
            >
              {isId ? "Panjang" : "Full"}
            </button>
          </div>

          {added ? (
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="h-[30px] px-[9px] rounded-[8px] bg-emerald-500/15 text-[#4ade80] hover:bg-rose-500/20 hover:text-rose-300 text-[11px] font-semibold inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title={isId ? "Klik untuk menghapus dari taskbar" : "Click to remove from taskbar"}
            >
              ✓
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onAdd(item.id, activeView)}
              className="h-[30px] px-[10px] rounded-[8px] bg-[#3882F6] hover:bg-[#2563eb] text-white text-[11px] font-semibold inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              {isId ? "+ Tambah" : "+ Add"}
            </button>
          )}
        </div>

        {/* Description */}
        <div className="text-[11px] leading-[1.4] text-[#a1a1ab] min-h-[30px]">
          {item.description}
        </div>
      </div>
    );
  }
);

export const AddModuleDialog: React.FC<AddModuleDialogProps> = ({
  isOpen,
  onClose,
  config,
  onAddModule,
  onRemoveModule,
  onChangeModuleView,
  optLanguage = "id",
}) => {
  const isId = optLanguage === "id";
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("Semua");
  const [selectedViews, setSelectedViews] = useState<
    Record<string, "compact" | "full">
  >({});

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      Semua: MODULE_CATALOG.length,
      Produktif: 0,
      Sistem: 0,
      "Media & estetika": 0,
      "Gaya hidup": 0,
    };
    for (const m of MODULE_CATALOG) {
      if (counts[m.category] !== undefined) {
        counts[m.category]++;
      }
    }
    return counts;
  }, []);

  const filteredModules = useMemo(() => {
    return MODULE_CATALOG.filter((m) => {
      const matchCat =
        activeCategory === "Semua" || m.category === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [activeCategory, searchQuery]);

  // Fast O(1) canonical map for added modules and their active views
  const { addedMap, configViewsMap, configIdsMap } = useMemo(() => {
    const added = new Map<string, boolean>();
    const views = new Map<string, "compact" | "full">();
    const ids = new Map<string, string>();

    for (const m of config.modules) {
      if (BUILTIN_IDS.has(m.id)) continue;
      const canonical = MODULE_ID_ALIASES[m.id] || m.id;
      added.set(canonical, true);
      added.set(m.id, true);
      if (m.view) {
        views.set(canonical, m.view);
        views.set(m.id, m.view);
      }
      ids.set(canonical, m.id);
      ids.set(m.id, m.id);
    }

    return { addedMap: added, configViewsMap: views, configIdsMap: ids };
  }, [config.modules]);

  const handleSelectView = useCallback(
    (catalogId: string, view: "compact" | "full") => {
      setSelectedViews((prev) => ({ ...prev, [catalogId]: view }));
      const actualId = configIdsMap.get(catalogId);
      if (actualId && onChangeModuleView) {
        onChangeModuleView(actualId, view);
      }
    },
    [configIdsMap, onChangeModuleView]
  );

  const handleRemoveByCatalogId = useCallback(
    (catalogId: string) => {
      const actualId = configIdsMap.get(catalogId) || catalogId;
      onRemoveModule(actualId);
    },
    [configIdsMap, onRemoveModule]
  );

  const handleAddByCatalogId = useCallback(
    (catalogId: string, view: "compact" | "full") => {
      onAddModule(catalogId, view);
    },
    [onAddModule]
  );

  if (!isOpen) return null;

  const addedCustomCount = config.modules.filter(
    (m) => !BUILTIN_IDS.has(m.id)
  ).length;

  const categories: { id: CategoryFilter; label: string; count: number }[] = [
    { id: "Semua", label: isId ? "Semua" : "All", count: categoryCounts.Semua },
    { id: "Produktif", label: isId ? "Produktif" : "Productivity", count: categoryCounts.Produktif },
    { id: "Sistem", label: isId ? "Sistem" : "System", count: categoryCounts.Sistem },
    {
      id: "Media & estetika",
      label: isId ? "Media & estetika" : "Media & Aesthetics",
      count: categoryCounts["Media & estetika"],
    },
    {
      id: "Gaya hidup",
      label: isId ? "Gaya hidup" : "Lifestyle",
      count: categoryCounts["Gaya hidup"],
    },
  ];

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#04060c]/85 p-4 select-none"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={isId ? "Tambah modul" : "Add Module"}
        className="w-[880px] max-w-[96vw] h-[730px] max-h-[92vh] rounded-[20px] bg-[#0d1017] border border-[#232838] shadow-[0_30px_80px_rgba(0,0,0,0.75)] flex flex-col overflow-hidden text-[#e4e4e7]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-[22px] pt-[20px] pb-[14px] shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-bold tracking-[-0.01em] text-white">
              {isId ? "Tambah modul" : "Add Module"}
            </div>
            <div className="text-[12px] text-[#a1a1ab] mt-[3px]">
              {isId
                ? "Pilih modul buat taskbar lo. Bebas mau versi ikon ringkas atau info lengkap."
                : "Choose modules for your taskbar. Select compact icon or full info view."}
            </div>
          </div>

          {/* Search Input Box */}
          <div className="w-[230px] h-[38px] rounded-[10px] bg-[#141926] border border-[#1f2536] flex items-center gap-2 px-3 text-[12px] text-[#8b8b95] shrink-0">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden="true"
            >
              <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isId ? "Cari modul" : "Search modules..."}
              className="bg-transparent border-0 outline-none text-[#e4e4e7] placeholder-[#8b8b95] text-[12px] w-full"
            />
          </div>

          {/* Close X Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-[38px] h-[38px] rounded-[11px] bg-[#141926] flex items-center justify-center text-[#cfd3e0] hover:text-white hover:bg-[#1c2334] transition-colors cursor-pointer shrink-0"
            aria-label={isId ? "Tutup" : "Close"}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex gap-2 px-[22px] pb-[14px] shrink-0 overflow-x-auto no-scrollbar">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`h-[38px] rounded-[11px] px-4 flex items-center gap-2 text-[12.5px] font-semibold transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? "bg-[#1b2233] text-white shadow-[inset_0_0_0_1px_rgba(47,139,255,0.55)]"
                    : "bg-[#0a0c11] text-[#a1a1ab] shadow-[inset_0_0_0_1px_#1a1e29] hover:text-white"
                }`}
              >
                <span>{cat.label}</span>
                <span className="text-[11px] opacity-75 font-medium">
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 3-Column Module Cards Grid with Hardware Acceleration & Content Visibility */}
        <div
          style={{ transform: "translateZ(0)" }}
          className="flex-1 min-h-0 overflow-y-auto settings-scroll px-[22px] pb-4 overscroll-contain"
        >
          <div className="grid grid-cols-3 gap-[10px] content-start">
            {filteredModules.map((item: CatalogModuleItem) => {
              const added = Boolean(addedMap.get(item.id));
              const activeView =
                configViewsMap.get(item.id) ||
                selectedViews[item.id] ||
                "full";

              return (
                <ModuleCard
                  key={item.id}
                  item={item}
                  added={added}
                  activeView={activeView}
                  onSelectView={handleSelectView}
                  onAdd={handleAddByCatalogId}
                  onRemove={handleRemoveByCatalogId}
                  isId={isId}
                />
              );
            })}
          </div>

          {filteredModules.length === 0 && (
            <div className="py-16 text-center text-zinc-500 text-[13px]">
              {isId
                ? `Gak nemu modul yang cocok sama kata kunci "${searchQuery}".`
                : `No modules found matching "${searchQuery}".`}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-[22px] py-[14px] border-t border-[#1a1e29] bg-[#0b0e14] shrink-0">
          <span className="flex-1 text-[12px] text-[#a1a1ab]">
            {isId
              ? `${filteredModules.length} modul · ${addedCustomCount} dipakai di taskbar`
              : `${filteredModules.length} modules · ${addedCustomCount} active on taskbar`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-[40px] px-[22px] rounded-[11px] bg-[#141926] hover:bg-[#1d2436] text-[#cfd3e0] hover:text-white text-[13px] font-semibold transition-colors cursor-pointer"
          >
            {isId ? "Selesai" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
