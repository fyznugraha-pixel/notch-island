import React, { useEffect, useRef, useState } from "react";
import { buildNotchPath, buildNotchOutlinePath, snapToPhysicalPixel } from "../../utils/notchGeometry";

interface NotchSurfaceProps {
  containerRef: React.RefObject<HTMLElement | null>;
  position?: "top" | "bottom";
  isExpanded?: boolean;
  withEars?: boolean;
  ambientImageUrl?: string | null;
}

/**
 * NotchSurface renders a single, continuous geometric surface combining the Dynamic Island
 * body and both ears into one unified shape.
 *
 * It uses a single SVG clipPath + background fill + dynamic ambient image mesh + stroke + drop-shadow,
 * eliminating all color differences, opacity seams, and DPI misalignment.
 */
export const NotchSurface: React.FC<NotchSurfaceProps> = ({
  containerRef,
  position = "top",
  isExpanded = false,
  withEars = true,
  ambientImageUrl = null,
}) => {
  const isBottom = position === "bottom";

  const wrapperRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const fillPathRef = useRef<SVGPathElement>(null);
  const strokePathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const strokeSvgRef = useRef<SVGSVGElement>(null);

  const lastWidthRef = useRef<number>(-1);
  const lastHeightRef = useRef<number>(-1);
  const lastReRef = useRef<number>(-1);
  const lastRbRef = useRef<number>(-1);
  const lastDprRef = useRef<number>(-1);

  const [displayedImage, setDisplayedImage] = useState<string | null>(ambientImageUrl || null);
  const wakeLoopRef = useRef<(durationMs?: number) => void>(() => {});

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

      // Dynamically calculate ear and corner radii based on current height during spring animation
      let targetRe = 0;
      let targetRb = 12;

      if (rawH <= 10) {
        // Compact mode: tiny pill, no ears
        targetRe = 0;
        targetRb = 4;
      } else if (!withEars) {
        targetRe = 0;
        targetRb = isExpanded ? 24 : rawH <= 36 ? 12 : rawH <= 60 ? 16 : 20;
      } else {
        // Smooth subpixel interpolation of ear radius from idle (14px) to expanded (24px)
        const progress = Math.min(1, Math.max(0, (rawH - 32) / (120 - 32)));
        targetRe = snapToPhysicalPixel(14 + progress * 10, dpr);
        targetRb = snapToPhysicalPixel(12 + progress * 12, dpr);
      }

      const changed =
        rawW !== lastWidthRef.current ||
        rawH !== lastHeightRef.current ||
        targetRe !== lastReRef.current ||
        targetRb !== lastRbRef.current ||
        dpr !== lastDprRef.current;

      if (changed) {
        idleFrames = 0;
        lastWidthRef.current = rawW;
        lastHeightRef.current = rawH;
        lastReRef.current = targetRe;
        lastRbRef.current = targetRb;
        lastDprRef.current = dpr;

        const pathParams = {
          width: rawW,
          height: rawH,
          earRadius: targetRe,
          bottomRadius: targetRb,
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
          shadowRef.current.style.left = `${targetRe}px`;
          shadowRef.current.style.width = `${rawW}px`;
          shadowRef.current.style.height = `${snappedH}px`;
          shadowRef.current.style.borderRadius = isBottom
            ? `${targetRb}px ${targetRb}px 0px 0px`
            : `0px 0px ${targetRb}px ${targetRb}px`;
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
        }
      } else {
        idleFrames += 1;
      }

      if (performance.now() < activeUntil || idleFrames < 6) {
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
  }, [containerRef, isBottom, withEars, isExpanded]);

  return (
    <div
      ref={wrapperRef}
      className="absolute top-0 pointer-events-none select-none z-0 overflow-visible"
    >
      {/* GPU-accelerated nine-patch body shadow (zero SVG filter rasterization overhead during spring resize) */}
      <div
        ref={shadowRef}
        className="absolute top-0 pointer-events-none"
        style={{
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55)",
        }}
      />

      {/* Unified Frosted Backdrop Filter layer (placed below SVG & outside filter group so it never blurs the 1px vector stroke) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          clipPath: "url(#notch-unified-clip)",
          WebkitClipPath: "url(#notch-unified-clip)",
          backdropFilter: "var(--notch-blur)",
          WebkitBackdropFilter: "var(--notch-blur)",
        }}
      />

      {/* SVG definitions and unified base fill surface */}
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
        </defs>

        {/* Unified Fill Surface */}
        <g clipPath="url(#notch-unified-clip)">
          <rect
            width="100%"
            height="100%"
            fill="var(--notch-bg)"
            style={{
              transition: "fill 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </g>
      </svg>

      {/* Dynamic Blurred Album Art Mesh across entire Notch geometry (ears + body seamlessly) */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden z-[1] transition-opacity duration-300 ease-out"
        style={{
          clipPath: "url(#notch-unified-clip)",
          WebkitClipPath: "url(#notch-unified-clip)",
          opacity: ambientImageUrl ? 0.45 : 0,
        }}
      >
        {displayedImage && (
          <img
            key={displayedImage}
            src={displayedImage}
            alt=""
            className="w-full h-full object-cover blur-3xl saturate-[1.85] scale-125 pointer-events-none select-none"
          />
        )}
      </div>

      {/* Unified Outer Stroke (crisp 1px border on top of everything, excluding screen-touching bezel edge) */}
      <svg
        ref={strokeSvgRef}
        className="absolute inset-0 w-full h-full block overflow-visible pointer-events-none z-[2]"
        preserveAspectRatio="none"
        shapeRendering="geometricPrecision"
      >
        <path
          ref={strokePathRef}
          fill="none"
          stroke="var(--notch-stroke)"
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
