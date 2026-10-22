import React, { useState } from "react";
import {
  Columns3,
  Layers,
  ChevronRight,
  BatteryCharging,
  Clock,
  Calendar,
  Activity,
  CloudSun,
  ListTodo,
  FolderSync,
  Gauge,
  EyeOff,
  ArrowLeftRight,
  RotateCcw,
  BellOff,
  Gamepad2,
  BedDouble,
} from "lucide-react";
import { t, Language } from "../../services/i18n";
import { getWeatherIcon } from "./NotifIcon";
import { getTextWidth } from "../../utils/text";

export type IdleSlotItem =
  | "battery"
  | "clock"
  | "date"
  | "smart"
  | "ping"
  | "weather"
  | "todo"
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
  "smart",
  "ping",
  "weather",
  "todo",
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
  focusMode: "Normal" | "DND" | "Gaming" | "Sleep";
  optLanguage: Language;
  isLightMode?: boolean;
  onOpenTab?: (tab: "quick_control" | "todo" | "drop_shelf") => void;
}

export function getItemLabel(item: IdleSlotItem): string {
  switch (item) {
    case "battery":
      return t("settings_slot_battery");
    case "clock":
      return t("settings_slot_clock");
    case "date":
      return t("settings_slot_date");
    case "smart":
      return t("settings_slot_smart");
    case "ping":
      return t("settings_slot_ping");
    case "weather":
      return t("settings_slot_weather");
    case "todo":
      return t("settings_slot_todo");
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
  }
};

interface IdleLayoutSettingProps {
  layout: IdleLayoutConfig;
  onChangeLayout: (next: IdleLayoutConfig) => void;
  runtimeData: IdleRuntimeData;
}

const ITEM_OPTIONS: { id: IdleSlotItem; icon: React.ReactNode }[] = [
  { id: "battery", icon: <BatteryCharging size={12} className="text-emerald-400" /> },
  { id: "clock", icon: <Clock size={12} className="text-sky-400" /> },
  { id: "date", icon: <Calendar size={12} className="text-rose-400" /> },
  { id: "smart", icon: <Layers size={12} className="text-indigo-400" /> },
  { id: "ping", icon: <Activity size={12} className="text-green-400" /> },
  { id: "weather", icon: <CloudSun size={12} className="text-amber-400" /> },
  { id: "todo", icon: <ListTodo size={12} className="text-orange-400" /> },
  { id: "fps", icon: <Gauge size={12} className="text-cyan-400" /> },
  { id: "none", icon: <EyeOff size={12} className="text-white/40" /> },
];

