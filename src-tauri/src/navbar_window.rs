use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
use std::sync::{Mutex, Once, OnceLock};
use tauri::{Emitter, Manager};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, IntersectRect, MonitorFromPoint, MonitorFromWindow, HMONITOR, MONITORINFO,
    MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, GetAsyncKeyState, KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP,
    VK_CONTROL, VK_ESCAPE, VK_LBUTTON, VK_LWIN, VK_RBUTTON, VK_RWIN, VK_SHIFT,
    VK_SNAPSHOT,
};
use windows::Win32::UI::Shell::{SHAppBarMessage, ABM_REMOVE, APPBARDATA};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetCursorPos, GetForegroundWindow, GetLayeredWindowAttributes,
    GetTopWindow, GetWindow, GetWindowLongW, GetWindowPlacement, GetWindowRect, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, SetForegroundWindow,
    SetWindowLongW, SetWindowPos, ShowWindow, ShowWindowAsync, GWL_EXSTYLE, GWL_STYLE, GW_HWNDNEXT,
    GW_OWNER, HWND_TOPMOST, LWA_ALPHA, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    SWP_NOZORDER, SWP_SHOWWINDOW, SW_MINIMIZE, SW_RESTORE, SW_SHOWNOACTIVATE, WINDOWPLACEMENT,
    WS_CAPTION, WS_DISABLED, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT, WS_THICKFRAME,
};

static NAVBAR_ENABLED: AtomicBool = AtomicBool::new(false);
static NAVBAR_LIFECYCLE_GEN: AtomicU64 = AtomicU64::new(0);
static APPBAR_REGISTERED: AtomicBool = AtomicBool::new(false);
static NAVBAR_WATCHER_STARTED: Once = Once::new();
static NAVBAR_CREATING: AtomicBool = AtomicBool::new(false);
static LAST_EXTERNAL_FG_HWND: AtomicIsize = AtomicIsize::new(0);
static OVERLAP_RECHECK_NEEDED: AtomicBool = AtomicBool::new(false);

pub fn is_navbar_enabled() -> bool {
    NAVBAR_ENABLED.load(Ordering::Relaxed)
}

pub fn request_overlap_recheck() {
    OVERLAP_RECHECK_NEEDED.store(true, Ordering::Release);
}

#[link(name = "dwmapi")]
extern "system" {
    fn DwmGetWindowAttribute(
        hwnd: windows::Win32::Foundation::HWND,
        dw_attribute: u32,
        pv_attribute: *mut core::ffi::c_void,
        cb_attribute: u32,
    ) -> windows::core::HRESULT;
}

const DWMWA_EXTENDED_FRAME_BOUNDS: u32 = 9;
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

#[derive(Clone, Debug, serde::Deserialize)]
pub struct PopupHitRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug)]
pub struct NavbarHitGeometry {
    pub dock_width: f64,
    pub dock_height: f64,
    pub position: String,
    pub distance_from_edge: f64,
    pub is_anchored: bool,
    pub auto_hide: bool,
    pub auto_hide_enabled: bool,
    pub is_dock_hidden: bool,
    pub scale_factor: f64,
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
            auto_hide_enabled: false,
            is_dock_hidden: false,
            scale_factor: 1.0,
            mon_rect: (0, 0, 0, 0),
        }
    }
}

static NAVBAR_HIT_GEOMS: OnceLock<Mutex<HashMap<String, NavbarHitGeometry>>> = OnceLock::new();
static POPUP_REGIONS_BY_WIN: OnceLock<Mutex<HashMap<String, HashMap<String, Option<PopupHitRect>>>>> =
    OnceLock::new();
static LAST_SYNCED_NAV_RECTS: OnceLock<Mutex<HashMap<String, (i32, i32, i32, i32)>>> =
    OnceLock::new();
static NAVBAR_MONITOR_MODE: OnceLock<Mutex<String>> = OnceLock::new();
static SYNC_SEC_NAVBAR_QUEUE: Mutex<(bool, Option<bool>)> = Mutex::new((false, None));

fn hit_geoms() -> &'static Mutex<HashMap<String, NavbarHitGeometry>> {
    NAVBAR_HIT_GEOMS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn popup_regions_map() -> &'static Mutex<HashMap<String, HashMap<String, Option<PopupHitRect>>>> {
    POPUP_REGIONS_BY_WIN.get_or_init(|| Mutex::new(HashMap::new()))
}

fn last_nav_rects() -> &'static Mutex<HashMap<String, (i32, i32, i32, i32)>> {
    LAST_SYNCED_NAV_RECTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn monitor_mode_lock() -> &'static Mutex<String> {
    NAVBAR_MONITOR_MODE.get_or_init(|| Mutex::new("all".to_string()))
}

pub fn get_monitor_mode() -> String {
    monitor_mode_lock()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

pub fn is_navbar_window_label(label: &str) -> bool {
    label == "navbar" || label.starts_with("navbar_secondary_")
}

pub fn get_window_hit_geom(label: &str) -> NavbarHitGeometry {
    hit_geoms()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(label)
        .cloned()
        .unwrap_or_default()
}

fn get_window_last_rect(label: &str) -> (i32, i32, i32, i32) {
    last_nav_rects()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(label)
        .copied()
        .unwrap_or((0, 0, 0, 0))
}

fn set_window_last_rect(label: &str, rect: (i32, i32, i32, i32)) {
    last_nav_rects()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(label.to_string(), rect);
}

fn clear_window_nav_state(label: &str) {
    hit_geoms()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(label);
    popup_regions_map()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(label);
    last_nav_rects()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(label);
}

pub fn get_primary_navbar_mon_rect() -> Option<(i32, i32, i32, i32)> {
    let g = get_window_hit_geom("navbar");
    if g.mon_rect.2 > g.mon_rect.0 && g.mon_rect.3 > g.mon_rect.1 {
        Some(g.mon_rect)
    } else {
        None
    }
}

fn point_in_mon_rect(pt: POINT, r: (i32, i32, i32, i32)) -> bool {
    r.2 > r.0 && r.3 > r.1 && pt.x >= r.0 && pt.x < r.2 && pt.y >= r.1 && pt.y < r.3
}

pub fn get_active_navbar_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    let mut pt = POINT { x: 0, y: 0 };
    if unsafe { GetCursorPos(&mut pt) }.is_ok() {
        let matched_label = {
            let map = hit_geoms().lock().unwrap_or_else(|e| e.into_inner());
            map.iter()
                .find(|(_, geom)| point_in_mon_rect(pt, geom.mon_rect))
                .map(|(label, _)| label.clone())
        };
        if let Some(label) = matched_label {
            if let Some(win) = app.get_webview_window(&label) {
                return Some(win);
            }
        }

        let cursor_mon = unsafe { MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST) };
        for (label, win) in app.webview_windows() {
            if !is_navbar_window_label(&label) {
                continue;
            }
            if let Ok(raw_hwnd) = win.hwnd() {
                let win_mon =
                    unsafe { MonitorFromWindow(HWND(raw_hwnd.0), MONITOR_DEFAULTTONEAREST) };
                if win_mon == cursor_mon {
                    return Some(win);
                }
            }
        }
    }
    app.get_webview_window("navbar")
}

pub fn get_navbar_dock_geometry() -> NavbarHitGeometry {
    let mut pt = POINT { x: 0, y: 0 };
    let map = hit_geoms().lock().unwrap_or_else(|e| e.into_inner());
    if unsafe { GetCursorPos(&mut pt) }.is_ok() {
        if let Some((_, geom)) = map.iter().find(|(_, g)| point_in_mon_rect(pt, g.mon_rect)) {
            return geom.clone();
        }
    }
    map.get("navbar").cloned().unwrap_or_default()
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
        let mut new_ex = (ex | WS_EX_TOOLWINDOW.0) & !WS_EX_APPWINDOW.0;
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

fn desired_click_through_map() -> &'static Mutex<HashMap<isize, bool>> {
    static MAP: OnceLock<Mutex<HashMap<isize, bool>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn should_disable_click_through_hwnd(hwnd: HWND) -> bool {
    // Only disable the HWND when it does not hold active foreground focus, or while Snipping Tool is active.
    unsafe { GetForegroundWindow() != hwnd || is_snipping_shortcut_or_overlay_active() }
}

/// Applies WS_EX_LAYERED | WS_EX_TRANSPARENT (+ SWP_FRAMECHANGED) BEFORE setting WS_DISABLED so Windows
/// hit-testing skips the overlay cleanly instead of delivering clicks to a disabled HWND (which beeps).
pub fn set_overlay_hwnd_click_through(hwnd: HWND, ignore: bool) {
    if hwnd.0.is_null() || unsafe { !IsWindow(hwnd).as_bool() } {
        return;
    }
    unsafe {
        if ignore {
            let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            let new_ex =
                (ex | WS_EX_TOOLWINDOW.0 | WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0)
                    & !WS_EX_APPWINDOW.0;
            if new_ex != ex {
                let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex as i32);
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
                );
            }

            let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
            let new_style = if should_disable_click_through_hwnd(hwnd) {
                style | WS_DISABLED.0
            } else {
                style & !WS_DISABLED.0
            };
            if new_style != style {
                let _ = SetWindowLongW(hwnd, GWL_STYLE, new_style as i32);
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
                );
            }
        } else {
            let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
            let new_style = style & !WS_DISABLED.0;
            if new_style != style {
                let _ = SetWindowLongW(hwnd, GWL_STYLE, new_style as i32);
            }

            let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            let new_ex = (ex | WS_EX_TOOLWINDOW.0)
                & !(WS_EX_APPWINDOW.0 | WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0);
            if new_ex != ex {
                let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex as i32);
            }

            if new_style != style || new_ex != ex {
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
                );
            }
        }
    }
}

pub fn set_overlay_click_through(win: &tauri::WebviewWindow, ignore: bool) {
    #[cfg(windows)]
    if let Ok(raw_hwnd) = win.hwnd() {
        let hwnd_raw = raw_hwnd.0 as isize;
        let hwnd = HWND(raw_hwnd.0);
        if let Ok(mut map) = desired_click_through_map().lock() {
            map.insert(hwnd_raw, ignore);
        }
        set_overlay_hwnd_click_through(hwnd, ignore);
        let _ = win.set_ignore_cursor_events(ignore);
        let win_clone = win.clone();
        let _ = win.run_on_main_thread(move || {
            let latest = desired_click_through_map()
                .lock()
                .ok()
                .and_then(|m| m.get(&hwnd_raw).copied())
                .unwrap_or(ignore);
            if let Ok(h) = win_clone.hwnd() {
                set_overlay_hwnd_click_through(HWND(h.0), latest);
            }
        });
        return;
    }
    let _ = win.set_ignore_cursor_events(ignore);
}

pub fn sync_overlay_click_through(win: &tauri::WebviewWindow, ignore: bool) {
    #[cfg(windows)]
    if let Ok(raw_hwnd) = win.hwnd() {
        let hwnd_raw = raw_hwnd.0 as isize;
        let hwnd = HWND(raw_hwnd.0);
        if let Ok(mut map) = desired_click_through_map().lock() {
            map.insert(hwnd_raw, ignore);
        }
        unsafe {
            let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
            let cur_transparent = (ex & WS_EX_TRANSPARENT.0) != 0;
            let cur_layered = (ex & WS_EX_LAYERED.0) != 0;
            let want_disabled = ignore && should_disable_click_through_hwnd(hwnd);
            let cur_disabled = (style & WS_DISABLED.0) != 0;
            let needs_tool_fix =
                (ex & WS_EX_TOOLWINDOW.0) == 0 || (ex & WS_EX_APPWINDOW.0) != 0;
            if cur_transparent != ignore
                || cur_layered != ignore
                || cur_disabled != want_disabled
                || needs_tool_fix
            {
                set_overlay_click_through(win, ignore);
            }
        }
        return;
    }
    let _ = win.set_ignore_cursor_events(ignore);
}

