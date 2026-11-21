use super::{
    context_store, get_config_snapshot, StandbyConfig, StandbyLaunchContext,
    LAST_DISMISS_INPUT_TIME, LAST_DISMISS_MONOTONIC_MS, OPENED_INPUT_TIME,
    OPENED_MONOTONIC_MS, STANDBY_BUSY, STANDBY_CLOSING, STANDBY_OPEN,
};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

pub const STANDBY_LABEL: &str = "standby";
const ENTER_FADE_MS: u64 = 320;
const EXIT_FADE_MS: u64 = 240;
const READY_FALLBACK_MS: u64 = 420;

static ANIM_GEN: AtomicU64 = AtomicU64::new(0);
static CURRENT_ALPHA: AtomicU8 = AtomicU8::new(0);
static STANDBY_ENTER_REVEALED: AtomicBool = AtomicBool::new(false);

pub(crate) fn compute_eased_alpha(from: u8, to: u8, t: f32, ease_in_out: bool) -> u8 {
    let clamped = t.clamp(0.0, 1.0);
    let eased = if ease_in_out {
        // Soft macOS dissolve curve for exit: responsive immediately, feathers cleanly to 0
        1.0 - (1.0 - clamped).powi(2)
    } else {
        // Cubic ease-out for enter
        1.0 - (1.0 - clamped).powi(3)
    };
    let val = from as f32 + (to as f32 - from as f32) * eased;
    val.round().clamp(0.0, 255.0) as u8
}

fn is_os_animations_enabled() -> bool {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::BOOL;
        use windows::Win32::UI::WindowsAndMessaging::{
            SystemParametersInfoW, SPI_GETCLIENTAREAANIMATION, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
        };
        let mut enabled = BOOL(1);
        let _ = unsafe {
            SystemParametersInfoW(
                SPI_GETCLIENTAREAANIMATION,
                0,
                Some(&mut enabled as *mut _ as *mut _),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
            )
        };
        enabled.as_bool()
    }
    #[cfg(not(windows))]
    {
        true
    }
}

pub(crate) fn should_use_layered_window(alpha: u8) -> bool {
    alpha < 255
}

#[cfg(windows)]
fn apply_standby_alpha(win: &tauri::WebviewWindow, alpha: u8) -> bool {
    use windows::Win32::Foundation::{COLORREF, HWND};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetLayeredWindowAttributes, SetWindowLongW, SetWindowPos, GWL_EXSTYLE,
        LWA_ALPHA, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
        WS_EX_LAYERED,
    };
    let Ok(raw_hwnd) = win.hwnd() else {
        return false;
    };
    let hwnd = HWND(raw_hwnd.0);
    unsafe {
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if !should_use_layered_window(alpha) {
            // Clear WS_EX_LAYERED once fully opaque so DWM can use DirectFlip/MPO on fullscreen WebView2.
            if (ex_style & WS_EX_LAYERED.0) != 0 {
                SetWindowLongW(hwnd, GWL_EXSTYLE, (ex_style & !WS_EX_LAYERED.0) as i32);
                let _ = SetWindowPos(
                    hwnd,
                    HWND(std::ptr::null_mut()),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
                );
            }
            CURRENT_ALPHA.store(255, Ordering::SeqCst);
            return true;
        }
        if (ex_style & WS_EX_LAYERED.0) == 0 {
            SetWindowLongW(hwnd, GWL_EXSTYLE, (ex_style | WS_EX_LAYERED.0) as i32);
        }
        let ok = SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha, LWA_ALPHA).is_ok();
        if ok {
            CURRENT_ALPHA.store(alpha, Ordering::SeqCst);
        }
        ok
    }
}

#[cfg(not(windows))]
fn apply_standby_alpha(_win: &tauri::WebviewWindow, alpha: u8) -> bool {
    CURRENT_ALPHA.store(alpha, Ordering::SeqCst);
    true
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedMonitorRect {
    pub id: String,
    pub is_primary: bool,
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
}

#[cfg(windows)]
extern "system" {
    fn GetTickCount64() -> u64;
}

pub fn now_monotonic_ms() -> u64 {
    #[cfg(windows)]
    {
        unsafe { GetTickCount64() }
    }
    #[cfg(not(windows))]
    {
        0
    }
}

pub fn current_last_input_time() -> u32 {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
        let mut lii = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if unsafe { GetLastInputInfo(&mut lii).as_bool() } {
            return lii.dwTime;
        }
    }
    0
}

