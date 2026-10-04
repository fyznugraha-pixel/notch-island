export interface MediaPayload {
  title: string;
  artist: string;
  is_playing: boolean;
  thumbnail?: string | null;
  playback_type?: number;
}

export interface NotifPayload {
  title: string;
  body: string;
  icon?: string;
}
