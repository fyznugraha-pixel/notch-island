use crate::windows_pinned_apps::get_cached_or_extract_icon;
use crate::windows_tray_overflow::{
    matches_tray_alias, read_notify_icon_settings, snapshot_live_tray_uia_items, NativeTrayUiaItem,
};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Mutex, OnceLock};

#[derive(Serialize, Clone, Debug)]
pub struct TrayBackgroundApp {
    pub pid: u32,
    pub name: String,
    pub process_name: String,
    pub exe_path: String,
    pub hwnd: Option<isize>,
    pub is_minimized: bool,
    pub is_background_tray: bool,
    pub icon_base64: Option<String>,
    pub is_system_tray: bool,
    pub tray_item_id: Option<String>,
    pub tooltip: Option<String>,
    pub can_close: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct CloseTrayAppResult {
    pub closed: bool,
    pub requires_admin: bool,
    pub message: Option<String>,
}

static PID_PATH_CACHE: OnceLock<Mutex<HashMap<u32, String>>> = OnceLock::new();

const KNOWN_TRAY_PROCESSES: &[&str] = &[
    "onedrive.exe",
    "discord.exe",
    "spotify.exe",
    "steam.exe",
    "securityhealthsystray.exe",
    "powertoys.exe",
    "nvcontainer.exe",
    "nvdisplay.container.exe",
    "nvidia share.exe",
    "nvidia overlay.exe",
    "nvidia broadcast.exe",
    "rtkauduservice64.exe",
    "wallpaper32.exe",
    "wallpaper64.exe",
    "lghub.exe",
    "logioptionsplus_agent.exe",
    "razer synapse 3.exe",
    "slack.exe",
    "telegram.exe",
    "whatsapp.exe",
    "whatsapp.root.exe",
    "claude.exe",
    "antigravity.exe",
    "chatgpt.exe",
    "copilot.exe",
    "docker desktop.exe",
    "com.docker.backend.exe",
    "ms-teams.exe",
    "teams.exe",
    "onenote.exe",
    "icloud.exe",
    "icloudservices.exe",
    "icloudphotos.exe",
    "phoneexperiencehost.exe",
    "yourphone.exe",
    "notion.exe",
    "dropbox.exe",
    "googledrivefs.exe",
    "idm.exe",
    "idman.exe",
    "qbittorrent.exe",
    "obs64.exe",
    "sharex.exe",
    "greenshot.exe",
    "lightshot.exe",
    "flameshot.exe",
    "everything.exe",
    "autohotkey.exe",
    "wireguard.exe",
    "tailscale-ipn.exe",
    "radeonsoftware.exe",
    "amdsoftware.exe",
    "twinkle tray.exe",
    "monitorian.exe",
];

const GENERIC_HOST_EXES: &[&str] = &[
    "explorer.exe",
    "svchost.exe",
    "rundll32.exe",
    "dllhost.exe",
    "cmd.exe",
    "powershell.exe",
    "pwsh.exe",
    "conhost.exe",
    "taskmgr.exe",
    "msiexec.exe",
    "regedit.exe",
    "gili.exe",
];

const PROTECTED_TRAY_PROCESSES: &[&str] = &[
    "gili.exe",
    "explorer.exe",
    "svchost.exe",
    "csrss.exe",
    "wininit.exe",
    "winlogon.exe",
    "services.exe",
    "lsass.exe",
    "dwm.exe",
    "smss.exe",
    "sihost.exe",
    "taskhostw.exe",
    "shellexperiencehost.exe",
    "startmenuexperiencehost.exe",
    "searchhost.exe",
    "searchapp.exe",
    "runtimebroker.exe",
    "ctfmon.exe",
    "applicationframehost.exe",
    "securityhealthsystray.exe",
    "securityhealthservice.exe",
    "msmpeng.exe",
    "audiodg.exe",
    "fontdrvhost.exe",
    "dllhost.exe",
    "conhost.exe",
    "rundll32.exe",
    "system",
    "registry",
];

pub(crate) fn can_close_tray_app(pid: u32, process_name: &str) -> bool {
    if pid <= 4 || pid == std::process::id() {
        return false;
    }
    let clean = process_name.trim().to_ascii_lowercase();
    if clean.is_empty() {
        return false;
    }
    !PROTECTED_TRAY_PROCESSES.iter().any(|p| *p == clean)
}

fn resolve_active_process_paths() -> Vec<(u32, String, String)> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let Ok(snap) = (unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }) else {
        return Vec::new();
    };

    let mut raw_procs: Vec<(u32, String)> = Vec::new();
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };

    if unsafe { Process32FirstW(snap, &mut entry) }.is_ok() {
        loop {
            let pid = entry.th32ProcessID;
            if pid > 4 {
                let nul_pos = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let exe_name = String::from_utf16_lossy(&entry.szExeFile[..nul_pos]);
                if !exe_name.is_empty() {
                    raw_procs.push((pid, exe_name));
                }
            }
            if unsafe { Process32NextW(snap, &mut entry) }.is_err() {
                break;
            }
        }
    }
    let _ = unsafe { CloseHandle(snap) };

    let active_set: HashSet<u32> = raw_procs.iter().map(|(pid, _)| *pid).collect();
    let cache = PID_PATH_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let cached_snapshot = cache.lock().map(|g| g.clone()).unwrap_or_default();

    let mut new_entries: Vec<(u32, String)> = Vec::new();
    let mut resolved: Vec<(u32, String, String)> = Vec::with_capacity(raw_procs.len());

    for (pid, exe_name) in raw_procs {
        let cached_valid = cached_snapshot.get(&pid).and_then(|hit| {
            let cached_name = Path::new(hit).file_name().and_then(|s| s.to_str())?;
            if cached_name.eq_ignore_ascii_case(&exe_name) {
                Some(hit.clone())
            } else {
                None
            }
        });

        let full_path = if let Some(hit) = cached_valid {
            hit
        } else if let Ok(handle) =
            unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }
        {
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let ok = unsafe {
                QueryFullProcessImageNameW(
                    handle,
                    PROCESS_NAME_FORMAT(0),
                    windows::core::PWSTR(buf.as_mut_ptr()),
                    &mut len,
                )
            }
            .is_ok();
            let _ = unsafe { CloseHandle(handle) };
            if ok && len > 0 {
                let path = String::from_utf16_lossy(&buf[..len as usize]);
                new_entries.push((pid, path.clone()));
                path
            } else {
                String::new()
            }
        } else {
            // Elevated/SYSTEM tray processes (e.g. NVDisplay.Container.exe) deny OpenProcess;
            // keep their snapshot exe name and resolve icon/path via NotifyIconSettings later.
            String::new()
        };

        let file_name = if !full_path.is_empty() {
            Path::new(&full_path)
                .file_name()
                .and_then(|s| s.to_str())
                .map(str::to_string)
                .unwrap_or(exe_name)
        } else {
            exe_name
        };
        resolved.push((pid, file_name, full_path));
    }

    if let Ok(mut guard) = cache.lock() {
        guard.retain(|pid, _| active_set.contains(pid));
        for (pid, path) in new_entries {
            guard.insert(pid, path);
        }
    }

    resolved
}

