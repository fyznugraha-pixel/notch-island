import type { LyricLine } from "./types";
import { normalizeWordTokenSpacing } from "./wordParsers";

const BODY_RE = /<body\b[^>]*>([\s\S]*?)<\/body>/i;
const P_TAG_RE = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
const XML_TOKEN_RE = /<!--[\s\S]*?-->|<\/?[A-Za-z_][\w:.-]*(?:\s+[^<>]*)?\/?>|[^<]+/g;

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0*39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _;
    })
    .replace(/&amp;/g, "&");
}

function getXmlAttr(attrs: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = attrs.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return match ? (match[1] ?? match[2]) : undefined;
}

export function parseTtmlTimestamp(raw?: string): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  if (trimmed.endsWith("ms")) {
    const ms = parseFloat(trimmed.slice(0, -2));
    return Number.isFinite(ms) && ms >= 0 ? ms / 1000 : undefined;
  }
  if (trimmed.endsWith("s")) {
    const sec = parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(sec) && sec >= 0 ? sec : undefined;
  }

  const parts = trimmed.split(":");
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseFloat(parts[2].replace(",", "."));
    if (Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s)) {
      return h * 3600 + m * 60 + s;
    }
  } else if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseFloat(parts[1].replace(",", "."));
    if (Number.isFinite(m) && Number.isFinite(s)) {
      return m * 60 + s;
    }
  } else if (parts.length === 1) {
    const s = parseFloat(parts[0].replace(",", "."));
    if (Number.isFinite(s) && s >= 0) return s;
  }

  return undefined;
}

interface SpanFrame {
  begin?: number;
  end?: number;
  ignored: boolean;
}

function resolveCurrentSpanTiming(stack: SpanFrame[]): { begin?: number; end?: number; ignored: boolean } {
  let begin: number | undefined;
  let end: number | undefined;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].ignored) return { ignored: true };
    if (begin === undefined && stack[i].begin !== undefined) begin = stack[i].begin;
    if (end === undefined && stack[i].end !== undefined) end = stack[i].end;
  }
  return { begin, end, ignored: false };
}

function parseParagraphElement(attrs: string, innerXml: string): LyricLine | null {
  const pBegin = parseTtmlTimestamp(getXmlAttr(attrs, "begin"));
  const pEnd = parseTtmlTimestamp(getXmlAttr(attrs, "end"));

  const spanStack: SpanFrame[] = [];
  const rawTokens: { time: number; endTime?: number; text: string }[] = [];
  let hasTimedSpans = false;
  let plainTextAcc = "";
  let lastSeenTime = pBegin ?? 0;

  XML_TOKEN_RE.lastIndex = 0;
  let tokenMatch: RegExpExecArray | null;
  while ((tokenMatch = XML_TOKEN_RE.exec(innerXml)) !== null) {
    const token = tokenMatch[0];
    if (token.startsWith("<!--")) continue;

    if (token.startsWith("<")) {
      if (token.startsWith("</")) {
        if (/^<\/span\b/i.test(token) && spanStack.length > 0) {
          spanStack.pop();
        }
        continue;
      }

      const selfClosing = token.endsWith("/>");
      if (/^<br\b/i.test(token)) {
        rawTokens.push({ time: lastSeenTime, text: " " });
        plainTextAcc += " ";
        continue;
      }

      if (!selfClosing && /^<span\b/i.test(token)) {
        const spanAttrs = token.slice(5, -1);
        const role = (getXmlAttr(spanAttrs, "ttm:role") || getXmlAttr(spanAttrs, "role") || "").toLowerCase();
        const ignored = role === "x-trans" || role === "x-roman" || spanStack.some((f) => f.ignored);
        const begin = parseTtmlTimestamp(getXmlAttr(spanAttrs, "begin"));
        const end = parseTtmlTimestamp(getXmlAttr(spanAttrs, "end"));
        if (!ignored && begin !== undefined) {
          hasTimedSpans = true;
          lastSeenTime = begin;
        }
        spanStack.push({ begin, end, ignored });
      }
      continue;
    }

    const decoded = decodeXmlEntities(token);
    if (!decoded) continue;

    const active = resolveCurrentSpanTiming(spanStack);
    if (active.ignored) continue;

    plainTextAcc += decoded;
    if (active.begin !== undefined) {
      lastSeenTime = active.begin;
      rawTokens.push({ time: active.begin, endTime: active.end, text: decoded });
    } else if (/\S/.test(decoded)) {
      rawTokens.push({ time: lastSeenTime, text: decoded });
    } else {
      rawTokens.push({ time: lastSeenTime, text: " " });
    }
  }

  if (hasTimedSpans) {
    const words = normalizeWordTokenSpacing(rawTokens);
    const cleanText = words.map((w) => w.text).join("").trim();
    if (!cleanText || words.length === 0) return null;

    const lineStart = pBegin ?? words[0].time;
    const lastWord = words[words.length - 1];
    if (pEnd !== undefined && pEnd >= lastWord.time && (lastWord.endTime === undefined || lastWord.endTime < lastWord.time)) {
      lastWord.endTime = pEnd;
    }

    return {
      time: lineStart,
      text: cleanText,
      words,
    };
  }

  const cleanPlain = plainTextAcc.replace(/\s+/g, " ").trim();
  if (!cleanPlain || pBegin === undefined) return null;

  return {
    time: pBegin,
    text: cleanPlain,
  };
}

export function parseTtmlLyrics(
  ttmlXml: string,
  isDummyLine?: (text: string) => boolean
): LyricLine[] {
  if (!ttmlXml) return [];
  const bodyMatch = ttmlXml.match(BODY_RE);
  if (!bodyMatch) return [];

  const bodyXml = bodyMatch[1];
  const lines: LyricLine[] = [];

  P_TAG_RE.lastIndex = 0;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = P_TAG_RE.exec(bodyXml)) !== null) {
    const parsed = parseParagraphElement(pMatch[1] || "", pMatch[2] || "");
    if (!parsed) continue;
    if (isDummyLine && isDummyLine(parsed.text)) continue;
    lines.push(parsed);
  }

  lines.sort((a, b) => a.time - b.time);
  return lines;
}
