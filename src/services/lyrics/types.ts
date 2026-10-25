export interface LyricLine {
  time: number;
  text: string;
}

export type LyricsProviderId =
  | "auto"
  | "qqmusic"
  | "lrclib"
  | "genius"
  | "netease"
  | "kugou";

export interface LyricsData {
  synced: boolean;
  lines: LyricLine[];
  plainLyrics?: string;
  instrumental?: boolean;
  provider?: LyricsProviderId;
  providerName?: string;
}

export interface LyricsProviderMeta {
  id: LyricsProviderId;
  name: string;
  badge: string;
  description: string;
}

export interface LyricsProvider {
  id: LyricsProviderId;
  name: string;
  fetchLyrics: (artist: string, title: string, duration?: number) => Promise<LyricsData | null>;
}