fn match_uia_for_entry<'a>(
    uia_items: &'a [NativeTrayUiaItem],
    tooltip: &str,
    display_name: &str,
    stem: &str,
) -> Option<&'a NativeTrayUiaItem> {
    let tip_low = tooltip.trim().to_lowercase();
    let disp_low = display_name.trim().to_lowercase();
    let stem_low = stem.trim().to_lowercase();

    uia_items.iter().find(|u| {
        let uname = u.name.trim().to_lowercase();
        if uname.is_empty() {
            return false;
        }
        (!tip_low.is_empty()
            && (uname == tip_low || uname.contains(&tip_low) || tip_low.contains(&uname)))
            || (!disp_low.is_empty() && (uname == disp_low || uname.contains(&disp_low)))
            || (!stem_low.is_empty()
                && stem_low.len() >= 3
                && (uname.contains(&stem_low) || matches_tray_alias(&stem_low, &uname)))
    })
}

fn derive_display_name(tooltip: &str, file_name: &str) -> String {
    let clean_tip = tooltip.trim();
    if !clean_tip.is_empty() {
        return clean_tip.to_string();
    }
    Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name)
        .to_string()
}

#[tauri::command]
pub async fn get_tray_background_apps() -> Vec<TrayBackgroundApp> {
    tauri::async_runtime::spawn_blocking(|| {
        let running_windows = crate::navbar_window::enumerate_running_windows(false, None);
        let mut by_proc: HashMap<String, (isize, bool)> = HashMap::new();
        for w in &running_windows {
            let key = w.process_name.to_lowercase();
            by_proc
                .entry(key)
                .and_modify(|e| {
                    if e.1 && !w.is_minimized {
                        e.0 = w.hwnd;
                        e.1 = false;
                    }
                })
                .or_insert((w.hwnd, w.is_minimized));
        }

        let active_procs = resolve_active_process_paths();
        let mut proc_by_path: HashMap<String, (u32, String, String)> = HashMap::new();
        let mut proc_by_name: HashMap<String, (u32, String, String)> = HashMap::new();
        for (pid, file_name, full_path) in &active_procs {
            if !full_path.is_empty() {
                proc_by_path.entry(full_path.to_lowercase()).or_insert((
                    *pid,
                    file_name.clone(),
                    full_path.clone(),
                ));
            }
            let lower_name = file_name.to_lowercase();
            proc_by_name
                .entry(lower_name)
                .and_modify(|e| {
                    if e.2.is_empty() && !full_path.is_empty() {
                        *e = (*pid, file_name.clone(), full_path.clone());
                    }
                })
                .or_insert((*pid, file_name.clone(), full_path.clone()));
        }

        let mut notify_entries = read_notify_icon_settings();
        notify_entries.sort_by(|a, b| {
            let a_exists = Path::new(&a.exe_path).exists();
            let b_exists = Path::new(&b.exe_path).exists();
            b_exists
                .cmp(&a_exists)
                .then_with(|| a.tooltip.is_empty().cmp(&b.tooltip.is_empty()))
        });
        let uia_items = snapshot_live_tray_uia_items();

        let mut result: Vec<TrayBackgroundApp> = Vec::new();
        let mut seen_proc: HashSet<String> = HashSet::new();
        let mut matched_uia_ids: HashSet<String> = HashSet::new();

        // 1. Live processes matching Windows NotifyIconSettings (prefers exact path match)
        for entry in &notify_entries {
            let entry_path_low = entry.exe_path.to_lowercase();
            let entry_name_low = entry.exe_name.to_lowercase();
            if entry_name_low == "gili.exe" || entry_name_low == "explorer.exe" {
                continue;
            }
            let exact_match = if !entry_path_low.is_empty() {
                proc_by_path.get(&entry_path_low)
            } else {
                None
            };
            let is_generic_host = GENERIC_HOST_EXES
                .iter()
                .any(|h| h.eq_ignore_ascii_case(&entry_name_low));
            let fallback_match = if exact_match.is_none()
                && !is_generic_host
                && !seen_proc.contains(&entry_name_low)
            {
                proc_by_name.get(&entry_name_low)
            } else {
                None
            };

            let Some((pid, file_name, running_path)) = exact_match.or(fallback_match) else {
                continue;
            };
            if !seen_proc.insert(entry_name_low.clone()) {
                continue;
            }

            let effective_exe_path = if !running_path.is_empty() {
                running_path.clone()
            } else if Path::new(&entry.exe_path).exists() {
                entry.exe_path.clone()
            } else {
                String::new()
            };

            let stem = Path::new(file_name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(file_name);
            let mut display_name = derive_display_name(&entry.tooltip, file_name);
            if display_name.eq_ignore_ascii_case("nvdisplay.container") {
                display_name = "NVIDIA Settings".to_string();
            }
            let uia_hit = match_uia_for_entry(&uia_items, &entry.tooltip, &display_name, stem);
            if let Some(u) = uia_hit {
                matched_uia_ids.insert(u.item_id.clone());
            }

            let win_match = by_proc.get(&entry_name_low).copied();
            let (hwnd, is_minimized) = win_match
                .map(|(h, m)| (Some(h), m))
                .unwrap_or((None, false));
            let icon_base64 = if !effective_exe_path.is_empty() {
                get_cached_or_extract_icon(&effective_exe_path)
            } else {
                None
            };
            let tooltip_opt = if !entry.tooltip.is_empty() {
                Some(entry.tooltip.clone())
            } else {
                uia_hit.map(|u| u.name.clone())
            };

            result.push(TrayBackgroundApp {
                pid: *pid,
                name: display_name,
                process_name: file_name.clone(),
                exe_path: effective_exe_path,
                hwnd,
                is_minimized,
                is_background_tray: hwnd.is_none() || is_minimized,
                icon_base64,
                is_system_tray: true,
                tray_item_id: Some(
                    uia_hit
                        .map(|u| u.item_id.clone())
                        .unwrap_or_else(|| format!("nis:{}", entry.subkey)),
                ),
                tooltip: tooltip_opt,
                can_close: can_close_tray_app(*pid, file_name),
            });
        }

        // 2. Any live UIA tray items not already matched via NotifyIconSettings
        for u in &uia_items {
            if matched_uia_ids.contains(&u.item_id) {
                continue;
            }
            let uname_low = u.name.to_lowercase();
            let proc_guess = active_procs.iter().find(|(_, fname, _)| {
                let stem = Path::new(fname)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                !stem.is_empty()
                    && stem.len() >= 3
                    && (uname_low.contains(&stem) || matches_tray_alias(&stem, &uname_low))
            });
            let (pid, proc_name, exe_path, icon_base64) = if let Some((p, fnm, ep)) = proc_guess {
                if !seen_proc.insert(fnm.to_lowercase()) {
                    continue;
                }
                let icon = if !ep.is_empty() {
                    get_cached_or_extract_icon(ep)
                } else {
                    None
                };
                (*p, fnm.clone(), ep.clone(), icon)
            } else {
                (0, u.name.clone(), String::new(), None)
            };

            let can_close = can_close_tray_app(pid, &proc_name);
            result.push(TrayBackgroundApp {
                pid,
                name: u.name.clone(),
                process_name: proc_name,
                exe_path,
                hwnd: None,
                is_minimized: false,
                is_background_tray: true,
                icon_base64,
                is_system_tray: true,
                tray_item_id: Some(u.item_id.clone()),
                tooltip: Some(u.name.clone()),
                can_close,
            });
        }

        // 3. Remaining known background tray processes & minimized/running apps
        for (pid, file_name, full_path) in active_procs {
            let lower_name = file_name.to_lowercase();
            if lower_name == "gili.exe" || seen_proc.contains(&lower_name) {
                continue;
            }
            let win_match = by_proc.get(&lower_name).copied();
            let is_known_tray = KNOWN_TRAY_PROCESSES
                .iter()
                .any(|k| k.eq_ignore_ascii_case(&lower_name));

            let lower_path = full_path.to_lowercase();
            let in_system_dir = (lower_path.contains("\\windows\\system32\\")
                && !lower_path.contains("\\windows\\system32\\driverstore\\"))
                || lower_path.contains("\\windows\\syswow64\\");
            let is_user_background = !in_system_dir && is_known_tray;
            let is_minimized = win_match.is_some_and(|w| w.1);

            if !is_minimized
                && !is_user_background
                && lower_name != "securityhealthsystray.exe"
                && win_match.is_none()
            {
                continue;
            }
            if !seen_proc.insert(lower_name) {
                continue;
            }

            let mut display_name = derive_display_name("", &file_name);
            if display_name.eq_ignore_ascii_case("nvdisplay.container") {
                display_name = "NVIDIA Settings".to_string();
            }
            let (hwnd, win_min) = match win_match {
                Some((h, m)) => (Some(h), m),
                None => (None, false),
            };
            let icon_base64 = if !full_path.is_empty() {
                get_cached_or_extract_icon(&full_path)
            } else {
                None
            };

            let can_close = can_close_tray_app(pid, &file_name);
            result.push(TrayBackgroundApp {
                pid,
                name: display_name,
                process_name: file_name,
                exe_path: full_path,
                hwnd,
                is_minimized: win_min,
                is_background_tray: hwnd.is_none() || win_min,
                icon_base64,
                is_system_tray: false,
                tray_item_id: None,
                tooltip: None,
                can_close,
            });
        }

        result.sort_by(|a, b| {
            b.is_system_tray
                .cmp(&a.is_system_tray)
                .then_with(|| b.is_background_tray.cmp(&a.is_background_tray))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        result
    })
    .await
    .unwrap_or_default()
}

fn post_wm_close_to_pids(pids: &[u32]) -> bool {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE,
    };

    if pids.is_empty() {
        return false;
    }

    struct CloseCtx<'a> {
        pids: &'a [u32],
        posted: bool,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut CloseCtx<'_>);
        let mut win_pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut win_pid));
        if win_pid != 0 && ctx.pids.contains(&win_pid) {
            if PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0)).is_ok() {
                ctx.posted = true;
            }
        }
        BOOL(1)
    }

    let mut ctx = CloseCtx {
        pids,
        posted: false,
    };
    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut ctx as *mut _ as isize));
    }
    ctx.posted
}

