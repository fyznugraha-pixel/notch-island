use std::ffi::c_void;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::time::Duration;

use serde::Serialize;
use windows::core::w;
use windows::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM, WPARAM};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
    TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, TerminateProcess, PROCESS_NAME_FORMAT,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
    VK_CONTROL, VK_ESCAPE, VK_L, VK_LWIN, VK_RETURN,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowThreadProcessId, PostMessageW, SendMessageTimeoutW, SMTO_ABORTIFHUNG,
    WM_CLOSE, WM_SETTINGCHANGE,
};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const COLOR_FILTERING_SUBKEY: &str = "Software\\Microsoft\\ColorFiltering";
const AUDIO_MULTIMEDIA_SUBKEY: &str = "Software\\Microsoft\\Multimedia\\Audio";
const WNF_EOA_MONO_AUDIO: u64 = 0x4187_0128_a3bc_3875;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityState {
    pub magnifier: bool,
    pub color_filter: bool,
    pub narrator: bool,
    pub mono_audio: bool,
    pub live_captions: bool,
}

pub(crate) fn desired_toggle_state(current: bool, enable: Option<bool>) -> bool {
    enable.unwrap_or(!current)
}

pub(crate) fn build_color_filter_reg_values(filter_type: u32, active: bool) -> (u32, u32) {
    let clamped_type = if filter_type <= 5 { filter_type } else { 0 };
    (if active { 1 } else { 0 }, clamped_type)
}

/// Pure 5x5 color matrix helper mirroring Windows `ColorFiltering` modes.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn color_filter_matrix(filter_type: u32, active: bool) -> [f32; 25] {
    let identity = [
        1.0, 0.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 0.0, 1.0,
    ];
    if !active {
        return identity;
    }
    match filter_type {
        // Grayscale (BT.709 luminance weights)
        0 => [
            0.2126, 0.2126, 0.2126, 0.0, 0.0,
            0.7152, 0.7152, 0.7152, 0.0, 0.0,
            0.0722, 0.0722, 0.0722, 0.0, 0.0,
            0.0, 0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 1.0,
        ],
        // Inverted
        1 => [
            -1.0, 0.0, 0.0, 0.0, 0.0,
            0.0, -1.0, 0.0, 0.0, 0.0,
            0.0, 0.0, -1.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 1.0, 0.0,
            1.0, 1.0, 1.0, 0.0, 1.0,
        ],
        // Grayscale Inverted
        2 => [
            -0.2126, -0.2126, -0.2126, 0.0, 0.0,
            -0.7152, -0.7152, -0.7152, 0.0, 0.0,
            -0.0722, -0.0722, -0.0722, 0.0, 0.0,
            0.0, 0.0, 0.0, 1.0, 0.0,
            1.0, 1.0, 1.0, 0.0, 1.0,
        ],
        _ => identity,
    }
}

fn find_pids_by_exe(target_exe_lower: &str) -> Vec<u32> {
    let mut pids = Vec::new();
    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return pids;
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let exe = String::from_utf16_lossy(&entry.szExeFile[..len]).to_ascii_lowercase();
                if exe == target_exe_lower {
                    pids.push(entry.th32ProcessID);
                }
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
    }
    pids
}

fn is_process_running(target_exe_lower: &str) -> bool {
    !find_pids_by_exe(target_exe_lower).is_empty()
}

fn read_color_filter_active() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey(COLOR_FILTERING_SUBKEY) {
        if let Ok(active) = key.get_value::<u32, _>("Active") {
            return active != 0;
        }
    }
    false
}

fn read_mono_audio_active() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey(AUDIO_MULTIMEDIA_SUBKEY) {
        if let Ok(val) = key.get_value::<u32, _>("AccessibilityAudioMonoMixState") {
            return val != 0;
        }
        if let Ok(val) = key.get_value::<u32, _>("AccessibilityMonoMixState") {
            return val != 0;
        }
    }
    crate::system_quick_state::query_wnf_state_bytes(WNF_EOA_MONO_AUDIO)
        .and_then(|bytes| bytes.first().copied())
        == Some(1)
}

