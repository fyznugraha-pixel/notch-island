use base64::Engine;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const MAX_ARTWORK_BYTES: u64 = 8 * 1024 * 1024;
const MAX_PNG_BYTES: usize = 15 * 1024 * 1024;
const MAX_TEMP_CARDS: usize = 12;
const PNG_MAGIC: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];

static PENDING_LYRICS_SHARE: Mutex<Option<serde_json::Value>> = Mutex::new(None);

#[tauri::command]
pub fn get_pending_lyrics_share() -> Option<serde_json::Value> {
    PENDING_LYRICS_SHARE.lock().ok().and_then(|g| g.clone())
}

#[tauri::command]
pub async fn open_lyrics_share_window(app: AppHandle, payload: serde_json::Value) {
    if let Ok(mut guard) = PENDING_LYRICS_SHARE.lock() {
        *guard = Some(payload.clone());
    }

    let app_handle = app.clone();
    // Spawn off the UI thread on Windows to avoid WebView2 CreateCoreWebView2Controller deadlock
    std::thread::spawn(move || {
        if let Some(w) = app_handle.get_webview_window("lyrics_share") {
            let _ = w.emit_to("lyrics_share", "lyrics-share:update", payload);
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
            #[cfg(windows)]
            if let Ok(hwnd) = w.hwnd() {
                use windows::Win32::Foundation::HWND;
                use windows::Win32::UI::WindowsAndMessaging::{SetForegroundWindow, ShowWindow, SW_RESTORE};
                unsafe {
                    let h = HWND(hwnd.0);
                    let _ = ShowWindow(h, SW_RESTORE);
                    let _ = SetForegroundWindow(h);
                }
            }
            return;
        }

        match tauri::WebviewWindowBuilder::new(
            &app_handle,
            "lyrics_share",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("Gili Share Lyrics")
        .inner_size(840.0, 590.0)
        .min_inner_size(700.0, 500.0)
        .maximizable(false)
        .resizable(true)
        .decorations(false)
        .transparent(false)
        .shadow(true)
        .center()
        .visible(true)
        .focused(true)
        .skip_taskbar(false)
        .initialization_script("window.__IS_LYRICS_SHARE_WINDOW__ = true;")
        .additional_browser_args("--autoplay-policy=no-user-gesture-required")
        .build()
        {
            Ok(win) => {
                if let Some(icon) = app_handle.default_window_icon() {
                    let _ = win.set_icon(icon.clone());
                }
                win.on_window_event(|event| {
                    if matches!(event, tauri::WindowEvent::Destroyed) {
                        crate::memory_optimizer::schedule_working_set_trim(900);
                    }
                });

                #[cfg(windows)]
                {
                    use windows::Win32::Foundation::HWND;
                    use windows::Win32::UI::WindowsAndMessaging::{
                        GetWindowLongW, SetWindowLongW, SetWindowPos, GWL_EXSTYLE, SWP_FRAMECHANGED,
                        SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
                    };

                    if let Ok(hwnd_val) = win.hwnd() {
                        let hwnd = HWND(hwnd_val.0);
                        unsafe {
                            let mut ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
                            ex_style &= !WS_EX_TOOLWINDOW.0;
                            ex_style |= WS_EX_APPWINDOW.0;
                            SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style as i32);
                            let _ = SetWindowPos(
                                hwnd,
                                None,
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
                            );
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to create lyrics_share window: {:?}", e);
            }
        }
    });
}

fn detect_image_mime(bytes: &[u8], content_type: Option<&str>) -> &'static str {
    if bytes.starts_with(&PNG_MAGIC) {
        return "image/png";
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return "image/jpeg";
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return "image/webp";
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return "image/gif";
    }
    if let Some(ct) = content_type {
        let lower = ct.to_lowercase();
        if lower.contains("png") {
            return "image/png";
        }
        if lower.contains("webp") {
            return "image/webp";
        }
    }
    "image/jpeg"
}

#[tauri::command]
pub async fn fetch_artwork_data_url(url: String) -> Result<String, String> {
    let trimmed = url.trim().to_string();
    if trimmed.starts_with("data:image/") {
        return Ok(trimmed);
    }
    if !trimmed.starts_with("https://") && !trimmed.starts_with("http://") {
        return Err("Unsupported artwork URL scheme".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let resp = ureq::get(&trimmed)
            .timeout(Duration::from_secs(6))
            .call()
            .map_err(|e| e.to_string())?;
        let ct = resp.header("content-type").map(|s| s.to_string());
        let mut buf = Vec::new();
        resp.into_reader()
            .take(MAX_ARTWORK_BYTES)
            .read_to_end(&mut buf)
            .map_err(|e| e.to_string())?;
        if buf.is_empty() {
            return Err("Artwork response was empty".to_string());
        }
        let mime = detect_image_mime(&buf, ct.as_deref());
        let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
        Ok(format!("data:{};base64,{}", mime, b64))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn decode_png_base64(input: &str) -> Result<Vec<u8>, String> {
    let payload = input
        .trim()
        .strip_prefix("data:image/png;base64,")
        .or_else(|| input.trim().split_once(";base64,").map(|(_, b)| b))
        .unwrap_or(input.trim());

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|e| format!("Invalid PNG base64: {}", e))?;

    if bytes.len() > MAX_PNG_BYTES {
        return Err("PNG card exceeds size limit".to_string());
    }
    if !bytes.starts_with(&PNG_MAGIC) {
        return Err("Decoded payload is not a valid PNG image".to_string());
    }
    Ok(bytes)
}

fn sanitize_png_filename(hint: &str) -> String {
    let base = hint.trim().strip_suffix(".png").unwrap_or(hint.trim());
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let compact: String = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let truncated: String = compact.trim_matches(&['.', '_', ' '][..]).chars().take(64).collect();
    let stem = if truncated.is_empty() {
        "gili-lyrics-card".to_string()
    } else {
        truncated
    };
    format!("{}.png", stem)
}

fn prune_temp_cards(dir: &Path, keep: usize) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<(SystemTime, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            if !path.is_file() {
                return None;
            }
            let modified = e.metadata().ok()?.modified().ok()?;
            Some((modified, path))
        })
        .collect();
    if files.len() <= keep {
        return;
    }
    files.sort_by_key(|(t, _)| *t);
    let remove_count = files.len().saturating_sub(keep);
    for (_, path) in files.into_iter().take(remove_count) {
        let _ = std::fs::remove_file(path);
    }
}

fn resolve_saved_cards_dir() -> PathBuf {
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let pictures = PathBuf::from(&userprofile).join("Pictures").join("Gili Lyrics");
        if std::fs::create_dir_all(&pictures).is_ok() {
            return pictures;
        }
        let downloads = PathBuf::from(userprofile).join("Downloads").join("Gili Lyrics");
        if std::fs::create_dir_all(&downloads).is_ok() {
            return downloads;
        }
    }
    std::env::temp_dir().join("gili_lyrics_cards")
}

fn pick_unique_file_path(dir: &Path, filename: &str) -> PathBuf {
    let candidate = dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }
    let stem = filename.strip_suffix(".png").unwrap_or(filename);
    for idx in 2..=999 {
        let numbered = dir.join(format!("{} ({}).png", stem, idx));
        if !numbered.exists() {
            return numbered;
        }
    }
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    dir.join(format!("{}_{}.png", stem, ts))
}

