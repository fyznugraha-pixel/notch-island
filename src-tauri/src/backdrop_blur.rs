#![allow(non_snake_case)]

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::mpsc::{self, Sender};
use std::sync::{Mutex, OnceLock};
use windows::core::{
    implement, interface, Interface, GUID, HRESULT, HSTRING, IUnknown, IUnknown_Vtbl, PCWSTR,
};
use windows::Foundation::Numerics::Vector2;
use windows::Foundation::{IPropertyValue, PropertyValue};
use windows::Graphics::Effects::{
    IGraphicsEffect, IGraphicsEffectSource, IGraphicsEffectSource_Impl, IGraphicsEffect_Impl,
};
use windows::UI::Composition::Desktop::DesktopWindowTarget;
use windows::UI::Composition::{
    CompositionEffectBrush, CompositionEffectSourceParameter, CompositionGeometricClip,
    CompositionRoundedRectangleGeometry, Compositor, SpriteVisual,
};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{BeginPaint, EndPaint, PAINTSTRUCT};
use windows::Win32::System::WinRT::Composition::ICompositorDesktopInterop;
use windows::Win32::System::WinRT::{
    DispatcherQueueOptions, DQTAT_COM_STA, DQTYPE_THREAD_CURRENT, RO_INIT_SINGLETHREADED,
    RoInitialize,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetWindowRect, IsWindow,
    IsWindowVisible, PeekMessageW, RegisterClassW, SetWindowPos, ShowWindow, TranslateMessage,
    HTTRANSPARENT, MA_NOACTIVATE, MSG, PM_REMOVE, SWP_NOACTIVATE, SWP_NOOWNERZORDER,
    SWP_NOSENDCHANGING, SWP_SHOWWINDOW, SW_HIDE, WM_ERASEBKGND, WM_MOUSEACTIVATE, WM_NCHITTEST,
    WM_PAINT, WNDCLASSW, WS_EX_NOACTIVATE, WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW,
    WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};

const DWMWA_NCRENDERING_POLICY: u32 = 2;
const DWMNCRP_DISABLED: u32 = 1;
const DWMWA_USE_HOSTBACKDROPBRUSH: u32 = 17;

#[link(name = "dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(
        hwnd: isize,
        dw_attribute: u32,
        pv_attribute: *const c_void,
        cb_attribute: u32,
    ) -> i32;
}

#[link(name = "coremessaging")]
extern "system" {
    fn CreateDispatcherQueueController(
        options: DispatcherQueueOptions,
        dispatcher_queue_controller: *mut *mut c_void,
    ) -> i32;
}

#[interface("2FC57384-A068-44D7-A331-30982FCF7177")]
unsafe trait IGraphicsEffectD2D1Interop: IUnknown {
    pub unsafe fn GetEffectId(&self, id: *mut GUID) -> HRESULT;
    pub unsafe fn GetNamedPropertyMapping(
        &self,
        name: PCWSTR,
        index: *mut u32,
        mapping: *mut u32,
    ) -> HRESULT;
    pub unsafe fn GetPropertyCount(&self, count: *mut u32) -> HRESULT;
    pub unsafe fn GetProperty(&self, index: u32, value: *mut *mut c_void) -> HRESULT;
    pub unsafe fn GetSource(&self, index: u32, source: *mut *mut c_void) -> HRESULT;
    pub unsafe fn GetSourceCount(&self, count: *mut u32) -> HRESULT;
}

#[implement(IGraphicsEffect, IGraphicsEffectSource, IGraphicsEffectD2D1Interop)]
struct GaussianBlurEffect {
    blur_amount: f32,
    source: IGraphicsEffectSource,
}

#[allow(non_snake_case)]
impl IGraphicsEffectSource_Impl for GaussianBlurEffect_Impl {}

#[allow(non_snake_case)]
impl IGraphicsEffect_Impl for GaussianBlurEffect_Impl {
    fn Name(&self) -> windows::core::Result<HSTRING> {
        Ok(HSTRING::from("GaussianBlur"))
    }
    fn SetName(&self, _name: &HSTRING) -> windows::core::Result<()> {
        Ok(())
    }
}

