use tauri::Manager;

mod privacy;
mod connectivity;

#[derive(serde::Serialize, Clone)]
struct AudioSessionInfo {
    pid: u32,
    name: String,
    volume: f32,
    muted: bool,
}

#[tauri::command]
async fn get_audio_sessions() -> Vec<AudioSessionInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED, CoCreateInstance, CLSCTX_ALL};
        use windows::Win32::Media::Audio::{eRender, eMultimedia, IMMDeviceEnumerator, MMDeviceEnumerator, IAudioSessionManager2, IAudioSessionControl2, ISimpleAudioVolume};
        use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};
        use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;
        use windows::Win32::Foundation::MAX_PATH;
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
                                            
                                            let mut process_name = String::from("Unknown");
                                            if let Ok(handle) = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid) {
                                                let mut buffer = [0u16; MAX_PATH as usize];
                                                let len = GetModuleFileNameExW(handle, None, &mut buffer);
                                                if len > 0 {
                                                    let full_path = String::from_utf16_lossy(&buffer[..len as usize]);
                                                    if let Some(name) = std::path::Path::new(&full_path).file_name() {
                                                        process_name = name.to_string_lossy().into_owned();
                                                    }
                                                }
                                                let _ = windows::Win32::Foundation::CloseHandle(handle);
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
fn set_app_volume(pid: u32, volume: f32) {
    tauri::async_runtime::spawn_blocking(move || {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED, CoCreateInstance, CLSCTX_ALL};
        use windows::Win32::Media::Audio::{eRender, eMultimedia, IMMDeviceEnumerator, MMDeviceEnumerator, IAudioSessionManager2, IAudioSessionControl2, ISimpleAudioVolume};
        use windows::core::Interface;
        
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
                                            if spid == pid {
                                                if let Ok(volume_ctrl) = session_ctrl2.cast::<ISimpleAudioVolume>() {
                                                    let _ = volume_ctrl.SetMasterVolume(volume, std::ptr::null());
                                                }
                                                break;
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

#[tauri::command]
async fn extract_clipboard_text(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_clipboard_manager::ClipboardExt;

        let clipboard = app.clipboard();
        let image = clipboard.read_image().map_err(|e| e.to_string())?;

        let width = image.width();
        let height = image.height();
        if width == 0 || height == 0 {
            return Err("Invalid image dimensions".to_string());
        }

        let rgba = image.rgba();
        if rgba.len() != (width * height * 4) as usize {
            return Err("Invalid image byte size".to_string());
        }

        // Windows OCR memiliki batas ukuran (MaxImageDimension ~2600px).
        // Jika screenshot melebihi 2500px (layar 2K/4K/dual monitor), resize proporsional.
        let (final_rgba, final_width, final_height) = if width > 2500 || height > 2500 {
            if let Some(img_buffer) = image::RgbaImage::from_raw(width, height, rgba.to_vec()) {
                let scale = 2500.0 / (width.max(height) as f32);
                let target_w = ((width as f32 * scale).round() as u32).max(1);
                let target_h = ((height as f32 * scale).round() as u32).max(1);
                let resized = image::imageops::resize(&img_buffer, target_w, target_h, image::imageops::FilterType::Triangle);
                let (rw, rh) = resized.dimensions();
                (resized.into_raw(), rw, rh)
            } else {
                (rgba.to_vec(), width, height)
            }
        } else {
            (rgba.to_vec(), width, height)
        };

        let temp_dir = std::env::temp_dir();
        let img_path = temp_dir.join(format!("notch_ocr_{}.png", std::process::id()));

        image::save_buffer(&img_path, &final_rgba, final_width, final_height, image::ColorType::Rgba8)
            .map_err(|e| e.to_string())?;

        let ocr_result = (|| -> Result<String, String> {
            use windows::Graphics::Imaging::BitmapDecoder;
            use windows::Media::Ocr::OcrEngine;
            use windows::Storage::{StorageFile, FileAccessMode};
            use std::os::windows::ffi::OsStrExt;
            use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

            // Inisialisasi COM untuk thread ini (penting buat WinRT)
            let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };

            let wide_path: Vec<u16> = img_path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
            let hstring_path = windows::core::HSTRING::from_wide(&wide_path[..wide_path.len() - 1]).map_err(|e| e.to_string())?;

            let file = StorageFile::GetFileFromPathAsync(&hstring_path).map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
            let stream = file.OpenAsync(FileAccessMode::Read).map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;

            let decoder = BitmapDecoder::CreateAsync(&stream).map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
            let software_bitmap = decoder.GetSoftwareBitmapAsync().map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;

            let engine = OcrEngine::TryCreateFromUserProfileLanguages().map_err(|e| e.to_string())?;

            // Cegah STATUS_ACCESS_VIOLATION (0xC0000005) jika Windows tidak memiliki OCR language pack
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

        let _ = std::fs::remove_file(&img_path);
        ocr_result
    })
    .await
    .map_err(|e| e.to_string())?
}

static LAST_ACTIVE_SMTC: std::sync::Mutex<(String, String)> = std::sync::Mutex::new((String::new(), String::new()));
static LAST_SMTC_SEEK: std::sync::Mutex<Option<(std::time::Instant, f64)>> = std::sync::Mutex::new(None);

fn resolve_smtc_session(
    manager: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager,
) -> Option<windows::Media::Control::GlobalSystemMediaTransportControlsSession> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;

    if let Ok(sessions) = manager.GetSessions() {
        for s in sessions.into_iter() {
            if let Ok(playback) = s.GetPlaybackInfo() {
                if playback.PlaybackStatus().unwrap_or(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed)
                    == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
                {
                    return Some(s);
                }
            }
        }
    }

    if let Ok(last) = LAST_ACTIVE_SMTC.lock() {
        if !last.0.is_empty() {
            if let Ok(sessions) = manager.GetSessions() {
                for s in sessions.into_iter() {
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

    manager.GetCurrentSession().ok()
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

fn position_notch_window(window: &tauri::WebviewWindow, is_bottom: bool) {
    if let Ok(Some(monitor)) = window.current_monitor() {
        let work_area = monitor.work_area();
        let physical_size = monitor.size();
        let physical_pos = monitor.position();
        let window_size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(1040, 720));

        let x = physical_pos.x + (physical_size.width as i32 - window_size.width as i32) / 2;
        let y = if is_bottom {
            work_area.position.y + (work_area.size.height as i32 - window_size.height as i32)
        } else {
            physical_pos.y
        };

        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
    }
}

#[tauri::command]
fn set_window_position(is_bottom: bool, window: tauri::WebviewWindow) {
    position_notch_window(&window, is_bottom);
}

#[tauri::command]
fn update_pill_size(width: f32, height: f32, is_bottom: bool, state: tauri::State<'_, PillSize>) {
    if let Ok(mut size) = state.0.lock() {
        *size = (width, height, is_bottom);
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
            if win_title_lower == "notch"
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
                "" | "applicationframehost" | "explorer" | "svchost" | "system" | "msedgewebview2" | "notch"
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
            target_name,
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
    }
    false
}

#[allow(dead_code)]
fn _unused_marker() {
}

struct PillSize(std::sync::Mutex<(f32, f32, bool)>);

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
                let (w, h, is_bottom) = if let Ok(size) = state.0.lock() {
                    *size
                } else {
                    (120.0, 35.0, false)
                };

                let pill_w = (w as f64 * sf) as i32;
                let pill_h = (h as f64 * sf) as i32;
                let (hit_w, hit_h, margin) = if h <= 10.0 {
                    (pill_w, pill_h, 0)
                } else if h > 50.0 {
                    (pill_w, pill_h, (2.0 * sf) as i32)
                } else {
                    (pill_w, pill_h, (4.0 * sf) as i32)
                };

                let pill_x = win_pos.x + (win_size.width as i32 - hit_w) / 2;
                let pill_y = if is_bottom {
                    win_pos.y + (win_size.height as i32) - hit_h
                } else {
                    win_pos.y
                };

                return pt.x >= (pill_x - margin) && pt.x <= (pill_x + hit_w + margin)
                    && pt.y >= (pill_y - margin) && pt.y <= (pill_y + hit_h + margin);
            }
        }
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    {
        use windows::Win32::System::Threading::CreateMutexW;
        use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
        use windows::core::w;

        unsafe {
            let mutex = CreateMutexW(None, true, w!("com_faiz_notch_single_instance_mutex"));
            if GetLastError() == ERROR_ALREADY_EXISTS {
                use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE};
                if let Ok(hwnd) = FindWindowW(None, w!("Notch")) {
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
        .manage(PillSize(std::sync::Mutex::new((120.0, 35.0, false))))
        .invoke_handler(tauri::generate_handler![
            set_pill_hover,
            smtc_action,
            smtc_seek,
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
            extract_clipboard_text,
            read_clipboard_text,
            set_power_plan,
            get_audio_sessions,
            set_app_volume,
            show_in_folder,
            copy_file_to_clipboard,
            copy_files_to_clipboard,
            get_file_preview,
            set_shelf_drag,
            check_foreground_browser,
            is_cursor_in_notch,
            enforce_always_on_top,
            activate_notification_app,
            connectivity::get_wifi_status,
            connectivity::toggle_wifi,
            connectivity::connect_wifi,
            connectivity::connect_wifi_with_password,
            connectivity::disconnect_wifi,
            connectivity::get_bluetooth_status,
            connectivity::toggle_bluetooth
        ])
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
            use tauri::tray::TrayIconBuilder;
            use tauri::Emitter;
            
            let toggle_i = MenuItem::with_id(app, "toggle_visibility", "Show / Hide Notch (Ctrl+Shift+D)", true, None::<&str>)?;
            let cc_i = MenuItem::with_id(app, "open_control_center", "Open Control Center", true, None::<&str>)?;
            let settings_i = MenuItem::with_id(app, "open_settings", "Open Settings", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit Notch Island", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_i, &cc_i, &settings_i, &sep, &quit_i])?;

            let mut tray_builder = TrayIconBuilder::new()
                .tooltip("Notch Island (Running in Background)")
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
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.emit("tray-open-settings", ());
                            }
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
            position_notch_window(&window, false);
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
                        let is_bottom = app_for_events
                            .state::<PillSize>()
                            .0
                            .lock()
                            .map(|s| s.2)
                            .unwrap_or(false);
                        position_notch_window(&win_for_events, is_bottom);
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
                            let (w, h, is_bottom) = if let Ok(size) = app_handle_poll.state::<PillSize>().0.lock() {
                                *size
                            } else {
                                (120.0, 35.0, false)
                            };

                            let pill_w = (w as f64 * sf) as i32;
                            let pill_h = (h as f64 * sf) as i32;

                            let (hit_w, hit_h, margin) = if h <= 10.0 {
                                (pill_w, pill_h, 0)
                            } else {
                                (pill_w, pill_h, (4.0 * sf) as i32)
                            };

                            let pill_x = win_pos.x + (win_size.width as i32 - hit_w) / 2;
                            let pill_y = if is_bottom {
                                win_pos.y + (win_size.height as i32) - hit_h
                            } else {
                                win_pos.y
                            };
                            
                            let in_pill = pt.x >= (pill_x - margin) && pt.x <= (pill_x + hit_w + margin)
                                && pt.y >= (pill_y - margin) && pt.y <= (pill_y + hit_h + margin);

                            if IS_SHELF_DRAGGING.load(std::sync::atomic::Ordering::Relaxed) {
                                let _ = win_clone.set_ignore_cursor_events(true);
                                was_in_pill = false;
                                click_outside_emitted = false;
                                time_since_left_pill = std::time::Instant::now();
                                continue;
                            }
                            
                            if in_pill != was_in_pill {
                                was_in_pill = in_pill;
                                let _ = win_clone.set_ignore_cursor_events(!in_pill);
                                use tauri::Emitter;
                                if !in_pill {
                                    time_since_left_pill = std::time::Instant::now();
                                    let _ = win_clone.emit("notch-mouse-leave", ());
                                } else {
                                    let _ = win_clone.emit("notch-mouse-enter", ());
                                }
                            }

                            if in_pill {
                                time_since_left_pill = std::time::Instant::now();
                                click_outside_emitted = false;
                            } else if h > 50.0 && time_since_left_pill.elapsed().as_millis() >= 400 {
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
                        .and_then(|s| s.0.lock().ok().map(|g| g.1 > 50.0))
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
                    
                    // Volume Check (Throttled to 500ms)
                    if counter % 5 == 0 {
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
                                                                    if let Ok(elem) = elements.GetAt(0) {
                                                                        title = elem.Text().unwrap_or_default().to_string();
                                                                    }
                                                                    if let Ok(elem) = elements.GetAt(1) {
                                                                        body = elem.Text().unwrap_or_default().to_string();
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
                    
                    if let Some(manager) = &smtc_manager {
                        let mut active_session = None;
                        if let Ok(sessions) = manager.GetSessions() {
                            for session in sessions.into_iter() {
                                if let Ok(playback) = session.GetPlaybackInfo() {
                                    if playback.PlaybackStatus().unwrap_or(windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed) == windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
                                        active_session = Some(session);
                                        break;
                                    }
                                }
                            }
                        }
                        if active_session.is_none() && !last_raw_title.is_empty() {
                            if let Ok(sessions) = manager.GetSessions() {
                                for session in sessions.into_iter() {
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
                            active_session = manager.GetCurrentSession().ok();
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
                                for suffix in [" - YouTube Music", " - YouTube", " | YouTube Music", " | YouTube"] {
                                    if title.ends_with(suffix) {
                                        title = title[..title.len() - suffix.len()].trim().to_string();
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
                                
                                let cache_key = format!("{} - {}", artist.trim().to_lowercase(), title.trim().to_lowercase());
                                
                                if title != last_title || artist != last_artist {
                                    prev_track_thumbnail = last_thumbnail.clone();
                                    track_change_ticks = 0;
                                    thumbnail_retries = 0;
                                    last_thumbnail = thumbnail_cache.get(&cache_key).cloned();
                                    if let Some(cached) = thumbnail_cache.get(&cache_key) {
                                        last_thumbnail = Some(cached.clone());
                                    }
                                }
                                
                                let _ = &track_change_ticks;
                                if title == last_title && artist == last_artist {
                                    track_change_ticks = track_change_ticks.saturating_add(1);
                                }
                                let needs_thumbnail = (last_thumbnail.is_none() && (thumbnail_retries < 40 || thumbnail_retries.is_multiple_of(10))) || (track_change_ticks <= 25 && track_change_ticks.is_multiple_of(3));
                                if (title != last_title || artist != last_artist || needs_thumbnail) && !title.is_empty() {
                                    if let Ok(thumb_ref) = info.Thumbnail() {
                                        if let Ok(stream) = thumb_ref.OpenReadAsync().and_then(|r| r.get()) {
                                            if let Ok(size) = stream.Size() {
                                                if size > 0 {
                                                    use windows::Storage::Streams::DataReader;
                                                    if let Ok(reader) = DataReader::CreateDataReader(&stream) {
                                                        if reader.LoadAsync(size as u32).and_then(|r| r.get()).is_ok() {
                                                            let mut bytes = vec![0u8; size as usize];
                                                            if reader.ReadBytes(&mut bytes).is_ok() {
                                                                use base64::{Engine as _, engine::general_purpose::STANDARD};
                                                                let mime = stream.ContentType().unwrap_or_default().to_string();
                                                                let b64 = STANDARD.encode(&bytes);
                                                                let mime_type = if mime.is_empty() { "image/png" } else { &mime };
                                                                let uri = format!("data:{};base64,{}", mime_type, b64);
                                                                let is_stale_from_prev = prev_track_thumbnail.as_ref() == Some(&uri);
                                                                if !is_stale_from_prev || track_change_ticks >= 4 {
                                                                    if !is_stale_from_prev || track_change_ticks >= 10 {
                                                                        if thumbnail_cache.len() >= 30 && !thumbnail_cache.contains_key(&cache_key) {
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
                            if let Ok(playback_info) = session.GetPlaybackInfo() {
                                use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;
                                if let Ok(status) = playback_info.PlaybackStatus() {
                                    is_playing = status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;
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
                                let new_thumb = Some(tb64);
                                if last_thumbnail != new_thumb {
                                    last_thumbnail = new_thumb;
                                    last_title.clear();
                                }
                            } else if title != last_title || artist != last_artist {
                                if let Some(cached) = thumbnail_cache.get(&cache_key) {
                                    last_thumbnail = Some(cached.clone());
                                } else {
                                    last_thumbnail = None;
                                }
                            } else if last_thumbnail.is_none() {
                                if let Some(cached) = thumbnail_cache.get(&cache_key) {
                                    last_thumbnail = Some(cached.clone());
                                    last_title.clear();
                                }
                            }
                            
                            if last_thumbnail.is_none() && !title.is_empty() {
                                thumbnail_retries = thumbnail_retries.saturating_add(1);
                            }
                        }
                    }

                    // Check for changes (whether we have a session or not)
                    if title != last_title || artist != last_artist || is_playing != last_is_playing || playback_type != last_playback_type || is_browser_session != last_is_browser || current_app_id != last_app_id || last_thumbnail != last_emitted_thumbnail {
                        last_emitted_thumbnail = last_thumbnail.clone();
                        last_title = title.clone();
                        last_artist = artist.clone();
                        last_is_playing = is_playing;
                        last_playback_type = playback_type;
                        last_is_browser = is_browser_session;
                        last_app_id = current_app_id.clone();
                        
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
                        });
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
