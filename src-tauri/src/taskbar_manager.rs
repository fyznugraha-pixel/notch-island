use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use windows::core::w;
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, POINT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DwmSetWindowAttribute, DWMWA_CLOAK};
use windows::Win32::Graphics::Gdi::{
    MonitorFromPoint, MonitorFromWindow, MONITOR_DEFAULTTONEAREST, MONITOR_DEFAULTTOPRIMARY,
};
use windows::Win32::UI::Shell::{
    SHAppBarMessage, APPBARDATA, ABM_GETSTATE, ABM_SETSTATE, ABS_AUTOHIDE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, FindWindowW, GetLayeredWindowAttributes, GetWindowLongW, IsWindowVisible,
    SetLayeredWindowAttributes, SetWindowLongW, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_BOTTOM,
    HWND_TOPMOST, LWA_ALPHA, SWP_FRAMECHANGED, SWP_HIDEWINDOW, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSENDCHANGING, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOW, SW_SHOWNA, WS_EX_LAYERED,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
};

static TASKBAR_HIDDEN: AtomicBool = AtomicBool::new(false);
static APP_EXITING: AtomicBool = AtomicBool::new(false);
static WATCHDOG_ENFORCE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
static ORIGINAL_TASKBAR_STATE: AtomicU32 = AtomicU32::new(u32::MAX);
static ORIGINAL_PRIMARY_EXSTYLE: AtomicU32 = AtomicU32::new(0);
static ORIGINAL_PRIMARY_EXSTYLE_CAPTURED: AtomicBool = AtomicBool::new(false);
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
    let prev = loop {
        let cur = TRAY_OVERFLOW_LEASE_COUNT.load(Ordering::Acquire);
        let next = cur.saturating_sub(1);
        if TRAY_OVERFLOW_LEASE_COUNT
            .compare_exchange_weak(cur, next, Ordering::SeqCst, Ordering::Acquire)
            .is_ok()
        {
            break cur;
        }
    };
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DiskFlagInfo {
    pub pid: u32,
    pub original_state: Option<u32>,
    pub original_exstyle: Option<u32>,
}

fn parse_disk_flag_content(raw: &str) -> Option<DiskFlagInfo> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed == "1" {
        return Some(DiskFlagInfo {
            pid: 0,
            original_state: None,
            original_exstyle: None,
        });
    }
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
        let pid = val.get("pid").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let original_state = val
            .get("original_state")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32)
            .filter(|&v| v != u32::MAX);
        let original_exstyle = val
            .get("original_exstyle")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);
        return Some(DiskFlagInfo {
            pid,
            original_state,
            original_exstyle,
        });
    }
    None
}

pub fn read_disk_flag_info() -> Option<DiskFlagInfo> {
    let flag_path = get_flag_path()?;
    let raw = std::fs::read_to_string(&flag_path).ok()?;
    parse_disk_flag_content(&raw)
}

pub fn remove_disk_flag_for_pid(target_pid: u32) {
    if let Some(flag_path) = get_flag_path() {
        let matches = match read_disk_flag_info() {
            Some(info) => info.pid == 0 || info.pid == target_pid,
            None => false,
        };
        if matches {
            let _ = std::fs::remove_file(&flag_path);
        }
    }
}

/// Persists the taskbar hidden state flag to disk so a crash or kill can be detected and restored.
fn write_disk_flag(hidden: bool) {
    if let Some(flag_path) = get_flag_path() {
        if hidden {
            if let Some(parent) = flag_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let exstyle_opt = if ORIGINAL_PRIMARY_EXSTYLE_CAPTURED.load(Ordering::SeqCst) {
                Some(ORIGINAL_PRIMARY_EXSTYLE.load(Ordering::SeqCst))
            } else {
                None
            };
            let payload = serde_json::json!({
                "pid": std::process::id(),
                "original_state": ORIGINAL_TASKBAR_STATE.load(Ordering::SeqCst),
                "original_exstyle": exstyle_opt,
            })
            .to_string();
            let tmp_path = flag_path.with_extension("flag.tmp");
            if std::fs::write(&tmp_path, payload.as_bytes()).is_ok() {
                if std::fs::rename(&tmp_path, &flag_path).is_err() {
                    let _ = std::fs::write(&flag_path, payload.as_bytes());
                    let _ = std::fs::remove_file(&tmp_path);
                }
            } else {
                let _ = std::fs::write(&flag_path, payload.as_bytes());
            }
        } else {
            remove_disk_flag_for_pid(std::process::id());
        }
    }
}

