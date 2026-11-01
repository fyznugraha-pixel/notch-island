import React from "react";
import { Cpu } from "lucide-react";
import { NavbarModuleContext } from "../types";
import { useSharedSystemMetrics } from "../../services/systemMetricsService";
import { Tooltip } from "../../components/ui/Tooltip";

export const SystemNavbarModule: React.FC<NavbarModuleContext> = ({
  view,
  config,
  onOpenPanel,
}) => {
  const metrics = useSharedSystemMetrics();
  const cpu = Math.round(metrics?.cpu_usage ?? 0);
  const ram = Math.round(metrics?.mem_usage ?? 0);

  return (
    <Tooltip
      side="top"
      delay={150}
      content={`Beban Sistem: CPU ${cpu}%, RAM ${ram}%`}
    >
      <button
        type="button"
        onClick={() => onOpenPanel?.("system")}
        className="h-8 px-2.5 rounded-[10px] bg-white/[0.08] hover:bg-white/[0.14] transition-all flex items-center gap-1.5 cursor-pointer text-white shrink-0 select-none"
      >
        <Cpu size={13} style={{ color: config.accent }} />
        <span className="text-[11px] font-semibold tabular-nums">
          {view === "full" ? `CPU ${cpu}% · RAM ${ram}%` : `${cpu}%`}
        </span>
      </button>
    </Tooltip>
  );
};
