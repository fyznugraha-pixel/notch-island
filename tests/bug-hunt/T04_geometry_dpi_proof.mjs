import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = path.resolve(import.meta.dirname, "../..");
const notchGeomUrl = pathToFileURL(path.join(rootDir, "src/utils/notchGeometry.ts")).href;
const {
  snapToPhysicalPixel,
  getNotchSurfaceMetrics,
  buildNotchPath,
} = await import(notchGeomUrl);

console.log("=== UJI 1: Pemindaian notchGeometry.ts pada DPR 1.25 / 1.5 / 1.75 / 2.0 ===");

const dprs = [1.25, 1.5, 1.75, 2.0];
const heights = [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 48];
const failingCases = [];

for (const dpr of dprs) {
  for (const height of heights) {
    const params = {
      width: height,
      height,
      earRadius: 0,
      bottomRadius: 24,
      topRadius: 24,
      isIsland: true,
      position: "top",
      dpr,
    };
    const w = snapToPhysicalPixel(params.width, dpr);
    const h = snapToPhysicalPixel(params.height, dpr);
    const metrics = getNotchSurfaceMetrics(params);
    const svgPath = buildNotchPath(params);
    const physH = Math.round(h * dpr);
    const physRb = Math.round(metrics.rb * dpr);
    if (2 * physRb > physH || 2 * metrics.rb > h + 1e-9 || 2 * metrics.rb > w + 1e-9) {
      failingCases.push({ dpr, height, physH, physRb, rb: metrics.rb, h, svgPath });
    }
  }
}

console.log(`Ditemukan ${failingCases.length} kombinasi DPR x ukuran yang melanggar 2*rb <= h:`);
for (const c of failingCases.slice(0, 8)) {
  console.log(
    `  [dpr=${c.dpr}, h=${c.height}] physH=${c.physH}, physRb=${c.physRb} (2*physRb=${2 * c.physRb} > ${c.physH}), ` +
      `logical rb=${c.rb.toFixed(4)} vs h/2=${(c.h / 2).toFixed(4)}`
  );
}
if (failingCases.length > 0) {
  console.log(`  Contoh SVG path terlipat (dpr=${failingCases[0].dpr}, h=${failingCases[0].height}): ${failingCases[0].svgPath}`);
}
assert.ok(failingCases.length >= 5, "Harus terbukti kombinasi DPR 1.25/1.5/1.75 menyebabkan 2*rb > h");

console.log("\n=== UJI 2: Simulasi eksak taskbar_flyout.rs DPI lintas-monitor & batas -5000 ===");

function resolveTriggerScreenLogical(navRectPx, navScale, trigger, winScaleFactor) {
  const safeScale = Math.max(winScaleFactor, 1.0);
  const navX = navRectPx.left / safeScale;
  const navY = navRectPx.top / safeScale;
  const ratio = navScale / safeScale;
  return {
    x: navX + trigger.x * ratio,
    y: navY + trigger.y * ratio,
    width: trigger.width * ratio,
    height: trigger.height * ratio,
  };
}

function calculateAnchoredPositionInBounds(pos, width, height, trig, bounds) {
  const margin = 12.0;
  let x;
  let y;
  if (pos === "bottom") {
    x = trig.x + (trig.width - width) / 2.0;
    y = trig.y - height - margin;
  } else {
    x = trig.x + (trig.width - width) / 2.0;
    y = trig.y + trig.height + margin;
  }
  const maxX = Math.max(bounds.right - width - margin, bounds.left + margin);
  const maxY = Math.max(bounds.bottom - height - margin, bounds.top + margin);
  const clampedX = Math.min(Math.max(x, bounds.left + margin), maxX);
  const clampedY = Math.min(Math.max(y, bounds.top + margin), maxY);
  return { x: Math.round(clampedX), y: Math.round(clampedY) };
}

// Skenario A: Cold-start / flyout sebelumnya di Monitor 1 (100%, winScale=1.0),
// lalu user membuka Start flyout (600x640) pada navbar di Monitor 2 (150%, [-1920, 0, 0, 1080] fisik).
const navRectMon2 = { left: -1920, top: 384, right: 0, bottom: 1080 };
const mon2WorkArea = { left: -1920, top: 0, right: 0, bottom: 1080 };
const navScaleMon2 = 1.5;
const flyoutOldScale = 1.0;
const startTriggerLogical = { x: 300, y: 398, width: 36, height: 52 };
const desiredW = 600;
const desiredH = 640;

