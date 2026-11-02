import React, { useState } from "react";
import { NavbarConfig } from "../../../types/navbar";
import { GripVertical, Plus, X, Box } from "lucide-react";
import { Language } from "../../../services/i18n";
import {
  getCatalogModule,
  NavbarModuleUnifiedPreview,
} from "../../../modules/components/NavbarModuleUnifiedPreview";

interface NavbarModulesOrderCardProps {
  config: NavbarConfig;
  onChange: (patch: Partial<NavbarConfig>) => void;
  onOpenAddModule: () => void;
  isLightMode?: boolean;
  optLanguage?: Language;
}

const CORE_MODULE_META: Record<
  string,
  {
    titleId: string;
    titleEn: string;
    descId: string;
    descEn: string;
    svg: React.ReactNode;
  }
> = {
  startSearch: {
    titleId: "Start & Pencarian",
    titleEn: "Start & Search",
    descId: "Tombol Windows dan pencarian",
    descEn: "Windows button and search",
    svg: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  pinnedApps: {
    titleId: "Aplikasi Disematkan",
    titleEn: "Pinned Apps",
    descId: "Aplikasi favorit di taskbar",
    descEn: "Apps you keep on the bar",
    svg: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  runningApps: {
    titleId: "Aplikasi Aktif",
    titleEn: "Running Apps",
    descId: "Jendela terbuka dengan live preview",
    descEn: "Open windows with live previews",
    svg: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    ),
  },
  systemIcons: {
    titleId: "Ikon Sistem",
    titleEn: "System Icons",
    descId: "Wi-Fi, volume & baterai",
    descEn: "Wi-Fi, volume & battery",
    svg: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" />
      </svg>
    ),
  },
  notifications: {
    titleId: "Notifikasi",
    titleEn: "Notifications",
    descId: "Badge dan pusat notifikasi",
    descEn: "Badge and notification center",
    svg: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0" />
      </svg>
    ),
  },
  clockDate: {
    titleId: "Jam & Tanggal",
    titleEn: "Clock & Date",
    descId: "Waktu, tanggal dan kalender",
    descEn: "Time, date and calendar",
    svg: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
};

