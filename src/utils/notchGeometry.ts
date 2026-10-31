/**
 * Utility to generate SVG path data for a unified Dynamic Island notch geometry.
 * Combines the notch body and both ears (concave corner meniscus) into a single, continuous shape.
 */

export type NotchPosition =
  | "top"
  | "top-left"
  | "top-right"
  | "left"
  | "right"
  | "bottom-left"
  | "bottom-right"
  | "bottom";

export const ALL_NOTCH_POSITIONS: readonly NotchPosition[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
] as const;

export function isValidNotchPosition(val: unknown): val is NotchPosition {
  return typeof val === "string" && (ALL_NOTCH_POSITIONS as readonly string[]).includes(val);
}

export function isBottomNotchPosition(pos: NotchPosition): boolean {
  return pos === "bottom" || pos === "bottom-left" || pos === "bottom-right";
}

export function isTopNotchPosition(pos: NotchPosition): boolean {
  return pos === "top" || pos === "top-left" || pos === "top-right";
}

export function isLeftNotchPosition(pos: NotchPosition): boolean {
  return pos === "left" || pos === "top-left" || pos === "bottom-left";
}

export function isRightNotchPosition(pos: NotchPosition): boolean {
  return pos === "right" || pos === "top-right" || pos === "bottom-right";
}

export function isSideCenterNotchPosition(pos: NotchPosition): boolean {
  return pos === "left" || pos === "right";
}

export interface NotchPathParams {
  width: number;
  height: number;
  earRadius: number;
  bottomRadius: number;
  topRadius?: number;
  isIsland?: boolean;
  isBottom?: boolean;
  position?: NotchPosition;
  dpr?: number;
}

export interface NotchSurfaceMetrics {
  totalW: number;
  totalH: number;
  offsetLeft: number;
  offsetTop: number;
  bodyLeft: number;
  bodyTop: number;
  re: number;
  rb: number;
}

/**
 * Snaps a coordinate value to physical device pixels to eliminate subpixel seam lines
 * on high-DPI displays (100%, 125%, 150%, 200%).
 */
export function snapToPhysicalPixel(value: number, dpr = 1): number {
  return Math.round(value * dpr) / dpr;
}

