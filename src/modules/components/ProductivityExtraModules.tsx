import React, { useState, useRef } from "react";
import {
  Camera,
  Zap,
  Clock,
  BookOpen,
  Code2,
  Plus,
  Trash2,
  Check,
  Search,
  Maximize2,
  Crop,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

export { CalculatorNavbarModule } from "./CalculatorNavbarModule";

// 10. Kalender mini
export const MiniCalendarNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const dayNum = now.getDate();
  const monthShort = now
    .toLocaleDateString("id-ID", { month: "short" })
    .toUpperCase();
  const monthFull = now.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
  const dow = (now.getDay() + 6) % 7; // 0 = Senin
  const labels = ["S", "S", "R", "K", "J", "S", "M"];

  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 flex-col justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Kalender Mini (${now.toLocaleDateString("id-ID", {
          dateStyle: "full",
        })})`}
      >
        {isCompact ? (
          <>
            <span className="text-[8.5px] font-bold text-[#ef4444] leading-none">
              {monthShort}
            </span>
            <span className="text-[13px] font-extrabold text-white leading-tight">
              {dayNum}
            </span>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1">
              {labels.map((l, i) => (
                <span
                  key={i}
                  className={`w-[18px] h-[22px] rounded-[5px] text-[10px] font-semibold flex items-center justify-center ${
                    i === dow
                      ? "bg-[#3882F6] text-white font-bold"
                      : "text-zinc-400"
                  }`}
                >
                  {i === dow ? dayNum : l}
                </span>
              ))}
            </div>
            <span className="text-[10px] text-[#60a5fa] font-semibold">
              {monthShort}
            </span>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={monthFull}
        moduleId="kalender_mini"
        currentView={view}
        config={config}
        width={250}
      >
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-500 font-semibold">
            {labels.map((l, idx) => (
              <span key={idx}>{l}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: startOffset }).map((_, idx) => (
              <span key={`empty_${idx}`} className="h-6" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const d = idx + 1;
              const isToday = d === dayNum;
              return (
                <span
                  key={d}
                  className={`h-6 rounded-[6px] text-[11px] flex items-center justify-center ${
                    isToday
                      ? "bg-[#3882F6] text-white font-bold"
                      : "text-zinc-300 hover:bg-white/[0.06]"
                  }`}
                >
                  {d}
                </span>
              );
            })}
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 11. Tangkap layar
export const ScreenshotNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const captureArea = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    invoke("launch_target", { target: "ms-screenclip:" }).catch(() => {});
    setIsOpen(false);
  };

  const captureFull = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    invoke("trigger_fullscreen_screenshot").catch(() => {});
    setStatusMsg("Layar penuh disalin!");
    setTimeout(() => setStatusMsg(null), 1500);
    setIsOpen(false);
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title="Tangkap layar: Area atau Layar Penuh"
      >
        <Camera size={15} className="text-zinc-200 shrink-0" />
        {!isCompact && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={captureArea}
              className="text-[11px] font-medium px-2 py-0.5 rounded-[6px] bg-white/[0.08] hover:bg-[#3882F6] text-zinc-200 hover:text-white transition-colors cursor-pointer"
              title="Potong area layar (Snipping Tool)"
            >
              Area
            </button>
            <button
              type="button"
              onClick={captureFull}
              className="text-[11px] font-medium px-2 py-0.5 rounded-[6px] bg-white/[0.04] hover:bg-[#3882F6] text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Tangkap seluruh layar (Win+PrtSc)"
            >
              {statusMsg ? "Tersimpan!" : "Layar"}
            </button>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Tangkap Layar"
        moduleId="tangkap_layar"
        currentView={view}
        config={config}
        width={230}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => captureArea()}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-[10px] bg-white/[0.05] hover:bg-[#3882F6]/20 border border-white/[0.07] hover:border-[#3882F6]/40 text-zinc-200 cursor-pointer transition-all"
          >
            <Crop size={16} className="text-[#60a5fa]" />
            <span className="text-[11px] font-semibold">Pilih Area</span>
          </button>
          <button
            type="button"
            onClick={() => captureFull()}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-[10px] bg-white/[0.05] hover:bg-[#3882F6]/20 border border-white/[0.07] hover:border-[#3882F6]/40 text-zinc-200 cursor-pointer transition-all"
          >
            <Maximize2 size={16} className="text-emerald-400" />
            <span className="text-[11px] font-semibold">Layar Penuh</span>
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 13. Peluncur cepat
export const QuickLauncherNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  const SHORTCUTS = [
    { label: "File Explorer", target: "explorer.exe" },
    { label: "Pengaturan Windows", target: "ms-settings:" },
    { label: "Task Manager", target: "taskmgr.exe" },
    { label: "Terminal / CMD", target: "cmd.exe" },
    { label: "Kalkulator Sistem", target: "calc.exe" },
  ];

  const handleRunQuery = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const target =
      q.startsWith("http://") || q.startsWith("https://") || q.includes(".exe") || q.startsWith("ms-")
        ? q
        : `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    invoke("launch_target", { target }).catch(() => {});
    setQuery("");
    setIsOpen(false);
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title="Peluncur cepat: Cari aplikasi, perintah, atau web"
      >
        <Zap size={15} className="text-[#facc15] shrink-0" />
        {!isCompact && (
          <>
            <span className="text-[11.5px] text-zinc-300">Cari…</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-[5px] bg-white/[0.07] text-zinc-400 font-mono">
              Ctrl+Space
            </span>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Peluncur Cepat"
        moduleId="peluncur_cepat"
        currentView={view}
        config={config}
        width={275}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2">
          <form onSubmit={handleRunQuery} className="flex items-center gap-1.5">
            <div className="flex-1 flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] bg-white/[0.07] border border-white/[0.12] focus-within:border-[#facc15]">
              <Search size={12} className="text-zinc-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ketik URL, aplikasi, atau cari web..."
                className="bg-transparent border-0 outline-none text-[11.5px] text-white placeholder-zinc-500 w-full"
              />
            </div>
          </form>

          <div className="flex flex-col gap-1">
            {SHORTCUTS.filter(
              (s) =>
                !query.trim() ||
                s.label.toLowerCase().includes(query.toLowerCase())
            ).map((s) => (
              <button
                key={s.target}
                type="button"
                onClick={() => {
                  invoke("launch_target", { target: s.target }).catch(() => {});
                  setIsOpen(false);
                }}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-[7px] bg-white/[0.04] hover:bg-white/[0.09] text-[11.5px] text-zinc-200 transition-colors cursor-pointer"
              >
                <span>{s.label}</span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {s.target}
                </span>
              </button>
            ))}
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 14. Waktu layar
export const ScreenTimeNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const [minutesActive] = useState(() => {
    const k = "gili_screen_start";
    let start = Number(sessionStorage.getItem(k));
    if (!start) {
      start = Date.now() - (4 * 60 + 12) * 60000;
      sessionStorage.setItem(k, String(start));
    }
    return Math.max(1, Math.floor((Date.now() - start) / 60000));
  });

  const hrs = Math.floor(minutesActive / 60);
  const mins = minutesActive % 60;

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Waktu layar hari ini: ${hrs}j ${mins}m`}
      >
        <Clock size={15} className="text-[#a855f7] shrink-0" />
        {!isCompact && (
          <>
            <div className="flex flex-col leading-[1.15]">
              <span className="text-[11.5px] font-bold text-white tabular-nums">
                {hrs}j {mins}m
              </span>
              <span className="text-[10px] text-zinc-400">Hari ini</span>
            </div>
            <div className="w-[30px] h-[6px] rounded-[3px] bg-zinc-800 overflow-hidden flex">
              <i className="w-[50%] bg-[#3882F6]" />
              <i className="w-[30%] bg-[#a855f7]" />
              <i className="w-[20%] bg-[#f59e0b]" />
            </div>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Waktu Layar Hari Ini"
        moduleId="waktu_layar"
        currentView={view}
        config={config}
        width={245}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[20px] font-bold text-white">
              {hrs}j {mins}m
            </span>
            <span className="text-[10.5px] text-emerald-400">
              Normal · Produktif
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden flex">
            <div className="w-[50%] bg-[#3882F6]" />
            <div className="w-[30%] bg-[#a855f7]" />
            <div className="w-[20%] bg-[#f59e0b]" />
          </div>
          <div className="flex flex-col gap-1 text-[11px]">
            <div className="flex justify-between text-zinc-300">
              <span className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-full bg-[#3882F6]" /> Produktivitas & IDE
              </span>
              <span className="text-zinc-400">50%</span>
            </div>
            <div className="flex justify-between text-zinc-300">
              <span className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-full bg-[#a855f7]" /> Peramban Web
              </span>
              <span className="text-zinc-400">30%</span>
            </div>
            <div className="flex justify-between text-zinc-300">
              <span className="flex items-center gap-1.5">
                <i className="w-2 h-2 rounded-full bg-[#f59e0b]" /> Hiburan & Komunikasi
              </span>
              <span className="text-zinc-400">20%</span>
            </div>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 15. Jadwal kelas
interface ClassItem {
  id: string;
  course: string;
  room: string;
  time: string;
}

const CLASSES_KEY = "gili_class_schedule_v1";

export const ClassScheduleNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const [classes, setClasses] = useState<ClassItem[]>(() => {
    try {
      const raw = localStorage.getItem(CLASSES_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p) && p.length > 0) return p;
      }
    } catch {}
    return [
      { id: "c1", course: "Basis Data", room: "R.302", time: "13:00" },
      { id: "c2", course: "Jaringan Komputer", room: "Lab 2", time: "15:30" },
      { id: "c3", course: "Kecerdasan Buatan", room: "R.401", time: "09:30" },
    ];
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const [courseInput, setCourseInput] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [timeInput, setTimeInput] = useState("13:00");

  const saveClasses = (next: ClassItem[]) => {
    setClasses(next);
    try {
      localStorage.setItem(CLASSES_KEY, JSON.stringify(next));
    } catch {}
  };

  const current = classes[activeIndex % Math.max(1, classes.length)] || {
    id: "none",
    course: "Tidak ada kelas",
    room: "-",
    time: "--:--",
  };

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseInput.trim()) return;
    saveClasses([
      ...classes,
      {
        id: `c_${Date.now()}`,
        course: courseInput.trim(),
        room: roomInput.trim() || "R.101",
        time: timeInput || "08:00",
      },
    ]);
    setCourseInput("");
    setRoomInput("");
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`relative flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Jadwal Kelas: ${current.course} (${current.room} · ${current.time})`}
      >
        <BookOpen size={15} className="text-[#60a5fa] shrink-0" />
        {isCompact ? (
          <span className="absolute -top-1 -right-1 px-1 h-[15px] rounded-full bg-[#3882F6] text-[9px] font-bold text-white flex items-center justify-center">
            {current.time}
          </span>
        ) : (
          <div className="flex flex-col leading-[1.15] min-w-0">
            <span className="text-[11.5px] font-semibold text-white truncate max-w-[115px]">
              {current.course}
            </span>
            <span className="text-[10px] text-zinc-400 truncate">
              {current.room} · {current.time}
            </span>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Jadwal Kelas & Kuliah"
        moduleId="jadwal_kelas"
        currentView={view}
        config={config}
        width={285}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto">
            {classes.map((c, idx) => (
              <div
                key={c.id}
                onClick={() => setActiveIndex(idx)}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[8px] cursor-pointer border ${
                  idx === activeIndex % classes.length
                    ? "bg-[#3882F6]/15 border-[#3882F6]/40"
                    : "bg-white/[0.04] border-white/[0.05]"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[11.5px] font-semibold text-white truncate">
                    {c.course}
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    {c.room} · {c.time}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    saveClasses(classes.filter((x) => x.id !== c.id));
                  }}
                  className="text-zinc-500 hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddClass} className="flex items-center gap-1 pt-1 border-t border-white/[0.07]">
            <input
              type="text"
              value={courseInput}
              onChange={(e) => setCourseInput(e.target.value)}
              placeholder="Mata kuliah..."
              className="flex-1 min-w-0 h-7 px-2 rounded-[7px] bg-white/[0.06] border border-white/[0.1] text-[11px] text-white outline-none"
            />
            <input
              type="text"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="Ruang"
              className="w-[54px] h-7 px-1.5 rounded-[7px] bg-white/[0.06] border border-white/[0.1] text-[11px] text-white outline-none"
            />
            <input
              type="time"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              className="w-[68px] h-7 px-1 rounded-[7px] bg-white/[0.06] border border-white/[0.1] text-[10.5px] text-white outline-none"
            />
            <button
              type="submit"
              className="w-7 h-7 rounded-[7px] bg-[#3882F6] text-white flex items-center justify-center shrink-0 cursor-pointer"
            >
              <Plus size={13} />
            </button>
          </form>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 16. Text snippet
interface SnippetItem {
  id: string;
  trigger: string;
  text: string;
}

const SNIPPETS_KEY = "gili_snippets_v1";

export const TextSnippetNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newTrig, setNewTrig] = useState("");
  const [newText, setNewText] = useState("");

  const [snippets, setSnippets] = useState<SnippetItem[]>(() => {
    try {
      const raw = localStorage.getItem(SNIPPETS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p) && p.length > 0) return p;
      }
    } catch {}
    return [
      { id: "s1", trigger: ";tq", text: "Terima kasih atas konfirmasinya." },
      { id: "s2", trigger: ";mail", text: "faiz@example.com" },
      { id: "s3", trigger: ";meet", text: "Mari kita jadwalkan diskusi singkat hari ini." },
    ];
  });

  const saveSnippets = (next: SnippetItem[]) => {
    setSnippets(next);
    try {
      localStorage.setItem(SNIPPETS_KEY, JSON.stringify(next));
    } catch {}
  };

  const topSnippet = snippets[0] || { id: "none", trigger: ";tq", text: "Terima kasih" };

  const copySnippet = (item: SnippetItem) => {
    navigator.clipboard.writeText(item.text).catch(() => {});
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1200);
  };

  const handleAddSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrig.trim() || !newText.trim()) return;
    saveSnippets([
      ...snippets,
      {
        id: `sn_${Date.now()}`,
        trigger: newTrig.trim(),
        text: newText.trim(),
      },
    ]);
    setNewTrig("");
    setNewText("");
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title="Text Snippet: Klik untuk menyalin template teks cepat"
      >
        <Code2 size={15} className="text-[#60a5fa] shrink-0" />
        {!isCompact && (
          <>
            <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded-[5px] bg-[#3882F6]/20 text-[#93c5fd]">
              {topSnippet.trigger}
            </span>
            <span className="text-[11.5px] text-zinc-200 truncate max-w-[105px]">
              {topSnippet.text}
            </span>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Text Snippet"
        moduleId="text_snippet"
        currentView={view}
        config={config}
        width={285}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto">
            {snippets.map((s) => (
              <div
                key={s.id}
                onClick={() => copySnippet(s)}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[8px] bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.05] cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-[#3882F6]/20 text-[#93c5fd] shrink-0">
                    {s.trigger}
                  </span>
                  <span className="text-[11.5px] text-zinc-200 truncate">
                    {s.text}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {copiedId === s.id ? (
                    <Check size={12} className="text-emerald-400" />
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        saveSnippets(snippets.filter((x) => x.id !== s.id));
                      }}
                      className="text-zinc-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddSnippet} className="flex items-center gap-1 pt-1 border-t border-white/[0.07]">
            <input
              type="text"
              value={newTrig}
              onChange={(e) => setNewTrig(e.target.value)}
              placeholder=";kode"
              className="w-[58px] h-7 px-1.5 rounded-[7px] bg-white/[0.06] border border-white/[0.1] text-[11px] font-mono text-white outline-none"
            />
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Isi teks snippet..."
              className="flex-1 min-w-0 h-7 px-2 rounded-[7px] bg-white/[0.06] border border-white/[0.1] text-[11px] text-white outline-none"
            />
            <button
              type="submit"
              className="w-7 h-7 rounded-[7px] bg-[#3882F6] text-white flex items-center justify-center shrink-0 cursor-pointer"
            >
              <Plus size={13} />
            </button>
          </form>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
