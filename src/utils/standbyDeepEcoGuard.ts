import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const DEEP_ECO_CLASS = "gili-deep-eco-paused";
let initialized = false;

function applyDeepEcoPausedState(paused: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(DEEP_ECO_CLASS, paused);
  (window as unknown as { __GILI_DEEP_ECO_PAUSED__?: boolean }).__GILI_DEEP_ECO_PAUSED__ = paused;
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
