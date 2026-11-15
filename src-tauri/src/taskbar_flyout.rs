use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WebviewWindowBuilder};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetForegroundWindow, GetWindowRect, SetForegroundWindow,
};

const FLYOUT_IDLE_DESTROY_SECS: u64 = 8;

static FLYOUT_OPEN: AtomicBool = AtomicBool::new(false);
static FLYOUT_CREATING: AtomicBool = AtomicBool::new(false);
static FLYOUT_IDLE_GEN: AtomicU64 = AtomicU64::new(0);
static ACTIVE_TARGET: Mutex<String> = Mutex::new(String::new());
static LAST_FG_HWND: AtomicIsize = AtomicIsize::new(0);
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static LAST_DISMISSED: Mutex<Option<(String, Instant, POINT)>> = Mutex::new(None);
static LAST_OPEN_CONTEXT: Mutex<Option<(Option<FlyoutTriggerRect>, String, Option<String>)>> =
    Mutex::new(None);

pub fn is_flyout_open() -> bool {
    FLYOUT_OPEN.load(Ordering::SeqCst)
}

fn cancel_flyout_idle_destroy() {
    FLYOUT_IDLE_GEN.fetch_add(1, Ordering::SeqCst);
}

fn schedule_flyout_idle_destroy() {
    let gen = FLYOUT_IDLE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(FLYOUT_IDLE_DESTROY_SECS));
        if FLYOUT_IDLE_GEN.load(Ordering::SeqCst) != gen || FLYOUT_OPEN.load(Ordering::SeqCst) {
            return;
        }
        if let Some(app) = APP_HANDLE.get() {
            if let Some(win) = app.get_webview_window("taskbar_flyout") {
                if !win.is_visible().unwrap_or(false) {
                    let _ = win.destroy();
                    crate::memory_optimizer::schedule_working_set_trim(800);
                }
            }
        }
    });
}

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
}

fn resolve_theme_str(theme_opt: Option<&str>) -> &'static str {
    let (hint_glass, _) = crate::window_backdrop::get_shared_theme_hint();
    let is_liquid = match theme_opt {
        Some(t) => t == "liquid",
        None => hint_glass,
    };
    if is_liquid { "liquid" } else { "solid" }
}

fn ensure_flyout_window_with_initial(
    app: &AppHandle,
    initial: Option<(&str, &str)>,
) -> Option<WebviewWindow> {
    if let Some(win) = app.get_webview_window("taskbar_flyout") {
        return Some(win);
    }

    let init_script = if let Some((target, theme)) = initial {
        let escaped_target = target.replace('\'', "\\'");
        let escaped_theme = theme.replace('\'', "\\'");
        format!(
            "window.__IS_TASKBAR_FLYOUT_WINDOW__ = true; window.__PENDING_TASKBAR_FLYOUT__ = {{ target: '{}', theme: '{}' }};",
            escaped_target, escaped_theme
        )
    } else {
        "window.__IS_TASKBAR_FLYOUT_WINDOW__ = true;".to_string()
    };

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
    .minimizable(false)
    .maximizable(false)
    .closable(false)
    .focused(false)
    .visible(false)
    .initialization_script(&init_script)
    .additional_browser_args(
        "--autoplay-policy=no-user-gesture-required --process-per-site --renderer-process-limit=1 --force-gpu-mem-available-mb=32 --gpu-program-cache-size-kb=2048 --disable-gpu-shader-disk-cache --js-flags=--max-old-space-size=64",
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
                        schedule_flyout_idle_destroy();
                    }
                    _ => {}
                }
            });
            #[cfg(windows)]
            if let Ok(raw_hwnd) = win.hwnd() {
                let hwnd = HWND(raw_hwnd.0);
                unsafe {
                    use windows::Win32::UI::WindowsAndMessaging::{
                        GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
                    };
                    let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
                    let new_ex = ex | WS_EX_TOOLWINDOW.0;
                    if new_ex != ex {
                        let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex as i32);
                    }
                }
                let (is_glass, is_light) = crate::window_backdrop::get_shared_theme_hint();
                crate::window_backdrop::apply_flyout_backdrop(hwnd, is_glass, is_light);
            }
            Some(win)
        }
        Err(e) => {
            eprintln!("[Gili Flyout] Error building window: {:?}", e);
            None
        }
    }
}

