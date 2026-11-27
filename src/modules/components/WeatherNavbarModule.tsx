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
import { useTemperatureUnit } from "../../hooks/useTemperatureUnit";
import { TemperatureUnit, formatTemperature } from "../../utils/temperatureUnit";

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
  const [tempUnit, setTempUnit] = useTemperatureUnit();
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
  const compactTempLabel = weather
    ? formatTemperature(weather.temp, tempUnit, { showUnit: false })
    : "--°";
  const fullTempLabel = weather
    ? formatTemperature(weather.temp, tempUnit, { showUnit: true })
    : "--°";
  const condLabel = localizeWeatherCondition(weather?.condition, lang);
  const isRain = Boolean(weather?.isRain);
  const handleToggle = () => setIsOpen((v) => !v);
  const handleSelectUnit = (nextUnit: TemperatureUnit) => {
    setTempUnit(nextUnit);
    import("../../services/desktopWidgetsService")
      .then((m) => m.syncFrontendWidgetMirror())
      .catch(() => {});
  };
  const sunClass = isLight ? "text-amber-600" : "text-[#facc15]";
  const rainClass = isLight ? "text-sky-600" : "text-sky-400";

  return (
    <>
      <Tooltip
        content={tx(
          lang,
          `Weather ${displayCity}: ${fullTempLabel} (${condLabel})`,
          `Cuaca ${displayCity}: ${fullTempLabel} (${condLabel})`
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
              `Weather ${displayCity}: ${fullTempLabel} ${condLabel}`,
              `Cuaca ${displayCity}: ${fullTempLabel} ${condLabel}`
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
                {compactTempLabel}
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
                  {fullTempLabel} · {displayCity}
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
                {fullTempLabel}
              </div>
              <div className="text-[11px] text-zinc-200 break-words">
                {displayCity} · {condLabel}
              </div>
              <div className="text-[10px] text-zinc-400">
                {tx(lang, "Humidity", "Kelembapan")}{" "}
                {weather ? `${weather.humidity}%` : "--"}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {isRain ? (
                <CloudRain size={26} className={`${rainClass} shrink-0`} />
              ) : (
                <Sun size={26} className={`${sunClass} shrink-0`} />
              )}
              <div
                className={`inline-flex rounded-[7px] p-0.5 border ${
                  isLight
                    ? "bg-black/[0.06] border-black/[0.10]"
                    : "bg-white/[0.06] border-white/[0.08]"
                }`}
                role="group"
                aria-label={tx(lang, "Temperature unit", "Satuan suhu")}
              >
                {(["celsius", "fahrenheit"] as const).map((u) => {
                  const active = tempUnit === u;
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => handleSelectUnit(u)}
                      className={`px-1.5 py-0.5 rounded-[5px] text-[10px] font-semibold cursor-pointer transition-colors ${TRIGGER_FOCUS_RING} ${
                        active
                          ? "bg-[#3882F6] text-white"
                          : isLight
                            ? "text-zinc-600 hover:text-zinc-900"
                            : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {u === "celsius" ? "°C" : "°F"}
                    </button>
                  );
                })}
              </div>
            </div>
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
