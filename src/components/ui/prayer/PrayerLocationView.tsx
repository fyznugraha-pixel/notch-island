import React from "react";
import { MapPin, Search } from "lucide-react";
import { INDONESIAN_PRESET_CITIES } from "../../../services/prayerService";
import { GeocodingCity, WeatherLocation } from "../../../services/weatherService";
import { Language } from "../../../services/i18n";
import { PRAYER_ACCENT } from "./PrayerIcons";

interface PrayerLocationViewProps {
  currentLocationName: string;
  cityQuery: string;
  onChangeCityQuery: (q: string) => void;
  searchResults: GeocodingCity[];
  isSearching: boolean;
  optLanguage: Language;
  isLightMode: boolean;
  onSelectCity: (loc: WeatherLocation) => void;
}

export const PrayerLocationView: React.FC<PrayerLocationViewProps> = ({
  currentLocationName,
  cityQuery,
  onChangeCityQuery,
  searchResults,
  isSearching,
  optLanguage,
  isLightMode,
  onSelectCity,
}) => {
  const isId = optLanguage === "id";

  return (
    <div className="flex flex-col gap-2 mt-2 flex-1 min-h-0 overflow-hidden">
      {/* Search Input */}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-[14px] border shrink-0 ${
          isLightMode
            ? "bg-black/[0.04] border-black/10 focus-within:border-[#30D158]"
            : "bg-white/[0.06] border-white/10 focus-within:border-[#30D158]"
        }`}
      >
        <Search size={13.5} className={isLightMode ? "text-neutral-400" : "text-zinc-400"} />
        <input
          type="text"
          value={cityQuery}
          onChange={(e) => onChangeCityQuery(e.target.value)}
          placeholder={
            isId
              ? "Cari nama kota (mis. Bekasi, Solo, Padang)..."
              : "Search city name..."
          }
          className={`w-full bg-transparent text-[12px] outline-none ${
            isLightMode
              ? "text-neutral-900 placeholder-neutral-400"
              : "text-white placeholder-zinc-500"
          }`}
        />
      </div>

      {/* Results or Preset Indonesian Cities */}
      <div
        data-scrollable="true"
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar"
      >
        {cityQuery.trim().length >= 2 ? (
          <div className="flex flex-col gap-1">
            {isSearching ? (
              <div
                className={`text-[11.5px] py-6 text-center ${
                  isLightMode ? "text-neutral-500" : "text-zinc-400"
                }`}
              >
                {isId ? "Mencari kota..." : "Searching cities..."}
              </div>
            ) : searchResults.length === 0 ? (
              <div
                className={`text-[11.5px] py-6 text-center ${
                  isLightMode ? "text-neutral-500" : "text-zinc-400"
                }`}
              >
                {isId ? "Kota tidak ditemukan" : "No cities found"}
              </div>
            ) : (
              searchResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    onSelectCity({
                      name: c.name,
                      admin1: c.admin1,
                      country: c.country,
                      latitude: c.latitude,
                      longitude: c.longitude,
                      source: "custom",
                    })
                  }
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-[12px] text-left transition-colors cursor-pointer ${
                    isLightMode ? "hover:bg-black/[0.06]" : "hover:bg-white/[0.08]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin size={13} style={{ color: PRAYER_ACCENT }} className="shrink-0" />
                    <span
                      className={`text-[12.5px] font-semibold truncate ${
                        isLightMode ? "text-neutral-900" : "text-white"
                      }`}
                    >
                      {c.name}
                    </span>
                    <span
                      className={`text-[11px] truncate ${
                        isLightMode ? "text-neutral-500" : "text-zinc-400"
                      }`}
                    >
                      {[c.admin1, c.country].filter(Boolean).join(", ")}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-1.5 pt-0.5">
            {INDONESIAN_PRESET_CITIES.map((city) => {
              const isSelected =
                currentLocationName.toLowerCase() === city.name.toLowerCase();
              return (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => onSelectCity(city)}
                  style={
                    isSelected
                      ? {
                          background: "linear-gradient(180deg, #3BE07A, #22C55E)",
                          color: "#04210F",
                          borderColor: PRAYER_ACCENT,
                        }
                      : undefined
                  }
                  className={`px-2.5 py-2.5 rounded-[13px] text-[12px] font-semibold truncate text-center transition-all cursor-pointer border ${
                    isSelected
                      ? "font-bold shadow-[0_4px_12px_rgba(48,209,88,0.3)]"
                      : isLightMode
                      ? "bg-black/[0.04] hover:bg-black/[0.08] text-neutral-800 border-black/[0.06]"
                      : "bg-white/[0.055] hover:bg-white/[0.1] text-zinc-200 border-white/[0.07]"
                  }`}
                >
                  {city.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
