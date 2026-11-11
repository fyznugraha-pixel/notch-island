import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { TodoItem } from "./todoUtils";
import {
  MiniNoteItem,
  NoteColor,
  loadMiniNotes,
  saveMiniNotes,
  notifyNotesUpdated,
} from "./noteUtils";
import { getCurrentMedia } from "./mediaLyricsStore";
import { logDrink } from "./waterService";
import { playTaskCompleteSound } from "./soundService";

export type GiliActionType =
  | "add_todo"
  | "complete_todo"
  | "create_note"
  | "control_pomodoro"
  | "control_music"
  | "log_water";

export interface GiliActionPayload {
  action: GiliActionType;
  params: Record<string, any>;
}

export interface GiliActionResult {
  type: GiliActionType;
  success: boolean;
  message: string;
  tabTarget?: string;
  data?: any;
}

/**
 * Returns a live context summary of active Gili Notch features to inject into the AI system instruction.
 */
export function getNotchRealtimeContext(): string {
  const parts: string[] = [];

  // 1. Current Date & Time
  const now = new Date();
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  parts.push(`Waktu Lokal: ${dateStr}`);

  // 2. Active Media Playback
  try {
    const media = getCurrentMedia();
    if (media && media.title) {
      const status = media.is_playing ? "Sedang diputar" : "Dijeda";
      parts.push(`Musik Aktif (${status}): "${media.title}" oleh ${media.artist || "Artis Tidak Diketahui"}`);
    } else {
      parts.push("Musik Aktif: Tidak ada media yang sedang diputar.");
    }
  } catch {}

  // 3. Pending Todos
  try {
    const raw = localStorage.getItem("island_todo_list");
    if (raw) {
      const parsed: TodoItem[] = JSON.parse(raw);
      const pending = parsed.filter((t) => !t.completed);
      if (pending.length > 0) {
        const top3 = pending.slice(0, 3).map((t) => `"${t.text}"`).join(", ");
        parts.push(`To-Do List: ${pending.length} tugas belum selesai (teratas: ${top3})`);
      } else {
        parts.push("To-Do List: Semua tugas selesai atau daftar masih kosong.");
      }
    }
  } catch {}

  // 4. Mini Notes
  try {
    const notes = loadMiniNotes();
    if (notes.length > 0) {
      parts.push(`Mini Note: ${notes.length} catatan tersimpan (terbaru: "${notes[0].title || "Tanpa Judul"}")`);
    }
  } catch {}

  // 5. Pomodoro Timer State
  try {
    const rawPomo = localStorage.getItem("gili_pomodoro_live_state");
    if (rawPomo) {
      const parsed = JSON.parse(rawPomo);
      if (parsed.isRunning) {
        const min = Math.floor((parsed.remainingSec || 0) / 60);
        const sec = (parsed.remainingSec || 0) % 60;
        parts.push(`Pomodoro Timer: Aktif (${parsed.mode || "focus"}), sisa waktu ${min}m ${sec}s`);
      } else {
        parts.push("Pomodoro Timer: Sedang tidak berjalan (Idle)");
      }
    }
  } catch {}

  return parts.join("\n");
}

/**
 * System instruction addition that grants the AI awareness and capability to execute Gili Notch actions.
 */
export function getNotchSystemInstruction(): string {
  const realtimeContext = getNotchRealtimeContext();

  return `
[INTEGRASI FITUR GILI NOTCH]:
Kamu terintegrasi langsung dengan fitur Gili Desktop Notch di Windows.
Berikut status terkini sistem notch pengguna:
${realtimeContext}

KEMAMPUAN AKSI OTOMATIS:
Jika pengguna meminta aksi terkait fitur notch (misalnya: membuat to-do, mencatat sesuatu, memutar/menghentikan musik, memulai pomodoro, atau mencatat minum air), kamu WAJIB menyertakan blok kode aksi \`\`\`gili_action di akhir jawabanmu dengan format JSON:

\`\`\`gili_action
{ "action": "add_todo", "params": { "text": "Nama tugas", "dueAt": "2026-11-12T08:00:00" } }
\`\`\`

Daftar Aksi yang Tersedia:
1. add_todo: params { "text": string, "dueAt"?: string } -> Menambah tugas ke tab To-Do.
2. complete_todo: params { "query": string } -> Menandai tugas to-do selesai berdasarkan teks/nama tugas.
3. create_note: params { "title": string, "content": string, "color"?: "blue"|"mint"|"amber"|"coral" } -> Membuat catatan baru di Mini Note.
4. control_pomodoro: params { "action": "start"|"pause"|"reset"|"skip", "minutes"?: number } -> Mengontrol timer Pomodoro fokus/istirahat.
5. control_music: params { "action": "play"|"pause"|"toggle"|"next"|"prev" } -> Mengontrol pemutar musik Windows (Spotify/Browser).
6. log_water: params { "amountMl"?: number } -> Mencatat minum air (default 250 ml) di Water Reminder.

Selalu berikan respon teks yang ramah dan singkat yang mengonfirmasi bahwa aksinya telah diproses.
`;
}

/**
 * Executes a single Gili action and triggers corresponding app events / storage updates.
 */
