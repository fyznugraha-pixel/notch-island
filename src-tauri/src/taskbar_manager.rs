use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::UI::Shell::{
    SHAppBarMessage, APPBARDATA, ABM_GETSTATE, ABM_SETSTATE, ABS_AUTOHIDE, ABS_ALWAYSONTOP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, FindWindowW, IsWindowVisible, SetWindowPos, ShowWindow,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOW,
};

static TASKBAR_HIDDEN: AtomicBool = AtomicBool::new(false);
static ORIGINAL_TASKBAR_STATE: AtomicU32 = AtomicU32::new(0);
static WATCHDOG_INITIALIZED: AtomicBool = AtomicBool::new(false);

/// Returns the path to the crash fail-safe flag file on disk.
fn get_flag_path() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA").or_else(|| std::env::var_os("APPDATA"))?;
    let dir = PathBuf::from(base).join("gili");
    Some(dir.join("taskbar_hidden.flag"))
}

/// Persists the taskbar hidden state flag to disk so a crash can be detected on subsequent launch.
fn write_disk_flag(hidden: bool) {
    if let Some(flag_path) = get_flag_path() {
        if hidden {
            if let Some(parent) = flag_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&flag_path, b"1");
        } else {
            let _ = std::fs::remove_file(&flag_path);
        }
    }
}

/// Checks if the previous session crashed while the taskbar was hidden.
/// If so, restores the taskbar immediately.
pub fn check_and_recover_on_startup() {
    if let Some(flag_path) = get_flag_path() {
        if flag_path.exists() {
            eprintln!("[Gili Taskbar] Detected unexpected exit with hidden taskbar. Restoring...");
            set_taskbar_visible(true);
            let _ = std::fs::remove_file(&flag_path);
        }
    }
}

/// Saves the original taskbar auto-hide / always-on-top state via SHAppBarMessage.
fn save_original_state(primary_hwnd: HWND) {
    if ORIGINAL_TASKBAR_STATE.load(Ordering::SeqCst) != 0 {
        return; // Already captured original state
    }

    unsafe {
        let mut abd = APPBARDATA {
            cbSize: std::mem::size_of::<APPBARDATA>() as u32,
            hWnd: primary_hwnd,
            ..Default::default()
        };
        let state = SHAppBarMessage(ABM_GETSTATE, &mut abd) as u32;
        ORIGINAL_TASKBAR_STATE.store(state, Ordering::SeqCst);
    }
}

/// Sets the taskbar auto-hide state using Shell API as a secondary protection layer.
fn set_shell_autohide_state(primary_hwnd: HWND, autohide: bool) {
    unsafe {
        let state_val = if autohide {
            ABS_AUTOHIDE
        } else {
            let saved = ORIGINAL_TASKBAR_STATE.load(Ordering::SeqCst);
            if saved != 0 { saved } else { ABS_ALWAYSONTOP }
        };

        let mut abd = APPBARDATA {
            cbSize: std::mem::size_of::<APPBARDATA>() as u32,
            hWnd: primary_hwnd,
            lParam: LPARAM(state_val as isize),
            ..Default::default()
        };
        let _ = SHAppBarMessage(ABM_SETSTATE, &mut abd);
    }
}

/// Safely hides or restores the primary and all secondary Windows taskbars.
pub fn set_taskbar_visible(visible: bool) {
    unsafe {
        let primary = FindWindowW(w!("Shell_TrayWnd"), None);
        if let Ok(hwnd) = primary {
            if !hwnd.0.is_null() {
                if !visible {
                    save_original_state(hwnd);
                    set_shell_autohide_state(hwnd, true);
                    let _ = ShowWindow(hwnd, SW_HIDE);
                } else {
                    set_shell_autohide_state(hwnd, false);
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

        // Secondary taskbars on all monitors
        let mut prev = HWND(std::ptr::null_mut());
        loop {
            let sec = FindWindowExW(HWND(std::ptr::null_mut()), prev, w!("Shell_SecondaryTrayWnd"), None);
            if let Ok(hwnd) = sec {
                if hwnd.0.is_null() {
                    break;
                }
                let cmd = if visible { SW_SHOW } else { SW_HIDE };
                let _ = ShowWindow(hwnd, cmd);
                if visible {
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
                prev = hwnd;
            } else {
                break;
            }
        }
    }

    TASKBAR_HIDDEN.store(!visible, Ordering::SeqCst);
    write_disk_flag(!visible);
    ensure_watchdog_started();
}

/// Starts a resilient background watchdog thread that monitors Explorer restarts.
/// If Explorer recreates Shell_TrayWnd while Gili navbar is active, it re-hides it.
fn ensure_watchdog_started() {
    if WATCHDOG_INITIALIZED.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(|| {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(1000));
            if TASKBAR_HIDDEN.load(Ordering::SeqCst) {
                unsafe {
                    let primary = FindWindowW(w!("Shell_TrayWnd"), None);
                    if let Ok(hwnd) = primary {
                        if !hwnd.0.is_null() && IsWindowVisible(hwnd).as_bool() {
                            // Taskbar was recreated or made visible by Explorer, hide it again
                            let _ = ShowWindow(hwnd, SW_HIDE);
                        }
                    }

                    // Check secondary tray windows as well
                    let mut prev = HWND(std::ptr::null_mut());
                    loop {
                        let sec = FindWindowExW(HWND(std::ptr::null_mut()), prev, w!("Shell_SecondaryTrayWnd"), None);
                        if let Ok(hwnd) = sec {
                            if hwnd.0.is_null() {
                                break;
                            }
                            if IsWindowVisible(hwnd).as_bool() {
                                let _ = ShowWindow(hwnd, SW_HIDE);
                            }
                            prev = hwnd;
                        } else {
                            break;
                        }
                    }
                }
            }
        }
    });
}

/// Guarantees that Windows Taskbar is restored on app exit or panic.
pub fn restore_taskbar_on_exit() {
    if TASKBAR_HIDDEN.load(Ordering::SeqCst) {
        set_taskbar_visible(true);
    }
}

#[tauri::command]
pub fn set_windows_taskbar_hidden(hidden: bool) {
    set_taskbar_visible(!hidden);
}

#[tauri::command]
pub fn set_windows_taskbar_visible(visible: bool) {
    set_taskbar_visible(visible);
}

#[tauri::command]
pub fn get_windows_taskbar_hidden() -> bool {
    TASKBAR_HIDDEN.load(Ordering::SeqCst)
}
