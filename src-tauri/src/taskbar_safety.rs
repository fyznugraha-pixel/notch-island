use std::os::windows::process::CommandExt;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use windows::core::{w, Interface, BSTR, HSTRING};
use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, WAIT_TIMEOUT};
use windows::Win32::System::Com::{
    CoInitializeEx, CoUninitialize, IServiceProvider, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Threading::{
    CreateMutexW, OpenMutexW, OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE,
    SYNCHRONIZATION_ACCESS_RIGHTS,
};
use windows::Win32::UI::Shell::{
    IShellBrowser, IShellDispatch2, IShellFolderViewDual, IShellView, IShellWindows,
    ShellWindows, SID_STopLevelBrowser, SVGIO_BACKGROUND, SWC_DESKTOP, SWFO_NEEDDISPATCH,
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

static WATCHDOG_CHILD: Mutex<Option<Child>> = Mutex::new(None);
static WATCHDOG_SPAWN_LOCK: Mutex<()> = Mutex::new(());
static DESIRED_HIDE_WINDOWS_TASKBAR: AtomicBool = AtomicBool::new(false);

const SINGLE_INSTANCE_MUTEX_NAME: windows::core::PCWSTR = w!("com_faiz_gili_single_instance_mutex");
const MUTEX_SYNCHRONIZE: u32 = 0x00100000;

fn watchdog_mutex_name(target_pid: u32) -> HSTRING {
    HSTRING::from(format!("Local\\gili_taskbar_watchdog_{}", target_pid))
}

fn is_watchdog_mutex_held(target_pid: u32) -> bool {
    let name = watchdog_mutex_name(target_pid);
    unsafe {
        match OpenMutexW(SYNCHRONIZATION_ACCESS_RIGHTS(MUTEX_SYNCHRONIZE), false, &name) {
            Ok(h) if !h.0.is_null() => {
                let _ = CloseHandle(h);
                true
            }
            _ => false,
        }
    }
}

fn is_process_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    unsafe {
        match OpenProcess(PROCESS_SYNCHRONIZE, false, pid) {
            Ok(handle) if !handle.0.is_null() => {
                let wait = WaitForSingleObject(handle, 0);
                let _ = CloseHandle(handle);
                wait == WAIT_TIMEOUT
            }
            _ => false,
        }
    }
}

fn is_any_live_gili_instance() -> bool {
    unsafe {
        match OpenMutexW(
            SYNCHRONIZATION_ACCESS_RIGHTS(MUTEX_SYNCHRONIZE),
            false,
            SINGLE_INSTANCE_MUTEX_NAME,
        ) {
            Ok(h) if !h.0.is_null() => {
                let _ = CloseHandle(h);
                true
            }
            _ => false,
        }
    }
}

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
    let mutex_name = watchdog_mutex_name(target_pid);
    let _watchdog_guard_handle = unsafe {
        match CreateMutexW(None, true, &mutex_name) {
            Ok(h) if !h.0.is_null() => {
                if GetLastError() == ERROR_ALREADY_EXISTS {
                    let _ = CloseHandle(h);
                    return;
                }
                Some(h)
            }
            _ => None,
        }
    };

    unsafe {
        if let Ok(process_handle) = OpenProcess(PROCESS_SYNCHRONIZE, false, target_pid) {
            if !process_handle.0.is_null() {
                let _ = WaitForSingleObject(process_handle, INFINITE);
                let _ = CloseHandle(process_handle);
            }
        }
    }

    let flag_info = taskbar_manager::read_disk_flag_info();
    let other_gili_alive = is_any_live_gili_instance();

    let (should_restore, saved_state, saved_exstyle, cleanup_pid) = match flag_info {
        Some(info) => {
            let owned_by_target = info.pid == 0 || info.pid == target_pid;
            let owner_dead = info.pid != 0 && !is_process_alive(info.pid);
            (
                owned_by_target || owner_dead,
                info.original_state,
                info.original_exstyle,
                if owned_by_target { target_pid } else { info.pid },
            )
        }
        None => {
            // Even if disk flag was removed prematurely right before a crash/exit race,
            // recover if no Gili instance is running and Explorer's tray is still hidden.
            let orphan_hidden = !other_gili_alive && taskbar_manager::is_any_tray_hwnd_hidden();
            (orphan_hidden, None, None, target_pid)
        }
    };

    if should_restore {
        taskbar_manager::restore_taskbars_from_watchdog(saved_state, saved_exstyle);
        if taskbar_manager::is_any_tray_hwnd_hidden() {
            std::thread::sleep(std::time::Duration::from_millis(120));
            taskbar_manager::restore_taskbars_from_watchdog(saved_state, saved_exstyle);
        }
        taskbar_manager::remove_disk_flag_for_pid(cleanup_pid);
    }

    if !other_gili_alive {
        crate::windows_dnd::restore_windows_dnd_on_exit();
        crate::toast_banners::restore_banners_on_exit();
    }

    if let Some(h) = _watchdog_guard_handle {
        unsafe {
            let _ = CloseHandle(h);
        }
    }
}

