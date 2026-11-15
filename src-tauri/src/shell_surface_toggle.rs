use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use std::sync::{Once, OnceLock};
use std::time::{Duration, Instant};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, KEYEVENTF_KEYUP, VK_ESCAPE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    IsWindowVisible,
};

#[derive(Clone, Copy, PartialEq, Debug)]
#[repr(u8)]
pub enum Surface {
    Start = 1,
    Search = 2,
    QuickSettings = 3,
    Notifications = 4,
    ShellFlyout = 5,
}

const RECENT_DISMISS_WINDOW_MS: u64 = 950;

static EPOCH: OnceLock<Instant> = OnceLock::new();
static LAST_SEEN_MS: AtomicU64 = AtomicU64::new(0);
static LAST_SEEN_KIND: AtomicU8 = AtomicU8::new(0);
static LAST_OPENED_KIND: AtomicU8 = AtomicU8::new(0);
static LAST_OPENED_MS: AtomicU64 = AtomicU64::new(0);
static WATCHER: Once = Once::new();

fn now_ms() -> u64 {
    EPOCH.get_or_init(Instant::now).elapsed().as_millis() as u64 + 1
}

fn foreground_surface_for(hwnd: HWND) -> Option<Surface> {
    unsafe {
        if hwnd.0.is_null() {
            return None;
        }

        let mut class_buf = [0u16; 128];
        let class_len = GetClassNameW(hwnd, &mut class_buf);
        let class_name = if class_len > 0 {
            String::from_utf16_lossy(&class_buf[..class_len as usize])
        } else {
            String::new()
        };

        let mut title_buf = [0u16; 128];
        let title_len = GetWindowTextW(hwnd, &mut title_buf);
        let title = if title_len > 0 {
            String::from_utf16_lossy(&title_buf[..title_len as usize]).to_lowercase()
        } else {
            String::new()
        };

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }

        let mut path = String::new();
        if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut buf = [0u16; 512];
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
                path = String::from_utf16_lossy(&buf[..len as usize]).to_lowercase();
            }
            let _ = windows::Win32::Foundation::CloseHandle(handle);
        }

        if path.ends_with("startmenuexperiencehost.exe") {
            return Some(Surface::Start);
        }
        if path.ends_with("searchhost.exe") || path.ends_with("searchapp.exe") {
            return Some(Surface::Search);
        }
        if path.ends_with("shellexperiencehost.exe") {
            if title.contains("quick")
                || title.contains("cepat")
                || title.contains("control")
                || class_name == "ControlCenterWindow"
            {
                return Some(Surface::QuickSettings);
            }
            if title.contains("notif") || title.contains("calendar") || title.contains("kalender") {
                return Some(Surface::Notifications);
            }
            let last_opened = LAST_OPENED_KIND.load(Ordering::SeqCst);
            if last_opened == Surface::QuickSettings as u8 {
                return Some(Surface::QuickSettings);
            }
            if last_opened == Surface::Notifications as u8 {
                return Some(Surface::Notifications);
            }
            return Some(Surface::ShellFlyout);
        }

        if path.ends_with("explorer.exe")
            && matches!(
                class_name.as_str(),
                "ControlCenterWindow"
                    | "XamlExplorerHostIslandWindow"
                    | "TopLevelWindowForOverflowXamlIsland"
                    | "Windows.UI.Core.CoreWindow"
            )
        {
            let last_opened = LAST_OPENED_KIND.load(Ordering::SeqCst);
            if last_opened == Surface::QuickSettings as u8 {
                return Some(Surface::QuickSettings);
            }
            if last_opened == Surface::Notifications as u8 {
                return Some(Surface::Notifications);
            }
            return Some(Surface::ShellFlyout);
        }

        None
    }
}

fn foreground_surface() -> Option<Surface> {
    let hwnd = unsafe { GetForegroundWindow() };
    foreground_surface_for(hwnd)
}

fn is_matching_surface(seen: u8, requested: Surface) -> bool {
    if seen == requested as u8 {
        return true;
    }
    let last_opened = LAST_OPENED_KIND.load(Ordering::SeqCst);
    // Start Menu on Win11 often delegates foreground focus to SearchHost.exe
    if requested == Surface::Start
        && seen == Surface::Search as u8
        && last_opened == Surface::Start as u8
    {
        return true;
    }
    // QuickSettings and Notifications share ShellExperienceHost / XamlExplorerHostIslandWindow
    if matches!(requested, Surface::QuickSettings | Surface::Notifications)
        && (seen == Surface::ShellFlyout as u8
            || ( matches!(seen, 3 | 4) && last_opened == requested as u8 ))
    {
        return true;
    }
    false
}

