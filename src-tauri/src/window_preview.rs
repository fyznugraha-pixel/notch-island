use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use windows::core::w;
use windows::Win32::Foundation::{BOOL, COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmGetWindowAttribute, DwmQueryThumbnailSourceSize, DwmRegisterThumbnail,
    DwmSetWindowAttribute, DwmUnregisterThumbnail, DwmUpdateThumbnailProperties, DWMNCRP_DISABLED,
    DWMWA_CLOAKED, DWMWA_NCRENDERING_POLICY, DWMWA_TRANSITIONS_FORCEDISABLED,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND, DWM_THUMBNAIL_PROPERTIES, DWM_TNP_OPACITY,
    DWM_TNP_RECTDESTINATION, DWM_TNP_SOURCECLIENTAREAONLY, DWM_TNP_VISIBLE,
};
use windows::Win32::Graphics::Gdi::{
    ClientToScreen, CreateCompatibleBitmap, CreateCompatibleDC, CreateSolidBrush, DeleteDC,
    DeleteObject, GdiFlush, GetDC, GetDIBits, ReleaseDC, SelectObject, SetBrushOrgEx,
    SetStretchBltMode, StretchBlt, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, HALFTONE, HBITMAP,
    HDC, HGDIOBJ, SRCCOPY,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, EnumChildWindows,
    EnumWindows, GetAncestor, GetClassNameW, GetWindow, GetWindowLongW,
    GetWindowPlacement, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindow,
    IsWindowVisible, KillTimer, PostMessageW, RegisterClassW, SetLayeredWindowAttributes, SetTimer,
    SetWindowPos, ShowWindow, TranslateMessage, WindowFromPoint, GA_ROOT, GWL_EXSTYLE, GW_OWNER,
    HTTRANSPARENT, HWND_TOPMOST, LWA_ALPHA, MA_NOACTIVATE, MSG, SWP_NOACTIVATE, SWP_SHOWWINDOW,
    SW_HIDE, WINDOWPLACEMENT, WM_APP, WM_MOUSEACTIVATE, WM_NCHITTEST, WM_SETCURSOR, WM_TIMER,
    WNDCLASSW, WS_CLIPSIBLINGS, WS_DISABLED, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};

extern "system" {
    fn PrintWindow(hwnd: HWND, hdcblt: HDC, nflags: u32) -> BOOL;
    fn GetMessageW(lpmsg: *mut MSG, hwnd: HWND, wmsgfiltermin: u32, wmsgfiltermax: u32) -> BOOL;
}

const PW_RENDERFULLCONTENT: u32 = 0x0000_0002;
const PW_CLIENT_RENDERFULLCONTENT: u32 = 0x0000_0003;
const PREWARM_STALE_SECS: u64 = 6;
const WS_EX_TOOLWINDOW_BIT: u32 = 0x0000_0080;
const WS_EX_NOACTIVATE_BIT: u32 = 0x0800_0000;
const MAX_PREVIEW_SLOTS: usize = 6;
const MAX_CACHED_THUMBNAILS: usize = 24;
const THUMB_CAPTURE_WIDTH: i32 = 360;
const LIVE_CACHE_FRESH_MS: u128 = 1_500;
const PREWARM_SWEEP_INTERVAL_MS: u64 = 15_000;

const WM_APP_SYNC_PREVIEWS: u32 = WM_APP + 101;
const WM_APP_CLEAR_PREVIEWS: u32 = WM_APP + 102;
const WM_APP_REASSERT_ZORDER: u32 = WM_APP + 103;
const WM_APP_CLEANUP_ALL: u32 = WM_APP + 104;
const TIMER_WATCHDOG_ID: usize = 1;
const WATCHDOG_INTERVAL_MS: u32 = 220;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPreviewSlotInput {
    pub hwnd: isize,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub corner_radius: Option<f64>,
}

#[derive(Clone, Default)]
struct DesiredOverlayState {
    generation: u64,
    nav_hwnd: isize,
    scale_factor: f64,
    slots: Vec<WindowPreviewSlotInput>,
}

struct CachedThumbnail {
    captured_at: Instant,
    data_url: String,
}

static THUMBNAIL_CACHE: OnceLock<Mutex<HashMap<isize, CachedThumbnail>>> = OnceLock::new();
static DESIRED_STATE: OnceLock<Mutex<DesiredOverlayState>> = OnceLock::new();
static OVERLAY_ACTIVE: AtomicBool = AtomicBool::new(false);
static COORD_HWND: AtomicIsize = AtomicIsize::new(0);
static OVERLAY_THREAD_ONCE: std::sync::Once = std::sync::Once::new();
static PREWARM_TX: OnceLock<mpsc::SyncSender<isize>> = OnceLock::new();
static PREWARM_STARTED: AtomicBool = AtomicBool::new(false);
static LAST_FG_OBSERVED: AtomicIsize = AtomicIsize::new(0);

fn thumbnail_cache() -> &'static Mutex<HashMap<isize, CachedThumbnail>> {
    THUMBNAIL_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn desired_state() -> &'static Mutex<DesiredOverlayState> {
    DESIRED_STATE.get_or_init(|| Mutex::new(DesiredOverlayState::default()))
}

fn is_window_cloaked(hwnd: HWND) -> bool {
    let mut cloaked: u32 = 0;
    let ok = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut c_void,
            std::mem::size_of::<u32>() as u32,
        )
    };
    ok.is_ok() && cloaked != 0
}

fn is_own_process_window(hwnd: HWND) -> bool {
    let mut pid: u32 = 0;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    pid == std::process::id()
}

pub fn can_use_dwm_live_thumbnail(hwnd: isize) -> bool {
    if hwnd == 0 {
        return false;
    }
    let target = HWND(hwnd as *mut c_void);
    unsafe {
        IsWindow(target).as_bool()
            && IsWindowVisible(target).as_bool()
            && !IsIconic(target).as_bool()
            && !is_window_cloaked(target)
            && !is_own_process_window(target)
    }
}

