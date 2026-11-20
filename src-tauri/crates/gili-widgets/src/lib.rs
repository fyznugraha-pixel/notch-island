pub mod config;
pub mod contrast;
pub mod d2d_host;
pub mod layout;
pub mod providers;
pub mod spring;
pub mod widgets;

use crate::config::{
    config_path, load_config_from, normalize_config, save_config_atomic, DesktopWidgetsConfig,
};
use crate::contrast::{analyze_region_for_style, WallpaperRegionAnalysis};
use crate::d2d_host::{
    spawn_native_host_thread, HostCommand, HostSharedState, WidgetHostEvent, WidgetRuntimeMetrics,
};
use crate::providers::local_stores::{
    default_world_clocks, expenses_dpapi_path, load_expenses_encrypted, local_widget_store_path,
    save_expenses_encrypted, CountdownMoment, ExpenseLedger, KanbanBoard, PhotoSlideshowState,
    QuickSnippetItem, RecentFilesState, ShortcutEntry, StickyNote, TimeTrackerState,
    WorldClockZone,
};
use crate::providers::prayer_calc::{build_hijri_holiday_snapshot, build_prayer_snapshot};
use crate::providers::system_data::{
    read_windows_dark_mode, sample_system_perf, sample_top_processes_readonly,
    QuickControlsSnapshot,
};
use crate::providers::{FrontendMirrorSnapshot, MediaSnapshot};
use serde::{de::DeserializeOwned, Serialize};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

fn load_json_store<T: DeserializeOwned + Default>(name: &str) -> T {
    let p = local_widget_store_path(name);
    std::fs::read_to_string(p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_json_store<T: Serialize>(name: &str, value: &T) -> Result<(), String> {
    let p = local_widget_store_path(name);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Gagal membuat direktori: {e}"))?;
    }
    let json = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Gagal serialisasi data lokal: {e}"))?;
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, json.as_bytes()).map_err(|e| format!("Gagal menulis berkas: {e}"))?;
    if p.exists() {
        let _ = std::fs::remove_file(&p);
    }
    std::fs::rename(&tmp, &p).map_err(|e| format!("Gagal mengganti berkas: {e}"))?;
    Ok(())
}

pub struct DesktopWidgetEngine {
    shared: Arc<Mutex<HostSharedState>>,
    host_thread: Mutex<Option<JoinHandle<()>>>,
}

impl DesktopWidgetEngine {
    pub fn new() -> Self {
        let cfg = load_config_from(&config_path());
        let mut state = HostSharedState::new(cfg);

        // Hydrate local stores on startup
        state.hub.notes = load_json_store::<Vec<StickyNote>>("desktop_sticky_notes.json");
        state.hub.kanban = load_json_store::<KanbanBoard>("desktop_kanban.json");
        state.hub.time_tracker = load_json_store::<TimeTrackerState>("desktop_time_tracker.json");
        state.hub.expenses = load_expenses_encrypted(&expenses_dpapi_path());
        state.hub.shortcuts = load_json_store::<Vec<ShortcutEntry>>("desktop_shortcuts.json");
        state.hub.recent_files = load_json_store::<RecentFilesState>("desktop_recent_files.json");
        state.hub.photo_frame = load_json_store::<PhotoSlideshowState>("desktop_photo_frame.json");
        state.hub.countdowns = load_json_store::<Vec<CountdownMoment>>("desktop_countdowns.json");
        state.hub.snippets = load_json_store::<Vec<QuickSnippetItem>>("desktop_snippets.json");
        let saved_wc = load_json_store::<Vec<WorldClockZone>>("desktop_world_clocks.json");
        state.hub.world_clocks = if saved_wc.is_empty() {
            default_world_clocks()
        } else {
            saved_wc
        };

        // Hydrate offline Indonesian providers immediately (Jakarta default unless user customizes)
        let (year, month, day, hour, min, _, _) = widgets::local_datetime_parts();
        let holidays_path = config::gili_data_dir().join("skb3menteri_holidays.json");
        state.hub.hijri_holidays =
            build_hijri_holiday_snapshot(year, month as i32, day as i32, 0, &holidays_path);
        let tz_offset_hours = widgets::local_utc_offset_hours();
        state.hub.prayer = build_prayer_snapshot(
            "Jakarta",
            -6.2088,
            106.8456,
            tz_offset_hours,
            year,
            month as i32,
            day as i32,
            hour as i32,
            min as i32,
            state.hub.hijri_holidays.is_ramadan,
        );
        state.hub.quick_controls = QuickControlsSnapshot {
            wifi_enabled: None,
            bluetooth_enabled: None,
            dark_mode_enabled: read_windows_dark_mode(),
            audio_muted: None,
        };
        state.hub.system = sample_system_perf(None, None);
        state.hub.top_processes = sample_top_processes_readonly(5);

        Self {
            shared: Arc::new(Mutex::new(state)),
            host_thread: Mutex::new(None),
        }
    }

    pub fn set_event_handler<F>(&self, cb: F)
    where
        F: Fn(WidgetHostEvent) + Send + Sync + 'static,
    {
        if let Ok(mut st) = self.shared.lock() {
            st.on_event = Some(Arc::new(cb));
        }
    }

    pub fn start_host_if_needed(&self) {
        let Ok(mut slot) = self.host_thread.lock() else {
            return;
        };
        if slot.is_some() {
            return;
        }
        *slot = Some(spawn_native_host_thread(self.shared.clone()));
    }

    pub fn shutdown(&self) {
        if let Ok(mut st) = self.shared.lock() {
            st.pending_commands.push(HostCommand::Shutdown);
        }
        if let Ok(mut slot) = self.host_thread.lock() {
            if let Some(handle) = slot.take() {
                let _ = handle.join();
            }
        }
    }

    pub fn get_config(&self) -> DesktopWidgetsConfig {
        self.shared
            .lock()
            .map(|s| s.config.clone())
            .unwrap_or_default()
    }

    pub fn save_config(&self, cfg: DesktopWidgetsConfig) -> Result<DesktopWidgetsConfig, String> {
        let clean = normalize_config(cfg);
        save_config_atomic(&config_path(), &clean)?;
        if clean.enabled {
            self.start_host_if_needed();
        }
        if let Ok(mut st) = self.shared.lock() {
            st.config = clean.clone();
            st.pending_commands.push(HostCommand::UpdateConfig(clean.clone()));
        }
        Ok(clean)
    }

    pub fn set_edit_mode(&self, enabled: bool) {
        if let Ok(mut st) = self.shared.lock() {
            st.edit_mode = enabled;
            st.pending_commands.push(HostCommand::SetEditMode(enabled));
        }
    }

    pub fn toggle_board(&self, explicit: Option<bool>) -> bool {
        self.start_host_if_needed();
        if let Ok(mut st) = self.shared.lock() {
            let next = explicit.unwrap_or(!st.board_visible);
            st.board_visible = next;
            st.pending_commands.push(HostCommand::ToggleBoard(Some(next)));
            return next;
        }
        false
    }

    pub fn update_media(&self, media: MediaSnapshot) {
        if let Ok(mut st) = self.shared.lock() {
            st.hub.media = media;
            st.pending_commands.push(HostCommand::MarkDirty);
        }
    }

