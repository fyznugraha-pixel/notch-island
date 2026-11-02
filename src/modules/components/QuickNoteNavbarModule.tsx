import React, { useState, useRef } from "react";
import { FileText, Plus, Trash2, Copy, Check } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

interface QuickNoteItem {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

const NOTES_KEY = "gili_quick_notes";

export const QuickNoteNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [notes, setNotes] = useState<QuickNoteItem[]>(() => {
    try {
      const raw = localStorage.getItem(NOTES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const saveNotes = (next: QuickNoteItem[]) => {
    setNotes(next);
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(next));
    } catch {}
  };

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    const item: QuickNoteItem = {
      id: `note_${Date.now()}`,
      title: trimmed.slice(0, 36),
      content: trimmed,
      updatedAt: Date.now(),
    };
    saveNotes([item, ...notes]);
    setDraft("");
  };

  const handleCopy = (note: QuickNoteItem) => {
    navigator.clipboard.writeText(note.content).catch(() => {});
    setCopiedId(note.id);
    setTimeout(() => setCopiedId(null), 1200);
  };

  const handleDelete = (id: string) => {
    saveNotes(notes.filter((n) => n.id !== id));
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`relative flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title="Catat cepat: Ketik ide kilat langsung dari taskbar"
      >
        <FileText size={15} className="text-zinc-300 shrink-0" />
        {isCompact ? (
          notes.length > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 h-[15px] rounded-full bg-amber-500 text-[9.5px] font-bold text-black flex items-center justify-center">
              {notes.length}
            </span>
          )
        ) : (
          <>
            <span className="text-[11.5px] text-zinc-400 truncate max-w-[95px]">
              {notes[0] ? notes[0].content : "Catat ide…"}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-[5px] bg-white/[0.07] text-zinc-300 font-mono">
              {notes.length > 0 ? `${notes.length} catatan` : "Kilat"}
            </span>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Catat Cepat"
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
              placeholder="Ketik ide kilat lalu Enter..."
              className="flex-1 min-w-0 h-8 px-2.5 rounded-[8px] bg-white/[0.07] border border-white/[0.12] text-[11.5px] text-white placeholder-zinc-500 outline-none focus:border-[#3882F6]"
            />
            <button
              type="submit"
              className="w-8 h-8 rounded-[8px] bg-[#3882F6] hover:bg-[#2563eb] text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="Simpan catatan"
            >
              <Plus size={14} />
            </button>
          </form>

          <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-0.5">
            {notes.length === 0 ? (
              <div className="text-[11px] text-zinc-500 py-3 text-center">
                Belum ada catatan kilat.
              </div>
            ) : (
              notes.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[8px] bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.05]"
                >
                  <span className="text-[11.5px] text-zinc-200 truncate flex-1">
                    {n.content}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(n)}
                      className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                      title="Salin catatan"
                    >
                      {copiedId === n.id ? (
                        <Check size={12} className="text-emerald-400" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(n.id)}
                      className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer"
                      title="Hapus"
                    >
                      <Trash2 size={12} />
                    </button>
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
