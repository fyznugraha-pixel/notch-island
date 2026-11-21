import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { NavbarConfig, DEFAULT_NAVBAR_CONFIG } from "../../../types/navbar";
import {
  loadNavbarConfig,
  saveNavbarConfig,
  subscribeToNavbarConfig,
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
import { NavbarStyleShareModal } from "./NavbarStyleShareModal";
import { TaskbarProBanner } from "./TaskbarProBanner";
import { getNavbarModuleById } from "../../../modules/registry";
import { isSameCatalogModuleId } from "../../../modules/moduleAliases";
import { LayoutTemplate, RotateCcw, Share2 } from "lucide-react";
import { Language, getLanguage } from "../../../services/i18n";
import { useGiliProLicense } from "../../../hooks/useGiliProLicense";

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
  const [isStyleShareOpen, setIsStyleShareOpen] = useState(false);
  const {
    proStatus,
    isProLocked,
    isPurchasing,
    isRefreshingLicense,
    proFeedback,
    bannerPulse,
    proBannerRef,
    handlePurchasePro,
    handleRefreshLicense,
    promptProUpgrade,
  } = useGiliProLicense(currentLang);
  const configRef = useRef<NavbarConfig>(DEFAULT_NAVBAR_CONFIG);
  configRef.current = config;

  const [undoSnapshot, setUndoSnapshot] = useState<{
    prevConfig: NavbarConfig;
    presetName: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    loadNavbarConfig().then((loaded) => {
      if (!active) return;
      setConfig(loaded);
      setIsLoading(false);
    });
    const unsubscribe = subscribeToNavbarConfig((synced) => {
      setConfig(synced);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const effectiveEnabled = !isProLocked && config.enabled;

  const handleAddModule = (
    moduleId: string,
    preferredView?: "compact" | "full"
  ) => {
    const existingIndex = config.modules.findIndex((m) =>
      isSameCatalogModuleId(m.id, moduleId)
    );
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
      id: def?.id || moduleId,
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
    const safePatch: Partial<NavbarConfig> = isProLocked
      ? {
          ...patch,
          ...(patch.enabled !== undefined ? { enabled: false } : {}),
          ...(patch.hideWindowsTaskbar !== undefined ? { hideWindowsTaskbar: false } : {}),
        }
      : patch;

    const nextConfig: NavbarConfig = { ...config, ...safePatch };
    setConfig(nextConfig);

    await saveNavbarConfig(nextConfig);

    if (isProLocked) {
      return;
    }

    if (safePatch.enabled !== undefined) {
      try {
        await invoke("toggle_navbar", { enabled: safePatch.enabled });
        if (safePatch.enabled && nextConfig.hideWindowsTaskbar) {
          await invoke("set_windows_taskbar_visible", { visible: false });
        } else if (!safePatch.enabled) {
          await invoke("set_windows_taskbar_visible", { visible: true });
        }
      } catch (err) {
        console.error("Failed to toggle navbar:", err);
      }
    }

    if (safePatch.hideWindowsTaskbar !== undefined) {
      try {
        if (nextConfig.enabled) {
          await invoke("set_windows_taskbar_visible", {
            visible: !safePatch.hideWindowsTaskbar,
          });
        }
      } catch (err) {
        console.error("Failed to toggle taskbar visibility:", err);
      }
    }
  };

  const enableUnlockedNavbar = async (autoEnable: boolean) => {
    if (!autoEnable) return;
    const unlockedConfig: NavbarConfig = {
      ...configRef.current,
      enabled: true,
    };
    setConfig(unlockedConfig);
    await saveNavbarConfig(unlockedConfig);
    await invoke("toggle_navbar", { enabled: true }).catch(() => {});
    if (unlockedConfig.hideWindowsTaskbar) {
      await invoke("set_windows_taskbar_visible", { visible: false }).catch(() => {});
    }
  };

  const handlePurchase = (autoEnableAfter = false) =>
    handlePurchasePro(( ) => enableUnlockedNavbar(autoEnableAfter));

  const handleRequirePro = () => promptProUpgrade(() => enableUnlockedNavbar(true));

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
      await invoke("toggle_navbar", { enabled: DEFAULT_NAVBAR_CONFIG.enabled });
      await invoke("set_windows_taskbar_visible", {
        visible: !DEFAULT_NAVBAR_CONFIG.hideWindowsTaskbar,
      });
      await invoke("broadcast_navbar_config_update", {
        config: DEFAULT_NAVBAR_CONFIG,
      });
      await emit("navbar_config_updated", DEFAULT_NAVBAR_CONFIG);
      await emit("gili-navbar-config-sync", DEFAULT_NAVBAR_CONFIG);
    } catch {}
  };

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center p-12 text-[12px] ${
          isLightMode ? "text-neutral-600" : "text-zinc-400"
        }`}
      >
        {isId ? "Memuat konfigurasi Taskbar..." : "Loading Taskbar configuration..."}
      </div>
    );
  }

  const enabledModulesCount = config.modules.filter((m) => m.enabled).length;

  return (
    <div className="flex flex-col gap-5 pb-12 w-full select-none">
      {/* 1. Top Quick Status & Presets Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-semibold border ${
              effectiveEnabled
                ? isLightMode
                  ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                  : "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                : isProLocked
                ? isLightMode
                  ? "bg-[#eff6ff] text-[#1d4ed8] border-blue-600/25"
                  : "bg-[#0a84ff]/15 text-[#93c5fd] border-[#60a5fa]/30"
                : isLightMode
                ? "bg-black/[0.05] text-neutral-600 border-black/[0.08]"
                : "bg-white/[0.06] text-zinc-400 border-white/[0.08]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                effectiveEnabled
                  ? "bg-emerald-500"
                  : isProLocked
                  ? "bg-[#60a5fa]"
                  : "bg-zinc-500"
              }`}
            />
            {effectiveEnabled
              ? isId
                ? "Taskbar Aktif"
                : "Taskbar Enabled"
              : isProLocked
              ? isId
                ? "Gili Pro · Mode Preview"
                : "Gili Pro · Preview Only"
              : isId
              ? "Taskbar Nonaktif"
              : "Taskbar Disabled"}
          </span>
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              isLightMode
                ? "bg-white text-neutral-600 border-black/[0.08]"
                : "bg-white/[0.04] text-zinc-400 border-white/[0.07]"
            }`}
          >
            {isId
              ? `${enabledModulesCount} modul aktif`
              : `${enabledModulesCount} active modules`}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => setIsStyleShareOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-[10px] border text-[12px] font-semibold transition-all cursor-pointer shrink-0 ${
              isLightMode
                ? "bg-black/[0.04] text-neutral-800 hover:bg-black/[0.08] border-black/10"
                : "bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1] border-white/10"
            }`}
          >
            <Share2 size={14} />
            <span>{isId ? "Bagikan Style" : "Share Style"}</span>
          </button>
          <button
            type="button"
            onClick={() => setIsPresetsOpen(true)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] border text-[12px] font-semibold transition-all cursor-pointer shrink-0 ${
              isLightMode
                ? "bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 border-blue-500/25"
                : "bg-[#0a84ff]/15 text-[#60a5fa] hover:bg-[#0a84ff]/25 border-[#0a84ff]/30"
            }`}
          >
            <LayoutTemplate size={14} />
            <span>{isId ? "Preset Taskbar" : "Taskbar Presets"}</span>
          </button>
        </div>
      </div>

      {/* Undo Preset Banner */}
      {undoSnapshot && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-[12px] border text-[12px] ${
            isLightMode
              ? "bg-blue-50/90 border-blue-500/35 text-neutral-900"
              : "bg-[#111829] border-[#2f8bff]/40 text-[#e4e4e7]"
          }`}
        >
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
              className={`px-2 py-1 cursor-pointer transition-colors ${
                isLightMode
                  ? "text-neutral-600 hover:text-neutral-900"
                  : "text-[#8a8fa0] hover:text-white"
              }`}
            >
              {isId ? "Tutup" : "Dismiss"}
            </button>
          </div>
        </div>
      )}

      {/* Pro Upgrade Banner (MSIX Store builds when locked) */}
      {isProLocked && (
        <div ref={proBannerRef}>
          <TaskbarProBanner
            context="taskbar"
            proStatus={proStatus}
            isPurchasing={isPurchasing}
            isRefreshing={isRefreshingLicense}
            feedback={proFeedback}
            highlightPulse={bannerPulse}
            onPurchase={() => handlePurchase(true)}
            onRefreshLicense={() => handleRefreshLicense()}
            isLightMode={isLightMode}
            optLanguage={currentLang}
          />
        </div>
      )}

      {/* 2. Sticky Live Preview */}
      <NavbarLivePreview
        config={config}
        isProLocked={isProLocked}
        isLightMode={isLightMode}
      />

      {/* 3. Shape & Sizing */}
      <NavbarShapeCard
        config={config}
        onChange={handlePatch}
        isProLocked={isProLocked}
        onRequirePro={handleRequirePro}
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
        isProLocked={isProLocked}
        onRequirePro={handleRequirePro}
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

      {/* 11. Share & Import Style Modal */}
      <NavbarStyleShareModal
        isOpen={isStyleShareOpen}
        onClose={() => setIsStyleShareOpen(false)}
        config={config}
        onApplyStyle={handleApplyPreset}
        isLightMode={isLightMode}
        optLanguage={currentLang}
      />
    </div>
  );
};
