import React, { useEffect, useRef, useState } from "react";
import { Palette, Plus, RotateCcw, Shuffle, Type } from "lucide-react";
import { IosSegmentedControl } from "../../../ios/IosSegmentedControl";
import { IosSwitch } from "../../../ios/IosSwitch";
import { HsvColorWheel } from "./HsvColorWheel";

export const STICKY_NOTE_PRESET_COLORS: { hex: string; nameId: string; nameEn: string }[] = [
  { hex: "#FFF07C", nameId: "Kuning Klasik", nameEn: "Classic Yellow" },
  { hex: "#A7F3D0", nameId: "Mint Segar", nameEn: "Fresh Mint" },
  { hex: "#FED7AA", nameId: "Persik Hangat", nameEn: "Warm Peach" },
  { hex: "#BAE6FD", nameId: "Biru Langit", nameEn: "Sky Blue" },
  { hex: "#DDD6FE", nameId: "Lavender", nameEn: "Lavender" },
  { hex: "#FBCFE8", nameId: "Merah Muda", nameEn: "Soft Rose" },
  { hex: "#FEF3C7", nameId: "Krem Kertas", nameEn: "Warm Cream" },
  { hex: "#27272A", nameId: "Charcoal Gelap", nameEn: "Dark Charcoal" },
];

export type StickyNoteStyle = "curled" | "tape" | "pin";

export interface StickyNoteEditorPanelProps {
  settings: Record<string, unknown>;
  slotId: string;
  isLightMode: boolean;
  isId: boolean;
  onPatchSettings: (patch: Record<string, unknown>) => void;
  onAddAnotherStickyNote?: () => void;
}

function parseHexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, "0").toUpperCase())
      .join("")
  );
}

function hexLuminance(hex: string): number {
  const rgb = parseHexToRgb(hex);
  if (!rgb) return 0.8;
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

function shadeHex(hex: string, delta: number): string {
  const rgb = parseHexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb.r + delta, rgb.g + delta, rgb.b + delta);
}

