import React, { useState, useEffect, useRef } from "react";
import { Droplet, Plus, RotateCcw } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, CircularRingSvg, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { getLocalDateKey, useMinuteTick } from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import {
  WATER_STORAGE_KEY,
  getDailyIntake,
  logDrink,
  resetTodayWaterIntake,
} from "../../services/waterService";
import { listenCrossWindowEvent } from "../../utils/crossWindowSync";

export const WaterNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const now = useMinuteTick(60000);
  const todayKey = getLocalDateKey(now);
  const [daily, setDaily] = useState(() => getDailyIntake(now));

  useEffect(() => {
    setDaily(getDailyIntake());
  }, [todayKey]);

  useEffect(() => {
    const sync = () => setDaily(getDailyIntake());
    const unsubCross = listenCrossWindowEvent("gili_water_changed", sync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === WATER_STORAGE_KEY || e.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubCross();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const ml = daily.totalMl;
  const targetMl = daily.targetMl || 3000;

  const handleAddDrink = (amountMl: number) => {
    logDrink(amountMl, true);
    setDaily(getDailyIntake());
  };

  const handleResetToday = () => {
    resetTodayWaterIntake();
    setDaily(getDailyIntake());
  };

  const progress = targetMl > 0 ? Math.min(1, ml / targetMl) : 0;
  const litersDecimal = (ml / 1000).toFixed(1);
  const targetLStr = Number((targetMl / 1000).toFixed(1)).toString();
  const fmtNum = (val: string) => (lang === "id" ? val.replace(".", ",") : val);
  const litersText = `${fmtNum(litersDecimal)} / ${fmtNum(targetLStr)} L`;
  const remainingMl = Math.max(0, targetMl - ml);
  const handleToggle = () => setIsOpen((v) => !v);

  return (
    <>
      <Tooltip
        content={`Water Tracker: ${ml} / ${targetMl} ml`}
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
            tx(
              lang,
              `Water Tracker: ${ml} of ${targetMl} ml`,
              `Water Tracker: ${ml} dari ${targetMl} ml`
            ),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "gili-mod-pill px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <CircularRingSvg
            size={24}
            strokeWidth={2.4}
            progress={progress}
            color="#38bdf8"
          >
            <Droplet
              size={10}
              className={isLight ? "text-sky-600" : "text-[#38bdf8]"}
            />
          </CircularRingSvg>

          {!isCompact && (
            <div className="flex flex-col leading-[1.15] min-w-0 max-w-[100px]">
              <span className="text-[11.5px] font-bold text-white tabular-nums truncate">
                {litersText}
              </span>
              <span className="text-[10px] text-zinc-400 truncate">
                {ml >= targetMl
                  ? tx(lang, "Goal reached!", "Target tercapai!")
                  : tx(
                      lang,
                      `${Math.round(progress * 100)}% daily`,
                      `${Math.round(progress * 100)}% harian`
                    )}
              </span>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Water Tracker"
        moduleId="water_tracker"
        currentView={view}
        config={config}
        width={256}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <div className="text-[18px] font-bold text-white tabular-nums">
                {ml}{" "}
                <span className="text-[11px] text-zinc-400 font-normal">
                  / {targetMl} ml
                </span>
              </div>
              <div
                className={`text-[10.5px] truncate ${
                  isLight ? "text-sky-700" : "text-sky-400"
                }`}
              >
                {ml >= targetMl
                  ? tx(lang, "Daily hydration met!", "Hidrasi harian terpenuhi!")
                  : tx(
                      lang,
                      `${remainingMl} ml remaining today`,
                      `Kurang ${remainingMl} ml lagi hari ini`
                    )}
              </div>
            </div>
            <Tooltip
              content={tx(lang, "Reset today", "Reset hari ini")}
              side="top"
              isLightMode={isLight}
            >
              <button
                type="button"
                onClick={handleResetToday}
                className={`w-7 h-7 shrink-0 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer ${TRIGGER_FOCUS_RING}`}
              >
                <RotateCcw size={12} />
              </button>
            </Tooltip>
          </div>

          <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-300"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {[150, 250, 500].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => handleAddDrink(amt)}
                className={`min-w-0 px-1 py-1.5 rounded-[8px] border text-[11px] font-semibold flex items-center justify-center gap-0.5 transition-colors cursor-pointer ${TRIGGER_FOCUS_RING} ${
                  isLight
                    ? "bg-sky-600/15 hover:bg-sky-600/25 border-sky-600/35 text-sky-700"
                    : "bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/30 text-sky-300"
                }`}
              >
                <Plus size={11} className="shrink-0" />
                <span className="truncate">{amt}ml</span>
              </button>
            ))}
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
