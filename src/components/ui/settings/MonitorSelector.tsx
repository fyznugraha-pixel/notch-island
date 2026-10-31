import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, RefreshCw, Check } from "lucide-react";
import { t } from "../../../services/i18n";

export interface MonitorInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  scale_factor: number;
  is_primary: boolean;
  is_current: boolean;
}

interface MonitorSelectorProps {
  value: string;
  onChange: (monitorId: string) => void;
  isLightMode?: boolean;
}

export const MonitorSelector: React.FC<MonitorSelectorProps> = ({
  value,
  onChange,
  isLightMode = false,
}) => {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const fetchMonitors = useCallback(async () => {
    setIsScanning(true);
    try {
      const list = await invoke<MonitorInfo[]>("get_available_monitors");
      if (Array.isArray(list)) {
        setMonitors(list);
      }
    } catch {
      // Silently keep previous monitor state if invoke fails
    } finally {
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    fetchMonitors();
  }, [fetchMonitors]);

  const handleSelectMonitor = (monitorId: string) => {
    onChange(monitorId);
  };

  const isMonitorSelected = (m: MonitorInfo) => {
    if (!value || value === "primary" || value === "auto") {
      return m.is_primary;
    }
    return m.id === value;
  };

  return (
    <div className="flex flex-col gap-2.5 px-3 py-2.5 rounded-[12px] hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center shrink-0 bg-[#142333] text-[#3882f6]">
            <Monitor size={18} />
          </div>
          <div className="flex flex-col">
            <span
              className={`text-[13px] font-semibold leading-tight ${
                isLightMode ? "text-neutral-900" : "text-white"
              }`}
            >
              {t("settings_monitor")}
            </span>
            <span
              className={`text-[10.5px] leading-tight mt-0.5 ${
                isLightMode ? "text-neutral-500" : "text-[#71717a]"
              }`}
            >
              {t("settings_monitor_desc")}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchMonitors}
          disabled={isScanning}
          title={t("settings_monitor_rescan")}
          aria-label={t("settings_monitor_rescan")}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-[11px] font-medium transition-all ${
            isLightMode
              ? "bg-black/5 hover:bg-black/10 text-neutral-600 disabled:opacity-50"
              : "bg-white/[0.06] hover:bg-white/[0.1] text-[#a1a1aa] hover:text-white disabled:opacity-50"
          }`}
        >
          <RefreshCw size={11} className={isScanning ? "animate-spin" : ""} />
          <span>{isScanning ? t("settings_monitor_scanning") : t("settings_monitor_rescan")}</span>
        </button>
      </div>

      {monitors.length <= 1 ? (
        <div
          className={`flex flex-col gap-1.5 p-3 rounded-[10px] border ${
            isLightMode
              ? "bg-black/[0.02] border-black/10 text-neutral-700"
              : "bg-white/[0.03] border-white/5 text-[#a1a1aa]"
          }`}
        >
          {monitors.length === 1 ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span
                  className={`text-[12px] font-medium ${
                    isLightMode ? "text-neutral-900" : "text-white"
                  }`}
                >
                  {monitors[0].name}
                </span>
                <span className="text-[10.5px] opacity-70">
                  ({monitors[0].width} × {monitors[0].height})
                </span>
              </div>
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[10px] font-semibold">
                <Check size={11} />
                <span>Aktif</span>
              </div>
            </div>
          ) : (
            <span className="text-[11.5px]">
              {isScanning ? t("settings_monitor_scanning") : t("settings_monitor_auto")}
            </span>
          )}
          <span className="text-[10.5px] opacity-60 leading-relaxed">
            {t("settings_monitor_single")}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mt-1">
          {monitors.map((m, index) => {
            const isSelected = isMonitorSelected(m);
            return (
              <button
                key={m.id || index}
                type="button"
                onClick={() => handleSelectMonitor(m.id)}
                className={`relative flex flex-col p-2.5 rounded-[10px] border text-left transition-all cursor-pointer ${
                  isSelected
                    ? isLightMode
                      ? "bg-blue-50/80 border-[#0a84ff] shadow-sm ring-1 ring-[#0a84ff]/30"
                      : "bg-[#0a84ff]/10 border-[#0a84ff] shadow-[0_0_12px_rgba(10,132,255,0.2)] ring-1 ring-[#0a84ff]/30"
                    : isLightMode
                    ? "bg-black/[0.02] border-black/10 hover:bg-black/[0.04] hover:border-black/20"
                    : "bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10"
                }`}
              >
                <div className="flex items-start justify-between w-full mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Monitor
                      size={14}
                      className={
                        isSelected
                          ? "text-[#0a84ff]"
                          : isLightMode
                          ? "text-neutral-500"
                          : "text-[#71717a]"
                      }
                    />
                    <span
                      className={`text-[12px] font-semibold leading-none ${
                        isSelected
                          ? isLightMode
                            ? "text-blue-900"
                            : "text-white"
                          : isLightMode
                          ? "text-neutral-800"
                          : "text-[#d4d4d8]"
                      }`}
                    >
                      Monitor {index + 1}
                    </span>
                  </div>

                  {isSelected && (
                    <div className="w-4 h-4 rounded-full bg-[#0a84ff] flex items-center justify-center shrink-0 shadow-sm">
                      <Check size={10} className="text-white stroke-[2.5]" />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {m.is_primary && (
                    <span className="px-1 py-0.2 rounded bg-amber-500/15 text-amber-500 text-[9.5px] font-semibold leading-tight">
                      {t("settings_monitor_primary_badge")}
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-mono ${
                      isLightMode ? "text-neutral-500" : "text-[#71717a]"
                    }`}
                  >
                    {m.width} × {m.height}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

