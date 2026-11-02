import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipBack, SkipForward, ExternalLink, Music2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MediaPayload } from "../../types";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";
import { ScrollingText } from "../../components/ui/ScrollingText";

export const MediaControlNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentArtist, setCurrentArtist] = useState("");

  useEffect(() => {
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

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08]"
            : "h-10 px-3 gap-3 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] shadow-sm"
        }`}
        title={`Kontrol Media (${isPlaying ? "Sedang diputar" : "Jeda"}${
          currentTitle ? `: ${currentTitle}` : ""
        })`}
      >
        {isCompact ? (
          <button
            type="button"
            onClick={(e) => sendSmtc("toggle", e)}
            className="w-full h-full flex items-center justify-center text-white/90 hover:text-white cursor-pointer active:scale-90 transition-transform"
            title={isPlaying ? "Jeda" : "Putar"}
          >
            {isPlaying ? (
              <Pause size={15} className="fill-current text-white/95" />
            ) : (
              <Play size={15} className="ml-0.5 fill-current text-white/95" />
            )}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={(e) => sendSmtc("prev", e)}
              className="text-white/60 hover:text-white transition-colors cursor-pointer active:scale-90"
              title="Lagu Sebelumnya"
            >
              <SkipBack size={14} className="fill-current" />
            </button>
            <button
              type="button"
              onClick={(e) => sendSmtc("toggle", e)}
              className="w-7 h-7 rounded-full bg-white text-neutral-900 hover:bg-neutral-100 flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95"
              title={isPlaying ? "Jeda" : "Putar"}
            >
              {isPlaying ? (
                <Pause size={12} className="fill-current text-neutral-900" />
              ) : (
                <Play size={12} className="ml-0.5 fill-current text-neutral-900" />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => sendSmtc("next", e)}
              className="text-white/60 hover:text-white transition-colors cursor-pointer active:scale-90"
              title="Lagu Berikutnya"
            >
              <SkipForward size={14} className="fill-current" />
            </button>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Kontrol Media"
        moduleId="kontrol_media"
        currentView={view}
        config={config}
        width={240}
      >
        <div className="flex flex-col gap-3">
          {currentTitle && (
            <div className="px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden flex items-center gap-2">
              <Music2 size={13} className="text-pink-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <ScrollingText
                  text={currentTitle}
                  className="text-[12px] font-semibold text-white/90 tracking-tight"
                />
                {currentArtist && (
                  <ScrollingText
                    text={currentArtist}
                    className="text-[10px] text-white/50 font-medium tracking-tight mt-0.5"
                  />
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-3 py-1">
            <button
              type="button"
              onClick={() => sendSmtc("prev")}
              className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.12] active:scale-90 flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer border border-white/[0.06]"
              title="Lagu Sebelumnya"
            >
              <SkipBack size={14} className="fill-current text-white/70" />
            </button>
            <button
              type="button"
              onClick={() => sendSmtc("toggle")}
              className="w-11 h-11 rounded-full bg-white hover:bg-neutral-100 text-neutral-900 hover:scale-105 active:scale-95 flex items-center justify-center transition-all cursor-pointer shadow-[0_4px_16px_rgba(255,255,255,0.2)]"
              title={isPlaying ? "Jeda" : "Putar"}
            >
              {isPlaying ? (
                <Pause size={16} className="fill-current text-neutral-900" />
              ) : (
                <Play size={16} className="ml-0.5 fill-current text-neutral-900" />
              )}
            </button>
            <button
              type="button"
              onClick={() => sendSmtc("next")}
              className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.12] active:scale-90 flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer border border-white/[0.06]"
              title="Lagu Berikutnya"
            >
              <SkipForward size={14} className="fill-current text-white/70" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleOpenNotch}
            className="h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] active:scale-[0.98] border border-white/[0.07] text-white/75 hover:text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
          >
            <ExternalLink size={11} className="text-pink-400" />
            <span>Buka Musik di Island</span>
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
