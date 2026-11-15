import { getTextWidth } from "../../utils/text";
import { LyricLine } from "../../services/mediaLyricsStore";

export type BarLyricDisplayMode =
  | "single"
  | "wrapped"
  | "wrapped-clamped"
  | "marquee";

export interface BarLyricLayoutResult {
  mode: BarLyricDisplayMode;
  fontSize: number;
  lines: string[];
  contextText: string;
  showContext: boolean;
  overflowPx: number;
}

const FONT_FAMILY = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const FONT_STEP_SIZES = [14.5, 14, 13.5, 13] as const;
const MIN_FONT_SIZE = 13;
const MAX_CHAR_LIMIT = 200;

export function sanitizeLyricText(raw: string | undefined | null): string {
  if (!raw) return "";
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed === "..." || trimmed === "•••") return "";
  return trimmed;
}

export function clampExtremeText(text: string, maxChars: number = MAX_CHAR_LIMIT): string {
  if (text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.7) {
    return `${sliced.slice(0, lastSpace)}…`;
  }
  return `${sliced}…`;
}

/**
 * Joins the last two words with a non-breaking space when there are >= 4 words,
 * guaranteeing that wrapped lines never leave a single orphan word on the last line.
 */
export function preventOrphanWord(text: string): string {
  const words = text.split(" ").filter(Boolean);
  if (words.length < 4) return text;
  const lastTwo = `${words[words.length - 2]}\u00A0${words[words.length - 1]}`;
  return [...words.slice(0, -2), lastTwo].join(" ");
}

export function findContextLineText(
  lines: LyricLine[] | undefined,
  activeIndex: number,
  fallbackText: string = ""
): string {
  if (!lines || lines.length === 0) return fallbackText;

  // Prefer the next non-empty line as context
  for (let i = activeIndex + 1; i < lines.length; i++) {
    const candidate = sanitizeLyricText(lines[i]?.text);
    if (candidate) return clampExtremeText(candidate, 90);
  }

  // If active line is at the end, fallback to previous non-empty line
  for (let i = activeIndex - 1; i >= 0; i--) {
    const candidate = sanitizeLyricText(lines[i]?.text);
    if (candidate) return clampExtremeText(candidate, 90);
  }

  return fallbackText;
}

/**
 * Splits text into 2 balanced lines at the given fontSize without leaving an orphan word on line 2.
 * Returns null if the text cannot fit into 2 lines within slotWidth.
 */
export function splitBalancedTwoLines(
  text: string,
  slotWidth: number,
  fontSize: number = MIN_FONT_SIZE,
  scale: number = 1.0
): [string, string] | null {
  const words = text.split(" ").filter(Boolean);
  if (words.length < 2) return null;

  const fontSpec = `600 ${fontSize * scale}px ${FONT_FAMILY}`;

  // Prevent single orphan word on line 2 whenever there are >= 4 words
  const maxSplitIndex = words.length >= 4 ? words.length - 2 : words.length - 1;

  let bestSplit: [string, string] | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let i = 1; i <= maxSplitIndex; i++) {
    const line1 = words.slice(0, i).join(" ");
    const line2 = words.slice(i).join(" ");
    const w1 = getTextWidth(line1, fontSpec);
    const w2 = getTextWidth(line2, fontSpec);

    if (w1 <= slotWidth && w2 <= slotWidth) {
      const diff = Math.abs(w1 - w2);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSplit = [line1, line2];
      }
    }
  }

  return bestSplit;
}

/**
 * Forces a 2-line split with ellipsis on line 2 when prefers-reduced-motion is active
 * and the text exceeds 2 lines.
 */
