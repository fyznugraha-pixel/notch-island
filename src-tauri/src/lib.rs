use tauri::Manager;

mod privacy;
mod connectivity;
mod system_monitor;
mod audio_endpoints;
mod migration;
mod windows_dnd;
mod toast_banners;

#[derive(serde::Serialize, Clone)]
struct AudioSessionInfo {
    pid: u32,
    name: String,
    volume: f32,
    muted: bool,
}

#[tauri::command]
async fn get_audio_endpoints() -> Vec<audio_endpoints::AudioEndpointInfo> {
    tauri::async_runtime::spawn_blocking(audio_endpoints::list_audio_endpoints)
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn set_default_audio_endpoint(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || audio_endpoints::set_default_endpoint(&id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_audio_sessions() -> Vec<AudioSessionInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED, CoCreateInstance, CLSCTX_ALL};
        use windows::Win32::Media::Audio::{eRender, eMultimedia, IMMDeviceEnumerator, MMDeviceEnumerator, IAudioSessionManager2, IAudioSessionControl2, ISimpleAudioVolume};
        use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT};
        use windows::core::Interface;

        let mut sessions = Vec::new();
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            if let Ok(enumerator) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) {
                if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                    if let Ok(manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) {
                        if let Ok(session_enum) = manager.GetSessionEnumerator() {
                            let count = session_enum.GetCount().unwrap_or(0);
                            for i in 0..count {
                                if let Ok(session_ctrl) = session_enum.GetSession(i) {
                                    if let Ok(session_ctrl2) = session_ctrl.cast::<IAudioSessionControl2>() {
                                        if let Ok(pid) = session_ctrl2.GetProcessId() {
                                            if pid == 0 { continue; } // System sound
                                            
                                            let mut process_name = String::new();
                                            if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                                                let mut buffer = [0u16; 1024];
                                                let mut len = buffer.len() as u32;
                                                if QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), windows::core::PWSTR(buffer.as_mut_ptr()), &mut len).is_ok() && len > 0 {
                                                    let full_path = String::from_utf16_lossy(&buffer[..len as usize]);
                                                    if let Some(name) = std::path::Path::new(&full_path).file_name() {
                                                        process_name = name.to_string_lossy().into_owned();
                                                    }
                                                }
                                                let _ = windows::Win32::Foundation::CloseHandle(handle);
                                            }

                                            // Fallback to display name if process name could not be resolved from binary
                                            if process_name.is_empty() {
                                                if let Ok(disp_ptr) = session_ctrl.GetDisplayName() {
                                                    if !disp_ptr.is_null() {
                                                        let s = disp_ptr.to_string().unwrap_or_default();
                                                        if !s.is_empty() {
                                                            process_name = s;
                                                        }
                                                        windows::Win32::System::Com::CoTaskMemFree(Some(disp_ptr.0 as *const std::ffi::c_void));
                                                    }
                                                }
                                            }

                                            if process_name.is_empty() {
                                                process_name = format!("App ({})", pid);
                                            }

                                            if let Ok(volume_ctrl) = session_ctrl2.cast::<ISimpleAudioVolume>() {
                                                if let Ok(vol) = volume_ctrl.GetMasterVolume() {
                                                    if let Ok(muted) = volume_ctrl.GetMute() {
                                                        sessions.push(AudioSessionInfo {
                                                            pid,
                                                            name: process_name,
                                                            volume: vol,
                                                            muted: muted.as_bool(),
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        sessions
    }).await.unwrap_or_default()
}

#[tauri::command]
fn set_app_volume(pid: u32, volume: f32, name: Option<String>) {
    tauri::async_runtime::spawn_blocking(move || {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED, CoCreateInstance, CLSCTX_ALL};
        use windows::Win32::Media::Audio::{eRender, eMultimedia, IMMDeviceEnumerator, MMDeviceEnumerator, IAudioSessionManager2, IAudioSessionControl2, ISimpleAudioVolume};
        use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT};
        use windows::core::Interface;
        
        let target_name_lower = name.as_ref().map(|n| n.trim().to_lowercase());
        let clamped_vol = volume.clamp(0.0, 1.0);

        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            if let Ok(enumerator) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) {
                if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                    if let Ok(manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) {
                        if let Ok(session_enum) = manager.GetSessionEnumerator() {
                            let count = session_enum.GetCount().unwrap_or(0);
                            for i in 0..count {
                                if let Ok(session_ctrl) = session_enum.GetSession(i) {
                                    if let Ok(session_ctrl2) = session_ctrl.cast::<IAudioSessionControl2>() {
                                        if let Ok(spid) = session_ctrl2.GetProcessId() {
                                            if spid == 0 { continue; }
                                            let mut is_match = spid == pid;
                                            
                                            if !is_match && target_name_lower.is_some() {
                                                if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, spid) {
                                                    let mut buffer = [0u16; 1024];
                                                    let mut len = buffer.len() as u32;
                                                    if QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), windows::core::PWSTR(buffer.as_mut_ptr()), &mut len).is_ok() && len > 0 {
                                                        let full_path = String::from_utf16_lossy(&buffer[..len as usize]);
                                                        if let Some(file_name) = std::path::Path::new(&full_path).file_name() {
                                                            let s_name = file_name.to_string_lossy().to_lowercase();
                                                            if let Some(target) = &target_name_lower {
                                                                if s_name == *target || s_name.replace(".exe", "") == target.replace(".exe", "") {
                                                                    is_match = true;
                                                                }
                                                            }
                                                        }
                                                    }
                                                    let _ = windows::Win32::Foundation::CloseHandle(handle);
                                                }
                                            }

                                            if is_match {
                                                if let Ok(volume_ctrl) = session_ctrl2.cast::<ISimpleAudioVolume>() {
                                                    let _ = volume_ctrl.SetMasterVolume(clamped_vol, std::ptr::null());
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

#[tauri::command]
fn set_pill_hover(window: tauri::Window, hovered: bool) {
    // Toggles ignore_cursor_events.
    // When hovered == true, we DO NOT ignore cursor (we want to click).
    // When hovered == false, we IGNORE cursor (click-through).
    let _ = window.set_ignore_cursor_events(!hovered);
}


#[tauri::command]
fn set_brightness_mode(mode: String) {
    use windows::Win32::Graphics::Gdi::{GetDC, ReleaseDC};
    use windows::Win32::UI::ColorSystem::SetDeviceGammaRamp;
    use std::ffi::c_void;

    unsafe {
        let hdc = GetDC(None);
        if !hdc.is_invalid() {
            let mut ramp = [0u16; 256 * 3];

            if mode == "reading" {
                for i in 0..256 {
                    let val = i as u16 * 256;
                    ramp[i] = val;
                    ramp[i + 256] = (val as f32 * 0.85) as u16;
                    ramp[i + 512] = (val as f32 * 0.65) as u16;
                }
            } else {
                for i in 0..256 {
                    let val = i as u16 * 256;
                    ramp[i] = val;
                    ramp[i + 256] = val;
                    ramp[i + 512] = val;
                }
            }
            let _ = SetDeviceGammaRamp(hdc, ramp.as_ptr() as *const c_void);
            let _ = ReleaseDC(None, hdc);
        }
    }
}

#[tauri::command]
fn read_clipboard_text(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().read_text().map_err(|e| e.to_string())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ClipboardImageItem {
    pub id: String,
    pub path: String,
    pub thumbnail: String,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
async fn read_clipboard_image(app: tauri::AppHandle) -> Result<Option<ClipboardImageItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_clipboard_manager::ClipboardExt;

        let clipboard = app.clipboard();
        let image = match clipboard.read_image() {
            Ok(img) => img,
            Err(_) => return Ok(None),
        };

        let width = image.width();
        let height = image.height();
        if width == 0 || height == 0 {
            return Ok(None);
        }

        let rgba = image.rgba();
        if rgba.len() != (width * height * 4) as usize {
            return Ok(None);
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let id = format!("clip_img_{}", now);

        let cache_dir = std::env::temp_dir().join("gili_clipboard_images");
        let _ = std::fs::create_dir_all(&cache_dir);
        let img_path = cache_dir.join(format!("{}.png", id));

        let img_buffer = match image::RgbaImage::from_raw(width, height, rgba.to_vec()) {
            Some(buf) => buf,
            None => return Ok(None),
        };

        img_buffer.save(&img_path).map_err(|e| e.to_string())?;

        let max_thumb_dim = 320.0;
        let scale = (max_thumb_dim / (width.max(height) as f32)).min(1.0);
        let thumb_w = ((width as f32 * scale).round() as u32).max(1);
        let thumb_h = ((height as f32 * scale).round() as u32).max(1);

        let resized = image::imageops::resize(&img_buffer, thumb_w, thumb_h, image::imageops::FilterType::Triangle);
        let mut cursor = std::io::Cursor::new(Vec::new());
        use base64::Engine;
        // JPEG requires RGB8 (no alpha channel). Convert to RGB8 for compact base64 data URI.
        let rgb = image::DynamicImage::ImageRgba8(resized.clone()).into_rgb8();
        let thumbnail = if rgb.write_to(&mut cursor, image::ImageFormat::Jpeg).is_ok() {
            let b64 = base64::engine::general_purpose::STANDARD.encode(cursor.into_inner());
            format!("data:image/jpeg;base64,{}", b64)
        } else {
            cursor.set_position(0);
            cursor.get_mut().clear();
            if resized.write_to(&mut cursor, image::ImageFormat::Png).is_ok() {
                let b64 = base64::engine::general_purpose::STANDARD.encode(cursor.into_inner());
                format!("data:image/png;base64,{}", b64)
            } else {
                String::new()
            }
        };

        Ok(Some(ClipboardImageItem {
            id,
            path: img_path.to_string_lossy().to_string(),
            thumbnail,
            width,
            height,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn copy_image_to_clipboard(app: tauri::AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_clipboard_manager::ClipboardExt;

        let img = image::open(&path).map_err(|e| e.to_string())?.to_rgba8();
        let (w, h) = img.dimensions();
        let tauri_img = tauri::image::Image::new(img.as_raw(), w, h);
        app.clipboard().write_image(&tauri_img).map_err(|e| e.to_string())?;

        let current_seq = unsafe { windows::Win32::System::DataExchange::GetClipboardSequenceNumber() };
        INTERNAL_CLIPBOARD_SEQ.store(current_seq, std::sync::atomic::Ordering::Relaxed);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn extract_image_text(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = std::path::Path::new(&path);
        if !p.exists() {
            return Err("Image file does not exist".to_string());
        }

        // Check if image dimensions exceed Windows OCR limit (~2600px).
        // If > 2500px, downscale to a temporary file so OCR succeeds without error.
        let mut temp_resized_path: Option<std::path::PathBuf> = None;
        let ocr_file_path = if let Ok(reader) = image::ImageReader::open(p) {
            if let Ok(dimensions) = reader.into_dimensions() {
                let (w, h) = dimensions;
                if w > 2500 || h > 2500 {
                    if let Ok(img) = image::open(p) {
                        let scale = 2500.0 / (w.max(h) as f32);
                        let tw = ((w as f32 * scale).round() as u32).max(1);
                        let th = ((h as f32 * scale).round() as u32).max(1);
                        let resized = img.resize(tw, th, image::imageops::FilterType::Triangle);
                        let temp_path = std::env::temp_dir().join(format!("gili_ocr_tmp_{}_{}.png", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()));
                        if resized.save(&temp_path).is_ok() {
                            temp_resized_path = Some(temp_path.clone());
                            temp_path
                        } else {
                            p.to_path_buf()
                        }
                    } else {
                        p.to_path_buf()
                    }
                } else {
                    p.to_path_buf()
                }
            } else {
                p.to_path_buf()
            }
        } else {
            p.to_path_buf()
        };

        let ocr_result = (|| -> Result<String, String> {
            use windows::Graphics::Imaging::BitmapDecoder;
            use windows::Media::Ocr::OcrEngine;
            use windows::Storage::{StorageFile, FileAccessMode};
            use std::os::windows::ffi::OsStrExt;
            use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

            let com_init = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };

            let res = (|| -> Result<String, String> {
                let wide_path: Vec<u16> = ocr_file_path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
                let hstring_path = windows::core::HSTRING::from_wide(&wide_path[..wide_path.len() - 1]).map_err(|e| e.to_string())?;

                let file = StorageFile::GetFileFromPathAsync(&hstring_path).map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
                let stream = file.OpenAsync(FileAccessMode::Read).map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;

                let decoder = BitmapDecoder::CreateAsync(&stream).map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
                let software_bitmap = decoder.GetSoftwareBitmapAsync().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;

                let engine = OcrEngine::TryCreateFromUserProfileLanguages().map_err(|e| e.to_string())?;

                let raw_ptr: *mut std::ffi::c_void = unsafe { std::mem::transmute_copy(&engine) };
                if raw_ptr.is_null() {
                    return Err("OCR engine is not supported or language pack is missing".to_string());
                }

                let result = engine.RecognizeAsync(&software_bitmap).map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
                let lines = result.Lines().map_err(|e| e.to_string())?;

                let mut min_x = f32::MAX;
                let mut total_chars = 0;
                let mut total_width = 0.0;

                for line in &lines {
                    if let Ok(words) = line.Words() {
                        for word in &words {
                            if let Ok(rect) = word.BoundingRect() {
                                if rect.X < min_x {
                                    min_x = rect.X;
                                }
                                if let Ok(text) = word.Text() {
                                    let text_str = text.to_string();
                                    if !text_str.is_empty() {
                                        total_chars += text_str.chars().count();
                                        total_width += rect.Width;
                                    }
                                }
                            }
                        }
                    }
                }

                let avg_char_width = if total_chars > 0 {
                    let avg = total_width / (total_chars as f32);
                    if avg < 1.0 { 1.0 } else { avg }
                } else {
                    10.0
                };

                if min_x == f32::MAX {
                    min_x = 0.0;
                }

                let mut formatted_text = String::new();

                for line in &lines {
                    if let Ok(words) = line.Words() {
                        let mut current_x = min_x;
                        let mut line_text = String::new();
                        for word in words {
                            if let Ok(rect) = word.BoundingRect() {
                                let x = rect.X;
                                if x > current_x {
                                    let space_count = ((x - current_x) / avg_char_width).round() as i32;
                                    if space_count > 0 {
                                        let count = space_count.min(100) as usize;
                                        line_text.push_str(&" ".repeat(count));
                                    }
                                }
                                if let Ok(text) = word.Text() {
                                    let text_str = text.to_string();
                                    line_text.push_str(&text_str);
                                    current_x = x + rect.Width;
                                }
                            }
                        }
                        formatted_text.push_str(line_text.trim_end());
                        formatted_text.push('\n');
                    }
                }

                Ok(formatted_text.trim_end().to_string())
            })();

            if com_init {
                unsafe { CoUninitialize(); }
            }

            res
        })();

        if let Some(temp) = temp_resized_path {
            let _ = std::fs::remove_file(temp);
        }

        ocr_result
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn extract_clipboard_text(app: tauri::AppHandle) -> Result<String, String> {
    if let Some(clip_img) = read_clipboard_image(app).await? {
        extract_image_text(clip_img.path).await
    } else {
        Err("No image in clipboard".to_string())
    }
}

static LAST_ACTIVE_SMTC: std::sync::Mutex<(String, String)> = std::sync::Mutex::new((String::new(), String::new()));
static LAST_SMTC_SEEK: std::sync::Mutex<Option<(std::time::Instant, f64)>> = std::sync::Mutex::new(None);

fn is_smtc_session_playing(playback: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackInfo) -> bool {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;
    let status = playback.PlaybackStatus().unwrap_or(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed);
    let is_status_paused = status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused;
    let (is_play_enabled, is_pause_enabled) = playback.Controls()
        .map(|c| (c.IsPlayEnabled().unwrap_or(false), c.IsPauseEnabled().unwrap_or(false)))
        .unwrap_or((false, false));

    if is_status_paused {
        false
    } else if is_play_enabled && !is_pause_enabled {
        false
    } else if let Ok(rate_ref) = playback.PlaybackRate() {
        if let Ok(rate) = rate_ref.Value() {
            if rate == 0.0 {
                return false;
            }
        }
        if !is_play_enabled && is_pause_enabled {
            true
        } else {
            status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
        }
    } else if !is_play_enabled && is_pause_enabled {
        true
    } else {
        status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
    }
}

fn resolve_smtc_session(
    manager: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager,
) -> Option<windows::Media::Control::GlobalSystemMediaTransportControlsSession> {
    if let Ok(sessions) = manager.GetSessions() {
        for s in sessions.into_iter() {
            if let Ok(playback) = s.GetPlaybackInfo() {
                if is_smtc_session_playing(&playback) {
                    return Some(s);
                }
            }
        }
    }

    if let Ok(last) = LAST_ACTIVE_SMTC.lock() {
        if !last.0.is_empty() {
            if let Ok(sessions) = manager.GetSessions() {
                for s in sessions.into_iter() {
                    if let Ok(playback) = s.GetPlaybackInfo() {
                        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;
                        if playback.PlaybackStatus().unwrap_or(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed) == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed {
                            continue;
                        }
                    }
                    if let Ok(info) = s.TryGetMediaPropertiesAsync().and_then(|r| r.get()) {
                        let t = info.Title().unwrap_or_default().to_string();
                        let a = info.Artist().unwrap_or_default().to_string();
                        if t == last.0 && a == last.1 {
                            return Some(s);
                        }
                    }
                }
            }
        }
    }

    if let Ok(curr) = manager.GetCurrentSession() {
        if let Ok(playback) = curr.GetPlaybackInfo() {
            use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;
            if playback.PlaybackStatus().unwrap_or(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed) != GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed {
                return Some(curr);
            }
        }
    }
    None
}

#[tauri::command]
async fn smtc_action(action: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };

        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        let session = resolve_smtc_session(&manager).ok_or_else(|| "No media session found".to_string())?;

        match action.as_str() {
            "toggle" => { let _ = session.TryTogglePlayPauseAsync().map_err(|e| e.to_string())?.get(); },
            "play" => { let _ = session.TryPlayAsync().map_err(|e| e.to_string())?.get(); },
            "pause" => { let _ = session.TryPauseAsync().map_err(|e| e.to_string())?.get(); },
            "next" => { let _ = session.TrySkipNextAsync().map_err(|e| e.to_string())?.get(); },
            "prev" => { let _ = session.TrySkipPreviousAsync().map_err(|e| e.to_string())?.get(); },
            _ => return Err("Unknown action".to_string()),
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn fetch_external_lyrics_api(
    url: String,
    method: Option<String>,
    headers: Option<std::collections::HashMap<String, String>>,
    body: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(6))
            .build();

        let req_method = method.unwrap_or_else(|| "GET".to_string()).to_uppercase();
        let mut request = match req_method.as_str() {
            "POST" => agent.post(&url),
            _ => agent.get(&url),
        };

        if let Some(hdrs) = headers {
            for (k, v) in hdrs {
                request = request.set(&k, &v);
            }
        }

        let response = if req_method == "POST" {
            if let Some(b) = body {
                request.send_string(&b)
            } else {
                request.call()
            }
        } else {
            request.call()
        };

        match response {
            Ok(resp) => resp
                .into_string()
                .map_err(|e| format!("Failed to read response body: {}", e)),
            Err(e) => Err(format!("HTTP request error: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn smtc_seek(position_sec: f64) -> Result<(), String> {
    if let Ok(mut guard) = LAST_SMTC_SEEK.lock() {
        *guard = Some((std::time::Instant::now(), position_sec.max(0.0)));
    }
    tauri::async_runtime::spawn_blocking(move || {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };

        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        let session = resolve_smtc_session(&manager).ok_or_else(|| "No media session found".to_string())?;

        let start_ticks = session
            .GetTimelineProperties()
            .ok()
            .and_then(|t| t.StartTime().ok())
            .map(|d| d.Duration)
            .unwrap_or(0);
        let ticks = start_ticks + (position_sec.max(0.0) * 10_000_000.0) as i64;
        let _ = session.TryChangePlaybackPositionAsync(ticks).map_err(|e| e.to_string())?.get();

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

static LAST_TEXT_SCALE: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(100);
static LAST_TEXT_SCALE_CHECK: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn get_system_text_scale() -> f64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_TEXT_SCALE_CHECK.load(std::sync::atomic::Ordering::Relaxed);
    if now.saturating_sub(last) > 1000 {
        LAST_TEXT_SCALE_CHECK.store(now, std::sync::atomic::Ordering::Relaxed);
        let scale = windows::UI::ViewManagement::UISettings::new()
            .and_then(|u| u.TextScaleFactor())
            .unwrap_or(1.0);
        let scale_percent = (scale * 100.0).round() as u32;
        LAST_TEXT_SCALE.store(scale_percent, std::sync::atomic::Ordering::Relaxed);
        scale
    } else {
        (LAST_TEXT_SCALE.load(std::sync::atomic::Ordering::Relaxed) as f64) / 100.0
    }
}

#[derive(Clone, Copy, Debug)]
pub struct PillState {
    pub width: f32,
    pub height: f32,
    pub is_bottom: bool,
    pub top_offset: f32,
    pub is_island: bool,
    pub dpr: f32,
}

impl Default for PillState {
    fn default() -> Self {
        Self {
            width: 120.0,
            height: 35.0,
            is_bottom: false,
            top_offset: 0.0,
            is_island: false,
            dpr: 1.0,
        }
    }
}

pub struct PillSize(pub std::sync::Mutex<PillState>);

fn position_notch_window(window: &tauri::WebviewWindow, is_bottom: bool, top_offset_phys: i32) {
    if let Ok(Some(monitor)) = window.current_monitor() {
        let work_area = monitor.work_area();
        let physical_size = monitor.size();
        let physical_pos = monitor.position();
        let window_size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(1200, 760));

        let x = physical_pos.x + (physical_size.width as i32 - window_size.width as i32) / 2;
        let y = if is_bottom {
            let base = work_area.position.y + (work_area.size.height as i32 - window_size.height as i32);
            base - top_offset_phys
        } else {
            physical_pos.y + top_offset_phys
        };

        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
    }
}

#[tauri::command]
fn set_window_position(
    is_bottom: bool,
    top_offset: Option<f32>,
    is_island: Option<bool>,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, PillSize>,
) {
    if window.label() != "main" {
        return;
    }
    let top_offset = top_offset.unwrap_or(0.0);
    let is_island = is_island.unwrap_or(false);
    let dpr = if let Ok(mut size) = state.0.lock() {
        size.is_bottom = is_bottom;
        size.top_offset = top_offset;
        size.is_island = is_island;
        size.dpr
    } else {
        1.0
    };
    let sf = window.scale_factor().unwrap_or(1.0);
    let effective_sf = if dpr > 0.0 { (dpr as f64).max(sf) } else { sf * get_system_text_scale() };
    let phys_offset = if is_island { (top_offset as f64 * effective_sf).round() as i32 } else { 0 };
    position_notch_window(&window, is_bottom, phys_offset);
}

#[tauri::command]
fn update_pill_size(
    width: f32,
    height: f32,
    is_bottom: bool,
    top_offset: Option<f32>,
    is_island: Option<bool>,
    dpr: Option<f32>,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, PillSize>,
) {
    if window.label() != "main" {
        return;
    }
    let top_offset = top_offset.unwrap_or(0.0);
    let is_island = is_island.unwrap_or(false);
    let dpr = dpr.unwrap_or(0.0);
    if let Ok(mut size) = state.0.lock() {
        let should_reposition = size.top_offset != top_offset || size.is_island != is_island || size.is_bottom != is_bottom;
        size.width = width;
        size.height = height;
        size.is_bottom = is_bottom;
        size.top_offset = top_offset;
        size.is_island = is_island;
        if dpr > 0.0 {
            size.dpr = dpr;
        }

        if should_reposition {
            let sf = window.scale_factor().unwrap_or(1.0);
            let effective_sf = if size.dpr > 0.0 { (size.dpr as f64).max(sf) } else { sf * get_system_text_scale() };
            let phys_offset = if is_island { (top_offset as f64 * effective_sf).round() as i32 } else { 0 };
            position_notch_window(&window, is_bottom, phys_offset);
        }
    }
}

fn calculate_notch_hit(
    pt: windows::Win32::Foundation::POINT,
    win_pos: tauri::PhysicalPosition<i32>,
    win_size: tauri::PhysicalSize<u32>,
    sf: f64,
    pill: &PillState,
) -> bool {
    let effective_sf = if pill.dpr > 0.0 {
        (pill.dpr as f64).max(sf)
    } else {
        sf * get_system_text_scale()
    };

    let pill_w = (pill.width as f64 * effective_sf) as i32;
    let pill_h = (pill.height as f64 * effective_sf) as i32;

    let (hit_w, hit_h, margin) = if pill.height <= 10.0 {
        (pill_w, pill_h, 0)
    } else {
        (pill_w, pill_h, (6.0 * effective_sf) as i32)
    };

    let pill_x = win_pos.x + (win_size.width as i32 - hit_w) / 2;
    let pill_y = if pill.is_bottom {
        win_pos.y + (win_size.height as i32) - hit_h
    } else {
        win_pos.y
    };

    // All idle, media, lyrics, alert, and toast pills are <= 95px height
    let is_closed = pill.height <= 95.0;

    let phys_offset = if pill.is_island {
        (pill.top_offset as f64 * effective_sf).round() as i32
    } else {
        0
    };

    let side_tolerance = if is_closed {
        (12.0 * effective_sf) as i32
    } else {
        (10.0 * effective_sf) as i32
    };

    let min_x = pill_x - margin - side_tolerance;
    let max_x = pill_x + hit_w + margin + side_tolerance;

    let (min_y, max_y) = if pill.is_bottom {
        let bottom_extra = (phys_offset + (18.0 * effective_sf) as i32).max((22.0 * effective_sf) as i32);
        let top_extra = if is_closed { (4.0 * effective_sf) as i32 } else { (10.0 * effective_sf) as i32 };
        (pill_y - margin - top_extra, pill_y + hit_h + margin + bottom_extra)
    } else {
        // When docked or floating at top, extend upwards all the way to screen edge and beyond (+18px buffer)
        // so hovering/touching anywhere in the 10+ px gap above the floating notch triggers reliably
        let top_extra = (phys_offset + (18.0 * effective_sf) as i32).max((22.0 * effective_sf) as i32);
        let bottom_extra = if is_closed { (6.0 * effective_sf) as i32 } else { (12.0 * effective_sf) as i32 };
        (pill_y - top_extra, pill_y + hit_h + margin + bottom_extra)
    };

    pt.x >= min_x && pt.x <= max_x && pt.y >= min_y && pt.y <= max_y
}

#[cfg(windows)]
fn is_window_click_through(window: &tauri::WebviewWindow) -> Option<bool> {
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TRANSPARENT};
    let hwnd = windows::Win32::Foundation::HWND(window.hwnd().ok()?.0);
    let ex_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32;
    Some(ex_style & WS_EX_TRANSPARENT.0 != 0)
}

// After click-through is lifted, WebView2 ignores a resting cursor until the next WM_MOUSEMOVE,
// so a touchpad tap right after entering the notch gets lost. A zero-distance move wakes it up.
#[cfg(windows)]
fn nudge_cursor() {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_MOVE, MOUSEINPUT,
    };
    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT { dx: 0, dy: 0, mouseData: 0, dwFlags: MOUSEEVENTF_MOVE, time: 0, dwExtraInfo: 0 },
        },
    };
    unsafe {
        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

static IS_SHELF_DRAGGING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
fn set_shelf_drag(active: bool, window: tauri::WebviewWindow) {
    IS_SHELF_DRAGGING.store(active, std::sync::atomic::Ordering::SeqCst);
    if active {
        let _ = window.set_ignore_cursor_events(true);
    } else {
        ensure_window_topmost(&window);
    }
}

#[cfg(windows)]
fn is_foreground_window_fullscreen(own_hwnd: windows::Win32::Foundation::HWND) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetDesktopWindow, GetForegroundWindow, GetShellWindow, GetWindowRect,
    };
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::Foundation::RECT;

    unsafe {
        let fg = GetForegroundWindow();
        if fg.0.is_null() || fg == own_hwnd || fg == GetDesktopWindow() || fg == GetShellWindow() {
            return false;
        }
        let mut class_buf = [0u16; 64];
        let len = GetClassNameW(fg, &mut class_buf);
        if len > 0 {
            let class_name = String::from_utf16_lossy(&class_buf[..len as usize]);
            if class_name == "Progman" || class_name == "WorkerW" || class_name == "Shell_TrayWnd" {
                return false;
            }
        }
        let mut rect = RECT::default();
        if GetWindowRect(fg, &mut rect).is_ok() {
            let monitor = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
            let mut mi = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if GetMonitorInfoW(monitor, &mut mi).as_bool() {
                let mr = mi.rcMonitor;
                return rect.left <= mr.left
                    && rect.top <= mr.top
                    && rect.right >= mr.right
                    && rect.bottom >= mr.bottom;
            }
        }
        false
    }
}

pub fn ensure_window_topmost(window: &tauri::WebviewWindow) {
    if IS_SHELF_DRAGGING.load(std::sync::atomic::Ordering::Relaxed) {
        return;
    }
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE
        };
        if let Ok(hwnd) = window.hwnd() {
            let win32_hwnd = windows::Win32::Foundation::HWND(hwnd.0);
            if is_foreground_window_fullscreen(win32_hwnd) {
                return;
            }
            unsafe {
                let _ = SetWindowPos(
                    win32_hwnd,
                    HWND_TOPMOST,
                    0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
        }
    }
}

#[tauri::command]
fn enforce_always_on_top(window: tauri::WebviewWindow) {
    ensure_window_topmost(&window);
}

#[tauri::command]
fn activate_notification_app(app_name: String, aumid: Option<String>) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        use windows::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM, MAX_PATH};
        use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;
        use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};
        use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_MENU};
        use windows::Win32::UI::WindowsAndMessaging::{
            EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
            SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW,
        };

        let target_name = app_name.trim().to_lowercase();
        let target_aumid = aumid.clone().unwrap_or_default().trim().to_lowercase();

        struct SearchCtx {
            target_name: String,
            target_aumid: String,
            found_hwnd: Option<HWND>,
        }

        unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let ctx = &mut *(lparam.0 as *mut SearchCtx);
            if !IsWindowVisible(hwnd).as_bool() {
                return BOOL(1);
            }

            let mut title_buf = [0u16; 256];
            let title_len = GetWindowTextW(hwnd, &mut title_buf);
            if title_len <= 0 {
                return BOOL(1);
            }
            let win_title = String::from_utf16_lossy(&title_buf[..title_len as usize]);
            let win_title_lower = win_title.trim().to_lowercase();
            if win_title_lower == "gili"
                || win_title_lower == "notch"
                || win_title_lower == "program manager"
                || win_title_lower == "windows input experience"
            {
                return BOOL(1);
            }

            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            let mut exe_stem = String::new();
            if pid != 0 {
                if let Ok(handle) = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid) {
                    let mut path_buf = [0u16; MAX_PATH as usize];
                    let len = GetModuleFileNameExW(handle, None, &mut path_buf);
                    if len > 0 {
                        let full = String::from_utf16_lossy(&path_buf[..len as usize]);
                        if let Some(stem) = std::path::Path::new(&full).file_stem() {
                            exe_stem = stem.to_string_lossy().to_lowercase();
                        }
                    }
                    let _ = CloseHandle(handle);
                }
            }

            let is_generic_host = matches!(
                exe_stem.as_str(),
                "" | "applicationframehost" | "explorer" | "svchost" | "system" | "msedgewebview2" | "notch" | "gili"
            );

            let mut matched = false;
            if !ctx.target_name.is_empty() && ctx.target_name.len() >= 2 {
                if win_title_lower == ctx.target_name
                    || win_title_lower.ends_with(&format!(" - {}", ctx.target_name))
                    || (ctx.target_name.len() >= 4 && win_title_lower.contains(&ctx.target_name))
                {
                    matched = true;
                }
                if !matched && !is_generic_host && exe_stem.len() >= 3 && (ctx.target_name.contains(&exe_stem) || exe_stem.contains(&ctx.target_name)) {
                    matched = true;
                }
            }

            if !matched && !ctx.target_aumid.is_empty() && !is_generic_host && exe_stem.len() >= 3 && ctx.target_aumid.contains(&exe_stem) {
                matched = true;
            }

            if matched {
                ctx.found_hwnd = Some(hwnd);
                return BOOL(0);
            }
            BOOL(1)
        }

        let mut ctx = SearchCtx {
            target_name: target_name.clone(),
            target_aumid,
            found_hwnd: None,
        };

        unsafe {
            let _ = EnumWindows(Some(enum_windows_proc), LPARAM(&mut ctx as *mut SearchCtx as isize));
            if let Some(hwnd) = ctx.found_hwnd {
                if IsIconic(hwnd).as_bool() {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                } else {
                    let _ = ShowWindow(hwnd, SW_SHOW);
                }
                keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
                let _ = SetForegroundWindow(hwnd);
                keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
                return true;
            }
        }

        if let Some(raw_aumid) = aumid {
            let trimmed = raw_aumid.trim();
            if !trimmed.is_empty()
                && trimmed.chars().all(|c| c.is_alphanumeric() || matches!(c, '.' | '_' | '-' | '!' | ' '))
                && Command::new("explorer.exe")
                    .creation_flags(0x08000000)
                    .arg(format!("shell:AppsFolder\\{}", trimmed))
                    .spawn()
                    .is_ok()
            {
                return true;
            }
        }

        let proto = match target_name.as_str() {
            "whatsapp" => Some("whatsapp://"),
            "telegram" | "tg" => Some("tg://"),
            "discord" => Some("discord://"),
            "spotify" => Some("spotify://"),
            "slack" => Some("slack://"),
            "teams" | "msteams" | "microsoft teams" => Some("msteams://"),
            "zoom" => Some("zoommtg://"),
            "line" => Some("line://"),
            "steam" => Some("steam://"),
            "vscode" | "code" | "visual studio code" => Some("vscode://"),
            "outlook" | "mail" => Some("mailto:"),
            _ => None,
        };

        if let Some(p) = proto {
            if Command::new("cmd.exe")
                .creation_flags(0x08000000)
                .args(["/c", "start", "", p])
                .spawn()
                .is_ok()
            {
                return true;
            }
        }
    }
    false
}

#[allow(dead_code)]
fn _unused_marker() {
}



#[tauri::command]
fn get_battery_status() -> Option<(bool, u8)> {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut power_status = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut power_status).is_ok() } {
        // BatteryFlag: 128 = No system battery, 255 = Unknown status
        // BatteryLifePercent: 255 = Unknown / no battery on desktop PC
        if (power_status.BatteryFlag & 128 != 0) || power_status.BatteryLifePercent > 100 {
            return None;
        }
        let is_charging = power_status.ACLineStatus == 1;
        let percent = power_status.BatteryLifePercent;
        Some((is_charging, percent))
    } else {
        None
    }
}

#[tauri::command]
async fn get_privacy_status() -> (bool, bool) {
    tauri::async_runtime::spawn_blocking(|| {
        let procs = privacy::get_running_process_entries();
        let (cam, _, _) = privacy::check_cam_active_with_procs(&procs);
        let (mic, _, _) = privacy::check_mic_active_with_procs(&procs, true, false);
        (cam, mic)
    })
    .await
    .unwrap_or((false, false))
}

#[tauri::command]
fn get_privacy_debug_info() -> privacy::PrivacyDebugReport {
    privacy::get_debug_report()
}

#[tauri::command]
fn set_master_volume(level: f32) {
    tauri::async_runtime::spawn_blocking(move || {
        use windows::Win32::Media::Audio::{eRender, eMultimedia, IMMDeviceEnumerator, MMDeviceEnumerator};
        use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
        use windows::Win32::System::Com::{CoInitializeEx, CoCreateInstance, COINIT_MULTITHREADED, CLSCTX_ALL};
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            if let Ok(enumerator) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) {
                if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                    if let Ok(volume_ctrl) = device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) {
                        let level = level.clamp(0.0, 1.0);
                        let _ = volume_ctrl.SetMasterVolumeLevelScalar(level, std::ptr::null());
                    }
                }
            }
        }
    });
}


#[tauri::command]
async fn get_master_volume() -> f32 {
    tauri::async_runtime::spawn_blocking(|| {
        use windows::Win32::Media::Audio::{eRender, eMultimedia, IMMDeviceEnumerator, MMDeviceEnumerator};
        use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
        use windows::Win32::System::Com::{CoInitializeEx, CoCreateInstance, COINIT_MULTITHREADED, CLSCTX_ALL};
        let mut vol = 0.5;
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            if let Ok(enumerator) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) {
                if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                    if let Ok(volume_ctrl) = device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) {
                        if let Ok(level) = volume_ctrl.GetMasterVolumeLevelScalar() {
                            vol = level;
                        }
                    }
                }
            }
        }
        vol
    })
    .await
    .unwrap_or(0.5)
}


static LAST_BRIGHTNESS: std::sync::Mutex<Option<(std::time::Instant, u8)>> = std::sync::Mutex::new(None);
static IS_FETCHING_BRIGHTNESS: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
fn get_brightness(app_handle: tauri::AppHandle) -> u8 {
    let mut cached = None;
    let mut needs_refresh = false;

    if let Ok(guard) = LAST_BRIGHTNESS.lock() {
        if let Some((instant, val)) = &*guard {
            cached = Some(*val);
            if instant.elapsed() >= std::time::Duration::from_secs(5) {
                needs_refresh = true;
            }
        } else {
            needs_refresh = true;
        }
    }

    if needs_refresh && !IS_FETCHING_BRIGHTNESS.swap(true, std::sync::atomic::Ordering::SeqCst) {
        let app_clone = app_handle.clone();
        tauri::async_runtime::spawn_blocking(move || {
            use wmi::WMIConnection;
            use serde::Deserialize;
            use tauri::Emitter;

            #[derive(Deserialize)]
            #[allow(non_snake_case)]
            struct WmiMonitorBrightness {
                CurrentBrightness: u8,
            }

            let mut brightness = 50;
            if let Ok(wmi_con) = WMIConnection::with_namespace_path("ROOT\\WMI") {
                if let Ok(results) = wmi_con.raw_query::<WmiMonitorBrightness>("SELECT CurrentBrightness FROM WmiMonitorBrightness") {
                    if let Some(result) = results.first() {
                        brightness = result.CurrentBrightness;
                    }
                }
            }

            if let Ok(mut guard) = LAST_BRIGHTNESS.lock() {
                *guard = Some((std::time::Instant::now(), brightness));
            }
            IS_FETCHING_BRIGHTNESS.store(false, std::sync::atomic::Ordering::SeqCst);
            let _ = app_clone.emit("brightness-update", brightness);
        });
    }

    cached.unwrap_or(50)
}

#[tauri::command]
fn set_brightness(level: u8) {
    if let Ok(mut guard) = LAST_BRIGHTNESS.lock() {
        *guard = Some((std::time::Instant::now(), level));
    }
    tauri::async_runtime::spawn_blocking(move || {
        use wmi::WMIConnection;
        use serde::{Deserialize, Serialize};

        #[derive(Deserialize)]
        #[allow(non_snake_case)]
        struct WmiMonitorBrightnessMethods {
            __Path: String,
        }

        #[derive(Serialize)]
        #[allow(non_snake_case)]
        struct SetBrightnessParams {
            Timeout: u32,
            Brightness: u8,
        }

        if let Ok(wmi_con) = WMIConnection::with_namespace_path("ROOT\\WMI") {
            if let Ok(results) = wmi_con.raw_query::<WmiMonitorBrightnessMethods>("SELECT * FROM WmiMonitorBrightnessMethods") {
                if let Some(monitor) = results.first() {
                    let params = SetBrightnessParams {
                        Timeout: 1,
                        Brightness: level,
                    };
                    let _ = wmi_con.exec_instance_method::<WmiMonitorBrightnessMethods, ()>(&monitor.__Path, "WmiSetBrightness", &params);
                }
            }
        }
    });
}

#[tauri::command]
fn system_power_action(action: &str) {
    use std::process::Command;
    use std::os::windows::process::CommandExt;
    match action {
        "lock" => { let _ = Command::new("rundll32.exe").creation_flags(0x08000000).args(["user32.dll,LockWorkStation"]).spawn(); },
        "sleep" => { let _ = Command::new("rundll32.exe").creation_flags(0x08000000).args(["powrprof.dll,SetSuspendState", "0,1,0"]).spawn(); },
        "restart" => { let _ = Command::new("shutdown").creation_flags(0x08000000).args(["/r", "/t", "0"]).spawn(); },
        "shutdown" => { let _ = Command::new("shutdown").creation_flags(0x08000000).args(["/s", "/t", "0"]).spawn(); },
        "screenshot" => { let _ = Command::new("cmd.exe").creation_flags(0x08000000).args(["/c", "start", "ms-screenclip:"]).spawn(); },
        "wifi" => { let _ = Command::new("cmd.exe").creation_flags(0x08000000).args(["/c", "start", "ms-settings:network-wifi"]).spawn(); },
        "settings" => { let _ = Command::new("cmd.exe").creation_flags(0x08000000).args(["/c", "start", "ms-settings:"]).spawn(); },
        "bluetooth" => { let _ = Command::new("cmd.exe").creation_flags(0x08000000).args(["/c", "start", "ms-settings:bluetooth"]).spawn(); },
        "hotspot" => { let _ = Command::new("cmd.exe").creation_flags(0x08000000).args(["/c", "start", "ms-settings:network-mobilehotspot"]).spawn(); },
        "focus" => { let _ = Command::new("cmd.exe").creation_flags(0x08000000).args(["/c", "start", "ms-settings:quiethours"]).spawn(); },
        _ => {}
    }
}

#[tauri::command]
fn set_power_plan(mode: &str) {
    use windows::Win32::System::Power::PowerSetActiveScheme;
    use windows::core::GUID;
    
    let eco_guid = GUID::from_values(0xa1841308, 0x3541, 0x4fab, [0xbc, 0x81, 0xf7, 0x15, 0x56, 0xf2, 0x0b, 0x4a]);
    let perf_guid = GUID::from_values(0x8c5e7fda, 0xe8bf, 0x4a96, [0x9a, 0x85, 0xa6, 0xe2, 0x3a, 0x8c, 0x63, 0x5c]);
    let balanced_guid = GUID::from_values(0x381b4222, 0xf694, 0x41f0, [0x96, 0x85, 0xff, 0x5b, 0xb2, 0x60, 0xdf, 0x2e]);
    
    let target_guid = match mode {
        "Eco" => &eco_guid,
        "Performance" => &perf_guid,
        _ => &balanced_guid,
    };
    
    unsafe {
        let _ = PowerSetActiveScheme(None, Some(target_guid));
    }
}

#[tauri::command]
fn get_username() -> String {
    std::env::var("USERNAME").unwrap_or_else(|_| "User".to_string())
}

static LAST_SYS_INFO: std::sync::Mutex<Option<(std::time::Instant, (String, String))>> = std::sync::Mutex::new(None);
static IS_FETCHING_SYS_INFO: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn get_connected_bluetooth_devices() -> Vec<(String, Option<u8>)> {
    use windows::core::GUID;
    use windows::Win32::Devices::DeviceAndDriverInstallation::{
        SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW,
        SetupDiGetDevicePropertyW, SetupDiGetDeviceRegistryPropertyW, DIGCF_PRESENT,
        SPDRP_FRIENDLYNAME, SP_DEVINFO_DATA,
    };
    use windows::Win32::Devices::Properties::{DEVPROPKEY, DEVPROPTYPE};

    let bt_class_guid = GUID::from_values(
        0xe0cbf06c,
        0xcd8b,
        0x4647,
        [0xbb, 0x8a, 0x26, 0x3b, 0x43, 0xf0, 0xf9, 0x74],
    );
    let devpkey_is_connected = DEVPROPKEY {
        fmtid: GUID::from_values(
            0x83da6326,
            0x97a6,
            0x4088,
            [0x94, 0x53, 0xa1, 0x92, 0x3f, 0x57, 0x3b, 0x29],
        ),
        pid: 15,
    };
    let devpkey_bt_battery = DEVPROPKEY {
        fmtid: GUID::from_values(
            0x1032a323,
            0xa72c,
            0x4ba9,
            [0xa7, 0xae, 0xa5, 0x04, 0xb6, 0x79, 0xb6, 0xa1],
        ),
        pid: 1,
    };

    let mut connected_names: Vec<String> = Vec::new();
    let mut batteries = std::collections::HashMap::<String, u8>::new();

    unsafe {
        let dev_info = match SetupDiGetClassDevsW(Some(&bt_class_guid), None, None, DIGCF_PRESENT) {
            Ok(h) if !h.is_invalid() => h,
            _ => return Vec::new(),
        };

        let mut index = 0;
        loop {
            let mut dev_data = SP_DEVINFO_DATA {
                cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
                ..Default::default()
            };
            if SetupDiEnumDeviceInfo(dev_info, index, &mut dev_data).is_err() {
                break;
            }
            index += 1;

            let mut name_buf = [0u8; 512];
            if SetupDiGetDeviceRegistryPropertyW(
                dev_info,
                &dev_data,
                SPDRP_FRIENDLYNAME,
                None,
                Some(&mut name_buf),
                None,
            )
            .is_err()
            {
                continue;
            }

            let u16_slice = std::slice::from_raw_parts(
                name_buf.as_ptr() as *const u16,
                name_buf.len() / 2,
            );
            let len = u16_slice.iter().position(|&c| c == 0).unwrap_or(u16_slice.len());
            let friendly_name = String::from_utf16_lossy(&u16_slice[..len]).trim().to_string();
            if friendly_name.is_empty() {
                continue;
            }

            let lower = friendly_name.to_lowercase();
            if lower.contains("adapter")
                || lower.contains("enumerator")
                || lower.contains("microsoft")
                || lower.contains("rfcomm")
                || lower.contains("generic bluetooth")
                || lower.contains("wireless bluetooth")
                || lower.contains("avrcp")
            {
                continue;
            }

            let mut prop_type = DEVPROPTYPE::default();
            let mut bat_buf = [0u8; 4];
            if SetupDiGetDevicePropertyW(
                dev_info,
                &dev_data,
                &devpkey_bt_battery,
                &mut prop_type,
                Some(&mut bat_buf),
                None,
                0,
            )
            .is_ok()
            {
                let pct = bat_buf[0];
                if pct > 0 && pct <= 100 {
                    batteries.insert(friendly_name.clone(), pct);
                }
            }

            let mut conn_buf = [0u8; 4];
            if SetupDiGetDevicePropertyW(
                dev_info,
                &dev_data,
                &devpkey_is_connected,
                &mut prop_type,
                Some(&mut conn_buf),
                None,
                0,
            )
            .is_ok()
                && conn_buf[0] != 0
                && !connected_names.contains(&friendly_name)
            {
                connected_names.push(friendly_name);
            }
        }

        let _ = SetupDiDestroyDeviceInfoList(dev_info);
    }

    connected_names
        .into_iter()
        .map(|name| {
            let bat = batteries.get(&name).copied();
            (name, bat)
        })
        .collect()
}

#[tauri::command]
fn get_system_info(app_handle: tauri::AppHandle) -> (String, String) {
    let mut cached = None;
    let mut needs_refresh = false;

    if let Ok(guard) = LAST_SYS_INFO.lock() {
        if let Some((instant, info)) = &*guard {
            cached = Some(info.clone());
            if instant.elapsed() >= std::time::Duration::from_secs(6) {
                needs_refresh = true;
            }
        } else {
            needs_refresh = true;
        }
    }

    if needs_refresh && !IS_FETCHING_SYS_INFO.swap(true, std::sync::atomic::Ordering::SeqCst) {
        let app_clone = app_handle.clone();
        tauri::async_runtime::spawn_blocking(move || {
            use std::process::Command;
            use std::os::windows::process::CommandExt;
            use tauri::Emitter;

            // Wifi
            let mut wifi_name = "Not Connected".to_string();
            if let Ok(output) = Command::new("netsh").creation_flags(0x08000000).args(["wlan", "show", "interfaces"]).output() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut current_state_connected = false;
                let mut current_ssid = String::new();
                for raw_line in stdout.lines() {
                    let line = raw_line.trim();
                    if line.starts_with("Name") && line.contains(':') {
                        if current_state_connected && !current_ssid.is_empty() {
                            wifi_name = current_ssid.clone();
                            break;
                        }
                        current_state_connected = false;
                        current_ssid.clear();
                    } else if line.starts_with("State") {
                        if let Some((_, val)) = line.split_once(':') {
                            current_state_connected = val.trim().eq_ignore_ascii_case("connected");
                        }
                    } else if line.starts_with("SSID") && !line.starts_with("BSSID") {
                        if let Some((_, val)) = line.split_once(':') {
                            current_ssid = val.trim().to_string();
                        }
                    }
                }
                if wifi_name == "Not Connected" && current_state_connected && !current_ssid.is_empty() {
                    wifi_name = current_ssid;
                }
            }

            // Bluetooth (native PnP check via DEVPKEY_Device_IsConnected)
            let bt_devices = get_connected_bluetooth_devices();
            let bt_name = if let Some((name, battery)) = bt_devices.first() {
                if let Some(pct) = battery {
                    format!("{} ({}%)", name, pct)
                } else {
                    name.clone()
                }
            } else {
                "Not Connected".to_string()
            };

            let result = (wifi_name, bt_name);
            if let Ok(mut guard) = LAST_SYS_INFO.lock() {
                *guard = Some((std::time::Instant::now(), result.clone()));
            }
            IS_FETCHING_SYS_INFO.store(false, std::sync::atomic::Ordering::SeqCst);
            let _ = app_clone.emit("system-info-update", result);
        });
    }

    cached.unwrap_or_else(|| ("Not Connected".to_string(), "Not Connected".to_string()))
}

