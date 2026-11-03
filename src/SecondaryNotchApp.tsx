import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MediaPayload } from "./types";
import { NotchSurface } from "./components/ui/NotchSurface";
import {
  IdleSlotView,
  IdleLayoutConfig,
  IdleRuntimeData,
  parseIdleLayout,
  getSavedIdleLayout,
  measureIdleLayoutWidth,
} from "./components/ui/IdleLayoutSetting";
import { MediaThumbnail } from "./components/ui/MediaThumbnail";
import { AudioVisualizer } from "./components/ui/AudioVisualizer";
import { ScrollingText } from "./components/ui/ScrollingText";
import { IdleMascot } from "./components/ui/IdleMascot";
import {
  computeNotchGlassCssVars,
  resolveNotchThemeMode,
} from "./components/ui/settings/TransparencyControlSection";
import { getLanguage, Language } from "./services/i18n";
import { getTextWidth } from "./utils/text";
import { getPerceivedLuminance } from "./utils/colorUtils";
import {
  NotchPosition,
  isBottomNotchPosition,
  isSideCenterNotchPosition,
  isLeftNotchPosition,
  isRightNotchPosition,
  isTopNotchPosition,
} from "./utils/notchGeometry";

export type NotchShape = "notch" | "island";

const smoothSpring = {
  type: "spring" as const,
  stiffness: 440,
  damping: 34,
  mass: 0.8,
};

