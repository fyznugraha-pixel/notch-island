import React from "react";
import { NavbarConfig } from "../../../types/navbar";
import { GripVertical, Plus, Trash2, Box } from "lucide-react";
import { Tooltip } from "../../ui/Tooltip";

interface NavbarModulesOrderCardProps {
  config: NavbarConfig;
  onChange: (patch: Partial<NavbarConfig>) => void;
  onOpenAddModule: () => void;
  isLightMode?: boolean;
}

const MODULE_META: Record<string, { title: string; desc: string }> = {
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
  pomodoro: {
    title: "Pomodoro Timer",
    desc: "Timer fokus dan istirahat kerja",
  },
  todo: {
    title: "Quick Tasks",
    desc: "Daftar tugas harian ringkas",
  },
  event: {
    title: "Upcoming Event",
    desc: "Pengingat jadwal dan kalender mendatang",
  },
  system: {
    title: "System Metrics",
    desc: "Pengukur beban CPU, RAM dan GPU",
  },
  net: {
    title: "Network Monitor",
    desc: "Kecepatan unduh dan unggah internet",
  },
  weather: {
    title: "Weather Widget",
    desc: "Suhu dan prakiraan cuaca terkini",
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
      {/* Title */}
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

        {/* Add Module Button */}
        <button
          type="button"
          onClick={onOpenAddModule}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] bg-[#0a84ff] text-white text-[11.5px] font-medium shadow-sm hover:bg-[#0071e3] transition-colors cursor-pointer"
        >
          <Plus size={14} strokeWidth={2.2} />
          <span>Tambah Modul</span>
        </button>
      </div>

      {/* Module List */}
      <div className="flex flex-col gap-2">
        {config.modules.map((m, idx) => {
          const meta = MODULE_META[m.id] || {
            title: m.id,
            desc: "Modul kustom navbar",
          };

          return (
            <div
              key={m.id}
              className={`flex items-center justify-between p-2.5 rounded-[12px] border transition-colors ${
                isLightMode
                  ? "bg-black/[0.02] border-black/[0.06] hover:bg-black/[0.04]"
                  : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`flex flex-col gap-0.5 text-zinc-500 select-none ${
                    isLightMode ? "text-neutral-400" : "text-zinc-500"
                  }`}
                >
                  <GripVertical size={14} />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[12.5px] font-semibold ${textTitle} truncate`}>
                      {meta.title}
                    </span>
                    <span className="text-[9.5px] font-medium px-1.5 py-0.2 rounded bg-white/10 text-zinc-400 shrink-0">
                      Group {m.group}
                    </span>
                  </div>
                  <span className={`text-[10.5px] ${textSub} truncate`}>
                    {meta.desc}
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Reorder Buttons */}
                <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
                  <Tooltip side="top" delay={200} content="Geser ke atas">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveModule(idx, -1)}
                      className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold disabled:opacity-20 cursor-pointer ${
                        isLightMode ? "hover:bg-black/10" : "hover:bg-white/10 text-white"
                      }`}
                    >
                      ▲
                    </button>
                  </Tooltip>
                  <Tooltip side="top" delay={200} content="Geser ke bawah">
                    <button
                      type="button"
                      disabled={idx === config.modules.length - 1}
                      onClick={() => handleMoveModule(idx, 1)}
                      className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold disabled:opacity-20 cursor-pointer ${
                        isLightMode ? "hover:bg-black/10" : "hover:bg-white/10 text-white"
                      }`}
                    >
                      ▼
                    </button>
                  </Tooltip>
                </div>

                {/* Enable/Disable Toggle */}
                <button
                  type="button"
                  onClick={() => handleToggleModule(m.id)}
                  className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                    m.enabled ? "bg-[#0a84ff]" : isLightMode ? "bg-black/20" : "bg-white/20"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                      m.enabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>

                {/* Delete button (if not built-in) */}
                {!["startSearch", "pinnedApps", "runningApps", "systemIcons", "notifications", "clockDate"].includes(m.id) && (
                  <button
                    type="button"
                    onClick={() => handleRemoveModule(m.id)}
                    className="p-1 rounded text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
