import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Calculator, Check, Copy } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { CalculatorConverterPanel } from "./CalculatorConverterPanel";
import { CurrencyRatesResponse, getLiveCurrencyRates } from "../../services/currencyService";
import { UnitCategory, evaluateCalcExpression } from "../../utils/calculatorUtils";
import { copyTextToClipboard } from "../../utils/clipboard";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

const KEYPAD_BUTTONS = [
  { label: "C", val: "C", cls: "text-rose-300 bg-rose-500/15 hover:bg-rose-500/25" },
  { label: "⌫", val: "⌫", cls: "text-amber-300 bg-white/[0.08] hover:bg-white/[0.15]" },
  { label: "%", val: "%", cls: "text-blue-300 bg-white/[0.08] hover:bg-white/[0.15]" },
  { label: "÷", val: "÷", cls: "text-[#4cc2ff] bg-white/[0.08] hover:bg-white/[0.15]" },
  { label: "7", val: "7", cls: "bg-white/[0.06] hover:bg-white/[0.12] text-white" },
  { label: "8", val: "8", cls: "bg-white/[0.06] hover:bg-white/[0.12] text-white" },
  { label: "9", val: "9", cls: "bg-white/[0.06] hover:bg-white/[0.12] text-white" },
  { label: "×", val: "×", cls: "text-[#4cc2ff] bg-white/[0.08] hover:bg-white/[0.15]" },
  { label: "4", val: "4", cls: "bg-white/[0.06] hover:bg-white/[0.12] text-white" },
  { label: "5", val: "5", cls: "bg-white/[0.06] hover:bg-white/[0.12] text-white" },
  { label: "6", val: "6", cls: "bg-white/[0.06] hover:bg-white/[0.12] text-white" },
  { label: "-", val: "-", cls: "text-[#4cc2ff] bg-white/[0.08] hover:bg-white/[0.15]" },
  { label: "1", val: "1", cls: "bg-white/[0.06] hover:bg-white/[0.12] text-white" },
  { label: "2", val: "2", cls: "bg-white/[0.06] hover:bg-white/[0.12] text-white" },
  { label: "3", val: "3", cls: "bg-white/[0.06] hover:bg-white/[0.12] text-white" },
  { label: "+", val: "+", cls: "text-[#4cc2ff] bg-white/[0.08] hover:bg-white/[0.15]" },
  { label: "0", val: "0", cls: "bg-white/[0.06] hover:bg-white/[0.12] text-white" },
  { label: ".", val: ".", cls: "bg-white/[0.06] hover:bg-white/[0.12] text-white" },
  { label: "(", val: "(", cls: "text-zinc-300 bg-white/[0.06] hover:bg-white/[0.12]" },
  { label: "=", val: "=", cls: "bg-[#0a84ff] hover:bg-[#0071e3] text-[#ffffff] font-bold" },
];

