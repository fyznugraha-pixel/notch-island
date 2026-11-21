pub mod device;
pub mod renderer;

use crate::config::{DesktopWidgetsConfig, DisplayMode, WidgetSize, WidgetStyleConfig};
use crate::contrast::{
    analyze_region_for_style, load_wallpaper_sample, resolve_wallpaper_file_path,
    CachedWallpaperSample, WallpaperRegionAnalysis,
};
use crate::d2d_host::device::{
    query_dynamic_visual_policy, query_system_visual_policy, SystemVisualPolicy,
};
use crate::layout::{
    effective_slot_rect_dp, find_non_overlapping_pos, hit_test_scene, resolve_all_rect_collisions,
    slot_rect_dp, snap_position_to_grid, HitTestResult, RectF, WidgetRenderItem,
};
use crate::providers::WidgetDataHub;
use crate::spring::{edit_jiggle_degrees, SpringParams, SpringValue};
use crate::widgets::{build_widget_render_item_with_policy, widget_catalog};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

static HOST_THREAD_ID: AtomicU32 = AtomicU32::new(0);

/// Wakes the Direct2D host thread immediately out of `MsgWaitForMultipleObjects`.
pub fn wake_host_thread() {
    #[cfg(windows)]
    {
        let tid = HOST_THREAD_ID.load(Ordering::Acquire);
        if tid != 0 {
            use windows::Win32::Foundation::{LPARAM, WPARAM};
            use windows::Win32::UI::WindowsAndMessaging::{PostThreadMessageW, WM_NULL};
            unsafe {
                let _ = PostThreadMessageW(tid, WM_NULL, WPARAM(0), LPARAM(0));
            }
        }
    }
}

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
    OpenFeature {
        widget_type: String,
        action_id: Option<String>,
    },
    OpenGallery,
    OpenCustomizer {
        slot_id: String,
    },
    ConfigMutated {
        config: DesktopWidgetsConfig,
    },
    TextInputSubmitted {
        slot_id: String,
        widget_type: String,
        text: String,
    },
    ToggleQuickControl {
        control: String,
    },
}

#[derive(Debug, Clone)]
pub enum HostCommand {
    UpdateConfig(DesktopWidgetsConfig),
    SetEditMode(bool),
    ToggleBoard(Option<bool>),
    SetStandbyPaused(bool),
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
        use windows::Win32::System::ProcessStatus::{
            GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
        };
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
    pub data_revision: u64,
    pub audio_revision: u64,
    pub edit_mode: bool,
    pub board_visible: bool,
    pub screen_powered_off: bool,
    pub standby_paused: bool,
    pub policy: SystemVisualPolicy,
    pub wallpaper: Option<Arc<CachedWallpaperSample>>,
    pub metrics: WidgetRuntimeMetrics,
    pub pending_commands: Vec<HostCommand>,
    pub on_event: Option<Arc<dyn Fn(WidgetHostEvent) + Send + Sync>>,
}

impl HostSharedState {
    pub fn new(config: DesktopWidgetsConfig) -> Self {
        let wp = resolve_wallpaper_file_path()
            .and_then(|p| load_wallpaper_sample(&p))
            .map(Arc::new);
        let policy = query_system_visual_policy();
        Self {
            config,
            hub: WidgetDataHub::default(),
            data_revision: 1,
            audio_revision: 0,
            edit_mode: false,
            board_visible: false,
            screen_powered_off: false,
            standby_paused: false,
            policy,
            wallpaper: wp,
            metrics: WidgetRuntimeMetrics::default(),
            pending_commands: Vec::new(),
            on_event: None,
        }
    }

    pub fn mark_data_changed(&mut self) {
        self.data_revision = self.data_revision.wrapping_add(1);
    }

