import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";
import { WidgetCatalogEntry, WidgetSize } from "../../../../services/desktopWidgetsService";
import { IosSegmentedControl } from "../../../ios/IosSegmentedControl";
import { WidgetGalleryTile } from "./WidgetGalleryTile";
import { localizeCatalogEntry } from "./desktopWidgetsI18n";

interface WidgetGalleryModalProps {
  open: boolean;
  catalog: WidgetCatalogEntry[];
  isLightMode: boolean;
  isId?: boolean;
  activeWidgetTypes?: string[];
  onClose: () => void;
  onAddWidget: (entry: WidgetCatalogEntry, size: WidgetSize) => void;
}

const resolveDefaultSize = (entry: WidgetCatalogEntry): WidgetSize => {
  if (entry.supported_sizes.includes(entry.default_size)) {
    return entry.default_size;
  }
  return entry.supported_sizes[0] ?? "medium";
};

export const WidgetGalleryModal: React.FC<WidgetGalleryModalProps> = ({
  open,
  catalog,
  isLightMode,
  isId = true,
  activeWidgetTypes = [],
  onClose,
  onAddWidget,
}) => {
  const tr = (idText: string, enText: string) => (isId ? idText : enText);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("ALL");
  const [sampleLightBg, setSampleLightBg] = useState(false);
  const [sizeByType, setSizeByType] = useState<Record<string, WidgetSize>>({});

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const installedSet = useMemo(() => new Set(activeWidgetTypes), [activeWidgetTypes]);

  const groupFilters = useMemo(
    () => [
      { id: "ALL", label: tr(`Semua (${catalog.length})`, `All (${catalog.length})`) },
      { id: "A", label: tr("Modul Gili", "Gili Modules") },
      { id: "B", label: tr("Produktif", "Productivity") },
      { id: "C", label: tr("Sistem", "System") },
      { id: "D", label: tr("Estetik", "Aesthetic") },
      { id: "E", label: "Indonesia" },
    ],
    [isId, catalog.length]
  );

  const catalogPairs = useMemo(
    () => catalog.map((raw) => ({ raw, localized: localizeCatalogEntry(raw, isId) })),
    [catalog, isId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogPairs.filter(({ raw, localized }) => {
      if (group !== "ALL" && localized.group !== group) return false;
      if (!q) return true;
      return (
        localized.name.toLowerCase().includes(q) ||
        localized.description.toLowerCase().includes(q) ||
        localized.group_label.toLowerCase().includes(q) ||
        raw.name.toLowerCase().includes(q) ||
        raw.description.toLowerCase().includes(q)
      );
    });
  }, [catalogPairs, query, group]);

  const surfaceCls = isLightMode
    ? "bg-[#f5f5f7] text-neutral-900 border-black/10"
    : "bg-[#121318] text-zinc-100 border-white/12";
  const borderCls = isLightMode ? "border-black/[0.08]" : "border-white/[0.08]";
  const mutedCls = isLightMode ? "text-neutral-600" : "text-zinc-400";

  const countLabel =
    filtered.length === catalog.length
      ? tr(`${catalog.length} widget tersedia`, `${catalog.length} widgets available`)
      : tr(
          `${filtered.length} dari ${catalog.length} widget`,
          `${filtered.length} of ${catalog.length} widgets`
        );

  const modalNode = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={tr("Galeri Widget Desktop", "Desktop Widget Gallery")}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-[1060px] h-[88vh] max-h-[760px] rounded-[22px] border shadow-[0_24px_70px_rgba(0,0,0,0.55)] flex flex-col overflow-hidden ${surfaceCls}`}
          >
            {/* Header */}
            <div className={`px-5 py-3.5 border-b ${borderCls} flex flex-wrap items-center justify-between gap-3 shrink-0`}>
              <div className="min-w-0">
                <h3 className="text-[15.5px] font-semibold tracking-tight">
                  {tr("Galeri Widget Desktop", "Desktop Widget Gallery")}
                </h3>
                <p className={`text-[11.5px] mt-0.5 ${mutedCls}`}>{countLabel}</p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <IosSegmentedControl
                  value={sampleLightBg ? "light" : "dark"}
                  onChange={(v) => setSampleLightBg(v === "light")}
                  options={[
                    { value: "dark", label: tr("Gelap", "Dark") },
                    { value: "light", label: tr("Terang", "Light") },
                  ]}
                />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={tr("Tutup galeri", "Close gallery")}
                  className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] ${
                    isLightMode
                      ? "bg-black/[0.07] hover:bg-black/[0.13] text-neutral-800"
                      : "bg-white/[0.08] hover:bg-white/[0.15] text-zinc-100"
                  }`}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Search & Category filters */}
            <div className={`px-5 py-2.5 border-b ${borderCls} flex flex-col gap-2 shrink-0`}>
              <div className="relative">
                <Search
                  size={14}
                  aria-hidden="true"
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${mutedCls}`}
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label={tr("Cari widget", "Search widgets")}
                  placeholder={tr(
                    "Cari widget (jam, cuaca, sholat, kanban, lirik, performa...)",
                    "Search widgets (clock, weather, prayer, kanban, lyrics, performance...)"
                  )}
                  className={`w-full h-9 pl-9 pr-9 rounded-[11px] border text-[12.5px] outline-none focus:border-[#0a84ff] ${
                    isLightMode
                      ? "bg-white border-black/10 text-neutral-900 placeholder:text-neutral-500"
                      : "bg-[#1a1b22] border-white/10 text-white placeholder:text-zinc-500"
                  }`}
                />
                {query.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={tr("Hapus pencarian", "Clear search")}
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] ${mutedCls}`}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {groupFilters.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={group === g.id}
                    onClick={() => setGroup(g.id)}
                    className={`px-3 py-1 rounded-full text-[11.5px] font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] ${
                      group === g.id
                        ? "bg-[#0a84ff] text-white"
                        : isLightMode
                        ? "bg-black/[0.06] hover:bg-black/[0.11] text-neutral-800"
                        : "bg-white/[0.07] hover:bg-white/[0.13] text-zinc-200"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pure Visual Gallery Grid (no sidebar / navbar) */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              {filtered.length === 0 ? (
                <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center gap-3">
                  <p className={`text-[13px] ${mutedCls}`}>
                    {query.trim()
                      ? tr(
                          `Tidak ada widget yang cocok dengan "${query.trim()}".`,
                          `No widgets match "${query.trim()}".`
                        )
                      : tr(
                          "Tidak ada widget pada kategori ini.",
                          "No widgets found in this category."
                        )}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setGroup("ALL");
                    }}
                    className="h-8 px-4 rounded-[10px] bg-[#0a84ff] hover:bg-[#0071e3] text-white text-[12px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]"
                  >
                    {tr("Reset Filter", "Reset Filters")}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 min-[1060px]:grid-cols-3 gap-4 items-stretch">
                  {filtered.map(({ raw, localized }) => {
                    const chosenSize =
                      sizeByType[localized.widget_type] ?? resolveDefaultSize(localized);
                    return (
                      <WidgetGalleryTile
                        key={localized.widget_type}
                        entry={localized}
                        selectedSize={chosenSize}
                        sampleLightBg={sampleLightBg}
                        isLightMode={isLightMode}
                        isId={isId}
                        installed={installedSet.has(localized.widget_type)}
                        onSelectSize={(sz) =>
                          setSizeByType((prev) => ({
                            ...prev,
                            [localized.widget_type]: sz,
                          }))
                        }
                        onAdd={() => onAddWidget(raw, chosenSize)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== "undefined") {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
};
