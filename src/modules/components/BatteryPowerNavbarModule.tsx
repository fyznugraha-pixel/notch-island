import React, { useState, useEffect, useRef, useCallback } from "react";
import { Battery, BatteryCharging, Plug, ExternalLink } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import {
  NavbarPopoverShell,
  CircularRingSvg,
  useNavbarIsLightSurface,
} from "./NavbarPopoverShell";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

interface SystemPowerInfo {
  is_charging: boolean;
  percent: number;
  seconds_remaining: number | null;
  battery_saver: boolean;
}

function formatRemaining(seconds: number | null, lang: "en" | "id"): string {
  if (typeof seconds !== "number" || seconds <= 0) {
    return tx(lang, "Estimating...", "Menghitung sisa...");
  }
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  const hUnit = tx(lang, "h", "j");
  return hrs > 0 ? `${hrs}${hUnit} ${mins}m` : `${mins}m`;
}

export const BatteryPowerNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const [power, setPower] = useState<SystemPowerInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadPower = useCallback(async () => {
    try {
      const info = await invoke<SystemPowerInfo | null>("get_system_power_info");
      setPower(info);
    } catch {
      setPower(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadPower();
    const id = setInterval(loadPower, 15000);
    return () => clearInterval(id);
  }, [loadPower]);

  const handleToggle = () => {
    if (!isOpen) loadPower();
    setIsOpen((v) => !v);
  };

  const pct = power ? Math.min(100, Math.max(0, power.percent)) : null;
  const ringColor = power?.battery_saver
    ? "#f59e0b"
    : pct !== null && pct <= 20 && !power?.is_charging
    ? "#ef4444"
    : "#10b981";
  const pctTextColor = power?.battery_saver
    ? "text-amber-300"
    : pct !== null && pct <= 20 && !power?.is_charging
    ? "text-red-300"
    : "text-[#6ee7b7]";

  const statusText = !loaded
    ? tx(lang, "Loading power...", "Memuat daya...")
    : !power
    ? tx(lang, "AC Power (Desktop)", "Sumber AC (Desktop)")
    : power.is_charging
    ? tx(lang, "Charging", "Mengisi daya")
    : power.battery_saver
    ? tx(lang, "Battery saver active", "Penghemat baterai aktif")
    : formatRemaining(power.seconds_remaining, lang);

  const tooltipText =
    pct !== null
      ? tx(lang, `Battery ${pct}% (${statusText})`, `Baterai ${pct}% (${statusText})`)
      : tx(lang, "System Power: AC Power Source", "Daya Sistem: Sumber Listrik AC");

  return (
    <>
      <Tooltip
        content={tooltipText}
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
            tx(
              lang,
              `Battery & Power: ${pct !== null ? `${pct}%` : "AC Power"}`,
              `Baterai & Daya: ${pct !== null ? `${pct}%` : "Sumber AC"}`
            ),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? isVertical
                ? "gili-mod-compact gili-mod-vertical justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
                : "gili-mod-compact justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
              : "gili-mod-pill px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          {pct !== null ? (
            <CircularRingSvg
              size={26}
              strokeWidth={2.2}
              progress={pct / 100}
              color={ringColor}
            >
              <span
                className={`leading-none ${pctTextColor} ${
                  pct >= 100
                    ? "text-[7.5px] font-extrabold tracking-[-0.05em]"
                    : "text-[8.5px] font-bold tracking-tight tabular-nums"
                }`}
              >
                {pct}
              </span>
            </CircularRingSvg>
          ) : (
            <Plug size={15} className="text-emerald-400 shrink-0" />
          )}

          {!isCompact && (
            <div className="flex flex-col leading-[1.15] min-w-0 max-w-[125px]">
              <span className="text-[11.5px] font-bold text-white tabular-nums truncate">
                {pct !== null
                  ? power?.is_charging
                    ? tx(lang, `${pct}% · Charging`, `${pct}% · Mengisi`)
                    : `${pct}% · ${formatRemaining(power?.seconds_remaining ?? null, lang)}`
                  : tx(lang, "AC Power", "Daya AC")}
              </span>
              <span className="text-[10px] text-zinc-400 truncate">
                {power?.battery_saver
                  ? tx(lang, "Power Saver", "Hemat Daya")
                  : power
                  ? power.is_charging
                    ? tx(lang, "Plugged in", "Terhubung charger")
                    : tx(lang, "Battery Mode", "Mode Baterai")
                  : tx(lang, "No battery", "Tanpa baterai")}
              </span>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Battery & Power", "Baterai & Daya Sistem")}
        moduleId="baterai_daya"
        currentView={view}
        config={config}
        width={268}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2 min-w-0 p-2 rounded-[9px] bg-white/[0.04]">
            <div className="min-w-0 flex-1">
              <div className="text-[18px] font-bold text-white tabular-nums">
                {pct !== null ? `${pct}%` : tx(lang, "AC Power", "Sumber AC")}
              </div>
              <div className="text-[10.5px] text-emerald-400 truncate">{statusText}</div>
            </div>
            {power?.is_charging ? (
              <BatteryCharging size={22} className="text-emerald-400 shrink-0" />
            ) : power ? (
              <Battery size={22} className="text-emerald-400 shrink-0" />
            ) : (
              <Plug size={20} className="text-emerald-400 shrink-0" />
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              invoke("launch_target", { target: "ms-settings:powersleep" }).catch(
                () => {}
              );
              setIsOpen(false);
            }}
            className={`w-full h-7 px-2.5 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.11] text-[11px] text-zinc-200 flex items-center justify-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            <ExternalLink size={11} className="shrink-0" />
            <span className="truncate">
              {tx(lang, "Windows Power Settings", "Pengaturan Daya Windows")}
            </span>
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
