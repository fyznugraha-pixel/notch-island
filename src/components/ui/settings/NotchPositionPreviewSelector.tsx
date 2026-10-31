import React from "react";
import { NotchPosition } from "../../../utils/notchGeometry";
import { t, TranslationKey } from "../../../services/i18n";

interface NotchPositionPreviewSelectorProps {
  value: NotchPosition;
  onChange: (pos: NotchPosition) => void;
  notchShape?: "notch" | "island";
  optEars?: boolean;
  isLightMode?: boolean;
  compact?: boolean;
}

interface PositionMeta {
  id: NotchPosition;
  labelKey: TranslationKey;
  shortLabel: string;
  earNote: { id: string; en: string };
}

const POSITION_ITEMS: PositionMeta[] = [
  {
    id: "top-left",
    labelKey: "settings_pos_top_left",
    shortLabel: "↖",
    earNote: { id: "1 telinga kanan • Buka ke kanan-bawah", en: "1 right ear • Expands bottom-right" },
  },
  {
    id: "top",
    labelKey: "settings_pos_top",
    shortLabel: "↑",
    earNote: { id: "2 telinga bezel atas • Buka ke bawah", en: "2 top bezel ears • Expands down" },
  },
  {
    id: "top-right",
    labelKey: "settings_pos_top_right",
    shortLabel: "↗",
    earNote: { id: "1 telinga kiri • Buka ke kiri-bawah", en: "1 left ear • Expands bottom-left" },
  },
  {
    id: "left",
    labelKey: "settings_pos_left",
    shortLabel: "←",
    earNote: { id: "2 telinga bezel kiri • Buka ke kanan", en: "2 left bezel ears • Expands right" },
  },
  {
    id: "right",
    labelKey: "settings_pos_right",
    shortLabel: "→",
    earNote: { id: "2 telinga bezel kanan • Buka ke kiri", en: "2 right bezel ears • Expands left" },
  },
  {
    id: "bottom-left",
    labelKey: "settings_pos_bottom_left",
    shortLabel: "↙",
    earNote: { id: "1 telinga kanan • Buka ke kanan-atas", en: "1 right ear • Expands top-right" },
  },
  {
    id: "bottom",
    labelKey: "settings_pos_bottom",
    shortLabel: "↓",
    earNote: { id: "2 telinga bezel bawah • Buka ke atas", en: "2 bottom bezel ears • Expands up" },
  },
  {
    id: "bottom-right",
    labelKey: "settings_pos_bottom_right",
    shortLabel: "↘",
    earNote: { id: "1 telinga kiri • Buka ke kiri-atas", en: "1 left ear • Expands top-left" },
  },
];

