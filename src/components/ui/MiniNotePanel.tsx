import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Trash2,
  Copy,
  Check,
  Pin,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  ListTodo,
  List,
  Bold,
  Link2,
  StickyNote,
} from "lucide-react";
import { t, getLanguage, Language } from "../../services/i18n";

export type NoteColor = "blue" | "mint" | "amber" | "coral";

export interface NoteCheckItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface MiniNoteItem {
  id: string;
  title: string;
  content: string;
  color: NoteColor;
  pinned: boolean;
  isChecklist?: boolean;
  checklist?: NoteCheckItem[];
  updatedAt: number;
}

export const NOTE_COLOR_MAP: Record<NoteColor, string> = {
  blue: "#3882F6",
  mint: "#5EEAD4",
  amber: "#FBBF24",
  coral: "#F87171",
};

export const NOTE_COLORS: NoteColor[] = ["blue", "mint", "amber", "coral"];

const STORAGE_KEY = "gili_mini_notes_v2";

export function loadMiniNotes(): MiniNoteItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  const isEn = getLanguage() === "en";
  return [
    {
      id: "note-default-1",
      title: isEn ? "Gili Quick Note" : "Catatan cepat Gili",
      content: isEn
        ? "Press Ctrl + Shift + N anytime to create quick notes directly from notch."
        : "Tekan Ctrl + Shift + N kapan saja untuk membuat catatan cepat langsung dari notch.",
      color: "blue",
      pinned: true,
      isChecklist: false,
      checklist: [],
      updatedAt: Date.now(),
    },
  ];
}

export function saveMiniNotes(notes: MiniNoteItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // ignore
  }
}

export function notifyNotesUpdated(): void {
  window.dispatchEvent(new CustomEvent("gili_notes_updated"));
}

export function createQuickNoteItem(
  text: string,
  color: NoteColor,
  pinned: boolean
): MiniNoteItem {
  const trimmed = text.trim();
  const lines = trimmed.split("\n");
  const title = lines[0]?.slice(0, 64) || t("note_title");
  const body = lines.length > 1 ? lines.slice(1).join("\n") : trimmed;
  const next: MiniNoteItem = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    content: body,
    color,
    pinned,
    isChecklist: false,
    checklist: [],
    updatedAt: Date.now(),
  };
  const existing = loadMiniNotes();
  saveMiniNotes([next, ...existing]);
  notifyNotesUpdated();
  return next;
}