export const StickyNoteEditorPanel: React.FC<StickyNoteEditorPanelProps> = ({
  settings,
  slotId,
  isLightMode,
  isId,
  onPatchSettings,
  onAddAnotherStickyNote,
}) => {
  const tr = (idText: string, enText: string) => (isId ? idText : enText);

  const paperColor =
    typeof settings.paper_color === "string" && parseHexToRgb(settings.paper_color)
      ? settings.paper_color.toUpperCase()
      : "#FFF07C";
  const noteStyle: StickyNoteStyle =
    settings.note_style === "curled" || settings.note_style === "pin"
      ? settings.note_style
      : "tape";
  const tiltDeg =
    typeof settings.tilt_deg === "number" && Number.isFinite(settings.tilt_deg)
      ? Math.max(-8, Math.min(8, settings.tilt_deg))
      : -2.5;
  const curlLeft = tiltDeg < 0;
  const showLines =
    typeof settings.show_lines === "boolean" ? settings.show_lines : true;
  const title = typeof settings.title === "string" ? settings.title : "";
  const text = typeof settings.text === "string" ? settings.text : "";

  const [hexDraft, setHexDraft] = useState(paperColor);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHexDraft(paperColor);
  }, [paperColor, slotId]);

  const lum = hexLuminance(paperColor);
  const inkColor = lum > 0.36 ? "#1C1914" : "#F8FAFC";
  const mutedInk = lum > 0.36 ? "rgba(42,36,26,0.58)" : "rgba(203,213,225,0.68)";
  const parsedRgb = parseHexToRgb(paperColor) ?? { r: 255, g: 240, b: 124 };

  const cardCls = `rounded-[16px] p-4 border flex flex-col gap-4 ${
    isLightMode
      ? "bg-white border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
      : "bg-[#121318] border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]"
  }`;
  const inputCls = `w-full rounded-[10px] border px-3 py-2 text-[12.5px] outline-none transition-colors focus:border-[#0a84ff] ${
    isLightMode
      ? "bg-neutral-50 border-black/10 text-neutral-900 placeholder:text-neutral-400"
      : "bg-white/[0.04] border-white/10 text-zinc-100 placeholder:text-zinc-500"
  }`;

  const commitHex = (nextHex: string) => {
    const clean = nextHex.trim().startsWith("#") ? nextHex.trim() : `#${nextHex.trim()}`;
    if (parseHexToRgb(clean)) {
      const upper = clean.toUpperCase();
      setHexDraft(upper);
      onPatchSettings({ paper_color: upper });
    }
  };

  return (
    <div className={cardCls}>
      {onAddAnotherStickyNote && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] opacity-65">
            {tr(
              "Klik tombol + di sudut kanan atas kertas di desktop untuk langsung menambah note baru.",
              "Click the + button on the top-right corner of any note on desktop to add another note."
            )}
          </span>
          <button
            type="button"
            onClick={onAddAnotherStickyNote}
            className="h-7 px-3 rounded-[9px] bg-[#0a84ff] hover:bg-[#0071e3] text-white text-[11.5px] font-semibold flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
          >
            <Plus size={13} /> {tr("Tambah Sticky Note", "New Sticky Note")}
          </button>
        </div>
      )}

      {/* Live Paper Preview + Text Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-[190px_1fr] gap-4 items-center">
        <div
          className={`h-[178px] rounded-[14px] flex items-center justify-center p-4 overflow-hidden ${
            isLightMode
              ? "bg-gradient-to-br from-slate-200 to-slate-100"
              : "bg-gradient-to-br from-[#0d111a] to-[#1a1f2d]"
          }`}
        >
          <div
            className="relative w-[138px] h-[138px] p-3 flex flex-col justify-between transition-transform duration-150"
            style={{
              transform: `rotate(${tiltDeg}deg)`,
              background: `linear-gradient(180deg, ${shadeHex(paperColor, -14)} 0%, ${paperColor} 18%, ${shadeHex(paperColor, 8)} 100%)`,
              color: inkColor,
              borderRadius:
                noteStyle === "curled"
                  ? curlLeft
                    ? "2px 2px 2px 18px"
                    : "2px 2px 18px 2px"
                  : "3px 4px 6px 3px",
              boxShadow: "2px 10px 20px rgba(0,0,0,0.28), 0 2px 5px rgba(0,0,0,0.16)",
              clipPath:
                noteStyle === "curled"
                  ? curlLeft
                    ? "polygon(0 0, 100% 0, 100% 100%, 18px 100%, 0 calc(100% - 18px))"
                    : "polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%)"
                  : undefined,
            }}
          >
            {noteStyle === "tape" && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-3.5 bg-white/55 border border-slate-400/30 rotate-[-3deg]"
              />
            )}
            {noteStyle === "pin" && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-rose-500 border border-rose-700 shadow"
              />
            )}
            {noteStyle === "curled" && (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute ${curlLeft ? "left-0" : "right-0"} bottom-0 w-[18px] h-[18px]`}
                style={{
                  background: `linear-gradient(${curlLeft ? "225deg" : "135deg"}, ${shadeHex(paperColor, -26)} 0%, ${shadeHex(paperColor, -42)} 100%)`,
                  borderTopLeftRadius: curlLeft ? undefined : "4px",
                  borderTopRightRadius: curlLeft ? "4px" : undefined,
                }}
              />
            )}
            <div className="pt-2">
              {title.trim() && (
                <div className="text-[11px] font-bold truncate mb-1">{title}</div>
              )}
              <div
                className="text-[10.5px] leading-[1.45] whitespace-pre-wrap line-clamp-4 font-medium"
                style={{ color: text.trim() ? inkColor : mutedInk }}
              >
                {text.trim()
                  ? text
                  : tr("Klik di desktop atau ketik di sini...", "Click on desktop or type here...")}
              </div>
            </div>
            {showLines && (
              <div
                className="pointer-events-none absolute inset-x-3 top-8 bottom-4 opacity-20"
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent 17px, ${inkColor} 17px, ${inkColor} 18px)`,
                }}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 min-w-0">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold flex items-center gap-1.5 opacity-80">
              <Type size={12} /> {tr("Judul Catatan (Opsional)", "Note Title (Optional)")}
            </span>
            <input
              type="text"
              value={title}
              maxLength={60}
              onChange={(e) => onPatchSettings({ title: e.target.value })}
              placeholder={tr("Misal: Ide Hari Ini...", "e.g. Today's Ideas...")}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold opacity-80">
              {tr("Isi Catatan", "Note Content")}
            </span>
            <textarea
              rows={4}
              value={text}
              onChange={(e) => onPatchSettings({ text: e.target.value })}
              placeholder={tr(
                "Tulis catatan di sini (bisa juga klik langsung kertas di desktop)...",
                "Write your note here (or click the sticky note directly on desktop)..."
              )}
              className={`${inputCls} resize-y min-h-[86px]`}
            />
          </label>
        </div>
      </div>

      {/* Free Paper Color Picker */}
      <div
        className={`flex flex-col gap-2.5 pt-2 border-t ${
          isLightMode ? "border-black/[0.08]" : "border-white/[0.07]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold flex items-center gap-1.5">
            <Palette size={14} className="text-amber-400" />
            {tr("Warna Kertas (Bebas Pilih)", "Paper Color (Pick Any Color)")}
          </span>
          <div className="flex items-center gap-1.5">
            <input
              ref={colorInputRef}
              type="color"
              value={paperColor}
              onChange={(e) => commitHex(e.target.value)}
              className={`w-7 h-7 rounded-[7px] border bg-transparent cursor-pointer p-0.5 ${
                isLightMode ? "border-black/15" : "border-white/15"
              }`}
              aria-label={tr("Pemilih warna sistem", "System color picker")}
            />
            <input
              type="text"
              value={hexDraft}
              maxLength={7}
              onChange={(e) => {
                setHexDraft(e.target.value);
                if (parseHexToRgb(e.target.value)) {
                  commitHex(e.target.value);
                }
              }}
              onBlur={() => setHexDraft(paperColor)}
              className={`w-[82px] h-7 px-2 rounded-[7px] border text-[11px] font-mono uppercase ${
                isLightMode
                  ? "bg-neutral-50 border-black/10 text-neutral-900"
                  : "bg-white/[0.05] border-white/10 text-zinc-100"
              }`}
              aria-label="Hex color"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STICKY_NOTE_PRESET_COLORS.map((preset) => {
            const active = preset.hex.toUpperCase() === paperColor;
            return (
              <button
                key={preset.hex}
                type="button"
                title={isId ? preset.nameId : preset.nameEn}
                aria-label={isId ? preset.nameId : preset.nameEn}
                onClick={() => commitHex(preset.hex)}
                style={{ backgroundColor: preset.hex }}
                className={`w-7 h-7 rounded-[9px] border transition-transform cursor-pointer ${
                  active
                    ? "scale-110 ring-2 ring-[#0a84ff] border-white"
                    : "border-black/20 hover:scale-105"
                }`}
              />
            );
          })}
          <button
            type="button"
            onClick={() => colorInputRef.current?.click()}
            className={`px-2.5 h-7 rounded-[9px] text-[11px] font-medium border cursor-pointer ${
              isLightMode
                ? "border-black/10 hover:bg-black/5 text-neutral-700"
                : "border-white/10 hover:bg-white/10 text-zinc-300"
            }`}
          >
            {tr("Warna Lain...", "Custom Color...")}
          </button>
        </div>

        <HsvColorWheel
          color={{ r: parsedRgb.r, g: parsedRgb.g, b: parsedRgb.b, a: 0.98 }}
          isLightMode={isLightMode}
          isId={isId}
          onChange={(nextRgb) => {
            commitHex(rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b));
          }}
        />
      </div>

      {/* Natural Paper Shape, Tilt & Ruled Lines */}
      <div
        className={`grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t items-center ${
          isLightMode ? "border-black/[0.08]" : "border-white/[0.07]"
        }`}
      >
        <div className="flex flex-col items-start gap-1.5">
          <span className="text-[11.5px] font-semibold">
            {tr("Bentuk Tempelan Kertas", "Paper Attachment Style")}
          </span>
          <IosSegmentedControl<StickyNoteStyle>
            value={noteStyle}
            onChange={(val) => onPatchSettings({ note_style: val })}
            options={[
              { value: "tape", label: tr("Selotip", "Tape") },
              { value: "curled", label: tr("Sudut Lipat", "Curled") },
              { value: "pin", label: tr("Pin", "Pin") },
            ]}
          />
        </div>

        <div
          className={`flex items-center justify-between gap-3 px-3 py-2 rounded-[12px] border ${
            isLightMode
              ? "bg-neutral-50 border-black/[0.06]"
              : "bg-white/[0.03] border-white/[0.06]"
          }`}
        >
          <div className="flex flex-col">
            <span className="text-[12px] font-semibold">
              {tr("Garis Buku Kertas", "Ruled Paper Lines")}
            </span>
            <span className="text-[10.5px] opacity-65">
              {tr("Garis tipis agar terlihat seperti catatan asli", "Subtle lines like real sticky notes")}
            </span>
          </div>
          <IosSwitch
            checked={showLines}
            onChange={(val) => onPatchSettings({ show_lines: val })}
            activeColor="blue"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11.5px] font-semibold">
            {tr("Kemiringan Alami Kertas", "Natural Paper Tilt")} ({tiltDeg > 0 ? `+${tiltDeg.toFixed(1)}` : tiltDeg.toFixed(1)}°)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const naturalAngles = [-3.6, -2.5, -1.8, 2.2, 3.4, -4.2, 2.8];
                const pick =
                  naturalAngles[Math.floor(Math.random() * naturalAngles.length)];
                onPatchSettings({ tilt_deg: pick });
              }}
              className={`px-2 py-0.5 rounded-[7px] text-[10.5px] font-medium flex items-center gap-1 border cursor-pointer ${
                isLightMode
                  ? "border-black/10 hover:bg-black/5"
                  : "border-white/10 hover:bg-white/10"
              }`}
            >
              <Shuffle size={11} /> {tr("Acak Alami", "Natural")}
            </button>
            <button
              type="button"
              onClick={() => onPatchSettings({ tilt_deg: 0 })}
              className={`px-2 py-0.5 rounded-[7px] text-[10.5px] font-medium flex items-center gap-1 border cursor-pointer ${
                isLightMode
                  ? "border-black/10 hover:bg-black/5"
                  : "border-white/10 hover:bg-white/10"
              }`}
            >
              <RotateCcw size={11} /> 0°
            </button>
          </div>
        </div>
        <input
          type="range"
          min={-8}
          max={8}
          step={0.5}
          value={tiltDeg}
          onChange={(e) => onPatchSettings({ tilt_deg: Number(e.target.value) })}
          className="w-full accent-[#0a84ff] cursor-pointer"
        />
      </div>
    </div>
  );
};