#[derive(serde::Serialize)]
struct FilePreviewResult {
    size_formatted: String,
    thumbnail: Option<String>,
}

#[tauri::command]
async fn get_file_preview(path: String) -> Result<FilePreviewResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::fs;
        use std::path::Path;

        let p = Path::new(&path);
        if !p.exists() {
            return Err("File not found".to_string());
        }

        let meta = fs::metadata(p).map_err(|e| e.to_string())?;
        let len = meta.len();

        let size_formatted = if len < 1024 {
            format!("{} B", len)
        } else if len < 1024 * 1024 {
            format!("{:.0} KB", len as f64 / 1024.0)
        } else if len < 1024 * 1024 * 1024 {
            format!("{:.1} MB", len as f64 / (1024.0 * 1024.0))
        } else {
            format!("{:.1} GB", len as f64 / (1024.0 * 1024.0 * 1024.0))
        };

        let ext = p.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        let mut thumbnail: Option<String> = None;
        let is_img = matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "ico" | "svg");

        // Only attempt image decoding if it's an image under 25MB to prevent memory exhaustion
        if is_img && len <= 25 * 1024 * 1024 {
            if let Ok(bytes) = fs::read(p) {
                use base64::{Engine as _, engine::general_purpose::STANDARD};
                if ext == "svg" && bytes.len() <= 512 * 1024 {
                    let b64 = STANDARD.encode(&bytes);
                    thumbnail = Some(format!("data:image/svg+xml;base64,{}", b64));
                } else if ext == "ico" && bytes.len() <= 512 * 1024 {
                    let b64 = STANDARD.encode(&bytes);
                    thumbnail = Some(format!("data:image/x-icon;base64,{}", b64));
                } else if let Ok(img) = image::load_from_memory(&bytes) {
                    let thumb = img.resize(320, 320, image::imageops::FilterType::CatmullRom);

                    let mut buffer = std::io::Cursor::new(Vec::with_capacity(16384));
                    if thumb.write_to(&mut buffer, image::ImageFormat::Png).is_ok() {
                        let b64 = STANDARD.encode(buffer.into_inner());
                        thumbnail = Some(format!("data:image/png;base64,{}", b64));
                    }
                }
            }
        }

        Ok(FilePreviewResult {
            size_formatted,
            thumbnail,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn show_in_folder(path: String) {
    std::thread::spawn(move || {
        use std::path::Path;
        use std::process::Command;
        use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};

        let trimmed = path.trim().trim_matches('"');
        if trimmed.is_empty() {
            return;
        }

        // SHOpenFolderAndSelectItems requires STA (COINIT_APARTMENTTHREADED) on a dedicated thread
        let com_init = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok() };

        // Normalize slashes to Windows backslash and strip extended-length prefix if present
        let normalized = trimmed.replace('/', "\\");
        let clean_path = normalized.strip_prefix(r"\\?\").unwrap_or(&normalized);
        let p = Path::new(clean_path);

        // If it's a root drive (e.g. "E:\") or directory, open the folder directly
        if p.is_dir() {
            let _ = tauri_plugin_opener::open_path(clean_path, None::<&str>);
            if com_init {
                unsafe { CoUninitialize(); }
            }
            return;
        }

        // First try tauri_plugin_opener::reveal_item_in_dir (uses native Windows Shell SHOpenFolderAndSelectItems)
        if tauri_plugin_opener::reveal_item_in_dir(p).is_ok() {
            if com_init {
                unsafe { CoUninitialize(); }
            }
            return;
        }

        // Fallback: explorer.exe /select,<path>
        use std::os::windows::process::CommandExt;
        let _ = Command::new("explorer.exe")
            .raw_arg(format!("/select,\"{}\"", clean_path))
            .spawn();

        if com_init {
            unsafe { CoUninitialize(); }
        }
    });
}

static INTERNAL_CLIPBOARD_SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

#[tauri::command]
fn copy_file_to_clipboard(path: String) -> Result<(), String> {
    copy_files_to_clipboard(vec![path])
}

#[tauri::command]
fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::System::DataExchange::{OpenClipboard, CloseClipboard, EmptyClipboard, SetClipboardData, GetClipboardSequenceNumber};
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GHND};
    use windows::Win32::Foundation::GlobalFree;
    use windows::Win32::UI::Shell::DROPFILES;

    if paths.is_empty() {
        return Ok(());
    }

    let mut path_wide: Vec<u16> = Vec::new();
    for p in paths {
        path_wide.extend(OsStr::new(&p).encode_wide());
        path_wide.push(0);
    }
    path_wide.push(0); // double null termination for DROPFILES

    let dropfiles_size = std::mem::size_of::<DROPFILES>();
    let total_size = dropfiles_size + path_wide.len() * 2;

    unsafe {
        let h_global = GlobalAlloc(GHND, total_size).map_err(|e| e.to_string())?;
        let p_data = GlobalLock(h_global) as *mut u8;
        if p_data.is_null() {
            let _ = GlobalFree(h_global);
            return Err("Failed to lock global memory".to_string());
        }

        let df = p_data as *mut DROPFILES;
        (*df).pFiles = dropfiles_size as u32;
        (*df).fWide = true.into();

        std::ptr::copy_nonoverlapping(
            path_wide.as_ptr() as *const u8,
            p_data.add(dropfiles_size),
            path_wide.len() * 2,
        );

        let _ = GlobalUnlock(h_global);

        if OpenClipboard(None).is_ok() {
            let _ = EmptyClipboard();
            let _ = SetClipboardData(15, windows::Win32::Foundation::HANDLE(h_global.0));
            let _ = CloseClipboard();
            INTERNAL_CLIPBOARD_SEQ.store(GetClipboardSequenceNumber(), std::sync::atomic::Ordering::Relaxed);
            Ok(())
        } else {
            let _ = GlobalFree(h_global);
            Err("Failed to open clipboard".to_string())
        }
    }
}

