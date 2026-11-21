import React from "react";
import { WidgetCatalogEntry, WidgetSize } from "../../../../services/desktopWidgetsService";
import { WidgetPreviewCard } from "./WidgetPreviewCard";

interface ActiveWidgetThumbProps {
  entry: WidgetCatalogEntry;
  size: WidgetSize;
  isId: boolean;
}

const NATIVE_DIMS: Record<WidgetSize, { w: number; h: number; scale: number }> = {
  small: { w: 160, h: 160, scale: 0.38 },
  medium: { w: 336, h: 160, scale: 0.34 },
  large: { w: 336, h: 336, scale: 0.18 },
};

export const ActiveWidgetThumb: React.FC<ActiveWidgetThumbProps> = ({ entry, size, isId }) => {
  const { w, h, scale } = NATIVE_DIMS[size];
  return (
    <div
      className="relative w-[116px] h-[64px] rounded-[10px] overflow-hidden shrink-0 pointer-events-none select-none"
      style={{ background: "linear-gradient(135deg, #0b1120 0%, #1e293b 55%, #09090b 100%)" }}
    >
      <div
        className="absolute left-1/2 top-1/2 origin-center flex items-center justify-center"
        style={{
          width: w,
          height: h,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <WidgetPreviewCard entry={entry} size={size} lightWallpaper={false} isId={isId} />
      </div>
    </div>
  );
};