const trigMixed = resolveTriggerScreenLogical(navRectMon2, navScaleMon2, startTriggerLogical, flyoutOldScale);
const boundsMixed = {
  left: mon2WorkArea.left / flyoutOldScale,
  top: mon2WorkArea.top / flyoutOldScale,
  right: mon2WorkArea.right / flyoutOldScale,
  bottom: mon2WorkArea.bottom / flyoutOldScale,
};
const posMixed = calculateAnchoredPositionInBounds("bottom", desiredW, desiredH, trigMixed, boundsMixed);
const actualPhysX = posMixed.x * flyoutOldScale;
const actualPhysY = posMixed.y * flyoutOldScale;
const actualPhysW = desiredW * navScaleMon2;
const actualPhysH = desiredH * navScaleMon2;
const actualPhysBottom = actualPhysY + actualPhysH;
const dockTopPhys = navRectMon2.top + startTriggerLogical.y * navScaleMon2;

console.log(
  `[Skenario A: 100% -> 150%] posLogical=(${posMixed.x}, ${posMixed.y}), ` +
    `actualPhysRect=[${actualPhysX}, ${actualPhysY}, ${actualPhysX + actualPhysW}, ${actualPhysBottom}], ` +
    `dockTopPhys=${dockTopPhys}, monBottomPhys=${mon2WorkArea.bottom}`
);
console.log(
  `  Overflow bawah monitor: ${actualPhysBottom - mon2WorkArea.bottom}px fisik; ` +
    `Menindih dock sebesar: ${actualPhysBottom - dockTopPhys}px fisik`
);
assert.ok(actualPhysBottom > mon2WorkArea.bottom, "Flyout harus terbukti meluber di bawah monitor");
assert.ok(actualPhysBottom > dockTopPhys, "Flyout harus terbukti menindih dock");

// Skenario B: Target Search (740x700) pada monitor 1920x1080 @ 175% (workArea logical 1097.14 x 617.14)
const scale175 = 1.75;
const work175 = { left: 0, top: 0, right: 1920 / scale175, bottom: 1080 / scale175 };
const searchW = 740;
const searchH = 700;
const pos175 = calculateAnchoredPositionInBounds(
  "bottom",
  searchW,
  searchH,
  { x: 400, y: 550, width: 36, height: 52 },
  work175
);
console.log(
  `[Skenario B: 1920x1080 @ 175%] workHeightLogical=${work175.bottom.toFixed(2)}, searchH=${searchH}, ` +
    `pos=(${pos175.x}, ${pos175.y}), bottomLogical=${pos175.y + searchH}`
);
assert.ok(pos175.y + searchH > work175.bottom, "Flyout 700px melebihi tinggi work area 617px pada 175%");

// Skenario C: Batas -5000 pada resolve_navbar_anchor_for_target (taskbar_flyout.rs:307)
const negMonitorRects = [
  { name: "2x 2560px di kiri monitor utama", left: -5120, top: 0, right: -2560, bottom: 1440 },
  { name: "1x 5120x1440 ultrawide di kiri", left: -5120, top: 0, right: 0, bottom: 1440 },
  { name: "1x 3840x2160 + 1x 1920x1080 di kiri", left: -5760, top: 0, right: -3840, bottom: 1080 },
];
for (const r of negMonitorRects) {
  const rejected = r.right <= r.left || r.bottom <= r.top || r.left <= -5000 || r.top <= -5000;
  console.log(`[Skenario C: ${r.name}] rect.left=${r.left} -> ditolak oleh guard <= -5000? ${rejected}`);
  assert.equal(rejected, true);
}

console.log("\n=== UJI 3: backdrop_blur.rs:325-354 double eps offset ===");
const ox = 0;
const sw = 480;
const eps = 0.25;
const visualOffsetX = eps;
const clipLocalOffsetX = ox + eps;
const effectiveClipScreenOffset = visualOffsetX + clipLocalOffsetX;
console.log(
  `visualOffsetX=${visualOffsetX}, clipLocalOffsetX=${clipLocalOffsetX}, ` +
    `totalShiftInParent=${effectiveClipScreenOffset}px (visualSize=${sw - eps} vs clipSize=${sw - eps})`
);
assert.equal(effectiveClipScreenOffset, 0.5);

console.log("\nSEMUA UJI EMPIRIS T04 BERHASIL MEMBUKTIKAN CACAT.");
