import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  House,
  Zap,
  Music2,
  Sliders,
  ListTodo,
  Timer,
  FolderDown,
  Activity,
  FileText,
  ClipboardList,
  Volume2,
  Sparkles,
  Bell,
  Droplet,
} from "lucide-react";
import { motion, AnimatePresence, type Transition } from "framer-motion";
import { getWeatherIcon } from "./NotifIcon";
import { Tooltip } from "./Tooltip";
import { iosSpring } from "../../utils/iosMotion";
import { getNormalizedHorizontalDelta } from "../../utils/gesture";
import { t, getLanguage, Language } from "../../services/i18n";

export interface PanelNavHeaderProps {
  title: string;
  battery?: { is_charging: boolean; percent: number } | null;
  time?: Date;
  weather?: { temp: string; code: number; locationName?: string } | null;
  camActive?: boolean;
  micActive?: boolean;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  prevTooltip?: string;
  nextTooltip?: string;
  onToggleSettings?: () => void;
  isSettingsActive?: boolean;
  onToggleNotifications?: () => void;
  isNotificationsActive?: boolean;
  unreadNotificationsCount?: number;
  hideTitleBar?: boolean;
  isMusicPage?: boolean;
  isLightMode?: boolean;
}

export interface PanelPageDotsProps {
  totalPages: number;
  currentPageIndex: number;
  onSelectPage?: (index: number) => void;
  hideDotsBg?: boolean;
  isMusicPage?: boolean;
  tabs?: string[];
  optLanguage?: Language;
  isLightMode?: boolean;
  optAnimSpeed?: "snappy" | "smooth" | "bouncy";
  themeMode?: "solid" | "glass" | "clear";
}

export interface PanelFrameProps extends PanelNavHeaderProps, PanelPageDotsProps {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  children: React.ReactNode;
  contentClassName?: string;
  hideDotsBg?: boolean;
  isMusicPage?: boolean;
  tabs?: string[];
  optLanguage?: Language;
  disableSwipe?: boolean;
}

