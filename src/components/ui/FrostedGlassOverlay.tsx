import React, { useId } from "react";
import { CalibratedGlassPalette } from "../../utils/frostedGlass";

interface FrostedGlassOverlayProps {
  palette: CalibratedGlassPalette;
  isLight: boolean;
  borderRadius?: string | number;
  position?: "top" | "bottom" | "left" | "right";
  showBevelBorder?: boolean;
  solidBorderColor?: string;
}

/**
 * Renders Notch-identical optical diffusion, 1:1 coarse matte noise ("buram kasar"),
 * top specular lustre, 1px rim glint, corner curve reflection, and crisp 1px optical bevel stroke.
 */
export const FrostedGlassOverlay: React.FC<FrostedGlassOverlayProps> = ({
  palette,
  isLight,
  borderRadius = 0,
  position = "bottom",
  showBevelBorder = true,
  solidBorderColor,
}) => {
  const uid = useId().replace(/:/g, "");
  const grainId = `fg-grain-${uid}`;
  const grainPatId = `fg-grain-pat-${uid}`;
  const diffId = `fg-diff-${uid}`;
  const specId = `fg-spec-${uid}`;
  const reflId = `fg-refl-${uid}`;

  const isBottom = position === "bottom";
  const useLightOptics = palette.isCustomLight ?? isLight;

  if (!palette.isTranslucent && !solidBorderColor) {
    return null;
  }

  const bevelGradient = useLightOptics
    ? "linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.25) 35%, rgba(255,255,255,0.40) 70%, rgba(255,255,255,0.80) 100%)"
    : "linear-gradient(135deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.16) 25%, rgba(255,255,255,0.08) 70%, rgba(255,255,255,0.18) 90%, rgba(255,255,255,0.38) 100%)";

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none select-none z-[1] overflow-hidden"
      style={{ borderRadius }}
    >
      {palette.isTranslucent && (
        <>
          <svg className="absolute inset-0 w-full h-full block">
            <defs>
              <filter id={grainId} x="0%" y="0%" width="100%" height="100%">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.82"
                  numOctaves="3"
                  stitchTiles="stitch"
                  result="noise"
                />
                <feColorMatrix
                  type="matrix"
                  values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0.085 0"
                  in="noise"
                />
              </filter>
              <pattern
                id={grainPatId}
                patternUnits="userSpaceOnUse"
                width="64"
                height="64"
              >
                <rect width="64" height="64" filter={`url(#${grainId})`} />
              </pattern>

              <linearGradient id={diffId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop
                  offset="0%"
                  stopColor={
                    isLight
                      ? `rgba(240, 240, 248, ${palette.diffLightTop})`
                      : `rgba(18, 18, 24, ${palette.diffDarkTop})`
                  }
                />
                <stop
                  offset="100%"
                  stopColor={
                    isLight
                      ? `rgba(224, 224, 236, ${palette.diffLightBot})`
                      : `rgba(10, 10, 16, ${palette.diffDarkBot})`
                  }
                />
              </linearGradient>

              <radialGradient id={specId} cx="50%" cy={isBottom ? "0%" : "100%"} r="85%">
                <stop offset="0%" stopColor="rgba(255, 255, 255, 0.14)" />
                <stop offset="35%" stopColor="rgba(255, 255, 255, 0.03)" />
                <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
              </radialGradient>

              <radialGradient
                id={reflId}
                cx="96%"
                cy={isBottom ? "8%" : "92%"}
                r="32%"
              >
                <stop offset="0%" stopColor="rgba(255, 255, 255, 0.14)" />
                <stop offset="50%" stopColor="rgba(255, 255, 255, 0.03)" />
                <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
              </radialGradient>
            </defs>

            {palette.effectiveBlur > 0 && (
              <>
                <rect width="100%" height="100%" fill={`url(#${diffId})`} />
                <rect
                  width="100%"
                  height="100%"
                  fill={`url(#${grainPatId})`}
                  opacity={palette.grainOpacity}
                />
              </>
            )}

            <rect width="100%" height="100%" fill={`url(#${specId})`} />
            <rect
              width="100%"
              height="100%"
              fill={`url(#${reflId})`}
              opacity={palette.reflectionOpacity}
            />
          </svg>

          {/* Crisp 1px optical rim glint */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: "1px",
              top: isBottom ? 0 : undefined,
              bottom: isBottom ? undefined : 0,
              opacity: palette.rimOpacity,
              background:
                "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.20) 25%, rgba(255,255,255,0.40) 50%, rgba(255,255,255,0.20) 75%, rgba(255,255,255,0) 100%)",
            }}
          />
        </>
      )}

      {showBevelBorder && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius,
            padding: "1px",
            background: palette.isTranslucent ? bevelGradient : solidBorderColor,
            WebkitMask:
              "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
      )}
    </div>
  );
};
