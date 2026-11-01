import React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { NavbarModuleContext } from "../types";
import { useSharedSystemMetrics } from "../../services/systemMetricsService";
import { Tooltip } from "../../components/ui/Tooltip";

export const NetNavbarModule: React.FC<NavbarModuleContext> = ({
  view,
  config,
}) => {
  const metrics = useSharedSystemMetrics();
  const downMb = (metrics?.wifi_down_mbps ?? 0).toFixed(1);
  const upMb = (metrics?.wifi_up_mbps ?? 0).toFixed(1);

  return (
    <Tooltip
      side="top"
      delay={150}
      content={`Kecepatan Jaringan: Unduh ${downMb} Mbps, Unggah ${upMb} Mbps`}
    >
      <div className="h-8 px-2.5 rounded-[10px] bg-white/[0.08] hover:bg-white/[0.14] transition-all flex items-center gap-1.5 cursor-pointer text-white shrink-0 select-none">
        <ArrowDown size={11} style={{ color: config.accent }} />
        <span className="text-[11px] font-semibold tabular-nums">
          {downMb}M
        </span>
        {view === "full" && (
          <>
            <ArrowUp size={11} className="text-white/40 ml-0.5" />
            <span className="text-[10px] text-white/50 tabular-nums">
              {upMb}M
            </span>
          </>
        )}
      </div>
    </Tooltip>
  );
};
