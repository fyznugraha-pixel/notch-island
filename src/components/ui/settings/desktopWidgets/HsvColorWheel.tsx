import React, { useCallback, useRef } from "react";
import { RgbaColor, hexToRgba, rgbaToHex } from "../../../../services/desktopWidgetsService";

interface HsvColorWheelProps {
  color: RgbaColor;
  isLightMode: boolean;
  isId?: boolean;
  onChange: (next: RgbaColor) => void;
  onCommit?: (finalColor: RgbaColor) => void;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

export const HsvColorWheel: React.FC<HsvColorWheelProps> = ({
  color,
  isLightMode,
  isId = true,
  onChange,
  onCommit,
}) => {
  const [h, s, v] = rgbToHsv(color.r, color.g, color.b);
  const svRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef<RgbaColor>(color);
  latestRef.current = color;

  const pickSv = useCallback(
    (clientX: number, clientY: number) => {
      const el = svRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ns = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const nv = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
      const [r, g, b] = hsvToRgb(h, ns, nv);
      const next = { r, g, b, a: color.a };
      latestRef.current = next;
      onChange(next);
    },
    [h, color.a, onChange]
  );

  const handleSvPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pickSv(e.clientX, e.clientY);
  };

  const handleSvPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    pickSv(e.clientX, e.clientY);
  };

  const handleSvPointerUp = () => {
    onCommit?.(latestRef.current);
  };

  const [hr, hg, hb] = hsvToRgb(h, 1, 1);
  const hex = rgbaToHex(color);

  return (
    <div className="flex flex-col gap-3">
      {/* 2D Saturation / Value square */}
      <div
        ref={svRef}
        onPointerDown={handleSvPointerDown}
        onPointerMove={handleSvPointerMove}
        onPointerUp={handleSvPointerUp}
        className="relative h-32 w-full rounded-[14px] overflow-hidden cursor-crosshair select-none border border-white/15"
        style={{
          backgroundColor: `rgb(${hr}, ${hg}, ${hb})`,
          backgroundImage:
            "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
        }}
      >
        <div
          className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white shadow-[0_2px_8px_rgba(0,0,0,0.6)] pointer-events-none"
          style={{
            left: `${s * 100}%`,
            top: `${(1 - v) * 100}%`,
            backgroundColor: hex,
          }}
        />
      </div>

      {/* Hue spectrum slider */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span>{isId ? "Rona Warna (Hue)" : "Color Hue"}</span>
          <span className="tabular-nums">{Math.round(h)}°</span>
        </div>
        <input
          type="range"
          min={0}
          max={359}
          value={Math.round(h)}
          onChange={(e) => {
            const [r, g, b] = hsvToRgb(Number(e.target.value), s, v);
            const next = { r, g, b, a: color.a };
            latestRef.current = next;
            onChange(next);
          }}
          onPointerUp={() => onCommit?.(latestRef.current)}
          onKeyUp={() => onCommit?.(latestRef.current)}
          className="w-full h-3 rounded-full appearance-none cursor-pointer"
          style={{
            background:
              "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
          }}
        />
      </div>

      {/* Opacity + Hex input row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[140px] flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>{isId ? "Opasitas" : "Opacity"}</span>
            <span className="tabular-nums">{Math.round(color.a * 100)}%</span>
          </div>
          <input
            type="range"
            min={15}
            max={100}
            value={Math.round(color.a * 100)}
            onChange={(e) => onChange({ ...color, a: Number(e.target.value) / 100 })}
            className="w-full accent-[#0a84ff] cursor-pointer"
          />
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-[9px] border border-white/20 shrink-0 shadow-inner"
            style={{
              backgroundColor: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`,
            }}
          />
          <input
            type="text"
            defaultValue={hex}
            key={hex}
            onBlur={(e) => {
              const parsed = hexToRgba(e.target.value, color.a);
              if (parsed) {
                onChange(parsed);
                onCommit?.(parsed);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const parsed = hexToRgba((e.target as HTMLInputElement).value, color.a);
                if (parsed) {
                  onChange(parsed);
                  onCommit?.(parsed);
                }
              }
            }}
            className={`w-[86px] h-8 px-2.5 rounded-[10px] border text-[12px] font-mono outline-none focus:border-[#0a84ff] ${
              isLightMode
                ? "bg-black/[0.04] border-black/10 text-neutral-900"
                : "bg-[#1a1b22] border-white/10 text-zinc-100"
            }`}
          />
        </div>
      </div>
    </div>
  );
};
