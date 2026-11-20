import React from "react";
import {
  LayoutGrid,
  Sliders,
  Palette,
  Columns3,
  Clock,
  Bell,
  Keyboard,
  ShieldCheck,
  Heart,
  Search,
  X,
  Info,
  PanelBottom,
} from "lucide-react";
import { Language } from "../../services/i18n";
import { Tooltip } from "../ui/Tooltip";

export type SettingsWindowSection =
  | "about"
  | "tabs"
  | "general"
  | "appearance"
  | "navbar"
  | "idle"
  | "standby"
  | "notifications"
  | "shortcuts"
  | "system"
  | "support";

type SidebarGroupId = "island" | "taskbar" | "preferences" | "info";

interface SettingsSidebarProps {
  activeSection: SettingsWindowSection;
  onSelectSection: (section: SettingsWindowSection) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  optLanguage: Language;
  isLightMode: boolean;
  appVersion: string;
  hasUpdate?: boolean;
  updateVersion?: string;
  isTaskbarProLocked?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface SidebarItemMeta {
  id: SettingsWindowSection;
  group: SidebarGroupId;
  labelId: string;
  labelEn: string;
  subId: string;
  subEn: string;
  icon: React.ReactNode;
  bgClass: string;
}

const SIDEBAR_GROUPS: { id: SidebarGroupId; titleId: string; titleEn: string }[] = [
  { id: "info", titleId: "Informasi", titleEn: "Information" },
  { id: "island", titleId: "Notch & Island", titleEn: "Notch & Island" },
  { id: "taskbar", titleId: "Taskbar & Dock", titleEn: "Taskbar & Dock" },
  { id: "preferences", titleId: "Sistem & Preferensi", titleEn: "System & Preferences" },
];

export const SIDEBAR_SECTIONS: SidebarItemMeta[] = [
  {
    id: "about",
    group: "info",
    labelId: "Tentang & Berita",
    labelEn: "About & News",
    subId: "Info app, pembuat & berita",
    subEn: "App info, author & news",
    icon: <Info size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#5ac8fa]",
  },
  {
    id: "support",
    group: "info",
    labelId: "Dukungan (Support)",
    labelEn: "Support & Donate",
    subId: "Saweria, SociaBuzz & QRIS",
    subEn: "Saweria, SociaBuzz & QRIS",
    icon: <Heart size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#ff2d55]",
  },
  {
    id: "tabs",
    group: "island",
    labelId: "Tab & Navigasi",
    labelEn: "Tabs & Navigation",
    subId: "Urutan & visibilitas tab",
    subEn: "Reorder & toggle tabs",
    icon: <LayoutGrid size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#0a84ff]",
  },
  {
    id: "appearance",
    group: "island",
    labelId: "Tampilan & Gaya",
    labelEn: "Appearance & Style",
    subId: "Bentuk, tema & ukuran",
    subEn: "Shape, theme & sizing",
    icon: <Palette size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#5e5ce6]",
  },
  {
    id: "idle",
    group: "island",
    labelId: "Layar Diam (Idle)",
    labelEn: "Idle Bar Layout",
    subId: "Widget kiri, tengah, kanan",
    subEn: "Left, center & right slots",
    icon: <Columns3 size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#ff9f0a]",
  },
  {
    id: "standby",
    group: "island",
    labelId: "StandBy",
    labelEn: "StandBy",
    subId: "Jam meja & layar idle penuh",
    subEn: "Desk display & idle screensaver",
    icon: <Clock size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#ff453a]",
  },
  {
    id: "navbar",
    group: "taskbar",
    labelId: "Taskbar",
    labelEn: "Taskbar",
    subId: "Bentuk dock, modul & perilaku",
    subEn: "Dock shape, modules & behavior",
    icon: <PanelBottom size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#0a84ff]",
  },
  {
    id: "general",
    group: "preferences",
    labelId: "Umum & Perilaku",
    labelEn: "General & Behavior",
    subId: "Bahasa, startup & respon",
    subEn: "Language, startup & delay",
    icon: <Sliders size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#636366]",
  },
  {
    id: "notifications",
    group: "preferences",
    labelId: "Notifikasi & Modul",
    labelEn: "Notifications & Modules",
    subId: "Suara, durasi & listener",
    subEn: "Sounds, duration & modules",
    icon: <Bell size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#ff375f]",
  },
  {
    id: "shortcuts",
    group: "preferences",
    labelId: "Pintasan Keyboard",
    labelEn: "Keyboard Shortcuts",
    subId: "Hotkey global cepat",
    subEn: "Global quick hotkeys",
    icon: <Keyboard size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#30d158]",
  },
  {
    id: "system",
    group: "preferences",
    labelId: "Sistem",
    labelEn: "System",
    subId: "Update, cache & reset",
    subEn: "Updates, cache & reset",
    icon: <ShieldCheck size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#32ade6]",
  },
];

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  activeSection,
  onSelectSection,
  searchQuery,
  onSearchChange,
  optLanguage,
  isLightMode,
  appVersion,
  hasUpdate = false,
  updateVersion,
  isTaskbarProLocked = false,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const isId = optLanguage === "id";

