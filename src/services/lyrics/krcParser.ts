import type { LyricLine } from "./types";
import { normalizeWordTokenSpacing } from "./wordParsers";

const KRC_XOR_KEY = new Uint8Array([
  64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105,
]);

const KRC_OFFSET_RE = /^\[offset:([+-]?\d+)\]$/i;
const KRC_LINE_RE = /^\[(\d+),(\d+)\](.*)$/;
const KRC_WORD_RE = /<(\d+),(\d+),\d+>([^<]*)/g;

export async function decodeKrcPayload(base64Content: string): Promise<string | null> {
  try {
    const cleaned = base64Content.replace(/\s+/g, "");
    if (!cleaned || typeof atob !== "function" || typeof DecompressionStream === "undefined") {
      return null;
    }

    const binary = atob(cleaned);
    if (binary.length <= 4) return null;

    // KuGou KRC files start with 4-byte ASCII magic "krc1" followed by 16-byte XORed zlib data
    if (
      binary.charCodeAt(0) !== 0x6b ||
      binary.charCodeAt(1) !== 0x72 ||
      binary.charCodeAt(2) !== 0x63 ||
      binary.charCodeAt(3) !== 0x31
    ) {
      return null;
    }

    const payloadLen = binary.length - 4;
    const xored = new Uint8Array(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      xored[i] = binary.charCodeAt(i + 4) ^ KRC_XOR_KEY[i & 15];
    }

    const decompressedStream = new Blob([xored])
      .stream()
      .pipeThrough(new DecompressionStream("deflate"));
    const decompressedBuffer = await new Response(decompressedStream).arrayBuffer();
    const text = new TextDecoder("utf-8").decode(decompressedBuffer);
    return text || null;
  } catch {
    return null;
  }
}

export function parseKrcLines(
  krcText: string,
  isDummyLine?: (text: string) => boolean
): LyricLine[] {
  const lines: LyricLine[] = [];
  if (!krcText) return lines;

  let offsetSec = 0;
  const rawLines = krcText.split(/\r?\n/);

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    const offsetMatch = trimmed.match(KRC_OFFSET_RE);
    if (offsetMatch) {
      const offsetMs = parseInt(offsetMatch[1], 10);
      if (Number.isFinite(offsetMs)) {
        offsetSec = -offsetMs / 1000;
      }
      continue;
    }

    const lineMatch = trimmed.match(KRC_LINE_RE);
    if (!lineMatch) continue;

    const lineStartSec = Math.max(0, parseInt(lineMatch[1], 10) / 1000 + offsetSec);
    const lineDurSec = Math.max(0, parseInt(lineMatch[2], 10) / 1000);
    const body = lineMatch[3] || "";

    KRC_WORD_RE.lastIndex = 0;
    const rawTokens: { time: number; endTime?: number; text: string }[] = [];
    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = KRC_WORD_RE.exec(body)) !== null) {
      const relOffsetSec = parseInt(wordMatch[1], 10) / 1000;
      const wordDurSec = Math.max(0, parseInt(wordMatch[2], 10) / 1000);
      const tokenText = wordMatch[3];
      if (!tokenText) continue;

      const wordStart = Math.max(lineStartSec, lineStartSec + relOffsetSec);
      rawTokens.push({
        time: wordStart,
        endTime: wordStart + wordDurSec,
        text: tokenText,
      });
    }

    const words = normalizeWordTokenSpacing(rawTokens);
    const cleanText = words.map((w) => w.text).join("").trim();
    if (!cleanText || words.length === 0) continue;
    if (isDummyLine && isDummyLine(cleanText)) continue;

    if (lineDurSec > 0) {
      const last = words[words.length - 1];
      const lineEndSec = lineStartSec + lineDurSec;
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
