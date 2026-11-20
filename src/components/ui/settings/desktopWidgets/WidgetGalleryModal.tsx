import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import {
  WidgetCatalogEntry,
  WidgetSize,
} from "../../../../services/desktopWidgetsService";
import { IosSegmentedControl } from "../../../ios/IosSegmentedControl";
import { WidgetPreviewCard } from "./WidgetPreviewCard";

interface WidgetGalleryModalProps {
  open: boolean;
  catalog: WidgetCatalogEntry[];
  isLightMode: boolean;
  onClose: () => void;
  onAddWidget: (entry: WidgetCatalogEntry, size: WidgetSize) => void;
}

const GROUP_FILTERS = [
  { id: "ALL", label: "Semua (34)" },
  { id: "A", label: "Modul Gili" },
  { id: "B", label: "Produktif" },
  { id: "C", label: "Sistem" },
  { id: "D", label: "Estetik" },
  { id: "E", label: "Indonesia" },
];

const SIZE_LABEL: Record<WidgetSize, string> = {
  small: "Kecil . 160 x 160 dp",
  medium: "Sedang . 336 x 160 dp",
  large: "Besar . 336 x 336 dp",
};

export const WidgetGalleryModal: React.FC<WidgetGalleryModalProps> = ({
  open,
  catalog,
  isLightMode,
  onClose,
  onAddWidget,
}) => {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("ALL");
  const [selected, setSelected] = useState<WidgetCatalogEntry | null>(null);
  const [sizeIdx, setSizeIdx] = useState(0);
  const [sampleLightBg, setSampleLightBg] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((item) => {
      if (group !== "ALL" && item.group !== group) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.group_label.toLowerCase().includes(q)
      );
    });
  }, [catalog, query, group]);

  const activeEntry = selected ?? filtered[0] ?? catalog[0] ?? null;
  const sizes = activeEntry?.supported_sizes ?? ["medium"];
  const activeSize = sizes[sizeIdx % sizes.length] ?? "medium";

  const surfaceCls = isLightMode
    ? "bg-[#f5f5f7] text-neutral-900 border-black/10"
    : "bg-[#121318] text-zinc-100 border-white/12";
  const mutedCls = isLightMode ? "text-neutral-500" : "text-zinc-400";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-4xl max-h-[86vh] rounded-[24px] border shadow-[0_24px_70px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden ${surfaceCls}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
              <div>
                <h3 className="text-[15.5px] font-semibold tracking-tight">Galeri Widget Desktop</h3>
                <p className={`text-[11.5px] ${mutedCls}`}>
                  Pilih dari 34 widget native Direct2D, geser ukuran S / M / L sebelum menambahkan.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup galeri"
                className="w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.15] flex items-center justify-center cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Search & Category pills */}
            <div className="px-5 py-3 border-b border-white/[0.08] flex flex-col gap-2.5">
              <div className="relative">
                <Search
                  size={14}
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${mutedCls}`}
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari widget (jam, cuaca, sholat, kanban, lirik, performa...)"
                  className={`w-full h-9 pl-9 pr-3 rounded-[11px] border text-[12.5px] outline-none focus:border-[#0a84ff] ${
                    isLightMode
                      ? "bg-white border-black/10 text-neutral-900"
                      : "bg-[#1a1b22] border-white/10 text-white"
                  }`}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {GROUP_FILTERS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setGroup(g.id);
                      setSizeIdx(0);
                    }}
                    className={`px-3 py-1 rounded-full text-[11.5px] font-medium cursor-pointer transition-colors ${
                      group === g.id
                        ? "bg-[#0a84ff] text-white"
                        : isLightMode
                        ? "bg-black/[0.06] hover:bg-black/[0.1]"
                        : "bg-white/[0.07] hover:bg-white/[0.13]"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Two-column body */}
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
              <div className="md:col-span-5 overflow-y-auto p-3 border-r border-white/[0.08] flex flex-col gap-1">
                {filtered.map((entry) => {
                  const isSel = activeEntry?.widget_type === entry.widget_type;
                  return (
                    <button
                      key={entry.widget_type}
                      type="button"
                      onClick={() => {
                        setSelected(entry);
                        setSizeIdx(0);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-[12px] transition-all cursor-pointer ${
                        isSel
                          ? "bg-[#0a84ff]/18 border border-[#0a84ff]/45"
                          : "border border-transparent hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-semibold truncate">{entry.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 uppercase font-medium">
                          {entry.supported_sizes.map((s) => s[0]).join(" . ")}
                        </span>
                      </div>
                      <p className={`text-[11px] line-clamp-1 mt-0.5 ${mutedCls}`}>
                        {entry.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="md:col-span-7 p-5 flex flex-col gap-4 overflow-hidden min-h-0">
                {activeEntry && (
                  <>
                    <div className="shrink-0 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#0a84ff]">
                          Grup {activeEntry.group} . {activeEntry.group_label}
                        </span>
                        <h4 className="text-[17px] font-semibold mt-0.5 truncate">
                          {activeEntry.name}
                        </h4>
                        <p className={`text-[12px] mt-0.5 line-clamp-2 ${mutedCls}`}>
                          {activeEntry.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAddWidget(activeEntry, activeSize)}
                        className="shrink-0 h-9 px-4 rounded-full bg-[#0a84ff] hover:bg-[#0071e3] text-white text-[12.5px] font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-[0_6px_18px_rgba(10,132,255,0.35)]"
                      >
                        <Plus size={14} /> Tambah Widget
                      </button>
                    </div>

                    {/* Visual preview stage with horizontal S/M/L pager + dots */}
                    <div
                      className="flex-1 min-h-[260px] rounded-[20px] p-5 flex flex-col items-center justify-between gap-3 transition-all overflow-y-auto"
                      style={{
                        background: sampleLightBg
                          ? "linear-gradient(135deg, #e0f2fe 0%, #e2e8f0 50%, #f8fafc 100%)"
                          : "linear-gradient(135deg, #0b1120 0%, #1e293b 55%, #09090b 100%)",
                      }}
                    >
                      <div className="w-full flex items-center justify-between gap-2">
                        <span
                          className={`text-[11px] font-medium ${
                            sampleLightBg ? "text-slate-600" : "text-white/70"
                          }`}
                        >
                          {SIZE_LABEL[activeSize]}
                        </span>
                        <IosSegmentedControl
                          value={sampleLightBg ? "light" : "dark"}
                          onChange={(v) => setSampleLightBg(v === "light")}
                          options={[
                            { value: "dark", label: "Gelap" },
                            { value: "light", label: "Terang" },
                          ]}
                        />
                      </div>

                      <motion.div
                        key={`${activeEntry.widget_type}_${activeSize}`}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: "spring", stiffness: 360, damping: 30 }}
                      >
                        <WidgetPreviewCard
                          entry={activeEntry}
                          size={activeSize}
                          lightWallpaper={sampleLightBg}
                        />
                      </motion.div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={sizes.length <= 1}
                          onClick={() =>
                            setSizeIdx((i) => (i - 1 + sizes.length) % sizes.length)
                          }
                          className="w-7 h-7 rounded-full bg-black/30 hover:bg-black/45 text-white flex items-center justify-center disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <div className="flex items-center gap-1.5">
                          {sizes.map((sz, idx) => (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => setSizeIdx(idx)}
                              aria-label={SIZE_LABEL[sz]}
                              className={`h-2 rounded-full transition-all cursor-pointer ${
                                idx === sizeIdx % sizes.length
                                  ? "w-5 bg-[#0a84ff]"
                                  : sampleLightBg
                                  ? "w-2 bg-slate-900/25"
                                  : "w-2 bg-white/35"
                              }`}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          disabled={sizes.length <= 1}
                          onClick={() => setSizeIdx((i) => (i + 1) % sizes.length)}
                          className="w-7 h-7 rounded-full bg-black/30 hover:bg-black/45 text-white flex items-center justify-center disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