export async function executeGiliAction(action: GiliActionPayload): Promise<GiliActionResult> {
  const { action: type, params } = action;

  switch (type) {
    case "add_todo": {
      const text = (params.text || "").trim();
      if (!text) {
        return { type, success: false, message: "Teks tugas to-do tidak boleh kosong" };
      }

      let dueAtMs: number | null = null;
      if (params.dueAt) {
        const parsed = Date.parse(params.dueAt);
        if (!isNaN(parsed)) dueAtMs = parsed;
      }

      const newItem: TodoItem = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text,
        completed: false,
        createdAt: Date.now(),
        dueAt: dueAtMs,
        reminders: dueAtMs ? [0, 10] : [],
      };

      try {
        const raw = localStorage.getItem("island_todo_list");
        const list: TodoItem[] = raw ? JSON.parse(raw) : [];
        const updated = [newItem, ...list];
        localStorage.setItem("island_todo_list", JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent("gili_todos_updated"));
        return {
          type,
          success: true,
          message: `Tugas "${text}" berhasil ditambahkan ke To-Do List`,
          tabTarget: "todo",
          data: newItem,
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || "Gagal menyimpan to-do" };
      }
    }

    case "complete_todo": {
      const query = (params.query || "").toLowerCase().trim();
      if (!query) {
        return { type, success: false, message: "Nama tugas untuk diselesaikan tidak boleh kosong" };
      }

      try {
        const raw = localStorage.getItem("island_todo_list");
        if (!raw) return { type, success: false, message: "Daftar to-do kosong" };
        const list: TodoItem[] = JSON.parse(raw);
        const target = list.find((t) => !t.completed && t.text.toLowerCase().includes(query));
        if (!target) {
          return { type, success: false, message: `Tidak menemukan tugas yang cocok dengan "${query}"` };
        }

        target.completed = true;
        target.lastCompletedAt = Date.now();
        localStorage.setItem("island_todo_list", JSON.stringify(list));
        window.dispatchEvent(new CustomEvent("gili_todos_updated"));
        playTaskCompleteSound();

        return {
          type,
          success: true,
          message: `Tugas "${target.text}" telah ditandai selesai!`,
          tabTarget: "todo",
          data: target,
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || "Gagal memperbarui to-do" };
      }
    }

    case "create_note": {
      const content = (params.content || "").trim();
      const title = (params.title || "").trim() || (content.split("\n")[0].slice(0, 30) || "Catatan AI");
      if (!content && !title) {
        return { type, success: false, message: "Isi catatan tidak boleh kosong" };
      }

      const validColors: NoteColor[] = ["blue", "mint", "amber", "coral"];
      const color: NoteColor = validColors.includes(params.color) ? params.color : "blue";

      const newNote: MiniNoteItem = {
        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        content: content || title,
        color,
        pinned: false,
        isChecklist: false,
        checklist: [],
        updatedAt: Date.now(),
      };

      try {
        const notes = loadMiniNotes();
        const updated = [newNote, ...notes];
        saveMiniNotes(updated);
        notifyNotesUpdated();
        return {
          type,
          success: true,
          message: `Catatan "${title}" berhasil disimpan di Mini Note`,
          tabTarget: "mini_note",
          data: newNote,
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || "Gagal menyimpan catatan" };
      }
    }

    case "control_pomodoro": {
      const action = (params.action || "start").toLowerCase();
      const minutes = Number(params.minutes);

      try {
        window.dispatchEvent(
          new CustomEvent("gili_pomodoro_action", {
            detail: { action, durationMinutes: !isNaN(minutes) && minutes > 0 ? minutes : undefined },
          })
        );
        emit("gili-pomodoro-action", action).catch(() => {});

        let msg = "Timer Pomodoro dijalankan";
        if (action === "pause") msg = "Timer Pomodoro dijeda";
        else if (action === "reset") msg = "Timer Pomodoro di-reset";
        else if (action === "skip") msg = "Sesi Pomodoro dilewati";
        else if (!isNaN(minutes) && minutes > 0) msg = `Timer Pomodoro ${minutes} menit dimulai`;

        return {
          type,
          success: true,
          message: msg,
          tabTarget: "pomodoro",
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || "Gagal mengontrol Pomodoro" };
      }
    }

    case "control_music": {
      const action = (params.action || "toggle").toLowerCase();
      const validActions = ["play", "pause", "toggle", "next", "prev"];
      if (!validActions.includes(action)) {
        return { type, success: false, message: `Aksi musik "${action}" tidak valid` };
      }

      try {
        await invoke("smtc_action", { action });
        let msg = "Playback musik diubah";
        if (action === "play") msg = "Musik diputar";
        else if (action === "pause") msg = "Musik dijeda";
        else if (action === "next") msg = "Memutar lagu berikutnya";
        else if (action === "prev") msg = "Kembali ke lagu sebelumnya";
        else if (action === "toggle") msg = "Status putar/jeda musik dialihkan";

        return {
          type,
          success: true,
          message: msg,
          tabTarget: "media_expanded",
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || "Tidak ada pemutar musik aktif di sistem" };
      }
    }

    case "log_water": {
      const amount = Number(params.amountMl) || 250;
      try {
        logDrink(amount, false);
        return {
          type,
          success: true,
          message: `Berhasil mencatat minum ${amount} ml air!`,
          tabTarget: "water_reminder",
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || "Gagal mencatat minum air" };
      }
    }
  }

  return { type, success: false, message: "Aksi tidak dikenal" };
}

/**
 * Parses raw text from AI, extracts ```gili_action ... ``` blocks, executes them,
 * and returns the sanitized user-facing text along with execution results.
 */
export async function parseAndExecuteGiliActions(
  rawText: string
): Promise<{ cleanText: string; results: GiliActionResult[] }> {
  const actionRegex = /```(?:gili_action|gili-action|action)\s*([\s\S]*?)\s*```/gi;
  const results: GiliActionResult[] = [];

  let match: RegExpExecArray | null;
  while ((match = actionRegex.exec(rawText)) !== null) {
    const jsonStr = match[1].trim();
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.action) {
        const res = await executeGiliAction(parsed);
        results.push(res);
      }
    } catch {
      // If JSON is malformed, ignore
    }
  }

  // Remove the action block from the clean text shown to user
  const cleanText = rawText.replace(actionRegex, "").trim();

  return { cleanText, results };
}
