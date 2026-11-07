import React, { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  Bell,
  Navigation,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  PrayerId,
  PrayerScheduleData,
  PrayerSettings,
  PrayerToastPayload,
  PRAYER_ORDER,
  loadPrayerSettings,
  updatePrayerSettings,
  getCompletedPrayersForDate,
  togglePrayerCompleted,
  getNextPrayerStatus,
} from "../../../services/prayerService";
import {
  GeocodingCity,
  WeatherLocation,
  searchCities,
  saveCustomCity,
  clearCustomCity,
  getSavedCustomCity,
} from "../../../services/weatherService";
import { playTaskCompleteSound } from "../../../services/soundService";
import { Language, t } from "../../../services/i18n";
import { iosSpring } from "../../../utils/iosMotion";
import { Tooltip } from "../Tooltip";
import {
  PRAYER_ACCENT,
  PrayerBellIcon,
  PrayerPinIcon,
} from "./PrayerIcons";
import { PrayerMainView } from "./PrayerMainView";
import { PrayerRemindersView, CALC_METHODS } from "./PrayerRemindersView";
import { PrayerLocationView } from "./PrayerLocationView";

export interface PrayerReminderPanelProps {
  schedule: PrayerScheduleData;
  onRefreshSchedule: (force?: boolean) => Promise<void>;
  onTriggerToast: (toast: PrayerToastPayload) => void;
  optLanguage: Language;
  isLightMode: boolean;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onToggleSettings?: () => void;
  onToggleNotifications?: () => void;
  unreadNotificationsCount?: number;
}

