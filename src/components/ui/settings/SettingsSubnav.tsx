import React from "react";
import {
  SlidersHorizontal,
  Palette,
  LayoutTemplate,
  LayoutGrid,
  Wrench,
  Search,
  X,
} from "lucide-react";
import { t } from "../../../services/i18n";

export type SettingsSubtab = "general" | "appearance" | "idle" | "modules" | "advanced";

export interface SettingsSubnavProps {
  activeTab: SettingsSubtab;
  onChangeTab: (tab: SettingsSubtab) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isSearchOpen: boolean;
  onToggleSearch: () => void;
}

export const SettingsSubnav: React.FC<SettingsSubnavProps> = ({
  activeTab,
  onChangeTab,
  searchQuery,
  onSearchChange,
  isSearchOpen,
  onToggleSearch,
}) => {
  const tabs: { id: SettingsSubtab; label: string; icon: React.ReactNode }[] = [
    {
      id: "general",
      label: t("settings_subtab_general"),
      icon: <SlidersHorizontal size={13.5} />,
    },
    {
      id: "appearance",
      label: t("settings_subtab_appearance"),
      icon: <Palette size={13.5} />,
    },
    {
      id: "idle",
      label: t("settings_subtab_idle"),
      icon: <LayoutTemplate size={13.5} />,
    },
    {
      id: "modules",
      label: t("settings_subtab_modules"),
      icon: <LayoutGrid size={13.5} />,
    },
    {
      id: "advanced",
      label: t("settings_subtab_advanced"),
      icon: <Wrench size={13.5} />,
    },
  ];

  return (
    <div className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 shrink-0 select-none">
      {isSearchOpen ? (
        <div className="flex-1 flex items-center gap-2 h-[34px] px-3 rounded-full bg-[#18181c] border border-white/10 transition-all">
          <Search size={14} className="text-[#a1a1aa] shrink-0" />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("settings_search_placeholder")}
            className="flex-1 bg-transparent text-[12px] text-white placeholder-[#71717a] outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="text-[#71717a] hover:text-white transition-colors"
            >
              <X size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSearch}
            className="text-[#71717a] hover:text-white text-[11px] font-medium transition-colors ml-1"
          >
            {t("settings_search_close")}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onChangeTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? "bg-[#27272a] text-white shadow-sm font-semibold"
                      : "text-[#a1a1aa] hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  <span className={isActive ? "text-white" : "text-[#71717a]"}>
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onToggleSearch}
            title={t("settings_search_tooltip")}
            className="w-8 h-8 rounded-full bg-[#18181c] hover:bg-[#23232a] text-[#a1a1aa] hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
          >
            <Search size={14} />
          </button>
        </>
      )}
    </div>
  );
};
