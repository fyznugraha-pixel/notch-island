import React, { useState, useRef } from "react";
import { Flame, Check } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

const STREAK_KEY = "gili_habit_streak_v2";

interface StreakData {
  count: number;
  habitName: string;
  lastCheckedDate: string;
}

export const StreakNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const [streak, setStreak] = useState<StreakData>(() => {
    try {
      const raw = localStorage.getItem(STREAK_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.count === "number") return parsed;
      }
    } catch {}
    return {
      count: 14,
      habitName: "Ngoding 1 jam",
      lastCheckedDate: "",
    };
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const checkedToday = streak.lastCheckedDate === todayStr;

  const saveStreak = (next: StreakData) => {
    setStreak(next);
    try {
      localStorage.setItem(STREAK_KEY, JSON.stringify(next));
    } catch {}
  };

  const handleCheckInToday = () => {
    if (checkedToday) return;
    saveStreak({
      ...streak,
      count: streak.count + 1,
      lastCheckedDate: todayStr,
    });
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`relative flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Streak: ${streak.count} hari (${streak.habitName})`}
      >
        <Flame size={16} className="text-[#fb923c] shrink-0" />
        {isCompact ? (
          <span className="absolute -top-1 -right-1 px-1.5 h-[16px] rounded-full bg-[#f97316] text-[9.5px] font-bold text-white flex items-center justify-center shadow">
            {streak.count}
          </span>
        ) : (
          <>
            <div className="flex flex-col leading-[1.15] min-w-0">
              <span className="text-[11.5px] font-bold text-white">
                {streak.count} hari
              </span>
              <span className="text-[10px] text-zinc-400 truncate max-w-[95px]">
                {streak.habitName}
              </span>
            </div>
            <div className="flex items-center gap-[3px] ml-0.5">
              {[0, 1, 2, 3, 4].map((idx) => (
                <span
                  key={idx}
                  className={`w-[5px] h-[5px] rounded-full ${
                    idx < 4 || checkedToday ? "bg-[#f97316]" : "bg-zinc-700"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Streak Kebiasaan"
        moduleId="streak_kebiasaan"
        currentView={view}
        config={config}
        width={250}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <label className="text-[10.5px] text-zinc-400">Kebiasaan Harian</label>
            <input
              type="text"
              value={streak.habitName}
              onChange={(e) =>
                saveStreak({ ...streak, habitName: e.target.value })
              }
              className="h-8 px-2.5 rounded-[8px] bg-white/[0.06] border border-white/[0.1] text-[11.5px] text-white outline-none focus:border-orange-500"
            />
          </div>

          <button
            type="button"
            onClick={handleCheckInToday}
            disabled={checkedToday}
            className={`h-8 rounded-[9px] text-[11.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              checkedToday
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "bg-[#f97316] hover:bg-[#ea580c] text-white"
            }`}
          >
            <Check size={13} />
            <span>
              {checkedToday
                ? "Sudah check-in hari ini!"
                : `Selesaikan Hari ke-${streak.count + 1}`}
            </span>
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