fn read_accessibility_state_sync() -> AccessibilityState {
    AccessibilityState {
        magnifier: is_process_running("magnify.exe"),
        color_filter: read_color_filter_active(),
        narrator: is_process_running("narrator.exe"),
        mono_audio: read_mono_audio_active(),
        live_captions: is_process_running("livecaptions.exe"),
    }
}

fn send_key_chord(keys: &[VIRTUAL_KEY]) {
    let mut inputs = Vec::with_capacity(keys.len() * 2);
    for &vk in keys {
        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    ..Default::default()
                },
            },
        });
    }
    for &vk in keys.iter().rev() {
        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    dwFlags: KEYEVENTF_KEYUP,
                    ..Default::default()
                },
            },
        });
    }
    unsafe {
        let _ = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

fn close_windows_for_exe(target_exe_lower: &str) {
    struct EnumCtx<'a> {
        pids: &'a [u32],
        target_exe_lower: &'a str,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &*(lparam.0 as *const EnumCtx<'_>);
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return BOOL(1);
        }
        let mut matches = ctx.pids.contains(&pid);
        if !matches {
            if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                let mut buf = [0u16; 260];
                let mut len = buf.len() as u32;
                if QueryFullProcessImageNameW(
                    handle,
                    PROCESS_NAME_FORMAT(0),
                    windows::core::PWSTR(buf.as_mut_ptr()),
                    &mut len,
                )
                .is_ok()
                {
                    let full = String::from_utf16_lossy(&buf[..len as usize]);
                    if let Some(name) = Path::new(&full).file_name().and_then(|n| n.to_str()) {
                        matches = name.eq_ignore_ascii_case(ctx.target_exe_lower);
                    }
                }
                let _ = CloseHandle(handle);
            }
        }
        if matches {
            let _ = PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0));
        }
        BOOL(1)
    }

    let pids = find_pids_by_exe(target_exe_lower);
    if pids.is_empty() {
        return;
    }

    let ctx = EnumCtx {
        pids: &pids,
        target_exe_lower,
    };
    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(&ctx as *const EnumCtx as isize));
    }

    std::thread::sleep(Duration::from_millis(80));
    if !is_process_running(target_exe_lower) {
        return;
    }

    for pid in pids {
        unsafe {
            if let Ok(handle) = OpenProcess(PROCESS_TERMINATE, false, pid) {
                let _ = TerminateProcess(handle, 0);
                let _ = CloseHandle(handle);
            }
        }
    }
}

fn broadcast_setting_change(section: *const u16) {
    unsafe {
        let _ = SendMessageTimeoutW(
            HWND(-1isize as *mut c_void),
            WM_SETTINGCHANGE,
            WPARAM(0),
            LPARAM(section as isize),
            SMTO_ABORTIFHUNG,
            250,
            None,
        );
    }
}

fn toggle_process_tool(
    exe_name: &str,
    launch_cmd: &str,
    close_hotkey: &[VIRTUAL_KEY],
    enable: Option<bool>,
) -> Result<bool, String> {
    let current = is_process_running(exe_name);
    let target = desired_toggle_state(current, enable);
    if target == current {
        return Ok(target);
    }

    if target {
        Command::new(launch_cmd)
            .spawn()
            .map_err(|e| format!("Failed to launch {launch_cmd}: {e}"))?;
        std::thread::sleep(Duration::from_millis(120));
        return Ok(true);
    }

    close_windows_for_exe(exe_name);
    if is_process_running(exe_name) {
        // Fallback for UIAccess processes (Magnifier / Narrator) when OpenProcess is denied.
        send_key_chord(close_hotkey);
        std::thread::sleep(Duration::from_millis(120));
    }
    Ok(false)
}

fn toggle_color_filter(enable: Option<bool>) -> Result<bool, String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let current = read_color_filter_active();
    let target = desired_toggle_state(current, enable);

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(COLOR_FILTERING_SUBKEY)
        .map_err(|e| format!("Failed to open ColorFiltering key: {e}"))?;

    let existing_type = key.get_value::<u32, _>("FilterType").unwrap_or(0);
    let (active_dword, filter_type) = build_color_filter_reg_values(existing_type, target);
    key.set_value("FilterType", &filter_type)
        .map_err(|e| format!("Failed to write FilterType: {e}"))?;
    key.set_value("Active", &active_dword)
        .map_err(|e| format!("Failed to write ColorFiltering Active: {e}"))?;

    let _ = Command::new("atbroker.exe")
        .args(["/colorfiltershortcut", "/resettransferkeys"])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
    broadcast_setting_change(w!("ColorFiltering").as_ptr());

    Ok(target)
}

