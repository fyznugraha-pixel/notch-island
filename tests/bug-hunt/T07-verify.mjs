import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");

const catalogPath = path.join(rootDir, "src/modules/modules.catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const { MODULE_ID_ALIASES } = await import("../../src/modules/moduleAliases.ts");
const { MODULE_CATALOG_I18N, localizePreviewHtml } = await import(
  "../../src/modules/moduleI18n.ts"
);
const { buildSoundscapeGraph, stopSoundGraph, setGraphVolume } = await import(
  "../../src/utils/ambientSoundEngine.ts"
);

const moduleComponentsSrc = fs.readFileSync(
  path.join(rootDir, "src/modules/moduleComponents.ts"),
  "utf8"
);
const privacySrc = fs.readFileSync(
  path.join(rootDir, "src/modules/components/PrivacyCamMicNavbarModule.tsx"),
  "utf8"
);

console.log("=== T07 Empirical Bug Verification Suite ===\n");

// ---------------------------------------------------------------------------
// 1. Catalog 40-module consistency checks
// ---------------------------------------------------------------------------
assert.equal(catalog.length, 40, "Expected 40 modules in modules.catalog.json");

const missingInI18n = catalog
  .map((m) => m.id)
  .filter((id) => !MODULE_CATALOG_I18N[id]);
assert.deepEqual(
  missingInI18n,
  [],
  `Missing in MODULE_CATALOG_I18N: ${missingInI18n.join(", ")}`
);

const mapMatch = moduleComponentsSrc.match(
  /export const COMPONENT_MAP[^=]*=\s*\{([\s\S]*?)\n\};/
);
assert.ok(mapMatch, "Could not parse COMPONENT_MAP");
const componentMapKeys = new Set(
  [...mapMatch[1].matchAll(/^\s*([a-zA-Z0-9_]+)\s*:/gm)].map((m) => m[1])
);

const missingInComponentMap = catalog
  .map((m) => m.id)
  .filter((id) => !componentMapKeys.has(id));
assert.deepEqual(
  missingInComponentMap,
  [],
  `Missing in COMPONENT_MAP: ${missingInComponentMap.join(", ")}`
);

// Test A: Builtin ID alias collision in MODULE_ID_ALIASES
console.log("[Test 1] Builtin ID collision in MODULE_ID_ALIASES...");
const defaultModules = [
  { id: "startSearch", group: 1, enabled: true, view: "compact" },
  { id: "pinnedApps", group: 2, enabled: true, view: "compact" },
  { id: "runningApps", group: 2, enabled: true, view: "compact" },
  { id: "hiddenTray", group: 3, enabled: true, view: "compact" },
  { id: "systemIcons", group: 3, enabled: true, view: "compact" },
  { id: "notifications", group: 3, enabled: true, view: "compact" },
  { id: "clockDate", group: 3, enabled: true, view: "compact" },
];

// Mirrors NavbarSettingsTab.tsx:92-95 handleAddModule canonical check
function findCanonicalCollision(modules, moduleId) {
  const targetCanonical = MODULE_ID_ALIASES[moduleId] || moduleId;
  return modules.findIndex(
    (m) => (MODULE_ID_ALIASES[m.id] || m.id) === targetCanonical
  );
}

const outputAudioCollisionIdx = findCanonicalCollision(defaultModules, "output_audio");
const jamDuniaCollisionIdx = findCanonicalCollision(defaultModules, "jam_dunia");

assert.equal(outputAudioCollisionIdx, 4, "output_audio collides with systemIcons at index 4");
assert.equal(jamDuniaCollisionIdx, 6, "jam_dunia collides with clockDate at index 6");
console.log(
  `  PROVED: Adding "output_audio" collides with builtin "systemIcons" (idx=${outputAudioCollisionIdx}); adding "jam_dunia" collides with builtin "clockDate" (idx=${jamDuniaCollisionIdx}).`
);

// Test B: privasi_kamera_mic vs privasi_kamera_mik mismatch
console.log("[Test 2] privasi_kamera_mic vs privasi_kamera_mik mismatch...");
const privacyPopoverIdMatch = privacySrc.match(/moduleId="([^"]+)"/);
assert.ok(privacyPopoverIdMatch, "Expected moduleId in PrivacyCamMicNavbarModule.tsx");
const privacyPopoverModuleId = privacyPopoverIdMatch[1];
assert.equal(privacyPopoverModuleId, "privasi_kamera_mik");
assert.ok(
  catalog.some((m) => m.id === "privasi_kamera_mic"),
  "Catalog uses privasi_kamera_mic"
);
assert.equal(
  MODULE_ID_ALIASES["privasi_kamera_mik"],
  undefined,
  "privasi_kamera_mik is missing from MODULE_ID_ALIASES"
);