/// Ensures the dedicated flyout window exists (hidden initially).
pub fn ensure_flyout_window(app: &AppHandle) -> Option<WebviewWindow> {
    ensure_flyout_window_with_initial(app, None)
}

pub fn get_flyout_dimensions_for_target(target: &str) -> (f64, f64) {
    match target {
        "start" => (600.0, 640.0),                 // Board 87/91
        "search" => (740.0, 700.0),                // Board 88/92
        "tray" => (260.0, 300.0),                  // Board 89/93
        "quickSettings" | "quicksettings" => {
            let has_media = !crate::media_lyrics_store::get_current_media()
                .title
                .trim()
                .is_empty();
            (400.0, if has_media { 548.0 } else { 374.0 })
        }
        "volume" => (400.0, 540.0),                // Board 95/97
        "notificationsCalendar" => (392.0, 616.0), // Board 96/98
        _ => (400.0, 500.0),
    }
}

fn resolve_navbar_anchor_for_target(
    app: &AppHandle,
    target: &str,
) -> (Option<FlyoutTriggerRect>, Option<String>) {
    let Some(navbar_win) = app.get_webview_window("navbar") else {
        return (None, None);
    };
    let n_scale = navbar_win.scale_factor().unwrap_or(1.0);
    let Ok(raw_hwnd) = navbar_win.hwnd() else {
        return (None, None);
    };
    let mut r = RECT::default();
    if unsafe { GetWindowRect(HWND(raw_hwnd.0), &mut r).is_err() } {
        return (None, None);
    }
    if r.right <= r.left || r.bottom <= r.top || r.left <= -5000 || r.top <= -5000 {
        return (None, None);
    }

    let nav_w = (r.right - r.left) as f64 / n_scale;
    let nav_h = (r.bottom - r.top) as f64 / n_scale;

    let geom = crate::navbar_window::get_navbar_dock_geometry();
    let pos_str = if geom.position.is_empty() {
        "bottom".to_string()
    } else {
        geom.position.clone()
    };
    let is_horizontal = pos_str != "left" && pos_str != "right";
    let dock_w = geom.dock_width.clamp(80.0, nav_w);
    let dock_h = geom.dock_height.clamp(36.0, nav_h);
    let edge_dist = if geom.is_anchored {
        0.0
    } else {
        geom.distance_from_edge.max(0.0)
    };

    let (pill_x, pill_y) = match pos_str.as_str() {
        "top" => (((nav_w - dock_w) / 2.0).max(0.0), edge_dist),
        "left" => (edge_dist, ((nav_h - dock_h) / 2.0).max(0.0)),
        "right" => (
            (nav_w - edge_dist - dock_w).max(0.0),
            ((nav_h - dock_h) / 2.0).max(0.0),
        ),
        _ => (
            ((nav_w - dock_w) / 2.0).max(0.0),
            (nav_h - edge_dist - dock_h).max(0.0),
        ),
    };

    let trigger_rect = if is_horizontal {
        match target {
            "start" => Some(FlyoutTriggerRect {
                x: pill_x + 14.0,
                y: pill_y,
                width: 36.0,
                height: dock_h,
            }),
            "search" => Some(FlyoutTriggerRect {
                x: pill_x + 52.0,
                y: pill_y,
                width: 36.0,
                height: dock_h,
            }),
            "quickSettings" | "quicksettings" | "volume" => Some(FlyoutTriggerRect {
                x: pill_x + (dock_w - 130.0).max(0.0),
                y: pill_y,
                width: 70.0,
                height: dock_h,
            }),
            "notificationsCalendar" => Some(FlyoutTriggerRect {
                x: pill_x + (dock_w - 56.0).max(0.0),
                y: pill_y,
                width: 48.0,
                height: dock_h,
            }),
            _ => None,
        }
    } else {
        match target {
            "start" => Some(FlyoutTriggerRect {
                x: pill_x,
                y: pill_y + 14.0,
                width: dock_w,
                height: 36.0,
            }),
            "search" => Some(FlyoutTriggerRect {
                x: pill_x,
                y: pill_y + 52.0,
                width: dock_w,
                height: 36.0,
            }),
            "quickSettings" | "quicksettings" | "volume" => Some(FlyoutTriggerRect {
                x: pill_x,
                y: pill_y + (dock_h - 130.0).max(0.0),
                width: dock_w,
                height: 70.0,
            }),
            "notificationsCalendar" => Some(FlyoutTriggerRect {
                x: pill_x,
                y: pill_y + (dock_h - 56.0).max(0.0),
                width: dock_w,
                height: 48.0,
            }),
            _ => None,
        }
    };

    (trigger_rect, Some(pos_str))
}

