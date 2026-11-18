import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

// 1. Setup in-memory DOM / Browser / Tauri mocks BEFORE loading any src/ module
function createStorageMock() {
  const store = new Map();
  let throwQuotaWhenLenAtLeast = null;
  return {
    get length() {
      return store.size;
    },
    key(i) {
      return Array.from(store.keys())[i] ?? null;
    },
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      if (
        throwQuotaWhenLenAtLeast !== null &&
        k === "island_ai_conversations_v1"
      ) {
        try {
          const parsed = JSON.parse(String(v));
          if (Array.isArray(parsed) && parsed.length >= throwQuotaWhenLenAtLeast) {
            const err = new Error("QuotaExceededError");
            err.name = "QuotaExceededError";
            throw err;
          }
        } catch (e) {
          if (e && e.name === "QuotaExceededError") throw e;
        }
      }
      store.set(String(k), String(v));
    },
    removeItem(k) {
      store.delete(String(k));
    },
    clear() {
      store.clear();
    },
    _setConvQuotaLimit(n) {
      throwQuotaWhenLenAtLeast = n;
    },
  };
}

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();
const dispatchedEvents = [];
const invokeCalls = [];
const eventListeners = new Map();

class CustomEventPolyfill {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

globalThis.CustomEvent = CustomEventPolyfill;
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
globalThis.window = {
  localStorage: localStorageMock,
  sessionStorage: sessionStorageMock,
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  dispatchEvent(ev) {
    dispatchedEvents.push(ev);
    const set = eventListeners.get(ev.type);
    if (set) {
      for (const fn of set) fn(ev);
    }
    return true;
  },
  addEventListener(type, fn) {
    if (!eventListeners.has(type)) eventListeners.set(type, new Set());
    eventListeners.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    eventListeners.get(type)?.delete(fn);
  },
};

// Mock fetch & Tauri runtime control
let mockFetchImpl = async () => ({
  ok: true,
  status: 200,
  text: async () => "{}",
  json: async () => ({}),
  body: null,
});

globalThis.fetch = async (url, opts) => mockFetchImpl(url, opts);

const tauriMocks = {
  invoke: async (cmd, args) => {
    invokeCalls.push({ cmd, args });
    return null;
  },
  listen: async () => () => {},
  loadStore: async () => ({
    get: async () => null,
    set: async () => {},
    delete: async () => {},
    save: async () => {},
  }),
};
globalThis.__T11_MOCKS__ = tauriMocks;

// 2. Register Node ESM loader hook to transpile .ts files on the fly in memory
const VIRTUAL_MODULES = new Map([
  [
    "mock:@tauri-apps/api/core",
    `export const invoke = (...a) => globalThis.__T11_MOCKS__.invoke(...a);`,
  ],
  [
    "mock:@tauri-apps/api/event",
    `export const listen = (...a) => globalThis.__T11_MOCKS__.listen(...a);`,
  ],
  [
    "mock:@tauri-apps/plugin-store",
    `export const load = (...a) => globalThis.__T11_MOCKS__.loadStore(...a);`,
  ],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@tauri-apps/api/core") {
      return { url: "mock:@tauri-apps/api/core", shortCircuit: true };
    }
    if (specifier === "@tauri-apps/api/event") {
      return { url: "mock:@tauri-apps/api/event", shortCircuit: true };
    }
    if (specifier === "@tauri-apps/plugin-store") {
      return { url: "mock:@tauri-apps/plugin-store", shortCircuit: true };
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const base = path.resolve(parentDir, specifier);
      for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx", "/index.js"]) {
        const candidate = base + ext;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (VIRTUAL_MODULES.has(url)) {
      return {
        format: "module",
        source: VIRTUAL_MODULES.get(url),
        shortCircuit: true,
      };
    }
    if (url.startsWith("file:") && (url.endsWith(".ts") || url.endsWith(".tsx"))) {
      const filePath = fileURLToPath(url);
      let source = fs.readFileSync(filePath, "utf8");
      // Replace Vite import.meta.env for Node
      source = source.replace(/import\.meta\.env\.VITE_GILI_FREE_URL/g, '""');
      const result = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          isolatedModules: true,
        },
        fileName: filePath,
      });
      return {
        format: "module",
        source: result.outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

// 3. Dynamically import real project modules
const currencySvc = await import(
  pathToFileURL(path.join(ROOT, "src/services/aiCurrencyService.ts")).href
);
const routerSvc = await import(
  pathToFileURL(path.join(ROOT, "src/services/aiRouterService.ts")).href
);
const chatSvc = await import(
  pathToFileURL(path.join(ROOT, "src/services/aiChatService.ts")).href
);
const modelReg = await import(
  pathToFileURL(path.join(ROOT, "src/services/aiModelRegistry.ts")).href
);
const convSvc = await import(
  pathToFileURL(path.join(ROOT, "src/services/aiConversationService.ts")).href
);
const notchTools = await import(
  pathToFileURL(path.join(ROOT, "src/services/aiNotchTools.ts")).href
);
const bgStream = await import(
  pathToFileURL(path.join(ROOT, "src/services/aiBackgroundStreamService.ts")).href
);
const geminiApi = await import(
  pathToFileURL(path.join(ROOT, "src/services/geminiApi.ts")).href
);

const results = [];
async function runTest(id, name, fn) {
  localStorageMock.clear();
  localStorageMock._setConvQuotaLimit(null);
  sessionStorageMock.clear();
  dispatchedEvents.length = 0;
  invokeCalls.length = 0;
  try {
    const detail = await fn();
    results.push({ id, name, status: "PROVEN", detail });
    console.log(`[PROVEN] ${id} - ${name}: ${detail}`);
  } catch (err) {
    results.push({ id, name, status: "FAILED", detail: err?.stack || String(err) });
    console.error(`[FAILED] ${id} - ${name}:`, err);
  }
}

// --- TEST CASES ---

await runTest("TEST-01", "aiCurrencyService parseCurrencyInput & convertCurrencyToIdr & formatCurrencyAmount", async () => {
  const usdThousand = currencySvc.parseCurrencyInput("1,000", 2);
  assert.equal(usdThousand, 1, "Expected buggy parse of '1,000' -> 1");
  const eurThousand = currencySvc.parseCurrencyInput("1.000", 2);
  assert.equal(eurThousand, 1, "Expected buggy parse of '1.000' -> 1");
  const tinyLimitIdr = currencySvc.convertCurrencyToIdr(0.00001, "USD");
  assert.equal(tinyLimitIdr, 0, "Expected tiny non-zero limit to round to 0 (Unlimited)");
  const fmtNaN = currencySvc.formatCurrencyAmount(Number.NaN, "IDR");
  assert.equal(fmtNaN, "Rp NaN");
  const fmtNeg = currencySvc.formatCurrencyAmount(-5, "USD");
  assert.equal(fmtNeg, "$-5.0000");
  return `parseCurrencyInput("1,000",2)=${usdThousand}; convertCurrencyToIdr(0.00001,"USD")=${tinyLimitIdr}; fmtNaN="${fmtNaN}"; fmtNeg="${fmtNeg}"`;
});

await runTest("TEST-02", "NaN poisoning in calculateEstimatedCostIdr & recordTokenUsage", async () => {
  const model = chatSvc.AI_MODELS[0];
  const cost = routerSvc.calculateEstimatedCostIdr(model, Number.NaN, 100);
  assert.ok(Number.isNaN(cost), "Expected NaN cost");

  chatSvc.recordTokenUsage(model, Number.NaN, 100);
  const rawStored = JSON.parse(localStorageMock.getItem("island_ai_usage_stats_v1"));
  assert.equal(rawStored.totalInputTokens, null, "Expected NaN serialized to null in totalInputTokens");
  assert.equal(rawStored.estimatedCostIdr, null, "Expected NaN serialized to null in estimatedCostIdr");
  assert.equal(rawStored.todayTokens, null, "Expected NaN serialized to null in todayTokens");
  return `calculateEstimatedCostIdr(NaN,100)=${cost}; stored totalInputTokens=${rawStored.totalInputTokens}, estimatedCostIdr=${rawStored.estimatedCostIdr}, todayTokens=${rawStored.todayTokens}`;
});

await runTest("TEST-03", "evaluatePromptHeuristics slash-prefix corruption & case sensitivity", async () => {
  const r1 = routerSvc.evaluatePromptHeuristics("/kuatkan tekad saya");
  assert.equal(r1.tier, "T2");
  assert.equal(r1.cleanedPrompt, "kan tekad saya", "Expected '/kuat' stripped mid-word");
  const r2 = routerSvc.evaluatePromptHeuristics("/ringkaskan teks ini");
  assert.equal(r2.lengthMode, "compact");
  assert.equal(r2.cleanedPrompt, "kan teks ini", "Expected '/ringkas' stripped mid-word");
  const r3 = routerSvc.evaluatePromptHeuristics("/KUAT jelaskan apa itu air");
  assert.notEqual(r3.tier, "T2", "Expected uppercase /KUAT ignored by startsWith");
  return `'/kuatkan tekad saya' -> cleaned='${r1.cleanedPrompt}', tier=${r1.tier}; '/ringkaskan teks ini' -> cleaned='${r2.cleanedPrompt}'; '/KUAT...' -> tier=${r3.tier}`;
});

await runTest("TEST-04", "resetUsageStats leaves stale routerConfig.budget.monthlyLimitIdr active", async () => {
  chatSvc.saveMonthlyLimit(20000);
  const cfgBefore = routerSvc.loadRouterConfig();
  assert.equal(cfgBefore.budget.monthlyLimitIdr, 20000);
  const statsAfterReset = chatSvc.resetUsageStats();
  assert.equal(statsAfterReset.monthlyLimitIdr, 0);
  const policy = routerSvc.evaluateBudgetPolicy(routerSvc.loadRouterConfig(), {
    ...statsAfterReset,
    estimatedCostIdr: 25000,
  });
  assert.equal(policy.hasLimit, true);
  assert.equal(policy.limitIdr, 20000);
  assert.equal(policy.isExceeded, true);
  return `stats.monthlyLimitIdr=${statsAfterReset.monthlyLimitIdr}, policy.hasLimit=${policy.hasLimit}, policy.limitIdr=${policy.limitIdr}, policy.isExceeded=${policy.isExceeded}`;
});

await runTest("TEST-05", "aiModelRegistry pricing bugs, :free matching, flash > pro rank, Gemini ?key= & injected 3.8", async () => {
  // 5a: OpenRouter :free model matched to paid catalog
  const freeCfg = modelReg.toModelConfig("openrouter", {
    id: "anthropic/claude-3.5-sonnet:free",
  });
  assert.equal(freeCfg.inputCostPer1M, 3.0);
  assert.equal(freeCfg.outputCostPer1M, 15.0);

  // 5b: Gateway returning per-1M pricing <= 0.01 inflated 1,000,000x
  mockFetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [{ id: "cheap-model", pricing: { prompt: "0.01", completion: "0.01" } }],
    }),
  });
  const resCustom = await modelReg.verifyAndRegisterModels(
    "custom",
    "dummy-key-123456",
    "https://example.invalid/v1"
  );
  assert.equal(resCustom.ok, true);
  assert.equal(resCustom.models[0].inputCostPer1M, 10000);

  // 5c: compareModelsNewestFirst ranks flash > pro
  const cmp = modelReg.compareModelsNewestFirst(
    { id: "gemini-2.5-flash" },
    { id: "gemini-2.5-pro" }
  );
  assert.ok(cmp < 0, "Expected flash sorted before pro");

  // 5d: Gemini list sends ?key= in URL & injects unverified gemini-3.8-flash; network error leaks URL with key
  let capturedUrl = "";
  const dummyGeminiKey = "AIzaDUMMY_KEY_FOR_TEST_ONLY_1234567890";
  mockFetchImpl = async (url) => {
    capturedUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          {
            name: "models/gemini-2.5-flash",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      }),
    };
  };
  const gemRes = await modelReg.verifyAndRegisterModels("gemini", dummyGeminiKey);
  assert.equal(gemRes.ok, true);
  assert.ok(capturedUrl.includes(`?key=${dummyGeminiKey}`), "Expected ?key= in Gemini URL");
  assert.ok(gemRes.models.some((m) => m.id === "gemini-3.8-flash"), "Expected injected gemini-3.8-flash");
  assert.equal(gemRes.models[0].id, "gemini-3.8-flash");

  // Simulate network error leaking URL (like ureq Transport error)
  mockFetchImpl = async (url) => {
    throw new Error(`Network error: ${url}: Connection failed`);
  };
  const errRes = await modelReg.verifyAndRegisterModels("gemini", dummyGeminiKey);
  assert.equal(errRes.ok, false);
  const leakedInReason = errRes.reason.includes(dummyGeminiKey);
  assert.equal(leakedInReason, true);
  const maskedUrl = capturedUrl.replace(dummyGeminiKey, "[REDACTED]");
  return `freeMatchedCost=${freeCfg.inputCostPer1M}/${freeCfg.outputCostPer1M}; per1M(0.01)=${resCustom.models[0].inputCostPer1M}; flashVsPro=${cmp}; geminiUrl="${maskedUrl}"; injectedTop=${gemRes.models[0].id}; leakedInErrorReason=${leakedInReason}`;
});

