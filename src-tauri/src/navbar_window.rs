use std::os::windows::process::CommandExt;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{LogicalPosition, LogicalSize, Manager};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_CONTROL, VK_ESCAPE,
    VK_LWIN, VK_SHIFT,
};
use windows::Win32::UI::Shell::{
    SHAppBarMessage, APPBARDATA, ABM_REMOVE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindowLongW, GetWindowTextW, GetWindowThreadProcessId,
    IsIconic, IsWindowVisible, SetForegroundWindow, SetWindowLongW, ShowWindow,
    GWL_EXSTYLE, SW_MINIMIZE, SW_RESTORE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
};

static APPBAR_REGISTERED: AtomicBool = AtomicBool::new(false);

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

pub fn show_or_create_navbar_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("navbar") {
        let _ = w.show();
        let _ = w.unminimize();
        #[cfg(windows)]
        if let Ok(raw_hwnd) = w.hwnd() {
            let hwnd = HWND(raw_hwnd.0);
            remove_appbar_if_registered(hwnd);
            unsafe {
                let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
                let _ = SetWindowLongW(
                    hwnd,
                    GWL_EXSTYLE,
                    ex | (WS_EX_TOOLWINDOW.0 as i32) | (WS_EX_NOACTIVATE.0 as i32),
                );
            }
        }
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
        .inner_size(800.0, 160.0)
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
                #[cfg(windows)]
                if let Ok(raw_hwnd) = win.hwnd() {
                    let hwnd = HWND(raw_hwnd.0);
                    remove_appbar_if_registered(hwnd);
                    unsafe {
                        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
                        let _ = SetWindowLongW(
                            hwnd,
                            GWL_EXSTYLE,
                            ex | (WS_EX_TOOLWINDOW.0 as i32) | (WS_EX_NOACTIVATE.0 as i32),
                        );
                    }
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
    });
}

pub fn hide_navbar_window(app: &tauri::AppHandle) {
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
pub fn sync_navbar_bounds(
    app: tauri::AppHandle,
    width: f64,
    height: f64,
    position: String,
    distance_from_edge: f64,
    is_anchored: Option<bool>,
    overhead: Option<f64>,
    extra_width: Option<f64>,
) {
    if let Some(win) = app.get_webview_window("navbar") {
        if let Ok(Some(monitor)) = win.current_monitor() {
            let scale_factor = monitor.scale_factor();
            let mon_size = monitor.size();
            let mon_width = mon_size.width as f64 / scale_factor;
            let mon_height = mon_size.height as f64 / scale_factor;

            let overhead_h = overhead.unwrap_or(40.0);
            let extra_w = extra_width.unwrap_or(80.0);

            let safe_w = width.clamp(120.0, mon_width);
            let dock_h = height.clamp(40.0, 90.0);

            let total_window_h = dock_h + overhead_h;
            let window_w = (safe_w + extra_w).clamp(safe_w + 40.0, mon_width);

            let is_anchored_bool = is_anchored.unwrap_or(distance_from_edge == 0.0);

            let (target_x, target_y) = match position.as_str() {
                "top" => {
                    let x = (mon_width - window_w) / 2.0;
                    let y = if is_anchored_bool { 0.0 } else { distance_from_edge };
                    (x, y)
                }
                "left" => {
                    let x = if is_anchored_bool { 0.0 } else { distance_from_edge };
                    let y = (mon_height - total_window_h) / 2.0;
                    (x, y)
                }
                "right" => {
                    let x = mon_width - window_w - if is_anchored_bool { 0.0 } else { distance_from_edge };
                    let y = (mon_height - total_window_h) / 2.0;
                    (x, y)
                }
                _ => {
                    // bottom: flush at bottom edge without clipping outer shadows and wings
                    let x = (mon_width - window_w) / 2.0;
                    let y = (mon_height - total_window_h).max(0.0);
                    (x, y)
                }
            };

            let _ = win.set_size(LogicalSize::new(window_w, total_window_h));
            let _ = win.set_position(LogicalPosition::new(target_x.round(), target_y.round()));

            #[cfg(windows)]
            if let Ok(raw_hwnd) = win.hwnd() {
                let hwnd = HWND(raw_hwnd.0);
                remove_appbar_if_registered(hwnd);
            }
        }
    }
}

#[tauri::command]
pub fn capture_window_thumbnail(hwnd: isize) -> Result<String, String> {
    use base64::Engine;
    use image::{ImageBuffer, Rgba};
    use windows::Win32::Foundation::{BOOL, RECT};
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, HDC,
        SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

    extern "system" {
        fn PrintWindow(hwnd: HWND, hdcblt: HDC, nflags: u32) -> BOOL;
    }
    const PW_RENDERFULLCONTENT: u32 = 0x00000002;

    let target = HWND(hwnd as *mut _);
    unsafe {
        let mut rect = RECT::default();
        if GetWindowRect(target, &mut rect).is_err() {
            return Err("Failed to get window bounds".into());
        }

        let width = (rect.right - rect.left).max(1);
        let height = (rect.bottom - rect.top).max(1);

        let hdc_screen = GetDC(None);
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbm = CreateCompatibleBitmap(hdc_screen, width, height);
        let old_bm = SelectObject(hdc_mem, hbm);

        let printed = PrintWindow(target, hdc_mem, PW_RENDERFULLCONTENT);
        if !printed.as_bool() {
            let _ = BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, rect.left, rect.top, SRCCOPY);
        }

        let thumb_w = 260u32;
        let aspect = height as f64 / width as f64;
        let thumb_h = ((260.0 * aspect) as u32).clamp(110, 170);

        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut raw_pixels = vec![0u8; (width * height * 4) as usize];
        GetDIBits(
            hdc_mem,
            hbm,
            0,
            height as u32,
            Some(raw_pixels.as_mut_ptr() as *mut _),
            &mut bi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old_bm);
        let _ = DeleteObject(hbm);
        let _ = DeleteDC(hdc_mem);
        ReleaseDC(None, hdc_screen);

        if let Some(src_img) = ImageBuffer::<Rgba<u8>, _>::from_raw(width as u32, height as u32, raw_pixels) {
            let mut rgba_img = ImageBuffer::new(width as u32, height as u32);
            for (x, y, pixel) in src_img.enumerate_pixels() {
                rgba_img.put_pixel(x, y, Rgba([pixel[2], pixel[1], pixel[0], 255]));
            }

            let resized = image::imageops::resize(&rgba_img, thumb_w, thumb_h, image::imageops::FilterType::Triangle);
            let mut jpeg_bytes = std::io::Cursor::new(Vec::new());
            if resized.write_to(&mut jpeg_bytes, image::ImageFormat::Jpeg).is_ok() {
                let b64 = base64::engine::general_purpose::STANDARD.encode(jpeg_bytes.into_inner());
                return Ok(format!("data:image/jpeg;base64,{}", b64));
            }
        }

        Err("Capture processing failed".into())
    }
}

