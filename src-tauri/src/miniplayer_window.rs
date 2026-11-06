use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

static IS_MINIPLAYER_OPEN: OnceLock<Arc<Mutex<bool>>> = OnceLock::new();
static WAS_OPEN_BEFORE_FULLSCREEN: OnceLock<Arc<Mutex<bool>>> = OnceLock::new();

fn get_open_state() -> &'static Arc<Mutex<bool>> {
    IS_MINIPLAYER_OPEN.get_or_init(|| Arc::new(Mutex::new(false)))
}

fn get_fs_state() -> &'static Arc<Mutex<bool>> {
    WAS_OPEN_BEFORE_FULLSCREEN.get_or_init(|| Arc::new(Mutex::new(false)))
}

#[cfg(windows)]
fn apply_no_activate_style(win: &WebviewWindow) {
    if let Ok(hwnd) = win.hwnd() {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongW, SetWindowLongW, SetWindowPos, GWL_EXSTYLE, HWND_TOPMOST,
            SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
        };
        unsafe {
            let h = HWND(hwnd.0);
            let ex_style = GetWindowLongW(h, GWL_EXSTYLE);
            let new_ex_style = ex_style | (WS_EX_NOACTIVATE.0 as i32) | (WS_EX_TOOLWINDOW.0 as i32);
            SetWindowLongW(h, GWL_EXSTYLE, new_ex_style);
            let _ = SetWindowPos(
                h,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
    }
}

pub fn show_or_create_miniplayer(app: &AppHandle) -> Result<bool, String> {
    let open_arc = get_open_state();
    let mut is_open = open_arc.lock().unwrap();

    if let Some(w) = app.get_webview_window("miniplayer") {
        if let Ok(is_vis) = w.is_visible() {
            if is_vis {
                let _ = w.hide();
                *is_open = false;
                let _ = app.emit("miniplayer:visibility-changed", false);
                return Ok(false);
            }
        }
        let _ = w.show();
        #[cfg(windows)]
        apply_no_activate_style(&w);
        // Reset to click-through on re-show; frontend enables it on hover
        let _ = w.set_ignore_cursor_events(true);
        *is_open = true;
        let _ = app.emit("miniplayer:visibility-changed", true);
        return Ok(true);
    }

    // Window must be created in std::thread::spawn (same as settings window).
    // Tauri command handler threads cannot create WebView windows reliably.
    let app_clone = app.clone();
    std::thread::spawn(move || {
        // Compute bottom-right position before building
        let (init_x, init_y) = {
            #[cfg(windows)]
            {
                use windows::Win32::Foundation::POINT;
                use windows::Win32::Graphics::Gdi::{
                    GetMonitorInfoW, MonitorFromPoint, GetDeviceCaps, CreateDCW,
                    MONITORINFO, MONITOR_DEFAULTTOPRIMARY, LOGPIXELSX,
                };
                let pt = POINT { x: 0, y: 0 };
                let monitor = unsafe { MonitorFromPoint(pt, MONITOR_DEFAULTTOPRIMARY) };
                let mut mi = MONITORINFO {
                    cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                    ..Default::default()
                };
                if unsafe { GetMonitorInfoW(monitor, &mut mi).as_bool() } {
                    let sf = unsafe {
                        let display = windows::core::w!("DISPLAY");
                        let hdc = CreateDCW(display, None, None, None);
                        let dpi = GetDeviceCaps(hdc, LOGPIXELSX) as f64;
                        dpi / 96.0
                    };
                    let rc = mi.rcWork;
                    let log_right = rc.right as f64 / sf;
                    let log_bottom = rc.bottom as f64 / sf;
                    ((log_right - 440.0 - 12.0), (log_bottom - 88.0 - 12.0))
                } else {
                    (100.0, 100.0)
                }
            }
            #[cfg(not(windows))]
            { (100.0, 100.0) }
        };

        let win = tauri::WebviewWindowBuilder::new(
            &app_clone,
            "miniplayer",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("Gili Mini Player")
        .position(init_x, init_y)
        .inner_size(440.0, 88.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .visible(true)
        .focused(false)
        .initialization_script("window.__IS_MINIPLAYER_WINDOW__ = true;")
        .additional_browser_args("--autoplay-policy=no-user-gesture-required --enable-gpu-rasterization --disable-features=CalculateNativeWinOcclusion")
        .build();

        match win {
            Ok(w) => {
                #[cfg(windows)]
                apply_no_activate_style(&w);
                let _ = w.set_ignore_cursor_events(true);
                let _ = app_clone.emit("miniplayer:visibility-changed", true);
            }
            Err(e) => {
                eprintln!("[miniplayer] Window creation failed: {:?}", e);
            }
        }
    });

    *is_open = true;
    Ok(true)
}

pub fn close_miniplayer_window(app: &AppHandle) -> Result<(), String> {
    let open_arc = get_open_state();
    let mut is_open = open_arc.lock().unwrap();
    if let Some(w) = app.get_webview_window("miniplayer") {
        let _ = w.hide();
    }
    *is_open = false;
    let _ = app.emit("miniplayer:visibility-changed", false);
    Ok(())
}

pub fn check_fullscreen_and_autohide(app: &AppHandle) {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Shell::{
            SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE,
            QUNS_RUNNING_D3D_FULL_SCREEN,
        };
        let is_fullscreen = unsafe {
            if let Ok(state) = SHQueryUserNotificationState() {
                state == QUNS_RUNNING_D3D_FULL_SCREEN
                    || state == QUNS_BUSY
                    || state == QUNS_PRESENTATION_MODE
            } else {
                false
            }
        };

        let open_arc = get_open_state();
        let fs_arc = get_fs_state();
        let mut is_open = open_arc.lock().unwrap();
        let mut was_open_fs = fs_arc.lock().unwrap();

        if let Some(w) = app.get_webview_window("miniplayer") {
            if is_fullscreen {
                if *is_open {
                    *was_open_fs = true;
                    *is_open = false;
                    let _ = w.hide();
                    let _ = app.emit("miniplayer:visibility-changed", false);
                }
            } else if *was_open_fs {
                *was_open_fs = false;
                *is_open = true;
                let _ = w.show();
                apply_no_activate_style(&w);
                let _ = app.emit("miniplayer:visibility-changed", true);
            }
        }
    }
}

pub fn clamp_and_snap_rect(
    work_left: i32,
    work_top: i32,
    work_right: i32,
    work_bottom: i32,
    mut x: i32,
    mut y: i32,
    w: i32,
    h: i32,
) -> (i32, i32) {
    const MARGIN: i32 = 12;
    const ATTRACTION: i32 = 24;

    // Left edge snapping
    let snap_left = work_left + MARGIN;
    if (x - snap_left).abs() <= ATTRACTION {
        x = snap_left;
    }

    // Right edge snapping
    let snap_right = work_right - MARGIN - w;
    if (x - snap_right).abs() <= ATTRACTION {
        x = snap_right;
    }

    // Top edge snapping
    let snap_top = work_top + MARGIN;
    if (y - snap_top).abs() <= ATTRACTION {
        y = snap_top;
    }

    // Bottom edge snapping
    let snap_bottom = work_bottom - MARGIN - h;
    if (y - snap_bottom).abs() <= ATTRACTION {
        y = snap_bottom;
    }

    // Strict clamping within work area
    let clamped_x = x.clamp(work_left, (work_right - w).max(work_left));
    let clamped_y = y.clamp(work_top, (work_bottom - h).max(work_top));

    (clamped_x, clamped_y)
}

// --- Tauri Commands ---

#[tauri::command]
pub fn toggle_miniplayer(app: AppHandle) -> Result<bool, String> {
    show_or_create_miniplayer(&app)
}

#[tauri::command]
pub fn close_miniplayer(app: AppHandle) -> Result<(), String> {
    close_miniplayer_window(&app)
}

#[tauri::command]
pub fn is_miniplayer_open() -> bool {
    let open_arc = get_open_state();
    let guard = open_arc.lock().unwrap();
    *guard
}

#[tauri::command]
pub fn snap_miniplayer_position(
    _app: AppHandle,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> (i32, i32) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        };

        let pt = POINT { x, y };
        let monitor = unsafe { MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST) };
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };

        if unsafe { GetMonitorInfoW(monitor, &mut mi).as_bool() } {
            let rc = mi.rcWork;
            return clamp_and_snap_rect(rc.left, rc.top, rc.right, rc.bottom, x, y, width, height);
        }
    }

    (x, y)
}

