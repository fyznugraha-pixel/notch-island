import React, { useState, useEffect, useRef, useCallback } from "react";
import { HardDrive } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, CircularRingSvg, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

interface StorageDriveInfo {
  letter: string;
  free_gb: number;
  total_gb: number;
  used_pct: number;
}

export const StorageNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const [drives, setDrives] = useState<StorageDriveInfo[]>([]);

  const loadStorage = useCallback(async () => {
    try {
      const list = await invoke<StorageDriveInfo[]>("get_storage_drives");
      if (Array.isArray(list)) setDrives(list);
    } catch {}
  }, []);

  useEffect(() => {
    loadStorage();
    const id = setInterval(loadStorage, 30000);
    return () => clearInterval(id);
  }, [loadStorage]);

  const handleToggle = () => {
    if (!isOpen) loadStorage();
    setIsOpen((v) => !v);
  };

  const primary =
    drives.find((d) => d.letter.toUpperCase().startsWith("C")) || drives[0];
  const freeLabel = primary ? `${Math.round(primary.free_gb)} GB` : "--";
  const usedPct = primary ? primary.used_pct : 0;
  const driveLetter = primary?.letter || "C:";

  return (
    <>
      <Tooltip
        content={tx(
          lang,
          `Storage ${driveLetter}: ${freeLabel} free (${usedPct}% used)`,
          `Penyimpanan ${driveLetter}: ${freeLabel} bebas (${usedPct}% terpakai)`
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
            tx(
              lang,
              `Storage ${driveLetter} ${freeLabel} free`,
              `Penyimpanan ${driveLetter} bebas ${freeLabel}`
            ),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "gili-mod-pill px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <CircularRingSvg
            size={24}
            strokeWidth={2.4}
            progress={usedPct / 100}
            color={usedPct >= 90 ? "#ef4444" : "#10b981"}
          >
            <HardDrive
              size={10}
              className={isLight ? "text-emerald-700" : "text-[#6ee7b7]"}
            />
          </CircularRingSvg>
          {!isCompact && (
            <div className="flex flex-col leading-[1.15] min-w-0 max-w-[110px]">
              <span className="text-[11.5px] font-bold text-white tabular-nums truncate">
                {freeLabel}
              </span>
              <span className="text-[10px] text-zinc-400 truncate">
                {tx(lang, `free on ${driveLetter}`, `bebas di ${driveLetter}`)}
              </span>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Disk Storage", "Penyimpanan Disk")}
        moduleId="penyimpanan"
        currentView={view}
        config={config}
        width={268}
      >
        <div className="flex flex-col gap-2.5">
          {drives.length === 0 ? (
            <div className="text-[11px] text-zinc-400 py-2 text-center">
              {tx(lang, "Loading disk info...", "Memuat informasi disk...")}
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto pr-0.5">
              {drives.map((d) => (
                <div key={d.letter} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                    <span className="text-zinc-200 font-semibold truncate min-w-0 flex-1">
                      Drive {d.letter} ({d.used_pct}%)
                    </span>
                    <span
                      className={`font-bold tabular-nums shrink-0 ${
                        isLight ? "text-emerald-700" : "text-emerald-400"
                      }`}
                    >
                      {d.free_gb} / {d.total_gb} GB
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <div
                      className={`h-full ${
                        d.used_pct >= 90 ? "bg-rose-400" : "bg-emerald-400"
                      }`}
                      style={{ width: `${d.used_pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                invoke("trigger_file_explorer").catch(() => {});
                setIsOpen(false);
              }}
              className={`flex-1 min-w-0 px-2 h-7 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-zinc-200 truncate cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              {tx(lang, "Open Explorer", "Buka Explorer")}
            </button>
            <button
              type="button"
              onClick={() => {
                invoke("launch_target", {
                  target: "ms-settings:storagesense",
                }).catch(() => {});
                setIsOpen(false);
              }}
              className={`flex-1 min-w-0 px-2 h-7 rounded-[7px] text-[11px] font-semibold truncate cursor-pointer ${TRIGGER_FOCUS_RING} ${
                isLight
                  ? "bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700"
                  : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
              }`}
            >
              Storage Sense
            </button>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
