use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::{Mutex, Once, OnceLock};
use std::time::Instant;
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, IntersectRect, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_CONTROL, VK_ESCAPE,
    VK_LWIN, VK_SHIFT,
};
use windows::Win32::UI::Shell::{SHAppBarMessage, ABM_REMOVE, APPBARDATA};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetCursorPos, GetForegroundWindow, GetWindowLongW, GetWindowRect,
    GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow,
    SetWindowLongW, ShowWindow, GWL_EXSTYLE, GWL_STYLE, SW_MINIMIZE, SW_RESTORE, SW_SHOWNOACTIVATE,
    WS_CAPTION, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_THICKFRAME,
};

static NAVBAR_ENABLED: AtomicBool = AtomicBool::new(false);
static APPBAR_REGISTERED: AtomicBool = AtomicBool::new(false);
static NAVBAR_WATCHER_STARTED: Once = Once::new();
static NAVBAR_CREATING: AtomicBool = AtomicBool::new(false);
static LAST_EXTERNAL_FG_HWND: AtomicIsize = AtomicIsize::new(0);

#[link(name = "dwmapi")]
extern "system" {
    fn DwmGetWindowAttribute(
        hwnd: windows::Win32::Foundation::HWND,
        dw_attribute: u32,
        pv_attribute: *mut core::ffi::c_void,
        cb_attribute: u32,
    ) -> windows::core::HRESULT;
}

const DWMWA_CLOAKED: u32 = 14;

pub fn is_window_cloaked(hwnd: HWND) -> bool {
    if hwnd.0.is_null() {
        return false;
    }
    let mut cloaked: u32 = 0;
    unsafe {
        let hr = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut _ as *mut _,
            std::mem::size_of::<u32>() as u32,
        );
        hr.is_ok() && cloaked != 0
    }
}

#[derive(Clone, Debug)]
pub struct NavbarHitGeometry {
    pub dock_width: f64,
    pub dock_height: f64,
    pub position: String,
    pub distance_from_edge: f64,
    pub is_anchored: bool,
    pub auto_hide: bool,
    pub is_dock_hidden: bool,
    pub popup_open: bool,
    pub mon_rect: (i32, i32, i32, i32),
}

impl Default for NavbarHitGeometry {
    fn default() -> Self {
        Self {
            dock_width: 480.0,
            dock_height: 52.0,
            position: "bottom".to_string(),
            distance_from_edge: 14.0,
            is_anchored: false,
            auto_hide: false,
            is_dock_hidden: false,
            popup_open: false,
            mon_rect: (0, 0, 0, 0),
        }
    }
}

static NAVBAR_HIT_GEOM: OnceLock<Mutex<NavbarHitGeometry>> = OnceLock::new();

fn hit_geom() -> &'static Mutex<NavbarHitGeometry> {
    NAVBAR_HIT_GEOM.get_or_init(|| Mutex::new(NavbarHitGeometry::default()))
}

/// Deregisters any registered AppBar so the navbar purely overlays on top of windows ("menimpa saja").
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

fn apply_navbar_exstyle(hwnd: HWND, allow_activate: bool) {
    unsafe {
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        let mut new_ex = ex | WS_EX_TOOLWINDOW.0;
        if allow_activate {
            new_ex &= !WS_EX_NOACTIVATE.0;
        } else {
            new_ex |= WS_EX_NOACTIVATE.0;
        }
        if new_ex != ex {
            let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex as i32);
        }
    }
}

fn is_window_click_through(win: &tauri::WebviewWindow) -> Option<bool> {
    if let Ok(raw_hwnd) = win.hwnd() {
        let ex = unsafe { GetWindowLongW(HWND(raw_hwnd.0), GWL_EXSTYLE) as u32 };
        Some((ex & WS_EX_TRANSPARENT.0) != 0)
    } else {
        None
    }
}

fn is_external_user_window(hwnd: HWND) -> bool {
    if hwnd.0.is_null() {
        return false;
    }
    unsafe {
        if !IsWindowVisible(hwnd).as_bool() {
            return false;
        }
        if is_window_cloaked(hwnd) {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 || pid == std::process::id() {
            return false;
        }
        let mut class_buf = [0u16; 64];
        let class_len = GetClassNameW(hwnd, &mut class_buf);
        if class_len > 0 {
            let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);
            if matches!(
                class_name.as_str(),
                "Progman"
                    | "WorkerW"
                    | "Shell_TrayWnd"
                    | "Shell_SecondaryTrayWnd"
                    | "Windows.UI.Core.CoreWindow"
                    | "XamlExplorerHostIslandWindow"
            ) {
                return false;
            }
        }
        true
    }
}

/// Checks if the current foreground window is a true fullscreen application (game, video player, F11 browser)
/// on the same monitor as the navbar window.
fn is_fullscreen_app_covering_navbar(navbar_win: &tauri::WebviewWindow) -> bool {
    let nav_hwnd = match navbar_win.hwnd() {
        Ok(h) => HWND(h.0),
        Err(_) => return false,
    };

    unsafe {
        let fg = GetForegroundWindow();
        if fg.0.is_null() || fg == nav_hwnd {
            return false;
        }
        if !is_external_user_window(fg) {
            return false;
        }

        let nav_mon = MonitorFromWindow(nav_hwnd, MONITOR_DEFAULTTONEAREST);
        let fg_mon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
        if nav_mon != fg_mon {
            return false;
        }

        let mut win_rect = RECT::default();
        if GetWindowRect(fg, &mut win_rect).is_err() {
            return false;
        }

        let mut mon_info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(fg_mon, &mut mon_info).as_bool() {
            return false;
        }

        let mon = mon_info.rcMonitor;
        let style = GetWindowLongW(fg, GWL_STYLE) as u32;
        let has_frame = (style & (WS_CAPTION.0 | WS_THICKFRAME.0)) != 0;

        let covers_full_monitor = win_rect.left <= mon.left + 2
            && win_rect.top <= mon.top + 2
            && win_rect.right >= mon.right - 2
            && win_rect.bottom >= mon.bottom - 2;

        covers_full_monitor && !has_frame
    }
}

