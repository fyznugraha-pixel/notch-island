import React, { useState, useEffect, useRef } from "react";
import {
  Battery,
  LayoutGrid,
  Cpu,
  HardDrive,
  Camera,
  Mic,
  Headphones,
  ShieldCheck,
  Radio,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { useSharedSystemMetrics } from "../../services/systemMetricsService";
import { NavbarPopoverShell, CircularRingSvg } from "./NavbarPopoverShell";

// 19. Baterai & daya
export const BatteryPowerNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(87);
  const [charging, setCharging] = useState(false);
  const [powerMode, setPowerMode] = useState<"Hemat daya" | "Seimbang" | "Performa">(
    "Seimbang"
  );

  useEffect(() => {
    invoke<{ percentage: number; is_charging: boolean }>("get_battery_status")
      .then((res) => {
        if (typeof res?.percentage === "number") {
          setPct(Math.round(res.percentage));
          setCharging(Boolean(res.is_charging));
        }
      })
      .catch(() => {});
  }, []);

  const estHours = Math.max(1, Math.floor((pct / 100) * 4.5));
  const estMins = Math.round(((pct / 100) * 270) % 60);

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Baterai ${pct}% (${charging ? "Mengisi daya" : powerMode})`}
      >
        <CircularRingSvg
          size={24}
          strokeWidth={2.4}
          progress={pct / 100}
          color="#10b981"
        >
          <span className="text-[9px] font-bold text-[#6ee7b7] tabular-nums">
            {pct}
          </span>
        </CircularRingSvg>

        {!isCompact && (
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[11.5px] font-bold text-white tabular-nums">
              {charging ? `${pct}% · Mengisi` : `${estHours}j ${estMins}m`}
            </span>
            <span className="text-[10px] text-zinc-400">{powerMode}</span>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Baterai & Mode Daya"
        moduleId="baterai_daya"
        currentView={view}
        config={config}
        width={250}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[18px] font-bold text-white tabular-nums">
                {pct}%
              </div>
              <div className="text-[10.5px] text-emerald-400">
                {charging
                  ? "Terhubung ke pengisi daya"
                  : `Estimasi sisa ${estHours} jam ${estMins} menit`}
              </div>
            </div>
            <Battery size={22} className="text-emerald-400" />
          </div>

          <div className="grid grid-cols-3 gap-1">
            {(["Hemat daya", "Seimbang", "Performa"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPowerMode(m)}
                className={`py-1.5 rounded-[7px] text-[10.5px] font-semibold cursor-pointer transition-colors ${
                  powerMode === m
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-white/[0.04] text-zinc-400 hover:text-white"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              invoke("launch_target", {
                target: "ms-settings:powersleep",
              }).catch(() => {});
              setIsOpen(false);
            }}
            className="h-7 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.11] text-[11px] text-zinc-300 flex items-center justify-center gap-1 cursor-pointer"
          >
            <ExternalLink size={11} />
            <span>Pengaturan Daya Windows</span>
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 22. Desktop virtual
export const VirtualDesktopNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [deskIdx, setDeskIdx] = useState(2);

  const switchDesktop = (dir: "prev" | "next" | "task_view", targetIdx?: number) => {
    invoke("switch_virtual_desktop", { action: dir }).catch(() => {});
    if (typeof targetIdx === "number") {
      setDeskIdx(targetIdx);
    } else if (dir === "prev") {
      setDeskIdx((d) => (d <= 1 ? 3 : d - 1));
    } else if (dir === "next") {
      setDeskIdx((d) => (d >= 3 ? 1 : d + 1));
    }
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Desktop Virtual ${deskIdx} (Klik untuk pindah ruang kerja)`}
      >
        {isCompact ? (
          <LayoutGrid size={15} className="text-zinc-200" />
        ) : (
          <>
            <div className="flex items-center gap-1">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (n < deskIdx) switchDesktop("prev", n);
                    else if (n > deskIdx) switchDesktop("next", n);
                  }}
                  className={`h-[7px] rounded-full transition-all cursor-pointer ${
                    n === deskIdx
                      ? "w-[14px] bg-[#3882F6]"
                      : "w-[7px] bg-zinc-600 hover:bg-zinc-400"
                  }`}
                  title={`Pindah ke Desktop ${n}`}
                />
              ))}
            </div>
            <span className="text-[11.5px] font-semibold text-white">
              Desktop {deskIdx}
            </span>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Desktop Virtual Windows"
        moduleId="desktop_virtual"
        currentView={view}
        config={config}
        width={245}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => switchDesktop("prev")}
              className="flex-1 h-8 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
            >
              <ChevronLeft size={13} />
              <span>Sebelumnya</span>
            </button>
            <button
              type="button"
              onClick={() => switchDesktop("next")}
              className="flex-1 h-8 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>Berikutnya</span>
              <ChevronRight size={13} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              switchDesktop("task_view");
              setIsOpen(false);
            }}
            className="h-8 rounded-[8px] bg-[#3882F6]/20 hover:bg-[#3882F6]/30 border border-[#3882F6]/40 text-[#93c5fd] text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LayoutGrid size={12} />
            <span>Buka Task View (Win+Tab)</span>
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 24. Suhu & GPU
export const GpuTempNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const metrics = useSharedSystemMetrics();
  const gpuLoad = Math.round(
    (metrics as any)?.gpu_usage ??
      Math.min(95, (metrics?.cpu_usage ?? 20) * 1.15)
  );
  const temp = Math.round(
    (metrics as any)?.gpu_temp ?? 48 + gpuLoad * 0.25
  );
  const fanPct = Math.min(100, Math.max(30, Math.round(gpuLoad * 0.75)));
  const bars = [30, 50, 42, 72, 62, Math.max(25, gpuLoad)];

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`relative flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`GPU ${gpuLoad}% · ${temp}°C · Kipas ${fanPct}%`}
      >
        {isCompact ? (
          <>
            <Cpu size={15} className="text-[#fb923c]" />
            <span className="absolute -top-1 -right-1 px-1 h-[15px] rounded-full bg-[#f97316] text-[9px] font-bold text-white flex items-center justify-center">
              {temp}°
            </span>
          </>
        ) : (
          <>
            <div className="flex items-end gap-[2px] h-[15px]">
              {bars.map((val, idx) => (
                <i
                  key={idx}
                  style={{ height: `${Math.max(4, Math.round((val / 100) * 15))}px` }}
                  className={`w-[2.5px] rounded-[1px] ${
                    idx === bars.length - 1 ? "bg-[#fb923c]" : "bg-[#f97316]"
                  }`}
                />
              ))}
            </div>
            <div className="flex flex-col leading-[1.15]">
              <span className="text-[11.5px] font-bold text-white tabular-nums">
                GPU {gpuLoad}%
              </span>
              <span className="text-[10px] text-[#fb923c] tabular-nums">
                {temp}°C · kipas {fanPct}%
              </span>
            </div>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Suhu & Performa GPU"
        moduleId="suhu_gpu"
        currentView={view}
        config={config}
        width={240}
      >
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="p-2 rounded-[8px] bg-white/[0.04]">
              <div className="text-[10px] text-zinc-400">Beban</div>
              <div className="text-[13px] font-bold text-white tabular-nums">
                {gpuLoad}%
              </div>
            </div>
            <div className="p-2 rounded-[8px] bg-white/[0.04]">
              <div className="text-[10px] text-zinc-400">Suhu</div>
              <div className="text-[13px] font-bold text-orange-400 tabular-nums">
                {temp}°C
              </div>
            </div>
            <div className="p-2 rounded-[8px] bg-white/[0.04]">
              <div className="text-[10px] text-zinc-400">Kipas</div>
              <div className="text-[13px] font-bold text-amber-300 tabular-nums">
                {fanPct}%
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              invoke("trigger_task_manager").catch(() => {});
              setIsOpen(false);
            }}
            className="h-7 rounded-[7px] bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 text-[11px] font-semibold cursor-pointer"
          >
            Buka Grafik Performa
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 25. Penyimpanan
export const StorageNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const metrics = useSharedSystemMetrics();
  const freeGb = Math.round((metrics as any)?.disk_free_gb ?? 128);
  const usedPct = Math.round((metrics as any)?.disk_usage ?? 68);

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Penyimpanan: ${freeGb} GB bebas di C:`}
      >
        <CircularRingSvg
          size={24}
          strokeWidth={2.4}
          progress={usedPct / 100}
          color="#10b981"
        >
          <HardDrive size={10} className="text-[#6ee7b7]" />
        </CircularRingSvg>
        {!isCompact && (
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[11.5px] font-bold text-white tabular-nums">
              {freeGb} GB
            </span>
            <span className="text-[10px] text-zinc-400">bebas di C:</span>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Penyimpanan Disk (C:)"
        moduleId="penyimpanan"
        currentView={view}
        config={config}
        width={240}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-zinc-400">Terpakai {usedPct}%</span>
            <span className="font-bold text-emerald-400">{freeGb} GB bebas</span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className="h-full bg-emerald-400"
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                invoke("trigger_file_explorer").catch(() => {});
                setIsOpen(false);
              }}
              className="flex-1 h-7 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-zinc-200 cursor-pointer"
            >
              Buka Explorer
            </button>
            <button
              type="button"
              onClick={() => {
                invoke("launch_target", {
                  target: "ms-settings:storagesense",
                }).catch(() => {});
                setIsOpen(false);
              }}
              className="flex-1 h-7 rounded-[7px] bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold cursor-pointer"
            >
              Storage Sense
            </button>
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 26. Privasi kamera & mik
export const PrivacyCamMicNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [camActive, setCamActive] = useState(false);
  const [micActive, setMicActive] = useState(false);

  const checkPrivacy = () => {
    invoke<{ cam_active: boolean; mic_active: boolean }>("get_privacy_status")
      .then((res) => {
        setCamActive(Boolean(res?.cam_active));
        setMicActive(Boolean(res?.mic_active));
      })
      .catch(() => {});
  };

  useEffect(() => {
    checkPrivacy();
    const id = setInterval(checkPrivacy, 5000);
    return () => clearInterval(id);
  }, []);

  const anyActive = camActive || micActive;

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => {
          checkPrivacy();
          setIsOpen((v) => !v);
        }}
        className={`relative flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : `h-10 px-3 gap-2 rounded-[12px] border ${
                anyActive
                  ? "bg-emerald-500/15 border-emerald-500/35"
                  : "bg-white/[0.06] hover:bg-white/[0.11] border-white/[0.07]"
              }`
        }`}
        title={
          anyActive
            ? `Privasi: ${camActive ? "Kamera " : ""}${micActive ? "Mikrofon " : ""}aktif`
            : "Privasi: Kamera & Mikrofon aman (tidak aktif)"
        }
      >
        <Camera
          size={14}
          className={anyActive ? "text-emerald-400" : "text-zinc-300"}
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
              className={micActive ? "text-emerald-400" : "text-zinc-400"}
            />
            <div className="flex flex-col leading-[1.15]">
              <span
                className={`text-[11px] font-semibold ${
                  anyActive ? "text-emerald-200" : "text-white"
                }`}
              >
                {anyActive ? "Sedang Aktif" : "Privasi Aman"}
              </span>
              <span className="text-[9.5px] text-zinc-400">
                {camActive && micActive
                  ? "Kamera & Mik"
                  : camActive
                  ? "Kamera aktif"
                  : micActive
                  ? "Mikrofon aktif"
                  : "Kamera & Mik mati"}
              </span>
            </div>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Privasi Kamera & Mikrofon"
        moduleId="privasi_kamera_mik"
        currentView={view}
        config={config}
        width={245}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-[8px] bg-white/[0.04]">
            <span className="text-[11.5px] text-zinc-200 flex items-center gap-2">
              <Camera size={13} /> Kamera
            </span>
            <span
              className={`text-[10.5px] font-semibold ${
                camActive ? "text-emerald-400" : "text-zinc-500"
              }`}
            >
              {camActive ? "Digunakan" : "Tidak aktif"}
            </span>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-[8px] bg-white/[0.04]">
            <span className="text-[11.5px] text-zinc-200 flex items-center gap-2">
              <Mic size={13} /> Mikrofon
            </span>
            <span
              className={`text-[10.5px] font-semibold ${
                micActive ? "text-emerald-400" : "text-zinc-500"
              }`}
            >
              {micActive ? "Digunakan" : "Tidak aktif"}
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
            className="h-7 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-zinc-300 cursor-pointer"
          >
            Pengaturan Izin Privasi
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 27. Baterai perangkat
export const DeviceBatteryNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [devName, setDevName] = useState("Headset BT");
  const [devBat, setDevBat] = useState(82);

  useEffect(() => {
    invoke<any>("get_bluetooth_status")
      .then((res) => {
        if (Array.isArray(res?.connected_devices) && res.connected_devices.length > 0) {
          const first = res.connected_devices[0];
          if (first.name) setDevName(first.name);
          if (typeof first.battery === "number") setDevBat(first.battery);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`relative flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`Baterai Perangkat (${devName}): ${devBat}%`}
      >
        <Headphones size={15} className="text-[#10b981] shrink-0" />
        {isCompact ? (
          <span className="absolute -top-1 -right-1 px-1 h-[15px] rounded-full bg-[#10b981] text-[9px] font-bold text-[#052e16] flex items-center justify-center">
            {devBat}%
          </span>
        ) : (
          <>
            <div className="flex flex-col leading-[1.15] min-w-0">
              <span className="text-[11.5px] font-semibold text-white truncate max-w-[90px]">
                {devName}
              </span>
              <span className="text-[10px] text-[#34d399] tabular-nums">
                {devBat}%
              </span>
            </div>
            <div className="w-[22px] h-[9px] rounded-[3px] border border-emerald-400 p-[1px] flex items-center">
              <i
                className="h-full bg-emerald-400 rounded-[1px]"
                style={{ width: `${devBat}%` }}
              />
            </div>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Baterai Perangkat Bluetooth"
        moduleId="baterai_perangkat"
        currentView={view}
        config={config}
        width={240}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between p-2 rounded-[8px] bg-white/[0.04]">
            <span className="text-[11.5px] text-white font-semibold truncate">
              {devName}
            </span>
            <span className="text-[12px] font-bold text-emerald-400 tabular-nums">
              {devBat}%
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              invoke("launch_target", {
                target: "ms-settings:bluetooth",
              }).catch(() => {});
              setIsOpen(false);
            }}
            className="h-7 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-zinc-300 cursor-pointer"
          >
            Kelola Perangkat Bluetooth
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};

