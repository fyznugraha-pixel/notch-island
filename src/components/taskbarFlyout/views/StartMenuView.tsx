import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  Power,
  RotateCcw,
  Moon,
  Lock,
  User,
  ChevronRight,
  FileText,
  Folder,
  Code2,
  Image as ImageIcon,
} from "lucide-react";
import { useWindowsPinnedApps } from "../../../hooks/useWindowsPinnedApps";
import { normalizeIconUrl } from "../../navbar/groups/appIcons";
import {
  RecentFileEntry,
  WindowsPinnedAppItem,
  formatRelativeTimestamp,
  launchRecentFile,
  launchSystemTarget,
  launchWindowsApp,
} from "../../../services/taskbarLaunchService";
import { useTaskbarLang, tx } from "../../../services/taskbarI18n";
import { Tooltip } from "../../ui/Tooltip";

interface StartMenuViewProps {
  onClose: () => void;
  onOpenSearch: (initialTab?: "all" | "apps", initialQuery?: string) => void;
}

const renderRecentKindIcon = (kind: string) => {
  switch (kind) {
    case "folder":
      return <Folder className="w-4 h-4 text-[var(--taskbar-warning-text)]" />;
    case "code":
      return <Code2 className="w-4 h-4 text-[var(--taskbar-link)]" />;
    case "image":
      return <ImageIcon className="w-4 h-4 text-[var(--taskbar-status-green)]" />;
    default:
      return <FileText className="w-4 h-4 text-[var(--taskbar-link)]" />;
  }
};

