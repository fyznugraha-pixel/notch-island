use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use windows::core::w;
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM};
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_CLOAK};
use windows::Win32::UI::Shell::{
    SHAppBarMessage, APPBARDATA, ABM_GETSTATE, ABM_SETSTATE, ABS_AUTOHIDE, ABS_ALWAYSONTOP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, FindWindowW, GetWindowLongW, IsWindowVisible, SetLayeredWindowAttributes,
    SetWindowLongW, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_BOTTOM, LWA_ALPHA,
    SWP_FRAMECHANGED, SWP_HIDEWINDOW, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSENDCHANGING,
    SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOW, WS_EX_LAYERED, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT,
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

unsafe fn has_empty_window_region(hwnd: HWND) -> bool {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::{GetWindowRgnBox, NULLREGION};
    let mut rc = RECT::default();
    let kind = GetWindowRgnBox(hwnd, &mut rc);
    kind == NULLREGION && rc.right <= rc.left && rc.bottom <= rc.top
}

unsafe fn apply_empty_window_region(hwnd: HWND) {
    use windows::Win32::Graphics::Gdi::{CreateRectRgn, DeleteObject, SetWindowRgn, HGDIOBJ};
    if has_empty_window_region(hwnd) {
        return;
    }
    let rgn = CreateRectRgn(0, 0, 0, 0);
    if !rgn.is_invalid() && SetWindowRgn(hwnd, rgn, true) == 0 {
        let _ = DeleteObject(HGDIOBJ(rgn.0));
    }
}

unsafe fn clear_window_region(hwnd: HWND) {
    use windows::Win32::Graphics::Gdi::{SetWindowRgn, HRGN};
    let _ = SetWindowRgn(hwnd, HRGN::default(), true);
}

unsafe fn cloak_and_hide_tray_hwnd(hwnd: HWND) {
    let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    let hidden_ex = ex | WS_EX_LAYERED.0 | WS_EX_TRANSPARENT.0 | WS_EX_TOOLWINDOW.0;
    let ex_changed = hidden_ex != ex;
    if ex_changed {
        let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, hidden_ex as i32);
    }
    apply_empty_window_region(hwnd);
    let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 0, LWA_ALPHA);
    let cloak: u32 = 1;
    let _ = DwmSetWindowAttribute(
        hwnd,
        DWMWA_CLOAK,
        &cloak as *const u32 as *const std::ffi::c_void,
        std::mem::size_of::<u32>() as u32,
    );
    let _ = ShowWindow(hwnd, SW_HIDE);
    let mut flags = SWP_HIDEWINDOW | SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOSENDCHANGING;
    if ex_changed {
        flags |= SWP_FRAMECHANGED;
    }
    let _ = SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, flags);
}

unsafe fn uncloak_and_show_tray_hwnd(hwnd: HWND) {
    TASKBAR_HIDDEN.store(false, Ordering::SeqCst);
    clear_window_region(hwnd);
    let cloak: u32 = 0;
    let _ = DwmSetWindowAttribute(
        hwnd,
        DWMWA_CLOAK,
        &cloak as *const u32 as *const std::ffi::c_void,
        std::mem::size_of::<u32>() as u32,
    );
    let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA);
    let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    let restored_ex = ex & !WS_EX_TRANSPARENT.0;
    if restored_ex != ex {
        let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, restored_ex as i32);
    }
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

