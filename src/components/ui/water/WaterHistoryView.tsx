import React, { useState, useMemo } from "react";
import {
  WaterData,
  getWeeklyHistory,
  getMonthlyHistory,
  getDailyIntake,
  getLogicalDateKey,
  logDrink,
  deleteDrink,
  updateDrink,
} from "../../../services/waterService";
import { t, getLanguage } from "../../../services/i18n";
import { Tooltip } from "../Tooltip";

export interface WaterHistoryViewProps {
  data: WaterData;
  isLightMode: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
}

export const WaterHistoryView: React.FC<WaterHistoryViewProps> = ({
  data,
  isLightMode,
  onBack,
  onOpenSettings,
}) => {
  const [activeTab, setActiveTab] = useState<"week" | "month">("week");
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [monthOffset, setMonthOffset] = useState<number>(0);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const isEn = getLanguage() === "en";

  const formatVolumeL = (liters: number) => {
    const str = liters.toFixed(1);
    return isEn ? str : str.replace(".", ",");
  };

  // Manual record modal/inline form state
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualAmount, setManualAmount] = useState<number>(250);
  const [manualTime, setManualTime] = useState<string>(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });

  // Edit record state
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number>(250);

  const weekly = useMemo(() => getWeeklyHistory(weekOffset, data), [weekOffset, data]);
  const monthly = useMemo(() => getMonthlyHistory(monthOffset, data), [monthOffset, data]);

  // Selected day detail - safely parse local date without UTC offset issues
  const selectedDayDate = useMemo(() => {
    if (!selectedDayKey) return null;
    const [y, m, d] = selectedDayKey.split("-").map((v) => parseInt(v, 10));
    return new Date(y, m - 1, d, 12, 0, 0);
  }, [selectedDayKey]);

  const dailyDetail = useMemo(() => {
    if (!selectedDayDate) return null;
    return getDailyIntake(selectedDayDate, data);
  }, [selectedDayDate, data]);

  // Theming
  const accent = isLightMode ? "#0284C7" : "#38BDF8";
  const textColor = isLightMode ? "#101828" : "#ffffff";
  const textSub = isLightMode ? "#667085" : "#8a8a94";
  const cardBg = isLightMode ? "#FFFFFF" : "#121217";
  const cardBorder = isLightMode ? "#E4E7EC" : "#1e1e25";
  const btnBg = isLightMode ? "#E7ECF3" : "#17171c";
  const btnColor = isLightMode ? "#344054" : "#e4e4e7";

  const handleCreateManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAmount || manualAmount <= 0) return;

    const base = selectedDayDate ? new Date(selectedDayDate) : new Date();
    const [hh, mm] = manualTime.split(":").map((v) => parseInt(v, 10) || 0);
    base.setHours(hh, mm, 0, 0);

    logDrink(manualAmount, true, base.getTime());
    setShowAddManual(false);
  };

  const handleSaveEdit = (recordId: string) => {
    if (!dailyDetail) return;
    const target = dailyDetail.records.find((r) => r.id === recordId);
    if (target) {
      updateDrink(recordId, editAmount, target.timestamp);
    }
    setEditingRecordId(null);
  };

  /* =====================================================================
     VIEW A: DAILY DETAIL VIEW (Screen 46)
     ===================================================================== */
  if (selectedDayKey && dailyDetail && selectedDayDate) {
    const dayNames = isEn
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    const monthNames = isEn
      ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      : ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const titleDateStr = `${dayNames[selectedDayDate.getDay()]}, ${selectedDayDate.getDate()} ${
      monthNames[selectedDayDate.getMonth()]
    }`;

    const isOz = data.settings.unit === "oz";
    const currentVal = isOz
      ? (dailyDetail.totalMl / 29.5735).toFixed(1)
      : formatVolumeL(dailyDetail.totalL);
    const targetVal = isOz
      ? (dailyDetail.targetMl / 29.5735).toFixed(1)
      : formatVolumeL(dailyDetail.targetL);
    const unitLabel = isOz ? "oz" : "L";

    return (
      <div className="w-full h-full flex flex-col select-none">
        {/* Header */}
        <div className="relative flex items-center justify-between h-[34px] w-full mt-1">
          <button
            type="button"
            aria-label={isEn ? "Back to weekly chart" : "Kembali ke grafik mingguan"}
            onClick={() => setSelectedDayKey(null)}
            className="w-[34px] h-[34px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer transition-transform active:scale-95"
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
            {titleDateStr}
          </h1>

          <button
            type="button"
            aria-label={t("water_settings_title") || (isEn ? "Water Settings" : "Atur Air")}
            onClick={onOpenSettings}
            className="w-[34px] h-[34px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer transition-transform active:scale-95"
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
              <path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h11M19 18h1" />
              <circle cx="14" cy="6" r="2" />
              <circle cx="9" cy="12" r="2" />
              <circle cx="17" cy="18" r="2" />
            </svg>
          </button>
        </div>

        {/* 2-Column Layout */}
        <div className="flex gap-6 mt-3 flex-1 overflow-hidden">
          {/* Left Column: Metrics & Badges */}
          <div className="w-[236px] shrink-0 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[12px]" style={{ color: textSub }}>
                <span style={{ color: accent }}>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3z" />
                  </svg>
                </span>
                {t("water_total_today")}
              </div>

              <div className="flex items-baseline gap-2 mt-0.5">
                <span
                  className={`text-[58px] font-bold tracking-[-0.045em] leading-none tabular-nums ${
                    isLightMode ? "text-[#101828]" : "text-white"
                  }`}
                >
                  {currentVal}
                </span>
                <span className="text-[17px] font-medium" style={{ color: textSub }}>
                  / {targetVal} {unitLabel}
                </span>
              </div>

              {/* Progress Bar */}
              <div
                role="progressbar"
                aria-label={`${dailyDetail.percent} persen dari target`}
                aria-valuenow={dailyDetail.percent}
                className="h-[6px] rounded-full mt-3 overflow-hidden"
                style={{ background: isLightMode ? "#E4E7EC" : "#1d1d23" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, dailyDetail.percent)}%`,
                    backgroundColor: accent,
                  }}
                />
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {dailyDetail.isTargetAchieved && (
                  <span
                    className="inline-flex items-center gap-1 h-[24px] px-2.5 rounded-full text-[12px] font-semibold"
                    style={{
                      background: "rgba(56,189,248,0.16)",
                      color: isLightMode ? "#0284C7" : "#7DD3FC",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                    {t("water_target_achieved")}
                  </span>
                )}

                {dailyDetail.isStreakMaintained && (
                  <span
                    className="inline-flex items-center gap-1 h-[24px] px-2.5 rounded-full text-[12px] font-bold"
                    style={{
                      background: "rgba(251,146,60,0.16)",
                      color: "#FB923C",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />
                    </svg>
                    {t("water_streak_maintained")}
                  </span>
                )}
              </div>
            </div>

            {/* Bottom 2 Mini Metric Cards */}
            <div className="flex gap-2.5 mt-3 mb-1">
              <div
                className="flex-1 rounded-[14px] p-2.5"
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                }}
              >
                <div className="text-[11px]" style={{ color: textSub }}>
                  {t("water_drinks_count")}
                </div>
                <div
                  className={`text-[16px] font-bold tabular-nums mt-0.5 ${
                    isLightMode ? "text-[#101828]" : "text-white"
                  }`}
                >
                  {dailyDetail.drinkCount}{" "}
                  <span className="text-[12px] font-medium" style={{ color: textSub }}>
                    {t("water_drinks_unit")}
                  </span>
                </div>
              </div>

              <div
                className="flex-1 rounded-[14px] p-2.5"
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                }}
              >
                <div className="text-[11px]" style={{ color: textSub }}>
                  {t("water_average")}
                </div>
                <div
                  className={`text-[16px] font-bold tabular-nums mt-0.5 ${
                    isLightMode ? "text-[#101828]" : "text-white"
                  }`}
                >
                  {dailyDetail.averageDrinkMl}{" "}
                  <span className="text-[12px] font-medium" style={{ color: textSub }}>
                    ml
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Drink Logs & Manual Add */}
          <div className="flex-1 min-w-0 flex flex-col justify-between overflow-hidden">
            <div className="flex items-center justify-between h-[24px]">
              <span
                className="text-[12px] font-semibold tracking-[0.04em]"
                style={{ color: textSub }}
              >
                {t("water_drink_logs")}
              </span>

              {/* Prev / Next Day Stepper */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={isEn ? "Previous day" : "Hari sebelumnya"}
                  onClick={() => {
                    const prev = new Date(selectedDayDate);
                    prev.setDate(prev.getDate() - 1);
                    setSelectedDayKey(getLogicalDateKey(prev.getTime(), data.settings.dayStartHour));
                  }}
                  className="w-[26px] h-[26px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer active:scale-90"
                  style={{ background: btnBg, color: btnColor }}
                >
                  <svg
                    width="13"
                    height="13"
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
                  aria-label={isEn ? "Next day" : "Hari berikutnya"}
                  onClick={() => {
                    const next = new Date(selectedDayDate);
                    next.setDate(next.getDate() + 1);
                    setSelectedDayKey(getLogicalDateKey(next.getTime(), data.settings.dayStartHour));
                  }}
                  className="w-[26px] h-[26px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer active:scale-90"
                  style={{ background: btnBg, color: btnColor }}
                >
                  <svg
                    width="13"
                    height="13"
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
            </div>

            {/* Scrollable List of Drink Records */}
            <div className="flex-1 mt-1.5 overflow-y-auto pr-1 flex flex-col gap-1 min-h-[160px] max-h-[190px]">
              {dailyDetail.records.length === 0 ? (
                <div className="text-[13px] italic py-6 text-center" style={{ color: textSub }}>
                  {isEn ? "No drink logs for this day" : "Belum ada catatan minum di hari ini"}
                </div>
              ) : (
                dailyDetail.records.map((r) => {
                  const d = new Date(r.timestamp);
                  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(
                    d.getMinutes()
                  ).padStart(2, "0")}`;

                  return (
                    <div
                      key={r.id}
                      className="group h-[38px] shrink-0 rounded-[10px] px-2.5 flex items-center gap-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      style={{
                        background:
                          editingRecordId === r.id
                            ? isLightMode
                              ? "#E7ECF3"
                              : "#15151a"
                            : "transparent",
                      }}
                    >
                      <span
                        className="w-[42px] text-[13px] tabular-nums"
                        style={{ color: textSub }}
                      >
                        {timeStr}
                      </span>

                      <span style={{ color: accent }} className="shrink-0 flex">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3z" />
                        </svg>
                      </span>

                      {editingRecordId === r.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="number"
                            value={editAmount}
                            onChange={(e) => setEditAmount(Number(e.target.value))}
                            className="w-20 bg-transparent border-b border-sky-400 outline-none text-[14px] font-bold tabular-nums"
                            style={{ color: textColor }}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(r.id)}
                            className="text-[11px] px-2 py-0.5 rounded bg-sky-500 text-white border-0 cursor-pointer"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`flex-1 text-[14px] font-semibold tabular-nums ${
                            isLightMode ? "text-[#101828]" : "text-white"
                          }`}
                        >
                          {r.amountMl} ml
                        </span>
                      )}

                      {r.isManual && (
                        <span
                          className="text-[10px] font-semibold rounded-[6px] px-1.5 py-0.5 border"
                          style={{
                            borderColor: isLightMode ? "#CBD2DC" : "#34343c",
                            color: textSub,
                          }}
                        >
                          Manual
                        </span>
                      )}

                      {/* Edit / Delete Buttons on Hover */}
                      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label={isEn ? "Edit log" : "Ubah catatan"}
                          onClick={() => {
                            setEditingRecordId(r.id);
                            setEditAmount(r.amountMl);
                          }}
                          className="w-[28px] h-[28px] rounded-[8px] border-0 flex items-center justify-center p-0 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10"
                          style={{
                            background: isLightMode ? "#E7ECF3" : "#23232a",
                            color: btnColor,
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
                            <path d="M4 20h4L19 9l-4-4L4 16v4z" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          aria-label={isEn ? "Delete log" : "Hapus catatan"}
                          onClick={() => deleteDrink(r.id)}
                          className="w-[28px] h-[28px] rounded-[8px] border-0 flex items-center justify-center p-0 cursor-pointer hover:bg-red-500/20 text-[#ff9b8f]"
                          style={{ background: isLightMode ? "#E7ECF3" : "#23232a" }}
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
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Manual Add Inline Dialog */}
            {showAddManual ? (
              <form
                onSubmit={handleCreateManual}
                className="mt-2 p-2 rounded-xl flex items-center gap-2"
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                }}
              >
                <input
                  type="number"
                  min="10"
                  step="10"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(Number(e.target.value))}
                  placeholder={isEn ? "Amount ml" : "Jumlah ml"}
                  className="w-20 px-2 py-1 rounded bg-black/10 dark:bg-white/10 border-0 outline-none text-[13px] font-semibold text-center"
                  style={{ color: textColor }}
                  autoFocus
                />
                <span className="text-[12px]" style={{ color: textSub }}>
                  {isEn ? "ml at" : "ml pada"}
                </span>
                <input
                  type="time"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className="px-2 py-1 rounded bg-black/10 dark:bg-white/10 border-0 outline-none text-[13px] font-semibold"
                  style={{ color: textColor }}
                />
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setShowAddManual(false)}
                  className="px-2.5 py-1 text-[12px] bg-transparent border-0 cursor-pointer"
                  style={{ color: textSub }}
                >
                  {t("action_cancel")}
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 text-[12px] font-bold rounded-lg bg-sky-500 text-white border-0 cursor-pointer"
                >
                  {t("action_save")}
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddManual(true)}
                className="mt-2 h-[36px] rounded-[12px] border border-dashed flex items-center justify-center gap-2 text-[13px] font-medium cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:scale-98"
                style={{
                  borderColor: isLightMode ? "#B8C0CC" : "#34343c",
                  color: isLightMode ? "#344054" : "#c4c4cc",
                }}
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
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {t("water_add_manual")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* =====================================================================
     VIEW B: WEEKLY / MONTHLY CHART (Screen 45)
     ===================================================================== */
  return (
    <div className="w-full h-full flex flex-col justify-between select-none pb-7 overflow-hidden">
      {/* Top Header */}
      <div className="relative flex items-center justify-between h-[34px] w-full mt-1">
        <button
          type="button"
          aria-label={t("action_back")}
          onClick={onBack}
          className="w-[34px] h-[34px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer transition-transform active:scale-95"
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
          {t("water_weekly_title")}
        </h1>

        <button
          type="button"
          aria-label={t("water_settings_title") || (isEn ? "Water Settings" : "Atur Air")}
          onClick={onOpenSettings}
          className="w-[34px] h-[34px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer transition-transform active:scale-95"
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
            <path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h11M19 18h1" />
            <circle cx="14" cy="6" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="17" cy="18" r="2" />
          </svg>
        </button>
      </div>

      {/* Tabs Row: [ Minggu | Bulan ] & Week Nav */}
      <div className="flex items-center justify-between mt-2.5">
        <div
          role="tablist"
          className="flex gap-0.5 p-0.5 rounded-[10px]"
          style={{ background: isLightMode ? "#E7ECF3" : "#121216" }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "week"}
            onClick={() => setActiveTab("week")}
            className="h-[28px] px-3 border-0 rounded-[8px] text-[12px] font-medium cursor-pointer transition-colors"
            style={{
              background: activeTab === "week" ? (isLightMode ? "#FFFFFF" : "#2a2a31") : "transparent",
              color: activeTab === "week" ? (isLightMode ? "#101828" : "#ffffff") : textSub,
            }}
          >
            {t("water_tab_week")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "month"}
            onClick={() => setActiveTab("month")}
            className="h-[28px] px-3 border-0 rounded-[8px] text-[12px] font-medium cursor-pointer transition-colors"
            style={{
              background: activeTab === "month" ? (isLightMode ? "#FFFFFF" : "#2a2a31") : "transparent",
              color: activeTab === "month" ? (isLightMode ? "#101828" : "#ffffff") : textSub,
            }}
          >
            {t("water_tab_month")}
          </button>
        </div>

        {/* Date Stepper */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={
              activeTab === "week"
                ? (isEn ? "Previous week" : "Minggu sebelumnya")
                : (isEn ? "Previous month" : "Bulan sebelumnya")
            }
            onClick={() => {
              if (activeTab === "week") {
                setWeekOffset((v) => v - 1);
              } else {
                setMonthOffset((v) => v - 1);
              }
            }}
            className="w-[28px] h-[28px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer active:scale-90"
            style={{ background: btnBg, color: btnColor }}
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
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <span
            className={`text-[13px] font-semibold min-w-[96px] text-center tabular-nums ${
              isLightMode ? "text-[#101828]" : "text-white"
            }`}
          >
            {activeTab === "week" ? weekly.dateRangeStr : monthly.monthNameStr}
          </span>

          <button
            type="button"
            aria-label={
              activeTab === "week"
                ? (isEn ? "Next week" : "Minggu berikutnya")
                : (isEn ? "Next month" : "Bulan berikutnya")
            }
            disabled={activeTab === "week" ? weekOffset >= 0 : monthOffset >= 0}
            onClick={() => {
              if (activeTab === "week") {
                setWeekOffset((v) => Math.min(0, v + 1));
              } else {
                setMonthOffset((v) => Math.min(0, v + 1));
              }
            }}
            className={`w-[28px] h-[28px] rounded-full border-0 flex items-center justify-center p-0 ${
              (activeTab === "week" ? weekOffset >= 0 : monthOffset >= 0)
                ? "opacity-35 cursor-default"
                : "cursor-pointer active:scale-90"
            }`}
            style={{ background: btnBg, color: btnColor }}
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
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* 3 Metrics Cards */}
      <div className="flex gap-2.5 mt-2.5">
        <div
          className="flex-1 rounded-[14px] p-2.5"
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
          }}
        >
          <div className="text-[11px]" style={{ color: textSub }}>
            {t("water_daily_avg")}
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span
              className={`text-[20px] font-bold tracking-tight tabular-nums ${
                isLightMode ? "text-[#101828]" : "text-white"
              }`}
            >
              {activeTab === "week" ? weekly.dailyAverageL : monthly.dailyAverageL}
            </span>
            <span className="text-[12px]" style={{ color: textSub }}>
              L
            </span>
          </div>
        </div>

        <div
          className="flex-1 rounded-[14px] p-2.5"
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
          }}
        >
          <div className="text-[11px]" style={{ color: textSub }}>
            {t("water_target_achieved")}
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span
              className={`text-[20px] font-bold tracking-tight tabular-nums ${
                isLightMode ? "text-[#101828]" : "text-white"
              }`}
            >
              {activeTab === "week" ? weekly.targetAchievedDays : monthly.targetAchievedDays}
            </span>
            <span className="text-[12px]" style={{ color: textSub }}>
              {activeTab === "week"
                ? (isEn ? "of 7 days" : "dari 7 hari")
                : (isEn ? `of ${monthly.daysElapsed} days` : `dari ${monthly.daysElapsed} hari`)}
            </span>
          </div>
        </div>

        <div
          className="flex-1 rounded-[14px] p-2.5"
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
          }}
        >
          <div className="text-[11px]" style={{ color: textSub }}>
            {t("water_best")}
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span
              className={`text-[20px] font-bold tracking-tight tabular-nums ${
                isLightMode ? "text-[#101828]" : "text-white"
              }`}
            >
              {activeTab === "week" ? formatVolumeL(weekly.bestDay.amountL) : formatVolumeL(monthly.bestDay.amountL)}
            </span>
            <span className="text-[12px]" style={{ color: textSub }}>
              L
            </span>
            <span className="text-[11px] ml-1" style={{ color: textSub }}>
              {activeTab === "week"
                ? weekly.bestDay.dayName
                : monthly.bestDay.amountL > 0
                ? (isEn ? `Day ${monthly.bestDay.dateNum}` : `Tgl ${monthly.bestDay.dateNum}`)
                : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Chart / Calendar Container */}
      {activeTab === "week" ? (
        <div className="relative mt-3 h-[160px]">
          {/* Dashed Target Line */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 border-t-[1.5px] border-dashed pointer-events-none"
            style={{
              borderColor: "rgba(56,189,248,0.55)",
              bottom: `${Math.max(26, Math.min(132, ((weekly as any).targetHeightPx || 80) + 22))}px`,
            }}
          >
            <span
              className="absolute left-1 -top-[17px] text-[9.5px] font-bold text-sky-400 bg-[#121217]/90 px-1.5 py-0.5 rounded border border-sky-400/30 tabular-nums pointer-events-none"
            >
              Target {formatVolumeL(weekly.targetL)} L
            </span>
          </div>

          {/* Dashed Streak Threshold Line */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 border-t-[1.5px] border-dashed pointer-events-none"
            style={{
              borderColor: "rgba(251,146,60,0.55)",
              bottom: `${Math.max(26, Math.min(132, ((weekly as any).streakHeightPx || 64) + 22))}px`,
            }}
          >
            <span
              className="absolute left-1 -top-[17px] text-[9.5px] font-bold text-orange-400 bg-[#121217]/90 px-1.5 py-0.5 rounded border border-orange-400/30 tabular-nums pointer-events-none"
            >
              Streak {formatVolumeL(weekly.streakThresholdL)} L
            </span>
          </div>

          {/* 7 Bars */}
          <div className="absolute inset-x-0 top-0 h-[135px] grid grid-cols-7 gap-1">
            {weekly.days.map((day) => {
              const hasIntake = day.amountL > 0;
              return (
                <Tooltip
                  key={day.dateKey}
                  content={`${day.dayLabel} (${day.dateNum}): ${formatVolumeL(day.amountL)} L`}
                  side="top"
                  align="center"
                  delay={150}
                  wrapperClassName="w-full h-full"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDayKey(day.dateKey)}
                    className="w-full h-full flex flex-col items-center justify-end gap-1.5 bg-transparent border-0 cursor-pointer p-0 group"
                  >
                    <span
                      className={`text-[11px] font-semibold tabular-nums px-1 rounded transition-all group-hover:scale-105 ${
                        hasIntake ? (day.isToday ? "text-sky-400 font-extrabold" : isLightMode ? "text-neutral-700" : "text-white") : "opacity-0"
                      }`}
                    >
                      {formatVolumeL(day.amountL)}
                    </span>

                  {hasIntake ? (
                    <div
                      className="w-[36px] rounded-[7px] transition-all group-hover:brightness-110"
                      style={{
                        height: `${Math.max(8, day.heightPx)}px`,
                        backgroundColor: day.isTargetAchieved
                          ? accent
                          : day.isStreakMaintained
                          ? "#FB923C"
                          : accent,
                        opacity: day.isTargetAchieved || day.isStreakMaintained ? 1 : 0.65,
                      }}
                    />
                  ) : (
                    <div
                      className="w-[36px] h-[4px] rounded-full transition-all group-hover:bg-neutral-600"
                      style={{
                        backgroundColor: isLightMode ? "#CBD5E1" : "#272732",
                      }}
                    />
                  )}
                </button>
              </Tooltip>
            );
            })}
          </div>

          {/* X-Axis Labels */}
          <div className="absolute inset-x-0 bottom-0 grid grid-cols-7 text-center">
            {weekly.days.map((day) => (
              <span
                key={day.dateKey}
                className={`text-[10.5px] tracking-wider ${
                  day.isToday
                    ? isLightMode
                      ? "text-[#0284C7] font-extrabold"
                      : "text-sky-300 font-extrabold"
                    : textSub
                }`}
              >
                {day.dayLabel} {day.dateNum}
              </span>
            ))}
          </div>
        </div>
      ) : (
        /* Month Calendar View */
        <div className="relative mt-2.5 h-[165px] flex flex-col justify-between select-none">
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 pb-1 border-b border-white/5">
            {(isEn
              ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
              : ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]
            ).map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* Monthly Days Matrix */}
          <div className="grid grid-cols-7 gap-1 flex-1 pt-1.5 overflow-y-auto no-scrollbar">
            {Array.from({
              length: new Date(monthly.year, monthly.monthIndex, 1).getDay(),
            }).map((_, i) => (
              <div key={`blank-${i}`} className="h-[22px]" />
            ))}

            {monthly.days.map((day) => {
              const hasIntake = day.amountL > 0;
              const tipContent = isEn
                ? `Day ${day.dateNum} (${day.dayLabel}): ${formatVolumeL(day.amountL)} L (${day.percent}%)`
                : `Tgl ${day.dateNum} (${day.dayLabel}): ${formatVolumeL(day.amountL)} L (${day.percent}%)`;

              return (
                <Tooltip
                  key={day.dateKey}
                  content={tipContent}
                  side="top"
                  align="center"
                  delay={150}
                  wrapperClassName="w-full"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDayKey(day.dateKey)}
                    className={`w-full h-[22px] rounded-[6px] text-[10.5px] font-semibold tabular-nums border-0 flex items-center justify-center cursor-pointer transition-transform active:scale-95 ${
                      day.isToday
                        ? "ring-1 ring-cyan-400 font-extrabold"
                        : ""
                    }`}
                    style={{
                      background: day.isTargetAchieved
                        ? accent
                        : day.isStreakMaintained
                        ? "#FB923C"
                        : hasIntake
                        ? isLightMode ? "#E0F2FE" : "#0c4a6e"
                        : isLightMode ? "#F2F4F7" : "rgba(255,255,255,0.04)",
                      color: day.isTargetAchieved || day.isStreakMaintained
                        ? "#FFFFFF"
                        : hasIntake
                        ? isLightMode ? "#0284C7" : "#38BDF8"
                        : isLightMode ? "#98A2B3" : "#52525b",
                    }}
                  >
                    {day.dateNum}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend Footer */}
      <div className="flex items-center justify-center gap-5 mt-2 pb-1 text-[11px]" style={{ color: textSub }}>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="w-[10px] h-[10px] rounded-[3px] shrink-0" style={{ background: accent }} />
          <span>{t("water_target_achieved")}</span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span
            className="w-[10px] h-[10px] rounded-[3px] shrink-0"
            style={{ background: "#FB923C" }}
          />
          <span>{t("water_streak_maintained")}</span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span
            className="w-[10px] h-[10px] rounded-[3px] shrink-0 border border-sky-400 bg-sky-400/20"
          />
          <span>{t("water_today_label")}</span>
        </span>
      </div>
    </div>
  );
};
