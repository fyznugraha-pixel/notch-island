import type { LyricLine, LyricWord } from "./types";

export interface SanitizedLyricsPayload {
  artist: string;
  title: string;
  state: "loading" | "synced" | "plain" | "not_found" | "instrumental" | "empty";
  synced: boolean;
  lines: LyricLine[];
  plain_lyrics: string | null;
  provider: string;
  provider_name: string;
  offset: number;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sanitizeWords(words: LyricWord[] | undefined): LyricWord[] | undefined {
  if (!Array.isArray(words) || words.length === 0) return undefined;
  const clean: LyricWord[] = [];
  for (const w of words) {
    if (!w || typeof w.time !== "number" || !Number.isFinite(w.time)) continue;
    const text = typeof w.text === "string" ? w.text : String(w.text ?? "");
    const endTime =
      typeof w.endTime === "number" && Number.isFinite(w.endTime) ? w.endTime : undefined;
    clean.push(endTime !== undefined ? { time: w.time, endTime, text } : { time: w.time, text });
  }
  return clean.length > 0 ? clean : undefined;
}

export function sanitizeLyricLines(lines: LyricLine[] | undefined): LyricLine[] {
  if (!Array.isArray(lines) || lines.length === 0) return [];
  const clean: LyricLine[] = [];
  for (const line of lines) {
    if (!line || typeof line.time !== "number" || !Number.isFinite(line.time)) continue;
    const text = typeof line.text === "string" ? line.text : String(line.text ?? "");
    const words = sanitizeWords(line.words);
    clean.push(words ? { time: line.time, text, words } : { time: line.time, text });
  }
  return clean;
}

export function sanitizeLyricsPayload(
  payload: SanitizedLyricsPayload
): SanitizedLyricsPayload {
  const lines = sanitizeLyricLines(payload.lines);
  return {
    artist: typeof payload.artist === "string" ? payload.artist : String(payload.artist ?? ""),
    title: typeof payload.title === "string" ? payload.title : String(payload.title ?? ""),
    state: payload.state,
    synced: Boolean(payload.synced),
    lines,
    plain_lyrics: typeof payload.plain_lyrics === "string" ? payload.plain_lyrics : null,
    provider: typeof payload.provider === "string" ? payload.provider : "auto",
    provider_name: typeof payload.provider_name === "string" ? payload.provider_name : "",
    offset: finiteOr(payload.offset, 0),
  };
}
