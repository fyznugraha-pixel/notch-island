import React, { useRef, useState } from "react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, CircularRingSvg, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { getDaysInYear, useMinuteTick } from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { dateLocale, getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

export const ProgresHariNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const now = useMinuteTick(60_000);

  const secsToday = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const dayPct = Math.min(100, Math.max(0, (secsToday / 86_400) * 100));
  const remMinsTotal = Math.max(0, Math.floor((86_400 - secsToday) / 60));
  const remHours = Math.floor(remMinsTotal / 60);
  const remMins = remMinsTotal % 60;

  const year = now.getFullYear();
  const daysInYear = getDaysInYear(year);
  const startOfYear = new Date(year, 0, 1);
  const todayLocal = new Date(year, now.getMonth(), now.getDate());
  const dayOfYear = Math.floor((todayLocal.getTime() - startOfYear.getTime()) / 86_400_000) + 1;
  const yearPct = Math.min(100, (dayOfYear / daysInYear) * 100);

  const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();
  const monthPct = Math.min(100, (now.getDate() / daysInMonth) * 100);

  const dayPctRounded = Math.round(dayPct);
  const handleToggle = () => setIsOpen((v) => !v);

  return (
    <>
      <Tooltip
        content={tx(
          lang,
          `Today's progress ${dayPct.toFixed(1)}% · Year ${yearPct.toFixed(1)}%`,
          `Progres hari ini ${dayPct.toFixed(1)}% · Tahun ${yearPct.toFixed(1)}%`
        )}
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
            tx(lang, `Day progress ${dayPctRounded}%`, `Progres hari ${dayPctRounded}%`),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `${
                  isVertical ? "w-full max-w-full" : "w-10"
                } h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          {isCompact ? (
            <CircularRingSvg size={26} strokeWidth={2.2} percent={dayPct} color="#ec4899">
              <span
                className={`leading-none ${
                  dayPctRounded >= 100
                    ? "text-[7.5px] font-extrabold tracking-[-0.05em]"
                    : "text-[8.5px] font-bold tabular-nums"
                }`}
              >
                {dayPctRounded}
              </span>
            </CircularRingSvg>
          ) : (
            <>
              <div
                className={`w-14 h-1.5 rounded-full overflow-hidden shrink-0 ${
                  isLight ? "bg-black/15" : "bg-white/15"
                }`}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${dayPct}%`,
                    background: "linear-gradient(90deg, #7fe3ff, #ec4899)",
                  }}
                />
              </div>
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[90px]">
                <span className="text-[12px] font-bold text-white tabular-nums truncate">
                  {dayPctRounded}%
                </span>
                <span className="text-[10px] text-zinc-300 truncate">
                  {tx(lang, "Today", "Hari ini")}
                </span>
              </div>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Time Progress", "Progres Waktu")}
        moduleId="progres_hari"
        currentView={view}
        config={config}
        width={260}
      >
        <div className="flex flex-col gap-2.5">
          {[
            {
              label: tx(lang, "Today", "Hari Ini"),
              value: `${dayPct.toFixed(1)}%`,
              sub: tx(lang, `${remHours}h ${remMins}m left`, `Sisa ${remHours}j ${remMins}m`),
              pct: dayPct,
              color: "#ec4899",
            },
            {
              label: now.toLocaleDateString(dateLocale(lang), { month: "long" }),
              value: `${now.getDate()}/${daysInMonth} ${tx(lang, "d", "hr")}`,
              sub: tx(lang, `${monthPct.toFixed(0)}% of month`, `${monthPct.toFixed(0)}% bulan ini`),
              pct: monthPct,
              color: "#38bdf8",
            },
            {
              label: tx(lang, `Year ${year}`, `Tahun ${year}`),
              value: `${dayOfYear}/${daysInYear} ${tx(lang, "d", "hr")}`,
              sub: tx(lang, `${yearPct.toFixed(1)}% of year elapsed`, `${yearPct.toFixed(1)}% tahun berjalan`),
              pct: yearPct,
              color: "#a78bfa",
            },
          ].map((row) => (
            <div key={row.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                <span className="font-semibold text-white truncate min-w-0 flex-1">{row.label}</span>
                <span className="text-zinc-300 tabular-nums shrink-0">{row.value}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.1] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${row.pct}%`, backgroundColor: row.color }}
                />
              </div>
              <span className="text-[9.5px] text-zinc-400">{row.sub}</span>
            </div>
          ))}
        </div>
      </NavbarPopoverShell>
    </>
  );
};