function renderPreviewNotchSvg(pos: NotchPosition, isIsland: boolean, showEars: boolean): React.ReactNode {
  // Screen coordinate space: 220 x 124
  const fill = "#09090b";
  const stroke = "#3882F6";

  if (isIsland) {
    // Floating pill preview
    const islandCoords: Record<NotchPosition, { x: number; y: number; w: number; h: number; expX: number; expY: number; expW: number; expH: number }> = {
      "top": { x: 82, y: 7, w: 56, h: 14, expX: 55, expY: 7, expW: 110, expH: 54 },
      "top-left": { x: 8, y: 7, w: 54, h: 14, expX: 8, expY: 7, expW: 106, expH: 54 },
      "top-right": { x: 158, y: 7, w: 54, h: 14, expX: 106, expY: 7, expW: 106, expH: 54 },
      "left": { x: 7, y: 39, w: 16, h: 46, expX: 7, expY: 32, expW: 104, expH: 60 },
      "right": { x: 197, y: 39, w: 16, h: 46, expX: 109, expY: 32, expW: 104, expH: 60 },
      "bottom-left": { x: 8, y: 103, w: 54, h: 14, expX: 8, expY: 63, expW: 106, expH: 54 },
      "bottom": { x: 82, y: 103, w: 56, h: 14, expX: 55, expY: 63, expW: 110, expH: 54 },
      "bottom-right": { x: 158, y: 103, w: 54, h: 14, expX: 106, expY: 63, expW: 106, expH: 54 },
    };
    const c = islandCoords[pos];
    return (
      <g>
        <rect
          x={c.expX}
          y={c.expY}
          width={c.expW}
          height={c.expH}
          rx={9}
          fill="rgba(56, 130, 246, 0.08)"
          stroke="rgba(56, 130, 246, 0.45)"
          strokeWidth="1"
          strokeDasharray="3 2.5"
        />
        <rect
          x={c.x}
          y={c.y}
          width={c.w}
          height={c.h}
          rx={7}
          fill={fill}
          stroke={stroke}
          strokeWidth="1.4"
        />
      </g>
    );
  }

  const re = showEars ? 7 : 0;
  const rb = 7;

  switch (pos) {
    case "top": {
      // Center x=110, width=56 (x: 82..138), height=15
      const L = 82;
      const R = 138;
      const H = 15;
      const d = showEars
        ? `M ${L - re},0 A ${re},${re} 0 0,1 ${L},${re} L ${L},${H - rb} A ${rb},${rb} 0 0,0 ${L + rb},${H} L ${R - rb},${H} A ${rb},${rb} 0 0,0 ${R},${H - rb} L ${R},${re} A ${re},${re} 0 0,1 ${R + re},0 Z`
        : `M ${L},0 L ${L},${H - rb} A ${rb},${rb} 0 0,0 ${L + rb},${H} L ${R - rb},${H} A ${rb},${rb} 0 0,0 ${R},${H - rb} L ${R},0 Z`;
      return (
        <g>
          <rect x={55} y={1} width={110} height={54} rx={8} fill="rgba(56,130,246,0.08)" stroke="rgba(56,130,246,0.45)" strokeWidth="1" strokeDasharray="3 2.5" />
          <path d={d} fill={fill} stroke={stroke} strokeWidth="1.4" />
        </g>
      );
    }
    case "top-left": {
      // Flush left x=0..56, height=15, 1 ear on right
      const R = 56;
      const H = 15;
      const d = showEars
        ? `M 0,0 L 0,${H - rb} A ${rb},${rb} 0 0,0 ${rb},${H} L ${R - rb},${H} A ${rb},${rb} 0 0,0 ${R},${H - rb} L ${R},${re} A ${re},${re} 0 0,1 ${R + re},0 Z`
        : `M 0,0 L 0,${H - rb} A ${rb},${rb} 0 0,0 ${rb},${H} L ${R - rb},${H} A ${rb},${rb} 0 0,0 ${R},${H - rb} L ${R},0 Z`;
      return (
        <g>
          <rect x={1} y={1} width={106} height={54} rx={8} fill="rgba(56,130,246,0.08)" stroke="rgba(56,130,246,0.45)" strokeWidth="1" strokeDasharray="3 2.5" />
          <path d={d} fill={fill} stroke={stroke} strokeWidth="1.4" />
        </g>
      );
    }
    case "top-right": {
      // Flush right x=164..220, height=15, 1 ear on left
      const L = 164;
      const W = 220;
      const H = 15;
      const d = showEars
        ? `M ${L - re},0 A ${re},${re} 0 0,1 ${L},${re} L ${L},${H - rb} A ${rb},${rb} 0 0,0 ${L + rb},${H} L ${W - rb},${H} A ${rb},${rb} 0 0,0 ${W},${H - rb} L ${W},0 Z`
        : `M ${L},0 L ${L},${H - rb} A ${rb},${rb} 0 0,0 ${L + rb},${H} L ${W - rb},${H} A ${rb},${rb} 0 0,0 ${W},${H - rb} L ${W},0 Z`;
      return (
        <g>
          <rect x={113} y={1} width={106} height={54} rx={8} fill="rgba(56,130,246,0.08)" stroke="rgba(56,130,246,0.45)" strokeWidth="1" strokeDasharray="3 2.5" />
          <path d={d} fill={fill} stroke={stroke} strokeWidth="1.4" />
        </g>
      );
    }
    case "left": {
      // Flush left bezel x=0, y=38..86 (height=48), width=17, 2 vertical ears (top & bottom)
      const T = 38;
      const B = 86;
      const W = 17;
      const d = showEars
        ? `M 0,${T - re} A ${re},${re} 0 0,0 ${re},${T} L ${W - rb},${T} A ${rb},${rb} 0 0,1 ${W},${T + rb} L ${W},${B - rb} A ${rb},${rb} 0 0,1 ${W - rb},${B} L ${re},${B} A ${re},${re} 0 0,0 0,${B + re} Z`
        : `M 0,${T} L ${W - rb},${T} A ${rb},${rb} 0 0,1 ${W},${T + rb} L ${W},${B - rb} A ${rb},${rb} 0 0,1 ${W - rb},${B} L 0,${B} Z`;
      return (
        <g>
          <rect x={1} y={32} width={104} height={60} rx={8} fill="rgba(56,130,246,0.08)" stroke="rgba(56,130,246,0.45)" strokeWidth="1" strokeDasharray="3 2.5" />
          <path d={d} fill={fill} stroke={stroke} strokeWidth="1.4" />
        </g>
      );
    }
    case "right": {
      // Flush right bezel x=220, y=38..86 (height=48), width=17, 2 vertical ears (top & bottom)
      const T = 38;
      const B = 86;
      const X0 = 220;
      const L = 220 - 17;
      const d = showEars
        ? `M ${X0},${T - re} A ${re},${re} 0 0,1 ${X0 - re},${T} L ${L + rb},${T} A ${rb},${rb} 0 0,0 ${L},${T + rb} L ${L},${B - rb} A ${rb},${rb} 0 0,0 ${L + rb},${B} L ${X0 - re},${B} A ${re},${re} 0 0,1 ${X0},${B + re} Z`
        : `M ${X0},${T} L ${L + rb},${T} A ${rb},${rb} 0 0,0 ${L},${T + rb} L ${L},${B - rb} A ${rb},${rb} 0 0,0 ${L + rb},${B} L ${X0},${B} Z`;
      return (
        <g>
          <rect x={115} y={32} width={104} height={60} rx={8} fill="rgba(56,130,246,0.08)" stroke="rgba(56,130,246,0.45)" strokeWidth="1" strokeDasharray="3 2.5" />
          <path d={d} fill={fill} stroke={stroke} strokeWidth="1.4" />
        </g>
      );
    }
    case "bottom-left": {
      // Flush bottom-left x=0..56, y=109..124, 1 ear on right
      const R = 56;
      const Y0 = 124;
      const T = 124 - 15;
      const d = showEars
        ? `M 0,${Y0} L 0,${T + rb} A ${rb},${rb} 0 0,1 ${rb},${T} L ${R - rb},${T} A ${rb},${rb} 0 0,1 ${R},${T + rb} L ${R},${Y0 - re} A ${re},${re} 0 0,0 ${R + re},${Y0} Z`
        : `M 0,${Y0} L 0,${T + rb} A ${rb},${rb} 0 0,1 ${rb},${T} L ${R - rb},${T} A ${rb},${rb} 0 0,1 ${R},${T + rb} L ${R},${Y0} Z`;
      return (
        <g>
          <rect x={1} y={69} width={106} height={54} rx={8} fill="rgba(56,130,246,0.08)" stroke="rgba(56,130,246,0.45)" strokeWidth="1" strokeDasharray="3 2.5" />
          <path d={d} fill={fill} stroke={stroke} strokeWidth="1.4" />
        </g>
      );
    }
    case "bottom": {
      const L = 82;
      const R = 138;
      const Y0 = 124;
      const T = 124 - 15;
      const d = showEars
        ? `M ${L - re},${Y0} A ${re},${re} 0 0,0 ${L},${Y0 - re} L ${L},${T + rb} A ${rb},${rb} 0 0,1 ${L + rb},${T} L ${R - rb},${T} A ${rb},${rb} 0 0,1 ${R},${T + rb} L ${R},${Y0 - re} A ${re},${re} 0 0,0 ${R + re},${Y0} Z`
        : `M ${L},${Y0} L ${L},${T + rb} A ${rb},${rb} 0 0,1 ${L + rb},${T} L ${R - rb},${T} A ${rb},${rb} 0 0,1 ${R},${T + rb} L ${R},${Y0} Z`;
      return (
        <g>
          <rect x={55} y={69} width={110} height={54} rx={8} fill="rgba(56,130,246,0.08)" stroke="rgba(56,130,246,0.45)" strokeWidth="1" strokeDasharray="3 2.5" />
          <path d={d} fill={fill} stroke={stroke} strokeWidth="1.4" />
        </g>
      );
    }
    case "bottom-right": {
      const L = 164;
      const W = 220;
      const Y0 = 124;
      const T = 124 - 15;
      const d = showEars
        ? `M ${L - re},${Y0} A ${re},${re} 0 0,0 ${L},${Y0 - re} L ${L},${T + rb} A ${rb},${rb} 0 0,1 ${L + rb},${T} L ${W - rb},${T} A ${rb},${rb} 0 0,1 ${W},${T + rb} L ${W},${Y0} Z`
        : `M ${L},${Y0} L ${L},${T + rb} A ${rb},${rb} 0 0,1 ${L + rb},${T} L ${W - rb},${T} A ${rb},${rb} 0 0,1 ${W},${T + rb} L ${W},${Y0} Z`;
      return (
        <g>
          <rect x={113} y={69} width={106} height={54} rx={8} fill="rgba(56,130,246,0.08)" stroke="rgba(56,130,246,0.45)" strokeWidth="1" strokeDasharray="3 2.5" />
          <path d={d} fill={fill} stroke={stroke} strokeWidth="1.4" />
        </g>
      );
    }
  }
}

