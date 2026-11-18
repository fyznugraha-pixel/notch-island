import React, { useState, useEffect, useRef } from "react";
import { FileText, Plus, Trash2, Copy, Check } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { copyTextToClipboard } from "../../utils/clipboard";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import {
  MINI_NOTES_STORAGE_KEY,
  type MiniNoteItem,
  loadMiniNotes,
  createQuickNoteItem,
  deleteQuickNoteItem,
  getMiniNoteDisplayText,
} from "../../services/noteUtils";
import { listenCrossWindowEvent } from "../../utils/crossWindowSync";

export const QuickNoteNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<MiniNoteItem[]>(() => loadMiniNotes());

  useEffect(() => {
    const syncNotes = () => setNotes(loadMiniNotes());
    const unsubCross = listenCrossWindowEvent("gili_notes_updated", syncNotes);
    const onStorage = (e: StorageEvent) => {
      if (e.key === MINI_NOTES_STORAGE_KEY || e.key === null) syncNotes();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubCross();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    createQuickNoteItem(trimmed, "blue", false);
    setNotes(loadMiniNotes());
    setDraft("");
  };

  const handleCopy = async (note: MiniNoteItem) => {
    const ok = await copyTextToClipboard(getMiniNoteDisplayText(note));
    if (ok) {
      setCopiedId(note.id);
      setTimeout(() => setCopiedId(null), 1200);
    }
  };

  const handleDelete = (id: string) => {
    deleteQuickNoteItem(id);
    setNotes(loadMiniNotes());
  };

  const handleToggle = () => setIsOpen((v) => !v);

  const noteCountText =
    lang === "en"
      ? `${notes.length} ${notes.length === 1 ? "note" : "notes"}`
      : `${notes.length} catatan`;

  return (
    <>
      <Tooltip
        content={tx(
          lang,
          "Quick Note: Jot down quick ideas straight from the taskbar",
          "Catat cepat: Ketik ide kilat langsung dari taskbar"
        )}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            `${tx(lang, "Quick Note", "Catat cepat")} (${noteCountText})`,
            isOpen
          )}
          className={`relative flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "gili-mod-pill px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <FileText size={15} className="text-zinc-200 shrink-0" />
          {isCompact ? (
            notes.length > 0 && (
              <span className="gili-mod-badge absolute top-[1px] right-[1px] px-1 h-[14px] rounded-full bg-amber-500 text-[8.5px] font-bold text-[#09090b] flex items-center justify-center tabular-nums pointer-events-none">
                {notes.length}
              </span>
            )
          ) : (
            <>
              <span className="text-[11.5px] text-zinc-200 truncate max-w-[95px]">
                {notes[0] ? getMiniNoteDisplayText(notes[0]) : tx(lang, "Jot an idea...", "Catat ide...")}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-[5px] bg-white/[0.07] text-zinc-300 font-mono shrink-0">
                {notes.length > 0 ? noteCountText : tx(lang, "Quick", "Kilat")}
              </span>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Quick Note", "Catat Cepat")}
        moduleId="catat_cepat"
        currentView={view}
        config={config}
        width={280}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2.5">
          <form onSubmit={handleSaveDraft} className="flex items-center gap-1.5">
            <input
              type="text"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={tx(
                lang,
                "Type a quick idea and press Enter...",
                "Ketik ide kilat lalu Enter..."
              )}
              className={`flex-1 min-w-0 h-8 px-2.5 rounded-[8px] bg-white/[0.07] border border-white/[0.12] text-[11.5px] text-white placeholder-zinc-400 ${TRIGGER_FOCUS_RING}`}
            />
            <Tooltip
              content={tx(lang, "Save note", "Simpan catatan")}
              side="top"
              isLightMode={isLight}
            >
              <button
                type="submit"
                className={`w-8 h-8 rounded-[8px] bg-[#3882F6] hover:bg-[#2563eb] text-[#ffffff] flex items-center justify-center transition-colors cursor-pointer shrink-0 ${TRIGGER_FOCUS_RING}`}
              >
                <Plus size={14} />
              </button>
            </Tooltip>
          </form>

          <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-0.5">
            {notes.length === 0 ? (
              <div className="text-[11px] text-zinc-400 py-3 text-center">
                {tx(lang, "No quick notes yet.", "Belum ada catatan kilat.")}
              </div>
            ) : (
              notes.map((n) => (
                <div
                  key={n.id}
                  className="w-full min-w-0 overflow-hidden flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[8px] bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08]"
                >
                  <span className="text-[11.5px] text-zinc-200 truncate flex-1 min-w-0">
                    {getMiniNoteDisplayText(n)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Tooltip
                      content={tx(lang, "Copy note", "Salin catatan")}
                      side="top"
                      isLightMode={isLight}
                    >
                      <button
                        type="button"
                        onClick={() => handleCopy(n)}
                        className={`p-1 text-zinc-300 hover:text-white cursor-pointer rounded ${TRIGGER_FOCUS_RING}`}
                      >
                        {copiedId === n.id ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </Tooltip>
                    <Tooltip
                      content={tx(lang, "Delete", "Hapus")}
                      side="top"
                      isLightMode={isLight}
                    >
                      <button
                        type="button"
                        onClick={() => handleDelete(n.id)}
                        className={`p-1 text-zinc-400 hover:text-rose-400 cursor-pointer rounded ${TRIGGER_FOCUS_RING}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