#[allow(non_snake_case)]
impl IGraphicsEffectD2D1Interop_Impl for GaussianBlurEffect_Impl {
    unsafe fn GetEffectId(&self, id: *mut GUID) -> HRESULT {
        // CLSID_D2D1GaussianBlur = 1feb6d69-2fe6-4ac9-8c58-1d7f93e7a6a5
        *id = GUID::from_u128(0x1feb6d69_2fe6_4ac9_8c58_1d7f93e7a6a5);
        HRESULT(0)
    }
    unsafe fn GetNamedPropertyMapping(
        &self,
        _name: PCWSTR,
        _index: *mut u32,
        _mapping: *mut u32,
    ) -> HRESULT {
        HRESULT(0x80004001u32 as i32) // E_NOTIMPL
    }
    unsafe fn GetPropertyCount(&self, count: *mut u32) -> HRESULT {
        *count = 3;
        HRESULT(0)
    }
    unsafe fn GetProperty(&self, index: u32, value: *mut *mut c_void) -> HRESULT {
        let prop_res: windows::core::Result<IPropertyValue> = match index {
            0 => PropertyValue::CreateSingle(self.blur_amount).and_then(|v| v.cast()),
            1 => PropertyValue::CreateUInt32(1).and_then(|v| v.cast()), // D2D1_GAUSSIANBLUR_OPTIMIZATION_BALANCED
            2 => PropertyValue::CreateUInt32(1).and_then(|v| v.cast()), // D2D1_BORDER_MODE_HARD
            _ => return HRESULT(0x80070057u32 as i32),
        };
        match prop_res {
            Ok(p) => {
                *value = p.into_raw();
                HRESULT(0)
            }
            Err(e) => e.code(),
        }
    }
    unsafe fn GetSource(&self, index: u32, source: *mut *mut c_void) -> HRESULT {
        if index == 0 {
            let s = self.source.clone();
            *source = Interface::into_raw(s);
            HRESULT(0)
        } else {
            HRESULT(0x80070057u32 as i32)
        }
    }
    unsafe fn GetSourceCount(&self, count: *mut u32) -> HRESULT {
        *count = 1;
        HRESULT(0)
    }
}

fn create_gaussian_backdrop_brush(
    comp: &Compositor,
    blur_strength: u32,
) -> Option<CompositionEffectBrush> {
    let blur_sigma = (blur_strength as f32 * 0.35).clamp(6.0, 36.0);
    let source_name = HSTRING::from("source");
    let src_param = CompositionEffectSourceParameter::Create(&source_name).ok()?;
    let src_iface: IGraphicsEffectSource = src_param.cast().ok()?;
    let blur_effect: IGraphicsEffect = GaussianBlurEffect {
        blur_amount: blur_sigma,
        source: src_iface,
    }
    .into();

    let factory = comp.CreateEffectFactory(&blur_effect).ok()?;
    let effect_brush = factory.CreateBrush().ok()?;
    let host_backdrop = comp.CreateHostBackdropBrush().ok()?;
    effect_brush
        .SetSourceParameter(&source_name, &host_backdrop)
        .ok()?;
    Some(effect_brush)
}

#[derive(Clone, Debug)]
pub struct AcrylicSyncRequest {
    pub label: String,
    pub parent_hwnd: isize,
    pub enabled: bool,
    pub container_left: f64,
    pub container_top: f64,
    pub width: f64,
    pub height: f64,
    pub ear_radius: f64,
    pub bottom_radius: f64,
    pub top_radius: f64,
    pub is_island: bool,
    pub position: String,
    pub dpr: f64,
    pub blur_strength: u32,
    pub opacity: f64,
    pub is_light: bool,
}

struct CompositionUnderlay {
    _target: DesktopWindowTarget,
    visual: SpriteVisual,
    rounded_rect: CompositionRoundedRectangleGeometry,
    _clip: CompositionGeometricClip,
}

