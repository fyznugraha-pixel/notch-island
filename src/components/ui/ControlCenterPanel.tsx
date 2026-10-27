import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scissors,
  ClipboardList,
  ListTodo,
  Folder,
  Gauge,
  Leaf,
  Zap,
  Wifi,
  Bluetooth,
  Radio,
  Lock,
  Moon,
  RotateCcw,
  Power,
  Sun,
  Volume2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Check,
  Bell,
  BellOff,
  Gamepad2,
  BedDouble,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Tooltip } from "./Tooltip";
import { iosSpring, iosRiseVariants } from "../../utils/iosMotion";
import { t } from "../../services/i18n";
import { WifiSubmenu } from "./control-center/WifiSubmenu";
import { BluetoothSubmenu } from "./control-center/BluetoothSubmenu";
import { toggleWifiState, toggleBluetoothState } from "../../services/connectivityService";
import { playVolumeTick } from "../../services/soundService";
import { getWheelVerticalDirection } from "../../utils/gesture";

export type FocusModeType = "Normal" | "DND" | "Gaming" | "Sleep";

export interface FocusModeOption {
  id: FocusModeType;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
}

export interface ControlCenterPanelProps {
  slideDirection: number;
  powerMode: "Eco" | "Balanced" | "Performance";
  onSetPowerMode: (mode: "Eco" | "Balanced" | "Performance") => void;
  displayLevel: number;
  onSetDisplayLevel: (level: number) => void;
  brightnessMode: "auto" | "manual" | "reading";
  onSetBrightnessMode: (mode: "auto" | "manual" | "reading") => void;
  soundLevel: number;
  onSetSoundLevel: (level: number) => void;
  wifiName: string;
  networkPing: number | null;
  btName: string;
  isHotspotOn: boolean;
  onToggleHotspot: (e: React.MouseEvent) => void;
  focusMode: FocusModeType;
  onSelectFocusMode: (mode: FocusModeType) => void;
  focusModeOptions: FocusModeOption[];
  stashedFilesCount: number;
  onGoToTab: (
    tab:
      | "clipboard"
      | "todo"
      | "drop_shelf"
      | "volume_mixer"
      | "settings"
      | "pomodoro"
      | "sys_monitor"
      | "mini_note",
    dir?: 1 | -1
  ) => void;
  onClose: () => void;
  onSubmenuChange?: (submenu: null | "wifi" | "bluetooth") => void;
  isLightMode?: boolean;
}

