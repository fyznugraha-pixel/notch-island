use base64::Engine;
use image::{imageops, ImageBuffer, Rgba};
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
    blur_sigma: Option<f32>,
) -> Result<String, String> {
    let label = window_label.as_deref().unwrap_or("main");
    let (target_x, target_y, target_w, target_h) = if let (Some(px), Some(py), Some(pw), Some(ph)) = (x, y, width, height) {
        (px, py, pw.max(16), ph.max(16))
    } else if let Some(win) = app.get_webview_window(label) {
        let win_pos = win.outer_position().unwrap_or(tauri::PhysicalPosition::new(0, 0));
        let sf = win.scale_factor().unwrap_or(1.0);
        if let Some(rect) = client_rect {
            let px = win_pos.x + (rect.x * sf).round() as i32;
            let py = win_pos.y + (rect.y * sf).round() as i32;
            let pw = (rect.width * sf).round() as u32;
            let ph = (rect.height * sf).round() as u32;
            (px, py, pw.max(16), ph.max(16))
        } else {
            let win_size = win.outer_size().unwrap_or(tauri::PhysicalSize::new(820, 460));
            (win_pos.x, win_pos.y, win_size.width.max(16), win_size.height.max(16))
        }
    } else {
        (0, 0, 820, 460)
    };

    let safe_w = target_w.clamp(16, 3840) as i32;
    let safe_h = target_h.clamp(16, 2160) as i32;

    unsafe {
        let hdc_screen = GetDC(None);
        if hdc_screen.is_invalid() {
            return Err("Failed to get screen DC".into());
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let scale = 0.5f32;
        let cap_w = ((safe_w as f32 * scale).round() as i32).max(16);
        let cap_h = ((safe_h as f32 * scale).round() as i32).max(16);

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
                biHeight: -cap_h, // top-down
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

        // Convert BGRA to RGBA with vibrant saturation boost (1.75x) and brightness (1.05x)
        let mut img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::new(cap_w as u32, cap_h as u32);
        for y_idx in 0..cap_h as u32 {
            for x_idx in 0..cap_w as u32 {
                let offset = ((y_idx * cap_w as u32 + x_idx) * 4) as usize;
                let b = raw_pixels[offset] as f32;
                let g = raw_pixels[offset + 1] as f32;
                let r = raw_pixels[offset + 2] as f32;

                let gray = 0.299 * r + 0.587 * g + 0.114 * b;
                let sat = 1.75;
                let bright = 1.05;
                let nr = ((gray + (r - gray) * sat) * bright).clamp(0.0, 255.0) as u8;
                let ng = ((gray + (g - gray) * sat) * bright).clamp(0.0, 255.0) as u8;
                let nb = ((gray + (b - gray) * sat) * bright).clamp(0.0, 255.0) as u8;

                img.put_pixel(x_idx, y_idx, Rgba([nr, ng, nb, 255]));
            }
        }

        // Apply fast gaussian blur (sigma ~13.0 at 0.5x scale = 26px blur on display)
        let sigma = blur_sigma.unwrap_or(13.0);
        let blurred = imageops::blur(&img, sigma);

        let mut jpeg_bytes = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, 82);
        if encoder.encode_image(&blurred).is_err() {
            return Err("Failed to encode JPEG".into());
        }

        let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes);
        Ok(format!("data:image/jpeg;base64,{}", b64))
    }
}