export const PrayerReminderPanel: React.FC<PrayerReminderPanelProps> = ({
  schedule,
  onRefreshSchedule,
  onTriggerToast,
  optLanguage,
  isLightMode,
  hasPrev = true,
  hasNext = true,
  onPrev,
  onNext,
  onToggleSettings,
  onToggleNotifications,
  unreadNotificationsCount = 0,
}) => {
  const isId = optLanguage === "id";
  const [subView, setSubView] = useState<"main" | "location" | "settings">("main");
  const [settings, setSettings] = useState<PrayerSettings>(() => loadPrayerSettings());
  const [completedList, setCompletedList] = useState<PrayerId[]>(() =>
    getCompletedPrayersForDate(schedule.dateKey)
  );
  const [now, setNow] = useState(() => new Date());

  const [cityQuery, setCityQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodingCity[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const customCity = useMemo(() => getSavedCustomCity(), [schedule.locationName]);

  useEffect(() => {
    setCompletedList(getCompletedPrayersForDate(schedule.dateKey));
  }, [schedule.dateKey]);

  useEffect(() => {
    const syncHandler = () => {
      setSettings(loadPrayerSettings());
      setCompletedList(getCompletedPrayersForDate(schedule.dateKey));
    };
    window.addEventListener("gili_prayer_updated", syncHandler);
    const clockTimer = setInterval(() => setNow(new Date()), 15_000);
    return () => {
      window.removeEventListener("gili_prayer_updated", syncHandler);
      clearInterval(clockTimer);
    };
  }, [schedule.dateKey]);

  useEffect(() => {
    if (subView !== "location" || cityQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const res = await searchCities(cityQuery, isId ? "id" : "en");
      if (!cancelled) {
        setSearchResults(res);
        setIsSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cityQuery, subView, isId]);

  const nextStatus = useMemo(() => getNextPrayerStatus(schedule, now), [schedule, now]);

  const handleTogglePrayerCompleted = (prayerId: PrayerId) => {
    const res = togglePrayerCompleted(prayerId, schedule.dateKey);
    setCompletedList(res.completed);
    if (res.isNowCompleted) {
      playTaskCompleteSound();
    }
  };

  const handleUpdateSettings = (partial: Partial<PrayerSettings>) => {
    const updated = updatePrayerSettings(partial);
    setSettings(updated);
  };

  const handleToggleSinglePrayerNotif = (prayerId: PrayerId) => {
    const nextEnabled = !settings.enabledPrayers[prayerId];
    handleUpdateSettings({
      enabledPrayers: {
        ...settings.enabledPrayers,
        [prayerId]: nextEnabled,
      },
    });
  };

  const handleSelectCity = async (loc: WeatherLocation) => {
    saveCustomCity(loc);
    setSubView("main");
    setCityQuery("");
    await onRefreshSchedule(true);
  };

  const handleUseAutoLocation = async () => {
    clearCustomCity();
    setSubView("main");
    setCityQuery("");
    await onRefreshSchedule(true);
  };

  const enabledPrayersCount = useMemo(
    () => PRAYER_ORDER.filter((id) => settings.enabledPrayers[id]).length,
    [settings.enabledPrayers]
  );

  // Exact same button classes as PanelNavHeader.tsx
  const navButtonClass =
    "w-8 h-8 rounded-full bg-[#17171c] hover:bg-[#23232a] flex items-center justify-center text-[#e4e4e7] hover:text-white transition-colors cursor-pointer shrink-0";
  const navDisabledClass =
    "w-8 h-8 rounded-full bg-[#17171c]/50 flex items-center justify-center text-white/25 shrink-0 pointer-events-none";

  return (
    <div
      className="w-full h-full flex flex-col select-none overflow-hidden px-6 pb-0.5"
      style={{
        color: isLightMode ? "#101828" : "#fff",
      }}
    >
      {/* Header Row matching PanelNavHeader exact dimensions (mt-1 after status bar pb-1 = 8px, w-8 h-8 buttons, 18px title) */}
      {subView === "main" ? (
        <div
          data-tab-title-swipe="true"
          className="relative flex items-center justify-between gap-2 mt-1 w-full shrink-0"
        >
          {/* Left Cluster: [ Prev ] [ Notification Button ] + Title & Location */}
          <div className="flex items-center gap-2 min-w-0 z-10">
            {hasPrev ? (
              <Tooltip content={t("nav_prev")} side="bottom" align="start">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  transition={iosSpring.press}
                  aria-label={t("nav_prev")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrev?.();
                  }}
                  className={navButtonClass}
                >
                  <ChevronLeft size={16} strokeWidth={2} className="shrink-0" />
                </motion.button>
              </Tooltip>
            ) : (
              <div className={navDisabledClass} role="button" aria-disabled="true">
                <ChevronLeft size={16} strokeWidth={2} />
              </div>
            )}

            {onToggleNotifications && (
              <Tooltip content={t("tab_notifications")} side="bottom" align="start">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  transition={iosSpring.press}
                  aria-label={t("nav_notifications")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleNotifications();
                  }}
                  className={`${navButtonClass} relative`}
                >
                  <Bell size={15} strokeWidth={2} />
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_6px_#3b82f6]" />
                  )}
                </motion.button>
              </Tooltip>
            )}

            <div className="flex flex-col min-w-0 ml-1">
              <span
                className={`text-[18px] font-semibold tracking-[-0.01em] leading-none truncate ${
                  isLightMode ? "text-[#101828]" : "text-white"
                }`}
              >
                {t("tab_prayer_reminder") || (isId ? "Sholat" : "Prayer")}
              </span>
              <button
                type="button"
                onClick={() => setSubView("location")}
                title={isId ? "Klik untuk ubah kota/lokasi" : "Click to change city/location"}
                style={{
                  fontSize: 11,
                  color: "#8e8e93",
                  marginTop: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 5,
                  whiteSpace: "nowrap",
                  background: "transparent",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <PrayerPinIcon size={10} />
                <span>{schedule.locationName}</span>
                <span style={{ color: "#636366" }}>{customCity ? "Custom" : "GPS"}</span>
                {schedule.hijriDate && (
                  <>
                    <span style={{ color: "#48484a" }}>·</span>
                    <span>{schedule.hijriDate}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Cluster: [ Reminders Pill ] [ Settings ] [ Next ] */}
          <div className="flex items-center gap-2 shrink-0 z-10">
            <button
              type="button"
              onClick={() => setSubView("settings")}
              style={{
                height: 30,
                padding: "0 13px 0 10px",
                borderRadius: 15,
                border: 0,
                background: "linear-gradient(180deg, #3BE07A, #22C55E)",
                color: "#04210F",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow:
                  "0 4px 14px rgba(48,209,88,.35), inset 0 1px 0 rgba(255,255,255,.4)",
                flexShrink: 0,
              }}
            >
              <PrayerBellIcon size={13} strokeWidth={2.3} />
              <span>{isId ? "Pengingat" : "Reminders"}</span>
            </button>

            {onToggleSettings && (
              <Tooltip content={t("tab_settings")} side="bottom" align="end">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  transition={iosSpring.press}
                  aria-label={t("tab_settings")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSettings();
                  }}
                  className={navButtonClass}
                >
                  <Settings size={15} strokeWidth={2} />
                </motion.button>
              </Tooltip>
            )}

            {hasNext ? (
              <Tooltip content={t("nav_next")} side="bottom" align="end">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  transition={iosSpring.press}
                  aria-label={t("nav_next")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNext?.();
                  }}
                  className={navButtonClass}
                >
                  <ChevronRight size={16} strokeWidth={2} className="shrink-0" />
                </motion.button>
              </Tooltip>
            ) : (
              <div className={navDisabledClass} role="button" aria-disabled="true">
                <ChevronRight size={16} strokeWidth={2} />
              </div>
            )}
          </div>
        </div>
      ) : subView === "settings" ? (
        <div className="relative flex items-center justify-between gap-2.5 mt-1 w-full shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <motion.button
              whileTap={{ scale: 0.9 }}
              transition={iosSpring.press}
              type="button"
              aria-label="Back to prayer times"
              onClick={() => setSubView("main")}
              className={navButtonClass}
            >
              <ChevronLeft size={16} strokeWidth={2} className="shrink-0" />
            </motion.button>

            <div className="flex flex-col min-w-0">
              <span
                className={`text-[18px] font-semibold tracking-[-0.01em] leading-none truncate ${
                  isLightMode ? "text-[#101828]" : "text-white"
                }`}
              >
                {isId ? "Pengingat" : "Reminders"}
              </span>
              <span style={{ fontSize: 11, color: "#8e8e93", marginTop: 2 }}>
                {isId
                  ? `${enabledPrayersCount} dari 5 waktu sholat aktif`
                  : `${enabledPrayersCount} of 5 prayers on`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#8e8e93" }}>
              {isId ? "Semua pengingat" : "All reminders"}
            </span>

            <button
              type="button"
              role="switch"
              aria-checked={settings.reminderEnabled}
              aria-label="All reminders"
              onClick={() =>
                handleUpdateSettings({ reminderEnabled: !settings.reminderEnabled })
              }
              style={{
                position: "relative",
                width: 40,
                height: 24,
                border: 0,
                borderRadius: 12,
                background: settings.reminderEnabled ? PRAYER_ACCENT : "#39393d",
                padding: 0,
                cursor: "pointer",
                flexShrink: 0,
                transition: "background-color 150ms ease",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: settings.reminderEnabled ? 18 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  background: "#fff",
                  boxShadow: "0 2px 4px rgba(0,0,0,.35)",
                  transition: "left 150ms ease",
                }}
              />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative flex items-center justify-between gap-2.5 mt-1 w-full shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <motion.button
              whileTap={{ scale: 0.9 }}
              transition={iosSpring.press}
              type="button"
              aria-label="Back to prayer times"
              onClick={() => setSubView("main")}
              className={navButtonClass}
            >
              <ChevronLeft size={16} strokeWidth={2} className="shrink-0" />
            </motion.button>

            <div className="flex flex-col min-w-0">
              <span
                className={`text-[18px] font-semibold tracking-[-0.01em] leading-none truncate ${
                  isLightMode ? "text-[#101828]" : "text-white"
                }`}
              >
                {isId ? "Lokasi Jadwal Sholat" : "Prayer Location"}
              </span>
              <span style={{ fontSize: 11, color: "#8e8e93", marginTop: 2 }}>
                {schedule.locationName} ({customCity ? "Custom" : "GPS"})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div
              style={{
                display: "flex",
                gap: 2,
                padding: 2,
                borderRadius: 10,
                background: "rgba(118,118,128,.24)",
              }}
            >
              {CALC_METHODS.map((m) => {
                const isActive = settings.calculationMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={async () => {
                      handleUpdateSettings({ calculationMethod: m.id });
                      await onRefreshSchedule(true);
                    }}
                    style={{
                      height: 24,
                      padding: "0 9px",
                      border: 0,
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background: isActive ? "#636366" : "transparent",
                      color: isLightMode && !isActive ? "#27272a" : "#fff",
                      boxShadow: isActive ? "0 2px 6px rgba(0,0,0,.35)" : "none",
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleUseAutoLocation}
              style={{
                height: 28,
                padding: "0 12px",
                borderRadius: 14,
                border: 0,
                background: "linear-gradient(180deg, #3BE07A, #22C55E)",
                color: "#04210F",
                fontSize: 11.5,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 5,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Navigation size={11} />
              <span>{isId ? "Otomatis (GPS)" : "Auto (GPS)"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Subview Content */}
      {subView === "main" && (
        <PrayerMainView
          schedule={schedule}
          settings={settings}
          completedList={completedList}
          nextStatus={nextStatus}
          now={now}
          optLanguage={optLanguage}
          isLightMode={isLightMode}
          onTogglePrayerCompleted={handleTogglePrayerCompleted}
          onToggleSinglePrayerNotif={handleToggleSinglePrayerNotif}
        />
      )}

      {subView === "settings" && (
        <PrayerRemindersView
          schedule={schedule}
          settings={settings}
          optLanguage={optLanguage}
          isLightMode={isLightMode}
          onUpdateSettings={handleUpdateSettings}
          onToggleSinglePrayerNotif={handleToggleSinglePrayerNotif}
          onChangeCalculationMethod={async (methodId) => {
            handleUpdateSettings({ calculationMethod: methodId });
            await onRefreshSchedule(true);
          }}
          onPlayPreview={() =>
            onTriggerToast({
              type: "prayer_time",
              prayerId: nextStatus.nextPrayer,
              prayerTime: nextStatus.nextPrayerTime,
              locationName: schedule.locationName,
            })
          }
        />
      )}

      {subView === "location" && (
        <PrayerLocationView
          currentLocationName={schedule.locationName}
          cityQuery={cityQuery}
          onChangeCityQuery={setCityQuery}
          searchResults={searchResults}
          isSearching={isSearching}
          optLanguage={optLanguage}
          isLightMode={isLightMode}
          onSelectCity={handleSelectCity}
        />
      )}
    </div>
  );
};