/// Checks whether any non-minimized external user window on the same monitor is maximized
/// or overlaps the navbar dock rect (Intellihide condition).
fn is_any_window_covering_dock(
    nav_hwnd: HWND,
    nav_mon: windows::Win32::Graphics::Gdi::HMONITOR,
) -> bool {
    // 1. Fast path: check current active foreground window
    unsafe {
        let fg = GetForegroundWindow();
        if !fg.0.is_null() && fg != nav_hwnd && is_external_user_window(fg) {
            let fg_mon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
            if fg_mon == nav_mon && !IsIconic(fg).as_bool() {
                let style = GetWindowLongW(fg, GWL_STYLE) as u32;
                if (style & 0x01000000) != 0 {
                    return true;
                }
                let mut fg_rect = RECT::default();
                let mut nav_rect = RECT::default();
                if GetWindowRect(fg, &mut fg_rect).is_ok()
                    && GetWindowRect(nav_hwnd, &mut nav_rect).is_ok()
                {
                    let mut inter = RECT::default();
                    if IntersectRect(&mut inter, &fg_rect, &nav_rect).as_bool() {
                        if (inter.right - inter.left) > 10 && (inter.bottom - inter.top) > 10 {
                            return true;
                        }
                    }
                }
            }
        }
    }

    // 2. Enumerate visible top-level windows on nav_mon
    struct CheckCtx {
        nav_hwnd: HWND,
        nav_mon: windows::Win32::Graphics::Gdi::HMONITOR,
        is_covered: bool,
    }

    unsafe extern "system" fn check_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut CheckCtx);
        if hwnd == ctx.nav_hwnd {
            return BOOL(1);
        }
        if !is_external_user_window(hwnd) {
            return BOOL(1);
        }
        if IsIconic(hwnd).as_bool() {
            return BOOL(1);
        }
        let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        if mon != ctx.nav_mon {
            return BOOL(1);
        }
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        if (style & 0x01000000) != 0 {
            ctx.is_covered = true;
            return BOOL(0);
        }
        let mut w_rect = RECT::default();
        let mut nav_rect = RECT::default();
        if GetWindowRect(hwnd, &mut w_rect).is_ok()
            && GetWindowRect(ctx.nav_hwnd, &mut nav_rect).is_ok()
        {
            let mut inter = RECT::default();
            if IntersectRect(&mut inter, &w_rect, &nav_rect).as_bool() {
                if (inter.right - inter.left) > 10 && (inter.bottom - inter.top) > 10 {
                    ctx.is_covered = true;
                    return BOOL(0);
                }
            }
        }
        BOOL(1)
    }

    let mut ctx = CheckCtx {
        nav_hwnd,
        nav_mon,
        is_covered: false,
    };
    unsafe {
        let _ = EnumWindows(Some(check_proc), LPARAM(&mut ctx as *mut CheckCtx as isize));
    }
    ctx.is_covered
}

fn calculate_navbar_hit(
    pt: POINT,
    win_pos: tauri::PhysicalPosition<i32>,
    win_size: tauri::PhysicalSize<u32>,
    sf: f64,
    geom: &NavbarHitGeometry,
) -> bool {
    let win_left = win_pos.x;
    let win_top = win_pos.y;
    let win_w = win_size.width as i32;
    let win_h = win_size.height as i32;
    let win_right = win_left + win_w;
    let win_bottom = win_top + win_h;

    if pt.x < win_left || pt.x > win_right || pt.y < win_top || pt.y > win_bottom {
        return false;
    }

    // If a hover preview card or module popover is open inside the navbar window,
    // allow interacting with the popup area inside the window until the cursor leaves.
    if geom.popup_open {
        let popup_pad_x = (12.0 * sf).round() as i32;
        let popup_pad_y = (8.0 * sf).round() as i32;
        if pt.x >= win_left + popup_pad_x
            && pt.x <= win_right - popup_pad_x
            && pt.y >= win_top + popup_pad_y
            && pt.y <= win_bottom
        {
            return true;
        }
    }

    let dock_phys_w = (geom.dock_width * sf).round() as i32;
    let dock_phys_h = (geom.dock_height * sf).round() as i32;
    let edge_offset = if geom.is_anchored {
        0
    } else {
        (geom.distance_from_edge * sf).round() as i32
    };
    let pad = (6.0 * sf).round() as i32;
    let hot_strip = (10.0 * sf).round() as i32;

    match geom.position.as_str() {
        "top" => {
            let pill_left = win_left + (win_w - dock_phys_w) / 2 - pad;
            let pill_right = pill_left + dock_phys_w + pad * 2;
            let pill_top = if geom.auto_hide {
                win_top
            } else {
                win_top + (edge_offset - pad).max(0)
            };
            let pill_bottom = if geom.auto_hide && geom.is_dock_hidden {
                win_top + hot_strip
            } else {
                win_top + edge_offset + dock_phys_h + pad
            };
            pt.x >= pill_left && pt.x <= pill_right && pt.y >= pill_top && pt.y <= pill_bottom
        }
        "left" => {
            let pill_top = win_top + (win_h - dock_phys_h) / 2 - pad;
            let pill_bottom = pill_top + dock_phys_h + pad * 2;
            let pill_left = if geom.auto_hide {
                win_left
            } else {
                win_left + (edge_offset - pad).max(0)
            };
            let pill_right = if geom.auto_hide && geom.is_dock_hidden {
                win_left + hot_strip
            } else {
                win_left + edge_offset + dock_phys_w + pad
            };
            pt.x >= pill_left && pt.x <= pill_right && pt.y >= pill_top && pt.y <= pill_bottom
        }
        "right" => {
            let pill_top = win_top + (win_h - dock_phys_h) / 2 - pad;
            let pill_bottom = pill_top + dock_phys_h + pad * 2;
            let pill_right = if geom.auto_hide {
                win_right
            } else {
                win_right - (edge_offset - pad).max(0)
            };
            let pill_left = if geom.auto_hide && geom.is_dock_hidden {
                win_right - hot_strip
            } else {
                win_right - edge_offset - dock_phys_w - pad
            };
            pt.x >= pill_left && pt.x <= pill_right && pt.y >= pill_top && pt.y <= pill_bottom
        }
        _ => {
            // bottom (default)
            let pill_left = win_left + (win_w - dock_phys_w) / 2 - pad;
            let pill_right = pill_left + dock_phys_w + pad * 2;
            let pill_bottom = if geom.auto_hide {
                win_bottom
            } else {
                win_bottom - (edge_offset - pad).max(0)
            };
            let pill_top = if geom.auto_hide && geom.is_dock_hidden {
                win_bottom - hot_strip
            } else {
                win_bottom - edge_offset - dock_phys_h - pad
            };
            pt.x >= pill_left && pt.x <= pill_right && pt.y >= pill_top && pt.y <= pill_bottom
        }
    }
}

