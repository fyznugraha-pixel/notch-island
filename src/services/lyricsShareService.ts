import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { startShelfSend } from "./shelfTransferService";
import type { ShelfSessionInfo } from "../types/shelfTransfer";

export type LyricsCardStyle = "spotify" | "apple";
export type LyricsCardRatio = "1:1" | "4:5" | "9:16";
export type BackgroundBlurMode = "none" | "soft" | "heavy";

export interface LyricsSharePayload {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string | null;
  lines: string[];
  selectedIndices: number[];
  sourceApp?: string;
}

export interface LyricsCardPalette {
  id: string;
  label: string;
  bg: string;
  bgSecondary: string;
  text: string;
  mutedText: string;
  isLightText: boolean;
}

export interface LyricsCardPreferences {
  style: LyricsCardStyle;
  ratio: LyricsCardRatio;
  showWatermark: boolean;
  paletteId: string;
  fontColor: string;
  bgBlur: BackgroundBlurMode;
}

export const FONT_COLOR_PRESETS = [
  { id: "white", label: "Putih", hex: "#ffffff" },
  { id: "cream", label: "Krem Hangat", hex: "#fef3c7" },
  { id: "rose", label: "Merah Muda", hex: "#fbcfe8" },
  { id: "sky", label: "Biru Langit", hex: "#bae6fd" },
  { id: "mint", label: "Hijau Mint", hex: "#bbf7d0" },
  { id: "ink", label: "Hitam Tinta", hex: "#141418" },
] as const;

export const MAX_SELECTED_LYRIC_LINES = 5;
const PREFS_KEY = "gili_lyrics_share_prefs_v1";

const DEFAULT_PREFS: LyricsCardPreferences = {
  style: "spotify",
  ratio: "4:5",
  showWatermark: true,
  paletteId: "vibrant",
  fontColor: "#ffffff",
  bgBlur: "soft",
};

export const FALLBACK_PALETTES: LyricsCardPalette[] = [
  {
    id: "vibrant",
    label: "Vibrant",
    bg: "#3b82f6",
    bgSecondary: "#1e3a8a",
    text: "#ffffff",
    mutedText: "rgba(255,255,255,0.74)",
    isLightText: true,
  },
  {
    id: "deep",
    label: "Deep",
    bg: "#1e293b",
    bgSecondary: "#0f172a",
    text: "#ffffff",
    mutedText: "rgba(255,255,255,0.72)",
    isLightText: true,
  },
  {
    id: "bright",
    label: "Vivid Art",
    bg: "#64748b",
    bgSecondary: "#334155",
    text: "#ffffff",
    mutedText: "rgba(255,255,255,0.78)",
    isLightText: true,
  },
  {
    id: "noir",
    label: "Obsidian",
    bg: "#18181b",
    bgSecondary: "#09090b",
    text: "#ffffff",
    mutedText: "rgba(255,255,255,0.72)",
    isLightText: true,
  },
];

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${clampByte(r).toString(16).padStart(2, "0")}${clampByte(g)
    .toString(16)
    .padStart(2, "0")}${clampByte(b).toString(16).padStart(2, "0")}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 6) return [24, 24, 28];
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return [24, 24, 28];
  return [r, g, b];
}

export function normalizeHexColor(raw: unknown, fallback = "#ffffff"): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  const six = /^#?([0-9a-fA-F]{6})$/.exec(trimmed);
  if (six) return `#${six[1].toLowerCase()}`;
  const three = /^#?([0-9a-fA-F]{3})$/.exec(trimmed);
  if (three) {
    const [r, g, b] = three[1];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function isColorLight(hex: string): boolean {
  const [r, g, b] = hexToRgb(normalizeHexColor(hex));
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum >= 0.34;
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(normalizeHexColor(hex));
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
}

export interface HsvColor {
  h: number; // 0..360
  s: number; // 0..100
  v: number; // 0..100
}

export function hexToHsv(hex: string): HsvColor {
  const [rRaw, gRaw, bRaw] = hexToRgb(normalizeHexColor(hex));
  const r = rRaw / 255;
  const g = gRaw / 255;
  const b = bRaw / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h: Math.round(h), s: Math.round(s), v: Math.round(v) };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hh = (((h % 360) + 360) % 360) / 60;
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const vv = Math.max(0, Math.min(100, v)) / 100;
  const c = vv * ss;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = vv - c;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hh < 1) [r1, g1, b1] = [c, x, 0];
  else if (hh < 2) [r1, g1, b1] = [x, c, 0];
  else if (hh < 3) [r1, g1, b1] = [0, c, x];
  else if (hh < 4) [r1, g1, b1] = [0, x, c];
  else if (hh < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return rgbToHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255);
}

