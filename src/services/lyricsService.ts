export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsData {
  synced: boolean;
  lines: LyricLine[];
  plainLyrics?: string;
  instrumental?: boolean;
}

const lyricsCache = new Map<string, LyricsData | null>();

export function cleanTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/\s*[\(\[][^)\]]*(feat\.|ft\.|official|audio|video|lyric|lyrics|visualizer|mv|music video|performance|special clip|color coded|remix|version|remastered|deluxe|live|explicit|4k|hd)[\s\S]*?[\)\]]/gi, "")
    .replace(/\s*-\s*(official|audio|video|lyric|lyrics|visualizer|mv|music video|remix|version|remastered|deluxe|live)[\s\S]*$/gi, "")
    .replace(/\s*\|\s*[\s\S]*$/g, "")
    .trim();
}

export function cleanArtist(artist: string): string {
  if (!artist) return "";
  return artist
    .replace(/\s*-\s*topic$/i, "")
    .replace(/vevo$/i, "")
    .trim();
}

export function parseLrc(lrcContent: string): LyricLine[] {
  if (!lrcContent) return [];
  const lines = lrcContent.split("\n");
  const parsed: LyricLine[] = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})\.?(\d{2,3})?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const matches = [...trimmed.matchAll(timeRegex)];
    if (matches.length > 0) {
      const text = trimmed.replace(timeRegex, "").trim();
      for (const match of matches) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const millis = match[3] ? parseInt(match[3].padEnd(3, "0").slice(0, 3), 10) : 0;
        const timeInSeconds = mins * 60 + secs + millis / 1000;
        parsed.push({ time: timeInSeconds, text });
      }
    }
  }

  return parsed.sort((a, b) => a.time - b.time);
}

async function fetchWithTimeout(url: string, headers: Record<string, string>, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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

export async function fetchLyrics(
  artist: string,
  title: string,
  duration?: number
): Promise<LyricsData | null> {
  const cleanedArtist = cleanArtist(artist);
  const cacheKey = `${cleanedArtist.toLowerCase().trim()} - ${title.toLowerCase().trim()}`;
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey) || null;
  }

  let cleanedTitle = cleanTitle(title) || title;
  let effectiveArtist = cleanedArtist;

  // On YouTube / YouTube Music, uploaded tracks often put "Artist - Song" inside the title
  if (cleanedTitle.includes(" - ")) {
    const parts = cleanedTitle.split(" - ");
    if (parts.length >= 2) {
      const prefix = parts[0].trim();
      const rest = parts.slice(1).join(" - ").trim();
      if (
        !effectiveArtist ||
        effectiveArtist.toLowerCase() === prefix.toLowerCase() ||
        effectiveArtist.toLowerCase().includes("youtube") ||
        effectiveArtist.toLowerCase().includes("browser") ||
        effectiveArtist.toLowerCase().includes("chrome") ||
        effectiveArtist.toLowerCase().includes("edge")
      ) {
        effectiveArtist = prefix;
        cleanedTitle = rest;
      }
    }
  }

  const headers = { "User-Agent": "Notch/3.2.4 (https://github.com/faiz)" };
  let hadTransientError = false;

  try {
    let getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanedTitle)}&artist_name=${encodeURIComponent(effectiveArtist)}`;
    if (duration && duration > 0) {
      getUrl += `&duration=${Math.round(duration)}`;
    }

    const getRes = await fetchWithTimeout(getUrl, headers);
    if (getRes.ok) {
      const data = await getRes.json();
      const result = processLrclibResponse(data);
      if (result) {
        lyricsCache.set(cacheKey, result);
        return result;
      }
    } else if (getRes.status === 429 || getRes.status >= 500) {
      hadTransientError = true;
    }

    const searchQuery = encodeURIComponent(`${effectiveArtist} ${cleanedTitle}`.trim());
    const searchRes = await fetchWithTimeout(`https://lrclib.net/api/search?q=${searchQuery}`, headers);
    if (searchRes.ok) {
      const list = await searchRes.json();
      const bestMatch = pickBestLrclibMatch(list, duration);
      if (bestMatch) {
        const result = processLrclibResponse(bestMatch);
        if (result) {
          lyricsCache.set(cacheKey, result);
          return result;
        }
      }
    } else if (searchRes.status === 429 || searchRes.status >= 500) {
      hadTransientError = true;
    }

    if (cleanedTitle !== title || effectiveArtist) {
      const titleRes = await fetchWithTimeout(`https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanedTitle)}`, headers);
      if (titleRes.ok) {
        const list = await titleRes.json();
        const bestMatch = pickBestLrclibMatch(list, duration);
        if (bestMatch) {
          const result = processLrclibResponse(bestMatch);
          if (result) {
            lyricsCache.set(cacheKey, result);
            return result;
          }
        }
      } else if (titleRes.status === 429 || titleRes.status >= 500) {
        hadTransientError = true;
      }
    }

    if (!hadTransientError) {
      lyricsCache.set(cacheKey, null);
    }
    return null;
  } catch (error) {
    console.error("Failed to fetch lyrics:", error);
    return null;
  }
}

function processLrclibResponse(data: any): LyricsData | null {
  if (!data) return null;

  if (data.instrumental) {
    return {
      synced: false,
      lines: [],
      instrumental: true,
    };
  }

  if (data.syncedLyrics) {
    const lines = parseLrc(data.syncedLyrics);
    if (lines.length > 0) {
      return {
        synced: true,
        lines,
        plainLyrics: data.plainLyrics,
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
    };
  }

  return null;
}
