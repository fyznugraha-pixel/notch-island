import React, { useState, useRef } from "react";
import { Quote, RefreshCw, Copy, Check } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { copyTextToClipboard } from "../../utils/clipboard";
import { getLocalDateKey } from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

export const DAILY_QUOTES = [
  {
    en: "Start first, refine along the way.",
    id: "Mulai dulu, sempurnakan sambil jalan.",
  },
  {
    en: "Small progress each day adds up to big results.",
    id: "Sedikit kemajuan setiap hari menghasilkan hasil besar.",
  },
  {
    en: "Focus on progress, not perfection.",
    id: "Fokus pada progres, bukan kesempurnaan.",
  },
  {
    en: "Discipline is the bridge between goals and accomplishment.",
    id: "Disiplin adalah jembatan antara tujuan dan pencapaian.",
  },
  {
    en: "A short break is part of steady productivity.",
    id: "Istirahat sejenak adalah bagian dari produktivitas.",
  },
  {
    en: "Handle what matters most before urgent tasks take over.",
    id: "Kerjakan hal terpenting sebelum hal mendesak mengambil alih.",
  },
  {
    en: "Small consistency beats a brief burst of motivation.",
    id: "Konsistensi kecil mengalahkan lonjakan semangat sesaat.",
  },
];

const QUOTES = DAILY_QUOTES;

const QUOTE_KEY = "gili_quote_daily_v1";

function getInitialQuoteIdx(): number {
  const today = getLocalDateKey();
  try {
    const raw = localStorage.getItem(QUOTE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.date === today && typeof parsed.idx === "number") {
        return parsed.idx % QUOTES.length;
      }
    }
  } catch { }
  const now = new Date();
  const daySeed = now.getFullYear() * 366 + now.getMonth() * 31 + now.getDate();
  return daySeed % QUOTES.length;
}

export const KutipanHarianNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState<number>(getInitialQuoteIdx);
  const [copied, setCopied] = useState(false);

  const quoteItem = QUOTES[idx % QUOTES.length];
  const currentQuote = tx(lang, quoteItem.en, quoteItem.id);

  const handleNextQuote = () => {
    const nextIdx = (idx + 1) % QUOTES.length;
    setIdx(nextIdx);
    try {
      const nextQuote = QUOTES[nextIdx];
      localStorage.setItem(
        QUOTE_KEY,
        JSON.stringify({
          date: getLocalDateKey(),
          idx: nextIdx,
          text: tx(lang, nextQuote.en, nextQuote.id),
          author: "Gili",
        })
      );
      window.dispatchEvent(new Event("gili_quote_updated"));
    } catch { }
  };

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(currentQuote);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  const handleToggle = () => setIsOpen((v) => !v);
  const titleText = tx(lang, "Daily Quote", "Kutipan Harian");

  return (
    <>
      <Tooltip
        content={`${titleText}: "${currentQuote}"`}
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
            `${titleText}: ${currentQuote}`,
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${isCompact
              ? isVertical
                ? "gili-mod-compact gili-mod-vertical justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
                : "gili-mod-compact justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
              : "gili-mod-pill px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
            }`}
        >
          <Quote size={15} className="text-[#f472b6] shrink-0" />
          {!isCompact && (
            <span className="text-[11px] italic text-zinc-200 truncate min-w-0 max-w-[165px]">
              "{currentQuote}"
            </span>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={titleText}
        moduleId="kutipan_harian"
        currentView={view}
        config={config}
        width={268}
      >
        <div className="flex flex-col gap-2.5">
          <div className="p-3 rounded-[10px] bg-white/[0.04] border border-white/[0.08] text-[12px] italic text-zinc-100 leading-relaxed break-words">
            "{currentQuote}"
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleNextQuote}
              className={`flex-1 min-w-0 h-7 px-2 rounded-[7px] bg-pink-500/20 hover:bg-pink-500/30 text-[#f472b6] text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              <RefreshCw size={11} className="shrink-0" />
              <span className="truncate">{tx(lang, "Another Quote", "Kutipan Lain")}</span>
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className={`h-7 px-2.5 shrink-0 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 text-[11px] flex items-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              {copied ? (
                <Check size={11} className="text-emerald-400 shrink-0" />
              ) : (
                <Copy size={11} className="shrink-0" />
              )}
              <span>{copied ? tx(lang, "Copied", "Disalin") : tx(lang, "Copy", "Salin")}</span>
            </button>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
