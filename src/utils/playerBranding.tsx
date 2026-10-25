import React from "react";
import {
  SiSpotify,
  SiYoutube,
  SiApplemusic,
  SiGooglechrome,
  SiVlcmediaplayer,
  SiFoobar2000,
  SiWinamp,
  SiBandcamp,
  SiPlex,
  SiJellyfin,
  SiTrello,
} from "@icons-pack/react-simple-icons";
import { Globe, Music2 } from "lucide-react";
import { MediaPayload } from "../types";

export interface PlayerBranding {
  name: string;
  color: string;
  imageSrc?: string;
  url?: string;
  renderIcon?: (size?: number) => React.ReactNode;
}

export function resolvePlayerBranding(
  rawApp: string,
  isBrowser?: boolean,
  webSource?: string,
  title?: string,
  artist?: string
): PlayerBranding {
  const lowerApp = (rawApp || "").toLowerCase();
  const lowerWeb = (webSource || "").toLowerCase();
  const lowerTitle = (title || "").toLowerCase();
  const lowerArtist = (artist || "").toLowerCase();

  // 1. YouTube Music
  if (
    lowerWeb.includes("youtube music") ||
    lowerApp.includes("ytmusic") ||
    lowerApp.includes("youtube music") ||
    (isBrowser && (lowerTitle.includes("youtube music") || lowerArtist.includes("youtube music")))
  ) {
    return {
      name: "YouTube Music",
      color: "#FF0000",
      imageSrc: "/logo/youtube-music.png",
      url: "https://music.youtube.com",
      renderIcon: (size = 22) => <SiYoutube size={size} color="#FF0000" />,
    };
  }

  // 2. YouTube
  if (
    lowerWeb.includes("youtube") ||
    lowerApp.includes("youtube") ||
    (isBrowser && (lowerTitle.includes("youtube") || lowerArtist.includes("youtube")))
  ) {
    return {
      name: "YouTube",
      color: "#FF0000",
      imageSrc: "/logo/youtube.png",
      url: "https://www.youtube.com",
      renderIcon: (size = 22) => <SiYoutube size={size} color="#FF0000" />,
    };
  }

  // 3. BitChord
  if (
    lowerWeb.includes("bitchord") ||
    lowerApp.includes("bitchord") ||
    lowerTitle.includes("bitchord") ||
    lowerArtist.includes("bitchord")
  ) {
    return {
      name: "BitChord",
      color: "#FF2D55",
      imageSrc: "/logo/bitchord.png",
      url: "https://github.com/kushagrasinghx/BitChord",
    };
  }

  // 4. Spotube
  if (
    lowerWeb.includes("spotube") ||
    lowerApp.includes("spotube") ||
    lowerTitle.includes("spotube") ||
    lowerArtist.includes("spotube")
  ) {
    return {
      name: "Spotube",
      color: "#0FD679",
      imageSrc: "/logo/spotube.png",
      url: "https://spotube.krtirtho.dev",
    };
  }

  // 5. Moosync
  if (lowerApp.includes("moosync") || lowerWeb.includes("moosync")) {
    return {
      name: "Moosync",
      color: "#00B0FF",
      imageSrc: "/logo/moosync.png",
      url: "https://moosync.app",
    };
  }

  // 6. SoundCloud
  if (
    lowerWeb.includes("soundcloud") ||
    lowerApp.includes("soundcloud") ||
    (isBrowser && (lowerTitle.includes("soundcloud") || lowerArtist.includes("soundcloud")))
  ) {
    return {
      name: "SoundCloud",
      color: "#FF5500",
      imageSrc: "/logo/soundcloud.png",
      url: "https://soundcloud.com",
    };
  }

  // 7. Spotify
  if (
    lowerWeb.includes("spotify") ||
    lowerApp.includes("spotify") ||
    (isBrowser && (lowerTitle.includes("spotify") || lowerArtist.includes("spotify")))
  ) {
    return {
      name: "Spotify",
      color: "#1DB954",
      imageSrc: "/logo/spotify.png",
      url: "https://open.spotify.com",
      renderIcon: (size = 22) => <SiSpotify size={size} color="#1DB954" />,
    };
  }

  // 8. Apple Music
  if (
    lowerWeb.includes("apple") ||
    lowerApp.includes("apple") ||
    lowerArtist.includes("apple music")
  ) {
    return {
      name: "Apple Music",
      color: "#FA243C",
      imageSrc: "/logo/apple-music.png",
      url: "https://music.apple.com",
      renderIcon: (size = 22) => <SiApplemusic size={size} color="#FA243C" />,
    };
  }

  // 9. iTunes
  if (lowerApp.includes("itunes") || lowerArtist.includes("itunes")) {
    return {
      name: "iTunes",
      color: "#EA4CC0",
      imageSrc: "/logo/itunes.png",
    };
  }

  // 10. Bandcamp
  if (lowerWeb.includes("bandcamp") || lowerApp.includes("bandcamp")) {
    return {
      name: "Bandcamp",
      color: "#1DA0C3",
      imageSrc: "/logo/bandcamp.png",
      renderIcon: (size = 22) => <SiBandcamp size={size} color="#1DA0C3" />,
      url: "https://bandcamp.com",
    };
  }

  // 11. Amazon Music
  if (lowerWeb.includes("amazon") || lowerApp.includes("amazon") || lowerApp.includes("amazonmusic")) {
    return {
      name: "Amazon Music",
      color: "#00A8E1",
      imageSrc: "/logo/amazon-music.png",
      url: "https://music.amazon.com",
    };
  }

  // 12. Tidal
  if (lowerWeb.includes("tidal") || lowerApp.includes("tidal")) {
    return {
      name: "Tidal",
      color: "#000000",
      imageSrc: "/logo/tidal.png",
      url: "https://listen.tidal.com",
    };
  }

  // 13. Deezer
  if (lowerWeb.includes("deezer") || lowerApp.includes("deezer")) {
    return {
      name: "Deezer",
      color: "#A238FF",
      imageSrc: "/logo/deezer.png",
      url: "https://www.deezer.com",
    };
  }

  // 14. Qobuz
  if (lowerWeb.includes("qobuz") || lowerApp.includes("qobuz")) {
    return {
      name: "Qobuz",
      color: "#002B49",
      imageSrc: "/logo/qobuz.png",
      url: "https://www.qobuz.com",
    };
  }

  // 15. Roon
  if (lowerWeb.includes("roon") || lowerApp.includes("roon")) {
    return {
      name: "Roon",
      color: "#4B5563",
      imageSrc: "/logo/roon.png",
      url: "https://roon.app",
    };
  }

  // 16. Cider
  if (lowerApp.includes("cider") || lowerWeb.includes("cider")) {
    return {
      name: "Cider",
      color: "#FA233B",
      imageSrc: "/logo/cider.png",
      url: "https://cider.sh",
    };
  }

  // 17. Plexamp & Plex
  if (lowerApp.includes("plexamp")) {
    return {
      name: "Plexamp",
      color: "#E5A00D",
      imageSrc: "/logo/plexamp.png",
      url: "https://plex.tv",
    };
  }
  if (lowerWeb.includes("plex") || lowerApp.includes("plex")) {
    return {
      name: "Plex",
      color: "#E5A00D",
      imageSrc: "/logo/plex.png",
      renderIcon: (size = 22) => <SiPlex size={size} color="#E5A00D" />,
      url: "https://plex.tv",
    };
  }

  // 18. Jellyfin
  if (lowerWeb.includes("jellyfin") || lowerApp.includes("jellyfin")) {
    return {
      name: "Jellyfin",
      color: "#AA5CC3",
      imageSrc: "/logo/jellyfin.png",
      renderIcon: (size = 22) => <SiJellyfin size={size} color="#AA5CC3" />,
      url: "https://jellyfin.org",
    };
  }

  // 19. MusicBee
  if (lowerApp.includes("musicbee")) {
    return {
      name: "MusicBee",
      color: "#FFB000",
      imageSrc: "/logo/musicbee.png",
      url: "https://getmusicbee.com",
    };
  }

  // 20. foobar2000
  if (lowerApp.includes("foobar2000") || lowerApp.includes("foobar")) {
    return {
      name: "foobar2000",
      color: "#4B6E94",
      imageSrc: "/logo/foobar2000.png",
      renderIcon: (size = 22) => <SiFoobar2000 size={size} color="#4B6E94" />,
      url: "https://www.foobar2000.org",
    };
  }

  // 21. AIMP
  if (lowerApp.includes("aimp")) {
    return {
      name: "AIMP",
      color: "#E85E00",
      imageSrc: "/logo/aimp.png",
      url: "https://www.aimp.ru",
    };
  }

  // 22. Winamp
  if (lowerApp.includes("winamp")) {
    return {
      name: "Winamp",
      color: "#FF8F00",
      imageSrc: "/logo/winamp.png",
      renderIcon: (size = 22) => <SiWinamp size={size} color="#FF8F00" />,
      url: "https://www.winamp.com",
    };
  }

  // 23. Dopamine
  if (lowerApp.includes("dopamine")) {
    return {
      name: "Dopamine",
      color: "#0078D7",
      imageSrc: "/logo/dopamine.png",
    };
  }

  // 24. MediaMonkey
  if (lowerApp.includes("mediamonkey")) {
    return {
      name: "MediaMonkey",
      color: "#F5A623",
      imageSrc: "/logo/mediamonkey.png",
      url: "https://www.mediamonkey.com",
    };
  }

  // 25. Clementine & Strawberry
  if (lowerApp.includes("clementine") || lowerApp.includes("strawberry")) {
    return {
      name: "Clementine",
      color: "#F58220",
      imageSrc: "/logo/clementine.png",
    };
  }

  // 26. Audacious
  if (lowerApp.includes("audacious")) {
    return {
      name: "Audacious",
      color: "#0088CC",
      imageSrc: "/logo/audacious.png",
    };
  }

  // 27. Feishin
  if (lowerApp.includes("feishin")) {
    return {
      name: "Feishin",
      color: "#3B82F6",
      imageSrc: "/logo/feishin.png",
    };
  }

  // 28. PotPlayer
  if (lowerApp.includes("potplayer")) {
    return {
      name: "PotPlayer",
      color: "#F0B90B",
      imageSrc: "/logo/potplayer.png",
    };
  }

  // 29. VLC Media Player
  if (lowerApp.includes("vlc") || lowerArtist.includes("vlc")) {
    return {
      name: "VLC Media Player",
      color: "#E57E24",
      imageSrc: "/logo/vlc.png",
      renderIcon: (size = 22) => <SiVlcmediaplayer size={size} color="#FF8800" />,
    };
  }

  // 30. Windows Media Player
  if (
    lowerApp.includes("wmplayer") ||
    lowerApp.includes("zune") ||
    lowerApp.includes("media player") ||
    lowerArtist.includes("windows media player") ||
    lowerArtist.includes("media player")
  ) {
    return {
      name: "Windows Media Player",
      color: "#111111",
      imageSrc: "/logo/windows-media-player.png",
    };
  }

  // 31. Trello
  if (lowerWeb.includes("trello") || lowerApp.includes("trello") || lowerApp.includes("mrtrello")) {
    return {
      name: "Trello",
      color: "#0079BF",
      renderIcon: (size = 22) => <SiTrello size={size} color="#0079BF" />,
      url: "https://trello.com",
    };
  }

  // 32. Browsers
  if (lowerApp.includes("chrome")) {
    return {
      name: "Google Chrome",
      color: "#4285F4",
      imageSrc: "/logo/chrome.png",
      renderIcon: (size = 22) => <SiGooglechrome size={size} color="#4285F4" />,
    };
  }
  if (lowerApp.includes("edge") || lowerApp.includes("msedge")) {
    return {
      name: "Microsoft Edge",
      color: "#0078D7",
      imageSrc: "/logo/edge.png",
      renderIcon: (size = 22) => <Globe size={size} className="text-[#0078D7]" />,
    };
  }
  if (lowerApp.includes("firefox")) {
    return {
      name: "Firefox",
      color: "#FF7139",
      imageSrc: "/logo/firefox.png",
    };
  }
  if (lowerApp.includes("brave")) {
    return {
      name: "Brave",
      color: "#FB542B",
      imageSrc: "/logo/brave.png",
    };
  }

  if (isBrowser) {
    return {
      name: "Web Browser",
      color: "#38bdf8",
      imageSrc: "/logo/chrome.png",
      renderIcon: (size = 22) => <Globe size={size} className="text-sky-400" />,
    };
  }

  return {
    name: "Music Player",
    color: "#a855f7",
    renderIcon: (size = 22) => <Music2 size={size} className="text-purple-400" />,
  };
}

export function getMediaBranding(media: MediaPayload | null | undefined): PlayerBranding {
  if (!media) {
    return {
      name: "Music Player",
      color: "#a855f7",
    };
  }

  return resolvePlayerBranding(
    media.app_id || "",
    media.is_browser,
    media.web_source,
    media.title,
    media.artist
  );
}
