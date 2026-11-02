import React, { useState, useEffect, useRef } from "react";
import { Wifi, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { useSharedSystemMetrics } from "../../services/systemMetricsService";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

export const NetNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const metrics = useSharedSystemMetrics();
  const [pingMs, setPingMs] = useState(24);
  const [ssid, setSsid] = useState("Terhubung");

  const downMbps = Number((metrics?.wifi_down_mbps ?? 12.4).toFixed(1));
  const upMbps = Number((metrics?.wifi_up_mbps ?? 2.1).toFixed(1));

  const formatSpeed = (mbps: number) => {
    return `${mbps} Mb/s`;
  };

  const measurePing = async () => {
    const t0 = performance.now();
    try {
      await fetch("https://www.gstatic.com/generate_204", {
        mode: "no-cors",
        cache: "no-store",
      });
      const elapsed = Math.max(5, Math.round(performance.now() - t0));
      setPingMs(elapsed);
    } catch {}
    try {
      const wifi: any = await invoke("get_wifi_status");
      if (wifi?.ssid) setSsid(wifi.ssid);
    } catch {}
  };

  useEffect(() => {
    measurePing();
  }, []);

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => {
          measurePing();
          setIsOpen((v) => !v);
        }}
        className={`relative flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Jaringan (${ssid}) · ↓ ${formatSpeed(downMbps)} · ↑ ${formatSpeed(upMbps)} · ping ${pingMs} ms`}
      >
        <Wifi size={15} className="text-[#10b981] shrink-0" />
        {isCompact ? (
          <span className="absolute bottom-1.5 right-1.5 w-[6px] h-[6px] rounded-full bg-[#10b981]" />
        ) : (
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[11.5px] font-bold text-white tabular-nums">
              ↓ {formatSpeed(downMbps)}
            </span>
            <span className="text-[10px] text-zinc-400 tabular-nums">
              ↑ {upMbps} · ping {pingMs} ms
            </span>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={`Jaringan (${ssid})`}
        moduleId="jaringan"
        currentView={view}
        config={config}
        width={245}
      >
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="p-2 rounded-[8px] bg-white/[0.04] border border-white/[0.06]">
              <div className="text-[10px] text-zinc-400">Unduh</div>
              <div className="text-[11.5px] font-bold text-emerald-400 tabular-nums mt-0.5">
                {formatSpeed(downMbps)}
              </div>
            </div>
            <div className="p-2 rounded-[8px] bg-white/[0.04] border border-white/[0.06]">
              <div className="text-[10px] text-zinc-400">Unggah</div>
              <div className="text-[11.5px] font-bold text-sky-400 tabular-nums mt-0.5">
                {formatSpeed(upMbps)}
              </div>
            </div>
            <div className="p-2 rounded-[8px] bg-white/[0.04] border border-white/[0.06]">
              <div className="text-[10px] text-zinc-400">Ping</div>
              <div className="text-[11.5px] font-bold text-amber-300 tabular-nums mt-0.5">
                {pingMs} ms
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={measurePing}
            className="h-7 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.11] text-[11px] text-zinc-200 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={11} />
            <span>Uji Ping Sekarang</span>
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
