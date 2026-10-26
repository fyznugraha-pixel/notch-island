import React, { useState } from "react";
import {
  ArrowLeftRight,
  RotateCcw,
  BatteryCharging,
  Clock,
  Calendar,
  Layers,
  Activity,
  Sun,
  ListTodo,
  Gauge,
  EyeOff,
} from "lucide-react";
import {
  IdleLayoutConfig,
  IdleSlotItem,
  IdleSlotPosition,
  IdleRuntimeData,
  DEFAULT_IDLE_LAYOUT,
  getItemLabel,
} from "../IdleLayoutSetting";
import { t } from "../../../services/i18n";

export interface IdleTabProps {
  layout: IdleLayoutConfig;
  onChangeLayout: (next: IdleLayoutConfig) => void;
  runtimeData: IdleRuntimeData;
}

const ALL_IDLE_ITEMS: IdleSlotItem[] = [
  "battery",
  "clock",
  "date",
  "smart",
  "ping",
  "weather",
  "todo",
  "fps",
  "none",
];

const renderOptionIcon = (
  id: IdleSlotItem,
  isSelected: boolean,
  isLightMode: boolean
) => {
  if (isSelected) {
    if (isLightMode) {
      // In light mode, selected item has white tile and crisp blue icon
      switch (id) {
        case "battery":
          return <BatteryCharging size={14} className="!text-[#007aff]" />;
        case "clock":
          return <Clock size={14} className="!text-[#007aff]" />;
        case "date":
          return <Calendar size={14} className="!text-[#007aff]" />;
        case "smart":
          return <Layers size={14} className="!text-[#007aff]" />;
        case "ping":
          return <Activity size={14} className="!text-[#007aff]" />;
        case "weather":
          return <Sun size={14} className="!text-[#007aff]" />;
        case "todo":
          return <ListTodo size={14} className="!text-[#007aff]" />;
        case "fps":
          return <Gauge size={14} className="!text-[#007aff]" />;
        case "none":
        default:
          return <EyeOff size={14} className="!text-[#007aff]" />;
      }
    }

    // When selected in dark mode, icons are pure white against translucent tile
    switch (id) {
      case "battery":
        return <BatteryCharging size={14} className="text-white" />;
      case "clock":
        return <Clock size={14} className="text-white" />;
      case "date":
        return <Calendar size={14} className="text-white" />;
      case "smart":
        return <Layers size={14} className="text-white" />;
      case "ping":
        return <Activity size={14} className="text-white" />;
      case "weather":
        return <Sun size={14} className="text-white" />;
      case "todo":
        return <ListTodo size={14} className="text-white" />;
      case "fps":
        return <Gauge size={14} className="text-white" />;
      case "none":
      default:
        return <EyeOff size={14} className="text-white" />;
    }
  }

  if (isLightMode) {
    switch (id) {
      case "battery":
        return <BatteryCharging size={14} className="text-emerald-700" />;
      case "clock":
        return <Clock size={14} className="text-blue-600" />;
      case "date":
        return <Calendar size={14} className="text-sky-600" />;
      case "smart":
        return <Layers size={14} className="text-purple-600" />;
      case "ping":
        return <Activity size={14} className="text-green-700" />;
      case "weather":
        return <Sun size={14} className="text-amber-600" />;
      case "todo":
        return <ListTodo size={14} className="text-orange-600" />;
      case "fps":
        return <Gauge size={14} className="text-teal-700" />;
      case "none":
      default:
        return <EyeOff size={14} className="text-neutral-500" />;
    }
  }

  // Dark mode unselected
  switch (id) {
    case "battery":
      return <BatteryCharging size={14} className="text-[#34c759]" />;
    case "clock":
      return <Clock size={14} className="text-[#0a84ff]" />;
    case "date":
      return <Calendar size={14} className="text-[#0a84ff]" />;
    case "smart":
      return <Layers size={14} className="text-[#af52de]" />;
    case "ping":
      return <Activity size={14} className="text-[#30d158]" />;
    case "weather":
      return <Sun size={14} className="text-[#ff9f0a]" />;
    case "todo":
      return <ListTodo size={14} className="text-[#ff9f0a]" />;
    case "fps":
      return <Gauge size={14} className="text-[#40c8ae]" />;
    case "none":
    default:
      return <EyeOff size={14} className="text-[#71717a]" />;
  }
};

