use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WebviewWindowBuilder};
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SetForegroundWindow};

#[link(name = "dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(
        hwnd: windows::Win32::Foundation::HWND,
        dw_attribute: u32,
        pv_attribute: *const core::ffi::c_void,
        cb_attribute: u32,
    ) -> windows::core::HRESULT;
}

const DWMWA_SYSTEMBACKDROP_TYPE: u32 = 38;
const DWMSBT_NONE: u32 = 1;
const DWMSBT_ACRYLIC: u32 = 3;

static FLYOUT_OPEN: AtomicBool = AtomicBool::new(false);
static ACTIVE_TARGET: Mutex<String> = Mutex::new(String::new());
static LAST_FG_HWND: AtomicIsize = AtomicIsize::new(0);
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FlyoutTriggerRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FlyoutOpenPayload {
    pub target: String,
    pub trigger_rect: Option<FlyoutTriggerRect>,
    pub position: Option<String>,
    pub theme: Option<String>,
}

pub fn init_flyout_manager(app: &AppHandle) {
    let _ = APP_HANDLE.set(app.clone());
    ensure_flyout_window(app);
}

/// Ensures the dedicated flyout window exists (hidden initially).
pub fn ensure_flyout_window(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(win) = app.get_webview_window("taskbar_flyout") {
        return Some(win);
    }

    match WebviewWindowBuilder::new(
        app,
        "taskbar_flyout",
        tauri::WebviewUrl::App("index.html?window=flyout".into()),
    )
    .title("Gili System Flyout")
    .inner_size(400.0, 520.0)
    .position(-10000.0, -10000.0)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(false)
    .visible(false)
    .initialization_script("window.__IS_TASKBAR_FLYOUT_WINDOW__ = true;")
    .additional_browser_args(
        "--autoplay-policy=no-user-gesture-required --enable-gpu-rasterization --disable-features=CalculateNativeWinOcclusion",
    )
    .build()
    {
        Ok(win) => {
            let win_clone = win.clone();
            win.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::Focused(focused) => {
                        if !focused && FLYOUT_OPEN.load(Ordering::SeqCst) {
                            hide_taskbar_flyout();
                        }
                    }
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = win_clone.hide();
                        FLYOUT_OPEN.store(false, Ordering::SeqCst);
                    }
                    _ => {}
                }
            });
            Some(win)
        }
        Err(e) => {
            eprintln!("[Gili Flyout] Error building window: {:?}", e);
            None
        }
    }
}

pub fn get_flyout_dimensions_for_target(target: &str) -> (f64, f64) {
    match target {
        "start" => (600.0, 640.0),                 // Board 87/91
        "search" => (740.0, 700.0),                // Board 88/92
        "tray" => (260.0, 300.0),                  // Board 89/93
        "quickSettings" => (400.0, 540.0),         // Board 90/94
        "volume" => (400.0, 520.0),                // Board 95/97
        "notificationsCalendar" => (388.0, 600.0), // Board 96/98
        _ => (400.0, 500.0),
    }
}

/// Applies Windows 11 Acrylic or clear system backdrop.
pub fn apply_flyout_backdrop(hwnd: HWND, is_liquid: bool) {
    unsafe {
        let backdrop_type = if is_liquid {
            DWMSBT_ACRYLIC
        } else {
            DWMSBT_NONE
        };
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            &backdrop_type as *const _ as *const _,
            std::mem::size_of::<u32>() as u32,
        );
    }
}

pub fn open_taskbar_flyout_by_target(target: &str) {
    if let Some(app) = APP_HANDLE.get() {
        open_taskbar_flyout_internal(app, target, None, None, None);
    }
}

pub fn open_taskbar_flyout_internal(
    app: &AppHandle,
    target: &str,
    trigger_rect: Option<FlyoutTriggerRect>,
    dock_position: Option<String>,
    theme_opt: Option<String>,
) {
    // Check toggle: if clicking same target while open, close it
    if FLYOUT_OPEN.load(Ordering::SeqCst) {
        let current = ACTIVE_TARGET.lock().unwrap().clone();
        if current == target {
            hide_taskbar_flyout();
            return;
        }
    }

    let Some(win) = ensure_flyout_window(app) else {
        return;
    };

    // Save previous external foreground window
    unsafe {
        let fg = GetForegroundWindow();
        if let Ok(raw_hwnd) = win.hwnd() {
            if fg.0 != raw_hwnd.0 {
                LAST_FG_HWND.store(fg.0 as isize, Ordering::SeqCst);
            }
        }
    }

    let (desired_w, desired_h) = get_flyout_dimensions_for_target(target);
    let pos_str = dock_position.unwrap_or_else(|| "bottom".into());

    // Calculate monitor work area and DPI-adjusted coordinates
    let scale_factor = win.scale_factor().unwrap_or(1.0);
    let (target_x, target_y) = calculate_anchored_position(
        &win,
        &pos_str,
        desired_w,
        desired_h,
        trigger_rect.as_ref(),
        scale_factor,
    );

    let _ = win.set_size(tauri::LogicalSize::new(desired_w, desired_h));
    let _ = win.set_position(tauri::LogicalPosition::new(target_x, target_y));

    let is_liquid = theme_opt.as_deref().unwrap_or("solid") == "liquid";
    #[cfg(windows)]
    if let Ok(raw_hwnd) = win.hwnd() {
        let hwnd = HWND(raw_hwnd.0);
        apply_flyout_backdrop(hwnd, is_liquid);
    }

    let _ = win.show();
    let _ = win.set_focus();

    FLYOUT_OPEN.store(true, Ordering::SeqCst);
    *ACTIVE_TARGET.lock().unwrap() = target.to_string();

    let _ = app.emit(
        "taskbar-flyout-state-changed",
        serde_json::json!({
            "isOpen": true,
            "target": target,
            "theme": if is_liquid { "liquid" } else { "solid" },
            "width": desired_w,
            "height": desired_h
        }),
    );

    crate::taskbar_logger::log_taskbar_event(
        target,
        "open_flyout",
        "ok",
        Some(serde_json::json!({
            "x": target_x,
            "y": target_y,
            "w": desired_w,
            "h": desired_h,
            "theme": if is_liquid { "liquid" } else { "solid" }
        })),
    );
}

