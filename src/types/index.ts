export interface MediaPayload {
  title: string;
  artist: string;
  is_playing: boolean;
  thumbnail?: string | null;
  playback_type?: number;
  position?: number;
  duration?: number;
  is_browser?: boolean;
  app_id?: string;
  web_source?: string;
}

export interface NotifPayload {
  id?: string;
  timestamp?: number;
  title: string;
  body: string;
  icon?: string;
  type?: string;
  aumid?: string;
  subtitle?: string;
  headline?: string;
  secondaryText?: string;
  onClick?: () => void;
}
