import React from "react";
import { Globe, Zap, Smile, AppWindow, Clock, Volume2, Timer, User, X } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { IosSwitch } from "../../ios/IosSwitch";
import { IosSegmentedControl } from "../../ios/IosSegmentedControl";
import { NotifSoundPicker } from "./NotifSoundPicker";
import { t, Language } from "../../../services/i18n";

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
  optNotifTime: number;
  onChangeNotifTime: (sec: number) => void;
  optNotifSound: string;
  onChangeNotifSound: (soundId: string) => void;
  optCloseDelay: number;
  onChangeCloseDelay: (sec: number) => void;
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
  optNotifTime,
  onChangeNotifTime,
  optNotifSound,
  onChangeNotifSound,
  optCloseDelay,
  onChangeCloseDelay,
}) => {
  const isId = optLanguage === "id";

  return (
    <div className="w-full rounded-[22px] bg-[#111114] border border-white/[0.06] p-2 flex flex-col gap-1 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      {/* 1. Bahasa */}
      <SettingRow
        icon={<Globe size={18} />}
        iconBgClass="bg-[#132c1e]"
        iconColorClass="text-[#34c759]"
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

      {/* 2. Mulai bersama Windows */}
      <SettingRow
        icon={<Zap size={18} />}
        iconBgClass="bg-[#2c2410]"
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

      {/* 3. Sapaan saat menyala */}
      <SettingRow
        icon={<Smile size={18} />}
        iconBgClass="bg-[#26182e]"
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
        <div className="greeting-name-card mx-1 my-0.5 p-2.5 rounded-[14px] bg-white/[0.04] border border-white/[0.08] flex flex-col gap-2 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <User size={15} className="text-[#af52de] shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="greeting-name-title text-[12px] font-semibold text-white/90 leading-tight">
                  {t("settings_greeting_name_title")}
                </span>
                <span className="greeting-name-subtitle text-[10px] text-[#71717a] leading-tight mt-0.5 truncate">
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
            <div className="greeting-name-input-box flex items-center gap-2 px-3 py-1.5 rounded-[10px] bg-black/40 border border-white/10 focus-within:border-[#af52de]/60 transition-colors">
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
                className="greeting-name-input flex-1 bg-transparent text-[12px] text-white placeholder-[#71717a] outline-none"
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

      {/* 4. Mode ringkas otomatis */}
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

      {/* 5. Durasi tutup notch / Delay tutup panel */}
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

      {/* 6. Durasi notifikasi */}
      <SettingRow
        icon={<Clock size={18} />}
        iconBgClass="bg-[#2e161c]"
        iconColorClass="text-[#ff375f]"
        title={t("settings_notif_duration")}
        subtitle={t("settings_notif_duration_desc")}
        control={
          <IosSegmentedControl
            value={optNotifTime}
            onChange={onChangeNotifTime}
            options={[
              { value: 3, label: isId ? "3 dtk" : "3s" },
              { value: 5, label: isId ? "5 dtk" : "5s" },
              { value: 7, label: isId ? "7 dtk" : "7s" },
            ]}
          />
        }
      />

      {/* 6. Suara notifikasi */}
      <SettingRow
        icon={<Volume2 size={18} />}
        iconBgClass="bg-[#26182e]"
        iconColorClass="text-[#af52de]"
        title={t("settings_notif_sound")}
        subtitle={t("settings_notif_sound_desc")}
        control={
          <NotifSoundPicker
            value={optNotifSound}
            onChange={onChangeNotifSound}
          />
        }
      />
    </div>
  );
};
