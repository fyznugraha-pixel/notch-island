import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { createViteSsrLoader, installBrowserShim } from "./harness.mjs";

async function deflateStringBase64(text) {
  const stream = new Blob([new TextEncoder().encode(text)])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  const xorKey = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];
  const out = new Uint8Array(4 + compressed.length);
  out.set([0x6b, 0x72, 0x63, 0x31], 0); // "krc1"
  for (let i = 0; i < compressed.length; i++) {
    out[4 + i] = compressed[i] ^ xorKey[i & 15];
  }
  let binary = "";
  for (const byte of out) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function createSampleModels() {
  return [
    {
      id: "deepseek-chat",
      name: "DeepSeek V3",
      provider: "deepseek",
      description: "Fast DeepSeek",
      tier: "Fast",
      inputCostPer1M: 0.27,
      outputCostPer1M: 1.1,
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      provider: "gemini",
      description: "Fast Gemini",
      tier: "Fast",
      inputCostPer1M: 0.15,
      outputCostPer1M: 0.6,
    },
    {
      id: "gemini-2.5-flash-tts",
      name: "Gemini TTS",
      provider: "gemini",
      description: "Specialized TTS",
      tier: "Fast",
      inputCostPer1M: 0.1,
      outputCostPer1M: 0.1,
    },
    {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      description: "Medium OpenAI",
      tier: "Medium",
      inputCostPer1M: 2.5,
      outputCostPer1M: 10.0,
    },
    {
      id: "o3-mini",
      name: "o3-mini",
      provider: "openai",
      description: "Reasoning OpenAI",
      tier: "Medium",
      inputCostPer1M: 1.1,
      outputCostPer1M: 4.4,
    },
    {
      id: "claude-3-7-sonnet-20250219",
      name: "Claude Sonnet 3.7",
      provider: "claude",
      description: "Max Claude",
      tier: "Max",
      inputCostPer1M: 3.0,
      outputCostPer1M: 15.0,
    },
  ];
}

function registerNotchGeometrySuite(getLoader) {
  describe("Notch Geometry Utilities", () => {
    let ng;
    let prevDprDesc;

    before(async () => {
      ng = await getLoader().loadModule("/src/utils/notchGeometry.ts");
    });

    beforeEach(() => {
      prevDprDesc = Object.getOwnPropertyDescriptor(globalThis, "devicePixelRatio");
    });

    afterEach(() => {
      if (prevDprDesc) {
        Object.defineProperty(globalThis, "devicePixelRatio", prevDprDesc);
      } else {
        delete globalThis.devicePixelRatio;
      }
    });

    it("classifies all 8 NotchPosition values with position predicates", () => {
      assert.equal(ng.ALL_NOTCH_POSITIONS.length, 8);
      for (const pos of ng.ALL_NOTCH_POSITIONS) {
        assert.equal(ng.isValidNotchPosition(pos), true);
      }
      assert.equal(ng.isValidNotchPosition("center"), false);
      assert.equal(ng.isValidNotchPosition(null), false);

      assert.deepEqual(
        ng.ALL_NOTCH_POSITIONS.filter((p) => ng.isTopNotchPosition(p)),
        ["top-left", "top", "top-right"]
      );
      assert.deepEqual(
        ng.ALL_NOTCH_POSITIONS.filter((p) => ng.isBottomNotchPosition(p)),
        ["bottom-left", "bottom", "bottom-right"]
      );
      assert.deepEqual(
        ng.ALL_NOTCH_POSITIONS.filter((p) => ng.isLeftNotchPosition(p)),
        ["top-left", "left", "bottom-left"]
      );
      assert.deepEqual(
        ng.ALL_NOTCH_POSITIONS.filter((p) => ng.isRightNotchPosition(p)),
        ["top-right", "right", "bottom-right"]
      );
      assert.deepEqual(
        ng.ALL_NOTCH_POSITIONS.filter((p) => ng.isSideCenterNotchPosition(p)),
        ["left", "right"]
      );
    });

    it("snaps coordinates to physical pixels across common DPI scaling factors", () => {
      assert.equal(ng.snapToPhysicalPixel(10.3, 1), 10);
      assert.equal(ng.snapToPhysicalPixel(10.1, 1.25), 10.4);
      assert.equal(ng.snapToPhysicalPixel(10.33, 1.5), 10);
      assert.equal(ng.snapToPhysicalPixel(10.25, 2), 10.5);
    });

    it("computes surface metrics across all 8 positions and falls back to window.devicePixelRatio", () => {
      const base = { width: 200, height: 40, earRadius: 12, bottomRadius: 14, dpr: 1 };

      const top = ng.getNotchSurfaceMetrics({ ...base, position: "top" });
      assert.deepEqual(top, {
        totalW: 224,
        totalH: 40,
        offsetLeft: -12,
        offsetTop: 0,
        bodyLeft: 12,
        bodyTop: 0,
        re: 12,
        rb: 14,
      });

      const bottomLegacy = ng.getNotchSurfaceMetrics({ ...base, isBottom: true });
      assert.deepEqual(bottomLegacy, top);

      const topLeft = ng.getNotchSurfaceMetrics({ ...base, position: "top-left" });
      assert.deepEqual(topLeft, {
        totalW: 212,
        totalH: 40,
        offsetLeft: 0,
        offsetTop: 0,
        bodyLeft: 0,
        bodyTop: 0,
        re: 12,
        rb: 14,
      });

      const bottomLeft = ng.getNotchSurfaceMetrics({ ...base, position: "bottom-left" });
      assert.deepEqual(bottomLeft, topLeft);

      const topRight = ng.getNotchSurfaceMetrics({ ...base, position: "top-right" });
      assert.deepEqual(topRight, {
        totalW: 212,
        totalH: 40,
        offsetLeft: -12,
        offsetTop: 0,
        bodyLeft: 12,
        bodyTop: 0,
        re: 12,
        rb: 14,
      });

      const bottomRight = ng.getNotchSurfaceMetrics({ ...base, position: "bottom-right" });
      assert.deepEqual(bottomRight, topRight);

      const sideLeft = ng.getNotchSurfaceMetrics({
        width: 48,
        height: 160,
        earRadius: 12,
        bottomRadius: 16,
        position: "left",
        dpr: 1,
      });
      assert.deepEqual(sideLeft, {
        totalW: 48,
        totalH: 184,
        offsetLeft: 0,
        offsetTop: -12,
        bodyLeft: 0,
        bodyTop: 12,
        re: 12,
        rb: 16,
      });

      const sideRight = ng.getNotchSurfaceMetrics({
        width: 48,
        height: 160,
        earRadius: 12,
        bottomRadius: 16,
        position: "right",
        dpr: 1,
      });
      assert.deepEqual(sideRight, sideLeft);

      Object.defineProperty(globalThis, "devicePixelRatio", {
        value: 2,
        configurable: true,
        writable: true,
      });
      const autoDpr = ng.getNotchSurfaceMetrics({
        width: 100.25,
        height: 30.25,
        earRadius: 10,
        bottomRadius: 8,
        position: "top",
      });
      assert.equal(autoDpr.totalW, 120.5);
      assert.equal(autoDpr.totalH, 30.5);
    });

    it("clamps earRadius and bottomRadius for island mode, oversized radii, and zero dimensions", () => {
      const island = ng.getNotchSurfaceMetrics({
        width: 120,
        height: 36,
        earRadius: 20,
        bottomRadius: 99,
        isIsland: true,
        dpr: 1,
      });
      assert.equal(island.re, 0);
      assert.equal(island.rb, 18);
      assert.equal(island.totalW, 120);
      assert.equal(Object.is(island.offsetLeft, 0), true);
      assert.equal(Object.is(island.offsetTop, 0), true);

      const clampedMaxEar = ng.getNotchSurfaceMetrics({
        width: 300,
        height: 120,
        earRadius: 99,
        bottomRadius: 10,
        position: "top",
        dpr: 1,
      });
      assert.equal(clampedMaxEar.re, 48);

      const clampedAlongWall = ng.getNotchSurfaceMetrics({
        width: 200,
        height: 30,
        earRadius: 30,
        bottomRadius: 15,
        position: "top",
        dpr: 1,
      });
      assert.equal(clampedAlongWall.re, 15);

      const clampedSideWall = ng.getNotchSurfaceMetrics({
        width: 40,
        height: 200,
        earRadius: 35,
        bottomRadius: 20,
        position: "left",
        dpr: 1,
      });
      assert.equal(clampedSideWall.re, 20);

      const zeroWidth = ng.getNotchSurfaceMetrics({
        width: 0,
        height: 40,
        earRadius: 12,
        bottomRadius: 10,
        position: "top",
        dpr: 1,
      });
      assert.equal(zeroWidth.re, 0);
      assert.equal(zeroWidth.rb, 0);

      const negativeInputs = ng.getNotchSurfaceMetrics({
        width: -20,
        height: 40,
        earRadius: -5,
        bottomRadius: -8,
        dpr: 1,
      });
      assert.equal(negativeInputs.totalW, 0);
      assert.equal(negativeInputs.re, 0);
      assert.equal(negativeInputs.rb, 0);
    });

    it("builds valid SVG fill and outline paths across all 8 positions and island variants", () => {
      assert.equal(ng.buildNotchPath({ width: 0, height: 30, earRadius: 10, bottomRadius: 10 }), "");
      assert.equal(ng.buildNotchOutlinePath({ width: 100, height: 0, earRadius: 10, bottomRadius: 10 }), "");

      const islandParams = {
        width: 140,
        height: 40,
        earRadius: 14,
        bottomRadius: 18,
        topRadius: 8,
        isIsland: true,
        dpr: 1,
      };
      const islandFill = ng.buildNotchPath(islandParams);
      const islandOutline = ng.buildNotchOutlinePath(islandParams);
      assert.equal(islandFill, islandOutline);
      assert.match(islandFill, /^M 8 0 H 132 A 8 8 0 0 1 140 8 .* Z$/);

      const sharpIsland = ng.buildNotchPath({
        width: 100,
        height: 30,
        earRadius: 0,
        bottomRadius: 0,
        isIsland: true,
        dpr: 1,
      });
      assert.match(sharpIsland, /L 100 0 .* L 100 30 .* L 0 30 .* L 0 0 Z$/);

      for (const pos of ng.ALL_NOTCH_POSITIONS) {
        const withEars = ng.buildNotchPath({
          width: 160,
          height: 40,
          earRadius: 10,
          bottomRadius: 12,
          position: pos,
          dpr: 1,
        });
        const withoutEars = ng.buildNotchPath({
          width: 160,
          height: 40,
          earRadius: 0,
          bottomRadius: 12,
          position: pos,
          dpr: 1,
        });
        const sharpCorners = ng.buildNotchPath({
          width: 160,
          height: 40,
          earRadius: 0,
          bottomRadius: 0,
          position: pos,
          dpr: 1,
        });
        const outlineWithEars = ng.buildNotchOutlinePath({
          width: 160,
          height: 40,
          earRadius: 10,
          bottomRadius: 12,
          position: pos,
          dpr: 1,
        });
        const outlineNoEars = ng.buildNotchOutlinePath({
          width: 160,
          height: 40,
          earRadius: 0,
          bottomRadius: 0,
          position: pos,
          dpr: 1,
        });

        assert.ok(withEars.startsWith("M ") && withEars.endsWith(" Z"), `Fill path for ${pos}`);
        assert.ok(withoutEars.startsWith("M ") && withoutEars.endsWith(" Z"), `No-ear path for ${pos}`);
        assert.ok(sharpCorners.includes("L "), `Sharp corner line segment for ${pos}`);
        assert.ok(outlineWithEars.startsWith("M ") && !outlineWithEars.endsWith(" Z"), `Open outline for ${pos}`);
        assert.ok(outlineNoEars.startsWith("M ") && !outlineNoEars.endsWith(" Z"), `Open sharp outline for ${pos}`);
      }
    });
  });
}

