import React from "react";
import {
  LayoutGrid,
  Sliders,
  Palette,
  PanelTop,
  Bell,
  Keyboard,
  ShieldCheck,
  Heart,
  Search,
  X,
} from "lucide-react";
import { Language } from "../../services/i18n";

export type SettingsWindowSection =
  | "tabs"
  | "general"
  | "appearance"
  | "idle"
  | "notifications"
  | "shortcuts"
  | "system"
  | "support";

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
}

interface SidebarItemMeta {
  id: SettingsWindowSection;
  labelId: string;
  labelEn: string;
  subId: string;
  subEn: string;
  icon: React.ReactNode;
  bgClass: string;
}

export const SIDEBAR_SECTIONS: SidebarItemMeta[] = [
  {
    id: "tabs",
    labelId: "Tab & Navigasi",
    labelEn: "Tabs & Navigation",
    subId: "Urutan & visibilitas tab",
    subEn: "Reorder & toggle tabs",
    icon: <LayoutGrid size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#0a84ff]",
  },
  {
    id: "appearance",
    labelId: "Tampilan & Gaya",
    labelEn: "Appearance & Style",
    subId: "Bentuk, tema & ukuran",
    subEn: "Shape, theme & sizing",
    icon: <Palette size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#5e5ce6]",
  },
  {
    id: "idle",
    labelId: "Layar Diam (Idle)",
    labelEn: "Idle Bar Layout",
    subId: "Widget kiri, tengah, kanan",
    subEn: "Left, center & right slots",
    icon: <PanelTop size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#ff9f0a]",
  },
  {
    id: "general",
    labelId: "Umum & Perilaku",
    labelEn: "General & Behavior",
    subId: "Bahasa, startup & respon",
    subEn: "Language, startup & delay",
    icon: <Sliders size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#636366]",
  },
  {
    id: "notifications",
    labelId: "Notifikasi & Modul",
    labelEn: "Notifications & Modules",
    subId: "Suara, durasi & listener",
    subEn: "Sounds, duration & modules",
    icon: <Bell size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#ff375f]",
  },
  {
    id: "shortcuts",
    labelId: "Pintasan Keyboard",
    labelEn: "Keyboard Shortcuts",
    subId: "Hotkey global cepat",
    subEn: "Global quick hotkeys",
    icon: <Keyboard size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#30d158]",
  },
  {
    id: "system",
    labelId: "Sistem & Tentang",
    labelEn: "System & About",
    subId: "Update, cache & reset",
    subEn: "Updates, cache & reset",
    icon: <ShieldCheck size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#32ade6]",
  },
  {
    id: "support",
    labelId: "Dukungan (Support)",
    labelEn: "Support & Donate",
    subId: "Saweria & QRIS",
    subEn: "Saweria & QRIS",
    icon: <Heart size={15} strokeWidth={2.2} />,
    bgClass: "bg-[#ff2d55]",
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
}) => {
  const isId = optLanguage === "id";

  return (
    <aside
      className={`w-[244px] shrink-0 h-full flex flex-col justify-between border-r select-none px-3 pb-3 pt-2 ${
        isLightMode
          ? "bg-[#f2f2f7]/90 border-black/[0.08]"
          : "bg-[#121216]/95 border-white/[0.07]"
      }`}
    >
      <div className="flex flex-col gap-3">
        {/* Search Input */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-[10px] border transition-colors ${
            isLightMode
              ? "bg-black/[0.05] border-black/[0.08] focus-within:border-[#0a84ff] focus-within:bg-white"
              : "bg-white/[0.06] border-white/[0.08] focus-within:border-[#0a84ff] focus-within:bg-white/[0.09]"
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

        {/* Navigation Items */}
        <nav className="flex flex-col gap-1">
          {SIDEBAR_SECTIONS.map((item) => {
            const isActive = activeSection === item.id && !searchQuery.trim();
            const showUpdateDot = item.id === "system" && hasUpdate;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSearchChange("");
                  onSelectSection(item.id);
                }}
                title={
                  showUpdateDot
                    ? isId
                      ? `Update terbaru tersedia${updateVersion ? ` (v${updateVersion})` : ""}`
                      : `New update available${updateVersion ? ` (v${updateVersion})` : ""}`
                    : undefined
                }
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[11px] text-left transition-all cursor-pointer ${
                  isActive
                    ? isLightMode
                      ? "bg-[#0a84ff] text-white shadow-[0_2px_10px_rgba(10,132,255,0.28)]"
                      : "bg-[#0a84ff] text-white shadow-[0_4px_14px_rgba(10,132,255,0.35)]"
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
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[12.5px] font-semibold leading-tight truncate">
                      {isId ? item.labelId : item.labelEn}
                    </span>
                    {showUpdateDot && (
                      <span
                        className="w-2 h-2 rounded-full bg-[#ffd60a] shadow-[0_0_8px_rgba(255,214,10,0.85)] shrink-0"
                        aria-label="Update available"
                      />
                    )}
                  </div>
                  <span
                    className={`text-[10.5px] leading-tight truncate mt-0.5 ${
                      isActive
                        ? "text-white/80"
                        : showUpdateDot
                        ? isLightMode
                          ? "text-amber-600 font-medium"
                          : "text-[#ffd60a]/90 font-medium"
                        : isLightMode
                        ? "text-neutral-500"
                        : "text-zinc-400"
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
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer App Profile Card */}
      <div
        className={`flex items-center justify-between px-3 py-2.5 rounded-[12px] border ${
          isLightMode
            ? "bg-white/75 border-black/[0.06]"
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
                isLightMode ? "text-neutral-500" : "text-zinc-400"
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
    </aside>
  );
};
