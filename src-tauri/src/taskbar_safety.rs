use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use windows::core::w;
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::System::Threading::{
    OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE,
};
use windows::Win32::UI::Shell::{
    SHAppBarMessage, APPBARDATA, ABM_SETSTATE, ABS_ALWAYSONTOP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, SetWindowPos, ShowWindow, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSIZE, SWP_SHOWWINDOW, SW_SHOW,
};

use crate::taskbar_logger::log_taskbar_event;
use crate::taskbar_manager;

// Per-window feature flags (Default = false / Native Windows as per Rule 3)
pub static USE_GILI_START: AtomicBool = AtomicBool::new(false);
pub static USE_GILI_SEARCH: AtomicBool = AtomicBool::new(false);
pub static USE_GILI_QUICK_SETTINGS: AtomicBool = AtomicBool::new(false);
pub static USE_GILI_VOLUME_OUTPUT: AtomicBool = AtomicBool::new(false);
pub static USE_GILI_NOTIF_CAL: AtomicBool = AtomicBool::new(false);
pub static USE_GILI_TRAY: AtomicBool = AtomicBool::new(false);

static WATCHDOG_SPAWNED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskbarWindowSwitches {
    pub use_gili_start: bool,
    pub use_gili_search: bool,
    pub use_gili_quick_settings: bool,
    pub use_gili_volume_output: bool,
    pub use_gili_notif_cal: bool,
    pub use_gili_tray: bool,
}

impl Default for TaskbarWindowSwitches {
    fn default() -> Self {
        Self {
            use_gili_start: false,
            use_gili_search: false,
            use_gili_quick_settings: false,
            use_gili_volume_output: false,
            use_gili_notif_cal: false,
            use_gili_tray: false,
        }
    }
}

/// Standalone watchdog loop executed when Gili is invoked with `--taskbar-watchdog <pid>`.
/// This process waits for the parent Gili process to terminate, then immediately restores the
/// native Windows taskbar regardless of how Gili exited (cleanly, crashed, or force-killed).
pub fn run_taskbar_watchdog(target_pid: u32) {
    unsafe {
        let process_handle = match OpenProcess(PROCESS_SYNCHRONIZE, false, target_pid) {
            Ok(handle) => handle,
            Err(_) => {
                // Parent already dead, restore immediately
                restore_windows_taskbar_hard();
                return;
            }
        };

        if !process_handle.0.is_null() {
            let _ = WaitForSingleObject(process_handle, INFINITE);
            let _ = CloseHandle(process_handle);
        }

        // Parent process terminated. Restore Windows Taskbar!
        restore_windows_taskbar_hard();
    }
}

/// Direct Win32 taskbar unhide logic used by the watchdog and emergency kill-switch.
pub fn restore_windows_taskbar_hard() {
    unsafe {
        let primary = FindWindowW(w!("Shell_TrayWnd"), None);
        if let Ok(hwnd) = primary {
            if !hwnd.0.is_null() {
                let mut abd = APPBARDATA {
                    cbSize: std::mem::size_of::<APPBARDATA>() as u32,
                    hWnd: hwnd,
                    lParam: LPARAM(ABS_ALWAYSONTOP as isize),
                    ..Default::default()
                };
                let _ = SHAppBarMessage(ABM_SETSTATE, &mut abd);
                let _ = ShowWindow(hwnd, SW_SHOW);
                let _ = SetWindowPos(
                    hwnd,
                    HWND(std::ptr::null_mut()),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
                );
            }
        }
    }
    taskbar_manager::set_taskbar_visible(true);
}

const CREATE_NO_WINDOW: u32 = 0x08000000;
const DETACHED_PROCESS: u32 = 0x00000008;

