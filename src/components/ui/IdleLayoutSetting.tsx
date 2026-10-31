import React from "react";
import {
  ListTodo,
  FolderSync,
  BellOff,
  Gamepad2,
  BedDouble,
  Cpu,
  MemoryStick,
  ArrowDown,
  Moon,
} from "lucide-react";
import { t, Language } from "../../services/i18n";
import { getWeatherIcon } from "./NotifIcon";
import { getTextWidth } from "../../utils/text";
import {
  getImmediatePrayerSchedule,
  getNextPrayerStatus,
  getPrayerShortName,
} from "../../services/prayerService";

export type IdleSlotItem =
  | "battery"
  | "clock"
  | "date"
  | "cpu"
  | "ram"
  | "netspeed"
  | "smart"
  | "ping"
  | "weather"
  | "todo"
  | "prayer"
  | "fps"
  | "none";

export type IdleSlotPosition = "left" | "center" | "right";

export interface IdleLayoutConfig {
  left: IdleSlotItem;
  center: IdleSlotItem;
  right: IdleSlotItem;
}

export const DEFAULT_IDLE_LAYOUT: IdleLayoutConfig = {
  left: "battery",
  center: "clock",
  right: "date",
};

const VALID_ITEMS: Set<string> = new Set([
  "battery",
  "clock",
  "date",
  "cpu",
  "ram",
  "netspeed",
  "smart",
  "ping",
  "weather",
  "todo",
  "prayer",
  "fps",
  "none",
]);

function normalizeItem(val: any, fallback: IdleSlotItem): IdleSlotItem {
  if (val === "shelf") return "fps";
  return VALID_ITEMS.has(val) ? (val as IdleSlotItem) : fallback;
}

export function parseIdleLayout(raw: any): IdleLayoutConfig {
  if (raw && typeof raw === "object") {
    const left = normalizeItem(raw.left, DEFAULT_IDLE_LAYOUT.left);
    const center = normalizeItem(raw.center, DEFAULT_IDLE_LAYOUT.center);
    const right = normalizeItem(raw.right, DEFAULT_IDLE_LAYOUT.right);
    if (left === "none" && center === "none" && right === "none") {
      return { left: "none", center: "clock", right: "none" };
    }
    return { left, center, right };
  }
  return { ...DEFAULT_IDLE_LAYOUT };
}

export function getSavedIdleLayout(): IdleLayoutConfig {
  try {
    const saved = localStorage.getItem("island_idle_layout");
    if (saved) {
      return parseIdleLayout(JSON.parse(saved));
    }
    const legacyRight = localStorage.getItem("island_idle_slot");
    if (legacyRight && VALID_ITEMS.has(legacyRight)) {
      return { left: "battery", center: "clock", right: legacyRight as IdleSlotItem };
    }
  } catch {}
  return { ...DEFAULT_IDLE_LAYOUT };
}

export interface IdleRuntimeData {
  battery: { is_charging: boolean; percent: number } | null;
  time: Date;
  dateDisplay: string;
  fullDateTitle: string;
  weather: { temp: string; code: number; locationName?: string } | null;
  networkPing: number | null;
  pendingTodosCount: number;
  stashedFilesCount: number;
  fps?: number;
  cpuUsage?: number;
  ramUsage?: number;
  ramUsedGb?: number;
  ramTotalGb?: number;
  netDownMbps?: number;
  netUpMbps?: number;
  focusMode: "Normal" | "DND" | "Gaming" | "Sleep";
  optLanguage: Language;
  isLightMode?: boolean;
  onOpenTab?: (tab: "quick_control" | "todo" | "drop_shelf" | "sys_monitor" | "prayer_reminder") => void;
}

export function formatNetSpeed(mbps?: number): string {
  if (mbps === undefined || mbps === null || mbps <= 0.001) return "0 KB/s";
  // mbps is Megabits/s from Rust Windows kernel API (1 Megabit = 1,000,000 bits)
  // Convert to Bytes/sec: 8 bits = 1 byte
  const bytesPerSec = (mbps * 1_000_000) / 8;
  if (bytesPerSec >= 1024 * 1024 * 100) {
    return `${Math.round(bytesPerSec / (1024 * 1024))} MB/s`;
  }
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  if (bytesPerSec >= 1024) {
    return `${Math.round(bytesPerSec / 1024)} KB/s`;
  }
  return "0 KB/s";
}

export function getItemLabel(item: IdleSlotItem): string {
  switch (item) {
    case "battery":
      return t("settings_slot_battery");
    case "clock":
      return t("settings_slot_clock");
    case "date":
      return t("settings_slot_date");
    case "cpu":
      return t("settings_slot_cpu");
    case "ram":
      return t("settings_slot_ram");
    case "netspeed":
      return t("settings_slot_netspeed");
    case "smart":
      return t("settings_slot_smart");
    case "ping":
      return t("settings_slot_ping");
    case "weather":
      return t("settings_slot_weather");
    case "todo":
      return t("settings_slot_todo");
    case "prayer":
      return t("settings_slot_prayer") || "Sholat";
    case "fps":
      return t("settings_slot_fps");
    case "none":
      return t("settings_slot_none");
  }
}

