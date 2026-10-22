import { MediaPayload } from "../types";
import { cleanTitle, cleanArtist } from "./lyricsService";

// In-memory LRU cache for high-res album artworks (songKey -> highResUrl | null)
const artworkCache = new Map<string, string | null>();
const pendingFetches = new Map<string, Promise<string | null>>();
const artworkListeners = new Set<() => void>();

const MAX_CACHE_SIZE = 60;

function setCachedArtwork(key: string, url: string | null) {
  if (artworkCache.size >= MAX_CACHE_SIZE && !artworkCache.has(key)) {
    const oldestKey = artworkCache.keys().next().value;
    if (oldestKey !== undefined) {
      artworkCache.delete(oldestKey);
    }
  }
  artworkCache.set(key, url);
  artworkListeners.forEach((listener) => listener());
}

export function subscribeArtworkUpdates(callback: () => void): () => void {
  artworkListeners.add(callback);
  return () => {
    artworkListeners.delete(callback);
  };
}

export function invalidateCachedArtwork(key: string): void {
  if (!key) return;
  artworkCache.set(key, null);
  artworkListeners.forEach((listener) => listener());
}

export function getArtworkCacheKey(media: MediaPayload | null | undefined): string {
  if (!media || !media.title?.trim()) return "";
  const artist = (media.artist || "").trim().toLowerCase();
  const title = media.title.trim().toLowerCase();
  return artist ? `${artist} - ${title}` : title;
}

/**
 * Checks if the media source is a dedicated video / social platform.
 * For these apps, branded logos are displayed rather than album art.
 */
export function getBrandedMediaType(media: MediaPayload | null | undefined): string | null {
  if (!media) return null;
  const title = (media.title || "").toLowerCase();
  const artist = (media.artist || "").toLowerCase();
  const appId = (media.app_id || "").toLowerCase();

  if (title.includes("whatsapp") || artist.includes("whatsapp") || appId.includes("whatsapp")) {
    return "whatsapp";
  }
  if (title.includes("netflix") || artist.includes("netflix") || appId.includes("netflix")) {
    return "netflix";
  }
  if (
    title.includes("tiktok") ||
    title.includes("tik tok") ||
    artist.includes("tiktok") ||
    artist.includes("tik tok") ||
    appId.includes("tiktok")
  ) {
    return "tiktok";
  }
  if (title.includes("instagram") || artist.includes("instagram") || appId.includes("instagram")) {
    return "instagram";
  }
  if (title.includes("threads") || artist.includes("threads") || appId.includes("threads")) {
    return "threads";
  }
  if (
    title.includes("twitter") ||
    artist.includes("twitter") ||
    artist === "x" ||
    title.endsWith(" / x") ||
    title.endsWith(" | x") ||
    title.includes("on x:") ||
    title.includes("on x ") ||
    appId.includes("twitter")
  ) {
    return "x";
  }
  if (title.includes("discord") || artist.includes("discord") || appId.includes("discord")) {
    return "discord";
  }
  if (title.includes("reddit") || artist.includes("reddit") || title.includes("r/") || appId.includes("reddit")) {
    return "reddit";
  }
  return null;
}

/**
 * Identifies if the player is a third-party music client or browser web music,
 * where SMTC thumbnails are often generic placeholders (e.g. BitChord's "Alb..." box),
 * low-resolution, or missing entirely.
 */
export function isThirdPartyMusicClient(media: MediaPayload | null | undefined): boolean {
  if (!media) return false;
  const appId = (media.app_id || "").toLowerCase();
  const artist = (media.artist || "").toLowerCase();
  const title = (media.title || "").toLowerCase();

  const thirdPartySignatures = [
    "bitchord",
    "cider",
    "foobar2000",
    "foobar",
    "aimp",
    "musicbee",
    "winamp",
    "wacup",
    "dopamine",
    "ytmdesktop",
    "tidal",
    "deezer",
    "qobuz",
    "amazonmusic",
    "amazon music",
    "vlc",
    "wmplayer",
    "zune",
    "media player",
    "groove",
  ];

  for (const sig of thirdPartySignatures) {
    if (appId.includes(sig) || artist.includes(sig) || title.includes(sig)) {
      return true;
    }
  }

  // If it's a browser session playing audio/music tracks
  if (media.is_browser && media.playback_type === 1) {
    return true;
  }

  return false;
}