fn get_cached_thumbnail(hwnd: isize) -> Option<(Instant, String)> {
    let target = HWND(hwnd as *mut c_void);
    let alive = unsafe { IsWindow(target).as_bool() };
    let mut guard = thumbnail_cache().lock().unwrap_or_else(|e| e.into_inner());
    if !alive {
        guard.remove(&hwnd);
        return None;
    }
    guard
        .get(&hwnd)
        .map(|entry| (entry.captured_at, entry.data_url.clone()))
}

fn set_cached_thumbnail(hwnd: isize, data_url: String) {
    let mut guard = thumbnail_cache().lock().unwrap_or_else(|e| e.into_inner());
    guard.retain(|&h, _| unsafe { IsWindow(HWND(h as *mut c_void)).as_bool() });
    if guard.len() >= MAX_CACHED_THUMBNAILS && !guard.contains_key(&hwnd) {
        if let Some(oldest_hwnd) = guard
            .iter()
            .min_by_key(|(_, entry)| entry.captured_at)
            .map(|(h, _)| *h)
        {
            guard.remove(&oldest_hwnd);
        }
    }
    guard.insert(
        hwnd,
        CachedThumbnail {
            captured_at: Instant::now(),
            data_url,
        },
    );
}

fn bitmap_has_content(bgra_pixels: &[u8]) -> bool {
    let mut non_black = 0usize;
    for px in bgra_pixels.chunks_exact(4) {
        if px[0] > 4 || px[1] > 4 || px[2] > 4 {
            non_black += 1;
            if non_black >= 12 {
                return true;
            }
        }
    }
    false
}

fn compute_aspect_fit_rect(container_w: i32, container_h: i32, src_w: i32, src_h: i32) -> RECT {
    if container_w <= 0 || container_h <= 0 || src_w <= 0 || src_h <= 0 {
        return RECT {
            left: 0,
            top: 0,
            right: container_w.max(1),
            bottom: container_h.max(1),
        };
    }
    let scale = (container_w as f64 / src_w as f64).min(container_h as f64 / src_h as f64);
    let dst_w = ((src_w as f64) * scale).round().max(1.0) as i32;
    let dst_h = ((src_h as f64) * scale).round().max(1.0) as i32;
    let dx = (container_w - dst_w) / 2;
    let dy = (container_h - dst_h) / 2;
    RECT {
        left: dx,
        top: dy,
        right: dx + dst_w,
        bottom: dy + dst_h,
    }
}

fn is_window_unoccluded_for_screen_capture(hwnd: HWND, rect: &RECT) -> bool {
    let w = rect.right - rect.left;
    let h = rect.bottom - rect.top;
    if w < 32 || h < 32 {
        return false;
    }
    let mx = rect.left + w / 2;
    let my = rect.top + h / 2;
    let ix = (w / 5).max(8);
    let iy = (h / 5).max(8);
    let samples = [
        POINT { x: mx, y: my },
        POINT {
            x: rect.left + ix,
            y: rect.top + iy,
        },
        POINT {
            x: rect.right - ix,
            y: rect.top + iy,
        },
        POINT {
            x: rect.left + ix,
            y: rect.bottom - iy,
        },
        POINT {
            x: rect.right - ix,
            y: rect.bottom - iy,
        },
    ];

    let own_pid = std::process::id();

    unsafe {
        for (idx, pt) in samples.into_iter().enumerate() {
            let hit = WindowFromPoint(pt);
            if hit.0.is_null() {
                return false;
            }
            let root = GetAncestor(hit, GA_ROOT);
            let owner = GetWindow(root, GW_OWNER).unwrap_or_default();
            if root != hwnd && owner != hwnd {
                let mut hit_pid = 0u32;
                let _ = GetWindowThreadProcessId(root, Some(&mut hit_pid));
                // Gili's full-width navbar overlay can cover multiple bottom perimeter points while hovered.
                if idx > 0 && hit_pid == own_pid {
                    continue;
                }
                return false;
            }
        }
    }
    true
}

unsafe fn read_thumb_pixels_has_content(
    hdc_thumb: HDC,
    hbm_thumb: HBITMAP,
    old_thumb_bm: HGDIOBJ,
    thumb_h: i32,
    raw_pixels: &mut Vec<u8>,
    bi: &mut BITMAPINFO,
) -> bool {
    let _ = GdiFlush();
    // GDI requires the bitmap to be deselected from its DC before GetDIBits reads reliable bits.
    SelectObject(hdc_thumb, old_thumb_bm);
    let dib_res = GetDIBits(
        hdc_thumb,
        hbm_thumb,
        0,
        thumb_h as u32,
        Some(raw_pixels.as_mut_ptr() as *mut _),
        bi,
        DIB_RGB_COLORS,
    );
    let has_content = dib_res != 0 && bitmap_has_content(raw_pixels);
    if !has_content {
        SelectObject(hdc_thumb, hbm_thumb);
    }
    has_content
}

unsafe fn try_capture_via_print_window(
    capture_hwnd: HWND,
    width: i32,
    height: i32,
    flags: u32,
    hdc_screen: HDC,
    hdc_thumb: HDC,
    hbm_thumb: HBITMAP,
    old_thumb_bm: HGDIOBJ,
    thumb_w: i32,
    thumb_h: i32,
    raw_pixels: &mut Vec<u8>,
    bi: &mut BITMAPINFO,
) -> bool {
    if width <= 0 || height <= 0 {
        return false;
    }
    let hdc_mem = CreateCompatibleDC(hdc_screen);
    if hdc_mem.is_invalid() {
        return false;
    }
    let hbm_full = CreateCompatibleBitmap(hdc_screen, width, height);
    if hbm_full.is_invalid() {
        let _ = DeleteDC(hdc_mem);
        return false;
    }
    let old_full = SelectObject(hdc_mem, hbm_full);

    let ok = if PrintWindow(capture_hwnd, hdc_mem, flags).as_bool() {
        let blit = StretchBlt(
            hdc_thumb, 0, 0, thumb_w, thumb_h, hdc_mem, 0, 0, width, height, SRCCOPY,
        );
        blit.as_bool()
            && read_thumb_pixels_has_content(
                hdc_thumb,
                hbm_thumb,
                old_thumb_bm,
                thumb_h,
                raw_pixels,
                bi,
            )
    } else {
        false
    };

    SelectObject(hdc_mem, old_full);
    let _ = DeleteObject(hbm_full);
    let _ = DeleteDC(hdc_mem);
    ok
}

