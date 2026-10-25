import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Volume2,
  MessageSquareQuote,
  ListMusic,
  Music2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { MediaPayload } from "../../types";
import { MediaThumbnail } from "./MediaThumbnail";
import { AudioVisualizer } from "./AudioVisualizer";
import { ScrollingText } from "./ScrollingText";
import { Tooltip } from "./Tooltip";
import { LyricsView } from "./LyricsView";
import { MediaQueueView, QueueTrackItem } from "./MediaQueueView";
import { LyricsData, LyricsProviderId } from "../../services/lyricsService";
import { formatMediaTime } from "../../utils/time";
import { getWheelVerticalDirection } from "../../utils/gesture";
import { t } from "../../services/i18n";

export interface MediaExpandedPanelProps {
  slideDirection: number;
  tabWidth?: number;
  media: MediaPayload | null;
  isPlaying: boolean;
  onMediaControl: (action: "play" | "pause" | "next" | "prev" | "toggle") => void;
  optAccent: string;
  showLyrics: boolean;
  onToggleLyrics: () => void;
  lyricsData: LyricsData | null;
  isLyricsLoading: boolean;
  onRefreshLyrics?: () => void;
  currentLyricsProvider?: LyricsProviderId;
  onChangeLyricsProvider?: (providerId: LyricsProviderId) => void;
  mediaProgress: { position: number; duration: number };
  onSetMediaProgress: React.Dispatch<
    React.SetStateAction<{ position: number; duration: number }>
  >;
  isSeeking: boolean;
  onSetIsSeeking: (seeking: boolean) => void;
  seekValue: number;
  onSetSeekValue: (val: number) => void;
  soundLevel: number;
  onSetSoundLevel: (level: number) => void;
  isAdjustingVolumeRef: React.MutableRefObject<boolean>;
  queueHistory?: QueueTrackItem[];
}

const tabVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 16 : dir < 0 ? -16 : 0,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      x: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
      opacity: { duration: 0.18, ease: "easeOut" as const },
    },
    transitionEnd: { transform: "none" },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -16 : dir < 0 ? 16 : 0,
    opacity: 0,
    transition: { duration: 0.12 },
  }),
};

const timeLabelClass =
  "text-[11px] font-semibold tracking-tight text-white/50 media-time-label w-9 shrink-0 tabular-nums select-none";

