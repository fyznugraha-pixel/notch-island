import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Check,
  Copy,
  Download,
  ListChecks,
  Minus,
  Music2,
  QrCode,
  X,
} from "lucide-react";
import {
  FALLBACK_PALETTES,
  LyricsCardPalette,
  LyricsCardPreferences,
  LyricsSharePayload,
  buildCardExportFilename,
  buildDefaultSelectedIndices,
  copyLyricsCardPng,
  extractLyricsCardPalettes,
  loadInitialLyricsSharePayload,
  loadLyricsCardPreferences,
  readImageFileAsSafeDataUrl,
  resolveSafeArtworkDataUrl,
  saveLyricsCardPng,
  saveLyricsCardPreferences,
  startLyricsCardQrShare,
  subscribeLyricsShareUpdates,
} from "../../services/lyricsShareService";
import { stopShelfTransfer } from "../../services/shelfTransferService";
import { renderLyricsCardToCanvas } from "../../utils/lyricsCardRenderer";
import { tx, useTaskbarLang } from "../../services/taskbarI18n";
import { TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import type { ShelfSessionInfo } from "../../types/shelfTransfer";
import { LyricsLinePickerDrawer } from "./LyricsLinePickerDrawer";
import { LyricsShareQrOverlay } from "./LyricsShareQrOverlay";
import { LyricsCardControls } from "./LyricsCardControls";

export const LyricsShareWindowApp: React.FC = () => {
  const lang = useTaskbarLang();
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeQrSessionRef = useRef<string | null>(null);

  const [payload, setPayload] = useState<LyricsSharePayload | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [safeArtworkUrl, setSafeArtworkUrl] = useState<string | null>(null);
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [palettes, setPalettes] = useState<LyricsCardPalette[]>(FALLBACK_PALETTES);
  const [prefs, setPrefs] = useState<LyricsCardPreferences>(() => loadLyricsCardPreferences());
  const [showLinePicker, setShowLinePicker] = useState(false);

  const [copiedState, setCopiedState] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"copy" | "save" | "qr" | null>(null);
  const [qrSession, setQrSession] = useState<ShelfSessionInfo | null>(null);
  const [qrThumbUrl, setQrThumbUrl] = useState<string | null>(null);

  const applyIncomingPayload = useCallback((next: LyricsSharePayload) => {
    setPayload(next);
    const valid = next.selectedIndices.filter(
      (i) => i >= 0 && i < next.lines.length && Boolean(next.lines[i]?.trim())
    );
    setSelectedIndices(
      valid.length > 0 ? valid.slice(0, 5) : buildDefaultSelectedIndices(next.lines, -1)
    );
    setSavedPath(null);
    setActionError(null);
    setShowLinePicker(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadInitialLyricsSharePayload().then((initial) => {
      if (!cancelled && initial) applyIncomingPayload(initial);
    });
    let unlisten: (() => void) | null = null;
    subscribeLyricsShareUpdates((next) => {
      if (!cancelled) applyIncomingPayload(next);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
      if (activeQrSessionRef.current) {
        stopShelfTransfer().catch(() => {});
      }
    };
  }, [applyIncomingPayload]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (qrSession) {
        activeQrSessionRef.current = null;
        setQrSession(null);
        stopShelfTransfer().catch(() => {});
      } else if (showLinePicker) {
        setShowLinePicker(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [qrSession, showLinePicker]);

  useEffect(() => {
    let cancelled = false;
    resolveSafeArtworkDataUrl(payload?.artworkUrl).then((resolved) => {
      if (!cancelled) setSafeArtworkUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [payload?.artworkUrl]);

  useEffect(() => {
    let cancelled = false;
    extractLyricsCardPalettes(customBgUrl || safeArtworkUrl).then((extracted) => {
      if (!cancelled) setPalettes(extracted);
    });
    return () => {
      cancelled = true;
    };
  }, [customBgUrl, safeArtworkUrl]);

  const activePalette = useMemo(() => {
    return palettes.find((p) => p.id === prefs.paletteId) || palettes[0] || FALLBACK_PALETTES[0];
  }, [palettes, prefs.paletteId]);

  const selectedLines = useMemo(() => {
    if (!payload) return [];
    return selectedIndices
      .map((i) => payload.lines[i]?.trim() || "")
      .filter(Boolean);
  }, [payload, selectedIndices]);

  const updatePrefs = (patch: Partial<LyricsCardPreferences>) => {
    setPrefs((prev) => saveLyricsCardPreferences({ ...prev, ...patch }));
  };

  const handleSelectCustomBgFile = async (file: File) => {
    setActionError(null);
    try {
      const dataUrl = await readImageFileAsSafeDataUrl(file);
      setCustomBgUrl(dataUrl);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !payload) return;
    let cancelled = false;
    const draw = async () => {
      try {
        await document.fonts.ready;
      } catch {}
      if (cancelled) return;
      await renderLyricsCardToCanvas(canvas, {
        title: payload.title,
        artist: payload.artist,
        album: payload.album,
        lines: selectedLines,
        artworkDataUrl: safeArtworkUrl,
        customBgDataUrl: customBgUrl,
        style: prefs.style,
        ratio: prefs.ratio,
        palette: activePalette,
        fontColor: prefs.fontColor,
        bgBlur: prefs.bgBlur,
        showWatermark: true,
        targetWidth: 720,
      });
    };
    draw();
    return () => {
      cancelled = true;
    };
  }, [
    payload,
    selectedLines,
    safeArtworkUrl,
    customBgUrl,
    prefs.style,
    prefs.ratio,
    prefs.fontColor,
    prefs.bgBlur,
    activePalette,
  ]);

  const exportHighResDataUrl = async (): Promise<string> => {
    if (!payload) throw new Error("No track data");
    const offscreen = document.createElement("canvas");
    try {
      await document.fonts.ready;
    } catch {}
    await renderLyricsCardToCanvas(offscreen, {
      title: payload.title,
      artist: payload.artist,
      album: payload.album,
      lines: selectedLines,
      artworkDataUrl: safeArtworkUrl,
      customBgDataUrl: customBgUrl,
      style: prefs.style,
      ratio: prefs.ratio,
      palette: activePalette,
      fontColor: prefs.fontColor,
      bgBlur: prefs.bgBlur,
      showWatermark: true,
      targetWidth: 1080,
    });
    return offscreen.toDataURL("image/png");
  };

  const handleCloseWindow = async () => {
    if (activeQrSessionRef.current) {
      activeQrSessionRef.current = null;
      await stopShelfTransfer().catch(() => {});
    }
    await getCurrentWindow().close();
  };

  const handleCloseQr = async () => {
    activeQrSessionRef.current = null;
    setQrSession(null);
    await stopShelfTransfer().catch(() => {});
  };

  const runExportAction = async (kind: "copy" | "save" | "qr") => {
    if (!payload || selectedLines.length === 0 || busyAction) return;
    setBusyAction(kind);
    setActionError(null);
    try {
      const dataUrl = await exportHighResDataUrl();
      const hint = buildCardExportFilename(payload.artist, payload.title);
      if (kind === "copy") {
        await copyLyricsCardPng(dataUrl, hint);
        setCopiedState(true);
        setTimeout(() => setCopiedState(false), 2000);
      } else if (kind === "save") {
        const path = await saveLyricsCardPng(dataUrl, hint);
        setSavedPath(path);
      } else {
        const session = await startLyricsCardQrShare(dataUrl, hint);
        activeQrSessionRef.current = session.token;
        setQrThumbUrl(dataUrl);
        setQrSession(session);
      }
    } catch (err) {
      setActionError(String(err));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="lyrics-share-window w-screen h-screen bg-[#0c0c10] text-zinc-100 flex flex-col select-none overflow-hidden relative border border-white/[0.08]">
      {/* Custom Title Bar */}
      <header
        data-tauri-drag-region
        className="h-11 px-3.5 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-[#101016]"
      >
        <div data-tauri-drag-region className="flex items-center gap-2.5 min-w-0">
          <img
            src="/logo/LOGO-GILI.png"
            alt="Gili"
            draggable={false}
            className="w-5 h-5 rounded-[5px] object-contain pointer-events-none"
          />
          <span data-tauri-drag-region className="text-[13px] font-semibold tracking-tight text-white">
            {tx(lang, "Share Lyrics Studio", "Studio Bagikan Lirik")}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={tx(lang, "Minimize", "Minimalkan")}
            onClick={() => getCurrentWindow().minimize()}
            className="w-8 h-7 rounded-[7px] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            aria-label={tx(lang, "Close", "Tutup")}
            onClick={handleCloseWindow}
            className="w-8 h-7 rounded-[7px] flex items-center justify-center text-zinc-400 hover:bg-[#e81123] hover:text-white transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      {!payload ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-400 p-6">
          <Music2 size={28} className="text-zinc-500" />
          <p className="text-[13px] font-medium text-zinc-200">
            {tx(
              lang,
              "Select lyrics from Gili Notch or Mini Player to start.",
              "Pilih lirik dari Notch Gili atau Mini Player untuk mulai."
            )}
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          {/* Left Preview Stage (also accepts image drop for custom background) */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingImage(true);
            }}
            onDragLeave={() => setIsDraggingImage(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingImage(false);
              const file = e.dataTransfer?.files?.[0];
              if (file) handleSelectCustomBgFile(file);
            }}
            className={`w-[46%] h-full bg-[#08080c] border-r p-6 flex items-center justify-center overflow-hidden min-h-0 relative transition-colors ${
              isDraggingImage ? "border-[#3882F6] bg-[#3882F6]/10" : "border-white/[0.07]"
            }`}
          >
            <canvas
              ref={previewCanvasRef}
              style={{
                aspectRatio:
                  prefs.ratio === "1:1" ? "1 / 1" : prefs.ratio === "9:16" ? "9 / 16" : "4 / 5",
              }}
              className="max-w-full max-h-full w-auto h-auto rounded-[14px] shadow-[0_18px_50px_rgba(0,0,0,0.65)] block"
            />
          </div>

          {/* Right Controls Column */}
          <div className="w-[54%] h-full p-5 flex flex-col gap-3 min-h-0">
            {/* Track Summary & Edit Lines Trigger */}
            <div className="flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-white truncate">
                  {payload.title || "Unknown Track"}
                </div>
                <div className="text-[12px] text-zinc-400 truncate">
                  {payload.artist || "Unknown Artist"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLinePicker((v) => !v)}
                className={`h-8 px-3 rounded-lg border text-[11.5px] font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${TRIGGER_FOCUS_RING} ${
                  showLinePicker
                    ? "bg-[#3882F6] border-[#3882F6] text-white"
                    : "bg-white/[0.06] hover:bg-white/[0.11] border-white/10 text-zinc-200"
                }`}
              >
                <ListChecks size={13} />
                <span>
                  {tx(
                    lang,
                    `Lines (${selectedIndices.length}/5)`,
                    `Baris (${selectedIndices.length}/5)`
                  )}
                </span>
              </button>
            </div>

            {showLinePicker ? (
              <LyricsLinePickerDrawer
                lines={payload.lines}
                selectedIndices={selectedIndices}
                onChangeSelection={setSelectedIndices}
                onClose={() => setShowLinePicker(false)}
              />
            ) : (
              <LyricsCardControls
                prefs={prefs}
                palettes={palettes}
                activePalette={activePalette}
                customBgUrl={customBgUrl}
                savedPath={savedPath}
                actionError={actionError}
                onUpdatePrefs={updatePrefs}
                onSelectCustomBgFile={handleSelectCustomBgFile}
                onClearCustomBg={() => setCustomBgUrl(null)}
              />
            )}

            {/* Primary Export Action Bar */}
            <div className="pt-2 border-t border-white/[0.08] grid grid-cols-3 gap-2 shrink-0">
              <button
                type="button"
                disabled={Boolean(busyAction) || selectedLines.length === 0}
                onClick={() => runExportAction("copy")}
                className={`h-9 px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/10 text-[12px] font-semibold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors ${TRIGGER_FOCUS_RING}`}
              >
                {copiedState ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>
                  {copiedState ? tx(lang, "Copied!", "Tersalin!") : "Copy PNG"}
                </span>
              </button>

              <button
                type="button"
                disabled={Boolean(busyAction) || selectedLines.length === 0}
                onClick={() => runExportAction("save")}
                className={`h-9 px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/10 text-[12px] font-semibold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors ${TRIGGER_FOCUS_RING}`}
              >
                <Download size={14} />
                <span>Save PNG</span>
              </button>

              <button
                type="button"
                disabled={Boolean(busyAction) || selectedLines.length === 0}
                onClick={() => runExportAction("qr")}
                className={`h-9 px-3 rounded-xl bg-[#3882F6] hover:bg-[#2563eb] text-[12px] font-semibold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors ${TRIGGER_FOCUS_RING}`}
              >
                <QrCode size={14} />
                <span>{tx(lang, "QR Phone", "QR ke HP")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {qrSession && (
        <LyricsShareQrOverlay
          session={qrSession}
          previewImageUrl={qrThumbUrl}
          onClose={handleCloseQr}
        />
      )}
    </div>
  );
};