function registerCalculatorSuite(getLoader) {
  describe("Calculator & Unit Conversion Utilities", () => {
    let calc;

    before(async () => {
      calc = await getLoader().loadModule("/src/utils/calculatorUtils.ts");
    });

    it("formats finite, near-zero, and non-finite numbers cleanly", () => {
      assert.equal(calc.formatDisplayNumber(1234.5), "1.234,5");
      assert.equal(calc.formatDisplayNumber(1e-13), "0");
      assert.equal(calc.formatDisplayNumber(-0), "0");
      assert.equal(calc.formatDisplayNumber(0.12345678), "0,123457");
      assert.equal(calc.formatDisplayNumber(Infinity), "Error");
      assert.equal(calc.formatDisplayNumber(NaN), "Error");
    });

    it("converts length, weight, temperature, and rejects unknown units", () => {
      assert.equal(calc.convertUnitValue(2, "km", "m", "length"), 2000);
      assert.equal(calc.convertUnitValue(10, "in", "cm", "length"), 25.4);
      assert.equal(calc.convertUnitValue(2.5, "kg", "g", "weight"), 2500);
      assert.equal(calc.convertUnitValue(1, "ton", "kg", "weight"), 1000);
      assert.ok(Number.isNaN(calc.convertUnitValue(5, "parsec", "m", "length")));

      assert.equal(calc.convertTemperature(100, "C", "F"), 212);
      assert.equal(calc.convertTemperature(32, "F", "C"), 0);
      assert.equal(calc.convertTemperature(25, "C", "C"), 25);
    });

    it("evaluates arithmetic precedence, unicode operators, percentages, and decimals", () => {
      assert.equal(calc.evaluateCalcExpression("2 + 3 * 4"), "14");
      assert.equal(calc.evaluateCalcExpression("(2 + 3) × 4 ÷ 2"), "10");
      assert.equal(calc.evaluateCalcExpression("12,5 * 100"), "1.250");
      assert.equal(calc.evaluateCalcExpression("-5 + +8"), "3");
      assert.equal(calc.evaluateCalcExpression(".5 * 4"), "2");
      assert.equal(calc.evaluateCalcExpression("50%"), "0,5");
      assert.equal(calc.evaluateCalcExpression("100 + 50%"), "100,5");
      assert.equal(calc.evaluateCalcExpression("(200)%%"), "0,02");
      assert.equal(calc.evaluateCalcExpression("20% dari 150"), "30");
      assert.equal(calc.evaluateCalcExpression("12,5% of 200"), "25");
      assert.equal(calc.evaluateCalcExpression("-10% of 50"), "-5");
    });

    it("handles empty input, malformed syntax, and division by zero safely", () => {
      assert.equal(calc.evaluateCalcExpression(""), "—");
      assert.equal(calc.evaluateCalcExpression("   "), "—");
      assert.equal(calc.evaluateCalcExpression("2 + * 3"), "—");
      assert.equal(calc.evaluateCalcExpression("1.2.3 + 4"), "—");
      assert.equal(calc.evaluateCalcExpression("."), "—");
      assert.equal(calc.evaluateCalcExpression("sqrt(9)"), "—");
      assert.equal(calc.evaluateCalcExpression("2^3"), "—");
      assert.equal(calc.evaluateCalcExpression("(2 + 3"), "—");
      assert.equal(calc.evaluateCalcExpression("(2 + 3))"), "—");
      assert.equal(calc.evaluateCalcExpression("()"), "—");

      assert.equal(calc.evaluateCalcExpression("10 / 0"), "Error");
      assert.equal(calc.evaluateCalcExpression("0 / 0"), "Error");
      assert.equal(calc.evaluateCalcExpression("1 / (4 - 4)"), "Error");
      assert.equal(calc.evaluateCalcExpression("10 / 0 + 5"), "Error");
    });
  });
}