struct UnderlaySlot {
    underlay_hwnd: isize,
    parent_hwnd: isize,
    visible: bool,
    comp: Option<CompositionUnderlay>,
    last_screen_x: i32,
    last_screen_y: i32,
    last_w: i32,
    last_h: i32,
    last_rb: i32,
    last_rt: i32,
    last_is_island: bool,
    last_position: String,
    last_blur_strength: u32,
    last_req: Option<AcrylicSyncRequest>,
}

static ACRYLIC_SENDER: OnceLock<Mutex<Sender<AcrylicSyncRequest>>> = OnceLock::new();

unsafe extern "system" fn underlay_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_ERASEBKGND => LRESULT(1),
        WM_NCHITTEST => LRESULT(HTTRANSPARENT as isize),
        WM_MOUSEACTIVATE => LRESULT(MA_NOACTIVATE as isize),
        WM_PAINT => {
            let mut ps = PAINTSTRUCT::default();
            let _ = BeginPaint(hwnd, &mut ps);
            let _ = EndPaint(hwnd, &ps);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn ensure_acrylic_worker() -> &'static Mutex<Sender<AcrylicSyncRequest>> {
    ACRYLIC_SENDER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<AcrylicSyncRequest>();
        std::thread::Builder::new()
            .name("gili-native-dwm-acrylic".to_string())
            .spawn(move || unsafe {
                let _ = RoInitialize(RO_INIT_SINGLETHREADED);

                let dq_options = DispatcherQueueOptions {
                    dwSize: std::mem::size_of::<DispatcherQueueOptions>() as u32,
                    threadType: DQTYPE_THREAD_CURRENT,
                    apartmentType: DQTAT_COM_STA,
                };
                let mut dq_controller: *mut c_void = std::ptr::null_mut();
                let _ = CreateDispatcherQueueController(dq_options, &mut dq_controller);
                let compositor = Compositor::new().ok();

                let class_name: Vec<u16> = "GiliNativeAcrylicUnderlay\0".encode_utf16().collect();
                let wc = WNDCLASSW {
                    lpfnWndProc: Some(underlay_wnd_proc),
                    lpszClassName: PCWSTR(class_name.as_ptr()),
                    ..Default::default()
                };
                let _ = RegisterClassW(&wc);

                let mut slots: HashMap<String, UnderlaySlot> = HashMap::new();

                loop {
                    let mut msg = MSG::default();
                    while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                        let _ = TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }

                    let first = rx.recv_timeout(std::time::Duration::from_millis(40));
                    let mut latest_by_label: HashMap<String, AcrylicSyncRequest> = HashMap::new();

                    if let Ok(req) = first {
                        latest_by_label.insert(req.label.clone(), req);
                        while let Ok(next_req) = rx.try_recv() {
                            latest_by_label.insert(next_req.label.clone(), next_req);
                        }
                    }

                    for (_, req) in latest_by_label {
                        apply_acrylic_sync(&class_name, compositor.as_ref(), &mut slots, req);
                    }

                    let mut stale_labels = Vec::new();
                    for (label, slot) in slots.iter_mut() {
                        let parent = HWND(slot.parent_hwnd as *mut c_void);
                        if slot.parent_hwnd == 0 || !IsWindow(parent).as_bool() {
                            slot.comp = None;
                            if slot.underlay_hwnd != 0 {
                                let _ = DestroyWindow(HWND(slot.underlay_hwnd as *mut c_void));
                                slot.underlay_hwnd = 0;
                            }
                            stale_labels.push(label.clone());
                            continue;
                        }

                        if slot.visible {
                            if !IsWindowVisible(parent).as_bool() {
                                let _ = ShowWindow(
                                    HWND(slot.underlay_hwnd as *mut c_void),
                                    SW_HIDE,
                                );
                                slot.visible = false;
                            } else if let Some(ref req) = slot.last_req {
                                let mut parent_rect = RECT::default();
                                if GetWindowRect(parent, &mut parent_rect).is_ok() {
                                    let dpr = req.dpr.max(1.0);
                                    let target_x = parent_rect.left
                                        + (req.container_left * dpr).round() as i32;
                                    let target_y = parent_rect.top
                                        + (req.container_top * dpr).round() as i32;
                                    if target_x != slot.last_screen_x
                                        || target_y != slot.last_screen_y
                                    {
                                        slot.last_screen_x = target_x;
                                        slot.last_screen_y = target_y;
                                        let _ = SetWindowPos(
                                            HWND(slot.underlay_hwnd as *mut c_void),
                                            parent,
                                            target_x,
                                            target_y,
                                            slot.last_w,
                                            slot.last_h,
                                            SWP_NOACTIVATE
                                                | SWP_NOOWNERZORDER
                                                | SWP_NOSENDCHANGING,
                                        );
                                    }
                                }
                            }
                        }
                    }

                    for k in stale_labels {
                        slots.remove(&k);
                    }
                }
            })
            .expect("failed to spawn gili-native-dwm-acrylic thread");
        Mutex::new(tx)
    })
}

