import React, { useState, useEffect, useRef } from "react";
import { Sun, CloudRain, RefreshCw } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

const WEATHER_KEY = "gili_weather_cache_v2";

interface WeatherData {
  city: string;
  temp: number;
  condition: string;
  humidity: number;
}

export const WeatherNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [weather, setWeather] = useState<WeatherData>(() => {
    try {
      const raw = localStorage.getItem(WEATHER_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      city: "Bandung",
      temp: 28,
      condition: "Cerah berawan",
      humidity: 72,
    };
  });
  const [cityInput, setCityInput] = useState(weather.city);
  const [loading, setLoading] = useState(false);

  const fetchWeather = async (targetCity = weather.city) => {
    setLoading(true);
    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          targetCity
        )}&count=1&language=id`
      );
      const geo = await geoRes.json();
      const loc = geo?.results?.[0];
      if (loc) {
        const wRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,weather_code`
        );
        const wData = await wRes.json();
        const t = Math.round(wData?.current?.temperature_2m ?? 28);
        const h = Math.round(wData?.current?.relative_humidity_2m ?? 70);
        const code = wData?.current?.weather_code ?? 1;
        const cond =
          code >= 51
            ? "Hujan ringan"
            : code >= 2
            ? "Cerah berawan"
            : "Cerah";
        const next: WeatherData = {
          city: loc.name || targetCity,
          temp: t,
          condition: cond,
          humidity: h,
        };
        setWeather(next);
        localStorage.setItem(WEATHER_KEY, JSON.stringify(next));
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchWeather();
  }, []);

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 flex-col justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Cuaca ${weather.city}: ${weather.temp}°C (${weather.condition})`}
      >
        {isCompact ? (
          <>
            <Sun size={13} className="text-[#facc15]" />
            <span className="text-[9.5px] font-bold text-white leading-none mt-0.5">
              {weather.temp}°
            </span>
          </>
        ) : (
          <>
            {weather.condition.toLowerCase().includes("hujan") ? (
              <CloudRain size={16} className="text-sky-400 shrink-0" />
            ) : (
              <Sun size={16} className="text-[#facc15] shrink-0" />
            )}
            <div className="flex flex-col leading-[1.15]">
              <span className="text-[11.5px] font-bold text-white">
                {weather.temp}°C · {weather.city}
              </span>
              <span className="text-[10px] text-zinc-400">
                {weather.condition}
              </span>
            </div>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Cuaca & Lokasi"
        moduleId="cuaca"
        currentView={view}
        config={config}
        width={255}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between p-2.5 rounded-[10px] bg-white/[0.04]">
            <div>
              <div className="text-[20px] font-bold text-white">
                {weather.temp}°C
              </div>
              <div className="text-[11px] text-zinc-300">
                {weather.city} · {weather.condition}
              </div>
              <div className="text-[10px] text-zinc-500">
                Kelembapan {weather.humidity}%
              </div>
            </div>
            <Sun size={26} className="text-[#facc15]" />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (cityInput.trim()) fetchWeather(cityInput.trim());
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder="Ganti kota..."
              className="flex-1 min-w-0 h-7 px-2 rounded-[7px] bg-white/[0.06] border border-white/[0.1] text-[11px] text-white outline-none"
            />
            <button
              type="submit"
              className="h-7 px-2.5 rounded-[7px] bg-[#3882F6] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
              <span>Simpan</span>
            </button>
          </form>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
