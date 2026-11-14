use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex, OnceLock,
};
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewWindow};

static IS_MINIPLAYER_OPEN: OnceLock<Arc<Mutex<bool>>> = OnceLock::new();
static WAS_OPEN_BEFORE_FULLSCREEN: OnceLock<Arc<Mutex<bool>>> = OnceLock::new();
static CURRENT_MODE: OnceLock<Arc<Mutex<String>>> = OnceLock::new();
static WAS_RETURNED_TO_NOTCH: OnceLock<Arc<Mutex<bool>>> = OnceLock::new();
static TRACKER_STARTED: OnceLock<bool> = OnceLock::new();
static MINIPLAYER_VIS_GEN: AtomicU64 = AtomicU64::new(0);
static MINIPLAYER_IGNORE_CURSOR: AtomicBool = AtomicBool::new(true);
static MINIPLAYER_ALLOW_INTERACTIVE: AtomicBool = AtomicBool::new(false);

fn apply_ignore_cursor(win: &WebviewWindow, ignore: bool) {
    MINIPLAYER_IGNORE_CURSOR.store(ignore, Ordering::Release);
    let _ = win.set_ignore_cursor_events(ignore);
}

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
    *FOLLOW_SYSTEM_TEXT_SCALE
        .get_or_init(|| Arc::new(Mutex::new(true)))
        .lock()
        .unwrap()
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

#[cfg(windows)]
fn get_hdc_dpi_scale(device: Option<&[u16]>) -> Option<f64> {
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Gdi::{CreateDCW, DeleteDC, GetDeviceCaps, LOGPIXELSX};
    let hdc = unsafe {
        match device {
            Some(sz) => CreateDCW(
                PCWSTR::from_raw(sz.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                None,
            ),
            None => CreateDCW(windows::core::w!("DISPLAY"), None, None, None),
        }
    };
    if hdc.is_invalid() {
        return None;
    }
    let dpi = unsafe { GetDeviceCaps(hdc, LOGPIXELSX) } as f64;
    let _ = unsafe { DeleteDC(hdc) };
    if dpi > 0.0 {
        Some(dpi / 96.0)
    } else {
        None
    }
}

#[cfg(windows)]
fn resolve_monitor_scale(
    w: &WebviewWindow,
    rc_mon: windows::Win32::Foundation::RECT,
    device: &[u16],
) -> f64 {
    if let Ok(monitors) = w.available_monitors() {
        let mon_w = rc_mon.right - rc_mon.left;
        let mon_h = rc_mon.bottom - rc_mon.top;
        for m in monitors {
            let pos = m.position();
            let size = m.size();
            if pos.x == rc_mon.left
                && pos.y == rc_mon.top
                && size.width as i32 == mon_w
                && size.height as i32 == mon_h
            {
                return m.scale_factor();
            }
        }
    }
    get_hdc_dpi_scale(Some(device)).unwrap_or_else(|| w.scale_factor().unwrap_or(1.0))
}

pub fn get_bottom_right_position(_mode: &str) -> (f64, f64) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromPoint, MONITORINFOEXW, MONITOR_DEFAULTTOPRIMARY,
        };
        let pt = POINT { x: 0, y: 0 };
        let monitor = unsafe { MonitorFromPoint(pt, MONITOR_DEFAULTTOPRIMARY) };
        let mut mi = MONITORINFOEXW::default();
        mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if unsafe { GetMonitorInfoW(monitor, &mut mi.monitorInfo as *mut _ as *mut _).as_bool() } {
            let sf = get_hdc_dpi_scale(Some(&mi.szDevice)).unwrap_or(1.0);
            let rc = mi.monitorInfo.rcWork;
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
        use windows::Win32::Foundation::{HWND, POINT};
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromPoint, MonitorFromWindow, MONITORINFOEXW,
            MONITOR_DEFAULTTONEAREST, MONITOR_DEFAULTTOPRIMARY,
        };
        let monitor = if let Ok(hwnd) = w.hwnd() {
            unsafe { MonitorFromWindow(HWND(hwnd.0), MONITOR_DEFAULTTONEAREST) }
        } else {
            unsafe { MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY) }
        };
        let mut mi = MONITORINFOEXW::default();
        mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if unsafe { GetMonitorInfoW(monitor, &mut mi.monitorInfo as *mut _ as *mut _).as_bool() } {
            let sf = resolve_monitor_scale(w, mi.monitorInfo.rcMonitor, &mi.szDevice);
            let rc = mi.monitorInfo.rcWork;
            let text_scale = get_effective_miniplayer_scale();
            let phys_w = (440.0 * text_scale * sf).round() as i32;
            let phys_h = (340.0 * text_scale * sf).round() as i32;
            let phys_margin = (16.0 * sf).round() as i32;
            let x = rc.right - phys_w - phys_margin;
            let y = rc.bottom - phys_h - phys_margin;
            if let Ok(curr_size) = w.outer_size() {
                if curr_size.width as i32 != phys_w || curr_size.height as i32 != phys_h {
                    let _ = w.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                        width: phys_w.max(1) as u32,
                        height: phys_h.max(1) as u32,
                    }));
                }
            }
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
    pub is_anchored_right: bool,
}

