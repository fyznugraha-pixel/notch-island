import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

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

type MetricsListener = (metrics: SystemMetrics) => void;

let globalMetrics: SystemMetrics | null = null;
const listeners = new Set<MetricsListener>();
let unlistenFn: UnlistenFn | null = null;
let activeSubscribers = 0;

async function startGlobalSubscription() {
  if (unlistenFn) return;

  try {
    unlistenFn = await listen<SystemMetrics>("gili-system-metrics", (event) => {
      globalMetrics = event.payload;
      listeners.forEach((fn) => fn(event.payload));
    });

    await invoke("subscribe_system_metrics", { topic: "metrics" });
  } catch (err) {
    console.warn("Failed to subscribe to system metrics:", err);
  }
}

async function stopGlobalSubscription() {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
  try {
    await invoke("unsubscribe_system_metrics", { topic: "metrics" });
  } catch {}
}

export function subscribeToSystemMetrics(callback: MetricsListener): () => void {
  listeners.add(callback);
  activeSubscribers++;

  if (activeSubscribers === 1) {
    startGlobalSubscription();
  } else if (globalMetrics) {
    callback(globalMetrics);
  }

  return () => {
    listeners.delete(callback);
    activeSubscribers--;
    if (activeSubscribers <= 0) {
      activeSubscribers = 0;
      stopGlobalSubscription();
    }
  };
}

export function useSharedSystemMetrics(enabled = true): SystemMetrics | null {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(globalMetrics);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = subscribeToSystemMetrics((fresh) => {
      setMetrics(fresh);
    });
    return unsubscribe;
  }, [enabled]);

  return metrics;
}

export async function setMetricsPowerState(
  state: "ACTIVE" | "IDLE" | "SUSPENDED"
): Promise<void> {
  try {
    await invoke("set_metrics_power_state", { state });
  } catch {}
}
