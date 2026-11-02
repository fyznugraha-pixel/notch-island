use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows::core::{Interface, PCWSTR};
use windows::Win32::Foundation::{HWND, MAX_PATH};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    IPersistFile, STGM_READ,
};
use windows::Win32::UI::Shell::{
    IShellLinkW, ShellLink, SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON,
    SHGFI_SYSICONINDEX,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, DrawIconEx, GetIconInfo, DI_NORMAL, HICON, ICONINFO,
};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetDIBits, GetObjectW,
    ReleaseDC, SelectObject, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
};

#[link(name = "shell32")]
extern "system" {
    fn SHGetImageList(
        iimagelist: i32,
        riid: *const windows::core::GUID,
        ppvobj: *mut *mut std::ffi::c_void,
    ) -> i32;
}

#[link(name = "comctl32")]
extern "system" {
    fn ImageList_GetIcon(himl: *mut std::ffi::c_void, i: i32, flags: u32) -> HICON;
}

#[link(name = "user32")]
extern "system" {
    fn PrivateExtractIconsW(
        lpszfile: *const u16,
        niconindex: i32,
        cxicon: i32,
        cyicon: i32,
        phicon: *mut HICON,
        piconid: *mut u32,
        nicons: u32,
        flags: u32,
    ) -> u32;
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct WindowsPinnedApp {
    pub id: String,
    pub name: String,
    pub target_path: String,
    pub arguments: String,
    pub icon_base64: Option<String>,
    pub icon_type: Option<String>,
    pub lnk_path: String,
}

/// Identifies well-known icon type for vector theme support
fn detect_icon_type(name: &str, target: &str) -> Option<String> {
    let lower_n = name.to_lowercase();
    let lower_t = target.to_lowercase();
    if lower_n.contains("chrome") || lower_t.contains("chrome") {
        Some("browser".into())
    } else if lower_n.contains("brave") || lower_t.contains("brave") {
        Some("brave".into())
    } else if lower_n.contains("explorer") || lower_t.contains("explorer") {
        Some("folder".into())
    } else if lower_n.contains("code") || lower_t.contains("code") {
        Some("code".into())
    } else if lower_n.contains("terminal")
        || lower_t.contains("windowsterminal")
        || lower_t.contains("cmd.exe")
        || lower_t.contains("powershell")
    {
        Some("terminal".into())
    } else if lower_n.contains("settings") || lower_t.contains("systemsettings") {
        Some("settings".into())
    } else if lower_n.contains("spotify") || lower_t.contains("spotify") {
        Some("spotify".into())
    } else if lower_n.contains("discord") || lower_t.contains("discord") {
        Some("discord".into())
    } else if lower_n.contains("whatsapp") || lower_t.contains("whatsapp") {
        Some("whatsapp".into())
    } else {
        None
    }
}

/// Normalizes application ID for matching with running window processes
fn detect_app_id(name: &str, target: &str) -> String {
    let lower_n = name.to_lowercase();
    let lower_t = target.to_lowercase();
    if lower_n.contains("chrome") || lower_t.contains("chrome") {
        "chrome".into()
    } else if lower_n.contains("brave") || lower_t.contains("brave") {
        "brave".into()
    } else if lower_n.contains("explorer") || lower_t.contains("explorer") {
        "explorer".into()
    } else if lower_n.contains("code") || lower_t.contains("code") {
        "vscode".into()
    } else if lower_n.contains("terminal") || lower_t.contains("windowsterminal") {
        "terminal".into()
    } else if lower_n.contains("settings") {
        "settings".into()
    } else if lower_n.contains("spotify") || lower_t.contains("spotify") {
        "spotify".into()
    } else if lower_n.contains("netflix") || lower_t.contains("netflix") {
        "netflix".into()
    } else if lower_n.contains("discord") || lower_t.contains("discord") {
        "discord".into()
    } else if lower_n.contains("whatsapp") || lower_t.contains("whatsapp") {
        "whatsapp".into()
    } else {
        // Derive clean ID from filename
        let base = Path::new(&lower_t)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&lower_n);
        base.replace(' ', "_")
    }
}