fn start_navbar_cursor_watcher(app: tauri::AppHandle) {
    crate::shell_surface_toggle::ensure_watcher();
    NAVBAR_WATCHER_STARTED.call_once(|| {
        std::thread::spawn(move || {
            let mut was_in_dock = false;
            let mut was_fullscreen = false;
            let mut was_window_covered = false;
            let mut tick: u32 = 0;

            loop {
                std::thread::sleep(std::time::Duration::from_millis(20));
                tick = tick.wrapping_add(1);

                // Track the last external active foreground window so clicking navbar icons
                // can accurately detect whether the target app was already active (to minimize it).
                unsafe {
                    let fg = GetForegroundWindow();
                    if is_external_user_window(fg) {
                        LAST_EXTERNAL_FG_HWND.store(fg.0 as isize, Ordering::Relaxed);
                    }
                }

                let Some(win) = app.get_webview_window("navbar") else {
                    continue;
                };
                if !win.is_visible().unwrap_or(false) {
                    continue;
                }

                if tick.is_multiple_of(20) {
                    let is_fs = is_fullscreen_app_covering_navbar(&win);
                    if is_fs != was_fullscreen {
                        was_fullscreen = is_fs;
                        let _ = win.emit("navbar-fullscreen-state", is_fs);
                        if is_fs {
                            let _ = win.set_ignore_cursor_events(true);
                            was_in_dock = false;
                            continue;
                        }
                    }
                }

                if was_fullscreen {
                    continue;
                }

                if tick.is_multiple_of(8) {
                    #[cfg(windows)]
                    if let Ok(raw_hwnd) = win.hwnd() {
                        let nav_hwnd = HWND(raw_hwnd.0);
                        let nav_mon = unsafe { MonitorFromWindow(nav_hwnd, MONITOR_DEFAULTTONEAREST) };
                        let is_covered = is_any_window_covering_dock(nav_hwnd, nav_mon);
                        if is_covered != was_window_covered {
                            was_window_covered = is_covered;
                            let _ = win.emit("navbar-window-overlap-state", is_covered);
                        }
                    }
                }

                let mut pt = POINT { x: 0, y: 0 };
                if unsafe { GetCursorPos(&mut pt) }.is_err() {
                    continue;
                }

                let (Ok(win_pos), Ok(win_size), Ok(sf)) =
                    (win.outer_position(), win.outer_size(), win.scale_factor())
                else {
                    continue;
                };

                let geom = hit_geom()
                    .lock()
                    .map(|g| g.clone())
                    .unwrap_or_default();

                let in_dock = calculate_navbar_hit(pt, win_pos, win_size, sf, &geom);

                if in_dock != was_in_dock {
                    was_in_dock = in_dock;
                    let _ = win.set_ignore_cursor_events(!in_dock);
                    let _ = win.emit("navbar-cursor-hit", in_dock);
                } else if is_window_click_through(&win) == Some(in_dock) {
                    let _ = win.set_ignore_cursor_events(!in_dock);
                }
            }
        });
    });
}

