import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = path.resolve(import.meta.dirname, "../..");

function createTsLoader(mocks = {}) {
  const cache = new Map();

  function resolveModule(specifier, fromDir) {
    if (mocks[specifier]) return { mock: mocks[specifier] };
    const candidates = [
      path.resolve(fromDir, specifier),
      path.resolve(fromDir, `${specifier}.ts`),
      path.resolve(fromDir, `${specifier}.tsx`),
      path.resolve(fromDir, specifier, "index.ts"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        return { file: c };
      }
    }
    throw new Error(`Cannot resolve "${specifier}" from "${fromDir}"`);
  }

  function loadTs(relPath) {
    const absPath = path.isAbsolute(relPath) ? relPath : path.resolve(ROOT, relPath);
    if (cache.has(absPath)) return cache.get(absPath).exports;

    const source = fs.readFileSync(absPath, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        jsx: ts.JsxEmit.React,
      },
      fileName: absPath,
    });

    const mod = { exports: {} };
    cache.set(absPath, mod);

    const localRequire = (spec) => {
      const resolved = resolveModule(spec, path.dirname(absPath));
      if (resolved.mock) return resolved.mock;
      return loadTs(resolved.file);
    };

    const fn = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      outputText
    );
    fn(mod.exports, localRequire, mod, absPath, path.dirname(absPath));
    return mod.exports;
  }

  return loadTs;
}

const results = [];
async function runTest(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`[PASS - BUG TERBUKTI] ${name}`);
    if (detail) console.log(`  Detail: ${detail}`);
  } catch (err) {
    results.push({ name, ok: false, detail: err?.stack || String(err) });
    console.error(`[FAIL] ${name}: ${err?.stack || err}`);
  }
}

// 1. parseLrc drops 1-digit fractional timestamps [mm:ss.d]
await runTest("T10-parseLrc-single-digit-frac", async () => {
  const load = createTsLoader({
    "@tauri-apps/api/core": { invoke: async () => "" },
  });
  const { parseLrc } = load("src/services/lyrics/utils.ts");
  const { parseLrcTimestamp } = load("src/services/lyrics/wordParsers.ts");

  assert.equal(parseLrcTimestamp("00", "12", "5"), 12.5);
  const lines = parseLrc("[00:12.5]Baris satu\n[00:18.25]Baris dua");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, "Baris dua");
  return `parseLrcTimestamp("00","12","5")=12.5, namun parseLrc hanya menghasilkan ${lines.length} baris (baris [00:12.5] hilang)`;
});

// 2. parseTtmlLyrics & parseTtmlTimestamp bugs
await runTest("T10-ttmlParser-self-closing-and-negative", async () => {
  const load = createTsLoader({});
  const { parseTtmlLyrics, parseTtmlTimestamp } = load("src/services/lyrics/ttmlParser.ts");

  const ttml = `<tt><body><div><p begin="00:10.00" end="00:12.00" /><p begin="00:15.00" end="00:18.00">Baris lirik asli</p></div></body></tt>`;
  const lines = parseTtmlLyrics(ttml);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].time, 10);
  const negSec = parseTtmlTimestamp("-01:10");
  assert.equal(negSec, -50);
  const negSuffixed = parseTtmlTimestamp("-5s");
  assert.equal(negSuffixed, undefined);

  return `Self-closing <p/> membuat <p> berikutnya memakai time=${lines[0].time} (seharusnya 15); parseTtmlTimestamp("-01:10")=${negSec}`;
});

// 3. clearLyricsCacheForTrack substring eviction
await runTest("T10-clearLyricsCacheForTrack-substring-collision", async () => {
  let fetchCalls = 0;
  const load = createTsLoader({
    "@tauri-apps/api/core": {
      invoke: async (_cmd, args) => {
        fetchCalls++;
        if (args?.url?.includes("lrclib.net")) {
          return JSON.stringify({
            syncedLyrics: "[00:05.00]Line one\n[00:10.00]Line two",
            plainLyrics: "Line one\nLine two",
          });
        }
        return "";
      },
    },
  });
  const { fetchLyricsMulti, clearLyricsCacheForTrack } = load("src/services/lyrics/index.ts");

  await fetchLyricsMulti("Taylor Swift", "Love Story", 235, "lrclib");
  const callsAfterFirst = fetchCalls;
  // Second fetch should hit in-memory cache (0 new invokes)
  await fetchLyricsMulti("Taylor Swift", "Love Story", 235, "lrclib");
  assert.equal(fetchCalls, callsAfterFirst);

  // Refreshing browser/unknown-artist track titled "Love" evicts "taylor swift - love story"
  clearLyricsCacheForTrack("Chrome", "Love");
  await fetchLyricsMulti("Taylor Swift", "Love Story", 235, "lrclib");
  assert.ok(fetchCalls > callsAfterFirst, "Expected unrelated cache entry to be evicted");

  return `fetchCalls sebelum clear=${callsAfterFirst}, sesudah clearLyricsCacheForTrack("Chrome","Love")=${fetchCalls} (cache Taylor Swift - Love Story ikut terhapus)`;
});

