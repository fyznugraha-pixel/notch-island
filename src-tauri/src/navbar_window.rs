use std::os::windows::process::CommandExt;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{LogicalPosition, LogicalSize, Manager};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_LWIN, VK_CONTROL, VK_SHIFT, VK_ESCAPE,
};
use windows::Win32::UI::Shell::{
    SHAppBarMessage, APPBARDATA, ABM_NEW, ABM_REMOVE, ABM_QUERYPOS, ABM_SETPOS,
    ABE_BOTTOM, ABE_TOP, ABE_LEFT, ABE_RIGHT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

static APPBAR_REGISTERED: AtomicBool = AtomicBool::new(false);

/// Registers or updates the AppBar reservation for the anchored navbar so maximized windows don't overlap it.
fn register_or_update_appbar(hwnd: HWND, edge: u32, rect: RECT) {
    unsafe {
        let mut abd = APPBARDATA {
            cbSize: std::mem::size_of::<APPBARDATA>() as u32,
            hWnd: hwnd,
            uCallbackMessage: 0,
            uEdge: edge,
            rc: rect,
            ..Default::default()
        };

        if !APPBAR_REGISTERED.load(Ordering::SeqCst) {
            let _ = SHAppBarMessage(ABM_NEW, &mut abd);
            APPBAR_REGISTERED.store(true, Ordering::SeqCst);
        }

        let _ = SHAppBarMessage(ABM_QUERYPOS, &mut abd);
        let height = rect.bottom - rect.top;
        let width = rect.right - rect.left;

        match edge {
            ABE_BOTTOM => abd.rc.top = abd.rc.bottom - height,
            ABE_TOP => abd.rc.bottom = abd.rc.top + height,
            ABE_LEFT => abd.rc.right = abd.rc.left + width,
            ABE_RIGHT => abd.rc.left = abd.rc.right - width,
            _ => {}
        }
        let _ = SHAppBarMessage(ABM_SETPOS, &mut abd);
    }
}

/// Removes the AppBar reservation when floating, hiding, or closing the navbar window.
pub fn remove_appbar_if_registered(hwnd: HWND) {
    if APPBAR_REGISTERED.swap(false, Ordering::SeqCst) {
        unsafe {
            let mut abd = APPBARDATA {
                cbSize: std::mem::size_of::<APPBARDATA>() as u32,
                hWnd: hwnd,
                ..Default::default()
            };
            let _ = SHAppBarMessage(ABM_REMOVE, &mut abd);
        }
    }
}

pub fn show_or_create_navbar_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("navbar") {
        let _ = w.show();
        let _ = w.unminimize();
        #[cfg(windows)]
        if let Ok(raw_hwnd) = w.hwnd() {
            let hwnd = HWND(raw_hwnd.0);
            unsafe {
                let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
                let _ = SetWindowLongW(
                    hwnd,
                    GWL_EXSTYLE,
                    ex | (WS_EX_TOOLWINDOW.0 as i32) | (WS_EX_NOACTIVATE.0 as i32),
                );
            }
        }
        return;
    }

    let app_clone = app.clone();
    std::thread::spawn(move || {
        match tauri::WebviewWindowBuilder::new(
            &app_clone,
            "navbar",
            tauri::WebviewUrl::App("index.html?window=navbar".into()),
        )
        .title("Gili Navbar")
        .inner_size(800.0, 70.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(true)
        .initialization_script("window.__IS_NAVBAR_WINDOW__ = true;")
        .additional_browser_args("--autoplay-policy=no-user-gesture-required --enable-gpu-rasterization --disable-features=CalculateNativeWinOcclusion")
        .build()
        {
            Ok(win) => {
                #[cfg(windows)]
                if let Ok(raw_hwnd) = win.hwnd() {
                    let hwnd = HWND(raw_hwnd.0);
                    unsafe {
                        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
                        let _ = SetWindowLongW(
                            hwnd,
                            GWL_EXSTYLE,
                            ex | (WS_EX_TOOLWINDOW.0 as i32) | (WS_EX_NOACTIVATE.0 as i32),
                        );
                    }
                }

                let nw = win.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        #[cfg(windows)]
                        if let Ok(raw_hwnd) = nw.hwnd() {
                            remove_appbar_if_registered(HWND(raw_hwnd.0));
                        }
                        let _ = nw.hide();
                    }
                });
            }
            Err(e) => {
                eprintln!("Failed to create navbar window: {:?}", e);
            }
        }
    });
}

pub fn hide_navbar_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("navbar") {
        #[cfg(windows)]
        if let Ok(raw_hwnd) = w.hwnd() {
            remove_appbar_if_registered(HWND(raw_hwnd.0));
        }
        let _ = w.hide();
    }
}

