import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Pipette,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Sun,
  Moon,
  Battery,
} from "lucide-react";
import {
  hexToHsl,
  hslToHex,
  isValidHex,
  normalizeHex,
  getPerceivedLuminance,
} from "../../../utils/colorUtils";

interface CustomColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  isLightMode?: boolean;
  isId?: boolean;
  mode?: "surface" | "text";
  previewBgColor?: string;
  previewTextColor?: string;
}

type PaletteCategory = "dark" | "vibrant" | "pastel" | "hardware";

interface SwatchItem {
  hex: string;
  nameId: string;
  nameEn: string;
}

const SURFACE_TEMPLATE_CATEGORIES: {
  id: PaletteCategory;
  labelId: string;
  labelEn: string;
  icon: string;
  swatches: SwatchItem[];
}[] = [
  {
    id: "dark",
    labelId: "Obsidian & Malam",
    labelEn: "Obsidian & Dark",
    icon: "🌌",
    swatches: [
      { hex: "#000000", nameId: "Hitam OLED Murni", nameEn: "Pitch Black OLED" },
      { hex: "#0f172a", nameId: "Biru Malam (Midnight)", nameEn: "Midnight Navy" },
      { hex: "#121216", nameId: "Obsidian Pekat", nameEn: "Deep Obsidian" },
      { hex: "#1e1b4b", nameId: "Deep Indigo", nameEn: "Deep Indigo" },
      { hex: "#064e3b", nameId: "Hutan Pinus Gelap", nameEn: "Deep Forest" },
      { hex: "#2e1065", nameId: "Plum Mistis", nameEn: "Mystic Plum" },
      { hex: "#450a0a", nameId: "Crimson Gelap", nameEn: "Dark Crimson" },
      { hex: "#083344", nameId: "Teal Kedalaman Laut", nameEn: "Deep Teal" },
    ],
  },
  {
    id: "vibrant",
    labelId: "Permata & Kaca",
    labelEn: "Vibrant & Glass",
    icon: "💎",
    swatches: [
      { hex: "#1d4ed8", nameId: "Biru Safir", nameEn: "Sapphire Blue" },
      { hex: "#7c3aed", nameId: "Ungu Royal Violet", nameEn: "Royal Violet" },
      { hex: "#059669", nameId: "Hijau Zamrud", nameEn: "Emerald Green" },
      { hex: "#e11d48", nameId: "Mawar Crimson", nameEn: "Crimson Rose" },
      { hex: "#d97706", nameId: "Amber Emas", nameEn: "Warm Amber" },
      { hex: "#ea580c", nameId: "Sunset Oranye", nameEn: "Sunset Orange" },
      { hex: "#0f766e", nameId: "Teal Samudra", nameEn: "Ocean Teal" },
      { hex: "#0891b2", nameId: "Biru Laguna", nameEn: "Lagoon Cyan" },
    ],
  },
  {
    id: "pastel",
    labelId: "Pastel & Lembut",
    labelEn: "Soft & Pastel",
    icon: "☁️",
    swatches: [
      { hex: "#f8fafc", nameId: "Putih Salju", nameEn: "Snow White" },
      { hex: "#e2e8f0", nameId: "Perak Platinum", nameEn: "Platinum Silver" },
      { hex: "#bae6fd", nameId: "Langit Biru Lembut", nameEn: "Soft Sky Blue" },
      { hex: "#a7f3d0", nameId: "Mint Segar", nameEn: "Fresh Mint" },
      { hex: "#fde68a", nameId: "Mentari Lembut", nameEn: "Soft Sunlight" },
      { hex: "#fbcfe8", nameId: "Merah Jambu (Blush)", nameEn: "Blush Pink" },
      { hex: "#ddd6fe", nameId: "Lavender Pucat", nameEn: "Pale Lavender" },
      { hex: "#fed7aa", nameId: "Persik Hangat", nameEn: "Warm Peach" },
    ],
  },
  {
    id: "hardware",
    labelId: "Gaya Titanium",
    labelEn: "Hardware Tones",
    icon: "🍎",
    swatches: [
      { hex: "#242426", nameId: "Space Gray", nameEn: "Space Gray" },
      { hex: "#1e3a5f", nameId: "Pacific Blue", nameEn: "Pacific Blue" },
      { hex: "#273a2d", nameId: "Alpine Green", nameEn: "Alpine Green" },
      { hex: "#4b6b94", nameId: "Sierra Blue", nameEn: "Sierra Blue" },
      { hex: "#161925", nameId: "Midnight Blue", nameEn: "Midnight Blue" },
      { hex: "#d4cdc3", nameId: "Starlight Gold", nameEn: "Starlight Gold" },
      { hex: "#362a4a", nameId: "Deep Purple", nameEn: "Deep Purple" },
      { hex: "#443c33", nameId: "Titanium Desert", nameEn: "Desert Titanium" },
    ],
  },
];