export const SecondaryNotchApp: React.FC = () => {
  const notchRef = useRef<HTMLDivElement>(null);

  const [optTheme, setOptTheme] = useState<"dark" | "light" | "auto">(() => {
    return (localStorage.getItem("island_theme") as any) || "dark";
  });
  const [notchShape, setNotchShape] = useState<NotchShape>(() => {
    return (localStorage.getItem("island_notch_shape") as NotchShape) || "notch";
  });
  const [islandTopOffset, setIslandTopOffset] = useState<number>(() => {
    const v = localStorage.getItem("island_top_offset");
    return v ? Math.max(6, Math.min(16, Number(v))) : 10;
  });
  const [optPosition, setOptPosition] = useState<NotchPosition>(() => {
    return (localStorage.getItem("island_position") as NotchPosition) || "top";
  });
  const [optEars, setOptEars] = useState<boolean>(() => {
    const v = localStorage.getItem("island_ears");
    return v !== null ? v === "true" : true;
  });
  const [optIdleSize, setOptIdleSize] = useState<"compact" | "default" | "large">(() => {
    return (localStorage.getItem("island_idle_size") as any) || "default";
  });
  const [optFontSize, setOptFontSize] = useState<"small" | "default" | "large">(() => {
    return (localStorage.getItem("island_font_size") as any) || "default";
  });
  const [optOpacity, setOptOpacity] = useState<number>(() => {
    const v = localStorage.getItem("island_opacity");
    return v !== null ? Number(v) : 0.92;
  });
  const [optBlur, setOptBlur] = useState<number>(() => {
    const v = localStorage.getItem("island_blur");
    return v !== null ? Number(v) : 24;
  });
  const [optIdleColorEnabled, setOptIdleColorEnabled] = useState<boolean>(() => {
    return localStorage.getItem("island_idle_color_enabled") === "true";
  });
  const [optIdleColor, setOptIdleColor] = useState<string>(() => {
    return localStorage.getItem("island_idle_color") || "#1e1e24";
  });
  const [optIdleTextColorEnabled, setOptIdleTextColorEnabled] = useState<boolean>(() => {
    return localStorage.getItem("island_idle_text_color_enabled") === "true";
  });
  const [optIdleTextColor, setOptIdleTextColor] = useState<string>(() => {
    return localStorage.getItem("island_idle_text_color") || "#ffffff";
  });
  const [idleLayout, setIdleLayout] = useState<IdleLayoutConfig>(() => getSavedIdleLayout());
  const [optLanguage, setOptLanguage] = useState<Language>(() => getLanguage());

  const [time, setTime] = useState<Date>(() => new Date());
  const [battery, setBattery] = useState<{ is_charging: boolean; percent: number } | null>(null);
  const [weather, setWeather] = useState<{ temp: string; code: number; locationName?: string } | null>(() => {
    try {
      const raw = localStorage.getItem("island_weather");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [media, setMedia] = useState<MediaPayload | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [networkPing, setNetworkPing] = useState<number | null>(null);
  const [sysMetrics, setSysMetrics] = useState<{
    cpu: number;
    ram: number;
    ramUsedGb?: number;
    ramTotalGb?: number;
    netDownMbps?: number;
    netUpMbps?: number;
  } | null>(null);
  const [pendingTodosCount, setPendingTodosCount] = useState<number>(() => {
    try {
      const todos = JSON.parse(localStorage.getItem("island_todos") || "[]");
      return todos.filter((t: any) => !t.done).length;
    } catch {
      return 0;
    }
  });
  const [stashedFilesCount, setStashedFilesCount] = useState<number>(() => {
    try {
      const shelf = JSON.parse(localStorage.getItem("island_shelf_files") || "[]");
      return shelf.length;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    invoke<[boolean, number] | null>("get_battery_status")
      .then((res) => {
        if (res) setBattery({ is_charging: res[0], percent: res[1] });
      })
      .catch(() => {});

    const unlistenBattery = listen<[boolean, number]>("battery-update", (e) => {
      if (e.payload) setBattery({ is_charging: e.payload[0], percent: e.payload[1] });
    });

    const unlistenMedia = listen<MediaPayload>("media-update", (e) => {
      const p = e.payload;
      if (p && (p.title || p.artist)) {
        setMedia(p);
        setIsPlaying(Boolean(p.is_playing));
      } else {
        setMedia(null);
        setIsPlaying(false);
      }
    });

    const unlistenPing = listen<number>("network-ping", (e) => {
      setNetworkPing(typeof e.payload === "number" ? e.payload : null);
    });

    const unlistenSys = listen<any>("system-info-update", (e) => {
      if (e.payload) setSysMetrics(e.payload);
    });

    const unlistenSettings = listen<any>("gili-settings-sync", (e) => {
      const { type, value } = e.payload || {};
      if (type === "notch_shape") setNotchShape(value);
      else if (type === "island_top_offset") setIslandTopOffset(Number(value));
      else if (type === "opt_position") setOptPosition(value);
      else if (type === "opt_ears") setOptEars(Boolean(value));
      else if (type === "opt_theme") setOptTheme(value);
      else if (type === "opt_opacity") setOptOpacity(Number(value));
      else if (type === "opt_blur") setOptBlur(Number(value));
      else if (type === "opt_idle_layout") setIdleLayout(parseIdleLayout(value));
      else if (type === "opt_idle_size") setOptIdleSize(value);
      else if (type === "opt_font_size") setOptFontSize(value);
      else if (type === "opt_idle_color_enabled") setOptIdleColorEnabled(Boolean(value));
      else if (type === "opt_idle_color") setOptIdleColor(value);
      else if (type === "opt_idle_text_color_enabled") setOptIdleTextColorEnabled(Boolean(value));
      else if (type === "opt_idle_text_color") setOptIdleTextColor(value);
      else if (type === "opt_language") setOptLanguage(value);
    });

    const handleStorage = () => {
      try {
        const todos = JSON.parse(localStorage.getItem("island_todos") || "[]");
        setPendingTodosCount(todos.filter((t: any) => !t.done).length);
        const shelf = JSON.parse(localStorage.getItem("island_shelf_files") || "[]");
        setStashedFilesCount(shelf.length);
        const rawWeather = localStorage.getItem("island_weather");
        if (rawWeather) setWeather(JSON.parse(rawWeather));
      } catch {}
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      unlistenBattery.then((f) => f());
      unlistenMedia.then((f) => f());
      unlistenPing.then((f) => f());
      unlistenSys.then((f) => f());
      unlistenSettings.then((f) => f());
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const isSystemDark = useMemo(() => {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }, []);

  const isLightMode = useMemo(() => {
    if (optTheme === "auto") return !isSystemDark;
    return optTheme === "light";
  }, [optTheme, isSystemDark]);

  const effectiveIsLight = useMemo(() => {
    const isIdleLightContrast = optIdleColorEnabled && getPerceivedLuminance(optIdleColor) >= 0.55;
    return isLightMode || isIdleLightContrast;
  }, [isLightMode, optIdleColorEnabled, optIdleColor]);

  const dateDisplay = useMemo(() => {
    return time.toLocaleDateString(optLanguage === "id" ? "id-ID" : "en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }, [time, optLanguage]);

  const fullDateTitle = useMemo(() => {
    return time.toLocaleDateString(optLanguage === "id" ? "id-ID" : "en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [time, optLanguage]);

  const handleOpenTab = useCallback((tab: string) => {
    invoke("trigger_notch_action", { action: `open_tab:${tab}` }).catch(() => {});
  }, []);

  const idleRuntimeData: IdleRuntimeData = useMemo(() => {
    return {
      battery,
      time,
      dateDisplay,
      fullDateTitle,
      weather,
      networkPing,
      pendingTodosCount,
      stashedFilesCount,
      fps: undefined,
      cpuUsage: sysMetrics?.cpu,
      ramUsage: sysMetrics?.ram,
      ramUsedGb: sysMetrics?.ramUsedGb,
      ramTotalGb: sysMetrics?.ramTotalGb,
      netDownMbps: sysMetrics?.netDownMbps,
      netUpMbps: sysMetrics?.netUpMbps,
      focusMode: "Normal",
      optLanguage,
      isLightMode: effectiveIsLight,
      customTextColor: optIdleTextColorEnabled && optIdleTextColor ? optIdleTextColor : null,
      onOpenTab: handleOpenTab as any,
    };
  }, [
    battery,
    time,
    dateDisplay,
    fullDateTitle,
    weather,
    networkPing,
    pendingTodosCount,
    stashedFilesCount,
    sysMetrics,
    optLanguage,
    effectiveIsLight,
    optIdleTextColorEnabled,
    optIdleTextColor,
    handleOpenTab,
  ]);

  const statFont = useMemo(() => {
    return optFontSize === "small"
      ? "bold 9px 'SF Pro Display', sans-serif"
      : optFontSize === "large"
      ? "bold 11.5px 'SF Pro Display', sans-serif"
      : "bold 10px 'SF Pro Display', sans-serif";
  }, [optFontSize]);

  const idleWidth = useMemo(() => {
    return measureIdleLayoutWidth(idleLayout, idleRuntimeData, statFont, false, false, optIdleSize);
  }, [idleLayout, idleRuntimeData, statFont, optIdleSize]);

  const mediaPillWidth = useMemo(() => {
    if (!media) return idleWidth;
    const titleFont =
      optFontSize === "small"
        ? "600 12.5px 'Inter', sans-serif"
        : optFontSize === "large"
        ? "600 15.5px 'Inter', sans-serif"
        : "600 14px 'Inter', sans-serif";
    const artistFont =
      optFontSize === "small"
        ? "500 10px 'Inter', sans-serif"
        : optFontSize === "large"
        ? "500 12.5px 'Inter', sans-serif"
        : "500 11px 'Inter', sans-serif";
    const titleWidth = getTextWidth(media.title || "", titleFont);
    const artistWidth = getTextWidth(media.artist || "", artistFont);
    const maxTextWidth = Math.max(titleWidth, artistWidth);
    const baseWidth = Math.min(300, Math.max(175, Math.ceil(108 + maxTextWidth)));
    return Math.round(baseWidth * (optIdleSize === "compact" ? 0.96 : optIdleSize === "large" ? 1.08 : 1.0));
  }, [media, optFontSize, optIdleSize, idleWidth]);

  const idleHeight = optIdleSize === "compact" ? 28 : optIdleSize === "large" ? 36 : 32;
  const isMediaActive = Boolean(media && isPlaying);

  const currentWidth = isMediaActive ? mediaPillWidth : idleWidth;
  const currentHeight = isMediaActive ? Math.round(48 * (idleHeight / 32)) : idleHeight;

  useEffect(() => {
    invoke("update_pill_size", {
      width: currentWidth,
      height: currentHeight,
      isBottom: isBottomNotchPosition(optPosition),
      position: optPosition,
      topOffset: islandTopOffset,
      isIsland: notchShape === "island",
      dpr: window.devicePixelRatio || 1.0,
    }).catch(() => {});
  }, [currentWidth, currentHeight, optPosition, islandTopOffset, notchShape]);

  const isIsland = notchShape === "island";
  const isBot = isBottomNotchPosition(optPosition);
  const isLeftPos = isLeftNotchPosition(optPosition);
  const isRightPos = isRightNotchPosition(optPosition);
  const isTopPos = isTopNotchPosition(optPosition);
  const isSideCenter = isSideCenterNotchPosition(optPosition);

  const isIdleEmpty =
    idleLayout.left === "none" && idleLayout.center === "none" && idleLayout.right === "none";

  const handleMediaToggle = useCallback(() => {
    invoke("smtc_action", { action: "toggle" }).catch(() => {});
  }, []);

  const handleNotchClick = useCallback(() => {
    if (isMediaActive) {
      invoke("trigger_notch_action", { action: "open_tab:media_expanded" }).catch(() => {});
    } else {
      invoke("trigger_notch_action", { action: "open_tab:quick_control" }).catch(() => {});
    }
  }, [isMediaActive]);

  const activeEffectiveThemeMode = resolveNotchThemeMode(Number(optOpacity), Number(optBlur));

  return (
    <div
      className={`w-screen h-screen flex bg-transparent pointer-events-none ${
        isLeftPos ? "justify-start" : isRightPos ? "justify-end" : "justify-center"
      } ${isTopPos ? "items-start" : isBot ? "items-end" : "items-center"}`}
    >
      <motion.div
        ref={notchRef}
        id="notch-pill"
        onClick={handleNotchClick}
        layout
        transition={smoothSpring}
        style={
          {
            width: currentWidth,
            height: currentHeight,
            borderRadius: isIsland
              ? `${Math.round(currentHeight / 2)}px`
              : isBot
              ? "32px 32px 0 0"
              : "0 0 32px 32px",
            "--shape-radius-top": isIsland ? `${Math.round(currentHeight / 2)}px` : isBot ? "32px" : "0px",
            "--shape-radius-bottom": `${Math.round(currentHeight / 2)}px`,
            "--top-offset": isIsland ? `${islandTopOffset}px` : "0px",
            ...computeNotchGlassCssVars(Number(optOpacity), Number(optBlur), effectiveIsLight, false),
          } as React.CSSProperties
        }
        className={`${
          effectiveIsLight ? "light" : "text-white"
        } relative shrink-0 bg-transparent pointer-events-auto cursor-pointer select-none`}
      >
        <NotchSurface
          containerRef={notchRef}
          position={optPosition}
          notchShape={notchShape}
          withEars={Boolean(optEars)}
          isExpanded={false}
          themeMode={activeEffectiveThemeMode}
          opacity={Number(optOpacity)}
          blur={Number(optBlur)}
          isLightMode={effectiveIsLight}
          customColor={optIdleColorEnabled ? optIdleColor : null}
        />

        <div className="absolute inset-0 z-10 overflow-hidden rounded-[inherit] pointer-events-auto flex items-center justify-center">
          <AnimatePresence mode="wait">
            {isMediaActive && media ? (
              <motion.div
                key="secondary-media"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.16 }}
                className="w-full h-full flex items-center justify-between gap-2.5 px-3 overflow-hidden"
              >
                <div className="w-full flex items-center justify-between gap-2.5 overflow-hidden">
                  <div
                    className={`${
                      optIdleSize === "compact" ? "w-[26px] h-[26px] rounded-[7px]" : "w-8 h-8 rounded-[9px]"
                    } bg-neutral-800/80 border border-white/10 shadow-sm flex items-center justify-center shrink-0 overflow-hidden relative`}
                  >
                    <MediaThumbnail media={media} />
                  </div>
                  <div className="flex flex-col justify-center overflow-hidden whitespace-nowrap flex-1 min-w-0">
                    <ScrollingText
                      text={media.title}
                      style={
                        optIdleTextColorEnabled && optIdleTextColor ? { color: optIdleTextColor } : undefined
                      }
                      className={`${
                        optFontSize === "small"
                          ? "text-[12px]"
                          : optFontSize === "large"
                          ? "text-[14.5px]"
                          : "text-[13px]"
                      } font-semibold tracking-tight leading-[1.2] translate-y-[3.5px] ${
                        effectiveIsLight ? "text-[#1d1d1f]" : "text-white"
                      }`}
                    />
                    <ScrollingText
                      text={media.artist}
                      style={
                        optIdleTextColorEnabled && optIdleTextColor
                          ? { color: optIdleTextColor, opacity: 0.75 }
                          : undefined
                      }
                      className={`${
                        optFontSize === "small"
                          ? "text-[9.5px]"
                          : optFontSize === "large"
                          ? "text-[11.5px]"
                          : "text-[10.5px]"
                      } font-medium leading-[1.2] mt-[1px] ${
                        effectiveIsLight ? "text-neutral-600" : "text-white/55"
                      }`}
                    />
                  </div>
                  <div className="flex items-center shrink-0">
                    <AudioVisualizer isPlaying={isPlaying} onToggle={handleMediaToggle} />
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="secondary-idle"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.16 }}
                className={`w-full h-full flex items-center justify-center overflow-hidden ${
                  isSideCenter
                    ? "px-1.5 py-2"
                    : optIdleSize === "compact"
                    ? "px-[14px]"
                    : optIdleSize === "large"
                    ? "px-5"
                    : "px-4"
                }`}
              >
                {isIdleEmpty && !isSideCenter && (
                  <IdleMascot
                    idleHeight={idleHeight}
                    notchColor={optIdleColorEnabled ? optIdleColor : null}
                    isLightMode={effectiveIsLight}
                  />
                )}
                <div
                  className={`flex ${
                    isSideCenter
                      ? "flex-col gap-1"
                      : optIdleSize === "compact"
                      ? "gap-2"
                      : optIdleSize === "large"
                      ? "gap-3"
                      : "gap-2.5"
                  } items-center justify-center w-full relative z-10`}
                >
                  {idleLayout.left !== "none" && (
                    <motion.div
                      key={`idle-left-${idleLayout.left}`}
                      layout
                      transition={smoothSpring}
                      className="flex items-center shrink-0"
                    >
                      <IdleSlotView item={idleLayout.left} data={idleRuntimeData} />
                    </motion.div>
                  )}
                  {idleLayout.center !== "none" && (
                    <motion.div
                      key={`idle-center-${idleLayout.center}`}
                      layout
                      transition={smoothSpring}
                      className="flex items-center shrink-0"
                    >
                      <IdleSlotView item={idleLayout.center} data={idleRuntimeData} />
                    </motion.div>
                  )}
                  {idleLayout.right !== "none" && (
                    <motion.div
                      key={`idle-right-${idleLayout.right}`}
                      layout
                      transition={smoothSpring}
                      className="flex items-center shrink-0"
                    >
                      <IdleSlotView item={idleLayout.right} data={idleRuntimeData} />
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