pub fn system_idle_ms() -> u64 {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
        let mut lii = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if !unsafe { GetLastInputInfo(&mut lii).as_bool() } {
            return 0;
        }
        // Sample monotonic tick AFTER GetLastInputInfo so concurrent input cannot underflow to ~49.7 days
        let tick_now = now_monotonic_ms() as u32;
        let delta = tick_now.wrapping_sub(lii.dwTime);
        if delta >= 0x8000_0000 {
            return 0;
        }
        return delta as u64;
    }
    #[cfg(not(windows))]
    {
        0
    }
}

#[cfg(windows)]
fn is_desktop_or_self_window(hwnd: windows::Win32::Foundation::HWND) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetWindowThreadProcessId};
    if hwnd.0.is_null() {
        return true;
    }
    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == std::process::id() {
            return true;
        }
        let mut cls = [0u16; 64];
        let len = GetClassNameW(hwnd, &mut cls);
        if len > 0 {
            let name = String::from_utf16_lossy(&cls[..len as usize]);
            if matches!(
                name.as_str(),
                "Progman"
                    | "WorkerW"
                    | "Shell_TrayWnd"
                    | "Shell_SecondaryTrayWnd"
                    | "GiliDesktopWidgetsHostV1"
            ) {
                return true;
            }
        }
    }
    false
}

#[cfg(windows)]
fn is_foreground_window_covering_monitor() -> bool {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowLongW, GetWindowRect, IsIconic, IsZoomed, GWL_STYLE,
        WS_CAPTION, WS_THICKFRAME,
    };

    unsafe {
        let fg = GetForegroundWindow();
        if is_desktop_or_self_window(fg) || IsIconic(fg).as_bool() {
            return false;
        }
        let style = GetWindowLongW(fg, GWL_STYLE) as u32;
        let has_chrome = (style & WS_CAPTION.0) == WS_CAPTION.0 && (style & WS_THICKFRAME.0) != 0;
        // Normal maximized windows with a standard title bar are not true fullscreen (especially when taskbar is hidden)
        if IsZoomed(fg).as_bool() && has_chrome {
            return false;
        }
        let mut wr = RECT::default();
        let dwm_ok = DwmGetWindowAttribute(
            fg,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut wr as *mut RECT as *mut std::ffi::c_void,
            std::mem::size_of::<RECT>() as u32,
        )
        .is_ok();
        if !dwm_ok && GetWindowRect(fg, &mut wr).is_err() {
            return false;
        }
        let hmon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
        if hmon.0.is_null() {
            return false;
        }
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(hmon, &mut mi).as_bool() {
            return false;
        }
        let covers_edges = wr.left <= mi.rcMonitor.left + 2
            && wr.top <= mi.rcMonitor.top + 2
            && wr.right >= mi.rcMonitor.right - 2
            && wr.bottom >= mi.rcMonitor.bottom - 2;
        covers_edges && !has_chrome
    }
}

