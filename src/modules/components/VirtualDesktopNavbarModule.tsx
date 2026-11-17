import React, { useState, useEffect, useRef, useCallback } from "react";
import { LayoutGrid, ChevronLeft, ChevronRight } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

interface VirtualDesktopState {
  current: number;
  count: number;
  names: string[];
  supported: boolean;
}

export const VirtualDesktopNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const anchorRef = useRef<HTMLDivElement>(null);
  const [vdState, setVdState] = useState<VirtualDesktopState>({
    current: 1,
    count: 1,
    names: ["Desktop 1"],
    supported: true,
  });

  const syncDesktop = useCallback(async () => {
    try {
      const state = await invoke<VirtualDesktopState>("get_virtual_desktop_state");
      if (state && typeof state.current === "number") {
        setVdState(state);
      }
    } catch {}
  }, []);

  useEffect(() => {
    syncDesktop();
    const id = setInterval(syncDesktop, 3500);
    window.addEventListener("focus", syncDesktop);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", syncDesktop);
    };
  }, [syncDesktop]);

  const stepDesktop = async (dir: "prev" | "next" | "task_view") => {
    try {
      await invoke("switch_virtual_desktop", { action: dir });
      setTimeout(syncDesktop, 120);
    } catch {}
  };

  const jumpToDesktop = async (targetIndex: number) => {
    try {
      const nextState = await invoke<VirtualDesktopState>(
        "switch_to_virtual_desktop",
        { targetIndex }
      );
      if (nextState) setVdState(nextState);
    } catch {}
  };

  const handleToggle = () => {
    if (!isOpen) syncDesktop();
    setIsOpen((v) => !v);
  };

  const currentLabel =
    vdState.names[vdState.current - 1] || `Desktop ${vdState.current}`;

  return (
    <>
      <Tooltip
        content={`${currentLabel} (${vdState.current}/${vdState.count})`}
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
            `${tx(lang, "Virtual Desktop", "Desktop Virtual")}: ${currentLabel}`,
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "gili-mod-pill px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          {isCompact ? (
            <LayoutGrid size={15} className="text-zinc-200" />
          ) : (
            <>
              <div
                className="flex items-center gap-1"
                onMouseEnter={() => setSuppressOuterTip(true)}
                onMouseLeave={() => setSuppressOuterTip(false)}
              >
                {Array.from({ length: vdState.count }).map((_, i) => {
                  const idx = i + 1;
                  const desktopName = vdState.names[i] || `Desktop ${idx}`;
                  return (
                    <Tooltip
                      key={idx}
                      content={desktopName}
                      side={tooltipSide}
                      isLightMode={isLight}
                    >
                      <button
                        type="button"
                        aria-label={desktopName}
                        onClick={(e) => {
                          e.stopPropagation();
                          jumpToDesktop(idx);
                        }}
                        className={`h-[7px] rounded-full transition-all cursor-pointer ${TRIGGER_FOCUS_RING} ${
                          idx === vdState.current
                            ? "w-[14px] bg-[#3882F6]"
                            : isLight
                            ? "w-[7px] bg-zinc-400 hover:bg-zinc-600"
                            : "w-[7px] bg-zinc-600 hover:bg-zinc-400"
                        }`}
                      />
                    </Tooltip>
                  );
                })}
              </div>
              <span className="text-[11.5px] font-semibold text-white truncate max-w-[95px]">
                {currentLabel}
              </span>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Windows Virtual Desktop", "Desktop Virtual Windows")}
        moduleId="desktop_virtual"
        currentView={view}
        config={config}
        width={266}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1 max-h-[120px] overflow-y-auto pr-0.5">
            {vdState.names.map((name, i) => {
              const idx = i + 1;
              const active = idx === vdState.current;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => jumpToDesktop(idx)}
                  className={`w-full min-w-0 overflow-hidden flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[8px] text-[11px] text-left cursor-pointer ${TRIGGER_FOCUS_RING} ${
                    active
                      ? isLight
                        ? "bg-blue-600/15 border border-blue-600/40 text-zinc-900 font-semibold"
                        : "bg-[#3882F6]/20 border border-[#3882F6]/40 text-white font-semibold"
                      : "bg-white/[0.04] hover:bg-white/[0.09] text-zinc-200"
                  }`}
                >
                  <span className="truncate min-w-0 flex-1">{name}</span>
                  {active && (
                    <span
                      className={`text-[9.5px] shrink-0 ${
                        isLight ? "text-blue-700" : "text-sky-300"
                      }`}
                    >
                      {tx(lang, "Active", "Aktif")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => stepDesktop("prev")}
              className={`flex-1 min-w-0 h-8 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              <ChevronLeft size={13} className="shrink-0" />
              <span>{tx(lang, "Left", "Kiri")}</span>
            </button>
            <button
              type="button"
              onClick={() => stepDesktop("next")}
              className={`flex-1 min-w-0 h-8 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              <span>{tx(lang, "Right", "Kanan")}</span>
              <ChevronRight size={13} className="shrink-0" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              stepDesktop("task_view");
              setIsOpen(false);
            }}
            className={`w-full h-8 px-2.5 rounded-[8px] border text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${TRIGGER_FOCUS_RING} ${
              isLight
                ? "bg-blue-600/15 hover:bg-blue-600/25 border-blue-600/35 text-blue-700"
                : "bg-[#3882F6]/20 hover:bg-[#3882F6]/30 border-[#3882F6]/40 text-[#93c5fd]"
            }`}
          >
            <LayoutGrid size={12} className="shrink-0" />
            <span className="truncate">
              {tx(lang, "Open Task View (Win+Tab)", "Buka Task View (Win+Tab)")}
            </span>
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
