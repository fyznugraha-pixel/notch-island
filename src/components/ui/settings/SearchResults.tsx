import React from "react";
import {
  Globe,
  Zap,
  Smile,
  AppWindow,
  Clock,
  Volume2,
  Moon,
  Type,
  Scaling,
  Layout,
  Layers,
  ClipboardList,
  Music,
  Timer,
  RefreshCw,
  Trash2,
  Send,
  RotateCcw,
  AlertTriangle,
  LayoutTemplate,
  Search,
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { IosSwitch } from "../../ios/IosSwitch";
import { IosSegmentedControl } from "../../ios/IosSegmentedControl";
import { NotifSoundPicker } from "./NotifSoundPicker";
import { t, Language } from "../../../services/i18n";
import { SettingsSubtab } from "./SettingsSubnav";
import { UpdateInfo, UpdateStatus } from "../../../services/updateService";
import {
  loadPomodoroSettings,
  savePomodoroSettings,
} from "../../../services/pomodoroService";

export interface SearchResultsProps {
  searchQuery: string;
  onNavigateTab: (tab: SettingsSubtab) => void;
  // General props
  optLanguage: Language;
  onChangeLanguage: (lang: Language) => void;
  isAutostart: boolean;
  onToggleAutostart: () => void;
  showGreeting: boolean;
  onToggleGreeting: () => void;
  optAutoCompact: boolean;
  onToggleAutoCompact: () => void;
  optNotifTime: number;
  onChangeNotifTime: (sec: number) => void;
  optNotifSound: string;
  onChangeNotifSound: (soundId: string) => void;
  optCloseDelay?: number;
  onChangeCloseDelay?: (sec: number) => void;
  // Appearance props
  optTheme: "dark" | "light" | "auto";
  onChangeTheme: (theme: "dark" | "light" | "auto") => void;
  optFontSize: "small" | "default" | "large";
  onChangeFontSize: (size: "small" | "default" | "large") => void;
  optIdleSize: "compact" | "default" | "large";
  onChangeIdleSize: (size: "compact" | "default" | "large") => void;
  optTabSize: "compact" | "default" | "large";
  onChangeTabSize: (size: "compact" | "default" | "large") => void;
  optEars: boolean;
  onToggleEars: () => void;
  optOpacity: number;
  onChangeOpacity: (opacity: number) => void;
  // Modules props
  optVolume: boolean;
  onToggleVolume: () => void;
  optClipboard: boolean;
  onToggleClipboard: () => void;
  optMedia: boolean;
  onToggleMedia: () => void;
  optSoundFx?: boolean;
  onToggleSoundFx?: () => void;
  // Advanced props
  currentAppVersion: string;
  updateStatus: UpdateStatus;
  updateInfo: UpdateInfo | null;
  downloadProgress: number;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  clearTempStatus: "idle" | "cleaning" | "done" | "error";
  clearedResult: {
    freed_bytes: number;
    deleted_count: number;
    freed_formatted: string;
  } | null;
  onClearTempFiles: () => void;
  onTestNotification?: () => void;
  onClose: () => void;
}

interface SearchableItem {
  id: string;
  tab: SettingsSubtab;
  tabLabel: string;
  title: string;
  subtitle?: string;
  keywords: string[];
  icon: React.ReactNode;
  iconBgClass: string;
  iconColorClass: string;
  control: React.ReactNode;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  searchQuery,
  onNavigateTab,
  optLanguage,
  onChangeLanguage,
  isAutostart,
  onToggleAutostart,
  showGreeting,
  onToggleGreeting,
  optAutoCompact,
  onToggleAutoCompact,
  optNotifTime,
  onChangeNotifTime,
  optNotifSound,
  onChangeNotifSound,
  optCloseDelay,
  onChangeCloseDelay,
  optTheme,
  onChangeTheme,
  optFontSize,
  onChangeFontSize,
  optIdleSize,
  onChangeIdleSize,
  optTabSize,
  onChangeTabSize,
  optEars,
  onToggleEars,
  optOpacity,
  onChangeOpacity,
  optVolume,
  onToggleVolume,
  optClipboard,
  onToggleClipboard,
  optMedia,
  onToggleMedia,
  optSoundFx = true,
  onToggleSoundFx,
  currentAppVersion,
  updateStatus,
  updateInfo,
  downloadProgress,
  onCheckUpdate,
  onInstallUpdate,
  clearTempStatus,
  clearedResult,
  onClearTempFiles,
  onTestNotification,
  onClose,
}) => {
  const [pomodoroIdle, setPomodoroIdle] = React.useState<boolean>(() => {
    return loadPomodoroSettings().showIdleTimer;
  });

  const handleTogglePomodoroIdle = () => {
    const next = !pomodoroIdle;
    setPomodoroIdle(next);
    const curr = loadPomodoroSettings();
    savePomodoroSettings({ ...curr, showIdleTimer: next });
    window.dispatchEvent(new CustomEvent("gili_pomodoro_settings_updated"));
  };

  const [showResetConfirm, setShowResetConfirm] = React.useState(false);

  const handleRestartOnboarding = () => {
    window.dispatchEvent(new CustomEvent("island_trigger_onboarding"));
    onClose();
  };

  const handleResetAllSettings = () => {
    if (!showResetConfirm) {
      setShowResetConfirm(true);
      return;
    }
    try {
      localStorage.removeItem("island_onboarding_completed");
      localStorage.removeItem("island_theme");
      localStorage.removeItem("island_idle_layout");
      localStorage.removeItem("island_font_size");
      localStorage.removeItem("island_tab_size");
      localStorage.removeItem("island_ears");
      localStorage.removeItem("island_transparency");
      localStorage.removeItem("island_auto_compact");
      localStorage.removeItem("island_show_greeting");
      localStorage.removeItem("island_close_delay");
    } catch {}
    window.location.reload();
  };

  const updateSubtitle =
    updateStatus === "checking"
      ? t("settings_checking_update")
      : updateStatus === "available"
      ? `${t("settings_update_available")}: v${updateInfo?.version}`
      : updateStatus === "downloading"
      ? `${t("settings_update_downloading")} ${downloadProgress}%`
      : updateStatus === "installing"
      ? t("settings_update_installing")
      : updateStatus === "error"
      ? t("settings_update_error")
      : t("settings_adv_updates_desc", { version: currentAppVersion });

  const clearTempSubtitle =
    clearTempStatus === "cleaning"
      ? t("settings_clearing_temp")
      : clearTempStatus === "done" && clearedResult
      ? t("settings_clear_temp_done", {
          size: clearedResult.freed_formatted,
          count: clearedResult.deleted_count,
        })
      : clearTempStatus === "error"
      ? t("settings_clear_temp_error")
      : t("settings_adv_clear_temp_desc");

  // Registry of all searchable settings
  const items: SearchableItem[] = [
    // 1. General
    {
      id: "language",
      tab: "general",
      tabLabel: t("settings_subtab_general"),
      title: t("settings_language"),
      subtitle: t("settings_language_desc"),
      keywords: ["language", "bahasa", "indonesia", "english", "id", "en", "interface"],
      icon: <Globe size={18} />,
      iconBgClass: "bg-[#132c1e]",
      iconColorClass: "text-[#34c759]",
      control: (
        <IosSegmentedControl
          value={optLanguage}
          onChange={(val) => onChangeLanguage(val as Language)}
          options={[
            { value: "id", label: "Indonesia" },
            { value: "en", label: "English" },
          ]}
        />
      ),
    },
    {
      id: "autostart",
      tab: "general",
      tabLabel: t("settings_subtab_general"),
      title: t("settings_autostart"),
      subtitle: t("settings_autostart_desc"),
      keywords: ["autostart", "startup", "windows", "boot", "mulai", "otomatis", "launch"],
      icon: <Zap size={18} />,
      iconBgClass: "bg-[#2c2415]",
      iconColorClass: "text-[#ff9f0a]",
      control: (
        <IosSwitch
          checked={isAutostart}
          onChange={onToggleAutostart}
          activeColor="blue"
        />
      ),
    },
    {
      id: "greeting",
      tab: "general",
      tabLabel: t("settings_subtab_general"),
      title: t("settings_greeting"),
      subtitle: t("settings_greeting_desc"),
      keywords: ["greeting", "sapaan", "welcome", "selamat", "datang", "halo", "hello"],
      icon: <Smile size={18} />,
      iconBgClass: "bg-[#2c1626]",
      iconColorClass: "text-[#bf5af2]",
      control: (
        <IosSwitch
          checked={showGreeting}
          onChange={onToggleGreeting}
          activeColor="blue"
        />
      ),
    },
    {
      id: "auto_compact",
      tab: "general",
      tabLabel: t("settings_subtab_general"),
      title: t("settings_auto_compact"),
      subtitle: t("settings_auto_compact_desc"),
      keywords: ["compact", "ringkas", "browser", "peramban", "shrink", "otomatis", "mini"],
      icon: <AppWindow size={18} />,
      iconBgClass: "bg-[#142333]",
      iconColorClass: "text-[#0a84ff]",
      control: (
        <IosSwitch
          checked={optAutoCompact}
          onChange={onToggleAutoCompact}
          activeColor="blue"
        />
      ),
    },
    {
      id: "notif_time",
      tab: "general",
      tabLabel: t("settings_subtab_general"),
      title: t("settings_notif_duration"),
      subtitle: t("settings_notif_duration_desc"),
      keywords: ["duration", "durasi", "waktu", "notifikasi", "time", "seconds", "detik"],
      icon: <Clock size={18} />,
      iconBgClass: "bg-[#2d1815]",
      iconColorClass: "text-[#ff453a]",
      control: (
        <IosSegmentedControl
          value={optNotifTime}
          onChange={onChangeNotifTime}
          options={[
            { value: 3, label: optLanguage === "id" ? "3 dtk" : "3s" },
            { value: 5, label: optLanguage === "id" ? "5 dtk" : "5s" },
            { value: 7, label: optLanguage === "id" ? "7 dtk" : "7s" },
          ]}
        />
      ),
    },
    {
      id: "close_delay",
      tab: "general",
      tabLabel: t("settings_subtab_general"),
      title: t("settings_close_delay"),
      subtitle: t("settings_close_delay_desc"),
      keywords: ["close", "delay", "tutup", "durasi", "auto close", "notch close", "timeout", "timer", "panel"],
      icon: <Timer size={18} />,
      iconBgClass: "bg-[#1e1c33]",
      iconColorClass: "text-[#7c7cff]",
      control: optCloseDelay !== undefined && onChangeCloseDelay ? (
        <IosSegmentedControl
          value={optCloseDelay}
          onChange={(val) => onChangeCloseDelay(val as number)}
          options={[
            { value: 0, label: optLanguage === "id" ? "Instan" : "Instant", tooltip: t("settings_close_delay_tip_0") },
            { value: 1, label: optLanguage === "id" ? "1 dtk" : "1s", tooltip: t("settings_close_delay_tip_1") },
            { value: 3, label: optLanguage === "id" ? "3 dtk" : "3s", tooltip: t("settings_close_delay_tip_3") },
            { value: -1, label: optLanguage === "id" ? "Manual" : "Manual", tooltip: t("settings_close_delay_tip_never") },
          ]}
        />
      ) : null,
    },
    {
      id: "notif_sound",
      tab: "general",
      tabLabel: t("settings_subtab_general"),
      title: t("settings_notif_sound"),
      subtitle: t("settings_notif_sound_desc"),
      keywords: ["sound", "suara", "audio", "nada", "notifikasi", "ringtone", "alert"],
      icon: <Volume2 size={18} />,
      iconBgClass: "bg-[#201830]",
      iconColorClass: "text-[#a855f7]",
      control: (
        <NotifSoundPicker
          value={optNotifSound}
          onChange={onChangeNotifSound}
        />
      ),
    },

    // 2. Appearance
    {
      id: "theme",
      tab: "appearance",
      tabLabel: t("settings_subtab_appearance"),
      title: t("settings_mode"),
      keywords: ["theme", "tema", "dark", "light", "auto", "gelap", "terang", "mode", "color"],
      icon: <Moon size={18} />,
      iconBgClass: "bg-[#161c33]",
      iconColorClass: "text-[#5e5ce6]",
      control: (
        <IosSegmentedControl
          value={optTheme}
          onChange={(val) => onChangeTheme(val as "dark" | "light" | "auto")}
          options={[
            { value: "dark", label: t("settings_mode_dark") },
            { value: "light", label: t("settings_mode_light") },
            { value: "auto", label: t("settings_mode_auto") },
          ]}
        />
      ),
    },
    {
      id: "font_size",
      tab: "appearance",
      tabLabel: t("settings_subtab_appearance"),
      title: t("settings_font_size"),
      keywords: ["font", "text", "size", "teks", "ukuran", "huruf", "scale", "skala"],
      icon: <Type size={18} />,
      iconBgClass: "bg-[#2c1626]",
      iconColorClass: "text-[#bf5af2]",
      control: (
        <IosSegmentedControl
          value={optFontSize}
          onChange={(val) => onChangeFontSize(val as "small" | "default" | "large")}
          options={[
            { value: "small", label: t("settings_font_small") },
            { value: "default", label: t("settings_font_default") },
            { value: "large", label: t("settings_font_large") },
          ]}
        />
      ),
    },
    {
      id: "idle_size",
      tab: "appearance",
      tabLabel: t("settings_subtab_appearance"),
      title: t("settings_idle_size"),
      keywords: ["idle", "size", "ukuran", "notch", "compact", "normal", "large", "besar", "kecil"],
      icon: <Scaling size={18} />,
      iconBgClass: "bg-[#14261d]",
      iconColorClass: "text-[#30d158]",
      control: (
        <IosSegmentedControl
          value={optIdleSize}
          onChange={(val) => onChangeIdleSize(val as "compact" | "default" | "large")}
          options={[
            { value: "compact", label: t("settings_idle_compact"), tooltip: t("settings_idle_tip_compact") },
            { value: "default", label: t("settings_idle_default"), tooltip: t("settings_idle_tip_default") },
            { value: "large", label: t("settings_idle_large"), tooltip: t("settings_idle_tip_large") },
          ]}
        />
      ),
    },
    {
      id: "tab_size",
      tab: "appearance",
      tabLabel: t("settings_subtab_appearance"),
      title: t("settings_tab_size"),
      keywords: ["tab", "panel", "size", "ukuran", "wide", "lebar", "compact", "ringkas"],
      icon: <Layout size={18} />,
      iconBgClass: "bg-[#13262d]",
      iconColorClass: "text-[#64d2ff]",
      control: (
        <IosSegmentedControl
          value={optTabSize}
          onChange={(val) => onChangeTabSize(val as "compact" | "default" | "large")}
          options={[
            { value: "compact", label: t("settings_tab_compact") },
            { value: "default", label: t("settings_tab_default") },
            { value: "large", label: t("settings_tab_large") },
          ]}
        />
      ),
    },
    {
      id: "ears",
      tab: "appearance",
      tabLabel: t("settings_subtab_appearance"),
      title: t("settings_ears"),
      subtitle: t("settings_ears_desc"),
      keywords: ["ears", "telinga", "curve", "sudut", "lengkungan", "concave", "gili"],
      icon: <Smile size={18} />,
      iconBgClass: "bg-[#26182e]",
      iconColorClass: "text-[#af52de]",
      control: (
        <IosSwitch
          checked={optEars}
          onChange={onToggleEars}
          activeColor="blue"
        />
      ),
    },
    {
      id: "transparency",
      tab: "appearance",
      tabLabel: t("settings_subtab_appearance"),
      title: t("settings_transparency"),
      keywords: ["transparency", "transparansi", "solid", "glass", "clear", "kaca", "opacity"],
      icon: <Layers size={18} />,
      iconBgClass: "bg-[#142d1f]",
      iconColorClass: "text-[#30d158]",
      control: (
        <IosSegmentedControl
          value={optOpacity >= 0.9 ? 1.0 : optOpacity >= 0.7 ? 0.8 : 0.5}
          onChange={onChangeOpacity}
          options={[
            { value: 1.0, label: t("settings_theme_solid") },
            { value: 0.8, label: t("settings_theme_glass") },
            { value: 0.5, label: t("settings_theme_clear") },
          ]}
        />
      ),
    },

    // 3. Idle Tab
    {
      id: "idle_slots",
      tab: "idle",
      tabLabel: t("settings_subtab_idle"),
      title: t("settings_idle_slot"),
      subtitle: t("settings_idle_slot_desc"),
      keywords: ["idle", "slots", "battery", "clock", "weather", "fps", "ping", "todo", "baterai", "jam", "cuaca", "posisi"],
      icon: <LayoutTemplate size={18} />,
      iconBgClass: "bg-[#161c33]",
      iconColorClass: "text-[#5e5ce6]",
      control: (
        <button
          type="button"
          onClick={() => onNavigateTab("idle")}
          className="px-3 py-1.5 rounded-[9px] bg-white/[0.08] hover:bg-white/[0.14] text-white text-[11px] font-semibold transition-colors"
        >
          {t("settings_idle_customize_btn")}
        </button>
      ),
    },

    // 4. Modules
    {
      id: "volume_monitor",
      tab: "modules",
      tabLabel: t("settings_subtab_modules"),
      title: t("settings_volume_monitor"),
      subtitle: t("settings_volume_monitor_desc"),
      keywords: ["volume", "mixer", "audio", "suara", "speaker", "output"],
      icon: <Volume2 size={18} />,
      iconBgClass: "bg-[#142333]",
      iconColorClass: "text-[#0a84ff]",
      control: (
        <IosSwitch
          checked={optVolume}
          onChange={onToggleVolume}
          activeColor="blue"
        />
      ),
    },
    {
      id: "clipboard_monitor",
      tab: "modules",
      tabLabel: t("settings_subtab_modules"),
      title: t("settings_clipboard_monitor"),
      subtitle: t("settings_clipboard_monitor_desc"),
      keywords: ["clipboard", "papan klip", "copy", "paste", "riwayat", "history", "klip"],
      icon: <ClipboardList size={18} />,
      iconBgClass: "bg-[#132c1e]",
      iconColorClass: "text-[#34c759]",
      control: (
        <IosSwitch
          checked={optClipboard}
          onChange={onToggleClipboard}
          activeColor="blue"
        />
      ),
    },
    {
      id: "media_player",
      tab: "modules",
      tabLabel: t("settings_subtab_modules"),
      title: t("settings_media_player"),
      subtitle: t("settings_media_player_desc"),
      keywords: ["media", "music", "pemutar", "lagu", "spotify", "lyrics", "lirik", "player"],
      icon: <Music size={18} />,
      iconBgClass: "bg-[#2d1815]",
      iconColorClass: "text-[#ff453a]",
      control: (
        <IosSwitch
          checked={optMedia}
          onChange={onToggleMedia}
          activeColor="blue"
        />
      ),
    },
    {
      id: "sound_fx",
      tab: "modules",
      tabLabel: t("settings_subtab_modules"),
      title: t("settings_sound_effects"),
      subtitle: t("settings_sound_effects_desc"),
      keywords: ["sound", "effects", "efek", "suara", "fx", "audio", "click"],
      icon: <Volume2 size={18} />,
      iconBgClass: "bg-[#241c30]",
      iconColorClass: "text-[#bf5af2]",
      control: (
        <IosSwitch
          checked={optSoundFx}
          onChange={() => onToggleSoundFx?.()}
          activeColor="blue"
        />
      ),
    },
    {
      id: "pomodoro_timer",
      tab: "modules",
      tabLabel: t("settings_subtab_modules"),
      title: t("settings_module_pomodoro"),
      subtitle: t("settings_module_pomodoro_desc"),
      keywords: ["pomodoro", "timer", "fokus", "focus", "waktu", "idle"],
      icon: <Timer size={18} />,
      iconBgClass: "bg-[#2d1d13]",
      iconColorClass: "text-[#ff9f0a]",
      control: (
        <IosSwitch
          checked={pomodoroIdle}
          onChange={handleTogglePomodoroIdle}
          activeColor="blue"
        />
      ),
    },

    // 5. Advanced
    {
      id: "app_updates",
      tab: "advanced",
      tabLabel: t("settings_subtab_advanced"),
      title: t("settings_adv_updates"),
      subtitle: updateSubtitle,
      keywords: ["update", "pembaruan", "upgrade", "versi", "version", "check"],
      icon: <RefreshCw size={18} className={updateStatus === "checking" ? "animate-spin" : ""} />,
      iconBgClass: "bg-[#142333]",
      iconColorClass: "text-[#0a84ff]",
      control: (
        <button
          type="button"
          onClick={updateStatus === "available" ? onInstallUpdate : onCheckUpdate}
          disabled={updateStatus === "checking" || updateStatus === "downloading" || updateStatus === "installing"}
          className="px-3 py-1.5 rounded-[9px] bg-[#0a84ff] hover:bg-[#0071e3] text-white text-[11px] font-semibold transition-colors disabled:opacity-50"
        >
          {updateStatus === "available" ? t("settings_update_now") : t("settings_check_update")}
        </button>
      ),
    },
    {
      id: "clear_temp",
      tab: "advanced",
      tabLabel: t("settings_subtab_advanced"),
      title: t("settings_adv_clear_temp"),
      subtitle: clearTempSubtitle,
      keywords: ["cache", "temp", "clear", "bersihkan", "sampah", "lyrics cache", "art cache", "storage"],
      icon: <Trash2 size={18} />,
      iconBgClass: "bg-[#2d1815]",
      iconColorClass: "text-[#ff453a]",
      control: (
        <button
          type="button"
          onClick={onClearTempFiles}
          disabled={clearTempStatus === "cleaning"}
          className="px-3 py-1.5 rounded-[9px] bg-white/[0.08] hover:bg-white/[0.14] text-white text-[11px] font-semibold transition-colors disabled:opacity-50"
        >
          {clearTempStatus === "cleaning" ? t("settings_clearing_temp") : t("settings_clear_temp_btn")}
        </button>
      ),
    },
    {
      id: "test_notif",
      tab: "advanced",
      tabLabel: t("settings_subtab_advanced"),
      title: t("settings_adv_test_notif"),
      subtitle: t("settings_adv_test_notif_desc"),
      keywords: ["test", "notification", "uji", "notifikasi", "banner", "notif"],
      icon: <Send size={18} />,
      iconBgClass: "bg-[#161c33]",
      iconColorClass: "text-[#5e5ce6]",
      control: (
        <button
          type="button"
          onClick={onTestNotification}
          className="px-3.5 py-1.5 rounded-full bg-[#1e1e24] hover:bg-[#282830] text-white text-[12px] font-medium transition-colors cursor-pointer"
        >
          {t("settings_adv_test_notif_btn")}
        </button>
      ),
    },
    {
      id: "restart_onboarding",
      tab: "advanced",
      tabLabel: t("settings_subtab_advanced"),
      title: t("settings_adv_restart_setup"),
      subtitle: t("settings_adv_restart_setup_desc"),
      keywords: ["onboarding", "tutorial", "panduan", "tour", "pengenalan", "restart", "setup"],
      icon: <RotateCcw size={18} />,
      iconBgClass: "bg-[#14261d]",
      iconColorClass: "text-[#30d158]",
      control: (
        <button
          type="button"
          onClick={handleRestartOnboarding}
          className="px-3.5 py-1.5 rounded-full bg-[#1e1e24] hover:bg-[#282830] text-white text-[12px] font-medium transition-colors cursor-pointer"
        >
          {t("settings_adv_restart_setup_btn")}
        </button>
      ),
    },
    {
      id: "reset_all",
      tab: "advanced",
      tabLabel: t("settings_subtab_advanced"),
      title: t("settings_adv_reset_all"),
      subtitle: showResetConfirm ? t("settings_adv_reset_all_desc") : t("settings_adv_reset_all_desc"),
      keywords: ["reset", "factory", "default", "awal", "kembalikan", "hapus semua"],
      icon: <AlertTriangle size={18} />,
      iconBgClass: "bg-[#2d1815]",
      iconColorClass: "text-[#ff453a]",
      control: (
        <button
          type="button"
          onClick={handleResetAllSettings}
          className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer ${
            showResetConfirm
              ? "bg-[#ff453a] hover:bg-[#d93025] text-white"
              : "bg-[#ff453a]/15 hover:bg-[#ff453a]/25 text-[#ff453a] border border-[#ff453a]/20"
          }`}
        >
          {showResetConfirm ? t("settings_adv_reset_confirm") : t("settings_adv_reset_all_btn")}
        </button>
      ),
    },
  ];

  const query = searchQuery.trim().toLowerCase();

  const filteredItems = items.filter((item) => {
    if (!query) return true;
    return (
      item.title.toLowerCase().includes(query) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(query)) ||
      item.tabLabel.toLowerCase().includes(query) ||
      item.keywords.some((kw) => kw.toLowerCase().includes(query))
    );
  });

  if (filteredItems.length === 0) {
    return (
      <div className="w-full rounded-[22px] bg-[#111114] border border-white/[0.06] p-8 flex flex-col items-center justify-center text-center shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
        <Search size={32} className="text-white/20 mb-3" />
        <p className="text-[14px] font-semibold text-white/80">
          {t("settings_search_no_results")}
        </p>
        <p className="text-[11.5px] text-white/40 mt-1 max-w-[240px]">
          {t("settings_search_no_results_desc")}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <span className="text-[11px] font-medium text-white/40">
          {t("settings_search_results_count", { count: filteredItems.length })}
        </span>
      </div>

      <div className="w-full rounded-[22px] bg-[#111114] border border-white/[0.06] p-2 flex flex-col gap-1 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
        {filteredItems.map((item) => (
          <div key={item.id} className="relative group">
            <SettingRow
              icon={item.icon}
              iconBgClass={item.iconBgClass}
              iconColorClass={item.iconColorClass}
              title={item.title}
              subtitle={item.subtitle}
              control={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigateTab(item.tab)}
                    className="text-[10px] text-white/40 hover:text-white/80 bg-white/[0.04] hover:bg-white/[0.08] px-1.5 py-0.5 rounded-[5px] transition-colors cursor-pointer shrink-0"
                    title={`Go to ${item.tabLabel}`}
                  >
                    {item.tabLabel}
                  </button>
                  {item.control}
                </div>
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
};
