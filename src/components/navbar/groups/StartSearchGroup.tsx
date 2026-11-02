import React, { useState } from "react";
import { Search } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Tooltip } from "../../ui/Tooltip";

interface StartSearchGroupProps {
  iconSize?: number;
  accentColor?: string;
  isVertical?: boolean;
  onStartClick?: () => void;
  onSearchClick?: () => void;
}

export const StartSearchGroup: React.FC<StartSearchGroupProps> = ({
  iconSize = 40,
  isVertical = false,
  onStartClick,
  onSearchClick,
}) => {
  const [isStartHovered, setIsStartHovered] = useState(false);
  const [isSearchHovered, setIsSearchHovered] = useState(false);

  const handleStart = async () => {
    if (onStartClick) {
      onStartClick();
      return;
    }
    try {
      await invoke("trigger_start_menu");
    } catch {}
  };

  const handleSearch = async () => {
    if (onSearchClick) {
      onSearchClick();
      return;
    }
    try {
      await invoke("trigger_windows_search");
    } catch {}
  };

  const btnStyle: React.CSSProperties = {
    width: `${iconSize}px`,
    height: `${iconSize}px`,
    transition:
      "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease, color 180ms ease",
  };

  return (
    <div
      className={`flex ${
        isVertical ? "flex-col" : "flex-row"
      } items-center gap-0.5 shrink-0`}
    >
      {/* Start Button */}
      <Tooltip side="top" delay={150} content="Mulai">
        <button
          type="button"
          data-flyout-trigger="start"
          onClick={handleStart}
          onMouseEnter={() => setIsStartHovered(true)}
          onMouseLeave={() => setIsStartHovered(false)}
          aria-label="Mulai"
          style={{
            ...btnStyle,
            transform: isStartHovered
              ? "translate3d(0, -2px, 0) scale(1.07)"
              : undefined,
          }}
          className="rounded-[12px] bg-transparent hover:bg-white/[0.09] flex items-center justify-center p-0 cursor-pointer shrink-0 active:scale-95"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="w-[18px] h-[18px] fill-[#4cc2ff] transition-transform duration-200"
          >
            <path d="M1 1h10.2v10.2H1zM12.8 1H23v10.2H12.8zM1 12.8h10.2V23H1zM12.8 12.8H23V23H12.8z" />
          </svg>
        </button>
      </Tooltip>

      {/* Search Button */}
      <Tooltip side="top" delay={150} content="Cari">
        <button
          type="button"
          onClick={handleSearch}
          onMouseEnter={() => setIsSearchHovered(true)}
          onMouseLeave={() => setIsSearchHovered(false)}
          aria-label="Cari"
          style={{
            ...btnStyle,
            transform: isSearchHovered
              ? "translate3d(0, -2px, 0) scale(1.07)"
              : undefined,
          }}
          className="rounded-[12px] bg-transparent hover:bg-white/[0.09] text-white/65 hover:text-white flex items-center justify-center p-0 cursor-pointer shrink-0 active:scale-95"
        >
          <Search size={17} strokeWidth={1.8} />
        </button>
      </Tooltip>
    </div>
  );
};