/// Spawns a detached watchdog process that guards taskbar restoration.
pub fn ensure_taskbar_watchdog_spawned() {
    if WATCHDOG_SPAWNED.swap(true, Ordering::SeqCst) {
        return;
    }

    if let Ok(current_exe) = std::env::current_exe() {
        let pid = std::process::id();
        let _ = Command::new(current_exe)
            .arg("--taskbar-watchdog")
            .arg(pid.to_string())
            .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
            .spawn();
    }
}

/// Emergency Kill-Switch (Ctrl + Alt + Shift + Backspace).
/// Instantly restores native Windows taskbar, resets all Gili flyouts to native,
/// closes any open flyouts, and notifies the UI.
pub fn trigger_emergency_kill_switch(app_handle: Option<&AppHandle>) {
    log_taskbar_event(
        "system",
        "emergency_kill_switch",
        "ok",
        Some(serde_json::json!({ "reason": "user_hotkey_or_command" })),
    );

    // 1. Immediately restore native taskbar
    restore_windows_taskbar_hard();

    // 2. Reset all per-window switches to native Windows
    USE_GILI_START.store(false, Ordering::SeqCst);
    USE_GILI_SEARCH.store(false, Ordering::SeqCst);
    USE_GILI_QUICK_SETTINGS.store(false, Ordering::SeqCst);
    USE_GILI_VOLUME_OUTPUT.store(false, Ordering::SeqCst);
    USE_GILI_NOTIF_CAL.store(false, Ordering::SeqCst);
    USE_GILI_TRAY.store(false, Ordering::SeqCst);

    // 3. Close any active flyouts
    crate::taskbar_flyout::hide_taskbar_flyout();

    // 4. Emit event to frontend if app handle is present
    if let Some(app) = app_handle {
        let _ = app.emit("taskbar-emergency-killed", ());
    }
}

#[tauri::command]
pub fn set_taskbar_window_switches(switches: TaskbarWindowSwitches) {
    let entitled = cfg!(test) || crate::store_license::can_use_taskbar();
    let effective = if entitled {
        switches
    } else {
        TaskbarWindowSwitches::default()
    };

    USE_GILI_START.store(effective.use_gili_start, Ordering::SeqCst);
    USE_GILI_SEARCH.store(effective.use_gili_search, Ordering::SeqCst);
    USE_GILI_QUICK_SETTINGS.store(effective.use_gili_quick_settings, Ordering::SeqCst);
    USE_GILI_VOLUME_OUTPUT.store(effective.use_gili_volume_output, Ordering::SeqCst);
    USE_GILI_NOTIF_CAL.store(effective.use_gili_notif_cal, Ordering::SeqCst);
    USE_GILI_TRAY.store(effective.use_gili_tray, Ordering::SeqCst);

    if !cfg!(test) {
        log_taskbar_event(
            "system",
            "update_switches",
            "ok",
            Some(serde_json::to_value(&effective).unwrap_or_default()),
        );
    }
}

pub fn sync_switches_from_navbar_config_value(cfg: &serde_json::Value) {
    let entitled = cfg!(test) || crate::store_license::can_use_taskbar();
    let enabled = entitled
        && cfg
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

    let flag = |key: &str| -> bool {
        enabled && cfg.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
    };

    let switches = TaskbarWindowSwitches {
        use_gili_start: flag("useGiliStart"),
        use_gili_search: flag("useGiliSearch"),
        use_gili_quick_settings: flag("useGiliQuickSettings"),
        use_gili_volume_output: flag("useGiliVolumeOutput"),
        use_gili_notif_cal: flag("useGiliNotificationsCalendar"),
        use_gili_tray: flag("useGiliTray"),
    };

    set_taskbar_window_switches(switches);

    let genie_enabled = cfg
        .get("windowAnimation")
        .and_then(|v| v.as_str())
        .map(|s| s != "normal")
        .unwrap_or(true);
    crate::window_dock_anim::set_genie_animation_enabled(genie_enabled);

    if !cfg!(test) {
        let hide_windows_taskbar = flag("hideWindowsTaskbar");
        crate::taskbar_manager::set_taskbar_visible(!hide_windows_taskbar);
    }
}

