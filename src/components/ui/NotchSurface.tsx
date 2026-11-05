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
import {
  subscribeBackdrop,
  triggerBackdropCapture,
  getCachedBackdrop,
} from "../../services/backdropService";

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
  customColor?: string | null;
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
  opacity: _opacity,
  blur: _blur = 0,
  isLightMode = false,
  customColor: _customColor = null,
}) => {
  const isBottom = isBottomNotchPosition(position);
  const isSideCenter = isSideCenterNotchPosition(position);
  const isIsland = notchShape === "island";

  const wrapperRef = useRef<HTMLDivElement>(null);
  const fillPathRef = useRef<SVGPathElement>(null);
  const baseFillPathRef = useRef<SVGPathElement>(null);
  const strokePathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const strokeSvgRef = useRef<SVGSVGElement>(null);
  const backdropImageRef = useRef<SVGImageElement>(null);
  const latestFillPathStrRef = useRef<string>("");

  const [backdropUrl, setBackdropUrl] = useState<string | null>(getCachedBackdrop());

  useEffect(() => {
    const unsub = subscribeBackdrop((url) => {
      setBackdropUrl(url);
    });
    triggerBackdropCapture(30);
    return unsub;
  }, []);

  useEffect(() => {
    triggerBackdropCapture(60);
  }, [isExpanded, position, notchShape]);

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

        if (wrapperRef.current) {
          wrapperRef.current.style.width = `${totalW}px`;
          wrapperRef.current.style.height = `${totalH}px`;
          wrapperRef.current.style.left = `${offsetLeft}px`;
          wrapperRef.current.style.top = `${offsetTop}px`;
        }

        if (svgRef.current) {
          svgRef.current.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
        }

        if (strokeSvgRef.current) {
          strokeSvgRef.current.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
        }

        latestFillPathStrRef.current = fillPath;

        if (backdropImageRef.current && container) {
          const containerRect = container.getBoundingClientRect();
          const margin = 28;
          const bgX = bodyLeft - containerRect.left - margin;
          const bgY = bodyTop - containerRect.top - margin;
          const bgW = window.innerWidth + margin * 2;
          const bgH = window.innerHeight + margin * 2;
          backdropImageRef.current.setAttribute("x", String(bgX));
          backdropImageRef.current.setAttribute("y", String(bgY));
          backdropImageRef.current.setAttribute("width", String(bgW));
          backdropImageRef.current.setAttribute("height", String(bgH));
        }

        if (baseFillPathRef.current) {
          baseFillPathRef.current.setAttribute("d", fillPath);
        }

        if (fillPathRef.current) {
          fillPathRef.current.setAttribute("d", fillPath);
        }

        if (strokePathRef.current) {
          strokePathRef.current.setAttribute("d", outlinePath);
          strokePathRef.current.style.opacity = "1";
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

  useEffect(() => {
    if (fillPathRef.current && latestFillPathStrRef.current) {
      fillPathRef.current.setAttribute("d", latestFillPathStrRef.current);
    }
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="absolute top-0 pointer-events-none select-none z-0 overflow-visible"
      style={{
        filter:
          "drop-shadow(0 28px 64px rgba(12, 10, 60, 0.45)) drop-shadow(0 2px 8px rgba(0, 0, 0, 0.16))",
      }}
    >
      {/* SVG definitions and unified base + backdrop + glass gradient + highlights (body + both ears together) */}
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

          {/* User authentic frosted glass gradient */}
          <linearGradient id="notch-user-glass-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.20)" />
            <stop offset="50%" stopColor="rgba(255, 255, 255, 0.07)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.10)" />
          </linearGradient>
        </defs>

        {/* Transparent Base Vector Path to keep path ref valid */}
        <path ref={baseFillPathRef} fill="transparent" />

        {/* Clipped Overlays: Authentic Backdrop Capture + Indigo Tint + Frosted Glass Gradient + Specular Highlights */}
        <g clipPath="url(#notch-unified-clip)">
          {/* 1. Captured Desktop Wallpaper behind notch with pure backdrop blur */}
          {backdropUrl ? (
            <image
              ref={backdropImageRef}
              href={backdropUrl}
              x="-28"
              y="-28"
              width="calc(100% + 56px)"
              height="calc(100% + 56px)"
              preserveAspectRatio="none"
              style={{
                filter: "blur(26px) saturate(175%) brightness(1.05)",
              }}
            />
          ) : (
            <rect width="100%" height="100%" fill="rgba(22, 16, 72, 0.70)" />
          )}

          {/* 2. Base Tint: rgba(22, 16, 72, .50) */}
          <rect width="100%" height="100%" fill="rgba(22, 16, 72, 0.50)" />

          {/* 3. Glass Gradient: linear-gradient(180deg, rgba(255,255,255,.20) 0%, rgba(255,255,255,.07) 50%, rgba(255,255,255,.10) 100%) */}
          <rect width="100%" height="100%" fill="url(#notch-user-glass-grad)" />

          {/* 4. Inset Top Specular Highlight: inset 0 1px 0 rgba(255,255,255,.55) */}
          <rect
            x="0"
            y={isBottom ? "calc(100% - 1px)" : "0"}
            width="100%"
            height="1"
            fill="rgba(255, 255, 255, 0.55)"
          />

          {/* 5. Inset Bottom Specular Highlight: inset 0 -1px 0 rgba(255,255,255,.12) */}
          <rect
            x="0"
            y={isBottom ? "0" : "calc(100% - 1px)"}
            width="100%"
            height="1"
            fill="rgba(255, 255, 255, 0.12)"
          />

          {/* Dynamic Blurred Album Art Mesh if playing media */}
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
                opacity: 0.35,
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

      {/* Unified Outer Stroke (crisp 1px inset 0 0 0 1px rgba(255,255,255,.22) outline covering ears + body seamlessly) */}
      <svg
        ref={strokeSvgRef}
        className="absolute inset-0 w-full h-full block overflow-visible pointer-events-none z-[2]"
        preserveAspectRatio="none"
        shapeRendering="geometricPrecision"
      >
        <path
          ref={strokePathRef}
          fill="none"
          stroke="rgba(255, 255, 255, 0.22)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          style={{
            opacity: 1,
          }}
        />
      </svg>
    </div>
  );
};
