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
static WATCHER: Once = Once::new();

fn now_ms() -> u64 {
    EPOCH.get_or_init(Instant::now).elapsed().as_millis() as u64 + 1
}

fn classify_foreground_surface(
    path_lower: &str,
    class_name: &str,
    title_lower: &str,
    last_opened: u8,
) -> Option<Surface> {
    if path_lower.ends_with("startmenuexperiencehost.exe") {
        return Some(Surface::Start);
    }
    if path_lower.ends_with("searchhost.exe") || path_lower.ends_with("searchapp.exe") {
        return Some(Surface::Search);
    }
    if path_lower.ends_with("shellexperiencehost.exe") {
        if title_lower.contains("quick")
            || title_lower.contains("cepat")
            || title_lower.contains("control")
            || class_name == "ControlCenterWindow"
        {
            return Some(Surface::QuickSettings);
        }
        if title_lower.contains("notif")
            || title_lower.contains("calendar")
            || title_lower.contains("kalender")
        {
            return Some(Surface::Notifications);
        }
        if last_opened == Surface::QuickSettings as u8 {
            return Some(Surface::QuickSettings);
        }
        if last_opened == Surface::Notifications as u8 {
            return Some(Surface::Notifications);
        }
        return Some(Surface::ShellFlyout);
    }

    if path_lower.ends_with("explorer.exe")
        && matches!(
            class_name,
            "ControlCenterWindow"
                | "XamlExplorerHostIslandWindow"
                | "TopLevelWindowForOverflowXamlIsland"
                | "Windows.UI.Core.CoreWindow"
        )
    {
        if class_name == "ControlCenterWindow" {
            return Some(Surface::QuickSettings);
        }
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

        classify_foreground_surface(
            &path,
            &class_name,
            &title,
            LAST_OPENED_KIND.load(Ordering::SeqCst),
        )
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
}

fn dismiss_surface_state() {
    LAST_SEEN_MS.store(0, Ordering::SeqCst);
    LAST_OPENED_KIND.store(0, Ordering::SeqCst);
    unsafe {
        keybd_event(VK_ESCAPE.0 as u8, 0, Default::default(), 0);
        keybd_event(VK_ESCAPE.0 as u8, 0, KEYEVENTF_KEYUP, 0);
    }
}

/// Returns true if clicking the button just now should CLOSE the surface (or already closed it
/// via light-dismiss focus loss on pointerdown) rather than re-opening it.
pub fn was_just_open(kind: Surface) -> bool {
    ensure_watcher();

    // Case 1: Surface is STILL the foreground window right now (because navbar has WS_EX_NOACTIVATE)
    if let Some(fg_kind) = foreground_surface() {
        if is_matching_surface(fg_kind as u8, kind) {
            dismiss_surface_state();
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
        dismiss_surface_state();
        return true;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    struct LastOpenedGuard(u8);
    impl Drop for LastOpenedGuard {
        fn drop(&mut self) {
            LAST_OPENED_KIND.store(self.0, Ordering::SeqCst);
        }
    }

    #[test]
    fn test_is_matching_surface_across_surfaces_and_focus_delegation() {
        let _lock = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let _restore = LastOpenedGuard(LAST_OPENED_KIND.load(Ordering::SeqCst));

        LAST_OPENED_KIND.store(0, Ordering::SeqCst);
        assert!(is_matching_surface(Surface::Start as u8, Surface::Start));
        assert!(is_matching_surface(Surface::Search as u8, Surface::Search));
        assert!(is_matching_surface(
            Surface::QuickSettings as u8,
            Surface::QuickSettings
        ));
        assert!(is_matching_surface(
            Surface::Notifications as u8,
            Surface::Notifications
        ));
        assert!(is_matching_surface(
            Surface::ShellFlyout as u8,
            Surface::ShellFlyout
        ));
        assert!(!is_matching_surface(0, Surface::Start));
        assert!(!is_matching_surface(Surface::Search as u8, Surface::Start));
        assert!(!is_matching_surface(
            Surface::Start as u8,
            Surface::ShellFlyout
        ));
        assert!(!is_matching_surface(
            Surface::QuickSettings as u8,
            Surface::ShellFlyout
        ));
        assert!(!is_matching_surface(
            Surface::Notifications as u8,
            Surface::ShellFlyout
        ));

        // Start Menu SearchHost.exe focus delegation only matches when Start was opened last.
        record_surface_opened(Surface::Start);
        assert!(is_matching_surface(Surface::Search as u8, Surface::Start));
        assert!(!is_matching_surface(
            Surface::QuickSettings as u8,
            Surface::Start
        ));

        record_surface_opened(Surface::Search);
        assert!(!is_matching_surface(Surface::Search as u8, Surface::Start));

        // QuickSettings and Notifications share ShellFlyout and disambiguate via LAST_OPENED_KIND.
        LAST_OPENED_KIND.store(0, Ordering::SeqCst);
        assert!(is_matching_surface(
            Surface::ShellFlyout as u8,
            Surface::QuickSettings
        ));
        assert!(is_matching_surface(
            Surface::ShellFlyout as u8,
            Surface::Notifications
        ));
        assert!(!is_matching_surface(
            Surface::Notifications as u8,
            Surface::QuickSettings
        ));
        assert!(!is_matching_surface(
            Surface::QuickSettings as u8,
            Surface::Notifications
        ));

        record_surface_opened(Surface::QuickSettings);
        assert!(is_matching_surface(
            Surface::Notifications as u8,
            Surface::QuickSettings
        ));
        assert!(!is_matching_surface(
            Surface::QuickSettings as u8,
            Surface::Notifications
        ));

        record_surface_opened(Surface::Notifications);
        assert!(is_matching_surface(
            Surface::QuickSettings as u8,
            Surface::Notifications
        ));
        assert!(!is_matching_surface(
            Surface::Notifications as u8,
            Surface::QuickSettings
        ));
    }

    #[test]
    fn test_classify_foreground_surface_variants() {
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\systemapps\microsoft.windows.startmenuexperiencehost_cw5n1h2txyewy\startmenuexperiencehost.exe",
                "Windows.UI.Core.CoreWindow",
                "start",
                0,
            ),
            Some(Surface::Start)
        );
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\systemapps\microsoftwindows.client.cbs_cw5n1h2txyewy\searchhost.exe",
                "Windows.UI.Core.CoreWindow",
                "search",
                0,
            ),
            Some(Surface::Search)
        );
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\systemapps\microsoft.windows.search_cw5n1h2txyewy\searchapp.exe",
                "Windows.UI.Core.CoreWindow",
                "",
                0,
            ),
            Some(Surface::Search)
        );

        // ShellExperienceHost classifies by title/class first, then falls back to last_opened
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\systemapps\shellexperiencehost_cw5n1h2txyewy\shellexperiencehost.exe",
                "Windows.UI.Core.CoreWindow",
                "quick settings",
                0,
            ),
            Some(Surface::QuickSettings)
        );
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\systemapps\shellexperiencehost_cw5n1h2txyewy\shellexperiencehost.exe",
                "Windows.UI.Core.CoreWindow",
                "pengaturan cepat",
                0,
            ),
            Some(Surface::QuickSettings)
        );
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\systemapps\shellexperiencehost_cw5n1h2txyewy\shellexperiencehost.exe",
                "ControlCenterWindow",
                "",
                0,
            ),
            Some(Surface::QuickSettings)
        );
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\systemapps\shellexperiencehost_cw5n1h2txyewy\shellexperiencehost.exe",
                "Windows.UI.Core.CoreWindow",
                "notification center",
                0,
            ),
            Some(Surface::Notifications)
        );
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\systemapps\shellexperiencehost_cw5n1h2txyewy\shellexperiencehost.exe",
                "Windows.UI.Core.CoreWindow",
                "kalender",
                0,
            ),
            Some(Surface::Notifications)
        );
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\systemapps\shellexperiencehost_cw5n1h2txyewy\shellexperiencehost.exe",
                "Windows.UI.Core.CoreWindow",
                "",
                Surface::QuickSettings as u8,
            ),
            Some(Surface::QuickSettings)
        );
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\systemapps\shellexperiencehost_cw5n1h2txyewy\shellexperiencehost.exe",
                "Windows.UI.Core.CoreWindow",
                "",
                Surface::Notifications as u8,
            ),
            Some(Surface::Notifications)
        );
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\systemapps\shellexperiencehost_cw5n1h2txyewy\shellexperiencehost.exe",
                "Windows.UI.Core.CoreWindow",
                "",
                0,
            ),
            Some(Surface::ShellFlyout)
        );

        // explorer.exe only matches known XAML/CoreWindow flyout host classes, never File Explorer windows
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\explorer.exe",
                "ControlCenterWindow",
                "",
                0,
            ),
            Some(Surface::QuickSettings)
        );
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\explorer.exe",
                "XamlExplorerHostIslandWindow",
                "",
                Surface::Notifications as u8,
            ),
            Some(Surface::Notifications)
        );
        assert_eq!(
            classify_foreground_surface(
                r"c:\windows\explorer.exe",
                "TopLevelWindowForOverflowXamlIsland",
                "",
                0,
            ),
            Some(Surface::ShellFlyout)
        );
        assert_eq!(
            classify_foreground_surface(r"c:\windows\explorer.exe", "CabinetWClass", "downloads", 0),
            None
        );
        assert_eq!(
            classify_foreground_surface(r"c:\windows\system32\notepad.exe", "Notepad", "untitled", 0),
            None
        );
    }
}
