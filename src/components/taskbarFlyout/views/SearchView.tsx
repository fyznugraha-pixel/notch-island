import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { normalizeIconUrl } from "../../navbar/groups/appIcons";
import {
  Search,
  X,
  Clock,
  ArrowRight,
  Globe,
} from "lucide-react";

interface WindowsPinnedApp {
  id: string;
  name: string;
  target_path: string;
  arguments: string;
  icon_base64?: string;
  icon_type?: string;
}

interface SearchViewProps {
  onClose: () => void;
}

export const SearchView: React.FC<SearchViewProps> = ({ onClose }) => {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<
    "all" | "apps" | "docs" | "web" | "settings"
  >("all");
  const [pinnedApps, setPinnedApps] = useState<WindowsPinnedApp[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      // Launch web search or open default browser
      invoke("run_command", {
        command: `start https://www.google.com/search?q=${encodeURIComponent(
          query.trim()
        )}`,
      }).catch(() => {});
      onClose();
    }
  };

  const tabs = [
    { id: "all", label: "Semua" },
    { id: "apps", label: "Aplikasi" },
    { id: "docs", label: "Dokumen" },
    { id: "web", label: "Web" },
    { id: "settings", label: "Pengaturan" },
  ] as const;

  const recentSearches = [
    "Spotify",
    "Gili island settings",
    "Terminal PowerShell",
    "Windows update",
    "Catatan harian",
  ];

  const topApps = [
    { name: "Google Chrome", desc: "Aplikasi" },
    { name: "Visual Studio Code", desc: "Aplikasi" },
    { name: "File Explorer", desc: "Sistem" },
    { name: "Spotify", desc: "Musik" },
    { name: "Pengaturan", desc: "Sistem" },
  ];

  return (
    <div className="flex flex-col h-full gap-3.5 select-none text-[var(--taskbar-text)]">
      {/* 1. SEARCH INPUT BAR (Board 88 / 92) */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-11 rounded-xl bg-[var(--taskbar-control-bg)] border border-[var(--taskbar-control-border)] flex items-center gap-2.5 px-3.5 text-[var(--taskbar-text-2)] focus-within:border-[var(--taskbar-accent)] focus-within:ring-1 focus-within:ring-[var(--taskbar-accent)] transition-all">
          <Search className="w-4 h-4 text-[var(--taskbar-text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ketik untuk mencari aplikasi, dokumen, atau web..."
            className="w-full bg-transparent border-0 outline-none text-[13px] text-[var(--taskbar-text)] placeholder-[var(--taskbar-text-muted)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="p-1 rounded-full hover:bg-[var(--taskbar-chip)] text-[var(--taskbar-text-muted)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. CATEGORY TABS (Board 88 / 92) */}
      <div className="flex items-center gap-1.5 border-b border-[var(--taskbar-separator)] pb-2 px-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-[11.5px] font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-[var(--taskbar-chip-active)] text-white"
                : "text-[var(--taskbar-text-2)] hover:bg-[var(--taskbar-chip-hover)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3. SEARCH RESULTS OR RECENT/TOP APPS */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 custom-scrollbar pr-0.5">
        {query ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-semibold text-[var(--taskbar-text-muted)] px-1">
              Hasil pencarian web
            </span>
            <div
              onClick={() => {
                invoke("run_command", {
                  command: `start https://www.google.com/search?q=${encodeURIComponent(
                    query
                  )}`,
                }).catch(() => {});
                onClose();
              }}
              className="gili-flyout-card p-3 flex items-center justify-between cursor-pointer hover:bg-[var(--taskbar-item-hover)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--taskbar-accent)] text-white flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[12.5px] font-semibold text-[var(--taskbar-text)]">
                    Cari di web untuk "{query}"
                  </span>
                  <span className="text-[11px] text-[var(--taskbar-text-muted)]">
                    Buka hasil di browser default
                  </span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--taskbar-text-2)]" />
            </div>
          </div>
        ) : (
          <>
            {/* Top Apps */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-semibold text-[var(--taskbar-text-muted)] px-1">
                Aplikasi teratas
              </span>
              <div className="grid grid-cols-5 gap-2">
                {(pinnedApps.length > 0 ? pinnedApps.slice(0, 5) : topApps).map((app: any, idx) => (
                  <div
                    key={app.id || idx}
                    onClick={() => {
                      if (app.target_path) {
                        handleLaunchApp(app);
                      } else {
                        setQuery(app.name);
                      }
                    }}
                    className="h-16 rounded-xl bg-[var(--taskbar-card)] hover:bg-[var(--taskbar-item-hover)] active:scale-95 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all p-1"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[var(--taskbar-chip)] flex items-center justify-center overflow-hidden shrink-0">
                      {normalizeIconUrl(app.icon_base64) ? (
                        <img
                          src={normalizeIconUrl(app.icon_base64)}
                          alt={app.name}
                          className="w-5 h-5 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            const fb = e.currentTarget.parentElement?.querySelector(".search-app-fallback") as HTMLElement;
                            if (fb) fb.style.display = "inline";
                          }}
                        />
                      ) : null}
                      <span
                        className="search-app-fallback text-[var(--taskbar-accent)] text-[11px] font-bold"
                        style={{ display: normalizeIconUrl(app.icon_base64) ? "none" : "inline" }}
                      >
                        {app.name[0]}
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--taskbar-text)] truncate w-full text-center px-1 font-medium">
                      {app.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Searches */}
            <div className="flex flex-col gap-1 mt-1">
              <span className="text-[11.5px] font-semibold text-[var(--taskbar-text-muted)] px-1">
                Pencarian terbaru
              </span>
              <div className="flex flex-col gap-1">
                {recentSearches.map((term, idx) => (
                  <div
                    key={idx}
                    onClick={() => setQuery(term)}
                    className="h-8 rounded-lg px-2 flex items-center justify-between hover:bg-[var(--taskbar-item-hover)] cursor-pointer text-[var(--taskbar-text-2)] hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-[var(--taskbar-text-muted)]" />
                      <span className="text-[12px]">{term}</span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-[var(--taskbar-text-muted)]" />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
