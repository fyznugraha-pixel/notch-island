import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LyricLine, LyricsProviderId } from "./lyrics/types";
import { fetchLyrics, clearLyricsCacheForTrack } from "./lyricsService";
import { isAbortError } from "./lyrics/lyricsHttp";
import { sanitizeLyricsPayload } from "./lyrics/payloadSanitizer";
import { LYRICS_PROVIDERS_META } from "./lyrics";

export type { LyricLine };

export interface MediaPayload {
  title: string;
  artist: string;
  album?: string | null;
  thumbnail?: string | null;
  duration: number;
  position: number;
  is_playing: boolean;
  playback_type: number;
  app_id?: string | null;
  web_source?: string | null;
  is_browser: boolean;
  can_seek?: boolean;
}

export type LyricsState = "loading" | "synced" | "plain" | "not_found" | "instrumental" | "empty";

export interface LyricsPayload {
  artist: string;
  title: string;
  state: LyricsState;
  synced: boolean;
  lines: LyricLine[];
  plain_lyrics?: string | null;
  provider: string;
  provider_name: string;
  offset: number;
}

// In-memory reactive state listeners
type MediaSubscriber = (media: MediaPayload) => void;
type LyricsSubscriber = (lyrics: LyricsPayload) => void;
export type ProgressPayload = { position: number; duration: number };
type ProgressSubscriber = (progress: ProgressPayload) => void;

const mediaSubscribers = new Set<MediaSubscriber>();
const lyricsSubscribers = new Set<LyricsSubscriber>();
const progressSubscribers = new Set<ProgressSubscriber>();

let currentProgress: ProgressPayload = { position: 0, duration: 0 };
let hasProgressSnapshot = false;

function syncOffsetLocalStorage(offset: number): void {
  if (!Number.isFinite(offset)) return;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("notch_lyrics_offset", String(offset));
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("notch_lyrics_offset_changed", { detail: offset }));
    }
  } catch {
    // ignore storage errors
  }
}

let currentMedia: MediaPayload = {
  title: "",
  artist: "",
  album: null,
  thumbnail: null,
  duration: 0,
  position: 0,
  is_playing: false,
  playback_type: 0,
  app_id: null,
  web_source: null,
  is_browser: false,
};

let currentLyrics: LyricsPayload = {
  artist: "",
  title: "",
  state: "empty",
  synced: false,
  lines: [],
  plain_lyrics: null,
  provider: "",
  provider_name: "",
  offset: 0,
};

let isStoreInitialized = false;
let initPromise: Promise<() => void> | null = null;
let storeGeneration = 0;
const SMTC_COALESCE_MS = 90;
const VALID_PROVIDER_IDS = new Set<string>(LYRICS_PROVIDERS_META.map((p) => p.id));

function readSavedProvider(): LyricsProviderId {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("notch_lyrics_provider");
      if (saved && VALID_PROVIDER_IDS.has(saved)) {
        return saved as LyricsProviderId;
      }
    }
  } catch {
    // ignore storage errors
  }
  return "auto";
}

let mediaFallbackTimerId: ReturnType<typeof setTimeout> | null = null;
let isCoordinatorActive = false;
let coordinatorAbortController: AbortController | null = null;
let coordinatorDebounceTimerId: ReturnType<typeof setTimeout> | null = null;
let lastFetchedDuration = 0;
let lastFetchedTrackKey = "";

function clearMediaFallbackTimer(): void {
  if (mediaFallbackTimerId !== null) {
    globalThis.clearTimeout(mediaFallbackTimerId);
  }
  mediaFallbackTimerId = null;
}

function cancelCoordinatorFetch(): void {
  if (coordinatorDebounceTimerId !== null) {
    globalThis.clearTimeout(coordinatorDebounceTimerId);
    coordinatorDebounceTimerId = null;
  }
  if (coordinatorAbortController) {
    coordinatorAbortController.abort();
    coordinatorAbortController = null;
  }
}

export function getCurrentMedia(): MediaPayload {
  return currentMedia;
}

export function getCurrentLyrics(): LyricsPayload {
  return currentLyrics;
}

export function subscribeMedia(subscriber: MediaSubscriber): () => void {
  mediaSubscribers.add(subscriber);
  subscriber(currentMedia);
  return () => {
    mediaSubscribers.delete(subscriber);
  };
}

export function subscribeLyrics(subscriber: LyricsSubscriber): () => void {
  lyricsSubscribers.add(subscriber);
  subscriber(currentLyrics);
  return () => {
    lyricsSubscribers.delete(subscriber);
  };
}

