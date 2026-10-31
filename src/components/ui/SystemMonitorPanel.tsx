import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cpu, Monitor, Wifi, HardDrive } from "lucide-react";
import { t } from "../../services/i18n";

export interface SystemMetrics {
  cpu_usage: number;
  cpu_speed_ghz: number;
  cpu_temp_c: number;
  cpu_cores: number[];
  process_count: number;
  top_process: string;
  top_process_cpu: number;
  gpu_usage: number;
  gpu_temp_c: number;
  gpu_vram_gb: number;
  mem_used_gb: number;
  mem_total_gb: number;
  mem_usage: number;
  wifi_down_mbps: number;
  wifi_up_mbps: number;
  wifi_usage: number;
}

export interface SystemMonitorPanelProps {
  ping?: number | null;
  wifiSsid?: string;
}

type SubTab = "summary" | "cpu" | "gpu" | "wifi" | "memory";

function buildSparklinePoints(history: number[], width: number, height: number, padX = 0): {
  linePoints: string;
  areaPoints: string;
} {
  const usableW = width - padX;
  const topY = 4;
  const bottomY = height - 2;
  const rangeY = bottomY - topY;
  const pts = history.map((val, i) => {
    const x = padX + (i / Math.max(1, history.length - 1)) * usableW;
    const clamped = Math.max(0, Math.min(100, val));
    const y = bottomY - (clamped / 100) * rangeY;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePoints = pts.join(" ");
  const areaPoints = `${padX},${bottomY} ${linePoints} ${width},${bottomY}`;
  return { linePoints, areaPoints };
}

export const SystemMonitorPanel: React.FC<SystemMonitorPanelProps> = ({
  ping,
  wifiSsid,
}) => {
  const [subTab, setSubTab] = useState<SubTab>("summary");
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpu_usage: 24,
    cpu_speed_ghz: 3.6,
    cpu_temp_c: 54,
    cpu_cores: [22, 34, 18, 41, 15, 20, 29, 17],
    process_count: 210,
    top_process: "System",
    top_process_cpu: 3,
    gpu_usage: 19,
    gpu_temp_c: 49,
    gpu_vram_gb: 1.2,
    mem_used_gb: 8.4,
    mem_total_gb: 16.0,
    mem_usage: 53,
    wifi_down_mbps: 12.4,
    wifi_up_mbps: 2.1,
    wifi_usage: 15,
  });

  const [cpuHistory, setCpuHistory] = useState<number[]>(() => Array(20).fill(24));
  const [gpuHistory, setGpuHistory] = useState<number[]>(() => Array(20).fill(18));
  const [wifiHistory, setWifiHistory] = useState<number[]>(() => Array(20).fill(14));
  const [memHistory, setMemHistory] = useState<number[]>(() => Array(20).fill(53));

  useEffect(() => {
    let mounted = true;
    const fetchMetrics = async () => {
      try {
        const res = await invoke<SystemMetrics>("get_system_metrics");
        if (!mounted) return;
        setMetrics(res);
        setCpuHistory((prev) => [...prev.slice(1), res.cpu_usage]);
        setGpuHistory((prev) => [...prev.slice(1), res.gpu_usage]);
        setWifiHistory((prev) => [...prev.slice(1), res.wifi_usage]);
        setMemHistory((prev) => [...prev.slice(1), res.mem_usage]);
      } catch {
        // ignore
      }
    };

    fetchMetrics();
    const id = window.setInterval(fetchMetrics, 1500);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="flex flex-col w-full h-full min-h-0 px-6 pb-1 select-none text-white">
      {/* Sub-tab Selector Bar (Ringkasan | CPU | GPU | Wi-Fi | Memori) */}
      <div
        role="tablist"
        className="flex gap-0.5 p-0.5 bg-[#121216] rounded-[10px] border border-white/5 shrink-0 mb-1.5"
      >
        {[
          { id: "summary" as const, label: t("sys_summary"), dot: null },
          { id: "cpu" as const, label: "CPU", dot: "#3882F6" },
          { id: "gpu" as const, label: "GPU", dot: "#A78BFA" },
          { id: "wifi" as const, label: "Wi-Fi", dot: "#34C3A0" },
          { id: "memory" as const, label: t("sys_memory"), dot: "#F5B531" },
        ].map((tab) => {
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubTab(tab.id)}
              className={`flex-1 h-5.5 rounded-[8px] flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                active ? "bg-[#2a2a31] text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab.dot && (
                <span
                  style={{ backgroundColor: tab.dot }}
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                />
              )}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0">
        {subTab === "summary" ? (
          <div className="h-full grid grid-cols-2 grid-rows-2 gap-1.5">
            {/* CPU Card */}
            {(() => {
              const { linePoints, areaPoints } = buildSparklinePoints(cpuHistory, 108, 26);
              return (
                <div
                  onClick={() => setSubTab("cpu")}
                  className="bg-[#101015] hover:bg-[#14141b] border border-[#1e1e25] rounded-2xl px-3 py-1.5 flex flex-col justify-between min-w-0 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-4.5 h-4.5 rounded-full bg-[#3882F6]/15 text-[#8DB8FF] flex items-center justify-center shrink-0">
                      <Cpu size={11} />
                    </span>
                    <span className="text-[11.5px] font-semibold">CPU</span>
                    <span className="ml-auto text-[10px] text-zinc-400 tabular-nums truncate">
                      {metrics.cpu_speed_ghz} GHz · {metrics.cpu_temp_c}°C
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="tabular-nums whitespace-nowrap">
                      <span className="text-[19px] font-semibold tracking-tight leading-none">
                        {metrics.cpu_usage}
                      </span>
                      <span className="text-[10.5px] text-zinc-400 ml-0.5">%</span>
                    </div>
                    <svg width="108" height="26" viewBox="0 0 108 26" className="shrink-0">
                      <polygon points={areaPoints} fill="#3882F6" fillOpacity="0.16" />
                      <polyline
                        points={linePoints}
                        fill="none"
                        stroke="#3882F6"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <div className="h-1 rounded-full bg-[#1d1d25] overflow-hidden">
                    <div
                      style={{ width: `${metrics.cpu_usage}%` }}
                      className="h-full rounded-full bg-[#3882F6] transition-all duration-300"
                    />
                  </div>
                </div>
              );
            })()}

            {/* GPU Card */}
            {(() => {
              const { linePoints, areaPoints } = buildSparklinePoints(gpuHistory, 108, 26);
              return (
                <div
                  onClick={() => setSubTab("gpu")}
                  className="bg-[#101015] hover:bg-[#14141b] border border-[#1e1e25] rounded-2xl px-3 py-1.5 flex flex-col justify-between min-w-0 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-4.5 h-4.5 rounded-full bg-[#A78BFA]/15 text-[#C4B5FD] flex items-center justify-center shrink-0">
                      <Monitor size={11} />
                    </span>
                    <span className="text-[11.5px] font-semibold">GPU</span>
                    <span className="ml-auto text-[10px] text-zinc-400 tabular-nums truncate">
                      {metrics.gpu_temp_c}°C · {metrics.gpu_vram_gb} GB VRAM
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="tabular-nums whitespace-nowrap">
                      <span className="text-[19px] font-semibold tracking-tight leading-none">
                        {metrics.gpu_usage}
                      </span>
                      <span className="text-[10.5px] text-zinc-400 ml-0.5">%</span>
                    </div>
                    <svg width="108" height="26" viewBox="0 0 108 26" className="shrink-0">
                      <polygon points={areaPoints} fill="#A78BFA" fillOpacity="0.16" />
                      <polyline
                        points={linePoints}
                        fill="none"
                        stroke="#A78BFA"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <div className="h-1 rounded-full bg-[#1d1d25] overflow-hidden">
                    <div
                      style={{ width: `${metrics.gpu_usage}%` }}
                      className="h-full rounded-full bg-[#A78BFA] transition-all duration-300"
                    />
                  </div>
                </div>
              );
            })()}

            {/* Wi-Fi Card */}
            {(() => {
              const { linePoints, areaPoints } = buildSparklinePoints(wifiHistory, 108, 26);
              return (
                <div
                  onClick={() => setSubTab("wifi")}
                  className="bg-[#101015] hover:bg-[#14141b] border border-[#1e1e25] rounded-2xl px-3 py-1.5 flex flex-col justify-between min-w-0 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-4.5 h-4.5 rounded-full bg-[#34C3A0]/15 text-[#5EEAD4] flex items-center justify-center shrink-0">
                      <Wifi size={11} />
                    </span>
                    <span className="text-[11.5px] font-semibold">Wi-Fi</span>
                    <span className="ml-auto text-[10px] text-zinc-400 tabular-nums truncate">
                      ↑ {metrics.wifi_up_mbps} · {ping ?? 16} ms
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="tabular-nums whitespace-nowrap">
                      <span className="text-[19px] font-semibold tracking-tight leading-none">
                        {metrics.wifi_down_mbps}
                      </span>
                      <span className="text-[10.5px] text-zinc-400 ml-1">Mbps ↓</span>
                    </div>
                    <svg width="108" height="26" viewBox="0 0 108 26" className="shrink-0">
                      <polygon points={areaPoints} fill="#34C3A0" fillOpacity="0.16" />
                      <polyline
                        points={linePoints}
                        fill="none"
                        stroke="#34C3A0"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <div className="h-1 rounded-full bg-[#1d1d25] overflow-hidden">
                    <div
                      style={{ width: `${metrics.wifi_usage}%` }}
                      className="h-full rounded-full bg-[#34C3A0] transition-all duration-300"
                    />
                  </div>
                </div>
              );
            })()}

            {/* Memory Card */}
            {(() => {
              const { linePoints, areaPoints } = buildSparklinePoints(memHistory, 108, 26);
              return (
                <div
                  onClick={() => setSubTab("memory")}
                  className="bg-[#101015] hover:bg-[#14141b] border border-[#1e1e25] rounded-2xl px-3 py-1.5 flex flex-col justify-between min-w-0 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-4.5 h-4.5 rounded-full bg-[#F5B531]/15 text-[#FBBF24] flex items-center justify-center shrink-0">
                      <HardDrive size={11} />
                    </span>
                    <span className="text-[11.5px] font-semibold">{t("sys_memory")}</span>
                    <span className="ml-auto text-[10px] text-zinc-400 tabular-nums truncate">
                      {metrics.mem_used_gb} / {metrics.mem_total_gb} GB
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="tabular-nums whitespace-nowrap">
                      <span className="text-[19px] font-semibold tracking-tight leading-none">
                        {metrics.mem_usage}
                      </span>
                      <span className="text-[10.5px] text-zinc-400 ml-0.5">%</span>
                    </div>
                    <svg width="108" height="26" viewBox="0 0 108 26" className="shrink-0">
                      <polygon points={areaPoints} fill="#F5B531" fillOpacity="0.16" />
                      <polyline
                        points={linePoints}
                        fill="none"
                        stroke="#F5B531"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <div className="h-1 rounded-full bg-[#1d1d25] overflow-hidden">
                    <div
                      style={{ width: `${metrics.mem_usage}%` }}
                      className="h-full rounded-full bg-[#F5B531] transition-all duration-300"
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          /* Detailed View (Board 20 style for CPU / GPU / Wi-Fi / Memory) */
          (() => {
            const activeHistory =
              subTab === "cpu"
                ? cpuHistory
                : subTab === "gpu"
                ? gpuHistory
                : subTab === "wifi"
                ? wifiHistory
                : memHistory;
            const color =
              subTab === "cpu"
                ? "#3882F6"
                : subTab === "gpu"
                ? "#A78BFA"
                : subTab === "wifi"
                ? "#34C3A0"
                : "#F5B531";
            const { linePoints, areaPoints } = buildSparklinePoints(activeHistory, 260, 56, 26);

            const headlineValue =
              subTab === "cpu"
                ? metrics.cpu_usage
                : subTab === "gpu"
                ? metrics.gpu_usage
                : subTab === "wifi"
                ? metrics.wifi_down_mbps
                : metrics.mem_usage;
            const headlineUnit = subTab === "wifi" ? "Mbps ↓" : "%";

            const statRows =
              subTab === "cpu"
                ? [
                    { k: t("sys_speed"), v: `${metrics.cpu_speed_ghz} GHz` },
                    { k: t("sys_temp"), v: `${metrics.cpu_temp_c}°C` },
                    { k: t("sys_processes"), v: `${metrics.process_count}` },
                    {
                      k: t("sys_heaviest"),
                      v: `${metrics.top_process} · ${metrics.top_process_cpu}%`,
                    },
                  ]
                : subTab === "gpu"
                ? [
                    { k: t("sys_temp"), v: `${metrics.gpu_temp_c}°C` },
                    { k: "VRAM", v: `${metrics.gpu_vram_gb} GB` },
                    { k: "Engine", v: "3D / Compositor" },
                    { k: "Status", v: "Optimal" },
                  ]
                : subTab === "wifi"
                ? [
                    { k: "SSID", v: wifiSsid || "Wi-Fi" },
                    { k: "Download", v: `${metrics.wifi_down_mbps} Mbps` },
                    { k: "Upload", v: `${metrics.wifi_up_mbps} Mbps` },
                    { k: "Ping", v: `${ping ?? 16} ms` },
                  ]
                : [
                    { k: "Used", v: `${metrics.mem_used_gb} GB` },
                    { k: "Total", v: `${metrics.mem_total_gb} GB` },
                    {
                      k: "Available",
                      v: `${Math.max(0, metrics.mem_total_gb - metrics.mem_used_gb).toFixed(1)} GB`,
                    },
                    { k: t("sys_processes"), v: `${metrics.process_count}` },
                  ];

            return (
              <div className="h-full flex flex-col gap-1.5">
                <div className="flex gap-2 flex-1 min-h-0">
                  {/* Area Chart Card */}
                  <div className="bg-[#101015] border border-[#1e1e25] rounded-2xl px-3 py-1.5 flex-[1.6] min-w-0 flex flex-col justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[19px] font-semibold tracking-tight tabular-nums leading-none">
                        {headlineValue}
                        <span className="text-[10.5px] text-zinc-400 ml-1">{headlineUnit}</span>
                      </span>
                      <span className="text-[9.5px] text-zinc-400 truncate">
                        {t("sys_last_60s")}
                      </span>
                    </div>

                    <svg width="100%" height="56" viewBox="0 0 260 56" className="overflow-visible">
                      <line
                        x1="26"
                        x2="260"
                        y1="4"
                        y2="4"
                        stroke="#1e1e25"
                        strokeDasharray="3 4"
                        className="sys-chart-grid"
                      />
                      <text x="0" y="7" fill="#a1a1aa" fontSize="8" className="sys-chart-label">
                        100%
                      </text>
                      <line
                        x1="26"
                        x2="260"
                        y1="29"
                        y2="29"
                        stroke="#1e1e25"
                        strokeDasharray="3 4"
                        className="sys-chart-grid"
                      />
                      <text x="0" y="32" fill="#a1a1aa" fontSize="8" className="sys-chart-label">
                        50%
                      </text>
                      <line
                        x1="26"
                        x2="260"
                        y1="54"
                        y2="54"
                        stroke="#1e1e25"
                        strokeDasharray="3 4"
                        className="sys-chart-grid"
                      />
                      <text x="0" y="56" fill="#a1a1aa" fontSize="8" className="sys-chart-label">
                        0%
                      </text>
                      <polygon points={areaPoints} fill={color} fillOpacity="0.16" />
                      <polyline
                        points={linePoints}
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  {/* Stats Card */}
                  <div className="bg-[#101015] border border-[#1e1e25] rounded-2xl px-3 py-1.5 flex-1 min-w-0 flex flex-col justify-between">
                    {statRows.map((row) => (
                      <div
                        key={row.k}
                        className="flex items-baseline justify-between gap-2 text-[10.5px]"
                      >
                        <span className="text-zinc-400 shrink-0">{row.k}</span>
                        <span className="font-medium text-white tabular-nums truncate">
                          {row.v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom Bar: Per-core bars for CPU, or contextual hardware status */}
                {subTab === "cpu" ? (
                  <div className="bg-[#101015] border border-[#1e1e25] rounded-2xl px-3 py-0.5 flex items-center gap-3 shrink-0 h-[34px]">
                    <span className="text-[10px] text-zinc-400 w-12 shrink-0">
                      {t("sys_per_core")}
                    </span>
                    <div className="flex flex-1 items-center justify-between gap-1">
                      {metrics.cpu_cores.slice(0, 8).map((corePct, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-0.5 flex-1">
                          <div className="w-4 h-3.5 rounded-[3px] bg-[#1d1d25] flex items-end overflow-hidden">
                            <div
                              style={{ height: `${Math.max(12, corePct)}%` }}
                              className="w-full rounded-[3px] bg-[#3882F6] transition-all duration-300"
                            />
                          </div>
                          <span className="text-[8.5px] text-zinc-400 tabular-nums leading-none">
                            C{idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : subTab === "memory" ? (
                  <div className="bg-[#101015] border border-[#1e1e25] rounded-2xl px-3.5 py-0.5 flex items-center justify-between gap-3 shrink-0 h-[34px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-[#F5B531] shrink-0" />
                      <span className="text-[10.5px] text-zinc-300 truncate">
                        {t("sys_memory")}: <span className="font-semibold text-white">{metrics.mem_used_gb} GB</span> / {metrics.mem_total_gb} GB
                      </span>
                    </div>
                    <div className="w-28 h-1.5 bg-[#1d1d25] rounded-full overflow-hidden shrink-0">
                      <div
                        style={{ width: `${metrics.mem_usage}%` }}
                        className="h-full bg-[#F5B531] rounded-full transition-all duration-300"
                      />
                    </div>
                  </div>
                ) : subTab === "gpu" ? (
                  <div className="bg-[#101015] border border-[#1e1e25] rounded-2xl px-3.5 py-0.5 flex items-center justify-between gap-3 shrink-0 h-[34px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-[#A78BFA] shrink-0" />
                      <span className="text-[10.5px] text-zinc-300 truncate">
                        GPU VRAM: <span className="font-semibold text-white">{metrics.gpu_vram_gb} GB</span> · {metrics.gpu_temp_c}°C
                      </span>
                    </div>
                    <div className="w-28 h-1.5 bg-[#1d1d25] rounded-full overflow-hidden shrink-0">
                      <div
                        style={{ width: `${metrics.gpu_usage}%` }}
                        className="h-full bg-[#A78BFA] rounded-full transition-all duration-300"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#101015] border border-[#1e1e25] rounded-2xl px-3.5 py-0.5 flex items-center justify-between gap-3 shrink-0 h-[34px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-[#34C3A0] shrink-0" />
                      <span className="text-[10.5px] text-zinc-300 truncate">
                        {wifiSsid || "Wi-Fi"} · <span className="font-semibold text-white">{ping ?? 16} ms</span> ping
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-medium tabular-nums">
                      ↑ {metrics.wifi_up_mbps} Mbps · ↓ {metrics.wifi_down_mbps} Mbps
                    </span>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
};