fn is_point_in_rounded_rect(
    px: f64,
    py: f64,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    radius: f64,
) -> bool {
    let right = left + width;
    let bottom = top + height;
    if px < left || px > right || py < top || py > bottom {
        return false;
    }

    let r = radius.min(width * 0.5).min(height * 0.5);
    if r <= 0.0 {
        return true;
    }

    let inner_left = left + r;
    let inner_right = right - r;
    let inner_top = top + r;
    let inner_bottom = bottom - r;

    let dx = if px < inner_left {
        inner_left - px
    } else if px > inner_right {
        px - inner_right
    } else {
        0.0
    };

    let dy = if py < inner_top {
        inner_top - py
    } else if py > inner_bottom {
        py - inner_bottom
    } else {
        0.0
    };

    (dx * dx + dy * dy) <= (r * r)
}

fn compute_cursor_hover_state(
    mode: &str,
    rel_x: f64,
    rel_y: f64,
    win_w_logical: f64,
    win_h_logical: f64,
    in_bounds: bool,
    is_right_half: bool,
    was_in_window: bool,
) -> MiniplayerCursorHoverPayload {
    let shell_w = (if mode == "card" { 380.0_f64 } else { 440.0_f64 }).min(win_w_logical);
    let collapsed_h = (if mode == "card" { 298.0_f64 } else { 88.0_f64 }).min(win_h_logical);
    let expanded_h = (if mode == "card" { 340.0_f64 } else { 130.0_f64 }).min(win_h_logical);
    let corner_radius: f64 = if mode == "card" { 20.0 } else { 24.0 };

    let active_h = if was_in_window {
        expanded_h
    } else {
        collapsed_h
    };
    let shell_left = if is_right_half {
        (win_w_logical - shell_w).max(0.0)
    } else {
        0.0
    };
    let shell_top = (win_h_logical - active_h).max(0.0);

    let in_window = in_bounds
        && is_point_in_rounded_rect(
            rel_x,
            rel_y,
            shell_left,
            shell_top,
            shell_w,
            active_h,
            corner_radius,
        );

    let expanded_top_y = (win_h_logical - expanded_h).max(0.0);
    let toolbar_height = 52.0;
    let bottom_progress_height = 22.0;
    let in_top_toolbar =
        in_window && rel_y >= expanded_top_y && rel_y < expanded_top_y + toolbar_height;
    let in_bottom_progress =
        in_window && rel_y >= (win_h_logical - bottom_progress_height) && rel_y <= win_h_logical;

    MiniplayerCursorHoverPayload {
        in_window,
        in_toolbar: in_top_toolbar || in_bottom_progress,
        is_anchored_right: is_right_half,
    }
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
        let mut was_dragging = false;
        let mut last_state = MiniplayerCursorHoverPayload {
            in_window: false,
            in_toolbar: false,
            is_anchored_right: true,
        };
        let mut check_counter = 0u64;
        let mut last_emitted_scale = (crate::get_system_text_scale() * 100.0).round() as u32;

        loop {
            std::thread::sleep(std::time::Duration::from_millis(20));
            check_counter = check_counter.wrapping_add(1);

            // Periksa perubahan skala teks Windows secara dinamis tanpa restart
            if check_counter % 22 == 0 {
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
            let win_opt = app_handle.get_webview_window("miniplayer");
            let is_visible = win_opt
                .as_ref()
                .and_then(|w| w.is_visible().ok())
                .unwrap_or(false);

            if !is_open || !is_visible {
                was_dragging = false;
                MINIPLAYER_ALLOW_INTERACTIVE.store(false, Ordering::Release);
                if last_state.in_window || last_state.in_toolbar {
                    last_state = MiniplayerCursorHoverPayload {
                        in_window: false,
                        in_toolbar: false,
                        is_anchored_right: last_state.is_anchored_right,
                    };
                    let _ = app_handle.emit("miniplayer:cursor-hover", last_state);
                }
                if let Some(w) = win_opt {
                    if !MINIPLAYER_IGNORE_CURSOR.load(Ordering::Acquire) {
                        apply_ignore_cursor(&w, true);
                    }
                }
                continue;
            }

            let win = win_opt.unwrap();

            #[cfg(windows)]
            {
                use windows::Win32::Foundation::POINT;
                use windows::Win32::UI::Input::KeyboardAndMouse::{
                    GetAsyncKeyState, VK_CONTROL, VK_LBUTTON,
                };
                use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

                let mut pt = POINT { x: 0, y: 0 };
                if unsafe { GetCursorPos(&mut pt).is_ok() } {
                    let l_down =
                        (unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } as u16 & 0x8000) != 0;
                    let ctrl_down =
                        (unsafe { GetAsyncKeyState(VK_CONTROL.0 as i32) } as u16 & 0x8000) != 0;

                    if let (Ok(win_pos), Ok(win_size)) = (win.outer_position(), win.outer_size()) {
                        let scale_factor = win.scale_factor().unwrap_or(1.0);
                        let in_x_raw =
                            pt.x >= win_pos.x && pt.x < win_pos.x + win_size.width as i32;
                        let in_y_full =
                            pt.y >= win_pos.y && pt.y < win_pos.y + win_size.height as i32;

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
                            use windows::Win32::Foundation::HWND;
                            use windows::Win32::Graphics::Gdi::{
                                GetMonitorInfoW, MonitorFromPoint, MonitorFromWindow, MONITORINFO,
                                MONITOR_DEFAULTTONEAREST,
                            };
                            let mon = if let Ok(hwnd) = win.hwnd() {
                                unsafe { MonitorFromWindow(HWND(hwnd.0), MONITOR_DEFAULTTONEAREST) }
                            } else {
                                let center_pt = POINT {
                                    x: win_pos.x + (win_size.width as i32) / 2,
                                    y: win_pos.y + (win_size.height as i32) / 2,
                                };
                                unsafe { MonitorFromPoint(center_pt, MONITOR_DEFAULTTONEAREST) }
                            };
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

                        let current_mode = get_mode().lock().unwrap().clone();
                        let mut current_state = compute_cursor_hover_state(
                            &current_mode,
                            rel_x,
                            rel_y,
                            win_w_logical,
                            win_h_logical,
                            in_x_raw && in_y_full,
                            is_right_half,
                            last_state.in_window,
                        );

                        let was_ignored = MINIPLAYER_IGNORE_CURSOR.load(Ordering::Acquire);

                        if l_down
                            && (was_dragging
                                || (current_state.in_toolbar && !was_ignored && !ctrl_down))
                        {
                            was_dragging = true;
                            current_state.in_window = true;
                            current_state.in_toolbar = true;
                        } else {
                            was_dragging = false;
                        }

                        MINIPLAYER_ALLOW_INTERACTIVE.store(
                            current_state.in_window && current_state.in_toolbar,
                            Ordering::Release,
                        );

                        if current_state != last_state {
                            last_state = current_state;
                            let _ = app_handle.emit("miniplayer:cursor-hover", current_state);
                        }

                        if was_dragging {
                            // Keep drag active without altering click-through
                            continue;
                        }

                        let should_ignore_cursor =
                            !current_state.in_window || !current_state.in_toolbar || ctrl_down;
                        if should_ignore_cursor {
                            if !was_ignored {
                                apply_ignore_cursor(&win, true);
                            }
                        } else if was_ignored {
                            apply_ignore_cursor(&win, false);
                            nudge_cursor();
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
                let gen = MINIPLAYER_VIS_GEN.fetch_add(1, Ordering::SeqCst) + 1;
                // Emit request-close agar frontend bisa memainkan animasi exit yang smooth
                let _ = app.emit("miniplayer:request-close", ());

                // Fallback: jika frontend tidak menyelesaikan penutupan dalam 350ms, sembunyikan secara aman
                let w_clone = w.clone();
                let app_clone = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(350));
                    if MINIPLAYER_VIS_GEN.load(Ordering::SeqCst) != gen {
                        return;
                    }
                    let mut guard = get_open_state().lock().unwrap();
                    if MINIPLAYER_VIS_GEN.load(Ordering::SeqCst) != gen {
                        return;
                    }
                    if let Ok(is_v) = w_clone.is_visible() {
                        if is_v {
                            MINIPLAYER_ALLOW_INTERACTIVE.store(false, Ordering::Release);
                            apply_ignore_cursor(&w_clone, true);
                            let _ = w_clone.hide();
                            set_window_to_bottom_right(&w_clone);
                            *get_returned_to_notch_state().lock().unwrap() = true;
                            *guard = false;
                            drop(guard);
                            let _ = app_clone.emit("miniplayer:visibility-changed", false);
                        }
                    }
                });
                return Ok(false);
            }
        }
        MINIPLAYER_VIS_GEN.fetch_add(1, Ordering::SeqCst);
        *get_returned_to_notch_state().lock().unwrap() = false;
        set_window_to_bottom_right(&w);
        let _ = w.show();
        #[cfg(windows)]
        apply_no_activate_style(&w);
        MINIPLAYER_ALLOW_INTERACTIVE.store(false, Ordering::Release);
        apply_ignore_cursor(&w, true);
        *is_open = true;
        let _ = app.emit("miniplayer:visibility-changed", true);
        return Ok(true);
    }

    MINIPLAYER_VIS_GEN.fetch_add(1, Ordering::SeqCst);

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
                MINIPLAYER_ALLOW_INTERACTIVE.store(false, Ordering::Release);
                apply_ignore_cursor(&w, true);
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
    MINIPLAYER_VIS_GEN.fetch_add(1, Ordering::SeqCst);
    let open_arc = get_open_state();
    let mut is_open = open_arc.lock().unwrap();
    *get_returned_to_notch_state().lock().unwrap() = true;
    if let Some(w) = app.get_webview_window("miniplayer") {
        MINIPLAYER_ALLOW_INTERACTIVE.store(false, Ordering::Release);
        apply_ignore_cursor(&w, true);
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
                    MINIPLAYER_VIS_GEN.fetch_add(1, Ordering::SeqCst);
                    *was_open_fs = true;
                    *is_open = false;
                    let _ = w.hide();
                    let _ = app.emit("miniplayer:visibility-changed", false);
                }
            } else if *was_open_fs {
                MINIPLAYER_VIS_GEN.fetch_add(1, Ordering::SeqCst);
                *was_open_fs = false;
                *is_open = true;
                let _ = w.show();
                apply_no_activate_style(&w);
                let _ = app.emit("miniplayer:visibility-changed", true);
            }
        }
    }
}