/// Checks if the previous session crashed while the taskbar was hidden.
/// If so, restores the taskbar immediately.
pub fn check_and_recover_on_startup() {
    if let Some(info) = read_disk_flag_info() {
        eprintln!("[Gili Taskbar] Detected unexpected exit with hidden taskbar. Restoring...");
        restore_taskbars_from_watchdog(info.original_state, info.original_exstyle);
        if let Some(flag_path) = get_flag_path() {
            let _ = std::fs::remove_file(&flag_path);
        }
    }
}

/// Saves the original taskbar auto-hide / always-on-top state via SHAppBarMessage.
fn save_original_state(primary_hwnd: HWND) {
    if ORIGINAL_TASKBAR_STATE.load(Ordering::SeqCst) != u32::MAX {
        return; // Already captured original state
    }

    unsafe {
        let mut abd = APPBARDATA {
            cbSize: std::mem::size_of::<APPBARDATA>() as u32,
            hWnd: primary_hwnd,
            ..Default::default()
        };
        let state = SHAppBarMessage(ABM_GETSTATE, &mut abd) as u32;
        let ex = GetWindowLongW(primary_hwnd, GWL_EXSTYLE) as u32;
        ORIGINAL_PRIMARY_EXSTYLE.store(ex, Ordering::SeqCst);
        ORIGINAL_PRIMARY_EXSTYLE_CAPTURED.store(true, Ordering::SeqCst);
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
            if saved != u32::MAX {
                saved
            } else {
                let mut query = APPBARDATA {
                    cbSize: std::mem::size_of::<APPBARDATA>() as u32,
                    hWnd: primary_hwnd,
                    ..Default::default()
                };
                let current = SHAppBarMessage(ABM_GETSTATE, &mut query) as u32;
                if (current & ABS_AUTOHIDE) == 0 {
                    return;
                }
                current & !ABS_AUTOHIDE
            }
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

unsafe fn is_tray_hwnd_hidden(hwnd: HWND) -> bool {
    if !IsWindowVisible(hwnd).as_bool() || has_empty_window_region(hwnd) {
        return true;
    }
    let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    if (ex & WS_EX_TRANSPARENT.0) != 0 {
        return true;
    }
    if (ex & WS_EX_LAYERED.0) != 0 {
        let mut alpha = 255u8;
        let mut flags = Default::default();
        if GetLayeredWindowAttributes(hwnd, None, Some(&mut alpha), Some(&mut flags)).is_ok()
            && (flags & LWA_ALPHA).0 != 0
            && alpha < 255
        {
            return true;
        }
    }
    false
}

pub fn is_any_tray_hwnd_hidden() -> bool {
    unsafe {
        if let Ok(hwnd) = FindWindowW(w!("Shell_TrayWnd"), None) {
            if !hwnd.0.is_null() && is_tray_hwnd_hidden(hwnd) {
                return true;
            }
        }
        let mut prev = HWND(std::ptr::null_mut());
        loop {
            let sec = FindWindowExW(
                HWND(std::ptr::null_mut()),
                prev,
                w!("Shell_SecondaryTrayWnd"),
                None,
            );
            if let Ok(hwnd) = sec {
                if hwnd.0.is_null() {
                    break;
                }
                if is_tray_hwnd_hidden(hwnd) {
                    return true;
                }
                prev = hwnd;
            } else {
                break;
            }
        }
    }
    false
}

unsafe fn uncloak_and_show_tray_hwnd(hwnd: HWND, is_primary: bool) {
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
    let mut strip_mask = WS_EX_TRANSPARENT.0 | WS_EX_NOACTIVATE.0;
    if is_primary && ORIGINAL_PRIMARY_EXSTYLE_CAPTURED.load(Ordering::SeqCst) {
        let orig = ORIGINAL_PRIMARY_EXSTYLE.load(Ordering::SeqCst);
        if (orig & WS_EX_LAYERED.0) == 0 {
            strip_mask |= WS_EX_LAYERED.0;
        }
        if (orig & WS_EX_TOOLWINDOW.0) == 0 {
            strip_mask |= WS_EX_TOOLWINDOW.0;
        }
    } else {
        strip_mask |= WS_EX_LAYERED.0;
    }
    let restored_ex = ex & !strip_mask;
    if restored_ex != ex {
        let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, restored_ex as i32);
    }
    let _ = ShowWindow(hwnd, SW_SHOWNA);
    let _ = SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
    );
    if !IsWindowVisible(hwnd).as_bool() {
        std::thread::sleep(std::time::Duration::from_millis(20));
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
        );
    }
}

