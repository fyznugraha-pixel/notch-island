import {
  LyricLine,
  LyricsData,
  LyricsProviderId,
  LyricsProviderMeta,
  LYRICS_PROVIDERS_META,
  fetchLyricsMulti,
  clearAllLyricsCache as clearAll,
  clearLyricsCacheForTrack as clearTrack,
  cleanTitle as cTitle,
  cleanArtist as cArtist,
  parseLrc as pLrc,
} from "./lyrics";

export type { LyricLine, LyricsData, LyricsProviderId, LyricsProviderMeta };
export { LYRICS_PROVIDERS_META, fetchLyricsMulti };

export const cleanTitle = cTitle;
export const cleanArtist = cArtist;
export const parseLrc = pLrc;
export const clearAllLyricsCache = clearAll;

export function clearLyricsCacheForTrack(artist: string, title: string): void {
  clearTrack(artist, title);
}

export async function fetchLyrics(
  artist: string,
  title: string,
  duration?: number,
  providerId?: LyricsProviderId,
  bypassCache = false,
  signal?: AbortSignal
): Promise<LyricsData | null> {
  const chosenProvider = providerId || (typeof window !== "undefined"
    ? ((localStorage.getItem("notch_lyrics_provider") as LyricsProviderId) || "auto")
    : "auto");

  return fetchLyricsMulti(artist, title, duration, chosenProvider, bypassCache, signal);
}
