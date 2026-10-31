import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Bluetooth,
  ChevronLeft,
  RotateCw,
  ExternalLink,
  Check,
  Battery,
  Loader2,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { iosSpring } from "../../../utils/iosMotion";
import {
  fetchBluetoothStatus,
  toggleBluetoothState,
  BluetoothStatus,
} from "../../../services/connectivityService";
import { t } from "../../../services/i18n";

interface BluetoothSubmenuProps {
  onBack: () => void;
  initialEnabled: boolean;
  initialConnectedName: string;
  isLightMode?: boolean;
}

export const BluetoothSubmenu: React.FC<BluetoothSubmenuProps> = ({
  onBack,
  initialEnabled,
  initialConnectedName,
  isLightMode,
}) => {
  const activeIsLightMode =
    isLightMode ??
    (typeof document !== "undefined" && document.documentElement.classList.contains("light"));
  const [status, setStatus] = useState<BluetoothStatus>({
    enabled: initialEnabled,
    connected_name: initialConnectedName,
    devices:
      initialConnectedName &&
      initialConnectedName !== "Not Connected" &&
      initialConnectedName !== "Off"
        ? [
            {
              name: initialConnectedName.replace(/\s*\(.*?%\)$/, ""),
              is_connected: true,
              battery: null,
            },
          ]
        : [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchBluetoothStatus();
      setStatus(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleToggle = async (enable: boolean) => {
    setIsToggling(true);
    setStatus((prev) => ({ ...prev, enabled: enable }));
    try {
      await toggleBluetoothState(enable);
      setTimeout(() => {
        loadStatus();
      }, 700);
    } catch (err) {
      console.error(err);
      setStatus((prev) => ({ ...prev, enabled: !enable }));
    } finally {
      setIsToggling(false);
    }
  };

  const connectedDevices = status.devices.filter((d) => d.is_connected);
  const otherDevices = status.devices.filter((d) => !d.is_connected);

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={iosSpring.snappy}
      className={`absolute inset-0 w-full h-full flex flex-col px-6 py-0.5 select-none overflow-hidden ${
        activeIsLightMode ? "text-[#1d1d1f]" : "text-white"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 shrink-0 h-[26px]">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("cc_back")}
          className={`w-[26px] h-[26px] rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
            activeIsLightMode
              ? "bg-black/5 hover:bg-black/10 text-[#1d1d1f]"
              : "bg-[#17171c] hover:bg-[#23232a] text-[#e4e4e7]"
          }`}
        >
          <ChevronLeft size={15} />
        </button>

        <div className="text-[14.5px] font-semibold tracking-tight flex-1">{t("cc_bluetooth")}</div>

        <button
          type="button"
          role="switch"
          aria-checked={status.enabled}
          disabled={isToggling}
          onClick={() => handleToggle(!status.enabled)}
          className={`w-[40px] h-[22px] rounded-full p-[2px] flex items-center transition-colors cursor-pointer ${
            status.enabled
              ? "bg-[#3882F6] justify-end"
              : activeIsLightMode
              ? "bg-black/15 justify-start"
              : "bg-[#27272f] justify-start"
          }`}
        >
          <span className="w-[18px] h-[18px] rounded-full bg-white shadow-sm" />
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 min-h-0 flex flex-col pt-1.5 overflow-hidden">
        {!status.enabled ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-center p-2">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                activeIsLightMode ? "bg-black/5 text-neutral-400" : "bg-[#17171c] text-[#a1a1aa]"
              }`}
            >
              <Bluetooth size={18} />
            </div>
            <div>
              <p
                className={`text-[12.5px] font-semibold ${
                  activeIsLightMode ? "text-[#1d1d1f]" : "text-white"
                }`}
              >
                {t("cc_not_connected")}
              </p>
              <p
                className={`text-[10.5px] mt-0.5 ${
                  activeIsLightMode ? "text-neutral-500" : "text-[#a1a1aa]"
                }`}
              >
                {t("cc_searching")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggle(true)}
              className="mt-0.5 px-3 py-1 rounded-[10px] bg-[#3882F6] hover:bg-[#2563eb] text-white text-[11.5px] font-semibold transition-colors cursor-pointer"
            >
              Turn On
            </button>
          </div>
        ) : (
          <>
            {/* Connected Device Card */}
            {connectedDevices.length > 0 && (
              <div className="flex flex-col gap-1 shrink-0">
                {connectedDevices.map((dev) => (
                  <div
                    key={dev.name}
                    className={`h-[44px] rounded-[14px] px-2.5 flex items-center justify-between gap-2.5 ${
                      activeIsLightMode
                        ? "bg-blue-500/10 border border-blue-500/30"
                        : "bg-[rgba(56,130,246,0.16)] border border-[rgba(56,130,246,0.4)]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-[30px] h-[30px] rounded-full bg-[#3882F6] text-white flex items-center justify-center shrink-0">
                        <Bluetooth size={15} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span
                          className={`text-[12.5px] font-semibold leading-tight truncate ${
                            activeIsLightMode ? "text-[#1d1d1f]" : "text-white"
                          }`}
                        >
                          {dev.name}
                        </span>
                        <span
                          className={`text-[10.5px] flex items-center gap-1 ${
                            activeIsLightMode ? "text-blue-700" : "text-[#b4b4bd]"
                          }`}
                        >
                          <Check
                            size={11}
                            strokeWidth={2.6}
                            className={activeIsLightMode ? "text-blue-600" : "text-[#7fb0ff]"}
                          />
                          {t("cc_connected")}
                        </span>
                      </div>
                    </div>

                    {dev.battery !== null && dev.battery !== undefined && (
                      <div
                        className={`flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                          activeIsLightMode
                            ? "text-emerald-700 bg-emerald-50 border-emerald-300"
                            : "text-[#13FF00] bg-[#13FF00]/10 border-[#13FF00]/25"
                        }`}
                      >
                        <Battery size={12} />
                        <span>{dev.battery}%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Section Label */}
            <div className="flex items-center justify-between h-[22px] mt-1 px-1 shrink-0">
              <span
                className={`text-[10px] font-medium tracking-[0.06em] uppercase ${
                  activeIsLightMode ? "text-neutral-500" : "text-[#a1a1aa]"
                }`}
              >
                {t("cc_paired_devices")}
              </span>
              <button
                type="button"
                onClick={loadStatus}
                disabled={isLoading}
                className={`w-[22px] h-[22px] rounded-full flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 ${
                  activeIsLightMode
                    ? "text-neutral-500 hover:text-[#1d1d1f]"
                    : "text-[#a1a1aa] hover:text-white"
                }`}
              >
                <RotateCw size={12.5} className={isLoading ? "animate-spin text-[#3882F6]" : ""} />
              </button>
            </div>

            <div className="flex-1 min-h-0 relative overflow-hidden">
              <div className="h-full overflow-y-auto no-scrollbar flex flex-col gap-0.5 pb-4">
                {isLoading && otherDevices.length === 0 ? (
                  <div
                    className={`flex items-center justify-center py-4 gap-2 text-[11.5px] ${
                      activeIsLightMode ? "text-neutral-500" : "text-[#a1a1aa]"
                    }`}
                  >
                    <Loader2 size={13} className="animate-spin text-[#3882F6]" />
                    <span>{t("cc_searching")}</span>
                  </div>
                ) : otherDevices.length === 0 ? (
                  <div
                    className={`text-center py-4 text-[11.5px] ${
                      activeIsLightMode ? "text-neutral-500" : "text-[#a1a1aa]"
                    }`}
                  >
                    {t("cc_no_devices")}
                  </div>
                ) : (
                  otherDevices.map((dev) => (
                    <div
                      key={dev.name}
                      className={`h-[32px] rounded-[10px] px-2 flex items-center justify-between transition-colors select-none group ${
                        activeIsLightMode ? "hover:bg-black/5" : "hover:bg-[#15151a]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Bluetooth
                          size={14.5}
                          className={`shrink-0 ${
                            activeIsLightMode ? "text-neutral-600" : "text-[#e4e4e7]"
                          }`}
                        />
                        <span
                          className={`text-[12px] font-medium truncate ${
                            activeIsLightMode ? "text-[#1d1d1f]" : "text-white"
                          }`}
                        >
                          {dev.name}
                        </span>
                      </div>

                      {dev.battery !== null && dev.battery !== undefined && (
                        <div
                          className={`flex items-center gap-1 text-[11px] ${
                            activeIsLightMode ? "text-neutral-500" : "text-[#a1a1aa]"
                          }`}
                        >
                          <Battery size={12} />
                          <span>{dev.battery}%</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div
                className={`absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent pointer-events-none ${
                  activeIsLightMode ? "to-[#f6f6fa]" : "to-[#0c0c0e]"
                }`}
              />
            </div>
          </>
        )}
      </div>

      {/* Footer Link */}
      <button
        type="button"
        onClick={() => {
          invoke("system_power_action", { action: "bluetooth" }).catch(() => {
            openUrl("ms-settings:bluetooth").catch(console.error);
          });
        }}
        className={`h-[26px] self-start px-1 text-[11.5px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
          activeIsLightMode
            ? "text-neutral-500 hover:text-[#1d1d1f]"
            : "text-[#a1a1aa] hover:text-white"
        }`}
      >
        <span>{t("cc_bluetooth_settings")}</span>
        <ExternalLink size={11.5} />
      </button>
    </motion.div>
  );
};