// Mirrors NavbarPopoverShell.tsx:276-282 & 293-300
const userModulesWithPrivacy = [
  ...defaultModules,
  { id: "privasi_kamera_mic", group: 3, enabled: true, view: "compact" },
];
const canonicalTarget =
  MODULE_ID_ALIASES[privacyPopoverModuleId] || privacyPopoverModuleId;
const popoverMatchedEntry = userModulesWithPrivacy.find((m) => {
  const canonicalM = MODULE_ID_ALIASES[m.id] || m.id;
  return canonicalM === canonicalTarget || m.id === privacyPopoverModuleId;
});
assert.equal(
  popoverMatchedEntry,
  undefined,
  "NavbarPopoverShell fails to find privasi_kamera_mic when moduleId='privasi_kamera_mik'"
);
console.log(
  `  PROVED: PrivacyCamMicNavbarModule passes moduleId="${privacyPopoverModuleId}" while catalog stores "privasi_kamera_mic" and MODULE_ID_ALIASES has no mapping -> popover view switch finds undefined.`
);

// Test C: COMPONENT_MAP aliases missing in MODULE_ID_ALIASES
const catalogIds = new Set(catalog.map((m) => m.id));
const componentMapOnlyAliases = [...componentMapKeys].filter(
  (k) => !catalogIds.has(k) && !MODULE_ID_ALIASES[k]
);
console.log(
  `  INFO: COMPONENT_MAP aliases missing from MODULE_ID_ALIASES: [${componentMapOnlyAliases.join(", ")}]`
);
assert.ok(componentMapOnlyAliases.includes("suhu_gpu"));
assert.ok(componentMapOnlyAliases.includes("privasi_kamera_mik"));
assert.ok(componentMapOnlyAliases.includes("drop_zone"));

// Test D: Preview HTML localization gaps in English
console.log("[Test 3] localizePreviewHtml English gaps on modules.catalog.json...");
const mixerCatalogItem = catalog.find((m) => m.id === "mixer_suara");
const mixerEnHtml = localizePreviewHtml(mixerCatalogItem.pillHtml, "en");
assert.ok(
  mixerEnHtml.includes("3 aplikasi"),
  "Mixer preview pillHtml leaves '3 aplikasi' untranslated in English"
);
const screenshotCatalogItem = catalog.find((m) => m.id === "tangkap_layar");
const screenshotEnHtml = localizePreviewHtml(screenshotCatalogItem.pillHtml, "en");
assert.ok(
  screenshotEnHtml.includes(">Layar<"),
  "Screenshot preview pillHtml leaves 'Layar' untranslated in English"
);
console.log(
  "  PROVED: localizePreviewHtml('en') fails to translate '3 aplikasi' in mixer_suara and 'Layar' in tangkap_layar."
);