#[tauri::command]
async fn pick_files_dialog() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        };
        use windows::Win32::UI::Shell::{
            FileOpenDialog, IFileOpenDialog, FOS_ALLOWMULTISELECT, FOS_FILEMUSTEXIST,
            SIGDN_FILESYSPATH,
        };

        let com_init = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok() };
        let result = (|| -> windows::core::Result<Vec<String>> {
            unsafe {
                let dialog: IFileOpenDialog =
                    CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)?;
                let mut options = dialog.GetOptions()?;
                options |= FOS_ALLOWMULTISELECT | FOS_FILEMUSTEXIST;
                dialog.SetOptions(options)?;

                dialog.Show(None)?;

                let items = dialog.GetResults()?;
                let count = items.GetCount()?;
                let mut paths = Vec::with_capacity(count as usize);

                for i in 0..count {
                    let item = items.GetItemAt(i)?;
                    let name = item.GetDisplayName(SIGDN_FILESYSPATH)?;
                    let path_str = name.to_string()?;
                    CoTaskMemFree(Some(name.as_ptr() as *const _));
                    paths.push(path_str);
                }

                Ok(paths)
            }
        })();

        if com_init {
            unsafe {
                CoUninitialize();
            }
        }

        match result {
            Ok(paths) => Ok(paths),
            Err(e) => {
                // User cancelled the file picker dialog (ERROR_CANCELLED / 0x800704C7)
                if e.code().0 == -2147023673 || e.code().0 == 0x800704C7u32 as i32 {
                    return Ok(Vec::new());
                }
                Err(e.to_string())
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize, Clone)]
struct PickedAudioFile {
    file_name: String,
    bytes: Vec<u8>,
}