#[tauri::command]
pub fn toggle_navbar(app: tauri::AppHandle, enabled: bool) {
    if enabled {
        show_or_create_navbar_window(&app);
    } else {
        hide_navbar_window(&app);
        crate::taskbar_manager::set_taskbar_visible(true);
    }
}

#[tauri::command]
pub fn open_navbar_window(app: tauri::AppHandle) {
    show_or_create_navbar_window(&app);
}

#[tauri::command]
pub fn close_navbar_window(app: tauri::AppHandle) {
    hide_navbar_window(&app);
    crate::taskbar_manager::set_taskbar_visible(true);
}

#[tauri::command]
pub fn sync_navbar_bounds(
    app: tauri::AppHandle,
    width: f64,
    height: f64,
    position: String,
    distance_from_edge: f64,
    is_anchored: Option<bool>,
) {
    if let Some(win) = app.get_webview_window("navbar") {
        if let Ok(Some(monitor)) = win.current_monitor() {
            let scale_factor = monitor.scale_factor();
            let mon_size = monitor.size();
            let mon_width = mon_size.width as f64 / scale_factor;
            let mon_height = mon_size.height as f64 / scale_factor;

            let safe_w = width.clamp(120.0, mon_width);
            let safe_h = height.clamp(40.0, 160.0);

            let (target_x, target_y) = match position.as_str() {
                "top" => {
                    let x = (mon_width - safe_w) / 2.0;
                    let y = distance_from_edge;
                    (x, y)
                }
                "left" => {
                    let x = distance_from_edge;
                    let y = (mon_height - safe_h) / 2.0;
                    (x, y)
                }
                "right" => {
                    let x = mon_width - safe_w - distance_from_edge;
                    let y = (mon_height - safe_h) / 2.0;
                    (x, y)
                }
                _ => {
                    // bottom
                    let x = (mon_width - safe_w) / 2.0;
                    let y = mon_height - safe_h - distance_from_edge;
                    (x, y)
                }
            };

            let _ = win.set_size(LogicalSize::new(safe_w, safe_h));
            let _ = win.set_position(LogicalPosition::new(target_x, target_y));

            #[cfg(windows)]
            if let Ok(raw_hwnd) = win.hwnd() {
                let hwnd = HWND(raw_hwnd.0);
                let anchored = is_anchored.unwrap_or(distance_from_edge == 0.0);
                if anchored {
                    let mon_pos = monitor.position();
                    let edge = match position.as_str() {
                        "top" => ABE_TOP,
                        "left" => ABE_LEFT,
                        "right" => ABE_RIGHT,
                        _ => ABE_BOTTOM,
                    };
                    let phys_h = (safe_h * scale_factor).round() as i32;
                    let phys_w = (safe_w * scale_factor).round() as i32;

                    let rect = match edge {
                        ABE_TOP => RECT {
                            left: mon_pos.x,
                            top: mon_pos.y,
                            right: mon_pos.x + mon_size.width as i32,
                            bottom: mon_pos.y + phys_h,
                        },
                        ABE_LEFT => RECT {
                            left: mon_pos.x,
                            top: mon_pos.y,
                            right: mon_pos.x + phys_w,
                            bottom: mon_pos.y + mon_size.height as i32,
                        },
                        ABE_RIGHT => RECT {
                            left: mon_pos.x + mon_size.width as i32 - phys_w,
                            top: mon_pos.y,
                            right: mon_pos.x + mon_size.width as i32,
                            bottom: mon_pos.y + mon_size.height as i32,
                        },
                        _ => RECT {
                            left: mon_pos.x,
                            top: mon_pos.y + mon_size.height as i32 - phys_h,
                            right: mon_pos.x + mon_size.width as i32,
                            bottom: mon_pos.y + mon_size.height as i32,
                        },
                    };
                    register_or_update_appbar(hwnd, edge, rect);
                } else {
                    remove_appbar_if_registered(hwnd);
                }
            }
        }
    }
}

#[tauri::command]
pub fn trigger_start_menu() {
    unsafe {
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_windows_search() {
    unsafe {
        // Win + S
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(b'S', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'S', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_quick_settings() {
    unsafe {
        // Win + A (Windows 11 Quick Settings / Action Center flyout: Wi-Fi, Volume, Battery)
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(b'A', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'A', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_notification_center() {
    unsafe {
        // Win + N (Windows 11 Notifications & Calendar flyout)
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(b'N', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'N', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_file_explorer() {
    unsafe {
        // Win + E
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(b'E', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'E', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_task_manager() {
    unsafe {
        // Ctrl + Shift + Esc
        keybd_event(VK_CONTROL.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(VK_SHIFT.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(VK_ESCAPE.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(VK_ESCAPE.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_SHIFT.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn launch_target(target: String) {
    let _ = std::process::Command::new("cmd.exe")
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .args(["/c", "start", "", &target])
        .spawn();
}
