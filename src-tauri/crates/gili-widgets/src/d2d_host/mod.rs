pub mod device;
pub mod renderer;

use crate::config::{DesktopWidgetsConfig, DisplayMode, WidgetSize};
use crate::contrast::{
    analyze_region_for_style, load_wallpaper_sample, resolve_wallpaper_file_path,
    CachedWallpaperSample,
};
use crate::d2d_host::device::{query_system_visual_policy, SystemVisualPolicy};
use crate::layout::{
    hit_test_scene, resolve_grid_collisions, slot_rect_dp, snap_position_to_grid, HitTestResult,
    RectF, WidgetRenderItem,
};
use crate::providers::WidgetDataHub;
use crate::spring::{edit_jiggle_degrees, SpringParams, SpringValue};
use crate::widgets::build_widget_render_item;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetRuntimeMetrics {
    pub running: bool,
    pub edit_mode: bool,
    pub board_visible: bool,
    pub monitor_count: usize,
    pub active_widget_count: usize,
    pub gpu_adapter: String,
    pub target_fps: u32,
    pub last_dirty_rects: usize,
    pub paused_reason: Option<String>,
    pub working_set_mb: f32,
    pub power_saver: bool,
    pub high_contrast: bool,
    pub reduced_motion: bool,
    pub text_scale_factor: f32,
}

