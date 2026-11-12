import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { TodoItem, TodoRepeatRule } from "./todoUtils";
import {
  MiniNoteItem,
  NoteColor,
  loadMiniNotes,
  saveMiniNotes,
  notifyNotesUpdated,
} from "./noteUtils";
import { getCurrentMedia } from "./mediaLyricsStore";
import {
  logDrink,
  undoLastDrink,
  getDailyIntake,
  getStreakInfo,
  loadWaterData,
} from "./waterService";
import {
  getImmediatePrayerSchedule,
  getNextPrayerStatus,
  getCompletedPrayersForDate,
  togglePrayerCompleted,
  getPrayerDisplayName,
  PRAYER_ORDER,
  type PrayerId,
} from "./prayerService";
import { getInitialShelfFiles } from "./shelfService";
import { playTaskCompleteSound } from "./soundService";
import { t, getLanguage } from "./i18n";

export type GiliActionType =
  | "add_todo"
  | "complete_todo"
  | "delete_todo"
  | "create_note"
  | "update_note"
  | "delete_note"
  | "control_pomodoro"
  | "control_music"
  | "log_water"
  | "undo_water"
  | "mark_prayer"
  | "set_system_control"
  | "open_tab";

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
  const isEn = getLanguage() === "en";
  const parts: string[] = [];

  // 1. Current Date & Time
  const now = new Date();
  const daysId = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthsId = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const monthsEn = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const days = isEn ? daysEn : daysId;
  const months = isEn ? monthsEn : monthsId;
  const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  parts.push(isEn ? `1. Local Time: ${dateStr}` : `1. Waktu Lokal: ${dateStr}`);

  // 2. Active Media Playback
  try {
    const media = getCurrentMedia();
    if (media && media.title) {
      const status = isEn
        ? (media.is_playing ? "Playing" : "Paused")
        : (media.is_playing ? "Sedang diputar" : "Dijeda");
      const unknownArtist = isEn ? "Unknown Artist" : "Artis Tidak Diketahui";
      parts.push(
        isEn
          ? `2. Active Music (${status}): "${media.title}" by ${media.artist || unknownArtist}`
          : `2. Musik Aktif (${status}): "${media.title}" oleh ${media.artist || unknownArtist}`
      );
    } else {
      parts.push(
        isEn
          ? "2. Active Music: No media currently playing."
          : "2. Musik Aktif: Tidak ada media yang sedang diputar."
      );
    }
  } catch {}

  // 3. To-Do List (Full active tasks + deadlines + completed count)
  try {
    const raw = localStorage.getItem("island_todo_list");
    if (raw) {
      const parsed: TodoItem[] = JSON.parse(raw);
      const pending = parsed.filter((item) => !item.completed);
      const completedCount = parsed.filter((item) => item.completed).length;
      if (pending.length > 0) {
        const listStr = pending
          .slice(0, 10)
          .map((item, idx) => {
            const dueStr = item.dueAt
              ? ` (due: ${new Date(item.dueAt).toLocaleString(isEn ? "en-US" : "id-ID", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })})`
              : "";
            const repStr = item.repeat && item.repeat !== "none" ? ` [${item.repeat}]` : "";
            return `${idx + 1}. "${item.text}"${dueStr}${repStr}`;
          })
          .join("; ");
        parts.push(
          isEn
            ? `3. To-Do List (${pending.length} pending, ${completedCount} completed): ${listStr}`
            : `3. To-Do List (${pending.length} belum selesai, ${completedCount} selesai): ${listStr}`
        );
      } else {
        parts.push(
          isEn
            ? `3. To-Do List: 0 pending tasks (${completedCount} completed).`
            : `3. To-Do List: 0 tugas belum selesai (${completedCount} selesai).`
        );
      }
    }
  } catch {}

  // 4. Mini Notes (Titles + Content snippets so AI can read user notes)
  try {
    const notes = loadMiniNotes();
    if (notes.length > 0) {
      const untitled = isEn ? "Untitled" : "Tanpa Judul";
      const noteSummaries = notes
        .slice(0, 5)
        .map((n, idx) => {
          const bodyPreview = n.isChecklist && n.checklist?.length
            ? n.checklist.map((c) => `[${c.checked ? "x" : " "}] ${c.text}`).join(", ").slice(0, 120)
            : (n.content || "").replace(/\s+/g, " ").trim().slice(0, 120);
          return `${idx + 1}. "${n.title || untitled}"${n.pinned ? " (pinned)" : ""}: ${bodyPreview}`;
        })
        .join(" | ");
      parts.push(
        isEn
          ? `4. Mini Notes (${notes.length} saved): ${noteSummaries}`
          : `4. Mini Note (${notes.length} catatan): ${noteSummaries}`
      );
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
        parts.push(
          isEn
            ? `5. Pomodoro Timer: Active (${parsed.mode || "focus"}), time left ${min}m ${sec}s`
            : `5. Pomodoro Timer: Aktif (${parsed.mode || "focus"}), sisa waktu ${min}m ${sec}s`
        );
      } else {
        parts.push(
          isEn
            ? "5. Pomodoro Timer: Not running (Idle)"
            : "5. Pomodoro Timer: Sedang tidak berjalan (Idle)"
        );
      }
    }
  } catch {}

  // 6. Water Reminder & Hydration Progress
  try {
    const waterData = loadWaterData();
    const daily = getDailyIntake(now, waterData);
    const streak = getStreakInfo(waterData, now);
    const remainingMl = Math.max(0, daily.targetMl - daily.totalMl);
    parts.push(
      isEn
        ? `6. Water Reminder Today: ${daily.totalMl} / ${daily.targetMl} ml (${daily.percent}%, ${daily.drinkCount} drinks logged, ${remainingMl} ml remaining to target, streak: ${streak.currentStreak} days)`
        : `6. Water Reminder Hari Ini: ${daily.totalMl} / ${daily.targetMl} ml (${daily.percent}%, ${daily.drinkCount}x minum, kurang ${remainingMl} ml lagi dari target, streak: ${streak.currentStreak} hari)`
    );
  } catch {}

  // 7. Prayer Reminder Schedule
  try {
    const schedule = getImmediatePrayerSchedule();
    const nextStatus = getNextPrayerStatus(schedule, now);
    const completedToday = getCompletedPrayersForDate();
    const timingsStr = PRAYER_ORDER.map((id) => {
      const label = getPrayerDisplayName(id);
      const done = completedToday.includes(id) ? "✓" : "";
      return `${label} ${schedule.timings[id]}${done}`;
    }).join(", ");
    const nextName = getPrayerDisplayName(nextStatus.nextPrayer);
    parts.push(
      isEn
        ? `7. Prayer Schedule (${schedule.locationName}): ${timingsStr} | Next: ${nextName} at ${nextStatus.nextPrayerTime} (in ${nextStatus.countdownText})`
        : `7. Jadwal Sholat (${schedule.locationName}): ${timingsStr} | Berikutnya: ${nextName} pukul ${nextStatus.nextPrayerTime} (${nextStatus.countdownText} lagi)`
    );
  } catch {}

  // 8. Drop Shelf & Recent Clipboard
  try {
    const shelfFiles = getInitialShelfFiles();
    if (shelfFiles.length > 0) {
      const names = shelfFiles.slice(0, 5).map((f) => `"${f.name}"`).join(", ");
      parts.push(
        isEn
          ? `8. Drop Shelf: ${shelfFiles.length} stashed files (${names})`
          : `8. Drop Shelf: ${shelfFiles.length} file tersimpan (${names})`
      );
    }
  } catch {}

  try {
    const rawClip = localStorage.getItem("island_clipboard_history");
    if (rawClip) {
      const parsedClip = JSON.parse(rawClip);
      if (Array.isArray(parsedClip) && parsedClip.length > 0) {
        const recentTexts = parsedClip
          .filter((c: any) => c.type !== "image" && c.text)
          .slice(0, 3)
          .map((c: any, i: number) => `#${i + 1}: "${String(c.text).replace(/\s+/g, " ").trim().slice(0, 80)}"`)
          .join(" | ");
        if (recentTexts) {
          parts.push(
            isEn
              ? `9. Recent Clipboard History: ${recentTexts}`
              : `9. Riwayat Clipboard Terbaru: ${recentTexts}`
          );
        }
      }
    }
  } catch {}

  return parts.join("\n");
}

