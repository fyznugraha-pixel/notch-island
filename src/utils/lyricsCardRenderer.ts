import {
  hexToRgba,
  isColorLight,
  normalizeHexColor,
  type BackgroundBlurMode,
  type LyricsCardPalette,
  type LyricsCardRatio,
  type LyricsCardStyle,
} from "../services/lyricsShareService";

export interface LyricsCardRenderOptions {
  title: string;
  artist: string;
  album?: string;
  lines: string[];
  artworkDataUrl?: string | null;
  customBgDataUrl?: string | null;
  logoUrl?: string;
  style: LyricsCardStyle;
  ratio: LyricsCardRatio;
  palette: LyricsCardPalette;
  fontColor?: string;
  bgBlur?: BackgroundBlurMode;
  showWatermark: boolean;
  targetWidth?: number;
}

const FONT_STACK = `"Inter", "Segoe UI", system-ui, -apple-system, sans-serif`;

export function getCardDimensions(
  ratio: LyricsCardRatio,
  targetWidth = 1080
): { width: number; height: number } {
  if (ratio === "1:1") return { width: targetWidth, height: targetWidth };
  if (ratio === "9:16") return { width: targetWidth, height: Math.round((targetWidth * 16) / 9) };
  return { width: targetWidth, height: Math.round((targetWidth * 5) / 4) };
}

function loadImageSafe(src?: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    if (src.startsWith("http://") || src.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 0
): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;

  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;

  ctx.save();
  if (radius > 0) {
    drawRoundedRectPath(ctx, x, y, w, h, radius);
    ctx.clip();
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function wrapSingleParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const wrapped: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) {
      wrapped.push(line);
      line = "";
    }
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
    } else {
      // Break unusually long token character-by-character so card text never overflows
      let chunk = "";
      for (const ch of word) {
        if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
          wrapped.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    }
  }
  if (line) wrapped.push(line);
  return wrapped;
}

function fitLyricLayout(
  ctx: CanvasRenderingContext2D,
  paragraphs: string[],
  maxWidth: number,
  maxHeight: number,
  s: number,
  weight: number
): { fontSize: number; lineHeightPx: number; paraGapPx: number; blocks: string[][] } {
  const cleanParagraphs = paragraphs.map((p) => p.trim()).filter(Boolean);
  const effectiveParagraphs = cleanParagraphs.length > 0 ? cleanParagraphs : ["..."];
  const candidateSizes = [68, 62, 56, 50, 45, 40, 36, 32];

  for (const baseSize of candidateSizes) {
    const fontSize = baseSize * s;
    const lineHeightPx = fontSize * 1.24;
    const paraGapPx = fontSize * 0.42;
    ctx.font = `${weight} ${fontSize}px ${FONT_STACK}`;

    const blocks = effectiveParagraphs.map((p) => wrapSingleParagraph(ctx, p, maxWidth));
    const totalLines = blocks.reduce((acc, b) => acc + Math.max(1, b.length), 0);
    const totalHeight =
      totalLines * lineHeightPx + Math.max(0, blocks.length - 1) * paraGapPx;

    if (totalHeight <= maxHeight || baseSize === candidateSizes[candidateSizes.length - 1]) {
      return { fontSize, lineHeightPx, paraGapPx, blocks };
    }
  }

  return {
    fontSize: 32 * s,
    lineHeightPx: 32 * 1.24 * s,
    paraGapPx: 14 * s,
    blocks: effectiveParagraphs.map((p) => [p]),
  };
}

function drawTruncatedSingleLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
): void {
  if (!text) return;
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}...`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  ctx.fillText(`${clipped.trimEnd()}...`, x, y);
}

function drawFallbackCover(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  radius: number,
  isLightCardText: boolean
): void {
  ctx.save();
  drawRoundedRectPath(ctx, x, y, size, size, radius);
  ctx.fillStyle = isLightCardText ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.09)";
  ctx.fill();
  ctx.strokeStyle = isLightCardText ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)";
  ctx.lineWidth = Math.max(1, size * 0.015);
  ctx.stroke();

  ctx.fillStyle = isLightCardText ? "rgba(255,255,255,0.72)" : "rgba(17,17,20,0.68)";
  ctx.font = `700 ${Math.round(size * 0.42)}px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("♪", x + size / 2, y + size / 2 + size * 0.03);
  ctx.restore();
}

