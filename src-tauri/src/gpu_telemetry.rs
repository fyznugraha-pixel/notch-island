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
    use windows::core::{s, w};
    use windows::Win32::Foundation::{FreeLibrary, HMODULE};
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    struct LibGuard(HMODULE);
    impl Drop for LibGuard {
        fn drop(&mut self) {
            unsafe {
                let _ = FreeLibrary(self.0);
            }
        }
    }

    let handle = unsafe { LoadLibraryW(w!("nvml.dll")) }.ok()?;
    let _guard = LibGuard(handle);

    type InitFn = unsafe extern "C" fn() -> i32;
    type ShutdownFn = unsafe extern "C" fn() -> i32;
    type CountFn = unsafe extern "C" fn(*mut u32) -> i32;
    type HandleFn = unsafe extern "C" fn(u32, *mut *mut c_void) -> i32;
    type NameFn = unsafe extern "C" fn(*mut c_void, *mut c_char, u32) -> i32;
    type UtilFn = unsafe extern "C" fn(*mut c_void, *mut NvmlUtilization) -> i32;
    type TempFn = unsafe extern "C" fn(*mut c_void, u32, *mut u32) -> i32;
    type MemFn = unsafe extern "C" fn(*mut c_void, *mut NvmlMemory) -> i32;
    type FanFn = unsafe extern "C" fn(*mut c_void, *mut u32) -> i32;

    unsafe {
        let init: InitFn = std::mem::transmute(GetProcAddress(handle, s!("nvmlInit_v2"))?);
        let shutdown: ShutdownFn = std::mem::transmute(GetProcAddress(handle, s!("nvmlShutdown"))?);
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

        let result = (|| {
            let mut count = 0u32;
            if get_count(&mut count) != 0 || count == 0 {
                return None;
            }
            let mut dev: *mut c_void = std::ptr::null_mut();
            if get_handle(0, &mut dev) != 0 || dev.is_null() {
                return None;
            }

            let mut name_buf = [0 as c_char; 96];
            let name = if get_name(dev, name_buf.as_mut_ptr(), name_buf.len() as u32) == 0 {
                CStr::from_ptr(name_buf.as_ptr())
                    .to_string_lossy()
                    .trim()
                    .to_string()
            } else {
                "NVIDIA GPU".to_string()
            };

            let mut util = NvmlUtilization { gpu: 0, memory: 0 };
            let usage_pct = if get_util(dev, &mut util) == 0 {
                Some(util.gpu.min(100))
            } else {
                None
            };

            let mut temp = 0u32;
            let temp_c = if get_temp(dev, 0, &mut temp) == 0 && temp > 0 && temp < 130 {
                Some(temp)
            } else {
                None
            };

            let mut mem = NvmlMemory {
                total: 0,
                free: 0,
                used: 0,
            };
            let (vram_used_gb, vram_total_gb) = if get_mem(dev, &mut mem) == 0 && mem.total > 0 {
                let gb = 1024.0 * 1024.0 * 1024.0;
                (
                    Some(((mem.used as f64 / gb) * 10.0).round() as f32 / 10.0),
                    Some(((mem.total as f64 / gb) * 10.0).round() as f32 / 10.0),
                )
            } else {
                (None, None)
            };

            let fan_pct = get_fan.and_then(|fn_ptr| {
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
        })();

        let _ = shutdown();
        result
    }
}

fn cached_wmi_gpu_info() -> &'static (String, Option<f32>) {
    static INFO: OnceLock<(String, Option<f32>)> = OnceLock::new();
    INFO.get_or_init(|| {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "PascalCase")]
        struct VideoController {
            name: Option<String>,
            #[serde(rename = "AdapterRAM")]
            adapter_ram: Option<u64>,
        }

        if let Ok(con) = wmi::WMIConnection::new() {
            if let Ok(items) = con.raw_query::<VideoController>(
                "SELECT Name, AdapterRAM FROM Win32_VideoController",
            ) {
                if let Some(best) = items.into_iter().max_by_key(|x| x.adapter_ram.unwrap_or(0)) {
                    let vram_gb = best
                        .adapter_ram
                        .filter(|&b| b > 0)
                        .map(|b| ((b as f64 / (1024.0 * 1024.0 * 1024.0)) * 10.0).round() as f32 / 10.0);
                    return (
                        best.name.unwrap_or_else(|| "GPU Sistem".to_string()),
                        vram_gb,
                    );
                }
            }
        }
        ("GPU Sistem".to_string(), None)
    })
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
            name: name.clone(),
            usage_pct: None,
            temp_c: None,
            vram_used_gb: None,
            vram_total_gb: *vram_total_gb,
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
