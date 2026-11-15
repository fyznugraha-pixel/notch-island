import type { LyricLine, LyricWord } from "./types";

export {
  parseLrcTimestamp,
  parseEnhancedLrcLine,
  shiftWordsByOffset,
  parseYrcLines,
} from "./wordParsers.ts";

const CJK_KANA_CHAR_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const OPENING_PUNCT_RE = /^[([{"'「『（【《〈]/;
const CLOSING_PUNCT_RE = /^[、。！？，．.,!?;:…♪~'"”’)\]}」』）】》〉ー〜・]+$/;

export interface ResolvedLineTiming {
  words: LyricWord[];
  lineEndTime: number;
  isRealWordTiming: boolean;
}

export function hasWordTimings(lines: LyricLine[] | undefined | null): boolean {
  if (!lines || lines.length === 0) return false;
  return lines.some((line) => Boolean(line.words && line.words.length > 0));
}

export function tokenizeLineForTiming(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const tokens: string[] = [];
  const spaceChunks = normalized.matchAll(/(\S+)(\s*)/g);

  for (const match of spaceChunks) {
    const core = match[1];
    const hasTrailingSpace = Boolean(match[2]);
    const chars = Array.from(core);
    let cjkCount = 0;
    for (const ch of chars) {
      if (CJK_KANA_CHAR_RE.test(ch)) cjkCount++;
    }

    if (cjkCount < 2) {
      tokens.push(hasTrailingSpace ? `${core} ` : core);
      continue;
    }

    const chunkTokens: string[] = [];
    let pendingPrefix = "";
    let latinRun = "";

    const flushLatin = () => {
      if (!latinRun) return;
      chunkTokens.push(pendingPrefix + latinRun);
      pendingPrefix = "";
      latinRun = "";
    };

    for (const ch of chars) {
      if (CJK_KANA_CHAR_RE.test(ch)) {
        flushLatin();
        chunkTokens.push(pendingPrefix + ch);
        pendingPrefix = "";
      } else if (OPENING_PUNCT_RE.test(ch)) {
        flushLatin();
        pendingPrefix += ch;
      } else if (CLOSING_PUNCT_RE.test(ch)) {
        if (latinRun) {
          latinRun += ch;
          flushLatin();
        } else if (chunkTokens.length > 0) {
          chunkTokens[chunkTokens.length - 1] += ch;
        } else {
          pendingPrefix += ch;
        }
      } else {
        latinRun += ch;
      }
    }

    flushLatin();
    if (pendingPrefix) {
      if (chunkTokens.length > 0) {
        chunkTokens[chunkTokens.length - 1] += pendingPrefix;
      } else {
        chunkTokens.push(pendingPrefix);
      }
    }

    if (hasTrailingSpace && chunkTokens.length > 0) {
      chunkTokens[chunkTokens.length - 1] += " ";
    }
    tokens.push(...chunkTokens);
  }

  if (tokens.length > 0) {
    tokens[tokens.length - 1] = tokens[tokens.length - 1].replace(/\s+$/, "");
  }

  return tokens;
}

export function computeLineEndTime(lineTime: number, nextLineTime?: number, text = ""): number {
  let cjkChars = 0;
  let otherChars = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    if (CJK_KANA_CHAR_RE.test(ch)) cjkChars++;
    else otherChars++;
  }
  const naturalDuration = Math.min(6.2, Math.max(0.85, cjkChars * 0.3 + otherChars * 0.11 + 0.35));

  if (typeof nextLineTime === "number" && Number.isFinite(nextLineTime) && nextLineTime > lineTime) {
    const gap = nextLineTime - lineTime;
    const breath = gap > 0.8 ? Math.min(0.22, gap * 0.1) : 0;
    const maxWindow = Math.max(0.25, gap - breath);
    if (gap <= naturalDuration * 1.35) {
      return lineTime + maxWindow;
    }
    return lineTime + Math.min(maxWindow, Math.max(naturalDuration * 1.25, 1.4));
  }

  return lineTime + naturalDuration;
}

function estimateTokenWeight(token: string): number {
  let weight = 0;
  for (const ch of token) {
    if (/\s/.test(ch)) {
      weight += 0.35;
    } else if (CJK_KANA_CHAR_RE.test(ch)) {
      weight += 1.9;
    } else if (/[,;、，；]/.test(ch)) {
      weight += 1.2;
    } else if (/[.!?。！？…]/.test(ch)) {
      weight += 1.6;
    } else if (/[-~ー〜]/.test(ch)) {
      weight += 0.9;
    } else {
      weight += 1.0;
    }
  }
  return Math.max(1.4, weight);
}

export function resolveLineWords(line: LyricLine, nextLineTime?: number): ResolvedLineTiming {
  const lineEndTime = computeLineEndTime(line.time, nextLineTime, line.text);

  if (line.words && line.words.length > 0) {
    const rawWords = line.words;
    const missingSpaces =
      rawWords.length > 1 &&
      !rawWords.some((w) => /\s/.test(w.text)) &&
      rawWords.map((w) => w.text).join("") !== line.text &&
      rawWords.map((w) => w.text).join(" ") === line.text;

    const normalizedWords: LyricWord[] = rawWords.map((w, idx) => {
      const nextStart = rawWords[idx + 1]?.time;
      const inferredEnd =
        w.endTime !== undefined
          ? Math.max(w.time, w.endTime)
          : nextStart !== undefined
          ? Math.max(w.time, nextStart)
          : Math.max(w.time + 0.25, lineEndTime);
      return {
        time: w.time,
        endTime: inferredEnd,
        text: missingSpaces && idx < rawWords.length - 1 ? `${w.text} ` : w.text,
      };
    });

    const lastEnd = normalizedWords[normalizedWords.length - 1]?.endTime ?? lineEndTime;
    return {
      words: normalizedWords,
      lineEndTime: Math.max(lineEndTime, lastEnd),
      isRealWordTiming: true,
    };
  }

  const tokens = tokenizeLineForTiming(line.text);
  if (tokens.length === 0) {
    return { words: [], lineEndTime, isRealWordTiming: false };
  }

  const weights = tokens.map(estimateTokenWeight);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || tokens.length;
  const totalSpan = Math.max(0.25, lineEndTime - line.time);

  let cursorWeight = 0;
  const words: LyricWord[] = tokens.map((token, idx) => {
    const start = line.time + (cursorWeight / totalWeight) * totalSpan;
    cursorWeight += weights[idx];
    const end = idx === tokens.length - 1
      ? lineEndTime
      : line.time + (cursorWeight / totalWeight) * totalSpan;
    return {
      time: start,
      endTime: Math.max(start + 0.04, end),
      text: token,
    };
  });

  return { words, lineEndTime, isRealWordTiming: false };
}

export function computeWordFillProgress(
  word: LyricWord,
  fallbackEndTime: number,
  effectiveTime: number
): number {
  const start = word.time;
  const end = Math.max(start + 0.04, word.endTime ?? fallbackEndTime);
  if (effectiveTime <= start) return 0;
  if (effectiveTime >= end) return 1;
  return (effectiveTime - start) / (end - start);
}

export function splitWordsForWrappedRows(
  resolved: ResolvedLineTiming,
  line0: string,
  line1?: string
): { row0: LyricLine; row0NextTime?: number; row1?: LyricLine; row1NextTime?: number } {
  const words = resolved.words;
  const clean0 = line0.replace(/\u00A0/g, " ").trim();
  const clean1 = line1 ? line1.replace(/\u00A0/g, " ").trim() : "";

  if (!resolved.isRealWordTiming) {
    const baseTime = words[0]?.time ?? 0;
    return {
      row0: { time: baseTime, text: line0 },
      row0NextTime: resolved.lineEndTime,
      ...(clean1 ? { row1: { time: baseTime, text: line1! }, row1NextTime: resolved.lineEndTime } : {}),
    };
  }

  if (!clean1 || words.length === 0) {
    return {
      row0: {
        time: words[0]?.time ?? 0,
        text: line0,
        words: !clean1 && words.length > 0 ? words : undefined,
      },
      row0NextTime: resolved.lineEndTime,
    };
  }

  let acc = "";
  let splitIdx = -1;
  for (let i = 0; i < words.length; i++) {
    acc += words[i].text;
    const normalizedAcc = acc.replace(/\u00A0/g, " ").trim();
    if (normalizedAcc === clean0) {
      splitIdx = i + 1;
      break;
    }
    if (normalizedAcc.length > clean0.length) {
      break;
    }
  }

  const lineStart = words[0].time;
  const totalLen = Math.max(1, clean0.length + clean1.length);

  if (splitIdx > 0 && splitIdx < words.length) {
    const row0Words = words.slice(0, splitIdx).map((w, idx, arr) =>
      idx === arr.length - 1 ? { ...w, text: w.text.replace(/\s+$/, "") } : w
    );
    const row1Words = words.slice(splitIdx);
    const splitTime = row1Words[0].time;
    const row1Acc = row1Words.map((w) => w.text).join("").replace(/\u00A0/g, " ").trim();

    return {
      row0: { time: row0Words[0].time, text: line0, words: row0Words },
      row0NextTime: splitTime,
      row1: {
        time: splitTime,
        text: line1!,
        words: row1Acc === clean1 ? row1Words : undefined,
      },
      row1NextTime: resolved.lineEndTime,
    };
  }

  const splitTime = lineStart + (clean0.length / totalLen) * Math.max(0.25, resolved.lineEndTime - lineStart);
  return {
    row0: { time: lineStart, text: line0 },
    row0NextTime: splitTime,
    row1: { time: splitTime, text: line1! },
    row1NextTime: resolved.lineEndTime,
  };
}