await runTest("TEST-06", "SSE stream parsing bugs: mid-stream error ignored, multi-line SSE ignored, StreamContentFilter tail lost", async () => {
  const enc = new TextEncoder();
  const makeSseStream = (chunks) =>
    new ReadableStream({
      start(ctrl) {
        for (const c of chunks) ctrl.enqueue(enc.encode(c));
        ctrl.close();
      },
    });

  // 6a: Anthropic mid-stream error event silently ignored
  mockFetchImpl = async () => ({
    ok: true,
    status: 200,
    body: makeSseStream([
      'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n',
    ]),
  });
  let claudeOut = "";
  await chatSvc.streamChatCompletion({
    provider: "claude",
    apiKey: "sk-ant-dummy-12345678901234567890",
    model: chatSvc.AI_MODELS[0],
    messages: [{ id: "1", role: "user", content: "hi", timestamp: 1 }],
    onChunk: (c) => { claudeOut += c; },
  });
  assert.equal(claudeOut, "");

  // 6b: OpenAI-compatible mid-stream error JSON silently ignored
  mockFetchImpl = async () => ({
    ok: true,
    status: 200,
    body: makeSseStream([
      'data: {"error":{"message":"Upstream rate limit","code":429}}\n\n',
    ]),
  });
  let oaiOut = "";
  await chatSvc.streamChatCompletion({
    provider: "openai",
    apiKey: "sk-dummy-12345678901234567890",
    model: chatSvc.AI_MODELS[4],
    messages: [{ id: "1", role: "user", content: "hi", timestamp: 1 }],
    onChunk: (c) => { oaiOut += c; },
  });
  assert.equal(oaiOut, "");

  // 6c: Multi-line SSE data event fails JSON.parse per line and outputs nothing
  mockFetchImpl = async () => ({
    ok: true,
    status: 200,
    body: makeSseStream([
      'data: {\n',
      'data: "choices":[{"delta":{"content":"Halo"}}]\n',
      'data: }\n\n',
      'data: [DONE]\n\n',
    ]),
  });
  let multiOut = "";
  await chatSvc.streamChatCompletion({
    provider: "openai",
    apiKey: "sk-dummy-12345678901234567890",
    model: chatSvc.AI_MODELS[4],
    messages: [{ id: "1", role: "user", content: "hi", timestamp: 1 }],
    onChunk: (c) => { multiOut += c; },
  });
  assert.equal(multiOut, "");

  // 6d: StreamContentFilter loses buffered '<t' when stream aborts/errors
  mockFetchImpl = async () => ({
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Halo <t"}}]}\n\n'));
        setTimeout(() => {
          try { ctrl.error(new Error("Connection reset")); } catch {}
        }, 15);
      },
    }),
  });
  let partialOut = "";
  await assert.rejects(() =>
    chatSvc.streamChatCompletion({
      provider: "openai",
      apiKey: "sk-dummy-12345678901234567890",
      model: chatSvc.AI_MODELS[4],
      messages: [{ id: "1", role: "user", content: "hi", timestamp: 1 }],
      onChunk: (c) => { partialOut += c; },
    })
  );
  assert.equal(partialOut, "Halo ", "Expected '<t' lost in un-flushed StreamContentFilter");

  // 6e: Gemini model fallback contaminates output from failed attempt
  let callIdx = 0;
  mockFetchImpl = async (url) => {
    callIdx++;
    if (callIdx === 1) {
      return {
        ok: true,
        status: 200,
        body: makeSseStream([
          'data: {"event_type":"content.delta","delta":{"text":"Draft1"}}\n\n',
          'event: error\ndata: {"error":{"message":"This model is no longer available to new users. Switch to gemini-2.5-flash."}}\n\n',
        ]),
      };
    }
    return {
      ok: true,
      status: 200,
      body: makeSseStream([
        'data: {"event_type":"content.delta","delta":{"text":"Final2"}}\n\n',
      ]),
    };
  };
  let gemOut = "";
  await geminiApi.streamGeminiChat({
    apiKey: "AIzaDUMMY_KEY_FOR_TEST_ONLY_1234567890",
    model: { ...chatSvc.AI_MODELS[7], id: "gemini-3.8-flash" },
    messages: [{ id: "1", role: "user", content: "hi", timestamp: 1 }],
    systemInstruction: "sys",
    safetyMaxTokens: 350,
    onText: (t) => { gemOut += t; },
    onReasoning: () => {},
  });
  assert.equal(gemOut, "Draft1Final2");

  return `claudeErrorIgnored=${claudeOut === ""}; oaiErrorIgnored=${oaiOut === ""}; multiLineIgnored=${multiOut === ""}; partialLostTail="${partialOut}"; geminiPolluted="${gemOut}"`;
});