export function computeContrastTextColors(hexBg: string): {
  text: string;
  mutedText: string;
  isLightText: boolean;
} {
  // Flip to dark ink on bright covers (>0.34 luminance keeps Spotify-style readability high)
  const useLightText = !isColorLight(hexBg);
  return useLightText
    ? { text: "#ffffff", mutedText: "rgba(255,255,255,0.74)", isLightText: true }
    : { text: "#111114", mutedText: "rgba(17,17,20,0.68)", isLightText: false };
}

function buildBloomSwatch(
  id: string,
  label: string,
  rgb: [number, number, number],
  secondaryRgb: [number, number, number]
): LyricsCardPalette {
  return {
    id,
    label,
    bg: rgbToHex(rgb[0], rgb[1], rgb[2]),
    bgSecondary: rgbToHex(secondaryRgb[0], secondaryRgb[1], secondaryRgb[2]),
    text: "#ffffff",
    mutedText: "rgba(255,255,255,0.74)",
    isLightText: true,
  };
}

export function extractPalettesFromRgbPixels(
  pixels: Array<[number, number, number]>
): LyricsCardPalette[] {
  if (!pixels.length) return FALLBACK_PALETTES;

  let bestVibrant: [number, number, number] | null = null;
  let bestScore = -1;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (const [r, g, b] of pixels) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const avg = (r + g + b) / 3;

    if (max > 20 && min < 240) {
      sumR += r;
      sumG += g;
      sumB += b;
      count++;
    }

    const lumBias = 1 - Math.abs(avg / 255 - 0.52);
    const score = chroma * lumBias;
    if (chroma > 18 && score > bestScore) {
      bestScore = score;
      bestVibrant = [r, g, b];
    }
  }

  if (count === 0 && !bestVibrant) {
    return FALLBACK_PALETTES;
  }

  const baseAvg: [number, number, number] =
    count > 0 ? [sumR / count, sumG / count, sumB / count] : bestVibrant || [56, 130, 246];
  const vividSource = bestVibrant || baseAvg;

  const vibrant = buildBloomSwatch(
    "vibrant",
    "Vibrant",
    [vividSource[0], vividSource[1], vividSource[2]],
    [vividSource[0] * 0.58, vividSource[1] * 0.58, vividSource[2] * 0.58]
  );

  const deepMax = Math.max(1, baseAvg[0], baseAvg[1], baseAvg[2]);
  const deepScale = Math.min(0.68, 86 / deepMax);
  const deepRgb: [number, number, number] = [
    Math.max(22, baseAvg[0] * deepScale),
    Math.max(22, baseAvg[1] * deepScale),
    Math.max(28, baseAvg[2] * deepScale),
  ];
  const deep = buildBloomSwatch("deep", "Deep", deepRgb, [
    deepRgb[0] * 0.55,
    deepRgb[1] * 0.55,
    deepRgb[2] * 0.55,
  ]);

  const brightRgb: [number, number, number] = [
    Math.min(245, vividSource[0] * 1.1 + 26),
    Math.min(245, vividSource[1] * 1.1 + 26),
    Math.min(245, vividSource[2] * 1.1 + 26),
  ];
  const bright = buildBloomSwatch("bright", "Vivid Art", brightRgb, vividSource);

  return [vibrant, deep, bright, ...FALLBACK_PALETTES.slice(3)];
}

export async function extractLyricsCardPalettes(
  artworkSrc?: string | null
): Promise<LyricsCardPalette[]> {
  if (!artworkSrc || typeof document === "undefined") {
    return FALLBACK_PALETTES;
  }

  return new Promise<LyricsCardPalette[]>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(FALLBACK_PALETTES);
          return;
        }
        canvas.width = 24;
        canvas.height = 24;
        ctx.drawImage(img, 0, 0, 24, 24);
        const data = ctx.getImageData(0, 0, 24, 24).data;
        const pixels: Array<[number, number, number]> = [];
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 200) {
            pixels.push([data[i], data[i + 1], data[i + 2]]);
          }
        }
        resolve(extractPalettesFromRgbPixels(pixels));
      } catch {
        resolve(FALLBACK_PALETTES);
      }
    };
    img.onerror = () => resolve(FALLBACK_PALETTES);
    img.src = artworkSrc;
  });
}

export function extractShareableLyricLines(
  lyrics?: {
    lines?: Array<{ text?: string }>;
    plainLyrics?: string;
    plain_lyrics?: string | null;
  } | null
): string[] {
  if (!lyrics) return [];
  if (Array.isArray(lyrics.lines) && lyrics.lines.length > 0) {
    const mapped = lyrics.lines.map((l) => l.text || "");
    if (mapped.some((t) => t.trim().length > 0)) return mapped;
  }
  const plain = lyrics.plainLyrics ?? lyrics.plain_lyrics;
  if (typeof plain === "string" && plain.trim().length > 0) {
    return plain.split(/\r?\n/);
  }
  return [];
}