fn collect_uwp_render_children(parent: HWND) -> Vec<HWND> {
    struct ChildCollector {
        core_windows: Vec<HWND>,
        other_windows: Vec<HWND>,
    }

    unsafe extern "system" fn enum_child_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return BOOL(1);
        }
        if (rect.right - rect.left) < 80 || (rect.bottom - rect.top) < 80 {
            return BOOL(1);
        }
        let mut cls = [0u16; 96];
        let len = GetClassNameW(hwnd, &mut cls);
        let class_name = String::from_utf16_lossy(&cls[..len as usize]);
        let collector = &mut *(lparam.0 as *mut ChildCollector);
        let is_priority_surface = class_name == "Windows.UI.Core.CoreWindow"
            || class_name == "Microsoft.UI.Content.DesktopChildSiteBridge"
            || class_name == "Windows.UI.Composition.DesktopWindowContentBridge"
            || class_name == "Chrome_RenderWidgetHostHWND"
            || class_name == "MozillaWindowClass"
            || class_name == "Intermediate D3D Window";
        if is_priority_surface {
            collector.core_windows.push(hwnd);
        } else if collector.other_windows.len() < 12 {
            collector.other_windows.push(hwnd);
        }
        BOOL(1)
    }

    let mut collector = ChildCollector {
        core_windows: Vec::new(),
        other_windows: Vec::new(),
    };
    unsafe {
        let _ = EnumChildWindows(
            parent,
            Some(enum_child_proc),
            LPARAM(&mut collector as *mut ChildCollector as isize),
        );
    }
    collector.core_windows.extend(collector.other_windows);
    collector.core_windows
}

unsafe fn try_capture_child_windows(
    target: HWND,
    hdc_screen: HDC,
    hdc_thumb: HDC,
    hbm_thumb: HBITMAP,
    old_thumb_bm: HGDIOBJ,
    thumb_w: i32,
    thumb_h: i32,
    raw_pixels: &mut Vec<u8>,
    bi: &mut BITMAPINFO,
) -> bool {
    for child in collect_uwp_render_children(target) {
        let mut crect = RECT::default();
        if GetWindowRect(child, &mut crect).is_ok() {
            let cw = crect.right - crect.left;
            let ch = crect.bottom - crect.top;
            for flags in [PW_RENDERFULLCONTENT, PW_CLIENT_RENDERFULLCONTENT] {
                if try_capture_via_print_window(
                    child,
                    cw,
                    ch,
                    flags,
                    hdc_screen,
                    hdc_thumb,
                    hbm_thumb,
                    old_thumb_bm,
                    thumb_w,
                    thumb_h,
                    raw_pixels,
                    bi,
                ) {
                    return true;
                }
            }
        }
    }
    false
}

fn capture_fresh_thumbnail_data_url(hwnd: isize) -> Result<String, String> {
    use base64::Engine;
    use image::codecs::jpeg::JpegEncoder;
    use image::{ImageBuffer, Rgba};

    let target = HWND(hwnd as *mut c_void);
    if !unsafe { IsWindow(target).as_bool() } {
        return Err("Invalid window handle".into());
    }

    let is_minimized = unsafe { IsIconic(target).as_bool() };
    unsafe {
        let mut width = 0i32;
        let mut height = 0i32;
        let mut screen_rect = RECT::default();

        if is_minimized {
            let mut placement = WINDOWPLACEMENT::default();
            placement.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
            if GetWindowPlacement(target, &mut placement).is_ok() {
                width =
                    (placement.rcNormalPosition.right - placement.rcNormalPosition.left).max(200);
                height =
                    (placement.rcNormalPosition.bottom - placement.rcNormalPosition.top).max(150);
            }
        } else if GetWindowRect(target, &mut screen_rect).is_ok() {
            width = (screen_rect.right - screen_rect.left).max(200);
            height = (screen_rect.bottom - screen_rect.top).max(150);
        }

        if width <= 0 || height <= 0 {
            width = 800;
            height = 600;
        }

        let thumb_w = THUMB_CAPTURE_WIDTH;
        let aspect = height as f64 / width as f64;
        let thumb_h = ((thumb_w as f64 * aspect).round() as i32).clamp(110, 260);

        let hdc_screen = GetDC(None);
        let hdc_thumb = CreateCompatibleDC(hdc_screen);
        let hbm_thumb = CreateCompatibleBitmap(hdc_screen, thumb_w, thumb_h);
        let old_thumb_bm = SelectObject(hdc_thumb, hbm_thumb);

        let _ = SetStretchBltMode(hdc_thumb, HALFTONE);
        let _ = SetBrushOrgEx(hdc_thumb, 0, 0, None);

        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: thumb_w,
                biHeight: -thumb_h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut raw_pixels = vec![0u8; (thumb_w * thumb_h * 4) as usize];

        let mut captured = try_capture_via_print_window(
            target,
            width,
            height,
            PW_RENDERFULLCONTENT,
            hdc_screen,
            hdc_thumb,
            hbm_thumb,
            old_thumb_bm,
            thumb_w,
            thumb_h,
            &mut raw_pixels,
            &mut bi,
        );

        if !captured {
            captured = try_capture_via_print_window(
                target,
                width,
                height,
                PW_CLIENT_RENDERFULLCONTENT,
                hdc_screen,
                hdc_thumb,
                hbm_thumb,
                old_thumb_bm,
                thumb_w,
                thumb_h,
                &mut raw_pixels,
                &mut bi,
            );
        }

        if !captured {
            captured = try_capture_child_windows(
                target,
                hdc_screen,
                hdc_thumb,
                hbm_thumb,
                old_thumb_bm,
                thumb_w,
                thumb_h,
                &mut raw_pixels,
                &mut bi,
            );
        }

        if !captured {
            captured = try_capture_via_print_window(
                target,
                width,
                height,
                0,
                hdc_screen,
                hdc_thumb,
                hbm_thumb,
                old_thumb_bm,
                thumb_w,
                thumb_h,
                &mut raw_pixels,
                &mut bi,
            );
        }

        // Only capture from desktop DC when the target itself sits unobstructed at those screen pixels.
        if !captured
            && !is_minimized
            && !is_window_cloaked(target)
            && is_window_unoccluded_for_screen_capture(target, &screen_rect)
        {
            let blit = StretchBlt(
                hdc_thumb,
                0,
                0,
                thumb_w,
                thumb_h,
                hdc_screen,
                screen_rect.left,
                screen_rect.top,
                width,
                height,
                SRCCOPY,
            );
            if blit.as_bool() {
                captured = read_thumb_pixels_has_content(
                    hdc_thumb,
                    hbm_thumb,
                    old_thumb_bm,
                    thumb_h,
                    &mut raw_pixels,
                    &mut bi,
                );
            }
        }

        if !captured {
            SelectObject(hdc_thumb, old_thumb_bm);
        }
        let _ = DeleteObject(hbm_thumb);
        let _ = DeleteDC(hdc_thumb);
        ReleaseDC(None, hdc_screen);

        if !captured {
            return Err("Empty or unavailable window buffer".into());
        }

        let mut rgba_pixels = vec![0u8; (thumb_w * thumb_h * 4) as usize];
        for (src, dst) in raw_pixels
            .chunks_exact(4)
            .zip(rgba_pixels.chunks_exact_mut(4))
        {
            dst[0] = src[2];
            dst[1] = src[1];
            dst[2] = src[0];
            dst[3] = 255;
        }

        if let Some(img) =
            ImageBuffer::<Rgba<u8>, _>::from_raw(thumb_w as u32, thumb_h as u32, rgba_pixels)
        {
            let mut jpeg_bytes = Vec::new();
            let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_bytes, 84);
            if encoder.encode_image(&img).is_ok() {
                let b64 = base64::engine::general_purpose::STANDARD.encode(jpeg_bytes);
                let result = format!("data:image/jpeg;base64,{}", b64);
                set_cached_thumbnail(hwnd, result.clone());
                return Ok(result);
            }
        }

        Err("Thumbnail encoding failed".into())
    }
}

