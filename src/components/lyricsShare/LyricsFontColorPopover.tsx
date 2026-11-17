import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Pipette } from "lucide-react";
import {
  hexToHsv,
  hsvToHex,
  normalizeHexColor,
} from "../../services/lyricsShareService";
import { isValidHex, normalizeHex } from "../settingsWindow/navbar/colorUtils";
import { tx, useTaskbarLang } from "../../services/taskbarI18n";

interface LyricsFontColorPopoverProps {
  value: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onChange: (hex: string) => void;
  onClose: () => void;
}

export const LyricsFontColorPopover: React.FC<LyricsFontColorPopoverProps> = ({
  value,
  anchorRef,
  onChange,
  onClose,
}) => {
  const lang = useTaskbarLang();
  const popoverRef = useRef<HTMLDivElement>(null);
  const normalized = normalizeHexColor(value, "#ffffff");

  const [hsv, setHsv] = useState(() => hexToHsv(normalized));
  const [hexDraft, setHexDraft] = useState(normalized);
  const [pos, setPos] = useState<{ bottom: number; right: number } | null>(null);

  useEffect(() => {
    setHexDraft(normalized);
    // Avoid snapping hue to 0° while user drags grayscale/white/black
    setHsv((prev) => {
      const parsed = hexToHsv(normalized);
      return parsed.s === 0 ? { ...parsed, h: prev.h } : parsed;
    });
  }, [normalized]);

  useLayoutEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const bottom = Math.max(12, window.innerHeight - rect.top + 8);
      const right = Math.max(12, Math.min(window.innerWidth - 252, window.innerWidth - rect.right));
      setPos({ bottom, right });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [anchorRef]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        !popoverRef.current?.contains(target) &&
        !anchorRef.current?.contains(target)
      ) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anchorRef, onClose]);

  const commitHsv = (nextH: number, nextS: number, nextV: number) => {
    setHsv({ h: nextH, s: nextS, v: nextV });
    const nextHex = hsvToHex(nextH, nextS, nextV);
    setHexDraft(nextHex);
    onChange(nextHex);
  };

  const updateSvFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const s = Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 100);
    const v = Math.round(
      Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height)) * 100
    );
    commitHsv(hsv.h, s, v);
  };

  const updateHueFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const h = Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 360);
    commitHsv(h === 360 ? 359 : h, hsv.s, hsv.v);
  };

  const handleHexInput = (raw: string) => {
    setHexDraft(raw);
    const candidate = raw.startsWith("#") ? raw : `#${raw}`;
    if (isValidHex(candidate)) {
      const norm = normalizeHex(candidate);
      setHsv(hexToHsv(norm));
      onChange(norm);
    }
  };

  const handleEyeDropper = async () => {
    if (typeof window !== "undefined" && "EyeDropper" in window) {
      try {
        const result = await new (window as any).EyeDropper().open();
        if (result?.sRGBHex) {
          const norm = normalizeHex(result.sRGBHex);
          setHexDraft(norm);
          setHsv(hexToHsv(norm));
          onChange(norm);
        }
      } catch {}
    }
  };

  const supportsEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={tx(lang, "Custom hex font color", "Pemilih warna teks hex")}
      style={
        pos
          ? { bottom: pos.bottom, right: pos.right }
          : { visibility: "hidden", bottom: 0, right: 0 }
      }
      className="fixed z-50 w-[238px] rounded-2xl bg-[#14141b]/98 backdrop-blur-xl border border-white/15 p-3 shadow-[0_18px_46px_rgba(0,0,0,0.72)] flex flex-col gap-2.5 select-none"
    >
      {/* 2D Saturation / Brightness Field */}
      <div
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          updateSvFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) updateSvFromPointer(e);
        }}
        style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
        className="relative w-full h-[126px] rounded-xl overflow-hidden cursor-crosshair border border-white/10 touch-none"
      >
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to right, #ffffff, rgba(255,255,255,0))" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0), #000000)" }}
        />
        <div
          style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, backgroundColor: normalized }}
          className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_5px_rgba(0,0,0,0.75)] pointer-events-none"
        />
      </div>

      {/* Rainbow Hue Bar */}
      <div
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          updateHueFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) updateHueFromPointer(e);
        }}
        style={{
          background:
            "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
        }}
        className="relative w-full h-3 rounded-full cursor-pointer border border-white/15 touch-none"
      >
        <div
          style={{ left: `${(hsv.h / 360) * 100}%` }}
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#14141b] shadow pointer-events-none"
        />
      </div>

      {/* Hex Input + Swatch + EyeDropper + Done */}
      <div className="flex items-center gap-1.5">
        <div
          style={{ backgroundColor: normalized }}
          className="w-7 h-7 rounded-lg border border-white/20 shrink-0"
        />
        <div className="flex-1 min-w-0 h-7 px-2 rounded-lg bg-[#0b0b10] border border-white/12 focus-within:border-[#3882F6]/70 flex items-center">
          <span className="text-[11px] font-mono text-zinc-500 mr-0.5 select-none">#</span>
          <input
            type="text"
            value={hexDraft.replace(/^#/, "")}
            maxLength={6}
            onChange={(e) => handleHexInput(e.target.value)}
            aria-label={tx(lang, "Hex color code", "Kode warna hex")}
            className="w-full min-w-0 bg-transparent text-[11.5px] font-mono font-semibold text-white uppercase outline-none"
          />
        </div>

        {supportsEyeDropper && (
          <button
            type="button"
            onClick={handleEyeDropper}
            title={tx(lang, "Sample from screen", "Ambil warna dari layar")}
            aria-label={tx(lang, "Sample from screen", "Ambil warna dari layar")}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.13] border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
          >
            <Pipette size={13} />
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          title={tx(lang, "Done", "Selesai")}
          aria-label={tx(lang, "Done", "Selesai")}
          className="w-7 h-7 rounded-lg bg-[#3882F6] hover:bg-[#2563eb] text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
        >
          <Check size={13} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
};