export function getNotchSurfaceMetrics(params: NotchPathParams): NotchSurfaceMetrics {
  const dpr = params.dpr || (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1;
  const w = snapToPhysicalPixel(Math.max(0, params.width), dpr);
  const h = snapToPhysicalPixel(Math.max(0, params.height), dpr);
  const pos: NotchPosition = params.position || (params.isBottom ? "bottom" : "top");

  const rawRe = Math.max(0, params.earRadius);
  const rawRb = Math.max(0, params.bottomRadius);
  const rb = snapToPhysicalPixel(Math.min(rawRb, h / 2, w / 2), dpr);

  const isSide = pos === "left" || pos === "right";
  const maxReAlongWall = isSide ? Math.max(0, w - rb) : Math.max(0, h - rb);
  const maxRe = isSide ? (h > 0 ? 32 : 0) : (w > 0 ? 32 : 0);
  const re = params.isIsland
    ? 0
    : snapToPhysicalPixel(Math.min(rawRe, maxReAlongWall, maxRe), dpr);

  if (pos === "left" || pos === "right") {
    return {
      totalW: w,
      totalH: snapToPhysicalPixel(h + 2 * re, dpr),
      offsetLeft: 0,
      offsetTop: snapToPhysicalPixel(-re, dpr),
      bodyLeft: 0,
      bodyTop: re,
      re,
      rb,
    };
  }

  if (pos === "top-left" || pos === "bottom-left") {
    return {
      totalW: snapToPhysicalPixel(w + re, dpr),
      totalH: h,
      offsetLeft: 0,
      offsetTop: 0,
      bodyLeft: 0,
      bodyTop: 0,
      re,
      rb,
    };
  }

  if (pos === "top-right" || pos === "bottom-right") {
    return {
      totalW: snapToPhysicalPixel(w + re, dpr),
      totalH: h,
      offsetLeft: snapToPhysicalPixel(-re, dpr),
      offsetTop: 0,
      bodyLeft: re,
      bodyTop: 0,
      re,
      rb,
    };
  }

  return {
    totalW: snapToPhysicalPixel(w + 2 * re, dpr),
    totalH: h,
    offsetLeft: snapToPhysicalPixel(-re, dpr),
    offsetTop: 0,
    bodyLeft: re,
    bodyTop: 0,
    re,
    rb,
  };
}

/**
 * Builds the complete closed SVG path for the notch surface (body + ears).
 */
export function buildNotchPath(params: NotchPathParams): string {
  const dpr = params.dpr || (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1;
  const rawW = Math.max(0, params.width);
  const rawH = Math.max(0, params.height);

  if (rawW <= 0 || rawH <= 0) {
    return "";
  }

  const w = snapToPhysicalPixel(rawW, dpr);
  const h = snapToPhysicalPixel(rawH, dpr);
  const pos: NotchPosition = params.position || (params.isBottom ? "bottom" : "top");
  const { totalW, totalH, bodyLeft, bodyTop, re, rb } = getNotchSurfaceMetrics(params);
  const bodyRight = snapToPhysicalPixel(bodyLeft + w, dpr);
  const bodyBottom = snapToPhysicalPixel(bodyTop + h, dpr);

  if (params.isIsland) {
    const rawRb = Math.max(0, params.bottomRadius);
    const rawRt = params.topRadius !== undefined ? Math.max(0, params.topRadius) : rawRb;
    const rt = snapToPhysicalPixel(Math.min(rawRt, h / 2, w / 2), dpr);
    return [
      `M ${rt} 0`,
      `H ${w - rt}`,
      rt > 0 ? `A ${rt} ${rt} 0 0 1 ${w} ${rt}` : `L ${w} 0`,
      `V ${h - rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w - rb} ${h}` : `L ${w} ${h}`,
      `H ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 0 ${h - rb}` : `L 0 ${h}`,
      `V ${rt}`,
      rt > 0 ? `A ${rt} ${rt} 0 0 1 ${rt} 0` : `L 0 0`,
      `Z`,
    ].join(" ");
  }

  // Left-center bezel: full top & bottom ears along vertical left bezel (x = 0)
  if (pos === "left") {
    if (re === 0) {
      return [
        `M 0 0`,
        `H ${w - rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w} ${rb}` : `L ${w} 0`,
        `V ${h - rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w - rb} ${h}` : `L ${w} ${h}`,
        `H 0`,
        `Z`,
      ].join(" ");
    }
    return [
      `M 0 0`,
      `A ${re} ${re} 0 0 0 ${re} ${bodyTop}`,
      `H ${w - rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w} ${bodyTop + rb}` : `L ${w} ${bodyTop}`,
      `V ${bodyBottom - rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w - rb} ${bodyBottom}` : `L ${w} ${bodyBottom}`,
      `H ${re}`,
      `A ${re} ${re} 0 0 0 0 ${totalH}`,
      `Z`,
    ].join(" ");
  }

  // Right-center bezel: full top & bottom ears along vertical right bezel (x = w)
  if (pos === "right") {
    if (re === 0) {
      return [
        `M ${w} 0`,
        `H ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 0 ${rb}` : `L 0 0`,
        `V ${h - rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 ${rb} ${h}` : `L 0 ${h}`,
        `H ${w}`,
        `Z`,
      ].join(" ");
    }
    return [
      `M ${w} 0`,
      `A ${re} ${re} 0 0 1 ${w - re} ${bodyTop}`,
      `H ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 0 ${bodyTop + rb}` : `L 0 ${bodyTop}`,
      `V ${bodyBottom - rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 ${rb} ${bodyBottom}` : `L 0 ${bodyBottom}`,
      `H ${w - re}`,
      `A ${re} ${re} 0 0 1 ${w} ${totalH}`,
      `Z`,
    ].join(" ");
  }

  // Top-left corner: flush with left bezel (x = 0) & top bezel (y = 0), single right ear
  if (pos === "top-left") {
    if (re === 0) {
      return [
        `M 0 0`,
        `H ${w}`,
        `V ${h - rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w - rb} ${h}` : `L ${w} ${h}`,
        `H ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 0 ${h - rb}` : `L 0 ${h}`,
        `Z`,
      ].join(" ");
    }
    return [
      `M 0 0`,
      `H ${totalW}`,
      `A ${re} ${re} 0 0 0 ${bodyRight} ${re}`,
      `V ${h - rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${bodyRight - rb} ${h}` : `L ${bodyRight} ${h}`,
      `H ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 0 ${h - rb}` : `L 0 ${h}`,
      `V 0`,
      `Z`,
    ].join(" ");
  }

  // Top-right corner: flush with right bezel (x = totalW) & top bezel (y = 0), single left ear
  if (pos === "top-right") {
    if (re === 0) {
      return [
        `M 0 0`,
        `H ${w}`,
        `V ${h - rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w - rb} ${h}` : `L ${w} ${h}`,
        `H ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 0 ${h - rb}` : `L 0 ${h}`,
        `Z`,
      ].join(" ");
    }
    return [
      `M 0 0`,
      `H ${totalW}`,
      `V ${h - rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${totalW - rb} ${h}` : `L ${totalW} ${h}`,
      `H ${bodyLeft + rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${bodyLeft} ${h - rb}` : `L ${bodyLeft} ${h}`,
      `V ${re}`,
      `A ${re} ${re} 0 0 0 0 0`,
      `Z`,
    ].join(" ");
  }

  // Bottom-left corner: flush with left bezel (x = 0) & bottom bezel (y = h), single right ear
  if (pos === "bottom-left") {
    if (re === 0) {
      return [
        `M 0 ${h}`,
        `H ${w}`,
        `V ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 ${w - rb} 0` : `L ${w} 0`,
        `H ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 0 ${rb}` : `L 0 0`,
        `Z`,
      ].join(" ");
    }
    return [
      `M 0 ${h}`,
      `H ${totalW}`,
      `A ${re} ${re} 0 0 1 ${bodyRight} ${h - re}`,
      `V ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 ${bodyRight - rb} 0` : `L ${bodyRight} 0`,
      `H ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 0 ${rb}` : `L 0 0`,
      `V ${h}`,
      `Z`,
    ].join(" ");
  }

  // Bottom-right corner: flush with right bezel (x = totalW) & bottom bezel (y = h), single left ear
  if (pos === "bottom-right") {
    if (re === 0) {
      return [
        `M 0 ${h}`,
        `H ${w}`,
        `V ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 ${w - rb} 0` : `L ${w} 0`,
        `H ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 0 ${rb}` : `L 0 0`,
        `Z`,
      ].join(" ");
    }
    return [
      `M 0 ${h}`,
      `H ${totalW}`,
      `V ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 ${totalW - rb} 0` : `L ${totalW} 0`,
      `H ${bodyLeft + rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 ${bodyLeft} ${rb}` : `L ${bodyLeft} 0`,
      `V ${h - re}`,
      `A ${re} ${re} 0 0 1 0 ${h}`,
      `Z`,
    ].join(" ");
  }

  // Top-center or Bottom-center (2 horizontal ears)
  const isBottom = pos === "bottom";
  if (re === 0) {
    if (!isBottom) {
      return [
        `M 0 0`,
        `H ${w}`,
        `V ${h - rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w - rb} ${h}` : `L ${w} ${h}`,
        `H ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 0 ${h - rb}` : `L 0 ${h}`,
        `Z`,
      ].join(" ");
    }
    return [
      `M 0 ${h}`,
      `H ${w}`,
      `V ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 ${w - rb} 0` : `L ${w} 0`,
      `H ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 0 ${rb}` : `L 0 0`,
      `Z`,
    ].join(" ");
  }

  if (!isBottom) {
    return [
      `M 0 0`,
      `H ${totalW}`,
      `A ${re} ${re} 0 0 0 ${bodyRight} ${re}`,
      `V ${h - rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${bodyRight - rb} ${h}` : `L ${bodyRight} ${h}`,
      `H ${bodyLeft + rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${bodyLeft} ${h - rb}` : `L ${bodyLeft} ${h}`,
      `V ${re}`,
      `A ${re} ${re} 0 0 0 0 0`,
      `Z`,
    ].join(" ");
  }

  return [
    `M 0 ${h}`,
    `H ${totalW}`,
    `A ${re} ${re} 0 0 1 ${bodyRight} ${h - re}`,
    `V ${rb}`,
    rb > 0 ? `A ${rb} ${rb} 0 0 0 ${bodyRight - rb} 0` : `L ${bodyRight} 0`,
    `H ${bodyLeft + rb}`,
    rb > 0 ? `A ${rb} ${rb} 0 0 0 ${bodyLeft} ${rb}` : `L ${bodyLeft} 0`,
    `V ${h - re}`,
    `A ${re} ${re} 0 0 1 0 ${h}`,
    `Z`,
  ].join(" ");
}

/**
 * Builds the open SVG stroke path outlining the outer perimeter of the notch (ears + body).
 * Excludes the edge that touches the screen bezel so that the notch connects seamlessly
 * without floating 1px off the display boundary.
 */
export function buildNotchOutlinePath(params: NotchPathParams): string {
  const dpr = params.dpr || (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1;
  const rawW = Math.max(0, params.width);
  const rawH = Math.max(0, params.height);

  if (rawW <= 0 || rawH <= 0) {
    return "";
  }

  if (params.isIsland) {
    return buildNotchPath(params);
  }

  const w = snapToPhysicalPixel(rawW, dpr);
  const h = snapToPhysicalPixel(rawH, dpr);
  const pos: NotchPosition = params.position || (params.isBottom ? "bottom" : "top");
  const { totalW, totalH, bodyLeft, bodyTop, re, rb } = getNotchSurfaceMetrics(params);
  const bodyRight = snapToPhysicalPixel(bodyLeft + w, dpr);
  const bodyBottom = snapToPhysicalPixel(bodyTop + h, dpr);

  if (pos === "left") {
    if (re === 0) {
      return [
        `M 0 0`,
        `H ${w - rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w} ${rb}` : `L ${w} 0`,
        `V ${h - rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w - rb} ${h}` : `L ${w} ${h}`,
        `H 0`,
      ].join(" ");
    }
    return [
      `M 0 0`,
      `A ${re} ${re} 0 0 0 ${re} ${bodyTop}`,
      `H ${w - rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w} ${bodyTop + rb}` : `L ${w} ${bodyTop}`,
      `V ${bodyBottom - rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w - rb} ${bodyBottom}` : `L ${w} ${bodyBottom}`,
      `H ${re}`,
      `A ${re} ${re} 0 0 0 0 ${totalH}`,
    ].join(" ");
  }

  if (pos === "right") {
    if (re === 0) {
      return [
        `M ${w} 0`,
        `H ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 0 ${rb}` : `L 0 0`,
        `V ${h - rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 ${rb} ${h}` : `L 0 ${h}`,
        `H ${w}`,
      ].join(" ");
    }
    return [
      `M ${w} 0`,
      `A ${re} ${re} 0 0 1 ${w - re} ${bodyTop}`,
      `H ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 0 ${bodyTop + rb}` : `L 0 ${bodyTop}`,
      `V ${bodyBottom - rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 ${rb} ${bodyBottom}` : `L 0 ${bodyBottom}`,
      `H ${w - re}`,
      `A ${re} ${re} 0 0 1 ${w} ${totalH}`,
    ].join(" ");
  }

  if (pos === "top-left") {
    if (re === 0) {
      return [
        `M ${w} 0`,
        `V ${h - rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w - rb} ${h}` : `L ${w} ${h}`,
        `H ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 0 ${h - rb}` : `L 0 ${h}`,
      ].join(" ");
    }
    return [
      `M ${totalW} 0`,
      `A ${re} ${re} 0 0 0 ${bodyRight} ${re}`,
      `V ${h - rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${bodyRight - rb} ${h}` : `L ${bodyRight} ${h}`,
      `H ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 0 ${h - rb}` : `L 0 ${h}`,
    ].join(" ");
  }

  if (pos === "top-right") {
    if (re === 0) {
      return [
        `M ${w} ${h - rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w - rb} ${h}` : `L ${w} ${h}`,
        `H ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 0 ${h - rb}` : `L 0 ${h}`,
        `V 0`,
      ].join(" ");
    }
    return [
      `M ${totalW} ${h - rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${totalW - rb} ${h}` : `L ${totalW} ${h}`,
      `H ${bodyLeft + rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${bodyLeft} ${h - rb}` : `L ${bodyLeft} ${h}`,
      `V ${re}`,
      `A ${re} ${re} 0 0 0 0 0`,
    ].join(" ");
  }

  if (pos === "bottom-left") {
    if (re === 0) {
      return [
        `M ${w} ${h}`,
        `V ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 ${w - rb} 0` : `L ${w} 0`,
        `H ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 0 ${rb}` : `L 0 0`,
      ].join(" ");
    }
    return [
      `M ${totalW} ${h}`,
      `A ${re} ${re} 0 0 1 ${bodyRight} ${h - re}`,
      `V ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 ${bodyRight - rb} 0` : `L ${bodyRight} 0`,
      `H ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 0 ${rb}` : `L 0 0`,
    ].join(" ");
  }

  if (pos === "bottom-right") {
    if (re === 0) {
      return [
        `M ${w} ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 ${w - rb} 0` : `L ${w} 0`,
        `H ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 0 ${rb}` : `L 0 0`,
        `V ${h}`,
      ].join(" ");
    }
    return [
      `M ${totalW} ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 ${totalW - rb} 0` : `L ${totalW} 0`,
      `H ${bodyLeft + rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 ${bodyLeft} ${rb}` : `L ${bodyLeft} 0`,
      `V ${h - re}`,
      `A ${re} ${re} 0 0 1 0 ${h}`,
    ].join(" ");
  }

  const isBottom = pos === "bottom";
  if (re === 0) {
    if (!isBottom) {
      return [
        `M ${w} 0`,
        `V ${h - rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 ${w - rb} ${h}` : `L ${w} ${h}`,
        `H ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 1 0 ${h - rb}` : `L 0 ${h}`,
        `V 0`,
      ].join(" ");
    }
    return [
      `M ${w} ${h}`,
      `V ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 ${w - rb} 0` : `L ${w} 0`,
      `H ${rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 0 0 ${rb}` : `L 0 0`,
      `V ${h}`,
    ].join(" ");
  }

  if (!isBottom) {
    return [
      `M ${totalW} 0`,
      `A ${re} ${re} 0 0 0 ${bodyRight} ${re}`,
      `V ${h - rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${bodyRight - rb} ${h}` : `L ${bodyRight} ${h}`,
      `H ${bodyLeft + rb}`,
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${bodyLeft} ${h - rb}` : `L ${bodyLeft} ${h}`,
      `V ${re}`,
      `A ${re} ${re} 0 0 0 0 0`,
    ].join(" ");
  }

  return [
    `M ${totalW} ${h}`,
    `A ${re} ${re} 0 0 1 ${bodyRight} ${h - re}`,
    `V ${rb}`,
    rb > 0 ? `A ${rb} ${rb} 0 0 0 ${bodyRight - rb} 0` : `L ${bodyRight} 0`,
    `H ${bodyLeft + rb}`,
    rb > 0 ? `A ${rb} ${rb} 0 0 0 ${bodyLeft} ${rb}` : `L ${bodyLeft} 0`,
    `V ${h - re}`,
    `A ${re} ${re} 0 0 1 0 ${h}`,
  ].join(" ");
}
