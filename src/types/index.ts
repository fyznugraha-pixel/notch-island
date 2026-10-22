export interface MediaPayload {
  title: string;
  artist: string;
  is_playing: boolean;
  thumbnail?: string | null;
  playback_type?: number;
  position?: number;
  duration?: number;
  is_browser?: boolean;
}

export interface NotifPayload {
  title: string;
  body: string;
  icon?: string;
  type?: string;
  aumid?: string;
  onClick?: () => void;
}
