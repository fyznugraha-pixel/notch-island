use std::collections::HashMap;
use std::ffi::c_void;
use std::mem::size_of;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, Once, OnceLock};
use std::time::{Duration, Instant};

use tauri::Manager;
use windows::core::w;
use windows::Win32::Foundation::{BOOL, COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmFlush, DwmGetWindowAttribute, DwmSetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS,
    DWMWA_TRANSITIONS_FORCEDISABLED,
};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateDIBSection, CreateSolidBrush,
    DeleteDC, DeleteObject, FillRect, GetDC, GetDIBits, GetMonitorInfoW, MonitorFromRect,
    MonitorFromWindow, ReleaseDC, SelectObject, SetBrushOrgEx, SetStretchBltMode, StretchBlt,
    AC_SRC_ALPHA, AC_SRC_OVER, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION, COLORONCOLOR,
    DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ, MONITORINFO, MONITOR_DEFAULTTONEAREST, SRCCOPY,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, CreateWindowExW, DefWindowProcW, DestroyWindow, DrawIconEx,
    GetClassLongPtrW, GetForegroundWindow, GetWindowPlacement, GetWindowRect, IsIconic, IsWindow,
    RegisterClassW, SendMessageW, SetForegroundWindow, ShowWindow, ShowWindowAsync,
    UpdateLayeredWindowIndirect, DI_NORMAL, GCLP_HICON, GCLP_HICONSM, HICON, ICON_BIG, ICON_SMALL,
    ICON_SMALL2, SW_MINIMIZE, SW_RESTORE, SW_SHOWNOACTIVATE, ULW_ALPHA, UPDATELAYEREDWINDOWINFO,
    WINDOWPLACEMENT, WM_GETICON, WNDCLASSW, WPF_RESTORETOMAXIMIZED, WS_EX_LAYERED,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};

extern "system" {
    fn PrintWindow(hwnd: HWND, hdcblt: HDC, nflags: u32) -> BOOL;
}

const PW_RENDERFULLCONTENT: u32 = 0x0000_0002;
const MAX_SNAP_W: i32 = 2560;
const MAX_SNAP_H: i32 = 1600;
const MAX_ANIM_SNAPSHOTS: usize = 16;
const MINIMIZE_DURATION_MS: f64 = 300.0;
const RESTORE_DURATION_MS: f64 = 310.0;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockAnchorRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub position: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum DockEdge {
    Bottom,
    Top,
    Left,
    Right,
}

impl DockEdge {
    fn from_opt(pos: Option<&str>) -> Self {
        match pos.unwrap_or("bottom") {
            "top" => Self::Top,
            "left" => Self::Left,
            "right" => Self::Right,
            _ => Self::Bottom,
        }
    }
}

#[derive(Clone)]
struct WindowSnapshot {
    width: i32,
    height: i32,
    bgra: Vec<u8>,
}

static SNAPSHOT_CACHE: OnceLock<Mutex<HashMap<isize, (Instant, Arc<WindowSnapshot>)>>> =
    OnceLock::new();
static LAST_DOCK_ANCHOR: OnceLock<Mutex<Option<(Instant, DockAnchorRect)>>> = OnceLock::new();
static ACTIVE_ANIM_GEN: AtomicU64 = AtomicU64::new(0);
static ACTIVE_GENIE_DEPTH: AtomicUsize = AtomicUsize::new(0);
static GENIE_ANIMATION_ENABLED: AtomicBool = AtomicBool::new(true);
static ANIM_HOST_CLASS_ONCE: Once = Once::new();

pub fn is_genie_animation_enabled() -> bool {
    GENIE_ANIMATION_ENABLED.load(Ordering::Acquire)
}

pub fn set_genie_animation_enabled(enabled: bool) {
    let prev = GENIE_ANIMATION_ENABLED.swap(enabled, Ordering::AcqRel);
    if !enabled && prev {
        ACTIVE_ANIM_GEN.fetch_add(1, Ordering::SeqCst);
        clear_snapshot_cache();
    }
}

#[tauri::command]
pub fn set_window_dock_animation(enabled: bool) {
    set_genie_animation_enabled(enabled);
}

fn clear_snapshot_cache() {
    let mut guard = snapshot_cache().lock().unwrap_or_else(|e| e.into_inner());
    guard.clear();
    guard.shrink_to_fit();
}

pub fn is_genie_animating() -> bool {
    ACTIVE_GENIE_DEPTH.load(Ordering::Acquire) > 0
}

pub fn on_window_minimizing_observed(hwnd: isize) {
    if hwnd == 0 || !is_genie_animation_enabled() || is_genie_animating() {
        return;
    }
    let target = HWND(hwnd as *mut _);
    if !unsafe { IsWindow(target).as_bool() } {
        return;
    }
    if let Some(win_rect) = get_extended_window_rect(target) {
        let _ = capture_window_snapshot(target, &win_rect);
    }
}

struct GenieActiveGuard;

impl GenieActiveGuard {
    fn acquire() -> Self {
        ACTIVE_GENIE_DEPTH.fetch_add(1, Ordering::AcqRel);
        Self
    }
}

impl Drop for GenieActiveGuard {
    fn drop(&mut self) {
        ACTIVE_GENIE_DEPTH.fetch_sub(1, Ordering::AcqRel);
    }
}

fn snapshot_cache() -> &'static Mutex<HashMap<isize, (Instant, Arc<WindowSnapshot>)>> {
    SNAPSHOT_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn last_dock_anchor_store() -> &'static Mutex<Option<(Instant, DockAnchorRect)>> {
    LAST_DOCK_ANCHOR.get_or_init(|| Mutex::new(None))
}

pub fn record_last_dock_anchor(anchor: DockAnchorRect) {
    if anchor.width <= 0.0 || anchor.height <= 0.0 {
        return;
    }
    let mut guard = last_dock_anchor_store()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    *guard = Some((Instant::now(), anchor));
}

pub fn get_recent_dock_anchor(max_age: Duration) -> Option<DockAnchorRect> {
    let guard = last_dock_anchor_store()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    guard
        .as_ref()
        .filter(|(ts, _)| ts.elapsed() <= max_age)
        .map(|(_, rect)| rect.clone())
}

struct TransitionDisableGuard {
    hwnd: HWND,
    applied: bool,
}

impl TransitionDisableGuard {
    fn acquire(hwnd: HWND) -> Self {
        let val: u32 = 1;
        let ok = unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_TRANSITIONS_FORCEDISABLED,
                &val as *const u32 as *const c_void,
                size_of::<u32>() as u32,
            )
            .is_ok()
        };
        Self { hwnd, applied: ok }
    }
}

