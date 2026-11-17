use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use windows::core::w;
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, POINT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DwmSetWindowAttribute, DWMWA_CLOAK};
use windows::Win32::Graphics::Gdi::{
    MonitorFromPoint, MonitorFromWindow, MONITOR_DEFAULTTONEAREST, MONITOR_DEFAULTTOPRIMARY,
};
use windows::Win32::UI::Shell::{
    SHAppBarMessage, APPBARDATA, ABM_GETSTATE, ABM_SETSTATE, ABS_ALWAYSONTOP, ABS_AUTOHIDE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, FindWindowW, GetLayeredWindowAttributes, GetWindowLongW, IsWindowVisible,
    SetLayeredWindowAttributes, SetWindowLongW, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_BOTTOM,
    LWA_ALPHA, SWP_FRAMECHANGED, SWP_HIDEWINDOW, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSENDCHANGING,
    SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOW, SW_SHOWNA, WS_EX_LAYERED, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
};

static TASKBAR_HIDDEN: AtomicBool = AtomicBool::new(false);
static ORIGINAL_TASKBAR_STATE: AtomicU32 = AtomicU32::new(0);
static WATCHDOG_INITIALIZED: AtomicBool = AtomicBool::new(false);
static TRAY_OVERFLOW_LEASE_COUNT: AtomicU32 = AtomicU32::new(0);
static TRAY_OVERFLOW_LEASE_GEN: AtomicU64 = AtomicU64::new(0);
static SHELL_TRAY_SUMMONING: AtomicBool = AtomicBool::new(false);

pub fn has_tray_overflow_lease() -> bool {
    TRAY_OVERFLOW_LEASE_COUNT.load(Ordering::Acquire) > 0
}

pub fn tray_overflow_lease_gen() -> u64 {
    TRAY_OVERFLOW_LEASE_GEN.load(Ordering::Acquire)
}

pub struct TrayOverflowLeaseGuard {
    released: bool,
}

pub fn acquire_tray_overflow_lease() -> TrayOverflowLeaseGuard {
    TRAY_OVERFLOW_LEASE_COUNT.fetch_add(1, Ordering::SeqCst);
    TRAY_OVERFLOW_LEASE_GEN.fetch_add(1, Ordering::SeqCst);
    TrayOverflowLeaseGuard { released: false }
}

pub fn release_tray_overflow_lease() {
    let prev = TRAY_OVERFLOW_LEASE_COUNT
        .try_update(Ordering::SeqCst, Ordering::SeqCst, |v| Some(v.saturating_sub(1)))
        .unwrap_or(0);
    if prev <= 1 && TASKBAR_HIDDEN.load(Ordering::SeqCst) {
        restore_shell_tray_hidden_now();
    }
}

impl Drop for TrayOverflowLeaseGuard {
    fn drop(&mut self) {
        if !self.released {
            self.released = true;
            release_tray_overflow_lease();
        }
    }
}

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

// Keep Shell_TrayWnd active in Win32/UIA without SW_HIDE or empty region while overflow is open.
unsafe fn cloak_transparent_tray_hwnd(hwnd: HWND) {
    let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    let stealth_ex =
        ex | WS_EX_LAYERED.0 | WS_EX_TRANSPARENT.0 | WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0;
    let ex_changed = stealth_ex != ex;
    if ex_changed {
        let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, stealth_ex as i32);
    }
    let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 0, LWA_ALPHA);
    let cloak: u32 = 1;
    let _ = DwmSetWindowAttribute(
        hwnd,
        DWMWA_CLOAK,
        &cloak as *const u32 as *const std::ffi::c_void,
        std::mem::size_of::<u32>() as u32,
    );
    let mut flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOSENDCHANGING;
    if ex_changed {
        flags |= SWP_FRAMECHANGED;
    }
    let _ = SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, flags);
}

unsafe fn needs_stealth_reapply(hwnd: HWND) -> bool {
    let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    let required = WS_EX_LAYERED.0 | WS_EX_TRANSPARENT.0 | WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0;
    if (ex & required) != required {
        return true;
    }
    let mut alpha = 255u8;
    let mut flags = Default::default();
    if GetLayeredWindowAttributes(hwnd, None, Some(&mut alpha), Some(&mut flags)).is_err()
        || (flags & LWA_ALPHA).0 == 0
        || alpha != 0
    {
        return true;
    }
    let mut cloaked: u32 = 0;
    if DwmGetWindowAttribute(
        hwnd,
        DWMWA_CLOAK,
        &mut cloaked as *mut u32 as *mut std::ffi::c_void,
        std::mem::size_of::<u32>() as u32,
    )
    .is_err()
        || cloaked == 0
    {
        return true;
    }
    false
}

pub fn prepare_shell_tray_for_overflow_hwnd(hwnd: HWND) {
    if hwnd.0.is_null() {
        return;
    }
    SHELL_TRAY_SUMMONING.store(true, Ordering::SeqCst);
    unsafe {
        use windows::Win32::Graphics::Gdi::{CreateRectRgn, DeleteObject, SetWindowRgn, HGDIOBJ};

        let rgn = CreateRectRgn(0, 0, 1, 1);
        if !rgn.is_invalid() && SetWindowRgn(hwnd, rgn, false) == 0 {
            let _ = DeleteObject(HGDIOBJ(rgn.0));
        }

        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        let wake_ex =
            (ex & !(WS_EX_TRANSPARENT.0 | WS_EX_NOACTIVATE.0)) | WS_EX_LAYERED.0 | WS_EX_TOOLWINDOW.0;
        if wake_ex != ex {
            let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, wake_ex as i32);
        }
        let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 1, LWA_ALPHA);
        let cloak: u32 = 0;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_CLOAK,
            &cloak as *const u32 as *const std::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
        let _ = ShowWindow(hwnd, SW_SHOWNA);
    }
}

