import type { LyricLine, LyricWord } from "./types";

const INLINE_LRC_TAG_RE = /<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>/g;
const YRC_LINE_RE = /^\[(\d+),(\d+)\](.*)$/;
const YRC_WORD_RE = /\((\d+),(\d+),\d+\)([\s\S]*?)(?=\(\d+,\d+,\d+\)|$)/g;

export function parseLrcTimestamp(minStr: string, secStr: string, fracStr?: string): number {
  const minutes = parseInt(minStr, 10) || 0;
  const seconds = parseInt(secStr, 10) || 0;
  let frac = 0;
  if (fracStr) {
    const num = parseInt(fracStr, 10) || 0;
    if (fracStr.length === 1) frac = num / 10;
    else if (fracStr.length === 2) frac = num / 100;
    else frac = num / 1000;
  }
  return minutes * 60 + seconds + frac;
}

export function normalizeWordTokenSpacing(
  rawTokens: { time: number; endTime?: number; text: string }[]
): LyricWord[] {
  const normalized: LyricWord[] = [];

  for (const token of rawTokens) {
    const hasLeadingSpace = /^\s+/.test(token.text);
    const hasTrailingSpace = /\s+$/.test(token.text);
    const core = token.text.trim().replace(/\s+/g, " ");

    if (!core) {
      if (normalized.length > 0 && /\s/.test(token.text)) {
        const prev = normalized[normalized.length - 1];
        if (!/\s$/.test(prev.text)) {
          prev.text = `${prev.text} `;
        }
      }
      continue;
    }

    if (hasLeadingSpace && normalized.length > 0) {
      const prev = normalized[normalized.length - 1];
      if (!/\s$/.test(prev.text)) {
        prev.text = `${prev.text} `;
      }
    }

    const prevTime = normalized.length > 0 ? normalized[normalized.length - 1].time : 0;
    const startTime = Math.max(prevTime, token.time);
    normalized.push({
      time: startTime,
      endTime: token.endTime !== undefined ? Math.max(startTime, token.endTime) : undefined,
      text: hasTrailingSpace ? `${core} ` : core,
    });
  }

  if (normalized.length > 0) {
    const last = normalized[normalized.length - 1];
    last.text = last.text.replace(/\s+$/, "");
  }

  for (let i = 0; i < normalized.length - 1; i++) {
    if (normalized[i].endTime === undefined) {
      normalized[i].endTime = Math.max(normalized[i].time, normalized[i + 1].time);
    }
  }

  return normalized;
}

export function parseEnhancedLrcLine(
  rawBody: string,
  lineTime: number
): { cleanText: string; words?: LyricWord[] } {
  INLINE_LRC_TAG_RE.lastIndex = 0;
  const matches = Array.from(rawBody.matchAll(INLINE_LRC_TAG_RE));
  if (matches.length === 0) {
    return { cleanText: rawBody.trim() };
  }

  const rawTokens: { time: number; endTime?: number; text: string }[] = [];
  const firstMatch = matches[0];
  const prefix = rawBody.slice(0, firstMatch.index ?? 0);
  if (prefix.trim().length > 0) {
    rawTokens.push({ time: lineTime, text: prefix });
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const startIdx = (m.index ?? 0) + m[0].length;
    const endIdx = i + 1 < matches.length ? (matches[i + 1].index ?? rawBody.length) : rawBody.length;
    const tagTime = parseLrcTimestamp(m[1], m[2], m[3]);
    const segment = rawBody.slice(startIdx, endIdx);

    if (segment.length === 0) {
      // Empty trailing <mm:ss.xx> tags mark the end timestamp of the preceding word.
      if (rawTokens.length > 0) {
        const prev = rawTokens[rawTokens.length - 1];
        prev.endTime = Math.max(prev.time, tagTime);
      }
      continue;
    }

    rawTokens.push({ time: tagTime, text: segment });
  }

  const words = normalizeWordTokenSpacing(rawTokens);
  const cleanText = words.map((w) => w.text).join("").trim();
  if (!cleanText || words.length === 0) {
    return { cleanText: rawBody.replace(INLINE_LRC_TAG_RE, "").trim() };
  }

  return { cleanText, words };
}

export function shiftWordsByOffset(words: LyricWord[], offsetSec: number): LyricWord[] {
  return words.map((w) => ({
    time: Math.max(0, w.time + offsetSec),
    endTime: w.endTime !== undefined ? Math.max(0, w.endTime + offsetSec) : undefined,
    text: w.text,
  }));
}

export function parseYrcLines(
  yrcText: string,
  isDummyLine?: (text: string) => boolean
): LyricLine[] {
  const lines: LyricLine[] = [];
  if (!yrcText) return lines;

  for (const rawLine of yrcText.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("{")) continue;

    const lineMatch = trimmed.match(YRC_LINE_RE);
    if (!lineMatch) continue;

    const lineStartSec = parseInt(lineMatch[1], 10) / 1000;
    const lineDurSec = parseInt(lineMatch[2], 10) / 1000;
    const body = lineMatch[3] || "";

    YRC_WORD_RE.lastIndex = 0;
    const rawTokens: { time: number; endTime?: number; text: string }[] = [];
    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = YRC_WORD_RE.exec(body)) !== null) {
      const startSec = Math.max(lineStartSec, parseInt(wordMatch[1], 10) / 1000);
      const durSec = Math.max(0, parseInt(wordMatch[2], 10) / 1000);
      const tokenText = wordMatch[3];
      if (!tokenText) continue;
      rawTokens.push({
        time: startSec,
        endTime: startSec + durSec,
        text: tokenText,
      });
    }

    const words = normalizeWordTokenSpacing(rawTokens);
    const cleanText = words.map((w) => w.text).join("").trim();
    if (!cleanText || words.length === 0) continue;
    if (isDummyLine && isDummyLine(cleanText)) continue;

    if (lineDurSec > 0 && words.length > 0) {
      const lineEndSec = lineStartSec + lineDurSec;
      const last = words[words.length - 1];
      if (last.endTime === undefined || last.endTime < last.time) {
        last.endTime = Math.max(last.time, lineEndSec);
      }
    }

    lines.push({
      time: lineStartSec,
      text: cleanText,
      words,
    });
  }

  lines.sort((a, b) => a.time - b.time);
  return lines;
}