export function subscribeProgress(subscriber: ProgressSubscriber): () => void {
  progressSubscribers.add(subscriber);
  if (hasProgressSnapshot) {
    subscriber(currentProgress);
  }
  return () => {
    progressSubscribers.delete(subscriber);
  };
}

export async function setSongLyricsOffset(artist: string, title: string, offset: number): Promise<void> {
  try {
    currentLyrics = { ...currentLyrics, offset };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("notch_lyrics_offset", String(offset));
    }
    lyricsSubscribers.forEach((s) => s(currentLyrics));
    await invoke("set_lyrics_offset", { artist, title, offset });
    // Also dispatch window event for fast local UI feedback
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("notch_lyrics_offset_changed", { detail: offset }));
    }
  } catch (e) {
    console.error("Failed to set lyrics offset:", e);
  }
}

export async function getSongLyricsOffset(artist: string, title: string): Promise<number> {
  try {
    return await invoke<number>("get_lyrics_offset", { artist, title });
  } catch {
    return 0;
  }
}

export async function requestLyricsRefresh(artist: string, title: string, provider?: LyricsProviderId): Promise<void> {
  clearLyricsCacheForTrack(artist, title);
  const chosenProvider = provider || readSavedProvider();

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("notch_lyrics_provider", chosenProvider);
    } catch {}
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("notch_lyrics_provider_changed", { detail: chosenProvider }));
  }
  try {
    await invoke("broadcast_lyrics_loading", { artist, title, provider: chosenProvider });
  } catch (e) {
    console.error("Failed to broadcast lyrics loading:", e);
  }
}

function scheduleCoordinatorFetch(
  wantedArtist: string,
  wantedTitle: string,
  duration?: number
): void {
  if (!wantedTitle) return;
  clearMediaFallbackTimer();
  cancelCoordinatorFetch();

  coordinatorDebounceTimerId = globalThis.setTimeout(() => {
    coordinatorDebounceTimerId = null;
    if (!isStoreInitialized || !isCoordinatorActive) return;
    void triggerCoordinatorFetch(wantedArtist, wantedTitle, duration, false);
  }, SMTC_COALESCE_MS);
}

async function triggerCoordinatorFetch(
  wantedArtist: string,
  wantedTitle: string,
  duration?: number,
  bypassCache: boolean = false,
  explicitProvider?: LyricsProviderId
): Promise<void> {
  if (!wantedTitle) return;

  cancelCoordinatorFetch();

  const abortController = new AbortController();
  coordinatorAbortController = abortController;
  const isSuperseded = () =>
    abortController.signal.aborted || coordinatorAbortController !== abortController;

  const resolvedDuration = duration || currentMedia.duration || 0;
  lastFetchedDuration = resolvedDuration;
  lastFetchedTrackKey = `${wantedArtist.trim().toLowerCase()} - ${wantedTitle.trim().toLowerCase()}`;

  try {
    const preferredProvider: LyricsProviderId = explicitProvider || readSavedProvider();

    if (bypassCache) {
      clearLyricsCacheForTrack(wantedArtist, wantedTitle);
    }

    const res = await fetchLyrics(
      wantedArtist,
      wantedTitle,
      resolvedDuration,
      preferredProvider,
      bypassCache,
      abortController.signal
    );

    if (isSuperseded()) return;

    if (res && (res.lines.length > 0 || res.plainLyrics || res.instrumental)) {
      const state: LyricsState = res.instrumental
        ? "instrumental"
        : res.synced
        ? "synced"
        : "plain";

      const resultPayload = sanitizeLyricsPayload({
        artist: wantedArtist,
        title: wantedTitle,
        state,
        synced: !!res.synced,
        lines: res.lines,
        plain_lyrics: res.plainLyrics || null,
        provider: res.provider || preferredProvider,
        provider_name:
          res.providerName ||
          (preferredProvider === "auto" ? "Auto" : preferredProvider.toUpperCase()),
        offset: currentLyrics.offset || 0,
      });

      await invoke("store_lyrics_result", { payload: resultPayload });
    } else {
      const notFoundPayload = sanitizeLyricsPayload({
        artist: wantedArtist,
        title: wantedTitle,
        state: "not_found",
        synced: false,
        lines: [],
        plain_lyrics: null,
        provider: preferredProvider,
        provider_name: preferredProvider.toUpperCase(),
        offset: currentLyrics.offset || 0,
      });

      await invoke("store_lyrics_result", { payload: notFoundPayload });
    }
  } catch (err) {
    if (isSuperseded() || isAbortError(err)) return;
    console.error("[lyrics] coordinator fetch failed:", err);
    try {
      const errorPayload = sanitizeLyricsPayload({
        artist: wantedArtist,
        title: wantedTitle,
        state: "not_found",
        synced: false,
        lines: [],
        plain_lyrics: null,
        provider: "error",
        provider_name: "Error",
        offset: currentLyrics.offset || 0,
      });
      await invoke("store_lyrics_result", { payload: errorPayload });
    } catch (storeErr) {
      console.error("[lyrics] failed to store error state:", storeErr);
    }
  } finally {
    if (coordinatorAbortController === abortController) {
      coordinatorAbortController = null;
    }
  }
}

