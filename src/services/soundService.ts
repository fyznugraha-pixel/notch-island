// Crisp, satisfying iOS / macOS Sonoma-inspired acoustic UI synthesis (Web Audio API)
import { getDndStatus } from "./notificationHistoryService";

let sharedAudioCtx: AudioContext | null = null;
let lastVolumeTickMs = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!sharedAudioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        sharedAudioCtx = new Ctx({ latencyHint: "interactive" });
      }
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function withRunningAudioContext(cb: (ctx: AudioContext) => void): void {
  if (!isSoundEffectsEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx
      .resume()
      .then(() => {
        cb(ctx);
      })
      .catch(() => {});
  } else {
    cb(ctx);
  }
}

// Unlock AudioContext on first user interaction as a fallback
if (typeof window !== "undefined") {
  const unlock = () => {
    if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
      sharedAudioCtx.resume().catch(() => {});
    }
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("wheel", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
}

export function isSoundEffectsEnabled(): boolean {
  try {
    return localStorage.getItem("island_sound_effects") !== "false";
  } catch {
    return true;
  }
}

export function setSoundEffectsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem("island_sound_effects", String(enabled));
  } catch {
    // ignore storage errors
  }
}

interface GlassBellNote {
  freq: number;
  delay: number;
  duration: number;
  gain?: number;
  overtoneRatio?: number;
  overtoneGain?: number;
  shimmerRatio?: number;
  shimmerGain?: number;
  cutoff?: number;
  pitchGlideTo?: number;
}

/**
 * Plays a bright, crystalline iOS-style glass marimba / bell sequence.
 */
function playIosGlassSequence(notes: GlassBellNote[]) {
  withRunningAudioContext((ctx) => {
    const baseNow = ctx.currentTime;

    for (const n of notes) {
      const start = baseNow + n.delay;
      const stop = start + n.duration;
      const peakGain = n.gain ?? 0.16;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(n.cutoff ?? 4200, start);
      filter.frequency.exponentialRampToValueAtTime(Math.max(900, (n.cutoff ?? 4200) * 0.45), stop);
      filter.Q.setValueAtTime(1.1, start);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, start);
      masterGain.gain.linearRampToValueAtTime(peakGain, start + 0.005);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, stop);

      filter.connect(masterGain);
      masterGain.connect(ctx.destination);

      // 1. Fundamental crystalline sine
      const oscFund = ctx.createOscillator();
      oscFund.type = "sine";
      oscFund.frequency.setValueAtTime(n.freq, start);
      if (n.pitchGlideTo) {
        oscFund.frequency.exponentialRampToValueAtTime(n.pitchGlideTo, stop);
      }
      oscFund.connect(filter);
      oscFund.start(start);
      oscFund.stop(stop + 0.015);

      // 2. Second harmonic (bright bell body)
      const overtoneRatio = n.overtoneRatio ?? 2.0;
      const overtoneGainVal = n.overtoneGain ?? 0.28;
      if (overtoneGainVal > 0) {
        const oscHarm = ctx.createOscillator();
        const harmGain = ctx.createGain();
        oscHarm.type = "triangle";
        oscHarm.frequency.setValueAtTime(n.freq * overtoneRatio, start);
        if (n.pitchGlideTo) {
          oscHarm.frequency.exponentialRampToValueAtTime(n.pitchGlideTo * overtoneRatio, stop);
        }
        harmGain.gain.setValueAtTime(overtoneGainVal, start);
        harmGain.gain.exponentialRampToValueAtTime(0.001, start + n.duration * 0.6);

        oscHarm.connect(harmGain);
        harmGain.connect(filter);
        oscHarm.start(start);
        oscHarm.stop(stop + 0.015);
      }

      // 3. Third shimmer harmonic (iOS glassy attack sparkle)
      const shimmerRatio = n.shimmerRatio ?? 3.0;
      const shimmerGainVal = n.shimmerGain ?? 0.12;
      if (shimmerGainVal > 0) {
        const oscShim = ctx.createOscillator();
        const shimGain = ctx.createGain();
        oscShim.type = "sine";
        oscShim.frequency.setValueAtTime(n.freq * shimmerRatio, start);
        shimGain.gain.setValueAtTime(shimmerGainVal, start);
        shimGain.gain.exponentialRampToValueAtTime(0.0008, start + Math.min(0.065, n.duration * 0.35));

        oscShim.connect(shimGain);
        shimGain.connect(filter);
        oscShim.start(start);
        oscShim.stop(start + Math.min(0.08, n.duration));
      }
    }
  });
}

/**
 * Crisp, satisfying iOS picker-wheel / macOS Sonoma bubble-pop for Volume & Brightness steps.
 * Bright mid-high frequencies (700Hz -> 1380Hz) so it is clearly audible and snappy, never deep/muddy.
 */