function formatCardTimestamp(ts: number, lang?: Language): string {
  const now = new Date();
  const d = new Date(ts);
  const isToday =
    now.getFullYear() === d.getFullYear() &&
    now.getMonth() === d.getMonth() &&
    now.getDate() === d.getDate();

  if (isToday) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const locale = (lang || getLanguage()) === "id" ? "id-ID" : "en-US";
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

function countNoteWords(note: MiniNoteItem): number {
  const textSource = note.isChecklist
    ? `${note.title} ${(note.checklist || []).map((c) => c.text).join(" ")}`
    : `${note.title} ${note.content}`;
  const trimmed = textSource.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function getNotePreviewText(note: MiniNoteItem): string {
  if (note.isChecklist && note.checklist && note.checklist.length > 0) {
    return note.checklist
      .map((item) => `${item.checked ? "✓" : "○"} ${item.text}`)
      .join(" · ");
  }
  return note.content || "";
}

export interface MiniNotePanelProps {
  optAccent?: string;
  optLanguage?: Language;
  onEditingChange?: (isEditing: boolean) => void;
}

export const MiniNotePanel: React.FC<MiniNotePanelProps> = ({ optLanguage, onEditingChange }) => {
  const isEn = (optLanguage || getLanguage()) === "en";
  const [notes, setNotes] = useState<MiniNoteItem[]>(() => loadMiniNotes());
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const cardsRowRef = useRef<HTMLDivElement>(null);
  const isDraggingRowRef = useRef(false);
  const dragStartXRef = useRef(0);
  const scrollStartLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);

  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  // Debounced save to localStorage (300ms) to ensure smooth 60fps/120fps typing
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveMiniNotes(notes);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [notes]);

  // Flush pending changes immediately on unmount
  useEffect(() => {
    return () => {
      saveMiniNotes(notesRef.current);
    };
  }, []);

  useEffect(() => {
    const syncNotes = () => {
      setNotes(loadMiniNotes());
    };
    window.addEventListener("gili_notes_updated", syncNotes);
    return () => window.removeEventListener("gili_notes_updated", syncNotes);
  }, []);

  useEffect(() => {
    onEditingChange?.(Boolean(editingNoteId));
  }, [editingNoteId, onEditingChange]);

  const handleExitEditor = useCallback(() => {
    saveMiniNotes(notesRef.current);
    setEditingNoteId(null);
  }, []);

  useEffect(() => {
    if (!editingNoteId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleExitEditor();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingNoteId, handleExitEditor]);

  const sortedFilteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...notes]
      .filter((n) => {
        if (!q) return true;
        const checklistStr = (n.checklist || []).map((c) => c.text).join(" ").toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          checklistStr.includes(q)
        );
      })
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [notes, searchQuery]);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = cardsRowRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(maxScroll - el.scrollLeft > 6);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = cardsRowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    return () => ro.disconnect();
  }, [sortedFilteredNotes.length, updateScrollState]);

  const scrollByAmount = useCallback((amount: number) => {
    if (!cardsRowRef.current) return;
    cardsRowRef.current.scrollBy({ left: amount, behavior: "smooth" });
    window.setTimeout(updateScrollState, 150);
    window.setTimeout(updateScrollState, 350);
  }, [updateScrollState]);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingRowRef.current || !cardsRowRef.current) return;
      const dx = e.clientX - dragStartXRef.current;
      if (Math.abs(dx) > 5) {
        hasDraggedRef.current = true;
      }
      cardsRowRef.current.scrollLeft = scrollStartLeftRef.current - dx;
      updateScrollState();
    };

    const handleGlobalMouseUp = () => {
      if (isDraggingRowRef.current) {
        isDraggingRowRef.current = false;
        window.setTimeout(() => {
          hasDraggedRef.current = false;
        }, 80);
      }
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [updateScrollState]);

  const pinnedCount = useMemo(() => notes.filter((n) => n.pinned).length, [notes]);
  const activeNote = useMemo(
    () => notes.find((n) => n.id === editingNoteId) || null,
    [notes, editingNoteId]
  );

  const handleCreateNewNote = () => {
    const next: MiniNoteItem = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: "",
      content: "",
      color: "blue",
      pinned: false,
      isChecklist: false,
      checklist: [],
      updatedAt: Date.now(),
    };
    setNotes((prev) => {
      const updated = [next, ...prev];
      saveMiniNotes(updated);
      return updated;
    });
    setEditingNoteId(next.id);
  };

  const updateActiveNote = (updater: (note: MiniNoteItem) => MiniNoteItem) => {
    if (!editingNoteId) return;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === editingNoteId ? { ...updater(n), updatedAt: Date.now() } : n
      )
    );
  };

  const handleTogglePin = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setNotes((prev) => {
      const updated = prev.map((n) =>
        n.id === id ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n
      );
      saveMiniNotes(updated);
      return updated;
    });
  };

  const handleDeleteNote = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setNotes((prev) => {
      const updated = prev.filter((n) => n.id !== id);
      saveMiniNotes(updated);
      return updated;
    });
    if (editingNoteId === id) {
      setEditingNoteId(null);
    }
  };

  const handleCopyActiveNote = async () => {
    if (!activeNote) return;
    const text = activeNote.isChecklist
      ? `${activeNote.title}\n${(activeNote.checklist || [])
          .map((c) => `${c.checked ? "[x]" : "[ ]"} ${c.text}`)
          .join("\n")}`
      : `${activeNote.title}\n${activeNote.content}`.trim();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleToggleChecklistMode = () => {
    if (!activeNote) return;
    updateActiveNote((n) => {
      if (n.isChecklist) {
        const joined = (n.checklist || []).map((c) => c.text).join("\n");
        return { ...n, isChecklist: false, content: joined };
      } else {
        const lines = (n.content || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const list: NoteCheckItem[] =
          lines.length > 0
            ? lines.map((text, idx) => ({
                id: `chk-${Date.now()}-${idx}`,
                text,
                checked: false,
              }))
            : [{ id: `chk-${Date.now()}-0`, text: "", checked: false }];
        return { ...n, isChecklist: true, checklist: list };
      }
    });
  };

  const handleInsertBullet = () => {
    if (!activeNote) return;
    if (activeNote.isChecklist) {
      updateActiveNote((n) => ({
        ...n,
        isChecklist: false,
        content: (n.checklist || []).map((c) => `• ${c.text}`).join("\n"),
      }));
    } else {
      updateActiveNote((n) => ({
        ...n,
        content: n.content ? `${n.content}\n• ` : "• ",
      }));
    }
  };

  // Detail / Editor View (Image 2)
  if (activeNote) {
    const words = countNoteWords(activeNote);
    const timeFormatted = formatCardTimestamp(activeNote.updatedAt);

    return (
      <div className="flex flex-col w-full h-full min-h-0 px-6 pt-1 pb-2.5 select-none text-white overflow-hidden">
        {/* Top Editor Action Bar */}
        <div className="flex items-center justify-between gap-2 shrink-0 mb-2">
          <button
            type="button"
            onClick={handleExitEditor}
            className="flex items-center gap-2.5 text-[#e4e4e7] hover:text-white transition-colors cursor-pointer"
          >
            <span className="w-8 h-8 rounded-full bg-[#17171c] hover:bg-[#23232a] flex items-center justify-center">
              <ChevronLeft size={16} />
            </span>
            <span className="text-[17px] font-semibold tracking-tight">{t("note_header_single")}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTogglePin(activeNote.id)}
              title={t("note_pin_btn")}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                activeNote.pinned
                  ? "bg-[#3882F6]/20 text-[#3882F6] border border-[#3882F6]/40"
                  : "bg-[#17171c] hover:bg-[#23232a] text-[#a1a1aa] hover:text-white"
              }`}
            >
              <Pin size={14} />
            </button>

            <button
              type="button"
              onClick={handleCopyActiveNote}
              title={isEn ? "Copy" : "Salin"}
              className="w-8 h-8 rounded-full bg-[#17171c] hover:bg-[#23232a] text-[#a1a1aa] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              {copied ? <Check size={14} className="text-[#34c3a0]" /> : <Copy size={14} />}
            </button>

            <button
              type="button"
              onClick={() => handleDeleteNote(activeNote.id)}
              title={t("action_delete") || (isEn ? "Delete" : "Hapus")}
              className="w-8 h-8 rounded-full bg-[#17171c] hover:bg-rose-500/20 text-[#ff7b72] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
            </button>

            <button
              type="button"
              onClick={handleExitEditor}
              className="h-8 px-4 rounded-full bg-[#3882F6] hover:bg-[#2563eb] text-white text-[12.5px] font-semibold transition-colors cursor-pointer"
            >
              {t("note_done")}
            </button>
          </div>
        </div>

        {/* Title & Meta Info */}
        <input
          type="text"
          value={activeNote.title}
          onChange={(e) => updateActiveNote((n) => ({ ...n, title: e.target.value }))}
          placeholder={t("note_title_placeholder")}
          className="w-full bg-transparent text-[18px] font-bold text-white placeholder-[#52525b] outline-none tracking-tight shrink-0"
        />
        <div className="text-[11px] text-[#a1a1aa] mt-0.5 mb-1.5 shrink-0 tabular-nums">
          {(() => {
            const now = new Date();
            const d = new Date(activeNote.updatedAt);
            const isToday =
              now.getFullYear() === d.getFullYear() &&
              now.getMonth() === d.getMonth() &&
              now.getDate() === d.getDate();
            const formattedDate = d.toLocaleDateString(
              (optLanguage || getLanguage()) === "id" ? "id-ID" : "en-US",
              { day: "numeric", month: "short" }
            );
            return isToday
              ? t("note_edited_today", { time: timeFormatted, words })
              : t("note_edited_date", { date: formattedDate, words });
          })()}
        </div>

        {/* Editor Body: Checklist or Textarea */}
        <div className="flex-1 min-h-0 overflow-y-auto todo-scroll py-0.5 pr-1">
          {activeNote.isChecklist ? (
            <div className="flex flex-col gap-2">
              {(activeNote.checklist || []).map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2.5 group">
                  <button
                    type="button"
                    onClick={() =>
                      updateActiveNote((n) => ({
                        ...n,
                        checklist: (n.checklist || []).map((c) =>
                          c.id === item.id ? { ...c, checked: !c.checked } : c
                        ),
                      }))
                    }
                    className={`w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      item.checked
                        ? "bg-[#3882F6] text-white"
                        : "border border-[#52525b] hover:border-[#a1a1aa] bg-transparent"
                    }`}
                  >
                    {item.checked && <Check size={11} strokeWidth={3} />}
                  </button>
                  <input
                    type="text"
                    value={item.text}
                    placeholder={t("note_item_placeholder")}
                    onChange={(e) =>
                      updateActiveNote((n) => ({
                        ...n,
                        checklist: (n.checklist || []).map((c) =>
                          c.id === item.id ? { ...c, text: e.target.value } : c
                        ),
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const newItem: NoteCheckItem = {
                          id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                          text: "",
                          checked: false,
                        };
                        updateActiveNote((n) => {
                          const list = [...(n.checklist || [])];
                          list.splice(idx + 1, 0, newItem);
                          return { ...n, checklist: list };
                        });
                      } else if (
                        e.key === "Backspace" &&
                        !item.text &&
                        (activeNote.checklist || []).length > 1
                      ) {
                        e.preventDefault();
                        updateActiveNote((n) => ({
                          ...n,
                          checklist: (n.checklist || []).filter((c) => c.id !== item.id),
                        }));
                      }
                    }}
                    className={`flex-1 bg-transparent text-[13.5px] outline-none ${
                      item.checked ? "line-through text-[#71717a]" : "text-white font-medium"
                    }`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <textarea
              value={activeNote.content}
              onChange={(e) => updateActiveNote((n) => ({ ...n, content: e.target.value }))}
              placeholder={t("note_placeholder")}
              className="w-full h-full bg-transparent text-[13.5px] text-white placeholder-[#52525b] leading-relaxed outline-none resize-none select-text"
            />
          )}
        </div>

        {/* Bottom Formatting & Color Toolbar */}
        <div className="flex items-center justify-between pt-2 mt-1 shrink-0">
          <div className="flex items-center gap-3">
            {/* Formatting Group */}
            <div className="h-[32px] px-1 rounded-[10px] bg-[#121216] border border-[#1e1e25] flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleToggleChecklistMode}
                className={`w-7 h-6 rounded-[7px] flex items-center justify-center transition-colors cursor-pointer ${
                  activeNote.isChecklist
                    ? "bg-[#23232a] text-white"
                    : "text-[#a1a1aa] hover:text-white"
                }`}
                title={isEn ? "Checklist" : "Daftar centang"}
              >
                <ListTodo size={14} />
              </button>
              <button
                type="button"
                onClick={handleInsertBullet}
                className="w-7 h-6 rounded-[7px] text-[#a1a1aa] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title={isEn ? "Bullet list" : "Daftar poin"}
              >
                <List size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const boldSnippet = (optLanguage || getLanguage()) === "en" ? "**text**" : "**teks**";
                  updateActiveNote((n) => ({
                    ...n,
                    content: n.content ? `${n.content} ${boldSnippet}` : boldSnippet,
                  }));
                }}
                className="w-7 h-6 rounded-[7px] text-[#a1a1aa] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title={isEn ? "Bold" : "Tebal"}
              >
                <Bold size={13.5} />
              </button>
              <button
                type="button"
                onClick={() =>
                  updateActiveNote((n) => ({
                    ...n,
                    content: n.content ? `${n.content} https://` : "https://",
                  }))
                }
                className="w-7 h-6 rounded-[7px] text-[#a1a1aa] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title={isEn ? "Link" : "Tautan"}
              >
                <Link2 size={13.5} />
              </button>
            </div>

            {/* 4 Color Dots */}
            <div className="flex items-center gap-2">
              {NOTE_COLORS.map((c) => {
                const isSelected = activeNote.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateActiveNote((n) => ({ ...n, color: c }))}
                    style={{ backgroundColor: NOTE_COLOR_MAP[c] }}
                    className={`w-[18px] h-[18px] rounded-full transition-transform cursor-pointer ${
                      isSelected
                        ? "ring-2 ring-white ring-offset-2 ring-offset-black scale-105"
                        : "opacity-80 hover:opacity-100"
                    }`}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11.5px] text-[#a1a1aa]">
            <Check size={13} className="text-[#34c3a0]" strokeWidth={2.5} />
            <span>{t("note_autosaved")}</span>
            <kbd className="px-1.5 py-0.5 rounded-[5px] border border-[#2a2a33] bg-[#101015] text-[10px] text-[#a1a1aa]">
              Esc
            </kbd>
          </div>
        </div>
      </div>
    );
  }

  // Horizontal Swipe Cards View (Image 1)
  return (
    <div className="flex flex-col w-full h-full min-h-0 px-6 pb-3 select-none text-white overflow-hidden">
      {/* Top Toolbar: Note count + Chevrons + Search + New Note Button */}
      <div className="flex items-center justify-between gap-2.5 mt-1 mb-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-white">
            {t("note_count", { count: notes.length })}
          </span>
          {pinnedCount > 0 && (
            <span className="text-[12px] text-[#a1a1aa]">
              {t("note_pinned_count", { count: pinnedCount })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Toolbar Navigation Chevrons if horizontal overflow exists */}
          {(canScrollLeft || canScrollRight) && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => scrollByAmount(-210)}
                disabled={!canScrollLeft}
                title={t("note_prev")}
                className="w-[30px] h-[30px] rounded-[9px] bg-[#121216] border border-[#1e1e25] flex items-center justify-center text-[#a1a1aa] hover:text-white hover:bg-[#1a1a22] disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => scrollByAmount(210)}
                disabled={!canScrollRight}
                title={t("note_next")}
                className="w-[30px] h-[30px] rounded-[9px] bg-[#121216] border border-[#1e1e25] flex items-center justify-center text-[#a1a1aa] hover:text-white hover:bg-[#1a1a22] disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          <div className="w-[185px] h-[32px] rounded-[10px] bg-[#121216] border border-[#1e1e25] px-2.5 flex items-center gap-1.5 focus-within:border-[#3882F6]/60 transition-colors">
            <Search size={13} className="text-[#a1a1aa] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("note_search_placeholder")}
              className="w-full bg-transparent text-[12px] text-white placeholder-[#71717a] outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-[#a1a1aa] hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleCreateNewNote}
            className="h-[32px] px-3.5 rounded-[10px] bg-[#3882F6] hover:bg-[#2563eb] text-white text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Plus size={14} strokeWidth={2.4} />
            <span>{t("note_new")}</span>
          </button>
        </div>
      </div>

      {/* Horizontal Swipe Note Cards Row with Chevrons and Gesture Isolation */}
      <div className="relative w-full shrink-0">
        {/* Floating Left Scroll Chevron */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scrollByAmount(-210);
            }}
            title={t("note_prev")}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#121216]/90 hover:bg-[#1f1f28] border border-[#2e2e38] backdrop-blur-md shadow-xl flex items-center justify-center text-[#d4d4d8] hover:text-white hover:scale-105 transition-all cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
        )}

        {/* Floating Right Scroll Chevron */}
        {canScrollRight && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scrollByAmount(210);
            }}
            title={t("note_next")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#121216]/90 hover:bg-[#1f1f28] border border-[#2e2e38] backdrop-blur-md shadow-xl flex items-center justify-center text-[#d4d4d8] hover:text-white hover:scale-105 transition-all cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        )}

        <div
          ref={cardsRowRef}
          data-scrollable="true"
          data-no-swipe="true"
          onScroll={updateScrollState}
          onWheel={(e) => {
            if (!cardsRowRef.current) return;
            e.stopPropagation();
            const el = cardsRowRef.current;
            const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (Math.abs(delta) > 0) {
              el.scrollLeft += delta;
              updateScrollState();
            }
          }}
          onMouseDown={(e) => {
            if (!cardsRowRef.current) return;
            if ((e.target as HTMLElement)?.closest("button")) return;
            e.stopPropagation();
            isDraggingRowRef.current = true;
            hasDraggedRef.current = false;
            dragStartXRef.current = e.clientX;
            scrollStartLeftRef.current = cardsRowRef.current.scrollLeft;
          }}
          className="notes-horizontal-scroll flex items-stretch gap-2.5 overflow-x-auto overflow-y-hidden no-scrollbar pb-0.5 shrink-0 cursor-grab active:cursor-grabbing select-none"
        >
          {sortedFilteredNotes.length === 0 ? (
            <div className="w-full h-[156px] flex flex-col items-center justify-center text-center text-[#71717a] border border-dashed border-[#1e1e25] rounded-[18px] px-4">
              <p className="text-[13px] font-medium text-[#a1a1aa]">
                {searchQuery ? t("note_empty_search") : t("note_empty_notes")}
              </p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-1.5 text-[12px] text-[#3882F6] hover:underline cursor-pointer"
                >
                  {t("note_clear")}
                </button>
              )}
            </div>
          ) : (
            sortedFilteredNotes.map((note) => {
              const preview = getNotePreviewText(note);
              const dotHex = NOTE_COLOR_MAP[note.color] || NOTE_COLOR_MAP.blue;

              return (
                <div
                  key={note.id}
                  onClick={() => {
                    if (hasDraggedRef.current) return;
                    setEditingNoteId(note.id);
                  }}
                  className={`group w-[196px] shrink-0 h-[156px] rounded-[18px] p-3.5 bg-[#101015] flex flex-col gap-1.5 cursor-pointer transition-all ${
                    note.pinned
                      ? "border border-[#3882F6]/80 hover:border-[#3882F6]"
                      : "border border-[#1e1e25] hover:border-[#3a3a43]"
                  }`}
                >
                  {/* Card Header: Color Dot + Pin | Timestamp or Hover Actions */}
                  <div className="flex items-center justify-between h-6 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        style={{ backgroundColor: dotHex }}
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                      />
                      {note.pinned && <Pin size={12} className="text-[#a1a1aa]" />}
                    </div>

                    <span className="text-[11px] text-[#a1a1aa] tabular-nums group-hover:hidden">
                      {formatCardTimestamp(note.updatedAt, optLanguage)}
                    </span>

                    <div className="hidden group-hover:flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleTogglePin(note.id, e)}
                        className={`w-[24px] h-[24px] rounded-[7px] flex items-center justify-center transition-colors cursor-pointer ${
                          note.pinned
                            ? "bg-[#3882F6]/20 text-[#3882F6]"
                            : "bg-[#1d1d25] hover:bg-[#2a2a35] text-[#d4d4d8]"
                        }`}
                      >
                        <Pin size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteNote(note.id, e)}
                        className="w-[24px] h-[24px] rounded-[7px] bg-[#1d1d25] hover:bg-rose-500/20 text-[#ff7b72] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Card Title */}
                  <div className="text-[14px] font-bold text-white truncate shrink-0">
                    {note.id === "note-default-1" &&
                    (note.title === "Catatan cepat Gili" || note.title === "Gili Quick Note")
                      ? t("note_default_title")
                      : (note.title || t("note_title"))}
                  </div>

                  {/* Card Preview Body */}
                  <p className="text-[12px] text-[#a1a1aa] leading-[1.42] line-clamp-4 overflow-hidden">
                    {note.id === "note-default-1" &&
                    (note.content.startsWith("Tekan Ctrl") || note.content.startsWith("Press Ctrl"))
                      ? t("note_default_content")
                      : (preview || t("note_placeholder"))}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * Quick Note Notch Card (`Ctrl + Shift + N`) — Image 3
 * ========================================================================== */
export interface QuickNoteNotchCardProps {
  onSave: (text: string, color: NoteColor, pinned: boolean) => void;
  onCancel: () => void;
  isLightMode?: boolean;
  shortcutLabel?: string;
  isIsland?: boolean;
}

export const QuickNoteNotchCard: React.FC<QuickNoteNotchCardProps> = ({
  onSave,
  onCancel,
  isLightMode = false,
  shortcutLabel = "CTRL ⇧ N",
  isIsland = false,
}) => {
  const [text, setText] = useState("");
  const [color, setColor] = useState<NoteColor>("blue");
  const [pinned, setPinned] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusInput = () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    };
    focusInput();
    const t1 = window.setTimeout(focusInput, 30);
    const t2 = window.setTimeout(focusInput, 80);
    const t3 = window.setTimeout(focusInput, 200);

    window.addEventListener("focus", focusInput);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener("focus", focusInput);
    };
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, true);
    };
  }, [onCancel]);

  const handleSubmit = () => {
    if (!text.trim()) {
      onCancel();
      return;
    }
    onSave(text, color, pinned);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className={`w-full h-full flex flex-col justify-between select-none ${
        isIsland ? "px-7 py-5" : "px-7 py-4"
      } ${isLightMode ? "text-[#1d1d1f]" : "text-white"}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Row: Icon + Label | Shortcut Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 ${
              isLightMode
                ? "bg-[#3882F6]/15 text-[#2563eb]"
                : "bg-[#3882F6]/20 text-[#60a5fa]"
            }`}
          >
            <StickyNote size={15} />
          </div>
          <span
            className={`text-[13px] font-semibold tracking-tight ${
              isLightMode ? "text-[#27272a]" : "text-[#e4e4e7]"
            }`}
          >
            {t("note_quick_title")}
          </span>
        </div>

        {shortcutLabel ? (
          <kbd
            className={`px-2 py-0.5 rounded-[6px] text-[10px] font-semibold tracking-wider font-mono ${
              isLightMode
                ? "border border-black/10 bg-black/[0.04] text-[#71717a]"
                : "border border-white/10 bg-white/[0.06] text-[#a1a1aa]"
            }`}
          >
            {shortcutLabel}
          </kbd>
        ) : null}
      </div>

      {/* Middle Input */}
      <div className="my-auto py-1">
        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder={t("note_quick_placeholder")}
          className={`w-full bg-transparent text-[16px] font-medium outline-none tracking-tight leading-normal ${
            isLightMode
              ? "text-[#18181b] placeholder-[#a1a1aa]"
              : "text-white placeholder-[#71717a]"
          }`}
        />
      </div>

      {/* Bottom Row: Color Dots + Pin Toggle | Cancel + Save Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {NOTE_COLORS.map((c) => {
              const isSelected = color === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: NOTE_COLOR_MAP[c] }}
                  className={`w-[18px] h-[18px] rounded-full transition-all cursor-pointer ${
                    isSelected
                      ? isLightMode
                        ? "ring-2 ring-[#2563eb] ring-offset-2 ring-offset-[#f4f4f5] scale-110 shadow-sm"
                        : "ring-2 ring-white ring-offset-2 ring-offset-[#0d0d12] scale-110 shadow-sm"
                      : "opacity-75 hover:opacity-100 hover:scale-105"
                  }`}
                  aria-label={c}
                />
              );
            })}
          </div>

          <div
            className={`w-[1px] h-[16px] ${
              isLightMode ? "bg-black/10" : "bg-white/10"
            }`}
          />

          <button
            type="button"
            onClick={() => setPinned((p) => !p)}
            className={`h-[28px] px-2.5 rounded-[8px] border text-[11.5px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              pinned
                ? isLightMode
                  ? "bg-[#3882F6]/15 border-[#3882F6]/40 text-[#2563eb]"
                  : "bg-[#3882F6]/20 border-[#3882F6]/50 text-[#93c5fd]"
                : isLightMode
                ? "bg-black/[0.04] border-black/10 text-[#52525b] hover:bg-black/[0.08] hover:text-[#18181b]"
                : "bg-white/[0.04] border-white/10 text-[#a1a1aa] hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <Pin size={12} className={pinned ? "fill-current" : ""} />
            <span>{pinned ? t("note_pinned_btn") : t("note_pin_btn")}</span>
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className={`text-[12px] font-medium transition-colors cursor-pointer px-2.5 py-1 rounded-[6px] ${
              isLightMode
                ? "text-[#71717a] hover:text-[#18181b] hover:bg-black/[0.05]"
                : "text-[#a1a1aa] hover:text-white hover:bg-white/[0.06]"
            }`}
          >
            {t("note_cancel")}
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            className="h-[30px] pl-3 pr-2.5 rounded-[8px] bg-[#3882F6] hover:bg-[#2563eb] active:scale-95 text-white text-[12px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-[#3882F6]/25"
          >
            <span>{t("note_save")}</span>
            <kbd className="px-1.5 py-0.5 rounded-[4px] bg-black/25 border border-white/20 text-[9.5px] font-medium tracking-tight">
              Enter
            </kbd>
          </button>
        </div>
      </div>
    </motion.div>
  );
};
