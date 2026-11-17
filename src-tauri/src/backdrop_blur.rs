#![allow(non_snake_case)]

use std::collections::{HashMap, HashSet};
use std::ffi::c_void;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use windows::core::{
    implement, interface, Interface, GUID, HRESULT, HSTRING, IUnknown, IUnknown_Vtbl, PCWSTR,
};
use windows::Foundation::Numerics::{Vector2, Vector3};
use windows::Foundation::{IPropertyValue, PropertyValue};
use windows::Graphics::Effects::{
    IGraphicsEffect, IGraphicsEffectSource, IGraphicsEffectSource_Impl, IGraphicsEffect_Impl,
};
use windows::Graphics::{IGeometrySource2D, IGeometrySource2D_Impl};
use windows::UI::Composition::Desktop::DesktopWindowTarget;
use windows::UI::Composition::{
    CompositionEffectBrush, CompositionEffectSourceParameter, CompositionGeometricClip,
    CompositionPath, CompositionPathGeometry, CompositionRoundedRectangleGeometry, Compositor,
    SpriteVisual, Visual,
};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Direct2D::Common::{
    D2D1_FIGURE_BEGIN_FILLED, D2D1_FIGURE_END_CLOSED, D2D_POINT_2F, D2D_SIZE_F,
};
use windows::Win32::Graphics::Direct2D::{
    D2D1CreateFactory, ID2D1Factory, ID2D1Geometry, D2D1_ARC_SEGMENT, D2D1_ARC_SIZE_SMALL,
    D2D1_FACTORY_TYPE_SINGLE_THREADED, D2D1_SWEEP_DIRECTION_CLOCKWISE,
    D2D1_SWEEP_DIRECTION_COUNTER_CLOCKWISE,
};
use windows::Win32::Graphics::Gdi::{BeginPaint, EndPaint, PAINTSTRUCT};
use windows::Win32::System::WinRT::Composition::ICompositorDesktopInterop;
use windows::Win32::System::WinRT::Graphics::Direct2D::{
    IGeometrySource2DInterop, IGeometrySource2DInterop_Impl,
};
use windows::Win32::System::WinRT::{
    DispatcherQueueOptions, DQTAT_COM_STA, DQTYPE_THREAD_CURRENT, RO_INIT_SINGLETHREADED,
    RoInitialize,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
    GetWindowLongW, GetWindowRect, IsWindow, IsWindowVisible, PeekMessageW, RegisterClassW,
    SetWindowPos, ShowWindow, TranslateMessage, GWL_STYLE, HTTRANSPARENT, MA_NOACTIVATE, MSG,
    PM_REMOVE, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOSENDCHANGING,
    SWP_SHOWWINDOW, SW_HIDE, WM_ERASEBKGND, WM_MOUSEACTIVATE, WM_NCHITTEST, WM_PAINT,
    WM_SETCURSOR, WNDCLASSW, WS_CHILD, WS_DISABLED, WS_EX_NOACTIVATE, WS_EX_NOREDIRECTIONBITMAP,
    WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
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

type HWINEVENTHOOK = *mut c_void;
type WinEventProc =
    unsafe extern "system" fn(HWINEVENTHOOK, u32, HWND, i32, i32, u32, u32);

#[link(name = "user32")]
extern "system" {
    fn SetWinEventHook(
        event_min: u32,
        event_max: u32,
        hmod_win_event_proc: *mut c_void,
        pfn_win_event_proc: Option<WinEventProc>,
        id_process: u32,
        id_thread: u32,
        dw_flags: u32,
    ) -> HWINEVENTHOOK;
}

const WINEVENT_OUTOFCONTEXT_SKIPOWN: u32 = 0x0002;
const EVENT_SYSTEM_FOREGROUND: u32 = 0x0003;
const EVENT_SYSTEM_MOVESIZEEND: u32 = 0x000B;
const EVENT_SYSTEM_MINIMIZESTART: u32 = 0x0016;
const EVENT_SYSTEM_MINIMIZEEND: u32 = 0x0017;
const EVENT_SYSTEM_DESKTOPSWITCH: u32 = 0x0020;
const EVENT_OBJECT_DESTROY: u32 = 0x8001;
const EVENT_OBJECT_SHOW: u32 = 0x8002;
const EVENT_OBJECT_HIDE: u32 = 0x8003;
const EVENT_OBJECT_REORDER: u32 = 0x8004;
const EVENT_OBJECT_LOCATIONCHANGE: u32 = 0x800B;
const EVENT_OBJECT_CLOAKED: u32 = 0x8017;
const EVENT_OBJECT_UNCLOAKED: u32 = 0x8018;
const OBJID_WINDOW: i32 = 0;
const CHILDID_SELF: i32 = 0;

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

fn blur_sigma_for_strength(blur_strength: u32) -> f32 {
    (blur_strength as f32 * 0.35).clamp(6.0, 36.0)
}

fn create_gaussian_backdrop_brush_with_sigma(
    comp: &Compositor,
    blur_sigma: f32,
) -> Option<CompositionEffectBrush> {
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

/// Alternating pair of subtly offset Gaussian blur brushes so swapping `SetBrush`
/// forces DWM (`dwmcore.dll`) to invalidate stale `HostBackdrop` tiles across the full pill.
struct BackdropBrushPair {
    brushes: [CompositionEffectBrush; 2],
    phase: usize,
}

impl BackdropBrushPair {
    fn new(comp: &Compositor, blur_strength: u32) -> Option<Self> {
        let base = blur_sigma_for_strength(blur_strength);
        let alt = if base + 0.03 <= 36.0 {
            base + 0.03
        } else {
            base - 0.03
        };
        let a = create_gaussian_backdrop_brush_with_sigma(comp, base)?;
        let b = create_gaussian_backdrop_brush_with_sigma(comp, alt)?;
        Some(Self {
            brushes: [a, b],
            phase: 0,
        })
    }

    fn current(&self) -> &CompositionEffectBrush {
        &self.brushes[self.phase]
    }

    fn cycle_on_visual(&mut self, comp: &Compositor, visual: &SpriteVisual) -> bool {
        self.phase = 1 - self.phase;
        let next = &self.brushes[self.phase];
        if let Ok(fresh_host) = comp.CreateHostBackdropBrush() {
            let source_name = HSTRING::from("source");
            let _ = next.SetSourceParameter(&source_name, &fresh_host);
        }
        visual.SetBrush(next).is_ok()
    }
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

#[implement(IGeometrySource2D, IGeometrySource2DInterop)]
struct D2DGeometrySource {
    geometry: ID2D1Geometry,
}

impl IGeometrySource2D_Impl for D2DGeometrySource_Impl {}

impl IGeometrySource2DInterop_Impl for D2DGeometrySource_Impl {
    fn GetGeometry(&self) -> windows::core::Result<ID2D1Geometry> {
        Ok(self.geometry.clone())
    }

    fn TryGetGeometryUsingFactory(
        &self,
        factory: Option<&ID2D1Factory>,
    ) -> windows::core::Result<ID2D1Geometry> {
        let _ = factory;
        Ok(self.geometry.clone())
    }
}

struct CompositionUnderlay {
    target: DesktopWindowTarget,
    visual: SpriteVisual,
    rounded_rect: CompositionRoundedRectangleGeometry,
    clip: CompositionGeometricClip,
    use_path_clip: bool,
    brush_pair: Option<BackdropBrushPair>,
    opacity_phase: bool,
    phys_w: i32,
    phys_h: i32,
    ox: f32,
    oy: f32,
    sw: f32,
    sh: f32,
    cr: f32,
    blur_strength: u32,
}

impl CompositionUnderlay {
    fn refresh_backdrop(
        &mut self,
        comp: &Compositor,
        underlay_hwnd: isize,
        parent_hwnd: isize,
        screen_x: i32,
        screen_y: i32,
        force_revalidate: bool,
    ) -> bool {
        self.opacity_phase = !self.opacity_phase;
        let eps: f32 = if self.opacity_phase { 0.25 } else { 0.0 };
        let _ = self
            .visual
            .SetOpacity(if self.opacity_phase { 0.996 } else { 1.0 });

        if self.phys_w > 0 && self.phys_h > 0 {
            let _ = self.visual.SetOffset(Vector3 {
                X: eps,
                Y: 0.0,
                Z: 0.0,
            });
            let _ = self.visual.SetSize(Vector2 {
                X: (self.phys_w as f32 - eps).max(1.0),
                Y: self.phys_h as f32,
            });
        }
        if !self.use_path_clip && self.sw > 0.0 && self.sh > 0.0 {
            let _ = self.rounded_rect.SetOffset(Vector2 {
                X: self.ox + eps,
                Y: self.oy,
            });
            let _ = self.rounded_rect.SetSize(Vector2 {
                X: (self.sw - eps).max(1.0),
                Y: self.sh,
            });
            let _ = self.rounded_rect.SetCornerRadius(Vector2 {
                X: self.cr,
                Y: self.cr,
            });
        }

        if force_revalidate {
            if underlay_hwnd != 0 {
                unsafe {
                    let disable_host_backdrop: u32 = 0;
                    let _ = DwmSetWindowAttribute(
                        underlay_hwnd,
                        DWMWA_USE_HOSTBACKDROPBRUSH,
                        &disable_host_backdrop as *const _ as *const c_void,
                        std::mem::size_of::<u32>() as u32,
                    );
                    let enable_host_backdrop: u32 = 1;
                    let _ = DwmSetWindowAttribute(
                        underlay_hwnd,
                        DWMWA_USE_HOSTBACKDROPBRUSH,
                        &enable_host_backdrop as *const _ as *const c_void,
                        std::mem::size_of::<u32>() as u32,
                    );
                    if parent_hwnd != 0 && self.phys_w > 0 && self.phys_h > 0 {
                        let _ = SetWindowPos(
                            HWND(underlay_hwnd as *mut c_void),
                            HWND(parent_hwnd as *mut c_void),
                            screen_x,
                            screen_y,
                            self.phys_w,
                            self.phys_h,
                            SWP_NOACTIVATE
                                | SWP_NOOWNERZORDER
                                | SWP_NOSENDCHANGING
                                | SWP_FRAMECHANGED,
                        );
                    }
                }
            }

            let _ = self.target.SetRoot(None::<&Visual>);
            let _ = self.target.SetRoot(&self.visual);

            let sigma = blur_sigma_for_strength(self.blur_strength);
            if let Some(fresh_brush) = create_gaussian_backdrop_brush_with_sigma(comp, sigma) {
                self.brush_pair = BackdropBrushPair::new(comp, self.blur_strength);
                return self.visual.SetBrush(&fresh_brush).is_ok();
            }
        }

        if let Some(ref mut pair) = self.brush_pair {
            return pair.cycle_on_visual(comp, &self.visual);
        }
        if let Ok(host_brush) = comp.CreateHostBackdropBrush() {
            return self.visual.SetBrush(&host_brush).is_ok();
        }
        false
    }
}

unsafe fn commit_composition(compositor: Option<&Compositor>) {
    if let Some(comp) = compositor {
        let _ = comp.RequestCommitAsync();
    }
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
    last_re: i32,
    last_rb: i32,
    last_rt: i32,
    last_is_island: bool,
    last_position: String,
    last_blur_strength: u32,
    last_req: Option<AcrylicSyncRequest>,
}

enum AcrylicCommand {
    Sync(AcrylicSyncRequest),
    SetHidden { label: String, hidden: bool },
    KeepBelow { label: String, parent_hwnd: isize },
    InvalidateBackdrop,
}

static ACRYLIC_SENDER: OnceLock<Mutex<Sender<AcrylicCommand>>> = OnceLock::new();
static BACKDROP_INVALIDATE_TX: OnceLock<Sender<AcrylicCommand>> = OnceLock::new();
static WINEVENT_EPOCH: OnceLock<Instant> = OnceLock::new();
static LAST_WINEVENT_SIGNAL_MS: AtomicU64 = AtomicU64::new(0);

unsafe extern "system" fn backdrop_win_event_proc(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    id_child: i32,
    _id_event_thread: u32,
    _dwms_event_time: u32,
) {
    let relevant_system = matches!(
        event,
        EVENT_SYSTEM_FOREGROUND
            | EVENT_SYSTEM_MOVESIZEEND
            | EVENT_SYSTEM_MINIMIZESTART
            | EVENT_SYSTEM_MINIMIZEEND
            | EVENT_SYSTEM_DESKTOPSWITCH
    );
    let discrete_object = matches!(
        event,
        EVENT_OBJECT_DESTROY
            | EVENT_OBJECT_SHOW
            | EVENT_OBJECT_HIDE
            | EVENT_OBJECT_REORDER
            | EVENT_OBJECT_CLOAKED
            | EVENT_OBJECT_UNCLOAKED
    ) && id_object == OBJID_WINDOW
        && id_child == CHILDID_SELF
        && !hwnd.0.is_null()
        && (matches!(
            event,
            EVENT_OBJECT_DESTROY
                | EVENT_OBJECT_HIDE
                | EVENT_OBJECT_CLOAKED
                | EVENT_OBJECT_UNCLOAKED
        ) || (IsWindow(hwnd).as_bool()
            && (GetWindowLongW(hwnd, GWL_STYLE) as u32 & WS_CHILD.0) == 0));
    let location_object = event == EVENT_OBJECT_LOCATIONCHANGE
        && id_object == OBJID_WINDOW
        && id_child == CHILDID_SELF
        && !hwnd.0.is_null()
        && IsWindow(hwnd).as_bool()
        && (GetWindowLongW(hwnd, GWL_STYLE) as u32 & WS_CHILD.0) == 0;

    if !relevant_system && !discrete_object && !location_object {
        return;
    }

    if event == EVENT_SYSTEM_FOREGROUND && !hwnd.0.is_null() {
        crate::window_preview::on_foreground_window_observed(hwnd.0 as isize);
        crate::navbar_window::on_external_foreground_observed(hwnd.0 as isize);
    } else if event == EVENT_SYSTEM_MINIMIZESTART && !hwnd.0.is_null() {
        crate::window_preview::on_window_minimizing_observed(hwnd.0 as isize);
        crate::window_dock_anim::on_window_minimizing_observed(hwnd.0 as isize);
    }

    if relevant_system || discrete_object || location_object {
        crate::navbar_window::request_overlap_recheck();
    }

    if !relevant_system && !discrete_object {
        let now_ms = WINEVENT_EPOCH
            .get_or_init(Instant::now)
            .elapsed()
            .as_millis() as u64;
        let prev_ms = LAST_WINEVENT_SIGNAL_MS.load(Ordering::Relaxed);
        if now_ms.saturating_sub(prev_ms) < 60 {
            return;
        }
        LAST_WINEVENT_SIGNAL_MS.store(now_ms, Ordering::Relaxed);
    }

    if crate::window_dock_anim::is_genie_animating() {
        return;
    }

    if let Some(tx) = BACKDROP_INVALIDATE_TX.get() {
        let _ = tx.send(AcrylicCommand::InvalidateBackdrop);
    }
}

fn spawn_backdrop_winevent_watcher(tx: Sender<AcrylicCommand>) {
    let _ = BACKDROP_INVALIDATE_TX.set(tx);
    let _ = WINEVENT_EPOCH.get_or_init(Instant::now);

    let _ = std::thread::Builder::new()
        .name("gili-backdrop-winevent".to_string())
        .spawn(|| unsafe {
            let sys_hook = SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_DESKTOPSWITCH,
                std::ptr::null_mut(),
                Some(backdrop_win_event_proc),
                0,
                0,
                WINEVENT_OUTOFCONTEXT_SKIPOWN,
            );
            let obj_hook = SetWinEventHook(
                EVENT_OBJECT_DESTROY,
                EVENT_OBJECT_UNCLOAKED,
                std::ptr::null_mut(),
                Some(backdrop_win_event_proc),
                0,
                0,
                WINEVENT_OUTOFCONTEXT_SKIPOWN,
            );
            if sys_hook.is_null() && obj_hook.is_null() {
                return;
            }
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, HWND::default(), 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
}

unsafe fn drain_thread_messages() {
    let mut msg = MSG::default();
    while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
        let _ = TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
}

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
        WM_SETCURSOR => LRESULT(1),
        WM_PAINT => {
            let mut ps = PAINTSTRUCT::default();
            let _ = BeginPaint(hwnd, &mut ps);
            let _ = EndPaint(hwnd, &ps);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn ensure_acrylic_worker() -> &'static Mutex<Sender<AcrylicCommand>> {
    ACRYLIC_SENDER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<AcrylicCommand>();
        spawn_backdrop_winevent_watcher(tx.clone());
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
                let d2d_factory: Option<ID2D1Factory> =
                    D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, None).ok();

                let class_name: Vec<u16> = "GiliNativeAcrylicUnderlay\0".encode_utf16().collect();
                let wc = WNDCLASSW {
                    lpfnWndProc: Some(underlay_wnd_proc),
                    lpszClassName: PCWSTR(class_name.as_ptr()),
                    ..Default::default()
                };
                let _ = RegisterClassW(&wc);

                let mut slots: HashMap<String, UnderlaySlot> = HashMap::new();
                let mut hidden_labels: HashSet<String> = HashSet::new();
                let mut burst_until: Option<Instant> = None;
                let mut last_refresh = Instant::now();

                loop {
                    drain_thread_messages();

                    let any_visible = slots.values().any(|s| s.visible && s.comp.is_some());
                    let in_burst = burst_until.is_some_and(|t| Instant::now() < t);
                    let wait_ms = if !any_visible {
                        200
                    } else if in_burst {
                        35
                    } else {
                        45
                    };

                    let first = rx.recv_timeout(Duration::from_millis(wait_ms));
                    let mut latest_by_label: HashMap<String, AcrylicSyncRequest> = HashMap::new();
                    let mut restack_requests: HashMap<String, isize> = HashMap::new();
                    let mut invalidated = false;

                    let mut handle_cmd = |cmd: AcrylicCommand| match cmd {
                        AcrylicCommand::Sync(req) => {
                            latest_by_label.insert(req.label.clone(), req);
                        }
                        AcrylicCommand::SetHidden { label, hidden } => {
                            if hidden {
                                hidden_labels.insert(label.clone());
                                if let Some(slot) = slots.get_mut(&label) {
                                    if slot.underlay_hwnd != 0 && slot.visible {
                                        let _ = ShowWindow(
                                            HWND(slot.underlay_hwnd as *mut c_void),
                                            SW_HIDE,
                                        );
                                        slot.visible = false;
                                    }
                                }
                            } else if hidden_labels.remove(&label) {
                                invalidated = true;
                                if !latest_by_label.contains_key(&label) {
                                    if let Some(last_req) =
                                        slots.get(&label).and_then(|s| s.last_req.clone())
                                    {
                                        latest_by_label.insert(label, last_req);
                                    }
                                }
                            }
                        }
                        AcrylicCommand::KeepBelow { label, parent_hwnd } => {
                            restack_requests.insert(label, parent_hwnd);
                        }
                        AcrylicCommand::InvalidateBackdrop => {
                            invalidated = true;
                        }
                    };

                    if let Ok(cmd) = first {
                        handle_cmd(cmd);
                        while let Ok(next_cmd) = rx.try_recv() {
                            handle_cmd(next_cmd);
                        }
                    }

                    if invalidated {
                        burst_until = Some(Instant::now() + Duration::from_millis(950));
                    }

                    let mut updated = false;
                    let mut became_visible = false;
                    for (_, req) in latest_by_label {
                        let is_hidden = hidden_labels.contains(&req.label);
                        let outcome = apply_acrylic_sync(
                            &class_name,
                            compositor.as_ref(),
                            d2d_factory.as_ref(),
                            &mut slots,
                            req,
                            is_hidden,
                        );
                        if outcome.mutated {
                            updated = true;
                        }
                        if outcome.became_visible {
                            became_visible = true;
                        }
                    }
                    if became_visible {
                        invalidated = true;
                        burst_until = Some(Instant::now() + Duration::from_millis(950));
                    }

                    for (label, parent_hwnd) in restack_requests {
                        if let Some(slot) = slots.get(&label) {
                            if slot.visible && slot.underlay_hwnd != 0 && parent_hwnd != 0 {
                                let _ = SetWindowPos(
                                    HWND(slot.underlay_hwnd as *mut c_void),
                                    HWND(parent_hwnd as *mut c_void),
                                    0,
                                    0,
                                    0,
                                    0,
                                    windows::Win32::UI::WindowsAndMessaging::SWP_NOMOVE
                                        | windows::Win32::UI::WindowsAndMessaging::SWP_NOSIZE
                                        | SWP_NOACTIVATE
                                        | SWP_NOOWNERZORDER
                                        | SWP_NOSENDCHANGING,
                                );
                            }
                        }
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
                            let layout = compute_acrylic_surface_layout(req);
                            let target_x = parent_rect.left
                                + (req.container_left * dpr).round() as i32
                                + layout.off_x_px;
                            let target_y = parent_rect.top
                                + (req.container_top * dpr).round() as i32
                                + layout.off_y_px;
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

                    let now = Instant::now();
                    let burst_active = burst_until.is_some_and(|t| now < t);
                    let burst_expired = burst_until.is_some_and(|t| now >= t);
                    let any_visible_now = slots.values().any(|s| s.visible && s.comp.is_some());
                    let refresh_due = invalidated
                        || burst_expired
                        || (burst_active && last_refresh.elapsed() >= Duration::from_millis(85))
                        || (any_visible_now && last_refresh.elapsed() >= Duration::from_millis(650));

                    if burst_expired {
                        burst_until = None;
                    }

                    if refresh_due {
                        if let Some(ref comp) = compositor {
                            let force_revalidate =
                                invalidated || became_visible || burst_active || burst_expired;
                            let mut refreshed_any = false;
                            for slot in slots.values_mut() {
                                if slot.visible {
                                    let screen_x = if slot.last_screen_x != i32::MIN {
                                        slot.last_screen_x
                                    } else {
                                        0
                                    };
                                    let screen_y = if slot.last_screen_y != i32::MIN {
                                        slot.last_screen_y
                                    } else {
                                        0
                                    };
                                    if let Some(ref mut underlay) = slot.comp {
                                        if underlay.refresh_backdrop(
                                            comp,
                                            slot.underlay_hwnd,
                                            slot.parent_hwnd,
                                            screen_x,
                                            screen_y,
                                            force_revalidate,
                                        ) {
                                            refreshed_any = true;
                                        }
                                    }
                                }
                            }
                            if refreshed_any {
                                updated = true;
                                last_refresh = now;
                            }
                        }
                    }

                    if updated {
                        commit_composition(compositor.as_ref());
                    }
                    drain_thread_messages();
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
        WS_POPUP | WS_DISABLED,
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

        let brush_pair = BackdropBrushPair::new(comp, blur_strength);
        if let Some(ref pair) = brush_pair {
            visual.SetBrush(pair.current()).ok()?;
        } else {
            let host_brush = comp.CreateHostBackdropBrush().ok()?;
            visual.SetBrush(&host_brush).ok()?;
        }

        let rounded_rect = comp.CreateRoundedRectangleGeometry().ok()?;
        let clip = comp.CreateGeometricClipWithGeometry(&rounded_rect).ok()?;
        visual.SetClip(&clip).ok()?;
        target.SetRoot(&visual).ok()?;

        Some(CompositionUnderlay {
            target,
            visual,
            rounded_rect,
            clip,
            use_path_clip: false,
            brush_pair,
            opacity_phase: false,
            phys_w: 0,
            phys_h: 0,
            ox: 0.0,
            oy: 0.0,
            sw: 0.0,
            sh: 0.0,
            cr: 0.0,
            blur_strength,
        })
    });

    (hwnd_val, comp_underlay)
}

/// Computes `(offset_x, offset_y, size_w, size_h, corner_radius)` for `CompositionRoundedRectangleGeometry`
/// so that:
/// - In Island mode, all 4 corners are rounded with `r = max(rb, rt)`.
/// - In Anchored mode, the edge flush with the screen bezel is extended outward by `r` so it stays flat
///   against the bezel while the inner corners are smoothly rounded with exact radius `r = rb`.
struct AcrylicSurfaceLayout {
    body_w_px: i32,
    body_h_px: i32,
    off_x_px: i32,
    off_y_px: i32,
    total_w_px: i32,
    total_h_px: i32,
    re_px: i32,
    rb_px: i32,
    rt_px: i32,
}

fn compute_acrylic_surface_layout(req: &AcrylicSyncRequest) -> AcrylicSurfaceLayout {
    let dpr = req.dpr.max(1.0);
    let body_w_px = (req.width * dpr).round().max(1.0) as i32;
    let body_h_px = (req.height * dpr).round().max(1.0) as i32;
    let rb_px = ((req.bottom_radius * dpr).round() as i32)
        .min(body_w_px / 2)
        .min(body_h_px / 2)
        .max(0);
    let rt_px = ((req.top_radius * dpr).round() as i32)
        .min(body_w_px / 2)
        .min(body_h_px / 2)
        .max(0);

    let re_px = if req.is_island || req.ear_radius <= 0.5 {
        0
    } else {
        let is_side = matches!(req.position.as_str(), "left" | "right");
        let max_along = if is_side {
            (body_w_px - rb_px).max(0)
        } else {
            (body_h_px - rb_px).max(0)
        };
        let max_cap = (48.0 * dpr).round() as i32;
        ((req.ear_radius * dpr).round() as i32)
            .min(max_along)
            .min(max_cap)
            .max(0)
    };

    if re_px == 0 {
        return AcrylicSurfaceLayout {
            body_w_px,
            body_h_px,
            off_x_px: 0,
            off_y_px: 0,
            total_w_px: body_w_px,
            total_h_px: body_h_px,
            re_px: 0,
            rb_px,
            rt_px,
        };
    }

    let (off_x_px, off_y_px, total_w_px, total_h_px) = match req.position.as_str() {
        "left" | "right" => (0, -re_px, body_w_px, body_h_px + 2 * re_px),
        "top-left" | "bottom-left" => (0, 0, body_w_px + re_px, body_h_px),
        "top-right" | "bottom-right" => (-re_px, 0, body_w_px + re_px, body_h_px),
        _ => (-re_px, 0, body_w_px + 2 * re_px, body_h_px),
    };

    AcrylicSurfaceLayout {
        body_w_px,
        body_h_px,
        off_x_px,
        off_y_px,
        total_w_px,
        total_h_px,
        re_px,
        rb_px,
        rt_px,
    }
}

fn d2d_pt(x: f32, y: f32) -> D2D_POINT_2F {
    D2D_POINT_2F { x, y }
}

fn d2d_arc(end: (f32, f32), radius: f32, clockwise: bool) -> D2D1_ARC_SEGMENT {
    D2D1_ARC_SEGMENT {
        point: d2d_pt(end.0, end.1),
        size: D2D_SIZE_F {
            width: radius,
            height: radius,
        },
        rotationAngle: 0.0,
        sweepDirection: if clockwise {
            D2D1_SWEEP_DIRECTION_CLOCKWISE
        } else {
            D2D1_SWEEP_DIRECTION_COUNTER_CLOCKWISE
        },
        arcSize: D2D1_ARC_SIZE_SMALL,
    }
}

fn build_concave_ear_path_geometry(
    d2d_factory: &ID2D1Factory,
    comp: &Compositor,
    layout: &AcrylicSurfaceLayout,
    position: &str,
) -> Option<CompositionPathGeometry> {
    if layout.re_px <= 0 {
        return None;
    }
    let w = layout.body_w_px as f32;
    let h = layout.body_h_px as f32;
    let re = layout.re_px as f32;
    let rb = layout.rb_px as f32;
    let tw = layout.total_w_px as f32;
    let th = layout.total_h_px as f32;

    unsafe {
        let d2d_path = d2d_factory.CreatePathGeometry().ok()?;
        let sink = d2d_path.Open().ok()?;

        match position {
            "left" => {
                let bt = re;
                let bb = re + h;
                sink.BeginFigure(d2d_pt(0.0, 0.0), D2D1_FIGURE_BEGIN_FILLED);
                sink.AddArc(&d2d_arc((re, bt), re, false));
                sink.AddLine(d2d_pt(w - rb, bt));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((w, bt + rb), rb, true));
                } else {
                    sink.AddLine(d2d_pt(w, bt));
                }
                sink.AddLine(d2d_pt(w, bb - rb));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((w - rb, bb), rb, true));
                } else {
                    sink.AddLine(d2d_pt(w, bb));
                }
                sink.AddLine(d2d_pt(re, bb));
                sink.AddArc(&d2d_arc((0.0, th), re, false));
            }
            "right" => {
                let bt = re;
                let bb = re + h;
                sink.BeginFigure(d2d_pt(w, 0.0), D2D1_FIGURE_BEGIN_FILLED);
                sink.AddArc(&d2d_arc((w - re, bt), re, true));
                sink.AddLine(d2d_pt(rb, bt));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((0.0, bt + rb), rb, false));
                } else {
                    sink.AddLine(d2d_pt(0.0, bt));
                }
                sink.AddLine(d2d_pt(0.0, bb - rb));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((rb, bb), rb, false));
                } else {
                    sink.AddLine(d2d_pt(0.0, bb));
                }
                sink.AddLine(d2d_pt(w - re, bb));
                sink.AddArc(&d2d_arc((w, th), re, true));
            }
            "top-left" => {
                let br = w;
                sink.BeginFigure(d2d_pt(0.0, 0.0), D2D1_FIGURE_BEGIN_FILLED);
                sink.AddLine(d2d_pt(tw, 0.0));
                sink.AddArc(&d2d_arc((br, re), re, false));
                sink.AddLine(d2d_pt(br, h - rb));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((br - rb, h), rb, true));
                } else {
                    sink.AddLine(d2d_pt(br, h));
                }
                sink.AddLine(d2d_pt(rb, h));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((0.0, h - rb), rb, true));
                } else {
                    sink.AddLine(d2d_pt(0.0, h));
                }
                sink.AddLine(d2d_pt(0.0, 0.0));
            }
            "top-right" => {
                let bl = re;
                sink.BeginFigure(d2d_pt(0.0, 0.0), D2D1_FIGURE_BEGIN_FILLED);
                sink.AddLine(d2d_pt(tw, 0.0));
                sink.AddLine(d2d_pt(tw, h - rb));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((tw - rb, h), rb, true));
                } else {
                    sink.AddLine(d2d_pt(tw, h));
                }
                sink.AddLine(d2d_pt(bl + rb, h));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((bl, h - rb), rb, true));
                } else {
                    sink.AddLine(d2d_pt(bl, h));
                }
                sink.AddLine(d2d_pt(bl, re));
                sink.AddArc(&d2d_arc((0.0, 0.0), re, false));
            }
            "bottom-left" => {
                let br = w;
                sink.BeginFigure(d2d_pt(0.0, h), D2D1_FIGURE_BEGIN_FILLED);
                sink.AddLine(d2d_pt(tw, h));
                sink.AddArc(&d2d_arc((br, h - re), re, true));
                sink.AddLine(d2d_pt(br, rb));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((br - rb, 0.0), rb, false));
                } else {
                    sink.AddLine(d2d_pt(br, 0.0));
                }
                sink.AddLine(d2d_pt(rb, 0.0));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((0.0, rb), rb, false));
                } else {
                    sink.AddLine(d2d_pt(0.0, 0.0));
                }
                sink.AddLine(d2d_pt(0.0, h));
            }
            "bottom-right" => {
                let bl = re;
                sink.BeginFigure(d2d_pt(0.0, h), D2D1_FIGURE_BEGIN_FILLED);
                sink.AddLine(d2d_pt(tw, h));
                sink.AddLine(d2d_pt(tw, rb));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((tw - rb, 0.0), rb, false));
                } else {
                    sink.AddLine(d2d_pt(tw, 0.0));
                }
                sink.AddLine(d2d_pt(bl + rb, 0.0));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((bl, rb), rb, false));
                } else {
                    sink.AddLine(d2d_pt(bl, 0.0));
                }
                sink.AddLine(d2d_pt(bl, h - re));
                sink.AddArc(&d2d_arc((0.0, h), re, true));
            }
            "top" => {
                let bl = re;
                let br = re + w;
                sink.BeginFigure(d2d_pt(0.0, 0.0), D2D1_FIGURE_BEGIN_FILLED);
                sink.AddLine(d2d_pt(tw, 0.0));
                sink.AddArc(&d2d_arc((br, re), re, false));
                sink.AddLine(d2d_pt(br, h - rb));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((br - rb, h), rb, true));
                } else {
                    sink.AddLine(d2d_pt(br, h));
                }
                sink.AddLine(d2d_pt(bl + rb, h));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((bl, h - rb), rb, true));
                } else {
                    sink.AddLine(d2d_pt(bl, h));
                }
                sink.AddLine(d2d_pt(bl, re));
                sink.AddArc(&d2d_arc((0.0, 0.0), re, false));
            }
            _ => {
                // "bottom"
                let bl = re;
                let br = re + w;
                sink.BeginFigure(d2d_pt(0.0, h), D2D1_FIGURE_BEGIN_FILLED);
                sink.AddLine(d2d_pt(tw, h));
                sink.AddArc(&d2d_arc((br, h - re), re, true));
                sink.AddLine(d2d_pt(br, rb));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((br - rb, 0.0), rb, false));
                } else {
                    sink.AddLine(d2d_pt(br, 0.0));
                }
                sink.AddLine(d2d_pt(bl + rb, 0.0));
                if rb > 0.0 {
                    sink.AddArc(&d2d_arc((bl, rb), rb, false));
                } else {
                    sink.AddLine(d2d_pt(bl, 0.0));
                }
                sink.AddLine(d2d_pt(bl, h - re));
                sink.AddArc(&d2d_arc((0.0, h), re, true));
            }
        }

        sink.EndFigure(D2D1_FIGURE_END_CLOSED);
        sink.Close().ok()?;

        let source: IGeometrySource2D = D2DGeometrySource {
            geometry: d2d_path.into(),
        }
        .into();
        let comp_path = CompositionPath::Create(&source).ok()?;
        comp.CreatePathGeometryWithPath(&comp_path).ok()
    }
}

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

