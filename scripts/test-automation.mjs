import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { createServer } from "vite";
import { registerNotchAndUtilsSuites } from "./tests/notchAndUtilsSuites.mjs";
import { registerTaskbarSuites } from "./tests/taskbarSuites.mjs";

function createMemoryStorage() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key) {
      const k = String(key);
      return store.has(k) ? store.get(k) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
  };
}

function createShimBroadcastChannelClass() {
  const channelsByName = new Map();

  return class ShimBroadcastChannel extends EventTarget {
    constructor(name) {
      super();
      this.name = String(name);
      this.closed = false;
      if (!channelsByName.has(this.name)) {
        channelsByName.set(this.name, new Set());
      }
      channelsByName.get(this.name).add(this);
    }

    postMessage(data) {
      if (this.closed) return;
      const peers = channelsByName.get(this.name);
      if (!peers) return;
      for (const peer of peers) {
        if (peer === this || peer.closed) continue;
        peer.dispatchEvent(new MessageEvent("message", { data }));
      }
    }

    close() {
      this.closed = true;
      channelsByName.get(this.name)?.delete(this);
    }
  };
}

function defineGlobalIfConfigurable(name, value) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, name);
  if (!desc || desc.configurable) {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  }
}

function installBrowserShim() {
  const windowEvents = new EventTarget();

  defineGlobalIfConfigurable("localStorage", createMemoryStorage());
  defineGlobalIfConfigurable("sessionStorage", createMemoryStorage());
  defineGlobalIfConfigurable("BroadcastChannel", createShimBroadcastChannelClass());
  defineGlobalIfConfigurable("addEventListener", windowEvents.addEventListener.bind(windowEvents));
  defineGlobalIfConfigurable("removeEventListener", windowEvents.removeEventListener.bind(windowEvents));
  defineGlobalIfConfigurable("dispatchEvent", windowEvents.dispatchEvent.bind(windowEvents));
  defineGlobalIfConfigurable("navigator", {
    language: "en-US",
    userAgent: "GiliTestRunner",
  });

  if (typeof globalThis.CustomEvent !== "function") {
    class ShimCustomEvent extends Event {
      constructor(type, init = {}) {
        super(type, init);
        this.detail = init.detail ?? null;
      }
    }
    defineGlobalIfConfigurable("CustomEvent", ShimCustomEvent);
  }

  if (typeof globalThis.KeyboardEvent !== "function") {
    class ShimKeyboardEvent extends Event {
      constructor(type, init = {}) {
        super(type, init);
        this.key = init.key ?? "";
        this.ctrlKey = Boolean(init.ctrlKey);
        this.altKey = Boolean(init.altKey);
        this.metaKey = Boolean(init.metaKey);
        this.shiftKey = Boolean(init.shiftKey);
      }
    }
    defineGlobalIfConfigurable("KeyboardEvent", ShimKeyboardEvent);
  }

  defineGlobalIfConfigurable("window", globalThis);
  delete globalThis.__TAURI_INTERNALS__;
  delete globalThis.__TAURI__;
}

function createJsonResponse(payload, status = 200) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createTextResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
  });
}

function createSseResponse(chunks, status = 200) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function createControllableSseStream(signal) {
  const encoder = new TextEncoder();
  let streamController = null;
  let closed = false;

  const abortListener = () => {
    if (closed || !streamController) return;
    closed = true;
    try {
      streamController.error(new DOMException("Request aborted", "AbortError"));
    } catch {
      // Stream already closed or errored
    }
  };

  if (signal) {
    if (signal.aborted) {
      abortListener();
    } else {
      signal.addEventListener("abort", abortListener, { once: true });
    }
  }

  const body = new ReadableStream({
    start(controller) {
      streamController = controller;
      if (signal?.aborted && !closed) {
        abortListener();
      }
    },
    cancel() {
      closed = true;
      signal?.removeEventListener("abort", abortListener);
    },
  });

  return {
    response: new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    push(sseChunk) {
      if (closed || !streamController) return;
      streamController.enqueue(encoder.encode(sseChunk));
    },
    close() {
      if (closed || !streamController) return;
      closed = true;
      signal?.removeEventListener("abort", abortListener);
      streamController.close();
    },
  };
}

async function withTauriInvokeMock(invokeImpl, fn) {
  const prevInternals = globalThis.__TAURI_INTERNALS__;
  globalThis.__TAURI_INTERNALS__ = {
    invoke: invokeImpl,
    transformCallback: () => 0,
    unregisterCallback: () => {},
    convertFileSrc: (filePath) => filePath,
  };
  try {
    return await fn();
  } finally {
    if (prevInternals === undefined) {
      delete globalThis.__TAURI_INTERNALS__;
    } else {
      globalThis.__TAURI_INTERNALS__ = prevInternals;
    }
  }
}

async function waitUntil(predicate, timeoutMs = 2000, stepMs = 10) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const result = predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
}

function createTaskbarFlyoutHarness({ invoke, listen, onSwitchTarget }) {
  const state = {
    isOpen: false,
    target: null,
    theme: "solid",
    searchInitialTab: "all",
    searchInitialQuery: "",
    payloadLightOverride: null,
    anchorInfo: null,
    hasLiveStateUpdate: false,
    cancelled: false,
  };

  const applyFlyoutOpen = (nextTarget, nextTheme, nextIsLight, nextAnchor) => {
    if (nextTarget) {
      if (nextTarget !== "search") {
        state.searchInitialQuery = "";
      }
      state.target = nextTarget;
    }
    if (nextTheme === "solid" || nextTheme === "liquid") {
      state.theme = nextTheme;
    }
    if (nextAnchor) {
      state.anchorInfo = nextAnchor;
    }
    state.payloadLightOverride = typeof nextIsLight === "boolean" ? nextIsLight : null;
    state.isOpen = true;
  };

  const resetFlyout = () => {
    state.isOpen = false;
    state.target = null;
    state.searchInitialTab = "all";
    state.searchInitialQuery = "";
    state.payloadLightOverride = null;
    state.anchorInfo = null;
  };

  globalThis.__setTaskbarFlyoutState = (newTarget, newTheme, newAnchor) => {
    state.hasLiveStateUpdate = true;
    applyFlyoutOpen(newTarget, newTheme, undefined, newAnchor);
  };

  globalThis.__resetTaskbarFlyoutState = () => {
    state.hasLiveStateUpdate = true;
    resetFlyout();
  };

  const pendingState = globalThis.__PENDING_TASKBAR_FLYOUT__;
  if (pendingState) {
    delete globalThis.__PENDING_TASKBAR_FLYOUT__;
    if (pendingState.isOpen !== false && pendingState.target) {
      state.hasLiveStateUpdate = true;
      applyFlyoutOpen(
        pendingState.target,
        pendingState.theme,
        pendingState.isLight,
        pendingState.anchor
      );
    }
  }

  const initialGetPromise = Promise.resolve(invoke("get_taskbar_flyout_state"))
    .then((initial) => {
      if (state.cancelled || state.hasLiveStateUpdate || !initial?.isOpen || !initial.target) {
        return;
      }
      applyFlyoutOpen(initial.target, initial.theme, initial.isLight, initial.anchor);
    })
    .catch(() => {});

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault?.();
      Promise.resolve(invoke("close_taskbar_flyout")).catch(() => {});
      return;
    }
    if (
      state.isOpen &&
      state.target === "start" &&
      typeof e.key === "string" &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey
    ) {
      e.preventDefault?.();
      state.searchInitialTab = "all";
      state.searchInitialQuery += e.key;
      state.target = "search";
      Promise.resolve(onSwitchTarget("search")).catch(() => {});
    }
  };
  window.addEventListener("keydown", handleKeyDown);

  const unlisten = listen("taskbar-flyout-state-changed", (event) => {
    const payload = event?.payload;
    if (!payload) return;
    state.hasLiveStateUpdate = true;
    if (payload.isOpen) {
      applyFlyoutOpen(payload.target, payload.theme, payload.isLight, payload.anchor);
    } else if (!payload.closing) {
      resetFlyout();
    }
  });

  return {
    state,
    initialGetPromise,
    cleanup() {
      state.cancelled = true;
      delete globalThis.__setTaskbarFlyoutState;
      delete globalThis.__resetTaskbarFlyoutState;
      window.removeEventListener("keydown", handleKeyDown);
      unlisten();
    },
  };
}

let vite;
let tabConfigService;
let aiModelRegistry;
let aiRouterService;
let aiChatService;
let geminiApi;
let aiConversationService;
let aiBackgroundStreamService;
let navbarConfigService;
let macosIconMap;
let pinnedAppsHelpers;
let todoUtils;
let noteUtils;
let waterService;
let notificationHistoryService;
let lrclibProviderModule;
let lyricsUtils;
let wordTiming;
let taskbarLaunchService;

let recordedRequests = [];
let fetchHandler = async (url) => {
  throw new Error(`Unexpected unmocked fetch call to ${url}`);
};

const sampleGeminiModel = {
  id: "gemini-2.5-flash",
  name: "Gemini 2.5 Flash",
  provider: "gemini",
  description: "Gemini 2.5 Flash test fixture",
  tier: "Fast",
  inputCostPer1M: 0.15,
  outputCostPer1M: 0.6,
};

const sampleOpenAiModel = {
  id: "gpt-4o",
  name: "GPT-4o",
  provider: "openai",
  description: "GPT-4o test fixture",
  tier: "Medium",
  inputCostPer1M: 2.5,
  outputCostPer1M: 10.0,
};