const TEXT_TEMPLATE_CATEGORIES: {
  id: PaletteCategory;
  labelId: string;
  labelEn: string;
  icon: string;
  swatches: SwatchItem[];
}[] = [
  {
    id: "dark",
    labelId: "Klasik & Jelas",
    labelEn: "Classic & Crisp",
    icon: "⚪",
    swatches: [
      { hex: "#ffffff", nameId: "Putih Murni", nameEn: "Pure White" },
      { hex: "#f8fafc", nameId: "Putih Salju", nameEn: "Snow White" },
      { hex: "#e2e8f0", nameId: "Perak Platinum", nameEn: "Platinum Silver" },
      { hex: "#cbd5e1", nameId: "Abu-abu Terang", nameEn: "Light Slate" },
      { hex: "#fef08a", nameId: "Emas Champagne", nameEn: "Champagne Gold" },
      { hex: "#fef3c7", nameId: "Krem Hangat", nameEn: "Warm Cream" },
      { hex: "#111114", nameId: "Hitam Pekat", nameEn: "Pitch Black" },
      { hex: "#334155", nameId: "Arang Gelap", nameEn: "Dark Charcoal" },
    ],
  },
  {
    id: "vibrant",
    labelId: "Neon & Cyber",
    labelEn: "Neon & Cyber",
    icon: "⚡",
    swatches: [
      { hex: "#38bdf8", nameId: "Cyan Listrik", nameEn: "Electric Cyan" },
      { hex: "#4ade80", nameId: "Hijau Neon", nameEn: "Neon Green" },
      { hex: "#facc15", nameId: "Kuning Lemon", nameEn: "Lemon Yellow" },
      { hex: "#fb7185", nameId: "Mawar Terang", nameEn: "Bright Rose" },
      { hex: "#c084fc", nameId: "Ungu Neon", nameEn: "Neon Violet" },
      { hex: "#fb923c", nameId: "Oranye Senja", nameEn: "Sunset Orange" },
      { hex: "#22d3ee", nameId: "Biru Laser", nameEn: "Laser Blue" },
      { hex: "#a3e635", nameId: "Lime Terang", nameEn: "Bright Lime" },
    ],
  },
  {
    id: "pastel",
    labelId: "Pastel Lembut",
    labelEn: "Soft Pastel",
    icon: "🌸",
    swatches: [
      { hex: "#bae6fd", nameId: "Langit Biru Bayi", nameEn: "Baby Blue" },
      { hex: "#bbf7d0", nameId: "Mint Lembut", nameEn: "Soft Mint" },
      { hex: "#fed7aa", nameId: "Persik Halus", nameEn: "Peach Glow" },
      { hex: "#fbcfe8", nameId: "Merah Jambu Lembut", nameEn: "Soft Blush" },
      { hex: "#e9d5ff", nameId: "Lavender Pucat", nameEn: "Pale Lavender" },
      { hex: "#cffafe", nameId: "Es Cyan", nameEn: "Ice Cyan" },
      { hex: "#ddd6fe", nameId: "Lilac Lembut", nameEn: "Soft Lilac" },
      { hex: "#fef9c3", nameId: "Mentari Pagi", nameEn: "Morning Sun" },
    ],
  },
  {
    id: "hardware",
    labelId: "Kemewahan & Emas",
    labelEn: "Luxury & Gold",
    icon: "💎",
    swatches: [
      { hex: "#fde047", nameId: "Kuning Emas 24K", nameEn: "24K Gold" },
      { hex: "#34d399", nameId: "Zamrud Terang", nameEn: "Emerald Glow" },
      { hex: "#60a5fa", nameId: "Safir Cerah", nameEn: "Vibrant Sapphire" },
      { hex: "#fda4af", nameId: "Mawar Emas (Rose Gold)", nameEn: "Rose Gold" },
      { hex: "#fcd34d", nameId: "Amber Madu", nameEn: "Honey Amber" },
      { hex: "#2dd4bf", nameId: "Teal Kristal", nameEn: "Crystal Teal" },
      { hex: "#a78bfa", nameId: "Violet Kerajaan", nameEn: "Royal Violet" },
      { hex: "#e0e7ff", nameId: "Indigo Mistis", nameEn: "Indigo Mist" },
    ],
  },
];

