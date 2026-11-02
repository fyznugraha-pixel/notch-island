import React, { useState, useEffect, useRef } from "react";
import { Cpu, Activity, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { useSharedSystemMetrics } from "../../services/systemMetricsService";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

export const SystemNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const metrics = useSharedSystemMetrics();
  const cpu = Math.round(metrics?.cpu_usage ?? 24);
  const ram = Math.round(metrics?.mem_usage ?? 58);
  const [history, setHistory] = useState<number[]>([22, 34, 28, 45, 38, 34]);
  const [cleanMsg, setCleanMsg] = useState<string | null>(null);

  useEffect(() => {
    setHistory((prev) => [...prev.slice(-5), Math.max(12, Math.min(100, cpu))]);
  }, [cpu]);

  const handleClearTemp = async () => {
    try {
      setCleanMsg("Membersihkan...");
      await invoke("clear_temp_files");
      setCleanMsg("File temp dibersihkan!");
      setTimeout(() => setCleanMsg(null), 2000);
    } catch {
      setCleanMsg(null);
    }
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
        title={`Pantau Sistem: CPU ${cpu}% · RAM ${ram}%`}
      >
        {isCompact ? (
          <>
            <Cpu size={15} className="text-zinc-200" />
            <span className="absolute -top-1 -right-1 px-1 h-[15px] rounded-full bg-[#10b981] text-[9px] font-bold text-[#052e16] flex items-center justify-center shadow">
              {cpu}%
            </span>
          </>
        ) : (
          <>
            <div className="flex items-end gap-[2px] h-[15px]">
              {history.map((val, idx) => (
                <i
                  key={idx}
                  style={{ height: `${Math.max(3, Math.round((val / 100) * 15))}px` }}
                  className={`w-[2.5px] rounded-[1px] transition-all duration-300 ${
                    idx === history.length - 1 ? "bg-[#34d399]" : "bg-[#10b981]"
                  }`}
                />
              ))}
            </div>
            <div className="flex flex-col leading-[1.15]">
              <span className="text-[11.5px] font-bold text-white tabular-nums">
                CPU {cpu}%
              </span>
              <span className="text-[10px] text-zinc-400 tabular-nums">
                RAM {ram}%
              </span>
            </div>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Pantau Sistem"
        moduleId="pantau_sistem"
        currentView={view}
        config={config}
        width={255}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-400">Beban CPU</span>
              <span className="font-bold text-emerald-400 tabular-nums">{cpu}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-300"
                style={{ width: `${Math.min(100, cpu)}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-400">Penggunaan RAM</span>
              <span className="font-bold text-sky-400 tabular-nums">{ram}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-300"
                style={{ width: `${Math.min(100, ram)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={handleClearTemp}
              className="flex-1 h-7 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.11] text-[11px] text-zinc-200 flex items-center justify-center gap-1 cursor-pointer"
            >
              <Trash2 size={11} />
              <span>{cleanMsg || "Bersihkan Temp"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                invoke("trigger_task_manager").catch(() => {});
                setIsOpen(false);
              }}
              className="h-7 px-2.5 rounded-[7px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Activity size={11} />
              <span>Task Mgr</span>
            </button>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
