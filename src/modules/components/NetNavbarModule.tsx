import React, { useState, useEffect, useRef, useCallback } from "react";
import { Wifi, WifiOff, RefreshCw, ExternalLink } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { NavbarModuleProps } from "../registry";
import { useSharedSystemMetrics } from "../../services/systemMetricsService";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { WifiStatus } from "../../services/connectivityService";
import { Tooltip } from "../../components/ui/Tooltip";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

export const NetNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const metrics = useSharedSystemMetrics();
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [wifiStatus, setWifiStatus] = useState<WifiStatus | null>(null);
  const [testing, setTesting] = useState(false);

  const downMbps = Number((metrics?.wifi_down_mbps ?? 0).toFixed(1));
  const upMbps = Number((metrics?.wifi_up_mbps ?? 0).toFixed(1));

  const formatSpeed = (mbps: number) =>
    `${mbps} ${tx(lang, "Mbps", "Mb/s")}`;

  const refreshNetwork = useCallback(async (probeLatency = true) => {
    if (probeLatency) setTesting(true);
    try {
      const wifi = await invoke<WifiStatus>("get_wifi_status");
      setWifiStatus(wifi);
    } catch {}

    if (probeLatency) {
      const t0 = performance.now();
      try {
        await fetch("https://www.gstatic.com/generate_204", {
          mode: "no-cors",
          cache: "no-store",
        });
        setPingMs(Math.max(1, Math.round(performance.now() - t0)));
      } catch {
        setPingMs(null);
      }
      setTesting(false);
    }
  }, []);

  useEffect(() => {
    refreshNetwork(true);
    const unlistenPing = listen<number | null>("network-ping", (ev) => {
      setPingMs(typeof ev.payload === "number" ? ev.payload : null);
    });
    return () => {
      unlistenPing.then((fn) => fn());
    };
  }, [refreshNetwork]);

  const connectedSsid = wifiStatus?.connected_ssid?.trim();
  const isOnline =
    Boolean(connectedSsid) || pingMs !== null || downMbps > 0 || upMbps > 0;
  const networkLabel = connectedSsid
    ? connectedSsid
    : wifiStatus && !wifiStatus.enabled
    ? tx(lang, "Wi-Fi Off", "Wi-Fi Mati")
    : pingMs !== null
    ? tx(lang, "Connected", "Terhubung")
    : tx(lang, "Offline", "Luring");

  const pingLabel = pingMs !== null ? `${pingMs} ms` : tx(lang, "Offline", "Luring");

  const handleToggle = () => {
    if (!isOpen) refreshNetwork(true);
    setIsOpen((v) => !v);
  };

  const netTitle = `${tx(lang, "Network", "Jaringan")} (${networkLabel})`;
  const netTooltip = `${netTitle} · ↓ ${formatSpeed(downMbps)} · ↑ ${formatSpeed(
    upMbps
  )} · ${pingLabel}`;

  return (
    <>
      <Tooltip
        content={netTooltip}
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
            `${tx(lang, "Network", "Jaringan")} ${networkLabel}`,
            isOpen
          )}
          className={`relative flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `${
                  isVertical ? "w-full max-w-full" : "w-10"
                } h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          {isOnline ? (
            <Wifi size={15} className="text-[#10b981] shrink-0" />
          ) : (
            <WifiOff size={15} className="text-zinc-400 shrink-0" />
          )}
          {isCompact ? (
            <span
              className={`absolute bottom-1.5 right-1.5 w-[6px] h-[6px] rounded-full ${
                isOnline ? "bg-[#10b981]" : "bg-zinc-500"
              }`}
            />
          ) : (
            <div className="flex flex-col leading-[1.15] min-w-0 max-w-[130px]">
              <span className="text-[11.5px] font-bold text-white tabular-nums truncate">
                ↓ {formatSpeed(downMbps)}
              </span>
              <span className="text-[10px] text-zinc-400 tabular-nums truncate">
                ↑ {upMbps} · {pingLabel}
              </span>
            </div>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={netTitle}
        moduleId="jaringan"
        currentView={view}
        config={config}
        width={272}
      >
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="min-w-0 overflow-hidden px-1.5 py-2 rounded-[8px] bg-white/[0.04] border border-white/[0.08]">
              <div className="text-[10px] text-zinc-400">
                {tx(lang, "Download", "Unduh")}
              </div>
              <div className="text-[11px] font-bold text-emerald-400 tabular-nums mt-0.5 truncate">
                {formatSpeed(downMbps)}
              </div>
            </div>
            <div className="min-w-0 overflow-hidden px-1.5 py-2 rounded-[8px] bg-white/[0.04] border border-white/[0.08]">
              <div className="text-[10px] text-zinc-400">
                {tx(lang, "Upload", "Unggah")}
              </div>
              <div className="text-[11px] font-bold text-sky-400 tabular-nums mt-0.5 truncate">
                {formatSpeed(upMbps)}
              </div>
            </div>
            <div className="min-w-0 overflow-hidden px-1.5 py-2 rounded-[8px] bg-white/[0.04] border border-white/[0.08]">
              <div className="text-[10px] text-zinc-400">Ping</div>
              <div className="text-[11px] font-bold text-amber-300 tabular-nums mt-0.5 truncate">
                {pingLabel}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => refreshNetwork(true)}
              className={`flex-1 min-w-0 h-7 px-2 rounded-[7px] bg-white/[0.07] hover:bg-white/[0.13] text-[11px] text-zinc-200 flex items-center justify-center gap-1.5 cursor-pointer ${TRIGGER_FOCUS_RING}`}
            >
              <RefreshCw size={11} className={`shrink-0 ${testing ? "animate-spin" : ""}`} />
              <span className="truncate">{tx(lang, "Test Ping", "Uji Ping")}</span>
            </button>
            <Tooltip
              content={tx(lang, "Windows Wi-Fi Settings", "Pengaturan Wi-Fi Windows")}
              side="top"
              isLightMode={isLight}
            >
              <button
                type="button"
                onClick={() => {
                  invoke("launch_target", {
                    target: "ms-settings:network-wifi",
                  }).catch(() => {});
                  setIsOpen(false);
                }}
                className={`h-7 px-2.5 shrink-0 rounded-[7px] text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${TRIGGER_FOCUS_RING} ${
                  isLight
                    ? "bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700"
                    : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
                }`}
              >
                <ExternalLink size={11} className="shrink-0" />
                <span>Wi-Fi</span>
              </button>
            </Tooltip>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
