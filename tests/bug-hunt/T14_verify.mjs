import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function walkFiles(relDir, exts = null) {
  const results = [];
  const start = path.join(ROOT, relDir);
  if (!fs.existsSync(start)) return results;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (!exts || exts.some((e) => entry.name.endsWith(e))) {
        results.push(path.relative(ROOT, full).replace(/\\/g, "/"));
      }
    }
  }
  walk(start);
  return results;
}

console.log("=== T14 VERIFICATION REPORT ===\n");

// 1. VERSION CONSISTENCY
console.log("--- [1] VERSION CONSISTENCY ---");
const pkgJson = JSON.parse(readText("package.json"));
const pkgLock = JSON.parse(readText("package-lock.json"));
const cargoToml = readText("src-tauri/Cargo.toml");
const cargoLock = readText("src-tauri/Cargo.lock");
const tauriConf = JSON.parse(readText("src-tauri/tauri.conf.json"));
const appxManifest = readText("AppxManifest.xml");
const settingsWinApp = readText("src/components/settingsWindow/SettingsWindowApp.tsx");
const aboutView = readText("src/components/settingsWindow/AboutView.tsx");
const aiHttp = readText("src/services/aiHttp.ts");
const lrclibProvider = readText("src/services/lyrics/lrclibProvider.ts");

const cargoVer = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLockVer = cargoLock.match(/\[\[package\]\]\r?\nname\s*=\s*"gili"\r?\nversion\s*=\s*"([^"]+)"/)?.[1];
const appxVer = appxManifest.match(/<Identity[^>]*\bVersion="([^"]+)"/)?.[1];
const settingsInitVer = settingsWinApp.match(/useState\("([^"]+)"\)/)?.[1];
const changelogTopVer = aboutView.match(/version:\s*"([^"]+)"/)?.[1];
const aiHttpUaVers = [...aiHttp.matchAll(/GiliDesktop\/([0-9.]+)/g)].map((m) => m[1]);
const lrclibUaVer = lrclibProvider.match(/Gili\/([0-9.]+)/)?.[1];

console.log("package.json:", pkgJson.version);
console.log("package-lock.json (root):", pkgLock.version, "| packages['']:", pkgLock.packages?.[""]?.version);
console.log("src-tauri/Cargo.toml:", cargoVer);
console.log("src-tauri/Cargo.lock (gili):", cargoLockVer);
console.log("src-tauri/tauri.conf.json:", tauriConf.version);
console.log("AppxManifest.xml Identity@Version:", appxVer);
console.log("SettingsWindowApp.tsx initial state:", settingsInitVer);
console.log("AboutView.tsx top changelog:", changelogTopVer);
console.log("aiHttp.ts User-Agent versions:", aiHttpUaVers);
console.log("lrclibProvider.ts User-Agent version:", lrclibUaVer);

// Check major/min npm & crate version alignment between manifest & lock
const depChecks = [];
for (const [dep, spec] of Object.entries({ ...pkgJson.dependencies, ...pkgJson.devDependencies })) {
  const locked = pkgLock.packages?.[`node_modules/${dep}`]?.version;
  depChecks.push({ dep, spec, locked });
}
const missingInPkgLock = depChecks.filter((d) => !d.locked);
console.log("npm deps missing from package-lock.json:", missingInPkgLock.length);
console.log("Key npm deps (spec -> locked):");
for (const d of depChecks) {
  console.log(`  ${d.dep}: ${d.spec} -> ${d.locked}`);
}

// Check Cargo.toml key crate versions in Cargo.lock
console.log("Key Rust crates in Cargo.lock:");
for (const crateName of ["tauri", "tauri-plugin-updater", "tauri-plugin-autostart", "tauri-plugin-store", "tauri-plugin-drag", "windows", "windows-core"]) {
  const m = [...cargoLock.matchAll(new RegExp(`\\[\\[package\\]\\]\\r?\\nname\\s*=\\s*"${crateName}"\\r?\\nversion\\s*=\\s*"([^"]+)"`, "g"))].map((x) => x[1]);
  console.log(`  ${crateName}: ${m.join(", ")}`);
}

