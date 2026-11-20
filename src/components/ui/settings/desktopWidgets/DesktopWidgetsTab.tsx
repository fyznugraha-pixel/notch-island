import React, { useEffect, useState } from "react";
import {
  Plus,
  Layers,
  Lock,
  Pencil,
  Trash2,
  Sliders,
  Activity,
  AppWindow,
  Monitor,
  Grid2x2,
  Gamepad2,
  BatteryCharging,
  Power,
} from "lucide-react";
import { Language } from "../../../../services/i18n";
import {
  DesktopWidgetsConfig,
  DisplayMode,
  WidgetCatalogEntry,
  WidgetRuntimeMetrics,
  WidgetSize,
  WidgetStackSlot,
  WidgetStyleConfig,
  getDesktopWidgetsCatalog,
  getDesktopWidgetsConfig,
  getDesktopWidgetsRuntimeMetrics,
  saveDesktopWidgetsConfig,
  setDesktopWidgetEditMode,
  syncFrontendWidgetMirror,
  toggleDesktopWidgetBoard,
} from "../../../../services/desktopWidgetsService";
import { SettingRow } from "../SettingRow";
import { IosSwitch } from "../../../ios/IosSwitch";
import { IosSegmentedControl } from "../../../ios/IosSegmentedControl";
import { IosSelect } from "../../../ios/IosSelect";
import { WidgetColorCustomizer } from "./WidgetColorCustomizer";
import { WidgetGalleryModal } from "./WidgetGalleryModal";
import { WidgetProvidersCard } from "./WidgetProvidersCard";

interface DesktopWidgetsTabProps {
  optLanguage: Language;
  isLightMode: boolean;
}

const CLOCK_STYLE_OPTIONS = [
  { value: "minimal_digital", label: "Digital Minimal" },
  { value: "kata_indonesia", label: "Tipografi Kata Indonesia" },
  { value: "analog_classic", label: "Analog Klasik" },
  { value: "analog_skeleton", label: "Analog Rangka" },
  { value: "stacked_bold", label: "Tumpuk Vertikal" },
  { value: "retro_flip", label: "Flip Retro" },
  { value: "editorial_thin", label: "Editorial Tipis" },
  { value: "dual_zone", label: "Jam Dunia Ganda" },
];