pub fn capture_window_thumbnail(hwnd: isize) -> Result<String, String> {
    let target = HWND(hwnd as *mut c_void);
    if !unsafe { IsWindow(target).as_bool() } {
        return Err("Invalid window handle".into());
    }

    let is_minimized = unsafe { IsIconic(target).as_bool() };
    let is_cloaked = is_window_cloaked(target);

    if is_minimized || is_cloaked {
        if let Some((_, cached)) = get_cached_thumbnail(hwnd) {
            return Ok(cached);
        }
        return capture_fresh_thumbnail_data_url(hwnd);
    }

    if let Some((captured_at, cached)) = get_cached_thumbnail(hwnd) {
        if captured_at.elapsed().as_millis() < LIVE_CACHE_FRESH_MS {
            return Ok(cached);
        }
        return match capture_fresh_thumbnail_data_url(hwnd) {
            Ok(fresh) => Ok(fresh),
            Err(_) => Ok(cached),
        };
    }

    capture_fresh_thumbnail_data_url(hwnd)
}

fn collect_prewarm_candidates() -> Vec<isize> {
    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() || is_window_cloaked(hwnd) {
            return BOOL(1);
        }
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if (ex_style & WS_EX_TOOLWINDOW_BIT) != 0 && (ex_style & WS_EX_NOACTIVATE_BIT) != 0 {
            return BOOL(1);
        }
        if (ex_style & WS_EX_TOOLWINDOW_BIT) != 0 {
            return BOOL(1);
        }
        if let Ok(owner) = GetWindow(hwnd, GW_OWNER) {
            if !owner.0.is_null() {
                return BOOL(1);
            }
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == std::process::id() {
            return BOOL(1);
        }
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err()
            || (rect.right - rect.left) < 120
            || (rect.bottom - rect.top) < 80
        {
            return BOOL(1);
        }
        let out = &mut *(lparam.0 as *mut Vec<isize>);
        out.push(hwnd.0 as isize);
        BOOL(1)
    }

    let mut hwnds = Vec::new();
    unsafe {
        let _ = EnumWindows(
            Some(enum_proc),
            LPARAM(&mut hwnds as *mut Vec<isize> as isize),
        );
    }
    hwnds
}

fn prewarm_if_needed(hwnd: isize, stale_after: Duration) -> bool {
    let target = HWND(hwnd as *mut c_void);
    if hwnd == 0
        || !unsafe {
            IsWindow(target).as_bool()
                && !IsIconic(target).as_bool()
                && !is_own_process_window(target)
        }
    {
        return false;
    }
    if let Some((captured_at, _)) = get_cached_thumbnail(hwnd) {
        if captured_at.elapsed() < stale_after {
            return false;
        }
    }
    capture_fresh_thumbnail_data_url(hwnd).is_ok()
}

pub fn on_foreground_window_observed(fg_hwnd: isize) {
    let prev = LAST_FG_OBSERVED.swap(fg_hwnd, Ordering::Relaxed);
    if prev == fg_hwnd || !crate::navbar_window::is_navbar_enabled() {
        return;
    }
    let Some(tx) = PREWARM_TX.get() else {
        return;
    };
    if prev != 0 && prev != fg_hwnd {
        let prev_hwnd = HWND(prev as *mut c_void);
        if unsafe { IsWindow(prev_hwnd).as_bool() && !IsIconic(prev_hwnd).as_bool() } {
            let _ = tx.try_send(prev);
        }
    }
    if fg_hwnd != 0 {
        let cur_hwnd = HWND(fg_hwnd as *mut c_void);
        if unsafe {
            IsWindow(cur_hwnd).as_bool()
                && !IsIconic(cur_hwnd).as_bool()
                && !is_own_process_window(cur_hwnd)
        } {
            let _ = tx.try_send(fg_hwnd);
        }
    }
}