pub fn ensure_watcher() {
    WATCHER.call_once(|| {
        std::thread::spawn(|| {
            let mut cached_fg_hwnd: isize = 0;
            let mut cached_surface: Option<Surface> = None;

            loop {
                if !crate::navbar_window::is_navbar_enabled() {
                    cached_fg_hwnd = 0;
                    cached_surface = None;
                    std::thread::sleep(Duration::from_millis(250));
                    continue;
                }

                let fg = unsafe { GetForegroundWindow() };
                let fg_raw = fg.0 as isize;

                if fg_raw != cached_fg_hwnd {
                    cached_fg_hwnd = fg_raw;
                    cached_surface = foreground_surface_for(fg);
                    if let Some(kind) = cached_surface {
                        LAST_SEEN_KIND.store(kind as u8, Ordering::SeqCst);
                        LAST_SEEN_MS.store(now_ms(), Ordering::SeqCst);
                    }
                } else if let Some(kind) = cached_surface {
                    if unsafe { IsWindowVisible(fg).as_bool() } {
                        let effective = if kind == Surface::ShellFlyout {
                            let last_opened = LAST_OPENED_KIND.load(Ordering::SeqCst);
                            if last_opened == Surface::QuickSettings as u8 {
                                Surface::QuickSettings
                            } else if last_opened == Surface::Notifications as u8 {
                                Surface::Notifications
                            } else {
                                kind
                            }
                        } else {
                            kind
                        };
                        LAST_SEEN_KIND.store(effective as u8, Ordering::SeqCst);
                        LAST_SEEN_MS.store(now_ms(), Ordering::SeqCst);
                    } else {
                        cached_fg_hwnd = 0;
                        cached_surface = None;
                    }
                }

                let sleep_ms = if cached_surface.is_some() { 25 } else { 45 };
                std::thread::sleep(Duration::from_millis(sleep_ms));
            }
        });
    });
}

pub fn record_surface_opened(kind: Surface) {
    LAST_OPENED_KIND.store(kind as u8, Ordering::SeqCst);
    LAST_OPENED_MS.store(now_ms(), Ordering::SeqCst);
}

/// Returns true if clicking the button just now should CLOSE the surface (or already closed it
/// via light-dismiss focus loss on pointerdown) rather than re-opening it.
pub fn was_just_open(kind: Surface) -> bool {
    ensure_watcher();

    // Case 1: Surface is STILL the foreground window right now (because navbar has WS_EX_NOACTIVATE)
    if let Some(fg_kind) = foreground_surface() {
        if is_matching_surface(fg_kind as u8, kind) {
            LAST_SEEN_MS.store(0, Ordering::SeqCst);
            LAST_OPENED_KIND.store(0, Ordering::SeqCst);
            LAST_OPENED_MS.store(0, Ordering::SeqCst);
            unsafe {
                keybd_event(VK_ESCAPE.0 as u8, 0, Default::default(), 0);
                keybd_event(VK_ESCAPE.0 as u8, 0, KEYEVENTF_KEYUP, 0);
            }
            return true;
        }
    }

    // Case 2: Surface was open <950ms ago and auto-dismissed on mouse-down focus change
    let seen_ms = LAST_SEEN_MS.load(Ordering::SeqCst);
    let seen_kind = LAST_SEEN_KIND.load(Ordering::SeqCst);
    if seen_ms != 0
        && is_matching_surface(seen_kind, kind)
        && now_ms().saturating_sub(seen_ms) < RECENT_DISMISS_WINDOW_MS
    {
        LAST_SEEN_MS.store(0, Ordering::SeqCst);
        LAST_OPENED_KIND.store(0, Ordering::SeqCst);
        LAST_OPENED_MS.store(0, Ordering::SeqCst);
        unsafe {
            keybd_event(VK_ESCAPE.0 as u8, 0, Default::default(), 0);
            keybd_event(VK_ESCAPE.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        }
        return true;
    }

    // Case 3: Surface was triggered open by this exact button recently (within 8 seconds),
    // and the user is clicking the same button again to close it.
    let last_opened_kind = LAST_OPENED_KIND.load(Ordering::SeqCst);
    let last_opened_ms = LAST_OPENED_MS.load(Ordering::SeqCst);
    if last_opened_kind == kind as u8 {
        let elapsed = now_ms().saturating_sub(last_opened_ms);
        if elapsed >= 180 && elapsed < 8000 {
            LAST_SEEN_MS.store(0, Ordering::SeqCst);
            LAST_OPENED_KIND.store(0, Ordering::SeqCst);
            LAST_OPENED_MS.store(0, Ordering::SeqCst);
            unsafe {
                keybd_event(VK_ESCAPE.0 as u8, 0, Default::default(), 0);
                keybd_event(VK_ESCAPE.0 as u8, 0, KEYEVENTF_KEYUP, 0);
            }
            return true;
        }
    }

    false
}
