import { invoke } from "@tauri-apps/api/core";
import type { LyricLine } from "./types";

export function cleanTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/\s*[\(\[][^)\]]*\b(feat\.?|ft\.?|official|audio|video|lyric|lyrics|visualizer|mv|music video|performance|special clip|color coded|remix|version|remastered|deluxe|live|explicit|4k|hd)\b[\s\S]*?[\)\]]/gi, "")
    .replace(/\s+-\s+(official\s+(audio|video|music\s+video|lyric\s+video|visualizer)|lyric\s+video|music\s+video|visualizer|remastered(\s+\d{4})?|deluxe(\s+edition|\s+version)?|live(?:\s+(?:at|in|from|version|performance)\b|$)|\d{4}\s+remaster(ed)?)\b[\s\S]*$/gi, "")
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
  const timeRegex = /\[(\d{1,2}):(\d{2})[.:]?(\d{2,3})?\]/g;

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

/**
 * Checks if a line is a dummy placeholder, credit-only, or "no lyrics / instrumental" message.
 */
export function isDummyLyricLine(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < 2) return true;

  const dummyRegex = /^(纯音乐[，,]?\s*请[您]?欣赏|此歌曲为没有填词的纯音乐|暂无歌词|没有歌词|此歌曲为纯音乐|纯音乐|instrumental|no lyrics|written by\b|composed by\b|arranged by\b|lyrics by\b|作词\s*[:：]|作曲\s*[:：]|编曲\s*[:：]|制作人\s*[:：]|监制\s*[:：]|混音\s*[:：]|母带\s*[:：]|词\s*[:：]|曲\s*[:：])/i;

  return dummyRegex.test(trimmed);
}

/**
 * Checks whether an array of LyricLine contains actual readable song lyric content
 * and is not just empty lines or a single placeholder notice.
 */
export function hasActualLyrics(lines: LyricLine[]): boolean {
  if (!Array.isArray(lines) || lines.length === 0) return false;
  const meaningfulCount = lines.filter((l) => !isDummyLyricLine(l.text)).length;
  // A real song lyric must have at least 2 meaningful lines
  return meaningfulCount >= 2;
}

/**
 * Universal CORS-free HTTP fetcher using Tauri native Rust backend with fallback to browser fetch.
 */
export async function fetchText(
  url: string,
  options: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {}
): Promise<string | null> {
  const method = options.method || "GET";
  const headers = options.headers || {};
  const body = options.body;

  try {
    const result = await invoke<string>("fetch_external_lyrics_api", {
      url,
      method,
      headers,
      body,
    });
    return result;
  } catch {
    // Fallback to browser fetch
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs || 6000);
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        return await res.text();
      }
      return null;
    } catch {
      return null;
    }
  }
}

export async function fetchJson<T = any>(
  url: string,
  options: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {}
): Promise<T | null> {
  const text = await fetchText(url, options);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