// 4. getBrandedMediaType overrides music album artwork on Spotify/Apple Music
await runTest("T10-artworkService-branded-keyword-false-positive", async () => {
  const load = createTsLoader({
    "@tauri-apps/api/core": { invoke: async () => "" },
  });
  const { getBrandedMediaType, getResolvedArtworkUrl } = load("src/services/artworkService.ts");

  const keshaTrack = {
    title: "TiK ToK",
    artist: "Kesha",
    thumbnail: "https://i.scdn.co/image/ab67616d0000b273real",
    duration: 200,
    position: 10,
    is_playing: true,
    playback_type: 1,
    app_id: "Spotify.exe",
    is_browser: false,
  };
  const deanTrack = {
    ...keshaTrack,
    title: "Instagram",
    artist: "DEAN",
  };
  const threadsTrack = {
    ...keshaTrack,
    title: "Common Threads",
    artist: "Some Band",
  };

  const brandKesha = getBrandedMediaType(keshaTrack);
  const urlKesha = getResolvedArtworkUrl(keshaTrack, false);
  const brandDean = getBrandedMediaType(deanTrack);
  const brandThreads = getBrandedMediaType(threadsTrack);

  assert.equal(brandKesha, "tiktok");
  assert.equal(urlKesha, null);
  assert.equal(brandDean, "instagram");
  assert.equal(brandThreads, "threads");

  return `Spotify playback: TiK ToK -> "${brandKesha}" (artwork=${urlKesha}), Instagram -> "${brandDean}", Common Threads -> "${brandThreads}"`;
});

// 5. lyricsCardRenderer overflow over watermark when 5 long lines are rendered in 1:1
await runTest("T10-lyricsCardRenderer-long-lyrics-watermark-overflow", async () => {
  const prevDoc = globalThis.document;
  const prevImg = globalThis.Image;
  globalThis.document = {};
  globalThis.Image = class FakeImage {
    set src(_v) {
      queueMicrotask(() => this.onerror?.());
    }
  };
  const load = createTsLoader({
    "@tauri-apps/api/core": { invoke: async () => "" },
    "@tauri-apps/api/event": { listen: async () => () => {} },
    "./shelfTransferService": { startShelfSend: async () => ({}) },
  });
  const { renderLyricsCardToCanvas } = load("src/utils/lyricsCardRenderer.ts");

  const drawnTexts = [];
  const gradientStub = { addColorStop() {} };
  const ctx = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: "left",
    textBaseline: "alphabetic",
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetY: 0,
    filter: "",
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    clip() {},
    fill() {},
    stroke() {},
    clearRect() {},
    fillRect() {},
    drawImage() {},
    createRadialGradient() { return gradientStub; },
    createLinearGradient() { return gradientStub; },
    measureText(str) {
      const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
      const px = m ? parseFloat(m[1]) : 32;
      return { width: String(str).length * px * 0.56 };
    },
    fillText(text, x, y) {
      drawnTexts.push({ text, x, y, font: ctx.font });
    },
  };
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext() { return ctx; },
  };

  const longLines = [
    "And I know that you are waiting for the moment when the lights go down across the crowded avenue tonight while the distant city echoes fade away beneath the pouring summer rain",
    "Every memory we painted on the ceiling starts to flicker as the midnight train is pulling out of sight and we never got to say the things we kept inside our hearts for years",
    "Tell me why we keep repeating every single promise underneath the fading neon sign outside the door even when the morning sun reminds us everything we built is drifting far apart",
    "Nothing left to say when all the melodies have drifted far beyond the harbor and the distant shore where the silver waves keep crashing softly on the empty winter beach",
    "Hold onto the echo of the chorus till the morning breaks above the quiet city streets once more and we finally find the courage left to sing another song before the end",
  ];

  try {
    await renderLyricsCardToCanvas(fakeCanvas, {
      title: "Long Verse Track",
      artist: "Test Artist",
      lines: longLines,
      style: "apple",
      ratio: "1:1",
      palette: {
        id: "vibrant",
        label: "Vibrant",
        bg: "#3b82f6",
        bgSecondary: "#1e3a8a",
        text: "#ffffff",
        mutedText: "rgba(255,255,255,0.74)",
        isLightText: true,
      },
      fontColor: "#ffffff",
      bgBlur: "soft",
      showWatermark: true,
      targetWidth: 1080,
    });
  } finally {
    globalThis.document = prevDoc;
    globalThis.Image = prevImg;
  }

  const watermark = drawnTexts.find((d) => d.text === "Gili");
  const lyricDraws = drawnTexts.filter(
    (d) =>
      d.text !== "Long Verse Track" &&
      d.text !== "Test Artist" &&
      d.text !== "Gili" &&
      d.text !== "♪"
  );
  const maxLyricY = Math.max(...lyricDraws.map((d) => d.y));
  assert.ok(watermark, "Watermark should be drawn");
  assert.ok(maxLyricY > watermark.y, `Expected lyric Y (${maxLyricY}) > watermark Y (${watermark.y})`);
  assert.ok(maxLyricY > 1080, `Expected lyric Y (${maxLyricY}) to overflow 1080px card height`);

  return `1:1 (1080x1080): 5 baris panjang digambar hingga maxY=${maxLyricY.toFixed(1)}px, menabrak watermark Y=${watermark.y}px dan keluar batas 1080px`;
});

