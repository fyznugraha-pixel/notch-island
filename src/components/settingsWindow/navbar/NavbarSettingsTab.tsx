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
import { NavbarIconThemeCard } from "./NavbarIconThemeCard";
import { NavbarBehaviorCard } from "./NavbarBehaviorCard";
import { NavbarModulesOrderCard } from "./NavbarModulesOrderCard";
import { AddModuleDialog } from "./AddModuleDialog";
import { NavbarPresetsModal } from "./NavbarPresetsModal";
import { getNavbarModuleById } from "../../../modules/registry";
import { LayoutTemplate, RotateCcw } from "lucide-react";
import { Language, getLanguage } from "../../../services/i18n";

interface NavbarSettingsTabProps {
  isLightMode?: boolean;
  optLanguage?: Language;
}

export const NavbarSettingsTab: React.FC<NavbarSettingsTabProps> = ({
  isLightMode = false,
  optLanguage,
}) => {
  const currentLang = optLanguage || getLanguage();
  const isId = currentLang === "id";
  const [config, setConfig] = useState<NavbarConfig>(DEFAULT_NAVBAR_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModuleOpen, setIsAddModuleOpen] = useState(false);
  const [isPresetsOpen, setIsPresetsOpen] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<{
    prevConfig: NavbarConfig;
    presetName: string;
  } | null>(null);

  useEffect(() => {
    loadNavbarConfig().then((loaded) => {
      setConfig(loaded);
      setIsLoading(false);
    });
  }, []);

  const handleAddModule = (
    moduleId: string,
    preferredView?: "compact" | "full"
  ) => {
    const existingIndex = config.modules.findIndex((m) => m.id === moduleId);
    if (existingIndex !== -1) {
      if (preferredView) {
        const updated = config.modules.map((m, idx) =>
          idx === existingIndex ? { ...m, view: preferredView, enabled: true } : m
        );
        handlePatch({ modules: updated });
      }
      return;
    }
    const def = getNavbarModuleById(moduleId);
    const newModule = {
      id: moduleId,
      group: def?.group || (2 as const),
      enabled: true,
      view: preferredView || def?.defaultView || ("full" as const),
    };
    handlePatch({ modules: [...config.modules, newModule] });
  };

  const handleChangeModuleView = (
    moduleId: string,
    view: "compact" | "full"
  ) => {
    const nextModules = config.modules.map((m) =>
      m.id === moduleId ? { ...m, view } : m
    );
    handlePatch({ modules: nextModules });
  };

  const handleRemoveModule = (moduleId: string) => {
    handlePatch({
      modules: config.modules.filter((m) => m.id !== moduleId),
    });
  };

  const handlePatch = async (patch: Partial<NavbarConfig>) => {
    const nextConfig: NavbarConfig = { ...config, ...patch };
    setConfig(nextConfig);

    await saveNavbarConfig(nextConfig);

    if (patch.enabled !== undefined) {
      try {
        await invoke("toggle_navbar", { enabled: patch.enabled });
        if (patch.enabled && nextConfig.hideWindowsTaskbar) {
          await invoke("set_windows_taskbar_visible", { visible: false });
        } else if (!patch.enabled) {
          await invoke("set_windows_taskbar_visible", { visible: true });
        }
      } catch (err) {
        console.error("Failed to toggle navbar:", err);
      }
    }

    if (patch.hideWindowsTaskbar !== undefined) {
      try {
        if (nextConfig.enabled) {
          await invoke("set_windows_taskbar_visible", {
            visible: !patch.hideWindowsTaskbar,
          });
        }
      } catch (err) {
        console.error("Failed to toggle taskbar visibility:", err);
      }
    }
  };

  const handleApplyPreset = (
    presetPatch: Partial<NavbarConfig>,
    presetName: string
  ) => {
    setUndoSnapshot({ prevConfig: config, presetName });
    handlePatch(presetPatch);
  };

  const handleUndoPreset = () => {
    if (!undoSnapshot) return;
    const prev = undoSnapshot.prevConfig;
    setUndoSnapshot(null);
    handlePatch(prev);
  };

  const handleReset = async () => {
    setUndoSnapshot(null);
    setConfig(DEFAULT_NAVBAR_CONFIG);
    await saveNavbarConfig(DEFAULT_NAVBAR_CONFIG);
    try {
      await invoke("broadcast_navbar_config_update", {
        config: DEFAULT_NAVBAR_CONFIG,
      });
      await emit("navbar_config_updated", DEFAULT_NAVBAR_CONFIG);
      await emit("gili-navbar-config-sync", DEFAULT_NAVBAR_CONFIG);
    } catch {}
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-zinc-400 text-[12px]">
        {isId ? "Memuat konfigurasi Taskbar..." : "Loading Taskbar configuration..."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-12 w-full select-none">
      {/* 1. Header with Presets button */}
      <div className="flex items-center justify-between pb-1 gap-4">
        <div className="flex flex-col gap-1">
          <h1
            className={`text-[20px] font-bold tracking-tight ${
              isLightMode ? "text-neutral-900" : "text-white"
            }`}
          >
            Taskbar
          </h1>
          <p
            className={`text-[12.5px] leading-relaxed ${
              isLightMode ? "text-neutral-500" : "text-[#9aa0b0]"
            }`}
          >
            {isId
              ? "Bentuk bingkai, susunan modul & perilaku dock"
              : "Dock shape, modules arrangement & behavior"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsPresetsOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-[#131a2b] text-[#8db8ff] hover:bg-[#1a243b] border border-[#1f2942] text-[12px] font-semibold transition-all cursor-pointer shrink-0"
        >
          <LayoutTemplate size={14} />
          <span>{isId ? "Preset Taskbar" : "Taskbar Presets"}</span>
        </button>
      </div>

      {/* Undo Preset Banner */}
      {undoSnapshot && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-[12px] bg-[#111829] border border-[#2f8bff]/40 text-[12px] text-[#e4e4e7]">
          <span>
            {isId ? (
              <>
                <strong>{undoSnapshot.presetName}</strong> diterapkan ke taskbar.
              </>
            ) : (
              <>
                <strong>{undoSnapshot.presetName}</strong> applied to taskbar.
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUndoPreset}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[#2f8bff] text-white font-semibold hover:bg-[#1d7ae8] transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>{isId ? "Urungkan" : "Undo"}</span>
            </button>
            <button
              type="button"
              onClick={() => setUndoSnapshot(null)}
              className="px-2 py-1 text-[#8a8fa0] hover:text-white cursor-pointer"
            >
              {isId ? "Tutup" : "Dismiss"}
            </button>
          </div>
        </div>
      )}

      {/* 2. Sticky Live Preview */}
      <NavbarLivePreview config={config} isLightMode={isLightMode} />

      {/* 3. Shape & Sizing */}
      <NavbarShapeCard
        config={config}
        onChange={handlePatch}
        isLightMode={isLightMode}
        optLanguage={currentLang}
      />

      {/* 4. Position & Monitor */}
      <NavbarPositionCard
        config={config}
        onChange={handlePatch}
        isLightMode={isLightMode}
        optLanguage={currentLang}
      />

      {/* 5. Modules & Ordering */}
      <NavbarModulesOrderCard
        config={config}
        onChange={handlePatch}
        onOpenAddModule={() => setIsAddModuleOpen(true)}
        isLightMode={isLightMode}
        optLanguage={currentLang}
      />

      {/* 6. Colors & Look */}
      <NavbarLookCard
        config={config}
        onChange={handlePatch}
        isLightMode={isLightMode}
        optLanguage={currentLang}
      />

      {/* 7. App Icon Theme */}
      <NavbarIconThemeCard
        config={config}
        onChange={handlePatch}
        isLightMode={isLightMode}
        optLanguage={currentLang}
      />

      {/* 8. Behavior & Taskbar Sync */}
      <NavbarBehaviorCard
        config={config}
        onChange={handlePatch}
        onReset={handleReset}
        isLightMode={isLightMode}
        optLanguage={currentLang}
      />

      {/* 9. Add Module Gallery Modal */}
      <AddModuleDialog
        isOpen={isAddModuleOpen}
        onClose={() => setIsAddModuleOpen(false)}
        config={config}
        onAddModule={handleAddModule}
        onRemoveModule={handleRemoveModule}
        onChangeModuleView={handleChangeModuleView}
        isLightMode={isLightMode}
        optLanguage={currentLang}
      />

      {/* 10. Presets Modal */}
      <NavbarPresetsModal
        isOpen={isPresetsOpen}
        onClose={() => setIsPresetsOpen(false)}
        config={config}
        onApplyPreset={handleApplyPreset}
        isLightMode={isLightMode}
        optLanguage={currentLang}
      />
    </div>
  );
};