pub fn is_fullscreen_blocking() -> bool {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Shell::{
            SHQueryUserNotificationState, QUNS_BUSY, QUNS_NOT_PRESENT, QUNS_PRESENTATION_MODE,
            QUNS_RUNNING_D3D_FULL_SCREEN,
        };
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        unsafe {
            if let Ok(state) = SHQueryUserNotificationState() {
                if state == QUNS_RUNNING_D3D_FULL_SCREEN
                    || state == QUNS_PRESENTATION_MODE
                    || state == QUNS_NOT_PRESENT
                {
                    return true;
                }
                if state == QUNS_BUSY && !is_desktop_or_self_window(GetForegroundWindow()) {
                    return true;
                }
            }
        }
        is_foreground_window_covering_monitor()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

pub fn is_video_media_payload(m: &crate::media_lyrics_store::MediaPayload) -> bool {
    if !m.is_playing {
        return false;
    }
    let web = m
        .web_source
        .as_deref()
        .unwrap_or("")
        .to_ascii_lowercase();
    let app = m.app_id.as_deref().unwrap_or("").to_ascii_lowercase();

    // Pure audio music players should still allow StandBy (e.g. StandBy Media screen)
    const MUSIC_ONLY: [&str; 9] = [
        "spotify",
        "youtube music",
        "apple music",
        "soundcloud",
        "tidal",
        "deezer",
        "qobuz",
        "bandcamp",
        "bitchord",
    ];
    if MUSIC_ONLY.iter().any(|k| web == *k || app.contains(k)) {
        return false;
    }

    // WinRT MediaPlaybackType::Video == 2
    if m.playback_type == 2 {
        return true;
    }

    const VIDEO_SOURCES: [&str; 21] = [
        "youtube",
        "netflix",
        "twitch",
        "bilibili",
        "disney",
        "prime",
        "vimeo",
        "crunchyroll",
        "vidio",
        "viu",
        "tiktok",
        "kick",
        "iqiyi",
        "wetv",
        "hotstar",
        "hbo",
        "max",
        "plex",
        "jellyfin",
        "apple tv",
        "dailymotion",
    ];
    if !web.is_empty() && VIDEO_SOURCES.iter().any(|k| web.contains(k)) {
        return true;
    }

    const VIDEO_APPS: [&str; 20] = [
        "vlc",
        "mpv",
        "mpc-hc",
        "mpc-be",
        "potplayer",
        "kmplayer",
        "gom",
        "kodi",
        "stremio",
        "plex",
        "jellyfin",
        "netflix",
        "disney",
        "primevideo",
        "zunevideo",
        "video.ui",
        "films",
        "zoom",
        "teams",
        "obs",
    ];
    if !app.is_empty() && VIDEO_APPS.iter().any(|k| app.contains(k)) {
        return true;
    }

    // Browser playing non-music video/stream tabs where SMTC did not tag Music
    if m.is_browser && web.is_empty() && m.playback_type != 1 {
        return true;
    }

    false
}

#[cfg(windows)]
fn foreground_looks_like_video_window() -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, IsIconic,
    };
    unsafe {
        let fg = GetForegroundWindow();
        if is_desktop_or_self_window(fg) || IsIconic(fg).as_bool() {
            return false;
        }
        let mut buf = [0u16; 256];
        let len = GetWindowTextW(fg, &mut buf);
        if len <= 0 {
            return false;
        }
        let title = String::from_utf16_lossy(&buf[..len as usize]).to_ascii_lowercase();
        if title.contains("youtube music") || title.contains("spotify") {
            return false;
        }
        const HINTS: [&str; 20] = [
            "youtube",
            "netflix",
            "disney+",
            "prime video",
            "twitch",
            "bilibili",
            "crunchyroll",
            "vidio",
            "viu",
            "vlc media player",
            "mpc-hc",
            "mpc-be",
            "potplayer",
            "mpv",
            "plex",
            "jellyfin",
            "stremio",
            "kodi",
            "zoom meeting",
            "microsoft teams",
        ];
        HINTS.iter().any(|h| title.contains(h))
    }
}

#[cfg(windows)]
fn has_active_system_audio_output() -> bool {
    use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    unsafe {
        let co_ok = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
        let active = (|| -> Option<bool> {
            let enumerator =
                CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .ok()?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eMultimedia)
                .ok()?;
            let meter = device.Activate::<IAudioMeterInformation>(CLSCTX_ALL, None).ok()?;
            let peak = meter.GetPeakValue().ok()?;
            Some(peak > 0.001)
        })()
        .unwrap_or(false);
        if co_ok {
            CoUninitialize();
        }
        active
    }
}

fn is_pure_music_media_payload(m: &crate::media_lyrics_store::MediaPayload) -> bool {
    if !m.is_playing {
        return false;
    }
    let web = m
        .web_source
        .as_deref()
        .unwrap_or("")
        .to_ascii_lowercase();
    let app = m.app_id.as_deref().unwrap_or("").to_ascii_lowercase();
    const MUSIC_ONLY: [&str; 10] = [
        "spotify",
        "youtube music",
        "apple music",
        "amazon music",
        "soundcloud",
        "tidal",
        "deezer",
        "qobuz",
        "bandcamp",
        "bitchord",
    ];
    MUSIC_ONLY.iter().any(|k| web == *k || app.contains(k))
}

pub fn is_video_or_movie_playing() -> bool {
    let media = crate::media_lyrics_store::get_current_media();
    if is_video_media_payload(&media) {
        return true;
    }
    // If SMTC already confirms pure music playback (e.g. Spotify), do not let system audio peak
    // combine with a paused YouTube/Teams foreground window into a false video detection.
    if is_pure_music_media_payload(&media) {
        return false;
    }
    #[cfg(windows)]
    {
        if foreground_looks_like_video_window() && has_active_system_audio_output() {
            return true;
        }
    }
    false
}

