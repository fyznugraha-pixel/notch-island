import React from "react";
import { motion } from "framer-motion";
import { iosSpring } from "../../utils/iosMotion";
import { getWheelVerticalDirection } from "../../utils/gesture";

interface IosSliderProps {
  value: number;
  onChange: (value: number) => void;
  icon: React.ReactNode;
  label: string;
  fillColor?: string;
  iconActiveColor?: string;
  textActiveColor?: string;
  textInactiveColor?: string;
  actionButton?: React.ReactNode;
  showPercentage?: boolean;
}

/**
 * iOS 17/18 Control Center capsule slider.
 * Features a thick rounded module, white/accent progress fill,
 * adaptive percentage display in the exact center with split contrast clipping,
 * and adaptive glyph contrast when covered by the slider fill.
 */
export const IosSlider: React.FC<IosSliderProps> = ({
  value,
  onChange,
  icon,
  label,
  fillColor = "bg-white",
  iconActiveColor = "text-neutral-900",
  textActiveColor = "text-neutral-900",
  textInactiveColor = "text-white/75",
  actionButton,
  showPercentage = true,
}) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const [localVal, setLocalVal] = React.useState(value);

  React.useEffect(() => {
    if (!isDragging) {
      setLocalVal(value);
    }
  }, [value, isDragging]);

  const activeValue = isDragging ? localVal : value;
  const clampedValue = Math.max(0, Math.min(100, Math.round(activeValue)));
  const isGlyphCovered = clampedValue > 14;

  const handleWheel = (e: React.WheelEvent) => {
    // Tangkap scroll vertikal untuk adjust value. Biarkan scroll horizontal bubble agar bisa swipe tab.
    if (Math.abs(e.deltaY) < 1 || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    e.stopPropagation();
    const dir = getWheelVerticalDirection(e);
    const step = dir > 0 ? 2 : -2;
    const next = Math.max(0, Math.min(100, clampedValue + step));
    setLocalVal(next);
    onChange(next);
  };

  return (
    <div className="flex items-center gap-2 w-full" data-no-swipe="true">
      <motion.label
        whileTap={{ scale: 0.985 }}
        transition={iosSpring.snappy}
        data-no-swipe="true"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        className="relative flex-1 h-[34px] rounded-full bg-white/[0.12] overflow-hidden flex items-center cursor-pointer select-none group ring-1 ring-white/10"
      >
        <div
          className={`absolute inset-y-0 left-0 ${fillColor} ${
            isDragging ? "transition-none" : "transition-all duration-150 ease-out"
          }`}
          style={{ width: `${clampedValue}%` }}
        />

        {showPercentage && (
          <>
            {/* Unfilled text layer (over dark unfilled bar) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-[2]">
              <span className={`text-[11.5px] font-bold tracking-wider ${textInactiveColor} tabular-nums`}>
                {clampedValue}%
              </span>
            </div>

            {/* Filled text layer (over filled bar, clipped synchronously to progress) */}
            <div
              className={`absolute inset-0 flex items-center justify-center pointer-events-none select-none z-[3] ${
                isDragging ? "transition-none" : "transition-[clip-path] duration-150 ease-out"
              }`}
              style={{ clipPath: `inset(0 ${100 - clampedValue}% 0 0)` }}
            >
              <span className={`text-[11.5px] font-bold tracking-wider ${textActiveColor} tabular-nums`}>
                {clampedValue}%
              </span>
            </div>
          </>
        )}

        <div
          className={`relative z-10 pl-3 flex items-center pointer-events-none transition-colors duration-150 ${
            isGlyphCovered ? iconActiveColor : "text-white/90"
          }`}
        >
          {icon}
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={clampedValue}
          aria-label={label}
          data-no-swipe="true"
          onPointerDown={(e) => {
            e.stopPropagation();
            setIsDragging(true);
          }}
          onPointerUp={() => setIsDragging(false)}
          onPointerCancel={() => setIsDragging(false)}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const next = Number(e.target.value);
            setLocalVal(next);
            onChange(next);
          }}
          className="absolute inset-0 opacity-0 cursor-pointer z-20"
        />
      </motion.label>

      {actionButton && (
        <div className="shrink-0 flex items-center">
          {actionButton}
        </div>
      )}
    </div>
  );
};