pub fn restore_taskbars_from_watchdog(
    saved_state: Option<u32>,
    saved_exstyle: Option<u32>,
) {
    SHELL_TRAY_SUMMONING.store(false, Ordering::SeqCst);
    TASKBAR_HIDDEN.store(false, Ordering::SeqCst);
    if let Some(st) = saved_state {
        if st != u32::MAX {
            ORIGINAL_TASKBAR_STATE.store(st, Ordering::SeqCst);
        }
    }
    if let Some(ex) = saved_exstyle {
        ORIGINAL_PRIMARY_EXSTYLE.store(ex, Ordering::SeqCst);
        ORIGINAL_PRIMARY_EXSTYLE_CAPTURED.store(true, Ordering::SeqCst);
    }

    unsafe {
        if let Ok(hwnd) = FindWindowW(w!("Shell_TrayWnd"), None) {
            if !hwnd.0.is_null() {
                set_shell_autohide_state(hwnd, false);
                uncloak_and_show_tray_hwnd(hwnd, true);
            }
        }

        let mut prev = HWND(std::ptr::null_mut());
        loop {
            let sec = FindWindowExW(
                HWND(std::ptr::null_mut()),
                prev,
                w!("Shell_SecondaryTrayWnd"),
                None,
            );
            if let Ok(hwnd) = sec {
                if hwnd.0.is_null() {
                    break;
                }
                uncloak_and_show_tray_hwnd(hwnd, false);
                prev = hwnd;
            } else {
                break;
            }
        }
    }
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
    if !visible && APP_EXITING.load(Ordering::Acquire) {
        return;
    }

    let _guard = WATCHDOG_ENFORCE_LOCK
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    if visible {
        // Clear hidden flags before uncloaking so WinEvent hooks and the enforcement loop
        // never re-hide Shell_TrayWnd when SW_SHOW fires EVENT_OBJECT_SHOW.
        SHELL_TRAY_SUMMONING.store(false, Ordering::SeqCst);
        TASKBAR_HIDDEN.store(false, Ordering::SeqCst);
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
                    uncloak_and_show_tray_hwnd(hwnd, true);
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
                    uncloak_and_show_tray_hwnd(hwnd, false);
                }
                prev = hwnd;
            } else {
                break;
            }
        }
    }

    if !visible {
        TASKBAR_HIDDEN.store(true, Ordering::SeqCst);
        write_disk_flag(true);
        drop(_guard);
        ensure_watchdog_started();
        crate::taskbar_safety::ensure_taskbar_watchdog_spawned();
    } else {
        write_disk_flag(false);
    }
}

pub fn refresh_taskbar_visibility() {
    if APP_EXITING.load(Ordering::Acquire) {
        return;
    }
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
    if APP_EXITING.load(Ordering::Acquire)
        || !TASKBAR_HIDDEN.load(Ordering::Acquire)
        || hwnd.0.is_null()
        || id_object != OBJID_WINDOW.0
    {
        return;
    }
    let Ok(_guard) = WATCHDOG_ENFORCE_LOCK.try_lock() else {
        return;
    };
    if APP_EXITING.load(Ordering::Acquire) || !TASKBAR_HIDDEN.load(Ordering::Acquire) {
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
        while GetMessageW(&mut msg, HWND(std::ptr::null_mut()), 0, 0).0 > 0 {
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
            if APP_EXITING.load(Ordering::Acquire) {
                break;
            }
            if TASKBAR_HIDDEN.load(Ordering::SeqCst) {
                let _guard = WATCHDOG_ENFORCE_LOCK
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                if APP_EXITING.load(Ordering::Acquire) || !TASKBAR_HIDDEN.load(Ordering::SeqCst) {
                    continue;
                }
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
    APP_EXITING.store(true, Ordering::SeqCst);
    TRAY_OVERFLOW_LEASE_COUNT.store(0, Ordering::SeqCst);
    if TASKBAR_HIDDEN.load(Ordering::SeqCst)
        || read_disk_flag_info().is_some()
        || is_any_tray_hwnd_hidden()
    {
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

    #[test]
    fn test_disk_flag_parse_formats() {
        assert_eq!(
            parse_disk_flag_content("1"),
            Some(DiskFlagInfo {
                pid: 0,
                original_state: None,
                original_exstyle: None,
            })
        );
        assert_eq!(
            parse_disk_flag_content(r#"{"pid":4242,"original_state":1,"original_exstyle":393216}"#),
            Some(DiskFlagInfo {
                pid: 4242,
                original_state: Some(1),
                original_exstyle: Some(393216),
            })
        );
        assert_eq!(
            parse_disk_flag_content(r#"{"pid":4242,"original_state":0}"#),
            Some(DiskFlagInfo {
                pid: 4242,
                original_state: Some(0),
                original_exstyle: None,
            })
        );
        assert_eq!(
            parse_disk_flag_content(&format!(r#"{{"pid":4242,"original_state":{}}}"#, u32::MAX)),
            Some(DiskFlagInfo {
                pid: 4242,
                original_state: None,
                original_exstyle: None,
            })
        );
        assert_eq!(parse_disk_flag_content(""), None);
        assert_eq!(parse_disk_flag_content("invalid"), None);
    }
}
