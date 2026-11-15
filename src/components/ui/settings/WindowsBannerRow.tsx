import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BellOff } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { IosSwitch } from "../../ios/IosSwitch";
import { t } from "../../../services/i18n";

interface WindowsBannerRowProps {
  isLightMode?: boolean;
}

export const WindowsBannerRow: React.FC<WindowsBannerRowProps> = ({ isLightMode }) => {
  const light =
    isLightMode ??
    (typeof document !== "undefined" &&
      document.documentElement.classList.contains("light"));
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    invoke<boolean>("get_windows_banners_hidden").then(setIsHidden).catch(() => {});
  }, []);

  const handleToggleWindowsBanners = async () => {
    const next = !isHidden;
    try {
      await invoke("set_windows_banners_hidden", { hidden: next });
      setIsHidden(next);
    } catch (err) {
      console.error("Failed to toggle Windows notification banners", err);
    }
  };

  return (
    <SettingRow
      isLightMode={light}
      icon={<BellOff size={18} />}
      iconBgClass={light ? "bg-[#ff453a]/12" : "bg-[#2e1616]"}
      iconColorClass="text-[#ff453a]"
      title={t("settings_hide_windows_banner")}
      subtitle={t("settings_hide_windows_banner_desc")}
      control={
        <IosSwitch
          checked={isHidden}
          onChange={handleToggleWindowsBanners}
          activeColor="blue"
        />
      }
    />
  );
};