const getOptionBgClass = (
  id: IdleSlotItem,
  isSelected: boolean,
  isLightMode: boolean
) => {
  if (isSelected) {
    return isLightMode ? "bg-white text-[#007aff] shadow-sm" : "bg-white/20 text-white";
  }

  if (isLightMode) {
    switch (id) {
      case "battery":
        return "bg-emerald-100/90";
      case "clock":
        return "bg-blue-100/90";
      case "date":
        return "bg-sky-100/90";
      case "smart":
        return "bg-purple-100/90";
      case "ping":
        return "bg-green-100/90";
      case "weather":
        return "bg-amber-100/90";
      case "todo":
        return "bg-orange-100/90";
      case "fps":
        return "bg-teal-100/90";
      case "none":
      default:
        return "bg-neutral-200/90";
    }
  }

  // Dark mode unselected
  switch (id) {
    case "battery":
      return "bg-[#132c1e]";
    case "clock":
      return "bg-[#142333]";
    case "date":
      return "bg-[#182338]";
    case "smart":
      return "bg-[#26182e]";
    case "ping":
      return "bg-[#132c22]";
    case "weather":
      return "bg-[#2c2410]";
    case "todo":
      return "bg-[#2c2010]";
    case "fps":
      return "bg-[#132c2c]";
    case "none":
    default:
      return "bg-[#1c1c20]";
  }
};

