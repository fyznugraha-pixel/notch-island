import React, { useState, useEffect, useMemo } from "react";
import {
  Moon,
  MapPin,
  Bell,
  BellOff,
  Check,
  SlidersHorizontal,
  Search,
  Navigation,
  ArrowLeft,
  Send,
} from "lucide-react";
import {
  PrayerId,
  PrayerScheduleData,
  PrayerSettings,
  PrayerToastPayload,
  PRAYER_ORDER,
  INDONESIAN_PRESET_CITIES,
  loadPrayerSettings,
  updatePrayerSettings,
  getCompletedPrayersForDate,
  togglePrayerCompleted,
  getNextPrayerStatus,
  getPrayerDisplayName,
} from "../../../services/prayerService";
import {
  GeocodingCity,
  WeatherLocation,
  searchCities,
  saveCustomCity,
  clearCustomCity,
  getSavedCustomCity,
} from "../../../services/weatherService";
import { Language } from "../../../services/i18n";
import { IosSwitch } from "../../ios/IosSwitch";

interface PrayerReminderPanelProps {
  schedule: PrayerScheduleData;
  onRefreshSchedule: (force?: boolean) => Promise<void>;
  onTriggerToast: (toast: PrayerToastPayload) => void;
  optLanguage: Language;
  isLightMode: boolean;
}

