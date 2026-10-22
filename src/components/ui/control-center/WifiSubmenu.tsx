import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Wifi,
  WifiOff,
  Lock,
  ChevronLeft,
  RotateCw,
  ExternalLink,
  Check,
  Loader2,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { IosSwitch } from "../../ios/IosSwitch";
import { iosSpring } from "../../../utils/iosMotion";
import {
  fetchWifiStatus,
  toggleWifiState,
  connectToWifi,
  disconnectFromWifi,
  WifiStatus,
  WifiNetwork,
} from "../../../services/connectivityService";
import { t } from "../../../services/i18n";

interface WifiSubmenuProps {
  onBack: () => void;
  networkPing: number | null;
}

export const WifiSubmenu: React.FC<WifiSubmenuProps> = ({ onBack, networkPing }) => {
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [connectingSsid, setConnectingSsid] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchWifiStatus();
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
    try {
      await toggleWifiState(enable);
      setStatus((prev) => (prev ? { ...prev, enabled: enable } : null));
      setTimeout(() => {
        loadStatus();
      }, 700);
    } catch (err) {
      console.error(err);
    } finally {
      setIsToggling(false);
    }
  };

  const handleConnect = async (network: WifiNetwork) => {
    if (network.is_connected) return;

    if (!network.is_saved && network.is_secure) {
      // Unsaved secure network requires Windows credential flyout
      openUrl("ms-settings:network-wifi").catch(console.error);
      return;
    }

    setConnectingSsid(network.ssid);
    try {
      await connectToWifi(network.ssid);
      setTimeout(() => {
        loadStatus();
        setConnectingSsid(null);
      }, 1500);
    } catch (err) {
      console.error(err);
      setConnectingSsid(null);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectFromWifi();
      setTimeout(loadStatus, 500);
    } catch (err) {
      console.error(err);
    }
  };

  const connectedNetwork = status?.networks.find((n) => n.is_connected);
  const otherNetworks = status?.networks.filter((n) => !n.is_connected) || [];

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

        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-bold text-white tracking-tight">{t("cc_wifi")}</span>
          {networkPing !== null && status?.enabled && (
            <span className="text-[9px] font-mono text-neutral-300 bg-white/10 px-1 py-0.2 rounded flex items-center tracking-tighter">
              <span className="text-emerald-400 mr-1">●</span>
              {networkPing}ms
            </span>
          )}
        </div>

        <IosSwitch
          checked={status?.enabled ?? false}
          onChange={handleToggle}
          disabled={isToggling}
        />
      </div>

      {/* Body Content */}
      <div className="flex-1 min-h-0 flex flex-col py-2 overflow-y-auto no-scrollbar gap-2">
        {!status?.enabled ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-center p-4">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/40">
              <WifiOff size={22} />
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
            {/* Connected Network Card */}
            {connectedNetwork && (
              <div className="p-2.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(14,165,233,0.4)]">
                    <Wifi size={16} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12px] font-bold text-white truncate">
                      {connectedNetwork.ssid}
                    </span>
                    <span className="text-[10px] text-sky-300 font-medium flex items-center gap-1">
                      <Check size={11} strokeWidth={2.5} />
                      {t("cc_connected")}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-rose-500/20 text-white/80 hover:text-rose-300 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  {t("cc_disconnect")}
                </button>
              </div>
            )}

            {/* Other Available Networks */}
            <div className="flex items-center justify-between px-1 pt-1 shrink-0">
              <span className="text-[10.5px] font-semibold text-white/40 uppercase tracking-wider">
                {t("cc_other_networks")}
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
              {isLoading && otherNetworks.length === 0 ? (
                <div className="flex items-center justify-center py-6 gap-2 text-white/40 text-[12px]">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{t("cc_searching")}</span>
                </div>
              ) : otherNetworks.length === 0 ? (
                <div className="text-center py-6 text-white/40 text-[12px]">
                  {t("cc_no_networks")}
                </div>
              ) : (
                otherNetworks.map((net) => {
                  const isConnecting = connectingSsid === net.ssid;
                  return (
                    <button
                      key={net.ssid}
                      type="button"
                      onClick={() => handleConnect(net)}
                      disabled={isConnecting}
                      className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.07] active:bg-white/[0.12] transition-colors cursor-pointer text-left select-none group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Wifi size={15} className="text-white/60 shrink-0 group-hover:text-white" />
                        <span className="text-[12px] font-medium text-white/90 group-hover:text-white truncate">
                          {net.ssid}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 text-white/40">
                        {net.is_secure && <Lock size={12} />}
                        {net.is_saved && (
                          <span className="text-[9px] bg-white/10 px-1 py-0.5 rounded text-white/60">
                            Saved
                          </span>
                        )}
                        {isConnecting ? (
                          <Loader2 size={13} className="animate-spin text-sky-400 ml-1" />
                        ) : (
                          <span className="text-[11px] text-sky-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                            {t("cc_connect")}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer: Windows Wi-Fi Settings Link */}
      <div className="pt-2 border-t border-white/10 shrink-0 flex items-center justify-between">
        <button
          type="button"
          onClick={() => openUrl("ms-settings:network-wifi").catch(console.error)}
          className="flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white transition-colors cursor-pointer group"
        >
          <span>{t("cc_wifi_settings")}</span>
          <ExternalLink size={12} className="opacity-60 group-hover:opacity-100" />
        </button>
      </div>
    </motion.div>
  );
};
