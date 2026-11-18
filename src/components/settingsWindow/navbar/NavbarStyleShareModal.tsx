import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ClipboardPaste,
  Copy,
  Download,
  Share2,
  Upload,
  X,
} from "lucide-react";
import { NavbarConfig } from "../../../types/navbar";
import { Language } from "../../../services/i18n";
import {
  NAVBAR_STYLE_MAX_BYTES,
  NavbarStyleShareError,
  encodeNavbarStyleCode,
  exportNavbarStyleToFile,
  extractNavbarStyle,
  parseNavbarStyleShareInput,
} from "../../../services/navbarStyleShareService";
import { copyTextToClipboard, readTextFromClipboard } from "../../../utils/clipboard";
import { NavbarStyleModuleToggle } from "./NavbarStyleModuleToggle";
import { NavbarStyleSummaryCard } from "./NavbarStyleSummaryCard";

interface NavbarStyleShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: NavbarConfig;
  onApplyStyle: (stylePatch: Partial<NavbarConfig>, styleTitle: string) => void;
  isLightMode?: boolean;
  optLanguage?: Language;
}

function formatParseErrorMessage(err: unknown, isId: boolean): string {
  if (err instanceof NavbarStyleShareError) {
    if (err.code === "EMPTY") {
      return isId ? "Tempel kode style atau pilih file terlebih dahulu." : "Paste a style code or pick a file first.";
    }
    if (err.code === "TOO_LARGE") {
      return isId ? "Ukuran kode atau file melebihi batas 64 KB." : "Style code or file exceeds the 64 KB limit.";
    }
    if (err.code === "UNSUPPORTED_VERSION") {
      return isId ? "Versi style ini belum didukung oleh versi Gili Anda." : "This style version is not supported by your Gili version.";
    }
    if (err.code === "NO_STYLE_FIELDS") {
      return isId ? "Tidak ditemukan properti style Taskbar Gili yang valid." : "No valid Gili Taskbar style fields were found.";
    }
  }
  return isId
    ? "Kode atau file style tidak valid. Pastikan memakai kode GILI-STYLE1 atau file .gilistyle."
    : "Invalid style code or file. Use a GILI-STYLE1 code or .gilistyle file.";
}

