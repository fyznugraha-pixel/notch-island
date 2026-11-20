import React, { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
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
  takePendingWidgetProvider,
  toggleDesktopWidgetBoard,
} from "../../../../services/desktopWidgetsService";
import { SettingRow } from "../SettingRow";
import { IosSwitch } from "../../../ios/IosSwitch";
import { IosSegmentedControl } from "../../../ios/IosSegmentedControl";
import { IosSelect } from "../../../ios/IosSelect";
import { WidgetColorCustomizer } from "./WidgetColorCustomizer";
import { WidgetGalleryModal } from "./WidgetGalleryModal";
import { WidgetProvidersCard } from "./WidgetProvidersCard";
import { useGiliProLicense } from "../../../../hooks/useGiliProLicense";
import { TaskbarProBanner } from "../../../settingsWindow/navbar/TaskbarProBanner";
import {
  getCalendarStyleOptions,
  getClockStyleOptions,
  localizeCatalogEntry,
  localizePausedReason,
} from "./desktopWidgetsI18n";

interface DesktopWidgetsTabProps {
  optLanguage: Language;
  isLightMode: boolean;
}

export const DesktopWidgetsTab: React.FC<DesktopWidgetsTabProps> = ({
  optLanguage,
  isLightMode,
}) => {
  const isId = optLanguage === "id";
  const tr = (idText: string, enText: string) => (isId ? idText : enText);
  const {
    proStatus,
    isProLocked,
    isPurchasing,
    isRefreshingLicense,
    proFeedback,
    bannerPulse,
    proBannerRef,
    handlePurchasePro,
    handleRefreshLicense,
    promptProUpgrade,
  } = useGiliProLicense(optLanguage);
  const clockStyleOptions = getClockStyleOptions(isId);
  const calendarStyleOptions = getCalendarStyleOptions(isId);
  const [config, setConfig] = useState<DesktopWidgetsConfig | null>(null);
  const [catalog, setCatalog] = useState<WidgetCatalogEntry[]>([]);
  const [metrics, setMetrics] = useState<WidgetRuntimeMetrics | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [focusProvider, setFocusProvider] = useState<{ id: string; nonce: number } | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const configRef = useRef<DesktopWidgetsConfig | null>(null);
  configRef.current = config;

  useEffect(() => {
    let alive = true;
    const focusProviderById = (pid: string | null) => {
      if (!alive || !pid) return;
      setFocusProvider((prev) => ({ id: pid, nonce: (prev?.nonce ?? 0) + 1 }));
    };

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
      .catch(() => { });

    takePendingWidgetProvider().then(focusProviderById).catch(() => { });
    syncFrontendWidgetMirror().catch(() => { });

    const unlistenPromise = listen("desktop-widgets-config-changed", () => {
      getDesktopWidgetsConfig()
        .then((fresh) => {
          if (alive) setConfig(fresh);
        })
        .catch(() => { });
    });

    const unlistenFocusPromise = listen<string>("desktop-widgets-focus-provider", (event) => {
      if (!alive || !event.payload) return;
      takePendingWidgetProvider().catch(() => null);
      focusProviderById(event.payload);
    });

    const timer = window.setInterval(() => {
      getDesktopWidgetsRuntimeMetrics()
        .then((m) => {
          if (alive) setMetrics(m);
        })
        .catch(() => { });
    }, 3000);

    return () => {
      alive = false;
      window.clearInterval(timer);
      unlistenPromise.then((fn) => fn()).catch(() => { });
      unlistenFocusPromise.then((fn) => fn()).catch(() => { });
    };
  }, []);

  useEffect(() => {
    syncFrontendWidgetMirror().catch(() => { });
  }, [optLanguage]);

  const flash = (msg: string) => {
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(null), 3500);
  };

  const persistConfig = async (
    nextOrUpdater:
      | DesktopWidgetsConfig
      | ((prev: DesktopWidgetsConfig) => DesktopWidgetsConfig)
  ) => {
    const base = configRef.current;
    const rawNext =
      typeof nextOrUpdater === "function"
        ? base
          ? nextOrUpdater(base)
          : null
        : nextOrUpdater;
    if (!rawNext) return;
    const next = isProLocked ? { ...rawNext, enabled: false } : rawNext;
    configRef.current = next;
    setConfig(next);
    try {
      const saved = await saveDesktopWidgetsConfig(next);
      configRef.current = saved;
      setConfig(saved);
    } catch (err) {
      flash(
        tr(
          `Gagal menyimpan pengaturan widget: ${String(err)}`,
          `Failed to save widget settings: ${String(err)}`
        )
      );
    }
  };

  if (!config) {
    return (
      <div className="p-6 text-[13px] text-zinc-400">
        {tr(
          "Memuat pengaturan Widget Desktop native...",
          "Loading native Desktop Widgets settings..."
        )}
      </div>
    );
  }

  const effectiveEnabled = !isProLocked && config.enabled;

  const cardClass = `w-full rounded-[18px] p-3 flex flex-col gap-1 transition-colors ${isLightMode
    ? "bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
    : "bg-[#121318] border border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]"
    }`;
  const sectionLabelClass = `px-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${isLightMode ? "text-neutral-500" : "text-zinc-500"
    }`;
  const mutedCls = isLightMode ? "text-neutral-500" : "text-zinc-400";

  const handleAddWidget = (entry: WidgetCatalogEntry, size: WidgetSize) => {
    // Auto-place into columns of at most 3 rows so new widgets never clip behind the taskbar
    const usedCells = new Set(config.slots.map((s) => `${s.grid_col},${s.grid_row}`));
    let chosenCol = 0;
    let chosenRow = 0;
    outer: for (let col = 0; col <= 8; col += 2) {
      for (let row = 0; row < 3; row++) {
        if (!usedCells.has(`${col},${row}`)) {
          chosenCol = col;
          chosenRow = row;
          break outer;
        }
      }
    }
    const id = `slot_${Date.now()}`;
    const newSlot: WidgetStackSlot = {
      slot_id: id,
      monitor_id: "primary",
      size,
      grid_col: chosenCol,
      grid_row: chosenRow,
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
    if (isProLocked) {
      persistConfig({ ...config, enabled: false, slots: [...config.slots, newSlot] });
      setGalleryOpen(false);
      promptProUpgrade(async () => {
        const latest = configRef.current;
        if (!latest) return;
        const saved = await saveDesktopWidgetsConfig({ ...latest, enabled: true });
        configRef.current = saved;
        setConfig(saved);
      });
      return;
    }
    persistConfig({ ...config, enabled: true, slots: [...config.slots, newSlot] });
    setGalleryOpen(false);
    const localized = localizeCatalogEntry(entry, isId);
    flash(
      tr(
        `Widget "${localized.name}" ditambahkan ke desktop.`,
        `Widget "${localized.name}" added to desktop.`
      )
    );
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

  const mergeRecentHex = (prev: string[], hex?: string) =>
    hex ? [hex, ...prev.filter((c) => c !== hex)].slice(0, 12) : prev;

  const handleUpdateSlotStyle = (
    slotId: string,
    style: WidgetStyleConfig | null,
    recordedHex?: string
  ) => {
    persistConfig((prev) => ({
      ...prev,
      recent_colors: mergeRecentHex(prev.recent_colors, recordedHex),
      slots: prev.slots.map((s) => {
        if (s.slot_id !== slotId) return s;
        return {
          ...s,
          widgets: s.widgets.map((w, idx) =>
            idx === s.active_index ? { ...w, style_override: style } : w
          ),
        };
      }),
    }));
  };

  const handleUpdateGlobalStyle = (nextGlobal: WidgetStyleConfig, recordedHex?: string) => {
    persistConfig((prev) => ({
      ...prev,
      global_theme: nextGlobal,
      recent_colors: mergeRecentHex(prev.recent_colors, recordedHex),
    }));
  };

  const handleUpdateWidgetSetting = (slotId: string, key: string, value: unknown) => {
    persistConfig((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => {
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
    }));
  };

  const handleSavePreset = (name: string, style: WidgetStyleConfig) => {
    persistConfig((prev) => ({
      ...prev,
      presets: [...prev.presets, { id: `preset_${Date.now()}`, name, style }],
    }));
    flash(tr(`Preset "${name}" tersimpan.`, `Preset "${name}" saved.`));
  };

  const handleRecordRecentColor = (hex: string) => {
    persistConfig((prev) => ({
      ...prev,
      recent_colors: mergeRecentHex(prev.recent_colors, hex),
    }));
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

      {/* Pro Upgrade Banner (MSIX Store builds when locked) */}
      {isProLocked && (
        <div ref={proBannerRef}>
          <TaskbarProBanner
            context="widgets"
            proStatus={proStatus}
            isPurchasing={isPurchasing}
            isRefreshing={isRefreshingLicense}
            feedback={proFeedback}
            highlightPulse={bannerPulse}
            onPurchase={() => handlePurchasePro()}
            onRefreshLicense={() => handleRefreshLicense()}
            isLightMode={isLightMode}
            optLanguage={optLanguage}
          />
        </div>
      )}

      {/* Hero Action Banner matching StandbyTab */}
      <div
        className={`w-full rounded-[18px] p-4 flex flex-wrap items-center justify-between gap-4 border ${isLightMode
          ? "bg-white border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
          : "bg-gradient-to-br from-[#141720] to-[#111216] border-white/[0.08]"
          }`}
      >
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${!isProLocked && metrics?.running ? "bg-[#34c759]" : isProLocked ? "bg-[#60a5fa]" : "bg-zinc-500"
                }`}
            />
            <span className="text-[14px] font-semibold">
              {tr("Widget Desktop Native Direct2D", "Native Direct2D Desktop Widgets")}
            </span>
            {isProLocked && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                  isLightMode
                    ? "bg-[#eff6ff] text-[#1d4ed8]"
                    : "bg-[#0a84ff]/15 text-[#93c5fd]"
                }`}
              >
                {tr("Widget Pro · Mode Preview", "Widgets Pro · Preview Only")}
              </span>
            )}
          </div>
          <p className={`text-[12px] ${mutedCls}`}>
            {metrics
              ? `${metrics.gpu_adapter || tr("Direct2D Siaga", "Direct2D Standby")} . ${metrics.monitor_count} monitor . ${metrics.target_fps} fps . ${metrics.working_set_mb.toFixed(1)} MB`
              : tr(
                  "Lapisan frosted adaptif yang bersih dan menembus klik di area kosong.",
                  "Crisp frosted surface with seamless click-through on empty areas."
                )}
          </p>
          <p className={`text-[11.5px] ${mutedCls}`}>
            {tr(
              "Cara pakai: aktifkan sakelar di bawah, lalu langsung klik dan geser widget di desktop untuk memindahkan posisi. Klik kanan pada widget untuk ubah ukuran, warna, atau hapus.",
              "How to use: enable the toggle below, then click and drag widgets directly on the desktop to reposition them. Right-click a widget to resize, restyle, or remove it."
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="h-9 px-4 rounded-full bg-[#0a84ff] hover:bg-[#0071e3] text-white text-[12.5px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-[0_6px_18px_rgba(10,132,255,0.32)]"
          >
            <Plus size={14} /> {tr("Galeri (34)", "Gallery (34)")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (isProLocked) {
                promptProUpgrade(() => {
                  toggleDesktopWidgetBoard().catch(() => { });
                });
                return;
              }
              toggleDesktopWidgetBoard().catch(() => { });
            }}
            className={`h-9 px-3.5 rounded-full text-[12px] font-medium flex items-center gap-1.5 cursor-pointer border ${isLightMode
              ? "border-black/10 hover:bg-black/[0.05]"
              : "border-white/12 hover:bg-white/[0.08]"
              }`}
          >
            {isProLocked ? <Lock size={13} /> : <AppWindow size={14} />} {tr("Papan Widget", "Widget Board")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (isProLocked) {
                promptProUpgrade();
                return;
              }
              setDesktopWidgetEditMode(!(metrics?.edit_mode ?? false));
            }}
            className={`h-9 px-3.5 rounded-full text-[12px] font-medium flex items-center gap-1.5 cursor-pointer border ${!isProLocked && metrics?.edit_mode
              ? "border-[#ff9f0a] bg-[#ff9f0a]/20 text-[#ff9f0a]"
              : isLightMode
                ? "border-black/10 hover:bg-black/[0.05]"
                : "border-white/12 hover:bg-white/[0.08]"
              }`}
          >
            <Pencil size={13} />{" "}
            {!isProLocked && metrics?.edit_mode ? tr("Selesai Edit", "Done") : tr("Edit", "Edit")}
          </button>
        </div>
      </div>

      {/* Section 1: Umum & Perilaku */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>
          {tr("Aktivasi & Perilaku Host", "Host Activation & Behavior")}
        </span>
        <div className={cardClass}>
          <SettingRow
            icon={<Power size={15} />}
            iconBgClass="bg-[#34c759]/15"
            iconColorClass="text-[#34c759]"
            title={tr("Aktifkan Widget Desktop", "Enable Desktop Widgets")}
            subtitle={tr(
              "Menjalankan jendela DirectComposition transparan per monitor tanpa WebView",
              "Runs lightweight transparent DirectComposition windows per display without WebView"
            )}
            isLightMode={isLightMode}
            control={
              <IosSwitch
                checked={effectiveEnabled}
                onChange={(enabled) => {
                  if (isProLocked) {
                    promptProUpgrade(async () => {
                      const latest = configRef.current;
                      if (!latest) return;
                      const saved = await saveDesktopWidgetsConfig({ ...latest, enabled: true });
                      configRef.current = saved;
                      setConfig(saved);
                    });
                    return;
                  }
                  persistConfig({ ...config, enabled });
                }}
              />
            }
          />
          <SettingRow
            icon={<Monitor size={15} />}
            iconBgClass="bg-[#0a84ff]/15"
            iconColorClass="text-[#0a84ff]"
            title={tr("Mode Tampil", "Display Mode")}
            subtitle={tr(
              `Hotkey Papan Widget: ${config.board_hotkey} (tutup dengan Esc atau klik di luar)`,
              `Widget Board shortcut: ${config.board_hotkey} (press Esc or click outside to close)`
            )}
            isLightMode={isLightMode}
            control={
              <IosSegmentedControl<DisplayMode>
                value={config.display_mode}
                onChange={(display_mode) => persistConfig({ ...config, display_mode })}
                options={[
                  { value: "desktop_attached", label: tr("Tempel Desktop", "Desktop Attached") },
                  { value: "widget_board", label: tr("Papan Overlay", "Overlay Board") },
                ]}
              />
            }
          />
          <SettingRow
            icon={<Grid2x2 size={15} />}
            iconBgClass="bg-[#5e5ce6]/15"
            iconColorClass="text-[#5e5ce6]"
            title={tr("Skala Grid Widget", "Widget Grid Scale")}
            subtitle={tr(
              "Mengubah proporsi ukuran S (160), M (336x160), dan L (336x336) secara serentak",
              "Scales S (160), M (336x160), and L (336x336) widget sizes proportionally"
            )}
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
            title={tr("Kunci Posisi Widget", "Lock Widget Positions")}
            subtitle={tr(
              "Mencegah widget tergeser tidak sengaja saat mode edit",
              "Prevents accidental dragging while in edit mode"
            )}
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
            title={tr("Jeda Total Saat Layar Penuh / Game", "Auto-Pause in Fullscreen / Games")}
            subtitle={tr(
              "Menghentikan render ke 0 fps saat aplikasi fullscreen aktif atau layar mati",
              "Drops rendering to 0 fps whenever a fullscreen app runs or display is off"
            )}
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
            title={tr("Hemat Daya Otomatis", "Automatic Power Saver")}
            subtitle={tr(
              "Batasi animasi 30 fps dan alihkan mode Kaca ke Solid saat Penghemat Daya aktif",
              "Caps motion at 30 fps and switches Glass surfaces to Solid on Windows Battery Saver"
            )}
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
            {tr("Widget Aktif di Desktop", "Active Desktop Widgets")} ({config.slots.length})
          </span>
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="text-[11.5px] font-semibold text-[#0a84ff] hover:underline cursor-pointer"
          >
            + {tr("Tambah Widget", "Add Widget")}
          </button>
        </div>

        <div className={cardClass}>
          {config.slots.length === 0 ? (
            <div className={`px-3 py-4 text-[12px] ${mutedCls}`}>
              {tr(
                "Belum ada widget terpasang. Buka Galeri (34) untuk menambahkan widget pertama Anda.",
                "No widgets installed yet. Open Gallery (34) to add your first desktop widget."
              )}
            </div>
          ) : (
            config.slots.map((slot) => {
              const active = slot.widgets[slot.active_index] ?? slot.widgets[0];
              const rawMeta = catalog.find((c) => c.widget_type === active?.widget_type);
              const meta = rawMeta ? localizeCatalogEntry(rawMeta, isId) : undefined;
              const supported = meta?.supported_sizes ?? (["small", "medium", "large"] as WidgetSize[]);
              return (
                <div
                  key={slot.slot_id}
                  className={`flex flex-nowrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-[12px] ${isLightMode ? "hover:bg-black/[0.025]" : "hover:bg-white/[0.03]"
                    }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-[9px] bg-[#34c3a0]/15 text-[#34c3a0] flex items-center justify-center shrink-0">
                      <Layers size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate">
                        {meta?.name ?? active?.widget_type}
                        {slot.widgets.length > 1 && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[#0a84ff]/20 text-[#0a84ff]">
                            {tr("Tumpukan", "Stack")} {slot.widgets.length}
                          </span>
                        )}
                      </div>
                      <div className={`text-[11px] truncate ${mutedCls}`}>
                        {tr("Kolom", "Col")} {slot.grid_col + 1}, {tr("Baris", "Row")} {slot.grid_row + 1} .{" "}
                        {active?.style_override
                          ? tr("Penimpaan gaya aktif", "Style override active")
                          : tr("Ikut Tema Global", "Follows Global Theme")}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-nowrap items-center justify-end gap-1.5 shrink-0">
                    {active?.widget_type === "calendar_agenda" && (
                      <IosSelect
                        value={String(active.settings?.calendar_style ?? "bulan_minimal")}
                        options={calendarStyleOptions}
                        onChange={(v) => handleUpdateWidgetSetting(slot.slot_id, "calendar_style", v)}
                        isLightMode={isLightMode}
                        ariaLabel={tr("Tipe kalender", "Calendar style")}
                        minWidthClass="w-[126px]"
                      />
                    )}
                    {active?.widget_type === "styled_clock" && (
                      <IosSelect
                        value={String(active.settings?.clock_style ?? "minimal_digital")}
                        options={clockStyleOptions}
                        onChange={(v) => handleUpdateWidgetSetting(slot.slot_id, "clock_style", v)}
                        isLightMode={isLightMode}
                        ariaLabel={tr("Gaya jam", "Clock style")}
                        minWidthClass="w-[126px]"
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
                      className={`h-8 px-2.5 rounded-[10px] border text-[11.5px] font-medium flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer ${editingSlotId === slot.slot_id
                        ? "border-[#0a84ff] bg-[#0a84ff]/15 text-[#0a84ff]"
                        : isLightMode
                        ? "border-black/10 hover:bg-black/5"
                        : "border-white/10 hover:bg-white/10"
                        }`}
                    >
                      <Sliders size={12} /> {tr("Gaya", "Style")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSlot(slot.slot_id)}
                      aria-label={tr("Hapus widget", "Remove widget")}
                      className="w-8 h-8 rounded-[10px] hover:bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 cursor-pointer"
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
              {tr("Penimpaan Gaya Widget Terpilih", "Selected Widget Style Override")}
            </span>
            <button
              type="button"
              onClick={() => handleUpdateSlotStyle(editingSlot.slot_id, null)}
              className="text-[11.5px] text-zinc-400 hover:text-white cursor-pointer"
            >
              {tr("Reset ke Tema Global", "Reset to Global Theme")}
            </button>
          </div>
          <WidgetColorCustomizer
            title={tr("Kustomisasi Warna & Latar Widget Ini", "Customize This Widget Style")}
            style={editingWidget.style_override ?? config.global_theme}
            presets={config.presets}
            recentColors={config.recent_colors}
            isLightMode={isLightMode}
            isId={isId}
            onChange={(nextStyle, recordedHex) =>
              handleUpdateSlotStyle(editingSlot.slot_id, nextStyle, recordedHex)
            }
            onSavePreset={handleSavePreset}
            onRecordRecentColor={handleRecordRecentColor}
          />
        </div>
      )}

      {/* Section 3: Global Theme */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>
          {tr("Tema Global & Keterbacaan", "Global Theme & Legibility")}
        </span>
        <WidgetColorCustomizer
          title={tr("Tema Global Semua Widget", "Global Theme for All Widgets")}
          style={config.global_theme}
          presets={config.presets}
          recentColors={config.recent_colors}
          isLightMode={isLightMode}
          isId={isId}
          onChange={handleUpdateGlobalStyle}
          onSavePreset={handleSavePreset}
          onRecordRecentColor={handleRecordRecentColor}
        />
      </div>

      {/* Section 4: Providers */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>
          {tr("Penyedia Data & Privasi Lokal", "Data Providers & Local Privacy")}
        </span>
        <WidgetProvidersCard
          isLightMode={isLightMode}
          isId={isId}
          activeWidgetTypes={config.slots.flatMap((s) => s.widgets.map((w) => w.widget_type))}
          onFlash={flash}
          focusProviderId={focusProvider?.id ?? null}
          focusNonce={focusProvider?.nonce ?? 0}
        />
      </div>

      {/* Telemetry Footer */}
      {metrics?.paused_reason && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-[12px] bg-amber-500/10 border border-amber-500/30 text-[11.5px] text-amber-300">
          <Activity size={14} />
          <span>
            {tr("Host Direct2D sedang jeda otomatis:", "Direct2D host is auto-paused:")}{" "}
            {localizePausedReason(metrics.paused_reason, isId)}
          </span>
        </div>
      )}

      <WidgetGalleryModal
        open={galleryOpen}
        catalog={catalog}
        isLightMode={isLightMode}
        isId={isId}
        activeWidgetTypes={config.slots.flatMap((s) => s.widgets.map((w) => w.widget_type))}
        onClose={() => setGalleryOpen(false)}
        onAddWidget={handleAddWidget}
      />
    </div>
  );
};
