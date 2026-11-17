import React, { useState, useRef } from "react";
import { Calendar, Plus, Check } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { useMinuteTick } from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

interface AgendaEvent {
  id: string;
  title: string;
  time: string;
}

const STORAGE_KEY = "gili_navbar_events_v1";

function getMinutesDiff(timeStr: string, now: Date): number {
  const parts = timeStr.split(":").map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return 99999;
  const target = new Date(now);
  target.setHours(parts[0], parts[1], 0, 0);
  let diffMin = Math.round((target.getTime() - now.getTime()) / 60000);
  if (diffMin < -30) diffMin += 24 * 60;
  return diffMin;
}

export const EventNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const now = useMinuteTick(30000);

  const [events, setEvents] = useState<AgendaEvent[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [
      { id: "ev_1", title: tx(lang, "Team sync", "Rapat tim"), time: "14:00" },
      { id: "ev_2", title: tx(lang, "Sprint review", "Review sprint"), time: "16:30" },
    ];
  });

  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("15:00");

  const saveEvents = (next: AgendaEvent[]) => {
    setEvents(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const sortedByUpcoming = [...events].sort(
    (a, b) => getMinutesDiff(a.time, now) - getMinutesDiff(b.time, now)
  );
  const activeEvent = sortedByUpcoming[0] || {
    id: "none",
    title: tx(lang, "No events", "Tidak ada acara"),
    time: "--:--",
  };

  const getCountdownLabel = (timeStr: string) => {
    if (!timeStr.includes(":") || timeStr === "--:--") {
      return { short: "--", full: tx(lang, "Empty", "Kosong") };
    }
    const diffMin = getMinutesDiff(timeStr, now);
    if (diffMin <= 0 && diffMin >= -30) {
      return {
        short: tx(lang, "Now", "Skrg"),
        full: tx(lang, `${timeStr} · Ongoing`, `${timeStr} · Berlangsung`),
      };
    }
    if (diffMin < 60) {
      return {
        short: `${diffMin}m`,
        full: tx(lang, `${timeStr} · ${diffMin} min`, `${timeStr} · ${diffMin} mnt`),
      };
    }
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    const hUnit = tx(lang, "h", "j");
    return {
      short: `${h}${hUnit}`,
      full: `${timeStr} · ${h}${hUnit} ${m > 0 ? `${m}m` : ""}`.trim(),
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

  const handleToggle = () => setIsOpen((v) => !v);

  return (
    <>
      <Tooltip
        content={`${activeEvent.title} (${cd.full})`}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : ""}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            tx(
              lang,
              `Next event: ${activeEvent.title} (${cd.full})`,
              `Acara berikutnya: ${activeEvent.title} (${cd.full})`
            ),
            isOpen
          )}
          className={`relative flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? isVertical
                ? "gili-mod-compact gili-mod-vertical justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
                : "gili-mod-compact justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
              : "gili-mod-pill px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <Calendar size={15} className="text-[#3882F6] shrink-0" />
          {isCompact ? (
            events.length > 0 && (
              <span className="gili-mod-badge absolute top-[1px] right-[1px] px-1 h-[14px] rounded-full bg-[#3882F6] text-[8.5px] font-bold text-[#ffffff] flex items-center justify-center shadow tabular-nums pointer-events-none">
                {cd.short}
              </span>
            )
          ) : (
            <div className="flex flex-col leading-[1.15] min-w-0 max-w-[125px]">
              <span className="text-[11.5px] font-semibold text-white truncate">
                {activeEvent.title}
              </span>
              <span className="text-[10px] text-zinc-400 truncate">
                {cd.full}
              </span>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Next Event", "Acara Berikutnya")}
        moduleId="acara_berikutnya"
        currentView={view}
        config={config}
        width={280}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5 max-h-[150px] overflow-y-auto pr-0.5">
            {sortedByUpcoming.length === 0 ? (
              <div className="text-[11px] text-zinc-400 py-3 text-center">
                {tx(lang, "No events scheduled for today.", "Belum ada jadwal acara hari ini.")}
              </div>
            ) : (
              sortedByUpcoming.map((ev) => (
                <div
                  key={ev.id}
                  className={`w-full min-w-0 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[9px] border ${
                    ev.id === activeEvent.id
                      ? "bg-[#3882F6]/15 border-[#3882F6]/30"
                      : "bg-white/[0.04] border-white/[0.08]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[11px] font-mono font-bold text-[#60a5fa] shrink-0">
                      {ev.time}
                    </span>
                    <span className="text-[11.5px] text-zinc-100 truncate">
                      {ev.title}
                    </span>
                  </div>
                  <Tooltip content={tx(lang, "Done / Remove", "Selesai / Hapus")} side="top" isLightMode={isLight}>
                    <button
                      type="button"
                      onClick={() => handleRemoveEvent(ev.id)}
                      aria-label={tx(lang, `Remove ${ev.title}`, `Hapus ${ev.title}`)}
                      className={`text-zinc-300 hover:text-emerald-400 transition-colors cursor-pointer shrink-0 rounded ${TRIGGER_FOCUS_RING}`}
                    >
                      <Check size={13} />
                    </button>
                  </Tooltip>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={handleAddEvent}
            className="flex items-center gap-1.5 pt-1 border-t border-white/[0.08]"
          >
            <input
              type="time"
              aria-label={tx(lang, "Event time", "Waktu acara")}
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className={`w-[88px] shrink-0 h-7 px-1.5 rounded-[7px] bg-white/[0.06] border border-white/[0.12] text-[11px] text-white ${
                isLight ? "[color-scheme:light]" : "[color-scheme:dark]"
              } ${TRIGGER_FOCUS_RING}`}
            />
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={tx(lang, "Add event...", "Tambah acara...")}
              className={`flex-1 min-w-0 h-7 px-2 rounded-[7px] bg-white/[0.06] border border-white/[0.12] text-[11px] text-white placeholder-zinc-400 ${TRIGGER_FOCUS_RING}`}
            />
            <Tooltip content={tx(lang, "Add event", "Tambah acara")} side="top" isLightMode={isLight}>
              <button
                type="submit"
                aria-label={tx(lang, "Add event", "Tambah acara")}
                className={`w-7 h-7 rounded-[7px] bg-[#3882F6] hover:bg-[#2563eb] text-[#ffffff] flex items-center justify-center transition-colors cursor-pointer shrink-0 ${TRIGGER_FOCUS_RING}`}
              >
                <Plus size={13} />
              </button>
            </Tooltip>
          </form>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
