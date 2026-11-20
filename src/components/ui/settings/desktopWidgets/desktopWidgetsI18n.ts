import {
  ColorPreset,
  WidgetCatalogEntry,
} from "../../../../services/desktopWidgetsService";

const GROUP_LABELS_EN: Record<string, string> = {
  A: "Gili Modules",
  B: "Productivity",
  C: "System",
  D: "Lifestyle",
};

const WIDGET_TEXT_EN: Record<string, { name: string; description: string }> = {
  calendar_agenda: {
    name: "Calendar & Agenda",
    description: "4 calendar styles (Minimal Month, Month + Header, Focused Date, Gili Agenda).",
  },
  class_schedule: {
    name: "Weekly Class Schedule",
    description: "Weekly class list, time slots, and study rooms.",
  },
  habit_heatmap: {
    name: "Habit Heatmap",
    description: "Matrix-style daily habit consistency tracker.",
  },
  system_performance: {
    name: "System Performance",
    description: "Real per-core CPU load, RAM, GPU, disk usage, and network speed.",
  },
  now_playing: {
    name: "Now Playing & Lyrics",
    description: "Currently playing track with synced lyrics from Gili.",
  },
  weather_forecast: {
    name: "Weather Forecast",
    description: "Current temperature, hourly outlook, and 5-day forecast.",
  },
  todo_groups: {
    name: "Grouped To-Do List",
    description: "Grouped task list with completion progress.",
  },
  drop_zone: {
    name: "Drop Zone",
    description: "Quick file shelf synced with Gili Drop Zone.",
  },
  sticky_notes: {
    name: "Sticky Notes",
    description: "Color sticky notes with checklist mode and native inline text editor.",
  },
  mini_kanban: {
    name: "3-Column Mini Kanban",
    description: "3-column board (To Do, Doing, Done) with quick card moves.",
  },
  time_tracker: {
    name: "Project Time Tracker",
    description: "Track duration per project (start/stop) with CSV export.",
  },
  site_status: {
    name: "Site Uptime Status",
    description: "Monitor your HTTPS endpoints (min 60s interval, max 6 sites).",
  },
  github_status: {
    name: "GitHub Status",
    description: "PR, issue, and Actions summary using ETag & Credential Manager.",
  },
  shortcuts_grid: {
    name: "Quick Shortcuts",
    description: "Grid of apps, folders, and links with cached system icons.",
  },
  recent_files: {
    name: "Recent Files",
    description: "Opt-in recent file list (metadata only, file contents never read).",
  },
  countdown_moment: {
    name: "Moment Countdown",
    description: "Count remaining days to deadlines, exams, payday, or holidays.",
  },
  quick_snippets: {
    name: "Quick Snippet Board",
    description: "Custom text templates copied in 1 click (not clipboard history).",
  },
  top_processes: {
    name: "Top Processes (Read-Only)",
    description: "Top 5 processes by CPU & RAM usage without kill buttons.",
  },
  quick_controls: {
    name: "Quick Controls",
    description: "Public-API toggles: Wi-Fi, Bluetooth, Dark Mode, Mute.",
  },
  storage_treemap: {
    name: "Storage Treemap",
    description: "On-demand low-priority folder size treemap visualizer.",
  },
  screen_time: {
    name: "Daily Screen Time",
    description: "Active screen time today, device uptime, and active process summary.",
  },
  styled_clock: {
    name: "Styled Clock (8 Styles)",
    description: "8 clock styles including analog, thin editorial, and typographic word clock.",
  },
  world_clock: {
    name: "Multi-Zone World Clock",
    description: "Track up to 4 world time zones with analog dials and day/night cues.",
  },
  photo_frame: {
    name: "Photo Frame",
    description: "Clean square photo frame with 5s slideshow; click directly to pick photos.",
  },
  live_mascot: {
    name: "Gili Live Mascot",
    description: "Lightweight vector companion (8-10 fps) reacting to clicks and time.",
  },
  audio_visualizer: {
    name: "Audio Visualizer",
    description: "Real-time system audio spectrum via WASAPI loopback FFT.",
  },
  quote_poster: {
    name: "Quote Poster",
    description: "Daily quote or custom text displayed in editorial typography.",
  },
  prayer_times: {
    name: "Prayer Times",
    description: "Offline astronomical prayer time calculator with Ramadan mode.",
  },
  air_quality: {
    name: "Air Quality (AQI & UV)",
    description: "Real-time AQI, PM2.5, PM10, and UV Index for your location.",
  },
  currency_gold: {
    name: "Currency & Gold Price",
    description: "Cached exchange rates (open.er-api.com) & gold price feed slot.",
  },
  hijri_holidays: {
    name: "Hijri Calendar & Holidays",
    description: "Offline Hijri date (+/-1 day) & configurable public holiday list.",
  },
  quick_expense: {
    name: "Quick Expense Log",
    description: "DPAPI-encrypted local expense log with monthly budget progress bar.",
  },
  football_scores: {
    name: "Football Scoreboard",
    description: "Match scores via licensed data provider contract.",
  },
  ai_quick_ask: {
    name: "Quick AI Ask",
    description: "Send short prompts through Gili's AI router and BYOK API key.",
  },
};