#[derive(Debug, Clone)]
enum TaskbandEntry {
    LnkFileName(String),
    UwpAumid(String),
}

/// Parses HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband ("Favorites" binary)
/// to extract the exact taskbar order of both .lnk shortcuts and UWP / Microsoft Store apps.
fn parse_taskband_favorites() -> Vec<TaskbandEntry> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(key) = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Taskband") else {
        return Vec::new();
    };
    let Ok(raw_val) = key.get_raw_value("Favorites") else {
        return Vec::new();
    };
    let bytes = &raw_val.bytes;
    if bytes.len() < 8 {
        return Vec::new();
    }

    let mut found_with_pos: Vec<(usize, TaskbandEntry)> = Vec::new();

    for parity in [0usize, 1usize] {
        let mut idx = parity;
        let mut current_chars: Vec<u16> = Vec::new();
        let mut start_pos = idx;

        while idx + 1 < bytes.len() {
            let ch = u16::from_le_bytes([bytes[idx], bytes[idx + 1]]);
            let is_printable = (0x20..=0x7E).contains(&ch);
            if is_printable {
                if current_chars.is_empty() {
                    start_pos = idx;
                }
                current_chars.push(ch);
            } else {
                if current_chars.len() >= 5 {
                    let s = String::from_utf16_lossy(&current_chars);
                    classify_taskband_token(start_pos, &s, &mut found_with_pos);
                }
                current_chars.clear();
            }
            idx += 2;
        }
        if current_chars.len() >= 5 {
            let s = String::from_utf16_lossy(&current_chars);
            classify_taskband_token(start_pos, &s, &mut found_with_pos);
        }
    }

    found_with_pos.sort_by_key(|(pos, _)| *pos);

    let mut ordered = Vec::new();
    let mut seen_keys = std::collections::HashSet::new();

    for (_, entry) in found_with_pos {
        let dedup_key = match &entry {
            TaskbandEntry::LnkFileName(name) => format!("lnk:{}", name.to_lowercase()),
            TaskbandEntry::UwpAumid(aumid) => format!("uwp:{}", aumid.to_lowercase()),
        };
        if seen_keys.insert(dedup_key) {
            ordered.push(entry);
        }
    }

    ordered
}

fn classify_taskband_token(
    start_pos: usize,
    raw: &str,
    out: &mut Vec<(usize, TaskbandEntry)>,
) {
    let trimmed = raw.trim();
    // 1. Check for .lnk filename
    let lower = trimmed.to_lowercase();
    if let Some(lnk_end) = lower.find(".lnk") {
        let slice = &trimmed[..lnk_end + 4];
        let fname = slice
            .rsplit(|c| c == '\\' || c == '/')
            .next()
            .unwrap_or(slice)
            .trim();
        // Avoid short 8.3 DOS names like GOOGLE~1.LNK when full Unicode name follows right after
        if !fname.contains('~') && fname.len() > 4 {
            out.push((start_pos, TaskbandEntry::LnkFileName(fname.to_string())));
            return;
        }
    }

    // 2. Check for UWP AUMID pattern: <PackageFamilyName>_<PublisherHash>!<AppId>
    if trimmed.contains('_') && trimmed.contains('!') && !trimmed.contains('\\') && !trimmed.contains('/') {
        for token in trimmed.split(|c: char| !c.is_ascii_alphanumeric() && c != '.' && c != '_' && c != '-' && c != '!') {
            if let Some((pfn, app_id)) = token.split_once('!') {
                if let Some((pkg_name, pub_id)) = pfn.rsplit_once('_') {
                    if !pkg_name.is_empty()
                        && (10..=16).contains(&pub_id.len())
                        && pub_id.chars().all(|c| c.is_ascii_alphanumeric())
                        && !app_id.is_empty()
                    {
                        out.push((start_pos, TaskbandEntry::UwpAumid(format!("{}!{}", pfn, app_id))));
                        return;
                    }
                }
            }
        }
    }
}

