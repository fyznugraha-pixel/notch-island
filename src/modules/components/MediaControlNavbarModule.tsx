import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipBack, SkipForward, ExternalLink, Music2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MediaPayload } from "../../types";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { ScrollingText } from "../../components/ui/ScrollingText";
import { Tooltip } from "../../components/ui/Tooltip";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

export const MediaControlNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentArtist, setCurrentArtist] = useState("");

  useEffect(() => {
    invoke<MediaPayload | null>("get_current_media_state")
      .then((initial) => {
        if (!initial) return;
        setIsPlaying(Boolean(initial.is_playing));
        if (initial.title) setCurrentTitle(initial.title);
        if (initial.artist) setCurrentArtist(initial.artist);
      })
      .catch(() => {});

    const unlisten = listen<MediaPayload>("media-update", (ev) => {
      if (typeof ev.payload?.is_playing === "boolean") {
        setIsPlaying(ev.payload.is_playing);
      }
      if (ev.payload?.title) {
        setCurrentTitle(ev.payload.title);
      }
      if (ev.payload?.artist) {
        setCurrentArtist(ev.payload.artist);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const sendSmtc = (action: "prev" | "toggle" | "next", e?: React.MouseEvent) => {
    e?.stopPropagation();
    invoke("smtc_action", { action }).catch(() => {});
    if (action === "toggle") {
      setIsPlaying((p) => !p);
    }
  };

  const handleOpenNotch = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    invoke("trigger_notch_action", { action: "open_tab:media_expanded" }).catch(
      () => {}
    );
    setIsOpen(false);
  };

  const handleToggle = () => setIsOpen((v) => !v);

  const statusLabel = isPlaying
    ? tx(lang, "Playing", "Sedang diputar")
    : tx(lang, "Paused", "Jeda");
  const triggerTooltip = isCompact
    ? `${tx(lang, "Media Controls", "Kontrol Media")} (${
        isPlaying ? tx(lang, "Playing", "Diputar") : tx(lang, "Paused", "Jeda")
      }${currentTitle ? `: ${currentTitle}` : ""}) · ${tx(
        lang,
        "Click for controls, right-click Play/Pause",
        "Klik untuk kontrol, klik kanan Putar/Jeda"
      )}`
    : `${tx(lang, "Media Controls", "Kontrol Media")} (${statusLabel}${
        currentTitle ? `: ${currentTitle}` : ""
      })`;
  const prevLabel = tx(lang, "Previous Track", "Lagu Sebelumnya");
  const toggleLabel = isPlaying ? tx(lang, "Pause", "Jeda") : tx(lang, "Play", "Putar");
  const nextLabel = tx(lang, "Next Track", "Lagu Berikutnya");

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
          onContextMenu={(e) => {
            e.preventDefault();
            sendSmtc("toggle", e);
          }}
          {...makeTriggerA11yProps(
            handleToggle,
            `${tx(lang, "Media Controls", "Kontrol Media")} (${statusLabel})`,
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `${
                  isVertical ? "w-full max-w-full" : "w-10"
                } h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08]`
              : "h-10 px-3 gap-3 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] shadow-sm"
          }`}
        >
          {isCompact ? (
            isPlaying ? (
              <Pause size={15} className="fill-current text-white/95" />
            ) : (
              <Play size={15} className="ml-0.5 fill-current text-white/95" />
            )
          ) : (
            <div
              className="flex items-center gap-3"
              onMouseEnter={() => setSuppressOuterTip(true)}
              onMouseLeave={() => setSuppressOuterTip(false)}
            >
              <Tooltip content={prevLabel} side={tooltipSide} isLightMode={isLight}>
                <button
                  type="button"
                  onClick={(e) => sendSmtc("prev", e)}
                  className={`text-white/75 hover:text-white transition-colors cursor-pointer active:scale-90 rounded ${TRIGGER_FOCUS_RING}`}
                >
                  <SkipBack size={14} className="fill-current" />
                </button>
              </Tooltip>
              <Tooltip content={toggleLabel} side={tooltipSide} isLightMode={isLight}>
                <button
                  type="button"
                  onClick={(e) => sendSmtc("toggle", e)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 ${TRIGGER_FOCUS_RING} ${
                    isLight
                      ? "bg-zinc-900 text-[#ffffff] hover:bg-zinc-800"
                      : "bg-white text-neutral-900 hover:bg-neutral-100"
                  }`}
                >
                  {isPlaying ? (
                    <Pause size={12} className="fill-current" />
                  ) : (
                    <Play size={12} className="ml-0.5 fill-current" />
                  )}
                </button>
              </Tooltip>
              <Tooltip content={nextLabel} side={tooltipSide} isLightMode={isLight}>
                <button
                  type="button"
                  onClick={(e) => sendSmtc("next", e)}
                  className={`text-white/75 hover:text-white transition-colors cursor-pointer active:scale-90 rounded ${TRIGGER_FOCUS_RING}`}
                >
                  <SkipForward size={14} className="fill-current" />
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Media Controls", "Kontrol Media")}
        moduleId="kontrol_media"
        currentView={view}
        config={config}
        width={256}
      >
        <div className="flex flex-col gap-3">
          {currentTitle ? (
            <div className="w-full min-w-0 px-2.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] overflow-hidden flex items-center gap-2">
              <Music2 size={13} className="text-pink-400 shrink-0" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <ScrollingText
                  text={currentTitle}
                  className="text-[12px] font-semibold text-white tracking-tight"
                />
                {currentArtist && (
                  <ScrollingText
                    text={currentArtist}
                    className="text-[10px] text-zinc-400 font-medium tracking-tight mt-0.5"
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-zinc-400 text-center py-1">
              {tx(lang, "No active media player.", "Belum ada pemutar media aktif.")}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 py-1">
            <Tooltip content={prevLabel} side="top" isLightMode={isLight}>
              <button
                type="button"
                onClick={() => sendSmtc("prev")}
                className={`w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-90 flex items-center justify-center text-white/85 hover:text-white transition-all cursor-pointer border border-white/[0.08] ${TRIGGER_FOCUS_RING}`}
              >
                <SkipBack size={14} className="fill-current" />
              </button>
            </Tooltip>
            <Tooltip content={toggleLabel} side="top" isLightMode={isLight}>
              <button
                type="button"
                onClick={() => sendSmtc("toggle")}
                className={`w-11 h-11 rounded-full hover:scale-105 active:scale-95 flex items-center justify-center transition-all cursor-pointer ${TRIGGER_FOCUS_RING} ${
                  isLight
                    ? "bg-zinc-900 hover:bg-zinc-800 text-[#ffffff] shadow-md"
                    : "bg-white hover:bg-neutral-100 text-neutral-900 shadow-[0_4px_16px_rgba(255,255,255,0.2)]"
                }`}
              >
                {isPlaying ? (
                  <Pause size={16} className="fill-current" />
                ) : (
                  <Play size={16} className="ml-0.5 fill-current" />
                )}
              </button>
            </Tooltip>
            <Tooltip content={nextLabel} side="top" isLightMode={isLight}>
              <button
                type="button"
                onClick={() => sendSmtc("next")}
                className={`w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-90 flex items-center justify-center text-white/85 hover:text-white transition-all cursor-pointer border border-white/[0.08] ${TRIGGER_FOCUS_RING}`}
              >
                <SkipForward size={14} className="fill-current" />
              </button>
            </Tooltip>
          </div>

          <button
            type="button"
            onClick={handleOpenNotch}
            className={`w-full px-3 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] active:scale-[0.98] border border-white/[0.08] text-zinc-200 hover:text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            <ExternalLink size={11} className="text-pink-400 shrink-0" />
            <span className="truncate">
              {tx(lang, "Open Music in Island", "Buka Musik di Island")}
            </span>
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
