import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  Power,
  ChevronRight,
  User,
  FileText,
  RotateCcw,
  Moon,
} from "lucide-react";

interface WindowsPinnedApp {
  id: string;
  name: string;
  target_path: string;
  arguments: string;
  icon_base64?: string;
  icon_type?: string;
}

interface StartMenuViewProps {
  onClose: () => void;
  onOpenSearch?: () => void;
}

export const StartMenuView: React.FC<StartMenuViewProps> = ({
  onClose,
  onOpenSearch,
}) => {
  const [pinnedApps, setPinnedApps] = useState<WindowsPinnedApp[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showPowerMenu, setShowPowerMenu] = useState<boolean>(false);

  useEffect(() => {
    invoke<WindowsPinnedApp[]>("get_windows_pinned_apps")
      .then((apps) => {
        if (Array.isArray(apps) && apps.length > 0) {
          setPinnedApps(apps);
        }
      })
      .catch(() => {});
  }, []);

  const handleLaunchApp = (app: WindowsPinnedApp) => {
    invoke("launch_pinned_app", { app }).catch(() => {});
    onClose();
  };

  const handlePowerAction = (action: "sleep" | "restart" | "shutdown") => {
    setShowPowerMenu(false);
    onClose();
    // Dispatch power command or shell run
    if (action === "shutdown") {
      invoke("run_command", { command: "shutdown /s /t 0" }).catch(() => {});
    } else if (action === "restart") {
      invoke("run_command", { command: "shutdown /r /t 0" }).catch(() => {});
    } else if (action === "sleep") {
      invoke("run_command", { command: "rundll32.exe powrprof.dll,SetSuspendState 0,1,0" }).catch(() => {});
    }
  };

  // Filter apps if search query is typed
  const displayedApps = searchQuery.trim()
    ? pinnedApps.filter((a) =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : pinnedApps.slice(0, 18);

  const defaultRecent = [
    { name: "Proyek Island UI", desc: "Baru saja dibuka", icon: FileText },
    { name: "Catatan Rapat.docx", desc: "Kemarin 16:42", icon: FileText },
    { name: "Desain Taskbar.fig", desc: "3 hari yang lalu", icon: FileText },
    { name: "Anggaran 2026.xlsx", desc: "Minggu lalu", icon: FileText },
  ];

  return (
    <div className="flex flex-col h-full gap-3 select-none text-[var(--taskbar-text)] relative">
      {/* 1. TOP SEARCH BAR (Board 87 / 91) */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-10 rounded-xl bg-[var(--taskbar-control-bg)] border border-[var(--taskbar-control-border)] flex items-center gap-2.5 px-3 text-[var(--taskbar-text-2)] focus-within:border-[var(--taskbar-accent)] focus-within:ring-1 focus-within:ring-[var(--taskbar-accent)] transition-all">
          <Search className="w-4 h-4 text-[var(--taskbar-text-muted)] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari aplikasi, pengaturan, dan dokumen"
            className="w-full bg-transparent border-0 outline-none text-[12.5px] text-[var(--taskbar-text)] placeholder-[var(--taskbar-text-muted)]"
          />
        </div>
      </div>

      {/* 2. PINNED APPS SECTION (Board 87 / 91) */}
      <div className="flex flex-col gap-1.5 flex-1 min-h-0">
        <div className="flex items-center justify-between h-7 px-1">
          <span className="text-[12px] font-semibold text-[var(--taskbar-text)]">
            Disematkan
          </span>
          <button
            type="button"
            onClick={onOpenSearch}
            className="h-6 px-2.5 rounded-md bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] text-[11px] font-medium text-[var(--taskbar-text-2)] flex items-center gap-1 transition-colors"
          >
            <span>Semua aplikasi</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* 6-column grid */}
        <div className="grid grid-cols-6 gap-1 overflow-y-auto max-h-[220px] custom-scrollbar p-1">
          {displayedApps.length === 0 ? (
            <div className="col-span-6 py-6 text-center text-[12px] text-[var(--taskbar-text-muted)]">
              {searchQuery ? "Aplikasi tidak ditemukan" : "Memuat aplikasi tersemat..."}
            </div>
          ) : (
            displayedApps.map((app) => (
              <button
                key={app.id || app.name}
                type="button"
                onClick={() => handleLaunchApp(app)}
                className="h-[74px] rounded-xl flex flex-col items-center justify-center gap-1.5 p-1 hover:bg-[var(--taskbar-item-hover)] active:scale-95 transition-all text-center group"
              >
                <div className="w-9 h-9 rounded-lg bg-[var(--taskbar-chip)] flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
                  {app.icon_base64 ? (
                    <img
                      src={`data:image/png;base64,${app.icon_base64}`}
                      alt={app.name}
                      className="w-7 h-7 object-contain"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded bg-[var(--taskbar-accent)] text-white text-[11px] font-bold flex items-center justify-center">
                      {app.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-[10.5px] text-[var(--taskbar-text)] truncate w-full px-1 font-medium leading-tight">
                  {app.name}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="w-full h-px bg-[var(--taskbar-separator)] shrink-0" />

      {/* 3. DIREKOMENDASIKAN / TERBARU (Board 87 / 91) */}
      <div className="flex flex-col gap-1.5 shrink-0">
        <div className="flex items-center justify-between h-7 px-1">
          <span className="text-[12px] font-semibold text-[var(--taskbar-text)]">
            Direkomendasikan
          </span>
          <button
            type="button"
            className="h-6 px-2 rounded-md hover:bg-[var(--taskbar-chip-hover)] text-[11px] font-medium text-[var(--taskbar-text-muted)] hover:text-[var(--taskbar-text)] flex items-center gap-1 transition-colors"
          >
            <span>Lainnya</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 px-1">
          {defaultRecent.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="h-11 rounded-lg p-2 flex items-center gap-2.5 hover:bg-[var(--taskbar-item-hover)] cursor-pointer transition-colors"
              >
                <div className="w-7 h-7 rounded-md bg-[var(--taskbar-chip)] flex items-center justify-center shrink-0 text-[var(--taskbar-accent)]">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11.5px] font-medium truncate text-[var(--taskbar-text)]">
                    {item.name}
                  </span>
                  <span className="text-[10px] text-[var(--taskbar-text-muted)] truncate">
                    {item.desc}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-full h-px bg-[var(--taskbar-separator)] shrink-0 mt-auto" />

      {/* 4. FOOTER: USER & POWER BUTTON (Board 87 / 91) */}
      <div className="flex items-center justify-between h-10 px-2 relative shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[var(--taskbar-chip)] border border-[var(--taskbar-chip-border)] flex items-center justify-center text-[var(--taskbar-text)] font-semibold text-[12px]">
            <User className="w-4 h-4 text-[var(--taskbar-text-2)]" />
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-semibold text-[var(--taskbar-text)]">
              Pengguna
            </span>
            <span className="text-[10px] text-[var(--taskbar-text-muted)]">
              Administrator
            </span>
          </div>
        </div>

        {/* Power Menu Popover */}
        {showPowerMenu && (
          <div className="absolute right-2 bottom-12 w-40 rounded-xl bg-[var(--taskbar-card)] border border-[var(--taskbar-card-border)] shadow-xl p-1.5 flex flex-col gap-1 z-50">
            <button
              type="button"
              onClick={() => handlePowerAction("sleep")}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] hover:bg-[var(--taskbar-item-hover)] text-[var(--taskbar-text)] text-left"
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Tidur (Sleep)</span>
            </button>
            <button
              type="button"
              onClick={() => handlePowerAction("restart")}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] hover:bg-[var(--taskbar-item-hover)] text-[var(--taskbar-text)] text-left"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Mulai ulang</span>
            </button>
            <button
              type="button"
              onClick={() => handlePowerAction("shutdown")}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] hover:bg-[var(--taskbar-item-hover)] text-[var(--taskbar-status-red)] text-left font-medium"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Matikan</span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowPowerMenu(!showPowerMenu)}
          aria-label="Daya (Power)"
          className="w-8 h-8 rounded-lg bg-[var(--taskbar-chip)] hover:bg-[var(--taskbar-chip-hover)] flex items-center justify-center text-[var(--taskbar-text)] transition-colors"
        >
          <Power className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
