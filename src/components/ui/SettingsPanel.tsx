import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { Language } from "../../services/i18n";
import {
  checkForAppUpdate,
  downloadAndInstallAppUpdate,
  UpdateInfo,
  UpdateStatus,
} from "../../services/updateService";
import {
  IdleLayoutConfig,
  IdleRuntimeData,
} from "./IdleLayoutSetting";
import { SettingsSubnav, SettingsSubtab } from "./settings/SettingsSubnav";
import { GeneralTab } from "./settings/GeneralTab";
import { AppearanceTab } from "./settings/AppearanceTab";
import { IdleTab } from "./settings/IdleTab";
import { ModulesTab } from "./settings/ModulesTab";
import { AdvancedTab } from "./settings/AdvancedTab";
import { SearchResults } from "./settings/SearchResults";
import { clearAllLyricsCache } from "../../services/lyricsService";
import { clearArtworkCache } from "../../services/artworkService";
import { clearShelfPreviewCache } from "../../services/shelfService";
import { clearWeatherCache } from "../../services/weatherService";

export interface SettingsPanelProps {
  slideDirection: number;
  // General
  optLanguage: Language;
  onChangeLanguage: (lang: Language) => void;
  optAutoCompact: boolean;
  onToggleAutoCompact: () => void;
  isAutostart: boolean;
  onToggleAutostart: () => void;
  showGreeting: boolean;
  onToggleGreeting: () => void;
  greetingNameMode: "auto" | "custom";
  onChangeGreetingNameMode: (mode: "auto" | "custom") => void;
  customGreetingName: string;
  onChangeCustomGreetingName: (name: string) => void;
  onTestGreeting?: () => void;
  onTestNotification?: () => void;
  optNotifTime: number;
  onChangeNotifTime: (sec: number) => void;
  optNotifSound: string;
  onChangeNotifSound: (soundId: string) => void;
  optCloseDelay: number;
  onChangeCloseDelay: (sec: number) => void;
  // Appearance
  optTheme: "dark" | "light" | "auto";
  onChangeTheme: (theme: "dark" | "light" | "auto") => void;
  notchShape: "notch" | "island";
  onChangeNotchShape: (shape: "notch" | "island") => void;
  islandTopOffset: number;
  onChangeIslandTopOffset: (offset: number) => void;
  idleLayout: IdleLayoutConfig;
  onChangeIdleLayout: (layout: IdleLayoutConfig) => void;
  idleRuntimeData: IdleRuntimeData;
  optIdleSize: "compact" | "default" | "large";
  onChangeIdleSize: (size: "compact" | "default" | "large") => void;
  optTabSize: "compact" | "default" | "large";
  onChangeTabSize: (size: "compact" | "default" | "large") => void;
  optFontSize: "small" | "default" | "large";
  onChangeFontSize: (size: "small" | "default" | "large") => void;
  optEars: boolean;
  onToggleEars: () => void;
  optWeatherAnim: boolean;
  onToggleWeatherAnim: () => void;
  optPosition: "top" | "bottom";
  onChangePosition: (pos: "top" | "bottom") => void;
  optOpacity: number;
  onChangeOpacity: (val: number) => void;
  optAnimSpeed: "snappy" | "smooth" | "bouncy";
  onChangeAnimSpeed: (speed: "snappy" | "smooth" | "bouncy") => void;
  // Modules
  optVolume: boolean;
  onToggleVolume: () => void;
  optClipboard: boolean;
  onToggleClipboard: () => void;
  optMedia: boolean;
  onToggleMedia: () => void;
  optSoundFx?: boolean;
  onToggleSoundFx?: () => void;
  isLightMode?: boolean;
  onClose: () => void;
}

const tabVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 16 : dir < 0 ? -16 : 0,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      x: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
      opacity: { duration: 0.18, ease: "easeOut" as const },
    },
    transitionEnd: { transform: "none" },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -16 : dir < 0 ? 16 : 0,
    opacity: 0,
    transition: { duration: 0.12 },
  }),
};

const contentVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.16, ease: "easeOut" as const } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.1, ease: "easeIn" as const } },
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  slideDirection,
  optLanguage,
  onChangeLanguage,
  optAutoCompact,
  onToggleAutoCompact,
  isAutostart,
  onToggleAutostart,
  showGreeting,
  onToggleGreeting,
  greetingNameMode,
  onChangeGreetingNameMode,
  customGreetingName,
  onChangeCustomGreetingName,
  onTestGreeting,
  onTestNotification,
  optNotifTime,
  onChangeNotifTime,
  optNotifSound,
  onChangeNotifSound,
  optCloseDelay,
  onChangeCloseDelay,
  optTheme,
  onChangeTheme,
  notchShape,
  onChangeNotchShape,
  islandTopOffset,
  onChangeIslandTopOffset,
  idleLayout,
  onChangeIdleLayout,
  idleRuntimeData,
  optIdleSize,
  onChangeIdleSize,
  optTabSize,
  onChangeTabSize,
  optFontSize,
  onChangeFontSize,
  optEars,
  onToggleEars,
  optWeatherAnim: _optWeatherAnim,
  onToggleWeatherAnim: _onToggleWeatherAnim,
  optPosition,
  onChangePosition,
  optOpacity,
  onChangeOpacity,
  optAnimSpeed,
  onChangeAnimSpeed,
  optVolume,
  onToggleVolume,
  optClipboard,
  onToggleClipboard,
  optMedia,
  onToggleMedia,
  optSoundFx = true,
  onToggleSoundFx,
  isLightMode = false,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsSubtab>("general");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [currentAppVersion, setCurrentAppVersion] = useState<string>("3.3.5");

  const [clearTempStatus, setClearTempStatus] = useState<"idle" | "cleaning" | "done" | "error">("idle");
  const [clearedResult, setClearedResult] = useState<{
    freed_bytes: number;
    deleted_count: number;
    freed_formatted: string;
  } | null>(null);

  useEffect(() => {
    getVersion().then(setCurrentAppVersion).catch(() => {});
  }, []);

  const handleClearTempFiles = async () => {
    if (clearTempStatus === "cleaning") return;
    setClearTempStatus("cleaning");
    try {
      clearAllLyricsCache();
      clearArtworkCache();
      clearShelfPreviewCache();
      clearWeatherCache();

      const res = await invoke<{ freed_bytes: number; deleted_count: number; freed_formatted: string }>(
        "clear_temp_files"
      );
      setClearedResult(res);
      setClearTempStatus("done");
      window.setTimeout(() => {
        setClearTempStatus("idle");
      }, 4500);
    } catch (err) {
      console.error("Failed to clear temp files:", err);
      setClearTempStatus("error");
      window.setTimeout(() => {
        setClearTempStatus("idle");
      }, 3500);
    }
  };

  const handleCheckUpdate = async () => {
    if (updateStatus === "checking" || updateStatus === "downloading" || updateStatus === "installing") return;
    setUpdateStatus("checking");
    try {
      const info = await checkForAppUpdate();
      setUpdateInfo(info);
      if (info.available) {
        setUpdateStatus("available");
      } else {
        setUpdateStatus("up_to_date");
      }
    } catch {
      setUpdateStatus("error");
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateInfo?.update) return;
    setUpdateStatus("downloading");
    setDownloadProgress(0);
    try {
      await downloadAndInstallAppUpdate(updateInfo.update, (percent) => {
        setDownloadProgress(percent);
        if (percent >= 100) {
          setUpdateStatus("installing");
        }
      });
    } catch {
      setUpdateStatus("error");
    }
  };

  return (
    <motion.div
      key="settings"
      custom={slideDirection}
      variants={tabVariants}
      initial="enter"
      animate="center"
      exit="exit"
      className="absolute inset-0 w-full h-full flex flex-col px-4 pt-0 pb-0 overflow-hidden select-none min-w-0 cursor-default gpu-accelerated"
      onClick={onClose}
    >
      <div
        className="flex-1 flex flex-col min-w-0 h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Subnav Pill Bar */}
        <SettingsSubnav
          activeTab={activeTab}
          onChangeTab={(tab) => {
            setActiveTab(tab);
            setSearchQuery("");
            setIsSearchOpen(false);
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isSearchOpen={isSearchOpen}
          onToggleSearch={() => {
            setIsSearchOpen((prev) => !prev);
            if (isSearchOpen) setSearchQuery("");
          }}
        />

        {/* Tab Content Body */}
        <div className="flex-1 w-full pt-0.5 pb-2 flex flex-col justify-start overflow-y-auto settings-scroll min-h-0 pr-0.5 rounded-[22px]" data-scrollable="true">
          <AnimatePresence mode="wait">
            {isSearchOpen && searchQuery.trim().length > 0 ? (
              <motion.div
                key="search-results"
                variants={contentVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full"
              >
                <SearchResults
                  searchQuery={searchQuery}
                  onNavigateTab={(tab) => {
                    setActiveTab(tab);
                    setIsSearchOpen(false);
                    setSearchQuery("");
                  }}
                  optLanguage={optLanguage}
                  onChangeLanguage={onChangeLanguage}
                  isAutostart={isAutostart}
                  onToggleAutostart={onToggleAutostart}
                  showGreeting={showGreeting}
                  onToggleGreeting={onToggleGreeting}
                  greetingNameMode={greetingNameMode}
                  onChangeGreetingNameMode={onChangeGreetingNameMode}
                  customGreetingName={customGreetingName}
                  onChangeCustomGreetingName={onChangeCustomGreetingName}
                  optAutoCompact={optAutoCompact}
                  onToggleAutoCompact={onToggleAutoCompact}
                  optNotifTime={optNotifTime}
                  onChangeNotifTime={onChangeNotifTime}
                  optNotifSound={optNotifSound}
                  onChangeNotifSound={onChangeNotifSound}
                  optCloseDelay={optCloseDelay}
                  onChangeCloseDelay={onChangeCloseDelay}
                  optTheme={optTheme}
                  onChangeTheme={onChangeTheme}
                  notchShape={notchShape}
                  onChangeNotchShape={onChangeNotchShape}
                  islandTopOffset={islandTopOffset}
                  onChangeIslandTopOffset={onChangeIslandTopOffset}
                  optPosition={optPosition}
                  onChangePosition={onChangePosition}
                  isLightMode={isLightMode}
                  optFontSize={optFontSize}
                  onChangeFontSize={onChangeFontSize}
                  optIdleSize={optIdleSize}
                  onChangeIdleSize={onChangeIdleSize}
                  optTabSize={optTabSize}
                  onChangeTabSize={onChangeTabSize}
                  optEars={optEars}
                  onToggleEars={onToggleEars}
                  optOpacity={optOpacity}
                  onChangeOpacity={onChangeOpacity}
                  optAnimSpeed={optAnimSpeed}
                  onChangeAnimSpeed={onChangeAnimSpeed}
                  optVolume={optVolume}
                  onToggleVolume={onToggleVolume}
                  optClipboard={optClipboard}
                  onToggleClipboard={onToggleClipboard}
                  optMedia={optMedia}
                  onToggleMedia={onToggleMedia}
                  optSoundFx={optSoundFx}
                  onToggleSoundFx={onToggleSoundFx}
                  currentAppVersion={currentAppVersion}
                  updateStatus={updateStatus}
                  updateInfo={updateInfo}
                  downloadProgress={downloadProgress}
                  onCheckUpdate={handleCheckUpdate}
                  onInstallUpdate={handleInstallUpdate}
                  clearTempStatus={clearTempStatus}
                  clearedResult={clearedResult}
                  onClearTempFiles={handleClearTempFiles}
                  onTestNotification={onTestNotification}
                  onClose={onClose}
                />
              </motion.div>
            ) : (
              <>
                {activeTab === "general" && (
                  <motion.div
                    key="general"
                    variants={contentVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="w-full"
                  >
                    <GeneralTab
                      optLanguage={optLanguage}
                      onChangeLanguage={onChangeLanguage}
                      isAutostart={isAutostart}
                      onToggleAutostart={onToggleAutostart}
                      showGreeting={showGreeting}
                      onToggleGreeting={onToggleGreeting}
                      greetingNameMode={greetingNameMode}
                      onChangeGreetingNameMode={onChangeGreetingNameMode}
                      customGreetingName={customGreetingName}
                      onChangeCustomGreetingName={onChangeCustomGreetingName}
                      onTestGreeting={onTestGreeting}
                      optAutoCompact={optAutoCompact}
                      onToggleAutoCompact={onToggleAutoCompact}
                      optNotifTime={optNotifTime}
                      onChangeNotifTime={onChangeNotifTime}
                      optNotifSound={optNotifSound}
                      onChangeNotifSound={onChangeNotifSound}
                      optCloseDelay={optCloseDelay}
                      onChangeCloseDelay={onChangeCloseDelay}
                    />
                  </motion.div>
                )}

                {activeTab === "appearance" && (
                  <motion.div
                    key="appearance"
                    variants={contentVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="w-full"
                  >
                    <AppearanceTab
                      optTheme={optTheme}
                      onChangeTheme={onChangeTheme}
                      notchShape={notchShape}
                      onChangeNotchShape={onChangeNotchShape}
                      islandTopOffset={islandTopOffset}
                      onChangeIslandTopOffset={onChangeIslandTopOffset}
                      optPosition={optPosition}
                      onChangePosition={onChangePosition}
                      isLightMode={isLightMode}
                      optFontSize={optFontSize}
                      onChangeFontSize={onChangeFontSize}
                      optIdleSize={optIdleSize}
                      onChangeIdleSize={onChangeIdleSize}
                      optTabSize={optTabSize}
                      onChangeTabSize={onChangeTabSize}
                      optEars={optEars}
                      onToggleEars={onToggleEars}
                      optOpacity={optOpacity}
                      onChangeOpacity={onChangeOpacity}
                      optAnimSpeed={optAnimSpeed}
                      onChangeAnimSpeed={onChangeAnimSpeed}
                    />
                  </motion.div>
                )}

                {activeTab === "idle" && (
                  <motion.div
                    key="idle"
                    variants={contentVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="w-full"
                  >
                    <IdleTab
                      layout={idleLayout}
                      onChangeLayout={onChangeIdleLayout}
                      runtimeData={idleRuntimeData}
                    />
                  </motion.div>
                )}

                {activeTab === "modules" && (
                  <motion.div
                    key="modules"
                    variants={contentVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="w-full"
                  >
                    <ModulesTab
                      optVolume={optVolume}
                      onToggleVolume={onToggleVolume}
                      optClipboard={optClipboard}
                      onToggleClipboard={onToggleClipboard}
                      optMedia={optMedia}
                      onToggleMedia={onToggleMedia}
                      optSoundFx={optSoundFx}
                      onToggleSoundFx={onToggleSoundFx}
                    />
                  </motion.div>
                )}

                {activeTab === "advanced" && (
                  <motion.div
                    key="advanced"
                    variants={contentVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="w-full"
                  >
                    <AdvancedTab
                      currentAppVersion={currentAppVersion}
                      updateStatus={updateStatus}
                      updateInfo={updateInfo}
                      downloadProgress={downloadProgress}
                      onCheckUpdate={handleCheckUpdate}
                      onInstallUpdate={handleInstallUpdate}
                      clearTempStatus={clearTempStatus}
                      clearedResult={clearedResult}
                      onClearTempFiles={handleClearTempFiles}
                      onTestNotification={onTestNotification}
                      onClose={onClose}
                    />
                  </motion.div>
                )}
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};
