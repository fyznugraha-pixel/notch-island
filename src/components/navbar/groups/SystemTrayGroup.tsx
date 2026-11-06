import React, { useState, useEffect } from "react";
import { Bell, Wifi, Volume2, Zap } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Tooltip } from "../../ui/Tooltip";
import { hexToRgba } from "../../../services/navbarConfigService";

interface SystemTrayGroupProps {
  accentColor?: string;
  showSeconds?: boolean;
  use24HourClock?: boolean;
  showDayOfWeek?: boolean;
  locale?: string;
  showSystemIcons?: boolean;
  showNotifications?: boolean;
  showClockDate?: boolean;
  singleItem?: "systemIcons" | "notifications" | "clockDate";
  isVertical?: boolean;
  onControlCenterClick?: () => void;
  onNotificationsClick?: () => void;
  onClockClick?: () => void;
  onVolumeClick?: (e: React.MouseEvent) => void;
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
  locale = "id-ID",
  showSystemIcons = true,
  showNotifications = true,
  showClockDate = true,
  singleItem,
  isVertical = false,
  onControlCenterClick,
  onNotificationsClick,
  onClockClick,
  onVolumeClick,
}) => {
  const renderSys = singleItem ? singleItem === "systemIcons" : showSystemIcons;
  const renderNotif = singleItem ? singleItem === "notifications" : showNotifications;
  const renderClock = singleItem ? singleItem === "clockDate" : showClockDate;
  const [timeStr, setTimeStr] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [battery, setBattery] = useState<BatteryState | null>(null);
  const [isBatteryLoaded, setIsBatteryLoaded] = useState(false);

  useEffect(() => {
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
        ? now.toLocaleDateString(locale, { weekday: "short" }) + ", "
        : "";
      const dateNum = now.getDate();
      const monthName = now.toLocaleDateString(locale, { month: "short" });
      setDateStr(`${dayName}${dateNum} ${monthName}`);
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, showSeconds ? 1000 : 10000);
    return () => clearInterval(interval);
  }, [showSeconds, use24HourClock, showDayOfWeek, locale]);

  // Real battery status & real notification listener
  useEffect(() => {
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
    const batteryPollInterval = setInterval(fetchBattery, 5000);

    const unlistenBat = listen<unknown>("battery-update", (ev) => {
      if (!isMounted) return;
      const parsed = parseBatteryData(ev.payload);
      if (parsed) {
        setBattery(parsed);
        setIsBatteryLoaded(true);
      }
    });

    const unlistenNotif = listen("real-notif", () => {
      if (!isMounted) return;
      setUnreadCount((c) => c + 1);
    });

    return () => {
      isMounted = false;
      clearInterval(batteryPollInterval);
      unlistenBat.then((fn) => fn());
      unlistenNotif.then((fn) => fn());
    };
  }, []);

  const isCharging = battery ? battery.is_charging : false;
  const batteryPercent = battery ? battery.percent : 100;
  const batteryFillWidth = Math.max(2, Math.round((batteryPercent / 100) * 14));

  const batteryTooltip = battery
    ? `Pusat Kontrol · Baterai ${battery.percent}%${
        isCharging ? " (Mengisi Daya)" : ""
      }`
    : "Pusat Kontrol · Daya AC";

  return (
    <div
      className={`flex ${
        isVertical ? "flex-col" : "flex-row"
      } items-center gap-1 shrink-0`}
    >
      {/* Control Center Pill */}
      {renderSys && (
        <Tooltip side="top" delay={150} content={batteryTooltip}>
          <button
            type="button"
            data-flyout-trigger="control_center"
            onClick={onControlCenterClick}
            aria-label="Pusat kontrol"
            style={{
              transition:
                "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease, color 180ms ease",
            }}
            className={`${
              isVertical ? "w-10 py-2 flex-col" : "h-10 px-2 flex-row"
            } rounded-[12px] bg-transparent flex items-center justify-center cursor-pointer text-white/70 hover:text-white hover:bg-white/[0.09] hover:-translate-y-[1.5px] active:scale-95 shrink-0`}
          >
            <div
              className={`flex ${
                isVertical ? "flex-col gap-1.5" : "flex-row gap-2"
              } items-center px-0.5`}
            >
              <Wifi size={15} strokeWidth={2} />
              <span
                data-flyout-trigger="volume"
                onClick={(e) => {
                  if (onVolumeClick) {
                    e.stopPropagation();
                    onVolumeClick(e);
                  }
                }}
                className="hover:text-white transition-colors cursor-pointer"
                title="Output suara & volume"
              >
                <Volume2 size={15} strokeWidth={2} />
              </span>

              {/* Original Battery Shape with Zap Inside */}
              <div
                className={`flex ${
                  isVertical ? "flex-col items-center gap-0.5" : "flex-row items-center gap-1.5"
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
              </div>
            </div>
          </button>
        </Tooltip>
      )}

      {/* Notifications Bell */}
      {renderNotif && (
        <Tooltip
          side="top"
          delay={150}
          content={
            <div className="flex items-center gap-1.5 font-medium text-[11.5px]">
              <span>Notifikasi</span>
              {unreadCount > 0 && (
                <span
                  style={{
                    backgroundColor: hexToRgba(accentColor, 0.25),
                    color: accentColor,
                  }}
                  className="text-[9.5px] px-1.5 py-0.2 rounded-full font-semibold border border-white/10"
                >
                  {unreadCount} baru
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
            aria-label={`Notifikasi${unreadCount > 0 ? `, ${unreadCount} baru` : ""}`}
            style={{
              transition:
                "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease, color 180ms ease",
            }}
            className="relative w-9 h-10 rounded-[12px] bg-transparent text-white/65 hover:text-white hover:bg-white/[0.09] hover:-translate-y-[1.5px] hover:scale-[1.06] active:scale-95 flex items-center justify-center p-0 cursor-pointer shrink-0"
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
        <Tooltip side="top" delay={150} content="Kalender & Waktu">
          <button
            type="button"
            data-flyout-trigger="calendar"
            onClick={onClockClick}
            aria-label="Jam dan kalender"
            style={{
              transition:
                "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease",
            }}
            className={`rounded-[12px] bg-transparent text-white flex flex-col ${
              isVertical ? "items-center px-1 py-1.5" : "items-end px-2 py-1"
            } cursor-pointer hover:bg-white/[0.09] hover:-translate-y-[1.5px] active:scale-95 shrink-0`}
          >
            <span className="text-[12.5px] font-semibold tabular-nums leading-4 tracking-tight">
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
