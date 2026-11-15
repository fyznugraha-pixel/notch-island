import React, { useState } from "react";
import {
  RefreshCw,
  Trash2,
  Send,
  AlertTriangle,
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { t } from "../../../services/i18n";
import { UpdateInfo, UpdateStatus } from "../../../services/updateService";
import { resetAllAppSettings } from "../../../services/settingsResetService";

export interface AdvancedTabProps {
  currentAppVersion: string;
  updateStatus: UpdateStatus;
  updateInfo: UpdateInfo | null;
  downloadProgress: number;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  clearTempStatus: "idle" | "cleaning" | "done" | "error";
  clearedResult: {
    freed_bytes: number;
    deleted_count: number;
    freed_formatted: string;
  } | null;
  onClearTempFiles: () => void;
  onTestNotification?: () => void;
  onClose: () => void;
  isLightMode?: boolean;
}

export const AdvancedTab: React.FC<AdvancedTabProps> = ({
  currentAppVersion,
  updateStatus,
  updateInfo,
  downloadProgress,
  onCheckUpdate,
  onInstallUpdate,
  clearTempStatus,
  clearedResult,
  onClearTempFiles,
  onTestNotification,
  isLightMode,
}) => {
  const light =
    isLightMode ??
    (typeof document !== "undefined" &&
      document.documentElement.classList.contains("light"));
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleResetAllSettings = async () => {
    if (!showResetConfirm) {
      setShowResetConfirm(true);
      return;
    }

    try {
      await resetAllAppSettings();
    } finally {
      window.location.reload();
    }
  };

  const updateSubtitle =
    updateStatus === "checking"
      ? t("settings_checking_update")
      : updateStatus === "available"
      ? `${t("settings_update_available")}: v${updateInfo?.version}`
      : updateStatus === "downloading"
      ? `${t("settings_update_downloading")} ${downloadProgress}%`
      : updateStatus === "installing"
      ? t("settings_update_installing")
      : updateStatus === "error"
      ? t("settings_update_error")
      : t("settings_adv_updates_desc", { version: currentAppVersion });

  const clearTempSubtitle =
    clearTempStatus === "cleaning"
      ? t("settings_clearing_temp")
      : clearTempStatus === "done" && clearedResult
      ? t("settings_clear_temp_done", {
          size: clearedResult.freed_formatted,
          count: clearedResult.deleted_count,
        })
      : clearTempStatus === "error"
      ? t("settings_clear_temp_error")
      : t("settings_adv_clear_temp_desc");

  const neutralBtnClass = light
    ? "px-3.5 py-1.5 rounded-full bg-black/[0.06] hover:bg-black/[0.1] text-neutral-800 text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-50"
    : "px-3.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-50";

  return (
    <div
      className={`w-full rounded-[18px] p-3 flex flex-col gap-0.5 ${
        light
          ? "bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
          : "bg-[#121318] border border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]"
      }`}
    >
      {/* 1. Pembaruan perangkat lunak */}
      <SettingRow
        isLightMode={light}
        icon={<RefreshCw size={18} className={updateStatus === "checking" ? "animate-spin" : ""} />}
        iconBgClass={light ? "bg-[#32ade6]/15" : "bg-[#13262d]"}
        iconColorClass={light ? "text-sky-600" : "text-[#64d2ff]"}
        title={t("settings_adv_updates")}
        subtitle={updateSubtitle}
        control={
          <button
            type="button"
            onClick={updateStatus === "available" ? onInstallUpdate : onCheckUpdate}
            disabled={updateStatus === "checking" || updateStatus === "downloading" || updateStatus === "installing"}
            className={neutralBtnClass}
          >
            {updateStatus === "available"
              ? t("settings_update_now")
              : t("settings_check_update")}
          </button>
        }
      />

      {/* 2. Bersihkan file sementara */}
      <SettingRow
        isLightMode={light}
        icon={<Trash2 size={18} />}
        iconBgClass={light ? "bg-amber-500/15" : "bg-[#2b2413]"}
        iconColorClass={light ? "text-amber-700" : "text-[#ffd60a]"}
        title={t("settings_adv_clear_temp")}
        subtitle={clearTempSubtitle}
        control={
          <button
            type="button"
            onClick={onClearTempFiles}
            disabled={clearTempStatus === "cleaning"}
            className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium flex items-center gap-1.5 border transition-colors cursor-pointer disabled:opacity-50 ${
              light
                ? "bg-amber-500/12 hover:bg-amber-500/20 text-amber-800 border-amber-500/25"
                : "bg-[#ffd60a]/10 hover:bg-[#ffd60a]/20 text-[#ffd60a] border-[#ffd60a]/20"
            }`}
          >
            <Trash2 size={13} />
            <span>
              {clearTempStatus === "cleaning"
                ? t("settings_clearing_temp")
                : t("settings_clear_temp_btn")}
            </span>
          </button>
        }
      />

      {/* 4. Uji notifikasi idle */}
      <SettingRow
        isLightMode={light}
        icon={<Send size={18} />}
        iconBgClass={light ? "bg-[#bf5af2]/12" : "bg-[#241c30]"}
        iconColorClass="text-[#bf5af2]"
        title={t("settings_adv_test_notif")}
        subtitle={t("settings_adv_test_notif_desc")}
        control={
          <button
            type="button"
            onClick={() => onTestNotification?.()}
            className={neutralBtnClass}
          >
            {t("settings_adv_test_notif_btn")}
          </button>
        }
      />

      {/* 5. Atur ulang semua pengaturan */}
      <SettingRow
        isLightMode={light}
        icon={<AlertTriangle size={18} />}
        iconBgClass={light ? "bg-[#ff453a]/12" : "bg-[#331616]"}
        iconColorClass="text-[#ff453a]"
        title={t("settings_adv_reset_all")}
        subtitle={t("settings_adv_reset_all_desc")}
        control={
          <button
            type="button"
            onClick={handleResetAllSettings}
            onMouseLeave={() => setShowResetConfirm(false)}
            className="px-3.5 py-1.5 rounded-full bg-[#ff453a]/15 hover:bg-[#ff453a]/25 text-[#ff453a] border border-[#ff453a]/25 text-[12px] font-medium transition-colors cursor-pointer"
          >
            {showResetConfirm ? t("settings_adv_reset_confirm") : t("settings_adv_reset_all_btn")}
          </button>
        }
      />
    </div>
  );
};
