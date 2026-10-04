use tauri::Manager;

#[tauri::command]
fn set_pill_hover(window: tauri::Window, hovered: bool) {
    // Toggles ignore_cursor_events.
    // When hovered == true, we DO NOT ignore cursor (we want to click).
    // When hovered == false, we IGNORE cursor (click-through).
    let _ = window.set_ignore_cursor_events(!hovered);
}

#[tauri::command]
fn test_smtc() -> Result<String, String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| format!("RequestAsync error: {}", e))?
        .get()
        .map_err(|e| format!("Get manager error: {}", e))?;

    let session = manager.GetCurrentSession().map_err(|e| format!("GetCurrentSession error: {}", e))?;
    
    let info = session.TryGetMediaPropertiesAsync()
        .map_err(|e| format!("TryGetMediaPropertiesAsync error: {}", e))?
        .get()
        .map_err(|e| format!("Get properties error: {}", e))?;

    let title = info.Title().unwrap_or_default();
    let artist = info.Artist().unwrap_or_default();

    Ok(format!("{} - {}", title, artist))
}

#[tauri::command]
fn test_notification_listener() -> Result<String, String> {
    use windows::UI::Notifications::Management::UserNotificationListener;
    
    let listener = UserNotificationListener::Current().map_err(|e| format!("Listener::Current error: {}", e))?;
    
    let access_status = listener.RequestAccessAsync()
        .map_err(|e| format!("RequestAccessAsync error: {}", e))?
        .get()
        .map_err(|e| format!("Get access status error: {}", e))?;

    Ok(format!("Access status: {:?}", access_status))
}

#[tauri::command]
fn smtc_action(action: String) -> Result<(), String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    
    // Inisialisasi COM untuk thread eksekusi command Tauri ini
    let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };

    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;

    let session = manager.GetCurrentSession().map_err(|e| e.to_string())?;

    match action.as_str() {
        "toggle" => { let _ = session.TryTogglePlayPauseAsync().map_err(|e| e.to_string())?.get(); },
        "next" => { let _ = session.TrySkipNextAsync().map_err(|e| e.to_string())?.get(); },
        "prev" => { let _ = session.TrySkipPreviousAsync().map_err(|e| e.to_string())?.get(); },
        _ => return Err("Unknown action".to_string()),
    }
    
    Ok(())
}

#[tauri::command]
fn set_window_position(is_bottom: bool, window: tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = window.current_monitor() {
        let physical_size = monitor.size();
        let physical_pos = monitor.position();
        let window_size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(800, 600));
        
        let x = physical_pos.x + (physical_size.width as i32 - window_size.width as i32) / 2;
        let y = if is_bottom {
            physical_pos.y + (physical_size.height as i32 - window_size.height as i32)
        } else {
            physical_pos.y
        };
        
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
    }
}

#[tauri::command]
fn update_pill_size(width: f32, height: f32, is_bottom: bool, state: tauri::State<'_, PillSize>) {
    if let Ok(mut size) = state.0.lock() {
        *size = (width, height, is_bottom);
    }
}

struct PillSize(std::sync::Mutex<(f32, f32, bool)>);

#[tauri::command]
fn get_battery_status() -> Option<(bool, u8)> {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut power_status = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut power_status).is_ok() } {
        let is_charging = power_status.ACLineStatus == 1;
        let percent = power_status.BatteryLifePercent;
        Some((is_charging, percent))
    } else {
        None
    }
}

#[tauri::command]
fn set_master_volume(level: f32) {
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
}


#[tauri::command]
fn get_master_volume() -> f32 {
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
}

#[tauri::command]
fn get_brightness() -> u8 {
    use wmi::WMIConnection;
    use serde::Deserialize;

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
    brightness
}

#[tauri::command]
fn set_brightness(level: u8) {
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
        _ => {}
    }
}
#[tauri::command]
fn get_username() -> String {
    std::env::var("USERNAME").unwrap_or_else(|_| "User".to_string())
}