pub fn enumerate_physical_monitors() -> Vec<ResolvedMonitorRect> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{BOOL, LPARAM, RECT};
        use windows::Win32::Graphics::Gdi::{
            EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFOEXW,
        };

        unsafe extern "system" fn enum_proc(
            hmon: HMONITOR,
            _: HDC,
            _: *mut RECT,
            lparam: LPARAM,
        ) -> BOOL {
            let list = &mut *(lparam.0 as *mut Vec<ResolvedMonitorRect>);
            let mut info = MONITORINFOEXW::default();
            info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            if GetMonitorInfoW(hmon, &mut info.monitorInfo as *mut _ as *mut _).as_bool() {
                let id = String::from_utf16_lossy(&info.szDevice)
                    .trim_matches(char::from(0))
                    .to_string();
                let rc = info.monitorInfo.rcMonitor;
                let w = (rc.right - rc.left).max(1);
                let h = (rc.bottom - rc.top).max(1);
                let is_primary = (info.monitorInfo.dwFlags & 1) != 0;
                list.push(ResolvedMonitorRect {
                    id,
                    is_primary,
                    left: rc.left,
                    top: rc.top,
                    width: w,
                    height: h,
                });
            }
            BOOL(1)
        }

        let mut monitors = Vec::new();
        unsafe {
            let _ = EnumDisplayMonitors(
                HDC(std::ptr::null_mut()),
                None,
                Some(enum_proc),
                LPARAM(&mut monitors as *mut _ as isize),
            );
        }
        return monitors;
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

