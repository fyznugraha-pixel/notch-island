import React from "react";
import { Thermometer } from "lucide-react";
import { SettingRow } from "./settings/SettingRow";
import { IosSegmentedControl } from "../ios/IosSegmentedControl";
import { useTemperatureUnit } from "../../hooks/useTemperatureUnit";
import { TemperatureUnit } from "../../utils/temperatureUnit";
import { t } from "../../services/i18n";

export interface TemperatureUnitSettingProps {
  isLightMode?: boolean;
  compact?: boolean;
}

export const TemperatureUnitSetting: React.FC<TemperatureUnitSettingProps> = ({
  isLightMode = false,
  compact = false,
}) => {
  const [unit, setUnit] = useTemperatureUnit();

  const handleChange = (val: string | number) => {
    setUnit(val as TemperatureUnit);
    import("../../services/desktopWidgetsService")
      .then((m) => m.syncFrontendWidgetMirror())
      .catch(() => {});
  };

  return (
    <SettingRow
      isLightMode={isLightMode}
      icon={<Thermometer size={18} />}
      iconBgClass={isLightMode ? "bg-[#ff9f0a]/15" : "bg-[#2c2410]"}
      iconColorClass="text-[#ff9f0a]"
      title={t("settings_temperature_unit")}
      subtitle={t("settings_temperature_unit_desc")}
      control={
        <IosSegmentedControl
          value={unit}
          onChange={handleChange}
          options={[
            {
              value: "celsius",
              label: compact ? "°C" : "Celsius (°C)",
              tooltip: "Celsius (°C)",
            },
            {
              value: "fahrenheit",
              label: compact ? "°F" : "Fahrenheit (°F)",
              tooltip: "Fahrenheit (°F)",
            },
          ]}
        />
      }
    />
  );
};