  const renderCollapsedItem = (item: SidebarItemMeta) => {
    const isActive = activeSection === item.id && !searchQuery.trim();
    const showUpdateDot = item.id === "system" && hasUpdate;
    const showProBadge = item.id === "navbar" && isTaskbarProLocked;

    const tooltipContent = (
      <div className="flex flex-col gap-0.5 text-left py-0.5 px-0.5 whitespace-normal max-w-[210px]">
        <div className="flex items-center gap-1.5 font-semibold text-[12px]">
          <span className={isLightMode ? "text-neutral-900" : "text-white"}>
            {isId ? item.labelId : item.labelEn}
          </span>
          {showProBadge && (
            <span
              className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded-[5px] shrink-0 ${
                isLightMode
                  ? "bg-[#eff6ff] text-[#1d4ed8]"
                  : "bg-[#0a84ff]/20 text-[#93c5fd]"
              }`}
            >
              PRO
            </span>
          )}
          {showUpdateDot && (
            <span className="text-[9.5px] font-semibold px-1.5 py-0.2 rounded-full bg-[#ffd60a] text-black shrink-0">
              Update
            </span>
          )}
        </div>
        <span
          className={`text-[10.5px] leading-tight font-normal ${
            isLightMode ? "text-neutral-500" : "text-zinc-400"
          }`}
        >
          {showUpdateDot && updateVersion
            ? isId
              ? `Update v${updateVersion} tersedia`
              : `Update v${updateVersion} available`
            : isId
            ? item.subId
            : item.subEn}
        </span>
      </div>
    );

    return (
      <Tooltip
        key={item.id}
        side="right"
        delay={80}
        wrapperClassName="w-full"
        content={tooltipContent}
      >
        <button
          type="button"
          onClick={() => {
            onSearchChange("");
            onSelectSection(item.id);
          }}
          className={`w-full flex items-center justify-center py-1.5 rounded-[10px] transition-all cursor-pointer ${
            isActive
              ? "bg-[#0a84ff] text-white shadow-[0_3px_12px_rgba(10,132,255,0.32)]"
              : isLightMode
              ? "text-neutral-800 hover:bg-black/[0.05]"
              : "text-zinc-200 hover:bg-white/[0.06]"
          }`}
        >
          <div
            className={`relative w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 text-white shadow-sm transition-transform ${
              isActive ? "bg-white/20 scale-105" : item.bgClass
            }`}
          >
            {item.icon}
            {showUpdateDot && (
              <span
                className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#ffd60a] ring-2 ${
                  isActive
                    ? "ring-[#0a84ff]"
                    : isLightMode
                    ? "ring-[#f2f2f7]"
                    : "ring-[#121216]"
                }`}
              />
            )}
          </div>
        </button>
      </Tooltip>
    );
  };

  return (
    <aside
      className={`shrink-0 h-full flex flex-col justify-between gap-2 border-r select-none transition-all duration-200 ease-in-out ${
        isCollapsed ? "w-[60px] px-2 pb-2.5 pt-2" : "w-[232px] px-2.5 pb-2.5 pt-2"
      } ${
        isLightMode
          ? "bg-[#f2f2f7]/95 border-black/[0.08]"
          : "bg-[#121216]/95 border-white/[0.07]"
      }`}
    >
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        {/* Search Bar */}
        {isCollapsed ? (
          <div className="flex flex-col items-center w-full shrink-0">
            <Tooltip
              side="right"
              delay={120}
              allowFlip
              isLightMode={isLightMode}
              wrapperClassName="w-full"
              content={isId ? "Cari pengaturan" : "Search settings"}
            >
              <button
                type="button"
                aria-label={isId ? "Cari pengaturan" : "Search settings"}
                onClick={() => {
                  onToggleCollapse?.();
                }}
                className={`w-full h-8 rounded-[9px] flex items-center justify-center transition-colors cursor-pointer ${
                  searchQuery
                    ? "bg-[#0a84ff] text-white shadow-sm"
                    : isLightMode
                    ? "text-neutral-600 hover:text-neutral-900 hover:bg-black/[0.06]"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                <Search size={15} strokeWidth={2} />
              </button>
            </Tooltip>
          </div>
        ) : (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[10px] border transition-colors shrink-0 ${
              isLightMode
                ? "bg-white/80 border-black/[0.08] focus-within:border-[#0a84ff] focus-within:bg-white"
                : "bg-white/[0.05] border-white/[0.08] focus-within:border-[#0a84ff] focus-within:bg-white/[0.08]"
            }`}
          >
            <Search
              size={14}
              className={isLightMode ? "text-neutral-500 shrink-0" : "text-zinc-400 shrink-0"}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={isId ? "Cari pengaturan..." : "Search settings..."}
              className={`w-full bg-transparent text-[12.5px] outline-none ${
                isLightMode
                  ? "text-neutral-900 placeholder-neutral-400"
                  : "text-white placeholder-zinc-500"
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                aria-label={isId ? "Hapus pencarian" : "Clear search"}
                onClick={() => onSearchChange("")}
                className={`rounded-full p-0.5 cursor-pointer ${
                  isLightMode
                    ? "text-neutral-400 hover:text-neutral-700"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Grouped Navigation Items */}
        <nav className="flex flex-col gap-3 flex-1 overflow-y-auto min-h-0 no-scrollbar pr-0.5">
          {isCollapsed ? (
            <div className="flex flex-col gap-1 w-full">
              {SIDEBAR_SECTIONS.map(renderCollapsedItem)}
            </div>
          ) : (
            SIDEBAR_GROUPS.map((group) => {
              const items = SIDEBAR_SECTIONS.filter((item) => item.group === group.id);
              return (
                <div key={group.id} className="flex flex-col gap-1 w-full">
                  <span
                    className={`px-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] select-none ${
                      isLightMode ? "text-neutral-500" : "text-zinc-500"
                    }`}
                  >
                    {isId ? group.titleId : group.titleEn}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {items.map((item) => {
                      const isActive = activeSection === item.id && !searchQuery.trim();
                      const showUpdateDot = item.id === "system" && hasUpdate;
                      const showProBadge = item.id === "navbar" && isTaskbarProLocked;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            onSearchChange("");
                            onSelectSection(item.id);
                          }}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[11px] text-left transition-all cursor-pointer ${
                            isActive
                              ? "bg-[#0a84ff] text-white shadow-[0_3px_12px_rgba(10,132,255,0.3)]"
                              : isLightMode
                              ? "text-neutral-800 hover:bg-black/[0.05]"
                              : "text-zinc-200 hover:bg-white/[0.06]"
                          }`}
                        >
                          <div
                            className={`relative w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0 text-white shadow-sm ${
                              isActive ? "bg-white/20" : item.bgClass
                            }`}
                          >
                            {item.icon}
                            {showUpdateDot && (
                              <span
                                className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#ffd60a] ring-2 ${
                                  isActive
                                    ? "ring-[#0a84ff]"
                                    : isLightMode
                                    ? "ring-[#f2f2f7]"
                                    : "ring-[#121216]"
                                }`}
                              />
                            )}
                          </div>
                          <span className="text-[12.5px] font-semibold leading-tight truncate flex-1">
                            {isId ? item.labelId : item.labelEn}
                          </span>
                          {showProBadge && (
                            <span
                              className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-[6px] shrink-0 tracking-wide ${
                                isActive
                                  ? "bg-white/25 text-white"
                                  : isLightMode
                                  ? "bg-[#eff6ff] text-[#1d4ed8]"
                                  : "bg-[#0a84ff]/18 text-[#93c5fd]"
                              }`}
                            >
                              PRO
                            </span>
                          )}
                          {showUpdateDot && (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                                isActive
                                  ? "bg-white/25 text-white"
                                  : isLightMode
                                  ? "bg-amber-500/15 text-amber-700"
                                  : "bg-[#ffd60a]/15 text-[#ffd60a]"
                              }`}
                            >
                              {updateVersion ? `v${updateVersion}` : "Update"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </nav>
      </div>

      {/* Footer App Profile Card */}
      {isCollapsed ? (
        <Tooltip
          side="right"
          delay={120}
          allowFlip
          isLightMode={isLightMode}
          wrapperClassName="w-full shrink-0"
          content={
            <div className="flex flex-col gap-0.5 text-left py-0.5 px-0.5 whitespace-normal">
              <span className={`text-[11.5px] font-semibold ${isLightMode ? "text-neutral-900" : "text-white"}`}>
                Gili Island v{appVersion}
              </span>
              <span
                className={`text-[10px] font-medium ${
                  isLightMode ? "text-emerald-700" : "text-emerald-400"
                }`}
              >
                {isId ? "Status: Aktif" : "Status: Active"}
              </span>
            </div>
          }
        >
          <div
            className={`w-full flex items-center justify-center p-2 rounded-[12px] border transition-colors ${
              isLightMode
                ? "bg-white/80 border-black/[0.06]"
                : "bg-white/[0.03] border-white/[0.06]"
            }`}
          >
            <div className="relative">
              <img
                src="/logo/LOGO-GILI.png"
                alt="Gili"
                draggable={false}
                className="w-7 h-7 rounded-[8px] object-contain shadow-sm shrink-0"
              />
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ${
                  isLightMode ? "ring-[#f2f2f7]" : "ring-[#121216]"
                }`}
              />
            </div>
          </div>
        </Tooltip>
      ) : (
        <div
          className={`flex items-center justify-between px-3 py-2.5 rounded-[12px] border shrink-0 ${
            isLightMode
              ? "bg-white/80 border-black/[0.06]"
              : "bg-white/[0.03] border-white/[0.06]"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/logo/LOGO-GILI.png"
              alt="Gili"
              draggable={false}
              className="w-8 h-8 rounded-[9px] object-contain shadow-sm shrink-0"
            />
            <div className="flex flex-col min-w-0">
              <span
                className={`text-[12px] font-semibold leading-tight truncate ${
                  isLightMode ? "text-neutral-900" : "text-white"
                }`}
              >
                Gili Island
              </span>
              <span
                className={`text-[10.5px] leading-tight ${
                  isLightMode ? "text-neutral-600" : "text-zinc-400"
                }`}
              >
                v{appVersion}
              </span>
            </div>
          </div>
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              isLightMode
                ? "bg-emerald-500/10 text-emerald-700"
                : "bg-emerald-500/15 text-emerald-400"
            }`}
          >
            {isId ? "Aktif" : "Active"}
          </span>
        </div>
      )}
    </aside>
  );
};