pub fn open_taskbar_flyout_by_target(target: &str) {
    if let Some(app) = APP_HANDLE.get() {
        let (trigger_rect, dock_pos) = resolve_navbar_anchor_for_target(app, target);
        open_taskbar_flyout_internal(app, target, trigger_rect, dock_pos, None);
    }
}

fn apply_target_to_flyout_window(
    app: &AppHandle,
    win: &WebviewWindow,
    target: &str,
    trigger_rect: Option<&FlyoutTriggerRect>,
    pos_str: &str,
    theme_opt: Option<&str>,
    action_log: &str,
) {
    let (desired_w, desired_h) = get_flyout_dimensions_for_target(target);
    let scale_factor = win.scale_factor().unwrap_or(1.0);
    let (target_x, target_y) =
        calculate_anchored_position(win, pos_str, desired_w, desired_h, trigger_rect, scale_factor);

    let (hint_glass, hint_light) = crate::window_backdrop::get_shared_theme_hint();
    let is_liquid = match theme_opt {
        Some(t) => t == "liquid",
        None => hint_glass,
    };
    let theme_str = if is_liquid { "liquid" } else { "solid" };

    #[cfg(windows)]
    if let Ok(raw_hwnd) = win.hwnd() {
        crate::window_backdrop::apply_flyout_backdrop(HWND(raw_hwnd.0), is_liquid, hint_light);
    }

    let escaped_target = target.replace('\'', "\\'");
    let escaped_theme = theme_str.replace('\'', "\\'");

    // Synchronously set webview state BEFORE show/resize so there is zero view flash
    cancel_flyout_idle_destroy();
    FLYOUT_OPEN.store(true, Ordering::SeqCst);
    *ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()) = target.to_string();

    let _ = win.eval(&format!(
        "window.__PENDING_TASKBAR_FLYOUT__ = {{ target: '{}', theme: '{}' }}; if (typeof window.__setTaskbarFlyoutState === 'function') {{ window.__setTaskbarFlyoutState('{}', '{}'); }} window.focus();",
        escaped_target, escaped_theme, escaped_target, escaped_theme
    ));

    let _ = win.set_size(tauri::LogicalSize::new(desired_w, desired_h));
    let _ = win.set_position(tauri::LogicalPosition::new(target_x, target_y));
    let _ = win.show();
    #[cfg(windows)]
    if let Ok(raw_hwnd) = win.hwnd() {
        unsafe {
            use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
            use windows::Win32::UI::WindowsAndMessaging::{
                BringWindowToTop, GetWindowThreadProcessId,
            };
            let target_hwnd = HWND(raw_hwnd.0);
            let fg = GetForegroundWindow();
            let fg_tid = GetWindowThreadProcessId(fg, None);
            let cur_tid = GetCurrentThreadId();
            let attached = if fg_tid != 0 && fg_tid != cur_tid {
                AttachThreadInput(cur_tid, fg_tid, true).as_bool()
            } else {
                false
            };
            let _ = BringWindowToTop(target_hwnd);
            let _ = SetForegroundWindow(target_hwnd);
            if attached {
                let _ = AttachThreadInput(cur_tid, fg_tid, false);
            }
        }
    }
    let _ = win.set_focus();
    let win_focus_followup = win.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(30));
        if FLYOUT_OPEN.load(Ordering::SeqCst) {
            let _ = win_focus_followup.set_focus();
            let _ = win_focus_followup.eval("window.focus();");
        }
    });

    let state_payload = serde_json::json!({
        "isOpen": true,
        "target": target,
        "theme": theme_str,
        "width": desired_w,
        "height": desired_h
    });

    let _ = win.emit("taskbar-flyout-state-changed", state_payload.clone());
    let _ = app.emit("taskbar-flyout-state-changed", state_payload);

    crate::taskbar_logger::log_taskbar_event(
        target,
        action_log,
        "ok",
        Some(serde_json::json!({
            "x": target_x,
            "y": target_y,
            "w": desired_w,
            "h": desired_h,
            "theme": theme_str
        })),
    );
}

