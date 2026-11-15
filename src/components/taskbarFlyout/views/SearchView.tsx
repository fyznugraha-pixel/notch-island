import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Search,
  Clock,
  Globe,
  FileText,
  Settings,
  X,
  ArrowUpRight,
  AppWindow,
} from "lucide-react";
import { useWindowsPinnedApps } from "../../../hooks/useWindowsPinnedApps";
import { normalizeIconUrl } from "../../navbar/groups/appIcons";
import {
  RecentFileEntry,
  SettingsShortcutEntry,
  WindowsPinnedAppItem,
  formatRelativeTimestamp,
  getLocalizedWindowsSettingsShortcuts,
  launchRecentFile,
  launchSystemTarget,
  launchWindowsApp,
} from "../../../services/taskbarLaunchService";
import { useTaskbarLang, tx } from "../../../services/taskbarI18n";
import { Tooltip } from "../../ui/Tooltip";
import {
  getAppCacheKey,
  scoreAppSearchMatch,
} from "../../../utils/appSearchMatcher";

interface SearchViewProps {
  onClose: () => void;
  initialTab?: "all" | "apps";
  initialQuery?: string;
  onConsumeInitialQuery?: () => void;
}

type SearchTabId = "all" | "apps" | "docs" | "settings" | "web";

type SearchEntry =
  | { kind: "app"; id: string; title: string; subtitle: string; icon?: string; app: WindowsPinnedAppItem }
  | { kind: "file"; id: string; title: string; subtitle: string; icon?: string; file: RecentFileEntry }
  | { kind: "setting"; id: string; title: string; subtitle: string; setting: SettingsShortcutEntry }
  | { kind: "web"; id: string; title: string; subtitle: string; query: string };

const SEARCH_HISTORY_KEY = "gili_search_history_v1";

