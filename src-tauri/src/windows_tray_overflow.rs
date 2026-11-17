use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::{AppHandle, WebviewWindow};
use windows::core::{w, GUID, PCWSTR};
use windows::Win32::Foundation::{COLORREF, HWND, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_CLOAK};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromPoint, SetWindowRgn, HRGN, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoTaskMemFree, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationInvokePattern,
    IUIAutomationLegacyIAccessiblePattern, TreeScope_Descendants, UIA_ButtonControlTypeId,
    UIA_ControlTypePropertyId, UIA_InvokePatternId, UIA_LegacyIAccessiblePatternId,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY,
    KEYEVENTF_KEYUP, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_RIGHTDOWN,
    MOUSEEVENTF_RIGHTUP, MOUSEINPUT, MOUSE_EVENT_FLAGS, VK_ESCAPE, VK_LWIN, VK_RETURN,
};
use windows::Win32::UI::Shell::{SHGetKnownFolderPath, ShellExecuteW, KF_FLAG_DEFAULT};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, FindWindowW, GetClassNameW, GetCursorPos, GetForegroundWindow,
    GetWindowLongW, GetWindowRect, GetWindowThreadProcessId, IsChild, IsWindow, IsWindowVisible,
    SetCursorPos, SetForegroundWindow, SetLayeredWindowAttributes, SetWindowLongW, SetWindowPos,
    ShowWindow, GWL_EXSTYLE, HWND_TOPMOST, LWA_ALPHA, SWP_NOACTIVATE, SWP_NOSIZE, SWP_SHOWWINDOW,
    SW_HIDE, SW_SHOW, WS_EX_TRANSPARENT,
};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

use crate::shell_surface_toggle::Surface;
use crate::window_dock_anim::DockAnchorRect;

static OVERFLOW_SESSION_GEN: AtomicU64 = AtomicU64::new(0);
static KNOWN_FOLDER_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScreenAnchorRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

#[derive(Debug, Clone)]
pub struct NotifyIconRegistryEntry {
    pub subkey: String,
    pub exe_path: String,
    pub exe_name: String,
    pub tooltip: String,
    pub is_promoted: bool,
}

#[derive(Debug, Clone)]
pub struct NativeTrayUiaItem {
    pub item_id: String,
    pub name: String,
    pub automation_id: String,
    pub source: String,
}

pub fn resolve_screen_anchor_from_window(
    win: &WebviewWindow,
    anchor: &DockAnchorRect,
) -> Option<(ScreenAnchorRect, f64)> {
    let outer_pos = win.outer_position().ok()?;
    let sf = win.scale_factor().ok().unwrap_or(1.0).max(1.0);
    let left = outer_pos.x + (anchor.x * sf).round() as i32;
    let top = outer_pos.y + (anchor.y * sf).round() as i32;
    let w = (anchor.width * sf).round().max(12.0) as i32;
    let h = (anchor.height * sf).round().max(12.0) as i32;
    Some((
        ScreenAnchorRect {
            left,
            top,
            right: left + w,
            bottom: top + h,
        },
        sf,
    ))
}

pub fn calculate_tray_overflow_position(
    ov_w: i32,
    ov_h: i32,
    anchor: Option<ScreenAnchorRect>,
    position: &str,
    work_rect: (i32, i32, i32, i32),
    margin: i32,
) -> (i32, i32) {
    let (work_left, work_top, work_right, work_bottom) = work_rect;
    let safe_w = ov_w.max(40);
    let safe_h = ov_h.max(40);
    let safe_margin = margin.max(0);

    let (raw_x, raw_y) = if let Some(a) = anchor {
        let anchor_cx = (a.left + a.right) / 2;
        let anchor_cy = (a.top + a.bottom) / 2;
        match position {
            "top" => (anchor_cx - safe_w / 2, a.bottom + safe_margin),
            "left" => (a.right + safe_margin, anchor_cy - safe_h / 2),
            "right" => (a.left - safe_w - safe_margin, anchor_cy - safe_h / 2),
            _ => (anchor_cx - safe_w / 2, a.top - safe_h - safe_margin),
        }
    } else {
        match position {
            "top" => (work_right - safe_w - safe_margin, work_top + safe_margin),
            "left" => (work_left + safe_margin, work_bottom - safe_h - safe_margin),
            "right" => (work_right - safe_w - safe_margin, work_bottom - safe_h - safe_margin),
            _ => (work_right - safe_w - safe_margin, work_bottom - safe_h - safe_margin),
        }
    };

    let min_x = work_left + safe_margin;
    let max_x = (work_right - safe_w - safe_margin).max(min_x);
    let min_y = work_top + safe_margin;
    let max_y = (work_bottom - safe_h - safe_margin).max(min_y);

    (raw_x.clamp(min_x, max_x), raw_y.clamp(min_y, max_y))
}

pub fn parse_braced_guid(s: &str) -> Option<GUID> {
    let trimmed = s.trim();
    if trimmed.len() != 38 || !trimmed.starts_with('{') || !trimmed.ends_with('}') {
        return None;
    }
    let inner = &trimmed[1..37];
    let parts: Vec<&str> = inner.split('-').collect();
    if parts.len() != 5
        || parts[0].len() != 8
        || parts[1].len() != 4
        || parts[2].len() != 4
        || parts[3].len() != 4
        || parts[4].len() != 12
    {
        return None;
    }
    let data1 = u32::from_str_radix(parts[0], 16).ok()?;
    let data2 = u16::from_str_radix(parts[1], 16).ok()?;
    let data3 = u16::from_str_radix(parts[2], 16).ok()?;
    let p3 = u16::from_str_radix(parts[3], 16).ok()?;
    let p4 = u64::from_str_radix(parts[4], 16).ok()?;
    let data4 = [
        (p3 >> 8) as u8,
        (p3 & 0xFF) as u8,
        ((p4 >> 40) & 0xFF) as u8,
        ((p4 >> 32) & 0xFF) as u8,
        ((p4 >> 24) & 0xFF) as u8,
        ((p4 >> 16) & 0xFF) as u8,
        ((p4 >> 8) & 0xFF) as u8,
        (p4 & 0xFF) as u8,
    ];
    Some(GUID::from_values(data1, data2, data3, data4))
}