fn spawn_lazy_flyout_and_apply(app: &AppHandle, target: &str, theme_str: &str, action_log: &'static str) {
    if FLYOUT_CREATING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    struct CreatingResetGuard;
    impl Drop for CreatingResetGuard {
        fn drop(&mut self) {
            FLYOUT_CREATING.store(false, Ordering::SeqCst);
        }
    }

    let app_clone = app.clone();
    let init_target = target.to_string();
    let init_theme = theme_str.to_string();
    std::thread::spawn(move || {
        let _guard = CreatingResetGuard;
        let Some(win) = ensure_flyout_window_with_initial(
            &app_clone,
            Some((&init_target, &init_theme)),
        ) else {
            FLYOUT_OPEN.store(false, Ordering::SeqCst);
            return;
        };

        if !FLYOUT_OPEN.load(Ordering::SeqCst) {
            schedule_flyout_idle_destroy();
            return;
        }

        let latest_target = ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let target_to_apply = if latest_target.is_empty() {
            init_target
        } else {
            latest_target
        };
        let (trigger_rect, pos_str, theme_opt) = LAST_OPEN_CONTEXT
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            .unwrap_or((None, "bottom".to_string(), None));

        apply_target_to_flyout_window(
            &app_clone,
            &win,
            &target_to_apply,
            trigger_rect.as_ref(),
            &pos_str,
            theme_opt.as_deref(),
            action_log,
        );
    });
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
        let current = ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if current == target {
            hide_taskbar_flyout();
            return;
        }
    }
    *LAST_DISMISSED.lock().unwrap_or_else(|e| e.into_inner()) = None;
    cancel_flyout_idle_destroy();

    let pos_str = dock_position.unwrap_or_else(|| "bottom".into());
    *LAST_OPEN_CONTEXT.lock().unwrap_or_else(|e| e.into_inner()) =
        Some((trigger_rect.clone(), pos_str.clone(), theme_opt.clone()));

    if let Some(win) = app.get_webview_window("taskbar_flyout") {
        // Save previous external foreground window
        unsafe {
            let fg = GetForegroundWindow();
            if let Ok(raw_hwnd) = win.hwnd() {
                if fg.0 != raw_hwnd.0 {
                    LAST_FG_HWND.store(fg.0 as isize, Ordering::SeqCst);
                }
            }
        }

        apply_target_to_flyout_window(
            app,
            &win,
            target,
            trigger_rect.as_ref(),
            &pos_str,
            theme_opt.as_deref(),
            "open_flyout",
        );
        return;
    }

    unsafe {
        let fg = GetForegroundWindow();
        LAST_FG_HWND.store(fg.0 as isize, Ordering::SeqCst);
    }
    FLYOUT_OPEN.store(true, Ordering::SeqCst);
    *ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()) = target.to_string();

    let theme_str = resolve_theme_str(theme_opt.as_deref());
    spawn_lazy_flyout_and_apply(app, target, theme_str, "open_flyout");
}

#[tauri::command]
pub fn get_taskbar_flyout_state() -> serde_json::Value {
    let current_target = ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let is_open = FLYOUT_OPEN.load(Ordering::SeqCst);
    serde_json::json!({
        "isOpen": is_open,
        "target": if current_target.is_empty() { "volume".to_string() } else { current_target },
    })
}

