import React, { useEffect, useRef, useState } from "react";
import { buildNotchPath, buildNotchOutlinePath, snapToPhysicalPixel } from "../../utils/notchGeometry";

export type NotchSurfaceTone = "default" | "drag_over";

interface NotchSurfaceProps {
  containerRef: React.RefObject<HTMLElement | null>;
  position?: "top" | "bottom";
  isExpanded?: boolean;
  withEars?: boolean;
  notchShape?: "notch" | "island";
  ambientImageUrl?: string | null;
  surfaceTone?: NotchSurfaceTone;
  themeMode?: "solid" | "glass" | "clear";
  isLightMode?: boolean;
}

/**
 * NotchSurface renders a single, continuous geometric surface combining the Dynamic Island
 * body and both ears into one unified shape.
 *
 * All fills, ambient artwork blurs, and state tints are rendered inside the same SVG
 * `<g clipPath="url(#notch-unified-clip)">` spanning the full width (including both ears),
 * guaranteeing zero color difference between the notch body and its ears.
 */
export const NotchSurface: React.FC<NotchSurfaceProps> = ({
  containerRef,
  position = "top",
  isExpanded = false,
  withEars = true,
  notchShape = "notch",
  ambientImageUrl = null,
  surfaceTone = "default",
  themeMode = "solid",
  isLightMode = false,
}) => {
  const isBottom = position === "bottom";
  const isIsland = notchShape === "island";

  const wrapperRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const fillPathRef = useRef<SVGPathElement>(null);
  const strokePathRef = useRef<SVGPathElement>(null);
  const topRimRef = useRef<SVGRectElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const strokeSvgRef = useRef<SVGSVGElement>(null);

  const lastWidthRef = useRef<number>(-1);
  const lastHeightRef = useRef<number>(-1);
  const lastReRef = useRef<number>(-1);
  const lastRbRef = useRef<number>(-1);
  const lastRtRef = useRef<number>(-1);
  const lastDprRef = useRef<number>(-1);

  const morphProgressRef = useRef<number>(isIsland ? 1.0 : 0.0);
  const targetMorphRef = useRef<number>(isIsland ? 1.0 : 0.0);

  const [displayedImage, setDisplayedImage] = useState<string | null>(
    ambientImageUrl || null
  );
  const wakeLoopRef = useRef<(durationMs?: number) => void>(() => {});

  useEffect(() => {
    targetMorphRef.current = isIsland ? 1.0 : 0.0;
    lastWidthRef.current = -1;
    wakeLoopRef.current(800);
  }, [isIsland]);

  useEffect(() => {
    if (ambientImageUrl) {
      setDisplayedImage(ambientImageUrl);
      wakeLoopRef.current(400);
    } else {
      const timer = window.setTimeout(() => {
        setDisplayedImage(null);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [ambientImageUrl]);

  useEffect(() => {
    let animFrameId: number | null = null;
    let activeUntil = performance.now() + 750;
    let idleFrames = 0;

    // Force immediate recalculation when props change
    lastWidthRef.current = -1;

    const updateSurface = () => {
      animFrameId = null;
      const container = containerRef.current;
      if (!container) return;

      const dpr = window.devicePixelRatio || 1;
      const cssW = parseFloat(container.style.width) || container.offsetWidth;
      const cssH = parseFloat(container.style.height) || container.offsetHeight;
      const rawW = snapToPhysicalPixel(cssW, dpr);
      const rawH = snapToPhysicalPixel(cssH, dpr);

      if (rawW <= 0 || rawH <= 0) {
        if (performance.now() < activeUntil) {
          animFrameId = requestAnimationFrame(updateSurface);
        }
        return;
      }

      // Spring-based continuous morphing between Notch (m=0) and Island (m=1)
      const targetMorph = targetMorphRef.current;
      let currentMorph = morphProgressRef.current;
      const isReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let isMorphing = false;
      if (isReducedMotion) {
        currentMorph = targetMorph;
        morphProgressRef.current = currentMorph;
      } else if (Math.abs(currentMorph - targetMorph) > 0.003) {
        isMorphing = true;
        // Critically damped spring step (~320ms smooth physical transition)
        currentMorph += (targetMorph - currentMorph) * 0.18;
        morphProgressRef.current = currentMorph;
      } else {
        currentMorph = targetMorph;
        morphProgressRef.current = currentMorph;
      }

      const m = currentMorph;

      // Base Notch parameters
      const progress = Math.min(1, Math.max(0, (rawH - 32) / (120 - 32)));
      const notchMaxRe = withEars
        ? snapToPhysicalPixel(rawH <= 10 ? 0 : 14 + progress * 10, dpr)
        : 0;
      const notchRb = withEars
        ? snapToPhysicalPixel(12 + progress * 12, dpr)
        : isExpanded
        ? (rawH >= 200 ? 32 : 24)
        : rawH <= 36
        ? 12
        : rawH <= 60
        ? 16
        : 20;

      // Base Island parameters
      let islandMaxRt = 0;
      let islandRb = 0;
      if (rawH <= 10) {
        islandMaxRt = 4;
        islandRb = 4;
      } else if (isExpanded || rawH > 70) {
        const cardRadius = rawH >= 200 ? 32 : 28;
        islandMaxRt = snapToPhysicalPixel(cardRadius, dpr);
        islandRb = snapToPhysicalPixel(cardRadius, dpr);
      } else {
        const halfH = snapToPhysicalPixel(rawH / 2, dpr);
        islandMaxRt = halfH;
        islandRb = halfH;
      }

      // Continuous fluid morphing:
      // m <= 0.5: Ears gracefully retract into body (re -> 0), top edge stays flat (rt = 0)
      // m > 0.5:  Top corners gracefully blossom outward into rounded island (rt -> maxRt)
      let targetRe = 0;
      let targetRt = 0;
      const isIslandPath = m >= 0.5;

      if (m <= 0.5) {
        const earProgress = 1 - m / 0.5; // 1.0 down to 0.0
        targetRe = snapToPhysicalPixel(notchMaxRe * Math.pow(earProgress, 1.25), dpr);
        targetRt = 0;
      } else {
        targetRe = 0;
        const topProgress = (m - 0.5) / 0.5; // 0.0 up to 1.0
        targetRt = snapToPhysicalPixel(islandMaxRt * (1 - Math.pow(1 - topProgress, 1.35)), dpr);
      }

      const targetRb = snapToPhysicalPixel(notchRb * (1 - m) + islandRb * m, dpr);

      const changed =
        isMorphing ||
        rawW !== lastWidthRef.current ||
        rawH !== lastHeightRef.current ||
        targetRe !== lastReRef.current ||
        targetRb !== lastRbRef.current ||
        targetRt !== lastRtRef.current ||
        dpr !== lastDprRef.current;

      if (changed) {
        idleFrames = 0;
        lastWidthRef.current = rawW;
        lastHeightRef.current = rawH;
        lastReRef.current = targetRe;
        lastRbRef.current = targetRb;
        lastRtRef.current = targetRt;
        lastDprRef.current = dpr;

        const pathParams = {
          width: rawW,
          height: rawH,
          earRadius: targetRe,
          bottomRadius: targetRb,
          topRadius: targetRt,
          isIsland: isIslandPath,
          isBottom,
          dpr,
        };

        const fillPath = buildNotchPath(pathParams);
        const outlinePath = buildNotchOutlinePath(pathParams);

        const totalW = snapToPhysicalPixel(rawW + 2 * targetRe, dpr);
        const snappedH = snapToPhysicalPixel(rawH, dpr);
        const offsetLeft = snapToPhysicalPixel(-targetRe, dpr);

        if (wrapperRef.current) {
          wrapperRef.current.style.width = `${totalW}px`;
          wrapperRef.current.style.height = `${snappedH}px`;
          wrapperRef.current.style.left = `${offsetLeft}px`;
        }

        if (shadowRef.current) {
          if (isTranslucent || m >= 0.99) {
            shadowRef.current.style.display = "none";
          } else {
            shadowRef.current.style.display = "";
            shadowRef.current.style.opacity = String(Math.max(0, 1 - m * 2));
            shadowRef.current.style.left = `${targetRe}px`;
            shadowRef.current.style.width = `${rawW}px`;
            shadowRef.current.style.height = `${snappedH}px`;
            shadowRef.current.style.borderRadius = isBottom
              ? `${targetRb}px ${targetRb}px 0px 0px`
              : `0px 0px ${targetRb}px ${targetRb}px`;
          }
        }

        if (svgRef.current) {
          svgRef.current.setAttribute("viewBox", `0 0 ${totalW} ${snappedH}`);
        }

        if (strokeSvgRef.current) {
          strokeSvgRef.current.setAttribute("viewBox", `0 0 ${totalW} ${snappedH}`);
        }

        if (fillPathRef.current) {
          fillPathRef.current.setAttribute("d", fillPath);
        }

        if (strokePathRef.current) {
          strokePathRef.current.setAttribute("d", outlinePath);
          if (!isTranslucent) {
            const strokeOpacity = m <= 0.5 ? 0 : (m - 0.5) / 0.5;
            strokePathRef.current.style.opacity = String(strokeOpacity);
          } else {
            strokePathRef.current.style.opacity = "1";
          }
        }

        if (topRimRef.current) {
          const rimOpacity = m <= 0.5 ? 0 : (isLightMode ? 0.25 : 0.40) * ((m - 0.5) / 0.5);
          topRimRef.current.style.opacity = String(rimOpacity);
        }
      } else {
        idleFrames += 1;
      }

      if (isMorphing || performance.now() < activeUntil || idleFrames < 6) {
        animFrameId = requestAnimationFrame(updateSurface);
      }
    };

    const wakeLoop = (durationMs = 700) => {
      activeUntil = Math.max(activeUntil, performance.now() + durationMs);
      idleFrames = 0;
      if (animFrameId === null) {
        animFrameId = requestAnimationFrame(updateSurface);
      }
    };

    wakeLoopRef.current = wakeLoop;
    wakeLoop(750);

    let observer: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        wakeLoop(500);
      });
      observer.observe(containerRef.current);
    }

    const handleWindowResize = () => {
      lastWidthRef.current = -1;
      wakeLoop(500);
    };
    window.addEventListener("resize", handleWindowResize);

    return () => {
      if (animFrameId !== null) cancelAnimationFrame(animFrameId);
      if (observer) observer.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [containerRef, isBottom, withEars, isExpanded, isIsland, themeMode, isLightMode]);

  const isGlass = themeMode === "glass";
  const isClear = themeMode === "clear";
  const isTranslucent = isGlass || isClear;

  const baseFill =
    surfaceTone === "drag_over"
      ? "url(#notch-drag-over-grad)"
      : isGlass
      ? isLightMode
        ? "url(#notch-glass-fill-light)"
        : "url(#notch-glass-fill-dark)"
      : isClear
      ? isLightMode
        ? "url(#notch-clear-fill-light)"
        : "url(#notch-clear-fill-dark)"
      : "var(--notch-bg)";

  const effectiveStroke =
    surfaceTone === "drag_over"
      ? "rgba(34, 211, 238, 0.75)"
      : isGlass
      ? isLightMode
        ? "url(#notch-glass-bevel-stroke-light)"
        : "url(#notch-glass-bevel-stroke-dark)"
      : isClear
      ? isLightMode
        ? "url(#notch-glass-stroke-light)"
        : "url(#notch-glass-stroke-dark)"
      : isIsland
      ? isLightMode
        ? "rgba(0, 0, 0, 0.08)"
        : "rgba(255, 255, 255, 0.08)"
      : "var(--notch-stroke)";

  return (
    <div
      ref={wrapperRef}
      className="absolute top-0 pointer-events-none select-none z-0 overflow-visible"
    >
      {/* GPU-accelerated body shadow (solid mode only; hidden in liquid glass to eliminate body box shadow artifact) */}
      {!isTranslucent && (
        <div
          ref={shadowRef}
          className="absolute top-0 pointer-events-none notch-surface-shadow"
          style={{
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55)",
          }}
        />
      )}

      {/* Unified Frosted Backdrop Filter layer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          clipPath: "url(#notch-unified-clip)",
          WebkitClipPath: "url(#notch-unified-clip)",
          backdropFilter: "var(--notch-blur)",
          WebkitBackdropFilter: "var(--notch-blur)",
        }}
      />

      {/* SVG definitions and unified base + ambient + state tint surface (body + both ears together) */}
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full block overflow-visible z-0"
        preserveAspectRatio="none"
        shapeRendering="geometricPrecision"
      >
        <defs>
          <clipPath id="notch-unified-clip" clipPathUnits="userSpaceOnUse">
            <path ref={fillPathRef} />
          </clipPath>

          <filter
            id="notch-ambient-blur"
            x="-35%"
            y="-35%"
            width="170%"
            height="170%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="34" edgeMode="duplicate" />
            <feColorMatrix type="saturate" values="1.85" />
          </filter>

          <linearGradient id="notch-drag-over-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(8, 51, 68, 0.96)" />
            <stop offset="50%" stopColor="rgba(12, 74, 110, 0.94)" />
            <stop offset="100%" stopColor="rgba(8, 51, 68, 0.96)" />
          </linearGradient>

          {/* Clean Frosted Liquid Glass Base Fills */}
          <linearGradient id="notch-glass-fill-dark" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(24, 24, 34, 0.44)" />
            <stop offset="40%" stopColor="rgba(16, 16, 22, 0.50)" />
            <stop offset="100%" stopColor="rgba(8, 8, 12, 0.58)" />
          </linearGradient>
          <linearGradient id="notch-glass-fill-light" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.72)" />
            <stop offset="40%" stopColor="rgba(246, 246, 250, 0.58)" />
            <stop offset="100%" stopColor="rgba(235, 235, 242, 0.65)" />
          </linearGradient>

          <linearGradient id="notch-clear-fill-dark" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(24, 24, 34, 0.18)" />
            <stop offset="40%" stopColor="rgba(16, 16, 22, 0.22)" />
            <stop offset="100%" stopColor="rgba(8, 8, 12, 0.26)" />
          </linearGradient>
          <linearGradient id="notch-clear-fill-light" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.22)" />
            <stop offset="100%" stopColor="rgba(240, 240, 246, 0.12)" />
          </linearGradient>

          {/* Subtle Apple Glass Top Lustre (delicate 14% max) */}
          <radialGradient id="notch-glass-specular" cx="50%" cy="0%" r="85%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.14)" />
            <stop offset="35%" stopColor="rgba(255, 255, 255, 0.03)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
          </radialGradient>

          {/* Crisp 1px Top Rim Highlight */}
          <linearGradient id="notch-glass-top-rim" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0)" />
            <stop offset="25%" stopColor="rgba(255, 255, 255, 0.20)" />
            <stop offset="50%" stopColor="rgba(255, 255, 255, 0.40)" />
            <stop offset="75%" stopColor="rgba(255, 255, 255, 0.20)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
          </linearGradient>

          {/* Subtle Bottom-Right Glass Reflection (soft 14% max, delicate curve hint) */}
          <radialGradient id="notch-glass-bottom-right-reflection" cx="96%" cy={isBottom ? "8%" : "92%"} r="32%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.14)" />
            <stop offset="50%" stopColor="rgba(255, 255, 255, 0.03)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
          </radialGradient>

          <pattern id="notch-frost-grain-pattern" width="120" height="120" patternUnits="userSpaceOnUse">
            <image
              href="data:image/svg+xml,%3Csvg viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='1 0 0 0 1  0 1 0 0 1  0 0 1 0 1  0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E"
              width="120"
              height="120"
            />
          </pattern>
        </defs>

        {/* Unified Fill Surface (Ears + Body in a single clipped group) */}
        <g clipPath="url(#notch-unified-clip)">
          <rect
            width="100%"
            height="100%"
            fill={baseFill}
            style={{
              transition: "fill 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />

          {isTranslucent && (
            <>
              {/* Subtle Apple Top Lustre */}
              <rect width="100%" height="100%" fill="url(#notch-glass-specular)" />

              {/* Crisp 1px Top Rim Glint */}
              <rect
                x="0"
                y={isBottom ? "calc(100% - 1px)" : "0"}
                width="100%"
                height="1"
                fill="url(#notch-glass-top-rim)"
                opacity={isLightMode ? 0.35 : 0.50}
              />

              {/* Delicate Bottom-Right Glass Curve Reflection */}
              <rect
                width="100%"
                height="100%"
                fill="url(#notch-glass-bottom-right-reflection)"
                opacity={isClear ? (isLightMode ? 0.25 : 0.35) : isLightMode ? 0.55 : 0.75}
              />

              {/* Frosted Micro-Grain Dispersion Texture */}
              <rect
                width="100%"
                height="100%"
                fill="url(#notch-frost-grain-pattern)"
                opacity={isClear ? 0.015 : isLightMode ? 0.025 : 0.045}
                style={{ mixBlendMode: isLightMode ? "multiply" : "screen" }}
              />
            </>
          )}

          {!isTranslucent && (
            /* Crisp 1px Top Rim Highlight for Solid Island mode */
            <rect
              ref={topRimRef}
              x="0"
              y={isBottom ? "calc(100% - 1px)" : "0"}
              width="100%"
              height="1"
              fill="url(#notch-glass-top-rim)"
              opacity={isIsland ? (isLightMode ? 0.25 : 0.40) : 0}
            />
          )}

          {/* Dynamic Blurred Album Art Mesh spanning -20%..120% so ears get full ambient color */}
          {displayedImage && (
            <image
              href={displayedImage}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
              preserveAspectRatio="xMidYMid slice"
              filter="url(#notch-ambient-blur)"
              style={{
                opacity: ambientImageUrl
                  ? isLightMode
                    ? isTranslucent
                      ? 0.48
                      : 0.40
                    : isTranslucent
                    ? 0.55
                    : 0.45
                  : 0,
                transition: "opacity 0.3s ease-out",
              }}
            />
          )}

          {/* Unified State Tint Overlay (Drag-Over) covering ears + body seamlessly */}
          {surfaceTone === "drag_over" && (
            <rect width="100%" height="100%" fill="url(#notch-drag-over-grad)" />
          )}
        </g>
      </svg>

      {/* Unified Outer Stroke (crisp 1px optical glass border, subtle and elegant) */}
      <svg
        ref={strokeSvgRef}
        className="absolute inset-0 w-full h-full block overflow-visible pointer-events-none z-[2]"
        preserveAspectRatio="none"
        shapeRendering="geometricPrecision"
      >
        <defs>
          {/* Subtle Optical Liquid Glass Bevel Reflection */}
          <linearGradient id="notch-glass-bevel-stroke-dark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.38)" />
            <stop offset="25%" stopColor="rgba(255, 255, 255, 0.16)" />
            <stop offset="70%" stopColor="rgba(255, 255, 255, 0.08)" />
            <stop offset="90%" stopColor="rgba(255, 255, 255, 0.18)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.38)" />
          </linearGradient>
          <linearGradient id="notch-glass-bevel-stroke-light" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.85)" />
            <stop offset="35%" stopColor="rgba(255, 255, 255, 0.25)" />
            <stop offset="70%" stopColor="rgba(255, 255, 255, 0.40)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.80)" />
          </linearGradient>

          <linearGradient id="notch-glass-stroke-dark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.38)" />
            <stop offset="25%" stopColor="rgba(255, 255, 255, 0.16)" />
            <stop offset="60%" stopColor="rgba(255, 255, 255, 0.08)" />
            <stop offset="85%" stopColor="rgba(255, 255, 255, 0.20)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.38)" />
          </linearGradient>
          <linearGradient id="notch-glass-stroke-light" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.85)" />
            <stop offset="35%" stopColor="rgba(255, 255, 255, 0.25)" />
            <stop offset="70%" stopColor="rgba(255, 255, 255, 0.40)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.80)" />
          </linearGradient>
        </defs>
        <path
          ref={strokePathRef}
          fill="none"
          stroke={effectiveStroke}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          style={{
            transition: "stroke 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </svg>
    </div>
  );
};