export function playVolumeTick(levelPercent?: number) {
  if (!isSoundEffectsEnabled()) return;
  const nowMs = performance.now();
  if (nowMs - lastVolumeTickMs < 36) return;
  lastVolumeTickMs = nowMs;

  withRunningAudioContext((ctx) => {
    const now = ctx.currentTime;
    const norm =
      typeof levelPercent === "number" ? Math.max(0, Math.min(100, levelPercent)) / 100 : 0.6;

    // Upward droplet pop (macOS Sonoma / iOS bubble pop signature: fast upward pitch scoop)
    const popStartFreq = 640 + norm * 220; // 640Hz .. 860Hz
    const popEndFreq = 1180 + norm * 420; // 1180Hz .. 1600Hz

    const popGain = ctx.createGain();
    popGain.gain.setValueAtTime(0.0001, now);
    popGain.gain.linearRampToValueAtTime(0.22, now + 0.004);
    popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);

    const popOsc = ctx.createOscillator();
    popOsc.type = "sine";
    popOsc.frequency.setValueAtTime(popStartFreq, now);
    popOsc.frequency.exponentialRampToValueAtTime(popEndFreq, now + 0.034);

    // Crisp iOS Taptic transient snap (adds tactile definition on laptop speakers)
    const snapGain = ctx.createGain();
    snapGain.gain.setValueAtTime(0.09, now);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.014);

    const snapOsc = ctx.createOscillator();
    snapOsc.type = "triangle";
    snapOsc.frequency.setValueAtTime(popEndFreq * 1.5, now);
    snapOsc.frequency.exponentialRampToValueAtTime(popStartFreq * 1.2, now + 0.014);

    popOsc.connect(popGain);
    snapOsc.connect(snapGain);
    popGain.connect(ctx.destination);
    snapGain.connect(ctx.destination);

    popOsc.start(now);
    popOsc.stop(now + 0.042);
    snapOsc.start(now);
    snapOsc.stop(now + 0.016);
  });
}

/**
 * iOS MagSafe-inspired crystalline charging chime.
 */
export function playChargingSound(isCharging = true) {
  if (isCharging) {
    playIosGlassSequence([
      { freq: 783.99, delay: 0.0, duration: 0.24, gain: 0.14, cutoff: 3800 }, // G5
      { freq: 987.77, delay: 0.06, duration: 0.26, gain: 0.15, cutoff: 4200 }, // B5
      { freq: 1174.66, delay: 0.12, duration: 0.3, gain: 0.16, cutoff: 4600 }, // D6
      { freq: 1567.98, delay: 0.18, duration: 0.48, gain: 0.18, cutoff: 5200 }, // G6
    ]);
  } else {
    playIosGlassSequence([
      { freq: 987.77, delay: 0.0, duration: 0.18, gain: 0.12, cutoff: 3200 }, // B5
      { freq: 659.25, delay: 0.065, duration: 0.26, gain: 0.11, cutoff: 2600 }, // E5
    ]);
  }
}

/**
 * iOS AirPods Pro-inspired bright two-note connection chime (E5 -> B5).
 */
export function playDeviceConnectSound() {
  if (getDndStatus()) return;
  playIosGlassSequence([
    { freq: 659.25, delay: 0.0, duration: 0.22, gain: 0.16, cutoff: 3800 }, // E5
    { freq: 987.77, delay: 0.085, duration: 0.38, gain: 0.18, cutoff: 4600 }, // B5
  ]);
}

/**
 * iOS "Rebound / Tri-tone" glass pluck notification sound.
 */
export function playNotificationSound() {
  if (getDndStatus()) return;
  playIosGlassSequence([
    { freq: 659.25, delay: 0.0, duration: 0.13, gain: 0.14, cutoff: 3600 }, // E5
    { freq: 880.0, delay: 0.055, duration: 0.15, gain: 0.15, cutoff: 4200 }, // A5
    { freq: 1318.51, delay: 0.11, duration: 0.28, gain: 0.16, cutoff: 4800 }, // E6
  ]);
}

/**
 * iOS "Aurora" crystalline chord for Pomodoro completion.
 */
export function playPomodoroAlertSound() {
  playIosGlassSequence([
    { freq: 698.46, delay: 0.0, duration: 0.26, gain: 0.15, cutoff: 3800 }, // F5
    { freq: 880.0, delay: 0.08, duration: 0.28, gain: 0.16, cutoff: 4200 }, // A5
    { freq: 1046.5, delay: 0.16, duration: 0.32, gain: 0.17, cutoff: 4600 }, // C6
    { freq: 1396.91, delay: 0.24, duration: 0.5, gain: 0.18, cutoff: 5200 }, // F6
  ]);
}

/**
 * iOS Reminders / Apple Pay crisp two-note sparkle when completing a task.
 */
export function playTaskCompleteSound() {
  playIosGlassSequence([
    { freq: 880.0, delay: 0.0, duration: 0.11, gain: 0.14, cutoff: 4200 }, // A5
    { freq: 1318.51, delay: 0.048, duration: 0.24, gain: 0.16, cutoff: 5000 }, // E6
  ]);
}

/**
 * iOS "Note" two-tone bell chime for task deadline reminders.
 */
export function playReminderSound() {
  if (getDndStatus()) return;
  playIosGlassSequence([
    { freq: 783.99, delay: 0.0, duration: 0.18, gain: 0.15, cutoff: 4000 }, // G5
    { freq: 1174.66, delay: 0.08, duration: 0.34, gain: 0.17, cutoff: 4800 }, // D6
  ]);
}

/**
 * iOS stereo sound check / audio test chime sequence (C5 -> E5 -> G5 -> C6).
 */
export function playAudioTestSound() {
  playIosGlassSequence([
    { freq: 523.25, delay: 0.0, duration: 0.22, gain: 0.18, cutoff: 4200 }, // C5
    { freq: 659.25, delay: 0.10, duration: 0.22, gain: 0.20, cutoff: 4600 }, // E5
    { freq: 783.99, delay: 0.20, duration: 0.26, gain: 0.22, cutoff: 5000 }, // G5
    { freq: 1046.5, delay: 0.30, duration: 0.45, gain: 0.24, cutoff: 5400 }, // C6
  ]);
}
