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

interface NavbarStartLauncherFlyoutProps {
  onClose: () => void;
  accentColor?: string;
}

export const NavbarStartLauncherFlyout: React.FC<NavbarStartLauncherFlyoutProps> = ({
  onClose,
  accentColor = "#3882F6",
}) => {
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
    window.addEventListener("mousedown", handleDown);
    return () => window.removeEventListener("mousedown", handleDown);
  }, [onClose]);

  const apps = [
    { id: "explorer", name: "File Explorer", icon: "/logo/chrome.png", action: () => invoke("trigger_file_explorer") },
    { id: "chrome", name: "Google Chrome", icon: "/logo/chrome.png", action: () => invoke("launch_target", { target: "chrome" }) },
    { id: "vscode", name: "Visual Studio Code", action: () => invoke("launch_target", { target: "code" }) },
    { id: "terminal", name: "Terminal", action: () => invoke("launch_target", { target: "wt" }) },
    { id: "settings", name: "Pengaturan Gili", action: () => invoke("open_settings_window", { section: "navbar" }) },
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
      className="absolute bottom-full mb-3.5 left-4 w-[340px] p-4 rounded-[22px] bg-[#0c0c10] border backdrop-blur-2xl text-white select-none pointer-events-auto z-50 flex flex-col gap-3.5"
    >
      {/* Search Input */}
      <div className="relative flex items-center">
        <Search size={16} className="absolute left-3 text-white/40 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari aplikasi atau berkas..."
          style={{ borderColor: query ? accentColor : undefined }}
          className="w-full h-10 pl-9 pr-3 rounded-[12px] bg-[#18181f] border border-white/[0.06] text-white text-[13px] placeholder:text-white/40 outline-none transition-colors"
        />
      </div>

      {/* Pinned / Recent Apps Grid */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider px-1">
          Aplikasi Disematkan
        </span>
        <div className="grid grid-cols-4 gap-2 pt-1">
          {filtered.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={async () => {
                await app.action();
                onClose();
              }}
              className="flex flex-col items-center gap-1.5 p-2 rounded-[12px] hover:bg-white/[0.08] transition-colors cursor-pointer group text-center"
            >
              <div className="w-10 h-10 rounded-[10px] bg-[#1a1a22] flex items-center justify-center text-white/80 group-hover:scale-105 transition-transform">
                {app.id === "chrome" ? (
                  <img src="/logo/chrome.png" className="w-6 h-6 object-contain" alt="" />
                ) : app.id === "explorer" ? (
                  <Folder size={20} className="text-amber-400" />
                ) : app.id === "vscode" ? (
                  <Code2 size={20} className="text-blue-400" />
                ) : app.id === "terminal" ? (
                  <Terminal size={19} className="text-emerald-400" />
                ) : (
                  <Settings size={19} className="text-blue-400" />
                )}
              </div>
              <span className="text-[10.5px] text-white/80 line-clamp-1 w-full truncate">
                {app.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer Power Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
        <div className="flex items-center gap-2">
          <img src="/logo/LOGO-GILI.png" className="w-5 h-5 object-contain opacity-80" alt="Gili" />
          <span className="text-[12px] font-semibold text-white/70">Gili OS</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Kunci Layar"
            onClick={() => handlePowerAction("lock")}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
          >
            <Lock size={14} />
          </button>
          <button
            type="button"
            title="Tidur"
            onClick={() => handlePowerAction("sleep")}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
          >
            <Moon size={14} />
          </button>
          <button
            type="button"
            title="Muat Ulang"
            onClick={() => handlePowerAction("restart")}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            title="Matikan Daya"
            onClick={() => handlePowerAction("shutdown")}
            className="w-8 h-8 rounded-full hover:bg-red-500/20 text-white/60 hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Power size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