fn calculate_anchored_position(
    win: &WebviewWindow,
    pos: &str,
    width: f64,
    height: f64,
    trigger: Option<&FlyoutTriggerRect>,
    scale_factor: f64,
) -> (f64, f64) {
    let margin = 12.0;

    // Resolve navbar window's screen position using navbar's own monitor scale
    let (nav_x, nav_y, nav_scale) =
        if let Some(navbar_win) = win.app_handle().get_webview_window("navbar") {
            let n_scale = navbar_win.scale_factor().unwrap_or(scale_factor);
            if let Ok(raw_hwnd) = navbar_win.hwnd() {
                let hwnd = HWND(raw_hwnd.0);
                let mut r = RECT::default();
                if unsafe { GetWindowRect(hwnd, &mut r).is_ok() } {
                    (r.left as f64 / n_scale, r.top as f64 / n_scale, n_scale)
                } else {
                    let p = navbar_win.outer_position().unwrap_or_default();
                    (p.x as f64 / n_scale, p.y as f64 / n_scale, n_scale)
                }
            } else {
                let p = navbar_win.outer_position().unwrap_or_default();
                (p.x as f64 / n_scale, p.y as f64 / n_scale, n_scale)
            }
        } else {
            (0.0, 0.0, scale_factor)
        };

    let (trig_x, trig_y, trig_w, trig_h) = if let Some(t) = trigger {
        (nav_x + t.x, nav_y + t.y, t.width, t.height)
    } else {
        (nav_x, nav_y, 40.0, 40.0)
    };

    let point = POINT {
        x: ((trig_x + trig_w / 2.0) * nav_scale) as i32,
        y: ((trig_y + trig_h / 2.0) * nav_scale) as i32,
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
            let initial_y = if trigger.is_some() {
                trig_y + trig_h + margin
            } else {
                work_top + margin
            };
            let initial_x = if trigger.is_some() {
                trig_x + (trig_w - width) / 2.0
            } else {
                (work_left + work_right - width) / 2.0
            };
            (initial_x, initial_y)
        }
        "left" => {
            let initial_x = if trigger.is_some() {
                trig_x + trig_w + margin
            } else {
                work_left + margin
            };
            let initial_y = if trigger.is_some() {
                trig_y + (trig_h - height) / 2.0
            } else {
                (work_top + work_bottom - height) / 2.0
            };
            (initial_x, initial_y)
        }
        "right" => {
            let initial_x = if trigger.is_some() {
                trig_x - width - margin
            } else {
                work_right - width - margin
            };
            let initial_y = if trigger.is_some() {
                trig_y + (trig_h - height) / 2.0
            } else {
                (work_top + work_bottom - height) / 2.0
            };
            (initial_x, initial_y)
        }
        _ => {
            // "bottom"
            let initial_y = if trigger.is_some() {
                trig_y - height - margin
            } else {
                work_bottom - height - margin
            };
            let initial_x = if trigger.is_some() {
                trig_x + (trig_w - width) / 2.0
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
        let mut lock = ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner());
        let prev = lock.clone();
        lock.clear();
        prev
    };

    let mut dismiss_pt = POINT { x: 0, y: 0 };
    unsafe {
        let _ = GetCursorPos(&mut dismiss_pt);
    }
    if !target.is_empty() {
        *LAST_DISMISSED.lock().unwrap_or_else(|e| e.into_inner()) =
            Some((target.clone(), Instant::now(), dismiss_pt));
    }

    let mut flyout_hwnd_raw: isize = 0;
    if let Some(app) = APP_HANDLE.get() {
        if let Some(win) = app.get_webview_window("taskbar_flyout") {
            if let Ok(h) = win.hwnd() {
                flyout_hwnd_raw = h.0 as isize;
            }
            let _ = win.eval("delete window.__PENDING_TASKBAR_FLYOUT__; if (window.__resetTaskbarFlyoutState) { window.__resetTaskbarFlyoutState(); }");
            let _ = win.hide();
            let _ = win.emit(
                "taskbar-flyout-state-changed",
                serde_json::json!({ "isOpen": false, "target": target }),
            );
        }
        let _ = app.emit(
            "taskbar-flyout-state-changed",
            serde_json::json!({ "isOpen": false, "target": target }),
        );
    }

    schedule_flyout_idle_destroy();

    // Restore focus only if focus stayed on the now-hidden flyout or nowhere (don't steal from a newly clicked window)
    let prev_hwnd = LAST_FG_HWND.swap(0, Ordering::SeqCst);
    if prev_hwnd != 0 {
        unsafe {
            let fg = GetForegroundWindow();
            if fg.0.is_null() || (flyout_hwnd_raw != 0 && fg.0 as isize == flyout_hwnd_raw) {
                let _ = SetForegroundWindow(HWND(prev_hwnd as *mut _));
            }
        }
    }

    crate::taskbar_logger::log_taskbar_event(&target, "close_flyout", "ok", None);
}

