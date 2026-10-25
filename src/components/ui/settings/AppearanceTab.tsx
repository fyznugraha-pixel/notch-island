import React from "react";
import { Moon, Type, Layout, Smile, Layers, Scaling } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { IosSwitch } from "../../ios/IosSwitch";
import { IosSegmentedControl } from "../../ios/IosSegmentedControl";
import { t } from "../../../services/i18n";

export interface AppearanceTabProps {
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
  onChangeOpacity: (val: number) => void;
}

export const AppearanceTab: React.FC<AppearanceTabProps> = ({
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
}) => {
  return (
    <div className="w-full rounded-[22px] bg-[#111114] border border-white/[0.06] p-2 flex flex-col gap-1 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      {/* 1. Tema */}
      <SettingRow
        icon={<Moon size={18} />}
        iconBgClass="bg-[#161c33]"
        iconColorClass="text-[#5e5ce6]"
        title={t("settings_mode")}
        control={
          <IosSegmentedControl
            value={optTheme}
            onChange={(val) => onChangeTheme(val as "dark" | "light" | "auto")}
            options={[
              { value: "dark", label: t("settings_mode_dark") },
              { value: "light", label: t("settings_mode_light") },
              { value: "auto", label: t("settings_mode_auto") },
            ]}
          />
        }
      />

      {/* 2. Ukuran fon */}
      <SettingRow
        icon={<Type size={18} />}
        iconBgClass="bg-[#2c1626]"
        iconColorClass="text-[#bf5af2]"
        title={t("settings_font_size")}
        control={
          <IosSegmentedControl
            value={optFontSize}
            onChange={(val) => onChangeFontSize(val as "small" | "default" | "large")}
            options={[
              { value: "small", label: t("settings_font_small") },
              { value: "default", label: t("settings_font_default") },
              { value: "large", label: t("settings_font_large") },
            ]}
          />
        }
      />

      {/* 3. Ukuran Idle */}
      <SettingRow
        icon={<Scaling size={18} />}
        iconBgClass="bg-[#14261d]"
        iconColorClass="text-[#30d158]"
        title={t("settings_idle_size")}
        control={
          <IosSegmentedControl
            value={optIdleSize}
            onChange={(val) => onChangeIdleSize(val as "compact" | "default" | "large")}
            options={[
              { value: "compact", label: t("settings_idle_compact"), tooltip: t("settings_idle_tip_compact") },
              { value: "default", label: t("settings_idle_default"), tooltip: t("settings_idle_tip_default") },
              { value: "large", label: t("settings_idle_large"), tooltip: t("settings_idle_tip_large") },
            ]}
          />
        }
      />

      {/* 4. Ukuran panel tab */}
      <SettingRow
        icon={<Layout size={18} />}
        iconBgClass="bg-[#13262d]"
        iconColorClass="text-[#64d2ff]"
        title={t("settings_tab_size")}
        control={
          <IosSegmentedControl
            value={optTabSize}
            onChange={(val) => onChangeTabSize(val as "compact" | "default" | "large")}
            options={[
              { value: "compact", label: t("settings_tab_compact") },
              { value: "default", label: t("settings_tab_default") },
              { value: "large", label: t("settings_tab_large") },
            ]}
          />
        }
      />

      {/* 4. Telinga Gili */}
      <SettingRow
        icon={<Smile size={18} />}
        iconBgClass="bg-[#26182e]"
        iconColorClass="text-[#af52de]"
        title={t("settings_ears")}
        subtitle={t("settings_ears_desc")}
        control={
          <IosSwitch
            checked={optEars}
            onChange={onToggleEars}
            activeColor="blue"
          />
        }
      />

      {/* 5. Transparansi */}
      <SettingRow
        icon={<Layers size={18} />}
        iconBgClass="bg-[#142d1f]"
        iconColorClass="text-[#30d158]"
        title={t("settings_transparency")}
        control={
          <IosSegmentedControl
            value={optOpacity >= 0.9 ? 1.0 : optOpacity >= 0.7 ? 0.8 : 0.5}
            onChange={onChangeOpacity}
            options={[
              { value: 1.0, label: t("settings_theme_solid") },
              { value: 0.8, label: t("settings_theme_glass") },
              { value: 0.5, label: t("settings_theme_clear") },
            ]}
          />
        }
      />
    </div>
  );
};
