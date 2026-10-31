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
      <div className="w-full h-full flex flex-col select-none pb-1 overflow-hidden">
        {/* Header */}
        <div className="relative flex items-center justify-between h-[26px] w-full shrink-0">
          <button
            type="button"
            aria-label={isEn ? "Back to weekly chart" : "Kembali ke grafik mingguan"}
            onClick={() => setSelectedDayKey(null)}
            className="w-[26px] h-[26px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer transition-transform active:scale-95"
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

          <h1
            className="m-0 absolute inset-x-0 text-center text-[14.5px] font-semibold tracking-[-0.01em] pointer-events-none"
            style={{ color: textColor }}
          >
            {titleDateStr}
          </h1>

          <button
            type="button"
            aria-label={t("water_settings_title") || (isEn ? "Water Settings" : "Atur Air")}
            onClick={onOpenSettings}
            className="w-[26px] h-[26px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer transition-transform active:scale-95"
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
              <path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h11M19 18h1" />
              <circle cx="14" cy="6" r="2" />
              <circle cx="9" cy="12" r="2" />
              <circle cx="17" cy="18" r="2" />
            </svg>
          </button>
        </div>

        {/* 2-Column Layout */}
        <div className="flex gap-4 mt-1.5 flex-1 min-h-0 overflow-hidden">
          {/* Left Column: Metrics & Badges */}
          <div className="w-[224px] shrink-0 flex flex-col justify-between min-h-0">
            <div>
              <div className="flex items-center justify-between gap-1 text-[11px]" style={{ color: textSub }}>
                <span className="flex items-center gap-1">
                  <span style={{ color: accent }}>
                    <svg
                      width="12"
                      height="12"
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
                </span>
                <div className="flex items-center gap-1">
                  {dailyDetail.isTargetAchieved && (
                    <span
                      className="inline-flex items-center gap-0.5 h-[18px] px-1.5 rounded-full text-[10px] font-semibold"
                      style={{
                        background: "rgba(56,189,248,0.16)",
                        color: isLightMode ? "#0284C7" : "#7DD3FC",
                      }}
                    >
                      ✓
                    </span>
                  )}
                  {dailyDetail.isStreakMaintained && (
                    <span
                      className="inline-flex items-center gap-0.5 h-[18px] px-1.5 rounded-full text-[10px] font-bold"
                      style={{
                        background: "rgba(251,146,60,0.16)",
                        color: "#FB923C",
                      }}
                    >
                      🔥
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span
                  className={`text-[36px] font-bold tracking-[-0.045em] leading-none tabular-nums ${
                    isLightMode ? "text-[#101828]" : "text-white"
                  }`}
                >
                  {currentVal}
                </span>
                <span className="text-[14px] font-medium" style={{ color: textSub }}>
                  / {targetVal} {unitLabel}
                </span>
              </div>

              {/* Progress Bar */}
              <div
                role="progressbar"
                aria-label={`${dailyDetail.percent} persen dari target`}
                aria-valuenow={dailyDetail.percent}
                className="h-[5px] rounded-full mt-1.5 overflow-hidden"
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
            </div>

            {/* Bottom 2 Mini Metric Cards */}
            <div className="flex gap-2 mt-1.5">
              <div
                className="flex-1 rounded-[11px] p-1.5 px-2"
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                }}
              >
                <div className="text-[10px]" style={{ color: textSub }}>
                  {t("water_drinks_count")}
                </div>
                <div
                  className={`text-[13.5px] font-bold tabular-nums ${
                    isLightMode ? "text-[#101828]" : "text-white"
                  }`}
                >
                  {dailyDetail.drinkCount}{" "}
                  <span className="text-[10.5px] font-medium" style={{ color: textSub }}>
                    {t("water_drinks_unit")}
                  </span>
                </div>
              </div>

              <div
                className="flex-1 rounded-[11px] p-1.5 px-2"
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                }}
              >
                <div className="text-[10px]" style={{ color: textSub }}>
                  {t("water_average")}
                </div>
                <div
                  className={`text-[13.5px] font-bold tabular-nums ${
                    isLightMode ? "text-[#101828]" : "text-white"
                  }`}
                >
                  {dailyDetail.averageDrinkMl}{" "}
                  <span className="text-[10.5px] font-medium" style={{ color: textSub }}>
                    ml
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Drink Logs & Manual Add */}
          <div className="flex-1 min-w-0 flex flex-col justify-between min-h-0 overflow-hidden">
            <div className="flex items-center justify-between h-[22px] shrink-0">
              <span
                className="text-[11px] font-semibold tracking-[0.04em]"
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
                  className="w-[22px] h-[22px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer active:scale-90"
                  style={{ background: btnBg, color: btnColor }}
                >
                  <svg
                    width="12"
                    height="12"
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
                  className="w-[22px] h-[22px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer active:scale-90"
                  style={{ background: btnBg, color: btnColor }}
                >
                  <svg
                    width="12"
                    height="12"
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
            <div className="flex-1 mt-1 overflow-y-auto no-scrollbar pr-1 flex flex-col gap-1 min-h-0">
              {dailyDetail.records.length === 0 ? (
                <div className="text-[12px] italic py-4 text-center" style={{ color: textSub }}>
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
                      className="group h-[30px] shrink-0 rounded-[8px] px-2 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
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
                        className="w-[38px] text-[12px] tabular-nums"
                        style={{ color: textSub }}
                      >
                        {timeStr}
                      </span>

                      <span style={{ color: accent }} className="shrink-0 flex">
                        <svg
                          width="12"
                          height="12"
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
                            className="w-16 bg-transparent border-b border-sky-400 outline-none text-[12.5px] font-bold tabular-nums"
                            style={{ color: textColor }}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(r.id)}
                            className="text-[10.5px] px-1.5 py-0.5 rounded bg-sky-500 text-white border-0 cursor-pointer"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`flex-1 text-[12.5px] font-semibold tabular-nums ${
                            isLightMode ? "text-[#101828]" : "text-white"
                          }`}
                        >
                          {r.amountMl} ml
                        </span>
                      )}

                      {r.isManual && (
                        <span
                          className="text-[9.5px] font-semibold rounded-[5px] px-1 py-0.5 border"
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
                          className="w-[24px] h-[24px] rounded-[6px] border-0 flex items-center justify-center p-0 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10"
                          style={{
                            background: isLightMode ? "#E7ECF3" : "#23232a",
                            color: btnColor,
                          }}
                        >
                          <svg
                            width="12"
                            height="12"
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
                          className="w-[24px] h-[24px] rounded-[6px] border-0 flex items-center justify-center p-0 cursor-pointer hover:bg-red-500/20 text-[#ff9b8f]"
                          style={{ background: isLightMode ? "#E7ECF3" : "#23232a" }}
                        >
                          <svg
                            width="12"
                            height="12"
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
                className="mt-1 p-1.5 rounded-xl flex items-center gap-1.5 shrink-0"
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
                  className="w-16 px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 border-0 outline-none text-[12px] font-semibold text-center"
                  style={{ color: textColor }}
                  autoFocus
                />
                <span className="text-[11px]" style={{ color: textSub }}>
                  {isEn ? "ml at" : "ml pd"}
                </span>
                <input
                  type="time"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 border-0 outline-none text-[12px] font-semibold"
                  style={{ color: textColor }}
                />
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setShowAddManual(false)}
                  className="px-2 py-0.5 text-[11px] bg-transparent border-0 cursor-pointer"
                  style={{ color: textSub }}
                >
                  {t("action_cancel")}
                </button>
                <button
                  type="submit"
                  className="px-2.5 py-0.5 text-[11px] font-bold rounded-lg bg-sky-500 text-white border-0 cursor-pointer"
                >
                  {t("action_save")}
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddManual(true)}
                className="mt-1 h-[28px] shrink-0 rounded-[10px] border border-dashed flex items-center justify-center gap-1.5 text-[11.5px] font-medium cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:scale-98"
                style={{
                  borderColor: isLightMode ? "#B8C0CC" : "#34343c",
                  color: isLightMode ? "#344054" : "#c4c4cc",
                }}
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
    <div className="w-full h-full flex flex-col justify-between select-none pb-1 overflow-hidden">
      {/* Top Header with Tabs & Date Stepper */}
      <div className="flex items-center justify-between h-[26px] w-full shrink-0 gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t("action_back")}
            onClick={onBack}
            className="w-[26px] h-[26px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer transition-transform active:scale-95"
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

          <div
            role="tablist"
            className="flex gap-0.5 p-0.5 rounded-[8px]"
            style={{ background: isLightMode ? "#E7ECF3" : "#121216" }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "week"}
              onClick={() => setActiveTab("week")}
              className="h-[22px] px-2.5 border-0 rounded-[6px] text-[11px] font-medium cursor-pointer transition-colors"
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
              className="h-[22px] px-2.5 border-0 rounded-[6px] text-[11px] font-medium cursor-pointer transition-colors"
              style={{
                background: activeTab === "month" ? (isLightMode ? "#FFFFFF" : "#2a2a31") : "transparent",
                color: activeTab === "month" ? (isLightMode ? "#101828" : "#ffffff") : textSub,
              }}
            >
              {t("water_tab_month")}
            </button>
          </div>
        </div>

        {/* Date Stepper + Settings Button */}
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
            className="w-[24px] h-[24px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer active:scale-90"
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

          <span
            className={`text-[12px] font-semibold min-w-[88px] text-center tabular-nums ${
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
            className={`w-[24px] h-[24px] rounded-full border-0 flex items-center justify-center p-0 ${
              (activeTab === "week" ? weekOffset >= 0 : monthOffset >= 0)
                ? "opacity-35 cursor-default"
                : "cursor-pointer active:scale-90"
            }`}
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

          <button
            type="button"
            aria-label={t("water_settings_title") || (isEn ? "Water Settings" : "Atur Air")}
            onClick={onOpenSettings}
            className="w-[26px] h-[26px] rounded-full border-0 flex items-center justify-center p-0 cursor-pointer transition-transform active:scale-95 ml-1"
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
              <path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h11M19 18h1" />
              <circle cx="14" cy="6" r="2" />
              <circle cx="9" cy="12" r="2" />
              <circle cx="17" cy="18" r="2" />
            </svg>
          </button>
        </div>
      </div>

      {/* 2-Column Body: Left Metrics & Legend, Right Chart/Calendar */}
      <div className="flex gap-4 mt-1.5 flex-1 min-h-0">
        {/* Left Column: 3 Metrics Cards + Legend */}
        <div className="w-[186px] shrink-0 flex flex-col justify-between gap-1">
          <div className="flex flex-col gap-1">
            <div
              className="rounded-[10px] px-2.5 py-1 flex items-center justify-between"
              style={{
                background: cardBg,
                border: `1px solid ${cardBorder}`,
              }}
            >
              <span className="text-[10.5px]" style={{ color: textSub }}>
                {t("water_daily_avg")}
              </span>
              <div className="flex items-baseline gap-0.5">
                <span
                  className={`text-[14px] font-bold tracking-tight tabular-nums ${
                    isLightMode ? "text-[#101828]" : "text-white"
                  }`}
                >
                  {activeTab === "week" ? weekly.dailyAverageL : monthly.dailyAverageL}
                </span>
                <span className="text-[10.5px]" style={{ color: textSub }}>
                  L
                </span>
              </div>
            </div>

            <div
              className="rounded-[10px] px-2.5 py-1 flex items-center justify-between"
              style={{
                background: cardBg,
                border: `1px solid ${cardBorder}`,
              }}
            >
              <span className="text-[10.5px]" style={{ color: textSub }}>
                {t("water_target_achieved")}
              </span>
              <div className="flex items-baseline gap-1">
                <span
                  className={`text-[14px] font-bold tracking-tight tabular-nums ${
                    isLightMode ? "text-[#101828]" : "text-white"
                  }`}
                >
                  {activeTab === "week" ? weekly.targetAchievedDays : monthly.targetAchievedDays}
                </span>
                <span className="text-[10px]" style={{ color: textSub }}>
                  /{activeTab === "week" ? "7" : monthly.daysElapsed}d
                </span>
              </div>
            </div>

            <div
              className="rounded-[10px] px-2.5 py-1 flex items-center justify-between"
              style={{
                background: cardBg,
                border: `1px solid ${cardBorder}`,
              }}
            >
              <span className="text-[10.5px]" style={{ color: textSub }}>
                {t("water_best")}
              </span>
              <div className="flex items-baseline gap-0.5">
                <span
                  className={`text-[14px] font-bold tracking-tight tabular-nums ${
                    isLightMode ? "text-[#101828]" : "text-white"
                  }`}
                >
                  {activeTab === "week" ? formatVolumeL(weekly.bestDay.amountL) : formatVolumeL(monthly.bestDay.amountL)}
                </span>
                <span className="text-[10.5px]" style={{ color: textSub }}>
                  L
                </span>
              </div>
            </div>
          </div>

          {/* Compact Legend */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[9.5px] px-0.5" style={{ color: textSub }}>
            <span className="flex items-center gap-1 shrink-0">
              <span className="w-[7px] h-[7px] rounded-[2px] shrink-0" style={{ background: accent }} />
              <span>{t("water_target_achieved")}</span>
            </span>
            <span className="flex items-center gap-1 shrink-0">
              <span className="w-[7px] h-[7px] rounded-[2px] shrink-0" style={{ background: "#FB923C" }} />
              <span>{t("water_streak_maintained")}</span>
            </span>
          </div>
        </div>

        {/* Right Column: Chart / Calendar Container */}
        <div className="flex-1 min-w-0 flex flex-col justify-between min-h-0">
          {activeTab === "week" ? (
            <div className="relative h-full w-full">
              {/* Dashed Target Line */}
              <div
                aria-hidden="true"
                className="absolute inset-x-0 border-t-[1.5px] border-dashed pointer-events-none"
                style={{
                  borderColor: "rgba(56,189,248,0.55)",
                  bottom: `${Math.max(22, Math.min(118, Math.round(((weekly as any).targetHeightPx || 80) * 0.82) + 18))}px`,
                }}
              >
                <span
                  className="absolute left-1 -top-[15px] text-[9px] font-bold text-sky-400 bg-[#121217]/90 px-1 py-0.2 rounded border border-sky-400/30 tabular-nums pointer-events-none"
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
                  bottom: `${Math.max(22, Math.min(118, Math.round(((weekly as any).streakHeightPx || 64) * 0.82) + 18))}px`,
                }}
              >
                <span
                  className="absolute right-1 -top-[15px] text-[9px] font-bold text-orange-400 bg-[#121217]/90 px-1 py-0.2 rounded border border-orange-400/30 tabular-nums pointer-events-none"
                >
                  Streak {formatVolumeL(weekly.streakThresholdL)} L
                </span>
              </div>

              {/* 7 Bars */}
              <div className="absolute inset-x-0 top-0 bottom-[18px] grid grid-cols-7 gap-1">
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
                        className="w-full h-full flex flex-col items-center justify-end gap-1 bg-transparent border-0 cursor-pointer p-0 group"
                      >
                        <span
                          className={`text-[10px] font-semibold tabular-nums px-0.5 rounded transition-all group-hover:scale-105 ${
                            hasIntake ? (day.isToday ? "text-sky-400 font-extrabold" : isLightMode ? "text-neutral-700" : "text-white") : "opacity-0"
                          }`}
                        >
                          {formatVolumeL(day.amountL)}
                        </span>

                        {hasIntake ? (
                          <div
                            className="w-[30px] rounded-[6px] transition-all group-hover:brightness-110"
                            style={{
                              height: `${Math.max(6, Math.round(day.heightPx * 0.82))}px`,
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
                            className="w-[30px] h-[4px] rounded-full transition-all group-hover:bg-neutral-600"
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
                    className={`text-[9.5px] tracking-wider ${
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
            <div className="relative h-full w-full flex flex-col justify-between select-none">
              <div className="grid grid-cols-7 text-center text-[9.5px] font-semibold text-neutral-400 dark:text-neutral-500 pb-0.5 border-b border-white/5 shrink-0">
                {(isEn
                  ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
                  : ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]
                ).map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 flex-1 pt-1 overflow-y-auto no-scrollbar">
                {Array.from({
                  length: new Date(monthly.year, monthly.monthIndex, 1).getDay(),
                }).map((_, i) => (
                  <div key={`blank-${i}`} className="h-[19px]" />
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
                        className={`w-full h-[19px] rounded-[5px] text-[10px] font-semibold tabular-nums border-0 flex items-center justify-center cursor-pointer transition-transform active:scale-95 ${
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
        </div>
      </div>
    </div>
  );
};
