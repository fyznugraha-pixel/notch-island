import type { NotifPayload } from "../types";
import { getLanguage } from "./i18n";

export type NotificationCategory = "all" | "unread" | "reminder" | "message" | "system";

export interface NotificationHistoryItem {
  id: string;
  title: string;
  body: string;
  category: "message" | "reminder" | "clipboard" | "system";
  appName: string;
  timestamp: number;
  read: boolean;
  icon?: string;
  aumid?: string;
}

const STORAGE_KEY = "island_notification_history";
const MUTED_APPS_KEY = "island_muted_notification_apps";
const DND_KEY = "island_dnd_enabled";

function getInitialSeedNotifications(): NotificationHistoryItem[] {
  const isEn = getLanguage() === "en";
  return [
    {
      id: "notif-seed-1",
      title: "Gene",
      body: isEn
        ? "Please check the attendance list, someone hasn't checked in yet"
        : "Tolong cek absensi dulu ya, ada yang belum masuk",
      category: "message",
      appName: "WhatsApp",
      timestamp: Date.now() - 15 * 60 * 1000,
      read: false,
      icon: "message",
    },
    {
      id: "notif-seed-2",
      title: isEn ? "Thesis Review Ch. 2" : "Revisi bab 2 TA",
      body: isEn ? "Deadline 20:00 · 30 minutes left" : "Deadline 20:00 · 30 menit lagi",
      category: "reminder",
      appName: isEn ? "Reminders" : "Pengingat",
      timestamp: Date.now() - 2 * 60 * 60 * 1000,
      read: false,
      icon: "bell",
    },
    {
      id: "notif-seed-3",
      title: isEn ? "Copied to clipboard" : "Disalin ke clipboard",
      body: isEn
        ? "add new tabs for cpu, gpu, wifi, and memory usage in island system monitor widget so device performance can be monitored directly"
        : "tambah tab baru untuk cpu, gpu, wifi, dan memory usage di island system monitor widget agar performa perangkat bisa dipantau secara langsung",
      category: "clipboard",
      appName: "Clipboard",
      timestamp: Date.now() - 26 * 60 * 60 * 1000,
      read: true,
      icon: "clipboard",
    },
    {
      id: "notif-seed-4",
      title: isEn ? "Battery full" : "Baterai penuh",
      body: isEn
        ? "Unplug charger to maintain battery health"
        : "Lepas charger untuk menjaga kesehatan baterai",
      category: "system",
      appName: isEn ? "System" : "Sistem",
      timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
      read: false,
      icon: "battery",
    },
  ];
}

export function categorizeNotification(notif: NotifPayload): {
  category: "message" | "reminder" | "clipboard" | "system";
  appName: string;
} {
  const title = (notif.title || "").toLowerCase();
  const body = (notif.body || "").toLowerCase();
  const icon = (notif.icon || "").toLowerCase();
  const aumid = (notif.aumid || "").toLowerCase();
  const explicitApp = (notif.appName || "").trim();

  // 1. Detect WhatsApp & WhatsApp Web from explicitApp, title, body, or AUMID
  const isWhatsApp =
    explicitApp.toLowerCase().includes("whatsapp") ||
    aumid.includes("whatsapp") ||
    icon === "whatsapp" ||
    title.includes("whatsapp") ||
    body.includes("whatsapp") ||
    title.includes("web.whatsapp.com") ||
    body.includes("web.whatsapp.com");

  if (isWhatsApp) {
    const isWeb =
      explicitApp.toLowerCase().includes("chrome") ||
      explicitApp.toLowerCase().includes("edge") ||
      explicitApp.toLowerCase().includes("brave") ||
      explicitApp.toLowerCase().includes("firefox") ||
      title.includes("web.whatsapp.com") ||
      body.includes("web.whatsapp.com");
    return { category: "message", appName: isWeb ? "WhatsApp Web" : "WhatsApp" };
  }

  if (explicitApp) {
    const lowerApp = explicitApp.toLowerCase();
    if (
      lowerApp.includes("telegram") ||
      lowerApp.includes("discord") ||
      lowerApp.includes("slack") ||
      lowerApp.includes("mail") ||
      lowerApp.includes("outlook") ||
      icon === "message" ||
      notif.type === "message"
    ) {
      return { category: "message", appName: explicitApp };
    }
    if (
      icon === "bell" ||
      icon === "timer" ||
      title.includes("deadline") ||
      title.includes("ingat") ||
      title.includes("pomodoro") ||
      title.includes("todo") ||
      body.includes("deadline") ||
      body.includes("ingat")
    ) {
      return { category: "reminder", appName: explicitApp };
    }
    if (icon === "clipboard" || title.includes("clipboard") || title.includes("disalin")) {
      return { category: "clipboard", appName: explicitApp };
    }
    return { category: "system", appName: explicitApp };
  }

  if (
    aumid.includes("telegram") ||
    aumid.includes("discord") ||
    aumid.includes("slack") ||
    icon === "message" ||
    notif.type === "message"
  ) {
    const appName = aumid.includes("telegram")
      ? "Telegram"
      : aumid.includes("discord")
      ? "Discord"
      : "Pesan";
    return { category: "message", appName };
  }

  if (
    icon === "bell" ||
    icon === "timer" ||
    title.includes("deadline") ||
    title.includes("ingat") ||
    title.includes("pomodoro") ||
    title.includes("todo") ||
    body.includes("deadline") ||
    body.includes("ingat")
  ) {
    return { category: "reminder", appName: "Pengingat" };
  }

  if (icon === "clipboard" || title.includes("clipboard") || title.includes("disalin")) {
    return { category: "clipboard", appName: "Clipboard" };
  }

  return { category: "system", appName: "Sistem" };
}