pub fn show_or_create_navbar_window(app: &tauri::AppHandle) {
    NAVBAR_ENABLED.store(true, Ordering::SeqCst);
    start_navbar_cursor_watcher(app.clone());

    if let Some(w) = app.get_webview_window("navbar") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_always_on_top(true);
        let _ = w.emit("navbar-request-sync-bounds", ());
        #[cfg(windows)]
        if let Ok(raw_hwnd) = w.hwnd() {
            let hwnd = HWND(raw_hwnd.0);
            remove_appbar_if_registered(hwnd);
            apply_navbar_exstyle(hwnd, false);
            unsafe {
                let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            }
        }
        return;
    }

    // Prevent concurrent creation of duplicate navbar windows
    if NAVBAR_CREATING.swap(true, Ordering::SeqCst) {
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
        .inner_size(1440.0, 260.0)
        .position(-10000.0, -10000.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .initialization_script("window.__IS_NAVBAR_WINDOW__ = true;")
        .additional_browser_args("--autoplay-policy=no-user-gesture-required --enable-gpu-rasterization --disable-features=CalculateNativeWinOcclusion")
        .build()
        {
            Ok(win) => {
                let _ = win.set_ignore_cursor_events(true);
                #[cfg(windows)]
                if let Ok(raw_hwnd) = win.hwnd() {
                    let hwnd = HWND(raw_hwnd.0);
                    remove_appbar_if_registered(hwnd);
                    apply_navbar_exstyle(hwnd, false);
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
        NAVBAR_CREATING.store(false, Ordering::SeqCst);
    });
}

pub fn hide_navbar_window(app: &tauri::AppHandle) {
    NAVBAR_ENABLED.store(false, Ordering::SeqCst);
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
pub fn set_navbar_ignore_cursor_events(app: tauri::AppHandle, ignore: bool) {
    if let Some(w) = app.get_webview_window("navbar") {
        let _ = w.set_ignore_cursor_events(ignore);
    }
}

#[tauri::command]
pub fn set_navbar_popup_open(open: bool) {
    if let Ok(mut g) = hit_geom().lock() {
        g.popup_open = open;
    }
}

#[tauri::command]
pub fn set_navbar_auto_hide_state(auto_hide: bool, is_hidden: bool) {
    if let Ok(mut g) = hit_geom().lock() {
        g.auto_hide = auto_hide;
        g.is_dock_hidden = is_hidden;
    }
}

#[tauri::command]
pub fn set_navbar_focusable(app: tauri::AppHandle, focusable: bool) {
    if let Some(w) = app.get_webview_window("navbar") {
        #[cfg(windows)]
        if let Ok(raw_hwnd) = w.hwnd() {
            let hwnd = HWND(raw_hwnd.0);
            apply_navbar_exstyle(hwnd, focusable);
            if focusable {
                let _ = w.set_focus();
            }
        }
    }
}

#[tauri::command]
pub fn broadcast_navbar_config_update(app: tauri::AppHandle, config: serde_json::Value) {
    let _ = app.emit("navbar_config_updated", &config);
    let _ = app.emit("gili-navbar-config-sync", &config);
}

fn resolve_target_monitor(
    win: &tauri::WebviewWindow,
    monitor_id: Option<&str>,
) -> Option<tauri::Monitor> {
    if let Some(target_id) = monitor_id {
        if !target_id.is_empty() && target_id != "primary" {
            if let Ok(monitors) = win.available_monitors() {
                for (idx, m) in monitors.iter().enumerate() {
                    let name = m.name().map(|s| s.as_str()).unwrap_or("");
                    if name == target_id
                        || format!("monitor-{}", idx) == target_id
                        || format!("DISPLAY{}", idx + 1) == target_id
                        || name.ends_with(target_id)
                    {
                        return Some(m.clone());
                    }
                }
            }
        }
    }
    win.primary_monitor()
        .ok()
        .flatten()
        .or_else(|| win.current_monitor().ok().flatten())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn sync_navbar_bounds(
    app: tauri::AppHandle,
    width: f64,
    height: f64,
    position: String,
    distance_from_edge: f64,
    is_anchored: Option<bool>,
    overhead: Option<f64>,
    extra_width: Option<f64>,
    monitor_id: Option<String>,
) {
    if !NAVBAR_ENABLED.load(Ordering::SeqCst) {
        return;
    }
    if let Some(win) = app.get_webview_window("navbar") {
        if let Some(monitor) = resolve_target_monitor(&win, monitor_id.as_deref()) {
            let scale_factor = monitor.scale_factor();
            let mon_pos = monitor.position();
            let mon_size = monitor.size();

            let mon_x = mon_pos.x as f64 / scale_factor;
            let mon_y = mon_pos.y as f64 / scale_factor;
            let mon_width = mon_size.width as f64 / scale_factor;
            let mon_height = mon_size.height as f64 / scale_factor;

            let overhead_space = overhead.unwrap_or(380.0);
            let extra_span = extra_width.unwrap_or(420.0);
            let is_anchored_bool = is_anchored.unwrap_or(distance_from_edge == 0.0);

            let is_vertical = position == "left" || position == "right";

            // Update hit-testing geometry before resizing
            if let Ok(mut g) = hit_geom().lock() {
                g.dock_width = width;
                g.dock_height = height;
                g.position = position.clone();
                g.distance_from_edge = distance_from_edge;
                g.is_anchored = is_anchored_bool;
                g.mon_rect = (
                    mon_pos.x,
                    mon_pos.y,
                    mon_pos.x + mon_size.width as i32,
                    mon_pos.y + mon_size.height as i32,
                );
            }

            let edge_reserve = 32.0f64;

            let (window_w, window_h, target_x, target_y) = if is_vertical {
                let dock_w = width.clamp(40.0, 120.0);
                let safe_h = height.clamp(120.0, mon_height);
                let total_w = (dock_w + edge_reserve + overhead_space).clamp(dock_w, mon_width);
                let total_h = (safe_h + extra_span).clamp(safe_h, mon_height);

                let x = if position == "left" {
                    mon_x
                } else {
                    mon_x + mon_width - total_w
                };
                let y = mon_y + (mon_height - total_h) / 2.0;
                (total_w, total_h, x, y)
            } else {
                let safe_w = width.clamp(120.0, mon_width);
                let dock_h = height.clamp(40.0, 110.0);
                let total_w = (safe_w + extra_span).clamp(safe_w, mon_width);
                let total_h = (dock_h + edge_reserve + overhead_space).clamp(dock_h, mon_height);

                let x = mon_x + (mon_width - total_w) / 2.0;
                let y = if position == "top" {
                    mon_y
                } else {
                    mon_y + (mon_height - total_h).max(0.0)
                };
                (total_w, total_h, x, y)
            };

            let _ = win.set_size(LogicalSize::new(window_w.round(), window_h.round()));
            let _ = win.set_position(LogicalPosition::new(target_x.round(), target_y.round()));
            let _ = win.set_always_on_top(true);
            let _ = win.show();

            #[cfg(windows)]
            if let Ok(raw_hwnd) = win.hwnd() {
                let hwnd = HWND(raw_hwnd.0);
                unsafe {
                    use windows::Win32::UI::WindowsAndMessaging::{
                        SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
                        SWP_SHOWWINDOW,
                    };
                    let _ = SetWindowPos(
                        hwnd,
                        HWND_TOPMOST,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    );
                }
                remove_appbar_if_registered(hwnd);
            }
        }
    }
}

#[tauri::command]
pub fn get_desktop_luminance() -> f32 {
    let geom = match hit_geom().lock() {
        Ok(g) => g.clone(),
        Err(_) => return 0.0,
    };
    unsafe {
        use windows::Win32::Graphics::Gdi::{
            GetDC, GetMonitorInfoW, GetPixel, MonitorFromWindow, ReleaseDC, MONITORINFO,
            MONITOR_DEFAULTTOPRIMARY,
        };
        let hdc = GetDC(None);
        if hdc.is_invalid() {
            return 0.0;
        }

        let (mon_left, mon_top, mon_right, mon_bottom) = if geom.mon_rect.2 > geom.mon_rect.0 {
            geom.mon_rect
        } else {
            let mut mi = MONITORINFO::default();
            mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
            let hmon = MonitorFromWindow(None, MONITOR_DEFAULTTOPRIMARY);
            let _ = GetMonitorInfoW(hmon, &mut mi);
            (mi.rcMonitor.left, mi.rcMonitor.top, mi.rcMonitor.right, mi.rcMonitor.bottom)
        };

        let mon_w = (mon_right - mon_left).max(800);
        let mon_h = (mon_bottom - mon_top).max(600);
        let dock_w = (geom.dock_width as i32).clamp(160, mon_w);
        let dock_h = (geom.dock_height as i32).clamp(36, 120);
        let edge_dist = if geom.is_anchored {
            0
        } else {
            (geom.distance_from_edge as i32).max(0)
        };

        let mut sample_points: Vec<(i32, i32)> = Vec::with_capacity(12);

        match geom.position.as_str() {
            "top" => {
                let cy = mon_top + edge_dist + dock_h / 2;
                let oy = (cy + dock_h / 2 + 10).min(mon_bottom - 4);
                let cx = mon_left + mon_w / 2;
                for step in [-0.4, -0.2, 0.0, 0.2, 0.4] {
                    let sx = cx + (dock_w as f32 * step) as i32;
                    sample_points.push((sx, cy));
                    sample_points.push((sx, oy));
                }
            }
            "bottom" => {
                let cy = mon_bottom - edge_dist - dock_h / 2;
                let oy = (cy - dock_h / 2 - 10).max(mon_top + 4);
                let cx = mon_left + mon_w / 2;
                for step in [-0.4, -0.2, 0.0, 0.2, 0.4] {
                    let sx = cx + (dock_w as f32 * step) as i32;
                    sample_points.push((sx, cy));
                    sample_points.push((sx, oy));
                }
            }
            "left" => {
                let cx = mon_left + edge_dist + dock_w / 2;
                let ox = (cx + dock_w / 2 + 10).min(mon_right - 4);
                let cy = mon_top + mon_h / 2;
                for step in [-0.4, -0.2, 0.0, 0.2, 0.4] {
                    let sy = cy + (dock_h as f32 * step) as i32;
                    sample_points.push((cx, sy));
                    sample_points.push((ox, sy));
                }
            }
            _ => {
                let cx = mon_right - edge_dist - dock_w / 2;
                let ox = (cx - dock_w / 2 - 10).max(mon_left + 4);
                let cy = mon_top + mon_h / 2;
                for step in [-0.4, -0.2, 0.0, 0.2, 0.4] {
                    let sy = cy + (dock_h as f32 * step) as i32;
                    sample_points.push((cx, sy));
                    sample_points.push((ox, sy));
                }
            }
        }

        let mut total_lum = 0.0f32;
        let mut valid_samples = 0;

        for (sx, sy) in sample_points {
            let color_ref = GetPixel(hdc, sx, sy);
            if color_ref.0 != 0xFFFFFFFF {
                let raw = color_ref.0;
                let r = (raw & 0xFF) as f32;
                let g = ((raw >> 8) & 0xFF) as f32;
                let b = ((raw >> 16) & 0xFF) as f32;
                let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
                total_lum += lum;
                valid_samples += 1;
            }
        }
        ReleaseDC(None, hdc);

        if valid_samples > 0 {
            total_lum / (valid_samples as f32)
        } else {
            0.0
        }
    }
}

static THUMBNAIL_CACHE: Mutex<Option<HashMap<isize, (Instant, String)>>> = Mutex::new(None);

fn get_cached_thumbnail(hwnd: isize) -> Option<String> {
    if let Ok(guard) = THUMBNAIL_CACHE.lock() {
        if let Some(map) = guard.as_ref() {
            if let Some((instant, data)) = map.get(&hwnd) {
                if instant.elapsed().as_secs() < 60 {
                    return Some(data.clone());
                }
            }
        }
    }
    None
}

fn set_cached_thumbnail(hwnd: isize, data: String) {
    if let Ok(mut guard) = THUMBNAIL_CACHE.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        if map.len() > 64 {
            map.retain(|_, (t, _)| t.elapsed().as_secs() < 90);
        }
        map.insert(hwnd, (Instant::now(), data));
    }
}

#[tauri::command]
pub fn capture_window_thumbnail(hwnd: isize) -> Result<String, String> {
    use base64::Engine;
    use image::{ImageBuffer, Rgba};
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GdiFlush, GetDC,
        GetDIBits, GetWindowDC, ReleaseDC, SelectObject, SetBrushOrgEx, SetStretchBltMode,
        StretchBlt, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, HALFTONE, HDC, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowPlacement, IsWindow, WINDOWPLACEMENT,
    };

    extern "system" {
        fn PrintWindow(hwnd: HWND, hdcblt: HDC, nflags: u32) -> BOOL;
    }
    const PW_RENDERFULLCONTENT: u32 = 0x00000002;

    let target = HWND(hwnd as *mut _);
    if !unsafe { IsWindow(target).as_bool() } {
        return Err("Invalid window handle".into());
    }

    let is_minimized = unsafe { IsIconic(target).as_bool() };

    unsafe {
        let mut width: i32 = 0;
        let mut height: i32 = 0;
        let mut screen_rect = RECT::default();

        if is_minimized {
            let mut placement = WINDOWPLACEMENT::default();
            placement.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
            if GetWindowPlacement(target, &mut placement).is_ok() {
                width = (placement.rcNormalPosition.right - placement.rcNormalPosition.left).max(200);
                height = (placement.rcNormalPosition.bottom - placement.rcNormalPosition.top).max(150);
            }
        } else if GetWindowRect(target, &mut screen_rect).is_ok() {
            width = (screen_rect.right - screen_rect.left).max(200);
            height = (screen_rect.bottom - screen_rect.top).max(150);
        }

        if width <= 0 || height <= 0 {
            width = 800;
            height = 600;
        }

        let thumb_w = 280i32;
        let aspect = height as f64 / width as f64;
        let thumb_h = ((thumb_w as f64 * aspect) as i32).clamp(120, 180);

        let hdc_screen = GetDC(None);
        let hdc_thumb = CreateCompatibleDC(hdc_screen);
        let hbm_thumb = CreateCompatibleBitmap(hdc_screen, thumb_w, thumb_h);
        let old_thumb_bm = SelectObject(hdc_thumb, hbm_thumb);

        let _ = SetStretchBltMode(hdc_thumb, HALFTONE);
        let _ = SetBrushOrgEx(hdc_thumb, 0, 0, None);

        let mut captured_ok = false;

        // 1. Primary: PrintWindow with PW_RENDERFULLCONTENT (handles modern DirectComposition / D3D / GPU apps)
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbm_full = CreateCompatibleBitmap(hdc_screen, width, height);
        let old_full_bm = SelectObject(hdc_mem, hbm_full);

        let mut printed = PrintWindow(target, hdc_mem, PW_RENDERFULLCONTENT);
        if !printed.as_bool() {
            // 2. Fallback: Standard PrintWindow (classic GDI)
            printed = PrintWindow(target, hdc_mem, 0);
        }

        if printed.as_bool() {
            let res = StretchBlt(
                hdc_thumb,
                0,
                0,
                thumb_w,
                thumb_h,
                hdc_mem,
                0,
                0,
                width,
                height,
                SRCCOPY,
            );
            if res.as_bool() {
                captured_ok = true;
            }
        }

        SelectObject(hdc_mem, old_full_bm);
        let _ = DeleteObject(hbm_full);
        let _ = DeleteDC(hdc_mem);

        // 3. Fallback: Screen StretchBlt if window is visible on screen and not minimized
        if !captured_ok && !is_minimized && (screen_rect.right > screen_rect.left) {
            let res = StretchBlt(
                hdc_thumb,
                0,
                0,
                thumb_w,
                thumb_h,
                hdc_screen,
                screen_rect.left,
                screen_rect.top,
                width,
                height,
                SRCCOPY,
            );
            if res.as_bool() {
                captured_ok = true;
            }
        }

        // 4. Fallback: GetWindowDC
        if !captured_ok && !is_minimized {
            let hdc_win = GetWindowDC(target);
            if !hdc_win.is_invalid() {
                let res = StretchBlt(
                    hdc_thumb,
                    0,
                    0,
                    thumb_w,
                    thumb_h,
                    hdc_win,
                    0,
                    0,
                    width,
                    height,
                    SRCCOPY,
                );
                let _ = res;
                ReleaseDC(target, hdc_win);
            }
        }

        // Flush pending GDI drawing commands
        let _ = GdiFlush();

        // CRITICAL WIN32 FIX: Deselect hbm_thumb from hdc_thumb BEFORE calling GetDIBits!
        SelectObject(hdc_thumb, old_thumb_bm);

        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: thumb_w,
                biHeight: -thumb_h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut raw_pixels = vec![0u8; (thumb_w * thumb_h * 4) as usize];
        let dib_res = GetDIBits(
            hdc_thumb,
            hbm_thumb,
            0,
            thumb_h as u32,
            Some(raw_pixels.as_mut_ptr() as *mut _),
            &mut bi,
            DIB_RGB_COLORS,
        );

        let _ = DeleteObject(hbm_thumb);
        let _ = DeleteDC(hdc_thumb);
        ReleaseDC(None, hdc_screen);

        if dib_res == 0 {
            if let Some(cached) = get_cached_thumbnail(hwnd) {
                return Ok(cached);
            }
            return Err("GetDIBits failed to read window bitmap".into());
        }

        let has_content = raw_pixels.chunks_exact(4).any(|p| p[0] > 0 || p[1] > 0 || p[2] > 0);
        if !has_content {
            if let Some(cached) = get_cached_thumbnail(hwnd) {
                return Ok(cached);
            }
            return Err("Empty or black window buffer".into());
        }

        let mut rgba_pixels = vec![0u8; (thumb_w * thumb_h * 4) as usize];
        for (src_chunk, dst_chunk) in raw_pixels.chunks_exact(4).zip(rgba_pixels.chunks_exact_mut(4))
        {
            dst_chunk[0] = src_chunk[2]; // R
            dst_chunk[1] = src_chunk[1]; // G
            dst_chunk[2] = src_chunk[0]; // B
            dst_chunk[3] = 255;          // A
        }

        if let Some(rgba_img) =
            ImageBuffer::<Rgba<u8>, _>::from_raw(thumb_w as u32, thumb_h as u32, rgba_pixels)
        {
            let mut jpeg_bytes = std::io::Cursor::new(Vec::new());
            if rgba_img.write_to(&mut jpeg_bytes, image::ImageFormat::Jpeg).is_ok() {
                let b64 = base64::engine::general_purpose::STANDARD.encode(jpeg_bytes.into_inner());
                let result = format!("data:image/jpeg;base64,{}", b64);
                set_cached_thumbnail(hwnd, result.clone());
                return Ok(result);
            }
        }

        if let Some(cached) = get_cached_thumbnail(hwnd) {
            return Ok(cached);
        }

        Err("Capture processing failed".into())
    }
}

#[tauri::command]
pub fn close_window_by_hwnd(hwnd: isize) {
    use windows::Win32::Foundation::WPARAM;
    use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, SC_CLOSE, WM_CLOSE, WM_SYSCOMMAND};
    let target = HWND(hwnd as *mut _);
    unsafe {
        let _ = PostMessageW(target, WM_SYSCOMMAND, WPARAM(SC_CLOSE as usize), LPARAM(0));
        let _ = PostMessageW(target, WM_CLOSE, WPARAM(0), LPARAM(0));
    }
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct RunningAppInfo {
    pub hwnd: isize,
    pub title: String,
    pub process_name: String,
    pub is_active: bool,
    pub is_minimized: bool,
    pub icon_base64: Option<String>,
}

#[tauri::command]
pub fn get_running_windows() -> Vec<RunningAppInfo> {
    struct EnumCtx {
        active_hwnd: HWND,
        windows: Vec<RunningAppInfo>,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut EnumCtx);

        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        if is_window_cloaked(hwnd) {
            return BOOL(1);
        }

        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if (ex_style & WS_EX_TOOLWINDOW.0) != 0 {
            return BOOL(1);
        }

        // Standard Windows taskbar rule: owned windows do not appear on taskbar unless WS_EX_APPWINDOW is set
        use windows::Win32::UI::WindowsAndMessaging::{GetWindow, GW_OWNER, WS_EX_APPWINDOW};
        if let Ok(owner) = GetWindow(hwnd, GW_OWNER) {
            let has_app_window = (ex_style & WS_EX_APPWINDOW.0) != 0;
            if !owner.0.is_null() && !has_app_window {
                return BOOL(1);
            }
        }

        let mut rect = RECT::default();
        let _ = GetWindowRect(hwnd, &mut rect);
        if (rect.right - rect.left) <= 32 || (rect.bottom - rect.top) <= 32 {
            return BOOL(1);
        }

        let mut title_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut title_buf);
        if len == 0 {
            return BOOL(1);
        }

        let title = String::from_utf16_lossy(&title_buf[..len as usize]);
        if title.starts_with("Gili")
            || title == "Program Manager"
            || title == "Windows Input Experience"
            || title == "PopupHost"
        {
            return BOOL(1);
        }

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 || pid == std::process::id() {
            return BOOL(1);
        }
        let mut process_name = String::new();
        let mut full_path = String::new();
        if pid != 0 {
            if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                let mut buf = [0u16; 1024];
                let mut len = buf.len() as u32;
                if QueryFullProcessImageNameW(
                    handle,
                    PROCESS_NAME_FORMAT(0),
                    windows::core::PWSTR(buf.as_mut_ptr()),
                    &mut len,
                )
                .is_ok()
                    && len > 0
                {
                    full_path = String::from_utf16_lossy(&buf[..len as usize]);
                    if let Some(name) = std::path::Path::new(&full_path).file_name() {
                        process_name = name.to_string_lossy().to_string();
                    }
                }
                let _ = windows::Win32::Foundation::CloseHandle(handle);
            }
        }

        if process_name.eq_ignore_ascii_case("ApplicationFrameHost.exe") {
            use windows::Win32::UI::WindowsAndMessaging::FindWindowExW;
            let mut resolved_child = false;
            if let Ok(core_hwnd) = FindWindowExW(
                hwnd,
                HWND::default(),
                windows::core::w!("Windows.UI.Core.CoreWindow"),
                None,
            ) {
                if !core_hwnd.0.is_null() {
                    if is_window_cloaked(core_hwnd) {
                        return BOOL(1);
                    }
                    let mut child_pid = 0u32;
                    GetWindowThreadProcessId(core_hwnd, Some(&mut child_pid));
                    if child_pid != 0 && child_pid != pid {
                        if let Ok(ch_handle) =
                            OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, child_pid)
                        {
                            let mut buf = [0u16; 1024];
                            let mut len = buf.len() as u32;
                            if QueryFullProcessImageNameW(
                                ch_handle,
                                PROCESS_NAME_FORMAT(0),
                                windows::core::PWSTR(buf.as_mut_ptr()),
                                &mut len,
                            )
                            .is_ok()
                                && len > 0
                            {
                                full_path = String::from_utf16_lossy(&buf[..len as usize]);
                                if let Some(name) = std::path::Path::new(&full_path).file_name() {
                                    process_name = name.to_string_lossy().to_string();
                                    resolved_child = true;
                                }
                            }
                            let _ = windows::Win32::Foundation::CloseHandle(ch_handle);
                        }
                    }
                }
            }
            if !resolved_child {
                return BOOL(1);
            }
        }

        // Skip duplicate SystemSettings.exe if ApplicationFrameHost is already hosting it
        if process_name.eq_ignore_ascii_case("SystemSettings.exe")
            && ctx
                .windows
                .iter()
                .any(|w| w.process_name.eq_ignore_ascii_case("SystemSettings.exe"))
        {
            return BOOL(1);
        }

        let is_active = hwnd == ctx.active_hwnd;
        let is_minimized = IsIconic(hwnd).as_bool();

        let icon_base64 = if !full_path.is_empty() {
            crate::windows_pinned_apps::get_cached_or_extract_icon(&full_path)
                .or_else(|| crate::windows_pinned_apps::extract_native_icon_from_hwnd(hwnd))
        } else {
            crate::windows_pinned_apps::extract_native_icon_from_hwnd(hwnd)
        };

        ctx.windows.push(RunningAppInfo {
            hwnd: hwnd.0 as isize,
            title,
            process_name,
            is_active,
            is_minimized,
            icon_base64,
        });

        BOOL(1)
    }

    unsafe {
        let mut active_hwnd = GetForegroundWindow();
        if !is_external_user_window(active_hwnd) {
            let last_ext = LAST_EXTERNAL_FG_HWND.load(Ordering::Relaxed);
            if last_ext != 0 {
                active_hwnd = HWND(last_ext as *mut _);
            }
        }
        let mut ctx = EnumCtx {
            active_hwnd,
            windows: Vec::new(),
        };
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut ctx as *mut EnumCtx as isize));
        ctx.windows
    }
}