pub fn is_snipping_shortcut_or_overlay_active() -> bool {
    unsafe {
        let win_down = ((GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000) != 0)
            || ((GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000) != 0);
        let shift_down = (GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;
        let prt_down = (GetAsyncKeyState(VK_SNAPSHOT.0 as i32) as u16 & 0x8000) != 0;
        if (win_down && shift_down) || prt_down {
            return true;
        }

        let fg = GetForegroundWindow();
        if !fg.0.is_null() {
            let mut class_buf = [0u16; 64];
            let clen = GetClassNameW(fg, &mut class_buf);
            if clen > 0 {
                let cls = String::from_utf16_lossy(&class_buf[..clen as usize]);
                if cls == "ScreenClippingWindowClass" {
                    return true;
                }
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(fg, Some(&mut pid));
            if pid != 0 {
                let (proc_name, _) = query_process_image(pid);
                if proc_name.eq_ignore_ascii_case("ScreenClippingHost.exe")
                    || proc_name.eq_ignore_ascii_case("SnippingTool.exe")
                {
                    return true;
                }
            }
        }
    }
    false
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

unsafe fn is_gili_settings_window(hwnd: HWND) -> bool {
    let mut title_buf = [0u16; 64];
    let len = GetWindowTextW(hwnd, &mut title_buf);
    len > 0 && String::from_utf16_lossy(&title_buf[..len as usize]) == "Gili Settings"
}

unsafe fn visible_window_rect(hwnd: HWND) -> Option<RECT> {
    let mut rect = RECT::default();
    let hr = DwmGetWindowAttribute(
        hwnd,
        DWMWA_EXTENDED_FRAME_BOUNDS,
        &mut rect as *mut _ as *mut _,
        std::mem::size_of::<RECT>() as u32,
    );
    if hr.is_ok() && rect.right > rect.left && rect.bottom > rect.top {
        return Some(rect);
    }
    if GetWindowRect(hwnd, &mut rect).is_ok() {
        return Some(rect);
    }
    None
}

unsafe fn is_overlappable_user_window(hwnd: HWND, include_gili_settings: bool) -> bool {
    if !is_external_user_window(hwnd) {
        return include_gili_settings
            && !hwnd.0.is_null()
            && IsWindowVisible(hwnd).as_bool()
            && !is_window_cloaked(hwnd)
            && is_gili_settings_window(hwnd);
    }
    if get_window_cloaked_flags(hwnd) != 0 {
        return false;
    }
    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    if (ex_style & WS_EX_TOOLWINDOW.0) != 0 {
        return false;
    }
    if (ex_style & WS_EX_NOACTIVATE.0) != 0 && (ex_style & WS_EX_APPWINDOW.0) == 0 {
        return false;
    }
    if (ex_style & WS_EX_LAYERED.0) != 0 {
        let mut alpha = 255u8;
        let mut flags = Default::default();
        if GetLayeredWindowAttributes(hwnd, None, Some(&mut alpha), Some(&mut flags)).is_ok()
            && (flags & LWA_ALPHA).0 != 0
            && alpha == 0
        {
            return false;
        }
    }
    if !GetWindow(hwnd, GW_OWNER).unwrap_or_default().0.is_null()
        && (ex_style & WS_EX_APPWINDOW.0) == 0
    {
        return false;
    }
    let mut class_buf = [0u16; 96];
    let clen = GetClassNameW(hwnd, &mut class_buf);
    if clen > 0 {
        let class_name = String::from_utf16_lossy(&class_buf[..clen as usize]);
        if is_system_shell_class(&class_name) {
            return false;
        }
    }
    true
}

fn is_trackable_fg_window(hwnd: HWND) -> bool {
    if is_external_user_window(hwnd) {
        return true;
    }
    if hwnd.0.is_null() {
        return false;
    }
    unsafe {
        IsWindowVisible(hwnd).as_bool() && !is_window_cloaked(hwnd) && is_gili_settings_window(hwnd)
    }
}

pub fn on_external_foreground_observed(hwnd: isize) {
    if hwnd == 0 {
        return;
    }
    let h = HWND(hwnd as *mut _);
    if is_trackable_fg_window(h) {
        LAST_EXTERNAL_FG_HWND.store(hwnd, Ordering::Relaxed);
    }
}

pub(crate) fn is_topmost_visible_trackable_window(target: HWND) -> bool {
    if target.0.is_null() {
        return false;
    }
    unsafe {
        let mut cur = GetTopWindow(None).unwrap_or_default();
        for _ in 0..64 {
            if cur.0.is_null() {
                break;
            }
            if IsWindowVisible(cur).as_bool()
                && !IsIconic(cur).as_bool()
                && !is_window_cloaked(cur)
                && is_trackable_fg_window(cur)
            {
                return cur == target;
            }
            cur = GetWindow(cur, GW_HWNDNEXT).unwrap_or_default();
        }
    }
    false
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

fn compute_dock_visual_phys_rect(
    win_left: i32,
    win_top: i32,
    win_right: i32,
    win_bottom: i32,
    sf: f64,
    geom: &NavbarHitGeometry,
    use_hidden_strip: bool,
) -> RECT {
    let win_w = win_right - win_left;
    let win_h = win_bottom - win_top;
    let dock_phys_w = (geom.dock_width * sf).round() as i32;
    let dock_phys_h = (geom.dock_height * sf).round() as i32;
    let edge_offset = if geom.is_anchored {
        0
    } else {
        (geom.distance_from_edge * sf).round() as i32
    };
    let hot_strip = (10.0 * sf).round() as i32;
    let is_hidden = use_hidden_strip && geom.auto_hide && geom.is_dock_hidden;

    match geom.position.as_str() {
        "top" => {
            let left = win_left + (win_w - dock_phys_w) / 2;
            let right = left + dock_phys_w;
            let top = if is_hidden || (use_hidden_strip && geom.auto_hide) {
                win_top
            } else {
                win_top + edge_offset
            };
            let bottom = if is_hidden {
                win_top + hot_strip
            } else {
                win_top + edge_offset + dock_phys_h
            };
            RECT {
                left,
                top,
                right,
                bottom,
            }
        }
        "left" => {
            let top = win_top + (win_h - dock_phys_h) / 2;
            let bottom = top + dock_phys_h;
            let left = if is_hidden || (use_hidden_strip && geom.auto_hide) {
                win_left
            } else {
                win_left + edge_offset
            };
            let right = if is_hidden {
                win_left + hot_strip
            } else {
                win_left + edge_offset + dock_phys_w
            };
            RECT {
                left,
                top,
                right,
                bottom,
            }
        }
        "right" => {
            let top = win_top + (win_h - dock_phys_h) / 2;
            let bottom = top + dock_phys_h;
            let right = if is_hidden || (use_hidden_strip && geom.auto_hide) {
                win_right
            } else {
                win_right - edge_offset
            };
            let left = if is_hidden {
                win_right - hot_strip
            } else {
                win_right - edge_offset - dock_phys_w
            };
            RECT {
                left,
                top,
                right,
                bottom,
            }
        }
        _ => {
            let left = win_left + (win_w - dock_phys_w) / 2;
            let right = left + dock_phys_w;
            let bottom = if is_hidden || (use_hidden_strip && geom.auto_hide) {
                win_bottom
            } else {
                win_bottom - edge_offset
            };
            let top = if is_hidden {
                win_bottom - hot_strip
            } else {
                win_bottom - edge_offset - dock_phys_h
            };
            RECT {
                left,
                top,
                right,
                bottom,
            }
        }
    }
}

fn does_window_rect_cover_dock(w_rect: &RECT, style: u32, dock_rect: &RECT) -> bool {
    if (w_rect.right - w_rect.left) <= 32 || (w_rect.bottom - w_rect.top) <= 32 {
        return false;
    }
    if (style & 0x01000000) != 0 {
        return true;
    }
    let mut inter = RECT::default();
    unsafe {
        if IntersectRect(&mut inter, w_rect, dock_rect).as_bool() {
            return (inter.right - inter.left) > 4 && (inter.bottom - inter.top) > 4;
        }
    }
    false
}

unsafe fn window_covers_dock(
    hwnd: HWND,
    nav_hwnd: HWND,
    nav_mon: windows::Win32::Graphics::Gdi::HMONITOR,
    dock_rect: &RECT,
) -> bool {
    if hwnd.0.is_null() || hwnd == nav_hwnd || IsIconic(hwnd).as_bool() {
        return false;
    }
    if !is_overlappable_user_window(hwnd, true) {
        return false;
    }
    if MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) != nav_mon {
        return false;
    }
    let Some(w_rect) = visible_window_rect(hwnd) else {
        return false;
    };
    let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
    if !does_window_rect_cover_dock(&w_rect, style, dock_rect) {
        return false;
    }

    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid != 0 && pid != std::process::id() {
        let mut title_buf = [0u16; 128];
        let tlen = GetWindowTextW(hwnd, &mut title_buf);
        if tlen > 0 {
            let title = String::from_utf16_lossy(&title_buf[..tlen as usize]);
            if matches!(
                title.as_str(),
                "Program Manager" | "Windows Input Experience" | "PopupHost"
            ) || title.starts_with("Gili")
            {
                return false;
            }
        }
        let (process_name, _) = query_process_image(pid);
        if !process_name.is_empty() && is_system_shell_process(&process_name) {
            return false;
        }
    }

    true
}

/// Checks whether any non-minimized user window on the same monitor is maximized
/// or overlaps the visual navbar dock rect (Intellihide / Auto-Hide Normal condition).
fn is_any_window_covering_dock_for_geom(
    nav_hwnd: HWND,
    nav_mon: HMONITOR,
    geom: &NavbarHitGeometry,
) -> bool {
    let mut raw_nav_rect = RECT::default();
    if unsafe { GetWindowRect(nav_hwnd, &mut raw_nav_rect) }.is_err() {
        return false;
    }

    let dock_rect = compute_dock_visual_phys_rect(
        raw_nav_rect.left,
        raw_nav_rect.top,
        raw_nav_rect.right,
        raw_nav_rect.bottom,
        geom.scale_factor.max(1.0),
        geom,
        false,
    );

    unsafe {
        let fg = GetForegroundWindow();
        if window_covers_dock(fg, nav_hwnd, nav_mon, &dock_rect) {
            return true;
        }
    }

    struct CheckCtx {
        nav_hwnd: HWND,
        nav_mon: windows::Win32::Graphics::Gdi::HMONITOR,
        dock_rect: RECT,
        is_covered: bool,
    }

    unsafe extern "system" fn check_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut CheckCtx);
        if window_covers_dock(hwnd, ctx.nav_hwnd, ctx.nav_mon, &ctx.dock_rect) {
            ctx.is_covered = true;
            return BOOL(0);
        }
        BOOL(1)
    }

    let mut ctx = CheckCtx {
        nav_hwnd,
        nav_mon,
        dock_rect,
        is_covered: false,
    };
    unsafe {
        let _ = EnumWindows(Some(check_proc), LPARAM(&mut ctx as *mut CheckCtx as isize));
    }
    ctx.is_covered
}

fn is_dock_reveal_edge_hit(
    pt: POINT,
    win_pos: tauri::PhysicalPosition<i32>,
    win_size: tauri::PhysicalSize<u32>,
    sf: f64,
    geom: &NavbarHitGeometry,
) -> bool {
    let win_left = win_pos.x;
    let win_top = win_pos.y;
    let win_right = win_left + win_size.width as i32;
    let win_bottom = win_top + win_size.height as i32;

    let (mon_l, mon_t, mon_r, mon_b) = geom.mon_rect;
    let (edge_l, edge_t, edge_r, edge_b) = if mon_r > mon_l && mon_b > mon_t {
        (mon_l, mon_t, mon_r, mon_b)
    } else {
        (win_left, win_top, win_right, win_bottom)
    };

    let dock_rect =
        compute_dock_visual_phys_rect(win_left, win_top, win_right, win_bottom, sf, geom, false);
    let _ = sf;
    // Require cursor to reach the literal 2px screen bezel strip inside the dock span.
    let strip = 2i32;

    match geom.position.as_str() {
        "top" => {
            pt.x >= dock_rect.left
                && pt.x <= dock_rect.right
                && pt.y >= edge_t
                && pt.y < edge_t + strip
        }
        "left" => {
            pt.y >= dock_rect.top
                && pt.y <= dock_rect.bottom
                && pt.x >= edge_l
                && pt.x < edge_l + strip
        }
        "right" => {
            pt.y >= dock_rect.top
                && pt.y <= dock_rect.bottom
                && pt.x >= edge_r - strip
                && pt.x < edge_r
        }
        _ => {
            pt.x >= dock_rect.left
                && pt.x <= dock_rect.right
                && pt.y >= edge_b - strip
                && pt.y < edge_b
        }
    }
}

fn calculate_navbar_hit(
    pt: POINT,
    win_pos: tauri::PhysicalPosition<i32>,
    win_size: tauri::PhysicalSize<u32>,
    sf: f64,
    geom: &NavbarHitGeometry,
    active_popups: &[Option<PopupHitRect>],
) -> bool {
    if geom.auto_hide && geom.is_dock_hidden {
        return is_dock_reveal_edge_hit(pt, win_pos, win_size, sf, geom);
    }

    let win_left = win_pos.x;
    let win_top = win_pos.y;
    let win_w = win_size.width as i32;
    let win_h = win_size.height as i32;
    let win_right = win_left + win_w;
    let win_bottom = win_top + win_h;

    if pt.x < win_left || pt.x > win_right || pt.y < win_top || pt.y > win_bottom {
        return false;
    }

    let pad = (6.0 * sf).round() as i32;

    for region_opt in active_popups {
        match region_opt {
            Some(r) => {
                let left = win_left + (r.x * sf).round() as i32 - pad;
                let top = win_top + (r.y * sf).round() as i32 - pad;
                let right = win_left + ((r.x + r.width) * sf).round() as i32 + pad;
                let bottom = win_top + ((r.y + r.height) * sf).round() as i32 + pad;
                if pt.x >= left && pt.x <= right && pt.y >= top && pt.y <= bottom {
                    return true;
                }
            }
            None => {
                // Active drag session or unmeasured legacy fallback
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
        }
    }

    let dock_rect =
        compute_dock_visual_phys_rect(win_left, win_top, win_right, win_bottom, sf, geom, true);
    let edge_slack = pad;

    pt.x >= (dock_rect.left - pad)
        && pt.x <= (dock_rect.right + pad)
        && pt.y
            >= (dock_rect.top
                - if geom.position == "top" {
                    edge_slack
                } else {
                    pad
                })
        && pt.y
            <= (dock_rect.bottom
                + if geom.position == "bottom" {
                    edge_slack
                } else {
                    pad
                })
}

fn is_cursor_near_navbar_edge(pt: POINT, sf: f64, geom: &NavbarHitGeometry) -> bool {
    let (mon_l, mon_t, mon_r, mon_b) = geom.mon_rect;
    if mon_r <= mon_l || mon_b <= mon_t {
        return true;
    }
    let margin = (48.0 * sf).round().max(32.0) as i32;
    match geom.position.as_str() {
        "top" => pt.x >= mon_l && pt.x <= mon_r && pt.y >= mon_t && pt.y <= mon_t + margin,
        "left" => pt.y >= mon_t && pt.y <= mon_b && pt.x >= mon_l && pt.x <= mon_l + margin,
        "right" => pt.y >= mon_t && pt.y <= mon_b && pt.x >= mon_r - margin && pt.x <= mon_r,
        _ => pt.x >= mon_l && pt.x <= mon_r && pt.y >= mon_b - margin && pt.y <= mon_b,
    }
}

#[derive(Default)]
struct NavWinWatchState {
    was_in_dock: bool,
    was_fullscreen: bool,
    was_window_covered: bool,
    was_auto_hide_enabled: bool,
    was_mouse_down: bool,
    last_fs_fg_hwnd: isize,
    last_overlap_fg_hwnd: isize,
}

fn start_navbar_cursor_watcher(app: tauri::AppHandle) {
    crate::shell_surface_toggle::ensure_watcher();
    NAVBAR_WATCHER_STARTED.call_once(|| {
        std::thread::spawn(move || {
            let mut watch_states: HashMap<String, NavWinWatchState> = HashMap::new();
            let mut tick: u32 = 0;
            let mut last_polled_fg_hwnd: isize = 0;

            loop {
                if !NAVBAR_ENABLED.load(Ordering::Relaxed) {
                    last_polled_fg_hwnd = 0;
                    watch_states.clear();
                    std::thread::sleep(std::time::Duration::from_millis(250));
                    continue;
                }

                let nav_windows: Vec<(String, tauri::WebviewWindow)> = app
                    .webview_windows()
                    .into_iter()
                    .filter(|(label, _)| is_navbar_window_label(label))
                    .collect();

                if nav_windows.is_empty() {
                    last_polled_fg_hwnd = 0;
                    watch_states.clear();
                    std::thread::sleep(std::time::Duration::from_millis(250));
                    continue;
                }

                watch_states.retain(|label, _| {
                    nav_windows.iter().any(|(wlabel, _)| wlabel == label)
                });

                std::thread::sleep(std::time::Duration::from_millis(25));
                tick = tick.wrapping_add(1);

                // Track the last active foreground window only when GetForegroundWindow() HWND changes.
                let fg = unsafe { GetForegroundWindow() };
                let fg_raw = fg.0 as isize;
                if fg_raw != last_polled_fg_hwnd {
                    last_polled_fg_hwnd = fg_raw;
                    static LAST_PREVIEW_FG_HWND: std::sync::atomic::AtomicIsize =
                        std::sync::atomic::AtomicIsize::new(0);
                    let trackable = is_trackable_fg_window(fg);
                    let fg_val = if trackable { fg_raw } else { 0 };
                    if LAST_PREVIEW_FG_HWND.swap(fg_val, Ordering::Relaxed) != fg_val {
                        crate::window_preview::on_foreground_window_observed(fg_val);
                        request_overlap_recheck();
                    }
                    if trackable {
                        LAST_EXTERNAL_FG_HWND.store(fg_val, Ordering::Relaxed);
                    }
                    crate::backdrop_blur::invalidate_all_backdrops();
                }

                let mut pt = POINT { x: 0, y: 0 };
                if unsafe { GetCursorPos(&mut pt) }.is_err() {
                    continue;
                }

                let overlap_recheck_due = OVERLAP_RECHECK_NEEDED.swap(false, Ordering::AcqRel);
                let snipping_active = is_snipping_shortcut_or_overlay_active();

                for (label, win) in nav_windows {
                    if !win.is_visible().unwrap_or(false) {
                        continue;
                    }

                    let (Ok(win_pos), Ok(win_size), Ok(sf)) =
                        (win.outer_position(), win.outer_size(), win.scale_factor())
                    else {
                        continue;
                    };

                    let geom = get_window_hit_geom(&label);
                    let active_popups: Vec<Option<PopupHitRect>> = popup_regions_map()
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .get(&label)
                        .map(|m| m.values().cloned().collect())
                        .unwrap_or_default();

                    let state = watch_states.entry(label.clone()).or_default();
                    let near_edge = state.was_in_dock
                        || !active_popups.is_empty()
                        || is_cursor_near_navbar_edge(pt, sf, &geom);

                    let fs_due = fg_raw != state.last_fs_fg_hwnd
                        || (near_edge && tick.is_multiple_of(16))
                        || tick.is_multiple_of(60);
                    if fs_due {
                        state.last_fs_fg_hwnd = fg_raw;
                        let is_fs = is_fullscreen_app_covering_navbar(&win);
                        if is_fs != state.was_fullscreen {
                            state.was_fullscreen = is_fs;
                            let _ = app.emit_to(&label, "navbar-fullscreen-state", is_fs);
                            crate::backdrop_blur::set_window_acrylic_hidden(&label, is_fs);
                            if !is_fs {
                                crate::backdrop_blur::invalidate_all_backdrops();
                                request_overlap_recheck();
                            }
                            if is_fs {
                                set_overlay_click_through(&win, true);
                                state.was_in_dock = false;
                                continue;
                            }
                        }
                    }

                    if state.was_fullscreen {
                        continue;
                    }

                    if !geom.auto_hide_enabled {
                        if state.was_auto_hide_enabled || state.was_window_covered {
                            state.was_auto_hide_enabled = false;
                            state.was_window_covered = false;
                            let _ = app.emit_to(&label, "navbar-window-overlap-state", false);
                        }
                    } else {
                        let just_enabled = !state.was_auto_hide_enabled;
                        state.was_auto_hide_enabled = true;
                        let overlap_fg_changed = fg_raw != state.last_overlap_fg_hwnd;
                        let force_overlap =
                            just_enabled || overlap_fg_changed || overlap_recheck_due;
                        if force_overlap
                            || (near_edge && tick.is_multiple_of(12))
                            || tick.is_multiple_of(40)
                        {
                            state.last_overlap_fg_hwnd = fg_raw;
                            #[cfg(windows)]
                            if let Ok(raw_hwnd) = win.hwnd() {
                                let nav_hwnd = HWND(raw_hwnd.0);
                                let nav_mon =
                                    unsafe { MonitorFromWindow(nav_hwnd, MONITOR_DEFAULTTONEAREST) };
                                let is_covered =
                                    is_any_window_covering_dock_for_geom(nav_hwnd, nav_mon, &geom);
                                if is_covered != state.was_window_covered || just_enabled {
                                    state.was_window_covered = is_covered;
                                    let _ = app.emit_to(
                                        &label,
                                        "navbar-window-overlap-state",
                                        is_covered,
                                    );
                                    crate::backdrop_blur::invalidate_all_backdrops();
                                }
                            }
                        }
                    }

                    let in_dock = if snipping_active {
                        false
                    } else {
                        calculate_navbar_hit(pt, win_pos, win_size, sf, &geom, &active_popups)
                    };

                    if !active_popups.is_empty() && !snipping_active {
                        let mouse_down = unsafe {
                            (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0
                                || (GetAsyncKeyState(VK_RBUTTON.0 as i32) as u16 & 0x8000) != 0
                        };
                        let mouse_just_pressed = mouse_down && !state.was_mouse_down;
                        state.was_mouse_down = mouse_down;
                        if !in_dock && mouse_just_pressed {
                            let _ = app.emit_to(&label, "navbar-dismiss-popovers", ());
                        }
                    } else {
                        state.was_mouse_down = false;
                    }

                    if in_dock != state.was_in_dock {
                        state.was_in_dock = in_dock;
                        set_overlay_click_through(&win, !in_dock);
                        let _ = app.emit_to(&label, "navbar-cursor-hit", in_dock);
                    } else {
                        sync_overlay_click_through(&win, !in_dock);
                    }
                }
            }
        });
    });
}

fn split_primary_and_secondary_monitors(
    ref_win: &tauri::WebviewWindow,
) -> (Option<tauri::Monitor>, Vec<tauri::Monitor>) {
    let monitors = ref_win.available_monitors().unwrap_or_default();
    let primary = ref_win
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| {
            monitors
                .iter()
                .find(|m| m.position().x == 0 && m.position().y == 0)
                .cloned()
        })
        .or_else(|| monitors.first().cloned());

    let secondary = monitors
        .into_iter()
        .filter(|m| {
            if let Some(ref p) = primary {
                if m.position() == p.position() && m.size() == p.size() {
                    return false;
                }
                if let (Some(m_name), Some(p_name)) = (m.name(), p.name()) {
                    if m_name == p_name {
                        return false;
                    }
                }
            }
            true
        })
        .collect();

    (primary, secondary)
}

fn build_navbar_webview_window(
    app: &tauri::AppHandle,
    label: &str,
    url: &str,
    title: &str,
    init_script: &str,
) -> Result<tauri::WebviewWindow, tauri::Error> {
    let win = tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::App(url.into()))
        .title(title)
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
        .initialization_script(init_script)
        .additional_browser_args("--autoplay-policy=no-user-gesture-required")
        .build()?;

    if !NAVBAR_ENABLED.load(Ordering::SeqCst) {
        let _ = win.destroy();
        return Err(tauri::Error::WindowNotFound);
    }
    let _ = win.set_focusable(false);
    set_overlay_click_through(&win, true);
    #[cfg(windows)]
    let raw_hwnd_key: isize = win.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    #[cfg(not(windows))]
    let raw_hwnd_key: isize = 0;
    #[cfg(windows)]
    if let Ok(raw_hwnd) = win.hwnd() {
        let hwnd = HWND(raw_hwnd.0);
        remove_appbar_if_registered(hwnd);
        apply_navbar_exstyle(hwnd, false);
    }

    let nw = win.clone();
    let app_for_ev = app.clone();
    let label_for_ev = label.to_string();
    win.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            #[cfg(windows)]
            if let Ok(raw_hwnd) = nw.hwnd() {
                remove_appbar_if_registered(HWND(raw_hwnd.0));
            }
            popup_regions_map()
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&label_for_ev);
            crate::backdrop_blur::set_window_acrylic_hidden(&label_for_ev, true);
            let _ = nw.hide();
        }
        tauri::WindowEvent::Destroyed => {
            if raw_hwnd_key != 0 {
                if let Ok(mut map) = desired_click_through_map().lock() {
                    map.remove(&raw_hwnd_key);
                }
            }
        }
        tauri::WindowEvent::ScaleFactorChanged { .. } => {
            let _ = app_for_ev.emit_to(&label_for_ev, "navbar-request-sync-bounds", ());
        }
        _ => {}
    });

    Ok(win)
}

