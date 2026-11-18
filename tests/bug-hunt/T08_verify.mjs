import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const ts = require(path.join(ROOT, "node_modules/typescript/lib/typescript.js"));

// Setup minimal browser globals (localStorage, window, CustomEvent) in memory
function createStorageMock() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(k) {
      return store.has(String(k)) ? store.get(String(k)) : null;
    },
    setItem(k, v) {
      store.set(String(k), String(v));
    },
    removeItem(k) {
      store.delete(String(k));
    },
    clear() {
      store.clear();
    },
  };
}

const dispatchedEvents = [];
const adzanPlayEvents = [];
globalThis.localStorage = createStorageMock();
globalThis.CustomEvent = class CustomEvent extends Event {
  constructor(type, init = {}) {
    super(type);
    this.detail = init.detail;
  }
};
const windowTarget = new EventTarget();
globalThis.window = {
  addEventListener: windowTarget.addEventListener.bind(windowTarget),
  removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
  dispatchEvent(ev) {
    dispatchedEvents.push({ type: ev.type, detail: ev.detail });
    return windowTarget.dispatchEvent(ev);
  },
  AudioContext: class MockAudioContext {
    constructor() {
      this.state = "running";
      this.currentTime = 0;
      this.destination = {};
    }
    async decodeAudioData() {
      return { duration: 10 };
    }
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        disconnect() {},
        start(when) {
          adzanPlayEvents.push({ event: "source.start", when });
        },
        stop() {
          adzanPlayEvents.push({ event: "source.stop" });
        },
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {} },
        connect() {},
      };
    }
  },
  __TAURI_INTERNALS__: {},
};
globalThis.fetch = async (url) => {
  if (String(url).includes("azan2.mp3")) {
    await new Promise((r) => setTimeout(r, 30));
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  }
  return { ok: false };
};

// Register ESM hook using TypeScript compiler for accurate TS transpilation + Tauri stub
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@tauri-apps/")) {
      return {
        shortCircuit: true,
        url: "tauri-mock://stub",
      };
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) {
      const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : ROOT;
      const resolvedTs = path.resolve(path.dirname(parentPath), `${specifier}.ts`);
      if (fs.existsSync(resolvedTs)) {
        return {
          shortCircuit: true,
          url: pathToFileURL(resolvedTs).href,
        };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "tauri-mock://stub") {
      return {
        shortCircuit: true,
        format: "module",
        source: `
          export const tauriEvents = [];
          export async function invoke(cmd, payload) {
            tauriEvents.push({ kind: "invoke", cmd, payload });
            return null;
          }
          export async function emit(ev, payload) {
            tauriEvents.push({ kind: "emit", ev, payload });
          }
          export async function listen() {
            return () => {};
          }
        `,
      };
    }
    if (url.startsWith("file://") && url.endsWith(".ts")) {
      const filePath = fileURLToPath(url);
      const raw = fs.readFileSync(filePath, "utf8");
      const out = ts.transpileModule(raw, {
        fileName: filePath,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          isolatedModules: true,
        },
      });
      return {
        shortCircuit: true,
        format: "module",
        source: out.outputText,
      };
    }
    return nextLoad(url, context);
  },
});

const dateNlp = await import(pathToFileURL(path.join(ROOT, "src/utils/dateNlpParser.ts")).href);
const calcUtils = await import(pathToFileURL(path.join(ROOT, "src/utils/calculatorUtils.ts")).href);
const pomoService = await import(pathToFileURL(path.join(ROOT, "src/services/pomodoroService.ts")).href);
const waterService = await import(pathToFileURL(path.join(ROOT, "src/services/waterService.ts")).href);
const todoUtils = await import(pathToFileURL(path.join(ROOT, "src/services/todoUtils.ts")).href);
const noteUtils = await import(pathToFileURL(path.join(ROOT, "src/services/noteUtils.ts")).href);
const prayerService = await import(pathToFileURL(path.join(ROOT, "src/services/prayerService.ts")).href);

