import React, { useMemo, useRef, useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { useMinuteTick } from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

interface ClassItem {
  id: string;
  subject: string;
  room: string;
  time: string;
}

const SCHEDULE_KEY = "gili_class_schedule_v1";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 9999;
  return h * 60 + m;
}

function loadSchedule(): ClassItem[] {
  try {
    const raw = localStorage.getItem(SCHEDULE_KEY);
    if (raw === null) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr.filter(
        (x): x is ClassItem =>
          typeof x?.id === "string" &&
          typeof x?.subject === "string" &&
          typeof x?.time === "string"
      );
    }
  } catch {}
  return [];
}

export const ClassScheduleNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<ClassItem[]>(loadSchedule);
  const [subject, setSubject] = useState("");
  const [room, setRoom] = useState("");
  const [time, setTime] = useState("09:00");
  const anchorRef = useRef<HTMLDivElement>(null);
  const now = useMinuteTick(60_000);

  const persist = (next: ClassItem[]) => {
    const sorted = [...next].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    setItems(sorted);
    try {
      localStorage.setItem(SCHEDULE_KEY, JSON.stringify(sorted));
    } catch {}
  };

  const { nextClass, minutesUntil } = useMemo(() => {
    if (items.length === 0) return { nextClass: null, minutesUntil: null };
    const sorted = [...items].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const upcoming = sorted.find((item) => toMinutes(item.time) >= nowMins);
    if (upcoming) {
      return {
        nextClass: upcoming,
        minutesUntil: toMinutes(upcoming.time) - nowMins,
      };
    }
    return { nextClass: null, minutesUntil: null };
  }, [items, now]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSubject = subject.trim();
    if (!cleanSubject) return;
    persist([
      ...items,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        subject: cleanSubject,
        room: room.trim() || tx(lang, "Room -", "Ruang -"),
        time: time || "09:00",
      },
    ]);
    setSubject("");
    setRoom("");
  };

  const handleDelete = (id: string) => {
    persist(items.filter((item) => item.id !== id));
  };

  const handleToggle = () => setIsOpen((v) => !v);
  const triggerTip = nextClass
    ? tx(
        lang,
        `Next: ${nextClass.subject} (${nextClass.room} · ${nextClass.time})`,
        `Berikutnya: ${nextClass.subject} (${nextClass.room} · ${nextClass.time})`
      )
    : items.length > 0
    ? tx(lang, "All classes done for today", "Semua kelas hari ini selesai")
    : tx(lang, "No class schedule yet", "Belum ada jadwal kelas");

  const inputClass = isLight
    ? "bg-black/[0.05] border-black/15 text-zinc-900 placeholder-zinc-500"
    : "bg-black/50 border-white/15 text-white placeholder-zinc-500";

  return (
    <>
      <Tooltip
        content={triggerTip}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : ""}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(handleToggle, tx(lang, "Class schedule", "Jadwal kelas"), isOpen)}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? isVertical
                ? "w-full max-w-full h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] relative"
                : "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] relative"
              : "h-10 px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <BookOpen size={16} className="text-blue-400 shrink-0" />
          {isCompact ? (
            nextClass && (
              <span className="absolute -top-1 -right-1 px-1 h-[15px] rounded-full bg-[#3882F6] text-[#ffffff] text-[8.5px] font-bold flex items-center justify-center tabular-nums">
                {nextClass.time.replace(":", ".")}
              </span>
            )
          ) : (
            <div className="flex flex-col leading-[1.15] min-w-0 max-w-[140px]">
              <span className="text-[12px] font-semibold text-white truncate">
                {nextClass
                  ? nextClass.subject
                  : items.length > 0
                  ? tx(lang, "Classes done", "Kelas selesai")
                  : tx(lang, "Class schedule", "Jadwal kelas")}
              </span>
              <span className="text-[10px] text-zinc-300 truncate">
                {nextClass
                  ? minutesUntil !== null && minutesUntil <= 90
                    ? tx(
                        lang,
                        `${nextClass.room} · in ${minutesUntil}m`,
                        `${nextClass.room} · ${minutesUntil}m lagi`
                      )
                    : `${nextClass.room} · ${nextClass.time}`
                  : items.length > 0
                  ? tx(lang, `${items.length} saved classes`, `${items.length} jadwal tersimpan`)
                  : tx(lang, "Add schedule", "Tambah jadwal")}
              </span>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Class Schedule", "Jadwal Kelas")}
        moduleId="jadwal_kelas"
        currentView={view}
        config={config}
        needsKeyboardFocus
        width={276}
      >
        <div className="flex flex-col gap-1.5 max-h-[168px] overflow-y-auto pr-0.5">
          {items.length === 0 ? (
            <div className="text-[11px] text-zinc-400 py-3 text-center">
              {tx(lang, "No saved class schedules yet.", "Belum ada jadwal kelas tersimpan.")}
            </div>
          ) : (
            items.map((item) => {
              const isNext = nextClass?.id === item.id;
              return (
                <div
                  key={item.id}
                  className={`w-full min-w-0 overflow-hidden flex items-center justify-between gap-2 px-2.5 py-2 rounded-[9px] border ${
                    isNext
                      ? "bg-[#3882F6]/15 border-[#3882F6]/40"
                      : "bg-white/[0.04] border-white/[0.08]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[11.5px] font-semibold text-white truncate">
                      {item.subject}
                    </div>
                    <div className="text-[10px] text-zinc-300 truncate">
                      {item.time} · {item.room}
                      {isNext ? tx(lang, " (Next)", " (Berikutnya)") : ""}
                    </div>
                  </div>
                  <Tooltip content={tx(lang, "Delete class", "Hapus kelas")} side="top" isLightMode={isLight}>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      aria-label={tx(lang, `Delete ${item.subject}`, `Hapus ${item.subject}`)}
                      className={`w-6 h-6 rounded-[6px] hover:bg-red-500/20 text-zinc-400 hover:text-rose-300 flex items-center justify-center shrink-0 cursor-pointer ${TRIGGER_FOCUS_RING}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </Tooltip>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleAdd} className="flex flex-col gap-1.5 pt-2 border-t border-white/[0.08]">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") e.stopPropagation();
            }}
            placeholder={tx(lang, "Course / subject...", "Mata kuliah...")}
            className={`w-full min-w-0 h-7 px-2 rounded-[7px] border text-[11px] outline-none focus:border-blue-400 ${inputClass} ${TRIGGER_FOCUS_RING}`}
          />
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Escape") e.stopPropagation();
              }}
              placeholder={tx(lang, "Room", "Ruang")}
              className={`flex-1 min-w-0 h-7 px-2 rounded-[7px] border text-[11px] outline-none focus:border-blue-400 ${inputClass} ${TRIGGER_FOCUS_RING}`}
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Escape") e.stopPropagation();
              }}
              className={`w-[88px] shrink-0 h-7 px-1.5 rounded-[7px] border text-[11px] outline-none focus:border-blue-400 ${inputClass} ${
                isLight ? "[color-scheme:light]" : "[color-scheme:dark]"
              } ${TRIGGER_FOCUS_RING}`}
            />
            <Tooltip content={tx(lang, "Add class", "Tambah kelas")} side="top" isLightMode={isLight}>
              <button
                type="submit"
                aria-label={tx(lang, "Add class", "Tambah kelas")}
                className={`w-7 h-7 rounded-[7px] bg-[#3882F6] hover:bg-blue-500 text-[#ffffff] flex items-center justify-center shrink-0 cursor-pointer ${TRIGGER_FOCUS_RING}`}
              >
                <Plus size={13} />
              </button>
            </Tooltip>
          </div>
        </form>
      </NavbarPopoverShell>
    </>
  );
};