fn destroy_secondary_navbar_windows(app: &tauri::AppHandle) {
    for (label, win) in app.webview_windows() {
        if label.starts_with("navbar_secondary_") {
            #[cfg(windows)]
            if let Ok(raw_hwnd) = win.hwnd() {
                remove_appbar_if_registered(HWND(raw_hwnd.0));
            }
            crate::backdrop_blur::set_window_acrylic_hidden(&label, true);
            clear_window_nav_state(&label);
            let _ = win.hide();
            let _ = win.destroy();
        }
    }
}

pub fn sync_secondary_navbar_windows(app: &tauri::AppHandle, is_all: bool) {
    {
        let mut state = match SYNC_SEC_NAVBAR_QUEUE.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        state.1 = Some(is_all);
        if state.0 {
            return;
        }
        state.0 = true;
    }

    let app_handle = app.clone();
    std::thread::spawn(move || {
        struct SyncGuard;
        impl Drop for SyncGuard {
            fn drop(&mut self) {
                if let Ok(mut state) = SYNC_SEC_NAVBAR_QUEUE.lock() {
                    state.0 = false;
                }
            }
        }
        let _guard = SyncGuard;

        loop {
            let next_is_all = {
                let mut state = match SYNC_SEC_NAVBAR_QUEUE.lock() {
                    Ok(g) => g,
                    Err(p) => p.into_inner(),
                };
                match state.1.take() {
                    Some(val) => val,
                    None => {
                        state.0 = false;
                        return;
                    }
                }
            };
            sync_secondary_navbar_windows_inner(&app_handle, next_is_all);
        }
    });
}