#[tauri::command]
pub fn activate_or_toggle_window(hwnd: isize) {
    let target = HWND(hwnd as *mut _);
    unsafe {
        use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
        use windows::Win32::UI::WindowsAndMessaging::BringWindowToTop;

        let fg = GetForegroundWindow();
        let last_ext = LAST_EXTERNAL_FG_HWND.load(Ordering::Relaxed);
        let is_minimized = IsIconic(target).as_bool();

        if !is_minimized && (fg == target || (!is_external_user_window(fg) && last_ext == hwnd)) {
            let _ = ShowWindow(target, SW_MINIMIZE);
            LAST_EXTERNAL_FG_HWND.store(0, Ordering::Relaxed);
        } else {
            let fg_tid = GetWindowThreadProcessId(fg, None);
            let cur_tid = GetCurrentThreadId();
            let attached = if fg_tid != 0 && fg_tid != cur_tid {
                AttachThreadInput(cur_tid, fg_tid, true).as_bool()
            } else {
                false
            };

            if is_minimized {
                let _ = ShowWindow(target, SW_RESTORE);
            }
            let _ = BringWindowToTop(target);
            let _ = SetForegroundWindow(target);

            if attached {
                let _ = AttachThreadInput(cur_tid, fg_tid, false);
            }
            LAST_EXTERNAL_FG_HWND.store(hwnd, Ordering::Relaxed);
        }
    }
}