export const IdleLayoutSetting: React.FC<IdleLayoutSettingProps> = ({
  layout,
  onChangeLayout,
  runtimeData,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeSlot, setActiveSlot] = useState<IdleSlotPosition>("right");

  const handleSelectItem = (item: IdleSlotItem) => {
    const next: IdleLayoutConfig = { ...layout };
    const previousItemInActive = next[activeSlot];

    // If user picks an item (other than 'none') that already exists in another slot, swap them!
    if (item !== "none") {
      (["left", "center", "right"] as IdleSlotPosition[]).forEach((pos) => {
        if (pos !== activeSlot && next[pos] === item) {
          next[pos] = previousItemInActive;
        }
      });
    }

    next[activeSlot] = item;

    // Prevent all 3 slots from becoming 'none' at once
    if (next.left === "none" && next.center === "none" && next.right === "none") {
      next.center = "clock";
    }

    onChangeLayout(next);
  };

  const handleSwapLeftRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChangeLayout({
      left: layout.right,
      center: layout.center,
      right: layout.left,
    });
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChangeLayout({ ...DEFAULT_IDLE_LAYOUT });
  };

  const summaryText = [layout.left, layout.center, layout.right]
    .filter((i) => i !== "none")
    .map((i) => getItemLabel(i))
    .join(" • ");

  const posLabel =
    activeSlot === "left"
      ? t("settings_idle_pos_left")
      : activeSlot === "center"
      ? t("settings_idle_pos_center")
      : t("settings_idle_pos_right");

  return (
    <div className="flex flex-col transition-colors">
      {/* Row Header */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px] cursor-pointer hover:bg-white/[0.03] transition-colors select-none"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-2.5 pr-2 min-w-0">
          <div className="w-[28px] h-[28px] rounded-[7px] bg-[#0a84ff] flex items-center justify-center text-white shrink-0 shadow-sm">
            <Columns3 size={15} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[12.5px] font-medium text-white leading-tight">
              {t("settings_idle_slot")}
            </span>
            <span className="text-[9.5px] text-white/50 leading-tight mt-0.5 truncate max-w-[210px]">
              {summaryText}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            {t("settings_idle_customize_btn")}
          </span>
          <ChevronRight
            size={14}
            className={`text-white/40 transition-transform duration-200 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        </div>
      </div>

      {/* Expandable Interactive Preview & Slot Customizer */}
      {isExpanded && (
        <div className="px-3.5 pb-3 pt-1.5 flex flex-col gap-2.5 bg-black/25 border-t border-white/[0.06]">
          {/* Header + Quick Actions (Swap L-R / Reset) */}
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold tracking-wider uppercase text-white/45">
              {t("settings_idle_preview_label")}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSwapLeftRight}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.07] hover:bg-white/[0.14] text-[9.5px] font-medium text-white/80 hover:text-white border border-white/10 transition-colors cursor-pointer"
                title={t("settings_idle_swap_lr")}
              >
                <ArrowLeftRight size={10} />
                <span>{t("settings_idle_swap_lr")}</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[9.5px] font-medium text-white/60 hover:text-white border border-white/10 transition-colors cursor-pointer"
                title={t("settings_idle_reset")}
              >
                <RotateCcw size={9.5} />
              </button>
            </div>
          </div>

          {/* Interactive Miniature Dynamic Island Preview */}
          <div className="w-full py-2.5 px-2 rounded-xl bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.07] flex flex-col items-center justify-center gap-2">
            <div className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-full bg-black border border-white/15 shadow-[0_6px_20px_rgba(0,0,0,0.65)]">
              {(["left", "center", "right"] as IdleSlotPosition[]).map((pos) => {
                const isSelected = activeSlot === pos;
                const item = layout[pos];
                const posName =
                  pos === "left"
                    ? t("settings_idle_pos_left")
                    : pos === "center"
                    ? t("settings_idle_pos_center")
                    : t("settings_idle_pos_right");

                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setActiveSlot(pos)}
                    className={`relative flex items-center justify-center px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#0a84ff]/25 ring-1 ring-[#0a84ff] shadow-[0_0_10px_rgba(10,132,255,0.35)]"
                        : "bg-white/[0.05] hover:bg-white/[0.1]"
                    }`}
                    title={`${posName}: ${getItemLabel(item)}`}
                  >
                    <IdleSlotView item={item} data={runtimeData} isPreview={true} />
                  </button>
                );
              })}
            </div>

            {/* Position Tabs (Left / Center / Right) */}
            <div className="grid grid-cols-3 gap-1.5 w-full">
              {(["left", "center", "right"] as IdleSlotPosition[]).map((pos) => {
                const isSelected = activeSlot === pos;
                const posTitle =
                  pos === "left"
                    ? t("settings_idle_pos_left")
                    : pos === "center"
                    ? t("settings_idle_pos_center")
                    : t("settings_idle_pos_right");
                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setActiveSlot(pos)}
                    className={`py-1 px-2 rounded-lg text-[10px] font-semibold flex items-center justify-between border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#0a84ff]/20 border-[#0a84ff]/60 text-white shadow-sm"
                        : "bg-white/[0.04] border-white/[0.07] text-white/55 hover:text-white/85 hover:bg-white/[0.08]"
                    }`}
                  >
                    <span className="text-[9px] uppercase tracking-wider opacity-70">{posTitle}</span>
                    <span className="truncate ml-1 font-bold text-[#38bdf8]">
                      {getItemLabel(layout[pos])}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Item Picker Grid for Currently Selected Slot */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium text-white/60">
              {t("settings_idle_pick_for", { pos: posLabel })}
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {ITEM_OPTIONS.map((opt) => {
                const isCurrent = layout[activeSlot] === opt.id;
                const usedInOtherSlot =
                  opt.id !== "none" &&
                  ((activeSlot !== "left" && layout.left === opt.id) ||
                    (activeSlot !== "center" && layout.center === opt.id) ||
                    (activeSlot !== "right" && layout.right === opt.id));

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectItem(opt.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10.5px] font-medium border transition-all cursor-pointer active:scale-95 ${
                      isCurrent
                        ? "bg-[#0a84ff] border-[#0a84ff] text-white font-semibold shadow-[0_2px_10px_rgba(10,132,255,0.4)]"
                        : usedInOtherSlot
                        ? "bg-white/[0.06] border-white/15 text-white/80 hover:bg-white/[0.12]"
                        : "bg-white/[0.04] border-white/[0.08] text-white/70 hover:bg-white/[0.1] hover:text-white"
                    }`}
                  >
                    <span className="shrink-0">{opt.icon}</span>
                    <span className="truncate">{getItemLabel(opt.id)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