fn toggle_mono_audio(enable: Option<bool>) -> Result<bool, String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let current = read_mono_audio_active();
    let target = desired_toggle_state(current, enable);
    let dword = if target { 1u32 } else { 0u32 };

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(AUDIO_MULTIMEDIA_SUBKEY)
        .map_err(|e| format!("Failed to open Multimedia Audio key: {e}"))?;

    key.set_value("AccessibilityAudioMonoMixState", &dword)
        .map_err(|e| format!("Failed to write AccessibilityAudioMonoMixState: {e}"))?;
    let _ = key.set_value("AccessibilityMonoMixState", &dword);

    crate::system_quick_state::update_wnf_state_u32(WNF_EOA_MONO_AUDIO, dword)?;
    broadcast_setting_change(w!("Audio").as_ptr());

    Ok(target)
}

#[tauri::command]
pub async fn get_accessibility_state() -> Result<AccessibilityState, String> {
    tauri::async_runtime::spawn_blocking(read_accessibility_state_sync)
        .await
        .map_err(|e| format!("Failed to inspect accessibility state: {e}"))
}

#[tauri::command]
pub async fn toggle_accessibility_feature(
    feature: String,
    enable: Option<bool>,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || match feature.to_ascii_lowercase().as_str() {
        "magnifier" => {
            toggle_process_tool("magnify.exe", "magnify.exe", &[VK_LWIN, VK_ESCAPE], enable)
        }
        "narrator" => toggle_process_tool(
            "narrator.exe",
            "Narrator.exe",
            &[VK_CONTROL, VK_LWIN, VK_RETURN],
            enable,
        ),
        "colorfilter" => toggle_color_filter(enable),
        "monoaudio" | "audio" => toggle_mono_audio(enable),
        "livecaptions" | "captions" => toggle_process_tool(
            "livecaptions.exe",
            "LiveCaptions.exe",
            &[VK_CONTROL, VK_LWIN, VK_L],
            enable,
        ),
        other => Err(format!("Unsupported accessibility feature: {other}")),
    })
    .await
    .map_err(|e| format!("Accessibility toggle task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        build_color_filter_reg_values, color_filter_matrix, desired_toggle_state, AccessibilityState,
    };

    #[test]
    fn color_filter_helpers_and_matrices_are_pure_and_accurate() {
        assert_eq!(build_color_filter_reg_values(0, true), (1, 0));
        assert_eq!(build_color_filter_reg_values(3, false), (0, 3));
        assert_eq!(build_color_filter_reg_values(99, true), (1, 0));

        assert!(desired_toggle_state(false, None));
        assert!(!desired_toggle_state(true, None));
        assert!(!desired_toggle_state(false, Some(false)));

        let identity = color_filter_matrix(0, false);
        assert_eq!(identity[0], 1.0);
        assert_eq!(identity[6], 1.0);
        assert_eq!(identity[12], 1.0);
        assert_eq!(identity[18], 1.0);
        assert_eq!(identity[24], 1.0);

        let grayscale = color_filter_matrix(0, true);
        let row_sum = grayscale[0] + grayscale[5] + grayscale[10];
        assert!((row_sum - 1.0).abs() < 1e-4);
        assert_eq!(grayscale[0], grayscale[1]);
    }

    #[test]
    fn accessibility_state_serializes_to_camel_case() {
        let state = AccessibilityState {
            magnifier: true,
            color_filter: false,
            narrator: true,
            mono_audio: false,
            live_captions: true,
        };
        let json = serde_json::to_string(&state).unwrap();
        assert!(json.contains("\"magnifier\":true"));
        assert!(json.contains("\"colorFilter\":false"));
        assert!(json.contains("\"narrator\":true"));
        assert!(json.contains("\"monoAudio\":false"));
        assert!(json.contains("\"liveCaptions\":true"));
    }
}