fn run_prewarm_sweep() {
    {
        let mut guard = thumbnail_cache().lock().unwrap_or_else(|e| e.into_inner());
        guard.retain(|&h, _| unsafe { IsWindow(HWND(h as *mut c_void)).as_bool() });
    }
    if !crate::navbar_window::is_navbar_enabled() {
        return;
    }
    let candidates = collect_prewarm_candidates();
    let mut uncached = Vec::new();

    for hwnd in candidates {
        if !can_use_dwm_live_thumbnail(hwnd) {
            continue;
        }
        if get_cached_thumbnail(hwnd).is_none() {
            uncached.push(hwnd);
        }
    }

    // Capture only uncached windows lazily in small batches to reduce periodic DWM/GDI churn.
    for hwnd in uncached.into_iter().take(3) {
        let _ = capture_fresh_thumbnail_data_url(hwnd);
    }
}

fn queue_live_prewarm(hwnds: &[isize]) {
    let Some(tx) = PREWARM_TX.get() else {
        return;
    };
    for &hwnd in hwnds {
        let needs_capture = match get_cached_thumbnail(hwnd) {
            None => true,
            Some((captured_at, _)) => captured_at.elapsed() >= Duration::from_millis(1200),
        };
        if needs_capture {
            let _ = tx.try_send(hwnd);
        }
    }
}

pub fn on_window_minimizing_observed(hwnd: isize) {
    if hwnd == 0 {
        return;
    }
    let target = HWND(hwnd as *mut c_void);
    if !unsafe {
        IsWindow(target).as_bool() && !IsIconic(target).as_bool() && !is_own_process_window(target)
    } {
        return;
    }
    capture_window_before_minimize(hwnd);
}

