import React, { useState, useEffect, useRef } from "react";
import { Cpu, Activity, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { useSharedSystemMetrics } from "../../services/systemMetricsService";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

interface ClearTempResult {
  freed_bytes: number;
  deleted_count: number;
  freed_formatted: string;
}

export const SystemNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const metrics = useSharedSystemMetrics();
  const cpu = metrics ? Math.round(metrics.cpu_usage) : null;
  const ram = metrics ? Math.round(metrics.mem_usage) : null;
  const [history, setHistory] = useState<number[]>([]);
  const [cleanMsg, setCleanMsg] = useState<string | null>(null);

  useEffect(() => {
    if (cpu === null) return;
    setHistory((prev) => {
      const next = [...prev, Math.max(4, Math.min(100, cpu))];
      return next.slice(-6);
    });
  }, [cpu]);

  const handleClearTemp = async () => {
    try {
      setCleanMsg(tx(lang, "Cleaning...", "Membersihkan..."));
      const res = await invoke<ClearTempResult>("clear_temp_files");
      setCleanMsg(
        res?.freed_formatted
          ? tx(lang, `Freed ${res.freed_formatted}`, `Bebas ${res.freed_formatted}`)
          : tx(lang, "Temp files cleared", "File temp dibersihkan")
      );
      setTimeout(() => setCleanMsg(null), 2500);
    } catch {
      setCleanMsg(null);
    }
  };

  const bars =
    history.length >= 6
      ? history
      : [...Array(6 - history.length).fill(cpu ?? 8), ...history];
  const cpuLabel = cpu !== null ? `${cpu}%` : "--";
  const ramLabel = ram !== null ? `${ram}%` : "--";
  const handleToggle = () => setIsOpen((v) => !v);
  const systemTitle = tx(lang, "System Monitor", "Pantau Sistem");

  return (
    <>
      <Tooltip
        content={`${systemTitle}: CPU ${cpuLabel} · RAM ${ramLabel}`}
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
            `${systemTitle}: CPU ${cpuLabel}, RAM ${ramLabel}`,
            isOpen
          )}
          className={`relative flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `${
                  isVertical ? "w-full max-w-full" : "w-10"
                } h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          {isCompact ? (
            <>
              <Cpu size={15} className="text-zinc-200" />
              <span className="absolute -top-1 -right-1 px-1 h-[15px] rounded-full bg-[#10b981] text-[9px] font-bold text-[#052e16] flex items-center justify-center shadow tabular-nums">
                {cpuLabel}
              </span>
            </>
          ) : (
            <>
              <div className="flex items-end gap-[2px] h-[15px] shrink-0">
                {bars.map((val, idx) => (
                  <i
                    key={idx}
                    style={{ height: `${Math.max(3, Math.round((val / 100) * 15))}px` }}
                    className={`w-[2.5px] rounded-[1px] transition-all duration-300 ${
                      idx === bars.length - 1 ? "bg-[#34d399]" : "bg-[#10b981]"
                    }`}
                  />
                ))}
              </div>
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[100px]">
                <span className="text-[11.5px] font-bold text-white tabular-nums truncate">
                  CPU {cpuLabel}
                </span>
                <span className="text-[10px] text-zinc-400 tabular-nums truncate">
                  RAM {ramLabel}
                </span>
              </div>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={systemTitle}
        moduleId="pantau_sistem"
        currentView={view}
        config={config}
        width={268}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
              <span className="text-zinc-300 truncate min-w-0 flex-1">
                CPU {metrics ? `(${metrics.cpu_speed_ghz} GHz)` : ""}
              </span>
              <span
                className={`font-bold tabular-nums shrink-0 ${
                  isLight ? "text-emerald-700" : "text-emerald-400"
                }`}
              >
                {cpuLabel}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-300"
                style={{ width: `${Math.min(100, cpu ?? 0)}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
              <span className="text-zinc-300 truncate min-w-0 flex-1">
                RAM{" "}
                {metrics
                  ? `(${metrics.mem_used_gb}/${metrics.mem_total_gb} GB)`
                  : ""}
              </span>
              <span
                className={`font-bold tabular-nums shrink-0 ${
                  isLight ? "text-sky-700" : "text-sky-400"
                }`}
              >
                {ramLabel}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-300"
                style={{ width: `${Math.min(100, ram ?? 0)}%` }}
              />
            </div>
          </div>

          {metrics?.top_process && (
            <div className="text-[10.5px] text-zinc-400 flex items-center justify-between gap-2 min-w-0">
              <span className="shrink-0">
                {tx(lang, "Top process", "Proses terberat")}
              </span>
              <span className="text-zinc-200 font-medium truncate min-w-0 flex-1 text-right">
                {metrics.top_process}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={handleClearTemp}
              className={`flex-1 min-w-0 h-7 px-2 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.11] text-[11px] text-zinc-200 flex items-center justify-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              <Trash2 size={11} className="shrink-0" />
              <span className="truncate">
                {cleanMsg || tx(lang, "Clean Temp", "Bersihkan Temp")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                invoke("trigger_task_manager").catch(() => {});
                setIsOpen(false);
              }}
              className={`h-7 px-2.5 shrink-0 rounded-[7px] text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING} ${
                isLight
                  ? "bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700"
                  : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
              }`}
            >
              <Activity size={11} className="shrink-0" />
              <span>Task Mgr</span>
            </button>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
