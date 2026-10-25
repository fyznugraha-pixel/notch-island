import { LyricsProvider, LyricsData } from "./types";
import { cleanTitle, cleanArtist, parseLrc, fetchJson } from "./utils";

export const neteaseProvider: LyricsProvider = {
  id: "netease",
  name: "NetEase",
  async fetchLyrics(artist: string, title: string): Promise<LyricsData | null> {
    const cleanedArtist = cleanArtist(artist);
    const cleanedTitle = cleanTitle(title) || title;
    const query = `${cleanedTitle} ${cleanedArtist}`.trim();
    if (!query) return null;

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
      Referer: "https://music.163.com/",
      Cookie:
        "NMTID=00OAVK3xqDG726ITU6jopU6jF2yMk0AAAGCO8l1BA; JSESSIONID-WYYY=8KQo11YK2GZP45RMlz8Kn80vHZ9%2FGvwzRKQXXy0iQoFKycWdBlQjbfT0MJrFa6hwRfmpf",
      "Content-Type": "application/x-www-form-urlencoded",
    };

    try {
      const searchUrl = "https://music.163.com/api/search/pc";
      const body = `s=${encodeURIComponent(query)}&type=1&offset=0&limit=5`;

      const searchData = await fetchJson(searchUrl, {
        method: "POST",
        headers,
        body,
      });

      const songs = searchData?.result?.songs;
      if (!Array.isArray(songs) || songs.length === 0) return null;

      const songId = songs[0].id;
      if (!songId) return null;

      const lyricUrl = `https://music.163.com/api/song/lyric?id=${songId}&lv=-1&tv=-1`;
      const lyricData = await fetchJson(lyricUrl, { headers });

      const rawLrc = lyricData?.lrc?.lyric;
      if (!rawLrc || typeof rawLrc !== "string") return null;

      const lines = parseLrc(rawLrc);
      if (lines.length === 0) return null;

      return {
        synced: true,
        lines,
        plainLyrics: rawLrc,
        provider: "netease",
        providerName: "NetEase",
      };
    } catch {
      return null;
    }
  },
};
