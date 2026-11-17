use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WebviewWindowBuilder};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetForegroundWindow, GetWindowRect, IsChild, SetForegroundWindow,
};

static FLYOUT_OPEN: AtomicBool = AtomicBool::new(false);
static FLYOUT_READY: AtomicBool = AtomicBool::new(false);
static FLYOUT_CREATING: AtomicBool = AtomicBool::new(false);
static FLYOUT_OPEN_GEN: AtomicU64 = AtomicU64::new(0);
static FLYOUT_OPENED_AT_MS: AtomicU64 = AtomicU64::new(0);
static FLYOUT_OPEN_SEQ: AtomicU64 = AtomicU64::new(0);
static FLYOUT_BUILD_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static ACTIVE_TARGET: Mutex<String> = Mutex::new(String::new());
static LAST_FG_HWND: AtomicIsize = AtomicIsize::new(0);
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static LAST_DISMISSED: Mutex<Option<(String, Instant, POINT)>> = Mutex::new(None);
static LAST_OPEN_CONTEXT: Mutex<Option<(Option<FlyoutTriggerRect>, String, Option<String>)>> =
    Mutex::new(None);

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn is_flyout_open() -> bool {
    FLYOUT_OPEN.load(Ordering::SeqCst)
}

fn cancel_flyout_idle_destroy() {}

fn schedule_flyout_idle_destroy() {}

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

fn set_flyout_click_through(win: &WebviewWindow, ignore: bool) {
    #[cfg(windows)]
    if let Ok(raw_hwnd) = win.hwnd() {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
        };
        let hwnd = HWND(raw_hwnd.0);
        unsafe {
            let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            let new_ex = if ignore {
                ex | WS_EX_TOOLWINDOW.0 | WS_EX_TRANSPARENT.0
            } else {
                (ex | WS_EX_TOOLWINDOW.0) & !WS_EX_TRANSPARENT.0
            };
            if new_ex != ex {
                let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex as i32);
            }
        }
    }
    let _ = win.set_ignore_cursor_events(ignore);
}

