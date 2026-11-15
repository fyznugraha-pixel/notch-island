import React from "react";
import { Globe, Zap, Smile, AppWindow, Timer, User, X } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { IosSwitch } from "../../ios/IosSwitch";
import { IosSegmentedControl } from "../../ios/IosSegmentedControl";
import { ShortcutActionId, ShortcutStatus } from "../../../services/shortcuts";
import { t, Language } from "../../../services/i18n";
import { WeatherLocationSetting } from "../WeatherLocationSetting";

export interface GeneralTabProps {
  optLanguage: Language;
  onChangeLanguage: (lang: Language) => void;
  isAutostart: boolean;
  onToggleAutostart: () => void;
  showGreeting: boolean;
  onToggleGreeting: () => void;
  greetingNameMode: "auto" | "custom";
  onChangeGreetingNameMode: (mode: "auto" | "custom") => void;
  customGreetingName: string;
  onChangeCustomGreetingName: (name: string) => void;
  onTestGreeting?: () => void;
  optAutoCompact: boolean;
  onToggleAutoCompact: () => void;
  optAutoCompactMode?: "browser" | "maximized";
  onChangeAutoCompactMode?: (mode: "browser" | "maximized") => void;
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
  isLightMode?: boolean;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({
  optLanguage,
  onChangeLanguage,
  isAutostart,
  onToggleAutostart,
  showGreeting,
  onToggleGreeting,
  greetingNameMode,
  onChangeGreetingNameMode,
  customGreetingName,
  onChangeCustomGreetingName,
  onTestGreeting,
  optAutoCompact,
  onToggleAutoCompact,
  optAutoCompactMode = "browser",
  onChangeAutoCompactMode,
  optCloseDelay,
  onChangeCloseDelay,
  isLightMode,
}) => {
  const isId = optLanguage === "id";
  const light =
    isLightMode ??
    (typeof document !== "undefined" &&
      document.documentElement.classList.contains("light"));

  const cardClass = `w-full rounded-[18px] p-3 flex flex-col gap-1 transition-colors ${
    light
      ? "bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
      : "bg-[#121318] border border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]"
  }`;
  const sectionLabelClass = `px-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${
    light ? "text-neutral-500" : "text-zinc-500"
  }`;

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* 1. Language, Startup & Greeting */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>
          {isId ? "Bahasa, Startup & Sapaan" : "Language, Startup & Greeting"}
        </span>
        <div className={cardClass}>
          {/* Bahasa */}
          <SettingRow
            isLightMode={light}
            icon={<Globe size={18} />}
            iconBgClass={light ? "bg-[#34c759]/12" : "bg-[#132c1e]"}
            iconColorClass={light ? "text-emerald-700" : "text-[#34c759]"}
            title={t("settings_language")}
            subtitle={t("settings_language_desc")}
            control={
              <IosSegmentedControl
                value={optLanguage}
                onChange={(val) => onChangeLanguage(val as Language)}
                options={[
                  { value: "en", label: "English" },
                  { value: "id", label: "Indonesia" },
                ]}
              />
            }
          />

          {/* Mulai bersama Windows */}
          <SettingRow
            isLightMode={light}
            icon={<Zap size={18} />}
            iconBgClass={light ? "bg-[#ff9f0a]/15" : "bg-[#2c2410]"}
            iconColorClass="text-[#ff9f0a]"
            title={t("settings_autostart")}
            subtitle={t("settings_autostart_desc")}
            control={
              <IosSwitch
                checked={isAutostart}
                onChange={onToggleAutostart}
                activeColor="blue"
              />
            }
          />

          {/* Sapaan saat menyala */}
          <SettingRow
            isLightMode={light}
            icon={<Smile size={18} />}
            iconBgClass={light ? "bg-[#af52de]/12" : "bg-[#26182e]"}
            iconColorClass="text-[#af52de]"
            title={t("settings_greeting")}
            subtitle={t("settings_greeting_desc")}
            control={
              <IosSwitch
                checked={showGreeting}
                onChange={onToggleGreeting}
                activeColor="blue"
              />
            }
          />

          {showGreeting && (
            <div
              className={`greeting-name-card mx-1.5 my-1 p-3 rounded-[14px] border flex flex-col gap-2.5 transition-all ${
                light
                  ? "bg-neutral-50 border-black/[0.07]"
                  : "bg-white/[0.04] border-white/[0.08]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <User size={15} className="text-[#af52de] shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span
                      className={`greeting-name-title text-[12px] font-semibold leading-tight ${
                        light ? "text-neutral-900" : "text-white/90"
                      }`}
                    >
                      {t("settings_greeting_name_title")}
                    </span>
                    <span
                      className={`greeting-name-subtitle text-[10.5px] leading-tight mt-0.5 truncate ${
                        light ? "text-neutral-500" : "text-zinc-400"
                      }`}
                    >
                      {t("settings_greeting_name_desc")}
                    </span>
                  </div>
                </div>
                <IosSegmentedControl
                  value={greetingNameMode}
                  onChange={(val) => onChangeGreetingNameMode(val as "auto" | "custom")}
                  options={[
                    { value: "auto", label: t("settings_greeting_name_auto") },
                    { value: "custom", label: t("settings_greeting_name_custom") },
                  ]}
                />
              </div>

              {greetingNameMode === "custom" && (
                <div
                  className={`greeting-name-input-box flex items-center gap-2 px-3 py-1.5 rounded-[10px] border transition-colors ${
                    light
                      ? "bg-white border-black/[0.1] focus-within:border-[#af52de]"
                      : "bg-black/40 border-white/10 focus-within:border-[#af52de]/60"
                  }`}
                >
                  <User size={13} className="greeting-name-icon text-[#a1a1aa] shrink-0" />
                  <input
                    type="text"
                    value={customGreetingName && customGreetingName !== "undefined" ? customGreetingName : ""}
                    onChange={(e) => onChangeCustomGreetingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && onTestGreeting) {
                        onTestGreeting();
                      }
                    }}
                    placeholder={t("settings_greeting_name_placeholder")}
                    maxLength={30}
                    className={`greeting-name-input flex-1 bg-transparent text-[12px] outline-none ${
                      light
                        ? "text-neutral-900 placeholder-neutral-400"
                        : "text-white placeholder-[#71717a]"
                    }`}
                  />
                  {customGreetingName && customGreetingName !== "undefined" && (
                    <button
                      type="button"
                      onClick={() => onChangeCustomGreetingName("")}
                      className="greeting-name-clear-btn text-[#71717a] hover:text-white transition-colors"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Window Behavior & Location */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>
          {isId ? "Perilaku & Lokasi" : "Behavior & Location"}
        </span>
        <div className={cardClass}>
          {/* Mode ringkas otomatis */}
          <SettingRow
            isLightMode={light}
            icon={<AppWindow size={18} />}
            iconBgClass={light ? "bg-[#0a84ff]/12" : "bg-[#142333]"}
            iconColorClass="text-[#0a84ff]"
            title={t("settings_auto_compact")}
            subtitle={
              optAutoCompact
                ? optAutoCompactMode === "maximized"
                  ? t("settings_auto_compact_desc_maximized")
                  : t("settings_auto_compact_desc_browser")
                : t("settings_auto_compact_desc")
            }
            control={
              <IosSwitch
                checked={optAutoCompact}
                onChange={onToggleAutoCompact}
                activeColor="blue"
              />
            }
          />

          {optAutoCompact && onChangeAutoCompactMode && (
            <div
              className={`mx-1.5 mb-1 px-3 py-2 rounded-[12px] border flex items-center justify-between gap-3 ${
                light
                  ? "bg-neutral-50 border-black/[0.06]"
                  : "bg-white/[0.03] border-white/[0.06]"
              }`}
            >
              <span
                className={`text-[12px] font-medium ${
                  light ? "text-neutral-700" : "text-zinc-300"
                }`}
              >
                {t("settings_auto_compact_target")}
              </span>
              <IosSegmentedControl
                value={optAutoCompactMode}
                onChange={(val) => onChangeAutoCompactMode(val as "browser" | "maximized")}
                options={[
                  { value: "browser", label: t("settings_auto_compact_browser") },
                  { value: "maximized", label: t("settings_auto_compact_maximized") },
                ]}
              />
            </div>
          )}

          {/* Durasi tutup notch / Delay tutup panel */}
          <SettingRow
            isLightMode={light}
            icon={<Timer size={18} />}
            iconBgClass={light ? "bg-[#7c7cff]/12" : "bg-[#1e1c33]"}
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

          {/* Lokasi Cuaca */}
          <WeatherLocationSetting isLightMode={light} />
        </div>
      </div>
    </div>
  );
};
