import React, { useMemo, useState } from "react";
import { Search, X, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import {
  WidgetCatalogEntry,
  WidgetSize,
} from "../../../../services/desktopWidgetsService";

interface WidgetGalleryModalProps {
  open: boolean;
  catalog: WidgetCatalogEntry[];
  isLightMode: boolean;
  onClose: () => void;
  onAddWidget: (entry: WidgetCatalogEntry, size: WidgetSize) => void;
}

const GROUP_FILTERS = [
  { id: "ALL", label: "Semua (29)" },
  { id: "A", label: "Modul Gili" },
  { id: "B", label: "Produktif" },
  { id: "C", label: "Sistem" },
  { id: "D", label: "Estetik" },
  { id: "E", label: "Indonesia" },
];

const SIZE_LABEL: Record<WidgetSize, string> = {
  small: "Kecil (S . 160x160)",
  medium: "Sedang (M . 336x160)",
  large: "Besar (L . 336x336)",
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

  if (!open) return null;

  const activeEntry = selected ?? filtered[0] ?? catalog[0] ?? null;
  const sizes = activeEntry?.supported_sizes ?? ["medium"];
  const activeSize = sizes[sizeIdx % sizes.length] ?? "medium";

  const surfaceCls = isLightMode
    ? "bg-white text-neutral-900 border-black/10"
    : "bg-[#111216] text-zinc-100 border-white/10";
  const mutedCls = isLightMode ? "text-neutral-500" : "text-zinc-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-4xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${surfaceCls}`}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div>
            <h3 className="text-[15px] font-semibold">Galeri Widget Desktop</h3>
            <p className={`text-[11.5px] ${mutedCls}`}>
              Pilih dari 29 widget native Direct2D dengan pratinjau S, M, dan L.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup galeri"
            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search + Category Pills */}
        <div className="px-5 py-3 border-b border-white/10 flex flex-col gap-2.5">
          <div className="relative">
            <Search
              size={14}
              className={`absolute left-3 top-1/2 -translate-y-1/2 ${mutedCls}`}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari widget (jam, cuaca, sholat, kanban, lirik, performa...)"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-[12.5px] outline-none focus:border-blue-500"
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
                    ? "bg-blue-600 text-white"
                    : "bg-white/[0.06] hover:bg-white/[0.12]"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Two-column body: list left + S/M/L preview pager right */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          <div className="md:col-span-5 overflow-y-auto p-3 border-r border-white/10 flex flex-col gap-1.5">
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
                  className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSel
                      ? "border-blue-500 bg-blue-500/15"
                      : "border-transparent hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold truncate">
                      {entry.name}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 uppercase">
                      {entry.supported_sizes.map((s) => s[0]).join("/")}
                    </span>
                  </div>
                  <p className={`text-[11px] line-clamp-2 mt-0.5 ${mutedCls}`}>
                    {entry.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="md:col-span-7 p-5 flex flex-col justify-between gap-4 overflow-y-auto">
            {activeEntry && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-blue-400">
                      Grup {activeEntry.group} . {activeEntry.group_label}
                    </span>
                    <h4 className="text-[17px] font-semibold mt-0.5">
                      {activeEntry.name}
                    </h4>
                    <p className={`text-[12px] mt-1 ${mutedCls}`}>
                      {activeEntry.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSampleLightBg((v) => !v)}
                    className="shrink-0 px-2.5 py-1 rounded-lg border border-white/15 text-[11px] cursor-pointer"
                  >
                    Latar: {sampleLightBg ? "Terang" : "Gelap"}
                  </button>
                </div>

                {/* Preview stage with horizontal S/M/L pager + dots */}
                <div
                  className="rounded-2xl p-6 flex flex-col items-center justify-center gap-4 min-h-[240px]"
                  style={{
                    background: sampleLightBg
                      ? "linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 100%)"
                      : "linear-gradient(135deg, #0b1120 0%, #1e293b 100%)",
                  }}
                >
                  <div
                    className="rounded-[24px] p-4 border border-dashed transition-all flex flex-col justify-between"
                    style={{
                      width: activeSize === "small" ? 160 : 280,
                      height: activeSize === "large" ? 210 : 140,
                      borderColor: sampleLightBg
                        ? "rgba(15,23,42,0.28)"
                        : "rgba(255,255,255,0.28)",
                      color: sampleLightBg ? "#0f172a" : "#f8fafc",
                    }}
                  >
                    <div className="text-[11px] font-semibold uppercase opacity-75">
                      {activeEntry.name}
                    </div>
                    <div className="text-[12px] opacity-90">
                      {activeEntry.requires_setup
                        ? "Data contoh ditampilkan hingga sumber dikonfigurasi."
                        : "Tersambung langsung dengan data Gili Anda."}
                    </div>
                    <div className="text-[10.5px] opacity-65">
                      {SIZE_LABEL[activeSize]}
                    </div>
                  </div>

                  {/* Horizontal Pager controls & dots */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={sizes.length <= 1}
                      onClick={() =>
                        setSizeIdx((i) => (i - 1 + sizes.length) % sizes.length)
                      }
                      className="w-7 h-7 rounded-full bg-black/30 text-white flex items-center justify-center disabled:opacity-30 cursor-pointer"
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
                              ? "w-5 bg-blue-500"
                              : "w-2 bg-white/40"
                          }`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={sizes.length <= 1}
                      onClick={() => setSizeIdx((i) => (i + 1) % sizes.length)}
                      className="w-7 h-7 rounded-full bg-black/30 text-white flex items-center justify-center disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
                  <div className={`text-[11px] ${mutedCls}`}>
                    Sumber data: <span className="font-medium">{activeEntry.data_source}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAddWidget(activeEntry, activeSize)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[12.5px] font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={14} /> Tambah Widget
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
