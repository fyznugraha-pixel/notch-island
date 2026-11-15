import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Wifi,
  Bluetooth,
  Bell,
  Radio,
  Sun,
  Volume2,
  Settings,
  Zap,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { getDndStatus, setDndStatus } from "../../../services/notificationHistoryService";
import { hexToRgba } from "../../../services/navbarConfigService";
import {
  useTaskbarLang,
  tx,
  type DockPosition,
} from "../../../services/taskbarI18n";
import {
  useNavbarLightMode,
  getInlineFlyoutPositionClass,
  getInlineFlyoutMotionOffset,
} from "../navbarThemeUtils";

interface NavbarControlCenterFlyoutProps {
  onClose: () => void;
  accentColor?: string;
  position?: DockPosition;
  isLightMode?: boolean;
}

interface WifiStatusResult {
  enabled: boolean;
  connected_ssid: string;
}

interface BluetoothStatusResult {
  enabled: boolean;
  connected_name: string;
}

export const NavbarControlCenterFlyout: React.FC<NavbarControlCenterFlyoutProps> = ({
  onClose,
  accentColor = "#3882F6",
  position = "bottom",
  isLightMode: isLightModeProp,
}) => {
  const lang = useTaskbarLang();
  const isLightMode = useNavbarLightMode(isLightModeProp);

  const [wifiEnabled, setWifiEnabled] = useState(true);
  const [wifiLoaded, setWifiLoaded] = useState(false);
  const [wifiFailed, setWifiFailed] = useState(false);
  const [wifiSsid, setWifiSsid] = useState("");

  const [btEnabled, setBtEnabled] = useState(false);
  const [btLoaded, setBtLoaded] = useState(false);
  const [btFailed, setBtFailed] = useState(false);
  const [btDeviceName, setBtDeviceName] = useState("");

  const [isDnd, setIsDnd] = useState<boolean>(() => getDndStatus());
  const [isHotspotOn, setIsHotspotOn] = useState(false);
  const focusModeLabel = isDnd
    ? tx(lang, "Do Not Disturb", "Jangan Ganggu")
    : "Normal";

  const [brightness, setBrightness] = useState(64);
  const [volume, setVolume] = useState(50);

  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState(true);

  const flyoutRef = useRef<HTMLDivElement>(null);
  const isDraggingBrightness = useRef(false);
  const isDraggingVolume = useRef(false);

  // 1. Fetch live system statuses
  const fetchStatus = useCallback(() => {
    // Wi-Fi
    invoke<WifiStatusResult>("get_wifi_status")
      .then((res) => {
        if (res) {
          setWifiEnabled(res.enabled);
          setWifiSsid(res.connected_ssid || "");
          setWifiFailed(false);
          setWifiLoaded(true);
        }
      })
      .catch(() => {
        setWifiFailed(true);
        setWifiLoaded(true);
      });

    // Bluetooth
    invoke<BluetoothStatusResult>("get_bluetooth_status")
      .then((res) => {
        if (res) {
          setBtEnabled(res.enabled);
          setBtDeviceName(res.connected_name || "");
          setBtFailed(false);
          setBtLoaded(true);
        }
      })
      .catch(() => {
        setBtFailed(true);
        setBtLoaded(true);
      });

    // Hotspot
    invoke<boolean>("get_hotspot_status")
      .then((res) => {
        setIsHotspotOn(!!res);
      })
      .catch(() => {});

    // Brightness
    invoke<number>("get_brightness")
      .then((val) => {
        if (typeof val === "number" && !isNaN(val)) {
          setBrightness(Math.max(0, Math.min(100, Math.round(val))));
        }
      })
      .catch(() => {});

    // Volume
    invoke<number>("get_master_volume")
      .then((vol) => {
        if (typeof vol === "number" && !isNaN(vol)) {
          setVolume(Math.max(0, Math.min(100, Math.round(vol * 100))));
        }
      })
      .catch(() => {});

    // Battery
    invoke<[boolean, number] | null>("get_battery_status")
      .then((res) => {
        if (res && typeof res[1] === "number") {
          setIsCharging(res[0]);
          setBatteryPercent(res[1]);
        } else {
          setBatteryPercent(null); // Desktop PC / AC Power
        }
      })
      .catch(() => {
        setBatteryPercent(null);
      });
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Click outside / Escape listener that does NOT intercept clicks on the dock trigger button
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (flyoutRef.current && flyoutRef.current.contains(target)) {
        return;
      }
      // If clicked on any flyout trigger button on the dock, let the trigger toggle it closed!
      if (target?.closest('[data-flyout-trigger="control_center"]')) {
        return;
      }
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handleDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Handlers
  const handleToggleWifi = async () => {
    const next = !wifiEnabled;
    setWifiEnabled(next);
    try {
      await invoke("toggle_wifi", { enable: next });
      setTimeout(fetchStatus, 800);
    } catch {}
  };

  const handleToggleBt = async () => {
    const next = !btEnabled;
    setBtEnabled(next);
    try {
      await invoke("toggle_bluetooth", { enable: next });
      setTimeout(fetchStatus, 800);
    } catch {}
  };

  const handleToggleHotspot = async () => {
    const next = !isHotspotOn;
    setIsHotspotOn(next);
    try {
      await invoke("toggle_hotspot", { enable: next });
      setTimeout(fetchStatus, 800);
    } catch {}
  };

  const handleToggleMode = () => {
    const next = !isDnd;
    setIsDnd(next);
    setDndStatus(next);
    invoke("set_windows_dnd", { enabled: next }).catch(() => {});
  };

  const handleBrightnessChange = (val: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    setBrightness(clamped);
    invoke("set_brightness", { level: clamped }).catch(() => {});
  };

  const handleVolumeChange = (val: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    setVolume(clamped);
    invoke("set_master_volume", { level: clamped / 100 }).catch(() => {});
  };

  const handleOpenSettings = async () => {
    try {
      await invoke("open_settings_window", { section: "navbar" });
      onClose();
    } catch {}
  };

  // Slider Scrubbing Handlers
  const handleBrightnessPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingBrightness.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    handleBrightnessChange((clickX / rect.width) * 100);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleBrightnessPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingBrightness.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    handleBrightnessChange((clickX / rect.width) * 100);
  };

  const handleBrightnessPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingBrightness.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleVolumePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingVolume.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    handleVolumeChange((clickX / rect.width) * 100);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleVolumePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingVolume.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    handleVolumeChange((clickX / rect.width) * 100);
  };

  const handleVolumePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingVolume.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const loadingLabel = tx(lang, "Loading...", "Memuat...");
  const wifiSubtitle = !wifiLoaded
    ? loadingLabel
    : wifiFailed
    ? tx(lang, "Disconnected", "Tidak terhubung")
    : wifiEnabled
    ? wifiSsid || tx(lang, "Connected", "Terhubung")
    : tx(lang, "Off", "Nonaktif");

  const btSubtitle = !btLoaded
    ? loadingLabel
    : btFailed
    ? tx(lang, "Disconnected", "Tidak terhubung")
    : btEnabled
    ? btDeviceName || tx(lang, "Active", "Aktif")
    : tx(lang, "Disconnected", "Tidak terhubung");

  const motionInitial = getInlineFlyoutMotionOffset(position);
  const placementClass = getInlineFlyoutPositionClass(
    position,
    "right-12",
    "bottom-4"
  );

  const inactiveTileClass = isLightMode
    ? "bg-zinc-100/90 border border-black/[0.06] hover:bg-zinc-200/80"
    : "bg-[#18181f] border border-transparent hover:bg-[#202028]";

  const inactiveBadgeClass = isLightMode
    ? "bg-black/[0.08] text-zinc-700"
    : "bg-[#25252e] text-white/50";

  return (
    <motion.div
      ref={flyoutRef}
      data-navbar-flyout="true"
      data-module-popover="true"
      initial={motionInitial}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={motionInitial}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        borderColor: isLightMode ? "rgba(0,0,0,0.1)" : hexToRgba(accentColor, 0.22),
        boxShadow: isLightMode
          ? `0 20px 44px rgba(15,23,42,0.16), 0 0 0 1px ${hexToRgba(accentColor, 0.14)}`
          : `0 24px 50px rgba(0,0,0,0.85), inset 0 1px 0 ${hexToRgba(accentColor, 0.35)}, 0 0 0 1px ${hexToRgba(accentColor, 0.18)}, 0 8px 30px ${hexToRgba(accentColor, 0.1)}`,
      }}
      className={`absolute ${placementClass} w-[340px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto p-3.5 rounded-[22px] border backdrop-blur-2xl select-none pointer-events-auto z-50 flex flex-col gap-2.5 ${
        isLightMode ? "bg-white/95 text-zinc-900" : "bg-[#0c0c10] text-white"
      }`}
    >
      {/* 2x2 Toggle Tiles */}
      <div className="grid grid-cols-2 gap-2">
        {/* Wi-Fi Tile */}
        <button
          type="button"
          onClick={handleToggleWifi}
          style={{
            backgroundColor: wifiEnabled ? hexToRgba(accentColor, 0.16) : undefined,
            borderColor: wifiEnabled ? hexToRgba(accentColor, 0.45) : undefined,
          }}
          className={`h-[56px] rounded-[16px] px-3 flex items-center gap-2.5 transition-all cursor-pointer text-left ${
            wifiEnabled ? "border" : inactiveTileClass
          }`}
        >
          <div
            style={{
              backgroundColor: wifiEnabled ? accentColor : undefined,
              boxShadow: wifiEnabled ? `0 0 12px ${hexToRgba(accentColor, 0.45)}` : undefined,
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              wifiEnabled ? "text-[#ffffff] shadow-sm" : inactiveBadgeClass
            }`}
          >
            <Wifi size={17} strokeWidth={2.2} />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className={`font-semibold text-[13px] leading-tight ${
                isLightMode ? "text-zinc-900" : "text-white"
              }`}
            >
              Wi-Fi
            </span>
            <span
              className={`text-[11px] truncate leading-tight mt-0.5 ${
                isLightMode ? "text-zinc-600" : "text-white/50"
              }`}
            >
              {wifiSubtitle}
            </span>
          </div>
        </button>

        {/* Bluetooth Tile */}
        <button
          type="button"
          onClick={handleToggleBt}
          style={{
            backgroundColor: btEnabled ? hexToRgba(accentColor, 0.16) : undefined,
            borderColor: btEnabled ? hexToRgba(accentColor, 0.45) : undefined,
          }}
          className={`h-[56px] rounded-[16px] px-3 flex items-center gap-2.5 transition-all cursor-pointer text-left ${
            btEnabled ? "border" : inactiveTileClass
          }`}
        >
          <div
            style={{
              backgroundColor: btEnabled ? accentColor : undefined,
              boxShadow: btEnabled ? `0 0 12px ${hexToRgba(accentColor, 0.45)}` : undefined,
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              btEnabled ? "text-[#ffffff] shadow-sm" : inactiveBadgeClass
            }`}
          >
            <Bluetooth size={17} strokeWidth={2.2} />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className={`font-semibold text-[13px] leading-tight ${
                isLightMode ? "text-zinc-900" : "text-white"
              }`}
            >
              Bluetooth
            </span>
            <span
              className={`text-[11px] truncate leading-tight mt-0.5 ${
                isLightMode ? "text-zinc-600" : "text-white/50"
              }`}
            >
              {btSubtitle}
            </span>
          </div>
        </button>

        {/* Focus Mode Tile */}
        <button
          type="button"
          onClick={handleToggleMode}
          style={{
            backgroundColor: isDnd ? hexToRgba(accentColor, 0.16) : undefined,
            borderColor: isDnd ? hexToRgba(accentColor, 0.45) : undefined,
          }}
          className={`h-[56px] rounded-[16px] px-3 flex items-center gap-2.5 transition-all cursor-pointer text-left ${
            isDnd ? "border" : inactiveTileClass
          }`}
        >
          <div
            style={{
              backgroundColor: isDnd ? accentColor : undefined,
              boxShadow: isDnd ? `0 0 12px ${hexToRgba(accentColor, 0.45)}` : undefined,
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              isDnd ? "text-[#ffffff] shadow-sm" : inactiveBadgeClass
            }`}
          >
            <Bell size={17} strokeWidth={2} />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className={`font-semibold text-[13px] leading-tight ${
                isLightMode ? "text-zinc-900" : "text-white"
              }`}
            >
              {tx(lang, "Focus", "Mode")}
            </span>
            <span
              className={`text-[11px] truncate leading-tight mt-0.5 ${
                isLightMode ? "text-zinc-600" : "text-white/50"
              }`}
            >
              {focusModeLabel}
            </span>
          </div>
        </button>

        {/* Hotspot Tile */}
        <button
          type="button"
          onClick={handleToggleHotspot}
          style={{
            backgroundColor: isHotspotOn ? hexToRgba(accentColor, 0.16) : undefined,
            borderColor: isHotspotOn ? hexToRgba(accentColor, 0.45) : undefined,
          }}
          className={`h-[56px] rounded-[16px] px-3 flex items-center gap-2.5 transition-all cursor-pointer text-left ${
            isHotspotOn ? "border" : inactiveTileClass
          }`}
        >
          <div
            style={{
              backgroundColor: isHotspotOn ? accentColor : undefined,
              boxShadow: isHotspotOn ? `0 0 12px ${hexToRgba(accentColor, 0.45)}` : undefined,
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              isHotspotOn ? "text-[#ffffff] shadow-sm" : inactiveBadgeClass
            }`}
          >
            <Radio size={16} strokeWidth={2.2} />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className={`font-semibold text-[13px] leading-tight ${
                isLightMode ? "text-zinc-900" : "text-white"
              }`}
            >
              Hotspot
            </span>
            <span
              className={`text-[11px] truncate leading-tight mt-0.5 ${
                isLightMode ? "text-zinc-600" : "text-white/50"
              }`}
            >
              {isHotspotOn ? tx(lang, "Active", "Aktif") : tx(lang, "Off", "Nonaktif")}
            </span>
          </div>
        </button>
      </div>

      {/* Sliders */}
      <div className="flex flex-col gap-2 pt-0.5">
        {/* Brightness Slider */}
        <div className="flex items-center gap-3">
          <div
            role="slider"
            tabIndex={0}
            aria-label={tx(lang, "Display brightness", "Kecerahan layar")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={brightness}
            onPointerDown={handleBrightnessPointerDown}
            onPointerMove={handleBrightnessPointerMove}
            onPointerUp={handleBrightnessPointerUp}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                handleBrightnessChange(brightness + 5);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                handleBrightnessChange(brightness - 5);
              }
            }}
            className={`relative flex-1 h-[38px] rounded-[12px] overflow-hidden flex items-center cursor-pointer select-none group touch-none ${
              isLightMode ? "bg-zinc-200/90" : "bg-[#18181f]"
            }`}
          >
            <div
              style={{
                width: `${brightness}%`,
                backgroundColor: accentColor,
                boxShadow: `0 0 12px ${hexToRgba(accentColor, 0.4)}`,
              }}
              className="absolute left-0 top-0 bottom-0 rounded-[12px] transition-all duration-75"
            />
            <Sun
              size={17}
              className={`relative z-10 ml-3 pointer-events-none ${
                brightness > 16
                  ? "text-[#ffffff] drop-shadow"
                  : isLightMode
                  ? "text-zinc-700"
                  : "text-white/85"
              }`}
            />
          </div>
          <span
            className={`w-10 text-right text-[13px] font-semibold tabular-nums ${
              isLightMode ? "text-zinc-900" : "text-white"
            }`}
          >
            {brightness}%
          </span>
        </div>

        {/* Volume Slider */}
        <div className="flex items-center gap-3">
          <div
            role="slider"
            tabIndex={0}
            aria-label={tx(lang, "Master volume", "Volume utama")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={volume}
            onPointerDown={handleVolumePointerDown}
            onPointerMove={handleVolumePointerMove}
            onPointerUp={handleVolumePointerUp}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                handleVolumeChange(volume + 5);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                handleVolumeChange(volume - 5);
              }
            }}
            className={`relative flex-1 h-[38px] rounded-[12px] overflow-hidden flex items-center cursor-pointer select-none group touch-none ${
              isLightMode ? "bg-zinc-200/90" : "bg-[#18181f]"
            }`}
          >
            <div
              style={{
                width: `${volume}%`,
                backgroundColor: accentColor,
                boxShadow: `0 0 12px ${hexToRgba(accentColor, 0.4)}`,
              }}
              className="absolute left-0 top-0 bottom-0 rounded-[12px] transition-all duration-75"
            />
            <Volume2
              size={17}
              className={`relative z-10 ml-3 pointer-events-none ${
                volume > 16
                  ? "text-[#ffffff] drop-shadow"
                  : isLightMode
                  ? "text-zinc-700"
                  : "text-white/85"
              }`}
            />
          </div>
          <span
            className={`w-10 text-right text-[13px] font-semibold tabular-nums ${
              isLightMode ? "text-zinc-900" : "text-white"
            }`}
          >
            {volume}%
          </span>
        </div>
      </div>

      {/* Footer Row */}
      <div
        className={`flex items-center justify-between pt-1 border-t ${
          isLightMode ? "border-black/[0.08]" : "border-white/[0.04]"
        }`}
      >
        {/* Battery Status */}
        {batteryPercent !== null ? (
          <div
            className={`flex items-center gap-2 text-[12px] font-medium ${
              isLightMode ? "text-emerald-700" : "text-[#22c55e]"
            }`}
          >
            <svg
              width="20"
              height="11"
              viewBox="0 0 22 11"
              fill="none"
              className="shrink-0"
            >
              <rect x="0.5" y="0.5" width="18" height="10" rx="3" stroke="currentColor" />
              <rect
                x="2"
                y="2"
                width={Math.max(2, (14 * batteryPercent) / 100)}
                height="7"
                rx="1.8"
                fill="currentColor"
              />
              <rect x="19.5" y="3.5" width="2" height="4" rx="1" fill="currentColor" />
            </svg>
            <span>
              {batteryPercent}% ·{" "}
              {isCharging
                ? tx(lang, "charged", "terisi")
                : tx(lang, "remaining", "tersisa")}
            </span>
          </div>
        ) : (
          <div
            className={`flex items-center gap-1.5 text-[12px] font-medium ${
              isLightMode ? "text-zinc-600" : "text-white/60"
            }`}
          >
            <Zap
              size={14}
              className={isLightMode ? "text-emerald-600" : "text-emerald-400"}
            />
            <span>{tx(lang, "AC Power (Desktop)", "Daya AC (Desktop)")}</span>
          </div>
        )}

        {/* Settings Button */}
        <button
          type="button"
          onClick={handleOpenSettings}
          className={`h-[32px] px-3.5 rounded-full text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer border ${
            isLightMode
              ? "bg-zinc-100 hover:bg-zinc-200/80 text-zinc-900 border-black/[0.08]"
              : "bg-[#18181f] hover:bg-[#25252e] text-white border-white/[0.06]"
          }`}
        >
          <Settings
            size={14}
            className={isLightMode ? "text-zinc-600" : "text-white/70"}
          />
          <span>{tx(lang, "Gili Settings", "Pengaturan Gili")}</span>
        </button>
      </div>
    </motion.div>
  );
};