/**
 * Initializes listeners for media:update and lyrics:update.
 * If isCoordinator is true (only on the primary main Notch window),
 * this instance handles fetching lyrics when state === "loading"
 * and uploading the result to Rust so all windows stay synchronized.
 */
function promoteCoordinatorIfNeeded(): void {
  isCoordinatorActive = true;
  if (
    currentMedia &&
    currentMedia.title &&
    (!currentLyrics.title ||
      currentLyrics.state === "loading" ||
      currentLyrics.state === "not_found" ||
      currentLyrics.state === "empty")
  ) {
    triggerCoordinatorFetch(currentMedia.artist, currentMedia.title, currentMedia.duration, true);
  }
}

export async function initMediaLyricsStore(isCoordinator: boolean = false): Promise<() => void> {
  if (isCoordinator) {
    isCoordinatorActive = true;
  }

  if (isStoreInitialized) {
    if (isCoordinator) {
      promoteCoordinatorIfNeeded();
    }
    return () => {};
  }

  if (initPromise) {
    await initPromise;
    if (isCoordinator) {
      promoteCoordinatorIfNeeded();
    }
    return () => {};
  }

  const myGeneration = ++storeGeneration;
  let unlistenMedia: (() => void) | null = null;
  let unlistenProgress: (() => void) | null = null;
  let unlistenOffset: (() => void) | null = null;
  let unlistenLyrics: (() => void) | null = null;
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    storeGeneration++;
    clearMediaFallbackTimer();
    cancelCoordinatorFetch();
    unlistenMedia?.();
    unlistenProgress?.();
    unlistenOffset?.();
    unlistenLyrics?.();
    unlistenMedia = null;
    unlistenProgress = null;
    unlistenOffset = null;
    unlistenLyrics = null;
    isStoreInitialized = false;
    initPromise = null;
  };

  initPromise = (async () => {
    try {
      // Hydrate initial state from backend
      try {
        const initialMedia = await invoke<MediaPayload>("get_current_media");
        if (myGeneration !== storeGeneration) return cleanup;
        if (initialMedia) {
          currentMedia = initialMedia;
          currentProgress = {
            position: initialMedia.position || 0,
            duration: initialMedia.duration || 0,
          };
          hasProgressSnapshot = true;
          mediaSubscribers.forEach((s) => s(currentMedia));
          progressSubscribers.forEach((s) => s(currentProgress));
        }
        const initialLyrics = await invoke<LyricsPayload | null>("get_current_lyrics");
        if (myGeneration !== storeGeneration) return cleanup;
        if (initialLyrics && initialLyrics.title) {
          currentLyrics = initialLyrics;
          if (typeof initialLyrics.offset === "number") {
            syncOffsetLocalStorage(initialLyrics.offset);
          }
          lyricsSubscribers.forEach((s) => s(currentLyrics));

          if (
            isCoordinatorActive &&
            (initialLyrics.state === "loading" ||
              initialLyrics.state === "not_found" ||
              initialLyrics.state === "empty")
          ) {
            triggerCoordinatorFetch(initialLyrics.artist, initialLyrics.title, currentMedia.duration, true);
          }
        } else if (isCoordinatorActive && initialMedia && initialMedia.title) {
          triggerCoordinatorFetch(initialMedia.artist, initialMedia.title, initialMedia.duration, true);
        }
      } catch (e) {
        console.error("Failed to hydrate media/lyrics store:", e);
      }

      if (myGeneration !== storeGeneration) return cleanup;

      // Listen to media:update (and fallback media-update)
      unlistenMedia = await listen<MediaPayload>("media:update", (event) => {
        const prevMedia = currentMedia;
        currentMedia = event.payload;
        const isSameTrack =
          !!event.payload.title &&
          event.payload.title === prevMedia.title &&
          event.payload.artist === prevMedia.artist;
        if (!event.payload.title || !isSameTrack) {
          clearMediaFallbackTimer();
          currentProgress = {
            position: event.payload.position || 0,
            duration: event.payload.duration || 0,
          };
          hasProgressSnapshot = true;
          progressSubscribers.forEach((s) => s(currentProgress));
        } else if (
          event.payload.position > 0 ||
          currentProgress.position === 0 ||
          event.payload.duration !== currentProgress.duration
        ) {
          currentProgress = {
            position: event.payload.position > 0 || currentProgress.position === 0
              ? event.payload.position || 0
              : currentProgress.position,
            duration: event.payload.duration || 0,
          };
          hasProgressSnapshot = true;
          progressSubscribers.forEach((s) => s(currentProgress));
        }
        mediaSubscribers.forEach((s) => s(currentMedia));

        if (
          isCoordinatorActive &&
          event.payload.title &&
          (event.payload.title !== prevMedia.title || event.payload.artist !== prevMedia.artist)
        ) {
          const wantedArtist = event.payload.artist;
          const wantedTitle = event.payload.title;
          const wantedDuration = event.payload.duration;
          clearMediaFallbackTimer();
          // Fallback in case lyrics:update ("loading") did not already start a fetch for this track
          mediaFallbackTimerId = globalThis.setTimeout(() => {
            mediaFallbackTimerId = null;
            if (!isStoreInitialized || myGeneration !== storeGeneration) return;
            const expectedKey = `${wantedArtist.trim().toLowerCase()} - ${wantedTitle.trim().toLowerCase()}`;
            const currentLyricsKey = `${(currentLyrics.artist || "").trim().toLowerCase()} - ${(currentLyrics.title || "").trim().toLowerCase()}`;
            if (
              isCoordinatorActive &&
              lastFetchedTrackKey !== expectedKey &&
              (currentLyricsKey !== expectedKey || currentLyrics.state === "loading" || currentLyrics.state === "empty")
            ) {
              triggerCoordinatorFetch(wantedArtist, wantedTitle, currentMedia.duration || wantedDuration);
            }
          }, 120);
        }
      });
      if (myGeneration !== storeGeneration) {
        cleanup();
        return cleanup;
      }

      // Listen to live media-progress to keep position & duration lockstep across windows
      unlistenProgress = await listen<ProgressPayload>("media-progress", (event) => {
        currentProgress = event.payload;
        hasProgressSnapshot = true;
        currentMedia.position = event.payload.position;
        currentMedia.duration = event.payload.duration;
        progressSubscribers.forEach((s) => s(event.payload));

        // If initial track change had stale/zero duration and failed to find lyrics, retry once real duration arrives
        if (
          isCoordinatorActive &&
          currentMedia.title &&
          event.payload.duration > 0 &&
          currentLyrics.state === "not_found" &&
          Math.abs(event.payload.duration - lastFetchedDuration) > 3
        ) {
          triggerCoordinatorFetch(currentMedia.artist, currentMedia.title, event.payload.duration, true);
        }
      });
      if (myGeneration !== storeGeneration) {
        cleanup();
        return cleanup;
      }

      // Listen to offset changes broadcast
      unlistenOffset = await listen<number>("lyrics:offset-changed", (event) => {
        currentLyrics = { ...currentLyrics, offset: event.payload };
        syncOffsetLocalStorage(event.payload);
        lyricsSubscribers.forEach((s) => s(currentLyrics));
      });
      if (myGeneration !== storeGeneration) {
        cleanup();
        return cleanup;
      }

      // Listen to lyrics:update
      unlistenLyrics = await listen<LyricsPayload>("lyrics:update", async (event) => {
        const payload = event.payload;
        currentLyrics = payload;
        if (typeof payload.offset === "number") {
          syncOffsetLocalStorage(payload.offset);
        }
        lyricsSubscribers.forEach((s) => s(currentLyrics));

        // If this window is the primary coordinator and lyrics are loading, perform the fetch
        if (isCoordinatorActive && payload.state === "loading" && payload.title) {
          const explicitProvider = payload.provider
            ? (payload.provider as LyricsProviderId)
            : undefined;
          if (explicitProvider && typeof localStorage !== "undefined") {
            try {
              localStorage.setItem("notch_lyrics_provider", explicitProvider);
            } catch {}
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("notch_lyrics_provider_changed", { detail: explicitProvider }));
            }
          }
          if (explicitProvider) {
            triggerCoordinatorFetch(
              payload.artist,
              payload.title,
              currentMedia.duration,
              true,
              explicitProvider
            );
          } else {
            scheduleCoordinatorFetch(payload.artist, payload.title, currentMedia.duration);
          }
        }
      });
      if (myGeneration !== storeGeneration) {
        cleanup();
        return cleanup;
      }

      isStoreInitialized = true;
      return cleanup;
    } catch (err) {
      cleanup();
      throw err;
    } finally {
      if (!isStoreInitialized) {
        initPromise = null;
      }
    }
  })();

  return await initPromise;
}