export function measureIdleSlotItemWidth(
  item: IdleSlotItem,
  data: IdleRuntimeData,
  statFont: string
): number {
  switch (item) {
    case "none":
      return 0;
    case "battery": {
      if (data.battery && data.battery.percent <= 100) {
        return Math.ceil(getTextWidth(`${data.battery.percent}%`, statFont) + 4);
      }
      return Math.ceil(getTextWidth(data.dateDisplay, statFont));
    }
    case "clock": {
      const timeText = data.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return Math.ceil(getTextWidth(timeText, statFont));
    }
    case "date": {
      return Math.ceil(getTextWidth(data.dateDisplay, statFont) + 2);
    }
    case "cpu": {
      const cpuVal = data.cpuUsage !== undefined ? Math.round(data.cpuUsage) : 24;
      return Math.ceil(getTextWidth(`${cpuVal}%`, statFont) + 15);
    }
    case "ram": {
      const ramVal = data.ramUsage !== undefined ? Math.round(data.ramUsage) : 52;
      return Math.ceil(getTextWidth(`${ramVal}%`, statFont) + 15);
    }
    case "netspeed": {
      const speedText = formatNetSpeed(data.netDownMbps);
      return Math.ceil(getTextWidth(speedText, statFont) + 14);
    }
    case "smart": {
      if (data.focusMode !== "Normal") {
        const focusLabel = data.focusMode === "Gaming" ? "Game" : data.focusMode;
        return Math.ceil(getTextWidth(focusLabel, statFont) + 16);
      }
      if (data.pendingTodosCount > 0) {
        return Math.ceil(getTextWidth(`${data.pendingTodosCount}`, statFont) + 16);
      }
      if (data.stashedFilesCount > 0) {
        return Math.ceil(getTextWidth(`${data.stashedFilesCount}`, statFont) + 16);
      }
      return Math.ceil(getTextWidth(data.dateDisplay, statFont) + 2);
    }
    case "ping": {
      const pingText = data.networkPing !== null ? `${data.networkPing}ms` : "Off";
      return Math.ceil(getTextWidth(pingText, statFont) + 14);
    }
    case "weather": {
      const tempText = data.weather?.temp || "--°";
      return Math.ceil(getTextWidth(tempText, statFont) + 20);
    }
    case "todo": {
      return Math.ceil(getTextWidth(`${data.pendingTodosCount}`, statFont) + 16);
    }
    case "prayer": {
      const sched = getImmediatePrayerSchedule();
      const next = getNextPrayerStatus(sched, data.time);
      const label = `${getPrayerShortName(next.nextPrayer, data.optLanguage)} ${next.nextPrayerTime}`;
      return Math.ceil(getTextWidth(label, statFont) + 16);
    }
    case "fps": {
      const fpsText = `${data.fps || 60} FPS`;
      return Math.ceil(getTextWidth(fpsText, statFont) + 2);
    }
  }
}

export function measureIdleLayoutWidth(
  layout: IdleLayoutConfig,
  data: IdleRuntimeData,
  statFont: string,
  camActive: boolean,
  micActive: boolean,
  idleSize: "compact" | "default" | "large" = "default"
): number {
  const slots: IdleSlotItem[] = [layout.left, layout.center, layout.right];
  let totalWidth = 0;
  let activeCount = 0;

  slots.forEach((slot) => {
    const w = measureIdleSlotItemWidth(slot, data, statFont);
    if (w > 0) {
      totalWidth += w;
      activeCount += 1;
    }
  });

  if (activeCount === 0) {
    const timeText = data.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    totalWidth = Math.ceil(getTextWidth(timeText, statFont));
    activeCount = 1;
  }

  // Camera & Mic privacy indicators are displayed alongside the right slot (not replacing it)
  if (camActive || micActive) {
    const dotsCount = (camActive ? 1 : 0) + (micActive ? 1 : 0);
    totalWidth += dotsCount === 2 ? 22 : 14;
  }

  const slotGap = idleSize === "compact" ? 8 : idleSize === "large" ? 12 : 10;
  const sidePadding = idleSize === "compact" ? 14 : idleSize === "large" ? 20 : 16;
  const minWidth = idleSize === "compact" ? 96 : idleSize === "large" ? 130 : 112;

  const gaps = Math.max(0, activeCount - 1);
  return Math.max(minWidth, totalWidth + gaps * slotGap + sidePadding * 2);
}

