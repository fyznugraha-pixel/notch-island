import { LyricsProvider, LyricsData } from "./types";
import { cleanTitle, cleanArtist, parseLrc, hasActualLyrics, isDummyLyricLine, pickMatchingCandidate } from "./utils";
import { fetchJson, rethrowIfFetchError, throwIfAborted } from "./lyricsHttp";
import { parseYrcLines } from "./wordTiming";

export const neteaseProvider: LyricsProvider = {
  id: "netease",
  name: "NetEase",
  async fetchLyrics(
    artist: string,
    title: string,
    duration?: number,
    signal?: AbortSignal
  ): Promise<LyricsData | null> {
    throwIfAborted(signal);
    const cleanedArtist = cleanArtist(artist);
    const cleanedTitle = cleanTitle(title) || title;
    const query = `${cleanedTitle} ${cleanedArtist}`.trim();
    if (!query) return null;

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
      Referer: "https://music.163.com/",
    };

    try {
      const searchUrl = `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(
        query
      )}&type=1&offset=0&limit=5`;

      const searchData = await fetchJson(searchUrl, { headers, signal });

      const songs = searchData?.result?.songs;
      if (!Array.isArray(songs) || songs.length === 0) return null;

      const matched = pickMatchingCandidate(
        songs,
        cleanedTitle,
        duration,
        (s: any) => s.name,
        (s: any) => {
          const ms = Number(s.dt ?? s.duration);
          return ms > 0 ? ms / 1000 : undefined;
        }
      );
      const songId = matched?.id;
      if (!songId) return null;

      const lyricUrl = `https://music.163.com/api/song/lyric?id=${songId}&lv=-1&tv=-1&yv=-1`;
      const lyricData = await fetchJson(lyricUrl, { headers, signal });

      const rawYrc = lyricData?.yrc?.lyric;
      if (typeof rawYrc === "string" && rawYrc.trim()) {
        const yrcLines = parseYrcLines(rawYrc, isDummyLyricLine);
        if (hasActualLyrics(yrcLines)) {
          return {
            synced: true,
            lines: yrcLines,
            plainLyrics: yrcLines.map((l) => l.text).join("\n"),
            provider: "netease",
            providerName: "NetEase",
          };
        }
      }

      const rawLrc = lyricData?.lrc?.lyric;
      if (!rawLrc || typeof rawLrc !== "string") return null;

      const lines = parseLrc(rawLrc);
      if (!hasActualLyrics(lines)) return null;

      return {
        synced: true,
        lines,
        plainLyrics: rawLrc,
        provider: "netease",
        providerName: "NetEase",
      };
    } catch (err) {
      rethrowIfFetchError(err);
      return null;
    }
  },
};