// 6. miniplayer_window.rs click-through geometry blocks Card Mode lyric viewport
await runTest("T10-miniplayer-click-through-blocks-card-lyrics", async () => {
  // Exact port of compute_cursor_hover_state from src-tauri/src/miniplayer_window.rs:280-331
  function isPointInRoundedRect(px, py, left, top, width, height, radius) {
    const right = left + width;
    const bottom = top + height;
    if (px < left || px > right || py < top || py > bottom) return false;
    const r = Math.min(radius, width * 0.5, height * 0.5);
    if (r <= 0) return true;
    const innerLeft = left + r;
    const innerRight = right - r;
    const innerTop = top + r;
    const innerBottom = bottom - r;
    const dx = px < innerLeft ? innerLeft - px : px > innerRight ? px - innerRight : 0;
    const dy = py < innerTop ? innerTop - py : py > innerBottom ? py - innerBottom : 0;
    return dx * dx + dy * dy <= r * r;
  }

  function computeCursorHoverState(mode, relX, relY, winW, winH, inBounds, isRightHalf, wasInWindow) {
    const shellW = Math.min(mode === "card" ? 380 : 440, winW);
    const collapsedH = Math.min(mode === "card" ? 298 : 88, winH);
    const expandedH = Math.min(mode === "card" ? 340 : 130, winH);
    const cornerRadius = mode === "card" ? 20 : 24;
    const activeH = wasInWindow ? expandedH : collapsedH;
    const shellLeft = isRightHalf ? Math.max(0, winW - shellW) : 0;
    const shellTop = Math.max(0, winH - activeH);
    const inWindow = inBounds && isPointInRoundedRect(relX, relY, shellLeft, shellTop, shellW, activeH, cornerRadius);
    const expandedTopY = Math.max(0, winH - expandedH);
    const inTopToolbar = inWindow && relY >= expandedTopY && relY < expandedTopY + 52;
    const inBottomProgress = inWindow && relY >= winH - 22 && relY <= winH;
    return { inWindow, inToolbar: inTopToolbar || inBottomProgress };
  }

  // Test center of Card Mode lyric viewport (relX=250, relY=200 inside 440x340 window anchored right)
  const cardCenter = computeCursorHoverState("card", 250, 200, 440, 340, true, true, true);
  assert.equal(cardCenter.inWindow, true);
  assert.equal(cardCenter.inToolbar, false);
  const shouldIgnoreCursor = !cardCenter.inWindow || !cardCenter.inToolbar;
  assert.equal(shouldIgnoreCursor, true);

  return `Card Mode di (250, 200) viewport lirik: inWindow=${cardCenter.inWindow}, inToolbar=${cardCenter.inToolbar} -> should_ignore_cursor=${shouldIgnoreCursor}`;
});

// 7. miniplayer_window.rs & MiniPlayerApp.tsx textScale=1.5 offset mismatch
await runTest("T10-miniplayer-textscale-bar-offset-mismatch", async () => {
  const textScale = 1.5;
  const sf = 1.0;
  const rustWinH = Math.round(340 * textScale * sf); // 510
  const rustVisibleTopOffset = Math.round(210 * textScale * sf); // 315
  const rustMinTop = 0 - Math.trunc((rustWinH * 210) / 340); // -315
  const actualBarExpandedShellH = 130; // MiniPlayerApp.tsx:749 unscaled
  const actualEmptyTop = rustWinH - actualBarExpandedShellH; // 380

  assert.notEqual(rustVisibleTopOffset, actualEmptyTop);
  return `text_scale=1.5: winH=${rustWinH}px, visible_top_offset/compute_min_top=${rustVisibleTopOffset}px, sedangkan ruang kosong di atas Bar Mode di MiniPlayerApp=${actualEmptyTop}px (selisih ${actualEmptyTop - rustVisibleTopOffset}px)`;
});

const failed = results.filter((r) => !r.ok);
console.log(`\nRingkasan Uji T10: ${results.length - failed.length}/${results.length} skenario bukti lulus.`);
if (failed.length > 0) process.exitCode = 1;
