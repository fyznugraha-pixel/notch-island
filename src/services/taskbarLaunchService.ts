import { invoke } from "@tauri-apps/api/core";
import type { WindowsPinnedAppItem } from "../hooks/useWindowsPinnedApps";
import { getLanguage, type Language } from "./i18n";
import { dateLocale } from "./taskbarI18n";

export type { WindowsPinnedAppItem };

export interface RecentFileEntry {
  id: string;
  name: string;
  path: string;
  lnk_path: string;
  folder: string;
  modified_ts: number;
  icon_base64?: string | null;
  kind: string;
}

export interface TrayBackgroundAppEntry {
  pid: number;
  name: string;
  process_name: string;
  exe_path: string;
  hwnd: number | null;
  is_minimized: boolean;
  is_background_tray: boolean;
  icon_base64?: string | null;
  can_close?: boolean;
}

export interface CloseTrayAppResult {
  closed: boolean;
  requires_admin: boolean;
  message?: string | null;
}

export interface QuickTogglesState {
  airplane_mode: boolean;
  battery_saver: boolean;
  night_light: boolean;
  hotspot_enabled: boolean;
  dnd_enabled: boolean;
}

export interface AccessibilityState {
  magnifier: boolean;
  colorFilter: boolean;
  narrator: boolean;
  monoAudio: boolean;
  liveCaptions: boolean;
}

export interface SettingsShortcutEntry {
  id: string;
  name: string;
  subtitle: string;
  uri: string;
  keywords: string;
}

const BILINGUAL_WINDOWS_SHORTCUTS: Array<{
  id: string;
  name: { en: string; id: string };
  subtitle: { en: string; id: string };
  uri: string;
  keywords: string;
}> = [
  {
    id: "set-wifi",
    name: { en: "Wi-Fi Settings", id: "Pengaturan Wi-Fi" },
    subtitle: { en: "Network & Internet", id: "Jaringan & Internet" },
    uri: "ms-settings:network-wifi",
    keywords: "wifi network internet jaringan",
  },
  {
    id: "set-bt",
    name: { en: "Bluetooth & Devices", id: "Bluetooth & Perangkat" },
    subtitle: { en: "Wireless connections", id: "Sambungan nirkabel" },
    uri: "ms-settings:bluetooth",
    keywords: "bluetooth device speaker headset",
  },
  {
    id: "set-sound",
    name: { en: "Sound & Audio Output", id: "Suara & Output Audio" },
    subtitle: { en: "Volume, mixer & devices", id: "Volume, mixer & perangkat" },
    uri: "ms-settings:sound",
    keywords: "sound volume audio speaker mic",
  },
  {
    id: "set-display",
    name: { en: "Display & Night Light", id: "Layar & Night Light" },
    subtitle: { en: "Brightness, resolution, scale", id: "Kecerahan, resolusi, skala" },
    uri: "ms-settings:display",
    keywords: "display screen brightness resolusi nightlight",
  },
  {
    id: "set-battery",
    name: { en: "Power & Battery", id: "Daya & Baterai" },
    subtitle: { en: "Battery saver & performance", id: "Penghemat baterai & performa" },
    uri: "ms-settings:powersleep",
    keywords: "battery power sleep daya baterai",
  },
  {
    id: "set-focus",
    name: { en: "Focus & Do Not Disturb", id: "Fokus & Jangan Ganggu" },
    subtitle: { en: "Notifications & focus sessions", id: "Notifikasi & sesi fokus" },
    uri: "ms-settings:quiethours",
    keywords: "focus dnd notifications notifikasi",
  },
  {
    id: "set-taskbar",
    name: { en: "Taskbar Personalization", id: "Personalisasi Taskbar" },
    subtitle: { en: "Taskbar & System Tray", id: "Taskbar & System Tray" },
    uri: "ms-settings:taskbar",
    keywords: "taskbar tray dock ikon icon",
  },
  {
    id: "set-update",
    name: { en: "Windows Update", id: "Windows Update" },
    subtitle: { en: "System updates", id: "Pembaruan sistem" },
    uri: "ms-settings:windowsupdate",
    keywords: "update windows patch security",
  },
  {
    id: "set-apps",
    name: { en: "Installed Apps", id: "Aplikasi Terpasang" },
    subtitle: { en: "Manage & uninstall apps", id: "Kelola & hapus instalasi aplikasi" },
    uri: "ms-settings:appsfeatures",
    keywords: "apps features uninstall programs aplikasi hapus",
  },
  {
    id: "set-startup",
    name: { en: "Startup Apps", id: "Aplikasi Startup" },
    subtitle: { en: "Apps that start on sign in", id: "Aplikasi yang berjalan saat masuk" },
    uri: "ms-settings:startupapps",
    keywords: "startup boot autostart mulai awal",
  },
  {
    id: "set-default-apps",
    name: { en: "Default Apps", id: "Aplikasi Default" },
    subtitle: { en: "Default browser & file handlers", id: "Browser & pembuka file default" },
    uri: "ms-settings:defaultapps",
    keywords: "default browser file association",
  },
  {
    id: "set-storage",
    name: { en: "Storage", id: "Penyimpanan" },
    subtitle: { en: "Disk usage & cleanup", id: "Penggunaan disk & pembersihan" },
    uri: "ms-settings:storagesense",
    keywords: "storage disk space cleanup penyimpanan ruang",
  },
  {
    id: "set-privacy",
    name: { en: "Privacy & Security", id: "Privasi & Keamanan" },
    subtitle: { en: "Permissions, camera & mic", id: "Izin kamera, mikrofon & keamanan" },
    uri: "ms-settings:privacy",
    keywords: "privacy security permission camera mic privasi keamanan",
  },
  {
    id: "set-security",
    name: { en: "Windows Security", id: "Keamanan Windows" },
    subtitle: { en: "Defender antivirus & firewall", id: "Antivirus Defender & firewall" },
    uri: "ms-settings:windowsdefender",
    keywords: "defender antivirus firewall security keamanan",
  },
  {
    id: "set-personalization",
    name: { en: "Personalization & Background", id: "Personalisasi & Latar" },
    subtitle: { en: "Wallpaper, colors & themes", id: "Wallpaper, warna & tema" },
    uri: "ms-settings:personalization-background",
    keywords: "wallpaper background theme color warna tema latar",
  },
  {
    id: "set-time",
    name: { en: "Date & Time", id: "Tanggal & Waktu" },
    subtitle: { en: "Time zone & clock sync", id: "Zona waktu & sinkronisasi jam" },
    uri: "ms-settings:dateandtime",
    keywords: "date time timezone clock tanggal waktu jam",
  },
  {
    id: "set-accounts",
    name: { en: "Accounts & Sign-in", id: "Akun & Masuk" },
    subtitle: { en: "User profile & Microsoft account", id: "Profil pengguna & akun Microsoft" },
    uri: "ms-settings:yourinfo",
    keywords: "account profile user login akun profil",
  },
  {
    id: "set-mouse",
    name: { en: "Mouse & Touchpad", id: "Mouse & Touchpad" },
    subtitle: { en: "Pointer speed & gestures", id: "Kecepatan kursor & gestur" },
    uri: "ms-settings:mousetouchpad",
    keywords: "mouse touchpad cursor pointer kursor",
  },
];

