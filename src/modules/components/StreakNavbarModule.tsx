import React, { useEffect, useRef, useState } from "react";
import { Check, Flame, RotateCcw } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import {
  getLocalDateKey,
  getYesterdayLocalDateKey,
  useMinuteTick,
} from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import type { Language } from "../../services/i18n";

interface HabitStreakState {
  title: string;
  count: number;
  lastCheckedDate: string | null;
}

const STREAK_KEY = "gili_habit_streak_v2";

function normalizeStreakForDate(
  data: HabitStreakState,
  todayKey: string,
  yesterdayKey: string
): HabitStreakState {
  if (!data.lastCheckedDate) return data;
  if (data.lastCheckedDate === todayKey || data.lastCheckedDate === yesterdayKey) {
    return data;
  }
  return { ...data, count: 0, lastCheckedDate: null };
}

function loadInitialStreak(lang: Language): HabitStreakState {
  const defaultTitle = tx(lang, "Daily Focus", "Fokus Harian");
  const today = getLocalDateKey();
  const yesterday = getYesterdayLocalDateKey();
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const parsed: HabitStreakState = {
        title: typeof p?.title === "string" && p.title.trim() ? p.title : defaultTitle,
        count: typeof p?.count === "number" && p.count >= 0 ? p.count : 0,
        lastCheckedDate: typeof p?.lastCheckedDate === "string" ? p.lastCheckedDate : null,
      };
      return normalizeStreakForDate(parsed, today, yesterday);
    }
  } catch {}
  return { title: defaultTitle, count: 0, lastCheckedDate: null };
}

export const StreakNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const [streak, setStreak] = useState<HabitStreakState>(() => loadInitialStreak(lang));
  const now = useMinuteTick(60_000);

  const todayKey = getLocalDateKey(now);
  const yesterdayKey = getYesterdayLocalDateKey(now);

  const persist = (next: HabitStreakState) => {
    setStreak(next);
    try {
      localStorage.setItem(STREAK_KEY, JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    const normalized = normalizeStreakForDate(streak, todayKey, yesterdayKey);
    if (normalized.count !== streak.count || normalized.lastCheckedDate !== streak.lastCheckedDate) {
      persist(normalized);
    }
  }, [todayKey, yesterdayKey]);

  const checkedToday = streak.lastCheckedDate === todayKey;

  const handleToggleToday = () => {
    if (checkedToday) {
      persist({
        ...streak,
        count: Math.max(0, streak.count - 1),
        lastCheckedDate: streak.count > 1 ? yesterdayKey : null,
      });
    } else {
      persist({
        ...streak,
        count: streak.count + 1,
        lastCheckedDate: todayKey,
      });
    }
  };

  const handleToggle = () => setIsOpen((v) => !v);
  const daysShort =
    lang === "en"
      ? `${streak.count} ${streak.count === 1 ? "day" : "days"}`
      : `${streak.count} hari`;

  return (
    <>
      <Tooltip
        content={`${streak.title}: ${daysShort} (${
          checkedToday
            ? tx(lang, "Done today", "Selesai hari ini")
            : tx(lang, "Not checked in", "Belum check-in")
        })`}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            `Streak ${streak.title} ${daysShort}`,
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] relative`
              : "gili-mod-pill px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <Flame
            size={17}
            className={
              checkedToday
                ? isLight
                  ? "text-amber-600 shrink-0"
                  : "text-amber-400 shrink-0"
                : "text-zinc-300 shrink-0"
            }
            fill={checkedToday ? "currentColor" : "none"}
          />
          {isCompact ? (
            <span className="gili-mod-badge absolute top-[1px] right-[1px] min-w-[14px] h-[14px] px-1 rounded-full bg-amber-500 text-[#09090b] text-[8.5px] font-bold flex items-center justify-center tabular-nums pointer-events-none">
              {streak.count}
            </span>
          ) : (
            <div className="flex flex-col leading-[1.15] min-w-0 max-w-[115px]">
              <span className="text-[12px] font-bold text-white tabular-nums truncate">
                {daysShort}
              </span>
              <span className="text-[10px] text-zinc-300 truncate">{streak.title}</span>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Habit Streak", "Streak Kebiasaan")}
        moduleId="streak_kebiasaan"
        currentView={view}
        config={config}
        needsKeyboardFocus
        width={264}
      >
        <div className="flex items-center justify-between gap-2 min-w-0 p-2.5 rounded-[11px] bg-white/[0.05] border border-white/[0.1]">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 ${
                isLight ? "bg-amber-600/15 text-amber-700" : "bg-amber-500/20 text-amber-400"
              }`}
            >
              <Flame size={18} fill={checkedToday ? "currentColor" : "none"} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-white tabular-nums">
                {lang === "en"
                  ? `${streak.count} ${streak.count === 1 ? "Day" : "Days"}`
                  : `${streak.count} Hari`}
              </div>
              <div className="text-[10px] text-zinc-300 truncate">
                {checkedToday
                  ? tx(lang, "Checked in today", "Check-in hari ini tercatat")
                  : tx(lang, "Not checked in today", "Belum check-in hari ini")}
              </div>
            </div>
          </div>
          <Tooltip
            content={tx(lang, "Reset streak to 0", "Reset streak ke 0")}
            side="top"
            isLightMode={isLight}
          >
            <button
              type="button"
              onClick={() => persist({ ...streak, count: 0, lastCheckedDate: null })}
              aria-label={tx(lang, "Reset streak", "Reset streak")}
              className={`w-7 h-7 shrink-0 rounded-[7px] bg-white/[0.07] hover:bg-white/[0.15] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              <RotateCcw size={12} />
            </button>
          </Tooltip>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-zinc-300">
            {tx(lang, "Habit name", "Nama kebiasaan")}
          </span>
          <input
            type="text"
            value={streak.title}
            maxLength={36}
            onChange={(e) => persist({ ...streak, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key !== "Escape") e.stopPropagation();
            }}
            placeholder={tx(lang, "e.g. Study 30 mins", "Contoh: Belajar 30 menit")}
            className={`w-full min-w-0 h-8 px-2.5 rounded-[8px] border text-[11.5px] outline-none ${TRIGGER_FOCUS_RING} ${
              isLight
                ? "bg-black/[0.06] border-black/15 text-zinc-900 placeholder:text-zinc-500 focus:border-amber-600"
                : "bg-black/50 border-white/15 text-white focus:border-amber-400"
            }`}
          />
        </label>

        <button
          type="button"
          onClick={handleToggleToday}
          className={`w-full min-w-0 px-3 py-2 rounded-[9px] text-[11.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${TRIGGER_FOCUS_RING} ${
            checkedToday
              ? isLight
                ? "bg-emerald-600/15 text-emerald-700 border border-emerald-600/35 hover:bg-emerald-600/25"
                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
              : "bg-amber-500 hover:bg-amber-400 text-[#09090b]"
          }`}
        >
          <Check size={13} className="shrink-0" />
          <span className="truncate">
            {checkedToday
              ? tx(lang, "Done Today · Undo", "Selesai Hari Ini · Batal")
              : tx(lang, "Mark Done Today", "Tandai Selesai Hari Ini")}
          </span>
        </button>
      </NavbarPopoverShell>
    </>
  );
};