unsafe fn create_underlay_window(
    class_name: &[u16],
    compositor: Option<&Compositor>,
    blur_strength: u32,
) -> (isize, Option<CompositionUnderlay>) {
    let ex_style = WS_EX_NOREDIRECTIONBITMAP
        | WS_EX_TOPMOST
        | WS_EX_TRANSPARENT
        | WS_EX_TOOLWINDOW
        | WS_EX_NOACTIVATE;
    let hwnd = CreateWindowExW(
        ex_style,
        PCWSTR(class_name.as_ptr()),
        PCWSTR::null(),
        WS_POPUP,
        0,
        0,
        1,
        1,
        None,
        None,
        None,
        None,
    )
    .unwrap_or_default();

    if hwnd.0.is_null() {
        return (0, None);
    }

    let hwnd_val = hwnd.0 as isize;
    let ncrp = DWMNCRP_DISABLED;
    let _ = DwmSetWindowAttribute(
        hwnd_val,
        DWMWA_NCRENDERING_POLICY,
        &ncrp as *const _ as *const c_void,
        std::mem::size_of::<u32>() as u32,
    );
    let use_host_backdrop: u32 = 1;
    let _ = DwmSetWindowAttribute(
        hwnd_val,
        DWMWA_USE_HOSTBACKDROPBRUSH,
        &use_host_backdrop as *const _ as *const c_void,
        std::mem::size_of::<u32>() as u32,
    );

    let comp_underlay = compositor.and_then(|comp| {
        let interop: ICompositorDesktopInterop = comp.cast().ok()?;
        let target = interop.CreateDesktopWindowTarget(hwnd, false).ok()?;
        let visual = comp.CreateSpriteVisual().ok()?;

        if let Some(effect_brush) = create_gaussian_backdrop_brush(comp, blur_strength) {
            visual.SetBrush(&effect_brush).ok()?;
        } else {
            let host_brush = comp.CreateHostBackdropBrush().ok()?;
            visual.SetBrush(&host_brush).ok()?;
        }

        let rounded_rect = comp.CreateRoundedRectangleGeometry().ok()?;
        let clip = comp.CreateGeometricClipWithGeometry(&rounded_rect).ok()?;
        visual.SetClip(&clip).ok()?;
        target.SetRoot(&visual).ok()?;

        Some(CompositionUnderlay {
            _target: target,
            visual,
            rounded_rect,
            _clip: clip,
        })
    });

    (hwnd_val, comp_underlay)
}

/// Computes `(offset_x, offset_y, size_w, size_h, corner_radius)` for `CompositionRoundedRectangleGeometry`
/// so that:
/// - In Island mode, all 4 corners are rounded with `r = max(rb, rt)`.
/// - In Anchored mode, the edge flush with the screen bezel is extended outward by `r` so it stays flat
///   against the bezel while the inner corners are smoothly rounded with exact radius `r = rb`.
pub fn compute_clipped_rounded_rect(
    phys_w: i32,
    phys_h: i32,
    rb: i32,
    rt: i32,
    is_island: bool,
    position: &str,
) -> (f32, f32, f32, f32, f32) {
    let wf = phys_w.max(1) as f32;
    let hf = phys_h.max(1) as f32;

    if is_island {
        let r = (rb.max(rt).max(0) as f32).min(wf * 0.5).min(hf * 0.5);
        return (0.0, 0.0, wf, hf, r);
    }

    let r = (rb.max(0) as f32).min(wf * 0.5).min(hf * 0.5);
    match position {
        "bottom" | "bottom-left" | "bottom-right" => (0.0, 0.0, wf, hf + r, r),
        "left" => (-r, 0.0, wf + r, hf, r),
        "right" => (0.0, 0.0, wf + r, hf, r),
        _ => (0.0, -r, wf, hf + r, r),
    }
}

