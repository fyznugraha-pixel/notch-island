import React from "react";
import { Timer } from "lucide-react";
import { NavbarModuleContext } from "../types";
import { Tooltip } from "../../components/ui/Tooltip";

export const PomodoroNavbarModule: React.FC<NavbarModuleContext> = ({
  view,
  config,
  onOpenPanel,
}) => {
  return (
    <Tooltip side="top" delay={150} content="Pomodoro: Fokus 25 menit">
      <button
        type="button"
        onClick={() => onOpenPanel?.("pomodoro")}
        className="h-8 px-2.5 rounded-[10px] bg-white/[0.08] hover:bg-white/[0.14] transition-all flex items-center gap-1.5 cursor-pointer text-white shrink-0 select-none"
      >
        <Timer size={13} style={{ color: config.accent }} />
        <span className="text-[11.5px] font-semibold tabular-nums">25:00</span>
        {view === "full" && (
          <span className="text-[10px] text-white/50 pl-0.5 font-normal">Fokus 1/4</span>
        )}
      </button>
    </Tooltip>
  );
};