before(async () => {
  installBrowserShim();

  defineGlobalIfConfigurable("fetch", async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const rawBody = typeof init.body === "string" ? init.body : undefined;
    let parsedBody;
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = undefined;
      }
    }
    const call = {
      url,
      method: init.method || "GET",
      headers: init.headers || {},
      body: rawBody,
      parsedBody,
      signal: init.signal,
    };
    recordedRequests.push(call);
    return fetchHandler(url, call);
  });

  vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  tabConfigService = await vite.ssrLoadModule("/src/services/tabConfigService.ts");
  aiModelRegistry = await vite.ssrLoadModule("/src/services/aiModelRegistry.ts");
  aiRouterService = await vite.ssrLoadModule("/src/services/aiRouterService.ts");
  aiChatService = await vite.ssrLoadModule("/src/services/aiChatService.ts");
  geminiApi = await vite.ssrLoadModule("/src/services/geminiApi.ts");
  aiConversationService = await vite.ssrLoadModule("/src/services/aiConversationService.ts");
  aiBackgroundStreamService = await vite.ssrLoadModule("/src/services/aiBackgroundStreamService.ts");
  navbarConfigService = await vite.ssrLoadModule("/src/services/navbarConfigService.ts");
  macosIconMap = await vite.ssrLoadModule("/src/components/navbar/groups/macosIconMap.ts");
  pinnedAppsHelpers = await vite.ssrLoadModule("/src/components/navbar/groups/pinnedAppsHelpers.ts");
  todoUtils = await vite.ssrLoadModule("/src/services/todoUtils.ts");
  noteUtils = await vite.ssrLoadModule("/src/services/noteUtils.ts");
  waterService = await vite.ssrLoadModule("/src/services/waterService.ts");
  notificationHistoryService = await vite.ssrLoadModule("/src/services/notificationHistoryService.ts");
  lrclibProviderModule = await vite.ssrLoadModule("/src/services/lyrics/lrclibProvider.ts");
  lyricsUtils = await vite.ssrLoadModule("/src/services/lyrics/utils.ts");
  wordTiming = await vite.ssrLoadModule("/src/services/lyrics/wordTiming.ts");
  taskbarLaunchService = await vite.ssrLoadModule("/src/services/taskbarLaunchService.ts");
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  recordedRequests = [];
  fetchHandler = async (url) => {
    throw new Error(`Unexpected unmocked fetch call to ${url}`);
  };
  delete globalThis.__TAURI_INTERNALS__;
  delete globalThis.__TAURI__;
  delete globalThis.__PENDING_TASKBAR_FLYOUT__;

  aiBackgroundStreamService.stopBackgroundAiStream();
  aiModelRegistry.clearModelUnavailable("gemini");
  aiModelRegistry.clearModelUnavailable("openai");
  aiModelRegistry.clearModelUnavailable("deepseek");
  geminiApi.setGeminiApiMode("auto");
});

afterEach(() => {
  aiBackgroundStreamService.stopBackgroundAiStream();
  delete globalThis.__TAURI_INTERNALS__;
  delete globalThis.__TAURI__;
  delete globalThis.__PENDING_TASKBAR_FLYOUT__;
});

after(async () => {
  aiBackgroundStreamService?.stopBackgroundAiStream();
  await vite?.close();
});

describe("Suite 1 — Track 2: tabConfigService & resolvePreferredOpenTab", () => {
  const defaultTabs = ["media_expanded", "quick_control", "ai_chat"];

  it("uses a 5-minute idle reset window and returns to quick_control when not playing music", () => {
    assert.equal(tabConfigService.TAB_IDLE_RESET_MS, 5 * 60 * 1000);

    // Within < 5m, keeps last active tab even when preventAutoOpenMedia=true
    const withinWindow = tabConfigService.resolvePreferredOpenTab({
      currentTabs: defaultTabs,
      openBehavior: "remember_last",
      preventAutoOpenMedia: true,
      isMusicActive: true,
      hasMediaTrack: true,
      tabExpired: false,
      lastActiveTab: "ai_chat",
      hasActiveAiStream: false,
    });
    assert.equal(withinWindow, "ai_chat");

    // After >= 5m without music playing, resets straight to Control Center regardless of last/first/AI state
    const afterExpiryNoMusic = tabConfigService.resolvePreferredOpenTab({
      currentTabs: defaultTabs,
      openBehavior: "first_tab",
      preventAutoOpenMedia: true,
      isMusicActive: false,
      hasMediaTrack: false,
      tabExpired: true,
      lastActiveTab: "ai_chat",
      hasActiveAiStream: true,
    });
    assert.equal(afterExpiryNoMusic, "quick_control");
  });

  it("returns to media_expanded after 5m expiry when music is actively playing", () => {
    const expiredWhilePlaying = tabConfigService.resolvePreferredOpenTab({
      currentTabs: defaultTabs,
      openBehavior: "remember_last",
      preventAutoOpenMedia: true,
      isMusicActive: true,
      hasMediaTrack: true,
      tabExpired: true,
      lastActiveTab: "ai_chat",
      hasActiveAiStream: true,
    });
    assert.equal(expiredWhilePlaying, "media_expanded");

    const expiredMediaDisabled = tabConfigService.resolvePreferredOpenTab({
      currentTabs: ["quick_control", "ai_chat"],
      openBehavior: "remember_last",
      preventAutoOpenMedia: true,
      isMusicActive: true,
      hasMediaTrack: true,
      tabExpired: true,
      lastActiveTab: "ai_chat",
      hasActiveAiStream: false,
    });
    assert.equal(expiredMediaDisabled, "quick_control");
  });

  it("skips media_expanded and falls back to quick_control when lastActiveTab is null and preventAutoOpenMedia=true", () => {
    const resolved = tabConfigService.resolvePreferredOpenTab({
      currentTabs: defaultTabs,
      openBehavior: "remember_last",
      preventAutoOpenMedia: true,
      isMusicActive: true,
      hasMediaTrack: true,
      tabExpired: false,
      lastActiveTab: null,
      hasActiveAiStream: false,
    });
    assert.equal(resolved, "quick_control");
  });

  it("opens media_expanded when user explicitly remembered media_expanded", () => {
    const resolved = tabConfigService.resolvePreferredOpenTab({
      currentTabs: defaultTabs,
      openBehavior: "remember_last",
      preventAutoOpenMedia: true,
      isMusicActive: true,
      hasMediaTrack: true,
      tabExpired: false,
      lastActiveTab: "media_expanded",
      hasActiveAiStream: false,
    });
    assert.equal(resolved, "media_expanded");
  });

  it("auto-opens media_expanded when preventAutoOpenMedia=false and music is active", () => {
    const resolved = tabConfigService.resolvePreferredOpenTab({
      currentTabs: defaultTabs,
      openBehavior: "remember_last",
      preventAutoOpenMedia: false,
      isMusicActive: true,
      hasMediaTrack: true,
      tabExpired: false,
      lastActiveTab: "ai_chat",
      hasActiveAiStream: false,
    });
    assert.equal(resolved, "media_expanded");
  });

  it("routes to ai_chat when hasActiveAiStream=true and lastActiveTab is null", () => {
    const resolved = tabConfigService.resolvePreferredOpenTab({
      currentTabs: defaultTabs,
      openBehavior: "remember_last",
      preventAutoOpenMedia: true,
      isMusicActive: true,
      hasMediaTrack: true,
      tabExpired: false,
      lastActiveTab: null,
      hasActiveAiStream: true,
    });
    assert.equal(resolved, "ai_chat");
  });

  it("normalizes tab preferences, deduplicates IDs, preserves core fallback, and resolves dock ordering", () => {
    const defaults = tabConfigService.normalizeTabsPreferences(null);
    assert.equal(defaults.defaultOpenBehavior, "remember_last");
    assert.equal(defaults.preventAutoOpenMediaWhilePlaying, true);
    assert.equal(defaults.includeSettingsInDock, true);
    assert.equal(defaults.items.length, tabConfigService.DEFAULT_TAB_ITEMS.length);

    const allDisabled = tabConfigService.normalizeTabsPreferences({
      items: [
        { id: "ai_chat", enabled: false },
        { id: "ai_chat", enabled: true },
        { id: "unknown_tab", enabled: true },
        { id: "quick_control", enabled: false },
      ],
      includeSettingsInDock: false,
      defaultOpenBehavior: "first_tab",
    });

    const aiItems = allDisabled.items.filter((i) => i.id === "ai_chat");
    assert.equal(aiItems.length, 1);
    assert.equal(aiItems[0].enabled, false);
    assert.equal(allDisabled.items.some((i) => i.id === "unknown_tab"), false);
    assert.equal(tabConfigService.isTabEnabled(allDisabled, "ai_chat"), false);
    assert.equal(tabConfigService.isTabEnabled(allDisabled, "todo"), true);

    const allOffCustom = tabConfigService.normalizeTabsPreferences({
      items: tabConfigService.DEFAULT_TAB_ITEMS.map((item) => ({ id: item.id, enabled: false })),
    });
    assert.equal(tabConfigService.isTabEnabled(allOffCustom, "quick_control"), true);

    const orderedNoSettings = tabConfigService.getOrderedEnabledTabs({
      ...defaults,
      items: [
        { id: "ai_chat", enabled: true },
        { id: "todo", enabled: false },
        { id: "quick_control", enabled: true },
      ],
      includeSettingsInDock: false,
    });
    assert.deepEqual(orderedNoSettings, ["ai_chat", "quick_control"]);

    const orderedWithSettings = tabConfigService.getOrderedEnabledTabs({
      ...defaults,
      items: [{ id: "ai_chat", enabled: true }],
      includeSettingsInDock: true,
    });
    assert.deepEqual(orderedWithSettings, ["ai_chat", "settings"]);
  });

  it("honors first_tab, quick_control, missing media track, and disabled lastActiveTab rules", () => {
    assert.equal(
      tabConfigService.resolvePreferredOpenTab({
        currentTabs: ["mini_note", "quick_control", "ai_chat"],
        openBehavior: "first_tab",
        preventAutoOpenMedia: true,
        isMusicActive: false,
        hasMediaTrack: false,
        tabExpired: false,
        lastActiveTab: "ai_chat",
        hasActiveAiStream: false,
      }),
      "mini_note"
    );

    assert.equal(
      tabConfigService.resolvePreferredOpenTab({
        currentTabs: ["mini_note", "quick_control", "ai_chat"],
        openBehavior: "quick_control",
        preventAutoOpenMedia: true,
        isMusicActive: false,
        hasMediaTrack: false,
        tabExpired: false,
        lastActiveTab: "mini_note",
        hasActiveAiStream: false,
      }),
      "quick_control"
    );

    assert.equal(
      tabConfigService.resolvePreferredOpenTab({
        currentTabs: ["media_expanded", "quick_control", "ai_chat"],
        openBehavior: "remember_last",
        preventAutoOpenMedia: true,
        isMusicActive: true,
        hasMediaTrack: false,
        tabExpired: false,
        lastActiveTab: "media_expanded",
        hasActiveAiStream: false,
      }),
      "quick_control"
    );
  });
});

