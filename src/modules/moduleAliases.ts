// Canonical alias map kept dependency-free so popover shells don't pull the full module catalog JSON
export const MODULE_ID_ALIASES: Record<string, string> = {
  event: "acara_berikutnya",
  todo: "to_do_fokus",
  pomodoro: "pomodoro",
  quicknote: "catat_cepat",
  note: "catat_cepat",
  system: "pantau_sistem",
  net: "jaringan",
  weather: "cuaca",
  clock: "jam_dunia",
  battery: "baterai_daya",
  audiodevice: "output_audio",
  audio_output: "output_audio",
  virtual_desktop: "desktop_virtual",
  water: "water_tracker",
  prayer: "waktu_sholat",
  shelf: "drop_zone_mini",
  media: "sedang_diputar",
  media_control: "kontrol_media",
  focus: "mode_fokus",
  mixer: "mixer_suara",
  streak: "streak_kebiasaan",
  quote: "kutipan_harian",
  countdown: "hitung_mundur",
  day_progress: "progres_hari",
  eye_rest: "istirahat_mata",
};

// Built-in core taskbar slots are handled separately from catalog add-ons
export const BUILTIN_MODULE_ID_SET = new Set([
  "startSearch",
  "pinnedApps",
  "runningApps",
  "hiddenTray",
  "systemIcons",
  "notifications",
  "clockDate",
]);

export function resolveCanonicalModuleId(id: string): string {
  return MODULE_ID_ALIASES[id] || id;
}

export function isSameCatalogModuleId(a: string, b: string): boolean {
  if (a === b) return true;
  if (BUILTIN_MODULE_ID_SET.has(a) || BUILTIN_MODULE_ID_SET.has(b)) {
    return false;
  }
  return resolveCanonicalModuleId(a) === resolveCanonicalModuleId(b);
}