/**
 * System instruction addition that grants the AI awareness and capability to execute Gili Notch actions.
 */
export function getNotchSystemInstruction(): string {
  const isEn = getLanguage() === "en";
  const realtimeContext = getNotchRealtimeContext();

  if (isEn) {
    return `
[GILI NOTCH FEATURE INTEGRATION]:
You are directly integrated with all Gili Desktop Notch features on Windows.
Here is the live state of the user's notch system:
${realtimeContext}

AUTOMATED ACTION CAPABILITY:
Whenever the user requests an action related to any Gili Notch feature, you MUST include one or more \`\`\`gili_action code blocks at the VERY END of your response in valid JSON format:

\`\`\`gili_action
{ "action": "add_todo", "params": { "text": "Task name", "dueAt": "2026-11-12T08:00:00" } }
\`\`\`

Available Actions:
1. add_todo: params { "text": string, "dueAt"?: string, "repeat"?: "none"|"daily"|"weekdays"|"weekly"|"monthly" } -> Add task to To-Do List.
2. complete_todo: params { "query": string } -> Mark a pending to-do task complete matching text/name.
3. delete_todo: params { "query": string } -> Delete a task from To-Do List matching text/name.
4. create_note: params { "title": string, "content": string, "color"?: "blue"|"mint"|"amber"|"coral", "pinned"?: boolean } -> Create a new note in Mini Note.
5. update_note: params { "query": string, "title"?: string, "content": string, "append"?: boolean } -> Update or append content to an existing Mini Note matching query.
6. delete_note: params { "query": string } -> Delete a note from Mini Note matching title/content.
7. control_pomodoro: params { "action": "start"|"pause"|"reset"|"skip", "minutes"?: number, "mode"?: "focus"|"shortBreak"|"longBreak" } -> Control Pomodoro timer.
8. control_music: params { "action": "play"|"pause"|"toggle"|"next"|"prev" } -> Control Windows media player (Spotify/Browser/etc).
9. log_water: params { "amountMl"?: number } -> Log water intake (default 250 ml) in Water Reminder.
10. undo_water: params {} -> Undo the most recent water intake log.
11. mark_prayer: params { "prayer": "Fajr"|"Dhuhr"|"Asr"|"Maghrib"|"Isha" } -> Toggle prayer completion for today in Prayer Reminder.
12. set_system_control: params { "focusMode"?: "Normal"|"DND"|"Gaming"|"Sleep", "volume"?: number, "brightness"?: number } -> Change Focus/DND mode, master volume (0-100), or screen brightness (0-100).
13. open_tab: params { "tab": "quick_control"|"media_expanded"|"ai_chat"|"clipboard"|"todo"|"pomodoro"|"drop_shelf"|"sys_monitor"|"mini_note"|"water_reminder"|"prayer_reminder"|"volume_mixer"|"notif_center"|"settings" } -> Directly open a specific Gili Notch panel/tab when the user asks to open or view it.

Always provide a concise, friendly text response confirming the action before the \`\`\`gili_action block.
`;
  }

  return `
[INTEGRASI FITUR GILI NOTCH]:
Kamu terintegrasi langsung dengan seluruh fitur Gili Desktop Notch di Windows.
Berikut status real-time sistem notch pengguna saat ini:
${realtimeContext}

KEMAMPUAN AKSI OTOMATIS:
Jika pengguna meminta aksi terkait fitur notch mana pun, kamu WAJIB menyertakan satu atau lebih blok kode aksi \`\`\`gili_action di paling akhir jawabanmu dengan format JSON yang valid:

\`\`\`gili_action
{ "action": "add_todo", "params": { "text": "Nama tugas", "dueAt": "2026-11-12T08:00:00" } }
\`\`\`

Daftar Aksi yang Tersedia:
1. add_todo: params { "text": string, "dueAt"?: string, "repeat"?: "none"|"daily"|"weekdays"|"weekly"|"monthly" } -> Menambah tugas ke To-Do List.
2. complete_todo: params { "query": string } -> Menandai tugas To-Do selesai berdasarkan kata kunci nama tugas.
3. delete_todo: params { "query": string } -> Menghapus tugas dari To-Do List berdasarkan kata kunci nama tugas.
4. create_note: params { "title": string, "content": string, "color"?: "blue"|"mint"|"amber"|"coral", "pinned"?: boolean } -> Membuat catatan baru di Mini Note.
5. update_note: params { "query": string, "title"?: string, "content": string, "append"?: boolean } -> Mengubah atau menambahkan isi ke catatan Mini Note yang cocok dengan query.
6. delete_note: params { "query": string } -> Menghapus catatan di Mini Note berdasarkan judul/isi.
7. control_pomodoro: params { "action": "start"|"pause"|"reset"|"skip", "minutes"?: number, "mode"?: "focus"|"shortBreak"|"longBreak" } -> Mengontrol timer Pomodoro fokus/istirahat.
8. control_music: params { "action": "play"|"pause"|"toggle"|"next"|"prev" } -> Mengontrol pemutar musik Windows (Spotify/Browser/dll).
9. log_water: params { "amountMl"?: number } -> Mencatat minum air (default 250 ml) di Water Reminder.
10. undo_water: params {} -> Membatalkan catatan minum air terakhir di Water Reminder.
11. mark_prayer: params { "prayer": "Fajr"|"Dhuhr"|"Asr"|"Maghrib"|"Isha" } -> Menandai sholat hari ini sudah dikerjakan di Jadwal Sholat (Subuh=Fajr, Dzuhur=Dhuhr, Ashar=Asr, Maghrib=Maghrib, Isya=Isha).
12. set_system_control: params { "focusMode"?: "Normal"|"DND"|"Gaming"|"Sleep", "volume"?: number, "brightness"?: number } -> Mengatur Mode Fokus/DND, volume suara (0-100), atau kecerahan layar (0-100).
13. open_tab: params { "tab": "quick_control"|"media_expanded"|"ai_chat"|"clipboard"|"todo"|"pomodoro"|"drop_shelf"|"sys_monitor"|"mini_note"|"water_reminder"|"prayer_reminder"|"volume_mixer"|"notif_center"|"settings" } -> Membuka panel/tab fitur Notch secara langsung saat pengguna meminta membuka fitur tersebut.

Selalu berikan respon teks yang ramah dan singkat sebelum blok \`\`\`gili_action.
`;
}