export const IdleTab: React.FC<IdleTabProps> = ({
  layout,
  onChangeLayout,
  runtimeData,
}) => {
  const [activeSlot, setActiveSlot] = useState<IdleSlotPosition>("right");

  const isLightMode =
    runtimeData.isLightMode ??
    (typeof document !== "undefined" && document.documentElement.classList.contains("light"));

  const handleSelectItem = (item: IdleSlotItem) => {
    const next: IdleLayoutConfig = { ...layout };
    const previousItemInActive = next[activeSlot];

    if (item !== "none") {
      (["left", "center", "right"] as IdleSlotPosition[]).forEach((pos) => {
        if (pos !== activeSlot && next[pos] === item) {
          next[pos] = previousItemInActive;
        }
      });
    }

    next[activeSlot] = item;

    if (next.left === "none" && next.center === "none" && next.right === "none") {
      next.center = "clock";
    }

    onChangeLayout(next);
  };

  const handleSwapLeftRight = () => {
    onChangeLayout({
      left: layout.right,
      center: layout.center,
      right: layout.left,
    });
  };

  const handleReset = () => {
    onChangeLayout({ ...DEFAULT_IDLE_LAYOUT });
  };

  const activeSlotName =
    activeSlot === "left"
      ? t("settings_idle_pos_left")
      : activeSlot === "center"
      ? t("settings_idle_pos_center")
      : t("settings_idle_pos_right");

  const renderPreviewItem = (item: IdleSlotItem) => {
    switch (item) {
      case "battery":
        return (
          <div
            className={`flex items-center gap-1.5 text-[12px] font-semibold tabular-nums ${
              isLightMode ? "text-emerald-700" : "text-[#34c759]"
            }`}
          >
            <BatteryCharging size={13} />
            <span>{runtimeData.battery?.percent ?? 100}%</span>
          </div>
        );
      case "clock": {
        const timeStr = runtimeData.time.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        return (
          <span
            className={`text-[13px] font-bold tabular-nums tracking-tight ${
              isLightMode ? "text-[#1d1d1f]" : "text-white"
            }`}
          >
            {timeStr}
          </span>
        );
      }
      case "date":
        return (
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums idle-preview-date ${
              isLightMode
                ? "bg-black/[0.06] border border-black/10 text-[#1d1d1f]"
                : "bg-white/[0.08] border border-white/10 text-white"
            }`}
          >
            {runtimeData.dateDisplay || (runtimeData.optLanguage === "id" ? "Sab, 24" : "Wed, 24")}
          </span>
        );
      case "smart":
        return (
          <div className="flex items-center gap-1 text-[11px] font-medium text-[#af52de]">
            <Layers size={11} />
            <span>{t("settings_slot_smart")}</span>
          </div>
        );
      case "ping":
        return (
          <div
            className={`flex items-center gap-1 text-[11px] font-semibold tabular-nums ${
              isLightMode ? "text-green-700" : "text-[#30d158]"
            }`}
          >
            <Activity size={11} />
            <span>{runtimeData.networkPing ?? 24}ms</span>
          </div>
        );
      case "weather":
        return (
          <div
            className={`flex items-center gap-1 text-[11px] font-semibold tabular-nums ${
              isLightMode ? "text-amber-600" : "text-[#ff9f0a]"
            }`}
          >
            <Sun size={11} />
            <span>{runtimeData.weather?.temp ?? "27°"}</span>
          </div>
        );
      case "todo":
        return (
          <div
            className={`flex items-center gap-1 text-[11px] font-semibold tabular-nums ${
              isLightMode ? "text-orange-600" : "text-[#ff9f0a]"
            }`}
          >
            <ListTodo size={11} />
            <span>{runtimeData.pendingTodosCount}</span>
          </div>
        );
      case "fps":
        return (
          <span
            className={`text-[11px] font-semibold tabular-nums ${
              isLightMode ? "text-teal-700" : "text-[#40c8ae]"
            }`}
          >
            {runtimeData.fps ?? 60} FPS
          </span>
        );
      case "none":
      default:
        return (
          <span className={`text-[10px] ${isLightMode ? "text-black/30" : "text-white/20"}`}>
            —
          </span>
        );
    }
  };

  return (
    <div
      className={`w-full rounded-[20px] p-2 flex flex-col justify-between ${
        isLightMode
          ? "bg-white/80 border border-black/10 shadow-[0_4px_20px_rgba(0,0,0,0.06)]"
          : "bg-[#111114] border border-white/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
      }`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between px-1">
        <span
          className={`text-[9.5px] font-bold tracking-wider uppercase ${
            isLightMode ? "text-neutral-500" : "text-[#71717a]"
          }`}
        >
          {t("settings_idle_preview_title")}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSwapLeftRight}
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
              isLightMode
                ? "bg-black/5 hover:bg-black/10 text-[#1d1d1f]"
                : "bg-[#18181c] hover:bg-[#222228] text-white"
            }`}
          >
            <ArrowLeftRight size={11} />
            <span>{t("settings_idle_swap_lr")}</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            title={t("settings_idle_reset")}
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isLightMode
                ? "bg-black/5 hover:bg-black/10 text-neutral-600 hover:text-black"
                : "bg-[#18181c] hover:bg-[#222228] text-[#a1a1aa] hover:text-white"
            }`}
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </div>

      {/* Simulated Notch Surface */}
      <div
        className={`w-full h-[46px] rounded-[12px] flex items-center justify-center px-3 my-1 select-none ${
          isLightMode ? "bg-neutral-100 border border-black/5" : "bg-[#0c0c0e] border border-white/[0.04]"
        }`}
      >
        <div
          className={`h-[28px] rounded-full px-3.5 flex items-center justify-between w-full max-w-[280px] idle-preview-notch ${
            isLightMode
              ? "bg-white border border-black/10 shadow-sm"
              : "bg-black border border-white/[0.08] shadow-sm"
          }`}
        >
          <div className="flex items-center justify-start min-w-[50px]">
            {renderPreviewItem(layout.left)}
          </div>
          <div className="flex items-center justify-center">
            {renderPreviewItem(layout.center)}
          </div>
          <div className="flex items-center justify-end min-w-[50px]">
            {renderPreviewItem(layout.right)}
          </div>
        </div>
      </div>

      {/* 3 Slot Selector Tabs */}
      <div className="grid grid-cols-3 gap-1.5 px-0.5 mb-1.5">
        {(["left", "center", "right"] as IdleSlotPosition[]).map((pos) => {
          const isSelected = activeSlot === pos;
          const posTitle =
            pos === "left"
              ? t("settings_idle_pos_left")
              : pos === "center"
              ? t("settings_idle_pos_center")
              : t("settings_idle_pos_right");
          const item = layout[pos];
          const itemText = getItemLabel(item);

          return (
            <button
              key={pos}
              type="button"
              onClick={() => setActiveSlot(pos)}
              className={`h-[28px] rounded-[7px] px-2 flex items-center justify-between text-[10.5px] transition-all cursor-pointer ${
                isSelected
                  ? "bg-[#007aff]/15 border border-[#007aff] text-[#007aff] shadow-sm font-semibold"
                  : isLightMode
                  ? "bg-black/[0.04] hover:bg-black/[0.08] border border-black/10 text-neutral-600"
                  : "bg-[#18181c] hover:bg-[#202026] border border-white/[0.04] text-[#a1a1aa]"
              }`}
            >
              <span
                className={`text-[9.5px] font-bold tracking-wider uppercase ${
                  isSelected ? "text-[#007aff]" : isLightMode ? "text-neutral-500" : "text-[#71717a]"
                }`}
              >
                {posTitle}
              </span>
              <span
                className={`font-semibold truncate max-w-[65px] ${
                  isSelected ? "text-[#007aff]" : isLightMode ? "text-[#1d1d1f]" : "text-white/80"
                }`}
              >
                {itemText}
              </span>
            </button>
          );
        })}
      </div>

      {/* Options Section */}
      <div className="flex flex-col px-0.5">
        <span
          className={`text-[10px] font-medium mb-1 ${
            isLightMode ? "text-neutral-500" : "text-[#71717a]"
          }`}
        >
          {t("settings_idle_pick_for", { pos: activeSlotName })}
        </span>

        {/* 3x3 Grid */}
        <div className="grid grid-cols-3 gap-1">
          {ALL_IDLE_ITEMS.map((itemId) => {
            const isSelected = layout[activeSlot] === itemId;
            const label = getItemLabel(itemId);

            return (
              <button
                key={itemId}
                type="button"
                onClick={() => handleSelectItem(itemId)}
                className={`h-[27px] px-2 rounded-[7px] flex items-center gap-1.5 text-[11px] font-medium transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[#007aff] text-white shadow-sm font-semibold"
                    : isLightMode
                    ? "bg-black/[0.04] hover:bg-black/[0.08] text-[#1d1d1f]"
                    : "bg-[#161619] hover:bg-[#202026] text-[#a1a1aa] hover:text-white"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0 idle-option-icon-box ${getOptionBgClass(
                    itemId,
                    isSelected,
                    isLightMode
                  )}`}
                >
                  {renderOptionIcon(itemId, isSelected, isLightMode)}
                </div>
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