// Mirrors MiniPlayerBackground & NotchSurface ambient blurred cover art recipe
function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  style: LyricsCardStyle,
  palette: LyricsCardPalette,
  backdropImg: HTMLImageElement | null,
  isCustomBg: boolean,
  bgBlur: BackgroundBlurMode,
  isLightText: boolean
): void {
  // 1. Base foundation matching contrast side of chosen font color
  ctx.fillStyle = isLightText ? "#050508" : "#f2f2f6";
  ctx.fillRect(0, 0, width, height);

  const blurOpacity =
    bgBlur === "none"
      ? isCustomBg
        ? 0.94
        : 0.78
      : palette.id === "bright"
      ? 0.72
      : palette.id === "noir"
      ? 0.42
      : style === "apple"
      ? 0.62
      : 0.56;

  // 2. Backdrop image (custom uploaded wallpaper or album artwork)
  if (backdropImg) {
    ctx.save();
    ctx.globalAlpha = blurOpacity;
    if (bgBlur === "none") {
      drawImageCover(ctx, backdropImg, 0, 0, width, height);
    } else {
      const pad = Math.round(Math.max(width, height) * 0.16);
      const blurFactor =
        bgBlur === "heavy"
          ? style === "apple"
            ? 0.105
            : 0.09
          : style === "apple"
          ? 0.068
          : 0.056;
      const blurPx = Math.round(width * blurFactor);
      ctx.filter = `blur(${blurPx}px) saturate(185%)`;
      drawImageCover(ctx, backdropImg, -pad, -pad, width + pad * 2, height + pad * 2);
    }
    ctx.restore();
  }

  // 3. Ambient dominant tint bloom (lighter when sharp custom photo is shown)
  if (palette.id !== "noir") {
    const baseBloom = palette.id === "bright" ? 0.42 : style === "spotify" ? 0.36 : 0.30;
    const bloomAlpha = isCustomBg && bgBlur === "none" ? baseBloom * 0.45 : baseBloom;
    const bloom = ctx.createRadialGradient(
      width * 0.25,
      height * 0.15,
      0,
      width * 0.25,
      height * 0.15,
      Math.max(width, height) * 0.82
    );
    bloom.addColorStop(0, hexToRgba(palette.bg, bloomAlpha));
    bloom.addColorStop(0.45, hexToRgba(palette.bgSecondary, bloomAlpha * 0.4));
    bloom.addColorStop(1, "rgba(5, 5, 8, 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, width, height);
  }

  // 4. Adaptive readability scrim preserving legibility for both light & dark custom font colors
  const scrim = ctx.createLinearGradient(0, 0, 0, height);
  if (isLightText) {
    scrim.addColorStop(0, isCustomBg && bgBlur === "none" ? "rgba(0, 0, 0, 0.14)" : "rgba(0, 0, 0, 0.10)");
    scrim.addColorStop(0.5, palette.id === "bright" ? "rgba(0, 0, 0, 0.22)" : "rgba(0, 0, 0, 0.28)");
    scrim.addColorStop(1, "rgba(0, 0, 0, 0.58)");
  } else {
    const veilTop = isCustomBg && bgBlur === "none" ? 0.22 : 0.42;
    const veilMid = isCustomBg && bgBlur === "none" ? 0.28 : 0.48;
    const veilBot = isCustomBg && bgBlur === "none" ? 0.48 : 0.62;
    scrim.addColorStop(0, `rgba(255, 255, 255, ${veilTop})`);
    scrim.addColorStop(0.5, `rgba(255, 255, 255, ${veilMid})`);
    scrim.addColorStop(1, `rgba(255, 255, 255, ${veilBot})`);
  }
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, width, height);

  // 5. Top specular glass rim matching MiniPlayer / NotchSurface
  const spec = ctx.createLinearGradient(0, 0, 0, Math.round(height * 0.08));
  spec.addColorStop(0, isLightText ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.22)");
  spec.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = spec;
  ctx.fillRect(0, 0, width, Math.round(height * 0.08));
}

