import React, { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Download,
  HardDrive,
  Calendar,
  CalendarClock,
  ClipboardCopy,
  Globe,
  Timer,
  Wallet,
  Link2,
  Activity,
  GitBranch,
  FolderOpen,
  KanbanSquare,
  ShieldCheck,
} from "lucide-react";
import {
  addWidgetCountdown,
  addWidgetShortcut,
  addWidgetSnippet,
  addWidgetTimeProject,
  addWidgetUptimeSite,
  addWidgetWorldClock,
  clearWidgetIcalUrl,
  configureWidgetPhotoFolder,
  configureWidgetRecentFolders,
  exportWidgetTimeTrackerCsv,
  getWidgetIcalStatus,
  getWidgetPhotoFolderStatus,
  getWidgetStorageStatus,
  pickWidgetPhotoFolderDialog,
  pickWidgetStorageFolderDialog,
  saveGithubWidgetToken,
  saveWidgetIcalUrl,
  triggerWidgetStorageScan,
  WidgetIcalStatus,
  WidgetPhotoFolderStatus,
  WidgetStorageFolderStatus,
} from "../../../../services/desktopWidgetsService";
import { IosSegmentedControl } from "../../../ios/IosSegmentedControl";
import { KanbanProviderPanel } from "./KanbanProviderPanel";
import { ExpenseProviderPanel } from "./ExpenseProviderPanel";

interface WidgetProvidersCardProps {
  isLightMode: boolean;
  isId?: boolean;
  activeWidgetTypes: string[];
  onFlash: (msg: string) => void;
  focusProviderId?: string | null;
  focusNonce?: number;
}

type ProviderGroup = "all" | "productive" | "local" | "online";

interface ProviderRowProps {
  id: string;
  rowRef?: (el: HTMLDivElement | null) => void;
  expanded: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  installed?: boolean;
  installedLabel?: string;
  isLightMode: boolean;
  children: React.ReactNode;
}