/// Resolves a UWP AppUserModelId (e.g. "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify")
/// into a WindowsPinnedApp with its high-res 256x256 PNG asset and shell:AppsFolder launch path.
fn resolve_uwp_pinned_app(aumid: &str) -> Option<WindowsPinnedApp> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let (pfn, app_suffix) = aumid.split_once('!')?;
    let (pkg_prefix, publisher_id) = pfn.rsplit_once('_')?;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let pkgs_path = "Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages";
    let mut package_root = String::new();
    let mut display_name = String::new();

    if let Ok(pkgs_key) = hkcu.open_subkey(pkgs_path) {
        let prefix_match = format!("{}_", pkg_prefix.to_lowercase());
        let suffix_match = format!("__{}", publisher_id.to_lowercase());

        for sub_name in pkgs_key.enum_keys().flatten() {
            let sub_lower = sub_name.to_lowercase();
            if sub_lower.starts_with(&prefix_match) && sub_lower.ends_with(&suffix_match) {
                if let Ok(sub_key) = pkgs_key.open_subkey(&sub_name) {
                    if let Ok(root) = sub_key.get_value::<String, _>("PackageRootFolder") {
                        package_root = root;
                    }
                    if let Ok(dn) = sub_key.get_value::<String, _>("DisplayName") {
                        let dn_lower = dn.to_lowercase();
                        if !dn.starts_with("@{")
                            && !dn_lower.starts_with("ms-resource:")
                            && !dn_lower.contains("ms-resource")
                        {
                            display_name = dn;
                        }
                    }
                    break;
                }
            }
        }
    }

    let friendly_name = if !display_name.is_empty() {
        display_name
    } else {
        let lower_pfn = pfn.to_lowercase();
        if lower_pfn.contains("spotify") {
            "Spotify".to_string()
        } else if lower_pfn.contains("netflix") {
            "Netflix".to_string()
        } else if lower_pfn.contains("whatsapp") {
            "WhatsApp".to_string()
        } else if lower_pfn.contains("windowsterminal") {
            "Terminal".to_string()
        } else {
            pkg_prefix
                .split('.')
                .last()
                .unwrap_or(app_suffix)
                .to_string()
        }
    };

    let id = detect_app_id(&friendly_name, pfn);
    let icon_type = detect_icon_type(&friendly_name, pfn);
    let shell_launch = format!("shell:AppsFolder\\{}", aumid);

    let icon_base64 = if !package_root.is_empty() {
        let dummy_exe = Path::new(&package_root).join("app.exe");
        get_cached_or_extract_icon(&dummy_exe.to_string_lossy())
            .or_else(|| get_cached_or_extract_icon(&package_root))
    } else {
        None
    };

    Some(WindowsPinnedApp {
        id,
        name: friendly_name,
        target_path: package_root,
        arguments: String::new(),
        icon_base64,
        icon_type,
        lnk_path: shell_launch,
    })
}

