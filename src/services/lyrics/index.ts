import { LyricsProvider, LyricsProviderId, LyricsProviderMeta, LyricsData } from "./types";
import { betterLyricsProvider } from "./betterLyricsProvider";
import { lrclibProvider } from "./lrclibProvider";
import { qqMusicProvider } from "./qqMusicProvider";
import { geniusProvider } from "./geniusProvider";
import { neteaseProvider } from "./neteaseProvider";
import { kugouProvider } from "./kugouProvider";
import { cleanArtist, hasActualLyrics } from "./utils";
import { resolveAutoLyrics, runProvider } from "./autoStrategy";

export * from "./types";
export * from "./utils";
export * from "./wordTiming";

export const LYRICS_PROVIDERS_META: LyricsProviderMeta[] = [
  {
    id: "auto",
    name: "Auto Fallback",
    badge: "Auto",
    description: "Utamakan lirik per kata (Better Lyrics, KuGou, NetEase), lalu QQ Music & Genius, dan LRCLIB sebagai opsi terakhir",
  },
  {
    id: "betterlyrics",
    name: "Better Lyrics",
    badge: "Better",
    description: "Lirik Apple Music TTML dengan sinkronisasi akurat per kata/suku kata",
  },
  {
    id: "kugou",
    name: "KuGou",
    badge: "KuGou",
    description: "Koleksi lirik KRC per kata Asia & Barat yang sangat luas dan presisi",
  },
  {
    id: "netease",
    name: "NetEase",
    badge: "NetEase",
    description: "Katalog lirik populer YRC & LRC untuk lagu pop, J-Pop, K-Pop, & Anime",
  },
  {
    id: "lrclib",
    name: "LRCLIB",
    badge: "LRCLIB",
    description: "Database lirik tersinkronisasi open-source & komunitas",
  },
  {
    id: "qqmusic",
    name: "QQ Music",
    badge: "QQ Music",
    description: "Katalog lirik tersinkronisasi terbesar di dunia (Tencent Music)",
  },
  {
    id: "genius",
    name: "Genius",
    badge: "Genius",
    description: "Ensiklopedia lirik musik paling terkenal dan terlengkap di dunia",
  },
];

const providerMap: Record<Exclude<LyricsProviderId, "auto">, LyricsProvider> = {
  betterlyrics: betterLyricsProvider,
  qqmusic: qqMusicProvider,
  lrclib: lrclibProvider,
  genius: geniusProvider,
  netease: neteaseProvider,
  kugou: kugouProvider,
};


const NOT_FOUND_TTL_MS = 10 * 60 * 1000;
const NETWORK_FAILURE_TTL_MS = 30 * 1000;

interface CacheEntry {
  value: LyricsData | null;
  expiresAt: number;
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

export async function fetchLyricsMulti(
  artist: string,
  title: string,
  duration?: number,
  providerId: LyricsProviderId = "auto",
  bypassCache = false,
  signal?: AbortSignal
): Promise<LyricsData | null> {
  if (signal?.aborted) return null;

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
    const { result, failed } = await runProvider(provider, artist, title, duration, signal);
    if (signal?.aborted) return null;
    const usable = result && (hasActualLyrics(result.lines) || result.instrumental) ? result : null;
    storeResult(cacheKey, usable, failed);
    return usable;
  }

  // Auto mode prioritizes genuine word-timed sources (Better Lyrics TTML -> KuGou KRC -> NetEase YRC),
  // then non-LRCLIB fallbacks (QQ Music -> Genius), with LRCLIB strictly as a last resort.
  const { lyrics, hadFailures } = await resolveAutoLyrics(
    {
      betterlyrics: betterLyricsProvider,
      kugou: kugouProvider,
      netease: neteaseProvider,
      lrclib: lrclibProvider,
      extra: [qqMusicProvider, geniusProvider],
    },
    artist,
    title,
    duration,
    signal
  );

  if (signal?.aborted) return null;
  storeResult(cacheKey, lyrics, hadFailures);
  return lyrics;
}
