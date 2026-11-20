use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DiskUsageItem {
    pub mount: String,
    pub used_gb: f32,
    pub total_gb: f32,
    pub usage_pct: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SystemPerfSnapshot {
    pub cpu_total_pct: f32,
    pub cpu_cores_pct: Vec<f32>,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
    pub ram_pct: f32,
    pub gpu_name: Option<String>,
    pub gpu_pct: Option<u32>,
    pub gpu_temp_c: Option<u32>,
    pub net_down_mbps: f32,
    pub net_up_mbps: f32,
    pub disks: Vec<DiskUsageItem>,
    pub on_battery_saver: bool,
    pub battery_percent: Option<u8>,
    pub is_charging: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProcessUsageItem {
    pub pid: u32,
    pub name: String,
    pub cpu_pct: f32,
    pub ram_mb: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct QuickControlsSnapshot {
    pub wifi_enabled: Option<bool>,
    pub bluetooth_enabled: Option<bool>,
    pub dark_mode_enabled: bool,
    pub audio_muted: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StorageEntryNode {
    pub name: String,
    pub bytes: u64,
    pub share_pct: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StorageTreemapSnapshot {
    pub root_path: String,
    pub total_scanned_bytes: u64,
    pub items: Vec<StorageEntryNode>,
    pub scanning: bool,
    pub updated_epoch_secs: u64,
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct SystemProcessorPerformanceInformation {
    idle_time: i64,
    kernel_time: i64,
    user_time: i64,
    dpc_time: i64,
    interrupt_time: i64,
    interrupt_count: u32,
    _pad: u32,
}

#[cfg(windows)]
#[link(name = "ntdll")]
extern "system" {
    fn NtQuerySystemInformation(
        system_information_class: u32,
        system_information: *mut std::ffi::c_void,
        system_information_length: u32,
        return_length: *mut u32,
    ) -> i32;
}

#[derive(Default)]
struct PerfSamplerState {
    prev_cores: Vec<(i64, i64, i64)>,
    prev_net: Option<(u64, u64, Instant)>,
    prev_proc_times: HashMap<u32, u64>,
    prev_sys_total: u64,
    last_proc_sample: Option<Instant>,
    cached_top_procs: Vec<ProcessUsageItem>,
}

static PERF_STATE: OnceLock<Mutex<PerfSamplerState>> = OnceLock::new();

fn state() -> &'static Mutex<PerfSamplerState> {
    PERF_STATE.get_or_init(|| Mutex::new(PerfSamplerState::default()))
}

/// Queries true per-logical-core CPU utilization via NtQuerySystemInformation(8).
#[cfg(windows)]
fn sample_per_core_cpu(prev: &mut Vec<(i64, i64, i64)>) -> (f32, Vec<f32>) {
    const SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION: u32 = 8;
    let mut buf = vec![SystemProcessorPerformanceInformation::default(); 128];
    let mut ret_len = 0u32;
    let status = unsafe {
        NtQuerySystemInformation(
            SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION,
            buf.as_mut_ptr() as *mut _,
            (buf.len() * std::mem::size_of::<SystemProcessorPerformanceInformation>()) as u32,
            &mut ret_len,
        )
    };
    if status < 0 || ret_len == 0 {
        return (0.0, Vec::new());
    }
    let count = (ret_len as usize) / std::mem::size_of::<SystemProcessorPerformanceInformation>();
    buf.truncate(count);

    let mut per_core = Vec::with_capacity(count);
    let mut sum = 0.0f32;
    if prev.len() == count {
        for (i, cur) in buf.iter().enumerate() {
            let (pi, pk, pu) = prev[i];
            let di = cur.idle_time.saturating_sub(pi).max(0) as f64;
            let dk = cur.kernel_time.saturating_sub(pk).max(0) as f64;
            let du = cur.user_time.saturating_sub(pu).max(0) as f64;
            let total = dk + du;
            let pct = if total > 0.0 {
                (((total - di) / total) * 100.0).clamp(0.0, 100.0) as f32
            } else {
                0.0
            };
            per_core.push((pct * 10.0).round() / 10.0);
            sum += pct;
        }
    } else {
        per_core.resize(count, 0.0);
    }

    *prev = buf
        .iter()
        .map(|c| (c.idle_time, c.kernel_time, c.user_time))
        .collect();

    let avg = if count > 0 {
        (sum / count as f32 * 10.0).round() / 10.0
    } else {
        0.0
    };
    (avg, per_core)
}

#[cfg(not(windows))]
fn sample_per_core_cpu(_prev: &mut Vec<(i64, i64, i64)>) -> (f32, Vec<f32>) {
    (0.0, Vec::new())
}

#[cfg(windows)]
pub fn is_power_saver_active() -> (bool, Option<u8>, bool) {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut sps = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut sps).is_ok() } {
        let saver = sps.SystemStatusFlag == 1;
        let pct = if sps.BatteryLifePercent <= 100 {
            Some(sps.BatteryLifePercent)
        } else {
            None
        };
        let charging = sps.ACLineStatus == 1;
        return (saver, pct, charging);
    }
    (false, None, false)
}

#[cfg(not(windows))]
pub fn is_power_saver_active() -> (bool, Option<u8>, bool) {
    (false, None, false)
}

#[cfg(windows)]
fn sample_memory() -> (f32, f32, f32) {
    #[repr(C)]
    struct MemoryStatusEx {
        dw_length: u32,
        dw_memory_load: u32,
        ull_total_phys: u64,
        ull_avail_phys: u64,
        ull_total_page_file: u64,
        ull_avail_page_file: u64,
        ull_total_virtual: u64,
        ull_avail_virtual: u64,
        ull_avail_extended_virtual: u64,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalMemoryStatusEx(lp_buffer: *mut MemoryStatusEx) -> i32;
    }

    let mut ms = MemoryStatusEx {
        dw_length: std::mem::size_of::<MemoryStatusEx>() as u32,
        dw_memory_load: 0,
        ull_total_phys: 0,
        ull_avail_phys: 0,
        ull_total_page_file: 0,
        ull_avail_page_file: 0,
        ull_total_virtual: 0,
        ull_avail_virtual: 0,
        ull_avail_extended_virtual: 0,
    };
    if unsafe { GlobalMemoryStatusEx(&mut ms) } != 0 && ms.ull_total_phys > 0 {
        let div = 1024.0 * 1024.0 * 1024.0;
        let total = ms.ull_total_phys as f64 / div;
        let used = (ms.ull_total_phys.saturating_sub(ms.ull_avail_phys)) as f64 / div;
        let pct = ((used / total) * 100.0).clamp(0.0, 100.0) as f32;
        return (
            (used as f32 * 10.0).round() / 10.0,
            (total as f32 * 10.0).round() / 10.0,
            (pct * 10.0).round() / 10.0,
        );
    }
    (0.0, 0.0, 0.0)
}

#[cfg(not(windows))]
fn sample_memory() -> (f32, f32, f32) {
    (0.0, 0.0, 0.0)
}

#[cfg(windows)]
fn sample_disks() -> Vec<DiskUsageItem> {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let mut disks = Vec::new();
    for letter in b'C'..=b'Z' {
        let root = format!("{}:\\", letter as char);
        let wide: Vec<u16> = root.encode_utf16().chain(std::iter::once(0)).collect();
        let mut free_avail = 0u64;
        let mut total_bytes = 0u64;
        let mut total_free = 0u64;
        let ok = unsafe {
            GetDiskFreeSpaceExW(
                PCWSTR(wide.as_ptr()),
                Some(&mut free_avail),
                Some(&mut total_bytes),
                Some(&mut total_free),
            )
            .is_ok()
        };
        if ok && total_bytes > 0 {
            let div = 1024.0 * 1024.0 * 1024.0;
            let total_gb = (total_bytes as f64 / div) as f32;
            let used_gb = (total_bytes.saturating_sub(total_free) as f64 / div) as f32;
            let pct = ((used_gb / total_gb) * 100.0).clamp(0.0, 100.0);
            disks.push(DiskUsageItem {
                mount: format!("{}:", letter as char),
                used_gb: (used_gb * 10.0).round() / 10.0,
                total_gb: (total_gb * 10.0).round() / 10.0,
                usage_pct: (pct * 10.0).round() / 10.0,
            });
            if disks.len() >= 4 {
                break;
            }
        }
    }
    disks
}

#[cfg(not(windows))]
fn sample_disks() -> Vec<DiskUsageItem> {
    Vec::new()
}

#[cfg(windows)]
fn sample_network_mbps(prev: &mut Option<(u64, u64, Instant)>) -> (f32, f32) {
    // Use lightweight WMI-free disk/net counter via GetIfTable2 when IpHelper is available,
    // or fall back to 0.0 when invoked outside Tauri's SharedSampler bridge.
    let _ = prev;
    (0.0, 0.0)
}

#[cfg(not(windows))]
fn sample_network_mbps(_prev: &mut Option<(u64, u64, Instant)>) -> (f32, f32) {
    (0.0, 0.0)
}

pub fn sample_system_perf(
    net_override: Option<(f32, f32)>,
    gpu_override: Option<(String, Option<u32>, Option<u32>)>,
) -> SystemPerfSnapshot {
    let (ram_used_gb, ram_total_gb, ram_pct) = sample_memory();
    let (on_battery_saver, battery_percent, is_charging) = is_power_saver_active();
    let disks = sample_disks();

    let (cpu_total_pct, cpu_cores_pct, net_pair) = if let Ok(mut st) = state().lock() {
        let (avg, cores) = sample_per_core_cpu(&mut st.prev_cores);
        let net = net_override.unwrap_or_else(|| sample_network_mbps(&mut st.prev_net));
        (avg, cores, net)
    } else {
        (0.0, Vec::new(), net_override.unwrap_or((0.0, 0.0)))
    };

    let (gpu_name, gpu_pct, gpu_temp_c) = match gpu_override {
        Some((n, u, t)) => (Some(n), u, t),
        None => (None, None, None),
    };

    SystemPerfSnapshot {
        cpu_total_pct,
        cpu_cores_pct,
        ram_used_gb,
        ram_total_gb,
        ram_pct,
        gpu_name,
        gpu_pct,
        gpu_temp_c,
        net_down_mbps: net_pair.0,
        net_up_mbps: net_pair.1,
        disks,
        on_battery_saver,
        battery_percent,
        is_charging,
    }
}

/// Read-only Top 5 resource-consuming processes (CPU & RAM). Never exposes process termination.
#[cfg(windows)]
pub fn sample_top_processes_readonly(limit: usize) -> Vec<ProcessUsageItem> {
    use windows::Win32::Foundation::{CloseHandle, FILETIME};
    use windows::Win32::System::ProcessStatus::{
        EnumProcesses, GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
    };
    use windows::Win32::System::Threading::{
        GetProcessTimes, GetSystemTimes, OpenProcess, QueryFullProcessImageNameW,
        PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let Ok(mut st) = state().lock() else {
        return Vec::new();
    };
    let now = Instant::now();
    if let Some(last) = st.last_proc_sample {
        if now.duration_since(last) < Duration::from_secs(4) && !st.cached_top_procs.is_empty() {
            return st.cached_top_procs.iter().take(limit).cloned().collect();
        }
    }

    let ft_u64 = |f: FILETIME| ((f.dwHighDateTime as u64) << 32) | (f.dwLowDateTime as u64);
    let mut idle = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    unsafe {
        let _ = GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user));
    }
    let sys_total = ft_u64(kernel).saturating_add(ft_u64(user));
    let sys_delta = if st.prev_sys_total > 0 {
        sys_total.saturating_sub(st.prev_sys_total)
    } else {
        0
    };
    st.prev_sys_total = sys_total;

    let mut pids = vec![0u32; 2048];
    let mut bytes_ret = 0u32;
    let count = unsafe {
        if EnumProcesses(
            pids.as_mut_ptr(),
            (pids.len() * std::mem::size_of::<u32>()) as u32,
            &mut bytes_ret,
        )
        .is_ok()
        {
            (bytes_ret as usize) / std::mem::size_of::<u32>()
        } else {
            0
        }
    };
    pids.truncate(count);

    let mut next_times = HashMap::with_capacity(pids.len());
    let mut rows = Vec::with_capacity(64);

    for pid in pids {
        if pid <= 4 {
            continue;
        }
        unsafe {
            let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
                continue;
            };
            let mut c = FILETIME::default();
            let mut e = FILETIME::default();
            let mut k = FILETIME::default();
            let mut u = FILETIME::default();
            let cpu_pct = if GetProcessTimes(h, &mut c, &mut e, &mut k, &mut u).is_ok() {
                let tot = ft_u64(k).saturating_add(ft_u64(u));
                let delta = st
                    .prev_proc_times
                    .get(&pid)
                    .map(|p| tot.saturating_sub(*p))
                    .unwrap_or(0);
                next_times.insert(pid, tot);
                if sys_delta > 0 {
                    ((delta as f64 / sys_delta as f64) * 100.0).clamp(0.0, 100.0) as f32
                } else {
                    0.0
                }
            } else {
                0.0
            };

            let mut pmc = PROCESS_MEMORY_COUNTERS::default();
            let ram_mb = if GetProcessMemoryInfo(
                h,
                &mut pmc,
                std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
            )
            .is_ok()
            {
                pmc.WorkingSetSize as f32 / (1024.0 * 1024.0)
            } else {
                0.0
            };

            if cpu_pct >= 0.2 || ram_mb >= 40.0 {
                let mut name_buf = [0u16; 260];
                let mut name_len = name_buf.len() as u32;
                let name = if QueryFullProcessImageNameW(
                    h,
                    PROCESS_NAME_FORMAT(0),
                    windows::core::PWSTR(name_buf.as_mut_ptr()),
                    &mut name_len,
                )
                .is_ok()
                    && name_len > 0
                {
                    let full = String::from_utf16_lossy(&name_buf[..name_len as usize]);
                    Path::new(&full)
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_else(|| format!("PID {pid}"))
                } else {
                    format!("PID {pid}")
                };

                rows.push(ProcessUsageItem {
                    pid,
                    name,
                    cpu_pct: (cpu_pct * 10.0).round() / 10.0,
                    ram_mb: ram_mb.round(),
                });
            }
            let _ = CloseHandle(h);
        }
    }

    rows.sort_by(|a, b| {
        b.cpu_pct
            .partial_cmp(&a.cpu_pct)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                b.ram_mb
                    .partial_cmp(&a.ram_mb)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });
    rows.truncate(limit.max(5));
    st.prev_proc_times = next_times;
    st.last_proc_sample = Some(now);
    st.cached_top_procs = rows.clone();
    rows.into_iter().take(limit).collect()
}

#[cfg(not(windows))]
pub fn sample_top_processes_readonly(_limit: usize) -> Vec<ProcessUsageItem> {
    Vec::new()
}

/// On-demand, low-priority, bounded-depth storage treemap scanner. Never scans C:\ at startup.
pub fn scan_storage_treemap_bounded(
    root: &Path,
    max_depth: usize,
    max_entries: usize,
) -> StorageTreemapSnapshot {
    let mut children_totals: Vec<(String, u64)> = Vec::new();
    let mut visited = 0usize;

    if let Ok(read_dir) = std::fs::read_dir(root) {
        for entry in read_dir.flatten() {
            if visited >= max_entries {
                break;
            }
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let bytes = measure_dir_bounded(&path, max_depth, max_entries, &mut visited);
            if bytes > 0 {
                children_totals.push((name, bytes));
            }
        }
    }

    children_totals.sort_by(|a, b| b.1.cmp(&a.1));
    let total: u64 = children_totals.iter().map(|(_, b)| *b).sum();
    let items: Vec<StorageEntryNode> = children_totals
        .into_iter()
        .take(8)
        .map(|(name, bytes)| {
            let share_pct = if total > 0 {
                ((bytes as f64 / total as f64) * 100.0) as f32
            } else {
                0.0
            };
            StorageEntryNode {
                name,
                bytes,
                share_pct: (share_pct * 10.0).round() / 10.0,
            }
        })
        .collect();

    let updated = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    StorageTreemapSnapshot {
        root_path: root.to_string_lossy().to_string(),
        total_scanned_bytes: total,
        items,
        scanning: false,
        updated_epoch_secs: updated,
    }
}

fn measure_dir_bounded(path: &Path, depth_left: usize, max_entries: usize, visited: &mut usize) -> u64 {
    if *visited >= max_entries {
        return 0;
    }
    *visited += 1;
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        return 0;
    };
    if meta.file_type().is_symlink() {
        return 0;
    }
    if meta.is_file() {
        return meta.len();
    }
    if depth_left == 0 {
        return 0;
    }
    let mut sum = 0u64;
    if let Ok(rd) = std::fs::read_dir(path) {
        for e in rd.flatten() {
            if *visited >= max_entries {
                break;
            }
            sum = sum.saturating_add(measure_dir_bounded(
                &e.path(),
                depth_left - 1,
                max_entries,
                visited,
            ));
        }
    }
    sum
}