pub fn is_chevron_button(class_name: &str, automation_id: &str, name: &str) -> bool {
    let cls = class_name.to_lowercase();
    let aid = automation_id.to_lowercase();
    let nm = name.trim().to_lowercase();

    if cls.contains("chevroniconview") || cls.contains("chevron") {
        return true;
    }
    if aid.contains("chevron") || aid.contains("overflow") {
        return true;
    }
    if nm == "show hidden icons"
        || nm == "tampilkan ikon tersembunyi"
        || nm == "notification chevron"
        || nm.contains("hidden icons")
        || nm.contains("ikon tersembunyi")
    {
        return true;
    }
    cls == "button" && aid == "1502"
}

pub fn is_builtin_shell_tray_button(class_name: &str, automation_id: &str, name: &str) -> bool {
    if is_chevron_button(class_name, automation_id, name) {
        return true;
    }
    let cls = class_name.to_lowercase();
    let aid = automation_id.to_lowercase();
    let nm = name.trim().to_lowercase();

    if nm.is_empty() {
        return true;
    }
    if matches!(
        aid.as_str(),
        "startbutton"
            | "searchbutton"
            | "taskviewbutton"
            | "widgetsbutton"
            | "copilotbutton"
            | "controlcenterbutton"
            | "notificationcenterbutton"
            | "clockbutton"
            | "showdesktopbutton"
            | "penworkspacebutton"
            | "touchkeyboardbutton"
            | "virtualtouchpadbutton"
            | "inputindicator"
    ) {
        return true;
    }
    if cls.contains("omnibutton")
        || cls.contains("datetimeiconcontent")
        || cls.contains("experienceToggleButton".to_lowercase().as_str())
        || cls.contains("taskbar.")
    {
        return true;
    }
    false
}

fn resolve_known_folder_path(raw: &str) -> String {
    let trimmed = raw.trim();
    if !trimmed.starts_with('{') || trimmed.len() < 38 {
        return trimmed.to_string();
    }
    let guid_str = &trimmed[..38];
    let rest = trimmed[38..].trim_start_matches('\\');

    let cache = KNOWN_FOLDER_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(guard) = cache.lock() {
        if let Some(base) = guard.get(guid_str) {
            return if rest.is_empty() {
                base.clone()
            } else {
                Path::new(base).join(rest).to_string_lossy().to_string()
            };
        }
    }

    let Some(guid) = parse_braced_guid(guid_str) else {
        return trimmed.to_string();
    };
    let resolved_base = unsafe {
        SHGetKnownFolderPath(&guid, KF_FLAG_DEFAULT, None)
            .ok()
            .and_then(|pwstr| {
                let s = pwstr.to_string().ok();
                CoTaskMemFree(Some(pwstr.0 as *const std::ffi::c_void));
                s
            })
    };

    if let Some(base) = resolved_base {
        if let Ok(mut guard) = cache.lock() {
            guard.insert(guid_str.to_string(), base.clone());
        }
        if rest.is_empty() {
            base
        } else {
            Path::new(&base).join(rest).to_string_lossy().to_string()
        }
    } else {
        trimmed.to_string()
    }
}

pub fn read_notify_icon_settings() -> Vec<NotifyIconRegistryEntry> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(root) = hkcu.open_subkey("Control Panel\\NotifyIconSettings") else {
        return Vec::new();
    };

    let mut entries = Vec::new();
    for subkey in root.enum_keys().flatten() {
        let Ok(sub) = root.open_subkey(&subkey) else {
            continue;
        };
        let raw_exe: String = sub.get_value("ExecutablePath").unwrap_or_default();
        if raw_exe.trim().is_empty() {
            continue;
        }
        let exe_path = resolve_known_folder_path(&raw_exe);
        let Some(exe_name) = Path::new(&exe_path)
            .file_name()
            .and_then(|s| s.to_str())
            .map(str::to_string)
        else {
            continue;
        };
        let tooltip: String = sub.get_value("InitialTooltip").unwrap_or_default();
        let promoted_val: u32 = sub.get_value("IsPromoted").unwrap_or(0);
        entries.push(NotifyIconRegistryEntry {
            subkey,
            exe_path,
            exe_name,
            tooltip: tooltip.replace('\r', "").replace('\n', " ").trim().to_string(),
            is_promoted: promoted_val != 0,
        });
    }
    entries
}

unsafe fn find_overflow_hwnd() -> Option<HWND> {
    if let Ok(hwnd) = FindWindowW(w!("TopLevelWindowForOverflowXamlIsland"), None) {
        if !hwnd.0.is_null() && IsWindow(hwnd).as_bool() {
            return Some(hwnd);
        }
    }
    if let Ok(hwnd) = FindWindowW(w!("NotifyIconOverflowWindow"), None) {
        if !hwnd.0.is_null() && IsWindow(hwnd).as_bool() {
            return Some(hwnd);
        }
    }
    None
}

unsafe fn find_visible_overflow_hwnd() -> Option<HWND> {
    if let Ok(hwnd) = FindWindowW(w!("TopLevelWindowForOverflowXamlIsland"), None) {
        if !hwnd.0.is_null() && IsWindow(hwnd).as_bool() && IsWindowVisible(hwnd).as_bool() {
            return Some(hwnd);
        }
    }
    if let Ok(hwnd) = FindWindowW(w!("NotifyIconOverflowWindow"), None) {
        if !hwnd.0.is_null() && IsWindow(hwnd).as_bool() && IsWindowVisible(hwnd).as_bool() {
            return Some(hwnd);
        }
    }
    None
}

