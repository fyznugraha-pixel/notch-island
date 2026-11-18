import assert from "node:assert";
import fs from "node:fs";

console.log("=== MENJALANKAN VERIFIKASI MANDIRI V03 (VERIFY-03) ===");

// 1. Uji T08-05: dateNlpParser.ts
const nlpSource = fs.readFileSync("src/utils/dateNlpParser.ts", "utf8");
// Transpile sederhana dari TS ke JS untuk fungsi parseDateNlp & formatNlpDateBadge & parseTimeSnippet
const jsNlp = nlpSource
  .replace(/export interface NlpDateResult \{[\s\S]*?\}/, "")
  .replace(/:\s*Record<string,\s*number>/g, "")
  .replace(/:\s*Date\s*\|\s*null/g, "")
  .replace(/:\s*number\s*\|\s*null/g, "")
  .replace(/:\s*"am"\s*\|\s*"bl"\s*\|\s*"gr"/g, "")
  .replace(/:\s*"en"\s*\|\s*"id"/g, "")
  .replace(/:\s*NlpDateResult/g, "")
  .replace(/:\s*\{[\s\S]*?\}(?=\s*\{)/g, "")
  .replace(/:\s*\{ hour: number; minute: number \} \| null/g, "")
  .replace(/:\s*Date/g, "")
  .replace(/:\s*string/g, "")
  .replace(/:\s*number/g, "")
  .replace(/:\s*boolean/g, "")
  .replace(/export function /g, "function ");

const runNlp = new Function(`${jsNlp}; return { parseDateNlp };`)();
const refDate = new Date(2026, 4, 10, 10, 0, 0); // Minggu, 10 Mei 2026 10:00

const casesT08_05 = [
  "Beli susu besok 2 liter",
  "Review PR hari ini 100%",
  "Meeting senin 2026",
  "Laporan hari ini 30 menit",
  "Kerjakan hari ini jam 99",
  "Kumpul tugas besok jam 24:30",
];

for (const input of casesT08_05) {
  const res = runNlp.parseDateNlp(input, refDate, "id");
  const dt = res.dueAt ? new Date(res.dueAt) : null;
  console.log(`[T08-05] "${input}" -> cleanText: "${res.cleanText}", rawMatched: "${res.rawMatched}", hasTime: ${res.hasTime}, time: ${dt ? dt.toTimeString().slice(0,5) : "null"}`);
}

// Verifikasi tegas T08-05:
assert.strictEqual(runNlp.parseDateNlp("Beli susu besok 2 liter", refDate, "id").cleanText, "Beli susu liter");
assert.strictEqual(runNlp.parseDateNlp("Review PR hari ini 100%", refDate, "id").cleanText, "Review PR 0%");
assert.strictEqual(runNlp.parseDateNlp("Meeting senin 2026", refDate, "id").cleanText, "Meeting 26");
assert.strictEqual(runNlp.parseDateNlp("Kerjakan hari ini jam 99", refDate, "id").cleanText, "Kerjakan");
const r2430 = runNlp.parseDateNlp("Kumpul tugas besok jam 24:30", refDate, "id");
assert.strictEqual(new Date(r2430.dueAt).getHours(), 0);
assert.strictEqual(new Date(r2430.dueAt).getMinutes(), 30);

// 2. Uji T09-04: CustomColorPicker hex expansion
function isValidHex(hex) {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex.trim());
}
function normalizeHex(hex) {
  const clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`.toLowerCase();
  }
  return `#${clean}`.toLowerCase();
}