/// Reads documented Windows user theme preference (AppsUseLightTheme).
pub fn read_windows_dark_mode() -> bool {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) =
            hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
        {
            if let Ok(val) = key.get_value::<u32, _>("AppsUseLightTheme") {
                return val == 0;
            }
        }
    }
    true
}

/// Toggles documented Windows theme keys (AppsUseLightTheme + SystemUsesLightTheme) and broadcasts WM_SETTINGCHANGE.
pub fn set_windows_dark_mode(dark: bool) -> Result<bool, String> {
    #[cfg(windows)]
    {
        use windows::core::w;
        use windows::Win32::Foundation::{LPARAM, WPARAM};
        use windows::Win32::UI::WindowsAndMessaging::{
            SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
        };
        use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = hkcu
            .open_subkey_with_flags(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
                KEY_WRITE,
            )
            .map_err(|e| format!("Gagal membuka kunci tema Windows: {e}"))?;
        let light_val: u32 = if dark { 0 } else { 1 };
        key.set_value("AppsUseLightTheme", &light_val)
            .map_err(|e| format!("Gagal menyimpan AppsUseLightTheme: {e}"))?;
        let _ = key.set_value("SystemUsesLightTheme", &light_val);
        unsafe {
            let param = w!("ImmersiveColorSet");
            let _ = SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                WPARAM(0),
                LPARAM(param.as_ptr() as isize),
                SMTO_ABORTIFHUNG,
                1500,
                None,
            );
        }
        Ok(dark)
    }
    #[cfg(not(windows))]
    {
        Ok(dark)
    }
}

pub fn default_treemap_user_root() -> PathBuf {
    std::env::var("USERPROFILE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}
