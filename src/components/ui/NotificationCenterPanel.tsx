import React, { useState, useMemo, useRef } from "react";
import {
  Bell,
  BellOff,
  Moon,
  Trash2,
  CheckCheck,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  NotificationHistoryItem,
  NotificationCategory,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearNotificationHistory,
  deleteNotificationHistoryItem,
  getMutedApps,
  toggleMuteApp,
  getDndStatus,
  setDndStatus,
} from "../../services/notificationHistoryService";
import { t, getLanguage } from "../../services/i18n";
import { NotifIcon } from "./NotifIcon";
import { resolveAppLogo } from "../../utils/appLogoResolver";

export interface NotificationCenterPanelProps {
  notifications: NotificationHistoryItem[];
  onUpdateNotifications: (items: NotificationHistoryItem[]) => void;
  onDndChange?: (enabled: boolean) => void;
  isDndActive?: boolean;
  isLightMode?: boolean;
  onGoToTab?: (tab: string) => void;
}

const getAppDotColor = (name: string, _category?: string, _isLightMode = false): string => {
  return resolveAppLogo(name).color;
};

export const NotificationCenterPanel: React.FC<NotificationCenterPanelProps> = ({
  notifications,
  onUpdateNotifications,
  onDndChange,
  isDndActive,
  isLightMode = false,
  onGoToTab,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory>("all");
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [mutedApps, setMutedApps] = useState<string[]>(() => getMutedApps());
  const isDnd = isDndActive ?? getDndStatus();
  const isEn = getLanguage() === "en";

  const formatAppName = (name: string) => {
    if (isEn) {
      if (name === "Pengingat") return "Reminders";
      if (name === "Sistem") return "System";
      if (name === "Pesan") return "Messages";
    } else {
      if (name === "Reminders" || name === "Reminder") return "Pengingat";
      if (name === "System") return "Sistem";
      if (name === "Messages" || name === "Message") return "Pesan";
    }
    return name;
  };

  const handleToggleDnd = () => {
    const next = !isDnd;
    setDndStatus(next);
    onDndChange?.(next);
  };

  const handleToggleMute = (appName: string) => {
    const next = toggleMuteApp(appName);
    setMutedApps(next);
  };

  const handleMarkAsRead = (id: string) => {
    const updated = markNotificationAsRead(id);
    onUpdateNotifications(updated);
  };

  const handleMarkAllAsRead = () => {
    const updated = markAllNotificationsAsRead();
    onUpdateNotifications(updated);
  };

  // Two-step clear-all: first click arms for 3s; second click clears.
  const [armedClearAll, setArmedClearAll] = useState(false);
  const armedClearTimerRef = useRef<number | null>(null);

  const handleClearAll = () => {
    if (!armedClearAll) {
      setArmedClearAll(true);
      if (armedClearTimerRef.current) window.clearTimeout(armedClearTimerRef.current);
      armedClearTimerRef.current = window.setTimeout(() => setArmedClearAll(false), 3000);
      return;
    }
    setArmedClearAll(false);
    if (armedClearTimerRef.current) window.clearTimeout(armedClearTimerRef.current);
    const updated = clearNotificationHistory();
    onUpdateNotifications(updated);
  };

  const handleDeleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteNotificationHistoryItem(id);
    onUpdateNotifications(updated);
  };

  const handleItemClick = async (item: NotificationHistoryItem) => {
    handleMarkAsRead(item.id);

    const appName = (item.appName || "").trim();
    const appLower = appName.toLowerCase();
    const titleLower = (item.title || "").toLowerCase();
    const bodyText = item.body || "";

    // 1. Internal Notch Tabs (Reminders / To-Do, Clipboard, Water)
    if (
      item.category === "reminder" ||
      appLower.includes("pengingat") ||
      appLower.includes("reminder") ||
      appLower.includes("todo")
    ) {
      onGoToTab?.("todo");
      return;
    }

    if (
      item.category === "clipboard" ||
      appLower.includes("clipboard") ||
      appLower.includes("papan klip")
    ) {
      onGoToTab?.("clipboard");
      return;
    }

    if (appLower.includes("water") || appLower.includes("minum")) {
      onGoToTab?.("water_reminder");
      return;
    }

    // 2. Check if body or title contains an HTTP/HTTPS URL
    const urlMatch = (bodyText + " " + item.title).match(/https?:\/\/[^\s]+/i);
    const isBrowserApp =
      appLower.includes("chrome") ||
      appLower.includes("edge") ||
      appLower.includes("firefox") ||
      appLower.includes("brave") ||
      appLower.includes("opera") ||
      appLower.includes("browser");

    // 3. Try native window activation first via Rust backend
    try {
      const activated = await invoke<boolean>("activate_notification_app", {
        appName: item.appName || item.title,
        aumid: item.aumid || null,
      });
      if (activated) return;
    } catch (err) {
      console.warn("Failed to activate notification app:", err);
    }

    // 4. If URL found in browser/web notification, open link
    if (urlMatch && (isBrowserApp || urlMatch[0].length > 10)) {
      try {
        await openUrl(urlMatch[0]);
        return;
      } catch {}
    }

    // 5. Deep-link URI protocol fallback for apps minimized to tray or closed
    const combined = `${appLower} ${titleLower}`;
    let protocolUrl = "";
    if (combined.includes("whatsapp")) protocolUrl = "whatsapp://";
    else if (combined.includes("telegram") || combined.includes("tg")) protocolUrl = "tg://";
    else if (combined.includes("discord")) protocolUrl = "discord://";
    else if (combined.includes("spotify")) protocolUrl = "spotify://";
    else if (combined.includes("slack")) protocolUrl = "slack://";
    else if (combined.includes("teams")) protocolUrl = "msteams://";
    else if (combined.includes("zoom")) protocolUrl = "zoommtg://";
    else if (combined.includes("line")) protocolUrl = "line://";
    else if (combined.includes("steam")) protocolUrl = "steam://";
    else if (combined.includes("vscode") || combined.includes("code")) protocolUrl = "vscode://";
    else if (combined.includes("mail") || combined.includes("outlook")) protocolUrl = "mailto:";
    else if (combined.includes("instagram")) protocolUrl = "https://instagram.com";
    else if (combined.includes("twitter") || combined === "x" || combined.includes(" x ")) protocolUrl = "https://x.com";
    else if (combined.includes("facebook")) protocolUrl = "https://facebook.com";
    else if (combined.includes("youtube")) protocolUrl = "https://youtube.com";
    else if (combined.includes("github")) protocolUrl = "https://github.com";

    if (protocolUrl) {
      try {
        await openUrl(protocolUrl);
      } catch (err) {
        console.error("Failed to open app protocol:", err);
      }
    }
  };

  // Counts for pills
  const counts = useMemo(() => {
    const total = notifications.length;
    const unread = notifications.filter((n) => !n.read).length;
    const reminder = notifications.filter((n) => n.category === "reminder").length;
    const message = notifications.filter((n) => n.category === "message").length;
    const system = notifications.filter((n) => n.category === "system" || n.category === "clipboard").length;
    return { total, unread, reminder, message, system };
  }, [notifications]);

  interface AppItem {
    name: string;
    count: number;
    unreadCount: number;
    latestTimestamp: number;
    category?: string;
  }

  // Dynamic Per-app summaries, sorted by newest notification timestamp first
  const perAppList = useMemo<AppItem[]>(() => {
    const map = new Map<string, AppItem>();

    for (const item of notifications) {
      const defaultName = isEn ? "System" : "Sistem";
      const name = (item.appName || defaultName).trim();
      const existing = map.get(name);
      if (!existing) {
        map.set(name, {
          name,
          count: 1,
          unreadCount: item.read ? 0 : 1,
          latestTimestamp: item.timestamp,
          category: item.category,
        });
      } else {
        existing.count += 1;
        if (!item.read) existing.unreadCount += 1;
        if (item.timestamp > existing.latestTimestamp) {
          existing.latestTimestamp = item.timestamp;
          existing.category = item.category;
        }
      }
    }

    // Keep muted apps in list so user can see and unmute them if needed
    for (const muted of mutedApps) {
      if (!map.has(muted)) {
        map.set(muted, {
          name: muted,
          count: 0,
          unreadCount: 0,
          latestTimestamp: 0,
        });
      }
    }

    // Sort descending: apps with the newest notification incoming appear first
    return Array.from(map.values()).sort((a, b) => {
      if (b.latestTimestamp !== a.latestTimestamp) {
        return b.latestTimestamp - a.latestTimestamp;
      }
      return b.count - a.count;
    });
  }, [notifications, mutedApps]);

  // Filtered notifications list (category and optional app filter)
  const filteredNotifications = useMemo(() => {
    const defaultName = isEn ? "System" : "Sistem";
    return notifications.filter((item) => {
      if (selectedApp && (item.appName || defaultName).toLowerCase() !== selectedApp.toLowerCase()) {
        return false;
      }
      if (selectedCategory === "unread") return !item.read;
      if (selectedCategory === "reminder") return item.category === "reminder";
      if (selectedCategory === "message") return item.category === "message";
      if (selectedCategory === "system") return item.category === "system" || item.category === "clipboard";
      return true;
    });
  }, [notifications, selectedCategory, selectedApp]);

  interface NotificationDateGroup {
    key: string;
    label: string;
    items: NotificationHistoryItem[];
  }

  const groupedNotifications = useMemo<NotificationDateGroup[]>(() => {
    if (filteredNotifications.length === 0) return [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOfSevenDaysAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;

    const isEn = getLanguage() === "en";
    const groupsMap = new Map<string, NotificationDateGroup>();

    for (const item of filteredNotifications) {
      const ts = item.timestamp;
      let groupKey: string;
      let groupLabel: string;

      if (ts >= startOfToday) {
        groupKey = "today";
        groupLabel = t("notif_section_today") || (isEn ? "TODAY" : "HARI INI");
      } else if (ts >= startOfYesterday) {
        groupKey = "yesterday";
        groupLabel = t("notif_section_yesterday") || (isEn ? "YESTERDAY" : "KEMARIN");
      } else if (ts >= startOfSevenDaysAgo) {
        const itemDate = new Date(ts);
        groupKey = `day-${itemDate.getDay()}-${itemDate.getDate()}`;
        groupLabel = itemDate.toLocaleDateString(isEn ? "en-US" : "id-ID", { weekday: "long" }).toUpperCase();
      } else {
        const itemDate = new Date(ts);
        groupKey = `date-${itemDate.getFullYear()}-${itemDate.getMonth()}-${itemDate.getDate()}`;
        groupLabel = itemDate
          .toLocaleDateString(isEn ? "en-US" : "id-ID", {
            day: "numeric",
            month: "short",
            year: itemDate.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
          })
          .toUpperCase();
      }

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, { key: groupKey, label: groupLabel, items: [] });
      }
      groupsMap.get(groupKey)!.items.push(item);
    }

    return Array.from(groupsMap.values());
  }, [filteredNotifications]);

  const formatTime = (ts: number): string => {
    try {
      const date = new Date(ts);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch {
      return "";
    }
  };

  return (
    <div className="w-full h-full flex flex-col px-6 pt-1 pb-4 select-none overflow-hidden">
      {/* Top Category Filter Row */}
      <div className="flex items-center justify-between gap-2 shrink-0 mb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5">
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("all");
              setSelectedApp(null);
            }}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer select-none flex items-center gap-1.5 shrink-0 ${
              selectedCategory === "all" && !selectedApp
                ? "bg-blue-600 text-white shadow-[0_2px_10px_rgba(37,99,235,0.45)]"
                : isLightMode
                ? "bg-black/[0.04] hover:bg-black/[0.08] text-neutral-700 hover:text-black border border-black/[0.08]"
                : "bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white border border-white/10"
            }`}
          >
            <span>{t("notif_filter_all") || "Semua"}</span>
            <span className={`text-[10px] ${
              selectedCategory === "all" && !selectedApp
                ? "text-white/90"
                : isLightMode
                ? "text-neutral-500"
                : "text-white/50"
            }`}>
              {counts.total}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("unread")}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer select-none flex items-center gap-1.5 shrink-0 ${
              selectedCategory === "unread"
                ? "bg-blue-600 text-white shadow-[0_2px_10px_rgba(37,99,235,0.45)]"
                : isLightMode
                ? "bg-black/[0.04] hover:bg-black/[0.08] text-neutral-700 hover:text-black border border-black/[0.08]"
                : "bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white border border-white/10"
            }`}
          >
            <span>{t("notif_filter_unread") || "Belum dibaca"}</span>
            {counts.unread > 0 && (
              <span className={`text-[10px] ${
                selectedCategory === "unread"
                  ? "text-white/90"
                  : isLightMode
                  ? "text-neutral-500"
                  : "text-white/50"
              }`}>
                {counts.unread}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("reminder")}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer select-none flex items-center gap-1.5 shrink-0 ${
              selectedCategory === "reminder"
                ? "bg-blue-600 text-white shadow-[0_2px_10px_rgba(37,99,235,0.45)]"
                : isLightMode
                ? "bg-black/[0.04] hover:bg-black/[0.08] text-neutral-700 hover:text-black border border-black/[0.08]"
                : "bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white border border-white/10"
            }`}
          >
            <span>{t("notif_filter_reminder") || "Pengingat"}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("message")}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer select-none flex items-center gap-1.5 shrink-0 ${
              selectedCategory === "message"
                ? "bg-blue-600 text-white shadow-[0_2px_10px_rgba(37,99,235,0.45)]"
                : isLightMode
                ? "bg-black/[0.04] hover:bg-black/[0.08] text-neutral-700 hover:text-black border border-black/[0.08]"
                : "bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white border border-white/10"
            }`}
          >
            <span>{t("notif_filter_message") || "Pesan"}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("system")}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer select-none flex items-center gap-1.5 shrink-0 ${
              selectedCategory === "system"
                ? "bg-blue-600 text-white shadow-[0_2px_10px_rgba(37,99,235,0.45)]"
                : isLightMode
                ? "bg-black/[0.04] hover:bg-black/[0.08] text-neutral-700 hover:text-black border border-black/[0.08]"
                : "bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white border border-white/10"
            }`}
          >
            <span>{t("notif_filter_system") || "Sistem"}</span>
          </button>

          {selectedApp && (
            <button
              type="button"
              onClick={() => setSelectedApp(null)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-500/20 text-blue-300 border border-blue-400/35 hover:bg-blue-500/30 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              title={isEn ? "Remove app filter" : "Hapus filter aplikasi"}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: getAppDotColor(selectedApp, undefined, isLightMode) }}
              />
              <span>{formatAppName(selectedApp)}</span>
              <span className="text-[10px] text-blue-300/80 font-bold ml-0.5">✕</span>
            </button>
          )}
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {counts.unread > 0 && (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              title={t("notif_mark_all_read") || "Tandai semua dibaca"}
              className={`h-6 px-2 flex items-center gap-1 border rounded-full text-[10px] transition-colors cursor-pointer ${
                isLightMode
                  ? "bg-black/[0.04] hover:bg-black/[0.08] border-black/[0.08] text-neutral-700 hover:text-black"
                  : "bg-white/[0.06] hover:bg-white/[0.12] border-white/10 text-white/70 hover:text-white"
              }`}
            >
              <CheckCheck size={11} className="text-blue-400" />
              <span>{t("notif_mark_all_read") || "Tandai dibaca"}</span>
            </button>
          )}

          {notifications.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              aria-label={armedClearAll ? (isEn ? "Click again to confirm clearing all notifications" : "Klik lagi untuk konfirmasi hapus semua") : t("notif_clear_all") || "Hapus semua"}
              title={armedClearAll ? (isEn ? "Confirm?" : "Yakin?") : t("notif_clear_all") || "Hapus semua"}
              className={`w-6 h-6 flex items-center justify-center border rounded-full transition-colors cursor-pointer ${
                armedClearAll
                  ? "bg-red-600 border-red-500 text-white ring-2 ring-red-400/40"
                  : isLightMode
                  ? "bg-black/[0.04] hover:bg-red-500/15 border-black/[0.08] hover:border-red-500/25 text-neutral-600 hover:text-red-500"
                  : "bg-white/[0.06] hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-white/60 hover:text-red-400"
              }`}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Layout: Left (List) & Right (DND + Per App Stats) */}
      <div className="flex-1 min-h-0 flex items-stretch gap-4 overflow-hidden">
        {/* Left Column: Notification Cards List */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto pr-1 settings-scroll space-y-3">
            {groupedNotifications.length === 0 ? (
              <div className={`h-full flex flex-col items-center justify-center text-center py-8 gap-1.5 ${
                isLightMode ? "text-neutral-400" : "text-white/40"
              }`}>
                <Bell size={20} className={isLightMode ? "text-neutral-300 stroke-[1.5]" : "text-white/25 stroke-[1.5]"} />
                <span className={`text-xs font-medium ${isLightMode ? "text-neutral-600" : "text-white/60"}`}>
                  {t("notif_empty") || "Tidak ada notifikasi"}
                </span>
                <span className={`text-[10px] ${isLightMode ? "text-neutral-400" : "text-white/35"}`}>
                  {isEn ? "All new notifications will appear here" : "Semua notifikasi baru akan tercatat di sini"}
                </span>
              </div>
            ) : (
              groupedNotifications.map((group) => (
                <div key={group.key} className="flex flex-col gap-1.5">
                  <div
                    className={`text-[10px] font-bold uppercase tracking-widest px-1 py-1 ${
                      isLightMode ? "text-neutral-500" : "text-white/40"
                    }`}
                  >
                    {group.label}
                  </div>
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      title={isEn ? `Open ${formatAppName(item.appName || item.title)}` : `Buka ${formatAppName(item.appName || item.title)}`}
                      className={`group relative flex items-start gap-3 p-2.5 rounded-2xl border transition-all duration-200 ease-out cursor-pointer ${
                        isLightMode
                          ? item.read
                            ? "bg-black/[0.03] hover:bg-black/[0.06] border-black/[0.06] shadow-none"
                            : "bg-white hover:bg-white/95 border-black/10 shadow-[0_2px_10px_rgba(0,0,0,0.06)]"
                          : item.read
                            ? "bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.06]"
                            : "bg-white/[0.07] hover:bg-white/[0.12] border-white/15 shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
                      }`}
                    >
                      {/* Brand App / Category Icon Badge */}
                      <NotifIcon
                        type={item.icon}
                        appName={item.appName}
                        size={17}
                        boxClassName="w-8 h-8 rounded-xl shrink-0 shadow-sm"
                      />

                      {/* Body Text */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-1.5 min-w-0 flex-1">
                            <span className={`text-[12px] font-semibold leading-snug break-words truncate group-hover:whitespace-normal group-hover:overflow-visible group-hover:text-clip ${
                              isLightMode ? "text-[#1d1d1f]" : "text-white"
                            }`}>
                              {item.title}
                            </span>
                            {!item.read && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_6px_#3b82f6] shrink-0 mt-1"
                                title={t("notif_filter_unread") || (isEn ? "Unread" : "Belum dibaca")}
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 pl-1 pt-0.5">
                            <span className={`text-[10px] tabular-nums font-medium ${
                              isLightMode ? "text-neutral-500" : "text-white/40"
                            }`}>
                              {formatTime(item.timestamp)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteItem(item.id, e)}
                              title={isEn ? "Delete this notification" : "Hapus notifikasi ini"}
                              className={`opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                                isLightMode
                                  ? "bg-black/[0.06] hover:bg-red-500/15 text-neutral-500 hover:text-red-500"
                                  : "bg-white/10 hover:bg-red-500/25 text-white/50 hover:text-red-400"
                              }`}
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </div>

                        <p className={`text-[11px] leading-relaxed break-words [overflow-wrap:anywhere] line-clamp-2 max-h-[2.6em] overflow-hidden group-hover:max-h-[5.2em] group-hover:line-clamp-none group-hover:whitespace-pre-wrap transition-all duration-200 ${
                          isLightMode ? "text-[#48484a] group-hover:text-[#1d1d1f]" : "text-white/65 group-hover:text-white/90"
                        }`}>
                          {item.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Controls & Per Aplikasi Sidebar */}
        <div className="w-[195px] shrink-0 flex flex-col gap-2.5 overflow-hidden">
          {/* Card 1: Jangan Ganggu (Do Not Disturb) */}
          <div className={`p-3 rounded-2xl flex items-center justify-between gap-2 shadow-sm ${
            isLightMode
              ? "bg-white border border-black/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              : "bg-white/[0.05] border border-white/10"
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                isLightMode
                  ? "bg-purple-100 border border-purple-300/50 text-purple-600"
                  : "bg-purple-500/20 border border-purple-500/30 text-purple-400"
              }`}>
                <Moon size={15} strokeWidth={2.2} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className={`text-[11.5px] font-semibold leading-tight truncate ${
                  isLightMode ? "text-[#1d1d1f]" : "text-white"
                }`}>
                  {t("notif_dnd_title") || "Jangan ganggu"}
                </span>
                <span className={`text-[9.5px] leading-tight truncate mt-0.5 ${
                  isLightMode ? "text-neutral-500" : "text-white/45"
                }`}>
                  {isDnd ? (isEn ? "Active" : "Aktif") : "22:00 – 06:00"}
                </span>
              </div>
            </div>

            {/* iOS Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={isDnd}
              aria-label={t("notif_dnd_title")}
              onClick={handleToggleDnd}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 relative ${
                isDnd ? "bg-purple-600" : isLightMode ? "bg-black/15" : "bg-white/20"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-200 ${
                  isDnd ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Card 2: Per Aplikasi Summary & Mute Toggles */}
          <div className={`flex-1 p-3 rounded-2xl flex flex-col overflow-hidden shadow-sm ${
            isLightMode
              ? "bg-white border border-black/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              : "bg-white/[0.05] border border-white/10"
          }`}>
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className={`text-[10px] font-bold tracking-wider uppercase ${
                isLightMode ? "text-neutral-500" : "text-white/40"
              }`}>
                {t("notif_per_app") || "PER APP"}
              </span>
              {selectedApp && (
                <button
                  type="button"
                  onClick={() => setSelectedApp(null)}
                  className="text-[9.5px] font-medium text-blue-500 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 settings-scroll">
              {perAppList.length === 0 ? (
                <div className={`h-full flex flex-col items-center justify-center text-center py-6 px-1 ${
                  isLightMode ? "text-neutral-400" : "text-white/35"
                }`}>
                  <span className="text-[10.5px] leading-tight">{isEn ? "No notifications yet" : "Belum ada notifikasi"}</span>
                </div>
              ) : (
                perAppList.map((app) => {
                  const isSelected = selectedApp?.toLowerCase() === app.name.toLowerCase();
                  const isMuted = mutedApps.includes(app.name);

                  return (
                    <div
                      key={app.name}
                      onClick={() => setSelectedApp(isSelected ? null : app.name)}
                      title={isEn ? `Filter ${formatAppName(app.name)} notifications` : `Filter notifikasi ${app.name}`}
                      className={`group flex items-center justify-between py-1 px-2 rounded-xl text-[11px] transition-all cursor-pointer select-none ${
                        isSelected
                          ? isLightMode
                            ? "bg-black/[0.07] text-[#1d1d1f] font-semibold ring-1 ring-black/10"
                            : "bg-white/15 text-white font-medium ring-1 ring-white/20"
                          : isLightMode
                          ? "text-neutral-700 hover:bg-black/[0.04] hover:text-black"
                          : "text-white/80 hover:bg-white/[0.07] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <NotifIcon
                          appName={app.name}
                          type={app.category}
                          size={13}
                          boxClassName="w-5 h-5 rounded-md shrink-0 shadow-xs"
                        />
                        <span className="truncate">{formatAppName(app.name)}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-1">
                        <span className={`text-[10.5px] font-mono tabular-nums ${
                          isLightMode ? "text-neutral-500" : "text-white/50"
                        }`}>
                          {app.count}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleMute(app.name);
                          }}
                          aria-label={isEn ? `Unmute ${app.name} notifications` : `${isMuted ? "Bunyikan" : "Bisukan"} notifikasi ${app.name}`}
                          title={isMuted ? `Bunyikan notifikasi ${app.name}` : `Bisukan notifikasi ${app.name}`}
                          className={`w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer ${
                            isMuted
                              ? "text-red-500 bg-red-500/15"
                              : isLightMode
                              ? "text-neutral-400 hover:text-black hover:bg-black/[0.06]"
                              : "text-white/40 hover:text-white hover:bg-white/10"
                          }`}
                        >
                          {isMuted ? <BellOff size={11} /> : <Bell size={11} />}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
