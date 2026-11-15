use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Condvar, Mutex, OnceLock,
};
use std::time::{Duration, Instant};
use tauri::Emitter;

use crate::system_monitor::{get_system_metrics_internal, SystemMetrics};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PowerState {
    Active,
    Idle,
    Suspended,
}

struct SamplerState {
    subscriptions: HashMap<String, u32>,
    power_state: PowerState,
    latest_metrics: Option<SystemMetrics>,
    last_emitted_metrics: Option<SystemMetrics>,
}

static SAMPLER_INSTANCE: OnceLock<Arc<SharedSampler>> = OnceLock::new();

pub struct SharedSampler {
    state: Mutex<SamplerState>,
    condvar: Condvar,
    running: AtomicBool,
}

impl SharedSampler {
    pub fn global() -> &'static Arc<SharedSampler> {
        SAMPLER_INSTANCE.get_or_init(|| {
            let sampler = Arc::new(SharedSampler {
                state: Mutex::new(SamplerState {
                    subscriptions: HashMap::new(),
                    power_state: PowerState::Active,
                    latest_metrics: None,
                    last_emitted_metrics: None,
                }),
                condvar: Condvar::new(),
                running: AtomicBool::new(true),
            });
            sampler
        })
    }

    pub fn start_worker(&self, app_handle: tauri::AppHandle) {
        let sampler = Self::global().clone();
        std::thread::Builder::new()
            .name("gili-shared-sampler".into())
            .spawn(move || {
                // Lower thread priority to avoid stuttering UI
                #[cfg(windows)]
                unsafe {
                    use windows::Win32::System::Threading::{
                        GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL,
                    };
                    let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);
                }

                while sampler.running.load(Ordering::Relaxed) {
                    let (sleep_duration, should_sample) = {
                        let mut state = sampler.state.lock().unwrap_or_else(|e| e.into_inner());

                        // Count active subscribers
                        let total_subscribers: u32 = state.subscriptions.values().sum();
                        if total_subscribers == 0 {
                            // Sleep completely until someone subscribes (0% CPU)
                            state = sampler
                                .condvar
                                .wait_while(state, |s| {
                                    s.subscriptions.values().sum::<u32>() == 0
                                        && sampler.running.load(Ordering::Relaxed)
                                })
                                .unwrap_or_else(|e| e.into_inner());
                        }

                        let interval = match state.power_state {
                            PowerState::Active => Duration::from_millis(1000),
                            PowerState::Idle => Duration::from_millis(2000),
                            PowerState::Suspended => Duration::from_millis(10000),
                        };

                        (interval, state.power_state != PowerState::Suspended)
                    };

                    if should_sample {
                        let start = Instant::now();
                        let fresh = get_system_metrics_internal();

                        let mut state = sampler.state.lock().unwrap_or_else(|e| e.into_inner());
                        state.latest_metrics = Some(fresh.clone());

                        let should_emit = match &state.last_emitted_metrics {
                            None => true,
                            Some(old) => {
                                (fresh.cpu_usage - old.cpu_usage).abs() >= 1.0
                                    || (fresh.mem_usage - old.mem_usage).abs() >= 0.5
                                    || (fresh.gpu_usage - old.gpu_usage).abs() >= 1.0
                                    || (fresh.wifi_down_mbps - old.wifi_down_mbps).abs() >= 0.2
                                    || (fresh.wifi_up_mbps - old.wifi_up_mbps).abs() >= 0.2
                            }
                        };

                        if should_emit {
                            state.last_emitted_metrics = Some(fresh.clone());
                            drop(state);
                            let _ = app_handle.emit("gili-system-metrics", fresh);
                        } else {
                            drop(state);
                        }

                        // Account for elapsed time during sampling
                        let elapsed = start.elapsed();
                        if sleep_duration > elapsed {
                            std::thread::sleep(sleep_duration - elapsed);
                        }
                    } else {
                        std::thread::sleep(sleep_duration);
                    }
                }
            })
            .expect("Failed to spawn shared sampler thread");
    }

    pub fn subscribe(&self, app_handle: &tauri::AppHandle, topic: &str) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let was_empty = state.subscriptions.values().sum::<u32>() == 0;
        let count = state.subscriptions.entry(topic.to_string()).or_insert(0);
        *count = count.saturating_add(1);

        if was_empty {
            self.condvar.notify_one();
        }

        // If we already have cached metrics, emit immediately to the new subscriber
        if let Some(cached) = &state.latest_metrics {
            let _ = app_handle.emit("gili-system-metrics", cached.clone());
        }
    }

    pub fn unsubscribe(&self, topic: &str) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(count) = state.subscriptions.get_mut(topic) {
            *count = count.saturating_sub(1);
            if *count == 0 {
                state.subscriptions.remove(topic);
            }
        }
    }

    pub fn set_power_state(&self, state_str: &str) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.power_state = match state_str.to_uppercase().as_str() {
            "IDLE" => PowerState::Idle,
            "SUSPENDED" => PowerState::Suspended,
            _ => PowerState::Active,
        };
    }

    pub fn get_cached_or_sample(&self) -> SystemMetrics {
        {
            let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(metrics) = &state.latest_metrics {
                return metrics.clone();
            }
        }
        let fresh = get_system_metrics_internal();
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.latest_metrics = Some(fresh.clone());
        fresh
    }
}

#[tauri::command]
pub async fn subscribe_system_metrics(app: tauri::AppHandle, topic: String) {
    SharedSampler::global().subscribe(&app, &topic);
}

#[tauri::command]
pub async fn unsubscribe_system_metrics(topic: String) {
    SharedSampler::global().unsubscribe(&topic);
}

#[tauri::command]
pub async fn set_metrics_power_state(state: String) {
    SharedSampler::global().set_power_state(&state);
}

#[tauri::command]
pub async fn get_system_metrics() -> SystemMetrics {
    tauri::async_runtime::spawn_blocking(|| SharedSampler::global().get_cached_or_sample())
        .await
        .unwrap_or_else(|_| get_system_metrics_internal())
}

