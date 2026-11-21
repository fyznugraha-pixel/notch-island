import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isStandbyDeepEcoPaused,
  subscribeStandbyDeepEcoPaused,
} from "../utils/standbyDeepEcoGuard";

const LEASE_RENEW_MS = 1000;
const STALE_AFTER_MS = 1200;
const UNAVAILABLE_AFTER_MS = 1800;
const BAND_COUNT = 16;
const SILENT_BANDS: number[] = new Array(BAND_COUNT).fill(0);

export interface TaskbarAudioSpectrumState {
  bands: number[] | null;
  unavailable: boolean;
}

// Backend emits on change and once on initial sync. A brief startup window avoids
// flashing the random fallback before WASAPI loopback opens; a long gap after live
// packets settles bars flat instead of freezing on the last frame.
export function useTaskbarAudioSpectrum(enabled: boolean): TaskbarAudioSpectrumState {
  const [state, setState] = useState<TaskbarAudioSpectrumState>({
    bands: null,
    unavailable: false,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ bands: null, unavailable: false });
      return;
    }
    const startedAt = Date.now();
    let lastEventAt = 0;
    const renewLease = () => {
      if (isStandbyDeepEcoPaused()) return;
      invoke("renew_taskbar_spectrum_lease").catch(() => {});
    };
    renewLease();
    const unsubDeepEco = subscribeStandbyDeepEcoPaused((paused) => {
      if (!paused) renewLease();
    });
    const leaseTimer = setInterval(() => {
      if (isStandbyDeepEcoPaused()) return;
      renewLease();
      const now = Date.now();
      if (lastEventAt && now - lastEventAt > STALE_AFTER_MS) {
        setState({ bands: SILENT_BANDS, unavailable: false });
      } else if (!lastEventAt && now - startedAt >= UNAVAILABLE_AFTER_MS) {
        setState((prev) => (prev.unavailable ? prev : { bands: null, unavailable: true }));
      }
    }, LEASE_RENEW_MS);
    const unlisten = listen<number[]>("taskbar-audio-spectrum", (ev) => {
      if (!Array.isArray(ev.payload)) return;
      lastEventAt = Date.now();
      setState({ bands: ev.payload, unavailable: false });
    });
    return () => {
      clearInterval(leaseTimer);
      unsubDeepEco();
      unlisten.then((fn) => fn());
      setState({ bands: null, unavailable: false });
    };
  }, [enabled]);

  return state;
}

export function spectrumToBarHeights(
  bands: number[],
  barCount: number,
  minPx: number,
  maxPx: number
): number[] {
  const span = bands.length / barCount;
  return Array.from({ length: barCount }, (_, i) => {
    const from = Math.floor(i * span);
    const to = Math.max(from + 1, Math.floor((i + 1) * span));
    const peak = Math.max(...bands.slice(from, to), 0);
    return Math.round(minPx + Math.min(1, peak) * (maxPx - minPx));
  });
}