    pub fn update_frontend_mirror(&self, mirror: FrontendMirrorSnapshot) {
        if let Ok(mut st) = self.shared.lock() {
            if let (Some(lat), Some(lon)) = (mirror.custom_lat, mirror.custom_lon) {
                let (year, month, day, hour, min, _, _) = widgets::local_datetime_parts();
                let city = mirror
                    .custom_city_name
                    .clone()
                    .unwrap_or_else(|| "Lokasi Pilihan".into());
                let tz_offset_hours = widgets::local_utc_offset_hours();
                st.hub.prayer = build_prayer_snapshot(
                    &city,
                    lat,
                    lon,
                    tz_offset_hours,
                    year,
                    month as i32,
                    day as i32,
                    hour as i32,
                    min as i32,
                    st.hub.hijri_holidays.is_ramadan,
                );
            }
            st.hub.frontend = mirror;
            st.pending_commands.push(HostCommand::MarkDirty);
        }
    }

    pub fn update_system_telemetry(
        &self,
        gpu_name: Option<String>,
        gpu_pct: Option<u32>,
        gpu_temp_c: Option<u32>,
        net_down_mbps: f32,
        net_up_mbps: f32,
        wifi: Option<bool>,
        bluetooth: Option<bool>,
        audio_muted: Option<bool>,
    ) {
        let gpu_override = gpu_name.map(|n| (n, gpu_pct, gpu_temp_c));
        let perf = sample_system_perf(Some((net_down_mbps, net_up_mbps)), gpu_override);
        let procs = sample_top_processes_readonly(5);

        if let Ok(mut st) = self.shared.lock() {
            st.hub.system = perf;
            st.hub.top_processes = procs;
            st.hub.quick_controls.dark_mode_enabled = read_windows_dark_mode();
            if let Some(v) = wifi {
                st.hub.quick_controls.wifi_enabled = Some(v);
            }
            if let Some(v) = bluetooth {
                st.hub.quick_controls.bluetooth_enabled = Some(v);
            }
            if let Some(v) = audio_muted {
                st.hub.quick_controls.audio_muted = Some(v);
            }
            st.pending_commands.push(HostCommand::MarkDirty);
        }
    }

    pub fn update_audio_bands(&self, bands: [f32; 16]) {
        if let Ok(mut st) = self.shared.lock() {
            st.hub.audio_bands = bands;
            st.pending_commands.push(HostCommand::MarkDirty);
        }
    }

    pub fn with_hub_mut<R>(&self, f: impl FnOnce(&mut providers::WidgetDataHub) -> R) -> Option<R> {
        let mut st = self.shared.lock().ok()?;
        let out = f(&mut st.hub);
        st.pending_commands.push(HostCommand::MarkDirty);
        Some(out)
    }

    pub fn persist_expenses(&self) -> Result<(), String> {
        let ledger: ExpenseLedger = self
            .shared
            .lock()
            .map(|s| s.hub.expenses.clone())
            .map_err(|_| "Lock gagal".to_string())?;
        save_expenses_encrypted(&expenses_dpapi_path(), &ledger)
    }

    pub fn persist_notes(&self) -> Result<(), String> {
        let notes = self
            .shared
            .lock()
            .map(|s| s.hub.notes.clone())
            .map_err(|_| "Lock gagal".to_string())?;
        save_json_store("desktop_sticky_notes.json", &notes)
    }

    pub fn persist_kanban(&self) -> Result<(), String> {
        let kb = self
            .shared
            .lock()
            .map(|s| s.hub.kanban.clone())
            .map_err(|_| "Lock gagal".to_string())?;
        save_json_store("desktop_kanban.json", &kb)
    }

    pub fn persist_time_tracker(&self) -> Result<(), String> {
        let tt = self
            .shared
            .lock()
            .map(|s| s.hub.time_tracker.clone())
            .map_err(|_| "Lock gagal".to_string())?;
        save_json_store("desktop_time_tracker.json", &tt)
    }

    pub fn persist_shortcuts(&self) -> Result<(), String> {
        let items = self
            .shared
            .lock()
            .map(|s| s.hub.shortcuts.clone())
            .map_err(|_| "Lock gagal".to_string())?;
        save_json_store("desktop_shortcuts.json", &items)
    }

    pub fn persist_recent_files(&self) -> Result<(), String> {
        let rf = self
            .shared
            .lock()
            .map(|s| s.hub.recent_files.clone())
            .map_err(|_| "Lock gagal".to_string())?;
        save_json_store("desktop_recent_files.json", &rf)
    }

    pub fn persist_photo_frame(&self) -> Result<(), String> {
        let pf = self
            .shared
            .lock()
            .map(|s| s.hub.photo_frame.clone())
            .map_err(|_| "Lock gagal".to_string())?;
        save_json_store("desktop_photo_frame.json", &pf)
    }

    pub fn persist_countdowns(&self) -> Result<(), String> {
        let items = self
            .shared
            .lock()
            .map(|s| s.hub.countdowns.clone())
            .map_err(|_| "Lock gagal".to_string())?;
        save_json_store("desktop_countdowns.json", &items)
    }

    pub fn persist_snippets(&self) -> Result<(), String> {
        let items = self
            .shared
            .lock()
            .map(|s| s.hub.snippets.clone())
            .map_err(|_| "Lock gagal".to_string())?;
        save_json_store("desktop_snippets.json", &items)
    }

    pub fn persist_world_clocks(&self) -> Result<(), String> {
        let items = self
            .shared
            .lock()
            .map(|s| s.hub.world_clocks.clone())
            .map_err(|_| "Lock gagal".to_string())?;
        save_json_store("desktop_world_clocks.json", &items)
    }

    pub fn analyze_style_contrast(
        &self,
        style: &config::WidgetStyleConfig,
        nx: f32,
        ny: f32,
        nw: f32,
        nh: f32,
    ) -> WallpaperRegionAnalysis {
        if let Ok(st) = self.shared.lock() {
            analyze_region_for_style(st.wallpaper.as_ref(), style, nx, ny, nw, nh)
        } else {
            analyze_region_for_style(None, style, nx, ny, nw, nh)
        }
    }

    pub fn metrics(&self) -> WidgetRuntimeMetrics {
        self.shared
            .lock()
            .map(|s| s.metrics.clone())
            .unwrap_or_default()
    }
}