function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveSearchQuery(q: string): string[] {
  const clean = q.trim();
  if (!clean) return loadSearchHistory();
  const next = [clean, ...loadSearchHistory().filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, 6);
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

const renderEntryIcon = (entry: SearchEntry, sizeClass = "w-5 h-5") => {
  if ((entry.kind === "app" || entry.kind === "file") && entry.icon) {
    return <img src={entry.icon} alt="" className={`${sizeClass} object-contain shrink-0`} />;
  }
  if (entry.kind === "setting") return <Settings className={`${sizeClass} text-[var(--taskbar-link)] shrink-0`} />;
  if (entry.kind === "web") return <Globe className={`${sizeClass} text-[var(--taskbar-link)] shrink-0`} />;
  if (entry.kind === "file") return <FileText className={`${sizeClass} text-[var(--taskbar-link)] shrink-0`} />;
  return <AppWindow className={`${sizeClass} text-[var(--taskbar-text-2)] shrink-0`} />;
};

export const SearchView: React.FC<SearchViewProps> = ({
  onClose,
  initialTab = "all",
  initialQuery = "",
  onConsumeInitialQuery,
}) => {
  const lang = useTaskbarLang();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SearchTabId>(initialTab);
  const [startApps, setStartApps] = useState<WindowsPinnedAppItem[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);
  const [recentQueries, setRecentQueries] = useState<string[]>(() => loadSearchHistory());
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [lazyIcons, setLazyIcons] = useState<Record<string, string>>({});
  const [iconFetchLimit, setIconFetchLimit] = useState(36);
  const requestedIconKeysRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);
  const { pinnedApps } = useWindowsPinnedApps(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshInstalledApps = useCallback(() => {
    invoke<WindowsPinnedAppItem[]>("get_start_menu_apps")
      .then((apps) => {
        if (Array.isArray(apps)) setStartApps(apps);
      })
      .catch(() => {})
      .finally(() => setAppsLoading(false));
  }, []);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!initialQuery) return;
    setQuery((prev) => prev + initialQuery);
    onConsumeInitialQuery?.();
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  }, [initialQuery, onConsumeInitialQuery]);

  useEffect(() => {
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 30);

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (document.activeElement === inputRef.current) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        inputRef.current?.focus();
        setQuery((prev) => prev.slice(0, -1));
      } else if (e.key.length === 1) {
        e.preventDefault();
        inputRef.current?.focus();
        setQuery((prev) => prev + e.key);
      }
    };
    window.addEventListener("keydown", handleWindowKeyDown);

    refreshInstalledApps();

    invoke<RecentFileEntry[]>("get_recent_files", { limit: 12 })
      .then((files) => { if (Array.isArray(files)) setRecentFiles(files); })
      .catch(() => {});

    const unlisten = listen<{ isOpen?: boolean; target?: string }>(
      "taskbar-flyout-state-changed",
      (ev) => {
        if (ev.payload?.isOpen && ev.payload?.target === "search") {
          refreshInstalledApps();
          setTimeout(() => inputRef.current?.focus(), 40);
        }
      }
    );

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleWindowKeyDown);
      unlisten.then((fn) => fn());
    };
  }, [refreshInstalledApps]);

  const pinnedNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const app of pinnedApps) {
      set.add(app.name.trim().toLowerCase());
    }
    return set;
  }, [pinnedApps]);

  const allApps = useMemo(() => {
    const idxByName = new Map<string, number>();
    const combined: WindowsPinnedAppItem[] = [];
    for (const app of [...pinnedApps, ...startApps]) {
      const key = app.name.trim().toLowerCase();
      const existingIdx = idxByName.get(key);
      if (existingIdx === undefined) {
        idxByName.set(key, combined.length);
        combined.push(app);
      } else {
        const existing = combined[existingIdx];
        if (
          (!existing.target_path && app.target_path) ||
          (!existing.icon_base64 && app.icon_base64)
        ) {
          combined[existingIdx] = {
            ...existing,
            target_path: existing.target_path || app.target_path,
            icon_base64: existing.icon_base64 || app.icon_base64,
          };
        }
      }
    }
    return combined;
  }, [pinnedApps, startApps]);

  const getResolvedAppIcon = useCallback(
    (app: WindowsPinnedAppItem) => {
      const raw = app.icon_base64 || lazyIcons[getAppCacheKey(app)];
      return normalizeIconUrl(raw);
    },
    [lazyIcons]
  );

  const localizedSettingsShortcuts = useMemo(
    () => getLocalizedWindowsSettingsShortcuts(lang),
    [lang]
  );

  const trimmedQuery = query.trim().toLowerCase();

  const results = useMemo<SearchEntry[]>(() => {
    const entries: SearchEntry[] = [];

    if (activeTab === "all" || activeTab === "apps") {
      let matchingApps: WindowsPinnedAppItem[];
      if (trimmedQuery) {
        const scored: Array<{ app: WindowsPinnedAppItem; score: number }> = [];
        for (const app of allApps) {
          const isPinned = pinnedNameSet.has(app.name.trim().toLowerCase());
          const score = scoreAppSearchMatch(app, trimmedQuery, isPinned);
          if (score > 0) scored.push({ app, score });
        }
        scored.sort(
          (a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name)
        );
        const cap = activeTab === "apps" ? 60 : 15;
        matchingApps = scored.slice(0, cap).map((entry) => entry.app);
      } else if (activeTab === "apps") {
        matchingApps = [...allApps]
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 250);
      } else {
        matchingApps = allApps.slice(0, 10);
      }

      for (const app of matchingApps) {
        entries.push({
          kind: "app",
          id: `app-${getAppCacheKey(app)}-${app.name}`,
          title: app.name,
          subtitle: tx(lang, "App", "Aplikasi"),
          icon: getResolvedAppIcon(app),
          app,
        });
      }
    }

    if (activeTab === "all" || activeTab === "docs") {
      const matchingFiles = trimmedQuery
        ? recentFiles.filter(
            (f) => f.name.toLowerCase().includes(trimmedQuery) || f.folder.toLowerCase().includes(trimmedQuery)
          )
        : recentFiles;
      for (const file of matchingFiles.slice(0, activeTab === "docs" ? 12 : 5)) {
        entries.push({
          kind: "file",
          id: file.id,
          title: file.name,
          subtitle: `${formatRelativeTimestamp(file.modified_ts, lang)} · ${file.folder}`,
          icon: normalizeIconUrl(file.icon_base64),
          file,
        });
      }
    }

    if (activeTab === "all" || activeTab === "settings") {
      const matchingSettings = trimmedQuery
        ? localizedSettingsShortcuts.filter(
            (s) => s.name.toLowerCase().includes(trimmedQuery) || s.keywords.includes(trimmedQuery)
          )
        : activeTab === "settings"
        ? localizedSettingsShortcuts
        : [];
      for (const setting of matchingSettings) {
        entries.push({ kind: "setting", id: setting.id, title: setting.name, subtitle: setting.subtitle, setting });
      }
    }

    if ((activeTab === "web" || (activeTab === "all" && trimmedQuery)) && query.trim()) {
      entries.push({
        kind: "web",
        id: "web-search",
        title: tx(
          lang,
          `Search "${query.trim()}" on Google`,
          `Cari "${query.trim()}" di Google`
        ),
        subtitle: tx(
          lang,
          "Open search results in default browser",
          "Buka hasil pencarian di browser default"
        ),
        query: query.trim(),
      });
    }

    return entries;
  }, [
    activeTab,
    allApps,
    recentFiles,
    localizedSettingsShortcuts,
    trimmedQuery,
    query,
    lang,
    pinnedNameSet,
    getResolvedAppIcon,
  ]);

  useEffect(() => {
    setSelectedIdx(0);
    setIconFetchLimit(36);
  }, [trimmedQuery, activeTab]);

  useEffect(() => {
    const candidates: WindowsPinnedAppItem[] =
      !trimmedQuery && activeTab === "all"
        ? allApps.slice(0, 12)
        : results
            .filter((entry): entry is Extract<SearchEntry, { kind: "app" }> => entry.kind === "app")
            .slice(0, iconFetchLimit)
            .map((entry) => entry.app);

    const requests: Array<{ key: string; lnk_path: string; target_path: string }> = [];
    for (const app of candidates) {
      const key = getAppCacheKey(app);
      if (app.icon_base64 || requestedIconKeysRef.current.has(key)) {
        continue;
      }
      requestedIconKeysRef.current.add(key);
      requests.push({
        key,
        lnk_path: app.lnk_path,
        target_path: app.target_path,
      });
    }

    if (requests.length === 0) return;

    const chunkSize = 8;
    for (let i = 0; i < requests.length; i += chunkSize) {
      const chunk = requests.slice(i, i + chunkSize);
      invoke<Record<string, string>>("get_start_app_icons", { requests: chunk })
        .then((fetched) => {
          if (!isMountedRef.current || !fetched) return;
          if (Object.keys(fetched).length > 0) {
            setLazyIcons((prev) => ({ ...prev, ...fetched }));
          }
        })
        .catch(() => {
          for (const item of chunk) {
            requestedIconKeysRef.current.delete(item.key);
          }
        });
    }
  }, [allApps, results, activeTab, trimmedQuery, iconFetchLimit]);

  const executeEntry = (entry: SearchEntry) => {
    if (query.trim()) setRecentQueries(saveSearchQuery(query));
    if (entry.kind === "app") {
      launchWindowsApp(entry.app).catch(() => {});
    } else if (entry.kind === "file") {
      launchRecentFile(entry.file).catch(() => {});
    } else if (entry.kind === "setting") {
      launchSystemTarget(entry.setting.uri).catch(() => {});
    } else {
      launchSystemTarget(`https://www.google.com/search?q=${encodeURIComponent(entry.query)}`).catch(() => {});
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = results[selectedIdx];
      if (chosen) executeEntry(chosen);
    }
  };

  const selectedEntry = results[selectedIdx] ?? results[0];
  const isDefaultOverview = !trimmedQuery && activeTab === "all";

  return (
    <div className="flex flex-col h-full select-none">
      {/* Top Search Input */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-[var(--taskbar-link)] absolute left-3.5 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tx(
            lang,
            "Type to search apps, documents, or settings...",
            "Ketik untuk mencari aplikasi, dokumen, atau pengaturan..."
          )}
          className="w-full pl-10 pr-9 py-2.5 rounded-full bg-[var(--taskbar-control-bg)] border border-[var(--taskbar-separator)] focus:border-[var(--taskbar-accent)] text-[12.5px] text-[var(--taskbar-text)] placeholder:text-[var(--taskbar-text-2)] outline-none transition-colors"
        />
        {query && (
          <div className="absolute right-2 flex items-center">
            <Tooltip content={tx(lang, "Clear search", "Hapus pencarian")} allowFlip>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label={tx(lang, "Clear search", "Hapus pencarian")}
                className="p-1 rounded-full hover:bg-[var(--taskbar-item-hover)] text-[var(--taskbar-text-2)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 mt-3 mb-2 border-b border-[var(--taskbar-separator)] pb-2 overflow-x-auto no-scrollbar">
        {[
          { id: "all", label: tx(lang, "All", "Semua") },
          { id: "apps", label: tx(lang, "Apps", "Aplikasi") },
          { id: "docs", label: tx(lang, "Documents", "Dokumen") },
          { id: "settings", label: tx(lang, "Settings", "Pengaturan") },
          { id: "web", label: "Web" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as SearchTabId)}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-[var(--taskbar-accent)] text-[var(--taskbar-accent-text)]"
                : "text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] hover:bg-[var(--taskbar-item-hover)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Results / Overview Grid */}
      {isDefaultOverview ? (
        <div className="flex-1 grid grid-cols-12 gap-3.5 py-1.5 overflow-hidden">
          <div className="col-span-5 flex flex-col gap-2 overflow-y-auto no-scrollbar pr-1">
            {recentQueries.length > 0 && (
              <>
                <span className="text-[11px] font-semibold text-[var(--taskbar-text-2)] px-1 uppercase tracking-wider">
                  {tx(lang, "Search History", "Riwayat Pencarian")}
                </span>
                <div className="space-y-0.5 mb-2">
                  {recentQueries.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setQuery(item)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[var(--taskbar-item-hover)] transition-colors cursor-pointer text-left"
                    >
                      <Clock className="w-3.5 h-3.5 text-[var(--taskbar-text-2)] shrink-0" />
                      <span className="text-[11.5px] text-[var(--taskbar-text)] truncate">{item}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <span className="text-[11px] font-semibold text-[var(--taskbar-text-2)] px-1 uppercase tracking-wider">
              {tx(lang, "Recent Files", "Berkas Terbaru")}
            </span>
            {recentFiles.length === 0 ? (
              <div className="px-2.5 py-2 text-[11px] text-[var(--taskbar-text-2)]">
                {tx(lang, "No recent documents.", "Tidak ada dokumen terbaru.")}
              </div>
            ) : (
              <div className="space-y-1">
                {recentFiles.slice(0, 6).map((file) => {
                  const iconUrl = normalizeIconUrl(file.icon_base64);
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => {
                        launchRecentFile(file).catch(() => {});
                        onClose();
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--taskbar-item-hover)] transition-colors cursor-pointer text-left"
                    >
                      {iconUrl ? (
                        <img src={iconUrl} alt="" className="w-4 h-4 object-contain shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-[var(--taskbar-link)] shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[11.5px] text-[var(--taskbar-text)] truncate">{file.name}</div>
                        <div className="text-[10px] text-[var(--taskbar-text-2)] truncate">
                          {formatRelativeTimestamp(file.modified_ts, lang)} · {file.folder}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="col-span-7 flex flex-col gap-2 border-l border-[var(--taskbar-separator)] pl-3.5 overflow-y-auto no-scrollbar">
            <span className="text-[11px] font-semibold text-[var(--taskbar-text-2)] uppercase tracking-wider">
              {tx(lang, "Top Apps", "Aplikasi Populer")}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {allApps.slice(0, 9).map((app) => {
                const iconUrl = getResolvedAppIcon(app);
                return (
                  <button
                    key={`top-${getAppCacheKey(app)}-${app.name}`}
                    type="button"
                    onClick={() => {
                      launchWindowsApp(app).catch(() => {});
                      onClose();
                    }}
                    className="gili-flyout-card p-3 flex flex-col items-center justify-center gap-1.5 hover:bg-[var(--taskbar-item-hover)] transition-all cursor-pointer"
                  >
                    {iconUrl ? (
                      <img src={iconUrl} alt="" className="w-7 h-7 object-contain" />
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-[var(--taskbar-chip)] flex items-center justify-center text-[10px] font-bold">
                        {app.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="text-[11px] font-medium text-[var(--taskbar-text)] truncate w-full text-center">
                      {app.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-12 gap-3.5 py-1 overflow-hidden">
          <div
            onScroll={(e) => {
              const el = e.currentTarget;
              if (
                iconFetchLimit < results.length &&
                el.scrollTop + el.clientHeight >= el.scrollHeight - 240
              ) {
                setIconFetchLimit((prev) => Math.min(results.length, prev + 36));
              }
            }}
            className="col-span-7 overflow-y-auto no-scrollbar space-y-1 pr-1"
          >
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-2">
                <Search className="w-6 h-6 text-[var(--taskbar-text-2)]" />
                <span className="text-[12px] text-[var(--taskbar-text)] font-medium">
                  {activeTab === "web"
                    ? tx(lang, "Type keywords to search the web", "Ketik kata kunci untuk mencari di web")
                    : appsLoading && allApps.length === 0
                    ? tx(lang, "Indexing installed apps...", "Memindai aplikasi terpasang...")
                    : tx(lang, "No matching results", "Tidak ada hasil yang cocok")}
                </span>
              </div>
            ) : (
              results.map((entry, idx) => (
                <button
                  key={entry.id}
                  type="button"
                  onMouseEnter={() => setSelectedIdx(idx)}
                  onClick={() => executeEntry(entry)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors cursor-pointer text-left ${
                    idx === selectedIdx
                      ? "bg-[var(--taskbar-item-selected)] border border-[var(--taskbar-accent)]/40"
                      : "hover:bg-[var(--taskbar-item-hover)] border border-transparent"
                  }`}
                >
                  {renderEntryIcon(entry, "w-6 h-6")}
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-[var(--taskbar-text)] truncate">
                      {entry.title}
                    </div>
                    <div className="text-[10.5px] text-[var(--taskbar-text-2)] truncate">
                      {entry.subtitle}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="col-span-5 border-l border-[var(--taskbar-separator)] pl-3.5 flex flex-col justify-between">
            {selectedEntry ? (
              <div className="gili-flyout-card p-4 flex flex-col items-center text-center gap-2.5 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-[var(--taskbar-chip)] flex items-center justify-center">
                  {renderEntryIcon(selectedEntry, "w-8 h-8")}
                </div>
                <div className="w-full min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--taskbar-text)] truncate">
                    {selectedEntry.title}
                  </div>
                  <div className="text-[11px] text-[var(--taskbar-text-2)] mt-0.5 break-words">
                    {selectedEntry.kind === "file"
                      ? selectedEntry.file.path
                      : selectedEntry.kind === "app"
                      ? selectedEntry.app.target_path || selectedEntry.app.lnk_path
                      : selectedEntry.subtitle}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => executeEntry(selectedEntry)}
                  className="mt-2 w-full py-2 px-3 rounded-lg bg-[var(--taskbar-accent)] hover:bg-[var(--taskbar-accent-hover)] text-[var(--taskbar-accent-text)] text-[11.5px] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>{tx(lang, "Open", "Buka")}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="my-auto text-center text-[11px] text-[var(--taskbar-text-2)]">
                {tx(lang, "Select an item to view details.", "Pilih item untuk melihat detailnya.")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