fn norm_mon_id(id: &str) -> String {
    id.trim().trim_start_matches(r"\\.\").to_ascii_lowercase()
}

pub fn select_target_monitor(
    monitors: &[ResolvedMonitorRect],
    target_id: Option<&str>,
    prefer_secondary: bool,
) -> Option<ResolvedMonitorRect> {
    if monitors.is_empty() {
        return None;
    }
    if let Some(wanted) = target_id.filter(|s| !s.trim().is_empty()) {
        let wanted_norm = norm_mon_id(wanted);
        if let Some(found) = monitors.iter().find(|m| norm_mon_id(&m.id) == wanted_norm) {
            if !prefer_secondary || !found.is_primary {
                return Some(found.clone());
            }
        }
    }
    if prefer_secondary {
        monitors.iter().find(|m| !m.is_primary).cloned()
    } else {
        monitors
            .iter()
            .find(|m| m.is_primary)
            .cloned()
            .or_else(|| monitors.first().cloned())
    }
}

pub fn open_standby_internal(app: &AppHandle, trigger: &str) {
    if !crate::store_license::can_use_pro_bundle() {
        return;
    }
    if STANDBY_BUSY
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    let cfg = get_config_snapshot();
    let app_handle = app.clone();
    let trigger_owned = trigger.to_string();

    std::thread::spawn(move || {
        struct BusyReset;
        impl Drop for BusyReset {
            fn drop(&mut self) {
                STANDBY_BUSY.store(false, Ordering::SeqCst);
            }
        }
        let _busy = BusyReset;

        let prefer_secondary = trigger_owned == "secondary_permanent";
        let monitors = enumerate_physical_monitors();
        let Some(target) = select_target_monitor(
            &monitors,
            cfg.target_monitor_id.as_deref(),
            prefer_secondary,
        ) else {
            return;
        };

        let is_sec_mon = !target.is_primary;
        let close_on_activity =
            trigger_owned == "idle" && cfg.exit_on_mouse_move && !prefer_secondary;
        let top_most = if prefer_secondary {
            cfg.always_on_top
        } else {
            true
        };
        let should_focus = !prefer_secondary;

        if let Ok(mut guard) = context_store().lock() {
            *guard = StandbyLaunchContext {
                trigger: trigger_owned.clone(),
                close_on_activity,
                monitor_id: Some(target.id.clone()),
                is_secondary_monitor: is_sec_mon,
            };
        }

        if let Some(existing) = app_handle.get_webview_window(STANDBY_LABEL) {
            let was_closing = STANDBY_CLOSING.swap(false, Ordering::SeqCst);
            // Always bump ANIM_GEN so any in-flight exit-fade thread aborts immediately
            ANIM_GEN.fetch_add(1, Ordering::SeqCst);
            OPENED_INPUT_TIME.store(current_last_input_time(), Ordering::SeqCst);
            OPENED_MONOTONIC_MS.store(now_monotonic_ms(), Ordering::SeqCst);
            position_standby_hwnd(&existing, &target, top_most, should_focus, false);
            STANDBY_OPEN.store(true, Ordering::SeqCst);
            let _ = existing.emit("standby:context-updated", get_context_copy());
            let _ = app_handle.emit("standby:visibility-changed", true);
            if was_closing || CURRENT_ALPHA.load(Ordering::SeqCst) < 255 {
                STANDBY_ENTER_REVEALED.store(false, Ordering::SeqCst);
                reveal_standby_window(&app_handle);
            }
            return;
        }

        STANDBY_CLOSING.store(false, Ordering::SeqCst);
        STANDBY_ENTER_REVEALED.store(false, Ordering::SeqCst);
        ANIM_GEN.fetch_add(1, Ordering::SeqCst);
        CURRENT_ALPHA.store(0, Ordering::SeqCst);
        // Seed open timestamps BEFORE builder.build() so idle_watcher cannot mistake a brand-new window as stale
        OPENED_INPUT_TIME.store(current_last_input_time(), Ordering::SeqCst);
        OPENED_MONOTONIC_MS.store(now_monotonic_ms(), Ordering::SeqCst);

        let init_script = "window.__IS_STANDBY_WINDOW__ = true;";
        let builder = tauri::WebviewWindowBuilder::new(
            &app_handle,
            STANDBY_LABEL,
            tauri::WebviewUrl::App("index.html?window=standby".into()),
        )
        .title("Gili StandBy")
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .decorations(false)
        .transparent(false)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(top_most)
        .visible(false)
        .focused(should_focus)
        .initialization_script(init_script)
        .additional_browser_args(crate::WEBVIEW_BROWSER_ARGS);

        match builder.build() {
            Ok(win) => {
                let start_transparent = is_os_animations_enabled();
                position_standby_hwnd(&win, &target, top_most, should_focus, start_transparent);
                STANDBY_OPEN.store(true, Ordering::SeqCst);
                OPENED_INPUT_TIME.store(current_last_input_time(), Ordering::SeqCst);
                OPENED_MONOTONIC_MS.store(now_monotonic_ms(), Ordering::SeqCst);
                let _ = app_handle.emit("standby:visibility-changed", true);

                if start_transparent {
                    let fallback_app = app_handle.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(READY_FALLBACK_MS));
                        if STANDBY_OPEN.load(Ordering::SeqCst)
                            && !STANDBY_CLOSING.load(Ordering::SeqCst)
                            && !STANDBY_ENTER_REVEALED.load(Ordering::SeqCst)
                        {
                            reveal_standby_window(&fallback_app);
                        }
                    });
                } else {
                    STANDBY_ENTER_REVEALED.store(true, Ordering::SeqCst);
                }

                let app_ev = app_handle.clone();
                win.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::Destroyed) {
                        super::deep_eco::exit_deep_eco(&app_ev);
                        ANIM_GEN.fetch_add(1, Ordering::SeqCst);
                        STANDBY_OPEN.store(false, Ordering::SeqCst);
                        STANDBY_CLOSING.store(false, Ordering::SeqCst);
                        STANDBY_ENTER_REVEALED.store(false, Ordering::SeqCst);
                        CURRENT_ALPHA.store(0, Ordering::SeqCst);
                        LAST_DISMISS_MONOTONIC_MS.store(now_monotonic_ms(), Ordering::SeqCst);
                        LAST_DISMISS_INPUT_TIME.store(current_last_input_time(), Ordering::SeqCst);
                        let _ = app_ev.emit("standby:visibility-changed", false);
                        crate::memory_optimizer::schedule_working_set_trim(900);
                    }
                });
            }
            Err(e) => {
                eprintln!("[standby] Failed to create WebView2 window: {:?}", e);
            }
        }
    });
}