fn close_tray_background_app_sync(
    pid: u32,
    process_name: &str,
    exe_path: Option<&str>,
) -> CloseTrayAppResult {
    use windows::Win32::Foundation::{CloseHandle, ERROR_ACCESS_DENIED};
    use windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

    let clean_proc = process_name.trim();
    if !can_close_tray_app(pid, clean_proc) {
        return CloseTrayAppResult {
            closed: false,
            requires_admin: false,
            message: Some("Protected system process".to_string()),
        };
    }

    let self_pid = std::process::id();
    let norm_exe = exe_path
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_lowercase());
    let is_generic_host = GENERIC_HOST_EXES
        .iter()
        .any(|h| h.eq_ignore_ascii_case(clean_proc));

    let active_procs = resolve_active_process_paths();
    let mut target_pids: Vec<u32> = active_procs
        .iter()
        .filter(|(p, fname, fpath)| {
            if *p <= 4 || *p == self_pid {
                return false;
            }
            if *p == pid {
                return true;
            }
            if let Some(ref target_exe) = norm_exe {
                if !fpath.is_empty() && fpath.to_lowercase() == *target_exe {
                    return true;
                }
            }
            !is_generic_host && fname.eq_ignore_ascii_case(clean_proc)
        })
        .map(|(p, _, _)| *p)
        .collect();

    if target_pids.is_empty() && pid > 4 && pid != self_pid {
        target_pids.push(pid);
    }

    if target_pids.is_empty() {
        return CloseTrayAppResult {
            closed: false,
            requires_admin: false,
            message: None,
        };
    }

    let posted_close = post_wm_close_to_pids(&target_pids);
    if posted_close {
        std::thread::sleep(std::time::Duration::from_millis(140));
    }

    let still_alive: HashSet<u32> = resolve_active_process_paths()
        .into_iter()
        .map(|(p, _, _)| p)
        .collect();

    let mut closed_gracefully = posted_close && target_pids.iter().all(|p| !still_alive.contains(p));
    let mut terminated_any = false;
    let mut access_denied = false;

    for target_pid in &target_pids {
        if !still_alive.contains(target_pid) {
            closed_gracefully = true;
            continue;
        }
        match unsafe { OpenProcess(PROCESS_TERMINATE, false, *target_pid) } {
            Ok(handle) => {
                if unsafe { TerminateProcess(handle, 0) }.is_ok() {
                    terminated_any = true;
                } else if windows::core::Error::from_win32().code() == ERROR_ACCESS_DENIED.into() {
                    access_denied = true;
                }
                let _ = unsafe { CloseHandle(handle) };
            }
            Err(err) => {
                if err.code() == ERROR_ACCESS_DENIED.into() {
                    access_denied = true;
                }
            }
        }
    }

    let closed = closed_gracefully || terminated_any;
    if closed {
        if let Some(cache) = PID_PATH_CACHE.get() {
            if let Ok(mut guard) = cache.lock() {
                for p in &target_pids {
                    guard.remove(p);
                }
            }
        }
        crate::navbar_window::request_overlap_recheck();
        crate::backdrop_blur::invalidate_all_backdrops();
        return CloseTrayAppResult {
            closed: true,
            requires_admin: false,
            message: None,
        };
    }

    CloseTrayAppResult {
        closed: false,
        requires_admin: access_denied,
        message: Some(if access_denied {
            "Administrator privileges required".to_string()
        } else {
            "Process already closed or unavailable".to_string()
        }),
    }
}

