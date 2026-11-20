import React, { useEffect, useState } from "react";
import {
  Plus,
  Layers,
  Lock,
  Unlock,
  Pencil,
  Trash2,
  Sliders,
  Download,
  HardDrive,
  Activity,
  AppWindow,
} from "lucide-react";
import { Language } from "../../../../services/i18n";
import {
  DesktopWidgetsConfig,
  WidgetCatalogEntry,
  WidgetRuntimeMetrics,
  WidgetSize,
  WidgetStackSlot,
  WidgetStyleConfig,
  addWidgetShortcut,
  addWidgetTimeProject,
  addWidgetUptimeSite,
  configureWidgetPhotoFolder,
  configureWidgetRecentFolders,
  exportWidgetTimeTrackerCsv,
  getDesktopWidgetsCatalog,
  getDesktopWidgetsConfig,
  getDesktopWidgetsRuntimeMetrics,
  saveDesktopWidgetsConfig,
  saveGithubWidgetToken,
  setDesktopWidgetEditMode,
  setWidgetExpenseBudget,
  syncFrontendWidgetMirror,
  toggleDesktopWidgetBoard,
  triggerWidgetStorageScan,
} from "../../../../services/desktopWidgetsService";
import { WidgetColorCustomizer } from "./WidgetColorCustomizer";
import { WidgetGalleryModal } from "./WidgetGalleryModal";

interface DesktopWidgetsTabProps {
  optLanguage: Language;
  isLightMode: boolean;
}

