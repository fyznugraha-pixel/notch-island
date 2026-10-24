import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink,
  Music2,
  Clock,
  Play,
  Globe,
  Radio,
} from "lucide-react";
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
import { invoke } from "@tauri-apps/api/core";
import { MediaPayload } from "../../types";
import { t } from "../../services/i18n";

export interface QueueTrackItem {
  id: string;
  title: string;
  artist: string;
  thumbnail?: string | null;
  timestamp: number;
}

export interface MediaQueueViewProps {
  media: MediaPayload | null;
  isPlaying: boolean;
  mediaProgress: { position: number; duration: number };
  queueHistory?: QueueTrackItem[];
  onMediaControl: (action: "play" | "pause" | "next" | "prev" | "toggle") => void;
  optAccent?: string;
  onPlayHistoryTrack?: (item: QueueTrackItem, index: number) => void;
}

interface AppMeta {
  name: string;
  color: string;
  imageSrc?: string;
  url?: string;
  renderIcon?: (size?: number) => React.ReactNode;
}

const resolveAppMeta = (
  rawApp: string,
  isBrowser?: boolean,
  webSource?: string,
  title?: string,
  artist?: string
): AppMeta => {
  const lowerApp = rawApp.toLowerCase();
  const lowerWeb = (webSource || "").toLowerCase();
  const lowerTitle = (title || "").toLowerCase();
  const lowerArtist = (artist || "").toLowerCase();

  // 1. YouTube Music (Web or Desktop PWA / AUMID)
  if (
    lowerWeb.includes("youtube music") ||
    lowerApp.includes("ytmusic") ||
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

  // 2. YouTube (Web or Desktop)
  if (
    lowerWeb.includes("youtube") ||
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

  // 3. BitChord (Open Source Music Client)
  if (lowerWeb.includes("bitchord") || lowerApp.includes("bitchord") || lowerTitle.includes("bitchord")) {
    return {
      name: "BitChord",
      color: "#FF2D55",
      imageSrc: "/logo/bitchord.png",
      url: "https://github.com/kushagrasinghx/BitChord",
    };
  }

  // 4. Spotube (Open Source Spotify client)
  if (lowerWeb.includes("spotube") || lowerApp.includes("spotube")) {
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
  if (lowerWeb.includes("apple") || lowerApp.includes("apple")) {
    return {
      name: "Apple Music",
      color: "#FA243C",
      imageSrc: "/logo/apple-music.png",
      url: "https://music.apple.com",
      renderIcon: (size = 22) => <SiApplemusic size={size} color="#FA243C" />,
    };
  }

  // 9. Bandcamp
  if (lowerWeb.includes("bandcamp") || lowerApp.includes("bandcamp")) {
    return {
      name: "Bandcamp",
      color: "#1DA0C3",
      imageSrc: "/logo/bandcamp.png",
      renderIcon: (size = 22) => <SiBandcamp size={size} color="#1DA0C3" />,
      url: "https://bandcamp.com",
    };
  }

  // 10. Amazon Music
  if (lowerWeb.includes("amazon") || lowerApp.includes("amazon")) {
    return {
      name: "Amazon Music",
      color: "#00A8E1",
      imageSrc: "/logo/amazon-music.png",
      url: "https://music.amazon.com",
    };
  }

  // 11. Tidal
  if (lowerWeb.includes("tidal") || lowerApp.includes("tidal")) {
    return {
      name: "Tidal",
      color: "#000000",
      imageSrc: "/logo/tidal.png",
      url: "https://listen.tidal.com",
    };
  }

  // 12. Deezer
  if (lowerWeb.includes("deezer") || lowerApp.includes("deezer")) {
    return {
      name: "Deezer",
      color: "#A238FF",
      imageSrc: "/logo/deezer.png",
      url: "https://www.deezer.com",
    };
  }

  // 13. Qobuz
  if (lowerWeb.includes("qobuz") || lowerApp.includes("qobuz")) {
    return {
      name: "Qobuz",
      color: "#002B49",
      imageSrc: "/logo/qobuz.png",
      url: "https://www.qobuz.com",
    };
  }

  // 14. Roon
  if (lowerWeb.includes("roon") || lowerApp.includes("roon")) {
    return {
      name: "Roon",
      color: "#4B5563",
      imageSrc: "/logo/roon.png",
      url: "https://roon.app",
    };
  }

  // 15. Cider
  if (lowerApp.includes("cider")) {
    return {
      name: "Cider",
      color: "#FA233B",
      imageSrc: "/logo/cider.png",
      url: "https://cider.sh",
    };
  }

  // 16. Plexamp & Plex
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

  // 17. Jellyfin
  if (lowerWeb.includes("jellyfin") || lowerApp.includes("jellyfin")) {
    return {
      name: "Jellyfin",
      color: "#AA5CC3",
      imageSrc: "/logo/jellyfin.png",
      renderIcon: (size = 22) => <SiJellyfin size={size} color="#AA5CC3" />,
      url: "https://jellyfin.org",
    };
  }

  // 18. Trello / mrtrello
  if (lowerWeb.includes("trello") || lowerApp.includes("trello") || lowerApp.includes("mrtrello")) {
    return {
      name: "Trello",
      color: "#0079BF",
      renderIcon: (size = 22) => <SiTrello size={size} color="#0079BF" />,
      url: "https://trello.com",
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

  // 25. PotPlayer
  if (lowerApp.includes("potplayer")) {
    return {
      name: "PotPlayer",
      color: "#F0B90B",
      imageSrc: "/logo/potplayer.png",
    };
  }

  // 26. iTunes
  if (lowerApp.includes("itunes")) {
    return {
      name: "iTunes",
      color: "#EA4CC0",
      imageSrc: "/logo/itunes.png",
    };
  }

  // 27. Audacious
  if (lowerApp.includes("audacious")) {
    return {
      name: "Audacious",
      color: "#0088CC",
      imageSrc: "/logo/audacious.png",
    };
  }

  // 28. Clementine & Strawberry
  if (lowerApp.includes("clementine") || lowerApp.includes("strawberry")) {
    return {
      name: "Clementine",
      color: "#F58220",
      imageSrc: "/logo/clementine.png",
    };
  }

  // 29. Feishin
  if (lowerApp.includes("feishin")) {
    return {
      name: "Feishin",
      color: "#3B82F6",
      imageSrc: "/logo/feishin.png",
    };
  }

  // 30. Local media players (VLC, Windows Media Player)
  if (lowerApp.includes("vlc")) {
    return {
      name: "VLC Media Player",
      color: "#FF8800",
      imageSrc: "/logo/vlc.png",
      renderIcon: (size = 22) => <SiVlcmediaplayer size={size} color="#FF8800" />,
    };
  }
  if (lowerApp.includes("wmplayer") || lowerApp.includes("media player")) {
    return {
      name: "Windows Media Player",
      color: "#0078D7",
      imageSrc: "/logo/windows-media-player.png",
    };
  }

  // 31. Browsers (fallback if no web media service detected)
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
};

export const MediaQueueView: React.FC<MediaQueueViewProps> = ({
  media,
  isPlaying,
  mediaProgress,
  queueHistory = [],
  onPlayHistoryTrack,
}) => {
  const [replayingTrackId, setReplayingTrackId] = useState<string | null>(null);
  const [isOpeningApp, setIsOpeningApp] = useState(false);

  const rawApp = (media?.app_id || "").toLowerCase();
  const appMeta = resolveAppMeta(
    rawApp,
    media?.is_browser,
    media?.web_source,
    media?.title,
    media?.artist
  );

  const currentTitle = (media?.title || "").trim().toLowerCase();
  const currentArtist = (media?.artist || "").trim().toLowerCase();
  const displayHistory = queueHistory
    .filter(
      (item) =>
        !currentTitle ||
        item.title.trim().toLowerCase() !== currentTitle ||
        (item.artist && currentArtist && item.artist.trim().toLowerCase() !== currentArtist)
    )
    .slice(0, 10);

  const handleOpenApp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpeningApp) return;
    setIsOpeningApp(true);

    try {
      const activated = await invoke<boolean>("activate_notification_app", {
        appName: appMeta.name,
        aumid: media?.app_id || null,
      });

      if (!activated) {
        if (media?.is_browser && appMeta.url) {
          window.open(appMeta.url, "_blank");
        } else if (rawApp.includes("spotify") || appMeta.name === "Spotify") {
          window.location.href = "spotify://";
        } else if (appMeta.url) {
          window.open(appMeta.url, "_blank");
        }
      }
    } catch (err) {
      console.error("Failed to activate app:", err);
      if (media?.is_browser && appMeta.url) {
        window.open(appMeta.url, "_blank");
      } else if (rawApp.includes("spotify") || appMeta.name === "Spotify") {
        window.location.href = "spotify://";
      } else if (appMeta.url) {
        window.open(appMeta.url, "_blank");
      }
    } finally {
      setTimeout(() => setIsOpeningApp(false), 800);
    }
  };

  const handleTrackClick = async (item: QueueTrackItem, index: number) => {
    if (replayingTrackId) return;
    setReplayingTrackId(item.id);

    try {
      if (onPlayHistoryTrack) {
        await onPlayHistoryTrack(item, index);
      } else {
        const pos = mediaProgress?.position || 0;
        const needsReset = pos > 2;
        const totalSkips = (needsReset ? 1 : 0) + (index + 1);

        for (let i = 0; i < totalSkips; i++) {
          await invoke("smtc_action", { action: "prev" });
          if (i < totalSkips - 1) {
            await new Promise((r) => setTimeout(r, 120));
          }
        }

        if (!isPlaying) {
          await invoke("smtc_action", { action: "play" });
        }
      }
    } catch (err) {
      console.error("Failed to play track from history:", err);
    } finally {
      setTimeout(() => {
        setReplayingTrackId(null);
      }, 600);
    }
  };

  return (
    <div className="flex-1 h-full min-w-0 flex flex-col relative overflow-hidden select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between px-1 pb-2 shrink-0">
        <span className="text-[10.5px] font-bold tracking-wider uppercase text-white/50 flex items-center gap-1.5">
          <Radio size={13} className="text-white/60" />
          {t("media_app_source")}
        </span>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1 space-y-2.5 custom-scrollbar">
        {/* App Info Hub Row & Direct Open Button (Frameless & Compact) */}
        <div className="flex items-center justify-between gap-2.5 px-2 py-1.5 rounded-xl hover:bg-white/[0.04] transition-colors relative select-none">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 p-1 transition-transform overflow-hidden shadow-sm"
              style={{
                backgroundColor: `${appMeta.color}22`,
              }}
            >
              {appMeta.imageSrc ? (
                <img
                  src={appMeta.imageSrc}
                  alt={appMeta.name}
                  className="w-full h-full object-contain"
                />
              ) : appMeta.renderIcon ? (
                appMeta.renderIcon(18)
              ) : (
                <Music2 size={18} className="text-white/80" />
              )}
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-semibold text-white truncate leading-tight">
                  {appMeta.name}
                </span>
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isPlaying ? "bg-emerald-400 animate-pulse" : "bg-white/40"
                  }`}
                />
              </div>
              <span className="text-[10.5px] text-white/45 truncate leading-tight mt-0.5">
                {isPlaying ? t("media_app_playing") : t("media_app_connected")}
              </span>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleOpenApp}
            disabled={isOpeningApp}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/15 text-white text-[11px] font-semibold transition-all shrink-0 cursor-pointer border border-white/5 shadow-sm disabled:opacity-50"
            title={t("media_open_app", { app: appMeta.name })}
          >
            <span>{t("media_open_action")}</span>
            <ExternalLink size={11.5} />
          </motion.button>
        </div>

        {/* Recently Played / Session Queue History */}
        {displayHistory.length > 0 && (
          <div className="flex flex-col gap-1 pt-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-[9.5px] font-bold tracking-wider uppercase text-white/40 flex items-center gap-1">
                <Clock size={10} className="text-white/40" />
                {t("media_queue_history")}
              </span>
            </div>

            <div className="space-y-0.5">
              {displayHistory.map((item, idx) => {
                const isItemReplaying = replayingTrackId === item.id;
                return (
                  <motion.div
                    key={`${item.id}-${idx}`}
                    whileHover={{ scale: 1.005 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleTrackClick(item, idx)}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-white/[0.07] active:bg-white/[0.12] transition-colors cursor-pointer group select-none"
                    title={t("media_queue_play_track", { title: item.title })}
                  >
                    <div className="w-8 h-8 rounded-lg bg-neutral-800/80 shrink-0 overflow-hidden relative flex items-center justify-center shadow-sm">
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <Music2 size={13} className="text-white/40" />
                      )}
                      {/* Play overlay on hover or replaying */}
                      <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${isItemReplaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                        {isItemReplaying ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Play size={12} fill="white" className="text-white ml-0.5" />
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[12px] font-medium text-white/90 group-hover:text-white truncate leading-tight transition-colors">
                        {item.title}
                      </span>
                      <span className="text-[10.5px] text-white/45 group-hover:text-white/60 truncate leading-tight mt-0.5 transition-colors">
                        {item.artist || appMeta.name}
                      </span>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5 pr-0.5">
                      <span className="text-[10px] text-white/30 group-hover:hidden tabular-nums">
                        #{idx + 1}
                      </span>
                      <span className="text-[10px] text-white/70 hidden group-hover:inline-flex items-center gap-1 font-semibold">
                        <Play size={9} fill="currentColor" />
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {displayHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-6">
            <Music2 size={24} className="text-white/20 mb-2" />
            <span className="text-xs text-white/40 font-medium">
              {t("media_queue_no_history")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