function resolvePrayerId(input: string): PrayerId | null {
  const norm = (input || "").trim().toLowerCase();
  if (!norm) return null;
  if (norm.includes("fajr") || norm.includes("subuh") || norm.includes("shubuh")) return "Fajr";
  if (norm.includes("dhuhr") || norm.includes("dzuhur") || norm.includes("zuhur") || norm.includes("lohor")) return "Dhuhr";
  if (norm.includes("asr") || norm.includes("ashar") || norm.includes("asar")) return "Asr";
  if (norm.includes("maghrib") || norm.includes("magrib")) return "Maghrib";
  if (norm.includes("isha") || norm.includes("isya")) return "Isha";
  return null;
}

const TAB_DISPLAY_NAMES: Record<string, { en: string; id: string }> = {
  quick_control: { en: "Control Center", id: "Control Center" },
  media_expanded: { en: "Music Player", id: "Pemutar Musik" },
  ai_chat: { en: "AI Chat", id: "AI Chat" },
  clipboard: { en: "Clipboard History", id: "Riwayat Clipboard" },
  todo: { en: "To-Do List", id: "To-Do List" },
  pomodoro: { en: "Pomodoro Timer", id: "Timer Pomodoro" },
  drop_shelf: { en: "Drop Shelf", id: "Drop Shelf" },
  sys_monitor: { en: "System Monitor", id: "System Monitor" },
  mini_note: { en: "Mini Note", id: "Mini Note" },
  water_reminder: { en: "Water Reminder", id: "Water Reminder" },
  prayer_reminder: { en: "Prayer Schedule", id: "Jadwal Sholat" },
  volume_mixer: { en: "Volume Mixer", id: "Volume Mixer" },
  notif_center: { en: "Notification Center", id: "Pusat Notifikasi" },
  settings: { en: "Settings", id: "Pengaturan" },
};