#[tauri::command]
pub fn close_window_by_hwnd(hwnd: isize) {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_CLOSE};
    unsafe {
        let _ = PostMessageW(HWND(hwnd as *mut _), WM_CLOSE, WPARAM(0), LPARAM(0));
    }
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct RunningAppInfo {
    pub hwnd: isize,
    pub title: String,
    pub process_name: String,
    pub is_active: bool,
    pub is_minimized: bool,
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

        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if (ex_style & WS_EX_TOOLWINDOW.0) != 0 {
            return BOOL(1);
        }

        let mut title_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut title_buf);
        if len == 0 {
            return BOOL(1);
        }

        let title = String::from_utf16_lossy(&title_buf[..len as usize]);
        // Filter out system windows, shell surfaces, or Gili itself
        if title == "Gili"
            || title == "Gili Navbar"
            || title == "Gili Settings"
            || title == "Program Manager"
            || title == "Windows Input Experience"
            || title == "PopupHost"
        {
            return BOOL(1);
        }

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let mut process_name = String::new();
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
                    let full_path = String::from_utf16_lossy(&buf[..len as usize]);
                    if let Some(name) = std::path::Path::new(&full_path).file_name() {
                        process_name = name.to_string_lossy().to_string();
                    }
                }
                let _ = windows::Win32::Foundation::CloseHandle(handle);
            }
        }

        let is_active = hwnd == ctx.active_hwnd;
        let is_minimized = IsIconic(hwnd).as_bool();

        ctx.windows.push(RunningAppInfo {
            hwnd: hwnd.0 as isize,
            title,
            process_name,
            is_active,
            is_minimized,
        });

        BOOL(1)
    }

    unsafe {
        let active_hwnd = GetForegroundWindow();
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
        let active = GetForegroundWindow();
        if active == target {
            // Already active -> minimize like Windows taskbar
            let _ = ShowWindow(target, SW_MINIMIZE);
        } else {
            // Restore and bring to front
            let _ = ShowWindow(target, SW_RESTORE);
            let _ = SetForegroundWindow(target);
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

#[tauri::command]
pub fn trigger_quick_settings() {
    unsafe {
        // Win + A (Windows 11 Quick Settings / Action Center: Wi-Fi, Volume, Battery)
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(b'A', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'A', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_notification_center() {
    unsafe {
        // Win + N (Windows 11 Notifications & Calendar)
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(b'N', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'N', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_file_explorer() {
    unsafe {
        // Win + E
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(b'E', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'E', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
pub fn trigger_task_manager() {
    unsafe {
        // Ctrl + Shift + Esc
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
    let _ = std::process::Command::new("cmd.exe")
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .args(["/c", "start", "", &target])
        .spawn();
}