/// Attempts to read a lossless 256x256 PNG asset directly from a UWP / MSIX package directory
fn extract_uwp_package_png(exe_path: &str) -> Option<String> {
    let path_obj = Path::new(exe_path);
    let mut candidate_roots = Vec::new();
    let mut curr = path_obj.parent();
    for _ in 0..3 {
        if let Some(dir) = curr {
            let dir_name = dir
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_lowercase();
            if dir_name == "windowsapps"
                || dir_name == "systemapps"
                || dir_name == "windows"
                || dir_name == "program files"
                || dir_name == "system32"
            {
                break;
            }
            candidate_roots.push(dir.to_path_buf());
            curr = dir.parent();
        } else {
            break;
        }
    }

    let mut best_file: Option<(i32, PathBuf)> = None;

    for root in candidate_roots {
        let subdirs = [
            root.join("Assets"),
            root.join("assets"),
            root.join("Images"),
            root.join("images"),
            root.clone(),
        ];

        for subdir in subdirs {
            let Ok(entries) = std::fs::read_dir(&subdir) else {
                continue;
            };
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.eq_ignore_ascii_case("png"))
                    != Some(true)
                {
                    continue;
                }
                let fname = p
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                // Skip high-contrast, wide tiles, splash screens, or badges
                if fname.contains("contrast-")
                    || fname.contains("splashscreen")
                    || fname.contains("wide")
                    || fname.contains("badge")
                    || fname.contains("large")
                {
                    continue;
                }

                let is_app_logo = fname.contains("applist")
                    || fname.contains("square44x44")
                    || fname.starts_with("logo.")
                    || fname.contains("storelogo");
                if !is_app_logo {
                    continue;
                }

                let mut score = 10;
                if fname.contains("targetsize-256") {
                    score += 500;
                } else if fname.contains("targetsize-96")
                    || fname.contains("targetsize-80")
                    || fname.contains("targetsize-72")
                    || fname.contains("targetsize-64")
                {
                    score += 400;
                } else if fname.contains("targetsize-60") || fname.contains("targetsize-48") {
                    score += 300;
                } else if fname.contains("scale-400") {
                    score += 350;
                } else if fname.contains("scale-200") {
                    score += 250;
                }

                if fname.contains("altform-unplated") {
                    score += 80;
                } else if fname.contains("lightunplated") {
                    score += 40;
                }

                if best_file.as_ref().map_or(true, |(best_s, _)| score > *best_s) {
                    best_file = Some((score, p));
                }
            }
        }
    }

    let (_, winning_path) = best_file?;
    let bytes = std::fs::read(winning_path).ok()?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:image/png;base64,{}", b64))
}

