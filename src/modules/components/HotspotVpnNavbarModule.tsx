import React, { useState, useEffect, useRef, useCallback } from "react";
import { ShieldCheck, Radio, ExternalLink } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

interface VpnStatus {
  connected: boolean;
  name: string | null;
}

export const HotspotVpnNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const [hotspotOn, setHotspotOn] = useState(false);
  const [vpn, setVpn] = useState<VpnStatus>({ connected: false, name: null });
  const [hotspotErr, setHotspotErr] = useState<string | null>(null);

  const loadConnectivity = useCallback(async () => {
    try {
      const hs = await invoke<boolean>("get_hotspot_status");
      setHotspotOn(Boolean(hs));
    } catch {}
    try {
      const v = await invoke<VpnStatus>("get_vpn_status");
      if (v) setVpn({ connected: Boolean(v.connected), name: v.name || null });
    } catch {}
  }, []);

  useEffect(() => {
    loadConnectivity();
    const id = setInterval(loadConnectivity, 12000);
    return () => clearInterval(id);
  }, [loadConnectivity]);

  const handleToggleHotspot = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setHotspotErr(null);
    const next = !hotspotOn;
    setHotspotOn(next);
    try {
      const confirmed = await invoke<boolean>("toggle_hotspot", { enable: next });
      setHotspotOn(Boolean(confirmed));
    } catch {
      setHotspotOn(!next);
      setHotspotErr(
        tx(lang, "Failed to toggle Mobile Hotspot.", "Gagal mengubah Mobile Hotspot.")
      );
    }
  };

  const openVpnSettings = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    invoke("launch_target", { target: "ms-settings:network-vpn" }).catch(
      () => {}
    );
    setIsOpen(false);
  };

  const handleTogglePopover = () => {
    if (!isOpen) loadConnectivity();
    setIsOpen((v) => !v);
  };

  const outerTip = `VPN: ${
    vpn.connected ? vpn.name || tx(lang, "Active", "Aktif") : tx(lang, "Off", "Mati")
  } · Hotspot: ${hotspotOn ? tx(lang, "Active", "Aktif") : tx(lang, "Off", "Mati")}`;

  return (
    <>
      <Tooltip
        content={outerTip}
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
            `VPN: ${vpn.connected ? tx(lang, "On", "Aktif") : tx(lang, "Off", "Mati")}, Hotspot: ${
              hotspotOn ? tx(lang, "On", "Aktif") : tx(lang, "Off", "Mati")
            }`,
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? isVertical
                ? "gili-mod-compact gili-mod-vertical justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
                : "gili-mod-compact justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
              : "gili-mod-pill px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <ShieldCheck
            size={15}
            className={vpn.connected ? "text-[#10b981] shrink-0" : "text-zinc-400 shrink-0"}
          />
          {!isCompact && (
            <div
              className="flex items-center gap-1.5 shrink-0"
              onMouseEnter={() => setSuppressOuterTip(true)}
              onMouseLeave={() => setSuppressOuterTip(false)}
            >
              <Tooltip
                content={tx(lang, "Open Windows VPN Settings", "Buka Pengaturan VPN Windows")}
                side={tooltipSide}
                isLightMode={isLight}
              >
                <button
                  type="button"
                  onClick={openVpnSettings}
                  className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-[6px] transition-colors cursor-pointer ${TRIGGER_FOCUS_RING} ${
                    vpn.connected
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-white/[0.06] text-zinc-300 hover:text-white"
                  }`}
                >
                  {vpn.connected ? "VPN On" : "VPN"}
                </button>
              </Tooltip>
              <Tooltip
                content={tx(lang, "Toggle Mobile Hotspot", "Alihkan Mobile Hotspot")}
                side={tooltipSide}
                isLightMode={isLight}
              >
                <button
                  type="button"
                  onClick={handleToggleHotspot}
                  className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-[6px] transition-colors cursor-pointer ${TRIGGER_FOCUS_RING} ${
                    hotspotOn
                      ? "bg-sky-500/20 text-sky-300"
                      : "bg-white/[0.06] text-zinc-300 hover:text-white"
                  }`}
                >
                  Hotspot
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
        title="Hotspot & VPN"
        moduleId="hotspot_vpn"
        currentView={view}
        config={config}
        width={264}
      >
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => handleToggleHotspot()}
            className={`w-full min-w-0 overflow-hidden h-8 px-3 rounded-[8px] text-[11.5px] font-semibold flex items-center justify-between gap-2 cursor-pointer ${TRIGGER_FOCUS_RING} ${
              hotspotOn
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                : "bg-white/[0.05] text-zinc-200 hover:bg-white/[0.09]"
            }`}
          >
            <span className="flex items-center gap-2 min-w-0 flex-1">
              <Radio size={13} className="shrink-0" />
              <span className="truncate">Mobile Hotspot</span>
            </span>
            <span className="shrink-0">
              {hotspotOn ? tx(lang, "On", "Aktif") : tx(lang, "Off", "Mati")}
            </span>
          </button>

          <button
            type="button"
            onClick={openVpnSettings}
            className={`w-full min-w-0 overflow-hidden h-8 px-3 rounded-[8px] bg-white/[0.05] hover:bg-white/[0.1] text-[11.5px] text-zinc-200 flex items-center justify-between gap-2 cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            <span className="flex items-center gap-2 min-w-0 flex-1">
              <ShieldCheck
                size={13}
                className={vpn.connected ? "text-emerald-400 shrink-0" : "text-zinc-400 shrink-0"}
              />
              <span className="truncate min-w-0">
                {vpn.connected
                  ? vpn.name || tx(lang, "VPN Active", "VPN Aktif")
                  : tx(lang, "VPN Settings", "Pengaturan VPN")}
              </span>
            </span>
            <ExternalLink size={12} className="shrink-0" />
          </button>

          {hotspotErr && (
            <div className="text-[10.5px] text-rose-400">{hotspotErr}</div>
          )}
        </div>
      </NavbarPopoverShell>
    </>
  );
};
