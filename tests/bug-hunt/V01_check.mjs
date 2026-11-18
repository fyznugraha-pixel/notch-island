import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// In-memory mocks for Tauri APIs, localStorage, and window globals
const mockState = {
  localStorageMap: new Map(),
  storeData: new Map(),
  invokeHandler: async () => {
    throw new Error("No invokeHandler configured");
  },
  eventListeners: new Map(),
  windowListeners: new Map(),
};

globalThis.localStorage = {
  get length() {
    return mockState.localStorageMap.size;
  },
  key(i) {
    return Array.from(mockState.localStorageMap.keys())[i] ?? null;
  },
  getItem(k) {
    return mockState.localStorageMap.has(k) ? mockState.localStorageMap.get(k) : null;
  },
  setItem(k, v) {
    mockState.localStorageMap.set(String(k), String(v));
  },
  removeItem(k) {
    mockState.localStorageMap.delete(String(k));
  },
  clear() {
    mockState.localStorageMap.clear();
  },
};

globalThis.window = {
  __TAURI_INTERNALS__: { metadata: { currentWindow: { label: "main" } } },
  addEventListener(type, fn) {
    if (!mockState.windowListeners.has(type)) mockState.windowListeners.set(type, []);
    mockState.windowListeners.get(type).push(fn);
  },
  removeEventListener(type, fn) {
    const arr = mockState.windowListeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx !== -1) arr.splice(idx, 1);
  },
  dispatchEvent(ev) {
    const arr = [...(mockState.windowListeners.get(ev.type) || [])];
    for (const fn of arr) {
      fn(ev);
    }
    return !ev.defaultPrevented;
  },
};

function createFakeStore(file) {
  if (!mockState.storeData.has(file)) mockState.storeData.set(file, new Map());
  const map = mockState.storeData.get(file);
  return {
    async get(k) {
      return map.get(k);
    },
    async set(k, v) {
      map.set(k, v);
    },
    delete(k) {
      return map.delete(k);
    },
    async save() {},
  };
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@tauri-apps/api/core") {
      return { url: "mock:tauri-core", shortCircuit: true };
    }
    if (specifier === "@tauri-apps/api/event") {
      return { url: "mock:tauri-event", shortCircuit: true };
    }
    if (specifier === "@tauri-apps/plugin-store") {
      return { url: "mock:tauri-store", shortCircuit: true };
    }
    if (
      context.parentURL?.startsWith("file://") &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !path.extname(specifier)
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const tsPath = path.resolve(parentDir, `${specifier}.ts`);
      if (fs.existsSync(tsPath)) {
        return { url: pathToFileURL(tsPath).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "mock:tauri-core") {
      return {
        format: "module",
        shortCircuit: true,
        source: `export async function invoke(cmd, args) { return globalThis.__MOCK_INVOKE__(cmd, args); }`,
      };
    }
    if (url === "mock:tauri-event") {
      return {
        format: "module",
        shortCircuit: true,
        source: `export async function listen(event, cb) { return globalThis.__MOCK_LISTEN__(event, cb); }`,
      };
    }
    if (url === "mock:tauri-store") {
      return {
        format: "module",
        shortCircuit: true,
        source: `export async function load(file) { return globalThis.__MOCK_STORE_LOAD__(file); }`,
      };
    }
    return nextLoad(url, context);
  },
});

globalThis.__MOCK_INVOKE__ = (cmd, args) => mockState.invokeHandler(cmd, args);
globalThis.__MOCK_LISTEN__ = (event, cb) => {
  if (!mockState.eventListeners.has(event)) mockState.eventListeners.set(event, []);
  mockState.eventListeners.get(event).push(cb);
  return () => {
    const arr = mockState.eventListeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(cb);
    if (idx !== -1) arr.splice(idx, 1);
  };
};
globalThis.__MOCK_STORE_LOAD__ = (file) => createFakeStore(file);

const results = [];
async function runCheck(id, fn) {
  try {
    const detail = await fn();
    results.push({ id, status: "PASS", detail });
  } catch (err) {
    results.push({ id, status: "FAIL", detail: err?.stack || String(err) });
  }
}