fn sync_secondary_navbar_windows_inner(app: &tauri::AppHandle, is_all: bool) {
    if !is_all || !NAVBAR_ENABLED.load(Ordering::SeqCst) {
        destroy_secondary_navbar_windows(app);
        return;
    }

    let Some(main_nav) = app.get_webview_window("navbar") else {
        return;
    };

    let (_, secondary_monitors) = split_primary_and_secondary_monitors(&main_nav);
    if secondary_monitors.is_empty() {
        destroy_secondary_navbar_windows(app);
        return;
    }

    let sec_count = secondary_monitors.len();
    for (label, win) in app.webview_windows() {
        if label.starts_with("navbar_secondary_") {
            let invalid_idx = label
                .trim_start_matches("navbar_secondary_")
                .parse::<usize>()
                .map(|idx| idx == 0 || idx > sec_count)
                .unwrap_or(true);
            if invalid_idx {
                #[cfg(windows)]
                if let Ok(raw_hwnd) = win.hwnd() {
                    remove_appbar_if_registered(HWND(raw_hwnd.0));
                }
                crate::backdrop_blur::set_window_acrylic_hidden(&label, true);
                clear_window_nav_state(&label);
                let _ = win.hide();
                let _ = win.destroy();
            }
        }
    }

    for (i, _mon) in secondary_monitors.into_iter().enumerate() {
        if !NAVBAR_ENABLED.load(Ordering::SeqCst) {
            return;
        }
        let sec_idx = i + 1;
        let label = format!("navbar_secondary_{}", sec_idx);

        if let Some(sec_win) = app.get_webview_window(&label) {
            let _ = sec_win.show();
            let _ = sec_win.unminimize();
            let _ = sec_win.set_always_on_top(true);
            crate::backdrop_blur::set_window_acrylic_hidden(&label, false);
            crate::window_preview::reassert_overlay_zorder();
            set_window_last_rect(&label, (0, 0, 0, 0));
            let _ = app.emit_to(&label, "navbar-request-sync-bounds", ());
            #[cfg(windows)]
            if let Ok(raw_hwnd) = sec_win.hwnd() {
                let hwnd = HWND(raw_hwnd.0);
                remove_appbar_if_registered(hwnd);
                apply_navbar_exstyle(hwnd, false);
                unsafe {
                    let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                }
            }
        } else {
            let url = format!("index.html?window=navbar&monitor={}", sec_idx);
            let title = format!("Gili Secondary Navbar {}", sec_idx);
            let init_script = format!(
                "window.__IS_NAVBAR_WINDOW__ = true; window.__IS_SECONDARY_NAVBAR_WINDOW__ = true; window.__NAVBAR_SECONDARY_INDEX__ = {};",
                sec_idx
            );
            if let Err(e) = build_navbar_webview_window(app, &label, &url, &title, &init_script) {
                eprintln!("Failed to create secondary navbar window {}: {:?}", label, e);
            }
        }
    }
}

pub fn show_or_create_navbar_window(app: &tauri::AppHandle) {
    if !crate::store_license::can_use_taskbar() {
        hide_navbar_window(app);
        crate::taskbar_manager::set_taskbar_visible(true);
        return;
    }

    NAVBAR_LIFECYCLE_GEN.fetch_add(1, Ordering::SeqCst);
    NAVBAR_ENABLED.store(true, Ordering::SeqCst);
    start_navbar_cursor_watcher(app.clone());
    crate::window_preview::start_preview_prewarmer();

    let is_all = get_monitor_mode().eq_ignore_ascii_case("all");

    if let Some(w) = app.get_webview_window("navbar") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_always_on_top(true);
        crate::backdrop_blur::set_window_acrylic_hidden("navbar", false);
        crate::window_preview::reassert_overlay_zorder();
        set_window_last_rect("navbar", (0, 0, 0, 0));
        let _ = app.emit_to("navbar", "navbar-request-sync-bounds", ());
        #[cfg(windows)]
        if let Ok(raw_hwnd) = w.hwnd() {
            let hwnd = HWND(raw_hwnd.0);
            remove_appbar_if_registered(hwnd);
            apply_navbar_exstyle(hwnd, false);
            unsafe {
                let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            }
        }
        sync_secondary_navbar_windows(app, is_all);
        return;
    }

    // Prevent concurrent creation of duplicate navbar windows
    if NAVBAR_CREATING.swap(true, Ordering::SeqCst) {
        return;
    }

    let app_clone = app.clone();
    std::thread::spawn(move || {
        match build_navbar_webview_window(
            &app_clone,
            "navbar",
            "index.html?window=navbar",
            "Gili Navbar",
            "window.__IS_NAVBAR_WINDOW__ = true;",
        ) {
            Ok(_win) => {
                if get_monitor_mode().eq_ignore_ascii_case("all") {
                    sync_secondary_navbar_windows(&app_clone, true);
                }
            }
            Err(e) => {
                if !matches!(e, tauri::Error::WindowNotFound) {
                    eprintln!("Failed to create navbar window: {:?}", e);
                }
            }
        }
        NAVBAR_CREATING.store(false, Ordering::SeqCst);
    });
}

pub fn hide_navbar_window(app: &tauri::AppHandle) {
    let gen = NAVBAR_LIFECYCLE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    NAVBAR_ENABLED.store(false, Ordering::SeqCst);
    crate::window_preview::clear_window_previews();

    for (label, w) in app.webview_windows() {
        if !is_navbar_window_label(&label) {
            continue;
        }
        crate::backdrop_blur::set_window_acrylic_hidden(&label, true);
        clear_window_nav_state(&label);
        #[cfg(windows)]
        if let Ok(raw_hwnd) = w.hwnd() {
            remove_appbar_if_registered(HWND(raw_hwnd.0));
        }
        let _ = w.hide();
    }

    // Destroy on a brief background delay so an in-flight IPC call from NavbarApp finishes cleanly.
    let app_clone = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(40));
        if NAVBAR_LIFECYCLE_GEN.load(Ordering::SeqCst) != gen
            || NAVBAR_ENABLED.load(Ordering::SeqCst)
        {
            return;
        }
        for (label, win) in app_clone.webview_windows() {
            if is_navbar_window_label(&label) {
                let _ = win.destroy();
            }
        }
    });
}

#[tauri::command]
pub fn toggle_navbar(app: tauri::AppHandle, enabled: bool) {
    if enabled && crate::store_license::can_use_taskbar() {
        show_or_create_navbar_window(&app);
    } else {
        hide_navbar_window(&app);
        crate::taskbar_manager::set_taskbar_visible(true);
    }
}

