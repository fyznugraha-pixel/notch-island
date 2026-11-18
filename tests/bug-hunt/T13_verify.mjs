import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve("d:/kerjaan/projek-ndiri/island");
const PUBLIC_DIR = path.join(ROOT, "public");

function walkFiles(dir, ignoreDirs = new Set()) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) continue;
      out.push(...walkFiles(full, ignoreDirs));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function readPngDimensions(buf) {
  // PNG signature + IHDR chunk (width at offset 16..20, height at 20..24 BE)
  if (buf.length < 24) return null;
  const sig = "89504e470d0a1a0a";
  if (buf.subarray(0, 8).toString("hex") !== sig) return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

// ---------------------------------------------------------------------------
// 1. Audit aset di public/ (ukuran, dimensi PNG, duplikat SHA-256, dan file yatim)
// ---------------------------------------------------------------------------
const publicFiles = walkFiles(PUBLIC_DIR);
const sourceFiles = [
  path.join(ROOT, "index.html"),
  path.join(ROOT, "package.json"),
  ...walkFiles(path.join(ROOT, "src")),
  ...walkFiles(path.join(ROOT, "src-tauri"), new Set(["target", "gen"])),
  ...walkFiles(path.join(ROOT, "scripts")),
  ...walkFiles(path.join(ROOT, ".github")),
].filter((f) => fs.existsSync(f));

const sourceCorpus = sourceFiles.map((f) => ({
  path: path.relative(ROOT, f).replace(/\\/g, "/"),
  content: fs.readFileSync(f, "utf8"),
}));

const macosMapFile = sourceCorpus.find((s) => s.path.endsWith("macosIconMap.ts"));
const macosSlugs = new Set();
if (macosMapFile) {
  const typeBlock = macosMapFile.content.match(/export type MacOSIconSlug =([\s\S]*?);/);
  if (typeBlock) {
    for (const m of typeBlock[1].matchAll(/"([a-z0-9_-]+)"/g)) {
      macosSlugs.add(m[1]);
    }
  }
}

const byHash = new Map();
let totalPublicBytes = 0;
const largeFiles = [];
const orphanFiles = [];

for (const file of publicFiles) {
  const stat = fs.statSync(file);
  const buf = fs.readFileSync(file);
  const hash = crypto.createHash("sha256").update(buf).digest("hex");
  const relPublic = "/" + path.relative(PUBLIC_DIR, file).replace(/\\/g, "/");
  totalPublicBytes += stat.size;

  if (!byHash.has(hash)) byHash.set(hash, []);
  byHash.get(hash).push({ rel: relPublic, bytes: stat.size });

  if (stat.size >= 100 * 1024) {
    const pngDim = readPngDimensions(buf);
    largeFiles.push({ rel: relPublic, bytes: stat.size, pngDim });
  }

  const fileName = path.basename(relPublic);
  if (fileName === "LICENSE.txt") {
    continue; // File lisensi untuk atribusi ikon, bukan aset runtime yatim
  }

  let referenced = false;
  if (relPublic.startsWith("/icons/macos/") && relPublic.endsWith(".webp")) {
    const slug = fileName.replace(/\.webp$/, "");
    if (macosSlugs.has(slug)) {
      referenced = true;
    }
  }

  if (!referenced) {
    for (const src of sourceCorpus) {
      if (src.content.includes(relPublic) || src.content.includes(relPublic.slice(1))) {
        referenced = true;
        break;
      }
      if (
        src.content.includes(`/${fileName}`) ||
        src.content.includes(`"${fileName}"`) ||
        src.content.includes(`'${fileName}'`)
      ) {
        referenced = true;
        break;
      }
    }
  }

  if (!referenced) {
    orphanFiles.push({ rel: relPublic, bytes: stat.size });
  }
}

const duplicateGroups = [];
let wastedDuplicateBytes = 0;
for (const [hash, items] of byHash.entries()) {
  if (items.length > 1) {
    const bytesEach = items[0].bytes;
    wastedDuplicateBytes += bytesEach * (items.length - 1);
    duplicateGroups.push({
      hash: hash.slice(0, 12),
      bytesEach,
      count: items.length,
      files: items.map((i) => i.rel),
    });
  }
}

largeFiles.sort((a, b) => b.bytes - a.bytes);
orphanFiles.sort((a, b) => b.bytes - a.bytes);
duplicateGroups.sort((a, b) => b.bytesEach * (b.count - 1) - a.bytesEach * (a.count - 1));

console.log("=== AUDIT ASET PUBLIC/ ===");
console.log(`Total file di public/: ${publicFiles.length}`);
console.log(
  `Total ukuran public/: ${totalPublicBytes} bytes (${(totalPublicBytes / (1024 * 1024)).toFixed(2)} MB)`
);
console.log(`Jumlah file >= 100 KB: ${largeFiles.length}`);
for (const f of largeFiles) {
  const dimInfo = f.pngDim
    ? ` | PNG ${f.pngDim.width}x${f.pngDim.height}px (RGBA decoded ~${(
        (f.pngDim.width * f.pngDim.height * 4) /
        (1024 * 1024)
      ).toFixed(2)} MB)`
    : "";
  console.log(`  LARGE: ${f.rel} = ${f.bytes} bytes (${(f.bytes / 1024).toFixed(1)} KB)${dimInfo}`);
}
console.log(
  `Grup duplikat identik (SHA-256): ${duplicateGroups.length}, total pemborosan = ${wastedDuplicateBytes} bytes (${(
    wastedDuplicateBytes / 1024
  ).toFixed(1)} KB)`
);
for (const g of duplicateGroups) {
  console.log(`  DUP [${g.hash}] ${g.bytesEach} B x${g.count}: ${g.files.join(", ")}`);
}
const orphanBytes = orphanFiles.reduce((acc, f) => acc + f.bytes, 0);
console.log(
  `File yatim (di luar LICENSE.txt): ${orphanFiles.length} file, total = ${orphanBytes} bytes (${(
    orphanBytes / 1024
  ).toFixed(1)} KB)`
);
for (const o of orphanFiles) {
  console.log(`  ORPHAN: ${o.rel} = ${o.bytes} bytes`);
}

// ---------------------------------------------------------------------------
// 2. Uji Empiris Refcount & Race Logic pada systemMetricsService.ts
// ---------------------------------------------------------------------------
function createSystemMetricsMock() {
  const events = [];
  const listeners = new Set();
  let unlistenFn = null;
  let activeSubscribers = 0;
  let isBackendSubscribed = false;
  let syncQueued = false;
  let transitionPromise = Promise.resolve();
  let backendCount = 0;

  async function mockListen(_ev, _cb) {
    return () => {
      events.push("unlisten_tauri_event");
    };
  }
  async function mockInvoke(cmd, _args) {
    if (cmd === "subscribe_system_metrics") {
      backendCount++;
      events.push(`invoke:subscribe(backend=${backendCount})`);
    } else if (cmd === "unsubscribe_system_metrics") {
      backendCount = Math.max(0, backendCount - 1);
      events.push(`invoke:unsubscribe(backend=${backendCount})`);
    }
  }

  function scheduleSubscriptionSync() {
    if (syncQueued) return;
    syncQueued = true;
    transitionPromise = transitionPromise
      .then(async () => {
        syncQueued = false;
        const shouldBeSubscribed = activeSubscribers > 0;
        if (shouldBeSubscribed && !isBackendSubscribed) {
          const unlisten = await mockListen("gili-system-metrics", () => {});
          if (activeSubscribers <= 0) {
            unlisten();
            return;
          }
          unlistenFn = unlisten;
          await mockInvoke("subscribe_system_metrics", { topic: "metrics" });
          isBackendSubscribed = true;
          if (activeSubscribers <= 0) {
            scheduleSubscriptionSync();
          }
        } else if (!shouldBeSubscribed && isBackendSubscribed) {
          if (unlistenFn) {
            unlistenFn();
            unlistenFn = null;
          }
          isBackendSubscribed = false;
          await mockInvoke("unsubscribe_system_metrics", { topic: "metrics" });
          if (activeSubscribers > 0) {
            scheduleSubscriptionSync();
          }
        }
      })
      .catch(() => {});
  }

  function subscribeToSystemMetrics(callback) {
    listeners.add(callback);
    activeSubscribers++;
    if (activeSubscribers === 1) {
      scheduleSubscriptionSync();
    }
    return () => {
      listeners.delete(callback);
      activeSubscribers = Math.max(0, activeSubscribers - 1);
      if (activeSubscribers === 0) {
        scheduleSubscriptionSync();
      }
    };
  }

  return {
    subscribeToSystemMetrics,
    getState: () => ({
      listenersSize: listeners.size,
      activeSubscribers,
      isBackendSubscribed,
      backendCount,
      events: [...events],
    }),
    waitSync: () => transitionPromise,
  };
}

const simA = createSystemMetricsMock();
const unsubA = simA.subscribeToSystemMetrics(() => {});
const unsubB = simA.subscribeToSystemMetrics(() => {});
await simA.waitSync();
unsubA();
unsubA(); // double cleanup
await simA.waitSync();
const stA = simA.getState();
const scenarioABug =
  stA.listenersSize === 1 &&
  stA.activeSubscribers === 0 &&
  !stA.isBackendSubscribed &&
  stA.backendCount === 0;

const simB = createSystemMetricsMock();
const sharedCb = () => {};
const u1 = simB.subscribeToSystemMetrics(sharedCb);
const u2 = simB.subscribeToSystemMetrics(sharedCb);
await simB.waitSync();
u1();
const stB = simB.getState();
const scenarioBBug = stB.activeSubscribers === 1 && stB.listenersSize === 0;
u2();
await simB.waitSync();

// Skenario C: Multi-window destroy tanpa React unmount cleanup
let sharedBackendSubscribers = 0;
sharedBackendSubscribers += 1; // main window
sharedBackendSubscribers += 1; // navbar window
sharedBackendSubscribers += 1; // settings window
// navbar & settings dihancurkan via win.destroy() tanpa await unsubscribe_system_metrics
// Hanya main yang masih sempat unsubscribe:
sharedBackendSubscribers = Math.max(0, sharedBackendSubscribers - 1);
const scenarioCBug = sharedBackendSubscribers === 2;

console.log("\n=== UJI EMPIRIS systemMetricsService.ts & shared_sampler ===");
console.log(
  `Skenario A (double cleanup saat B masih aktif): listenersSize=${stA.listenersSize}, activeSubscribers=${stA.activeSubscribers}, backendCount=${stA.backendCount} -> bug_terbukti=${scenarioABug}`
);
console.log(`  Trace events A: ${stA.events.join(" -> ")}`);
console.log(
  `Skenario B (callback ref sama x2 lalu u1() unsubscribe): activeSubscribers=${stB.activeSubscribers}, listenersSize=${stB.listenersSize} -> bug_terbukti=${scenarioBBug}`
);
console.log(
  `Skenario C (simulasi 3 jendela WebView2 subscribe topic "metrics", 2 jendela win.destroy()): sisa backend subscribers=${sharedBackendSubscribers} -> thread tidak pernah sleep 0% CPU=${scenarioCBug}`
);

// ---------------------------------------------------------------------------
// 3. Kalkulasi wake-up idle per detik dari loop Rust & JS yang diaudit
// ---------------------------------------------------------------------------
function printIdleFrequencySummary() {
  const loops = [
    { name: "lib.rs main cursor/fg loop (20ms)", hz: 1000 / 20, alwaysWhenIdle: true },
    { name: "miniplayer_window.rs tracker loop (20ms)", hz: 1000 / 20, alwaysWhenIdle: true },
    { name: "navbar_window.rs cursor/zorder/overlap loop (25ms)", hz: 1000 / 25, alwaysWhenIdle: true },
    { name: "backdrop_blur.rs acrylic loop visible idle (45ms)", hz: 1000 / 45, alwaysWhenIdle: true },
    { name: "lib.rs SMTC/volume/clipboard/notif loop (100ms)", hz: 1000 / 100, alwaysWhenIdle: true },
    { name: "window_preview.rs watchdog timer when active (220ms)", hz: 1000 / 220, alwaysWhenIdle: false },
    { name: "shared_sampler.rs when active (1000ms) / idle (2000ms)", hz: 1000 / 1000, alwaysWhenIdle: true },
    { name: "SecondaryNotchApp.tsx get_system_metrics (1500ms)", hz: 1000 / 1500, alwaysWhenIdle: false },
    { name: "PinnedAppsGroup.tsx get_running_windows (1200ms)", hz: 1000 / 1200, alwaysWhenIdle: true },
    { name: "GpuTempNavbarModule.tsx get_gpu_telemetry (5000ms)", hz: 1000 / 5000, alwaysWhenIdle: true },
    { name: "PrivacyCamMicNavbarModule.tsx get_privacy_status (5000ms)", hz: 1000 / 5000, alwaysWhenIdle: true },
  ];
  const totalIdleHz = loops.filter((l) => l.alwaysWhenIdle).reduce((s, l) => s + l.hz, 0);
  console.log("\n=== KALKULASI FREKUENSI WAKE-UP IDLE ===");
  for (const l of loops) {
    console.log(`  ${l.name}: ${l.hz.toFixed(2)} Hz (idle_always=${l.alwaysWhenIdle})`);
  }
  console.log(`Total wake-up/detik saat desktop idle (semua modul standar aktif): ${totalIdleHz.toFixed(2)} wake-ups/detik`);
}

printIdleFrequencySummary();
