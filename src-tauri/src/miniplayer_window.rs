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

static FOLLOW_SYSTEM_TEXT_SCALE: OnceLock<Arc<Mutex<bool>>> = OnceLock::new();

pub fn get_follow_system_text_scale() -> bool {
    *FOLLOW_SYSTEM_TEXT_SCALE.get_or_init(|| Arc::new(Mutex::new(true))).lock().unwrap()
}

pub fn get_effective_miniplayer_scale() -> f64 {
    if !get_follow_system_text_scale() {
        return 1.0;
    }
    crate::get_system_text_scale().clamp(1.0, 1.5)
}

fn get_returned_to_notch_state() -> &'static Arc<Mutex<bool>> {
    WAS_RETURNED_TO_NOTCH.get_or_init(|| Arc::new(Mutex::new(false)))
}

pub fn get_bottom_right_position(_mode: &str) -> (f64, f64) {
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
            let text_scale = get_effective_miniplayer_scale();
            let (w, h) = (440.0 * text_scale, 340.0 * text_scale);
            let margin = 16.0;
            return (log_right - w - margin, log_bottom - h - margin);
        }
    }
    (800.0, 500.0)
}

pub fn set_window_to_bottom_right(w: &WebviewWindow) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTOPRIMARY,
        };
        let sf = w.scale_factor().unwrap_or(1.0);
        let pt = POINT { x: 0, y: 0 };
        let monitor = unsafe { MonitorFromPoint(pt, MONITOR_DEFAULTTOPRIMARY) };
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if unsafe { GetMonitorInfoW(monitor, &mut mi).as_bool() } {
            let rc = mi.rcWork;
            let text_scale = get_effective_miniplayer_scale();
            let phys_w = (440.0 * text_scale * sf).round() as i32;
            let phys_h = (340.0 * text_scale * sf).round() as i32;
            let phys_margin = (16.0 * sf).round() as i32;
            let x = rc.right - phys_w - phys_margin;
            let y = rc.bottom - phys_h - phys_margin;
            let _ = w.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
            return;
        }
    }
    let mode = get_mode().lock().unwrap().clone();
    let (x, y) = get_bottom_right_position(&mode);
    let _ = w.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
}

