import React, { useState, useEffect, useRef } from "react";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Wifi,
  Volume2,
  Zap,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Tooltip } from "../../ui/Tooltip";
import { hexToRgba } from "../../../services/navbarConfigService";
import {
  useTaskbarLang,
  tx,
  dateLocale,
  getNavbarTooltipSide,
  type DockPosition,
} from "../../../services/taskbarI18n";
import { useNavbarLightMode } from "../navbarThemeUtils";

interface SystemTrayGroupProps {
  accentColor?: string;
  showSeconds?: boolean;
  use24HourClock?: boolean;
  showDayOfWeek?: boolean;
  locale?: string;
  showHiddenTray?: boolean;
  showSystemIcons?: boolean;
  showNotifications?: boolean;
  showClockDate?: boolean;
  singleItem?: "hiddenTray" | "systemIcons" | "notifications" | "clockDate";
  isVertical?: boolean;
  position?: DockPosition;
  isHidden?: boolean;
  isPreview?: boolean;
  onControlCenterClick?: () => void;
  onNotificationsClick?: () => void;
  onClockClick?: () => void;
  onVolumeClick?: (e: React.MouseEvent) => void;
  onTrayClick?: () => void;
}

interface BatteryState {
  is_charging: boolean;
  percent: number;
}

const parseBatteryData = (raw: unknown): BatteryState | null => {
  if (!raw) return null;

  // Rust get_battery_status returns Option<(bool, u8)> -> [bool, number] | null
  if (Array.isArray(raw)) {
    if (typeof raw[1] === "number") {
      const percent = raw[1];
      if (percent > 100 || isNaN(percent)) return null;
      return {
        is_charging: Boolean(raw[0]),
        percent: Math.max(0, Math.min(100, Math.round(percent))),
      };
    }
    return null;
  }

  // Rust battery-update event returns { is_charging: bool, percent: u8 }
  if (typeof raw === "object") {
    const payload = raw as {
      is_charging?: unknown;
      isCharging?: unknown;
      percent?: unknown;
      level?: unknown;
    };
    const num =
      typeof payload.percent === "number"
        ? payload.percent
        : typeof payload.level === "number"
        ? payload.level
        : null;
    if (num === null || num > 100 || isNaN(num)) return null;
    return {
      is_charging: Boolean(payload.is_charging ?? payload.isCharging),
      percent: Math.max(0, Math.min(100, Math.round(num))),
    };
  }

  return null;
};

