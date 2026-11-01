import React, { useState, useMemo } from "react";
import { NavbarConfig } from "../../../types/navbar";
import {
  MODULE_CATALOG,
  NavbarModuleUnifiedPreview,
  CatalogModuleItem,
} from "../../../modules/components/NavbarModuleUnifiedPreview";

interface AddModuleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  config: NavbarConfig;
  onAddModule: (moduleId: string) => void;
  onRemoveModule: (moduleId: string) => void;
  isLightMode?: boolean;
}

type CategoryFilter =
  | "Semua"
  | "Produktif"
  | "Sistem"
  | "Media & estetika"
  | "Gaya hidup";

export const AddModuleDialog: React.FC<AddModuleDialogProps> = ({
  isOpen,
  onClose,
  config,
  onAddModule,
  onRemoveModule,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("Semua");

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

  if (!isOpen) return null;

  const isAdded = (id: string) => config.modules.some((m) => m.id === id);

  const categories: { id: CategoryFilter; label: string; count: number }[] = [
    { id: "Semua", label: "Semua", count: categoryCounts.Semua },
    { id: "Produktif", label: "Produktif", count: categoryCounts.Produktif },
    { id: "Sistem", label: "Sistem", count: categoryCounts.Sistem },
    {
      id: "Media & estetika",
      label: "Media & estetika",
      count: categoryCounts["Media & estetika"],
    },
    { id: "Gaya hidup", label: "Gaya hidup", count: categoryCounts["Gaya hidup"] },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-[1140px] max-w-[96vw] max-h-[88vh] rounded-[14px] bg-[#1d1d23] border border-white/[0.11] shadow-[0_24px_70px_rgba(0,0,0,0.55)] p-[22px_24px] flex flex-col gap-[14px] overflow-hidden text-[#e4e4e7]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Section 1: Header (Title, Subtitle, Search bar, Close button) */}
        <div className="flex items-center gap-[14px] shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-[20px] font-semibold tracking-[-0.01em] text-[#f4f4f5]">
              Tambah modul
            </div>
            <div className="text-[13px] text-[#a1a1aa] mt-1">
              Pilih modul untuk navbar. Tiap modul punya tampilan ringkas (ikon) dan lengkap (info).
            </div>
          </div>

          {/* Search Input Box */}
          <div className="w-[230px] h-[34px] rounded-[9px] bg-[#232329] flex items-center gap-2 px-[11px] text-[12px] text-[#8b8b95] shrink-0">
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
              placeholder="Cari modul"
              className="bg-transparent border-0 outline-none text-[#e4e4e7] placeholder-[#8b8b95] text-[12px] w-full"
            />
          </div>

          {/* Close X Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-[34px] h-[34px] rounded-[9px] bg-[#232329] flex items-center justify-center text-[#a1a1aa] hover:text-white transition-colors cursor-pointer shrink-0"
            aria-label="Tutup"
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

        {/* Section 2: Category Chips Row */}
        <div className="flex gap-2 shrink-0 overflow-x-auto no-scrollbar">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`h-[30px] rounded-[15px] px-[14px] flex items-center gap-[7px] text-[12px] font-medium transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? "bg-[#3882F6] text-white"
                    : "bg-[#232329] text-[#c4c4cc] hover:text-white"
                }`}
              >
                <span>{cat.label}</span>
                <span className="text-[10px] opacity-70 font-normal">
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Section 3: 4-Column Module Cards Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto settings-scroll pr-1">
          <div className="grid grid-cols-4 gap-3 align-start">
            {filteredModules.map((item: CatalogModuleItem) => {
              const added = isAdded(item.id);

              return (
                <div
                  key={item.id}
                  className="bg-[#232329] rounded-[12px] p-[10px] flex flex-col gap-2 box-border overflow-hidden select-none"
                >
                  {/* Unified Live/Static Preview matching HTML */}
                  <NavbarModuleUnifiedPreview
                    moduleId={item.id}
                    variant="full"
                    className="w-full flex justify-center"
                  />

                  {/* Title row with Category color dot & Action button */}
                  <div className="flex items-center gap-[7px]">
                    <i
                      className="w-[7px] h-[7px] rounded-[4px] shrink-0"
                      style={{ background: item.categoryColor }}
                    />
                    <div className="text-[13px] font-semibold flex-1 text-[#f4f4f5] truncate">
                      {item.name}
                    </div>

                    {/* Button: + Tambah or ✓ Ditambah */}
                    {added ? (
                      <button
                        type="button"
                        onClick={() => onRemoveModule(item.id)}
                        className="h-6 rounded-[7px] px-[9px] flex items-center gap-1 text-[11px] font-semibold bg-[#2c2c33] text-[#8b8b95] hover:text-rose-400 hover:bg-[#34343d] transition-colors cursor-pointer shrink-0"
                      >
                        ✓ Ditambah
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAddModule(item.id)}
                        className="h-6 rounded-[7px] px-[9px] flex items-center gap-1 text-[11px] font-semibold bg-[#3882F6] text-white hover:bg-[#2563eb] transition-colors cursor-pointer shrink-0"
                      >
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        Tambah
                      </button>
                    )}
                  </div>

                  {/* Description row (exact 11px, height 30px, line-height 1.4) */}
                  <div className="text-[11px] leading-[1.4] text-[#8b8b95] h-[30px] overflow-hidden">
                    {item.description}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredModules.length === 0 && (
            <div className="py-16 text-center text-zinc-500 text-[13px]">
              Tidak ada modul yang cocok dengan pencarian "{searchQuery}".
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