/**
 * Executes a single Gili action and triggers corresponding app events / storage updates.
 */
export async function executeGiliAction(action: GiliActionPayload): Promise<GiliActionResult> {
  const { action: type, params = {} } = action;

  switch (type) {
    case "add_todo": {
      const text = (params.text || "").trim();
      if (!text) {
        return { type, success: false, message: t("aichat_tool_todo_empty_text") };
      }

      let dueAtMs: number | null = null;
      if (params.dueAt) {
        const parsed = Date.parse(params.dueAt);
        if (!isNaN(parsed)) dueAtMs = parsed;
      }

      const validRepeats: TodoRepeatRule[] = ["none", "daily", "weekdays", "weekly", "monthly"];
      const repeat: TodoRepeatRule | undefined = validRepeats.includes(params.repeat)
        ? params.repeat
        : undefined;

      const newItem: TodoItem = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text,
        completed: false,
        createdAt: Date.now(),
        dueAt: dueAtMs,
        reminders: dueAtMs ? [0, 10] : [],
        repeat: repeat && repeat !== "none" ? repeat : undefined,
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
          message: t("aichat_tool_todo_added", { text }),
          tabTarget: "todo",
          data: newItem,
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || t("aichat_tool_todo_save_fail") };
      }
    }

    case "complete_todo": {
      const query = (params.query || "").toLowerCase().trim();
      if (!query) {
        return { type, success: false, message: t("aichat_tool_todo_empty_query") };
      }

      try {
        const raw = localStorage.getItem("island_todo_list");
        if (!raw) return { type, success: false, message: t("aichat_tool_todo_list_empty") };
        const list: TodoItem[] = JSON.parse(raw);
        const target = list.find((item) => !item.completed && item.text.toLowerCase().includes(query));
        if (!target) {
          return { type, success: false, message: t("aichat_tool_todo_not_found", { query }) };
        }

        target.completed = true;
        target.lastCompletedAt = Date.now();
        localStorage.setItem("island_todo_list", JSON.stringify(list));
        window.dispatchEvent(new CustomEvent("gili_todos_updated"));
        playTaskCompleteSound();

        return {
          type,
          success: true,
          message: t("aichat_tool_todo_completed", { text: target.text }),
          tabTarget: "todo",
          data: target,
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || t("aichat_tool_todo_update_fail") };
      }
    }

    case "delete_todo": {
      const query = (params.query || "").toLowerCase().trim();
      if (!query) {
        return { type, success: false, message: t("aichat_tool_todo_empty_query") };
      }

      try {
        const raw = localStorage.getItem("island_todo_list");
        if (!raw) return { type, success: false, message: t("aichat_tool_todo_list_empty") };
        const list: TodoItem[] = JSON.parse(raw);
        const target = list.find((item) => item.text.toLowerCase().includes(query));
        if (!target) {
          return { type, success: false, message: t("aichat_tool_todo_not_found", { query }) };
        }

        const updated = list.filter((item) => item.id !== target.id);
        localStorage.setItem("island_todo_list", JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent("gili_todos_updated"));

        return {
          type,
          success: true,
          message: t("aichat_tool_todo_deleted", { text: target.text }),
          tabTarget: "todo",
          data: target,
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || t("aichat_tool_todo_update_fail") };
      }
    }

    case "create_note": {
      const content = (params.content || "").trim();
      const title =
        (params.title || "").trim() ||
        content.split("\n")[0].slice(0, 30) ||
        (getLanguage() === "en" ? "AI Note" : "Catatan AI");
      if (!content && !title) {
        return { type, success: false, message: t("aichat_tool_note_empty") };
      }

      const validColors: NoteColor[] = ["blue", "mint", "amber", "coral"];
      const color: NoteColor = validColors.includes(params.color) ? params.color : "blue";

      const newNote: MiniNoteItem = {
        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        content: content || title,
        color,
        pinned: Boolean(params.pinned),
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
          message: t("aichat_tool_note_saved", { title }),
          tabTarget: "mini_note",
          data: newNote,
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || t("aichat_tool_note_save_fail") };
      }
    }

    case "update_note": {
      const query = (params.query || "").toLowerCase().trim();
      const newContent = (params.content || "").trim();
      const newTitle = (params.title || "").trim();
      const append = Boolean(params.append);

      try {
        const notes = loadMiniNotes();
        const target =
          notes.find(
            (n) =>
              n.title.toLowerCase().includes(query) ||
              n.content.toLowerCase().includes(query)
          ) || notes[0];
        if (!target) {
          return { type, success: false, message: t("aichat_tool_note_not_found", { query }) };
        }

        if (newTitle) target.title = newTitle;
        if (newContent) {
          target.content = append && target.content
            ? `${target.content}\n${newContent}`
            : newContent;
        }
        target.updatedAt = Date.now();
        saveMiniNotes([...notes]);
        notifyNotesUpdated();

        return {
          type,
          success: true,
          message: t("aichat_tool_note_updated", { title: target.title }),
          tabTarget: "mini_note",
          data: target,
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || t("aichat_tool_note_save_fail") };
      }
    }

    case "delete_note": {
      const query = (params.query || "").toLowerCase().trim();
      if (!query) {
        return { type, success: false, message: t("aichat_tool_note_not_found", { query }) };
      }

      try {
        const notes = loadMiniNotes();
        const target = notes.find(
          (n) =>
            n.title.toLowerCase().includes(query) ||
            n.content.toLowerCase().includes(query)
        );
        if (!target) {
          return { type, success: false, message: t("aichat_tool_note_not_found", { query }) };
        }

        saveMiniNotes(notes.filter((n) => n.id !== target.id));
        notifyNotesUpdated();

        return {
          type,
          success: true,
          message: t("aichat_tool_note_deleted", { title: target.title }),
          tabTarget: "mini_note",
          data: target,
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || t("aichat_tool_note_save_fail") };
      }
    }

    case "control_pomodoro": {
      const action = (params.action || "start").toLowerCase();
      const minutes = Number(params.minutes);
      const mode = params.mode;

      try {
        window.dispatchEvent(
          new CustomEvent("gili_pomodoro_action", {
            detail: {
              action,
              durationMinutes: !isNaN(minutes) && minutes > 0 ? minutes : undefined,
              mode:
                mode === "focus" || mode === "shortBreak" || mode === "longBreak"
                  ? mode
                  : undefined,
            },
          })
        );
        emit("gili-pomodoro-action", action).catch(() => {});

        let msg = t("aichat_tool_pomo_started");
        if (action === "pause") msg = t("aichat_tool_pomo_paused");
        else if (action === "reset") msg = t("aichat_tool_pomo_reset");
        else if (action === "skip") msg = t("aichat_tool_pomo_skipped");
        else if (!isNaN(minutes) && minutes > 0) msg = t("aichat_tool_pomo_min_started", { minutes });

        return {
          type,
          success: true,
          message: msg,
          tabTarget: "pomodoro",
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || t("aichat_tool_pomo_fail") };
      }
    }

    case "control_music": {
      const action = (params.action || "toggle").toLowerCase();
      const validActions = ["play", "pause", "toggle", "next", "prev"];
      if (!validActions.includes(action)) {
        return { type, success: false, message: t("aichat_tool_music_invalid", { action }) };
      }

      try {
        await invoke("smtc_action", { action });
        let msg = t("aichat_tool_music_changed");
        if (action === "play") msg = t("aichat_tool_music_played");
        else if (action === "pause") msg = t("aichat_tool_music_paused");
        else if (action === "next") msg = t("aichat_tool_music_next");
        else if (action === "prev") msg = t("aichat_tool_music_prev");
        else if (action === "toggle") msg = t("aichat_tool_music_toggled");

        return {
          type,
          success: true,
          message: msg,
          tabTarget: "media_expanded",
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || t("aichat_tool_music_no_player") };
      }
    }

    case "log_water": {
      const amount = Number(params.amountMl) || 250;
      try {
        logDrink(amount, false);
        return {
          type,
          success: true,
          message: t("aichat_tool_water_logged", { amount }),
          tabTarget: "water_reminder",
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || t("aichat_tool_water_fail") };
      }
    }

    case "undo_water": {
      try {
        const ok = undoLastDrink();
        return {
          type,
          success: ok,
          message: ok ? t("aichat_tool_water_undone") : t("aichat_tool_water_undo_empty"),
          tabTarget: "water_reminder",
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || t("aichat_tool_water_fail") };
      }
    }

    case "mark_prayer": {
      const prayerId = resolvePrayerId(String(params.prayer || ""));
      if (!prayerId) {
        return { type, success: false, message: t("aichat_tool_unknown_action") };
      }
      try {
        const completedBefore = getCompletedPrayersForDate();
        // If user asks to mark prayer completed and it is not yet completed, toggle it on
        const shouldToggle =
          params.completed === false
            ? completedBefore.includes(prayerId)
            : !completedBefore.includes(prayerId);
        const result = shouldToggle
          ? togglePrayerCompleted(prayerId)
          : { completed: completedBefore, isNowCompleted: completedBefore.includes(prayerId) };
        const displayName = getPrayerDisplayName(prayerId);
        return {
          type,
          success: true,
          message: result.isNowCompleted
            ? t("aichat_tool_prayer_marked", { prayer: displayName })
            : t("aichat_tool_prayer_unmarked", { prayer: displayName }),
          tabTarget: "prayer_reminder",
        };
      } catch (err: any) {
        return { type, success: false, message: err?.message || t("aichat_tool_unknown_action") };
      }
    }

    case "set_system_control": {
      const changes: string[] = [];
      const detail: Record<string, any> = {};

      if (params.focusMode) {
        const rawMode = String(params.focusMode).trim().toLowerCase();
        const resolvedMode =
          rawMode === "dnd" || rawMode.includes("jangan ganggu")
            ? "DND"
            : rawMode === "gaming" || rawMode === "game"
            ? "Gaming"
            : rawMode === "sleep" || rawMode === "tidur"
            ? "Sleep"
            : "Normal";
        detail.focusMode = resolvedMode;
        changes.push(`Mode: ${resolvedMode}`);
      }

      if (params.volume !== undefined && !isNaN(Number(params.volume))) {
        const vol = Math.max(0, Math.min(100, Math.round(Number(params.volume))));
        detail.volume = vol;
        changes.push(`Volume: ${vol}%`);
        invoke("set_master_volume", { level: vol / 100.0 }).catch(() => {});
      }

      if (params.brightness !== undefined && !isNaN(Number(params.brightness))) {
        const brt = Math.max(0, Math.min(100, Math.round(Number(params.brightness))));
        detail.brightness = brt;
        changes.push(`Brightness: ${brt}%`);
        invoke("set_brightness", { level: brt }).catch(() => {});
      }

      window.dispatchEvent(new CustomEvent("gili_ai_system_control", { detail }));

      return {
        type,
        success: true,
        message: t("aichat_tool_sys_updated", { summary: changes.join(", ") || "OK" }),
        tabTarget: "quick_control",
      };
    }

    case "open_tab": {
      const rawTab = String(params.tab || "").trim().toLowerCase();
      const validTab = Object.keys(TAB_DISPLAY_NAMES).find((k) => k === rawTab);
      if (!validTab) {
        return { type, success: false, message: t("aichat_tool_unknown_action") };
      }

      const lang = getLanguage();
      const tabLabel = TAB_DISPLAY_NAMES[validTab]?.[lang] || validTab;

      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("gili_navigate_tab", { detail: { tab: validTab } })
        );
      }, 380);

      return {
        type,
        success: true,
        message: t("aichat_tool_tab_opened", { tab: tabLabel }),
        tabTarget: validTab,
      };
    }
  }

  return { type, success: false, message: t("aichat_tool_unknown_action") };
}

/**
 * Strips any complete or in-progress ```gili_action ... ``` block from streaming text
 * so raw JSON never flickers in the chat UI while the AI is still generating tokens.
 */
export function stripActionBlocksForDisplay(rawText: string): string {
  if (!rawText) return "";
  // Remove complete blocks first
  let cleaned = rawText.replace(/```(?:gili_action|gili-action|action)\s*[\s\S]*?```/gi, "");
  // Remove trailing unclosed ```gili_action block (or partial ```gili... fence at the end)
  cleaned = cleaned.replace(/```(?:gili_action|gili-action|action|gili[_-]?[a-z]*)[\s\S]*$/i, "");
  return cleaned.trimEnd();
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

  const cleanText = stripActionBlocksForDisplay(rawText).trim();

  return { cleanText, results };
}
