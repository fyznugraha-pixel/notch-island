import type { LyricsData, LyricsProvider } from "./types";
import { cleanArtist, cleanTitle, hasActualLyrics, isDummyLyricLine } from "./utils";
import { fetchJson, isAbortError, LyricsFetchError, rethrowIfFetchError, throwIfAborted } from "./lyricsHttp";
import { parseTtmlLyrics } from "./ttmlParser";

interface BetterLyricsApiResponse {
  ttml?: string;
  source?: string;
}

const BETTER_LYRICS_ENDPOINTS = [
  "https://lyrics-api.boidu.dev/getLyrics",
  "https://api.betterlyrics.org/getLyrics",
];

function buildQuery(artist: string, title: string, duration?: number): string {
  const params = new URLSearchParams({
    s: title,
    a: artist,
  });
  if (duration && duration > 0) {
    params.set("d", String(Math.round(duration)));
  }
  return params.toString();
}

async function queryEndpoint(url: string, signal?: AbortSignal): Promise<{ data: LyricsData | null; notFound: boolean }> {
  try {
    const data = await fetchJson<BetterLyricsApiResponse>(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal,
    });
    const ttml = data?.ttml;
    if (typeof ttml !== "string" || !ttml.trim()) return { data: null, notFound: true };

    const lines = parseTtmlLyrics(ttml, isDummyLyricLine);
    if (!hasActualLyrics(lines)) return { data: null, notFound: true };

    return {
      data: {
        synced: true,
        lines,
        plainLyrics: lines.map((line) => line.text).join("\n"),
        provider: "betterlyrics",
        providerName: "Better Lyrics",
      },
      notFound: false,
    };
  } catch (err) {
    if (isAbortError(err)) throw err;
    // Better Lyrics returns HTTP 401/404 for tracks not in its catalog.
    if (err instanceof LyricsFetchError && /HTTP status 40[014]\b/.test(err.message)) {
      return { data: null, notFound: true };
    }
    throw err;
  }
}

export const betterLyricsProvider: LyricsProvider = {
  id: "betterlyrics",
  name: "Better Lyrics",
  async fetchLyrics(
    artist: string,
    title: string,
    duration?: number,
    signal?: AbortSignal
  ): Promise<LyricsData | null> {
    throwIfAborted(signal);
    const cleanedArtist = cleanArtist(artist);
    const cleanedTitle = cleanTitle(title) || title;
    if (!cleanedArtist || !cleanedTitle) return null;

    const query = buildQuery(cleanedArtist, cleanedTitle, duration);
    let lastNetworkErr: unknown = null;

    for (const endpoint of BETTER_LYRICS_ENDPOINTS) {
      throwIfAborted(signal);
      try {
        const { data, notFound } = await queryEndpoint(`${endpoint}?${query}`, signal);
        if (data) return data;
        // Both endpoints share the same catalog; skip mirror call when primary confirms track is absent.
        if (notFound) return null;
      } catch (err) {
        if (isAbortError(err)) throw err;
        lastNetworkErr = err;
      }
    }

    if (lastNetworkErr) {
      rethrowIfFetchError(lastNetworkErr);
    }
    return null;
  },
};
