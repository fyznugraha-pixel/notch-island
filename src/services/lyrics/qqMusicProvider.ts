import { LyricsProvider, LyricsData } from "./types";
import { cleanTitle, cleanArtist, parseLrc, fetchJson } from "./utils";

export const qqMusicProvider: LyricsProvider = {
  id: "qqmusic",
  name: "QQ Music",
  async fetchLyrics(artist: string, title: string): Promise<LyricsData | null> {
    const cleanedArtist = cleanArtist(artist);
    const cleanedTitle = cleanTitle(title) || title;
    const query = `${cleanedTitle} ${cleanedArtist}`.trim();
    if (!query) return null;

    try {
      const searchUrl = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=5&w=${encodeURIComponent(
        query
      )}&format=json`;

      const searchData = await fetchJson(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
          Referer: "https://y.qq.com/",
        },
      });

      const songList = searchData?.data?.song?.list;
      if (!Array.isArray(songList) || songList.length === 0) return null;

      const songmid = songList[0]?.songmid;
      if (!songmid) return null;

      const lyricUrl = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(
        songmid
      )}&format=json&nobase64=0`;

      const lyricData = await fetchJson(lyricUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
          Referer: "https://y.qq.com/",
        },
      });

      const b64 = lyricData?.lyric;
      if (!b64 || typeof b64 !== "string") return null;

      // Decode base64 in browser
      const binaryString = window.atob(b64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decodedLrc = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");

      const lines = parseLrc(decodedLrc);
      if (lines.length === 0) return null;

      return {
        synced: true,
        lines,
        plainLyrics: decodedLrc,
        provider: "qqmusic",
        providerName: "QQ Music",
      };
    } catch {
      return null;
    }
  },
};