impl Drop for TransitionDisableGuard {
    fn drop(&mut self) {
        if self.applied && unsafe { IsWindow(self.hwnd).as_bool() } {
            let val: u32 = 0;
            unsafe {
                let _ = DwmSetWindowAttribute(
                    self.hwnd,
                    DWMWA_TRANSITIONS_FORCEDISABLED,
                    &val as *const u32 as *const c_void,
                    size_of::<u32>() as u32,
                );
            }
        }
    }
}

fn resolve_physical_anchor_rect(
    app: &tauri::AppHandle,
    anchor: &DockAnchorRect,
) -> Option<(RECT, DockEdge)> {
    let nav = app.get_webview_window("navbar")?;
    let outer_pos = nav.outer_position().ok()?;
    let sf = nav.scale_factor().ok()?.max(1.0);

    let left = outer_pos.x + (anchor.x * sf).round() as i32;
    let top = outer_pos.y + (anchor.y * sf).round() as i32;
    let w = (anchor.width * sf).round().max(12.0) as i32;
    let h = (anchor.height * sf).round().max(12.0) as i32;

    Some((
        RECT {
            left,
            top,
            right: left + w,
            bottom: top + h,
        },
        DockEdge::from_opt(anchor.position.as_deref()),
    ))
}

fn get_extended_window_rect(hwnd: HWND) -> Option<RECT> {
    let mut rect = RECT::default();
    let dwm_ok = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut RECT as *mut c_void,
            size_of::<RECT>() as u32,
        )
        .is_ok()
    };
    if dwm_ok && (rect.right - rect.left) > 32 && (rect.bottom - rect.top) > 32 {
        return Some(rect);
    }
    if unsafe { GetWindowRect(hwnd, &mut rect).is_ok() }
        && (rect.right - rect.left) > 32
        && (rect.bottom - rect.top) > 32
    {
        return Some(rect);
    }
    None
}