export const PanelNavHeader = React.memo<PanelNavHeaderProps>(
  ({
    title,
    battery,
    time,
    weather,
    camActive,
    micActive,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    prevTooltip,
    nextTooltip,
    onToggleSettings,
    isSettingsActive = false,
    onToggleNotifications,
    isNotificationsActive = false,
    unreadNotificationsCount = 0,
    hideTitleBar = false,
    isMusicPage = false,
    isLightMode,
  }) => {
    const activeIsLightMode =
      isLightMode ??
      (typeof document !== "undefined" && document.documentElement.classList.contains("light"));
    const lang = getLanguage();
    const locale = lang === "id" ? "id-ID" : "en-US";
    const dateObj = time || new Date();
    const dayName = dateObj.toLocaleDateString(locale, { weekday: "short" });
    const day = dateObj.getDate();
    const month = dateObj.toLocaleDateString(locale, { month: "short" });
    const hours = dateObj.getHours().toString().padStart(2, "0");
    const minutes = dateObj.getMinutes().toString().padStart(2, "0");

    const settingsInNextSlot = isSettingsActive && !hasNext;

    const navButtonClass = isMusicPage
      ? "w-8 h-8 rounded-full bg-white/[0.12] hover:bg-white/[0.22] active:bg-white/[0.28] backdrop-blur-xl border border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.25)] flex items-center justify-center text-white/90 hover:text-white transition-all cursor-pointer shrink-0"
      : "w-8 h-8 rounded-full bg-[#17171c] hover:bg-[#23232a] flex items-center justify-center text-[#e4e4e7] hover:text-white transition-colors cursor-pointer shrink-0";

    const navDisabledClass = isMusicPage
      ? "w-8 h-8 rounded-full bg-white/[0.04] backdrop-blur-md border border-white/[0.08] flex items-center justify-center text-white/20 shrink-0 pointer-events-none"
      : "w-8 h-8 rounded-full bg-[#17171c]/50 flex items-center justify-center text-white/25 shrink-0 pointer-events-none";

    const settingsButton = onToggleSettings && (
      <Tooltip
        content={isSettingsActive ? t("nav_back") : t("tab_settings")}
        side="bottom"
        align="end"
      >
        <motion.button
          whileTap={{ scale: 0.9 }}
          transition={iosSpring.press}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSettings();
          }}
          className={navButtonClass}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={isSettingsActive ? "home" : "gear"}
              initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex items-center justify-center"
            >
              {isSettingsActive ? (
                <House size={15} strokeWidth={2} />
              ) : (
                <Settings size={15} strokeWidth={2} />
              )}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </Tooltip>
    );

    return (
      <div
        className="flex flex-col shrink-0 select-none w-full px-6 pt-2.5 pb-1"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Status Bar: Battery Capsule | Date & Time | Weather */}
        <div className="flex items-center justify-between h-[22px] text-[11px] text-[#a1a1aa] tabular-nums w-full">
          {/* Left: Battery Capsule */}
          <div className="flex items-center gap-1.5 min-w-[64px] shrink-0">
            {battery && battery.percent <= 100 ? (
              <>
                <div
                  className={`relative w-[18px] h-[9.5px] rounded-[2.5px] border p-[1.5px] flex items-center ${
                    battery.is_charging || battery.percent >= 80
                      ? activeIsLightMode
                        ? "border-[#15803d]"
                        : "border-[#13FF00]"
                      : battery.percent <= 20
                      ? activeIsLightMode
                        ? "border-rose-600"
                        : "border-[#ff453a]"
                      : activeIsLightMode
                      ? "border-neutral-700"
                      : "border-white/70"
                  }`}
                >
                  <div
                    className={`h-full rounded-[1px] transition-all duration-300 ${
                      battery.is_charging || battery.percent >= 80
                        ? activeIsLightMode
                          ? "bg-[#15803d]"
                          : "bg-[#13FF00]"
                        : battery.percent <= 20
                        ? activeIsLightMode
                          ? "bg-rose-600"
                          : "bg-[#ff453a]"
                        : activeIsLightMode
                        ? "bg-neutral-800"
                        : "bg-white"
                    }`}
                    style={{ width: `${Math.max(10, Math.min(100, battery.percent))}%` }}
                  />
                  <div
                    className={`absolute -right-[2.5px] top-[2px] bottom-[2px] w-[1.5px] rounded-r-[1px] ${
                      battery.is_charging || battery.percent >= 80
                        ? activeIsLightMode
                          ? "bg-[#15803d]"
                          : "bg-[#13FF00]"
                        : battery.percent <= 20
                        ? activeIsLightMode
                          ? "bg-rose-600"
                          : "bg-[#ff453a]"
                        : activeIsLightMode
                        ? "bg-neutral-700"
                        : "bg-white/70"
                    }`}
                  />
                </div>
                <span
                  className={`text-[11px] font-medium tabular-nums leading-none ${
                    battery.is_charging || battery.percent >= 80
                      ? activeIsLightMode
                        ? "text-[#15803d] font-semibold"
                        : "text-[#13FF00]"
                      : battery.percent <= 20
                      ? activeIsLightMode
                        ? "text-rose-600 font-semibold"
                        : "text-[#ff453a]"
                      : activeIsLightMode
                      ? "text-[#1d1d1f]"
                      : "text-white/85"
                  }`}
                >
                  {`${battery.percent}%`}
                </span>
              </>
            ) : (
              <div className="flex items-center gap-1">
                <Zap
                  size={11}
                  className={activeIsLightMode ? "text-[#15803d]" : "text-[#13FF00]"}
                />
                <span
                  className={`text-[11px] font-medium tabular-nums leading-none ${
                    activeIsLightMode ? "text-[#15803d] font-semibold" : "text-[#13FF00]"
                  }`}
                >
                  100%
                </span>
              </div>
            )}
          </div>

          {/* Center: Full Date and Time */}
          <div className="flex items-center gap-2 text-[11px] text-[#a1a1aa] tabular-nums">
            <span>
              {dayName}, {day} {month}
            </span>
            <span>
              {hours}:{minutes}
            </span>
          </div>

          {/* Right: Weather & Privacy Indicators */}
          <div className="flex items-center justify-end gap-1.5 min-w-[64px] shrink-0">
            {weather && (
              <div
                className="flex items-center gap-1 text-[11px] text-[#a1a1aa] tabular-nums cursor-default"
                title={weather.locationName || undefined}
              >
                {getWeatherIcon(weather.code)}
                <span>{weather.temp}</span>
              </div>
            )}
            {(camActive || micActive) && (
              <div className="flex items-center gap-1 ml-0.5">
                {camActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-[#34c759] shadow-[0_0_6px_#34c759]" />
                )}
                {micActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ff9f0a] shadow-[0_0_6px_#ff9f0a]" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Title Bar: [ < ] Centered Title [ Settings ] [ > ] */}
        {!hideTitleBar && (
          <div className="relative flex items-center justify-between gap-3 mt-2 w-full">
            {/* Left Action Cluster: [ Prev ] [ Notification Button ] */}
            <div className="flex items-center gap-2 shrink-0 z-10">
              {hasPrev ? (
                <Tooltip content={prevTooltip || t("nav_prev")} side="bottom" align="start">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    transition={iosSpring.press}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPrev?.();
                    }}
                    className={navButtonClass}
                  >
                    <ChevronLeft size={16} strokeWidth={2} className="shrink-0" />
                  </motion.button>
                </Tooltip>
              ) : (
                <div className={navDisabledClass}>
                  <ChevronLeft size={16} strokeWidth={2} />
                </div>
              )}

              {/* Notification Button (on the right side of slide previous button) */}
              {onToggleNotifications && (
                <Tooltip
                  content={isNotificationsActive ? t("nav_back") : t("tab_notifications")}
                  side="bottom"
                  align="start"
                >
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    transition={iosSpring.press}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleNotifications();
                    }}
                    className={`${
                      isNotificationsActive
                        ? "w-8 h-8 rounded-full bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.5)] flex items-center justify-center shrink-0 cursor-pointer"
                        : navButtonClass
                    } relative`}
                  >
                    <Bell size={15} strokeWidth={2} />
                    {unreadNotificationsCount > 0 && !isNotificationsActive && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_6px_#3b82f6]" />
                    )}
                  </motion.button>
                </Tooltip>
              )}
            </div>

            {/* Centered Section Title */}
            <div className="absolute inset-x-20 flex items-center justify-center overflow-hidden min-w-0 pointer-events-none">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={title}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="text-[18px] font-semibold tracking-[-0.01em] text-white truncate leading-tight text-center"
                >
                  {title}
                </motion.span>
              </AnimatePresence>
            </div>

            {/* Right Action Buttons: Settings + Next */}
            <div className="flex items-center gap-2 shrink-0 z-10">
              {onToggleSettings && !settingsInNextSlot && settingsButton}

              {hasNext ? (
                <Tooltip content={nextTooltip || t("nav_next")} side="bottom" align="end">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    transition={iosSpring.press}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNext?.();
                    }}
                    className={navButtonClass}
                  >
                    <ChevronRight size={16} strokeWidth={2} className="shrink-0" />
                  </motion.button>
                </Tooltip>
              ) : settingsInNextSlot ? (
                settingsButton
              ) : (
                <div className={navDisabledClass}>
                  <ChevronRight size={16} strokeWidth={2} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

const getTabMetadata = (key: string): { label: string; icon: React.ReactNode } => {
  switch (key) {
    case "media_expanded":
      return {
        label: t("tab_now_playing"),
        icon: <Music2 size={13} strokeWidth={2.2} />,
      };
    case "quick_control":
      return {
        label: t("tab_control_center"),
        icon: <Sliders size={13} strokeWidth={2.2} />,
      };
    case "todo":
      return {
        label: t("tab_todo_list"),
        icon: <ListTodo size={13} strokeWidth={2.2} />,
      };
    case "pomodoro":
      return {
        label: t("tab_pomodoro"),
        icon: <Timer size={13} strokeWidth={2.2} />,
      };
    case "drop_shelf":
      return {
        label: t("tab_file_shelf"),
        icon: <FolderDown size={13} strokeWidth={2.2} />,
      };
    case "sys_monitor":
      return {
        label: t("tab_sys_monitor"),
        icon: <Activity size={13} strokeWidth={2.2} />,
      };
    case "mini_note":
      return {
        label: t("tab_mini_note"),
        icon: <FileText size={13} strokeWidth={2.2} />,
      };
    case "water_reminder":
      return {
        label: t("tab_water_reminder") || "Air",
        icon: <Droplet size={13} strokeWidth={2.2} />,
      };
    case "settings":
      return {
        label: t("tab_settings"),
        icon: <Settings size={13} strokeWidth={2.2} />,
      };
    case "clipboard":
      return {
        label: t("tab_clipboard"),
        icon: <ClipboardList size={13} strokeWidth={2.2} />,
      };
    case "volume_mixer":
      return {
        label: t("tab_volume_mixer"),
        icon: <Volume2 size={13} strokeWidth={2.2} />,
      };
    case "notif_center":
      return {
        label: t("tab_notifications") || "Notifikasi",
        icon: <Bell size={13} strokeWidth={2.2} />,
      };
    default:
      return {
        label: key,
        icon: <Sparkles size={13} strokeWidth={2.2} />,
      };
  }
};

export const PanelPageDots = React.memo<PanelPageDotsProps>(
  ({
    totalPages,
    currentPageIndex,
    onSelectPage,
    hideDotsBg: _hideDotsBg = false,
    isMusicPage: _isMusicPage = false,
    tabs,
    optLanguage,
    isLightMode,
    optAnimSpeed = "smooth",
    themeMode,
  }) => {
    if (totalPages <= 1) return null;

    const activeIsLightMode =
      isLightMode ??
      (typeof document !== "undefined" && document.documentElement.classList.contains("light"));

    const isGlassOrClear =
      themeMode === "glass" ||
      themeMode === "clear" ||
      (typeof document !== "undefined" &&
        (document.getElementById("notch-pill")?.getAttribute("data-theme-mode") === "glass" ||
         document.getElementById("notch-pill")?.getAttribute("data-theme-mode") === "clear"));

    const useDarkNavbar = activeIsLightMode && !isGlassOrClear;

    const springTransition: Transition = React.useMemo(() => {
      if (optAnimSpeed === "snappy") {
        return { type: "spring" as const, stiffness: 380, damping: 27, mass: 0.68 };
      }
      if (optAnimSpeed === "bouncy") {
        return { type: "spring" as const, stiffness: 260, damping: 19, mass: 0.78 };
      }
      // Default "normal" (smooth Apple Dynamic Island fluid response with gentle cushion)
      return { type: "spring" as const, stiffness: 290, damping: 24, mass: 0.76 };
    }, [optAnimSpeed]);

    const [isHovered, setIsHovered] = React.useState(false);
    const hoverTimeoutRef = React.useRef<number | null>(null);

    React.useEffect(() => {
      return () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      };
    }, []);

    const handleMouseEnter = () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setIsHovered(true);
    };

    const handleMouseLeave = () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      hoverTimeoutRef.current = window.setTimeout(() => {
        setIsHovered(false);
      }, 180);
    };

    const tabList = React.useMemo(() => {
      return Array.from({ length: totalPages }).map((_, idx) => {
        const key = tabs?.[idx] ?? `tab_${idx}`;
        const meta = getTabMetadata(key);
        return {
          key,
          label: meta.label,
          icon: meta.icon,
        };
      });
    }, [totalPages, tabs, optLanguage]);

    return (
      <div
        className="relative z-30 flex items-center justify-center w-full select-none shrink-0 pt-0.5 pb-1 bg-transparent border-none shadow-none backdrop-blur-none pointer-events-none"
        style={{ minHeight: 28 }}
      >
        <motion.div
          layout
          initial={false}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => e.stopPropagation()}
          animate={{
            height: isHovered ? 34 : 20,
            paddingLeft: isHovered ? 8 : 10,
            paddingRight: isHovered ? 8 : 10,
          }}
          transition={springTransition}
          className={`notch-nav-container relative flex items-center justify-center rounded-full pointer-events-auto select-none overflow-hidden transition-[background-color,border-color,box-shadow] duration-250 ease-out cursor-pointer ${
            isHovered
              ? `notch-nav-pill ${
                  useDarkNavbar
                    ? "bg-black/[0.08] backdrop-blur-2xl border border-black/12 shadow-[0_4px_16px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,0.4)]"
                    : isGlassOrClear && themeMode === "clear"
                    ? "bg-white/[0.08] backdrop-blur-xl border border-white/15 shadow-none"
                    : "bg-white/[0.12] backdrop-blur-2xl border border-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.2)]"
                } gap-1 is-hovered`
              : "bg-transparent border border-transparent shadow-none backdrop-blur-none gap-1.5"
          }`}
        >
          <AnimatePresence initial={false} mode="wait">
            {!isHovered ? (
              <motion.div
                key="dots"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.1, ease: "easeOut" }}
                className="flex items-center gap-1.5"
              >
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const isCurrent = idx === currentPageIndex;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPage?.(idx);
                      }}
                      className={`notch-nav-dot h-[5px] rounded-full cursor-pointer transition-all duration-200 ${
                        isCurrent
                          ? "is-active w-[16px] bg-[#3882F6] shadow-[0_0_8px_rgba(56,130,246,0.5)]"
                          : useDarkNavbar
                          ? "w-[5px] bg-black/25 hover:bg-black/50"
                          : "w-[5px] bg-white/50 hover:bg-white/80"
                      }`}
                    />
                  );
                })}
              </motion.div>
            ) : (
              <motion.div
                key="navbar"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.1, ease: "easeOut" }}
                className="flex items-center gap-1"
              >
                {tabList.map((tab, idx) => {
                  const isCurrent = idx === currentPageIndex;

                  return (
                    <Tooltip key={tab.key} content={tab.label} side="top" delay={120}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPage?.(idx);
                        }}
                        className={`notch-nav-btn relative w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-colors duration-150 select-none ${
                          isCurrent
                            ? "is-active bg-[#3882F6] !text-white shadow-sm shadow-[#3882F6]/40"
                            : isGlassOrClear && activeIsLightMode
                            ? "!text-white/90 hover:!text-white hover:bg-white/18 drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
                            : useDarkNavbar
                            ? "text-neutral-500 hover:text-[#1d1d1f] hover:bg-black/[0.08]"
                            : "text-white/75 hover:text-white hover:bg-white/15"
                        }`}
                      >
                        <span
                          className="flex items-center justify-center pointer-events-none"
                          style={{
                            color: isCurrent || (isGlassOrClear && activeIsLightMode) ? "#ffffff" : undefined,
                          }}
                        >
                          {tab.icon}
                        </span>
                      </button>
                    </Tooltip>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }
);