#[tauri::command]
pub fn open_navbar_window(app: tauri::AppHandle) {
    if crate::store_license::can_use_taskbar() {
        show_or_create_navbar_window(&app);
    } else {
        hide_navbar_window(&app);
        crate::taskbar_manager::set_taskbar_visible(true);
    }
}

#[tauri::command]
pub fn close_navbar_window(app: tauri::AppHandle) {
    hide_navbar_window(&app);
    crate::taskbar_manager::set_taskbar_visible(true);
}

fn set_window_auto_hide_state(
    label: &str,
    auto_hide: bool,
    is_hidden: bool,
    auto_hide_enabled: Option<bool>,
) {
    let enabled = auto_hide_enabled.unwrap_or(auto_hide);
    {
        let mut map = hit_geoms().lock().unwrap_or_else(|e| e.into_inner());
        let g = map.entry(label.to_string()).or_default();
        g.auto_hide = auto_hide;
        g.auto_hide_enabled = enabled;
        g.is_dock_hidden = is_hidden;
    }
    request_overlap_recheck();
    crate::backdrop_blur::set_window_acrylic_hidden(label, auto_hide && is_hidden);
}

#[tauri::command]
pub fn set_navbar_ignore_cursor_events(window: tauri::WebviewWindow, ignore: bool) {
    set_overlay_click_through(&window, ignore);
}

#[tauri::command]
pub fn register_navbar_popup(
    window: tauri::WebviewWindow,
    id: String,
    rect: Option<PopupHitRect>,
) {
    popup_regions_map()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .entry(window.label().to_string())
        .or_default()
        .insert(id, rect);
}

#[tauri::command]
pub fn unregister_navbar_popup(window: tauri::WebviewWindow, id: String) {
    let mut map = popup_regions_map().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(win_map) = map.get_mut(window.label()) {
        win_map.remove(&id);
    }
}

#[tauri::command]
pub fn set_navbar_popup_open(window: tauri::WebviewWindow, open: bool) {
    let mut map = popup_regions_map().lock().unwrap_or_else(|e| e.into_inner());
    let win_map = map.entry(window.label().to_string()).or_default();
    if open {
        win_map.insert("__legacy__".to_string(), None);
    } else {
        win_map.remove("__legacy__");
    }
}

#[tauri::command]
pub fn set_navbar_backdrop_hidden(window: tauri::WebviewWindow, hidden: bool) {
    crate::backdrop_blur::set_window_acrylic_hidden(window.label(), hidden);
}

#[tauri::command]
pub fn set_navbar_auto_hide_state(
    window: tauri::WebviewWindow,
    auto_hide: bool,
    is_hidden: bool,
    auto_hide_enabled: Option<bool>,
) {
    set_window_auto_hide_state(window.label(), auto_hide, is_hidden, auto_hide_enabled);
}

#[tauri::command]
pub fn set_navbar_focusable(window: tauri::WebviewWindow, focusable: bool) {
    let _ = window.set_focusable(focusable);
    #[cfg(windows)]
    if let Ok(raw_hwnd) = window.hwnd() {
        let hwnd = HWND(raw_hwnd.0);
        apply_navbar_exstyle(hwnd, focusable);
        if focusable {
            let _ = window.set_focus();
        }
    }
}

#[tauri::command]
pub fn broadcast_navbar_config_update(app: tauri::AppHandle, config: serde_json::Value) {
    crate::taskbar_safety::sync_switches_from_navbar_config_value(&config);
    if let Some(mon_id) = config.get("monitorId").and_then(|v| v.as_str()) {
        let trimmed = mon_id.trim();
        if !trimmed.is_empty() {
            let prev = {
                let mut m = monitor_mode_lock().lock().unwrap_or_else(|e| e.into_inner());
                let old = m.clone();
                *m = trimmed.to_string();
                old
            };
            let is_all = trimmed.eq_ignore_ascii_case("all");
            if NAVBAR_ENABLED.load(Ordering::SeqCst) {
                sync_secondary_navbar_windows(&app, is_all);
                if !prev.eq_ignore_ascii_case(trimmed)
                    && crate::taskbar_manager::get_windows_taskbar_hidden()
                {
                    crate::taskbar_manager::refresh_taskbar_visibility();
                }
            }
        }
    }
    let _ = app.emit("navbar_config_updated", &config);
    let _ = app.emit("gili-navbar-config-sync", &config);
    for (label, _) in app.webview_windows() {
        if is_navbar_window_label(&label) {
            let _ = app.emit_to(&label, "navbar_config_updated", &config);
            let _ = app.emit_to(&label, "gili-navbar-config-sync", &config);
        }
    }
}

