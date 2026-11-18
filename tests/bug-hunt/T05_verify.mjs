import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const rootDir = process.cwd();

// Minimal DOM shim sufficient for React 19 react-dom/client mount, updates, events, and cleanup
function createMinimalDom() {
  class FakeEvent {
    constructor(type, opts = {}) {
      this.type = type;
      this.bubbles = Boolean(opts.bubbles);
      this.cancelable = Boolean(opts.cancelable);
      this.defaultPrevented = false;
      this.propagationStopped = false;
      this.target = null;
      this.currentTarget = null;
      this.key = opts.key || "";
      this.clientX = opts.clientX ?? 0;
      this.clientY = opts.clientY ?? 0;
      this.pointerId = opts.pointerId ?? 1;
      this.shiftKey = Boolean(opts.shiftKey);
      this.ctrlKey = Boolean(opts.ctrlKey);
      this.metaKey = Boolean(opts.metaKey);
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
    stopPropagation() {
      this.propagationStopped = true;
    }
    stopImmediatePropagation() {
      this.propagationStopped = true;
    }
  }

  class FakeNode {
    constructor(nodeType, nodeName) {
      this.nodeType = nodeType;
      this.nodeName = nodeName;
      this.childNodes = [];
      this.parentNode = null;
      this._listeners = new Map();
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    get lastChild() {
      return this.childNodes[this.childNodes.length - 1] || null;
    }
    get nextSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx >= 0 ? this.parentNode.childNodes[idx + 1] || null : null;
    }
    get ownerDocument() {
      return fakeDoc;
    }
    appendChild(child) {
      if (child.nodeType === 11) {
        const items = [...child.childNodes];
        for (const c of items) this.appendChild(c);
        return child;
      }
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    insertBefore(newChild, refChild) {
      if (!refChild) return this.appendChild(newChild);
      if (newChild.nodeType === 11) {
        const items = [...newChild.childNodes];
        for (const c of items) this.insertBefore(c, refChild);
        return newChild;
      }
      if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
      const idx = this.childNodes.indexOf(refChild);
      if (idx === -1) return this.appendChild(newChild);
      newChild.parentNode = this;
      this.childNodes.splice(idx, 0, newChild);
      return newChild;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx !== -1) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
    contains(other) {
      if (other === this) return true;
      return this.childNodes.some((c) => c.contains(other));
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      this._listeners.get(type)?.delete(fn);
    }
    dispatchEvent(evt) {
      evt.target = evt.target || this;
      let cur = this;
      while (cur) {
        evt.currentTarget = cur;
        const set = cur._listeners?.get(evt.type);
        if (set) {
          for (const fn of [...set]) {
            fn.call(cur, evt);
          }
        }
        if (evt.propagationStopped || !evt.bubbles) break;
        cur = cur.parentNode;
      }
      return !evt.defaultPrevented;
    }
    get textContent() {
      if (this.nodeType === 3) return this.nodeValue;
      return this.childNodes.map((c) => c.textContent).join("");
    }
    set textContent(v) {
      if (this.nodeType === 3) {
        this.nodeValue = String(v);
      } else {
        this.childNodes = [];
        if (v !== "" && v !== null && v !== undefined) {
          this.appendChild(fakeDoc.createTextNode(String(v)));
        }
      }
    }
  }

  class FakeElement extends FakeNode {
    constructor(tagName, namespaceURI = "http://www.w3.org/1999/xhtml") {
      super(1, tagName.toUpperCase());
      this.tagName = tagName.toUpperCase();
      this.namespaceURI = namespaceURI;
      this.attributes = new Map();
      this.style = {};
      this.value = "";
      this.checked = false;
      this.disabled = false;
      this._className = "";
      this.classList = {
        add: (...cls) => {
          const s = new Set(this._className.split(/\s+/).filter(Boolean));
          cls.forEach((c) => s.add(c));
          this._className = [...s].join(" ");
        },
        remove: (...cls) => {
          const s = new Set(this._className.split(/\s+/).filter(Boolean));
          cls.forEach((c) => s.delete(c));
          this._className = [...s].join(" ");
        },
        contains: (c) => this._className.split(/\s+/).includes(c),
      };
    }
    get className() {
      return this._className;
    }
    set className(v) {
      this._className = String(v || "");
    }
    setAttribute(k, v) {
      this.attributes.set(k, String(v));
      if (k === "class") this._className = String(v);
      if (k === "id") this.id = String(v);
    }
    getAttribute(k) {
      return this.attributes.has(k) ? this.attributes.get(k) : null;
    }
    removeAttribute(k) {
      this.attributes.delete(k);
    }
    hasAttribute(k) {
      return this.attributes.has(k);
    }
    getBoundingClientRect() {
      return { left: 100, top: 76, right: 300, bottom: 126, width: 200, height: 50 };
    }
    focus() {
      fakeDoc.activeElement = this;
    }
    matches() {
      return false;
    }
    closest() {
      return null;
    }
    setPointerCapture() {}
    hasPointerCapture() {
      return false;
    }
    releasePointerCapture() {}
    querySelectorAll(selector) {
      const results = [];
      const visit = (node) => {
        for (const c of node.childNodes) {
          if (c.nodeType === 1) {
            if (selector.startsWith("[role=") && c.getAttribute("role") === selector.slice(7, -2)) {
              results.push(c);
            } else if (/^[a-z]+$/i.test(selector) && c.tagName === selector.toUpperCase()) {
              results.push(c);
            }
            visit(c);
          }
        }
      };
      visit(this);
      return results;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
  }

  class FakeText extends FakeNode {
    constructor(v) {
      super(3, "#text");
      this.nodeValue = String(v);
    }
  }

  class FakeComment extends FakeNode {
    constructor(v) {
      super(8, "#comment");
      this.nodeValue = String(v);
    }
  }

  class FakeDoc extends FakeNode {
    constructor() {
      super(9, "#document");
      this.documentElement = new FakeElement("html");
      this.head = new FakeElement("head");
      this.body = new FakeElement("body");
      this.documentElement.appendChild(this.head);
      this.documentElement.appendChild(this.body);
      this.childNodes.push(this.documentElement);
      this.activeElement = this.body;
      this.visibilityState = "visible";
    }
    createElement(tag) {
      return new FakeElement(tag);
    }
    createElementNS(ns, tag) {
      return new FakeElement(tag, ns);
    }
    createTextNode(v) {
      return new FakeText(v);
    }
    createComment(v) {
      return new FakeComment(v);
    }
    createDocumentFragment() {
      return new FakeNode(11, "#document-fragment");
    }
    getElementById(id) {
      const visit = (n) => {
        if (n.id === id) return n;
        for (const c of n.childNodes) {
          const found = visit(c);
          if (found) return found;
        }
        return null;
      };
      return visit(this.documentElement);
    }
  }

  const fakeDoc = new FakeDoc();
  const fakeWin = {
    document: fakeDoc,
    innerWidth: 820,
    innerHeight: 460,
    devicePixelRatio: 1,
    location: { reload: () => {} },
    navigator: { userAgent: "node" },
    addEventListener: fakeDoc.addEventListener.bind(fakeDoc),
    removeEventListener: fakeDoc.removeEventListener.bind(fakeDoc),
    dispatchEvent: fakeDoc.dispatchEvent.bind(fakeDoc),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    requestAnimationFrame: (fn) => setTimeout(() => fn(performance.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    getComputedStyle: () => ({ userSelect: "none" }),
    CustomEvent: class CustomEvent extends FakeEvent {
      constructor(type, opts = {}) {
        super(type, opts);
        this.detail = opts.detail;
      }
    },
    Event: FakeEvent,
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLInputElement: FakeElement,
    HTMLTextAreaElement: FakeElement,
    HTMLSelectElement: FakeElement,
    HTMLButtonElement: FakeElement,
    HTMLIFrameElement: class HTMLIFrameElement {},
    SVGElement: FakeElement,
    Node: FakeNode,
  };
  fakeDoc.defaultView = fakeWin;
  return { fakeDoc, fakeWin, FakeEvent };
}

const { fakeDoc, fakeWin, FakeEvent } = createMinimalDom();
globalThis.window = fakeWin;
globalThis.document = fakeDoc;
globalThis.Element = fakeDoc.createElement("div").constructor;
globalThis.HTMLElement = globalThis.Element;
globalThis.HTMLInputElement = globalThis.Element;
globalThis.HTMLTextAreaElement = globalThis.Element;
globalThis.HTMLButtonElement = fakeWin.HTMLButtonElement;
globalThis.HTMLIFrameElement = fakeWin.HTMLIFrameElement;
globalThis.HTMLSelectElement = fakeWin.HTMLSelectElement;
globalThis.SVGElement = fakeWin.SVGElement;
globalThis.Node = Object.getPrototypeOf(Object.getPrototypeOf(fakeDoc.createElement("div")));
globalThis.Event = FakeEvent;
globalThis.CustomEvent = fakeWin.CustomEvent;
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
globalThis.requestAnimationFrame = fakeWin.requestAnimationFrame;
globalThis.cancelAnimationFrame = fakeWin.cancelAnimationFrame;
globalThis.localStorage = {
  _map: new Map(),
  getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
  setItem(k, v) { this._map.set(k, String(v)); },
  removeItem(k) { this._map.delete(k); },
};

const React = require("react");
const ReactDOM = require("react-dom");
const { createRoot } = require("react-dom/client");

// Capture mock IPC calls and custom handlers
const invokeCalls = [];
let invokeImpl = async (cmd, args) => {
  invokeCalls.push({ cmd, args });
  return null;
};

function createModuleLoader() {
  const cache = new Map();

  function loadTsModule(relPath) {
    const absPath = path.resolve(rootDir, relPath);
    if (cache.has(absPath)) return cache.get(absPath).exports;

    const src = fs.readFileSync(absPath, "utf8");
    const { outputText } = ts.transpileModule(src, {
      fileName: absPath,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });

    const mod = { exports: {} };
    cache.set(absPath, mod);

    const localRequire = (spec) => {
      if (spec === "react") return React;
      if (spec === "react-dom") return ReactDOM;
      if (spec === "react/jsx-runtime") return require("react/jsx-runtime");
      if (spec === "@tauri-apps/api/core") {
        return { invoke: (cmd, args) => invokeImpl(cmd, args) };
      }
      if (spec === "@tauri-apps/plugin-opener") {
        return { openUrl: async () => {} };
      }
      if (spec === "lucide-react") {
        return new Proxy(
          {},
          {
            get: (_, prop) => (props) => React.createElement("svg", { "data-icon": String(prop), ...props }),
          }
        );
      }
      if (spec === "framer-motion") {
        const motionCache = new Map();
        const motionProxy = new Proxy(
          {},
          {
            get: (_, tag) => {
              const key = String(tag);
              if (!motionCache.has(key)) {
                motionCache.set(
                  key,
                  React.forwardRef(({ children, initial, animate, exit, transition, variants, custom, whileTap, layout, transitionEnd, onAnimationComplete, onPanStart, onPanEnd, ...rest }, ref) =>
                    React.createElement(key, { ...rest, ref }, children)
                  )
                );
              }
              return motionCache.get(key);
            },
          }
        );
        return {
          motion: motionProxy,
          AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
        };
      }
      if (spec.startsWith(".")) {
        const resolvedBase = path.resolve(path.dirname(absPath), spec);
        const candidates = [
          resolvedBase,
          `${resolvedBase}.tsx`,
          `${resolvedBase}.ts`,
          path.join(resolvedBase, "index.tsx"),
          path.join(resolvedBase, "index.ts"),
        ];
        for (const cand of candidates) {
          if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
            const relCand = path.relative(rootDir, cand);
            // Stub heavy UI siblings like Tooltip / NotifIcon / MixerAppIcon when needed
            if (relCand.endsWith("Tooltip.tsx")) {
              return { Tooltip: ({ children }) => React.createElement(React.Fragment, null, children) };
            }
            if (relCand.endsWith("NotifIcon.tsx")) {
              return { getWeatherIcon: () => React.createElement("span", null, "W") };
            }
            if (relCand.endsWith("MixerAppIcon.tsx")) {
              return { MixerAppIcon: () => React.createElement("span", null, "Icon") };
            }
            if (relCand.endsWith("soundService.ts")) {
              return {
                playVolumeTick: () => {},
                playAudioTestSound: () => {},
              };
            }
            if (relCand.endsWith("systemMetricsService.ts")) {
              return { subscribeToSystemMetrics: () => () => {} };
            }
            return loadTsModule(relCand);
          }
        }
      }
      return require(spec);
    };

    const fn = new Function("require", "module", "exports", "__filename", "__dirname", outputText);
    fn(localRequire, mod, mod.exports, absPath, path.dirname(absPath));
    return mod.exports;
  }

  return { loadTsModule };
}

const loader = createModuleLoader();

function findReactProps(el) {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key ? el[key] : null;
}

async function runTests() {
  console.log("=== T05 EMPIRICAL BUG VERIFICATION ===");

  // TEST 1: PanelPageDots Rules of Hooks (PanelNavHeader.tsx:503) -> state/effect wipe & lint rule violation
  {
    console.log("\n[Test 1] PanelPageDots early return before hooks (PanelNavHeader.tsx:503)");
    const { PanelPageDots } = loader.loadTsModule("src/components/ui/PanelNavHeader.tsx");
    const container = fakeDoc.createElement("div");
    fakeDoc.body.appendChild(container);
    let caughtError = null;
    const root = createRoot(container, {
      onUncaughtError: (err) => {
        caughtError = err;
      },
    });

    ReactDOM.flushSync(() => {
      root.render(
        React.createElement(PanelPageDots, {
          totalPages: 5,
          currentPageIndex: 0,
          tabs: ["media_expanded", "quick_control", "ai_chat", "todo", "pomodoro"],
        })
      );
    });
    // Trigger hover state (isHovered = true) inside PanelPageDots
    const pillDiv = container.querySelectorAll("div").find((d) => typeof findReactProps(d)?.onMouseEnter === "function");
    ReactDOM.flushSync(() => {
      findReactProps(pillDiv).onMouseEnter();
    });
    const isHoveredBeforeZero = pillDiv.className.includes("is-hovered");

    // Transition totalPages 5 -> 0 (e.g. entering subpage volume_mixer or DropShelf settings)
    ReactDOM.flushSync(() => {
      root.render(
        React.createElement(PanelPageDots, {
          totalPages: 0,
          currentPageIndex: -1,
          tabs: ["media_expanded", "quick_control", "ai_chat", "todo", "pomodoro"],
        })
      );
    });
    // Transition totalPages 0 -> 5 (returning from subpage)
    ReactDOM.flushSync(() => {
      root.render(
        React.createElement(PanelPageDots, {
          totalPages: 5,
          currentPageIndex: 0,
          tabs: ["media_expanded", "quick_control", "ai_chat", "todo", "pomodoro"],
        })
      );
    });
    const pillDivAfter = container.querySelectorAll("div").find((d) => typeof findReactProps(d)?.onMouseEnter === "function");
    const isHoveredAfterReturn = pillDivAfter?.className.includes("is-hovered");
    console.log("isHovered before totalPages=0:", isHoveredBeforeZero, "after 5->0->5:", isHoveredAfterReturn, "React19 throw:", caughtError?.message || "none");

    ReactDOM.flushSync(() => root.unmount());
    fakeDoc.body.removeChild(container);
  }

  // TEST 2: WifiSubmenu open unsaved network + Escape propagation + double Enter race
  {
    console.log("\n[Test 2] WifiSubmenu unsaved open Wi-Fi, Escape bubble, & double Enter");
    invokeCalls.length = 0;
    invokeImpl = async (cmd, args) => {
      invokeCalls.push({ cmd, args });
      if (cmd === "get_wifi_status") {
        return {
          enabled: true,
          connected_ssid: "",
          networks: [
            { ssid: "Cafe_Free_WiFi", signal: 70, is_connected: false, is_secure: false, is_saved: false },
            { ssid: "Corp_WPA", signal: 80, is_connected: false, is_secure: true, is_saved: false },
          ],
        };
      }
      if (cmd === "connect_wifi") {
        throw new Error(""); // simulates netsh empty stderr failure when no profile exists
      }
      if (cmd === "connect_wifi_with_password") {
        await new Promise((r) => setTimeout(r, 40));
        return null;
      }
      return null;
    };

    const { WifiSubmenu } = loader.loadTsModule("src/components/ui/control-center/WifiSubmenu.tsx");
    const container = fakeDoc.createElement("div");
    fakeDoc.body.appendChild(container);
    const root = createRoot(container);

    ReactDOM.flushSync(() => {
      root.render(
        React.createElement(WifiSubmenu, {
          onBack: () => {},
          networkPing: null,
          initialEnabled: true,
          initialConnectedSsid: "",
        })
      );
    });
    await new Promise((r) => setTimeout(r, 30));

    // Check Escape propagation on password input for Corp_WPA
    const spans = [];
    const collect = (n) => {
      if (n.nodeType === 1) spans.push(n);
      n.childNodes.forEach(collect);
    };
    collect(container);

    const openWifiRow = spans.find((el) => el.textContent === "Cafe_Free_WiFi" && el.parentNode && findReactProps(el.parentNode)?.onClick)?.parentNode;
    const origConsoleErr = console.error;
    console.error = () => {};
    if (openWifiRow) {
      await findReactProps(openWifiRow).onClick();
    }
    console.error = origConsoleErr;
    const connectOpenCalls = invokeCalls.filter((c) => c.cmd === "connect_wifi");
    console.log("Open unsaved Wi-Fi called connect_wifi (without profile XML):", JSON.stringify(connectOpenCalls));

    const secWifiRow = spans.find((el) => el.textContent === "Corp_WPA" && el.parentNode && findReactProps(el.parentNode)?.onClick)?.parentNode;
    if (!secWifiRow) {
      console.log("DEBUG container textContent:", container.textContent);
      throw new Error("secWifiRow not found");
    }
    ReactDOM.flushSync(() => {
      findReactProps(secWifiRow).onClick();
    });

    const inputEl = container.querySelector("input");
    let windowSawEscape = false;
    const onWinKey = (e) => {
      if (e.key === "Escape") windowSawEscape = true;
    };
    fakeWin.addEventListener("keydown", onWinKey);

    ReactDOM.flushSync(() => {
      findReactProps(inputEl).onChange({ target: { value: "secret123" } });
    });

    const escEvt = new FakeEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    escEvt.target = inputEl;
    ReactDOM.flushSync(() => {
      findReactProps(inputEl).onKeyDown(escEvt);
      if (!escEvt.propagationStopped) fakeWin.dispatchEvent(escEvt);
    });
    fakeWin.removeEventListener("keydown", onWinKey);
    console.log("Password input Escape bubbled to window:", windowSawEscape);

    // Reopen password and test double Enter race
    const spans2 = [];
    const collect2 = (n) => {
      if (n.nodeType === 1) spans2.push(n);
      n.childNodes.forEach(collect2);
    };
    collect2(container);
    const secWifiRow2 = spans2.find((el) => el.textContent === "Corp_WPA" && el.parentNode && findReactProps(el.parentNode)?.onClick)?.parentNode;
    ReactDOM.flushSync(() => {
      findReactProps(secWifiRow2).onClick();
    });
    const inputEl2 = container.querySelector("input");
    ReactDOM.flushSync(() => {
      findReactProps(inputEl2).onChange({ target: { value: "secret123" } });
    });
    invokeCalls.length = 0;
    ReactDOM.flushSync(() => {
      findReactProps(container.querySelector("input")).onKeyDown(new FakeEvent("keydown", { key: "Enter", bubbles: true }));
      findReactProps(container.querySelector("input")).onKeyDown(new FakeEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 60));
    const pwdCalls = invokeCalls.filter((c) => c.cmd === "connect_wifi_with_password");
    console.log("Double Enter concurrent connect_wifi_with_password invocations:", pwdCalls.length);

    ReactDOM.flushSync(() => root.unmount());
    fakeDoc.body.removeChild(container);
  }

  // TEST 3: BluetoothSubmenu uncleaned 700ms timer after unmount
  {
    console.log("\n[Test 3] BluetoothSubmenu uncleaned 700ms timer on unmount");
    invokeCalls.length = 0;
    let btFetchCount = 0;
    invokeImpl = async (cmd) => {
      invokeCalls.push({ cmd });
      if (cmd === "get_bluetooth_status") {
        btFetchCount++;
        return { enabled: true, connected_name: "Not Connected", devices: [] };
      }
      if (cmd === "toggle_bluetooth") return false;
      return null;
    };

    const { BluetoothSubmenu } = loader.loadTsModule("src/components/ui/control-center/BluetoothSubmenu.tsx");
    const container = fakeDoc.createElement("div");
    fakeDoc.body.appendChild(container);
    const root = createRoot(container);

    ReactDOM.flushSync(() => {
      root.render(
        React.createElement(BluetoothSubmenu, {
          onBack: () => {},
          initialEnabled: true,
          initialConnectedName: "",
        })
      );
    });
    await new Promise((r) => setTimeout(r, 20));
    const countBeforeToggle = btFetchCount;
    const switchBtn = container.querySelectorAll("button").find((b) => b.getAttribute("role") === "switch");
    await findReactProps(switchBtn).onClick();
    // Unmount immediately before 700ms timer fires
    ReactDOM.flushSync(() => root.unmount());
    fakeDoc.body.removeChild(container);

    await new Promise((r) => setTimeout(r, 750));
    console.log("get_bluetooth_status calls before toggle:", countBeforeToggle, "after unmount+750ms:", btFetchCount);
  }

  // TEST 4: AudioOutputPanel keyboard Enter/Space on role="radio"
  {
    console.log("\n[Test 4] AudioOutputPanel keyboard activation on role='radio'");
    invokeCalls.length = 0;
    invokeImpl = async (cmd) => {
      invokeCalls.push({ cmd });
      if (cmd === "get_audio_endpoints") {
        return [
          { id: "dev1", name: "Speakers", desc: "Realtek", is_default: true, device_type: "speaker" },
          { id: "dev2", name: "Headphones", desc: "Sony", is_default: false, device_type: "headphones" },
        ];
      }
      return null;
    };

    const { AudioOutputPanel } = loader.loadTsModule("src/components/ui/AudioOutputPanel.tsx");
    const container = fakeDoc.createElement("div");
    fakeDoc.body.appendChild(container);
    const root = createRoot(container);

    ReactDOM.flushSync(() => {
      root.render(
        React.createElement(AudioOutputPanel, {
          onBack: () => {},
          soundLevel: 50,
          onSetSoundLevel: () => {},
        })
      );
    });
    await new Promise((r) => setTimeout(r, 30));

    const radios = container.querySelectorAll('[role="radio"]');
    const secondRadio = radios[1];
    const props = findReactProps(secondRadio);
    console.log("role='radio' has onKeyDown handler:", typeof props.onKeyDown === "function");
    console.log("Card text contains hardcoded 'Tersambung':", secondRadio.textContent.includes("Tersambung"));

    ReactDOM.flushSync(() => root.unmount());
    fakeDoc.body.removeChild(container);
  }

  // TEST 5: SystemMonitorPanel offline ping === null shows "16 ms"
  {
    console.log("\n[Test 5] SystemMonitorPanel ping=null displays '16 ms'");
    const { SystemMonitorPanel } = loader.loadTsModule("src/components/ui/SystemMonitorPanel.tsx");
    const container = fakeDoc.createElement("div");
    fakeDoc.body.appendChild(container);
    const root = createRoot(container);

    ReactDOM.flushSync(() => {
      root.render(React.createElement(SystemMonitorPanel, { ping: null, wifiSsid: "Loading..." }));
    });
    console.log("Rendered text includes '16 ms' when ping=null:", container.textContent.includes("16 ms"));

    ReactDOM.flushSync(() => root.unmount());
    fakeDoc.body.removeChild(container);
  }

  // TEST 6: VolumeMixerPanel polling overwrites dragging slider
  {
    console.log("\n[Test 6] VolumeMixerPanel polling overwrites active drag state");
    let pollResolve;
    invokeImpl = (cmd) => {
      if (cmd === "get_audio_sessions") {
        return new Promise((res) => {
          if (!pollResolve) {
            res([{ pid: 100, name: "spotify.exe", volume: 0.2, muted: false }]);
            pollResolve = () => {};
          } else {
            pollResolve = res;
          }
        });
      }
      if (cmd === "get_audio_endpoints") return Promise.resolve([]);
      return Promise.resolve(null);
    };

    const { VolumeMixerPanel } = loader.loadTsModule("src/components/ui/VolumeMixerPanel.tsx");
    const container = fakeDoc.createElement("div");
    fakeDoc.body.appendChild(container);
    const root = createRoot(container);

    let sessions = [{ pid: 100, name: "spotify.exe", volume: 0.2, muted: false }];
    const updateSessions = (updater) => {
      sessions = typeof updater === "function" ? updater(sessions) : updater;
      ReactDOM.flushSync(() => {
        root.render(
          React.createElement(VolumeMixerPanel, {
            slideDirection: 0,
            soundLevel: 60,
            onSetSoundLevel: () => {},
            audioSessions: sessions,
            onUpdateAudioSessions: updateSessions,
          })
        );
      });
    };

    ReactDOM.flushSync(() => {
      root.render(
        React.createElement(VolumeMixerPanel, {
          slideDirection: 0,
          soundLevel: 60,
          onSetSoundLevel: () => {},
          audioSessions: sessions,
          onUpdateAudioSessions: updateSessions,
        })
      );
    });
    await new Promise((r) => setTimeout(r, 20));

    // Find app slider div (the one with onPointerDown inside the row, not the vertical master slider)
    const allEls = [];
    const walk = (n) => {
      if (n.nodeType === 1) allEls.push(n);
      n.childNodes.forEach(walk);
    };
    walk(container);
    const appSlider = allEls.find(
      (el) => el.getAttribute("role") !== "slider" && typeof findReactProps(el)?.onPointerDown === "function"
    );

    // Simulate user starting drag to 80% (clientX=260 -> (260-100)/200 = 80%)
    ReactDOM.flushSync(() => {
      findReactProps(appSlider).onPointerDown({
        stopPropagation: () => {},
        currentTarget: appSlider,
        clientX: 260,
        pointerId: 1,
      });
    });
    console.log("User dragged app volume to:", Math.round(sessions[0].volume * 100) + "%");

    // Wait for 2500ms polling interval? No, let's check if 2.5s poll fires and overwrites
    await new Promise((r) => setTimeout(r, 2600));
    if (typeof pollResolve === "function") {
      pollResolve([{ pid: 100, name: "spotify.exe", volume: 0.2, muted: false }]);
      await new Promise((r) => setTimeout(r, 20));
    }
    console.log("After background poll while still dragging, app volume became:", Math.round(sessions[0].volume * 100) + "%");

    ReactDOM.flushSync(() => root.unmount());
    fakeDoc.body.removeChild(container);
  }

  // TEST 7: ControlCenterPanel Mode Dropdown portal outside #notch-pill & non-keyboard tiles
  {
    console.log("\n[Test 7] ControlCenterPanel portal outside #notch-pill & tile keyboard a11y");
    const { ControlCenterPanel } = loader.loadTsModule("src/components/ui/ControlCenterPanel.tsx");
    const notchPill = fakeDoc.createElement("div");
    notchPill.setAttribute("id", "notch-pill");
    fakeDoc.body.appendChild(notchPill);
    const root = createRoot(notchPill);

    ReactDOM.flushSync(() => {
      root.render(
        React.createElement(ControlCenterPanel, {
          displayLevel: 80,
          onSetDisplayLevel: () => {},
          brightnessMode: "manual",
          onSetBrightnessMode: () => {},
          soundLevel: 60,
          onSetSoundLevel: () => {},
          wifiName: "HomeWiFi",
          isEthernetConnected: false,
          networkPing: 20,
          btName: "Not Connected",
          isHotspotOn: false,
          onToggleHotspot: () => {},
          focusMode: "Normal",
          onSelectFocusMode: () => {},
          focusModeOptions: [
            { id: "Normal", label: "Normal", desc: "Normal mode", icon: null, color: "" },
            { id: "DND", label: "DND", desc: "Quiet", icon: null, color: "" },
            { id: "Gaming", label: "Gaming", desc: "Gaming", icon: null, color: "" },
            { id: "Sleep", label: "Sleep", desc: "Sleep", icon: null, color: "" },
          ],
          stashedFilesCount: 0,
          onGoToTab: () => {},
          onClose: () => {},
        })
      );
    });

    const allDivs = [];
    const walk = (n) => {
      if (n.nodeType === 1) allDivs.push(n);
      n.childNodes.forEach(walk);
    };
    walk(notchPill);

    const wifiTile = allDivs.find((el) => el.tagName === "DIV" && el.textContent.includes("HomeWiFi") && typeof findReactProps(el)?.onClick === "function");
    const modeTile = allDivs.find((el) => el.tagName === "DIV" && el.textContent.includes("Normal") && typeof findReactProps(el)?.onClick === "function");
    console.log("Wi-Fi tile is <DIV> with role/tabIndex:", wifiTile?.getAttribute("role"), wifiTile?.getAttribute("tabIndex"));
    console.log("Mode tile is <DIV> with role/tabIndex:", modeTile?.getAttribute("role"), modeTile?.getAttribute("tabIndex"));

    ReactDOM.flushSync(() => {
      findReactProps(modeTile).onClick({ stopPropagation: () => {} });
    });

    const bodyDirectChildren = fakeDoc.body.childNodes.filter((n) => n !== notchPill);
    const portalOutsideNotch = bodyDirectChildren.length > 0 && !notchPill.contains(bodyDirectChildren[0]);
    const portalBackdrop = bodyDirectChildren.find((n) => n.className?.includes("inset-0"));
    console.log("Mode dropdown portal rendered directly on document.body outside #notch-pill:", portalOutsideNotch);
    console.log("Portal renders extra fixed inset-0 backdrop outside #notch-pill:", Boolean(portalBackdrop));

    ReactDOM.flushSync(() => root.unmount());
    fakeDoc.body.removeChild(notchPill);
  }
}

runTests().catch((err) => {
  console.error("Test harness error:", err);
  process.exit(1);
});
