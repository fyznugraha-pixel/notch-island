import fs from "node:fs";
import path from "node:path";
import module from "node:module";
import assert from "node:assert/strict";
import ts from "typescript";

const ROOT = path.resolve("d:/kerjaan/projek-ndiri/island");

// In-memory mocks for Browser & Tauri runtime
const localStorageMap = new Map();
globalThis.localStorage = {
  getItem: (k) => (localStorageMap.has(k) ? localStorageMap.get(k) : null),
  setItem: (k, v) => {
    localStorageMap.set(k, String(v));
  },
  removeItem: (k) => {
    localStorageMap.delete(k);
  },
  clear: () => localStorageMap.clear(),
  key: (i) => Array.from(localStorageMap.keys())[i] ?? null,
  get length() {
    return localStorageMap.size;
  },
};

const dispatchedEvents = [];
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: (ev) => dispatchedEvents.push(ev),
  location: { reload: () => {} },
};
Object.defineProperty(globalThis, "navigator", {
  value: { language: "en-US" },
  configurable: true,
});

// Tauri mocks
const storeData = new Map();
const diskStoreData = new Map();
const invokeCalls = [];
const emitCalls = [];
const registeredShortcuts = new Map();

class MockBroadcastChannel {
  constructor(name) {
    this.name = name;
  }
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
}
globalThis.BroadcastChannel = MockBroadcastChannel;

// Register synchronous module hooks to resolve TS imports & mock @tauri-apps/*
module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@tauri-apps/")) {
      return { shortCircuit: true, url: `mock://${specifier}` };
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file://")) {
      const parentDir = path.dirname(new URL(context.parentURL).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
      const base = path.resolve(parentDir, specifier);
      for (const ext of ["", ".ts", ".tsx"]) {
        const candidate = base + ext;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return { shortCircuit: true, url: new URL(`file:///${candidate.replace(/\\/g, "/")}`).href };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "mock://@tauri-apps/plugin-store") {
      return {
        shortCircuit: true,
        format: "module",
        source: `
          export class Store {
            async get(k) { return globalThis.__MOCK_STORE_GET(k); }
            async set(k, v) { return globalThis.__MOCK_STORE_SET(k, v); }
            async delete(k) { return globalThis.__MOCK_STORE_DEL(k); }
            async save() { return globalThis.__MOCK_STORE_SAVE(); }
          }
          export async function load() { return new Store(); }
        `,
      };
    }
    if (url === "mock://@tauri-apps/api/core") {
      return {
        shortCircuit: true,
        format: "module",
        source: `
          export async function invoke(cmd, args) {
            return globalThis.__MOCK_INVOKE(cmd, args);
          }
        `,
      };
    }
    if (url === "mock://@tauri-apps/api/event") {
      return {
        shortCircuit: true,
        format: "module",
        source: `
          export async function emit(name, payload) {
            return globalThis.__MOCK_EMIT(name, payload);
          }
          export async function listen() { return () => {}; }
        `,
      };
    }
    if (url === "mock://@tauri-apps/plugin-global-shortcut") {
      return {
        shortCircuit: true,
        format: "module",
        source: `
          export async function register(shortcut, cb) {
            return globalThis.__MOCK_GS_REGISTER(shortcut, cb);
          }
          export async function unregister(shortcut) {
            return globalThis.__MOCK_GS_UNREGISTER(shortcut);
          }
          export async function unregisterAll() {
            return globalThis.__MOCK_GS_UNREGISTER_ALL();
          }
        `,
      };
    }
    if (url.startsWith("file://") && (url.endsWith(".ts") || url.endsWith(".tsx"))) {
      const filePath = new URL(url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
      const raw = fs.readFileSync(filePath, "utf8");
      const out = ts.transpileModule(raw, {
        fileName: filePath,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      });
      return { shortCircuit: true, format: "module", source: out.outputText };
    }
    return nextLoad(url, context);
  },
});

