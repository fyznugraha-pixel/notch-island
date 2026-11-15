import React, { useState, useEffect, useRef, useCallback } from "react";
import { Headphones } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import {
  BluetoothDeviceItem,
  BluetoothStatus,
} from "../../services/connectivityService";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import { Tooltip } from "../../components/ui/Tooltip";

export const DeviceBatteryNavbarModule: React.FC<NavbarModuleProps> = ({
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
  const [btEnabled, setBtEnabled] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<BluetoothDeviceItem[]>([]);

  const loadDevices = useCallback(async () => {
    try {
      const res = await invoke<BluetoothStatus>("get_bluetooth_status");
      setBtEnabled(Boolean(res?.enabled));
      if (Array.isArray(res?.devices)) {
        setConnectedDevices(res.devices.filter((d) => d.is_connected));
      } else {
        setConnectedDevices([]);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadDevices();
    const id = setInterval(loadDevices, 15000);
    return () => clearInterval(id);
  }, [loadDevices]);

  const handleToggle = () => {
    if (!isOpen) loadDevices();
    setIsOpen((v) => !v);
  };

  const primary =
    connectedDevices.find((d) => typeof d.battery === "number") ||
    connectedDevices[0];
  const devName =
    primary?.name ||
    (btEnabled ? tx(lang, "No BT device", "Tidak ada BT") : tx(lang, "Bluetooth Off", "Bluetooth Mati"));
  const devBat = typeof primary?.battery === "number" ? primary.battery : null;
  const tooltipText =
    devBat !== null
      ? tx(lang, `Device Battery (${devName}): ${devBat}%`, `Baterai Perangkat (${devName}): ${devBat}%`)
      : tx(lang, `Bluetooth Device: ${devName}`, `Perangkat Bluetooth: ${devName}`);

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
            tx(lang, `Device Battery: ${devName}`, `Baterai Perangkat: ${devName}`),
            isOpen
          )}
          className={`relative flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? isVertical
                ? "w-full max-w-full h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
                : "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
              : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <Headphones
            size={15}
            className={primary ? "text-[#10b981] shrink-0" : "text-zinc-400 shrink-0"}
          />
          {isCompact ? (
            devBat !== null && (
              <span className="absolute -top-1 -right-1 px-1 h-[15px] rounded-full bg-[#10b981] text-[9px] font-bold text-[#052e16] flex items-center justify-center tabular-nums">
                {devBat}%
              </span>
            )
          ) : (
            <>
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[100px]">
                <span className="text-[11.5px] font-semibold text-white truncate">
                  {devName}
                </span>
                <span className="text-[10px] text-[#34d399] tabular-nums truncate">
                  {devBat !== null
                    ? `${devBat}%`
                    : primary
                    ? tx(lang, "Connected", "Terhubung")
                    : tx(lang, "Disconnected", "Tidak terhubung")}
                </span>
              </div>
              {devBat !== null && (
                <div className="w-[22px] h-[9px] rounded-[3px] border border-emerald-400 p-[1px] flex items-center shrink-0">
                  <i
                    className="h-full bg-emerald-400 rounded-[1px]"
                    style={{ width: `${devBat}%` }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Bluetooth Device Battery", "Baterai Perangkat Bluetooth")}
        moduleId="baterai_perangkat"
        currentView={view}
        config={config}
        width={272}
      >
        <div className="flex flex-col gap-2">
          {connectedDevices.length === 0 ? (
            <div className="text-[11px] text-zinc-400 py-2 text-center">
              {btEnabled
                ? tx(lang, "No Bluetooth devices connected.", "Tidak ada perangkat Bluetooth terhubung.")
                : tx(lang, "Bluetooth is currently off.", "Bluetooth sedang dimatikan.")}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-[150px] overflow-y-auto pr-0.5">
              {connectedDevices.map((d) => (
                <div
                  key={d.name}
                  className="w-full min-w-0 overflow-hidden flex items-center justify-between gap-2 p-2 rounded-[8px] bg-white/[0.04]"
                >
                  <span className="text-[11.5px] text-white font-semibold truncate min-w-0 flex-1">
                    {d.name}
                  </span>
                  <span className="text-[11.5px] font-bold text-emerald-400 tabular-nums shrink-0">
                    {typeof d.battery === "number"
                      ? `${d.battery}%`
                      : tx(lang, "Active", "Aktif")}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              invoke("launch_target", {
                target: "ms-settings:bluetooth",
              }).catch(() => {});
              setIsOpen(false);
            }}
            className={`w-full px-2.5 h-7 rounded-[7px] bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-zinc-200 truncate cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            {tx(lang, "Manage Bluetooth Devices", "Kelola Perangkat Bluetooth")}
          </button>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
