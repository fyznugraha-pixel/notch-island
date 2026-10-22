use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use windows::core as windows_core;
use windows_core::implement;
use windows::Win32::Foundation::FILETIME;
use windows::Win32::Media::MediaFoundation::{
    IMFSensorActivitiesReport, IMFSensorActivitiesReportCallback,
    IMFSensorActivitiesReportCallback_Impl, IMFSensorActivityMonitor,
    MFCreateSensorActivityMonitor, MFStartup, MF_VERSION,
};

static CAMERA_STREAMING_FLAG: AtomicBool = AtomicBool::new(false);

#[implement(IMFSensorActivitiesReportCallback)]
struct SensorActivityCallback;

impl IMFSensorActivitiesReportCallback_Impl for SensorActivityCallback {
    fn OnActivitiesReport(
        &self,
        sensoractivitiesreport: Option<&IMFSensorActivitiesReport>,
    ) -> windows_core::Result<()> {
        if let Some(report) = sensoractivitiesreport {
            let count = unsafe { report.GetCount().unwrap_or(0) };
            let mut any_streaming = false;
            for i in 0..count {
                if let Ok(act) = unsafe { report.GetActivityReport(i) } {
                    let pcount = unsafe { act.GetProcessCount().unwrap_or(0) };
                    for p in 0..pcount {
                        if let Ok(pact) = unsafe { act.GetProcessActivity(p) } {
                            if let Ok(streaming) = unsafe { pact.GetStreamingState() } {
                                if streaming.as_bool() {
                                    any_streaming = true;
                                    break;
                                }
                            }
                        }
                    }
                    if any_streaming {
                        break;
                    }
                }
            }
            CAMERA_STREAMING_FLAG.store(any_streaming, Ordering::Relaxed);
        }
        Ok(())
    }
}

impl IMFSensorActivitiesReportCallback_Impl for SensorActivityCallback_Impl {
    fn OnActivitiesReport(
        &self,
        sensoractivitiesreport: Option<&IMFSensorActivitiesReport>,
    ) -> windows_core::Result<()> {
        self.this.OnActivitiesReport(sensoractivitiesreport)
    }
}

pub struct RunningProcessEntry {
    pub pid: u32,
    pub path: String,
    pub created_ft: u64,
}

pub fn get_running_process_entries() -> Vec<RunningProcessEntry> {
    use windows::Win32::System::ProcessStatus::EnumProcesses;
    use windows::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let mut pids = vec![0u32; 1024];
    loop {
        let mut bytes_returned = 0u32;
        let buf_size = (pids.len() * std::mem::size_of::<u32>()) as u32;
        let ok = unsafe { EnumProcesses(pids.as_mut_ptr(), buf_size, &mut bytes_returned) };
        if ok.is_err() {
            return Vec::new();
        }
        if bytes_returned < buf_size {
            pids.truncate((bytes_returned as usize) / std::mem::size_of::<u32>());
            break;
        }
        pids.resize(pids.len() * 2, 0);
    }

    let mut procs = Vec::with_capacity(pids.len());
    for pid in pids {
        if pid == 0 {
            continue;
        }
        unsafe {
            if let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                let mut buf = [0u16; 1024];
                let mut len = buf.len() as u32;
                if QueryFullProcessImageNameW(
                    h,
                    PROCESS_NAME_FORMAT(0),
                    windows::core::PWSTR(buf.as_mut_ptr()),
                    &mut len,
                )
                .is_ok()
                    && len > 0
                {
                    let path = String::from_utf16_lossy(&buf[..len as usize]).to_lowercase();
                    let mut creation = FILETIME::default();
                    let mut exit = FILETIME::default();
                    let mut kernel = FILETIME::default();
                    let mut user = FILETIME::default();
                    let mut created_ft = 0u64;
                    if GetProcessTimes(h, &mut creation, &mut exit, &mut kernel, &mut user).is_ok()
                    {
                        created_ft = ((creation.dwHighDateTime as u64) << 32)
                            | (creation.dwLowDateTime as u64);
                    }
                    procs.push(RunningProcessEntry {
                        pid,
                        path,
                        created_ft,
                    });
                }
                let _ = windows::Win32::Foundation::CloseHandle(h);
            }
        }
    }
    procs
}

