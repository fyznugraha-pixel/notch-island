import React from "react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import {
  ExternalLink,
  LayoutGrid,
  Timer,
  AppWindow,
  Volume2,
} from "lucide-react";
import { Language, t } from "../../services/i18n";
import { IdleLayoutConfig, IdleRuntimeData } from "./IdleLayoutSetting";
import { AppearanceTab } from "./settings/AppearanceTab";
import { SettingRow } from "./settings/SettingRow";
import { IosSwitch } from "../ios/IosSwitch";
import { IosSegmentedControl } from "../ios/IosSegmentedControl";
import { ShortcutActionId, ShortcutStatus } from "../../services/shortcuts";

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
  greetingNameMode: "auto" | "custom";
  onChangeGreetingNameMode: (mode: "auto" | "custom") => void;
  customGreetingName: string;
  onChangeCustomGreetingName: (name: string) => void;
  onTestGreeting?: () => void;
  onTestNotification?: () => void;
  optNotifTime: number;
  onChangeNotifTime: (sec: number) => void;
  optNotifSound: string;
  onChangeNotifSound: (soundId: string) => void;
  optCloseDelay: number;
  onChangeCloseDelay: (sec: number) => void;
  shortcuts: Record<ShortcutActionId, string | null>;
  shortcutsEnabled: boolean;
  shortcutStatuses: Record<ShortcutActionId, ShortcutStatus>;
  onUpdateShortcut: (actionId: ShortcutActionId, shortcut: string | null) => Promise<{ success: boolean; error?: string }>;
  onResetShortcut: (actionId: ShortcutActionId) => Promise<void>;
  onToggleShortcutsEnabled: (enabled: boolean) => void;
  // Appearance
  optTheme: "dark" | "light" | "auto";
  onChangeTheme: (theme: "dark" | "light" | "auto") => void;
  notchShape: "notch" | "island";
  onChangeNotchShape: (shape: "notch" | "island") => void;
  islandTopOffset: number;
  onChangeIslandTopOffset: (offset: number) => void;
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
  optSoundFx?: boolean;
  onToggleSoundFx?: () => void;
  isLightMode?: boolean;
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
  optAutoCompact,
  onToggleAutoCompact,
  optCloseDelay,
  onChangeCloseDelay,
  optTheme,
  onChangeTheme,
  notchShape,
  onChangeNotchShape,
  islandTopOffset,
  onChangeIslandTopOffset,
  optIdleSize,
  onChangeIdleSize,
  optTabSize,
  onChangeTabSize,
  optFontSize,
  onChangeFontSize,
  optEars,
  onToggleEars,
  optPosition,
  onChangePosition,
  optOpacity,
  onChangeOpacity,
  optAnimSpeed,
  onChangeAnimSpeed,
  optSoundFx = true,
  onToggleSoundFx,
  isLightMode = false,
  onClose,
}) => {
  const isId = optLanguage === "id";

  const handleOpenSettingsWindow = (section: string = "about") => {
    invoke("open_settings_window", { section }).catch(console.error);
    onClose();
  };

  return (
    <motion.div
      key="settings"
      custom={slideDirection}
      variants={tabVariants}
      initial="enter"
      animate="center"
      exit="exit"
      className="absolute inset-0 w-full h-full flex flex-col px-4 pt-1 pb-1 overflow-hidden select-none min-w-0 cursor-default gpu-accelerated"
      onClick={onClose}
    >
      <div
        className="flex-1 flex flex-col min-w-0 h-full gap-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Action Banner: Open Full Apple-style Settings Window */}
        <div
          onClick={() => handleOpenSettingsWindow("about")}
          className={`group w-full rounded-[18px] px-3.5 py-2.5 flex items-center justify-between gap-3 border cursor-pointer transition-all shrink-0 ${
            isLightMode
              ? "bg-[#0a84ff]/[0.08] border-[#0a84ff]/25 hover:border-[#0a84ff]/45 shadow-sm"
              : "bg-[#151822] border-[#3882F6]/30 hover:border-[#3882F6]/55 shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-[11px] bg-[#0a84ff] flex items-center justify-center text-white shadow-[0_4px_12px_rgba(10,132,255,0.35)] shrink-0">
              <LayoutGrid size={17} strokeWidth={2.2} />
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className={`text-[13px] font-semibold leading-tight truncate ${
                  isLightMode ? "text-neutral-900" : "text-white"
                }`}
              >
                {isId ? "Pengaturan Lengkap & Kelola Tab" : "Full Settings & Manage Tabs"}
              </span>
              <span
                className={`text-[10.5px] leading-tight truncate mt-0.5 ${
                  isLightMode ? "text-neutral-600" : "text-zinc-400"
                }`}
              >
                {isId
                  ? "Atur urutan & on/off tab, layar diam, pintasan keyboard, notifikasi & sistem"
                  : "Reorder & toggle tabs, idle layout, shortcuts, notifications & system"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenSettingsWindow("about");
            }}
            className="px-3 py-1.5 rounded-full bg-[#0a84ff] group-hover:bg-[#0070e0] text-white text-[11.5px] font-semibold flex items-center gap-1.5 shadow-[0_2px_10px_rgba(10,132,255,0.35)] transition-colors shrink-0 cursor-pointer"
          >
            <span>{isId ? "Buka Jendela" : "Open Window"}</span>
            <ExternalLink size={12.5} strokeWidth={2.3} />
          </button>
        </div>

        {/* Scrollable Core Settings Body (Live Notch Preview) */}
        <div
          className="flex-1 w-full pb-2 flex flex-col gap-2.5 overflow-y-auto settings-scroll min-h-0 pr-0.5 rounded-[22px]"
          data-scrollable="true"
        >
          {/* 1. Core Appearance & Sizing (Live Morphing on Notch) */}
          <AppearanceTab
            optTheme={optTheme}
            onChangeTheme={onChangeTheme}
            notchShape={notchShape}
            onChangeNotchShape={onChangeNotchShape}
            islandTopOffset={islandTopOffset}
            onChangeIslandTopOffset={onChangeIslandTopOffset}
            optPosition={optPosition}
            onChangePosition={onChangePosition}
            isLightMode={isLightMode}
            optFontSize={optFontSize}
            onChangeFontSize={onChangeFontSize}
            optIdleSize={optIdleSize}
            onChangeIdleSize={onChangeIdleSize}
            optTabSize={optTabSize}
            onChangeTabSize={onChangeTabSize}
            optEars={optEars}
            onToggleEars={onToggleEars}
            optOpacity={optOpacity}
            onChangeOpacity={onChangeOpacity}
            optAnimSpeed={optAnimSpeed}
            onChangeAnimSpeed={onChangeAnimSpeed}
          />

          {/* 2. Quick Core Behavior Card */}
          <div
            className={`w-full rounded-[22px] p-2 flex flex-col gap-1 transition-colors ${
              isLightMode
                ? "bg-white/80 border border-black/10 shadow-[0_4px_20px_rgba(0,0,0,0.06)]"
                : "bg-[#111114] border border-white/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
            }`}
          >
            {/* Close Delay */}
            <SettingRow
              icon={<Timer size={18} />}
              iconBgClass="bg-[#1e1c33]"
              iconColorClass="text-[#7c7cff]"
              title={t("settings_close_delay")}
              subtitle={t("settings_close_delay_desc")}
              control={
                <IosSegmentedControl
                  value={optCloseDelay}
                  onChange={(val) => onChangeCloseDelay(val as number)}
                  options={[
                    { value: 0, label: isId ? "Instan" : "Instant", tooltip: t("settings_close_delay_tip_0") },
                    { value: 1, label: isId ? "1 dtk" : "1s", tooltip: t("settings_close_delay_tip_1") },
                    { value: 3, label: isId ? "3 dtk" : "3s", tooltip: t("settings_close_delay_tip_3") },
                    { value: -1, label: isId ? "Manual" : "Manual", tooltip: t("settings_close_delay_tip_never") },
                  ]}
                />
              }
            />

            {/* Auto-Compact */}
            <SettingRow
              icon={<AppWindow size={18} />}
              iconBgClass="bg-[#142333]"
              iconColorClass="text-[#0a84ff]"
              title={t("settings_auto_compact")}
              subtitle={t("settings_auto_compact_desc")}
              control={
                <IosSwitch
                  checked={optAutoCompact}
                  onChange={onToggleAutoCompact}
                  activeColor="blue"
                />
              }
            />

            {/* Sound FX */}
            <SettingRow
              icon={<Volume2 size={18} />}
              iconBgClass="bg-[#241c30]"
              iconColorClass="text-[#bf5af2]"
              title={t("settings_sound_effects")}
              subtitle={t("settings_sound_effects_desc")}
              control={
                <IosSwitch
                  checked={optSoundFx}
                  onChange={onToggleSoundFx || (() => {})}
                  activeColor="blue"
                />
              }
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};