globalThis.__MOCK_STORE_GET = async (k) => storeData.get(k);
globalThis.__MOCK_STORE_SET = async (k, v) => {
  storeData.set(k, structuredClone(v));
};
globalThis.__MOCK_STORE_DEL = async (k) => {
  storeData.delete(k);
};
globalThis.__MOCK_STORE_SAVE = async () => {
  diskStoreData.clear();
  for (const [k, v] of storeData.entries()) {
    diskStoreData.set(k, structuredClone(v));
  }
};
globalThis.__MOCK_INVOKE = async (cmd, args) => {
  invokeCalls.push({ cmd, args });
  return null;
};
globalThis.__MOCK_EMIT = async (name, payload) => {
  emitCalls.push({ name, payload });
};
globalThis.__MOCK_GS_REGISTER = async (shortcut, cb) => {
  if (registeredShortcuts.has(shortcut)) {
    throw new Error(`Shortcut ${shortcut} already registered`);
  }
  registeredShortcuts.set(shortcut, cb);
};
globalThis.__MOCK_GS_UNREGISTER = async (shortcut) => {
  registeredShortcuts.delete(shortcut);
};
globalThis.__MOCK_GS_UNREGISTER_ALL = async () => {
  registeredShortcuts.clear();
};

const toUrl = (rel) => new URL(`file:///${path.join(ROOT, rel).replace(/\\/g, "/")}`).href;

const navbarSvc = await import(toUrl("src/services/navbarConfigService.ts"));
const tabSvc = await import(toUrl("src/services/tabConfigService.ts"));
const shortcutsSvc = await import(toUrl("src/services/shortcuts.ts"));
const resetSvc = await import(toUrl("src/services/settingsResetService.ts"));
const navbarColorUtils = await import(toUrl("src/components/settingsWindow/navbar/colorUtils.ts"));
const mainColorUtils = await import(toUrl("src/utils/colorUtils.ts"));
const i18nSvc = await import(toUrl("src/services/i18n.ts"));

