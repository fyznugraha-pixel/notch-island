import React, { useState, useMemo } from "react";
import {
  MessageSquare,
  Bell,
  BellOff,
  Clipboard,
  Zap,
  Moon,
  Trash2,
  CheckCheck,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
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

export interface NotificationCenterPanelProps {
  notifications: NotificationHistoryItem[];
  onUpdateNotifications: (items: NotificationHistoryItem[]) => void;
  onDndChange?: (enabled: boolean) => void;
  isDndActive?: boolean;
}

const getAppDotColor = (name: string, category?: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes("whatsapp")) return "#34c759";
  if (lower.includes("telegram")) return "#229ed9";
  if (lower.includes("discord")) return "#5865f2";
  if (lower.includes("slack")) return "#e01e5a";
  if (lower.includes("mail") || lower.includes("outlook")) return "#0078d4";
  if (lower.includes("chrome") || lower.includes("google")) return "#ea4335";
  if (lower.includes("edge") || lower.includes("msedge")) return "#0078d4";
  if (lower.includes("firefox")) return "#ff7139";
  if (lower.includes("brave")) return "#fb542b";
  if (lower.includes("spotify")) return "#1ed760";
  if (lower.includes("apple") || lower.includes("itunes")) return "#fc3c44";
  if (lower.includes("pengingat") || lower.includes("reminder") || lower.includes("todo") || lower.includes("pomodoro")) return "#ff9f0a";
  if (lower.includes("clipboard") || lower.includes("klip")) return "#0a84ff";
  if (lower.includes("sistem") || lower.includes("system") || lower.includes("windows")) return "rgba(255, 255, 255, 0.75)";

  if (category === "message") return "#34c759";
  if (category === "reminder") return "#ff9f0a";
  if (category === "clipboard") return "#0a84ff";
  return "rgba(255, 255, 255, 0.75)";
};