/// Converts an HICON to a crystal-clear native-resolution (up to 256x256) base64 PNG data URL.
/// Reads raw 32-bit BGRA pixels directly from ICONINFO.hbmColor to avoid GDI nearest-neighbor stretching.
pub unsafe fn hicon_to_base64(hicon: HICON) -> Option<String> {
    if hicon.is_invalid() {
        return None;
    }

    let mut icon_info = ICONINFO::default();
    let mut native_w = 48i32;
    let mut native_h = 48i32;
    let mut direct_rgba: Option<(u32, u32, Vec<u8>)> = None;

    if GetIconInfo(hicon, &mut icon_info).is_ok() {
        if !icon_info.hbmColor.is_invalid() {
            let mut bmp = BITMAP::default();
            if GetObjectW(
                icon_info.hbmColor,
                std::mem::size_of::<BITMAP>() as i32,
                Some(&mut bmp as *mut _ as *mut _),
            ) > 0
            {
                if bmp.bmWidth > 0 && bmp.bmHeight > 0 {
                    native_w = bmp.bmWidth;
                    native_h = bmp.bmHeight;
                }

                if bmp.bmBitsPixel == 32 && native_w > 0 && native_h > 0 {
                    let hdc_screen = GetDC(HWND(std::ptr::null_mut()));
                    let mut bmi = BITMAPINFO {
                        bmiHeader: BITMAPINFOHEADER {
                            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                            biWidth: native_w,
                            biHeight: -native_h, // top-down
                            biPlanes: 1,
                            biBitCount: 32,
                            biCompression: BI_RGB.0,
                            ..Default::default()
                        },
                        ..Default::default()
                    };

                    let mut raw_buf = vec![0u8; (native_w * native_h * 4) as usize];
                    let lines = GetDIBits(
                        hdc_screen,
                        icon_info.hbmColor,
                        0,
                        native_h as u32,
                        Some(raw_buf.as_mut_ptr() as *mut _),
                        &mut bmi,
                        DIB_RGB_COLORS,
                    );
                    let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);

                    if lines > 0 {
                        let mut max_alpha = 0u8;
                        let mut max_x = 0i32;
                        let mut max_y = 0i32;

                        for y in 0..native_h {
                            for x in 0..native_w {
                                let idx = ((y * native_w + x) * 4) as usize;
                                let b = raw_buf[idx];
                                let r = raw_buf[idx + 2];
                                let a = raw_buf[idx + 3];
                                raw_buf[idx] = r;
                                raw_buf[idx + 2] = b;
                                if a > max_alpha {
                                    max_alpha = a;
                                }
                                if a > 8 {
                                    if x > max_x {
                                        max_x = x;
                                    }
                                    if y > max_y {
                                        max_y = y;
                                    }
                                }
                            }
                        }

                        if max_alpha > 0 {
                            // If SHIL_JUMBO (256x256) placed a legacy 48x48 icon in the top-left corner,
                            // crop to that active quadrant so the icon isn't tiny in a 256x256 canvas.
                            if native_w == 256 && native_h == 256 && max_x < 64 && max_y < 64 && max_x >= 15 {
                                let crop_size = if max_x <= 32 && max_y <= 32 { 32i32 } else { 48i32 };
                                let mut cropped = vec![0u8; (crop_size * crop_size * 4) as usize];
                                for cy in 0..crop_size {
                                    let src_start = ((cy * native_w) * 4) as usize;
                                    let dst_start = ((cy * crop_size) * 4) as usize;
                                    let row_bytes = (crop_size * 4) as usize;
                                    cropped[dst_start..dst_start + row_bytes]
                                        .copy_from_slice(&raw_buf[src_start..src_start + row_bytes]);
                                }
                                direct_rgba = Some((crop_size as u32, crop_size as u32, cropped));
                            } else {
                                direct_rgba = Some((native_w as u32, native_h as u32, raw_buf));
                            }
                        }
                    }
                }
            }
            let _ = DeleteObject(icon_info.hbmColor);
        }
        if !icon_info.hbmMask.is_invalid() {
            let _ = DeleteObject(icon_info.hbmMask);
        }
    }

    let (final_w, final_h, buffer) = if let Some(rgba_tuple) = direct_rgba {
        rgba_tuple
    } else {
        let width = native_w.clamp(32, 256);
        let height = native_h.clamp(32, 256);

        let hdc_screen = GetDC(HWND(std::ptr::null_mut()));
        let hdc_mem = CreateCompatibleDC(hdc_screen);

        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
        let hbm = CreateDIBSection(hdc_mem, &bmi, DIB_RGB_COLORS, &mut bits, None, 0).ok()?;
        let old_bm = SelectObject(hdc_mem, hbm);

        let _ = DrawIconEx(hdc_mem, 0, 0, hicon, width, height, 0, None, DI_NORMAL);

        let mut buf = vec![0u8; (width * height * 4) as usize];
        if !bits.is_null() {
            std::ptr::copy_nonoverlapping(bits as *const u8, buf.as_mut_ptr(), buf.len());
        }

        let _ = SelectObject(hdc_mem, old_bm);
        let _ = DeleteObject(hbm);
        let _ = DeleteDC(hdc_mem);
        let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);

        for pixel in buf.chunks_exact_mut(4) {
            let b = pixel[0];
            let r = pixel[2];
            pixel[0] = r;
            pixel[2] = b;
        }
        (width as u32, height as u32, buf)
    };

    let img = image::RgbaImage::from_raw(final_w, final_h, buffer)?;
    let mut png_bytes = std::io::Cursor::new(Vec::new());
    if img
        .write_to(&mut png_bytes, image::ImageFormat::Png)
        .is_err()
    {
        return None;
    }

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(png_bytes.into_inner());
    Some(format!("data:image/png;base64,{}", b64))
}