pub fn finish_shell_tray_summon() {
    SHELL_TRAY_SUMMONING.store(false, Ordering::SeqCst);
    if !TASKBAR_HIDDEN.load(Ordering::SeqCst) {
        return;
    }
    unsafe {
        use windows::Win32::Graphics::Gdi::{SetWindowRgn, HRGN};
        if let Ok(hwnd) = FindWindowW(w!("Shell_TrayWnd"), None) {
            if !hwnd.0.is_null() {
                let _ = SetWindowRgn(hwnd, HRGN::default(), false);
                if has_tray_overflow_lease() {
                    cloak_transparent_tray_hwnd(hwnd);
                } else if should_hide_tray_hwnd(hwnd) {
                    cloak_and_hide_tray_hwnd(hwnd);
                }
            }
        }
    }
}

pub fn restore_shell_tray_hidden_now() {
    SHELL_TRAY_SUMMONING.store(false, Ordering::SeqCst);
    if !TASKBAR_HIDDEN.load(Ordering::SeqCst) || has_tray_overflow_lease() {
        return;
    }
    unsafe {
        if let Ok(hwnd) = FindWindowW(w!("Shell_TrayWnd"), None) {
            if !hwnd.0.is_null() && should_hide_tray_hwnd(hwnd) {
                cloak_and_hide_tray_hwnd(hwnd);
            }
        }
    }
}

unsafe fn uncloak_and_show_tray_hwnd(hwnd: HWND) {
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
    let restored_ex = ex & !(WS_EX_TRANSPARENT.0 | WS_EX_NOACTIVATE.0);
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

unsafe fn should_hide_tray_hwnd(hwnd: HWND) -> bool {
    let mode = crate::navbar_window::get_monitor_mode();
    if mode.eq_ignore_ascii_case("all") {
        return true;
    }
    let tray_mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    if let Some((ml, mt, mr, mb)) = crate::navbar_window::get_primary_navbar_mon_rect() {
        let center = POINT {
            x: ml + (mr - ml) / 2,
            y: mt + (mb - mt) / 2,
        };
        let nav_mon = MonitorFromPoint(center, MONITOR_DEFAULTTONEAREST);
        return tray_mon == nav_mon;
    }
    if mode.eq_ignore_ascii_case("primary") {
        let primary_mon = MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
        return tray_mon == primary_mon;
    }
    false
}

/// Safely hides or restores the primary and secondary Windows taskbars per active Gili monitor.
pub fn set_taskbar_visible(visible: bool) {
    let visible = if !visible && !crate::store_license::can_use_taskbar() {
        true
    } else {
        visible
    };
    if visible {
        SHELL_TRAY_SUMMONING.store(false, Ordering::SeqCst);
    }

    unsafe {
        let primary = FindWindowW(w!("Shell_TrayWnd"), None);
        if let Ok(hwnd) = primary {
            if !hwnd.0.is_null() {
                let hide_this = !visible && should_hide_tray_hwnd(hwnd);
                if hide_this {
                    save_original_state(hwnd);
                    set_shell_autohide_state(hwnd, true);
                    if has_tray_overflow_lease() {
                        cloak_transparent_tray_hwnd(hwnd);
                    } else {
                        cloak_and_hide_tray_hwnd(hwnd);
                    }
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
                let hide_this = !visible && should_hide_tray_hwnd(hwnd);
                if hide_this {
                    cloak_and_hide_tray_hwnd(hwnd);
                } else {
                    uncloak_and_show_tray_hwnd(hwnd);
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

pub fn refresh_taskbar_visibility() {
    let hidden = TASKBAR_HIDDEN.load(Ordering::SeqCst);
    set_taskbar_visible(!hidden);
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
    if (class_name == SHELL_TRAY_WND || class_name == SHELL_SECONDARY_TRAY_WND)
        && should_hide_tray_hwnd(hwnd)
    {
        if class_name == SHELL_TRAY_WND && SHELL_TRAY_SUMMONING.load(Ordering::Acquire) {
            return;
        }
        if class_name == SHELL_TRAY_WND && has_tray_overflow_lease() {
            cloak_transparent_tray_hwnd(hwnd);
        } else {
            cloak_and_hide_tray_hwnd(hwnd);
        }
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
                    let enforce = |hwnd: HWND, is_primary: bool| {
                        if !should_hide_tray_hwnd(hwnd) {
                            return;
                        }
                        if is_primary && SHELL_TRAY_SUMMONING.load(Ordering::Acquire) {
                            return;
                        }
                        if is_primary && has_tray_overflow_lease() {
                            if needs_stealth_reapply(hwnd) {
                                cloak_transparent_tray_hwnd(hwnd);
                            }
                            return;
                        }
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
                            enforce(hwnd, true);
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
                            enforce(hwnd, false);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tray_overflow_lease_guard_refcount() {
        assert!(!has_tray_overflow_lease());
        {
            let _g1 = acquire_tray_overflow_lease();
            assert!(has_tray_overflow_lease());
            {
                let _g2 = acquire_tray_overflow_lease();
                assert!(has_tray_overflow_lease());
            }
            assert!(has_tray_overflow_lease());
        }
        assert!(!has_tray_overflow_lease());
    }
}