function registerDateNlpSuite(getLoader) {
  describe("NLP Date & Time Parser", () => {
    let nlp;
    // Fixed reference: Wednesday, 2026-11-18 10:30:00 local time
    const refDate = new Date(2026, 10, 18, 10, 30, 0, 0);

    before(async () => {
      nlp = await getLoader().loadModule("/src/utils/dateNlpParser.ts");
    });

    it("returns empty result for blank or non-date text", () => {
      const blank = nlp.parseDateNlp("   ", refDate, "id");
      assert.equal(blank.hasDate, false);
      assert.equal(blank.dueAt, null);
      assert.equal(blank.cleanText, "");

      const plain = nlp.parseDateNlp("Refactor state management", refDate, "en");
      assert.equal(plain.hasDate, false);
      assert.equal(plain.hasTime, false);
      assert.equal(plain.dueAt, null);
      assert.equal(plain.cleanText, "Refactor state management");
    });

    it("parses Indonesian relative day and time-of-day phrases", () => {
      const todayDefault = nlp.parseDateNlp("Beli kopi hari ini", refDate, "id");
      assert.equal(todayDefault.hasDate, true);
      assert.equal(todayDefault.hasTime, false);
      assert.equal(todayDefault.cleanText, "Beli kopi");
      assert.equal(todayDefault.badgeType, "am");
      assert.equal(todayDefault.chipLabel, "Hari ini");
      assert.equal(todayDefault.dueAt, new Date(2026, 10, 18, 23, 59, 0, 0).getTime());

      const malamIni = nlp.parseDateNlp("Olahraga malam ini", refDate, "id");
      assert.equal(malamIni.hasTime, true);
      assert.equal(malamIni.dueAt, new Date(2026, 10, 18, 20, 0, 0, 0).getTime());
      assert.equal(malamIni.chipLabel, "Hari ini · 20:00");

      const besokSore = nlp.parseDateNlp("Meeting besok sore", refDate, "id");
      assert.equal(besokSore.badgeType, "gr");
      assert.equal(besokSore.chipLabel, "Besok · 16:00");
      assert.equal(besokSore.dueAt, new Date(2026, 10, 19, 16, 0, 0, 0).getTime());

      const lusa = nlp.parseDateNlp("Kirim dokumen lusa", refDate, "id");
      assert.equal(lusa.badgeType, "bl");
      assert.equal(lusa.dueAt, new Date(2026, 10, 20, 23, 59, 0, 0).getTime());

      const besokLusa = nlp.parseDateNlp("Kirim laporan besok lusa", refDate, "id");
      assert.equal(besokLusa.badgeType, "bl");
      assert.equal(besokLusa.cleanText, "Kirim laporan");
      assert.equal(besokLusa.dueAt, new Date(2026, 10, 20, 23, 59, 0, 0).getTime());

      const duaMalam = nlp.parseDateNlp("Sahur besok jam 2 malam", refDate, "id");
      assert.equal(duaMalam.hasTime, true);
      assert.equal(duaMalam.dueAt, new Date(2026, 10, 19, 2, 0, 0, 0).getTime());

      const ahad = nlp.parseDateNlp("Kumpul ahad", refDate, "id");
      assert.equal(ahad.dueAt, new Date(2026, 10, 22, 23, 59, 0, 0).getTime());

      const shortFri = nlp.parseDateNlp("Demo fri at 12 night", refDate, "en");
      assert.equal(shortFri.hasTime, true);
      assert.equal(shortFri.dueAt, new Date(2026, 10, 20, 0, 0, 0, 0).getTime());

      const pagiIni = nlp.parseDateNlp("Sarapan pagi ini", refDate, "id");
      assert.equal(pagiIni.hasTime, true);
      assert.equal(pagiIni.dueAt, new Date(2026, 10, 18, 9, 0, 0, 0).getTime());

      const akhirPekan = nlp.parseDateNlp("Bersih-bersih akhir pekan", refDate, "id");
      // Wed Nov 18 -> Sat Nov 21
      assert.equal(akhirPekan.dueAt, new Date(2026, 10, 21, 23, 59, 0, 0).getTime());
    });

    it("parses English relative phrases and named weekdays in both languages", () => {
      const tmwMorning = nlp.parseDateNlp("Standup tomorrow morning", refDate, "en");
      assert.equal(tmwMorning.hasTime, true);
      assert.equal(tmwMorning.badgeType, "gr");
      assert.equal(tmwMorning.chipLabel, "Tomorrow · 09:00");
      assert.equal(tmwMorning.cleanText, "Standup");
      assert.equal(tmwMorning.dueAt, new Date(2026, 10, 19, 9, 0, 0, 0).getTime());

      const sameWeekday = nlp.parseDateNlp("Sync rabu", refDate, "id");
      // refDate is Wednesday -> next Wednesday (+7 days = Nov 25)
      assert.equal(sameWeekday.dueAt, new Date(2026, 10, 25, 23, 59, 0, 0).getTime());

      const jumat = nlp.parseDateNlp("Laporan pada jum'at", refDate, "id");
      assert.equal(jumat.cleanText, "Laporan");
      assert.equal(jumat.dueAt, new Date(2026, 10, 20, 23, 59, 0, 0).getTime());

      const friday = nlp.parseDateNlp("Deploy on friday at 2:15 pm", refDate, "en");
      assert.equal(friday.cleanText, "Deploy");
      assert.equal(friday.hasTime, true);
      assert.equal(friday.dueAt, new Date(2026, 10, 20, 14, 15, 0, 0).getTime());
    });

    it("parses combined day+time, standalone times, and strips dangling prepositions", () => {
      const combined = nlp.parseDateNlp("Bayar tagihan besok jam 4 sore", refDate, "id");
      assert.equal(combined.cleanText, "Bayar tagihan");
      assert.equal(combined.dueAt, new Date(2026, 10, 19, 16, 0, 0, 0).getTime());

      const morningOverride = nlp.parseDateNlp("Lari besok pagi jam 6", refDate, "id");
      assert.equal(morningOverride.dueAt, new Date(2026, 10, 19, 6, 0, 0, 0).getTime());

      const standaloneFuture = nlp.parseDateNlp("Call client at 15.45", refDate, "en");
      assert.equal(standaloneFuture.hasDate, true);
      assert.equal(standaloneFuture.hasTime, true);
      assert.equal(standaloneFuture.cleanText, "Call client");
      assert.equal(standaloneFuture.dueAt, new Date(2026, 10, 18, 15, 45, 0, 0).getTime());

      // 08:00 is already past refDate (10:30), so standalone advances to tomorrow
      const standalonePast = nlp.parseDateNlp("Review 08:00", refDate, "en");
      assert.equal(standalonePast.dueAt, new Date(2026, 10, 19, 8, 0, 0, 0).getTime());

      const bareDateOnly = nlp.parseDateNlp("besok", refDate, "id");
      assert.equal(bareDateOnly.cleanText, "besok");
    });

    it("formats badges accurately across Today, Tomorrow, and future dates in ID/EN", () => {
      const todayBadge = nlp.formatNlpDateBadge(new Date(2026, 10, 18, 18, 5).getTime(), refDate, "en", true);
      assert.deepEqual(todayBadge, {
        chipLabel: "Today · 18:05",
        badgeLabel: "Today · 18:05",
        badgeType: "am",
      });

      const futureId = nlp.formatNlpDateBadge(new Date(2026, 10, 20, 14, 0).getTime(), refDate, "id", true);
      assert.deepEqual(futureId, {
        chipLabel: "Jum, 20 Nov · 14:00",
        badgeLabel: "Jum · 14:00",
        badgeType: "bl",
      });

      const futureEnNoTime = nlp.formatNlpDateBadge(new Date(2026, 10, 20, 23, 59).getTime(), refDate, "en", false);
      assert.deepEqual(futureEnNoTime, {
        chipLabel: "Fri, 20 Nov",
        badgeLabel: "Fri",
        badgeType: "bl",
      });
    });
  });
}

