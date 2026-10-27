import React, { useEffect, useRef, useState } from "react";
import { Music, RotateCw, ChevronDown, Check } from "lucide-react";
import { LyricsData, LyricsProviderId, LYRICS_PROVIDERS_META } from "../../services/lyricsService";
import { t } from "../../services/i18n";

export interface LyricsViewProps {
  lyrics: LyricsData | null;
  isLoading: boolean;
  currentTime: number;
  isPlaying?: boolean;
  onSeek?: (time: number) => void;
  onRefreshLyrics?: () => void;
  songTitle?: string;
  artist?: string;
  currentProvider?: LyricsProviderId;
  onChangeProvider?: (providerId: LyricsProviderId) => void;
}

export const LyricsView = React.memo<LyricsViewProps>(({
  lyrics,
  isLoading,
  currentTime,
  isPlaying = false,
  onSeek,
  onRefreshLyrics,
  songTitle,
  artist,
  currentProvider = "auto",
  onChangeProvider,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const lastActiveIndexRef = useRef<number>(-1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isProviderDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsProviderDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProviderDropdownOpen]);

  // Sync offset calibration (default 0.0s)
  const [offset, setOffset] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("notch_lyrics_offset");
      return saved !== null ? parseFloat(saved) : 0.0;
    } catch {
      return 0.0;
    }
  });

  const handleOffsetChange = (delta: number) => {
    setOffset((prev) => {
      const next = Math.round((prev + delta) * 10) / 10;
      const clamped = Math.max(-5, Math.min(5, next));
      try {
        localStorage.setItem("notch_lyrics_offset", clamped.toString());
      } catch {}
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("notch_lyrics_offset_changed", { detail: clamped }));
      }
      return clamped;
    });
  };

  const handleResetOffset = () => {
    const defaultVal = 0.0;
    setOffset(defaultVal);
    try {
      localStorage.setItem("notch_lyrics_offset", defaultVal.toString());
    } catch {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("notch_lyrics_offset_changed", { detail: defaultVal }));
    }
  };

  // High-precision live time tracking
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const anchorRef = useRef<{ time: number; timestamp: number }>({
    time: currentTime,
    timestamp: performance.now(),
  });

  // Re-sync anchor when currentTime from SMTC updates or isPlaying toggles
  useEffect(() => {
    const now = performance.now();
    const estimatedTime = isPlaying
      ? anchorRef.current.time + (now - anchorRef.current.timestamp) / 1000
      : anchorRef.current.time;

    if (Math.abs(estimatedTime - currentTime) > 0.35 || !isPlaying) {
      anchorRef.current = { time: currentTime, timestamp: now };
    }
  }, [currentTime, isPlaying]);

  // Low-CPU 100ms live sync loop
  useEffect(() => {
    if (!lyrics?.synced || !lyrics.lines.length) {
      setActiveIndex(-1);
      return;
    }

    const tick = () => {
      const now = performance.now();
      const liveTime = isPlaying
        ? anchorRef.current.time + (now - anchorRef.current.timestamp) / 1000
        : anchorRef.current.time;
      const effectiveTime = liveTime + offset;

      const lines = lyrics.lines;
      const idx = lines.findIndex(
        (line, i) =>
          effectiveTime >= line.time &&
          (i === lines.length - 1 || effectiveTime < lines[i + 1].time)
      );

      setActiveIndex((prev) => (prev !== idx ? idx : prev));
    };

    tick();

    if (!isPlaying) return;
    const intervalId = window.setInterval(tick, 100);
    return () => window.clearInterval(intervalId);
  }, [lyrics, isPlaying, offset]);

  // Reset scroll when lyrics track changes
  useEffect(() => {
    lastActiveIndexRef.current = -1;
    setActiveIndex(-1);
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0 });
    }
  }, [lyrics]);

  // Auto-scroll when active line changes
  useEffect(() => {
    if (activeIndex !== -1 && activeIndex !== lastActiveIndexRef.current) {
      lastActiveIndexRef.current = activeIndex;
      if (containerRef.current && activeLineRef.current) {
        const container = containerRef.current;
        const line = activeLineRef.current;
        const containerRect = container.getBoundingClientRect();
        const lineRect = line.getBoundingClientRect();
        const targetScrollTop =
          container.scrollTop +
          (lineRect.top - containerRect.top) -
          containerRect.height / 2 +
          lineRect.height / 2;

        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth",
        });
      }
    }
  }, [activeIndex]);

  const handleRefreshClick = () => {
    setIsRefreshing(true);
    anchorRef.current = { time: currentTime, timestamp: performance.now() };
    onRefreshLyrics?.();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const cleanProviderName = lyrics?.providerName
    ? lyrics.providerName.replace(/ (?:Cloud )?Music$/i, "")
    : "";
  const activeProviderMeta = LYRICS_PROVIDERS_META.find((p) => p.id === currentProvider);
  const activeProviderBadge = currentProvider === "auto"
    ? cleanProviderName
      ? `Auto: ${cleanProviderName}`
      : "Auto"
    : activeProviderMeta?.badge || "Library";

  return (
    <div className="relative w-full h-full flex flex-col select-none overflow-hidden">
      <div className="flex items-center justify-between py-1.5 pl-2 pr-3.5 shrink-0 z-30 min-w-0 gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          <span className="text-[10.5px] font-bold text-white/80 uppercase tracking-wider leading-normal truncate">
            {t("lyrics_title")}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {lyrics?.synced && (
            <div className="flex items-center gap-0.5 bg-white/[0.06] hover:bg-white/[0.09] border border-white/10 rounded-full px-1.5 py-0.5 text-[9.5px] text-white/70 transition-colors shrink-0">
              <button
                type="button"
                onClick={() => handleOffsetChange(-0.2)}
                title={t("lyrics_advance")}
                className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-white/15 text-white/60 hover:text-white transition-colors font-mono font-bold leading-none cursor-pointer"
              >
                -
              </button>
              <button
                type="button"
                onClick={handleResetOffset}
                title={t("lyrics_reset_offset")}
                className="px-0.5 font-mono text-[9px] font-medium text-white/80 hover:text-blue-300 transition-colors cursor-pointer"
              >
                {offset === 0 ? "0.0s" : `${offset > 0 ? "+" : ""}${offset.toFixed(1)}s`}
              </button>
              <button
                type="button"
                onClick={() => handleOffsetChange(0.2)}
                title={t("lyrics_delay")}
                className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-white/15 text-white/60 hover:text-white transition-colors font-mono font-bold leading-none cursor-pointer"
              >
                +
              </button>
            </div>
          )}

          {/* Lyrics Provider Selector Dropdown (to the left of refresh button) */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsProviderDropdownOpen((prev) => !prev)}
              title="Ganti library lirik"
              className="h-6 flex items-center gap-1 bg-white/[0.06] hover:bg-white/[0.12] active:bg-white/[0.16] border border-white/10 rounded-full px-2 text-[10px] text-white/75 hover:text-white transition-all cursor-pointer font-medium select-none shrink-0"
            >
              <span className="truncate max-w-[70px]">{activeProviderBadge}</span>
              <ChevronDown
                size={10}
                className={`text-white/50 transition-transform duration-200 shrink-0 ${
                  isProviderDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isProviderDropdownOpen && (
              <div
                data-scrollable="true"
                onWheel={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-40 max-w-[170px] max-h-[124px] overflow-y-auto lyrics-dropdown-scroll bg-neutral-900/98 backdrop-blur-2xl border border-white/15 rounded-xl shadow-none p-1 z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150"
              >
                {LYRICS_PROVIDERS_META.map((provider) => {
                  const isSelected = currentProvider === provider.id;
                  const isDeliveredByThis = lyrics?.provider === provider.id;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => {
                        setIsProviderDropdownOpen(false);
                        onChangeProvider?.(provider.id);
                      }}
                      className={`w-full h-[26px] flex items-center justify-between gap-1.5 px-2 rounded-lg text-left text-[10.5px] transition-colors cursor-pointer select-none shrink-0 ${
                        isSelected
                          ? "text-white font-medium hover:bg-white/[0.06]"
                          : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {isDeliveredByThis ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Aktif saat ini" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-transparent shrink-0" />
                        )}
                        <span className="truncate leading-tight font-medium">
                          {provider.name}
                        </span>
                      </div>
                      {isSelected && (
                        <Check size={11} className="text-blue-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleRefreshClick}
            title={t("lyrics_refresh") || "Refresh Lyrics"}
            className="w-6 h-6 flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 rounded-full text-white/75 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <RotateCw
              size={11}
              className={`transition-transform duration-500 ${isRefreshing || isLoading ? "animate-spin text-blue-300" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Main Content Area with CSS Mask */}
      <div
        ref={containerRef}
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0%, black 14%, black 72%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 14%, black 72%, transparent 100%)",
        }}
        className="flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-2 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden relative z-10 touch-pan-y"
      >
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-white/40 py-8">
            <div className="w-5 h-5 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
            <span className="text-xs font-medium tracking-tight">{t("lyrics_searching")}</span>
          </div>
        ) : lyrics?.instrumental ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-white/50 text-center px-4 py-8">
            <Music size={22} className="text-blue-400/80 animate-pulse" />
            <span className="text-xs font-semibold text-white/80">{t("lyrics_instrumental")}</span>
            <span className="text-[11px] text-white/40">{t("lyrics_instrumental_sub")}</span>
          </div>
        ) : !lyrics || (!lyrics.lines.length && !lyrics.plainLyrics) ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-white/40 text-center px-3 py-6">
            <span className="text-xs font-medium text-white/70">{t("lyrics_not_found")}</span>
            <span className="text-[11px] text-white/35 truncate max-w-[200px]">
              {songTitle || artist || "..."}
            </span>
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2 max-w-[220px]">
              <span className="text-[9.5px] text-white/40 w-full mb-0.5">Cari di library lain:</span>
              {LYRICS_PROVIDERS_META.filter((p) => p.id !== currentProvider).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChangeProvider?.(p.id)}
                  className="px-2 py-0.5 rounded-full bg-white/[0.07] hover:bg-white/[0.14] active:bg-white/[0.2] text-[10px] text-white/80 border border-white/10 transition-colors cursor-pointer select-none"
                >
                  {p.badge}
                </button>
              ))}
            </div>
          </div>
        ) : lyrics.synced ? (
          <div className="flex flex-col space-y-3 py-6">
            {lyrics.lines.map((line, index) => {
              const isActive = index === activeIndex;
              return (
                <div
                  key={`${index}-${line.time}`}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => {
                    onSeek?.(line.time);
                    anchorRef.current = { time: line.time, timestamp: performance.now() };
                    setActiveIndex(index);
                  }}
                  className={`cursor-pointer transition-all duration-300 transform origin-left rounded px-1 py-0.5 select-none ${
                    isActive
                      ? "text-white font-bold text-[14.5px] leading-snug scale-[1.02]"
                      : "text-white/30 font-medium text-[12.5px] leading-snug hover:text-white/70 hover:scale-[1.01]"
                  }`}
                  style={isActive ? { textShadow: "0 0 16px rgba(255,255,255,0.4)" } : undefined}
                >
                  {line.text || "•••"}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col space-y-2 py-4">
            {lyrics.lines.map((line, index) => (
              <p
                key={index}
                className="text-[12.5px] font-medium leading-relaxed text-white/60 hover:text-white/80 transition-colors"
              >
                {line.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
