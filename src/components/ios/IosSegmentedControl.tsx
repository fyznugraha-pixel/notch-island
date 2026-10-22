import { useId } from "react";
import { motion } from "framer-motion";
import { iosSpring } from "../../utils/iosMotion";
import { Tooltip } from "../ui/Tooltip";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  tooltip?: string;
}

interface IosSegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function IosSegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  className = "",
}: IosSegmentedControlProps<T>) {
  const groupId = useId();

  return (
    <div
      className={`relative inline-flex items-center bg-black/50 p-[3px] rounded-[10px] border border-white/10 shrink-0 select-none ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        const buttonNode = (
          <button
            key={String(opt.value)}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(opt.value);
            }}
            className={`relative px-2.5 py-1 text-[11px] font-medium rounded-[7px] transition-colors duration-150 z-10 cursor-pointer ${
              isActive ? "text-white font-semibold" : "text-white/50 hover:text-white/80"
            }`}
          >
            {isActive && (
              <motion.div
                layoutId={`ios-segment-pill-${groupId}`}
                transition={iosSpring.snappy}
                className="absolute inset-0 bg-white/20 rounded-[7px] shadow-[0_1px_3px_rgba(0,0,0,0.3)] border border-white/15 -z-10"
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );

        if (opt.tooltip) {
          return (
            <Tooltip key={String(opt.value)} content={opt.tooltip} side="top">
              {buttonNode}
            </Tooltip>
          );
        }

        return buttonNode;
      })}
    </div>
  );
}