await runTest("TEST-07", "aiNotchTools crashes on malformed LLM params & executes destructive/action blocks without consent", async () => {
  // 7a: params: null crashes uncaught
  await assert.rejects(
    () => notchTools.executeGiliAction({ action: "add_todo", params: null }),
    TypeError
  );
  // 7b: non-string text crashes uncaught
  await assert.rejects(
    () => notchTools.executeGiliAction({ action: "add_todo", params: { text: 123 } }),
    TypeError
  );
  // 7c: non-string query crashes uncaught
  await assert.rejects(
    () => notchTools.executeGiliAction({ action: "delete_note", params: { query: ["a"] } }),
    TypeError
  );
  // 7d: negative water amount accepted
  const waterRes = await notchTools.executeGiliAction({
    action: "log_water",
    params: { amountMl: -500 },
  });
  assert.equal(waterRes.success, true);

  // 7e: generic ```action example block gets executed as Gili command!
  localStorageMock.setItem(
    "island_todo_list",
    JSON.stringify([{ id: "t1", text: "Bayar tagihan rahasia", completed: false, createdAt: 1 }])
  );
  const parsedRes = await notchTools.parseAndExecuteGiliActions(
    'Contoh JSON:\n```action\n{"action":"delete_todo","params":{"query":"rahasia"}}\n```'
  );
  const todosAfter = JSON.parse(localStorageMock.getItem("island_todo_list"));
  assert.equal(parsedRes.results.length, 1);
  assert.equal(parsedRes.results[0].success, true);
  assert.equal(todosAfter.length, 0);
  assert.equal(parsedRes.cleanText, "Contoh JSON:");

  // 7f: getNotchRealtimeContext leaks clipboard & notes without consent
  localStorageMock.setItem(
    "island_clipboard_history",
    JSON.stringify([{ type: "text", text: "SECRET_CLIPBOARD_TOKEN_XYZ" }])
  );
  const ctx = notchTools.getNotchRealtimeContext();
  assert.ok(ctx.includes("SECRET_CLIPBOARD_TOKEN_XYZ"));

  return `nullParams=TypeError; numText=TypeError; arrQuery=TypeError; negWater=${waterRes.success}; exampleActionExecuted=true (todosLeft=${todosAfter.length}); clipboardInjectedInSystemCtx=true`;
});

