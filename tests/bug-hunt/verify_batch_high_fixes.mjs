import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createViteSsrLoader, installBrowserShim } from "../../scripts/tests/harness.mjs";

const ROOT = "d:/kerjaan/projek-ndiri/island";

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

async function runTests() {
  installBrowserShim();
  const loader = await createViteSsrLoader();

  try {
    const [
      aiHttp,
      moduleAliases,
      dateNlpParser,
      colorUtils,
      shelfService,
      weatherService,
      giliFreeProxy,
    ] = await Promise.all([
      loader.loadModule("/src/services/aiHttp.ts"),
      loader.loadModule("/src/modules/moduleAliases.ts"),
      loader.loadModule("/src/utils/dateNlpParser.ts"),
      loader.loadModule("/src/utils/colorUtils.ts"),
      loader.loadModule("/src/services/shelfService.ts"),
      loader.loadModule("/src/services/weatherService.ts"),
      loader.loadModule("/gili-free-proxy/src/index.ts"),
    ]);

    // 1. aiHttp SSRF validation & secret redaction (T01-05 / T02-10)
    assert.doesNotThrow(() => aiHttp.validateAiHttpUrl("http://localhost:11434/api/chat"));
    assert.doesNotThrow(() => aiHttp.validateAiHttpUrl("https://api.openai.com/v1/chat/completions"));
    for (const badUrl of [
      "http://169.254.169.254/latest/meta-data",
      "http://127.0.0.1:8731/u/tok/complete",
      "http://10.0.0.5:8080/admin",
      "http://192.168.1.10/api",
      "http://172.16.0.5/api",
      "http://example.com/v1/chat",
      "file:///C:/Windows/System32/drivers/etc/hosts",
      "http://user:pass@localhost:11434/api",
    ]) {
      assert.throws(() => aiHttp.validateAiHttpUrl(badUrl), `must block unsafe URL: ${badUrl}`);
    }
    const redacted = aiHttp.redactSensitiveUrlParams("https://example.com/path?key=SECRET123&token=TOK999&safe=ok");
    assert.ok(!redacted.includes("SECRET123"));
    assert.ok(!redacted.includes("TOK999"));
    assert.ok(redacted.includes("safe=ok"));

    // 2. Module alias collision separation (T07-01)
    assert.equal(moduleAliases.resolveCanonicalModuleId("system"), "pantau_sistem");
    assert.equal(moduleAliases.resolveCanonicalModuleId("systemIcons"), "systemIcons");
    assert.equal(moduleAliases.resolveCanonicalModuleId("clockDate"), "clockDate");
    assert.equal(moduleAliases.isSameCatalogModuleId("systemIcons", "output_audio"), false);
    assert.equal(moduleAliases.isSameCatalogModuleId("clockDate", "jam_dunia"), false);
    assert.equal(moduleAliases.isSameCatalogModuleId("clock", "jam_dunia"), true);
    assert.equal(moduleAliases.isSameCatalogModuleId("audiodevice", "output_audio"), true);
    assert.equal(moduleAliases.BUILTIN_MODULE_ID_SET.has("systemIcons"), true);
    assert.equal(moduleAliases.BUILTIN_MODULE_ID_SET.has("clockDate"), true);

    // 3. Date NLP parser regression & false positive guards (T08-05)
    const refDate = new Date(2026, 10, 18, 10, 0, 0, 0);
    const liter = dateNlpParser.parseDateNlp("Beli air besok 2 liter", refDate, "id");
    assert.equal(liter.hasDate, true);
    assert.equal(liter.hasTime, false);
    assert.equal(liter.cleanText, "Beli air 2 liter");

    const pct = dateNlpParser.parseDateNlp("Target besok 100%", refDate, "id");
    assert.equal(pct.hasTime, false);
    assert.equal(pct.cleanText, "Target 100%");

    const year = dateNlpParser.parseDateNlp("Laporan minggu 2026", refDate, "id");
    assert.equal(year.hasTime, false);
    assert.equal(year.cleanText, "Laporan 2026");

    const duration = dateNlpParser.parseDateNlp("Olahraga besok 30 menit", refDate, "id");
    assert.equal(duration.hasTime, false);
    assert.equal(duration.cleanText, "Olahraga 30 menit");

    const bad24 = dateNlpParser.parseDateNlp("Rapat besok 24:30", refDate, "id");
    assert.equal(bad24.hasTime, false);
    assert.equal(bad24.cleanText, "Rapat 24:30");

    const validTime = dateNlpParser.parseDateNlp("Bayar besok jam 4 sore", refDate, "id");
    assert.equal(validTime.hasTime, true);
    assert.equal(validTime.cleanText, "Bayar");
    assert.equal(new Date(validTime.dueAt).getHours(), 16);

    // 4. CustomColorPicker hex draft vs blur expansion (T09-04)
    assert.deepEqual(colorUtils.parseLiveHexInput("#1d4"), {
      draftValue: "#1d4",
      committedHex: null,
    });
    assert.deepEqual(colorUtils.parseLiveHexInput("ff0"), {
      draftValue: "#ff0",
      committedHex: null,
    });
    assert.deepEqual(colorUtils.parseLiveHexInput("#1d4ed8"), {
      draftValue: "#1d4ed8",
      committedHex: "#1d4ed8",
    });
    assert.deepEqual(colorUtils.parseLiveHexInput("##1d4ed8"), {
      draftValue: "#1d4ed8",
      committedHex: "#1d4ed8",
    });
    assert.equal(colorUtils.commitHexDraft("#ff0"), "#ffff00");
    assert.equal(colorUtils.commitHexDraft("1d4ed8"), "#1d4ed8");
    assert.equal(colorUtils.commitHexDraft("#12"), null);

    // 5. Shelf delete resurrection & corrupt localStorage recovery (T12-03)
    const deletedRes = shelfService.reconcilePersistedShelfSources({
      storeFiles: [
        { id: "a", name: "a.png", path: "C:\\a.png", ext: "png", addedAt: 200 },
        { id: "b", name: "b.png", path: "C:\\b.png", ext: "png", addedAt: 100 },
      ],
      storeUpdatedAt: 1000,
      localFiles: [{ id: "b", name: "b.png", path: "C:\\b.png", ext: "png", addedAt: 100 }],
      localUpdatedAt: 1005,
    });
    assert.equal(deletedRes.files.length, 1);
    assert.equal(deletedRes.files[0].id, "b");
    assert.equal(deletedRes.syncToStore, true);

    const corruptRecovered = shelfService.reconcilePersistedShelfSources({
      storeFiles: [{ id: "keep", name: "keep.txt", path: "C:\\keep.txt", ext: "txt", addedAt: 50 }],
      storeUpdatedAt: 500,
      localFiles: null,
      localUpdatedAt: null,
    });
    assert.equal(corruptRecovered.files.length, 1);
    assert.equal(corruptRecovered.files[0].id, "keep");
    assert.equal(corruptRecovered.syncToLocal, true);

    localStorage.clear();
    localStorage.setItem("island_drop_shelf", "{broken-json");
    assert.deepEqual(shelfService.getInitialShelfFiles(), []);

    // 6. Weather auto sync registers online reconnect retry
    const listenersBefore = [];
    const origAdd = window.addEventListener.bind(window);
    const origRem = window.removeEventListener.bind(window);
    window.addEventListener = (type, fn, opts) => {
      if (type === "online") listenersBefore.push(fn);
      return origAdd(type, fn, opts);
    };
    window.removeEventListener = (type, fn, opts) => {
      return origRem(type, fn, opts);
    };
    try {
      const stopWeatherSync = weatherService.startWeatherAutoSync(() => {});
      assert.equal(listenersBefore.length, 1, "startWeatherAutoSync must register online handler");
      stopWeatherSync();
    } finally {
      window.addEventListener = origAdd;
      window.removeEventListener = origRem;
    }

    // 7. Behavioral check on gili-free-proxy IPv6 /64 bucketing + source contracts
    const ipv6A = giliFreeProxy.normalizeIpBucket("2001:db8:85a3:1234::1");
    const ipv6B = giliFreeProxy.normalizeIpBucket("2001:db8:85a3:1234:abcd:ef01:2345:6789");
    assert.equal(ipv6A, "ip6:2001:0db8:85a3:1234::/64");
    assert.equal(ipv6B, ipv6A, "host-bit rotation within same /64 must share IP bucket");
    assert.equal(giliFreeProxy.normalizeIpBucket("203.0.113.42"), "ip:203.0.113.42");

    const proxySrc = readRepoFile("gili-free-proxy/src/index.ts");
    assert.ok(proxySrc.includes("UUID_V4_PATTERN"));
    assert.ok(proxySrc.includes("normalizeIpBucket"));
    assert.ok(proxySrc.includes("DEFAULT_DEV_CORS_ORIGINS"));
    assert.ok(proxySrc.includes("CLIENT_HMAC_SECRET"));

    const giliFreeSrc = readRepoFile("src/services/giliFreeService.ts");
    assert.ok(giliFreeSrc.includes("X-Gili-Timestamp"));
    assert.ok(giliFreeSrc.includes("X-Gili-Signature"));

    const libRs = readRepoFile("src-tauri/src/lib.rs");
    assert.ok(libRs.includes("mod http_guard;"));
    assert.ok(libRs.includes("AiStreamRegistryGuard"));
    assert.ok(libRs.includes("fetch_external_lyrics_api"));

    const hotkeyRs = readRepoFile("src-tauri/src/taskbar_hotkey.rs");
    assert.ok(hotkeyRs.includes("HOTKEY_APP_HANDLE"));
    assert.ok(hotkeyRs.includes("KILL_SWITCH_IN_FLIGHT"));
    assert.ok(!hotkeyRs.includes("GetMessageW(&mut msg, None, 0, 0).as_bool()"));

    const taskbarMgrRs = readRepoFile("src-tauri/src/taskbar_manager.rs");
    assert.ok(!taskbarMgrRs.includes("GetMessageW(&mut msg, None, 0, 0).as_bool()"));
    assert.ok(taskbarMgrRs.includes("compare_exchange_weak"));

    const blurRs = readRepoFile("src-tauri/src/backdrop_blur.rs");
    assert.ok(!blurRs.includes("GetMessageW(&mut msg, None, 0, 0).as_bool()"));

    const previewRs = readRepoFile("src-tauri/src/window_preview.rs");
    assert.ok(!previewRs.includes("GetMessageW(&mut msg, None, 0, 0).as_bool()"));
    assert.ok(!previewRs.includes('app.get_webview_window("navbar")'));

    const toggleRs = readRepoFile("src-tauri/src/shell_surface_toggle.rs");
    assert.ok(!toggleRs.includes("send_escape_key"));

    const navbarWinRs = readRepoFile("src-tauri/src/navbar_window.rs");
    assert.ok(navbarWinRs.includes("actual_sec_count != expected_sec_count"));
    assert.ok(navbarWinRs.includes("is_popup_menu_active"));
    assert.ok(navbarWinRs.includes("ScaleFactorChanged"));

    const appTsx = readRepoFile("src/App.tsx");
    assert.ok(appTsx.includes("clearNotifLeaveTimer"));
    assert.ok(appTsx.includes("handleCloseImmediate()"));
    assert.ok(appTsx.includes("onShelfFileReceived((payload)"));

    const wifiSubmenu = readRepoFile("src/components/ui/control-center/WifiSubmenu.tsx");
    assert.ok(wifiSubmenu.includes("connectError"));

    const weatherMod = readRepoFile("src/modules/components/WeatherNavbarModule.tsx");
    assert.ok(weatherMod.includes("useCityModulePolling"));

    const aqiMod = readRepoFile("src/modules/components/MediaLifestyleExtraModules.tsx");
    assert.ok(aqiMod.includes("useCityModulePolling"));

    const shelfPanel = readRepoFile("src/components/ui/DropShelfPanel.tsx");
    assert.ok(shelfPanel.includes("getShelfTransferStatus"));
    assert.ok(shelfPanel.includes("handleHideTransferModal"));

    const shelfModal = readRepoFile("src/components/ui/shelf/DropShelfTransferModal.tsx");
    assert.ok(shelfModal.includes("session.expires_in_sec ?? 300"));
    assert.ok(shelfModal.includes("isExpired"));

    const navbarColorPicker = readRepoFile("src/components/settingsWindow/navbar/CustomColorPicker.tsx");
    assert.ok(navbarColorPicker.includes("parseLiveHexInput"));
    assert.ok(navbarColorPicker.includes("maxLength={7}"));

    const settingsColorPicker = readRepoFile("src/components/ui/settings/CustomColorPicker.tsx");
    assert.ok(settingsColorPicker.includes("parseLiveHexInput"));
    assert.ok(settingsColorPicker.includes("maxLength={7}"));

    console.log("ALL BATCH HIGH FIX VERIFICATIONS PASSED");
  } finally {
    await loader.close();
  }
}

runTests().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