#[tauri::command]
fn get_system_info() -> (String, String) {
    use std::process::Command;
    use std::os::windows::process::CommandExt;
    
    // Wifi
    let mut wifi_name = "Not Connected".to_string();
    if let Ok(output) = Command::new("netsh").creation_flags(0x08000000).args(["wlan", "show", "interfaces"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.trim().starts_with("State") && line.contains("disconnected") {
                wifi_name = "Not Connected".to_string();
                break;
            }
            if line.trim().starts_with("SSID") {
                let parts: Vec<&str> = line.split(':').collect();
                if parts.len() > 1 {
                    wifi_name = parts[1].trim().to_string();
                    break;
                }
            }
        }
    }
    
    // Bluetooth
    let mut bt_name = "On".to_string();
    let ps_cmd = "Get-PnpDevice -Class Bluetooth | Where-Object { $_.Status -eq 'OK' -and $_.FriendlyName -notmatch 'Adapter|Enumerator|Microsoft|RFCOMM' } | Select-Object -ExpandProperty FriendlyName -First 1";
    if let Ok(output) = Command::new("powershell").creation_flags(0x08000000).args(["-NoProfile", "-Command", ps_cmd]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !stdout.is_empty() {
            bt_name = stdout;
        } else {
            bt_name = "Not Connected".to_string();
        }
    }

    (wifi_name, bt_name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_opener::init())
        .manage(PillSize(std::sync::Mutex::new((120.0, 35.0, false))))
        .invoke_handler(tauri::generate_handler![
            set_pill_hover,
            test_smtc,
            test_notification_listener,
            smtc_action,
            update_pill_size,
            set_window_position,
            get_battery_status,
            set_master_volume,
            system_power_action,
            get_username,
            get_system_info,
            get_master_volume,
            get_brightness,
            set_brightness
        ])
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::TrayIconBuilder;
            
            let quit_i = MenuItem::with_id(app, "quit", "Quit Dynamic Island", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Windows Dynamic Island")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .build(app)?;

            let window = app.get_webview_window("main").unwrap();
            
            // 1. Awalnya buat window tembus klik
            let _ = window.set_ignore_cursor_events(true);
            
            // 2. Posisikan di tengah atas layar
            if let Ok(Some(monitor)) = window.current_monitor() {
                let physical_size = monitor.size();
                let physical_pos = monitor.position();
                
                // Ambil ukuran window (default 800x200 dari config)
                let window_size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(800, 200));
                
                // Kalkulasi X ke tengah, Y di paling atas (0)
                let x = physical_pos.x + (physical_size.width as i32 - window_size.width as i32) / 2;
                let y = physical_pos.y; 
                
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
            }

            // 3. Polling kursor secara native (DPI Aware & Dynamic Size)
            let win_clone = window.clone();
            let app_handle_poll = app.handle().clone();
            std::thread::spawn(move || {
                use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
                use windows::Win32::Foundation::POINT;
                let mut was_in_pill = false;
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(50));
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
                            
                            let pill_x = win_pos.x + (win_size.width as i32 - pill_w) / 2;
                            let pill_y = if is_bottom {
                                win_pos.y + (win_size.height as i32) - pill_h
                            } else {
                                win_pos.y
                            };
                            
                            let in_pill = pt.x >= pill_x && pt.x <= (pill_x + pill_w) && pt.y >= pill_y && pt.y <= (pill_y + pill_h);
                            
                            if in_pill != was_in_pill {
                                was_in_pill = in_pill;
                                let _ = win_clone.set_ignore_cursor_events(!in_pill);
                            }
                        }
                    }
                }
            });

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
                let mut last_is_playing = false;
                let mut last_playback_type = 1;
                let mut last_thumbnail: Option<String> = None;
                let mut last_is_charging = false;
                let mut last_battery_percent = 255;
                let mut last_volume = -1.0;
                let mut thumbnail_retries = 0;
                let mut seen_notifs = std::collections::HashSet::<u32>::new();
                let mut counter = 0;
                let mut first_notif_run = true;
                
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
                        let _ = app_handle.emit("clipboard-update", ());
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
                        use windows::Win32::Media::Audio::{eRender, eMultimedia, IMMDeviceEnumerator, MMDeviceEnumerator};
                        use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
                        use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
                        
                        if let Ok(enumerator) = unsafe { CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) } {
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
                    
                    // Real Notifications Check
                    use windows::UI::Notifications::Management::{UserNotificationListener, UserNotificationListenerAccessStatus};
                    if let Some(listener) = &notif_listener {
                        if let Ok(status) = listener.RequestAccessAsync().and_then(|r| r.get()) {
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
                                                    let mut title = String::new();
                                                    let mut body = String::new();
                                                    
                                                    if let Ok(notification) = notif.Notification() {
                                                        if let Ok(visual) = notification.Visual() {
                                                            if let Ok(binding) = visual.GetBinding(&windows::core::HSTRING::from("ToastGeneric")) {
                                                                if let Ok(elements) = binding.GetTextElements() {
                                                                    if elements.Size().unwrap_or(0) > 0 {
                                                                        title = elements.GetAt(0).unwrap().Text().unwrap_or_default().to_string();
                                                                    }
                                                                    if elements.Size().unwrap_or(0) > 1 {
                                                                        body = elements.GetAt(1).unwrap().Text().unwrap_or_default().to_string();
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
                                                    }
                                                    let _ = app_handle.emit("real-notif", RealNotifPayload { app_name, title, body });
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
                    
                    let mut title = String::new();
                    let mut artist = String::new();
                    let mut is_playing = false;
                    let mut playback_type = 1;
                    
                    if let Some(manager) = &smtc_manager {
                        if let Ok(session) = manager.GetCurrentSession() {
                            let mut thumbnail_b64 = None;
                            
                            if let Ok(info) = session.TryGetMediaPropertiesAsync().and_then(|r| r.get()) {
                                title = info.Title().unwrap_or_default().to_string();
                                artist = info.Artist().unwrap_or_default().to_string();
                                if artist.trim().is_empty() {
                                    // Try to extract website name from the title (e.g. "Video Name - YouTube")
                                    if let Some(idx) = title.rfind(" - ") {
                                        artist = title[idx + 3..].trim().to_string();
                                        title = title[..idx].trim().to_string();
                                    } else if let Some(idx) = title.rfind(" | ") {
                                        artist = title[idx + 3..].trim().to_string();
                                        title = title[..idx].trim().to_string();
                                    } else if let Some(idx) = title.rfind(" • ") {
                                        artist = title[idx + 3..].trim().to_string();
                                        title = title[..idx].trim().to_string();
                                    } else {
                                        let mut app = session.SourceAppUserModelId().unwrap_or_default().to_string();
                                        let app_lower = app.to_lowercase();
                                        if app_lower.contains("msedge") || app_lower.contains("edge") {
                                            app = "Microsoft Edge".to_string();
                                        } else if app_lower.contains("chrome") {
                                            app = "Google Chrome".to_string();
                                        } else if app_lower.contains("firefox") {
                                            app = "Firefox".to_string();
                                        } else if app_lower.contains("brave") {
                                            app = "Brave Browser".to_string();
                                        } else if app_lower.contains("opera") {
                                            app = "Opera Browser".to_string();
                                        } else if app_lower.contains("vivaldi") {
                                            app = "Vivaldi".to_string();
                                        } else if app_lower.contains("arc") {
                                            app = "Arc Browser".to_string();
                                        } else if app_lower.contains("zen") {
                                            app = "Zen Browser".to_string();
                                        } else if app_lower.contains("yandex") {
                                            app = "Yandex Browser".to_string();
                                        } else if app_lower.contains("thorium") {
                                            app = "Thorium Browser".to_string();
                                        } else if app_lower.contains("waterfox") {
                                            app = "Waterfox".to_string();
                                        } else if app_lower.contains("safari") {
                                            app = "Safari".to_string();
                                        }
                                        artist = app;
                                    }
                                }
                                
                                if title != last_title || artist != last_artist {
                                    thumbnail_retries = 0;
                                }
                                
                                let needs_thumbnail = last_thumbnail.is_none() && thumbnail_retries < 50;
                                if title != last_title || artist != last_artist || needs_thumbnail {
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
                                                                thumbnail_b64 = Some(format!("data:{};base64,{}", mime_type, b64));
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
                            
                            // If title changed, update the thumbnail
                            if title != last_title || artist != last_artist {
                                last_thumbnail = thumbnail_b64;
                            } else if last_thumbnail.is_none() && thumbnail_b64.is_some() {
                                last_thumbnail = thumbnail_b64;
                                // Force an event emit by changing a last_* variable slightly or just let the check handle it?
                                // Actually, to force emit, we can just clear last_title so it re-emits!
                                last_title.clear();
                            }
                            
                            if last_thumbnail.is_none() {
                                thumbnail_retries += 1;
                            }
                        }
                    }

                    // Check for changes (whether we have a session or not)
                    if title != last_title || artist != last_artist || is_playing != last_is_playing || playback_type != last_playback_type {
                        last_title = title.clone();
                        last_artist = artist.clone();
                        last_is_playing = is_playing;
                        last_playback_type = playback_type;
                        
                        #[derive(serde::Serialize, Clone)]
                        struct MediaPayload {
                            title: String,
                            artist: String,
                            is_playing: bool,
                            thumbnail: Option<String>,
                            playback_type: i32,
                        }
                        
                        let _ = app_handle.emit("media-update", MediaPayload { 
                            title, 
                            artist, 
                            is_playing,
                            thumbnail: last_thumbnail.clone(),
                            playback_type: last_playback_type,
                        });
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