fn resolve_target_monitor_for_window(
    win: &tauri::WebviewWindow,
    monitor_id: Option<&str>,
) -> Option<tauri::Monitor> {
    let label = win.label();
    if label.starts_with("navbar_secondary_") {
        let sec_idx = label
            .trim_start_matches("navbar_secondary_")
            .parse::<usize>()
            .ok()
            .filter(|&n| n >= 1)?;
        let (_, secondary) = split_primary_and_secondary_monitors(win);
        return secondary.into_iter().nth(sec_idx - 1);
    }

    if let Some(target_id) = monitor_id {
        let trimmed = target_id.trim();
        if !trimmed.is_empty()
            && !trimmed.eq_ignore_ascii_case("primary")
            && !trimmed.eq_ignore_ascii_case("all")
        {
            if let Ok(monitors) = win.available_monitors() {
                for (idx, m) in monitors.iter().enumerate() {
                    let name = m.name().map(|s| s.as_str()).unwrap_or("");
                    let clean_m = name.trim_start_matches(r"\\.\");
                    let clean_t = trimmed.trim_start_matches(r"\\.\");
                    if name == trimmed
                        || clean_m.eq_ignore_ascii_case(clean_t)
                        || format!("monitor-{}", idx) == trimmed
                        || format!("DISPLAY{}", idx + 1) == trimmed
                        || name.ends_with(trimmed)
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
        .or_else(|| {
            win.available_monitors().ok().and_then(|mons| {
                mons.iter()
                    .find(|m| m.position().x == 0 && m.position().y == 0)
                    .cloned()
                    .or_else(|| mons.into_iter().next())
            })
        })
        .or_else(|| win.current_monitor().ok().flatten())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn sync_navbar_bounds(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    width: f64,
    height: f64,
    position: String,
    distance_from_edge: f64,
    is_anchored: Option<bool>,
    overhead: Option<f64>,
    extra_width: Option<f64>,
    monitor_id: Option<String>,
    style: Option<String>,
    opacity: Option<f64>,
    corner_radius: Option<f64>,
    is_light_surface: Option<bool>,
) {
    if !NAVBAR_ENABLED.load(Ordering::SeqCst) {
        return;
    }

    let label = window.label().to_string();
    let mut mode_changed = false;
    if label == "navbar" {
        let mode = monitor_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("all");
        let prev_mode = {
            let mut m = monitor_mode_lock().lock().unwrap_or_else(|e| e.into_inner());
            let prev = m.clone();
            *m = mode.to_string();
            prev
        };
        let is_all = mode.eq_ignore_ascii_case("all");
        let has_secondary = app
            .webview_windows()
            .keys()
            .any(|k| k.starts_with("navbar_secondary_"));
        mode_changed = !prev_mode.eq_ignore_ascii_case(mode);
        if mode_changed || (is_all && !has_secondary) || (!is_all && has_secondary) {
            sync_secondary_navbar_windows(&app, is_all);
        }
    }

    if let Some(monitor) = resolve_target_monitor_for_window(&window, monitor_id.as_deref()) {
        let scale_factor = monitor.scale_factor();
        let mon_pos = monitor.position();
        let mon_size = monitor.size();

        let mon_x = mon_pos.x as f64 / scale_factor;
        let mon_y = mon_pos.y as f64 / scale_factor;
        let mon_width = mon_size.width as f64 / scale_factor;
        let mon_height = mon_size.height as f64 / scale_factor;

        let overhead_space = overhead.unwrap_or(380.0);
        let _ = extra_width;
        let is_anchored_bool = is_anchored.unwrap_or(distance_from_edge == 0.0);
        let is_vertical = position == "left" || position == "right";
        let edge_reserve = 32.0f64;

        let (clamped_dock_w, clamped_dock_h, window_w, window_h, target_x, target_y) =
            if is_vertical {
                let dock_w = width.clamp(24.0, 120.0);
                let safe_h = height.clamp(80.0, mon_height);
                let total_w = (dock_w + edge_reserve + overhead_space).clamp(dock_w, mon_width);
                let total_h = mon_height;

                let x = if position == "left" {
                    mon_x
                } else {
                    mon_x + mon_width - total_w
                };
                let y = mon_y;
                (dock_w, safe_h, total_w, total_h, x, y)
            } else {
                let safe_w = width.clamp(80.0, mon_width);
                let dock_h = height.clamp(24.0, 110.0);
                let total_w = mon_width;
                let total_h =
                    (dock_h + edge_reserve + overhead_space).clamp(dock_h, mon_height);

                let x = mon_x;
                let y = if position == "top" {
                    mon_y
                } else {
                    mon_y + (mon_height - total_h).max(0.0)
                };
                (safe_w, dock_h, total_w, total_h, x, y)
            };

        let new_mon_rect = (
            mon_pos.x,
            mon_pos.y,
            mon_pos.x + mon_size.width as i32,
            mon_pos.y + mon_size.height as i32,
        );
        let (prev_mon_rect, geom_snapshot) = {
            let mut map = hit_geoms().lock().unwrap_or_else(|e| e.into_inner());
            let g = map.entry(label.clone()).or_default();
            let old_mon = g.mon_rect;
            g.dock_width = clamped_dock_w;
            g.dock_height = clamped_dock_h;
            g.position = position.clone();
            g.distance_from_edge = distance_from_edge;
            g.is_anchored = is_anchored_bool;
            g.scale_factor = scale_factor;
            g.mon_rect = new_mon_rect;
            (old_mon, g.clone())
        };

        let phys_w = if is_vertical {
            (window_w * scale_factor).round() as i32
        } else {
            mon_size.width as i32
        };
        let phys_h = if is_vertical {
            mon_size.height as i32
        } else {
            (window_h * scale_factor).round() as i32
        };
        let mon_right_phys = mon_pos.x + mon_size.width as i32;
        let mon_bottom_phys = mon_pos.y + mon_size.height as i32;
        let phys_x = match position.as_str() {
            "left" => mon_pos.x,
            "right" => mon_right_phys - phys_w,
            _ => mon_pos.x,
        };
        let phys_y = match position.as_str() {
            "top" => mon_pos.y,
            "bottom" => mon_bottom_phys - phys_h,
            _ => {
                let _ = (target_x, target_y);
                mon_pos.y
            }
        };

        #[cfg(windows)]
        if let Ok(raw_hwnd) = window.hwnd() {
            let hwnd = HWND(raw_hwnd.0);
            let mut need_move = true;
            if get_window_last_rect(&label) == (phys_x, phys_y, phys_w, phys_h)
                && window.is_visible().unwrap_or(false)
            {
                need_move = false;
            }
            if need_move {
                unsafe {
                    let target_center = POINT {
                        x: mon_pos.x + (mon_size.width as i32) / 2,
                        y: mon_pos.y + (mon_size.height as i32) / 2,
                    };
                    let cur_mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
                    let target_mon = MonitorFromPoint(target_center, MONITOR_DEFAULTTONEAREST);
                    if cur_mon != target_mon {
                        let _ = SetWindowPos(
                            hwnd,
                            HWND_TOPMOST,
                            mon_pos.x,
                            mon_pos.y,
                            phys_w,
                            phys_h,
                            SWP_NOACTIVATE | SWP_SHOWWINDOW,
                        );
                    }
                    let _ = SetWindowPos(
                        hwnd,
                        HWND_TOPMOST,
                        phys_x,
                        phys_y,
                        phys_w,
                        phys_h,
                        SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    );
                }
                crate::window_preview::reassert_overlay_zorder();
                set_window_last_rect(&label, (phys_x, phys_y, phys_w, phys_h));
                request_overlap_recheck();
            }
            remove_appbar_if_registered(hwnd);

            let dock_rect = compute_dock_visual_phys_rect(
                phys_x,
                phys_y,
                phys_x + phys_w,
                phys_y + phys_h,
                scale_factor,
                &geom_snapshot,
                false,
            );
            let is_liquid = style.as_deref() == Some("liquid");
            let _ = opacity;
            let is_light = is_light_surface.unwrap_or(false);
            let raw_radius = corner_radius.unwrap_or(15.0);
            let effective_radius_css = if is_anchored_bool {
                if raw_radius <= 1.0 {
                    0.0
                } else {
                    raw_radius.min(8.0)
                }
            } else {
                raw_radius
            };
            let radius_phys = (effective_radius_css * scale_factor).round() as i32;
            let backdrop_enabled = NAVBAR_ENABLED.load(Ordering::SeqCst)
                && !(geom_snapshot.auto_hide && geom_snapshot.is_dock_hidden);
            crate::window_backdrop::sync_navbar_backdrop(
                backdrop_enabled,
                is_liquid,
                is_light,
                raw_hwnd.0 as isize,
                dock_rect.left,
                dock_rect.top,
                (dock_rect.right - dock_rect.left).max(1),
                (dock_rect.bottom - dock_rect.top).max(1),
                radius_phys,
            );
            crate::backdrop_blur::keep_acrylic_below_window(&label, raw_hwnd.0 as isize);
        }

        if label == "navbar"
            && (mode_changed || prev_mon_rect != new_mon_rect)
            && crate::taskbar_manager::get_windows_taskbar_hidden()
        {
            crate::taskbar_manager::refresh_taskbar_visibility();
        }
    }
}

#[tauri::command]
pub fn get_desktop_luminance(window: tauri::WebviewWindow) -> f32 {
    let geom = get_window_hit_geom(window.label());
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
            (
                mi.rcMonitor.left,
                mi.rcMonitor.top,
                mi.rcMonitor.right,
                mi.rcMonitor.bottom,
            )
        };

        let sf = geom.scale_factor.max(1.0);
        let mon_w = (mon_right - mon_left).max(800);
        let mon_h = (mon_bottom - mon_top).max(600);
        let dock_w = ((geom.dock_width * sf).round() as i32).clamp(40, mon_w);
        let dock_h = ((geom.dock_height * sf).round() as i32).clamp(40, mon_h);
        let edge_dist = if geom.is_anchored {
            0
        } else {
            ((geom.distance_from_edge * sf).round() as i32).max(0)
        };
        // Sample STRICTLY outside the dock/backdrop bounds so the navbar never samples its own pixels (prevents white-lock loop).
        let margin_out = (16.0 * sf).round() as i32;
        let side_offsets = [(18.0 * sf).round() as i32, (48.0 * sf).round() as i32];

        let mut sample_points: Vec<(i32, i32)> = Vec::with_capacity(12);
        let clamp_x = |x: i32| x.clamp(mon_left + 1, mon_right - 2);
        let clamp_y = |y: i32| y.clamp(mon_top + 1, mon_bottom - 2);

        match geom.position.as_str() {
            "top" => {
                let cy = clamp_y(mon_top + edge_dist + dock_h / 2);
                let oy = clamp_y(mon_top + edge_dist + dock_h + margin_out);
                let cx = mon_left + mon_w / 2;
                let dock_left = cx - dock_w / 2;
                let dock_right = cx + dock_w / 2;
                for off in side_offsets {
                    if dock_left - off > mon_left + 2 {
                        sample_points.push((dock_left - off, cy));
                    }
                    if dock_right + off < mon_right - 2 {
                        sample_points.push((dock_right + off, cy));
                    }
                }
                for step in [-0.35, 0.0, 0.35] {
                    sample_points.push((clamp_x(cx + (dock_w as f32 * step) as i32), oy));
                }
            }
            "bottom" => {
                let cy = clamp_y(mon_bottom - edge_dist - dock_h / 2);
                let oy = clamp_y(mon_bottom - edge_dist - dock_h - margin_out);
                let cx = mon_left + mon_w / 2;
                let dock_left = cx - dock_w / 2;
                let dock_right = cx + dock_w / 2;
                for off in side_offsets {
                    if dock_left - off > mon_left + 2 {
                        sample_points.push((dock_left - off, cy));
                    }
                    if dock_right + off < mon_right - 2 {
                        sample_points.push((dock_right + off, cy));
                    }
                }
                for step in [-0.35, 0.0, 0.35] {
                    sample_points.push((clamp_x(cx + (dock_w as f32 * step) as i32), oy));
                }
            }
            "left" => {
                let cx = clamp_x(mon_left + edge_dist + dock_w / 2);
                let ox = clamp_x(mon_left + edge_dist + dock_w + margin_out);
                let cy = mon_top + mon_h / 2;
                let dock_top = cy - dock_h / 2;
                let dock_bottom = cy + dock_h / 2;
                for off in side_offsets {
                    if dock_top - off > mon_top + 2 {
                        sample_points.push((cx, dock_top - off));
                    }
                    if dock_bottom + off < mon_bottom - 2 {
                        sample_points.push((cx, dock_bottom + off));
                    }
                }
                for step in [-0.35, 0.0, 0.35] {
                    sample_points.push((ox, clamp_y(cy + (dock_h as f32 * step) as i32)));
                }
            }
            _ => {
                let cx = clamp_x(mon_right - edge_dist - dock_w / 2);
                let ox = clamp_x(mon_right - edge_dist - dock_w - margin_out);
                let cy = mon_top + mon_h / 2;
                let dock_top = cy - dock_h / 2;
                let dock_bottom = cy + dock_h / 2;
                for off in side_offsets {
                    if dock_top - off > mon_top + 2 {
                        sample_points.push((cx, dock_top - off));
                    }
                    if dock_bottom + off < mon_bottom - 2 {
                        sample_points.push((cx, dock_bottom + off));
                    }
                }
                for step in [-0.35, 0.0, 0.35] {
                    sample_points.push((ox, clamp_y(cy + (dock_h as f32 * step) as i32)));
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

#[tauri::command]
pub fn capture_window_thumbnail(hwnd: isize) -> Result<String, String> {
    crate::window_preview::capture_window_thumbnail(hwnd)
}

#[tauri::command]
pub fn close_window_by_hwnd(hwnd: isize) {
    use windows::Win32::Foundation::WPARAM;
    use windows::Win32::UI::WindowsAndMessaging::{
        PostMessageW, SC_CLOSE, WM_CLOSE, WM_SYSCOMMAND,
    };
    let target = HWND(hwnd as *mut _);
    unsafe {
        let _ = PostMessageW(target, WM_SYSCOMMAND, WPARAM(SC_CLOSE as usize), LPARAM(0));
        let _ = PostMessageW(target, WM_CLOSE, WPARAM(0), LPARAM(0));
    }
    request_overlap_recheck();
    crate::backdrop_blur::invalidate_all_backdrops();
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct RunningAppInfo {
    pub hwnd: isize,
    pub title: String,
    pub process_name: String,
    pub exe_path: String,
    pub is_active: bool,
    pub is_minimized: bool,
    pub icon_base64: Option<String>,
}

unsafe fn get_window_cloaked_flags(hwnd: HWND) -> u32 {
    let mut cloaked: u32 = 0;
    let _ = DwmGetWindowAttribute(
        hwnd,
        DWMWA_CLOAKED,
        &mut cloaked as *mut _ as *mut _,
        std::mem::size_of::<u32>() as u32,
    );
    cloaked
}

fn is_system_shell_class(class_name: &str) -> bool {
    matches!(
        class_name,
        "Shell_TrayWnd"
            | "Shell_SecondaryTrayWnd"
            | "Progman"
            | "WorkerW"
            | "Windows.UI.Core.CoreWindow"
            | "ApplicationManager_ImmersiveShellWindow"
            | "ImmersiveLauncher"
            | "ForegroundStaging"
            | "EdgeUiInputWndClass"
            | "EdgeUiInputTopWndClass"
            | "DummyDwmListenerWindow"
            | "PopupHost"
            | "Xaml_WindowedPopupClass"
            | "NarratorHelperWindow"
    )
}

fn is_system_shell_process(process_name: &str) -> bool {
    let lower = process_name.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "searchhost.exe"
            | "startmenuexperiencehost.exe"
            | "shellexperiencehost.exe"
            | "shellhost.exe"
            | "lockapp.exe"
            | "textinputhost.exe"
            | "ctfmon.exe"
            | "widgets.exe"
            | "widgetservice.exe"
            | "dwm.exe"
            | "sihost.exe"
            | "gili.exe"
    )
}

fn pid_image_cache() -> &'static Mutex<HashMap<u32, (String, String)>> {
    static CACHE: OnceLock<Mutex<HashMap<u32, (String, String)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

unsafe fn query_process_image(pid: u32) -> (String, String) {
    if pid == 0 {
        return (String::new(), String::new());
    }
    if let Some(cached) = pid_image_cache()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&pid)
        .cloned()
    {
        return cached;
    }
    let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
        return (String::new(), String::new());
    };
    let mut buf = [0u16; 1024];
    let mut len = buf.len() as u32;
    let mut full_path = String::new();
    let mut process_name = String::new();
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
    let result = (process_name, full_path);
    if !result.0.is_empty() {
        pid_image_cache()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(pid, result.clone());
    }
    result
}

fn uwp_frame_cache() -> &'static Mutex<HashMap<isize, (String, String)>> {
    static CACHE: OnceLock<Mutex<HashMap<isize, (String, String)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

unsafe fn resolve_uwp_application_frame(
    frame_hwnd: HWND,
    frame_pid: u32,
    is_frame_minimized: bool,
) -> Option<(String, String)> {
    use windows::Win32::UI::WindowsAndMessaging::FindWindowExW;
    let frame_key = frame_hwnd.0 as isize;
    let cached_fallback = || {
        if !is_frame_minimized {
            return None;
        }
        uwp_frame_cache()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(&frame_key)
            .cloned()
    };

    let core_hwnd = match FindWindowExW(
        frame_hwnd,
        HWND::default(),
        windows::core::w!("Windows.UI.Core.CoreWindow"),
        None,
    ) {
        Ok(h) if !h.0.is_null() => h,
        _ => return cached_fallback(),
    };

    let is_child_minimized = is_frame_minimized || IsIconic(core_hwnd).as_bool();
    let child_cloaked = get_window_cloaked_flags(core_hwnd);
    if (child_cloaked & 0x02) != 0 || (!is_child_minimized && child_cloaked != 0) {
        return cached_fallback();
    }

    let mut child_pid = 0u32;
    GetWindowThreadProcessId(core_hwnd, Some(&mut child_pid));
    if child_pid == 0 || child_pid == frame_pid {
        return cached_fallback();
    }

    let (proc_name, full_path) = query_process_image(child_pid);
    if proc_name.is_empty() {
        cached_fallback()
    } else {
        let resolved = (proc_name, full_path);
        uwp_frame_cache()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(frame_key, resolved.clone());
        Some(resolved)
    }
}

pub fn enumerate_running_windows(
    include_icons: bool,
    known_hwnds: Option<&[isize]>,
) -> Vec<RunningAppInfo> {
    struct EnumCtx<'a> {
        active_hwnd: HWND,
        windows: Vec<RunningAppInfo>,
        include_icons: bool,
        known_hwnds: &'a [isize],
        active_pids: std::collections::HashSet<u32>,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut EnumCtx<'_>);
        let is_minimized = IsIconic(hwnd).as_bool();

        // Real taskbar windows remain IsWindowVisible even when minimized; SW_HIDE tray windows do not
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        // Reject outer cloaked windows (other virtual desktops, suspended/prelaunched UWP shells)
        if get_window_cloaked_flags(hwnd) != 0 {
            return BOOL(1);
        }

        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if (ex_style & WS_EX_TOOLWINDOW.0) != 0 {
            return BOOL(1);
        }
        if (ex_style & WS_EX_NOACTIVATE.0) != 0 && (ex_style & WS_EX_APPWINDOW.0) == 0 {
            return BOOL(1);
        }
        if (ex_style & WS_EX_LAYERED.0) != 0 {
            let mut alpha = 255u8;
            let mut flags = Default::default();
            if GetLayeredWindowAttributes(hwnd, None, Some(&mut alpha), Some(&mut flags)).is_ok()
                && (flags & LWA_ALPHA).0 != 0
                && alpha == 0
            {
                return BOOL(1);
            }
        }
        if !GetWindow(hwnd, GW_OWNER).unwrap_or_default().0.is_null()
            && (ex_style & WS_EX_APPWINDOW.0) == 0
        {
            return BOOL(1);
        }

        if !is_minimized {
            let mut rect = RECT::default();
            let _ = GetWindowRect(hwnd, &mut rect);
            if (rect.right - rect.left) <= 32 || (rect.bottom - rect.top) <= 32 {
                return BOOL(1);
            }
        } else {
            let mut wp = WINDOWPLACEMENT {
                length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
                ..Default::default()
            };
            if GetWindowPlacement(hwnd, &mut wp).is_ok() {
                let nr = wp.rcNormalPosition;
                if (nr.right - nr.left) <= 32 || (nr.bottom - nr.top) <= 32 {
                    return BOOL(1);
                }
            }
        }

        let mut cls_buf = [0u16; 96];
        let clen = GetClassNameW(hwnd, &mut cls_buf);
        if clen > 0 {
            let class_name = String::from_utf16_lossy(&cls_buf[..clen as usize]);
            if is_system_shell_class(&class_name) {
                return BOOL(1);
            }
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
        ctx.active_pids.insert(pid);

        let (mut process_name, mut full_path) = query_process_image(pid);
        if process_name.eq_ignore_ascii_case("ApplicationFrameHost.exe") {
            let Some((child_proc, child_path)) =
                resolve_uwp_application_frame(hwnd, pid, is_minimized)
            else {
                return BOOL(1);
            };
            process_name = child_proc;
            full_path = child_path;
        }

        if process_name.is_empty() || is_system_shell_process(&process_name) {
            return BOOL(1);
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

        let is_active = hwnd == ctx.active_hwnd && !is_minimized;
        let hwnd_val = hwnd.0 as isize;
        let skip_icon = !ctx.include_icons || ctx.known_hwnds.contains(&hwnd_val);

        let icon_base64 = if skip_icon {
            None
        } else if !full_path.is_empty() {
            crate::windows_pinned_apps::get_cached_or_extract_icon(&full_path)
                .or_else(|| crate::windows_pinned_apps::extract_native_icon_from_hwnd(hwnd))
        } else {
            crate::windows_pinned_apps::extract_native_icon_from_hwnd(hwnd)
        };

        ctx.windows.push(RunningAppInfo {
            hwnd: hwnd_val,
            title,
            process_name,
            exe_path: full_path,
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
            include_icons,
            known_hwnds: known_hwnds.unwrap_or(&[]),
            active_pids: std::collections::HashSet::new(),
        };
        let _ = EnumWindows(
            Some(enum_proc),
            LPARAM(&mut ctx as *mut EnumCtx<'_> as isize),
        );
        let active_hwnds: std::collections::HashSet<isize> =
            ctx.windows.iter().map(|w| w.hwnd).collect();
        uwp_frame_cache()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .retain(|hwnd, _| active_hwnds.contains(hwnd));
        let mut pid_cache = pid_image_cache()
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if pid_cache.len() > 256 {
            pid_cache.retain(|pid, _| ctx.active_pids.contains(pid));
        }
        drop(pid_cache);
        ctx.windows
    }
}

#[tauri::command]
pub async fn get_running_windows(known_hwnds: Option<Vec<isize>>) -> Vec<RunningAppInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        enumerate_running_windows(true, known_hwnds.as_deref())
    })
    .await
    .unwrap_or_default()
}

fn activate_or_toggle_window_sync(hwnd: isize) {
    let target = HWND(hwnd as *mut _);
    unsafe {
        use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};

        let fg = GetForegroundWindow();
        let last_ext = LAST_EXTERNAL_FG_HWND.load(Ordering::Relaxed);
        let is_minimized = IsIconic(target).as_bool();
        let fg_is_other_trackable = is_trackable_fg_window(fg) && fg != target;

        if !is_minimized
            && (fg == target
                || (!fg_is_other_trackable
                    && (last_ext == hwnd
                        || (last_ext == 0 && is_topmost_visible_trackable_window(target)))))
        {
            crate::window_preview::capture_window_before_minimize(hwnd);
            let _ = ShowWindowAsync(target, SW_MINIMIZE);
            LAST_EXTERNAL_FG_HWND.store(0, Ordering::Relaxed);
            request_overlap_recheck();
            crate::backdrop_blur::invalidate_all_backdrops();
        } else {
            let fg_tid = GetWindowThreadProcessId(fg, None);
            let cur_tid = GetCurrentThreadId();
            let attached = if fg_tid != 0 && fg_tid != cur_tid {
                AttachThreadInput(cur_tid, fg_tid, true).as_bool()
            } else {
                false
            };

            if is_minimized {
                let _ = ShowWindowAsync(target, SW_RESTORE);
            }
            let _ = SetForegroundWindow(target);

            if attached {
                let _ = AttachThreadInput(cur_tid, fg_tid, false);
            }
            LAST_EXTERNAL_FG_HWND.store(hwnd, Ordering::Relaxed);
            request_overlap_recheck();
            crate::backdrop_blur::invalidate_all_backdrops();
        }
    }
}

fn toggle_hwnd_with_optional_dock_anchor(
    app: &tauri::AppHandle,
    hwnd: isize,
    anchor_rect: Option<crate::window_dock_anim::DockAnchorRect>,
) -> bool {
    let target = HWND(hwnd as *mut _);
    if hwnd == 0 || unsafe { !IsWindow(target).as_bool() || !IsWindowVisible(target).as_bool() } {
        return false;
    }
    let effective_anchor = anchor_rect.or_else(|| {
        crate::window_dock_anim::get_recent_dock_anchor(std::time::Duration::from_secs(12))
    });
    if effective_anchor.is_some() {
        crate::window_dock_anim::toggle_window_with_dock_animation(
            app,
            hwnd,
            effective_anchor,
            &LAST_EXTERNAL_FG_HWND,
            |fg, target| is_trackable_fg_window(fg) && fg != target,
            is_topmost_visible_trackable_window,
            || {
                request_overlap_recheck();
                crate::backdrop_blur::invalidate_all_backdrops();
            },
        );
    } else {
        activate_or_toggle_window_sync(hwnd);
    }
    true
}

pub(crate) fn activate_window_from_tray_fallback(app: &tauri::AppHandle, hwnd: isize) -> bool {
    toggle_hwnd_with_optional_dock_anchor(app, hwnd, None)
}

pub(crate) fn restore_hwnd_with_dock_anchor(
    app: &tauri::AppHandle,
    hwnd: isize,
    anchor_rect: Option<crate::window_dock_anim::DockAnchorRect>,
) {
    let effective_anchor = anchor_rect.or_else(|| {
        crate::window_dock_anim::get_recent_dock_anchor(std::time::Duration::from_secs(12))
    });
    crate::window_dock_anim::restore_window_with_dock_animation(
        app,
        hwnd,
        effective_anchor,
        &LAST_EXTERNAL_FG_HWND,
        || {
            request_overlap_recheck();
            crate::backdrop_blur::invalidate_all_backdrops();
        },
    );
}

#[tauri::command]
pub fn set_dock_action_anchor(anchor: crate::window_dock_anim::DockAnchorRect) {
    crate::window_dock_anim::record_last_dock_anchor(anchor);
}

#[tauri::command]
pub async fn activate_or_toggle_window(
    app: tauri::AppHandle,
    hwnd: isize,
    anchor_rect: Option<crate::window_dock_anim::DockAnchorRect>,
) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        toggle_hwnd_with_optional_dock_anchor(&app, hwnd, anchor_rect)
    })
    .await
    .unwrap_or(false)
}

#[tauri::command]
pub fn trigger_start_menu() {
    if crate::shell_surface_toggle::was_just_open(crate::shell_surface_toggle::Surface::Start) {
        return;
    }
    crate::shell_surface_toggle::record_surface_opened(crate::shell_surface_toggle::Surface::Start);
    unsafe {
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(
            VK_LWIN.0 as u8,
            0,
            KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
            0,
        );
    }
}


#[tauri::command]
pub fn trigger_windows_search() {
    if crate::shell_surface_toggle::was_just_open(crate::shell_surface_toggle::Surface::Search) {
        return;
    }
    crate::shell_surface_toggle::record_surface_opened(
        crate::shell_surface_toggle::Surface::Search,
    );
    unsafe {
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(b'S', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'S', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(
            VK_LWIN.0 as u8,
            0,
            KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
            0,
        );
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
        keybd_event(
            VK_LWIN.0 as u8,
            0,
            KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
            0,
        );
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
        keybd_event(
            VK_LWIN.0 as u8,
            0,
            KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
            0,
        );
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
        keybd_event(
            VK_LWIN.0 as u8,
            0,
            KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
            0,
        );
    }
}


#[tauri::command]
pub fn trigger_hidden_tray(
    window: tauri::WebviewWindow,
    anchor_rect: Option<crate::window_dock_anim::DockAnchorRect>,
    position: Option<String>,
) {
    let resolved = anchor_rect.as_ref().and_then(|rect| {
        crate::windows_tray_overflow::resolve_screen_anchor_from_window(&window, rect)
    });
    let pos = position.or_else(|| anchor_rect.and_then(|r| r.position));
    if let Some((screen_rect, sf)) = resolved {
        crate::windows_tray_overflow::toggle_native_system_tray_overflow(
            Some(screen_rect),
            sf,
            pos,
        );
    } else {
        let sf = window.scale_factor().ok().unwrap_or(1.0).max(1.0);
        crate::windows_tray_overflow::toggle_native_system_tray_overflow(None, sf, pos);
    }
}

#[tauri::command]
pub async fn trigger_file_explorer(
    app: tauri::AppHandle,
    anchor_rect: Option<crate::window_dock_anim::DockAnchorRect>,
) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        let running = enumerate_running_windows(false, None);
        if let Some(exp) = running
            .iter()
            .find(|w| w.process_name.eq_ignore_ascii_case("explorer.exe") && w.is_active)
            .or_else(|| {
                running
                    .iter()
                    .find(|w| w.process_name.eq_ignore_ascii_case("explorer.exe"))
            })
        {
            toggle_hwnd_with_optional_dock_anchor(&app, exp.hwnd, anchor_rect);
            return;
        }
        unsafe {
            keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
            keybd_event(b'E', 0, KEYBD_EVENT_FLAGS(0), 0);
            keybd_event(b'E', 0, KEYEVENTF_KEYUP, 0);
            keybd_event(
                VK_LWIN.0 as u8,
                0,
                KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
                0,
            );
        }
    })
    .await;
}

#[tauri::command]
pub async fn trigger_task_manager(
    app: tauri::AppHandle,
    anchor_rect: Option<crate::window_dock_anim::DockAnchorRect>,
) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        let running = enumerate_running_windows(false, None);
        if let Some(tm) = running
            .iter()
            .find(|w| w.process_name.eq_ignore_ascii_case("Taskmgr.exe"))
        {
            toggle_hwnd_with_optional_dock_anchor(&app, tm.hwnd, anchor_rect);
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
    })
    .await;
}