fn is_sub_key_candidate(sub_key: &winreg::RegKey) -> Option<u64> {
    let start: u64 = sub_key.get_value("LastUsedTimeStart").ok()?;
    if start == 0 {
        return None;
    }

    let stop: u64 = sub_key.get_value("LastUsedTimeStop").unwrap_or(0);

    if stop > 0 && stop >= start {
        return None;
    }

    // Usia sesi wajar: batas 12 jam
    if let Ok(duration) = SystemTime::now().duration_since(UNIX_EPOCH) {
        let current_ft = (duration.as_secs() + 11_644_473_600) * 10_000_000;
        if current_ft > start {
            let elapsed_secs = (current_ft - start) / 10_000_000;
            if elapsed_secs > 12 * 3600 {
                return None;
            }
        }
    }

    Some(start)
}

#[derive(serde::Serialize, Clone)]
pub struct PrivacyEntryDebug {
    pub key: String,
    pub start: u64,
    pub stop: u64,
    pub is_candidate: bool,
    pub matched_proc: Option<String>,
    pub matched_pid: Option<u32>,
    pub proc_created: u64,
    pub match_valid: bool,
}

pub fn check_privacy_in_use_with_procs(
    capability: &str,
    running: &[RunningProcessEntry],
) -> (bool, Vec<PrivacyEntryDebug>) {
    use winreg::enums::*;
    use winreg::RegKey;
    let hives = [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE];
    let path = format!(
        "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\{}",
        capability
    );

    let mut debug_entries = Vec::new();
    let mut any_active = false;

    for &hive in &hives {
        let root = RegKey::predef(hive);
        let base_key = match root.open_subkey_with_flags(&path, KEY_READ) {
            Ok(k) => k,
            Err(_) => continue,
        };

        // Packaged UWP apps
        for sub_name in base_key.enum_keys().filter_map(Result::ok) {
            if sub_name == "NonPackaged" {
                continue;
            }
            if let Ok(sub_key) = base_key.open_subkey_with_flags(&sub_name, KEY_READ) {
                let start_opt = is_sub_key_candidate(&sub_key);
                let start = sub_key.get_value("LastUsedTimeStart").unwrap_or(0);
                let stop = sub_key.get_value("LastUsedTimeStop").unwrap_or(0);
                let is_candidate = start_opt.is_some();

                let mut matched_proc = None;
                let mut matched_pid = None;
                let mut proc_created = 0;
                let mut match_valid = false;

                if let Some(start_ft) = start_opt {
                    let hint_lower = sub_name.to_lowercase();
                    let package_prefix = hint_lower
                        .split('_')
                        .next()
                        .map(|p| format!("\\{}_", p))
                        .unwrap_or_else(|| format!("\\{}", hint_lower));

                    for p in running {
                        if p.path.contains(&package_prefix)
                            || p.path.contains(&format!("\\{}", hint_lower))
                        {
                            matched_proc = Some(p.path.clone());
                            matched_pid = Some(p.pid);
                            proc_created = p.created_ft;
                            // Toleransi 5 detik untuk start clock skew
                            if p.created_ft == 0 || p.created_ft <= start_ft + 50_000_000 {
                                match_valid = true;
                                any_active = true;
                                break;
                            }
                        }
                    }
                }

                debug_entries.push(PrivacyEntryDebug {
                    key: sub_name,
                    start,
                    stop,
                    is_candidate,
                    matched_proc,
                    matched_pid,
                    proc_created,
                    match_valid,
                });
            }
        }

        // NonPackaged desktop apps
        if let Ok(non_packaged) = base_key.open_subkey_with_flags("NonPackaged", KEY_READ) {
            for sub_name in non_packaged.enum_keys().filter_map(Result::ok) {
                if let Ok(sub_key) = non_packaged.open_subkey_with_flags(&sub_name, KEY_READ) {
                    let start_opt = is_sub_key_candidate(&sub_key);
                    let start = sub_key.get_value("LastUsedTimeStart").unwrap_or(0);
                    let stop = sub_key.get_value("LastUsedTimeStop").unwrap_or(0);
                    let is_candidate = start_opt.is_some();

                    let mut matched_proc = None;
                    let mut matched_pid = None;
                    let mut proc_created = 0;
                    let mut match_valid = false;

                    if let Some(start_ft) = start_opt {
                        let hint_lower = sub_name.to_lowercase();
                        let expected_full_path = hint_lower.replace('#', "\\");
                        let exe_name = expected_full_path
                            .rsplit('\\')
                            .next()
                            .unwrap_or(&expected_full_path);
                        let exe_suffix = format!("\\{}", exe_name);

                        for p in running {
                            if p.path == expected_full_path || p.path.ends_with(&exe_suffix) {
                                matched_proc = Some(p.path.clone());
                                matched_pid = Some(p.pid);
                                proc_created = p.created_ft;
                                if p.created_ft == 0 || p.created_ft <= start_ft + 50_000_000 {
                                    match_valid = true;
                                    any_active = true;
                                    break;
                                }
                            }
                        }
                    }

                    debug_entries.push(PrivacyEntryDebug {
                        key: sub_name,
                        start,
                        stop,
                        is_candidate,
                        matched_proc,
                        matched_pid,
                        proc_created,
                        match_valid,
                    });
                }
            }
        }
    }

    (any_active, debug_entries)
}

