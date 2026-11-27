import React from "react";
import { Plus } from "lucide-react";
import { WidgetCatalogEntry, WidgetSize } from "../../../../services/desktopWidgetsService";
import { WidgetPreviewCard } from "./WidgetPreviewCard";

interface WidgetGalleryTileProps {
  entry: WidgetCatalogEntry;
  selectedSize: WidgetSize;
  sampleLightBg: boolean;
  isLightMode: boolean;
  isId: boolean;
  installed: boolean;
  onSelectSize: (size: WidgetSize) => void;
  onAdd: () => void;
}

const DIM_LABEL: Record<WidgetSize, string> = {
  small: "160 x 160 dp",
  medium: "336 x 160 dp",
  large: "336 x 336 dp",
};

const STICKY_DIM_LABEL: Record<WidgetSize, string> = {
  small: "160 x 160 dp",
  medium: "240 x 240 dp",
  large: "336 x 336 dp",
};

export const WidgetGalleryTile: React.FC<WidgetGalleryTileProps> = ({
  entry,
  selectedSize,
  sampleLightBg,
  isLightMode,
  isId,
  installed,
  onSelectSize,
  onAdd,
}) => {
  const tr = (idText: string, enText: string) => (isId ? idText : enText);
  const mutedCls = isLightMode ? "text-neutral-600" : "text-zinc-400";
  const tileCls = isLightMode
    ? "bg-white border-black/[0.08] hover:border-black/[0.18]"
    : "bg-[#171921] border-white/[0.08] hover:border-white/[0.18]";

  const isPaperSticky = entry.widget_type === "paper_sticky_note";
  const previewScaleClass = isPaperSticky
    ? selectedSize === "small"
      ? "scale-[0.70]"
      : selectedSize === "medium"
      ? "scale-[0.68]"
      : "scale-[0.62]"
    : selectedSize === "small"
    ? "scale-[0.86]"
    : selectedSize === "medium"
    ? "scale-[0.78] min-[780px]:scale-[0.86]"
    : "scale-[0.62]";
  const dimLabel = isPaperSticky ? STICKY_DIM_LABEL[selectedSize] : DIM_LABEL[selectedSize];

  return (
    <div className={`rounded-[18px] border overflow-hidden flex flex-col transition-colors ${tileCls}`}>
      <div
        className="h-[176px] w-full overflow-hidden flex items-center justify-center relative shrink-0"
        style={{
          background: sampleLightBg
            ? "linear-gradient(135deg, #e0f2fe 0%, #e2e8f0 50%, #f8fafc 100%)"
            : "linear-gradient(135deg, #0b1120 0%, #1e293b 55%, #09090b 100%)",
        }}
      >
        <div
          className={`pointer-events-none select-none flex items-center justify-center origin-center transition-transform duration-150 ${previewScaleClass}`}
        >
          <WidgetPreviewCard
            entry={entry}
            size={selectedSize}
            lightWallpaper={sampleLightBg}
            isId={isId}
          />
        </div>
      </div>

      <div className="p-3.5 flex flex-col gap-2.5 flex-1 justify-between">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[13.5px] font-semibold truncate">{entry.name}</h4>
            {installed && (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#34c759]/14 text-[#34c759]">
                {tr("Terpasang", "Installed")}
              </span>
            )}
          </div>
          <p className={`text-[11.5px] line-clamp-2 mt-1 ${mutedCls}`}>{entry.description}</p>
          <div className={`text-[10.5px] mt-1.5 truncate ${mutedCls}`}>
            {entry.group_label} . {dimLabel}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div
            role="group"
            aria-label={tr("Pilih ukuran pratinjau", "Select preview size")}
            className={`inline-flex items-center p-0.5 rounded-[10px] gap-0.5 ${
              isLightMode ? "bg-black/[0.06]" : "bg-white/[0.06]"
            }`}
          >
            {entry.supported_sizes.map((sz) => {
              const active = sz === selectedSize;
              const shortLabel = sz === "small" ? "S" : sz === "medium" ? "M" : "L";
              return (
                <button
                  key={sz}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectSize(sz)}
                  className={`h-7 min-w-[28px] px-2 rounded-[8px] text-[11px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] ${
                    active
                      ? "bg-[#0a84ff] text-white"
                      : isLightMode
                      ? "text-neutral-700 hover:bg-black/[0.06]"
                      : "text-zinc-300 hover:bg-white/[0.08]"
                  }`}
                >
                  {shortLabel}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onAdd}
            className="h-8 px-3.5 rounded-[10px] bg-[#0a84ff] hover:bg-[#0071e3] text-white text-[12px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] focus-visible:ring-offset-1"
          >
            <Plus size={13} aria-hidden="true" /> {tr("Tambah", "Add")}
          </button>
        </div>
      </div>
    </div>
  );
};
