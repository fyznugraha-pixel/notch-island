import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Pipette, Copy, Check } from "lucide-react";
import { Tooltip } from "../../ui/Tooltip";
import {
  hexToHsl,
  hslToHex,
  isValidHex,
  normalizeHex,
  getPerceivedLuminance,
} from "./colorUtils";

interface CustomColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  isLightMode?: boolean;
  isId?: boolean;
}

const CURATED_PALETTES = [
  // Row 1: Deep Dock & Obsidian Tones
  [
    { hex: "#0f172a", nameId: "Biru Malam", nameEn: "Midnight Navy" },
    { hex: "#121216", nameId: "Obsidian", nameEn: "Obsidian" },
    { hex: "#1e1b4b", nameId: "Deep Indigo", nameEn: "Deep Indigo" },
    { hex: "#064e3b", nameId: "Deep Forest", nameEn: "Deep Forest" },
    { hex: "#2e1065", nameId: "Deep Plum", nameEn: "Deep Plum" },
    { hex: "#450a0a", nameId: "Dark Crimson", nameEn: "Dark Crimson" },
    { hex: "#083344", nameId: "Deep Teal", nameEn: "Deep Teal" },
    { hex: "#27272a", nameId: "Zinc Titanium", nameEn: "Zinc Titanium" },
  ],
  // Row 2: Rich & Vibrant Glass Tones
  [
    { hex: "#1d4ed8", nameId: "Biru Safir", nameEn: "Sapphire Blue" },
    { hex: "#7c3aed", nameId: "Ungu Violet", nameEn: "Royal Violet" },
    { hex: "#059669", nameId: "Hijau Zamrud", nameEn: "Emerald Green" },
    { hex: "#e11d48", nameId: "Mawar Crimson", nameEn: "Crimson Rose" },
    { hex: "#d97706", nameId: "Amber Emas", nameEn: "Warm Amber" },
    { hex: "#0f766e", nameId: "Teal Samudra", nameEn: "Ocean Teal" },
    { hex: "#334155", nameId: "Batu Tulis", nameEn: "Slate Glass" },
    { hex: "#000000", nameId: "Hitam OLED", nameEn: "OLED Pitch" },
  ],
];