#[tauri::command]
async fn pick_audio_file_dialog() -> Result<Option<PickedAudioFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        };
        use windows::Win32::UI::Shell::{
            FileOpenDialog, IFileOpenDialog, FOS_FILEMUSTEXIST, SIGDN_FILESYSPATH,
        };
        use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
        use windows::core::w;

        let com_init = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok() };
        let result = (|| -> windows::core::Result<Option<PickedAudioFile>> {
            unsafe {
                let dialog: IFileOpenDialog =
                    CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)?;
                let mut options = dialog.GetOptions()?;
                options |= FOS_FILEMUSTEXIST;
                dialog.SetOptions(options)?;

                let filter = [
                    COMDLG_FILTERSPEC {
                        pszName: w!("Audio Files (*.mp3;*.wav;*.ogg;*.m4a;*.aac;*.flac)"),
                        pszSpec: w!("*.mp3;*.wav;*.ogg;*.m4a;*.aac;*.flac"),
                    },
                    COMDLG_FILTERSPEC {
                        pszName: w!("All Files (*.*)"),
                        pszSpec: w!("*.*"),
                    },
                ];
                let _ = dialog.SetFileTypes(&filter);

                if let Err(e) = dialog.Show(None) {
                    if e.code().0 == -2147023673 || e.code().0 == 0x800704C7u32 as i32 {
                        return Ok(None);
                    }
                    return Err(e);
                }

                let item = dialog.GetResult()?;
                let name = item.GetDisplayName(SIGDN_FILESYSPATH)?;
                let path_str = name.to_string()?;
                CoTaskMemFree(Some(name.as_ptr() as *const _));

                let path = std::path::Path::new(&path_str);
                let file_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("audio.mp3")
                    .to_string();

                let bytes = match std::fs::read(path) {
                    Ok(b) => b,
                    Err(e) => {
                        return Err(windows::core::Error::new(
                            windows::core::HRESULT(-1),
                            e.to_string(),
                        ))
                    }
                };

                // Limit file size to 15MB
                if bytes.len() > 15 * 1024 * 1024 {
                    return Err(windows::core::Error::new(
                        windows::core::HRESULT(-1),
                        "Audio file exceeds 15MB limit".to_string(),
                    ));
                }

                Ok(Some(PickedAudioFile { file_name, bytes }))
            }
        })();

        if com_init {
            unsafe {
                CoUninitialize();
            }
        }

        match result {
            Ok(opt) => Ok(opt),
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn is_foreground_window_browser() -> Option<bool> {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::System::ProcessStatus::GetProcessImageFileNameW;
    use windows::Win32::Foundation::CloseHandle;

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() { return None; }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 || pid == std::process::id() { return None; }
        if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut buf = [0u16; 512];
            let len = GetProcessImageFileNameW(handle, &mut buf);
            let _ = CloseHandle(handle);
            if len > 0 {
                let name = String::from_utf16_lossy(&buf[..len as usize]).to_lowercase();
                let is_b = name.ends_with("chrome.exe") 
                    || name.ends_with("msedge.exe") 
                    || name.ends_with("brave.exe") 
                    || name.ends_with("firefox.exe") 
                    || name.ends_with("opera.exe") 
                    || name.ends_with("vivaldi.exe") 
                    || name.ends_with("zen.exe")
                    || name.ends_with("arc.exe");
                return Some(is_b);
            }
        }
        Some(false)
    }
}

#[tauri::command]
fn check_foreground_browser() -> bool {
    is_foreground_window_browser().unwrap_or(false)
}

#[tauri::command]
fn is_cursor_in_notch(app_handle: tauri::AppHandle, state: tauri::State<'_, PillSize>) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    use windows::Win32::Foundation::POINT;
    use tauri::Manager;

    if let Some(window) = app_handle.get_webview_window("main") {
        let mut pt = POINT { x: 0, y: 0 };
        if unsafe { GetCursorPos(&mut pt) }.is_ok() {
            if let (Ok(win_pos), Ok(win_size), Ok(sf)) = (window.outer_position(), window.outer_size(), window.scale_factor()) {
                let pill = if let Ok(size) = state.0.lock() {
                    *size
                } else {
                    PillState::default()
                };

                return calculate_notch_hit(pt, win_pos, win_size, sf, &pill);
            }
        }
    }
    false
}

static PREVIOUS_FOREGROUND_HWND: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
static IS_INTERACTIVE_MODE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
fn set_interactive_mode(active: bool, window: tauri::WebviewWindow) {
    IS_INTERACTIVE_MODE.store(active, std::sync::atomic::Ordering::SeqCst);
    if active {
        let _ = window.set_ignore_cursor_events(false);
    }
}

#[tauri::command]
fn focus_notch_window(window: tauri::WebviewWindow) {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, SetForegroundWindow,
        };
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            keybd_event, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_MENU,
        };
        use windows::Win32::Foundation::HWND;

        if let Ok(hwnd) = window.hwnd() {
            let hwnd = HWND(hwnd.0);
            unsafe {
                let fg = GetForegroundWindow();
                if fg != hwnd {
                    keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
                    let _ = SetForegroundWindow(hwnd);
                    keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
                }
            }
        }
    }
    let _ = window.set_ignore_cursor_events(false);
    let _ = window.set_focus();
}