#[tauri::command]
pub fn toggle_taskbar_flyout(app: AppHandle, payload: FlyoutOpenPayload) {
    if FLYOUT_OPEN.load(Ordering::SeqCst) {
        let current = ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if current == payload.target {
            hide_taskbar_flyout();
            return;
        }
    } else {
        let mut ld = LAST_DISMISSED.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((prev_target, dismissed_at, dismiss_pt)) = ld.take() {
            let mut now_pt = POINT { x: 0, y: 0 };
            unsafe {
                let _ = GetCursorPos(&mut now_pt);
            }
            let same_spot =
                (now_pt.x - dismiss_pt.x).abs() <= 40 && (now_pt.y - dismiss_pt.y).abs() <= 40;
            if prev_target == payload.target && dismissed_at.elapsed().as_millis() < 1200 && same_spot
            {
                return;
            }
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
pub fn switch_taskbar_flyout_target(app: AppHandle, target: String) {
    cancel_flyout_idle_destroy();
    let (trigger_rect, pos_str, theme_opt) = LAST_OPEN_CONTEXT
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .unwrap_or((None, "bottom".to_string(), None));

    if let Some(win) = app.get_webview_window("taskbar_flyout") {
        apply_target_to_flyout_window(
            &app,
            &win,
            &target,
            trigger_rect.as_ref(),
            &pos_str,
            theme_opt.as_deref(),
            "switch_flyout_target",
        );
        return;
    }

    FLYOUT_OPEN.store(true, Ordering::SeqCst);
    *ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()) = target.clone();
    let theme_str = resolve_theme_str(theme_opt.as_deref());
    spawn_lazy_flyout_and_apply(&app, &target, theme_str, "switch_flyout_target");
}

#[tauri::command]
pub fn resize_taskbar_flyout(app: AppHandle, height: f64) {
    if !FLYOUT_OPEN.load(Ordering::SeqCst) {
        return;
    }
    let Some(win) = app.get_webview_window("taskbar_flyout") else {
        return;
    };
    let active_target = ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()).clone();
    if active_target.is_empty() {
        return;
    }

    let (desired_w, default_h) = get_flyout_dimensions_for_target(&active_target);
    let desired_h = if height.is_finite() {
        height.clamp(160.0, 760.0).round()
    } else {
        default_h
    };
    let scale_factor = win.scale_factor().unwrap_or(1.0);
    let current_h = win
        .inner_size()
        .map(|s| s.height as f64 / scale_factor)
        .unwrap_or(desired_h);

    if (current_h - desired_h).abs() < 1.5 {
        return;
    }

    let (trigger_rect, pos_str, _) = LAST_OPEN_CONTEXT
        .lock()
        .unwrap()
        .clone()
        .unwrap_or((None, "bottom".to_string(), None));

    let (target_x, target_y) = calculate_anchored_position(
        &win,
        &pos_str,
        desired_w,
        desired_h,
        trigger_rect.as_ref(),
        scale_factor,
    );

    // Move first when growing so bottom-anchored flyouts don't momentarily push over the dock
    if desired_h > current_h {
        let _ = win.set_position(tauri::LogicalPosition::new(target_x, target_y));
        let _ = win.set_size(tauri::LogicalSize::new(desired_w, desired_h));
    } else {
        let _ = win.set_size(tauri::LogicalSize::new(desired_w, desired_h));
        let _ = win.set_position(tauri::LogicalPosition::new(target_x, target_y));
    }
}

#[tauri::command]
pub fn close_taskbar_flyout() {
    hide_taskbar_flyout();
}

#[tauri::command]
pub fn is_taskbar_flyout_open() -> bool {
    FLYOUT_OPEN.load(Ordering::SeqCst)
}
