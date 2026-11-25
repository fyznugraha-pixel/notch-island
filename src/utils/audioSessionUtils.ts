export interface BaseAudioSession {
  pid: number;
  name: string;
  path?: string | null;
  icon?: string | null;
  volume: number;
  muted: boolean;
  pids?: number[];
}

export type NormalizedAudioSession<T extends BaseAudioSession> = T & {
  pids: number[];
  displayName: string;
};

const KNOWN_APP_DISPLAY_NAMES: Record<string, string> = {
  msedgewebview2: "Edge WebView2",
  msedge: "Microsoft Edge",
  chrome: "Google Chrome",
  firefox: "Firefox",
  brave: "Brave",
  opera: "Opera",
  opera_gx: "Opera GX",
  vivaldi: "Vivaldi",
  arc: "Arc",
  discord: "Discord",
  discordptb: "Discord PTB",
  discordcanary: "Discord Canary",
  spotify: "Spotify",
  vlc: "VLC",
  wmplayer: "Media Player",
  icloudphotos: "iCloud Photos",
  iclouddrive: "iCloud Drive",
  icloudservices: "iCloud",
  whatsapp: "WhatsApp",
  "whatsapp.root": "WhatsApp",
  telegram: "Telegram",
  applemusic: "Apple Music",
  itunes: "iTunes",
  "ms-teams": "Microsoft Teams",
  msteams: "Microsoft Teams",
  teams: "Microsoft Teams",
  zoom: "Zoom",
  slack: "Slack",
  code: "VS Code",
  obs64: "OBS Studio",
  obs32: "OBS Studio",
  steamwebhelper: "Steam",
  steam: "Steam",
  gili: "Gili",
  audiodg: "Windows Audio",
  potplayermini64: "PotPlayer",
  potplayermini: "PotPlayer",
  "mpc-hc64": "MPC-HC",
  "mpc-hc": "MPC-HC",
  foobar2000: "foobar2000",
  musicbee: "MusicBee",
  aimp: "AIMP",
  winamp: "Winamp",
  tidal: "TIDAL",
  deezer: "Deezer",
  cider: "Cider",
  spotube: "Spotube",
};

export function getAudioSessionKey(rawName: string): string {
  return rawName.trim().replace(/\.exe$/i, "").toLowerCase();
}

export function formatAudioAppName(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) return "App";

  const withoutExt = trimmed.replace(/\.exe$/i, "").trim();
  if (!withoutExt) return "App";

  const known = KNOWN_APP_DISPLAY_NAMES[withoutExt.toLowerCase()];
  if (known) return known;

  // Split CamelCase / PascalCase / snake_case / kebab-case process stems into readable words.
  const spaced = withoutExt
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  if (!spaced) return withoutExt;
  if (spaced === spaced.toLowerCase()) {
    return spaced.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  }
  return spaced;
}

export function dedupeAudioSessions<T extends BaseAudioSession>(
  sessions: T[]
): Array<NormalizedAudioSession<T>> {
  const grouped = new Map<string, NormalizedAudioSession<T>>();

  for (const session of sessions) {
    if (!session || session.pid <= 0 || !session.name?.trim()) continue;
    const key = getAudioSessionKey(session.name);
    const incomingPids =
      Array.isArray(session.pids) && session.pids.length > 0
        ? session.pids
        : [session.pid];

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        ...session,
        pids: Array.from(new Set(incomingPids)),
        displayName: formatAudioAppName(session.name),
      });
      continue;
    }

    for (const pid of incomingPids) {
      if (!existing.pids.includes(pid)) {
        existing.pids.push(pid);
      }
    }
    if (!existing.icon && session.icon) {
      existing.icon = session.icon;
    }
    if (!existing.path && session.path) {
      existing.path = session.path;
    }
  }

  return Array.from(grouped.values());
}
