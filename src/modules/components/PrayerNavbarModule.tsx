import React, { useState, useEffect, useRef } from "react";
import { Moon } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

const PRAYERS = [
  { name: "Subuh", time: "04:32" },
  { name: "Dzuhur", time: "11:51" },
  { name: "Ashar", time: "15:12" },
  { name: "Maghrib", time: "17:54" },
  { name: "Isya", time: "19:04" },
];

export const PrayerNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const curMins = now.getHours() * 60 + now.getMinutes();

  const nextPrayer =
    PRAYERS.find((p) => {
      const [h, m] = p.time.split(":").map(Number);
      return h * 60 + m > curMins;
    }) || PRAYERS[0];

  const [nh, nm] = nextPrayer.time.split(":").map(Number);
  let diffMins = nh * 60 + nm - curMins;
  if (diffMins <= 0) diffMins += 1440;
  const diffLabel =
    diffMins < 60
      ? `-${diffMins}m`
      : `-${Math.floor(diffMins / 60)}j ${diffMins % 60}m`;

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
        title={`Waktu Sholat Berikutnya: ${nextPrayer.name} (${nextPrayer.time} · ${diffLabel})`}
      >
        <Moon size={15} className="text-[#fbbf24] shrink-0" />
        {!isCompact && (
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[11.5px] font-bold text-white">
              {nextPrayer.name} {nextPrayer.time}
            </span>
            <span className="text-[10px] text-[#fbbf24] tabular-nums">
              {diffLabel} lagi
            </span>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Jadwal Waktu Sholat"
        moduleId="waktu_sholat"
        currentView={view}
        config={config}
        width={235}
      >
        <div className="flex flex-col gap-1">
          {PRAYERS.map((p) => {
            const isNext = p.name === nextPrayer.name;
            return (
              <div
                key={p.name}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-[8px] text-[11.5px] ${
                  isNext
                    ? "bg-amber-500/20 border border-amber-500/40 text-amber-200 font-bold"
                    : "bg-white/[0.04] text-zinc-300"
                }`}
              >
                <span>{p.name}</span>
                <span className="font-mono tabular-nums">{p.time}</span>
              </div>
            );
          })}
        </div>
      </NavbarPopoverShell>
    </>
  );
};
