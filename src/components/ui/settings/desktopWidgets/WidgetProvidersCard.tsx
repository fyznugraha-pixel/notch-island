import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Download,
  HardDrive,
  CalendarClock,
  ClipboardCopy,
  Globe,
  Timer,
  Wallet,
  Link2,
  Activity,
  GitBranch,
  FolderOpen,
  ShieldCheck,
} from "lucide-react";
import {
  addWidgetCountdown,
  addWidgetShortcut,
  addWidgetSnippet,
  addWidgetTimeProject,
  addWidgetUptimeSite,
  addWidgetWorldClock,
  configureWidgetPhotoFolder,
  configureWidgetRecentFolders,
  exportWidgetTimeTrackerCsv,
  pickWidgetPhotoFolderDialog,
  pickWidgetPhotosDialog,
  saveGithubWidgetToken,
  setWidgetExpenseBudget,
  triggerWidgetStorageScan,
} from "../../../../services/desktopWidgetsService";
import { IosSegmentedControl } from "../../../ios/IosSegmentedControl";

interface WidgetProvidersCardProps {
  isLightMode: boolean;
  activeWidgetTypes: string[];
  onFlash: (msg: string) => void;
}

type ProviderGroup = "all" | "productive" | "local" | "online";

interface ProviderRowProps {
  id: string;
  expanded: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  installed?: boolean;
  isLightMode: boolean;
  children: React.ReactNode;
}

