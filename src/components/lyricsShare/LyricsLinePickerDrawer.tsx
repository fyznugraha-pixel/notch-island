import React from "react";
import { Check, ChevronUp } from "lucide-react";
import {
  MAX_SELECTED_LYRIC_LINES,
  toggleLyricSelection,
} from "../../services/lyricsShareService";
import { tx, useTaskbarLang } from "../../services/taskbarI18n";

interface LyricsLinePickerDrawerProps {
  lines: string[];
  selectedIndices: number[];
  onChangeSelection: (indices: number[]) => void;
  onClose: () => void;
}

export const LyricsLinePickerDrawer: React.FC<LyricsLinePickerDrawerProps> = ({
  lines,
  selectedIndices,
  onChangeSelection,
  onClose,
}) => {
  const lang = useTaskbarLang();

  const handleToggle = (idx: number) => {
    const next = toggleLyricSelection(selectedIndices, idx, MAX_SELECTED_LYRIC_LINES);
    // Keep at least 1 line active inside the Studio preview
    if (next.length === 0) return;
    onChangeSelection(next);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-white/10 bg-[#121218] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.08] shrink-0">
        <span className="text-[11.5px] font-semibold text-zinc-200">
          {tx(
            lang,
            `Pick 1–${MAX_SELECTED_LYRIC_LINES} lines (${selectedIndices.length} selected)`,
            `Pilih 1–${MAX_SELECTED_LYRIC_LINES} baris (${selectedIndices.length} dipilih)`
          )}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.08] hover:bg-white/[0.15] text-[11px] font-medium text-zinc-100 cursor-pointer transition-colors"
        >
          <span>{tx(lang, "Done", "Selesai")}</span>
          <ChevronUp size={12} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
        {lines.map((lineText, idx) => {
          const clean = lineText.trim();
          if (!clean) return null;
          const selected = selectedIndices.includes(idx);
          const atLimit = !selected && selectedIndices.length >= MAX_SELECTED_LYRIC_LINES;
          return (
            <button
              key={`${idx}-${clean.slice(0, 16)}`}
              type="button"
              disabled={atLimit}
              onClick={() => handleToggle(idx)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-[12px] leading-snug transition-colors ${
                selected
                  ? "bg-[#3882F6]/20 border border-[#3882F6]/50 text-white font-semibold cursor-pointer"
                  : atLimit
                  ? "text-zinc-600 border border-transparent cursor-not-allowed"
                  : "text-zinc-300 hover:bg-white/[0.06] border border-transparent cursor-pointer"
              }`}
            >
              <span
                className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                  selected
                    ? "bg-[#3882F6] border-[#3882F6] text-white"
                    : "border-white/20 bg-white/[0.03]"
                }`}
              >
                {selected && <Check size={11} strokeWidth={2.8} />}
              </span>
              <span className="flex-1 break-words">{clean}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