/// Extracts real native 256x256 icon directly from file / executable / shortcut on the laptop
pub unsafe fn extract_native_icon_from_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }

    // 1. Check for lossless UWP / MSIX package PNG assets first (WhatsApp, Windows Settings, Store apps)
    if let Some(uwp_png) = extract_uwp_package_png(path) {
        return Some(uwp_png);
    }

    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let lower_path = path.to_lowercase();
    let is_lnk = lower_path.ends_with(".lnk");
    let is_explorer = lower_path.ends_with("explorer.exe");

    // 2. For direct executables/icons (except explorer.exe whose index 0 is legacy),
    // try PrivateExtractIconsW at 256x256 first for exact native frame without quadrant padding.
    if !is_lnk && !is_explorer && Path::new(path).exists() {
        let mut hicon = HICON::default();
        let mut icon_id = 0u32;
        let extracted = PrivateExtractIconsW(
            wide.as_ptr(),
            0,
            256,
            256,
            &mut hicon,
            &mut icon_id,
            1,
            0,
        );
        if extracted > 0 && !hicon.is_invalid() {
            let b64 = hicon_to_base64(hicon);
            let _ = DestroyIcon(hicon);
            if b64.is_some() {
                return b64;
            }
        }
    }

    // 3. Query system image list index via SHGetFileInfoW(SHGFI_SYSICONINDEX) -> SHGetImageList(SHIL_JUMBO = 4)
    let mut shfi = SHFILEINFOW::default();
    let res = SHGetFileInfoW(
        PCWSTR(wide.as_ptr()),
        windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES(0),
        Some(&mut shfi),
        std::mem::size_of::<SHFILEINFOW>() as u32,
        SHGFI_SYSICONINDEX,
    );

    // Note: iIcon == 2 is the generic blank executable icon in Windows Shell
    if res != 0 && shfi.iIcon > 0 && shfi.iIcon != 2 {
        let iid_imagelist = windows::core::GUID::from_u128(0x46eb5926_582e_4017_9fdf_e8998daa0950);
        // Try SHIL_JUMBO (4 = 256x256), then SHIL_EXTRALARGE (2 = 48x48)
        for shil in [4i32, 2i32] {
            let mut himl: *mut std::ffi::c_void = std::ptr::null_mut();
            if SHGetImageList(shil, &iid_imagelist, &mut himl) == 0 && !himl.is_null() {
                let hicon = ImageList_GetIcon(himl, shfi.iIcon, 0x00000001 /* ILD_TRANSPARENT */);
                if !hicon.is_invalid() {
                    let b64 = hicon_to_base64(hicon);
                    let _ = DestroyIcon(hicon);
                    if b64.is_some() {
                        return b64;
                    }
                }
            }
        }
    }

    // 4. Final fallback: standard SHGFI_ICON | SHGFI_LARGEICON
    let mut shfi_fallback = SHFILEINFOW::default();
    let res_fb = SHGetFileInfoW(
        PCWSTR(wide.as_ptr()),
        windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES(0),
        Some(&mut shfi_fallback),
        std::mem::size_of::<SHFILEINFOW>() as u32,
        SHGFI_ICON | SHGFI_LARGEICON,
    );

    if res_fb != 0 && !shfi_fallback.hIcon.is_invalid() && shfi_fallback.iIcon != 2 {
        let b64 = hicon_to_base64(shfi_fallback.hIcon);
        let _ = DestroyIcon(shfi_fallback.hIcon);
        b64
    } else {
        None
    }
}

static ICON_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

/// Cached helper to avoid redundant icon extraction on fast polling cycles
pub fn get_cached_or_extract_icon(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    let cache = ICON_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(guard) = cache.lock() {
        if let Some(cached) = guard.get(path) {
            return Some(cached.clone());
        }
    }
    unsafe {
        if let Some(b64) = extract_native_icon_from_path(path) {
            if let Ok(mut guard) = cache.lock() {
                guard.insert(path.to_string(), b64.clone());
            }
            return Some(b64);
        }
    }
    None
}