unsafe fn apply_acrylic_sync(
    class_name: &[u16],
    compositor: Option<&Compositor>,
    slots: &mut HashMap<String, UnderlaySlot>,
    req: AcrylicSyncRequest,
) {
    let slot = slots.entry(req.label.clone()).or_insert_with(|| UnderlaySlot {
        underlay_hwnd: 0,
        parent_hwnd: req.parent_hwnd,
        visible: false,
        comp: None,
        last_screen_x: i32::MIN,
        last_screen_y: i32::MIN,
        last_w: 0,
        last_h: 0,
        last_rb: -1,
        last_rt: -1,
        last_is_island: false,
        last_position: String::new(),
        last_blur_strength: 0,
        last_req: None,
    });

    slot.parent_hwnd = req.parent_hwnd;
    let parent = HWND(req.parent_hwnd as *mut c_void);

    if !req.enabled
        || req.blur_strength <= 1
        || req.width <= 1.0
        || req.height <= 1.0
        || req.parent_hwnd == 0
        || !IsWindow(parent).as_bool()
        || !IsWindowVisible(parent).as_bool()
    {
        if slot.underlay_hwnd != 0 && slot.visible {
            let _ = ShowWindow(HWND(slot.underlay_hwnd as *mut c_void), SW_HIDE);
            slot.visible = false;
        }
        slot.last_req = Some(req);
        return;
    }

    if slot.underlay_hwnd == 0 || !IsWindow(HWND(slot.underlay_hwnd as *mut c_void)).as_bool() {
        let (hwnd_val, comp_underlay) =
            create_underlay_window(class_name, compositor, req.blur_strength);
        if hwnd_val == 0 {
            return;
        }
        slot.underlay_hwnd = hwnd_val;
        slot.comp = comp_underlay;
        slot.visible = false;
        slot.last_w = 0;
        slot.last_blur_strength = req.blur_strength;
    } else if (req.blur_strength as i32 - slot.last_blur_strength as i32).abs() >= 2 {
        if let (Some(comp), Some(ref underlay)) = (compositor, &slot.comp) {
            if let Some(effect_brush) = create_gaussian_backdrop_brush(comp, req.blur_strength) {
                let _ = underlay.visual.SetBrush(&effect_brush);
            }
        }
        slot.last_blur_strength = req.blur_strength;
    }

    let dpr = req.dpr.max(1.0);
    let phys_w = (req.width * dpr).round().max(1.0) as i32;
    let phys_h = (req.height * dpr).round().max(1.0) as i32;
    let rb = ((req.bottom_radius * dpr).round() as i32)
        .min(phys_w / 2)
        .min(phys_h / 2)
        .max(0);
    let rt = ((req.top_radius * dpr).round() as i32)
        .min(phys_w / 2)
        .min(phys_h / 2)
        .max(0);

    let mut parent_rect = RECT::default();
    if GetWindowRect(parent, &mut parent_rect).is_err() {
        return;
    }

    let screen_x = parent_rect.left + (req.container_left * dpr).round() as i32;
    let screen_y = parent_rect.top + (req.container_top * dpr).round() as i32;

    let shape_changed = phys_w != slot.last_w
        || phys_h != slot.last_h
        || rb != slot.last_rb
        || rt != slot.last_rt
        || req.is_island != slot.last_is_island
        || req.position != slot.last_position;

    if shape_changed {
        if let Some(ref comp) = slot.comp {
            let (ox, oy, sw, sh, cr) = compute_clipped_rounded_rect(
                phys_w,
                phys_h,
                rb,
                rt,
                req.is_island,
                &req.position,
            );
            let _ = comp.visual.SetSize(Vector2 {
                X: phys_w as f32,
                Y: phys_h as f32,
            });
            let _ = comp.rounded_rect.SetOffset(Vector2 { X: ox, Y: oy });
            let _ = comp.rounded_rect.SetSize(Vector2 { X: sw, Y: sh });
            let _ = comp
                .rounded_rect
                .SetCornerRadius(Vector2 { X: cr, Y: cr });
        }

        slot.last_w = phys_w;
        slot.last_h = phys_h;
        slot.last_rb = rb;
        slot.last_rt = rt;
        slot.last_is_island = req.is_island;
        slot.last_position = req.position.clone();
    }

    let pos_changed = !slot.visible
        || shape_changed
        || screen_x != slot.last_screen_x
        || screen_y != slot.last_screen_y;

    if pos_changed {
        let flags = SWP_NOACTIVATE
            | SWP_NOOWNERZORDER
            | SWP_NOSENDCHANGING
            | if !slot.visible {
                SWP_SHOWWINDOW
            } else {
                windows::Win32::UI::WindowsAndMessaging::SET_WINDOW_POS_FLAGS(0)
            };
        let _ = SetWindowPos(
            HWND(slot.underlay_hwnd as *mut c_void),
            parent,
            screen_x,
            screen_y,
            phys_w,
            phys_h,
            flags,
        );
        slot.visible = true;
        slot.last_screen_x = screen_x;
        slot.last_screen_y = screen_y;
    }

    slot.last_req = Some(req);
}

