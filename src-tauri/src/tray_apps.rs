use crate::windows_pinned_apps::get_cached_or_extract_icon;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

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
}

const KNOWN_TRAY_PROCESSES: &[&str] = &[
    "onedrive.exe",
    "discord.exe",
    "spotify.exe",
    "steam.exe",
    "securityhealthsystray.exe",
    "powertoys.exe",
    "nvcontainer.exe",
    "nvidia share.exe",
    "nvidia overlay.exe",
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
];

#[tauri::command]
pub async fn get_tray_background_apps() -> Vec<TrayBackgroundApp> {
    tauri::async_runtime::spawn_blocking(|| {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::ProcessStatus::EnumProcesses;
        use windows::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
            PROCESS_QUERY_LIMITED_INFORMATION,
        };

        let running_windows = crate::navbar_window::enumerate_running_windows(true, None);
        let mut by_proc: HashMap<String, (isize, bool, Option<String>)> = HashMap::new();
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
                .or_insert((w.hwnd, w.is_minimized, w.icon_base64.clone()));
        }

        let mut pids = vec![0u32; 1024];
        let mut bytes_returned = 0u32;
        let _ = unsafe {
            EnumProcesses(
                pids.as_mut_ptr(),
                (pids.len() * std::mem::size_of::<u32>()) as u32,
                &mut bytes_returned,
            )
        };
        let count = (bytes_returned as usize / std::mem::size_of::<u32>()).min(pids.len());

        let mut result = Vec::new();
        let mut seen_proc = HashSet::new();

        for &pid in &pids[..count] {
            if pid <= 4 {
                continue;
            }
            let Ok(handle) =
                (unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) })
            else {
                continue;
            };
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

            if !ok || len == 0 {
                continue;
            }

            let full_path = String::from_utf16_lossy(&buf[..len as usize]);
            let Some(file_name) = Path::new(&full_path)
                .file_name()
                .and_then(|s| s.to_str())
                .map(str::to_string)
            else {
                continue;
            };

            let lower_name = file_name.to_lowercase();
            let win_match = by_proc.get(&lower_name).cloned();
            let is_known_tray = KNOWN_TRAY_PROCESSES
                .iter()
                .any(|k| k.eq_ignore_ascii_case(&lower_name));

            let lower_path = full_path.to_lowercase();
            let is_user_background = !lower_path.contains("\\windows\\system32\\")
                && !lower_path.contains("\\windows\\syswow64\\")
                && is_known_tray;
            let is_minimized = win_match.as_ref().is_some_and(|w| w.1);

            if !is_minimized
                && !is_user_background
                && lower_name != "securityhealthsystray.exe"
                && win_match.is_none()
            {
                continue;
            }
            if lower_name == "gili.exe" || !seen_proc.insert(lower_name) {
                continue;
            }

            let display_name = Path::new(&file_name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&file_name)
                .to_string();
            let (hwnd, win_min, win_icon) = match win_match {
                Some((h, m, ic)) => (Some(h), m, ic),
                None => (None, false, None),
            };
            let icon_base64 = win_icon.or_else(|| get_cached_or_extract_icon(&full_path));

            result.push(TrayBackgroundApp {
                pid,
                name: display_name,
                process_name: file_name,
                exe_path: full_path,
                hwnd,
                is_minimized: win_min,
                is_background_tray: hwnd.is_none() || win_min,
                icon_base64,
            });
        }

        result.sort_by(|a, b| {
            b.is_background_tray
                .cmp(&a.is_background_tray)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        result
    })
    .await
    .unwrap_or_default()
}