/// Fallback extractor that reads HICON directly from a running window HWND
pub unsafe fn extract_native_icon_from_hwnd(hwnd: HWND) -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassLongPtrW, SendMessageW, GCLP_HICON, ICON_BIG, ICON_SMALL2, WM_GETICON,
    };
    use windows::Win32::Foundation::{LPARAM, WPARAM};

    let res_big = SendMessageW(hwnd, WM_GETICON, WPARAM(ICON_BIG as usize), LPARAM(0));
    if res_big.0 != 0 {
        let hicon = HICON(res_big.0 as *mut _);
        if let Some(b64) = hicon_to_base64(hicon) {
            let _ = DestroyIcon(hicon);
            return Some(b64);
        }
    }

    let res_small = SendMessageW(hwnd, WM_GETICON, WPARAM(ICON_SMALL2 as usize), LPARAM(0));
    if res_small.0 != 0 {
        let hicon = HICON(res_small.0 as *mut _);
        if let Some(b64) = hicon_to_base64(hicon) {
            let _ = DestroyIcon(hicon);
            return Some(b64);
        }
    }

    let class_icon = GetClassLongPtrW(hwnd, GCLP_HICON);
    if class_icon != 0 {
        let hicon = HICON(class_icon as *mut _);
        if let Some(b64) = hicon_to_base64(hicon) {
            return Some(b64);
        }
    }

    None
}

/// Resolves a single .lnk file to WindowsPinnedApp with native icon
fn resolve_shortcut(lnk_path: &Path) -> Option<WindowsPinnedApp> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let shell_link: IShellLinkW =
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let persist_file: IPersistFile = shell_link.cast().ok()?;

        let wide_path: Vec<u16> = lnk_path
            .to_string_lossy()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        if persist_file
            .Load(PCWSTR(wide_path.as_ptr()), STGM_READ)
            .is_err()
        {
            return None;
        }

        let mut target_buf = [0u16; MAX_PATH as usize];
        let _ = shell_link.GetPath(&mut target_buf, std::ptr::null_mut(), 0);
        let mut target_path = String::from_utf16_lossy(&target_buf)
            .trim_matches('\0')
            .to_string();

        let mut args_buf = [0u16; 1024];
        let _ = shell_link.GetArguments(&mut args_buf);
        let arguments = String::from_utf16_lossy(&args_buf)
            .trim_matches('\0')
            .to_string();

        let name = lnk_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("App")
            .to_string();

        let icon_type = detect_icon_type(&name, &target_path);
        let id = detect_app_id(&name, &target_path);

        // Fallback for explorer if target path is empty in shell link
        if (id == "explorer" || name.to_lowercase().contains("explorer")) && target_path.is_empty() {
            target_path = "C:\\Windows\\explorer.exe".to_string();
        }

        // Extract genuine native Windows icon from laptop
        // For File Explorer shortcut, extract from .lnk first so Windows 11 modern folder icon is used
        let icon_base64 = if id == "explorer" {
            get_cached_or_extract_icon(&lnk_path.to_string_lossy())
                .or_else(|| get_cached_or_extract_icon(&target_path))
        } else if !target_path.is_empty() && Path::new(&target_path).exists() {
            get_cached_or_extract_icon(&target_path)
                .or_else(|| get_cached_or_extract_icon(&lnk_path.to_string_lossy()))
        } else {
            get_cached_or_extract_icon(&lnk_path.to_string_lossy())
        };

        Some(WindowsPinnedApp {
            id,
            name,
            target_path,
            arguments,
            icon_base64,
            icon_type,
            lnk_path: lnk_path.to_string_lossy().to_string(),
        })
    }
}