fn compute_min_top(work_top: i32, window_h: i32) -> i32 {
    let is_bar = get_mode().lock().map(|m| *m == "bar").unwrap_or(false);
    let top_empty_offset = if is_bar { (window_h * 210) / 340 } else { 0 };
    work_top - top_empty_offset
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
    let min_top = compute_min_top(work_top, h);
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

        let pt = POINT {
            x: x + width / 2,
            y: y + height / 2,
        };
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
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFOEXW, MONITOR_DEFAULTTONEAREST,
        };
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
        use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};

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
                    let monitor = unsafe { MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST) };
                    let mut mi = MONITORINFOEXW::default();
                    mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
                    let has_monitor = unsafe {
                        GetMonitorInfoW(monitor, &mut mi.monitorInfo as *mut _ as *mut _).as_bool()
                    };

                    let text_scale = get_effective_miniplayer_scale();
                    let sf = if has_monitor {
                        resolve_monitor_scale(&w, mi.monitorInfo.rcMonitor, &mi.szDevice)
                    } else {
                        w.scale_factor().unwrap_or(1.0)
                    };
                    let target_phys_w = (width * text_scale * sf).round() as i32;
                    let target_phys_h = (height * text_scale * sf).round() as i32;

                    if curr_size.width as i32 == target_phys_w
                        && curr_size.height as i32 == target_phys_h
                    {
                        return Ok(());
                    }

                    let mut new_x = curr_pos.x;
                    let mut new_y = curr_pos.y;

                    if has_monitor {
                        let rc = mi.monitorInfo.rcWork;
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

                        let min_top = compute_min_top(rc.top, target_phys_h);
                        new_x = new_x.clamp(rc.left, (rc.right - target_phys_w).max(rc.left));
                        new_y = new_y.clamp(min_top, (rc.bottom - target_phys_h).max(min_top));
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
        if !ignore && !MINIPLAYER_ALLOW_INTERACTIVE.load(Ordering::Acquire) {
            return Ok(());
        }
        apply_ignore_cursor(&w, ignore);
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
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        };
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

        let mut cursor_pt = POINT { x: 0, y: 0 };
        let has_cursor = unsafe { GetCursorPos(&mut cursor_pt).is_ok() };

        let (win_x, win_y, win_w, _win_h, sf) =
            if let Some(w) = app.get_webview_window("miniplayer") {
                let sf = w.scale_factor().unwrap_or(1.0);
                let pos = w
                    .outer_position()
                    .unwrap_or(tauri::PhysicalPosition { x, y });
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
            POINT {
                x: win_x + win_w / 2,
                y: win_y.max(0),
            }
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
            let visible_top_offset = if is_bar {
                (210.0 * text_scale * sf).round() as i32
            } else {
                0
            };
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
            let is_in_zone = (dx_win_log <= 220.0 * text_scale && dy_win_log <= 130.0 * text_scale)
                || (dx_cur_log <= 220.0 && dy_cur_log <= 115.0);
            // Near zone: radius around target notch zone
            let is_near = is_in_zone
                || (dx_win_log <= 300.0 * text_scale && dy_win_log <= 190.0 * text_scale)
                || (dx_cur_log <= 300.0 && dy_cur_log <= 175.0);

            return NotchProximity {
                is_near,
                is_in_zone,
            };
        }
    }

    NotchProximity {
        is_near: false,
        is_in_zone: false,
    }
}

#[tauri::command]
pub fn set_follow_system_text_scale(app: AppHandle, follow: bool) -> Result<(), String> {
    *FOLLOW_SYSTEM_TEXT_SCALE
        .get_or_init(|| Arc::new(Mutex::new(true)))
        .lock()
        .unwrap() = follow;
    let _ = resize_miniplayer_internal(&app, 440.0, 340.0, false);
    let raw_scale = if follow {
        crate::get_system_text_scale()
    } else {
        1.0
    };
    let _ = app.emit("system:text-scale-changed", raw_scale);
    Ok(())
}
