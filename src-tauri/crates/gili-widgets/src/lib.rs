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
        state.hub.prayer = build_prayer_snapshot(
            "Jakarta",
            -6.2088,
            106.8456,
            7.0,
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
                st.hub.prayer = build_prayer_snapshot(
                    &city,
                    lat,
                    lon,
                    7.0,
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
        let qc = QuickControlsSnapshot {
            wifi_enabled: wifi,
            bluetooth_enabled: bluetooth,
            dark_mode_enabled: read_windows_dark_mode(),
            audio_muted,
        };

        if let Ok(mut st) = self.shared.lock() {
            st.hub.system = perf;
            st.hub.top_processes = procs;
            st.hub.quick_controls = qc;
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

        // 1. Empty state must expose direct desktop picker actions ("photo_pick" & "photo_pick_folder")
        let mut hub = WidgetDataHub::default();
        let slot = WidgetStackSlot {
            slot_id: "pf_slot".into(),
            size: config::WidgetSize::Small,
            widgets: vec![WidgetInstance {
                instance_id: "pf1".into(),
                widget_type: "photo_frame".into(),
                style_override: None,
                settings: serde_json::json!({ "polaroid": true }),
            }],
            ..Default::default()
        };
        let mut empty_item = build_widget_render_item(
            &slot,
            RectF::new(0.0, 0.0, 152.0, 152.0),
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
        assert!(
            empty_item
                .content_hit_rects
                .iter()
                .any(|r| r.action_id.as_deref() == Some("photo_pick_folder")),
            "Bingkai Foto kosong harus punya aksi langsung photo_pick_folder di widget"
        );

        // 2. Loaded manual photos without folder_path MUST render ImageRef (not empty state)
        hub.photo_frame.folder_path = None;
        hub.photo_frame.photos = vec!["C:\\tmp\\a.jpg".into(), "C:\\tmp\\b.jpg".into()];
        let mut loaded_item = build_widget_render_item(
            &slot,
            RectF::new(0.0, 0.0, 152.0, 152.0),
            &theme,
            &analysis,
            &hub,
            0.0,
        );
        loaded_item.compute_hit_regions(false);
        assert!(
            loaded_item
                .nodes
                .iter()
                .any(|n| matches!(n, layout::SceneNode::ImageRef { .. })),
            "Foto manual tanpa folder_path harus tetap dirender sebagai ImageRef"
        );
        assert!(
            loaded_item
                .content_hit_rects
                .iter()
                .any(|r| r.action_id.as_deref() == Some("photo_next")),
            "Klik foto harus punya action_id photo_next"
        );
        assert!(
            loaded_item
                .content_hit_rects
                .iter()
                .any(|r| r.action_id.as_deref() == Some("photo_pick")),
            "Tombol + Foto harus selalu ada di polaroid aktif"
        );

        // 3. Even when polaroid frame is false, + Foto overlay pill must win hit test over background photo
        let fullbleed_slot = WidgetStackSlot {
            slot_id: "pf_full".into(),
            size: config::WidgetSize::Small,
            widgets: vec![WidgetInstance {
                instance_id: "pf2".into(),
                widget_type: "photo_frame".into(),
                style_override: None,
                settings: serde_json::json!({ "polaroid": false }),
            }],
            ..Default::default()
        };
        let mut full_item = build_widget_render_item(
            &fullbleed_slot,
            RectF::new(0.0, 0.0, 152.0, 152.0),
            &theme,
            &analysis,
            &hub,
            0.0,
        );
        full_item.compute_hit_regions(false);
        let pick_region = full_item
            .content_hit_rects
            .iter()
            .find(|r| r.action_id.as_deref() == Some("photo_pick"))
            .expect("+ Foto pill region missing")
            .bounds;
        let hit = layout::hit_test_scene(
            &[full_item],
            false,
            None,
            pick_region.x + pick_region.w * 0.5,
            pick_region.y + pick_region.h * 0.5,
        );
        assert_eq!(
            hit,
            layout::HitTestResult::WidgetContent {
                slot_id: "pf_full".into(),
                action_id: Some("photo_pick".into())
            }
        );

        // 4. step_photo_index wraps safely forward & backward
        providers::local_stores::step_photo_index(&mut hub.photo_frame, 1);
        assert_eq!(hub.photo_frame.current_index, 1);
        providers::local_stores::step_photo_index(&mut hub.photo_frame, 1);
        assert_eq!(hub.photo_frame.current_index, 0);
        providers::local_stores::step_photo_index(&mut hub.photo_frame, -1);
        assert_eq!(hub.photo_frame.current_index, 1);
    }
}