const results = [];
function record(name, passed, details) {
  results.push({ name, passed, details });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}: ${details}`);
}

// ---------------------------------------------------------------------------
// TEST 1: saveNavbarConfig 250ms unawaited debounce -> stale settings.json
// overwrites localStorage and causes NavbarApp to read enabled: false!
// ---------------------------------------------------------------------------
{
  localStorageMap.clear();
  storeData.clear();
  diskStoreData.clear();

  // Existing disk settings has enabled: false
  const oldCfg = { ...navbarSvc.normalizeNavbarConfig(null), enabled: false };
  storeData.set("opt_navbar_config", structuredClone(oldCfg));
  storeData.set("opt_navbar_default_off_v5", true);
  storeData.set("opt_navbar_dual_monitor_all_v1", true);
  await globalThis.__MOCK_STORE_SAVE();

  // User enables taskbar and awaits saveNavbarConfig()
  const nextCfg = { ...oldCfg, enabled: true };
  await navbarSvc.saveNavbarConfig(nextCfg);

  // Immediately simulate NavbarApp mounting (before 250ms debounce fires)
  // or Settings window destroyed before 250ms -> storeData still has oldCfg
  const immediateStoreVal = storeData.get("opt_navbar_config");
  const loadedByNavbar = await navbarSvc.loadNavbarConfig();
  const localAfterLoad = JSON.parse(localStorage.getItem("island_navbar_config_v1"));

  const reproduced =
    immediateStoreVal.enabled === false &&
    loadedByNavbar.enabled === false &&
    localAfterLoad.enabled === false;

  record(
    "TEST-1A saveNavbarConfig unawaited 250ms debounce reverts enabled=true",
    reproduced,
    `storeAfterAwait.enabled=${immediateStoreVal.enabled}, loadNavbarConfig().enabled=${loadedByNavbar.enabled}, localStorageAfterLoad.enabled=${localAfterLoad.enabled}`
  );
  assert.equal(reproduced, true);
}

// ---------------------------------------------------------------------------
// TEST 1B: normalizeNavbarConfig opacity clamp (20..100) vs UI slider min=15
// and unvalidated customColor string
// ---------------------------------------------------------------------------
{
  const norm15 = navbarSvc.normalizeNavbarConfig({ opacity: 15 });
  const normBadColor = navbarSvc.normalizeNavbarConfig({ customColor: "not-a-color" });
  const normEmptyColor = navbarSvc.normalizeNavbarConfig({ customColor: "" });

  const reproduced =
    norm15.opacity === 20 &&
    normBadColor.customColor === "not-a-color" &&
    normEmptyColor.customColor === "";

  record(
    "TEST-1B normalizeNavbarConfig opacity=15 clamped to 20 & accepts invalid customColor",
    reproduced,
    `opacity(15)->${norm15.opacity}, customColor("not-a-color")->${JSON.stringify(normBadColor.customColor)}, customColor("")->${JSON.stringify(normEmptyColor.customColor)}`
  );
  assert.equal(reproduced, true);
}

// ---------------------------------------------------------------------------
// TEST 1C: loadNavbarConfig overwrites enabled=true from localStorage when
// settings.json lost opt_navbar_default_off_v5 despite localStorage migrated
// ---------------------------------------------------------------------------
{
  localStorageMap.clear();
  storeData.clear();

  localStorage.setItem(
    "island_navbar_config_v1",
    JSON.stringify({ ...navbarSvc.normalizeNavbarConfig(null), enabled: true, hideWindowsTaskbar: true })
  );
  localStorage.setItem("island_navbar_default_off_v5", "true");
  localStorage.setItem("island_navbar_dual_monitor_all_v1", "true");

  // settings.json is empty/partial (e.g. recreated after corruption)
  const loaded = await navbarSvc.loadNavbarConfig();
  const reproduced = loaded.enabled === false && loaded.hideWindowsTaskbar === false;

  record(
    "TEST-1C loadNavbarConfig ignores localStorage migration flag and disables enabled dock",
    reproduced,
    `loaded.enabled=${loaded.enabled}, loaded.hideWindowsTaskbar=${loaded.hideWindowsTaskbar}`
  );
  assert.equal(reproduced, true);
}

// ---------------------------------------------------------------------------
// TEST 2A: tabConfigService.resolvePreferredOpenTab ignores preventAutoOpenMedia
// when tabExpired === true
// ---------------------------------------------------------------------------
{
  const resolved = tabSvc.resolvePreferredOpenTab({
    currentTabs: ["media_expanded", "quick_control", "todo"],
    openBehavior: "remember_last",
    preventAutoOpenMedia: true,
    isMusicActive: true,
    hasMediaTrack: true,
    tabExpired: true,
    lastActiveTab: "todo",
    hasActiveAiStream: false,
  });

  const reproduced = resolved === "media_expanded";
  record(
    "TEST-2A resolvePreferredOpenTab opens media_expanded on tabExpired even with preventAutoOpenMedia=true",
    reproduced,
    `resolved=${resolved} (expected quick_control when preventAutoOpenMedia=true)`
  );
  assert.equal(reproduced, true);
}

// ---------------------------------------------------------------------------
// TEST 3A: shortcuts.ts applyAll silently unregisters earlier action on
// duplicate shortcut and reports BOTH as "ok"
// ---------------------------------------------------------------------------
{
  registeredShortcuts.clear();
  const fired = [];
  const dupMap = {
    ...shortcutsSvc.DEFAULT_SHORTCUTS,
    quick_task: "Control+Alt+A",
    open_ai_chat: "Control+Alt+A",
  };
  const statuses = await shortcutsSvc.shortcutManager.applyAll(dupMap, true, {
    quick_task: () => fired.push("quick_task"),
    open_ai_chat: () => fired.push("open_ai_chat"),
  });

  // Trigger the OS callback registered for Control+Alt+A
  const activeCb = registeredShortcuts.get("Control+Alt+A");
  if (activeCb) activeCb({ state: "Pressed" });

  const reproduced =
    statuses.quick_task === "ok" &&
    statuses.open_ai_chat === "ok" &&
    fired.length === 1 &&
    fired[0] === "open_ai_chat";

  record(
    "TEST-3A shortcutManager.applyAll masks duplicate shortcut & steals handler",
    reproduced,
    `statuses.quick_task=${statuses.quick_task}, statuses.open_ai_chat=${statuses.open_ai_chat}, fired=${JSON.stringify(fired)}`
  );
  assert.equal(reproduced, true);
}

// ---------------------------------------------------------------------------
// TEST 4A: resetAllAppSettings leaves AI settings, notification DND/muted,
// navbar presets/pinned order, caches, and never invokes sync_autostart_state
// ---------------------------------------------------------------------------
{
  localStorageMap.clear();
  storeData.clear();
  invokeCalls.length = 0;

  const shouldHaveBeenResetOrMissing = [
    "island_dnd_enabled",
    "island_muted_notification_apps",
    "island_ai_active_provider_v1",
    "island_ai_base_urls_v1",
    "island_ai_usage_stats_v1",
    "island_ai_custom_models_v1",
    "island_ai_unavailable_models_v1",
    "island_ai_active_model_v1_openai",
    "island_ai_registered_models_v2_openai",
    "island_ai_auto_cleanup_days_v1",
    "island_gemini_api_mode_v1",
    "gili_prayer_schedule_cache_v1",
    "gili_user_navbar_presets_v1",
    "gili_navbar_app_order_v1",
    "island_settings_sidebar_collapsed",
    "gili_lyrics_share_prefs_v1",
    "island_last_seen_version",
  ];
  for (const k of shouldHaveBeenResetOrMissing) {
    localStorage.setItem(k, JSON.stringify({ test: true }));
  }
  // Also populate wrong key names that resetAllAppSettings checks
  localStorage.setItem("island_theme", "light");
  storeData.set("opt_autostart", false);
  storeData.set("autostart_initialized", true);
  storeData.set("opt_navbar_dual_monitor_all_v1", true);

  await resetSvc.resetAllAppSettings();

  const remaining = shouldHaveBeenResetOrMissing.filter((k) => localStorage.getItem(k) !== null);
  const autostartInvoked = invokeCalls.some((c) => c.cmd === "sync_autostart_state");
  const dualMonStoreRemaining = storeData.get("opt_navbar_dual_monitor_all_v1");

  const reproduced = remaining.length === shouldHaveBeenResetOrMissing.length && !autostartInvoked && dualMonStoreRemaining === true;
  record(
    `TEST-4A resetAllAppSettings misses ${shouldHaveBeenResetOrMissing.length} keys & skips sync_autostart_state`,
    reproduced,
    `remainingCount=${remaining.length}/${shouldHaveBeenResetOrMissing.length} (${remaining.slice(0, 5).join(",")}...), autostartInvoked=${autostartInvoked}, dualMonStoreRemaining=${dualMonStoreRemaining}`
  );
  assert.equal(reproduced, true);
}

// ---------------------------------------------------------------------------
// TEST 1D: saveNavbarConfig fires redundant multi-channel broadcasts per call
// ---------------------------------------------------------------------------
{
  invokeCalls.length = 0;
  emitCalls.length = 0;
  dispatchedEvents.length = 0;
  await navbarSvc.saveNavbarConfig(navbarSvc.normalizeNavbarConfig(null));
  const broadcastInvokes = invokeCalls.filter((c) => c.cmd === "broadcast_navbar_config_update").length;
  const tauriEmits = emitCalls.filter((e) => e.name === "navbar_config_updated" || e.name === "gili-navbar-config-sync").length;
  const domDispatches = dispatchedEvents.filter((e) => e.type === "gili-navbar-config-sync").length;
  const reproduced = broadcastInvokes === 1 && tauriEmits === 2 && domDispatches === 1;
  record(
    "TEST-1D saveNavbarConfig emits redundant sync events across 4 channels",
    reproduced,
    `broadcast_navbar_config_update=${broadcastInvokes}, tauriEmits=${tauriEmits}, domEvents=${domDispatches} (+ BroadcastChannel + storage)`
  );
  assert.equal(reproduced, true);
}

// ---------------------------------------------------------------------------
// TEST 5A: CustomColorPicker typing 6-digit hex starting with 3 valid hex digits
// ("ff0000") auto-expands on 3rd char ("fff" -> "#ffffff"), hitting maxLength=6
// ---------------------------------------------------------------------------
{
  let parentValue = "#0f172a";
  let hexInput = parentValue;
  const maxLength = 6;

  function simulateUserTypeChar(ch) {
    const displayed = hexInput.replace(/^#/, "");
    if (displayed.length >= maxLength) return false; // browser maxLength=6 blocks further typing!
    const nextRaw = `#${displayed}${ch}`;
    hexInput = nextRaw;
    if (mainColorUtils.isValidHex(nextRaw.trim())) {
      const normalized = mainColorUtils.normalizeHex(nextRaw.trim());
      parentValue = normalized;
      // useEffect([currentHex]) runs:
      hexInput = parentValue;
    }
    return true;
  }

  // User cleared box and types "f", "f", "f", "0", "0", "0" (or "ff0000")
  hexInput = "";
  const typedResults = [
    simulateUserTypeChar("f"),
    simulateUserTypeChar("f"),
    simulateUserTypeChar("0"),
    simulateUserTypeChar("0"),
    simulateUserTypeChar("0"),
    simulateUserTypeChar("0"),
  ];
  // After typing "ff0", isValidHex("#ff0") is true -> normalized "#ffff00" (6 chars), blocking last 3 zeroes!
  const reproduced = parentValue === "#ffff00" && typedResults[3] === false && hexInput === "#ffff00";
  record(
    "TEST-5A CustomColorPicker auto-expands 3-char prefix on 3rd keystroke & blocks 6-digit input",
    reproduced,
    `typing "ff0000" stopped at "${hexInput}" (accepted=[${typedResults.join(",")}])`
  );
  assert.equal(reproduced, true);
}

