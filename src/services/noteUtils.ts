import { t, getLanguage } from "./i18n";
import { emitCrossWindowEvent } from "../utils/crossWindowSync";

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

export const MINI_NOTES_STORAGE_KEY = "gili_mini_notes_v2";
const STORAGE_KEY = MINI_NOTES_STORAGE_KEY;
const LEGACY_QUICK_NOTES_KEY = "gili_quick_notes";

function migrateLegacyQuickNotes(existingNotes: MiniNoteItem[] | null): MiniNoteItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const legacyRaw = localStorage.getItem(LEGACY_QUICK_NOTES_KEY);
    if (legacyRaw === null) return null;
    localStorage.removeItem(LEGACY_QUICK_NOTES_KEY);
    const parsedLegacy = JSON.parse(legacyRaw);
    if (!Array.isArray(parsedLegacy)) return null;

    const base = existingNotes ?? [];
    const existingIds = new Set(base.map((n) => n.id));
    const migrated: MiniNoteItem[] = [];

    for (const q of parsedLegacy) {
      if (!q || typeof q !== "object") continue;
      const rawContent = typeof q.content === "string" ? q.content : "";
      const rawTitle = typeof q.title === "string" ? q.title.trim() : "";
      if (!rawContent.trim() && !rawTitle) continue;
      const id =
        typeof q.id === "string" && q.id
          ? q.id
          : `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      if (existingIds.has(id)) continue;
      migrated.push({
        id,
        title: rawTitle ? rawTitle.slice(0, 64) : t("note_title"),
        content: rawContent,
        color: "blue",
        pinned: false,
        isChecklist: false,
        checklist: [],
        updatedAt: typeof q.updatedAt === "number" ? q.updatedAt : Date.now(),
      });
      existingIds.add(id);
    }

    if (migrated.length === 0) return null;
    const merged = [...migrated, ...base];
    saveMiniNotes(merged);
    return merged;
  } catch {
    return null;
  }
}

export function loadMiniNotes(): MiniNoteItem[] {
  let parsedExisting: MiniNoteItem[] | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsedExisting = parsed;
      }
    }
  } catch {
    // ignore
  }

  const migrated = migrateLegacyQuickNotes(parsedExisting);
  if (migrated) {
    return migrated;
  }
  if (parsedExisting !== null) {
    return parsedExisting;
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

export function getMiniNoteDisplayText(note: MiniNoteItem): string {
  if (note.content?.trim()) return note.content.trim();
  if (note.title?.trim()) return note.title.trim();
  return (note.checklist || [])
    .map((c) => c.text)
    .filter(Boolean)
    .join(", ");
}

export function saveMiniNotes(notes: MiniNoteItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // ignore
  }
}

export function notifyNotesUpdated(): void {
  emitCrossWindowEvent("gili_notes_updated");
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

