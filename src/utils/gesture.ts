import React from "react";

/**
 * Checks if a WheelEvent originated from a physical mouse wheel (stepped delta)
 * vs a Precision Touchpad (smooth pixel delta).
 */
export function isPhysicalMouseWheel(e: React.WheelEvent | WheelEvent): boolean {
  if (e.deltaMode === 1) return true; // DOM_DELTA_LINE
  const absY = Math.abs(e.deltaY);
  const absX = Math.abs(e.deltaX);
  const maxDelta = Math.max(absX, absY);
  return maxDelta >= 100 && (maxDelta % 100 === 0 || maxDelta % 120 === 0);
}

/**
 * Normalizes vertical wheel/touchpad gesture delta direction.
 * - On Windows Precision Touchpads (natural scrolling): swiping fingers UP emits deltaY > 0.
 * - On physical mouse wheels: rolling wheel UP emits deltaY < 0.
 *
 * This function returns +1 for an UPWARD gesture (volume/brightness increase)
 * and -1 for a DOWNWARD gesture (volume/brightness decrease).
 */
export function getWheelVerticalDirection(e: React.WheelEvent | WheelEvent): 1 | -1 {
  const isShift = e.shiftKey;
  // In Chromium / WebView2, holding Shift converts vertical wheel/touchpad delta into deltaX
  const rawDelta = isShift && Math.abs(e.deltaY) < 1 ? e.deltaX : e.deltaY;

  if (isPhysicalMouseWheel(e)) {
    return rawDelta < 0 ? 1 : -1;
  }
  // Precision Touchpad: finger sliding up emits positive deltaY (or positive deltaX when Shift is held).
  // We want sliding up to INCREASE (+1) and sliding down to DECREASE (-1).
  return rawDelta > 0 ? 1 : -1;
}

/**
 * Normalizes horizontal wheel/touchpad swipe delta for tab/page switching.
 * - On Windows Precision Touchpads:
 *   - Swiping fingers LEFT (deltaX > 0) reveals the Next tab on the right (positive direction).
 *   - Swiping fingers RIGHT (deltaX < 0) reveals the Prev tab on the left (negative direction).
 * - On physical tilt wheels:
 *   - Tilting wheel RIGHT (deltaX > 0) moves to Next tab.
 *   - Tilting wheel LEFT (deltaX < 0) moves to Prev tab.
 */
export function getNormalizedHorizontalDelta(e: React.WheelEvent | WheelEvent): number {
  return e.deltaX;
}
