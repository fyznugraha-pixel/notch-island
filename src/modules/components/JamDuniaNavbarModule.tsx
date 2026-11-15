import React, { useState, useRef } from "react";
import { Globe } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { useMinuteTick } from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { dateLocale, getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

const ZONES = [
  { code: "JKT", name: "Jakarta", tz: "Asia/Jakarta" },
  { code: "TYO", name: "Tokyo", tz: "Asia/Tokyo" },
  { code: "LON", name: "London", tz: "Europe/London" },
  { code: "NYC", name: "New York", tz: "America/New_York" },
  { code: "SYD", name: "Sydney", tz: "Australia/Sydney" },
];

const WORLD_CLOCK_KEY = "gili_world_clock_idx_v1";

export const JamDuniaNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const now = useMinuteTick(15000);
  const [pairIdx, setPairIdx] = useState<number>(() => {
    const saved = Number(localStorage.getItem(WORLD_CLOCK_KEY));
    return Number.isInteger(saved) && saved >= 0 ? saved % ZONES.length : 0;
  });

  const handleSelectZone = (idx: number) => {
    setPairIdx(idx);
    try {
      localStorage.setItem(WORLD_CLOCK_KEY, String(idx));
    } catch {}
  };

  const fmt = (tz: string) => {
    try {
      return now
        .toLocaleTimeString(locale, {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: config?.clock24h === false,
        })
        .replace(".", ":");
    } catch {
      return "--:--";
    }
  };

  const z1 = ZONES[pairIdx % ZONES.length];
  const z2 = ZONES[(pairIdx + 1) % ZONES.length];
  const handleToggle = () => setIsOpen((v) => !v);
  const worldClockTitle = tx(lang, "World Clock", "Jam Dunia");

  return (
    <>
      <Tooltip
        content={`${worldClockTitle}: ${z1.name} ${fmt(z1.tz)} · ${z2.name} ${fmt(z2.tz)}`}
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
            `${worldClockTitle}: ${z1.name} ${fmt(z1.tz)}, ${z2.name} ${fmt(z2.tz)}`,
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? isVertical
                ? "w-full max-w-full h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
                : "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
              : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          {isCompact ? (
            <Globe size={15} className="text-zinc-200" />
          ) : (
            <>
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[76px]">
                <span className="text-[11px] font-bold text-white tabular-nums truncate">
                  {z1.code} {fmt(z1.tz)}
                </span>
                <span className="text-[9.5px] text-zinc-400 truncate">{z1.name}</span>
              </div>
              <span className={`w-[1px] h-[18px] shrink-0 ${isLight ? "bg-zinc-300" : "bg-zinc-700"}`} />
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[76px]">
                <span className="text-[11px] font-bold text-white tabular-nums truncate">
                  {z2.code} {fmt(z2.tz)}
                </span>
                <span className="text-[9.5px] text-zinc-400 truncate">{z2.name}</span>
              </div>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={worldClockTitle}
        moduleId="jam_dunia"
        currentView={view}
        config={config}
        width={256}
      >
        <div className="flex flex-col gap-1.5">
          {ZONES.map((z, idx) => (
            <button
              key={z.code}
              type="button"
              onClick={() => handleSelectZone(idx)}
              className={`w-full min-w-0 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[8px] text-[11.5px] text-left cursor-pointer transition-colors ${TRIGGER_FOCUS_RING} ${
                idx === pairIdx % ZONES.length ||
                idx === (pairIdx + 1) % ZONES.length
                  ? "bg-[#3882F6]/15 text-white border border-[#3882F6]/35"
                  : "bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
              }`}
            >
              <span className="truncate min-w-0 flex-1">
                <strong className="text-sky-400 mr-1.5">{z.code}</strong>
                {z.name}
              </span>
              <span className="font-mono font-bold tabular-nums shrink-0">
                {fmt(z.tz)}
              </span>
            </button>
          ))}
        </div>
      </NavbarPopoverShell>
    </>
  );
};