pub fn init_flyout_manager(app: &AppHandle) {
    let _ = APP_HANDLE.set(app.clone());
    crate::shell_surface_toggle::ensure_watcher();
    let app_clone = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(200));
        if app_clone.get_webview_window("taskbar_flyout").is_none() {
            let _ = ensure_flyout_window_with_initial(&app_clone, None);
        }
    });
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
    let _build_guard = FLYOUT_BUILD_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    if let Some(win) = app.get_webview_window("taskbar_flyout") {
        return Some(win);
    }

    FLYOUT_READY.store(false, Ordering::SeqCst);

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
    .additional_browser_args("--autoplay-policy=no-user-gesture-required")
    .build()
    {
        Ok(win) => {
            let win_for_events = win.clone();
            win.on_window_event(move |event| match event {
                tauri::WindowEvent::Focused(false) => {
                    if !FLYOUT_OPEN.load(Ordering::SeqCst) || !FLYOUT_READY.load(Ordering::SeqCst) {
                        return;
                    }
                    if now_epoch_ms().saturating_sub(FLYOUT_OPENED_AT_MS.load(Ordering::SeqCst))
                        < 550
                    {
                        return;
                    }
                    let open_gen = FLYOUT_OPEN_GEN.load(Ordering::SeqCst);
                    let win_clone = win_for_events.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(65));
                        if FLYOUT_OPEN_GEN.load(Ordering::SeqCst) != open_gen
                            || !FLYOUT_OPEN.load(Ordering::SeqCst)
                            || now_epoch_ms()
                                .saturating_sub(FLYOUT_OPENED_AT_MS.load(Ordering::SeqCst))
                                < 550
                        {
                            return;
                        }
                        #[cfg(windows)]
                        {
                            let fg = unsafe { GetForegroundWindow() };
                            if !fg.0.is_null() {
                                if let Ok(raw) = win_clone.hwnd() {
                                    let flyout_hwnd = HWND(raw.0);
                                    if fg == flyout_hwnd
                                        || unsafe { IsChild(flyout_hwnd, fg).as_bool() }
                                        || win_clone.is_focused().unwrap_or(false)
                                    {
                                        return;
                                    }
                                }
                            } else if win_clone.is_focused().unwrap_or(false) {
                                return;
                            }
                        }
                        #[cfg(not(windows))]
                        if win_clone.is_focused().unwrap_or(false) {
                            return;
                        }
                        hide_taskbar_flyout();
                    });
                }
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    FLYOUT_OPEN_GEN.fetch_add(1, Ordering::SeqCst);
                    FLYOUT_OPEN.store(false, Ordering::SeqCst);
                    let _ = win_for_events.hide();
                    schedule_flyout_idle_destroy();
                }
                tauri::WindowEvent::Destroyed => {
                    FLYOUT_READY.store(false, Ordering::SeqCst);
                    FLYOUT_OPEN.store(false, Ordering::SeqCst);
                    FLYOUT_OPEN_GEN.fetch_add(1, Ordering::SeqCst);
                }
                _ => {}
            });
            #[cfg(windows)]
            if let Ok(raw_hwnd) = win.hwnd() {
                let hwnd = HWND(raw_hwnd.0);
                unsafe {
                    use windows::Win32::UI::WindowsAndMessaging::{
                        GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_APPWINDOW,
                        WS_EX_TOOLWINDOW,
                    };
                    let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
                    let new_ex = (ex | WS_EX_TOOLWINDOW.0) & !WS_EX_APPWINDOW.0;
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
    match target.to_lowercase().as_str() {
        "start" => (600.0, 640.0),                 // Board 87/91
        "search" => (740.0, 700.0),                // Board 88/92
        "tray" => (260.0, 300.0),                  // Board 89/93
        "quicksettings" => {
            let has_media = !crate::media_lyrics_store::get_current_media()
                .title
                .trim()
                .is_empty();
            (400.0, if has_media { 548.0 } else { 374.0 })
        }
        "volume" => (400.0, 540.0),                // Board 95/97
        "notificationscalendar" => (392.0, 616.0), // Board 96/98
        _ => (400.0, 500.0),
    }
}

fn resolve_navbar_anchor_for_target(
    app: &AppHandle,
    target: &str,
) -> (Option<FlyoutTriggerRect>, Option<String>) {
    let Some(navbar_win) = crate::navbar_window::get_active_navbar_window(app) else {
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
            "tray" => Some(FlyoutTriggerRect {
                x: pill_x + (dock_w - 164.0).max(0.0),
                y: pill_y,
                width: 32.0,
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
            "tray" => Some(FlyoutTriggerRect {
                x: pill_x,
                y: pill_y + (dock_h - 164.0).max(0.0),
                width: dock_w,
                height: 32.0,
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

pub fn resolve_navbar_tray_anchor(
    app: &AppHandle,
) -> Option<(crate::window_dock_anim::DockAnchorRect, String)> {
    let (trig_opt, pos_opt) = resolve_navbar_anchor_for_target(app, "tray");
    let pos = pos_opt.unwrap_or_else(|| "bottom".to_string());
    let trig = trig_opt?;
    Some((
        crate::window_dock_anim::DockAnchorRect {
            x: trig.x,
            y: trig.y,
            width: trig.width,
            height: trig.height,
            position: Some(pos.clone()),
        },
        pos,
    ))
}

pub fn open_taskbar_flyout_by_target(target: &str) {
    if let Some(app) = APP_HANDLE.get() {
        let (trigger_rect, dock_pos) = resolve_navbar_anchor_for_target(app, target);
        open_taskbar_flyout_internal(app, target, trigger_rect, dock_pos, None);
    }
}

pub fn toggle_taskbar_flyout_by_target(target: &str) {
    if FLYOUT_OPEN.load(Ordering::SeqCst) {
        let current = ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if current == target {
            hide_taskbar_flyout();
            return;
        }
    }
    open_taskbar_flyout_by_target(target);
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

    let escaped_target = target.replace('\'', "\\'");
    let escaped_theme = theme_str.replace('\'', "\\'");

    // Synchronously set webview state BEFORE show/resize so there is zero view flash
    cancel_flyout_idle_destroy();
    FLYOUT_OPENED_AT_MS.store(now_epoch_ms(), Ordering::SeqCst);
    FLYOUT_OPEN.store(true, Ordering::SeqCst);
    *ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()) = target.to_string();

    if let Some(trig) = trigger_rect {
        crate::window_dock_anim::record_last_dock_anchor(crate::window_dock_anim::DockAnchorRect {
            x: trig.x,
            y: trig.y,
            width: trig.width,
            height: trig.height,
            position: Some(pos_str.to_string()),
        });
    }

    let (origin_x, origin_y) = compute_flyout_anchor_origin(
        win,
        pos_str,
        target_x,
        target_y,
        desired_w,
        desired_h,
        trigger_rect,
        scale_factor,
    );
    let open_seq = FLYOUT_OPEN_SEQ.fetch_add(1, Ordering::SeqCst) + 1;
    let anchor_json = serde_json::json!({
        "originX": origin_x,
        "originY": origin_y,
        "position": pos_str,
        "seq": open_seq,
    });

    let eval_script = format!(
        "window.__PENDING_TASKBAR_FLYOUT__ = {{ target: '{}', theme: '{}', anchor: {} }}; if (typeof window.__setTaskbarFlyoutState === 'function') {{ window.__setTaskbarFlyoutState('{}', '{}', {}); }} window.focus();",
        escaped_target, escaped_theme, anchor_json, escaped_target, escaped_theme, anchor_json
    );

    FLYOUT_OPEN_GEN.fetch_add(1, Ordering::SeqCst);
    FLYOUT_OPENED_AT_MS.store(now_epoch_ms(), Ordering::SeqCst);
    FLYOUT_OPEN.store(true, Ordering::SeqCst);

    let win_main = win.clone();
    let _ = app.run_on_main_thread(move || {
        if !FLYOUT_OPEN.load(Ordering::SeqCst) || FLYOUT_OPEN_SEQ.load(Ordering::SeqCst) != open_seq {
            return;
        }
        let _ = win_main.eval(&eval_script);
        let _ = win_main.set_size(tauri::LogicalSize::new(desired_w, desired_h));
        let _ = win_main.set_position(tauri::LogicalPosition::new(target_x, target_y));
        #[cfg(windows)]
        if let Ok(raw_hwnd) = win_main.hwnd() {
            crate::window_backdrop::apply_flyout_backdrop(HWND(raw_hwnd.0), is_liquid, hint_light);
        }
        set_flyout_click_through(&win_main, false);
        FLYOUT_OPENED_AT_MS.store(now_epoch_ms(), Ordering::SeqCst);
        let _ = win_main.show();
        #[cfg(windows)]
        if let Ok(raw_hwnd) = win_main.hwnd() {
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
        let _ = win_main.set_focus();
    });

    let win_focus_followup = win.clone();
    let app_followup = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(45));
        if FLYOUT_OPEN.load(Ordering::SeqCst) && FLYOUT_OPEN_SEQ.load(Ordering::SeqCst) == open_seq {
            let _ = app_followup.run_on_main_thread(move || {
                if FLYOUT_OPEN.load(Ordering::SeqCst) && FLYOUT_OPEN_SEQ.load(Ordering::SeqCst) == open_seq {
                    let _ = win_focus_followup.set_focus();
                    let _ = win_focus_followup.eval("window.focus();");
                }
            });
        }
    });

    let state_payload = serde_json::json!({
        "isOpen": true,
        "target": target,
        "theme": theme_str,
        "width": desired_w,
        "height": desired_h,
        "anchor": anchor_json
    });

    let _ = app.emit("taskbar-flyout-state-changed", state_payload);

    let log_target = target.to_string();
    let log_action = action_log.to_string();
    let log_details = serde_json::json!({
        "x": target_x,
        "y": target_y,
        "w": desired_w,
        "h": desired_h,
        "theme": theme_str
    });
    std::thread::spawn(move || {
        crate::taskbar_logger::log_taskbar_event(
            &log_target,
            &log_action,
            "ok",
            Some(log_details),
        );
    });
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

        // Wait up to 900ms for TaskbarFlyoutApp mount so WebView2 child HWNDs exist before show()
        for _ in 0..60 {
            if FLYOUT_READY.load(Ordering::SeqCst) || !FLYOUT_OPEN.load(Ordering::SeqCst) {
                break;
            }
            std::thread::sleep(Duration::from_millis(15));
        }

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
        if FLYOUT_READY.load(Ordering::SeqCst) && !FLYOUT_CREATING.load(Ordering::SeqCst) {
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
    }

    unsafe {
        let fg = GetForegroundWindow();
        let is_flyout_fg = app
            .get_webview_window("taskbar_flyout")
            .and_then(|w| w.hwnd().ok())
            .map(|h| h.0 == fg.0)
            .unwrap_or(false);
        if !is_flyout_fg {
            LAST_FG_HWND.store(fg.0 as isize, Ordering::SeqCst);
        }
    }
    FLYOUT_OPENED_AT_MS.store(now_epoch_ms(), Ordering::SeqCst);
    FLYOUT_OPEN.store(true, Ordering::SeqCst);
    *ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()) = target.to_string();

    let theme_str = resolve_theme_str(theme_opt.as_deref());
    spawn_lazy_flyout_and_apply(app, target, theme_str, "open_flyout");
}

#[tauri::command]
pub fn get_taskbar_flyout_state() -> serde_json::Value {
    let was_ready = FLYOUT_READY.swap(true, Ordering::SeqCst);
    let is_open = FLYOUT_OPEN.load(Ordering::SeqCst);
    if !was_ready && is_open {
        FLYOUT_OPENED_AT_MS.store(now_epoch_ms(), Ordering::SeqCst);
    }
    let current_target = ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let theme_opt = LAST_OPEN_CONTEXT
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
        .and_then(|(_, _, t)| t.clone());
    let theme_str = resolve_theme_str(theme_opt.as_deref());
    serde_json::json!({
        "isOpen": is_open,
        "target": if current_target.is_empty() { "volume".to_string() } else { current_target },
        "theme": theme_str,
    })
}

fn resolve_trigger_screen_logical(
    win: &WebviewWindow,
    trigger: Option<&FlyoutTriggerRect>,
    scale_factor: f64,
) -> (f64, f64, f64, f64, f64) {
    let safe_scale = scale_factor.max(1.0);
    let (nav_x_px, nav_y_px, nav_scale) =
        if let Some(navbar_win) = crate::navbar_window::get_active_navbar_window(win.app_handle()) {
            let n_scale = navbar_win.scale_factor().unwrap_or(safe_scale).max(1.0);
            if let Ok(raw_hwnd) = navbar_win.hwnd() {
                let hwnd = HWND(raw_hwnd.0);
                let mut r = RECT::default();
                if unsafe { GetWindowRect(hwnd, &mut r).is_ok() } {
                    (r.left as f64, r.top as f64, n_scale)
                } else {
                    let p = navbar_win.outer_position().unwrap_or_default();
                    (p.x as f64, p.y as f64, n_scale)
                }
            } else {
                let p = navbar_win.outer_position().unwrap_or_default();
                (p.x as f64, p.y as f64, n_scale)
            }
        } else {
            (0.0, 0.0, safe_scale)
        };

    let nav_x = nav_x_px / safe_scale;
    let nav_y = nav_y_px / safe_scale;
    let ratio = nav_scale / safe_scale;
    if let Some(t) = trigger {
        (
            nav_x + t.x * ratio,
            nav_y + t.y * ratio,
            t.width * ratio,
            t.height * ratio,
            nav_scale,
        )
    } else {
        (nav_x, nav_y, 40.0, 40.0, nav_scale)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct LogicalRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct WorkAreaBounds {
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
}

fn compute_anchor_origin_from_logical(
    pos: &str,
    target_x: f64,
    target_y: f64,
    width: f64,
    height: f64,
    trig: LogicalRect,
) -> (f64, f64) {
    let cx = trig.x + trig.width / 2.0 - target_x;
    let cy = trig.y + trig.height / 2.0 - target_y;
    let clamped_x = cx.clamp(24.0, (width - 24.0).max(24.0));
    let clamped_y = cy.clamp(24.0, (height - 24.0).max(24.0));
    match pos {
        "top" => (clamped_x, 0.0),
        "left" => (0.0, clamped_y),
        "right" => (width, clamped_y),
        _ => (clamped_x, height),
    }
}

fn compute_flyout_anchor_origin(
    win: &WebviewWindow,
    pos: &str,
    target_x: f64,
    target_y: f64,
    width: f64,
    height: f64,
    trigger: Option<&FlyoutTriggerRect>,
    scale_factor: f64,
) -> (f64, f64) {
    let (trig_x, trig_y, trig_w, trig_h, _) =
        resolve_trigger_screen_logical(win, trigger, scale_factor);
    compute_anchor_origin_from_logical(
        pos,
        target_x,
        target_y,
        width,
        height,
        LogicalRect {
            x: trig_x,
            y: trig_y,
            width: trig_w,
            height: trig_h,
        },
    )
}

fn calculate_anchored_position_in_bounds(
    pos: &str,
    width: f64,
    height: f64,
    trigger_rect: Option<LogicalRect>,
    bounds: WorkAreaBounds,
) -> (f64, f64) {
    let margin = 12.0;

    let (x, y) = match pos {
        "top" => {
            let (initial_x, initial_y) = if let Some(trig) = trigger_rect {
                (
                    trig.x + (trig.width - width) / 2.0,
                    trig.y + trig.height + margin,
                )
            } else {
                (
                    (bounds.left + bounds.right - width) / 2.0,
                    bounds.top + margin,
                )
            };
            (initial_x, initial_y)
        }
        "left" => {
            let (initial_x, initial_y) = if let Some(trig) = trigger_rect {
                (
                    trig.x + trig.width + margin,
                    trig.y + (trig.height - height) / 2.0,
                )
            } else {
                (
                    bounds.left + margin,
                    (bounds.top + bounds.bottom - height) / 2.0,
                )
            };
            (initial_x, initial_y)
        }
        "right" => {
            let (initial_x, initial_y) = if let Some(trig) = trigger_rect {
                (
                    trig.x - width - margin,
                    trig.y + (trig.height - height) / 2.0,
                )
            } else {
                (
                    bounds.right - width - margin,
                    (bounds.top + bounds.bottom - height) / 2.0,
                )
            };
            (initial_x, initial_y)
        }
        _ => {
            // "bottom"
            let (initial_x, initial_y) = if let Some(trig) = trigger_rect {
                (
                    trig.x + (trig.width - width) / 2.0,
                    trig.y - height - margin,
                )
            } else {
                (
                    (bounds.left + bounds.right - width) / 2.0,
                    bounds.bottom - height - margin,
                )
            };
            (initial_x, initial_y)
        }
    };

    // Clamp coordinates strictly within monitor work area, pinning left/top margin on narrow screens.
    let max_x = (bounds.right - width - margin).max(bounds.left + margin);
    let max_y = (bounds.bottom - height - margin).max(bounds.top + margin);
    let clamped_x = x.clamp(bounds.left + margin, max_x);
    let clamped_y = y.clamp(bounds.top + margin, max_y);

    (clamped_x.round(), clamped_y.round())
}

fn calculate_anchored_position(
    win: &WebviewWindow,
    pos: &str,
    width: f64,
    height: f64,
    trigger: Option<&FlyoutTriggerRect>,
    scale_factor: f64,
) -> (f64, f64) {
    let (trig_x, trig_y, trig_w, trig_h, _nav_scale) =
        resolve_trigger_screen_logical(win, trigger, scale_factor);

    let point = POINT {
        x: ((trig_x + trig_w / 2.0) * scale_factor) as i32,
        y: ((trig_y + trig_h / 2.0) * scale_factor) as i32,
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

    let trigger_rect = trigger.map(|_| LogicalRect {
        x: trig_x,
        y: trig_y,
        width: trig_w,
        height: trig_h,
    });
    let bounds = WorkAreaBounds {
        left: work_left,
        top: work_top,
        right: work_right,
        bottom: work_bottom,
    };
    calculate_anchored_position_in_bounds(pos, width, height, trigger_rect, bounds)
}

pub fn hide_taskbar_flyout() {
    if !FLYOUT_OPEN.swap(false, Ordering::SeqCst) {
        return;
    }
    FLYOUT_OPEN_GEN.fetch_add(1, Ordering::SeqCst);

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

    let close_seq = FLYOUT_OPEN_SEQ.fetch_add(1, Ordering::SeqCst) + 1;
    let mut flyout_hwnd_raw: isize = 0;
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit(
            "taskbar-flyout-state-changed",
            serde_json::json!({ "isOpen": false, "target": target, "closing": true }),
        );
        if let Some(win) = app.get_webview_window("taskbar_flyout") {
            set_flyout_click_through(&win, true);
            if let Ok(h) = win.hwnd() {
                flyout_hwnd_raw = h.0 as isize;
            }
            let _ = win.eval(
                "if (typeof window.__playTaskbarFlyoutClose === 'function') { window.__playTaskbarFlyoutClose(); }",
            );
            let win_hide = win.clone();
            let target_done = target.clone();
            let hide_delay_ms = if crate::window_dock_anim::is_genie_animation_enabled() {
                175
            } else {
                125
            };
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(hide_delay_ms));
                if FLYOUT_OPEN.load(Ordering::SeqCst)
                    || FLYOUT_OPEN_SEQ.load(Ordering::SeqCst) != close_seq
                {
                    return;
                }
                let _ = win_hide.hide();
                let _ = win_hide.eval(
                    "delete window.__PENDING_TASKBAR_FLYOUT__; if (window.__resetTaskbarFlyoutState) { window.__resetTaskbarFlyoutState(); }",
                );
                let _ = win_hide.emit(
                    "taskbar-flyout-state-changed",
                    serde_json::json!({ "isOpen": false, "target": target_done }),
                );
                schedule_flyout_idle_destroy();
            });
        } else {
            schedule_flyout_idle_destroy();
        }
    } else {
        schedule_flyout_idle_destroy();
    }

    // Restore focus only if focus stayed on the now-closing flyout or nowhere (don't steal from a newly clicked window)
    let prev_hwnd = LAST_FG_HWND.swap(0, Ordering::SeqCst);
    if prev_hwnd != 0 {
        unsafe {
            let fg = GetForegroundWindow();
            if fg.0.is_null() || (flyout_hwnd_raw != 0 && fg.0 as isize == flyout_hwnd_raw) {
                let _ = SetForegroundWindow(HWND(prev_hwnd as *mut _));
            }
        }
    }

    std::thread::spawn(move || {
        crate::taskbar_logger::log_taskbar_event(&target, "close_flyout", "ok", None);
    });
}

/// Immediately hides the Gili flyout without restoring previous foreground focus,
/// preventing focus theft right before summoning a native Windows tray overflow or menu.
pub fn dismiss_flyout_for_native_handoff() {
    FLYOUT_OPEN.store(false, Ordering::SeqCst);
    FLYOUT_OPEN_GEN.fetch_add(1, Ordering::SeqCst);
    FLYOUT_OPEN_SEQ.fetch_add(1, Ordering::SeqCst);
    LAST_FG_HWND.store(0, Ordering::SeqCst);
    let target = {
        let mut lock = ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner());
        let prev = lock.clone();
        lock.clear();
        prev
    };
    if let Some(app) = APP_HANDLE.get() {
        if let Some(win) = app.get_webview_window("taskbar_flyout") {
            set_flyout_click_through(&win, true);
            let _ = win.hide();
            let _ = win.eval(
                "delete window.__PENDING_TASKBAR_FLYOUT__; if (window.__resetTaskbarFlyoutState) { window.__resetTaskbarFlyoutState(); }",
            );
        }
        let _ = app.emit(
            "taskbar-flyout-state-changed",
            serde_json::json!({ "isOpen": false, "target": target }),
        );
    }
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
            if prev_target == payload.target && dismissed_at.elapsed().as_millis() < 250 && same_spot
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
    FLYOUT_OPENED_AT_MS.store(now_epoch_ms(), Ordering::SeqCst);
    let (trigger_rect, pos_str, theme_opt) = LAST_OPEN_CONTEXT
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .unwrap_or((None, "bottom".to_string(), None));

    if let Some(win) = app.get_webview_window("taskbar_flyout") {
        if FLYOUT_READY.load(Ordering::SeqCst) && !FLYOUT_CREATING.load(Ordering::SeqCst) {
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
    }

    FLYOUT_OPEN.store(true, Ordering::SeqCst);
    *ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()) = target.clone();
    let theme_str = resolve_theme_str(theme_opt.as_deref());
    spawn_lazy_flyout_and_apply(&app, &target, theme_str, "switch_flyout_target");
}

fn clamp_flyout_resize_height(height: f64, default_h: f64) -> f64 {
    if height.is_finite() {
        height.clamp(160.0, 760.0).round()
    } else {
        default_h
    }
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
    let desired_h = clamp_flyout_resize_height(height, default_h);
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
        .unwrap_or_else(|e| e.into_inner())
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

    FLYOUT_OPENED_AT_MS.store(now_epoch_ms(), Ordering::SeqCst);
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

#[cfg(test)]
mod tests {
    use super::*;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    struct FlyoutStateGuard {
        ready: bool,
        open: bool,
        opened_at_ms: u64,
        target: String,
        open_context: Option<(Option<FlyoutTriggerRect>, String, Option<String>)>,
    }

    impl Drop for FlyoutStateGuard {
        fn drop(&mut self) {
            FLYOUT_READY.store(self.ready, Ordering::SeqCst);
            FLYOUT_OPEN.store(self.open, Ordering::SeqCst);
            FLYOUT_OPENED_AT_MS.store(self.opened_at_ms, Ordering::SeqCst);
            *ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()) = self.target.clone();
            *LAST_OPEN_CONTEXT.lock().unwrap_or_else(|e| e.into_inner()) =
                self.open_context.clone();
        }
    }

    #[test]
    fn test_get_flyout_dimensions_for_target() {
        assert_eq!(get_flyout_dimensions_for_target("start"), (600.0, 640.0));
        assert_eq!(get_flyout_dimensions_for_target("search"), (740.0, 700.0));
        assert_eq!(get_flyout_dimensions_for_target("tray"), (260.0, 300.0));
        let expected_qs_height = if crate::media_lyrics_store::get_current_media()
            .title
            .trim()
            .is_empty()
        {
            374.0
        } else {
            548.0
        };
        assert_eq!(
            get_flyout_dimensions_for_target("quickSettings"),
            (400.0, expected_qs_height)
        );
        assert_eq!(
            get_flyout_dimensions_for_target("quicksettings"),
            (400.0, expected_qs_height)
        );
        assert_eq!(get_flyout_dimensions_for_target("volume"), (400.0, 540.0));
        assert_eq!(
            get_flyout_dimensions_for_target("notificationsCalendar"),
            (392.0, 616.0)
        );
        assert_eq!(get_flyout_dimensions_for_target("unknown"), (400.0, 500.0));
    }

    #[test]
    fn test_get_taskbar_flyout_state_sets_ready_and_returns_fields() {
        let _lock = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let _restore = FlyoutStateGuard {
            ready: FLYOUT_READY.load(Ordering::SeqCst),
            open: FLYOUT_OPEN.load(Ordering::SeqCst),
            opened_at_ms: FLYOUT_OPENED_AT_MS.load(Ordering::SeqCst),
            target: ACTIVE_TARGET
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone(),
            open_context: LAST_OPEN_CONTEXT
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone(),
        };

        FLYOUT_READY.store(false, Ordering::SeqCst);
        FLYOUT_OPEN.store(false, Ordering::SeqCst);
        ACTIVE_TARGET
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
        *LAST_OPEN_CONTEXT.lock().unwrap_or_else(|e| e.into_inner()) = None;

        let default_state = get_taskbar_flyout_state();
        assert!(FLYOUT_READY.load(Ordering::SeqCst));
        assert_eq!(default_state.get("isOpen"), Some(&serde_json::json!(false)));
        assert_eq!(
            default_state.get("target"),
            Some(&serde_json::json!("volume"))
        );
        let (hint_glass, _) = crate::window_backdrop::get_shared_theme_hint();
        let expected_default_theme = if hint_glass { "liquid" } else { "solid" };
        assert_eq!(
            default_state.get("theme"),
            Some(&serde_json::json!(expected_default_theme))
        );

        FLYOUT_READY.store(false, Ordering::SeqCst);
        FLYOUT_OPEN.store(true, Ordering::SeqCst);
        *ACTIVE_TARGET.lock().unwrap_or_else(|e| e.into_inner()) = "quickSettings".to_string();
        *LAST_OPEN_CONTEXT.lock().unwrap_or_else(|e| e.into_inner()) =
            Some((None, "bottom".to_string(), Some("liquid".to_string())));

        let active_state = get_taskbar_flyout_state();
        assert!(FLYOUT_READY.load(Ordering::SeqCst));
        assert_eq!(active_state.get("isOpen"), Some(&serde_json::json!(true)));
        assert_eq!(
            active_state.get("target"),
            Some(&serde_json::json!("quickSettings"))
        );
        assert_eq!(
            active_state.get("theme"),
            Some(&serde_json::json!("liquid"))
        );
    }

    #[test]
    fn test_calculate_anchored_position_in_bounds_all_edges_and_clamping() {
        let bounds = WorkAreaBounds {
            left: 0.0,
            top: 0.0,
            right: 1920.0,
            bottom: 1040.0,
        };

        assert_eq!(
            calculate_anchored_position_in_bounds(
                "bottom",
                400.0,
                500.0,
                Some(LogicalRect {
                    x: 940.0,
                    y: 980.0,
                    width: 40.0,
                    height: 48.0,
                }),
                bounds,
            ),
            (760.0, 468.0)
        );
        assert_eq!(
            calculate_anchored_position_in_bounds(
                "top",
                400.0,
                500.0,
                Some(LogicalRect {
                    x: 940.0,
                    y: 8.0,
                    width: 40.0,
                    height: 48.0,
                }),
                bounds,
            ),
            (760.0, 68.0)
        );
        assert_eq!(
            calculate_anchored_position_in_bounds(
                "left",
                400.0,
                500.0,
                Some(LogicalRect {
                    x: 8.0,
                    y: 500.0,
                    width: 48.0,
                    height: 40.0,
                }),
                bounds,
            ),
            (68.0, 270.0)
        );
        assert_eq!(
            calculate_anchored_position_in_bounds(
                "right",
                400.0,
                500.0,
                Some(LogicalRect {
                    x: 1860.0,
                    y: 500.0,
                    width: 48.0,
                    height: 40.0,
                }),
                bounds,
            ),
            (1448.0, 270.0)
        );

        // Fallback positioning without a trigger rect
        assert_eq!(
            calculate_anchored_position_in_bounds("bottom", 400.0, 500.0, None, bounds),
            (760.0, 528.0)
        );
        assert_eq!(
            calculate_anchored_position_in_bounds("top", 400.0, 500.0, None, bounds),
            (760.0, 12.0)
        );
        assert_eq!(
            calculate_anchored_position_in_bounds("left", 400.0, 500.0, None, bounds),
            (12.0, 270.0)
        );
        assert_eq!(
            calculate_anchored_position_in_bounds("right", 400.0, 500.0, None, bounds),
            (1508.0, 270.0)
        );

        // Clamping on secondary monitor with negative X coordinates
        let left_mon = WorkAreaBounds {
            left: -1920.0,
            top: 0.0,
            right: 0.0,
            bottom: 1080.0,
        };
        assert_eq!(
            calculate_anchored_position_in_bounds(
                "bottom",
                400.0,
                500.0,
                Some(LogicalRect {
                    x: -1918.0,
                    y: 1020.0,
                    width: 36.0,
                    height: 48.0,
                }),
                left_mon,
            ),
            (-1908.0, 508.0)
        );
        assert_eq!(
            calculate_anchored_position_in_bounds(
                "bottom",
                400.0,
                500.0,
                Some(LogicalRect {
                    x: -20.0,
                    y: 1020.0,
                    width: 20.0,
                    height: 48.0,
                }),
                left_mon,
            ),
            (-412.0, 508.0)
        );
        assert_eq!(
            calculate_anchored_position_in_bounds(
                "top",
                400.0,
                500.0,
                Some(LogicalRect {
                    x: -1000.0,
                    y: 900.0,
                    width: 40.0,
                    height: 48.0,
                }),
                left_mon,
            ),
            (-1180.0, 568.0)
        );
        assert_eq!(
            calculate_anchored_position_in_bounds(
                "bottom",
                400.0,
                500.0,
                Some(LogicalRect {
                    x: -1000.0,
                    y: 100.0,
                    width: 40.0,
                    height: 48.0,
                }),
                left_mon,
            ),
            (-1180.0, 12.0)
        );

        // Narrow/short monitor narrower than flyout + 2*margin keeps left/top margin pinned
        let tiny_mon = WorkAreaBounds {
            left: 0.0,
            top: 0.0,
            right: 360.0,
            bottom: 420.0,
        };
        assert_eq!(
            calculate_anchored_position_in_bounds("bottom", 400.0, 500.0, None, tiny_mon),
            (12.0, 12.0)
        );
        assert_eq!(
            get_flyout_dimensions_for_target("notificationscalendar"),
            get_flyout_dimensions_for_target("notificationsCalendar")
        );
    }

    #[test]
    fn test_compute_anchor_origin_from_logical_clamping_and_edges() {
        let centered_trig = LogicalRect {
            x: 940.0,
            y: 980.0,
            width: 40.0,
            height: 40.0,
        };
        assert_eq!(
            compute_anchor_origin_from_logical("bottom", 760.0, 468.0, 400.0, 500.0, centered_trig),
            (200.0, 500.0)
        );
        assert_eq!(
            compute_anchor_origin_from_logical("top", 760.0, 60.0, 400.0, 500.0, centered_trig),
            (200.0, 0.0)
        );
        assert_eq!(
            compute_anchor_origin_from_logical("left", 60.0, 750.0, 400.0, 500.0, centered_trig),
            (0.0, 250.0)
        );
        assert_eq!(
            compute_anchor_origin_from_logical("right", 500.0, 750.0, 400.0, 500.0, centered_trig),
            (400.0, 250.0)
        );

        // Extreme triggers clamp within [24.0, dim - 24.0]
        assert_eq!(
            compute_anchor_origin_from_logical(
                "bottom",
                100.0,
                100.0,
                400.0,
                500.0,
                LogicalRect {
                    x: 90.0,
                    y: 90.0,
                    width: 10.0,
                    height: 10.0,
                },
            ),
            (24.0, 500.0)
        );
        assert_eq!(
            compute_anchor_origin_from_logical(
                "left",
                100.0,
                100.0,
                400.0,
                500.0,
                LogicalRect {
                    x: 90.0,
                    y: 800.0,
                    width: 10.0,
                    height: 10.0,
                },
            ),
            (0.0, 476.0)
        );
    }

    #[test]
    fn test_resolve_theme_str_and_clamp_resize_height() {
        assert_eq!(resolve_theme_str(Some("liquid")), "liquid");
        assert_eq!(resolve_theme_str(Some("solid")), "solid");
        assert_eq!(resolve_theme_str(Some("anything")), "solid");
        let (hint_glass, _) = crate::window_backdrop::get_shared_theme_hint();
        assert_eq!(
            resolve_theme_str(None),
            if hint_glass { "liquid" } else { "solid" }
        );

        assert_eq!(clamp_flyout_resize_height(100.0, 540.0), 160.0);
        assert_eq!(clamp_flyout_resize_height(900.0, 540.0), 760.0);
        assert_eq!(clamp_flyout_resize_height(412.6, 540.0), 413.0);
        assert_eq!(clamp_flyout_resize_height(f64::NAN, 540.0), 540.0);
        assert_eq!(clamp_flyout_resize_height(f64::INFINITY, 374.0), 374.0);
    }
}
