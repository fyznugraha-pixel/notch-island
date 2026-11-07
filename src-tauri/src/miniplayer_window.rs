use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewWindow};

static IS_MINIPLAYER_OPEN: OnceLock<Arc<Mutex<bool>>> = OnceLock::new();
static WAS_OPEN_BEFORE_FULLSCREEN: OnceLock<Arc<Mutex<bool>>> = OnceLock::new();
static CURRENT_MODE: OnceLock<Arc<Mutex<String>>> = OnceLock::new();
static WAS_RETURNED_TO_NOTCH: OnceLock<Arc<Mutex<bool>>> = OnceLock::new();
static TRACKER_STARTED: OnceLock<bool> = OnceLock::new();

fn get_open_state() -> &'static Arc<Mutex<bool>> {
    IS_MINIPLAYER_OPEN.get_or_init(|| Arc::new(Mutex::new(false)))
}

fn get_fs_state() -> &'static Arc<Mutex<bool>> {
    WAS_OPEN_BEFORE_FULLSCREEN.get_or_init(|| Arc::new(Mutex::new(false)))
}

fn get_mode() -> &'static Arc<Mutex<String>> {
    CURRENT_MODE.get_or_init(|| Arc::new(Mutex::new("bar".into())))
}

fn get_returned_to_notch_state() -> &'static Arc<Mutex<bool>> {
    WAS_RETURNED_TO_NOTCH.get_or_init(|| Arc::new(Mutex::new(false)))
}

pub fn get_bottom_right_position(mode: &str) -> (f64, f64) {
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
                if dpi > 0.0 { dpi / 96.0 } else { 1.0 }
            };
            let rc = mi.rcWork;
            let log_right = rc.right as f64 / sf;
            let log_bottom = rc.bottom as f64 / sf;
            let (w, h) = if mode == "card" {
                (380.0, 340.0)
            } else {
                (440.0, 130.0)
            };
            let margin = 16.0;
            return (log_right - w - margin, log_bottom - h - margin);
        }
    }
    (800.0, 500.0)
}

pub fn reset_miniplayer_position_to_bottom_right(app: &AppHandle) {
    *get_returned_to_notch_state().lock().unwrap() = true;
    if let Some(w) = app.get_webview_window("miniplayer") {
        let mode = get_mode().lock().unwrap().clone();
        let (x, y) = get_bottom_right_position(&mode);
        let _ = w.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
    }
}

