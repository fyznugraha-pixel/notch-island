import React, { useState, useEffect, useRef, useCallback } from "react";
import { Cpu } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

interface GpuTelemetry {
  name: string;
  usage_pct: number | null;
  temp_c: number | null;
  vram_used_gb: number | null;
  vram_total_gb: number | null;
  fan_pct: number | null;
  source: string;
}

export const GpuTempNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const [gpu, setGpu] = useState<GpuTelemetry | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  const loadGpu = useCallback(async () => {
    try {
      const data = await invoke<GpuTelemetry>("get_gpu_telemetry");
      setGpu(data);
      if (typeof data?.usage_pct === "number") {
        setHistory((prev) => [
          ...prev.slice(-5),
          Math.max(4, Math.min(100, data.usage_pct!)),
        ]);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadGpu();
    const id = setInterval(loadGpu, 5000);
    return () => clearInterval(id);
  }, [loadGpu]);

  const handleToggle = () => {
    if (!isOpen) loadGpu();
    setIsOpen((v) => !v);
  };

  const loadLabel =
    typeof gpu?.usage_pct === "number" ? `${gpu.usage_pct}%` : "N/A";
  const tempLabel =
    typeof gpu?.temp_c === "number" ? `${gpu.temp_c}°C` : "N/A";
  const fanLabel =
    typeof gpu?.fan_pct === "number" ? `${gpu.fan_pct}%` : "Auto";
  const vramLabel =
    gpu?.vram_used_gb !== null && gpu?.vram_total_gb !== null && gpu
      ? `${gpu.vram_used_gb}/${gpu.vram_total_gb} GB`
      : gpu?.vram_total_gb !== null && gpu
      ? `${gpu.vram_total_gb} GB`
      : "N/A";

  const bars =
    history.length >= 6
      ? history
      : [...Array(6 - history.length).fill(gpu?.usage_pct ?? 8), ...history];

  const triggerTip = tx(
    lang,
    `${gpu?.name || "GPU"} · Load ${loadLabel} · Temp ${tempLabel}`,
    `${gpu?.name || "GPU"} · Beban ${loadLabel} · Suhu ${tempLabel}`
  );

  return (
    <>
      <Tooltip
        content={triggerTip}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : ""}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            tx(
              lang,
              `GPU ${gpu?.name || ""}: Load ${loadLabel}, Temp ${tempLabel}`,
              `GPU ${gpu?.name || ""}: Beban ${loadLabel}, Suhu ${tempLabel}`
            ),
            isOpen
          )}
          className={`relative flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? isVertical
                ? "gili-mod-compact gili-mod-vertical justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
                : "gili-mod-compact justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
              : "gili-mod-pill px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          {isCompact ? (
            <>
              <Cpu size={15} className="text-[#fb923c]" />
              <span className="gili-mod-badge absolute top-[1px] right-[1px] px-1 h-[14px] rounded-full bg-[#f97316] text-[8.5px] font-bold text-[#ffffff] flex items-center justify-center tabular-nums pointer-events-none">
                {typeof gpu?.temp_c === "number" ? `${gpu.temp_c}°` : loadLabel}
              </span>
            </>
          ) : (
            <>
              <div className="flex items-end gap-[2px] h-[15px] shrink-0">
                {bars.map((val, idx) => (
                  <i
                    key={idx}
                    style={{ height: `${Math.max(3, Math.round((val / 100) * 15))}px` }}
                    className={`w-[2.5px] rounded-[1px] ${
                      idx === bars.length - 1 ? "bg-[#fb923c]" : "bg-[#f97316]"
                    }`}
                  />
                ))}
              </div>
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[130px]">
                <span className="text-[11.5px] font-bold text-white tabular-nums truncate">
                  GPU {loadLabel}
                </span>
                <span className="text-[10px] text-[#fb923c] tabular-nums truncate">
                  {tempLabel} · VRAM {vramLabel}
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
        title={gpu?.name || tx(lang, "GPU Temp & Performance", "Suhu & Performa GPU")}
        moduleId="gpu_suhu"
        currentView={view}
        config={config}
        width={268}
      >
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="min-w-0 overflow-hidden px-1.5 py-2 rounded-[8px] bg-white/[0.04]">
              <div className="text-[10px] text-zinc-400">{tx(lang, "Load", "Beban")}</div>
              <div className="text-[12.5px] font-bold text-white tabular-nums truncate">
                {loadLabel}
              </div>
            </div>
            <div className="min-w-0 overflow-hidden px-1.5 py-2 rounded-[8px] bg-white/[0.04]">
              <div className="text-[10px] text-zinc-400">{tx(lang, "Temp", "Suhu")}</div>
              <div className="text-[12.5px] font-bold text-orange-400 tabular-nums truncate">
                {tempLabel}
              </div>
            </div>
            <div className="min-w-0 overflow-hidden px-1.5 py-2 rounded-[8px] bg-white/[0.04]">
              <div className="text-[10px] text-zinc-400">{tx(lang, "Fan", "Kipas")}</div>
              <div className="text-[12.5px] font-bold text-amber-300 tabular-nums truncate">
                {fanLabel}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[10.5px] text-zinc-400 px-1 min-w-0">
            <span className="shrink-0">VRAM</span>
            <span className="text-zinc-200 font-medium tabular-nums truncate">
              {vramLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              invoke("trigger_task_manager").catch(() => {});
              setIsOpen(false);
            }}
            className={`w-full h-7 px-2.5 truncate rounded-[7px] bg-orange-500/20 hover:bg-orange-500/30 text-orange-200 text-[11px] font-semibold cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            {tx(lang, "Open Task Manager Graph", "Buka Grafik Task Manager")}
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