pub fn check_mic_muted() -> bool {
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{eCapture, eMultimedia, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
    let mut is_muted = false;
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        if let Ok(enumerator) =
            CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
        {
            if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eCapture, eMultimedia) {
                if let Ok(volume_ctrl) = device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) {
                    if let Ok(muted) = volume_ctrl.GetMute() {
                        is_muted = muted.as_bool();
                    }
                }
            }
        }
    }
    is_muted
}

pub fn check_mic_active_wasapi() -> bool {
    use windows::core::Interface;
    use windows::Win32::Media::Audio::{
        eCapture, AudioSessionStateActive, DEVICE_STATE_ACTIVE, IAudioSessionControl2,
        IAudioSessionManager2, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        if let Ok(enumerator) =
            CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
        {
            if let Ok(collection) = enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE) {
                let dev_count = collection.GetCount().unwrap_or(0);
                for d in 0..dev_count {
                    if let Ok(device) = collection.Item(d) {
                        if let Ok(manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) {
                            if let Ok(session_enum) = manager.GetSessionEnumerator() {
                                let s_count = session_enum.GetCount().unwrap_or(0);
                                for i in 0..s_count {
                                    if let Ok(session_ctrl) = session_enum.GetSession(i) {
                                        if let Ok(session_ctrl2) =
                                            session_ctrl.cast::<IAudioSessionControl2>()
                                        {
                                            let pid = session_ctrl2.GetProcessId().unwrap_or(0);
                                            if pid == 0 {
                                                continue;
                                            }

                                            if let Ok(state) = session_ctrl2.GetState() {
                                                if state == AudioSessionStateActive {
                                                    let mut is_system_proc = false;
                                                    if let Ok(h) = OpenProcess(
                                                        PROCESS_QUERY_LIMITED_INFORMATION,
                                                        false,
                                                        pid,
                                                    ) {
                                                        let mut buf = [0u16; 1024];
                                                        let mut len = buf.len() as u32;
                                                        if QueryFullProcessImageNameW(
                                                            h,
                                                            PROCESS_NAME_FORMAT(0),
                                                            windows::core::PWSTR(buf.as_mut_ptr()),
                                                            &mut len,
                                                        )
                                                        .is_ok()
                                                            && len > 0
                                                        {
                                                            let full = String::from_utf16_lossy(
                                                                &buf[..len as usize],
                                                            )
                                                            .to_lowercase();
                                                            if full.contains("audiodg.exe")
                                                                || full.contains("svchost.exe")
                                                                || full.contains("system32")
                                                            {
                                                                is_system_proc = true;
                                                            }
                                                        }
                                                        let _ = windows::Win32::Foundation::CloseHandle(h);
                                                    } else {
                                                        is_system_proc = true;
                                                    }
                                                    if !is_system_proc {
                                                        return true;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    false
}

pub fn check_cam_active_with_procs(
    procs: &[RunningProcessEntry],
) -> (bool, String, Vec<PrivacyEntryDebug>) {
    // 1. Hardware/OS Media Foundation Sensor Activity Monitor
    if CAMERA_STREAMING_FLAG.load(Ordering::Relaxed) {
        return (
            true,
            "MF SensorActivityMonitor: Camera is actively streaming".to_string(),
            Vec::new(),
        );
    }

    // 2. Dedicated Windows Camera App check
    if let Some(cam_proc) = procs
        .iter()
        .find(|p| p.path.ends_with("\\windowscamera.exe"))
    {
        return (
            true,
            "Direct Process Match: Windows Camera App is active".to_string(),
            vec![PrivacyEntryDebug {
                key: "WindowsCameraApp".to_string(),
                start: 0,
                stop: 0,
                is_candidate: true,
                matched_proc: Some(cam_proc.path.clone()),
                matched_pid: Some(cam_proc.pid),
                proc_created: cam_proc.created_ft,
                match_valid: true,
            }],
        );
    }

    // 3. ConsentStore Registry check with strict process matching
    let (reg_active, debugs) = check_privacy_in_use_with_procs("webcam", procs);
    if reg_active {
        return (
            true,
            "ConsentStore Registry: Active valid session matched".to_string(),
            debugs,
        );
    }

    (
        false,
        "No active camera streams, processes, or registry sessions".to_string(),
        debugs,
    )
}

pub fn check_mic_active_with_procs(
    procs: &[RunningProcessEntry],
    allow_wasapi: bool,
    prev_active: bool,
) -> (bool, String, Vec<PrivacyEntryDebug>) {
    if check_mic_muted() {
        return (false, "Microphone is hardware/OS muted".to_string(), Vec::new());
    }

    let (reg_active, debugs) = check_privacy_in_use_with_procs("microphone", procs);
    if reg_active {
        return (
            true,
            "ConsentStore Registry: Active valid microphone session".to_string(),
            debugs,
        );
    }

    if (allow_wasapi || prev_active) && check_mic_active_wasapi() {
        return (
            true,
            "WASAPI Audio Engine: Active audio capture session".to_string(),
            debugs,
        );
    }

    (false, "Microphone is idle".to_string(), debugs)
}

#[derive(serde::Serialize, Clone)]
pub struct PrivacyDebugReport {
    pub cam_active: bool,
    pub cam_reason: String,
    pub mic_active: bool,
    pub mic_reason: String,
    pub sensor_streaming: bool,
    pub cam_entries: Vec<PrivacyEntryDebug>,
    pub mic_entries: Vec<PrivacyEntryDebug>,
}

pub fn get_debug_report() -> PrivacyDebugReport {
    let procs = get_running_process_entries();
    let sensor_streaming = CAMERA_STREAMING_FLAG.load(Ordering::Relaxed);
    let (cam_active, cam_reason, cam_entries) = check_cam_active_with_procs(&procs);
    let (mic_active, mic_reason, mic_entries) = check_mic_active_with_procs(&procs, true, false);

    PrivacyDebugReport {
        cam_active,
        cam_reason,
        mic_active,
        mic_reason,
        sensor_streaming,
        cam_entries,
        mic_entries,
    }
}

pub fn start_privacy_monitor(app_handle: AppHandle) {
    std::thread::spawn(move || {
        unsafe {
            let _ = windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_MULTITHREADED,
            );
            let _ = MFStartup(MF_VERSION, 0);
        }

        // Start Media Foundation Sensor Activity Monitor
        let callback: IMFSensorActivitiesReportCallback = SensorActivityCallback.into();
        let _sensor_monitor: Option<IMFSensorActivityMonitor> = unsafe {
            match MFCreateSensorActivityMonitor(&callback) {
                Ok(monitor) => {
                    let _ = monitor.Start();
                    Some(monitor)
                }
                Err(_) => None,
            }
        };

        let mut last_cam = false;
        let mut last_mic = false;
        let mut last_emit = Instant::now() - Duration::from_secs(10); // Trigger immediate first emit

        loop {
            std::thread::sleep(Duration::from_millis(1000));

            // Fetch running processes ONCE per cycle
            let procs = get_running_process_entries();
            let (cam_active, _, _) = check_cam_active_with_procs(&procs);
            let (mic_active, _, _) = check_mic_active_with_procs(&procs, true, last_mic);

            let state_changed = cam_active != last_cam || mic_active != last_mic;
            let heartbeat_due = last_emit.elapsed() >= Duration::from_secs(5);

            if state_changed || heartbeat_due {
                last_cam = cam_active;
                last_mic = mic_active;
                last_emit = Instant::now();

                #[derive(serde::Serialize, Clone)]
                struct PrivacyPayload {
                    cam: bool,
                    mic: bool,
                }

                let _ = app_handle.emit(
                    "privacy-update",
                    PrivacyPayload {
                        cam: cam_active,
                        mic: mic_active,
                    },
                );
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_enumeration_and_debug_report() {
        let procs = get_running_process_entries();
        assert!(!procs.is_empty(), "Expected running processes");
        let report = get_debug_report();
        println!("Cam active: {}, reason: {}", report.cam_active, report.cam_reason);
        println!("Mic active: {}, reason: {}", report.mic_active, report.mic_reason);
        println!("Cam entries count: {}", report.cam_entries.len());
        println!("Mic entries count: {}", report.mic_entries.len());
    }
}