#[tauri::command]
pub async fn set_miniplayer_mode(app: AppHandle, mode: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("miniplayer") {
        let (new_w, new_h) = if mode == "card" {
            (380.0, 440.0)
        } else {
            (440.0, 88.0)
        };

        if let (Ok(curr_pos), Ok(curr_size)) = (w.outer_position(), w.outer_size()) {
            let scale_factor = w.scale_factor().unwrap_or(1.0);
            let phys_w = (new_w * scale_factor).round() as u32;
            let phys_h = (new_h * scale_factor).round() as u32;

            let mut new_x = curr_pos.x;
            let mut new_y = curr_pos.y;

            #[cfg(windows)]
            {
                use windows::Win32::Foundation::POINT;
                use windows::Win32::Graphics::Gdi::{
                    GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
                };
                let pt = POINT { x: curr_pos.x, y: curr_pos.y };
                let monitor = unsafe { MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST) };
                let mut mi = MONITORINFO {
                    cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                    ..Default::default()
                };
                if unsafe { GetMonitorInfoW(monitor, &mut mi).as_bool() } {
                    let rc = mi.rcWork;
                    let curr_right = curr_pos.x + curr_size.width as i32;
                    let curr_bottom = curr_pos.y + curr_size.height as i32;

                    // If close to right edge (< 48px from margin), anchor right edge
                    if (rc.right - 12 - curr_right).abs() < 48 {
                        new_x = curr_right - phys_w as i32;
                    }
                    // If close to bottom edge (< 48px from margin), anchor bottom edge
                    if (rc.bottom - 12 - curr_bottom).abs() < 48 {
                        new_y = curr_bottom - phys_h as i32;
                    }

                    // Clamp within screen work area
                    new_x = new_x.clamp(rc.left, (rc.right - phys_w as i32).max(rc.left));
                    new_y = new_y.clamp(rc.top, (rc.bottom - phys_h as i32).max(rc.top));
                }
            }

            let _ = w.set_size(tauri::PhysicalSize::new(phys_w, phys_h));
            let _ = w.set_position(tauri::PhysicalPosition::new(new_x, new_y));
        } else {
            let _ = w.set_size(tauri::LogicalSize::new(new_w, new_h));
        }

        let _ = app.emit("miniplayer:mode-changed", mode);
    }
    Ok(())
}

