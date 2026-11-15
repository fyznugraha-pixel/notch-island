export interface NavbarAppItem {
  id: string;
  name: string;
  icon?: string;
  iconType?: string;
  targetPath?: string;
  lnkPath?: string;
  isRunning?: boolean;
  isActive?: boolean;
  hwnd?: number;
  windows?: any[];
}

export const normalizeIconUrl = (icon?: string | null): string | undefined => {
  if (!icon) return undefined;
  const trimmed = icon.trim();
  if (trimmed.startsWith("data:") || trimmed.startsWith("/") || trimmed.startsWith("http")) {
    return trimmed;
  }
  if (
    trimmed.length > 40 &&
    (trimmed.startsWith("iVBOR") || trimmed.startsWith("/9j/") || /^[A-Za-z0-9+/=]+$/.test(trimmed))
  ) {
    return `data:image/png;base64,${trimmed}`;
  }
  return undefined;
};

export type MacOSIconSlug =
  | "finder"
  | "settings"
  | "chrome"
  | "brave"
  | "edge"
  | "firefox"
  | "opera"
  | "vivaldi"
  | "vscode"
  | "terminal"
  | "spotify"
  | "discord"
  | "whatsapp"
  | "telegram"
  | "netflix"
  | "claude"
  | "antigravity"
  | "openai"
  | "notion"
  | "obsidian"
  | "figma"
  | "slack"
  | "zoom"
  | "teams"
  | "obs"
  | "vlc"
  | "steam"
  | "docker"
  | "postman"
  | "github"
  | "androidstudio"
  | "calculator"
  | "calendar"
  | "notes"
  | "mail"
  | "youtube"
  | "youtubemusic"
  | "reddit"
  | "instagram"
  | "bitwarden"
  | "qbittorrent";

export const getMacOSIconSrc = (slug: MacOSIconSlug): string => `/icons/macos/${slug}.webp`;

interface IconMatcherRule {
  slug: MacOSIconSlug;
  pattern: RegExp;
}

// Specific apps come before generic browser/editor heuristics so PWAs (e.g. chrome_proxy.exe -> Netflix) resolve accurately.
const APP_MATCHERS: IconMatcherRule[] = [
  { slug: "antigravity", pattern: /\bantigravity\b/i },
  { slug: "claude", pattern: /\bclaude\b/i },
  { slug: "openai", pattern: /\b(chatgpt|openai)\b/i },
  { slug: "netflix", pattern: /\bnetflix\b/i },
  { slug: "youtubemusic", pattern: /\b(youtube\s*music|yt[\s-]*music|ytm)\b/i },
  { slug: "youtube", pattern: /\byoutube\b/i },
  { slug: "spotify", pattern: /\bspotify\b/i },
  { slug: "discord", pattern: /\bdiscord\b/i },
  { slug: "whatsapp", pattern: /\bwhatsapp\b/i },
  { slug: "telegram", pattern: /\btelegram\b/i },
  { slug: "instagram", pattern: /\binstagram\b/i },
  { slug: "reddit", pattern: /\breddit\b/i },
  { slug: "notion", pattern: /\bnotion\b/i },
  { slug: "obsidian", pattern: /\bobsidian\b/i },
  { slug: "figma", pattern: /\bfigma\b/i },
  { slug: "slack", pattern: /\bslack\b/i },
  { slug: "zoom", pattern: /\bzoom(\.exe|\s|$)/i },
  { slug: "teams", pattern: /\b(ms[\s-]*teams|microsoft\s+teams|teams\.exe)\b/i },
  { slug: "obs", pattern: /\b(obs\s*studio|obs64|obs32)\b/i },
  { slug: "vlc", pattern: /\bvlc\b/i },
  { slug: "steam", pattern: /\bsteam\b/i },
  { slug: "docker", pattern: /\bdocker\b/i },
  { slug: "postman", pattern: /\bpostman\b/i },
  { slug: "github", pattern: /\bgithub(\s*desktop)?\b/i },
  { slug: "androidstudio", pattern: /\b(android\s*studio|studio64)\b/i },
  { slug: "bitwarden", pattern: /\bbitwarden\b/i },
  { slug: "qbittorrent", pattern: /\bqbittorrent\b/i },
  { slug: "calculator", pattern: /\b(calc|calculator|kalkulator)\b/i },
  { slug: "calendar", pattern: /\b(calendar|kalender)\b/i },
  { slug: "notes", pattern: /\b(notepad|notes|catatan)\b/i },
  { slug: "mail", pattern: /\b(outlook|thunderbird|gmail|mail)\b/i },
  { slug: "vscode", pattern: /\b(vscode|visual\s+studio\s+code|code\.exe|code\s*-\s*insiders)\b/i },
  { slug: "terminal", pattern: /\b(terminal|windowsterminal|powershell|pwsh|cmd\.exe|wt\.exe)\b/i },
  { slug: "settings", pattern: /\b(systemsettings|settings|pengaturan|setelan|control\s*panel)\b/i },
  { slug: "finder", pattern: /\b(explorer|file\s+explorer|finder)\b/i },
  { slug: "brave", pattern: /\bbrave\b/i },
  { slug: "edge", pattern: /\b(msedge|microsoft\s+edge|edge)\b/i },
  { slug: "firefox", pattern: /\bfirefox\b/i },
  { slug: "opera", pattern: /\bopera(\s*gx)?\b/i },
  { slug: "vivaldi", pattern: /\bvivaldi\b/i },
  { slug: "chrome", pattern: /\b(google\s+chrome|chrome)\b/i },
];

const ICON_TYPE_FALLBACK: Record<string, MacOSIconSlug> = {
  folder: "finder",
  explorer: "finder",
  settings: "settings",
  brave: "brave",
  edge: "edge",
  msedge: "edge",
  firefox: "firefox",
  opera: "opera",
  vivaldi: "vivaldi",
  chrome: "chrome",
  browser: "chrome",
  code: "vscode",
  vscode: "vscode",
  terminal: "terminal",
  spotify: "spotify",
  discord: "discord",
  whatsapp: "whatsapp",
  telegram: "telegram",
  netflix: "netflix",
  claude: "claude",
  antigravity: "antigravity",
};

function getExeFilename(targetPath?: string): string {
  if (!targetPath) return "";
  const match = targetPath.match(/([^\\/"']+\.exe)/i);
  return match ? match[1] : "";
}

export function resolveMacOSIconSlug(app: NavbarAppItem): MacOSIconSlug | null {
  const exe = getExeFilename(app.targetPath);
  const directText = `${app.id} ${app.name}`.replace(/[_-]+/g, " ").trim();

  for (const rule of APP_MATCHERS) {
    if (rule.pattern.test(directText)) {
      return rule.slug;
    }
  }

  // Only inspect executable stem if it is not a generic Chrome/Edge PWA proxy.
  const isBrowserProxy = /^(chrome_proxy|msedge_proxy)\.exe$/i.test(exe);
  if (exe && !isBrowserProxy) {
    for (const rule of APP_MATCHERS) {
      if (rule.pattern.test(exe)) {
        return rule.slug;
      }
    }
  }

  if (app.iconType) {
    return ICON_TYPE_FALLBACK[app.iconType.toLowerCase()] ?? null;
  }

  return null;
}
