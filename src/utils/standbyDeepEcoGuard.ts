import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const DEEP_ECO_CLASS = "gili-deep-eco-paused";
let initialized = false;
let deepEcoPaused = false;
const listeners = new Set<(paused: boolean) => void>();

export function isStandbyDeepEcoPaused(): boolean {
  return deepEcoPaused;
}

export function subscribeStandbyDeepEcoPaused(listener: (paused: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function applyDeepEcoPausedState(paused: boolean) {
  const changed = deepEcoPaused !== paused;
  deepEcoPaused = paused;
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle(DEEP_ECO_CLASS, paused);
  }
  if (typeof window !== "undefined") {
    (window as unknown as { __GILI_DEEP_ECO_PAUSED__?: boolean }).__GILI_DEEP_ECO_PAUSED__ = paused;
  }
  if (changed) {
    listeners.forEach((fn) => fn(paused));
  }
}

export function initStandbyDeepEcoGuard(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  invoke<boolean>("is_standby_deep_eco_active")
    .then((active) => applyDeepEcoPausedState(Boolean(active)))
    .catch(() => {});

  listen<boolean>("standby:deep-eco-changed", (ev) => {
    applyDeepEcoPausedState(Boolean(ev.payload));
  }).catch(() => {});
}
