import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  ExternalLink,
  Music2,
  Clock,
  Play,
  Radio,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MediaPayload } from "../../types";
import { Tooltip } from "./Tooltip";
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

const normalizeTitle = (title?: string | null) => (title || "").trim().toLowerCase();

async function openExternalTarget(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

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
  queueHistory = [],
  onPlayHistoryTrack,
}) => {
  const [replayingTrackId, setReplayingTrackId] = useState<string | null>(null);
  const [isOpeningApp, setIsOpeningApp] = useState(false);

  // Live refs so the async skip loop sees track changes without stale closures
  const mediaRef = useRef(media);
  const isPlayingRef = useRef(isPlaying);
  const isMountedRef = useRef(true);
  const openAppTimerRef = useRef<number | null>(null);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (openAppTimerRef.current !== null) {
        window.clearTimeout(openAppTimerRef.current);
        openAppTimerRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

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

  const resolveFallbackTarget = (): string | null => {
    if (media?.is_browser && appMeta.url) return appMeta.url;
    if (rawApp.includes("spotify") || appMeta.name === "Spotify") return "spotify://";
    return appMeta.url || null;
  };

  const handleOpenApp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpeningApp) return;
    setIsOpeningApp(true);

    try {
      const activated = await invoke<boolean>("activate_notification_app", {
        appName: appMeta.name,
        aumid: media?.app_id || null,
      });

      if (!activated && isMountedRef.current) {
        const target = resolveFallbackTarget();
        if (target) await openExternalTarget(target);
      }
    } catch (err) {
      console.error("Failed to activate app:", err);
      if (isMountedRef.current) {
        const target = resolveFallbackTarget();
        if (target) await openExternalTarget(target);
      }
    } finally {
      if (isMountedRef.current) {
        if (openAppTimerRef.current !== null) {
          window.clearTimeout(openAppTimerRef.current);
        }
        openAppTimerRef.current = window.setTimeout(() => {
          openAppTimerRef.current = null;
          if (isMountedRef.current) {
            setIsOpeningApp(false);
          }
        }, 800);
      }
    }
  };

  const handleOpenTrackInApp = (e: React.MouseEvent, item: QueueTrackItem) => {
    e.stopPropagation();
    const query = `${item.title} ${item.artist}`.trim();
    const target =
      appMeta.name === "Spotify" || rawApp.includes("spotify")
        ? `spotify:search:${encodeURIComponent(query)}`
        : appMeta.name === "YouTube Music" || appMeta.name === "YouTube"
          ? `https://music.youtube.com/search?q=${encodeURIComponent(query)}`
          : appMeta.name === "Apple Music"
            ? `https://music.apple.com/search?term=${encodeURIComponent(query)}`
            : `https://www.google.com/search?q=${encodeURIComponent(query + " music")}`;
    void openExternalTarget(target);
  };

  const waitForTitleChange = async (fromTitle: string, timeoutMs: number) => {
    const startedAt = Date.now();
    while (isMountedRef.current && Date.now() - startedAt < timeoutMs) {
      await new Promise((r) => setTimeout(r, 80));
      if (!isMountedRef.current) return false;
      if (normalizeTitle(mediaRef.current?.title) !== fromTitle) {
        // SMTC can emit a couple of updates per track switch; let it settle before the next skip
        await new Promise((r) => setTimeout(r, 250));
        return isMountedRef.current;
      }
    }
    return false;
  };

  // One confirmed step back. A new "prev" is never sent until the previous one has visibly
  // switched tracks, otherwise slow SMTC updates make us overshoot several songs.
  const skipBackOnce = async (compensateRestart: boolean) => {
    if (!isMountedRef.current) return false;
    const titleBefore = normalizeTitle(mediaRef.current?.title);
    await invoke("smtc_action", { action: "prev" });
    if (await waitForTitleChange(titleBefore, 2000)) return true;
    if (!isMountedRef.current) return false;

    // Spotify & co. restart the current song on "prev" past ~3s; the second press goes back.
    if (!compensateRestart) return false;
    await invoke("smtc_action", { action: "prev" });
    return waitForTitleChange(titleBefore, 3000);
  };

  const handleTrackClick = async (item: QueueTrackItem, index: number) => {
    if (replayingTrackId) return;
    setReplayingTrackId(item.id);

    try {
      if (onPlayHistoryTrack) {
        await onPlayHistoryTrack(item, index);
        return;
      }

      const targetTitle = normalizeTitle(item.title);
      const stepsNeeded = index + 1;
      for (let step = 0; step < stepsNeeded; step++) {
        if (!isMountedRef.current) return;
        if (normalizeTitle(mediaRef.current?.title) === targetTitle) break;
        const switched = await skipBackOnce(step === 0);
        if (!switched) break;
      }

      if (isMountedRef.current && !isPlayingRef.current) {
        await invoke("smtc_action", { action: "play" });
      }
    } catch (err) {
      console.error("Failed to play track from history:", err);
    } finally {
      if (isMountedRef.current) {
        setReplayingTrackId(null);
      }
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
                  >
                    <div className="w-8 h-8 rounded-lg bg-neutral-800/80 shrink-0 overflow-hidden relative flex items-center justify-center shadow-sm">
                      <QueueTrackThumbnail
                        item={item}
                        fallbackLogo={appMeta.imageSrc}
                        fallbackBg={appMeta.color}
                      />
                      {/* Play overlay on hover or replaying */}
                      <div className={`media-thumb-play-overlay absolute inset-0 flex items-center justify-center transition-opacity ${isItemReplaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
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
                        <Tooltip content={t("media_open_app", { app: appMeta.name }) || "Buka di aplikasi"} side="top">
                          <button
                            type="button"
                            onClick={(e) => handleOpenTrackInApp(e, item)}
                            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                          >
                            <ExternalLink size={11} />
                          </button>
                        </Tooltip>
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