describe("Suite 2 — Track 3: Background AI Stream & Conversation Pruning", () => {
  it("streams in background without UI subscribers, updates live state, persists result, and records token delta", async () => {
    let streamCtl;
    fetchHandler = async (_url, call) => {
      streamCtl = createControllableSseStream(call.signal);
      return streamCtl.response;
    };

    const conv = aiConversationService.createConversation("openai", sampleOpenAiModel.id, "Collapsed Stream");
    const assistantMsgId = "ast-bg-1";
    const userMsg = {
      id: "usr-bg-1",
      role: "user",
      content: "Explain dynamic islands briefly.",
      timestamp: Date.now(),
    };

    aiBackgroundStreamService.startBackgroundAiChatStream({
      conversationId: conv.id,
      source: "panel",
      provider: "openai",
      apiKey: "sk-test-bg-1",
      model: sampleOpenAiModel,
      updatedMessages: [userMsg],
      assistantMsgId,
      lengthMode: "compact",
      historyWindowSize: 8,
      useGiliFree: false,
      targetTier: "T1",
      isAutoRouted: false,
    });

    await waitUntil(() => Boolean(streamCtl));
    assert.equal(aiBackgroundStreamService.isAnyAiStreamActive(), true);
    assert.ok(
      aiBackgroundStreamService.getActiveAiStreams().some((s) => s.conversationId === conv.id)
    );

    streamCtl.push('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
    await waitUntil(() => {
      const live = aiBackgroundStreamService.getLiveConversationStreamState(conv.id);
      return live?.messages.find((m) => m.id === assistantMsgId)?.content === "Hello";
    });

    const liveMid = aiBackgroundStreamService.getLiveConversationStreamState(conv.id);
    assert.equal(liveMid?.isStreaming, true);
    assert.equal(liveMid?.messages.find((m) => m.id === assistantMsgId)?.content, "Hello");
    const activeMid = aiBackgroundStreamService.getActiveAiStreams().find((s) => s.conversationId === conv.id);
    assert.equal(activeMid?.hasContent, true);
    assert.equal(activeMid?.contentLength, 5);

    streamCtl.push('data: {"choices":[{"delta":{"content":" world!"}}]}\n\n');
    streamCtl.push('data: {"usage":{"prompt_tokens":15,"completion_tokens":7}}\n\n');
    streamCtl.push("data: [DONE]\n\n");
    streamCtl.close();

    await waitUntil(() => !aiBackgroundStreamService.isAnyAiStreamActive());

    assert.equal(aiBackgroundStreamService.isAnyAiStreamActive(), false);
    const savedConv = aiConversationService.getConversationById(conv.id);
    const savedAssistant = savedConv?.messages.find((m) => m.id === assistantMsgId);
    assert.equal(savedAssistant?.content, "Hello world!");

    const delta = aiBackgroundStreamService.consumeCompletedTokenDelta(conv.id);
    assert.ok(delta > 0, `Expected positive token delta, got ${delta}`);
    assert.equal(aiBackgroundStreamService.consumeCompletedTokenDelta(conv.id), 0);
  });

  it("strips imageDataUrl in localStorage persistence while preserving it in completed message cache", async () => {
    fetchHandler = async () =>
      createSseResponse([
        'data: {"choices":[{"delta":{"content":"Image analyzed."}}]}\n\n',
        'data: {"usage":{"prompt_tokens":20,"completion_tokens":5}}\n\n',
        "data: [DONE]\n\n",
      ]);

    const conv = aiConversationService.createConversation("openai", sampleOpenAiModel.id, "Image Context");
    const assistantMsgId = "ast-img-1";
    const imageMessage = {
      id: "usr-img-1",
      role: "user",
      content: "Describe this image",
      timestamp: Date.now(),
      context: {
        type: "image",
        title: "img.png",
        characterCount: 10,
        previewText: "img.png",
        imageDataUrl: "data:image/png;base64,AAA",
      },
    };

    aiBackgroundStreamService.startBackgroundAiChatStream({
      conversationId: conv.id,
      source: "panel",
      provider: "openai",
      apiKey: "sk-test-img-1",
      model: sampleOpenAiModel,
      updatedMessages: [imageMessage],
      assistantMsgId,
      lengthMode: "normal",
      historyWindowSize: 8,
      useGiliFree: false,
      targetTier: "T1",
      isAutoRouted: false,
    });

    await waitUntil(() => !aiBackgroundStreamService.isAnyAiStreamActive());

    const storedConv = aiConversationService.getConversationById(conv.id);
    const storedUserMsg = storedConv?.messages.find((m) => m.id === "usr-img-1");
    assert.equal(storedUserMsg?.context?.imageDataUrl, undefined);
    assert.equal(storedUserMsg?.context?.previewText, "img.png");

    const cachedMsgs = aiBackgroundStreamService.getCompletedConversationMessages(conv.id);
    const cachedUserMsg = cachedMsgs?.find((m) => m.id === "usr-img-1");
    assert.equal(cachedUserMsg?.context?.imageDataUrl, "data:image/png;base64,AAA");
  });

  it("stops an active slow stream mid-flight and saves the partial response", async () => {
    let streamCtl;
    fetchHandler = async (_url, call) => {
      streamCtl = createControllableSseStream(call.signal);
      return streamCtl.response;
    };

    const conv = aiConversationService.createConversation("openai", sampleOpenAiModel.id, "Abort Partial");
    const assistantMsgId = "ast-stop-1";
    const userMsg = {
      id: "usr-stop-1",
      role: "user",
      content: "Write a long story",
      timestamp: Date.now(),
    };

    aiBackgroundStreamService.startBackgroundAiChatStream({
      conversationId: conv.id,
      source: "quick_card",
      provider: "openai",
      apiKey: "sk-test-stop-1",
      model: sampleOpenAiModel,
      updatedMessages: [userMsg],
      assistantMsgId,
      lengthMode: "detailed",
      historyWindowSize: 8,
      useGiliFree: false,
      targetTier: "T1",
      isAutoRouted: false,
    });

    await waitUntil(() => Boolean(streamCtl));
    streamCtl.push('data: {"choices":[{"delta":{"content":"Partial response so far"}}]}\n\n');

    await waitUntil(() => {
      const live = aiBackgroundStreamService.getLiveConversationStreamState(conv.id);
      return live?.messages.find((m) => m.id === assistantMsgId)?.content === "Partial response so far";
    });
    assert.equal(aiBackgroundStreamService.isAnyAiStreamActive(), true);

    aiBackgroundStreamService.stopBackgroundAiStream(conv.id);

    assert.equal(aiBackgroundStreamService.isAnyAiStreamActive(), false);
    const savedConv = aiConversationService.getConversationById(conv.id);
    const savedAssistant = savedConv?.messages.find((m) => m.id === assistantMsgId);
    assert.equal(savedAssistant?.content, "Partial response so far");
  });

  it("prunes inactive conversations older than N days while retaining recent ones and reassigning active ID", () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const seeded = [
      {
        id: "conv-recent",
        title: "Recent Chat",
        modelId: "gpt-4o",
        providerId: "openai",
        messages: [{ id: "m1", role: "user", content: "Hi", timestamp: now - dayMs }],
        createdAt: now - dayMs,
        updatedAt: now - dayMs,
        totalTokens: 10,
      },
      {
        id: "conv-stale-10d",
        title: "Ten Days Old",
        modelId: "gpt-4o",
        providerId: "openai",
        messages: [{ id: "m2", role: "user", content: "Old", timestamp: now - 10 * dayMs }],
        createdAt: now - 10 * dayMs,
        updatedAt: now - 10 * dayMs,
        totalTokens: 20,
      },
      {
        id: "conv-stale-40d",
        title: "Forty Days Old",
        modelId: "gpt-4o",
        providerId: "openai",
        messages: [{ id: "m3", role: "user", content: "Older", timestamp: now - 40 * dayMs }],
        createdAt: now - 40 * dayMs,
        updatedAt: now - 40 * dayMs,
        totalTokens: 30,
      },
    ];

    localStorage.setItem("island_ai_conversations_v1", JSON.stringify(seeded));
    aiConversationService.setActiveConversationId("conv-stale-10d");

    aiConversationService.setAutoCleanupDays(7);
    assert.equal(aiConversationService.getAutoCleanupDays(), 7);

    const remaining = aiConversationService.getConversations();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, "conv-recent");
    assert.equal(aiConversationService.getConversationById("conv-stale-10d"), null);
    assert.equal(aiConversationService.getActiveConversationId(), "conv-recent");
    assert.equal(aiConversationService.pruneInactiveConversations(0), 0);
  });
});

