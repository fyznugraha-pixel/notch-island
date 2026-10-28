import { LyricsProvider, LyricsData, LyricLine } from "./types";
import { cleanTitle, cleanArtist, parseLrc, fetchJson } from "./utils";

function pickBestLrclibMatch(list: any[], duration?: number): any {
  if (!Array.isArray(list) || list.length === 0) return null;
  const syncedItems = list.filter((item: any) => item.syncedLyrics);
  const pool = syncedItems.length > 0 ? syncedItems : list;

  if (duration && duration > 0) {
    let best = pool[0];
    let bestDiff = Math.abs((best.duration || 0) - duration);
    for (const item of pool) {
      const diff = Math.abs((item.duration || 0) - duration);
      if (diff < bestDiff) {
        best = item;
        bestDiff = diff;
      }
    }
    return best;
  }
  return pool[0];
}

function processLrclibResponse(data: any): LyricsData | null {
  if (!data) return null;

  if (data.instrumental) {
    return {
      synced: false,
      lines: [],
      instrumental: true,
      provider: "lrclib",
      providerName: "LRCLIB",
    };
  }

  if (data.syncedLyrics) {
    const lines = parseLrc(data.syncedLyrics);
    if (lines.length > 0) {
      return {
        synced: true,
        lines,
        plainLyrics: data.plainLyrics,
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
    return {
      synced: false,
      lines,
      plainLyrics: data.plainLyrics,
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
    const cleanedArtist = cleanArtist(artist);
    let cleanedTitle = cleanTitle(title) || title;
    let effectiveArtist = cleanedArtist;

    if (cleanedTitle.includes(" - ")) {
      const parts = cleanedTitle.split(" - ");
      if (parts.length >= 2) {
        const prefix = parts[0].trim();
        const rest = parts.slice(1).join(" - ").trim();
        if (
          !effectiveArtist ||
          effectiveArtist.toLowerCase() === prefix.toLowerCase() ||
          effectiveArtist.toLowerCase().includes("youtube") ||
          effectiveArtist.toLowerCase().includes("browser")
        ) {
          effectiveArtist = prefix;
          cleanedTitle = rest;
        }
      }
    }

    const headers = { "User-Agent": "Gili/4.1.6 (https://github.com/faiz)" };

    try {
      let getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanedTitle)}&artist_name=${encodeURIComponent(effectiveArtist)}`;
      if (duration && duration > 0) {
        getUrl += `&duration=${Math.round(duration)}`;
      }

      const getData = await fetchJson(getUrl, { headers });
      if (getData) {
        const result = processLrclibResponse(getData);
        if (result) return result;
      }

      const searchQuery = encodeURIComponent(`${effectiveArtist} ${cleanedTitle}`.trim());
      const searchData = await fetchJson(`https://lrclib.net/api/search?q=${searchQuery}`, { headers });
      if (Array.isArray(searchData)) {
        const bestMatch = pickBestLrclibMatch(searchData, duration);
        if (bestMatch) {
          const result = processLrclibResponse(bestMatch);
          if (result) return result;
        }
      }

      if (cleanedTitle !== title || effectiveArtist) {
        const titleData = await fetchJson(
          `https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanedTitle)}`,
          { headers }
        );
        if (Array.isArray(titleData)) {
          const bestMatch = pickBestLrclibMatch(titleData, duration);
          if (bestMatch) {
            const result = processLrclibResponse(bestMatch);
            if (result) return result;
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  },
};
