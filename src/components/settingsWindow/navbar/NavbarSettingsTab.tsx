import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { NavbarConfig, DEFAULT_NAVBAR_CONFIG } from "../../../types/navbar";
import {
  loadNavbarConfig,
  saveNavbarConfig,
} from "../../../services/navbarConfigService";
import { NavbarLivePreview } from "./NavbarLivePreview";
import { NavbarShapeCard } from "./NavbarShapeCard";
import { NavbarPositionCard } from "./NavbarPositionCard";
import { NavbarLookCard } from "./NavbarLookCard";
import { NavbarBehaviorCard } from "./NavbarBehaviorCard";
import { NavbarModulesOrderCard } from "./NavbarModulesOrderCard";

interface NavbarSettingsTabProps {
  isLightMode?: boolean;
}

export const NavbarSettingsTab: React.FC<NavbarSettingsTabProps> = ({
  isLightMode = false,
}) => {
  const [config, setConfig] = useState<NavbarConfig>(DEFAULT_NAVBAR_CONFIG);
  const [isLoading, setIsLoading] = useState(true);

  // Load config on mount
  useEffect(() => {
    loadNavbarConfig().then((loaded) => {
      setConfig(loaded);
      setIsLoading(false);
    });
  }, []);

  // Patch and synchronize configuration
  const handlePatch = async (patch: Partial<NavbarConfig>) => {
    const nextConfig: NavbarConfig = { ...config, ...patch };
    setConfig(nextConfig);

    // Save persisted config
    await saveNavbarConfig(nextConfig);

    // If master enable changed, toggle backend navbar window
    if (patch.enabled !== undefined) {
      try {
        await invoke("toggle_navbar", { enabled: patch.enabled });
      } catch (err) {
        console.error("Failed to toggle navbar:", err);
      }
    }

    // If taskbar hide setting changed, call taskbar manager
    if (patch.hideWindowsTaskbar !== undefined) {
      try {
        await invoke("set_windows_taskbar_visible", {
          visible: !patch.hideWindowsTaskbar,
        });
      } catch (err) {
        console.error("Failed to toggle taskbar visibility:", err);
      }
    }

    // Emit live update to navbar window
    try {
      await emit("navbar_config_updated", nextConfig);
    } catch {}
  };

  const handleReset = async () => {
    setConfig(DEFAULT_NAVBAR_CONFIG);
    await saveNavbarConfig(DEFAULT_NAVBAR_CONFIG);
    try {
      await emit("navbar_config_updated", DEFAULT_NAVBAR_CONFIG);
    } catch {}
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-zinc-400 text-[12px]">
        Memuat konfigurasi Navbar...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-12 w-full max-w-[720px] mx-auto select-none">
      {/* 1. Header */}
      <div className="flex flex-col gap-1 pb-1">
        <h1
          className={`text-[20px] font-bold tracking-tight ${
            isLightMode ? "text-neutral-900" : "text-white"
          }`}
        >
          Navbar Gili
        </h1>
        <p
          className={`text-[12.5px] leading-relaxed ${
            isLightMode ? "text-neutral-500" : "text-zinc-400"
          }`}
        >
          Pengganti taskbar Windows dengan auto-layout, sayap lekukan terbalik,
          dan 40 modul interaktif.
        </p>
      </div>

      {/* 2. Sticky Live Preview */}
      <NavbarLivePreview config={config} isLightMode={isLightMode} />

      {/* 3. Shape & Sizing */}
      <NavbarShapeCard
        config={config}
        onChange={handlePatch}
        isLightMode={isLightMode}
      />

      {/* 4. Position & Monitor */}
      <NavbarPositionCard
        config={config}
        onChange={handlePatch}
        isLightMode={isLightMode}
      />

      {/* 5. Colors & Look */}
      <NavbarLookCard
        config={config}
        onChange={handlePatch}
        isLightMode={isLightMode}
      />

      {/* 6. Modules & Ordering */}
      <NavbarModulesOrderCard
        config={config}
        onChange={handlePatch}
        onOpenAddModule={() => {
          // Will open AddModuleDialog in Fase 6
        }}
        isLightMode={isLightMode}
      />

      {/* 7. Behavior & Taskbar Sync */}
      <NavbarBehaviorCard
        config={config}
        onChange={handlePatch}
        onReset={handleReset}
        isLightMode={isLightMode}
      />
    </div>
  );
};
