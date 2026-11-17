import React, { useState, useEffect, useRef } from "react";
import { Moon, RefreshCw } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import {
  DEFAULT_PRAYER_TIMINGS,
  PrayerScheduleData,
  fetchLivePrayerTimes,
} from "../../services/ambientEnvironmentService";
import { Tooltip } from "../../components/ui/Tooltip";
import { getLocalDateKey, useMinuteTick } from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import type { Language } from "../../services/i18n";

const PRAYER_CACHE_KEY = "gili_prayer_cache_v2";

function localizePrayerName(name: string, lang: Language): string {
  if (lang === "id") return name;
  const map: Record<string, string> = {
    Subuh: "Fajr",
    Dzuhur: "Dhuhr",
    Ashar: "Asr",
    Maghrib: "Maghrib",
    Isya: "Isha",
  };
  return map[name] ?? name;
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
  const dateKey = getLocalDateKey(now);

  const [schedule, setSchedule] = useState<PrayerScheduleData>(() => {
    try {
      const raw = localStorage.getItem(PRAYER_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.city && Array.isArray(parsed.timings)) return parsed;
      }
    } catch {}
    return {
      city: "Bandung",
      dateKey: "",
      source: "fallback",
      timings: DEFAULT_PRAYER_TIMINGS,
    };
  });

  const [cityInput, setCityInput] = useState(schedule.city);
  const [loading, setLoading] = useState(false);

  const refreshSchedule = async (city: string) => {
    setLoading(true);
    try {
      const live = await fetchLivePrayerTimes(city);
      if (live) {
        setSchedule(live);
        setCityInput(live.city);
        localStorage.setItem(PRAYER_CACHE_KEY, JSON.stringify(live));
      }
    } catch {
      // Retain cached/fallback timings if offline
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (schedule.dateKey !== dateKey || schedule.source === "fallback") {
      refreshSchedule(schedule.city);
    }
  }, [dateKey]);

  const curMins = now.getHours() * 60 + now.getMinutes();
  const nextPrayer =
    schedule.timings.find((p) => {
      const [h, m] = p.time.split(":").map(Number);
      return h * 60 + m > curMins;
    }) || schedule.timings[0];

  const [nh, nm] = nextPrayer.time.split(":").map(Number);
  let diffMins = nh * 60 + nm - curMins;
  if (diffMins <= 0) diffMins += 1440;
  const diffBody =
    diffMins < 60
      ? `${diffMins}m`
      : `${Math.floor(diffMins / 60)}${tx(lang, "h", "j")} ${diffMins % 60}m`;
  const diffLabel = `-${diffBody}`;
  const nextPrayerDisplay = localizePrayerName(nextPrayer.name, lang);

  const handleToggle = () => setIsOpen((v) => !v);

  return (
    <>
      <Tooltip
        content={`${tx(lang, "Prayer Times", "Waktu Sholat")} (${
          schedule.city
        }): ${nextPrayerDisplay} (${nextPrayer.time} · ${diffLabel})`}
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
              `Next prayer: ${nextPrayerDisplay} at ${nextPrayer.time}`,
              `Sholat berikutnya: ${nextPrayerDisplay} pukul ${nextPrayer.time}`
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
                {nextPrayerDisplay} {nextPrayer.time}
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
        title={`${tx(lang, "Prayer Times", "Jadwal Sholat")} (${schedule.city})`}
        moduleId="waktu_sholat"
        currentView={view}
        config={config}
        width={268}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            {schedule.timings.map((p) => {
              const isNext = p.name === nextPrayer.name;
              const pName = localizePrayerName(p.name, lang);
              return (
                <div
                  key={p.name}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[8px] text-[11.5px] min-w-0 ${
                    isNext
                      ? isLight
                        ? "bg-amber-600/15 border border-amber-600/35 text-amber-800 font-bold"
                        : "bg-amber-500/20 border border-amber-500/40 text-amber-200 font-bold"
                      : "bg-white/[0.04] text-zinc-200"
                  }`}
                >
                  <span className="truncate min-w-0">{pName}</span>
                  <span className="font-mono tabular-nums shrink-0">{p.time}</span>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (cityInput.trim()) refreshSchedule(cityInput.trim());
            }}
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
