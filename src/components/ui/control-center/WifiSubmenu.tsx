import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wifi,
  WifiOff,
  Lock,
  ChevronLeft,
  RotateCw,
  ExternalLink,
  Check,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { iosSpring } from "../../../utils/iosMotion";
import {
  fetchWifiStatus,
  toggleWifiState,
  connectToWifi,
  connectToWifiWithPassword,
  disconnectFromWifi,
  WifiStatus,
  WifiNetwork,
} from "../../../services/connectivityService";
import { t } from "../../../services/i18n";

interface WifiSubmenuProps {
  onBack: () => void;
  networkPing: number | null;
  initialEnabled: boolean;
  initialConnectedSsid: string;
}

export const WifiSubmenu: React.FC<WifiSubmenuProps> = ({
  onBack,
  networkPing,
  initialEnabled,
  initialConnectedSsid,
}) => {
  const [status, setStatus] = useState<WifiStatus>({
    enabled: initialEnabled,
    connected_ssid: initialConnectedSsid,
    networks: initialConnectedSsid
      ? [
          {
            ssid: initialConnectedSsid,
            signal: 85,
            is_connected: true,
            is_secure: true,
            is_saved: true,
          },
        ]
      : [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [connectingSsid, setConnectingSsid] = useState<string | null>(null);

  const [passwordSsid, setPasswordSsid] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (passwordSsid && passwordInputRef.current) {
      passwordInputRef.current.focus();
    }
  }, [passwordSsid]);

  const handleToggle = async (enable: boolean) => {
    setIsToggling(true);
    setStatus((prev) => ({ ...prev, enabled: enable }));
    setPasswordSsid(null);
    try {
      await toggleWifiState(enable);
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

  const handleConnect = async (network: WifiNetwork) => {
    if (network.is_connected) return;

    if (!network.is_saved && network.is_secure) {
      if (passwordSsid === network.ssid) {
        setPasswordSsid(null);
      } else {
        setPasswordSsid(network.ssid);
        setPasswordInput("");
        setShowPassword(false);
        setPasswordError(null);
      }
      return;
    }

    setPasswordSsid(null);
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

  const handleSubmitPassword = async (ssid: string) => {
    if (!passwordInput.trim()) return;

    setConnectingSsid(ssid);
    setPasswordError(null);
    try {
      await connectToWifiWithPassword(ssid, passwordInput.trim());
      setPasswordSsid(null);
      setPasswordInput("");
      setTimeout(() => {
        loadStatus();
        setConnectingSsid(null);
      }, 1500);
    } catch (err) {
      console.error(err);
      setPasswordError(t("cc_connect_failed"));
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

  const connectedNetwork =
    status.networks.find((n) => n.is_connected) ||
    (status.connected_ssid
      ? {
          ssid: status.connected_ssid,
          signal: 85,
          is_connected: true,
          is_secure: true,
          is_saved: true,
        }
      : null);
  const otherNetworks = status.networks.filter(
    (n) => !n.is_connected && n.ssid !== status.connected_ssid
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={iosSpring.snappy}
      className="absolute inset-0 w-full h-full flex flex-col px-6 py-1.5 select-none text-white overflow-hidden"
    >
      {/* Header: Back circle + Title + Switch (Board 05) */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("cc_back")}
          className="w-[30px] h-[30px] rounded-full bg-[#17171c] hover:bg-[#23232a] text-[#e4e4e7] flex items-center justify-center transition-colors cursor-pointer shrink-0"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="text-[16px] font-semibold tracking-tight flex-1">{t("cc_wifi")}</div>

        <button
          type="button"
          role="switch"
          aria-checked={status.enabled}
          disabled={isToggling}
          onClick={() => handleToggle(!status.enabled)}
          className={`w-[44px] h-[26px] rounded-full p-[2px] flex items-center transition-colors cursor-pointer ${
            status.enabled ? "bg-[#3882F6] justify-end" : "bg-[#27272f] justify-start"
          }`}
        >
          <span className="w-[22px] h-[22px] rounded-full bg-white shadow-sm" />
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 min-h-0 flex flex-col pt-2.5 overflow-hidden">
        {!status.enabled ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-center p-4">
            <div className="w-12 h-12 rounded-full bg-[#17171c] flex items-center justify-center text-[#a1a1aa]">
              <WifiOff size={22} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-white">{t("cc_not_connected")}</p>
              <p className="text-[11px] text-[#a1a1aa] mt-0.5">{t("cc_searching")}</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggle(true)}
              className="mt-1 px-3.5 py-1.5 rounded-[11px] bg-[#3882F6] hover:bg-[#2563eb] text-white text-[12px] font-semibold transition-colors cursor-pointer"
            >
              Turn On
            </button>
          </div>
        ) : (
          <>
            {/* Connected Network Card (Board 05) */}
            {connectedNetwork && (
              <div className="h-[58px] rounded-[18px] px-3 flex items-center gap-3 bg-[rgba(56,130,246,0.16)] border border-[rgba(56,130,246,0.4)] shrink-0">
                <div className="w-[38px] h-[38px] rounded-full bg-[#3882F6] text-white flex items-center justify-center shrink-0">
                  <Wifi size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-white truncate">
                    {connectedNetwork.ssid}
                  </div>
                  <div className="text-[11.5px] text-[#b4b4bd] flex items-center gap-1.5 tabular-nums truncate">
                    <Check size={12} strokeWidth={2.6} className="text-[#7fb0ff] shrink-0" />
                    <span className="truncate">
                      {t("cc_connected")} · {t("cc_strong_signal")}
                      {networkPing !== null ? ` · ${networkPing} ms` : ""}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="h-[32px] px-3 rounded-[11px] border border-[#3a3a43] bg-transparent hover:bg-white/[0.06] text-[#e4e4e7] text-[11.5px] font-medium transition-colors cursor-pointer shrink-0"
                >
                  {t("cc_disconnect")}
                </button>
              </div>
            )}

            {/* Section Label */}
            <div className="flex items-center justify-between h-[28px] mt-2 px-1 shrink-0">
              <span className="text-[10.5px] font-medium tracking-[0.06em] text-[#a1a1aa] uppercase">
                {t("cc_other_networks")}
              </span>
              <button
                type="button"
                onClick={loadStatus}
                disabled={isLoading}
                className="w-[26px] h-[26px] rounded-full text-[#a1a1aa] hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
              >
                <RotateCw size={13.5} className={isLoading ? "animate-spin text-[#3882F6]" : ""} />
              </button>
            </div>

            {/* Network List with Bottom Fade */}
            <div className="flex-1 min-h-0 relative overflow-hidden">
              <div className="h-full overflow-y-auto no-scrollbar flex flex-col gap-0.5 pb-6">
                {isLoading && otherNetworks.length === 0 ? (
                  <div className="flex items-center justify-center py-6 gap-2 text-[#a1a1aa] text-[12px]">
                    <Loader2 size={14} className="animate-spin text-[#3882F6]" />
                    <span>{t("cc_searching")}</span>
                  </div>
                ) : otherNetworks.length === 0 ? (
                  <div className="text-center py-6 text-[#a1a1aa] text-[12px]">
                    {t("cc_no_networks")}
                  </div>
                ) : (
                  otherNetworks.map((net) => {
                    const isConnecting = connectingSsid === net.ssid;
                    const isPasswordOpen = passwordSsid === net.ssid;

                    return (
                      <div
                        key={net.ssid}
                        className={`flex flex-col rounded-[12px] transition-colors ${
                          isPasswordOpen ? "bg-[#15151a] p-1.5" : ""
                        }`}
                      >
                        <div
                          onClick={() => handleConnect(net)}
                          className="h-[38px] rounded-[12px] px-2.5 flex items-center gap-2.5 hover:bg-[#15151a] transition-colors cursor-pointer select-none group"
                        >
                          <Wifi size={16} className="text-[#e4e4e7] shrink-0" />
                          <span className="flex-1 text-[13px] font-medium text-white truncate">
                            {net.ssid}
                          </span>

                          {net.is_saved && (
                            <span className="text-[10.5px] text-[#c4c4cc] bg-[#23232a] rounded-[6px] px-1.5 py-0.5 shrink-0">
                              {t("cc_saved_badge")}
                            </span>
                          )}

                          {net.is_secure && <Lock size={13} className="text-[#a1a1aa] shrink-0" />}

                          {isConnecting ? (
                            <Loader2 size={13} className="animate-spin text-[#3882F6] shrink-0" />
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleConnect(net);
                              }}
                              className="hidden group-hover:inline-flex items-center justify-center h-[26px] px-2.5 rounded-[8px] bg-[#3882F6] hover:bg-[#2563eb] text-white text-[11.5px] font-semibold transition-all shrink-0 cursor-pointer"
                            >
                              {t("cc_connect")}
                            </button>
                          )}
                        </div>

                        <AnimatePresence>
                          {isPasswordOpen && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={iosSpring.snappy}
                              className="flex flex-col gap-2 pt-1.5 pb-1 px-1 overflow-hidden"
                            >
                              <div className="relative flex items-center">
                                <KeyRound
                                  size={13}
                                  className="absolute left-2.5 text-[#a1a1aa] pointer-events-none"
                                />
                                <input
                                  ref={passwordInputRef}
                                  type={showPassword ? "text" : "password"}
                                  value={passwordInput}
                                  onChange={(e) => setPasswordInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleSubmitPassword(net.ssid);
                                    } else if (e.key === "Escape") {
                                      setPasswordSsid(null);
                                    }
                                  }}
                                  placeholder={t("cc_password_placeholder")}
                                  className="w-full bg-[#0c0c10] border border-[#2a2a33] focus:border-[#3882F6] rounded-[10px] pl-8 pr-8 py-1.5 text-[12px] text-white placeholder-[#71717a] outline-none transition-colors"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPassword(!showPassword)}
                                  className="absolute right-2.5 text-[#a1a1aa] hover:text-white transition-colors cursor-pointer"
                                >
                                  {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                              </div>

                              {passwordError && (
                                <span className="text-[10.5px] text-rose-400 font-medium pl-1">
                                  {passwordError}
                                </span>
                              )}

                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPasswordSsid(null)}
                                  className="px-2.5 py-1 rounded-[8px] text-[#a1a1aa] hover:text-white text-[11px] font-medium transition-colors cursor-pointer"
                                >
                                  {t("cc_cancel")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSubmitPassword(net.ssid)}
                                  disabled={isConnecting || !passwordInput.trim()}
                                  className="px-3 py-1 rounded-[8px] bg-[#3882F6] hover:bg-[#2563eb] disabled:opacity-40 text-white text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                                >
                                  {isConnecting && <Loader2 size={11} className="animate-spin" />}
                                  <span>{t("cc_connect")}</span>
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-black pointer-events-none" />
            </div>
          </>
        )}
      </div>

      {/* Footer Link */}
      <button
        type="button"
        onClick={() => openUrl("ms-settings:network-wifi").catch(console.error)}
        className="h-[26px] self-start px-1 text-[#a1a1aa] hover:text-white text-[11.5px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
      >
        <span>{t("cc_wifi_settings")}</span>
        <ExternalLink size={11.5} />
      </button>
    </motion.div>
  );
};
