use std::sync::atomic::{AtomicBool, Ordering};
use windows::Win32::Foundation::{BOOL, HWND};
use windows::Win32::Graphics::Dwm::{
    DwmEnableBlurBehindWindow, DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMSBT_NONE,
    DWMSBT_TRANSIENTWINDOW, DWMWA_BORDER_COLOR, DWMWA_SYSTEMBACKDROP_TYPE,
    DWMWA_USE_IMMERSIVE_DARK_MODE, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DWMWCP_ROUND,
    DWM_BB_BLURREGION, DWM_BB_ENABLE, DWM_BLURBEHIND, DWM_SYSTEMBACKDROP_TYPE,
    DWM_WINDOW_CORNER_PREFERENCE,
};
use windows::Win32::Graphics::Gdi::{CreateRectRgn, DeleteObject, HRGN};
use windows::Win32::UI::Controls::MARGINS;
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongW, SetWindowLongW, SetWindowPos, GWL_STYLE, SWP_FRAMECHANGED, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_CAPTION, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_SYSMENU,
    WS_THICKFRAME,
};

unsafe fn strip_caption_chrome_styles(hwnd: HWND) {
    let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
    let strip_mask =
        WS_CAPTION.0 | WS_THICKFRAME.0 | WS_MINIMIZEBOX.0 | WS_MAXIMIZEBOX.0 | WS_SYSMENU.0;
    let next_style = style & !strip_mask;
    if next_style != style {
        let _ = SetWindowLongW(hwnd, GWL_STYLE, next_style as i32);
        let _ = SetWindowPos(
            hwnd,
            HWND::default(),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}

const DWMWA_COLOR_NONE_RAW: u32 = 0xFFFFFFFE;

static CURRENT_THEME_IS_GLASS: AtomicBool = AtomicBool::new(false);
static CURRENT_THEME_IS_LIGHT: AtomicBool = AtomicBool::new(false);

pub fn set_shared_theme_hint(is_glass: bool, is_light: bool) {
    CURRENT_THEME_IS_GLASS.store(is_glass, Ordering::SeqCst);
    CURRENT_THEME_IS_LIGHT.store(is_light, Ordering::SeqCst);
}

pub fn get_shared_theme_hint() -> (bool, bool) {
    (
        CURRENT_THEME_IS_GLASS.load(Ordering::SeqCst),
        CURRENT_THEME_IS_LIGHT.load(Ordering::SeqCst),
    )
}

/// Applies or removes native Windows 11 Acrylic backdrop on an exact-fit WebView2 window (e.g., taskbar_flyout).
pub fn apply_flyout_backdrop(hwnd: HWND, is_glass: bool, is_light: bool) {
    if hwnd.0.is_null() {
        return;
    }
    unsafe {
        // Strip WS_CAPTION / min / max / sysmenu bits so DwmExtendFrameIntoClientArea never draws native - □ × buttons
        strip_caption_chrome_styles(hwnd);

        let dark_val: u32 = if is_light { 0 } else { 1 };
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &dark_val as *const _ as *const _,
            std::mem::size_of::<u32>() as u32,
        );

        let border_color = DWMWA_COLOR_NONE_RAW;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &border_color as *const _ as *const _,
            std::mem::size_of::<u32>() as u32,
        );

        if is_glass {
            // Release tao's empty-region transparency override so DWM system backdrop can paint Acrylic
            let bb = DWM_BLURBEHIND {
                dwFlags: DWM_BB_ENABLE,
                fEnable: BOOL(0),
                hRgnBlur: HRGN::default(),
                fTransitionOnMaximized: BOOL(0),
            };
            let _ = DwmEnableBlurBehindWindow(hwnd, &bb);

            let margins = MARGINS {
                cxLeftWidth: -1,
                cxRightWidth: -1,
                cyTopHeight: -1,
                cyBottomHeight: -1,
            };
            let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);

            let corner_pref: DWM_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &corner_pref as *const _ as *const _,
                std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
            );

            let backdrop: DWM_SYSTEMBACKDROP_TYPE = DWMSBT_TRANSIENTWINDOW;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_SYSTEMBACKDROP_TYPE,
                &backdrop as *const _ as *const _,
                std::mem::size_of::<DWM_SYSTEMBACKDROP_TYPE>() as u32,
            );
        } else {
            let backdrop: DWM_SYSTEMBACKDROP_TYPE = DWMSBT_NONE;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_SYSTEMBACKDROP_TYPE,
                &backdrop as *const _ as *const _,
                std::mem::size_of::<DWM_SYSTEMBACKDROP_TYPE>() as u32,
            );

            let corner_pref: DWM_WINDOW_CORNER_PREFERENCE = DWMWCP_DONOTROUND;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &corner_pref as *const _ as *const _,
                std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
            );

            let margins = MARGINS {
                cxLeftWidth: 0,
                cxRightWidth: 0,
                cyTopHeight: 0,
                cyBottomHeight: 0,
            };
            let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);

            // Restore tao's transparent region mask so CSS border-radius stays artifact-free in Solid mode
            let empty_rgn = CreateRectRgn(0, 0, -1, -1);
            let bb = DWM_BLURBEHIND {
                dwFlags: DWM_BB_ENABLE | DWM_BB_BLURREGION,
                fEnable: BOOL(1),
                hRgnBlur: empty_rgn,
                fTransitionOnMaximized: BOOL(0),
            };
            let _ = DwmEnableBlurBehindWindow(hwnd, &bb);
            let _ = DeleteObject(empty_rgn);
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub fn sync_navbar_backdrop(
    _enabled: bool,
    is_glass: bool,
    is_light: bool,
    _nav_hwnd: isize,
    _x: i32,
    _y: i32,
    _width: i32,
    _height: i32,
    _radius: i32,
) {
    set_shared_theme_hint(is_glass, is_light);
}

pub fn set_navbar_backdrop_hidden(hidden: bool) {
    crate::backdrop_blur::set_window_acrylic_hidden("navbar", hidden);
}

pub fn keep_backdrop_below_navbar(nav_hwnd: isize) {
    crate::backdrop_blur::keep_acrylic_below_window("navbar", nav_hwnd);
}