#[cfg(windows)]
fn nudge_cursor() {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_MOVE, MOUSEINPUT,
    };
    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: 0,
                dwFlags: MOUSEEVENTF_MOVE,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    unsafe {
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub struct MiniplayerCursorHoverPayload {
    pub in_window: bool,
    pub in_toolbar: bool,
}

pub fn ensure_miniplayer_tracker(app: &AppHandle) {
    if TRACKER_STARTED.get().is_some() {
        return;
    }
    let _ = TRACKER_STARTED.set(true);

    let app_handle_return = app.clone();
    let _ = app.listen("miniplayer:return-to-notch", move |_| {
        reset_miniplayer_position_to_bottom_right(&app_handle_return);
    });

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut is_click_through = false;
        let mut was_dragging = false;
        let mut last_state = MiniplayerCursorHoverPayload {
            in_window: false,
            in_toolbar: false,
        };

        loop {
            std::thread::sleep(std::time::Duration::from_millis(30));

            let is_open = *get_open_state().lock().unwrap();
            if !is_open {
                if last_state.in_window {
                    last_state = MiniplayerCursorHoverPayload {
                        in_window: false,
                        in_toolbar: false,
                    };
                    let _ = app_handle.emit("miniplayer:cursor-hover", last_state);
                }
                if is_click_through {
                    if let Some(w) = app_handle.get_webview_window("miniplayer") {
                        let _ = w.set_ignore_cursor_events(false);
                    }
                    is_click_through = false;
                }
                continue;
            }

            let Some(win) = app_handle.get_webview_window("miniplayer") else {
                continue;
            };

            if win.is_visible().unwrap_or(false) == false {
                continue;
            }

            #[cfg(windows)]
            {
                use windows::Win32::Foundation::POINT;
                use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
                use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};

                let mut pt = POINT { x: 0, y: 0 };
                if unsafe { GetCursorPos(&mut pt).is_ok() } {
                    let l_down = (unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } as u16 & 0x8000) != 0;

                    if let (Ok(win_pos), Ok(win_size)) = (win.outer_position(), win.outer_size()) {
                        let scale_factor = win.scale_factor().unwrap_or(1.0);
                        let in_x = pt.x >= win_pos.x && pt.x < win_pos.x + win_size.width as i32;
                        let in_y_full = pt.y >= win_pos.y && pt.y < win_pos.y + win_size.height as i32;

                        let current_mode = get_mode().lock().unwrap().clone();
                        let rel_y = if in_x && in_y_full {
                            (pt.y - win_pos.y) as f64 / scale_factor
                        } else {
                            -1.0
                        };

                        let win_h_logical = win_size.height as f64 / scale_factor;
                        let in_window = if in_x && in_y_full {
                            if !last_state.in_window {
                                // Saat collapsed (toolbar tersembunyi), area kosong 42px di bagian atas
                                // (baik di mode bar 88/130px maupun mode card 298/340px) tidak mentrigger hover.
                                rel_y >= 40.0 && rel_y <= win_h_logical
                            } else {
                                true
                            }
                        } else {
                            false
                        };

                        let toolbar_height = if current_mode == "card" { 52.0 } else { 52.0 };
                        let bottom_progress_height = if current_mode == "card" { 34.0 } else { 20.0 };
                        let in_top_toolbar = in_window && (rel_y >= 0.0 && rel_y < toolbar_height);
                        let in_bottom_progress = in_window
                            && (rel_y >= (win_h_logical - bottom_progress_height) && rel_y <= win_h_logical);
                        let mut in_toolbar = in_top_toolbar || in_bottom_progress;

                        if l_down && (was_dragging || (in_toolbar && !is_click_through)) {
                            was_dragging = true;
                            in_toolbar = true;
                        } else {
                            was_dragging = false;
                        }

                        let current_state = MiniplayerCursorHoverPayload {
                            in_window,
                            in_toolbar,
                        };

                        if current_state != last_state {
                            last_state = current_state;
                            let _ = app_handle.emit("miniplayer:cursor-hover", current_state);
                        }

                        if was_dragging {
                            // Keep drag active without altering click-through
                            continue;
                        }

                        if in_window && !in_toolbar {
                            // All window except toolbar: pass clicks through to background apps
                            if !is_click_through {
                                let _ = win.set_ignore_cursor_events(true);
                                is_click_through = true;
                            }
                        } else {
                            // On toolbar or outside window: ensure window receives clicks
                            if is_click_through {
                                let _ = win.set_ignore_cursor_events(false);
                                is_click_through = false;
                                nudge_cursor();
                            }
                        }
                    }
                }
            }
        }
    });
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
    ensure_miniplayer_tracker(app);
    let open_arc = get_open_state();
    let mut is_open = open_arc.lock().unwrap();

    if let Some(w) = app.get_webview_window("miniplayer") {
        if let Ok(is_vis) = w.is_visible() {
            if is_vis {
                // Emit request-close agar frontend bisa memainkan animasi exit yang smooth
                let _ = app.emit("miniplayer:request-close", ());

                // Fallback: jika frontend tidak menyelesaikan penutupan dalam 350ms, sembunyikan secara aman
                let w_clone = w.clone();
                let app_clone = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(350));
                    if let Ok(is_v) = w_clone.is_visible() {
                        if is_v {
                            let _ = w_clone.hide();
                            *get_open_state().lock().unwrap() = false;
                            let _ = app_clone.emit("miniplayer:visibility-changed", false);
                        }
                    }
                });
                return Ok(false);
            }
        }
        let returned_arc = get_returned_to_notch_state();
        let mut was_returned = returned_arc.lock().unwrap();
        if *was_returned {
            *was_returned = false;
            let mode = get_mode().lock().unwrap().clone();
            let (x, y) = get_bottom_right_position(&mode);
            let _ = w.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
        }
        let _ = w.show();
        #[cfg(windows)]
        apply_no_activate_style(&w);
        *is_open = true;
        let _ = app.emit("miniplayer:visibility-changed", true);
        return Ok(true);
    }

    // Window must be created in std::thread::spawn (same as settings window).
    // Tauri command handler threads cannot create WebView windows reliably.
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mode = get_mode().lock().unwrap().clone();
        let (init_x, init_y) = get_bottom_right_position(&mode);

        let win = tauri::WebviewWindowBuilder::new(
            &app_clone,
            "miniplayer",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("Gili Mini Player")
        .position(init_x, init_y)
        .inner_size(440.0, 130.0)
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
            SHQueryUserNotificationState, QUNS_RUNNING_D3D_FULL_SCREEN,
        };
        // Hanya trigger fullscreen auto-hide untuk game DirectX exclusive fullscreen nyata.
        // QUNS_BUSY dan QUNS_PRESENTATION_MODE sengaja tidak dipakai karena Windows otomatis
        // mengaktifkan QUNS_BUSY saat screenshot (Snipping Tool / Win+Shift+S) atau screen recording.
        let is_fullscreen = unsafe {
            if let Ok(state) = SHQueryUserNotificationState() {
                state == QUNS_RUNNING_D3D_FULL_SCREEN
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
pub fn reset_miniplayer_position(app: AppHandle) -> Result<(), String> {
    reset_miniplayer_position_to_bottom_right(&app);
    Ok(())
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
    *get_mode().lock().unwrap() = mode.clone();
    ensure_miniplayer_tracker(&app);
    let (new_w, new_h) = if mode == "card" {
        (380.0, 340.0)
    } else {
        (440.0, 130.0)
    };
    let _ = resize_miniplayer_internal(&app, new_w, new_h, false);
    let _ = app.emit("miniplayer:mode-changed", mode);
    Ok(())
}

#[tauri::command]
pub fn resize_miniplayer(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    resize_miniplayer_internal(&app, width, height, false)
}

fn resize_miniplayer_internal(
    app: &AppHandle,
    width: f64,
    height: f64,
    skip_if_lbutton: bool,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
        };
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        };

        if skip_if_lbutton {
            let l_down = unsafe { (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0 };
            if l_down {
                return Ok(());
            }
        }

        if let Some(w) = app.get_webview_window("miniplayer") {
            if let Ok(hwnd) = w.hwnd() {
                let h = HWND(hwnd.0);
                if let (Ok(curr_pos), Ok(curr_size)) = (w.outer_position(), w.outer_size()) {
                    let sf = w.scale_factor().unwrap_or(1.0);
                    let target_phys_w = (width * sf).round() as i32;
                    let target_phys_h = (height * sf).round() as i32;

                    if curr_size.width as i32 == target_phys_w && curr_size.height as i32 == target_phys_h {
                        return Ok(());
                    }

                    let monitor = unsafe { MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST) };
                    let mut mi = MONITORINFO {
                        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                        ..Default::default()
                    };

                    let mut new_x = curr_pos.x;
                    let mut new_y = curr_pos.y;

                    if unsafe { GetMonitorInfoW(monitor, &mut mi).as_bool() } {
                        let rc = mi.rcWork;
                        let monitor_center_x = (rc.left + rc.right) / 2;
                        let curr_center_x = curr_pos.x + (curr_size.width as i32) / 2;

                        if curr_center_x > monitor_center_x {
                            // Berada di paruh kanan layar: kunci tepi kanan
                            let curr_right = curr_pos.x + curr_size.width as i32;
                            new_x = curr_right - target_phys_w;
                        } else {
                            // Berada di paruh kiri layar: kunci tepi kiri
                            new_x = curr_pos.x;
                        }

                        // Kunci tepi bawah agar ukuran selalu mengembang/menyusut dari bawah
                        let curr_bottom = curr_pos.y + curr_size.height as i32;
                        new_y = curr_bottom - target_phys_h;

                        new_x = new_x.clamp(rc.left, (rc.right - target_phys_w).max(rc.left));
                        new_y = new_y.clamp(rc.top, (rc.bottom - target_phys_h).max(rc.top));
                    }

                    unsafe {
                        let _ = SetWindowPos(
                            h,
                            None,
                            new_x,
                            new_y,
                            target_phys_w,
                            target_phys_h,
                            SWP_NOZORDER | SWP_NOACTIVATE,
                        );
                    }
                }
            }
        }
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

            // Target notch zone: within 200px horizontally from center and 120px from top
            let is_in_zone = dx <= 200 && dy <= 120;
            // Near zone: radius 80px from target notch zone
            let is_near = dx <= 280 && dy <= 180;

            return NotchProximity { is_near, is_in_zone };
        }
    }

    NotchProximity {
        is_near: false,
        is_in_zone: false,
    }
}