#[tauri::command]
pub fn sync_notch_acrylic(
    window: tauri::WebviewWindow,
    enabled: bool,
    container_left: f64,
    container_top: f64,
    width: f64,
    height: f64,
    ear_radius: f64,
    bottom_radius: f64,
    top_radius: f64,
    is_island: bool,
    position: String,
    dpr: f64,
    blur_strength: u32,
    opacity: f64,
    is_light: bool,
) {
    let parent_hwnd = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    if parent_hwnd == 0 {
        return;
    }

    let req = AcrylicSyncRequest {
        label: window.label().to_string(),
        parent_hwnd,
        enabled,
        container_left,
        container_top,
        width,
        height,
        ear_radius,
        bottom_radius,
        top_radius,
        is_island,
        position,
        dpr,
        blur_strength,
        opacity,
        is_light,
    };

    if let Ok(tx) = ensure_acrylic_worker().lock() {
        let _ = tx.send(req);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_composition_rounded_clip_and_underlay() {
        unsafe {
            let hr_ro = RoInitialize(RO_INIT_SINGLETHREADED);
            assert!(hr_ro.is_ok());
            let dq_options = DispatcherQueueOptions {
                dwSize: std::mem::size_of::<DispatcherQueueOptions>() as u32,
                threadType: DQTYPE_THREAD_CURRENT,
                apartmentType: DQTAT_COM_STA,
            };
            let mut dq_controller: *mut c_void = std::ptr::null_mut();
            let hr_dq = CreateDispatcherQueueController(dq_options, &mut dq_controller);
            assert_eq!(hr_dq, 0);
            let comp = Compositor::new().expect("Compositor::new() should succeed");

            let class_name: Vec<u16> = "GiliTestUnderlay\0".encode_utf16().collect();
            let wc = WNDCLASSW {
                lpfnWndProc: Some(underlay_wnd_proc),
                lpszClassName: PCWSTR(class_name.as_ptr()),
                ..Default::default()
            };
            let _ = RegisterClassW(&wc);
            let (hwnd_val, comp_underlay) = create_underlay_window(&class_name, Some(&comp), 50);
            assert_ne!(hwnd_val, 0);
            assert!(comp_underlay.is_some());
            if hwnd_val != 0 {
                let _ = DestroyWindow(HWND(hwnd_val as *mut c_void));
            }
        }
    }
}
