import React, { useState, useRef } from "react";
import { Reorder, motion, useDragControls } from "framer-motion";
import {
  Music2,
  Sliders,
  ListTodo,
  FileText,
  FolderDown,
  Timer,
  Droplet,
  Moon,
  Activity,
  ClipboardList,
  Volume2,
  Bell,
  Settings,
  GripVertical,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Compass,
  MoreHorizontal,
} from "lucide-react";
import {
  ManageableTabId,
  NotchTabsPreferences,
  TabItemConfig,
  DEFAULT_TABS_PREFERENCES,
  DEFAULT_TAB_ITEMS,
  getOrderedEnabledTabs,
} from "../../services/tabConfigService";
import { IosSwitch } from "../ios/IosSwitch";
import { IosSegmentedControl } from "../ios/IosSegmentedControl";
import { Language } from "../../services/i18n";

interface TabsManagerViewProps {
  prefs: NotchTabsPreferences;
  onChangePrefs: (next: NotchTabsPreferences) => void;
  optLanguage: Language;
  isLightMode: boolean;
}

interface TabVisualMeta {
  titleId: string;
  titleEn: string;
  descId: string;
  descEn: string;
  icon: React.ReactNode;
  smallIcon: React.ReactNode;
  bgClass: string;
  colorClass: string;
  badgeId?: string;
  badgeEn?: string;
}