fn calculate_anchored_position(
    _win: &WebviewWindow,
    pos: &str,
    width: f64,
    height: f64,
    trigger: Option<&FlyoutTriggerRect>,
    scale_factor: f64,
) -> (f64, f64) {
    let margin = 12.0;

    let point = if let Some(t) = trigger {
        POINT {
            x: ((t.x + t.width / 2.0) * scale_factor) as i32,
            y: ((t.y + t.height / 2.0) * scale_factor) as i32,
        }
    } else {
        POINT { x: 500, y: 500 }
    };

    let mut work_left = 0.0;
    let mut work_top = 0.0;
    let mut work_right = 1920.0;
    let mut work_bottom = 1080.0;

    unsafe {
        let hmon = MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(hmon, &mut mi).as_bool() {
            work_left = mi.rcWork.left as f64 / scale_factor;
            work_top = mi.rcWork.top as f64 / scale_factor;
            work_right = mi.rcWork.right as f64 / scale_factor;
            work_bottom = mi.rcWork.bottom as f64 / scale_factor;
        }
    }

    let (mut x, mut y) = match pos {
        "top" => {
            let initial_y = if let Some(t) = trigger {
                t.y + t.height + margin
            } else {
                work_top + margin
            };
            let initial_x = if let Some(t) = trigger {
                t.x + (t.width - width) / 2.0
            } else {
                (work_left + work_right - width) / 2.0
            };
            (initial_x, initial_y)
        }
        "left" => {
            let initial_x = if let Some(t) = trigger {
                t.x + t.width + margin
            } else {
                work_left + margin
            };
            let initial_y = if let Some(t) = trigger {
                t.y + (t.height - height) / 2.0
            } else {
                (work_top + work_bottom - height) / 2.0
            };
            (initial_x, initial_y)
        }
        "right" => {
            let initial_x = if let Some(t) = trigger {
                t.x - width - margin
            } else {
                work_right - width - margin
            };
            let initial_y = if let Some(t) = trigger {
                t.y + (t.height - height) / 2.0
            } else {
                (work_top + work_bottom - height) / 2.0
            };
            (initial_x, initial_y)
        }
        _ => {
            // "bottom"
            let initial_y = if let Some(t) = trigger {
                t.y - height - margin
            } else {
                work_bottom - height - margin
            };
            let initial_x = if let Some(t) = trigger {
                t.x + (t.width - width) / 2.0
            } else {
                (work_left + work_right - width) / 2.0
            };
            (initial_x, initial_y)
        }
    };

    // Clamp coordinates strictly within monitor work area
    if x < work_left + margin {
        x = work_left + margin;
    }
    if x + width > work_right - margin {
        x = work_right - width - margin;
    }
    if y < work_top + margin {
        y = work_top + margin;
    }
    if y + height > work_bottom - margin {
        y = work_bottom - height - margin;
    }

    (x.round(), y.round())
}

pub fn hide_taskbar_flyout() {
    if !FLYOUT_OPEN.swap(false, Ordering::SeqCst) {
        return;
    }

    let target = {
        let mut lock = ACTIVE_TARGET.lock().unwrap();
        let prev = lock.clone();
        lock.clear();
        prev
    };

    if let Some(app) = APP_HANDLE.get() {
        if let Some(win) = app.get_webview_window("taskbar_flyout") {
            let _ = win.hide();
        }
        let _ = app.emit(
            "taskbar-flyout-state-changed",
            serde_json::json!({ "isOpen": false, "target": target }),
        );
    }

    // Restore focus to previous foreground window
    let prev_hwnd = LAST_FG_HWND.swap(0, Ordering::SeqCst);
    if prev_hwnd != 0 {
        unsafe {
            let _ = SetForegroundWindow(HWND(prev_hwnd as *mut _));
        }
    }

    crate::taskbar_logger::log_taskbar_event(&target, "close_flyout", "ok", None);
}

#[tauri::command]
pub fn toggle_taskbar_flyout(app: AppHandle, payload: FlyoutOpenPayload) {
    if FLYOUT_OPEN.load(Ordering::SeqCst) {
        let current = ACTIVE_TARGET.lock().unwrap().clone();
        if current == payload.target {
            hide_taskbar_flyout();
            return;
        }
    }

    open_taskbar_flyout_internal(
        &app,
        &payload.target,
        payload.trigger_rect,
        payload.position,
        payload.theme,
    );
}

#[tauri::command]
pub fn close_taskbar_flyout() {
    hide_taskbar_flyout();
}

#[tauri::command]
pub fn is_taskbar_flyout_open() -> bool {
    FLYOUT_OPEN.load(Ordering::SeqCst)
}