export const SystemTrayGroup: React.FC<SystemTrayGroupProps> = ({
  accentColor = "#0a84ff",
  showSeconds = false,
  use24HourClock = true,
  showDayOfWeek = true,
  locale,
  showHiddenTray = true,
  showSystemIcons = true,
  showNotifications = true,
  showClockDate = true,
  singleItem,
  isVertical = false,
  position = "bottom",
  isHidden = false,
  isPreview = false,
  onControlCenterClick,
  onNotificationsClick,
  onClockClick,
  onVolumeClick,
  onTrayClick,
}) => {
  const lang = useTaskbarLang();
  const isLightMode = useNavbarLightMode();
  const tooltipSide = getNavbarTooltipSide(position);
  const effectiveLocale = locale ?? dateLocale(lang);
  const renderTray = singleItem ? singleItem === "hiddenTray" : showHiddenTray;
  const renderSys = singleItem ? singleItem === "systemIcons" : showSystemIcons;
  const renderNotif = singleItem ? singleItem === "notifications" : showNotifications;
  const renderClock = singleItem ? singleItem === "clockDate" : showClockDate;
  const [timeStr, setTimeStr] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [battery, setBattery] = useState<BatteryState | null>(null);
  const [isBatteryLoaded, setIsBatteryLoaded] = useState(false);
  const isHiddenRef = useRef(isHidden);
  isHiddenRef.current = isHidden;

  useEffect(() => {
    if (!renderClock || isHidden) return;

    const updateDateTime = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const seconds = now.getSeconds().toString().padStart(2, "0");

      if (use24HourClock) {
        const hStr = hours.toString().padStart(2, "0");
        setTimeStr(showSeconds ? `${hStr}:${minutes}:${seconds}` : `${hStr}:${minutes}`);
      } else {
        const period = hours >= 12 ? "PM" : "AM";
        const h12 = hours % 12 || 12;
        setTimeStr(
          showSeconds
            ? `${h12}:${minutes}:${seconds} ${period}`
            : `${h12}:${minutes} ${period}`
        );
      }

      const dayName = showDayOfWeek
        ? now.toLocaleDateString(effectiveLocale, { weekday: "short" }) + ", "
        : "";
      const dateNum = now.getDate();
      const monthName = now.toLocaleDateString(effectiveLocale, { month: "short" });
      setDateStr(`${dayName}${dateNum} ${monthName}`);
    };

    updateDateTime();
    if (isPreview) return;

    const interval = setInterval(updateDateTime, showSeconds ? 1000 : 10000);
    return () => clearInterval(interval);
  }, [renderClock, isHidden, isPreview, showSeconds, use24HourClock, showDayOfWeek, effectiveLocale]);

  useEffect(() => {
    if (!renderSys || isHidden) return;
    let isMounted = true;

    const fetchBattery = () => {
      invoke<unknown>("get_battery_status")
        .then((res) => {
          if (!isMounted) return;
          setBattery(parseBatteryData(res));
          setIsBatteryLoaded(true);
        })
        .catch(() => {
          if (!isMounted) return;
          setIsBatteryLoaded(true);
        });
    };

    fetchBattery();
    const batteryPollInterval = !isPreview ? setInterval(fetchBattery, 5000) : null;

    return () => {
      isMounted = false;
      if (batteryPollInterval) clearInterval(batteryPollInterval);
    };
  }, [renderSys, isHidden, isPreview]);

  useEffect(() => {
    if (!renderSys) return;
    let isMounted = true;

    const unlistenBat = listen<unknown>("battery-update", (ev) => {
      if (!isMounted || isHiddenRef.current) return;
      const parsed = parseBatteryData(ev.payload);
      if (parsed) {
        setBattery(parsed);
        setIsBatteryLoaded(true);
      }
    });

    return () => {
      isMounted = false;
      unlistenBat.then((fn) => fn());
    };
  }, [renderSys]);

  useEffect(() => {
    if (!renderNotif) return;
    let isMounted = true;

    const unlistenNotif = listen("real-notif", () => {
      if (!isMounted) return;
      setUnreadCount((c) => c + 1);
    });

    return () => {
      isMounted = false;
      unlistenNotif.then((fn) => fn());
    };
  }, [renderNotif]);

  const isCharging = battery ? battery.is_charging : false;
  const batteryPercent = battery ? battery.percent : 100;
  const batteryFillWidth = Math.max(2, Math.round((batteryPercent / 100) * 14));

  const controlCenterLabel = tx(lang, "Control Center", "Pusat Kontrol");
  const volumeLabel = tx(lang, "Sound output & volume", "Output suara & volume");
  const batteryTooltip = battery
    ? `${controlCenterLabel} · ${tx(lang, "Battery", "Baterai")} ${battery.percent}%${
        isCharging ? ` (${tx(lang, "Charging", "Mengisi Daya")})` : ""
      }`
    : `${controlCenterLabel} · ${tx(lang, "AC Power", "Daya AC")}`;

  const trayLiftHoverClass =
    position === "top"
      ? "hover:translate-y-[1.5px]"
      : position === "left"
      ? "hover:translate-x-[1.5px]"
      : position === "right"
      ? "hover:-translate-x-[1.5px]"
      : "hover:-translate-y-[1.5px]";

  const pillContainerClass = `${
    isVertical
      ? "gili-mod-tray-vertical w-full min-w-0 py-1.5 px-0.5 flex-col gap-1 overflow-hidden"
      : "gili-mod-tray-pill px-1.5 flex-row gap-0.5"
  } rounded-[12px] bg-transparent flex items-center justify-center text-white/70 hover:bg-white/[0.06] transition-colors shrink-0`;

  const subTriggerClass =
    "rounded-[8px] bg-transparent flex items-center justify-center cursor-pointer text-white/70 hover:text-white hover:bg-white/[0.11] active:scale-95 transition-all p-1 shrink-0";

  const TrayChevronIcon =
    position === "top"
      ? ChevronDown
      : position === "left"
      ? ChevronRight
      : position === "right"
      ? ChevronLeft
      : ChevronUp;
  const trayLabel = tx(lang, "Show hidden icons", "Tampilkan ikon tersembunyi");

  return (
    <div
      className={`flex ${
        isVertical ? "flex-col w-full min-w-0 max-w-full" : "flex-row"
      } items-center gap-1 shrink-0`}
    >
      {/* Hidden System Tray Overflow Toggle */}
      {renderTray && (
        <Tooltip side={tooltipSide} delay={150} content={trayLabel}>
          <button
            type="button"
            data-flyout-trigger="tray"
            onClick={(e) => {
              e.currentTarget.blur();
              onTrayClick?.();
            }}
            aria-label={trayLabel}
            style={{
              transition:
                "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease, color 180ms ease",
            }}
            className={`${
              isVertical ? "gili-mod-tray-vertical w-full h-7" : "w-7 gili-mod-tray-btn"
            } rounded-[10px] bg-transparent text-white/65 hover:text-white hover:bg-white/[0.09] ${trayLiftHoverClass} hover:scale-[1.06] active:scale-95 flex items-center justify-center p-0 cursor-pointer shrink-0`}
          >
            <TrayChevronIcon size={15} strokeWidth={2.1} />
          </button>
        </Tooltip>
      )}

      {/* Control Center Pill (sibling triggers avoid nested interactive controls) */}
      {renderSys && (
        <div className={pillContainerClass}>
          <Tooltip side={tooltipSide} delay={150} content={batteryTooltip}>
            <button
              type="button"
              data-flyout-trigger="control_center"
              onClick={onControlCenterClick}
              aria-label={controlCenterLabel}
              className={subTriggerClass}
            >
              <Wifi size={15} strokeWidth={2} />
            </button>
          </Tooltip>

          <Tooltip side={tooltipSide} delay={150} content={volumeLabel}>
            <button
              type="button"
              data-flyout-trigger="volume"
              onClick={(e) => {
                if (onVolumeClick) {
                  e.stopPropagation();
                  onVolumeClick(e);
                } else {
                  onControlCenterClick?.();
                }
              }}
              aria-label={volumeLabel}
              className={subTriggerClass}
            >
              <Volume2 size={15} strokeWidth={2} />
            </button>
          </Tooltip>

          {/* Original Battery Shape with Zap Inside */}
          <Tooltip side={tooltipSide} delay={150} content={batteryTooltip}>
            <button
              type="button"
              data-flyout-trigger="control_center"
              onClick={onControlCenterClick}
              aria-label={batteryTooltip}
              className={`${subTriggerClass} ${
                isVertical ? "flex-col gap-0.5" : "flex-row gap-1.5 px-1"
              }`}
            >
              <div className="relative flex items-center justify-center">
                <svg
                  width="20"
                  height="10"
                  viewBox="0 0 22 11"
                  fill="none"
                  aria-hidden="true"
                  className={isCharging ? "text-emerald-400" : "text-white/85"}
                >
                  <rect
                    x="0.5"
                    y="0.5"
                    width="18"
                    height="10"
                    rx="3"
                    stroke="currentColor"
                  />
                  <rect
                    x="2"
                    y="2"
                    width={batteryFillWidth}
                    height="7"
                    rx="1.8"
                    fill={isCharging ? "#22c55e" : "currentColor"}
                  />
                  <rect
                    x="19.5"
                    y="3.5"
                    width="2"
                    height="4"
                    rx="1"
                    fill="currentColor"
                  />
                </svg>
                {isCharging && (
                  <Zap
                    size={9}
                    className="absolute left-1 text-white fill-white drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]"
                  />
                )}
              </div>

              <span
                className={`text-[11px] font-semibold tabular-nums font-mono leading-none ${
                  isCharging ? "text-emerald-400 font-bold" : "text-white/85"
                }`}
              >
                {battery ? `${battery.percent}%` : isBatteryLoaded ? "AC" : "--%"}
              </span>
            </button>
          </Tooltip>
        </div>
      )}

      {/* Notifications Bell */}
      {renderNotif && (
        <Tooltip
          side={tooltipSide}
          delay={150}
          content={
            <div className="flex items-center gap-1.5 font-medium text-[11.5px]">
              <span>{tx(lang, "Notifications", "Notifikasi")}</span>
              {unreadCount > 0 && (
                <span
                  style={{
                    backgroundColor: hexToRgba(accentColor, isLightMode ? 0.14 : 0.25),
                    color: accentColor,
                  }}
                  className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-semibold border ${
                    isLightMode ? "border-black/10" : "border-white/10"
                  }`}
                >
                  {unreadCount} {tx(lang, "new", "baru")}
                </span>
              )}
            </div>
          }
        >
          <button
            type="button"
            data-flyout-trigger="notifications"
            onClick={() => {
              setUnreadCount(0);
              onNotificationsClick?.();
            }}
            aria-label={`${tx(lang, "Notifications", "Notifikasi")}${
              unreadCount > 0 ? `, ${unreadCount} ${tx(lang, "new", "baru")}` : ""
            }`}
            style={{
              transition:
                "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease, color 180ms ease",
            }}
            className={`relative ${
              isVertical ? "gili-mod-tray-vertical w-full h-9" : "w-9 gili-mod-tray-btn"
            } rounded-[12px] bg-transparent text-white/65 hover:text-white hover:bg-white/[0.09] ${trayLiftHoverClass} hover:scale-[1.06] active:scale-95 flex items-center justify-center p-0 cursor-pointer shrink-0`}
          >
            <Bell size={17} strokeWidth={1.8} />
            {unreadCount > 0 && (
              <span
                style={{
                  backgroundColor: accentColor,
                  boxShadow: `0 0 6px ${accentColor}`,
                }}
                className="absolute right-2 top-2.5 w-1.5 h-1.5 rounded-full ring-1 ring-black/40"
              />
            )}
          </button>
        </Tooltip>
      )}

      {/* Clock & Calendar */}
      {renderClock && (
        <Tooltip
          side={tooltipSide}
          delay={150}
          content={tx(lang, "Calendar & Time", "Kalender & Waktu")}
        >
          <button
            type="button"
            data-flyout-trigger="calendar"
            onClick={onClockClick}
            aria-label={tx(lang, "Clock and calendar", "Jam dan kalender")}
            style={{
              transition:
                "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease",
            }}
            className={`rounded-[12px] bg-transparent text-white flex flex-col justify-center ${
              isVertical
                ? "w-full max-w-full min-w-0 items-center px-0.5 py-1 overflow-hidden"
                : "gili-mod-tray-clock items-end px-2 py-0.5 overflow-hidden"
            } cursor-pointer hover:bg-white/[0.09] ${trayLiftHoverClass} active:scale-95 shrink-0`}
          >
            <span
              className={`${
                isVertical ? "text-[11px] text-center leading-tight" : "text-[12.5px] leading-4"
              } font-semibold tabular-nums tracking-tight max-w-full`}
            >
              {timeStr || "--:--"}
            </span>
            {!isVertical && (
              <span className="text-[10px] text-white/55 leading-3 whitespace-nowrap mt-0.5">
                {dateStr || "---"}
              </span>
            )}
          </button>
        </Tooltip>
      )}
    </div>
  );
};