export const StartMenuView: React.FC<StartMenuViewProps> = ({
  onClose,
  onOpenSearch,
}) => {
  const lang = useTaskbarLang();
  const { pinnedApps, isLoading: appsLoading } = useWindowsPinnedApps(true);
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);
  const [username, setUsername] = useState<string>("");
  const [showPowerMenu, setShowPowerMenu] = useState(false);
  const [confirmPower, setConfirmPower] = useState<"restart" | "shutdown" | null>(null);

  useEffect(() => {
    invoke<string>("get_username")
      .then((name) => {
        if (name && name.trim()) setUsername(name.trim());
      })
      .catch(() => {});

    invoke<RecentFileEntry[]>("get_recent_files", { limit: 6 })
      .then((items) => {
        if (Array.isArray(items)) setRecentFiles(items);
      })
      .catch(() => {});
  }, []);

  const handleLaunchApp = (app: WindowsPinnedAppItem) => {
    launchWindowsApp(app).catch(() => {});
    onClose();
  };

  const handleOpenRecent = (file: RecentFileEntry) => {
    launchRecentFile(file).catch(() => {});
    onClose();
  };

  const handlePowerAction = (action: "lock" | "sleep" | "restart" | "shutdown") => {
    if ((action === "restart" || action === "shutdown") && confirmPower !== action) {
      setConfirmPower(action);
      return;
    }
    setShowPowerMenu(false);
    setConfirmPower(null);
    invoke("system_power_action", { action }).catch(() => {});
    onClose();
  };

  return (
    <div className="flex flex-col h-full justify-between select-none">
      {/* Top Search Box Trigger */}
      <button
        type="button"
        onClick={() => onOpenSearch("all")}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-full bg-[var(--taskbar-control-bg)] border border-[var(--taskbar-separator)] hover:border-[var(--taskbar-accent)]/60 transition-colors cursor-text text-left"
      >
        <Search className="w-4 h-4 text-[var(--taskbar-text-2)] shrink-0" />
        <span className="text-[12px] text-[var(--taskbar-text-2)]">
          {tx(
            lang,
            "Search apps, files, or Windows settings...",
            "Cari aplikasi, file, atau pengaturan Windows..."
          )}
        </span>
      </button>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto py-3 pr-0.5 space-y-4 no-scrollbar">
        {/* Pinned Apps Section */}
        <div>
          <div className="flex items-center justify-between px-1 mb-2.5">
            <span className="text-[12px] font-semibold text-[var(--taskbar-text)]">
              {tx(lang, "Pinned", "Disematkan")}
            </span>
            <button
              type="button"
              onClick={() => onOpenSearch("apps")}
              className="gili-flyout-chip px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] flex items-center gap-1 cursor-pointer"
            >
              <span>{tx(lang, "All apps", "Semua aplikasi")}</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {appsLoading ? (
            <div className="grid grid-cols-6 gap-2 py-2">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-[68px] rounded-xl bg-[var(--taskbar-chip)] animate-pulse"
                />
              ))}
            </div>
          ) : pinnedApps.length === 0 ? (
            <div className="py-5 text-center text-[11.5px] text-[var(--taskbar-text-2)]">
              {tx(
                lang,
                "No apps pinned to the Windows Taskbar yet.",
                "Belum ada aplikasi disematkan di Taskbar Windows."
              )}
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-1.5">
              {pinnedApps.slice(0, 18).map((app) => {
                const iconUrl = normalizeIconUrl(app.icon_base64);
                return (
                  <Tooltip
                    key={app.id + app.lnk_path}
                    content={app.name}
                    allowFlip
                    wrapperClassName="w-full"
                  >
                    <button
                      type="button"
                      onClick={() => handleLaunchApp(app)}
                      className="w-full flex flex-col items-center justify-center p-2 rounded-xl hover:bg-[var(--taskbar-item-hover)] transition-all active:scale-95 cursor-pointer group"
                    >
                      <div className="w-8 h-8 flex items-center justify-center mb-1.5 rounded-lg overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
                        {iconUrl ? (
                          <img
                            src={iconUrl}
                            alt=""
                            className="w-7 h-7 object-contain"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-[var(--taskbar-chip)] flex items-center justify-center text-[11px] font-bold text-[var(--taskbar-text)]">
                            {app.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--taskbar-text)] truncate w-full text-center font-medium leading-tight">
                        {app.name}
                      </span>
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </div>

        {/* Recommended / Recent Files Section */}
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[12px] font-semibold text-[var(--taskbar-text)]">
              {tx(lang, "Recommended", "Direkomendasikan")}
            </span>
            <button
              type="button"
              onClick={() => onOpenSearch("all")}
              className="text-[11px] text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] flex items-center gap-0.5 cursor-pointer"
            >
              <span>{tx(lang, "More", "Lainnya")}</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {recentFiles.length === 0 ? (
            <div className="p-3 rounded-xl bg-[var(--taskbar-subtle-bg)] text-[11px] text-[var(--taskbar-text-2)]">
              {tx(
                lang,
                "No recent Windows documents yet.",
                "Belum ada riwayat dokumen terbaru Windows."
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {recentFiles.slice(0, 6).map((file) => {
                const fileIcon = normalizeIconUrl(file.icon_base64);
                return (
                  <Tooltip
                    key={file.id}
                    content={file.path}
                    allowFlip
                    wrapperClassName="w-full"
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenRecent(file)}
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-[var(--taskbar-item-hover)] transition-colors cursor-pointer text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[var(--taskbar-chip)] flex items-center justify-center shrink-0 overflow-hidden">
                        {fileIcon ? (
                          <img
                            src={fileIcon}
                            alt=""
                            className="w-5 h-5 object-contain"
                          />
                        ) : (
                          renderRecentKindIcon(file.kind)
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[11.5px] font-medium text-[var(--taskbar-text)] truncate">
                          {file.name}
                        </span>
                        <span className="text-[10px] text-[var(--taskbar-text-2)] truncate">
                          {formatRelativeTimestamp(file.modified_ts, lang)} · {file.folder}
                        </span>
                      </div>
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer: User Profile & Power */}
      <div className="pt-2.5 border-t border-[var(--taskbar-separator)] flex items-center justify-between relative">
        <Tooltip
          content={tx(lang, "Open Windows account settings", "Buka Pengaturan Akun Windows")}
          allowFlip
        >
          <button
            type="button"
            onClick={() => {
              launchSystemTarget("ms-settings:yourinfo").catch(() => {});
              onClose();
            }}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-[var(--taskbar-item-hover)] cursor-pointer transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[var(--taskbar-tile-active-bg)] border border-[var(--taskbar-tile-active-border)] flex items-center justify-center text-[var(--taskbar-link)]">
              <User className="w-4 h-4" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[12px] font-medium text-[var(--taskbar-text)] leading-tight">
                {username || tx(lang, "User", "Pengguna")}
              </span>
              <span className="text-[10px] text-[var(--taskbar-text-2)] leading-tight">
                {tx(lang, "Windows Account", "Akun Windows")}
              </span>
            </div>
          </button>
        </Tooltip>

        <div className="relative">
          <Tooltip content={tx(lang, "Power options", "Opsi Daya")} allowFlip>
            <button
              type="button"
              onClick={() => {
                setShowPowerMenu((v) => !v);
                setConfirmPower(null);
              }}
              aria-label={tx(lang, "Power options", "Opsi Daya")}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--taskbar-item-hover)] text-[var(--taskbar-text)] cursor-pointer transition-colors"
              aria-expanded={showPowerMenu}
            >
              <Power className="w-4 h-4" />
            </button>
          </Tooltip>

          {showPowerMenu && (
            <div className="absolute right-0 bottom-10 w-44 rounded-xl bg-[var(--taskbar-card)] border border-[var(--taskbar-separator)] shadow-xl p-1 z-50">
              <button
                type="button"
                onClick={() => handlePowerAction("lock")}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11.5px] text-[var(--taskbar-text)] hover:bg-[var(--taskbar-item-hover)] cursor-pointer text-left"
              >
                <Lock className="w-3.5 h-3.5 text-[var(--taskbar-text-2)]" />
                <span>{tx(lang, "Lock", "Kunci")}</span>
              </button>
              <button
                type="button"
                onClick={() => handlePowerAction("sleep")}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11.5px] text-[var(--taskbar-text)] hover:bg-[var(--taskbar-item-hover)] cursor-pointer text-left"
              >
                <Moon className="w-3.5 h-3.5 text-[var(--taskbar-text-2)]" />
                <span>{tx(lang, "Sleep", "Tidur")}</span>
              </button>
              <button
                type="button"
                onClick={() => handlePowerAction("restart")}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[11.5px] text-[var(--taskbar-text)] hover:bg-[var(--taskbar-item-hover)] cursor-pointer text-left"
              >
                <span className="flex items-center gap-2.5">
                  <RotateCcw className="w-3.5 h-3.5 text-[var(--taskbar-text-2)]" />
                  <span>{tx(lang, "Restart", "Mulai ulang")}</span>
                </span>
                {confirmPower === "restart" && (
                  <span className="text-[10px] font-semibold text-[var(--taskbar-warning-text)]">
                    {tx(lang, "Click again", "Klik lagi")}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handlePowerAction("shutdown")}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[11.5px] text-[var(--taskbar-danger-text)] hover:bg-[var(--taskbar-danger-bg)] cursor-pointer text-left"
              >
                <span className="flex items-center gap-2.5">
                  <Power className="w-3.5 h-3.5" />
                  <span>{tx(lang, "Shut down", "Matikan")}</span>
                </span>
                {confirmPower === "shutdown" && (
                  <span className="text-[10px] font-semibold">
                    {tx(lang, "Click again", "Klik lagi")}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
