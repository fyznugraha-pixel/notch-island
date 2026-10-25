import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink,
  Music2,
  Clock,
  Play,
  Radio,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { MediaPayload } from "../../types";
import { t } from "../../services/i18n";
import {
  fetchHighResArtwork,
  getResolvedArtworkUrl,
  subscribeArtworkUpdates,
  invalidateCachedArtwork,
  getArtworkCacheKey,
} from "../../services/artworkService";
import { resolvePlayerBranding } from "../../utils/playerBranding";

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

const resolveAppMeta = resolvePlayerBranding;

const QueueTrackThumbnail: React.FC<{
  item: QueueTrackItem;
  fallbackLogo?: string;
  fallbackBg?: string;
}> = ({ item, fallbackLogo, fallbackBg }) => {
  const [thumbError, setThumbError] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setThumbError(false);
  }, [item.thumbnail, item.title, item.artist]);

  useEffect(() => {
    return subscribeArtworkUpdates(() => {
      setTick((t) => t + 1);
    });
  }, []);

  useEffect(() => {
    if (!item.title?.trim()) return;
    fetchHighResArtwork({
      title: item.title,
      artist: item.artist,
      thumbnail: item.thumbnail,
    } as any).catch(() => {});
  }, [item.title, item.artist]);

  const resolvedThumb = getResolvedArtworkUrl(
    {
      title: item.title,
      artist: item.artist,
      thumbnail: item.thumbnail,
    } as any,
    thumbError
  );

  if (resolvedThumb && !thumbError) {
    return (
      <img
        src={resolvedThumb}
        alt=""
        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
        onError={() => {
          setThumbError(true);
          const key = getArtworkCacheKey({
            title: item.title,
            artist: item.artist,
          } as any);
          invalidateCachedArtwork(key);
        }}
      />
    );
  }

  if (fallbackLogo) {
    return (
      <div
        className="w-full h-full flex items-center justify-center p-1 select-none"
        style={{ backgroundColor: `${fallbackBg}22` }}
      >
        <img
          src={fallbackLogo}
          alt=""
          className="w-full h-full object-contain group-hover:scale-105 transition-transform select-none pointer-events-none"
        />
      </div>
    );
  }

  return <Music2 size={13} className="text-white/40" />;
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

  const handleOpenTrackInApp = (e: React.MouseEvent, item: QueueTrackItem) => {
    e.stopPropagation();
    const query = `${item.title} ${item.artist}`.trim();
    if (appMeta.name === "Spotify" || rawApp.includes("spotify")) {
      window.location.href = `spotify:search:${encodeURIComponent(query)}`;
    } else if (appMeta.name === "YouTube Music" || appMeta.name === "YouTube") {
      window.open(`https://music.youtube.com/search?q=${encodeURIComponent(query)}`, "_blank");
    } else if (appMeta.name === "Apple Music") {
      window.open(`https://music.apple.com/search?term=${encodeURIComponent(query)}`, "_blank");
    } else {
      window.open(`https://www.google.com/search?q=${encodeURIComponent(query + " music")}`, "_blank");
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
        // If current song has been playing for > 1.2s, reset position to 0:00 first via SMTC seek
        // so that a single 'prev' action cleanly transitions to the previous song
        if (pos > 1.2) {
          await invoke("smtc_seek", { positionSec: 0 }).catch(() => {});
          await new Promise((r) => setTimeout(r, 220));
        }

        const skipsNeeded = index + 1;
        for (let i = 0; i < skipsNeeded; i++) {
          await invoke("smtc_action", { action: "prev" });
          if (i < skipsNeeded - 1) {
            await new Promise((r) => setTimeout(r, 350));
          }
        }

        if (!isPlaying) {
          await new Promise((r) => setTimeout(r, 120));
          await invoke("smtc_action", { action: "play" });
        }
      }
    } catch (err) {
      console.error("Failed to play track from history:", err);
    } finally {
      setTimeout(() => {
        setReplayingTrackId(null);
      }, 500 + index * 350);
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
                      <QueueTrackThumbnail
                        item={item}
                        fallbackLogo={appMeta.imageSrc}
                        fallbackBg={appMeta.color}
                      />
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
                      <span className="text-[10px] text-white/70 hidden group-hover:inline-flex items-center gap-1.5 font-semibold">
                        <button
                          type="button"
                          onClick={(e) => handleOpenTrackInApp(e, item)}
                          title={t("media_open_app", { app: appMeta.name }) || "Buka di aplikasi"}
                          className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                        >
                          <ExternalLink size={11} />
                        </button>
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
