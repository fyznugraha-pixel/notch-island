import React from "react";
import {
  ChevronLeft,
  ChevronDown,
  Plus,
  Settings,
  BarChart2,
  History,
} from "lucide-react";
import { Tooltip } from "../Tooltip";
import { t } from "../../../services/i18n";
import type { AiModelConfig } from "./AiChatTypes";

interface AiChatHeaderProps {
  activeModel: AiModelConfig;
  selectedMode?: "auto" | string;
  isModelDropdownOpen: boolean;
  onToggleModelDropdown: () => void;
  onNewConversation: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onOpenUsage: () => void;
  onPrevTab?: () => void;
  accentColor?: string;
}

export const AiChatHeader: React.FC<AiChatHeaderProps> = ({
  activeModel,
  selectedMode = "auto",
  isModelDropdownOpen,
  onToggleModelDropdown,
  onNewConversation,
  onOpenHistory,
  onOpenSettings,
  onOpenUsage,
  onPrevTab,
  accentColor = "#3882F6",
}) => {
  const isAutoMode = selectedMode === "auto";
  const isFreeMode = selectedMode === "gili-free" || activeModel.id === "gili-free";

  return (
    <div className="flex items-center gap-2.5 mt-2.5 w-full select-none shrink-0">
      {/* Previous / Back Button */}
      <Tooltip content={t("aichat_tooltip_prev")} side="bottom">
        <button
          type="button"
          aria-label={t("aichat_tooltip_prev")}
          onClick={onPrevTab}
          className="w-[34px] h-[34px] rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
      </Tooltip>

      {/* Title */}
      <div className="text-[18px] font-semibold tracking-[-0.02em] text-white">
        {t("aichat_title")}
      </div>

      {/* Model Selector Dropdown Trigger */}
      <button
        type="button"
        data-dropdown-trigger="ai-model-selector"
        aria-haspopup="listbox"
        aria-expanded={isModelDropdownOpen}
        aria-label={t("aichat_model_switch_label", { model: isFreeMode ? activeModel.name : isAutoMode ? t("aichat_auto_mode_badge") : activeModel.name })}
        onClick={onToggleModelDropdown}
        className="h-7 px-2.5 border border-white/10 hover:border-white/20 rounded-[14px] bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-all"
      >
        <span
          className="w-[7px] h-[7px] rounded-full shrink-0"
          style={{
            background: isFreeMode ? "#10b981" : isAutoMode ? "#3882F6" : accentColor,
            boxShadow: `0 0 8px ${isFreeMode ? "#10b981" : isAutoMode ? "#3882F6" : accentColor}`,
          }}
        />
        <span className="truncate max-w-[140px]">
          {isFreeMode
            ? activeModel.name
            : isAutoMode
            ? t("aichat_auto_mode_short")
            : activeModel.name}
        </span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={`text-[#a1a1aa] transition-transform duration-200 ${
            isModelDropdownOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <div className="grow" />

      {/* Usage Analytics Button */}
      <Tooltip content={t("aichat_tooltip_usage")} side="bottom">
        <button
          type="button"
          aria-label={t("aichat_tooltip_usage")}
          onClick={onOpenUsage}
          className="w-[34px] h-[34px] rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <BarChart2 size={15} strokeWidth={2} />
        </button>
      </Tooltip>

      {/* History Button */}
      <Tooltip content={t("aichat_tooltip_history")} side="bottom">
        <button
          type="button"
          aria-label={t("aichat_tooltip_history")}
          onClick={onOpenHistory}
          className="w-[34px] h-[34px] rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <History size={15} strokeWidth={2} />
        </button>
      </Tooltip>

      {/* New Conversation Button */}
      <Tooltip content={t("aichat_tooltip_new_chat")} side="bottom">
        <button
          type="button"
          aria-label={t("aichat_tooltip_new_chat")}
          onClick={onNewConversation}
          className="w-[34px] h-[34px] rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </Tooltip>

      {/* Settings Button */}
      <Tooltip content={t("aichat_tooltip_settings")} side="bottom">
        <button
          type="button"
          aria-label={t("aichat_tooltip_settings")}
          onClick={onOpenSettings}
          className="w-[34px] h-[34px] rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <Settings size={15} strokeWidth={2} />
        </button>
      </Tooltip>
    </div>
  );
};