export const CalculatorNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"calc" | "conv">("calc");
  const [calcInput, setCalcInput] = useState(() =>
    tx(lang, "15% of 240", "15% dari 240")
  );
  const [copiedCalc, setCopiedCalc] = useState(false);
  const [copiedConv, setCopiedConv] = useState(false);

  const [convCategory, setConvCategory] = useState<UnitCategory>("currency");
  const [convAmount, setConvAmount] = useState("100");
  const [currFrom, setCurrFrom] = useState("USD");
  const [currTo, setCurrTo] = useState("IDR");
  const [unitFrom, setUnitFrom] = useState("km");
  const [unitTo, setUnitTo] = useState("m");
  const [tempFrom, setTempFrom] = useState<"C" | "F">("C");
  const [tempTo, setTempTo] = useState<"C" | "F">("F");
  const [isRefreshingRates, setIsRefreshingRates] = useState(false);
  const [ratesData, setRatesData] = useState<CurrencyRatesResponse>({
    rates: { USD: 1, IDR: 16200 },
    timeLastUpdate: "...",
    source: "Offline",
  });

  const anchorRef = useRef<HTMLDivElement>(null);
  const calcInputRef = useRef<HTMLInputElement>(null);
  const convInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getLiveCurrencyRates(false).then(setRatesData).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => {
      const target = activeTab === "calc" ? calcInputRef.current : convInputRef.current;
      target?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [isOpen, activeTab]);

  const rawResult = useMemo(() => evaluateCalcExpression(calcInput), [calcInput]);
  const calcResult = rawResult === "—" ? "-" : rawResult;

  const handleCopyCalc = async () => {
    if (calcResult === "-" || calcResult === "Error") return;
    if (await copyTextToClipboard(calcResult)) {
      setCopiedCalc(true);
      window.setTimeout(() => setCopiedCalc(false), 1200);
    }
  };

  const handleKeypadPress = (val: string) => {
    if (val === "C") {
      setCalcInput("");
      return;
    }
    if (val === "⌫") {
      setCalcInput((prev) => prev.slice(0, -1));
      return;
    }
    if (val === "=") {
      if (calcResult !== "-" && calcResult !== "Error") {
        setCalcInput(calcResult.replace(/\./g, "").replace(/,/g, "."));
      }
      return;
    }
    setCalcInput((prev) => prev + val);
  };

  const handleRefreshRates = async () => {
    setIsRefreshingRates(true);
    try {
      setRatesData(await getLiveCurrencyRates(true));
    } finally {
      setIsRefreshingRates(false);
    }
  };

  const handleToggle = () => setIsOpen((v) => !v);
  const triggerTip = tx(
    lang,
    "Calculator & unit/currency converter",
    "Kalkulator & konverter unit/mata uang"
  );

  return (
    <>
      <Tooltip
        content={triggerTip}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : ""}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            tx(lang, "Calculator and converter", "Kalkulator dan konverter"),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? isVertical
                ? "w-full max-w-full h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
                : "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
              : "h-10 px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <Calculator size={16} className="text-[#4cc2ff] shrink-0" />
          {!isCompact && (
            <div className="flex items-center gap-1.5 min-w-0 max-w-[140px]">
              <span className="text-[11px] text-zinc-300 truncate min-w-0">
                {calcInput || tx(lang, "Calculate", "Hitung")}
              </span>
              <span className="text-[12px] font-bold text-[#4cc2ff] tabular-nums shrink-0">
                = {calcResult}
              </span>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Calculator & Converter", "Kalkulator & Konverter")}
        moduleId="kalkulator_konverter"
        currentView={view}
        config={config}
        needsKeyboardFocus
        width={284}
      >
        <div className="grid grid-cols-2 gap-1 p-0.5 bg-white/[0.06] rounded-[9px] border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setActiveTab("calc")}
            className={`py-1 text-[11px] font-medium rounded-[7px] cursor-pointer flex items-center justify-center gap-1.5 ${TRIGGER_FOCUS_RING} ${
              activeTab === "calc" ? "bg-[#0a84ff] text-[#ffffff] font-semibold" : "text-zinc-300 hover:text-white"
            }`}
          >
            <Calculator size={12} />
            <span>{tx(lang, "Calculator", "Kalkulator")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("conv")}
            className={`py-1 text-[11px] font-medium rounded-[7px] cursor-pointer flex items-center justify-center gap-1.5 ${TRIGGER_FOCUS_RING} ${
              activeTab === "conv" ? "bg-[#0a84ff] text-[#ffffff] font-semibold" : "text-zinc-300 hover:text-white"
            }`}
          >
            <ArrowLeftRight size={12} />
            <span>{tx(lang, "Converter", "Konverter")}</span>
          </button>
        </div>

        {activeTab === "calc" ? (
          <div>
            <div className={`rounded-[11px] p-2 mb-2 border ${
              isLight ? "bg-black/[0.05] border-black/15" : "bg-black/60 border-white/15"
            }`}>
              <input
                ref={calcInputRef}
                type="text"
                value={calcInput}
                onChange={(e) => setCalcInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") return;
                  e.stopPropagation();
                  if (e.key === "Enter") handleCopyCalc();
                }}
                placeholder={tx(lang, "e.g. 24*15, 15% of 240", "cth: 24*15, 15% dari 240")}
                className={`w-full bg-transparent text-[11.5px] font-mono outline-none text-right mb-1 ${
                  isLight ? "text-zinc-900 placeholder-zinc-500" : "text-zinc-100 placeholder-zinc-500"
                }`}
              />
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.08] min-w-0">
                <Tooltip content={tx(lang, "Copy result", "Salin hasil kalkulasi")} side="top" isLightMode={isLight}>
                  <button
                    type="button"
                    onClick={handleCopyCalc}
                    aria-label={tx(lang, "Copy result", "Salin hasil kalkulasi")}
                    className={`p-1 shrink-0 rounded-[6px] bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white cursor-pointer ${TRIGGER_FOCUS_RING}`}
                  >
                    {copiedCalc ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  </button>
                </Tooltip>
                <span className="text-[17px] font-bold text-[#4cc2ff] font-mono tabular-nums truncate min-w-0 flex-1 text-right">
                  = {calcResult}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {KEYPAD_BUTTONS.map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  onClick={() => handleKeypadPress(btn.val)}
                  className={`h-7 rounded-[7px] text-[12px] font-semibold flex items-center justify-center cursor-pointer active:scale-95 ${TRIGGER_FOCUS_RING} ${btn.cls}`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <CalculatorConverterPanel
            config={config}
            convInputRef={convInputRef}
            convCategory={convCategory}
            setConvCategory={setConvCategory}
            convAmount={convAmount}
            setConvAmount={setConvAmount}
            currFrom={currFrom}
            setCurrFrom={setCurrFrom}
            currTo={currTo}
            setCurrTo={setCurrTo}
            ratesData={ratesData}
            isRefreshingRates={isRefreshingRates}
            onRefreshRates={handleRefreshRates}
            unitFrom={unitFrom}
            setUnitFrom={setUnitFrom}
            unitTo={unitTo}
            setUnitTo={setUnitTo}
            tempFrom={tempFrom}
            setTempFrom={setTempFrom}
            tempTo={tempTo}
            setTempTo={setTempTo}
            copiedConv={copiedConv}
            onCopiedConv={() => {
              setCopiedConv(true);
              window.setTimeout(() => setCopiedConv(false), 1200);
            }}
          />
        )}
      </NavbarPopoverShell>
    </>
  );
};