unsafe fn window_class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 128];
    let len = GetClassNameW(hwnd, &mut buf);
    if len <= 0 {
        String::new()
    } else {
        String::from_utf16_lossy(&buf[..len as usize])
    }
}

unsafe fn is_context_menu_open() -> bool {
    if let Ok(menu) = FindWindowW(w!("#32768"), None) {
        if !menu.0.is_null() && IsWindowVisible(menu).as_bool() {
            return true;
        }
    }
    if let Ok(popup) = FindWindowW(w!("Xaml_WindowedPopupClass"), None) {
        if !popup.0.is_null() && IsWindowVisible(popup).as_bool() {
            return true;
        }
    }
    let fg = GetForegroundWindow();
    if !fg.0.is_null() && IsWindowVisible(fg).as_bool() {
        let cls = window_class_name(fg);
        if cls == "#32768" || cls == "Xaml_WindowedPopupClass" {
            return true;
        }
    }
    false
}

unsafe fn dismiss_overflow_hwnd(hwnd: HWND) {
    if hwnd.0.is_null() || !IsWindow(hwnd).as_bool() {
        return;
    }
    if !is_context_menu_open() && GetForegroundWindow() == hwnd {
        send_key_tap(VK_ESCAPE.0, false);
        std::thread::sleep(Duration::from_millis(20));
    }
    if IsWindowVisible(hwnd).as_bool() {
        let _ = ShowWindow(hwnd, SW_HIDE);
    }
}

unsafe fn send_key_tap(vk: u16, extended: bool) {
    let down_flags = if extended {
        KEYEVENTF_EXTENDEDKEY
    } else {
        Default::default()
    };
    let up_flags = if extended {
        KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP
    } else {
        KEYEVENTF_KEYUP
    };
    let inputs = [
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(vk),
                    dwFlags: down_flags,
                    ..Default::default()
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(vk),
                    dwFlags: up_flags,
                    ..Default::default()
                },
            },
        },
    ];
    let _ = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
}

unsafe fn send_win_b_then_enter(shell_tray: HWND) {
    let inputs = [
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK_LWIN,
                    dwFlags: KEYEVENTF_EXTENDEDKEY,
                    ..Default::default()
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(b'B' as u16),
                    ..Default::default()
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(b'B' as u16),
                    dwFlags: KEYEVENTF_KEYUP,
                    ..Default::default()
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK_LWIN,
                    dwFlags: KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
                    ..Default::default()
                },
            },
        },
    ];
    let _ = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    std::thread::sleep(Duration::from_millis(25));
    let fg = GetForegroundWindow();
    if !shell_tray.0.is_null()
        && !fg.0.is_null()
        && (fg == shell_tray || IsChild(shell_tray, fg).as_bool())
    {
        send_key_tap(VK_RETURN.0, false);
    }
}

unsafe fn uia_element_props(el: &IUIAutomationElement) -> (String, String, String) {
    let cls = el
        .CurrentClassName()
        .map(|b| b.to_string())
        .unwrap_or_default();
    let aid = el
        .CurrentAutomationId()
        .map(|b| b.to_string())
        .unwrap_or_default();
    let name = el.CurrentName().map(|b| b.to_string()).unwrap_or_default();
    (cls, aid, name)
}

unsafe fn find_buttons_under_hwnd(uia: &IUIAutomation, hwnd: HWND) -> Vec<IUIAutomationElement> {
    let Ok(root) = uia.ElementFromHandle(hwnd) else {
        return Vec::new();
    };
    let val = windows_core::VARIANT::from(UIA_ButtonControlTypeId.0);
    let Ok(cond) = uia.CreatePropertyCondition(UIA_ControlTypePropertyId, &val) else {
        return Vec::new();
    };
    let Ok(arr) = root.FindAll(TreeScope_Descendants, &cond) else {
        return Vec::new();
    };
    let Ok(len) = arr.Length() else {
        return Vec::new();
    };
    let mut out = Vec::with_capacity(len.max(0) as usize);
    for i in 0..len {
        if let Ok(el) = arr.GetElement(i) {
            out.push(el);
        }
    }
    out
}

unsafe fn invoke_uia_element(el: &IUIAutomationElement) -> bool {
    if let Ok(inv) = el.GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId) {
        if inv.Invoke().is_ok() {
            return true;
        }
    }
    if let Ok(legacy) =
        el.GetCurrentPatternAs::<IUIAutomationLegacyIAccessiblePattern>(UIA_LegacyIAccessiblePatternId)
    {
        if legacy.DoDefaultAction().is_ok() {
            return true;
        }
    }
    false
}

unsafe fn try_invoke_chevron_via_uia(uia: &IUIAutomation, shell_tray: HWND) -> bool {
    for el in find_buttons_under_hwnd(uia, shell_tray) {
        let (cls, aid, name) = uia_element_props(&el);
        if is_chevron_button(&cls, &aid, &name) && invoke_uia_element(&el) {
            return true;
        }
    }
    false
}

unsafe fn bring_to_foreground_force(hwnd: HWND) {
    let fg = GetForegroundWindow();
    let fg_tid = if !fg.0.is_null() {
        GetWindowThreadProcessId(fg, None)
    } else {
        0
    };
    let cur_tid = GetCurrentThreadId();
    let attached = if fg_tid != 0 && fg_tid != cur_tid {
        AttachThreadInput(cur_tid, fg_tid, true).as_bool()
    } else {
        false
    };
    let _ = BringWindowToTop(hwnd);
    let _ = SetForegroundWindow(hwnd);
    if attached {
        let _ = AttachThreadInput(cur_tid, fg_tid, false);
    }
}

