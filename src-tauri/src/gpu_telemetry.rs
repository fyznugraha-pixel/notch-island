use serde::Serialize;
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize)]
pub struct GpuTelemetry {
    pub name: String,
    pub usage_pct: Option<u32>,
    pub temp_c: Option<u32>,
    pub vram_used_gb: Option<f32>,
    pub vram_total_gb: Option<f32>,
    pub fan_pct: Option<u32>,
    pub source: &'static str,
}

#[cfg(windows)]
#[repr(C)]
struct NvmlUtilization {
    gpu: u32,
    memory: u32,
}

#[cfg(windows)]
#[repr(C)]
struct NvmlMemory {
    total: u64,
    free: u64,
    used: u64,
}

#[cfg(windows)]
fn query_nvml() -> Option<GpuTelemetry> {
    use std::ffi::{c_char, c_void, CStr};
    use std::sync::Mutex;
    use windows::core::{s, w};
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    type InitFn = unsafe extern "C" fn() -> i32;
    type CountFn = unsafe extern "C" fn(*mut u32) -> i32;
    type HandleFn = unsafe extern "C" fn(u32, *mut *mut c_void) -> i32;
    type NameFn = unsafe extern "C" fn(*mut c_void, *mut c_char, u32) -> i32;
    type UtilFn = unsafe extern "C" fn(*mut c_void, *mut NvmlUtilization) -> i32;
    type TempFn = unsafe extern "C" fn(*mut c_void, u32, *mut u32) -> i32;
    type MemFn = unsafe extern "C" fn(*mut c_void, *mut NvmlMemory) -> i32;
    type FanFn = unsafe extern "C" fn(*mut c_void, *mut u32) -> i32;

    struct NvmlSession {
        get_count: CountFn,
        get_handle: HandleFn,
        get_name: NameFn,
        get_util: UtilFn,
        get_temp: TempFn,
        get_mem: MemFn,
        get_fan: Option<FanFn>,
    }

    // Keep nvml.dll loaded and initialized once, serialized by a mutex so concurrent Notch/Widget polls never race nvmlInit/nvmlShutdown
    static NVML_SESSION: OnceLock<Option<NvmlSession>> = OnceLock::new();
    static NVML_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    let _guard = NVML_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let sess = NVML_SESSION
        .get_or_init(|| unsafe {
            let handle = LoadLibraryW(w!("nvml.dll")).ok()?;
            let init: InitFn = std::mem::transmute(GetProcAddress(handle, s!("nvmlInit_v2"))?);
            let get_count: CountFn =
                std::mem::transmute(GetProcAddress(handle, s!("nvmlDeviceGetCount_v2"))?);
            let get_handle: HandleFn =
                std::mem::transmute(GetProcAddress(handle, s!("nvmlDeviceGetHandleByIndex_v2"))?);
            let get_name: NameFn =
                std::mem::transmute(GetProcAddress(handle, s!("nvmlDeviceGetName"))?);
            let get_util: UtilFn =
                std::mem::transmute(GetProcAddress(handle, s!("nvmlDeviceGetUtilizationRates"))?);
            let get_temp: TempFn =
                std::mem::transmute(GetProcAddress(handle, s!("nvmlDeviceGetTemperature"))?);
            let get_mem: MemFn =
                std::mem::transmute(GetProcAddress(handle, s!("nvmlDeviceGetMemoryInfo"))?);
            let get_fan: Option<FanFn> =
                GetProcAddress(handle, s!("nvmlDeviceGetFanSpeed")).map(|p| std::mem::transmute(p));

            if init() != 0 {
                return None;
            }
            Some(NvmlSession {
                get_count,
                get_handle,
                get_name,
                get_util,
                get_temp,
                get_mem,
                get_fan,
            })
        })
        .as_ref()?;

    unsafe {
        let mut count = 0u32;
        if (sess.get_count)(&mut count) != 0 || count == 0 {
            return None;
        }
        let mut dev: *mut c_void = std::ptr::null_mut();
        if (sess.get_handle)(0, &mut dev) != 0 || dev.is_null() {
            return None;
        }

        let mut name_buf = [0 as c_char; 96];
        let name = if (sess.get_name)(dev, name_buf.as_mut_ptr(), name_buf.len() as u32) == 0 {
            CStr::from_ptr(name_buf.as_ptr())
                .to_string_lossy()
                .trim()
                .to_string()
        } else {
            "NVIDIA GPU".to_string()
        };

        let mut util = NvmlUtilization { gpu: 0, memory: 0 };
        let usage_pct = if (sess.get_util)(dev, &mut util) == 0 {
            Some(util.gpu.min(100))
        } else {
            None
        };

        let mut temp = 0u32;
        let temp_c = if (sess.get_temp)(dev, 0, &mut temp) == 0 && temp > 0 && temp < 130 {
            Some(temp)
        } else {
            None
        };

        let mut mem = NvmlMemory {
            total: 0,
            free: 0,
            used: 0,
        };
        let (vram_used_gb, vram_total_gb) = if (sess.get_mem)(dev, &mut mem) == 0 && mem.total > 0 {
            let gb = 1024.0 * 1024.0 * 1024.0;
            (
                Some(((mem.used as f64 / gb) * 10.0).round() as f32 / 10.0),
                Some(((mem.total as f64 / gb) * 10.0).round() as f32 / 10.0),
            )
        } else {
            (None, None)
        };

        let fan_pct = sess.get_fan.and_then(|fn_ptr| {
            let mut f = 0u32;
            if fn_ptr(dev, &mut f) == 0 && f <= 100 {
                Some(f)
            } else {
                None
            }
        });

        Some(GpuTelemetry {
            name,
            usage_pct,
            temp_c,
            vram_used_gb,
            vram_total_gb,
            fan_pct,
            source: "nvml",
        })
    }
}