#[tauri::command]
pub async fn launch_target(
    app: tauri::AppHandle,
    target: String,
    anchor_rect: Option<crate::window_dock_anim::DockAnchorRect>,
) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        if target == "ms-settings:" {
            let running = enumerate_running_windows(false, None);
            if let Some(settings_win) = running.iter().find(|w| {
                w.process_name.eq_ignore_ascii_case("SystemSettings.exe")
                    && (w.is_minimized || w.is_active)
            }) {
                toggle_hwnd_with_optional_dock_anchor(&app, settings_win.hwnd, anchor_rect);
                return;
            }
        }
        crate::system_quick_state::open_windows_uri(&target);
    })
    .await;
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
                keybd_event(
                    VK_LWIN.0 as u8,
                    0,
                    KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
                    0,
                );
            }
            "task_view" => {
                // Win + Tab (0x09)
                keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
                keybd_event(0x09, 0, KEYBD_EVENT_FLAGS(0), 0);
                keybd_event(0x09, 0, KEYEVENTF_KEYUP, 0);
                keybd_event(
                    VK_LWIN.0 as u8,
                    0,
                    KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
                    0,
                );
            }
            _ => {
                // "next": Ctrl + Win + Right Arrow (0x27)
                keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
                keybd_event(VK_CONTROL.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
                keybd_event(0x27, 0, KEYEVENTF_EXTENDEDKEY, 0);
                keybd_event(0x27, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
                keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
                keybd_event(
                    VK_LWIN.0 as u8,
                    0,
                    KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
                    0,
                );
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
        keybd_event(
            VK_LWIN.0 as u8,
            0,
            KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
            0,
        );
    }
}


#[tauri::command]
pub fn check_navbar_window_overlap(window: tauri::WebviewWindow) -> bool {
    #[cfg(windows)]
    if let Ok(raw_hwnd) = window.hwnd() {
        let nav_hwnd = HWND(raw_hwnd.0);
        let nav_mon = unsafe { MonitorFromWindow(nav_hwnd, MONITOR_DEFAULTTONEAREST) };
        let geom = get_window_hit_geom(window.label());
        return is_any_window_covering_dock_for_geom(nav_hwnd, nav_mon, &geom);
    }
    false
}

#[cfg(test)]
mod preview_probe_tests {
    use super::*;

    #[test]
    fn test_probe_running_windows_thumbnails() {
        use windows::core::w;
        use windows::Win32::Foundation::{LRESULT, SIZE, WPARAM};
        use windows::Win32::Graphics::Dwm::{
            DwmQueryThumbnailSourceSize, DwmRegisterThumbnail, DwmUnregisterThumbnail,
        };
        use windows::Win32::Graphics::Gdi::{
            CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
            ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, HDC,
        };
        use windows::Win32::System::LibraryLoader::GetModuleHandleW;
        use windows::Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassW, CS_HREDRAW, CS_VREDRAW,
            WNDCLASSW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_POPUP,
        };

        extern "system" {
            fn PrintWindow(hwnd: HWND, hdcblt: HDC, nflags: u32) -> BOOL;
        }
        unsafe extern "system" fn probe_wnd_proc(
            hwnd: HWND,
            msg: u32,
            wparam: WPARAM,
            lparam: LPARAM,
        ) -> LRESULT {
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }

        unsafe {
            let hmod = GetModuleHandleW(None).unwrap_or_default();
            let cls = w!("GiliProbeDst");
            let wc = WNDCLASSW {
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(probe_wnd_proc),
                hInstance: hmod.into(),
                lpszClassName: cls,
                ..Default::default()
            };
            let _ = RegisterClassW(&wc);
            let dst = CreateWindowExW(
                WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                cls,
                w!(""),
                WS_POPUP,
                0,
                0,
                320,
                200,
                None,
                None,
                hmod,
                None,
            )
            .unwrap_or_default();

            let wins = enumerate_running_windows(true, None);
            println!("PROBE running windows count: {}", wins.len());
            for w in &wins {
                let target = HWND(w.hwnd as *mut _);
                let mut src_sz = SIZE::default();
                let mut thumb_id: isize = 0;
                let dwm_ok = if !dst.0.is_null() {
                    if let Ok(ht) = DwmRegisterThumbnail(dst, target) {
                        thumb_id = ht;
                        match DwmQueryThumbnailSourceSize(ht) {
                            Ok(sz) => {
                                src_sz = sz;
                                let _ = DwmUnregisterThumbnail(ht);
                                true
                            }
                            Err(_) => {
                                let _ = DwmUnregisterThumbnail(ht);
                                false
                            }
                        }
                    } else {
                        false
                    }
                } else {
                    false
                };

                let hdc_screen = GetDC(None);
                let hdc_mem = CreateCompatibleDC(hdc_screen);
                let hbm = CreateCompatibleBitmap(hdc_screen, 200, 140);
                let old = SelectObject(hdc_mem, hbm);
                let pw2 = PrintWindow(target, hdc_mem, 2).as_bool();
                SelectObject(hdc_mem, old);
                let mut bi = BITMAPINFO {
                    bmiHeader: BITMAPINFOHEADER {
                        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                        biWidth: 200,
                        biHeight: -140,
                        biPlanes: 1,
                        biBitCount: 32,
                        biCompression: 0,
                        ..Default::default()
                    },
                    ..Default::default()
                };
                let mut px = vec![0u8; 200 * 140 * 4];
                let lines = GetDIBits(
                    hdc_mem,
                    hbm,
                    0,
                    140,
                    Some(px.as_mut_ptr() as *mut _),
                    &mut bi,
                    DIB_RGB_COLORS,
                );
                let non_black =
                    lines > 0 && px.chunks_exact(4).any(|p| p[0] > 0 || p[1] > 0 || p[2] > 0);
                let _ = DeleteObject(hbm);
                let _ = DeleteDC(hdc_mem);
                ReleaseDC(None, hdc_screen);

                println!(
                    "  hwnd=0x{:X} proc='{}' title='{}' min={} active={} | dwm_ok={} dwm_sz={}x{} (id={}) | pw2={} pw2_nonblack={}",
                    w.hwnd, w.process_name, w.title, w.is_minimized, w.is_active,
                    dwm_ok, src_sz.cx, src_sz.cy, thumb_id, pw2, non_black
                );
            }
            if !dst.0.is_null() {
                let _ = DestroyWindow(dst);
            }
        }
    }

    #[test]
    fn test_autohide_normal_state_and_rect_overlap() {
        set_window_auto_hide_state("navbar", false, false, Some(true));
        let snap = get_window_hit_geom("navbar");
        assert!(!snap.auto_hide);
        assert!(snap.auto_hide_enabled);
        assert!(!snap.is_dock_hidden);

        let dock = RECT {
            left: 560,
            top: 1000,
            right: 1360,
            bottom: 1066,
        };
        let floating_above = RECT {
            left: 200,
            top: 100,
            right: 1000,
            bottom: 900,
        };
        let overlapping_bottom = RECT {
            left: 200,
            top: 200,
            right: 900,
            bottom: 1040,
        };
        let edge_touch_4px = RECT {
            left: 200,
            top: 200,
            right: 900,
            bottom: 1004,
        };
        let maximized_above_workarea = RECT {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 990,
        };

        assert!(!does_window_rect_cover_dock(&floating_above, 0, &dock));
        assert!(!does_window_rect_cover_dock(&edge_touch_4px, 0, &dock));
        assert!(does_window_rect_cover_dock(&overlapping_bottom, 0, &dock));
        assert!(does_window_rect_cover_dock(
            &maximized_above_workarea,
            0x0100_0000,
            &dock
        ));
    }

    #[test]
    fn test_hidden_dock_reveal_requires_edge_inside_dock_span() {
        let geom = NavbarHitGeometry {
            dock_width: 600.0,
            dock_height: 50.0,
            position: "bottom".to_string(),
            distance_from_edge: 14.0,
            is_anchored: false,
            auto_hide: true,
            auto_hide_enabled: true,
            is_dock_hidden: true,
            scale_factor: 1.0,
            mon_rect: (0, 0, 1920, 1080),
        };
        let win_pos = tauri::PhysicalPosition::new(0, 618);
        let win_size = tauri::PhysicalSize::new(1920, 462);
        let stale_popups = vec![Some(PopupHitRect {
            x: 660.0,
            y: 300.0,
            width: 300.0,
            height: 150.0,
        })];

        // Moving cursor down near bottom without reaching the 2px bezel strip must NOT reveal
        assert!(!calculate_navbar_hit(
            POINT { x: 960, y: 1068 },
            win_pos,
            win_size,
            1.0,
            &geom,
            &stale_popups,
        ));
        assert!(!calculate_navbar_hit(
            POINT { x: 960, y: 1077 },
            win_pos,
            win_size,
            1.0,
            &geom,
            &stale_popups,
        ));
        assert!(!calculate_navbar_hit(
            POINT { x: 960, y: 1077 },
            win_pos,
            win_size,
            1.5,
            &geom,
            &stale_popups,
        ));

        // Bottom corner or outside exact dock horizontal span (660..1260) must NOT reveal
        assert!(!calculate_navbar_hit(
            POINT { x: 100, y: 1079 },
            win_pos,
            win_size,
            1.0,
            &geom,
            &stale_popups,
        ));
        assert!(!calculate_navbar_hit(
            POINT { x: 655, y: 1079 },
            win_pos,
            win_size,
            1.0,
            &geom,
            &stale_popups,
        ));

        // Touching actual 2px bottom bezel strip inside dock span MUST reveal
        assert!(calculate_navbar_hit(
            POINT { x: 960, y: 1078 },
            win_pos,
            win_size,
            1.0,
            &geom,
            &[],
        ));
        assert!(calculate_navbar_hit(
            POINT { x: 960, y: 1079 },
            win_pos,
            win_size,
            1.5,
            &geom,
            &[],
        ));

        // Once revealed (is_dock_hidden = false), hovering the floating dock body keeps it active
        let mut shown = geom;
        shown.is_dock_hidden = false;
        assert!(calculate_navbar_hit(
            POINT { x: 960, y: 1035 },
            win_pos,
            win_size,
            1.0,
            &shown,
            &[],
        ));
    }
}