function registerLyricsSuite(getLoader) {
  describe("Lyrics Parsers, Word Timing & Sanitizer", () => {
    let ttml;
    let krc;
    let wordParsers;
    let wordTiming;
    let sanitizer;

    before(async () => {
      const loader = getLoader();
      ttml = await loader.loadModule("/src/services/lyrics/ttmlParser.ts");
      krc = await loader.loadModule("/src/services/lyrics/krcParser.ts");
      wordParsers = await loader.loadModule("/src/services/lyrics/wordParsers.ts");
      wordTiming = await loader.loadModule("/src/services/lyrics/wordTiming.ts");
      sanitizer = await loader.loadModule("/src/services/lyrics/payloadSanitizer.ts");
    });

    it("parses TTML timestamps across ms, s, mm:ss, and hh:mm:ss formats", () => {
      assert.equal(ttml.parseTtmlTimestamp("1500ms"), 1.5);
      assert.equal(ttml.parseTtmlTimestamp("12.25s"), 12.25);
      assert.equal(ttml.parseTtmlTimestamp("01:02:03.500"), 3723.5);
      assert.equal(ttml.parseTtmlTimestamp("02:05,25"), 125.25);
      assert.equal(ttml.parseTtmlTimestamp("45.5"), 45.5);
      assert.equal(ttml.parseTtmlTimestamp("-5s"), undefined);
      assert.equal(ttml.parseTtmlTimestamp("bad:val"), undefined);
      assert.equal(ttml.parseTtmlTimestamp(""), undefined);
    });

    it("parses TTML word-timed spans, entities, translations, plain paragraphs, and dummy filtering", () => {
      const xml = `
        <tt><body><div>
          <p begin="10s" end="14s">
            <!-- comment ignored -->
            <span begin="10s" end="11s">Hello</span>
            <span begin="11s">world &amp; &#x266A;</span>
            <span ttm:role="x-trans"><span>Terjemahan</span></span>
            <span role="x-roman">Romaji</span>
          </p>
          <p begin="5s" end="7s">Plain<br/>line &quot;two&quot;</p>
          <p begin="20s" end="22s">Composer: Someone</p>
        </div></body></tt>
      `;
      const lines = ttml.parseTtmlLyrics(xml, (txt) => txt.startsWith("Composer:"));
      assert.equal(lines.length, 2);
      // Sorted ascending by time
      assert.equal(lines[0].time, 5);
      assert.equal(lines[0].text, 'Plain line "two"');
      assert.equal(lines[0].words, undefined);

      assert.equal(lines[1].time, 10);
      assert.equal(lines[1].text, "Hello world & ♪");
      assert.equal(lines[1].words?.length, 2);
      assert.equal(lines[1].words?.[0].text, "Hello ");
      assert.equal(lines[1].words?.[0].endTime, 11);
      assert.equal(lines[1].words?.[1].text, "world & ♪");
      // Last word without span end inherits pEnd
      assert.equal(lines[1].words?.[1].endTime, 14);
    });

    it("decodes compressed XORed KRC payloads and rejects malformed inputs", async () => {
      const rawKrc = "[offset:500]\n[2000,1500]<0,500,0>Hel<500,500,0>lo <1000,500,0>world\n";
      const validB64 = await deflateStringBase64(rawKrc);

      const decoded = await krc.decodeKrcPayload(`  ${validB64}  `);
      assert.equal(decoded, rawKrc);

      assert.equal(await krc.decodeKrcPayload(""), null);
      assert.equal(await krc.decodeKrcPayload(btoa("bad1payload")), null);
      assert.equal(await krc.decodeKrcPayload(btoa("krc1corrupt")), null);
      assert.equal(await krc.decodeKrcPayload("not-valid-base64!!!"), null);
    });

    it("parses KRC lines with offset compensation, dummy filter, and sorting", () => {
      const krcText = [
        "[offset:500]",
        "[5000,1200]<0,400,0>Second <400,800,0>line",
        "[1000,1000]<0,500,0>First <500,500,0>line",
        "[9000,1000]<0,1000,0>Instrumental",
      ].join("\n");

      const lines = krc.parseKrcLines(krcText, (t) => t === "Instrumental");
      assert.equal(lines.length, 2);
      assert.equal(lines[0].time, 0.5); // 1.0 - 0.5
      assert.equal(lines[0].text, "First line");
      assert.equal(lines[0].words?.[0].text, "First ");
      assert.equal(lines[0].words?.[1].time, 1.0);
      assert.equal(lines[0].words?.[1].endTime, 1.5);
      assert.equal(lines[1].time, 4.5);
    });

    it("parses enhanced LRC, YRC, spacing normalization, and offset shifting", () => {
      assert.equal(wordParsers.parseLrcTimestamp("01", "05", "5"), 65.5);
      assert.equal(wordParsers.parseLrcTimestamp("01", "05", "05"), 65.05);
      assert.equal(wordParsers.parseLrcTimestamp("00", "10", "250"), 10.25);

      const enhanced = wordParsers.parseEnhancedLrcLine("Lead <00:12.00>sing <00:13.50>along<00:15.00>", 10);
      assert.equal(enhanced.cleanText, "Lead sing along");
      assert.deepEqual(enhanced.words, [
        { time: 10, endTime: 12, text: "Lead " },
        { time: 12, endTime: 13.5, text: "sing " },
        { time: 13.5, endTime: 15, text: "along" },
      ]);

      const plainEnhanced = wordParsers.parseEnhancedLrcLine("  No inline tags  ", 5);
      assert.deepEqual(plainEnhanced, { cleanText: "No inline tags" });

      const shifted = wordParsers.shiftWordsByOffset(enhanced.words, -11);
      assert.equal(shifted[0].time, 0);
      assert.equal(shifted[0].endTime, 1);
      assert.equal(shifted[2].time, 2.5);

      const yrc = [
        '{"t":0,"c":[{"tx":"Meta"}]}',
        "[3000,1500](3000,500,0)Two (3500,1000,0)words",
        "[1000,1000](1000,400,0)One (1400,600,0)line",
      ].join("\n");
      const yrcLines = wordParsers.parseYrcLines(yrc);
      assert.equal(yrcLines.length, 2);
      assert.equal(yrcLines[0].time, 1);
      assert.equal(yrcLines[0].text, "One line");
      assert.equal(yrcLines[1].words?.[0].text, "Two ");
    });

    it("tokenizes CJK/Latin, resolves real vs synthetic word timings, and splits wrapped rows", () => {
      assert.equal(wordTiming.hasWordTimings(null), false);
      assert.equal(wordTiming.hasWordTimings([{ time: 1, text: "Plain" }]), false);
      assert.equal(
        wordTiming.hasWordTimings([{ time: 1, text: "Hi", words: [{ time: 1, text: "Hi" }] }]),
        true
      );

      assert.deepEqual(wordTiming.tokenizeLineForTiming("Hello   world!"), ["Hello ", "world!"]);
      assert.deepEqual(wordTiming.tokenizeLineForTiming("今日はOKだね！"), [
        "今",
        "日",
        "は",
        "OK",
        "だ",
        "ね！",
      ]);

      const realMissingSpace = wordTiming.resolveLineWords(
        {
          time: 10,
          text: "Hello world",
          words: [
            { time: 10, text: "Hello" },
            { time: 10.6, endTime: 11.2, text: "world" },
          ],
        },
        13
      );
      assert.equal(realMissingSpace.isRealWordTiming, true);
      assert.equal(realMissingSpace.words[0].text, "Hello ");
      assert.equal(realMissingSpace.words[0].endTime, 10.6);

      const synthetic = wordTiming.resolveLineWords({ time: 20, text: "Shine bright" }, 24);
      assert.equal(synthetic.isRealWordTiming, false);
      assert.equal(synthetic.words.length, 2);
      assert.equal(synthetic.words[0].time, 20);
      assert.equal(synthetic.words[1].endTime, synthetic.lineEndTime);

      assert.equal(wordTiming.computeWordFillProgress({ time: 1, endTime: 3, text: "a" }, 5, 0.5), 0);
      assert.equal(wordTiming.computeWordFillProgress({ time: 1, endTime: 3, text: "a" }, 5, 2), 0.5);
      assert.equal(wordTiming.computeWordFillProgress({ time: 1, endTime: 3, text: "a" }, 5, 4), 1);

      const splitClean = wordTiming.splitWordsForWrappedRows(
        {
          isRealWordTiming: true,
          lineEndTime: 14,
          words: [
            { time: 10, endTime: 11, text: "First " },
            { time: 11, endTime: 12, text: "row " },
            { time: 12, endTime: 13, text: "second " },
            { time: 13, endTime: 14, text: "row" },
          ],
        },
        "First row",
        "second row"
      );
      assert.equal(splitClean.row0.words?.length, 2);
      assert.equal(splitClean.row0.words?.[1].text, "row");
      assert.equal(splitClean.row0NextTime, 12);
      assert.equal(splitClean.row1?.words?.length, 2);
      assert.equal(splitClean.row1NextTime, 14);
    });

    it("sanitizes corrupted lyrics lines and payloads defensively", () => {
      const sanitized = sanitizer.sanitizeLyricsPayload({
        artist: 123,
        title: null,
        state: "synced",
        synced: 1,
        lines: [
          null,
          { time: NaN, text: "drop me" },
          {
            time: 1.5,
            text: "Valid line",
            words: [
              { time: Infinity, text: "bad" },
              { time: 1.5, endTime: NaN, text: "Valid" },
              { time: 2.0, endTime: 2.8, text: 42 },
            ],
          },
        ],
        plain_lyrics: 999,
        provider: undefined,
        provider_name: undefined,
        offset: NaN,
      });

      assert.equal(sanitized.artist, "123");
      assert.equal(sanitized.title, "");
      assert.equal(sanitized.synced, true);
      assert.equal(sanitized.plain_lyrics, null);
      assert.equal(sanitized.provider, "auto");
      assert.equal(sanitized.provider_name, "");
      assert.equal(sanitized.offset, 0);
      assert.equal(sanitized.lines.length, 1);
      assert.deepEqual(sanitized.lines[0].words, [
        { time: 1.5, text: "Valid" },
        { time: 2.0, endTime: 2.8, text: "42" },
      ]);
    });
  });
}

