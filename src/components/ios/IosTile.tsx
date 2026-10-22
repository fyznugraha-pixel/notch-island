import React from "react";
import { motion } from "framer-motion";
import { iosSpring } from "../../utils/iosMotion";
import { Tooltip } from "../ui/Tooltip";

interface IosTileProps {
  icon: React.ReactNode;
  label?: string;
  sublabel?: React.ReactNode;
  isActive?: boolean;
  activeColor?: string;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  tooltip?: string;
  tooltipSide?: "top" | "bottom" | "left" | "right";
  className?: string;
  children?: React.ReactNode;
}

export const IosTile: React.FC<IosTileProps> = ({
  icon,
  label,
  sublabel,
  isActive = false,
  activeColor = "bg-ios-blue text-white shadow-[0_0_12px_rgba(10,132,255,0.4)]",
  onClick,
  onContextMenu,
  tooltip,
  tooltipSide = "bottom",
  className = "",
  children,
}) => {
  const content = (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      transition={iosSpring.press}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group relative flex items-center gap-2 p-2 rounded-[18px] bg-white/[0.06] hover:bg-white/[0.12] active:bg-white/[0.16] border border-white/5 transition-colors cursor-pointer select-none text-left min-w-0 ${className}`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${
          isActive ? activeColor : "bg-white/10 text-white/80 group-hover:text-white"
        }`}
      >
        {icon}
      </div>

      {(label || sublabel) && (
        <div className="flex flex-col min-w-0 overflow-hidden flex-1">
          {label && (
            <span className="text-[11px] font-semibold text-white leading-tight truncate tracking-tight">
              {label}
            </span>
          )}
          {sublabel && (
            <span className="text-[9.5px] font-medium text-ios-secondary leading-tight mt-0.5 truncate tracking-tight">
              {sublabel}
            </span>
          )}
        </div>
      )}

      {children}
    </motion.button>
  );

  if (tooltip) {
    return (
      <Tooltip content={tooltip} side={tooltipSide} wrapperClassName="w-full">
        {content}
      </Tooltip>
    );
  }

  return content;
};