#[tauri::command]
pub fn set_miniplayer_always_on_top(app: AppHandle, always_on_top: bool) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("miniplayer") {
        let _ = w.set_always_on_top(always_on_top);
    }
    Ok(())
}

#[tauri::command]
pub fn set_miniplayer_ignore_cursor(app: AppHandle, ignore: bool) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("miniplayer") {
        let _ = w.set_ignore_cursor_events(ignore);
    }
    Ok(())
}

#[tauri::command]
pub fn is_ctrl_down() -> bool {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL};
        unsafe { (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0 }
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[tauri::command]
pub fn is_lbutton_down() -> bool {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
        unsafe { (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0 }
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[derive(serde::Serialize)]
pub struct NotchProximity {
    pub is_near: bool,
    pub is_in_zone: bool,
}

#[tauri::command]
pub fn check_notch_proximity(
    _app: AppHandle,
    x: i32,
    y: i32,
    width: i32,
    _height: i32,
) -> NotchProximity {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        };

        let pt = POINT { x, y };
        let monitor = unsafe { MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST) };
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };

        if unsafe { GetMonitorInfoW(monitor, &mut mi).as_bool() } {
            let rc = mi.rcWork;
            let mon_center_x = rc.left + (rc.right - rc.left) / 2;
            let mini_center_x = x + width / 2;
            let mini_top_y = y;

            let dx = (mini_center_x - mon_center_x).abs();
            let dy = (mini_top_y - rc.top).abs();

            // Target notch zone: within 160px horizontally from center and 100px from top
            let is_in_zone = dx <= 160 && dy <= 100;
            // Near zone: radius 48px from target notch zone
            let is_near = dx <= 220 && dy <= 160;

            return NotchProximity { is_near, is_in_zone };
        }
    }

    NotchProximity {
        is_near: false,
        is_in_zone: false,
    }
}
