import React from "react";
import { CheckSquare } from "lucide-react";
import { NavbarModuleContext } from "../types";
import { Tooltip } from "../../components/ui/Tooltip";

export const TodoNavbarModule: React.FC<NavbarModuleContext> = ({
  view,
  config,
  onOpenPanel,
}) => {
  return (
    <Tooltip side="top" delay={150} content="Daftar Tugas Cepat (To-Do)">
      <button
        type="button"
        onClick={() => onOpenPanel?.("todo")}
        className="h-8 px-2.5 rounded-[10px] bg-white/[0.08] hover:bg-white/[0.14] transition-all flex items-center gap-1.5 cursor-pointer text-white shrink-0 select-none"
      >
        <CheckSquare size={13} style={{ color: config.accent }} />
        <span className="text-[11.5px] font-medium truncate max-w-[110px]">
          {view === "full" ? "Tubes SIA BAB 1" : "3 tugas"}
        </span>
      </button>
    </Tooltip>
  );
};