const PRESET_NAMES_EN: Record<string, string> = {
  frosted_dark: "Frosted Dark",
  frosted_light: "Frosted Light",
  monochrome_white: "Monochrome White",
  oled_clear: "Clear Dark",
  graphite_solid: "Solid Graphite",
  clean_white: "Clean White",
  dark_frosted: "Frosted Dark",
};

const PAUSED_REASON_EN: Record<string, string> = {
  "Widget desktop nonaktif": "Desktop widgets are disabled",
  "Layar mati": "Display is off",
  "Papan Widget tertutup": "Widget Board is closed",
  "Aplikasi layar penuh aktif": "Fullscreen app is active",
};

export function localizeCatalogEntry(
  entry: WidgetCatalogEntry,
  isId: boolean
): WidgetCatalogEntry {
  if (isId) return entry;
  const enText = WIDGET_TEXT_EN[entry.widget_type];
  return {
    ...entry,
    group_label: GROUP_LABELS_EN[entry.group] ?? entry.group_label,
    name: enText?.name ?? entry.name,
    description: enText?.description ?? entry.description,
  };
}

export function localizePresetName(preset: ColorPreset, isId: boolean): string {
  if (isId) return preset.name;
  return PRESET_NAMES_EN[preset.id] ?? preset.name;
}

export function getClockStyleOptions(isId: boolean) {
  if (isId) {
    return [
      { value: "minimal_digital", label: "Digital Minimal" },
      { value: "kata_indonesia", label: "Tipografi Kata" },
      { value: "analog_classic", label: "Analog Klasik" },
      { value: "analog_skeleton", label: "Analog Rangka" },
      { value: "stacked_bold", label: "Tumpuk Vertikal" },
      { value: "retro_flip", label: "Flip Retro" },
      { value: "editorial_thin", label: "Editorial Tipis" },
      { value: "dual_zone", label: "Jam Dunia Ganda" },
    ];
  }
  return [
    { value: "minimal_digital", label: "Minimal Digital" },
    { value: "kata_indonesia", label: "Typographic Word Clock" },
    { value: "analog_classic", label: "Classic Analog" },
    { value: "analog_skeleton", label: "Skeleton Analog" },
    { value: "stacked_bold", label: "Vertical Stacked" },
    { value: "retro_flip", label: "Retro Flip" },
    { value: "editorial_thin", label: "Thin Editorial" },
    { value: "dual_zone", label: "Dual Zone Clock" },
  ];
}

export function getCalendarStyleOptions(isId: boolean) {
  if (isId) {
    return [
      { value: "bulan_minimal", label: "Bulan Minimalis" },
      { value: "bulan_header", label: "Bulan + Judul" },
      { value: "tanggal_fokus", label: "Tanggal Fokus" },
      { value: "tanggal_agenda", label: "Tanggal + Agenda" },
    ];
  }
  return [
    { value: "bulan_minimal", label: "Minimal Month" },
    { value: "bulan_header", label: "Month + Header" },
    { value: "tanggal_fokus", label: "Focused Date" },
    { value: "tanggal_agenda", label: "Date + Agenda" },
  ];
}

export function localizePausedReason(
  reason: string | null,
  isId: boolean
): string | null {
  if (!reason || isId) return reason;
  return PAUSED_REASON_EN[reason] ?? reason;
}
