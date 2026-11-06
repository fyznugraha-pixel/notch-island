import { LyricsProvider, LyricsProviderId, LyricsProviderMeta, LyricsData } from "./types";
import { lrclibProvider } from "./lrclibProvider";
import { qqMusicProvider } from "./qqMusicProvider";
import { geniusProvider } from "./geniusProvider";
import { neteaseProvider } from "./neteaseProvider";
import { kugouProvider } from "./kugouProvider";
import { cleanArtist, hasActualLyrics } from "./utils";

export * from "./types";
export * from "./utils";

export const LYRICS_PROVIDERS_META: LyricsProviderMeta[] = [
  {
    id: "auto",
    name: "Auto Fallback",
    badge: "Auto",
    description: "Cari otomatis di QQ Music, LRCLIB, Genius, NetEase, dan KuGou",
  },
  {
    id: "qqmusic",
    name: "QQ Music",
    badge: "QQ Music",
    description: "Katalog lirik tersinkronisasi terbesar di dunia (Tencent Music)",
  },
  {
    id: "lrclib",
    name: "LRCLIB",
    badge: "LRCLIB",
    description: "Database lirik tersinkronisasi open-source & komunitas",
  },
  {
    id: "genius",
    name: "Genius",
    badge: "Genius",
    description: "Ensiklopedia lirik musik paling terkenal dan terlengkap di dunia",
  },
  {
    id: "netease",
    name: "NetEase",
    badge: "NetEase",
    description: "Katalog lirik populer Lyrics+ untuk lagu pop, J-Pop, K-Pop, & Anime",
  },
  {
    id: "kugou",
    name: "KuGou",
    badge: "KuGou",
    description: "Koleksi lirik Asia & Barat yang sangat luas dan presisi",
  },
];

const providerMap: Record<Exclude<LyricsProviderId, "auto">, LyricsProvider> = {
  qqmusic: qqMusicProvider,
  lrclib: lrclibProvider,
  genius: geniusProvider,
  netease: neteaseProvider,
  kugou: kugouProvider,
};


const PROVIDER_TIMEOUT_MS = 8000;
const NOT_FOUND_TTL_MS = 10 * 60 * 1000;
const NETWORK_FAILURE_TTL_MS = 30 * 1000;

interface CacheEntry {
  value: LyricsData | null;
  expiresAt: number;
}

interface ProviderOutcome {
  result: LyricsData | null;
  failed: boolean;
}

const lyricsCache = new Map<string, CacheEntry>();

export function clearAllLyricsCache(): void {
  lyricsCache.clear();
}

export function clearLyricsCacheForTrack(artist: string, title: string): void {
  const cleaned = cleanArtist(artist).toLowerCase().trim();
  const t = title.toLowerCase().trim();
  for (const key of lyricsCache.keys()) {
    if (key.includes(`${cleaned} - ${t}`)) {
      lyricsCache.delete(key);
    }
  }
}

function readCache(key: string): CacheEntry | null {
  const entry = lyricsCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    lyricsCache.delete(key);
    return null;
  }
  return entry;
}

function storeResult(key: string, value: LyricsData | null, hadFailures: boolean): void {
  const ttl = value ? Infinity : hadFailures ? NETWORK_FAILURE_TTL_MS : NOT_FOUND_TTL_MS;
  lyricsCache.set(key, { value, expiresAt: Date.now() + ttl });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("provider timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function runProvider(
  provider: LyricsProvider,
  artist: string,
  title: string,
  duration?: number
): Promise<ProviderOutcome> {
  const startedAt = Date.now();
  try {
    const result = await withTimeout(provider.fetchLyrics(artist, title, duration), PROVIDER_TIMEOUT_MS);
    console.debug(`[lyrics] ${provider.id} ${result ? "hit" : "miss"} in ${Date.now() - startedAt}ms`);
    return { result, failed: false };
  } catch (err) {
    console.debug(`[lyrics] ${provider.id} failed after ${Date.now() - startedAt}ms:`, err);
    return { result: null, failed: true };
  }
}

function isUsableSynced(result: LyricsData | null): result is LyricsData {
  return !!result && result.synced && hasActualLyrics(result.lines);
}

/** Resolves with the first synced result, or null once every provider has settled without one. */
function firstSynced(outcomes: Promise<ProviderOutcome>[]): Promise<LyricsData | null> {
  return new Promise((resolve) => {
    let pending = outcomes.length;
    outcomes.forEach((outcome) => {
      outcome.then(({ result }) => {
        if (isUsableSynced(result)) resolve(result);
        if (--pending === 0) resolve(null);
      });
    });
  });
}

export async function fetchLyricsMulti(
  artist: string,
  title: string,
  duration?: number,
  providerId: LyricsProviderId = "auto",
  bypassCache = false
): Promise<LyricsData | null> {
  const cleaned = cleanArtist(artist).toLowerCase().trim();
  const t = title.toLowerCase().trim();
  const cacheKey = `${providerId}:${cleaned} - ${t}`;

  if (!bypassCache) {
    const cached = readCache(cacheKey);
    if (cached) return cached.value;
  }

  // Single explicitly requested provider
  if (providerId !== "auto") {
    const provider = providerMap[providerId];
    if (!provider) return null;
    const { result, failed } = await runProvider(provider, artist, title, duration);
    const usable = result && (hasActualLyrics(result.lines) || result.instrumental) ? result : null;
    storeResult(cacheKey, usable, failed);
    return usable;
  }

  // Auto mode: LRCLIB is the primary source. Only if it has no synced lyrics do we
  // ask the remaining providers (in parallel, first synced hit wins).
  const primary = await runProvider(lrclibProvider, artist, title, duration);
  if (isUsableSynced(primary.result)) {
    storeResult(cacheKey, primary.result, false);
    return primary.result;
  }

  const fallbackChain: LyricsProvider[] = [qqMusicProvider, neteaseProvider, kugouProvider, geniusProvider];
  const fallbackOutcomes = fallbackChain.map((provider) => runProvider(provider, artist, title, duration));

  const synced = await firstSynced(fallbackOutcomes);
  if (synced) {
    storeResult(cacheKey, synced, false);
    return synced;
  }

  // Nothing synced anywhere: prefer plain lyrics (LRCLIB first), then instrumental
  const settled = [primary, ...(await Promise.all(fallbackOutcomes))];
  const results = settled.map((o) => o.result).filter((r): r is LyricsData => r !== null);
  const fallback =
    results.find((r) => hasActualLyrics(r.lines)) ?? results.find((r) => r.instrumental) ?? null;

  storeResult(cacheKey, fallback, settled.some((o) => o.failed));
  return fallback;
}
