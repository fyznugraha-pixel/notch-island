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

interface NavbarControlCenterFlyoutProps {
  onClose: () => void;
  accentColor?: string;
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
}) => {
  const [wifiEnabled, setWifiEnabled] = useState(true);
  const [wifiName, setWifiName] = useState("Memuat...");

  const [btEnabled, setBtEnabled] = useState(false);
  const [btName, setBtName] = useState("Memuat...");

  const [isDnd, setIsDnd] = useState<boolean>(() => getDndStatus());
  const [isHotspotOn, setIsHotspotOn] = useState(false);
  const focusMode = isDnd ? "Jangan Ganggu" : "Normal";

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
          setWifiName(res.connected_ssid || (res.enabled ? "Terhubung" : "Nonaktif"));
        }
      })
      .catch(() => {
        setWifiName("Tidak terhubung");
      });

    // Bluetooth
    invoke<BluetoothStatusResult>("get_bluetooth_status")
      .then((res) => {
        if (res) {
          setBtEnabled(res.enabled);
          setBtName(res.connected_name || (res.enabled ? "Aktif" : "Nonaktif"));
        }
      })
      .catch(() => {
        setBtName("Tidak terhubung");
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

  // Click outside listener that does NOT intercept clicks on the dock trigger button
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
    window.addEventListener("mousedown", handleDown);
    return () => window.removeEventListener("mousedown", handleDown);
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

  return (
    <motion.div
      ref={flyoutRef}
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        borderColor: hexToRgba(accentColor, 0.22),
        boxShadow: `0 24px 50px rgba(0,0,0,0.85), inset 0 1px 0 ${hexToRgba(accentColor, 0.35)}, 0 0 0 1px ${hexToRgba(accentColor, 0.18)}, 0 8px 30px ${hexToRgba(accentColor, 0.1)}`,
      }}
      className="absolute bottom-full mb-3.5 right-12 w-[340px] p-3.5 rounded-[22px] bg-[#0c0c10] border backdrop-blur-2xl text-white select-none pointer-events-auto z-50 flex flex-col gap-2.5"
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
            wifiEnabled
              ? "border"
              : "bg-[#18181f] border border-transparent hover:bg-[#202028]"
          }`}
        >
          <div
            style={{
              backgroundColor: wifiEnabled ? accentColor : undefined,
              boxShadow: wifiEnabled ? `0 0 12px ${hexToRgba(accentColor, 0.45)}` : undefined,
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              wifiEnabled ? "text-white shadow-sm" : "bg-[#25252e] text-white/50"
            }`}
          >
            <Wifi size={17} strokeWidth={2.2} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-[13px] text-white leading-tight">Wi-Fi</span>
            <span className="text-[11px] text-white/50 truncate leading-tight mt-0.5">
              {wifiEnabled ? wifiName : "Nonaktif"}
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
            btEnabled
              ? "border"
              : "bg-[#18181f] border border-transparent hover:bg-[#202028]"
          }`}
        >
          <div
            style={{
              backgroundColor: btEnabled ? accentColor : undefined,
              boxShadow: btEnabled ? `0 0 12px ${hexToRgba(accentColor, 0.45)}` : undefined,
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              btEnabled ? "text-white shadow-sm" : "bg-[#25252e] text-white/50"
            }`}
          >
            <Bluetooth size={17} strokeWidth={2.2} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-[13px] text-white leading-tight">Bluetooth</span>
            <span className="text-[11px] text-white/50 truncate leading-tight mt-0.5">
              {btEnabled ? btName : "Tidak terhubung"}
            </span>
          </div>
        </button>

        {/* Mode Fokus Tile */}
        <button
          type="button"
          onClick={handleToggleMode}
          style={{
            backgroundColor: focusMode !== "Normal" ? hexToRgba(accentColor, 0.16) : undefined,
            borderColor: focusMode !== "Normal" ? hexToRgba(accentColor, 0.45) : undefined,
          }}
          className={`h-[56px] rounded-[16px] px-3 flex items-center gap-2.5 transition-all cursor-pointer text-left ${
            focusMode !== "Normal"
              ? "border"
              : "bg-[#18181f] border border-transparent hover:bg-[#202028]"
          }`}
        >
          <div
            style={{
              backgroundColor: focusMode !== "Normal" ? accentColor : undefined,
              boxShadow: focusMode !== "Normal" ? `0 0 12px ${hexToRgba(accentColor, 0.45)}` : undefined,
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              focusMode !== "Normal"
                ? "text-white shadow-sm"
                : "bg-[#25252e] text-white/50"
            }`}
          >
            <Bell size={17} strokeWidth={2} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-[13px] text-white leading-tight">Mode</span>
            <span className="text-[11px] text-white/50 truncate leading-tight mt-0.5">
              {focusMode}
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
            isHotspotOn
              ? "border"
              : "bg-[#18181f] border border-transparent hover:bg-[#202028]"
          }`}
        >
          <div
            style={{
              backgroundColor: isHotspotOn ? accentColor : undefined,
              boxShadow: isHotspotOn ? `0 0 12px ${hexToRgba(accentColor, 0.45)}` : undefined,
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              isHotspotOn ? "text-white shadow-sm" : "bg-[#25252e] text-white/50"
            }`}
          >
            <Radio size={16} strokeWidth={2.2} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-[13px] text-white leading-tight">Hotspot</span>
            <span className="text-[11px] text-white/50 truncate leading-tight mt-0.5">
              {isHotspotOn ? "Aktif" : "Nonaktif"}
            </span>
          </div>
        </button>
      </div>

      {/* Sliders */}
      <div className="flex flex-col gap-2 pt-0.5">
        {/* Brightness Slider */}
        <div className="flex items-center gap-3">
          <div
            onPointerDown={handleBrightnessPointerDown}
            onPointerMove={handleBrightnessPointerMove}
            onPointerUp={handleBrightnessPointerUp}
            className="relative flex-1 h-[38px] rounded-[12px] bg-[#18181f] overflow-hidden flex items-center cursor-pointer select-none group touch-none"
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
              className="relative z-10 ml-3 text-white drop-shadow mix-blend-difference pointer-events-none"
            />
          </div>
          <span className="w-10 text-right text-[13px] font-semibold text-white tabular-nums">
            {brightness}%
          </span>
        </div>

        {/* Volume Slider */}
        <div className="flex items-center gap-3">
          <div
            onPointerDown={handleVolumePointerDown}
            onPointerMove={handleVolumePointerMove}
            onPointerUp={handleVolumePointerUp}
            className="relative flex-1 h-[38px] rounded-[12px] bg-[#18181f] overflow-hidden flex items-center cursor-pointer select-none group touch-none"
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
              className="relative z-10 ml-3 text-white drop-shadow mix-blend-difference pointer-events-none"
            />
          </div>
          <span className="w-10 text-right text-[13px] font-semibold text-white tabular-nums">
            {volume}%
          </span>
        </div>
      </div>

      {/* Footer Row */}
      <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
        {/* Battery Status */}
        {batteryPercent !== null ? (
          <div className="flex items-center gap-2 text-[#22c55e] text-[12px] font-medium">
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
              {batteryPercent}% · {isCharging ? "terisi" : "tersisa"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-white/60 text-[12px] font-medium">
            <Zap size={14} className="text-emerald-400" />
            <span>Daya AC (Desktop)</span>
          </div>
        )}

        {/* Settings Button */}
        <button
          type="button"
          onClick={handleOpenSettings}
          className="h-[32px] px-3.5 rounded-full bg-[#18181f] hover:bg-[#25252e] text-white text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-white/[0.06]"
        >
          <Settings size={14} className="text-white/70" />
          <span>Pengaturan Gili</span>
        </button>
      </div>
    </motion.div>
  );
};