/// Retrieves list of pinned apps from Windows Taskbar in exact user order
/// (combines HKCU\...\Explorer\Taskband Favorites order + UWP apps + User Pinned\TaskBar .lnk files)
pub fn get_taskbar_pinned_apps() -> Vec<WindowsPinnedApp> {
    let appdata = match std::env::var("APPDATA") {
        Ok(v) => PathBuf::from(v),
        Err(_) => return Vec::new(),
    };

    let pinned_dir = appdata
        .join("Microsoft")
        .join("Internet Explorer")
        .join("Quick Launch")
        .join("User Pinned")
        .join("TaskBar");

    let mut lnk_map: HashMap<String, PathBuf> = HashMap::new();
    if pinned_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&pinned_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("lnk")) == Some(true) {
                    if let Some(fname) = path.file_name().and_then(|n| n.to_str()) {
                        lnk_map.insert(fname.to_lowercase(), path);
                    }
                }
            }
        }
    }

    let mut apps = Vec::new();
    let mut used_ids = std::collections::HashSet::new();

    // 1. Follow exact order from Windows Taskband registry Favorites
    for item in parse_taskband_favorites() {
        match item {
            TaskbandEntry::LnkFileName(fname) => {
                let key = fname.to_lowercase();
                if let Some(path) = lnk_map.remove(&key) {
                    if let Some(app) = resolve_shortcut(&path) {
                        if used_ids.insert(app.id.clone()) {
                            apps.push(app);
                        }
                    }
                }
            }
            TaskbandEntry::UwpAumid(aumid) => {
                if let Some(app) = resolve_uwp_pinned_app(&aumid) {
                    if used_ids.insert(app.id.clone()) {
                        apps.push(app);
                    }
                }
            }
        }
    }

    // 2. Append any remaining .lnk files in User Pinned\TaskBar not listed in Taskband binary
    let mut remaining: Vec<PathBuf> = lnk_map.into_values().collect();
    remaining.sort();
    for path in remaining {
        if let Some(app) = resolve_shortcut(&path) {
            if used_ids.insert(app.id.clone()) {
                apps.push(app);
            }
        }
    }

    apps
}

static WATCHER_RUNNING: AtomicBool = AtomicBool::new(false);

/// Starts background watcher thread to auto-sync Windows Taskbar pinned apps to frontend
pub fn start_pinned_apps_watcher(app_handle: AppHandle) {
    if WATCHER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(move || {
        let mut last_apps: Vec<WindowsPinnedApp> = Vec::new();

        loop {
            std::thread::sleep(Duration::from_millis(1500));

            let current_apps = get_taskbar_pinned_apps();
            if current_apps != last_apps {
                last_apps = current_apps.clone();
                let _ = app_handle.emit("gili://windows-pinned-apps-updated", &current_apps);
            }
        }
    });
}

#[tauri::command]
pub fn get_windows_pinned_apps() -> Vec<WindowsPinnedApp> {
    get_taskbar_pinned_apps()
}

#[tauri::command]
pub fn launch_pinned_app(lnk_path: String, target_path: String, arguments: String) -> Result<(), String> {
    // Priority 1: Launch via .lnk file using ShellExecuteW for 100% native Windows fidelity
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let lnk_wide: Vec<u16> = lnk_path.encode_utf16().chain(std::iter::once(0)).collect();
    let op_wide: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        let hinstance = ShellExecuteW(
            HWND(std::ptr::null_mut()),
            PCWSTR(op_wide.as_ptr()),
            PCWSTR(lnk_wide.as_ptr()),
            PCWSTR(std::ptr::null()),
            PCWSTR(std::ptr::null()),
            SW_SHOWNORMAL,
        );

        // ShellExecute returns > 32 on success
        if hinstance.0 as usize > 32 {
            return Ok(());
        }
    }

    // Priority 2: Fallback to std::process::Command with target_path
    if !target_path.is_empty() {
        let mut cmd = std::process::Command::new(&target_path);
        if !arguments.is_empty() {
            cmd.arg(&arguments);
        }
        cmd.spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }

    Err("Gagal membuka aplikasi".into())
}