struct SyncOutcome {
    became_visible: bool,
    mutated: bool,
}

unsafe fn apply_acrylic_sync(
    class_name: &[u16],
    compositor: Option<&Compositor>,
    d2d_factory: Option<&ID2D1Factory>,
    slots: &mut HashMap<String, UnderlaySlot>,
    req: AcrylicSyncRequest,
    externally_hidden: bool,
) -> SyncOutcome {
    let slot = slots.entry(req.label.clone()).or_insert_with(|| UnderlaySlot {
        underlay_hwnd: 0,
        parent_hwnd: req.parent_hwnd,
        visible: false,
        comp: None,
        last_screen_x: i32::MIN,
        last_screen_y: i32::MIN,
        last_w: 0,
        last_h: 0,
        last_re: -1,
        last_rb: -1,
        last_rt: -1,
        last_is_island: false,
        last_position: String::new(),
        last_blur_strength: 0,
        last_req: None,
    });

    slot.parent_hwnd = req.parent_hwnd;
    let parent = HWND(req.parent_hwnd as *mut c_void);

    if externally_hidden
        || !req.enabled
        || req.blur_strength <= 1
        || req.width <= 1.0
        || req.height <= 1.0
        || req.parent_hwnd == 0
        || !IsWindow(parent).as_bool()
        || !IsWindowVisible(parent).as_bool()
    {
        let mut mutated = false;
        if slot.underlay_hwnd != 0 && slot.visible {
            let _ = ShowWindow(HWND(slot.underlay_hwnd as *mut c_void), SW_HIDE);
            slot.visible = false;
            mutated = true;
        }
        slot.last_req = Some(req);
        return SyncOutcome {
            became_visible: false,
            mutated,
        };
    }

    let mut mutated = false;
    if slot.underlay_hwnd == 0 || !IsWindow(HWND(slot.underlay_hwnd as *mut c_void)).as_bool() {
        let (hwnd_val, comp_underlay) =
            create_underlay_window(class_name, compositor, req.blur_strength);
        if hwnd_val == 0 {
            return SyncOutcome {
                became_visible: false,
                mutated: false,
            };
        }
        slot.underlay_hwnd = hwnd_val;
        slot.comp = comp_underlay;
        slot.visible = false;
        slot.last_w = 0;
        slot.last_blur_strength = req.blur_strength;
        mutated = true;
    } else if req.blur_strength != slot.last_blur_strength {
        if let (Some(comp), Some(ref mut underlay)) = (compositor, &mut slot.comp) {
            underlay.blur_strength = req.blur_strength;
            let new_pair = BackdropBrushPair::new(comp, req.blur_strength);
            if let Some(ref pair) = new_pair {
                let _ = underlay.visual.SetBrush(pair.current());
                underlay.brush_pair = new_pair;
                mutated = true;
            }
        }
        slot.last_blur_strength = req.blur_strength;
    }

    let dpr = req.dpr.max(1.0);
    let layout = compute_acrylic_surface_layout(&req);
    let phys_w = layout.total_w_px;
    let phys_h = layout.total_h_px;
    let rb = layout.rb_px;
    let rt = layout.rt_px;
    let re = layout.re_px;

    let mut parent_rect = RECT::default();
    if GetWindowRect(parent, &mut parent_rect).is_err() {
        return SyncOutcome {
            became_visible: false,
            mutated,
        };
    }

    let screen_x = parent_rect.left + (req.container_left * dpr).round() as i32 + layout.off_x_px;
    let screen_y = parent_rect.top + (req.container_top * dpr).round() as i32 + layout.off_y_px;

    let shape_changed = phys_w != slot.last_w
        || phys_h != slot.last_h
        || re != slot.last_re
        || rb != slot.last_rb
        || rt != slot.last_rt
        || req.is_island != slot.last_is_island
        || req.position != slot.last_position;

    if shape_changed {
        mutated = true;
        if let Some(ref mut comp) = slot.comp {
            comp.phys_w = phys_w;
            comp.phys_h = phys_h;
            let _ = comp.visual.SetSize(Vector2 {
                X: phys_w as f32,
                Y: phys_h as f32,
            });

            if re > 0 && !req.is_island {
                if let (Some(c), Some(fac)) = (compositor, d2d_factory) {
                    if let Some(path_geom) =
                        build_concave_ear_path_geometry(fac, c, &layout, &req.position)
                    {
                        let _ = comp.clip.SetGeometry(&path_geom);
                        comp.use_path_clip = true;
                    } else {
                        comp.use_path_clip = false;
                    }
                } else {
                    comp.use_path_clip = false;
                }
            } else {
                comp.use_path_clip = false;
            }

            if !comp.use_path_clip {
                let (ox, oy, sw, sh, cr) = compute_clipped_rounded_rect(
                    phys_w,
                    phys_h,
                    rb,
                    rt,
                    req.is_island,
                    &req.position,
                );
                comp.ox = ox;
                comp.oy = oy;
                comp.sw = sw;
                comp.sh = sh;
                comp.cr = cr;
                let _ = comp.rounded_rect.SetOffset(Vector2 { X: ox, Y: oy });
                let _ = comp.rounded_rect.SetSize(Vector2 { X: sw, Y: sh });
                let _ = comp
                    .rounded_rect
                    .SetCornerRadius(Vector2 { X: cr, Y: cr });
                let _ = comp.clip.SetGeometry(&comp.rounded_rect);
            }
        }

        slot.last_w = phys_w;
        slot.last_h = phys_h;
        slot.last_re = re;
        slot.last_rb = rb;
        slot.last_rt = rt;
        slot.last_is_island = req.is_island;
        slot.last_position = req.position.clone();
    }

    let was_visible = slot.visible;
    let pos_changed = !was_visible
        || shape_changed
        || screen_x != slot.last_screen_x
        || screen_y != slot.last_screen_y;

    if pos_changed {
        mutated = true;
        let flags = SWP_NOACTIVATE
            | SWP_NOOWNERZORDER
            | SWP_NOSENDCHANGING
            | if !was_visible {
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

    let just_became_visible = !was_visible && slot.visible;
    if just_became_visible {
        let use_host_backdrop: u32 = 1;
        let _ = DwmSetWindowAttribute(
            slot.underlay_hwnd,
            DWMWA_USE_HOSTBACKDROPBRUSH,
            &use_host_backdrop as *const u32 as *const c_void,
            std::mem::size_of::<u32>() as u32,
        );
    }

    slot.last_req = Some(req);
    SyncOutcome {
        became_visible: just_became_visible,
        mutated,
    }
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

    let tx = ensure_acrylic_worker()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let _ = tx.send(AcrylicCommand::Sync(req));
}

pub fn set_window_acrylic_hidden(label: &str, hidden: bool) {
    let tx = ensure_acrylic_worker()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let _ = tx.send(AcrylicCommand::SetHidden {
        label: label.to_string(),
        hidden,
    });
}

pub fn keep_acrylic_below_window(label: &str, parent_hwnd: isize) {
    if parent_hwnd == 0 {
        return;
    }
    let tx = ensure_acrylic_worker()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let _ = tx.send(AcrylicCommand::KeepBelow {
        label: label.to_string(),
        parent_hwnd,
    });
}

pub fn invalidate_all_backdrops() {
    let tx = ensure_acrylic_worker()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let _ = tx.send(AcrylicCommand::InvalidateBackdrop);
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
            let d2d_factory: ID2D1Factory =
                D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, None)
                    .expect("D2D1CreateFactory should succeed");

            let class_name: Vec<u16> = "GiliTestUnderlay\0".encode_utf16().collect();
            let wc = WNDCLASSW {
                lpfnWndProc: Some(underlay_wnd_proc),
                lpszClassName: PCWSTR(class_name.as_ptr()),
                ..Default::default()
            };
            let _ = RegisterClassW(&wc);
            let (hwnd_val, comp_underlay) = create_underlay_window(&class_name, Some(&comp), 50);
            assert_ne!(hwnd_val, 0);
            let mut underlay = comp_underlay.expect("composition underlay should initialize");
            for pos in ["bottom", "top", "left", "right"] {
                let sample_req = AcrylicSyncRequest {
                    label: "test".to_string(),
                    parent_hwnd: 0,
                    enabled: true,
                    container_left: 0.0,
                    container_top: 0.0,
                    width: if pos == "left" || pos == "right" { 48.0 } else { 520.0 },
                    height: if pos == "left" || pos == "right" { 520.0 } else { 48.0 },
                    ear_radius: 32.0,
                    bottom_radius: 15.0,
                    top_radius: 15.0,
                    is_island: false,
                    position: pos.to_string(),
                    dpr: 1.0,
                    blur_strength: 68,
                    opacity: 0.8,
                    is_light: false,
                };
                let layout = compute_acrylic_surface_layout(&sample_req);
                assert!(layout.re_px > 0);
                assert!(build_concave_ear_path_geometry(&d2d_factory, &comp, &layout, pos).is_some());
            }
            assert!(underlay.refresh_backdrop(&comp, hwnd_val, 0, 0, 0, false));
            assert!(underlay.refresh_backdrop(&comp, hwnd_val, 0, 0, 0, true));
            drop(underlay);
            if hwnd_val != 0 {
                let _ = DestroyWindow(HWND(hwnd_val as *mut c_void));
            }
        }
    }
}
