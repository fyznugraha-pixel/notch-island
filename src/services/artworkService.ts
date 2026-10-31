import { MediaPayload } from "../types";
import { cleanTitle, cleanArtist } from "./lyricsService";
import { fetchJson } from "./lyrics/utils";

// In-memory LRU cache for high-res album artworks (songKey -> highResUrl)
const artworkCache = new Map<string, string | null>();
const pendingFetches = new Map<string, Promise<string | null>>();
const failedArtworkUrls = new Set<string>();
const failedLookupTimestamps = new Map<string, number>();
const artworkListeners = new Set<() => void>();

const MAX_CACHE_SIZE = 12;
const FAILED_LOOKUP_COOLDOWN_MS = 15_000;

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

export function clearArtworkCache(): void {
  artworkCache.clear();
  pendingFetches.clear();
  failedArtworkUrls.clear();
  failedLookupTimestamps.clear();
  artworkListeners.forEach((listener) => listener());
}

export function markArtworkUrlFailed(url: string | null | undefined): void {
  if (!url) return;
  if (!failedArtworkUrls.has(url)) {
    failedArtworkUrls.add(url);
    artworkListeners.forEach((listener) => listener());
  }
}

export function isArtworkUrlFailed(url: string | null | undefined): boolean {
  if (!url) return false;
  return failedArtworkUrls.has(url);
}

export function invalidateCachedArtwork(key: string): void {
  if (!key) return;
  artworkCache.delete(key);
  failedLookupTimestamps.delete(key);
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
 * Identifies players where studio high-res artwork (from iTunes/Apple Music or Deezer)
 * is strongly preferred over low-res, placeholder, or flaky native SMTC thumbnails.
 */
export function isThirdPartyMusicClient(media: MediaPayload | null | undefined): boolean {
  if (!media) return false;
  const appId = (media.app_id || "").toLowerCase();
  const artist = (media.artist || "").toLowerCase();
  const title = (media.title || "").toLowerCase();
  const webSource = (media.web_source || "").toLowerCase();

  // YouTube / YouTube Music natively delivers the exact video/track thumbnail in SMTC;
  // do not override with external iTunes queries.
  if (
    webSource.includes("youtube") ||
    appId.includes("youtube") ||
    artist.includes("youtube") ||
    title.includes("youtube")
  ) {
    return false;
  }

  // Spotify Desktop delivers official high-res art directly in SMTC
  if (appId.includes("spotify") || artist.includes("spotify")) {
    return false;
  }

  const studioArtworkPreferredSignatures = [
    "apple",
    "applemusic",
    "itunes",
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

  for (const sig of studioArtworkPreferredSignatures) {
    if (appId.includes(sig) || artist.includes(sig) || title.includes(sig)) {
      return true;
    }
  }

  // If it's a browser session playing audio/music tracks (except YouTube)
  if (media.is_browser && media.playback_type === 1 && !webSource.includes("youtube")) {
    return true;
  }

  return false;
}

async function searchStudioArtworkByQuery(query: string): Promise<string | null> {
  // 1. Try iTunes Search API (via Rust backend / fetchJson for reliability)
  const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=3`;
  const itunesData = await fetchJson<{ results?: Array<{ artworkUrl100?: string }> }>(itunesUrl, {
    timeoutMs: 5000,
  });
  const itunesItem = itunesData?.results?.find((r) => Boolean(r?.artworkUrl100));
  if (itunesItem?.artworkUrl100) {
    const highRes = itunesItem.artworkUrl100.replace("100x100bb", "600x600bb");
    if (!isArtworkUrlFailed(highRes)) {
      return highRes;
    }
  }

  // 2. Secondary fallback: Deezer API (via Rust backend to bypass browser CORS restrictions)
  const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=3`;
  const deezerData = await fetchJson<{
    data?: Array<{ album?: { cover_xl?: string; cover_big?: string; cover_medium?: string } }>;
  }>(deezerUrl, {
    timeoutMs: 5000,
  });
  for (const dItem of deezerData?.data || []) {
    const deezerCover = dItem?.album?.cover_xl || dItem?.album?.cover_big || dItem?.album?.cover_medium;
    if (deezerCover && !isArtworkUrlFailed(deezerCover)) {
      return deezerCover;
    }
  }

  return null;
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

  const existing = artworkCache.get(cacheKey);
  if (existing && !isArtworkUrlFailed(existing)) {
    return existing;
  }

  const lastFailedAt = failedLookupTimestamps.get(cacheKey);
  if (lastFailedAt && Date.now() - lastFailedAt < FAILED_LOOKUP_COOLDOWN_MS) {
    return null;
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
  const primaryQuery = `${cleanedArtist ? cleanedArtist + " " : ""}${cleanedTitle}`.trim();

  if (!primaryQuery) {
    return null;
  }

  const fetchPromise = (async () => {
    try {
      let resolved = await searchStudioArtworkByQuery(primaryQuery);

      // Fallback: if artist was a channel/uploader name that polluted the query, try title-only search
      if (!resolved && cleanedArtist && cleanedTitle.length >= 2 && cleanedTitle.toLowerCase() !== primaryQuery.toLowerCase()) {
        resolved = await searchStudioArtworkByQuery(cleanedTitle);
      }

      if (resolved) {
        failedLookupTimestamps.delete(cacheKey);
        setCachedArtwork(cacheKey, resolved);
        return resolved;
      }

      failedLookupTimestamps.set(cacheKey, Date.now());
      return null;
    } catch {
      failedLookupTimestamps.set(cacheKey, Date.now());
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
 * Studio high-res artwork takes precedence for Apple Music and third-party players,
 * while reliable native thumbnails (Spotify, YouTube) are displayed immediately.
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
  const isHighResValid = Boolean(cachedHighRes && !isArtworkUrlFailed(cachedHighRes));

  const isNativeFailed = thumbError || !media.thumbnail || isArtworkUrlFailed(media.thumbnail);
  const nativeThumb = isNativeFailed ? null : media.thumbnail;

  const preferStudioArt = isThirdPartyMusicClient(media);

  // 1. If high-res studio artwork has resolved:
  if (isHighResValid && cachedHighRes) {
    // For Apple Music, BitChord, Cider, or when native thumbnail failed:
    // always use the studio artwork!
    if (preferStudioArt || !nativeThumb) {
      return cachedHighRes;
    }
    // For official Spotify desktop or YouTube: keep native cover, or fallback to studio art
    return nativeThumb || cachedHighRes;
  }

  // 2. While studio artwork is loading (or if search returned nothing),
  // use native thumbnail if available and not failed:
  if (nativeThumb) {
    return nativeThumb;
  }

  // 3. If native thumb failed but high-res is available:
  if (isHighResValid && cachedHighRes) {
    return cachedHighRes;
  }

  return null;
}
