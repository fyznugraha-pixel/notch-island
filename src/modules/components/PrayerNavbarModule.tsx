import React, { useState, useEffect, useRef, useCallback } from "react";
import { Moon, RefreshCw } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import {
  PRAYER_ORDER,
  PRAYER_SCHEDULE_CACHE_KEY,
  PrayerScheduleData,
  INDONESIAN_PRESET_CITIES,
  getImmediatePrayerSchedule,
  fetchPrayerSchedule,
  getPrayerDisplayName,
  getNextPrayerStatus,
  getTodayDateKey,
} from "../../services/prayerService";
import {
  searchCities,
  saveCustomCity,
  getSavedCustomCity,
  subscribeWeatherChange,
} from "../../services/weatherService";
import { listenCrossWindowEvent } from "../../utils/crossWindowSync";
import { Tooltip } from "../../components/ui/Tooltip";
import { useMinuteTick } from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

const LEGACY_PRAYER_CACHE_KEY = "gili_prayer_cache_v2";

async function migrateLegacyPrayerCache(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const legacyRaw = localStorage.getItem(LEGACY_PRAYER_CACHE_KEY);
    if (!legacyRaw) return;
    localStorage.removeItem(LEGACY_PRAYER_CACHE_KEY);
    const parsed = JSON.parse(legacyRaw);
    const legacyCity = typeof parsed?.city === "string" ? parsed.city.trim() : "";
    if (!legacyCity || legacyCity.toLowerCase() === "bandung" || getSavedCustomCity()) {
      return;
    }
    const preset = INDONESIAN_PRESET_CITIES.find(
      (c) => c.name.toLowerCase() === legacyCity.toLowerCase()
    );
    if (preset) {
      saveCustomCity(preset);
      return;
    }
    const matches = await searchCities(legacyCity, "id");
    if (matches.length > 0) {
      const first = matches[0];
      saveCustomCity({
        name: first.name,
        admin1: first.admin1,
        country: first.country,
        latitude: first.latitude,
        longitude: first.longitude,
        source: "custom",
      });
    }
  } catch {}
}

