export interface PinnedAppMatcherInput {
  id: string;
  name: string;
  targetPath?: string;
  args?: string;
  arguments?: string;
  lnkPath?: string;
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
  const trimmed = targetPath.trim();
  const quotedTarget = trimmed.startsWith('"') ? trimmed.match(/^"([^"]+)"/)?.[1] : undefined;
  const candidate = quotedTarget ?? trimmed;
  const match = candidate.match(/([^\\/"'=]+?\.exe)(?=[\s"']|$)/i);
  return match ? match[1].toLowerCase() : "";
}

const IGNORED_WRAPPER_EXES = new Set([
  "applicationframehost.exe",
  "update.exe",
  "squirrel.exe",
  "launcher.exe",
  "cmd.exe",
  "spotifymigrator.exe",
  "spotifylauncher.exe",
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
  const rawArgs = app.args ?? app.arguments ?? "";
  const combined = `${app.targetPath || ""} ${app.lnkPath || ""} ${rawArgs}`;
  if (combined.toLowerCase().includes("4df9e0f8.netflix") || /hostid\s*=\s*["']?pwa/i.test(combined)) {
    return "msedge.exe";
  }
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

interface KnownAppMetaDef {
  id: string;
  aliases?: string[];
  stems: string[];
  name: string;
  iconType?: string;
}

const KNOWN_APP_DEFS: KnownAppMetaDef[] = [
  { id: "gili", stems: ["gili"], name: "Gili Settings", iconType: "gili" },
  { id: "explorer", stems: ["explorer"], name: "File Explorer", iconType: "folder" },
  { id: "chrome", stems: ["chrome"], name: "Google Chrome", iconType: "browser" },
  { id: "brave", stems: ["brave"], name: "Brave", iconType: "brave" },
  { id: "edge", aliases: ["msedge"], stems: ["msedge"], name: "Microsoft Edge" },
  { id: "firefox", stems: ["firefox"], name: "Firefox" },
  { id: "vscode", stems: ["code", "code - insiders"], name: "Visual Studio Code", iconType: "code" },
  { id: "terminal", stems: ["windowsterminal", "cmd", "powershell", "pwsh"], name: "Terminal", iconType: "terminal" },
  { id: "spotify", stems: ["spotify"], name: "Spotify", iconType: "spotify" },
  { id: "discord", stems: ["discord"], name: "Discord", iconType: "discord" },
  { id: "whatsapp", stems: ["whatsapp", "whatsapp.root"], name: "WhatsApp", iconType: "whatsapp" },
  { id: "calculator", aliases: ["calculatorapp"], stems: ["calculatorapp", "calc", "win32calc"], name: "Calculator", iconType: "calculator" },
  { id: "notepad", aliases: ["windowsnotepad"], stems: ["notepad"], name: "Notepad" },
  { id: "paint", aliases: ["mspaint"], stems: ["mspaint", "paint"], name: "Paint" },
  { id: "photos", aliases: ["windows.photos"], stems: ["photos", "microsoft.photos"], name: "Photos" },
  { id: "store", aliases: ["windowsstore", "winstore.app", "microsoft_store"], stems: ["winstore.app"], name: "Microsoft Store" },
  { id: "snippingtool", aliases: ["screensketch"], stems: ["snippingtool", "screensketch"], name: "Snipping Tool" },
  { id: "mediaplayer", aliases: ["zunemusic", "microsoft.media.player", "media_player"], stems: ["microsoft.media.player", "video.ui"], name: "Media Player" },
  { id: "clock", aliases: ["windowsalarms"], stems: ["time"], name: "Clock" },
  { id: "telegram", stems: ["telegram"], name: "Telegram" },
  { id: "slack", stems: ["slack"], name: "Slack" },
  { id: "steam", stems: ["steam", "steamwebhelper"], name: "Steam" },
  { id: "obs", aliases: ["obs64", "obs32"], stems: ["obs64", "obs32", "obs"], name: "OBS Studio" },
  { id: "vlc", stems: ["vlc"], name: "VLC" },
];

function findKnownAppById(appId: string): KnownAppMetaDef | undefined {
  const id = appId.toLowerCase();
  return KNOWN_APP_DEFS.find((def) => def.id === id || def.aliases?.includes(id));
}

function findKnownAppByStem(stem: string): KnownAppMetaDef | undefined {
  return KNOWN_APP_DEFS.find((def) => def.stems.includes(stem));
}

function expandNormalizedTokens(value: string): string[] {
  const raw = splitTokens(value).filter((tok) => !GENERIC_STEMS.has(tok));
  const out = new Set<string>();
  for (const tok of raw) {
    out.add(tok);
    const stripped = tok.replace(/^(microsoft|windows)/, "");
    if (stripped.length >= 3) {
      out.add(stripped);
    }
  }
  return Array.from(out);
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

  if (id === "settings") {
    return (
      stem === "systemsettings" ||
      (stem === "applicationframehost" &&
        (t.includes("settings") || t.includes("pengaturan") || t.includes("setelan")))
    );
  }

  const known = findKnownAppById(id);
  if (known) {
    return known.stems.includes(stem);
  }

  if (!stem || !id) return false;
  if (stem === id) return true;
  const stemTokens = expandNormalizedTokens(stem);
  const primaryStem = stemTokens[0] || "";
  if (primaryStem.length < 3) return false;

  const idTokens = expandNormalizedTokens(id);
  if (idTokens.some((tok) => stemTokens.includes(tok))) {
    return true;
  }

  if (appName) {
    const nameJoined = splitTokens(appName).join("");
    const stemJoined = splitTokens(stem).filter((tok) => !GENERIC_STEMS.has(tok)).join("");
    if (nameJoined.length >= 3 && (primaryStem === nameJoined || stemJoined === nameJoined)) {
      return true;
    }
  }
  return false;
}

export function matchesPinnedApp(
  app: PinnedAppMatcherInput,
  win: RunningWindowMatcherInput
): boolean {
  const p = (win.process_name || "").toLowerCase();
  if (!p) return false;

  const pwaBrowserExe = getExpectedBrowserExeForPwa(app);
  if (pwaBrowserExe) {
    const matchesBrowser = p === pwaBrowserExe || BROWSER_PROXY_MAP[p] === pwaBrowserExe;
    return matchesBrowser && isStandaloneBrowserWindowTitle(win.title || "", app.name);
  }

  const targetExe = extractTargetExecutable(app.targetPath, app.args ?? app.arguments);
  if (targetExe && p === targetExe) {
    return true;
  }

  if (matchesAppId(app.id, p, win.title, app.name)) {
    return true;
  }

  return getRunningAppMeta(p, win.title || "").id === app.id.toLowerCase();
}

export function getRunningAppMeta(
  processName: string,
  title: string
): { id: string; name: string; iconType?: any } {
  const p = processName.toLowerCase();
  const stem = p.replace(/\.exe$/i, "");
  const t = title.toLowerCase();

  if (
    stem === "systemsettings" ||
    (stem === "applicationframehost" &&
      (t.includes("settings") || t.includes("pengaturan") || t.includes("setelan")))
  ) {
    return { id: "settings", name: "Settings", iconType: "settings" };
  }

  const known = findKnownAppByStem(stem);
  if (known) {
    return { id: known.id, name: known.name, iconType: known.iconType };
  }

  const cleanName = processName.replace(/\.exe$/i, "");
  const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  const segments = title.split(" - ").map((s) => s.trim()).filter(Boolean);
  const appSegment = segments.length > 1 ? segments[segments.length - 1] : segments[0];
  return { id: cleanName.toLowerCase(), name: appSegment || capitalized };
}