const ProviderAccordionRow: React.FC<ProviderRowProps> = ({
  expanded,
  onToggle,
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  installed = false,
  isLightMode,
  children,
}) => {
  return (
    <div
      className={`rounded-[14px] border transition-colors overflow-hidden ${
        expanded
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
                className={`text-[13px] font-semibold truncate ${
                  isLightMode ? "text-neutral-900" : "text-zinc-100"
                }`}
              >
                {title}
              </span>
              {installed && (
                <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold bg-[#34c759]/18 text-[#34c759]">
                  Terpasang
                </span>
              )}
            </div>
            <div
              className={`text-[11px] truncate mt-0.5 ${
                isLightMode ? "text-neutral-500" : "text-zinc-400"
              }`}
            >
              {subtitle}
            </div>
          </div>
        </div>
        <ChevronDown
          size={15}
          className={`shrink-0 transition-transform duration-200 ${
            expanded ? "rotate-180 text-[#0a84ff]" : "text-zinc-400"
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

const QUICK_WORLD_CITIES = [
  { city: "Singapura", code: "SGT", offset: 8 },
  { city: "Makassar", code: "WITA", offset: 8 },
  { city: "Jayapura", code: "WIT", offset: 9 },
  { city: "Seoul", code: "KST", offset: 9 },
  { city: "Sydney", code: "AEDT", offset: 11 },
];

export const WidgetProvidersCard: React.FC<WidgetProvidersCardProps> = ({
  isLightMode,
  activeWidgetTypes,
  onFlash,
}) => {
  const [group, setGroup] = useState<ProviderGroup>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const [cdTitle, setCdTitle] = useState("");
  const [cdDate, setCdDate] = useState("2026-12-31");
  const [snLabel, setSnLabel] = useState("");
  const [snContent, setSnContent] = useState("");
  const [wcCity, setWcCity] = useState("");
  const [wcCode, setWcCode] = useState("SGT");
  const [wcOffset, setWcOffset] = useState("8");
  const [projectName, setProjectName] = useState("");
  const [budgetIdr, setBudgetIdr] = useState("3000000");
  const [shortcutName, setShortcutName] = useState("");
  const [shortcutPath, setShortcutPath] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteUrl, setSiteUrl] = useState("https://");
  const [ghRepo, setGhRepo] = useState("");
  const [ghToken, setGhToken] = useState("");
  const [photoFolder, setPhotoFolder] = useState("");
  const [recentFolder, setRecentFolder] = useState("");

  const activeSet = new Set(activeWidgetTypes);
  const toggleRow = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  const cardClass = `w-full rounded-[18px] p-3.5 flex flex-col gap-3 transition-colors ${
    isLightMode
      ? "bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
      : "bg-[#121318] border border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]"
  }`;
  const labelCls = `text-[11px] font-medium ${
    isLightMode ? "text-neutral-600" : "text-zinc-400"
  }`;
  const inputCls = `w-full h-9 px-3 rounded-[10px] border text-[12px] outline-none focus:border-[#0a84ff] transition-colors ${
    isLightMode
      ? "bg-white border-black/12 text-neutral-900 placeholder:text-neutral-400"
      : "bg-[#1a1b22] border-white/10 text-white placeholder:text-zinc-500"
  }`;
  const primaryBtn =
    "h-9 px-4 rounded-[10px] bg-[#0a84ff] hover:bg-[#0071e3] text-white text-[12px] font-semibold transition-colors cursor-pointer shrink-0";
  const secondaryBtn = `h-9 px-3.5 rounded-[10px] text-[12px] font-medium border transition-colors cursor-pointer shrink-0 ${
    isLightMode
      ? "border-black/12 hover:bg-black/[0.05] text-neutral-800"
      : "border-white/12 hover:bg-white/[0.08] text-zinc-200"
  }`;
  const hintCls = `text-[11px] flex items-center gap-1.5 ${
    isLightMode ? "text-neutral-500" : "text-zinc-400"
  }`;

  const showGroup = (g: Exclude<ProviderGroup, "all">) => group === "all" || group === g;

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div>
          <div className="text-[13.5px] font-semibold">Data & Sumber Widget</div>
          <div className={`text-[11px] ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
            Klik salah satu widget di bawah untuk mengisi atau mengubah datanya
          </div>
        </div>
        <IosSegmentedControl<ProviderGroup>
          value={group}
          onChange={setGroup}
          options={[
            { value: "all", label: "Semua" },
            { value: "productive", label: "Produktif" },
            { value: "local", label: "Lokal" },
            { value: "online", label: "Online" },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        {showGroup("productive") && (
          <>
            <ProviderAccordionRow
              id="countdown"
              expanded={openId === "countdown"}
              onToggle={() => toggleRow("countdown")}
              icon={<CalendarClock size={15} />}
              iconBg="bg-[#0a84ff]/15"
              iconColor="text-[#0a84ff]"
              title="Hitung Mundur Momen"
              subtitle="Tambah target tanggal ujian, deadline, gajian, atau liburan"
              installed={activeSet.has("countdown_moment")}
              isLightMode={isLightMode}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Nama Momen</span>
                  <input
                    type="text"
                    value={cdTitle}
                    onChange={(e) => setCdTitle(e.target.value)}
                    placeholder="Contoh: Sidang Skripsi"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Tanggal Target</span>
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
                      onFlash("Momen Hitung Mundur berhasil ditambahkan.");
                    } catch (e) {
                      onFlash(String(e));
                    }
                  }}
                  className={primaryBtn}
                >
                  Simpan Momen
                </button>
              </div>
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="snippets"
              expanded={openId === "snippets"}
              onToggle={() => toggleRow("snippets")}
              icon={<ClipboardCopy size={15} />}
              iconBg="bg-[#af52de]/15"
              iconColor="text-[#c084fc]"
              title="Papan Snippet Cepat"
              subtitle="Simpan template teks pilihan untuk disalin 1 klik dari desktop"
              installed={activeSet.has("quick_snippets")}
              isLightMode={isLightMode}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Label Pendek</span>
                  <input
                    type="text"
                    value={snLabel}
                    onChange={(e) => setSnLabel(e.target.value)}
                    placeholder="Contoh: Alamat Pengiriman"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Isi Teks yang Disalin</span>
                  <input
                    type="text"
                    value={snContent}
                    onChange={(e) => setSnContent(e.target.value)}
                    placeholder="Teks lengkap yang akan masuk clipboard"
                    className={inputCls}
                  />
                </label>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={hintCls}>
                  <ShieldCheck size={13} className="text-[#34c759]" /> Disimpan lokal saja, tidak
                  merekam riwayat clipboard Anda
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!snLabel.trim() || !snContent.trim()) return;
                    await addWidgetSnippet(snLabel.trim(), snContent);
                    setSnLabel("");
                    setSnContent("");
                    onFlash("Snippet cepat disimpan.");
                  }}
                  className={primaryBtn}
                >
                  Tambah Snippet
                </button>
              </div>
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="time_tracker"
              expanded={openId === "time_tracker"}
              onToggle={() => toggleRow("time_tracker")}
              icon={<Timer size={15} />}
              iconBg="bg-[#34c759]/15"
              iconColor="text-[#34c759]"
              title="Pelacak Waktu Proyek"
              subtitle="Kelola nama proyek dan ekspor rekap durasi ke CSV"
              installed={activeSet.has("time_tracker")}
              isLightMode={isLightMode}
            >
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Nama Proyek Baru</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Contoh: Desain Aplikasi Gili"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!projectName.trim()) return;
                      await addWidgetTimeProject(projectName.trim());
                      setProjectName("");
                      onFlash("Proyek pelacak waktu ditambahkan.");
                    }}
                    className={primaryBtn}
                  >
                    Tambah
                  </button>
                </div>
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    const path = await exportWidgetTimeTrackerCsv();
                    onFlash(`CSV tersimpan di: ${path}`);
                  }}
                  className={`${secondaryBtn} flex items-center gap-1.5`}
                >
                  <Download size={13} /> Ekspor Rekap CSV
                </button>
              </div>
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="shortcuts"
              expanded={openId === "shortcuts"}
              onToggle={() => toggleRow("shortcuts")}
              icon={<Link2 size={15} />}
              iconBg="bg-[#5e5ce6]/15"
              iconColor="text-[#818cf8]"
              title="Pintasan Cepat"
              subtitle="Tambahkan aplikasi, folder, atau tautan yang sering dibuka"
              installed={activeSet.has("shortcuts_grid")}
              isLightMode={isLightMode}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Nama Pintasan</span>
                  <input
                    type="text"
                    value={shortcutName}
                    onChange={(e) => setShortcutName(e.target.value)}
                    placeholder="Contoh: Folder Kerja"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Path Aplikasi, Folder, atau URL</span>
                  <input
                    type="text"
                    value={shortcutPath}
                    onChange={(e) => setShortcutPath(e.target.value)}
                    placeholder="C:\Users\... atau https://..."
                    className={inputCls}
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    if (!shortcutName.trim() || !shortcutPath.trim()) return;
                    await addWidgetShortcut(shortcutName.trim(), shortcutPath.trim());
                    setShortcutName("");
                    setShortcutPath("");
                    onFlash("Pintasan cepat ditambahkan.");
                  }}
                  className={primaryBtn}
                >
                  Tambah Pintasan
                </button>
              </div>
            </ProviderAccordionRow>
          </>
        )}

        {showGroup("local") && (
          <>
            <ProviderAccordionRow
              id="world_clock"
              expanded={openId === "world_clock"}
              onToggle={() => toggleRow("world_clock")}
              icon={<Globe size={15} />}
              iconBg="bg-[#64d2ff]/15"
              iconColor="text-[#38bdf8]"
              title="Jam Dunia Multi-Zona"
              subtitle="Tambah kota dunia atau pilih preset cepat (default: Jakarta, Tokyo, London, NY)"
              installed={activeSet.has("world_clock")}
              isLightMode={isLightMode}
            >
              <div className="flex flex-wrap gap-1.5">
                {QUICK_WORLD_CITIES.map((c) => (
                  <button
                    key={c.city}
                    type="button"
                    onClick={async () => {
                      await addWidgetWorldClock(c.city, c.code, c.offset);
                      onFlash(`Kota ${c.city} (${c.code}) ditambahkan.`);
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer ${
                      isLightMode
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
                  <span className={labelCls}>Nama Kota</span>
                  <input
                    type="text"
                    value={wcCity}
                    onChange={(e) => setWcCity(e.target.value)}
                    placeholder="Contoh: Berlin"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Kode Zona</span>
                  <input
                    type="text"
                    value={wcCode}
                    onChange={(e) => setWcCode(e.target.value)}
                    placeholder="CET"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Offset UTC (Jam)</span>
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
                    await addWidgetWorldClock(wcCity.trim(), wcCode.trim() || "UTC", off);
                    setWcCity("");
                    onFlash("Kota kustom ditambahkan ke Jam Dunia.");
                  }}
                  className={primaryBtn}
                >
                  Tambah Kota
                </button>
              </div>
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="expense"
              expanded={openId === "expense"}
              onToggle={() => toggleRow("expense")}
              icon={<Wallet size={15} />}
              iconBg="bg-[#ff9f0a]/15"
              iconColor="text-[#ff9f0a]"
              title="Pengeluaran Cepat & Anggaran"
              subtitle="Atur batas anggaran bulanan untuk bar progres pengeluaran"
              installed={activeSet.has("quick_expense")}
              isLightMode={isLightMode}
            >
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Anggaran Bulanan (Rupiah)</span>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={budgetIdr}
                    onChange={(e) => setBudgetIdr(e.target.value)}
                    placeholder="3000000"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const num = Number(budgetIdr);
                      if (!Number.isFinite(num) || num <= 0) return;
                      await setWidgetExpenseBudget(Math.round(num));
                      onFlash("Anggaran bulanan tersimpan (terenkripsi DPAPI).");
                    }}
                    className={primaryBtn}
                  >
                    Simpan
                  </button>
                </div>
              </label>
              <span className={hintCls}>
                <ShieldCheck size={13} className="text-[#34c759]" /> Data finansial dienkripsi lokal
                dengan Windows DPAPI, nol telemetri
              </span>
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="folders"
              expanded={openId === "folders"}
              onToggle={() => toggleRow("folders")}
              icon={<FolderOpen size={15} />}
              iconBg="bg-[#ff453a]/15"
              iconColor="text-[#ff6961]"
              title="Folder Foto, Berkas Terbaru & Penyimpanan"
              subtitle="Sumber folder lokal baca-saja untuk Bingkai Foto, Berkas Terbaru, dan Treemap"
              installed={
                activeSet.has("photo_frame") ||
                activeSet.has("recent_files") ||
                activeSet.has("storage_treemap")
              }
              isLightMode={isLightMode}
            >
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Foto & Folder Bingkai Polaroid (Baca-Saja)</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const total = await pickWidgetPhotosDialog();
                      if (total > 0) {
                        onFlash(`Foto bingkai diperbarui (${total} foto tersedia).`);
                      }
                    }}
                    className={secondaryBtn}
                  >
                    Pilih Foto...
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const total = await pickWidgetPhotoFolderDialog();
                      if (total > 0) {
                        onFlash(`Folder foto dimuat (${total} gambar).`);
                      }
                    }}
                    className={secondaryBtn}
                  >
                    Pilih Folder...
                  </button>
                </div>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={photoFolder}
                    onChange={(e) => setPhotoFolder(e.target.value)}
                    placeholder="Contoh: C:\Users\Nama\Pictures"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!photoFolder.trim()) return;
                      const count = await configureWidgetPhotoFolder(photoFolder.trim());
                      onFlash(`Folder foto dimuat (${count} gambar).`);
                    }}
                    className={secondaryBtn}
                  >
                    Muat Foto
                  </button>
                </div>
              </label>

              <label className="flex flex-col gap-1">
                <span className={labelCls}>Folder Berkas Terbaru (Opt-In, Metadata Saja)</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={recentFolder}
                    onChange={(e) => setRecentFolder(e.target.value)}
                    placeholder="Contoh: C:\Users\Nama\Documents"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!recentFolder.trim()) return;
                      await configureWidgetRecentFolders(true, [recentFolder.trim()], []);
                      onFlash("Pantauan Berkas Terbaru diaktifkan.");
                    }}
                    className={secondaryBtn}
                  >
                    Aktifkan
                  </button>
                </div>
              </label>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
                <span className={hintCls}>Peta Penyimpanan (Treemap) dipindai sesuai permintaan</span>
                <button
                  type="button"
                  onClick={async () => {
                    await triggerWidgetStorageScan();
                    onFlash("Pemindaian Peta Penyimpanan dimulai di latar belakang.");
                  }}
                  className={`${secondaryBtn} flex items-center gap-1.5`}
                >
                  <HardDrive size={13} /> Pindai Sekarang
                </button>
              </div>
            </ProviderAccordionRow>
          </>
        )}

        {showGroup("online") && (
          <>
            <ProviderAccordionRow
              id="uptime"
              expanded={openId === "uptime"}
              onToggle={() => toggleRow("uptime")}
              icon={<Activity size={15} />}
              iconBg="bg-[#30d158]/15"
              iconColor="text-[#30d158]"
              title="Status Situs (Ping Uptime)"
              subtitle="Pantau status HTTPS hingga 6 situs milik Anda (interval min 60 detik)"
              installed={activeSet.has("site_status")}
              isLightMode={isLightMode}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Nama Situs</span>
                  <input
                    type="text"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    placeholder="Contoh: API Produksi"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>URL HTTPS</span>
                  <input
                    type="url"
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    placeholder="https://domain-anda.com"
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
                      onFlash("Situs ditambahkan ke pemantau uptime.");
                    } catch (e) {
                      onFlash(String(e));
                    }
                  }}
                  className={primaryBtn}
                >
                  Tambah Situs
                </button>
              </div>
            </ProviderAccordionRow>

            <ProviderAccordionRow
              id="github"
              expanded={openId === "github"}
              onToggle={() => toggleRow("github")}
              icon={<GitBranch size={15} />}
              iconBg="bg-[#636366]/20"
              iconColor="text-zinc-200"
              title="Status GitHub"
              subtitle="Pantau PR, issue, dan hasil GitHub Actions dengan ETag"
              installed={activeSet.has("github_status")}
              isLightMode={isLightMode}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Repositori (owner/repo)</span>
                  <input
                    type="text"
                    value={ghRepo}
                    onChange={(e) => setGhRepo(e.target.value)}
                    placeholder="Contoh: faiz/gili"
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
                  <ShieldCheck size={13} className="text-[#34c759]" /> Token disimpan aman di
                  Windows Credential Manager
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!ghRepo.trim() || !ghToken.trim()) return;
                    await saveGithubWidgetToken(ghToken.trim(), ghRepo.trim());
                    setGhToken("");
                    onFlash("Kredensial GitHub tersimpan aman.");
                  }}
                  className={primaryBtn}
                >
                  Simpan Token
                </button>
              </div>
            </ProviderAccordionRow>
          </>
        )}
      </div>
    </div>
  );
};
