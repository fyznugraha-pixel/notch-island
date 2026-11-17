import React, { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Camera, Crop, Monitor } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { launchSystemTarget } from "../../services/taskbarLaunchService";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

export const ScreenshotNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const [suppressOuterTip, setSuppressOuterTip] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const showTempStatus = (msg: string) => {
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(null), 1800);
  };

  const handleSnipArea = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsOpen(false);
    try {
      await launchSystemTarget("ms-screenclip:");
    } catch {
      showTempStatus(
        tx(lang, "Failed to open Snipping Tool", "Gagal membuka Snipping Tool")
      );
    }
  };

  const handleFullscreenShot = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsOpen(false);
    try {
      await invoke("trigger_fullscreen_screenshot");
    } catch {
      showTempStatus(
        tx(
          lang,
          "Failed to capture fullscreen screenshot",
          "Gagal mengambil tangkapan layar penuh"
        )
      );
    }
  };

  const handleToggle = () => setIsOpen((v) => !v);

  return (
    <>
      <Tooltip
        content={tx(
          lang,
          "Screenshot (Snip Area / Fullscreen)",
          "Tangkap layar (Snip Area / Layar Penuh)"
        )}
        side={tooltipSide}
        disabled={isOpen || suppressOuterTip}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            tx(lang, "Screenshot", "Tangkap layar"),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "gili-mod-pill px-2.5 gap-1.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <Camera size={16} className="text-zinc-200 shrink-0" />
          {!isCompact && (
            <div
              className="flex items-center gap-1 ml-0.5"
              onMouseEnter={() => setSuppressOuterTip(true)}
              onMouseLeave={() => setSuppressOuterTip(false)}
            >
              <Tooltip
                content={tx(lang, "Select Area (Snipping Tool)", "Pilih Area (Snipping Tool)")}
                side={tooltipSide}
                isLightMode={isLight}
              >
                <button
                  type="button"
                  onClick={handleSnipArea}
                  className={`px-2 py-1 rounded-[7px] bg-white/[0.09] hover:bg-white/[0.18] text-[10.5px] font-semibold text-white cursor-pointer transition-colors ${TRIGGER_FOCUS_RING}`}
                >
                  Area
                </button>
              </Tooltip>
              <Tooltip
                content={tx(lang, "Capture Fullscreen", "Tangkap Layar Penuh")}
                side={tooltipSide}
                isLightMode={isLight}
              >
                <button
                  type="button"
                  onClick={handleFullscreenShot}
                  className={`px-2 py-1 rounded-[7px] bg-white/[0.09] hover:bg-white/[0.18] text-[10.5px] font-semibold text-white cursor-pointer transition-colors ${TRIGGER_FOCUS_RING}`}
                >
                  {tx(lang, "Screen", "Layar")}
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Screenshot", "Tangkap Layar")}
        moduleId="tangkap_layar"
        currentView={view}
        config={config}
        width={256}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleSnipArea}
            className={`min-w-0 overflow-hidden flex flex-col items-center gap-1.5 px-2 py-3 rounded-[10px] bg-white/[0.06] hover:bg-white/[0.13] border border-white/[0.1] text-white cursor-pointer transition-colors ${TRIGGER_FOCUS_RING}`}
          >
            <Crop size={18} className="text-sky-400 shrink-0" />
            <span className="text-[11px] font-semibold truncate max-w-full">
              {tx(lang, "Select Area", "Pilih Area")}
            </span>
            <span className="text-[9.5px] text-zinc-400 truncate max-w-full">
              Snipping Tool
            </span>
          </button>
          <button
            type="button"
            onClick={handleFullscreenShot}
            className={`min-w-0 overflow-hidden flex flex-col items-center gap-1.5 px-2 py-3 rounded-[10px] bg-white/[0.06] hover:bg-white/[0.13] border border-white/[0.1] text-white cursor-pointer transition-colors ${TRIGGER_FOCUS_RING}`}
          >
            <Monitor size={18} className="text-emerald-400 shrink-0" />
            <span className="text-[11px] font-semibold truncate max-w-full">
              {tx(lang, "Fullscreen", "Layar Penuh")}
            </span>
            <span className="text-[9.5px] text-zinc-400 truncate max-w-full">
              {tx(lang, "PrtScn + Save", "PrtScn + Simpan")}
            </span>
          </button>
        </div>

        {statusMsg && (
          <div
            className={`text-[10.5px] text-center ${
              isLight ? "text-rose-700" : "text-rose-300"
            }`}
          >
            {statusMsg}
          </div>
        )}
      </NavbarPopoverShell>
    </>
  );
};
