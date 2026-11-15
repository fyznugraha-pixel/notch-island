import React, { useMemo, useRef, useState } from "react";
import { CalendarClock } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import {
  NavbarPopoverShell,
  CircularRingSvg,
  useNavbarIsLightSurface,
} from "./NavbarPopoverShell";
import { getLocalDateKey, useMinuteTick } from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { dateLocale, getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

interface CountdownState {
  title: string;
  targetDate: string;
}

const COUNTDOWN_KEY = "gili_countdown_v1";

function parseLocalDateMidnight(dateStr: string): Date | null {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

function loadInitialCountdown(defaultTitle: string): CountdownState {
  try {
    const raw = localStorage.getItem(COUNTDOWN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.targetDate === "string" && parseLocalDateMidnight(parsed.targetDate)) {
        return {
          title: typeof parsed.title === "string" && parsed.title.trim()
            ? parsed.title
            : defaultTitle,
          targetDate: parsed.targetDate,
        };
      }
    }
  } catch {}

  const fallback: CountdownState = {
    title: defaultTitle,
    targetDate: getLocalDateKey(new Date(Date.now() + 7 * 86_400_000)),
  };
  try {
    localStorage.setItem(COUNTDOWN_KEY, JSON.stringify(fallback));
  } catch {}
  return fallback;
}

export const CountdownNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const locale = dateLocale(lang);
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<CountdownState>(() =>
    loadInitialCountdown(tx(lang, "Focus Target", "Target Fokus"))
  );
  const now = useMinuteTick(60_000);

  const persist = (next: CountdownState) => {
    setData(next);
    try {
      localStorage.setItem(COUNTDOWN_KEY, JSON.stringify(next));
    } catch {}
  };

  const { diffDays, formattedTarget } = useMemo(() => {
    const target = parseLocalDateMidnight(data.targetDate);
    if (!target) {
      return {
        diffDays: null,
        formattedTarget: tx(lang, "Invalid date", "Tanggal belum valid"),
      };
    }
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
    const label = target.toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return { diffDays: days, formattedTarget: label };
  }, [data.targetDate, now, locale, lang]);

  const badgeText =
    diffDays === null
      ? "--"
      : diffDays > 0
      ? `${diffDays}${tx(lang, "d", "h")}`
      : diffDays === 0
      ? tx(lang, "D!", "H!")
      : `+${Math.abs(diffDays)}`;

  const statusText =
    diffDays === null
      ? tx(lang, "Set a date", "Atur tanggal")
      : diffDays > 0
      ? tx(lang, `${diffDays} days left`, `${diffDays} hari lagi`)
      : diffDays === 0
      ? tx(lang, "Today!", "Hari ini!")
      : tx(lang, `${Math.abs(diffDays)} days ago`, `Lewat ${Math.abs(diffDays)} hari`);

  const ringColor =
    diffDays === null
      ? "#71717a"
      : diffDays === 0
      ? "#22c55e"
      : diffDays < 0
      ? "#64748b"
      : diffDays <= 3
      ? "#ef4444"
      : "#f59e0b";

  const ringPercent =
    diffDays === null
      ? 0
      : diffDays <= 0
      ? 100
      : Math.max(8, Math.min(100, Math.round((Math.max(0, 30 - diffDays) / 30) * 100)));

  const handleToggle = () => setIsOpen((v) => !v);
  const inputClass = isLight
    ? "bg-black/[0.05] border-black/15 text-zinc-900 placeholder-zinc-500"
    : "bg-black/50 border-white/15 text-white placeholder-zinc-500";

  return (
    <>
      <Tooltip
        content={`${data.title}: ${statusText}`}
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
            tx(lang, `Countdown ${data.title}`, `Hitung mundur ${data.title}`),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? isVertical
                ? "w-full max-w-full h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] relative"
                : "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] relative"
              : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          {isCompact ? (
            <div className="flex flex-col items-center leading-none">
              <span className="text-[13px] font-bold text-white tabular-nums">
                {badgeText}
              </span>
              <span className="text-[8px] font-semibold text-zinc-400">
                {tx(lang, "target", "target")}
              </span>
            </div>
          ) : (
            <>
              <CircularRingSvg size={24} strokeWidth={2.5} percent={ringPercent} color={ringColor} />
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[130px]">
                <span className="text-[12px] font-semibold text-white truncate">
                  {data.title}
                </span>
                <span className="text-[10px] text-zinc-300 truncate">{statusText}</span>
              </div>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Target Countdown", "Hitung Mundur Target")}
        moduleId="hitung_mundur"
        currentView={view}
        config={config}
        needsKeyboardFocus
        width={264}
      >
        <div className="w-full min-w-0 flex items-center gap-3 p-2.5 rounded-[11px] bg-white/[0.05] border border-white/[0.1]">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${ringColor}22`, color: ringColor }}
          >
            <CalendarClock size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-white leading-tight truncate">{statusText}</div>
            <div className="text-[10.5px] text-zinc-300 truncate">{formattedTarget}</div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-zinc-300">
              {tx(lang, "Event / deadline name", "Nama acara / tenggat")}
            </span>
            <input
              type="text"
              value={data.title}
              maxLength={40}
              onChange={(e) => persist({ ...data, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key !== "Escape") e.stopPropagation();
              }}
              placeholder={tx(lang, "e.g. Thesis Defense", "Contoh: Sidang Skripsi")}
              className={`w-full min-w-0 h-8 px-2.5 rounded-[8px] border text-[11.5px] outline-none focus:border-blue-400 ${inputClass} ${TRIGGER_FOCUS_RING}`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-zinc-300">
              {tx(lang, "Target date", "Tanggal target")}
            </span>
            <input
              type="date"
              value={data.targetDate}
              onChange={(e) => persist({ ...data, targetDate: e.target.value })}
              onKeyDown={(e) => {
                if (e.key !== "Escape") e.stopPropagation();
              }}
              className={`w-full min-w-0 h-8 px-2.5 rounded-[8px] border text-[11.5px] outline-none focus:border-blue-400 ${inputClass} ${
                isLight ? "[color-scheme:light]" : "[color-scheme:dark]"
              } ${TRIGGER_FOCUS_RING}`}
            />
          </label>
        </div>

        <div className="flex items-center gap-1.5">
          {[
            { label: tx(lang, "+7 Days", "+7 Hari"), days: 7 },
            { label: tx(lang, "+14 Days", "+14 Hari"), days: 14 },
            { label: tx(lang, "+30 Days", "+30 Hari"), days: 30 },
          ].map((preset) => (
            <button
              key={preset.days}
              type="button"
              onClick={() =>
                persist({
                  ...data,
                  targetDate: getLocalDateKey(new Date(Date.now() + preset.days * 86_400_000)),
                })
              }
              className={`flex-1 min-w-0 px-1 py-1 rounded-[7px] bg-white/[0.07] hover:bg-white/[0.14] text-[10.5px] font-medium text-zinc-200 truncate cursor-pointer transition-colors ${TRIGGER_FOCUS_RING}`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </NavbarPopoverShell>
    </>
  );
};
