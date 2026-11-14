import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronDown, TrendingUp, RotateCcw } from "lucide-react";
import { t, getLanguage } from "../../../services/i18n";
import { AI_MODELS } from "../../../services/aiChatService";
import { getGiliFreeModel } from "../../../services/giliFreeService";
import {
  CurrencyCode,
  CURRENCY_CONFIGS,
  SUPPORTED_CURRENCIES,
  getActiveCurrency,
  setActiveCurrency,
  convertIdrToCurrency,
  convertCurrencyToIdr,
  formatIdrCostInCurrency,
  parseCurrencyInput,
} from "../../../services/aiCurrencyService";
import type { AiUsageStats } from "./AiChatTypes";

interface AiChatUsageViewProps {
  stats: AiUsageStats;
  onBack: () => void;
  onReset?: () => void;
  onUpdateLimit?: (limitIdr: number) => void;
  accentColor?: string;
}

export const AiChatUsageView: React.FC<AiChatUsageViewProps> = ({
  stats,
  onBack,
  onReset,
  onUpdateLimit,
  accentColor = "#3882F6",
}) => {
  const [timeRange, setTimeRange] = useState<"today" | "7d" | "30d">("7d");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInputValue, setCustomInputValue] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(() => getActiveCurrency());
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);

  useEffect(() => {
    const handleCurrencyChanged = (e: any) => {
      if (e.detail && CURRENCY_CONFIGS[e.detail as CurrencyCode]) {
        setCurrency(e.detail);
      }
    };
    window.addEventListener("island_ai_currency_changed", handleCurrencyChanged);
    return () => window.removeEventListener("island_ai_currency_changed", handleCurrencyChanged);
  }, []);

  const handleSelectCurrency = (newCode: CurrencyCode) => {
    setCurrency(newCode);
    setActiveCurrency(newCode);
    setIsCurrencyDropdownOpen(false);
  };

  const displayTokens =
    timeRange === "today"
      ? stats.todayTokens
      : timeRange === "7d"
      ? stats.sevenDaysTokens
      : stats.thirtyDaysTokens;

  const totalInOut = stats.totalInputTokens + stats.totalOutputTokens;
  const inPercent = totalInOut > 0 ? Math.round((stats.totalInputTokens / totalInOut) * 100) : 0;

  // SVG circular gauge calculations for in/out
  const radius = 25;
  const circumference = 2 * Math.PI * radius; // ~157
  const strokeDashoffset =
    totalInOut > 0 ? circumference - (inPercent / 100) * circumference : circumference;

  const currConfig = CURRENCY_CONFIGS[currency] || CURRENCY_CONFIGS.IDR;
  const presetLimits = [
    { label: t("aichat_usage_unlimited"), valueInCurrency: 0, valueIdr: 0 },
    ...currConfig.presets.map((p) => ({
      label: p.label,
      valueInCurrency: p.valueInCurrency,
      valueIdr: convertCurrencyToIdr(p.valueInCurrency, currency),
    })),
  ];

  const monthlySpentIdr = stats.estimatedCostIdr;
  const monthlyLimitIdr = typeof stats.monthlyLimitIdr === "number" ? stats.monthlyLimitIdr : 0;
  const hasLimit = monthlyLimitIdr > 0;
  const spentPercent = hasLimit ? Math.min(100, Math.round((monthlySpentIdr / monthlyLimitIdr) * 100)) : 0;
  const remainingIdr = hasLimit ? Math.max(0, monthlyLimitIdr - monthlySpentIdr) : null;

  const formattedSpent = formatIdrCostInCurrency(monthlySpentIdr, currency);
  const formattedLimit = formatIdrCostInCurrency(monthlyLimitIdr, currency);
  const formattedRemaining = remainingIdr !== null ? formatIdrCostInCurrency(remainingIdr, currency) : null;

  const isPresetSelected = (presetIdr: number) => {
    if (presetIdr === 0) return monthlyLimitIdr === 0;
    if (monthlyLimitIdr === 0) return false;
    return Math.abs(presetIdr - monthlyLimitIdr) / monthlyLimitIdr < 0.03;
  };

  const isCustomValue = hasLimit && !presetLimits.some((p) => isPresetSelected(p.valueIdr));

  const handleSelectPreset = (valueIdr: number) => {
    setShowCustomInput(false);
    onUpdateLimit?.(valueIdr);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseCurrencyInput(customInputValue, currConfig.decimals);
    if (num !== null && num >= 0) {
      const limitIdr = convertCurrencyToIdr(num, currency);
      onUpdateLimit?.(limitIdr);
      setShowCustomInput(false);
      setCustomInputValue("");
    }
  };

  const maxTotalInHistory = Math.max(...stats.dailyHistory.map((d) => d.totalTokens), 0);
  const totalModelTokens = Object.values(stats.modelBreakdown).reduce((a, b) => a + b, 0) || 1;
  const modelEntries = Object.entries(stats.modelBreakdown);

  const isEn = getLanguage() === "en";
  const numLocale = isEn ? "en-US" : "id-ID";

  const rangeLabel =
    timeRange === "today"
      ? t("aichat_usage_range_today")
      : timeRange === "7d"
      ? t("aichat_usage_range_7d")
      : t("aichat_usage_range_30d");

  return (
    <div className="grow flex flex-col justify-between w-full h-full min-h-0 select-none pt-1.5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          aria-label={t("aichat_tooltip_prev")}
          onClick={onBack}
          className="w-[32px] h-[32px] rounded-full border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <div className="text-[17px] font-semibold tracking-tight text-white">
          {t("aichat_usage_title")}
        </div>
        <div className="grow" />

        {/* Time Range Tabs & Reset */}
        <div className="flex items-center gap-1.5">
          <div
            role="tablist"
            className="flex items-center gap-0.5 h-[30px] p-0.5 rounded-full bg-[#17171c] border border-white/[0.06]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={timeRange === "today"}
              onClick={() => setTimeRange("today")}
              className={`h-[26px] px-2.5 rounded-full text-[11.5px] font-medium cursor-pointer transition-all ${
                timeRange === "today"
                  ? "bg-[#e4e4e7] text-black font-semibold shadow-sm"
                  : "text-[#a1a1aa] hover:text-white"
              }`}
            >
              {t("aichat_usage_today")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={timeRange === "7d"}
              onClick={() => setTimeRange("7d")}
              className={`h-[26px] px-2.5 rounded-full text-[11.5px] font-medium cursor-pointer transition-all ${
                timeRange === "7d"
                  ? "bg-[#e4e4e7] text-black font-semibold shadow-sm"
                  : "text-[#a1a1aa] hover:text-white"
              }`}
            >
              {t("aichat_usage_7d")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={timeRange === "30d"}
              onClick={() => setTimeRange("30d")}
              className={`h-[26px] px-2.5 rounded-full text-[11.5px] font-medium cursor-pointer transition-all ${
                timeRange === "30d"
                  ? "bg-[#e4e4e7] text-black font-semibold shadow-sm"
                  : "text-[#a1a1aa] hover:text-white"
              }`}
            >
              {t("aichat_usage_30d")}
            </button>
          </div>

          {onReset && (
            <button
              type="button"
              onClick={onReset}
              title={t("aichat_usage_reset_tooltip")}
              className="w-[30px] h-[30px] rounded-full bg-[#17171c] border border-white/[0.06] hover:bg-[#23232a] active:scale-95 text-[#71717a] hover:text-rose-400 flex items-center justify-center p-0 cursor-pointer transition-all"
            >
              <RotateCcw size={12.5} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>

      {/* Bento Grid */}
      <div className="flex gap-2.5 mt-2 grow min-h-0 overflow-hidden">
        {/* Left Card: Total Tokens & Weekly Bar Chart */}
        <div className="w-[228px] shrink-0 h-full p-3.5 rounded-[20px] border border-white/[0.08] bg-[#121216] flex flex-col justify-between shadow-md">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#a1a1aa]">
              <span
                style={{ background: accentColor }}
                className="w-1.5 h-1.5 rounded-full"
              />
              <span>
                {t("aichat_usage_token_range", { range: rangeLabel })}
              </span>
            </div>
            <div className="mt-2 text-[36px] font-bold tracking-tight leading-none text-white tabular-nums">
              {displayTokens.toLocaleString(numLocale)}
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              {displayTokens > 0 ? (
                <>
                  <span className="inline-flex items-center gap-1 h-[18px] px-2 rounded-full bg-teal-500/15 text-teal-300 text-[10.5px] font-semibold">
                    <TrendingUp size={10} strokeWidth={3} />
                    {t("aichat_usage_active_badge")}
                  </span>
                  <span className="text-[10.5px] text-[#a1a1aa] truncate">{t("aichat_usage_recorded_local")}</span>
                </>
              ) : (
                <span className="text-[10.5px] text-[#71717a]">{t("aichat_usage_no_data")}</span>
              )}
            </div>
          </div>

          {/* Daily Vertical Bars */}
          <div className="mt-auto pt-2">
            <div className="flex items-end justify-between h-[84px] px-1">
              {stats.dailyHistory.map((item, idx) => {
                const isToday = idx === stats.dailyHistory.length - 1;
                const hasTokens = item.totalTokens > 0;
                const barHeight =
                  maxTotalInHistory > 0 && hasTokens
                    ? Math.max(8, Math.min(80, Math.round((item.totalTokens / maxTotalInHistory) * 80)))
                    : 5;

                let dayLabel = item.dayLabel;
                try {
                  const d = new Date(item.date + "T00:00:00");
                  dayLabel = d.toLocaleDateString(numLocale, { weekday: "short" });
                } catch {}

                return (
                  <div
                    key={item.date}
                    title={`${dayLabel}: ${item.totalTokens.toLocaleString(numLocale)} ${isEn ? "tokens" : "token"}`}
                    style={{
                      height: `${barHeight}px`,
                      width: "19px",
                      background: isToday
                        ? hasTokens
                          ? `linear-gradient(180deg, #5eead4, ${accentColor})`
                          : "rgba(56,130,246,0.25)"
                        : hasTokens
                        ? "rgba(255,255,255,0.22)"
                        : "rgba(255,255,255,0.06)",
                      boxShadow: isToday && hasTokens ? `0 0 14px rgba(56,130,246,0.45)` : "none",
                    }}
                    className="rounded-[5px] transition-all hover:opacity-80"
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-[#a1a1aa] px-1">
              {stats.dailyHistory.map((item, idx) => {
                const isToday = idx === stats.dailyHistory.length - 1;
                let dayLabel = item.dayLabel;
                try {
                  const d = new Date(item.date + "T00:00:00");
                  dayLabel = d.toLocaleDateString(numLocale, { weekday: "short" });
                } catch {}

                return (
                  <span
                    key={item.date}
                    className={`w-5 text-center truncate ${isToday ? "text-white font-semibold" : ""}`}
                  >
                    {dayLabel}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="grow min-w-0 h-full min-h-0 flex flex-col gap-2">
          {/* Top Card: Cost & Monthly Limit */}
          <div className="px-3.5 py-2.5 rounded-[20px] border border-white/[0.08] bg-[#121216] flex flex-col justify-between shrink-0 shadow-md">
            <div className="flex items-center justify-between gap-2 relative">
              <div className="min-w-0">
                <div className="text-[10.5px] text-[#a1a1aa] leading-tight">
                  {t("aichat_usage_est_cost")}
                </div>
                <div className="mt-0.5 text-[22px] font-bold tracking-tight text-white tabular-nums leading-tight truncate">
                  ≈ {formattedSpent}
                </div>
              </div>

              {/* Currency Selector Pill */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCurrencyDropdownOpen((prev) => !prev)}
                  title={t("aichat_usage_change_currency")}
                  className="flex items-center gap-1.5 h-7 px-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.08] text-white text-[11.5px] font-semibold cursor-pointer transition-all active:scale-95 shadow-sm"
                >
                  <span className="text-blue-400 font-bold">{currConfig.symbol}</span>
                  <span className="tracking-wide">{currency}</span>
                  <ChevronDown
                    size={11}
                    className={`text-[#a1a1aa] transition-transform duration-200 ${
                      isCurrencyDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Dropdown Menu */}
                {isCurrencyDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsCurrencyDropdownOpen(false)}
                    />
                    <div className="absolute right-0 top-8 z-50 w-44 rounded-2xl bg-[#1c1c22] border border-white/[0.12] shadow-2xl p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
                      <div className="px-2 py-0.5 text-[9.5px] font-semibold text-[#71717a] uppercase tracking-wider">
                        {t("aichat_usage_currency_label")}
                      </div>
                      {SUPPORTED_CURRENCIES.map((code) => {
                        const cfg = CURRENCY_CONFIGS[code];
                        const isCurrent = code === currency;
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => handleSelectCurrency(code)}
                            className={`flex items-center justify-between px-2 py-1 rounded-lg text-[11.5px] font-medium cursor-pointer transition-all ${
                              isCurrent
                                ? "bg-blue-500/20 text-blue-300 font-semibold"
                                : "text-[#d4d4d8] hover:bg-white/[0.08] hover:text-white"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 text-center font-bold text-white/90">
                                {cfg.symbol}
                              </span>
                              <span>{code}</span>
                            </div>
                            <span className="text-[10px] text-[#71717a] font-normal truncate max-w-[72px]">
                              {cfg.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="mt-1.5">
              <div className="flex items-baseline justify-between gap-2 text-[10.5px] tabular-nums">
                <span className="text-[#a1a1aa] truncate">
                  {t("aichat_usage_monthly_limit")}
                  <span className="mx-1 text-[#52525b]">·</span>
                  <span className={hasLimit ? (spentPercent >= 100 ? "text-rose-400 font-medium" : "text-[#71717a]") : "text-emerald-400/80"}>
                    {hasLimit
                      ? spentPercent >= 100
                        ? t("aichat_usage_limit_reached")
                        : t("aichat_usage_remaining", { rem: formattedRemaining || "", pct: 100 - spentPercent })
                      : t("aichat_usage_unlimited_desc")}
                  </span>
                </span>
                <span className="shrink-0">
                  {hasLimit ? (
                    <>
                      <span className="font-semibold text-white">{formattedSpent}</span>
                      <span className="text-[#a1a1aa]"> / {formattedLimit}</span>
                    </>
                  ) : (
                    <span className="font-semibold text-emerald-400">{t("aichat_usage_unlimited")}</span>
                  )}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 mt-1 rounded-full bg-white/[0.08] overflow-hidden">
                {hasLimit ? (
                  <div
                    style={{ width: `${spentPercent}%` }}
                    className={`h-full rounded-full transition-all duration-300 ${
                      spentPercent >= 100
                        ? "bg-rose-500"
                        : "bg-gradient-to-r from-blue-500 to-teal-400"
                    }`}
                  />
                ) : (
                  <div className="h-full w-full rounded-full bg-gradient-to-r from-emerald-500/30 to-teal-500/10" />
                )}
              </div>
            </div>

            {/* Presets & Manual Limit Picker (Single Row) */}
            {onUpdateLimit && (
              <div className="mt-2 pt-2 border-t border-white/[0.06]">
                {showCustomInput ? (
                  <form onSubmit={handleCustomSubmit} className="flex items-center gap-1.5 animate-in fade-in duration-150">
                    <div className="flex items-center gap-1 px-2 h-6 rounded-lg bg-black/50 border border-white/15 focus-within:border-[#38bdf8]/70 focus-within:ring-1 focus-within:ring-[#38bdf8]/40 text-[10.5px] grow">
                      <span className="text-[#a1a1aa] text-[10px]">{currConfig.symbol}</span>
                      <input
                        type="text"
                        value={customInputValue}
                        onChange={(e) => {
                          if (currConfig.decimals > 0) {
                            const val = e.target.value.replace(/[^0-9.,]/g, "");
                            setCustomInputValue(val);
                          } else {
                            const digitsOnly = e.target.value.replace(/\D/g, "");
                            setCustomInputValue(digitsOnly ? Number(digitsOnly).toLocaleString(currConfig.locale) : "");
                          }
                        }}
                        aria-label={t("aichat_usage_custom_placeholder")}
                        placeholder={t("aichat_usage_custom_placeholder")}
                        className="bg-transparent text-white outline-none w-full tabular-nums text-[10.5px]"
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      className="h-6 px-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-semibold transition-all cursor-pointer shrink-0"
                    >
                      {t("aichat_usage_save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCustomInput(false)}
                      className="h-6 px-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[#a1a1aa] hover:text-white text-[10px] transition-all cursor-pointer shrink-0"
                    >
                      {t("aichat_usage_cancel")}
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-1 flex-nowrap overflow-x-auto no-scrollbar">
                    <span className="text-[10px] text-[#a1a1aa] font-medium mr-0.5 shrink-0">
                      {t("aichat_usage_presets_label")}
                    </span>
                    {presetLimits.map((preset) => {
                      const isSelected = isPresetSelected(preset.valueIdr);
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => handleSelectPreset(preset.valueIdr)}
                          className={`h-[20px] px-2 rounded-full text-[10px] font-medium cursor-pointer transition-all shrink-0 whitespace-nowrap ${
                            isSelected
                              ? "bg-blue-500 text-white font-semibold shadow-sm"
                              : "bg-white/[0.06] hover:bg-white/[0.12] text-[#d4d4d8]"
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setShowCustomInput(true);
                        if (isCustomValue) {
                          const valInCurr = convertIdrToCurrency(monthlyLimitIdr, currency);
                          setCustomInputValue(
                            currConfig.decimals > 0
                              ? valInCurr.toFixed(2)
                              : Math.round(valInCurr).toLocaleString(currConfig.locale)
                          );
                        }
                      }}
                      className={`h-[20px] px-2 rounded-full text-[10px] font-medium cursor-pointer transition-all shrink-0 whitespace-nowrap ${
                        isCustomValue
                          ? "bg-blue-500/25 text-blue-300 border border-blue-500/40 font-semibold"
                          : "bg-white/[0.06] hover:bg-white/[0.12] text-[#d4d4d8]"
                      }`}
                    >
                      {isCustomValue
                        ? t("aichat_usage_manual_with_val", { val: formattedLimit })
                        : t("aichat_usage_manual")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Row: In/Out vs Model Breakdown */}
          <div className="flex gap-2 grow min-h-0">
            {/* Input & Output Donut Gauge */}
            <div className="w-1/2 p-3 rounded-[20px] border border-white/[0.08] bg-[#121216] flex flex-col justify-between min-h-0 shadow-md">
              <div className="text-[11px] font-medium text-[#a1a1aa] shrink-0">
                {t("aichat_usage_in_out")}
              </div>
              <div className="flex items-center gap-3 my-auto">
                <div className="relative w-12 h-12 shrink-0">
                  <svg className="w-12 h-12 -rotate-90" viewBox="0 0 60 60">
                    <circle
                      cx="30"
                      cy="30"
                      r={radius}
                      fill="none"
                      stroke={totalInOut > 0 ? "#5eead4" : "rgba(255,255,255,0.08)"}
                      strokeWidth="6.5"
                    />
                    {totalInOut > 0 && (
                      <circle
                        cx="30"
                        cy="30"
                        r={radius}
                        fill="none"
                        stroke={accentColor}
                        strokeWidth="6.5"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white tabular-nums">
                    {inPercent}%
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-[11px] tabular-nums grow min-w-0">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span style={{ background: accentColor }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                      <span className="text-[10px] text-[#a1a1aa] truncate">{t("aichat_usage_input")}</span>
                    </div>
                    <span className="font-semibold text-white text-[11.5px] pl-3 truncate">
                      {stats.totalInputTokens.toLocaleString(numLocale)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5eead4] shrink-0" />
                      <span className="text-[10px] text-[#a1a1aa] truncate">{t("aichat_usage_output")}</span>
                    </div>
                    <span className="font-semibold text-white text-[11.5px] pl-3 truncate">
                      {stats.totalOutputTokens.toLocaleString(numLocale)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Per Model Breakdown */}
            <div className="w-1/2 p-3 rounded-[20px] border border-white/[0.08] bg-[#121216] flex flex-col min-h-0 shadow-md">
              <div className="text-[11px] font-medium text-[#a1a1aa] shrink-0 mb-1.5">
                {t("aichat_usage_per_model")}
              </div>
              {modelEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center grow text-center">
                  <span className="text-[11px] text-[#71717a]">{t("aichat_usage_no_model_data")}</span>
                  <span className="text-[10px] text-[#52525b] mt-0.5">{t("aichat_usage_start_chatting")}</span>
                </div>
              ) : (
                <div
                  data-scrollable="true"
                  className="flex flex-col gap-1.5 grow min-h-0 overflow-y-auto no-scrollbar pr-0.5"
                >
                  {modelEntries.map(([modelKey, count], i) => {
                    const pct = Math.min(100, Math.round((count / totalModelTokens) * 100));
                    const displayName =
                      modelKey === "gili-free"
                        ? getGiliFreeModel().name
                        : AI_MODELS.find((m) => m.id === modelKey)?.name || modelKey;
                    return (
                      <div key={modelKey} className="tabular-nums shrink-0">
                        <div className="flex items-baseline justify-between gap-1.5 text-[10.5px]">
                          <span className="text-[#e4e4e7] truncate min-w-0">{displayName}</span>
                          <span className="font-semibold text-white shrink-0">{count.toLocaleString(numLocale)}</span>
                        </div>
                        <div className="h-1.5 mt-0.5 rounded-full bg-white/[0.08] overflow-hidden">
                          <div
                            style={{
                              width: `${pct}%`,
                              backgroundColor: i % 2 === 0 ? accentColor : "#5eead4",
                            }}
                            className="h-full rounded-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
