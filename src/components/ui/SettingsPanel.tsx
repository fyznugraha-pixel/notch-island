import React from "react";
import { motion } from "framer-motion";
import {
  AppWindow,
  Scaling,
  Type,
  Zap,
  Hand,
  Clock,
  Timer,
  Smile,
  MoveVertical,
  Layers,
  Activity,
  Volume2,
  ClipboardList,
  Music,
  Globe,
  Sun,
  Moon,
  Palette,
  CloudRain,
  ArrowUpCircle,
  RefreshCw,
  Check,
} from "lucide-react";
import { IosSwitch } from "../ios/IosSwitch";
import { IosSegmentedControl } from "../ios/IosSegmentedControl";
import { t, Language } from "../../services/i18n";
import { getVersion } from "@tauri-apps/api/app";
import { WeatherLocationSetting } from "./WeatherLocationSetting";
import {
  checkForAppUpdate,
  downloadAndInstallAppUpdate,
  UpdateInfo,
  UpdateStatus,
} from "../../services/updateService";
import {
  IdleLayoutSetting,
  IdleLayoutConfig,
  IdleRuntimeData,
} from "./IdleLayoutSetting";

export interface SettingsPanelProps {
  slideDirection: number;
  // General
  optLanguage: Language;
  onChangeLanguage: (lang: Language) => void;
  optAutoCompact: boolean;
  onToggleAutoCompact: () => void;
  isAutostart: boolean;
  onToggleAutostart: () => void;
  showGreeting: boolean;
  onToggleGreeting: () => void;
  optNotifTime: number;
  onChangeNotifTime: (sec: number) => void;
  optCloseDelay: number;
  onChangeCloseDelay: (sec: number) => void;
  // Appearance
  optTheme: "dark" | "light" | "auto";
  onChangeTheme: (theme: "dark" | "light" | "auto") => void;
  idleLayout: IdleLayoutConfig;
  onChangeIdleLayout: (layout: IdleLayoutConfig) => void;
  idleRuntimeData: IdleRuntimeData;
  optIdleSize: "compact" | "default" | "large";
  onChangeIdleSize: (size: "compact" | "default" | "large") => void;
  optTabSize: "compact" | "default" | "large";
  onChangeTabSize: (size: "compact" | "default" | "large") => void;
  optFontSize: "small" | "default" | "large";
  onChangeFontSize: (size: "small" | "default" | "large") => void;
  optEars: boolean;
  onToggleEars: () => void;
  optWeatherAnim: boolean;
  onToggleWeatherAnim: () => void;
  optPosition: "top" | "bottom";
  onChangePosition: (pos: "top" | "bottom") => void;
  optOpacity: number;
  onChangeOpacity: (val: number) => void;
  optAnimSpeed: "snappy" | "smooth" | "bouncy";
  onChangeAnimSpeed: (speed: "snappy" | "smooth" | "bouncy") => void;
  // Modules
  optVolume: boolean;
  onToggleVolume: () => void;
  optClipboard: boolean;
  onToggleClipboard: () => void;
  optMedia: boolean;
  onToggleMedia: () => void;
  onClose: () => void;
}

const tabVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 16 : dir < 0 ? -16 : 0,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      x: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
      opacity: { duration: 0.18, ease: "easeOut" as const },
    },
    transitionEnd: { transform: "none" },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -16 : dir < 0 ? 16 : 0,
    opacity: 0,
    transition: { duration: 0.12 },
  }),
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  slideDirection,
  optLanguage,
  onChangeLanguage,
  optAutoCompact,
  onToggleAutoCompact,
  isAutostart,
  onToggleAutostart,
  showGreeting,
  onToggleGreeting,
  optNotifTime,
  onChangeNotifTime,
  optCloseDelay,
  onChangeCloseDelay,
  optTheme,
  onChangeTheme,
  idleLayout,
  onChangeIdleLayout,
  idleRuntimeData,
  optIdleSize,
  onChangeIdleSize,
  optTabSize,
  onChangeTabSize,
  optFontSize,
  onChangeFontSize,
  optEars,
  onToggleEars,
  optWeatherAnim,
  onToggleWeatherAnim,
  optPosition,
  onChangePosition,
  optOpacity,
  onChangeOpacity,
  optAnimSpeed,
  onChangeAnimSpeed,
  optVolume,
  onToggleVolume,
  optClipboard,
  onToggleClipboard,
  optMedia,
  onToggleMedia,
  onClose,
}) => {
  const [updateStatus, setUpdateStatus] = React.useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = React.useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = React.useState<number>(0);
  const [currentAppVersion, setCurrentAppVersion] = React.useState<string>("3.2.1");

  React.useEffect(() => {
    getVersion().then(setCurrentAppVersion).catch(() => {});
  }, []);

  const handleCheckUpdate = async () => {
    if (updateStatus === "checking" || updateStatus === "downloading" || updateStatus === "installing") return;
    setUpdateStatus("checking");
    try {
      const info = await checkForAppUpdate();
      setUpdateInfo(info);
      if (info.available) {
        setUpdateStatus("available");
      } else {
        setUpdateStatus("up_to_date");
      }
    } catch {
      setUpdateStatus("error");
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateInfo?.update) return;
    setUpdateStatus("downloading");
    setDownloadProgress(0);
    try {
      await downloadAndInstallAppUpdate(updateInfo.update, (percent) => {
        setDownloadProgress(percent);
        if (percent >= 100) {
          setUpdateStatus("installing");
        }
      });
    } catch {
      setUpdateStatus("error");
    }
  };

  return (
    <motion.div
      key="settings"
      custom={slideDirection}
      variants={tabVariants}
      initial="enter"
      animate="center"
      exit="exit"
      className="absolute inset-0 w-full h-full flex flex-col pl-3 pr-1.5 pb-3 overflow-y-auto settings-scroll min-w-0 cursor-default gpu-accelerated"
      onClick={onClose}
    >
      <div
        className="flex flex-col gap-3.5 pr-1 pb-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* General Section */}
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-white/50 tracking-wider uppercase mb-1.5 px-3">
            {t("settings_general")}
          </span>
          <div className="bg-[#1c1c1e]/90 rounded-2xl border border-white/10 divide-y divide-white/[0.08] overflow-hidden shadow-sm backdrop-blur-md">
            {/* Language Selector */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#30d158] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Globe size={15} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[12.5px] font-medium text-white leading-tight">
                    {t("settings_language")}
                  </span>
                  <span className="text-[9.5px] text-white/45 leading-tight mt-0.5">
                    {t("settings_language_desc")}
                  </span>
                </div>
              </div>
              <IosSegmentedControl
                value={optLanguage}
                onChange={(val) => onChangeLanguage(val as Language)}
                options={[
                  { value: "en", label: "English", tooltip: "English" },
                  { value: "id", label: "Indonesia", tooltip: "Bahasa Indonesia" },
                ]}
              />
            </div>

            {/* Software Update */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#007aff] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <ArrowUpCircle size={15} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[12.5px] font-medium text-white leading-tight">
                    {t("settings_updates")}
                  </span>
                  <span className="text-[9.5px] text-white/45 leading-tight mt-0.5 truncate">
                    {updateStatus === "checking"
                      ? t("settings_checking_update")
                      : updateStatus === "available"
                      ? `${t("settings_update_available")}: v${updateInfo?.version}`
                      : updateStatus === "downloading"
                      ? `${t("settings_update_downloading")} ${downloadProgress}%`
                      : updateStatus === "installing"
                      ? t("settings_update_installing")
                      : updateStatus === "up_to_date"
                      ? t("settings_update_latest")
                      : updateStatus === "error"
                      ? t("settings_update_error")
                      : `v${currentAppVersion}`}
                  </span>
                </div>
              </div>

              {updateStatus === "available" ? (
                <button
                  onClick={handleInstallUpdate}
                  className="px-2.5 py-1 rounded-full bg-[#007aff] hover:bg-[#0071e3] active:scale-95 text-white text-[11px] font-semibold transition-all shadow-sm flex items-center gap-1.5 shrink-0"
                >
                  <ArrowUpCircle size={12} />
                  <span>{t("settings_update_now")}</span>
                </button>
              ) : updateStatus === "downloading" ? (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#007aff] transition-all duration-200"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-white/60 font-medium font-mono">{downloadProgress}%</span>
                </div>
              ) : updateStatus === "installing" ? (
                <div className="flex items-center gap-1.5 text-white/60 text-[11px] shrink-0">
                  <RefreshCw size={12} className="animate-spin text-[#007aff]" />
                  <span>{t("settings_update_installing")}</span>
                </div>
              ) : (
                <button
                  onClick={handleCheckUpdate}
                  disabled={updateStatus === "checking"}
                  className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 text-white/90 hover:text-white text-[11px] font-medium transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  {updateStatus === "checking" ? (
                    <>
                      <RefreshCw size={11} className="animate-spin text-white/60" />
                      <span>{t("settings_checking_update")}</span>
                    </>
                  ) : updateStatus === "up_to_date" ? (
                    <>
                      <Check size={12} className="text-[#30d158]" />
                      <span>{t("settings_update_latest")}</span>
                    </>
                  ) : (
                    <span>{t("settings_check_update")}</span>
                  )}
                </button>
              )}
            </div>

            {/* Auto Compact */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#0a84ff] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <AppWindow size={15} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[12.5px] font-medium text-white leading-tight">
                    {t("settings_auto_compact")}
                  </span>
                  <span className="text-[9.5px] text-white/45 leading-tight mt-0.5">
                    {t("settings_auto_compact_desc")}
                  </span>
                </div>
              </div>
              <IosSwitch checked={optAutoCompact} onChange={onToggleAutoCompact} />
            </div>

            {/* Run on Startup */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#ff9f0a] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Zap size={15} />
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_autostart")}
                </span>
              </div>
              <IosSwitch checked={isAutostart} onChange={onToggleAutostart} />
            </div>

            {/* Boot Greeting */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#af52de] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Hand size={15} />
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_greeting")}
                </span>
              </div>
              <IosSwitch checked={showGreeting} onChange={onToggleGreeting} />
            </div>

            {/* Notif Duration */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#ff2d55] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Clock size={15} />
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_notif_duration")}
                </span>
              </div>
              <IosSegmentedControl
                value={optNotifTime}
                onChange={onChangeNotifTime}
                options={[
                  { value: 3, label: "3s", tooltip: "3s" },
                  { value: 5, label: "5s", tooltip: "5s" },
                  { value: 7, label: "7s", tooltip: "7s" },
                ]}
              />
            </div>

            {/* Panel Close Delay */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#5e5ce6] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Timer size={15} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[12.5px] font-medium text-white leading-tight">
                    {t("settings_close_delay")}
                  </span>
                  <span className="text-[9.5px] text-white/45 leading-tight mt-0.5 truncate">
                    {t("settings_close_delay_desc")}
                  </span>
                </div>
              </div>
              <IosSegmentedControl
                value={optCloseDelay}
                onChange={onChangeCloseDelay}
                options={[
                  { value: 0, label: t("settings_close_delay_none"), tooltip: t("settings_close_delay_tip_0") },
                  { value: 1, label: "1s", tooltip: t("settings_close_delay_tip_1") },
                  { value: 3, label: "3s", tooltip: t("settings_close_delay_tip_3") },
                  { value: -1, label: t("settings_close_delay_never"), tooltip: t("settings_close_delay_tip_never") },
                ]}
              />
            </div>

            {/* Weather Location Selector */}
            <WeatherLocationSetting />
          </div>
        </div>

        {/* Appearance Section */}
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-white/50 tracking-wider uppercase mb-1.5 px-3">
            {t("settings_appearance")}
          </span>
          <div className="bg-[#1c1c1e]/90 rounded-2xl border border-white/10 divide-y divide-white/[0.08] overflow-hidden shadow-sm backdrop-blur-md">
            {/* Theme Mode */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#0a84ff] flex items-center justify-center text-white shrink-0 shadow-sm">
                  {optTheme === "light" ? <Sun size={15} /> : optTheme === "dark" ? <Moon size={15} /> : <Palette size={15} />}
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_mode")}
                </span>
              </div>
              <IosSegmentedControl
                value={optTheme}
                onChange={onChangeTheme}
                options={[
                  { value: "dark", label: t("settings_mode_dark"), tooltip: t("settings_mode_dark_tip") },
                  { value: "light", label: t("settings_mode_light"), tooltip: t("settings_mode_light_tip") },
                  { value: "auto", label: t("settings_mode_auto"), tooltip: t("settings_mode_auto_tip") },
                ]}
              />
            </div>

            {/* Idle Layout & Items Customizer with Live Preview */}
            <IdleLayoutSetting
              layout={idleLayout}
              onChangeLayout={onChangeIdleLayout}
              runtimeData={idleRuntimeData}
            />

            {/* Idle Size */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#af52de] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Scaling size={15} />
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_idle_size")}
                </span>
              </div>
              <IosSegmentedControl
                value={optIdleSize}
                onChange={onChangeIdleSize}
                options={[
                  { value: "compact", label: t("settings_idle_compact"), tooltip: t("settings_idle_tip_compact") },
                  { value: "default", label: t("settings_idle_default"), tooltip: t("settings_idle_tip_default") },
                  { value: "large", label: t("settings_idle_large"), tooltip: t("settings_idle_tip_large") },
                ]}
              />
            </div>

            {/* Tab Panel Size */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#5ac8fa] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <AppWindow size={15} />
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_tab_size")}
                </span>
              </div>
              <IosSegmentedControl
                value={optTabSize}
                onChange={onChangeTabSize}
                options={[
                  { value: "compact", label: t("settings_tab_compact"), tooltip: t("settings_tab_tip_compact") },
                  { value: "default", label: t("settings_tab_default"), tooltip: t("settings_tab_tip_default") },
                  { value: "large", label: t("settings_tab_large"), tooltip: t("settings_tab_tip_large") },
                ]}
              />
            </div>

            {/* Font Size */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#ff2d55] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Type size={15} />
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_font_size")}
                </span>
              </div>
              <IosSegmentedControl
                value={optFontSize}
                onChange={onChangeFontSize}
                options={[
                  { value: "small", label: t("settings_font_small"), tooltip: t("settings_font_tip_small") },
                  { value: "default", label: t("settings_font_default"), tooltip: t("settings_font_tip_default") },
                  { value: "large", label: t("settings_font_large"), tooltip: t("settings_font_tip_large") },
                ]}
              />
            </div>

            {/* Notch Ears */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#5856d6] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Smile size={15} />
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_ears")}
                </span>
              </div>
              <IosSwitch checked={optEars} onChange={onToggleEars} />
            </div>

            {/* Weather Animation */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#38bdf8] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <CloudRain size={15} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[12.5px] font-medium text-white leading-tight">
                    {t("settings_weather_anim")}
                  </span>
                  <span className="text-[9.5px] text-white/45 leading-tight mt-0.5">
                    {t("settings_weather_anim_desc")}
                  </span>
                </div>
              </div>
              <IosSwitch checked={optWeatherAnim} onChange={onToggleWeatherAnim} />
            </div>

            {/* Position */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#32ade6] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <MoveVertical size={15} />
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_position")}
                </span>
              </div>
              <IosSegmentedControl
                value={optPosition}
                onChange={onChangePosition}
                options={[
                  { value: "top", label: t("settings_pos_top"), tooltip: t("settings_pos_top_tip") },
                  { value: "bottom", label: t("settings_pos_bottom"), tooltip: t("settings_pos_bottom_tip") },
                ]}
              />
            </div>

            {/* Transparency */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#34c759] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Layers size={15} />
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_transparency")}
                </span>
              </div>
              <IosSegmentedControl
                value={optOpacity}
                onChange={onChangeOpacity}
                options={[
                  { value: 1.0, label: t("settings_theme_solid"), tooltip: t("settings_theme_solid_tip") },
                  { value: 0.8, label: t("settings_theme_glass"), tooltip: t("settings_theme_glass_tip") },
                  { value: 0.5, label: t("settings_theme_clear"), tooltip: t("settings_theme_clear_tip") },
                ]}
              />
            </div>

            {/* Animations */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#ff9f0a] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Activity size={15} />
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_animations")}
                </span>
              </div>
              <IosSegmentedControl
                value={optAnimSpeed}
                onChange={onChangeAnimSpeed}
                options={[
                  { value: "snappy", label: t("settings_anim_snappy"), tooltip: t("settings_anim_snappy_tip") },
                  { value: "smooth", label: t("settings_anim_smooth"), tooltip: t("settings_anim_smooth_tip") },
                  { value: "bouncy", label: t("settings_anim_bouncy"), tooltip: t("settings_anim_bouncy_tip") },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Modules Section */}
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-white/50 tracking-wider uppercase mb-1.5 px-3">
            {t("settings_modules")}
          </span>
          <div className="bg-[#1c1c1e]/90 rounded-2xl border border-white/10 divide-y divide-white/[0.08] overflow-hidden shadow-sm backdrop-blur-md">
            {/* Volume Monitor */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#0a84ff] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Volume2 size={15} />
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_volume_monitor")}
                </span>
              </div>
              <IosSwitch checked={optVolume} onChange={onToggleVolume} />
            </div>

            {/* Clipboard Monitor */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#30d158] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <ClipboardList size={15} />
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_clipboard_monitor")}
                </span>
              </div>
              <IosSwitch checked={optClipboard} onChange={onToggleClipboard} />
            </div>

            {/* Media Player */}
            <div className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px]">
              <div className="flex items-center gap-2.5 pr-2 min-w-0">
                <div className="w-[28px] h-[28px] rounded-[7px] bg-[#ff3b30] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Music size={15} />
                </div>
                <span className="text-[12.5px] font-medium text-white leading-tight">
                  {t("settings_media_player")}
                </span>
              </div>
              <IosSwitch checked={optMedia} onChange={onToggleMedia} />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