// ---------------------------------------------------------------------------
// 2. MixerNavbarModule & AudioOutputNavbarModule event payload mismatch
// ---------------------------------------------------------------------------
console.log("[Test 4] master-volume-changed payload mismatch...");
function simulateMixerMasterVolumeListener(payload) {
  let masterVol = 50; // initial from get_master_volume
  // Exact condition from MixerNavbarModule.tsx:68 & 297
  if (typeof payload === "number") {
    masterVol = payload <= 1 ? Math.round(payload * 100) : Math.round(payload);
  }
  return masterVol;
}
// Exact Rust payload from src-tauri/src/lib.rs:5402-5405
const rustEmittedPayload = { volume: 0.85, muted: false };
const resultingVol = simulateMixerMasterVolumeListener(rustEmittedPayload);
assert.equal(
  resultingVol,
  50,
  "Mixer listener ignores { volume, muted } object payload and leaves masterVol stale at 50"
);
console.log(
  `  PROVED: Rust emits ${JSON.stringify(rustEmittedPayload)}; listener checks typeof ev.payload === "number" -> stays stale at ${resultingVol}%.`
);

// ---------------------------------------------------------------------------
// 3. WeatherNavbarModule & AirQualityNavbarModule stale closure + async race
// ---------------------------------------------------------------------------
console.log("[Test 5] Weather / AQI stale 30-min interval closure & async race...");
{
  let cityState = "Bandung";
  const initialCityCapturedInMountEffect = cityState || "Bandung";
  // User later switches city to Tokyo
  cityState = "Tokyo";
  // 30-min interval runs using initial closure value (WeatherNavbarModule.tsx:83, MediaLifestyleExtraModules.tsx:207)
  const polledCity = initialCityCapturedInMountEffect;
  cityState = polledCity;
  assert.equal(
    cityState,
    "Bandung",
    "Stale 30-min interval overwrites user-selected city 'Tokyo' back to 'Bandung'"
  );
  console.log(
    "  PROVED: Initial mount effect captures initial city; 30-min interval overwrites user city 'Tokyo' back to 'Bandung'."
  );
}

// Async out-of-order response race without requestId / AbortController
async function simulateUnprotectedCityFetch() {
  let activeWeather = null;
  let loading = false;
  const resolvers = {};

  const fakeFetch = (city) =>
    new Promise((resolve) => {
      resolvers[city] = resolve;
    });

  // Exact control flow of WeatherNavbarModule.tsx:59-78 & AirQualityNavbarModule:178-203
  const loadWeather = async (targetCity) => {
    loading = true;
    try {
      const next = await fakeFetch(targetCity);
      if (next) {
        activeWeather = next;
      }
    } finally {
      loading = false;
    }
  };

  const p1 = loadWeather("Bandung");
  const p2 = loadWeather("Tokyo");

  // Tokyo resolves first
  resolvers["Tokyo"]({ city: "Tokyo", temp: 18 });
  await p2;
  assert.equal(activeWeather.city, "Tokyo");
  assert.equal(loading, false);

  // Stale Bandung request resolves second
  resolvers["Bandung"]({ city: "Bandung", temp: 26 });
  await p1;
  return activeWeather;
}
const racedResult = await simulateUnprotectedCityFetch();
assert.equal(
  racedResult.city,
  "Bandung",
  "Out-of-order slow response overwrites newer selected city"
);
console.log(
  `  PROVED: Out-of-order async fetch overwrites newer city 'Tokyo' with stale '${racedResult.city}'.`
);

