import { t, getLanguage } from "./i18n";

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

export function deleteQuickNoteItem(id: string): void {
  const existing = loadMiniNotes();
  saveMiniNotes(existing.filter((n) => n.id !== id));
  notifyNotesUpdated();
}

