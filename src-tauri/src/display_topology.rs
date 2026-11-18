use std::sync::{mpsc, OnceLock};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DisplayDescriptor {
    pub name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_bits: u64,
    pub is_primary: bool,
}

pub type TopologySignature = Vec<(String, i32, i32, u32, u32, u64, bool)>;

pub fn descriptor_from_monitor(mon: &tauri::Monitor, is_primary: bool) -> DisplayDescriptor {
    DisplayDescriptor {
        name: mon.name().cloned(),
        x: mon.position().x,
        y: mon.position().y,
        width: mon.size().width,
        height: mon.size().height,
        scale_bits: mon.scale_factor().to_bits(),
        is_primary,
    }
}

pub fn build_display_descriptors(
    monitors: &[tauri::Monitor],
    primary: Option<&tauri::Monitor>,
) -> Vec<DisplayDescriptor> {
    let primary_desc = primary.map(|p| descriptor_from_monitor(p, true));
    monitors
        .iter()
        .map(|m| {
            let mut desc = descriptor_from_monitor(m, false);
            if let Some(ref p) = primary_desc {
                if is_same_display(&desc, p) {
                    desc.is_primary = true;
                }
            }
            desc
        })
        .collect()
}

fn normalized_display_name(name: &str) -> String {
    name.trim().trim_start_matches(r"\\.\").to_ascii_lowercase()
}

pub fn is_same_display(a: &DisplayDescriptor, b: &DisplayDescriptor) -> bool {
    if a.width > 0
        && a.height > 0
        && a.x == b.x
        && a.y == b.y
        && a.width == b.width
        && a.height == b.height
    {
        return true;
    }

    match (&a.name, &b.name) {
        (Some(na), Some(nb)) => {
            let norm_a = normalized_display_name(na);
            let norm_b = normalized_display_name(nb);
            !norm_a.is_empty() && norm_a == norm_b
        }
        _ => false,
    }
}

pub fn resolve_primary_index(displays: &[DisplayDescriptor]) -> Option<usize> {
    if displays.is_empty() {
        return None;
    }
    displays
        .iter()
        .position(|d| d.is_primary)
        .or_else(|| displays.iter().position(|d| d.x == 0 && d.y == 0))
        .or(Some(0))
}

pub fn split_primary_and_secondary_indices(displays: &[DisplayDescriptor]) -> (Option<usize>, Vec<usize>) {
    let Some(primary_idx) = resolve_primary_index(displays) else {
        return (None, Vec::new());
    };
    let primary = &displays[primary_idx];
    let mut secondary = Vec::new();

    for (idx, disp) in displays.iter().enumerate() {
        if idx == primary_idx || is_same_display(disp, primary) {
            continue;
        }
        if secondary
            .iter()
            .any(|&seen_idx| is_same_display(disp, &displays[seen_idx]))
        {
            continue;
        }
        secondary.push(idx);
    }

    (Some(primary_idx), secondary)
}

pub fn parse_secondary_notch_index(label: &str) -> Option<usize> {
    let raw = label.strip_prefix("notch_secondary_")?;
    let idx = raw.parse::<usize>().ok()?;
    (idx >= 1).then_some(idx)
}

pub fn should_destroy_secondary_notch(label: &str, sec_count: usize, is_all: bool) -> bool {
    if !label.starts_with("notch_secondary_") {
        return false;
    }
    if !is_all || sec_count == 0 {
        return true;
    }
    match parse_secondary_notch_index(label) {
        Some(idx) => idx > sec_count,
        None => true,
    }
}

pub fn resolve_secondary_monitor_index(
    label: &str,
    displays: &[DisplayDescriptor],
    is_all: bool,
) -> Option<usize> {
    if !is_all {
        return None;
    }
    let sec_idx = parse_secondary_notch_index(label)?;
    let (_, secondary_indices) = split_primary_and_secondary_indices(displays);
    secondary_indices.get(sec_idx - 1).copied()
}

pub fn topology_signature(displays: &[DisplayDescriptor]) -> TopologySignature {
    let mut sig: TopologySignature = displays
        .iter()
        .map(|d| {
            (
                d.name
                    .as_deref()
                    .map(normalized_display_name)
                    .unwrap_or_default(),
                d.x,
                d.y,
                d.width,
                d.height,
                d.scale_bits,
                d.is_primary,
            )
        })
        .collect();
    sig.sort();
    sig
}

pub fn quick_desktop_geometry_signature() -> (i32, i32, i32, i32, i32) {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetSystemMetrics, SM_CMONITORS, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
            SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
        };
        (
            GetSystemMetrics(SM_CMONITORS),
            GetSystemMetrics(SM_XVIRTUALSCREEN),
            GetSystemMetrics(SM_YVIRTUALSCREEN),
            GetSystemMetrics(SM_CXVIRTUALSCREEN),
            GetSystemMetrics(SM_CYVIRTUALSCREEN),
        )
    }
    #[cfg(not(windows))]
    {
        (0, 0, 0, 0, 0)
    }
}