export const DesktopWidgetsTab: React.FC<DesktopWidgetsTabProps> = ({
  isLightMode,
}) => {
  const [config, setConfig] = useState<DesktopWidgetsConfig | null>(null);
  const [catalog, setCatalog] = useState<WidgetCatalogEntry[]>([]);
  const [metrics, setMetrics] = useState<WidgetRuntimeMetrics | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

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

  const cardClass = `w-full rounded-[18px] p-3 flex flex-col gap-1 transition-colors ${
    isLightMode
      ? "bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
      : "bg-[#121318] border border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]"
  }`;
  const sectionLabelClass = `px-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${
    isLightMode ? "text-neutral-500" : "text-zinc-500"
  }`;
  const mutedCls = isLightMode ? "text-neutral-500" : "text-zinc-400";

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

  const handleUpdateWidgetSetting = (slotId: string, key: string, value: unknown) => {
    persistConfig({
      ...config,
      slots: config.slots.map((s) => {
        if (s.slot_id !== slotId) return s;
        return {
          ...s,
          widgets: s.widgets.map((w, idx) =>
            idx === s.active_index
              ? { ...w, settings: { ...(w.settings || {}), [key]: value } }
              : w
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
        <div className="rounded-[14px] border border-[#0a84ff]/40 bg-[#0a84ff]/15 px-4 py-2.5 text-[12px] text-blue-200">
          {statusMsg}
        </div>
      )}

      {/* Hero Action Banner matching StandbyTab */}
      <div
        className={`w-full rounded-[18px] p-4 flex flex-wrap items-center justify-between gap-4 border ${
          isLightMode
            ? "bg-white border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
            : "bg-gradient-to-br from-[#141720] to-[#111216] border-white/[0.08]"
        }`}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                metrics?.running ? "bg-[#34c759]" : "bg-zinc-500"
              }`}
            />
            <span className="text-[14px] font-semibold">
              Widget Desktop Native Direct2D
            </span>
          </div>
          <p className={`text-[12px] ${mutedCls}`}>
            {metrics
              ? `${metrics.gpu_adapter || "Direct2D Siaga"} . ${metrics.monitor_count} monitor . ${metrics.target_fps} fps . ${metrics.working_set_mb.toFixed(1)} MB`
              : "Transparan sejati tanpa kartu secara default dan menembus klik di area kosong."}
          </p>
          <p className={`text-[11.5px] ${mutedCls}`}>
            Cara pakai: aktifkan sakelar di bawah, lalu langsung klik dan geser widget di desktop untuk memindahkan posisi. Klik kanan pada widget untuk ubah ukuran, warna, atau hapus.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="h-9 px-4 rounded-full bg-[#0a84ff] hover:bg-[#0071e3] text-white text-[12.5px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-[0_6px_18px_rgba(10,132,255,0.32)]"
          >
            <Plus size={14} /> Galeri (34)
          </button>
          <button
            type="button"
            onClick={() => toggleDesktopWidgetBoard().catch(() => {})}
            className={`h-9 px-3.5 rounded-full text-[12px] font-medium flex items-center gap-1.5 cursor-pointer border ${
              isLightMode
                ? "border-black/10 hover:bg-black/[0.05]"
                : "border-white/12 hover:bg-white/[0.08]"
            }`}
          >
            <AppWindow size={14} /> Papan Widget
          </button>
          <button
            type="button"
            onClick={() => setDesktopWidgetEditMode(!(metrics?.edit_mode ?? false))}
            className={`h-9 px-3.5 rounded-full text-[12px] font-medium flex items-center gap-1.5 cursor-pointer border ${
              metrics?.edit_mode
                ? "border-[#ff9f0a] bg-[#ff9f0a]/20 text-[#ff9f0a]"
                : isLightMode
                ? "border-black/10 hover:bg-black/[0.05]"
                : "border-white/12 hover:bg-white/[0.08]"
            }`}
          >
            <Pencil size={13} /> {metrics?.edit_mode ? "Selesai Edit" : "Edit"}
          </button>
        </div>
      </div>

      {/* Section 1: Umum & Perilaku */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>Aktivasi & Perilaku Host</span>
        <div className={cardClass}>
          <SettingRow
            icon={<Power size={15} />}
            iconBgClass="bg-[#34c759]/15"
            iconColorClass="text-[#34c759]"
            title="Aktifkan Widget Desktop"
            subtitle="Menjalankan jendela DirectComposition transparan per monitor tanpa WebView"
            isLightMode={isLightMode}
            control={
              <IosSwitch
                checked={config.enabled}
                onChange={(enabled) => persistConfig({ ...config, enabled })}
              />
            }
          />
          <SettingRow
            icon={<Monitor size={15} />}
            iconBgClass="bg-[#0a84ff]/15"
            iconColorClass="text-[#0a84ff]"
            title="Mode Tampil"
            subtitle={`Hotkey Papan Widget: ${config.board_hotkey} (tutup dengan Esc atau klik di luar)`}
            isLightMode={isLightMode}
            control={
              <IosSegmentedControl<DisplayMode>
                value={config.display_mode}
                onChange={(display_mode) => persistConfig({ ...config, display_mode })}
                options={[
                  { value: "desktop_attached", label: "Tempel Desktop" },
                  { value: "widget_board", label: "Papan Overlay" },
                ]}
              />
            }
          />
          <SettingRow
            icon={<Grid2x2 size={15} />}
            iconBgClass="bg-[#5e5ce6]/15"
            iconColorClass="text-[#5e5ce6]"
            title="Skala Grid Widget"
            subtitle="Mengubah proporsi ukuran S (160), M (336x160), dan L (336x336) secara serentak"
            isLightMode={isLightMode}
            control={
              <IosSegmentedControl<number>
                value={config.grid_scale}
                onChange={(grid_scale) => persistConfig({ ...config, grid_scale })}
                options={[
                  { value: 0.85, label: "0.85x" },
                  { value: 1.0, label: "1x" },
                  { value: 1.2, label: "1.2x" },
                ]}
              />
            }
          />
          <SettingRow
            icon={<Lock size={15} />}
            iconBgClass="bg-[#ff9f0a]/15"
            iconColorClass="text-[#ff9f0a]"
            title="Kunci Posisi Widget"
            subtitle="Mencegah widget tergeser tidak sengaja saat mode edit"
            isLightMode={isLightMode}
            control={
              <IosSwitch
                checked={config.positions_locked}
                onChange={(positions_locked) => persistConfig({ ...config, positions_locked })}
                activeColor="blue"
              />
            }
          />
          <SettingRow
            icon={<Gamepad2 size={15} />}
            iconBgClass="bg-[#ff375f]/15"
            iconColorClass="text-[#ff375f]"
            title="Jeda Total Saat Layar Penuh / Game"
            subtitle="Menghentikan render ke 0 fps saat aplikasi fullscreen aktif atau layar mati"
            isLightMode={isLightMode}
            control={
              <IosSwitch
                checked={config.auto_pause_fullscreen}
                onChange={(auto_pause_fullscreen) =>
                  persistConfig({ ...config, auto_pause_fullscreen })
                }
              />
            }
          />
          <SettingRow
            icon={<BatteryCharging size={15} />}
            iconBgClass="bg-[#30d158]/15"
            iconColorClass="text-[#30d158]"
            title="Hemat Daya Otomatis"
            subtitle="Batasi animasi 30 fps dan alihkan mode Kaca ke Solid saat Penghemat Daya aktif"
            isLightMode={isLightMode}
            control={
              <IosSwitch
                checked={config.auto_pause_power_saver}
                onChange={(auto_pause_power_saver) =>
                  persistConfig({ ...config, auto_pause_power_saver })
                }
              />
            }
          />
        </div>
      </div>

      {/* Section 2: Active Slots */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className={sectionLabelClass}>
            Widget Aktif di Desktop ({config.slots.length})
          </span>
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="text-[11.5px] font-semibold text-[#0a84ff] hover:underline cursor-pointer"
          >
            + Tambah Widget
          </button>
        </div>

        <div className={cardClass}>
          {config.slots.length === 0 ? (
            <div className={`px-3 py-4 text-[12px] ${mutedCls}`}>
              Belum ada widget terpasang. Buka Galeri (29) untuk menambahkan widget pertama Anda.
            </div>
          ) : (
            config.slots.map((slot) => {
              const active = slot.widgets[slot.active_index] ?? slot.widgets[0];
              const meta = catalog.find((c) => c.widget_type === active?.widget_type);
              const supported = meta?.supported_sizes ?? (["small", "medium", "large"] as WidgetSize[]);
              return (
                <div
                  key={slot.slot_id}
                  className={`flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-[12px] ${
                    isLightMode ? "hover:bg-black/[0.025]" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-[9px] bg-[#34c3a0]/15 text-[#34c3a0] flex items-center justify-center shrink-0">
                      <Layers size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate">
                        {meta?.name ?? active?.widget_type}
                        {slot.widgets.length > 1 && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[#0a84ff]/20 text-[#0a84ff]">
                            Tumpukan {slot.widgets.length}
                          </span>
                        )}
                      </div>
                      <div className={`text-[11px] ${mutedCls}`}>
                        Kolom {slot.grid_col + 1}, Baris {slot.grid_row + 1} .{" "}
                        {active?.style_override ? "Penimpaan gaya aktif" : "Ikut Tema Global"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {active?.widget_type === "styled_clock" && (
                      <IosSelect
                        value={String(active.settings?.clock_style ?? "minimal_digital")}
                        options={CLOCK_STYLE_OPTIONS}
                        onChange={(v) => handleUpdateWidgetSetting(slot.slot_id, "clock_style", v)}
                        isLightMode={isLightMode}
                        ariaLabel="Gaya jam"
                        minWidthClass="min-w-[140px]"
                      />
                    )}
                    <IosSegmentedControl<WidgetSize>
                      value={slot.size}
                      onChange={(sz) => handleChangeSlotSize(slot.slot_id, sz)}
                      options={supported.map((sz) => ({
                        value: sz,
                        label: sz === "small" ? "S" : sz === "medium" ? "M" : "L",
                      }))}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditingSlotId((cur) => (cur === slot.slot_id ? null : slot.slot_id))
                      }
                      className={`h-8 px-2.5 rounded-[10px] border text-[11.5px] font-medium flex items-center gap-1 cursor-pointer ${
                        editingSlotId === slot.slot_id
                          ? "border-[#0a84ff] bg-[#0a84ff]/15 text-[#0a84ff]"
                          : "border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <Sliders size={12} /> Gaya
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSlot(slot.slot_id)}
                      aria-label="Hapus widget"
                      className="w-8 h-8 rounded-[10px] hover:bg-red-500/20 text-red-400 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Per-Widget Style Override */}
      {editingSlot && editingWidget && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0a84ff]">
              Penimpaan Gaya Widget Terpilih
            </span>
            <button
              type="button"
              onClick={() => handleUpdateSlotStyle(editingSlot.slot_id, null)}
              className="text-[11.5px] text-zinc-400 hover:text-white cursor-pointer"
            >
              Reset ke Tema Global
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

      {/* Section 3: Global Theme */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>Tema Global & Keterbacaan</span>
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
      </div>

      {/* Section 4: Providers */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>Penyedia Data & Privasi Lokal</span>
        <WidgetProvidersCard isLightMode={isLightMode} onFlash={flash} />
      </div>

      {/* Telemetry Footer */}
      {metrics?.paused_reason && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-[12px] bg-amber-500/10 border border-amber-500/30 text-[11.5px] text-amber-300">
          <Activity size={14} />
          <span>Host Direct2D sedang jeda otomatis: {metrics.paused_reason}</span>
        </div>
      )}

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