    pub fn mark_audio_changed(&mut self) {
        self.audio_revision = self.audio_revision.wrapping_add(1);
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
    any_motion_active: bool,
    has_running_timer: bool,
    has_active_audio: bool,
    screen_off: bool,
    board_visible: bool,
    policy: &SystemVisualPolicy,
) -> (u32, Option<String>) {
    compute_adaptive_target_fps_with_standby(
        cfg,
        edit_mode,
        any_motion_active,
        has_running_timer,
        has_active_audio,
        screen_off,
        board_visible,
        policy,
        false,
    )
}

pub fn compute_adaptive_target_fps_with_standby(
    cfg: &DesktopWidgetsConfig,
    edit_mode: bool,
    any_motion_active: bool,
    has_running_timer: bool,
    has_active_audio: bool,
    screen_off: bool,
    board_visible: bool,
    policy: &SystemVisualPolicy,
    standby_paused: bool,
) -> (u32, Option<String>) {
    if !cfg.enabled && !board_visible {
        return (0, Some("Widget desktop nonaktif".into()));
    }
    if screen_off {
        return (0, Some("Layar mati".into()));
    }
    if standby_paused && !board_visible {
        return (0, Some("StandBy Screensaver".into()));
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

    if any_motion_active || (edit_mode && !policy.reduced_motion) {
        return (cap, None);
    }

    let has_visualizer = cfg.slots.iter().any(|s| {
        s.active_widget()
            .map(|w| w.widget_type == "audio_visualizer")
            .unwrap_or(false)
    });
    if has_visualizer && has_active_audio {
        return (if policy.power_saver { 20 } else { 30 }, None);
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
    if has_seconds_clock || has_running_timer {
        return (1, None);
    }

    // Idle widgets do not burn GPU frames; redraws are triggered only on data/minute changes
    (0, None)
}

#[cfg(windows)]
pub fn spawn_native_host_thread(
    shared: Arc<Mutex<HostSharedState>>,
) -> std::thread::JoinHandle<()> {
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
pub fn spawn_native_host_thread(
    _shared: Arc<Mutex<HostSharedState>>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(|| {})
}

#[cfg(windows)]
mod win_host {
    use super::*;
    use crate::config::{GRID_GAP_DP, GRID_SMALL_DP};
    use crate::d2d_host::device::gpu::{D2DDeviceResources, MonitorSwapChain};
    use crate::d2d_host::renderer::render::D2DWidgetRenderer;
    use std::cell::RefCell;
    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, ScreenToClient, HDC, HMONITOR, MONITORINFOEXW,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::HiDpi::{
        GetDpiForWindow, SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, ReleaseCapture, SetCapture, SetFocus, VK_ESCAPE, VK_LBUTTON, VK_RETURN,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DestroyWindow,
        DispatchMessageW, EnumWindows, FindWindowExW, FindWindowW, GetCursorPos, GetWindow,
        GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW, IsIconic, IsWindowVisible,
        MsgWaitForMultipleObjects, PeekMessageW, PostMessageW, RegisterClassExW,
        SetForegroundWindow, SetWindowLongPtrW, SetWindowPos, ShowWindow, TrackPopupMenu,
        TranslateMessage, CS_DBLCLKS, ES_AUTOHSCROLL, GWLP_HWNDPARENT, GWL_EXSTYLE, GW_HWNDPREV,
        HTCLIENT, HTTRANSPARENT, HWND_BOTTOM, HWND_NOTOPMOST, HWND_TOP, HWND_TOPMOST, MF_SEPARATOR,
        MF_STRING, MSG, PM_REMOVE, QS_ALLINPUT, SET_WINDOW_POS_FLAGS, SWP_HIDEWINDOW,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_SHOWWINDOW, SW_HIDE,
        SW_SHOWNOACTIVATE, TPM_LEFTALIGN, TPM_RETURNCMD, TPM_RIGHTBUTTON, WINDOWPOS,
        WM_CAPTURECHANGED, WM_DESTROY, WM_DISPLAYCHANGE, WM_DPICHANGED, WM_GETOBJECT, WM_KEYDOWN,
        WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_NCHITTEST, WM_NULL,
        WM_POWERBROADCAST, WM_RBUTTONUP, WM_SETTINGCHANGE, WM_SHOWWINDOW, WM_WINDOWPOSCHANGING,
        WNDCLASSEXW, WS_BORDER, WS_CHILD, WS_CLIPSIBLINGS, WS_EX_NOACTIVATE,
        WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP, WS_VISIBLE,
    };

    const CMD_EDIT_TOGGLE: i32 = 1001;
    const CMD_SIZE_S: i32 = 1002;
    const CMD_SIZE_M: i32 = 1003;
    const CMD_SIZE_L: i32 = 1004;
    const CMD_CUSTOMIZE: i32 = 1005;
    const CMD_STACK_NEXT: i32 = 1006;
    const CMD_DELETE: i32 = 1007;
    const CMD_CYCLE_STYLE: i32 = 1008;
    const CMD_PHOTO_FOLDER: i32 = 1010;
    const CMD_PHOTO_NEXT: i32 = 1011;
    const CMD_STORAGE_FOLDER: i32 = 1012;
    const CMD_STORAGE_SCAN: i32 = 1013;
    const DRAG_THRESHOLD_DP: f32 = 5.0;

    /// Lock-free atomic flags read by synchronous Win32 callbacks so `wnd_proc` never panics on re-entry.
    static STAY_BOTTOM_MODE: AtomicBool = AtomicBool::new(true);
    static WANT_VISIBLE_MODE: AtomicBool = AtomicBool::new(false);
    static DESKTOP_OWNER_RAW: AtomicIsize = AtomicIsize::new(0);
    static FORCE_REDRAW_FLAG: AtomicBool = AtomicBool::new(true);
    static SHOULD_EXIT_FLAG: AtomicBool = AtomicBool::new(false);
    static REFRESH_ENV_FLAG: AtomicBool = AtomicBool::new(false);
    static SCREEN_OFF_FLAG: AtomicBool = AtomicBool::new(false);

    struct ActiveDrag {
        hwnd: HWND,
        slot_id: String,
        offset_x: f32,
        offset_y: f32,
        cur_x: f32,
        cur_y: f32,
        item_w: f32,
        item_h: f32,
        work_w_dip: f32,
        work_h_dip: f32,
    }

    struct PendingPress {
        hwnd: HWND,
        since: Instant,
        slot_id: String,
        action_id: Option<String>,
        start_x: f32,
        start_y: f32,
        item_x: f32,
        item_y: f32,
        item_w: f32,
        item_h: f32,
        work_w_dip: f32,
        work_h_dip: f32,
        can_drag: bool,
    }

    struct InlineEditor {
        hwnd: HWND,
        slot_id: String,
        widget_type: String,
    }

    struct MonitorSurface {
        info: MonitorInfoData,
        hwnd: HWND,
        swap: Option<MonitorSwapChain>,
        items: Vec<WidgetRenderItem>,
        add_btn_rect: Option<RectF>,
        last_visible: bool,
        last_board_mode: bool,
        last_owner_hwnd: isize,
    }

    struct HostThreadState {
        shared: Arc<Mutex<HostSharedState>>,
        surfaces: Vec<MonitorSurface>,
        slot_springs: HashMap<String, (SpringValue, SpringValue, SpringValue)>,
        dragging: Option<ActiveDrag>,
        pending_press: Option<PendingPress>,
        inline_editor: Option<InlineEditor>,
        start_time: Instant,
    }

    thread_local! {
        static HOST_STATE: RefCell<Option<HostThreadState>> = const { RefCell::new(None) };
    }

    /// Invokes the host event callback strictly AFTER releasing `shared.lock()` and `HOST_STATE` borrows.
    /// Prevents any synchronous event handler from deadlocking on `HostSharedState`.
    fn emit_detached(shared: &Arc<Mutex<HostSharedState>>, ev: WidgetHostEvent) {
        let cb = shared.lock().ok().and_then(|s| s.on_event.clone());
        if let Some(f) = cb {
            f(ev);
        }
    }

    /// Finds the `hwndInsertAfter` handle that seats `my_hwnd` strictly ABOVE `desktop_host`
    /// (`Progman` or `WorkerW` hosting `SHELLDLL_DefView`) and strictly BELOW all normal app windows.
    /// During Win+D (Show Desktop), Windows raises `desktop_host` to the top of the non-topmost band,
    /// so walking upward hits a `WS_EX_TOPMOST` window (or NULL) and returns `HWND_TOP`, keeping
    /// widgets visible above the desktop wallpaper and below topmost surfaces (Taskbar, Gili Notch).
    fn find_z_insert_after_above_desktop(desktop_host: Option<HWND>, my_hwnd: HWND) -> HWND {
        let Some(host) = desktop_host else {
            return HWND_BOTTOM;
        };
        unsafe {
            let mut cur = host;
            for _ in 0..256 {
                let Ok(prev) = GetWindow(cur, GW_HWNDPREV) else {
                    return HWND_TOP;
                };
                if prev.0.is_null() {
                    return HWND_TOP;
                }
                if prev == my_hwnd {
                    cur = prev;
                    continue;
                }
                let ex = GetWindowLongPtrW(prev, GWL_EXSTYLE) as u32;
                if (ex & WS_EX_TOPMOST.0) != 0 {
                    return HWND_TOP;
                }
                return prev;
            }
            HWND_TOP
        }
    }

    /// Checks whether `my_hwnd` currently sits immediately above `desktop_host` in Z-order.
    fn is_seated_above_desktop(desktop_host: HWND, my_hwnd: HWND, max_hops: usize) -> bool {
        unsafe {
            let mut cur = desktop_host;
            for _ in 0..max_hops.max(1) {
                let Ok(prev) = GetWindow(cur, GW_HWNDPREV) else {
                    return false;
                };
                if prev.0.is_null() {
                    return false;
                }
                if prev == my_hwnd {
                    return true;
                }
                cur = prev;
            }
            false
        }
    }

    fn is_lbutton_down() -> bool {
        unsafe { (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0 }
    }

    fn cursor_pos_dip(hwnd: HWND) -> Option<(f32, f32)> {
        unsafe {
            let mut pt = POINT::default();
            if GetCursorPos(&mut pt).is_err() {
                return None;
            }
            let _ = ScreenToClient(hwnd, &mut pt);
            let dpi = (GetDpiForWindow(hwnd) as f32).max(96.0);
            Some((pt.x as f32 * 96.0 / dpi, pt.y as f32 * 96.0 / dpi))
        }
    }

    fn resolve_collisions_for_surfaces(
        cfg: &mut DesktopWidgetsConfig,
        surfaces: &[MonitorSurface],
        priority_slot_id: Option<&str>,
    ) -> bool {
        let mut any_changed = false;
        let primary_bounds = surfaces
            .iter()
            .find(|s| s.info.is_primary)
            .or_else(|| surfaces.first())
            .map(|s| {
                let dpi = unsafe { (GetDpiForWindow(s.hwnd) as f32).max(96.0) };
                (
                    s.info.work_w as f32 * 96.0 / dpi,
                    s.info.work_h as f32 * 96.0 / dpi,
                )
            })
            .unwrap_or((1920.0, 1040.0));

        // Partition slots by monitor so each monitor resolves collisions within its own work area
        let mut monitor_ids: Vec<String> = Vec::new();
        for slot in &cfg.slots {
            if !monitor_ids.iter().any(|m| m == &slot.monitor_id) {
                monitor_ids.push(slot.monitor_id.clone());
            }
        }
        for mon_id in monitor_ids {
            let (work_w_dip, work_h_dip) = surfaces
                .iter()
                .find(|s| s.info.id == mon_id || (s.info.is_primary && mon_id == "primary"))
                .map(|s| {
                    let dpi = unsafe { (GetDpiForWindow(s.hwnd) as f32).max(96.0) };
                    (
                        s.info.work_w as f32 * 96.0 / dpi,
                        s.info.work_h as f32 * 96.0 / dpi,
                    )
                })
                .unwrap_or(primary_bounds);

            let indices: Vec<usize> = cfg
                .slots
                .iter()
                .enumerate()
                .filter(|(_, s)| s.monitor_id == mon_id)
                .map(|(i, _)| i)
                .collect();
            let mut subset: Vec<_> = indices.iter().map(|&i| cfg.slots[i].clone()).collect();
            if resolve_all_rect_collisions(
                &mut subset,
                priority_slot_id,
                cfg.grid_scale,
                work_w_dip,
                work_h_dip,
            ) {
                for (dst_idx, updated) in indices.into_iter().zip(subset.into_iter()) {
                    cfg.slots[dst_idx] = updated;
                }
                any_changed = true;
            }
        }
        any_changed
    }

    fn finalize_drag_or_press(
        st: &mut HostThreadState,
        fallback_hwnd: HWND,
    ) -> Option<(Arc<Mutex<HostSharedState>>, WidgetHostEvent)> {
        if let Some(drag) = st.dragging.take() {
            let max_x = (drag.work_w_dip - drag.item_w - 8.0).max(8.0);
            let max_y = (drag.work_h_dip - drag.item_h - 8.0).max(8.0);
            let final_x = ((drag.cur_x / 16.0).round() * 16.0).clamp(8.0, max_x);
            let final_y = ((drag.cur_y / 16.0).round() * 16.0).clamp(8.0, max_y);

            let mutated_cfg = if let Ok(mut sh) = st.shared.lock() {
                let scale = sh.config.grid_scale;
                let moved_mon = sh
                    .config
                    .slots
                    .iter()
                    .find(|s| s.slot_id == drag.slot_id)
                    .map(|s| s.monitor_id.clone())
                    .unwrap_or_else(|| "primary".to_string());
                let others: Vec<RectF> = sh
                    .config
                    .slots
                    .iter()
                    .filter(|s| s.slot_id != drag.slot_id && s.monitor_id == moved_mon)
                    .map(|s| effective_slot_rect_dp(s, scale, drag.work_w_dip, drag.work_h_dip))
                    .collect();
                let (safe_x, safe_y) = find_non_overlapping_pos(
                    RectF::new(final_x, final_y, drag.item_w, drag.item_h),
                    &others,
                    drag.work_w_dip,
                    drag.work_h_dip,
                    scale,
                );
                let (col, row) = snap_position_to_grid(safe_x, safe_y, scale, 32.0, 48.0);
                if let Some(slot) = sh
                    .config
                    .slots
                    .iter_mut()
                    .find(|s| s.slot_id == drag.slot_id)
                {
                    slot.pos_x = Some(safe_x);
                    slot.pos_y = Some(safe_y);
                    slot.grid_col = col.max(0);
                    slot.grid_row = row.max(0);
                }
                sh.mark_data_changed();
                Some(sh.config.clone())
            } else {
                None
            };

            FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
            return mutated_cfg
                .map(|config| (st.shared.clone(), WidgetHostEvent::ConfigMutated { config }));
        }

        if let Some(press) = st.pending_press.take() {
            if press.since.elapsed() >= Duration::from_millis(550) {
                if let Ok(mut sh) = st.shared.lock() {
                    sh.edit_mode = !sh.edit_mode;
                }
                FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                return None;
            }
            if let Some(act) = press.action_id {
                if let Some(ctrl) = act.strip_prefix("quick_toggle:") {
                    return Some((
                        st.shared.clone(),
                        WidgetHostEvent::ToggleQuickControl {
                            control: ctrl.to_string(),
                        },
                    ));
                }
                if let Some(surf) = st
                    .surfaces
                    .iter()
                    .find(|s| s.hwnd == press.hwnd || s.hwnd == fallback_hwnd)
                {
                    if let Some(item) = surf.items.iter().find(|i| i.slot_id == press.slot_id) {
                        return Some((
                            st.shared.clone(),
                            WidgetHostEvent::OpenFeature {
                                widget_type: item.widget_type.clone(),
                                action_id: Some(act),
                            },
                        ));
                    }
                }
            } else if let Some(surf) = st
                .surfaces
                .iter()
                .find(|s| s.hwnd == press.hwnd || s.hwnd == fallback_hwnd)
            {
                if let Some(item) = surf.items.iter().find(|i| i.slot_id == press.slot_id) {
                    return Some((
                        st.shared.clone(),
                        WidgetHostEvent::OpenFeature {
                            widget_type: item.widget_type.clone(),
                            action_id: None,
                        },
                    ));
                }
            }
        }
        None
    }

    /// Read-only lookup for the top-level shell window hosting the Windows desktop icons (`SHELLDLL_DefView`).
    /// Setting this HWND as owner (`GWLP_HWNDPARENT`) keeps top-level DirectComposition widgets strictly
    /// ABOVE the wallpaper and desktop icons, BELOW normal apps, and visible across Win+D without Explorer injection.
    fn find_desktop_shell_owner_hwnd() -> Option<HWND> {
        unsafe extern "system" fn enum_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
            if let Ok(def_view) = FindWindowExW(
                hwnd,
                HWND::default(),
                w!("SHELLDLL_DefView"),
                PCWSTR::null(),
            ) {
                if !def_view.0.is_null() {
                    let out = &mut *(lparam.0 as *mut Option<HWND>);
                    *out = Some(hwnd);
                    return BOOL(0);
                }
            }
            BOOL(1)
        }

        unsafe {
            if let Ok(progman) = FindWindowW(w!("Progman"), PCWSTR::null()) {
                if !progman.0.is_null() {
                    if let Ok(def_view) = FindWindowExW(
                        progman,
                        HWND::default(),
                        w!("SHELLDLL_DefView"),
                        PCWSTR::null(),
                    ) {
                        if !def_view.0.is_null() {
                            return Some(progman);
                        }
                    }
                }
            }
            let mut found: Option<HWND> = None;
            let _ = EnumWindows(Some(enum_cb), LPARAM(&mut found as *mut _ as isize));
            if found.is_some() {
                return found;
            }
            FindWindowW(w!("Progman"), PCWSTR::null())
                .ok()
                .filter(|h| !h.0.is_null())
        }
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
                WS_CHILD
                    | WS_VISIBLE
                    | WS_BORDER
                    | windows::Win32::UI::WindowsAndMessaging::WINDOW_STYLE(ES_AUTOHSCROLL as u32),
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
            let _ = SetForegroundWindow(parent);
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

    /// Window procedure designed to NEVER panic or double-borrow `HOST_STATE` across Win32 re-entrancy.
    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_WINDOWPOSCHANGING => {
                if STAY_BOTTOM_MODE.load(Ordering::Relaxed) && lparam.0 != 0 {
                    let wp = &mut *(lparam.0 as *mut WINDOWPOS);
                    let owner_raw = DESKTOP_OWNER_RAW.load(Ordering::Relaxed);
                    let desktop_host = if owner_raw != 0 {
                        Some(HWND(owner_raw as *mut std::ffi::c_void))
                    } else {
                        None
                    };
                    if (wp.flags.0 & SWP_NOZORDER.0) == 0 {
                        wp.hwndInsertAfter = find_z_insert_after_above_desktop(desktop_host, hwnd);
                    }
                    if WANT_VISIBLE_MODE.load(Ordering::Relaxed) {
                        wp.flags = SET_WINDOW_POS_FLAGS(wp.flags.0 & !SWP_HIDEWINDOW.0);
                    }
                }
                return LRESULT(0);
            }
            WM_SHOWWINDOW => {
                FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                return DefWindowProcW(hwnd, msg, wparam, lparam);
            }
            WM_SETTINGCHANGE | WM_DISPLAYCHANGE | WM_DPICHANGED => {
                REFRESH_ENV_FLAG.store(true, Ordering::Relaxed);
                FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                return DefWindowProcW(hwnd, msg, wparam, lparam);
            }
            WM_POWERBROADCAST => {
                if wparam.0 == 4 {
                    SCREEN_OFF_FLAG.store(true, Ordering::Relaxed);
                } else if wparam.0 == 18 {
                    SCREEN_OFF_FLAG.store(false, Ordering::Relaxed);
                    FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                }
                return DefWindowProcW(hwnd, msg, wparam, lparam);
            }
            WM_DESTROY => {
                SHOULD_EXIT_FLAG.store(true, Ordering::Relaxed);
                return LRESULT(0);
            }
            WM_CAPTURECHANGED => {
                // Keep active drag alive if LBUTTON is still physically held (WS_EX_NOACTIVATE).
                if !is_lbutton_down() {
                    let deferred = HOST_STATE.with(|cell| {
                        let Ok(mut b) = cell.try_borrow_mut() else {
                            return None;
                        };
                        let st = b.as_mut()?;
                        finalize_drag_or_press(st, hwnd)
                    });
                    if let Some((sh, ev)) = deferred {
                        emit_detached(&sh, ev);
                    }
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
                    let Ok(b) = cell.try_borrow() else {
                        return HitTestResult::Transparent;
                    };
                    let Some(st) = b.as_ref() else {
                        return HitTestResult::Transparent;
                    };
                    if st.dragging.is_some() || st.pending_press.is_some() {
                        return HitTestResult::WidgetContent {
                            slot_id: "__dragging__".into(),
                            action_id: None,
                        };
                    }
                    let (edit_mode, board_visible) = st
                        .shared
                        .lock()
                        .map(|s| (s.edit_mode, s.board_visible))
                        .unwrap_or((false, false));
                    if let Some(surf) = st.surfaces.iter().find(|s| s.hwnd == hwnd) {
                        let res = hit_test_scene(&surf.items, edit_mode, surf.add_btn_rect, px, py);
                        if board_visible && res == HitTestResult::Transparent {
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

                let mut spawn_editor_req: Option<(RectF, String, String)> = None;
                let mut close_prev_editor: Option<InlineEditor> = None;
                let mut deferred_ev: Option<(Arc<Mutex<HostSharedState>>, WidgetHostEvent)> = None;
                let mut should_capture = false;

                HOST_STATE.with(|cell| {
                    let Ok(mut b) = cell.try_borrow_mut() else {
                        return;
                    };
                    let Some(st) = b.as_mut() else { return };
                    let (edit_mode, locked, board_visible) = st
                        .shared
                        .lock()
                        .map(|s| (s.edit_mode, s.config.positions_locked, s.board_visible))
                        .unwrap_or((false, false, false));

                    let hit = st.surfaces.iter().find(|s| s.hwnd == hwnd).map(|surf| {
                        hit_test_scene(&surf.items, edit_mode, surf.add_btn_rect, px, py)
                    });

                    let Some(hit_res) = hit else { return };
                    if st.inline_editor.is_some() {
                        close_prev_editor = st.inline_editor.take();
                    }
                    match hit_res {
                        HitTestResult::Transparent => {
                            if board_visible {
                                if let Ok(mut sh) = st.shared.lock() {
                                    sh.board_visible = false;
                                }
                                FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                            }
                        }
                        HitTestResult::GalleryAddButton => {
                            deferred_ev = Some((st.shared.clone(), WidgetHostEvent::OpenGallery));
                        }
                        HitTestResult::RemoveBadge { slot_id } => {
                            let cfg_opt = st.shared.lock().ok().map(|mut sh| {
                                sh.config.slots.retain(|s| s.slot_id != slot_id);
                                sh.mark_data_changed();
                                sh.config.clone()
                            });
                            if let Some(config) = cfg_opt {
                                deferred_ev = Some((
                                    st.shared.clone(),
                                    WidgetHostEvent::ConfigMutated { config },
                                ));
                            }
                            FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                        }
                        HitTestResult::WidgetContent { slot_id, action_id } => {
                            if let Some(act) = &action_id {
                                if act.starts_with("inline_edit:") {
                                    if let Some(surf) = st.surfaces.iter().find(|s| s.hwnd == hwnd)
                                    {
                                        if let Some(item) =
                                            surf.items.iter().find(|i| i.slot_id == slot_id)
                                        {
                                            if close_prev_editor.is_none() {
                                                close_prev_editor = st.inline_editor.take();
                                            }
                                            spawn_editor_req = Some((
                                                RectF::new(
                                                    item.frame.x + 12.0,
                                                    item.frame.y + item.frame.h - 46.0,
                                                    item.frame.w - 24.0,
                                                    34.0,
                                                ),
                                                slot_id.clone(),
                                                item.widget_type.clone(),
                                            ));
                                            return;
                                        }
                                    }
                                }
                            }

                            if let Some(surf) = st.surfaces.iter().find(|s| s.hwnd == hwnd) {
                                let work_w_dip = surf.info.work_w as f32 * 96.0 / dpi;
                                let work_h_dip = surf.info.work_h as f32 * 96.0 / dpi;
                                if let Some(item) = surf.items.iter().find(|i| i.slot_id == slot_id)
                                {
                                    if edit_mode && !locked {
                                        st.dragging = Some(ActiveDrag {
                                            hwnd,
                                            slot_id: slot_id.clone(),
                                            offset_x: px - item.frame.x,
                                            offset_y: py - item.frame.y,
                                            cur_x: item.frame.x,
                                            cur_y: item.frame.y,
                                            item_w: item.frame.w,
                                            item_h: item.frame.h,
                                            work_w_dip,
                                            work_h_dip,
                                        });
                                        should_capture = true;
                                        FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                                    } else {
                                        st.pending_press = Some(PendingPress {
                                            hwnd,
                                            since: Instant::now(),
                                            slot_id: slot_id.clone(),
                                            action_id,
                                            start_x: px,
                                            start_y: py,
                                            item_x: item.frame.x,
                                            item_y: item.frame.y,
                                            item_w: item.frame.w,
                                            item_h: item.frame.h,
                                            work_w_dip,
                                            work_h_dip,
                                            can_drag: !locked,
                                        });
                                        should_capture = true;
                                        FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                                    }
                                }
                            }
                        }
                    }
                });

                // Execute Win32 calls & host events strictly OUTSIDE HOST_STATE borrow and shared lock
                if let Some(prev) = close_prev_editor {
                    let _ = read_and_close_inline_editor(prev);
                }
                if should_capture {
                    unsafe {
                        let _ = SetCapture(hwnd);
                    }
                }
                if let Some((rect, slot_id, wtype)) = spawn_editor_req {
                    let created = spawn_inline_native_editor(hwnd, rect, dpi, slot_id, wtype, "");
                    HOST_STATE.with(|cell| {
                        if let Ok(mut b) = cell.try_borrow_mut() {
                            if let Some(st) = b.as_mut() {
                                st.inline_editor = created;
                            }
                        }
                    });
                }
                if let Some((sh, ev)) = deferred_ev {
                    emit_detached(&sh, ev);
                }
                return LRESULT(0);
            }
            WM_MOUSEMOVE => {
                let px_raw = (lparam.0 & 0xFFFF) as i16 as f32;
                let py_raw = ((lparam.0 >> 16) & 0xFFFF) as i16 as f32;
                let dpi = (GetDpiForWindow(hwnd) as f32).max(96.0);
                let px = px_raw * 96.0 / dpi;
                let py = py_raw * 96.0 / dpi;

                HOST_STATE.with(|cell| {
                    let Ok(mut b) = cell.try_borrow_mut() else {
                        return;
                    };
                    let Some(st) = b.as_mut() else { return };

                    if st.dragging.is_none() {
                        let should_promote = st.pending_press.as_ref().map(|p| {
                            if p.hwnd != hwnd {
                                return false;
                            }
                            let dx = px - p.start_x;
                            let dy = py - p.start_y;
                            p.can_drag && (dx * dx + dy * dy).sqrt() >= DRAG_THRESHOLD_DP
                        });
                        if should_promote == Some(true) {
                            if let Some(p) = st.pending_press.take() {
                                let off_x = p.start_x - p.item_x;
                                let off_y = p.start_y - p.item_y;
                                let max_x = (p.work_w_dip - p.item_w - 8.0).max(8.0);
                                let max_y = (p.work_h_dip - p.item_h - 8.0).max(8.0);
                                st.dragging = Some(ActiveDrag {
                                    hwnd: p.hwnd,
                                    slot_id: p.slot_id,
                                    offset_x: off_x,
                                    offset_y: off_y,
                                    cur_x: (px - off_x).clamp(8.0, max_x),
                                    cur_y: (py - off_y).clamp(8.0, max_y),
                                    item_w: p.item_w,
                                    item_h: p.item_h,
                                    work_w_dip: p.work_w_dip,
                                    work_h_dip: p.work_h_dip,
                                });
                                FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                            }
                        }
                    }

                    if let Some(drag) = st.dragging.as_mut() {
                        if drag.hwnd == hwnd {
                            let max_x = (drag.work_w_dip - drag.item_w - 8.0).max(8.0);
                            let max_y = (drag.work_h_dip - drag.item_h - 8.0).max(8.0);
                            drag.cur_x = (px - drag.offset_x).clamp(8.0, max_x);
                            drag.cur_y = (py - drag.offset_y).clamp(8.0, max_y);
                            FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                        }
                    }
                });
                return LRESULT(0);
            }
            WM_LBUTTONUP => {
                let _ = ReleaseCapture();
                let deferred = HOST_STATE.with(|cell| {
                    let Ok(mut b) = cell.try_borrow_mut() else {
                        return None;
                    };
                    let st = b.as_mut()?;
                    finalize_drag_or_press(st, hwnd)
                });
                if let Some((sh, ev)) = deferred {
                    emit_detached(&sh, ev);
                }
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

                let deferred = HOST_STATE.with(|cell| {
                    let Ok(mut b) = cell.try_borrow_mut() else {
                        return None;
                    };
                    let st = b.as_mut()?;
                    let edit_mode = st.shared.lock().map(|s| s.edit_mode).unwrap_or(false);
                    let slot_id = st
                        .surfaces
                        .iter()
                        .find(|s| s.hwnd == hwnd)
                        .and_then(|surf| {
                            match hit_test_scene(&surf.items, edit_mode, surf.add_btn_rect, px, py)
                            {
                                HitTestResult::WidgetContent { slot_id, .. } => Some(slot_id),
                                _ => None,
                            }
                        })?;
                    let cfg_opt = st.shared.lock().ok().and_then(|mut sh| {
                        let slot = sh.config.slots.iter_mut().find(|s| s.slot_id == slot_id)?;
                        if slot.widgets.len() > 1 {
                            slot.step_stack(if delta < 0 { 1 } else { -1 });
                            sh.mark_data_changed();
                            FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                            Some(sh.config.clone())
                        } else {
                            None
                        }
                    });
                    cfg_opt.map(|config| {
                        (st.shared.clone(), WidgetHostEvent::ConfigMutated { config })
                    })
                });
                if let Some((sh, ev)) = deferred {
                    emit_detached(&sh, ev);
                }
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

                let hit_info = HOST_STATE.with(|cell| {
                    let Ok(b) = cell.try_borrow() else {
                        return None;
                    };
                    let st = b.as_ref()?;
                    let (edit_mode, en) = st
                        .shared
                        .lock()
                        .map(|s| {
                            (
                                s.edit_mode,
                                s.hub.frontend.language.eq_ignore_ascii_case("en"),
                            )
                        })
                        .unwrap_or((false, false));
                    let surf = st.surfaces.iter().find(|s| s.hwnd == hwnd)?;
                    match hit_test_scene(&surf.items, edit_mode, surf.add_btn_rect, px, py) {
                        HitTestResult::WidgetContent { slot_id, .. } => {
                            let wtype = surf
                                .items
                                .iter()
                                .find(|i| i.slot_id == slot_id)
                                .map(|i| i.widget_type.clone())
                                .unwrap_or_default();
                            Some((slot_id, wtype, en))
                        }
                        _ => None,
                    }
                });

                if let Some((slot_id, wtype, en)) = hit_info {
                    let supported_sizes = widget_catalog()
                        .into_iter()
                        .find(|e| e.widget_type == wtype)
                        .map(|e| e.supported_sizes)
                        .unwrap_or_else(|| {
                            vec![WidgetSize::Small, WidgetSize::Medium, WidgetSize::Large]
                        });
                    if let Ok(menu) = CreatePopupMenu() {
                        let _ = AppendMenuW(
                            menu,
                            MF_STRING,
                            CMD_EDIT_TOGGLE as usize,
                            if en {
                                w!("Edit Mode (Jiggle & Remove)")
                            } else {
                                w!("Mode Edit (Goyang & Hapus)")
                            },
                        );
                        if !supported_sizes.is_empty() {
                            let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
                        }
                        if supported_sizes.contains(&WidgetSize::Small) {
                            let _ = AppendMenuW(
                                menu,
                                MF_STRING,
                                CMD_SIZE_S as usize,
                                if en {
                                    w!("Small Size (S)")
                                } else {
                                    w!("Ukuran Kecil (S)")
                                },
                            );
                        }
                        if supported_sizes.contains(&WidgetSize::Medium) {
                            let _ = AppendMenuW(
                                menu,
                                MF_STRING,
                                CMD_SIZE_M as usize,
                                if en {
                                    w!("Medium Size (M)")
                                } else {
                                    w!("Ukuran Sedang (M)")
                                },
                            );
                        }
                        if supported_sizes.contains(&WidgetSize::Large) {
                            let _ = AppendMenuW(
                                menu,
                                MF_STRING,
                                CMD_SIZE_L as usize,
                                if en {
                                    w!("Large Size (L)")
                                } else {
                                    w!("Ukuran Besar (L)")
                                },
                            );
                        }
                        if wtype == "calendar_agenda" || wtype == "styled_clock" {
                            let _ = AppendMenuW(
                                menu,
                                MF_STRING,
                                CMD_CYCLE_STYLE as usize,
                                if en {
                                    w!("Switch display style")
                                } else {
                                    w!("Ganti tipe / gaya tampilan")
                                },
                            );
                        }
                        if wtype == "photo_frame" {
                            let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
                            let _ = AppendMenuW(
                                menu,
                                MF_STRING,
                                CMD_PHOTO_FOLDER as usize,
                                if en {
                                    w!("Pick Photo Folder...")
                                } else {
                                    w!("Pilih Folder Foto...")
                                },
                            );
                            let _ = AppendMenuW(
                                menu,
                                MF_STRING,
                                CMD_PHOTO_NEXT as usize,
                                if en {
                                    w!("Next Photo")
                                } else {
                                    w!("Foto Berikutnya")
                                },
                            );
                        }
                        if wtype == "storage_treemap" {
                            let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
                            let _ = AppendMenuW(
                                menu,
                                MF_STRING,
                                CMD_STORAGE_FOLDER as usize,
                                if en {
                                    w!("Pick Storage Folder...")
                                } else {
                                    w!("Pilih Folder Penyimpanan...")
                                },
                            );
                            let _ = AppendMenuW(
                                menu,
                                MF_STRING,
                                CMD_STORAGE_SCAN as usize,
                                if en { w!("Rescan") } else { w!("Pindai Ulang") },
                            );
                        }
                        let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
                        let _ = AppendMenuW(
                            menu,
                            MF_STRING,
                            CMD_CUSTOMIZE as usize,
                            if en {
                                w!("Background & Colors")
                            } else {
                                w!("Latar dan warna")
                            },
                        );
                        let _ = AppendMenuW(
                            menu,
                            MF_STRING,
                            CMD_STACK_NEXT as usize,
                            if en {
                                w!("Cycle stacked widget")
                            } else {
                                w!("Ganti widget di tumpukan")
                            },
                        );
                        let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
                        let _ = AppendMenuW(
                            menu,
                            MF_STRING,
                            CMD_DELETE as usize,
                            if en { w!("Remove") } else { w!("Hapus") },
                        );

                        // Foreground owner window before TrackPopupMenu so clicking outside dismisses cleanly
                        let _ = SetForegroundWindow(hwnd);
                        // TrackPopupMenu runs a nested modal loop; HOST_STATE is NOT borrowed here!
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
                        let _ = PostMessageW(hwnd, WM_NULL, WPARAM(0), LPARAM(0));
                        let _ = DestroyMenu(menu);

                        let deferred = HOST_STATE.with(|cell| {
                            let Ok(mut b) = cell.try_borrow_mut() else {
                                return None;
                            };
                            let st = b.as_mut()?;
                            let ev_opt = if let Ok(mut sh) = st.shared.lock() {
                                match cmd {
                                    CMD_EDIT_TOGGLE => {
                                        sh.edit_mode = !sh.edit_mode;
                                        None
                                    }
                                    CMD_CYCLE_STYLE => {
                                        if let Some(s) = sh
                                            .config
                                            .slots
                                            .iter_mut()
                                            .find(|s| s.slot_id == slot_id)
                                        {
                                            let idx = s.active_index % s.widgets.len().max(1);
                                            if let Some(w) = s.widgets.get_mut(idx) {
                                                if !w.settings.is_object() {
                                                    w.settings = serde_json::json!({});
                                                }
                                                if w.widget_type == "calendar_agenda" {
                                                    const CAL: [&str; 4] = [
                                                        "bulan_minimal",
                                                        "bulan_header",
                                                        "tanggal_fokus",
                                                        "tanggal_agenda",
                                                    ];
                                                    let cur = w
                                                        .settings
                                                        .get("calendar_style")
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("bulan_minimal");
                                                    let next_i = CAL
                                                        .iter()
                                                        .position(|&c| c == cur)
                                                        .map(|i| (i + 1) % CAL.len())
                                                        .unwrap_or(0);
                                                    w.settings["calendar_style"] =
                                                        serde_json::json!(CAL[next_i]);
                                                } else if w.widget_type == "styled_clock" {
                                                    const CLK: [&str; 8] = [
                                                        "minimal_digital",
                                                        "kata_indonesia",
                                                        "analog_classic",
                                                        "analog_skeleton",
                                                        "stacked_bold",
                                                        "retro_flip",
                                                        "editorial_thin",
                                                        "dual_zone",
                                                    ];
                                                    let cur = w
                                                        .settings
                                                        .get("clock_style")
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("minimal_digital");
                                                    let next_i = CLK
                                                        .iter()
                                                        .position(|&c| c == cur)
                                                        .map(|i| (i + 1) % CLK.len())
                                                        .unwrap_or(0);
                                                    w.settings["clock_style"] =
                                                        serde_json::json!(CLK[next_i]);
                                                }
                                            }
                                        }
                                        sh.mark_data_changed();
                                        Some(WidgetHostEvent::ConfigMutated {
                                            config: sh.config.clone(),
                                        })
                                    }
                                    CMD_SIZE_S | CMD_SIZE_M | CMD_SIZE_L => {
                                        let sz = match cmd {
                                            CMD_SIZE_S => WidgetSize::Small,
                                            CMD_SIZE_M => WidgetSize::Medium,
                                            _ => WidgetSize::Large,
                                        };
                                        if !supported_sizes.contains(&sz) {
                                            None
                                        } else {
                                            if let Some(s) = sh
                                                .config
                                                .slots
                                                .iter_mut()
                                                .find(|s| s.slot_id == slot_id)
                                            {
                                                s.size = sz;
                                            }
                                            resolve_collisions_for_surfaces(
                                                &mut sh.config,
                                                &st.surfaces,
                                                Some(&slot_id),
                                            );
                                            sh.mark_data_changed();
                                            Some(WidgetHostEvent::ConfigMutated {
                                                config: sh.config.clone(),
                                            })
                                        }
                                    }
                                    CMD_CUSTOMIZE => Some(WidgetHostEvent::OpenCustomizer {
                                        slot_id: slot_id.clone(),
                                    }),
                                    CMD_PHOTO_FOLDER => Some(WidgetHostEvent::OpenFeature {
                                        widget_type: wtype.clone(),
                                        action_id: Some("photo_pick_folder".to_string()),
                                    }),
                                    CMD_PHOTO_NEXT => Some(WidgetHostEvent::OpenFeature {
                                        widget_type: wtype.clone(),
                                        action_id: Some("photo_next".to_string()),
                                    }),
                                    CMD_STORAGE_FOLDER => Some(WidgetHostEvent::OpenFeature {
                                        widget_type: wtype.clone(),
                                        action_id: Some("storage_pick_folder".to_string()),
                                    }),
                                    CMD_STORAGE_SCAN => Some(WidgetHostEvent::OpenFeature {
                                        widget_type: wtype.clone(),
                                        action_id: Some("trigger_storage_scan".to_string()),
                                    }),
                                    CMD_STACK_NEXT => {
                                        if let Some(s) = sh
                                            .config
                                            .slots
                                            .iter_mut()
                                            .find(|s| s.slot_id == slot_id)
                                        {
                                            s.step_stack(1);
                                        }
                                        sh.mark_data_changed();
                                        Some(WidgetHostEvent::ConfigMutated {
                                            config: sh.config.clone(),
                                        })
                                    }
                                    CMD_DELETE => {
                                        sh.config.slots.retain(|s| s.slot_id != slot_id);
                                        sh.mark_data_changed();
                                        Some(WidgetHostEvent::ConfigMutated {
                                            config: sh.config.clone(),
                                        })
                                    }
                                    _ => None,
                                }
                            } else {
                                None
                            };
                            FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                            ev_opt.map(|ev| (st.shared.clone(), ev))
                        });
                        if let Some((sh, ev)) = deferred {
                            emit_detached(&sh, ev);
                        }
                    }
                }
                return LRESULT(0);
            }
            WM_KEYDOWN => {
                let vk = wparam.0 as u16;
                if vk == VK_ESCAPE.0 {
                    let mut ed_to_close: Option<InlineEditor> = None;
                    HOST_STATE.with(|cell| {
                        if let Ok(mut b) = cell.try_borrow_mut() {
                            if let Some(st) = b.as_mut() {
                                ed_to_close = st.inline_editor.take();
                                if ed_to_close.is_none() {
                                    if let Ok(mut sh) = st.shared.lock() {
                                        if sh.board_visible {
                                            sh.board_visible = false;
                                        } else if sh.edit_mode {
                                            sh.edit_mode = false;
                                        }
                                    }
                                }
                                FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                            }
                        }
                    });
                    if let Some(ed) = ed_to_close {
                        let _ = read_and_close_inline_editor(ed);
                    }
                    return LRESULT(0);
                } else if vk == VK_RETURN.0 {
                    let (ed_to_commit, shared_opt) = HOST_STATE.with(|cell| {
                        cell.try_borrow_mut()
                            .ok()
                            .and_then(|mut b| {
                                b.as_mut()
                                    .map(|st| (st.inline_editor.take(), Some(st.shared.clone())))
                            })
                            .unwrap_or((None, None))
                    });
                    if let Some(ed) = ed_to_commit {
                        let (slot_id, widget_type, text) = read_and_close_inline_editor(ed);
                        if !text.trim().is_empty() {
                            if let Some(sh) = shared_opt {
                                emit_detached(
                                    &sh,
                                    WidgetHostEvent::TextInputSubmitted {
                                        slot_id,
                                        widget_type,
                                        text,
                                    },
                                );
                            }
                        }
                        FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                    }
                    return LRESULT(0);
                }
            }
            WM_GETOBJECT => {
                return DefWindowProcW(hwnd, msg, wparam, lparam);
            }
            _ => {}
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    fn create_monitor_surface(
        res: &D2DDeviceResources,
        class_name: PCWSTR,
        info: MonitorInfoData,
        desktop_owner: Option<HWND>,
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
                desktop_owner.unwrap_or_default(),
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
            swap: Some(swap),
            items: Vec::new(),
            add_btn_rect: None,
            last_visible: false,
            last_board_mode: false,
            last_owner_hwnd: desktop_owner.map(|h| h.0 as isize).unwrap_or(0),
        })
    }

    pub fn run_host_loop(shared: Arc<Mutex<HostSharedState>>) -> Result<(), String> {
        struct HostThreadIdGuard;
        impl Drop for HostThreadIdGuard {
            fn drop(&mut self) {
                HOST_THREAD_ID.store(0, Ordering::Release);
            }
        }
        HOST_THREAD_ID.store(unsafe { GetCurrentThreadId() }, Ordering::Release);
        let _tid_guard = HostThreadIdGuard;

        SHOULD_EXIT_FLAG.store(false, Ordering::Relaxed);
        FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);

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

        let desktop_owner = find_desktop_shell_owner_hwnd();
        DESKTOP_OWNER_RAW.store(
            desktop_owner.map(|h| h.0 as isize).unwrap_or(0),
            Ordering::Relaxed,
        );
        let monitors = enumerate_monitors();
        let mut surfaces = Vec::new();
        for mon in monitors {
            if let Ok(surf) = create_monitor_surface(&gpu_res, class_name, mon, desktop_owner) {
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
                pending_press: None,
                inline_editor: None,
                start_time: Instant::now(),
            });
        });

        let mut last_tick = Instant::now();
        let mut last_render_at = Instant::now() - Duration::from_secs(1);
        let mut last_mascot_rebuild = Instant::now() - Duration::from_secs(1);
        let mut last_second_rebuild = Instant::now() - Duration::from_secs(2);
        let mut last_policy_check = Instant::now();
        let mut last_minute_check = Instant::now();
        let mut last_zorder_check = Instant::now() - Duration::from_secs(2);
        let mut last_minute_bucket: u64 = 0;
        let mut minute_tick_dirty = false;
        let mut has_rendered_initial = false;
        let mut prev_spring_active = false;
        let mut last_target_fps: u32 = 0;
        let mut config_needs_collision_check = true;
        let mut local_data_rev: u64 = 0;
        let mut local_audio_rev: u64 = 0;
        let mut cached_cfg = DesktopWidgetsConfig::default();
        let mut cached_hub = WidgetDataHub::default();
        let mut cached_policy = SystemVisualPolicy::default();
        let mut cached_wp: Option<Arc<CachedWallpaperSample>> = None;
        let mut contrast_cache: HashMap<
            String,
            (
                usize,
                u32,
                u32,
                u32,
                u32,
                WidgetStyleConfig,
                WallpaperRegionAnalysis,
            ),
        > = HashMap::new();

        loop {
            // Drain Win32 message queue without holding HOST_STATE
            unsafe {
                let mut msg = MSG::default();
                while PeekMessageW(&mut msg, HWND::default(), 0, 0, PM_REMOVE).as_bool() {
                    if msg.message == WM_KEYDOWN {
                        let vk = msg.wParam.0 as u16;
                        if vk == VK_ESCAPE.0 || vk == VK_RETURN.0 {
                            let ed_match = HOST_STATE.with(|cell| {
                                cell.try_borrow_mut().ok().and_then(|mut b| {
                                    let st = b.as_mut()?;
                                    let active_hwnd = st.inline_editor.as_ref()?.hwnd;
                                    let is_editor_msg = msg.hwnd == active_hwnd
                                        || st.surfaces.iter().any(|s| s.hwnd == msg.hwnd);
                                    if is_editor_msg {
                                        Some((st.inline_editor.take()?, st.shared.clone()))
                                    } else {
                                        None
                                    }
                                })
                            });
                            if let Some((ed, sh)) = ed_match {
                                let (slot_id, widget_type, text) = read_and_close_inline_editor(ed);
                                if vk == VK_RETURN.0 && !text.trim().is_empty() {
                                    emit_detached(
                                        &sh,
                                        WidgetHostEvent::TextInputSubmitted {
                                            slot_id,
                                            widget_type,
                                            text,
                                        },
                                    );
                                }
                                FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                                continue;
                            }
                        }
                    }
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }

            // Poll active direct-desktop drag via GetAsyncKeyState so WS_EX_NOACTIVATE never drops drag!
            let mut ended_pointer_capture = false;
            let drag_deferred = HOST_STATE.with(|cell| {
                let Ok(mut b) = cell.try_borrow_mut() else {
                    return None;
                };
                let st = b.as_mut()?;
                if st.dragging.is_none() && st.pending_press.is_none() {
                    return None;
                }
                let down = is_lbutton_down();
                if down {
                    if let Some(p_hwnd) = st.pending_press.as_ref().map(|p| p.hwnd) {
                        if let Some((px, py)) = cursor_pos_dip(p_hwnd) {
                            let should_promote = st.pending_press.as_ref().map(|p| {
                                let dx = px - p.start_x;
                                let dy = py - p.start_y;
                                p.can_drag && (dx * dx + dy * dy).sqrt() >= DRAG_THRESHOLD_DP
                            });
                            if should_promote == Some(true) {
                                if let Some(p) = st.pending_press.take() {
                                    let off_x = p.start_x - p.item_x;
                                    let off_y = p.start_y - p.item_y;
                                    let max_x = (p.work_w_dip - p.item_w - 8.0).max(8.0);
                                    let max_y = (p.work_h_dip - p.item_h - 8.0).max(8.0);
                                    st.dragging = Some(ActiveDrag {
                                        hwnd: p.hwnd,
                                        slot_id: p.slot_id,
                                        offset_x: off_x,
                                        offset_y: off_y,
                                        cur_x: (px - off_x).clamp(8.0, max_x),
                                        cur_y: (py - off_y).clamp(8.0, max_y),
                                        item_w: p.item_w,
                                        item_h: p.item_h,
                                        work_w_dip: p.work_w_dip,
                                        work_h_dip: p.work_h_dip,
                                    });
                                    FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                                }
                            }
                        }
                    }
                    if let Some(drag) = st.dragging.as_mut() {
                        if let Some((px, py)) = cursor_pos_dip(drag.hwnd) {
                            let max_x = (drag.work_w_dip - drag.item_w - 8.0).max(8.0);
                            let max_y = (drag.work_h_dip - drag.item_h - 8.0).max(8.0);
                            let nx = (px - drag.offset_x).clamp(8.0, max_x);
                            let ny = (py - drag.offset_y).clamp(8.0, max_y);
                            if (nx - drag.cur_x).abs() > 0.25 || (ny - drag.cur_y).abs() > 0.25 {
                                drag.cur_x = nx;
                                drag.cur_y = ny;
                                FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                            }
                        }
                    }
                    None
                } else {
                    ended_pointer_capture = true;
                    let target_hwnd = st
                        .dragging
                        .as_ref()
                        .map(|d| d.hwnd)
                        .or_else(|| st.pending_press.as_ref().map(|p| p.hwnd))
                        .unwrap_or_default();
                    finalize_drag_or_press(st, target_hwnd)
                }
            });
            if ended_pointer_capture {
                unsafe {
                    let _ = ReleaseCapture();
                }
            }
            if let Some((sh, ev)) = drag_deferred {
                emit_detached(&sh, ev);
            }

            // Process incoming commands from Tauri bridge
            let mut should_exit = SHOULD_EXIT_FLAG.load(Ordering::Relaxed);
            let cmds: Vec<HostCommand> = shared
                .lock()
                .map(|mut s| std::mem::take(&mut s.pending_commands))
                .unwrap_or_default();
            let had_cmds = !cmds.is_empty();

            for cmd in cmds {
                match cmd {
                    HostCommand::UpdateConfig(cfg) => {
                        if let Ok(mut sh) = shared.lock() {
                            sh.config = cfg;
                            sh.mark_data_changed();
                        }
                        config_needs_collision_check = true;
                        FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                    }
                    HostCommand::SetEditMode(on) => {
                        if let Ok(mut sh) = shared.lock() {
                            sh.edit_mode = on;
                        }
                        FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                    }
                    HostCommand::ToggleBoard(explicit) => {
                        if let Ok(mut sh) = shared.lock() {
                            sh.board_visible = explicit.unwrap_or(!sh.board_visible);
                        }
                        FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                    }
                    HostCommand::SetStandbyPaused(paused) => {
                        if let Ok(mut sh) = shared.lock() {
                            sh.standby_paused = paused;
                        }
                        FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                    }
                    HostCommand::RefreshWallpaper => {
                        REFRESH_ENV_FLAG.store(true, Ordering::Relaxed);
                    }
                    HostCommand::MarkDirty => {
                        FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                    }
                    HostCommand::Shutdown => {
                        should_exit = true;
                    }
                }
            }

            if config_needs_collision_check {
                config_needs_collision_check = false;
                let fixed_cfg = HOST_STATE.with(|cell| {
                    let Ok(b) = cell.try_borrow() else {
                        return None;
                    };
                    let st = b.as_ref()?;
                    let mut sh = shared.lock().ok()?;
                    if resolve_collisions_for_surfaces(&mut sh.config, &st.surfaces, None) {
                        sh.mark_data_changed();
                        Some(sh.config.clone())
                    } else {
                        None
                    }
                });
                if let Some(config) = fixed_cfg {
                    emit_detached(&shared, WidgetHostEvent::ConfigMutated { config });
                    FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                }
            }

            if REFRESH_ENV_FLAG.swap(false, Ordering::Relaxed) {
                let pol = query_system_visual_policy();
                let wp = resolve_wallpaper_file_path()
                    .and_then(|p| load_wallpaper_sample(&p))
                    .map(Arc::new);

                // Reconcile monitor topology (resolution / DPI / plug / unplug) outside RefCell borrows where needed
                let fresh_monitors = enumerate_monitors();
                let desktop_owner_now = find_desktop_shell_owner_hwnd();
                let mut hwnds_to_reposition: Vec<(HWND, i32, i32, i32, i32)> = Vec::new();
                let mut hwnds_to_destroy: Vec<HWND> = Vec::new();
                let mut active_mon_ids: Vec<String> = Vec::new();
                HOST_STATE.with(|cell| {
                    if let Ok(mut b) = cell.try_borrow_mut() {
                        if let Some(st) = b.as_mut() {
                            let mut kept: Vec<MonitorSurface> = Vec::new();
                            for mut surf in st.surfaces.drain(..) {
                                if let Some(m) =
                                    fresh_monitors.iter().find(|m| m.id == surf.info.id)
                                {
                                    let geom_changed = surf.info.x != m.x
                                        || surf.info.y != m.y
                                        || surf.info.width_px != m.width_px
                                        || surf.info.height_px != m.height_px;
                                    surf.info = m.clone();
                                    if geom_changed {
                                        hwnds_to_reposition.push((
                                            surf.hwnd,
                                            m.x,
                                            m.y,
                                            m.width_px as i32,
                                            m.height_px as i32,
                                        ));
                                    }
                                    active_mon_ids.push(surf.info.id.clone());
                                    kept.push(surf);
                                } else {
                                    surf.swap = None;
                                    hwnds_to_destroy.push(surf.hwnd);
                                }
                            }
                            for m in &fresh_monitors {
                                if !kept.iter().any(|s| s.info.id == m.id) {
                                    if let Ok(new_surf) = create_monitor_surface(
                                        &gpu_res,
                                        class_name,
                                        m.clone(),
                                        desktop_owner_now,
                                    ) {
                                        active_mon_ids.push(new_surf.info.id.clone());
                                        kept.push(new_surf);
                                    }
                                }
                            }
                            st.surfaces = kept;
                        }
                    }
                });
                for (h, x, y, w, hgt) in hwnds_to_reposition {
                    unsafe {
                        let _ = SetWindowPos(
                            h,
                            HWND::default(),
                            x,
                            y,
                            w,
                            hgt,
                            SWP_NOZORDER | SWP_NOACTIVATE,
                        );
                    }
                }
                for h in hwnds_to_destroy {
                    unsafe {
                        let _ = DestroyWindow(h);
                    }
                }
                renderer.prune_monitors(&active_mon_ids);

                if let Ok(mut sh) = shared.lock() {
                    sh.policy = pol;
                    sh.wallpaper = wp;
                    sh.metrics.monitor_count = active_mon_ids.len();
                    sh.mark_data_changed();
                }
                contrast_cache.clear();
                config_needs_collision_check = true;
                FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
            }

            if last_minute_check.elapsed() >= Duration::from_millis(900) {
                last_minute_check = Instant::now();
                let now_min = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() / 60)
                    .unwrap_or(0);
                if now_min != last_minute_bucket {
                    last_minute_bucket = now_min;
                    minute_tick_dirty = true;
                    FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                }
            }

            let standby_paused_fast = shared
                .lock()
                .map(|sh| sh.standby_paused && !sh.board_visible)
                .unwrap_or(false);

            if !standby_paused_fast && last_policy_check.elapsed() >= Duration::from_millis(3000) {
                last_policy_check = Instant::now();
                let prev_pol = shared
                    .lock()
                    .map(|sh| sh.policy.clone())
                    .unwrap_or_default();
                let pol = query_dynamic_visual_policy(&prev_pol);
                let screen_off_now = SCREEN_OFF_FLAG.load(Ordering::Relaxed);
                let ws_mb = query_process_working_set_mb();
                if let Ok(mut sh) = shared.lock() {
                    let policy_changed = sh.policy.fullscreen_or_game_active
                        != pol.fullscreen_or_game_active
                        || sh.policy.power_saver != pol.power_saver
                        || sh.policy.high_contrast != pol.high_contrast
                        || sh.policy.reduced_motion != pol.reduced_motion
                        || (sh.policy.text_scale_factor - pol.text_scale_factor).abs() > 0.01
                        || sh.screen_powered_off != screen_off_now;
                    sh.policy = pol;
                    sh.screen_powered_off = screen_off_now;
                    sh.metrics.working_set_mb = ws_mb;
                    if policy_changed {
                        sh.mark_data_changed();
                        FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                    }
                }
            }

            if should_exit {
                WANT_VISIBLE_MODE.store(false, Ordering::Relaxed);
                let hwnds_to_destroy: Vec<HWND> = HOST_STATE.with(|cell| {
                    cell.borrow_mut()
                        .take()
                        .map(|st| st.surfaces.into_iter().map(|s| s.hwnd).collect())
                        .unwrap_or_default()
                });
                // DestroyWindow sends WM_DESTROY synchronously; HOST_STATE is already dropped here!
                for h in hwnds_to_destroy {
                    unsafe {
                        let _ = DestroyWindow(h);
                    }
                }
                if let Ok(mut sh) = shared.lock() {
                    sh.metrics.running = false;
                }
                break;
            }

            // Lightweight visibility and revision snapshot first so audio/idle ticks avoid cloning Hub and Config
            let (
                cfg_enabled,
                display_mode,
                auto_pause_fullscreen,
                edit_mode,
                board_visible,
                screen_off,
                standby_paused,
                fullscreen_or_game_active,
                shared_data_rev,
                shared_audio_rev,
            ) = {
                let Ok(sh) = shared.lock() else {
                    std::thread::sleep(Duration::from_millis(50));
                    continue;
                };
                (
                    sh.config.enabled,
                    sh.config.display_mode,
                    sh.config.auto_pause_fullscreen,
                    sh.edit_mode,
                    sh.board_visible,
                    sh.screen_powered_off,
                    sh.standby_paused,
                    sh.policy.fullscreen_or_game_active,
                    sh.data_revision,
                    sh.audio_revision,
                )
            };

            let visible_now = !screen_off
                && ((cfg_enabled && display_mode == DisplayMode::DesktopAttached) || board_visible);
            let render_paused = (auto_pause_fullscreen
                && fullscreen_or_game_active
                && !board_visible)
                || (standby_paused && !board_visible);

            STAY_BOTTOM_MODE.store(!board_visible, Ordering::Relaxed);
            WANT_VISIBLE_MODE.store(visible_now, Ordering::Relaxed);

            // Step 1: Collect Win32 window visibility/owner/Z-order updates WITHOUT calling Win32 APIs inside RefCell borrow!
            struct WindowUpdate {
                hwnd: HWND,
                visible: bool,
                board_mode: bool,
                leaving_board_mode: bool,
                owner_change: Option<isize>,
                desktop_host: Option<HWND>,
                needs_redraw: bool,
            }
            let mut win_updates: Vec<WindowUpdate> = Vec::new();
            let do_zorder_check =
                !render_paused && last_zorder_check.elapsed() >= Duration::from_millis(1200);
            let current_desktop_owner = if do_zorder_check {
                last_zorder_check = Instant::now();
                let found = find_desktop_shell_owner_hwnd();
                DESKTOP_OWNER_RAW
                    .store(found.map(|h| h.0 as isize).unwrap_or(0), Ordering::Relaxed);
                found
            } else {
                let raw = DESKTOP_OWNER_RAW.load(Ordering::Relaxed);
                if raw != 0 {
                    Some(HWND(raw as *mut std::ffi::c_void))
                } else {
                    find_desktop_shell_owner_hwnd()
                }
            };
            let desired_owner_raw = if !board_visible {
                current_desktop_owner.map(|h| h.0 as isize).unwrap_or(0)
            } else {
                0
            };

            HOST_STATE.with(|cell| {
                if let Ok(mut b) = cell.try_borrow_mut() {
                    if let Some(st) = b.as_mut() {
                        let surf_count = st.surfaces.len();
                        for surf in &mut st.surfaces {
                            let owner_changed = surf.last_owner_hwnd != desired_owner_raw;
                            let vis_changed = surf.last_visible != visible_now;
                            let mode_changed = surf.last_board_mode != board_visible;

                            let mut needs_z_restore = false;
                            if visible_now && !board_visible && do_zorder_check {
                                let hidden_or_min = unsafe {
                                    !IsWindowVisible(surf.hwnd).as_bool()
                                        || IsIconic(surf.hwnd).as_bool()
                                };
                                let z_drifted = current_desktop_owner
                                    .map(|dh| {
                                        !is_seated_above_desktop(dh, surf.hwnd, surf_count + 2)
                                    })
                                    .unwrap_or(false);
                                if hidden_or_min || z_drifted {
                                    needs_z_restore = true;
                                }
                            }

                            if vis_changed || mode_changed || owner_changed || needs_z_restore {
                                let owner_change = if owner_changed {
                                    Some(desired_owner_raw)
                                } else {
                                    None
                                };
                                let leaving_board_mode = surf.last_board_mode && !board_visible;
                                surf.last_visible = visible_now;
                                surf.last_board_mode = board_visible;
                                surf.last_owner_hwnd = desired_owner_raw;
                                win_updates.push(WindowUpdate {
                                    hwnd: surf.hwnd,
                                    visible: visible_now,
                                    board_mode: board_visible,
                                    leaving_board_mode,
                                    owner_change,
                                    desktop_host: current_desktop_owner,
                                    needs_redraw: vis_changed || mode_changed,
                                });
                            }
                        }
                    }
                }
            });

            // Step 2: Apply ShowWindow / SetWindowPos / GWLP_HWNDPARENT strictly OUTSIDE any RefCell borrow!
            for upd in win_updates {
                unsafe {
                    if let Some(owner_ptr) = upd.owner_change {
                        let _ = SetWindowLongPtrW(upd.hwnd, GWLP_HWNDPARENT, owner_ptr);
                    }
                    if upd.visible {
                        if upd.leaving_board_mode || !upd.board_mode {
                            // Explicitly strip WS_EX_TOPMOST before seating above desktop so widgets never stay stuck on top
                            let _ = SetWindowPos(
                                upd.hwnd,
                                HWND_NOTOPMOST,
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                            );
                        }
                        let z_target = if upd.board_mode {
                            HWND_TOPMOST
                        } else {
                            find_z_insert_after_above_desktop(upd.desktop_host, upd.hwnd)
                        };
                        let _ = ShowWindow(upd.hwnd, SW_SHOWNOACTIVATE);
                        let _ = SetWindowPos(
                            upd.hwnd,
                            z_target,
                            0,
                            0,
                            0,
                            0,
                            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                        );
                    } else {
                        let _ = ShowWindow(upd.hwnd, SW_HIDE);
                    }
                }
                if upd.needs_redraw {
                    FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                }
            }

            // Step 3: Build scene graph, advance springs, and render Direct2D frames with adaptive pacing
            let now = Instant::now();
            let dt = now.duration_since(last_tick).as_secs_f32().min(0.05);
            last_tick = now;

            let mut target_fps = last_target_fps;
            let mut device_lost = false;
            let force_redraw = FORCE_REDRAW_FLAG.swap(false, Ordering::Relaxed);
            let data_changed = shared_data_rev != local_data_rev;
            let audio_changed = shared_audio_rev != local_audio_rev;
            let interaction_active = HOST_STATE.with(|cell| {
                cell.try_borrow()
                    .ok()
                    .and_then(|b| {
                        b.as_ref()
                            .map(|st| st.dragging.is_some() || st.pending_press.is_some())
                    })
                    .unwrap_or(false)
            });

            let min_frame_interval = match last_target_fps {
                0 => Duration::ZERO,
                1 => Duration::from_millis(900),
                2..=12 => Duration::from_millis(95),
                13..=30 => Duration::from_millis(30),
                _ => Duration::from_millis(14),
            };
            let urgent_redraw = !has_rendered_initial
                || force_redraw
                || had_cmds
                || data_changed
                || minute_tick_dirty
                || interaction_active;
            let has_continuous_work = audio_changed
                || prev_spring_active
                || last_target_fps > 0
                || (edit_mode && !cached_policy.reduced_motion);
            let paced_ready = last_render_at.elapsed() >= min_frame_interval;
            let should_render = visible_now
                && !render_paused
                && (urgent_redraw || (has_continuous_work && paced_ready));

            if !should_render {
                if !visible_now || render_paused {
                    prev_spring_active = false;
                    if last_target_fps != 0 || force_redraw || had_cmds || !has_rendered_initial {
                        if let Ok(mut sh) = shared.lock() {
                            let (fps, paused_reason) = compute_adaptive_target_fps_with_standby(
                                &sh.config,
                                edit_mode,
                                false,
                                false,
                                false,
                                screen_off,
                                board_visible,
                                &sh.policy,
                                standby_paused,
                            );
                            sh.metrics.edit_mode = edit_mode;
                            sh.metrics.board_visible = board_visible;
                            sh.metrics.active_widget_count = sh.config.slots.len();
                            sh.metrics.target_fps = fps;
                            sh.metrics.last_dirty_rects = 0;
                            sh.metrics.paused_reason = paused_reason;
                            sh.metrics.power_saver = sh.policy.power_saver;
                            sh.metrics.high_contrast = sh.policy.high_contrast;
                            sh.metrics.reduced_motion = sh.policy.reduced_motion;
                            sh.metrics.text_scale_factor = sh.policy.text_scale_factor;
                        }
                        last_target_fps = 0;
                    }
                    target_fps = 0;
                }
            } else {
                // Only clone full Config/Hub when non-audio data actually changed; audio ticks copy 64 bytes only.
                if data_changed || !has_rendered_initial {
                    if let Ok(sh) = shared.lock() {
                        cached_cfg = sh.config.clone();
                        cached_hub = sh.hub.clone();
                        cached_policy = sh.policy.clone();
                        cached_wp = sh.wallpaper.clone();
                        local_data_rev = sh.data_revision;
                        local_audio_rev = sh.audio_revision;
                    }
                } else if audio_changed {
                    if let Ok(sh) = shared.lock() {
                        cached_hub.audio_bands = sh.hub.audio_bands;
                        local_audio_rev = sh.audio_revision;
                    }
                }

                let cfg = &cached_cfg;
                let hub = &cached_hub;
                let policy = &cached_policy;
                let wp = &cached_wp;
                let wp_ptr = wp.as_ref().map(|a| Arc::as_ptr(a) as usize).unwrap_or(0);
                if data_changed || !has_rendered_initial {
                    contrast_cache.retain(|id, _| cfg.slots.iter().any(|s| s.slot_id == *id));
                }

                let full_scene_rebuild = !has_rendered_initial
                    || data_changed
                    || minute_tick_dirty
                    || force_redraw
                    || had_cmds
                    || edit_mode
                    || interaction_active
                    || prev_spring_active
                    || last_target_fps == 1
                    || (8..=12).contains(&last_target_fps);

                let mascot_tick_due = last_mascot_rebuild.elapsed() >= Duration::from_millis(95);
                let second_tick_due = last_second_rebuild.elapsed() >= Duration::from_millis(950);
                let mut rebuilt_mascot = false;
                let mut rebuilt_second = false;

                HOST_STATE.with(|cell| {
                    let Ok(mut b) = cell.try_borrow_mut() else {
                        return;
                    };
                    let Some(st) = b.as_mut() else { return };

                    let mut any_spring_active = st.dragging.is_some() || st.pending_press.is_some();
                    let elapsed_secs = st.start_time.elapsed().as_secs_f32();
                    let mut total_dirty = 0usize;

                    for surf in &mut st.surfaces {
                        let dpi = unsafe { (GetDpiForWindow(surf.hwnd) as f32).max(96.0) };
                        if let Some(ref mut swap) = surf.swap {
                            let _ =
                                swap.resize(&gpu_res, surf.info.width_px, surf.info.height_px, dpi);
                        }
                        let mon_w_dip = surf.info.width_px as f32 * 96.0 / dpi;
                        let mon_h_dip = surf.info.height_px as f32 * 96.0 / dpi;
                        let work_w_dip = surf.info.work_w as f32 * 96.0 / dpi;
                        let work_h_dip = surf.info.work_h as f32 * 96.0 / dpi;
                        let cell_step =
                            (GRID_SMALL_DP + GRID_GAP_DP) * cfg.grid_scale.clamp(0.8, 1.35);

                        let matching_slots: Vec<_> = cfg
                            .slots
                            .iter()
                            .filter(|slot| {
                                slot.monitor_id == surf.info.id
                                    || (surf.info.is_primary && slot.monitor_id == "primary")
                            })
                            .collect();

                        // Audio-only fast path: rebuild audio_visualizer every frame, plus live_mascot (10 FPS) & seconds/timer (1 FPS)
                        if !full_scene_rebuild && surf.items.len() == matching_slots.len() {
                            for (idx, slot) in matching_slots.iter().enumerate() {
                                let w_active = slot.active_widget();
                                let wtype = w_active.map(|w| w.widget_type.as_str()).unwrap_or("");
                                let is_vis = wtype == "audio_visualizer";
                                let is_mascot = wtype == "live_mascot" && mascot_tick_due;
                                let is_sec_tick = second_tick_due
                                    && ((wtype == "styled_clock"
                                        && w_active
                                            .and_then(|w| w.settings.get("show_seconds"))
                                            .and_then(|v| v.as_bool())
                                            .unwrap_or(false))
                                        || (wtype == "time_tracker"
                                            && hub
                                                .time_tracker
                                                .projects
                                                .iter()
                                                .any(|p| p.running_since_epoch.is_some())));
                                if !is_vis && !is_mascot && !is_sec_tick {
                                    continue;
                                }
                                if is_mascot {
                                    rebuilt_mascot = true;
                                }
                                if is_sec_tick {
                                    rebuilt_second = true;
                                }
                                let anim_rect = surf.items[idx].frame;
                                let nx = (anim_rect.x / mon_w_dip.max(1.0)).clamp(0.0, 1.0);
                                let ny = (anim_rect.y / mon_h_dip.max(1.0)).clamp(0.0, 1.0);
                                let nw = (anim_rect.w / mon_w_dip.max(1.0)).clamp(0.01, 1.0);
                                let nh = (anim_rect.h / mon_h_dip.max(1.0)).clamp(0.01, 1.0);
                                let style_ref = slot
                                    .active_widget()
                                    .and_then(|w| w.style_override.as_ref())
                                    .unwrap_or(&cfg.global_theme);
                                let qx = (nx * 1000.0).round() as u32;
                                let qy = (ny * 1000.0).round() as u32;
                                let qw = (nw * 1000.0).round() as u32;
                                let qh = (nh * 1000.0).round() as u32;
                                let analysis = match contrast_cache.get(&slot.slot_id) {
                                    Some((p, x, y, w, h, cached_style, cached))
                                        if *p == wp_ptr
                                            && *x == qx
                                            && *y == qy
                                            && *w == qw
                                            && *h == qh
                                            && cached_style == style_ref =>
                                    {
                                        cached.clone()
                                    }
                                    _ => analyze_region_for_style(
                                        wp.as_deref(),
                                        style_ref,
                                        nx,
                                        ny,
                                        nw,
                                        nh,
                                    ),
                                };
                                let mut item = build_widget_render_item_with_policy(
                                    slot,
                                    anim_rect,
                                    &cfg.global_theme,
                                    &analysis,
                                    hub,
                                    elapsed_secs,
                                    policy.high_contrast,
                                );
                                item.scale = surf.items[idx].scale;
                                item.compute_hit_regions(edit_mode);
                                surf.items[idx] = item;
                            }
                        } else {
                            let mut built = Vec::with_capacity(matching_slots.len());
                            for slot in matching_slots {
                                let mut target_rect =
                                    slot_rect_dp(slot, cfg.grid_scale, 32.0, 48.0);
                                // Keep legacy auto-grid slots from ever clipping behind the taskbar
                                if slot.pos_x.is_none()
                                    && slot.pos_y.is_none()
                                    && target_rect.y + target_rect.h > work_h_dip - 12.0
                                {
                                    let max_rows =
                                        (((work_h_dip - 60.0) / cell_step).floor() as i32).max(1);
                                    let overflow_col = slot.grid_row / max_rows;
                                    let wrapped_row = slot.grid_row % max_rows;
                                    target_rect.x += (overflow_col as f32) * 2.0 * cell_step;
                                    target_rect.y = 48.0 + (wrapped_row as f32) * cell_step;
                                }
                                let max_x = (work_w_dip - target_rect.w - 8.0).max(8.0);
                                let max_y = (work_h_dip - target_rect.h - 8.0).max(8.0);
                                target_rect.x = target_rect.x.clamp(8.0, max_x);
                                target_rect.y = target_rect.y.clamp(8.0, max_y);

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

                                let entry =
                                    st.slot_springs.entry(slot.slot_id.clone()).or_insert((
                                        SpringValue::settled(target_rect.x),
                                        SpringValue::settled(target_rect.y),
                                        SpringValue {
                                            value: 0.96,
                                            velocity: 0.0,
                                            target: 1.0,
                                        },
                                    ));
                                entry.0.set_target(
                                    target_rect.x,
                                    policy.reduced_motion || is_dragging,
                                );
                                entry.1.set_target(
                                    target_rect.y,
                                    policy.reduced_motion || is_dragging,
                                );
                                entry.2.set_target(
                                    if is_dragging { 1.04 } else { 1.0 },
                                    policy.reduced_motion,
                                );

                                let a0 =
                                    entry
                                        .0
                                        .step(dt, SpringParams::DEFAULT, policy.reduced_motion);
                                let a1 =
                                    entry
                                        .1
                                        .step(dt, SpringParams::DEFAULT, policy.reduced_motion);
                                let a2 =
                                    entry
                                        .2
                                        .step(dt, SpringParams::DEFAULT, policy.reduced_motion);
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
                                let qx = (nx * 1000.0).round() as u32;
                                let qy = (ny * 1000.0).round() as u32;
                                let qw = (nw * 1000.0).round() as u32;
                                let qh = (nh * 1000.0).round() as u32;
                                let analysis = match contrast_cache.get(&slot.slot_id) {
                                    Some((p, x, y, w, h, cached_style, cached))
                                        if *p == wp_ptr
                                            && *x == qx
                                            && *y == qy
                                            && *w == qw
                                            && *h == qh
                                            && cached_style == style_ref =>
                                    {
                                        cached.clone()
                                    }
                                    _ => {
                                        let computed = analyze_region_for_style(
                                            wp.as_deref(),
                                            style_ref,
                                            nx,
                                            ny,
                                            nw,
                                            nh,
                                        );
                                        contrast_cache.insert(
                                            slot.slot_id.clone(),
                                            (
                                                wp_ptr,
                                                qx,
                                                qy,
                                                qw,
                                                qh,
                                                style_ref.clone(),
                                                computed.clone(),
                                            ),
                                        );
                                        computed
                                    }
                                };

                                let mut item = build_widget_render_item_with_policy(
                                    slot,
                                    anim_rect,
                                    &cfg.global_theme,
                                    &analysis,
                                    hub,
                                    elapsed_secs,
                                    policy.high_contrast,
                                );
                                item.scale = entry.2.value;
                                if edit_mode && !is_dragging {
                                    let hash = slot.slot_id.bytes().fold(0u64, |acc, b| {
                                        acc.wrapping_mul(31).wrapping_add(b as u64)
                                    });
                                    item.edit_jiggle_deg = edit_jiggle_degrees(
                                        hash,
                                        elapsed_secs,
                                        policy.reduced_motion,
                                    );
                                }
                                item.compute_hit_regions(edit_mode);
                                built.push(item);
                            }

                            surf.items = built;
                        }

                        surf.add_btn_rect = if edit_mode {
                            Some(RectF::new(mon_w_dip - 176.0, 24.0, 148.0, 36.0))
                        } else {
                            None
                        };

                        // Use full present during motion/drag/edit to prevent flip-sequential stale trails
                        let anim_active = renderer.has_active_animations();
                        let full_frame =
                            force_redraw || any_spring_active || anim_active || edit_mode;
                        if let Some(ref mut swap) = surf.swap {
                            let (dirty_cnt, pres_res) = renderer.render_frame(
                                &surf.info.id,
                                &gpu_res,
                                swap,
                                &surf.items,
                                edit_mode,
                                board_visible,
                                surf.add_btn_rect,
                                policy,
                                full_frame,
                                dt,
                            );
                            total_dirty += dirty_cnt;
                            if let Err(err) = pres_res {
                                if D2DDeviceResources::is_device_lost(err.code()) {
                                    device_lost = true;
                                }
                            }
                        }
                    }
                    if full_scene_rebuild || rebuilt_mascot {
                        last_mascot_rebuild = Instant::now();
                    }
                    if full_scene_rebuild || rebuilt_second {
                        last_second_rebuild = Instant::now();
                    }
                    if renderer.has_active_animations() {
                        any_spring_active = true;
                    }
                    if total_dirty > 0 {
                        unsafe {
                            let _ = gpu_res.dcomp_device.Commit();
                        }
                    }

                    let has_running_timer = cfg.slots.iter().any(|s| {
                        s.active_widget()
                            .map(|w| w.widget_type == "time_tracker")
                            .unwrap_or(false)
                    }) && hub
                        .time_tracker
                        .projects
                        .iter()
                        .any(|p| p.running_since_epoch.is_some());

                    let has_active_audio = hub.audio_bands.iter().any(|&v| v > 0.005);
                    let (fps, paused_reason) = compute_adaptive_target_fps_with_standby(
                        cfg,
                        edit_mode,
                        any_spring_active,
                        has_running_timer,
                        has_active_audio,
                        screen_off,
                        board_visible,
                        policy,
                        standby_paused,
                    );
                    target_fps = fps;
                    last_target_fps = fps;
                    prev_spring_active = any_spring_active;
                    has_rendered_initial = true;
                    minute_tick_dirty = false;
                    last_render_at = Instant::now();

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
            }

            // Handle GPU device lost cleanly (sleep, RDP, GPU switch) without hitting WINDOW_ALREADY_COMPOSED
            if device_lost {
                // First release every old IDCompositionTarget and commit so CreateTargetForHwnd succeeds
                HOST_STATE.with(|cell| {
                    if let Ok(mut b) = cell.try_borrow_mut() {
                        if let Some(st) = b.as_mut() {
                            for surf in &mut st.surfaces {
                                surf.swap = None;
                            }
                        }
                    }
                });
                unsafe {
                    gpu_res.d2d_context.SetTarget(None);
                    let _ = gpu_res.dcomp_device.Commit();
                }
                renderer.clear_caches();

                if let Ok(new_res) = D2DDeviceResources::create() {
                    if let Ok(new_rend) = D2DWidgetRenderer::new(&new_res) {
                        gpu_res = new_res;
                        renderer = new_rend;
                        HOST_STATE.with(|cell| {
                            if let Ok(mut b) = cell.try_borrow_mut() {
                                if let Some(st) = b.as_mut() {
                                    for surf in &mut st.surfaces {
                                        let dpi = unsafe {
                                            (GetDpiForWindow(surf.hwnd) as f32).max(96.0)
                                        };
                                        if let Ok(new_swap) = MonitorSwapChain::create(
                                            &gpu_res,
                                            surf.hwnd,
                                            surf.info.width_px,
                                            surf.info.height_px,
                                            dpi,
                                        ) {
                                            surf.swap = Some(new_swap);
                                        }
                                    }
                                    FORCE_REDRAW_FLAG.store(true, Ordering::Relaxed);
                                }
                            }
                        });
                    }
                }
            }

            let wait_ms: u32 =
                if !should_render && visible_now && !render_paused && has_continuous_work {
                    min_frame_interval
                        .saturating_sub(last_render_at.elapsed())
                        .as_millis()
                        .clamp(1, 1000) as u32
                } else {
                    match target_fps {
                        0 => 1000,
                        1 => 500,
                        8..=12 => 100,
                        13..=30 => 33,
                        _ => 16,
                    }
                };
            // Kernel wait: 0% CPU while idle, wakes up in <0.1ms on any mouse hover/click/drag message
            unsafe {
                let _ = MsgWaitForMultipleObjects(None, false, wait_ms, QS_ALLINPUT);
            }
        }

        Ok(())
    }
}
