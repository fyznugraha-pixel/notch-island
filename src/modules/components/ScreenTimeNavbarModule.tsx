import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ExternalLink, Hourglass, RotateCcw } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { getLocalDateKey } from "../../utils/dateTime";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import type { Language } from "../../services/i18n";

const SCREEN_TIME_OFFSET_KEY = "gili_screen_time_offset_v1";
const TARGET_DAILY_SECONDS = 4 * 3600;

interface WindowsScreenTimeInfo {
  date_key: string;
  active_seconds: number;
  uptime_awake_seconds: number;
}

interface ScreenTimeOffsetStore {
  dateKey: string;
  offsetSeconds: number;
}

function loadOffsetStore(dateKey: string): ScreenTimeOffsetStore {
  try {
    const raw = localStorage.getItem(SCREEN_TIME_OFFSET_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed?.dateKey === dateKey &&
        typeof parsed?.offsetSeconds === "number" &&
        parsed.offsetSeconds >= 0
      ) {
        return { dateKey, offsetSeconds: parsed.offsetSeconds };
      }
    }
  } catch {}
  return { dateKey, offsetSeconds: 0 };
}

function persistOffsetStore(next: ScreenTimeOffsetStore) {
  try {
    localStorage.setItem(SCREEN_TIME_OFFSET_KEY, JSON.stringify(next));
  } catch {}
}

function formatDuration(totalSeconds: number, lang: Language): string {
  const mins = Math.floor(Math.max(0, totalSeconds) / 60);
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours === 0) return `${remMins}m`;
  return `${hours}${tx(lang, "h", "j")} ${remMins}m`;
}

export const ScreenTimeNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const [windowsInfo, setWindowsInfo] = useState<WindowsScreenTimeInfo>(() => ({
    date_key: getLocalDateKey(),
    active_seconds: 0,
    uptime_awake_seconds: 0,
  }));
  const [offsetStore, setOffsetStore] = useState<ScreenTimeOffsetStore>(() =>
    loadOffsetStore(getLocalDateKey())
  );
  const anchorRef = useRef<HTMLDivElement>(null);

  const loadScreenTime = useCallback(async () => {
    try {
      const info = await invoke<WindowsScreenTimeInfo>("get_windows_screen_time");
      if (info && typeof info.active_seconds === "number") {
        setWindowsInfo(info);
        setOffsetStore((prev) => {
          if (prev.dateKey === info.date_key) return prev;
          const fresh = loadOffsetStore(info.date_key);
          persistOffsetStore(fresh);
          return fresh;
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadScreenTime();
    const id = window.setInterval(loadScreenTime, 15_000);
    return () => window.clearInterval(id);
  }, [loadScreenTime]);

  const activeOffset =
    offsetStore.dateKey === windowsInfo.date_key ? offsetStore.offsetSeconds : 0;
  const displayedSeconds = Math.max(0, windowsInfo.active_seconds - activeOffset);

  const handleResetOrRestore = () => {
    const nextOffset = activeOffset > 0 ? 0 : windowsInfo.active_seconds;
    const next: ScreenTimeOffsetStore = {
      dateKey: windowsInfo.date_key,
      offsetSeconds: nextOffset,
    };
    setOffsetStore(next);
    persistOffsetStore(next);
  };

  const formatted = formatDuration(displayedSeconds, lang);
  const pct = Math.min(100, Math.round((displayedSeconds / TARGET_DAILY_SECONDS) * 100));
  const handleToggle = () => {
    if (!isOpen) loadScreenTime();
    setIsOpen((v) => !v);
  };

  return (
    <>
      <Tooltip
        content={tx(
          lang,
          `Today's Windows active time: ${formatted}`,
          `Waktu aktif Windows hari ini: ${formatted}`
        )}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            tx(lang, `Screen time ${formatted}`, `Waktu layar ${formatted}`),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `${
                  isVertical ? "w-full max-w-full" : "w-10"
                } h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "h-10 px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <Hourglass size={15} className="text-sky-400 shrink-0" />
          {!isCompact && (
            <div className="flex flex-col leading-[1.15] min-w-0 max-w-[100px]">
              <span className="text-[12px] font-bold text-white tabular-nums truncate">
                {formatted}
              </span>
              <span className="text-[10px] text-zinc-300 truncate">
                {tx(lang, "Screen time", "Waktu layar")}
              </span>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Windows Screen Time", "Waktu Layar Windows")}
        moduleId="waktu_layar"
        currentView={view}
        config={config}
        width={268}
      >
        <div className="flex items-center justify-between gap-2 min-w-0 p-2.5 rounded-[11px] bg-white/[0.05] border border-white/[0.1]">
          <div className="min-w-0 flex-1">
            <div className="text-[18px] font-bold text-white tabular-nums leading-tight">
              {formatted}
            </div>
            <div className="text-[10px] text-zinc-300 truncate">
              {tx(
                lang,
                `Active today (${windowsInfo.date_key})`,
                `Aktif hari ini (${windowsInfo.date_key})`
              )}
            </div>
          </div>
          <Tooltip
            content={
              activeOffset > 0
                ? tx(lang, "Restore Windows daily total", "Kembalikan total Windows hari ini")
                : tx(lang, "Reset today's counter", "Reset penghitung hari ini")
            }
            side="top"
            isLightMode={isLight}
          >
            <button
              type="button"
              onClick={handleResetOrRestore}
              aria-label={
                activeOffset > 0
                  ? tx(lang, "Restore Windows daily total", "Kembalikan total Windows hari ini")
                  : tx(lang, "Reset screen time counter", "Reset penghitung waktu layar")
              }
              className={`w-7 h-7 shrink-0 rounded-[7px] bg-white/[0.08] hover:bg-white/[0.16] flex items-center justify-center text-zinc-200 cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              <RotateCcw size={12} />
            </button>
          </Tooltip>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-[10.5px] text-zinc-300 min-w-0">
            <span className="truncate min-w-0 flex-1">
              {tx(lang, "Usage vs daily limit (4h)", "Pemakaian vs batas harian (4j)")}
            </span>
            <span className="tabular-nums font-semibold shrink-0">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.1] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                backgroundColor: pct >= 90 ? "#f59e0b" : "#38bdf8",
              }}
            />
          </div>
          <p className="text-[9.5px] text-zinc-400 leading-snug mt-0.5">
            {tx(
              lang,
              "Synced with Windows active awake time today (excludes sleep & hibernate).",
              "Disinkronkan dari waktu aktif Windows hari ini (tidak termasuk sleep & hibernate)."
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            invoke("launch_target", { target: "ms-settings:powersleep" }).catch(() => {});
            setIsOpen(false);
          }}
          className={`w-full h-7 px-2.5 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.11] text-[11px] text-zinc-200 flex items-center justify-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING}`}
        >
          <ExternalLink size={11} className="shrink-0" />
          <span className="truncate">
            {tx(lang, "Windows Power & Screen Settings", "Pengaturan Daya & Layar Windows")}
          </span>
        </button>
      </NavbarPopoverShell>
    </>
  );
};
