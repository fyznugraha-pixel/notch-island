import React, { useState } from "react";
import {
  WaterData,
  updateWaterSettings,
  resetAllWaterData,
  triggerWaterToast,
} from "../../../services/waterService";
import { t, getLanguage } from "../../../services/i18n";
import { WaterHourPicker } from "./WaterHourPicker";

export interface WaterSettingsViewProps {
  data: WaterData;
  isLightMode: boolean;
  onBack: () => void;
}

export const WaterSettingsView: React.FC<WaterSettingsViewProps> = ({
  data,
  isLightMode,
  onBack,
}) => {
  const [subTab, setSubTab] = useState<"general" | "reminders" | "streak">("general");
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const isEn = getLanguage() === "en";
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Automatically scroll back to top whenever switching subtabs
  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [subTab]);

  const { settings } = data;

  // Theming colors matching design
  const accent = isLightMode ? "#0284C7" : "#38BDF8";
  const textColor = isLightMode ? "#101828" : "#ffffff";
  const textSub = isLightMode ? "#667085" : "#8a8a94";
  const cardBg = isLightMode ? "#FFFFFF" : "#121217";
  const cardBorder = isLightMode ? "#E4E7EC" : "#1e1e25";
  const btnBg = isLightMode ? "#E7ECF3" : "#17171c";
  const btnColor = isLightMode ? "#344054" : "#e4e4e7";

  const targetL = isEn
    ? (settings.dailyTargetMl / 1000).toFixed(1)
    : (settings.dailyTargetMl / 1000).toFixed(1).replace(".", ",");
  const streakThresholdMl = Math.round(settings.dailyTargetMl * (settings.streakThresholdPercent / 100));

  const handleAdjustTarget = (deltaMl: number) => {
    const next = Math.max(500, Math.min(8000, settings.dailyTargetMl + deltaMl));
    updateWaterSettings({ dailyTargetMl: next });
  };

  return (
    <div className="w-full h-full flex flex-col select-none">
      {/* Top Header */}
      <div className="relative flex items-center justify-between h-[34px] w-full mt-1">
        <button
          type="button"
          aria-label={t("action_back")}
          onClick={onBack}
          className="w-[34px] h-[34px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer transition-transform active:scale-95 z-10"
          style={{ background: btnBg, color: btnColor }}
        >
          <svg
            width="16"
            height="16"
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

        <h1
          className="m-0 absolute inset-x-0 text-center text-[18px] font-semibold tracking-[-0.01em] pointer-events-none"
          style={{ color: textColor }}
        >
          {t("water_settings_title")}
        </h1>

        <div className="w-[34px] h-[34px] shrink-0" />
      </div>

      {/* Subtab Segmented Bar: [ Umum | Pengingat | Streak dan data ] */}
      <div className="mt-2.5 flex justify-center">
        <div
          role="tablist"
          className="flex gap-0.5 p-0.5 rounded-[10px]"
          style={{ background: isLightMode ? "#E7ECF3" : "#121216" }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "general"}
            onClick={() => {
              setSubTab("general");
              if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
            }}
            className="h-[28px] px-3 border-0 rounded-[8px] text-[12px] font-medium cursor-pointer transition-colors"
            style={{
              background: subTab === "general" ? (isLightMode ? "#FFFFFF" : "#2a2a31") : "transparent",
              color: subTab === "general" ? (isLightMode ? "#101828" : "#ffffff") : textSub,
            }}
          >
            {t("water_set_general")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "reminders"}
            onClick={() => {
              setSubTab("reminders");
              if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
            }}
            className="h-[28px] px-3 border-0 rounded-[8px] text-[12px] font-medium cursor-pointer transition-colors"
            style={{
              background: subTab === "reminders" ? (isLightMode ? "#FFFFFF" : "#2a2a31") : "transparent",
              color: subTab === "reminders" ? (isLightMode ? "#101828" : "#ffffff") : textSub,
            }}
          >
            {t("water_set_reminders")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "streak"}
            onClick={() => {
              setSubTab("streak");
              if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
            }}
            className="h-[28px] px-3 border-0 rounded-[8px] text-[12px] font-medium cursor-pointer transition-colors"
            style={{
              background: subTab === "streak" ? (isLightMode ? "#FFFFFF" : "#2a2a31") : "transparent",
              color: subTab === "streak" ? (isLightMode ? "#101828" : "#ffffff") : textSub,
            }}
          >
            {t("water_set_streak_data")}
          </button>
        </div>
      </div>

      {/* Settings Card */}
      <div
        ref={scrollContainerRef}
        key={subTab}
        className="mt-3 flex-1 overflow-y-auto"
      >
        <div
          className="rounded-[16px] overflow-hidden"
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
          }}
        >
          {/* =============================================================
              SUBTAB 1: UMUM (Screen 47)
              ============================================================= */}
          {subTab === "general" && (
            <>
              {/* Row 1: Target Harian */}
              <div
                className="min-h-[52px] flex items-center gap-4 px-3.5 py-2 border-b"
                style={{ borderColor: cardBorder }}
              >
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                    {t("water_daily_target")}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: textSub }}>
                    {t("water_daily_target_desc")}
                  </div>
                </div>

                <div className="shrink-0 flex items-center">
                  <div
                    className="flex items-center justify-between w-[150px] h-[40px] rounded-full px-1"
                    style={{ background: btnBg }}
                  >
                    <button
                      type="button"
                      aria-label={isEn ? "Decrease" : "Kurangi"}
                      onClick={() => handleAdjustTarget(-100)}
                      className="w-[32px] h-[32px] rounded-full border-0 bg-transparent flex items-center justify-center p-0 cursor-pointer active:scale-90"
                      style={{ color: btnColor }}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12h14" />
                      </svg>
                    </button>

                    <b className={`text-[14px] tabular-nums ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                      {targetL} L
                    </b>

                    <button
                      type="button"
                      aria-label={isEn ? "Add" : "Tambah"}
                      onClick={() => handleAdjustTarget(100)}
                      className="w-[32px] h-[32px] rounded-full border-0 bg-transparent flex items-center justify-center p-0 cursor-pointer active:scale-90"
                      style={{ color: btnColor }}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Ukuran Minum Bawaan */}
              <div
                className="min-h-[52px] flex items-center gap-4 px-3.5 py-2 border-b"
                style={{ borderColor: cardBorder }}
              >
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                    {t("water_cup_size")}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: textSub }}>
                    {t("water_cup_size_desc")}
                  </div>
                </div>

                <div className="shrink-0 flex items-center">
                  <div role="radiogroup" className="flex gap-1.5">
                    {[150, 250, 350, 500].map((size) => {
                      const isSelected = settings.defaultCupMl === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => updateWaterSettings({ defaultCupMl: size })}
                          className="h-[28px] px-2.5 rounded-full text-[12px] font-medium cursor-pointer tabular-nums transition-colors"
                          style={{
                            border: `1px solid ${isSelected ? accent : isLightMode ? "#CBD2DC" : "#2a2a31"}`,
                            background: isSelected ? "rgba(56,189,248,0.16)" : "transparent",
                            color: isSelected ? (isLightMode ? "#0284C7" : "#7DD3FC") : isLightMode ? "#344054" : "#c4c4cc",
                          }}
                        >
                          {size === 500 ? "500 ml" : size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Row 3: Satuan */}
              <div
                className="min-h-[52px] flex items-center gap-4 px-3.5 py-2 border-b"
                style={{ borderColor: cardBorder }}
              >
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                    {t("water_unit")}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: textSub }}>
                    {t("water_unit_desc")}
                  </div>
                </div>

                <div className="shrink-0 flex items-center">
                  <div
                    role="tablist"
                    className="flex gap-0.5 p-0.5 rounded-[10px]"
                    style={{ background: isLightMode ? "#E7ECF3" : "#121216" }}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={settings.unit === "ml"}
                      onClick={() => updateWaterSettings({ unit: "ml" })}
                      className="h-[28px] px-3 border-0 rounded-[8px] text-[12px] font-medium cursor-pointer transition-colors"
                      style={{
                        background: settings.unit === "ml" ? (isLightMode ? "#FFFFFF" : "#2a2a31") : "transparent",
                        color: settings.unit === "ml" ? (isLightMode ? "#101828" : "#ffffff") : textSub,
                      }}
                    >
                      ml
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={settings.unit === "oz"}
                      onClick={() => updateWaterSettings({ unit: "oz" })}
                      className="h-[28px] px-3 border-0 rounded-[8px] text-[12px] font-medium cursor-pointer transition-colors"
                      style={{
                        background: settings.unit === "oz" ? (isLightMode ? "#FFFFFF" : "#2a2a31") : "transparent",
                        color: settings.unit === "oz" ? (isLightMode ? "#101828" : "#ffffff") : textSub,
                      }}
                    >
                      oz
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 4: Hari baru dimulai */}
              <div className="min-h-[52px] flex items-center gap-4 px-3.5 py-2">
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                    {t("water_day_starts")}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: textSub }}>
                    {t("water_day_starts_desc")}
                  </div>
                </div>

                <div className="shrink-0 flex items-center">
                  <WaterHourPicker
                    value={settings.dayStartHour}
                    onChange={(hour) => updateWaterSettings({ dayStartHour: hour })}
                    isLightMode={isLightMode}
                    ariaLabel={t("water_day_starts")}
                  />
                </div>
              </div>
            </>
          )}

          {/* =============================================================
              SUBTAB 2: PENGINGAT (Screen 48)
              ============================================================= */}
          {subTab === "reminders" && (
            <>
              {/* Row 1: Pengingat Minum Toggle */}
              <div
                className="min-h-[52px] flex items-center gap-4 px-3.5 py-2 border-b"
                style={{ borderColor: cardBorder }}
              >
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                    {t("water_reminder_notif")}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: textSub }}>
                    {t("water_reminder_notif_desc")}
                  </div>
                </div>

                <div className="shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.reminderEnabled}
                    aria-label={t("water_reminder_notif")}
                    onClick={() => updateWaterSettings({ reminderEnabled: !settings.reminderEnabled })}
                    className="w-[44px] h-[26px] rounded-full border-0 relative p-0 cursor-pointer transition-colors"
                    style={{
                      background: settings.reminderEnabled ? accent : isLightMode ? "#CBD2DC" : "#34343c",
                    }}
                  >
                    <span
                      className="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow-md transition-all"
                      style={{
                        left: settings.reminderEnabled ? "20px" : "2px",
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* Row 2: Interval */}
              <div
                className="min-h-[52px] flex items-center gap-4 px-3.5 py-2 border-b"
                style={{ borderColor: cardBorder }}
              >
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                    {t("water_interval")}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: textSub }}>
                    {t("water_interval_desc")}
                  </div>
                </div>

                <div className="shrink-0 flex items-center">
                  <div role="radiogroup" className="flex gap-1.5">
                    {[1, 1.5, 2, 3].map((val) => {
                      const isSelected = settings.reminderIntervalHours === val;
                      const label = val === 1.5 ? "1,5 j" : `${val} j`;
                      return (
                        <button
                          key={val}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => updateWaterSettings({ reminderIntervalHours: val })}
                          className="h-[28px] px-2.5 rounded-full text-[12px] font-medium cursor-pointer tabular-nums transition-colors"
                          style={{
                            border: `1px solid ${isSelected ? accent : isLightMode ? "#CBD2DC" : "#2a2a31"}`,
                            background: isSelected ? "rgba(56,189,248,0.16)" : "transparent",
                            color: isSelected ? (isLightMode ? "#0284C7" : "#7DD3FC") : isLightMode ? "#344054" : "#c4c4cc",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Row 3: Jam Aktif */}
              <div
                className="min-h-[52px] flex items-center gap-4 px-3.5 py-2 border-b"
                style={{ borderColor: cardBorder }}
              >
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                    {t("water_active_hours")}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: textSub }}>
                    {t("water_active_hours_desc")}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  <WaterHourPicker
                    value={settings.activeStartHour}
                    onChange={(hour) => updateWaterSettings({ activeStartHour: hour })}
                    isLightMode={isLightMode}
                    ariaLabel={isEn ? "Active start hour" : "Jam mulai aktif"}
                  />
                  <span className="text-[12px]" style={{ color: textSub }}>
                    {isEn ? "to" : "sampai"}
                  </span>
                  <WaterHourPicker
                    value={settings.activeEndHour}
                    onChange={(hour) => updateWaterSettings({ activeEndHour: hour })}
                    isLightMode={isLightMode}
                    ariaLabel={isEn ? "Active end hour" : "Jam selesai aktif"}
                  />
                </div>
              </div>

              {/* Row 4: Jangan Ganggu saat Fokus */}
              <div
                className="min-h-[52px] flex items-center gap-4 px-3.5 py-2 border-b"
                style={{ borderColor: cardBorder }}
              >
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                    {t("water_dnd_focus")}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: textSub }}>
                    {t("water_dnd_focus_desc")}
                  </div>
                </div>

                <div className="shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.dndFocus}
                    aria-label={isEn ? "Do not disturb during Focus" : "Jangan ganggu saat Fokus"}
                    onClick={() => updateWaterSettings({ dndFocus: !settings.dndFocus })}
                    className="w-[44px] h-[26px] rounded-full border-0 relative p-0 cursor-pointer transition-colors"
                    style={{
                      background: settings.dndFocus ? accent : isLightMode ? "#CBD2DC" : "#34343c",
                    }}
                  >
                    <span
                      className="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow-md transition-all"
                      style={{
                        left: settings.dndFocus ? "20px" : "2px",
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* Row 5: Tunda Bawaan */}
              <div className="min-h-[52px] flex items-center gap-4 px-3.5 py-2">
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                    {t("water_snooze_default")}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: textSub }}>
                    {t("water_snooze_default_desc")}
                  </div>
                </div>

                <div className="shrink-0 flex items-center">
                  <div role="radiogroup" className="flex gap-1.5">
                    {[5, 10, 15].map((val) => {
                      const isSelected = settings.snoozeDurationMinutes === val;
                      const label = val === 15 ? (isEn ? "15m" : "15 mnt") : String(val);
                      return (
                        <button
                          key={val}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => updateWaterSettings({ snoozeDurationMinutes: val })}
                          className="h-[28px] px-2.5 rounded-full text-[12px] font-medium cursor-pointer tabular-nums transition-colors"
                          style={{
                            border: `1px solid ${isSelected ? accent : isLightMode ? "#CBD2DC" : "#2a2a31"}`,
                            background: isSelected ? "rgba(56,189,248,0.16)" : "transparent",
                            color: isSelected ? (isLightMode ? "#0284C7" : "#7DD3FC") : isLightMode ? "#344054" : "#c4c4cc",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Row 6: Uji Notifikasi Notch (Live Test Preview) */}
              <div
                className="p-3.5 flex flex-col gap-2 border-t"
                style={{ borderColor: cardBorder }}
              >
                <div className="flex items-center justify-between">
                  <div className={`text-[13px] font-semibold ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                    {isEn ? "Test Notch Notification" : "Uji Notifikasi Notch"}
                  </div>
                  <span className="text-[11px]" style={{ color: textSub }}>
                    {isEn ? "Live preview of 4 notifications" : "Pratinjau langsung 4 notifikasi"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => triggerWaterToast("time_to_drink", settings.defaultCupMl)}
                    className="flex items-center gap-2 h-[32px] px-3 rounded-xl text-[12px] font-semibold cursor-pointer transition-transform active:scale-95"
                    style={{
                      background: isLightMode ? "#EBF5FB" : "rgba(56,189,248,0.12)",
                      color: accent,
                      border: `1px solid ${isLightMode ? "#BAE6FD" : "rgba(56,189,248,0.3)"}`,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3z" />
                    </svg>
                    <span>{isEn ? "Time to Drink" : "Waktunya Minum"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerWaterToast("logged", settings.defaultCupMl)}
                    className="flex items-center gap-2 h-[32px] px-3 rounded-xl text-[12px] font-semibold cursor-pointer transition-transform active:scale-95"
                    style={{
                      background: isLightMode ? "#EBF5FB" : "rgba(56,189,248,0.12)",
                      color: accent,
                      border: `1px solid ${isLightMode ? "#BAE6FD" : "rgba(56,189,248,0.3)"}`,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    <span>{isEn ? `Logged (+${settings.defaultCupMl} ml)` : `Tercatat (+${settings.defaultCupMl} ml)`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerWaterToast("streak_threatened")}
                    className="flex items-center gap-2 h-[32px] px-3 rounded-xl text-[12px] font-semibold cursor-pointer transition-transform active:scale-95"
                    style={{
                      background: isLightMode ? "#FFF7ED" : "rgba(251,146,60,0.12)",
                      color: "#FB923C",
                      border: `1px solid ${isLightMode ? "#FED7AA" : "rgba(251,146,60,0.3)"}`,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />
                    </svg>
                    <span>{isEn ? "Streak Threatened" : "Streak Terancam"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerWaterToast("streak_increased")}
                    className="flex items-center gap-2 h-[32px] px-3 rounded-xl text-[12px] font-semibold cursor-pointer transition-transform active:scale-95"
                    style={{
                      background: isLightMode ? "#FFF7ED" : "rgba(251,146,60,0.12)",
                      color: "#FB923C",
                      border: `1px solid ${isLightMode ? "#FED7AA" : "rgba(251,146,60,0.3)"}`,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.45 1-1 1H8v4h8v-4h-1c-.55 0-1-.45-1-1v-2.34M18 2H6v7a6 6 0 0 0 12 0V2z" />
                    </svg>
                    <span>{isEn ? "Streak Increased" : "Streak Bertambah"}</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* =============================================================
              SUBTAB 3: STREAK DAN DATA (Screen 49)
              ============================================================= */}
          {subTab === "streak" && (
            <>
              {/* Row 1: Ambang Streak */}
              <div className="p-3.5 pb-1 flex items-center gap-4">
                <div className="flex-1">
                  <div className={`text-[14px] font-medium ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                    {t("water_streak_threshold")}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: textSub }}>
                    {t("water_streak_threshold_desc")}
                  </div>
                </div>

                <span
                  className="inline-flex items-center gap-1.5 h-[28px] px-3 rounded-full text-[13px] font-bold tabular-nums"
                  style={{
                    background: "rgba(251,146,60,0.16)",
                    color: "#FB923C",
                  }}
                >
                  {settings.streakThresholdPercent}%{" "}
                  <span className="font-normal" style={{ color: "#e8a56d" }}>
                    {streakThresholdMl.toLocaleString(isEn ? "en-US" : "id-ID")} ml
                  </span>
                </span>
              </div>

              {/* Slider for streak threshold */}
              <div className="px-3.5 pb-3">
                <div className="relative h-[22px] flex items-center">
                  <input
                    type="range"
                    min="50"
                    max="100"
                    step="5"
                    value={settings.streakThresholdPercent}
                    onChange={(e) =>
                      updateWaterSettings({ streakThresholdPercent: Number(e.target.value) })
                    }
                    className="w-full accent-[#FB923C] cursor-pointer"
                  />
                </div>
                <div className="flex justify-between text-[10px] mt-0.5" style={{ color: textSub }}>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="border-b" style={{ borderColor: cardBorder }} />

              {/* Row 2: Pembeku Streak */}
              <div
                className="min-h-[52px] flex items-center gap-4 px-3.5 py-2 border-b"
                style={{ borderColor: cardBorder }}
              >
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                    {t("water_streak_freeze")}
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: textSub }}>
                    {t("water_streak_freeze_desc")}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <span className="text-[#7DD3FC] flex">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7" />
                    </svg>
                  </span>
                  <span className="text-zinc-600 flex">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7" />
                    </svg>
                  </span>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.autoUseFreeze}
                    aria-label={isEn ? "Use freeze automatically" : "Pakai pembeku otomatis"}
                    onClick={() => updateWaterSettings({ autoUseFreeze: !settings.autoUseFreeze })}
                    className="w-[44px] h-[26px] rounded-full border-0 relative p-0 cursor-pointer transition-colors"
                    style={{
                      background: settings.autoUseFreeze ? accent : isLightMode ? "#CBD2DC" : "#34343c",
                    }}
                  >
                    <span
                      className="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white shadow-md transition-all"
                      style={{
                        left: settings.autoUseFreeze ? "20px" : "2px",
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* Row 3: Hapus Semua Riwayat */}
              <div className="min-h-[52px] flex items-center gap-4 px-3.5 py-2">
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-medium ${isLightMode ? "text-[#101828]" : "text-white"}`}>
                    {t("water_clear_history")}
                  </div>
                  <div className="text-[12px] mt-0.5 text-[#ff9b8f]/90">
                    {t("water_clear_history_desc")}
                  </div>
                </div>

                <div className="shrink-0">
                  {showConfirmReset ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowConfirmReset(false)}
                        className="text-[11px] px-2 py-1 rounded border-0 bg-transparent cursor-pointer"
                        style={{ color: textSub }}
                      >
                        {t("action_cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          resetAllWaterData();
                          setShowConfirmReset(false);
                        }}
                        className="h-[30px] px-3 rounded-full border border-red-500 bg-red-600 text-white text-[12px] font-bold cursor-pointer"
                      >
                        {isEn ? "Confirm Delete" : "Yakin Hapus"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowConfirmReset(true)}
                      className="h-[30px] px-3 rounded-full border flex items-center gap-1.5 text-[12px] font-semibold cursor-pointer transition-colors active:scale-95"
                      style={{
                        borderColor: isLightMode ? "#ffc9c2" : "#5a2a26",
                        background: "rgba(255,107,90,0.08)",
                        color: "#ff9b8f",
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
                      </svg>
                      {isEn ? "Delete..." : "Hapus..."}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