unsafe fn resolve_work_rect_for_anchor(anchor: Option<ScreenAnchorRect>) -> (i32, i32, i32, i32) {
    let pt = if let Some(a) = anchor {
        POINT {
            x: (a.left + a.right) / 2,
            y: (a.top + a.bottom) / 2,
        }
    } else {
        let mut cursor = POINT::default();
        let _ = GetCursorPos(&mut cursor);
        cursor
    };
    let hmon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
    let mut mi = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if GetMonitorInfoW(hmon, &mut mi).as_bool() {
        let r = mi.rcWork;
        if r.right > r.left && r.bottom > r.top {
            return (r.left, r.top, r.right, r.bottom);
        }
        let m = mi.rcMonitor;
        return (m.left, m.top, m.right, m.bottom);
    }
    (0, 0, 1920, 1080)
}

unsafe fn summon_overflow_window(uia: Option<&IUIAutomation>, shell_tray: HWND) -> Option<HWND> {
    let mut found = None;
    let mut uia_invoked = false;
    if let Some(u) = uia {
        if !shell_tray.0.is_null() {
            uia_invoked = try_invoke_chevron_via_uia(u, shell_tray);
        }
    }

    if uia_invoked {
        for _ in 0..16 {
            if let Some(ov) = find_visible_overflow_hwnd() {
                found = Some(ov);
                break;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    if found.is_none() {
        send_win_b_then_enter(shell_tray);
        for _ in 0..54 {
            if let Some(ov) = find_visible_overflow_hwnd() {
                found = Some(ov);
                break;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    crate::taskbar_manager::finish_shell_tray_summon();
    found
}

unsafe fn uncloak_and_show_overflow(ov: HWND) {
    let uncloak: u32 = 0;
    let _ = DwmSetWindowAttribute(
        ov,
        DWMWA_CLOAK,
        &uncloak as *const u32 as *const std::ffi::c_void,
        std::mem::size_of::<u32>() as u32,
    );
    let _ = ShowWindow(ov, SW_SHOW);
}

unsafe fn wait_for_overflow_layout(ov: HWND) -> RECT {
    let mut rc = RECT::default();
    for _ in 0..16 {
        if GetWindowRect(ov, &mut rc).is_ok()
            && (rc.right - rc.left) >= 24
            && (rc.bottom - rc.top) >= 24
        {
            return rc;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    let _ = GetWindowRect(ov, &mut rc);
    rc
}

unsafe fn watch_overflow_and_menus(ov: HWND, my_gen: u64) {
    // Wait while the overflow window stays visible
    while OVERFLOW_SESSION_GEN.load(Ordering::Acquire) == my_gen
        && IsWindow(ov).as_bool()
        && IsWindowVisible(ov).as_bool()
    {
        std::thread::sleep(Duration::from_millis(40));
    }

    if OVERFLOW_SESSION_GEN.load(Ordering::Acquire) != my_gen {
        return;
    }

    // Brief grace window so a right-click context menu (#32768 / Xaml popup) has time to map
    std::thread::sleep(Duration::from_millis(80));
    let menu_deadline = Instant::now() + Duration::from_secs(20);
    while OVERFLOW_SESSION_GEN.load(Ordering::Acquire) == my_gen
        && Instant::now() < menu_deadline
        && is_context_menu_open()
    {
        std::thread::sleep(Duration::from_millis(60));
    }
}

pub fn toggle_native_system_tray_overflow(
    anchor: Option<ScreenAnchorRect>,
    scale_factor: f64,
    position: Option<String>,
) {
    let visible_now = unsafe { find_visible_overflow_hwnd() };
    if visible_now.is_some() || crate::shell_surface_toggle::was_just_open(Surface::ShellFlyout) {
        OVERFLOW_SESSION_GEN.fetch_add(1, Ordering::SeqCst);
        if let Some(ov) = visible_now {
            unsafe { dismiss_overflow_hwnd(ov) };
        }
        crate::taskbar_manager::restore_shell_tray_hidden_now();
        return;
    }

    let my_gen = OVERFLOW_SESSION_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let pos_str = position.unwrap_or_else(|| "bottom".to_string());
    let sf = scale_factor.max(1.0);

    let _ = std::thread::Builder::new()
        .name("gili_tray_overflow".into())
        .spawn(move || {
            let _com = crate::ComGuard::init(COINIT_APARTMENTTHREADED);
            crate::shell_surface_toggle::record_surface_opened(Surface::ShellFlyout);

            let was_hidden = crate::taskbar_manager::get_windows_taskbar_hidden();
            let _lease = if was_hidden {
                Some(crate::taskbar_manager::acquire_tray_overflow_lease())
            } else {
                None
            };

            unsafe {
                let shell_tray = FindWindowW(w!("Shell_TrayWnd"), None).unwrap_or_default();
                if was_hidden && !shell_tray.0.is_null() {
                    crate::taskbar_manager::prepare_shell_tray_for_overflow_hwnd(shell_tray);
                }

                let uia: Option<IUIAutomation> =
                    CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok();
                let Some(ov) = summon_overflow_window(uia.as_ref(), shell_tray) else {
                    return;
                };
                if OVERFLOW_SESSION_GEN.load(Ordering::Acquire) != my_gen {
                    return;
                }

                uncloak_and_show_overflow(ov);
                let ov_rc = wait_for_overflow_layout(ov);
                let ov_w = (ov_rc.right - ov_rc.left).max(40);
                let ov_h = (ov_rc.bottom - ov_rc.top).max(40);
                let work_rect = resolve_work_rect_for_anchor(anchor);
                let margin = (10.0 * sf).round() as i32;
                let (x, y) = calculate_tray_overflow_position(
                    ov_w, ov_h, anchor, &pos_str, work_rect, margin,
                );

                let _ = SetWindowPos(
                    ov,
                    HWND_TOPMOST,
                    x,
                    y,
                    0,
                    0,
                    SWP_NOSIZE | SWP_SHOWWINDOW,
                );
                bring_to_foreground_force(ov);
                crate::shell_surface_toggle::record_surface_opened(Surface::ShellFlyout);

                // Guard against Explorer snapping the overflow back to the hidden taskbar edge
                for _ in 0..15 {
                    std::thread::sleep(Duration::from_millis(15));
                    if OVERFLOW_SESSION_GEN.load(Ordering::Acquire) != my_gen
                        || !IsWindowVisible(ov).as_bool()
                    {
                        break;
                    }
                    let mut cur_rc = RECT::default();
                    if GetWindowRect(ov, &mut cur_rc).is_ok() {
                        let cw = (cur_rc.right - cur_rc.left).max(40);
                        let ch = (cur_rc.bottom - cur_rc.top).max(40);
                        let (nx, ny) = calculate_tray_overflow_position(
                            cw, ch, anchor, &pos_str, work_rect, margin,
                        );
                        if (cur_rc.left - nx).abs() > 2 || (cur_rc.top - ny).abs() > 2 {
                            let _ = SetWindowPos(
                                ov,
                                HWND_TOPMOST,
                                nx,
                                ny,
                                0,
                                0,
                                SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                            );
                        }
                    }
                }

                watch_overflow_and_menus(ov, my_gen);
            }
        });
}

pub fn snapshot_live_tray_uia_items() -> Vec<NativeTrayUiaItem> {
    let _com = crate::ComGuard::init(COINIT_APARTMENTTHREADED);
    let mut items = Vec::new();
    let mut seen = HashSet::new();

    unsafe {
        let Ok(uia) = CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
        else {
            return items;
        };

        if let Ok(shell_tray) = FindWindowW(w!("Shell_TrayWnd"), None) {
            if !shell_tray.0.is_null() {
                for el in find_buttons_under_hwnd(&uia, shell_tray) {
                    let (cls, aid, name) = uia_element_props(&el);
                    let trimmed = name.trim().to_string();
                    if is_builtin_shell_tray_button(&cls, &aid, &trimmed) {
                        continue;
                    }
                    let item_id = format!("uia:taskbar:{}:{}", aid, trimmed);
                    if seen.insert(item_id.clone()) {
                        items.push(NativeTrayUiaItem {
                            item_id,
                            name: trimmed,
                            automation_id: aid,
                            source: "taskbar".to_string(),
                        });
                    }
                }
            }
        }

        if let Some(ov) = find_overflow_hwnd() {
            for el in find_buttons_under_hwnd(&uia, ov) {
                let (_cls, aid, name) = uia_element_props(&el);
                let trimmed = name.trim().to_string();
                if trimmed.is_empty() {
                    continue;
                }
                let item_id = format!("uia:overflow:{}:{}", aid, trimmed);
                if seen.insert(item_id.clone()) {
                    items.push(NativeTrayUiaItem {
                        item_id,
                        name: trimmed,
                        automation_id: aid,
                        source: "overflow".to_string(),
                    });
                }
            }
        }
    }
    items
}

const TRAY_ALIAS_PAIRS: &[(&str, &str)] = &[
    ("nvdisplay", "nvidia"),
    ("nvcontainer", "nvidia"),
    ("nvidia", "geforce"),
    ("securityhealthsystray", "security"),
    ("securityhealthsystray", "defender"),
    ("securityhealthsystray", "keamanan"),
    ("obs64", "obs"),
    ("onenotem", "onenote"),
    ("vgtray", "vanguard"),
    ("lghub", "logitech"),
    ("rtkauduservice", "realtek"),
    ("ms-teams", "teams"),
];

pub(crate) fn matches_tray_alias(a_low: &str, b_low: &str) -> bool {
    TRAY_ALIAS_PAIRS.iter().any(|(a, b)| {
        (a_low.contains(a) && b_low.contains(b)) || (a_low.contains(b) && b_low.contains(a))
    })
}

fn match_uia_tray_element(
    cls: &str,
    aid: &str,
    el_name: &str,
    target_id: Option<&str>,
    target_name: &str,
    is_taskbar: bool,
) -> bool {
    if is_taskbar && is_builtin_shell_tray_button(cls, aid, el_name) {
        return false;
    }
    let clean_el = el_name.trim().to_lowercase();
    if clean_el.is_empty() {
        return false;
    }
    if let Some(id) = target_id {
        if id.starts_with("uia:") {
            let expected = if is_taskbar {
                format!("uia:taskbar:{}:{}", aid, el_name.trim())
            } else {
                format!("uia:overflow:{}:{}", aid, el_name.trim())
            };
            if id == expected {
                return true;
            }
        }
    }
    let clean_target = target_name.trim().to_lowercase();
    if clean_target.is_empty() {
        return false;
    }
    clean_el == clean_target
        || clean_el.contains(&clean_target)
        || clean_target.contains(&clean_el)
        || matches_tray_alias(&clean_target, &clean_el)
}

unsafe fn find_matching_button_in_hwnd(
    uia: &IUIAutomation,
    hwnd: HWND,
    item_id: Option<&str>,
    name: &str,
    is_taskbar: bool,
) -> Option<IUIAutomationElement> {
    for el in find_buttons_under_hwnd(uia, hwnd) {
        let (cls, aid, el_name) = uia_element_props(&el);
        if match_uia_tray_element(&cls, &aid, &el_name, item_id, name, is_taskbar) {
            return Some(el);
        }
    }
    None
}

unsafe fn send_mouse_click_at(
    x: i32,
    y: i32,
    down_flag: MOUSE_EVENT_FLAGS,
    up_flag: MOUSE_EVENT_FLAGS,
) {
    let _ = SetCursorPos(x, y);
    std::thread::sleep(Duration::from_millis(8));
    let down = [INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dwFlags: down_flag,
                ..Default::default()
            },
        },
    }];
    let _ = SendInput(&down, std::mem::size_of::<INPUT>() as i32);
    std::thread::sleep(Duration::from_millis(14));
    let up = [INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dwFlags: up_flag,
                ..Default::default()
            },
        },
    }];
    let _ = SendInput(&up, std::mem::size_of::<INPUT>() as i32);
}

unsafe fn element_center_point(el: &IUIAutomationElement) -> Option<(i32, i32)> {
    let mut pt = POINT::default();
    if let Ok(ok) = el.GetClickablePoint(&mut pt) {
        if ok.as_bool() {
            return Some((pt.x, pt.y));
        }
    }
    if let Ok(rc) = el.CurrentBoundingRectangle() {
        if rc.right > rc.left && rc.bottom > rc.top {
            return Some(((rc.left + rc.right) / 2, (rc.top + rc.bottom) / 2));
        }
    }
    None
}

fn shell_open(target: &str) -> bool {
    let wide_target: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    let verb: Vec<u16> = "open\0".encode_utf16().collect();
    let res = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(wide_target.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOW,
        )
    };
    (res.0 as isize) > 32
}

fn launch_exe_fallback(exe_path: &str) {
    // NVDisplay.Container.exe is a background service host; launch the NVIDIA Control Panel AppUserModelId instead.
    if exe_path.to_ascii_lowercase().ends_with("nvdisplay.container.exe") {
        if !shell_open("shell:AppsFolder\\NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel") {
            let _ = shell_open("nvcplui.exe");
        }
        return;
    }
    let _ = shell_open(exe_path);
}

#[tauri::command]
pub async fn invoke_system_tray_item(
    app: AppHandle,
    item_id: Option<String>,
    name: String,
    exe_path: Option<String>,
    hwnd: Option<isize>,
) -> bool {
    let mut cursor = POINT::default();
    unsafe {
        let _ = GetCursorPos(&mut cursor);
    }
    crate::taskbar_flyout::dismiss_flyout_for_native_handoff();
    tauri::async_runtime::spawn_blocking(move || {
        let _com = crate::ComGuard::init(COINIT_APARTMENTTHREADED);
        let was_hidden = crate::taskbar_manager::get_windows_taskbar_hidden();
        let _lease = if was_hidden {
            Some(crate::taskbar_manager::acquire_tray_overflow_lease())
        } else {
            None
        };

        let invoked = unsafe {
            let was_ov_visible = find_visible_overflow_hwnd().is_some();
            let shell_tray = FindWindowW(w!("Shell_TrayWnd"), None).unwrap_or_default();
            if was_hidden && !shell_tray.0.is_null() {
                crate::taskbar_manager::prepare_shell_tray_for_overflow_hwnd(shell_tray);
            }
            let mut result_ok = false;
            if let Ok(uia) =
                CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
            {
                if !shell_tray.0.is_null() {
                    if let Some(el) = find_matching_button_in_hwnd(
                        &uia,
                        shell_tray,
                        item_id.as_deref(),
                        &name,
                        true,
                    ) {
                        if invoke_uia_element(&el) {
                            result_ok = true;
                        } else if let Some((cx, cy)) = element_center_point(&el) {
                            let _ = SetWindowRgn(shell_tray, HRGN::default(), false);
                            let _ = SetLayeredWindowAttributes(shell_tray, COLORREF(0), 1, LWA_ALPHA);
                            bring_to_foreground_force(shell_tray);
                            send_mouse_click_at(cx, cy, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP);
                            std::thread::sleep(Duration::from_millis(35));
                            let _ = SetCursorPos(cursor.x, cursor.y);
                            result_ok = true;
                        }
                    }
                }

                if !result_ok {
                    if let Some(ov) = summon_overflow_window(Some(&uia), shell_tray) {
                        uncloak_and_show_overflow(ov);
                        let _ = wait_for_overflow_layout(ov);
                        if let Some(el) =
                            find_matching_button_in_hwnd(&uia, ov, item_id.as_deref(), &name, false)
                        {
                            if invoke_uia_element(&el) {
                                result_ok = true;
                            } else if let Some((cx, cy)) = element_center_point(&el) {
                                bring_to_foreground_force(ov);
                                send_mouse_click_at(cx, cy, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP);
                                std::thread::sleep(Duration::from_millis(35));
                                let _ = SetCursorPos(cursor.x, cursor.y);
                                result_ok = true;
                            }
                        }
                        if !was_ov_visible && IsWindowVisible(ov).as_bool() {
                            let _ = ShowWindow(ov, SW_HIDE);
                        }
                    }
                }
            }
            crate::taskbar_manager::finish_shell_tray_summon();
            result_ok
        };

        if invoked {
            return true;
        }
        if let Some(target_hwnd) = hwnd {
            if target_hwnd != 0 {
                return crate::navbar_window::activate_window_from_tray_fallback(
                    &app,
                    target_hwnd,
                );
            }
        }
        if let Some(path) = exe_path {
            if !path.trim().is_empty() {
                launch_exe_fallback(&path);
                return true;
            }
        }
        false
    })
    .await
    .unwrap_or(false)
}

#[tauri::command]
pub async fn open_system_tray_item_menu(
    app: AppHandle,
    item_id: Option<String>,
    name: String,
    exe_path: Option<String>,
    hwnd: Option<isize>,
) -> bool {
    let mut cursor = POINT::default();
    unsafe {
        let _ = GetCursorPos(&mut cursor);
    }
    crate::taskbar_flyout::dismiss_flyout_for_native_handoff();
    let my_gen = OVERFLOW_SESSION_GEN.fetch_add(1, Ordering::SeqCst) + 1;

    tauri::async_runtime::spawn_blocking(move || {
        let _com = crate::ComGuard::init(COINIT_APARTMENTTHREADED);
        let was_hidden = crate::taskbar_manager::get_windows_taskbar_hidden();
        let _lease = if was_hidden {
            Some(crate::taskbar_manager::acquire_tray_overflow_lease())
        } else {
            None
        };

        let menu_opened = unsafe {
            let was_ov_visible = find_visible_overflow_hwnd().is_some();
            let shell_tray = FindWindowW(w!("Shell_TrayWnd"), None).unwrap_or_default();
            if was_hidden && !shell_tray.0.is_null() {
                crate::taskbar_manager::prepare_shell_tray_for_overflow_hwnd(shell_tray);
            }
            let Ok(uia) =
                CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
            else {
                crate::taskbar_manager::finish_shell_tray_summon();
                return false;
            };

            let mut handled = false;
            if !shell_tray.0.is_null() {
                if let Some(el) = find_matching_button_in_hwnd(
                    &uia,
                    shell_tray,
                    item_id.as_deref(),
                    &name,
                    true,
                ) {
                    if let Some((cx, cy)) = element_center_point(&el) {
                        // Remove 1x1 summon clip so Explorer receives WM_RBUTTONUP at (cx, cy).
                        let _ = SetWindowRgn(shell_tray, HRGN::default(), false);
                        let orig_ex = GetWindowLongW(shell_tray, GWL_EXSTYLE) as u32;
                        if (orig_ex & WS_EX_TRANSPARENT.0) != 0 {
                            let _ = SetWindowLongW(
                                shell_tray,
                                GWL_EXSTYLE,
                                (orig_ex & !WS_EX_TRANSPARENT.0) as i32,
                            );
                        }
                        if was_hidden {
                            let _ = SetLayeredWindowAttributes(shell_tray, COLORREF(0), 1, LWA_ALPHA);
                        }
                        bring_to_foreground_force(shell_tray);
                        send_mouse_click_at(cx, cy, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP);
                        std::thread::sleep(Duration::from_millis(45));
                        let _ = SetCursorPos(cursor.x, cursor.y);
                        crate::taskbar_manager::finish_shell_tray_summon();
                        let menu_deadline = Instant::now() + Duration::from_secs(20);
                        std::thread::sleep(Duration::from_millis(45));
                        while OVERFLOW_SESSION_GEN.load(Ordering::Acquire) == my_gen
                            && Instant::now() < menu_deadline
                            && is_context_menu_open()
                        {
                            std::thread::sleep(Duration::from_millis(60));
                        }
                        handled = true;
                    }
                }
            }

            if !handled {
                if let Some(ov) = summon_overflow_window(Some(&uia), shell_tray) {
                    uncloak_and_show_overflow(ov);
                    let ov_rc = wait_for_overflow_layout(ov);
                    let ov_w = (ov_rc.right - ov_rc.left).max(40);
                    let ov_h = (ov_rc.bottom - ov_rc.top).max(40);
                    let anchor = Some(ScreenAnchorRect {
                        left: cursor.x - 16,
                        top: cursor.y - 16,
                        right: cursor.x + 16,
                        bottom: cursor.y + 16,
                    });
                    let work_rect = resolve_work_rect_for_anchor(anchor);
                    let (ox, oy) =
                        calculate_tray_overflow_position(ov_w, ov_h, anchor, "bottom", work_rect, 8);
                    let _ = SetWindowPos(ov, HWND_TOPMOST, ox, oy, 0, 0, SWP_NOSIZE | SWP_SHOWWINDOW);
                    bring_to_foreground_force(ov);
                    std::thread::sleep(Duration::from_millis(25));

                    let matched =
                        find_matching_button_in_hwnd(&uia, ov, item_id.as_deref(), &name, false);
                    if let Some(el) = matched {
                        if let Some((cx, cy)) = element_center_point(&el) {
                            send_mouse_click_at(cx, cy, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP);
                            std::thread::sleep(Duration::from_millis(45));
                            let _ = SetCursorPos(cursor.x, cursor.y);
                            std::thread::sleep(Duration::from_millis(45));
                            if !was_ov_visible && IsWindowVisible(ov).as_bool() && !is_context_menu_open() {
                                let _ = ShowWindow(ov, SW_HIDE);
                            }
                            let menu_deadline = Instant::now() + Duration::from_secs(20);
                            while OVERFLOW_SESSION_GEN.load(Ordering::Acquire) == my_gen
                                && Instant::now() < menu_deadline
                                && is_context_menu_open()
                            {
                                std::thread::sleep(Duration::from_millis(60));
                            }
                            if !was_ov_visible && IsWindowVisible(ov).as_bool() {
                                let _ = ShowWindow(ov, SW_HIDE);
                            }
                            handled = true;
                        }
                    }
                    if !handled && !was_ov_visible && IsWindowVisible(ov).as_bool() {
                        let _ = ShowWindow(ov, SW_HIDE);
                    }
                }
            }
            crate::taskbar_manager::finish_shell_tray_summon();
            handled
        };

        if menu_opened {
            return true;
        }
        if let Some(target_hwnd) = hwnd {
            if target_hwnd != 0 {
                return crate::navbar_window::activate_window_from_tray_fallback(
                    &app,
                    target_hwnd,
                );
            }
        }
        if let Some(path) = exe_path {
            if !path.trim().is_empty() {
                launch_exe_fallback(&path);
                return true;
            }
        }
        false
    })
    .await
    .unwrap_or(false)
}

#[tauri::command]
pub fn open_windows_tray_overflow_from_flyout(app: AppHandle) {
    let resolved = crate::taskbar_flyout::resolve_navbar_tray_anchor(&app).and_then(|(rect, pos)| {
        let nav = crate::navbar_window::get_active_navbar_window(&app)?;
        let (screen_rect, sf) = resolve_screen_anchor_from_window(&nav, &rect)?;
        Some((screen_rect, sf, pos))
    });

    crate::taskbar_flyout::dismiss_flyout_for_native_handoff();

    if let Some((screen_rect, sf, pos)) = resolved {
        toggle_native_system_tray_overflow(Some(screen_rect), sf, Some(pos));
    } else {
        toggle_native_system_tray_overflow(None, 1.0, Some("bottom".to_string()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_tray_overflow_position_all_edges_and_clamping() {
        let work = (0, 0, 1920, 1080);
        let margin = 10;

        // Bottom dock: popup placed directly above trigger rect
        let bottom_anchor = ScreenAnchorRect {
            left: 1400,
            top: 1020,
            right: 1440,
            bottom: 1060,
        };
        let (bx, by) = calculate_tray_overflow_position(220, 180, Some(bottom_anchor), "bottom", work, margin);
        assert_eq!(bx, 1420 - 110);
        assert_eq!(by, 1020 - 180 - 10);

        // Top dock: popup placed directly below trigger rect
        let top_anchor = ScreenAnchorRect {
            left: 1400,
            top: 12,
            right: 1440,
            bottom: 52,
        };
        let (tx, ty) = calculate_tray_overflow_position(220, 180, Some(top_anchor), "top", work, margin);
        assert_eq!(tx, 1420 - 110);
        assert_eq!(ty, 52 + 10);

        // Left dock: popup placed to the right of trigger rect
        let left_anchor = ScreenAnchorRect {
            left: 12,
            top: 700,
            right: 52,
            bottom: 740,
        };
        let (lx, ly) = calculate_tray_overflow_position(220, 180, Some(left_anchor), "left", work, margin);
        assert_eq!(lx, 52 + 10);
        assert_eq!(ly, 720 - 90);

        // Right dock: popup placed to the left of trigger rect
        let right_anchor = ScreenAnchorRect {
            left: 1860,
            top: 700,
            right: 1900,
            bottom: 740,
        };
        let (rx, ry) = calculate_tray_overflow_position(220, 180, Some(right_anchor), "right", work, margin);
        assert_eq!(rx, 1860 - 220 - 10);
        assert_eq!(ry, 720 - 90);

        // Clamping on right/top out-of-bounds anchor
        let oob_anchor = ScreenAnchorRect {
            left: 1905,
            top: 20,
            right: 1918,
            bottom: 48,
        };
        let (cx, cy) = calculate_tray_overflow_position(220, 180, Some(oob_anchor), "bottom", work, margin);
        assert_eq!(cx, 1920 - 220 - 10);
        assert_eq!(cy, 10);
    }

    #[test]
    fn test_parse_braced_guid() {
        let guid = parse_braced_guid("{6D809377-6AF0-444B-8957-A3773F02200E}").unwrap();
        assert_eq!(guid.data1, 0x6D809377);
        assert_eq!(guid.data2, 0x6AF0);
        assert_eq!(guid.data3, 0x444B);
        assert_eq!(guid.data4, [0x89, 0x57, 0xA3, 0x77, 0x3F, 0x02, 0x20, 0x0E]);
        assert!(parse_braced_guid("not-a-guid").is_none());
    }

    #[test]
    fn test_chevron_and_builtin_matchers() {
        assert!(is_chevron_button("SystemTray.ChevronIconView", "SystemTrayIcon", ""));
        assert!(is_chevron_button("Button", "", "Show hidden icons"));
        assert!(is_chevron_button("Button", "", "Tampilkan ikon tersembunyi"));
        assert!(!is_chevron_button("SystemTray.NormalButton", "NotifyIconGenerated", "NVIDIA Settings"));
        assert!(is_builtin_shell_tray_button("SystemTray.NormalButton", "ClockButton", "10:15 AM"));
        assert!(!is_builtin_shell_tray_button("SystemTray.NormalButton", "NotifyIconGenerated", "NVIDIA Settings"));
    }

    #[test]
    fn test_match_uia_tray_element_aliases_and_ids() {
        assert!(match_uia_tray_element(
            "SystemTray.NormalButton",
            "NotifyIconGenerated",
            "NVIDIA Settings",
            Some("uia:overflow:NotifyIconGenerated:NVIDIA Settings"),
            "NVIDIA Settings",
            false,
        ));
        assert!(match_uia_tray_element(
            "SystemTray.NormalButton",
            "NotifyIconGenerated",
            "NVIDIA Settings",
            None,
            "nvdisplay.container",
            false,
        ));
        assert!(match_uia_tray_element(
            "SystemTray.NormalButton",
            "NotifyIconGenerated",
            "Windows Security - Actions recommended.",
            None,
            "securityhealthsystray",
            true,
        ));
        assert!(match_uia_tray_element(
            "SystemTray.NormalButton",
            "NotifyIconGenerated",
            "Logitech G HUB",
            None,
            "lghub",
            false,
        ));
        assert!(!match_uia_tray_element(
            "SystemTray.NormalButton",
            "ClockButton",
            "NVIDIA Settings",
            None,
            "NVIDIA Settings",
            true,
        ));
    }

    #[test]
    fn test_read_notify_icon_settings_and_known_folder_resolution() {
        let entries = read_notify_icon_settings();
        // Verify resolved paths no longer start with unresolved System/ProgramFiles KnownFolder GUIDs
        for entry in &entries {
            if entry.exe_path.starts_with('{') {
                assert!(
                    !entry.exe_path.to_uppercase().contains("{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}"),
                    "System32 KnownFolder GUID should be resolved: {}",
                    entry.exe_path
                );
                assert!(
                    !entry.exe_path.to_uppercase().contains("{6D809377-6AF0-444B-8957-A3773F02200E}"),
                    "ProgramFiles KnownFolder GUID should be resolved: {}",
                    entry.exe_path
                );
            }
        }
    }

    #[test]
    fn test_snapshot_live_tray_uia_items_does_not_deadlock() {
        let start = Instant::now();
        let _items = snapshot_live_tray_uia_items();
        assert!(
            start.elapsed() < Duration::from_millis(1500),
            "Live UIA tray snapshot took too long: {:?}",
            start.elapsed()
        );
    }
}
