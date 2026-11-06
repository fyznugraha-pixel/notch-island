import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LyricLine, LyricsProviderId } from "./lyrics/types";
import { fetchLyrics, clearLyricsCacheForTrack } from "./lyricsService";

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
let isCoordinatorActive = false;
let coordinatorFetchCancel: (() => void) | null = null;

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
  subscriber(currentProgress);
  return () => {
    progressSubscribers.delete(subscriber);
  };
}

export async function setSongLyricsOffset(artist: string, title: string, offset: number): Promise<void> {
  try {
    currentLyrics = { ...currentLyrics, offset };
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
  if (provider && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("notch_lyrics_provider", provider);
    } catch {}
  }
  try {
    await invoke("broadcast_lyrics_loading", { artist, title });
  } catch (e) {
    console.error("Failed to broadcast lyrics loading:", e);
  }
}

async function triggerCoordinatorFetch(wantedArtist: string, wantedTitle: string, duration?: number): Promise<void> {
  if (!wantedTitle) return;

  if (coordinatorFetchCancel) {
    coordinatorFetchCancel();
    coordinatorFetchCancel = null;
  }

  let isCancelled = false;
  coordinatorFetchCancel = () => {
    isCancelled = true;
  };

  try {
    const preferredProvider =
      (typeof localStorage !== "undefined" &&
        (localStorage.getItem("notch_lyrics_provider") as LyricsProviderId)) ||
      "auto";

    const res = await fetchLyrics(
      wantedArtist,
      wantedTitle,
      duration || currentMedia.duration || 0,
      preferredProvider
    );

    if (isCancelled) return;

    if (res && (res.lines.length > 0 || res.plainLyrics || res.instrumental)) {
      const state: LyricsState = res.instrumental
        ? "instrumental"
        : res.synced
        ? "synced"
        : "plain";

      const resultPayload: LyricsPayload = {
        artist: wantedArtist,
        title: wantedTitle,
        state,
        synced: !!res.synced,
        lines: res.lines,
        plain_lyrics: res.plainLyrics || null,
        provider: res.provider || preferredProvider,
        provider_name: res.providerName || (preferredProvider === "lrclib" ? "LRCLIB" : preferredProvider.toUpperCase()),
        offset: currentLyrics.offset || 0,
      };

      await invoke("store_lyrics_result", { payload: resultPayload });
    } else {
      const notFoundPayload: LyricsPayload = {
        artist: wantedArtist,
        title: wantedTitle,
        state: "not_found",
        synced: false,
        lines: [],
        plain_lyrics: null,
        provider: preferredProvider,
        provider_name: preferredProvider.toUpperCase(),
        offset: currentLyrics.offset || 0,
      };

      await invoke("store_lyrics_result", { payload: notFoundPayload });
    }
  } catch (err) {
    if (!isCancelled) {
      const errorPayload: LyricsPayload = {
        artist: wantedArtist,
        title: wantedTitle,
        state: "not_found",
        synced: false,
        lines: [],
        plain_lyrics: null,
        provider: "error",
        provider_name: "Error",
        offset: currentLyrics.offset || 0,
      };
      await invoke("store_lyrics_result", { payload: errorPayload });
    }
  }
}

/**
 * Initializes listeners for media:update and lyrics:update.
 * If isCoordinator is true (only on the primary main Notch window),
 * this instance handles fetching lyrics when state === "loading"
 * and uploading the result to Rust so all windows stay synchronized.
 */
export async function initMediaLyricsStore(isCoordinator: boolean = false): Promise<() => void> {
  if (isStoreInitialized) {
    if (isCoordinator) {
      isCoordinatorActive = true;
      if (
        currentMedia &&
        currentMedia.title &&
        (!currentLyrics.title || currentLyrics.state === "loading" || currentLyrics.state === "empty")
      ) {
        triggerCoordinatorFetch(currentMedia.artist, currentMedia.title, currentMedia.duration);
      }
    }
    return () => {};
  }
  isStoreInitialized = true;
  isCoordinatorActive = isCoordinator;

  // Hydrate initial state from backend
  try {
    const initialMedia = await invoke<MediaPayload>("get_current_media");
    if (initialMedia && initialMedia.title) {
      currentMedia = initialMedia;
      mediaSubscribers.forEach((s) => s(currentMedia));
    }
    const initialLyrics = await invoke<LyricsPayload | null>("get_current_lyrics");
    if (initialLyrics && initialLyrics.title) {
      currentLyrics = initialLyrics;
      lyricsSubscribers.forEach((s) => s(currentLyrics));

      if (isCoordinatorActive && initialLyrics.state === "loading") {
        triggerCoordinatorFetch(initialLyrics.artist, initialLyrics.title, currentMedia.duration);
      }
    } else if (isCoordinatorActive && initialMedia && initialMedia.title) {
      triggerCoordinatorFetch(initialMedia.artist, initialMedia.title, initialMedia.duration);
    }
  } catch (e) {
    console.error("Failed to hydrate media/lyrics store:", e);
  }

  // Listen to media:update (and fallback media-update)
  const unlistenMedia = await listen<MediaPayload>("media:update", (event) => {
    const prevMedia = currentMedia;
    currentMedia = event.payload;
    mediaSubscribers.forEach((s) => s(currentMedia));

    if (
      isCoordinatorActive &&
      event.payload.title &&
      (event.payload.title !== prevMedia.title || event.payload.artist !== prevMedia.artist)
    ) {
      triggerCoordinatorFetch(event.payload.artist, event.payload.title, event.payload.duration);
    }
  });

  // Listen to live media-progress to keep position & duration lockstep across windows
  const unlistenProgress = await listen<ProgressPayload>("media-progress", (event) => {
    currentProgress = event.payload;
    currentMedia.position = event.payload.position;
    currentMedia.duration = event.payload.duration;
    progressSubscribers.forEach((s) => s(event.payload));
  });

  // Listen to offset changes broadcast
  const unlistenOffset = await listen<number>("lyrics:offset-changed", (event) => {
    currentLyrics = { ...currentLyrics, offset: event.payload };
    lyricsSubscribers.forEach((s) => s(currentLyrics));
  });

  // Listen to lyrics:update
  const unlistenLyrics = await listen<LyricsPayload>("lyrics:update", async (event) => {
    const payload = event.payload;
    currentLyrics = payload;
    lyricsSubscribers.forEach((s) => s(currentLyrics));

    // If this window is the primary coordinator and lyrics are loading, perform the fetch
    if (isCoordinatorActive && payload.state === "loading" && payload.title) {
      triggerCoordinatorFetch(payload.artist, payload.title, currentMedia.duration);
    }
  });

  return () => {
    unlistenMedia();
    unlistenProgress();
    unlistenOffset();
    unlistenLyrics();
    isStoreInitialized = false;
  };
}