export const IdleSlotView: React.FC<{
  item: IdleSlotItem;
  data: IdleRuntimeData;
  isPreview?: boolean;
}> = ({ item, data, isPreview = false }) => {
  const baseTextClass = `text-[10px] font-bold leading-none idle-stat-number ${
    data.isLightMode && !isPreview ? "text-black" : "text-neutral-200"
  }`;

  switch (item) {
    case "none":
      return isPreview ? (
        <span className="text-[9.5px] font-medium text-white/30 italic">
          {t("settings_slot_none")}
        </span>
      ) : null;

    case "battery": {
      if (data.battery && data.battery.percent <= 100) {
        const colorClass = data.battery.is_charging
          ? data.isLightMode && !isPreview
            ? "text-emerald-700 battery-charging"
            : "text-green-400"
          : data.battery.percent <= 20
          ? data.isLightMode && !isPreview
            ? "text-red-700 battery-low"
            : "text-red-400"
          : data.isLightMode && !isPreview
          ? "text-black"
          : "text-white";
        return (
          <span className={`text-[10px] font-bold leading-none tabular-nums idle-stat-number ${colorClass}`}>
            {`${data.battery.percent}%`}
          </span>
        );
      }
      return (
        <span className={baseTextClass} title={data.fullDateTitle}>
          {isPreview ? "85%" : data.dateDisplay}
        </span>
      );
    }

    case "clock":
      return (
        <span className={`${baseTextClass} tabular-nums`}>
          {data.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      );

    case "date":
      return (
        <span className={baseTextClass} title={data.fullDateTitle}>
          {data.dateDisplay}
        </span>
      );

    case "smart": {
      if (data.focusMode !== "Normal") {
        return (
          <div
            onClick={(e) => {
              if (!isPreview && data.onOpenTab) {
                e.stopPropagation();
                data.onOpenTab("quick_control");
              }
            }}
            className="flex items-center gap-1 shrink-0 cursor-pointer"
            title={`Focus: ${data.focusMode}`}
          >
            {data.focusMode === "DND" && <BellOff size={10} className="text-indigo-400 shrink-0" />}
            {data.focusMode === "Gaming" && <Gamepad2 size={10.5} className="text-rose-400 shrink-0" />}
            {data.focusMode === "Sleep" && <BedDouble size={10.5} className="text-teal-400 shrink-0" />}
            <span
              className={`text-[10px] font-bold leading-none idle-stat-number ${
                data.focusMode === "DND"
                  ? "text-indigo-300"
                  : data.focusMode === "Gaming"
                  ? "text-rose-300"
                  : "text-teal-300"
              }`}
            >
              {data.focusMode === "Gaming" ? "Game" : data.focusMode}
            </span>
          </div>
        );
      }
      if (data.pendingTodosCount > 0) {
        return (
          <div
            onClick={(e) => {
              if (!isPreview && data.onOpenTab) {
                e.stopPropagation();
                data.onOpenTab("todo");
              }
            }}
            className="flex items-center gap-1 shrink-0 cursor-pointer"
            title={`${data.pendingTodosCount} ${t("todo_badge")}`}
          >
            <ListTodo size={10.5} className="text-amber-400 shrink-0" />
            <span className="text-[10px] font-bold leading-none tabular-nums text-amber-300 idle-stat-number">
              {data.pendingTodosCount}
            </span>
          </div>
        );
      }
      if (data.stashedFilesCount > 0) {
        return (
          <div
            onClick={(e) => {
              if (!isPreview && data.onOpenTab) {
                e.stopPropagation();
                data.onOpenTab("drop_shelf");
              }
            }}
            className="flex items-center gap-1 shrink-0 cursor-pointer"
            title={t("shelf_files_count", { count: data.stashedFilesCount })}
          >
            <FolderSync size={10.5} className="text-cyan-400 shrink-0" />
            <span className="text-[10px] font-bold leading-none tabular-nums text-cyan-300 idle-stat-number">
              {data.stashedFilesCount}
            </span>
          </div>
        );
      }
      return (
        <span className={baseTextClass} title={data.fullDateTitle}>
          {data.dateDisplay}
        </span>
      );
    }

    case "ping":
      return (
        <div
          className="flex items-center gap-1 shrink-0"
          title={data.networkPing !== null ? `Ping: ${data.networkPing}ms` : "Offline"}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              data.networkPing === null
                ? "bg-[#ff453a]"
                : data.networkPing <= 60
                ? "bg-[#30d158] shadow-[0_0_5px_rgba(48,209,88,0.8)]"
                : data.networkPing <= 130
                ? "bg-[#ff9f0a]"
                : "bg-[#ff453a]"
            }`}
          />
          <span className={`${baseTextClass} tabular-nums`}>
            {data.networkPing !== null ? `${data.networkPing}ms` : "Off"}
          </span>
        </div>
      );

    case "weather":
      return (
        <div
          className="flex items-center gap-1 shrink-0"
          title={data.weather?.locationName || undefined}
        >
          {getWeatherIcon(data.weather?.code ?? 0)}
          <span className={baseTextClass}>{data.weather?.temp || "28°"}</span>
        </div>
      );

    case "todo":
      return (
        <div
          onClick={(e) => {
            if (!isPreview && data.onOpenTab) {
              e.stopPropagation();
              data.onOpenTab("todo");
            }
          }}
          className="flex items-center gap-1 shrink-0 cursor-pointer"
          title={`${data.pendingTodosCount} ${t("todo_badge")}`}
        >
          <ListTodo size={10.5} className="text-amber-400 shrink-0" />
          <span className="text-[10px] font-bold leading-none tabular-nums text-amber-300 idle-stat-number">
            {data.pendingTodosCount}
          </span>
        </div>
      );

    case "prayer": {
      const sched = getImmediatePrayerSchedule();
      const next = getNextPrayerStatus(sched, data.time);
      const shortName = getPrayerShortName(next.nextPrayer, data.optLanguage);
      return (
        <div
          onClick={(e) => {
            if (!isPreview && data.onOpenTab) {
              e.stopPropagation();
              data.onOpenTab("prayer_reminder");
            }
          }}
          className="flex items-center gap-1 shrink-0 cursor-pointer"
          title={`${shortName} ${next.nextPrayerTime} (-${next.countdownText})`}
        >
          <Moon size={10} className="text-emerald-400 shrink-0" />
          <span className={`${baseTextClass} tabular-nums`}>
            {shortName} {next.nextPrayerTime}
          </span>
        </div>
      );
    }

    case "fps": {
      const currentFps = data.fps || 60;
      return (
        <span
          className={`${baseTextClass} tabular-nums`}
          title={`Frame Rate: ${currentFps} FPS`}
        >
          {currentFps} FPS
        </span>
      );
    }

    case "cpu": {
      const cpuVal = data.cpuUsage !== undefined ? Math.round(data.cpuUsage) : isPreview ? 24 : 0;
      return (
        <div
          onClick={(e) => {
            if (!isPreview && data.onOpenTab) {
              e.stopPropagation();
              data.onOpenTab("sys_monitor");
            }
          }}
          className="flex items-center gap-1 shrink-0 cursor-pointer"
          title={`CPU: ${cpuVal}%`}
        >
          <Cpu
            size={10.5}
            className={`shrink-0 ${
              data.isLightMode && !isPreview ? "text-violet-700" : "text-[#a78bfa]"
            }`}
          />
          <span className={`${baseTextClass} tabular-nums`}>
            {cpuVal}%
          </span>
        </div>
      );
    }

    case "ram": {
      const ramVal = data.ramUsage !== undefined ? Math.round(data.ramUsage) : isPreview ? 52 : 0;
      const usedGb = data.ramUsedGb?.toFixed(1);
      const totalGb = data.ramTotalGb?.toFixed(1);
      const tip = usedGb && totalGb ? `RAM: ${ramVal}% (${usedGb}/${totalGb} GB)` : `RAM: ${ramVal}%`;
      return (
        <div
          onClick={(e) => {
            if (!isPreview && data.onOpenTab) {
              e.stopPropagation();
              data.onOpenTab("sys_monitor");
            }
          }}
          className="flex items-center gap-1 shrink-0 cursor-pointer"
          title={tip}
        >
          <MemoryStick
            size={10.5}
            className={`shrink-0 ${
              data.isLightMode && !isPreview ? "text-purple-700" : "text-[#c084fc]"
            }`}
          />
          <span className={`${baseTextClass} tabular-nums`}>
            {ramVal}%
          </span>
        </div>
      );
    }

    case "netspeed": {
      const speedStr = formatNetSpeed(data.netDownMbps ?? (isPreview ? 1.2 * 8 : undefined));
      const downM = data.netDownMbps ? (data.netDownMbps / 8).toFixed(2) : "0.00";
      const upM = data.netUpMbps ? (data.netUpMbps / 8).toFixed(2) : "0.00";
      return (
        <div
          onClick={(e) => {
            if (!isPreview && data.onOpenTab) {
              e.stopPropagation();
              data.onOpenTab("sys_monitor");
            }
          }}
          className="flex items-center gap-0.5 shrink-0 cursor-pointer"
          title={`↓ ${downM} MB/s · ↑ ${upM} MB/s`}
        >
          <ArrowDown
            size={10}
            className={`shrink-0 ${
              data.isLightMode && !isPreview ? "text-sky-700" : "text-[#38bdf8]"
            }`}
          />
          <span className={`${baseTextClass} tabular-nums`}>
            {speedStr}
          </span>
        </div>
      );
    }
  }
};
