import React, { useState } from "react";
import { Volume2, ClipboardList, Music, Timer } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { IosSwitch } from "../../ios/IosSwitch";
import { t } from "../../../services/i18n";
import {
  loadPomodoroSettings,
  savePomodoroSettings,
} from "../../../services/pomodoroService";

export interface ModulesTabProps {
  optVolume: boolean;
  onToggleVolume: () => void;
  optClipboard: boolean;
  onToggleClipboard: () => void;
  optMedia: boolean;
  onToggleMedia: () => void;
  optSoundFx?: boolean;
  onToggleSoundFx?: () => void;
}

export const ModulesTab: React.FC<ModulesTabProps> = ({
  optVolume,
  onToggleVolume,
  optClipboard,
  onToggleClipboard,
  optMedia,
  onToggleMedia,
  optSoundFx = true,
  onToggleSoundFx,
}) => {
  const [pomodoroIdle, setPomodoroIdle] = useState<boolean>(() => {
    return loadPomodoroSettings().showIdleTimer;
  });

  const handleTogglePomodoroIdle = () => {
    const next = !pomodoroIdle;
    setPomodoroIdle(next);
    const curr = loadPomodoroSettings();
    savePomodoroSettings({ ...curr, showIdleTimer: next });
    window.dispatchEvent(new CustomEvent("gili_pomodoro_settings_updated"));
  };

  return (
    <div className="w-full rounded-[22px] bg-[#111114] border border-white/[0.06] p-2 flex flex-col justify-between shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      {/* 1. Monitor volume */}
      <SettingRow
        icon={<Volume2 size={18} />}
        iconBgClass="bg-[#142333]"
        iconColorClass="text-[#0a84ff]"
        title={t("settings_volume_monitor")}
        subtitle={t("settings_volume_monitor_desc")}
        control={
          <IosSwitch
            checked={optVolume}
            onChange={onToggleVolume}
            activeColor="blue"
          />
        }
      />

      {/* 2. Monitor clipboard */}
      <SettingRow
        icon={<ClipboardList size={18} />}
        iconBgClass="bg-[#132c1e]"
        iconColorClass="text-[#34c759]"
        title={t("settings_clipboard_monitor")}
        subtitle={t("settings_clipboard_monitor_desc")}
        control={
          <IosSwitch
            checked={optClipboard}
            onChange={onToggleClipboard}
            activeColor="blue"
          />
        }
      />

      {/* 3. Pemutar media */}
      <SettingRow
        icon={<Music size={18} />}
        iconBgClass="bg-[#2d1815]"
        iconColorClass="text-[#ff453a]"
        title={t("settings_media_player")}
        subtitle={t("settings_media_player_desc")}
        control={
          <IosSwitch
            checked={optMedia}
            onChange={onToggleMedia}
            activeColor="blue"
          />
        }
      />

      {/* 4. Efek suara */}
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

      {/* 5. Pomodoro */}
      <SettingRow
        icon={<Timer size={18} />}
        iconBgClass="bg-[#2f2014]"
        iconColorClass="text-[#ff9f0a]"
        title={t("settings_module_pomodoro")}
        subtitle={t("settings_module_pomodoro_desc")}
        control={
          <IosSwitch
            checked={pomodoroIdle}
            onChange={handleTogglePomodoroIdle}
            activeColor="blue"
          />
        }
      />
    </div>
  );
};