export const PanelFrame = React.memo<PanelFrameProps>(
  ({
    title,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    prevTooltip,
    nextTooltip,
    onToggleSettings,
    isSettingsActive,
    onToggleNotifications,
    isNotificationsActive,
    unreadNotificationsCount,
    hideTitleBar = false,
    totalPages,
    currentPageIndex,
    onSelectPage,
    hideDotsBg = false,
    isMusicPage = false,
    tabs,
    optLanguage,
    disableSwipe = false,
    battery,
    time,
    weather,
    camActive,
    micActive,
    isLightMode,
    optAnimSpeed,
    themeMode,
    children,
    contentClassName = "flex-1 min-h-0 min-w-0 w-full relative z-10 overflow-hidden flex flex-col",
  }) => {
    const isSwipeCooldownRef = React.useRef(false);
    const accumulatedDeltaRef = React.useRef(0);
    const swipeResetTimerRef = React.useRef<number | null>(null);
    const isPanIgnoredRef = React.useRef(false);

    const handleWheel = (e: React.WheelEvent) => {
      if (disableSwipe) {
        return;
      }
      // Shift is dedicated to brightness adjustment on the notch pill; do not trigger tab swipe
      if (e.shiftKey) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.closest(
          '.notes-horizontal-scroll, [data-scrollable="true"], [data-no-swipe="true"], input, textarea, select, [role="slider"]'
        ) ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);

      if (absX < 2 || absY > absX * 0.85) {
        return;
      }

      if (isSwipeCooldownRef.current) {
        return;
      }

      if (Math.abs(accumulatedDeltaRef.current) === 0 && absX < 5) {
        return;
      }

      accumulatedDeltaRef.current += getNormalizedHorizontalDelta(e);

      if (swipeResetTimerRef.current) clearTimeout(swipeResetTimerRef.current);
      swipeResetTimerRef.current = window.setTimeout(() => {
        accumulatedDeltaRef.current = 0;
      }, 120);

      if (Math.abs(accumulatedDeltaRef.current) >= 30) {
        const dir = accumulatedDeltaRef.current > 0 ? 1 : -1;
        accumulatedDeltaRef.current = 0;
        isSwipeCooldownRef.current = true;

        window.setTimeout(() => {
          isSwipeCooldownRef.current = false;
          accumulatedDeltaRef.current = 0;
        }, 240);

        if (dir > 0 && hasNext) {
          onNext();
        } else if (dir < 0 && hasPrev) {
          onPrev();
        }
      }
    };

    const handlePanStart = (e: any) => {
      const target = (e?.target || e?.srcElement) as HTMLElement | null;
      if (
        target &&
        (target.closest(
          '.notes-horizontal-scroll, [data-scrollable="true"], [data-no-swipe="true"], input, textarea, select, [role="slider"]'
        ) ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        isPanIgnoredRef.current = true;
      } else {
        isPanIgnoredRef.current = false;
      }
    };

    const handlePanEnd = (e: any, info: { offset: { x: number; y: number } }) => {
      if (disableSwipe || isPanIgnoredRef.current) {
        isPanIgnoredRef.current = false;
        return;
      }
      isPanIgnoredRef.current = false;

      const target = (e?.target || e?.srcElement) as HTMLElement | null;
      if (
        target &&
        (target.closest(
          '.notes-horizontal-scroll, [data-scrollable="true"], [data-no-swipe="true"], input, textarea, select, [role="slider"]'
        ) ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      if (Math.abs(info.offset.x) > 45 && Math.abs(info.offset.x) > Math.abs(info.offset.y) * 1.5) {
        if (info.offset.x < 0 && hasNext) {
          onNext();
        } else if (info.offset.x > 0 && hasPrev) {
          onPrev();
        }
      }
    };

    return (
      <motion.div
        data-page={isMusicPage ? "music" : undefined}
        className="relative w-full h-full flex flex-col justify-between overflow-hidden select-none touch-pan-y rounded-[inherit]"
        onWheel={handleWheel}
        onPanStart={handlePanStart}
        onPanEnd={handlePanEnd}
      >
        <div className="relative z-10 w-full shrink-0">
          <PanelNavHeader
            title={title}
            battery={battery}
            time={time}
            weather={weather}
            camActive={camActive}
            micActive={micActive}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={onPrev}
            onNext={onNext}
            prevTooltip={prevTooltip}
            nextTooltip={nextTooltip}
            onToggleSettings={onToggleSettings}
            isSettingsActive={isSettingsActive}
            onToggleNotifications={onToggleNotifications}
            isNotificationsActive={isNotificationsActive}
            unreadNotificationsCount={unreadNotificationsCount}
            hideTitleBar={hideTitleBar}
            isMusicPage={isMusicPage}
            isLightMode={isLightMode}
          />
        </div>

        <div className={contentClassName}>{children}</div>

        <PanelPageDots
          totalPages={totalPages}
          currentPageIndex={currentPageIndex}
          onSelectPage={onSelectPage}
          hideDotsBg={hideDotsBg}
          isMusicPage={isMusicPage}
          tabs={tabs}
          optLanguage={optLanguage}
          isLightMode={isLightMode}
          optAnimSpeed={optAnimSpeed}
          themeMode={themeMode}
        />
      </motion.div>
    );
  }
);
