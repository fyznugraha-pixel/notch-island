import React, { useState } from "react";
import { ChevronLeft, DollarSign, TrendingUp, RotateCcw } from "lucide-react";
import type { AiUsageStats } from "./AiChatTypes";

interface AiChatUsageViewProps {
  stats: AiUsageStats;
  onBack: () => void;
  onReset?: () => void;
  onUpdateLimit?: (limitIdr: number) => void;
  accentColor?: string;
}

const PRESET_LIMITS = [
  { label: "Tanpa Batas", value: 0 },
  { label: "10k", value: 10000 },
  { label: "20k", value: 20000 },
  { label: "30k", value: 30000 },
  { label: "50k", value: 50000 },
  { label: "100k", value: 100000 },
] as const;

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

  const monthlySpent = stats.estimatedCostIdr;
  const monthlyLimit = typeof stats.monthlyLimitIdr === "number" ? stats.monthlyLimitIdr : 0;
  const hasLimit = monthlyLimit > 0;
  const spentPercent = hasLimit ? Math.min(100, Math.round((monthlySpent / monthlyLimit) * 100)) : 0;
  const remaining = hasLimit ? Math.max(0, monthlyLimit - monthlySpent) : null;
  const isCustomValue = hasLimit && !PRESET_LIMITS.some((p) => p.value === monthlyLimit);

  const handleSelectPreset = (val: number) => {
    setShowCustomInput(false);
    onUpdateLimit?.(val);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = parseInt(customInputValue.replace(/\D/g, ""), 10);
    if (!isNaN(cleanNum)) {
      onUpdateLimit?.(cleanNum);
      setShowCustomInput(false);
      setCustomInputValue("");
    }
  };

  const maxTotalInHistory = Math.max(...stats.dailyHistory.map((d) => d.totalTokens), 0);
  const totalModelTokens = Object.values(stats.modelBreakdown).reduce((a, b) => a + b, 0) || 1;
  const modelEntries = Object.entries(stats.modelBreakdown);

  return (
    <div className="grow flex flex-col justify-between w-full h-full select-none pt-2">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          aria-label="Kembali ke AI Chat"
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-[#17171c] hover:bg-[#23232a] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <div className="text-[18px] font-semibold tracking-tight text-white">
          Penggunaan
        </div>
        <div className="grow" />

        {/* Time Range Tabs & Reset */}
        <div className="flex items-center gap-1.5">
          <div
            role="tablist"
            className="flex items-center gap-0.5 h-8 p-0.5 rounded-full bg-[#17171c]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={timeRange === "today"}
              onClick={() => setTimeRange("today")}
              className={`h-7 px-3 rounded-full text-[12px] font-medium cursor-pointer transition-all ${
                timeRange === "today"
                  ? "bg-[#e4e4e7] text-black font-semibold shadow-sm"
                  : "text-[#a1a1aa] hover:text-white"
              }`}
            >
              Hari ini
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={timeRange === "7d"}
              onClick={() => setTimeRange("7d")}
              className={`h-7 px-3 rounded-full text-[12px] font-medium cursor-pointer transition-all ${
                timeRange === "7d"
                  ? "bg-[#e4e4e7] text-black font-semibold shadow-sm"
                  : "text-[#a1a1aa] hover:text-white"
              }`}
            >
              7 hari
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={timeRange === "30d"}
              onClick={() => setTimeRange("30d")}
              className={`h-7 px-3 rounded-full text-[12px] font-medium cursor-pointer transition-all ${
                timeRange === "30d"
                  ? "bg-[#e4e4e7] text-black font-semibold shadow-sm"
                  : "text-[#a1a1aa] hover:text-white"
              }`}
            >
              30 hari
            </button>
          </div>

          {onReset && (
            <button
              type="button"
              onClick={onReset}
              title="Reset data penggunaan"
              className="w-8 h-8 rounded-full bg-[#17171c] hover:bg-[#23232a] active:scale-95 text-[#71717a] hover:text-rose-400 flex items-center justify-center p-0 cursor-pointer transition-all"
            >
              <RotateCcw size={13} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>

      {/* Bento Grid */}
      <div className="flex gap-2.5 mt-3 grow min-h-0">
        {/* Left Card: Total Tokens & Weekly Bar Chart */}
        <div className="w-[240px] shrink-0 p-4 rounded-[22px] border border-white/[0.08] bg-[#0e0e13] flex flex-col justify-between shadow-md">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#a1a1aa]">
              <span
                style={{ background: accentColor }}
                className="w-1.5 h-1.5 rounded-full"
              />
              <span>
                Token · {timeRange === "today" ? "Hari ini" : timeRange === "7d" ? "7 hari terakhir" : "30 hari terakhir"}
              </span>
            </div>
            <div className="mt-3 text-[42px] font-bold tracking-tight leading-none text-white tabular-nums bg-gradient-to-b from-white via-white to-white/60 bg-clip-text text-transparent">
              {displayTokens.toLocaleString("id-ID")}
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              {displayTokens > 0 ? (
                <>
                  <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-teal-500/15 text-teal-300 text-[11px] font-semibold">
                    <TrendingUp size={10} strokeWidth={3} />
                    Aktif
                  </span>
                  <span className="text-[11px] text-[#a1a1aa]">tercatat lokal</span>
                </>
              ) : (
                <span className="text-[11px] text-[#71717a]">Belum ada penggunaan</span>
              )}
            </div>
          </div>

          {/* Daily Vertical Bars */}
          <div>
            <div className="flex items-end justify-between h-[100px] px-1">
              {stats.dailyHistory.map((item, idx) => {
                const isToday = idx === stats.dailyHistory.length - 1;
                const hasTokens = item.totalTokens > 0;
                const barHeight =
                  maxTotalInHistory > 0 && hasTokens
                    ? Math.max(8, Math.min(95, Math.round((item.totalTokens / maxTotalInHistory) * 95)))
                    : 6;

                return (
                  <div
                    key={item.date}
                    title={`${item.dayLabel}: ${item.totalTokens.toLocaleString("id-ID")} token`}
                    style={{
                      height: `${barHeight}px`,
                      width: "20px",
                      background: isToday
                        ? hasTokens
                          ? `linear-gradient(180deg, #5eead4, ${accentColor})`
                          : "rgba(56,130,246,0.25)"
                        : hasTokens
                        ? "rgba(255,255,255,0.22)"
                        : "rgba(255,255,255,0.06)",
                      boxShadow: isToday && hasTokens ? `0 0 16px rgba(56,130,246,0.5)` : "none",
                    }}
                    className="rounded-[6px] transition-all hover:opacity-80"
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-1.5 text-[10.5px] text-[#a1a1aa] px-1">
              {stats.dailyHistory.map((item, idx) => {
                const isToday = idx === stats.dailyHistory.length - 1;
                return (
                  <span
                    key={item.date}
                    className={`w-5 text-center ${isToday ? "text-white font-semibold" : ""}`}
                  >
                    {item.dayLabel}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="grow min-w-0 flex flex-col gap-2.5">
          {/* Top Card: Cost & Monthly Limit */}
          <div className="p-3.5 rounded-[20px] border border-white/[0.08] bg-white/[0.04] flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11px] text-[#a1a1aa]">
                  Perkiraan biaya · Akumulasi
                </div>
                <div className="mt-1 text-[26px] font-bold tracking-tight text-white tabular-nums">
                  ≈ Rp {stats.estimatedCostIdr.toLocaleString("id-ID")}
                </div>
              </div>
              <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                <DollarSign size={16} strokeWidth={2.2} />
              </div>
            </div>

            <div className="mt-2.5">
              <div className="flex items-baseline justify-between text-[11px] tabular-nums">
                <span className="text-[#a1a1aa]">Batas bulanan</span>
                <span>
                  {hasLimit ? (
                    <>
                      <span className="font-semibold text-white">Rp {monthlySpent.toLocaleString("id-ID")}</span>
                      <span className="text-[#a1a1aa]"> / Rp {monthlyLimit.toLocaleString("id-ID")}</span>
                    </>
                  ) : (
                    <span className="font-semibold text-emerald-400">Tanpa Batas</span>
                  )}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 mt-1.5 rounded-full bg-white/[0.08] overflow-hidden">
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

              <div className="text-[10.5px] mt-1 tabular-nums flex items-center justify-between">
                <span className={hasLimit ? (spentPercent >= 100 ? "text-rose-400 font-medium" : "text-[#a1a1aa]") : "text-emerald-400/90 font-medium"}>
                  {hasLimit
                    ? spentPercent >= 100
                      ? "Batas bulanan telah tercapai"
                      : `Sisa Rp ${(remaining ?? 0).toLocaleString("id-ID")} bulan ini (${100 - spentPercent}%)`
                    : "Penggunaan bebas tanpa batas kuota"}
                </span>
              </div>
            </div>

            {/* Presets & Manual Limit Picker */}
            {onUpdateLimit && (
              <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-[#a1a1aa] font-medium mr-0.5">Batas:</span>
                  {PRESET_LIMITS.map((preset) => {
                    const isSelected = monthlyLimit === preset.value;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleSelectPreset(preset.value)}
                        className={`h-5 px-2 rounded-full text-[10px] font-medium cursor-pointer transition-all ${
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
                      setShowCustomInput((prev) => !prev);
                      if (!showCustomInput && isCustomValue) {
                        setCustomInputValue(String(monthlyLimit));
                      }
                    }}
                    className={`h-5 px-2 rounded-full text-[10px] font-medium cursor-pointer transition-all ${
                      isCustomValue || showCustomInput
                        ? "bg-blue-500/25 text-blue-300 border border-blue-500/40 font-semibold"
                        : "bg-white/[0.06] hover:bg-white/[0.12] text-[#d4d4d8]"
                    }`}
                  >
                    {isCustomValue ? `Manual (Rp ${monthlyLimit.toLocaleString("id-ID")})` : "Manual"}
                  </button>
                </div>

                {showCustomInput && (
                  <form onSubmit={handleCustomSubmit} className="flex items-center gap-1.5 mt-1 animate-in fade-in duration-150">
                    <div className="flex items-center gap-1 px-2.5 h-6.5 rounded-lg bg-black/50 border border-white/15 text-[11px] grow">
                      <span className="text-[#a1a1aa] text-[10.5px]">Rp</span>
                      <input
                        type="text"
                        value={customInputValue}
                        onChange={(e) => {
                          const digitsOnly = e.target.value.replace(/\D/g, "");
                          setCustomInputValue(digitsOnly ? Number(digitsOnly).toLocaleString("id-ID") : "");
                        }}
                        placeholder="Contoh: 75.000 (0 = Bebas)"
                        className="bg-transparent text-white outline-none w-full tabular-nums text-[10.5px]"
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      className="h-6.5 px-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[10.5px] font-medium transition-all cursor-pointer shrink-0"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCustomInput(false)}
                      className="h-6.5 px-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[#a1a1aa] hover:text-white text-[10.5px] transition-all cursor-pointer shrink-0"
                    >
                      Batal
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Bottom Row: In/Out vs Model Breakdown */}
          <div className="flex gap-2.5 grow">
            {/* Input & Output Donut Gauge */}
            <div className="w-1/2 p-3 rounded-[20px] border border-white/[0.08] bg-white/[0.04] flex flex-col justify-between">
              <div className="text-[11px] text-[#a1a1aa]">Masuk dan keluar</div>
              <div className="relative w-14 h-14 mx-auto my-1">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 60 60">
                  <circle
                    cx="30"
                    cy="30"
                    r={radius}
                    fill="none"
                    stroke={totalInOut > 0 ? "#5eead4" : "rgba(255,255,255,0.08)"}
                    strokeWidth="6"
                  />
                  {totalInOut > 0 && (
                    <circle
                      cx="30"
                      cy="30"
                      r={radius}
                      fill="none"
                      stroke={accentColor}
                      strokeWidth="6"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-white tabular-nums">
                  {inPercent}%
                </div>
              </div>
              <div className="flex flex-col gap-0.5 text-[11px] tabular-nums">
                <div className="flex items-center gap-1.5">
                  <span style={{ background: accentColor }} className="w-1.5 h-1.5 rounded-full" />
                  <span className="text-[#a1a1aa] grow">Masuk</span>
                  <span className="font-semibold text-white">{stats.totalInputTokens.toLocaleString("id-ID")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5eead4]" />
                  <span className="text-[#a1a1aa] grow">Keluar</span>
                  <span className="font-semibold text-white">{stats.totalOutputTokens.toLocaleString("id-ID")}</span>
                </div>
              </div>
            </div>

            {/* Per Model Breakdown */}
            <div className="w-1/2 p-3 rounded-[20px] border border-white/[0.08] bg-white/[0.04] flex flex-col justify-between">
              <div className="text-[11px] text-[#a1a1aa]">Per model</div>
              {modelEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <span className="text-[11px] text-[#71717a]">Belum ada data model</span>
                  <span className="text-[10px] text-[#52525b] mt-0.5">Mulai chat untuk mencatat</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2 mt-1 overflow-y-auto max-h-[85px] settings-scroll pr-1">
                  {modelEntries.map(([name, count], i) => {
                    const pct = Math.min(100, Math.round((count / totalModelTokens) * 100));
                    return (
                      <div key={name} className="tabular-nums">
                        <div className="flex items-baseline justify-between text-[11px]">
                          <span className="text-[#e4e4e7] truncate max-w-[90px]">{name}</span>
                          <span className="font-semibold text-white">{count.toLocaleString("id-ID")}</span>
                        </div>
                        <div className="h-1.5 mt-1 rounded-full bg-white/[0.08] overflow-hidden">
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