#[tauri::command]
fn save_previous_foreground_window() {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    let hwnd = unsafe { GetForegroundWindow() };
    if !hwnd.is_invalid() {
        PREVIOUS_FOREGROUND_HWND.store(hwnd.0 as isize, std::sync::atomic::Ordering::SeqCst);
    }
}

#[tauri::command]
fn restore_previous_foreground_window() {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
    let val = PREVIOUS_FOREGROUND_HWND.swap(0, std::sync::atomic::Ordering::SeqCst);
    if val != 0 {
        let hwnd = HWND(val as *mut std::ffi::c_void);
        let _ = unsafe { SetForegroundWindow(hwnd) };
    }
}

#[tauri::command]
fn request_notification_access() -> bool {
    #[cfg(windows)]
    {
        use windows::UI::Notifications::Management::{UserNotificationListener, UserNotificationListenerAccessStatus};
        if let Ok(listener) = UserNotificationListener::Current() {
            if let Ok(status) = listener.GetAccessStatus() {
                if status == UserNotificationListenerAccessStatus::Allowed {
                    return true;
                }
            }
            if let Ok(async_op) = listener.RequestAccessAsync() {
                if let Ok(status) = async_op.get() {
                    return status == UserNotificationListenerAccessStatus::Allowed;
                }
            }
        }
    }
    false
}

fn detect_browser_web_source(current_title: &str, current_artist: &str) -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, IsIconic, IsWindowVisible};
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};

    struct WindowSearch<'a> {
        track_title: &'a str,
        track_artist: &'a str,
        found: Option<String>,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut WindowSearch);
        if !IsWindowVisible(hwnd).as_bool() && !IsIconic(hwnd).as_bool() {
            return BOOL(1);
        }
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut buf);
        if len > 0 {
            let win_title_raw = String::from_utf16_lossy(&buf[..len as usize]);
            let win_title = win_title_raw.to_lowercase();

            // 1. Direct "spotify" check in window title (e.g. Spotify - Web Player, Spotify - Search)
            if win_title.contains("spotify") {
                ctx.found = Some("Spotify".to_string());
                return BOOL(0);
            }

            // 2. Spotify Web playback signature: "{Title} • {Artist} - {Browser}"
            let has_bullet = win_title_raw.contains('•') || win_title_raw.contains("\u{2022}");
            if has_bullet && !win_title.contains("youtube") && !win_title.contains("soundcloud") {
                let t_clean = ctx.track_title.trim().to_lowercase();
                let a_clean = ctx.track_artist.trim().to_lowercase();

                let matches_title = !t_clean.is_empty() && (
                    win_title.contains(&t_clean) ||
                    t_clean.split('(').next().map(|s| s.trim()).filter(|s| s.len() >= 3).map_or(false, |s| win_title.contains(s)) ||
                    t_clean.split('-').next().map(|s| s.trim()).filter(|s| s.len() >= 3).map_or(false, |s| win_title.contains(s))
                );
                let matches_artist = !a_clean.is_empty() && (
                    win_title.contains(&a_clean) ||
                    a_clean.split(',').next().map(|s| s.trim()).filter(|s| s.len() >= 3).map_or(false, |s| win_title.contains(s)) ||
                    a_clean.split('&').next().map(|s| s.trim()).filter(|s| s.len() >= 3).map_or(false, |s| win_title.contains(s))
                );

                if matches_title || matches_artist {
                    ctx.found = Some("Spotify".to_string());
                    return BOOL(0);
                }
            }

            if win_title.contains("youtube music") {
                ctx.found = Some("YouTube Music".to_string());
                return BOOL(0);
            } else if win_title.contains("youtube") {
                ctx.found = Some("YouTube".to_string());
                return BOOL(0);
            } else if win_title.contains("soundcloud") {
                ctx.found = Some("SoundCloud".to_string());
                return BOOL(0);
            } else if win_title.contains("bitchord") {
                ctx.found = Some("BitChord".to_string());
                return BOOL(0);
            } else if win_title.contains("bandcamp") {
                ctx.found = Some("Bandcamp".to_string());
                return BOOL(0);
            } else if win_title.contains("qobuz") {
                ctx.found = Some("Qobuz".to_string());
                return BOOL(0);
            } else if win_title.contains("tidal") {
                ctx.found = Some("Tidal".to_string());
                return BOOL(0);
            } else if win_title.contains("deezer") {
                ctx.found = Some("Deezer".to_string());
                return BOOL(0);
            } else if win_title.contains("apple music") {
                ctx.found = Some("Apple Music".to_string());
                return BOOL(0);
            } else if win_title.contains("amazon music") {
                ctx.found = Some("Amazon Music".to_string());
                return BOOL(0);
            } else if win_title.contains("jellyfin") {
                ctx.found = Some("Jellyfin".to_string());
                return BOOL(0);
            } else if win_title.contains("plex") {
                ctx.found = Some("Plex".to_string());
                return BOOL(0);
            } else if win_title.contains("trello") {
                ctx.found = Some("Trello".to_string());
                return BOOL(0);
            } else if win_title.contains("netflix") {
                ctx.found = Some("Netflix".to_string());
                return BOOL(0);
            }
        }
        BOOL(1)
    }

    let mut search = WindowSearch {
        track_title: current_title,
        track_artist: current_artist,
        found: None,
    };
    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut search as *mut WindowSearch as isize));
    }
    search.found
}

static PENDING_SETTINGS_SECTION: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

#[tauri::command]
fn take_pending_settings_section() -> Option<String> {
    if let Ok(mut guard) = PENDING_SETTINGS_SECTION.lock() {
        guard.take()
    } else {
        None
    }
}

fn show_or_create_settings_window(app: &tauri::AppHandle, section: Option<String>) {
    if let Ok(mut guard) = PENDING_SETTINGS_SECTION.lock() {
        *guard = section.clone();
    }
    let app_handle = app.clone();
    // Must spawn on a background thread on Windows to avoid WebView2 CreateCoreWebView2Controller UI-thread deadlock
    std::thread::spawn(move || {
        use tauri::Emitter;
        if let Some(w) = app_handle.get_webview_window("settings") {
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
            if let Some(sec) = section {
                let _ = w.emit("settings-navigate", sec);
            }
            return;
        }

        match tauri::WebviewWindowBuilder::new(
            &app_handle,
            "settings",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("Gili Settings")
        .inner_size(880.0, 620.0)
        .min_inner_size(760.0, 520.0)
        .maximizable(false)
        .resizable(false)
        .decorations(false)
        .transparent(false)
        .shadow(true)
        .center()
        .visible(true)
        .focused(true)
        .additional_browser_args("--autoplay-policy=no-user-gesture-required --enable-gpu-rasterization --enable-zero-copy --disable-features=CalculateNativeWinOcclusion")
        .build()
        {
            Ok(win) => {
                let sw = win.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = sw.hide();
                    }
                });
                let _ = win.show();
                let _ = win.set_focus();
                #[cfg(windows)]
                if let Ok(hwnd) = win.hwnd() {
                    use windows::Win32::Foundation::HWND;
                    use windows::Win32::UI::WindowsAndMessaging::{SetForegroundWindow, ShowWindow, SW_SHOW};
                    unsafe {
                        let h = HWND(hwnd.0);
                        let _ = ShowWindow(h, SW_SHOW);
                        let _ = SetForegroundWindow(h);
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to create settings window: {:?}", e);
            }
        }
    });
}

#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle, section: Option<String>) {
    show_or_create_settings_window(&app, section);
}

#[tauri::command]
fn broadcast_settings_sync(app: tauri::AppHandle, payload: serde_json::Value) {
    use tauri::Emitter;
    let _ = app.emit("gili-settings-sync", payload);
}