let parentValue = "#0f172a";
let hexInput = parentValue;
function simulateType(rawFromInput) {
  // Sesuai onChange={(e) => handleHexInputChange(`#${e.target.value}`)} dengan maxLength={6}
  const clipped = rawFromInput.slice(0, 6);
  const raw = `#${clipped}`;
  hexInput = raw;
  const trimmed = raw.trim();
  if (isValidHex(trimmed)) {
    const normalized = normalizeHex(trimmed);
    parentValue = normalized;
    // useEffect([currentHex]) langsung terpanggil ketika parentValue berubah:
    hexInput = normalizeHex(parentValue);
  }
}
simulateType("f");
assert.strictEqual(hexInput.replace(/^#/, ""), "f");
simulateType("ff");
assert.strictEqual(hexInput.replace(/^#/, ""), "ff");
simulateType("ff0");
// Pada ketikan ke-3 ("ff0"), isValidHex("#ff0") === true -> normalizeHex("#ff0") === "#ffff00"
// useEffect mengubah hexInput menjadi "#ffff00", dan tampilan di input (tanpa #) menjadi "ffff00" (panjang 6 = maxLength!)
assert.strictEqual(hexInput.replace(/^#/, ""), "ffff00");
assert.strictEqual(hexInput.replace(/^#/, "").length, 6);
console.log(`[T09-04] Setelah mengetik 3 karakter "ff0", nilai input otomatis memekar menjadi "${hexInput.replace(/^#/, "")}" (length=${hexInput.replace(/^#/, "").length}, maxLength=6) sehingga karakter ke-4 diblokir!`);

// Simulasi paste "#1d4ed8" ke input yang memiliki maxLength={6}:
// Browser memotong "#1d4ed8" menjadi 6 karakter: "#1d4ed", lalu onChange menambahkan "#" -> "##1d4ed"
simulateType("#1d4ed8");
assert.strictEqual(hexInput, "##1d4ed");
console.log(`[T09-04] Saat menempel "#1d4ed8", maxLength=6 memotong menjadi "#1d4ed" dan hexInput menjadi "${hexInput}" (tidak valid).`);

// 3. Uji T10-01: compute_cursor_hover_state dari miniplayer_window.rs
function computeCursorHoverState(mode, relX, relY, winW, winH, inBounds, isRightHalf, wasInWindow) {
  const shellW = Math.min(mode === "card" ? 380.0 : 440.0, winW);
  const collapsedH = Math.min(mode === "card" ? 298.0 : 88.0, winH);
  const expandedH = Math.min(mode === "card" ? 340.0 : 130.0, winH);
  const activeH = wasInWindow ? expandedH : collapsedH;
  const shellLeft = isRightHalf ? Math.max(0.0, winW - shellW) : 0.0;
  const shellTop = Math.max(0.0, winH - activeH);
  const inWindow = inBounds && relX >= shellLeft && relX <= shellLeft + shellW && relY >= shellTop && relY <= shellTop + activeH;
  const expandedTopY = Math.max(0.0, winH - expandedH);
  const toolbarHeight = 52.0;
  const bottomProgressHeight = 22.0;
  const inTopToolbar = inWindow && relY >= expandedTopY && relY < expandedTopY + toolbarHeight;
  const inBottomProgress = inWindow && relY >= (winH - bottomProgressHeight) && relY <= winH;
  const inToolbar = inTopToolbar || inBottomProgress;
  const shouldIgnoreCursor = !inWindow || !inToolbar;
  return { inWindow, inToolbar, shouldIgnoreCursor };
}
// Card mode: winW=380, winH=340. Area lirik di tengah: relX=190, relY=180
const cardCenter = computeCursorHoverState("card", 190, 180, 380, 340, true, true, true);
assert.strictEqual(cardCenter.inWindow, true);
assert.strictEqual(cardCenter.inToolbar, false);
assert.strictEqual(cardCenter.shouldIgnoreCursor, true);
console.log(`[T10-01] Card mode tengah (relY=180): inWindow=${cardCenter.inWindow}, inToolbar=${cardCenter.inToolbar}, shouldIgnoreCursor=${cardCenter.shouldIgnoreCursor}`);

console.log("=== SEMUA UJI V03 LULUS DAN TERBUKTI ===");