function registerProductivitySuite(getLoader) {
  describe("Productivity Services (Pomodoro, To-Do, Notes, Water)", () => {
    let pomodoro;
    let todoUtils;
    let noteUtils;
    let water;
    let langStore;

    before(async () => {
      const loader = getLoader();
      pomodoro = await loader.loadModule("/src/services/pomodoroService.ts");
      todoUtils = await loader.loadModule("/src/services/todoUtils.ts");
      noteUtils = await loader.loadModule("/src/services/noteUtils.ts");
      water = await loader.loadModule("/src/services/waterService.ts");
      langStore = await loader.loadModule("/src/services/languageStore.ts");
    });

    it("persists pomodoro settings, resets stale daily stats, normalizes modes, and formats timers", () => {
      assert.deepEqual(pomodoro.loadPomodoroSettings(), pomodoro.DEFAULT_POMODORO_SETTINGS);
      pomodoro.savePomodoroSettings({
        ...pomodoro.DEFAULT_POMODORO_SETTINGS,
        focusMinutes: 50,
        autoStartNext: true,
      });
      assert.equal(pomodoro.loadPomodoroSettings().focusMinutes, 50);

      localStorage.setItem("gili_pomodoro_settings", "{corrupt");
      assert.deepEqual(pomodoro.loadPomodoroSettings(), pomodoro.DEFAULT_POMODORO_SETTINGS);

      localStorage.setItem(
        "gili_pomodoro_daily_stats",
        JSON.stringify({ dateKey: "1999-01-01", completedSessions: 9, focusMinutesToday: 225 })
      );
      const resetStats = pomodoro.loadPomodoroDailyStats();
      assert.equal(resetStats.completedSessions, 0);
      assert.equal(resetStats.focusMinutesToday, 0);

      const afterOne = pomodoro.recordCompletedFocusSession(25);
      const afterTwo = pomodoro.recordPomodoroSession(15);
      assert.equal(afterOne.completedSessions, 1);
      assert.equal(afterTwo.completedSessions, 2);
      assert.equal(afterTwo.focusMinutesToday, 40);

      assert.equal(pomodoro.normalizePomodoroMode("  short-break "), "short_break");
      assert.equal(pomodoro.normalizePomodoroMode("shortbreak"), "short_break");
      assert.equal(pomodoro.normalizePomodoroMode("LONG-BREAK"), "long_break");
      assert.equal(pomodoro.normalizePomodoroMode("focus"), "focus");
      assert.equal(pomodoro.normalizePomodoroMode("unknown"), undefined);
      assert.equal(pomodoro.normalizePomodoroMode(123), undefined);

      assert.equal(
        pomodoro.getModeDurationSeconds("short_break", { ...pomodoro.DEFAULT_POMODORO_SETTINGS, shortBreakMinutes: 0 }),
        60
      );
      assert.equal(pomodoro.formatPomodoroTime(-10), "00:00");
      assert.equal(pomodoro.formatSecondsMMSS(125.9), "02:05");
      assert.equal(pomodoro.formatPomodoroTime(3605), "60:05");
    });

    it("computes recurring To-Do due dates (including month-end clamping) and rolls over tasks", () => {
      // Friday Nov 20, 2026 09:30 -> weekdays skips Sat/Sun to Monday Nov 23 09:30
      const friMorning = new Date(2026, 10, 20, 9, 30, 0, 0).getTime();
      const nextWeekday = todoUtils.computeNextRepeatDue(friMorning, "weekdays", friMorning);
      assert.equal(nextWeekday, new Date(2026, 10, 23, 9, 30, 0, 0).getTime());

      // Monthly Jan 31 -> Feb 28 (non-leap 2026) and Feb 29 (leap 2024)
      const jan31NonLeap = new Date(2026, 0, 31, 10, 0, 0, 0).getTime();
      assert.equal(
        todoUtils.computeNextRepeatDue(jan31NonLeap, "monthly", jan31NonLeap),
        new Date(2026, 1, 28, 10, 0, 0, 0).getTime()
      );
      const jan31Leap = new Date(2024, 0, 31, 10, 0, 0, 0).getTime();
      assert.equal(
        todoUtils.computeNextRepeatDue(jan31Leap, "monthly", jan31Leap),
        new Date(2024, 1, 29, 10, 0, 0, 0).getTime()
      );

      const todayNoon = new Date(2026, 10, 18, 12, 0, 0, 0).getTime(); // Wed
      const yesterdayNoon = new Date(2026, 10, 17, 12, 0, 0, 0).getTime();
      const satNoon = new Date(2026, 10, 21, 12, 0, 0, 0).getTime();

      assert.equal(
        todoUtils.shouldRecurringTaskRollover(
          { id: "1", text: "Done today", completed: true, createdAt: 1, repeat: "daily", lastCompletedAt: todayNoon },
          todayNoon
        ),
        false
      );
      assert.equal(
        todoUtils.shouldRecurringTaskRollover(
          { id: "2", text: "Weekday on Sat", completed: true, createdAt: 1, repeat: "weekdays", lastCompletedAt: yesterdayNoon },
          satNoon
        ),
        false
      );

      const { updated, changed } = todoUtils.rolloverRecurringTasks(
        [
          {
            id: "roll-1",
            text: "Standup",
            completed: true,
            createdAt: 1,
            repeat: "daily",
            dueAt: yesterdayNoon,
            lastCompletedAt: yesterdayNoon,
          },
          {
            id: "keep-1",
            text: "One-off",
            completed: true,
            createdAt: 1,
            repeat: "none",
          },
        ],
        todayNoon
      );
      assert.equal(changed, true);
      assert.equal(updated[0].completed, false);
      assert.equal(updated[0].lastCompletedAt, null);
      assert.equal(updated[0].dueAt, todayNoon);
      assert.equal(updated[1].completed, true);

      langStore.setLanguage("en");
      assert.equal(todoUtils.getRepeatBadgeText("daily"), "Daily");
      assert.equal(todoUtils.getRepeatLabel("weekdays"), "Weekdays (Mon-Fri)");
      langStore.setLanguage("id");
      assert.equal(todoUtils.getRepeatBadgeText("monthly"), "Bulanan");
      assert.equal(todoUtils.getRepeatLabel("weekdays"), "Hari kerja (Sen-Jum)");

      assert.equal(
        todoUtils.shouldRecurringTaskRollover(
          { id: "3", text: "Legacy", completed: true, createdAt: 1, repeat: "daily" },
          todayNoon
        ),
        true
      );
      assert.equal(
        todoUtils.shouldRecurringTaskRollover(
          { id: "4", text: "Incomplete", completed: false, createdAt: 1, repeat: "daily" },
          todayNoon
        ),
        false
      );
      const nextWeek = todayNoon + 7 * 86400_000;
      assert.equal(
        todoUtils.shouldRecurringTaskRollover(
          { id: "5", text: "Future due", completed: true, createdAt: 1, repeat: "weekly", dueAt: nextWeek, lastCompletedAt: yesterdayNoon },
          todayNoon
        ),
        false
      );
    });

    it("loads localized default notes, handles corrupt vs empty arrays, creates/deletes notes, and emits events", () => {
      langStore.setLanguage("en");
      const defaultEn = noteUtils.loadMiniNotes();
      assert.equal(defaultEn.length, 1);
      assert.equal(defaultEn[0].title, "Gili Quick Note");

      localStorage.setItem("gili_mini_notes_v2", "[]");
      assert.deepEqual(noteUtils.loadMiniNotes(), []);

      localStorage.setItem("gili_mini_notes_v2", "{bad");
      langStore.setLanguage("id");
      assert.equal(noteUtils.loadMiniNotes()[0].title, "Catatan cepat Gili");

      let eventCount = 0;
      const listener = () => {
        eventCount++;
      };
      window.addEventListener("gili_notes_updated", listener);
      try {
        const longTitle = "A".repeat(80);
        const created = noteUtils.createQuickNoteItem(`${longTitle}\nBody line`, "mint", true);
        assert.equal(created.title.length, 64);
        assert.equal(created.content, "Body line");
        assert.equal(created.color, "mint");
        assert.equal(noteUtils.loadMiniNotes()[0].id, created.id);

        const blankNote = noteUtils.createQuickNoteItem("   ", "amber", false);
        assert.equal(blankNote.title.length > 0, true);

        noteUtils.deleteQuickNoteItem(created.id);
        assert.equal(noteUtils.loadMiniNotes().some((n) => n.id === created.id), false);
        assert.equal(eventCount, 3);
      } finally {
        window.removeEventListener("gili_notes_updated", listener);
      }
    });

    it("cleans legacy sample water records, tracks logical dates, and handles CRUD + milestones", () => {
      localStorage.setItem(
        water.WATER_STORAGE_KEY,
        JSON.stringify({
          records: [
            { id: "sample-1", timestamp: Date.now(), amountMl: 500 },
            { id: "past-2", timestamp: Date.now() - 86400_000, amountMl: 500 },
            { id: "real-1", timestamp: Date.now() - 60_000, amountMl: 100 },
          ],
          settings: { ...water.DEFAULT_WATER_SETTINGS, reminderEnabled: true },
          snoozedUntil: null,
          bestStreakDays: 14,
          lastDrinkTimestamp: null,
          lastUndoneRecord: null,
          celebratedMilestones: [],
        })
      );
      const cleaned = water.loadWaterData();
      assert.equal(cleaned.records.length, 1);
      assert.equal(cleaned.bestStreakDays, 0);
      // Without island_water_reminder_configured, reminderEnabled is forced false
      assert.equal(cleaned.settings.reminderEnabled, false);

      water.updateWaterSettings({ reminderEnabled: true, dailyTargetMl: 1000, streakThresholdPercent: 80 });
      assert.equal(water.loadWaterData().settings.reminderEnabled, true);

      // 02:15 belongs to previous logical day when dayStartHour = 3
      const preRollover = new Date(2026, 10, 18, 2, 15, 0).getTime();
      const postRollover = new Date(2026, 10, 18, 3, 5, 0).getTime();
      assert.equal(water.getLogicalDateKey(preRollover, 3), "2026-11-17");
      assert.equal(water.getLogicalDateKey(postRollover, 3), "2026-11-18");

      const celebrations = [];
      const onCelebrate = (e) => celebrations.push(e.detail);
      window.addEventListener("gili_streak_celebration", onCelebrate);
      try {
        const res1 = water.logDrink(700);
        assert.equal(res1.celebration?.type, "streak_opened");
        assert.equal(res1.celebration?.streakDays, 1);
        assert.equal(res1.targetAchieved, false);

        const res2 = water.logDrink(250);
        assert.equal(res2.targetAchieved, true);
        assert.equal(water.getDailyIntake(new Date()).totalMl, 1050);

        assert.equal(water.undoLastDrink(), true);
        assert.equal(water.loadWaterData().lastUndoneRecord?.id, res2.record.id);

        water.updateDrink(res1.record.id, 900, res1.record.timestamp);
        assert.equal(water.getDailyIntake(new Date()).totalMl, 1000);

        water.deleteDrink(res1.record.id);
        assert.equal(water.getDailyIntake(new Date()).totalMl, 100);

        // Day-3 checkpoint milestone celebration (log yesterday first so no false gap triggers auto-freeze)
        const dayMs = 24 * 60 * 60 * 1000;
        water.resetAllWaterData();
        water.updateWaterSettings({ dailyTargetMl: 1000, streakThresholdPercent: 80 });
        water.logDrink(900, false, Date.now() - dayMs);
        water.logDrink(900, false, Date.now() - 2 * dayMs);
        const day3 = water.logDrink(900);
        assert.equal(day3.celebration?.type, "checkpoint_reached");
        assert.equal(day3.celebration?.streakDays, 3);

        // Explicit useStreakFreeze
        assert.equal(water.useStreakFreeze("2026-11-10"), true);
        assert.equal(water.useStreakFreeze("2026-11-10"), false);
        assert.equal(water.useStreakFreeze("2026-11-11"), false); // freezeCount depleted (default 1)

        water.resetAllWaterData();
        assert.equal(water.loadWaterData().records.length, 0);
        assert.deepEqual(celebrations, [
          { type: "streak_opened", streakDays: 1 },
          { type: "streak_opened", streakDays: 1 },
          { type: "checkpoint_reached", streakDays: 3 },
        ]);
      } finally {
        window.removeEventListener("gili_streak_celebration", onCelebrate);
      }
    });

    it("evaluates water streaks, auto-freeze bridging, active windows, and history analytics", () => {
      const refDate = new Date(2026, 10, 18, 12, 0, 0);
      const dayMs = 24 * 60 * 60 * 1000;
      const baseData = {
        records: [
          { id: "d0", timestamp: refDate.getTime(), amountMl: 900 },
          // Gap yesterday (Nov 17)
          { id: "d2", timestamp: refDate.getTime() - 2 * dayMs, amountMl: 900 },
          { id: "d3", timestamp: refDate.getTime() - 3 * dayMs, amountMl: 900 },
        ],
        settings: {
          ...water.DEFAULT_WATER_SETTINGS,
          dailyTargetMl: 1000,
          streakThresholdPercent: 80,
          autoUseFreeze: true,
          freezeCount: 1,
        },
        snoozedUntil: null,
        bestStreakDays: 0,
        lastDrinkTimestamp: refDate.getTime(),
        lastUndoneRecord: null,
        celebratedMilestones: [],
        frozenDateKeys: [],
      };

      const streakBridged = water.getStreakInfo(baseData, refDate);
      assert.equal(streakBridged.currentStreak, 3);
      assert.equal(streakBridged.freezeCount, 0);
      assert.equal(baseData.settings.freezeCount, 1); // pure read does not mutate

      // Unbridged gap (nothing before missed day) should NOT consume freeze
      const unbridged = {
        ...baseData,
        records: [{ id: "d0", timestamp: refDate.getTime(), amountMl: 900 }],
      };
      const streakUnbridged = water.getStreakInfo(unbridged, refDate);
      assert.equal(streakUnbridged.currentStreak, 1);
      assert.equal(streakUnbridged.freezeCount, 1);

      // Active window & overnight window
      assert.equal(water.isHourInActiveWindow(23, 20, 4), true);
      assert.equal(water.isHourInActiveWindow(3, 20, 4), true);
      assert.equal(water.isHourInActiveWindow(12, 20, 4), false);
      assert.equal(water.isHourInActiveWindow(15, 8, 8), true);
      assert.equal(water.isNearEndOfActiveWindow(19, 8, 21, 3), true);
      assert.equal(water.isNearEndOfActiveWindow(2, 20, 4, 3), true);
      assert.equal(water.isNearEndOfActiveWindow(8, 8, 8, 3), false);

      // Next reminder formatting
      assert.equal(
        water.getNextReminderTimeString({
          ...baseData,
          settings: { ...baseData.settings, reminderEnabled: false },
        }),
        "--:--"
      );
      const snoozeTarget = new Date(Date.now() + 10 * 60 * 1000);
      const expectedSnooze = `${String(snoozeTarget.getHours()).padStart(2, "0")}:${String(
        snoozeTarget.getMinutes()
      ).padStart(2, "0")}`;
      assert.equal(
        water.getNextReminderTimeString({
          ...baseData,
          snoozedUntil: snoozeTarget.getTime(),
          settings: { ...baseData.settings, reminderEnabled: true },
        }),
        expectedSnooze
      );

      // Guaranteed outside-window clamping at any wall-clock time
      const currentHour = new Date().getHours();
      const futureStart = (currentHour + 4) % 24;
      const futureEnd = (currentHour + 5) % 24;
      assert.equal(
        water.getNextReminderTimeString({
          ...baseData,
          lastDrinkTimestamp: null,
          settings: {
            ...baseData.settings,
            reminderEnabled: true,
            activeStartHour: futureStart,
            activeEndHour: futureEnd,
          },
        }),
        `${String(futureStart).padStart(2, "0")}:00`
      );

      // Weekly, Monthly, and 2-hour distributions
      const dist = water.getTwoHourDistribution(refDate, baseData);
      assert.equal(dist.length, 7);
      assert.equal(dist.find((slot) => slot.hour === 12)?.amountMl, 900);

      const weekly = water.getWeeklyHistory(0, baseData);
      assert.equal(weekly.days.length, 7);
      const monthly = water.getMonthlyHistory(0, baseData);
      assert.equal(monthly.days.length, monthly.totalDaysInMonth);

      // Zero dailyTargetMl must yield 0% instead of NaN/Infinity
      const zeroTargetData = {
        ...baseData,
        settings: { ...baseData.settings, dailyTargetMl: 0 },
      };
      const zeroStreak = water.getStreakInfo(zeroTargetData, refDate);
      assert.equal(zeroStreak.sevenDayHistory.every((d) => d.percent === 0), true);
      const zeroMonthly = water.getMonthlyHistory(0, zeroTargetData);
      assert.equal(zeroMonthly.days.every((d) => d.percent === 0), true);
    });
  });
}