export const CustomColorPicker: React.FC<CustomColorPickerProps> = ({
  value,
  onChange,
  isLightMode = false,
  isId = true,
  mode = "surface",
  previewBgColor,
  previewTextColor,
}) => {
  const defaultFallback = mode === "text" ? "#ffffff" : "#0f172a";
  const currentHex = useMemo(() => normalizeHex(value || defaultFallback), [value, defaultFallback]);
  const [hsl, setHsl] = useState(() => hexToHsl(currentHex));
  const [hexInput, setHexInput] = useState(currentHex);
  const [copied, setCopied] = useState(false);
  const [activeCategory, setActiveCategory] = useState<PaletteCategory>("dark");

  const categories = mode === "text" ? TEXT_TEMPLATE_CATEGORIES : SURFACE_TEMPLATE_CATEGORIES;

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
  const isLightContrast = luminance >= 0.55;

  const lightnessGradient = useMemo(() => {
    const s = hsl.s;
    const h = hsl.h;
    return `linear-gradient(to right, #000000 0%, hsl(${h}, ${s}%, 50%) 50%, #ffffff 100%)`;
  }, [hsl.h, hsl.s]);

  const saturationGradient = useMemo(() => {
    const h = hsl.h;
    const l = hsl.l;
    return `linear-gradient(to right, hsl(${h}, 0%, ${l}%), hsl(${h}, 100%, ${l}%))`;
  }, [hsl.h, hsl.l]);

  const borderClass = isLightMode ? "border-black/[0.08]" : "border-white/[0.08]";
  const bgCard = isLightMode ? "bg-black/[0.02]" : "bg-white/[0.02]";
  const textMuted = isLightMode ? "text-neutral-500" : "text-zinc-400";
  const activeCategoryData =
    categories.find((c) => c.id === activeCategory) ||
    categories[0];

  // Colors for miniature mock preview
  const mockPillBg = mode === "text" ? (previewBgColor || "#0f172a") : currentHex;
  const mockTextColor = mode === "text" ? currentHex : (previewTextColor || (isLightContrast ? "#111114" : "#ffffff"));
  const mockDateColor = mode === "text" ? currentHex : (previewTextColor || (isLightContrast ? "#3f3f46" : "#d4d4d8"));

  return (
    <div
      className={`flex flex-col gap-3.5 p-3.5 rounded-[16px] border ${borderClass} ${bgCard}`}
    >
      {/* 1. Live Miniature Notch Preview */}
      <div className="relative overflow-hidden rounded-[12px] bg-gradient-to-b from-[#18181f] to-[#0c0c10] border border-white/[0.08] p-3 flex flex-col items-center justify-center gap-2">
        <div className="flex items-center justify-between w-full text-[10px] text-zinc-400 px-0.5">
          <span className="flex items-center gap-1 font-medium">
            <Sparkles size={11} className="text-amber-400" />
            {mode === "text"
              ? isId ? "Pratinjau Teks & Angka Idle" : "Live Idle Text & Numbers Preview"
              : isId ? "Pratinjau Langsung Notch Idle" : "Live Idle Notch Preview"}
          </span>
          <span className="flex items-center gap-1 font-mono text-[9.5px] bg-white/[0.06] px-1.5 py-0.5 rounded-full text-zinc-300">
            {mode === "text" ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: currentHex }} />
                {isId ? "Warna Kustom Aktif" : "Custom Color Active"}
              </>
            ) : isLightContrast ? (
              <>
                <Sun size={10} className="text-amber-400" />
                {isId ? "Teks Gelap Otomatis" : "Auto Dark Text"}
              </>
            ) : (
              <>
                <Moon size={10} className="text-cyan-400" />
                {isId ? "Teks Terang Otomatis" : "Auto Light Text"}
              </>
            )}
          </span>
        </div>

        {/* The Miniature Mock Notch Pill */}
        <div
          style={{
            backgroundColor: mockPillBg,
            boxShadow: `0 8px 24px ${mockPillBg}44, 0 2px 6px rgba(0,0,0,0.4)`,
          }}
          className="relative h-[28px] px-3.5 rounded-full flex items-center justify-between gap-3 border border-white/15 transition-all duration-300 select-none"
        >
          {/* Battery Mock */}
          <div
            style={{ color: mockTextColor }}
            className="flex items-center gap-1 text-[9.5px] font-bold"
          >
            <Battery size={11} className="shrink-0" />
            <span>98%</span>
          </div>

          {/* Time Mock */}
          <span
            style={{ color: mockTextColor }}
            className="text-[10px] font-bold tracking-tight font-mono"
          >
            09:41
          </span>

          {/* Date Mock */}
          <span
            style={{ color: mockDateColor }}
            className="text-[9.5px] font-semibold"
          >
            {isId ? "Sen, 2 Nov" : "Mon, Nov 2"}
          </span>
        </div>
      </div>

      {/* 2. Color Field + Copy + Eyedropper + Reset Row */}
      <div className="flex items-center gap-2">
        {/* Color Swatch */}
        <div
          style={{
            backgroundColor: currentHex,
            boxShadow: `0 4px 12px ${currentHex}44`,
          }}
          className="w-10 h-10 rounded-[10px] border border-white/20 shrink-0 flex items-center justify-center transition-colors"
        >
          <span
            className={`text-[11px] font-mono font-bold ${
              isLightContrast ? "text-black" : "text-white"
            }`}
          >
            Aa
          </span>
        </div>

        {/* Hex Input */}
        <div className="flex items-center flex-1 min-w-0 bg-black/40 border border-white/10 rounded-[10px] px-2.5 py-2 focus-within:border-blue-500/80 transition-colors">
          <span className="text-zinc-500 font-mono text-[12px] select-none mr-1">
            #
          </span>
          <input
            type="text"
            value={hexInput.replace(/^#/, "")}
            onChange={(e) => handleHexInputChange(`#${e.target.value}`)}
            maxLength={6}
            placeholder={mode === "text" ? "ffffff" : "0f172a"}
            className="w-full bg-transparent text-[12.5px] font-mono font-semibold text-white outline-none uppercase"
          />
          <button
            type="button"
            title={copied ? "Tersalin!" : isId ? "Salin Kode HEX" : "Copy HEX code"}
            onClick={handleCopyHex}
            className="text-zinc-400 hover:text-white p-1 rounded transition-colors shrink-0"
          >
            {copied ? (
              <Check size={14} className="text-emerald-400" />
            ) : (
              <Copy size={14} />
            )}
          </button>
        </div>

        {/* Eyedropper */}
        {supportsEyeDropper && (
          <button
            type="button"
            title={isId ? "Ambil warna dari layar (Eyedropper)" : "Sample color from screen"}
            onClick={handleEyeDropper}
            className={`w-10 h-10 rounded-[10px] border flex items-center justify-center transition-all ${
              isLightMode
                ? "bg-white/80 hover:bg-white text-neutral-700 border-black/10"
                : "bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border-white/10"
            }`}
          >
            <Pipette size={15} />
          </button>
        )}

        {/* Reset to Default */}
        <button
          type="button"
          title={isId ? `Kembalikan ke warna default (${defaultFallback})` : `Reset to default (${defaultFallback})`}
          onClick={() => {
            setHexInput(defaultFallback);
            setHsl(hexToHsl(defaultFallback));
            onChange(defaultFallback);
          }}
          className={`w-10 h-10 rounded-[10px] border flex items-center justify-center transition-all ${
            isLightMode
              ? "bg-white/80 hover:bg-white text-neutral-700 border-black/10"
              : "bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border-white/10"
          }`}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* 3. Interactive HSL Sliders */}
      <div className="flex flex-col gap-2.5 pt-1">
        {/* Hue Slider */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10.5px]">
            <span className={textMuted}>{isId ? "Spektrum Warna (Hue)" : "Hue Spectrum"}</span>
            <span className="font-mono text-zinc-400">{hsl.h}°</span>
          </div>
          <div className="relative h-[14px] rounded-full flex items-center">
            <input
              type="range"
              min={0}
              max={360}
              value={hsl.h}
              onChange={(e) => handleHueChange(Number(e.target.value))}
              style={{
                background:
                  "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
              }}
              className="w-full h-[10px] rounded-full appearance-none cursor-pointer outline-none ring-1 ring-white/10"
            />
          </div>
        </div>

        {/* Lightness Slider */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10.5px]">
            <span className={textMuted}>{isId ? "Kecerahan / Kedalaman (Lightness)" : "Brightness / Lightness"}</span>
            <span className="font-mono text-zinc-400">{hsl.l}%</span>
          </div>
          <div className="relative h-[14px] rounded-full flex items-center">
            <input
              type="range"
              min={2}
              max={95}
              value={hsl.l}
              onChange={(e) => handleLightnessChange(Number(e.target.value))}
              style={{ background: lightnessGradient }}
              className="w-full h-[10px] rounded-full appearance-none cursor-pointer outline-none ring-1 ring-white/10"
            />
          </div>
        </div>

        {/* Saturation Slider */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10.5px]">
            <span className={textMuted}>{isId ? "Kepekatan Warna (Saturation)" : "Color Saturation"}</span>
            <span className="font-mono text-zinc-400">{hsl.s}%</span>
          </div>
          <div className="relative h-[14px] rounded-full flex items-center">
            <input
              type="range"
              min={0}
              max={100}
              value={hsl.s}
              onChange={(e) => handleSaturationChange(Number(e.target.value))}
              style={{ background: saturationGradient }}
              className="w-full h-[10px] rounded-full appearance-none cursor-pointer outline-none ring-1 ring-white/10"
            />
          </div>
        </div>
      </div>

      {/* 4. Categorized Color Templates / Presets */}
      <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.08]">
        <div className="flex items-center justify-between">
          <span className={`text-[11px] font-semibold text-white flex items-center gap-1.5`}>
            <span>🎨</span>
            {isId ? "Pilihan Warna Template" : "Color Templates"}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">
            32 {isId ? "Pilihan" : "Options"}
          </span>
        </div>

        {/* Category Pills */}
        <div className="grid grid-cols-4 gap-1 p-0.5 rounded-[10px] bg-black/40 border border-white/10">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`py-1 px-1.5 rounded-[7px] text-[10px] font-medium flex items-center justify-center gap-1 transition-all ${
                  isActive
                    ? "bg-white/15 text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <span>{cat.icon}</span>
                <span className="truncate">
                  {isId ? cat.labelId.split(" ")[0] : cat.labelEn.split(" ")[0]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Swatch Grid for Active Category */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-1">
          {activeCategoryData.swatches.map((item) => {
            const isSelected =
              currentHex.toLowerCase() === item.hex.toLowerCase();
            const title = isId ? item.nameId : item.nameEn;
            const itemLuminance = getPerceivedLuminance(item.hex);
            return (
              <button
                key={item.hex}
                type="button"
                title={`${title} (${item.hex})`}
                onClick={() => {
                  const next = normalizeHex(item.hex);
                  setHexInput(next);
                  setHsl(hexToHsl(next));
                  onChange(next);
                }}
                style={{ backgroundColor: item.hex }}
                className={`group relative h-[32px] rounded-[9px] border border-white/20 flex flex-col items-center justify-center transition-all cursor-pointer ${
                  isSelected
                    ? "scale-105 ring-2 ring-blue-400 ring-offset-2 ring-offset-[#121216] shadow-lg z-10"
                    : "hover:scale-105 opacity-90 hover:opacity-100 shadow-sm"
                }`}
              >
                {isSelected ? (
                  <Check
                    size={14}
                    strokeWidth={3}
                    className={
                      itemLuminance < 0.5
                        ? "text-white drop-shadow"
                        : "text-black drop-shadow"
                    }
                  />
                ) : (
                  <span
                    className={`text-[8.5px] font-bold font-mono opacity-0 group-hover:opacity-100 transition-opacity ${
                      itemLuminance < 0.5 ? "text-white/80" : "text-black/80"
                    }`}
                  >
                    Aa
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
