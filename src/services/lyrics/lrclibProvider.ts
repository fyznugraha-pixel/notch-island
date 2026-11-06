import { LyricsProvider, LyricsData, LyricLine } from "./types";
import { cleanTitle, cleanArtist, parseLrc, hasActualLyrics, isSameTrack } from "./utils";
import { fetchJson, rethrowIfFetchError } from "./lyricsHttp";

function pickBestLrclibMatch(list: any[], wantedTitle: string, duration?: number): any {
  if (!Array.isArray(list) || list.length === 0) return null;

  const cleanWanted = cleanTitle(wantedTitle).toLowerCase();
  const sameTrack = list.filter((item: any) => {
    if (!item?.trackName) return false;
    const cleanItem = cleanTitle(item.trackName).toLowerCase();
    return (
      cleanItem === cleanWanted ||
      isSameTrack(item.trackName, wantedTitle) ||
      isSameTrack(cleanItem, cleanWanted)
    );
  });

  const pool = sameTrack.length > 0 ? sameTrack : list;
  const syncedItems = pool.filter((item: any) => item.syncedLyrics);
  const candidates = syncedItems.length > 0 ? syncedItems : pool;

  if (duration && duration > 0) {
    let best = candidates[0];
    let bestDiff = Math.abs((best.duration || 0) - duration);
    for (const item of candidates) {
      const diff = Math.abs((item.duration || 0) - duration);
      if (diff < bestDiff) {
        best = item;
        bestDiff = diff;
      }
    }
    return best;
  }

  return candidates[0];
}

function processLrclibResponse(data: any): LyricsData | null {
  if (!data) return null;

  if (data.syncedLyrics) {
    const lines = parseLrc(data.syncedLyrics);
    if (hasActualLyrics(lines)) {
      return {
        synced: true,
        lines,
        plainLyrics: data.plainLyrics || undefined,
        provider: "lrclib",
        providerName: "LRCLIB",
      };
    }
  }

  if (data.plainLyrics) {
    const rawLines = data.plainLyrics.split("\n");
    const lines: LyricLine[] = rawLines.map((text: string, idx: number) => ({
      time: idx,
      text: text.trim(),
    }));
    if (hasActualLyrics(lines)) {
      return {
        synced: false,
        lines,
        plainLyrics: data.plainLyrics,
        provider: "lrclib",
        providerName: "LRCLIB",
      };
    }
  }

  if (data.instrumental) {
    return {
      synced: false,
      lines: [],
      instrumental: true,
      provider: "lrclib",
      providerName: "LRCLIB",
    };
  }

  return null;
}

export const lrclibProvider: LyricsProvider = {
  id: "lrclib",
  name: "LRCLIB",
  async fetchLyrics(artist: string, title: string, duration?: number): Promise<LyricsData | null> {
    let cleanedArtist = cleanArtist(artist);
    let cleanedTitle = cleanTitle(title) || title;

    // Handle "Artist - Title" or "Title - Artist" combinations
    if (cleanedTitle.includes(" - ")) {
      const parts = cleanedTitle.split(" - ");
      if (parts.length >= 2) {
        const p1 = parts[0].trim();
        const p2 = parts.slice(1).join(" - ").trim();

        if (!cleanedArtist) {
          cleanedArtist = p1;
          cleanedTitle = cleanTitle(p2) || p2;
        } else if (cleanedArtist.toLowerCase() === p1.toLowerCase()) {
          cleanedTitle = cleanTitle(p2) || p2;
        } else if (cleanedArtist.toLowerCase() === p2.toLowerCase()) {
          cleanedTitle = cleanTitle(p1) || p1;
        }
      }
    }

    const headers = { "User-Agent": "Gili/4.4.6 (https://github.com/faiz)" };

    try {
      // 1. Run exact get + targeted search in parallel for instant response (< 500ms)
      const getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanedTitle)}&artist_name=${encodeURIComponent(cleanedArtist)}`;
      const searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanedTitle)}&artist_name=${encodeURIComponent(cleanedArtist)}`;

      const [getData, searchData] = await Promise.all([
        fetchJson(getUrl, { headers }).catch(() => null),
        fetchJson(searchUrl, { headers }).catch(() => null),
      ]);

      // Check exact GET response first
      if (getData) {
        const result = processLrclibResponse(getData);
        if (result && result.synced) return result;
      }

      // Check targeted search response
      if (Array.isArray(searchData) && searchData.length > 0) {
        const bestMatch = pickBestLrclibMatch(searchData, cleanedTitle, duration);
        if (bestMatch) {
          const result = processLrclibResponse(bestMatch);
          if (result) return result;
        }
      }

      // If GET returned non-synced/plain lyrics and search had no better, use GET
      if (getData) {
        const result = processLrclibResponse(getData);
        if (result) return result;
      }

      // 2. Fallback to broad query search
      const broadQuery = encodeURIComponent(`${cleanedArtist} ${cleanedTitle}`.trim());
      const broadData = await fetchJson(`https://lrclib.net/api/search?q=${broadQuery}`, { headers });
      if (Array.isArray(broadData) && broadData.length > 0) {
        const bestMatch = pickBestLrclibMatch(broadData, cleanedTitle, duration);
        if (bestMatch) {
          const result = processLrclibResponse(bestMatch);
          if (result) return result;
        }
      }

      // 3. Fallback search by title only if artist was unknown or failed
      if (cleanedArtist) {
        const titleOnlyData = await fetchJson(
          `https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanedTitle)}`,
          { headers }
        );
        if (Array.isArray(titleOnlyData) && titleOnlyData.length > 0) {
          const bestMatch = pickBestLrclibMatch(titleOnlyData, cleanedTitle, duration);
          if (bestMatch) {
            const result = processLrclibResponse(bestMatch);
            if (result) return result;
          }
        }
      }

      return null;
    } catch (err) {
      rethrowIfFetchError(err);
      return null;
    }
  },
};
