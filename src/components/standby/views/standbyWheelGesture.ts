export interface WheelSample {
  deltaY: number;
  deltaMode: number;
  nowMs: number;
}

const STEP_THRESHOLD = 72;
const MIN_STEP_COOLDOWN_MS = 320;
const GESTURE_IDLE_RESET_MS = 150;
const REACCEL_WINDOW_MS = 280;

export function normalizeWheelDeltaY(deltaY: number, deltaMode: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  if (deltaMode === 1) return deltaY * 32;
  if (deltaMode === 2) return deltaY * 300;
  return deltaY;
}

/**
 * Filters high-frequency Windows Precision Touchpad events and inertia tails
 * so one 2-finger swipe steps exactly one widget without jumping or glitching.
 */
export function createWheelStepTracker() {
  let accum = 0;
  let lastEventMs = 0;
  let lastStepMs = 0;
  let lockedDir: 0 | 1 | -1 = 0;
  let tailPeak = 0;

  return {
    push(sample: WheelSample): -1 | 0 | 1 {
      const dy = normalizeWheelDeltaY(sample.deltaY, sample.deltaMode);
      if (dy === 0) return 0;

      const dir: 1 | -1 = dy > 0 ? 1 : -1;
      const absDy = Math.abs(dy);
      const gap = lastEventMs > 0 ? sample.nowMs - lastEventMs : Infinity;
      lastEventMs = sample.nowMs;

      if (gap >= GESTURE_IDLE_RESET_MS) {
        accum = 0;
        lockedDir = 0;
        tailPeak = 0;
      }

      // Direction reversal immediately unlocks the previous inertia tail
      if (lockedDir !== 0 && dir !== lockedDir) {
        lockedDir = 0;
        accum = 0;
        tailPeak = 0;
      }

      if (lockedDir !== 0) {
        const sinceStep = sample.nowMs - lastStepMs;
        const isReaccelerating =
          sinceStep >= REACCEL_WINDOW_MS &&
          absDy >= 28 &&
          absDy > tailPeak * 1.55;

        if (!isReaccelerating) {
          // Track decaying inertia envelope
          tailPeak = Math.min(tailPeak > 0 ? tailPeak : absDy, absDy);
          return 0;
        }
        lockedDir = 0;
        accum = 0;
      }

      if (accum !== 0 && Math.sign(accum) !== dir) {
        accum = 0;
      }
      accum += dy;

      if (
        Math.abs(accum) >= STEP_THRESHOLD &&
        sample.nowMs - lastStepMs >= MIN_STEP_COOLDOWN_MS
      ) {
        accum = 0;
        lastStepMs = sample.nowMs;
        lockedDir = dir;
        tailPeak = absDy;
        return dir;
      }

      return 0;
    },
    reset() {
      accum = 0;
      lastEventMs = 0;
      lastStepMs = 0;
      lockedDir = 0;
      tailPeak = 0;
    },
  };
}
