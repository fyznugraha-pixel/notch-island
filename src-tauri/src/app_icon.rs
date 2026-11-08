use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use windows::core::PCWSTR;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ,
};
use windows::Win32::UI::Shell::SHDefExtractIconW;
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

const ICON_SIZE: u32 = 64;

// Keyed by exe path. None is cached too so exes without an icon are not re-extracted every poll.
fn icon_cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

unsafe fn read_bitmap_bgra(hdc: HDC, hbm: HBITMAP, width: i32, height: i32) -> Option<Vec<u8>> {
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height, // negative = top-down rows
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut pixels = vec![0u8; (width * height * 4) as usize];
    let lines = GetDIBits(
        hdc,
        hbm,
        0,
        height as u32,
        Some(pixels.as_mut_ptr() as *mut std::ffi::c_void),
        &mut bmi,
        DIB_RGB_COLORS,
    );
    (lines != 0).then_some(pixels)
}

unsafe fn hicon_to_png_data_url(hicon: HICON) -> Option<String> {
    let mut info = ICONINFO::default();
    GetIconInfo(hicon, &mut info).ok()?;

    let color = info.hbmColor;
    let mask = info.hbmMask;
    let result = (|| {
        if color.is_invalid() {
            return None;
        }
        let mut bm = BITMAP::default();
        let got = GetObjectW(
            HGDIOBJ(color.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut _ as *mut std::ffi::c_void),
        );
        if got == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0 {
            return None;
        }
        let (w, h) = (bm.bmWidth, bm.bmHeight);

        let hdc = GetDC(None);
        let mut pixels = read_bitmap_bgra(hdc, color, w, h);

        // Legacy icons carry no alpha channel; derive transparency from the AND mask instead.
        if let Some(px) = pixels.as_mut() {
            if px.chunks_exact(4).all(|p| p[3] == 0) {
                match read_bitmap_bgra(hdc, mask, w, h) {
                    Some(mask_px) => {
                        for (p, m) in px.chunks_exact_mut(4).zip(mask_px.chunks_exact(4)) {
                            p[3] = if m[0] == 0 { 255 } else { 0 };
                        }
                    }
                    None => px.chunks_exact_mut(4).for_each(|p| p[3] = 255),
                }
            }
        }
        ReleaseDC(None, hdc);

        let mut rgba = pixels?;
        rgba.chunks_exact_mut(4).for_each(|p| p.swap(0, 2));
        let img = image::RgbaImage::from_raw(w as u32, h as u32, rgba)?;

        let mut png = std::io::Cursor::new(Vec::with_capacity(8192));
        img.write_to(&mut png, image::ImageFormat::Png).ok()?;
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        Some(format!("data:image/png;base64,{}", STANDARD.encode(png.into_inner())))
    })();

    if !color.is_invalid() {
        let _ = DeleteObject(HGDIOBJ(color.0));
    }
    if !mask.is_invalid() {
        let _ = DeleteObject(HGDIOBJ(mask.0));
    }
    result
}

fn extract_exe_icon(exe_path: &str) -> Option<String> {
    let wide: Vec<u16> = exe_path.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let mut hicon = HICON::default();
        SHDefExtractIconW(PCWSTR(wide.as_ptr()), 0, 0, Some(&mut hicon), None, ICON_SIZE).ok().ok()?;
        if hicon.is_invalid() {
            return None;
        }
        let data_url = hicon_to_png_data_url(hicon);
        let _ = DestroyIcon(hicon);
        data_url
    }
}

#[tauri::command]
pub async fn get_app_icon(path: String) -> Option<String> {
    if path.trim().is_empty() {
        return None;
    }
    if let Some(cached) = icon_cache().lock().ok()?.get(&path) {
        return cached.clone();
    }
    let lookup_path = path.clone();
    let icon = tauri::async_runtime::spawn_blocking(move || extract_exe_icon(&lookup_path))
        .await
        .ok()
        .flatten();
    if let Ok(mut cache) = icon_cache().lock() {
        cache.insert(path, icon.clone());
    }
    icon
}
