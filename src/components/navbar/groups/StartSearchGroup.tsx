import React from "react";
import { Search } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Tooltip } from "../../ui/Tooltip";

interface StartSearchGroupProps {
  iconSize?: number;
}

export const StartSearchGroup: React.FC<StartSearchGroupProps> = ({
  iconSize = 40,
}) => {
  const handleStartClick = async () => {
    try {
      await invoke("trigger_start_menu");
    } catch {}
  };

  const handleSearchClick = async () => {
    try {
      await invoke("trigger_windows_search");
    } catch {}
  };

  const btnStyle: React.CSSProperties = {
    width: `${iconSize}px`,
    height: `${iconSize}px`,
  };

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {/* Start Button */}
      <Tooltip side="top" delay={150} content="Start">
        <button
          type="button"
          onClick={handleStartClick}
          aria-label="Start"
          style={btnStyle}
          className="rounded-[12px] bg-transparent flex items-center justify-center p-0 cursor-pointer shrink-0 transition-transform active:scale-95 hover:bg-white/[0.08]"
        >
          <img
            src="/logo/LOGO-GILI.png"
            alt="Start"
            draggable={false}
            className="w-5 h-5 object-contain brightness-0 invert opacity-90 transition-opacity hover:opacity-100"
          />
        </button>
      </Tooltip>

      {/* Search Button */}
      <Tooltip side="top" delay={150} content="Search">
        <button
          type="button"
          onClick={handleSearchClick}
          aria-label="Search"
          style={btnStyle}
          className="rounded-[12px] bg-transparent text-white/60 hover:text-white flex items-center justify-center p-0 cursor-pointer shrink-0 transition-all active:scale-95 hover:bg-white/[0.08]"
        >
          <Search size={17} strokeWidth={1.8} />
        </button>
      </Tooltip>
    </div>
  );
};
