export interface PinnedAppMatcherInput {
  id: string;
  name: string;
  targetPath?: string;
  args?: string;
}

export interface RunningWindowMatcherInput {
  process_name: string;
  title: string;
}

const BROWSER_PROXY_MAP: Record<string, string> = {
  "chrome_proxy.exe": "chrome.exe",
  "msedge_proxy.exe": "msedge.exe",
  "brave_proxy.exe": "brave.exe",
};

const BROWSER_EXES = new Set([
  "chrome.exe",
  "msedge.exe",
  "brave.exe",
  "vivaldi.exe",
  "opera.exe",
  "firefox.exe",
]);

const BROWSER_APP_IDS = new Set([
  "chrome",
  "brave",
  "edge",
  "msedge",
  "firefox",
  "arc",
  "vivaldi",
  "opera",
]);

const GENERIC_STEMS = new Set(["app", "application", "host", "frame", "helper", "client", "main", "bin"]);

function splitTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

export function extractExeBasename(targetPath?: string): string {
  if (!targetPath) return "";
  const match = targetPath.match(/([^\\/"']+\.exe)(?=[\s"']|$)/i);
  return match ? match[1].toLowerCase() : "";
}

const IGNORED_WRAPPER_EXES = new Set([
  "applicationframehost.exe",
  "update.exe",
  "squirrel.exe",
  "launcher.exe",
  "cmd.exe",
]);

function extractTargetExecutable(targetPath?: string, args?: string): string {
  const combined = `${targetPath || ""} ${args || ""}`;
  const squirrelMatch = combined.match(/--processStart\s+["']?([^\\/"'\s]+\.exe)["']?/i);
  if (squirrelMatch) {
    return squirrelMatch[1].toLowerCase();
  }
  const direct = extractExeBasename(targetPath);
  return IGNORED_WRAPPER_EXES.has(direct) ? "" : direct;
}

function getExpectedBrowserExeForPwa(app: PinnedAppMatcherInput): string | null {
  const exe = extractExeBasename(app.targetPath);
  const combined = `${app.targetPath || ""} ${app.args || ""}`;
  const isPwaFlags = /(?:--app-id=|--app=)/i.test(combined);
  if (exe && BROWSER_PROXY_MAP[exe]) {
    return BROWSER_PROXY_MAP[exe];
  }
  if ((isPwaFlags || (exe && BROWSER_EXES.has(exe))) && !BROWSER_APP_IDS.has(app.id.toLowerCase())) {
    return exe || "chrome.exe";
  }
  return null;
}

export function isBrowserPwaShortcut(app: PinnedAppMatcherInput): boolean {
  return getExpectedBrowserExeForPwa(app) !== null;
}

function isStandaloneBrowserWindowTitle(title: string, appName: string): boolean {
  const t = title.trim().toLowerCase();
  const needle = appName.trim().toLowerCase();
  if (!t || needle.length < 2) return false;
  if (
    t.endsWith(" - google chrome") ||
    t.endsWith(" - microsoft edge") ||
    t.endsWith(" - brave")
  ) {
    return false;
  }
  return t === needle || t.includes(needle);
}

export function matchesAppId(
  appId: string,
  processName: string,
  title?: string,
  appName?: string
): boolean {
  const p = processName.toLowerCase();
  const stem = p.replace(/\.exe$/i, "");
  const id = appId.toLowerCase();
  const t = (title || "").toLowerCase();

  switch (id) {
    case "gili":
      return stem === "gili";
    case "explorer":
      return stem === "explorer";
    case "chrome":
      return stem === "chrome";
    case "brave":
      return stem === "brave";
    case "edge":
    case "msedge":
      return stem === "msedge";
    case "vscode":
      return stem === "code" || stem === "code - insiders";
    case "terminal":
      return (
        stem === "windowsterminal" ||
        stem === "cmd" ||
        stem === "powershell" ||
        stem === "pwsh"
      );
    case "settings":
      return (
        stem === "systemsettings" ||
        (stem === "applicationframehost" &&
          (t.includes("settings") || t.includes("pengaturan") || t.includes("setelan")))
      );
    case "spotify":
      return stem === "spotify";
    case "discord":
      return stem === "discord";
    case "whatsapp":
      return stem === "whatsapp" || stem === "whatsapp.root";
    default: {
      if (!stem || !id) return false;
      if (stem === id) return true;
      const stemTokens = splitTokens(stem).filter((tok) => !GENERIC_STEMS.has(tok));
      const primaryStem = stemTokens[0] || "";
      if (primaryStem.length < 3) return false;

      const idTokens = splitTokens(id).filter((tok) => !GENERIC_STEMS.has(tok));
      if (idTokens.some((tok) => tok === primaryStem)) {
        return true;
      }

      if (appName) {
        const nameJoined = splitTokens(appName).join("");
        const stemJoined = stemTokens.join("");
        if (nameJoined.length >= 3 && (primaryStem === nameJoined || stemJoined === nameJoined)) {
          return true;
        }
      }
      return false;
    }
  }
}

export function matchesPinnedApp(
  app: PinnedAppMatcherInput,
  win: RunningWindowMatcherInput
): boolean {
  const p = (win.process_name || "").toLowerCase();
  if (!p) return false;

  const pwaBrowserExe = getExpectedBrowserExeForPwa(app);
  if (pwaBrowserExe) {
    return p === pwaBrowserExe && isStandaloneBrowserWindowTitle(win.title || "", app.name);
  }

  const targetExe = extractTargetExecutable(app.targetPath, app.args);
  if (targetExe) {
    return p === targetExe;
  }

  return matchesAppId(app.id, p, win.title, app.name);
}

export function getRunningAppMeta(
  processName: string,
  title: string
): { id: string; name: string; iconType?: any } {
  const p = processName.toLowerCase();
  const stem = p.replace(/\.exe$/i, "");
  const t = title.toLowerCase();

  if (stem === "discord") return { id: "discord", name: "Discord", iconType: "discord" };
  if (stem === "spotify") return { id: "spotify", name: "Spotify", iconType: "spotify" };
  if (stem === "whatsapp" || stem === "whatsapp.root") {
    return { id: "whatsapp", name: "WhatsApp", iconType: "whatsapp" };
  }
  if (stem === "brave") return { id: "brave", name: "Brave", iconType: "brave" };
  if (stem === "chrome") return { id: "chrome", name: "Google Chrome", iconType: "browser" };
  if (stem === "code" || stem === "code - insiders") {
    return { id: "vscode", name: "Visual Studio Code", iconType: "code" };
  }
  if (stem === "explorer") return { id: "explorer", name: "File Explorer", iconType: "folder" };
  if (
    stem === "windowsterminal" ||
    stem === "cmd" ||
    stem === "powershell" ||
    stem === "pwsh"
  ) {
    return { id: "terminal", name: "Terminal", iconType: "terminal" };
  }
  if (
    stem === "systemsettings" ||
    (stem === "applicationframehost" &&
      (t.includes("settings") || t.includes("pengaturan") || t.includes("setelan")))
  ) {
    return { id: "settings", name: "Settings", iconType: "settings" };
  }
  if (stem === "gili") {
    return { id: "gili", name: "Gili Settings", iconType: "gili" };
  }

  const cleanName = processName.replace(/\.exe$/i, "");
  const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  const friendlyTitle = title.split(" - ")[0] || capitalized;
  return { id: cleanName.toLowerCase(), name: friendlyTitle };
}

