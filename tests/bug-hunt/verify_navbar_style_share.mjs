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
    const shareService = await loader.loadModule("/src/services/navbarStyleShareService.ts");

    // 1. Encode -> decode round-trip preserves exact 15 style + visual effect keys
    const senderConfig = {
      enabled: true,
      shape: "anchored",
      position: "top",
      monitorId: "\\\\.\\DISPLAY2",
      cornerRadius: 22,
      distanceFromEdge: 18,
      taskbarHeight: 54,
      iconSize: 44,
      iconSpacing: "roomy",
      iconTheme: "neon",
      style: "liquid",
      background: "custom",
      customColor: "#1e1b4b",
      accent: "#a855f7",
      opacity: 72,
      blur: 80,
      autoHide: true,
      autoHideMode: "maxsize",
      windowAnimation: "normal",
      windowPreviews: false,
      magnify: false,
      appLabels: true,
      clock24h: false,
      hideWindowsTaskbar: true,
      useGiliStart: true,
      modules: [{ id: "pomodoro", group: 2, enabled: true, view: "full" }],
    };

    const code = shareService.encodeNavbarStyleCode(senderConfig, "Neon Ungu");
    assert.ok(code.startsWith("GILI-STYLE1:"), "share code must have GILI-STYLE1 prefix");

    const parsedCode = shareService.parseNavbarStyleShareInput(`  \`${code}\` \n`);
    assert.equal(parsedCode.name, "Neon Ungu");
    assert.equal(parsedCode.recognizedFields, 15);
    assert.deepEqual(parsedCode.style, {
      shape: "anchored",
      cornerRadius: 22,
      distanceFromEdge: 18,
      taskbarHeight: 54,
      iconSize: 44,
      iconSpacing: "roomy",
      style: "liquid",
      background: "custom",
      customColor: "#1e1b4b",
      accent: "#a855f7",
      opacity: 72,
      blur: 80,
      iconTheme: "neon",
      magnify: false,
      appLabels: true,
    });

    // Strict allowlist check: no non-style keys may appear in exported/imported patch
    for (const forbiddenKey of [
      "enabled",
      "position",
      "monitorId",
      "autoHide",
      "autoHideMode",
      "windowAnimation",
      "windowPreviews",
      "clock24h",
      "hideWindowsTaskbar",
      "useGiliStart",
      "modules",
    ]) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(parsedCode.style, forbiddenKey),
        false,
        `non-style key must be excluded: ${forbiddenKey}`
      );
    }

    // 2. .gilistyle JSON file round-trip & sanitization clamping
    const fileText = shareService.serializeNavbarStyleFile(senderConfig, "  Style Test \x07 ");
    const parsedFile = shareService.parseNavbarStyleShareInput(fileText);
    assert.equal(parsedFile.name, "Style Test");
    assert.deepEqual(parsedFile.style, parsedCode.style);

    const maliciousJson = JSON.stringify({
      format: "gili-taskbar-style",
      version: 1,
      style: {
        shape: "floating",
        cornerRadius: 999,
        distanceFromEdge: -20,
        taskbarHeight: 12,
        iconSize: 120,
        opacity: 3,
        blur: 200,
        style: "followNotch",
        background: "black",
        accent: "javascript:alert(1)",
        customColor: "not-a-color",
        iconTheme: "evil_theme",
        magnify: "yes",
        hideWindowsTaskbar: true,
        enabled: true,
        modules: [{ id: "../../bad" }],
      },
    });
    const sanitized = shareService.parseNavbarStyleShareInput(maliciousJson);
    assert.equal(sanitized.style.cornerRadius, 30);
    assert.equal(sanitized.style.distanceFromEdge, 0);
    assert.equal(sanitized.style.taskbarHeight, 36);
    assert.equal(sanitized.style.iconSize, 56);
    assert.equal(sanitized.style.opacity, 20);
    assert.equal(sanitized.style.blur, 100);
    assert.equal(sanitized.style.style, "followNotch");
    assert.equal(sanitized.style.background, "followNotch");
    assert.equal(sanitized.style.accent, "#3882f6");
    assert.equal(sanitized.style.iconTheme, "fluent");
    assert.equal("hideWindowsTaskbar" in sanitized.style, false);
    assert.equal("modules" in sanitized.style, false);

    // 3. Rejects empty, oversized, wrong version, and unrelated JSON
    assert.throws(() => shareService.parseNavbarStyleShareInput("   "), (e) => e.code === "EMPTY");
    assert.throws(
      () => shareService.parseNavbarStyleShareInput("a".repeat(70000)),
      (e) => e.code === "TOO_LARGE"
    );
    assert.throws(
      () =>
        shareService.parseNavbarStyleShareInput(
          JSON.stringify({ format: "gili-taskbar-style", version: 99, style: { shape: "floating", accent: "#000000" } })
        ),
      (e) => e.code === "UNSUPPORTED_VERSION"
    );
    assert.throws(
      () => shareService.parseNavbarStyleShareInput(JSON.stringify({ name: "pkg", dependencies: {} })),
      (e) => e.code === "NO_STYLE_FIELDS"
    );
    assert.throws(
      () => shareService.parseNavbarStyleShareInput("GILI-STYLE1:!!!not-base64!!!"),
      (e) => e.code === "INVALID_FORMAT"
    );

    // 4. UI wiring contract checks
    const settingsTab = readRepoFile("src/components/settingsWindow/navbar/NavbarSettingsTab.tsx");
    assert.ok(settingsTab.includes("NavbarStyleShareModal"));
    assert.ok(settingsTab.includes("setIsStyleShareOpen(true)"));

    const presetsModal = readRepoFile("src/components/settingsWindow/navbar/NavbarPresetsModal.tsx");
    assert.ok(presetsModal.includes("handleCopyPresetStyle"));

    const shareModal = readRepoFile("src/components/settingsWindow/navbar/NavbarStyleShareModal.tsx");
    assert.ok(shareModal.includes("NavbarStyleSummaryCard"));
    assert.ok(!shareModal.includes("h-8.5"), "Tailwind v3 requires standard spacing utility h-9, not h-8.5");

    console.log("NAVBAR STYLE SHARE VERIFICATION PASSED");
  } finally {
    await loader.close();
  }
}

runTests().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
