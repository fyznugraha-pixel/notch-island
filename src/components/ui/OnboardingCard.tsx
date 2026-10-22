import React, { useState, useEffect, useRef } from "react";
import {
  Globe,
  MapPin,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Compass,
  Check,
} from "lucide-react";
import {
  saveCustomCity,
  clearCustomCity,
  searchCities,
  GeocodingCity,
  WeatherLocation,
} from "../../services/weatherService";
import { t } from "../../services/i18n";

export interface OnboardingCardProps {
  onComplete: () => void;
  isLightMode?: boolean;
}

export const OnboardingCard: React.FC<OnboardingCardProps> = ({
  onComplete,
  isLightMode = false,
}) => {
  const [view, setView] = useState<"choices" | "search">("choices");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodingCity[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dynamic theme classes
  const titleClass = isLightMode ? "text-[#1d1d1f]" : "text-white";
  const descClass = isLightMode ? "text-[#48484a]" : "text-white/60";
  const mutedClass = isLightMode ? "text-neutral-500" : "text-white/45";
  const cardBgClass = isLightMode
    ? "bg-black/[0.04] hover:bg-black/[0.07] border-black/[0.07]"
    : "bg-white/[0.08] hover:bg-white/[0.14] border-white/10";

  // Debounced search when in "search" view
  useEffect(() => {
    if (view !== "search") return;

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await searchCities(q);
      setSearchResults(results);
      setIsSearching(false);
    }, 320);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, view]);

  const handleSelectAuto = () => {
    clearCustomCity();
    try {
      localStorage.setItem("island_onboarding_completed", "true");
    } catch {}
    onComplete();
  };

  const handleSelectCity = (city: GeocodingCity) => {
    const loc: WeatherLocation = {
      name: city.name,
      admin1: city.admin1,
      country: city.country,
      latitude: city.latitude,
      longitude: city.longitude,
      source: "custom",
    };
    saveCustomCity(loc);
    try {
      localStorage.setItem("island_onboarding_completed", "true");
    } catch {}
    onComplete();
  };

  const handleSkip = () => {
    try {
      localStorage.setItem("island_onboarding_completed", "true");
    } catch {}
    onComplete();
  };

  return (
    <div
      className={`w-full h-full flex flex-col justify-between p-4 select-none ${
        isLightMode ? "text-[#1d1d1f]" : "text-white"
      }`}
    >
      {view === "choices" ? (
        <>
          {/* Header */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20 shrink-0">
              <Compass size={16} />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className={`text-[13px] font-semibold tracking-tight leading-tight ${titleClass}`}>
                  {t("onboarding_title")}
                </span>
                <span className={`text-[11px] font-medium leading-tight ${isLightMode ? "text-neutral-500" : "text-white/50"}`}>
                  by faizngraha
                </span>
              </div>
              <span className={`text-[10px] leading-tight mt-0.5 ${descClass}`}>
                {t("onboarding_subtitle")}
              </span>
            </div>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-2 gap-2.5 my-2">
            {/* Automatic Card */}
            <button
              type="button"
              onClick={handleSelectAuto}
              className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all group active:scale-[0.98] ${cardBgClass}`}
            >
              <div className="w-full flex items-center justify-between mb-1.5">
                <div className="w-6 h-6 rounded-lg bg-[#0a84ff] flex items-center justify-center text-white shadow-sm">
                  <Globe size={13} />
                </div>
                <span className="text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  {t("onboarding_auto_badge")}
                </span>
              </div>
              <span
                className={`text-[11.5px] font-semibold leading-tight transition-colors ${
                  isLightMode
                    ? "text-[#1d1d1f] group-hover:text-sky-600"
                    : "text-white group-hover:text-sky-300"
                }`}
              >
                {t("onboarding_auto_title")}
              </span>
              <span className={`text-[9.5px] leading-tight mt-0.5 ${descClass}`}>
                {t("onboarding_auto_desc")}
              </span>
            </button>

            {/* Manual City Card */}
            <button
              type="button"
              onClick={() => setView("search")}
              className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all group active:scale-[0.98] ${cardBgClass}`}
            >
              <div className="w-full flex items-center justify-between mb-1.5">
                <div className="w-6 h-6 rounded-lg bg-[#ff9f0a] flex items-center justify-center text-white shadow-sm">
                  <MapPin size={13} />
                </div>
                <ChevronRight
                  size={13}
                  className={`transition-colors ${
                    isLightMode ? "text-black/35 group-hover:text-black/70" : "text-white/30 group-hover:text-white/60"
                  }`}
                />
              </div>
              <span
                className={`text-[11.5px] font-semibold leading-tight transition-colors ${
                  isLightMode
                    ? "text-[#1d1d1f] group-hover:text-amber-600"
                    : "text-white group-hover:text-amber-300"
                }`}
              >
                {t("onboarding_manual_title")}
              </span>
              <span className={`text-[9.5px] leading-tight mt-0.5 ${descClass}`}>
                {t("onboarding_manual_desc")}
              </span>
            </button>
          </div>

          {/* Footer Skip Link */}
          <div className="flex items-center justify-center pt-0.5">
            <button
              type="button"
              onClick={handleSkip}
              className={`text-[10px] transition-colors font-medium ${
                isLightMode ? "text-neutral-500 hover:text-black" : "text-white/40 hover:text-white/70"
              }`}
            >
              {t("onboarding_skip")}
            </button>
          </div>
        </>
      ) : (
        /* Search View */
        <div className="flex flex-col h-full justify-between">
          <div className="flex flex-col gap-2">
            {/* Search Header with Back Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView("choices")}
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                  isLightMode
                    ? "bg-black/5 hover:bg-black/10 text-[#1d1d1f]"
                    : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
                }`}
              >
                <ChevronLeft size={14} />
              </button>
              <span className={`text-[12px] font-semibold ${titleClass}`}>
                {t("onboarding_manual_title")}
              </span>
            </div>

            {/* Input Bar */}
            <div className="relative flex items-center">
              <Search
                size={13}
                className={`absolute left-2.5 pointer-events-none ${
                  isLightMode ? "text-neutral-400" : "text-white/40"
                }`}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("settings_weather_search_placeholder")}
                className={`w-full h-8 pl-8 pr-7 text-[11px] rounded-lg outline-none transition-all ${
                  isLightMode
                    ? "bg-black/[0.04] text-[#1d1d1f] placeholder-neutral-400 border border-black/10 focus:border-sky-500/50"
                    : "bg-white/10 focus:bg-white/15 text-white placeholder-white/40 border border-white/15 focus:border-sky-400/50"
                }`}
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className={`absolute right-2 p-0.5 ${
                    isLightMode ? "text-neutral-400 hover:text-black" : "text-white/40 hover:text-white"
                  }`}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Results Area */}
          <div className="flex-1 my-1.5 overflow-y-auto settings-scroll min-h-[70px] max-h-[85px] pr-1">
            {isSearching ? (
              <div
                className={`flex items-center justify-center h-full gap-1.5 text-[11px] ${
                  isLightMode ? "text-neutral-500" : "text-white/50"
                }`}
              >
                <Loader2 size={13} className="animate-spin text-sky-500" />
                <span>{t("settings_weather_searching")}</span>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="flex flex-col gap-1">
                {searchResults.map((city) => (
                  <button
                    key={`${city.id}-${city.latitude}`}
                    type="button"
                    onClick={() => handleSelectCity(city)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors group ${
                      isLightMode
                        ? "bg-black/[0.03] hover:bg-black/[0.07]"
                        : "bg-white/5 hover:bg-white/15 text-white"
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span
                        className={`text-[11px] font-medium truncate transition-colors ${
                          isLightMode
                            ? "text-[#1d1d1f] group-hover:text-sky-600"
                            : "text-white group-hover:text-sky-300"
                        }`}
                      >
                        {city.name}
                      </span>
                      <span className={`text-[9px] truncate ${mutedClass}`}>
                        {[city.admin2, city.admin1, city.country].filter(Boolean).join(", ")}
                      </span>
                    </div>
                    <Check
                      size={12}
                      className={`shrink-0 ${
                        isLightMode
                          ? "text-black/30 group-hover:text-sky-600"
                          : "text-white/30 group-hover:text-sky-400"
                      }`}
                    />
                  </button>
                ))}
              </div>
            ) : searchQuery.trim().length >= 2 ? (
              <div
                className={`flex items-center justify-center h-full text-[10.5px] ${
                  isLightMode ? "text-neutral-500" : "text-white/40"
                }`}
              >
                {t("settings_weather_no_results")}
              </div>
            ) : (
              <div
                className={`flex items-center justify-center h-full text-[10px] ${
                  isLightMode ? "text-neutral-400" : "text-white/35"
                }`}
              >
                Ketik nama kotamu untuk mencari
              </div>
            )}
          </div>

          <div className="flex justify-end pt-0.5">
            <button
              type="button"
              onClick={handleSkip}
              className={`text-[10px] transition-colors font-medium ${
                isLightMode ? "text-neutral-500 hover:text-black" : "text-white/40 hover:text-white/70"
              }`}
            >
              {t("onboarding_skip")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