#[tauri::command]
pub async fn close_tray_background_app(
    pid: u32,
    process_name: String,
    exe_path: Option<String>,
) -> CloseTrayAppResult {
    tauri::async_runtime::spawn_blocking(move || {
        close_tray_background_app_sync(pid, &process_name, exe_path.as_deref())
    })
    .await
    .unwrap_or(CloseTrayAppResult {
        closed: false,
        requires_admin: false,
        message: Some("Failed to stop process".to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_active_process_paths_captures_running_processes_and_elevated() {
        let procs = resolve_active_process_paths();
        assert!(
            !procs.is_empty(),
            "ToolHelp snapshot must list active processes"
        );
        let self_pid = std::process::id();
        assert!(
            procs
                .iter()
                .any(|(pid, _, path)| *pid == self_pid && !path.is_empty()),
            "Current test process must resolve with full image path"
        );
        // Explorer or svchost must be visible by exe name regardless of elevation
        assert!(
            procs
                .iter()
                .any(|(_, name, _)| name.eq_ignore_ascii_case("svchost.exe")),
            "System processes must remain visible by exe name in snapshot"
        );
    }

    #[test]
    fn test_match_uia_for_entry_and_vendor_aliases() {
        let items = vec![
            NativeTrayUiaItem {
                item_id: "uia:overflow:1:NVIDIA Settings".into(),
                name: "NVIDIA Settings".into(),
                automation_id: "1".into(),
                source: "overflow".into(),
            },
            NativeTrayUiaItem {
                item_id: "uia:overflow:2:Keamanan Windows - Tidak diperlukan tindakan.".into(),
                name: "Keamanan Windows - Tidak diperlukan tindakan.".into(),
                automation_id: "2".into(),
                source: "overflow".into(),
            },
            NativeTrayUiaItem {
                item_id: "uia:overflow:3:OBS Studio 30".into(),
                name: "OBS Studio 30".into(),
                automation_id: "3".into(),
                source: "overflow".into(),
            },
            NativeTrayUiaItem {
                item_id: "uia:overflow:4:Riot Vanguard".into(),
                name: "Riot Vanguard".into(),
                automation_id: "4".into(),
                source: "overflow".into(),
            },
        ];

        assert_eq!(
            match_uia_for_entry(&items, "", "NVIDIA Settings", "NVDisplay.Container")
                .map(|u| u.name.as_str()),
            Some("NVIDIA Settings")
        );
        assert_eq!(
            match_uia_for_entry(&items, "", "SecurityHealthSystray", "securityhealthsystray")
                .map(|u| u.name.as_str()),
            Some("Keamanan Windows - Tidak diperlukan tindakan.")
        );
        assert_eq!(
            match_uia_for_entry(&items, "", "obs64", "obs64").map(|u| u.name.as_str()),
            Some("OBS Studio 30")
        );
        assert_eq!(
            match_uia_for_entry(&items, "", "vgtray", "vgtray").map(|u| u.name.as_str()),
            Some("Riot Vanguard")
        );
    }

    #[test]
    fn test_get_tray_background_apps_live_integration() {
        let apps = tauri::async_runtime::block_on(get_tray_background_apps());
        assert!(
            !apps.is_empty(),
            "Tray background app scan should find active tray/background apps"
        );

        // All is_system_tray items must be sorted before non-tray items and carry valid metadata
        let first_non_tray = apps.iter().position(|a| !a.is_system_tray);
        if let Some(idx) = first_non_tray {
            assert!(
                apps[idx..].iter().all(|a| !a.is_system_tray),
                "System tray entries must precede non-tray entries"
            );
        }
        for app in apps.iter().filter(|a| a.is_system_tray) {
            assert!(
                !app.name.trim().is_empty(),
                "System tray item must have non-empty name"
            );
            assert!(
                app.tray_item_id.as_ref().is_some_and(|id| !id.is_empty()),
                "System tray item '{}' must have tray_item_id",
                app.name
            );
        }

        // If NVDisplay.Container.exe is running and registered in NotifyIconSettings, verify discovery + icon
        let active_nv = resolve_active_process_paths()
            .into_iter()
            .any(|(_, name, _)| name.eq_ignore_ascii_case("nvdisplay.container.exe"));
        let nis_nv = read_notify_icon_settings()
            .into_iter()
            .any(|e| e.exe_name.eq_ignore_ascii_case("nvdisplay.container.exe"));
            if active_nv && nis_nv {
            let nv_entry = apps
                .iter()
                .find(|a| a.process_name.eq_ignore_ascii_case("nvdisplay.container.exe"))
                .expect("Running NVDisplay.Container.exe present in NotifyIconSettings must be discovered");
            assert!(nv_entry.is_system_tray);
            assert_eq!(nv_entry.name, "NVIDIA Settings");
        }
    }

    #[test]
    fn test_protected_tray_process_and_close_guards() {
        assert!(can_close_tray_app(1234, "Discord.exe"));
        assert!(can_close_tray_app(1234, "Spotify.exe"));
        assert!(!can_close_tray_app(0, "Discord.exe"));
        assert!(!can_close_tray_app(std::process::id(), "Discord.exe"));
        assert!(!can_close_tray_app(1234, "SecurityHealthSystray.exe"));
        assert!(!can_close_tray_app(1234, "explorer.exe"));
        assert!(!can_close_tray_app(1234, "gili.exe"));
        assert!(!can_close_tray_app(1234, ""));

        let blocked = tauri::async_runtime::block_on(close_tray_background_app(
            1234,
            "explorer.exe".to_string(),
            None,
        ));
        assert!(!blocked.closed);
    }
}