function registerNotificationHistorySuite(getLoader) {
  describe("Notification History Service", () => {
    let notifSvc;
    let langStore;

    before(async () => {
      const loader = getLoader();
      notifSvc = await loader.loadModule("/src/services/notificationHistoryService.ts");
      langStore = await loader.loadModule("/src/services/languageStore.ts");
    });

    it("categorizes WhatsApp, WhatsApp Web, explicit apps, AUMID, and fallback notifications", () => {
      assert.deepEqual(
        notifSvc.categorizeNotification({
          title: "Alice",
          body: "Ping",
          appName: "Google Chrome",
          subtitle: "",
        }),
        { category: "system", appName: "Google Chrome" }
      );
      assert.deepEqual(
        notifSvc.categorizeNotification({
          title: "web.whatsapp.com",
          body: "New message",
          appName: "Microsoft Edge",
        }),
        { category: "message", appName: "WhatsApp Web" }
      );
      assert.deepEqual(
        notifSvc.categorizeNotification({
          title: "Bob",
          body: "Hi",
          aumid: "5319275A.WhatsAppDesktop",
        }),
        { category: "message", appName: "WhatsApp" }
      );
      assert.deepEqual(
        notifSvc.categorizeNotification({
          title: "Sprint deadline",
          body: "Today",
          appName: "Notion",
        }),
        { category: "reminder", appName: "Notion" }
      );
      assert.deepEqual(
        notifSvc.categorizeNotification({
          title: "Build finished",
          body: "OK",
          aumid: "com.tinyspeck.slackdesktop",
        }),
        { category: "message", appName: "Pesan" }
      );
      assert.deepEqual(
        notifSvc.categorizeNotification({
          title: "Copied",
          body: "abc",
          icon: "clipboard",
        }),
        { category: "clipboard", appName: "Clipboard" }
      );
    });

    it("strips transient items on load, enforces 50-item truncation, and tracks read/mute/DND state", () => {
      langStore.setLanguage("en");
      // Initial seed strips transient clipboard & battery items, leaving 2 items
      const initial = notifSvc.loadNotificationHistory();
      assert.equal(initial.length, 2);
      assert.equal(initial.every((i) => i.icon !== "clipboard" && i.icon !== "battery"), true);

      // Corrupt or transient stored items get sanitized on load
      localStorage.setItem(
        "island_notification_history",
        JSON.stringify([
          { id: "keep-1", title: "Normal", body: "Hello", category: "message", appName: "Slack", timestamp: 1, read: false },
          { id: "drop-1", title: "Caps Lock On", body: "", category: "system", appName: "System", timestamp: 2, read: false },
          { id: "drop-2", title: "Vol", body: "", category: "system", appName: "System", timestamp: 3, read: false, icon: "volume" },
        ])
      );
      const sanitized = notifSvc.loadNotificationHistory();
      assert.equal(sanitized.length, 1);
      assert.equal(sanitized[0].id, "keep-1");

      // 50-item truncation limit on saveNotificationHistory & addNotificationHistoryItem
      const sixty = Array.from({ length: 60 }, (_, idx) => ({
        id: `n-${idx}`,
        title: `Title ${idx}`,
        body: "Body",
        category: "system",
        appName: "App",
        timestamp: idx + 1,
        read: false,
      }));
      notifSvc.saveNotificationHistory(sixty);
      assert.equal(notifSvc.loadNotificationHistory().length, 50);

      const added = notifSvc.addNotificationHistoryItem({
        title: "Newest",
        body: "Top item",
        appName: "Discord",
      });
      const afterAdd = notifSvc.loadNotificationHistory();
      assert.equal(afterAdd.length, 50);
      assert.equal(afterAdd[0].id, added.id);

      notifSvc.markNotificationAsRead(added.id);
      assert.equal(notifSvc.loadNotificationHistory()[0].read, true);

      notifSvc.markAllNotificationsAsRead();
      assert.equal(notifSvc.loadNotificationHistory().every((i) => i.read), true);

      notifSvc.deleteNotificationHistoryItem(added.id);
      assert.equal(notifSvc.loadNotificationHistory().length, 49);

      notifSvc.clearNotificationHistory();
      assert.deepEqual(notifSvc.loadNotificationHistory(), []);

      notifSvc.addNotificationHistoryItem({
        title: "Battery full",
        body: "Unplug",
        icon: "battery",
      });
      assert.deepEqual(notifSvc.loadNotificationHistory(), []);

      // Muted apps and DND
      assert.equal(notifSvc.isAppMuted("Discord"), false);
      notifSvc.toggleMuteApp("Discord");
      assert.equal(notifSvc.isAppMuted("Discord"), true);
      notifSvc.toggleMuteApp("Discord");
      assert.equal(notifSvc.isAppMuted("Discord"), false);

      assert.equal(notifSvc.getDndStatus(), false);
      notifSvc.setDndStatus(true);
      assert.equal(notifSvc.getDndStatus(), true);
    });
  });
}