#[cfg(windows)]
static DISPLAY_EVENT_TX: OnceLock<mpsc::Sender<()>> = OnceLock::new();

#[cfg(windows)]
unsafe extern "system" fn display_watcher_wnd_proc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{
        DefWindowProcW, SPI_SETWORKAREA, WM_DISPLAYCHANGE, WM_DPICHANGED, WM_SETTINGCHANGE,
    };

    let is_topology_msg = msg == WM_DISPLAYCHANGE
        || msg == WM_DPICHANGED
        || (msg == WM_SETTINGCHANGE && wparam.0 == SPI_SETWORKAREA.0 as usize);

    if is_topology_msg {
        if let Some(tx) = DISPLAY_EVENT_TX.get() {
            let _ = tx.send(());
        }
    }

    DefWindowProcW(hwnd, msg, wparam, lparam)
}

pub fn start_display_change_watcher<F>(on_change: F)
where
    F: Fn() + Send + Sync + 'static,
{
    #[cfg(windows)]
    {
        static STARTED: OnceLock<()> = OnceLock::new();
        if STARTED.set(()).is_err() {
            return;
        }

        let (tx, rx) = mpsc::channel::<()>();
        let _ = DISPLAY_EVENT_TX.set(tx);

        let _ = std::thread::Builder::new()
            .name("gili-display-topology-sync".to_string())
            .spawn(move || {
                while rx.recv().is_ok() {
                    // Coalesce burst of WM_DISPLAYCHANGE / SPI_SETWORKAREA notifications during hotplug
                    let settle_deadline = Instant::now() + Duration::from_millis(90);
                    loop {
                        let remaining = settle_deadline.saturating_duration_since(Instant::now());
                        if remaining.is_zero() {
                            break;
                        }
                        if rx.recv_timeout(remaining).is_err() {
                            break;
                        }
                    }
                    on_change();

                    // Run one quiet confirmation pass ~350ms later in case Windows finishes teardown slightly late
                    if rx.recv_timeout(Duration::from_millis(350)).is_err() {
                        on_change();
                    }
                }
            });

        let _ = std::thread::Builder::new()
            .name("gili-display-change-msg".to_string())
            .spawn(|| unsafe {
                use windows::core::w;
                use windows::Win32::Foundation::HWND;
                use windows::Win32::System::LibraryLoader::GetModuleHandleW;
                use windows::Win32::UI::WindowsAndMessaging::{
                    CreateWindowExW, DispatchMessageW, GetMessageW, RegisterClassW,
                    TranslateMessage, HMENU, MSG, WNDCLASSW, WS_DISABLED, WS_EX_NOACTIVATE,
                    WS_EX_TOOLWINDOW, WS_POPUP,
                };

                let hinst = GetModuleHandleW(None).unwrap_or_default();
                let cls_name = w!("GiliDisplayTopologyWatcher");
                let wc = WNDCLASSW {
                    lpfnWndProc: Some(display_watcher_wnd_proc),
                    hInstance: hinst.into(),
                    lpszClassName: cls_name,
                    ..Default::default()
                };
                let _ = RegisterClassW(&wc);

                // Must be top-level WS_POPUP (never HWND_MESSAGE) to receive WM_DISPLAYCHANGE broadcasts
                let Ok(hwnd) = CreateWindowExW(
                    WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                    cls_name,
                    w!("GiliDisplayWatcher"),
                    WS_POPUP | WS_DISABLED,
                    0,
                    0,
                    0,
                    0,
                    HWND::default(),
                    HMENU::default(),
                    hinst,
                    None,
                ) else {
                    return;
                };

                if hwnd.0.is_null() {
                    return;
                }

                let mut msg = MSG::default();
                while GetMessageW(&mut msg, HWND::default(), 0, 0).0 > 0 {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            });
    }
    #[cfg(not(windows))]
    {
        let _ = on_change;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn disp(name: Option<&str>, x: i32, y: i32, w: u32, h: u32, scale: f64, is_primary: bool) -> DisplayDescriptor {
        DisplayDescriptor {
            name: name.map(str::to_string),
            x,
            y,
            width: w,
            height: h,
            scale_bits: scale.to_bits(),
            is_primary,
        }
    }

    #[test]
    fn test_disconnect_external_leaves_only_primary_and_destroys_secondary_notch() {
        let connected = vec![
            disp(Some(r"\\.\DISPLAY1"), 0, 0, 1920, 1200, 1.5, true),
            disp(Some(r"\\.\DISPLAY2"), 1920, 0, 1920, 1080, 1.0, false),
        ];
        assert_eq!(
            resolve_secondary_monitor_index("notch_secondary_1", &connected, true),
            Some(1)
        );
        assert!(!should_destroy_secondary_notch("notch_secondary_1", 1, true));

        // External display disconnected -> only DISPLAY1 remains
        let disconnected = vec![disp(Some(r"\\.\DISPLAY1"), 0, 0, 1920, 1200, 1.5, true)];
        let (prim, sec) = split_primary_and_secondary_indices(&disconnected);
        assert_eq!(prim, Some(0));
        assert!(sec.is_empty());
        assert_eq!(
            resolve_secondary_monitor_index("notch_secondary_1", &disconnected, true),
            None
        );
        assert!(should_destroy_secondary_notch("notch_secondary_1", sec.len(), true));
        assert!(should_destroy_secondary_notch("notch_secondary_1", 1, false));
        assert!(should_destroy_secondary_notch("notch_secondary_0", 2, true));
        assert!(!should_destroy_secondary_notch("main", 0, false));
    }

    #[test]
    fn test_duplicate_mirror_mode_and_triple_to_dual_transitions() {
        // Mirrored / Duplicate mode shares identical bounds with primary
        let mirrored = vec![
            disp(Some(r"\\.\DISPLAY1"), 0, 0, 1920, 1080, 1.25, true),
            disp(Some(r"\\.\DISPLAY2"), 0, 0, 1920, 1080, 1.25, false),
        ];
        let (prim, sec) = split_primary_and_secondary_indices(&mirrored);
        assert_eq!(prim, Some(0));
        assert!(sec.is_empty());
        assert!(should_destroy_secondary_notch("notch_secondary_1", sec.len(), true));

        // 3 monitors -> 2 monitors: notch_secondary_1 kept on #2, notch_secondary_2 destroyed
        let triple = vec![
            disp(Some(r"\\.\DISPLAY1"), 0, 0, 1920, 1200, 1.5, true),
            disp(Some(r"\\.\DISPLAY2"), 1920, 0, 2560, 1440, 1.25, false),
            disp(Some(r"\\.\DISPLAY3"), -1920, 0, 1920, 1080, 1.0, false),
        ];
        let (_, triple_sec) = split_primary_and_secondary_indices(&triple);
        assert_eq!(triple_sec, vec![1, 2]);
        assert!(!should_destroy_secondary_notch("notch_secondary_2", triple_sec.len(), true));

        let dual = vec![triple[0].clone(), triple[1].clone()];
        let (_, dual_sec) = split_primary_and_secondary_indices(&dual);
        assert_eq!(dual_sec, vec![1]);
        assert_eq!(
            resolve_secondary_monitor_index("notch_secondary_2", &dual, true),
            None
        );
        assert!(should_destroy_secondary_notch("notch_secondary_2", dual_sec.len(), true));
        assert!(!should_destroy_secondary_notch("notch_secondary_1", dual_sec.len(), true));
    }

    #[test]
    fn test_topology_signature_detects_order_dpi_and_count_changes() {
        let a = vec![
            disp(Some(r"\\.\DISPLAY1"), 0, 0, 1920, 1200, 1.5, true),
            disp(Some(r"\\.\DISPLAY2"), 1920, 0, 1920, 1080, 1.0, false),
        ];
        let a_reordered = vec![a[1].clone(), a[0].clone()];
        assert_eq!(topology_signature(&a), topology_signature(&a_reordered));

        let b_disconnected = vec![a[0].clone()];
        assert_ne!(topology_signature(&a), topology_signature(&b_disconnected));

        let c_scaled = vec![
            a[0].clone(),
            disp(Some(r"\\.\DISPLAY2"), 1920, 0, 1920, 1080, 1.25, false),
        ];
        assert_ne!(topology_signature(&a), topology_signature(&c_scaled));
    }
}