export const NavbarModulesOrderCard: React.FC<NavbarModulesOrderCardProps> = ({
  config,
  onChange,
  onOpenAddModule,
  isLightMode = false,
  optLanguage = "id",
}) => {
  const isId = optLanguage === "id";
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const cardBg = isLightMode
    ? "bg-white/70 border-black/[0.08]"
    : "bg-[#0d1017] border-[#1a1e29]";
  const textTitle = isLightMode ? "text-neutral-900" : "text-[#f2f3f7]";
  const textSub = isLightMode ? "text-neutral-500" : "text-[#8a8fa0]";

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

  const handleSetViewMode = (id: string, view: "compact" | "full") => {
    const nextModules = config.modules.map((m) =>
      m.id === id ? { ...m, view } : m
    );
    onChange({ modules: nextModules });
  };

  const handleCycleGroup = (id: string) => {
    const nextModules = config.modules.map((m) =>
      m.id === id
        ? {
            ...m,
            group: ((m.group % 3) + 1) as 1 | 2 | 3,
          }
        : m
    );
    onChange({ modules: nextModules });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndex;
    setDragIndex(null);
    setDragOverIndex(null);
    if (fromIndex === null || fromIndex === targetIndex) return;

    const items = [...config.modules];
    const [moved] = items.splice(fromIndex, 1);
    items.splice(targetIndex, 0, moved);
    onChange({ modules: items });
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className={`flex flex-col gap-3.5 p-5 rounded-[22px] border ${cardBg}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-[#131a2b] text-[#2f8bff] flex items-center justify-center shrink-0">
            <Box size={18} />
          </div>
          <div className="flex flex-col">
            <span className={`text-[15px] font-semibold ${textTitle}`}>
              {isId ? "Susunan Modul" : "Modules & Order"}
            </span>
            <span className={`text-[12px] ${textSub}`}>
              {isId
                ? "Tarik & geser buat atur urutan sesuka lo. Lebar bar otomatis ngikut."
                : "Drag & drop to reorder modules. Dock width adjusts automatically."}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenAddModule}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-[#2f8bff] text-white text-[12px] font-semibold shadow-sm hover:bg-[#1d7ae8] transition-colors cursor-pointer"
        >
          <Plus size={14} strokeWidth={2.4} />
          <span>{isId ? "Tambah modul" : "Add module"}</span>
        </button>
      </div>

      {/* Module Rows List */}
      <div className="flex flex-col gap-2">
        {config.modules.map((m, idx) => {
          const coreMeta = CORE_MODULE_META[m.id];
          const isCore = Boolean(coreMeta);
          const catalogItem = !isCore ? getCatalogModule(m.id) : undefined;

          const title = coreMeta
            ? isId
              ? coreMeta.titleId
              : coreMeta.titleEn
            : catalogItem?.name || m.id;
          const desc = coreMeta
            ? isId
              ? coreMeta.descId
              : coreMeta.descEn
            : catalogItem?.description || (isId ? "Modul tambahan taskbar" : "Additional taskbar module");

          const isDragging = dragIndex === idx;
          const isDragOver = dragOverIndex === idx && dragIndex !== idx;

          return (
            <div
              key={m.id}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 rounded-[14px] border transition-all select-none ${
                isCore ? "min-h-[56px] px-3.5 py-2" : "p-2.5"
              } ${
                isDragging ? "opacity-45 scale-[0.99]" : "opacity-100"
              } ${
                isDragOver
                  ? "border-[#2f8bff] ring-1 ring-[#2f8bff]/40"
                  : isLightMode
                  ? "bg-[#fafafa] border-black/[0.07] hover:bg-black/[0.02]"
                  : "bg-[#0a0d13] border-[#171b26] hover:bg-[#0e121a]"
              }`}
            >
              {/* 1. Drag Handle */}
              <span
                className="text-[#4b5263] hover:text-zinc-300 flex cursor-grab active:cursor-grabbing shrink-0"
                title={isId ? "Tarik untuk mengubah urutan" : "Drag to reorder"}
              >
                <GripVertical size={16} />
              </span>

              {/* 2. Preview: 34x34 Blue Tile for Core Modules OR Interactive Dual Preview for Catalog Modules */}
              {isCore ? (
                <span className="w-[34px] h-[34px] rounded-[10px] bg-[#131a2b] text-[#2f8bff] inline-flex items-center justify-center shrink-0">
                  {coreMeta.svg}
                </span>
              ) : (
                <div className="w-[224px] h-[56px] shrink-0 rounded-[10px] bg-black px-1.5 flex items-center justify-center gap-1.5 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleSetViewMode(m.id, "compact")}
                    title={isId ? "Gunakan tampilan Hanya Ikon (Ringkas)" : "Use Icon Only (Compact) view"}
                    className={`p-0.5 rounded-[10px] transition-all cursor-pointer shrink-0 flex items-center justify-center ${
                      (m.view || "compact") === "compact"
                        ? "ring-1.5 ring-[#2f8bff] bg-[#2f8bff]/15"
                        : "opacity-60 hover:opacity-100"
                    }`}
                  >
                    <NavbarModuleUnifiedPreview
                      moduleId={m.id}
                      variant="compact"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetViewMode(m.id, "full")}
                    title={isId ? "Gunakan tampilan Panjang (Lengkap)" : "Use Full (Expanded) view"}
                    className={`p-0.5 rounded-[10px] transition-all cursor-pointer min-w-0 overflow-hidden flex items-center justify-center ${
                      m.view === "full"
                        ? "ring-1.5 ring-[#2f8bff] bg-[#2f8bff]/15"
                        : "opacity-60 hover:opacity-100"
                    }`}
                  >
                    <NavbarModuleUnifiedPreview
                      moduleId={m.id}
                      variant="pill"
                    />
                  </button>
                </div>
              )}

              {/* 3. Name & Description */}
              <div className="flex-1 min-w-0">
                <div
                  className={`text-[13.5px] font-semibold leading-snug ${
                    isLightMode ? "text-neutral-900" : "text-[#f2f3f7]"
                  }`}
                >
                  {title}
                </div>
                <div className="text-[11.5px] text-[#8a8fa0] leading-snug mt-0.5 line-clamp-2">
                  {desc}
                </div>
              </div>

              {/* 4. Right Controls */}
              <div className="flex items-center gap-2 shrink-0">
                {isCore ? (
                  <button
                    type="button"
                    onClick={() => handleCycleGroup(m.id)}
                    className="font-semibold text-[11px] text-[#8db8ff] px-2.5 py-1.5 rounded-[9px] bg-[#111829] border border-[#1c2438] hover:border-[#2f8bff]/50 transition-colors cursor-pointer"
                    title={isId ? "Klik untuk memindahkan grup (Group 1 / 2 / 3)" : "Click to switch group (Group 1 / 2 / 3)"}
                  >
                    Group {m.group}
                  </button>
                ) : (
                  <>
                    <div className="inline-flex items-center rounded-[8px] bg-[#111520] p-[2px] border border-[#1e2436]">
                      <button
                        type="button"
                        onClick={() => handleSetViewMode(m.id, "compact")}
                        className={`h-[26px] px-2 rounded-[6px] text-[11px] font-semibold transition-all cursor-pointer ${
                          (m.view || "compact") === "compact"
                            ? "bg-[#2f8bff] text-white"
                            : "text-[#9aa0b0] hover:text-white"
                        }`}
                        title={isId ? "Tampilkan hanya ikon di taskbar" : "Show icon only in taskbar"}
                      >
                        {isId ? "Ikon" : "Icon"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetViewMode(m.id, "full")}
                        className={`h-[26px] px-2 rounded-[6px] text-[11px] font-semibold transition-all cursor-pointer ${
                          m.view === "full"
                            ? "bg-[#2f8bff] text-white"
                            : "text-[#9aa0b0] hover:text-white"
                        }`}
                        title={isId ? "Tampilkan versi panjang (info lengkap) di taskbar" : "Show full info in taskbar"}
                      >
                        {isId ? "Panjang" : "Full"}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveModule(m.id)}
                      aria-label={`${isId ? "Hapus" : "Remove"} ${title}`}
                      className="w-[32px] h-[32px] rounded-[8px] bg-[#141926] text-[#9aa0b0] hover:text-rose-400 hover:bg-rose-500/15 flex items-center justify-center transition-colors cursor-pointer"
                      title={isId ? "Hapus modul dari taskbar" : "Remove module from taskbar"}
                    >
                      <X size={14} />
                    </button>
                  </>
                )}

                {/* Toggle Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={m.enabled}
                  onClick={() => handleToggleModule(m.id)}
                  style={{
                    backgroundColor: m.enabled ? config.accent || "#2f8bff" : undefined,
                  }}
                  className={`relative w-[42px] h-[24px] rounded-[12px] transition-colors cursor-pointer shrink-0 border-0 p-0 ${
                    m.enabled ? "" : "bg-[#2a2f3d]"
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

        {/* Dashed Add Module Button at Bottom (Artboard 83 & 86) */}
        <button
          type="button"
          onClick={onOpenAddModule}
          className="mt-1 h-[44px] rounded-[12px] border border-dashed border-[#262c3b] hover:border-[#2f8bff]/60 bg-transparent hover:bg-[#131a2b]/40 text-[#9aa0b0] hover:text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <Plus size={15} strokeWidth={2.2} />
          <span>{isId ? "+ Tambah modul" : "+ Add module"}</span>
        </button>
      </div>
    </div>
  );
};
