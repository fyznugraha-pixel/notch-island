import { invoke } from "@tauri-apps/api/core";
import { LyricLine } from "./types";

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