#[tauri::command]
pub fn trigger_start_menu() {
    if crate::shell_surface_toggle::was_just_open(crate::shell_surface_toggle::Surface::Start) {
        return;
    }
    crate::shell_surface_toggle::record_surface_opened(crate::shell_surface_toggle::Surface::Start);
    unsafe {
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_windows_search() {
    if crate::shell_surface_toggle::was_just_open(crate::shell_surface_toggle::Surface::Search) {
        return;
    }
    crate::shell_surface_toggle::record_surface_opened(crate::shell_surface_toggle::Surface::Search);
    unsafe {
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(b'S', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'S', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_quick_settings() {
    if crate::shell_surface_toggle::was_just_open(
        crate::shell_surface_toggle::Surface::QuickSettings,
    ) {
        return;
    }
    crate::shell_surface_toggle::record_surface_opened(
        crate::shell_surface_toggle::Surface::QuickSettings,
    );
    unsafe {
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(b'A', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'A', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_volume_flyout() {
    unsafe {
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(VK_CONTROL.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'V', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'V', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_notification_center() {
    if crate::shell_surface_toggle::was_just_open(
        crate::shell_surface_toggle::Surface::Notifications,
    ) {
        return;
    }
    crate::shell_surface_toggle::record_surface_opened(
        crate::shell_surface_toggle::Surface::Notifications,
    );
    unsafe {
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(b'N', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'N', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_file_explorer() {
    let running = get_running_windows();
    if let Some(exp) = running
        .iter()
        .find(|w| w.process_name.eq_ignore_ascii_case("explorer.exe") && w.is_active)
        .or_else(|| {
            running
                .iter()
                .find(|w| w.process_name.eq_ignore_ascii_case("explorer.exe"))
        })
    {
        activate_or_toggle_window(exp.hwnd);
        return;
    }
    unsafe {
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(b'E', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'E', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_task_manager() {
    let running = get_running_windows();
    if let Some(tm) = running
        .iter()
        .find(|w| w.process_name.eq_ignore_ascii_case("Taskmgr.exe"))
    {
        activate_or_toggle_window(tm.hwnd);
        return;
    }
    unsafe {
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
    if target.starts_with("ms-settings:") {
        let running = get_running_windows();
        if let Some(settings_win) = running.iter().find(|w| {
            w.process_name.eq_ignore_ascii_case("SystemSettings.exe") && w.is_active && !w.is_minimized
        }) {
            activate_or_toggle_window(settings_win.hwnd);
            return;
        }
    }
    let _ = std::process::Command::new("cmd.exe")
        .creation_flags(0x08000000)
        .args(["/c", "start", "", &target])
        .spawn();
}

#[tauri::command]
pub fn switch_virtual_desktop(action: String) {
    unsafe {
        match action.as_str() {
            "prev" => {
                // Ctrl + Win + Left Arrow (0x25)
                keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
                keybd_event(VK_CONTROL.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
                keybd_event(0x25, 0, KEYEVENTF_EXTENDEDKEY, 0);
                keybd_event(0x25, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
                keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
                keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
            }
            "task_view" => {
                // Win + Tab (0x09)
                keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
                keybd_event(0x09, 0, KEYBD_EVENT_FLAGS(0), 0);
                keybd_event(0x09, 0, KEYEVENTF_KEYUP, 0);
                keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
            }
            _ => {
                // "next": Ctrl + Win + Right Arrow (0x27)
                keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
                keybd_event(VK_CONTROL.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
                keybd_event(0x27, 0, KEYEVENTF_EXTENDEDKEY, 0);
                keybd_event(0x27, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
                keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
                keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
            }
        }
    }
}

#[tauri::command]
pub fn trigger_fullscreen_screenshot() {
    unsafe {
        // Win + PrintScreen (VK_SNAPSHOT = 0x2C) captures fullscreen to Pictures/Screenshots & clipboard
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(0x2C, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(0x2C, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn check_navbar_window_overlap(app: tauri::AppHandle) -> bool {
    if let Some(win) = app.get_webview_window("navbar") {
        #[cfg(windows)]
        if let Ok(raw_hwnd) = win.hwnd() {
            let nav_hwnd = HWND(raw_hwnd.0);
            let nav_mon = unsafe { MonitorFromWindow(nav_hwnd, MONITOR_DEFAULTTONEAREST) };
            return is_any_window_covering_dock(nav_hwnd, nav_mon);
        }
    }
    false
}
