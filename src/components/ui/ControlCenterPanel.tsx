import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings as SettingsIcon,
  Scissors,
  ClipboardList,
  ListTodo,
  FolderSync,
  Gauge,
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
import { ScrollingText } from "./ScrollingText";
import { IosSlider } from "../ios/IosSlider";
import { iosSpring, iosRiseVariants } from "../../utils/iosMotion";
import { t } from "../../services/i18n";
import { WifiSubmenu } from "./control-center/WifiSubmenu";
import { BluetoothSubmenu } from "./control-center/BluetoothSubmenu";
import { toggleWifiState, toggleBluetoothState } from "../../services/connectivityService";

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
  onGoToTab: (tab: "clipboard" | "todo" | "drop_shelf" | "volume_mixer" | "settings", dir?: 1 | -1) => void;
  onClose: () => void;
  onSubmenuChange?: (submenu: null | "wifi" | "bluetooth") => void;
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
}) => {
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<null | "wifi" | "bluetooth">(null);
  const [localWifiOn, setLocalWifiOn] = useState<boolean | null>(null);
  const [localBtOn, setLocalBtOn] = useState<boolean | null>(null);

  const handleOpenWifi = () => {
    setActiveSubmenu("wifi");
    onSubmenuChange?.("wifi");
  };

  const handleOpenBt = () => {
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

  const isWifiOn = localWifiOn !== null ? localWifiOn : (wifiName !== "Off" && wifiName !== "");
  const isBtOn = localBtOn !== null ? localBtOn : (btName !== "Off" && btName !== "");

  const btBatteryMatch = btName.match(/\((.*?%)\)$/);
  const hasBtBattery = !!btBatteryMatch;
  const btBatteryText = hasBtBattery ? btBatteryMatch[1] : null;
  const cleanBtName = btName.replace(/\s*\(.*?%\)$/, "");
  const isWifiConnected = isWifiOn && wifiName !== "Not Connected" && wifiName !== "Off" && wifiName !== "Loading..." && wifiName !== "";
  const isBtConnected = isBtOn && btName !== "Not Connected" && btName !== "Off" && btName !== "Loading...";
  const currentFocusOption = focusModeOptions.find((opt) => opt.id === focusMode) || focusModeOptions[0];

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

  const handleNextPowerMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    let next: "Eco" | "Balanced" | "Performance";
    if (powerMode === "Eco") next = "Balanced";
    else if (powerMode === "Balanced") next = "Performance";
    else next = "Eco";

    onSetPowerMode(next);
    invoke("set_power_plan", { mode: next }).catch(console.error);
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

  const handleVolumeChange = useCallback((v: number) => {
    onSetSoundLevel(v);
    pendingVolRef.current = v;
    const now = Date.now();

    if (now - lastVolInvokeRef.current >= 40) {
      lastVolInvokeRef.current = now;
      if (volTimeoutRef.current) clearTimeout(volTimeoutRef.current);
      invoke("set_master_volume", { level: v / 100.0 }).catch(console.error);
    } else {
      if (!volTimeoutRef.current) {
        volTimeoutRef.current = setTimeout(() => {
          volTimeoutRef.current = null;
          if (pendingVolRef.current !== null) {
            lastVolInvokeRef.current = Date.now();
            invoke("set_master_volume", { level: pendingVolRef.current / 100.0 }).catch(console.error);
          }
        }, 40);
      }
    }
  }, [onSetSoundLevel]);

  const lastBrightInvokeRef = useRef(0);
  const pendingBrightRef = useRef<number | null>(null);
  const brightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBrightnessChange = useCallback((v: number) => {
    onSetDisplayLevel(v);
    pendingBrightRef.current = v;
    const now = Date.now();

    if (now - lastBrightInvokeRef.current >= 60) {
      lastBrightInvokeRef.current = now;
      if (brightTimeoutRef.current) clearTimeout(brightTimeoutRef.current);
      invoke("set_brightness", { level: v }).catch(console.error);
    } else {
      if (!brightTimeoutRef.current) {
        brightTimeoutRef.current = setTimeout(() => {
          brightTimeoutRef.current = null;
          if (pendingBrightRef.current !== null) {
            lastBrightInvokeRef.current = Date.now();
            invoke("set_brightness", { level: pendingBrightRef.current }).catch(console.error);
          }
        }, 60);
      }
    }
  }, [onSetDisplayLevel]);

  useEffect(() => {
    return () => {
      if (volTimeoutRef.current) clearTimeout(volTimeoutRef.current);
      if (brightTimeoutRef.current) clearTimeout(brightTimeoutRef.current);
    };
  }, []);

  return (
    <AnimatePresence mode="wait">
      {activeSubmenu === "wifi" ? (
        <WifiSubmenu
          key="wifi_submenu"
          onBack={handleBackToMain}
          networkPing={networkPing}
          initialEnabled={isWifiOn}
          initialConnectedSsid={isWifiConnected ? wifiName : ""}
        />
      ) : activeSubmenu === "bluetooth" ? (
        <BluetoothSubmenu
          key="bluetooth_submenu"
          onBack={handleBackToMain}
          initialEnabled={isBtOn}
          initialConnectedName={isBtConnected ? btName : ""}
        />
      ) : (
        <motion.div
          key="quick_control"
          custom={slideDirection}
          variants={iosRiseVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="absolute inset-0 w-full h-full flex flex-col px-3 justify-center py-1 gap-2.5 min-w-0 select-none gpu-accelerated"
        >
      {/* Row 1: iOS Quick Tools + Power Mode Capsule */}
      <motion.div
        custom={slideDirection}
        variants={iosRiseVariants}
        className="grid grid-cols-[1fr_110px] gap-2.5"
      >
        <div className="grid grid-cols-5 gap-2 bg-[#1c1c1e]/90 rounded-[22px] p-1.5 border border-white/5 shadow-sm items-center justify-items-center">
          {/* Settings */}
          <Tooltip content={t("tab_settings")} side="bottom" wrapperClassName="w-full flex justify-center">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              transition={iosSpring.press}
              onClick={(e) => {
                e.stopPropagation();
                invoke("system_power_action", { action: "settings" }).catch(console.error);
                onClose();
              }}
              className="w-[42px] h-[42px] rounded-full bg-sky-500/15 hover:bg-sky-500/25 active:bg-sky-500/35 flex items-center justify-center transition-colors border border-sky-500/30 text-sky-400 hover:text-sky-300 shadow-sm group cursor-pointer"
            >
              <SettingsIcon size={17} className="transition-transform duration-300 group-hover:rotate-45" />
            </motion.button>
          </Tooltip>

          {/* Screenshot */}
          <Tooltip content={t("cc_screenshot")} side="bottom" wrapperClassName="w-full flex justify-center">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              transition={iosSpring.press}
              onClick={(e) => {
                e.stopPropagation();
                invoke("system_power_action", { action: "screenshot" }).catch(console.error);
                onClose();
              }}
              className="w-[42px] h-[42px] rounded-full bg-purple-500/15 hover:bg-purple-500/25 active:bg-purple-500/35 flex items-center justify-center transition-colors border border-purple-500/30 text-purple-400 hover:text-purple-300 shadow-sm group cursor-pointer"
            >
              <Scissors size={17} className="transition-transform duration-200 group-hover:scale-105" />
            </motion.button>
          </Tooltip>

          {/* Clipboard */}
          <Tooltip content={t("tab_clipboard")} side="bottom" wrapperClassName="w-full flex justify-center">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              transition={iosSpring.press}
              onClick={(e) => {
                e.stopPropagation();
                onGoToTab("clipboard");
              }}
              className="w-[42px] h-[42px] rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 active:bg-emerald-500/35 flex items-center justify-center transition-colors border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 shadow-sm group cursor-pointer"
            >
              <ClipboardList size={17} className="transition-transform duration-200 group-hover:scale-105" />
            </motion.button>
          </Tooltip>

          {/* To-Do List */}
          <Tooltip content={t("tab_todo_list")} side="bottom" wrapperClassName="w-full flex justify-center">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              transition={iosSpring.press}
              onClick={(e) => {
                e.stopPropagation();
                onGoToTab("todo");
              }}
              className="w-[42px] h-[42px] rounded-full bg-amber-500/15 hover:bg-amber-500/25 active:bg-amber-500/35 flex items-center justify-center transition-colors border border-amber-500/30 text-amber-400 hover:text-amber-300 shadow-sm group cursor-pointer"
            >
              <ListTodo size={17} className="transition-transform duration-200 group-hover:scale-105" />
            </motion.button>
          </Tooltip>

          {/* File Shelf */}
          <Tooltip content={t("tab_file_shelf")} side="bottom" wrapperClassName="w-full flex justify-center">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              transition={iosSpring.press}
              onClick={(e) => {
                e.stopPropagation();
                onGoToTab("drop_shelf");
              }}
              className="w-[42px] h-[42px] rounded-full bg-cyan-500/15 hover:bg-cyan-500/25 active:bg-cyan-500/35 border border-cyan-500/30 text-cyan-400 hover:text-cyan-300 flex items-center justify-center transition-colors shadow-sm group cursor-pointer relative"
            >
              <FolderSync size={17} className="transition-transform duration-200 group-hover:scale-105" />
              {stashedFilesCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-cyan-400 text-neutral-950 text-[9px] font-bold flex items-center justify-center shadow-sm tabular-nums">
                  {stashedFilesCount}
                </span>
              )}
            </motion.button>
          </Tooltip>
        </div>

        {/* Power Mode Capsule Tile */}
        <Tooltip content={`${t("cc_power_eco")}: ${powerMode}`} side="bottom" wrapperClassName="w-full">
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            transition={iosSpring.press}
            onClick={handleNextPowerMode}
            className="w-full h-[54px] bg-[#1c1c1e]/90 hover:bg-white/[0.12] active:bg-white/[0.16] rounded-[20px] flex items-center gap-2 px-2.5 transition-colors border border-white/5 shadow-sm cursor-pointer select-none text-left"
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-colors ${
                powerMode === "Eco"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : powerMode === "Balanced"
                  ? "bg-sky-500/20 text-sky-400"
                  : "bg-rose-500/20 text-rose-400"
              }`}
            >
              <Gauge size={14} />
            </div>
            <div className="flex flex-col min-w-0 overflow-hidden w-full">
              <ScrollingText text={powerMode} className="text-[11.5px] font-bold text-white leading-tight w-full" />
              <span className="text-[9px] text-ios-secondary font-medium tracking-tight">
                {powerMode === "Eco" ? t("cc_power_eco") : powerMode === "Balanced" ? t("cc_power_balanced") : t("cc_power_performance")}
              </span>
            </div>
          </motion.button>
        </Tooltip>
      </motion.div>

      {/* Row 2: 2x2 Network/Focus Module + 2x2 Power Module */}
      <motion.div
        custom={slideDirection}
        variants={iosRiseVariants}
        className={`grid grid-cols-[1fr_110px] gap-2.5 ${isModeDropdownOpen ? "relative z-50" : "relative z-20"}`}
      >
        {/* Left Card: 2x2 Network & Focus */}
        <div
          className={`bg-[#1c1c1e]/90 rounded-[22px] p-2.5 grid grid-cols-2 gap-2 border border-white/5 shadow-sm ${
            isModeDropdownOpen ? "relative z-50" : "relative z-20"
          }`}
        >
          {/* Wi-Fi */}
          <div
            onClick={handleOpenWifi}
            className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.14] transition-colors cursor-pointer min-w-0 text-left select-none group"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Tooltip content={isWifiOn ? "Turn Wi-Fi Off" : "Turn Wi-Fi On"} side="top">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  transition={iosSpring.press}
                  onClick={handleQuickToggleWifi}
                  className={`w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 shadow-md transition-all duration-300 cursor-pointer ${
                    isWifiConnected
                      ? "bg-[#0a84ff] text-white shadow-[0_0_14px_rgba(10,132,255,0.45)] hover:bg-[#0071e3]"
                      : isWifiOn
                      ? "bg-sky-500/20 text-sky-400 hover:bg-sky-500/30"
                      : "bg-white/10 text-white/40 hover:bg-white/15"
                  }`}
                >
                  <Wifi size={14} className={isWifiConnected ? "text-white" : isWifiOn ? "text-sky-400" : "text-white/40"} />
                </motion.button>
              </Tooltip>
              <div className="flex flex-col min-w-0 overflow-hidden flex-1">
                <div className="flex items-center gap-1">
                  {!isWifiConnected || networkPing === null ? (
                    <span className="text-[11px] font-bold text-white leading-tight whitespace-nowrap">Wi-Fi</span>
                  ) : (
                    <span className="text-[9.5px] font-mono text-neutral-300 bg-white/10 px-1 py-0.2 rounded flex shrink-0 items-center tracking-tighter whitespace-nowrap">
                      <span className="text-white mr-1">●</span>
                      {networkPing} ms
                    </span>
                  )}
                </div>
                <ScrollingText
                  text={isWifiOn ? (isWifiConnected ? wifiName : t("cc_not_connected")) : "Off"}
                  className="text-[9px] text-ios-secondary font-medium mt-0.5 truncate"
                />
              </div>
            </div>
            <ChevronRight size={13} className="shrink-0 text-white/30 group-hover:text-white/70 transition-colors ml-0.5" />
          </div>

          {/* Focus Mode (with iOS Dropdown Menu) */}
          <div className={`relative w-full ${isModeDropdownOpen ? "z-50" : ""}`}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              transition={iosSpring.press}
              onClick={(e) => {
                e.stopPropagation();
                setIsModeDropdownOpen((prev) => !prev);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openUrl("ms-settings:quiethours").catch(console.error);
              }}
              className={`w-full flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.14] transition-colors cursor-pointer min-w-0 text-left select-none group ${
                isModeDropdownOpen ? "bg-white/10 ring-1 ring-white/15" : ""
              }`}
            >
              <div
                className={`w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 shadow-md transition-all duration-300 ${
                  focusMode === "Normal"
                    ? "bg-[#ff9f0a] text-white shadow-[0_0_14px_rgba(255,159,10,0.45)]"
                    : focusMode === "DND"
                    ? "bg-[#5e5ce6] text-white shadow-[0_0_14px_rgba(94,92,230,0.45)]"
                    : focusMode === "Gaming"
                    ? "bg-[#ff375f] text-white shadow-[0_0_14px_rgba(255,55,95,0.45)]"
                    : "bg-[#40c8e0] text-white shadow-[0_0_14px_rgba(64,200,224,0.45)]"
                }`}
              >
                {focusMode === "Normal" && <Bell size={14} className="text-white" />}
                {focusMode === "DND" && <BellOff size={14} className="text-white" />}
                {focusMode === "Gaming" && <Gamepad2 size={14} className="text-white" />}
                {focusMode === "Sleep" && <BedDouble size={14} className="text-white" />}
              </div>
              <div className="flex flex-col min-w-0 overflow-hidden flex-1">
                <span className="text-[11px] font-bold text-white leading-tight truncate">
                  {currentFocusOption ? currentFocusOption.label : focusMode}
                </span>
                <ScrollingText
                  text={currentFocusOption ? currentFocusOption.desc : ""}
                  className={`text-[9px] font-medium mt-0.5 w-full ${
                    focusMode === "Normal"
                      ? "text-amber-300/80 font-medium"
                      : focusMode === "DND"
                      ? "text-indigo-300 font-semibold"
                      : focusMode === "Gaming"
                      ? "text-rose-300 font-semibold"
                      : "text-teal-300 font-semibold"
                  }`}
                />
              </div>
              <div className="shrink-0 pr-0.5 text-white/40 group-hover:text-white/80 transition-colors">
                {isModeDropdownOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </div>
            </motion.button>

            {/* iOS Style Floating UIMenu */}
            <AnimatePresence>
              {isModeDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[90]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsModeDropdownOpen(false);
                    }}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: -4 }}
                    transition={iosSpring.snappy}
                    className="absolute z-[100] top-[calc(100%+6px)] right-0 w-[170px] bg-[#1c1c1e] border border-white/20 rounded-2xl p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.95)] flex flex-col gap-0.5 select-none pointer-events-auto backdrop-blur-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {focusModeOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectFocusMode(opt.id);
                          setIsModeDropdownOpen(false);
                        }}
                        className={`w-full h-[32px] flex items-center justify-between px-2 rounded-xl transition-all cursor-pointer text-left ${
                          focusMode === opt.id
                            ? "bg-white/15 text-white shadow-sm"
                            : "hover:bg-white/5 text-neutral-300 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-[20px] h-[20px] rounded-[6px] ${opt.color} flex items-center justify-center shrink-0 shadow-sm`}>
                            {opt.icon}
                          </div>
                          <span className="text-[11px] font-semibold leading-none">{opt.label}</span>
                        </div>
                        {focusMode === opt.id && (
                          <Check size={12} strokeWidth={2.5} className="text-white shrink-0 ml-1.5" />
                        )}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Bluetooth */}
          <div
            onClick={handleOpenBt}
            className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.14] transition-colors cursor-pointer min-w-0 text-left select-none group"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Tooltip content={isBtOn ? "Turn Bluetooth Off" : "Turn Bluetooth On"} side="top">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  transition={iosSpring.press}
                  onClick={handleQuickToggleBt}
                  className={`w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 shadow-md transition-all duration-300 cursor-pointer ${
                    isBtConnected
                      ? "bg-[#0a84ff] text-white shadow-[0_0_14px_rgba(10,132,255,0.45)] hover:bg-[#0071e3]"
                      : isBtOn
                      ? "bg-sky-500/20 text-sky-400 hover:bg-sky-500/30"
                      : "bg-white/10 text-white/40 hover:bg-white/15"
                  }`}
                >
                  <Bluetooth size={14} className={isBtConnected ? "text-white" : isBtOn ? "text-sky-400" : "text-white/40"} />
                </motion.button>
              </Tooltip>
              <div className="flex flex-col min-w-0 overflow-hidden flex-1">
                <span className="text-[11px] font-bold text-white leading-tight truncate">
                  {hasBtBattery ? btBatteryText : "Bluetooth"}
                </span>
                <ScrollingText
                  text={isBtOn ? (cleanBtName || t("cc_not_connected")) : "Off"}
                  className="text-[9px] text-ios-secondary font-medium mt-0.5 truncate"
                />
              </div>
            </div>
            <ChevronRight size={13} className="shrink-0 text-white/30 group-hover:text-white/70 transition-colors ml-0.5" />
          </div>

          {/* Hotspot */}
          <Tooltip content={isHotspotOn ? t("cc_hotspot_on") : t("cc_hotspot_off")} side="top" wrapperClassName="w-full">
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              transition={iosSpring.press}
              onClick={onToggleHotspot}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openUrl("ms-settings:network-mobilehotspot").catch(console.error);
              }}
              className="w-full flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.14] transition-colors cursor-pointer min-w-0 text-left select-none group"
            >
              <div
                className={`w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 shadow-md transition-all duration-300 ${
                  isHotspotOn
                    ? "bg-[#34c759] text-white shadow-[0_0_14px_rgba(52,199,89,0.45)]"
                    : "bg-white/10 text-white/40"
                }`}
              >
                <Radio size={14} className={isHotspotOn ? "text-white animate-pulse" : "text-white/40"} />
              </div>
              <div className="flex flex-col min-w-0 overflow-hidden w-full">
                <span className="text-[11px] font-bold text-white leading-tight whitespace-nowrap">Hotspot</span>
                <span
                  className={`text-[9px] font-medium mt-0.5 truncate ${
                    isHotspotOn ? "text-emerald-300 font-semibold" : "text-ios-secondary"
                  }`}
                >
                  {isHotspotOn ? t("cc_hotspot_active") : t("cc_hotspot_inactive")}
                </span>
              </div>
            </motion.button>
          </Tooltip>
        </div>

        {/* Right Card: 2x2 System Power Actions */}
        <div className="grid grid-cols-2 gap-2 aspect-square bg-[#1c1c1e]/90 rounded-[22px] p-2 border border-white/5 shadow-sm">
          {/* Lock */}
          <Tooltip content={t("cc_lock_pc")} side="bottom" wrapperClassName="w-full h-full">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              transition={iosSpring.press}
              onClick={(e) => {
                e.stopPropagation();
                invoke("system_power_action", { action: "lock" }).catch(console.error);
                onClose();
              }}
              className="w-full h-full bg-white/[0.04] hover:bg-amber-500/15 active:bg-amber-500/25 rounded-[16px] flex items-center justify-center transition-colors border border-white/5 hover:border-amber-500/30 text-amber-400 hover:text-amber-300 shadow-sm cursor-pointer"
            >
              <Lock size={16} />
            </motion.button>
          </Tooltip>

          {/* Sleep */}
          <Tooltip content={t("cc_sleep_pc")} side="bottom" wrapperClassName="w-full h-full">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              transition={iosSpring.press}
              onClick={(e) => {
                e.stopPropagation();
                invoke("system_power_action", { action: "sleep" }).catch(console.error);
                onClose();
              }}
              className="w-full h-full bg-white/[0.04] hover:bg-indigo-500/15 active:bg-indigo-500/25 rounded-[16px] flex items-center justify-center transition-colors border border-white/5 hover:border-indigo-500/30 text-indigo-400 hover:text-indigo-300 shadow-sm cursor-pointer"
            >
              <Moon size={16} />
            </motion.button>
          </Tooltip>

          {/* Restart */}
          <Tooltip content={t("cc_restart_pc")} side="top" wrapperClassName="w-full h-full">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              transition={iosSpring.press}
              onClick={(e) => {
                e.stopPropagation();
                invoke("system_power_action", { action: "restart" }).catch(console.error);
                onClose();
              }}
              className="w-full h-full bg-white/[0.04] hover:bg-sky-500/15 active:bg-sky-500/25 rounded-[16px] flex items-center justify-center transition-colors border border-white/5 hover:border-sky-500/30 text-sky-400 hover:text-sky-300 shadow-sm cursor-pointer"
            >
              <RotateCcw size={16} />
            </motion.button>
          </Tooltip>

          {/* Shutdown */}
          <Tooltip content={t("cc_shutdown_pc")} side="top" wrapperClassName="w-full h-full">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              transition={iosSpring.press}
              onClick={(e) => {
                e.stopPropagation();
                invoke("system_power_action", { action: "shutdown" }).catch(console.error);
                onClose();
              }}
              className="w-full h-full bg-white/[0.04] hover:bg-rose-500/15 active:bg-rose-500/25 rounded-[16px] flex items-center justify-center transition-colors border border-white/5 hover:border-rose-500/30 text-rose-400 hover:text-rose-300 shadow-sm cursor-pointer"
            >
              <Power size={16} />
            </motion.button>
          </Tooltip>
        </div>
      </motion.div>

      {/* Row 3: iOS Capsule Sliders */}
      <motion.div
        custom={slideDirection}
        variants={iosRiseVariants}
        className="flex flex-col gap-2.5 bg-[#1c1c1e]/90 rounded-[22px] p-2.5 border border-white/5 shadow-sm relative z-10"
      >
        {/* Brightness Slider */}
        <IosSlider
          value={displayLevel}
          onChange={handleBrightnessChange}
          label={t("cc_brightness")}
          fillColor="bg-white"
          iconActiveColor="text-neutral-900"
          icon={<Sun size={15} className={displayLevel > 14 ? "text-neutral-900" : "text-amber-400"} />}
          actionButton={
            <Tooltip content={t("cc_brightness_mode")} side="left">
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                transition={iosSpring.press}
                onClick={handleNextBrightnessMode}
                className="w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.18] flex items-center justify-center cursor-pointer transition-colors group shrink-0"
              >
                {brightnessMode === "manual" ? (
                  <Sun size={14} className="text-amber-400 group-hover:text-amber-300 transition-colors" />
                ) : brightnessMode === "reading" ? (
                  <Moon size={14} className="text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                ) : (
                  <div className="w-[14px] h-[14px] flex items-center justify-center text-[11px] font-bold text-sky-400 group-hover:text-sky-300 transition-colors">
                    A
                  </div>
                )}
              </motion.button>
            </Tooltip>
          }
        />

        {/* Volume Slider */}
        <IosSlider
          value={soundLevel}
          onChange={handleVolumeChange}
          label={t("cc_volume")}
          fillColor="bg-white"
          iconActiveColor="text-neutral-900"
          icon={<Volume2 size={15} className={soundLevel > 14 ? "text-neutral-900" : "text-sky-400"} />}
          actionButton={
            <Tooltip content={t("tab_volume_mixer")} side="left">
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                transition={iosSpring.press}
                onClick={() => onGoToTab("volume_mixer", 1)}
                className="w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.18] flex items-center justify-center cursor-pointer transition-colors group shrink-0"
              >
                <SlidersHorizontal size={14} className="text-sky-400 group-hover:text-sky-300 transition-colors" />
              </motion.button>
            </Tooltip>
          }
        />
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
};
