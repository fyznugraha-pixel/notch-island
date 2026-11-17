import React, { useState, useEffect, useRef } from "react";
import { Wind, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MediaPayload } from "../../types";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import {
  AirQualityInfo,
  fetchLiveAirQuality,
} from "../../services/ambientEnvironmentService";
import { Tooltip } from "../../components/ui/Tooltip";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { getLocalDateKey } from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";

export { AmbientSoundNavbarModule } from "./AmbientSoundNavbarModule";

// 32. Visualizer
export const VisualizerNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
  isHidden = false,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bars, setBars] = useState<number[]>([
    4, 6, 8, 5, 7, 4, 6, 5, 8, 6, 4, 7, 4,
  ]);

  useEffect(() => {
    invoke<MediaPayload | null>("get_current_media_state")
      .then((initial) => {
        if (initial) setIsPlaying(Boolean(initial.is_playing));
      })
      .catch(() => {});

    const unlisten = listen<MediaPayload>("media-update", (ev) => {
      if (typeof ev.payload?.is_playing === "boolean") {
        setIsPlaying(ev.payload.is_playing);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!isPlaying || isHidden) {
      if (!isPlaying && !isHidden) {
        setBars([4, 6, 8, 5, 7, 4, 6, 5, 8, 6, 4, 7, 4]);
      }
      return;
    }
    const id = setInterval(() => {
      setBars((prev) => prev.map(() => Math.floor(6 + Math.random() * 17)));
    }, 160);
    return () => clearInterval(id);
  }, [isPlaying, isHidden]);

  const colors = ["#ec4899", "#a855f7", "#6366f1", "#3882F6"];
  const handleToggle = () => setIsOpen((v) => !v);

  const visualizerLabel = `${tx(lang, "Music Visualizer", "Visualizer Musik")} (${
    isPlaying ? tx(lang, "Playing", "Sedang aktif berputar") : tx(lang, "Paused", "Jeda")
  })`;

  return (
    <>
      <Tooltip
        content={visualizerLabel}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            `${tx(lang, "Music Visualizer", "Visualizer Musik")} (${
              isPlaying ? tx(lang, "Active", "Aktif") : tx(lang, "Paused", "Jeda")
            })`,
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "gili-mod-pill px-3.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <div className="flex items-center gap-[2.5px] h-[min(22px,calc(var(--navbar-mod-size,40px)-8px))] overflow-hidden">
            {(isCompact ? bars.slice(0, 5) : bars).map((h, i) => (
              <i
                key={i}
                style={{
                  height: `${h}px`,
                  background: colors[i % colors.length],
                }}
                className="w-[3px] rounded-[1.5px] transition-all duration-150"
              />
            ))}
          </div>
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Music Spectrum Visualizer", "Visualizer Spektrum Musik")}
        moduleId="visualizer"
        currentView={view}
        config={config}
        width={256}
      >
        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-zinc-300 leading-snug">
            {tx(
              lang,
              "The spectrum pulses automatically while music is playing on Windows.",
              "Spektrum berdenyut otomatis saat musik di Windows sedang diputar."
            )}
          </div>
          <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isPlaying ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
              }`}
            />
            <span>
              {isPlaying
                ? tx(lang, "Music Playing", "Musik Aktif Berputar")
                : tx(lang, "Music Paused", "Musik Sedang Jeda")}
            </span>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 38. Kualitas udara
const AQI_CACHE_KEY = "gili_aqi_cache_v2";

export const AirQualityNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [aq, setAq] = useState<AirQualityInfo | null>(() => {
    try {
      const raw = localStorage.getItem(AQI_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.city && typeof parsed.aqi === "number") return parsed;
      }
    } catch {}
    return null;
  });
  const [cityInput, setCityInput] = useState(aq?.city || "Bandung");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshAqi = async (targetCity: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const live = await fetchLiveAirQuality(targetCity);
      if (live) {
        setAq(live);
        setCityInput(live.city);
        localStorage.setItem(AQI_CACHE_KEY, JSON.stringify(live));
      } else {
        setErrorMsg(
          tx(
            lang,
            "City not found or failed to load AQI.",
            "Kota tidak ditemukan / gagal memuat AQI."
          )
        );
      }
    } catch {
      setErrorMsg(
        tx(lang, "Connection failed while loading AQI.", "Koneksi gagal saat memuat AQI.")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAqi(aq?.city || "Bandung");
    const id = setInterval(() => refreshAqi(aq?.city || "Bandung"), 30 * 60000);
    return () => clearInterval(id);
  }, []);

  const aqiVal = aq?.aqi;
  const status =
    aqiVal === undefined
      ? {
          label: tx(lang, "Loading", "Memuat"),
          badgeBg: "#64748b",
          badgeText: "#ffffff",
        }
      : aqiVal <= 50
      ? { label: tx(lang, "Good", "Baik"), badgeBg: "#22c55e", badgeText: "#052e16" }
      : aqiVal <= 100
      ? {
          label: tx(lang, "Moderate", "Sedang"),
          badgeBg: "#f59e0b",
          badgeText: "#1f1200",
        }
      : {
          label: tx(lang, "Unhealthy", "Tidak Sehat"),
          badgeBg: "#ef4444",
          badgeText: "#ffffff",
        };

  const displayCity = aq?.city || cityInput || "Bandung";
  const aqiLabel = aqiVal !== undefined ? `${aqiVal}` : "--";
  const handleToggle = () => setIsOpen((v) => !v);
  const aqiTooltip = `${tx(lang, "Air Quality", "Kualitas Udara")} (${displayCity}): AQI ${aqiLabel} · ${status.label}`;

  return (
    <>
      <Tooltip
        content={aqiTooltip}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            `${tx(lang, "Air Quality", "Kualitas Udara")} (${displayCity}): AQI ${aqiLabel}`,
            isOpen
          )}
          className={`relative flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `relative gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "gili-mod-pill px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <Wind size={15} className="text-[#4ade80] shrink-0" />
          {isCompact ? (
            <span
              style={{ backgroundColor: status.badgeBg, color: status.badgeText }}
              className="gili-mod-badge absolute top-[1px] right-[1px] px-1 h-[14px] rounded-full text-[8.5px] font-bold flex items-center justify-center tabular-nums pointer-events-none"
            >
              {aqiLabel}
            </span>
          ) : (
            <div className="flex flex-col leading-[1.15] min-w-0 max-w-[140px]">
              <span className="text-[11.5px] font-bold text-white tabular-nums truncate">
                AQI {aqiLabel} · {status.label}
              </span>
              <span className="text-[10px] text-zinc-400 truncate">
                {aq ? `PM2.5 ${aq.pm25} · ` : ""}
                {displayCity}
              </span>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Air Quality Index (AQI)", "Indeks Kualitas Udara (AQI)")}
        moduleId="kualitas_udara"
        currentView={view}
        config={config}
        width={272}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2">
          <div className="p-2.5 rounded-[9px] bg-white/[0.04] min-w-0">
            <div className="flex items-baseline justify-between gap-2 flex-wrap min-w-0">
              <span
                className={`text-[17px] font-bold tabular-nums ${
                  isLight ? "text-emerald-700" : "text-emerald-400"
                }`}
              >
                AQI {aqiLabel}
              </span>
              <span className="text-[11px] font-semibold text-zinc-200 truncate">
                {status.label}
              </span>
            </div>
            <div className="text-[10.5px] text-zinc-300 mt-0.5 break-words">
              {aq
                ? `PM2.5 ${aq.pm25} µg/m³ · PM10 ${aq.pm10} µg/m³`
                : tx(
                    lang,
                    "Fetching Open-Meteo sensor data...",
                    "Mengambil data sensor Open-Meteo..."
                  )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {["Bandung", "Jakarta", "Yogyakarta"].map((city) => {
              const isSelected = displayCity.toLowerCase() === city.toLowerCase();
              return (
                <button
                  key={city}
                  type="button"
                  onClick={() => refreshAqi(city)}
                  className={`min-w-0 px-1 py-1 rounded-[7px] text-[10.5px] font-semibold truncate cursor-pointer ${TRIGGER_FOCUS_RING} ${
                    isSelected
                      ? isLight
                        ? "bg-emerald-600 text-[#ffffff] border border-emerald-600"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-white/[0.04] text-zinc-300 hover:text-white"
                  }`}
                >
                  {city}
                </button>
              );
            })}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (cityInput.trim()) refreshAqi(cityInput.trim());
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder={tx(lang, "Search another city...", "Cari kota lain...")}
              className={`flex-1 min-w-0 h-7 px-2 rounded-[7px] bg-white/[0.06] border border-white/[0.12] text-[11px] text-white placeholder-zinc-400 ${TRIGGER_FOCUS_RING}`}
            />
            <Tooltip
              content={tx(lang, "Refresh AQI", "Perbarui AQI")}
              side="top"
              isLightMode={isLight}
            >
              <button
                type="submit"
                className={`h-7 px-2 shrink-0 rounded-[7px] bg-[#3882F6] text-[#ffffff] text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING}`}
              >
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
              </button>
            </Tooltip>
          </form>

          {errorMsg && (
            <div className="text-[10.5px] text-rose-400 break-words">{errorMsg}</div>
          )}
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 39. Check-in mood
const MOODS = [
  { id: 0, en: "Heavy", idLabel: "Berat", color: "#ef4444" },
  { id: 1, en: "Low", idLabel: "Kurang", color: "#f97316" },
  { id: 2, en: "Okay", idLabel: "Biasa", color: "#eab308" },
  { id: 3, en: "Good", idLabel: "Baik", color: "#22c55e" },
  { id: 4, en: "Great", idLabel: "Hebat", color: "#3882F6" },
];

const MOOD_STORAGE_KEY = "gili_mood_daily_v2";

export const MoodCheckinNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const [selectedMood, setSelectedMood] = useState<number | null>(() => {
    try {
      const today = getLocalDateKey();
      const raw = localStorage.getItem(MOOD_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.date === today && typeof parsed.mood === "number") {
          return parsed.mood;
        }
      }
    } catch {}
    return null;
  });

  const selectMood = (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedMood(id);
    try {
      localStorage.setItem(
        MOOD_STORAGE_KEY,
        JSON.stringify({ date: getLocalDateKey(), mood: id })
      );
    } catch {}
  };

  const activeMood =
    selectedMood !== null ? MOODS[selectedMood] || MOODS[3] : null;
  const activeMoodLabel = activeMood ? tx(lang, activeMood.en, activeMood.idLabel) : null;
  const handleToggle = () => setIsOpen((v) => !v);
  const moodTooltip = `${tx(lang, "Today's Mood", "Mood Hari Ini")}: ${
    activeMoodLabel || tx(lang, "Not checked in", "Belum check-in")
  }`;

  return (
    <>
      <Tooltip
        content={moodTooltip}
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
            `${tx(lang, "Today's Mood", "Mood Hari Ini")}: ${
              activeMoodLabel || tx(lang, "Not filled", "Belum diisi")
            }`,
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "gili-mod-pill px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          {isCompact ? (
            <span
              className="w-4 h-4 rounded-full shadow border border-white/25"
              style={{ backgroundColor: activeMood?.color || "#52525b" }}
            />
          ) : (
            <>
              <span className="text-[11px] font-medium text-zinc-200 max-w-[72px] truncate">
                {activeMoodLabel || tx(lang, "Mood?", "Mood?")}
              </span>
              <div
                className="flex items-center gap-1.5"
                onMouseEnter={() => setSuppressOuterTip(true)}
                onMouseLeave={() => setSuppressOuterTip(false)}
              >
                {MOODS.map((m) => {
                  const moodLabel = tx(lang, m.en, m.idLabel);
                  return (
                    <Tooltip
                      key={m.id}
                      content={moodLabel}
                      side={tooltipSide}
                      isLightMode={isLight}
                    >
                      <button
                        type="button"
                        onClick={(e) => selectMood(m.id, e)}
                        style={{ backgroundColor: m.color }}
                        aria-label={moodLabel}
                        className={`w-[10px] h-[10px] rounded-full transition-all cursor-pointer ${TRIGGER_FOCUS_RING} ${
                          selectedMood === m.id
                            ? isLight
                              ? "ring-2 ring-zinc-900 scale-110 opacity-100"
                              : "ring-2 ring-white scale-110 opacity-100"
                            : "opacity-55 hover:opacity-100"
                        }`}
                      />
                    </Tooltip>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Daily Mood Check-in", "Check-in Mood Harian")}
        moduleId="check_in_mood"
        currentView={view}
        config={config}
        width={276}
      >
        <div className="flex flex-col gap-2.5">
          <div className="text-[11px] text-zinc-300">
            {tx(lang, "How are you feeling today?", "Bagaimana perasaanmu hari ini?")}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {MOODS.map((m) => {
              const moodLabel = tx(lang, m.en, m.idLabel);
              const isSelected = selectedMood === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectMood(m.id)}
                  className={`min-w-0 overflow-hidden flex flex-col items-center gap-1 px-0.5 py-2 rounded-[8px] border transition-all cursor-pointer ${TRIGGER_FOCUS_RING} ${
                    isSelected
                      ? isLight
                        ? "bg-black/[0.08] border-black/30 text-zinc-900 font-bold"
                        : "bg-white/[0.12] border-white/40 text-white font-bold"
                      : "bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:text-white"
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: m.color }}
                  />
                  <span className="text-[9.5px] truncate max-w-full">{moodLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
