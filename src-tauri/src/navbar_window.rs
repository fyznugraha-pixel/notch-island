use tauri::{LogicalPosition, LogicalSize, Manager};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_LWIN,
};

pub fn show_or_create_navbar_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("navbar") {
        let _ = w.show();
        let _ = w.unminimize();
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
                let nw = win.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
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
        let _ = w.hide();
    }
}

#[tauri::command]
pub fn open_navbar_window(app: tauri::AppHandle) {
    show_or_create_navbar_window(&app);
}

#[tauri::command]
pub fn close_navbar_window(app: tauri::AppHandle) {
    hide_navbar_window(&app);
}

#[tauri::command]
pub fn sync_navbar_bounds(
    app: tauri::AppHandle,
    width: f64,
    height: f64,
    position: String,
    distance_from_edge: f64,
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
