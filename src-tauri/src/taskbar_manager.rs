use std::sync::atomic::{AtomicBool, Ordering};
use windows::core::w;
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, ShowWindow, SW_HIDE, SW_SHOW,
};

static TASKBAR_HIDDEN: AtomicBool = AtomicBool::new(false);

/// Safely hides or restores the primary and secondary Windows taskbars.
pub fn set_taskbar_visible(visible: bool) {
    unsafe {
        let primary = FindWindowW(w!("Shell_TrayWnd"), None);
        if let Ok(hwnd) = primary {
            if !hwnd.0.is_null() {
                let cmd = if visible { SW_SHOW } else { SW_HIDE };
                let _ = ShowWindow(hwnd, cmd);
            }
        }

        // Secondary taskbars on multi-monitor setups
        let sec_hwnd = FindWindowW(w!("Shell_SecondaryTrayWnd"), None);
        if let Ok(hwnd) = sec_hwnd {
            if !hwnd.0.is_null() {
                let cmd = if visible { SW_SHOW } else { SW_HIDE };
                let _ = ShowWindow(hwnd, cmd);
            }
        }
    }
    TASKBAR_HIDDEN.store(!visible, Ordering::SeqCst);
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
pub fn get_windows_taskbar_hidden() -> bool {
    TASKBAR_HIDDEN.load(Ordering::SeqCst)
}
