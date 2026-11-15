import React, { useState, useEffect, useRef, useCallback } from "react";
import { Moon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

export const FocusNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const [dnd, setDnd] = useState(false);

  const syncDnd = useCallback(async () => {
    try {
      const val = await invoke<boolean>("get_windows_dnd");
      setDnd(Boolean(val));
    } catch {}
  }, []);

  useEffect(() => {
    syncDnd();
    const id = setInterval(syncDnd, 6000);
    window.addEventListener("focus", syncDnd);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", syncDnd);
    };
  }, [syncDnd]);

  const toggleDnd = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = !dnd;
    setDnd(next);
    try {
      await invoke("set_windows_dnd", { enabled: next });
      await invoke("set_windows_banners_hidden", { hidden: next });
    } catch {
      syncDnd();
    }
  };

  const handleTogglePopover = () => {
    if (!isOpen) syncDnd();
    setIsOpen((v) => !v);
  };

  const outerTooltip = tx(
    lang,
    `Focus Mode: ${dnd ? "Active (Notifications muted)" : "Off"}`,
    `Mode Fokus: ${dnd ? "Aktif (Notifikasi dibisukan)" : "Nonaktif"}`
  );

  return (
    <>
      <Tooltip
        content={outerTooltip}
        side={tooltipSide}
        disabled={isOpen || suppressOuterTip}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : ""}
      >
        <div
          ref={anchorRef}
          onClick={handleTogglePopover}
          {...makeTriggerA11yProps(
            handleTogglePopover,
            tx(
              lang,
              `Focus Mode: ${dnd ? "On" : "Off"}`,
              `Mode Fokus: ${dnd ? "Aktif" : "Nonaktif"}`
            ),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `${
                  isVertical ? "w-full max-w-full" : "w-10"
                } h-10 justify-center rounded-[12px] ${
                  dnd
                    ? "bg-purple-500/20 border border-purple-500/40"
                    : "bg-white/[0.06] hover:bg-white/[0.11]"
                }`
              : `h-10 px-3 gap-2.5 rounded-[12px] border ${
                  dnd
                    ? "bg-purple-500/20 border-purple-500/40"
                    : "bg-white/[0.06] hover:bg-white/[0.11] border-white/[0.07]"
                }`
          }`}
        >
          <Moon
            size={15}
            className={dnd ? "text-[#c084fc] shrink-0" : "text-zinc-300 shrink-0"}
          />
          {!isCompact && (
            <>
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[95px]">
                <span
                  className={`text-[11.5px] font-semibold truncate ${
                    dnd ? "text-[#e9d5ff]" : "text-white"
                  }`}
                >
                  {tx(lang, "Focus", "Fokus")}
                </span>
                <span
                  className={`text-[10px] truncate ${
                    dnd ? "text-[#c084fc]" : "text-zinc-400"
                  }`}
                >
                  {dnd ? tx(lang, "On · muted", "Aktif · bisu") : tx(lang, "Off", "Nonaktif")}
                </span>
              </div>
              <div
                onMouseEnter={() => setSuppressOuterTip(true)}
                onMouseLeave={() => setSuppressOuterTip(false)}
              >
                <Tooltip
                  content={tx(lang, "Toggle Focus Mode", "Alihkan Mode Fokus")}
                  side={tooltipSide}
                  isLightMode={isLight}
                >
                  <button
                    type="button"
                    onClick={toggleDnd}
                    aria-label={tx(lang, "Toggle Focus Mode", "Alihkan Mode Fokus")}
                    className={`w-[26px] h-[15px] rounded-full relative transition-colors cursor-pointer shrink-0 ${TRIGGER_FOCUS_RING} ${
                      dnd ? "bg-[#a855f7]" : isLight ? "bg-zinc-300" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`absolute top-[2px] w-[11px] h-[11px] rounded-full bg-white transition-all ${
                        dnd ? "right-[2px]" : "left-[2px]"
                      }`}
                    />
                  </button>
                </Tooltip>
              </div>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Focus Mode (Do Not Disturb)", "Mode Fokus (Jangan Ganggu)")}
        moduleId="mode_fokus"
        currentView={view}
        config={config}
        width={264}
      >
        <div className="flex flex-col gap-2.5">
          <div className="text-[11px] text-zinc-300 leading-snug">
            {tx(
              lang,
              "When enabled, Windows notification banners are muted so you can stay focused.",
              "Saat aktif, banner notifikasi Windows dibisukan agar kamu tetap fokus."
            )}
          </div>
          <button
            type="button"
            onClick={() => toggleDnd()}
            className={`w-full px-3 h-8 rounded-[9px] text-[11.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${TRIGGER_FOCUS_RING} ${
              dnd
                ? "bg-purple-500 hover:bg-purple-600 text-[#ffffff]"
                : "bg-white/[0.08] hover:bg-white/[0.14] text-zinc-200"
            }`}
          >
            <Moon size={13} className="shrink-0" />
            <span className="truncate">
              {dnd
                ? tx(lang, "Turn Off Focus Mode", "Matikan Mode Fokus")
                : tx(lang, "Turn On Focus Mode", "Aktifkan Mode Fokus")}
            </span>
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
