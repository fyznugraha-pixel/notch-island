import React, { useState, useEffect, useRef } from "react";
import {
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ExternalLink,
  MessageSquareQuote,
  Radio,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MediaPayload } from "../../types";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { MediaThumbnail } from "../../components/ui/MediaThumbnail";
import { ScrollingText } from "../../components/ui/ScrollingText";
import { Tooltip } from "../../components/ui/Tooltip";
import { getMediaBranding } from "../../utils/playerBranding";
import {
  mergeMediaPayloadPreservingThumbnail,
  prefetchArtwork,
} from "../../services/artworkService";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";

const MEDIA_STORAGE_KEY = "gili_live_media_v1";

function formatTime(seconds?: number): string {
  if (typeof seconds !== "number" || isNaN(seconds) || seconds < 0) {
    return "0:00";
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const MediaNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const [suppressOuterTip, setSuppressOuterTip] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const [media, setMedia] = useState<MediaPayload | null>(() => {
    try {
      const raw = localStorage.getItem(MEDIA_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.title) return { ...parsed, is_playing: false };
      }
    } catch {}
    return null;
  });
  const mediaRef = useRef<MediaPayload | null>(media);
  mediaRef.current = media;

  const [progress, setProgress] = useState<{ position: number; duration: number }>({
    position: 0,
    duration: 0,
  });

  useEffect(() => {
    let cancelled = false;
    let receivedLiveUpdate = false;

    const unlistenMedia = listen<MediaPayload>("media-update", (ev) => {
      if (cancelled) return;
      receivedLiveUpdate = true;
      if (ev.payload?.title || ev.payload?.artist) {
        const resolvedPayload = mergeMediaPayloadPreservingThumbnail(mediaRef.current, ev.payload);
        mediaRef.current = resolvedPayload;
        setMedia(resolvedPayload);
        prefetchArtwork(resolvedPayload);
        if (
          ev.payload.position !== undefined &&
          ev.payload.duration !== undefined
        ) {
          setProgress({
            position: ev.payload.position,
            duration: ev.payload.duration,
          });
        }
        try {
          localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(resolvedPayload));
        } catch {}
      } else if (ev.payload && !ev.payload.is_playing) {
        setMedia((prev) => {
          const next = prev ? { ...prev, is_playing: false } : null;
          mediaRef.current = next;
          return next;
        });
      }
    });

    unlistenMedia
      .then(() => {
        if (!cancelled) {
          invoke("request_media_resync").catch(() => {});
        }
      })
      .catch(() => {});

    invoke<MediaPayload | null>("get_current_media_state")
      .then((initial) => {
        if (cancelled || receivedLiveUpdate) return;
        if (!initial) {
          setMedia((prev) => {
            const next = prev ? { ...prev, is_playing: false } : null;
            mediaRef.current = next;
            return next;
          });
          return;
        }
        prefetchArtwork(initial);
        const merged = mergeMediaPayloadPreservingThumbnail(mediaRef.current, initial);
        mediaRef.current = merged;
        setMedia(merged);
        if (merged.title || merged.artist) {
          try {
            localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(merged));
          } catch {}
        }
        if (
          typeof initial.position === "number" &&
          typeof initial.duration === "number"
        ) {
          setProgress({ position: initial.position, duration: initial.duration });
        }
      })
      .catch(() => {});

    const unlistenProgress = listen<{ position: number; duration: number }>(
      "media-progress",
      (ev) => {
        if (cancelled) return;
        if (typeof ev.payload?.position === "number") {
          setProgress({
            position: ev.payload.position,
            duration: ev.payload.duration || 0,
          });
        }
      }
    );

    return () => {
      cancelled = true;
      unlistenMedia.then((fn) => fn()).catch(() => {});
      unlistenProgress.then((fn) => fn()).catch(() => {});
    };
  }, []);

  const isPlaying = Boolean(media?.is_playing);
  const title = media?.title?.trim() || tx(lang, "No media playing", "Tidak ada media");
  const artist = media?.artist?.trim() || tx(lang, "Media Player", "Pemutar Media");
  const hasMedia = Boolean(media?.title);
  const hasCoverContext = Boolean(media && (media.title?.trim() || media.artist?.trim() || media.thumbnail));
  const branding = getMediaBranding(media);

  const triggerAction = async (
    action: "toggle" | "next" | "prev",
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    try {
      await invoke("smtc_action", { action });
      if (action === "toggle") {
        setMedia((m) => (m ? { ...m, is_playing: !m.is_playing } : null));
      }
    } catch {}
  };

  const handleSeek = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPos = parseFloat(e.target.value);
    setProgress((p) => ({ ...p, position: newPos }));
    try {
      await invoke("smtc_seek", { positionSec: newPos });
    } catch {}
  };

  const handleOpenNotchMedia = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    invoke("trigger_notch_action", { action: "open_tab:media_expanded" }).catch(
      () => {}
    );
    setIsOpen(false);
  };

  const pct =
    progress.duration > 0
      ? Math.min(100, Math.max(0, (progress.position / progress.duration) * 100))
      : 0;
  const handleToggle = () => setIsOpen((v) => !v);

  const playStateLabel = isPlaying
    ? tx(lang, "Playing", "Sedang diputar")
    : tx(lang, "Paused", "Jeda");
  const toggleBtnLabel = isPlaying ? tx(lang, "Pause", "Jeda") : tx(lang, "Play", "Putar");
  const musicPrefix = tx(lang, "Music", "Musik");
  const triggerTooltip = `${musicPrefix}: ${title} · ${artist} (${playStateLabel})`;

  return (
    <>
      <Tooltip
        content={triggerTooltip}
        side={tooltipSide}
        disabled={isOpen || suppressOuterTip}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            `${musicPrefix}: ${title}, ${artist}`,
            isOpen
          )}
          className={`relative flex items-center cursor-pointer select-none group/mediapill ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08]`
              : "gili-mod-pill px-2.5 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] shadow-sm overflow-hidden"
          }`}
          style={{
            transition:
              "all 0.35s cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms ease",
          }}
        >
          {isCompact ? (
            <div className="relative w-[min(28px,calc(var(--navbar-mod-size,40px)-6px))] h-[min(28px,calc(var(--navbar-mod-size,40px)-6px))] shrink-0">
              <div className="w-full h-full rounded-[8px] bg-gradient-to-br from-pink-500 via-rose-500 to-indigo-600 flex items-center justify-center overflow-hidden shadow-sm ring-1 ring-white/10">
                {hasCoverContext && media ? (
                  <MediaThumbnail media={media} size="compact" />
                ) : (
                  <Music size={13} className="text-[#ffffff]/90" />
                )}
              </div>
              {isPlaying && (
                <div className="absolute bottom-0 right-0 h-[10px] px-[2.5px] rounded-[4px] bg-[#090a0f]/95 flex items-center justify-center gap-[1.5px] ring-1 ring-white/15 shadow-sm pointer-events-none">
                  <span className="w-[1.5px] h-[5px] bg-emerald-400 rounded-full animate-eq-bar" style={{ animationDelay: "0ms" }} />
                  <span className="w-[1.5px] h-[5px] bg-emerald-400 rounded-full animate-eq-bar" style={{ animationDelay: "180ms" }} />
                  <span className="w-[1.5px] h-[5px] bg-emerald-400 rounded-full animate-eq-bar" style={{ animationDelay: "360ms" }} />
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="relative w-[min(26px,calc(var(--navbar-mod-size,40px)-8px))] h-[min(26px,calc(var(--navbar-mod-size,40px)-8px))] rounded-[7px] bg-gradient-to-br from-pink-500 via-rose-500 to-indigo-600 flex items-center justify-center overflow-hidden shrink-0 shadow-sm ring-1 ring-white/10">
                {hasCoverContext && media ? (
                  <MediaThumbnail media={media} size="compact" />
                ) : (
                  <Music size={13} className="text-[#ffffff]/90" />
                )}
              </div>

              <div className="flex flex-col justify-center min-w-0 max-w-[125px] overflow-hidden leading-tight flex-1">
                <ScrollingText
                  text={title}
                  className="text-[11.5px] font-semibold text-white/95 tracking-tight leading-tight"
                />
                <ScrollingText
                  text={artist}
                  className="text-[10px] text-zinc-400 font-medium tracking-tight leading-tight mt-0.5"
                />
              </div>

              {hasMedia && (
                <div
                  className="shrink-0 ml-0.5 flex items-center"
                  onMouseEnter={() => setSuppressOuterTip(true)}
                  onMouseLeave={() => setSuppressOuterTip(false)}
                >
                  <Tooltip content={toggleBtnLabel} side={tooltipSide} isLightMode={isLight}>
                    <button
                      type="button"
                      onClick={(e) => triggerAction("toggle", e)}
                      className={`w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.2] flex items-center justify-center text-white/90 hover:text-white transition-all active:scale-90 cursor-pointer border border-white/[0.08] ${TRIGGER_FOCUS_RING}`}
                    >
                      {isPlaying ? (
                        <Pause size={10} className="fill-current" />
                      ) : (
                        <Play size={10} className="ml-0.5 fill-current" />
                      )}
                    </button>
                  </Tooltip>
                </div>
              )}

              {progress.duration > 0 && isPlaying && (
                <div
                  className={`absolute bottom-0 left-2 right-2 h-[2px] rounded-full overflow-hidden pointer-events-none ${
                    isLight ? "bg-black/[0.14]" : "bg-white/[0.12]"
                  }`}
                >
                  <div
                    className={`h-full transition-all duration-300 ${
                      isLight
                        ? "bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500"
                        : "bg-gradient-to-r from-pink-500 via-rose-400 to-indigo-400"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Now Playing", "Sedang Diputar")}
        moduleId="sedang_diputar"
        currentView={view}
        config={config}
        width={280}
      >
        <div className="flex flex-col gap-3">
          <div className="relative p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center gap-3 overflow-hidden">
            <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-pink-500 via-rose-500 to-indigo-600 flex items-center justify-center overflow-hidden shrink-0 shadow-[0_8px_20px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
              {hasCoverContext && media ? (
                <MediaThumbnail media={media} size="normal" />
              ) : (
                <Music size={22} className="text-[#ffffff]/85" />
              )}
            </div>

            <div className="min-w-0 flex-1 overflow-hidden">
              <ScrollingText
                text={title}
                className="text-[13px] font-semibold text-white tracking-tight leading-snug"
              />
              <ScrollingText
                text={artist}
                className="text-[11px] text-zinc-400 font-medium tracking-tight leading-snug mt-0.5"
              />

              <div className="flex items-center gap-2 mt-1.5 min-w-0">
                <div className="inline-flex items-center gap-1 max-w-full min-w-0 px-1.5 py-0.5 rounded-[5px] bg-white/[0.06] border border-white/[0.08] text-[9.5px] font-medium text-zinc-200 select-none">
                  {media?.web_source ? (
                    <Radio size={9} className="text-pink-400 shrink-0" />
                  ) : (
                    <Music size={9} className="text-pink-400 shrink-0" />
                  )}
                  <span className="truncate max-w-[90px] min-w-0">
                    {media?.web_source || branding.name}
                  </span>
                </div>

                {isPlaying && (
                  <div className="flex items-end gap-[1.5px] h-2.5 px-0.5 pointer-events-none">
                    <span className="w-[1.5px] h-2.5 bg-pink-400 rounded-full animate-eq-bar" style={{ animationDelay: "0ms" }} />
                    <span className="w-[1.5px] h-2.5 bg-pink-400 rounded-full animate-eq-bar" style={{ animationDelay: "150ms" }} />
                    <span className="w-[1.5px] h-2.5 bg-pink-400 rounded-full animate-eq-bar" style={{ animationDelay: "300ms" }} />
                    <span className="w-[1.5px] h-2.5 bg-pink-400 rounded-full animate-eq-bar" style={{ animationDelay: "450ms" }} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {progress.duration > 0 && (
            <div className="flex flex-col gap-1.5 px-0.5 pt-0.5">
              <Tooltip
                content={`${tx(lang, "Seek", "Geser")}: ${formatTime(progress.position)}`}
                side="top"
                isLightMode={isLight}
                wrapperClassName="w-full"
              >
                <div className="relative w-full h-3.5 flex items-center group/scrubber cursor-pointer">
                  <div
                    className={`w-full h-1 group-hover/scrubber:h-1.5 rounded-full transition-all overflow-hidden ${
                      isLight ? "bg-black/[0.14]" : "bg-white/[0.12]"
                    }`}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-150 ${
                        isLight
                          ? "bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500"
                          : "bg-gradient-to-r from-pink-500 via-rose-400 to-amber-300"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.6)] scale-0 group-hover/scrubber:scale-100 transition-transform pointer-events-none ${
                      isLight ? "bg-zinc-900" : "bg-white"
                    }`}
                    style={{ left: `${pct}%` }}
                  />
                  <input
                    type="range"
                    aria-label={tx(lang, "Track position", "Posisi lagu")}
                    min={0}
                    max={progress.duration}
                    step={1}
                    value={progress.position}
                    onChange={handleSeek}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                </div>
              </Tooltip>

              <div className="flex justify-between items-center text-[10px] text-zinc-400 font-mono select-none px-0.5">
                <span className="tabular-nums font-medium">{formatTime(progress.position)}</span>
                <span className="tabular-nums font-medium">-{formatTime(Math.max(0, progress.duration - progress.position))}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 py-0.5">
            <Tooltip
              content={tx(lang, "Previous Track", "Lagu Sebelumnya")}
              side="top"
              isLightMode={isLight}
            >
              <button
                type="button"
                onClick={() => triggerAction("prev")}
                className={`w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-90 flex items-center justify-center text-white/85 hover:text-white transition-all cursor-pointer border border-white/[0.08] ${TRIGGER_FOCUS_RING}`}
              >
                <SkipBack size={15} className="fill-current" />
              </button>
            </Tooltip>
            <Tooltip content={toggleBtnLabel} side="top" isLightMode={isLight}>
              <button
                type="button"
                onClick={() => triggerAction("toggle")}
                className={`w-12 h-12 rounded-full hover:scale-105 active:scale-95 flex items-center justify-center transition-all cursor-pointer ${TRIGGER_FOCUS_RING} ${
                  isLight
                    ? "bg-zinc-900 hover:bg-zinc-800 text-[#ffffff] shadow-md"
                    : "bg-white hover:bg-neutral-100 text-neutral-900 shadow-[0_4px_18px_rgba(255,255,255,0.25)]"
                }`}
              >
                {isPlaying ? (
                  <Pause size={18} className="fill-current" />
                ) : (
                  <Play size={18} className="ml-0.5 fill-current" />
                )}
              </button>
            </Tooltip>
            <Tooltip
              content={tx(lang, "Next Track", "Lagu Berikutnya")}
              side="top"
              isLightMode={isLight}
            >
              <button
                type="button"
                onClick={() => triggerAction("next")}
                className={`w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-90 flex items-center justify-center text-white/85 hover:text-white transition-all cursor-pointer border border-white/[0.08] ${TRIGGER_FOCUS_RING}`}
              >
                <SkipForward size={15} className="fill-current" />
              </button>
            </Tooltip>
          </div>

          <button
            type="button"
            onClick={handleOpenNotchMedia}
            className={`group w-full min-w-0 h-8.5 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] active:scale-[0.98] border border-white/[0.08] text-zinc-200 hover:text-white text-[11px] font-medium flex items-center justify-between gap-2 transition-all cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <MessageSquareQuote size={13} className="text-pink-400 shrink-0 transition-transform group-hover:scale-110" />
              <span className="truncate">
                {tx(lang, "Open in Island (Lyrics & Queue)", "Buka di Island (Lirik & Antrean)")}
              </span>
            </div>
            <ExternalLink size={11} className="text-zinc-400 shrink-0 group-hover:text-white transition-colors" />
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
