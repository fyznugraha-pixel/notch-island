import React, { useState } from "react";
import { Download, HardDrive, FolderCog } from "lucide-react";
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
  saveGithubWidgetToken,
  setWidgetExpenseBudget,
  triggerWidgetStorageScan,
} from "../../../../services/desktopWidgetsService";

interface WidgetProvidersCardProps {
  isLightMode: boolean;
  onFlash: (msg: string) => void;
}

export const WidgetProvidersCard: React.FC<WidgetProvidersCardProps> = ({
  isLightMode,
  onFlash,
}) => {
  const [ghRepo, setGhRepo] = useState("");
  const [ghToken, setGhToken] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteUrl, setSiteUrl] = useState("https://");
  const [budgetIdr, setBudgetIdr] = useState("3000000");
  const [projectName, setProjectName] = useState("");
  const [shortcutName, setShortcutName] = useState("");
  const [shortcutPath, setShortcutPath] = useState("");
  const [photoFolder, setPhotoFolder] = useState("");
  const [recentFolder, setRecentFolder] = useState("");
  const [cdTitle, setCdTitle] = useState("");
  const [cdDate, setCdDate] = useState("2026-12-31");
  const [snLabel, setSnLabel] = useState("");
  const [snContent, setSnContent] = useState("");
  const [wcCity, setWcCity] = useState("");
  const [wcCode, setWcCode] = useState("SGT");
  const [wcOffset, setWcOffset] = useState("8");

  const cardClass = `w-full rounded-[18px] p-4 flex flex-col gap-3.5 transition-colors ${
    isLightMode
      ? "bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
      : "bg-[#121318] border border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]"
  }`;
  const inputCls = `h-9 px-3 rounded-[10px] border text-[12px] outline-none focus:border-[#0a84ff] ${
    isLightMode
      ? "bg-black/[0.03] border-black/10 text-neutral-900"
      : "bg-[#1a1b22] border-white/10 text-white"
  }`;
  const btnCls = `h-9 px-3 rounded-[10px] text-[12px] font-medium transition-colors cursor-pointer ${
    isLightMode
      ? "bg-black/[0.06] hover:bg-black/[0.11] text-neutral-900"
      : "bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100"
  }`;

  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-[9px] bg-[#64d2ff]/15 text-[#64d2ff] flex items-center justify-center">
          <FolderCog size={15} />
        </div>
        <div>
          <div className="text-[13.5px] font-semibold">Konfigurasi Data & Penyedia</div>
          <div className="text-[11px] text-zinc-400">
            Token GitHub disimpan di Credential Manager, pengeluaran dienkripsi lokal DPAPI
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="text"
          value={ghRepo}
          onChange={(e) => setGhRepo(e.target.value)}
          placeholder="owner/repo GitHub"
          className={inputCls}
        />
        <input
          type="password"
          value={ghToken}
          onChange={(e) => setGhToken(e.target.value)}
          placeholder="Fine-grained PAT (read-only)"
          className={inputCls}
        />
        <button
          type="button"
          onClick={async () => {
            if (!ghRepo.trim() || !ghToken.trim()) return;
            await saveGithubWidgetToken(ghToken.trim(), ghRepo.trim());
            setGhToken("");
            onFlash("Token GitHub disimpan aman di Windows Credential Manager.");
          }}
          className={btnCls}
        >
          Simpan Status GitHub
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="text"
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          placeholder="Nama situs (mis. API Utama)"
          className={inputCls}
        />
        <input
          type="url"
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
          placeholder="https://domain-anda.com"
          className={inputCls}
        />
        <button
          type="button"
          onClick={async () => {
            if (!siteName.trim() || !siteUrl.trim()) return;
            try {
              await addWidgetUptimeSite(siteName.trim(), siteUrl.trim());
              setSiteName("");
              onFlash("Situs ditambahkan ke pemantau uptime (min 60 detik).");
            } catch (e) {
              onFlash(String(e));
            }
          }}
          className={btnCls}
        >
          Tambah Situs Uptime
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Nama proyek Pelacak Waktu"
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
          className={btnCls}
        >
          + Proyek Waktu
        </button>
        <button
          type="button"
          onClick={async () => {
            const path = await exportWidgetTimeTrackerCsv();
            onFlash(`CSV tersimpan di: ${path}`);
          }}
          className={`${btnCls} flex items-center justify-center gap-1.5`}
        >
          <Download size={13} /> Ekspor CSV Waktu
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="number"
          value={budgetIdr}
          onChange={(e) => setBudgetIdr(e.target.value)}
          placeholder="Anggaran bulanan (IDR)"
          className={inputCls}
        />
        <button
          type="button"
          onClick={async () => {
            const num = Number(budgetIdr);
            if (!Number.isFinite(num) || num <= 0) return;
            await setWidgetExpenseBudget(Math.round(num));
            onFlash("Anggaran pengeluaran bulanan disimpan (terenkripsi DPAPI).");
          }}
          className={btnCls}
        >
          Atur Anggaran DPAPI
        </button>
        <button
          type="button"
          onClick={async () => {
            await triggerWidgetStorageScan();
            onFlash("Pemindaian Peta Penyimpanan on-demand dimulai.");
          }}
          className={`${btnCls} flex items-center justify-center gap-1.5`}
        >
          <HardDrive size={13} /> Pindai Penyimpanan
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="text"
          value={shortcutName}
          onChange={(e) => setShortcutName(e.target.value)}
          placeholder="Nama pintasan"
          className={inputCls}
        />
        <input
          type="text"
          value={shortcutPath}
          onChange={(e) => setShortcutPath(e.target.value)}
          placeholder="Path aplikasi/folder/URL"
          className={inputCls}
        />
        <button
          type="button"
          onClick={async () => {
            if (!shortcutName.trim() || !shortcutPath.trim()) return;
            await addWidgetShortcut(shortcutName.trim(), shortcutPath.trim());
            setShortcutName("");
            setShortcutPath("");
            onFlash("Pintasan cepat ditambahkan.");
          }}
          className={btnCls}
        >
          + Pintasan Cepat
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={photoFolder}
            onChange={(e) => setPhotoFolder(e.target.value)}
            placeholder="Folder foto lokal (Bingkai Foto)"
            className={`flex-1 ${inputCls}`}
          />
          <button
            type="button"
            onClick={async () => {
              if (!photoFolder.trim()) return;
              const count = await configureWidgetPhotoFolder(photoFolder.trim());
              onFlash(`Folder foto dimuat (${count} gambar baca-saja).`);
            }}
            className={btnCls}
          >
            Muat
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={recentFolder}
            onChange={(e) => setRecentFolder(e.target.value)}
            placeholder="Folder pantauan Berkas Terbaru (opt-in)"
            className={`flex-1 ${inputCls}`}
          />
          <button
            type="button"
            onClick={async () => {
              if (!recentFolder.trim()) return;
              await configureWidgetRecentFolders(true, [recentFolder.trim()], []);
              onFlash("Folder Berkas Terbaru (metadata saja) diaktifkan.");
            }}
            className={btnCls}
          >
            Aktifkan
          </button>
        </div>
      </div>

      {/* Countdown Moment */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="text"
          value={cdTitle}
          onChange={(e) => setCdTitle(e.target.value)}
          placeholder="Nama momen Hitung Mundur"
          className={inputCls}
        />
        <input
          type="text"
          value={cdDate}
          onChange={(e) => setCdDate(e.target.value)}
          placeholder="YYYY-MM-DD (mis. 2026-12-31)"
          className={inputCls}
        />
        <button
          type="button"
          onClick={async () => {
            if (!cdTitle.trim() || !cdDate.trim()) return;
            try {
              await addWidgetCountdown(cdTitle.trim(), cdDate.trim());
              setCdTitle("");
              onFlash("Momen Hitung Mundur ditambahkan.");
            } catch (e) {
              onFlash(String(e));
            }
          }}
          className={btnCls}
        >
          + Hitung Mundur
        </button>
      </div>

      {/* Quick Snippets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="text"
          value={snLabel}
          onChange={(e) => setSnLabel(e.target.value)}
          placeholder="Label Snippet Cepat"
          className={inputCls}
        />
        <input
          type="text"
          value={snContent}
          onChange={(e) => setSnContent(e.target.value)}
          placeholder="Isi teks yang disalin 1 klik"
          className={inputCls}
        />
        <button
          type="button"
          onClick={async () => {
            if (!snLabel.trim() || !snContent.trim()) return;
            await addWidgetSnippet(snLabel.trim(), snContent);
            setSnLabel("");
            setSnContent("");
            onFlash("Snippet cepat disimpan lokal.");
          }}
          className={btnCls}
        >
          + Tambah Snippet
        </button>
      </div>

      {/* World Clock Zone */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input
          type="text"
          value={wcCity}
          onChange={(e) => setWcCity(e.target.value)}
          placeholder="Kota Jam Dunia (mis. Singapura)"
          className={inputCls}
        />
        <input
          type="text"
          value={wcCode}
          onChange={(e) => setWcCode(e.target.value)}
          placeholder="Kode (SGT/WITA)"
          className={inputCls}
        />
        <input
          type="number"
          value={wcOffset}
          onChange={(e) => setWcOffset(e.target.value)}
          placeholder="Offset UTC (jam)"
          className={inputCls}
        />
        <button
          type="button"
          onClick={async () => {
            const off = Number(wcOffset);
            if (!wcCity.trim() || !Number.isFinite(off)) return;
            await addWidgetWorldClock(wcCity.trim(), wcCode.trim() || "UTC", off);
            setWcCity("");
            onFlash("Zona kota ditambahkan ke Jam Dunia.");
          }}
          className={btnCls}
        >
          + Kota Dunia
        </button>
      </div>
    </div>
  );
};