// 28. Hotspot & VPN
export const HotspotVpnNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [hotspotOn, setHotspotOn] = useState(false);
  const [vpnOn, setVpnOn] = useState(true);

  useEffect(() => {
    invoke<{ enabled: boolean }>("get_hotspot_status")
      .then((res) => {
        if (typeof res?.enabled === "boolean") setHotspotOn(res.enabled);
      })
      .catch(() => {});
  }, []);

  const handleToggleHotspot = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = !hotspotOn;
    setHotspotOn(next);
    try {
      await invoke("toggle_hotspot", { enable: next });
    } catch {}
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={`VPN: ${vpnOn ? "Aktif" : "Mati"} · Hotspot: ${
          hotspotOn ? "Aktif" : "Mati"
        }`}
      >
        <ShieldCheck
          size={15}
          className={vpnOn ? "text-[#10b981]" : "text-zinc-400"}
        />
        {!isCompact && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setVpnOn((v) => !v);
              }}
              className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-[6px] transition-colors cursor-pointer ${
                vpnOn
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-white/[0.06] text-zinc-400"
              }`}
            >
              VPN
            </button>
            <button
              type="button"
              onClick={handleToggleHotspot}
              className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-[6px] transition-colors cursor-pointer ${
                hotspotOn
                  ? "bg-sky-500/20 text-sky-300"
                  : "bg-white/[0.06] text-zinc-400"
              }`}
            >
              Hotspot
            </button>
          </div>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Hotspot & VPN"
        moduleId="hotspot_vpn"
        currentView={view}
        config={config}
        width={240}
      >
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => handleToggleHotspot()}
            className={`h-8 px-3 rounded-[8px] text-[11.5px] font-semibold flex items-center justify-between cursor-pointer ${
              hotspotOn
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                : "bg-white/[0.05] text-zinc-300"
            }`}
          >
            <span className="flex items-center gap-2">
              <Radio size={13} /> Mobile Hotspot
            </span>
            <span>{hotspotOn ? "Aktif" : "Mati"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              invoke("launch_target", { target: "ms-settings:network-vpn" }).catch(
                () => {}
              );
              setIsOpen(false);
            }}
            className="h-8 px-3 rounded-[8px] bg-white/[0.05] hover:bg-white/[0.1] text-[11.5px] text-zinc-200 flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <ShieldCheck size={13} className="text-emerald-400" /> Pengaturan VPN
            </span>
            <ExternalLink size={12} />
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
