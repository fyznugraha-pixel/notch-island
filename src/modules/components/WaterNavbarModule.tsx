import React, { useState, useEffect, useRef } from "react";
import { Droplet, Plus, RotateCcw } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, CircularRingSvg } from "./NavbarPopoverShell";

const WATER_KEY = "gili_water_log";

export const WaterNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [ml, setMl] = useState(1200);
  const targetMl = 2000;

  const loadWater = () => {
    try {
      const raw = localStorage.getItem(WATER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const today = new Date().toISOString().slice(0, 10);
        if (parsed.date === today && typeof parsed.amount === "number") {
          setMl(parsed.amount);
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadWater();
  }, []);

  const updateWater = (nextAmount: number) => {
    const clamped = Math.max(0, nextAmount);
    setMl(clamped);
    try {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem(
        WATER_KEY,
        JSON.stringify({ date: today, amount: clamped })
      );
    } catch {}
  };

  const progress = Math.min(1, ml / targetMl);
  const litersText = `${(ml / 1000).toFixed(1).replace(".", ",")} / 2 L`;

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
        title={`Water Tracker: ${ml} / ${targetMl} ml`}
      >
        <CircularRingSvg
          size={24}
          strokeWidth={2.4}
          progress={progress}
          color="#38bdf8"
        >
          <Droplet size={10} className="text-[#38bdf8]" />
        </CircularRingSvg>

        {!isCompact && (
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[11.5px] font-bold text-white tabular-nums">
              {litersText}
            </span>
            <span className="text-[10px] text-zinc-400">
              {ml >= targetMl ? "Target tercapai!" : `${Math.round(progress * 100)}% harian`}
            </span>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Water Tracker"
        moduleId="water_tracker"
        currentView={view}
        config={config}
        width={240}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[18px] font-bold text-white tabular-nums">
                {ml} <span className="text-[11px] text-zinc-400 font-normal">/ {targetMl} ml</span>
              </div>
              <div className="text-[10.5px] text-sky-400">
                {ml >= targetMl
                  ? "Hidrasi harian terpenuhi!"
                  : `Kurang ${targetMl - ml} ml lagi hari ini`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => updateWater(0)}
              className="w-7 h-7 rounded-[8px] bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
              title="Reset hari ini"
            >
              <RotateCcw size={12} />
            </button>
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
                onClick={() => updateWater(ml + amt)}
                className="py-1.5 rounded-[8px] bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-[11px] font-semibold flex items-center justify-center gap-0.5 transition-colors cursor-pointer"
              >
                <Plus size={11} />
                <span>{amt}ml</span>
              </button>
            ))}
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