fn get_context_copy() -> StandbyLaunchContext {
    context_store()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

#[cfg(windows)]
fn position_standby_hwnd(
    win: &tauri::WebviewWindow,
    target: &ResolvedMonitorRect,
    top_most: bool,
    focus: bool,
    start_transparent: bool,
) {
    use windows::Win32::Foundation::{COLORREF, HWND};
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::Input::KeyboardAndMouse::SetFocus;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowLongW, GetWindowThreadProcessId, SetForegroundWindow,
        SetLayeredWindowAttributes, SetWindowLongW, SetWindowPos, GWL_EXSTYLE, HWND_NOTOPMOST,
        HWND_TOPMOST, LWA_ALPHA, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_SHOWWINDOW,
        WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_TOOLWINDOW,
    };

    if let Ok(raw_hwnd) = win.hwnd() {
        let hwnd = HWND(raw_hwnd.0);
        unsafe {
            let mut ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            ex_style &= !WS_EX_APPWINDOW.0;
            ex_style |= WS_EX_TOOLWINDOW.0;
            let initial_alpha = if start_transparent { 0 } else { 255 };
            if should_use_layered_window(initial_alpha) {
                ex_style |= WS_EX_LAYERED.0;
                SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style as i32);
                let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), initial_alpha, LWA_ALPHA);
            } else {
                ex_style &= !WS_EX_LAYERED.0;
                SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style as i32);
            }
            CURRENT_ALPHA.store(initial_alpha, Ordering::SeqCst);

            let insert_after = if top_most {
                HWND_TOPMOST
            } else {
                HWND_NOTOPMOST
            };
            let flags = if focus {
                SWP_SHOWWINDOW | SWP_FRAMECHANGED
            } else {
                SWP_SHOWWINDOW | SWP_NOACTIVATE | SWP_FRAMECHANGED
            };
            let _ = SetWindowPos(
                hwnd,
                insert_after,
                target.left,
                target.top,
                target.width,
                target.height,
                flags,
            );
            if focus {
                let fg_hwnd = GetForegroundWindow();
                let fg_tid = if !fg_hwnd.0.is_null() {
                    GetWindowThreadProcessId(fg_hwnd, None)
                } else {
                    0
                };
                let cur_tid = GetCurrentThreadId();
                let attached = fg_tid != 0
                    && fg_tid != cur_tid
                    && AttachThreadInput(cur_tid, fg_tid, true).as_bool();
                let _ = SetForegroundWindow(hwnd);
                let _ = SetFocus(hwnd);
                if attached {
                    let _ = AttachThreadInput(cur_tid, fg_tid, false);
                }
            }
        }
        if focus {
            let _ = win.set_focus();
        }
    } else {
        let _ = win.set_always_on_top(top_most);
        let _ = win.show();
        if focus {
            let _ = win.set_focus();
        }
    }
}

pub fn reveal_standby_window(app: &AppHandle) {
    if STANDBY_CLOSING.load(Ordering::SeqCst) {
        return;
    }
    if STANDBY_ENTER_REVEALED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    let Some(win) = app.get_webview_window(STANDBY_LABEL) else {
        return;
    };
    let start_alpha = CURRENT_ALPHA.load(Ordering::SeqCst);
    if start_alpha >= 255 || !is_os_animations_enabled() {
        let _ = apply_standby_alpha(&win, 255);
        return;
    }

    let gen = ANIM_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let start = Instant::now();
        let dur = Duration::from_millis(ENTER_FADE_MS);
        loop {
            if ANIM_GEN.load(Ordering::SeqCst) != gen || STANDBY_CLOSING.load(Ordering::SeqCst) {
                break;
            }
            let Some(w) = app_clone.get_webview_window(STANDBY_LABEL) else {
                break;
            };
            let elapsed = start.elapsed();
            let t = (elapsed.as_secs_f32() / dur.as_secs_f32()).min(1.0);
            let alpha = compute_eased_alpha(start_alpha, 255, t, false);
            if !apply_standby_alpha(&w, alpha) || t >= 1.0 {
                break;
            }
            std::thread::sleep(Duration::from_millis(8));
        }
    });
}

pub fn request_smooth_close_standby(app: &AppHandle) {
    super::deep_eco::exit_deep_eco(app);
    if STANDBY_CLOSING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    let Some(win) = app.get_webview_window(STANDBY_LABEL) else {
        destroy_standby_window(app);
        return;
    };

    let _ = win.emit("standby:closing", true);

    if !is_os_animations_enabled() {
        destroy_standby_window(app);
        return;
    }

    let start_alpha = CURRENT_ALPHA.load(Ordering::SeqCst);
    if start_alpha == 0 {
        destroy_standby_window(app);
        return;
    }

    let gen = ANIM_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let start = Instant::now();
        let dur = Duration::from_millis(EXIT_FADE_MS);
        loop {
            if ANIM_GEN.load(Ordering::SeqCst) != gen || !STANDBY_CLOSING.load(Ordering::SeqCst) {
                return;
            }
            let Some(w) = app_clone.get_webview_window(STANDBY_LABEL) else {
                break;
            };
            let elapsed = start.elapsed();
            let t = (elapsed.as_secs_f32() / dur.as_secs_f32()).min(1.0);
            let alpha = compute_eased_alpha(start_alpha, 0, t, true);
            if !apply_standby_alpha(&w, alpha) || t >= 1.0 {
                break;
            }
            std::thread::sleep(Duration::from_millis(8));
        }
        if ANIM_GEN.load(Ordering::SeqCst) == gen && STANDBY_CLOSING.load(Ordering::SeqCst) {
            destroy_standby_window(&app_clone);
        }
    });
}