#[tauri::command]
fn trigger_notch_action(app: tauri::AppHandle, action: String) {
    use tauri::Emitter;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit("settings-trigger-action", action);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    {
        // Migrate and clean up any legacy Notch artifacts before checking mutex
        migration::run_legacy_migration();

        use windows::Win32::System::Threading::CreateMutexW;
        use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
        use windows::core::w;

        unsafe {
            let mutex = CreateMutexW(None, true, w!("com_faiz_gili_single_instance_mutex"));
            if GetLastError() == ERROR_ALREADY_EXISTS {
                use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE};
                if let Ok(hwnd) = FindWindowW(None, w!("Gili")) {
                    if !hwnd.0.is_null() {
                        let _ = ShowWindow(hwnd, SW_RESTORE);
                        let _ = SetForegroundWindow(hwnd);
                    }
                }
                std::process::exit(0);
            }
            let _ = mutex;
        }
    }

    tauri::Builder::default()
        .on_permission_request(|_webview, kind| {
            match kind {
                tauri::webview::PermissionKind::Geolocation => tauri::webview::PermissionResponse::Allow,
                _ => tauri::webview::PermissionResponse::Default,
            }
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PillSize(std::sync::Mutex::new(PillState::default())))
        .invoke_handler(tauri::generate_handler![
            set_pill_hover,
            smtc_action,
            smtc_seek,
            fetch_external_lyrics_api,
            update_pill_size,
            set_window_position,
            get_battery_status,
            get_privacy_status,
            get_privacy_debug_info,
            set_master_volume,
            system_power_action,
            get_username,
            get_system_info,
            get_master_volume,
            get_brightness,
            set_brightness,
            set_brightness_mode,
            extract_image_text,
            extract_clipboard_text,
            read_clipboard_text,
            read_clipboard_image,
            copy_image_to_clipboard,
            set_power_plan,
            get_audio_sessions,
            set_app_volume,
            get_audio_endpoints,
            set_default_audio_endpoint,
            show_in_folder,
            copy_file_to_clipboard,
            copy_files_to_clipboard,
            pick_files_dialog,
            pick_audio_file_dialog,
            get_file_preview,
            set_shelf_drag,
            check_foreground_browser,
            is_cursor_in_notch,
            save_previous_foreground_window,
            restore_previous_foreground_window,
            request_notification_access,
            set_interactive_mode,
            focus_notch_window,
            enforce_always_on_top,
            activate_notification_app,
            connectivity::get_wifi_status,
            connectivity::toggle_wifi,
            connectivity::connect_wifi,
            connectivity::connect_wifi_with_password,
            connectivity::disconnect_wifi,
            connectivity::get_bluetooth_status,
            connectivity::toggle_bluetooth,
            connectivity::get_hotspot_status,
            connectivity::toggle_hotspot,
            system_monitor::get_system_metrics,
            system_monitor::clear_temp_files,
            windows_dnd::set_windows_dnd,
            windows_dnd::get_windows_dnd,
            toast_banners::set_windows_banners_hidden,
            toast_banners::get_windows_banners_hidden,
            open_settings_window,
            take_pending_settings_section,
            broadcast_settings_sync,
            trigger_notch_action
        ])
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
            use tauri::tray::TrayIconBuilder;
            use tauri::Emitter;
            
            let toggle_i = MenuItem::with_id(app, "toggle_visibility", "Show / Hide Gili (Ctrl+Shift+D)", true, None::<&str>)?;
            let cc_i = MenuItem::with_id(app, "open_control_center", "Open Control Center", true, None::<&str>)?;
            let settings_i = MenuItem::with_id(app, "open_settings", "Open Settings", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit Gili", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_i, &cc_i, &settings_i, &sep, &quit_i])?;

            let mut tray_builder = TrayIconBuilder::new()
                .tooltip("Gili (Running in Background)")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "toggle_visibility" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.emit("tray-toggle-visibility", ());
                            }
                        }
                        "open_control_center" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.emit("tray-open-control-center", ());
                            }
                        }
                        "open_settings" => {
                            show_or_create_settings_window(app, None);
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder.build(app)?;

            let window = match app.get_webview_window("main") {
                Some(w) => w,
                None => return Ok(()),
            };
            
            // 1. Awalnya buat window tembus klik & paksa matikan DWM shadow bawaan Windows
            let _ = window.set_ignore_cursor_events(true);
            let _ = window.set_shadow(false);

            // 2. Posisikan di tengah atas layar & re-center otomatis saat resolusi / DPI berubah
            position_notch_window(&window, false, 0);
            let win_for_events = window.clone();
            let app_for_events = app.handle().clone();
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = win_for_events.emit("click-outside", ());
                    }
                    tauri::WindowEvent::ScaleFactorChanged { .. } | tauri::WindowEvent::Resized(_) => {
                        if win_for_events.is_minimized().unwrap_or(false) {
                            let _ = win_for_events.unminimize();
                        }
                        let (is_bottom, top_offset, is_island, dpr) = app_for_events
                            .state::<PillSize>()
                            .0
                            .lock()
                            .map(|s| (s.is_bottom, s.top_offset, s.is_island, s.dpr))
                            .unwrap_or((false, 0.0, false, 1.0));
                        let sf = win_for_events.scale_factor().unwrap_or(1.0);
                        let effective_sf = if dpr > 0.0 { (dpr as f64).max(sf) } else { sf * get_system_text_scale() };
                        let phys_offset = if is_island { (top_offset as f64 * effective_sf).round() as i32 } else { 0 };
                        position_notch_window(&win_for_events, is_bottom, phys_offset);
                    }
                    _ => {}
                }
            });

            // 3. Polling kursor secara native (DPI Aware & Dynamic Size)
            let win_clone = window.clone();
            let app_handle_poll = app.handle().clone();
            std::thread::spawn(move || {
                use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
                use windows::Win32::Foundation::POINT;
                let mut was_in_pill = false;
                let mut time_since_left_pill = std::time::Instant::now();
                let mut loop_count: u32 = 0;
                let mut last_is_browser = false;
                let mut browser_false_count: u32 = 0;
                let mut click_outside_emitted = false;
                let mut pending_cursor_nudge = false;
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(20));
                    
                    loop_count = loop_count.wrapping_add(1);
                    if loop_count.is_multiple_of(25) {
                        if let Some(is_browser) = is_foreground_window_browser() {
                            if is_browser {
                                browser_false_count = 0;
                                if !last_is_browser {
                                    last_is_browser = true;
                                    use tauri::Emitter;
                                    let _ = win_clone.emit("foreground-app-browser", true);
                                }
                            } else {
                                browser_false_count += 1;
                                if browser_false_count >= 2 && last_is_browser {
                                    last_is_browser = false;
                                    use tauri::Emitter;
                                    let _ = win_clone.emit("foreground-app-browser", false);
                                }
                            }
                        }
                    }

                    let mut pt = POINT { x: 0, y: 0 };
                    if unsafe { GetCursorPos(&mut pt) }.is_ok() {
                        if let (Ok(win_pos), Ok(win_size), Ok(sf)) = (win_clone.outer_position(), win_clone.outer_size(), win_clone.scale_factor()) {
                            // Ambil ukuran dinamis dari React
                            let pill = if let Ok(size) = app_handle_poll.state::<PillSize>().0.lock() {
                                *size
                            } else {
                                PillState::default()
                            };

                            let in_pill = calculate_notch_hit(pt, win_pos, win_size, sf, &pill);

                            if IS_SHELF_DRAGGING.load(std::sync::atomic::Ordering::Relaxed) {
                                let _ = win_clone.set_ignore_cursor_events(true);
                                was_in_pill = false;
                                click_outside_emitted = false;
                                time_since_left_pill = std::time::Instant::now();
                                continue;
                            }

                            if IS_INTERACTIVE_MODE.load(std::sync::atomic::Ordering::Relaxed) {
                                let _ = win_clone.set_ignore_cursor_events(false);
                                was_in_pill = true;
                                if !in_pill {
                                    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
                                    use tauri::Emitter;
                                    let l_down = (unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } as u16 & 0x8000) != 0;
                                    let r_down = (unsafe { GetAsyncKeyState(VK_RBUTTON.0 as i32) } as u16 & 0x8000) != 0;
                                    if l_down || r_down {
                                        if !click_outside_emitted {
                                            click_outside_emitted = true;
                                            let _ = win_clone.emit("click-outside", ());
                                        }
                                    } else {
                                        click_outside_emitted = false;
                                    }
                                } else {
                                    click_outside_emitted = false;
                                }
                                continue;
                            }
                            
                            if in_pill != was_in_pill {
                                was_in_pill = in_pill;
                                pending_cursor_nudge = in_pill;
                                let _ = win_clone.set_ignore_cursor_events(!in_pill);
                                use tauri::Emitter;
                                if !in_pill {
                                    time_since_left_pill = std::time::Instant::now();
                                    let _ = win_clone.emit("notch-mouse-leave", ());
                                } else {
                                    let _ = win_clone.emit("notch-mouse-enter", ());
                                }
                            } else if is_window_click_through(&win_clone) == Some(in_pill) {
                                // Other commands (focus, interactive mode) flip click-through without
                                // updating was_in_pill; re-sync so the notch never stays unclickable
                                let _ = win_clone.set_ignore_cursor_events(!in_pill);
                            }

                            // set_ignore_cursor_events is applied async on the main thread, so wait
                            // until the style is actually lifted before nudging
                            if pending_cursor_nudge && is_window_click_through(&win_clone) == Some(false) {
                                pending_cursor_nudge = false;
                                nudge_cursor();
                            }

                            if in_pill {
                                time_since_left_pill = std::time::Instant::now();
                                click_outside_emitted = false;
                            } else if pill.height > 50.0 && time_since_left_pill.elapsed().as_millis() >= 400 {
                                use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
                                use tauri::Emitter;
                                let l_down = (unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } as u16 & 0x8000) != 0;
                                let r_down = (unsafe { GetAsyncKeyState(VK_RBUTTON.0 as i32) } as u16 & 0x8000) != 0;
                                if l_down || r_down {
                                    if !click_outside_emitted {
                                        click_outside_emitted = true;
                                        let _ = win_clone.emit("click-outside", ());
                                    }
                                } else {
                                    click_outside_emitted = false;
                                }
                            } else {
                                click_outside_emitted = false;
                            }
                        }
                    }
                }
            });

            let app_handle_ping = app.handle().clone();
            std::thread::spawn(move || {
                use tauri::Emitter;
                use std::ffi::c_void;
                use windows::Win32::NetworkManagement::IpHelper::{IcmpCreateFile, IcmpSendEcho, IcmpCloseHandle};
                use windows::Win32::NetworkManagement::IpHelper::ICMP_ECHO_REPLY;
                
                let mut last_ping: Option<u32> = None;
                let mut initialized = false;
                loop {
                    unsafe {
                        if let Ok(handle) = IcmpCreateFile() {
                            let ip_addr = 0x08080808u32; // 8.8.8.8
                            let request_data = "ping";
                            let mut reply_buffer = vec![0u8; 1500];
                            
                            let reply_count = IcmpSendEcho(
                                handle,
                                ip_addr,
                                request_data.as_ptr() as *const c_void,
                                request_data.len() as u16,
                                None,
                                reply_buffer.as_mut_ptr() as *mut c_void,
                                reply_buffer.len() as u32,
                                2000 // 2s timeout
                            );
                            
                            let current_ping = if reply_count > 0 {
                                let reply = &*(reply_buffer.as_ptr() as *const ICMP_ECHO_REPLY);
                                if reply.Status == 0 {
                                    Some(reply.RoundTripTime)
                                } else {
                                    None
                                }
                            } else {
                                None
                            };

                            if !initialized || current_ping != last_ping {
                                initialized = true;
                                last_ping = current_ping;
                                let _ = app_handle_ping.emit("network-ping", current_ping);
                            }
                            
                            let _ = IcmpCloseHandle(handle);
                        }
                    }
                    let is_expanded = app_handle_ping
                        .try_state::<PillSize>()
                        .and_then(|s| s.0.lock().ok().map(|g| g.height > 50.0))
                        .unwrap_or(false);
                    std::thread::sleep(std::time::Duration::from_secs(if is_expanded { 3 } else { 12 }));
                }
            });

            // 3b. Dedicated Privacy Monitor Thread (Camera & Microphone with Heartbeat)
            privacy::start_privacy_monitor(app.handle().clone());

            // 4. Polling SMTC dan otomatis emit ke Frontend
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
                use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
                use tauri::Emitter;
                
                // Wajib inisialisasi COM untuk memanggil Windows API dari thread baru
                let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
                
                let mut last_title = String::new();
                let mut last_artist = String::new();
                let mut last_raw_title = String::new();
                let mut last_raw_artist = String::new();
                let mut last_is_playing = false;
                let mut last_playback_type = 1;
                let mut last_is_browser = false;
                let mut last_app_id: Option<String> = None;
                let mut last_web_source: Option<String> = None;
                let mut cached_browser_web_source: Option<(String, String)> = None;
                let mut last_thumbnail: Option<String> = None;
                let mut last_emitted_thumbnail: Option<String> = None;
                let mut prev_track_thumbnail: Option<String> = None;
                let mut track_change_ticks: u32 = 0;
                let mut thumbnail_cache = std::collections::HashMap::<String, String>::new();
                let mut last_is_charging = false;
                let mut last_battery_percent = 255;
                let mut last_volume = -1.0;
                let mut last_progress_emit = std::time::Instant::now();
                let mut last_position = -1.0;
                let mut last_duration = -1.0;
                let mut thumbnail_retries: u32 = 0;
                let mut seen_notifs = std::collections::HashSet::<u32>::new();
                let mut counter = 0;
                let mut first_notif_run = true;
                let mut last_drives_mask = unsafe { windows::Win32::Storage::FileSystem::GetLogicalDrives() };
                let mut last_audio_id = String::new();
                
                // Audio Device Initialization
                use windows::Win32::Media::Audio::{eRender, eMultimedia, IMMDeviceEnumerator, MMDeviceEnumerator};
                use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
                let audio_enumerator = unsafe { CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL).ok() };
                if let Some(enumerator) = &audio_enumerator {
                    if let Ok(device) = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) } {
                        if let Ok(id) = unsafe { device.GetId() } {
                            let ptr = id.0;
                            if !ptr.is_null() {
                                let mut len = 0;
                                while unsafe { *ptr.add(len) } != 0 { len += 1; }
                                last_audio_id = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(ptr, len) });
                            }
                            unsafe { windows::Win32::System::Com::CoTaskMemFree(Some(id.0 as *const std::ffi::c_void)); }
                        }
                    }
                }
                let mut last_clipboard_seq = unsafe { windows::Win32::System::DataExchange::GetClipboardSequenceNumber() };
                let mut last_caps_state = unsafe { windows::Win32::UI::Input::KeyboardAndMouse::GetKeyState(windows::Win32::UI::Input::KeyboardAndMouse::VK_CAPITAL.0 as i32) } & 1;
                
                let smtc_manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().and_then(|r| r.get()).ok();
                let notif_listener = windows::UI::Notifications::Management::UserNotificationListener::Current().ok();
                if let Some(listener) = &notif_listener {
                    if let Ok(status) = listener.GetAccessStatus() {
                        if status == windows::UI::Notifications::Management::UserNotificationListenerAccessStatus::Unspecified {
                            let _ = listener.RequestAccessAsync().and_then(|r| r.get());
                        }
                    }
                }
                
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    counter += 1;
                    
                    // Polling Clipboard
                    let current_seq = unsafe { windows::Win32::System::DataExchange::GetClipboardSequenceNumber() };
                    if current_seq != last_clipboard_seq {
                        last_clipboard_seq = current_seq;
                        let internal_seq = INTERNAL_CLIPBOARD_SEQ.load(std::sync::atomic::Ordering::Relaxed);
                        if current_seq != internal_seq {
                            let _ = app_handle.emit("clipboard-update", ());
                        }
                    }

                    // Polling Caps Lock
                    let current_caps = unsafe { windows::Win32::UI::Input::KeyboardAndMouse::GetKeyState(windows::Win32::UI::Input::KeyboardAndMouse::VK_CAPITAL.0 as i32) } & 1;
                    if current_caps != last_caps_state {
                        last_caps_state = current_caps;
                        #[derive(serde::Serialize, Clone)]
                        struct CapsPayload { is_on: bool }
                        let _ = app_handle.emit("caps-update", CapsPayload { is_on: current_caps == 1 });
                    }
                    
                    // Volume Check (Immediate 100ms check for instant hardware key HUD response)
                    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
                    
                    if let Some(enumerator) = &audio_enumerator {
                        if let Ok(device) = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) } {
                            if let Ok(volume_ctrl) = unsafe { device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) } {
                                if let Ok(level) = unsafe { volume_ctrl.GetMasterVolumeLevelScalar() } {
                                    if (level - last_volume).abs() > 0.01 && last_volume != -1.0 {
                                        #[derive(serde::Serialize, Clone)]
                                        struct VolumePayload { level: f32 }
                                        let _ = app_handle.emit("volume-update", VolumePayload { level });
                                    }
                                    last_volume = level;
                                }
                            }
                        }
                    }
                    
                    if counter % 5 != 0 {
                        continue;
                    }
                    
                    // Real Notifications Check (non-blocking status check to prevent Windows 10 hangs)
                    use windows::UI::Notifications::Management::UserNotificationListenerAccessStatus;
                    if let Some(listener) = &notif_listener {
                        if let Ok(status) = listener.GetAccessStatus() {
                            if status == UserNotificationListenerAccessStatus::Allowed {
                                if let Ok(notifs) = listener.GetNotificationsAsync(windows::UI::Notifications::NotificationKinds::Toast).and_then(|r| r.get()) {
                                    let mut current_ids = std::collections::HashSet::new();
                                    
                                    for notif in notifs {
                                        if let Ok(id) = notif.Id() {
                                            current_ids.insert(id);
                                            
                                            if !seen_notifs.contains(&id) {
                                                seen_notifs.insert(id);
                                                
                                                if !first_notif_run {
                                                    let app_name = notif.AppInfo().and_then(|i| i.DisplayInfo()).and_then(|i| i.DisplayName()).map(|s| s.to_string()).unwrap_or_default();
                                                    let aumid = notif.AppInfo().and_then(|i| i.AppUserModelId()).map(|s| s.to_string()).unwrap_or_default();
                                                    let mut title = String::new();
                                                    let mut body = String::new();
                                                    
                                                    if let Ok(notification) = notif.Notification() {
                                                        if let Ok(visual) = notification.Visual() {
                                                            if let Ok(binding) = visual.GetBinding(&windows::core::HSTRING::from("ToastGeneric")) {
                                                                if let Ok(elements) = binding.GetTextElements() {
                                                                    if let Ok(count) = elements.Size() {
                                                                        if count > 0 {
                                                                            if let Ok(elem) = elements.GetAt(0) {
                                                                                title = elem.Text().unwrap_or_default().to_string();
                                                                            }
                                                                            let mut body_lines = Vec::new();
                                                                            for i in 1..count {
                                                                                if let Ok(elem) = elements.GetAt(i) {
                                                                                    let text = elem.Text().unwrap_or_default().to_string();
                                                                                    let trimmed = text.trim();
                                                                                    if !trimmed.is_empty() {
                                                                                        body_lines.push(trimmed.to_string());
                                                                                    }
                                                                                }
                                                                            }
                                                                            body = body_lines.join("\n");
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                    
                                                    #[derive(serde::Serialize, Clone)]
                                                    struct RealNotifPayload {
                                                        app_name: String,
                                                        title: String,
                                                        body: String,
                                                        aumid: String,
                                                    }
                                                    let _ = app_handle.emit("real-notif", RealNotifPayload { app_name, title, body, aumid });
                                                }
                                            }
                                        }
                                    }
                                    first_notif_run = false;
                                    seen_notifs.retain(|id| current_ids.contains(id));
                                }
                            }
                        }
                    }
                    
                    // Battery Check (every 1 second to save CPU)
                    if counter % 10 == 0 {
                        use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
                        let mut power_status = SYSTEM_POWER_STATUS::default();
                        if unsafe { GetSystemPowerStatus(&mut power_status).is_ok() } {
                            let has_battery = (power_status.BatteryFlag & 128 == 0) && power_status.BatteryLifePercent <= 100;
                            if has_battery {
                                let is_charging = power_status.ACLineStatus == 1;
                                let percent = power_status.BatteryLifePercent;
                                if is_charging != last_is_charging || percent != last_battery_percent {
                                    last_is_charging = is_charging;
                                    last_battery_percent = percent;
                                    
                                    #[derive(serde::Serialize, Clone)]
                                    struct BatteryPayload {
                                        is_charging: bool,
                                        percent: u8,
                                    }
                                    
                                    let _ = app_handle.emit("battery-update", BatteryPayload { 
                                        is_charging, 
                                        percent,
                                    });
                                }
                            }
                        }
                    }


                    // USB Drive Check (every 2 seconds)
                    if counter % 20 == 0 {
                        use windows::Win32::Storage::FileSystem::{GetLogicalDrives, GetDriveTypeW, GetVolumeInformationW};
                        let current_mask = unsafe { GetLogicalDrives() };
                        if current_mask != last_drives_mask {
                            // Find added drives
                            for i in 0..26 {
                                let bit = 1 << i;
                                if (current_mask & bit) != 0 && (last_drives_mask & bit) == 0 {
                                    // This drive was just connected
                                    let drive_letter = (b'A' + i as u8) as char;
                                    let root = format!("{}:\\", drive_letter);
                                    
                                    use std::os::windows::ffi::OsStrExt;
                                    let root_wide: Vec<u16> = std::ffi::OsStr::new(&root).encode_wide().chain(std::iter::once(0)).collect();
                                    
                                    let drive_type = unsafe { GetDriveTypeW(windows::core::PCWSTR::from_raw(root_wide.as_ptr())) };
                                    
                                    // Only show pop-up for Removable Drives (2 = DRIVE_REMOVABLE)
                                    if drive_type == 2 {
                                        let mut name_buf = [0u16; 256];
                                        let success = unsafe {
                                            GetVolumeInformationW(
                                                windows::core::PCWSTR::from_raw(root_wide.as_ptr()),
                                                Some(&mut name_buf),
                                                None,
                                                None,
                                                None,
                                                None
                                            )
                                        };
                                        
                                        let mut name = String::new();
                                        if success.is_ok() {
                                            let len = name_buf.iter().position(|&c| c == 0).unwrap_or(256);
                                            name = String::from_utf16_lossy(&name_buf[..len]);
                                        }
                                        if name.is_empty() { name = "USB Drive".to_string(); }
                                        
                                        #[derive(serde::Serialize, Clone)]
                                        struct UsbPayload {
                                            name: String,
                                            letter: String,
                                        }
                                        
                                        let _ = app_handle.emit("usb-connected", UsbPayload {
                                            name,
                                            letter: root.clone(),
                                        });
                                    }
                                }
                            }
                            last_drives_mask = current_mask;
                        }
                    }
                    
                    // Audio Device Check (every 1.5 seconds)
                    if counter % 15 == 0 {
                        if let Some(enumerator) = &audio_enumerator {
                            if let Ok(device) = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) } {
                                if let Ok(id) = unsafe { device.GetId() } {
                                    let ptr = id.0;
                                    let mut id_str = String::new();
                                    if !ptr.is_null() {
                                        let mut len = 0;
                                        while unsafe { *ptr.add(len) } != 0 { len += 1; }
                                        id_str = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(ptr, len) });
                                    }
                                    unsafe { windows::Win32::System::Com::CoTaskMemFree(Some(id.0 as *const std::ffi::c_void)); }
                                    
                                    if !last_audio_id.is_empty() && id_str != last_audio_id {
                                        use winreg::enums::*;
                                        use winreg::RegKey;
                                        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
                                        let path = format!("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render\\{}\\Properties", id_str);
                                        let mut friendly_name = String::from("Audio Device");
                                        if let Ok(key) = hklm.open_subkey_with_flags(&path, KEY_READ) {
                                            if let Ok(desc) = key.get_value::<String, _>("{b3f8fa53-0004-438e-9003-51a46e139bfc},6") {
                                                friendly_name = desc;
                                            }
                                        }

                                        #[derive(serde::Serialize, Clone)]
                                        struct AudioPayload {
                                            name: String,
                                            icon: String,
                                        }
                                        let _ = app_handle.emit("audio-connected", AudioPayload { 
                                            name: friendly_name,
                                            icon: "volume".to_string()
                                        });
                                    }
                                    last_audio_id = id_str;
                                }
                            }
                        }
                    }
                    let mut title = String::new();
                    let mut artist = String::new();
                    let mut is_playing = false;
                    let mut playback_type = 1;
                    let mut position_sec = 0.0;
                    let mut duration_sec = 0.0;
                    let mut is_browser_session = false;
                    let mut current_app_id: Option<String> = None;
                    let mut current_web_source: Option<String> = None;
                    
                    if let Some(manager) = &smtc_manager {
                        let mut active_session = None;
                        if let Ok(sessions) = manager.GetSessions() {
                            for session in sessions.into_iter() {
                                if let Ok(playback) = session.GetPlaybackInfo() {
                                    if is_smtc_session_playing(&playback) {
                                        active_session = Some(session);
                                        break;
                                    }
                                }
                            }
                        }
                        if active_session.is_none() && !last_raw_title.is_empty() {
                            if let Ok(sessions) = manager.GetSessions() {
                                for session in sessions.into_iter() {
                                    if let Ok(playback) = session.GetPlaybackInfo() {
                                        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;
                                        if playback.PlaybackStatus().unwrap_or(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed) == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed {
                                            continue;
                                        }
                                    }
                                    if let Ok(info) = session.TryGetMediaPropertiesAsync().and_then(|r| r.get()) {
                                        let t = info.Title().unwrap_or_default().to_string();
                                        let a = info.Artist().unwrap_or_default().to_string();
                                        if t == last_raw_title && a == last_raw_artist {
                                            active_session = Some(session);
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        if active_session.is_none() {
                            if let Ok(curr) = manager.GetCurrentSession() {
                                if let Ok(playback) = curr.GetPlaybackInfo() {
                                    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;
                                    if playback.PlaybackStatus().unwrap_or(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed) != GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed {
                                        active_session = Some(curr);
                                    }
                                }
                            }
                        }

                        if let Some(session) = &active_session {
                            let app_id = session.SourceAppUserModelId().unwrap_or_default().to_string().to_lowercase();
                            if app_id.contains("screensketch") || app_id.contains("snipping") {
                                active_session = None;
                            } else {
                                is_browser_session = app_id.contains("brave") 
                                    || app_id.contains("chrome") 
                                    || app_id.contains("msedge") 
                                    || app_id.contains("edge") 
                                    || app_id.contains("firefox") 
                                    || app_id.contains("opera") 
                                    || app_id.contains("vivaldi") 
                                    || app_id.contains("zen")
                                    || app_id.contains("arc");
                            }
                        }

                        if let Some(session) = active_session {
                            let mut thumbnail_b64 = None;
                            
                            if let Ok(playback) = session.GetPlaybackInfo() {
                                if let Ok(ptype_ref) = playback.PlaybackType() {
                                    if let Ok(ptype) = ptype_ref.Value() {
                                        playback_type = ptype.0;
                                    }
                                }
                            }
                            
                            if let Ok(info) = session.TryGetMediaPropertiesAsync().and_then(|r| r.get()) {
                                let raw_app_id = session.SourceAppUserModelId().unwrap_or_default().to_string();
                                if !raw_app_id.is_empty() {
                                    current_app_id = Some(raw_app_id.clone());
                                }
                                let app_id_lower = raw_app_id.to_lowercase();

                                title = info.Title().unwrap_or_default().to_string();
                                artist = info.Artist().unwrap_or_default().to_string();
                                last_raw_title = title.clone();
                                last_raw_artist = artist.clone();
                                if let Ok(mut last_active) = LAST_ACTIVE_SMTC.lock() {
                                    *last_active = (last_raw_title.clone(), last_raw_artist.clone());
                                }

                                // 1. Strip known browser window title suffixes
                                for browser_suffix in [
                                    " - Google Chrome",
                                    " - Microsoft Edge",
                                    " — Mozilla Firefox",
                                    " - Mozilla Firefox",
                                    " - Brave",
                                    " - Opera",
                                    " - Vivaldi",
                                    " - Arc",
                                    " - Zen Browser",
                                    " - Thorium",
                                    " - Waterfox",
                                    " - Yandex",
                                ] {
                                    if title.ends_with(browser_suffix) {
                                        title = title[..title.len() - browser_suffix.len()].trim().to_string();
                                        break;
                                    }
                                }

                                // 2. Clean YouTube Music "- Topic" suffix from artist
                                let artist_lower = artist.trim().to_lowercase();
                                if artist_lower.ends_with(" - topic") {
                                    let new_len = artist.trim().len().saturating_sub(8);
                                    artist = artist.trim()[..new_len].trim().to_string();
                                }
                                // Strip YouTube suffixes
                                for suffix in [" - YouTube Music", " | YouTube Music"] {
                                    if title.ends_with(suffix) {
                                        title = title[..title.len() - suffix.len()].trim().to_string();
                                        current_web_source = Some("YouTube Music".to_string());
                                    }
                                }
                                for suffix in [" - YouTube", " | YouTube"] {
                                    if title.ends_with(suffix) {
                                        title = title[..title.len() - suffix.len()].trim().to_string();
                                        if current_web_source.is_none() {
                                            current_web_source = Some("YouTube".to_string());
                                        }
                                    }
                                }
                                for suffix in [" - SoundCloud", " | SoundCloud", " on SoundCloud"] {
                                    if title.ends_with(suffix) {
                                        title = title[..title.len() - suffix.len()].trim().to_string();
                                        current_web_source = Some("SoundCloud".to_string());
                                    }
                                }
                                for suffix in [" - Spotify", " | Spotify", " • Spotify"] {
                                    if title.ends_with(suffix) {
                                        title = title[..title.len() - suffix.len()].trim().to_string();
                                        current_web_source = Some("Spotify".to_string());
                                    }
                                    if artist.ends_with(suffix) {
                                        artist = artist[..artist.len() - suffix.len()].trim().to_string();
                                        current_web_source = Some("Spotify".to_string());
                                    }
                                }

                                if is_browser_session && title.contains(" • ") {
                                    if let Some((s_title, s_artist)) = title.split_once(" • ") {
                                        let s_t = s_title.trim().to_string();
                                        let s_a = s_artist.trim().to_string();
                                        let a_lower = artist.trim().to_lowercase();
                                        let is_generic_artist = a_lower.is_empty() 
                                            || a_lower == "google chrome" 
                                            || a_lower == "microsoft edge" 
                                            || a_lower == "firefox" 
                                            || a_lower == "brave browser"
                                            || a_lower == "brave";
                                        if is_generic_artist {
                                            title = s_t;
                                            artist = s_a;
                                        }
                                        if current_web_source.is_none() {
                                            current_web_source = Some("Spotify".to_string());
                                        }
                                    }
                                }

                                // 3. If artist is empty, try album title
                                if artist.trim().is_empty() {
                                    if let Ok(album) = info.AlbumTitle() {
                                        let alb_str = album.to_string();
                                        if !alb_str.trim().is_empty() {
                                            artist = alb_str;
                                        }
                                    }
                                }

                                // 4. Check for social platforms & web players
                                let title_lower = title.to_lowercase();
                                let is_generic_artist = artist.trim().is_empty() 
                                    || artist.eq_ignore_ascii_case("google chrome") 
                                    || artist.eq_ignore_ascii_case("microsoft edge") 
                                    || artist.eq_ignore_ascii_case("firefox")
                                    || artist.eq_ignore_ascii_case("brave browser");

                                if is_generic_artist || artist.trim().is_empty() {
                                    if let Some(stripped) = [" | Threads", " • Threads", " - Threads", " / Threads"].iter().find_map(|s| title.strip_suffix(s)) {
                                        title = stripped.trim().to_string();
                                        artist = "Threads".to_string();
                                    } else if let Some(idx) = title_lower.rfind(" on threads") {
                                        if title.is_char_boundary(idx) {
                                            title = title[..idx].trim().to_string();
                                        }
                                        artist = "Threads".to_string();
                                    } else if title_lower == "threads" || app_id_lower.contains("threads") {
                                        artist = "Threads".to_string();
                                    } else if let Some(stripped) = [" | Instagram", " • Instagram", " - Instagram", " / Instagram"].iter().find_map(|s| title.strip_suffix(s)) {
                                        title = stripped.trim().to_string();
                                        artist = "Instagram".to_string();
                                    } else if let Some(idx) = title_lower.rfind(" on instagram") {
                                        if title.is_char_boundary(idx) {
                                            title = title[..idx].trim().to_string();
                                        }
                                        artist = "Instagram".to_string();
                                    } else if title_lower == "instagram" || app_id_lower.contains("instagram") {
                                        artist = "Instagram".to_string();
                                    } else if let Some(stripped) = [" | TikTok", " • TikTok", " - TikTok"].iter().find_map(|s| title.strip_suffix(s)) {
                                        title = stripped.trim().to_string();
                                        artist = "TikTok".to_string();
                                    } else if let Some(idx) = title_lower.rfind(" on tiktok") {
                                        if title.is_char_boundary(idx) {
                                            title = title[..idx].trim().to_string();
                                        }
                                        artist = "TikTok".to_string();
                                    } else if title_lower == "tiktok" || app_id_lower.contains("tiktok") {
                                        artist = "TikTok".to_string();
                                    } else if let Some(stripped) = [" / X", " / x", " | X", " • X"].iter().find_map(|s| title.strip_suffix(s)) {
                                        title = stripped.trim().to_string();
                                        artist = "X".to_string();
                                    } else if let Some(stripped) = [" - Twitter", " | Twitter"].iter().find_map(|s| title.strip_suffix(s)) {
                                        title = stripped.trim().to_string();
                                        artist = "Twitter".to_string();
                                    } else if let Some(idx) = title_lower.rfind(" on x") {
                                        if title.is_char_boundary(idx) {
                                            title = title[..idx].trim().to_string();
                                        }
                                        artist = "X".to_string();
                                    } else if let Some(idx) = title_lower.rfind(" on twitter") {
                                        if title.is_char_boundary(idx) {
                                            title = title[..idx].trim().to_string();
                                        }
                                        artist = "Twitter".to_string();
                                    } else if title_lower == "x" || title_lower == "twitter" || app_id_lower.contains("twitter") {
                                        artist = "X".to_string();
                                    } else if let Some(stripped) = [" - Reddit", " | Reddit"].iter().find_map(|s| title.strip_suffix(s)) {
                                        title = stripped.trim().to_string();
                                        artist = "Reddit".to_string();
                                    } else if title_lower == "reddit" || app_id_lower.contains("reddit") {
                                        artist = "Reddit".to_string();
                                    } else if let Some(idx) = title.rfind(" - ") {
                                        artist = title[idx + 3..].trim().to_string();
                                        title = title[..idx].trim().to_string();
                                    } else if let Some(idx) = title.rfind(" | ") {
                                        artist = title[idx + 3..].trim().to_string();
                                        title = title[..idx].trim().to_string();
                                    } else if let Some(idx) = title.rfind(" • ") {
                                        artist = title[idx + 3..].trim().to_string();
                                        title = title[..idx].trim().to_string();
                                    } else if artist.trim().is_empty() {
                                        let mut app = raw_app_id.clone();
                                        if app_id_lower.contains("bitchord") {
                                            app = "BitChord".to_string();
                                        } else if app_id_lower.contains("cider") {
                                            app = "Cider".to_string();
                                        } else if app_id_lower.contains("foobar2000") || app_id_lower.contains("foobar") {
                                            app = "Foobar2000".to_string();
                                        } else if app_id_lower.contains("aimp") {
                                            app = "AIMP".to_string();
                                        } else if app_id_lower.contains("musicbee") {
                                            app = "MusicBee".to_string();
                                        } else if app_id_lower.contains("vlc") {
                                            app = "VLC".to_string();
                                        } else if app_id_lower.contains("wmplayer") || app_id_lower.contains("zune") {
                                            app = "Windows Media Player".to_string();
                                        } else if app_id_lower.contains("spotify") {
                                            app = "Spotify".to_string();
                                        } else if app_id_lower.contains("netflix") {
                                            app = "Netflix".to_string();
                                        } else if app_id_lower.contains("threads") {
                                            app = "Threads".to_string();
                                        } else if app_id_lower.contains("discord") {
                                            app = "Discord".to_string();
                                        } else if app_id_lower.contains("whatsapp") {
                                            app = "WhatsApp".to_string();
                                        } else if app_id_lower.contains("msedge") || app_id_lower.contains("edge") {
                                            app = "Microsoft Edge".to_string();
                                        } else if app_id_lower.contains("chrome") {
                                            app = "Google Chrome".to_string();
                                        } else if app_id_lower.contains("firefox") {
                                            app = "Firefox".to_string();
                                        }
                                        artist = app;
                                    }
                                }

                                // 5. If artist is generic YouTube / YouTube Music / Google Chrome / Microsoft Edge and title is "Artist - Song", split it
                                let a_check = artist.trim().to_lowercase();
                                if a_check == "youtube" || a_check == "youtube music" || a_check == "google chrome" || a_check == "microsoft edge" {
                                    if let Some(idx) = title.find(" - ") {
                                        let extracted_artist = title[..idx].trim().to_string();
                                        let extracted_title = title[idx + 3..].trim().to_string();
                                        if !extracted_artist.is_empty() && !extracted_title.is_empty() {
                                            artist = extracted_artist;
                                            title = extracted_title;
                                        }
                                    }
                                }

                                if current_web_source.is_none() && is_browser_session {
                                    let a_lower = artist.trim().to_lowercase();
                                    let t_lower = title.trim().to_lowercase();
                                    if a_lower == "youtube music" || t_lower.contains("youtube music") {
                                        current_web_source = Some("YouTube Music".to_string());
                                    } else if a_lower == "youtube" || t_lower.contains("youtube") {
                                        current_web_source = Some("YouTube".to_string());
                                    } else if a_lower == "soundcloud" || t_lower.contains("soundcloud") {
                                        current_web_source = Some("SoundCloud".to_string());
                                    } else if a_lower == "spotify" || t_lower.contains("spotify") {
                                        current_web_source = Some("Spotify".to_string());
                                    } else if a_lower == "bitchord" || t_lower.contains("bitchord") {
                                        current_web_source = Some("BitChord".to_string());
                                    } else if a_lower == "bandcamp" || t_lower.contains("bandcamp") {
                                        current_web_source = Some("Bandcamp".to_string());
                                    } else if a_lower == "qobuz" || t_lower.contains("qobuz") {
                                        current_web_source = Some("Qobuz".to_string());
                                    } else if a_lower == "tidal" || t_lower.contains("tidal") {
                                        current_web_source = Some("Tidal".to_string());
                                    } else if a_lower == "deezer" || t_lower.contains("deezer") {
                                        current_web_source = Some("Deezer".to_string());
                                    } else if a_lower == "jellyfin" || t_lower.contains("jellyfin") {
                                        current_web_source = Some("Jellyfin".to_string());
                                    } else if a_lower == "plex" || t_lower.contains("plex") {
                                        current_web_source = Some("Plex".to_string());
                                    } else if a_lower == "netflix" || t_lower.contains("netflix") {
                                        current_web_source = Some("Netflix".to_string());
                                    } else {
                                        current_web_source = detect_browser_web_source(&title, &artist);
                                    }
                                }

                                if let Some(ref ws) = current_web_source {
                                    if is_browser_session {
                                        if let Some(ref aid) = current_app_id {
                                            cached_browser_web_source = Some((aid.to_lowercase(), ws.clone()));
                                        }
                                    }
                                } else if is_browser_session {
                                    if let (Some(ref aid), Some((ref cached_aid, ref cached_ws))) = (&current_app_id, &cached_browser_web_source) {
                                        if aid.to_lowercase() == *cached_aid {
                                            current_web_source = Some(cached_ws.clone());
                                        }
                                    }
                                }
                                
                                let cache_key = format!("{} - {}", artist.trim().to_lowercase(), title.trim().to_lowercase());
                                
                                if title != last_title || artist != last_artist {
                                    if last_emitted_thumbnail.is_some() {
                                        prev_track_thumbnail = last_emitted_thumbnail.clone();
                                    }
                                    track_change_ticks = 0;
                                    thumbnail_retries = 0;
                                    last_thumbnail = thumbnail_cache.get(&cache_key).cloned();
                                } else {
                                    track_change_ticks = track_change_ticks.saturating_add(1);
                                }
                                
                                let needs_thumbnail = last_thumbnail.is_none() && (thumbnail_retries < 50 || thumbnail_retries.is_multiple_of(10));
                                let in_transition_window = track_change_ticks <= 30 && (track_change_ticks <= 10 || track_change_ticks.is_multiple_of(3));
                                if (title != last_title || artist != last_artist || needs_thumbnail || in_transition_window) && !title.is_empty() {
                                    if let Ok(thumb_ref) = info.Thumbnail() {
                                        if let Ok(stream) = thumb_ref.OpenReadAsync().and_then(|r| r.get()) {
                                            if let Ok(size) = stream.Size() {
                                                if size > 0 && size <= 10_000_000 {
                                                    use windows::Storage::Streams::DataReader;
                                                    if let Ok(reader) = DataReader::CreateDataReader(&stream) {
                                                        if let Ok(loaded) = reader.LoadAsync(size as u32).and_then(|r| r.get()) {
                                                            if loaded > 0 {
                                                                let mut bytes = vec![0u8; loaded as usize];
                                                                if reader.ReadBytes(&mut bytes).is_ok() && bytes.len() >= 100 {
                                                                    use base64::{Engine as _, engine::general_purpose::STANDARD};
                                                                    let raw_mime = stream.ContentType().unwrap_or_default().to_string();
                                                                    let detected_mime = if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
                                                                        "image/jpeg"
                                                                    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
                                                                        "image/png"
                                                                    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
                                                                        "image/webp"
                                                                    } else if bytes.starts_with(b"BM") {
                                                                        "image/bmp"
                                                                    } else if !raw_mime.is_empty() {
                                                                        &raw_mime
                                                                    } else {
                                                                        "image/jpeg"
                                                                    };
                                                                    let b64 = STANDARD.encode(&bytes);
                                                                    let uri = format!("data:{};base64,{}", detected_mime, b64);
                                                                    let is_same_as_prev = prev_track_thumbnail.as_deref() == Some(uri.as_str());
                                                                    // Ignore stale cover carried over from the previous track during the first ~800ms of transition
                                                                    if !is_same_as_prev || track_change_ticks >= 8 {
                                                                        if !is_same_as_prev || track_change_ticks >= 15 {
                                                                            if thumbnail_cache.len() >= 40 && !thumbnail_cache.contains_key(&cache_key) {
                                                                                if let Some(first_key) = thumbnail_cache.keys().next().cloned() {
                                                                                    thumbnail_cache.remove(&first_key);
                                                                                }
                                                                            }
                                                                            thumbnail_cache.insert(cache_key.clone(), uri.clone());
                                                                        }
                                                                        thumbnail_b64 = Some(uri);
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if let Ok(playback_info) = session.GetPlaybackInfo() {
                                is_playing = is_smtc_session_playing(&playback_info);
                                use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;
                                if playback_info.PlaybackStatus().unwrap_or(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed) == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed {
                                    title.clear();
                                    artist.clear();
                                    last_raw_title.clear();
                                    last_raw_artist.clear();
                                    last_thumbnail = None;
                                    if let Ok(mut last_active) = LAST_ACTIVE_SMTC.lock() {
                                        *last_active = (String::new(), String::new());
                                    }
                                }
                            }
                            
                            if let Ok(timeline) = session.GetTimelineProperties() {
                                let mut pos = timeline.Position().unwrap_or_default().Duration as f64 / 10_000_000.0;
                                let dur = timeline.EndTime().unwrap_or_default().Duration as f64 / 10_000_000.0;

                                if is_playing {
                                    if let Ok(last_updated) = timeline.LastUpdatedTime() {
                                        let updated_ticks = last_updated.UniversalTime;
                                        if updated_ticks > 0 {
                                            if let Ok(since_epoch) = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
                                                let now_ticks = (since_epoch.as_secs() * 10_000_000 + (since_epoch.subsec_nanos() as u64 / 100)) as i64 + 116_444_736_000_000_000i64;
                                                if now_ticks > updated_ticks {
                                                    let elapsed_sec = (now_ticks - updated_ticks) as f64 / 10_000_000.0;
                                                    if elapsed_sec > 0.0 && elapsed_sec < 7200.0 {
                                                        pos += elapsed_sec;
                                                        if dur > 0.0 && pos > dur {
                                                            pos = dur;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                if let Ok(seek_guard) = LAST_SMTC_SEEK.lock() {
                                    if let Some((seek_instant, seek_target)) = *seek_guard {
                                        let since_seek = seek_instant.elapsed().as_secs_f64();
                                        if since_seek < 1.5 && (pos - seek_target).abs() > 2.0 {
                                            pos = seek_target + if is_playing { since_seek } else { 0.0 };
                                            if dur > 0.0 && pos > dur {
                                                pos = dur;
                                            }
                                        }
                                    }
                                }

                                position_sec = pos;
                                duration_sec = dur;
                            }
                            
                            // If thumbnail was freshly read or found in cache, preserve it
                            let cache_key = format!("{} - {}", artist.trim().to_lowercase(), title.trim().to_lowercase());
                            if let Some(tb64) = thumbnail_b64 {
                                last_thumbnail = Some(tb64);
                            } else if last_thumbnail.is_none() {
                                if let Some(cached) = thumbnail_cache.get(&cache_key) {
                                    last_thumbnail = Some(cached.clone());
                                } else if !title.is_empty() {
                                    thumbnail_retries = thumbnail_retries.saturating_add(1);
                                }
                            }
                        }
                    }

                    // Check for changes (whether we have a session or not)
                    if title != last_title || artist != last_artist || is_playing != last_is_playing || playback_type != last_playback_type || is_browser_session != last_is_browser || current_app_id != last_app_id || current_web_source != last_web_source || last_thumbnail != last_emitted_thumbnail {
                        last_emitted_thumbnail = last_thumbnail.clone();
                        last_title = title.clone();
                        last_artist = artist.clone();
                        last_is_playing = is_playing;
                        last_playback_type = playback_type;
                        last_is_browser = is_browser_session;
                        last_app_id = current_app_id.clone();
                        last_web_source = current_web_source.clone();
                        
                        #[derive(serde::Serialize, Clone)]
                        struct MediaPayload {
                            title: String,
                            artist: String,
                            is_playing: bool,
                            thumbnail: Option<String>,
                            playback_type: i32,
                            position: f64,
                            duration: f64,
                            is_browser: bool,
                            app_id: Option<String>,
                            web_source: Option<String>,
                        }
                        
                        let _ = app_handle.emit("media-update", MediaPayload { 
                            title, 
                            artist, 
                            is_playing,
                            thumbnail: last_thumbnail.clone(),
                            playback_type: last_playback_type,
                            position: position_sec,
                            duration: duration_sec,
                            is_browser: last_is_browser,
                            app_id: current_app_id.clone(),
                            web_source: last_web_source.clone(),
                        });
                    }

                    if last_title.is_empty() {
                        cached_browser_web_source = None;
                    }
                    
                    let now = std::time::Instant::now();
                    if is_playing && (now.duration_since(last_progress_emit).as_millis() >= 500 || (position_sec - last_position).abs() > 1.0 || (duration_sec - last_duration).abs() > 1.0) {
                        last_progress_emit = now;
                        last_position = position_sec;
                        last_duration = duration_sec;
                        
                        #[derive(serde::Serialize, Clone)]
                        struct ProgressPayload {
                            position: f64,
                            duration: f64,
                        }
                        
                        let _ = app_handle.emit("media-progress", ProgressPayload { 
                            position: position_sec, 
                            duration: duration_sec 
                        });
                    }
                }
            });

            let app_handle_bt = app.handle().clone();
            std::thread::spawn(move || {
                let mut last_bt_list: Vec<String> = Vec::new();
                let mut is_first_run = true;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(6));
                    let connected = get_connected_bluetooth_devices();
                    let mut current_bt_list = Vec::new();
                    for (name, battery_opt) in connected {
                        current_bt_list.push(name.clone());
                        let was_connected = last_bt_list.iter().any(|old| old == &name);
                        if !was_connected && !is_first_run {
                            use tauri::Emitter;
                            let battery = battery_opt.map(|b| format!("{}%", b)).unwrap_or_default();

                            #[derive(serde::Serialize, Clone)]
                            struct BtPayload {
                                name: String,
                                battery: String,
                            }
                            let _ = app_handle_bt.emit("bt-connected", BtPayload { name, battery });
                        }
                    }
                    last_bt_list = current_bt_list;
                    is_first_run = false;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod hit_test {
    use super::*;
    use windows::Win32::Foundation::POINT;

    #[test]
    fn test_calculate_notch_hit_idle_standard_dpi() {
        let win_pos = tauri::PhysicalPosition::new(360, 0);
        let win_size = tauri::PhysicalSize::new(1200, 760);
        let pill = PillState {
            width: 120.0,
            height: 35.0,
            is_bottom: false,
            top_offset: 0.0,
            is_island: false,
            dpr: 1.0,
        };

        // Center is at 360 + (1200 - 120) / 2 = 900.
        // Range x: [900 - 6 - 8 .. 900 + 120 + 6 + 8] = [886 .. 1034]
        // Range y: [0 - 6 .. 35 + 6] = [-6 .. 41]
        let inside = POINT { x: 960, y: 15 };
        assert!(calculate_notch_hit(inside, win_pos, win_size, 1.0, &pill));

        let outside_x = POINT { x: 800, y: 15 };
        assert!(!calculate_notch_hit(outside_x, win_pos, win_size, 1.0, &pill));

        let outside_y = POINT { x: 960, y: 100 };
        assert!(!calculate_notch_hit(outside_y, win_pos, win_size, 1.0, &pill));
    }

    #[test]
    fn test_calculate_notch_hit_expanded_text_scale_125() {
        let win_pos = tauri::PhysicalPosition::new(360, 0);
        let win_size = tauri::PhysicalSize::new(1200, 760);
        let pill = PillState {
            width: 680.0,
            height: 292.0,
            is_bottom: false,
            top_offset: 0.0,
            is_island: false,
            dpr: 1.25,
        };

        // With 125% text scale:
        // effective_sf = 1.25
        // pill_w = 680 * 1.25 = 850
        // pill_h = 292 * 1.25 = 365
        // pill_x = 360 + (1200 - 850) / 2 = 535
        // max_x = 535 + 850 + margin + tolerance ≈ 1395
        
        // Point at center
        let center = POINT { x: 960, y: 150 };
        assert!(calculate_notch_hit(center, win_pos, win_size, 1.0, &pill));

        // Point near right edge where chevron `>` button is located (x = 1375, y = 25)
        let chevron_button = POINT { x: 1375, y: 25 };
        assert!(calculate_notch_hit(chevron_button, win_pos, win_size, 1.0, &pill));

        // Point near bottom edge (y = 360)
        let bottom_panel = POINT { x: 960, y: 360 };
        assert!(calculate_notch_hit(bottom_panel, win_pos, win_size, 1.0, &pill));

        // Point far outside right
        let far_outside = POINT { x: 1450, y: 25 };
        assert!(!calculate_notch_hit(far_outside, win_pos, win_size, 1.0, &pill));
    }

    #[test]
    fn test_calculate_notch_hit_island_mode_top_edge() {
        let win_pos = tauri::PhysicalPosition::new(360, 10);
        let win_size = tauri::PhysicalSize::new(1200, 760);
        let pill = PillState {
            width: 120.0,
            height: 35.0,
            is_bottom: false,
            top_offset: 10.0,
            is_island: true,
            dpr: 1.0,
        };

        // phys_offset = 10, min_y = 10 - 10 = 0 (physical screen edge)
        let top_screen_edge = POINT { x: 960, y: 0 };
        assert!(calculate_notch_hit(top_screen_edge, win_pos, win_size, 1.0, &pill));

        // Below the pill
        let center_island = POINT { x: 960, y: 25 };
        assert!(calculate_notch_hit(center_island, win_pos, win_size, 1.0, &pill));

        // Outside top edge
        let above_screen = POINT { x: 960, y: -20 };
        assert!(!calculate_notch_hit(above_screen, win_pos, win_size, 1.0, &pill));
    }

    #[test]
    fn test_calculate_notch_hit_bottom_position() {
        let win_pos = tauri::PhysicalPosition::new(360, 320);
        let win_size = tauri::PhysicalSize::new(1200, 760);
        let pill = PillState {
            width: 120.0,
            height: 35.0,
            is_bottom: true,
            top_offset: 0.0,
            is_island: false,
            dpr: 1.0,
        };

        // pill_y = 320 + 760 - 35 = 1045
        let inside_bottom = POINT { x: 960, y: 1055 };
        assert!(calculate_notch_hit(inside_bottom, win_pos, win_size, 1.0, &pill));

        let above_bottom_notch = POINT { x: 960, y: 900 };
        assert!(!calculate_notch_hit(above_bottom_notch, win_pos, win_size, 1.0, &pill));
    }

    #[test]
    fn test_calculate_notch_hit_island_gap_above_notch() {
        // Floating island with top_offset = 12px, lyrics idle height = 54px, width = 420px
        let win_pos = tauri::PhysicalPosition::new(360, 12);
        let win_size = tauri::PhysicalSize::new(1200, 760);
        let pill = PillState {
            width: 420.0,
            height: 54.0,
            is_bottom: false,
            top_offset: 12.0,
            is_island: true,
            dpr: 1.0,
        };

        // Point inside the 12px floating gap above the notch (y = 6)
        let inside_floating_gap = POINT { x: 960, y: 6 };
        assert!(calculate_notch_hit(inside_floating_gap, win_pos, win_size, 1.0, &pill));

        // Point at the top edge of the screen (y = 0)
        let top_screen_edge = POINT { x: 960, y: 0 };
        assert!(calculate_notch_hit(top_screen_edge, win_pos, win_size, 1.0, &pill));

        // Point slightly beyond screen edge within buffer (y = -8)
        let edge_buffer = POINT { x: 960, y: -8 };
        assert!(calculate_notch_hit(edge_buffer, win_pos, win_size, 1.0, &pill));

        // Point inside the pill body (y = 35)
        let inside_pill = POINT { x: 960, y: 35 };
        assert!(calculate_notch_hit(inside_pill, win_pos, win_size, 1.0, &pill));

        // Point too far above (y = -40)
        let too_far_above = POINT { x: 960, y: -40 };
        assert!(!calculate_notch_hit(too_far_above, win_pos, win_size, 1.0, &pill));
    }
}
