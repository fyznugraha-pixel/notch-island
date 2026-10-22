import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Volume2,
  MessageSquareQuote,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { MediaPayload } from "../../types";
import { MediaThumbnail } from "./MediaThumbnail";
import { AudioVisualizer } from "./AudioVisualizer";
import { ScrollingText } from "./ScrollingText";
import { Tooltip } from "./Tooltip";
import { LyricsView } from "./LyricsView";
import { LyricsData } from "../../services/lyricsService";
import { formatMediaTime } from "../../utils/time";
import { t } from "../../services/i18n";

export interface MediaExpandedPanelProps {
  slideDirection: number;
  tabWidth?: number;
  media: MediaPayload;
  isPlaying: boolean;
  onMediaControl: (action: "play" | "pause" | "next" | "prev" | "toggle") => void;
  optAccent: string;
  showLyrics: boolean;
  onToggleLyrics: () => void;
  lyricsData: LyricsData | null;
  isLyricsLoading: boolean;
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

const smoothSpring = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
};

const timeLabelClass =
  "text-[11px] font-semibold tracking-tight text-white/50 media-time-label w-9 shrink-0 tabular-nums select-none";

export const MediaExpandedPanel: React.FC<MediaExpandedPanelProps> = ({
  slideDirection,
  tabWidth,
  media,
  isPlaying,
  onMediaControl,
  optAccent,
  showLyrics,
  onToggleLyrics,
  lyricsData,
  isLyricsLoading,
  mediaProgress,
  onSetMediaProgress,
  isSeeking,
  onSetIsSeeking,
  seekValue,
  onSetSeekValue,
  soundLevel,
  onSetSoundLevel,
  isAdjustingVolumeRef,
}) => {
  const currentMediaPosition = isSeeking
    ? (seekValue / 100) * mediaProgress.duration
    : mediaProgress.position;

  const remainingMediaDuration = Math.max(
    0,
    mediaProgress.duration - currentMediaPosition
  );

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
      {/* Left Column: Player Controls */}
      <motion.div
        animate={{
          width: showLyrics ? 320 : (tabWidth ? tabWidth - 24 : 416),
        }}
        transition={smoothSpring}
        className="h-full flex flex-col justify-between min-w-0 relative z-10 shrink-0 overflow-hidden"
      >
        <div className="flex items-center gap-3.5 px-0.5">
          <div className="w-14 h-14 bg-neutral-800/50 rounded-xl flex items-center justify-center shrink-0 overflow-hidden shadow-lg border border-white/10 relative">
            <MediaThumbnail media={media} size="large" />
          </div>
          <div className="flex flex-col overflow-hidden flex-1 min-w-0">
            <ScrollingText
              text={media.title}
              className="text-[16px] font-semibold text-white tracking-tight leading-tight"
            />
            <ScrollingText
              text={media.artist}
              className="text-[13px] font-medium text-white/60 mt-0.5 leading-tight"
            />
          </div>
          <AnimatePresence>
            {isPlaying && (
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
          className="flex flex-col gap-2.5 cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Interactive Scrubber with timestamps (lifted up & enlarged) */}
          <div className="flex items-center gap-2.5 w-full select-none mb-2">
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
              <Tooltip content={isPlaying ? t("media_pause") : t("media_play")} side="top">
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMediaControl("toggle");
                  }}
                  className="w-11 h-11 flex items-center justify-center text-white hover:bg-white/10 media-play-btn rounded-full shrink-0 transition-colors cursor-pointer"
                >
                  {isPlaying ? (
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

            {/* Lyrics Toggle Button (Apple Music capsule badge style) */}
            <Tooltip content={t("lyrics_title")} side="top">
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
                    : "text-white/55 hover:text-white bg-white/[0.08] hover:bg-white/[0.16]"
                }`}
              >
                <MessageSquareQuote size={16} />
              </motion.button>
            </Tooltip>
          </div>

          {/* Volume Slider (Sleek Slim Style) */}
          <div
            className="flex items-center gap-2 mt-1 w-full cursor-default select-none px-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Volume2 size={13.5} className="text-white/45 media-volume-icon shrink-0" />
            <div
              className="flex-1 h-3.5 group flex items-center cursor-pointer relative"
              onPointerDown={(e) => {
                isAdjustingVolumeRef.current = true;
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = Math.max(
                  0,
                  Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
                );
                onSetSoundLevel(Math.round(percent));
                invoke("set_master_volume", { level: percent / 100.0 });
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = Math.max(
                    0,
                    Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
                  );
                  onSetSoundLevel(Math.round(percent));
                  invoke("set_master_volume", { level: percent / 100.0 });
                }
              }}
              onPointerUp={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId);
                setTimeout(() => {
                  isAdjustingVolumeRef.current = false;
                }, 500);
              }}
              onPointerCancel={(e) => {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {}
                setTimeout(() => {
                  isAdjustingVolumeRef.current = false;
                }, 500);
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
      </motion.div>

      {/* Right Column: Lyrics View with organic vertical gradient divider */}
      <AnimatePresence>
        {showLyrics && (
          <motion.div
            key="lyrics-section"
            initial={{ opacity: 0, x: 20 }}
            animate={{
              opacity: 1,
              x: 0,
              transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
            }}
            exit={{
              opacity: 0,
              x: 16,
              transition: { duration: 0.14, ease: [0.16, 1, 0.3, 1] },
            }}
            className="flex-1 h-full min-w-0 flex items-center overflow-hidden z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-[1px] h-[75%] self-center bg-gradient-to-b from-transparent via-white/15 to-transparent shrink-0 mr-2" />
            <div className="flex-1 h-full min-w-0 flex flex-col relative overflow-hidden">
              <LyricsView
                lyrics={lyricsData}
                isLoading={isLyricsLoading}
                currentTime={currentMediaPosition}
                isPlaying={isPlaying}
                onSeek={async (time) => {
                  await invoke("smtc_seek", { positionSec: time });
                  onSetMediaProgress((prev) => ({ ...prev, position: time }));
                }}
                songTitle={media.title}
                artist={media.artist}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