impl Default for DesktopWidgetEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{WidgetInstance, WidgetStackSlot, WidgetStyleConfig};
    use crate::contrast::analyze_region_for_style;
    use crate::layout::RectF;
    use crate::providers::WidgetDataHub;
    use crate::widgets::{build_widget_render_item, widget_catalog};

    #[test]
    fn catalog_contains_all_34_widgets_and_all_build_cleanly_in_every_supported_size() {
        let catalog = widget_catalog();
        assert_eq!(catalog.len(), 34, "Harus tepat 34 jenis widget");

        let hub = WidgetDataHub::default();
        let theme = WidgetStyleConfig::default();
        let analysis = analyze_region_for_style(None, &theme, 0.0, 0.0, 0.25, 0.25);

        for entry in &catalog {
            let lower_name = entry.name.to_lowercase();
            let lower_desc = entry.description.to_lowercase();
            assert!(!lower_name.contains("apple") && !lower_name.contains("ios"));
            assert!(!lower_desc.contains("apple") && !lower_desc.contains("ios"));
            assert!(!entry.description.contains('\u{2014}'));

            for &size in &entry.supported_sizes {
                let (w, h) = size.dimensions_dp(1.0);
                let slot = WidgetStackSlot {
                    slot_id: format!("test_{}", entry.widget_type),
                    size,
                    widgets: vec![WidgetInstance {
                        instance_id: "inst_1".into(),
                        widget_type: entry.widget_type.clone(),
                        style_override: None,
                        settings: serde_json::json!({}),
                    }],
                    ..Default::default()
                };
                let mut item = build_widget_render_item(
                    &slot,
                    RectF::new(32.0, 48.0, w, h),
                    &theme,
                    &analysis,
                    &hub,
                    1.5,
                );
                item.compute_hit_regions(false);
                assert!(
                    !item.nodes.is_empty(),
                    "Widget {} ukuran {:?} tidak boleh kosong",
                    entry.widget_type,
                    size
                );
            }
        }
    }

    #[test]
    fn all_eight_clock_styles_render_without_panic() {
        let styles = [
            "minimal_digital",
            "kata_indonesia",
            "analog_classic",
            "analog_skeleton",
            "stacked_bold",
            "retro_flip",
            "editorial_thin",
            "dual_zone",
        ];
        let hub = WidgetDataHub::default();
        let theme = WidgetStyleConfig::default();
        let analysis = analyze_region_for_style(None, &theme, 0.0, 0.0, 0.2, 0.2);

        for st in styles {
            let slot = WidgetStackSlot {
                slot_id: format!("clk_{st}"),
                size: config::WidgetSize::Medium,
                widgets: vec![WidgetInstance {
                    instance_id: "c1".into(),
                    widget_type: "styled_clock".into(),
                    style_override: None,
                    settings: serde_json::json!({ "clock_style": st, "show_seconds": true }),
                }],
                ..Default::default()
            };
            let item = build_widget_render_item(
                &slot,
                RectF::new(0.0, 0.0, 336.0, 160.0),
                &theme,
                &analysis,
                &hub,
                0.5,
            );
            assert!(!item.nodes.is_empty(), "Gaya jam {st} kosong");
        }
    }

    #[test]
    fn micro_benchmark_scene_build_and_fft_and_contrast() {
        use std::time::Instant;
        let hub = WidgetDataHub::default();
        let theme = WidgetStyleConfig::default();
        let analysis = analyze_region_for_style(None, &theme, 0.0, 0.0, 0.25, 0.25);
        let slots = config::default_starter_slots();

        let t0 = Instant::now();
        for _ in 0..1000 {
            for slot in &slots {
                let (w, h) = slot.size.dimensions_dp(1.0);
                let mut item = build_widget_render_item(
                    slot,
                    RectF::new(32.0, 48.0, w, h),
                    &theme,
                    &analysis,
                    &hub,
                    1.0,
                );
                item.compute_hit_regions(false);
            }
        }
        let scene_us = t0.elapsed().as_micros() as f64 / 1000.0;

        let mut samples = [0.0f32; 256];
        for (i, s) in samples.iter_mut().enumerate() {
            *s = (i as f32 * 0.2).sin();
        }
        let mut bands = [0.0f32; 16];
        let t1 = Instant::now();
        for _ in 0..1000 {
            providers::audio_fft::compute_spectrum_bands(&samples, &mut bands);
        }
        let fft_us = t1.elapsed().as_micros() as f64 / 1000.0;

        println!(
            "BENCH_METRICS scene_build_3_widgets_us={:.2} fft_256_us={:.2} working_set_mb={:.1}",
            scene_us,
            fft_us,
            d2d_host::query_process_working_set_mb()
        );
        assert!(scene_us < 10_000.0);
        assert!(fft_us < 5_000.0);
    }

    #[test]
    fn countdown_days_and_aqi_categories_compute_accurately() {
        use providers::local_stores::countdown_days_diff;
        use providers::network_providers::aqi_category_indonesian;

        assert_eq!(countdown_days_diff(2026, 11, 20, "2026-11-30"), Some(10));
        assert_eq!(countdown_days_diff(2026, 11, 20, "2026-11-20"), Some(0));
        assert_eq!(countdown_days_diff(2026, 11, 20, "2026-11-15"), Some(-5));
        assert_eq!(countdown_days_diff(2026, 11, 20, "invalid"), None);

        assert_eq!(aqi_category_indonesian(35), "Baik");
        assert_eq!(aqi_category_indonesian(80), "Sedang");
        assert_eq!(aqi_category_indonesian(130), "Sensitif");
        assert_eq!(aqi_category_indonesian(180), "Tidak Sehat");
    }

    #[test]
    fn live_d2d_host_boots_renders_toggles_and_shuts_down_without_panic() {
        let eng = DesktopWidgetEngine::new();
        let mut cfg = DesktopWidgetsConfig::default();
        cfg.enabled = true;
        cfg.auto_pause_fullscreen = false;
        let _ = eng.shared.lock().map(|mut s| {
            s.config = cfg;
            s.pending_commands.push(HostCommand::MarkDirty);
        });
        eng.start_host_if_needed();
        std::thread::sleep(std::time::Duration::from_millis(450));
        let m1 = eng.metrics();
        println!(
            "LIVE_D2D_SMOKE running={} monitors={} adapter='{}' dirty={} ws_mb={:.1} paused={:?}",
            m1.running, m1.monitor_count, m1.gpu_adapter, m1.last_dirty_rects, m1.working_set_mb, m1.paused_reason
        );
        assert!(m1.running, "Host Direct2D harus berjalan tanpa panic/crash");
        assert!(m1.monitor_count >= 1, "Harus mendeteksi minimal 1 monitor");

        let eng = DesktopWidgetEngine::new();
        eng.toggle_board(Some(true));
        eng.set_edit_mode(true);
        std::thread::sleep(std::time::Duration::from_millis(250));
        eng.toggle_board(Some(false));
        eng.set_edit_mode(false);
        std::thread::sleep(std::time::Duration::from_millis(200));

        eng.shutdown();
        let m2 = eng.metrics();
        assert!(!m2.running, "Host harus berhenti bersih setelah shutdown");
    }

    #[test]
    fn calendar_types_and_monochrome_palette_and_compact_now_playing_behave_cleanly() {
        use widgets::group_a::{days_in_month, first_weekday_of_month};

        assert_eq!(days_in_month(2024, 2), 29);
        assert_eq!(days_in_month(2026, 2), 28);
        assert_eq!(days_in_month(2026, 11), 30);
        // Nov 1, 2026 is Sunday (0)
        assert_eq!(first_weekday_of_month(2026, 11), 0);

        let mut hub = WidgetDataHub::default();
        hub.media = MediaSnapshot {
            title: "Superpowers".into(),
            artist: "Daniel Caesar".into(),
            album: String::new(),
            thumbnail_path_or_data: None,
            position_sec: 45.0,
            duration_sec: 160.0,
            is_playing: true,
            active_lyric_line: "Lift your head to the sky (Sky)".into(),
            next_lyric_line: "It's crazy to say this".into(),
            lyrics_lines: Vec::new(),
            lyrics_state: "synced".into(),
        };

        let white_theme = WidgetStyleConfig {
            text_primary: config::ColorRoleSource::Custom {
                color: config::RgbaColor::new(255, 255, 255, 1.0),
            },
            text_secondary: config::ColorRoleSource::AutoContrast,
            accent: config::ColorRoleSource::AutoContrast,
            font_weight: 300,
            text_scale: 1.1,
            ..WidgetStyleConfig::default()
        };
        let analysis = analyze_region_for_style(None, &white_theme, 0.0, 0.0, 0.25, 0.25);

        // Now Playing at 0.85x scale (285.6 x 136): no text rect may overlap the ProgressBar rect,
        // and no node may carry the old default blue (#3882F6).
        let np_slot = WidgetStackSlot {
            slot_id: "np_compact".into(),
            size: config::WidgetSize::Medium,
            widgets: vec![WidgetInstance {
                instance_id: "np1".into(),
                widget_type: "now_playing".into(),
                style_override: None,
                settings: serde_json::json!({}),
            }],
            ..Default::default()
        };
        let np_item = build_widget_render_item(
            &np_slot,
            RectF::new(16.0, 16.0, 285.6, 136.0),
            &white_theme,
            &analysis,
            &hub,
            0.0,
        );
        assert!((np_item.text_scale - 1.1).abs() < 1e-4);
        let bar_rect = np_item
            .nodes
            .iter()
            .find_map(|n| match n {
                layout::SceneNode::ProgressBar { rect, .. } => Some(*rect),
                _ => None,
            })
            .expect("ProgressBar harus ada");
        for node in &np_item.nodes {
            match node {
                layout::SceneNode::Text {
                    rect,
                    color,
                    font_weight,
                    ..
                } => {
                    assert!(
                        rect.y + rect.h <= bar_rect.y + 0.5,
                        "Teks ({}, h={}) menabrak ProgressBar (y={})",
                        rect.y,
                        rect.h,
                        bar_rect.y
                    );
                    assert_eq!(color.r, 255);
                    assert_eq!(color.g, 255);
                    assert_eq!(color.b, 255);
                    assert!(*font_weight <= 500, "font_weight 300 harus meringankan teks");
                }
                layout::SceneNode::RoundedRect {
                    fill: Some(c), ..
                } => {
                    assert_eq!(c.r, c.g, "Monokrom putih tidak boleh bocor warna biru");
                }
                _ => {}
            }
        }

        // With album thumbnail provided, cover ImageRef must always be emitted at >= 46dp
        hub.media.thumbnail_path_or_data = Some("data:image/png;base64,AAA".into());
        let np_with_cover = build_widget_render_item(
            &np_slot,
            RectF::new(16.0, 16.0, 285.6, 136.0),
            &white_theme,
            &analysis,
            &hub,
            0.0,
        );
        let has_cover = np_with_cover.nodes.iter().any(|n| {
            matches!(
                n,
                layout::SceneNode::ImageRef { rect, .. } if rect.w >= 46.0 && rect.h >= 46.0
            )
        });
        assert!(has_cover, "Cover album Now Playing wajib selalu dirender");

        // All 4 calendar styles build cleanly across S/M/L; bulan_minimal bolds today without a blue box
        let default_cfg = DesktopWidgetsConfig::default();
        assert_eq!(
            default_cfg.global_theme.accent,
            config::ColorRoleSource::AutoContrast
        );

        let v1_with_old_blue = serde_json::json!({
            "schema_version": 1,
            "enabled": true,
            "global_theme": {
                "accent": { "mode": "custom", "color": { "r": 56, "g": 130, "b": 246, "a": 1.0 } }
            },
            "slots": []
        });
        let migrated = config::migrate_config_value(v1_with_old_blue);
        assert_eq!(migrated.schema_version, config::CONFIG_SCHEMA_VERSION);
        assert_eq!(
            migrated.global_theme.accent,
            config::ColorRoleSource::AutoContrast
        );

        let cal_min_slot = WidgetStackSlot {
            slot_id: "cal_min".into(),
            size: config::WidgetSize::Small,
            widgets: vec![WidgetInstance {
                instance_id: "cm".into(),
                widget_type: "calendar_agenda".into(),
                style_override: None,
                settings: serde_json::json!({ "calendar_style": "bulan_minimal" }),
            }],
            ..Default::default()
        };
        let cal_min_item = build_widget_render_item(
            &cal_min_slot,
            RectF::new(0.0, 0.0, 136.0, 136.0),
            &white_theme,
            &analysis,
            &hub,
            0.0,
        );
        assert!(
            !cal_min_item
                .nodes
                .iter()
                .any(|n| matches!(n, layout::SceneNode::RoundedRect { .. })),
            "Bulan Minimalis hanya menebalkan tanggal hari ini tanpa kotak/pil latar"
        );
        let has_bold_today = cal_min_item.nodes.iter().any(|n| {
            matches!(
                n,
                layout::SceneNode::Text { font_weight, .. } if *font_weight >= 650
            )
        });
        assert!(has_bold_today, "Tanggal hari ini harus tampil bold");

        for cal_st in [
            "bulan_minimal",
            "bulan_header",
            "tanggal_fokus",
            "tanggal_agenda",
        ] {
            for sz in [
                config::WidgetSize::Small,
                config::WidgetSize::Medium,
                config::WidgetSize::Large,
            ] {
                let (w, h) = sz.dimensions_dp(0.85);
                let cal_slot = WidgetStackSlot {
                    slot_id: format!("cal_{cal_st}"),
                    size: sz,
                    widgets: vec![WidgetInstance {
                        instance_id: "c1".into(),
                        widget_type: "calendar_agenda".into(),
                        style_override: None,
                        settings: serde_json::json!({ "calendar_style": cal_st }),
                    }],
                    ..Default::default()
                };
                let item = build_widget_render_item(
                    &cal_slot,
                    RectF::new(0.0, 0.0, w, h),
                    &white_theme,
                    &analysis,
                    &hub,
                    0.0,
                );
                assert!(!item.nodes.is_empty(), "Tipe kalender {cal_st} tidak boleh kosong");
            }
        }
    }

    #[test]
    fn photo_frame_supports_direct_desktop_picker_and_hit_testing() {
        let analysis = analyze_region_for_style(None, &WidgetStyleConfig::default(), 0.0, 0.0, 0.25, 0.25);
        let theme = WidgetStyleConfig::default();

        // 1. Empty state must expose direct desktop picker ("photo_pick") on clean square card
        let mut hub = WidgetDataHub::default();
        let slot = WidgetStackSlot {
            slot_id: "pf_slot".into(),
            size: config::WidgetSize::Large,
            widgets: vec![WidgetInstance {
                instance_id: "pf1".into(),
                widget_type: "photo_frame".into(),
                style_override: None,
                settings: serde_json::json!({ "polaroid": true }),
            }],
            ..Default::default()
        };
        let frame_sq = layout::slot_rect_dp(&slot, 1.0, 0.0, 0.0);
        assert_eq!(frame_sq.w, frame_sq.h, "Bingkai foto harus berbentuk kotak");
        assert!(frame_sq.w >= 336.0, "Ukuran Large polaroid harus >= 336dp");

        let small_slot = WidgetStackSlot {
            size: config::WidgetSize::Small,
            ..slot.clone()
        };
        let small_sq = layout::slot_rect_dp(&small_slot, 1.0, 0.0, 0.0);
        assert_eq!(small_sq.w, small_sq.h);
        assert!(small_sq.w >= 220.0, "Ukuran Small polaroid harus diperbesar (>= 220dp)");

        let mut empty_item = build_widget_render_item(
            &slot,
            frame_sq,
            &theme,
            &analysis,
            &hub,
            0.0,
        );
        empty_item.compute_hit_regions(false);
        assert!(
            empty_item
                .content_hit_rects
                .iter()
                .any(|r| r.action_id.as_deref() == Some("photo_pick")),
            "Bingkai Foto kosong harus punya aksi langsung photo_pick di widget"
        );

        // 2. Loaded manual photos without folder_path MUST render clean ImageRef ONLY (no filename, no + Foto pill)
        hub.photo_frame.folder_path = None;
        hub.photo_frame.photos = vec!["C:\\tmp\\a.jpg".into(), "C:\\tmp\\b.jpg".into()];
        assert_eq!(
            hub.photo_frame.effective_interval_secs(),
            providers::local_stores::DEFAULT_PHOTO_INTERVAL_SECS
        );
        let mut loaded_item = build_widget_render_item(
            &slot,
            frame_sq,
            &theme,
            &analysis,
            &hub,
            0.0,
        );
        loaded_item.compute_hit_regions(false);
        assert_eq!(
            loaded_item.nodes.len(),
            1,
            "Polaroid aktif harus bersih hanya menampilkan gambar tanpa nama file dan tanpa tombol tambahan"
        );
        assert!(
            matches!(
                &loaded_item.nodes[0],
                layout::SceneNode::ImageRef { rect, interactive_action, .. }
                    if *rect == frame_sq && interactive_action.as_deref() == Some("photo_pick")
            ),
            "Klik pada polaroid aktif harus langsung memicu photo_pick dan mengisi kotak penuh"
        );
        let hit = layout::hit_test_scene(
            &[loaded_item],
            false,
            None,
            frame_sq.x + frame_sq.w * 0.5,
            frame_sq.y + frame_sq.h * 0.5,
        );
        assert_eq!(
            hit,
            layout::HitTestResult::WidgetContent {
                slot_id: "pf_slot".into(),
                action_id: Some("photo_pick".into())
            }
        );

        // 3. step_photo_index wraps safely forward & backward
        providers::local_stores::step_photo_index(&mut hub.photo_frame, 1);
        assert_eq!(hub.photo_frame.current_index, 1);
        providers::local_stores::step_photo_index(&mut hub.photo_frame, 1);
        assert_eq!(hub.photo_frame.current_index, 0);
        providers::local_stores::step_photo_index(&mut hub.photo_frame, -1);
        assert_eq!(hub.photo_frame.current_index, 1);
    }

    #[test]
    fn system_telemetry_preserves_quick_controls_and_hourly_forecast_and_monochrome() {
        // Bug #2 regression: telemetry updates with None must preserve existing Wi-Fi/BT/Mute state
        let eng = DesktopWidgetEngine::new();
        eng.with_hub_mut(|h| {
            h.quick_controls.wifi_enabled = Some(true);
            h.quick_controls.bluetooth_enabled = Some(false);
            h.quick_controls.audio_muted = Some(true);
        });
        eng.update_system_telemetry(None, None, None, 1.0, 0.5, None, None, None);
        let (wifi, bt, muted) = eng
            .with_hub_mut(|h| {
                (
                    h.quick_controls.wifi_enabled,
                    h.quick_controls.bluetooth_enabled,
                    h.quick_controls.audio_muted,
                )
            })
            .unwrap();
        assert_eq!(wifi, Some(true));
        assert_eq!(bt, Some(false));
        assert_eq!(muted, Some(true));

        // Bug #11 regression: hourly weather slices from current hour instead of 00:00
        let times = vec![
            serde_json::json!("2026-11-21T00:00"),
            serde_json::json!("2026-11-21T01:00"),
            serde_json::json!("2026-11-21T14:00"),
            serde_json::json!("2026-11-21T15:00"),
        ];
        assert_eq!(
            providers::network_providers::resolve_hourly_forecast_start(
                &times,
                Some("2026-11-21T14:15")
            ),
            2
        );

        // Bug #13 regression: monochrome palette propagates to treemap/AQI without rainbow hues
        let white_theme = WidgetStyleConfig::default();
        let analysis = analyze_region_for_style(None, &white_theme, 0.0, 0.0, 0.25, 0.25);
        let mut hub = WidgetDataHub::default();
        hub.air_quality = providers::network_providers::AirQualitySnapshot {
            available: true,
            location_name: "Jakarta".into(),
            us_aqi: 125,
            pm2_5: 42.0,
            pm10: 60.0,
            uv_index: 5.0,
            category_label: "Sensitif".into(),
            updated_label: "Baru saja".into(),
            error: None,
        };
        let aqi_slot = WidgetStackSlot {
            slot_id: "aqi_mono".into(),
            size: config::WidgetSize::Small,
            widgets: vec![WidgetInstance {
                instance_id: "a1".into(),
                widget_type: "air_quality".into(),
                style_override: None,
                settings: serde_json::json!({}),
            }],
            ..Default::default()
        };
        let aqi_item = build_widget_render_item(
            &aqi_slot,
            RectF::new(0.0, 0.0, 160.0, 160.0),
            &white_theme,
            &analysis,
            &hub,
            0.0,
        );
        let has_orange = aqi_item.nodes.iter().any(|n| match n {
            layout::SceneNode::ProgressBar { fill_color, .. } => {
                fill_color.r == 0xFB && fill_color.g == 0x92 && fill_color.b == 0x3C
            }
            _ => false,
        });
        assert!(!has_orange, "Mode monokrom tidak boleh menampilkan warna oranye keras pada AQI");
    }

    #[test]
    fn frosted_squircle_material_and_flagship_layouts_work_cleanly() {
        // 1. Schema v3 defaults to frosted squircle Glass with 26dp corners
        let cfg = DesktopWidgetsConfig::default();
        assert_eq!(cfg.schema_version, config::CONFIG_SCHEMA_VERSION);
        assert_eq!(cfg.global_theme.background_mode, config::BackgroundMode::Glass);
        assert!((config::CARD_RADIUS_DP - 26.0).abs() < 0.01);
        assert!(config::CARD_CORNER_SMOOTHING >= 0.65);

        // Migration from v2 BackgroundMode::None upgrades cleanly to Glass, while preserving Solid
        let v2_none = serde_json::json!({
            "schema_version": 2,
            "enabled": true,
            "global_theme": { "background_mode": "none" },
            "slots": []
        });
        let mig_none = config::migrate_config_value(v2_none);
        assert_eq!(mig_none.schema_version, config::CONFIG_SCHEMA_VERSION);
        assert_eq!(mig_none.global_theme.background_mode, config::BackgroundMode::Glass);

        let v2_solid = serde_json::json!({
            "schema_version": 2,
            "enabled": true,
            "global_theme": { "background_mode": "solid" },
            "slots": []
        });
        let mig_solid = config::migrate_config_value(v2_solid);
        assert_eq!(mig_solid.global_theme.background_mode, config::BackgroundMode::Solid);

        // 2. Surface-aware contrast blends dark frosted glass over bright wallpaper -> keeps light text
        let light_wp = contrast::CachedWallpaperSample {
            path: std::path::PathBuf::from("bright.png"),
            modified: None,
            width: 8,
            height: 8,
            rgb: vec![240; 8 * 8 * 3],
            dominant_palette: vec![config::RgbaColor::new(240, 240, 240, 1.0)],
        };
        let dark_glass = WidgetStyleConfig::default();
        let res_dark = analyze_region_for_style(Some(&light_wp), &dark_glass, 0.0, 0.0, 1.0, 1.0);
        assert!(
            res_dark.recommended_text_primary.r > 200,
            "Kaca frosted gelap di atas wallpaper terang harus merekomendasikan teks putih"
        );

        let light_glass = WidgetStyleConfig {
            card_color: config::ColorRoleSource::Custom {
                color: config::RgbaColor::new(245, 245, 250, 1.0),
            },
            background_mode: config::BackgroundMode::Glass,
            ..WidgetStyleConfig::default()
        };
        let res_light = analyze_region_for_style(None, &light_glass, 0.0, 0.0, 1.0, 1.0);
        assert!(
            res_light.recommended_text_primary.r < 60,
            "Kaca frosted terang harus merekomendasikan teks gelap agar kontras"
        );

        // 3. Now Playing Medium exposes media_prev, toggle_media_playback, and media_next + card gradient
        let mut hub = WidgetDataHub::default();
        hub.media = MediaSnapshot {
            title: "Superpowers".into(),
            artist: "Daniel Caesar".into(),
            duration_sec: 180.0,
            position_sec: 45.0,
            is_playing: true,
            ..Default::default()
        };
        let np_slot = WidgetStackSlot {
            slot_id: "np_glass".into(),
            size: config::WidgetSize::Medium,
            widgets: vec![WidgetInstance {
                instance_id: "np1".into(),
                widget_type: "now_playing".into(),
                style_override: None,
                settings: serde_json::json!({}),
            }],
            ..Default::default()
        };
        let mut np_item = build_widget_render_item(
            &np_slot,
            RectF::new(0.0, 0.0, 320.0, 150.0),
            &dark_glass,
            &res_dark,
            &hub,
            0.0,
        );
        np_item.compute_hit_regions(false);
        assert!(
            np_item.card_gradient.is_none(),
            "Mode monokrom menjaga kartu tetap netral tanpa gradien berwarna"
        );
        let accented_glass = WidgetStyleConfig {
            accent: config::ColorRoleSource::Custom {
                color: config::RgbaColor::new(0x0A, 0x84, 0xFF, 1.0),
            },
            ..dark_glass.clone()
        };
        let np_tinted = build_widget_render_item(
            &np_slot,
            RectF::new(0.0, 0.0, 320.0, 150.0),
            &accented_glass,
            &res_dark,
            &hub,
            0.0,
        );
        assert!(
            np_tinted.card_gradient.is_some(),
            "Now Playing Glass dengan aksen aktif harus memiliki gradien permukaan"
        );
        for act in ["media_prev", "toggle_media_playback", "media_next"] {
            assert!(
                np_item
                    .content_hit_rects
                    .iter()
                    .any(|r| r.action_id.as_deref() == Some(act)),
                "Tombol {act} harus interaktif pada Now Playing Medium"
            );
        }

        // 4. World Clock Medium renders 4 analog dials
        let wc_slot = WidgetStackSlot {
            slot_id: "wc_dials".into(),
            size: config::WidgetSize::Medium,
            widgets: vec![WidgetInstance {
                instance_id: "wc1".into(),
                widget_type: "world_clock".into(),
                style_override: None,
                settings: serde_json::json!({}),
            }],
            ..Default::default()
        };
        let wc_item = build_widget_render_item(
            &wc_slot,
            RectF::new(0.0, 0.0, 320.0, 150.0),
            &dark_glass,
            &res_dark,
            &hub,
            0.0,
        );
        let dial_count = wc_item
            .nodes
            .iter()
            .filter(|n| matches!(n, layout::SceneNode::AnalogClock { .. }))
            .count();
        assert_eq!(dial_count, 4, "Jam Dunia Medium harus merender 4 dial jam analog");

        // 5. Photo Frame renders full-bleed square image with 24dp corners
        hub.photo_frame.photos = vec!["C:\\tmp\\sample.jpg".into()];
        let pf_slot = WidgetStackSlot {
            slot_id: "pf_sq".into(),
            size: config::WidgetSize::Small,
            widgets: vec![WidgetInstance {
                instance_id: "pf1".into(),
                widget_type: "photo_frame".into(),
                style_override: None,
                settings: serde_json::json!({ "polaroid": true }),
            }],
            ..Default::default()
        };
        let pf_rect = layout::slot_rect_dp(&pf_slot, 1.0, 0.0, 0.0);
        let pf_item = build_widget_render_item(&pf_slot, pf_rect, &dark_glass, &res_dark, &hub, 0.0);
        assert!(matches!(
            pf_item.nodes.first(),
            Some(layout::SceneNode::ImageRef { radius, .. }) if (*radius - 24.0).abs() < 0.01
        ));

        // 6. Small 0.85x clock and currency figures scale cleanly below clipping thresholds
        let compact_sm = RectF::new(0.0, 0.0, 136.0, 136.0);
        for show_sec in [false, true] {
            let clk_slot = WidgetStackSlot {
                slot_id: format!("clk_sm_{show_sec}"),
                size: config::WidgetSize::Small,
                widgets: vec![WidgetInstance {
                    instance_id: "c1".into(),
                    widget_type: "styled_clock".into(),
                    style_override: None,
                    settings: serde_json::json!({
                        "clock_style": "minimal_digital",
                        "show_seconds": show_sec
                    }),
                }],
                ..Default::default()
            };
            let clk_item =
                build_widget_render_item(&clk_slot, compact_sm, &dark_glass, &res_dark, &hub, 0.0);
            assert!(
                matches!(
                    clk_item.nodes.first(),
                    Some(layout::SceneNode::Text { font_size, max_lines, .. })
                        if *font_size < 40.0 && *max_lines == 1
                ),
                "Jam Small 0.85x (show_sec={show_sec}) harus mengecil < 40pt & 1 baris"
            );
        }

        hub.currency_gold.usd_to_idr = Some(16_260.0);
        hub.currency_gold.currency_source = "open.er-api.com".into();
        let cg_slot = WidgetStackSlot {
            slot_id: "cg_sm".into(),
            size: config::WidgetSize::Small,
            widgets: vec![WidgetInstance {
                instance_id: "cg1".into(),
                widget_type: "currency_gold".into(),
                style_override: None,
                settings: serde_json::json!({}),
            }],
            ..Default::default()
        };
        let cg_item =
            build_widget_render_item(&cg_slot, compact_sm, &dark_glass, &res_dark, &hub, 0.0);
        assert!(
            matches!(
                cg_item.nodes.get(1),
                Some(layout::SceneNode::Text { font_size, max_lines, .. })
                    if *font_size < 24.0 && *max_lines == 1
            ),
            "Nominal kurs Small 0.85x harus mengecil < 24pt & 1 baris"
        );

        // 7. Weather forecast renders native vector WeatherIcon nodes with monochrome compliance
        hub.weather.available = true;
        hub.weather.location_name = "Jakarta".into();
        hub.weather.current_code = 61;
        hub.weather.daily = vec![providers::network_providers::DailyWeatherPoint {
            day_label: "2026-11-21".into(),
            min_c: 25.0,
            max_c: 30.0,
            code: 61,
        }];
        let wf_slot = WidgetStackSlot {
            slot_id: "wf_rain".into(),
            size: config::WidgetSize::Large,
            widgets: vec![WidgetInstance {
                instance_id: "w1".into(),
                widget_type: "weather_forecast".into(),
                style_override: None,
                settings: serde_json::json!({}),
            }],
            ..Default::default()
        };
        let wf_item = build_widget_render_item(
            &wf_slot,
            RectF::new(0.0, 0.0, 320.0, 320.0),
            &dark_glass,
            &res_dark,
            &hub,
            0.0,
        );
        let has_weather_vec = wf_item.nodes.iter().any(|n| {
            matches!(
                n,
                layout::SceneNode::WeatherIcon { code: 61, cloud_color, accent_color, .. }
                    if cloud_color.r == cloud_color.g && accent_color.r == accent_color.g
            )
        });
        assert!(has_weather_vec, "Cuaca wajib memakai vektor WeatherIcon netral saat monokrom");
        assert!(
            !wf_item
                .nodes
                .iter()
                .any(|n| matches!(n, layout::SceneNode::IconGlyph { .. })),
            "Cuaca tidak boleh fallback ke IconGlyph font tunggal"
        );
    }

    #[test]
    fn desktop_widgets_render_english_when_language_is_en() {
        let extract_texts = |nodes: &[layout::SceneNode]| -> Vec<String> {
            nodes
                .iter()
                .filter_map(|n| match n {
                    layout::SceneNode::Text { content, .. } => Some(content.clone()),
                    _ => None,
                })
                .collect()
        };

        let style = WidgetStyleConfig::default();
        let region = analyze_region_for_style(None, &style, 0.0, 0.0, 1.0, 1.0);
        let rect = RectF::new(0.0, 0.0, 320.0, 170.0);
        let large_rect = RectF::new(0.0, 0.0, 320.0, 320.0);

        let mut hub_id = WidgetDataHub::default();
        hub_id.weather.available = true;
        hub_id.weather.location_name = "Jakarta".into();
        hub_id.weather.current_code = 61;
        hub_id.weather.daily = vec![providers::network_providers::DailyWeatherPoint {
            day_label: "2026-11-21".into(),
            min_c: 25.0,
            max_c: 30.0,
            code: 61,
        }];
        hub_id.air_quality.available = true;
        hub_id.air_quality.location_name = "Jakarta".into();
        hub_id.air_quality.us_aqi = 125;
        hub_id.air_quality.category_label = "Sensitif".into();
        hub_id.prayer.next_name = "Subuh".into();
        hub_id.prayer.next_time = "04:10".into();
        hub_id.currency_gold.usd_to_idr = Some(16_250.0);
        hub_id.currency_gold.currency_source = "open.er-api.com".into();

        let mut hub_en = hub_id.clone();
        hub_en.frontend.language = "en".into();

        let render_texts_with_settings =
            |wtype: &str,
             size: config::WidgetSize,
             r: RectF,
             hub: &WidgetDataHub,
             settings: serde_json::Value| {
                let slot = WidgetStackSlot {
                    slot_id: format!("i18n_{wtype}"),
                    size,
                    widgets: vec![WidgetInstance {
                        instance_id: "w1".into(),
                        widget_type: wtype.into(),
                        style_override: None,
                        settings,
                    }],
                    ..Default::default()
                };
                let item = build_widget_render_item(&slot, r, &style, &region, hub, 0.0);
                extract_texts(&item.nodes)
            };
        let render_texts = |wtype: &str, size: config::WidgetSize, r: RectF, hub: &WidgetDataHub| {
            render_texts_with_settings(wtype, size, r, hub, serde_json::json!({}))
        };

        // 1. Default / "id" keeps Indonesian output intact
        let cal_min_id = render_texts("calendar_agenda", config::WidgetSize::Medium, rect, &hub_id);
        assert!(cal_min_id.iter().any(|t| t == "R"));
        let cal_agenda_id = render_texts_with_settings(
            "calendar_agenda",
            config::WidgetSize::Medium,
            rect,
            &hub_id,
            serde_json::json!({ "calendar_style": "tanggal_agenda" }),
        );
        assert!(cal_agenda_id.iter().any(|t| t == "Agenda kosong. Ketuk untuk menambah di Gili."));
        let aq_id = render_texts("air_quality", config::WidgetSize::Medium, rect, &hub_id);
        assert!(aq_id.iter().any(|t| t == "Sensitif"));
        assert!(aq_id.iter().any(|t| t == "Indeks UV"));

        // 2. language = "en" switches widget builders to English
        let cal_min_en = render_texts("calendar_agenda", config::WidgetSize::Medium, rect, &hub_en);
        assert!(cal_min_en.iter().any(|t| t == "W"));
        let cal_en = render_texts_with_settings(
            "calendar_agenda",
            config::WidgetSize::Medium,
            rect,
            &hub_en,
            serde_json::json!({ "calendar_style": "tanggal_agenda" }),
        );
        assert!(cal_en.iter().any(|t| t == "No events. Tap to add in Gili."));

        let wf_en = render_texts("weather_forecast", config::WidgetSize::Large, large_rect, &hub_en);
        assert!(wf_en.iter().any(|t| t == "Rain"));
        assert!(wf_en.iter().any(|t| t == "5-DAY FORECAST"));
        assert!(wf_en.iter().any(|t| t.starts_with("H:")));

        let sys_en = render_texts("system_performance", config::WidgetSize::Large, large_rect, &hub_en);
        assert!(sys_en.iter().any(|t| t == "SYSTEM PERFORMANCE"));
        assert!(sys_en.iter().any(|t| t == "DISK STORAGE"));

        let wc_en = render_texts("world_clock", config::WidgetSize::Medium, rect, &hub_en);
        assert!(wc_en.iter().any(|t| t == "WORLD CLOCK"));

        let pf_en = render_texts("photo_frame", config::WidgetSize::Small, rect, &hub_en);
        assert!(pf_en.iter().any(|t| t == "Click to Pick Photos"));

        let qc_en = render_texts("quick_controls", config::WidgetSize::Medium, rect, &hub_en);
        assert!(qc_en.iter().any(|t| t == "Quick Controls"));
        assert!(qc_en.iter().any(|t| t == "Dark Mode"));

        let aq_en = render_texts("air_quality", config::WidgetSize::Medium, rect, &hub_en);
        assert!(aq_en.iter().any(|t| t == "Sensitive"));
        assert!(aq_en.iter().any(|t| t == "UV Index"));
        assert!(aq_en.iter().any(|t| t == "Source: Open-Meteo Air Quality"));

        let pr_en = render_texts("prayer_times", config::WidgetSize::Medium, rect, &hub_en);
        assert!(pr_en.iter().any(|t| t.starts_with("PRAYER . ")));
        assert!(pr_en.iter().any(|t| t == "Fajr"));

        let cg_en = render_texts("currency_gold", config::WidgetSize::Medium, rect, &hub_en);
        assert!(cg_en.iter().any(|t| t == "USD / IDR RATE"));
        assert!(cg_en.iter().any(|t| t.starts_with("Rate source: ")));

        let clk_slot = WidgetStackSlot {
            slot_id: "i18n_clk_dual".into(),
            size: config::WidgetSize::Small,
            widgets: vec![WidgetInstance {
                instance_id: "c_dual".into(),
                widget_type: "styled_clock".into(),
                style_override: None,
                settings: serde_json::json!({ "clock_style": "dual_zone" }),
            }],
            ..Default::default()
        };
        let clk_texts = extract_texts(
            &build_widget_render_item(&clk_slot, RectF::new(0.0, 0.0, 150.0, 150.0), &style, &region, &hub_en, 0.0)
                .nodes,
        );
        assert!(clk_texts.iter().any(|t| t == "LOCAL TIME"));
    }

    #[test]
    fn now_playing_control_glyphs_match_button_frames_and_align_with_art() {
        let style = WidgetStyleConfig::default();
        let region = analyze_region_for_style(None, &style, 0.0, 0.0, 1.0, 1.0);
        let mut hub = WidgetDataHub::default();
        hub.media = MediaSnapshot {
            title: "Roommates".into(),
            artist: "Malcolm Todd".into(),
            duration_sec: 180.0,
            position_sec: 12.0,
            is_playing: true,
            ..Default::default()
        };
        let slot = WidgetStackSlot {
            slot_id: "np_ctrl_center".into(),
            size: config::WidgetSize::Medium,
            widgets: vec![WidgetInstance {
                instance_id: "np1".into(),
                widget_type: "now_playing".into(),
                style_override: None,
                settings: serde_json::json!({}),
            }],
            ..Default::default()
        };
        let item = build_widget_render_item(
            &slot,
            RectF::new(0.0, 0.0, 336.0, 160.0),
            &style,
            &region,
            &hub,
            0.0,
        );
        let art_rect = item
            .nodes
            .iter()
            .find_map(|n| match n {
                layout::SceneNode::RoundedRect {
                    rect,
                    interactive_action: None,
                    ..
                } => Some(*rect),
                _ => None,
            })
            .expect("Album art placeholder rect present");
        let art_cy = art_rect.y + art_rect.h * 0.5;

        for action in ["media_prev", "toggle_media_playback", "media_next"] {
            let btn_rect = item
                .nodes
                .iter()
                .find_map(|n| match n {
                    layout::SceneNode::RoundedRect {
                        rect,
                        interactive_action: Some(act),
                        ..
                    } if act == action => Some(*rect),
                    _ => None,
                })
                .expect("Control button frame present");
            let glyph_rect = item
                .nodes
                .iter()
                .find_map(|n| match n {
                    layout::SceneNode::IconGlyph {
                        rect,
                        interactive_action: Some(act),
                        ..
                    } if act == action => Some(*rect),
                    _ => None,
                })
                .expect("Control button glyph present");
            assert_eq!(btn_rect.x, glyph_rect.x);
            assert_eq!(btn_rect.y, glyph_rect.y);
            assert_eq!(btn_rect.w, glyph_rect.w);
            assert_eq!(btn_rect.h, glyph_rect.h);
            let btn_cy = btn_rect.y + btn_rect.h * 0.5;
            assert!(
                (btn_cy - art_cy).abs() <= 1.0,
                "Button center y {btn_cy} must match art center y {art_cy}"
            );
        }
    }

    #[test]
    fn currency_gold_widget_displays_public_spot_gold_in_en_and_id() {
        let style = WidgetStyleConfig::default();
        let region = analyze_region_for_style(None, &style, 0.0, 0.0, 1.0, 1.0);
        let mut hub = WidgetDataHub::default();
        hub.currency_gold.usd_to_idr = Some(16_250.0);
        hub.currency_gold.currency_source = "open.er-api.com".into();
        hub.currency_gold.gold_provider_configured = true;
        hub.currency_gold.gold_usd_per_oz = Some(3_524.0);
        hub.currency_gold.gold_idr_per_gram = Some(2_085_482.0);
        hub.currency_gold.gold_note = "gold-api.com".into();

        let slot = WidgetStackSlot {
            slot_id: "cg_pub".into(),
            size: config::WidgetSize::Medium,
            widgets: vec![WidgetInstance {
                instance_id: "cg1".into(),
                widget_type: "currency_gold".into(),
                style_override: None,
                settings: serde_json::json!({}),
            }],
            ..Default::default()
        };
        let rect = RectF::new(0.0, 0.0, 336.0, 160.0);
        let id_item = build_widget_render_item(&slot, rect, &style, &region, &hub, 0.0);
        assert!(id_item.nodes.iter().any(|n| matches!(
            n,
            layout::SceneNode::Text { content, .. } if content == "Emas/gr: Rp2.085.482"
        )));

        let mut hub_en = hub.clone();
        hub_en.frontend.language = "en".into();
        let en_item = build_widget_render_item(&slot, rect, &style, &region, &hub_en, 0.0);
        assert!(en_item.nodes.iter().any(|n| matches!(
            n,
            layout::SceneNode::Text { content, .. } if content == "Gold: $3,524/oz"
        )));
    }

    #[test]
    fn calendar_widget_merges_ical_events_and_renders_agenda_and_month_dots() {
        let (year, month, day, _, _, _, _) = crate::widgets::local_datetime_parts();
        let style = WidgetStyleConfig::default();
        let region = analyze_region_for_style(None, &style, 0.0, 0.0, 1.0, 1.0);
        let mut hub = WidgetDataHub::default();
        hub.frontend.language = "en".into();
        hub.ical_calendar.configured = true;
        hub.ical_calendar.events = vec![providers::AgendaItem {
            id: "ical_0".into(),
            title: "Google Product Sync".into(),
            time: "all_day".into(),
            date_key: Some(format!("{year:04}-{month:02}-{day:02}")),
        }];

        let agenda_slot = WidgetStackSlot {
            slot_id: "cal_ical".into(),
            size: config::WidgetSize::Medium,
            widgets: vec![WidgetInstance {
                instance_id: "cal1".into(),
                widget_type: "calendar_agenda".into(),
                style_override: None,
                settings: serde_json::json!({ "calendar_style": "tanggal_agenda" }),
            }],
            ..Default::default()
        };
        let item = build_widget_render_item(
            &agenda_slot,
            RectF::new(0.0, 0.0, 336.0, 160.0),
            &style,
            &region,
            &hub,
            0.0,
        );
        assert!(item.nodes.iter().any(|n| matches!(
            n,
            layout::SceneNode::Text { content, .. } if content == "Google Product Sync"
        )));
        assert!(item.nodes.iter().any(|n| matches!(
            n,
            layout::SceneNode::Text { content, .. } if content == "All day"
        )));

        // Different day inside current month shows an event indicator dot in bulan_header
        let dot_day = if day == 1 { 2 } else { 1 };
        hub.ical_calendar.events = vec![providers::AgendaItem {
            id: "ical_dot".into(),
            title: "Workshop".into(),
            time: "14:00".into(),
            date_key: Some(format!("{year:04}-{month:02}-{dot_day:02}")),
        }];
        let month_slot = WidgetStackSlot {
            slot_id: "cal_dot".into(),
            size: config::WidgetSize::Medium,
            widgets: vec![WidgetInstance {
                instance_id: "cal2".into(),
                widget_type: "calendar_agenda".into(),
                style_override: None,
                settings: serde_json::json!({ "calendar_style": "bulan_header" }),
            }],
            ..Default::default()
        };
        let month_item = build_widget_render_item(
            &month_slot,
            RectF::new(0.0, 0.0, 336.0, 160.0),
            &style,
            &region,
            &hub,
            0.0,
        );
        assert!(month_item.nodes.iter().any(|n| matches!(
            n,
            layout::SceneNode::RoundedRect { rect, .. }
                if (rect.w - 3.0).abs() < 0.01 && (rect.h - 3.0).abs() < 0.01
        )));
    }
}
