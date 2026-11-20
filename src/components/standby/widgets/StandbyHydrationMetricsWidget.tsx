import React, { useEffect, useState } from "react";
import { Cpu, Droplets, Plus } from "lucide-react";
import { StandbyPalette } from "../standbyTheme";
import { Language } from "../../../services/i18n";
import { getDailyIntake, loadWaterData, logDrink } from "../../../services/waterService";
import { SystemMetrics, subscribeToSystemMetrics } from "../../../services/systemMetricsService";

interface StandbyHydrationMetricsWidgetProps {
  mode: "hydration" | "system";
  palette: StandbyPalette;
  language: Language;
}

export const StandbyHydrationMetricsWidget: React.FC<StandbyHydrationMetricsWidgetProps> = ({
  mode,
  palette,
  language,
}) => {
  const isId = language === "id";
  const [waterTick, setWaterTick] = useState(0);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  useEffect(() => {
    if (mode !== "system") return;
    return subscribeToSystemMetrics(setMetrics);
  }, [mode]);

  if (mode === "hydration") {
    const waterData = loadWaterData();
    const daily = getDailyIntake(new Date(), waterData);
    const pct = daily.percent;
    const cupMl = waterData.settings.defaultCupMl || 250;

    return (
      <div className="flex flex-col justify-between w-full h-full px-3 sm:px-5 py-2 select-none overflow-hidden">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.08em]" style={{ color: palette.night ? palette.textPrimary : "#32ade6" }}>
            <Droplets size={15} />
            <span>{isId ? "Hidrasi Hari Ini" : "Daily Hydration"}</span>
          </div>
          <span className="text-[13.5px] font-semibold tabular-nums" style={{ color: palette.textSecondary }}>
            {pct}%
          </span>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 my-auto">
          <span
            className="font-bold tracking-tight tabular-nums leading-none"
            style={{
              color: palette.textPrimary,
              fontSize: "clamp(44px, min(5.5vw, 9.5vh), 80px)",
            }}
          >
            {daily.totalL.toFixed(2)}
          </span>
          <span
            className="font-semibold"
            style={{
              color: palette.textSecondary,
              fontSize: "clamp(15px, min(1.6vw, 2.8vh), 22px)",
            }}
          >
            / {daily.targetL.toFixed(1)} L
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 shrink-0">
          <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: palette.mutedChipBg }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                backgroundColor: palette.night ? palette.textPrimary : "#32ade6",
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              logDrink(cupMl);
              setWaterTick((n) => n + 1);
            }}
            data-water-tick={waterTick}
            className="px-4 py-2 rounded-full text-[13px] font-semibold flex items-center gap-1 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
            style={{
              backgroundColor: palette.night ? palette.textPrimary : "#32ade6",
              color: "#000000",
            }}
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>{cupMl}ml</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between w-full h-full px-3 sm:px-5 py-2 select-none overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.08em]" style={{ color: palette.night ? palette.textPrimary : "#30d158" }}>
          <Cpu size={15} />
          <span>{isId ? "Performa Sistem" : "System Telemetry"}</span>
        </div>
        {metrics && (
          <span className="text-[13px] font-medium tabular-nums" style={{ color: palette.textSecondary }}>
            {metrics.cpu_speed_ghz.toFixed(1)} GHz
          </span>
        )}
      </div>

      {!metrics ? (
        <div className="my-auto text-[15px] font-medium" style={{ color: palette.textSecondary }}>
          {isId ? "Membaca sensor sistem..." : "Reading live system metrics..."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6 my-auto pt-2">
          <div className="min-w-0">
            <span className="text-[12.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: palette.textSecondary }}>
              CPU
            </span>
            <div
              className="font-bold tabular-nums leading-tight mt-1"
              style={{
                color: palette.textPrimary,
                fontSize: "clamp(38px, min(4.6vw, 8vh), 68px)",
              }}
            >
              {Math.round(metrics.cpu_usage)}%
            </div>
          </div>
          <div className="min-w-0">
            <span className="text-[12.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: palette.textSecondary }}>
              RAM
            </span>
            <div
              className="font-bold tabular-nums leading-tight mt-1"
              style={{
                color: palette.textPrimary,
                fontSize: "clamp(38px, min(4.6vw, 8vh), 68px)",
              }}
            >
              {Math.round(metrics.mem_usage)}%
            </div>
            <div className="text-[13.5px] tabular-nums mt-1 truncate" style={{ color: palette.textSecondary }}>
              {metrics.mem_used_gb.toFixed(1)} / {metrics.mem_total_gb.toFixed(0)} GB
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
