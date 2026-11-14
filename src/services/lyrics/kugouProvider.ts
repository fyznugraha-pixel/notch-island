import { LyricsProvider, LyricsData } from "./types";
import { cleanTitle, cleanArtist, parseLrc, hasActualLyrics, isDummyLyricLine, pickMatchingCandidate } from "./utils";
import { fetchJson, rethrowIfFetchError, throwIfAborted } from "./lyricsHttp";
import { decodeKrcPayload, parseKrcLines } from "./krcParser";

interface KugouCandidate {
  id?: string | number;
  accesskey?: string;
  duration?: number;
  score?: number;
}

function selectBestKugouCandidate(candidates: KugouCandidate[], durationSec?: number): KugouCandidate | null {
  const valid = candidates.filter((c) => c?.id && c?.accesskey);
  if (valid.length === 0) return null;
  if (!durationSec || durationSec <= 0) return valid[0];

  const closeMatches = valid.filter((c) => {
    const candDur = Number(c.duration) ? Number(c.duration) / 1000 : 0;
    return candDur > 0 && Math.abs(candDur - durationSec) <= 6;
  });
  if (closeMatches.length > 0) {
    return closeMatches.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  }

  return valid.sort((a, b) => {
    const diffA = a.duration ? Math.abs(a.duration / 1000 - durationSec) : Infinity;
    const diffB = b.duration ? Math.abs(b.duration / 1000 - durationSec) : Infinity;
    return diffA - diffB;
  })[0];
}

function decodeBase64Utf8(base64Content: string): string {
  const binaryString = globalThis.atob(base64Content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

export const kugouProvider: LyricsProvider = {
  id: "kugou",
  name: "KuGou",
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

    try {
      const searchUrl = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(
        query
      )}&page=1&pagesize=5`;

      const searchData = await fetchJson(searchUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal,
      });

      const infoList = searchData?.data?.info;
      if (!Array.isArray(infoList) || infoList.length === 0) return null;

      const matched = pickMatchingCandidate(
        infoList,
        cleanedTitle,
        duration,
        (s: any) => s.songname,
        (s: any) => Number(s.duration) || undefined
      );
      const songHash = matched?.hash;
      if (!songHash) return null;

      const durationMs = duration && duration > 0 ? Math.round(duration * 1000) : "";
      const candUrl = `http://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=${durationMs}&hash=${songHash}&album_audio_id=`;
      const candData = await fetchJson(candUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal,
      });

      const candidates = candData?.candidates;
      if (!Array.isArray(candidates) || candidates.length === 0) return null;

      const bestCandidate = selectBestKugouCandidate(candidates, duration);
      const cid = bestCandidate?.id;
      const accessKey = bestCandidate?.accesskey;
      if (!cid || !accessKey) return null;

      const krcUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${cid}&accesskey=${accessKey}&fmt=krc&charset=utf8`;
      const krcData = await fetchJson(krcUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal,
      });

      if (typeof krcData?.content === "string" && krcData.content) {
        const decodedKrc = await decodeKrcPayload(krcData.content);
        throwIfAborted(signal);
        if (decodedKrc) {
          const krcLines = parseKrcLines(decodedKrc, isDummyLyricLine);
          if (hasActualLyrics(krcLines)) {
            return {
              synced: true,
              lines: krcLines,
              plainLyrics: krcLines.map((l) => l.text).join("\n"),
              provider: "kugou",
              providerName: "KuGou",
            };
          }
        }
      }

      const lrcUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${cid}&accesskey=${accessKey}&fmt=lrc&charset=utf8`;
      const downData = await fetchJson(lrcUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal,
      });

      const contentB64 = downData?.content;
      if (!contentB64) return null;

      const decodedLrc = decodeBase64Utf8(contentB64);
      const lines = parseLrc(decodedLrc);
      if (!hasActualLyrics(lines)) return null;

      return {
        synced: true,
        lines,
        plainLyrics: decodedLrc,
        provider: "kugou",
        providerName: "KuGou",
      };
    } catch (err) {
      rethrowIfFetchError(err);
      return null;
    }
  },
};