// 2. IDENTIFIER, PRODUCT NAME & PATH CONSISTENCY
console.log("\n--- [2] IDENTIFIER & APPDATA PATH CONSISTENCY ---");
console.log("package.json name:", pkgJson.name);
console.log("Cargo.toml name:", cargoToml.match(/^name\s*=\s*"([^"]+)"/m)?.[1]);
console.log("Cargo.toml default-run:", cargoToml.match(/^default-run\s*=\s*"([^"]+)"/m)?.[1]);
console.log("tauri.conf.json productName:", tauriConf.productName);
console.log("tauri.conf.json identifier:", tauriConf.identifier);
console.log("tauri.conf.json window[0].title:", tauriConf.app?.windows?.[0]?.title);
console.log("tauri.conf.json updater endpoints:", tauriConf.plugins?.updater?.endpoints);
const pubkeyDecoded = Buffer.from(tauriConf.plugins?.updater?.pubkey || "", "base64").toString("utf8");
console.log("tauri.conf.json updater pubkey header:", pubkeyDecoded.split("\n")[0]);

const appxIdMatch = appxManifest.match(/<Identity\s+([^>]+)>/);
const appxDisplay = appxManifest.match(/<DisplayName>([^<]+)<\/DisplayName>/)?.[1];
const appxPubDisplay = appxManifest.match(/<PublisherDisplayName>([^<]+)<\/PublisherDisplayName>/)?.[1];
const appxExe = appxManifest.match(/Executable="([^"]+)"/)?.[1];
const appxAppId = appxManifest.match(/<Application\s+Id="([^"]+)"/)?.[1];
const appxTaskId = appxManifest.match(/<uap5:StartupTask[^>]*\bTaskId="([^"]+)"/)?.[1];
console.log("AppxManifest Identity:", appxIdMatch?.[1]);
console.log("AppxManifest DisplayName:", appxDisplay, "| PublisherDisplayName:", appxPubDisplay);
console.log("AppxManifest App Id:", appxAppId, "| Executable:", appxExe, "| StartupTask Id:", appxTaskId);

const rustFiles = walkFiles("src-tauri/src", [".rs"]);
const idRefs = [];
for (const rf of rustFiles) {
  const lines = readText(rf).split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/com\.faiz\.(notch|gili)|GiliNotch|GiliIsland|GiliStartupTask|com_faiz_|LOCALAPPDATA.*Gili|local appdata\\gili/i.test(line)) {
      idRefs.push(`${rf}:${idx + 1}: ${line.trim()}`);
    }
  });
}
console.log("Rust identifier/AppData references:");
for (const r of idRefs) console.log(" ", r);