const TAB_VISUAL_META: Record<ManageableTabId, TabVisualMeta> = {
  media_expanded: {
    titleId: "Pemutar Musik (Now Playing)",
    titleEn: "Now Playing (Media)",
    descId: "Kontrol lagu aktif, lirik real-time, cover album, dan antrean riwayat lagu",
    descEn: "Active media controls, real-time lyrics, album artwork, and track history",
    icon: <Music2 size={17} strokeWidth={2.2} />,
    smallIcon: <Music2 size={13} strokeWidth={2.2} />,
    bgClass: "bg-[#ff375f]",
    colorClass: "text-white",
  },
  quick_control: {
    titleId: "Pusat Kontrol (Control Center)",
    titleEn: "Control Center",
    descId: "Wi-Fi, Bluetooth, Hotspot, kecerahan layar, volume, mode daya & fokus",
    descEn: "Wi-Fi, Bluetooth, Hotspot, brightness, volume, power plan & focus modes",
    icon: <Sliders size={17} strokeWidth={2.2} />,
    smallIcon: <Sliders size={13} strokeWidth={2.2} />,
    bgClass: "bg-[#0a84ff]",
    colorClass: "text-white",
    badgeId: "Inti",
    badgeEn: "Core",
  },
  todo: {
    titleId: "Daftar Tugas (To-Do List)",
    titleEn: "To-Do List",
    descId: "Manajemen tugas harian dengan parser waktu pintar & pengingat tenggat",
    descEn: "Daily tasks with smart natural-language deadlines and reminders",
    icon: <ListTodo size={17} strokeWidth={2.2} />,
    smallIcon: <ListTodo size={13} strokeWidth={2.2} />,
    bgClass: "bg-[#ff9f0a]",
    colorClass: "text-white",
  },
  mini_note: {
    titleId: "Catatan Cepat (Mini Note)",
    titleEn: "Mini Note",
    descId: "Catatan tempel instan dengan warna kategori dan sematan",
    descEn: "Instant scratchpad notes with color tags and pinning",
    icon: <FileText size={17} strokeWidth={2.2} />,
    smallIcon: <FileText size={13} strokeWidth={2.2} />,
    bgClass: "bg-[#eab308]",
    colorClass: "text-white",
  },
  drop_shelf: {
    titleId: "Rak Berkas (Drop Shelf)",
    titleEn: "Drop Shelf",
    descId: "Tempat transit drag & drop file sementara lintas aplikasi",
    descEn: "Temporary drag-and-drop file holding shelf across apps",
    icon: <FolderDown size={17} strokeWidth={2.2} />,
    smallIcon: <FolderDown size={13} strokeWidth={2.2} />,
    bgClass: "bg-[#32ade6]",
    colorClass: "text-white",
  },
  pomodoro: {
    titleId: "Fokus Pomodoro",
    titleEn: "Pomodoro Timer",
    descId: "Timer fokus kerja & istirahat terintegrasi dengan daftar tugas",
    descEn: "Focus & break interval timer integrated with your tasks",
    icon: <Timer size={17} strokeWidth={2.2} />,
    smallIcon: <Timer size={13} strokeWidth={2.2} />,
    bgClass: "bg-[#ff453a]",
    colorClass: "text-white",
  },
  water_reminder: {
    titleId: "Pengingat Air (Water Tracker)",
    titleEn: "Water Reminder",
    descId: "Target hidrasi harian, catatan minum cepat, dan streak harian",
    descEn: "Daily hydration goal, quick drink logging, and streak tracking",
    icon: <Droplet size={17} strokeWidth={2.2} />,
    smallIcon: <Droplet size={13} strokeWidth={2.2} />,
    bgClass: "bg-[#0ea5e9]",
    colorClass: "text-white",
  },
  prayer_reminder: {
    titleId: "Pengingat Sholat (Jadwal Ibadah)",
    titleEn: "Prayer Schedule & Reminder",
    descId: "Jadwal waktu sholat 5 waktu otomatis (Kemenag RI) dengan notifikasi pengingat adzan",
    descEn: "5 daily prayer times (Kemenag RI) with automatic pre-adzan & prayer time notifications",
    icon: <Moon size={17} strokeWidth={2.2} />,
    smallIcon: <Moon size={13} strokeWidth={2.2} />,
    bgClass: "bg-[#10b981]",
    colorClass: "text-white",
  },
  sys_monitor: {
    titleId: "Monitor Sistem",
    titleEn: "System Monitor",
    descId: "Pantau penggunaan CPU, RAM, kecepatan jaringan, dan latensi ping",
    descEn: "Real-time CPU, RAM, network throughput, and ping latency monitor",
    icon: <Activity size={17} strokeWidth={2.2} />,
    smallIcon: <Activity size={13} strokeWidth={2.2} />,
    bgClass: "bg-[#30d158]",
    colorClass: "text-white",
  },
  clipboard: {
    titleId: "Riwayat Clipboard",
    titleEn: "Clipboard History",
    descId: "Tampilkan langsung riwayat teks & gambar yang disalin di bar navigasi utama",
    descEn: "Pin clipboard history directly to the main notch navigation bar",
    icon: <ClipboardList size={17} strokeWidth={2.2} />,
    smallIcon: <ClipboardList size={13} strokeWidth={2.2} />,
    bgClass: "bg-[#af52de]",
    colorClass: "text-white",
  },
  volume_mixer: {
    titleId: "Mixer Volume Aplikasi",
    titleEn: "App Volume Mixer",
    descId: "Atur level volume per aplikasi dan ganti perangkat output audio langsung dari tab",
    descEn: "Control per-app audio levels and switch output devices directly from a tab",
    icon: <Volume2 size={17} strokeWidth={2.2} />,
    smallIcon: <Volume2 size={13} strokeWidth={2.2} />,
    bgClass: "bg-[#5e5ce6]",
    colorClass: "text-white",
  },
  notif_center: {
    titleId: "Pusat Notifikasi",
    titleEn: "Notification Center",
    descId: "Sematkan tab riwayat notifikasi masuk di bar navigasi bawah",
    descEn: "Pin incoming notification history directly in the bottom navigation dock",
    icon: <Bell size={17} strokeWidth={2.2} />,
    smallIcon: <Bell size={13} strokeWidth={2.2} />,
    bgClass: "bg-[#0284c7]",
    colorClass: "text-white",
  },
};

interface SortableTabRowProps {
  item: TabItemConfig;
  idx: number;
  totalItems: number;
  meta: TabVisualMeta;
  isLastEnabled: boolean;
  isId: boolean;
  isLightMode: boolean;
  onMoveStep: (index: number, delta: -1 | 1) => void;
  onToggleTab: (id: ManageableTabId) => void;
}