console.log("=== 1. dateNlpParser.ts ===");
const ref = new Date(2026, 10, 18, 10, 0, 0, 0); // Wed 2026-11-18 10:00
for (const sample of [
  "Beli susu besok 2 liter",
  "Review PR hari ini 100%",
  "Meeting senin 2026",
  "Laporan hari ini 30 menit",
  "Kerjakan hari ini jam 99",
  "Kumpul tugas besok jam 24:30",
]) {
  const res = dateNlp.parseDateNlp(sample, ref, "id");
  const dt = res.dueAt ? new Date(res.dueAt) : null;
  console.log(
    JSON.stringify({
      input: sample,
      hasDate: res.hasDate,
      hasTime: res.hasTime,
      rawMatched: res.rawMatched,
      cleanText: res.cleanText,
      parsedLocal: dt
        ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`
        : null,
    })
  );
}

console.log("\n=== 2. calculatorUtils.ts ===");
const formatted = calcUtils.formatDisplayNumber(1500000.25);
const escU2014 = (s) => String(s).replace(/\u2014/g, "\\u2014");
console.log("formatDisplayNumber(1500000.25):", formatted);
console.log("evaluateCalcExpression('1.500.000 + 250.000'):", escU2014(calcUtils.evaluateCalcExpression("1.500.000 + 250.000")));
console.log("evaluateCalcExpression('1.500,25 * 2'):", escU2014(calcUtils.evaluateCalcExpression("1.500,25 * 2")));
console.log("evaluateCalcExpression('10% dari 1.000.000'):", escU2014(calcUtils.evaluateCalcExpression("10% dari 1.000.000")));
console.log("evaluateCalcExpression('1e5 + 1'):", escU2014(calcUtils.evaluateCalcExpression("1e5 + 1")));
console.log("evaluateCalcExpression('(10+5'):", escU2014(calcUtils.evaluateCalcExpression("(10+5")));

console.log("\n=== 3. pomodoroService.ts (corrupt localStorage) ===");
localStorage.clear();
localStorage.setItem("gili_pomodoro_settings", JSON.stringify({ focusMinutes: "abc", sessionsPerCycle: 0 }));
const badPomoSettings = pomoService.loadPomodoroSettings();
const durSec = pomoService.getModeDurationSeconds("focus", badPomoSettings);
console.log("badSettings:", badPomoSettings, "durSec:", durSec, "formatted:", pomoService.formatPomodoroTime(durSec));

const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
localStorage.setItem("gili_pomodoro_daily_stats", JSON.stringify({ dateKey: todayKey }));
console.log("recordCompletedFocusSession(25) on partial stats:", pomoService.recordCompletedFocusSession(25));

console.log("\n=== 4. waterService.ts (getTwoHourDistribution overlap, manual midnight log, corrupt/negative records) ===");
localStorage.clear();
const dayBase = new Date(2026, 10, 18, 12, 0, 0, 0);
const waterDataSample = {
  records: [
    { id: "d1", timestamp: new Date(2026, 10, 18, 12, 30, 0, 0).getTime(), amountMl: 300 },
    { id: "d2", timestamp: new Date(2026, 10, 18, 14, 0, 0, 0).getTime(), amountMl: 250 },
  ],
  settings: { ...waterService.DEFAULT_WATER_SETTINGS, dayStartHour: 15 },
  snoozedUntil: null,
  bestStreakDays: 0,
  lastDrinkTimestamp: null,
  lastUndoneRecord: null,
  celebratedMilestones: [],
  frozenDateKeys: [],
};
const dist = waterService.getTwoHourDistribution(dayBase, waterDataSample);
const sumSlots = dist.reduce((a, b) => a + b.amountMl, 0);
console.log("dayStartHour=15 actualMl=550 sumAcrossSlots=", sumSlots, "slots=", dist.map((s) => `${s.label}:${s.amountMl}`));

// Simulate WaterHistoryView handleCreateManual at 01:30 for selectedDayDate 2026-11-18 with dayStartHour=3
const selectedDayDate = new Date(2026, 10, 18, 12, 0, 0);
const manualBase = new Date(selectedDayDate);
manualBase.setHours(1, 30, 0, 0);
console.log("WaterHistoryView manual log 01:30 on 2026-11-18 -> logicalKey:", waterService.getLogicalDateKey(manualBase.getTime(), 3));

// Negative & NaN amountMl via updateDrink / loadWaterData
localStorage.clear();
const logged = waterService.logDrink(250);
waterService.updateDrink(logged.record.id, -500, logged.record.timestamp);
console.log("after updateDrink(-500) getDailyIntake:", waterService.getDailyIntake(new Date()).totalMl, "percent:", waterService.getDailyIntake(new Date()).percent);

localStorage.setItem("gili_water_data", JSON.stringify({
  records: [{ id: "bad_1", timestamp: Date.now(), amountMl: "oops" }],
  settings: { ...waterService.DEFAULT_WATER_SETTINGS, dailyTargetMl: 0 },
}));
const corruptDaily = waterService.getDailyIntake(new Date());
console.log("corrupt water record totalMl:", corruptDaily.totalMl);

console.log("\n=== 5. todoUtils.ts (monthly drift from day 31 & NaN input) ===");
const jan31 = new Date(2026, 0, 31, 9, 0, 0, 0).getTime();
const febNext = todoUtils.computeNextRepeatDue(jan31, "monthly", jan31);
const marNext = todoUtils.computeNextRepeatDue(febNext, "monthly", febNext);
console.log("Jan 31 ->", new Date(febNext).toDateString(), "->", new Date(marNext).toDateString());
console.log("computeNextRepeatDue(NaN, 'daily'):", todoUtils.computeNextRepeatDue(NaN, "daily"));

console.log("\n=== 6. noteUtils.ts (1-line duplication & corrupt array) ===");
localStorage.clear();
const createdNote = noteUtils.createQuickNoteItem("Beli kopi", "blue", false);
console.log("createQuickNoteItem('Beli kopi'):", { title: createdNote.title, content: createdNote.content });
localStorage.setItem("gili_mini_notes_v2", JSON.stringify([null, { id: "x" }]));
console.log("loadMiniNotes([null, {id:'x'}]):", noteUtils.loadMiniNotes());

console.log("\n=== 7. prayerService.ts (cross-window event & async adzan race) ===");
dispatchedEvents.length = 0;
const tauriStub = await import("@tauri-apps/api/core");
const beforeInvokeCount = tauriStub.tauriEvents.length;
prayerService.updatePrayerSettings({ preReminderMinutes: 10 });
const afterInvokeCount = tauriStub.tauriEvents.length;
console.log("prayer update window events:", dispatchedEvents.map((e) => e.type), "tauri broadcast calls:", afterInvokeCount - beforeInvokeCount);

adzanPlayEvents.length = 0;
prayerService.playAdzanAudio();
prayerService.stopAdzanAudio(); // called immediately while fetch/decode is still pending
await new Promise((r) => setTimeout(r, 60));
console.log("adzan events after play() then immediate stop():", adzanPlayEvents);

console.log("\n=== 8. ProgresHariNavbarModule DST dayOfYear check (TZ=America/New_York) ===");
const dstCheckOut = execFileSync(
  process.execPath,
  [
    "-e",
    `
    const startOfYear = new Date(2026, 0, 1);
    const mar9 = new Date(2026, 2, 9); // Day after US DST spring-forward (2026-03-08)
    const mar10 = new Date(2026, 2, 10);
    const doyMar9 = Math.floor((mar9.getTime() - startOfYear.getTime()) / 86400000) + 1;
    const doyMar10 = Math.floor((mar10.getTime() - startOfYear.getTime()) / 86400000) + 1;
    console.log(JSON.stringify({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, mar9_expected: 68, mar9_actual: doyMar9, mar10_expected: 69, mar10_actual: doyMar10 }));
    `,
  ],
  { env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8" }
);
console.log(dstCheckOut.trim());

console.log("\n=== 9. Static checks for Taskbar <-> Notch keys, Keypad, Launcher ===");
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
console.log("PomodoroNavbar key:", readSrc("src/modules/components/PomodoroNavbarModule.tsx").match(/POMO_KEY\s*=\s*"([^"]+)"/)?.[1]);
console.log("usePomodoro key:", readSrc("src/hooks/usePomodoro.ts").match(/localStorage\.setItem\("([^"]+)"/)?.[1]);
console.log("WaterNavbar key:", readSrc("src/modules/components/WaterNavbarModule.tsx").match(/WATER_KEY\s*=\s*"([^"]+)"/)?.[1]);
console.log("waterService key:", readSrc("src/services/waterService.ts").match(/WATER_STORAGE_KEY\s*=\s*"([^"]+)"/)?.[1]);
console.log("PrayerNavbar key:", readSrc("src/modules/components/PrayerNavbarModule.tsx").match(/PRAYER_CACHE_KEY\s*=\s*"([^"]+)"/)?.[1]);
console.log("prayerService key:", readSrc("src/services/prayerService.ts").match(/SCHEDULE_CACHE_KEY\s*=\s*"([^"]+)"/)?.[1]);
console.log("TodoNavbar key:", readSrc("src/modules/components/TodoNavbarModule.tsx").match(/TODOS_KEY\s*=\s*"([^"]+)"/)?.[1]);
console.log("QuickNoteNavbar key:", readSrc("src/modules/components/QuickNoteNavbarModule.tsx").match(/NOTES_KEY\s*=\s*"([^"]+)"/)?.[1]);
console.log("noteUtils key:", readSrc("src/services/noteUtils.ts").match(/STORAGE_KEY\s*=\s*"([^"]+)"/)?.[1]);

const calcSrc = readSrc("src/modules/components/CalculatorNavbarModule.tsx");
console.log("Calculator keypad has '(':", calcSrc.includes('val: "("'), "has ')':", calcSrc.includes('val: ")"'));

function normalizeTargetCopy(input) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (
    !trimmed.includes("://") &&
    !trimmed.startsWith("ms-") &&
    !/^[a-zA-Z]:\\/.test(trimmed) &&
    /^[^\s]+\.[a-z]{2,}(?:\/.*)?$/i.test(trimmed)
  ) {
    return `https://${trimmed}`;
  }
  return trimmed;
}
console.log("QuickLauncher normalizeTarget('notepad.exe'):", normalizeTargetCopy("notepad.exe"));
console.log("QuickLauncher normalizeTarget('laporan.pdf'):", normalizeTargetCopy("laporan.pdf"));
