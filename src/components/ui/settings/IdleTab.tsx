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

const IDLE_OPTIONS: {
  id: IdleSlotItem;
  icon: React.ReactNode;
  iconBgClass: string;
}[] = [
  {
    id: "battery",
    icon: <BatteryCharging size={14} className="text-[#34c759]" />,
    iconBgClass: "bg-[#132c1e]",
  },
  {
    id: "clock",
    icon: <Clock size={14} className="text-[#0a84ff]" />,
    iconBgClass: "bg-[#142333]",
  },
  {
    id: "date",
    icon: <Calendar size={14} className="text-[#0a84ff]" />,
    iconBgClass: "bg-[#182338]",
  },
  {
    id: "smart",
    icon: <Layers size={14} className="text-[#af52de]" />,
    iconBgClass: "bg-[#26182e]",
  },
  {
    id: "ping",
    icon: <Activity size={14} className="text-[#30d158]" />,
    iconBgClass: "bg-[#132c22]",
  },
  {
    id: "weather",
    icon: <Sun size={14} className="text-[#ff9f0a]" />,
    iconBgClass: "bg-[#2c2410]",
  },
  {
    id: "todo",
    icon: <ListTodo size={14} className="text-[#ff9f0a]" />,
    iconBgClass: "bg-[#2c2010]",
  },
  {
    id: "fps",
    icon: <Gauge size={14} className="text-[#40c8ae]" />,
    iconBgClass: "bg-[#132c2c]",
  },
  {
    id: "none",
    icon: <EyeOff size={14} className="text-[#71717a]" />,
    iconBgClass: "bg-[#1c1c20]",
  },
];

export const IdleTab: React.FC<IdleTabProps> = ({
  layout,
  onChangeLayout,
  runtimeData,
}) => {
  const [activeSlot, setActiveSlot] = useState<IdleSlotPosition>("right");

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
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#34c759] tabular-nums">
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
          <span className="text-[13px] font-bold text-white tabular-nums tracking-tight">
            {timeStr}
          </span>
        );
      }
      case "date":
        return (
          <span className="px-2 py-0.5 rounded-full bg-white/[0.08] border border-white/10 text-[11px] font-medium text-white tabular-nums idle-preview-date">
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
          <div className="flex items-center gap-1 text-[11px] font-semibold text-[#30d158] tabular-nums">
            <Activity size={11} />
            <span>{runtimeData.networkPing ?? 24}ms</span>
          </div>
        );
      case "weather":
        return (
          <div className="flex items-center gap-1 text-[11px] font-semibold text-[#ff9f0a] tabular-nums">
            <Sun size={11} />
            <span>{runtimeData.weather?.temp ?? "27°"}</span>
          </div>
        );
      case "todo":
        return (
          <div className="flex items-center gap-1 text-[11px] font-semibold text-[#ff9f0a] tabular-nums">
            <ListTodo size={11} />
            <span>{runtimeData.pendingTodosCount}</span>
          </div>
        );
      case "fps":
        return (
          <span className="text-[11px] font-semibold text-[#40c8ae] tabular-nums">
            {runtimeData.fps ?? 60} FPS
          </span>
        );
      case "none":
      default:
        return <span className="text-white/20 text-[10px]">—</span>;
    }
  };

  return (
    <div className="w-full rounded-[20px] bg-[#111114] border border-white/[0.06] p-2 flex flex-col justify-between shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      {/* Header Row */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[9.5px] font-bold text-[#71717a] tracking-wider uppercase">
          {t("settings_idle_preview_title")}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSwapLeftRight}
            className="px-2.5 py-0.5 rounded-full bg-[#18181c] hover:bg-[#222228] text-white text-[10px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
          >
            <ArrowLeftRight size={11} />
            <span>{t("settings_idle_swap_lr")}</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            title={t("settings_idle_reset")}
            className="w-6 h-6 rounded-full bg-[#18181c] hover:bg-[#222228] text-[#a1a1aa] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </div>

      {/* Simulated Notch Surface */}
      <div className="w-full h-[46px] rounded-[12px] bg-[#0c0c0e] border border-white/[0.04] flex items-center justify-center px-3 my-1 select-none">
        <div className="h-[28px] rounded-full bg-black border border-white/[0.08] px-3.5 flex items-center justify-between w-full max-w-[280px] shadow-sm idle-preview-notch">
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
                  ? "bg-[#007aff]/15 border border-[#007aff] text-[#007aff] shadow-sm"
                  : "bg-[#18181c] hover:bg-[#202026] border border-white/[0.04] text-[#a1a1aa]"
              }`}
            >
              <span
                className={`text-[9.5px] font-bold tracking-wider uppercase ${
                  isSelected ? "text-[#007aff]" : "text-[#71717a]"
                }`}
              >
                {posTitle}
              </span>
              <span
                className={`font-semibold truncate max-w-[65px] ${
                  isSelected ? "text-[#007aff]" : "text-white/80"
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
        <span className="text-[10px] font-medium text-[#71717a] mb-1">
          {t("settings_idle_pick_for").replace("{pos}", activeSlotName)}
        </span>

        {/* 3x3 Grid */}
        <div className="grid grid-cols-3 gap-1">
          {IDLE_OPTIONS.map((opt) => {
            const isSelected = layout[activeSlot] === opt.id;
            const label = getItemLabel(opt.id);

            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectItem(opt.id)}
                className={`h-[27px] px-2 rounded-[7px] flex items-center gap-1.5 text-[11px] font-medium transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[#007aff] text-white shadow-sm font-semibold"
                    : "bg-[#161619] hover:bg-[#202026] text-[#a1a1aa] hover:text-white"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0 ${
                    isSelected ? "bg-white/20 text-white" : opt.iconBgClass
                  }`}
                >
                  {opt.icon}
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
