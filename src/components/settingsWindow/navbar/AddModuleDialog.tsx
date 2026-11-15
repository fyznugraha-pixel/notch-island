import React, { useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { NavbarConfig } from "../../../types/navbar";
import { Language } from "../../../services/i18n";
import { useTaskbarLang, tx } from "../../../services/taskbarI18n";
import {
  getLocalizedCategoryLabel,
  getLocalizedModuleMeta,
  localizePreviewHtml,
} from "../../../modules/moduleI18n";
import {
  MODULE_CATALOG,
  MODULE_ID_ALIASES,
  getCatalogModule,
  CatalogModuleItem,
} from "../../../modules/components/NavbarModuleUnifiedPreview";
import { Tooltip } from "../../ui/Tooltip";

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

const LocalizedModulePreview: React.FC<{
  moduleId: string;
  variant: "compact" | "pill";
  lang: Language;
}> = React.memo(({ moduleId, variant, lang }) => {
  const item = getCatalogModule(moduleId);
  if (!item) {
    return (
      <div className="w-10 h-10 rounded-[12px] bg-white/10 flex items-center justify-center text-zinc-400 text-xs">
        {moduleId.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  const rawHtml = variant === "compact" ? item.tileHtml : item.pillHtml;
  const htmlSnippet = localizePreviewHtml(rawHtml, lang);
  return (
    <div
      className="inline-flex shrink-0 select-none"
      dangerouslySetInnerHTML={{ __html: htmlSnippet }}
    />
  );
});

interface ModuleCardProps {
  item: CatalogModuleItem;
  added: boolean;
  activeView: "compact" | "full";
  onSelectView: (catalogId: string, view: "compact" | "full") => void;
  onAdd: (catalogId: string, view: "compact" | "full") => void;
  onRemove: (catalogId: string) => void;
  isLightMode: boolean;
  lang: Language;
}

const ModuleCard: React.FC<ModuleCardProps> = React.memo(
  ({
    item,
    added,
    activeView,
    onSelectView,
    onAdd,
    onRemove,
    isLightMode,
    lang,
  }) => {
    const localizedMeta = getLocalizedModuleMeta(
      item.id,
      lang,
      item.name,
      item.description
    );

    const compactLabel = tx(
      lang,
      "Select Icon Only (Compact) view",
      "Pilih tampilan Hanya Ikon (Ringkas)"
    );
    const fullLabel = tx(
      lang,
      "Select Full Version (Expanded) view",
      "Pilih tampilan Versi Panjang (Lengkap)"
    );
    const iconTip = tx(
      lang,
      "Show icon only in taskbar",
      "Tampilkan hanya ikon di taskbar"
    );
    const fullTip = tx(
      lang,
      "Show full info in taskbar",
      "Tampilkan versi panjang (info lengkap) di taskbar"
    );
    const removeTip = tx(
      lang,
      "Click to remove from taskbar",
      "Klik untuk menghapus dari taskbar"
    );

    return (
      <div
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 165px" }}
        className={`transition-colors rounded-[12px] p-[10px] flex flex-col gap-[8px] overflow-hidden select-none border ${
          isLightMode
            ? "bg-white hover:bg-neutral-50 border-black/[0.08] shadow-xs"
            : "bg-[#232329] hover:bg-[#27272e] border-transparent"
        }`}
      >
        {/* Interactive Dual Preview Box: Click Left for Icon (compact) or Right for Full */}
        <div
          className={`h-[64px] rounded-[10px] bg-black px-2 flex items-center justify-center gap-2 overflow-hidden ${
            isLightMode ? "border border-black/10" : ""
          }`}
        >
          <Tooltip
            content={compactLabel}
            allowFlip
            isLightMode={isLightMode}
            wrapperClassName="shrink-0"
          >
            <button
              type="button"
              aria-label={compactLabel}
              onClick={() => onSelectView(item.id, "compact")}
              className={`p-1 rounded-[12px] transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                activeView === "compact"
                  ? "ring-1.5 ring-[#3882F6] bg-[#3882F6]/15 shadow-[0_0_12px_rgba(56,130,246,0.28)]"
                  : "opacity-65 hover:opacity-100"
              }`}
            >
              <LocalizedModulePreview
                moduleId={item.id}
                variant="compact"
                lang={lang}
              />
            </button>
          </Tooltip>

          <Tooltip
            content={fullLabel}
            allowFlip
            isLightMode={isLightMode}
            wrapperClassName="min-w-0 max-w-full"
          >
            <button
              type="button"
              aria-label={fullLabel}
              onClick={() => onSelectView(item.id, "full")}
              className={`p-1 rounded-[12px] transition-all cursor-pointer flex items-center justify-center min-w-0 max-w-full overflow-hidden ${
                activeView === "full"
                  ? "ring-1.5 ring-[#3882F6] bg-[#3882F6]/15 shadow-[0_0_12px_rgba(56,130,246,0.28)]"
                  : "opacity-65 hover:opacity-100"
              }`}
            >
              <LocalizedModulePreview
                moduleId={item.id}
                variant="pill"
                lang={lang}
              />
            </button>
          </Tooltip>
        </div>

        {/* Title row with Category dot, View Switcher [Icon | Full], & + Add / Checkmark */}
        <div className="flex items-center gap-[6px] min-w-0">
          <i
            className="w-[7px] h-[7px] rounded-full shrink-0"
            style={{ background: item.categoryColor }}
            aria-hidden="true"
          />
          <Tooltip
            content={localizedMeta.name}
            allowFlip
            isLightMode={isLightMode}
            wrapperClassName="flex-1 min-w-0 justify-start"
          >
            <div
              className={`text-[12.5px] font-semibold w-full truncate ${
                isLightMode ? "text-neutral-900" : "text-[#f4f4f5]"
              }`}
            >
              {localizedMeta.name}
            </div>
          </Tooltip>

          {/* Explicit [Icon | Full] selector */}
          <div
            className={`inline-flex items-center rounded-[7px] p-[2px] border shrink-0 ${
              isLightMode
                ? "bg-black/[0.05] border-black/[0.08]"
                : "bg-[#16171d] border-white/[0.07]"
            }`}
          >
            <Tooltip
              content={iconTip}
              allowFlip
              isLightMode={isLightMode}
              wrapperClassName="shrink-0"
            >
              <button
                type="button"
                onClick={() => onSelectView(item.id, "compact")}
                className={`px-1.5 py-0.5 rounded-[5px] text-[10px] font-semibold transition-all cursor-pointer ${
                  activeView === "compact"
                    ? "bg-[#3882F6] text-white"
                    : isLightMode
                    ? "text-neutral-600 hover:text-neutral-900"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tx(lang, "Icon", "Ikon")}
              </button>
            </Tooltip>
            <Tooltip
              content={fullTip}
              allowFlip
              isLightMode={isLightMode}
              wrapperClassName="shrink-0"
            >
              <button
                type="button"
                onClick={() => onSelectView(item.id, "full")}
                className={`px-1.5 py-0.5 rounded-[5px] text-[10px] font-semibold transition-all cursor-pointer ${
                  activeView === "full"
                    ? "bg-[#3882F6] text-white"
                    : isLightMode
                    ? "text-neutral-600 hover:text-neutral-900"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tx(lang, "Full", "Panjang")}
              </button>
            </Tooltip>
          </div>

          {added ? (
            <Tooltip
              content={removeTip}
              allowFlip
              isLightMode={isLightMode}
              wrapperClassName="shrink-0"
            >
              <button
                type="button"
                aria-label={removeTip}
                onClick={() => onRemove(item.id)}
                className={`h-[30px] px-[9px] rounded-[8px] text-[11px] font-semibold inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                  isLightMode
                    ? "bg-emerald-500/15 text-emerald-700 hover:bg-rose-500/15 hover:text-rose-600"
                    : "bg-emerald-500/15 text-[#4ade80] hover:bg-rose-500/20 hover:text-rose-300"
                }`}
              >
                ✓
              </button>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => onAdd(item.id, activeView)}
              className="h-[30px] px-[10px] rounded-[8px] bg-[#3882F6] hover:bg-[#2563eb] text-white text-[11px] font-semibold inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              {tx(lang, "+ Add", "+ Tambah")}
            </button>
          )}
        </div>

        {/* Description */}
        <div
          className={`text-[11px] leading-[1.4] min-h-[30px] ${
            isLightMode ? "text-neutral-600" : "text-[#a1a1ab]"
          }`}
        >
          {localizedMeta.description}
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
  isLightMode = false,
  optLanguage,
}) => {
  const taskbarLang = useTaskbarLang();
  const lang: Language = optLanguage ?? taskbarLang;
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
      if (!q) return matchCat;
      const localized = getLocalizedModuleMeta(
        m.id,
        lang,
        m.name,
        m.description
      );
      const matchSearch =
        localized.name.toLowerCase().includes(q) ||
        localized.description.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [activeCategory, searchQuery, lang]);

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
    {
      id: "Semua",
      label: getLocalizedCategoryLabel("Semua", lang),
      count: categoryCounts.Semua,
    },
    {
      id: "Produktif",
      label: getLocalizedCategoryLabel("Produktif", lang),
      count: categoryCounts.Produktif,
    },
    {
      id: "Sistem",
      label: getLocalizedCategoryLabel("Sistem", lang),
      count: categoryCounts.Sistem,
    },
    {
      id: "Media & estetika",
      label: getLocalizedCategoryLabel("Media & estetika", lang),
      count: categoryCounts["Media & estetika"],
    },
    {
      id: "Gaya hidup",
      label: getLocalizedCategoryLabel("Gaya hidup", lang),
      count: categoryCounts["Gaya hidup"],
    },
  ];

  const modalContent = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 select-none ${
        isLightMode ? "bg-black/35 backdrop-blur-xs" : "bg-[#04060c]/85"
      }`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tx(lang, "Add Module", "Tambah modul")}
        className={`w-[880px] max-w-[calc(100vw-32px)] h-[730px] max-h-[calc(100vh-32px)] rounded-[20px] flex flex-col overflow-hidden ${
          isLightMode
            ? "bg-[#f5f5f7] border border-black/10 text-neutral-900 shadow-[0_24px_60px_rgba(0,0,0,0.2)]"
            : "bg-[#0d1017] border border-[#232838] text-[#e4e4e7] shadow-[0_30px_80px_rgba(0,0,0,0.75)]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-start gap-3 px-[22px] pt-[20px] pb-[14px] shrink-0">
          <div className="flex-1 min-w-[200px]">
            <div
              className={`text-[18px] font-bold tracking-[-0.01em] ${
                isLightMode ? "text-neutral-900" : "text-white"
              }`}
            >
              {tx(lang, "Add Module", "Tambah modul")}
            </div>
            <div
              className={`text-[12px] mt-[3px] ${
                isLightMode ? "text-neutral-600" : "text-[#a1a1ab]"
              }`}
            >
              {tx(
                lang,
                "Choose modules for your taskbar. Pick compact icon or full info view.",
                "Pilih modul untuk taskbar Anda. Bebas pilih versi ikon ringkas atau info lengkap."
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Search Input Box */}
            <div
              className={`w-[230px] max-w-[44vw] h-[38px] rounded-[10px] border flex items-center gap-2 px-3 text-[12px] shrink-0 ${
                isLightMode
                  ? "bg-white border-black/10 text-neutral-500"
                  : "bg-[#141926] border-[#1f2536] text-[#8b8b95]"
              }`}
            >
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
                placeholder={tx(lang, "Search modules...", "Cari modul...")}
                aria-label={tx(lang, "Search modules", "Cari modul")}
                className={`bg-transparent border-0 outline-none text-[12px] w-full ${
                  isLightMode
                    ? "text-neutral-900 placeholder-neutral-400"
                    : "text-[#e4e4e7] placeholder-[#8b8b95]"
                }`}
              />
            </div>

            {/* Close X Button */}
            <button
              type="button"
              onClick={onClose}
              className={`w-[38px] h-[38px] rounded-[11px] flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                isLightMode
                  ? "bg-black/[0.06] text-neutral-600 hover:text-neutral-900 hover:bg-black/[0.1]"
                  : "bg-[#141926] text-[#cfd3e0] hover:text-white hover:bg-[#1c2334]"
              }`}
              aria-label={tx(lang, "Close", "Tutup")}
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
                    ? isLightMode
                      ? "bg-blue-500/12 text-blue-700 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.45)]"
                      : "bg-[#1b2233] text-white shadow-[inset_0_0_0_1px_rgba(47,139,255,0.55)]"
                    : isLightMode
                    ? "bg-white text-neutral-600 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] hover:text-neutral-900"
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

        {/* Responsive Module Cards Grid with Hardware Acceleration & Content Visibility */}
        <div
          style={{ transform: "translateZ(0)" }}
          className="flex-1 min-h-0 overflow-y-auto settings-scroll px-[22px] pb-4 overscroll-contain"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[10px] content-start">
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
                  isLightMode={isLightMode}
                  lang={lang}
                />
              );
            })}
          </div>

          {filteredModules.length === 0 && (
            <div
              className={`py-16 text-center text-[13px] ${
                isLightMode ? "text-neutral-500" : "text-zinc-500"
              }`}
            >
              {tx(
                lang,
                `No modules found matching "${searchQuery}".`,
                `Tidak ditemukan modul yang cocok dengan "${searchQuery}".`
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center gap-3 px-[22px] py-[14px] border-t shrink-0 ${
            isLightMode
              ? "border-black/[0.08] bg-white/85"
              : "border-[#1a1e29] bg-[#0b0e14]"
          }`}
        >
          <span
            className={`flex-1 text-[12px] ${
              isLightMode ? "text-neutral-600" : "text-[#a1a1ab]"
            }`}
          >
            {tx(
              lang,
              `${filteredModules.length} modules · ${addedCustomCount} active on taskbar`,
              `${filteredModules.length} modul · ${addedCustomCount} dipakai di taskbar`
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className={`h-[40px] px-[22px] rounded-[11px] text-[13px] font-semibold transition-colors cursor-pointer ${
              isLightMode
                ? "bg-black/[0.06] hover:bg-black/[0.1] text-neutral-800 hover:text-neutral-950"
                : "bg-[#141926] hover:bg-[#1d2436] text-[#cfd3e0] hover:text-white"
            }`}
          >
            {tx(lang, "Done", "Selesai")}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
