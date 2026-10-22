import React, { useState, useEffect, useRef } from "react";
import {
  MapPin,
  Search,
  X,
  RotateCcw,
  Loader2,
  ChevronRight,
  Compass,
} from "lucide-react";
import {
  WeatherLocation,
  GeocodingCity,
  getSavedCustomCity,
  saveCustomCity,
  clearCustomCity,
  searchCities,
  subscribeWeatherChange,
} from "../../services/weatherService";
import { t } from "../../services/i18n";

export const WeatherLocationSetting: React.FC = () => {
  const [customCity, setCustomCity] = useState<WeatherLocation | null>(() => getSavedCustomCity());
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodingCity[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync state if custom city changes anywhere
  useEffect(() => {
    const unsubscribe = subscribeWeatherChange(() => {
      setCustomCity(getSavedCustomCity());
    });
    return unsubscribe;
  }, []);

  // Debounced search
  useEffect(() => {
    if (!isExpanded) return;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await searchCities(query);
      setSearchResults(results);
      setIsSearching(false);
    }, 320);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, isExpanded]);

  const handleSelectCity = (city: GeocodingCity) => {
    const location: WeatherLocation = {
      name: city.name,
      admin1: city.admin1,
      country: city.country,
      latitude: city.latitude,
      longitude: city.longitude,
      source: "custom",
    };
    saveCustomCity(location);
    setCustomCity(location);
    setIsExpanded(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleResetToAuto = () => {
    clearCustomCity();
    setCustomCity(null);
    setIsExpanded(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const locationTitle = customCity
    ? `${customCity.name}${customCity.admin1 ? `, ${customCity.admin1}` : ""}`
    : t("settings_weather_mode_auto");

  return (
    <div className="flex flex-col transition-colors">
      {/* Row Header */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5 min-h-[44px] cursor-pointer hover:bg-white/[0.03] transition-colors select-none"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-2.5 pr-2 min-w-0">
          <div className="w-[28px] h-[28px] rounded-[7px] bg-[#32ade6] flex items-center justify-center text-white shrink-0 shadow-sm">
            <MapPin size={15} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[12.5px] font-medium text-white leading-tight">
              {t("settings_weather_location")}
            </span>
            <span className="text-[9.5px] text-white/50 leading-tight mt-0.5 truncate max-w-[190px]">
              {locationTitle}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {customCity ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">
              {t("settings_weather_custom_active")}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Auto
            </span>
          )}
          <ChevronRight
            size={14}
            className={`text-white/40 transition-transform duration-200 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        </div>
      </div>

      {/* Expanded City Search / Selection */}
      {isExpanded && (
        <div
          className="weather-dropdown-container px-3.5 pb-3 pt-1 flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Input Box */}
          <div className="relative flex items-center">
            <Search
              size={13}
              className="absolute left-2.5 text-white/40 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("settings_weather_search_placeholder")}
              className="weather-search-input w-full h-8 pl-8 pr-7 text-[11.5px] rounded-lg outline-none transition-all"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 text-white/40 hover:text-white p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Quick Actions / Reset to Auto / Restart Onboarding */}
          <div className="flex items-center gap-2 flex-wrap">
            {customCity && (
              <button
                type="button"
                onClick={handleResetToAuto}
                className="weather-action-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
              >
                <RotateCcw size={12} />
                <span>{t("settings_weather_reset_auto")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem("island_onboarding_completed");
                } catch {}
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("island_trigger_onboarding"));
                }
              }}
              className="weather-action-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
            >
              <Compass size={12} className="text-sky-400" />
              <span>{t("settings_weather_restart_onboarding")}</span>
            </button>
          </div>

          {/* Search State Indicator */}
          {isSearching && (
            <div className="flex items-center justify-center gap-1.5 py-3 text-white/50 text-[11px]">
              <Loader2 size={13} className="animate-spin text-sky-400" />
              <span>{t("settings_weather_searching")}</span>
            </div>
          )}

          {/* Search Results List */}
          {!isSearching && searchResults.length > 0 && (
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto settings-scroll pr-1">
              {searchResults.map((city) => (
                <button
                  key={`${city.id}-${city.latitude}`}
                  type="button"
                  onClick={() => handleSelectCity(city)}
                  className="weather-result-item flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors group"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-[11.5px] font-medium text-white truncate group-hover:text-sky-300 transition-colors">
                      {city.name}
                    </span>
                    <span className="text-[9.5px] text-white/45 truncate">
                      {[city.admin2, city.admin1, city.country]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </div>
                  <ChevronRight size={12} className="text-white/30 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* No results notice */}
          {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
            <div className="py-2 text-center text-white/40 text-[10.5px]">
              {t("settings_weather_no_results")}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