/// Direct Win32 taskbar unhide logic used by the emergency kill-switch.
pub fn restore_windows_taskbar_hard() {
    taskbar_manager::set_taskbar_visible(true);
}

const CREATE_NO_WINDOW: u32 = 0x08000000;
const DETACHED_PROCESS: u32 = 0x00000008;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x01000000;

/// Launches the watchdog via Explorer's Desktop shell (`IShellDispatch2::ShellExecute`) so its
/// parent PID is `explorer.exe` and it runs outside Gili's Job Object and Task Manager group.
fn try_spawn_watchdog_via_explorer(exe_path: &std::path::Path, pid_arg: &str) -> bool {
    unsafe {
        let hr_com = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let should_uninit = hr_com.is_ok();

        let result = (|| -> windows::core::Result<()> {
            let shell_windows: IShellWindows =
                windows::Win32::System::Com::CoCreateInstance(&ShellWindows, None, CLSCTX_ALL)?;
            let empty = windows_core::VARIANT::default();
            let mut hwnd_out: i32 = 0;
            let desktop_disp = shell_windows.FindWindowSW(
                &empty,
                &empty,
                SWC_DESKTOP,
                &mut hwnd_out,
                SWFO_NEEDDISPATCH,
            )?;
            let sp: IServiceProvider = desktop_disp.cast()?;
            let sb: IShellBrowser = sp.QueryService(&SID_STopLevelBrowser)?;
            let sv: IShellView = sb.QueryActiveShellView()?;
            let view_disp: IShellFolderViewDual = sv.GetItemObject(SVGIO_BACKGROUND)?;
            let shell_disp: IShellDispatch2 = view_disp.Application()?.cast()?;

            let exe_bstr = BSTR::from(exe_path.to_string_lossy().as_ref());
            let args_var = windows_core::VARIANT::from(format!("--taskbar-watchdog {}", pid_arg).as_str());
            let dir_var = windows_core::VARIANT::from(
                exe_path
                    .parent()
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_default()
                    .as_str(),
            );
            let op_var = windows_core::VARIANT::from("open");
            let show_var = windows_core::VARIANT::from(0i32); // SW_HIDE

            shell_disp.ShellExecute(&exe_bstr, &args_var, &dir_var, &op_var, &show_var)?;
            Ok(())
        })();

        if should_uninit {
            CoUninitialize();
        }
        result.is_ok()
    }
}

