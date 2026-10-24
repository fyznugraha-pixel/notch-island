import React, { useState } from "react";
import {
  RefreshCw,
  Trash2,
  RotateCcw,
  Send,
  AlertTriangle,
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { t } from "../../../services/i18n";
import { UpdateInfo, UpdateStatus } from "../../../services/updateService";

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
  onClose,
}) => {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleRestartOnboarding = () => {
    window.dispatchEvent(new CustomEvent("island_trigger_onboarding"));
    onClose();
  };

  const handleResetAllSettings = () => {
    if (!showResetConfirm) {
      setShowResetConfirm(true);
      return;
    }

    try {
      localStorage.removeItem("island_onboarding_completed");
      localStorage.removeItem("island_theme");
      localStorage.removeItem("island_idle_layout");
      localStorage.removeItem("island_font_size");
      localStorage.removeItem("island_tab_size");
      localStorage.removeItem("island_ears");
      localStorage.removeItem("island_transparency");
      localStorage.removeItem("island_auto_compact");
      localStorage.removeItem("island_show_greeting");
      localStorage.removeItem("island_close_delay");
    } catch {}

    window.location.reload();
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

  return (
    <div className="w-full rounded-[22px] bg-[#111114] border border-white/[0.06] p-2 flex flex-col justify-between shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      {/* 1. Pembaruan perangkat lunak */}
      <SettingRow
        icon={<RefreshCw size={18} className={updateStatus === "checking" ? "animate-spin" : ""} />}
        iconBgClass="bg-[#13262d]"
        iconColorClass="text-[#64d2ff]"
        title={t("settings_adv_updates")}
        subtitle={updateSubtitle}
        control={
          <button
            type="button"
            onClick={updateStatus === "available" ? onInstallUpdate : onCheckUpdate}
            disabled={updateStatus === "checking" || updateStatus === "downloading" || updateStatus === "installing"}
            className="px-3.5 py-1.5 rounded-full bg-[#1e1e24] hover:bg-[#282830] text-white text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {updateStatus === "available"
              ? t("settings_update_now")
              : t("settings_check_update")}
          </button>
        }
      />

      {/* 2. Bersihkan file sementara */}
      <SettingRow
        icon={<Trash2 size={18} />}
        iconBgClass="bg-[#2b2413]"
        iconColorClass="text-[#ffd60a]"
        title={t("settings_adv_clear_temp")}
        subtitle={clearTempSubtitle}
        control={
          <button
            type="button"
            onClick={onClearTempFiles}
            disabled={clearTempStatus === "cleaning"}
            className="px-3.5 py-1.5 rounded-full bg-[#ffd60a]/10 hover:bg-[#ffd60a]/20 text-[#ffd60a] border border-[#ffd60a]/20 text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
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

      {/* 3. Mulai ulang penyiapan awal */}
      <SettingRow
        icon={<RotateCcw size={18} />}
        iconBgClass="bg-[#142d2a]"
        iconColorClass="text-[#40c8ae]"
        title={t("settings_adv_restart_setup")}
        subtitle={t("settings_adv_restart_setup_desc")}
        control={
          <button
            type="button"
            onClick={handleRestartOnboarding}
            className="px-3.5 py-1.5 rounded-full bg-[#1e1e24] hover:bg-[#282830] text-white text-[12px] font-medium transition-colors cursor-pointer"
          >
            {t("settings_adv_restart_setup_btn")}
          </button>
        }
      />

      {/* 4. Uji notifikasi idle */}
      <SettingRow
        icon={<Send size={18} />}
        iconBgClass="bg-[#241c30]"
        iconColorClass="text-[#bf5af2]"
        title={t("settings_adv_test_notif")}
        subtitle={t("settings_adv_test_notif_desc")}
        control={
          <button
            type="button"
            onClick={() => onTestNotification?.()}
            className="px-3.5 py-1.5 rounded-full bg-[#1e1e24] hover:bg-[#282830] text-white text-[12px] font-medium transition-colors cursor-pointer"
          >
            {t("settings_adv_test_notif_btn")}
          </button>
        }
      />

      {/* 5. Atur ulang semua pengaturan */}
      <SettingRow
        icon={<AlertTriangle size={18} />}
        iconBgClass="bg-[#331616]"
        iconColorClass="text-[#ff453a]"
        title={t("settings_adv_reset_all")}
        subtitle={t("settings_adv_reset_all_desc")}
        control={
          <button
            type="button"
            onClick={handleResetAllSettings}
            onMouseLeave={() => setShowResetConfirm(false)}
            className="px-3.5 py-1.5 rounded-full bg-[#ff453a]/15 hover:bg-[#ff453a]/25 text-[#ff453a] border border-[#ff453a]/20 text-[12px] font-medium transition-colors cursor-pointer"
          >
            {showResetConfirm ? t("settings_adv_reset_confirm") : t("settings_adv_reset_all_btn")}
          </button>
        }
      />
    </div>
  );
};