function clampToTwoLinesWithEllipsis(
  text: string,
  slotWidth: number,
  fontSize: number = MIN_FONT_SIZE,
  scale: number = 1.0
): [string, string] {
  const words = text.split(" ").filter(Boolean);
  const fontSpec = `600 ${fontSize * scale}px ${FONT_FAMILY}`;

  let line1Words: string[] = [];
  let idx = 0;

  while (idx < words.length) {
    const nextCandidate = [...line1Words, words[idx]].join(" ");
    if (getTextWidth(nextCandidate, fontSpec) <= slotWidth || line1Words.length === 0) {
      line1Words.push(words[idx]);
      idx++;
    } else {
      break;
    }
  }

  const remaining = words.slice(idx);
  if (remaining.length === 0) {
    return [line1Words.join(" "), ""];
  }

  let line2Words: string[] = [];
  for (let j = 0; j < remaining.length; j++) {
    const candidate = [...line2Words, remaining[j]].join(" ") + "…";
    if (getTextWidth(candidate, fontSpec) <= slotWidth || line2Words.length === 0) {
      line2Words.push(remaining[j]);
    } else {
      return [line1Words.join(" "), `${line2Words.join(" ")}…`];
    }
  }

  return [line1Words.join(" "), line2Words.join(" ")];
}

export function computeBarLyricLayout(params: {
  activeText: string;
  contextText: string;
  slotWidth: number;
  prefersReducedMotion: boolean;
  scale?: number;
}): BarLyricLayoutResult {
  const { activeText, contextText, slotWidth, prefersReducedMotion, scale = 1.0 } = params;
  const safeText = clampExtremeText(activeText, MAX_CHAR_LIMIT);
  const fallbackContext = contextText || "♪ •••";

  // Step A: Try normal font down to 13px minimum to fit on 1 single line
  for (const fontSize of FONT_STEP_SIZES) {
    const fontSpec = `600 ${fontSize * scale}px ${FONT_FAMILY}`;
    const width = getTextWidth(safeText, fontSpec);
    if (width <= slotWidth) {
      return {
        mode: "single",
        fontSize,
        lines: [safeText],
        contextText: fallbackContext,
        showContext: true,
        overflowPx: 0,
      };
    }
  }

  // Step B: Wrap into 2 balanced lines at 13px, hiding the context line
  const twoLineSplit = splitBalancedTwoLines(safeText, slotWidth, MIN_FONT_SIZE, scale);
  if (twoLineSplit) {
    return {
      mode: "wrapped",
      fontSize: MIN_FONT_SIZE,
      lines: twoLineSplit,
      contextText: "",
      showContext: false,
      overflowPx: 0,
    };
  }

  // Step C: Last resort -> Marquee (or 2-line ellipsis if prefers-reduced-motion is enabled)
  if (prefersReducedMotion) {
    const clampedLines = clampToTwoLinesWithEllipsis(safeText, slotWidth, MIN_FONT_SIZE, scale);
    return {
      mode: "wrapped-clamped",
      fontSize: MIN_FONT_SIZE,
      lines: clampedLines,
      contextText: "",
      showContext: false,
      overflowPx: 0,
    };
  }

  const minFontSpec = `600 ${MIN_FONT_SIZE * scale}px ${FONT_FAMILY}`;
  const fullWidth = getTextWidth(safeText, minFontSpec);
  const overflowPx = Math.max(0, Math.ceil(fullWidth - slotWidth + 20));

  return {
    mode: "marquee",
    fontSize: MIN_FONT_SIZE,
    lines: [safeText],
    contextText: fallbackContext,
    showContext: true,
    overflowPx,
  };
}

export function computeMarqueeTiming(
  currentLineTime: number | null,
  nextLineTime: number | null,
  overflowPx: number
): { delayMs: number; durationSec: number } {
  const delayMs = 500;
  if (overflowPx <= 0) {
    return { delayMs, durationSec: 0 };
  }

  if (
    currentLineTime !== null &&
    nextLineTime !== null &&
    nextLineTime > currentLineTime
  ) {
    const lineDurationSec = nextLineTime - currentLineTime;
    // Finish scrolling ~300ms before the next line enters (after the 500ms initial pause)
    const availableSec = lineDurationSec - 0.8;
    if (availableSec >= 0.9) {
      return { delayMs, durationSec: Number(availableSec.toFixed(2)) };
    }
  }

  // Fallback when duration is unknown or very short: 60 px per second
  const fallbackSec = Math.max(1.2, overflowPx / 60);
  return { delayMs, durationSec: Number(fallbackSec.toFixed(2)) };
}
