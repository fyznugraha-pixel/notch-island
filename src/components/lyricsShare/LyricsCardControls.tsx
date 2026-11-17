import React, { useRef, useState } from "react";
import { Check, FolderOpen, ImagePlus, Palette, RotateCcw } from "lucide-react";
import {
  BackgroundBlurMode,
  FONT_COLOR_PRESETS,
  LyricsCardPalette,
  LyricsCardPreferences,
  LyricsCardRatio,
  LyricsCardStyle,
  isColorLight,
  normalizeHexColor,
} from "../../services/lyricsShareService";
import { tx, useTaskbarLang } from "../../services/taskbarI18n";
import { TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { invoke } from "@tauri-apps/api/core";
import { LyricsFontColorPopover } from "./LyricsFontColorPopover";

const RATIO_OPTIONS: { id: LyricsCardRatio; label: string }[] = [
  { id: "1:1", label: "1:1" },
  { id: "4:5", label: "4:5" },
  { id: "9:16", label: "9:16" },
];

const BLUR_OPTIONS: { id: BackgroundBlurMode; labelEn: string; labelId: string }[] = [
  { id: "none", labelEn: "Sharp", labelId: "Mati" },
  { id: "soft", labelEn: "Soft", labelId: "Halus" },
  { id: "heavy", labelEn: "Deep", labelId: "Kuat" },
];

interface LyricsCardControlsProps {
  prefs: LyricsCardPreferences;
  palettes: LyricsCardPalette[];
  activePalette: LyricsCardPalette;
  customBgUrl: string | null;
  savedPath: string | null;
  actionError: string | null;
  onUpdatePrefs: (patch: Partial<LyricsCardPreferences>) => void;
  onSelectCustomBgFile: (file: File) => void;
  onClearCustomBg: () => void;
}

export const LyricsCardControls: React.FC<LyricsCardControlsProps> = ({
  prefs,
  palettes,
  activePalette,
  customBgUrl,
  savedPath,
  actionError,
  onUpdatePrefs,
  onSelectCustomBgFile,
  onClearCustomBg,
}) => {
  const lang = useTaskbarLang();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  const [showColorPopover, setShowColorPopover] = useState(false);
  const currentFontHex = normalizeHexColor(prefs.fontColor, "#ffffff");
  const isPresetFont = FONT_COLOR_PRESETS.some(
    (p) => p.hex.toLowerCase() === currentFontHex
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onSelectCustomBgFile(file);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto px-0.5">
      {/* Style Toggle: Spotify vs Apple Music */}
      <div className="space-y-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">
          {tx(lang, "Card Style", "Gaya Kartu")}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              {
                id: "spotify" as LyricsCardStyle,
                title: "Spotify",
                sub: tx(lang, "Quote bar & cover blur", "Kutipan + aksen blur"),
              },
              {
                id: "apple" as LyricsCardStyle,
                title: "Apple Music",
                sub: tx(lang, "Luminous blur glass", "Teks glow + blur penuh"),
              },
            ] as const
          ).map((opt) => {
            const active = prefs.style === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => onUpdatePrefs({ style: opt.id })}
                className={`px-2.5 py-2 rounded-xl border text-left transition-colors cursor-pointer ${TRIGGER_FOCUS_RING} ${
                  active
                    ? "bg-[#3882F6]/15 border-[#3882F6]/65 text-white"
                    : "bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300"
                }`}
              >
                <div className="text-[12px] font-semibold">{opt.title}</div>
                <div className="text-[10px] text-zinc-400">{opt.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Aspect Ratio */}
      <div className="space-y-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">
          {tx(lang, "Aspect Ratio", "Rasio Kartu")}
        </div>
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
          {RATIO_OPTIONS.map((r) => {
            const active = prefs.ratio === r.id;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={active}
                onClick={() => onUpdatePrefs({ ratio: r.id })}
                className={`h-7 rounded-lg text-[11.5px] font-semibold transition-colors cursor-pointer tabular-nums ${TRIGGER_FOCUS_RING} ${
                  active
                    ? "bg-[#3882F6] text-white"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Background Upload & Blur Mode */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">
            {tx(lang, "Background", "Latar Belakang")}
          </span>
          <span className="text-[10px] text-zinc-500">
            {customBgUrl
              ? tx(lang, "Custom image", "Gambar kustom")
              : tx(lang, "Album cover", "Sampul album")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`h-8 px-2.5 rounded-lg border text-[11.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 ${TRIGGER_FOCUS_RING} ${
              customBgUrl
                ? "bg-[#3882F6]/15 border-[#3882F6]/50 text-white hover:bg-[#3882F6]/25"
                : "bg-white/[0.05] hover:bg-white/[0.10] border-white/[0.09] text-zinc-200"
            }`}
          >
            <ImagePlus size={13} />
            <span>{customBgUrl ? tx(lang, "Change", "Ganti Foto") : tx(lang, "Upload Image", "Upload Gambar")}</span>
          </button>

          {customBgUrl && (
            <button
              type="button"
              onClick={onClearCustomBg}
              title={tx(lang, "Reset to album cover", "Kembali ke cover album")}
              aria-label={tx(lang, "Reset to album cover", "Kembali ke cover album")}
              className={`h-8 w-8 rounded-lg border border-white/[0.09] bg-white/[0.05] hover:bg-white/[0.12] text-zinc-300 hover:text-white inline-flex items-center justify-center cursor-pointer transition-colors shrink-0 ${TRIGGER_FOCUS_RING}`}
            >
              <RotateCcw size={13} />
            </button>
          )}

          <div className="flex-1 min-w-0 grid grid-cols-3 gap-0.5 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
            {BLUR_OPTIONS.map((b) => {
              const active = prefs.bgBlur === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onUpdatePrefs({ bgBlur: b.id })}
                  className={`h-7 rounded-md text-[10.5px] font-medium transition-colors cursor-pointer ${TRIGGER_FOCUS_RING} ${
                    active ? "bg-white/15 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {tx(lang, b.labelEn, b.labelId)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Swatch Palette */}
      <div className="space-y-0.5">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">
          {tx(lang, "Color Mood", "Nuansa Warna")}
        </div>
        <div className="flex items-center gap-2.5 flex-wrap p-1.5">
          {palettes.map((pal) => {
            const selected = activePalette.id === pal.id;
            return (
              <button
                key={pal.id}
                type="button"
                aria-pressed={selected}
                aria-label={pal.label}
                title={pal.label}
                onClick={() => onUpdatePrefs({ paletteId: pal.id })}
                style={{
                  background: `linear-gradient(135deg, ${pal.bg}, ${pal.bgSecondary})`,
                }}
                className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer flex items-center justify-center ${TRIGGER_FOCUS_RING} ${
                  selected
                    ? "border-white scale-110 shadow-md"
                    : "border-white/20 hover:scale-105"
                }`}
              >
                {selected && (
                  <Check size={12} strokeWidth={3} style={{ color: pal.text }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Font Color Selector */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">
            {tx(lang, "Font Color", "Warna Teks")}
          </span>
          <span className="text-[10px] font-mono text-zinc-500 uppercase">
            {currentFontHex}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap p-1.5">
          {FONT_COLOR_PRESETS.map((preset) => {
            const selected = currentFontHex === preset.hex.toLowerCase();
            const checkColor = isColorLight(preset.hex) ? "#111114" : "#ffffff";
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                aria-label={preset.label}
                title={preset.label}
                onClick={() => onUpdatePrefs({ fontColor: preset.hex })}
                style={{ backgroundColor: preset.hex }}
                className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer flex items-center justify-center ${TRIGGER_FOCUS_RING} ${
                  selected
                    ? "border-[#3882F6] scale-110 shadow-md"
                    : "border-white/20 hover:scale-105"
                }`}
              >
                {selected && (
                  <Check size={12} strokeWidth={3} style={{ color: checkColor }} />
                )}
              </button>
            );
          })}

          <button
            ref={colorTriggerRef}
            type="button"
            aria-expanded={showColorPopover}
            aria-label={tx(lang, "Pick custom hex color", "Pilih warna kustom")}
            title={tx(lang, "Pick custom hex color", "Pilih warna kustom")}
            onClick={() => setShowColorPopover((v) => !v)}
            style={!isPresetFont ? { backgroundColor: currentFontHex } : undefined}
            className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer flex items-center justify-center ${TRIGGER_FOCUS_RING} ${
              !isPresetFont || showColorPopover
                ? "border-[#3882F6] scale-110 shadow-md"
                : "border-white/20 bg-white/[0.08] hover:scale-105 text-zinc-200"
            }`}
          >
            <Palette
              size={13}
              style={
                !isPresetFont
                  ? { color: isColorLight(currentFontHex) ? "#111114" : "#ffffff" }
                  : undefined
              }
            />
          </button>

          {showColorPopover && (
            <LyricsFontColorPopover
              value={currentFontHex}
              anchorRef={colorTriggerRef}
              onChange={(hex) => onUpdatePrefs({ fontColor: hex })}
              onClose={() => setShowColorPopover(false)}
            />
          )}
        </div>
      </div>

      {/* Action Feedback Banner */}
      {(savedPath || actionError) && (
        <div
          className={`px-3 py-2 rounded-xl border text-[11.5px] flex items-center justify-between gap-2 ${
            actionError
              ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
          }`}
        >
          <span className="truncate">
            {actionError
              ? actionError
              : tx(lang, `Saved: ${savedPath}`, `Tersimpan: ${savedPath}`)}
          </span>
          {savedPath && !actionError && (
            <button
              type="button"
              onClick={() => invoke("show_in_folder", { path: savedPath })}
              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-[10.5px] font-medium inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <FolderOpen size={11} />
              <span>{tx(lang, "Open", "Buka")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