export const MediaExpandedPanel: React.FC<MediaExpandedPanelProps> = ({
  slideDirection,
  tabWidth: _tabWidth,
  media,
  isPlaying,
  onMediaControl,
  optAccent,
  showLyrics,
  onToggleLyrics,
  lyricsData,
  isLyricsLoading,
  onRefreshLyrics,
  currentLyricsProvider,
  onChangeLyricsProvider,
  mediaProgress,
  onSetMediaProgress,
  isSeeking,
  onSetIsSeeking,
  seekValue,
  onSetSeekValue,
  soundLevel,
  onSetSoundLevel,
  isAdjustingVolumeRef,
  queueHistory = [],
}) => {
  const hasMedia = Boolean(media && (media.title || media.artist));
  const activePlaying = Boolean(hasMedia && isPlaying);
  const displayTitle = hasMedia
    ? media!.title
    : t("media_idle_title");
  const displayArtist = hasMedia
    ? media!.artist
    : t("media_idle_subtitle");

  const currentMediaPosition = !hasMedia
    ? 0
    : isSeeking
    ? (seekValue / 100) * mediaProgress.duration
    : mediaProgress.position;

  const remainingMediaDuration = !hasMedia
    ? 0
    : Math.max(0, mediaProgress.duration - currentMediaPosition);

  const lastVolInvokeRef = React.useRef(0);
  const pendingVolRef = React.useRef<number | null>(null);
  const volTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const throttledSetMasterVolume = React.useCallback((level: number) => {
    pendingVolRef.current = level;
    const now = Date.now();
    if (now - lastVolInvokeRef.current >= 18) {
      lastVolInvokeRef.current = now;
      if (volTimeoutRef.current) clearTimeout(volTimeoutRef.current);
      invoke("set_master_volume", { level: level / 100.0 }).catch(console.error);
    } else if (!volTimeoutRef.current) {
      volTimeoutRef.current = setTimeout(() => {
        volTimeoutRef.current = null;
        if (pendingVolRef.current !== null) {
          lastVolInvokeRef.current = Date.now();
          invoke("set_master_volume", { level: pendingVolRef.current / 100.0 }).catch(console.error);
        }
      }, 18);
    }
  }, []);

  const handleVolumeChange = (newLevel: number, isFinal = false) => {
    const clamped = Math.max(0, Math.min(100, Math.round(newLevel)));
    onSetSoundLevel(clamped);
    if (isFinal) {
      if (volTimeoutRef.current) clearTimeout(volTimeoutRef.current);
      lastVolInvokeRef.current = Date.now();
      invoke("set_master_volume", { level: clamped / 100.0 }).catch(console.error);
    } else {
      throttledSetMasterVolume(clamped);
    }
  };

  return (
    <motion.div
      key="media_expanded"
      custom={slideDirection}
      variants={tabVariants}
      initial="enter"
      animate="center"
      exit="exit"
      className="absolute inset-0 w-full h-full flex px-3 pb-2.5 pt-1.5 min-w-0 cursor-default gap-3 relative gpu-accelerated"
    >
      {/* Left Column: Player Controls (Fixed 320px width so progress bar and controls never shift) */}
      <div className="w-[320px] h-full flex flex-col justify-between min-w-0 relative z-10 shrink-0 overflow-hidden">
        <div className="flex items-center gap-3.5 px-0.5">
          <div className="w-14 h-14 bg-neutral-800/50 rounded-xl flex items-center justify-center shrink-0 overflow-hidden shadow-lg border border-white/10 relative">
            {hasMedia && media ? (
              <MediaThumbnail media={media} size="large" />
            ) : (
              <Music2 size={24} className="text-white/35" />
            )}
          </div>
          <div className="flex flex-col overflow-hidden flex-1 min-w-0">
            <ScrollingText
              text={displayTitle}
              className={`text-[16px] font-semibold tracking-tight leading-tight ${
                hasMedia ? "text-white" : "text-white/70"
              }`}
            />
            <ScrollingText
              text={displayArtist}
              className="text-[13px] font-medium text-white/55 mt-0.5 leading-tight"
            />
          </div>
          <AnimatePresence>
            {activePlaying && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="flex items-center shrink-0 overflow-hidden"
              >
                <div className="pr-1">
                  <AudioVisualizer
                    isPlaying={true}
                    onToggle={() => onMediaControl("toggle")}
                    optAccent={optAccent}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Playback Controls & Progress */}
        <div
          className="flex flex-col gap-2 cursor-default mt-1"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Interactive Scrubber with timestamps (lifted up & enlarged) */}
          <div className="flex items-center gap-2.5 w-full select-none mb-1.5">
            <span className={`${timeLabelClass} text-left`}>
              {formatMediaTime(currentMediaPosition)}
            </span>
            <div
              className="flex-1 h-4 group flex items-center cursor-pointer relative py-0.5"
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = Math.max(
                  0,
                  Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
                );
                onSetIsSeeking(true);
                onSetSeekValue(percent);
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (isSeeking && e.currentTarget.hasPointerCapture(e.pointerId)) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = Math.max(
                    0,
                    Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
                  );
                  onSetSeekValue(percent);
                }
              }}
              onPointerUp={async (e) => {
                e.currentTarget.releasePointerCapture(e.pointerId);
                if (isSeeking) {
                  if (mediaProgress.duration > 0) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percent = Math.max(
                      0,
                      Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
                    );
                    const newPos = (percent / 100) * mediaProgress.duration;
                    await invoke("smtc_seek", { positionSec: newPos });
                    onSetMediaProgress((prev) => ({ ...prev, position: newPos }));
                  }
                  onSetIsSeeking(false);
                }
              }}
              onPointerCancel={(e) => {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {}
                if (isSeeking) {
                  onSetIsSeeking(false);
                }
              }}
            >
              <div
                className={`w-full ${
                  isSeeking ? "h-[9px] bg-white/30" : "h-[5px] group-hover:h-[8px] bg-white/20"
                } media-progress-track rounded-full overflow-hidden flex relative pointer-events-none transition-[height,background-color] duration-150 ease-out`}
              >
                {mediaProgress.duration > 0 ? (
                  <div
                    className={`h-full ${
                      isSeeking ? "bg-white shadow-[0_0_10px_rgba(255,255,255,0.6)]" : "bg-white/85 group-hover:bg-white"
                    } media-progress-fill rounded-full`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          isSeeking
                            ? seekValue
                            : (mediaProgress.position / mediaProgress.duration) * 100
                        )
                      )}%`,
                      transition: isSeeking ? "none" : "width 500ms linear, background-color 150ms ease",
                    }}
                  />
                ) : (
                  <div className="h-full w-1/3 bg-white/30 media-progress-fill rounded-full" />
                )}
              </div>
            </div>
            <span className={`${timeLabelClass} text-right`}>
              {mediaProgress.duration > 0
                ? `-${formatMediaTime(remainingMediaDuration)}`
                : "-0:00"}
            </span>
          </div>

          <div className="flex items-center justify-center gap-6 relative">
            <div className="w-9 h-9 opacity-0 pointer-events-none shrink-0" />

            <div className="flex items-center gap-7">
              <Tooltip content={t("media_prev")} side="top">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMediaControl("prev");
                  }}
                  className="w-10 h-10 flex items-center justify-center rounded-full transition-all shrink-0 text-white/60 hover:text-white hover:bg-white/10 media-control-btn"
                >
                  <SkipBack size={22} fill="currentColor" />
                </motion.button>
              </Tooltip>
              <Tooltip content={activePlaying ? t("media_pause") : t("media_play")} side="top">
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMediaControl("toggle");
                  }}
                  className="w-11 h-11 flex items-center justify-center text-white hover:bg-white/10 media-play-btn rounded-full shrink-0 transition-colors cursor-pointer"
                >
                  {activePlaying ? (
                    <Pause size={26} fill="currentColor" />
                  ) : (
                    <Play size={26} fill="currentColor" className="ml-0.5" />
                  )}
                </motion.button>
              </Tooltip>
              <Tooltip content={t("media_next")} side="top">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMediaControl("next");
                  }}
                  className="w-10 h-10 flex items-center justify-center rounded-full transition-all shrink-0 text-white/60 hover:text-white hover:bg-white/10 media-control-btn"
                >
                  <SkipForward size={22} fill="currentColor" />
                </motion.button>
              </Tooltip>
            </div>

            {/* Lyrics / App Info Toggle Button */}
            <Tooltip content={showLyrics ? t("media_app_source") : t("lyrics_title")} side="top">
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLyrics();
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-all shrink-0 media-control-btn cursor-pointer ${
                  showLyrics
                    ? "bg-white text-black shadow-[0_2px_10px_rgba(255,255,255,0.35)]"
                    : "text-white/70 hover:text-white bg-white/[0.08] hover:bg-white/[0.16]"
                }`}
              >
                {showLyrics ? <MessageSquareQuote size={16} /> : <ListMusic size={16} />}
              </motion.button>
            </Tooltip>
          </div>

          {/* Volume Slider (Sleek Slim Style) */}
          <div
            className="flex items-center gap-2 mt-0.5 w-full cursor-default select-none px-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Volume2 size={13.5} className="text-white/45 media-volume-icon shrink-0" />
            <div
              className="flex-1 h-3.5 group flex items-center cursor-pointer relative"
              onWheel={(e) => {
                if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
                  e.stopPropagation();
                  if (Math.abs(e.deltaY) < 1) return;
                  const dir = getWheelVerticalDirection(e);
                  const next = Math.max(0, Math.min(100, soundLevel + (dir > 0 ? 2 : -2)));
                  handleVolumeChange(next, true);
                }
              }}
              onPointerDown={(e) => {
                isAdjustingVolumeRef.current = true;
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = Math.max(
                  0,
                  Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))
                );
                handleVolumeChange(percent, false);
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = Math.max(
                    0,
                    Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))
                  );
                  handleVolumeChange(percent, false);
                }
              }}
              onPointerUp={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = Math.max(
                  0,
                  Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))
                );
                handleVolumeChange(percent, true);
                e.currentTarget.releasePointerCapture(e.pointerId);
                setTimeout(() => {
                  isAdjustingVolumeRef.current = false;
                }, 300);
              }}
              onPointerCancel={(e) => {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {}
                setTimeout(() => {
                  isAdjustingVolumeRef.current = false;
                }, 300);
              }}
            >
              <div className="w-full h-[5px] group-hover:h-[8px] bg-white/[0.12] group-hover:bg-white/[0.2] media-volume-track rounded-full overflow-hidden flex relative pointer-events-none transition-[height,background-color] duration-150 ease-out">
                <div
                  className="h-full bg-white/75 group-hover:bg-white media-volume-fill rounded-full transition-colors"
                  style={{ width: `${soundLevel}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Divider + Content (Lyrics / Queue) */}
      <div
        className="flex-1 h-full min-w-0 flex items-stretch overflow-hidden z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-[1px] h-[80%] self-center bg-gradient-to-b from-transparent via-white/15 to-transparent shrink-0 mr-3" />
        <div className="flex-1 h-full min-w-0 flex flex-col relative overflow-hidden">
          {/* View Content (LyricsView or MediaQueueView) */}
          <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
            <AnimatePresence mode="wait">
              {showLyrics ? (
                <motion.div
                  key="lyrics-tab-view"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  className="w-full h-full flex flex-col"
                >
                  <LyricsView
                    lyrics={lyricsData}
                    isLoading={isLyricsLoading}
                    currentTime={currentMediaPosition}
                    isPlaying={activePlaying}
                    onSeek={async (time) => {
                      await invoke("smtc_seek", { positionSec: time });
                      onSetMediaProgress((prev) => ({ ...prev, position: time }));
                    }}
                    onRefreshLyrics={onRefreshLyrics}
                    songTitle={media?.title || ""}
                    artist={media?.artist || ""}
                    currentProvider={currentLyricsProvider}
                    onChangeProvider={onChangeLyricsProvider}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="queue-tab-view"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.15 }}
                  className="w-full h-full flex flex-col"
                >
                  <MediaQueueView
                    media={media}
                    isPlaying={activePlaying}
                    mediaProgress={mediaProgress}
                    queueHistory={queueHistory}
                    onMediaControl={onMediaControl}
                    optAccent={optAccent}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