export const DesktopWidgetsTab: React.FC<DesktopWidgetsTabProps> = ({
  isLightMode,
}) => {
  const [config, setConfig] = useState<DesktopWidgetsConfig | null>(null);
  const [catalog, setCatalog] = useState<WidgetCatalogEntry[]>([]);
  const [metrics, setMetrics] = useState<WidgetRuntimeMetrics | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Quick provider setup fields
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

  useEffect(() => {
    let alive = true;
    Promise.all([
      getDesktopWidgetsConfig(),
      getDesktopWidgetsCatalog(),
      getDesktopWidgetsRuntimeMetrics(),
    ])
      .then(([cfg, cat, met]) => {
        if (!alive) return;
        setConfig(cfg);
        setCatalog(cat);
        setMetrics(met);
      })
      .catch(() => {});

    syncFrontendWidgetMirror().catch(() => {});

    const timer = window.setInterval(() => {
      getDesktopWidgetsRuntimeMetrics()
        .then((m) => {
          if (alive) setMetrics(m);
        })
        .catch(() => {});
    }, 3000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const flash = (msg: string) => {
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(null), 3500);
  };

  const persistConfig = async (next: DesktopWidgetsConfig) => {
    setConfig(next);
    try {
      const saved = await saveDesktopWidgetsConfig(next);
      setConfig(saved);
    } catch (err) {
      flash(`Gagal menyimpan pengaturan widget: ${String(err)}`);
    }
  };

  if (!config) {
    return (
      <div className="p-6 text-[13px] text-zinc-400">
        Memuat pengaturan Widget Desktop native...
      </div>
    );
  }

  const cardCls = isLightMode
    ? "rounded-2xl border border-black/10 bg-black/[0.025] p-4"
    : "rounded-2xl border border-white/10 bg-white/[0.03] p-4";
  const mutedCls = isLightMode ? "text-neutral-500" : "text-zinc-400";
  const inputCls = isLightMode
    ? "px-2.5 py-1.5 rounded-lg border border-black/15 bg-white text-[12px]"
    : "px-2.5 py-1.5 rounded-lg border border-white/10 bg-black/30 text-[12px] text-white";

  const handleAddWidget = (entry: WidgetCatalogEntry, size: WidgetSize) => {
    const nextRow = config.slots.reduce((mx, s) => Math.max(mx, s.grid_row + 1), 0);
    const id = `slot_${Date.now()}`;
    const newSlot: WidgetStackSlot = {
      slot_id: id,
      monitor_id: "primary",
      size,
      grid_col: 0,
      grid_row: nextRow,
      active_index: 0,
      auto_rotate_minutes: 0,
      widgets: [
        {
          instance_id: `w_${Date.now()}`,
          widget_type: entry.widget_type,
          style_override: null,
          settings: {},
        },
      ],
    };
    persistConfig({ ...config, enabled: true, slots: [...config.slots, newSlot] });
    setGalleryOpen(false);
    flash(`Widget "${entry.name}" ditambahkan ke desktop.`);
  };

  const handleRemoveSlot = (slotId: string) => {
    persistConfig({
      ...config,
      slots: config.slots.filter((s) => s.slot_id !== slotId),
    });
    if (editingSlotId === slotId) setEditingSlotId(null);
  };

  const handleChangeSlotSize = (slotId: string, size: WidgetSize) => {
    persistConfig({
      ...config,
      slots: config.slots.map((s) => (s.slot_id === slotId ? { ...s, size } : s)),
    });
  };

  const handleUpdateSlotStyle = (slotId: string, style: WidgetStyleConfig | null) => {
    persistConfig({
      ...config,
      slots: config.slots.map((s) => {
        if (s.slot_id !== slotId) return s;
        return {
          ...s,
          widgets: s.widgets.map((w, idx) =>
            idx === s.active_index ? { ...w, style_override: style } : w
          ),
        };
      }),
    });
  };

  const handleSavePreset = (name: string, style: WidgetStyleConfig) => {
    const next = {
      ...config,
      presets: [...config.presets, { id: `preset_${Date.now()}`, name, style }],
    };
    persistConfig(next);
    flash(`Preset "${name}" tersimpan.`);
  };

  const handleRecordRecentColor = (hex: string) => {
    const dedup = [hex, ...config.recent_colors.filter((c) => c !== hex)].slice(0, 12);
    persistConfig({ ...config, recent_colors: dedup });
  };

  const editingSlot = config.slots.find((s) => s.slot_id === editingSlotId) ?? null;
  const editingWidget = editingSlot?.widgets[editingSlot.active_index] ?? null;

  return (
    <div className="flex flex-col gap-5 w-full pb-8">
      {statusMsg && (
        <div className="rounded-xl border border-blue-500/40 bg-blue-500/15 px-3.5 py-2.5 text-[12px] text-blue-200">
          {statusMsg}
        </div>
      )}

      {/* Main Activation & Mode Controls */}
      <div className={`${cardCls} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold">Widget Desktop Native (Direct2D)</h3>
            <p className={`text-[12px] mt-0.5 ${mutedCls}`}>
              Transparan tanpa kartu secara default, menembus klik di area kosong, dan hemat GPU.
            </p>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <span className="text-[12.5px] font-medium">
              {config.enabled ? "Aktif" : "Nonaktif"}
            </span>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => persistConfig({ ...config, enabled: e.target.checked })}
              className="w-4 h-4 accent-blue-500"
            />
          </label>
        </div>

        {/* Display mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => persistConfig({ ...config, display_mode: "desktop_attached" })}
            className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
              config.display_mode === "desktop_attached"
                ? "border-blue-500 bg-blue-500/15"
                : "border-white/10 hover:bg-white/[0.04]"
            }`}
          >
            <div className="text-[12.5px] font-semibold">1. Tempel di Desktop</div>
            <div className={`text-[11px] mt-0.5 ${mutedCls}`}>
              Selalu berada di z-order paling bawah tepat di atas wallpaper.
            </div>
          </button>
          <button
            type="button"
            onClick={() => persistConfig({ ...config, display_mode: "widget_board" })}
            className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
              config.display_mode === "widget_board"
                ? "border-blue-500 bg-blue-500/15"
                : "border-white/10 hover:bg-white/[0.04]"
            }`}
          >
            <div className="text-[12.5px] font-semibold">2. Papan Widget (Overlay)</div>
            <div className={`text-[11px] mt-0.5 ${mutedCls}`}>
              Muncul lewat hotkey ({config.board_hotkey}), tutup dengan Esc atau klik di luar.
            </div>
          </button>
        </div>

        {/* Quick actions row */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} /> Galeri Widget (29)
          </button>
          <button
            type="button"
            onClick={() => toggleDesktopWidgetBoard().catch(() => {})}
            className="px-3 py-2 rounded-xl border border-white/15 hover:bg-white/10 text-[12px] font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <AppWindow size={14} /> Buka / Tutup Papan
          </button>
          <button
            type="button"
            onClick={() => setDesktopWidgetEditMode(!(metrics?.edit_mode ?? false))}
            className="px-3 py-2 rounded-xl border border-white/15 hover:bg-white/10 text-[12px] font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Pencil size={14} /> {metrics?.edit_mode ? "Selesai Edit" : "Mode Edit"}
          </button>
          <button
            type="button"
            onClick={() =>
              persistConfig({ ...config, positions_locked: !config.positions_locked })
            }
            className="px-3 py-2 rounded-xl border border-white/15 hover:bg-white/10 text-[12px] font-medium flex items-center gap-1.5 cursor-pointer"
          >
            {config.positions_locked ? <Lock size={14} /> : <Unlock size={14} />}
            {config.positions_locked ? "Posisi Terkunci" : "Kunci Posisi"}
          </button>
        </div>

        {/* Grid Scale & Power Policy */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10 text-[12px]">
          <div className="flex items-center gap-2">
            <span className={mutedCls}>Skala Grid:</span>
            {[0.85, 1.0, 1.2].map((sc) => (
              <button
                key={sc}
                type="button"
                onClick={() => persistConfig({ ...config, grid_scale: sc })}
                className={`px-2.5 py-1 rounded-lg border cursor-pointer ${
                  Math.abs(config.grid_scale - sc) < 0.02
                    ? "border-blue-500 bg-blue-500/20 text-blue-300"
                    : "border-white/10"
                }`}
              >
                {sc}x
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.auto_pause_fullscreen}
                onChange={(e) =>
                  persistConfig({ ...config, auto_pause_fullscreen: e.target.checked })
                }
              />
              <span>Jeda saat game/layar penuh</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.auto_pause_power_saver}
                onChange={(e) =>
                  persistConfig({ ...config, auto_pause_power_saver: e.target.checked })
                }
              />
              <span>Batasi 30 fps saat Penghemat Daya</span>
            </label>
          </div>
        </div>
      </div>

      {/* Runtime Telemetry */}
      {metrics && (
        <div className={`${cardCls} flex flex-wrap items-center justify-between gap-3 text-[12px]`}>
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-emerald-400" />
            <span className="font-semibold">Status Host Direct2D</span>
          </div>
          <div className={`flex flex-wrap gap-3 ${mutedCls}`}>
            <span>GPU: {metrics.gpu_adapter || "Siaga"}</span>
            <span>Monitor: {metrics.monitor_count}</span>
            <span>FPS: {metrics.target_fps}</span>
            <span>Memori: {metrics.working_set_mb.toFixed(1)} MB</span>
            {metrics.paused_reason && (
              <span className="text-amber-300">({metrics.paused_reason})</span>
            )}
          </div>
        </div>
      )}

      {/* Active Slots & Stacks */}
      <div className={`${cardCls} flex flex-col gap-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-blue-400" />
            <span className="text-[13.5px] font-semibold">
              Widget Aktif di Desktop ({config.slots.length})
            </span>
          </div>
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="text-[12px] text-blue-400 hover:underline cursor-pointer"
          >
            + Tambah Widget
          </button>
        </div>

        {config.slots.length === 0 ? (
          <p className={`text-[12px] ${mutedCls}`}>
            Belum ada widget terpasang. Buka Galeri Widget untuk menambahkan.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {config.slots.map((slot) => {
              const active = slot.widgets[slot.active_index] ?? slot.widgets[0];
              const meta = catalog.find((c) => c.widget_type === active?.widget_type);
              return (
                <div
                  key={slot.slot_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5"
                >
                  <div>
                    <div className="text-[12.5px] font-semibold">
                      {meta?.name ?? active?.widget_type}
                      {slot.widgets.length > 1 && (
                        <span className="ml-2 text-[10.5px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                          Tumpukan {slot.widgets.length}
                        </span>
                      )}
                    </div>
                    <div className={`text-[11px] ${mutedCls}`}>
                      Kolom {slot.grid_col + 1}, Baris {slot.grid_row + 1} .{" "}
                      {active?.style_override ? "Gaya kustom" : "Ikut Tema Global"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(meta?.supported_sizes ?? (["small", "medium", "large"] as WidgetSize[])).map(
                      (sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => handleChangeSlotSize(slot.slot_id, sz)}
                          className={`px-2 py-1 rounded text-[10.5px] uppercase border cursor-pointer ${
                            slot.size === sz
                              ? "border-blue-500 bg-blue-500/20 text-blue-300"
                              : "border-white/10"
                          }`}
                        >
                          {sz[0]}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setEditingSlotId((cur) => (cur === slot.slot_id ? null : slot.slot_id))
                      }
                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Sliders size={12} /> Gaya
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSlot(slot.slot_id)}
                      aria-label="Hapus widget"
                      className="w-7 h-7 rounded-lg hover:bg-red-500/20 text-red-400 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-Widget Override Customizer */}
      {editingSlot && editingWidget && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[12px] font-semibold text-blue-300">
              Penimpaan Gaya Khusus Slot: {editingSlot.slot_id}
            </span>
            <button
              type="button"
              onClick={() => handleUpdateSlotStyle(editingSlot.slot_id, null)}
              className="text-[11.5px] text-zinc-400 hover:text-white cursor-pointer"
            >
              Kembalikan ke Tema Global
            </button>
          </div>
          <WidgetColorCustomizer
            title="Kustomisasi Warna & Latar Widget Ini"
            style={editingWidget.style_override ?? config.global_theme}
            presets={config.presets}
            recentColors={config.recent_colors}
            isLightMode={isLightMode}
            onChange={(nextStyle) => handleUpdateSlotStyle(editingSlot.slot_id, nextStyle)}
            onSavePreset={handleSavePreset}
            onRecordRecentColor={handleRecordRecentColor}
          />
        </div>
      )}

      {/* Global Theme Customizer */}
      <WidgetColorCustomizer
        title="Tema Global Semua Widget"
        style={config.global_theme}
        presets={config.presets}
        recentColors={config.recent_colors}
        isLightMode={isLightMode}
        onChange={(nextGlobal) => persistConfig({ ...config, global_theme: nextGlobal })}
        onSavePreset={handleSavePreset}
        onRecordRecentColor={handleRecordRecentColor}
      />

      {/* Provider Configuration Panel */}
      <div className={`${cardCls} flex flex-col gap-4`}>
        <h4 className="text-[13.5px] font-semibold">Konfigurasi Data & Penyedia Widget</h4>

        {/* GitHub Read-only PAT (Windows Credential Manager) */}
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
              flash("Token GitHub disimpan aman di Windows Credential Manager.");
            }}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[12px] font-medium cursor-pointer"
          >
            Simpan Status GitHub
          </button>
        </div>

        {/* Site Uptime Monitor */}
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
                flash("Situs ditambahkan ke pemantau uptime (min 60 detik).");
              } catch (e) {
                flash(String(e));
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[12px] font-medium cursor-pointer"
          >
            Tambah Situs Uptime
          </button>
        </div>

        {/* Time Tracker & Expense Budget */}
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
              flash("Proyek pelacak waktu ditambahkan.");
            }}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[12px] font-medium cursor-pointer"
          >
            + Proyek Waktu
          </button>
          <button
            type="button"
            onClick={async () => {
              const path = await exportWidgetTimeTrackerCsv();
              flash(`CSV tersimpan di: ${path}`);
            }}
            className="px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/10 text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download size={13} /> Ekspor CSV Waktu
          </button>
        </div>

        {/* Expense DPAPI budget + Storage Treemap */}
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
              flash("Anggaran pengeluaran bulanan disimpan (terenkripsi DPAPI).");
            }}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[12px] font-medium cursor-pointer"
          >
            Atur Anggaran DPAPI
          </button>
          <button
            type="button"
            onClick={async () => {
              await triggerWidgetStorageScan();
              flash("Pemindaian Peta Penyimpanan on-demand dimulai.");
            }}
            className="px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/10 text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <HardDrive size={13} /> Pindai Penyimpanan
          </button>
        </div>

        {/* Shortcuts, Photo Frame, Recent Files (Opt-in) */}
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
              flash("Pintasan cepat ditambahkan.");
            }}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[12px] font-medium cursor-pointer"
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
                flash(`Folder foto dimuat (${count} gambar baca-saja).`);
              }}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[12px] cursor-pointer"
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
                flash("Folder Berkas Terbaru (metadata saja) diaktifkan.");
              }}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[12px] cursor-pointer"
            >
              Aktifkan
            </button>
          </div>
        </div>
      </div>

      <WidgetGalleryModal
        open={galleryOpen}
        catalog={catalog}
        isLightMode={isLightMode}
        onClose={() => setGalleryOpen(false)}
        onAddWidget={handleAddWidget}
      />
    </div>
  );
};