const SortableTabRow: React.FC<SortableTabRowProps> = ({
  item,
  idx,
  totalItems,
  meta,
  isLastEnabled,
  isId,
  isLightMode,
  onMoveStep,
  onToggleTab,
}) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      className={`group flex items-center justify-between gap-3 px-3 py-2.5 rounded-[14px] select-none transition-colors ${
        item.enabled
          ? isLightMode
            ? "bg-white hover:bg-neutral-50/90 border border-black/[0.04]"
            : "bg-white/[0.025] hover:bg-white/[0.05] border border-white/[0.04]"
          : isLightMode
          ? "bg-neutral-100/60 opacity-65 border border-transparent"
          : "bg-white/[0.01] opacity-55 border border-transparent"
      }`}
    >
      {/* Left: Drag Handle + App Icon + Title/Desc */}
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          dragControls.start(e);
        }}
        className="flex items-center gap-3 min-w-0 flex-1 cursor-grab active:cursor-grabbing touch-none"
      >
        <div
          className={`p-1 -ml-1 rounded-md transition-colors ${
            isLightMode
              ? "text-neutral-400 group-hover:text-neutral-700 group-hover:bg-black/5"
              : "text-zinc-500 group-hover:text-zinc-200 group-hover:bg-white/5"
          }`}
          title={isId ? "Tarik untuk geser urutan" : "Drag to reorder"}
        >
          <GripVertical size={16} />
        </div>

        <div
          className={`w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0 shadow-sm ${meta.bgClass} ${meta.colorClass}`}
        >
          {meta.icon}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-[13px] font-semibold truncate ${
                isLightMode ? "text-neutral-900" : "text-zinc-100"
              }`}
            >
              {isId ? meta.titleId : meta.titleEn}
            </span>
            {(meta.badgeId || meta.badgeEn) && (
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full leading-none shrink-0 ${
                  isLightMode
                    ? "bg-blue-500/10 text-blue-600"
                    : "bg-blue-500/20 text-blue-300"
                }`}
              >
                {isId ? meta.badgeId : meta.badgeEn}
              </span>
            )}
            {!item.enabled && (
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full leading-none shrink-0 ${
                  isLightMode
                    ? "bg-neutral-200 text-neutral-600"
                    : "bg-white/10 text-zinc-400"
                }`}
              >
                {isId ? "Nonaktif" : "Hidden"}
              </span>
            )}
          </div>
          <span
            className={`text-[11px] truncate mt-0.5 ${
              isLightMode ? "text-neutral-500" : "text-zinc-400"
            }`}
          >
            {isId ? meta.descId : meta.descEn}
          </span>
        </div>
      </div>

      {/* Right: Up/Down Buttons + Switch */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => onMoveStep(idx, -1)}
            title={isId ? "Geser ke atas" : "Move up"}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer disabled:opacity-25 disabled:pointer-events-none ${
              isLightMode
                ? "hover:bg-black/5 text-neutral-600"
                : "hover:bg-white/10 text-zinc-300"
            }`}
          >
            <ArrowUp size={13.5} />
          </button>
          <button
            type="button"
            disabled={idx === totalItems - 1}
            onClick={() => onMoveStep(idx, 1)}
            title={isId ? "Geser ke bawah" : "Move down"}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer disabled:opacity-25 disabled:pointer-events-none ${
              isLightMode
                ? "hover:bg-black/5 text-neutral-600"
                : "hover:bg-white/10 text-zinc-300"
            }`}
          >
            <ArrowDown size={13.5} />
          </button>
        </div>

        <IosSwitch
          checked={item.enabled}
          onChange={() => onToggleTab(item.id)}
          disabled={isLastEnabled}
          activeColor="blue"
        />
      </div>
    </Reorder.Item>
  );
};

export const TabsManagerView: React.FC<TabsManagerViewProps> = ({
  prefs,
  onChangePrefs,
  optLanguage,
  isLightMode,
}) => {
  const isId = optLanguage === "id";
  const enabledCount = prefs.items.filter((i) => i.enabled).length;
  const activeDockTabs = getOrderedEnabledTabs(prefs);
  const [previewIdx, setPreviewIdx] = useState(0);
  const lastPreviewSwipeRef = useRef(0);
  const previewDeltaRef = useRef(0);

  const safePreviewIdx = Math.min(previewIdx, Math.max(0, activeDockTabs.length - 1));

  const handlePreviewWheel = (e: React.WheelEvent) => {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
    if (Math.abs(delta) < 3) return;
    e.stopPropagation();

    const now = Date.now();
    if (now - lastPreviewSwipeRef.current < 180) {
      previewDeltaRef.current = 0;
      return;
    }

    previewDeltaRef.current += delta;
    if (Math.abs(previewDeltaRef.current) >= 18) {
      const dir = previewDeltaRef.current > 0 ? 1 : -1;
      previewDeltaRef.current = 0;
      lastPreviewSwipeRef.current = now;
      setPreviewIdx((prev) => {
        const cur = Math.min(prev, Math.max(0, activeDockTabs.length - 1));
        return Math.max(0, Math.min(activeDockTabs.length - 1, cur + dir));
      });
    }
  };

  const handleReorder = (nextItems: TabItemConfig[]) => {
    onChangePrefs({
      ...prefs,
      items: nextItems,
    });
  };

  const handleToggleTab = (id: ManageableTabId) => {
    const target = prefs.items.find((i) => i.id === id);
    if (!target) return;
    // Prevent disabling the very last active tab
    if (target.enabled && enabledCount <= 1) return;

    const nextItems = prefs.items.map((item) =>
      item.id === id ? { ...item, enabled: !item.enabled } : item
    );
    onChangePrefs({
      ...prefs,
      items: nextItems,
    });
  };

  const handleMoveStep = (index: number, delta: -1 | 1) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= prefs.items.length) return;
    const nextItems = [...prefs.items];
    const [moved] = nextItems.splice(index, 1);
    nextItems.splice(targetIndex, 0, moved);
    onChangePrefs({
      ...prefs,
      items: nextItems,
    });
  };

  const handleResetDefault = () => {
    onChangePrefs({
      ...DEFAULT_TABS_PREFERENCES,
      items: DEFAULT_TAB_ITEMS.map((item) => ({ ...item })),
    });
  };

  const cardClass = isLightMode
    ? "bg-white/85 border border-black/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
    : "bg-[#16161b]/90 border border-white/[0.07] shadow-[0_8px_28px_rgba(0,0,0,0.35)]";

  return (
    <div className="flex flex-col gap-5 w-full pb-6">
      {/* 1. Sticky Live Interactive Dock Preview Card */}
      <div
        className={`sticky -top-6 z-30 -mx-2 px-2 pt-2.5 pb-2.5 transition-colors ${
          isLightMode
            ? "bg-[#f5f5f7]/95 backdrop-blur-md"
            : "bg-[#0c0c10]/95 backdrop-blur-md"
        }`}
      >
        <div
          className={`w-full rounded-[20px] p-4 flex flex-col gap-3 overflow-hidden ${
            isLightMode
              ? "bg-white border border-black/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
              : "bg-[#16161b] border border-white/[0.08] shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
          }`}
        >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-[12px] font-semibold tracking-wide uppercase truncate ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
              {isId ? "Pratinjau Navigasi Notch (Live)" : "Live Notch Dock Preview"}
            </span>
            <span className={`text-[10.5px] hidden sm:inline ${isLightMode ? "text-neutral-400" : "text-zinc-500"}`}>
              {isId ? "• Klik atau swipe untuk uji" : "• Click or swipe to test"}
            </span>
          </div>
          <span className={`text-[11.5px] font-medium px-2.5 py-0.5 rounded-full shrink-0 ${
            isLightMode ? "bg-blue-500/10 text-blue-600" : "bg-blue-500/15 text-blue-400"
          }`}>
            {isId ? `${activeDockTabs.length} Tab Aktif` : `${activeDockTabs.length} Active Tabs`}
          </span>
        </div>

        {/* Simulated Notch Bottom Dock */}
        <div
          onWheel={handlePreviewWheel}
          className={`w-full rounded-[16px] py-4 px-3 flex flex-col items-center justify-center gap-2.5 border overflow-hidden ${
            isLightMode
              ? "bg-neutral-100 border-black/[0.06]"
              : "bg-[#0d0d11] border-white/[0.05]"
          }`}
        >
          <div
            className={`max-w-full overflow-x-auto no-scrollbar flex items-center gap-1 px-2 py-1.5 rounded-full border transition-all ${
              isLightMode
                ? "bg-white/90 border-black/10 shadow-sm"
                : "bg-white/[0.08] border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
            }`}
          >
            {activeDockTabs.map((tabKey, idx) => {
              const isSettingsTab = tabKey === "settings";
              const meta = !isSettingsTab ? TAB_VISUAL_META[tabKey as ManageableTabId] : null;
              const isSelected = idx === safePreviewIdx;
              const rawTitle = isSettingsTab
                ? isId
                  ? "Setelan"
                  : "Settings"
                : (isId ? meta?.titleId : meta?.titleEn)?.replace(/\s*\(.*?\)/, "") || tabKey;

              return (
                <motion.button
                  type="button"
                  key={tabKey}
                  layout
                  onClick={() => setPreviewIdx(idx)}
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  title={rawTitle}
                  className={`flex items-center justify-center gap-1.5 rounded-full text-[11px] font-medium transition-colors shrink-0 cursor-pointer ${
                    isSelected
                      ? "px-2.5 h-7 bg-[#0a84ff] text-white shadow-[0_2px_10px_rgba(10,132,255,0.45)]"
                      : isLightMode
                      ? "w-7 h-7 text-neutral-600 hover:text-neutral-900 hover:bg-black/[0.06]"
                      : "w-7 h-7 text-zinc-300 hover:text-white hover:bg-white/[0.12]"
                  }`}
                >
                  {isSettingsTab ? <Settings size={13} strokeWidth={2.2} /> : meta?.smallIcon}
                  {isSelected && (
                    <span className="max-w-[115px] truncate leading-none">
                      {rawTitle}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>

          {prefs.showPageDots && (
            <div className="flex items-center gap-1.5">
              {activeDockTabs.map((tabKey, idx) => (
                <button
                  type="button"
                  key={`dot-${tabKey}`}
                  onClick={() => setPreviewIdx(idx)}
                  className={`h-[5px] rounded-full transition-all cursor-pointer ${
                    idx === safePreviewIdx
                      ? "w-4 bg-[#0a84ff]"
                      : isLightMode
                      ? "w-[5px] bg-black/25 hover:bg-black/45"
                      : "w-[5px] bg-white/35 hover:bg-white/60"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* 2. Drag & Reorder Tabs List */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex flex-col">
            <h3 className={`text-[13px] font-semibold ${isLightMode ? "text-neutral-800" : "text-zinc-100"}`}>
              {isId ? "Urutan & Visibilitas Tab" : "Tab Order & Visibility"}
            </h3>
            <p className={`text-[11.5px] ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
              {isId
                ? "Tarik baris/ikon titik (⠿) atau gunakan panah untuk mengubah urutan tab di notch. Matikan sakelar untuk menyembunyikan tab."
                : "Drag the row/handle (⠿) or use arrows to reorder tabs in the notch. Toggle switches off to hide tabs."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetDefault}
            className={`px-3 py-1.5 rounded-full text-[11.5px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              isLightMode
                ? "bg-black/[0.05] hover:bg-black/[0.09] text-neutral-700"
                : "bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200"
            }`}
          >
            <RotateCcw size={12.5} />
            <span>{isId ? "Reset Urutan" : "Reset Order"}</span>
          </button>
        </div>

        <div className={`w-full rounded-[20px] p-2 overflow-hidden ${cardClass}`}>
          <Reorder.Group
            axis="y"
            values={prefs.items}
            onReorder={handleReorder}
            className="flex flex-col gap-1"
          >
            {prefs.items.map((item, idx) => {
              const meta = TAB_VISUAL_META[item.id];
              const isLastEnabled = item.enabled && enabledCount <= 1;

              return (
                <SortableTabRow
                  key={item.id}
                  item={item}
                  idx={idx}
                  totalItems={prefs.items.length}
                  meta={meta}
                  isLastEnabled={isLastEnabled}
                  isId={isId}
                  isLightMode={isLightMode}
                  onMoveStep={handleMoveStep}
                  onToggleTab={handleToggleTab}
                />
              );
            })}
          </Reorder.Group>
        </div>
      </div>

      {/* 3. Navigation & Dock Preferences Card */}
      <div className={`w-full rounded-[20px] p-3 flex flex-col gap-2 ${cardClass}`}>
        {/* Default Open Tab */}
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center gap-3 min-w-0 pr-3">
            <div className="w-8 h-8 rounded-[10px] bg-[#0a84ff] text-white flex items-center justify-center shrink-0">
              <Compass size={16} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className={`text-[13px] font-semibold ${isLightMode ? "text-neutral-900" : "text-zinc-100"}`}>
                {isId ? "Tab Saat Notch Dibuka" : "Default Tab When Opening Notch"}
              </span>
              <span className={`text-[11px] ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
                {isId
                  ? "Pilih tab yang ditampilkan pertama kali saat notch di-hover atau diklik"
                  : "Choose which tab opens first when hovering or clicking the idle notch"}
              </span>
            </div>
          </div>

          <IosSegmentedControl
            value={prefs.defaultOpenBehavior}
            onChange={(val) =>
              onChangePrefs({
                ...prefs,
                defaultOpenBehavior: val as NotchTabsPreferences["defaultOpenBehavior"],
              })
            }
            options={[
              {
                label: isId ? "Terakhir" : "Last Used",
                value: "remember_last",
              },
              {
                label: isId ? "Tab Pertama" : "First Tab",
                value: "first_tab",
              },
              {
                label: isId ? "Kontrol" : "Control",
                value: "quick_control",
              },
            ]}
          />
        </div>

        <div className={`h-[1px] w-full ${isLightMode ? "bg-black/[0.06]" : "bg-white/[0.06]"}`} />

        {/* Show Bottom Page Dots */}
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center gap-3 min-w-0 pr-3">
            <div className="w-8 h-8 rounded-[10px] bg-[#30d158] text-white flex items-center justify-center shrink-0">
              <MoreHorizontal size={16} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className={`text-[13px] font-semibold ${isLightMode ? "text-neutral-900" : "text-zinc-100"}`}>
                {isId ? "Indikator Titik & Dock Bawah" : "Bottom Page Dots & Hover Dock"}
              </span>
              <span className={`text-[11px] ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
                {isId
                  ? "Tampilkan indikator titik halaman di bagian bawah notch yang berubah menjadi dock ikon saat di-hover"
                  : "Show page indicator dots at the bottom of the notch that expand into an icon dock on hover"}
              </span>
            </div>
          </div>

          <IosSwitch
            checked={prefs.showPageDots}
            onChange={() =>
              onChangePrefs({
                ...prefs,
                showPageDots: !prefs.showPageDots,
              })
            }
            activeColor="green"
          />
        </div>

        <div className={`h-[1px] w-full ${isLightMode ? "bg-black/[0.06]" : "bg-white/[0.06]"}`} />

        {/* Always Show Settings Icon in Bottom Dock */}
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center gap-3 min-w-0 pr-3">
            <div className="w-8 h-8 rounded-[10px] bg-[#636366] text-white flex items-center justify-center shrink-0">
              <Settings size={16} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className={`text-[13px] font-semibold ${isLightMode ? "text-neutral-900" : "text-zinc-100"}`}>
                {isId ? "Sertakan Ikon Setelan di Dock Bawah" : "Include Settings Icon in Bottom Dock"}
              </span>
              <span className={`text-[11px] ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
                {isId
                  ? "Tambahkan pintasan Pengaturan di urutan paling akhir dock bawah (selain tombol ⚙️ di pojok kanan atas)"
                  : "Append the Settings shortcut at the end of the bottom dock (in addition to the top-right ⚙️ button)"}
              </span>
            </div>
          </div>

          <IosSwitch
            checked={prefs.includeSettingsInDock}
            onChange={() =>
              onChangePrefs({
                ...prefs,
                includeSettingsInDock: !prefs.includeSettingsInDock,
              })
            }
            activeColor="blue"
          />
        </div>
      </div>
    </div>
  );
};