export function buildDefaultSelectedIndices(lines: string[], activeIndex: number): number[] {
  const nonEmptyIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim()) nonEmptyIndices.push(i);
  }
  if (nonEmptyIndices.length === 0) return [];

  const startPos =
    activeIndex >= 0
      ? nonEmptyIndices.findIndex((idx) => idx >= activeIndex)
      : 0;
  const resolvedPos = startPos >= 0 ? startPos : 0;
  return nonEmptyIndices.slice(resolvedPos, resolvedPos + 2);
}

export function toggleLyricSelection(
  currentIndices: number[],
  targetIndex: number,
  maxLines = MAX_SELECTED_LYRIC_LINES
): number[] {
  if (currentIndices.includes(targetIndex)) {
    return currentIndices.filter((i) => i !== targetIndex);
  }
  if (currentIndices.length >= maxLines) {
    return currentIndices;
  }
  return [...currentIndices, targetIndex].sort((a, b) => a - b);
}

function normalizeBlurMode(raw: unknown): BackgroundBlurMode {
  return raw === "none" || raw === "heavy" ? raw : "soft";
}

export function loadLyricsCardPreferences(): LyricsCardPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        style: parsed?.style === "apple" ? "apple" : "spotify",
        ratio:
          parsed?.ratio === "1:1" || parsed?.ratio === "9:16"
            ? parsed.ratio
            : "4:5",
        showWatermark: true,
        paletteId: typeof parsed?.paletteId === "string" ? parsed.paletteId : "vibrant",
        fontColor: normalizeHexColor(parsed?.fontColor, "#ffffff"),
        bgBlur: normalizeBlurMode(parsed?.bgBlur),
      };
    }
  } catch {}
  return DEFAULT_PREFS;
}

export function saveLyricsCardPreferences(
  prefs: LyricsCardPreferences
): LyricsCardPreferences {
  const normalized: LyricsCardPreferences = {
    style: prefs.style === "apple" ? "apple" : "spotify",
    ratio:
      prefs.ratio === "1:1" || prefs.ratio === "9:16" ? prefs.ratio : "4:5",
    showWatermark: true,
    paletteId: prefs.paletteId || "vibrant",
    fontColor: normalizeHexColor(prefs.fontColor, "#ffffff"),
    bgBlur: normalizeBlurMode(prefs.bgBlur),
  };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(normalized));
  } catch {}
  return normalized;
}

export async function readImageFileAsSafeDataUrl(
  file: File,
  maxDimension = 1920
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File bukan gambar yang valid");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Gagal membaca gambar"));
      el.src = objectUrl;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("Dimensi gambar tidak valid");

    const longest = Math.max(w, h);
    const scale = longest > maxDimension ? maxDimension / longest : 1;
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context tidak tersedia");
    ctx.drawImage(img, 0, 0, outW, outH);
    const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
    return canvas.toDataURL(mime, 0.92);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function buildCardExportFilename(artist: string, title: string): string {
  const clean = [artist.trim(), title.trim()].filter(Boolean).join(" - ");
  return clean ? `${clean} - Gili Lyrics` : "Gili Lyrics Card";
}

export async function openLyricsShareStudio(payload: LyricsSharePayload): Promise<void> {
  await invoke("open_lyrics_share_window", { payload });
}

export async function loadInitialLyricsSharePayload(): Promise<LyricsSharePayload | null> {
  try {
    return await invoke<LyricsSharePayload | null>("get_pending_lyrics_share");
  } catch {
    return null;
  }
}

export function subscribeLyricsShareUpdates(
  cb: (payload: LyricsSharePayload) => void
): Promise<() => void> {
  return listen<LyricsSharePayload>("lyrics-share:update", (e) => {
    if (e.payload) cb(e.payload);
  });
}

export async function resolveSafeArtworkDataUrl(
  artworkUrl?: string | null
): Promise<string | null> {
  if (!artworkUrl) return null;
  const trimmed = artworkUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:") || trimmed.startsWith("/")) {
    return trimmed;
  }
  try {
    return await invoke<string>("fetch_artwork_data_url", { url: trimmed });
  } catch {
    return null;
  }
}

export async function copyLyricsCardPng(
  pngDataUrl: string,
  filenameHint: string
): Promise<void> {
  const tempPath = await invoke<string>("save_temp_lyrics_card_png", {
    pngBase64: pngDataUrl,
    filenameHint,
  });
  await invoke("copy_image_to_clipboard", { path: tempPath });
}

export async function saveLyricsCardPng(
  pngDataUrl: string,
  filenameHint: string
): Promise<string> {
  return invoke<string>("save_lyrics_card_to_pictures", {
    pngBase64: pngDataUrl,
    filenameHint,
  });
}

export async function startLyricsCardQrShare(
  pngDataUrl: string,
  filenameHint: string
): Promise<ShelfSessionInfo> {
  const tempPath = await invoke<string>("save_temp_lyrics_card_png", {
    pngBase64: pngDataUrl,
    filenameHint,
  });
  return startShelfSend([tempPath]);
}
