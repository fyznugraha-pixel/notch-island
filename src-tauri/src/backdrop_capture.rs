use base64::Engine;
use image::{ImageBuffer, Rgba};
use std::sync::Mutex;
use tauri::Manager;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, SetStretchBltMode, StretchBlt, BITMAPINFO, BITMAPINFOHEADER,
    DIB_RGB_COLORS, HALFTONE, SRCCOPY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowDisplayAffinity, WINDOW_DISPLAY_AFFINITY,
};

pub const WDA_EXCLUDEFROMCAPTURE: WINDOW_DISPLAY_AFFINITY = WINDOW_DISPLAY_AFFINITY(0x00000011);

static LATEST_BACKDROP_DATA_URL: Mutex<Option<String>> = Mutex::new(None);

pub fn set_exclude_from_capture(hwnd: HWND) {
    unsafe {
        let _ = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
    }
}

#[derive(serde::Deserialize, Clone, Copy, Debug)]
pub struct CaptureRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[tauri::command]
pub fn get_cached_desktop_backdrop() -> Option<String> {
    LATEST_BACKDROP_DATA_URL.lock().unwrap().clone()
}

/// Pre-warms the desktop backdrop cache in a background thread on startup so
/// the very first paint of the dock or flyout has an authentic blurred wallpaper (0ms delay).
pub fn prewarm_desktop_backdrop() {
    std::thread::spawn(|| {
        let _ = capture_screen_rect_to_cache(0, 0, 1920, 1080);
    });
}

pub fn capture_screen_rect_to_cache(target_x: i32, target_y: i32, safe_w: i32, safe_h: i32) -> Result<String, String> {
    unsafe {
        let hdc_screen = GetDC(None);
        if hdc_screen.is_invalid() {
            return Err("Failed to get screen DC".into());
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let scale = 0.35f32;
        let cap_w = ((safe_w as f32 * scale).round() as i32).clamp(16, 480);
        let cap_h = ((safe_h as f32 * scale).round() as i32).clamp(16, 320);

        let hbm = CreateCompatibleBitmap(hdc_screen, cap_w, cap_h);
        let old_bm = SelectObject(hdc_mem, hbm);

        let _ = SetStretchBltMode(hdc_mem, HALFTONE);
        let blt_res = StretchBlt(
            hdc_mem,
            0,
            0,
            cap_w,
            cap_h,
            hdc_screen,
            target_x,
            target_y,
            safe_w,
            safe_h,
            SRCCOPY,
        );

        if !blt_res.as_bool() {
            SelectObject(hdc_mem, old_bm);
            let _ = DeleteObject(hbm);
            let _ = DeleteDC(hdc_mem);
            let _ = ReleaseDC(None, hdc_screen);
            return Err("StretchBlt failed".into());
        }

        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: cap_w,
                biHeight: -cap_h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [windows::Win32::Graphics::Gdi::RGBQUAD::default()],
        };

        let mut raw_pixels = vec![0u8; (cap_w * cap_h * 4) as usize];
        let get_di = GetDIBits(
            hdc_mem,
            hbm,
            0,
            cap_h as u32,
            Some(raw_pixels.as_mut_ptr() as *mut _),
            &mut bi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old_bm);
        let _ = DeleteObject(hbm);
        let _ = DeleteDC(hdc_mem);
        let _ = ReleaseDC(None, hdc_screen);

        if get_di == 0 {
            return Err("GetDIBits failed".into());
        }

        let total_pixels = (cap_w * cap_h) as usize;
        let mut rgb_pixels = Vec::with_capacity(total_pixels * 3);
        for i in 0..total_pixels {
            let offset = i * 4;
            let b = raw_pixels[offset] as f32;
            let g = raw_pixels[offset + 1] as f32;
            let r = raw_pixels[offset + 2] as f32;

            let gray = 0.299 * r + 0.587 * g + 0.114 * b;
            let nr = ((gray + (r - gray) * 1.5) * 1.05).clamp(0.0, 255.0) as u8;
            let ng = ((gray + (g - gray) * 1.5) * 1.05).clamp(0.0, 255.0) as u8;
            let nb = ((gray + (b - gray) * 1.5) * 1.05).clamp(0.0, 255.0) as u8;

            rgb_pixels.push(nr);
            rgb_pixels.push(ng);
            rgb_pixels.push(nb);
        }

        let mut jpeg_bytes = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, 70);
        let img = ImageBuffer::<Rgba<u8>, _>::from_raw(
            cap_w as u32,
            cap_h as u32,
            {
                let mut rgba = Vec::with_capacity(total_pixels * 4);
                for i in 0..total_pixels {
                    rgba.push(rgb_pixels[i * 3]);
                    rgba.push(rgb_pixels[i * 3 + 1]);
                    rgba.push(rgb_pixels[i * 3 + 2]);
                    rgba.push(255);
                }
                rgba
            },
        ).ok_or_else(|| "Failed to create image buffer".to_string())?;

        if encoder.encode_image(&img).is_err() {
            return Err("Failed to encode JPEG".into());
        }

        let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes);
        let data_url = format!("data:image/jpeg;base64,{}", b64);
        *LATEST_BACKDROP_DATA_URL.lock().unwrap() = Some(data_url.clone());
        Ok(data_url)
    }
}

#[tauri::command]
pub fn set_window_exclude_from_capture(app: tauri::AppHandle, window_label: Option<String>) {
    let label = window_label.as_deref().unwrap_or("main");
    if let Some(win) = app.get_webview_window(label) {
        if let Ok(raw_hwnd) = win.hwnd() {
            set_exclude_from_capture(HWND(raw_hwnd.0));
        }
    }
}

#[tauri::command]
pub fn capture_desktop_backdrop(
    app: tauri::AppHandle,
    window_label: Option<String>,
    client_rect: Option<CaptureRect>,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<u32>,
    height: Option<u32>,
    _blur_sigma: Option<f32>,
) -> Result<String, String> {
    let label = window_label.as_deref().unwrap_or("main");
    let (target_x, target_y, target_w, target_h) = if let (Some(px), Some(py), Some(pw), Some(ph)) = (x, y, width, height) {
        (px, py, pw.max(16), ph.max(16))
    } else if let Some(win) = app.get_webview_window(label) {
        let sf = win.scale_factor().unwrap_or(1.0);
        let (win_x, win_y) = if let Ok(raw_hwnd) = win.hwnd() {
            let hwnd = HWND(raw_hwnd.0);
            let mut r = windows::Win32::Foundation::RECT::default();
            if unsafe { windows::Win32::UI::WindowsAndMessaging::GetWindowRect(hwnd, &mut r).is_ok() } {
                (r.left, r.top)
            } else {
                let p = win.outer_position().unwrap_or_default();
                (p.x, p.y)
            }
        } else {
            let p = win.outer_position().unwrap_or_default();
            (p.x, p.y)
        };

        if let Some(rect) = client_rect {
            let px = win_x + (rect.x * sf).round() as i32;
            let py = win_y + (rect.y * sf).round() as i32;
            let pw = (rect.width * sf).round() as u32;
            let ph = (rect.height * sf).round() as u32;
            (px, py, pw.max(16), ph.max(16))
        } else {
            let win_size = win.outer_size().unwrap_or(tauri::PhysicalSize::new(820, 460));
            (win_x, win_y, win_size.width.max(16), win_size.height.max(16))
        }
    } else {
        (0, 0, 820, 460)
    };

    let safe_w = target_w.clamp(16, 3840) as i32;
    let safe_h = target_h.clamp(16, 2160) as i32;

    capture_screen_rect_to_cache(target_x, target_y, safe_w, safe_h)
}