export const CustomColorPicker: React.FC<CustomColorPickerProps> = ({
  value,
  onChange,
  isLightMode = false,
  isId = true,
}) => {
  const currentHex = useMemo(() => normalizeHex(value || "#0f172a"), [value]);
  const [hsl, setHsl] = useState(() => hexToHsl(currentHex));
  const [hexInput, setHexInput] = useState(currentHex);
  const [copied, setCopied] = useState(false);

  // Sync internal HSL whenever parent value changes externally
  useEffect(() => {
    setHexInput(currentHex);
    setHsl(hexToHsl(currentHex));
  }, [currentHex]);

  const handleHueChange = useCallback(
    (newHue: number) => {
      const nextHsl = { ...hsl, h: newHue };
      setHsl(nextHsl);
      const nextHex = hslToHex(nextHsl.h, nextHsl.s, nextHsl.l);
      setHexInput(nextHex);
      onChange(nextHex);
    },
    [hsl, onChange]
  );

  const handleLightnessChange = useCallback(
    (newL: number) => {
      const nextHsl = { ...hsl, l: newL };
      setHsl(nextHsl);
      const nextHex = hslToHex(nextHsl.h, nextHsl.s, nextHsl.l);
      setHexInput(nextHex);
      onChange(nextHex);
    },
    [hsl, onChange]
  );

  const handleSaturationChange = useCallback(
    (newS: number) => {
      const nextHsl = { ...hsl, s: newS };
      setHsl(nextHsl);
      const nextHex = hslToHex(nextHsl.h, nextHsl.s, nextHsl.l);
      setHexInput(nextHex);
      onChange(nextHex);
    },
    [hsl, onChange]
  );

  const handleHexInputChange = (raw: string) => {
    setHexInput(raw);
    const trimmed = raw.trim();
    if (isValidHex(trimmed)) {
      const normalized = normalizeHex(trimmed);
      setHsl(hexToHsl(normalized));
      onChange(normalized);
    }
  };

  const handleCopyHex = async () => {
    try {
      await navigator.clipboard.writeText(currentHex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  const handleEyeDropper = async () => {
    if (typeof window !== "undefined" && "EyeDropper" in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        if (result && result.sRGBHex) {
          const picked = normalizeHex(result.sRGBHex);
          setHexInput(picked);
          setHsl(hexToHsl(picked));
          onChange(picked);
        }
      } catch {
        // User cancelled picker
      }
    }
  };

  const supportsEyeDropper =
    typeof window !== "undefined" && "EyeDropper" in window;
  const luminance = getPerceivedLuminance(currentHex);
  const isDarkColor = luminance < 0.55;

  // Track gradient for lightness slider based on current hue & saturation
  const lightnessGradient = useMemo(() => {
    const s = hsl.s;
    const h = hsl.h;
    return `linear-gradient(to right, #000000 0%, hsl(${h}, ${s}%, 50%) 50%, #ffffff 100%)`;
  }, [hsl.h, hsl.s]);

  // Track gradient for saturation slider
  const saturationGradient = useMemo(() => {
    const h = hsl.h;
    const l = hsl.l;
    return `linear-gradient(to right, hsl(${h}, 0%, ${l}%), hsl(${h}, 100%, ${l}%))`;
  }, [hsl.h, hsl.l]);

  const borderClass = isLightMode ? "border-black/[0.08]" : "border-white/[0.08]";
  const bgCard = isLightMode ? "bg-black/[0.02]" : "bg-white/[0.02]";
  const textMuted = isLightMode ? "text-neutral-500" : "text-zinc-400";

  return (
    <div className={`flex flex-col gap-3.5 p-3.5 rounded-[16px] border ${borderClass} ${bgCard}`}>
      {/* 1. Header with Swatch, Hex Input, EyeDropper & Copy */}
      <div className="flex items-center gap-3">
        {/* Dynamic Swatch Preview */}
        <div
          style={{ backgroundColor: currentHex }}
          className={`relative w-10 h-10 rounded-[12px] shadow-[0_4px_12px_rgba(0,0,0,0.35)] ring-1 flex items-center justify-center shrink-0 transition-colors ${
            isLightMode ? "ring-black/15" : "ring-white/20"
          }`}
        >
          <span
            className={`text-[9.5px] font-bold uppercase tracking-wider ${
              isDarkColor ? "text-white/80" : "text-black/80"
            }`}
          >
            {isDarkColor ? "Dark" : "Light"}
          </span>
        </div>

        {/* Hex Text Box */}
        <div
          className={`flex-1 flex items-center h-[34px] px-2.5 rounded-[10px] border ${
            isLightMode
              ? "bg-white border-black/10 focus-within:border-black/30"
              : "bg-[#141418] border-white/10 focus-within:border-white/25"
          } transition-colors`}
        >
          <span
            className={`text-[12px] font-mono select-none mr-0.5 ${
              isLightMode ? "text-neutral-500" : "text-zinc-500"
            }`}
          >
            #
          </span>
          <input
            type="text"
            value={hexInput.replace(/^#/, "")}
            onChange={(e) => handleHexInputChange(`#${e.target.value}`)}
            placeholder="0f172a"
            maxLength={6}
            aria-label={isId ? "Kode warna hex" : "Hex color code"}
            className={`w-full bg-transparent text-[12.5px] font-mono outline-none uppercase font-semibold ${
              isLightMode ? "text-black" : "text-white"
            }`}
          />
        </div>

        {/* Copy Hex Button */}
        <Tooltip
          content={isId ? "Salin kode hex" : "Copy hex code"}
          allowFlip
          isLightMode={isLightMode}
          wrapperClassName="shrink-0"
        >
          <button
            type="button"
            onClick={handleCopyHex}
            className={`h-[34px] px-2.5 rounded-[10px] border flex items-center gap-1.5 text-[11.5px] font-medium transition-colors cursor-pointer ${
              copied
                ? isLightMode
                  ? "bg-emerald-500/15 border-emerald-600/35 text-emerald-700"
                  : "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                : isLightMode
                ? "bg-white border-black/10 hover:bg-neutral-100 text-neutral-700"
                : "bg-[#141418] border-white/10 hover:bg-white/[0.06] text-zinc-300 hover:text-white"
            }`}
          >
            {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} />}
            <span>{copied ? (isId ? "Tersalin" : "Copied") : "Hex"}</span>
          </button>
        </Tooltip>

        {/* EyeDropper Button */}
        {supportsEyeDropper && (
          <Tooltip
            content={isId ? "Ambil warna dari layar" : "Sample color from screen"}
            allowFlip
            isLightMode={isLightMode}
            wrapperClassName="shrink-0"
          >
            <button
              type="button"
              aria-label={isId ? "Ambil warna dari layar" : "Sample color from screen"}
              onClick={handleEyeDropper}
              className={`w-[34px] h-[34px] rounded-[10px] border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                isLightMode
                  ? "bg-white border-black/10 hover:bg-neutral-100 text-neutral-700"
                  : "bg-[#141418] border-white/10 hover:bg-white/[0.06] text-zinc-300 hover:text-white"
              }`}
            >
              <Pipette size={14} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* 2. Interactive Sliders (Hue + Lightness) */}
      <div className="flex flex-col gap-2.5 pt-1">
        {/* Hue Slider */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10.5px]">
            <span className={textMuted}>{isId ? "Spektrum Warna" : "Hue Spectrum"}</span>
            <span className={`font-mono ${isLightMode ? "text-neutral-600" : "text-zinc-500"}`}>
              {hsl.h}°
            </span>
          </div>
          <div className="relative h-[14px] rounded-full flex items-center">
            <input
              type="range"
              min={0}
              max={360}
              value={hsl.h}
              aria-label={isId ? "Spektrum Warna" : "Hue Spectrum"}
              onChange={(e) => handleHueChange(Number(e.target.value))}
              style={{
                background:
                  "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
              }}
              className={`w-full h-[10px] rounded-full appearance-none cursor-pointer outline-none ring-1 ${
                isLightMode ? "ring-black/15" : "ring-white/10"
              }`}
            />
          </div>
        </div>

        {/* Lightness Slider */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10.5px]">
            <span className={textMuted}>{isId ? "Kecerahan / Kedalaman" : "Brightness / Depth"}</span>
            <span className={`font-mono ${isLightMode ? "text-neutral-600" : "text-zinc-500"}`}>
              {hsl.l}%
            </span>
          </div>
          <div className="relative h-[14px] rounded-full flex items-center">
            <input
              type="range"
              min={2}
              max={95}
              value={hsl.l}
              aria-label={isId ? "Kecerahan / Kedalaman" : "Brightness / Depth"}
              onChange={(e) => handleLightnessChange(Number(e.target.value))}
              style={{ background: lightnessGradient }}
              className={`w-full h-[10px] rounded-full appearance-none cursor-pointer outline-none ring-1 ${
                isLightMode ? "ring-black/15" : "ring-white/10"
              }`}
            />
          </div>
        </div>

        {/* Saturation Slider */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10.5px]">
            <span className={textMuted}>{isId ? "Kepekatan Warna" : "Color Intensity"}</span>
            <span className={`font-mono ${isLightMode ? "text-neutral-600" : "text-zinc-500"}`}>
              {hsl.s}%
            </span>
          </div>
          <div className="relative h-[14px] rounded-full flex items-center">
            <input
              type="range"
              min={0}
              max={100}
              value={hsl.s}
              aria-label={isId ? "Kepekatan Warna" : "Color Intensity"}
              onChange={(e) => handleSaturationChange(Number(e.target.value))}
              style={{ background: saturationGradient }}
              className={`w-full h-[10px] rounded-full appearance-none cursor-pointer outline-none ring-1 ${
                isLightMode ? "ring-black/15" : "ring-white/10"
              }`}
            />
          </div>
        </div>
      </div>

      {/* 3. Curated Quick Swatch Rows */}
      <div
        className={`flex flex-col gap-1.5 pt-1.5 border-t ${
          isLightMode ? "border-black/[0.07]" : "border-white/[0.06]"
        }`}
      >
        <span className={`text-[10.5px] font-medium ${textMuted}`}>
          {isId ? "Pilihan Palet Dock Elegan" : "Curated Dock Palettes"}
        </span>
        <div className="flex flex-col gap-1.5">
          {CURATED_PALETTES.map((row, rIdx) => (
            <div key={rIdx} className="grid grid-cols-8 gap-1.5">
              {row.map((item) => {
                const isSelected = currentHex.toLowerCase() === item.hex.toLowerCase();
                const label = isId ? item.nameId : item.nameEn;
                const tooltipText = `${label} (${item.hex})`;
                return (
                  <Tooltip
                    key={item.hex}
                    content={tooltipText}
                    allowFlip
                    isLightMode={isLightMode}
                    wrapperClassName="w-full"
                  >
                    <button
                      type="button"
                      aria-label={tooltipText}
                      onClick={() => {
                        const next = normalizeHex(item.hex);
                        setHexInput(next);
                        setHsl(hexToHsl(next));
                        onChange(next);
                      }}
                      style={{ backgroundColor: item.hex }}
                      className={`w-full h-[26px] rounded-[7px] border flex items-center justify-center transition-all cursor-pointer ${
                        isLightMode ? "border-black/15" : "border-white/20"
                      } ${
                        isSelected
                          ? isLightMode
                            ? "scale-105 ring-2 ring-neutral-900 ring-offset-2 ring-offset-[#f5f5f7] shadow-md z-10"
                            : "scale-105 ring-2 ring-white ring-offset-2 ring-offset-[#121216] shadow-md z-10"
                          : "hover:scale-105 opacity-85 hover:opacity-100"
                      }`}
                    >
                      {isSelected && (
                        <Check
                          size={12}
                          strokeWidth={2.8}
                          className={
                            getPerceivedLuminance(item.hex) < 0.5
                              ? "text-white drop-shadow"
                              : "text-black drop-shadow"
                          }
                        />
                      )}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

