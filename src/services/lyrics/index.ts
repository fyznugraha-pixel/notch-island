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

const lyricsCache = new Map<string, LyricsData | null>();

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

  if (!bypassCache && lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey) || null;
  }

  // 1. Single explicitly requested provider
  if (providerId !== "auto") {
    const provider = providerMap[providerId];
    if (provider) {
      try {
        const result = await provider.fetchLyrics(artist, title, duration);
        if (result && (hasActualLyrics(result.lines) || result.instrumental)) {
          lyricsCache.set(cacheKey, result);
          return result;
        }
      } catch {}
    }
    lyricsCache.set(cacheKey, null);
    return null;
  }

  // 2. AUTO MODE: Multi-source fallback pipeline
  // Priority: LRCLIB (verified community synced) -> QQ Music -> NetEase -> KuGou -> Genius (rich plain text)
  const autoChain: LyricsProvider[] = [
    lrclibProvider,
    qqMusicProvider,
    neteaseProvider,
    kugouProvider,
    geniusProvider,
  ];

  let candidatePlain: LyricsData | null = null;
  let candidateInstrumental: LyricsData | null = null;

  for (const provider of autoChain) {
    try {
      const result = await provider.fetchLyrics(artist, title, duration);
      if (!result) continue;

      // High priority: Valid synchronized lyrics with actual readable text
      if (result.synced && hasActualLyrics(result.lines)) {
        lyricsCache.set(cacheKey, result);
        return result;
      }

      // Plain lyrics candidate (e.g. from Genius or unsynced match)
      if (!candidatePlain && hasActualLyrics(result.lines)) {
        candidatePlain = result;
      }

      // Instrumental candidate (only used if NO provider has readable lyrics)
      if (!candidateInstrumental && result.instrumental) {
        candidateInstrumental = result;
      }
    } catch {}
  }

  // If no synced lyrics were found across all providers, but plain lyrics exist
  if (candidatePlain) {
    lyricsCache.set(cacheKey, candidatePlain);
    return candidatePlain;
  }

  // If no lyrics exist anywhere, but verified instrumental
  if (candidateInstrumental) {
    lyricsCache.set(cacheKey, candidateInstrumental);
    return candidateInstrumental;
  }

  lyricsCache.set(cacheKey, null);
  return null;
}