pub fn init_taskbar_switches_from_disk() {
    let Some(appdata) = std::env::var_os("APPDATA") else {
        return;
    };
    let settings_path = std::path::PathBuf::from(appdata)
        .join("com.faiz.notch")
        .join("settings.json");
    let Ok(raw) = std::fs::read_to_string(&settings_path) else {
        return;
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return;
    };
    let default_off_migrated = parsed
        .get("opt_navbar_default_off_v5")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !default_off_migrated {
        return;
    }
    if let Some(navbar_cfg) = parsed.get("opt_navbar_config") {
        sync_switches_from_navbar_config_value(navbar_cfg);
    }
}

#[tauri::command]
pub fn get_taskbar_window_switches() -> TaskbarWindowSwitches {
    TaskbarWindowSwitches {
        use_gili_start: USE_GILI_START.load(Ordering::SeqCst),
        use_gili_search: USE_GILI_SEARCH.load(Ordering::SeqCst),
        use_gili_quick_settings: USE_GILI_QUICK_SETTINGS.load(Ordering::SeqCst),
        use_gili_volume_output: USE_GILI_VOLUME_OUTPUT.load(Ordering::SeqCst),
        use_gili_notif_cal: USE_GILI_NOTIF_CAL.load(Ordering::SeqCst),
        use_gili_tray: USE_GILI_TRAY.load(Ordering::SeqCst),
    }
}

#[tauri::command]
pub fn trigger_taskbar_kill_switch(app: AppHandle) {
    trigger_emergency_kill_switch(Some(&app));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_taskbar_window_switches_defaults_and_toggle() {
        // Defaults must be false (native Windows) as per Rule 3
        let initial = get_taskbar_window_switches();
        assert!(!initial.use_gili_start);
        assert!(!initial.use_gili_search);
        assert!(!initial.use_gili_quick_settings);
        assert!(!initial.use_gili_volume_output);
        assert!(!initial.use_gili_notif_cal);
        assert!(!initial.use_gili_tray);

        // Toggle on
        set_taskbar_window_switches(TaskbarWindowSwitches {
            use_gili_start: true,
            use_gili_search: true,
            use_gili_quick_settings: true,
            use_gili_volume_output: true,
            use_gili_notif_cal: true,
            use_gili_tray: true,
        });

        let updated = get_taskbar_window_switches();
        assert!(updated.use_gili_start);
        assert!(updated.use_gili_volume_output);

        // Sync from JSON config: disabled navbar forces all switches false
        sync_switches_from_navbar_config_value(&serde_json::json!({
            "enabled": false,
            "useGiliStart": true,
            "useGiliSearch": true
        }));
        let when_disabled = get_taskbar_window_switches();
        assert!(!when_disabled.use_gili_start);
        assert!(!when_disabled.use_gili_search);

        // Enabled navbar honors per-window flags
        sync_switches_from_navbar_config_value(&serde_json::json!({
            "enabled": true,
            "useGiliStart": true,
            "useGiliSearch": false,
            "useGiliQuickSettings": true,
            "windowAnimation": "normal"
        }));
        let when_enabled = get_taskbar_window_switches();
        assert!(when_enabled.use_gili_start);
        assert!(!when_enabled.use_gili_search);
        assert!(when_enabled.use_gili_quick_settings);
        assert!(!crate::window_dock_anim::is_genie_animation_enabled());

        sync_switches_from_navbar_config_value(&serde_json::json!({
            "enabled": true,
            "windowAnimation": "genie"
        }));
        assert!(crate::window_dock_anim::is_genie_animation_enabled());

        // Reset to original state
        set_taskbar_window_switches(initial);
        let reset = get_taskbar_window_switches();
        assert!(!reset.use_gili_start);
        assert!(!reset.use_gili_volume_output);
    }
}