/**
 * Fetches high-resolution cover art from iTunes Search API,
 * with secondary fallback to Deezer API.
 */
export async function fetchHighResArtwork(media: MediaPayload): Promise<string | null> {
  const cacheKey = getArtworkCacheKey(media);
  if (!cacheKey || !media.title || media.title.trim() === "") {
    return null;
  }

  if (artworkCache.has(cacheKey)) {
    return artworkCache.get(cacheKey) ?? null;
  }

  if (pendingFetches.has(cacheKey)) {
    return pendingFetches.get(cacheKey)!;
  }

  // Skip branded social media apps
  if (getBrandedMediaType(media)) {
    return null;
  }

  const cleanedArtist = cleanArtist(media.artist || "");
  const cleanedTitle = cleanTitle(media.title);
  const query = `${cleanedArtist ? cleanedArtist + " " : ""}${cleanedTitle}`.trim();

  if (!query) {
    return null;
  }

  const fetchPromise = (async () => {
    try {
      // 1. Try iTunes Search API
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
      const res = await fetch(itunesUrl);
      if (res.ok) {
        const data = await res.json();
        const item = data?.results?.[0];
        if (item?.artworkUrl100) {
          const highRes = item.artworkUrl100.replace("100x100bb", "600x600bb");
          setCachedArtwork(cacheKey, highRes);
          return highRes;
        }
      }

      // 2. Secondary fallback: Deezer API
      const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`;
      const dRes = await fetch(deezerUrl);
      if (dRes.ok) {
        const dData = await dRes.json();
        const dItem = dData?.data?.[0];
        const deezerCover = dItem?.album?.cover_xl || dItem?.album?.cover_big;
        if (deezerCover) {
          setCachedArtwork(cacheKey, deezerCover);
          return deezerCover;
        }
      }

      setCachedArtwork(cacheKey, null);
      return null;
    } catch {
      setCachedArtwork(cacheKey, null);
      return null;
    } finally {
      pendingFetches.delete(cacheKey);
    }
  })();

  pendingFetches.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Proactively prefetch high-res cover art in background as soon as media update is received.
 */
export function prefetchArtwork(media: MediaPayload | null | undefined): void {
  if (!media || !media.title || getBrandedMediaType(media)) return;
  fetchHighResArtwork(media).catch(() => {});
}

/**
 * Returns the best thumbnail URL for display.
 * For third-party clients (BitChord, Cider, Foobar, AIMP, etc.), official high-res artwork
 * takes precedence over low-res/placeholder SMTC thumbnails.
 */
export function getResolvedArtworkUrl(
  media: MediaPayload | null | undefined,
  thumbError: boolean = false
): string | null {
  if (!media) return null;

  // Branded social apps use vector/PNG app logos
  if (getBrandedMediaType(media)) {
    return null;
  }

  const cacheKey = getArtworkCacheKey(media);
  const cachedHighRes = cacheKey ? artworkCache.get(cacheKey) : null;

  const isThirdParty = isThirdPartyMusicClient(media);

  // If high-res art has been resolved:
  if (cachedHighRes) {
    // For third-party clients (BitChord, Cider, etc.) or when SMTC failed:
    // always prefer the crystal-clear studio artwork!
    if (isThirdParty || !media.thumbnail || thumbError) {
      return cachedHighRes;
    }
    // For official Spotify desktop: keep Spotify's own high-res thumbnail unless error
    return media.thumbnail || cachedHighRes;
  }

  // If SMTC thumbnail exists and hasn't failed, use it while high-res loads
  if (media.thumbnail && !thumbError) {
    return media.thumbnail;
  }

  return null;
}
