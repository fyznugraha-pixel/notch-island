/**
 * Utility to generate SVG path data for a unified Dynamic Island notch geometry.
 * Combines the notch body and both ears (concave corner meniscus) into a single, continuous shape.
 */

export interface NotchPathParams {
  width: number;
  height: number;
  earRadius: number;
  bottomRadius: number;
  isBottom?: boolean;
  dpr?: number;
}

/**
 * Snaps a coordinate value to physical device pixels to eliminate subpixel seam lines
 * on high-DPI displays (100%, 125%, 150%, 200%).
 */
export function snapToPhysicalPixel(value: number, dpr = 1): number {
  return Math.round(value * dpr) / dpr;
}

/**
 * Builds the complete closed SVG path for the notch surface (body + ears).
 * Coordinates are relative to a bounding box of size (width + 2 * earRadius) x height.
 * - x = 0 is the outer tip of the left ear.
 * - x = earRadius is the left boundary of the notch body.
 * - x = earRadius + width is the right boundary of the notch body.
 * - x = 2 * earRadius + width is the outer tip of the right ear.
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
  const rawRe = Math.max(0, params.earRadius);
  const rawRb = Math.max(0, params.bottomRadius);

  // Clamp radii to prevent arc overlap
  const re = snapToPhysicalPixel(Math.min(rawRe, h, w > 0 ? 32 : 0), dpr);
  const rb = snapToPhysicalPixel(Math.min(rawRb, h / 2, w / 2), dpr);
  const isBottom = Boolean(params.isBottom);

  const totalW = snapToPhysicalPixel(w + 2 * re, dpr);
  const bodyLeft = re;
  const bodyRight = snapToPhysicalPixel(re + w, dpr);

  if (re === 0) {
    // Rectangular notch without ears (fallback or compact mode)
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
    } else {
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
  }

  if (!isBottom) {
    // Top-anchored notch (attached to screen top bezel at y = 0)
    return [
      `M 0 0`,
      `H ${totalW}`,
      // Right concave ear (curves downward from screen edge to notch right wall)
      `A ${re} ${re} 0 0 0 ${bodyRight} ${re}`,
      // Right vertical wall
      `V ${h - rb}`,
      // Bottom-right convex corner
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${bodyRight - rb} ${h}` : `L ${bodyRight} ${h}`,
      // Bottom edge
      `H ${bodyLeft + rb}`,
      // Bottom-left convex corner
      rb > 0 ? `A ${rb} ${rb} 0 0 1 ${bodyLeft} ${h - rb}` : `L ${bodyLeft} ${h}`,
      // Left vertical wall
      `V ${re}`,
      // Left concave ear (curves upward from notch left wall to screen edge)
      `A ${re} ${re} 0 0 0 0 0`,
      `Z`,
    ].join(" ");
  }

  // Bottom-anchored notch (attached to screen bottom bezel at y = h)
  return [
    `M 0 ${h}`,
    `H ${totalW}`,
    // Right concave ear (curves upward from screen bottom edge to notch right wall)
    `A ${re} ${re} 0 0 1 ${bodyRight} ${h - re}`,
    // Right vertical wall
    `V ${rb}`,
    // Top-right convex corner
    rb > 0 ? `A ${rb} ${rb} 0 0 0 ${bodyRight - rb} 0` : `L ${bodyRight} 0`,
    // Top edge
    `H ${bodyLeft + rb}`,
    // Top-left convex corner
    rb > 0 ? `A ${rb} ${rb} 0 0 0 ${bodyLeft} ${rb}` : `L ${bodyLeft} 0`,
    // Left vertical wall
    `V ${h - re}`,
    // Left concave ear (curves downward from notch left wall to screen bottom edge)
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

  const w = snapToPhysicalPixel(rawW, dpr);
  const h = snapToPhysicalPixel(rawH, dpr);
  const rawRe = Math.max(0, params.earRadius);
  const rawRb = Math.max(0, params.bottomRadius);

  const re = snapToPhysicalPixel(Math.min(rawRe, h, w > 0 ? 32 : 0), dpr);
  const rb = snapToPhysicalPixel(Math.min(rawRb, h / 2, w / 2), dpr);
  const isBottom = Boolean(params.isBottom);

  const totalW = snapToPhysicalPixel(w + 2 * re, dpr);
  const bodyLeft = re;
  const bodyRight = snapToPhysicalPixel(re + w, dpr);

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
    } else {
      return [
        `M ${w} ${h}`,
        `V ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 ${w - rb} 0` : `L ${w} 0`,
        `H ${rb}`,
        rb > 0 ? `A ${rb} ${rb} 0 0 0 0 ${rb}` : `L 0 0`,
        `V ${h}`,
      ].join(" ");
    }
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