await runTest("TEST-08", "aiBackgroundStreamService race on stop+restart & unstopped stream on deleteConversation", async () => {
  const enc = new TextEncoder();
  const model = chatSvc.AI_MODELS[4];

  // 8a: Start Job 1 whose stream yields after abort, stop it, then start Job 2 on same convId
  const conv = convSvc.createConversation("openai", model.id, "Race Test");
  let resolveJob1Read;
  let reqCount = 0;
  mockFetchImpl = async (_url, opts) => {
    reqCount++;
    if (reqCount === 1) {
      // Simulate abort arriving slightly async or reader resolving with error after abort
      return {
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(ctrl) {
            ctrl.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Job1Partial"}}]}\n\n'));
            // Wait until test explicitly triggers delayed abort rejection
            resolveJob1Read = () => {
              // Simulate a tick delay before AbortError unwinds
              setTimeout(() => {
                try { ctrl.error(new DOMException("Aborted", "AbortError")); } catch {}
              }, 25);
            };
          },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Job2FreshAnswer"}}]}\n\n'));
          ctrl.enqueue(enc.encode('data: [DONE]\n\n'));
          ctrl.close();
        },
      }),
    };
  };

  const job1User = { id: "u1", role: "user", content: "First", timestamp: 1 };
  bgStream.startBackgroundAiChatStream({
    conversationId: conv.id,
    source: "panel",
    provider: "openai",
    apiKey: "sk-dummy-12345678901234567890",
    model,
    updatedMessages: [job1User],
    assistantMsgId: "a1",
    lengthMode: "normal",
    historyWindowSize: 8,
    useGiliFree: false,
  });

  await new Promise((r) => setTimeout(r, 20));
  bgStream.stopBackgroundAiStream(conv.id);
  resolveJob1Read?.();

  // Immediately start Job 2 before Job 1's catch block executes (25ms later)
  const job2User = { id: "u2", role: "user", content: "Second", timestamp: 2 };
  bgStream.startBackgroundAiChatStream({
    conversationId: conv.id,
    source: "panel",
    provider: "openai",
    apiKey: "sk-dummy-12345678901234567890",
    model,
    updatedMessages: [job1User, { id: "a1", role: "assistant", content: "Job1Partial", timestamp: 1 }, job2User],
    assistantMsgId: "a2",
    lengthMode: "normal",
    historyWindowSize: 8,
    useGiliFree: false,
  });

  await new Promise((r) => setTimeout(r, 80));
  const convAfterRace = convSvc.getConversationById(conv.id);
  const lastMsgAfterRace = convAfterRace?.messages[convAfterRace.messages.length - 1];
  assert.equal(lastMsgAfterRace?.id, "a1", "Expected Job 1's abort handler to overwrite Job 2's messages!");

  // 8b: deleteConversation while stream active does not stop stream or action execution
  const convDel = convSvc.createConversation("openai", model.id, "Delete While Streaming");
  let finishDelStream;
  mockFetchImpl = async () => ({
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(ctrl) {
        finishDelStream = () => {
          ctrl.enqueue(
            enc.encode(
              'data: {"choices":[{"delta":{"content":"Done\\n```gili_action\\n{\\"action\\":\\"add_todo\\",\\"params\\":{\\"text\\":\\"ZombieTodo\\"}}\\n```"}}]}\n\n'
            )
          );
          ctrl.enqueue(enc.encode("data: [DONE]\n\n"));
          ctrl.close();
        };
      },
    }),
  });
  bgStream.startBackgroundAiChatStream({
    conversationId: convDel.id,
    source: "panel",
    provider: "openai",
    apiKey: "sk-dummy-12345678901234567890",
    model,
    updatedMessages: [{ id: "ud1", role: "user", content: "Add todo", timestamp: 10 }],
    assistantMsgId: "ad1",
    lengthMode: "normal",
    historyWindowSize: 8,
    useGiliFree: false,
  });

  await new Promise((r) => setTimeout(r, 10));
  convSvc.deleteConversation(convDel.id);
  assert.ok(bgStream.getActiveAiStreamForConversation(convDel.id) !== null, "Stream still active after deleteConversation");
  finishDelStream?.();
  await new Promise((r) => setTimeout(r, 30));
  const todosAfterDel = JSON.parse(localStorageMock.getItem("island_todo_list") || "[]");
  const zombieExecuted = todosAfterDel.some((t) => t.text === "ZombieTodo");
  const cacheStillExists = bgStream.getCompletedConversationMessages(convDel.id) !== null;
  assert.equal(zombieExecuted, true);
  assert.equal(cacheStillExists, true);

  return `raceOverwroteJob2WithId=${lastMsgAfterRace?.id}; zombieTodoExecutedAfterDelete=${zombieExecuted}; completedCacheLeakedAfterDelete=${cacheStillExists}`;
});