export const ControlCenterPanel: React.FC<ControlCenterPanelProps> = ({
  slideDirection,
  powerMode,
  onSetPowerMode,
  displayLevel,
  onSetDisplayLevel,
  brightnessMode,
  onSetBrightnessMode,
  soundLevel,
  onSetSoundLevel,
  wifiName,
  networkPing,
  btName,
  isHotspotOn,
  onToggleHotspot,
  focusMode,
  onSelectFocusMode,
  focusModeOptions,
  stashedFilesCount,
  onGoToTab,
  onClose,
  onSubmenuChange,
  isLightMode = false,
}) => {
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [isPowerMenuOpen, setIsPowerMenuOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<null | "wifi" | "bluetooth">(null);
  const [localWifiOn, setLocalWifiOn] = useState<boolean | null>(null);
  const [localBtOn, setLocalBtOn] = useState<boolean | null>(null);
  const [isDraggingBrightness, setIsDraggingBrightness] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);

  const handleOpenWifi = () => {
    setIsModeDropdownOpen(false);
    setIsPowerMenuOpen(false);
    setActiveSubmenu("wifi");
    onSubmenuChange?.("wifi");
  };

  const handleOpenBt = () => {
    setIsModeDropdownOpen(false);
    setIsPowerMenuOpen(false);
    setActiveSubmenu("bluetooth");
    onSubmenuChange?.("bluetooth");
  };

  const handleBackToMain = () => {
    setActiveSubmenu(null);
    onSubmenuChange?.(null);
  };

  useEffect(() => {
    return () => {
      onSubmenuChange?.(null);
    };
  }, [onSubmenuChange]);

  useEffect(() => {
    setLocalWifiOn(null);
  }, [wifiName]);

  useEffect(() => {
    setLocalBtOn(null);
  }, [btName]);

  const isWifiOn = localWifiOn !== null ? localWifiOn : wifiName !== "Off" && wifiName !== "";
  const isBtOn = localBtOn !== null ? localBtOn : btName !== "Off" && btName !== "";

  const btBatteryMatch = btName.match(/\((.*?%)\)$/);
  const hasBtBattery = !!btBatteryMatch;
  const btBatteryText = hasBtBattery ? btBatteryMatch[1] : null;
  const cleanBtName = btName.replace(/\s*\(.*?%\)$/, "");
  const isWifiConnected =
    isWifiOn &&
    wifiName !== "Not Connected" &&
    wifiName !== "Off" &&
    wifiName !== "Loading..." &&
    wifiName !== "";
  const isBtConnected =
    isBtOn && btName !== "Not Connected" && btName !== "Off" && btName !== "Loading...";
  const currentFocusOption =
    focusModeOptions.find((opt) => opt.id === focusMode) || focusModeOptions[0];

  const handleQuickToggleDnd = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectFocusMode(focusMode === "DND" ? "Normal" : "DND");
  };

  const handleQuickToggleWifi = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !isWifiOn;
    setLocalWifiOn(next);
    try {
      await toggleWifiState(next);
      invoke("get_system_info").catch(console.error);
    } catch (err) {
      console.error(err);
      setLocalWifiOn(isWifiOn);
    }
  };

  const handleQuickToggleBt = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !isBtOn;
    setLocalBtOn(next);
    try {
      await toggleBluetoothState(next);
      invoke("get_system_info").catch(console.error);
    } catch (err) {
      console.error(err);
      setLocalBtOn(isBtOn);
    }
  };

  const handleSelectPowerMode = (mode: "Eco" | "Balanced" | "Performance", e: React.MouseEvent) => {
    e.stopPropagation();
    onSetPowerMode(mode);
    invoke("set_power_plan", { mode }).catch(console.error);
  };

  const handleNextBrightnessMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    let next: "auto" | "manual" | "reading";
    if (brightnessMode === "manual") next = "reading";
    else if (brightnessMode === "reading") next = "auto";
    else next = "manual";

    onSetBrightnessMode(next);
    invoke("set_brightness_mode", { mode: next }).catch(console.error);
  };

  const lastVolInvokeRef = useRef(0);
  const pendingVolRef = useRef<number | null>(null);
  const volTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVolumeChange = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(v)));
      onSetSoundLevel(clamped);
      playVolumeTick(clamped);
      pendingVolRef.current = clamped;
      const now = Date.now();

      if (now - lastVolInvokeRef.current >= 40) {
        lastVolInvokeRef.current = now;
        if (volTimeoutRef.current) clearTimeout(volTimeoutRef.current);
        invoke("set_master_volume", { level: clamped / 100.0 }).catch(console.error);
      } else if (!volTimeoutRef.current) {
        volTimeoutRef.current = setTimeout(() => {
          volTimeoutRef.current = null;
          if (pendingVolRef.current !== null) {
            lastVolInvokeRef.current = Date.now();
            invoke("set_master_volume", { level: pendingVolRef.current / 100.0 }).catch(
              console.error
            );
          }
        }, 40);
      }
    },
    [onSetSoundLevel]
  );

  const lastBrightInvokeRef = useRef(0);
  const pendingBrightRef = useRef<number | null>(null);
  const brightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBrightnessChange = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(v)));
      onSetDisplayLevel(clamped);
      playVolumeTick(clamped);
      pendingBrightRef.current = clamped;
      const now = Date.now();

      if (now - lastBrightInvokeRef.current >= 60) {
        lastBrightInvokeRef.current = now;
        if (brightTimeoutRef.current) clearTimeout(brightTimeoutRef.current);
        invoke("set_brightness", { level: clamped }).catch(console.error);
      } else if (!brightTimeoutRef.current) {
        brightTimeoutRef.current = setTimeout(() => {
          brightTimeoutRef.current = null;
          if (pendingBrightRef.current !== null) {
            lastBrightInvokeRef.current = Date.now();
            invoke("set_brightness", { level: pendingBrightRef.current }).catch(console.error);
          }
        }, 60);
      }
    },
    [onSetDisplayLevel]
  );

  useEffect(() => {
    return () => {
      if (volTimeoutRef.current) clearTimeout(volTimeoutRef.current);
      if (brightTimeoutRef.current) clearTimeout(brightTimeoutRef.current);
    };
  }, []);

  const powerModeLabel =
    powerMode === "Eco"
      ? t("cc_power_eco")
      : powerMode === "Balanced"
      ? t("cc_power_balanced")
      : t("cc_power_performance");

  const getFocusIconColor = (id: FocusModeType) => {
    if (id === "Normal") return "text-[#fbbf24]";
    if (id === "DND") return "text-[#a5a8ff]";
    if (id === "Gaming") return "text-[#f87171]";
    return "text-[#5eead4]";
  };

  const renderFocusGlyph = (id: FocusModeType, size = 16) => {
    if (id === "Normal") return <Bell size={size} />;
    if (id === "DND") return <BellOff size={size} />;
    if (id === "Gaming") return <Gamepad2 size={size} />;
    return <BedDouble size={size} />;
  };

  return (
    <AnimatePresence mode="wait">
      {activeSubmenu === "wifi" ? (
        <WifiSubmenu
          key="wifi_submenu"
          onBack={handleBackToMain}
          networkPing={networkPing}
          initialEnabled={isWifiOn}
          initialConnectedSsid={isWifiConnected ? wifiName : ""}
          isLightMode={isLightMode}
        />
      ) : activeSubmenu === "bluetooth" ? (
        <BluetoothSubmenu
          key="bluetooth_submenu"
          onBack={handleBackToMain}
          initialEnabled={isBtOn}
          initialConnectedName={isBtConnected ? btName : ""}
          isLightMode={isLightMode}
        />
      ) : (
        <motion.div
          key="quick_control"
          custom={slideDirection}
          variants={iosRiseVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="absolute inset-0 w-full h-full flex flex-col px-6 pt-1 pb-1 justify-start gap-2 min-w-0 select-none gpu-accelerated"
        >
          {/* Click-outside catcher when Mode Dropdown or Power Menu is open */}
          {(isModeDropdownOpen || isPowerMenuOpen) && (
            <div
              className="fixed inset-0 z-30 bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                setIsModeDropdownOpen(false);
                setIsPowerMenuOpen(false);
              }}
            />
          )}

          {/* Row 1: 2x2 Toggles + Right Power/Session Column (Board 04) */}
          <div className="flex gap-3 items-stretch">
            {/* Left 2x2 Toggle Grid */}
            <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
              {/* Wi-Fi Tile */}
              <div
                onClick={handleOpenWifi}
                className={`h-[60px] rounded-[16px] pl-2.5 pr-1.5 flex items-center gap-2.5 transition-all cursor-pointer min-w-0 ${
                  isModeDropdownOpen || isPowerMenuOpen ? "opacity-30 pointer-events-none" : ""
                } ${
                  isWifiConnected
                    ? "bg-[rgba(56,130,246,0.16)] border border-[rgba(56,130,246,0.4)]"
                    : "bg-[#101015] border border-[#1e1e25] hover:border-[#2a2a33]"
                }`}
              >
                <button
                  type="button"
                  onClick={handleQuickToggleWifi}
                  aria-label="Toggle Wi-Fi"
                  className={`w-[36px] h-[36px] rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                    isWifiConnected
                      ? "bg-[#3882F6] text-white"
                      : isWifiOn
                      ? "bg-[#1d1d25] text-[#3882F6]"
                      : "bg-[#1d1d25] text-[#a1a1aa]"
                  }`}
                >
                  <Wifi size={18} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-white leading-tight truncate">
                    Wi-Fi
                  </div>
                  <div className="text-[11px] text-[#b4b4bd] truncate mt-0.5 tabular-nums">
                    {isWifiOn
                      ? isWifiConnected
                        ? networkPing !== null
                          ? `${wifiName} · ${networkPing} ms`
                          : wifiName
                        : t("cc_not_connected")
                      : "Off"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenWifi();
                  }}
                  className="w-[28px] h-[40px] flex items-center justify-center text-[#b4b4bd] hover:text-white transition-colors shrink-0 cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Mode Tile + Floating Menu (Board 06) */}
              <div
                className={`relative min-w-0 transition-opacity ${
                  isModeDropdownOpen
                    ? "z-50"
                    : isPowerMenuOpen
                    ? "opacity-30 pointer-events-none"
                    : ""
                }`}
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPowerMenuOpen(false);
                    setIsModeDropdownOpen((prev) => !prev);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    invoke("system_power_action", { action: "focus" }).catch(() => {
                      openUrl("ms-settings:quiethours").catch(console.error);
                    });
                  }}
                  className={`h-[60px] rounded-[16px] pl-2.5 pr-1.5 flex items-center gap-2.5 transition-all cursor-pointer min-w-0 ${
                    isModeDropdownOpen
                      ? "bg-[#17171d] border border-[#3a3a43]"
                      : focusMode === "DND"
                      ? "bg-[rgba(99,102,241,0.16)] border border-[rgba(99,102,241,0.4)]"
                      : focusMode === "Gaming"
                      ? "bg-[rgba(244,63,94,0.16)] border border-[rgba(244,63,94,0.4)]"
                      : focusMode === "Sleep"
                      ? "bg-[rgba(20,184,166,0.16)] border border-[rgba(20,184,166,0.4)]"
                      : "bg-[#101015] border border-[#1e1e25] hover:border-[#2a2a33]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={handleQuickToggleDnd}
                    aria-label="Toggle DND"
                    title={focusMode === "DND" ? "Nonaktifkan Mode Jangan Ganggu" : "Aktifkan Mode Jangan Ganggu"}
                    className={`w-[36px] h-[36px] rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      focusMode === "DND"
                        ? "bg-[#6366f1] text-white shadow-sm"
                        : focusMode === "Gaming"
                        ? "bg-rose-500 text-white shadow-sm"
                        : focusMode === "Sleep"
                        ? "bg-teal-500 text-white shadow-sm"
                        : "bg-[#1d1d25] text-[#fbbf24] hover:bg-[#252530]"
                    }`}
                  >
                    {renderFocusGlyph(focusMode, 18)}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-white leading-tight truncate">
                      {t("cc_mode_title")}
                    </div>
                    <div
                      className={`text-[11px] truncate mt-0.5 ${
                        focusMode === "DND"
                          ? "text-indigo-300 font-medium"
                          : focusMode === "Gaming"
                          ? "text-rose-300 font-medium"
                          : focusMode === "Sleep"
                          ? "text-teal-300 font-medium"
                          : "text-[#a1a1aa]"
                      }`}
                    >
                      {currentFocusOption ? currentFocusOption.label : focusMode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPowerMenuOpen(false);
                      setIsModeDropdownOpen((prev) => !prev);
                    }}
                    aria-label="Pilih Mode"
                    className="w-[28px] h-[40px] flex items-center justify-center text-[#a1a1aa] hover:text-white transition-colors shrink-0 cursor-pointer"
                  >
                    {isModeDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                <AnimatePresence>
                  {isModeDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -4 }}
                      transition={iosSpring.snappy}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-[calc(100%+4px)] z-50 w-[264px] p-1 rounded-[16px] bg-[#17171d] border border-[#2a2a31] shadow-[0_8px_20px_rgba(0,0,0,0.5)] flex flex-col gap-0.5"
                    >
                      {focusModeOptions.map((opt) => {
                        const isSelected = focusMode === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectFocusMode(opt.id);
                              setIsModeDropdownOpen(false);
                            }}
                            className={`h-[40px] rounded-[11px] px-2.5 flex items-center gap-2 text-left transition-colors cursor-pointer ${
                              isSelected ? "bg-[#23232a] text-white" : "hover:bg-white/[0.04] text-white"
                            }`}
                          >
                            <span
                              className={`w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0 ${
                                isSelected ? "bg-[#2e2e36]" : "bg-[#1d1d25]"
                              } ${getFocusIconColor(opt.id)}`}
                            >
                              {renderFocusGlyph(opt.id, 14)}
                            </span>
                            <span className="flex-1 min-w-0 flex flex-col">
                              <span className="text-[12px] font-semibold text-white leading-tight truncate">
                                {opt.label}
                              </span>
                              <span className="text-[10px] text-[#a1a1aa] leading-tight truncate mt-0.5">
                                {opt.desc}
                              </span>
                            </span>
                            {isSelected && (
                              <Check size={14} strokeWidth={2.6} className="text-[#7fb0ff] shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bluetooth Tile */}
              <div
                onClick={handleOpenBt}
                className={`h-[60px] rounded-[16px] pl-2.5 pr-1.5 flex items-center gap-2.5 transition-all cursor-pointer min-w-0 ${
                  isModeDropdownOpen || isPowerMenuOpen ? "opacity-30 pointer-events-none" : ""
                } ${
                  isBtConnected
                    ? "bg-[rgba(56,130,246,0.16)] border border-[rgba(56,130,246,0.4)]"
                    : "bg-[#101015] border border-[#1e1e25] hover:border-[#2a2a33]"
                }`}
              >
                <button
                  type="button"
                  onClick={handleQuickToggleBt}
                  aria-label="Toggle Bluetooth"
                  className={`w-[36px] h-[36px] rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                    isBtConnected
                      ? "bg-[#3882F6] text-white"
                      : isBtOn
                      ? "bg-[#1d1d25] text-[#c4c4cc]"
                      : "bg-[#1d1d25] text-[#71717a]"
                  }`}
                >
                  <Bluetooth size={18} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-white leading-tight truncate">
                    Bluetooth
                  </div>
                  <div className="text-[11px] text-[#a1a1aa] truncate mt-0.5">
                    {isBtOn
                      ? isBtConnected
                        ? hasBtBattery
                          ? `${cleanBtName} · ${btBatteryText}`
                          : cleanBtName
                        : t("cc_not_connected")
                      : "Off"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenBt();
                  }}
                  className="w-[28px] h-[40px] flex items-center justify-center text-[#a1a1aa] hover:text-white transition-colors shrink-0 cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Hotspot Tile */}
              <div
                onClick={onToggleHotspot}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  invoke("system_power_action", { action: "hotspot" }).catch(() => {
                    openUrl("ms-settings:network-mobilehotspot").catch(console.error);
                  });
                }}
                className={`h-[60px] rounded-[16px] px-2.5 flex items-center gap-2.5 transition-all cursor-pointer min-w-0 ${
                  isModeDropdownOpen || isPowerMenuOpen ? "opacity-30 pointer-events-none" : ""
                } ${
                  isHotspotOn
                    ? "bg-[rgba(56,130,246,0.16)] border border-[rgba(56,130,246,0.4)]"
                    : "bg-[#101015] border border-[#1e1e25] hover:border-[#2a2a33]"
                }`}
              >
                <div
                  className={`w-[36px] h-[36px] rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    isHotspotOn ? "bg-[#3882F6] text-white" : "bg-[#1d1d25] text-[#c4c4cc]"
                  }`}
                >
                  <Radio size={18} className={isHotspotOn ? "animate-pulse" : ""} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-white leading-tight truncate">
                    Hotspot
                  </div>
                  <div className="text-[11px] text-[#a1a1aa] truncate mt-0.5">
                    {isHotspotOn ? t("cc_hotspot_active") : t("cc_hotspot_inactive")}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Power Profile + Session Bar */}
            <div className="w-[208px] shrink-0 flex flex-col gap-2">
              {/* Power Mode Card */}
              <div
                className={`h-[72px] rounded-[16px] px-3 py-2 bg-[#101015] border border-[#1e1e25] flex flex-col justify-between transition-opacity ${
                  isModeDropdownOpen || isPowerMenuOpen ? "opacity-30 pointer-events-none" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2 h-[18px]">
                  <span className="text-[11px] text-[#a1a1aa] whitespace-nowrap">
                    {t("cc_power_mode_label")}
                  </span>
                  <span className="text-[13px] font-semibold text-white whitespace-nowrap">
                    {powerModeLabel}
                  </span>
                </div>
                <div
                  role="radiogroup"
                  aria-label={t("cc_power_mode_label")}
                  className="flex gap-0.5 p-0.5 bg-[#08080b] rounded-[10px] h-[32px]"
                >
                  <button
                    type="button"
                    onClick={(e) => handleSelectPowerMode("Eco", e)}
                    title={t("cc_power_eco")}
                    className={`flex-1 rounded-[8px] flex items-center justify-center transition-colors cursor-pointer ${
                      powerMode === "Eco"
                        ? "bg-[#2a2a31] text-white"
                        : "text-[#a1a1aa] hover:text-white"
                    }`}
                  >
                    <Leaf size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleSelectPowerMode("Balanced", e)}
                    title={t("cc_power_balanced")}
                    className={`flex-1 rounded-[8px] flex items-center justify-center transition-colors cursor-pointer ${
                      powerMode === "Balanced"
                        ? "bg-[#2a2a31] text-white"
                        : "text-[#a1a1aa] hover:text-white"
                    }`}
                  >
                    <Gauge size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleSelectPowerMode("Performance", e)}
                    title={t("cc_power_performance")}
                    className={`flex-1 rounded-[8px] flex items-center justify-center transition-colors cursor-pointer ${
                      powerMode === "Performance"
                        ? "bg-[#2a2a31] text-white"
                        : "text-[#a1a1aa] hover:text-white"
                    }`}
                  >
                    <Zap size={15} />
                  </button>
                </div>
              </div>

              {/* Session Actions: Lock, Sleep, Daya Dropdown */}
              <div
                className={`h-[48px] rounded-[16px] p-1.5 bg-[#101015] border border-[#1e1e25] flex items-center gap-1.5 relative transition-opacity ${
                  isPowerMenuOpen
                    ? "z-50"
                    : isModeDropdownOpen
                    ? "opacity-30 pointer-events-none"
                    : ""
                }`}
              >
                <Tooltip content={t("cc_lock_pc")} side="bottom">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      invoke("system_power_action", { action: "lock" }).catch(console.error);
                      onClose();
                    }}
                    className="w-[36px] h-[34px] rounded-[11px] bg-[#1d1d25] hover:bg-[#272732] text-[#e4e4e7] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  >
                    <Lock size={15} />
                  </button>
                </Tooltip>

                <Tooltip content={t("cc_sleep_pc")} side="bottom">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      invoke("system_power_action", { action: "sleep" }).catch(console.error);
                      onClose();
                    }}
                    className="w-[36px] h-[34px] rounded-[11px] bg-[#1d1d25] hover:bg-[#272732] text-[#e4e4e7] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  >
                    <Moon size={15} />
                  </button>
                </Tooltip>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsModeDropdownOpen(false);
                    setIsPowerMenuOpen((prev) => !prev);
                  }}
                  className="flex-1 h-[34px] rounded-[11px] bg-[rgba(255,107,90,0.14)] hover:bg-[rgba(255,107,90,0.22)] text-[#ff9b8f] text-[12px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Power size={13.5} strokeWidth={2.2} />
                  <span>{t("cc_power_btn")}</span>
                  <ChevronDown size={12} strokeWidth={2.4} />
                </button>

                <AnimatePresence>
                  {isPowerMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={iosSpring.snappy}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-[calc(100%+6px)] z-50 w-[168px] p-1.5 rounded-[16px] bg-[#17171d] border border-[#2a2a31] shadow-[0_8px_20px_rgba(0,0,0,0.5)] flex flex-col gap-1"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsPowerMenuOpen(false);
                          invoke("system_power_action", { action: "restart" }).catch(console.error);
                          onClose();
                        }}
                        className="h-[36px] px-2.5 rounded-[11px] hover:bg-white/[0.06] text-[#e4e4e7] text-[12px] font-medium flex items-center gap-2.5 cursor-pointer transition-colors"
                      >
                        <RotateCcw size={14} className="text-sky-400" />
                        <span>{t("cc_restart_pc")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsPowerMenuOpen(false);
                          invoke("system_power_action", { action: "shutdown" }).catch(console.error);
                          onClose();
                        }}
                        className="h-[36px] px-2.5 rounded-[11px] hover:bg-[rgba(255,107,90,0.16)] text-[#ff9b8f] text-[12px] font-medium flex items-center gap-2.5 cursor-pointer transition-colors"
                      >
                        <Power size={14} />
                        <span>{t("cc_shutdown_pc")}</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Row 2: 4 Quick Action Buttons (Sniping, Clipboard, Todo, Berkas) */}
          <div
            className={`grid grid-cols-4 gap-2 transition-opacity ${
              isModeDropdownOpen || isPowerMenuOpen ? "opacity-30 pointer-events-none" : ""
            }`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                invoke("system_power_action", { action: "screenshot" }).catch(console.error);
                onClose();
              }}
              className="h-[42px] rounded-[14px] border border-[#1e1e25] bg-[#101015] hover:bg-[#17171f] hover:border-[#2a2a33] text-[#e4e4e7] text-[12px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Scissors size={16} />
              <span>{t("cc_sniping")}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onGoToTab("clipboard");
              }}
              className="h-[42px] rounded-[14px] border border-[#1e1e25] bg-[#101015] hover:bg-[#17171f] hover:border-[#2a2a33] text-[#e4e4e7] text-[12px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ClipboardList size={16} />
              <span>Clipboard</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onGoToTab("todo");
              }}
              className="h-[42px] rounded-[14px] border border-[#1e1e25] bg-[#101015] hover:bg-[#17171f] hover:border-[#2a2a33] text-[#e4e4e7] text-[12px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ListTodo size={16} />
              <span>Todo</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onGoToTab("drop_shelf");
              }}
              className="h-[42px] rounded-[14px] border border-[#1e1e25] bg-[#101015] hover:bg-[#17171f] hover:border-[#2a2a33] text-[#e4e4e7] text-[12px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer relative"
            >
              <Folder size={16} />
              <span>{t("cc_files_short")}</span>
              {stashedFilesCount > 0 && (
                <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-[#3882F6] text-white text-[9.5px] font-bold flex items-center justify-center tabular-nums">
                  {stashedFilesCount}
                </span>
              )}
            </button>
          </div>

          {/* Row 3: Brightness & Volume Pill Sliders (Board 04) */}
          <div
            className={`flex flex-col gap-2 transition-opacity ${
              isModeDropdownOpen || isPowerMenuOpen ? "opacity-30 pointer-events-none" : ""
            }`}
            data-no-swipe="true"
          >
            {/* Brightness Slider Row */}
            <div className="flex items-center gap-2.5 h-[40px]" data-no-swipe="true">
              <div
                className="flex-1 h-[40px] rounded-full bg-[#15151b] relative overflow-hidden cursor-pointer"
                onWheel={(e) => {
                  if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
                    e.stopPropagation();
                    if (Math.abs(e.deltaY) < 1) return;
                    const dir = getWheelVerticalDirection(e);
                    handleBrightnessChange(displayLevel + (dir > 0 ? 2 : -2));
                  }
                }}
              >
                <div
                  className={`absolute inset-y-0 left-0 bg-[#e4e4e7] ${
                    isDraggingBrightness ? "" : "transition-[width] duration-75"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, displayLevel))}%` }}
                />
                <div
                  className={`absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none transition-colors ${
                    displayLevel > 10 ? "text-[#0b0b0d]" : "text-[#e4e4e7]"
                  }`}
                >
                  <Sun size={17} />
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(displayLevel)}
                  aria-label={t("cc_brightness")}
                  data-no-swipe="true"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setIsDraggingBrightness(true);
                  }}
                  onPointerUp={() => setIsDraggingBrightness(false)}
                  onPointerCancel={() => setIsDraggingBrightness(false)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => handleBrightnessChange(Number(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 m-0 cursor-pointer z-10"
                />
              </div>

              <span className="w-[40px] text-right text-[13px] font-semibold text-white tabular-nums shrink-0">
                {Math.round(displayLevel)}%
              </span>

              <Tooltip content={t("cc_brightness_mode")} side="left">
                <button
                  type="button"
                  onClick={handleNextBrightnessMode}
                  className={`w-[40px] h-[40px] rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                    brightnessMode === "auto"
                      ? "bg-[#3882F6]/20 text-[#3882F6] border border-[#3882F6]/40"
                      : "bg-[#17171c] hover:bg-[#222229] text-[#e4e4e7]"
                  }`}
                >
                  {brightnessMode === "reading" ? (
                    <Moon size={17} className="text-indigo-400" />
                  ) : (
                    <span className="text-[14px] font-semibold leading-none">A</span>
                  )}
                </button>
              </Tooltip>
            </div>

            {/* Volume Slider Row */}
            <div className="flex items-center gap-2.5 h-[40px]" data-no-swipe="true">
              <div
                className="flex-1 h-[40px] rounded-full bg-[#15151b] relative overflow-hidden cursor-pointer"
                onWheel={(e) => {
                  if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
                    e.stopPropagation();
                    if (Math.abs(e.deltaY) < 1) return;
                    const dir = getWheelVerticalDirection(e);
                    handleVolumeChange(soundLevel + (dir > 0 ? 2 : -2));
                  }
                }}
              >
                <div
                  className={`absolute inset-y-0 left-0 bg-[#e4e4e7] ${
                    isDraggingVolume ? "" : "transition-[width] duration-75"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, soundLevel))}%` }}
                />
                <div
                  className={`absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none transition-colors ${
                    soundLevel > 10 ? "text-[#0b0b0d]" : "text-[#e4e4e7]"
                  }`}
                >
                  <Volume2 size={17} />
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(soundLevel)}
                  aria-label={t("cc_volume")}
                  data-no-swipe="true"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setIsDraggingVolume(true);
                  }}
                  onPointerUp={() => setIsDraggingVolume(false)}
                  onPointerCancel={() => setIsDraggingVolume(false)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 m-0 cursor-pointer z-10"
                />
              </div>

              <span className="w-[40px] text-right text-[13px] font-semibold text-white tabular-nums shrink-0">
                {Math.round(soundLevel)}%
              </span>

              <Tooltip content={t("tab_volume_mixer")} side="left">
                <button
                  type="button"
                  onClick={() => onGoToTab("volume_mixer", 1)}
                  className="w-[40px] h-[40px] rounded-full bg-[#17171c] hover:bg-[#222229] text-[#e4e4e7] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <SlidersHorizontal size={17} />
                </button>
              </Tooltip>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
