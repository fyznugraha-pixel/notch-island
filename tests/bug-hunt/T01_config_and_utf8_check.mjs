import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(import.meta.dirname, "../..");
const tauriConfPath = path.join(ROOT, "src-tauri", "tauri.conf.json");
const capDefaultPath = path.join(ROOT, "src-tauri", "capabilities", "default.json");
const libRsPath = path.join(ROOT, "src-tauri", "src", "lib.rs");

const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
const capDefault = JSON.parse(fs.readFileSync(capDefaultPath, "utf8"));
const libRs = fs.readFileSync(libRsPath, "utf8");

// 1. Cek konsistensi WEBVIEW_BROWSER_ARGS vs additionalBrowserArgs
const webviewMatch = libRs.match(/pub\(crate\)\s+const\s+WEBVIEW_BROWSER_ARGS:\s*&str\s*=\s*\r?\n\s*"([^"]+)";/);
assert.ok(webviewMatch, "WEBVIEW_BROWSER_ARGS harus ditemukan di lib.rs");
const rustBrowserArgs = webviewMatch[1];
const confBrowserArgs = tauriConf.app?.windows?.[0]?.additionalBrowserArgs;
assert.equal(rustBrowserArgs, confBrowserArgs, "WEBVIEW_BROWSER_ARGS harus cocok dengan tauri.conf.json");
console.log("[PASS] WEBVIEW_BROWSER_ARGS === tauri.conf.json additionalBrowserArgs");

// 2. Cek duplikasi command di invoke_handler!
const invokeMatch = libRs.match(/\.invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/);
assert.ok(invokeMatch, "invoke_handler harus ditemukan di lib.rs");
const commands = invokeMatch[1]
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const uniqueCommands = new Set(commands);
assert.equal(commands.length, uniqueCommands.size, "Tidak boleh ada command duplikat di invoke_handler");
console.log(`[PASS] invoke_handler memiliki ${commands.length} command unik tanpa duplikasi`);

// 3. Verifikasi konfigurasi assetProtocol & CSP pada tauri.conf.json
const assetProtocol = tauriConf.app?.security?.assetProtocol;
const csp = tauriConf.app?.security?.csp;
const hasWildcardAssetScope = assetProtocol?.enable === true && Array.isArray(assetProtocol?.scope) && assetProtocol.scope.includes("**");
const connectSrcTokens = String(csp?.["connect-src"] || "").split(/\s+/);
const imgSrcTokens = String(csp?.["img-src"] || "").split(/\s+/);
const mediaSrcTokens = String(csp?.["media-src"] || "").split(/\s+/);

console.log("[CHECK] assetProtocol.enable:", assetProtocol?.enable, "scope:", JSON.stringify(assetProtocol?.scope));
console.log("[CHECK] connect-src mengizinkan wildcard http:/https::", connectSrcTokens.includes("http:") && connectSrcTokens.includes("https:"));
console.log("[CHECK] img-src mengizinkan wildcard http:/https::", imgSrcTokens.includes("http:") && imgSrcTokens.includes("https:"));
console.log("[CHECK] media-src mengizinkan wildcard http:/https::", mediaSrcTokens.includes("http:") && mediaSrcTokens.includes("https:"));

assert.equal(hasWildcardAssetScope, true, "Temuan terkonfirmasi: assetProtocol.scope berisi '**'");
assert.equal(connectSrcTokens.includes("http:"), true, "Temuan terkonfirmasi: connect-src mengizinkan skema 'http:'");

// 4. Verifikasi capabilities/default.json
const windows = capDefault.windows || [];
const perms = capDefault.permissions || [];
const redundantSecondary = ["notch_secondary_1", "notch_secondary_2", "notch_secondary_3", "notch_secondary_4"]
  .filter((w) => windows.includes(w) && windows.includes("notch_secondary_*"));
const redundantNavbar = ["navbar_secondary_1", "navbar_secondary_2", "navbar_secondary_3", "navbar_secondary_4"]
  .filter((w) => windows.includes(w) && windows.includes("navbar_secondary_*"));
const duplicatePluginDefaults = [
  ["clipboard-manager:default", "clipboard-manager:allow-read-text"],
  ["clipboard-manager:default", "clipboard-manager:allow-write-text"],
  ["global-shortcut:default", "global-shortcut:allow-register"],
].filter(([a, b]) => perms.includes(a) && perms.includes(b));

console.log("[CHECK] Total target windows pada default.json:", windows.length);
console.log("[CHECK] Redundan dengan wildcard notch_secondary_*:", JSON.stringify(redundantSecondary));
console.log("[CHECK] Redundan dengan wildcard navbar_secondary_*:", JSON.stringify(redundantNavbar));
console.log("[CHECK] Permission sensitif dibagikan ke seluruh window:", JSON.stringify(
  perms.filter((p) => ["autostart:default", "updater:default", "core:window:allow-destroy", "opener:default"].includes(p))
));
console.log("[CHECK] Pasangan permission default + allow eksplisit:", JSON.stringify(duplicatePluginDefaults));

// 5. Verifikasi layout byte UTF-8 dari literal pemisah pada lib.rs:5900-5901
const lines = libRs.split(/\r?\n/);
const line5900 = lines[5899];
const line5901 = lines[5900];
assert.ok(line5900.includes('rfind(" • ")'), "Baris 5900 harus berisi rfind(\" • \")");
assert.ok(line5901.includes("title[idx + 3..]"), "Baris 5901 harus berisi title[idx + 3..]");
const sepBuf = Buffer.from(" • ", "utf8");
const byteAtOffset3 = sepBuf[3];
const isUtf8Continuation = (byteAtOffset3 & 0b1100_0000) === 0b1000_0000;
console.log("[CHECK] UTF-8 bytes dari ' • ':", [...sepBuf].map((b) => "0x" + b.toString(16).toUpperCase()).join(" "));
console.log("[CHECK] Panjang byte ' • ':", sepBuf.length, "| byte di offset +3:", "0x" + byteAtOffset3.toString(16).toUpperCase(), "| continuation byte:", isUtf8Continuation);
assert.equal(sepBuf.length, 5);
assert.equal(isUtf8Continuation, true);
