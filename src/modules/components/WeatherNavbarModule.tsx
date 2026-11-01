import React from "react";
import { CloudSun } from "lucide-react";
import { NavbarModuleContext } from "../types";
import { Tooltip } from "../../components/ui/Tooltip";

export const WeatherNavbarModule: React.FC<NavbarModuleContext> = ({
  view,
  config,
}) => {
  return (
    <Tooltip side="top" delay={150} content="Cuaca: 28°C Cerah Berawan">
      <div className="h-8 px-2.5 rounded-[10px] bg-white/[0.08] hover:bg-white/[0.14] transition-all flex items-center gap-1.5 cursor-pointer text-white shrink-0 select-none">
        <CloudSun size={13} style={{ color: config.accent }} />
        <span className="text-[11px] font-semibold tabular-nums">28°C</span>
        {view === "full" && (
          <span className="text-[10px] text-white/50 pl-0.5">Cerah</span>
        )}
      </div>
    </Tooltip>
  );
};