pub fn start_preview_prewarmer() {
    if PREWARM_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let (tx, rx) = mpsc::sync_channel::<isize>(32);
    let _ = PREWARM_TX.set(tx);

    let _ = std::thread::Builder::new()
        .name("gili-preview-prewarmer".into())
        .spawn(move || {
            std::thread::sleep(Duration::from_millis(450));
            for hwnd in collect_prewarm_candidates().into_iter().take(12) {
                let _ = prewarm_if_needed(hwnd, Duration::from_secs(PREWARM_STALE_SECS));
            }

            let sweep_interval = Duration::from_millis(PREWARM_SWEEP_INTERVAL_MS);
            let mut next_sweep_at = Instant::now() + sweep_interval;

            loop {
                let wait = next_sweep_at.saturating_duration_since(Instant::now());
                match rx.recv_timeout(wait) {
                    Ok(first_hwnd) => {
                        let _ = prewarm_if_needed(first_hwnd, Duration::from_millis(600));
                        let mut count = 0;
                        while let Ok(next_hwnd) = rx.try_recv() {
                            if next_hwnd != first_hwnd && count < 3 {
                                let _ = prewarm_if_needed(next_hwnd, Duration::from_millis(600));
                                count += 1;
                            }
                        }
                        if Instant::now() >= next_sweep_at {
                            run_prewarm_sweep();
                            next_sweep_at = Instant::now() + sweep_interval;
                        }
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        if !crate::standby_window::is_deep_eco_active() {
                            run_prewarm_sweep();
                        }
                        next_sweep_at = Instant::now() + sweep_interval;
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
        });
}

struct OverlaySlot {
    hwnd: HWND,
    bound_src: isize,
    hthumb: isize,
    last_phys: Option<(i32, i32, i32, i32)>,
    visible: bool,
}

impl OverlaySlot {
    fn new(hwnd: HWND) -> Self {
        Self {
            hwnd,
            bound_src: 0,
            hthumb: 0,
            last_phys: None,
            visible: false,
        }
    }

    unsafe fn clear(&mut self) {
        if self.hthumb != 0 {
            let _ = DwmUnregisterThumbnail(self.hthumb);
            self.hthumb = 0;
        }
        self.bound_src = 0;
        self.last_phys = None;
        if self.visible {
            let _ = ShowWindow(self.hwnd, SW_HIDE);
            self.visible = false;
        }
    }
}

unsafe extern "system" fn coord_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

unsafe extern "system" fn overlay_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_NCHITTEST => LRESULT(HTTRANSPARENT as i32 as isize),
        WM_MOUSEACTIVATE => LRESULT(MA_NOACTIVATE as isize),
        WM_SETCURSOR => LRESULT(1),
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

unsafe fn apply_overlay_dwm_chrome(hwnd: HWND) {
    let policy = DWMNCRP_DISABLED.0;
    let _ = DwmSetWindowAttribute(
        hwnd,
        DWMWA_NCRENDERING_POLICY,
        &policy as *const i32 as *const c_void,
        std::mem::size_of::<i32>() as u32,
    );
    let force_disabled: BOOL = BOOL(1);
    let _ = DwmSetWindowAttribute(
        hwnd,
        DWMWA_TRANSITIONS_FORCEDISABLED,
        &force_disabled as *const BOOL as *const c_void,
        std::mem::size_of::<BOOL>() as u32,
    );
    let corner_pref = DWMWCP_ROUND.0;
    let _ = DwmSetWindowAttribute(
        hwnd,
        DWMWA_WINDOW_CORNER_PREFERENCE,
        &corner_pref as *const i32 as *const c_void,
        std::mem::size_of::<i32>() as u32,
    );
}

unsafe fn is_hwnd_above(upper: HWND, lower: HWND) -> bool {
    if upper.0.is_null() || lower.0.is_null() || upper == lower {
        return false;
    }
    let mut cur = lower;
    for _ in 0..64 {
        let Ok(prev) = GetWindow(cur, windows::Win32::UI::WindowsAndMessaging::GW_HWNDPREV) else {
            break;
        };
        if prev.0.is_null() {
            break;
        }
        if prev == upper {
            return true;
        }
        cur = prev;
    }
    false
}

unsafe fn reassert_slot_topmost(slot_hwnd: HWND) {
    use windows::Win32::UI::WindowsAndMessaging::{SWP_NOMOVE, SWP_NOSIZE};
    let _ = SetWindowPos(
        slot_hwnd,
        HWND_TOPMOST,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
    );
}

unsafe fn sync_slots_from_desired(slots: &mut [OverlaySlot]) {
    let state = desired_state()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    let nav = HWND(state.nav_hwnd as *mut c_void);
    if state.nav_hwnd == 0
        || state.slots.is_empty()
        || !IsWindow(nav).as_bool()
        || !IsWindowVisible(nav).as_bool()
    {
        for slot in slots.iter_mut() {
            slot.clear();
        }
        OVERLAY_ACTIVE.store(false, Ordering::Release);
        return;
    }

    let mut origin = POINT { x: 0, y: 0 };
    if !ClientToScreen(nav, &mut origin).as_bool() {
        for slot in slots.iter_mut() {
            slot.clear();
        }
        OVERLAY_ACTIVE.store(false, Ordering::Release);
        return;
    }

    let scale = if state.scale_factor > 0.1 {
        state.scale_factor
    } else {
        1.0
    };

    let mut active_count = 0usize;
    for item in state.slots.iter() {
        if active_count >= slots.len() {
            break;
        }
        if item.width < 20.0 || item.height < 20.0 || !can_use_dwm_live_thumbnail(item.hwnd) {
            continue;
        }

        let slot = &mut slots[active_count];
        let src = HWND(item.hwnd as *mut c_void);

        let mut rebound = false;
        if slot.bound_src != item.hwnd || slot.hthumb == 0 {
            if slot.hthumb != 0 {
                let _ = DwmUnregisterThumbnail(slot.hthumb);
                slot.hthumb = 0;
            }
            match DwmRegisterThumbnail(slot.hwnd, src) {
                Ok(ht) => {
                    slot.hthumb = ht;
                    slot.bound_src = item.hwnd;
                    rebound = true;
                }
                Err(_) => {
                    slot.clear();
                    continue;
                }
            }
        }

        let src_size = match DwmQueryThumbnailSourceSize(slot.hthumb) {
            Ok(sz) if sz.cx >= 32 && sz.cy >= 32 => sz,
            _ => {
                slot.clear();
                continue;
            }
        };

        let phys_x = origin.x + (item.x * scale).round() as i32;
        let phys_y = origin.y + (item.y * scale).round() as i32;
        let phys_w = (item.width * scale).round().max(1.0) as i32;
        let phys_h = (item.height * scale).round().max(1.0) as i32;
        let phys = (phys_x, phys_y, phys_w, phys_h);
        let _ = item.corner_radius;

        let dst_rect = compute_aspect_fit_rect(phys_w, phys_h, src_size.cx, src_size.cy);
        let props = DWM_THUMBNAIL_PROPERTIES {
            dwFlags: DWM_TNP_RECTDESTINATION
                | DWM_TNP_VISIBLE
                | DWM_TNP_OPACITY
                | DWM_TNP_SOURCECLIENTAREAONLY,
            rcDestination: dst_rect,
            opacity: 255,
            fVisible: BOOL(1),
            fSourceClientAreaOnly: BOOL(0),
            ..Default::default()
        };

        // Update DWM thumbnail props before showing so the overlay never flashes an empty frame
        if DwmUpdateThumbnailProperties(slot.hthumb, &props).is_err() {
            slot.clear();
            continue;
        }

        if !slot.visible || rebound || slot.last_phys != Some(phys) || is_hwnd_above(nav, slot.hwnd)
        {
            let flags = if !slot.visible {
                SWP_NOACTIVATE | SWP_SHOWWINDOW
            } else {
                SWP_NOACTIVATE
            };
            let _ = SetWindowPos(
                slot.hwnd,
                HWND_TOPMOST,
                phys_x,
                phys_y,
                phys_w,
                phys_h,
                flags,
            );
            slot.visible = true;
            slot.last_phys = Some(phys);
        }
        active_count += 1;
    }

    for slot in slots[active_count..].iter_mut() {
        slot.clear();
    }
    OVERLAY_ACTIVE.store(active_count > 0, Ordering::Release);
}

fn ensure_overlay_thread() {
    OVERLAY_THREAD_ONCE.call_once(|| {
        let (ready_tx, ready_rx) = mpsc::sync_channel::<isize>(1);
        let _ = std::thread::Builder::new()
            .name("gili-dwm-preview".into())
            .spawn(move || unsafe {
                let hmod = GetModuleHandleW(None).unwrap_or_default();
                let cls_slot = w!("GiliDwmThumbSlotClass");
                let bg_brush = CreateSolidBrush(COLORREF(0x0011_0C0C));
                let wc_slot = WNDCLASSW {
                    lpfnWndProc: Some(overlay_wnd_proc),
                    hInstance: hmod.into(),
                    hbrBackground: bg_brush,
                    lpszClassName: cls_slot,
                    ..Default::default()
                };
                let _ = RegisterClassW(&wc_slot);

                let cls_coord = w!("GiliDwmThumbCoordClass");
                let wc_coord = WNDCLASSW {
                    lpfnWndProc: Some(coord_wnd_proc),
                    hInstance: hmod.into(),
                    lpszClassName: cls_coord,
                    ..Default::default()
                };
                let _ = RegisterClassW(&wc_coord);

                let coord = CreateWindowExW(
                    WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                    cls_coord,
                    w!("GiliPreviewCoord"),
                    WS_POPUP | WS_DISABLED,
                    0,
                    0,
                    0,
                    0,
                    None,
                    None,
                    hmod,
                    None,
                )
                .unwrap_or_default();

                let mut slots = Vec::with_capacity(MAX_PREVIEW_SLOTS);
                for idx in 0..MAX_PREVIEW_SLOTS {
                    if let Ok(hwnd) = CreateWindowExW(
                        WS_EX_TOPMOST
                            | WS_EX_TOOLWINDOW
                            | WS_EX_NOACTIVATE
                            | WS_EX_TRANSPARENT
                            | WS_EX_LAYERED,
                        cls_slot,
                        w!("GiliDwmPreview"),
                        WS_POPUP | WS_CLIPSIBLINGS | WS_DISABLED,
                        -32000 + (idx as i32 * 40),
                        -32000,
                        1,
                        1,
                        None,
                        None,
                        hmod,
                        None,
                    ) {
                        let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA);
                        apply_overlay_dwm_chrome(hwnd);
                        slots.push(OverlaySlot::new(hwnd));
                    }
                }

                COORD_HWND.store(coord.0 as isize, Ordering::Release);
                let mut watchdog_armed = false;
                let _ = ready_tx.send(coord.0 as isize);

                unsafe fn sync_watchdog_timer(coord: HWND, armed: &mut bool) {
                    let active = OVERLAY_ACTIVE.load(Ordering::Acquire);
                    if active && !*armed && !coord.0.is_null() {
                        let _ = SetTimer(coord, TIMER_WATCHDOG_ID, WATCHDOG_INTERVAL_MS, None);
                        *armed = true;
                    } else if !active && *armed && !coord.0.is_null() {
                        let _ = KillTimer(coord, TIMER_WATCHDOG_ID);
                        *armed = false;
                    }
                }

                let mut msg = MSG::default();
                while GetMessageW(&mut msg, HWND::default(), 0, 0).0 > 0 {
                    match msg.message {
                        WM_APP_SYNC_PREVIEWS => {
                            sync_slots_from_desired(&mut slots);
                            sync_watchdog_timer(coord, &mut watchdog_armed);
                        }
                        WM_APP_CLEAR_PREVIEWS => {
                            for slot in slots.iter_mut() {
                                slot.clear();
                            }
                            OVERLAY_ACTIVE.store(false, Ordering::Release);
                            sync_watchdog_timer(coord, &mut watchdog_armed);
                        }
                        WM_APP_REASSERT_ZORDER => {
                            if OVERLAY_ACTIVE.load(Ordering::Acquire) {
                                for slot in slots.iter().filter(|s| s.visible) {
                                    reassert_slot_topmost(slot.hwnd);
                                }
                            }
                        }
                        WM_APP_CLEANUP_ALL => {
                            for slot in slots.iter_mut() {
                                slot.clear();
                                let _ = DestroyWindow(slot.hwnd);
                            }
                            slots.clear();
                            if watchdog_armed {
                                let _ = KillTimer(coord, TIMER_WATCHDOG_ID);
                            }
                            let _ = DestroyWindow(coord);
                            COORD_HWND.store(0, Ordering::Release);
                            OVERLAY_ACTIVE.store(false, Ordering::Release);
                            break;
                        }
                        WM_TIMER if msg.wParam.0 == TIMER_WATCHDOG_ID => {
                            if OVERLAY_ACTIVE.load(Ordering::Acquire) {
                                let (stale, nav_hwnd_raw) = {
                                    let s =
                                        desired_state().lock().unwrap_or_else(|e| e.into_inner());
                                    let nav = HWND(s.nav_hwnd as *mut c_void);
                                    let is_stale = s.nav_hwnd == 0
                                        || s.slots.is_empty()
                                        || !IsWindow(nav).as_bool()
                                        || !IsWindowVisible(nav).as_bool();
                                    (is_stale, s.nav_hwnd)
                                };
                                if stale {
                                    for slot in slots.iter_mut() {
                                        slot.clear();
                                    }
                                    OVERLAY_ACTIVE.store(false, Ordering::Release);
                                    sync_watchdog_timer(coord, &mut watchdog_armed);
                                } else {
                                    let any_dead = slots.iter().any(|s| {
                                        s.visible && !can_use_dwm_live_thumbnail(s.bound_src)
                                    });
                                    if any_dead {
                                        sync_slots_from_desired(&mut slots);
                                        sync_watchdog_timer(coord, &mut watchdog_armed);
                                    } else if nav_hwnd_raw != 0 {
                                        let nav = HWND(nav_hwnd_raw as *mut c_void);
                                        for slot in slots.iter().filter(|s| s.visible) {
                                            if is_hwnd_above(nav, slot.hwnd) {
                                                reassert_slot_topmost(slot.hwnd);
                                            }
                                        }
                                    }
                                }
                            } else {
                                sync_watchdog_timer(coord, &mut watchdog_armed);
                            }
                        }
                        _ => {
                            let _ = TranslateMessage(&msg);
                            DispatchMessageW(&msg);
                        }
                    }
                }
            });

        let _ = ready_rx.recv_timeout(Duration::from_millis(500));
    });
}

fn post_overlay_msg(msg: u32) {
    let raw = COORD_HWND.load(Ordering::Acquire);
    if raw != 0 {
        unsafe {
            let hwnd = HWND(raw as *mut c_void);
            if IsWindow(hwnd).as_bool() {
                let _ = PostMessageW(hwnd, msg, WPARAM(0), LPARAM(0));
            }
        }
    }
}

#[tauri::command]
pub fn sync_window_previews(
    window: tauri::WebviewWindow,
    slots: Vec<WindowPreviewSlotInput>,
) -> Vec<isize> {
    if slots.is_empty() {
        clear_window_previews();
        return Vec::new();
    }

    let Ok(raw_nav_hwnd) = window.hwnd() else {
        clear_window_previews();
        return Vec::new();
    };
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let live_hwnds: Vec<isize> = slots
        .iter()
        .take(MAX_PREVIEW_SLOTS)
        .filter(|s| s.width >= 20.0 && s.height >= 20.0 && can_use_dwm_live_thumbnail(s.hwnd))
        .map(|s| s.hwnd)
        .collect();
    queue_live_prewarm(&live_hwnds);

    {
        let mut guard = desired_state().lock().unwrap_or_else(|e| e.into_inner());
        guard.generation = guard.generation.wrapping_add(1);
        guard.nav_hwnd = raw_nav_hwnd.0 as isize;
        guard.scale_factor = scale_factor;
        guard.slots = slots.into_iter().take(MAX_PREVIEW_SLOTS).collect();
    }

    ensure_overlay_thread();
    post_overlay_msg(WM_APP_SYNC_PREVIEWS);
    live_hwnds
}

#[tauri::command]
pub fn clear_window_previews() {
    {
        let mut guard = desired_state().lock().unwrap_or_else(|e| e.into_inner());
        guard.generation = guard.generation.wrapping_add(1);
        guard.slots.clear();
    }
    if OVERLAY_ACTIVE.load(Ordering::Acquire) || COORD_HWND.load(Ordering::Acquire) != 0 {
        post_overlay_msg(WM_APP_CLEAR_PREVIEWS);
    }
}

pub fn reassert_overlay_zorder() {
    if OVERLAY_ACTIVE.load(Ordering::Acquire) {
        post_overlay_msg(WM_APP_REASSERT_ZORDER);
    }
}

pub fn capture_window_before_minimize(hwnd: isize) {
    let target = HWND(hwnd as *mut c_void);
    if hwnd == 0 || !unsafe { IsWindow(target).as_bool() && !IsIconic(target).as_bool() } {
        return;
    }
    if let Some((captured_at, _)) = get_cached_thumbnail(hwnd) {
        if captured_at.elapsed() < Duration::from_secs(30) {
            return;
        }
    }
    let _ = capture_fresh_thumbnail_data_url(hwnd);
}

pub fn cleanup_window_previews() {
    clear_window_previews();
    if COORD_HWND.load(Ordering::Acquire) != 0 {
        post_overlay_msg(WM_APP_CLEANUP_ALL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_aspect_fit_rect_preserves_aspect_and_centers() {
        let wide = compute_aspect_fit_rect(200, 120, 1920, 1080);
        assert_eq!(wide.left, 0);
        assert_eq!(wide.right, 200);
        assert!(wide.bottom - wide.top >= 111 && wide.bottom - wide.top <= 114);
        assert_eq!(wide.top, (120 - (wide.bottom - wide.top)) / 2);

        let tall = compute_aspect_fit_rect(200, 120, 400, 800);
        assert_eq!(tall.top, 0);
        assert_eq!(tall.bottom, 120);
        assert_eq!(tall.right - tall.left, 60);
        assert_eq!(tall.left, 70);
    }

    #[test]
    fn test_bitmap_has_content_filters_black_buffers() {
        let all_black = vec![0u8; 400];
        assert!(!bitmap_has_content(&all_black));

        let mut single_px = vec![0u8; 400];
        single_px[2] = 200;
        assert!(!bitmap_has_content(&single_px));

        let mut real_content = vec![0u8; 400];
        for px in real_content.chunks_exact_mut(4).take(16) {
            px[0] = 40;
            px[1] = 80;
            px[2] = 120;
            px[3] = 255;
        }
        assert!(bitmap_has_content(&real_content));
    }

    #[test]
    fn test_thumbnail_cache_persists_live_window_without_short_ttl() {
        unsafe {
            let hwnd = HWND(0x7FFE_1234isize as *mut c_void);
            if IsWindow(hwnd).as_bool() {
                return;
            }
        }
        let dummy = "data:image/jpeg;base64,/9j/4AAQ".to_string();
        set_cached_thumbnail(999_999, dummy);
        // Dead/fake HWND should automatically be filtered out on read.
        assert!(get_cached_thumbnail(999_999).is_none());
    }

    #[test]
    fn test_live_window_capture_and_minimized_cache_retention() {
        use windows::Win32::Graphics::Gdi::{BeginPaint, EndPaint, FillRect, PAINTSTRUCT};
        use windows::Win32::UI::WindowsAndMessaging::{
            CS_HREDRAW, CS_VREDRAW, SW_MINIMIZE, SW_SHOWNOACTIVATE, WM_PAINT, WS_OVERLAPPEDWINDOW,
        };

        unsafe extern "system" fn painted_wnd_proc(
            hwnd: HWND,
            msg: u32,
            wparam: WPARAM,
            lparam: LPARAM,
        ) -> LRESULT {
            if msg == WM_PAINT {
                let mut ps = PAINTSTRUCT::default();
                let hdc = BeginPaint(hwnd, &mut ps);
                let brush = CreateSolidBrush(COLORREF(0x0044_99CC));
                let _ = FillRect(hdc, &ps.rcPaint, brush);
                let _ = DeleteObject(brush);
                let _ = EndPaint(hwnd, &ps);
                return LRESULT(0);
            }
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }

        unsafe {
            let hmod = GetModuleHandleW(None).unwrap_or_default();
            let cls = w!("GiliPreviewUnitTestWin");
            let wc = WNDCLASSW {
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(painted_wnd_proc),
                hInstance: hmod.into(),
                lpszClassName: cls,
                ..Default::default()
            };
            let _ = RegisterClassW(&wc);

            let src = CreateWindowExW(
                WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                cls,
                w!("PreviewTestSource"),
                WS_OVERLAPPEDWINDOW,
                -2200,
                120,
                420,
                280,
                None,
                None,
                hmod,
                None,
            )
            .expect("create test window");

            let _ = ShowWindow(src, SW_SHOWNOACTIVATE);
            let raw_hwnd = src.0 as isize;
            let captured = capture_window_thumbnail(raw_hwnd);
            assert!(
                captured
                    .as_ref()
                    .is_ok_and(|u| u.starts_with("data:image/jpeg;base64,")),
                "expected JPEG data URL from live painted window, got: {:?}",
                captured
            );

            let _ = ShowWindow(src, SW_MINIMIZE);
            assert!(!can_use_dwm_live_thumbnail(raw_hwnd));
            assert!(get_cached_thumbnail(raw_hwnd).is_some());
            let while_minimized = capture_window_thumbnail(raw_hwnd);
            assert_eq!(while_minimized, captured);

            if let Ok(dst) = CreateWindowExW(
                WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                cls,
                w!("PreviewTestDst"),
                WS_POPUP,
                -2600,
                120,
                200,
                140,
                None,
                None,
                hmod,
                None,
            ) {
                let _ = ShowWindow(dst, SW_SHOWNOACTIVATE);
                assert!(is_hwnd_above(dst, src));
                assert!(!is_hwnd_above(src, dst));
                let _ = DestroyWindow(dst);
            }

            let _ = DestroyWindow(src);
            assert!(get_cached_thumbnail(raw_hwnd).is_none());
        }
    }
}