pub fn is_standby_foreground(app: &AppHandle) -> bool {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        if let Some(win) = app.get_webview_window(STANDBY_LABEL) {
            if let Ok(raw_hwnd) = win.hwnd() {
                let fg = unsafe { GetForegroundWindow() };
                return fg == HWND(raw_hwnd.0);
            }
        }
    }
    #[cfg(not(windows))]
    let _ = app;
    false
}

#[cfg(not(windows))]
fn position_standby_hwnd(
    win: &tauri::WebviewWindow,
    _target: &ResolvedMonitorRect,
    top_most: bool,
    focus: bool,
    _start_transparent: bool,
) {
    let _ = win.set_always_on_top(top_most);
    let _ = win.show();
    if focus {
        let _ = win.set_focus();
    }
}

pub fn destroy_standby_window(app: &AppHandle) {
    super::deep_eco::exit_deep_eco(app);
    ANIM_GEN.fetch_add(1, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window(STANDBY_LABEL) {
        let _ = win.hide();
        let _ = win.destroy();
    }
    STANDBY_OPEN.store(false, Ordering::SeqCst);
    STANDBY_CLOSING.store(false, Ordering::SeqCst);
    STANDBY_ENTER_REVEALED.store(false, Ordering::SeqCst);
    CURRENT_ALPHA.store(0, Ordering::SeqCst);
    LAST_DISMISS_MONOTONIC_MS.store(now_monotonic_ms(), Ordering::SeqCst);
    LAST_DISMISS_INPUT_TIME.store(current_last_input_time(), Ordering::SeqCst);
    let _ = app.emit("standby:visibility-changed", false);
    crate::memory_optimizer::schedule_working_set_trim(900);
}

pub fn reconcile_after_config_change(app: &AppHandle, cfg: &StandbyConfig) {
    if !crate::store_license::can_use_pro_bundle() {
        destroy_standby_window(app);
        return;
    }
    if cfg.activation_mode == "secondary_permanent" {
        let monitors = enumerate_physical_monitors();
        if let Some(target) =
            select_target_monitor(&monitors, cfg.target_monitor_id.as_deref(), true)
        {
            if let Some(win) = app.get_webview_window(STANDBY_LABEL) {
                STANDBY_CLOSING.store(false, Ordering::SeqCst);
                ANIM_GEN.fetch_add(1, Ordering::SeqCst);
                position_standby_hwnd(&win, &target, cfg.always_on_top, false, false);
                if let Ok(mut guard) = context_store().lock() {
                    guard.trigger = "secondary_permanent".to_string();
                    guard.close_on_activity = false;
                    guard.monitor_id = Some(target.id.clone());
                    guard.is_secondary_monitor = true;
                }
                let _ = win.emit("standby:context-updated", get_context_copy());
            } else {
                open_standby_internal(app, "secondary_permanent");
            }
            return;
        }
        request_smooth_close_standby(app);
    } else if get_context_copy().trigger == "secondary_permanent" {
        request_smooth_close_standby(app);
    }
}

pub fn reconcile_on_display_change(app: &AppHandle) {
    if !crate::store_license::can_use_pro_bundle() {
        if STANDBY_OPEN.load(Ordering::SeqCst) || app.get_webview_window(STANDBY_LABEL).is_some() {
            destroy_standby_window(app);
        }
        return;
    }
    let cfg = get_config_snapshot();
    if cfg.activation_mode != "secondary_permanent" {
        if app.get_webview_window(STANDBY_LABEL).is_some() {
            let monitors = enumerate_physical_monitors();
            let ctx = get_context_copy();
            if let Some(mon_id) = ctx.monitor_id.as_deref() {
                if !monitors.iter().any(|m| m.id == mon_id) {
                    destroy_standby_window(app);
                }
            }
        }
        return;
    }

    let monitors = enumerate_physical_monitors();
    if let Some(target) = select_target_monitor(&monitors, cfg.target_monitor_id.as_deref(), true) {
        if super::SECONDARY_USER_DISMISSED.load(Ordering::SeqCst) {
            return;
        }
        if let Some(win) = app.get_webview_window(STANDBY_LABEL) {
            STANDBY_CLOSING.store(false, Ordering::SeqCst);
            ANIM_GEN.fetch_add(1, Ordering::SeqCst);
            position_standby_hwnd(&win, &target, cfg.always_on_top, false, false);
        } else {
            open_standby_internal(app, "secondary_permanent");
        }
    } else if STANDBY_OPEN.load(Ordering::SeqCst) {
        super::SECONDARY_USER_DISMISSED.store(false, Ordering::SeqCst);
        destroy_standby_window(app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_eased_alpha_interpolates_enter_exit_and_partial() {
        assert_eq!(compute_eased_alpha(0, 255, 0.0, false), 0);
        assert_eq!(compute_eased_alpha(0, 255, 1.0, false), 255);
        assert!(compute_eased_alpha(0, 255, 0.5, false) > 128);

        assert_eq!(compute_eased_alpha(255, 0, 0.0, true), 255);
        assert_eq!(compute_eased_alpha(255, 0, 1.0, true), 0);
        assert!(compute_eased_alpha(255, 0, 0.5, true) < 128);

        // Partial fade-out when interrupted mid-enter
        assert_eq!(compute_eased_alpha(140, 0, 0.0, true), 140);
        assert_eq!(compute_eased_alpha(140, 0, 1.0, true), 0);
    }

    #[test]
    fn layered_window_flag_only_active_during_alpha_fade() {
        assert!(should_use_layered_window(0));
        assert!(should_use_layered_window(128));
        assert!(should_use_layered_window(254));
        assert!(!should_use_layered_window(255));
    }

    #[test]
    fn select_target_monitor_handles_primary_and_secondary() {
        let mons = vec![
            ResolvedMonitorRect {
                id: r"\\.\DISPLAY1".into(),
                is_primary: true,
                left: 0,
                top: 0,
                width: 1920,
                height: 1080,
            },
            ResolvedMonitorRect {
                id: r"\\.\DISPLAY2".into(),
                is_primary: false,
                left: 1920,
                top: 0,
                width: 1920,
                height: 1080,
            },
        ];
        assert_eq!(
            select_target_monitor(&mons, None, false).unwrap().id,
            r"\\.\DISPLAY1"
        );
        assert_eq!(
            select_target_monitor(&mons, None, true).unwrap().id,
            r"\\.\DISPLAY2"
        );
        assert_eq!(
            select_target_monitor(&mons, Some(r"\\.\DISPLAY1"), true)
                .unwrap()
                .id,
            r"\\.\DISPLAY2"
        );
        assert!(select_target_monitor(&mons[..1], None, true).is_none());
    }

    #[test]
    fn video_media_detection_blocks_movies_but_allows_music_players() {
        use crate::media_lyrics_store::MediaPayload;

        let youtube = MediaPayload {
            is_playing: true,
            playback_type: 1,
            web_source: Some("YouTube".into()),
            is_browser: true,
            ..Default::default()
        };
        assert!(is_video_media_payload(&youtube));

        let vlc = MediaPayload {
            is_playing: true,
            playback_type: 2,
            app_id: Some("vlc.exe".into()),
            ..Default::default()
        };
        assert!(is_video_media_payload(&vlc));

        let paused_vlc = MediaPayload {
            is_playing: false,
            playback_type: 2,
            app_id: Some("vlc.exe".into()),
            ..Default::default()
        };
        assert!(!is_video_media_payload(&paused_vlc));

        let spotify = MediaPayload {
            is_playing: true,
            playback_type: 1,
            app_id: Some("Spotify.exe".into()),
            web_source: Some("Spotify".into()),
            ..Default::default()
        };
        assert!(!is_video_media_payload(&spotify));

        let yt_music = MediaPayload {
            is_playing: true,
            playback_type: 1,
            web_source: Some("YouTube Music".into()),
            is_browser: true,
            ..Default::default()
        };
        assert!(!is_video_media_payload(&yt_music));
    }
}