// ---------------------------------------------------------------------------
// TEST 5B: navbar/colorUtils.normalizeHex fails on malformed inputs &
// hexToHsl loses hue on achromatic colors
// ---------------------------------------------------------------------------
{
  const bad = navbarColorUtils.normalizeHex("not-hex");
  const empty = navbarColorUtils.normalizeHex("");
  const lostHue = mainColorUtils.hexToHsl(mainColorUtils.hslToHex(220, 0, 50));

  const reproduced = bad === "#not-hex" && empty === "#" && lostHue.h === 0;
  record(
    "TEST-5B navbar/colorUtils.normalizeHex corrupts invalid hex & hexToHsl resets Hue=0 on s=0",
    reproduced,
    `normalizeHex("not-hex")="${bad}", normalizeHex("")="${empty}", hexToHsl(hslToHex(220,0,50)).h=${lostHue.h}`
  );
  assert.equal(reproduced, true);
}

// ---------------------------------------------------------------------------
// TEST 6: i18n key check across all scoped T09 files
// ---------------------------------------------------------------------------
{
  const scopedFiles = [
    "src/components/settingsWindow/SettingsWindowApp.tsx",
    "src/components/settingsWindow/SettingsSidebar.tsx",
    "src/components/settingsWindow/TabsManagerView.tsx",
    "src/components/settingsWindow/AboutView.tsx",
    "src/components/settingsWindow/SupportView.tsx",
    "src/components/ui/SettingsPanel.tsx",
    "src/components/ui/WeatherLocationSetting.tsx",
    "src/components/ui/settings/AdvancedTab.tsx",
    "src/components/ui/settings/AppearanceTab.tsx",
    "src/components/ui/settings/CustomColorPicker.tsx",
    "src/components/ui/settings/GeneralTab.tsx",
    "src/components/ui/settings/IdleTab.tsx",
    "src/components/ui/settings/KeyboardShortcutsCard.tsx",
    "src/components/ui/settings/ModulesTab.tsx",
    "src/components/ui/settings/MonitorSelector.tsx",
    "src/components/ui/settings/NotchPositionPreviewSelector.tsx",
    "src/components/ui/settings/NotifSoundPicker.tsx",
    "src/components/ui/settings/SearchResults.tsx",
    "src/components/ui/settings/SettingRow.tsx",
    "src/components/ui/settings/SettingsSubnav.tsx",
    "src/components/ui/settings/TransparencyControlSection.tsx",
    "src/components/ui/settings/WindowsBannerRow.tsx",
  ];
  const missingKeys = [];
  const callRe = /\b(?:t|tr)\(\s*["']([a-zA-Z0-9_]+)["']/g;
  for (const rel of scopedFiles) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    let m;
    while ((m = callRe.exec(src)) !== null) {
      const key = m[1];
      if (!(key in i18nSvc.translations)) {
        missingKeys.push(`${rel}:${key}`);
      }
    }
  }
  record(
    "TEST-6 i18n keys check in scoped T09 UI files",
    missingKeys.length === 0,
    `missingKeys=${JSON.stringify(missingKeys)}`
  );
  assert.equal(missingKeys.length, 0);
}

console.log(`\nALL ${results.length} CHECKS COMPLETED.`);
