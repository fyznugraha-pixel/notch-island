import React, { useState, useEffect, useRef } from "react";
import { Sun, CloudRain, RefreshCw } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import {
  WeatherInfo,
  fetchLiveWeather,
} from "../../services/ambientEnvironmentService";
import {
  getSavedCustomCity,
  saveCustomCity,
  subscribeWeatherChange,
} from "../../services/weatherService";
import { useCityModulePolling } from "../../hooks/useCityModulePolling";
import { Tooltip } from "../../components/ui/Tooltip";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import type { Language } from "../../services/i18n";

const WEATHER_KEY = "gili_weather_cache_v3";

function localizeWeatherCondition(
  raw: string | undefined,
  lang: Language
): string {
  if (!raw) return tx(lang, "Loading weather...", "Memuat cuaca...");
  if (lang === "id") return raw;
  const map: Record<string, string> = {
    "Hujan petir": "Thunderstorm",
    "Hujan lebat": "Heavy rain",
    Hujan: "Rain",
    Gerimis: "Drizzle",
    Berkabut: "Foggy",
    Berawan: "Cloudy",
    Cerah: "Clear",
  };
  return map[raw] ?? raw;
}

export const WeatherNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const [weather, setWeather] = useState<WeatherInfo | null>(() => {
    try {
      const raw = localStorage.getItem(WEATHER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.city && typeof parsed.temp === "number") return parsed;
      }
    } catch {}
    return null;
  });
  const initialCity = weather?.city || getSavedCustomCity()?.name || "Bandung";
  const [cityInput, setCityInput] = useState(initialCity);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { runFetch: loadWeather, setActiveCity } = useCityModulePolling({
    initialCity,
    fetcher: fetchLiveWeather,
    onLoadingChange: setLoading,
    onErrorClear: () => setErrorMsg(null),
    onSuccess: (next, _city, isManual) => {
      setActiveCity(next.city);
      setWeather(next);
      setCityInput(next.city);
      localStorage.setItem(WEATHER_KEY, JSON.stringify(next));
      if (
        isManual &&
        typeof next.latitude === "number" &&
        typeof next.longitude === "number"
      ) {
        saveCustomCity({
          name: next.city,
          latitude: next.latitude,
          longitude: next.longitude,
          source: "custom",
        });
      }
    },
    onNotFound: () => {
      setErrorMsg(tx(lang, "City not found.", "Kota tidak ditemukan."));
    },
    onNetworkError: () => {
      setErrorMsg(
        tx(lang, "Failed to load weather data.", "Gagal mengambil data cuaca.")
      );
    },
  });

  useEffect(() => {
    return subscribeWeatherChange(() => {
      const saved = getSavedCustomCity();
      if (saved?.name) {
        setActiveCity(saved.name);
        loadWeather(saved.name, false);
      }
    });
  }, [loadWeather, setActiveCity]);

  const displayCity = weather?.city || cityInput || "Bandung";
  const tempLabel = weather ? `${weather.temp}°` : "--°";
  const condLabel = localizeWeatherCondition(weather?.condition, lang);
  const isRain = Boolean(weather?.isRain);
  const handleToggle = () => setIsOpen((v) => !v);
  const sunClass = isLight ? "text-amber-600" : "text-[#facc15]";
  const rainClass = isLight ? "text-sky-600" : "text-sky-400";

  return (
    <>
      <Tooltip
        content={tx(
          lang,
          `Weather ${displayCity}: ${tempLabel}C (${condLabel})`,
          `Cuaca ${displayCity}: ${tempLabel}C (${condLabel})`
        )}
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
            tx(
              lang,
              `Weather ${displayCity}: ${tempLabel} ${condLabel}`,
              `Cuaca ${displayCity}: ${tempLabel} ${condLabel}`
            ),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} flex-col justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "gili-mod-pill px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          {isCompact ? (
            <>
              {isRain ? (
                <CloudRain size={13} className={rainClass} />
              ) : (
                <Sun size={13} className={sunClass} />
              )}
              <span className="text-[9.5px] font-bold text-white leading-none mt-0.5 tabular-nums">
                {tempLabel}
              </span>
            </>
          ) : (
            <>
              {isRain ? (
                <CloudRain size={16} className={`${rainClass} shrink-0`} />
              ) : (
                <Sun size={16} className={`${sunClass} shrink-0`} />
              )}
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[140px]">
                <span className="text-[11.5px] font-bold text-white tabular-nums truncate">
                  {tempLabel}C · {displayCity}
                </span>
                <span className="text-[10px] text-zinc-400 truncate">{condLabel}</span>
              </div>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Weather & Location", "Cuaca & Lokasi")}
        moduleId="cuaca"
        currentView={view}
        config={config}
        width={268}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-[10px] bg-white/[0.04] min-w-0">
            <div className="min-w-0 flex-1">
              <div className="text-[20px] font-bold text-white tabular-nums">
                {tempLabel}C
              </div>
              <div className="text-[11px] text-zinc-200 break-words">
                {displayCity} · {condLabel}
              </div>
              <div className="text-[10px] text-zinc-400">
                {tx(lang, "Humidity", "Kelembapan")}{" "}
                {weather ? `${weather.humidity}%` : "--"}
              </div>
            </div>
            {isRain ? (
              <CloudRain size={26} className={`${rainClass} shrink-0`} />
            ) : (
              <Sun size={26} className={`${sunClass} shrink-0`} />
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (cityInput.trim()) loadWeather(cityInput.trim(), true);
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder={tx(lang, "Change city...", "Ganti kota...")}
              className={`flex-1 min-w-0 h-7 px-2 rounded-[7px] bg-white/[0.06] border border-white/[0.12] text-[11px] text-white placeholder-zinc-400 ${TRIGGER_FOCUS_RING}`}
            />
            <button
              type="submit"
              className={`h-7 px-2.5 shrink-0 rounded-[7px] bg-[#3882F6] text-[#ffffff] text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
              <span>{tx(lang, "Save", "Simpan")}</span>
            </button>
          </form>
          {errorMsg && (
            <div
              className={`text-[10.5px] ${
                isLight ? "text-rose-700" : "text-rose-400"
              }`}
            >
              {errorMsg}
            </div>
          )}
        </div>
      </NavbarPopoverShell>
    </>
  );
};
