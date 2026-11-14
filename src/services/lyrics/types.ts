export interface LyricWord {
  time: number;
  endTime?: number;
  text: string;
}

export interface LyricLine {
  time: number;
  text: string;
  words?: LyricWord[];
}

export type LyricsProviderId =
  | "auto"
  | "betterlyrics"
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
  fetchLyrics: (
    artist: string,
    title: string,
    duration?: number,
    signal?: AbortSignal
  ) => Promise<LyricsData | null>;
}
