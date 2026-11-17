import { createServer } from "vite";

export function createMemoryStorage() {
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

export function defineGlobalIfConfigurable(name, value) {
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

export function installBrowserShim() {
  const windowEvents = new EventTarget();

  defineGlobalIfConfigurable("localStorage", createMemoryStorage());
  defineGlobalIfConfigurable("sessionStorage", createMemoryStorage());
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

  defineGlobalIfConfigurable("window", globalThis);
  delete globalThis.__TAURI_INTERNALS__;
  delete globalThis.__TAURI__;
}

export function createMockFetchHarness() {
  const state = {
    recordedRequests: [],
    fetchHandler: async (url) => {
      throw new Error(`Unexpected unmocked fetch call to ${url}`);
    },
  };

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
    state.recordedRequests.push(call);
    return state.fetchHandler(url, call);
  });

  return state;
}

export async function createViteSsrLoader() {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });
  return {
    vite,
    async loadModule(specifier) {
      return vite.ssrLoadModule(specifier);
    },
    async close() {
      await vite.close();
    },
  };
}