#[tauri::command]
pub async fn save_temp_lyrics_card_png(
    png_base64: String,
    filename_hint: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = decode_png_base64(&png_base64)?;
        let dir = std::env::temp_dir().join("gili_lyrics_cards");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        prune_temp_cards(&dir, MAX_TEMP_CARDS);

        let filename = sanitize_png_filename(&filename_hint);
        let stem = filename.strip_suffix(".png").unwrap_or(&filename);
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let target = dir.join(format!("{}_{}.png", stem, ts));
        std::fs::write(&target, &bytes).map_err(|e| e.to_string())?;
        Ok(target.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_lyrics_card_to_pictures(
    png_base64: String,
    filename_hint: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = decode_png_base64(&png_base64)?;
        let dir = resolve_saved_cards_dir();
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        let filename = sanitize_png_filename(&filename_hint);
        let target = pick_unique_file_path(&dir, &filename);
        std::fs::write(&target, &bytes).map_err(|e| e.to_string())?;
        Ok(target.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_png_filename_strips_forbidden_chars_and_keeps_ext() {
        assert_eq!(
            sanitize_png_filename("Artist: Foo / Bar?  *Song*.png"),
            "Artist_ Foo _ Bar_ _Song.png"
        );
        assert_eq!(sanitize_png_filename("   ...  "), "gili-lyrics-card.png");
    }

    #[test]
    fn decode_png_base64_validates_png_signature() {
        let mut fake_png = PNG_MAGIC.to_vec();
        fake_png.extend_from_slice(b"IHDR_PAYLOAD");
        let encoded = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&fake_png)
        );
        assert_eq!(decode_png_base64(&encoded).unwrap(), fake_png);

        let non_png = base64::engine::general_purpose::STANDARD.encode(b"not-a-png");
        assert!(decode_png_base64(&non_png).is_err());
    }

    #[test]
    fn detect_image_mime_identifies_png_and_webp() {
        assert_eq!(detect_image_mime(&PNG_MAGIC, None), "image/png");
        assert_eq!(detect_image_mime(b"RIFF1234WEBP", None), "image/webp");
        assert_eq!(detect_image_mime(&[0xFF, 0xD8, 0xFF, 0xE0], None), "image/jpeg");
    }
}
