import { LyricsProvider, LyricsData, LyricLine } from "./types";
import { cleanTitle, cleanArtist, fetchJson, fetchText } from "./utils";

export const geniusProvider: LyricsProvider = {
  id: "genius",
  name: "Genius",
  async fetchLyrics(artist: string, title: string): Promise<LyricsData | null> {
    const cleanedArtist = cleanArtist(artist);
    const cleanedTitle = cleanTitle(title) || title;
    const query = `${cleanedArtist ? cleanedArtist + " " : ""}${cleanedTitle}`.trim();
    if (!query) return null;

    try {
      const searchUrl = `https://genius.com/api/search/multi?q=${encodeURIComponent(query)}`;
      const searchData = await fetchJson(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      });

      const sections = searchData?.response?.sections;
      if (!Array.isArray(sections)) return null;

      const songSection = sections.find((s: any) => s.type === "song") || sections[0];
      const hits = songSection?.hits;
      if (!Array.isArray(hits) || hits.length === 0) return null;

      const path = hits[0]?.result?.path;
      if (!path) return null;

      const songPageUrl = `https://genius.com${path}`;
      const pageHtml = await fetchText(songPageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      });

      if (!pageHtml) return null;

      let cleanText = "";

      if (typeof DOMParser !== "undefined") {
        const doc = new DOMParser().parseFromString(pageHtml, "text/html");
        const containers = doc.querySelectorAll('[data-lyrics-container="true"]');
        if (containers.length > 0) {
          containers.forEach((c) => {
            c.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
            cleanText += (c.textContent || "") + "\n";
          });
        }
      }

      if (!cleanText.trim()) {
        // Fallback regex if DOMParser not available
        const containerRegex = /data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g;
        const matches = [...pageHtml.matchAll(containerRegex)];
        if (matches.length === 0) return null;

        let combinedHtml = matches.map((m) => m[1]).join("\n");
        combinedHtml = combinedHtml.replace(/<br\s*\/?>/gi, "\n");
        cleanText = combinedHtml.replace(/<[^>]+>/g, "");
      }

      cleanText = cleanText
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .trim();

      if (!cleanText) return null;

      const rawLines = cleanText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("["));

      if (rawLines.length === 0) return null;

      const lines: LyricLine[] = rawLines.map((text, idx) => ({
        time: idx,
        text,
      }));

      return {
        synced: false,
        lines,
        plainLyrics: cleanText,
        provider: "genius",
        providerName: "Genius",
      };
    } catch {
      return null;
    }
  },
};
