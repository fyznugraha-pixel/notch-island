import React from "react";
import { Calendar } from "lucide-react";
import { NavbarModuleContext } from "../types";
import { Tooltip } from "../../components/ui/Tooltip";

export const EventNavbarModule: React.FC<NavbarModuleContext> = ({
  view,
  config,
}) => {
  return (
    <Tooltip side="top" delay={150} content="Acara Berikutnya: 14:00 Rapat tim">
      <div className="h-8 px-2.5 rounded-[10px] bg-white/[0.08] hover:bg-white/[0.14] transition-all flex items-center gap-1.5 cursor-pointer text-white shrink-0 select-none">
        <Calendar size={13} style={{ color: config.accent }} />
        <span className="text-[11.5px] font-medium truncate max-w-[120px]">
          {view === "full" ? "14:00 Rapat tim" : "14:00"}
        </span>
      </div>
    </Tooltip>
  );
};
