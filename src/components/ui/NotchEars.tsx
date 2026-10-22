import React from "react";
import { motion } from "framer-motion";
import { iosSpring } from "../../utils/iosMotion";

interface NotchEarsProps {
  position?: "top" | "bottom";
  opacity?: number | string;
  isExpanded?: boolean;
  isLightMode?: boolean;
}

export const NotchEars: React.FC<NotchEarsProps> = ({
  position = "top",
  opacity = 1.0,
  isExpanded = false,
  isLightMode = false,
}) => {
  const isBot = position === "bottom";
  const numOpacity = typeof opacity === "string" ? parseFloat(opacity) : (opacity ?? 1.0);
  const r = isExpanded ? 24 : 14;
  const offset = -(r - 0.5);

  // Harus sinkron dengan tier bg pill di App.tsx + override light mode di index.css
  const earAlpha = isLightMode
    ? numOpacity >= 0.95 ? 0.96 : numOpacity >= 0.75 ? 0.88 : 0.75
    : numOpacity >= 0.95 ? 1 : numOpacity >= 0.75 ? 0.8 : 0.6;
  const earFill = isLightMode
    ? `rgba(246, 246, 250, ${earAlpha})`
    : `rgba(0, 0, 0, ${earAlpha})`;

  const earStroke = isLightMode
    ? "rgba(0, 0, 0, 0.08)"
    : "transparent";

  if (isBot) {
    return (
      <>
        {/* Left ear (bottom-left) - lekukan kedalam */}
        <motion.div
          initial={false}
          animate={{ width: r, height: r, left: offset }}
          transition={iosSpring.smooth}
          className="absolute pointer-events-none z-20 overflow-visible"
          style={{ bottom: 0 }}
        >
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full block overflow-visible"
            preserveAspectRatio="none"
          >
            <path
              d="M 100 100 V 0 A 100 100 0 0 1 0 100 Z"
              fill={earFill}
              className="notch-ear-fill"
            />
            <path
              d="M 100 0 A 100 100 0 0 1 0 100"
              fill="none"
              stroke={earStroke}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              className="notch-ear-stroke"
            />
          </svg>
        </motion.div>

        {/* Right ear */}
        <motion.div
          initial={false}
          animate={{ width: r, height: r, right: offset }}
          transition={iosSpring.smooth}
          className="absolute pointer-events-none z-20 overflow-visible"
          style={{ bottom: 0 }}
        >
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full block overflow-visible"
            preserveAspectRatio="none"
          >
            <path
              d="M 0 100 V 0 A 100 100 0 0 0 100 100 Z"
              fill={earFill}
              className="notch-ear-fill"
            />
            <path
              d="M 0 0 A 100 100 0 0 0 100 100"
              fill="none"
              stroke={earStroke}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              className="notch-ear-stroke"
            />
          </svg>
        </motion.div>
      </>
    );
  }

  return (
    <>
      {/* Left ear (top-left) - lekukan kedalam */}
      <motion.div
        initial={false}
        animate={{ width: r, height: r, left: offset }}
        transition={iosSpring.smooth}
        className="absolute pointer-events-none z-20 overflow-visible"
        style={{ top: 0 }}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full block overflow-visible"
          preserveAspectRatio="none"
        >
          <path
            d="M 0 0 A 100 100 0 0 1 100 100 V 0 H 0 Z"
            fill={earFill}
            className="notch-ear-fill"
          />
          <path
            d="M 0 0 A 100 100 0 0 1 100 100"
            fill="none"
            stroke={earStroke}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            className="notch-ear-stroke"
          />
        </svg>
      </motion.div>

      {/* Right ear (top-right) - lekukan kedalam */}
      <motion.div
        initial={false}
        animate={{ width: r, height: r, right: offset }}
        transition={iosSpring.smooth}
        className="absolute pointer-events-none z-20 overflow-visible"
        style={{ top: 0 }}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full block overflow-visible"
          preserveAspectRatio="none"
        >
          <path
            d="M 0 0 H 100 A 100 100 0 0 0 0 100 Z"
            fill={earFill}
            className="notch-ear-fill"
          />
          <path
            d="M 100 0 A 100 100 0 0 0 0 100"
            fill="none"
            stroke={earStroke}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            className="notch-ear-stroke"
          />
        </svg>
      </motion.div>
    </>
  );
};
