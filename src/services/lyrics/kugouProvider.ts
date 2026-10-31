import { LyricsProvider, LyricsData } from "./types";
import { cleanTitle, cleanArtist, parseLrc, fetchJson, hasActualLyrics } from "./utils";

export const kugouProvider: LyricsProvider = {
  id: "kugou",
  name: "KuGou",
  async fetchLyrics(artist: string, title: string): Promise<LyricsData | null> {
    const cleanedArtist = cleanArtist(artist);
    const cleanedTitle = cleanTitle(title) || title;
    const query = `${cleanedTitle} ${cleanedArtist}`.trim();
    if (!query) return null;

    try {
      const searchUrl = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(
        query
      )}&page=1&pagesize=3`;

      const searchData = await fetchJson(searchUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      const infoList = searchData?.data?.info;
      if (!Array.isArray(infoList) || infoList.length === 0) return null;

      const songHash = infoList[0].hash;
      if (!songHash) return null;

      const candUrl = `http://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=&hash=${songHash}&album_audio_id=`;
      const candData = await fetchJson(candUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      const candidates = candData?.candidates;
      if (!Array.isArray(candidates) || candidates.length === 0) return null;

      const cid = candidates[0].id;
      const accessKey = candidates[0].accesskey;
      if (!cid || !accessKey) return null;

      const downUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${cid}&accesskey=${accessKey}&fmt=lrc&charset=utf8`;
      const downData = await fetchJson(downUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      const contentB64 = downData?.content;
      if (!contentB64) return null;

      // Decode Base64 safely in browser UTF-8
      const binaryString = window.atob(contentB64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decodedLrc = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");

      const lines = parseLrc(decodedLrc);
      if (!hasActualLyrics(lines)) return null;

      return {
        synced: true,
        lines,
        plainLyrics: decodedLrc,
        provider: "kugou",
        providerName: "KuGou",
      };
    } catch {
      return null;
    }
  },
};
