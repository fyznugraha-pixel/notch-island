import React from "react";
import { Globe, Zap, Smile, AppWindow, Clock, Volume2 } from "lucide-react";
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
  optAutoCompact: boolean;
  onToggleAutoCompact: () => void;
  optNotifTime: number;
  onChangeNotifTime: (sec: number) => void;
  optNotifSound: string;
  onChangeNotifSound: (soundId: string) => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({
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

      {/* 5. Durasi notifikasi */}
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