const ProviderAccordionRow: React.FC<ProviderRowProps> = ({
  rowRef,
  expanded,
  onToggle,
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  installed = false,
  installedLabel = "Terpasang",
  isLightMode,
  children,
}) => {
  return (
    <div
      ref={rowRef}
      className={`rounded-[14px] border transition-colors overflow-hidden ${expanded
          ? isLightMode
            ? "border-[#0a84ff]/35 bg-black/[0.02]"
            : "border-[#0a84ff]/35 bg-white/[0.03]"
          : isLightMode
            ? "border-black/[0.06] bg-transparent hover:bg-black/[0.02]"
            : "border-white/[0.06] bg-transparent hover:bg-white/[0.025]"
        }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`text-[13px] font-semibold truncate ${isLightMode ? "text-neutral-900" : "text-zinc-100"
                  }`}
              >
                {title}
              </span>
              {installed && (
                <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold bg-[#34c759]/18 text-[#34c759]">
                  {installedLabel}
                </span>
              )}
            </div>
            <div
              className={`text-[11px] truncate mt-0.5 ${isLightMode ? "text-neutral-500" : "text-zinc-400"
                }`}
            >
              {subtitle}
            </div>
          </div>
        </div>
        <ChevronDown
          size={15}
          className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180 text-[#0a84ff]" : "text-zinc-400"
            }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3.5 pt-2 border-t border-white/[0.06] flex flex-col gap-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const WidgetProvidersCard: React.FC<WidgetProvidersCardProps> = ({
  isLightMode,
  isId = true,
  activeWidgetTypes,
  onFlash,
  focusProviderId = null,
  focusNonce = 0,
}) => {
  const [group, setGroup] = useState<ProviderGroup>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const bindRowRef = (id: string) => (el: HTMLDivElement | null) => {
    rowRefs.current[id] = el;
  };

  const [cdTitle, setCdTitle] = useState("");
  const [cdDate, setCdDate] = useState("2026-12-31");
  const [snLabel, setSnLabel] = useState("");
  const [snContent, setSnContent] = useState("");
  const [wcCity, setWcCity] = useState("");
  const [wcCode, setWcCode] = useState("SGT");
  const [wcOffset, setWcOffset] = useState("8");
  const [projectName, setProjectName] = useState("");
  const [shortcutName, setShortcutName] = useState("");
  const [shortcutPath, setShortcutPath] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteUrl, setSiteUrl] = useState("https://");
  const [ghRepo, setGhRepo] = useState("");
  const [ghToken, setGhToken] = useState("");
  const [icalUrl, setIcalUrl] = useState("");
  const [icalStatus, setIcalStatus] = useState<WidgetIcalStatus | null>(null);
  const [icalSaving, setIcalSaving] = useState(false);
  const [photoFolder, setPhotoFolder] = useState("");
  const [photoStatus, setPhotoStatus] = useState<WidgetPhotoFolderStatus | null>(null);
  const [storageFolder, setStorageFolder] = useState("");
  const [storageStatus, setStorageStatus] = useState<WidgetStorageFolderStatus | null>(null);
  const [recentFolder, setRecentFolder] = useState("");

  const refreshPhotoStatus = () => {
    getWidgetPhotoFolderStatus()
      .then((status) => {
        setPhotoStatus(status);
        setPhotoFolder(status.folder_path ?? "");
      })
      .catch(() => { });
  };

  const refreshStorageStatus = () => {
    getWidgetStorageStatus()
      .then((status) => {
        setStorageStatus(status);
        setStorageFolder(status.root_path);
      })
      .catch(() => { });
  };

  const formatScannedBytes = (bytes: number): string => {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return "";
  };

  const [dataRefreshNonce, setDataRefreshNonce] = useState(0);

  useEffect(() => {
    let disposed = false;
    getWidgetIcalStatus()
      .then((s) => {
        if (!disposed) setIcalStatus(s);
      })
      .catch(() => { });
    refreshPhotoStatus();
    refreshStorageStatus();

    let unsubData: (() => void) | null = null;
    listen<string>("desktop-widgets-data-updated", (ev) => {
      if (disposed) return;
      const kind = ev.payload;
      if (kind === "photo_folder") {
        refreshPhotoStatus();
      } else if (kind === "storage") {
        refreshStorageStatus();
      } else if (kind === "kanban" || kind === "expense") {
        setDataRefreshNonce((n) => n + 1);
      } else {
        refreshPhotoStatus();
        refreshStorageStatus();
        setDataRefreshNonce((n) => n + 1);
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else unsubData = fn;
      })
      .catch(() => { });

    return () => {
      disposed = true;
      if (unsubData) unsubData();
    };
  }, []);

  useEffect(() => {
    if (!focusProviderId) return;
    setGroup("all");
    setOpenId(focusProviderId);
    if (focusProviderId === "folders") {
      refreshPhotoStatus();
      refreshStorageStatus();
    }
    let rafInner = 0;
    const rafOuter = window.requestAnimationFrame(() => {
      rafInner = window.requestAnimationFrame(() => {
        rowRefs.current[focusProviderId]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    });
    return () => {
      window.cancelAnimationFrame(rafOuter);
      if (rafInner) window.cancelAnimationFrame(rafInner);
    };
  }, [focusProviderId, focusNonce]);

  const activeSet = new Set(activeWidgetTypes);
  const toggleRow = (id: string) => setOpenId((cur) => (cur === id ? null : id));
  const installedLabel = isId ? "Terpasang" : "Installed";

  const quickWorldCities = [
    { city: isId ? "Singapura" : "Singapore", code: "SGT", offset: 8 },
    { city: "Makassar", code: "WITA", offset: 8 },
    { city: "Jayapura", code: "WIT", offset: 9 },
    { city: "Seoul", code: "KST", offset: 9 },
    { city: "Sydney", code: "AEDT", offset: 11 },
  ];

  const cardClass = `w-full rounded-[18px] p-3.5 flex flex-col gap-3 transition-colors ${isLightMode
      ? "bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
      : "bg-[#121318] border border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]"
    }`;
  const labelCls = `text-[11px] font-medium ${isLightMode ? "text-neutral-600" : "text-zinc-400"
    }`;
  const inputCls = `w-full h-9 px-3 rounded-[10px] border text-[12px] outline-none focus:border-[#0a84ff] transition-colors ${isLightMode
      ? "bg-white border-black/12 text-neutral-900 placeholder:text-neutral-400"
      : "bg-[#1a1b22] border-white/10 text-white placeholder:text-zinc-500"
    }`;
  const primaryBtn =
    "h-9 px-4 rounded-[10px] bg-[#0a84ff] hover:bg-[#0071e3] text-white text-[12px] font-semibold transition-colors cursor-pointer shrink-0";
  const secondaryBtn = `h-9 px-3.5 rounded-[10px] text-[12px] font-medium border transition-colors cursor-pointer shrink-0 ${isLightMode
      ? "border-black/12 hover:bg-black/[0.05] text-neutral-800"
      : "border-white/12 hover:bg-white/[0.08] text-zinc-200"
    }`;
  const hintCls = `text-[11px] flex items-center gap-1.5 ${isLightMode ? "text-neutral-500" : "text-zinc-400"
    }`;

  const showGroup = (g: Exclude<ProviderGroup, "all">) => group === "all" || group === g;

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div>
          <div className="text-[13.5px] font-semibold">
            {isId ? "Data & Sumber Widget" : "Widget Data & Sources"}
          </div>
          <div className={`text-[11px] ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
            {isId
              ? "Klik salah satu widget di bawah untuk mengisi atau mengubah datanya"
              : "Click a widget below to populate or configure its data"}
          </div>
        </div>
        <IosSegmentedControl<ProviderGroup>
          value={group}
          onChange={setGroup}
          options={[
            { value: "all", label: isId ? "Semua" : "All" },
            { value: "productive", label: isId ? "Produktif" : "Productivity" },
            { value: "local", label: isId ? "Lokal" : "Local" },
            { value: "online", label: "Online" },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        {showGroup("productive") && (
          <>
            <ProviderAccordionRow
              id="mini_kanban"
              rowRef={bindRowRef("mini_kanban")}
              expanded={openId === "mini_kanban"}
              onToggle={() => toggleRow("mini_kanban")}
              icon={<KanbanSquare size={15} />}
              iconBg="bg-[#34c759]/15"
              iconColor="text-[#34c759]"
              title={isId ? "Kanban Mini (3 Kolom)" : "Mini Kanban (3 Columns)"}
              subtitle={
                isId
                  ? "Tambah, pindah kolom (Akan, Proses, Selesai), dan hapus kartu tugas"
                  : "Add, move across columns (To Do, Doing, Done), and delete task cards"
              }
              installed={activeSet.has("mini_kanban")}
              installedLabel={installedLabel}
              isLightMode={isLightMode}
            >
              <KanbanProviderPanel
                isLightMode={isLightMode}
                isId={isId}
                inputCls={inputCls}
                labelCls={labelCls}
                primaryBtn={primaryBtn}
                hintCls={hintCls}
                refreshNonce={openId === "mini_kanban" ? focusNonce + dataRefreshNonce + 1 : 0}
                onFlash={onFlash}
              />
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="countdown"
              rowRef={bindRowRef("countdown")}
              expanded={openId === "countdown"}
              onToggle={() => toggleRow("countdown")}
              icon={<CalendarClock size={15} />}
              iconBg="bg-[#0a84ff]/15"
              iconColor="text-[#0a84ff]"
              title={isId ? "Hitung Mundur Momen" : "Moment Countdown"}
              subtitle={
                isId
                  ? "Tambah target tanggal ujian, deadline, gajian, atau liburan"
                  : "Add target dates for exams, deadlines, payday, or vacations"
              }
              installed={activeSet.has("countdown_moment")}
              installedLabel={installedLabel}
              isLightMode={isLightMode}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>{isId ? "Nama Momen" : "Moment Name"}</span>
                  <input
                    type="text"
                    value={cdTitle}
                    onChange={(e) => setCdTitle(e.target.value)}
                    placeholder={isId ? "Contoh: Sidang Skripsi" : "Example: Thesis Defense"}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>{isId ? "Tanggal Target" : "Target Date"}</span>
                  <input
                    type="date"
                    value={cdDate}
                    onChange={(e) => setCdDate(e.target.value)}
                    className={inputCls}
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    if (!cdTitle.trim() || !cdDate.trim()) return;
                    try {
                      await addWidgetCountdown(cdTitle.trim(), cdDate.trim());
                      setCdTitle("");
                      onFlash(
                        isId
                          ? "Momen Hitung Mundur berhasil ditambahkan."
                          : "Countdown moment added."
                      );
                    } catch (e) {
                      onFlash(String(e));
                    }
                  }}
                  className={primaryBtn}
                >
                  {isId ? "Simpan Momen" : "Save Moment"}
                </button>
              </div>
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="snippets"
              rowRef={bindRowRef("snippets")}
              expanded={openId === "snippets"}
              onToggle={() => toggleRow("snippets")}
              icon={<ClipboardCopy size={15} />}
              iconBg="bg-[#af52de]/15"
              iconColor="text-[#c084fc]"
              title={isId ? "Papan Snippet Cepat" : "Quick Snippets Board"}
              subtitle={
                isId
                  ? "Simpan template teks pilihan untuk disalin 1 klik dari desktop"
                  : "Save custom text templates for 1-click copying from the desktop"
              }
              installed={activeSet.has("quick_snippets")}
              installedLabel={installedLabel}
              isLightMode={isLightMode}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>{isId ? "Label Pendek" : "Short Label"}</span>
                  <input
                    type="text"
                    value={snLabel}
                    onChange={(e) => setSnLabel(e.target.value)}
                    placeholder={isId ? "Contoh: Alamat Pengiriman" : "Example: Shipping Address"}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>
                    {isId ? "Isi Teks yang Disalin" : "Text Content to Copy"}
                  </span>
                  <input
                    type="text"
                    value={snContent}
                    onChange={(e) => setSnContent(e.target.value)}
                    placeholder={
                      isId
                        ? "Teks lengkap yang akan masuk clipboard"
                        : "Full text copied to your clipboard"
                    }
                    className={inputCls}
                  />
                </label>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={hintCls}>
                  <ShieldCheck size={13} className="text-[#34c759]" />{" "}
                  {isId
                    ? "Disimpan lokal saja, tidak merekam riwayat clipboard Anda"
                    : "Stored locally only, never logs your clipboard history"}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!snLabel.trim() || !snContent.trim()) return;
                    try {
                      await addWidgetSnippet(snLabel.trim(), snContent);
                      setSnLabel("");
                      setSnContent("");
                      onFlash(isId ? "Snippet cepat disimpan." : "Quick snippet saved.");
                    } catch (e) {
                      onFlash(String(e));
                    }
                  }}
                  className={primaryBtn}
                >
                  {isId ? "Tambah Snippet" : "Add Snippet"}
                </button>
              </div>
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="time_tracker"
              rowRef={bindRowRef("time_tracker")}
              expanded={openId === "time_tracker"}
              onToggle={() => toggleRow("time_tracker")}
              icon={<Timer size={15} />}
              iconBg="bg-[#34c759]/15"
              iconColor="text-[#34c759]"
              title={isId ? "Pelacak Waktu Proyek" : "Project Time Tracker"}
              subtitle={
                isId
                  ? "Kelola nama proyek dan ekspor rekap durasi ke CSV"
                  : "Manage project names and export duration summaries to CSV"
              }
              installed={activeSet.has("time_tracker")}
              installedLabel={installedLabel}
              isLightMode={isLightMode}
            >
              <label className="flex flex-col gap-1">
                <span className={labelCls}>{isId ? "Nama Proyek Baru" : "New Project Name"}</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder={isId ? "Contoh: Desain Aplikasi Gili" : "Example: Gili App Design"}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!projectName.trim()) return;
                      try {
                        await addWidgetTimeProject(projectName.trim());
                        setProjectName("");
                        onFlash(isId ? "Proyek pelacak waktu ditambahkan." : "Time tracker project added.");
                      } catch (e) {
                        onFlash(String(e));
                      }
                    }}
                    className={primaryBtn}
                  >
                    {isId ? "Tambah" : "Add"}
                  </button>
                </div>
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const path = await exportWidgetTimeTrackerCsv();
                      onFlash(isId ? `CSV tersimpan di: ${path}` : `CSV saved to: ${path}`);
                    } catch (e) {
                      onFlash(String(e));
                    }
                  }}
                  className={`${secondaryBtn} flex items-center gap-1.5`}
                >
                  <Download size={13} /> {isId ? "Ekspor Rekap CSV" : "Export CSV Summary"}
                </button>
              </div>
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="shortcuts"
              rowRef={bindRowRef("shortcuts")}
              expanded={openId === "shortcuts"}
              onToggle={() => toggleRow("shortcuts")}
              icon={<Link2 size={15} />}
              iconBg="bg-[#5e5ce6]/15"
              iconColor="text-[#818cf8]"
              title={isId ? "Pintasan Cepat" : "Quick Shortcuts"}
              subtitle={
                isId
                  ? "Tambahkan aplikasi, folder, atau tautan yang sering dibuka"
                  : "Add frequently opened apps, folders, or links"
              }
              installed={activeSet.has("shortcuts_grid")}
              installedLabel={installedLabel}
              isLightMode={isLightMode}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>{isId ? "Nama Pintasan" : "Shortcut Name"}</span>
                  <input
                    type="text"
                    value={shortcutName}
                    onChange={(e) => setShortcutName(e.target.value)}
                    placeholder={isId ? "Contoh: Folder Kerja" : "Example: Work Folder"}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>
                    {isId ? "Path Aplikasi, Folder, atau URL" : "App Path, Folder, or URL"}
                  </span>
                  <input
                    type="text"
                    value={shortcutPath}
                    onChange={(e) => setShortcutPath(e.target.value)}
                    placeholder={isId ? "C:\\Users\\... atau https://..." : "C:\\Users\\... or https://..."}
                    className={inputCls}
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    if (!shortcutName.trim() || !shortcutPath.trim()) return;
                    try {
                      await addWidgetShortcut(shortcutName.trim(), shortcutPath.trim());
                      setShortcutName("");
                      setShortcutPath("");
                      onFlash(isId ? "Pintasan cepat ditambahkan." : "Quick shortcut added.");
                    } catch (e) {
                      onFlash(String(e));
                    }
                  }}
                  className={primaryBtn}
                >
                  {isId ? "Tambah Pintasan" : "Add Shortcut"}
                </button>
              </div>
            </ProviderAccordionRow>
          </>
        )}

        {showGroup("local") && (
          <>
            <ProviderAccordionRow
              id="world_clock"
              rowRef={bindRowRef("world_clock")}
              expanded={openId === "world_clock"}
              onToggle={() => toggleRow("world_clock")}
              icon={<Globe size={15} />}
              iconBg="bg-[#64d2ff]/15"
              iconColor="text-[#38bdf8]"
              title={isId ? "Jam Dunia Multi-Zona" : "Multi-Zone World Clock"}
              subtitle={
                isId
                  ? "Tambah kota dunia atau pilih preset cepat (default: Jakarta, Tokyo, London, NY)"
                  : "Add world cities or pick quick presets (default: Jakarta, Tokyo, London, NY)"
              }
              installed={activeSet.has("world_clock")}
              installedLabel={installedLabel}
              isLightMode={isLightMode}
            >
              <div className="flex flex-wrap gap-1.5">
                {quickWorldCities.map((c) => (
                  <button
                    key={c.city}
                    type="button"
                    onClick={async () => {
                      try {
                        await addWidgetWorldClock(c.city, c.code, c.offset);
                        onFlash(
                          isId
                            ? `Kota ${c.city} (${c.code}) ditambahkan.`
                            : `Added ${c.city} (${c.code}).`
                        );
                      } catch (e) {
                        onFlash(String(e));
                      }
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer ${isLightMode
                        ? "border-black/10 hover:border-[#0a84ff]"
                        : "border-white/10 hover:border-[#0a84ff] bg-white/[0.04]"
                      }`}
                  >
                    + {c.city} ({c.code})
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>{isId ? "Nama Kota" : "City Name"}</span>
                  <input
                    type="text"
                    value={wcCity}
                    onChange={(e) => setWcCity(e.target.value)}
                    placeholder={isId ? "Contoh: Berlin" : "Example: Berlin"}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>{isId ? "Kode Zona" : "Zone Code"}</span>
                  <input
                    type="text"
                    value={wcCode}
                    onChange={(e) => setWcCode(e.target.value)}
                    placeholder="CET"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>{isId ? "Offset UTC (Jam)" : "UTC Offset (Hours)"}</span>
                  <input
                    type="number"
                    value={wcOffset}
                    onChange={(e) => setWcOffset(e.target.value)}
                    placeholder="1"
                    className={inputCls}
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    const off = Number(wcOffset);
                    if (!wcCity.trim() || !Number.isFinite(off)) return;
                    try {
                      await addWidgetWorldClock(wcCity.trim(), wcCode.trim() || "UTC", off);
                      setWcCity("");
                      onFlash(
                        isId
                          ? "Kota kustom ditambahkan ke Jam Dunia."
                          : "Custom city added to World Clock."
                      );
                    } catch (e) {
                      onFlash(String(e));
                    }
                  }}
                  className={primaryBtn}
                >
                  {isId ? "Tambah Kota" : "Add City"}
                </button>
              </div>
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="expense"
              rowRef={bindRowRef("expense")}
              expanded={openId === "expense"}
              onToggle={() => toggleRow("expense")}
              icon={<Wallet size={15} />}
              iconBg="bg-[#ff9f0a]/15"
              iconColor="text-[#ff9f0a]"
              title={isId ? "Pengeluaran Cepat & Anggaran" : "Quick Expense & Budget"}
              subtitle={
                isId
                  ? "Catat pengeluaran harian dan atur batas anggaran bulanan (DPAPI)"
                  : "Log daily expenses and set a monthly budget limit (DPAPI encrypted)"
              }
              installed={activeSet.has("quick_expense")}
              installedLabel={installedLabel}
              isLightMode={isLightMode}
            >
              <ExpenseProviderPanel
                isLightMode={isLightMode}
                isId={isId}
                inputCls={inputCls}
                labelCls={labelCls}
                primaryBtn={primaryBtn}
                secondaryBtn={secondaryBtn}
                hintCls={hintCls}
                refreshNonce={openId === "expense" ? focusNonce + 1 : 0}
                onFlash={onFlash}
              />
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="folders"
              rowRef={bindRowRef("folders")}
              expanded={openId === "folders"}
              onToggle={() => toggleRow("folders")}
              icon={<FolderOpen size={15} />}
              iconBg="bg-[#ff453a]/15"
              iconColor="text-[#ff6961]"
              title={
                isId
                  ? "Folder Foto, Berkas Terbaru & Penyimpanan"
                  : "Photo Folders, Recent Files & Storage"
              }
              subtitle={
                isId
                  ? "Sumber folder lokal baca-saja untuk Bingkai Foto, Berkas Terbaru, dan Treemap"
                  : "Read-only local folder sources for Photo Frame, Recent Files, and Treemap"
              }
              installed={
                activeSet.has("photo_frame") ||
                activeSet.has("recent_files") ||
                activeSet.has("storage_treemap")
              }
              installedLabel={installedLabel}
              isLightMode={isLightMode}
            >
              <label className="flex flex-col gap-1.5">
                <span className={labelCls}>
                  {isId
                    ? "Folder Bingkai Polaroid (Baca-Saja)"
                    : "Polaroid Frame Folder (Read-Only)"}
                </span>
                {photoStatus?.folder_path && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-[10px] bg-[#34c759]/12 border border-[#34c759]/25">
                    <span className="text-[11.5px] font-medium text-[#34c759] truncate max-w-[320px]" title={photoStatus.folder_path}>
                      {isId
                        ? `Aktif . ${photoStatus.photo_count} foto (${photoStatus.folder_path})`
                        : `Active . ${photoStatus.photo_count} photos (${photoStatus.folder_path})`}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await configureWidgetPhotoFolder("");
                          refreshPhotoStatus();
                          onFlash(
                            isId
                              ? "Folder foto Polaroid dibersihkan."
                              : "Polaroid photo folder cleared."
                          );
                        } catch (e) {
                          onFlash(String(e));
                        }
                      }}
                      className={secondaryBtn}
                    >
                      {isId ? "Hapus Folder" : "Clear Folder"}
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const total = await pickWidgetPhotoFolderDialog();
                        refreshPhotoStatus();
                        if (total > 0) {
                          onFlash(
                            isId
                              ? `Folder foto dimuat (${total} gambar).`
                              : `Photo folder loaded (${total} images).`
                          );
                        }
                      } catch (e) {
                        onFlash(String(e));
                      }
                    }}
                    className={primaryBtn}
                  >
                    {isId ? "Pilih Folder..." : "Pick Folder..."}
                  </button>
                </div>
                <div className="flex gap-2 mt-0.5">
                  <input
                    type="text"
                    value={photoFolder}
                    onChange={(e) => setPhotoFolder(e.target.value)}
                    placeholder={isId ? "Contoh: C:\\Users\\Nama\\Pictures" : "Example: C:\\Users\\Name\\Pictures"}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!photoFolder.trim()) return;
                      try {
                        const count = await configureWidgetPhotoFolder(photoFolder.trim());
                        refreshPhotoStatus();
                        onFlash(
                          isId
                            ? `Folder foto dimuat (${count} gambar).`
                            : `Photo folder loaded (${count} images).`
                        );
                      } catch (e) {
                        onFlash(String(e));
                      }
                    }}
                    className={secondaryBtn}
                  >
                    {isId ? "Muat Folder" : "Load Folder"}
                  </button>
                </div>
              </label>

              <label className="flex flex-col gap-1">
                <span className={labelCls}>
                  {isId
                    ? "Folder Berkas Terbaru (Opt-In, Metadata Saja)"
                    : "Recent Files Folder (Opt-In, Metadata Only)"}
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={recentFolder}
                    onChange={(e) => setRecentFolder(e.target.value)}
                    placeholder={
                      isId ? "Contoh: C:\\Users\\Nama\\Documents" : "Example: C:\\Users\\Name\\Documents"
                    }
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!recentFolder.trim()) return;
                      try {
                        await configureWidgetRecentFolders(true, [recentFolder.trim()], []);
                        onFlash(
                          isId
                            ? "Pantauan Berkas Terbaru diaktifkan."
                            : "Recent Files tracking enabled."
                        );
                      } catch (e) {
                        onFlash(String(e));
                      }
                    }}
                    className={secondaryBtn}
                  >
                    {isId ? "Aktifkan" : "Enable"}
                  </button>
                </div>
              </label>

              <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
                <span className={labelCls}>
                  {isId
                    ? "Folder Peta Penyimpanan (Storage Treemap)"
                    : "Storage Map Folder (Storage Treemap)"}
                </span>
                {storageStatus?.root_path && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-[10px] bg-[#0a84ff]/10 border border-[#0a84ff]/25">
                    <span
                      className="text-[11.5px] font-medium text-[#0a84ff] truncate max-w-[320px]"
                      title={storageStatus.root_path}
                    >
                      {storageStatus.root_path}
                      {storageStatus.total_scanned_bytes > 0
                        ? ` . ${formatScannedBytes(storageStatus.total_scanned_bytes)}`
                        : ""}
                    </span>
                    {storageStatus.is_custom && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await triggerWidgetStorageScan("");
                            refreshStorageStatus();
                            window.setTimeout(refreshStorageStatus, 1400);
                            onFlash(
                              isId
                                ? "Folder Peta Penyimpanan direset ke folder User."
                                : "Storage Map folder reset to User folder."
                            );
                          } catch (e) {
                            onFlash(String(e));
                          }
                        }}
                        className={secondaryBtn}
                      >
                        {isId ? "Reset Default" : "Reset Default"}
                      </button>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const picked = await pickWidgetStorageFolderDialog();
                        if (picked) {
                          refreshStorageStatus();
                          window.setTimeout(refreshStorageStatus, 1400);
                          onFlash(
                            isId
                              ? `Memindai folder Peta Penyimpanan: ${picked}`
                              : `Scanning Storage Map folder: ${picked}`
                          );
                        }
                      } catch (e) {
                        onFlash(String(e));
                      }
                    }}
                    className={primaryBtn}
                  >
                    {isId ? "Pilih Folder..." : "Pick Folder..."}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await triggerWidgetStorageScan();
                        refreshStorageStatus();
                        window.setTimeout(refreshStorageStatus, 1400);
                        onFlash(
                          isId
                            ? "Pemindaian Peta Penyimpanan dimulai di latar belakang."
                            : "Storage Treemap scan started in the background."
                        );
                      } catch (e) {
                        onFlash(String(e));
                      }
                    }}
                    className={`${secondaryBtn} flex items-center gap-1.5`}
                  >
                    <HardDrive size={13} /> {isId ? "Pindai Sekarang" : "Scan Now"}
                  </button>
                </div>
                <div className="flex gap-2 mt-0.5">
                  <input
                    type="text"
                    value={storageFolder}
                    onChange={(e) => setStorageFolder(e.target.value)}
                    placeholder={isId ? "Contoh: D:\\Kerjaan atau D:\\" : "Example: D:\\Projects or D:\\"}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!storageFolder.trim()) return;
                      try {
                        const target = await triggerWidgetStorageScan(storageFolder.trim());
                        refreshStorageStatus();
                        window.setTimeout(refreshStorageStatus, 1400);
                        onFlash(
                          isId
                            ? `Memindai folder: ${target}`
                            : `Scanning folder: ${target}`
                        );
                      } catch (e) {
                        onFlash(String(e));
                      }
                    }}
                    className={secondaryBtn}
                  >
                    {isId ? "Pindai Folder" : "Scan Folder"}
                  </button>
                </div>
                <span className={hintCls}>
                  {isId
                    ? "Pemindaian hanya berjalan saat diminta agar disk dan CPU tetap ringan"
                    : "Scanning runs on demand only to keep disk and CPU usage minimal"}
                </span>
              </div>
            </ProviderAccordionRow>
          </>
        )}

        {showGroup("online") && (
          <>
            <ProviderAccordionRow
              id="ical_calendar"
              rowRef={bindRowRef("ical_calendar")}
              expanded={openId === "ical_calendar"}
              onToggle={() => toggleRow("ical_calendar")}
              icon={<Calendar size={15} />}
              iconBg="bg-[#0a84ff]/15"
              iconColor="text-[#0a84ff]"
              title="Google Calendar / iCal (.ics)"
              subtitle={
                isId
                  ? "Sinkron jadwal baca-saja dari link Secret iCal Google, Outlook, atau iCloud"
                  : "Read-only schedule sync from Google, Outlook, or iCloud secret iCal URL"
              }
              installed={activeSet.has("calendar_agenda") || Boolean(icalStatus?.configured)}
              installedLabel={installedLabel}
              isLightMode={isLightMode}
            >
              {icalStatus?.configured && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-[10px] bg-[#34c759]/12 border border-[#34c759]/25">
                  <span className="text-[11.5px] font-medium text-[#34c759]">
                    {isId
                      ? `Terhubung . ${icalStatus.synced_count} acara tersinkron`
                      : `Connected . ${icalStatus.synced_count} synced events`}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await clearWidgetIcalUrl();
                        setIcalStatus({
                          configured: false,
                          synced_count: 0,
                          updated_label: "",
                          error: null,
                        });
                        onFlash(
                          isId
                            ? "Koneksi kalender iCal diputuskan."
                            : "iCal calendar connection removed."
                        );
                      } catch (e) {
                        onFlash(String(e));
                      }
                    }}
                    className={secondaryBtn}
                  >
                    {isId ? "Putuskan" : "Disconnect"}
                  </button>
                </div>
              )}
              {icalStatus?.error && (
                <div className="text-[11px] text-amber-400">{icalStatus.error}</div>
              )}
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Secret iCal URL (.ics)</span>
                <input
                  type="password"
                  value={icalUrl}
                  onChange={(e) => setIcalUrl(e.target.value)}
                  placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                  className={inputCls}
                />
                <span className={hintCls}>
                  Google Calendar &gt; Settings &gt; [Calendar] &gt; Secret address in iCal format
                </span>
              </label>
              <div className="flex items-center justify-between gap-2">
                <span className={hintCls}>
                  <ShieldCheck size={13} className="text-[#34c759]" />{" "}
                  {isId
                    ? "URL rahasia disimpan terenkripsi di Windows Credential Manager"
                    : "Secret URL stored encrypted in Windows Credential Manager"}
                </span>
                <button
                  type="button"
                  disabled={icalSaving || !icalUrl.trim()}
                  onClick={async () => {
                    if (!icalUrl.trim() || icalSaving) return;
                    setIcalSaving(true);
                    try {
                      const synced = await saveWidgetIcalUrl(icalUrl.trim());
                      setIcalUrl("");
                      setIcalStatus({
                        configured: true,
                        synced_count: synced,
                        updated_label: "iCal",
                        error: null,
                      });
                      onFlash(
                        isId
                          ? `Kalender tersinkron (${synced} acara terdekat dimuat).`
                          : `Calendar synced (${synced} upcoming events loaded).`
                      );
                    } catch (e) {
                      onFlash(String(e));
                    } finally {
                      setIcalSaving(false);
                    }
                  }}
                  className={`${primaryBtn} disabled:opacity-50`}
                >
                  {icalSaving
                    ? isId
                      ? "Menyinkron..."
                      : "Syncing..."
                    : isId
                      ? "Simpan & Sinkron"
                      : "Save & Sync"}
                </button>
              </div>
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="uptime"
              rowRef={bindRowRef("uptime")}
              expanded={openId === "uptime"}
              onToggle={() => toggleRow("uptime")}
              icon={<Activity size={15} />}
              iconBg="bg-[#30d158]/15"
              iconColor="text-[#30d158]"
              title={isId ? "Status Situs (Ping Uptime)" : "Site Status (Uptime Ping)"}
              subtitle={
                isId
                  ? "Pantau status HTTPS hingga 6 situs milik Anda (interval min 60 detik)"
                  : "Monitor HTTPS status for up to 6 websites (min 60s interval)"
              }
              installed={activeSet.has("site_status")}
              installedLabel={installedLabel}
              isLightMode={isLightMode}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>{isId ? "Nama Situs" : "Site Name"}</span>
                  <input
                    type="text"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    placeholder={isId ? "Contoh: API Produksi" : "Example: Production API"}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>HTTPS URL</span>
                  <input
                    type="url"
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    placeholder={isId ? "https://domain-anda.com" : "https://your-domain.com"}
                    className={inputCls}
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    if (!siteName.trim() || !siteUrl.trim()) return;
                    try {
                      await addWidgetUptimeSite(siteName.trim(), siteUrl.trim());
                      setSiteName("");
                      onFlash(
                        isId
                          ? "Situs ditambahkan ke pemantau uptime."
                          : "Site added to uptime monitor."
                      );
                    } catch (e) {
                      onFlash(String(e));
                    }
                  }}
                  className={primaryBtn}
                >
                  {isId ? "Tambah Situs" : "Add Site"}
                </button>
              </div>
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="github"
              rowRef={bindRowRef("github")}
              expanded={openId === "github"}
              onToggle={() => toggleRow("github")}
              icon={<GitBranch size={15} />}
              iconBg="bg-[#636366]/20"
              iconColor="text-zinc-200"
              title={isId ? "Status GitHub" : "GitHub Status"}
              subtitle={
                isId
                  ? "Pantau PR, issue, dan hasil GitHub Actions dengan ETag"
                  : "Track PRs, issues, and GitHub Actions runs using ETag caching"
              }
              installed={activeSet.has("github_status")}
              installedLabel={installedLabel}
              isLightMode={isLightMode}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>
                    {isId ? "Repositori (owner/repo)" : "Repository (owner/repo)"}
                  </span>
                  <input
                    type="text"
                    value={ghRepo}
                    onChange={(e) => setGhRepo(e.target.value)}
                    placeholder={isId ? "Contoh: faiz/gili" : "Example: faiz/gili"}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Fine-Grained Token (Read-Only)</span>
                  <input
                    type="password"
                    value={ghToken}
                    onChange={(e) => setGhToken(e.target.value)}
                    placeholder="github_pat_..."
                    className={inputCls}
                  />
                </label>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={hintCls}>
                  <ShieldCheck size={13} className="text-[#34c759]" />{" "}
                  {isId
                    ? "Token disimpan aman di Windows Credential Manager"
                    : "Token stored securely in Windows Credential Manager"}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!ghRepo.trim() || !ghToken.trim()) return;
                    try {
                      await saveGithubWidgetToken(ghToken.trim(), ghRepo.trim());
                      setGhToken("");
                      onFlash(
                        isId
                          ? "Kredensial GitHub tersimpan aman."
                          : "GitHub credentials saved securely."
                      );
                    } catch (e) {
                      onFlash(String(e));
                    }
                  }}
                  className={primaryBtn}
                >
                  {isId ? "Simpan Token" : "Save Token"}
                </button>
              </div>
            </ProviderAccordionRow>
          </>
        )}
      </div>
    </div>
  );
};
