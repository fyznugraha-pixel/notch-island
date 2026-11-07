import React, { useState, useEffect, useMemo } from "react";
import { Navigation } from "lucide-react";
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
import { Language } from "../../../services/i18n";
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

  const circleBtnStyle = (disabled = false): React.CSSProperties => ({
    position: "relative",
    width: 30,
    height: 30,
    borderRadius: 15,
    border: 0,
    background: isLightMode ? "rgba(0,0,0,.07)" : "rgba(255,255,255,.09)",
    color: isLightMode ? "#18181b" : "#e8e8ed",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.35 : 1,
    pointerEvents: disabled ? "none" : "auto",
    flexShrink: 0,
    boxShadow: isLightMode
      ? "inset 0 0 0 1px rgba(0,0,0,.06)"
      : "inset 0 0 0 1px rgba(255,255,255,.06)",
  });

  return (
    <div
      className="w-full h-full flex flex-col select-none overflow-hidden"
      style={{
        padding: "0 28px 2px",
        color: isLightMode ? "#18181b" : "#fff",
      }}
    >
      {/* Custom Title Bar Row matching prayer-desain.html */}
      {subView === "main" ? (
        <div
          data-tab-title-swipe="true"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 36,
            position: "relative",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              aria-label="Back"
              onClick={onPrev}
              style={circleBtnStyle(!hasPrev)}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <button
              type="button"
              aria-label="Notifications"
              onClick={onToggleNotifications}
              style={circleBtnStyle(false)}
            >
              <PrayerBellIcon size={15} strokeWidth={2} />
              {unreadNotificationsCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    right: 4,
                    top: 4,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: "#0A84FF",
                    boxShadow: `0 0 0 2px ${isLightMode ? "#fff" : "#000"}`,
                  }}
                />
              )}
            </button>
          </div>

          <div style={{ marginLeft: 4, whiteSpace: "nowrap", minWidth: 0 }}>
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: "-.02em",
                lineHeight: "20px",
              }}
            >
              {isId ? "Sholat" : "Prayer"}
            </div>
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

          <div style={{ flex: 1 }} />

          <button
            type="button"
            onClick={() => setSubView("settings")}
            style={{
              height: 28,
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
            <button
              type="button"
              aria-label="Settings"
              onClick={onToggleSettings}
              style={circleBtnStyle(false)}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </button>
          )}

          <button
            type="button"
            aria-label="Next page"
            onClick={onNext}
            style={circleBtnStyle(!hasNext)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      ) : subView === "settings" ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 36,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            aria-label="Back to prayer times"
            onClick={() => setSubView("main")}
            style={circleBtnStyle(false)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.02em" }}>
              {isId ? "Pengingat" : "Reminders"}
            </div>
            <div style={{ fontSize: 11, color: "#8e8e93" }}>
              {isId
                ? `${enabledPrayersCount} dari 5 waktu sholat aktif`
                : `${enabledPrayersCount} of 5 prayers on`}
            </div>
          </div>

          <span style={{ flex: 1 }} />

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
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 36,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            aria-label="Back to prayer times"
            onClick={() => setSubView("main")}
            style={circleBtnStyle(false)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.02em" }}>
              {isId ? "Lokasi Jadwal Sholat" : "Prayer Location"}
            </div>
            <div style={{ fontSize: 11, color: "#8e8e93" }}>
              {schedule.locationName} ({customCity ? "Custom" : "GPS"})
            </div>
          </div>

          <span style={{ flex: 1 }} />

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