fn resolve_restore_destination_rect(hwnd: HWND) -> Option<RECT> {
    unsafe {
        let mut wp = WINDOWPLACEMENT {
            length: size_of::<WINDOWPLACEMENT>() as u32,
            ..Default::default()
        };
        if GetWindowPlacement(hwnd, &mut wp).is_err() {
            return None;
        }

        let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        let has_mi = GetMonitorInfoW(mon, &mut mi).as_bool();

        if (wp.flags.0 & WPF_RESTORETOMAXIMIZED.0) != 0 && has_mi {
            return Some(mi.rcWork);
        }

        let nr = wp.rcNormalPosition;
        if (nr.right - nr.left) <= 32 || (nr.bottom - nr.top) <= 32 {
            return has_mi.then_some(mi.rcWork);
        }

        let wp_mon = MonitorFromRect(&nr, MONITOR_DEFAULTTONEAREST);
        let mut wp_mi = MONITORINFO {
            cbSize: size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(wp_mon, &mut wp_mi).as_bool() {
            let dx = wp_mi.rcWork.left - wp_mi.rcMonitor.left;
            let dy = wp_mi.rcWork.top - wp_mi.rcMonitor.top;
            return Some(RECT {
                left: nr.left + dx,
                top: nr.top + dy,
                right: nr.right + dx,
                bottom: nr.bottom + dy,
            });
        }
        Some(nr)
    }
}

fn compute_downscaled_dims(src_w: i32, src_h: i32) -> (i32, i32) {
    let sw = src_w.max(1) as f64;
    let sh = src_h.max(1) as f64;
    let scale = (MAX_SNAP_W as f64 / sw).min(MAX_SNAP_H as f64 / sh).min(1.0);
    (
        (sw * scale).round().max(16.0) as i32,
        (sh * scale).round().max(16.0) as i32,
    )
}

fn snapshot_has_content(bgra: &[u8]) -> bool {
    let mut lit = 0usize;
    for px in bgra.chunks_exact(16) {
        if px[0] > 4 || px[1] > 4 || px[2] > 4 {
            lit += 1;
            if lit >= 8 {
                return true;
            }
        }
    }
    false
}

unsafe fn blit_snapshot_region(
    hdc_dst: HDC,
    dst_w: i32,
    dst_h: i32,
    hdc_src: HDC,
    src_x: i32,
    src_y: i32,
    src_w: i32,
    src_h: i32,
) -> bool {
    if dst_w == src_w && dst_h == src_h {
        BitBlt(hdc_dst, 0, 0, dst_w, dst_h, hdc_src, src_x, src_y, SRCCOPY).is_ok()
    } else {
        StretchBlt(
            hdc_dst,
            0,
            0,
            dst_w,
            dst_h,
            hdc_src,
            src_x,
            src_y,
            src_w,
            src_h,
            SRCCOPY,
        )
        .as_bool()
    }
}

fn capture_window_snapshot(hwnd: HWND, frame_rect: &RECT) -> Option<Arc<WindowSnapshot>> {
    let src_w = (frame_rect.right - frame_rect.left).max(1);
    let src_h = (frame_rect.bottom - frame_rect.top).max(1);
    let (dst_w, dst_h) = compute_downscaled_dims(src_w, src_h);

    unsafe {
        let mut full_rect = RECT::default();
        if GetWindowRect(hwnd, &mut full_rect).is_err() {
            full_rect = *frame_rect;
        }
        let full_w = (full_rect.right - full_rect.left).max(1);
        let full_h = (full_rect.bottom - full_rect.top).max(1);
        let crop_x = (frame_rect.left - full_rect.left).max(0);
        let crop_y = (frame_rect.top - full_rect.top).max(0);
        let crop_w = src_w.min(full_w - crop_x).max(1);
        let crop_h = src_h.min(full_h - crop_y).max(1);

        let hdc_screen = GetDC(None);
        if hdc_screen.is_invalid() {
            return None;
        }
        let hdc_dst = CreateCompatibleDC(hdc_screen);
        let hbm_dst = CreateCompatibleBitmap(hdc_screen, dst_w, dst_h);
        if hdc_dst.is_invalid() || hbm_dst.is_invalid() {
            if !hbm_dst.is_invalid() {
                let _ = DeleteObject(hbm_dst);
            }
            if !hdc_dst.is_invalid() {
                let _ = DeleteDC(hdc_dst);
            }
            ReleaseDC(None, hdc_screen);
            return None;
        }
        let old_dst = SelectObject(hdc_dst, hbm_dst);
        let _ = SetStretchBltMode(hdc_dst, COLORONCOLOR);
        let _ = SetBrushOrgEx(hdc_dst, 0, 0, None);

        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: dst_w,
                biHeight: -dst_h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = vec![0u8; (dst_w * dst_h * 4) as usize];

        let mut ok = false;
        let mut dst_selected = true;

        // Screen-first capture avoids slow cross-process PrintWindow when the window is in front
        if GetForegroundWindow() == hwnd
            && blit_snapshot_region(
                hdc_dst,
                dst_w,
                dst_h,
                hdc_screen,
                frame_rect.left,
                frame_rect.top,
                src_w,
                src_h,
            )
        {
            SelectObject(hdc_dst, old_dst);
            dst_selected = false;
            if GetDIBits(
                hdc_dst,
                hbm_dst,
                0,
                dst_h as u32,
                Some(pixels.as_mut_ptr() as *mut _),
                &mut bi,
                DIB_RGB_COLORS,
            ) != 0
                && snapshot_has_content(&pixels)
            {
                ok = true;
            }
        }

        if !ok {
            if !dst_selected {
                SelectObject(hdc_dst, hbm_dst);
                dst_selected = true;
            }
            let hdc_pw = CreateCompatibleDC(hdc_screen);
            let hbm_pw = CreateCompatibleBitmap(hdc_screen, full_w, full_h);
            if !hdc_pw.is_invalid() && !hbm_pw.is_invalid() {
                let old_pw = SelectObject(hdc_pw, hbm_pw);
                if PrintWindow(hwnd, hdc_pw, PW_RENDERFULLCONTENT).as_bool()
                    && blit_snapshot_region(hdc_dst, dst_w, dst_h, hdc_pw, crop_x, crop_y, crop_w, crop_h)
                {
                    SelectObject(hdc_dst, old_dst);
                    dst_selected = false;
                    if GetDIBits(
                        hdc_dst,
                        hbm_dst,
                        0,
                        dst_h as u32,
                        Some(pixels.as_mut_ptr() as *mut _),
                        &mut bi,
                        DIB_RGB_COLORS,
                    ) != 0
                        && snapshot_has_content(&pixels)
                    {
                        ok = true;
                    }
                }
                SelectObject(hdc_pw, old_pw);
            }
            if !hbm_pw.is_invalid() {
                let _ = DeleteObject(hbm_pw);
            }
            if !hdc_pw.is_invalid() {
                let _ = DeleteDC(hdc_pw);
            }
        }

        if !ok {
            if !dst_selected {
                SelectObject(hdc_dst, hbm_dst);
                dst_selected = true;
            }
            if blit_snapshot_region(
                hdc_dst,
                dst_w,
                dst_h,
                hdc_screen,
                frame_rect.left,
                frame_rect.top,
                src_w,
                src_h,
            ) {
                SelectObject(hdc_dst, old_dst);
                dst_selected = false;
                if GetDIBits(
                    hdc_dst,
                    hbm_dst,
                    0,
                    dst_h as u32,
                    Some(pixels.as_mut_ptr() as *mut _),
                    &mut bi,
                    DIB_RGB_COLORS,
                ) != 0
                    && snapshot_has_content(&pixels)
                {
                    ok = true;
                }
            }
        }
        if dst_selected {
            SelectObject(hdc_dst, old_dst);
        }

        let _ = DeleteObject(hbm_dst);
        let _ = DeleteDC(hdc_dst);
        ReleaseDC(None, hdc_screen);

        if !ok {
            return None;
        }

        for px in pixels.chunks_exact_mut(4) {
            px[3] = 255;
        }

        let snap = Arc::new(WindowSnapshot {
            width: dst_w,
            height: dst_h,
            bgra: pixels,
        });
        cache_snapshot(hwnd.0 as isize, snap.clone());
        Some(snap)
    }
}

fn cache_snapshot(hwnd_raw: isize, snap: Arc<WindowSnapshot>) {
    let mut guard = snapshot_cache().lock().unwrap_or_else(|e| e.into_inner());
    guard.retain(|&h, _| unsafe { IsWindow(HWND(h as *mut c_void)).as_bool() });
    if guard.len() >= MAX_ANIM_SNAPSHOTS && !guard.contains_key(&hwnd_raw) {
        if let Some(oldest) = guard
            .iter()
            .min_by_key(|(_, (ts, _))| *ts)
            .map(|(h, _)| *h)
        {
            guard.remove(&oldest);
        }
    }
    guard.insert(hwnd_raw, (Instant::now(), snap));
}

fn get_cached_snapshot(hwnd_raw: isize) -> Option<Arc<WindowSnapshot>> {
    let guard = snapshot_cache().lock().unwrap_or_else(|e| e.into_inner());
    guard.get(&hwnd_raw).map(|(_, s)| s.clone())
}

fn build_fallback_icon_snapshot(hwnd: HWND) -> Arc<WindowSnapshot> {
    let w = 360i32;
    let h = 220i32;
    let mut pixels = vec![0u8; (w * h * 4) as usize];

    // Subtle frosted slate card background with crisp header strip
    for y in 0..h {
        let is_header = y < 28;
        let (b, g, r) = if is_header { (26u8, 28, 34) } else { (18u8, 20, 24) };
        let row = &mut pixels[(y * w * 4) as usize..((y + 1) * w * 4) as usize];
        for px in row.chunks_exact_mut(4) {
            px[0] = b;
            px[1] = g;
            px[2] = r;
            px[3] = 255;
        }
    }

    unsafe {
        let mut hicon_raw = SendMessageW(hwnd, WM_GETICON, WPARAM(ICON_BIG as usize), LPARAM(0)).0;
        if hicon_raw == 0 {
            hicon_raw = SendMessageW(hwnd, WM_GETICON, WPARAM(ICON_SMALL2 as usize), LPARAM(0)).0;
        }
        if hicon_raw == 0 {
            hicon_raw = SendMessageW(hwnd, WM_GETICON, WPARAM(ICON_SMALL as usize), LPARAM(0)).0;
        }
        if hicon_raw == 0 {
            hicon_raw = GetClassLongPtrW(hwnd, GCLP_HICON) as isize;
        }
        if hicon_raw == 0 {
            hicon_raw = GetClassLongPtrW(hwnd, GCLP_HICONSM) as isize;
        }

        if hicon_raw != 0 {
            let hdc_screen = GetDC(None);
            let hdc_mem = CreateCompatibleDC(hdc_screen);
            let hbm = CreateCompatibleBitmap(hdc_screen, 48, 48);
            if !hdc_mem.is_invalid() && !hbm.is_invalid() {
                let old = SelectObject(hdc_mem, hbm);
                let bg = CreateSolidBrush(COLORREF(0x0012_1418));
                let fill_rc = RECT {
                    left: 0,
                    top: 0,
                    right: 48,
                    bottom: 48,
                };
                FillRect(hdc_mem, &fill_rc, bg);
                let _ = DeleteObject(bg);

                let _ = DrawIconEx(
                    hdc_mem,
                    0,
                    0,
                    HICON(hicon_raw as *mut c_void),
                    48,
                    48,
                    0,
                    None,
                    DI_NORMAL,
                );

                let mut bi = BITMAPINFO {
                    bmiHeader: BITMAPINFOHEADER {
                        biSize: size_of::<BITMAPINFOHEADER>() as u32,
                        biWidth: 48,
                        biHeight: -48,
                        biPlanes: 1,
                        biBitCount: 32,
                        biCompression: BI_RGB.0,
                        ..Default::default()
                    },
                    ..Default::default()
                };
                let mut icon_px = vec![0u8; 48 * 48 * 4];
                SelectObject(hdc_mem, old);
                if GetDIBits(
                    hdc_mem,
                    hbm,
                    0,
                    48,
                    Some(icon_px.as_mut_ptr() as *mut _),
                    &mut bi,
                    DIB_RGB_COLORS,
                ) != 0
                {
                    let ox = (w - 48) / 2;
                    let oy = (h - 48) / 2 + 6;
                    for iy in 0..48 {
                        let dst_row = (((oy + iy) * w + ox) * 4) as usize;
                        let src_row = (iy * 48 * 4) as usize;
                        for ix in 0..48 {
                            let sp = &icon_px[src_row + ix * 4..src_row + ix * 4 + 4];
                            if sp[0] != 0x12 || sp[1] != 0x14 || sp[2] != 0x18 {
                                let dp = &mut pixels[dst_row + ix * 4..dst_row + ix * 4 + 4];
                                dp[0] = sp[0];
                                dp[1] = sp[1];
                                dp[2] = sp[2];
                                dp[3] = 255;
                            }
                        }
                    }
                }
            }
            if !hbm.is_invalid() {
                let _ = DeleteObject(hbm);
            }
            if !hdc_mem.is_invalid() {
                let _ = DeleteDC(hdc_mem);
            }
            if !hdc_screen.is_invalid() {
                ReleaseDC(None, hdc_screen);
            }
        }
    }

    Arc::new(WindowSnapshot {
        width: w,
        height: h,
        bgra: pixels,
    })
}

#[inline]
fn lerp_f(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

#[inline]
fn smoothstep(x: f64) -> f64 {
    let t = x.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

#[inline]
fn ease_in_out_cubic(t: f64) -> f64 {
    if t < 0.5 {
        4.0 * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    }
}

#[inline]
fn ease_out_cubic(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

#[inline]
fn genie_bell_s_curve(x: f64) -> f64 {
    smoothstep(smoothstep(x))
}

#[inline]
fn wait_next_anim_frame() {
    if unsafe { DwmFlush().is_err() } {
        std::thread::sleep(Duration::from_millis(4));
    }
}

/// Computes Genie curve progress pair `(far_edge_progress, dock_funnel_progress)`
/// in `[0.0 = full window, 1.0 = sucked into dock button]`.
fn genie_progress_pair(raw_t: f64, is_minimize: bool) -> (f64, f64) {
    let t = raw_t.clamp(0.0, 1.0);
    if is_minimize {
        // Funnel reaches dock neck early while far edge curves smoothly into it
        let funnel = ease_out_cubic((t * 1.85).min(1.0));
        let far = ease_in_out_cubic(t);
        (far, funnel)
    } else {
        // Smooth forward deceleration: far edge leads gently while funnel fans out slightly behind
        let expand_far = ease_out_cubic(t);
        let u_funnel = ((t - 0.08) / 0.92).clamp(0.0, 1.0);
        let expand_funnel = ease_out_cubic(smoothstep(u_funnel));
        (1.0 - expand_far, 1.0 - expand_funnel)
    }
}

struct GenieFrameSpan {
    bounds: RECT,
    row_spans: Vec<(i32, i32, i32)>, // per scanline: (left_in_bounds, right_in_bounds, src_coord)
}

fn compute_genie_frame(
    win: RECT,
    icon: RECT,
    edge: DockEdge,
    src_w: i32,
    src_h: i32,
    far_p: f64,
    funnel_p: f64,
) -> GenieFrameSpan {
    let neck_lag = (funnel_p - far_p).max(0.0);
    match edge {
        DockEdge::Bottom | DockEdge::Top => {
            let is_bottom = edge == DockEdge::Bottom;
            let top_p = if is_bottom { far_p } else { funnel_p };
            let bot_p = if is_bottom { funnel_p } else { far_p };

            let top_y = lerp_f(win.top as f64, icon.top as f64, top_p).round() as i32;
            let bot_y = lerp_f(win.bottom as f64, icon.bottom as f64, bot_p).round() as i32;
            let frame_top = top_y.min(bot_y);
            let frame_bot = bot_y.max(frame_top + 2);
            let span_h = (frame_bot - frame_top).max(1);

            let far_l = lerp_f(win.left as f64, icon.left as f64, far_p);
            let far_r = lerp_f(win.right as f64, icon.right as f64, far_p);
            let funnel_l = lerp_f(win.left as f64, icon.left as f64, funnel_p);
            let funnel_r = lerp_f(win.right as f64, icon.right as f64, funnel_p);

            let frame_left = far_l.min(funnel_l).floor() as i32;
            let frame_right = (far_r.max(funnel_r).ceil() as i32).max(frame_left + 1);
            let guide_span = if is_bottom {
                (icon.bottom - frame_top).max(span_h)
            } else {
                (frame_bot - icon.top).max(span_h)
            }
            .max(1) as f64;
            let stretch_exp = lerp_f(1.0, 0.84, neck_lag);

            let mut row_spans = Vec::with_capacity(span_h as usize);
            for dy in 0..span_h {
                let frac = dy as f64 / (span_h - 1).max(1) as f64;
                let screen_y = (frame_top + dy) as f64;
                let guide_u = if is_bottom {
                    ((screen_y - frame_top as f64) / guide_span).clamp(0.0, 1.0)
                } else {
                    ((frame_bot as f64 - screen_y) / guide_span).clamp(0.0, 1.0)
                };
                let s_curve = genie_bell_s_curve(guide_u);
                let xl = lerp_f(far_l, funnel_l, s_curve).round() as i32 - frame_left;
                let xr = lerp_f(far_r, funnel_r, s_curve).round() as i32 - frame_left;
                let src_frac = if is_bottom {
                    frac.powf(stretch_exp)
                } else {
                    1.0 - (1.0 - frac).powf(stretch_exp)
                };
                let sy = ((src_frac * (src_h - 1) as f64).round() as i32).clamp(0, src_h - 1);
                row_spans.push((xl.max(0), xr.max(xl + 1), sy));
            }

            GenieFrameSpan {
                bounds: RECT {
                    left: frame_left,
                    top: frame_top,
                    right: frame_right,
                    bottom: frame_bot,
                },
                row_spans,
            }
        }
        DockEdge::Left | DockEdge::Right => {
            let is_right = edge == DockEdge::Right;
            let left_p = if is_right { far_p } else { funnel_p };
            let right_p = if is_right { funnel_p } else { far_p };

            let xl = lerp_f(win.left as f64, icon.left as f64, left_p).round() as i32;
            let xr = lerp_f(win.right as f64, icon.right as f64, right_p).round() as i32;
            let frame_left = xl.min(xr);
            let frame_right = xr.max(frame_left + 2);
            let span_w = (frame_right - frame_left).max(1);

            let far_t = lerp_f(win.top as f64, icon.top as f64, far_p);
            let far_b = lerp_f(win.bottom as f64, icon.bottom as f64, far_p);
            let funnel_t = lerp_f(win.top as f64, icon.top as f64, funnel_p);
            let funnel_b = lerp_f(win.bottom as f64, icon.bottom as f64, funnel_p);

            let frame_top = far_t.min(funnel_t).floor() as i32;
            let frame_bot = (far_b.max(funnel_b).ceil() as i32).max(frame_top + 1);
            let guide_span = if is_right {
                (icon.right - frame_left).max(span_w)
            } else {
                (frame_right - icon.left).max(span_w)
            }
            .max(1) as f64;
            let stretch_exp = lerp_f(1.0, 0.84, neck_lag);

            let mut row_spans = Vec::with_capacity(span_w as usize);
            for dx in 0..span_w {
                let frac = dx as f64 / (span_w - 1).max(1) as f64;
                let screen_x = (frame_left + dx) as f64;
                let guide_u = if is_right {
                    ((screen_x - frame_left as f64) / guide_span).clamp(0.0, 1.0)
                } else {
                    ((frame_right as f64 - screen_x) / guide_span).clamp(0.0, 1.0)
                };
                let s_curve = genie_bell_s_curve(guide_u);
                let yt = lerp_f(far_t, funnel_t, s_curve).round() as i32 - frame_top;
                let yb = lerp_f(far_b, funnel_b, s_curve).round() as i32 - frame_top;
                let src_frac = if is_right {
                    frac.powf(stretch_exp)
                } else {
                    1.0 - (1.0 - frac).powf(stretch_exp)
                };
                let sx = ((src_frac * (src_w - 1) as f64).round() as i32).clamp(0, src_w - 1);
                row_spans.push((yt.max(0), yb.max(yt + 1), sx));
            }

            GenieFrameSpan {
                bounds: RECT {
                    left: frame_left,
                    top: frame_top,
                    right: frame_right,
                    bottom: frame_bot,
                },
                row_spans,
            }
        }
    }
}

unsafe extern "system" fn anim_host_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

fn ensure_anim_host_class() -> bool {
    ANIM_HOST_CLASS_ONCE.call_once(|| unsafe {
        let hinst = GetModuleHandleW(None).unwrap_or_default();
        let wc = WNDCLASSW {
            lpfnWndProc: Some(anim_host_wnd_proc),
            hInstance: hinst.into(),
            lpszClassName: w!("GiliGenieAnimHost"),
            ..Default::default()
        };
        let _ = RegisterClassW(&wc);
    });
    true
}

struct AnimOverlaySurface {
    hwnd: HWND,
    hdc_screen: HDC,
    hdc_dib: HDC,
    hbm_dib: HBITMAP,
    old_bm: HGDIOBJ,
    dib_ptr: *mut u32,
    origin_x: i32,
    origin_y: i32,
    max_w: i32,
    max_h: i32,
    prev_row_spans: Vec<(i32, i32)>,
    prev_col_spans: Vec<(i32, i32)>,
    prev_bounds: Option<RECT>,
}

impl AnimOverlaySurface {
    fn create(origin_x: i32, origin_y: i32, max_w: i32, max_h: i32) -> Option<Self> {
        ensure_anim_host_class();
        let max_w = max_w.max(64);
        let max_h = max_h.max(64);
        unsafe {
            let hinst = GetModuleHandleW(None).unwrap_or_default();
            let hwnd = CreateWindowExW(
                WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST,
                w!("GiliGenieAnimHost"),
                w!(""),
                WS_POPUP,
                0,
                0,
                16,
                16,
                None,
                None,
                hinst,
                None,
            )
            .ok()?;

            let hdc_screen = GetDC(None);
            let hdc_dib = CreateCompatibleDC(hdc_screen);
            let bi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: max_w,
                    biHeight: -max_h,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut bits: *mut c_void = std::ptr::null_mut();
            let hbm_dib =
                CreateDIBSection(hdc_screen, &bi, DIB_RGB_COLORS, &mut bits, None, 0).ok()?;
            if hdc_dib.is_invalid() || hbm_dib.is_invalid() || bits.is_null() {
                if !hbm_dib.is_invalid() {
                    let _ = DeleteObject(hbm_dib);
                }
                if !hdc_dib.is_invalid() {
                    let _ = DeleteDC(hdc_dib);
                }
                if !hdc_screen.is_invalid() {
                    ReleaseDC(None, hdc_screen);
                }
                let _ = DestroyWindow(hwnd);
                return None;
            }
            let old_bm = SelectObject(hdc_dib, hbm_dib);
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);

            Some(Self {
                hwnd,
                hdc_screen,
                hdc_dib,
                hbm_dib,
                old_bm,
                dib_ptr: bits as *mut u32,
                origin_x,
                origin_y,
                max_w,
                max_h,
                prev_row_spans: vec![(0, 0); max_h as usize],
                prev_col_spans: vec![(0, 0); max_w as usize],
                prev_bounds: None,
            })
        }
    }

    fn present_genie_frame(
        &mut self,
        snap: &WindowSnapshot,
        span: &GenieFrameSpan,
        edge: DockEdge,
        global_alpha: u8,
    ) {
        let off_x = (span.bounds.left - self.origin_x).clamp(0, self.max_w - 1);
        let off_y = (span.bounds.top - self.origin_y).clamp(0, self.max_h - 1);
        let bw = (span.bounds.right - span.bounds.left).clamp(1, self.max_w - off_x);
        let bh = (span.bounds.bottom - span.bounds.top).clamp(1, self.max_h - off_y);
        let src_ptr = snap.bgra.as_ptr() as *const u32;
        let sw = snap.width;
        let sh = snap.height;
        let stride = self.max_w as usize;

        unsafe {
            match edge {
                DockEdge::Bottom | DockEdge::Top => {
                    let mut filled_rows = 0i32;
                    for (dy, &(raw_xl, raw_xr, sy)) in span.row_spans.iter().enumerate() {
                        let dy_i = dy as i32;
                        if dy_i >= bh {
                            break;
                        }
                        let y = off_y + dy_i;
                        let y_u = y as usize;
                        let row_base = self.dib_ptr.add(y_u * stride);
                        let local_xl = raw_xl.clamp(0, bw - 1);
                        let local_xr = raw_xr.clamp(local_xl + 1, bw);
                        let xl = off_x + local_xl;
                        let xr = off_x + local_xr;

                        let (pl, pr) = self.prev_row_spans[y_u];
                        if pl < pr {
                            if pl < xl {
                                let clear_end = xl.min(pr);
                                std::ptr::write_bytes(
                                    row_base.add(pl as usize),
                                    0,
                                    (clear_end - pl) as usize,
                                );
                            }
                            if pr > xr {
                                let clear_start = xr.max(pl);
                                std::ptr::write_bytes(
                                    row_base.add(clear_start as usize),
                                    0,
                                    (pr - clear_start) as usize,
                                );
                            }
                        }

                        let rw = (xr - xl) as usize;
                        let dst_row = row_base.add(xl as usize);
                        let src_row = src_ptr.add((sy as usize) * (sw as usize));
                        if rw == sw as usize {
                            std::ptr::copy_nonoverlapping(src_row, dst_row, rw);
                        } else {
                            let step32 = if rw > 1 && sw > 1 {
                                (((sw - 1) as u32) << 16) / ((rw - 1) as u32)
                            } else {
                                0
                            };
                            let mut acc: u32 = 0;
                            for x in 0..rw {
                                *dst_row.add(x) = *src_row.add((acc >> 16) as usize);
                                acc += step32;
                            }
                        }
                        if rw >= 6 {
                            *dst_row = feather_premul_pixel(*dst_row, 85);
                            *dst_row.add(1) = feather_premul_pixel(*dst_row.add(1), 170);
                            *dst_row.add(rw - 2) = feather_premul_pixel(*dst_row.add(rw - 2), 170);
                            *dst_row.add(rw - 1) = feather_premul_pixel(*dst_row.add(rw - 1), 85);
                        }
                        self.prev_row_spans[y_u] = (xl, xr);
                        filled_rows = dy_i + 1;
                    }

                    if let Some(pb) = self.prev_bounds {
                        let active_end = off_y + filled_rows;
                        let y_start = pb.top.clamp(0, self.max_h);
                        let y_end = pb.bottom.clamp(0, self.max_h);
                        for y in y_start..y_end {
                            if y < off_y || y >= active_end {
                                let y_u = y as usize;
                                let (pl, pr) = self.prev_row_spans[y_u];
                                if pl < pr {
                                    std::ptr::write_bytes(
                                        self.dib_ptr.add(y_u * stride + (pl as usize)),
                                        0,
                                        (pr - pl) as usize,
                                    );
                                    self.prev_row_spans[y_u] = (0, 0);
                                }
                            }
                        }
                    }
                }
                DockEdge::Left | DockEdge::Right => {
                    let sw_u = sw as usize;
                    let mut filled_cols = 0i32;
                    for (dx, &(raw_yt, raw_yb, sx)) in span.row_spans.iter().enumerate() {
                        let dx_i = dx as i32;
                        if dx_i >= bw {
                            break;
                        }
                        let x = off_x + dx_i;
                        let x_u = x as usize;
                        let local_yt = raw_yt.clamp(0, bh - 1);
                        let local_yb = raw_yb.clamp(local_yt + 1, bh);
                        let yt = off_y + local_yt;
                        let yb = off_y + local_yb;

                        let (pt, pb_y) = self.prev_col_spans[x_u];
                        if pt < pb_y {
                            if pt < yt {
                                let clear_end = yt.min(pb_y);
                                for y in pt..clear_end {
                                    *self.dib_ptr.add((y as usize) * stride + x_u) = 0;
                                }
                            }
                            if pb_y > yb {
                                let clear_start = yb.max(pt);
                                for y in clear_start..pb_y {
                                    *self.dib_ptr.add((y as usize) * stride + x_u) = 0;
                                }
                            }
                        }

                        let rh = (yb - yt) as usize;
                        let step32 = if rh > 1 && sh > 1 {
                            (((sh - 1) as u32) << 16) / ((rh - 1) as u32)
                        } else {
                            0
                        };
                        let sx_u = sx.clamp(0, sw - 1) as usize;
                        let col_dst = self.dib_ptr.add((yt as usize) * stride + x_u);
                        let mut acc: u32 = 0;
                        for y in 0..rh {
                            let sy_u = (acc >> 16) as usize;
                            *col_dst.add(y * stride) = *src_ptr.add(sy_u * sw_u + sx_u);
                            acc += step32;
                        }
                        if rh >= 6 {
                            let p0 = col_dst;
                            let p1 = col_dst.add(stride);
                            let p2 = col_dst.add((rh - 2) * stride);
                            let p3 = col_dst.add((rh - 1) * stride);
                            *p0 = feather_premul_pixel(*p0, 85);
                            *p1 = feather_premul_pixel(*p1, 170);
                            *p2 = feather_premul_pixel(*p2, 170);
                            *p3 = feather_premul_pixel(*p3, 85);
                        }
                        self.prev_col_spans[x_u] = (yt, yb);
                        filled_cols = dx_i + 1;
                    }

                    if let Some(pb) = self.prev_bounds {
                        let active_end = off_x + filled_cols;
                        let x_start = pb.left.clamp(0, self.max_w);
                        let x_end = pb.right.clamp(0, self.max_w);
                        for x in x_start..x_end {
                            if x < off_x || x >= active_end {
                                let x_u = x as usize;
                                let (pt, pb_y) = self.prev_col_spans[x_u];
                                if pt < pb_y {
                                    for y in pt..pb_y {
                                        *self.dib_ptr.add((y as usize) * stride + x_u) = 0;
                                    }
                                    self.prev_col_spans[x_u] = (0, 0);
                                }
                            }
                        }
                    }
                }
            }

            let cur_local = RECT {
                left: off_x,
                top: off_y,
                right: (off_x + bw).min(self.max_w),
                bottom: (off_y + bh).min(self.max_h),
            };
            let dirty_storage;
            let dirty_ptr = if let Some(pb) = self.prev_bounds {
                dirty_storage = union_rect(cur_local, pb);
                &dirty_storage as *const RECT
            } else {
                std::ptr::null()
            };
            self.prev_bounds = Some(cur_local);

            let dst_pt = POINT {
                x: self.origin_x,
                y: self.origin_y,
            };
            let dst_sz = SIZE {
                cx: self.max_w,
                cy: self.max_h,
            };
            let src_pt = POINT { x: 0, y: 0 };
            let blend = BLENDFUNCTION {
                BlendOp: AC_SRC_OVER as u8,
                BlendFlags: 0,
                SourceConstantAlpha: global_alpha,
                AlphaFormat: AC_SRC_ALPHA as u8,
            };
            let ulwi = UPDATELAYEREDWINDOWINFO {
                cbSize: size_of::<UPDATELAYEREDWINDOWINFO>() as u32,
                hdcDst: self.hdc_screen,
                pptDst: &dst_pt,
                psize: &dst_sz,
                hdcSrc: self.hdc_dib,
                pptSrc: &src_pt,
                crKey: COLORREF(0),
                pblend: &blend,
                dwFlags: ULW_ALPHA,
                prcDirty: dirty_ptr,
            };
            let _ = UpdateLayeredWindowIndirect(self.hwnd, &ulwi);
        }
    }
}

impl Drop for AnimOverlaySurface {
    fn drop(&mut self) {
        unsafe {
            SelectObject(self.hdc_dib, self.old_bm);
            let _ = DeleteObject(self.hbm_dib);
            let _ = DeleteDC(self.hdc_dib);
            if !self.hdc_screen.is_invalid() {
                ReleaseDC(None, self.hdc_screen);
            }
            if IsWindow(self.hwnd).as_bool() {
                let _ = DestroyWindow(self.hwnd);
            }
        }
    }
}

fn union_rect(a: RECT, b: RECT) -> RECT {
    RECT {
        left: a.left.min(b.left),
        top: a.top.min(b.top),
        right: a.right.max(b.right),
        bottom: a.bottom.max(b.bottom),
    }
}

#[inline]
fn feather_premul_pixel(px: u32, cov: u8) -> u32 {
    let c = cov as u32;
    let b = (((px & 0xFF) * c + 127) / 255) & 0xFF;
    let g = ((((px >> 8) & 0xFF) * c + 127) / 255) & 0xFF;
    let r = ((((px >> 16) & 0xFF) * c + 127) / 255) & 0xFF;
    let a = ((((px >> 24) & 0xFF) * c + 127) / 255) & 0xFF;
    b | (g << 8) | (r << 16) | (a << 24)
}

pub fn toggle_window_with_dock_animation(
    app: &tauri::AppHandle,
    hwnd: isize,
    anchor: Option<DockAnchorRect>,
    last_ext_fg: &std::sync::atomic::AtomicIsize,
    fg_is_other_trackable: impl Fn(HWND, HWND) -> bool,
    is_topmost_visible: impl Fn(HWND) -> bool,
    on_state_changed: impl Fn(),
) {
    let target = HWND(hwnd as *mut _);
    if hwnd == 0 || !unsafe { IsWindow(target).as_bool() } {
        return;
    }

    let anim_gen = ACTIVE_ANIM_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let genie_enabled = is_genie_animation_enabled();
    if let Some(ref a) = anchor {
        record_last_dock_anchor(a.clone());
    }
    let anchor_phys = if genie_enabled {
        anchor
            .as_ref()
            .and_then(|a| resolve_physical_anchor_rect(app, a))
    } else {
        None
    };

    let is_minimized = unsafe { IsIconic(target).as_bool() };
    let fg = unsafe { GetForegroundWindow() };
    let last_ext = last_ext_fg.load(Ordering::Relaxed);
    let should_minimize = !is_minimized
        && (fg == target
            || (!fg_is_other_trackable(fg, target)
                && (last_ext == hwnd || (last_ext == 0 && is_topmost_visible(target)))));

    if should_minimize {
        if genie_enabled
            && animate_minimize_hwnd(
                target,
                anim_gen,
                anchor_phys,
                last_ext_fg,
                &on_state_changed,
            )
        {
            return;
        }

        // Plain fallback when Genie animation is disabled or anchor/snapshot is unavailable
        crate::window_preview::capture_window_before_minimize(hwnd);
        unsafe {
            let _ = ShowWindowAsync(target, SW_MINIMIZE);
        }
        last_ext_fg.store(0, Ordering::Relaxed);
        on_state_changed();
        return;
    }

    // Restoring or bringing target window to foreground
    if is_minimized
        && genie_enabled
        && animate_restore_hwnd(
            target,
            hwnd,
            anim_gen,
            anchor_phys,
            last_ext_fg,
            &on_state_changed,
        )
    {
        return;
    }

    activate_and_restore_hwnd(target, is_minimized);
    last_ext_fg.store(hwnd, Ordering::Relaxed);
    on_state_changed();
}

pub fn restore_window_with_dock_animation(
    app: &tauri::AppHandle,
    hwnd: isize,
    anchor: Option<DockAnchorRect>,
    last_ext_fg: &std::sync::atomic::AtomicIsize,
    on_state_changed: impl Fn(),
) {
    let target = HWND(hwnd as *mut _);
    if hwnd == 0 || !unsafe { IsWindow(target).as_bool() } {
        return;
    }

    let anim_gen = ACTIVE_ANIM_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let genie_enabled = is_genie_animation_enabled();
    if let Some(ref a) = anchor {
        record_last_dock_anchor(a.clone());
    }
    let anchor_phys = if genie_enabled {
        anchor
            .as_ref()
            .and_then(|a| resolve_physical_anchor_rect(app, a))
    } else {
        None
    };
    let is_minimized = unsafe { IsIconic(target).as_bool() };

    if genie_enabled
        && animate_restore_hwnd(
        target,
        hwnd,
        anim_gen,
        anchor_phys,
        last_ext_fg,
        &on_state_changed,
    ) {
        return;
    }

    activate_and_restore_hwnd(target, is_minimized);
    last_ext_fg.store(hwnd, Ordering::Relaxed);
    on_state_changed();
}

fn animate_minimize_hwnd(
    target: HWND,
    anim_gen: u64,
    anchor_phys: Option<(RECT, DockEdge)>,
    last_ext_fg: &std::sync::atomic::AtomicIsize,
    on_state_changed: &impl Fn(),
) -> bool {
    let (Some((icon_rect, edge)), Some(win_rect)) =
        (anchor_phys, get_extended_window_rect(target))
    else {
        return false;
    };
    let Some(snap) = capture_window_snapshot(target, &win_rect) else {
        return false;
    };
    let active_guard = GenieActiveGuard::acquire();
    let u = union_rect(win_rect, icon_rect);
    let Some(mut surface) = AnimOverlaySurface::create(
        u.left,
        u.top,
        u.right - u.left + 4,
        u.bottom - u.top + 4,
    ) else {
        return false;
    };

    let initial_span =
        compute_genie_frame(win_rect, icon_rect, edge, snap.width, snap.height, 0.0, 0.0);
    surface.present_genie_frame(&snap, &initial_span, edge, 255);
    unsafe {
        let _ = DwmFlush();
    }

    let _guard = TransitionDisableGuard::acquire(target);
    unsafe {
        let _ = ShowWindowAsync(target, SW_MINIMIZE);
    }
    last_ext_fg.store(0, Ordering::Relaxed);

    let start = Instant::now();
    loop {
        if ACTIVE_ANIM_GEN.load(Ordering::Acquire) != anim_gen {
            break;
        }
        let raw_t =
            (start.elapsed().as_secs_f64() * 1000.0 / MINIMIZE_DURATION_MS).clamp(0.0, 1.0);
        let (far_p, funnel_p) = genie_progress_pair(raw_t, true);
        let span = compute_genie_frame(
            win_rect,
            icon_rect,
            edge,
            snap.width,
            snap.height,
            far_p,
            funnel_p,
        );
        let alpha = if raw_t > 0.72 {
            lerp_f(255.0, 32.0, (raw_t - 0.72) / 0.28).round() as u8
        } else {
            255
        };
        surface.present_genie_frame(&snap, &span, edge, alpha);
        if raw_t >= 1.0 {
            break;
        }
        wait_next_anim_frame();
    }
    drop(active_guard);
    on_state_changed();

    true
}

fn animate_restore_hwnd(
    target: HWND,
    hwnd: isize,
    anim_gen: u64,
    anchor_phys: Option<(RECT, DockEdge)>,
    last_ext_fg: &std::sync::atomic::AtomicIsize,
    on_state_changed: &impl Fn(),
) -> bool {
    let (Some((icon_rect, edge)), Some(dest_rect)) =
        (anchor_phys, resolve_restore_destination_rect(target))
    else {
        return false;
    };

    let snap = get_cached_snapshot(hwnd).unwrap_or_else(|| build_fallback_icon_snapshot(target));
    let active_guard = GenieActiveGuard::acquire();
    let u = union_rect(dest_rect, icon_rect);
    let Some(mut surface) = AnimOverlaySurface::create(
        u.left,
        u.top,
        u.right - u.left + 4,
        u.bottom - u.top + 4,
    ) else {
        return false;
    };

    let (start_far, start_funnel) = genie_progress_pair(0.0, false);
    let initial_span = compute_genie_frame(
        dest_rect,
        icon_rect,
        edge,
        snap.width,
        snap.height,
        start_far,
        start_funnel,
    );
    surface.present_genie_frame(&snap, &initial_span, edge, 110);
    unsafe {
        let _ = DwmFlush();
    }

    let _guard = TransitionDisableGuard::acquire(target);
    let mut restored_live = false;
    let start = Instant::now();

    loop {
        if ACTIVE_ANIM_GEN.load(Ordering::Acquire) != anim_gen {
            break;
        }
        let raw_t =
            (start.elapsed().as_secs_f64() * 1000.0 / RESTORE_DURATION_MS).clamp(0.0, 1.0);
        if raw_t >= 0.85 && !restored_live {
            restored_live = true;
            unsafe {
                let _ = ShowWindowAsync(target, SW_RESTORE);
            }
        }
        let (far_p, funnel_p) = genie_progress_pair(raw_t, false);
        let span = compute_genie_frame(
            dest_rect,
            icon_rect,
            edge,
            snap.width,
            snap.height,
            far_p,
            funnel_p,
        );
        let alpha = if raw_t < 0.12 {
            lerp_f(110.0, 255.0, raw_t / 0.12).round() as u8
        } else {
            255
        };
        surface.present_genie_frame(&snap, &span, edge, alpha);
        if raw_t >= 1.0 {
            break;
        }
        wait_next_anim_frame();
    }

    activate_and_restore_hwnd(target, !restored_live);
    last_ext_fg.store(hwnd, Ordering::Relaxed);
    unsafe {
        let _ = DwmFlush();
    }
    drop(surface);
    drop(active_guard);
    on_state_changed();

    true
}

fn activate_and_restore_hwnd(target: HWND, is_minimized: bool) {
    unsafe {
        use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};

        let fg = GetForegroundWindow();
        let fg_tid = windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(fg, None);
        let cur_tid = GetCurrentThreadId();
        let attached = if fg_tid != 0 && fg_tid != cur_tid {
            AttachThreadInput(cur_tid, fg_tid, true).as_bool()
        } else {
            false
        };

        if is_minimized {
            let _ = ShowWindowAsync(target, SW_RESTORE);
        }
        let _ = BringWindowToTop(target);
        let _ = SetForegroundWindow(target);

        if attached {
            let _ = AttachThreadInput(cur_tid, fg_tid, false);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_genie_progress_curve_bounds_and_funnel_lead() {
        let (far0, fun0) = genie_progress_pair(0.0, true);
        assert_eq!((far0, fun0), (0.0, 0.0));

        let (far_mid, fun_mid) = genie_progress_pair(0.35, true);
        assert!(fun_mid > far_mid, "funnel should lead far edge during minimize");

        let (far1, fun1) = genie_progress_pair(1.0, true);
        assert_eq!((far1, fun1), (1.0, 1.0));

        let (rf0, rfun0) = genie_progress_pair(0.0, false);
        assert_eq!((rf0, rfun0), (1.0, 1.0));
        let (rf1, rfun1) = genie_progress_pair(1.0, false);
        assert_eq!((rf1, rfun1), (0.0, 0.0));
    }

    #[test]
    fn test_compute_genie_frame_converges_to_icon_rect_on_all_edges() {
        let win = RECT {
            left: 100,
            top: 80,
            right: 1300,
            bottom: 900,
        };
        let icon = RECT {
            left: 880,
            top: 1020,
            right: 920,
            bottom: 1060,
        };

        for edge in [
            DockEdge::Bottom,
            DockEdge::Top,
            DockEdge::Left,
            DockEdge::Right,
        ] {
            let at_start = compute_genie_frame(win, icon, edge, 640, 440, 0.0, 0.0);
            assert_eq!(at_start.bounds.left, win.left);
            assert_eq!(at_start.bounds.top, win.top);

            let at_end = compute_genie_frame(win, icon, edge, 640, 440, 1.0, 1.0);
            assert_eq!(at_end.bounds.left, icon.left);
            assert_eq!(at_end.bounds.top, icon.top);
            assert_eq!(at_end.bounds.bottom, icon.bottom);
        }
    }

    #[test]
    fn test_compute_downscaled_dims_caps_size_preserving_aspect() {
        let (w, h) = compute_downscaled_dims(1920, 1080);
        assert_eq!((w, h), (1920, 1080));

        let (w4k, h4k) = compute_downscaled_dims(3840, 2160);
        assert!(w4k <= MAX_SNAP_W && h4k <= MAX_SNAP_H);
        assert_eq!(w4k, 2560);
        assert!((h4k - 1440).abs() <= 1);
    }
}