export const NotchPositionPreviewSelector: React.FC<NotchPositionPreviewSelectorProps> = ({
  value,
  onChange,
  notchShape = "notch",
  optEars = true,
  isLightMode = false,
  compact = false,
}) => {
  const activeMeta = POSITION_ITEMS.find((p) => p.id === value) || POSITION_ITEMS[1];
  const isIndonesian = t("settings_position") === "Posisi Layar";

  // Anchor hotspot coordinates on the 220x124 SVG monitor
  const hotspots: Array<{ id: NotchPosition; cx: number; cy: number }> = [
    { id: "top-left", cx: 22, cy: 10 },
    { id: "top", cx: 110, cy: 10 },
    { id: "top-right", cx: 198, cy: 10 },
    { id: "left", cx: 11, cy: 62 },
    { id: "right", cx: 209, cy: 62 },
    { id: "bottom-left", cx: 22, cy: 114 },
    { id: "bottom", cx: 110, cy: 114 },
    { id: "bottom-right", cx: 198, cy: 114 },
  ];

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {/* Interactive Monitor Preview */}
      <div
        className={`relative w-full rounded-[14px] p-2.5 flex flex-col items-center justify-center border ${
          isLightMode
            ? "bg-black/[0.03] border-black/[0.08]"
            : "bg-[#0c0c10] border-white/[0.07]"
        }`}
      >
        <div className="w-full max-w-[260px] aspect-[220/124] relative rounded-[10px] overflow-hidden border border-white/15 bg-gradient-to-br from-[#161822] via-[#10121a] to-[#0b0c12] shadow-inner">
          <svg
            viewBox="0 0 220 124"
            className="w-full h-full block select-none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Subtle desktop grid */}
            <line x1="110" y1="0" x2="110" y2="124" stroke="rgba(255,255,255,0.04)" strokeDasharray="2 3" />
            <line x1="0" y1="62" x2="220" y2="62" stroke="rgba(255,255,255,0.04)" strokeDasharray="2 3" />

            {/* Active Notch + Expansion Preview */}
            {renderPreviewNotchSvg(value, notchShape === "island", optEars)}

            {/* Clickable 8 Anchor Hotspots */}
            {hotspots.map((spot) => {
              const isSelected = spot.id === value;
              return (
                <g
                  key={spot.id}
                  onClick={() => onChange(spot.id)}
                  className="cursor-pointer group"
                >
                  <circle
                    cx={spot.cx}
                    cy={spot.cy}
                    r={13}
                    fill="transparent"
                  />
                  <circle
                    cx={spot.cx}
                    cy={spot.cy}
                    r={isSelected ? 4.2 : 3.2}
                    fill={isSelected ? "#3882F6" : "rgba(255,255,255,0.28)"}
                    stroke={isSelected ? "#ffffff" : "rgba(0,0,0,0.5)"}
                    strokeWidth={isSelected ? "1.3" : "1"}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Active Position Info Badge */}
        <div className="flex items-center justify-between w-full max-w-[260px] mt-2 px-1">
          <span className={`text-[11px] font-semibold ${isLightMode ? "text-neutral-800" : "text-white/90"}`}>
            {t(activeMeta.labelKey)}
          </span>
          <span className="text-[10px] text-[#3882F6] font-medium">
            {isIndonesian ? activeMeta.earNote.id : activeMeta.earNote.en}
          </span>
        </div>
      </div>

      {/* 8-Position Button Grid (3x3 layout matching screen edges/corners) */}
      <div className="grid grid-cols-3 gap-1.5 w-full">
        {(
          [
            POSITION_ITEMS[0], // top-left
            POSITION_ITEMS[1], // top
            POSITION_ITEMS[2], // top-right
            POSITION_ITEMS[3], // left
            null,              // center screen indicator
            POSITION_ITEMS[4], // right
            POSITION_ITEMS[5], // bottom-left
            POSITION_ITEMS[6], // bottom
            POSITION_ITEMS[7], // bottom-right
          ] as Array<PositionMeta | null>
        ).map((item) => {
          if (!item) {
            return (
              <div
                key="screen-center"
                className={`flex items-center justify-center rounded-[9px] text-[10px] font-medium select-none border border-dashed ${
                  isLightMode
                    ? "border-black/10 text-neutral-400 bg-black/[0.015]"
                    : "border-white/[0.06] text-white/25 bg-white/[0.01]"
                } ${compact ? "py-1" : "py-1.5"}`}
              >
                Layar
              </div>
            );
          }

          const isSelected = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`flex items-center justify-center gap-1.5 rounded-[9px] px-2 ${
                compact ? "py-1.5 text-[10.5px]" : "py-1.5 text-[11px]"
              } font-medium transition-all cursor-pointer truncate ${
                isSelected
                  ? "bg-[#3882F6] text-white shadow-[0_2px_10px_rgba(56,130,246,0.35)]"
                  : isLightMode
                  ? "bg-black/[0.04] hover:bg-black/[0.08] text-neutral-700 border border-black/[0.06]"
                  : "bg-[#17171d] hover:bg-[#1f1f27] text-white/75 border border-white/[0.05]"
              }`}
              title={t(item.labelKey)}
            >
              <span className="opacity-75 text-[10px] leading-none">{item.shortLabel}</span>
              <span className="truncate">{t(item.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