/// Spawns a detached watchdog process that guards taskbar restoration.
pub fn ensure_taskbar_watchdog_spawned() {
    let _spawn_guard = WATCHDOG_SPAWN_LOCK
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let current_pid = std::process::id();
    if is_watchdog_mutex_held(current_pid) {
        return;
    }

    let mut guard = WATCHDOG_CHILD
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(ref mut child) = *guard {
        if matches!(child.try_wait(), Ok(None)) {
            return;
        }
    }

    if let Ok(current_exe) = std::env::current_exe() {
        let pid_arg = current_pid.to_string();
        if try_spawn_watchdog_via_explorer(&current_exe, &pid_arg) {
            return;
        }
        let base_flags = CREATE_NO_WINDOW | DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP;
        let spawned = Command::new(&current_exe)
            .arg("--taskbar-watchdog")
            .arg(&pid_arg)
            .creation_flags(base_flags | CREATE_BREAKAWAY_FROM_JOB)
            .spawn()
            .or_else(|_| {
                Command::new(&current_exe)
                    .arg("--taskbar-watchdog")
                    .arg(&pid_arg)
                    .creation_flags(base_flags)
                    .spawn()
            });
        if let Ok(child) = spawned {
            *guard = Some(child);
        }
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

fn switches_from_navbar_config_value(
    cfg: &serde_json::Value,
    entitled: bool,
) -> (TaskbarWindowSwitches, bool) {
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

    let genie_enabled = cfg
        .get("windowAnimation")
        .and_then(|v| v.as_str())
        .map(|s| s != "normal")
        .unwrap_or(true);

    (switches, genie_enabled)
}

fn parse_navbar_config_from_settings_json(raw: &str) -> Option<serde_json::Value> {
    let parsed = serde_json::from_str::<serde_json::Value>(raw).ok()?;
    let default_off_migrated = parsed
        .get("opt_navbar_default_off_v5")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !default_off_migrated {
        return None;
    }
    parsed.get("opt_navbar_config").cloned()
}

pub fn set_desired_hide_windows_taskbar(hide: bool) {
    DESIRED_HIDE_WINDOWS_TASKBAR.store(hide, Ordering::SeqCst);
}

pub fn get_desired_hide_windows_taskbar() -> bool {
    DESIRED_HIDE_WINDOWS_TASKBAR.load(Ordering::SeqCst)
}

pub fn sync_switches_from_navbar_config_value(cfg: &serde_json::Value) {
    let entitled = cfg!(test) || crate::store_license::can_use_taskbar();
    let (switches, genie_enabled) = switches_from_navbar_config_value(cfg, entitled);

    set_taskbar_window_switches(switches);
    crate::window_dock_anim::set_genie_animation_enabled(genie_enabled);

    let enabled = entitled
        && cfg
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
    let hide_windows_taskbar = enabled
        && cfg
            .get("hideWindowsTaskbar")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
    set_desired_hide_windows_taskbar(hide_windows_taskbar);

    if !cfg!(test) {
        if !hide_windows_taskbar {
            crate::taskbar_manager::set_taskbar_visible(true);
        } else if crate::navbar_window::is_navbar_window_ready() {
            crate::taskbar_manager::set_taskbar_visible(false);
        }
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
    if let Some(navbar_cfg) = parse_navbar_config_from_settings_json(&raw) {
        sync_switches_from_navbar_config_value(&navbar_cfg);
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
pub(crate) static SWITCHES_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_taskbar_window_switches_defaults_and_toggle() {
        let _lock = SWITCHES_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());

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

    #[test]
    fn test_switches_from_navbar_config_value_and_entitlement() {
        let full_cfg = serde_json::json!({
            "enabled": true,
            "useGiliStart": true,
            "useGiliSearch": true,
            "useGiliQuickSettings": true,
            "useGiliVolumeOutput": true,
            "useGiliNotificationsCalendar": true,
            "useGiliTray": true,
            "windowAnimation": "normal"
        });

        let (switches, genie) = switches_from_navbar_config_value(&full_cfg, true);
        assert!(switches.use_gili_start);
        assert!(switches.use_gili_search);
        assert!(switches.use_gili_quick_settings);
        assert!(switches.use_gili_volume_output);
        assert!(switches.use_gili_notif_cal);
        assert!(switches.use_gili_tray);
        assert!(!genie);

        // Unentitled forces all switches false while keeping windowAnimation preference parsing pure
        let (locked, genie_locked) = switches_from_navbar_config_value(&full_cfg, false);
        assert!(!locked.use_gili_start);
        assert!(!locked.use_gili_search);
        assert!(!locked.use_gili_quick_settings);
        assert!(!locked.use_gili_volume_output);
        assert!(!locked.use_gili_notif_cal);
        assert!(!locked.use_gili_tray);
        assert!(!genie_locked);

        // Non-boolean values safely default false and missing windowAnimation defaults genie=true
        let malformed = serde_json::json!({
            "enabled": "true",
            "useGiliStart": true
        });
        let (mal_switches, mal_genie) = switches_from_navbar_config_value(&malformed, true);
        assert!(!mal_switches.use_gili_start);
        assert!(mal_genie);
    }

    #[test]
    fn test_parse_navbar_config_from_settings_json() {
        assert!(parse_navbar_config_from_settings_json("not json").is_none());
        assert!(parse_navbar_config_from_settings_json(r#"{"opt_navbar_config":{"enabled":true}}"#).is_none());
        assert!(parse_navbar_config_from_settings_json(
            r#"{"opt_navbar_default_off_v5":false,"opt_navbar_config":{"enabled":true}}"#
        )
        .is_none());
        assert!(parse_navbar_config_from_settings_json(r#"{"opt_navbar_default_off_v5":true}"#).is_none());

        let cfg = parse_navbar_config_from_settings_json(
            r#"{"opt_navbar_default_off_v5":true,"opt_navbar_config":{"enabled":true,"useGiliTray":true}}"#,
        )
        .expect("migrated config should parse");
        assert_eq!(cfg.get("enabled"), Some(&serde_json::json!(true)));
        assert_eq!(cfg.get("useGiliTray"), Some(&serde_json::json!(true)));
    }
}