export const PrayerNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const now = useMinuteTick(30000);
  const dateKey = getTodayDateKey(now);

  const [schedule, setSchedule] = useState<PrayerScheduleData>(() =>
    getImmediatePrayerSchedule()
  );
  const [cityInput, setCityInput] = useState(schedule.locationName);
  const [loading, setLoading] = useState(false);

  const syncFromCanonical = useCallback(() => {
    const next = getImmediatePrayerSchedule();
    setSchedule(next);
    setCityInput(next.locationName);
  }, []);

  const refreshSchedule = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const live = await fetchPrayerSchedule(force);
      setSchedule(live);
      setCityInput(live.locationName);
    } catch {
      // Retain cached/calculated timings if offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    migrateLegacyPrayerCache().then(() => {
      if (!active) return;
      if (schedule.dateKey !== dateKey || schedule.source === "calculated") {
        refreshSchedule(false);
      } else {
        syncFromCanonical();
      }
    });
    return () => {
      active = false;
    };
  }, [dateKey, refreshSchedule, syncFromCanonical]);

  useEffect(() => {
    const unsubWeather = subscribeWeatherChange(() => {
      refreshSchedule(true);
    });
    const unsubPrayer = listenCrossWindowEvent("gili_prayer_updated", () => {
      syncFromCanonical();
    });
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === PRAYER_SCHEDULE_CACHE_KEY ||
        e.key === "island_weather_custom_city" ||
        e.key === "island_cached_weather_location"
      ) {
        syncFromCanonical();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubWeather();
      unsubPrayer();
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshSchedule, syncFromCanonical]);

  const status = getNextPrayerStatus(schedule, now);
  const nextPrayerDisplay = getPrayerDisplayName(status.nextPrayer, lang);
  const nextPrayerTime = status.nextPrayerTime;
  const diffMins = status.minutesUntilNext;
  const diffBody =
    diffMins < 60
      ? `${diffMins}m`
      : `${Math.floor(diffMins / 60)}${tx(lang, "h", "j")} ${diffMins % 60}m`;
  const diffLabel = `-${diffBody}`;

  const handleToggle = () => setIsOpen((v) => !v);

  const handleCitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = cityInput.trim();
    if (!query) return;
    setLoading(true);
    try {
      const preset = INDONESIAN_PRESET_CITIES.find(
        (c) => c.name.toLowerCase() === query.toLowerCase()
      );
      if (preset) {
        saveCustomCity(preset);
      } else {
        const results = await searchCities(query, lang);
        if (results.length > 0) {
          const first = results[0];
          saveCustomCity({
            name: first.name,
            admin1: first.admin1,
            country: first.country,
            latitude: first.latitude,
            longitude: first.longitude,
            source: "custom",
          });
        }
      }
      const updated = await fetchPrayerSchedule(true);
      setSchedule(updated);
      setCityInput(updated.locationName);
    } catch {
      // Retain current schedule on network error
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Tooltip
        content={`${tx(lang, "Prayer Times", "Waktu Sholat")} (${
          schedule.locationName
        }): ${nextPrayerDisplay} (${nextPrayerTime} · ${diffLabel})`}
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
              `Next prayer: ${nextPrayerDisplay} at ${nextPrayerTime}`,
              `Sholat berikutnya: ${nextPrayerDisplay} pukul ${nextPrayerTime}`
            ),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "gili-mod-pill px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <Moon
            size={15}
            className={`${isLight ? "text-amber-600" : "text-[#fbbf24]"} shrink-0`}
          />
          {!isCompact && (
            <div className="flex flex-col leading-[1.15] min-w-0 max-w-[130px]">
              <span className="text-[11.5px] font-bold text-white tabular-nums truncate">
                {nextPrayerDisplay} {nextPrayerTime}
              </span>
              <span
                className={`text-[10px] tabular-nums truncate ${
                  isLight ? "text-amber-700" : "text-[#fbbf24]"
                }`}
              >
                {tx(lang, `in ${diffBody}`, `${diffLabel} lagi`)}
              </span>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={`${tx(lang, "Prayer Times", "Jadwal Sholat")} (${schedule.locationName})`}
        moduleId="waktu_sholat"
        currentView={view}
        config={config}
        width={268}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            {PRAYER_ORDER.map((prayerId) => {
              const isNext = prayerId === status.nextPrayer;
              const pName = getPrayerDisplayName(prayerId, lang);
              const pTime = schedule.timings[prayerId];
              return (
                <div
                  key={prayerId}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[8px] text-[11.5px] min-w-0 ${
                    isNext
                      ? isLight
                        ? "bg-amber-600/15 border border-amber-600/35 text-amber-800 font-bold"
                        : "bg-amber-500/20 border border-amber-500/40 text-amber-200 font-bold"
                      : "bg-white/[0.04] text-zinc-200"
                  }`}
                >
                  <span className="truncate min-w-0">{pName}</span>
                  <span className="font-mono tabular-nums shrink-0">{pTime}</span>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={handleCitySubmit}
            className="flex items-center gap-1.5 pt-1 border-t border-white/[0.08]"
          >
            <input
              type="text"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder={tx(lang, "City...", "Kota...")}
              className={`flex-1 min-w-0 h-7 px-2 rounded-[7px] bg-white/[0.06] border border-white/[0.12] text-[11px] text-white placeholder-zinc-400 ${TRIGGER_FOCUS_RING}`}
            />
            <Tooltip
              content={tx(
                lang,
                "Refresh prayer schedule",
                "Perbarui jadwal Kemenag"
              )}
              side="top"
              isLightMode={isLight}
            >
              <button
                type="submit"
                className={`h-7 px-2 shrink-0 rounded-[7px] text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING} ${
                  isLight
                    ? "bg-amber-600 hover:bg-amber-700 text-[#ffffff]"
                    : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-200"
                }`}
              >
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
              </button>
            </Tooltip>
          </form>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
