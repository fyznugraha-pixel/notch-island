import React, { useState, useEffect, useRef } from "react";
import { Eye, Play, RotateCcw } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, CircularRingSvg } from "./NavbarPopoverShell";

export const IstirahatMataNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [workSecsLeft, setWorkSecsLeft] = useState(14 * 60 + 20);
  const [restingSecs, setRestingSecs] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      if (restingSecs !== null) {
        setRestingSecs((r) => {
          if (r === null || r <= 1) {
            setWorkSecsLeft(20 * 60);
            return null;
          }
          return r - 1;
        });
      } else {
        setWorkSecsLeft((w) => (w <= 1 ? 20 * 60 : w - 1));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [restingSecs]);

  const mins = Math.floor(workSecsLeft / 60);
  const secs = workSecsLeft % 60;
  const label =
    restingSecs !== null
      ? `Rehat ${restingSecs}d`
      : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const progress =
    restingSecs !== null ? restingSecs / 20 : workSecsLeft / (20 * 60);

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
        title={`Istirahat Mata 20-20-20 (${label})`}
      >
        <CircularRingSvg
          size={24}
          strokeWidth={2.4}
          progress={progress}
          color="#f59e0b"
        >
          <Eye size={10} className="text-[#fbbf24]" />
        </CircularRingSvg>
        {!isCompact && (
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[11.5px] font-bold text-white tabular-nums">
              {label}
            </span>
            <span className="text-[10px] text-zinc-400">
              {restingSecs !== null ? "Lihat jauh 6m" : "Rehat 20-20-20"}
            </span>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Istirahat Mata (20-20-20)"
        moduleId="istirahat_mata"
        currentView={view}
        config={config}
        width={245}
      >
        <div className="flex flex-col gap-2.5">
          <div className="text-[11px] text-zinc-300 leading-relaxed">
            Setiap <strong>20 menit</strong> menatap layar, alihkan pandangan ke objek sejauh <strong>20 kaki (6m)</strong> selama <strong>20 detik</strong>.
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRestingSecs(20)}
              className="flex-1 h-8 rounded-[8px] bg-amber-500 hover:bg-amber-600 text-black text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
            >
              <Play size={12} />
              <span>
                {restingSecs !== null
                  ? `Istirahat (${restingSecs}d)...`
                  : "Mulai Rehat 20 Detik"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRestingSecs(null);
                setWorkSecsLeft(20 * 60);
              }}
              className="w-8 h-8 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 flex items-center justify-center cursor-pointer"
              title="Reset 20 menit"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