await runTest("TEST-09", "aiConversationService QuotaExceededError evicts newly updated conversation", async () => {
  const model = chatSvc.AI_MODELS[4];
  const oldConv = convSvc.createConversation("openai", model.id, "Old Chat");
  convSvc.updateConversationMessages(oldConv.id, [
    { id: "m1", role: "user", content: "old", timestamp: 1 },
  ]);
  const newerConv = convSvc.createConversation("openai", model.id, "Active Chat");
  convSvc.updateConversationMessages(newerConv.id, [
    { id: "m2", role: "user", content: "active", timestamp: 2 },
  ]);
  // Force storage order: [oldConv, newerConv]
  localStorageMock.setItem(
    "island_ai_conversations_v1",
    JSON.stringify([oldConv, newerConv])
  );
  // Simulate quota exceeded when storing >= 2 conversations
  localStorageMock._setConvQuotaLimit(2);
  convSvc.updateConversationMessages(newerConv.id, [
    { id: "m2", role: "user", content: "active", timestamp: 2 },
    { id: "m3", role: "assistant", content: "brand new reply", timestamp: 3 },
  ]);
  localStorageMock._setConvQuotaLimit(null);
  const remaining = convSvc.getConversations();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, oldConv.id, "Expected active updated conv evicted while old conv survived");
  return `survivingId=${remaining[0].id} (title="${remaining[0].title}"), evictedActiveId=${newerConv.id}`;
});

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.status !== "PROVEN");
if (failed.length > 0) {
  process.exitCode = 1;
}