// 1. T01-01: UTF-8 byte length of " • "
await runCheck("T01-01", async () => {
  const sep = " • ";
  const buf = Buffer.from(sep, "utf8");
  assert.equal(buf.length, 5, "Separator ' • ' should be 5 bytes in UTF-8");
  const sample = "Judul Lagu • Nama Artis";
  const sampleBuf = Buffer.from(sample, "utf8");
  const idx = sampleBuf.indexOf(buf);
  assert.ok(idx > 0);
  // Byte at idx + 3 is 0xA2 (continuation byte of U+2022 '•' = E2 80 A2), NOT a UTF-8 char boundary
  const byteAtPlus3 = sampleBuf[idx + 3];
  assert.equal(byteAtPlus3, 0xa2);
  assert.equal((byteAtPlus3 & 0b1100_0000) === 0b1000_0000, true, "idx+3 is UTF-8 continuation byte");
  const rustSrc = fs.readFileSync(path.join(ROOT, "src-tauri/src/lib.rs"), "utf8");
  assert.match(rustSrc, /else if let Some\(idx\) = title\.rfind\(" • "\)\s*\{\s*artist = title\[idx \+ 3\.\.\]/);
  return `buf.length=${buf.length}, byte[idx+3]=0x${byteAtPlus3.toString(16)} (continuation byte inside '•')`;
});

// 2. T01-04: Integer overflow arithmetic i32/u32 width * height * 4
await runCheck("T01-04", async () => {
  const toI32 = (n) => n | 0;
  const toU32 = (n) => n >>> 0;
  // capture_hwnd_to_rgba: i32 width=32768, height=16384 -> i32 overflow negative -> sign-extended usize
  const w1 = 32768;
  const h1 = 16384;
  const prod1I32 = toI32(toI32(w1 * h1) * 4);
  assert.equal(prod1I32, -2147483648);
  // capture_hwnd_to_rgba: i32 width=32768, height=32768 -> i32 overflow wraps to 0
  const w2 = 32768;
  const h2 = 32768;
  const prod2I32 = toI32(toI32(w2 * h2) * 4);
  assert.equal(prod2I32, 0);
  // read_clipboard_image: u32 width=65536, height=16384 -> u32 wraps to 0
  const prodU32 = toU32(toU32(65536 * 16384) * 4);
  assert.equal(prodU32, 0);
  const rustSrc = fs.readFileSync(path.join(ROOT, "src-tauri/src/lib.rs"), "utf8");
  assert.match(rustSrc, /if rgba\.len\(\) != \(width \* height \* 4\) as usize/);
  assert.match(rustSrc, /let mut bgra_data = vec!\[0u8; \(width \* height \* 4\) as usize\];/);
  assert.match(rustSrc, /let bytes = match std::fs::read\(path\) \{[\s\S]*?if bytes\.len\(\) > 15 \* 1024 \* 1024/);
  return `i32(32768*16384*4)=${prod1I32}, i32(32768*32768*4)=${prod2I32}, u32(65536*16384*4)=${prodU32}`;
});

// 3. T01-06: tauri.conf.json & capabilities/default.json
await runCheck("T01-06", async () => {
  const conf = JSON.parse(fs.readFileSync(path.join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));
  const cap = JSON.parse(fs.readFileSync(path.join(ROOT, "src-tauri/capabilities/default.json"), "utf8"));
  assert.equal(conf.app.security.assetProtocol.enable, true);
  assert.deepEqual(conf.app.security.assetProtocol.scope, ["**"]);
  assert.ok(conf.app.security.csp["connect-src"].includes("http:"));
  assert.ok(conf.app.security.csp["img-src"].includes("http:"));
  assert.ok(conf.app.security.csp["media-src"].includes("http:"));
  assert.equal(cap.windows.length, 16);
  assert.ok(cap.permissions.includes("core:window:allow-destroy"));
  assert.ok(cap.permissions.includes("clipboard-manager:allow-read-text"));
  assert.ok(cap.permissions.includes("global-shortcut:allow-register"));
  return `assetProtocol.scope=${JSON.stringify(conf.app.security.assetProtocol.scope)}, windows=${cap.windows.length}, permissions=${cap.permissions.length}`;
});

// 4. T02-01 & T02-02: gili-free-proxy & giliFreeService.ts
await runCheck("T02-01_T02-02", async () => {
  const giliFreeMod = await import(pathToFileURL(path.join(ROOT, "src/services/giliFreeService.ts")).href);
  const proxyMod = await import(pathToFileURL(path.join(ROOT, "gili-free-proxy/src/index.ts")).href);

  // (a) Regenerating install ID by clearing localStorage
  mockState.localStorageMap.clear();
  const id1 = giliFreeMod.getInstallId();
  localStorage.removeItem("gili_install_id_v1");
  const id2 = giliFreeMod.getInstallId();
  assert.notEqual(id1, id2);

  // (b) Proxy worker with fake D1 in-memory DB + stubbed upstream fetch
  const usage = new Map();
  const fakeDb = {
    prepare(sql) {
      return {
        bind(...params) {
          return { sql, params };
        },
      };
    },
    async batch(stmts) {
      return stmts.map(({ sql, params }) => {
        if (sql.includes("ON CONFLICT (subject, day) DO UPDATE SET count = count + 1 WHERE usage.count < ?")) {
          const [subject, day, limit] = params;
          const k = `${subject}|${day}`;
          const cur = usage.get(k) || 0;
          if (cur < limit) {
            usage.set(k, cur + 1);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        if (sql.includes("MAX(0, count - 1)")) {
          const [subject, day] = params;
          const k = `${subject}|${day}`;
          usage.set(k, Math.max(0, (usage.get(k) || 0) - 1));
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      });
    },
  };

  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

  try {
    const env = {
      DB: fakeDb,
      GEMINI_API_KEY: "[REDACTED]",
      GEMINI_MODEL: "gemini-flash-lite-latest",
      DAILY_LIMIT_PER_INSTALL: "15",
      DAILY_LIMIT_PER_IP: "60",
      MAX_OUTPUT_TOKENS: "1024",
    };
    const ctx = { waitUntil() {} };

    // Test OPTIONS CORS wildcard
    const optRes = await proxyMod.default.fetch(
      new Request("https://proxy.example/v1/chat/completions", {
        method: "OPTIONS",
        headers: { Origin: "https://evil-third-party.example" },
      }),
      env,
      ctx
    );
    assert.equal(optRes.status, 204);
    assert.equal(optRes.headers.get("Access-Control-Allow-Origin"), "*");

    // Test invalid-looking dash-only Install ID "----------------"
    const dashId = "----------------";
    const postRes = await proxyMod.default.fetch(
      new Request("https://proxy.example/v1/chat/completions", {
        method: "POST",
        headers: {
          Origin: "https://evil-third-party.example",
          "Content-Type": "application/json",
          "X-Gili-Install-Id": dashId,
          // intentionally no CF-Connecting-IP
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      }),
      env,
      ctx
    );
    assert.equal(postRes.status, 200);
    assert.equal(postRes.headers.get("Access-Control-Allow-Origin"), "*");

    // Exhaust 15 on id1, then verify id2 bypasses per-install limit from same IP
    for (let i = 0; i < 15; i++) {
      const r = await proxyMod.default.fetch(
        new Request("https://proxy.example/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Gili-Install-Id": id1,
            "CF-Connecting-IP": "203.0.113.10",
          },
          body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
        }),
        env,
        ctx
      );
      assert.equal(r.status, 200);
    }
    const blocked16 = await proxyMod.default.fetch(
      new Request("https://proxy.example/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gili-Install-Id": id1,
          "CF-Connecting-IP": "203.0.113.10",
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      }),
      env,
      ctx
    );
    assert.equal(blocked16.status, 429);

    const bypassWithNewId = await proxyMod.default.fetch(
      new Request("https://proxy.example/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gili-Install-Id": id2,
          "CF-Connecting-IP": "203.0.113.10",
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      }),
      env,
      ctx
    );
    assert.equal(bypassWithNewId.status, 200);
    return `dashId=${postRes.status}, CORS=${postRes.headers.get("Access-Control-Allow-Origin")}, id1_16th=${blocked16.status}, id2_after_reset=${bypassWithNewId.status}`;
  } finally {
    globalThis.fetch = origFetch;
  }
});

// 5. T02-07: aiCredentialService.ts swallows CredWriteW failure & deletes legacy keys
await runCheck("T02-07", async () => {
  mockState.localStorageMap.clear();
  mockState.storeData.clear();

  localStorage.setItem("island_ai_api_keys_v1", JSON.stringify({ openai: "[REDACTED_KEY_1]" }));
  localStorage.setItem("_sec_k_claude", "[REDACTED_KEY_2]");
  localStorage.setItem("island_ai_model_keys_v1", JSON.stringify({ "gpt-4o": "[REDACTED_MODEL_KEY]" }));

  const settingsStore = createFakeStore("settings.json");
  await settingsStore.set("ai_provider_keys", { gemini: "[REDACTED_KEY_3]" });
  await settingsStore.set("ai_model_keys", { "claude-3-5": "[REDACTED_MODEL_KEY_2]" });

  mockState.invokeHandler = async (cmd) => {
    if (cmd === "save_secure_ai_key" || cmd === "save_secure_ai_model_key") {
      throw new Error("Failed to save credential in Windows Credential Manager (os error: 87)");
    }
    if (cmd === "get_secure_ai_key") return "";
    return null;
  };

  const credMod = await import(pathToFileURL(path.join(ROOT, "src/services/aiCredentialService.ts")).href);
  const origWarn = console.warn;
  const warnings = [];
  console.warn = (...a) => warnings.push(a.join(" "));
  let count;
  try {
    count = await credMod.migrateLegacyPlaintextKeys();
  } finally {
    console.warn = origWarn;
  }

  // Wait a tick for cleanLegacyKeyStorage fire-and-forget promise
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(count, 5, "Reported 5 migrated even though all CredWriteW calls rejected");
  assert.equal(localStorage.getItem("island_ai_api_keys_v1"), null);
  assert.equal(localStorage.getItem("_sec_k_claude"), null);
  assert.equal(localStorage.getItem("island_ai_model_keys_v1"), null);
  assert.equal(await settingsStore.get("ai_provider_keys"), undefined);
  assert.equal(await settingsStore.get("ai_model_keys"), undefined);
  assert.ok(warnings.length >= 5);
  return `migratedCount=${count} despite ${warnings.length} save rejections; all legacy storages wiped`;
});

// 6. T02-10: aiHttp.ts skips URL validation & forwards unredacted URL in stream error
await runCheck("T02-10", async () => {
  const invokedCalls = [];
  mockState.eventListeners.clear();
  mockState.invokeHandler = async (cmd, args) => {
    invokedCalls.push({ cmd, args });
    if (cmd === "ai_http_request") {
      return { status: 200, ok: true, body: "ami-id" };
    }
    if (cmd === "ai_http_stream") {
      const sid = args.streamId;
      const errListeners = mockState.eventListeners.get(`ai-stream-error:${sid}`) || [];
      setTimeout(() => {
        for (const cb of errListeners) {
          cb({ payload: `Network error: ${args.url}: connection failed` });
        }
      }, 5);
      return null;
    }
    return null;
  };

  const aiHttp = await import(pathToFileURL(path.join(ROOT, "src/services/aiHttp.ts")).href);
  const ssrfRes = await aiHttp.aiFetch("http://169.254.169.254/latest/meta-data/", {
    headers: { Authorization: "Bearer [REDACTED]" },
  });
  assert.equal(ssrfRes.status, 200);
  assert.equal(invokedCalls[0].cmd, "ai_http_request");
  assert.equal(invokedCalls[0].args.url, "http://169.254.169.254/latest/meta-data/");

  const secretToken = "FAKE_SECRET_QUERY_TOKEN_12345";
  const secretUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini:streamGenerateContent?alt=sse&key=${secretToken}`;
  let caughtErr = "";
  try {
    await aiHttp.streamAiRequest({
      url: secretUrl,
      onChunk: () => {},
    });
  } catch (err) {
    caughtErr = err.message;
  }
  assert.ok(caughtErr.includes(secretToken), "Error message leaked raw query key from URL");
  return `aiFetch forwarded http://169.254.169.254; streamAiRequest threw error containing raw ?key param`;
});

// 7. T06-01: Listener registration order on window for Escape in TaskbarFlyoutApp vs QuickSettingsView
await runCheck("T06-01", async () => {
  mockState.windowListeners.clear();
  const actions = [];
  let activeSubmenu = "wifi";

  // Parent TaskbarFlyoutApp mounts first (TaskbarFlyoutApp.tsx:402-425)
  const parentKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      actions.push("invoke:close_taskbar_flyout");
      return;
    }
  };
  window.addEventListener("keydown", parentKeyDown);

  // Child QuickSettingsView mounts later (QuickSettingsView.tsx:396-408)
  const childKeyDown = (e) => {
    if (e.key === "Escape") {
      if (activeSubmenu) {
        e.preventDefault();
        activeSubmenu = null;
        actions.push("setActiveSubmenu(null)");
      } else {
        e.preventDefault();
        actions.push("onClose");
      }
    }
  };
  window.addEventListener("keydown", childKeyDown);

  let defaultPrevented = false;
  window.dispatchEvent({
    type: "keydown",
    key: "Escape",
    preventDefault() {
      defaultPrevented = true;
    },
  });

  assert.equal(defaultPrevented, true);
  assert.deepEqual(actions, ["invoke:close_taskbar_flyout", "setActiveSubmenu(null)"]);
  return `Order of execution: ${actions.join(" -> ")}`;
});