impl Default for WidgetRuntimeMetrics {
    fn default() -> Self {
        Self {
            running: false,
            edit_mode: false,
            board_visible: false,
            monitor_count: 0,
            active_widget_count: 0,
            gpu_adapter: String::new(),
            target_fps: 0,
            last_dirty_rects: 0,
            paused_reason: None,
            working_set_mb: 0.0,
            power_saver: false,
            high_contrast: false,
            reduced_motion: false,
            text_scale_factor: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WidgetHostEvent {
    OpenFeature { widget_type: String, action_id: Option<String> },
    OpenGallery,
    OpenCustomizer { slot_id: String },
    ConfigMutated { config: DesktopWidgetsConfig },
    TextInputSubmitted { slot_id: String, widget_type: String, text: String },
    ToggleQuickControl { control: String },
}

#[derive(Debug, Clone)]
pub enum HostCommand {
    UpdateConfig(DesktopWidgetsConfig),
    SetEditMode(bool),
    ToggleBoard(Option<bool>),
    RefreshWallpaper,
    MarkDirty,
    Shutdown,
}

#[derive(Debug, Clone)]
pub struct MonitorInfoData {
    pub id: String,
    pub x: i32,
    pub y: i32,
    pub width_px: u32,
    pub height_px: u32,
    pub work_x: i32,
    pub work_y: i32,
    pub work_w: i32,
    pub work_h: i32,
    pub is_primary: bool,
}

pub fn query_process_working_set_mb() -> f32 {
    #[cfg(windows)]
    {
        use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
        use windows::Win32::System::Threading::GetCurrentProcess;
        let mut pmc = PROCESS_MEMORY_COUNTERS::default();
        let ok = unsafe {
            GetProcessMemoryInfo(
                GetCurrentProcess(),
                &mut pmc,
                std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
            )
            .is_ok()
        };
        if ok {
            return (pmc.WorkingSetSize as f64 / (1024.0 * 1024.0) * 10.0).round() as f32 / 10.0;
        }
    }
    0.0
}

pub struct HostSharedState {
    pub config: DesktopWidgetsConfig,
    pub hub: WidgetDataHub,
    pub edit_mode: bool,
    pub board_visible: bool,
    pub screen_powered_off: bool,
    pub policy: SystemVisualPolicy,
    pub wallpaper: Option<CachedWallpaperSample>,
    pub metrics: WidgetRuntimeMetrics,
    pub pending_commands: Vec<HostCommand>,
    pub on_event: Option<Arc<dyn Fn(WidgetHostEvent) + Send + Sync>>,
}

impl HostSharedState {
    pub fn new(config: DesktopWidgetsConfig) -> Self {
        let wp = resolve_wallpaper_file_path().and_then(|p| load_wallpaper_sample(&p));
        let policy = query_system_visual_policy();
        Self {
            config,
            hub: WidgetDataHub::default(),
            edit_mode: false,
            board_visible: false,
            screen_powered_off: false,
            policy,
            wallpaper: wp,
            metrics: WidgetRuntimeMetrics::default(),
            pending_commands: Vec::new(),
            on_event: None,
        }
    }

    pub fn emit(&self, ev: WidgetHostEvent) {
        if let Some(cb) = &self.on_event {
            cb(ev);
        }
    }
}

/// Computes adaptive frame pacing interval based on active widget types, animations, and power policy.
pub fn compute_adaptive_target_fps(
    cfg: &DesktopWidgetsConfig,
    edit_mode: bool,
    any_spring_active: bool,
    screen_off: bool,
    board_visible: bool,
    policy: &SystemVisualPolicy,
) -> (u32, Option<String>) {
    if !cfg.enabled {
        return (0, Some("Widget desktop nonaktif".into()));
    }
    if screen_off {
        return (0, Some("Layar mati".into()));
    }
    if cfg.display_mode == DisplayMode::WidgetBoard && !board_visible {
        return (0, Some("Papan Widget tertutup".into()));
    }
    if cfg.auto_pause_fullscreen && policy.fullscreen_or_game_active && !board_visible {
        return (0, Some("Aplikasi layar penuh aktif".into()));
    }

    let cap = if cfg.auto_pause_power_saver && policy.power_saver {
        30
    } else {
        60
    };

    if any_spring_active || (edit_mode && !policy.reduced_motion) {
        return (cap, None);
    }

    let has_visualizer = cfg.slots.iter().any(|s| {
        s.active_widget()
            .map(|w| w.widget_type == "audio_visualizer")
            .unwrap_or(false)
    });
    if has_visualizer {
        return (cap.min(30), None);
    }

    let has_mascot = cfg.slots.iter().any(|s| {
        s.active_widget()
            .map(|w| w.widget_type == "live_mascot")
            .unwrap_or(false)
    });
    if has_mascot {
        return (if policy.power_saver { 8 } else { 10 }, None);
    }

    let has_seconds_clock = cfg.slots.iter().any(|s| {
        s.active_widget()
            .map(|w| {
                w.widget_type == "styled_clock"
                    && w.settings
                        .get("show_seconds")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
            })
            .unwrap_or(false)
    });
    if has_seconds_clock {
        return (1, None);
    }

    // Idle widgets do not burn GPU frames; redraws are triggered only on data/minute changes
    (0, None)
}

#[cfg(windows)]
pub fn spawn_native_host_thread(shared: Arc<Mutex<HostSharedState>>) -> std::thread::JoinHandle<()> {
    std::thread::Builder::new()
        .name("gili-widgets-d2d".into())
        .spawn(move || {
            if let Err(e) = win_host::run_host_loop(shared.clone()) {
                if let Ok(mut st) = shared.lock() {
                    st.metrics.running = false;
                    st.metrics.paused_reason = Some(format!("Inisialisasi Direct2D gagal: {e}"));
                }
            }
        })
        .expect("Gagal membuat thread host widget Direct2D")
}

#[cfg(not(windows))]
pub fn spawn_native_host_thread(_shared: Arc<Mutex<HostSharedState>>) -> std::thread::JoinHandle<()> {
    std::thread::spawn(|| {})
}

#[cfg(windows)]
mod win_host {
    use super::*;
    use crate::d2d_host::device::gpu::{D2DDeviceResources, MonitorSwapChain};
    use crate::d2d_host::renderer::render::D2DWidgetRenderer;
    use std::cell::RefCell;
    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, ScreenToClient, HDC, HMONITOR, MONITORINFOEXW,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::HiDpi::{
        GetDpiForWindow, SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SetFocus, VK_ESCAPE, VK_RETURN,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DestroyWindow,
        DispatchMessageW, GetCursorPos, GetWindowTextLengthW, GetWindowTextW, PeekMessageW,
        RegisterClassExW, SetWindowPos, ShowWindow, TrackPopupMenu,
        TranslateMessage, CS_DBLCLKS, ES_AUTOHSCROLL, ES_MULTILINE, HTCLIENT, HTTRANSPARENT,
        HWND_BOTTOM, HWND_TOPMOST, MF_SEPARATOR, MF_STRING, MSG, PM_REMOVE, SWP_NOACTIVATE,
        SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOWNOACTIVATE, TPM_LEFTALIGN,
        TPM_RETURNCMD, TPM_RIGHTBUTTON, WINDOWPOS, WM_DESTROY, WM_DISPLAYCHANGE, WM_DPICHANGED,
        WM_GETOBJECT, WM_KEYDOWN, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_MOUSEWHEEL,
        WM_NCHITTEST, WM_POWERBROADCAST, WM_RBUTTONUP, WM_SETTINGCHANGE, WM_SHOWWINDOW,
        WM_WINDOWPOSCHANGING, WNDCLASSEXW, WS_BORDER, WS_CHILD, WS_CLIPSIBLINGS, WS_EX_NOACTIVATE,
        WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW, WS_POPUP, WS_VISIBLE,
    };

    const CMD_EDIT_TOGGLE: i32 = 1001;
    const CMD_SIZE_S: i32 = 1002;
    const CMD_SIZE_M: i32 = 1003;
    const CMD_SIZE_L: i32 = 1004;
    const CMD_CUSTOMIZE: i32 = 1005;
    const CMD_STACK_NEXT: i32 = 1006;
    const CMD_DELETE: i32 = 1007;

    struct ActiveDrag {
        slot_id: String,
        offset_x: f32,
        offset_y: f32,
        cur_x: f32,
        cur_y: f32,
    }

    struct InlineEditor {
        hwnd: HWND,
        slot_id: String,
        widget_type: String,
    }

    struct MonitorSurface {
        info: MonitorInfoData,
        hwnd: HWND,
        swap: MonitorSwapChain,
        items: Vec<WidgetRenderItem>,
        add_btn_rect: Option<RectF>,
    }

    struct HostThreadState {
        shared: Arc<Mutex<HostSharedState>>,
        surfaces: Vec<MonitorSurface>,
        slot_springs: HashMap<String, (SpringValue, SpringValue, SpringValue)>,
        dragging: Option<ActiveDrag>,
        pressed_since: Option<(Instant, String, f32, f32)>,
        inline_editor: Option<InlineEditor>,
        force_redraw: bool,
        should_exit: bool,
        start_time: Instant,
    }

    thread_local! {
        static HOST_STATE: RefCell<Option<HostThreadState>> = const { RefCell::new(None) };
    }

    fn enumerate_monitors() -> Vec<MonitorInfoData> {
        unsafe extern "system" fn cb(
            hmon: HMONITOR,
            _hdc: HDC,
            _rc: *mut RECT,
            lparam: LPARAM,
        ) -> BOOL {
            let list = &mut *(lparam.0 as *mut Vec<MonitorInfoData>);
            let mut info = MONITORINFOEXW::default();
            info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            if GetMonitorInfoW(hmon, &mut info.monitorInfo as *mut _ as *mut _).as_bool() {
                let r = info.monitorInfo.rcMonitor;
                let w = info.monitorInfo.rcWork;
                let is_primary = (info.monitorInfo.dwFlags & 1) != 0;
                let id = if is_primary {
                    "primary".to_string()
                } else {
                    format!("monitor_{}", list.len())
                };
                list.push(MonitorInfoData {
                    id,
                    x: r.left,
                    y: r.top,
                    width_px: (r.right - r.left).max(1) as u32,
                    height_px: (r.bottom - r.top).max(1) as u32,
                    work_x: w.left,
                    work_y: w.top,
                    work_w: (w.right - w.left).max(1),
                    work_h: (w.bottom - w.top).max(1),
                    is_primary,
                });
            }
            BOOL(1)
        }

        let mut list = Vec::new();
        unsafe {
            let _ = EnumDisplayMonitors(
                HDC::default(),
                None,
                Some(cb),
                LPARAM(&mut list as *mut _ as isize),
            );
        }
        list
    }

    fn spawn_inline_native_editor(
        parent: HWND,
        rect_dip: RectF,
        dpi: f32,
        slot_id: String,
        widget_type: String,
        initial_text: &str,
    ) -> Option<InlineEditor> {
        let scale = dpi / 96.0;
        let x = (rect_dip.x * scale).round() as i32;
        let y = (rect_dip.y * scale).round() as i32;
        let w = (rect_dip.w * scale).round().max(120.0) as i32;
        let h = (rect_dip.h * scale).round().max(34.0) as i32;
        let text_w = HSTRING::from(initial_text);
        let hwnd = unsafe {
            CreateWindowExW(
                Default::default(),
                w!("EDIT"),
                PCWSTR(text_w.as_ptr()),
                WS_CHILD | WS_VISIBLE | WS_BORDER | windows::Win32::UI::WindowsAndMessaging::WINDOW_STYLE((ES_AUTOHSCROLL | ES_MULTILINE) as u32),
                x,
                y,
                w,
                h,
                parent,
                None,
                GetModuleHandleW(None).unwrap_or_default(),
                None,
            )
            .ok()?
        };
        unsafe {
            let _ = SetFocus(hwnd);
        }
        Some(InlineEditor {
            hwnd,
            slot_id,
            widget_type,
        })
    }

    fn read_and_close_inline_editor(ed: InlineEditor) -> (String, String, String) {
        let text = unsafe {
            let len = GetWindowTextLengthW(ed.hwnd);
            if len > 0 {
                let mut buf = vec![0u16; (len + 1) as usize];
                let read = GetWindowTextW(ed.hwnd, &mut buf);
                String::from_utf16_lossy(&buf[..read as usize])
            } else {
                String::new()
            }
        };
        unsafe {
            let _ = DestroyWindow(ed.hwnd);
        }
        (ed.slot_id, ed.widget_type, text)
    }

    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_WINDOWPOSCHANGING => {
                // Keep DesktopAttached windows strictly at bottom z-order without Explorer WorkerW injection
                let should_stay_bottom = HOST_STATE.with(|cell| {
                    let b = cell.borrow();
                    if let Some(st) = b.as_ref() {
                        if let Ok(sh) = st.shared.lock() {
                            return sh.config.display_mode == DisplayMode::DesktopAttached
                                && !sh.board_visible;
                        }
                    }
                    true
                });
                if should_stay_bottom && lparam.0 != 0 {
                    let wp = &mut *(lparam.0 as *mut WINDOWPOS);
                    wp.hwndInsertAfter = HWND_BOTTOM;
                }
                return LRESULT(0);
            }
            WM_NCHITTEST => {
                let sx = (lparam.0 & 0xFFFF) as i16 as i32;
                let sy = ((lparam.0 >> 16) & 0xFFFF) as i16 as i32;
                let mut pt = POINT { x: sx, y: sy };
                let _ = ScreenToClient(hwnd, &mut pt);
                let dpi = (GetDpiForWindow(hwnd) as f32).max(96.0);
                let px = pt.x as f32 * 96.0 / dpi;
                let py = pt.y as f32 * 96.0 / dpi;

                let hit = HOST_STATE.with(|cell| {
                    let b = cell.borrow();
                    let Some(st) = b.as_ref() else {
                        return HitTestResult::Transparent;
                    };
                    let (edit_mode, board_visible) = st
                        .shared
                        .lock()
                        .map(|s| (s.edit_mode, s.board_visible))
                        .unwrap_or((false, false));
                    if let Some(surf) = st.surfaces.iter().find(|s| s.hwnd == hwnd) {
                        let res = hit_test_scene(&surf.items, edit_mode, surf.add_btn_rect, px, py);
                        if board_visible && res == HitTestResult::Transparent {
                            // In Widget Board overlay mode, clicking outside dismisses the board
                            return HitTestResult::WidgetContent {
                                slot_id: "__board_dismiss__".into(),
                                action_id: None,
                            };
                        }
                        res
                    } else {
                        HitTestResult::Transparent
                    }
                });

                return match hit {
                    HitTestResult::Transparent => LRESULT(HTTRANSPARENT as isize),
                    _ => LRESULT(HTCLIENT as isize),
                };
            }
            WM_LBUTTONDOWN => {
                let px_raw = (lparam.0 & 0xFFFF) as i16 as f32;
                let py_raw = ((lparam.0 >> 16) & 0xFFFF) as i16 as f32;
                let dpi = (GetDpiForWindow(hwnd) as f32).max(96.0);
                let px = px_raw * 96.0 / dpi;
                let py = py_raw * 96.0 / dpi;

                HOST_STATE.with(|cell| {
                    let mut b = cell.borrow_mut();
                    let Some(st) = b.as_mut() else { return };
                    let (edit_mode, locked, board_visible) = st
                        .shared
                        .lock()
                        .map(|s| (s.edit_mode, s.config.positions_locked, s.board_visible))
                        .unwrap_or((false, false, false));

                    let Some(surf) = st.surfaces.iter().find(|s| s.hwnd == hwnd) else {
                        return;
                    };
                    match hit_test_scene(&surf.items, edit_mode, surf.add_btn_rect, px, py) {
                        HitTestResult::Transparent => {
                            if board_visible {
                                if let Ok(mut sh) = st.shared.lock() {
                                    sh.board_visible = false;
                                }
                                st.force_redraw = true;
                            }
                        }
                        HitTestResult::GalleryAddButton => {
                            if let Ok(sh) = st.shared.lock() {
                                sh.emit(WidgetHostEvent::OpenGallery);
                            }
                        }
                        HitTestResult::RemoveBadge { slot_id } => {
                            if let Ok(mut sh) = st.shared.lock() {
                                sh.config.slots.retain(|s| s.slot_id != slot_id);
                                let cfg = sh.config.clone();
                                sh.emit(WidgetHostEvent::ConfigMutated { config: cfg });
                            }
                            st.force_redraw = true;
                        }
                        HitTestResult::WidgetContent { slot_id, action_id } => {
                            if edit_mode && !locked {
                                if let Some(item) = surf.items.iter().find(|i| i.slot_id == slot_id)
                                {
                                    st.dragging = Some(ActiveDrag {
                                        slot_id: slot_id.clone(),
                                        offset_x: px - item.frame.x,
                                        offset_y: py - item.frame.y,
                                        cur_x: item.frame.x,
                                        cur_y: item.frame.y,
                                    });
                                    st.force_redraw = true;
                                }
                            } else {
                                st.pressed_since = Some((Instant::now(), slot_id.clone(), px, py));
                                if let Some(act) = action_id {
                                    if act.starts_with("inline_edit:") {
                                        if let Some(item) =
                                            surf.items.iter().find(|i| i.slot_id == slot_id)
                                        {
                                            let edit_rect = RectF::new(
                                                item.frame.x + 12.0,
                                                item.frame.y + item.frame.h - 46.0,
                                                item.frame.w - 24.0,
                                                34.0,
                                            );
                                            if let Some(prev) = st.inline_editor.take() {
                                                let _ = read_and_close_inline_editor(prev);
                                            }
                                            st.inline_editor = spawn_inline_native_editor(
                                                hwnd,
                                                edit_rect,
                                                dpi,
                                                slot_id.clone(),
                                                item.widget_type.clone(),
                                                "",
                                            );
                                        }
                                    } else if let Some(ctrl) = act.strip_prefix("quick_toggle:") {
                                        if let Ok(sh) = st.shared.lock() {
                                            sh.emit(WidgetHostEvent::ToggleQuickControl {
                                                control: ctrl.to_string(),
                                            });
                                        }
                                    } else if let Some(item) =
                                        surf.items.iter().find(|i| i.slot_id == slot_id)
                                    {
                                        if let Ok(sh) = st.shared.lock() {
                                            sh.emit(WidgetHostEvent::OpenFeature {
                                                widget_type: item.widget_type.clone(),
                                                action_id: Some(act),
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
                return LRESULT(0);
            }
            WM_MOUSEMOVE => {
                let px_raw = (lparam.0 & 0xFFFF) as i16 as f32;
                let py_raw = ((lparam.0 >> 16) & 0xFFFF) as i16 as f32;
                let dpi = (GetDpiForWindow(hwnd) as f32).max(96.0);
                let px = px_raw * 96.0 / dpi;
                let py = py_raw * 96.0 / dpi;
                HOST_STATE.with(|cell| {
                    let mut b = cell.borrow_mut();
                    let Some(st) = b.as_mut() else { return };
                    if let Some(drag) = st.dragging.as_mut() {
                        drag.cur_x = px - drag.offset_x;
                        drag.cur_y = py - drag.offset_y;
                        st.force_redraw = true;
                    }
                });
                return LRESULT(0);
            }
            WM_LBUTTONUP => {
                HOST_STATE.with(|cell| {
                    let mut b = cell.borrow_mut();
                    let Some(st) = b.as_mut() else { return };
                    if let Some(drag) = st.dragging.take() {
                        if let Ok(mut sh) = st.shared.lock() {
                            let scale = sh.config.grid_scale;
                            let (col, row) =
                                snap_position_to_grid(drag.cur_x, drag.cur_y, scale, 32.0, 48.0);
                            if let Some(slot) =
                                sh.config.slots.iter_mut().find(|s| s.slot_id == drag.slot_id)
                            {
                                slot.grid_col = col;
                                slot.grid_row = row;
                            }
                            resolve_grid_collisions(&mut sh.config.slots, &drag.slot_id);
                            let cfg = sh.config.clone();
                            sh.emit(WidgetHostEvent::ConfigMutated { config: cfg });
                        }
                        st.force_redraw = true;
                    } else if let Some((since, slot_id, _, _)) = st.pressed_since.take() {
                        if since.elapsed() >= Duration::from_millis(550) {
                            if let Ok(mut sh) = st.shared.lock() {
                                sh.edit_mode = true;
                            }
                            st.force_redraw = true;
                        } else if let Some(surf) = st.surfaces.iter().find(|s| s.hwnd == hwnd) {
                            if let Some(item) = surf.items.iter().find(|i| i.slot_id == slot_id) {
                                if let Ok(sh) = st.shared.lock() {
                                    sh.emit(WidgetHostEvent::OpenFeature {
                                        widget_type: item.widget_type.clone(),
                                        action_id: None,
                                    });
                                }
                            }
                        }
                    }
                });
                return LRESULT(0);
            }
            WM_MOUSEWHEEL => {
                let delta = ((wparam.0 >> 16) as i16) as i32;
                let mut pt = POINT::default();
                let _ = GetCursorPos(&mut pt);
                let _ = ScreenToClient(hwnd, &mut pt);
                let dpi = (GetDpiForWindow(hwnd) as f32).max(96.0);
                let px = pt.x as f32 * 96.0 / dpi;
                let py = pt.y as f32 * 96.0 / dpi;

                HOST_STATE.with(|cell| {
                    let mut b = cell.borrow_mut();
                    let Some(st) = b.as_mut() else { return };
                    let edit_mode = st.shared.lock().map(|s| s.edit_mode).unwrap_or(false);
                    let slot_opt = st.surfaces.iter().find(|s| s.hwnd == hwnd).and_then(|surf| {
                        match hit_test_scene(&surf.items, edit_mode, surf.add_btn_rect, px, py) {
                            HitTestResult::WidgetContent { slot_id, .. } => Some(slot_id),
                            _ => None,
                        }
                    });
                    if let Some(slot_id) = slot_opt {
                        if let Ok(mut sh) = st.shared.lock() {
                            if let Some(slot) =
                                sh.config.slots.iter_mut().find(|s| s.slot_id == slot_id)
                            {
                                if slot.widgets.len() > 1 {
                                    slot.step_stack(if delta < 0 { 1 } else { -1 });
                                    let cfg = sh.config.clone();
                                    sh.emit(WidgetHostEvent::ConfigMutated { config: cfg });
                                    st.force_redraw = true;
                                }
                            }
                        }
                    }
                });
                return LRESULT(0);
            }
            WM_RBUTTONUP => {
                let mut screen_pt = POINT::default();
                let _ = GetCursorPos(&mut screen_pt);
                let mut client_pt = screen_pt;
                let _ = ScreenToClient(hwnd, &mut client_pt);
                let dpi = (GetDpiForWindow(hwnd) as f32).max(96.0);
                let px = client_pt.x as f32 * 96.0 / dpi;
                let py = client_pt.y as f32 * 96.0 / dpi;

                let hit_slot = HOST_STATE.with(|cell| {
                    let b = cell.borrow();
                    let st = b.as_ref()?;
                    let edit_mode = st.shared.lock().map(|s| s.edit_mode).unwrap_or(false);
                    let surf = st.surfaces.iter().find(|s| s.hwnd == hwnd)?;
                    match hit_test_scene(&surf.items, edit_mode, surf.add_btn_rect, px, py) {
                        HitTestResult::WidgetContent { slot_id, .. } => Some(slot_id),
                        _ => None,
                    }
                });

                if let Some(slot_id) = hit_slot {
                    if let Ok(menu) = CreatePopupMenu() {
                        let _ = AppendMenuW(menu, MF_STRING, CMD_EDIT_TOGGLE as usize, w!("Edit widget"));
                        let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
                        let _ = AppendMenuW(menu, MF_STRING, CMD_SIZE_S as usize, w!("Ukuran Kecil (S)"));
                        let _ = AppendMenuW(menu, MF_STRING, CMD_SIZE_M as usize, w!("Ukuran Sedang (M)"));
                        let _ = AppendMenuW(menu, MF_STRING, CMD_SIZE_L as usize, w!("Ukuran Besar (L)"));
                        let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
                        let _ = AppendMenuW(menu, MF_STRING, CMD_CUSTOMIZE as usize, w!("Latar dan warna"));
                        let _ = AppendMenuW(menu, MF_STRING, CMD_STACK_NEXT as usize, w!("Ganti widget di tumpukan"));
                        let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
                        let _ = AppendMenuW(menu, MF_STRING, CMD_DELETE as usize, w!("Hapus"));

                        let cmd = TrackPopupMenu(
                            menu,
                            TPM_RETURNCMD | TPM_LEFTALIGN | TPM_RIGHTBUTTON,
                            screen_pt.x,
                            screen_pt.y,
                            0,
                            hwnd,
                            None,
                        )
                        .0;
                        let _ = DestroyMenu(menu);

                        HOST_STATE.with(|cell| {
                            let mut b = cell.borrow_mut();
                            let Some(st) = b.as_mut() else { return };
                            if let Ok(mut sh) = st.shared.lock() {
                                match cmd {
                                    CMD_EDIT_TOGGLE => {
                                        sh.edit_mode = !sh.edit_mode;
                                    }
                                    CMD_SIZE_S | CMD_SIZE_M | CMD_SIZE_L => {
                                        let sz = match cmd {
                                            CMD_SIZE_S => WidgetSize::Small,
                                            CMD_SIZE_M => WidgetSize::Medium,
                                            _ => WidgetSize::Large,
                                        };
                                        if let Some(s) = sh
                                            .config
                                            .slots
                                            .iter_mut()
                                            .find(|s| s.slot_id == slot_id)
                                        {
                                            s.size = sz;
                                        }
                                        let cfg = sh.config.clone();
                                        sh.emit(WidgetHostEvent::ConfigMutated { config: cfg });
                                    }
                                    CMD_CUSTOMIZE => {
                                        sh.emit(WidgetHostEvent::OpenCustomizer {
                                            slot_id: slot_id.clone(),
                                        });
                                    }
                                    CMD_STACK_NEXT => {
                                        if let Some(s) = sh
                                            .config
                                            .slots
                                            .iter_mut()
                                            .find(|s| s.slot_id == slot_id)
                                        {
                                            s.step_stack(1);
                                        }
                                        let cfg = sh.config.clone();
                                        sh.emit(WidgetHostEvent::ConfigMutated { config: cfg });
                                    }
                                    CMD_DELETE => {
                                        sh.config.slots.retain(|s| s.slot_id != slot_id);
                                        let cfg = sh.config.clone();
                                        sh.emit(WidgetHostEvent::ConfigMutated { config: cfg });
                                    }
                                    _ => {}
                                }
                            }
                            st.force_redraw = true;
                        });
                    }
                }
                return LRESULT(0);
            }
            WM_KEYDOWN => {
                let vk = wparam.0 as u16;
                if vk == VK_ESCAPE.0 {
                    HOST_STATE.with(|cell| {
                        let mut b = cell.borrow_mut();
                        let Some(st) = b.as_mut() else { return };
                        if let Some(ed) = st.inline_editor.take() {
                            let _ = read_and_close_inline_editor(ed);
                        } else if let Ok(mut sh) = st.shared.lock() {
                            if sh.board_visible {
                                sh.board_visible = false;
                            } else if sh.edit_mode {
                                sh.edit_mode = false;
                            }
                        }
                        st.force_redraw = true;
                    });
                    return LRESULT(0);
                } else if vk == VK_RETURN.0 {
                    HOST_STATE.with(|cell| {
                        let mut b = cell.borrow_mut();
                        let Some(st) = b.as_mut() else { return };
                        if let Some(ed) = st.inline_editor.take() {
                            let (slot_id, widget_type, text) = read_and_close_inline_editor(ed);
                            if !text.trim().is_empty() {
                                if let Ok(sh) = st.shared.lock() {
                                    sh.emit(WidgetHostEvent::TextInputSubmitted {
                                        slot_id,
                                        widget_type,
                                        text,
                                    });
                                }
                            }
                            st.force_redraw = true;
                        }
                    });
                    return LRESULT(0);
                }
            }
            WM_SETTINGCHANGE | WM_DISPLAYCHANGE | WM_DPICHANGED => {
                HOST_STATE.with(|cell| {
                    let mut b = cell.borrow_mut();
                    if let Some(st) = b.as_mut() {
                        if let Ok(mut sh) = st.shared.lock() {
                            sh.policy = query_system_visual_policy();
                            sh.wallpaper = resolve_wallpaper_file_path()
                                .and_then(|p| load_wallpaper_sample(&p));
                        }
                        st.force_redraw = true;
                    }
                });
            }
            WM_POWERBROADCAST => {
                // PBT_APMSUSPEND (4) pauses; PBT_APMRESUMEAUTOMATIC (18) resumes
                HOST_STATE.with(|cell| {
                    let mut b = cell.borrow_mut();
                    if let Some(st) = b.as_mut() {
                        if let Ok(mut sh) = st.shared.lock() {
                            if wparam.0 == 4 {
                                sh.screen_powered_off = true;
                            } else if wparam.0 == 18 {
                                sh.screen_powered_off = false;
                            }
                        }
                        st.force_redraw = true;
                    }
                });
            }
            WM_SHOWWINDOW => {
                // Ensure DesktopAttached survives Win+D / Show Desktop by remaining visible at bottom
                HOST_STATE.with(|cell| {
                    let mut b = cell.borrow_mut();
                    if let Some(st) = b.as_mut() {
                        st.force_redraw = true;
                    }
                });
            }
            WM_GETOBJECT => {
                // Standard UI Automation hook: delegate to DefWindowProcW which exposes HWND accessible name
                return DefWindowProcW(hwnd, msg, wparam, lparam);
            }
            WM_DESTROY => {
                HOST_STATE.with(|cell| {
                    if let Some(st) = cell.borrow_mut().as_mut() {
                        st.should_exit = true;
                    }
                });
                return LRESULT(0);
            }
            _ => {}
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    fn create_monitor_surface(
        res: &D2DDeviceResources,
        class_name: PCWSTR,
        info: MonitorInfoData,
    ) -> Result<MonitorSurface, String> {
        let title = HSTRING::from(format!("Gili Widget Desktop ({})", info.id));
        let hwnd = unsafe {
            CreateWindowExW(
                WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_NOREDIRECTIONBITMAP,
                class_name,
                PCWSTR(title.as_ptr()),
                WS_POPUP | WS_CLIPSIBLINGS,
                info.x,
                info.y,
                info.width_px as i32,
                info.height_px as i32,
                None,
                None,
                GetModuleHandleW(None).unwrap_or_default(),
                None,
            )
            .map_err(|e| format!("CreateWindowExW monitor {} gagal: {e}", info.id))?
        };
        let dpi = unsafe { (GetDpiForWindow(hwnd) as f32).max(96.0) };
        let swap = MonitorSwapChain::create(res, hwnd, info.width_px, info.height_px, dpi)?;
        Ok(MonitorSurface {
            info,
            hwnd,
            swap,
            items: Vec::new(),
            add_btn_rect: None,
        })
    }

    pub fn run_host_loop(shared: Arc<Mutex<HostSharedState>>) -> Result<(), String> {
        unsafe {
            let _ = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        }

        let mut gpu_res = D2DDeviceResources::create()?;
        let mut renderer = D2DWidgetRenderer::new(&gpu_res)?;

        let class_name = w!("GiliDesktopWidgetsHostV1");
        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_DBLCLKS,
            lpfnWndProc: Some(wnd_proc),
            hInstance: unsafe { GetModuleHandleW(None).unwrap_or_default().into() },
            lpszClassName: class_name,
            ..Default::default()
        };
        unsafe {
            RegisterClassExW(&wc);
        }

        let monitors = enumerate_monitors();
        let mut surfaces = Vec::new();
        for mon in monitors {
            if let Ok(surf) = create_monitor_surface(&gpu_res, class_name, mon) {
                surfaces.push(surf);
            }
        }

        if let Ok(mut sh) = shared.lock() {
            sh.metrics.running = true;
            sh.metrics.gpu_adapter = gpu_res.adapter_name.clone();
            sh.metrics.monitor_count = surfaces.len();
        }

        HOST_STATE.with(|cell| {
            *cell.borrow_mut() = Some(HostThreadState {
                shared: shared.clone(),
                surfaces,
                slot_springs: HashMap::new(),
                dragging: None,
                pressed_since: None,
                inline_editor: None,
                force_redraw: true,
                should_exit: false,
                start_time: Instant::now(),
            });
        });

        let mut last_tick = Instant::now();
        let mut last_policy_check = Instant::now();
        let mut last_minute_bucket: u64 = 0;

        loop {
            // Drain Win32 message queue without blocking
            unsafe {
                let mut msg = MSG::default();
                while PeekMessageW(&mut msg, HWND::default(), 0, 0, PM_REMOVE).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }

            // Process incoming commands from Tauri bridge
            let mut should_exit = false;
            let mut force_redraw = false;
            let cmds: Vec<HostCommand> = shared
                .lock()
                .map(|mut s| std::mem::take(&mut s.pending_commands))
                .unwrap_or_default();

            for cmd in cmds {
                match cmd {
                    HostCommand::UpdateConfig(cfg) => {
                        if let Ok(mut sh) = shared.lock() {
                            sh.config = cfg;
                        }
                        force_redraw = true;
                    }
                    HostCommand::SetEditMode(on) => {
                        if let Ok(mut sh) = shared.lock() {
                            sh.edit_mode = on;
                        }
                        force_redraw = true;
                    }
                    HostCommand::ToggleBoard(explicit) => {
                        if let Ok(mut sh) = shared.lock() {
                            sh.board_visible = explicit.unwrap_or(!sh.board_visible);
                        }
                        force_redraw = true;
                    }
                    HostCommand::RefreshWallpaper => {
                        if let Ok(mut sh) = shared.lock() {
                            sh.wallpaper = resolve_wallpaper_file_path()
                                .and_then(|p| load_wallpaper_sample(&p));
                        }
                        force_redraw = true;
                    }
                    HostCommand::MarkDirty => {
                        force_redraw = true;
                    }
                    HostCommand::Shutdown => {
                        should_exit = true;
                    }
                }
            }

            // Periodic policy & minute refresh (every 1.5s)
            if last_policy_check.elapsed() >= Duration::from_millis(1500) {
                last_policy_check = Instant::now();
                let pol = query_system_visual_policy();
                let now_min = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() / 60)
                    .unwrap_or(0);
                if now_min != last_minute_bucket {
                    last_minute_bucket = now_min;
                    force_redraw = true;
                }
                if let Ok(mut sh) = shared.lock() {
                    sh.policy = pol;
                    sh.metrics.working_set_mb = query_process_working_set_mb();
                }
            }

            let now = Instant::now();
            let dt = now.duration_since(last_tick).as_secs_f32().min(0.05);
            last_tick = now;

            let mut target_fps = 0u32;
            let mut device_lost = false;

            HOST_STATE.with(|cell| {
                let mut b = cell.borrow_mut();
                let Some(st) = b.as_mut() else {
                    should_exit = true;
                    return;
                };
                if st.should_exit {
                    should_exit = true;
                    return;
                }
                if force_redraw {
                    st.force_redraw = true;
                }

                let (cfg, hub, edit_mode, board_visible, screen_off, policy, wp) = {
                    let Ok(sh) = st.shared.lock() else { return };
                    (
                        sh.config.clone(),
                        sh.hub.clone(),
                        sh.edit_mode,
                        sh.board_visible,
                        sh.screen_powered_off,
                        sh.policy.clone(),
                        sh.wallpaper.clone(),
                    )
                };

                let visible_now = cfg.enabled
                    && !screen_off
                    && (cfg.display_mode == DisplayMode::DesktopAttached || board_visible)
                    && !(cfg.auto_pause_fullscreen
                        && policy.fullscreen_or_game_active
                        && !board_visible);

                let z_target = if board_visible {
                    HWND_TOPMOST
                } else {
                    HWND_BOTTOM
                };

                for surf in &st.surfaces {
                    unsafe {
                        if visible_now {
                            let _ = ShowWindow(surf.hwnd, SW_SHOWNOACTIVATE);
                            let _ = SetWindowPos(
                                surf.hwnd,
                                z_target,
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                            );
                        } else {
                            let _ = ShowWindow(surf.hwnd, SW_HIDE);
                        }
                    }
                }

                // Step springs for smooth grid snap & appear transitions
                let mut any_spring_active = false;
                let elapsed_secs = st.start_time.elapsed().as_secs_f32();
                let mut total_dirty = 0usize;

                if visible_now {
                    for surf in &mut st.surfaces {
                        let dpi = unsafe { (GetDpiForWindow(surf.hwnd) as f32).max(96.0) };
                        let _ = surf
                            .swap
                            .resize(&gpu_res, surf.info.width_px, surf.info.height_px, dpi);
                        let mon_w_dip = surf.info.width_px as f32 * 96.0 / dpi;
                        let mon_h_dip = surf.info.height_px as f32 * 96.0 / dpi;

                        let mut built = Vec::new();
                        for slot in &cfg.slots {
                            let matches_mon = slot.monitor_id == surf.info.id
                                || (surf.info.is_primary && slot.monitor_id == "primary");
                            if !matches_mon {
                                continue;
                            }
                            let mut target_rect =
                                slot_rect_dp(slot, cfg.grid_scale, 32.0, 48.0);
                            let is_dragging = st
                                .dragging
                                .as_ref()
                                .map(|d| d.slot_id == slot.slot_id)
                                .unwrap_or(false);
                            if let Some(d) = &st.dragging {
                                if d.slot_id == slot.slot_id {
                                    target_rect.x = d.cur_x;
                                    target_rect.y = d.cur_y;
                                }
                            }

                            let entry = st.slot_springs.entry(slot.slot_id.clone()).or_insert((
                                SpringValue::settled(target_rect.x),
                                SpringValue::settled(target_rect.y),
                                SpringValue {
                                    value: 0.96,
                                    velocity: 0.0,
                                    target: 1.0,
                                },
                            ));
                            entry.0.set_target(target_rect.x, policy.reduced_motion || is_dragging);
                            entry.1.set_target(target_rect.y, policy.reduced_motion || is_dragging);
                            entry.2.set_target(
                                if is_dragging { 1.04 } else { 1.0 },
                                policy.reduced_motion,
                            );

                            let a0 = entry.0.step(dt, SpringParams::DEFAULT, policy.reduced_motion);
                            let a1 = entry.1.step(dt, SpringParams::DEFAULT, policy.reduced_motion);
                            let a2 = entry.2.step(dt, SpringParams::DEFAULT, policy.reduced_motion);
                            if a0 || a1 || a2 {
                                any_spring_active = true;
                            }

                            let anim_rect = RectF::new(
                                entry.0.value,
                                entry.1.value,
                                target_rect.w,
                                target_rect.h,
                            );
                            let nx = (anim_rect.x / mon_w_dip.max(1.0)).clamp(0.0, 1.0);
                            let ny = (anim_rect.y / mon_h_dip.max(1.0)).clamp(0.0, 1.0);
                            let nw = (anim_rect.w / mon_w_dip.max(1.0)).clamp(0.01, 1.0);
                            let nh = (anim_rect.h / mon_h_dip.max(1.0)).clamp(0.01, 1.0);

                            let style_ref = slot
                                .active_widget()
                                .and_then(|w| w.style_override.as_ref())
                                .unwrap_or(&cfg.global_theme);
                            let analysis =
                                analyze_region_for_style(wp.as_ref(), style_ref, nx, ny, nw, nh);

                            let mut item = build_widget_render_item(
                                slot,
                                anim_rect,
                                &cfg.global_theme,
                                &analysis,
                                &hub,
                                elapsed_secs,
                            );
                            item.scale = entry.2.value;
                            if edit_mode && !is_dragging {
                                let hash = slot.slot_id.bytes().fold(0u64, |acc, b| {
                                    acc.wrapping_mul(31).wrapping_add(b as u64)
                                });
                                item.edit_jiggle_deg =
                                    edit_jiggle_degrees(hash, elapsed_secs, policy.reduced_motion);
                            }
                            item.compute_hit_regions(edit_mode);
                            built.push(item);
                        }

                        surf.items = built;
                        surf.add_btn_rect = if edit_mode {
                            Some(RectF::new(mon_w_dip - 176.0, 24.0, 148.0, 36.0))
                        } else {
                            None
                        };

                        let (dirty_cnt, pres_res) = renderer.render_frame(
                            &gpu_res,
                            &mut surf.swap,
                            &surf.items,
                            edit_mode,
                            board_visible,
                            surf.add_btn_rect,
                            &policy,
                            st.force_redraw,
                        );
                        total_dirty += dirty_cnt;
                        if let Err(err) = pres_res {
                            if D2DDeviceResources::is_device_lost(err.code()) {
                                device_lost = true;
                            }
                        }
                    }
                    st.force_redraw = false;
                }

                let (fps, paused_reason) = compute_adaptive_target_fps(
                    &cfg,
                    edit_mode,
                    any_spring_active,
                    screen_off,
                    board_visible,
                    &policy,
                );
                target_fps = fps;

                if let Ok(mut sh) = st.shared.lock() {
                    sh.metrics.edit_mode = edit_mode;
                    sh.metrics.board_visible = board_visible;
                    sh.metrics.active_widget_count = cfg.slots.len();
                    sh.metrics.target_fps = fps;
                    sh.metrics.last_dirty_rects = total_dirty;
                    sh.metrics.paused_reason = paused_reason;
                    sh.metrics.power_saver = policy.power_saver;
                    sh.metrics.high_contrast = policy.high_contrast;
                    sh.metrics.reduced_motion = policy.reduced_motion;
                    sh.metrics.text_scale_factor = policy.text_scale_factor;
                };
            });

            // Handle GPU device lost cleanly (sleep, RDP, GPU switch) without crashing
            if device_lost {
                if let Ok(new_res) = D2DDeviceResources::create() {
                    if let Ok(new_rend) = D2DWidgetRenderer::new(&new_res) {
                        gpu_res = new_res;
                        renderer = new_rend;
                        HOST_STATE.with(|cell| {
                            if let Some(st) = cell.borrow_mut().as_mut() {
                                for surf in &mut st.surfaces {
                                    let dpi = unsafe { (GetDpiForWindow(surf.hwnd) as f32).max(96.0) };
                                    if let Ok(new_swap) = MonitorSwapChain::create(
                                        &gpu_res,
                                        surf.hwnd,
                                        surf.info.width_px,
                                        surf.info.height_px,
                                        dpi,
                                    ) {
                                        surf.swap = new_swap;
                                    }
                                }
                                st.force_redraw = true;
                            }
                        });
                    }
                }
            }

            if should_exit {
                HOST_STATE.with(|cell| {
                    if let Some(st) = cell.borrow_mut().take() {
                        for surf in st.surfaces {
                            unsafe {
                                let _ = DestroyWindow(surf.hwnd);
                            }
                        }
                    }
                });
                if let Ok(mut sh) = shared.lock() {
                    sh.metrics.running = false;
                }
                break;
            }

            // Adaptive sleep: 0 fps idles cleanly with minimal wake checks, active runs at target_fps
            let sleep_ms = match target_fps {
                0 => 120,
                1 => 250,
                8..=12 => 90,
                13..=30 => 33,
                _ => 16,
            };
            std::thread::sleep(Duration::from_millis(sleep_ms));
        }

        Ok(())
    }
}