export function loadNotificationHistory(): NotificationHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const initial = getInitialSeedNotifications();
      saveNotificationHistory(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Filter out greeting notifications, clipboard copy toasts, and update any previously truncated seed texts
      const sanitized = parsed
        .filter(
          (item) =>
            item.icon !== "sun" &&
            item.icon !== "moon" &&
            item.icon !== "clipboard" &&
            !item.title?.startsWith("Hi, ")
        )
        .map((item) => {
          if (item.id === "notif-seed-3" && item.body && item.body.includes("memory us...")) {
            return {
              ...item,
              body: "tambah tab baru untuk cpu, gpu, wifi, dan memory usage di island system monitor widget agar performa perangkat bisa dipantau secara langsung",
            };
          }
          return item;
        });

      if (sanitized.length !== parsed.length || JSON.stringify(sanitized) !== raw) {
        saveNotificationHistory(sanitized);
      }
      return sanitized;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveNotificationHistory(items: NotificationHistoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 50)));
  } catch {}
}

export function addNotificationHistoryItem(notif: NotifPayload): NotificationHistoryItem {
  const currentList = loadNotificationHistory();
  const { category, appName } = categorizeNotification(notif);

  const newItem: NotificationHistoryItem = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: notif.title || "Notifikasi",
    body: notif.body || "",
    category,
    appName,
    timestamp: notif.timestamp || Date.now(),
    read: false,
    icon: notif.icon || (appName.toLowerCase().includes("whatsapp") ? "whatsapp" : category),
    aumid: notif.aumid,
  };

  const updated = [newItem, ...currentList.filter((item) => item.id !== newItem.id)].slice(0, 50);
  saveNotificationHistory(updated);
  return newItem;
}

export function markNotificationAsRead(id: string): NotificationHistoryItem[] {
  const currentList = loadNotificationHistory();
  const updated = currentList.map((item) => (item.id === id ? { ...item, read: true } : item));
  saveNotificationHistory(updated);
  return updated;
}

export function markAllNotificationsAsRead(): NotificationHistoryItem[] {
  const currentList = loadNotificationHistory();
  const updated = currentList.map((item) => ({ ...item, read: true }));
  saveNotificationHistory(updated);
  return updated;
}

export function clearNotificationHistory(): NotificationHistoryItem[] {
  saveNotificationHistory([]);
  return [];
}

export function deleteNotificationHistoryItem(id: string): NotificationHistoryItem[] {
  const currentList = loadNotificationHistory();
  const updated = currentList.filter((item) => item.id !== id);
  saveNotificationHistory(updated);
  return updated;
}

export function getMutedApps(): string[] {
  try {
    const raw = localStorage.getItem(MUTED_APPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function toggleMuteApp(appName: string): string[] {
  const current = getMutedApps();
  const isMuted = current.includes(appName);
  const next = isMuted ? current.filter((a) => a !== appName) : [...current, appName];
  try {
    localStorage.setItem(MUTED_APPS_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function isAppMuted(appName: string): boolean {
  return getMutedApps().includes(appName);
}

export function getDndStatus(): boolean {
  try {
    return localStorage.getItem(DND_KEY) === "true";
  } catch {
    return false;
  }
}

export function setDndStatus(enabled: boolean): void {
  try {
    localStorage.setItem(DND_KEY, String(enabled));
  } catch {}
}