// 8. T06-04: Window listener leak on pointercancel / unmount in SoundOutputMixerView
await runCheck("T06-04", async () => {
  mockState.windowListeners.clear();
  let isDraggingMaster = false;
  let draggingAppPid = null;

  // Exact pattern from SoundOutputMixerView.tsx:154-173 & 241-264
  const handleMasterPointerDown = () => {
    isDraggingMaster = true;
    const handlePointerMove = () => {};
    const handlePointerUp = () => {
      isDraggingMaster = false;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleAppPointerDown = (pid) => {
    draggingAppPid = pid;
    const handlePointerMove = () => {};
    const handlePointerUp = () => {
      draggingAppPid = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  handleMasterPointerDown();
  handleAppPointerDown(1234);
  // Trigger pointercancel instead of pointerup
  window.dispatchEvent({ type: "pointercancel" });

  assert.equal(isDraggingMaster, true);
  assert.equal(draggingAppPid, 1234);
  assert.equal(mockState.windowListeners.get("pointermove").length, 2);
  assert.equal(mockState.windowListeners.get("pointerup").length, 2);
  return `After pointercancel: isDraggingMaster=${isDraggingMaster}, draggingAppPid=${draggingAppPid}, leaked pointermove=${mockState.windowListeners.get("pointermove").length}, pointerup=${mockState.windowListeners.get("pointerup").length}`;
});

// 9. T07-01: Alias collision systemIcons -> output_audio, clockDate -> jam_dunia
await runCheck("T07-01", async () => {
  const { MODULE_ID_ALIASES } = await import(
    pathToFileURL(path.join(ROOT, "src/modules/moduleAliases.ts")).href
  );
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/modules/modules.catalog.json"), "utf8")
  );
  const defaultModules = [
    { id: "startSearch", group: 1, enabled: true, view: "compact" },
    { id: "pinnedApps", group: 2, enabled: true, view: "compact" },
    { id: "runningApps", group: 2, enabled: true, view: "compact" },
    { id: "hiddenTray", group: 3, enabled: true, view: "compact" },
    { id: "systemIcons", group: 3, enabled: true, view: "compact" },
    { id: "notifications", group: 3, enabled: true, view: "compact" },
    { id: "clockDate", group: 3, enabled: true, view: "compact" },
  ];

  assert.equal(MODULE_ID_ALIASES["systemIcons"], "output_audio");
  assert.equal(MODULE_ID_ALIASES["clockDate"], "jam_dunia");

  // Replicate NavbarSettingsTab.tsx:88-113 handleAddModule
  const simulateHandleAddModule = (modules, moduleId, preferredView = "full") => {
    const targetCanonical = MODULE_ID_ALIASES[moduleId] || moduleId;
    const existingIndex = modules.findIndex(
      (m) => (MODULE_ID_ALIASES[m.id] || m.id) === targetCanonical
    );
    if (existingIndex !== -1) {
      return modules.map((m, idx) =>
        idx === existingIndex ? { ...m, view: preferredView, enabled: true } : m
      );
    }
    return [...modules, { id: moduleId, group: 3, enabled: true, view: preferredView }];
  };

  const afterAddOutputAudio = simulateHandleAddModule(defaultModules, "output_audio", "full");
  assert.equal(afterAddOutputAudio.length, defaultModules.length);
  assert.equal(afterAddOutputAudio.some((m) => m.id === "output_audio"), false);
  assert.equal(afterAddOutputAudio.find((m) => m.id === "systemIcons").view, "full");

  const afterAddJamDunia = simulateHandleAddModule(defaultModules, "jam_dunia", "full");
  assert.equal(afterAddJamDunia.length, defaultModules.length);
  assert.equal(afterAddJamDunia.some((m) => m.id === "jam_dunia"), false);
  assert.equal(afterAddJamDunia.find((m) => m.id === "clockDate").view, "full");

  // Replicate registry.ts:47-55 getNavbarModuleById
  const getById = (id) => {
    const canonicalId = MODULE_ID_ALIASES[id] || id;
    return catalog.find((m) => m.id === canonicalId || m.id === id);
  };
  assert.equal(getById("systemIcons")?.id, "output_audio");
  assert.equal(getById("clockDate")?.id, "jam_dunia");

  return `output_audio blocked & mutated systemIcons.view='full'; jam_dunia blocked & mutated clockDate.view='full'`;
});

// 10. T07-02: master-volume-changed payload mismatch
await runCheck("T07-02", async () => {
  let mixerMasterVol = 0; // initial from get_master_volume
  let audioOutMasterVol = 0;

  // Exact listener logic from MixerNavbarModule.tsx:67-73 and 296-302
  const mixerListener = (ev) => {
    if (typeof ev.payload === "number") {
      mixerMasterVol = ev.payload <= 1 ? Math.round(ev.payload * 100) : Math.round(ev.payload);
    }
  };
  const audioOutListener = (ev) => {
    if (typeof ev.payload === "number") {
      audioOutMasterVol = ev.payload <= 1 ? Math.round(ev.payload * 100) : Math.round(ev.payload);
    }
  };

  // Rust payload from src-tauri/src/lib.rs:5397-5405
  const rustPayload = { volume: 0.72, muted: false };
  mixerListener({ payload: rustPayload });
  audioOutListener({ payload: rustPayload });

  assert.equal(mixerMasterVol, 0);
  assert.equal(audioOutMasterVol, 0);
  return `Payload ${JSON.stringify(rustPayload)} ignored (typeof === '${typeof rustPayload}'); masterVol stayed ${mixerMasterVol}`;
});

// 11. T07-04: Stale closure in 30-minute interval on WeatherNavbarModule & AirQualityNavbarModule
await runCheck("T07-04", async () => {
  // Replicate WeatherNavbarModule.tsx:45-87 hook closure behavior
  let stateWeather = { city: "Bandung", temp: 24 };
  let scheduledCallback = null;

  const loadWeather = (targetCity) => {
    stateWeather = { city: targetCity, temp: targetCity === "Tokyo" ? 18 : 24 };
  };

  // Initial mount useEffect(..., []): captures weather?.city ("Bandung")
  (() => {
    const capturedCity = stateWeather?.city || "Bandung";
    loadWeather(capturedCity);
    scheduledCallback = () => loadWeather(capturedCity);
  })();

  // User changes city to Tokyo
  loadWeather("Tokyo");
  assert.equal(stateWeather.city, "Tokyo");

  // 30 minutes later interval fires
  scheduledCallback();
  assert.equal(stateWeather.city, "Bandung");
  return `After user changed city to Tokyo, 30-min interval callback overwrote state back to '${stateWeather.city}'`;
});

console.log(JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.status !== "PASS");
if (failed.length > 0) {
  process.exitCode = 1;
}
