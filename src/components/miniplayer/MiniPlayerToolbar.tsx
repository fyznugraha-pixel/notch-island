import React, { useState } from "react";
import { RotateCw, Share2 } from "lucide-react";
import { MediaPayload, LyricsPayload, requestLyricsRefresh } from "../../services/mediaLyricsStore";
import { extractShareableLyricLines } from "../../services/lyricsShareService";
import { LyricsProviderId } from "../../services/lyrics/types";
import { useTaskbarLang, tx } from "../../services/taskbarI18n";
import { Tooltip } from "../ui/Tooltip";

export interface MiniPlayerToolbarProps {
  mode: "bar" | "card";
  onSetMode: (mode: "bar" | "card") => void;
  offset: number;
  onOffsetChange: (delta: number) => void;
  onResetOffset: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onReturnToNotch: () => void;
  onShareLyrics?: () => void;
  media: MediaPayload | null;
  lyrics: LyricsPayload | null;
}

const PROVIDERS: { id: LyricsProviderId; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "betterlyrics", label: "Better" },
  { id: "kugou", label: "KuGou" },
  { id: "netease", label: "NetEase" },
  { id: "lrclib", label: "LRCLIB" },
  { id: "qqmusic", label: "QQ" },
];

export const MiniPlayerToolbar: React.FC<MiniPlayerToolbarProps> = ({
  mode,
  onSetMode,
  offset,
  onOffsetChange,
  onResetOffset,
  isPinned,
  onTogglePin,
  onReturnToNotch,
  onShareLyrics,
  media,
  lyrics,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const canShare =
    Boolean(onShareLyrics) &&
    lyrics?.state !== "instrumental" &&
    extractShareableLyricLines(lyrics).some((l) => l.trim().length > 0);

  const [currentProvider, setCurrentProvider] = useState<LyricsProviderId>(() => {
    try {
      const saved = localStorage.getItem("notch_lyrics_provider");
      if (saved && (PROVIDERS.some((p) => p.id === saved) || saved === "genius")) {
        return saved as LyricsProviderId;
      }
      return "auto";
    } catch {
      return "auto";
    }
  });

  React.useEffect(() => {
    const handleSync = (e: Event) => {
      const next = (e as CustomEvent<LyricsProviderId>).detail;
      if (next) setCurrentProvider(next);
    };
    window.addEventListener("notch_lyrics_provider_changed", handleSync);
    return () => window.removeEventListener("notch_lyrics_provider_changed", handleSync);
  }, []);

  const handleCycleProvider = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const currIdx = PROVIDERS.findIndex((p) => p.id === currentProvider);
    const nextIdx = (currIdx + 1) % PROVIDERS.length;
    const nextProvider = PROVIDERS[nextIdx].id;
    setCurrentProvider(nextProvider);

    try {
      localStorage.setItem("notch_lyrics_provider", nextProvider);
      window.dispatchEvent(
        new CustomEvent("notch_lyrics_provider_changed", { detail: nextProvider })
      );
    } catch {}

    if (media?.title) {
      setIsRefreshing(true);
      await requestLyricsRefresh(media.artist || "", media.title, nextProvider);
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!media?.title) return;
    setIsRefreshing(true);
    await requestLyricsRefresh(media.artist || "", media.title, currentProvider);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const formattedOffset =
    offset === 0 ? "0.0s" : `${offset > 0 ? "+" : ""}${offset.toFixed(1)}s`;

  const providerLabel =
    PROVIDERS.find((p) => p.id === currentProvider)?.label || currentProvider;

  const lang = useTaskbarLang();

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-9 gap-2 select-none text-white w-full cursor-move"
    >
      {/* Left: Mode Segmented Switcher (Bar vs Card) */}
      <div data-no-drag onMouseDown={(e) => e.stopPropagation()} className="flex gap-0.5 p-0.5 rounded-[11px] bg-white/10 shrink-0">
        <Tooltip
          content={tx(lang, "Bar Mode (Compact)", "Mode Bar (Ringkas)")}
          allowFlip
          wrapperClassName="shrink-0"
        >
          <button
            type="button"
            onClick={() => onSetMode("bar")}
            className={`w-7 h-7 rounded-[9px] flex items-center justify-center transition-colors cursor-pointer ${
              mode === "bar" ? "bg-white/25 text-white" : "bg-transparent text-white/60 hover:text-white"
            }`}
            aria-label={tx(lang, "Bar mode", "Mode bar")}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="8" width="18" height="8" rx="3" />
              <path d="M8 12h8" />
            </svg>
          </button>
        </Tooltip>
        <Tooltip
          content={tx(lang, "Card Mode (5 Lyric Lines)", "Mode Kartu (5 Baris Lirik)")}
          allowFlip
          wrapperClassName="shrink-0"
        >
          <button
            type="button"
            onClick={() => onSetMode("card")}
            className={`w-7 h-7 rounded-[9px] flex items-center justify-center transition-colors cursor-pointer ${
              mode === "card" ? "bg-white/25 text-white" : "bg-transparent text-white/60 hover:text-white"
            }`}
            aria-label={tx(lang, "Card mode", "Mode kartu")}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="6" y="3" width="12" height="18" rx="3" />
              <path d="M9 9h6M9 13h6M9 17h3" />
            </svg>
          </button>
        </Tooltip>
      </div>

      {/* Right Controls: Provider, Refresh, Offset, Pin, Return to Notch */}
      <div data-no-drag onMouseDown={(e) => e.stopPropagation()} className="flex items-center gap-1.5 shrink-0">
        {/* Lyrics Provider Selector Pill */}
        <Tooltip
          content={tx(
            lang,
            `Active lyrics source: ${providerLabel}. Click to switch.`,
            `Sumber lirik aktif: ${providerLabel}. Klik untuk ganti.`
          )}
          allowFlip
          wrapperClassName="shrink-0"
        >
          <button
            type="button"
            onClick={handleCycleProvider}
            className="h-[26px] px-2 rounded-[13px] border border-white/15 bg-white/10 hover:bg-white/20 text-[11px] font-medium text-white/90 transition-colors flex items-center gap-1 cursor-pointer"
            aria-label={tx(lang, "Switch lyrics source", "Ganti sumber lirik")}
          >
            <span className="text-[10px] text-white/60">Src:</span>
            <span>{providerLabel}</span>
          </button>
        </Tooltip>

        {/* Refresh Lyrics Button */}
        <Tooltip
          content={tx(lang, "Reload lyrics", "Muat ulang lirik")}
          allowFlip
          wrapperClassName="shrink-0"
        >
          <button
            type="button"
            onClick={handleRefresh}
            className="w-7 h-7 rounded-[9px] flex items-center justify-center text-white/75 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
            aria-label={tx(lang, "Reload lyrics", "Muat ulang lirik")}
          >
            <RotateCw size={13} className={isRefreshing ? "animate-spin text-[#3B9DF8]" : ""} />
          </button>
        </Tooltip>

        {/* Offset Calibration: - 0.0s + */}
        <div className="flex items-center gap-2 h-[26px] px-2.5 rounded-[13px] border border-white/15 bg-white/5 text-[11px] font-mono text-white/90">
          <Tooltip
            content={tx(lang, "Delay 0.2s", "Mundurkan 0.2s")}
            allowFlip
            wrapperClassName="shrink-0"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOffsetChange(-0.2);
              }}
              className="text-white/60 hover:text-white text-[13px] font-bold leading-none p-0.5 cursor-pointer"
              aria-label={tx(lang, "Delay lyrics", "Mundurkan lirik")}
            >
              -
            </button>
          </Tooltip>
          <Tooltip
            content={tx(lang, "Click to reset offset to 0.0s", "Klik untuk reset offset ke 0.0s")}
            allowFlip
            wrapperClassName="shrink-0"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onResetOffset();
              }}
              className="hover:text-white cursor-pointer select-none"
              aria-label={tx(lang, "Reset lyric offset", "Reset offset lirik")}
            >
              {formattedOffset}
            </button>
          </Tooltip>
          <Tooltip
            content={tx(lang, "Advance 0.2s", "Majukan 0.2s")}
            allowFlip
            wrapperClassName="shrink-0"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOffsetChange(0.2);
              }}
              className="text-white/60 hover:text-white text-[13px] font-bold leading-none p-0.5 cursor-pointer"
              aria-label={tx(lang, "Advance lyrics", "Majukan lirik")}
            >
              +
            </button>
          </Tooltip>
        </div>

        {/* Action Icon Buttons */}
        <div className="flex items-center gap-0.5">
          {canShare && (
            <Tooltip
              content={tx(lang, "Share lyrics card", "Bagikan kartu lirik")}
              allowFlip
              wrapperClassName="shrink-0"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShareLyrics?.();
                }}
                className="w-7 h-7 rounded-[9px] flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                aria-label={tx(lang, "Share lyrics card", "Bagikan kartu lirik")}
              >
                <Share2 size={13} />
              </button>
            </Tooltip>
          )}

          {/* Pin Button */}
          <Tooltip
            content={
              isPinned
                ? tx(lang, "Unpin", "Lepas sematan")
                : tx(lang, "Pin on top", "Sematkan di atas")
            }
            allowFlip
            wrapperClassName="shrink-0"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin();
              }}
              className={`w-7 h-7 rounded-[9px] flex items-center justify-center transition-colors cursor-pointer ${
                isPinned
                  ? "bg-white/25 text-[#3B9DF8]"
                  : "text-white/70 hover:text-white hover:bg-white/15"
              }`}
              aria-label={
                isPinned
                  ? tx(lang, "Unpin", "Lepas sematan")
                  : tx(lang, "Pin on top", "Sematkan di atas")
              }
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 17v5M8 3h8l-1 6 3 3H6l3-3z" />
              </svg>
            </button>
          </Tooltip>

          {/* Return to Notch */}
          <Tooltip
            content={tx(lang, "Return to notch", "Kembali ke notch")}
            allowFlip
            wrapperClassName="shrink-0"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReturnToNotch();
              }}
              className="w-7 h-7 rounded-[9px] flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
              aria-label={tx(lang, "Return to notch", "Kembali ke notch")}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 4h16M12 20V8M8 12l4-4 4 4" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
