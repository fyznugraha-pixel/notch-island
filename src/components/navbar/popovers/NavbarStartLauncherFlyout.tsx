import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Power,
  RotateCcw,
  Moon,
  Lock,
  Folder,
  Code2,
  Terminal,
  Settings,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { hexToRgba } from "../../../services/navbarConfigService";
import { Tooltip } from "../../ui/Tooltip";
import {
  useTaskbarLang,
  tx,
  getNavbarTooltipSide,
  type DockPosition,
} from "../../../services/taskbarI18n";
import {
  useNavbarLightMode,
  getInlineFlyoutPositionClass,
  getInlineFlyoutMotionOffset,
} from "../navbarThemeUtils";

interface NavbarStartLauncherFlyoutProps {
  onClose: () => void;
  accentColor?: string;
  position?: DockPosition;
  isLightMode?: boolean;
}

export const NavbarStartLauncherFlyout: React.FC<NavbarStartLauncherFlyoutProps> = ({
  onClose,
  accentColor = "#3882F6",
  position = "bottom",
  isLightMode: isLightModeProp,
}) => {
  const lang = useTaskbarLang();
  const isLightMode = useNavbarLightMode(isLightModeProp);
  const tooltipSide = getNavbarTooltipSide(position);
  const [query, setQuery] = useState("");
  const flyoutRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (flyoutRef.current && flyoutRef.current.contains(target)) return;
      if (target?.closest('[data-flyout-trigger="start"]')) return;
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

  const apps = [
    { id: "explorer", name: "File Explorer", icon: "/logo/chrome.png", action: () => invoke("trigger_file_explorer") },
    { id: "chrome", name: "Google Chrome", icon: "/logo/chrome.png", action: () => invoke("launch_target", { target: "chrome" }) },
    { id: "vscode", name: "Visual Studio Code", action: () => invoke("launch_target", { target: "code" }) },
    { id: "terminal", name: "Terminal", action: () => invoke("launch_target", { target: "wt" }) },
    { id: "settings", name: tx(lang, "Gili Settings", "Pengaturan Gili"), action: () => invoke("open_settings_window", { section: "navbar" }) },
  ];

  const filtered = apps.filter((a) =>
    a.name.toLowerCase().includes(query.toLowerCase())
  );

  const handlePowerAction = async (action: string) => {
    try {
      await invoke("system_power_action", { action });
      onClose();
    } catch {}
  };

  const lockLabel = tx(lang, "Lock Screen", "Kunci Layar");
  const sleepLabel = tx(lang, "Sleep", "Tidur");
  const restartLabel = tx(lang, "Restart", "Muat Ulang");
  const shutdownLabel = tx(lang, "Shut Down", "Matikan Daya");

  const motionInitial = getInlineFlyoutMotionOffset(position);
  const placementClass = getInlineFlyoutPositionClass(
    position,
    "left-4",
    "top-4"
  );

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
      className={`absolute ${placementClass} w-[340px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto p-4 rounded-[22px] border backdrop-blur-2xl select-none pointer-events-auto z-50 flex flex-col gap-3.5 ${
        isLightMode
          ? "bg-white/95 text-zinc-900"
          : "bg-[#0c0c10] text-white"
      }`}
    >
      {/* Search Input */}
      <div className="relative flex items-center">
        <Search
          size={16}
          className={`absolute left-3 pointer-events-none ${
            isLightMode ? "text-zinc-500" : "text-white/40"
          }`}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tx(lang, "Search apps or files...", "Cari aplikasi atau berkas...")}
          aria-label={tx(lang, "Search apps or files", "Cari aplikasi atau berkas")}
          style={{ borderColor: query ? accentColor : undefined }}
          className={`w-full h-10 pl-9 pr-3 rounded-[12px] border text-[13px] outline-none transition-colors ${
            isLightMode
              ? "bg-zinc-100 border-black/[0.08] text-zinc-900 placeholder:text-zinc-500"
              : "bg-[#18181f] border-white/[0.06] text-white placeholder:text-white/40"
          }`}
        />
      </div>

      {/* Pinned / Recent Apps Grid */}
      <div className="flex flex-col gap-1">
        <span
          className={`text-[11px] font-semibold uppercase tracking-wider px-1 ${
            isLightMode ? "text-zinc-500" : "text-white/40"
          }`}
        >
          {tx(lang, "Pinned Apps", "Aplikasi Disematkan")}
        </span>
        {filtered.length === 0 ? (
          <div
            className={`py-6 text-center text-[12px] ${
              isLightMode ? "text-zinc-500" : "text-white/45"
            }`}
          >
            {tx(lang, "No matching apps", "Aplikasi tidak ditemukan")}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 pt-1">
            {filtered.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={async () => {
                  await app.action();
                  onClose();
                }}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-[12px] transition-colors cursor-pointer group text-center ${
                  isLightMode ? "hover:bg-black/[0.06]" : "hover:bg-white/[0.08]"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-[10px] flex items-center justify-center group-hover:scale-105 transition-transform ${
                    isLightMode
                      ? "bg-zinc-100 text-zinc-800 border border-black/[0.06]"
                      : "bg-[#1a1a22] text-white/80"
                  }`}
                >
                  {app.id === "chrome" ? (
                    <img src="/logo/chrome.png" className="w-6 h-6 object-contain" alt="" />
                  ) : app.id === "explorer" ? (
                    <Folder size={20} className="text-amber-500" />
                  ) : app.id === "vscode" ? (
                    <Code2 size={20} className="text-blue-500" />
                  ) : app.id === "terminal" ? (
                    <Terminal size={19} className="text-emerald-500" />
                  ) : (
                    <Settings size={19} className="text-blue-500" />
                  )}
                </div>
                <span
                  className={`text-[10.5px] line-clamp-1 w-full truncate ${
                    isLightMode ? "text-zinc-800" : "text-white/80"
                  }`}
                >
                  {app.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer Power Controls */}
      <div
        className={`flex items-center justify-between pt-2 border-t ${
          isLightMode ? "border-black/[0.08]" : "border-white/[0.06]"
        }`}
      >
        <div className="flex items-center gap-2">
          <img src="/logo/LOGO-GILI.png" className="w-5 h-5 object-contain opacity-85" alt="Gili" />
          <span
            className={`text-[12px] font-semibold ${
              isLightMode ? "text-zinc-700" : "text-white/70"
            }`}
          >
            Gili OS
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip
            side={tooltipSide}
            delay={150}
            content={lockLabel}
            isLightMode={isLightMode}
          >
            <button
              type="button"
              aria-label={lockLabel}
              onClick={() => handlePowerAction("lock")}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                isLightMode
                  ? "hover:bg-black/[0.07] text-zinc-600 hover:text-zinc-900"
                  : "hover:bg-white/10 text-white/60 hover:text-white"
              }`}
            >
              <Lock size={14} />
            </button>
          </Tooltip>
          <Tooltip
            side={tooltipSide}
            delay={150}
            content={sleepLabel}
            isLightMode={isLightMode}
          >
            <button
              type="button"
              aria-label={sleepLabel}
              onClick={() => handlePowerAction("sleep")}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                isLightMode
                  ? "hover:bg-black/[0.07] text-zinc-600 hover:text-zinc-900"
                  : "hover:bg-white/10 text-white/60 hover:text-white"
              }`}
            >
              <Moon size={14} />
            </button>
          </Tooltip>
          <Tooltip
            side={tooltipSide}
            delay={150}
            content={restartLabel}
            isLightMode={isLightMode}
          >
            <button
              type="button"
              aria-label={restartLabel}
              onClick={() => handlePowerAction("restart")}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                isLightMode
                  ? "hover:bg-black/[0.07] text-zinc-600 hover:text-zinc-900"
                  : "hover:bg-white/10 text-white/60 hover:text-white"
              }`}
            >
              <RotateCcw size={14} />
            </button>
          </Tooltip>
          <Tooltip
            side={tooltipSide}
            delay={150}
            content={shutdownLabel}
            isLightMode={isLightMode}
          >
            <button
              type="button"
              aria-label={shutdownLabel}
              onClick={() => handlePowerAction("shutdown")}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                isLightMode
                  ? "hover:bg-red-500/15 text-zinc-600 hover:text-red-600"
                  : "hover:bg-red-500/20 text-white/60 hover:text-red-400"
              }`}
            >
              <Power size={14} />
            </button>
          </Tooltip>
        </div>
      </div>
    </motion.div>
  );
};