export const NavbarStyleShareModal: React.FC<NavbarStyleShareModalProps> = ({
  isOpen,
  onClose,
  config,
  onApplyStyle,
  isLightMode = false,
  optLanguage = "id",
}) => {
  const isId = optLanguage === "id";
  const [activeTab, setActiveTab] = useState<"share" | "import">("share");
  const [styleName, setStyleName] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [includeModulesExport, setIncludeModulesExport] = useState(true);
  const [applyImportedModules, setApplyImportedModules] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setApplyImportedModules(true);
  }, [importText]);

  useEffect(() => {
    if (!isOpen) return;
    setStatusNotice(null);
    setImportError(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const currentStyle = useMemo(() => extractNavbarStyle(config), [config]);
  const exportActiveModuleCount = useMemo(
    () => (Array.isArray(config.modules) ? config.modules.filter((m) => m.enabled).length : 0),
    [config.modules]
  );
  const generatedCode = useMemo(
    () => encodeNavbarStyleCode(config, styleName, { includeModules: includeModulesExport }),
    [config, styleName, includeModulesExport]
  );

  const parsedImport = useMemo(() => {
    if (!importText.trim()) return { data: null, error: null as string | null };
    try {
      return { data: parseNavbarStyleShareInput(importText, config), error: null };
    } catch (err) {
      return { data: null, error: formatParseErrorMessage(err, isId) };
    }
  }, [importText, config, isId]);

  const handleCopyCode = async () => {
    const ok = await copyTextToClipboard(generatedCode);
    if (ok) {
      setCopiedCode(true);
      setStatusNotice({
        kind: "ok",
        text: isId ? "Kode style tersalin ke clipboard." : "Style code copied to clipboard.",
      });
      window.setTimeout(() => setCopiedCode(false), 1800);
    } else {
      setStatusNotice({
        kind: "err",
        text: isId ? "Gagal menyalin ke clipboard." : "Failed to copy to clipboard.",
      });
    }
  };

  const handleExportFile = async () => {
    try {
      const outcome = await exportNavbarStyleToFile(
        config,
        styleName || "gili-taskbar-style",
        { includeModules: includeModulesExport }
      );
      if (outcome === "saved") {
        setStatusNotice({
          kind: "ok",
          text: isId ? "File style .gilistyle berhasil disimpan." : ".gilistyle file saved successfully.",
        });
      }
    } catch (err) {
      setStatusNotice({
        kind: "err",
        text: isId ? `Gagal mengekspor file: ${String(err)}` : `Failed to export file: ${String(err)}`,
      });
    }
  };

  const handlePasteFromClipboard = async () => {
    setImportError(null);
    const clip = await readTextFromClipboard();
    if (!clip || !clip.trim()) {
      setImportError(
        isId ? "Clipboard kosong atau tidak berisi teks." : "Clipboard is empty or has no text."
      );
      return;
    }
    setImportText(clip.trim());
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > NAVBAR_STYLE_MAX_BYTES) {
      setImportError(
        isId ? "Ukuran file melebihi batas 64 KB." : "Selected file exceeds the 64 KB limit."
      );
      return;
    }
    try {
      const text = await file.text();
      setImportText(text);
    } catch {
      setImportError(isId ? "Gagal membaca file style." : "Failed to read style file.");
    }
  };

  const handleApplyImported = () => {
    if (!parsedImport.data) return;
    const label =
      parsedImport.data.name || (isId ? "Style Taskbar Impor" : "Imported Taskbar Style");
    const patch: Partial<NavbarConfig> =
      parsedImport.data.modules && applyImportedModules
        ? { ...parsedImport.data.style, modules: parsedImport.data.modules }
        : parsedImport.data.style;
    onApplyStyle(patch, label);
    onClose();
  };

  if (!isOpen) return null;

  const modalShellClass = isLightMode
    ? "bg-[#f5f5f7] border-black/10 text-neutral-900"
    : "bg-[#0d1017] border-[#232838] text-white";
  const inputBgClass = isLightMode
    ? "bg-white border-black/15 text-neutral-900 placeholder-neutral-400"
    : "bg-black/45 border-white/10 text-white placeholder-zinc-500";
  const secondaryBtnClass = isLightMode
    ? "bg-black/[0.06] hover:bg-black/[0.11] text-neutral-800 border-black/[0.08]"
    : "bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 border-white/[0.08]";

  const modal = (
    <AnimatePresence>
      <div
        className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 select-none ${
          isLightMode ? "bg-black/35 backdrop-blur-xs" : "bg-[#04060c]/85"
        }`}
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={isId ? "Bagikan & Impor Style Taskbar" : "Share & Import Taskbar Style"}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => e.stopPropagation()}
          className={`relative w-full max-w-[min(560px,calc(100vw-32px))] max-h-[calc(100vh-32px)] flex flex-col rounded-[20px] border shadow-2xl overflow-hidden ${modalShellClass}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-[9px] bg-[#3882F6]/15 flex items-center justify-center text-[#3882F6] shrink-0">
                <Share2 size={16} />
              </div>
              <div className="min-w-0">
                <h2 className="text-[16px] font-bold tracking-tight">
                  {isId ? "Bagikan & Impor Style Taskbar" : "Share & Import Taskbar Style"}
                </h2>
                <p className={`text-[11px] ${isLightMode ? "text-neutral-600" : "text-[#8a8fa0]"}`}>
                  {isId
                    ? "Salin kode atau ekspor file khusus style tampilan & efek visual Taskbar."
                    : "Copy a style code or export a file containing only Taskbar visual style & effects."}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label={isId ? "Tutup" : "Close"}
              onClick={onClose}
              className={`w-8 h-8 rounded-[10px] flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                isLightMode
                  ? "bg-black/[0.06] text-neutral-600 hover:text-neutral-900"
                  : "bg-[#141926] text-[#cfd3e0] hover:text-white"
              }`}
            >
              <X size={16} />
            </button>
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center gap-1.5 px-6 pb-3 shrink-0">
            {[
              { id: "share" as const, label: isId ? "Bagikan Style Saya" : "Share My Style" },
              { id: "import" as const, label: isId ? "Impor / Tempel Style" : "Import / Paste Style" },
            ].map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setStatusNotice(null);
                  }}
                  className={`px-3.5 py-1.5 rounded-[9px] text-[12px] font-semibold transition-all cursor-pointer ${
                    selected
                      ? isLightMode
                        ? "bg-blue-500/12 text-blue-700 border border-blue-500/35"
                        : "bg-[#1b2233] text-white border border-[#2f8bff]/50"
                      : isLightMode
                      ? "text-neutral-600 hover:text-neutral-900 border border-transparent"
                      : "text-zinc-400 hover:text-white border border-transparent"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto settings-scroll px-6 pb-5 flex flex-col gap-3">
            {activeTab === "share" ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium">
                    {isId ? "Nama Style (Opsional)" : "Style Name (Optional)"}
                  </label>
                  <input
                    type="text"
                    maxLength={48}
                    value={styleName}
                    onChange={(e) => setStyleName(e.target.value)}
                    placeholder={isId ? "cth: Glass Biru Minimal" : "e.g. Minimal Blue Glass"}
                    className={`h-9 px-3 rounded-[9px] border text-[12px] outline-none focus:border-[#3882F6] ${inputBgClass}`}
                  />
                </div>

                <NavbarStyleModuleToggle
                  checked={includeModulesExport}
                  onChange={setIncludeModulesExport}
                  title={
                    isId
                      ? `Sertakan susunan modul (${exportActiveModuleCount} modul aktif)`
                      : `Include module layout (${exportActiveModuleCount} active modules)`
                  }
                  subtitle={
                    isId
                      ? "Ikutkan daftar & urutan widget taskbar (kalender, pomodoro, media, dll)."
                      : "Include taskbar module list and grouping (calendar, pomodoro, media, etc.)."
                  }
                  isLightMode={isLightMode}
                />

                <NavbarStyleSummaryCard
                  styleData={currentStyle}
                  title={styleName.trim() || undefined}
                  modules={config.modules}
                  includeModules={includeModulesExport}
                  isLightMode={isLightMode}
                  optLanguage={optLanguage}
                />

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium">
                    {isId ? "Kode Style Taskbar" : "Taskbar Style Code"}
                  </label>
                  <textarea
                    readOnly
                    rows={3}
                    value={generatedCode}
                    onFocus={(e) => e.currentTarget.select()}
                    className={`w-full p-2.5 rounded-[10px] border text-[11px] font-mono resize-none select-all outline-none ${inputBgClass}`}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="h-9 px-3.5 rounded-[9px] bg-[#3882F6] hover:bg-[#2563eb] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                    <span>
                      {copiedCode
                        ? isId
                          ? "Kode Tersalin"
                          : "Code Copied"
                        : isId
                        ? "Salin Kode"
                        : "Copy Code"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportFile}
                    className={`h-9 px-3.5 rounded-[9px] border text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${secondaryBtnClass}`}
                  >
                    <Download size={14} />
                    <span>{isId ? "Ekspor File (.gilistyle)" : "Export File (.gilistyle)"}</span>
                  </button>
                </div>

                {statusNotice && (
                  <div
                    className={`px-3 py-2 rounded-[9px] text-[11.5px] font-medium border ${
                      statusNotice.kind === "ok"
                        ? isLightMode
                          ? "bg-emerald-500/10 border-emerald-600/25 text-emerald-700"
                          : "bg-emerald-500/12 border-emerald-500/30 text-emerald-300"
                        : isLightMode
                        ? "bg-rose-500/10 border-rose-600/25 text-rose-700"
                        : "bg-rose-500/12 border-rose-500/30 text-rose-300"
                    }`}
                  >
                    {statusNotice.text}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className={`h-9 px-3 rounded-[9px] border text-[11.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${secondaryBtnClass}`}
                  >
                    <ClipboardPaste size={13.5} />
                    <span>{isId ? "Tempel dari Clipboard" : "Paste from Clipboard"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`h-9 px-3 rounded-[9px] border text-[11.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${secondaryBtnClass}`}
                  >
                    <Upload size={13.5} />
                    <span>{isId ? "Pilih File (.gilistyle / .json)" : "Choose File (.gilistyle / .json)"}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".gilistyle,.json,application/json,text/plain"
                    onChange={handleFilePicked}
                    className="hidden"
                  />
                </div>

                <textarea
                  rows={3}
                  value={importText}
                  onChange={(e) => {
                    setImportError(null);
                    setImportText(e.target.value);
                  }}
                  placeholder={
                    isId
                      ? "Tempel kode GILI-STYLE1:... atau isi JSON .gilistyle di sini..."
                      : "Paste GILI-STYLE1:... code or .gilistyle JSON here..."
                  }
                  className={`w-full p-2.5 rounded-[10px] border text-[11px] font-mono resize-y min-h-[72px] outline-none focus:border-[#3882F6] ${inputBgClass}`}
                />

                {(importError || parsedImport.error) && (
                  <div
                    className={`px-3 py-2 rounded-[9px] text-[11.5px] font-medium border ${
                      isLightMode
                        ? "bg-rose-500/10 border-rose-600/25 text-rose-700"
                        : "bg-rose-500/12 border-rose-500/30 text-rose-300"
                    }`}
                  >
                    {importError || parsedImport.error}
                  </div>
                )}

                {parsedImport.data && (
                  <>
                    {parsedImport.data.modules ? (
                      <NavbarStyleModuleToggle
                        checked={applyImportedModules}
                        onChange={setApplyImportedModules}
                        title={
                          isId
                            ? `Terapkan juga susunan modul (${
                                parsedImport.data.modules.filter((m) => m.enabled).length
                              } modul aktif)`
                            : `Also apply module layout (${
                                parsedImport.data.modules.filter((m) => m.enabled).length
                              } active modules)`
                        }
                        subtitle={
                          isId
                            ? "Matikan jika hanya ingin menerapkan warna, tema ikon, dan efek visual."
                            : "Turn off to apply only colors, icon theme, and visual effects."
                        }
                        isLightMode={isLightMode}
                      />
                    ) : (
                      <div
                        className={`px-3 py-1.5 rounded-[9px] border text-[11px] ${
                          isLightMode
                            ? "bg-black/[0.03] border-black/[0.07] text-neutral-600"
                            : "bg-white/[0.03] border-white/[0.07] text-zinc-400"
                        }`}
                      >
                        {isId
                          ? "Kode ini hanya berisi style visual (susunan modul Anda saat ini tidak berubah)."
                          : "This share only contains visual styling (your current module layout stays unchanged)."}
                      </div>
                    )}

                    <NavbarStyleSummaryCard
                      styleData={parsedImport.data.style}
                      title={
                        parsedImport.data.name ||
                        (isId ? "Pratinjau Style Siap Diterapkan" : "Style Preview Ready to Apply")
                      }
                      modules={parsedImport.data.modules}
                      includeModules={applyImportedModules}
                      isLightMode={isLightMode}
                      optLanguage={optLanguage}
                    />
                  </>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  {importText.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        setImportText("");
                        setImportError(null);
                      }}
                      className={`h-9 px-3 rounded-[9px] border text-[11.5px] font-medium cursor-pointer transition-colors ${secondaryBtnClass}`}
                    >
                      {isId ? "Bersihkan" : "Clear"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!parsedImport.data}
                    onClick={handleApplyImported}
                    className="h-9 px-4 rounded-[9px] bg-[#3882F6] hover:bg-[#2563eb] disabled:opacity-45 disabled:cursor-not-allowed text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Check size={14} strokeWidth={2.5} />
                    <span>{isId ? "Terapkan Style" : "Apply Style"}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
};