export const NotificationCenterPanel: React.FC<NotificationCenterPanelProps> = ({
  notifications,
  onUpdateNotifications,
  onDndChange,
  isDndActive,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory>("all");
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [mutedApps, setMutedApps] = useState<string[]>(() => getMutedApps());
  const isDnd = isDndActive ?? getDndStatus();

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

  const handleClearAll = () => {
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
    try {
      await invoke("activate_notification_app", {
        appName: item.appName || item.title,
        aumid: item.aumid || null,
      });
    } catch {}
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
      const name = (item.appName || "Sistem").trim();
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
    return notifications.filter((item) => {
      if (selectedApp && (item.appName || "Sistem").toLowerCase() !== selectedApp.toLowerCase()) {
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

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "message":
        return (
          <div className="w-8 h-8 rounded-xl bg-[#16382b] border border-[#34c759]/25 flex items-center justify-center text-[#34c759] shrink-0">
            <MessageSquare size={15} strokeWidth={2.2} />
          </div>
        );
      case "reminder":
        return (
          <div className="w-8 h-8 rounded-xl bg-[#392c14] border border-[#ff9f0a]/25 flex items-center justify-center text-[#ff9f0a] shrink-0">
            <Bell size={15} strokeWidth={2.2} />
          </div>
        );
      case "clipboard":
        return (
          <div className="w-8 h-8 rounded-xl bg-[#142e42] border border-[#0a84ff]/25 flex items-center justify-center text-[#0a84ff] shrink-0">
            <Clipboard size={15} strokeWidth={2.2} />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-xl bg-[#262629] border border-white/10 flex items-center justify-center text-white/85 shrink-0">
            <Zap size={15} strokeWidth={2.2} />
          </div>
        );
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
                : "bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white border border-white/10"
            }`}
          >
            <span>{t("notif_filter_all") || "Semua"}</span>
            <span className={`text-[10px] ${selectedCategory === "all" && !selectedApp ? "text-white/90" : "text-white/50"}`}>
              {counts.total}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory("unread")}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer select-none flex items-center gap-1.5 shrink-0 ${
              selectedCategory === "unread"
                ? "bg-blue-600 text-white shadow-[0_2px_10px_rgba(37,99,235,0.45)]"
                : "bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white border border-white/10"
            }`}
          >
            <span>{t("notif_filter_unread") || "Belum dibaca"}</span>
            {counts.unread > 0 && (
              <span className={`text-[10px] ${selectedCategory === "unread" ? "text-white/90" : "text-white/50"}`}>
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
              title="Hapus filter aplikasi"
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: getAppDotColor(selectedApp) }}
              />
              <span>{selectedApp}</span>
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
              className="h-6 px-2 flex items-center gap-1 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 rounded-full text-[10px] text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              <CheckCheck size={11} className="text-blue-400" />
              <span>{t("notif_mark_all_read") || "Tandai dibaca"}</span>
            </button>
          )}

          {notifications.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              title={t("notif_clear_all") || "Hapus semua"}
              className="w-6 h-6 flex items-center justify-center bg-white/[0.06] hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-full text-white/60 hover:text-red-400 transition-colors cursor-pointer"
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
              <div className="h-full flex flex-col items-center justify-center text-center text-white/40 py-8 gap-1.5">
                <Bell size={20} className="text-white/25 stroke-[1.5]" />
                <span className="text-xs font-medium text-white/60">
                  {t("notif_empty") || "Tidak ada notifikasi"}
                </span>
                <span className="text-[10px] text-white/35">
                  Semua notifikasi baru akan tercatat di sini
                </span>
              </div>
            ) : (
              groupedNotifications.map((group) => (
                <div key={group.key} className="flex flex-col gap-1.5">
                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1 py-0.5 sticky top-0 bg-[#0c0c0e]/90 backdrop-blur-md z-10">
                    {group.label}
                  </div>
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className={`group relative flex items-start gap-3 p-2.5 rounded-2xl border transition-all duration-200 ease-out cursor-pointer ${
                        item.read
                          ? "bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.06]"
                          : "bg-white/[0.07] hover:bg-white/[0.12] border-white/15 shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
                      }`}
                    >
                      {/* Category / App Icon Badge */}
                      {getCategoryIcon(item.category)}

                      {/* Body Text */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-1.5 min-w-0 flex-1">
                            <span className="text-[12px] font-semibold text-white leading-snug break-words truncate group-hover:whitespace-normal group-hover:overflow-visible group-hover:text-clip">
                              {item.title}
                            </span>
                            {!item.read && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_6px_#3b82f6] shrink-0 mt-1"
                                title="Belum dibaca"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 pl-1 pt-0.5">
                            <span className="text-[10px] text-white/40 tabular-nums font-medium">
                              {formatTime(item.timestamp)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteItem(item.id, e)}
                              title="Hapus notifikasi ini"
                              className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-white/10 hover:bg-red-500/25 text-white/50 hover:text-red-400 flex items-center justify-center transition-all cursor-pointer shrink-0"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </div>

                        <p className="text-[11px] text-white/65 group-hover:text-white/90 leading-relaxed break-words [overflow-wrap:anywhere] line-clamp-2 group-hover:line-clamp-none group-hover:block group-hover:overflow-visible group-hover:whitespace-pre-wrap transition-all duration-200">
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
          <div className="p-3 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                <Moon size={15} strokeWidth={2.2} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11.5px] font-semibold text-white leading-tight truncate">
                  {t("notif_dnd_title") || "Jangan ganggu"}
                </span>
                <span className="text-[9.5px] text-white/45 leading-tight truncate mt-0.5">
                  {isDnd ? "Aktif" : "22:00 – 06:00"}
                </span>
              </div>
            </div>

            {/* iOS Switch */}
            <button
              type="button"
              onClick={handleToggleDnd}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 relative ${
                isDnd ? "bg-purple-600" : "bg-white/20"
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
          <div className="flex-1 p-3 rounded-2xl bg-white/[0.05] border border-white/10 flex flex-col overflow-hidden shadow-sm">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-[10px] font-bold text-white/40 tracking-wider uppercase">
                {t("notif_per_app") || "PER APP"}
              </span>
              {selectedApp && (
                <button
                  type="button"
                  onClick={() => setSelectedApp(null)}
                  className="text-[9.5px] font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 settings-scroll">
              {perAppList.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-white/35 py-6 px-1">
                  <span className="text-[10.5px] leading-tight">Belum ada notifikasi</span>
                </div>
              ) : (
                perAppList.map((app) => {
                  const isSelected = selectedApp?.toLowerCase() === app.name.toLowerCase();
                  const isMuted = mutedApps.includes(app.name);

                  return (
                    <div
                      key={app.name}
                      onClick={() => setSelectedApp(isSelected ? null : app.name)}
                      title={`Filter notifikasi ${app.name}`}
                      className={`group flex items-center justify-between py-1 px-2 rounded-xl text-[11px] transition-all cursor-pointer select-none ${
                        isSelected
                          ? "bg-white/15 text-white font-medium ring-1 ring-white/20"
                          : "text-white/80 hover:bg-white/[0.07] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: getAppDotColor(app.name, app.category) }}
                        />
                        <span className="truncate">{app.name}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-1">
                        <span className="text-[10.5px] font-mono text-white/50 tabular-nums">
                          {app.count}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleMute(app.name);
                          }}
                          title={isMuted ? `Bunyikan notifikasi ${app.name}` : `Bisukan notifikasi ${app.name}`}
                          className={`w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer ${
                            isMuted
                              ? "text-red-400 bg-red-500/15"
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