fn cached_wmi_gpu_info() -> (String, Option<f32>) {
    use std::sync::Mutex;
    static INFO: OnceLock<Mutex<Option<(String, Option<f32>)>>> = OnceLock::new();
    let lock = INFO.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = lock.lock() {
        if let Some(ref cached) = *guard {
            return cached.clone();
        }
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct VideoController {
        name: Option<String>,
        #[serde(rename = "AdapterRAM")]
        adapter_ram: Option<u64>,
    }

    if let Ok(con) = wmi::WMIConnection::new() {
        if let Ok(items) =
            con.raw_query::<VideoController>("SELECT Name, AdapterRAM FROM Win32_VideoController")
        {
            if let Some(best) = items.into_iter().max_by_key(|x| x.adapter_ram.unwrap_or(0)) {
                let vram_gb = best
                    .adapter_ram
                    .filter(|&b| b > 0)
                    .map(|b| ((b as f64 / (1024.0 * 1024.0 * 1024.0)) * 10.0).round() as f32 / 10.0);
                let resolved = (
                    best.name.unwrap_or_else(|| "GPU Sistem".to_string()),
                    vram_gb,
                );
                if let Ok(mut guard) = lock.lock() {
                    *guard = Some(resolved.clone());
                }
                return resolved;
            }
        }
    }
    // Do not permanently latch fallback on early-boot WMI failure so subsequent polls retry
    ("GPU Sistem".to_string(), None)
}

#[tauri::command]
pub async fn get_gpu_telemetry() -> GpuTelemetry {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(windows)]
        if let Some(nvml) = query_nvml() {
            return nvml;
        }

        let (name, vram_total_gb) = cached_wmi_gpu_info();
        GpuTelemetry {
            name,
            usage_pct: None,
            temp_c: None,
            vram_used_gb: None,
            vram_total_gb,
            fan_pct: None,
            source: "wmi",
        }
    })
    .await
    .unwrap_or_else(|_| GpuTelemetry {
        name: "GPU Sistem".to_string(),
        usage_pct: None,
        temp_c: None,
        vram_used_gb: None,
        vram_total_gb: None,
        fan_pct: None,
        source: "unavailable",
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wmi_gpu_lookup_non_empty() {
        let (name, _) = cached_wmi_gpu_info();
        assert!(!name.trim().is_empty());
    }
}
