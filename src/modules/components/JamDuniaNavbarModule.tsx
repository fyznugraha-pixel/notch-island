import React, { useState, useEffect, useRef } from "react";
import { Globe } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

const ZONES = [
  { code: "JKT", name: "Jakarta", tz: "Asia/Jakarta" },
  { code: "TYO", name: "Tokyo", tz: "Asia/Tokyo" },
  { code: "LON", name: "London", tz: "Europe/London" },
  { code: "NYC", name: "New York", tz: "America/New_York" },
  { code: "SYD", name: "Sydney", tz: "Australia/Sydney" },
];

export const JamDuniaNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  const [pairIdx, setPairIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const fmt = (tz: string) => {
    try {
      return now.toLocaleTimeString("id-ID", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).replace(".", ":");
    } catch {
      return "12:00";
    }
  };

  const z1 = ZONES[pairIdx % ZONES.length];
  const z2 = ZONES[(pairIdx + 1) % ZONES.length];

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
        title={`Jam Dunia: ${z1.name} ${fmt(z1.tz)} · ${z2.name} ${fmt(z2.tz)}`}
      >
        {isCompact ? (
          <Globe size={15} className="text-zinc-200" />
        ) : (
          <>
            <div className="flex flex-col leading-[1.15]">
              <span className="text-[11px] font-bold text-white tabular-nums">
                {z1.code} {fmt(z1.tz)}
              </span>
              <span className="text-[9.5px] text-zinc-400">WIB</span>
            </div>
            <span className="w-[1px] h-[18px] bg-zinc-700" />
            <div className="flex flex-col leading-[1.15]">
              <span className="text-[11px] font-bold text-white tabular-nums">
                {z2.code} {fmt(z2.tz)}
              </span>
              <span className="text-[9.5px] text-zinc-400">{z2.name}</span>
            </div>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Jam Dunia"
        moduleId="jam_dunia"
        currentView={view}
        config={config}
        width={245}
      >
        <div className="flex flex-col gap-1.5">
          {ZONES.map((z, idx) => (
            <button
              key={z.code}
              type="button"
              onClick={() => setPairIdx(idx)}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-[8px] text-[11.5px] cursor-pointer transition-colors ${
                idx === pairIdx % ZONES.length ||
                idx === (pairIdx + 1) % ZONES.length
                  ? "bg-[#3882F6]/15 text-white border border-[#3882F6]/35"
                  : "bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
              }`}
            >
              <span>
                <strong className="text-sky-400 mr-1.5">{z.code}</strong>
                {z.name}
              </span>
              <span className="font-mono font-bold tabular-nums">
                {fmt(z.tz)}
              </span>
            </button>
          ))}
        </div>
      </NavbarPopoverShell>
    </>
  );
};