/// Safely hides or restores the primary and all secondary Windows taskbars.
pub fn set_taskbar_visible(visible: bool) {
    let visible = if !visible && !crate::store_license::can_use_taskbar() {
        true
    } else {
        visible
    };

    unsafe {
        let primary = FindWindowW(w!("Shell_TrayWnd"), None);
        if let Ok(hwnd) = primary {
            if !hwnd.0.is_null() {
                if !visible {
                    save_original_state(hwnd);
                    set_shell_autohide_state(hwnd, true);
                    cloak_and_hide_tray_hwnd(hwnd);
                } else {
                    set_shell_autohide_state(hwnd, false);
                    uncloak_and_show_tray_hwnd(hwnd);
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
                if visible {
                    uncloak_and_show_tray_hwnd(hwnd);
                } else {
                    cloak_and_hide_tray_hwnd(hwnd);
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

/// Starts a resilient background watchdog thread that monitors Explorer restarts or unhide flashes.
unsafe extern "system" fn tray_win_event_proc(
    _hook: windows::Win32::UI::Accessibility::HWINEVENTHOOK,
    _event: u32,
    hwnd: HWND,
    id_object: i32,
    _id_child: i32,
    _event_thread: u32,
    _event_time: u32,
) {
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, OBJID_WINDOW};
    if !TASKBAR_HIDDEN.load(Ordering::Acquire) || hwnd.0.is_null() || id_object != OBJID_WINDOW.0 {
        return;
    }
    let mut class_buf = [0u16; 32];
    let len = GetClassNameW(hwnd, &mut class_buf);
    if len <= 0 {
        return;
    }
    let class_name = &class_buf[..len as usize];
    const SHELL_TRAY_WND: &[u16] = &[
        b'S' as u16, b'h' as u16, b'e' as u16, b'l' as u16, b'l' as u16, b'_' as u16,
        b'T' as u16, b'r' as u16, b'a' as u16, b'y' as u16, b'W' as u16, b'n' as u16,
        b'd' as u16,
    ];
    const SHELL_SECONDARY_TRAY_WND: &[u16] = &[
        b'S' as u16, b'h' as u16, b'e' as u16, b'l' as u16, b'l' as u16, b'_' as u16,
        b'S' as u16, b'e' as u16, b'c' as u16, b'o' as u16, b'n' as u16, b'd' as u16,
        b'a' as u16, b'r' as u16, b'y' as u16, b'T' as u16, b'r' as u16, b'a' as u16,
        b'y' as u16, b'W' as u16, b'n' as u16, b'd' as u16,
    ];
    if class_name == SHELL_TRAY_WND || class_name == SHELL_SECONDARY_TRAY_WND {
        cloak_and_hide_tray_hwnd(hwnd);
    }
}

fn spawn_win_event_hook_thread() {
    std::thread::spawn(|| unsafe {
        use windows::Win32::Foundation::HMODULE;
        use windows::Win32::UI::Accessibility::SetWinEventHook;
        use windows::Win32::UI::WindowsAndMessaging::{
            DispatchMessageW, GetMessageW, TranslateMessage, EVENT_OBJECT_CREATE,
            EVENT_OBJECT_SHOW, MSG, WINEVENT_OUTOFCONTEXT,
        };

        let _create_hook = SetWinEventHook(
            EVENT_OBJECT_CREATE,
            EVENT_OBJECT_CREATE,
            HMODULE::default(),
            Some(tray_win_event_proc),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        );
        let _show_hook = SetWinEventHook(
            EVENT_OBJECT_SHOW,
            EVENT_OBJECT_SHOW,
            HMODULE::default(),
            Some(tray_win_event_proc),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        );

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, HWND(std::ptr::null_mut()), 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}

fn ensure_watchdog_started() {
    if WATCHDOG_INITIALIZED.swap(true, Ordering::SeqCst) {
        return;
    }

    spawn_win_event_hook_thread();

    std::thread::spawn(|| {
        loop {
            let sleep_ms = if TASKBAR_HIDDEN.load(Ordering::SeqCst) { 100 } else { 400 };
            std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
            if TASKBAR_HIDDEN.load(Ordering::SeqCst) {
                unsafe {
                    let enforce = |hwnd: HWND| {
                        let needs_hide = IsWindowVisible(hwnd).as_bool()
                            || ((GetWindowLongW(hwnd, GWL_EXSTYLE) as u32) & WS_EX_TRANSPARENT.0)
                                == 0
                            || !has_empty_window_region(hwnd);
                        if needs_hide {
                            cloak_and_hide_tray_hwnd(hwnd);
                        }
                    };

                    let primary = FindWindowW(w!("Shell_TrayWnd"), None);
                    if let Ok(hwnd) = primary {
                        if !hwnd.0.is_null() {
                            enforce(hwnd);
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
                            enforce(hwnd);
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
