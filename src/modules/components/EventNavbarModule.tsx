import React, { useState, useEffect, useRef } from "react";
import { Calendar, Plus, Check } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

interface AgendaEvent {
  id: string;
  title: string;
  time: string; // HH:mm
}

const STORAGE_KEY = "gili_navbar_events_v1";

const DEFAULT_EVENTS: AgendaEvent[] = [
  { id: "ev_1", title: "Rapat tim", time: "14:00" },
  { id: "ev_2", title: "Review sprint", time: "16:30" },
];

export const EventNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const [events, setEvents] = useState<AgendaEvent[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_EVENTS;
  });

  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("15:00");
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const saveEvents = (next: AgendaEvent[]) => {
    setEvents(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  // Pick next upcoming event today (or first event)
  const activeEvent = events[0] || { id: "none", title: "Tidak ada acara", time: "--:--" };

  const getCountdownLabel = (timeStr: string) => {
    const parts = timeStr.split(":").map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      return { short: "--", full: "Hari ini" };
    }
    const now = new Date(nowTick);
    const target = new Date(now);
    target.setHours(parts[0], parts[1], 0, 0);
    let diffMin = Math.round((target.getTime() - now.getTime()) / 60000);
    if (diffMin < -60) {
      diffMin += 24 * 60;
    }
    if (diffMin <= 0 && diffMin >= -60) {
      return { short: "Skrg", full: `${timeStr} · Berlangsung` };
    }
    if (diffMin < 60) {
      return { short: `${diffMin}m`, full: `${timeStr} · ${diffMin} mnt` };
    }
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return {
      short: `${h}j`,
      full: `${timeStr} · ${h}j ${m > 0 ? `${m}m` : ""}`.trim(),
    };
  };

  const cd = getCountdownLabel(activeEvent.time);

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const next = [
      ...events,
      { id: `ev_${Date.now()}`, title: trimmed, time: newTime || "14:00" },
    ].sort((a, b) => a.time.localeCompare(b.time));
    saveEvents(next);
    setNewTitle("");
  };

  const handleRemoveEvent = (id: string) => {
    saveEvents(events.filter((ev) => ev.id !== id));
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
        title={`${activeEvent.title} (${cd.full})`}
      >
        <Calendar size={15} className="text-[#3882F6] shrink-0" />
        {isCompact ? (
          <span className="absolute -top-1 -right-1 px-1.5 h-[16px] rounded-full bg-[#3882F6] text-[9.5px] font-bold text-white flex items-center justify-center shadow">
            {cd.short}
          </span>
        ) : (
          <div className="flex flex-col leading-[1.15] min-w-0">
            <span className="text-[11.5px] font-semibold text-white truncate max-w-[110px]">
              {activeEvent.title}
            </span>
            <span className="text-[10px] text-zinc-400 truncate">
              {cd.full}
            </span>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Acara Berikutnya"
        moduleId="acara_berikutnya"
        currentView={view}
        config={config}
        width={280}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5 max-h-[150px] overflow-y-auto pr-0.5">
            {events.length === 0 ? (
              <div className="text-[11px] text-zinc-500 py-3 text-center">
                Belum ada jadwal acara hari ini.
              </div>
            ) : (
              events.map((ev, idx) => (
                <div
                  key={ev.id}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[9px] border ${
                    idx === 0
                      ? "bg-[#3882F6]/15 border-[#3882F6]/30"
                      : "bg-white/[0.04] border-white/[0.06]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-mono font-bold text-[#60a5fa] shrink-0">
                      {ev.time}
                    </span>
                    <span className="text-[11.5px] text-zinc-100 truncate">
                      {ev.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveEvent(ev.id)}
                    className="text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer shrink-0"
                    title="Selesai / Hapus"
                  >
                    <Check size={13} />
                  </button>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAddEvent} className="flex items-center gap-1.5 pt-1 border-t border-white/[0.07]">
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="w-[74px] h-7 px-1.5 rounded-[7px] bg-white/[0.06] border border-white/[0.1] text-[11px] text-white outline-none focus:border-[#3882F6]"
            />
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Tambah acara..."
              className="flex-1 min-w-0 h-7 px-2 rounded-[7px] bg-white/[0.06] border border-white/[0.1] text-[11px] text-white placeholder-zinc-500 outline-none focus:border-[#3882F6]"
            />
            <button
              type="submit"
              className="w-7 h-7 rounded-[7px] bg-[#3882F6] hover:bg-[#2563eb] text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="Tambah acara"
            >
              <Plus size={13} />
            </button>
          </form>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