describe("Suite 3 — Track 4: Gemini Interactions API, Fallback & Custom Models", () => {
  it("seeds gemini-3.8-flash and gemini-3.5-flash at the top of verified Gemini models", async () => {
    fetchHandler = async (url) => {
      assert.match(url, /\/v1beta\/models/);
      return createJsonResponse({
        models: [
          {
            name: "models/gemini-2.5-flash",
            displayName: "Gemini 2.5 Flash",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-2.0-flash",
            displayName: "Gemini 2.0 Flash",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      });
    };

    const result = await aiModelRegistry.verifyAndRegisterModels("gemini", "AIzaTestKey123");
    assert.equal(result.ok, true);
    assert.equal(result.models[0].id, "gemini-3.8-flash");
    assert.equal(result.models[1].id, "gemini-3.5-flash");
    assert.ok(result.models.some((m) => m.id === "gemini-2.5-flash"));
    assert.ok(result.models.some((m) => m.id === "gemini-2.0-flash"));
  });

  it("auto-falls back from unavailable gemini-2.5-flash to gemini-3.8-flash and updates router mode", async () => {
    aiRouterService.saveRouterConfig({
      ...aiRouterService.DEFAULT_ROUTER_CONFIG,
      selectedMode: "gemini-2.5-flash",
    });

    fetchHandler = async (url, call) => {
      assert.match(url, /\/v1beta\/interactions$/);
      if (call.parsedBody?.model === "gemini-2.5-flash") {
        return createJsonResponse(
          {
            error: {
              code: 400,
              message:
                "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements. We recommend you to use the Interactions API.",
            },
          },
          400
        );
      }

      assert.equal(call.parsedBody?.model, "gemini-3.8-flash");
      return createSseResponse([
        'event: interaction.start\ndata: {"event_type":"interaction.start","interaction":{"id":"int-fallback-1"}}\n\n',
        'event: content.delta\ndata: {"event_type":"content.delta","delta":{"type":"text","text":"Recovered via "}}\n\n',
        'event: content.delta\ndata: {"event_type":"content.delta","delta":{"type":"text","text":"Gemini 3.8 Flash!"}}\n\n',
        'event: interaction.completed\ndata: {"event_type":"interaction.completed","interaction":{"id":"int-fallback-1","usage":{"total_input_tokens":14,"total_output_tokens":9}}}\n\n',
      ]);
    };

    let streamedText = "";
    const result = await geminiApi.streamGeminiChat({
      apiKey: "AIzaFallbackKey999",
      model: sampleGeminiModel,
      messages: [{ id: "u-fb-1", role: "user", content: "Say hello", timestamp: Date.now() }],
      systemInstruction: "Be concise.",
      safetyMaxTokens: 512,
      onText: (chunk) => {
        streamedText += chunk;
      },
      onReasoning: () => {},
    });

    assert.equal(recordedRequests.length, 2);
    assert.equal(streamedText, "Recovered via Gemini 3.8 Flash!");
    assert.equal(result.rawOutputText, "Recovered via Gemini 3.8 Flash!");
    assert.equal(aiModelRegistry.isModelUnavailable("gemini", "gemini-2.5-flash"), true);
    assert.equal(aiModelRegistry.loadActiveModel("gemini").id, "gemini-3.8-flash");
    assert.ok(
      aiModelRegistry.getRegisteredModels("gemini").some((m) => m.id === "gemini-3.8-flash")
    );
    assert.equal(aiRouterService.loadRouterConfig().selectedMode, "gemini-3.8-flash");
  });

  it("chains multi-turn Interactions API calls with previous_interaction_id and streams thought + text deltas", async () => {
    fetchHandler = async (url, call) => {
      assert.match(url, /\/v1beta\/interactions$/);
      if (recordedRequests.length === 1) {
        assert.equal(call.parsedBody?.previous_interaction_id, undefined);
        return createSseResponse([
          'event: interaction.start\ndata: {"event_type":"interaction.start","interaction":{"id":"int-turn-1"}}\n\n',
          'event: content.delta\ndata: {"event_type":"content.delta","delta":{"type":"thought","thought":"Checking context..."}}\n\n',
          'event: content.delta\ndata: {"event_type":"content.delta","delta":{"type":"text","text":"First turn reply."}}\n\n',
          'event: interaction.completed\ndata: {"event_type":"interaction.completed","interaction":{"id":"int-turn-1","usage":{"total_input_tokens":10,"total_output_tokens":6}}}\n\n',
        ]);
      }

      assert.equal(call.parsedBody?.previous_interaction_id, "int-turn-1");
      return createSseResponse([
        'event: interaction.start\ndata: {"event_type":"interaction.start","interaction":{"id":"int-turn-2"}}\n\n',
        'event: content.delta\ndata: {"event_type":"content.delta","delta":{"type":"text","text":"Second turn reply."}}\n\n',
        'event: interaction.completed\ndata: {"event_type":"interaction.completed","interaction":{"id":"int-turn-2","usage":{"total_input_tokens":12,"total_output_tokens":5}}}\n\n',
      ]);
    };

    const gemini38 = {
      ...sampleGeminiModel,
      id: "gemini-3.8-flash",
      name: "Gemini 3.8 Flash",
    };
    const conversation = [
      { id: "turn-u1", role: "user", content: "First question", timestamp: Date.now() },
    ];

    let turn1Text = "";
    let turn1Thought = "";
    const res1 = await geminiApi.streamGeminiChat({
      apiKey: "AIzaMultiTurnKey888",
      model: gemini38,
      messages: conversation,
      systemInstruction: "Be helpful.",
      safetyMaxTokens: 512,
      onText: (t) => {
        turn1Text += t;
      },
      onReasoning: (r) => {
        turn1Thought += r;
      },
    });

    assert.equal(turn1Thought, "Checking context...");
    assert.equal(turn1Text, "First turn reply.");

    conversation.push(
      { id: "turn-a1", role: "assistant", content: res1.rawOutputText, timestamp: Date.now() },
      { id: "turn-u2", role: "user", content: "Follow-up question", timestamp: Date.now() }
    );

    let turn2Text = "";
    const res2 = await geminiApi.streamGeminiChat({
      apiKey: "AIzaMultiTurnKey888",
      model: gemini38,
      messages: conversation,
      systemInstruction: "Be helpful.",
      safetyMaxTokens: 512,
      onText: (t) => {
        turn2Text += t;
      },
      onReasoning: () => {},
    });

    assert.equal(recordedRequests.length, 2);
    assert.equal(recordedRequests[1].method, "POST");
    assert.equal(recordedRequests[1].headers["x-goog-api-key"], "AIzaMultiTurnKey888");
    assert.equal(recordedRequests[1].parsedBody?.previous_interaction_id, "int-turn-1");
    assert.equal(turn2Text, "Second turn reply.");
    assert.equal(res2.rawOutputText, "Second turn reply.");
  });

  it("normalizes and retains manually registered custom Gemini model across verification", async () => {
    const registered = aiModelRegistry.registerCustomModel(
      "gemini",
      "models/gemini-3.8-flash-custom",
      "Gemini 3.8 Custom"
    );
    assert.equal(registered.id, "gemini-3.8-flash-custom");
    assert.equal(registered.name, "Gemini 3.8 Custom");

    fetchHandler = async (url) => {
      assert.match(url, /\/v1beta\/models/);
      return createJsonResponse({
        models: [
          {
            name: "models/gemini-2.5-flash",
            displayName: "Gemini 2.5 Flash",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      });
    };

    const verifyRes = await aiModelRegistry.verifyAndRegisterModels("gemini", "AIzaCustomKey777");
    assert.equal(verifyRes.ok, true);

    const registeredModels = aiModelRegistry.getRegisteredModels("gemini");
    const customMatch = registeredModels.find((m) => m.id === "gemini-3.8-flash-custom");
    assert.ok(customMatch, "Expected gemini-3.8-flash-custom to be retained after verification");
    assert.equal(customMatch.name, "Gemini 3.8 Custom");
    assert.equal(aiModelRegistry.loadActiveModel("gemini").id, "gemini-3.8-flash-custom");
  });

  it("falls back to streamGenerateContent when interactions returns HTTP 404 in auto mode and parses thoughts, text, and truncation", async () => {
    geminiApi.setGeminiApiMode("auto");
    fetchHandler = async (url) => {
      if (url.endsWith("/v1beta/interactions")) {
        return createJsonResponse({ error: { code: 404, message: "Interactions endpoint not found" } }, 404);
      }

      assert.match(url, /\/v1beta\/models\/gemini-2\.5-flash:streamGenerateContent\?alt=sse/);
      return createSseResponse([
        'data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"Thinking deeply..."},{"text":"Part 1 "}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"Part 2"}]},"finishReason":"MAX_TOKENS"}],"usageMetadata":{"promptTokenCount":21,"candidatesTokenCount":12,"thoughtsTokenCount":5}}\n\n',
      ]);
    };

    let textOut = "";
    let thoughtOut = "";
    let truncated = false;
    const res = await geminiApi.streamGeminiChat({
      apiKey: "AIzaGenContentFallbackKey",
      model: sampleGeminiModel,
      messages: [{ id: "u-gc-1", role: "user", content: "Explain stream fallback", timestamp: Date.now() }],
      systemInstruction: "Be helpful.",
      safetyMaxTokens: 256,
      onText: (t) => {
        textOut += t;
      },
      onReasoning: (r) => {
        thoughtOut += r;
      },
      onTruncated: () => {
        truncated = true;
      },
    });

    assert.equal(recordedRequests.length, 2);
    assert.equal(thoughtOut, "Thinking deeply...");
    assert.equal(textOut, "Part 1 Part 2");
    assert.equal(res.rawReasoningText, "Thinking deeply...");
    assert.equal(res.rawOutputText, "Part 1 Part 2");
    assert.equal(res.apiInputTokens, 21);
    assert.equal(res.apiOutputTokens, 17);
    assert.equal(truncated, true);
  });
});

describe("Suite 4 — AI Router Heuristics, Vision Tiering, Budget Policy & Token Estimation", () => {
  it("classifies T0 greetings, T1 standard queries, T2 complex technical prompts, and length overrides", () => {
    const t0Halo = aiRouterService.evaluatePromptHeuristics("halo");
    assert.equal(t0Halo.tier, "T0");
    assert.equal(t0Halo.lengthMode, "compact");

    const t0Hi = aiRouterService.evaluatePromptHeuristics("hi");
    assert.equal(t0Hi.tier, "T0");
    assert.equal(t0Hi.lengthMode, "compact");

    const t1Standard = aiRouterService.evaluatePromptHeuristics(
      "Tolong buatkan draf ringkasan rapat tim proyek untuk dikirimkan kepada manajer produk sore ini."
    );
    assert.equal(t1Standard.tier, "T1");
    assert.equal(t1Standard.lengthMode, "normal");

    const t2Concurrency = aiRouterService.evaluatePromptHeuristics("mutex deadlock");
    assert.equal(t2Concurrency.tier, "T2");
    assert.ok(t2Concurrency.matchedSignals.includes("systems_concurrency"));

    const t2Db = aiRouterService.evaluatePromptHeuristics("explain analyze seq scan");
    assert.equal(t2Db.tier, "T2");
    assert.ok(t2Db.matchedSignals.includes("database_internals"));

    const t2Algo = aiRouterService.evaluatePromptHeuristics("raft consensus");
    assert.equal(t2Algo.tier, "T2");
    assert.ok(t2Algo.matchedSignals.includes("algorithms_theory"));

    const t2Security = aiRouterService.evaluatePromptHeuristics("oauth 2.0 pkce code_verifier");
    assert.equal(t2Security.tier, "T2");
    assert.ok(t2Security.matchedSignals.includes("security_architecture"));

    const compactOverride = aiRouterService.evaluatePromptHeuristics("/ringkas mutex deadlock");
    assert.equal(compactOverride.tier, "T2");
    assert.equal(compactOverride.lengthMode, "compact");
    assert.equal(compactOverride.cleanedPrompt, "mutex deadlock");

    const detailedOverride = aiRouterService.evaluatePromptHeuristics("/lengkap halo");
    assert.equal(detailedOverride.tier, "T0");
    assert.equal(detailedOverride.lengthMode, "detailed");
    assert.equal(detailedOverride.cleanedPrompt, "halo");
  });

  it("filters non-vision models like deepseek-chat when requiresVision is true", () => {
    const deepseekChat = {
      id: "deepseek-chat",
      name: "DeepSeek V3",
      provider: "deepseek",
      description: "DeepSeek text model",
      tier: "Medium",
      inputCostPer1M: 0.27,
      outputCostPer1M: 1.1,
    };

    const config = {
      ...aiRouterService.DEFAULT_ROUTER_CONFIG,
      tierMapping: {
        ...aiRouterService.DEFAULT_ROUTER_CONFIG.tierMapping,
        T1: { provider: "deepseek", modelId: "deepseek-chat", modelName: "DeepSeek V3" },
      },
    };

    const textOnlyResolution = aiRouterService.resolveTierModel(
      "T1",
      [deepseekChat, sampleOpenAiModel],
      config,
      false
    );
    assert.equal(textOnlyResolution?.targetModel.id, "deepseek-chat");
    assert.equal(textOnlyResolution?.targetProvider, "deepseek");

    const visionResolution = aiRouterService.resolveTierModel(
      "T1",
      [deepseekChat, sampleOpenAiModel],
      config,
      true
    );
    assert.equal(visionResolution?.targetModel.id, "gpt-4o");
    assert.equal(visionResolution?.targetProvider, "openai");
  });

  it("evaluates budget policies across warn, downgrade_to_t0, and block using real usage stats", () => {
    const unlimitedEval = aiRouterService.evaluateBudgetPolicy(
      aiRouterService.DEFAULT_ROUTER_CONFIG,
      aiChatService.loadUsageStats()
    );
    assert.equal(unlimitedEval.hasLimit, false);
    assert.equal(unlimitedEval.isExceeded, false);

    aiChatService.saveMonthlyLimit(100);
    aiChatService.recordTokenUsage(
      {
        ...sampleOpenAiModel,
        inputCostPer1M: 10,
        outputCostPer1M: 20,
      },
      500_000,
      500_000
    );

    const stats = aiChatService.loadUsageStats();
    assert.equal(stats.monthlyLimitIdr, 100);
    assert.ok(stats.estimatedCostIdr > 100);

    for (const action of ["warn", "downgrade_to_t0", "block"]) {
      const cfg = {
        ...aiRouterService.DEFAULT_ROUTER_CONFIG,
        budget: {
          monthlyLimitIdr: 100,
          warnAtPercent: 80,
          actionOnLimit: action,
        },
      };
      const evaluation = aiRouterService.evaluateBudgetPolicy(cfg, stats);
      assert.equal(evaluation.hasLimit, true);
      assert.equal(evaluation.isWarning, true);
      assert.equal(evaluation.isExceeded, true);
      assert.ok(evaluation.percentUsed >= 100);
      assert.equal(evaluation.action, action);
    }
  });

  it("estimates text tokens accurately across ASCII, CJK, symbols, and multimodal message contexts", () => {
    assert.equal(aiChatService.estimateTextTokens(""), 0);

    const ascii = "Hello world from Gili dynamic island";
    const cjk = "你好世界こんにちは안녕하세요";
    const symbols = "!@#$%^&*()[]{}+-=";

    const asciiTokens = aiChatService.estimateTextTokens(ascii);
    const cjkTokens = aiChatService.estimateTextTokens(cjk);
    const symbolTokens = aiChatService.estimateTextTokens(symbols);

    assert.ok(asciiTokens > 0);
    assert.ok(cjkTokens >= cjk.length, `Expected ~1+ token per CJK char, got ${cjkTokens}`);
    assert.ok(symbolTokens > Math.ceil(symbols.length / 3.8));

    const baseMessages = [
      { id: "m1", role: "user", content: "Analyze this", timestamp: Date.now() },
    ];
    const textOnlyInput = aiChatService.estimateMessagesInputTokens("System prompt", baseMessages);
    const multimodalInput = aiChatService.estimateMessagesInputTokens("System prompt", [
      {
        ...baseMessages[0],
        context: {
          type: "image",
          previewText: "Screenshot text",
          imageDataUrl: "data:image/png;base64,AAA",
        },
      },
    ]);

    assert.ok(multimodalInput >= textOnlyInput + 258);
  });
});

describe("Suite 5 — Navbar Config, macOS Icon Map & Pinned Apps Matcher", () => {
  it("loads default navbar config, persists Gili flyout switches, and converts hexToRgba", async () => {
    assert.equal(navbarConfigService.hexToRgba("#3882F6", 0.5), "rgba(56, 130, 246, 0.5)");
    assert.equal(navbarConfigService.hexToRgba("#fff", 2), "rgba(255, 255, 255, 1)");
    assert.equal(navbarConfigService.hexToRgba("#bad", 0.25), "rgba(187, 170, 221, 0.25)");
    assert.equal(navbarConfigService.hexToRgba("invalid", 0.25), "rgba(0, 0, 0, 0.25)");

    const origConsoleError = console.error;
    console.error = (...args) => {
      if (String(args[0] || "").includes("Failed to load settings store for navbar:")) return;
      origConsoleError(...args);
    };

    try {
      const initial = await navbarConfigService.loadNavbarConfig();
      assert.equal(initial.enabled, false);
      assert.equal(initial.monitorId, "all");
      assert.equal(initial.useGiliStart, false);
      assert.equal(initial.useGiliSearch, false);
      assert.equal(initial.useGiliQuickSettings, false);
      assert.equal(initial.useGiliVolumeOutput, false);
      assert.equal(initial.useGiliNotificationsCalendar, false);
      assert.equal(initial.useGiliTray, false);
      assert.equal(initial.modules.length, 7);

      let syncedDetail = null;
      const unsubscribe = navbarConfigService.subscribeToNavbarConfig((cfg) => {
        syncedDetail = cfg;
      });

      await navbarConfigService.saveNavbarConfig({
        ...initial,
        enabled: true,
        style: "liquid",
        position: "top",
        useGiliStart: true,
        useGiliSearch: true,
        useGiliQuickSettings: true,
        useGiliVolumeOutput: true,
        useGiliNotificationsCalendar: true,
        useGiliTray: true,
      });

      assert.equal(syncedDetail?.enabled, true);
      assert.equal(syncedDetail?.useGiliTray, true);

      const reloaded = await navbarConfigService.loadNavbarConfig();
      assert.equal(reloaded.enabled, true);
      assert.equal(reloaded.style, "liquid");
      assert.equal(reloaded.position, "top");
      assert.equal(reloaded.useGiliStart, true);
      assert.equal(reloaded.useGiliSearch, true);
      assert.equal(reloaded.useGiliQuickSettings, true);
      assert.equal(reloaded.useGiliVolumeOutput, true);
      assert.equal(reloaded.useGiliNotificationsCalendar, true);
      assert.equal(reloaded.useGiliTray, true);

      unsubscribe();
      await new Promise((resolve) => setTimeout(resolve, 270));
    } finally {
      console.error = origConsoleError;
    }
  });

  it("maps macOS icon slugs accurately including browser proxy PWAs and normalizes icon URLs", () => {
    assert.equal(macosIconMap.resolveMacOSIconSlug({ id: "antigravity", name: "Antigravity" }), "antigravity");
    assert.equal(macosIconMap.resolveMacOSIconSlug({ id: "claude", name: "Claude" }), "claude");
    assert.equal(macosIconMap.resolveMacOSIconSlug({ id: "chatgpt", name: "ChatGPT" }), "openai");
    assert.equal(macosIconMap.resolveMacOSIconSlug({ id: "ytm", name: "YouTube Music" }), "youtubemusic");
    assert.equal(macosIconMap.resolveMacOSIconSlug({ id: "yt", name: "YouTube" }), "youtube");
    assert.equal(
      macosIconMap.resolveMacOSIconSlug({
        id: "netflix-pwa",
        name: "Netflix",
        targetPath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome_proxy.exe",
      }),
      "netflix"
    );
    assert.equal(
      macosIconMap.resolveMacOSIconSlug({
        id: "vscode",
        name: "Code",
        targetPath: "C:\\Program Files\\Microsoft VS Code\\Code.exe",
      }),
      "vscode"
    );
    assert.equal(
      macosIconMap.resolveMacOSIconSlug({
        id: "wt",
        name: "Terminal",
        targetPath: "C:\\Users\\user\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe",
      }),
      "terminal"
    );
    assert.equal(macosIconMap.resolveMacOSIconSlug({ id: "calc", name: "Calculator" }), "calculator");
    assert.equal(
      macosIconMap.resolveMacOSIconSlug({
        id: "explorer",
        name: "File Explorer",
        targetPath: "C:\\Windows\\explorer.exe",
      }),
      "finder"
    );

    assert.equal(macosIconMap.normalizeIconUrl("  /icons/test.webp  "), "/icons/test.webp");
    assert.equal(macosIconMap.normalizeIconUrl("https://cdn.example.com/icon.png"), "https://cdn.example.com/icon.png");
    const rawPngBase64 = `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk`;
    assert.equal(macosIconMap.normalizeIconUrl(rawPngBase64), `data:image/png;base64,${rawPngBase64}`);
    assert.equal(macosIconMap.normalizeIconUrl("not-an-icon"), undefined);
  });

  it("matches UWP ApplicationFrameHost, Squirrel Discord, and standalone Chrome/Edge PWA windows", () => {
    assert.equal(
      pinnedAppsHelpers.extractExeBasename('"C:\\Program Files\\Microsoft VS Code\\Code.exe" --new-window'),
      "code.exe"
    );

    assert.equal(
      pinnedAppsHelpers.matchesAppId("settings", "ApplicationFrameHost.exe", "Settings"),
      true
    );
    assert.equal(
      pinnedAppsHelpers.matchesAppId("settings", "ApplicationFrameHost.exe", "Calculator"),
      false
    );

    const discordPinned = {
      id: "discord",
      name: "Discord",
      targetPath: "C:\\Users\\faiz\\AppData\\Local\\Discord\\Update.exe",
      args: "--processStart Discord.exe",
    };
    assert.equal(
      pinnedAppsHelpers.matchesPinnedApp(discordPinned, { process_name: "Discord.exe", title: "Discord" }),
      true
    );
    assert.equal(pinnedAppsHelpers.isBrowserPwaShortcut(discordPinned), false);

    const netflixPwa = {
      id: "netflix-pwa",
      name: "Netflix",
      targetPath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome_proxy.exe",
      args: "--app-id=kdfienlehba",
    };
    assert.equal(pinnedAppsHelpers.isBrowserPwaShortcut(netflixPwa), true);
    assert.equal(
      pinnedAppsHelpers.matchesPinnedApp(netflixPwa, { process_name: "chrome.exe", title: "Netflix" }),
      true
    );
    assert.equal(
      pinnedAppsHelpers.matchesPinnedApp(netflixPwa, {
        process_name: "chrome.exe",
        title: "Netflix - Google Chrome",
      }),
      false
    );

    const edgePwa = {
      id: "my-edge-pwa",
      name: "Linear",
      targetPath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge_proxy.exe",
      args: "--app-id=xyz",
    };
    assert.equal(
      pinnedAppsHelpers.matchesPinnedApp(edgePwa, { process_name: "msedge.exe", title: "Linear" }),
      true
    );
    assert.equal(
      pinnedAppsHelpers.matchesPinnedApp(edgePwa, {
        process_name: "msedge.exe",
        title: "Linear - Microsoft Edge",
      }),
      false
    );

    assert.deepEqual(
      pinnedAppsHelpers.getRunningAppMeta("ApplicationFrameHost.exe", "Pengaturan"),
      { id: "settings", name: "Settings", iconType: "settings" }
    );
    assert.deepEqual(
      pinnedAppsHelpers.getRunningAppMeta("Code.exe", "index.ts - island"),
      { id: "vscode", name: "Visual Studio Code", iconType: "code" }
    );
    assert.deepEqual(
      pinnedAppsHelpers.getRunningAppMeta("CustomEditor.exe", "notes.txt - CustomEditor"),
      { id: "customeditor", name: "CustomEditor" }
    );
  });
});

describe("Suite 6 — Productivity: Todo Rollover, Notes, Water Reminder & Notification DND", () => {
  it("computes next repeat due dates including weekday skips and month-end clamping, and rolls over stale tasks", () => {
    // Friday 2026-01-30 09:30 -> next weekday must skip Sat Jan 31 and Sun Feb 1 -> Monday 2026-02-02 09:30
    const friday = new Date(2026, 0, 30, 9, 30, 0).getTime();
    const nextWeekday = new Date(todoUtils.computeNextRepeatDue(friday, "weekdays", friday));
    assert.equal(nextWeekday.getFullYear(), 2026);
    assert.equal(nextWeekday.getMonth(), 1);
    assert.equal(nextWeekday.getDate(), 2);
    assert.equal(nextWeekday.getHours(), 9);
    assert.equal(nextWeekday.getMinutes(), 30);

    // Monthly from Jan 31 2026 -> clamps to Feb 28 2026
    const jan31 = new Date(2026, 0, 31, 8, 0, 0).getTime();
    const nextMonthly = new Date(todoUtils.computeNextRepeatDue(jan31, "monthly", jan31));
    assert.equal(nextMonthly.getFullYear(), 2026);
    assert.equal(nextMonthly.getMonth(), 1);
    assert.equal(nextMonthly.getDate(), 28);

    // Weekly from Jan 1 -> Jan 8
    const jan1 = new Date(2026, 0, 1, 10, 0, 0).getTime();
    const nextWeekly = new Date(todoUtils.computeNextRepeatDue(jan1, "weekly", jan1));
    assert.equal(nextWeekly.getDate(), 8);

    const todayNoon = new Date(2026, 2, 10, 12, 0, 0).getTime();
    const yesterdayNoon = new Date(2026, 2, 9, 12, 0, 0).getTime();

    const { updated, changed } = todoUtils.rolloverRecurringTasks(
      [
        {
          id: "t-roll",
          text: "Daily standup",
          completed: true,
          createdAt: yesterdayNoon,
          dueAt: yesterdayNoon,
          repeat: "daily",
          lastCompletedAt: yesterdayNoon,
        },
        {
          id: "t-done-today",
          text: "Already done today",
          completed: true,
          createdAt: yesterdayNoon,
          dueAt: todayNoon,
          repeat: "daily",
          lastCompletedAt: todayNoon,
        },
        {
          id: "t-once",
          text: "One-off task",
          completed: true,
          createdAt: yesterdayNoon,
          lastCompletedAt: yesterdayNoon,
          repeat: "none",
        },
      ],
      todayNoon
    );

    assert.equal(changed, true);
    const rolled = updated.find((item) => item.id === "t-roll");
    assert.equal(rolled?.completed, false);
    assert.equal(rolled?.lastCompletedAt, null);
    assert.ok((rolled?.dueAt ?? 0) >= new Date(2026, 2, 10, 0, 0, 0).getTime());
    assert.equal(updated.find((item) => item.id === "t-done-today")?.completed, true);
    assert.equal(updated.find((item) => item.id === "t-once")?.completed, true);
  });

  it("creates and deletes quick notes with persistence and update event emission", () => {
    let noteEventCount = 0;
    const onNotesUpdated = () => {
      noteEventCount++;
    };
    window.addEventListener("gili_notes_updated", onNotesUpdated);

    const created = noteUtils.createQuickNoteItem("Sprint Checklist\nVerify tests", "mint", true);
    assert.equal(created.title, "Sprint Checklist");
    assert.equal(created.content, "Verify tests");
    assert.equal(created.color, "mint");
    assert.equal(created.pinned, true);
    assert.equal(noteEventCount, 1);

    const loaded = noteUtils.loadMiniNotes();
    assert.ok(loaded.some((n) => n.id === created.id && n.title === "Sprint Checklist"));

    noteUtils.deleteQuickNoteItem(created.id);
    assert.equal(noteEventCount, 2);
    assert.equal(
      noteUtils.loadMiniNotes().some((n) => n.id === created.id),
      false
    );

    window.removeEventListener("gili_notes_updated", onNotesUpdated);
  });

  it("tracks water intake, opens streak at threshold, and supports undoing the last drink", () => {
    const initial = waterService.loadWaterData();
    assert.equal(initial.settings.dailyTargetMl, 3000);
    assert.equal(initial.records.length, 0);

    const now = Date.now();
    const first = waterService.logDrink(250, false, now - 1000);
    assert.equal(first.record.amountMl, 250);
    assert.equal(first.celebration, undefined);

    const second = waterService.logDrink(2400, false, now);
    assert.equal(second.celebration?.type, "streak_opened");
    assert.equal(second.celebration?.streakDays, 1);

    const dailyBeforeUndo = waterService.getDailyIntake();
    assert.equal(dailyBeforeUndo.totalMl, 2650);
    assert.equal(dailyBeforeUndo.drinkCount, 2);

    assert.equal(waterService.undoLastDrink(), true);
    const afterUndo = waterService.loadWaterData();
    assert.equal(afterUndo.records.length, 1);
    assert.equal(afterUndo.records[0].amountMl, 250);
    assert.equal(afterUndo.lastUndoneRecord?.amountMl, 2400);

    assert.equal(waterService.undoLastDrink(), true);
    assert.equal(waterService.undoLastDrink(), false);
  });

  it("persists Notification DND status and per-app mute toggles", () => {
    assert.equal(notificationHistoryService.getDndStatus(), false);
    notificationHistoryService.setDndStatus(true);
    assert.equal(notificationHistoryService.getDndStatus(), true);
    notificationHistoryService.setDndStatus(false);
    assert.equal(notificationHistoryService.getDndStatus(), false);

    assert.equal(notificationHistoryService.isAppMuted("WhatsApp"), false);
    notificationHistoryService.toggleMuteApp("WhatsApp");
    assert.equal(notificationHistoryService.isAppMuted("WhatsApp"), true);
    notificationHistoryService.toggleMuteApp("WhatsApp");
    assert.equal(notificationHistoryService.isAppMuted("WhatsApp"), false);
  });
});

describe("Suite 7 — Media Lyrics Parsing & LRCLIB Provider", () => {
  const invokeLyricsThroughFetch = async (cmd, args) => {
    if (cmd !== "fetch_external_lyrics_api") {
      throw new Error(`Unexpected command ${cmd}`);
    }
    const res = await fetch(args.url, {
      method: args.method || "GET",
      headers: args.headers || {},
      body: args.body,
    });
    if (res.status === 404) return "";
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    return res.text();
  };

  it("parses enhanced word-timed LRC lines and resolves word timing spans", () => {
    const enhancedLrc = [
      "[00:10.00]<00:10.00>Hello <00:10.50>world<00:11.00>",
      "[00:12.00]Plain second line",
    ].join("\n");

    const parsed = lyricsUtils.parseLrc(enhancedLrc);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].text, "Hello world");
    assert.equal(parsed[0].words?.length, 2);
    assert.equal(parsed[0].words?.[0].text, "Hello ");
    assert.equal(parsed[0].words?.[0].time, 10.0);
    assert.equal(parsed[0].words?.[0].endTime, 10.5);
    assert.equal(parsed[0].words?.[1].text, "world");
    assert.equal(parsed[0].words?.[1].time, 10.5);
    assert.equal(parsed[0].words?.[1].endTime, 11.0);

    const realResolved = wordTiming.resolveLineWords(parsed[0], parsed[1].time);
    assert.equal(realResolved.isRealWordTiming, true);
    assert.equal(realResolved.words.length, 2);

    const synthResolved = wordTiming.resolveLineWords(parsed[1]);
    assert.equal(synthResolved.isRealWordTiming, false);
    assert.equal(synthResolved.words.length, 3);
    assert.equal(synthResolved.words[0].text, "Plain ");
  });

  it("fetches synced lyrics from lrclibProvider while stripping browser artist names and official video tags", async () => {
    fetchHandler = async (url) => {
      if (url.startsWith("https://lrclib.net/api/get")) {
        assert.match(url, /track_name=Yellow/);
        assert.match(url, /artist_name=Coldplay/);
        return createJsonResponse({
          trackName: "Yellow",
          artistName: "Coldplay",
          duration: 266,
          syncedLyrics: "[00:12.00]Look at the stars\n[00:15.50]Look how they shine for you",
          plainLyrics: "Look at the stars\nLook how they shine for you",
        });
      }
      return createJsonResponse([]);
    };

    const result = await withTauriInvokeMock(invokeLyricsThroughFetch, () =>
      lrclibProviderModule.lrclibProvider.fetchLyrics(
        "Google Chrome",
        "Coldplay - Yellow (Official Video)",
        266
      )
    );

    assert.equal(result?.synced, true);
    assert.equal(result?.provider, "lrclib");
    assert.equal(result?.lines.length, 2);
    assert.equal(result?.lines[0].time, 12);
    assert.equal(result?.lines[0].text, "Look at the stars");
  });

  it("falls back to search closest to duration and handles instrumental and aborted requests", async () => {
    fetchHandler = async (url) => {
      if (url.startsWith("https://lrclib.net/api/get")) {
        return createTextResponse("", 404);
      }
      if (url.startsWith("https://lrclib.net/api/search")) {
        return createJsonResponse([
          {
            trackName: "Time",
            duration: 120,
            syncedLyrics: "[00:01.00]Short edit line one\n[00:02.00]Short edit line two",
          },
          {
            trackName: "Time",
            duration: 245,
            syncedLyrics: "[00:05.00]Full track line one\n[00:09.00]Full track line two",
          },
        ]);
      }
      return createTextResponse("", 404);
    };

    const durationMatch = await withTauriInvokeMock(invokeLyricsThroughFetch, () =>
      lrclibProviderModule.lrclibProvider.fetchLyrics("Hans Zimmer", "Time", 244)
    );
    assert.equal(durationMatch?.synced, true);
    assert.equal(durationMatch?.lines[0].text, "Full track line one");

    fetchHandler = async (url) => {
      if (url.startsWith("https://lrclib.net/api/get")) {
        return createJsonResponse({ instrumental: true });
      }
      return createJsonResponse([]);
    };

    const instrumental = await withTauriInvokeMock(invokeLyricsThroughFetch, () =>
      lrclibProviderModule.lrclibProvider.fetchLyrics("Artist", "Intro", 90)
    );
    assert.equal(instrumental?.synced, false);
    assert.equal(instrumental?.instrumental, true);
    assert.deepEqual(instrumental?.lines, []);

    const abortedController = new AbortController();
    abortedController.abort();
    await assert.rejects(
      () =>
        withTauriInvokeMock(invokeLyricsThroughFetch, () =>
          lrclibProviderModule.lrclibProvider.fetchLyrics(
            "Artist",
            "Song",
            200,
            abortedController.signal
          )
        ),
      (err) => err?.name === "AbortError"
    );
  });

  it("resolves fallback artwork for Spotify when SMTC omits thumbnail and preserves same-track covers", async () => {
    const artworkSvc = await vite.ssrLoadModule("/src/services/artworkService.ts");
    artworkSvc.clearArtworkCache();

    const spotifyNoThumb = {
      title: "Sweet Boy",
      artist: "Malcolm Todd",
      app_id: "Spotify.exe",
      playback_type: 1,
      is_playing: true,
      thumbnail: "",
    };

    const resolved = await withTauriInvokeMock(
      async (cmd, args) => {
        if (cmd === "fetch_external_lyrics_api" && String(args?.url).includes("itunes.apple.com")) {
          return JSON.stringify({
            results: [{ artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg" }],
          });
        }
        return "{}";
      },
      () => artworkSvc.fetchHighResArtwork(spotifyNoThumb)
    );
    assert.equal(resolved, "https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg");
    assert.equal(
      artworkSvc.getResolvedArtworkUrl(spotifyNoThumb, false),
      "https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg"
    );

    const prevWithThumb = { ...spotifyNoThumb, thumbnail: "data:image/jpeg;base64,AAA" };
    const sameTrackEmpty = artworkSvc.mergeMediaPayloadPreservingThumbnail(prevWithThumb, {
      ...spotifyNoThumb,
      thumbnail: undefined,
    });
    assert.equal(sameTrackEmpty.thumbnail, "data:image/jpeg;base64,AAA");

    const nextTrackEmpty = artworkSvc.mergeMediaPayloadPreservingThumbnail(prevWithThumb, {
      title: "New Track",
      artist: "Other Artist",
      is_playing: true,
    });
    assert.equal(nextTrackEmpty.thumbnail, undefined);

    assert.equal(
      artworkSvc.getBrandedMediaType({ title: "Summer/Winter", artist: "Artist", is_playing: true }),
      null
    );
    assert.equal(
      artworkSvc.getBrandedMediaType({ title: "r/reactjs", artist: "Reddit", is_playing: true }),
      "reddit"
    );
    assert.equal(
      artworkSvc.isThirdPartyMusicClient({
        title: "YouTube",
        artist: "Artist",
        app_id: "AppleMusic.exe",
        is_playing: true,
      }),
      true
    );
    assert.equal(
      artworkSvc.isThirdPartyMusicClient({
        title: "Track",
        artist: "Artist",
        web_source: "Tidal",
        is_browser: true,
        is_playing: true,
      }),
      true
    );
    artworkSvc.clearArtworkCache();
  });
});

describe("Suite 8 — Taskbar Flyout State Handshake Contract", () => {
  it("consumes __PENDING_TASKBAR_FLYOUT__ immediately and ignores stale async get_taskbar_flyout_state", async () => {
    let resolveInitialGet;
    const flyoutListeners = new Set();
    const invokeCalls = [];

    globalThis.__PENDING_TASKBAR_FLYOUT__ = {
      isOpen: true,
      target: "start",
      theme: "liquid",
      isLight: true,
      anchor: { originX: 120, originY: 800, position: "bottom", seq: 1 },
    };

    const harness = createTaskbarFlyoutHarness({
      invoke: (cmd, args) => {
        invokeCalls.push({ cmd, args });
        if (cmd === "get_taskbar_flyout_state") {
          return new Promise((resolve) => {
            resolveInitialGet = resolve;
          });
        }
        return Promise.resolve();
      },
      listen: (_event, cb) => {
        flyoutListeners.add(cb);
        return () => flyoutListeners.delete(cb);
      },
      onSwitchTarget: (target) => taskbarLaunchService.switchFlyoutTarget(target),
    });

    assert.equal(globalThis.__PENDING_TASKBAR_FLYOUT__, undefined);
    assert.equal(harness.state.isOpen, true);
    assert.equal(harness.state.target, "start");
    assert.equal(harness.state.theme, "liquid");
    assert.equal(harness.state.payloadLightOverride, true);
    assert.equal(invokeCalls[0]?.cmd, "get_taskbar_flyout_state");

    resolveInitialGet({ isOpen: true, target: "tray", theme: "solid" });
    await harness.initialGetPromise;

    assert.equal(harness.state.target, "start");
    assert.equal(harness.state.theme, "liquid");
    harness.cleanup();
  });

  it("applies async get_taskbar_flyout_state when arriving before live updates, and guards against stale reopen after live close", async () => {
    let resolveGetEarly;
    const listenersA = new Set();

    const earlyHarness = createTaskbarFlyoutHarness({
      invoke: (cmd) => {
        if (cmd === "get_taskbar_flyout_state") {
          return new Promise((resolve) => {
            resolveGetEarly = resolve;
          });
        }
        return Promise.resolve();
      },
      listen: (_event, cb) => {
        listenersA.add(cb);
        return () => listenersA.delete(cb);
      },
      onSwitchTarget: (target) => taskbarLaunchService.switchFlyoutTarget(target),
    });

    assert.equal(earlyHarness.state.isOpen, false);
    resolveGetEarly({ isOpen: true, target: "quickSettings", theme: "solid" });
    await earlyHarness.initialGetPromise;
    assert.equal(earlyHarness.state.isOpen, true);
    assert.equal(earlyHarness.state.target, "quickSettings");
    earlyHarness.cleanup();

    let resolveGetLate;
    const listenersB = new Set();
    const lateHarness = createTaskbarFlyoutHarness({
      invoke: (cmd) => {
        if (cmd === "get_taskbar_flyout_state") {
          return new Promise((resolve) => {
            resolveGetLate = resolve;
          });
        }
        return Promise.resolve();
      },
      listen: (_event, cb) => {
        listenersB.add(cb);
        return () => listenersB.delete(cb);
      },
      onSwitchTarget: (target) => taskbarLaunchService.switchFlyoutTarget(target),
    });

    for (const cb of listenersB) {
      cb({ payload: { isOpen: true, target: "notificationsCalendar", theme: "liquid" } });
    }
    assert.equal(lateHarness.state.isOpen, true);
    assert.equal(lateHarness.state.target, "notificationsCalendar");

    // Closing flag keeps UI intact during exit animation
    for (const cb of listenersB) {
      cb({ payload: { isOpen: false, target: "notificationsCalendar", closing: true } });
    }
    assert.equal(lateHarness.state.isOpen, true);

    // Final non-closing close event resets state
    for (const cb of listenersB) {
      cb({ payload: { isOpen: false, target: "notificationsCalendar", closing: false } });
    }
    assert.equal(lateHarness.state.isOpen, false);
    assert.equal(lateHarness.state.target, null);

    // Late IPC result must not resurrect closed flyout
    resolveGetLate({ isOpen: true, target: "start", theme: "solid" });
    await lateHarness.initialGetPromise;
    assert.equal(lateHarness.state.isOpen, false);
    assert.equal(lateHarness.state.target, null);
    lateHarness.cleanup();
  });

  it("switches Start flyout to Search with typeahead character and invokes switch_taskbar_flyout_target", async () => {
    const tauriCommands = [];
    await withTauriInvokeMock(
      async (cmd, args) => {
        tauriCommands.push({ cmd, args });
        if (cmd === "get_taskbar_flyout_state") {
          return { isOpen: true, target: "start", theme: "solid" };
        }
        return null;
      },
      async () => {
        const harness = createTaskbarFlyoutHarness({
          invoke: (cmd, args) => globalThis.__TAURI_INTERNALS__.invoke(cmd, args),
          listen: () => () => {},
          onSwitchTarget: (target) => taskbarLaunchService.switchFlyoutTarget(target),
        });

        await harness.initialGetPromise;
        assert.equal(harness.state.isOpen, true);
        assert.equal(harness.state.target, "start");

        // Ctrl+f must not trigger typeahead switch
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "f", ctrlKey: true, cancelable: true })
        );
        assert.equal(harness.state.target, "start");

        // Printable key triggers Start -> Search transition + Rust IPC switch
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", cancelable: true }));
        await waitUntil(() =>
          tauriCommands.some((c) => c.cmd === "switch_taskbar_flyout_target")
        );

        assert.equal(harness.state.target, "search");
        assert.equal(harness.state.searchInitialTab, "all");
        assert.equal(harness.state.searchInitialQuery, "n");
        const switchCall = tauriCommands.find((c) => c.cmd === "switch_taskbar_flyout_target");
        assert.deepEqual(switchCall?.args, { target: "search" });

        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
        assert.ok(tauriCommands.some((c) => c.cmd === "close_taskbar_flyout"));
        harness.cleanup();
      }
    );
  });
});

const sharedSuiteLoader = {
  loadModule: (specifier) => vite.ssrLoadModule(specifier),
};

registerTaskbarSuites(() => sharedSuiteLoader);
registerNotchAndUtilsSuites(() => sharedSuiteLoader);

// ============================================================================
// SUITE 10: Lyrics Share Card Studio Service & Canvas Dimensions
// ============================================================================

describe("Suite 10 — Lyrics Share Card Studio Service & Renderer", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.();
  });

  it("extracts shareable lines from synced lines or plain lyrics and manages 1-5 sorted selection", async () => {
    const shareSvc = await sharedSuiteLoader.loadModule("/src/services/lyricsShareService.ts");

    assert.deepEqual(
      shareSvc.extractShareableLyricLines({
        lines: [{ text: "Line A" }, { text: "" }, { text: "Line B" }],
      }),
      ["Line A", "", "Line B"]
    );
    assert.deepEqual(
      shareSvc.extractShareableLyricLines({
        lines: [],
        plain_lyrics: "Verse 1\nVerse 2",
      }),
      ["Verse 1", "Verse 2"]
    );

    const defaults = shareSvc.buildDefaultSelectedIndices(
      ["Intro", "", "First line", "Second line", "Third line"],
      1
    );
    assert.deepEqual(defaults, [2, 3]);

    let picked = shareSvc.toggleLyricSelection([3], 0);
    assert.deepEqual(picked, [0, 3]);
    picked = shareSvc.toggleLyricSelection(picked, 2);
    picked = shareSvc.toggleLyricSelection(picked, 4);
    picked = shareSvc.toggleLyricSelection(picked, 5);
    assert.deepEqual(picked, [0, 2, 3, 4, 5]);
    // At 5-line limit, additional distinct line is ignored while existing line still deselects
    assert.deepEqual(shareSvc.toggleLyricSelection(picked, 6), [0, 2, 3, 4, 5]);
    assert.deepEqual(shareSvc.toggleLyricSelection(picked, 3), [0, 2, 4, 5]);
  });

  it("extracts vibrant palettes, persists preferences, and resolves high-res card dimensions", async () => {
    const shareSvc = await sharedSuiteLoader.loadModule("/src/services/lyricsShareService.ts");
    const renderer = await sharedSuiteLoader.loadModule("/src/utils/lyricsCardRenderer.ts");

    const palettes = shareSvc.extractPalettesFromRgbPixels([
      [230, 52, 94],
      [225, 48, 88],
      [28, 30, 42],
    ]);
    assert.equal(palettes.length, 4);
    assert.equal(palettes[0].id, "vibrant");
    assert.equal(palettes[0].isLightText, true);

    const saved = shareSvc.saveLyricsCardPreferences({
      style: "apple",
      ratio: "9:16",
      showWatermark: false,
      paletteId: "deep",
      fontColor: "#FEF3C7",
      bgBlur: "none",
    });
    assert.equal(saved.style, "apple");
    assert.equal(saved.ratio, "9:16");
    assert.equal(saved.showWatermark, true);
    assert.equal(saved.fontColor, "#fef3c7");
    assert.equal(saved.bgBlur, "none");
    assert.equal(shareSvc.loadLyricsCardPreferences().paletteId, "deep");
    assert.equal(shareSvc.loadLyricsCardPreferences().fontColor, "#fef3c7");
    assert.equal(shareSvc.normalizeHexColor("abc"), "#aabbcc");
    assert.equal(shareSvc.isColorLight("#ffffff"), true);
    assert.equal(shareSvc.isColorLight("#141418"), false);
    assert.equal(shareSvc.hexToRgba("#ff0000", 0.5), "rgba(255, 0, 0, 0.5)");
    assert.equal(shareSvc.hsvToHex(0, 100, 100), "#ff0000");
    assert.deepEqual(shareSvc.hexToHsv("#ff0000"), { h: 0, s: 100, v: 100 });
    assert.equal(shareSvc.hsvToHex(210, 0, 100), "#ffffff");
    assert.equal(
      shareSvc.buildCardExportFilename("NIKI", "High School in Jakarta"),
      "NIKI - High School in Jakarta - Gili Lyrics"
    );

    assert.deepEqual(renderer.getCardDimensions("1:1", 1080), { width: 1080, height: 1080 });
    assert.deepEqual(renderer.getCardDimensions("4:5", 1080), { width: 1080, height: 1350 });
    assert.deepEqual(renderer.getCardDimensions("9:16", 1080), { width: 1080, height: 1920 });
  });
});
