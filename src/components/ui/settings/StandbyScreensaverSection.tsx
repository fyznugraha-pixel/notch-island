import React from "react";
import { Clock, Leaf, Moon } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { IosSwitch } from "../../ios/IosSwitch";
import { IosSelect } from "../../ios/IosSelect";
import { Language } from "../../../services/i18n";
import { StandbyConfig } from "../../../services/standbyService";

interface StandbyScreensaverSectionProps {
  config: StandbyConfig;
  optLanguage: Language;
  isLightMode: boolean;
  cardClass: string;
  sectionLabelClass: string;
  onUpdateConfig: (patch: Partial<StandbyConfig>) => void;
}

const ECO_DELAY_OPTIONS = [1, 2, 3, 5, 10, 15, 30];

export const StandbyScreensaverSection: React.FC<StandbyScreensaverSectionProps> = ({
  config,
  optLanguage,
  isLightMode,
  cardClass,
  sectionLabelClass,
  onUpdateConfig,
}) => {
  const isId = optLanguage === "id";

  return (
    <div className="flex flex-col gap-2">
      <span className={sectionLabelClass}>
        {isId ? "Mode Screensaver & Hemat Daya" : "Screensaver & Power Saving"}
      </span>
      <div className={cardClass}>
        <SettingRow
          isLightMode={isLightMode}
          icon={<Leaf size={18} />}
          iconBgClass={isLightMode ? "bg-[#30d158]/14" : "bg-[#122b1b]"}
          iconColorClass="text-[#30d158]"
          title={isId ? "Mode Screensaver Hemat Daya" : "Screensaver Eco Mode"}
          subtitle={
            isId
              ? "Jeda Desktop Widgets, Notch, & sensor latar belakang Gili saat StandBy aktif lama (modul di StandBy tetap berjalan)"
              : "Pause Desktop Widgets, Notch, and background Gili pollers while StandBy stays active (StandBy widgets keep running)"
          }
          control={
            <IosSwitch
              checked={config.screensaver_eco_enabled}
              onChange={() =>
                onUpdateConfig({ screensaver_eco_enabled: !config.screensaver_eco_enabled })
              }
              activeColor="green"
            />
          }
        />

        {config.screensaver_eco_enabled && (
          <>
            <SettingRow
              isLightMode={isLightMode}
              icon={<Clock size={18} />}
              iconBgClass={isLightMode ? "bg-[#ff9f0a]/15" : "bg-[#2c2210]"}
              iconColorClass="text-[#ff9f0a]"
              title={isId ? "Aktif Setelah StandBy Berjalan" : "Activate After StandBy Runs"}
              subtitle={
                isId
                  ? "Durasi StandBy aktif sebelum modul latar belakang Gili dijeda dan RAM dibersihkan"
                  : "Duration StandBy stays open before pausing background Gili modules and trimming memory"
              }
              control={
                <IosSelect
                  ariaLabel={isId ? "Aktif Setelah StandBy Berjalan" : "Activate After StandBy Runs"}
                  isLightMode={isLightMode}
                  value={config.screensaver_eco_minutes}
                  onChange={(mins) => onUpdateConfig({ screensaver_eco_minutes: mins })}
                  minWidthClass="min-w-[130px]"
                  options={ECO_DELAY_OPTIONS.map((mins) => ({
                    value: mins,
                    label: `${mins} ${isId ? "menit" : mins === 1 ? "minute" : "minutes"}`,
                  }))}
                />
              }
            />

            <SettingRow
              isLightMode={isLightMode}
              icon={<Moon size={18} />}
              iconBgClass={isLightMode ? "bg-[#5e5ce6]/14" : "bg-[#1e1d36]"}
              iconColorClass="text-[#5e5ce6]"
              title={isId ? "Redupkan Layar Saat Screensaver" : "Dim Stage During Screensaver"}
              subtitle={
                isId
                  ? "Turunkan kecerahan tampilan StandBy secara halus dan matikan glow latar agar lebih hemat daya OLED"
                  : "Gently dim the StandBy stage and turn off ambient glow to lower OLED power draw"
              }
              control={
                <IosSwitch
                  checked={config.screensaver_dim_enabled}
                  onChange={() =>
                    onUpdateConfig({ screensaver_dim_enabled: !config.screensaver_dim_enabled })
                  }
                  activeColor="blue"
                />
              }
            />
          </>
        )}
      </div>
    </div>
  );
};
