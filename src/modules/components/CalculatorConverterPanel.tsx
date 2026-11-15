import React, { useMemo } from "react";
import { ArrowLeftRight, Check, Coins, Copy, RefreshCw, Ruler, Scale, Thermometer, X } from "lucide-react";
import {
  CurrencyRatesResponse,
  SUPPORTED_CURRENCIES,
  convertCurrency,
} from "../../services/currencyService";
import {
  UNIT_CONVERSIONS,
  UnitCategory,
  convertTemperature,
  convertUnitValue,
} from "../../utils/calculatorUtils";
import { copyTextToClipboard } from "../../utils/clipboard";
import { TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { dateLocale, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";
import { NavbarConfig } from "../../types/navbar";
import { useNavbarIsLightSurface } from "./NavbarPopoverShell";

function formatLocalizedNumber(val: number, locale: string): string {
  if (!Number.isFinite(val)) return "Error";
  if (Math.abs(val) < 1e-12) return "0";
  const rounded = Math.round(val * 1e6) / 1e6;
  return rounded.toLocaleString(locale, { maximumFractionDigits: 6 });
}

interface CalculatorConverterPanelProps {
  config?: NavbarConfig;
  convInputRef: React.RefObject<HTMLInputElement | null>;
  convCategory: UnitCategory;
  setConvCategory: (cat: UnitCategory) => void;
  convAmount: string;
  setConvAmount: (val: string) => void;
  currFrom: string;
  setCurrFrom: (val: string) => void;
  currTo: string;
  setCurrTo: (val: string) => void;
  ratesData: CurrencyRatesResponse;
  isRefreshingRates: boolean;
  onRefreshRates: () => void;
  unitFrom: string;
  setUnitFrom: (val: string) => void;
  unitTo: string;
  setUnitTo: (val: string) => void;
  tempFrom: "C" | "F";
  setTempFrom: (val: "C" | "F") => void;
  tempTo: "C" | "F";
  setTempTo: (val: "C" | "F") => void;
  copiedConv: boolean;
  onCopiedConv: () => void;
}

export const CalculatorConverterPanel: React.FC<CalculatorConverterPanelProps> = ({
  config,
  convInputRef,
  convCategory,
  setConvCategory,
  convAmount,
  setConvAmount,
  currFrom,
  setCurrFrom,
  currTo,
  setCurrTo,
  ratesData,
  isRefreshingRates,
  onRefreshRates,
  unitFrom,
  setUnitFrom,
  unitTo,
  setUnitTo,
  tempFrom,
  setTempFrom,
  tempTo,
  setTempTo,
  copiedConv,
  onCopiedConv,
}) => {
  const lang = useTaskbarLang();
  const locale = dateLocale(lang);
  const isLight = useNavbarIsLightSurface(config);
  const optionClass = isLight ? "bg-white text-zinc-900" : "bg-[#1a1a24] text-white";

  const convResult = useMemo(() => {
    const amt = Number(convAmount);
    if (!convAmount.trim() || !Number.isFinite(amt)) return "-";
    if (convCategory === "currency") {
      const converted = convertCurrency(amt, currFrom, currTo, ratesData.rates);
      return currTo === "IDR"
        ? `Rp ${Math.round(converted).toLocaleString(locale)}`
        : `${formatLocalizedNumber(converted, locale)} ${currTo}`;
    }
    if (convCategory === "temp") {
      return `${formatLocalizedNumber(convertTemperature(amt, tempFrom, tempTo), locale)} °${tempTo}`;
    }
    return `${formatLocalizedNumber(convertUnitValue(amt, unitFrom, unitTo, convCategory), locale)} ${unitTo}`;
  }, [convAmount, convCategory, currFrom, currTo, ratesData.rates, unitFrom, unitTo, tempFrom, tempTo, locale]);

  const handleCategorySwitch = (cat: UnitCategory) => {
    setConvCategory(cat);
    if (cat === "length") {
      setUnitFrom("km");
      setUnitTo("m");
    } else if (cat === "weight") {
      setUnitFrom("kg");
      setUnitTo("g");
    }
  };

  const handleCopy = async () => {
    if (convResult === "-") return;
    if (await copyTextToClipboard(convResult)) {
      onCopiedConv();
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        {[
          { id: "currency", label: tx(lang, "Currency", "Kurs"), icon: Coins },
          { id: "length", label: tx(lang, "Length", "Panjang"), icon: Ruler },
          { id: "weight", label: tx(lang, "Weight", "Berat"), icon: Scale },
          { id: "temp", label: tx(lang, "Temp", "Suhu"), icon: Thermometer },
        ].map((cat) => {
          const Icon = cat.icon;
          const isSelected = convCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategorySwitch(cat.id as UnitCategory)}
              className={`flex-1 min-w-0 px-1 py-1 rounded-[6px] text-[10px] font-medium cursor-pointer transition-all flex items-center justify-center gap-1 ${TRIGGER_FOCUS_RING} ${
                isSelected
                  ? "bg-white/20 text-white font-semibold"
                  : "text-zinc-300 hover:text-white bg-white/[0.05]"
              }`}
            >
              <Icon size={11} className={`shrink-0 ${isSelected ? "text-[#38bdf8]" : "text-zinc-300"}`} />
              <span className="truncate">{cat.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-2">
        <label className="text-[10px] text-zinc-300 block mb-1">
          {tx(lang, "Amount:", "Jumlah:")}
        </label>
        <div className="relative">
          <input
            ref={convInputRef}
            type="number"
            step="any"
            value={convAmount}
            onChange={(e) => setConvAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") e.stopPropagation();
            }}
            className={`w-full h-7 pl-2.5 pr-6 rounded-[8px] border focus:border-[#0a84ff] text-[12px] font-mono outline-none ${TRIGGER_FOCUS_RING} ${
              isLight
                ? "bg-black/[0.05] border-black/15 text-zinc-900 placeholder-zinc-500"
                : "bg-black/60 border-white/15 text-white placeholder-zinc-500"
            }`}
            placeholder={tx(lang, "Enter amount...", "Masukkan angka...")}
          />
          {convAmount && (
            <Tooltip content={tx(lang, "Clear amount", "Hapus jumlah")} side="top" isLightMode={isLight}>
              <button
                type="button"
                onClick={() => setConvAmount("")}
                aria-label={tx(lang, "Clear amount", "Hapus jumlah")}
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer ${TRIGGER_FOCUS_RING}`}
              >
                <X size={11} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {convCategory === "currency" && (
        <>
          <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
            <select
              value={currFrom}
              onChange={(e) => setCurrFrom(e.target.value)}
              className={`flex-1 min-w-0 h-7 rounded-[7px] bg-white/[0.08] text-white text-[11px] font-semibold px-2 outline-none border border-white/15 cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c} className={optionClass}>
                  {c}
                </option>
              ))}
            </select>
            <Tooltip content={tx(lang, "Swap currencies", "Tukar mata uang")} side="top" isLightMode={isLight}>
              <button
                type="button"
                onClick={() => {
                  setCurrFrom(currTo);
                  setCurrTo(currFrom);
                }}
                aria-label={tx(lang, "Swap currencies", "Tukar mata uang")}
                className={`w-7 h-7 shrink-0 rounded-[7px] bg-white/[0.08] hover:bg-white/[0.15] flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer ${TRIGGER_FOCUS_RING}`}
              >
                <ArrowLeftRight size={12} />
              </button>
            </Tooltip>
            <select
              value={currTo}
              onChange={(e) => setCurrTo(e.target.value)}
              className={`flex-1 min-w-0 h-7 rounded-[7px] bg-white/[0.08] text-white text-[11px] font-semibold px-2 outline-none border border-white/15 cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c} className={optionClass}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-1 text-[9.5px] text-zinc-400 px-1 mb-2 min-w-0">
            <span className="truncate min-w-0 flex-1">
              1 {currFrom} ≈{" "}
              {ratesData.rates[currFrom] && ratesData.rates[currTo]
                ? currTo === "IDR"
                  ? `Rp ${Math.round(convertCurrency(1, currFrom, currTo, ratesData.rates)).toLocaleString(locale)}`
                  : `${formatLocalizedNumber(convertCurrency(1, currFrom, currTo, ratesData.rates), locale)} ${currTo}`
                : "-"}{" "}
              · {ratesData.source}
            </span>
            <Tooltip content={tx(lang, "Refresh live rates", "Perbarui kurs live")} side="top" isLightMode={isLight}>
              <button
                type="button"
                onClick={onRefreshRates}
                aria-label={tx(lang, "Refresh live rates", "Perbarui kurs live")}
                className={`p-0.5 rounded text-zinc-400 hover:text-white cursor-pointer shrink-0 ml-1 ${TRIGGER_FOCUS_RING}`}
              >
                <RefreshCw size={10} className={isRefreshingRates ? "animate-spin text-blue-400" : ""} />
              </button>
            </Tooltip>
          </div>
        </>
      )}

      {(convCategory === "length" || convCategory === "weight") && (
        <div className="flex items-center gap-1.5 mb-2.5 min-w-0">
          <select
            value={unitFrom}
            onChange={(e) => setUnitFrom(e.target.value)}
            className={`flex-1 min-w-0 h-7 rounded-[7px] bg-white/[0.08] text-white text-[11px] font-semibold px-2 outline-none border border-white/15 cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            {Object.keys(UNIT_CONVERSIONS[convCategory]).map((u) => (
              <option key={u} value={u} className={optionClass}>
                {u}
              </option>
            ))}
          </select>
          <Tooltip content={tx(lang, "Swap units", "Tukar satuan")} side="top" isLightMode={isLight}>
            <button
              type="button"
              onClick={() => {
                setUnitFrom(unitTo);
                setUnitTo(unitFrom);
              }}
              aria-label={tx(lang, "Swap units", "Tukar satuan")}
              className={`w-7 h-7 shrink-0 rounded-[7px] bg-white/[0.08] hover:bg-white/[0.15] flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              <ArrowLeftRight size={12} />
            </button>
          </Tooltip>
          <select
            value={unitTo}
            onChange={(e) => setUnitTo(e.target.value)}
            className={`flex-1 min-w-0 h-7 rounded-[7px] bg-white/[0.08] text-white text-[11px] font-semibold px-2 outline-none border border-white/15 cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            {Object.keys(UNIT_CONVERSIONS[convCategory]).map((u) => (
              <option key={u} value={u} className={optionClass}>
                {u}
              </option>
            ))}
          </select>
        </div>
      )}

      {convCategory === "temp" && (
        <div className="flex items-center gap-1.5 mb-2.5 min-w-0">
          <select
            value={tempFrom}
            onChange={(e) => setTempFrom(e.target.value as "C" | "F")}
            className={`flex-1 min-w-0 h-7 rounded-[7px] bg-white/[0.08] text-white text-[11px] font-semibold px-2 outline-none border border-white/15 cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            <option value="C" className={optionClass}>Celsius (°C)</option>
            <option value="F" className={optionClass}>Fahrenheit (°F)</option>
          </select>
          <Tooltip content={tx(lang, "Swap temperature units", "Tukar suhu")} side="top" isLightMode={isLight}>
            <button
              type="button"
              onClick={() => {
                setTempFrom(tempTo);
                setTempTo(tempFrom);
              }}
              aria-label={tx(lang, "Swap temperature units", "Tukar suhu")}
              className={`w-7 h-7 shrink-0 rounded-[7px] bg-white/[0.08] hover:bg-white/[0.15] flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              <ArrowLeftRight size={12} />
            </button>
          </Tooltip>
          <select
            value={tempTo}
            onChange={(e) => setTempTo(e.target.value as "C" | "F")}
            className={`flex-1 min-w-0 h-7 rounded-[7px] bg-white/[0.08] text-white text-[11px] font-semibold px-2 outline-none border border-white/15 cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            <option value="C" className={optionClass}>Celsius (°C)</option>
            <option value="F" className={optionClass}>Fahrenheit (°F)</option>
          </select>
        </div>
      )}

      <div className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-[10px] border min-w-0 ${
        isLight ? "bg-black/[0.05] border-black/15" : "bg-black/60 border-white/15"
      }`}>
        <span className="text-[14px] font-bold text-[#4cc2ff] font-mono tabular-nums truncate min-w-0 flex-1">
          {convResult}
        </span>
        <Tooltip content={tx(lang, "Copy conversion result", "Salin hasil konversi")} side="top" isLightMode={isLight}>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={tx(lang, "Copy conversion result", "Salin hasil konversi")}
            className={`p-1 rounded-[6px] bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white cursor-pointer shrink-0 ${TRIGGER_FOCUS_RING}`}
          >
            {copiedConv ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
