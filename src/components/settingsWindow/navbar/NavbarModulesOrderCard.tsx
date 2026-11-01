import React from "react";
import { NavbarConfig } from "../../../types/navbar";
import { GripVertical, Plus, X, Box, ArrowUp, ArrowDown } from "lucide-react";
import { Tooltip } from "../../ui/Tooltip";
import {
  getCatalogModule,
  NavbarModuleUnifiedPreview,
} from "../../../modules/components/NavbarModuleUnifiedPreview";

interface NavbarModulesOrderCardProps {
  config: NavbarConfig;
  onChange: (patch: Partial<NavbarConfig>) => void;
  onOpenAddModule: () => void;
  isLightMode?: boolean;
}

// Built-in core system modules info for ones not in catalog
const CORE_MODULE_META: Record<string, { title: string; desc: string }> = {
  startSearch: {
    title: "Start & Search",
    desc: "Tombol Windows dan pencarian cepat",
  },
  pinnedApps: {
    title: "Pinned Apps",
    desc: "Aplikasi favorit yang selalu disematkan di bar",
  },
  runningApps: {
    title: "Running Apps",
    desc: "Aplikasi yang sedang aktif berjalan",
  },
  systemIcons: {
    title: "System Icons",
    desc: "Pusat kontrol Wi-Fi, audio output & baterai",
  },
  notifications: {
    title: "Notifications",
    desc: "Lonceng notifikasi dan badge pesan baru",
  },
  clockDate: {
    title: "Clock & Date",
    desc: "Jam presisi, tanggal hari dan kalender",
  },
};

export const NavbarModulesOrderCard: React.FC<NavbarModulesOrderCardProps> = ({
  config,
  onChange,
  onOpenAddModule,
  isLightMode = false,
}) => {
  const cardBg = isLightMode
    ? "bg-white/70 border-black/[0.08]"
    : "bg-white/[0.03] border-white/[0.07]";
  const textTitle = isLightMode ? "text-neutral-900" : "text-white";
  const textSub = isLightMode ? "text-neutral-500" : "text-zinc-400";

  const handleToggleModule = (id: string) => {
    const nextModules = config.modules.map((m) =>
      m.id === id ? { ...m, enabled: !m.enabled } : m
    );
    onChange({ modules: nextModules });
  };

  const handleRemoveModule = (id: string) => {
    const nextModules = config.modules.filter((m) => m.id !== id);
    onChange({ modules: nextModules });
  };

  const handleMoveModule = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= config.modules.length) return;
    const items = [...config.modules];
    const [moved] = items.splice(index, 1);
    items.splice(targetIdx, 0, moved);
    onChange({ modules: items });
  };

  return (
    <div className={`flex flex-col gap-4 p-4 rounded-[16px] border ${cardBg}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
            <Box size={18} />
          </div>
          <div className="flex flex-col">
            <span className={`text-[13px] font-semibold ${textTitle}`}>
              Modul & Susunan Urutan
            </span>
            <span className={`text-[11px] ${textSub}`}>
              Kelola widget aktif dan atur posisinya pada navbar
            </span>
          </div>
        </div>

        {/* Top button to open modal */}
        <button
          type="button"
          onClick={onOpenAddModule}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] bg-[#3882F6] text-white text-[11.5px] font-semibold shadow-sm hover:bg-[#2563eb] transition-colors cursor-pointer"
        >
          <Plus size={14} strokeWidth={2.4} />
          <span>Tambah modul</span>
        </button>
      </div>

      {/* Module Rows List */}
      <div className="flex flex-col gap-2">
        {config.modules.map((m, idx) => {
          const catalogItem = getCatalogModule(m.id);
          const title =
            catalogItem?.name || CORE_MODULE_META[m.id]?.title || m.id;
          const desc =
            catalogItem?.description ||
            CORE_MODULE_META[m.id]?.desc ||
            "Modul kustom navbar";

          const isCore = [
            "startSearch",
            "pinnedApps",
            "runningApps",
            "systemIcons",
            "notifications",
            "clockDate",
          ].includes(m.id);

          return (
            <div
              key={m.id}
              className={`flex items-center justify-between gap-3 min-h-[56px] px-3.5 py-2 rounded-[14px] border transition-colors select-none ${
                isLightMode
                  ? "bg-[#fafafa] border-black/[0.07] hover:bg-black/[0.02]"
                  : "bg-[#0a0d13] border-[#171b26] hover:bg-[#0f131a]"
              }`}
            >
              {/* Left Section: Drag handle + Preview baru + Title & Desc */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="text-zinc-500 cursor-grab shrink-0">
                  <GripVertical size={16} />
                </div>

                {/* Unified compact preview (40x40 icon tile) */}
                <div className="shrink-0 flex items-center justify-center">
                  <NavbarModuleUnifiedPreview
                    moduleId={m.id}
                    variant="compact"
                  />
                </div>

                {/* Name & description */}
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[13px] font-semibold truncate ${
                        isLightMode ? "text-neutral-900" : "text-[#f2f3f7]"
                      }`}
                    >
                      {title}
                    </span>
                    <span className="font-semibold text-[11px] text-[#8db8ff] px-2 py-0.5 rounded-[7px] bg-[#111829] border border-[#1c2438] shrink-0">
                      Group {m.group}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#8a8fa0] truncate mt-0.5">
                    {desc}
                  </span>
                </div>
              </div>

              {/* Right Section: Move arrows + Remove button X + Toggle switch */}
              <div className="flex items-center gap-2.5 shrink-0">
                {/* Reorder Buttons */}
                <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
                  <Tooltip side="top" delay={200} content="Geser ke atas">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveModule(idx, -1)}
                      className="w-6 h-6 rounded flex items-center justify-center text-[10px] disabled:opacity-20 hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
                    >
                      <ArrowUp size={13} />
                    </button>
                  </Tooltip>
                  <Tooltip side="top" delay={200} content="Geser ke bawah">
                    <button
                      type="button"
                      disabled={idx === config.modules.length - 1}
                      onClick={() => handleMoveModule(idx, 1)}
                      className="w-6 h-6 rounded flex items-center justify-center text-[10px] disabled:opacity-20 hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
                    >
                      <ArrowDown size={13} />
                    </button>
                  </Tooltip>
                </div>

                {/* Remove button X */}
                {!isCore && (
                  <Tooltip side="top" delay={200} content="Hapus modul dari bar">
                    <button
                      type="button"
                      onClick={() => handleRemoveModule(m.id)}
                      className="w-7 h-7 rounded-[8px] flex items-center justify-center text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  </Tooltip>
                )}

                {/* Toggle switch di paling kanan */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={m.enabled}
                  onClick={() => handleToggleModule(m.id)}
                  className={`relative w-[42px] h-[24px] rounded-[12px] transition-colors cursor-pointer shrink-0 border-0 p-0 ${
                    m.enabled ? "bg-[#3882F6]" : "bg-[#232733]"
                  }`}
                >
                  <span
                    className={`absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white shadow-sm transition-transform duration-150 ${
                      m.enabled ? "left-[20px]" : "left-[2px]"
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}

        {/* Dashed "+ Add module" button from Artboard 86 */}
        <button
          type="button"
          onClick={onOpenAddModule}
          className="mt-1 h-11 rounded-[12px] border border-dashed border-[#262c3b] hover:border-blue-500/50 bg-transparent text-[#9aa0b0] hover:text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Plus size={15} strokeWidth={2.2} />
          <span>Tambah modul</span>
        </button>
      </div>
    </div>
  );
};
