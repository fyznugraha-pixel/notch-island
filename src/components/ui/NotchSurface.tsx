import React, { useEffect, useRef, useState } from "react";
import {
  buildNotchPath,
  buildNotchOutlinePath,
  getNotchSurfaceMetrics,
  isBottomNotchPosition,
  isSideCenterNotchPosition,
  NotchPosition,
  snapToPhysicalPixel,
} from "../../utils/notchGeometry";

export type NotchSurfaceTone = "default" | "drag_over";

interface NotchSurfaceProps {
  containerRef: React.RefObject<HTMLElement | null>;
  position?: NotchPosition;
  isExpanded?: boolean;
  withEars?: boolean;
  notchShape?: "notch" | "island";
  ambientImageUrl?: string | null;
  surfaceTone?: NotchSurfaceTone;
  themeMode?: "solid" | "glass" | "clear";
  opacity?: number;
  blur?: number;
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
  opacity,
  blur = 0,
  isLightMode = false,
}) => {
  const isBottom = isBottomNotchPosition(position);
  const isSideCenter = isSideCenterNotchPosition(position);
  const isIsland = notchShape === "island";

  const wrapperRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const fillPathRef = useRef<SVGPathElement>(null);
  const baseFillPathRef = useRef<SVGPathElement>(null);
  const strokePathRef = useRef<SVGPathElement>(null);
  const topRimRef = useRef<SVGRectElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const strokeSvgRef = useRef<SVGSVGElement>(null);
  const latestFillPathStrRef = useRef<string>("");

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
      const thickness = isSideCenter ? Math.min(rawW, rawH) : rawH;
      const progress = isExpanded ? 1 : Math.min(1, Math.max(0, (thickness - 32) / (120 - 32)));
      const notchMaxRe = withEars
        ? snapToPhysicalPixel(thickness <= 10 ? 0 : 14 + progress * 10, dpr)
        : 0;
      const notchRb = withEars
        ? snapToPhysicalPixel(12 + progress * 12, dpr)
        : isExpanded
        ? (rawH >= 200 ? 32 : 24)
        : thickness <= 36
        ? 12
        : thickness <= 60
        ? 16
        : 20;

      // Base Island parameters
      let islandMaxRt = 0;
      let islandRb = 0;
      if (thickness <= 10) {
        islandMaxRt = 4;
        islandRb = 4;
      } else if (isExpanded || (isSideCenter ? rawW > 95 : rawH > 70)) {
        const cardRadius = rawH >= 200 ? 32 : 28;
        islandMaxRt = snapToPhysicalPixel(cardRadius, dpr);
        islandRb = snapToPhysicalPixel(cardRadius, dpr);
      } else {
        const halfT = snapToPhysicalPixel(Math.min(rawW, rawH) / 2, dpr);
        islandMaxRt = isSideCenter ? Math.min(halfT, 18) : halfT;
        islandRb = isSideCenter ? Math.min(halfT, 18) : halfT;
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
          position,
          dpr,
        };

        const fillPath = buildNotchPath(pathParams);
        const outlinePath = buildNotchOutlinePath(pathParams);
        const { totalW, totalH, offsetLeft, offsetTop, bodyLeft, bodyTop } =
          getNotchSurfaceMetrics(pathParams);
        const snappedH = snapToPhysicalPixel(rawH, dpr);

        if (wrapperRef.current) {
          wrapperRef.current.style.width = `${totalW}px`;
          wrapperRef.current.style.height = `${totalH}px`;
          wrapperRef.current.style.left = `${offsetLeft}px`;
          wrapperRef.current.style.top = `${offsetTop}px`;
        }

        if (shadowRef.current) {
          if (isTranslucent || m >= 0.99) {
            shadowRef.current.style.display = "none";
          } else {
            shadowRef.current.style.display = "";
            shadowRef.current.style.opacity = String(Math.max(0, 1 - m * 2));
            shadowRef.current.style.left = `${bodyLeft}px`;
            shadowRef.current.style.top = `${bodyTop}px`;
            shadowRef.current.style.width = `${rawW}px`;
            shadowRef.current.style.height = `${snappedH}px`;
            shadowRef.current.style.borderRadius =
              position === "left"
                ? `0px ${targetRb}px ${targetRb}px 0px`
                : position === "right"
                ? `${targetRb}px 0px 0px ${targetRb}px`
                : isBottom
                ? `${targetRb}px ${targetRb}px 0px 0px`
                : `0px 0px ${targetRb}px ${targetRb}px`;
          }
        }

        if (svgRef.current) {
          svgRef.current.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
        }

        if (strokeSvgRef.current) {
          strokeSvgRef.current.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
        }

        latestFillPathStrRef.current = fillPath;

        if (baseFillPathRef.current) {
          baseFillPathRef.current.setAttribute("d", fillPath);
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
  }, [containerRef, position, isBottom, isSideCenter, withEars, isExpanded, isIsland, themeMode, isLightMode]);

  const isGlass = themeMode === "glass";
  const isClear = themeMode === "clear";
  const isTranslucent = isGlass || isClear;
  const needsClipGroup =
    isTranslucent || isIsland || Boolean(displayedImage) || surfaceTone === "drag_over";

  // Dynamic opacity & blur ratios for custom transparency and frosted diffusion
  const effectiveOpacity =
    typeof opacity === "number" && Number.isFinite(opacity)
      ? Math.max(0.15, Math.min(1.0, opacity))
      : isGlass
      ? 0.78
      : isClear
      ? 0.54
      : 1.0;
  // Dynamic blur ratio for optical diffusion & depth contrast
  const effectiveBlur =
    typeof blur === "number" && Number.isFinite(blur)
      ? Math.max(0, Math.min(100, blur))
      : 0;
  const blurRatio = effectiveBlur / 100;

  // Clean opacity stops driven purely by transparency setting (decoupled from blur)
  const expandFrostBoost = isExpanded ? 0.04 : 0;

  const darkStop0 = Math.min(0.95, Math.max(0.14, effectiveOpacity * 0.65 + expandFrostBoost)).toFixed(2);
  const darkStop1 = Math.min(0.96, Math.max(0.18, effectiveOpacity * 0.72 + expandFrostBoost)).toFixed(2);
  const darkStop2 = Math.min(0.97, Math.max(0.22, effectiveOpacity * 0.80 + expandFrostBoost)).toFixed(2);

  const lightStop0 = Math.min(0.96, Math.max(0.20, effectiveOpacity * 0.74 + expandFrostBoost)).toFixed(2);
  const lightStop1 = Math.min(0.94, Math.max(0.15, effectiveOpacity * 0.62 + expandFrostBoost)).toFixed(2);
  const lightStop2 = Math.min(0.95, Math.max(0.17, effectiveOpacity * 0.68 + expandFrostBoost)).toFixed(2);

  // Optical glass diffusion stops (scales directly with Blur slider, 0% = no diffusion, 100% = deep diffusion)
  const diffDarkTop = (blurRatio * 0.45).toFixed(2);
  const diffDarkBot = (blurRatio * 0.58).toFixed(2);
  const diffLightTop = (blurRatio * 0.38).toFixed(2);
  const diffLightBot = (blurRatio * 0.48).toFixed(2);

  useEffect(() => {
    if (needsClipGroup && fillPathRef.current && latestFillPathStrRef.current) {
      fillPathRef.current.setAttribute("d", latestFillPathStrRef.current);
    }
  }, [needsClipGroup]);

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

      {/* Unified Frosted Backdrop Filter layer — only mounted in translucent modes */}
      {isTranslucent && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            clipPath: "url(#notch-unified-clip)",
            WebkitClipPath: "url(#notch-unified-clip)",
            backdropFilter: "var(--notch-blur)",
            WebkitBackdropFilter: "var(--notch-blur)",
          }}
        />
      )}

      {/* SVG definitions and unified base + ambient + state tint surface (body + both ears together) */}
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full block overflow-visible z-0"
        preserveAspectRatio="none"
        shapeRendering="geometricPrecision"
      >
        <defs>
          {needsClipGroup && (
            <clipPath id="notch-unified-clip" clipPathUnits="userSpaceOnUse">
              <path ref={fillPathRef} />
            </clipPath>
          )}

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

          {/* Clean Frosted Liquid Glass & Glass Base Fills (Dynamically driven by opacity + blur) */}
          <linearGradient id="notch-glass-fill-dark" key={`g-dark-${darkStop0}-${darkStop1}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={`rgba(24, 24, 34, ${darkStop0})`} />
            <stop offset="45%" stopColor={`rgba(16, 16, 24, ${darkStop1})`} />
            <stop offset="100%" stopColor={`rgba(10, 10, 15, ${darkStop2})`} />
          </linearGradient>
          <linearGradient id="notch-glass-fill-light" key={`g-light-${lightStop0}-${lightStop1}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={`rgba(255, 255, 255, ${lightStop0})`} />
            <stop offset="45%" stopColor={`rgba(246, 246, 250, ${lightStop1})`} />
            <stop offset="100%" stopColor={`rgba(235, 235, 242, ${lightStop2})`} />
          </linearGradient>

          <linearGradient id="notch-clear-fill-dark" key={`c-dark-${darkStop0}-${darkStop1}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={`rgba(24, 24, 34, ${darkStop0})`} />
            <stop offset="45%" stopColor={`rgba(16, 16, 24, ${darkStop1})`} />
            <stop offset="100%" stopColor={`rgba(10, 10, 15, ${darkStop2})`} />
          </linearGradient>
          <linearGradient id="notch-clear-fill-light" key={`c-light-${lightStop0}-${lightStop1}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={`rgba(255, 255, 255, ${lightStop0})`} />
            <stop offset="45%" stopColor={`rgba(246, 246, 250, ${lightStop1})`} />
            <stop offset="100%" stopColor={`rgba(240, 240, 246, ${lightStop2})`} />
          </linearGradient>

          {/* Subtle Apple Glass Top Lustre (delicate 14% max) */}
          <radialGradient id="notch-glass-specular" cx="50%" cy="0%" r="85%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.14)" />
            <stop offset="35%" stopColor="rgba(255, 255, 255, 0.03)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
          </radialGradient>

          {/* Smooth Optical Glass Diffusion Bed Gradient (scales with Blur slider) */}
          <linearGradient
            id="notch-optical-diffusion-dark"
            key={`opt-diff-dark-${diffDarkTop}-${diffDarkBot}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={`rgba(18, 18, 24, ${diffDarkTop})`} />
            <stop offset="100%" stopColor={`rgba(10, 10, 16, ${diffDarkBot})`} />
          </linearGradient>
          <linearGradient
            id="notch-optical-diffusion-light"
            key={`opt-diff-light-${diffLightTop}-${diffLightBot}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={`rgba(240, 240, 248, ${diffLightTop})`} />
            <stop offset="100%" stopColor={`rgba(224, 224, 236, ${diffLightBot})`} />
          </linearGradient>

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
        </defs>

        {/* Direct Vector Base Path (zero offscreen clip-mask FBO needed in Solid Notch mode) */}
        <path
          ref={baseFillPathRef}
          fill={baseFill}
          style={{
            transition: "fill 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />

        {/* Clipped Overlays (only mounted when glass/island/ambient/drag overlays are active) */}
        {needsClipGroup && (
          <g clipPath="url(#notch-unified-clip)">
            {isTranslucent && (
              <>
                {/* Pure Optical Glass Diffusion Bed (scales directly with Blur slider) */}
                {effectiveBlur > 0 && (
                  <rect
                    width="100%"
                    height="100%"
                    fill={isLightMode ? "url(#notch-optical-diffusion-light)" : "url(#notch-optical-diffusion-dark)"}
                  />
                )}

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
              </>
            )}

            {!isTranslucent && isIsland && (
              /* Crisp 1px Top Rim Highlight for Solid Island mode */
              <rect
                ref={topRimRef}
                x="0"
                y={isBottom ? "calc(100% - 1px)" : "0"}
                width="100%"
                height="1"
                fill="url(#notch-glass-top-rim)"
                opacity={isLightMode ? 0.25 : 0.40}
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
        )}
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
