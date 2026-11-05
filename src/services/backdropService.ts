import { invoke } from "@tauri-apps/api/core";

let cachedBackdropUrl: string | null = null;
const listeners = new Set<(url: string | null) => void>();
let captureTimeout: ReturnType<typeof setTimeout> | null = null;
let isCapturing = false;

export function getCachedBackdrop(): string | null {
  return cachedBackdropUrl;
}

export function subscribeBackdrop(listener: (url: string | null) => void): () => void {
  listeners.add(listener);
  if (cachedBackdropUrl) {
    listener(cachedBackdropUrl);
  }
  return () => {
    listeners.delete(listener);
  };
}

export async function captureBackdropNow(): Promise<string | null> {
  if (isCapturing) return cachedBackdropUrl;
  isCapturing = true;
  try {
    const dataUrl = await invoke<string>("capture_notch_backdrop");
    if (dataUrl && typeof dataUrl === "string") {
      cachedBackdropUrl = dataUrl;
      listeners.forEach((fn) => fn(dataUrl));
      return dataUrl;
    }
  } catch (err) {
    console.warn("Backdrop capture skipped or unavailable:", err);
  } finally {
    isCapturing = false;
  }
  return cachedBackdropUrl;
}

export function triggerBackdropCapture(delayMs = 100) {
  if (captureTimeout) clearTimeout(captureTimeout);
  captureTimeout = setTimeout(() => {
    captureBackdropNow();
  }, delayMs);
}

if (typeof window !== "undefined") {
  window.addEventListener("focus", () => {
    triggerBackdropCapture(40);
  });
  // Periodic background wallpaper sync
  setInterval(() => {
    captureBackdropNow();
  }, 10000);
}