function registerAiRouterAndConversationSuite(getLoader) {
  describe("AI Router & Conversation Services", () => {
    let router;
    let convSvc;
    let registry;
    let langStore;

    before(async () => {
      const loader = getLoader();
      router = await loader.loadModule("/src/services/aiRouterService.ts");
      convSvc = await loader.loadModule("/src/services/aiConversationService.ts");
      registry = await loader.loadModule("/src/services/aiModelRegistry.ts");
      langStore = await loader.loadModule("/src/services/languageStore.ts");
    });

    beforeEach(() => {
      for (const provider of ["claude", "openai", "gemini", "openrouter", "deepseek", "grok", "custom"]) {
        registry.clearModelUnavailable(provider);
      }
    });

    afterEach(() => {
      for (const provider of ["claude", "openai", "gemini", "openrouter", "deepseek", "grok", "custom"]) {
        registry.clearModelUnavailable(provider);
      }
    });

    it("loads and deep-merges router config with fallback on invalid JSON", () => {
      assert.deepEqual(router.loadRouterConfig(), router.DEFAULT_ROUTER_CONFIG);

      localStorage.setItem(
        "island_ai_router_config_v1",
        JSON.stringify({
          selectedMode: "gpt-4o",
          budget: { monthlyLimitIdr: 50000 },
        })
      );
      const merged = router.loadRouterConfig();
      assert.equal(merged.selectedMode, "gpt-4o");
      assert.equal(merged.budget.monthlyLimitIdr, 50000);
      assert.equal(merged.budget.warnAtPercent, 80);
      assert.equal(merged.tierMapping.T2.modelId, router.DEFAULT_ROUTER_CONFIG.tierMapping.T2.modelId);

      localStorage.setItem("island_ai_router_config_v1", "{bad-json");
      assert.deepEqual(router.loadRouterConfig(), router.DEFAULT_ROUTER_CONFIG);
    });

    it("routes prompts accurately with shortcuts, context inheritance, T0/T1/T2 signals, and upward bias", () => {
      const shortcutKuat = router.evaluatePromptHeuristics("/kuat /ringkas hai");
      assert.equal(shortcutKuat.tier, "T2");
      assert.equal(shortcutKuat.lengthMode, "compact");
      assert.equal(shortcutKuat.cleanedPrompt, "hai");
      assert.equal(shortcutKuat.confidence, 1);

      const manualOverride = router.evaluatePromptHeuristics("/kuat /ringkas halo", undefined, true);
      assert.notEqual(manualOverride.tier, "T2");
      assert.equal(manualOverride.lengthMode, "compact");

      const inherited = router.evaluatePromptHeuristics("lanjutkan", "T2");
      assert.equal(inherited.tier, "T2");
      assert.equal(inherited.lengthMode, "detailed");
      assert.equal(inherited.confidence, 0.95);

      const t2Code = router.evaluatePromptHeuristics("Fix race condition in tokio mutex:\n```rs\nlock()\n```");
      assert.equal(t2Code.tier, "T2");
      assert.equal(t2Code.lengthMode, "detailed");
      assert.ok(t2Code.matchedSignals.includes("systems_concurrency"));

      const t0Greeting = router.evaluatePromptHeuristics("Halo!");
      assert.equal(t0Greeting.tier, "T0");
      assert.equal(t0Greeting.lengthMode, "compact");

      const t0Arithmetic = router.evaluatePromptHeuristics("berapa 20% dari 500?");
      assert.equal(t0Arithmetic.tier, "T0");

      const t1Coding = router.evaluatePromptHeuristics("Buatkan draf fungsi typescript untuk format tanggal");
      assert.equal(t1Coding.tier, "T1");

      const longAmbiguous = router.evaluatePromptHeuristics("x ".repeat(110));
      assert.equal(longAmbiguous.tier, "T2");
      assert.ok(longAmbiguous.matchedSignals.includes("bias_upward_to_t2"));

      const shortAmbiguous = router.evaluatePromptHeuristics("Ceritakan tentang pulau Lombok di musim hujan.");
      assert.equal(shortAmbiguous.tier, "T1");
      assert.ok(shortAmbiguous.matchedSignals.includes("bias_upward_to_t1"));
    });

    it("resolves tier models respecting vision, availability, non-chat exclusion, budget, and cost math", () => {
      const models = createSampleModels();
      assert.equal(router.resolveTierModel("T0", [], router.DEFAULT_ROUTER_CONFIG), null);
      assert.equal(router.isVisionCapableModel(models[0]), false); // deepseek
      assert.equal(router.isVisionCapableModel(models[4]), false); // o3-mini
      assert.equal(router.isVisionCapableModel(models[3]), true); // gpt-4o

      // Vision required skips deepseek-chat even though T0 maps to deepseek-chat
      const visionT0 = router.resolveTierModel("T0", models, router.DEFAULT_ROUTER_CONFIG, true);
      assert.equal(visionT0?.targetModel.id, "gemini-2.5-flash");

      // Unavailable T2 model falls back to healthy medium/fast
      registry.markModelUnavailable("claude", "claude-3-7-sonnet-20250219");
      const fallbackT2 = router.resolveTierModel("T2", models, router.DEFAULT_ROUTER_CONFIG, false);
      assert.equal(fallbackT2?.targetModel.id, "gpt-4o");

      // Specialized TTS excluded
      const ttsOnlyWithGemini = models.filter((m) => m.provider === "gemini");
      const chatResolved = router.resolveTierModel("T0", ttsOnlyWithGemini, router.DEFAULT_ROUTER_CONFIG);
      assert.equal(chatResolved?.targetModel.id, "gemini-2.5-flash");

      // Length instructions, max tokens, budget policy, cost IDR
      langStore.setLanguage("en");
      assert.match(router.getLengthSystemInstruction("compact"), /VERY COMPACT/);
      langStore.setLanguage("id");
      assert.match(router.getLengthSystemInstruction("detailed"), /LENGKAP & TERSTRUKTUR/);

      assert.equal(router.getSafetyMaxTokens("compact"), 350);
      assert.equal(router.getSafetyMaxTokens("normal"), 1000);
      assert.equal(router.getSafetyMaxTokens("detailed"), 2500);

      const noLimit = router.evaluateBudgetPolicy(router.DEFAULT_ROUTER_CONFIG, { estimatedCostIdr: 5000 });
      assert.equal(noLimit.hasLimit, false);
      assert.equal(noLimit.isExceeded, false);

      const warnBudget = router.evaluateBudgetPolicy(
        {
          ...router.DEFAULT_ROUTER_CONFIG,
          budget: { monthlyLimitIdr: 10000, warnAtPercent: 80, actionOnLimit: "downgrade_to_t0" },
        },
        { estimatedCostIdr: 8500 }
      );
      assert.equal(warnBudget.isWarning, true);
      assert.equal(warnBudget.isExceeded, false);
      assert.equal(warnBudget.action, "downgrade_to_t0");

      const exceededBudget = router.evaluateBudgetPolicy(
        {
          ...router.DEFAULT_ROUTER_CONFIG,
          budget: { monthlyLimitIdr: 10000, warnAtPercent: 80, actionOnLimit: "block" },
        },
        { estimatedCostIdr: 12000, monthlyLimitIdr: 10000 }
      );
      assert.equal(exceededBudget.isExceeded, true);

      // (1000 / 1M * 2.5 + 500 / 1M * 10) * 16000 = (0.0025 + 0.005) * 16000 = 120 IDR
      assert.equal(router.calculateEstimatedCostIdr(models[3], 1000, 500), 120);
      assert.equal(router.calculateEstimatedCostIdr({ ...models[3], inputCostPer1M: 0, outputCostPer1M: 0 }, 1000, 500), 0);
    });

    it("manages AI conversations, cleanup pruning, quota truncation, backfill, and image stripping", () => {
      assert.equal(convSvc.getAutoCleanupDays(), 0);
      localStorage.setItem("island_ai_auto_cleanup_days_v1", "14");
      assert.equal(convSvc.getAutoCleanupDays(), 0);

      langStore.setLanguage("en");
      assert.equal(convSvc.generateTitleFromPrompt("   \n\t  "), "New Conversation");
      langStore.setLanguage("id");
      assert.equal(convSvc.generateTitleFromPrompt("   \n\t  "), "Percakapan Baru");
      assert.equal(convSvc.generateTitleFromPrompt("Short prompt"), "Short prompt");
      assert.equal(
        convSvc.generateTitleFromPrompt("1234567890123456789012345678901234567890"),
        "123456789012345678901234567890123456..."
      );

      // Empty conversation reuse
      const empty1 = convSvc.createConversation("openai", "gpt-4o");
      const empty2 = convSvc.createConversation("claude", "claude-3-7-sonnet-20250219");
      assert.equal(empty2.id, empty1.id);
      assert.equal(empty2.providerId, "claude");

      // Title generation from first user message & token accumulation
      convSvc.updateConversationMessages(
        empty2.id,
        [
          { id: "m1", role: "user", content: "Explain event sourcing architecture clearly", timestamp: Date.now() },
          { id: "m2", role: "assistant", content: "Event sourcing stores state changes.", timestamp: Date.now() },
        ],
        42.6
      );
      const updated = convSvc.getConversationById(empty2.id);
      assert.equal(updated?.totalTokens, 43);
      assert.equal(updated?.title, "Explain event sourcing architecture...");

      // Creating a second conversation now makes a new one because first is non-empty
      const second = convSvc.createConversation("openai", "gpt-4o", "Second");
      assert.notEqual(second.id, empty2.id);
      assert.equal(convSvc.getActiveConversationId(), second.id);

      // Image data URL stripping without mutating caller object
      const originalWithImage = {
        ...second,
        messages: [
          {
            id: "img-1",
            role: "user",
            content: "What is this?",
            timestamp: Date.now(),
            context: { type: "image", imageDataUrl: "data:image/png;base64,XYZ" },
          },
        ],
      };
      const sanitizedList = convSvc.sanitizeConversationsForStorage([originalWithImage]);
      assert.equal(sanitizedList[0].messages[0].context?.imageDataUrl, undefined);
      assert.equal(sanitizedList[0].messages[0].context?.previewText, "[Gambar terlampir]");
      assert.equal(originalWithImage.messages[0].context?.imageDataUrl, "data:image/png;base64,XYZ");

      // Assistant identity backfill & inactive pruning
      const staleTime = Date.now() - 10 * 24 * 60 * 60 * 1000;
      localStorage.setItem(
        "island_ai_conversations_v1",
        JSON.stringify([
          {
            id: "old-conv",
            title: "Old",
            modelId: "gpt-4o",
            providerId: "openai",
            messages: [{ id: "a1", role: "assistant", content: "we need answer in Indonesian", timestamp: staleTime }],
            createdAt: staleTime,
            updatedAt: staleTime,
            totalTokens: 10,
          },
          {
            id: "fresh-conv",
            title: "Fresh",
            modelId: "gpt-4o",
            providerId: "openai",
            messages: [{ id: "a2", role: "assistant", content: "Normal reply", timestamp: Date.now() }],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            totalTokens: 10,
          },
        ])
      );
      convSvc.setActiveConversationId("old-conv");
      const beforePrune = convSvc.getConversations();
      assert.equal(beforePrune.find((c) => c.id === "old-conv")?.messages[0].provider, "deepseek");
      assert.equal(beforePrune.find((c) => c.id === "fresh-conv")?.messages[0].provider, "openai");

      // Setting auto cleanup to 7 days immediately prunes old-conv and moves activeConversationId
      convSvc.setAutoCleanupDays(7);
      assert.equal(convSvc.getConversations().length, 1);
      assert.equal(convSvc.getActiveConversationId(), "fresh-conv");

      // QuotaExceededError truncation fallback in saveRawConversations
      const origSetItem = localStorage.setItem.bind(localStorage);
      let failFirstWrite = true;
      localStorage.setItem = (key, value) => {
        if (key === "island_ai_conversations_v1" && failFirstWrite) {
          const parsed = JSON.parse(value);
          if (parsed.length > 1) {
            failFirstWrite = false;
            throw new Error("QuotaExceededError");
          }
        }
        return origSetItem(key, value);
      };
      try {
        convSvc.saveConversation({
          id: "quota-newest",
          title: "Newest",
          modelId: "gpt-4o",
          providerId: "openai",
          messages: [{ id: "q1", role: "user", content: "Hi", timestamp: Date.now() }],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          totalTokens: 0,
        });
      } finally {
        localStorage.setItem = origSetItem;
      }
      assert.equal(convSvc.getConversations().length, 1);
      assert.equal(convSvc.getConversations()[0].id, "quota-newest");

      convSvc.setActiveConversationId("quota-newest");
      convSvc.deleteConversation("quota-newest");
      assert.equal(convSvc.getActiveConversationId(), null);

      const recreated = convSvc.getOrCreateActiveConversation("gemini", "gemini-2.5-flash");
      assert.equal(recreated.providerId, "gemini");
      convSvc.clearAllConversations();
      assert.equal(convSvc.getConversations().length, 0);
      assert.equal(convSvc.getActiveConversationId(), null);
    });
  });
}

export function registerNotchAndUtilsSuites(getLoader) {
  registerNotchGeometrySuite(getLoader);
  registerCalculatorSuite(getLoader);
  registerDateNlpSuite(getLoader);
  registerLyricsSuite(getLoader);
  registerProductivitySuite(getLoader);
  registerNotificationHistorySuite(getLoader);
  registerAiRouterAndConversationSuite(getLoader);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  let loader;

  before(async () => {
    installBrowserShim();
    loader = await createViteSsrLoader();
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  after(async () => {
    await loader?.close();
  });

  registerNotchAndUtilsSuites(() => loader);
}
