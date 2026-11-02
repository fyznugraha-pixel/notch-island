import React, { useState, useEffect, useRef } from "react";
import { Sun } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

export const ProgresHariNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const totalMins = now.getHours() * 60 + now.getMinutes();
  const dayPct = Math.round((totalMins / 1440) * 100);
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
  );
  const yearPct = Math.round((dayOfYear / 365) * 100);

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
        title={`Progres Hari: ${dayPct}% hari ini berlalu`}
      >
        {isCompact ? (
          <Sun size={15} className="text-[#f472b6]" />
        ) : (
          <div className="flex flex-col gap-1 min-w-[92px]">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-semibold text-white">Hari ini</span>
              <span className="font-bold text-[#f472b6] tabular-nums">
                {dayPct}%
              </span>
            </div>
            <div className="w-full h-[5px] rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#f59e0b] to-[#ec4899]"
                style={{ width: `${dayPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Progres Waktu"
        moduleId="progres_hari"
        currentView={view}
        config={config}
        width={240}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-300">Hari Ini</span>
              <span className="font-bold text-pink-400">{dayPct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#f59e0b] to-[#ec4899]"
                style={{ width: `${dayPct}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-300">Tahun {now.getFullYear()}</span>
              <span className="font-bold text-amber-300">
                {yearPct}% ({dayOfYear}/365)
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${yearPct}%` }}
              />
            </div>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