// 3. APPXMANIFEST ASSETS & TAURI BUNDLE ICONS & PUBLIC ASSETS
console.log("\n--- [3] MANIFEST ASSETS & ICON FILES ---");
const appxAssetMatches = [...appxManifest.matchAll(/(?:<Logo>|Logo=")([^"<]+)(?:<\/Logo>|")/g)].map((m) => m[1]);
for (const rel of appxAssetMatches) {
  const norm = rel.replace(/\\/g, "/");
  const existsAtRoot = fs.existsSync(path.join(ROOT, norm));
  const baseName = path.basename(norm);
  const existsInIcons = fs.existsSync(path.join(ROOT, "src-tauri/icons", baseName));
  const existsWithoutPrefix = fs.existsSync(path.join(ROOT, "src-tauri/icons", baseName.replace(/^GILI-/, "")));
  console.log(
    `Appx asset "${rel}": rootExists=${existsAtRoot}, iconsExact=${existsInIcons}, iconsNoPrefix=${existsWithoutPrefix}`
  );
}

for (const iconPath of tauriConf.bundle?.icon || []) {
  const full = path.join(ROOT, "src-tauri", iconPath);
  console.log(`tauri.conf bundle.icon "${iconPath}": exists=${fs.existsSync(full)}, size=${fs.existsSync(full) ? fs.statSync(full).size : 0}`);
}
const nsisIcon = tauriConf.bundle?.windows?.nsis?.installerIcon;
if (nsisIcon) {
  const full = path.join(ROOT, "src-tauri", nsisIcon);
  console.log(`tauri.conf nsis.installerIcon "${nsisIcon}": exists=${fs.existsSync(full)}`);
}

// Check index.html & AboutView public references
const indexHtml = readText("index.html");
const htmlIcon = indexHtml.match(/href="([^"]+\.png)"/)?.[1];
console.log(`index.html favicon "${htmlIcon}": exists=${fs.existsSync(path.join(ROOT, "public", htmlIcon || ""))}`);
const aboutImgs = [...aboutView.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
for (const img of aboutImgs) {
  console.log(`AboutView.tsx img "${img}": exists=${fs.existsSync(path.join(ROOT, "public", img))}`);
}

// 4. VITE.CONFIG.TS ICON BARREL FILTER TEST
console.log("\n--- [4] VITE.CONFIG.TS SLIM-ICON-BARRELS CHECK ---");
function collectImportedSymbols(pkgName) {
  const symbols = new Set();
  const importRegex = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s*["']${pkgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
    "g"
  );
  const allSrc = walkFiles("src", [".ts", ".tsx", ".js", ".jsx"]);
  for (const rel of allSrc) {
    const content = readText(rel);
    let m;
    while ((m = importRegex.exec(content)) !== null) {
      for (const rawPart of m[1].split(",")) {
        const cleaned = rawPart.replace(/\btype\b/g, "").split(/\bas\b/)[0].trim();
        if (cleaned) symbols.add(cleaned);
      }
    }
  }
  return symbols;
}
function filterBarrelSource(source, usedSymbols) {
  if (usedSymbols.size === 0) return source;
  const keptLines = [];
  for (const line of source.split("\n")) {
    if (!line.startsWith("export {")) continue;
    for (const sym of usedSymbols) {
      if (line.includes(` ${sym},`) || line.includes(` ${sym} `)) {
        keptLines.push(line);
        break;
      }
    }
  }
  return keptLines.length > 0 ? keptLines.join("\n") : source;
}

const lucideUsed = collectImportedSymbols("lucide-react");
const lucideBarrelPath = "node_modules/lucide-react/dist/esm/lucide-react.mjs";
const lucideRaw = readText(lucideBarrelPath);
const lucideFiltered = filterBarrelSource(lucideRaw, lucideUsed);
const missingLucide = [];
for (const sym of lucideUsed) {
  const inRaw = lucideRaw.includes(` ${sym},`) || lucideRaw.includes(` ${sym} `);
  const inFiltered = lucideFiltered.includes(` ${sym},`) || lucideFiltered.includes(` ${sym} `);
  if (inRaw && !inFiltered) missingLucide.push(sym);
}
console.log(`lucide-react used symbols: ${lucideUsed.size}, missing after filter: ${missingLucide.length}`);

const simpleUsed = collectImportedSymbols("@icons-pack/react-simple-icons");
const simpleBarrelPath = "node_modules/@icons-pack/react-simple-icons/index.mjs";
const simpleRaw = readText(simpleBarrelPath);
const simpleFiltered = filterBarrelSource(simpleRaw, simpleUsed);
const missingSimple = [];
for (const sym of simpleUsed) {
  const inRaw = simpleRaw.includes(` ${sym},`) || simpleRaw.includes(` ${sym} `);
  const inFiltered = simpleFiltered.includes(` ${sym},`) || simpleFiltered.includes(` ${sym} `);
  if (inRaw && !inFiltered) missingSimple.push(sym);
}
console.log(`simple-icons used symbols: ${simpleUsed.size} (${[...simpleUsed].join(", ")}), missing after filter: ${missingSimple.length}`);

// Check if any file imports lucide-react or simple-icons with namespace (`* as`) or default import
const allSrc = walkFiles("src", [".ts", ".tsx", ".js", ".jsx"]);
const nonNamedIconImports = [];
for (const rel of allSrc) {
  const c = readText(rel);
  if (/import\s+(?:\*|\w+)\s+from\s+["'](?:lucide-react|@icons-pack\/react-simple-icons)["']/.test(c)) {
    nonNamedIconImports.push(rel);
  }
}
console.log("Namespace/default imports of icon barrels:", nonNamedIconImports.length);

// 5. TSCONFIG EXCLUDE VS IMPORTS
console.log("\n--- [5] TSCONFIG EXCLUDE VS IMPORTS ---");
const tsconfigRaw = readText("tsconfig.json").replace(/\/\*[\s\S]*?\*\//g, "");
const tsconfig = JSON.parse(tsconfigRaw);
console.log("tsconfig.json include:", tsconfig.include, "| exclude:", tsconfig.exclude);
const navbarFiles = walkFiles("src/components/navbar", [".ts", ".tsx"]);
const importedBySrc = new Set();
for (const rel of allSrc) {
  const c = readText(rel);
  for (const nf of navbarFiles) {
    const base = path.basename(nf, path.extname(nf));
    if (c.includes(`/${base}`) || c.includes(`"${base}"`) || c.includes(`'./${base}'`)) {
      importedBySrc.add(nf);
    }
  }
}
console.log("Total files in src/components/navbar:", navbarFiles.length);
console.log("Files referenced via import path:", importedBySrc.size);
const unreferencedNavbar = navbarFiles.filter((f) => !importedBySrc.has(f));
console.log("Unreferenced in navbar:", unreferencedNavbar);

// 6. CSS: PREFERS-REDUCED-MOTION, DURATION-250, FOCUS RINGS, LIGHT MODE CONTRAST
console.log("\n--- [6] CSS & A11Y STATIC AUDIT ---");
const indexCss = readText("src/index.css");
const appCss = readText("src/App.css");
const taskbarCss = readText("src/styles/taskbarTheme.css");

console.log("prefers-reduced-motion in index.css:", /prefers-reduced-motion/.test(indexCss));
console.log("prefers-reduced-motion in App.css:", /prefers-reduced-motion/.test(appCss));
console.log("prefers-reduced-motion in taskbarTheme.css:", /prefers-reduced-motion/.test(taskbarCss));
console.log("<MotionConfig usage in src:", allSrc.filter((f) => readText(f).includes("MotionConfig")));

const twStub = readText("node_modules/tailwindcss/stubs/config.full.js");
const hasDuration250 = /\b250:\s*['"]250ms['"]/.test(twStub);
console.log("Tailwind default theme has duration-250:", hasDuration250);

// Check IosSwitch usages lacking id or aria-label
const iosSwitchNoLabel = [];
let totalIosSwitch = 0;
let iosSwitchWithAriaOrId = 0;
for (const rel of allSrc) {
  if (rel.endsWith("IosSwitch.tsx")) continue;
  const c = readText(rel);
  const matches = [...c.matchAll(/<IosSwitch\b([\s\S]*?)\/>/g)];
  for (const m of matches) {
    totalIosSwitch++;
    if (/\b(id|aria-label|aria-labelledby)=/.test(m[1])) {
      iosSwitchWithAriaOrId++;
    } else {
      iosSwitchNoLabel.push(rel);
    }
  }
}
console.log(`IosSwitch usages: total=${totalIosSwitch}, with id/aria-label/aria-labelledby=${iosSwitchWithAriaOrId}`);

// Check IosSegmentedControl usages lacking aria-label
let totalSeg = 0;
let segWithAria = 0;
for (const rel of allSrc) {
  if (rel.endsWith("IosSegmentedControl.tsx")) continue;
  const c = readText(rel);
  const matches = [...c.matchAll(/<IosSegmentedControl\b([\s\S]*?)\/>/g)];
  for (const m of matches) {
    totalSeg++;
    if (/\baria-label(ledby)?=/.test(m[1])) segWithAria++;
  }
}
console.log(`IosSegmentedControl usages: total=${totalSeg}, with aria-label=${segWithAria}`);

// Check src/index.css :not([class*="/"]) solid button rule vs actual usages
const solidBtnBgPatterns = [
  "bg-[#3882F6]", "bg-[#007aff]", "bg-[#0a84ff]", "bg-[#34c759]",
  "bg-[#30d158]", "bg-[#ff3b30]", "bg-[#ff453a]", "bg-blue-600",
  "bg-blue-500", "bg-red-500", "bg-emerald-500"
];
const brokenSolidLightBtns = [];
for (const rel of allSrc) {
  const lines = readText(rel).split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (!line.includes("className")) return;
    for (const pat of solidBtnBgPatterns) {
      if (line.includes(pat) && !line.includes(`${pat}/`) && /\/[0-9\[\]]/.test(line)) {
        brokenSolidLightBtns.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 140)}`);
        break;
      }
    }
  });
}
console.log(`Solid primary buttons with '/' modifier on same className line (defeats index.css:1690 :not([class*="/"])): ${brokenSolidLightBtns.length}`);
for (const b of brokenSolidLightBtns) console.log(" ", b);

// Check .navbar-surface-light coverage against ALL color classes used in navbar & modules
const navbarAndModFiles = [
  ...walkFiles("src/modules/components", [".tsx"]),
  ...walkFiles("src/components/navbar", [".tsx"]),
];
const usedTextColors = new Set();
const usedBgWhite = new Set();
const usedBorderWhite = new Set();
for (const rel of navbarAndModFiles) {
  const c = readText(rel);
  for (const m of c.match(/\btext-(?:white|zinc|neutral|slate|gray|blue|sky|emerald|amber|rose|pink|purple|red|indigo|teal|cyan|orange|yellow)(?:\/(?:\[[^\]]+\]|\d+)|-\d+)?\b/g) || []) {
    usedTextColors.add(m);
  }
  for (const m of c.match(/\bbg-white(?:\/(?:\[[^\]]+\]|\d+))?\b/g) || []) {
    usedBgWhite.add(m);
  }
  for (const m of c.match(/\bborder-white(?:\/(?:\[[^\]]+\]|\d+))?\b/g) || []) {
    usedBorderWhite.add(m);
  }
}
function findUncovered(set) {
  const out = [];
  for (const cls of [...set].sort()) {
    const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // In App.css Tailwind selectors escape `/` as `\/`, `[` as `\[`, `]` as `\]`, `.` as `\.`
    const cssEscaped = cls.replace(/([/[\].#])/g, "\\\\$1");
    if (!appCss.includes(cssEscaped) && !new RegExp(escaped).test(appCss)) {
      out.push(cls);
    }
  }
  return out;
}
console.log("Navbar/Module text-* NOT in App.css .navbar-surface-light:", findUncovered(usedTextColors));
console.log("Navbar/Module bg-white* NOT in App.css .navbar-surface-light:", findUncovered(usedBgWhite));
console.log("Navbar/Module border-white* NOT in App.css .navbar-surface-light:", findUncovered(usedBorderWhite));

// Check nested <button> inside makeTriggerA11yProps <div role="button">
const nestedButtonModules = [];
for (const rel of walkFiles("src/modules/components", [".tsx"])) {
  const c = readText(rel);
  if (c.includes("makeTriggerA11yProps") && /<button\b/.test(c)) {
    const triggerPart = c.split("<NavbarPopoverShell")[0];
    if (/<button\b/.test(triggerPart)) {
      nestedButtonModules.push(rel);
    }
  }
}
console.log("Modules with <button> nested inside makeTriggerA11yProps <div role='button'>:", nestedButtonModules);

// Check focus:outline-none / outline-none without focus-visible in src/
const outlineNoneHits = [];
for (const rel of allSrc) {
  const lines = readText(rel).split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/(?:focus:)?outline-none/.test(line) && !/focus-visible:|focus:ring|focus:border|TRIGGER_FOCUS_RING/.test(line)) {
      outlineNoneHits.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}
console.log(`Lines with outline-none without focus-visible/focus:ring/focus:border on same line: ${outlineNoneHits.length}`);
for (const h of outlineNoneHits) console.log(" ", h);

// 7. RUNTIME UNIT TESTS FOR triggerA11y, usePrefersReducedMotion & Tooltip logic
console.log("\n--- [7] RUNTIME A11Y BEHAVIOR TESTS ---");

const triggerA11ySrc = readText("src/utils/triggerA11y.ts");
assert.ok(triggerA11ySrc.includes('if (e.key === "Enter" || e.key === " ")'));
assert.ok(!triggerA11ySrc.includes("e.repeat"), "triggerA11y.ts lacks e.repeat guard");
assert.ok(!triggerA11ySrc.includes("aria-pressed"), "triggerA11y.ts lacks aria-pressed support");

let count = 0;
const onKeyDownSim = (e) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    count++;
  }
};
const el = {};
for (let i = 0; i < 5; i++) {
  onKeyDownSim({ key: " ", repeat: true, target: el, currentTarget: el, preventDefault() {} });
}
console.log(`Test A (holding Space repeat=true x5): onActivate fired ${count} times (lacks e.repeat guard)`);
assert.equal(count, 5);

const reducedHookSrc = readText("src/hooks/usePrefersReducedMotion.ts");
assert.ok(reducedHookSrc.includes('mq.addEventListener("change", handleChange)'));
assert.ok(!reducedHookSrc.includes("addListener"), "usePrefersReducedMotion lacks legacy addListener fallback");
const legacyMq = { matches: false, addListener() {}, removeListener() {} };
let threwOnLegacy = false;
try {
  legacyMq.addEventListener("change", () => {});
} catch (err) {
  threwOnLegacy = err instanceof TypeError;
}
console.log("Test B (legacy MediaQueryList without addEventListener): throws TypeError =", threwOnLegacy);
assert.equal(threwOnLegacy, true);

const tooltipSrc = readText("src/components/ui/Tooltip.tsx");
assert.ok(!tooltipSrc.includes('role="tooltip"'), "Tooltip.tsx lacks role='tooltip'");
assert.ok(!tooltipSrc.includes("aria-describedby"), "Tooltip.tsx lacks aria-describedby");
assert.ok(!tooltipSrc.includes("Escape"), "Tooltip.tsx lacks Escape key handler");

function simulateTooltipTopCenter({ triggerTop, triggerBottom, triggerLeft, triggerWidth, tipHeight = 26, tipWidth = 100, innerWidth = 820, allowFlip = false }) {
  let currentSide = "top";
  if (currentSide === "top" && triggerTop - tipHeight - 8 < 6) {
    currentSide = allowFlip ? "bottom" : "top";
  }
  if (currentSide === "top") {
    const safeTop = Math.max(tipHeight + 4, triggerTop - 8);
    const safeLeft = Math.max(tipWidth / 2 + 6, Math.min(innerWidth - tipWidth / 2 - 6, triggerLeft + triggerWidth / 2));
    return { actualSide: currentSide, boxTop: safeTop - tipHeight, boxBottom: safeTop, safeLeft };
  }
  return { actualSide: currentSide, boxTop: triggerBottom + 8, boxBottom: triggerBottom + 8 + tipHeight };
}

const overlapTip = simulateTooltipTopCenter({ triggerTop: 8, triggerBottom: 32, triggerLeft: 100, triggerWidth: 40, allowFlip: false });
const overlapsTrigger = overlapTip.boxBottom > 8 && overlapTip.boxTop < 32;
console.log("Test C (Tooltip top near viewport top, allowFlip=false):", overlapTip, "overlapsTrigger =", overlapsTrigger);
assert.equal(overlapsTrigger, true);

console.log("\n=== END T14 VERIFICATION ===");