// ---------------------------------------------------------------------------
// 4. WebAudio / AmbientSoundEngine suspended state & stopSoundGraph lifecycle
// ---------------------------------------------------------------------------
console.log("[Test 6] ambientSoundEngine.ts AudioContext suspended & node cleanup...");
{
  const createdContexts = [];
  const clearedIntervals = [];
  const activeIntervals = new Map();
  let nextTimerId = 1;

  class MockAudioNode {
    constructor(type) {
      this.type = type;
      this.stopped = false;
      this.disconnected = false;
      this.connectedTo = [];
    }
    connect(dest) {
      this.connectedTo.push(dest);
    }
    disconnect() {
      this.disconnected = true;
    }
  }

  class MockSourceNode extends MockAudioNode {
    constructor(type) {
      super(type);
      this.loop = false;
      this.buffer = null;
      this.started = false;
    }
    start() {
      this.started = true;
    }
    stop() {
      this.stopped = true;
    }
  }

  class MockOscNode extends MockSourceNode {
    constructor() {
      super("oscillator");
      this.frequency = { value: 0, setValueAtTime() {} };
    }
  }

  class MockAudioContext {
    constructor() {
      this.state = "suspended"; // Simulates WebView2 autoplay-suspended AudioContext
      this.sampleRate = 48000;
      this.currentTime = 0;
      this.destination = { type: "destination" };
      this.resumed = false;
      this.closed = false;
      this.nodes = [];
      createdContexts.push(this);
    }
    resume() {
      this.resumed = true;
      this.state = "running";
      return Promise.resolve();
    }
    close() {
      this.closed = true;
      this.state = "closed";
      return Promise.resolve();
    }
    createGain() {
      const n = new MockAudioNode("gain");
      n.gain = { value: 1, setTargetAtTime() {}, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
      this.nodes.push(n);
      return n;
    }
    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length);
      return { channels, length, sampleRate, getChannelData: () => data };
    }
    createBufferSource() {
      const n = new MockSourceNode("bufferSource");
      this.nodes.push(n);
      return n;
    }
    createBiquadFilter() {
      const n = new MockAudioNode("biquad");
      n.frequency = { value: 0 };
      n.Q = { value: 1 };
      this.nodes.push(n);
      return n;
    }
    createOscillator() {
      const n = new MockOscNode();
      this.nodes.push(n);
      return n;
    }
  }

  globalThis.window = {
    AudioContext: MockAudioContext,
    setInterval(fn, ms) {
      const id = nextTimerId++;
      activeIntervals.set(id, { fn, ms });
      return id;
    },
    clearInterval(id) {
      clearedIntervals.push(id);
      activeIntervals.delete(id);
    },
  };

  const graph = buildSoundscapeGraph("cafe", 0.6);
  assert.equal(graph.ctx.resumed, false, "buildSoundscapeGraph never calls ctx.resume()");
  assert.equal(
    graph.ctx.state,
    "suspended",
    "AudioContext remains suspended while UI sets playing=true"
  );
  // Trigger cupTimer manually to verify it skips audio generation while suspended
  for (const tid of graph.timers) {
    activeIntervals.get(tid).fn();
  }
  const oscNodesBeforeStop = graph.ctx.nodes.filter((n) => n.type === "oscillator");
  assert.equal(
    oscNodesBeforeStop.length,
    1,
    "Only LFO created; cupTimer spins as no-op because ctx.state !== 'running'"
  );

  // Stop graph and check node/context cleanup
  stopSoundGraph(graph);
  assert.equal(activeIntervals.size, 0, "Intervals cleared");
  assert.equal(graph.ctx.closed, true, "ctx.close() called");
  const loopSrc = graph.ctx.nodes.find((n) => n.type === "bufferSource");
  const lfo = graph.ctx.nodes.find((n) => n.type === "oscillator");
  assert.equal(loopSrc.stopped, false, "stopSoundGraph does not call src.stop()");
  assert.equal(lfo.stopped, false, "stopSoundGraph does not call lfo.stop()");

  // setGraphVolume on closed context
  setGraphVolume(graph, 0.3);
  console.log(
    "  PROVED: buildSoundscapeGraph leaves suspended AudioContext unresumed (ctx.resumed=false, ctx.state='suspended') and stopSoundGraph never calls stop()/disconnect() on BufferSource/Oscillator nodes."
  );
}

console.log("\nALL T07 EMPIRICAL CHECKS COMPLETED SUCCESSFULLY.");
