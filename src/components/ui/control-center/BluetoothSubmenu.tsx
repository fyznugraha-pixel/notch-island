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
import { IosSwitch } from "../../ios/IosSwitch";
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
}

export const BluetoothSubmenu: React.FC<BluetoothSubmenuProps> = ({
  onBack,
  initialEnabled,
  initialConnectedName,
}) => {
  const [status, setStatus] = useState<BluetoothStatus>({
    enabled: initialEnabled,
    connected_name: initialConnectedName,
    devices: initialConnectedName && initialConnectedName !== "Not Connected" && initialConnectedName !== "Off"
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
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={iosSpring.snappy}
      className="absolute inset-0 w-full h-full flex flex-col p-3 bg-[#161618] rounded-[26px] select-none text-white overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-[13px] font-medium text-sky-400 hover:text-sky-300 transition-colors cursor-pointer group"
        >
          <ChevronLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
          <span>{t("cc_back")}</span>
        </button>

        <span className="text-[13px] font-bold text-white tracking-tight">{t("cc_bluetooth")}</span>

        <IosSwitch
          checked={status.enabled}
          onChange={handleToggle}
          disabled={isToggling}
        />
      </div>

      {/* Body Content */}
      <div className="flex-1 min-h-0 flex flex-col py-2 overflow-y-auto no-scrollbar gap-2">
        {!status.enabled ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-center p-4">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/40">
              <Bluetooth size={22} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-white/80">{t("cc_not_connected")}</p>
              <p className="text-[11px] text-white/40 mt-0.5">{t("cc_searching")}</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggle(true)}
              className="mt-1 px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 text-[12px] font-medium transition-colors cursor-pointer"
            >
              Turn On
            </button>
          </div>
        ) : (
          <>
            {/* Connected Device Card */}
            {connectedDevices.length > 0 && (
              <div className="flex flex-col gap-1.5 shrink-0">
                {connectedDevices.map((dev) => (
                  <div
                    key={dev.name}
                    className="p-2.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(14,165,233,0.4)]">
                        <Bluetooth size={16} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[12px] font-bold text-white truncate">
                          {dev.name}
                        </span>
                        <span className="text-[10px] text-sky-300 font-medium flex items-center gap-1">
                          <Check size={11} strokeWidth={2.5} />
                          {t("cc_connected")}
                        </span>
                      </div>
                    </div>

                    {dev.battery !== null && dev.battery !== undefined && (
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <Battery size={13} />
                        <span>{dev.battery}%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Other Paired Devices */}
            <div className="flex items-center justify-between px-1 pt-1 shrink-0">
              <span className="text-[10.5px] font-semibold text-white/40 uppercase tracking-wider">
                {t("cc_paired_devices")}
              </span>
              <button
                type="button"
                onClick={loadStatus}
                disabled={isLoading}
                className="text-white/40 hover:text-white/80 transition-colors p-1 rounded-lg cursor-pointer disabled:opacity-40"
              >
                <RotateCw size={12} className={isLoading ? "animate-spin text-sky-400" : ""} />
              </button>
            </div>

            <div className="flex flex-col gap-1 min-h-0">
              {isLoading && otherDevices.length === 0 ? (
                <div className="flex items-center justify-center py-6 gap-2 text-white/40 text-[12px]">
                  <Loader2 size={14} className="animate-spin text-sky-400" />
                  <span>{t("cc_searching")}</span>
                </div>
              ) : otherDevices.length === 0 ? (
                <div className="text-center py-6 text-white/40 text-[12px]">
                  {t("cc_no_devices")}
                </div>
              ) : (
                otherDevices.map((dev) => (
                  <div
                    key={dev.name}
                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.07] transition-colors select-none group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Bluetooth size={15} className="text-white/60 shrink-0 group-hover:text-white" />
                      <span className="text-[12px] font-medium text-white/90 group-hover:text-white truncate">
                        {dev.name}
                      </span>
                    </div>

                    {dev.battery !== null && dev.battery !== undefined && (
                      <div className="flex items-center gap-1 text-[10px] text-white/50">
                        <Battery size={12} />
                        <span>{dev.battery}%</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer: Windows Bluetooth Settings Link */}
      <div className="pt-2 border-t border-white/10 shrink-0 flex items-center justify-between">
        <button
          type="button"
          onClick={() => openUrl("ms-settings:bluetooth").catch(console.error)}
          className="flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white transition-colors cursor-pointer group"
        >
          <span>{t("cc_bluetooth_settings")}</span>
          <ExternalLink size={12} className="opacity-60 group-hover:opacity-100" />
        </button>
      </div>
    </motion.div>
  );
};