pub fn reset_miniplayer_position_to_bottom_right(app: &AppHandle) {
    *get_returned_to_notch_state().lock().unwrap() = true;
    if let Some(w) = app.get_webview_window("miniplayer") {
        set_window_to_bottom_right(&w);
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
        let mut check_counter = 0u64;
        let mut last_emitted_scale = (crate::get_system_text_scale() * 100.0).round() as u32;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(30));
            check_counter = check_counter.wrapping_add(1);

            // Periksa perubahan skala teks Windows secara dinamis tanpa restart
            if check_counter % 15 == 0 {
                let current_raw_scale = crate::get_system_text_scale();
                let current_percent = (current_raw_scale * 100.0).round() as u32;
                if current_percent != last_emitted_scale {
                    last_emitted_scale = current_percent;
                    let _ = app_handle.emit("system:text-scale-changed", current_raw_scale);
                    if *get_open_state().lock().unwrap() {
                        let _ = resize_miniplayer_internal(&app_handle, 440.0, 340.0, false);
                    }
                }
            }

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
                        let in_x_raw = pt.x >= win_pos.x && pt.x < win_pos.x + win_size.width as i32;
                        let in_y_full = pt.y >= win_pos.y && pt.y < win_pos.y + win_size.height as i32;

                        let rel_x = if in_x_raw && in_y_full {
                            (pt.x - win_pos.x) as f64 / scale_factor
                        } else {
                            -1.0
                        };
                        let rel_y = if in_x_raw && in_y_full {
                            (pt.y - win_pos.y) as f64 / scale_factor
                        } else {
                            -1.0
                        };

                        let win_w_logical = win_size.width as f64 / scale_factor;
                        let win_h_logical = win_size.height as f64 / scale_factor;

                        // Tentukan apakah window berada di paruh kanan monitor (anchor kanan)
                        let is_right_half = {
                            use windows::Win32::Graphics::Gdi::{
                                GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
                            };
                            let m_pt = POINT { x: win_pos.x, y: win_pos.y };
                            let mon = unsafe { MonitorFromPoint(m_pt, MONITOR_DEFAULTTONEAREST) };
                            let mut mi = MONITORINFO {
                                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                                ..Default::default()
                            };
                            if unsafe { GetMonitorInfoW(mon, &mut mi).as_bool() } {
                                let mon_center_x = (mi.rcWork.left + mi.rcWork.right) / 2;
                                (win_pos.x + (win_size.width as i32) / 2) > mon_center_x
                            } else {
                                true
                            }
                        };

                        let text_scale = get_effective_miniplayer_scale();
                        let current_mode = get_mode().lock().unwrap().clone();
                        let card_w = 380.0 * text_scale;
                        let in_mode_x = if !in_x_raw || !in_y_full {
                            false
                        } else if current_mode == "card" && win_w_logical > (card_w + 2.0) {
                            if is_right_half {
                                rel_x >= (win_w_logical - card_w) && rel_x <= win_w_logical
                            } else {
                                rel_x >= 0.0 && rel_x <= card_w
                            }
                        } else {
                            true
                        };

                        // Di dalam kanvas 440x340 (dikalikan text_scale), komponen selalu menempel di dasar (win_h_logical).
                        // Bar mode: collapsed 88px (expanded 130px). Card mode: collapsed 298px (expanded 340px).
                        let collapsed_h = (if current_mode == "card" { 298.0 } else { 88.0 }) * text_scale;
                        let expanded_h = (if current_mode == "card" { 340.0 } else { 130.0 }) * text_scale;
                        let active_top_y = (win_h_logical - if last_state.in_window { expanded_h } else { collapsed_h }).max(0.0);
                        let expanded_top_y = (win_h_logical - expanded_h).max(0.0);

                        let in_window = in_mode_x && rel_y >= active_top_y && rel_y <= win_h_logical;

                        let toolbar_height = 52.0 * text_scale;
                        let bottom_progress_height = 22.0 * text_scale;
                        let in_top_toolbar = in_window && (rel_y >= expanded_top_y && rel_y < expanded_top_y + toolbar_height);
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
                            set_window_to_bottom_right(&w_clone);
                            *get_returned_to_notch_state().lock().unwrap() = true;
                            *get_open_state().lock().unwrap() = false;
                            let _ = app_clone.emit("miniplayer:visibility-changed", false);
                        }
                    }
                });
                return Ok(false);
            }
        }
        *get_returned_to_notch_state().lock().unwrap() = false;
        set_window_to_bottom_right(&w);
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
        let text_scale = get_effective_miniplayer_scale();

        let win = tauri::WebviewWindowBuilder::new(
            &app_clone,
            "miniplayer",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("Gili Mini Player")
        .position(init_x, init_y)
        .inner_size(440.0 * text_scale, 340.0 * text_scale)
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
                set_window_to_bottom_right(&w);
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
    *get_returned_to_notch_state().lock().unwrap() = true;
    if let Some(w) = app.get_webview_window("miniplayer") {
        let _ = w.hide();
        set_window_to_bottom_right(&w);
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

    // Top edge snapping (allow Bar Mode's visible top at +210/340 of window height to reach top of monitor)
    let is_bar = get_mode().lock().map(|m| *m == "bar").unwrap_or(false);
    let top_empty_offset = if is_bar { (h * 210) / 340 } else { 0 };
    let min_top = work_top - top_empty_offset;
    let snap_top = min_top + MARGIN;
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
    let clamped_y = y.clamp(min_top, (work_bottom - h).max(min_top));

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
    // Pertahankan ukuran kanvas tetap 440x340 agar transisi Card <-> Bar bebas glitch Win32/WebView2
    let _ = resize_miniplayer_internal(&app, 440.0, 340.0, false);
    let _ = app.emit("miniplayer:mode-changed", mode);
    Ok(())
}

#[tauri::command]
pub fn resize_miniplayer(app: AppHandle, _width: f64, _height: f64) -> Result<(), String> {
    resize_miniplayer_internal(&app, 440.0, 340.0, false)
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
                    let text_scale = get_effective_miniplayer_scale();
                    let sf = w.scale_factor().unwrap_or(1.0);
                    let target_phys_w = (width * text_scale * sf).round() as i32;
                    let target_phys_h = (height * text_scale * sf).round() as i32;

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
    app: AppHandle,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> NotchProximity {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        };

        let mut cursor_pt = POINT { x: 0, y: 0 };
        let has_cursor = unsafe { GetCursorPos(&mut cursor_pt).is_ok() };

        let (win_x, win_y, win_w, _win_h, sf) = if let Some(w) = app.get_webview_window("miniplayer") {
            let sf = w.scale_factor().unwrap_or(1.0);
            let pos = w.outer_position().unwrap_or(tauri::PhysicalPosition { x, y });
            let size = w.outer_size().unwrap_or(tauri::PhysicalSize {
                width: (width as f64 * sf).round() as u32,
                height: (height as f64 * sf).round() as u32,
            });
            (pos.x, pos.y, size.width as i32, size.height as i32, sf)
        } else {
            (x, y, width, height, 1.0)
        };

        let ref_pt = if has_cursor {
            cursor_pt
        } else {
            POINT { x: win_x + win_w / 2, y: win_y.max(0) }
        };
        let monitor = unsafe { MonitorFromPoint(ref_pt, MONITOR_DEFAULTTONEAREST) };
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };

        if unsafe { GetMonitorInfoW(monitor, &mut mi).as_bool() } {
            let rc = mi.rcWork;
            let text_scale = get_effective_miniplayer_scale();
            let mon_center_x = rc.left + (rc.right - rc.left) / 2;
            let mini_center_x = win_x + win_w / 2;
            let is_bar = get_mode().lock().map(|m| *m == "bar").unwrap_or(false);
            let visible_top_offset = if is_bar { (210.0 * text_scale * sf).round() as i32 } else { 0 };
            let mini_top_y = win_y + visible_top_offset;

            let dx_win_log = ((mini_center_x - mon_center_x).abs() as f64) / sf;
            let dy_win_log = ((mini_top_y - rc.top).abs() as f64) / sf;

            let (dx_cur_log, dy_cur_log) = if has_cursor {
                (
                    ((cursor_pt.x - mon_center_x).abs() as f64) / sf,
                    ((cursor_pt.y - rc.top).max(0) as f64) / sf,
                )
            } else {
                (9999.0, 9999.0)
            };

            // Target notch zone: within 220px horizontally from center and 120px from top (logical)
            let is_in_zone =
                (dx_win_log <= 220.0 * text_scale && dy_win_log <= 130.0 * text_scale)
                || (dx_cur_log <= 220.0 && dy_cur_log <= 115.0);
            // Near zone: radius around target notch zone
            let is_near = is_in_zone
                || (dx_win_log <= 300.0 * text_scale && dy_win_log <= 190.0 * text_scale)
                || (dx_cur_log <= 300.0 && dy_cur_log <= 175.0);

            return NotchProximity { is_near, is_in_zone };
        }
    }

    NotchProximity {
        is_near: false,
        is_in_zone: false,
    }
}

#[tauri::command]
pub fn set_follow_system_text_scale(app: AppHandle, follow: bool) -> Result<(), String> {
    *FOLLOW_SYSTEM_TEXT_SCALE.get_or_init(|| Arc::new(Mutex::new(true))).lock().unwrap() = follow;
    let _ = resize_miniplayer_internal(&app, 440.0, 340.0, false);
    let raw_scale = if follow { crate::get_system_text_scale() } else { 1.0 };
    let _ = app.emit("system:text-scale-changed", raw_scale);
    Ok(())
}
