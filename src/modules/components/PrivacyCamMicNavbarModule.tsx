import React, { useState, useEffect, useRef, useCallback } from "react";
import { Camera, Mic } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

interface PrivacyEventPayload {
  cam: boolean;
  mic: boolean;
}

export const PrivacyCamMicNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const [camActive, setCamActive] = useState(false);
  const [micActive, setMicActive] = useState(false);

  const checkPrivacy = useCallback(() => {
    invoke<[boolean, boolean]>("get_privacy_status")
      .then((res) => {
        if (Array.isArray(res)) {
          setCamActive(Boolean(res[0]));
          setMicActive(Boolean(res[1]));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    checkPrivacy();
    const unlisten = listen<PrivacyEventPayload>("privacy-update", (ev) => {
      if (ev.payload) {
        setCamActive(Boolean(ev.payload.cam));
        setMicActive(Boolean(ev.payload.mic));
      }
    });
    const id = setInterval(checkPrivacy, 5000);
    return () => {
      unlisten.then((fn) => fn());
      clearInterval(id);
    };
  }, [checkPrivacy]);

  const anyActive = camActive || micActive;
  const handleToggle = () => {
    if (!isOpen) checkPrivacy();
    setIsOpen((v) => !v);
  };

  const activeDevicesText = `${camActive ? tx(lang, "Camera ", "Kamera ") : ""}${
    micActive ? tx(lang, "Microphone", "Mikrofon") : ""
  }`.trim();
  const privacyTooltip = anyActive
    ? tx(
        lang,
        `Privacy: ${activeDevicesText} active`,
        `Privasi: ${activeDevicesText} aktif`
      )
    : tx(
        lang,
        "Privacy: Camera & Mic safe (inactive)",
        "Privasi: Kamera & Mikrofon aman (tidak aktif)"
      );
  const privacyAria = anyActive
    ? tx(
        lang,
        `Privacy active: ${activeDevicesText}`,
        `Privasi aktif: ${activeDevicesText}`
      )
    : tx(
        lang,
        "Camera and microphone privacy safe",
        "Privasi kamera dan mikrofon aman"
      );

  return (
    <>
      <Tooltip
        content={privacyTooltip}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(handleToggle, privacyAria, isOpen)}
          className={`relative flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `${
                  isVertical ? "w-full max-w-full" : "w-10"
                } h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : `h-10 px-3 gap-2 rounded-[12px] border ${
                  anyActive
                    ? isLight
                      ? "bg-emerald-600/15 border-emerald-600/35"
                      : "bg-emerald-500/15 border-emerald-500/35"
                    : "bg-white/[0.06] hover:bg-white/[0.11] border-white/[0.07]"
                }`
          }`}
        >
          <Camera
            size={14}
            className={
              anyActive
                ? isLight
                  ? "text-emerald-700 shrink-0"
                  : "text-emerald-400 shrink-0"
                : "text-zinc-300 shrink-0"
            }
          />
          {isCompact ? (
            <span
              className={`absolute top-1.5 right-1.5 w-[7px] h-[7px] rounded-full ${
                anyActive ? "bg-emerald-400" : "bg-zinc-500"
              }`}
            />
          ) : (
            <>
              <Mic
                size={14}
                className={
                  micActive
                    ? isLight
                      ? "text-emerald-700 shrink-0"
                      : "text-emerald-400 shrink-0"
                    : "text-zinc-400 shrink-0"
                }
              />
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[115px]">
                <span
                  className={`text-[11px] font-semibold truncate ${
                    anyActive
                      ? isLight
                        ? "text-emerald-700"
                        : "text-emerald-200"
                      : "text-white"
                  }`}
                >
                  {anyActive
                    ? tx(lang, "In Use", "Sedang Aktif")
                    : tx(lang, "Privacy Safe", "Privasi Aman")}
                </span>
                <span className="text-[9.5px] text-zinc-400 truncate">
                  {camActive && micActive
                    ? tx(lang, "Camera & Mic", "Kamera & Mik")
                    : camActive
                    ? tx(lang, "Camera active", "Kamera aktif")
                    : micActive
                    ? tx(lang, "Mic active", "Mikrofon aktif")
                    : tx(lang, "Camera & Mic off", "Kamera & Mik mati")}
                </span>
              </div>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Camera & Mic Privacy", "Privasi Kamera & Mikrofon")}
        moduleId="privasi_kamera_mik"
        currentView={view}
        config={config}
        width={268}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[8px] bg-white/[0.04] min-w-0">
            <span className="text-[11.5px] text-zinc-200 flex items-center gap-2 min-w-0">
              <Camera size={13} className="shrink-0" />{" "}
              <span className="truncate">{tx(lang, "Camera", "Kamera")}</span>
            </span>
            <span
              className={`text-[10.5px] font-semibold shrink-0 ${
                camActive
                  ? isLight
                    ? "text-emerald-700"
                    : "text-emerald-400"
                  : "text-zinc-400"
              }`}
            >
              {camActive
                ? tx(lang, "In Use", "Digunakan")
                : tx(lang, "Inactive", "Tidak aktif")}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[8px] bg-white/[0.04] min-w-0">
            <span className="text-[11.5px] text-zinc-200 flex items-center gap-2 min-w-0">
              <Mic size={13} className="shrink-0" />{" "}
              <span className="truncate">{tx(lang, "Microphone", "Mikrofon")}</span>
            </span>
            <span
              className={`text-[10.5px] font-semibold shrink-0 ${
                micActive
                  ? isLight
                    ? "text-emerald-700"
                    : "text-emerald-400"
                  : "text-zinc-400"
              }`}
            >
              {micActive
                ? tx(lang, "In Use", "Digunakan")
                : tx(lang, "Inactive", "Tidak aktif")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              invoke("launch_target", {
                target: "ms-settings:privacy-webcam",
              }).catch(() => {});
              setIsOpen(false);
            }}
            className={`w-full px-2.5 h-7 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-zinc-200 truncate cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            {tx(lang, "Privacy Permission Settings", "Pengaturan Izin Privasi")}
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