export const PrayerReminderPanel: React.FC<PrayerReminderPanelProps> = ({
  schedule,
  onRefreshSchedule,
  onTriggerToast,
  optLanguage,
  isLightMode,
}) => {
  const isId = optLanguage === "id";
  const [subView, setSubView] = useState<"main" | "location" | "settings">("main");
  const [settings, setSettings] = useState<PrayerSettings>(() => loadPrayerSettings());
  const [completedList, setCompletedList] = useState<PrayerId[]>(() =>
    getCompletedPrayersForDate(schedule.dateKey)
  );
  const [now, setNow] = useState(() => new Date());

  // Location Picker State
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
      onTriggerToast({
        type: "completed",
        prayerId,
        prayerTime: schedule.timings[prayerId],
        locationName: schedule.locationName,
      });
    }
  };

  const handleToggleSinglePrayerNotif = (prayerId: PrayerId) => {
    const nextEnabled = !settings.enabledPrayers[prayerId];
    const updated = updatePrayerSettings({
      enabledPrayers: {
        ...settings.enabledPrayers,
        [prayerId]: nextEnabled,
      },
    });
    setSettings(updated);
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

  const surfaceCard = isLightMode
    ? "bg-black/[0.04] border border-black/[0.07]"
    : "bg-white/[0.045] border border-white/[0.07]";

  // ============================================================================
  // SUBVIEW 1: LOCATION PICKER
  // ============================================================================
  if (subView === "location") {
    return (
      <div className="w-full h-full flex flex-col gap-3 px-6 pt-2.5 pb-2.5 select-none overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSubView("main")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold transition-colors cursor-pointer ${
              isLightMode
                ? "bg-black/[0.06] hover:bg-black/[0.1] text-neutral-800"
                : "bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100"
            }`}
          >
            <ArrowLeft size={13} />
            <span>{isId ? "Kembali" : "Back"}</span>
          </button>

          <span className={`text-[12.5px] font-bold ${isLightMode ? "text-neutral-900" : "text-white"}`}>
            {isId ? "Pilih Lokasi Jadwal Sholat" : "Select Prayer Location"}
          </span>

          <button
            type="button"
            onClick={handleUseAutoLocation}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#10b981] hover:bg-[#059669] text-white text-[11px] font-semibold transition-colors cursor-pointer"
          >
            <Navigation size={11} />
            <span>{isId ? "Otomatis (GPS)" : "Auto (GPS)"}</span>
          </button>
        </div>

        {/* Search Input */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-[12px] border shrink-0 ${
            isLightMode
              ? "bg-white border-black/10 focus-within:border-[#10b981]"
              : "bg-white/[0.06] border-white/10 focus-within:border-[#10b981]"
          }`}
        >
          <Search size={13.5} className={isLightMode ? "text-neutral-400" : "text-zinc-400"} />
          <input
            type="text"
            value={cityQuery}
            onChange={(e) => setCityQuery(e.target.value)}
            placeholder={isId ? "Cari nama kota (mis. Bekasi, Solo, Padang)..." : "Search city name..."}
            className={`w-full bg-transparent text-[12px] outline-none ${
              isLightMode ? "text-neutral-900 placeholder-neutral-400" : "text-white placeholder-zinc-500"
            }`}
          />
        </div>

        {/* Results or Preset Indonesian Cities */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
          {cityQuery.trim().length >= 2 ? (
            <div className="flex flex-col gap-1">
              {isSearching ? (
                <div className={`text-[11.5px] py-6 text-center ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
                  {isId ? "Mencari kota..." : "Searching cities..."}
                </div>
              ) : searchResults.length === 0 ? (
                <div className={`text-[11.5px] py-6 text-center ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
                  {isId ? "Kota tidak ditemukan" : "No cities found"}
                </div>
              ) : (
                searchResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      handleSelectCity({
                        name: c.name,
                        admin1: c.admin1,
                        country: c.country,
                        latitude: c.latitude,
                        longitude: c.longitude,
                        source: "custom",
                      })
                    }
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-[11px] text-left transition-colors cursor-pointer ${
                      isLightMode ? "hover:bg-black/[0.06]" : "hover:bg-white/[0.08]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin size={13} className="text-[#10b981] shrink-0" />
                      <span className={`text-[12px] font-semibold truncate ${isLightMode ? "text-neutral-900" : "text-white"}`}>
                        {c.name}
                      </span>
                      <span className={`text-[11px] truncate ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
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
                  schedule.locationName.toLowerCase() === city.name.toLowerCase();
                return (
                  <button
                    key={city.name}
                    type="button"
                    onClick={() => handleSelectCity(city)}
                    className={`px-2.5 py-2 rounded-[11px] text-[11.5px] font-semibold truncate text-center transition-all cursor-pointer border ${
                      isSelected
                        ? "bg-[#10b981] text-white border-[#10b981]"
                        : isLightMode
                        ? "bg-black/[0.04] hover:bg-black/[0.08] text-neutral-800 border-black/[0.06]"
                        : "bg-white/[0.04] hover:bg-white/[0.09] text-zinc-200 border-white/[0.06]"
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
  }

  // ============================================================================
  // SUBVIEW 2: PRAYER REMINDER SETTINGS
  // ============================================================================
  if (subView === "settings") {
    return (
      <div className="w-full h-full flex flex-col gap-2.5 px-6 pt-2 pb-2 select-none overflow-hidden">
        <div className="flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSubView("main")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold transition-colors cursor-pointer ${
              isLightMode
                ? "bg-black/[0.06] hover:bg-black/[0.1] text-neutral-800"
                : "bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100"
            }`}
          >
            <ArrowLeft size={13} />
            <span>{isId ? "Kembali" : "Back"}</span>
          </button>

          <span className={`text-[12.5px] font-bold ${isLightMode ? "text-neutral-900" : "text-white"}`}>
            {isId ? "Pengaturan Pengingat Sholat" : "Prayer Reminder Settings"}
          </span>

          <button
            type="button"
            onClick={() =>
              onTriggerToast({
                type: "prayer_time",
                prayerId: nextStatus.nextPrayer,
                prayerTime: nextStatus.nextPrayerTime,
                locationName: schedule.locationName,
              })
            }
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#10b981] hover:bg-[#059669] text-white text-[11px] font-semibold transition-colors cursor-pointer"
          >
            <Send size={11} />
            <span>{isId ? "Tes Notif" : "Test Notif"}</span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {/* Row 1: Main Reminder Toggle */}
          <div className={`flex items-center justify-between px-3.5 py-2.5 rounded-[14px] ${surfaceCard}`}>
            <div className="flex flex-col">
              <span className={`text-[12px] font-semibold ${isLightMode ? "text-neutral-900" : "text-white"}`}>
                {isId ? "Notifikasi Saat Masuk Waktu Sholat" : "Notify at Exact Prayer Time"}
              </span>
              <span className={`text-[10.5px] ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
                {isId
                  ? "Tampilkan pop-up pengingat otomatis di Notch setiap tiba waktu sholat"
                  : "Show automatic Notch pop-up notification when prayer time arrives"}
              </span>
            </div>
            <IosSwitch
              checked={settings.reminderEnabled}
              onChange={() => {
                const updated = updatePrayerSettings({
                  reminderEnabled: !settings.reminderEnabled,
                });
                setSettings(updated);
              }}
              activeColor="green"
            />
          </div>

          {/* Row 2: Pre-Reminder Toggle (5 / 10 / 15m before) */}
          <div className={`flex items-center justify-between px-3.5 py-2.5 rounded-[14px] ${surfaceCard}`}>
            <div className="flex flex-col">
              <span className={`text-[12px] font-semibold ${isLightMode ? "text-neutral-900" : "text-white"}`}>
                {isId ? "Pengingat Sebelum Adzan" : "Pre-Adzan Reminder"}
              </span>
              <span className={`text-[10.5px] ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
                {isId
                  ? "Ingatkan beberapa menit sebelum masuk waktu sholat"
                  : "Remind a few minutes before prayer time starts"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {settings.preReminderEnabled && (
                <div
                  className={`flex items-center rounded-lg p-0.5 border ${
                    isLightMode ? "bg-black/5 border-black/10" : "bg-white/5 border-white/10"
                  }`}
                >
                  {[5, 10, 15].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => {
                        const updated = updatePrayerSettings({ preReminderMinutes: mins });
                        setSettings(updated);
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10.5px] font-semibold transition-colors cursor-pointer ${
                        settings.preReminderMinutes === mins
                          ? "bg-[#10b981] text-white"
                          : isLightMode
                          ? "text-neutral-600 hover:text-neutral-900"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              )}
              <IosSwitch
                checked={settings.preReminderEnabled}
                onChange={() => {
                  const updated = updatePrayerSettings({
                    preReminderEnabled: !settings.preReminderEnabled,
                  });
                  setSettings(updated);
                }}
                activeColor="green"
              />
            </div>
          </div>

          {/* Row 3: Calculation Method */}
          <div className={`flex items-center justify-between px-3.5 py-2.5 rounded-[14px] ${surfaceCard}`}>
            <div className="flex flex-col">
              <span className={`text-[12px] font-semibold ${isLightMode ? "text-neutral-900" : "text-white"}`}>
                {isId ? "Metode Perhitungan Jadwal" : "Calculation Method"}
              </span>
              <span className={`text-[10.5px] ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
                {isId ? "Standar hisab waktu sholat" : "Astronomical calculation standard"}
              </span>
            </div>

            <div
              className={`flex items-center rounded-lg p-0.5 border ${
                isLightMode ? "bg-black/5 border-black/10" : "bg-white/5 border-white/10"
              }`}
            >
              {[
                { id: 20, label: "Kemenag RI" },
                { id: 3, label: "MWL" },
                { id: 4, label: "Makkah" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={async () => {
                    const updated = updatePrayerSettings({ calculationMethod: m.id });
                    setSettings(updated);
                    await onRefreshSchedule(true);
                  }}
                  className={`px-2.5 py-1 rounded-md text-[10.5px] font-semibold transition-colors cursor-pointer ${
                    settings.calculationMethod === m.id
                      ? "bg-[#10b981] text-white"
                      : isLightMode
                      ? "text-neutral-600 hover:text-neutral-900"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN SCHEDULE VIEW
  // ============================================================================
  const nextPrayerName = getPrayerDisplayName(nextStatus.nextPrayer, optLanguage);

  return (
    <div className="w-full h-full flex flex-col gap-2.5 px-6 pt-2 pb-2 select-none overflow-hidden">
      {/* 1. Top Header Bar */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setSubView("location")}
            title={isId ? "Klik untuk ubah kota/lokasi" : "Click to change city/location"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold transition-colors cursor-pointer truncate max-w-[220px] ${
              isLightMode
                ? "bg-black/[0.06] hover:bg-black/[0.1] text-neutral-800"
                : "bg-white/[0.08] hover:bg-white/[0.14] text-zinc-100"
            }`}
          >
            <MapPin size={12.5} className="text-[#10b981] shrink-0" />
            <span className="truncate">{schedule.locationName}</span>
            {customCity && (
              <span className="text-[9.5px] opacity-60 shrink-0">
                ({isId ? "Manual" : "Custom"})
              </span>
            )}
          </button>

          {schedule.hijriDate && (
            <span
              className={`text-[11px] font-medium truncate hidden sm:inline ${
                isLightMode ? "text-neutral-500" : "text-zinc-400"
              }`}
            >
              • {schedule.hijriDate}
            </span>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`px-3 py-1 rounded-full text-[11px] font-semibold tabular-nums ${
              completedList.length === 5
                ? "bg-[#10b981]/20 text-[#10b981]"
                : isLightMode
                ? "bg-black/[0.05] text-neutral-700"
                : "bg-white/[0.07] text-zinc-300"
            }`}
          >
            {completedList.length}/5 {isId ? "Sholat" : "Prayers"}
          </span>

          <button
            type="button"
            onClick={() => setSubView("settings")}
            title={isId ? "Pengaturan pengingat sholat" : "Prayer reminder settings"}
            className={`flex items-center gap-1.5 px-3 h-7 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
              settings.reminderEnabled
                ? "bg-[#10b981] text-white"
                : isLightMode
                ? "bg-black/[0.06] text-neutral-600"
                : "bg-white/[0.08] text-zinc-400"
            }`}
          >
            <SlidersHorizontal size={12} />
            <span>{isId ? "Pengingat" : "Reminders"}</span>
          </button>
        </div>
      </div>

      {/* 2. Hero Upcoming Prayer Card */}
      <div
        className={`w-full rounded-[18px] px-4 py-3.5 flex items-center justify-between gap-4 shrink-0 ${surfaceCard}`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-[13px] bg-[#10b981] text-white flex items-center justify-center shrink-0">
            <Moon size={21} strokeWidth={2.2} />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#10b981]">
                {nextStatus.isTomorrow
                  ? isId
                    ? "Jadwal Subuh Besok"
                    : "Tomorrow's Fajr"
                  : isId
                  ? "Waktu Sholat Berikutnya"
                  : "Next Prayer"}
              </span>
              <span
                className={`text-[10.5px] ${
                  isLightMode ? "text-neutral-500" : "text-zinc-400"
                }`}
              >
                • Imsak {schedule.timings.Imsak} • {isId ? "Terbit" : "Sunrise"}{" "}
                {schedule.timings.Sunrise}
              </span>
            </div>
            <div className="flex items-baseline gap-2.5">
              <span
                className={`text-[18px] font-extrabold tracking-tight leading-snug ${
                  isLightMode ? "text-neutral-900" : "text-white"
                }`}
              >
                {isId ? `Sholat ${nextPrayerName}` : nextPrayerName}
              </span>
              <span className="text-[17px] font-bold tabular-nums text-[#10b981] leading-snug">
                {nextStatus.nextPrayerTime}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`px-3 py-1 rounded-full text-[12.5px] font-bold tabular-nums ${
              isLightMode
                ? "bg-[#10b981]/15 text-[#047857]"
                : "bg-[#10b981]/20 text-[#34d399]"
            }`}
          >
            -{nextStatus.countdownText}
          </span>
          <span
            className={`text-[10.5px] ${
              isLightMode ? "text-neutral-500" : "text-zinc-400"
            }`}
          >
            {settings.reminderEnabled
              ? settings.preReminderEnabled
                ? isId
                  ? `Notif -${settings.preReminderMinutes}m & saat adzan`
                  : `Notif -${settings.preReminderMinutes}m & at adzan`
                : isId
                ? "Notif saat adzan aktif"
                : "Adzan notif active"
              : isId
              ? "Notifikasi dimatikan"
              : "Notifications off"}
          </span>
        </div>
      </div>

      {/* 3. 5-Prayer Daily Schedule Row */}
      <div className="grid grid-cols-5 gap-2.5 w-full flex-1 min-h-0">
        {PRAYER_ORDER.map((prayerId) => {
          const isNext =
            nextStatus.nextPrayer === prayerId && !nextStatus.isTomorrow;
          const isCompleted = completedList.includes(prayerId);
          const isNotifOn =
            settings.reminderEnabled && settings.enabledPrayers[prayerId];
          const pName = getPrayerDisplayName(prayerId, optLanguage);
          const pTime = schedule.timings[prayerId];

          return (
            <div
              key={prayerId}
              className={`rounded-[16px] p-3 flex flex-col justify-between border transition-all ${
                isNext
                  ? isLightMode
                    ? "bg-[#10b981]/10 border-[#10b981] shadow-sm"
                    : "bg-[#10b981]/15 border-[#10b981]/80 shadow-[0_4px_16px_rgba(16,185,129,0.15)]"
                  : surfaceCard
              }`}
            >
              {/* Top: Name + Notif Bell */}
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`text-[12px] font-bold truncate ${
                    isNext
                      ? "text-[#10b981]"
                      : isLightMode
                      ? "text-neutral-700"
                      : "text-zinc-300"
                  }`}
                >
                  {pName}
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleSinglePrayerNotif(prayerId)}
                  title={
                    isNotifOn
                      ? isId
                        ? `Notifikasi ${pName} aktif`
                        : `${pName} notification on`
                      : isId
                      ? `Notifikasi ${pName} nonaktif`
                      : `${pName} notification off`
                  }
                  className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                    isNotifOn
                      ? "text-[#10b981] hover:bg-[#10b981]/15"
                      : isLightMode
                      ? "text-neutral-400 hover:bg-black/5"
                      : "text-zinc-500 hover:bg-white/5"
                  }`}
                >
                  {isNotifOn ? <Bell size={12} /> : <BellOff size={12} />}
                </button>
              </div>

              {/* Middle: Time */}
              <div
                className={`text-[16px] font-extrabold tabular-nums tracking-tight my-0.5 ${
                  isLightMode ? "text-neutral-900" : "text-white"
                }`}
              >
                {pTime}
              </div>

              {/* Bottom: Check / Done Button */}
              <button
                type="button"
                onClick={() => handleTogglePrayerCompleted(prayerId)}
                className={`w-full py-1.5 rounded-[10px] text-[10.5px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  isCompleted
                    ? "bg-[#10b981] text-white"
                    : isLightMode
                    ? "bg-black/[0.06] hover:bg-black/[0.11] text-neutral-700"
                    : "bg-white/[0.07] hover:bg-white/[0.13] text-zinc-300"
                }`}
              >
                <Check size={11} strokeWidth={2.5} />
                <span>
                  {isCompleted
                    ? isId
                      ? "Sudah"
                      : "Done"
                    : isId
                    ? "Tandai"
                    : "Mark"}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