export async function renderLyricsCardToCanvas(
  canvas: HTMLCanvasElement,
  options: LyricsCardRenderOptions
): Promise<void> {
  const { width, height } = getCardDimensions(options.ratio, options.targetWidth ?? 1080);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const s = width / 1080;
  const textColor = normalizeHexColor(options.fontColor, "#ffffff");
  const isLightText = isColorLight(textColor);
  const mutedColor = hexToRgba(textColor, 0.76);
  const bgBlur: BackgroundBlurMode = options.bgBlur || "soft";

  const [artworkImg, customBgImg, logoImg] = await Promise.all([
    loadImageSafe(options.artworkDataUrl),
    options.customBgDataUrl ? loadImageSafe(options.customBgDataUrl) : Promise.resolve(null),
    options.showWatermark
      ? loadImageSafe(options.logoUrl || "/logo/LOGO-GILI.png")
      : Promise.resolve(null),
  ]);

  const backdropImg = customBgImg || artworkImg;
  const isCustomBg = Boolean(customBgImg);

  ctx.clearRect(0, 0, width, height);
  drawBackdrop(
    ctx,
    width,
    height,
    options.style,
    options.palette,
    backdropImg,
    isCustomBg,
    bgBlur,
    isLightText
  );

  const isStoryFrame = options.ratio === "9:16";
  let cardX = 0;
  let cardY = 0;
  let cardW = width;
  let cardH = height;

  if (isStoryFrame) {
    // Center a translucent card slab over the backdrop
    const frameW = Math.round(width * 0.87);
    const frameH = Math.round(frameW * 1.28);
    cardX = Math.round((width - frameW) / 2);
    cardY = Math.round((height - frameH) / 2);
    cardW = frameW;
    cardH = frameH;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
    ctx.shadowBlur = 54 * s;
    ctx.shadowOffsetY = 20 * s;
    drawRoundedRectPath(ctx, cardX, cardY, cardW, cardH, 40 * s);
    ctx.fillStyle = !isLightText
      ? "rgba(255, 255, 255, 0.56)"
      : options.style === "apple"
      ? "rgba(22, 22, 28, 0.34)"
      : hexToRgba(options.palette.bgSecondary, 0.42);
    ctx.fill();
    ctx.strokeStyle = !isLightText
      ? "rgba(17, 17, 20, 0.14)"
      : options.style === "apple"
      ? "rgba(255, 255, 255, 0.22)"
      : hexToRgba(options.palette.bg, 0.38);
    ctx.lineWidth = 2 * s;
    ctx.stroke();
    ctx.restore();
  }

  const cs = cardW / 1080;
  const padX = Math.round(86 * cs);
  const padY = Math.round(88 * cs);
  const contentX = cardX + padX;
  const contentW = cardW - padX * 2;

  // Header: Cover Art + Title + Artist
  const coverSize = Math.round((options.style === "apple" ? 160 : 142) * cs);
  const coverRadius = Math.round((options.style === "apple" ? 22 : 14) * cs);
  const headerY = cardY + padY;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = 24 * cs;
  ctx.shadowOffsetY = 8 * cs;
  if (artworkImg) {
    drawImageCover(ctx, artworkImg, contentX, headerY, coverSize, coverSize, coverRadius);
  } else {
    drawFallbackCover(ctx, contentX, headerY, coverSize, coverRadius, isLightText);
  }
  ctx.restore();

  const metaX = contentX + coverSize + Math.round(32 * cs);
  const metaW = contentW - coverSize - Math.round(32 * cs);
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = textColor;
  const titleFontSize = Math.round(40 * cs);
  ctx.font = `700 ${titleFontSize}px ${FONT_STACK}`;
  drawTruncatedSingleLine(
    ctx,
    options.title.trim() || "Unknown Track",
    metaX,
    headerY + Math.round(coverSize * 0.44),
    metaW
  );

  ctx.fillStyle = mutedColor;
  const artistFontSize = Math.round(29 * cs);
  ctx.font = `500 ${artistFontSize}px ${FONT_STACK}`;
  const subtitle = options.album
    ? `${options.artist.trim() || "Unknown Artist"} · ${options.album.trim()}`
    : options.artist.trim() || "Unknown Artist";
  drawTruncatedSingleLine(
    ctx,
    subtitle,
    metaX,
    headerY + Math.round(coverSize * 0.74),
    metaW
  );
  ctx.restore();

  // Footer reserve
  const footerHeight = options.showWatermark ? Math.round(64 * cs) : Math.round(16 * cs);
  const bodyTop = headerY + coverSize + Math.round(52 * cs);
  const bodyBottom = cardY + cardH - padY - footerHeight;
  const bodyHeight = Math.max(120 * cs, bodyBottom - bodyTop);

  // Lyrics Body
  const lyricWeight = 700;
  const spotifyQuotePad = options.style === "spotify" ? Math.round(28 * cs) : 0;
  const fitted = fitLyricLayout(
    ctx,
    options.lines,
    contentW - spotifyQuotePad,
    bodyHeight,
    cs,
    lyricWeight
  );

  const totalTextHeight =
    fitted.blocks.reduce((acc, b) => acc + b.length * fitted.lineHeightPx, 0) +
    Math.max(0, fitted.blocks.length - 1) * fitted.paraGapPx;
  const textStartTop = bodyTop + Math.max(0, (bodyHeight - totalTextHeight) / 2);
  let cursorY = textStartTop + fitted.fontSize * 0.85;

  if (options.style === "spotify") {
    ctx.save();
    const barW = Math.max(3, Math.round(6 * cs));
    drawRoundedRectPath(ctx, contentX, textStartTop + 4 * cs, barW, Math.max(24 * cs, totalTextHeight - 8 * cs), barW / 2);
    ctx.fillStyle = hexToRgba(options.palette.bg, 0.9);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = textColor;
  ctx.font = `${lyricWeight} ${fitted.fontSize}px ${FONT_STACK}`;
  if (options.style === "apple") {
    ctx.shadowColor = isLightText ? "rgba(0, 0, 0, 0.34)" : "rgba(255, 255, 255, 0.45)";
    ctx.shadowBlur = 20 * cs;
    ctx.shadowOffsetY = 4 * cs;
  }

  fitted.blocks.forEach((block, blockIdx) => {
    for (const lineText of block) {
      ctx.fillText(lineText, contentX + spotifyQuotePad, cursorY);
      cursorY += fitted.lineHeightPx;
    }
    if (blockIdx < fitted.blocks.length - 1) {
      cursorY += fitted.paraGapPx;
    }
  });
  ctx.restore();

  // Bottom Watermark: Gili Logo + "Gili"
  if (options.showWatermark) {
    const wmY = cardY + cardH - padY - Math.round(44 * cs);
    const logoSize = Math.round(42 * cs);
    ctx.save();
    ctx.globalAlpha = options.style === "apple" ? 0.9 : 0.88;

    if (logoImg) {
      drawRoundedRectPath(ctx, contentX, wmY, logoSize, logoSize, 11 * cs);
      ctx.save();
      ctx.clip();
      ctx.drawImage(logoImg, contentX, wmY, logoSize, logoSize);
      ctx.restore();
    }

    const labelX = logoImg ? contentX + logoSize + Math.round(16 * cs) : contentX;
    ctx.fillStyle = textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(32 * cs)}px ${FONT_STACK}`;
    ctx.fillText("Gili", labelX, wmY + logoSize / 2 + 1 * cs);
    ctx.restore();
  }
}