export function getLocalizedWindowsSettingsShortcuts(lang: Language): SettingsShortcutEntry[] {
  return BILINGUAL_WINDOWS_SHORTCUTS.map((item) => ({
    id: item.id,
    name: lang === "id" ? item.name.id : item.name.en,
    subtitle: lang === "id" ? item.subtitle.id : item.subtitle.en,
    uri: item.uri,
    keywords: item.keywords,
  }));
}

export const WINDOWS_SETTINGS_SHORTCUTS: SettingsShortcutEntry[] =
  getLocalizedWindowsSettingsShortcuts("id");

export async function launchWindowsApp(app: {
  lnk_path?: string;
  target_path?: string;
  arguments?: string;
}): Promise<void> {
  await invoke("launch_pinned_app", {
    lnkPath: app.lnk_path ?? "",
    targetPath: app.target_path ?? "",
    arguments: app.arguments ?? "",
  });
}

export async function launchRecentFile(file: RecentFileEntry): Promise<void> {
  await invoke("launch_pinned_app", {
    lnkPath: file.lnk_path,
    targetPath: file.path,
    arguments: "",
  });
}

export async function launchSystemTarget(target: string): Promise<void> {
  await invoke("launch_target", { target });
}

export async function switchFlyoutTarget(
  target: "start" | "search" | "tray" | "quickSettings" | "volume" | "notificationsCalendar"
): Promise<void> {
  await invoke("switch_taskbar_flyout_target", { target });
}

export function formatRelativeTimestamp(unixSeconds: number, lang: Language = getLanguage()): string {
  const isId = lang === "id";
  if (!unixSeconds) return isId ? "Baru dibuka" : "Recently opened";
  const diffMin = Math.max(0, Math.floor((Date.now() - unixSeconds * 1000) / 60000));
  if (diffMin < 1) return isId ? "Baru saja" : "Just now";
  if (diffMin < 60) return isId ? `${diffMin}m lalu` : `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return isId ? `${diffHours}j lalu` : `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return isId ? "Kemarin" : "Yesterday";
  if (diffDays < 7) return isId ? `${diffDays}h lalu` : `${diffDays}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString(dateLocale(lang), {
    day: "numeric",
    month: "short",
  });
}
