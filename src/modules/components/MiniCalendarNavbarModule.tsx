import React, { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { useMinuteTick } from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { dateLocale, getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

function getMondayWeekStart(date: Date): Date {
  const day = date.getDay();
  const diffToMon = (day + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - diffToMon);
}

export const MiniCalendarNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const locale = dateLocale(lang);
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const now = useMinuteTick(60_000);

  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => ({
    year: now.getFullYear(),
    month: now.getMonth(),
  }));

  const weekdayLetters =
    lang === "en"
      ? ["M", "T", "W", "T", "F", "S", "S"]
      : ["S", "S", "R", "K", "J", "S", "M"];

  const weekdayHeaders =
    lang === "en"
      ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
      : ["Sn", "Sl", "Rb", "Km", "Jm", "Sb", "Mg"];

  const monthShortLabel = useMemo(
    () =>
      now
        .toLocaleDateString(locale, { month: "short" })
        .replace(".", "")
        .toUpperCase(),
    [now, locale]
  );

  const fullDateLabel = useMemo(
    () =>
      now.toLocaleDateString(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [now, locale]
  );

  const weekStrip = useMemo(() => {
    const mon = getMondayWeekStart(now);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
      const isToday =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
      return {
        letter: weekdayLetters[i],
        dateNum: d.getDate(),
        isToday,
        isWeekend: i >= 5,
      };
    });
  }, [now, lang]);

  const calendarCells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const totalDays = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const leadingBlanks = (first.getDay() + 6) % 7;
    const cells: Array<{ day: number | null; isToday: boolean; colIdx: number }> = [];

    for (let i = 0; i < leadingBlanks; i++) {
      cells.push({ day: null, isToday: false, colIdx: i % 7 });
    }
    for (let d = 1; d <= totalDays; d++) {
      const colIdx = (leadingBlanks + d - 1) % 7;
      const isToday =
        cursor.year === now.getFullYear() &&
        cursor.month === now.getMonth() &&
        d === now.getDate();
      cells.push({ day: d, isToday, colIdx });
    }
    return cells;
  }, [cursor, now]);

  const shiftMonth = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  const isViewingCurrentMonth =
    cursor.year === now.getFullYear() && cursor.month === now.getMonth();

  const monthTitle = new Date(cursor.year, cursor.month, 1).toLocaleDateString(
    locale,
    {
      month: "long",
      year: "numeric",
    }
  );

  const handleToggle = () => {
    if (!isOpen) {
      setCursor({ year: now.getFullYear(), month: now.getMonth() });
    }
    setIsOpen((v) => !v);
  };

  const prevMonthLabel = tx(lang, "Previous month", "Bulan sebelumnya");
  const nextMonthLabel = tx(lang, "Next month", "Bulan berikutnya");

  return (
    <>
      <Tooltip
        content={fullDateLabel}
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
            tx(lang, "Mini Calendar", "Kalender mini"),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "gili-mod-pill px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          {isCompact ? (
            <div className="flex flex-col items-center leading-none">
              <span
                className={`text-[8px] font-bold tracking-wide ${
                  isLight ? "text-rose-600" : "text-rose-400"
                }`}
              >
                {monthShortLabel}
              </span>
              <span className="text-[14px] font-bold text-white tabular-nums mt-0.5">
                {now.getDate()}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {weekStrip.map((item, idx) => (
                <div
                  key={idx}
                  className={`w-[19px] h-[min(24px,calc(var(--navbar-mod-size,40px)-6px))] overflow-hidden rounded-[6px] flex flex-col items-center justify-center leading-none ${
                    item.isToday
                      ? "bg-[#3882F6] text-[#ffffff] font-bold"
                      : item.isWeekend
                      ? isLight
                        ? "text-rose-600"
                        : "text-rose-300"
                      : "text-zinc-300"
                  }`}
                >
                  <span className="text-[7.5px] opacity-85">{item.letter}</span>
                  <span className="text-[9.5px] font-semibold tabular-nums">
                    {item.dateNum}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Mini Calendar", "Kalender Mini")}
        moduleId="kalender_mini"
        currentView={view}
        config={config}
        width={256}
      >
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <span className="text-[12px] font-semibold text-white capitalize truncate min-w-0 flex-1">
            {monthTitle}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {!isViewingCurrentMonth && (
              <button
                type="button"
                onClick={() =>
                  setCursor({ year: now.getFullYear(), month: now.getMonth() })
                }
                className={`px-1.5 py-0.5 rounded-[5px] text-[9.5px] font-semibold cursor-pointer ${TRIGGER_FOCUS_RING} ${
                  isLight
                    ? "bg-blue-600/15 hover:bg-blue-600/25 text-blue-700"
                    : "bg-white/[0.08] hover:bg-white/[0.16] text-blue-300"
                }`}
              >
                {tx(lang, "Today", "Hari ini")}
              </button>
            )}
            <Tooltip content={prevMonthLabel} side="top" isLightMode={isLight}>
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label={prevMonthLabel}
                className={`w-6 h-6 rounded-[6px] bg-white/[0.07] hover:bg-white/[0.15] flex items-center justify-center text-zinc-200 cursor-pointer ${TRIGGER_FOCUS_RING}`}
              >
                <ChevronLeft size={13} />
              </button>
            </Tooltip>
            <Tooltip content={nextMonthLabel} side="top" isLightMode={isLight}>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label={nextMonthLabel}
                className={`w-6 h-6 rounded-[6px] bg-white/[0.07] hover:bg-white/[0.15] flex items-center justify-center text-zinc-200 cursor-pointer ${TRIGGER_FOCUS_RING}`}
              >
                <ChevronRight size={13} />
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdayHeaders.map((d, idx) => (
            <div
              key={idx}
              className={`text-[9.5px] font-semibold py-0.5 ${
                idx === 6
                  ? isLight
                    ? "text-rose-600"
                    : "text-rose-300"
                  : "text-zinc-400"
              }`}
            >
              {d}
            </div>
          ))}
          {calendarCells.map((cell, idx) => (
            <div
              key={idx}
              className={`h-7 rounded-[7px] flex items-center justify-center text-[11px] tabular-nums ${
                cell.day === null
                  ? ""
                  : cell.isToday
                  ? "bg-[#3882F6] text-[#ffffff] font-bold shadow-sm"
                  : cell.colIdx === 6
                  ? isLight
                    ? "text-rose-600 hover:bg-black/[0.05]"
                    : "text-rose-300 hover:bg-white/[0.06]"
                  : "text-zinc-200 hover:bg-white/[0.06]"
              }`}
            >
              {cell.day ?? ""}
            </div>
          ))}
        </div>

        <div className="text-[10px] text-zinc-300 text-center border-t border-white/[0.08] pt-1.5">
          {fullDateLabel}
        </div>
      </NavbarPopoverShell>
    </>
  );
};
