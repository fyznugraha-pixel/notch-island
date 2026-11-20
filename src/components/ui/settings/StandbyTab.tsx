import React, { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Clock,
  Eye,
  LayoutGrid,
  Monitor,
  Moon,
  MousePointerClick,
  Palette,
  Play,
  Shield,
  Sparkles,
  Square,
  Timer,
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { IosSwitch } from "../../ios/IosSwitch";
import { IosSegmentedControl } from "../../ios/IosSegmentedControl";
import { IosSelect } from "../../ios/IosSelect";
import { Language } from "../../../services/i18n";
import {
  DEFAULT_STANDBY_CONFIG,
  STANDBY_ACCENTS,
  StandbyActivationMode,
  StandbyClockStyle,
  StandbyConfig,
  StandbyLeftWidget,
  StandbyNightMode,
  StandbyRightWidget,
  StandbyScreen,
  getStandbyConfig,
  isStandbyOpen,
  saveStandbyConfig,
  subscribeStandbyConfig,
  toggleStandbyWindow,
} from "../../../services/standbyService";
import { MonitorInfo } from "./MonitorSelector";

interface StandbyTabProps {
  optLanguage: Language;
  isLightMode?: boolean;
}

const IDLE_MINUTES_OPTIONS = [1, 2, 3, 5, 10, 15, 30];

export const StandbyTab: React.FC<StandbyTabProps> = ({ optLanguage, isLightMode = false }) => {
  const isId = optLanguage === "id";
  const [config, setConfig] = useState<StandbyConfig>(DEFAULT_STANDBY_CONFIG);
  const [activeOpen, setActiveOpen] = useState(false);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);

  const loadMonitors = useCallback(async () => {
    try {
      const list = await invoke<MonitorInfo[]>("get_available_monitors");
      if (Array.isArray(list)) setMonitors(list);
    } catch {}
  }, []);

  useEffect(() => {
    getStandbyConfig().then(setConfig);
    isStandbyOpen().then(setActiveOpen);
    loadMonitors();

    const unsubCfg = subscribeStandbyConfig(setConfig);
    let unsubVis: (() => void) | null = null;
    let unsubMon: (() => void) | null = null;

    listen<boolean>("standby:visibility-changed", (ev) => {
      setActiveOpen(Boolean(ev.payload));
    })
      .then((fn) => {
        unsubVis = fn;
      })
      .catch(() => {});

    listen("monitors-changed", () => {
      loadMonitors();
    })
      .then((fn) => {
        unsubMon = fn;
      })
      .catch(() => {});

    return () => {
      unsubCfg();
      if (unsubVis) unsubVis();
      if (unsubMon) unsubMon();
    };
  }, [loadMonitors]);

  const updateConfig = useCallback(async (patch: Partial<StandbyConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveStandbyConfig(next);
      return next;
    });
  }, []);

  const secondaryMonitors = monitors.filter((m) => !m.is_primary);
  const selectableMonitors =
    config.activation_mode === "secondary_permanent" ? secondaryMonitors : monitors;

  const cardClass = `w-full rounded-[18px] p-3 flex flex-col gap-1 transition-colors ${
    isLightMode
      ? "bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
      : "bg-[#121318] border border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]"
  }`;

  const sectionLabelClass = `px-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${
    isLightMode ? "text-neutral-500" : "text-zinc-500"
  }`;

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Live Runtime Status + Preview Launch */}
      <div
        className={`w-full rounded-[18px] p-4 flex items-center justify-between gap-4 border ${
          isLightMode
            ? "bg-white border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
            : "bg-[#121318] border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 ${
              activeOpen
                ? "bg-[#30d158]/20 text-[#30d158]"
                : isLightMode
                ? "bg-[#ff9f0a]/15 text-[#d97706]"
                : "bg-[#2c2210] text-[#ff9f0a]"
            }`}
          >
            <Clock size={19} />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`text-[14px] font-semibold ${
                  isLightMode ? "text-neutral-900" : "text-white"
                }`}
              >
                {activeOpen
                  ? isId
                    ? "StandBy Sedang Aktif"
                    : "StandBy Is Active"
                  : isId
                  ? "WebView2 On-Demand Siaga"
                  : "On-Demand WebView2 Ready"}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                  activeOpen
                    ? "bg-[#30d158]/15 text-[#30d158]"
                    : isLightMode
                    ? "bg-black/[0.06] text-neutral-700"
                    : "bg-white/[0.08] text-zinc-300"
                }`}
              >
                {activeOpen
                  ? isId
                    ? "Hancur otomatis saat keluar"
                    : "Destroys on exit"
                  : isId
                  ? "0 MB tambahan"
                  : "0 MB idle footprint"}
              </span>
            </div>
            <p
              className={`text-[11.5px] mt-0.5 leading-snug ${
                isLightMode ? "text-neutral-600" : "text-zinc-400"
              }`}
            >
              {isId
                ? "Jendela StandBy dibuat saat dibutuhkan dan langsung dihancurkan penuh saat Anda kembali bekerja."
                : "StandBy window spawns only when active and destroys cleanly with memory trim upon exit."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => toggleStandbyWindow()}
          className={`shrink-0 px-4 py-2 rounded-[11px] text-[12.5px] font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
            activeOpen
              ? "bg-[#ff453a] hover:bg-[#e0382e] text-white"
              : "bg-[#0a84ff] hover:bg-[#0071e3] text-white"
          }`}
        >
          {activeOpen ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
          <span>
            {activeOpen
              ? isId
                ? "Tutup StandBy"
                : "Close StandBy"
              : isId
              ? "Buka StandBy"
              : "Open StandBy"}
          </span>
        </button>
      </div>

      {/* 1. Activation Mode & Monitor */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>
          {isId ? "Pemicu & Layar Target" : "Trigger & Target Display"}
        </span>
        <div className={cardClass}>
          <SettingRow
            isLightMode={isLightMode}
            icon={<Timer size={18} />}
            iconBgClass={isLightMode ? "bg-[#0a84ff]/12" : "bg-[#122238]"}
            iconColorClass="text-[#0a84ff]"
            title={isId ? "Mode Aktivasi" : "Activation Mode"}
            subtitle={
              config.activation_mode === "auto_idle"
                ? isId
                  ? "Otomatis muncul saat PC idle, hancur seketika saat mouse bergerak"
                  : "Opens when PC is idle and destroys as soon as input resumes"
                : config.activation_mode === "secondary_permanent"
                ? isId
                  ? "Tetap menyala di monitor ke-2 sebagai jam meja selama monitor tersambung"
                  : "Runs persistently on secondary display while attached"
                : isId
                ? "Hanya buka lewat pintasan (Ctrl+Alt+S) atau menu tray"
                : "Manual trigger only via hotkey (Ctrl+Alt+S) or tray menu"
            }
            control={
              <IosSegmentedControl
                value={config.activation_mode}
                onChange={(val) => updateConfig({ activation_mode: val as StandbyActivationMode })}
                options={[
                  { value: "off", label: isId ? "Manual" : "Manual" },
                  { value: "auto_idle", label: isId ? "Auto Idle" : "Auto Idle" },
                  { value: "secondary_permanent", label: isId ? "Monitor Ke-2" : "2nd Display" },
                ]}
              />
            }
          />

          {config.activation_mode === "auto_idle" && (
            <>
              <SettingRow
                isLightMode={isLightMode}
                icon={<Clock size={18} />}
                iconBgClass={isLightMode ? "bg-[#ff9f0a]/15" : "bg-[#2c2210]"}
                iconColorClass="text-[#ff9f0a]"
                title={isId ? "Waktu Tunggu Idle" : "Idle Timeout"}
                subtitle={
                  isId
                    ? "Muncul otomatis setelah tidak ada input mouse atau keyboard"
                    : "Wait duration with no mouse or keyboard activity before launch"
                }
                control={
                  <IosSelect
                    ariaLabel={isId ? "Waktu Tunggu Idle" : "Idle Timeout"}
                    isLightMode={isLightMode}
                    value={config.idle_minutes}
                    onChange={(mins) => updateConfig({ idle_minutes: mins })}
                    minWidthClass="min-w-[130px]"
                    options={IDLE_MINUTES_OPTIONS.map((mins) => ({
                      value: mins,
                      label: `${mins} ${isId ? "menit" : mins === 1 ? "minute" : "minutes"}`,
                    }))}
                  />
                }
              />

              <SettingRow
                isLightMode={isLightMode}
                icon={<MousePointerClick size={18} />}
                iconBgClass={isLightMode ? "bg-[#30d158]/14" : "bg-[#122b1b]"}
                iconColorClass="text-[#30d158]"
                title={isId ? "Tutup Saat Mouse Bergerak" : "Dismiss on Mouse Move"}
                subtitle={
                  isId
                    ? "Langsung hancurkan WebView2 StandBy dan kosongkan RAM ketika mouse disentuh"
                    : "Immediately destroy StandBy WebView2 and reclaim memory on movement or keypress"
                }
                control={
                  <IosSwitch
                    checked={config.exit_on_mouse_move}
                    onChange={() => updateConfig({ exit_on_mouse_move: !config.exit_on_mouse_move })}
                    activeColor="blue"
                  />
                }
              />

              <SettingRow
                isLightMode={isLightMode}
                icon={<Shield size={18} />}
                iconBgClass={isLightMode ? "bg-[#5e5ce6]/14" : "bg-[#1e1d36]"}
                iconColorClass="text-[#5e5ce6]"
                title={isId ? "Jeda Saat Aplikasi Fullscreen" : "Pause During Fullscreen"}
                subtitle={
                  isId
                    ? "Tidak muncul menimpa game DirectX atau pemutar video fullscreen"
                    : "Skip auto-idle launch while running exclusive fullscreen apps or games"
                }
                control={
                  <IosSwitch
                    checked={config.pause_during_fullscreen}
                    onChange={() =>
                      updateConfig({ pause_during_fullscreen: !config.pause_during_fullscreen })
                    }
                    activeColor="blue"
                  />
                }
              />
            </>
          )}

          {config.activation_mode === "secondary_permanent" && (
            <>
              <SettingRow
                isLightMode={isLightMode}
                icon={<Eye size={18} />}
                iconBgClass={isLightMode ? "bg-[#5e5ce6]/14" : "bg-[#1e1d36]"}
                iconColorClass="text-[#5e5ce6]"
                title={isId ? "Selalu di Atas (Monitor Ke-2)" : "Always on Top (2nd Display)"}
                subtitle={
                  isId
                    ? "Matikan jika ingin tetap bisa menaruh jendela aplikasi di atas monitor ke-2"
                    : "Turn off to allow placing application windows over StandBy on your second monitor"
                }
                control={
                  <IosSwitch
                    checked={config.always_on_top}
                    onChange={() => updateConfig({ always_on_top: !config.always_on_top })}
                    activeColor="blue"
                  />
                }
              />
              {secondaryMonitors.length === 0 && (
                <div
                  className={`mx-2 my-1 px-3 py-2.5 rounded-[12px] text-[11.5px] border ${
                    isLightMode
                      ? "bg-[#ff9f0a]/10 border-[#ff9f0a]/30 text-amber-900"
                      : "bg-[#ff9f0a]/10 border-[#ff9f0a]/25 text-amber-200"
                  }`}
                >
                  {isId
                    ? "Baru 1 monitor terdeteksi saat ini. StandBy akan menyala otomatis begitu monitor kedua tersambung."
                    : "Only 1 monitor is connected right now. StandBy will launch automatically when a second monitor is plugged in."}
                </div>
              )}
            </>
          )}

          <SettingRow
            isLightMode={isLightMode}
            icon={<Monitor size={18} />}
            iconBgClass={isLightMode ? "bg-[#32ade6]/15" : "bg-[#132631]"}
            iconColorClass="text-[#32ade6]"
            title={isId ? "Monitor Target" : "Target Display"}
            subtitle={
              config.activation_mode === "secondary_permanent"
                ? isId
                  ? "Pilih monitor sekunder untuk tampilan meja permanen"
                  : "Choose which secondary display hosts permanent StandBy"
                : isId
                ? "Monitor yang menampilkan jendela StandBy layar penuh"
                : "Monitor where fullscreen StandBy opens"
            }
            control={
              <IosSelect
                ariaLabel={isId ? "Monitor Target" : "Target Display"}
                isLightMode={isLightMode}
                value={config.target_monitor_id ?? "auto"}
                onChange={(val) =>
                  updateConfig({
                    target_monitor_id: val === "auto" ? null : val,
                  })
                }
                minWidthClass="min-w-[190px]"
                options={[
                  {
                    value: "auto",
                    label:
                      config.activation_mode === "secondary_permanent"
                        ? isId
                          ? "Otomatis (Monitor Sekunder)"
                          : "Auto (First Secondary)"
                        : isId
                        ? "Otomatis (Monitor Utama)"
                        : "Auto (Primary Display)",
                  },
                  ...selectableMonitors.map((m) => ({
                    value: m.id,
                    label: m.name,
                    sublabel: `${m.width}x${m.height}`,
                  })),
                ]}
              />
            }
          />
        </div>
      </div>

      {/* 2. Screen & Widget Composition */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>
          {isId ? "Layar & Widget StandBy" : "Screens & Live Widgets"}
        </span>
        <div className={cardClass}>
          <SettingRow
            isLightMode={isLightMode}
            icon={<LayoutGrid size={18} />}
            iconBgClass={isLightMode ? "bg-[#0a84ff]/12" : "bg-[#122238]"}
            iconColorClass="text-[#0a84ff]"
            title={isId ? "Layar Bawaan" : "Default Screen"}
            subtitle={
              isId
                ? "Anda tetap bisa berpindah antar 4 layar langsung dari dalam StandBy"
                : "You can also switch across all 4 screens inside StandBy anytime"
            }
            control={
              <IosSegmentedControl
                value={config.active_screen}
                onChange={(val) => updateConfig({ active_screen: val as StandbyScreen })}
                options={[
                  { value: "widgets", label: isId ? "Widget" : "Widgets" },
                  { value: "clock", label: isId ? "Jam" : "Clock" },
                  { value: "media", label: "Media" },
                  { value: "weather", label: isId ? "Cuaca" : "Weather" },
                ]}
              />
            }
          />

          <SettingRow
            isLightMode={isLightMode}
            icon={<Clock size={18} />}
            iconBgClass={isLightMode ? "bg-[#ff9f0a]/15" : "bg-[#2c2210]"}
            iconColorClass="text-[#ff9f0a]"
            title={isId ? "Widget Sisi Kiri" : "Left Widget Slot"}
            subtitle={isId ? "Ditampilkan pada mode Widget Ganda" : "Shown on Dual Widgets screen"}
            control={
              <IosSelect
                ariaLabel={isId ? "Widget Sisi Kiri" : "Left Widget Slot"}
                isLightMode={isLightMode}
                value={config.left_widget}
                onChange={(val) => updateConfig({ left_widget: val as StandbyLeftWidget })}
                minWidthClass="min-w-[172px]"
                options={[
                  { value: "clock_analog", label: isId ? "Jam Analog" : "Analog Clock" },
                  { value: "clock_digital", label: isId ? "Jam Digital" : "Digital Clock" },
                  { value: "pomodoro", label: "Pomodoro Timer" },
                  { value: "todo", label: isId ? "Daftar Tugas" : "To-Do List" },
                ]}
              />
            }
          />

          <SettingRow
            isLightMode={isLightMode}
            icon={<Sparkles size={18} />}
            iconBgClass={isLightMode ? "bg-[#30d158]/14" : "bg-[#122b1b]"}
            iconColorClass="text-[#30d158]"
            title={isId ? "Widget Sisi Kanan" : "Right Widget Slot"}
            subtitle={isId ? "Data real-time dari modul Gili Anda" : "Live data from your Gili modules"}
            control={
              <IosSelect
                ariaLabel={isId ? "Widget Sisi Kanan" : "Right Widget Slot"}
                isLightMode={isLightMode}
                value={config.right_widget}
                onChange={(val) => updateConfig({ right_widget: val as StandbyRightWidget })}
                minWidthClass="min-w-[172px]"
                options={[
                  { value: "weather_prayer", label: isId ? "Cuaca & Jadwal Sholat" : "Weather & Prayer" },
                  { value: "media", label: isId ? "Pemutar Musik" : "Now Playing" },
                  { value: "calendar", label: isId ? "Kalender & Tugas" : "Calendar & Tasks" },
                  { value: "hydration", label: isId ? "Target Minum Air" : "Hydration Target" },
                  { value: "system", label: isId ? "Monitor CPU & RAM" : "CPU & Memory" },
                ]}
              />
            }
          />
        </div>
      </div>

      {/* 3. Clock Face, Color, Night Mode & OLED Care */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>
          {isId ? "Gaya Jam & Mode Malam" : "Clock Face & Night Shift"}
        </span>
        <div className={cardClass}>
          <SettingRow
            isLightMode={isLightMode}
            icon={<Palette size={18} />}
            iconBgClass={isLightMode ? "bg-[#af52de]/14" : "bg-[#26182e]"}
            iconColorClass="text-[#af52de]"
            title={isId ? "Gaya Tampilan Jam" : "Clock Typography"}
            subtitle={isId ? "Untuk layar penuh Jam Meja" : "Used on fullscreen Clock screen"}
            control={
              <IosSelect
                ariaLabel={isId ? "Gaya Tampilan Jam" : "Clock Typography"}
                isLightMode={isLightMode}
                value={config.clock_style}
                onChange={(val) => updateConfig({ clock_style: val as StandbyClockStyle })}
                minWidthClass="min-w-[172px]"
                options={[
                  { value: "bold_duo", label: "Bold Duo" },
                  { value: "editorial_serif", label: "Editorial Serif" },
                  { value: "minimal_mono", label: "Minimal Mono" },
                  { value: "analog_rail", label: isId ? "Analog Presisi" : "Precision Analog" },
                ]}
              />
            }
          />

          <SettingRow
            isLightMode={isLightMode}
            icon={<Palette size={18} />}
            iconBgClass={isLightMode ? "bg-[#ff9f0a]/15" : "bg-[#2c2210]"}
            iconColorClass="text-[#ff9f0a]"
            title={isId ? "Aksen Warna" : "Clock Accent"}
            subtitle={isId ? "Otomatis beralih ke merah saat Mode Malam aktif" : "Shifts to red automatically when Night Mode activates"}
            control={
              <div className="flex items-center gap-1.5">
                {STANDBY_ACCENTS.map((item) => {
                  const selected = config.clock_accent.toLowerCase() === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={isId ? item.labelId : item.labelEn}
                      onClick={() => updateConfig({ clock_accent: item.id })}
                      className={`w-6 h-6 rounded-full cursor-pointer transition-transform border ${
                        selected
                          ? `scale-110 ring-2 ring-[#0a84ff] ring-offset-2 ${
                              isLightMode ? "ring-offset-white" : "ring-offset-[#121318]"
                            } border-white`
                          : "border-white/25 hover:scale-105"
                      }`}
                      style={{ backgroundColor: item.id }}
                    />
                  );
                })}
              </div>
            }
          />

          <SettingRow
            isLightMode={isLightMode}
            icon={<Clock size={18} />}
            iconBgClass={isLightMode ? "bg-[#636366]/14" : "bg-[#242429]"}
            iconColorClass={isLightMode ? "text-neutral-700" : "text-zinc-200"}
            title={isId ? "Format 24 Jam" : "24-Hour Clock"}
            subtitle={isId ? "Nonaktifkan untuk format AM/PM" : "Disable for 12-hour AM/PM"}
            control={
              <IosSwitch
                checked={config.use_24h}
                onChange={() => updateConfig({ use_24h: !config.use_24h })}
                activeColor="blue"
              />
            }
          />

          <SettingRow
            isLightMode={isLightMode}
            icon={<Timer size={18} />}
            iconBgClass={isLightMode ? "bg-[#636366]/14" : "bg-[#242429]"}
            iconColorClass={isLightMode ? "text-neutral-700" : "text-zinc-200"}
            title={isId ? "Tampilkan Detik" : "Show Seconds"}
            subtitle={isId ? "Tampilkan jarum atau digit detik waktu nyata" : "Display live sweeping hand or seconds"}
            control={
              <IosSwitch
                checked={config.show_seconds}
                onChange={() => updateConfig({ show_seconds: !config.show_seconds })}
                activeColor="blue"
              />
            }
          />

          <SettingRow
            isLightMode={isLightMode}
            icon={<Moon size={18} />}
            iconBgClass={isLightMode ? "bg-[#ff453a]/14" : "bg-[#2e1615]"}
            iconColorClass="text-[#ff453a]"
            title={isId ? "Mode Malam Red-Shift" : "Night Mode Red-Shift"}
            subtitle={
              isId
                ? "Tampilan merah rendah silau agar nyaman di ruangan gelap (Auto: 21:00 - 06:00)"
                : "Warm low-glare crimson tint for dark rooms (Auto: 21:00 - 06:00)"
            }
            control={
              <IosSegmentedControl
                value={config.night_mode}
                onChange={(val) => updateConfig({ night_mode: val as StandbyNightMode })}
                options={[
                  { value: "off", label: isId ? "Mati" : "Off" },
                  { value: "auto", label: "Auto" },
                  { value: "always", label: isId ? "Selalu" : "Always" },
                ]}
              />
            }
          />

          <SettingRow
            isLightMode={isLightMode}
            icon={<Shield size={18} />}
            iconBgClass={isLightMode ? "bg-[#30d158]/14" : "bg-[#122b1b]"}
            iconColorClass="text-[#30d158]"
            title={isId ? "Proteksi Burn-In OLED" : "OLED Burn-In Shift"}
            subtitle={
              isId
                ? "Menggeser posisi elemen 2px secara halus setiap 60 detik"
                : "Subtle 2px pixel shift every 60 seconds when visible long-term"
            }
            control={
              <IosSwitch
                checked={config.burn_in_protection}
                onChange={() =>
                  updateConfig({ burn_in_protection: !config.burn_in_protection })
                }
                activeColor="blue"
              />
            }
          />
        </div>
      </div>
    </div>
  );
};
