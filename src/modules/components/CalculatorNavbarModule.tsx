import React, { useState, useEffect, useRef } from "react";
import {
  Calculator,
  Copy,
  Check,
  X,
  ArrowLeftRight,
  Coins,
  Ruler,
  Scale,
  Thermometer,
  RefreshCw,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { NavbarModuleContext } from "../types";
import { saveNavbarConfig } from "../../services/navbarConfigService";
import { Tooltip } from "../../components/ui/Tooltip";
import {
  getLiveCurrencyRates,
  convertCurrency,
  SUPPORTED_CURRENCIES,
  CurrencyRatesResponse,
} from "../../services/currencyService";

type UnitCategory = "currency" | "temp" | "length" | "weight";

const UNIT_CONVERSIONS: Record<
  "length" | "weight",
  Record<string, number>
> = {
  length: {
    km: 1000,
    m: 1,
    cm: 0.01,
    mm: 0.001,
    mil: 1609.34,
    ft: 0.3048,
  },
  weight: {
    kg: 1000,
    g: 1,
    mg: 0.001,
    lb: 453.592,
    ons: 28.3495,
  },
};

function formatDisplayNumber(n: number): string {
  if (!isFinite(n)) return "0";
  if (Number.isInteger(n)) return n.toLocaleString("id-ID");
  return Number(n.toFixed(4)).toLocaleString("id-ID");
}

function safeCalculate(expression: string): string {
  const sanitized = expression
    .trim()
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\^/g, "**")
    .replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");

  if (!sanitized) return "0";
  if (!/^[0-9+\-*/().\s*]+$/.test(sanitized)) return "Error";

  try {
    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${sanitized});`)();
    if (typeof val === "number" && isFinite(val)) {
      return formatDisplayNumber(val);
    }
    return "Error";
  } catch {
    return "—";
  }
}

export const CalculatorNavbarModule: React.FC<NavbarModuleContext> = ({
  view,
  config,
}) => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"calc" | "conv">("calc");

  // Calculator State
  const [calcInput, setCalcInput] = useState<string>(() => {
    return localStorage.getItem("gili_calc_expr_v2") || "125 * 8";
  });
  const [copiedCalc, setCopiedCalc] = useState(false);

  // Live Currency Rates State
  const [ratesData, setRatesData] = useState<CurrencyRatesResponse>({
    rates: {
      USD: 1,
      IDR: 18144,
      EUR: 0.945,
      SGD: 1.34,
      JPY: 154.2,
      MYR: 4.45,
      GBP: 0.79,
      AUD: 1.55,
      CNY: 7.23,
      KRW: 1395,
    },
    timeLastUpdate: "Memuat...",
    source: "open.er-api.com",
  });
  const [isRefreshingRates, setIsRefreshingRates] = useState(false);

  // Converter State
  const [convCategory, setConvCategory] = useState<UnitCategory>("currency");
  const [convAmount, setConvAmount] = useState<string>("100");
  const [currFrom, setCurrFrom] = useState("USD");
  const [currTo, setCurrTo] = useState("IDR");
  const [unitFrom, setUnitFrom] = useState("km");
  const [unitTo, setUnitTo] = useState("m");
  const [tempFrom, setTempFrom] = useState<"C" | "F">("C");
  const [tempTo, setTempTo] = useState<"C" | "F">("F");
  const [copiedConv, setCopiedConv] = useState(false);

  const calcInputRef = useRef<HTMLInputElement>(null);
  const convInputRef = useRef<HTMLInputElement>(null);

  // Load live currency rates on mount
  useEffect(() => {
    getLiveCurrencyRates().then((data) => {
      setRatesData(data);
    });
  }, []);

  const handleRefreshRates = async () => {
    setIsRefreshingRates(true);
    try {
      const data = await getLiveCurrencyRates(true);
      setRatesData(data);
    } finally {
      setTimeout(() => setIsRefreshingRates(false), 500);
    }
  };

  // Live Calculator Evaluation
  const calcResult = safeCalculate(calcInput);

  // Live Converter Evaluation
  const convResult = React.useMemo(() => {
    const rawVal = parseFloat(convAmount.replace(",", "."));
    if (isNaN(rawVal)) return "—";

    if (convCategory === "currency") {
      const converted = convertCurrency(
        rawVal,
        currFrom,
        currTo,
        ratesData.rates
      );
      if (currTo === "IDR") {
        return `Rp ${Math.round(converted).toLocaleString("id-ID")}`;
      }
      return `${formatDisplayNumber(converted)} ${currTo}`;
    }

    if (convCategory === "temp") {
      if (tempFrom === "C" && tempTo === "F") {
        return `${formatDisplayNumber((rawVal * 9) / 5 + 32)} °F`;
      }
      if (tempFrom === "F" && tempTo === "C") {
        return `${formatDisplayNumber(((rawVal - 32) * 5) / 9)} °C`;
      }
      return `${formatDisplayNumber(rawVal)} °${tempTo}`;
    }

    const table = UNIT_CONVERSIONS[convCategory];
    if (table && table[unitFrom] && table[unitTo]) {
      const inBase = rawVal * table[unitFrom];
      const outVal = inBase / table[unitTo];
      return `${formatDisplayNumber(outVal)} ${unitTo}`;
    }

    return "—";
  }, [
    convCategory,
    convAmount,
    currFrom,
    currTo,
    unitFrom,
    unitTo,
    tempFrom,
    tempTo,
    ratesData.rates,
  ]);

  // Persist calculator expression
  useEffect(() => {
    try {
      localStorage.setItem("gili_calc_expr_v2", calcInput);
    } catch {}
  }, [calcInput]);

  // Focus and Hit-testing management
  useEffect(() => {
    if (!open) return;
    invoke("set_navbar_popup_open", { open: true }).catch(() => {});
    invoke("set_navbar_focusable", { focusable: true }).catch(() => {});

    const timer = window.setTimeout(() => {
      if (activeTab === "calc") {
        calcInputRef.current?.focus();
        calcInputRef.current?.select();
      } else {
        convInputRef.current?.focus();
        convInputRef.current?.select();
      }
    }, 50);

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest("[data-calc-module-root]")) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handleOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", handleOutside);
      window.removeEventListener("keydown", handleKeyDown);
      invoke("set_navbar_focusable", { focusable: false }).catch(() => {});
      invoke("set_navbar_popup_open", { open: false }).catch(() => {});
    };
  }, [open, activeTab]);

  const handleCopyCalc = () => {
    if (calcResult === "—" || calcResult === "Error") return;
    navigator.clipboard?.writeText(calcResult).catch(() => {});
    setCopiedCalc(true);
    setTimeout(() => setCopiedCalc(false), 1200);
  };

  const handleCopyConv = () => {
    if (convResult === "—") return;
    navigator.clipboard?.writeText(convResult).catch(() => {});
    setCopiedConv(true);
    setTimeout(() => setCopiedConv(false), 1200);
  };

  const handleKeypadPress = (val: string) => {
    if (val === "C") {
      setCalcInput("");
    } else if (val === "⌫") {
      setCalcInput((prev) => prev.slice(0, -1));
    } else if (val === "=") {
      if (calcResult !== "—" && calcResult !== "Error") {
        setCalcInput(calcResult.replace(/\./g, "").replace(",", "."));
      }
    } else {
      setCalcInput((prev) => {
        if (prev === "0" && !isNaN(Number(val))) return val;
        return prev + val;
      });
    }
    calcInputRef.current?.focus();
  };

  const swapCurrencies = () => {
    const temp = currFrom;
    setCurrFrom(currTo);
    setCurrTo(temp);
  };

  const swapUnits = () => {
    const temp = unitFrom;
    setUnitFrom(unitTo);
    setUnitTo(temp);
  };

  const swapTemps = () => {
    const temp = tempFrom;
    setTempFrom(tempTo);
    setTempTo(temp);
  };

  const pos = config.position || "bottom";
  const popupPosClass =
    pos === "top"
      ? "top-full left-1/2 -translate-x-1/2 mt-2.5"
      : pos === "left"
      ? "left-full top-1/2 -translate-y-1/2 ml-2.5"
      : pos === "right"
      ? "right-full top-1/2 -translate-y-1/2 mr-2.5"
      : "bottom-full left-1/2 -translate-x-1/2 mb-2.5";

  return (
    <div data-calc-module-root className="relative flex items-center">
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: "#141419",
            borderColor: "rgba(255,255,255,0.12)",
            boxShadow:
              "0 20px 48px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
          className={`navbar-preview-dark absolute ${popupPosClass} z-50 w-[278px] p-3 rounded-[18px] border backdrop-blur-2xl text-white select-none pointer-events-auto`}
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.08]">
            <div className="flex items-center gap-1.5">
              <Calculator size={13.5} className="text-[#0a84ff]" />
              <span className="text-[11.5px] font-semibold text-white/90">
                Kalkulator & Konverter
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* View Switcher: Ikon / Panjang */}
              <div className="flex items-center bg-white/[0.06] rounded-[7px] p-0.5 border border-white/[0.06]">
                {(["compact", "full"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const nextMods = config.modules.map((m) =>
                        m.id === "kalkulator_konverter" ? { ...m, view: v } : m
                      );
                      const nextCfg = { ...config, modules: nextMods };
                      await saveNavbarConfig(nextCfg).catch(() => {});
                      await invoke("broadcast_navbar_config_update", {
                        config: nextCfg,
                      }).catch(() => {});
                      await emit("navbar_config_updated", nextCfg).catch(() => {});
                      await emit("gili-navbar-config-sync", nextCfg).catch(() => {});
                    }}
                    className={`px-1.5 py-0.5 rounded-[5px] text-[9px] font-semibold cursor-pointer transition-all ${
                      view === v
                        ? "bg-[#3882F6] text-white"
                        : "text-white/50 hover:text-white"
                    }`}
                  >
                    {v === "compact" ? "Ikon" : "Panjang"}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white cursor-pointer transition-colors"
                title="Tutup"
              >
                <X size={11} />
              </button>
            </div>
          </div>

          {/* Mode Switcher Tabs (ICONS ONLY, NO EMOJIS) */}
          <div className="grid grid-cols-2 gap-1 p-0.5 mb-2.5 bg-white/[0.06] rounded-[9px] border border-white/[0.06]">
            <button
              type="button"
              onClick={() => setActiveTab("calc")}
              className={`py-1 text-[11px] font-medium rounded-[7px] cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "calc"
                  ? "bg-[#0a84ff] text-white shadow-sm font-semibold"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <Calculator size={12} className={activeTab === "calc" ? "text-white" : "text-[#0a84ff]"} />
              <span>Kalkulator</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("conv")}
              className={`py-1 text-[11px] font-medium rounded-[7px] cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "conv"
                  ? "bg-[#0a84ff] text-white shadow-sm font-semibold"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <ArrowLeftRight size={12} className={activeTab === "conv" ? "text-white" : "text-[#38bdf8]"} />
              <span>Konverter</span>
            </button>
          </div>

          {/* Tab 1: Kalkulator Mode */}
          {activeTab === "calc" && (
            <div>
              {/* Display & Direct Input Screen */}
              <div className="bg-black/60 rounded-[11px] p-2 mb-2 border border-white/10">
                <input
                  ref={calcInputRef}
                  type="text"
                  value={calcInput}
                  onChange={(e) => setCalcInput(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      handleCopyCalc();
                    }
                  }}
                  placeholder="Ketik angka / rumus (cth: 24*15, 15%)"
                  className="w-full bg-transparent text-[11.5px] text-white/80 font-mono outline-none tracking-wide text-right mb-1"
                />
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.07]">
                  <button
                    type="button"
                    onClick={handleCopyCalc}
                    className="p-1 rounded-[6px] bg-white/10 hover:bg-white/20 text-white/70 hover:text-white cursor-pointer transition-colors"
                    title="Salin hasil"
                  >
                    {copiedCalc ? (
                      <Check size={11} className="text-emerald-400" />
                    ) : (
                      <Copy size={11} />
                    )}
                  </button>
                  <span className="text-[17px] font-bold text-[#4cc2ff] font-mono tabular-nums">
                    = {calcResult}
                  </span>
                </div>
              </div>

              {/* Standard Keypad */}
              <div className="grid grid-cols-4 gap-1">
                {[
                  { label: "C", val: "C", cls: "text-rose-400 bg-rose-500/15 hover:bg-rose-500/25" },
                  { label: "⌫", val: "⌫", cls: "text-amber-400 bg-white/[0.08] hover:bg-white/[0.15]" },
                  { label: "%", val: "%", cls: "text-blue-400 bg-white/[0.08] hover:bg-white/[0.15]" },
                  { label: "÷", val: "÷", cls: "text-[#4cc2ff] bg-white/[0.08] hover:bg-white/[0.15]" },

                  { label: "7", val: "7", cls: "bg-white/[0.06] hover:bg-white/[0.12]" },
                  { label: "8", val: "8", cls: "bg-white/[0.06] hover:bg-white/[0.12]" },
                  { label: "9", val: "9", cls: "bg-white/[0.06] hover:bg-white/[0.12]" },
                  { label: "×", val: "×", cls: "text-[#4cc2ff] bg-white/[0.08] hover:bg-white/[0.15]" },

                  { label: "4", val: "4", cls: "bg-white/[0.06] hover:bg-white/[0.12]" },
                  { label: "5", val: "5", cls: "bg-white/[0.06] hover:bg-white/[0.12]" },
                  { label: "6", val: "6", cls: "bg-white/[0.06] hover:bg-white/[0.12]" },
                  { label: "-", val: "-", cls: "text-[#4cc2ff] bg-white/[0.08] hover:bg-white/[0.15]" },

                  { label: "1", val: "1", cls: "bg-white/[0.06] hover:bg-white/[0.12]" },
                  { label: "2", val: "2", cls: "bg-white/[0.06] hover:bg-white/[0.12]" },
                  { label: "3", val: "3", cls: "bg-white/[0.06] hover:bg-white/[0.12]" },
                  { label: "+", val: "+", cls: "text-[#4cc2ff] bg-white/[0.08] hover:bg-white/[0.15]" },

                  { label: "0", val: "0", cls: "bg-white/[0.06] hover:bg-white/[0.12]" },
                  { label: ".", val: ".", cls: "bg-white/[0.06] hover:bg-white/[0.12]" },
                  { label: "(", val: "(", cls: "text-white/60 bg-white/[0.06] hover:bg-white/[0.12]" },
                  { label: "=", val: "=", cls: "bg-[#0a84ff] hover:bg-[#0071e3] text-white font-bold" },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleKeypadPress(item.val)}
                    className={`h-7 rounded-[7px] text-[12px] font-semibold flex items-center justify-center cursor-pointer transition-all active:scale-95 ${item.cls}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tab 2: Konverter Mode */}
          {activeTab === "conv" && (
            <div>
              {/* Category selector (ICONS ONLY) */}
              <div className="flex items-center gap-1 mb-2">
                {[
                  { id: "currency", label: "Mata Uang", icon: Coins },
                  { id: "length", label: "Panjang", icon: Ruler },
                  { id: "weight", label: "Berat", icon: Scale },
                  { id: "temp", label: "Suhu", icon: Thermometer },
                ].map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = convCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setConvCategory(cat.id as UnitCategory)}
                      className={`flex-1 py-1 rounded-[6px] text-[9.5px] font-medium cursor-pointer transition-all flex items-center justify-center gap-1 ${
                        isSelected
                          ? "bg-white/20 text-white font-semibold"
                          : "text-white/50 hover:text-white/80 bg-white/[0.04]"
                      }`}
                    >
                      <Icon size={10.5} className={isSelected ? "text-[#38bdf8]" : "text-white/50"} />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Amount input field */}
              <div className="mb-2">
                <label className="text-[9.5px] text-white/50 block mb-1">
                  Jumlah:
                </label>
                <div className="relative">
                  <input
                    ref={convInputRef}
                    type="number"
                    step="any"
                    value={convAmount}
                    onChange={(e) => setConvAmount(e.target.value)}
                    className="w-full h-7 pl-2.5 pr-6 rounded-[8px] bg-black/60 border border-white/15 focus:border-[#0a84ff] text-[12px] font-mono text-white outline-none"
                    placeholder="Masukkan angka..."
                  />
                  {convAmount && (
                    <button
                      type="button"
                      onClick={() => setConvAmount("")}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>

              {/* Unit / Currency Selectors */}
              {convCategory === "currency" && (
                <>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <select
                      value={currFrom}
                      onChange={(e) => setCurrFrom(e.target.value)}
                      className="flex-1 h-7 rounded-[7px] bg-white/[0.08] text-white text-[11px] font-semibold px-2 outline-none border border-white/10 cursor-pointer"
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c} value={c} className="bg-[#1a1a24] text-white">
                          {c}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={swapCurrencies}
                      className="w-7 h-7 rounded-[7px] bg-white/[0.08] hover:bg-white/[0.15] flex items-center justify-center text-white/80 hover:text-white cursor-pointer transition-colors"
                      title="Tukar posisi"
                    >
                      <ArrowLeftRight size={12} />
                    </button>

                    <select
                      value={currTo}
                      onChange={(e) => setCurrTo(e.target.value)}
                      className="flex-1 h-7 rounded-[7px] bg-white/[0.08] text-white text-[11px] font-semibold px-2 outline-none border border-white/10 cursor-pointer"
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c} value={c} className="bg-[#1a1a24] text-white">
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Live Exchange Rate Indicator with Refresh Button */}
                  <div className="flex items-center justify-between text-[9px] text-white/45 px-1 mb-2">
                    <span className="truncate">
                      1 {currFrom} ≈{" "}
                      {ratesData.rates[currFrom] && ratesData.rates[currTo]
                        ? currTo === "IDR"
                          ? `Rp ${Math.round(
                              convertCurrency(1, currFrom, currTo, ratesData.rates)
                            ).toLocaleString("id-ID")}`
                          : `${formatDisplayNumber(
                              convertCurrency(1, currFrom, currTo, ratesData.rates)
                            )} ${currTo}`
                        : "—"}{" "}
                      · {ratesData.source}
                    </span>
                    <button
                      type="button"
                      onClick={handleRefreshRates}
                      className="p-0.5 rounded text-white/40 hover:text-white transition-colors cursor-pointer shrink-0 ml-1"
                      title="Perbarui kurs live"
                    >
                      <RefreshCw
                        size={9.5}
                        className={isRefreshingRates ? "animate-spin text-blue-400" : ""}
                      />
                    </button>
                  </div>
                </>
              )}

              {(convCategory === "length" || convCategory === "weight") && (
                <div className="flex items-center gap-1.5 mb-2.5">
                  <select
                    value={unitFrom}
                    onChange={(e) => setUnitFrom(e.target.value)}
                    className="flex-1 h-7 rounded-[7px] bg-white/[0.08] text-white text-[11px] font-semibold px-2 outline-none border border-white/10 cursor-pointer"
                  >
                    {Object.keys(UNIT_CONVERSIONS[convCategory]).map((u) => (
                      <option key={u} value={u} className="bg-[#1a1a24] text-white">
                        {u}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={swapUnits}
                    className="w-7 h-7 rounded-[7px] bg-white/[0.08] hover:bg-white/[0.15] flex items-center justify-center text-white/80 hover:text-white cursor-pointer transition-colors"
                    title="Tukar posisi"
                  >
                    <ArrowLeftRight size={12} />
                  </button>

                  <select
                    value={unitTo}
                    onChange={(e) => setUnitTo(e.target.value)}
                    className="flex-1 h-7 rounded-[7px] bg-white/[0.08] text-white text-[11px] font-semibold px-2 outline-none border border-white/10 cursor-pointer"
                  >
                    {Object.keys(UNIT_CONVERSIONS[convCategory]).map((u) => (
                      <option key={u} value={u} className="bg-[#1a1a24] text-white">
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {convCategory === "temp" && (
                <div className="flex items-center gap-1.5 mb-2.5">
                  <select
                    value={tempFrom}
                    onChange={(e) => setTempFrom(e.target.value as "C" | "F")}
                    className="flex-1 h-7 rounded-[7px] bg-white/[0.08] text-white text-[11px] font-semibold px-2 outline-none border border-white/10 cursor-pointer"
                  >
                    <option value="C" className="bg-[#1a1a24] text-white">
                      Celsius (°C)
                    </option>
                    <option value="F" className="bg-[#1a1a24] text-white">
                      Fahrenheit (°F)
                    </option>
                  </select>

                  <button
                    type="button"
                    onClick={swapTemps}
                    className="w-7 h-7 rounded-[7px] bg-white/[0.08] hover:bg-white/[0.15] flex items-center justify-center text-white/80 hover:text-white cursor-pointer transition-colors"
                    title="Tukar posisi"
                  >
                    <ArrowLeftRight size={12} />
                  </button>

                  <select
                    value={tempTo}
                    onChange={(e) => setTempTo(e.target.value as "C" | "F")}
                    className="flex-1 h-7 rounded-[7px] bg-white/[0.08] text-white text-[11px] font-semibold px-2 outline-none border border-white/10 cursor-pointer"
                  >
                    <option value="C" className="bg-[#1a1a24] text-white">
                      Celsius (°C)
                    </option>
                    <option value="F" className="bg-[#1a1a24] text-white">
                      Fahrenheit (°F)
                    </option>
                  </select>
                </div>
              )}

              {/* Converted Output Card */}
              <div className="flex items-center justify-between px-2.5 py-1.5 mb-2 rounded-[9px] bg-[#0a84ff]/15 border border-[#0a84ff]/30">
                <span className="text-[10px] text-white/60">= Hasil</span>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-[#4cc2ff] tabular-nums truncate max-w-[155px]">
                    {convResult}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyConv}
                    className="p-1 rounded-[6px] bg-white/10 hover:bg-white/20 text-white/80 hover:text-white cursor-pointer transition-colors"
                    title="Salin hasil"
                  >
                    {copiedConv ? (
                      <Check size={11} className="text-emerald-400" />
                    ) : (
                      <Copy size={11} />
                    )}
                  </button>
                </div>
              </div>

              {/* Quick Presets for Converter */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                {[
                  { label: "100 USD → IDR", act: () => { setConvCategory("currency"); setConvAmount("100"); setCurrFrom("USD"); setCurrTo("IDR"); } },
                  { label: "50 SGD → IDR", act: () => { setConvCategory("currency"); setConvAmount("50"); setCurrFrom("SGD"); setCurrTo("IDR"); } },
                  { label: "1 Jt IDR → USD", act: () => { setConvCategory("currency"); setConvAmount("1000000"); setCurrFrom("IDR"); setCurrTo("USD"); } },
                  { label: "30 °C → °F", act: () => { setConvCategory("temp"); setConvAmount("30"); setTempFrom("C"); setTempTo("F"); } },
                  { label: "5 km → m", act: () => { setConvCategory("length"); setConvAmount("5"); setUnitFrom("km"); setUnitTo("m"); } },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.act}
                    className="px-1.5 py-0.5 rounded-[5px] bg-white/[0.06] hover:bg-white/[0.12] text-[9px] text-white/70 hover:text-white shrink-0 cursor-pointer transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Taskbar Dock Pill Button (STABLE FIXED WIDTH TO PREVENT DOCK SHAKE) */}
      <Tooltip
        side="top"
        delay={150}
        content={
          open
            ? null
            : activeTab === "calc"
            ? `Kalkulator (${calcInput} = ${calcResult}) · Klik untuk buka`
            : `Konverter (${convAmount} ${convCategory === "currency" ? currFrom : unitFrom} = ${convResult})`
        }
      >
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className={`transition-all flex items-center cursor-pointer text-white shrink-0 select-none ${
            view === "compact"
              ? "w-10 h-10 justify-center rounded-[12px]"
              : "h-10 px-2.5 gap-1.5 rounded-[12px]"
          } ${
            open
              ? "bg-[#0a84ff]/25 border border-[#0a84ff]/50"
              : "bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <Calculator size={15} className="text-[#0a84ff] shrink-0" />
          {view !== "compact" && (
            <div className="flex items-center gap-1 text-[11px] w-[105px] overflow-hidden">
              <span className="text-white/70 truncate flex-1 text-left font-mono">
                {activeTab === "calc"
                  ? calcInput || "0"
                  : `${convAmount} ${convCategory === "currency" ? currFrom : unitFrom}`}
              </span>
              <span className="font-bold text-[#60a5fa] tabular-nums shrink-0">
                = {activeTab === "calc" ? calcResult : convResult.split(" ")[0]}
              </span>
            </div>
          )}
        </button>
      </Tooltip>
    </div>
  );
};
