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

  return (
    <div className="flex items-center gap-2.5 mt-2.5 w-full select-none shrink-0">
      {/* Previous / Back Button */}
      <Tooltip content="Sebelumnya" side="bottom">
        <button
          type="button"
          aria-label="Halaman sebelumnya"
          onClick={onPrevTab}
          className="w-[34px] h-[34px] rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
      </Tooltip>

      {/* Title */}
      <div className="text-[18px] font-semibold tracking-[-0.02em] text-white">
        AI Chat
      </div>

      {/* Model Selector Dropdown Trigger */}
      <button
        type="button"
        data-dropdown-trigger="ai-model-selector"
        aria-haspopup="listbox"
        aria-expanded={isModelDropdownOpen}
        aria-label={`Ganti model, sekarang ${isAutoMode ? "Auto (Hemat & Cerdas)" : activeModel.name}`}
        onClick={onToggleModelDropdown}
        className="h-7 px-2.5 border border-white/10 hover:border-white/20 rounded-[14px] bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-all"
      >
        <span
          className="w-[7px] h-[7px] rounded-full shrink-0"
          style={{
            background: isAutoMode ? "#3882F6" : accentColor,
            boxShadow: `0 0 8px ${isAutoMode ? "#3882F6" : accentColor}`,
          }}
        />
        <span className="truncate max-w-[130px]">
          {isAutoMode ? "Auto (Hemat)" : activeModel.name}
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
      <Tooltip content="Penggunaan & Token" side="bottom">
        <button
          type="button"
          aria-label="Lihat penggunaan token"
          onClick={onOpenUsage}
          className="w-[34px] h-[34px] rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <BarChart2 size={15} strokeWidth={2} />
        </button>
      </Tooltip>

      {/* History Button */}
      <Tooltip content="Riwayat Chat" side="bottom">
        <button
          type="button"
          aria-label="Lihat riwayat percakapan"
          onClick={onOpenHistory}
          className="w-[34px] h-[34px] rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <History size={15} strokeWidth={2} />
        </button>
      </Tooltip>

      {/* New Conversation Button */}
      <Tooltip content="Percakapan baru" side="bottom">
        <button
          type="button"
          aria-label="Percakapan baru"
          onClick={onNewConversation}
          className="w-[34px] h-[34px] rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </Tooltip>

      {/* Settings Button */}
      <Tooltip content="Hubungkan AI / Pengaturan" side="bottom">
        <button
          type="button"
          aria-label="Buka pengaturan AI"
          onClick={onOpenSettings}
          className="w-[34px] h-[34px] rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <Settings size={15} strokeWidth={2} />
        </button>
      </Tooltip>
    </div>
  );
};

