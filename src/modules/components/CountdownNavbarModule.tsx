import React, { useState, useRef } from "react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, CircularRingSvg } from "./NavbarPopoverShell";

const COUNTDOWN_KEY = "gili_countdown_v1";

interface CountdownConfig {
  title: string;
  targetDate: string; // YYYY-MM-DD
}

export const CountdownNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<CountdownConfig>(() => {
    try {
      const raw = localStorage.getItem(COUNTDOWN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.title && parsed.targetDate) return parsed;
      }
    } catch {}
    const d = new Date();
    d.setDate(d.getDate() + 12);
    return {
      title: "UAS Sistem Basis Data",
      targetDate: d.toISOString().slice(0, 10),
    };
  });

  const save = (next: CountdownConfig) => {
    setData(next);
    try {
      localStorage.setItem(COUNTDOWN_KEY, JSON.stringify(next));
    } catch {}
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${data.targetDate}T00:00:00`);
  const diffDays = Math.max(
    0,
    Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  );
  const progress = Math.max(0.1, Math.min(1, 1 - diffDays / 30));

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
        title={`${data.title}: ${diffDays} hari lagi`}
      >
        {isCompact ? (
          <span className="text-[12px] font-extrabold text-[#f472b6] tabular-nums">
            {diffDays}h
          </span>
        ) : (
          <>
            <CircularRingSvg
              size={24}
              strokeWidth={2.4}
              progress={progress}
              color="#ec4899"
            >
              <span className="text-[9.5px] font-bold text-[#f9a8d4] tabular-nums">
                {diffDays}
              </span>
            </CircularRingSvg>
            <div className="flex flex-col leading-[1.15] min-w-0">
              <span className="text-[11.5px] font-semibold text-white truncate max-w-[125px]">
                {data.title}
              </span>
              <span className="text-[10px] text-[#f472b6]">
                {diffDays === 0 ? "Hari ini!" : `${diffDays} hari lagi`}
              </span>
            </div>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Hitung Mundur"
        moduleId="hitung_mundur"
        currentView={view}
        config={config}
        width={260}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] text-zinc-400">Nama Target / Ujian</label>
            <input
              type="text"
              value={data.title}
              onChange={(e) => save({ ...data, title: e.target.value })}
              className="h-8 px-2.5 rounded-[8px] bg-white/[0.06] border border-white/[0.1] text-[11.5px] text-white outline-none focus:border-pink-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] text-zinc-400">Tanggal Target</label>
            <input
              type="date"
              value={data.targetDate}
              onChange={(e) => save({ ...data, targetDate: e.target.value })}
              className="h-8 px-2.5 rounded-[8px] bg-white/[0.06] border border-white/[0.1] text-[11.5px] text-white outline-none focus:border-pink-500"
            />
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
