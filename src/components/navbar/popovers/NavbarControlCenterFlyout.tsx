import React, { useState, useEffect, useRef } from "react";
import {
  Wifi,
  Bluetooth,
  Bell,
  Radio,
  Sun,
  Volume2,
  Settings,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

interface NavbarControlCenterFlyoutProps {
  onClose: () => void;
  accentColor?: string;
}

export const NavbarControlCenterFlyout: React.FC<NavbarControlCenterFlyoutProps> = ({
  onClose,
  accentColor = "#3882F6",
}) => {
  const [wifiEnabled, setWifiEnabled] = useState(true);
  const [wifiName, setWifiName] = useState("KostAnil_5G");

  const [btEnabled, setBtEnabled] = useState(false);
  const [btName, setBtName] = useState("Tidak terhubung");

  const [focusMode, setFocusMode] = useState<"Normal" | "Fokus" | "DND">("Normal");
  const [isHotspotOn, setIsHotspotOn] = useState(false);

  const [brightness, setBrightness] = useState(64);
  const [volume, setVolume] = useState(94);

  const [batteryPercent, setBatteryPercent] = useState(100);
  const [isCharging, setIsCharging] = useState(true);

  const flyoutRef = useRef<HTMLDivElement>(null);

  // 1. Fetch system statuses on mount
  useEffect(() => {
    let isCancelled = false;

    // Wi-Fi
    invoke<{ connected: boolean; current_ssid?: string }>("get_wifi_status")
      .then((res) => {
        if (!isCancelled && res) {
          setWifiEnabled(res.connected);
          if (res.current_ssid) setWifiName(res.current_ssid);
        }
      })
      .catch(() => {});

    // Bluetooth
    invoke<{ connected: boolean; device_name?: string }>("get_bluetooth_status")
      .then((res) => {
        if (!isCancelled && res) {
          setBtEnabled(res.connected);
          if (res.device_name) setBtName(res.device_name);
        }
      })
      .catch(() => {});

    // Hotspot
    invoke<boolean>("get_hotspot_status")
      .then((res) => {
        if (!isCancelled) setIsHotspotOn(!!res);
      })
      .catch(() => {});

    // Brightness
    invoke<number>("get_brightness")
      .then((val) => {
        if (!isCancelled && typeof val === "number") setBrightness(val);
      })
      .catch(() => {});

    // Volume
    invoke<number>("get_master_volume")
      .then((vol) => {
        if (!isCancelled && typeof vol === "number") {
          setVolume(Math.round(vol * 100));
        }
      })
      .catch(() => {});

    // Battery
    invoke<[boolean, number] | null>("get_battery_status")
      .then((res) => {
        if (!isCancelled && res) {
          setIsCharging(res[0]);
          setBatteryPercent(res[1]);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, []);

  // Click outside listener
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        onClose();
      }
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
    } catch {}
  };

  const handleToggleBt = async () => {
    const next = !btEnabled;
    setBtEnabled(next);
    try {
      await invoke("toggle_bluetooth", { enable: next });
    } catch {}
  };

  const handleToggleHotspot = async () => {
    const next = !isHotspotOn;
    setIsHotspotOn(next);
    try {
      await invoke("toggle_hotspot");
    } catch {}
  };

  const handleToggleMode = () => {
    setFocusMode((prev) => (prev === "Normal" ? "DND" : "Normal"));
  };

  const handleBrightnessChange = (val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    setBrightness(clamped);
    invoke("set_brightness", { brightness: clamped }).catch(() => {});
  };

  const handleVolumeChange = (val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    setVolume(clamped);
    invoke("set_master_volume", { volume: clamped / 100 }).catch(() => {});
  };

  const handleOpenSettings = async () => {
    try {
      await invoke("open_settings_window", { section: "navbar" });
      onClose();
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
        boxShadow:
          "0 24px 50px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
      className="absolute bottom-full mb-3.5 right-12 w-[340px] p-3.5 rounded-[22px] bg-[#0c0c10] border border-white/[0.08] backdrop-blur-2xl text-white select-none pointer-events-auto z-50 flex flex-col gap-2.5"
    >
      {/* 2x2 Toggle Tiles */}
      <div className="grid grid-cols-2 gap-2">
        {/* Wi-Fi Tile */}
        <button
          type="button"
          onClick={handleToggleWifi}
          className={`h-[56px] rounded-[16px] px-3 flex items-center gap-2.5 transition-all cursor-pointer text-left ${
            wifiEnabled
              ? "bg-[#131d2e] border border-blue-500/40"
              : "bg-[#18181f] border border-transparent hover:bg-[#202028]"
          }`}
        >
          <div
            style={{ backgroundColor: wifiEnabled ? accentColor : undefined }}
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
          className={`h-[56px] rounded-[16px] px-3 flex items-center gap-2.5 transition-all cursor-pointer text-left ${
            btEnabled
              ? "bg-[#131d2e] border border-blue-500/40"
              : "bg-[#18181f] border border-transparent hover:bg-[#202028]"
          }`}
        >
          <div
            style={{ backgroundColor: btEnabled ? accentColor : undefined }}
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
          className={`h-[56px] rounded-[16px] px-3 flex items-center gap-2.5 transition-all cursor-pointer text-left ${
            focusMode !== "Normal"
              ? "bg-[#2a1738] border border-purple-500/40"
              : "bg-[#18181f] border border-transparent hover:bg-[#202028]"
          }`}
        >
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              focusMode !== "Normal"
                ? "bg-[#a855f7] text-white shadow-sm"
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
          className={`h-[56px] rounded-[16px] px-3 flex items-center gap-2.5 transition-all cursor-pointer text-left ${
            isHotspotOn
              ? "bg-[#131d2e] border border-blue-500/40"
              : "bg-[#18181f] border border-transparent hover:bg-[#202028]"
          }`}
        >
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              isHotspotOn ? "bg-[#3882F6] text-white shadow-sm" : "bg-[#25252e] text-white/50"
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
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              handleBrightnessChange(Math.round((clickX / rect.width) * 100));
            }}
            className="relative flex-1 h-[38px] rounded-[12px] bg-[#18181f] overflow-hidden flex items-center cursor-pointer select-none group"
          >
            <div
              style={{ width: `${brightness}%` }}
              className="absolute left-0 top-0 bottom-0 bg-white rounded-[12px] transition-all duration-75"
            />
            <Sun
              size={17}
              className="relative z-10 ml-3 text-black mix-blend-difference pointer-events-none"
            />
          </div>
          <span className="w-10 text-right text-[13px] font-semibold text-white tabular-nums">
            {brightness}%
          </span>
        </div>

        {/* Volume Slider */}
        <div className="flex items-center gap-3">
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              handleVolumeChange(Math.round((clickX / rect.width) * 100));
            }}
            className="relative flex-1 h-[38px] rounded-[12px] bg-[#18181f] overflow-hidden flex items-center cursor-pointer select-none group"
          >
            <div
              style={{ width: `${volume}%` }}
              className="absolute left-0 top-0 bottom-0 bg-white rounded-[12px] transition-all duration-75"
            />
            <Volume2
              size={17}
              className="relative z-10 ml-3 text-black mix-blend-difference pointer-events-none"
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
