use gili_widgets::config::{gili_data_dir, DesktopWidgetsConfig, WidgetStyleConfig};
use gili_widgets::contrast::WallpaperRegionAnalysis;
use gili_widgets::d2d_host::{WidgetHostEvent, WidgetRuntimeMetrics};
use gili_widgets::providers::audio_fft::WasapiLoopbackStream;
use gili_widgets::providers::local_stores::{
    add_manual_photos, copy_text_to_clipboard_silently, parse_iso_ymd, scan_photo_folder_readonly,
    scan_recent_files_metadata_only, step_photo_index, CountdownMoment, ExpenseItem, KanbanCard,
    QuickSnippetItem, ShortcutEntry, StickyNote, TimeProject, WorldClockZone,
};
use gili_widgets::providers::network_providers::{
    fetch_currency_and_gold, fetch_github_repo_status, fetch_open_meteo_air_quality,
    fetch_open_meteo_forecast, ping_user_site, validate_https_url_with_allowlist, BackoffState,
    SiteMonitorConfig, UnconfiguredGoldProvider, GITHUB_CRED_TARGET, MAX_UPTIME_SITES,
    MIN_UPTIME_INTERVAL_SECS,
};
use gili_widgets::providers::system_data::{
    default_treemap_user_root, read_windows_dark_mode, scan_storage_treemap_bounded,
    set_windows_dark_mode,
};
use gili_widgets::providers::{FrontendMirrorSnapshot, MediaSnapshot};
use gili_widgets::widgets::{widget_catalog, WidgetCatalogEntry};
use gili_widgets::DesktopWidgetEngine;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

static ENGINE: OnceLock<DesktopWidgetEngine> = OnceLock::new();
static UPTIME_CONFIGS: OnceLock<Mutex<Vec<SiteMonitorConfig>>> = OnceLock::new();
static GITHUB_REPO: OnceLock<Mutex<String>> = OnceLock::new();
static PHOTO_PICKER_ACTIVE: AtomicBool = AtomicBool::new(false);
static AUDIO_LOOP_STOP: AtomicBool = AtomicBool::new(false);

pub fn engine() -> &'static DesktopWidgetEngine {
    ENGINE.get_or_init(DesktopWidgetEngine::new)
}

fn uptime_configs() -> &'static Mutex<Vec<SiteMonitorConfig>> {
    UPTIME_CONFIGS.get_or_init(|| Mutex::new(Vec::new()))
}

fn github_repo_store() -> &'static Mutex<String> {
    GITHUB_REPO.get_or_init(|| Mutex::new(String::new()))
}

fn now_epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(windows)]
fn write_github_pat_credential(token: &str) -> Result<(), String> {
    use windows::core::PWSTR;
    use windows::Win32::Security::Credentials::{
        CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    let mut target_w: Vec<u16> = GITHUB_CRED_TARGET.encode_utf16().chain(Some(0)).collect();
    let mut user_w: Vec<u16> = "gili_widget_github".encode_utf16().chain(Some(0)).collect();
    let blob = token.as_bytes();
    let cred = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target_w.as_mut_ptr()),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_ptr() as *mut u8,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: PWSTR(user_w.as_mut_ptr()),
        ..Default::default()
    };
    unsafe { CredWriteW(&cred, 0).map_err(|e| format!("Gagal menyimpan kredensial: {e}")) }
}

#[cfg(windows)]
fn read_github_pat_credential() -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::Security::Credentials::{
        CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
    };
    let target_w: Vec<u16> = GITHUB_CRED_TARGET.encode_utf16().chain(Some(0)).collect();
    let mut ptr: *mut CREDENTIALW = std::ptr::null_mut();
    let ok =
        unsafe { CredReadW(PCWSTR(target_w.as_ptr()), CRED_TYPE_GENERIC, 0, &mut ptr).is_ok() };
    if !ok || ptr.is_null() {
        return None;
    }
    let token = unsafe {
        let c = &*ptr;
        if c.CredentialBlob.is_null() || c.CredentialBlobSize == 0 {
            None
        } else {
            let bytes = std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize);
            String::from_utf8(bytes.to_vec()).ok()
        }
    };
    unsafe {
        CredFree(ptr as *const _);
    }
    token
}

#[cfg(not(windows))]
fn write_github_pat_credential(_token: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
fn read_github_pat_credential() -> Option<String> {
    None
}

fn parse_quick_expense_input(raw: &str) -> Option<(String, i64)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    let last = parts.last()?;
    let numeric: String = last.chars().filter(|c| c.is_ascii_digit()).collect();
    let amount = numeric.parse::<i64>().ok()?;
    if amount <= 0 {
        return None;
    }
    let label = if parts.len() > 1 {
        parts[..parts.len() - 1].join(" ")
    } else {
        "Pengeluaran".to_string()
    };
    Some((label, amount))
}

fn build_media_snapshot_from_gili_store() -> MediaSnapshot {
    let m = crate::media_lyrics_store::get_current_media();
    let lyr = crate::media_lyrics_store::get_current_lyrics();

    let mut active_lyric = String::new();
    let mut next_lyric = String::new();
    let mut lyrics_lines = Vec::new();
    let mut lyrics_state = "empty".to_string();

    if let Some(lp) = lyr {
        lyrics_state = lp.state.clone();
        if !lp.lines.is_empty() {
            let mut active_idx = 0usize;
            for (i, line) in lp.lines.iter().enumerate() {
                if line.time <= m.position + lp.offset {
                    active_idx = i;
                }
            }
            active_lyric = lp
                .lines
                .get(active_idx)
                .map(|l| l.text.clone())
                .unwrap_or_default();
            next_lyric = lp
                .lines
                .get(active_idx + 1)
                .map(|l| l.text.clone())
                .unwrap_or_default();

            let start = active_idx.saturating_sub(2);
            lyrics_lines = lp
                .lines
                .iter()
                .skip(start)
                .take(8)
                .map(|l| l.text.clone())
                .collect();
        } else if let Some(plain) = lp.plain_lyrics {
            lyrics_lines = plain
                .lines()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .take(8)
                .collect();
            if let Some(first) = lyrics_lines.first() {
                active_lyric = first.clone();
            }
        }
    }

    MediaSnapshot {
        title: m.title,
        artist: m.artist,
        album: m.album.unwrap_or_default(),
        thumbnail_path_or_data: m.thumbnail,
        position_sec: m.position,
        duration_sec: m.duration,
        is_playing: m.is_playing,
        active_lyric_line: active_lyric,
        next_lyric_line: next_lyric,
        lyrics_lines,
        lyrics_state,
    }
}

pub fn start_desktop_widgets_bridge(app: AppHandle) {
    let eng = engine();
    let app_ev = app.clone();

    eng.set_event_handler(move |ev| match ev {
        WidgetHostEvent::ConfigMutated { config } => {
            // Persist directly to disk without re-locking engine().shared (host thread already updated it).
            let _ = gili_widgets::config::save_config_atomic(
                &gili_widgets::config::config_path(),
                &config,
            );
            let _ = app_ev.emit("desktop-widgets-config-changed", ());
        }
        WidgetHostEvent::OpenGallery | WidgetHostEvent::OpenCustomizer { .. } => {
            crate::show_or_create_settings_window(&app_ev, Some("widgets".to_string()));
        }
        WidgetHostEvent::OpenFeature {
            widget_type,
            action_id,
        } => {
            if let Some(act) = &action_id {
                if let Some(rest) = act.strip_prefix("kanban_move:") {
                    let mut sp = rest.splitn(2, ':');
                    if let (Some(card_id), Some(to_col)) = (sp.next(), sp.next()) {
                        engine().with_hub_mut(|hub| {
                            hub.kanban.move_card(card_id, to_col);
                        });
                        let _ = engine().persist_kanban();
                        return;
                    }
                } else if let Some(pid) = act.strip_prefix("time_toggle:") {
                    let now = now_epoch_secs();
                    engine().with_hub_mut(|hub| {
                        hub.time_tracker.toggle_project(pid, now);
                    });
                    let _ = engine().persist_time_tracker();
                    return;
                } else if let Some(sid) = act.strip_prefix("copy_snippet:") {
                    let content_opt = engine()
                        .with_hub_mut(|hub| {
                            hub.snippets
                                .iter()
                                .find(|s| s.id == sid)
                                .map(|s| s.content.clone())
                        })
                        .flatten();
                    if let Some(content) = content_opt {
                        let _ = copy_text_to_clipboard_silently(&content);
                    }
                    return;
                } else if act == "trigger_storage_scan" {
                    let _ = spawn_storage_scan_job(None);
                    return;
                } else if act == "open_widget_settings" {
                    crate::show_or_create_settings_window(&app_ev, Some("widgets".to_string()));
                    return;
                } else if act == "open_ai_settings" {
                    if let Some(w) = app_ev.get_webview_window("main") {
                        let _ = w.unminimize();
                        let _ = w.show();
                        let _ = w.emit(
                            "desktop-widget-deep-link",
                            serde_json::json!({
                                "widget_type": "ai_quick_ask",
                                "action_id": "open_ai_settings",
                            }),
                        );
                    }
                    return;
                } else if act == "photo_pick" {
                    spawn_photo_picker_thread(false);
                    return;
                } else if act == "photo_pick_folder" {
                    spawn_photo_picker_thread(true);
                    return;
                } else if act == "photo_next" || act == "photo_prev" {
                    let delta = if act == "photo_prev" { -1 } else { 1 };
                    engine().with_hub_mut(|h| {
                        step_photo_index(&mut h.photo_frame, delta);
                    });
                    let _ = engine().persist_photo_frame();
                    return;
                } else if act == "toggle_media_playback" {
                    tauri::async_runtime::spawn(async {
                        let _ = crate::smtc_action("toggle".to_string()).await;
                    });
                    return;
                } else if act == "media_prev" {
                    tauri::async_runtime::spawn(async {
                        let _ = crate::smtc_action("prev".to_string()).await;
                    });
                    return;
                } else if act == "media_next" {
                    tauri::async_runtime::spawn(async {
                        let _ = crate::smtc_action("next".to_string()).await;
                    });
                    return;
                } else if act == "mascot_poke" {
                    engine().with_hub_mut(|h| {
                        h.mascot_poke_count = h.mascot_poke_count.wrapping_add(1);
                    });
                    return;
                } else if act == "export_time_csv" {
                    if let Ok(csv_path) = export_widget_time_tracker_csv() {
                        let _ = tauri_plugin_opener::reveal_item_in_dir(std::path::Path::new(
                            &csv_path,
                        ));
                    }
                    return;
                } else if let Some(sc_id) = act.strip_prefix("launch_shortcut:") {
                    let target = engine()
                        .with_hub_mut(|h| {
                            h.shortcuts
                                .iter()
                                .find(|s| s.id == sc_id)
                                .map(|s| s.target_path.clone())
                        })
                        .flatten();
                    if let Some(raw) = target {
                        launch_widget_shortcut(&raw);
                    }
                    return;
                } else if let Some(file_id) = act.strip_prefix("open_shelf_file:") {
                    let item = engine()
                        .with_hub_mut(|h| {
                            h.frontend
                                .shelf_files
                                .iter()
                                .find(|f| f.id == file_id)
                                .map(|f| (f.path.clone(), f.name.clone()))
                        })
                        .flatten();
                    if let Some((path, name)) = item {
                        open_widget_shelf_file(&path, &name);
                    }
                    return;
                } else if act == "refresh_processes" {
                    std::thread::spawn(|| {
                        let procs =
                            gili_widgets::providers::system_data::sample_top_processes_readonly(10);
                        engine().with_hub_mut(|h| {
                            h.top_processes = procs;
                        });
                    });
                    return;
                } else if act == "refresh_weather"
                    || act == "refresh_air_quality"
                    || act == "refresh_currency"
                    || act == "refresh_github"
                {
                    trigger_immediate_network_refresh(act);
                    return;
                }
            }
            if let Some(w) = app_ev.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.emit(
                    "desktop-widget-deep-link",
                    serde_json::json!({
                        "widget_type": widget_type,
                        "action_id": action_id,
                    }),
                );
            }
        }
        WidgetHostEvent::TextInputSubmitted {
            widget_type, text, ..
        } => match widget_type.as_str() {
            "sticky_notes" => {
                engine().with_hub_mut(|hub| {
                    hub.notes.insert(
                        0,
                        StickyNote {
                            id: format!("n_{}", now_epoch_secs()),
                            title: "Catatan Cepat".into(),
                            content: text.trim().to_string(),
                            color: "blue".into(),
                            is_checklist: false,
                            checklist: Vec::new(),
                            updated_at: now_epoch_secs(),
                        },
                    );
                });
                let _ = engine().persist_notes();
            }
            "mini_kanban" => {
                engine().with_hub_mut(|hub| {
                    hub.kanban.todo.push(KanbanCard {
                        id: format!("k_{}", now_epoch_secs()),
                        title: text.trim().to_string(),
                        tag: None,
                    });
                });
                let _ = engine().persist_kanban();
            }
            "quick_expense" => {
                if let Some((label, amount_idr)) = parse_quick_expense_input(&text) {
                    engine().with_hub_mut(|hub| {
                        hub.expenses.entries.push(ExpenseItem {
                            id: format!("e_{}", now_epoch_secs()),
                            label,
                            amount_idr,
                            category: "Harian".into(),
                            timestamp_secs: now_epoch_secs(),
                        });
                    });
                    let _ = engine().persist_expenses();
                }
            }
            "ai_quick_ask" => {
                let _ = app_ev.emit(
                    "desktop-widget-ai-ask",
                    serde_json::json!({ "prompt": text }),
                );
            }
            _ => {}
        },
        WidgetHostEvent::ToggleQuickControl { control } => match control.as_str() {
            "audio_mute" => {
                std::thread::spawn(|| {
                    if let Some(next_muted) = with_windows_master_mute(true) {
                        engine().with_hub_mut(|hub| {
                            hub.quick_controls.audio_muted = Some(next_muted);
                        });
                    }
                });
            }
            "dark_mode" => {
                let cur = read_windows_dark_mode();
                let _ = set_windows_dark_mode(!cur);
                engine().with_hub_mut(|hub| {
                    hub.quick_controls.dark_mode_enabled = !cur;
                });
            }
            "wifi" => {
                tauri::async_runtime::spawn(async {
                    if let Ok(st) = crate::connectivity::get_wifi_status().await {
                        let next = !st.enabled;
                        if let Ok(v) = crate::connectivity::toggle_wifi(next).await {
                            engine().with_hub_mut(|hub| {
                                hub.quick_controls.wifi_enabled = Some(v);
                            });
                        }
                    }
                });
            }
            "bluetooth" => {
                tauri::async_runtime::spawn(async {
                    if let Ok(st) = crate::connectivity::get_bluetooth_status().await {
                        let next = !st.enabled;
                        if let Ok(v) = crate::connectivity::toggle_bluetooth(next).await {
                            engine().with_hub_mut(|hub| {
                                hub.quick_controls.bluetooth_enabled = Some(v);
                            });
                        }
                    }
                });
            }
            _ => {}
        },
    });

    AUDIO_LOOP_STOP.store(false, Ordering::Relaxed);
    if eng.get_config().enabled {
        eng.start_host_if_needed();
    }

    // Dedicated real-time WASAPI loopback FFT capture thread (~60 Hz when visualizer is active)
    std::thread::Builder::new()
        .name("gili-widgets-audio".into())
        .spawn(move || {
            let mut stream: Option<WasapiLoopbackStream> = None;
            let mut last_pushed = [0.0f32; 16];
            let mut last_open_attempt = Instant::now() - Duration::from_secs(5);

            while !AUDIO_LOOP_STOP.load(Ordering::Relaxed) {
                let cfg = engine().get_config();
                let met = engine().metrics();
                let has_visualizer = cfg.slots.iter().any(|s| {
                    s.active_widget()
                        .map(|w| w.widget_type == "audio_visualizer")
                        .unwrap_or(false)
                });
                let active =
                    (cfg.enabled || met.board_visible) && has_visualizer && met.paused_reason.is_none();

                if !active {
                    stream = None;
                    if last_pushed.iter().any(|&v| v > 0.0) {
                        last_pushed = [0.0; 16];
                        engine().update_audio_bands(last_pushed);
                    }
                    std::thread::sleep(Duration::from_millis(350));
                    continue;
                }

                if stream.is_none() {
                    if last_open_attempt.elapsed() >= Duration::from_millis(1500) {
                        last_open_attempt = Instant::now();
                        stream = WasapiLoopbackStream::open();
                    }
                    if stream.is_none() {
                        std::thread::sleep(Duration::from_millis(250));
                        continue;
                    }
                }

                match stream.as_mut().unwrap().poll() {
                    Ok(next) => {
                        let was_non_zero = last_pushed.iter().any(|&v| v > 0.0);
                        let is_all_zero = next.iter().all(|&v| v == 0.0);
                        let changed = next
                            .iter()
                            .zip(last_pushed.iter())
                            .any(|(a, b)| (a - b).abs() > 0.003);
                        if changed || (was_non_zero && is_all_zero) {
                            last_pushed = next;
                            engine().update_audio_bands(next);
                        }
                    }
                    Err(()) => {
                        stream = None;
                        last_open_attempt = Instant::now();
                    }
                }

                std::thread::sleep(Duration::from_millis(16));
            }
        })
        .ok();

    // Single lightweight feeder thread (sleeps when widgets disabled or paused)
    std::thread::Builder::new()
        .name("gili-widgets-feeder".into())
        .spawn(move || {
            let mut weather_backoff = BackoffState::new(900, 3600);
            let mut aqi_backoff = BackoffState::new(900, 3600);
            let mut currency_backoff = BackoffState::new(3600, 14400);
            let mut uptime_backoff = BackoffState::new(MIN_UPTIME_INTERVAL_SECS, 600);
            let mut github_backoff = BackoffState::new(180, 1800);
            let mut last_sys = Instant::now() - Duration::from_secs(10);
            let mut last_gpu = Instant::now() - Duration::from_secs(30);
            let mut last_screen_time = Instant::now() - Duration::from_secs(30);
            let mut last_media = Instant::now() - Duration::from_secs(10);
            let mut last_qc_poll = Instant::now() - Duration::from_secs(30);
            let mut last_prayer_refresh = Instant::now() - Duration::from_secs(60);
            let mut last_recent_scan = Instant::now() - Duration::from_secs(60);
            let mut last_photo_step = Instant::now();
            let mut cached_gpu: Option<(String, Option<u32>, Option<u32>)> = None;

            loop {
                let cfg = engine().get_config();
                let met = engine().metrics();
                if !cfg.enabled && !met.board_visible {
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }

                let has_widget = |wt: &str| {
                    cfg.slots.iter().any(|s| {
                        s.active_widget()
                            .map(|w| w.widget_type == wt)
                            .unwrap_or(false)
                    })
                };

                // Media & lyrics sync (1s cadence when Now Playing or Visualizer mounted)
                if (has_widget("now_playing") || has_widget("audio_visualizer"))
                    && last_media.elapsed() >= Duration::from_millis(900)
                {
                    last_media = Instant::now();
                    engine().update_media(build_media_snapshot_from_gili_store());
                }

                // System performance & top processes (2.5s cadence when mounted)
                if (has_widget("system_performance")
                    || has_widget("top_processes")
                    || has_widget("quick_controls")
                    || has_widget("screen_time"))
                    && last_sys.elapsed() >= Duration::from_millis(2500)
                {
                    last_sys = Instant::now();
                    let net_m = crate::system_monitor::get_system_metrics_internal();
                    if last_gpu.elapsed() >= Duration::from_secs(6) {
                        last_gpu = Instant::now();
                        let g = tauri::async_runtime::block_on(
                            crate::gpu_telemetry::get_gpu_telemetry(),
                        );
                        cached_gpu = Some((g.name, g.usage_pct, g.temp_c));
                    }
                    let (gpu_name, gpu_pct, gpu_temp) = match &cached_gpu {
                        Some((n, u, t)) => (Some(n.clone()), *u, *t),
                        None => (None, None, None),
                    };
                    let mut qc_wifi = None;
                    let mut qc_bt = None;
                    let mut qc_mute = None;
                    if has_widget("quick_controls")
                        && last_qc_poll.elapsed() >= Duration::from_secs(10)
                    {
                        last_qc_poll = Instant::now();
                        qc_mute = with_windows_master_mute(false);
                        qc_wifi =
                            tauri::async_runtime::block_on(crate::connectivity::get_wifi_status())
                                .ok()
                                .map(|s| s.enabled);
                        qc_bt = tauri::async_runtime::block_on(
                            crate::connectivity::get_bluetooth_status(),
                        )
                        .ok()
                        .map(|s| s.enabled);
                    }
                    engine().update_system_telemetry(
                        gpu_name,
                        gpu_pct,
                        gpu_temp,
                        net_m.wifi_down_mbps,
                        net_m.wifi_up_mbps,
                        qc_wifi,
                        qc_bt,
                        qc_mute,
                    );
                }

                // Auto-advance Polaroid slideshow cleanly every effective_interval_secs (default 5s)
                if has_widget("photo_frame") {
                    let (photo_count, interval_secs) = engine()
                        .with_hub_mut(|h| {
                            (
                                h.photo_frame.photos.len(),
                                h.photo_frame.effective_interval_secs(),
                            )
                        })
                        .unwrap_or((0, 5));
                    if photo_count <= 1 {
                        last_photo_step = Instant::now();
                    } else if last_photo_step.elapsed() >= Duration::from_secs(interval_secs as u64)
                    {
                        last_photo_step = Instant::now();
                        engine().with_hub_mut(|h| {
                            step_photo_index(&mut h.photo_frame, 1);
                        });
                    }
                }

                // Refresh recent files metadata when opted-in
                if has_widget("recent_files")
                    && last_recent_scan.elapsed() >= Duration::from_secs(30)
                {
                    last_recent_scan = Instant::now();
                    engine().with_hub_mut(|h| {
                        if h.recent_files.opt_in_enabled
                            && !h.recent_files.watched_folders.is_empty()
                        {
                            scan_recent_files_metadata_only(&mut h.recent_files, 16);
                        }
                    });
                }

                // Refresh prayer countdown & Hijri date every 30s
                if (has_widget("prayer_times") || has_widget("hijri_holidays"))
                    && last_prayer_refresh.elapsed() >= Duration::from_secs(30)
                {
                    last_prayer_refresh = Instant::now();
                    let (city, lat, lon) = engine()
                        .with_hub_mut(|h| {
                            (
                                h.frontend
                                    .custom_city_name
                                    .clone()
                                    .unwrap_or_else(|| "Jakarta".into()),
                                h.frontend.custom_lat.unwrap_or(-6.2088),
                                h.frontend.custom_lon.unwrap_or(106.8456),
                            )
                        })
                        .unwrap_or_else(|| ("Jakarta".into(), -6.2088, 106.8456));
                    let (year, month, day, hour, min, _, _) =
                        gili_widgets::widgets::local_datetime_parts();
                    let tz_offset_hours = gili_widgets::widgets::local_utc_offset_hours();
                    let holidays_path = gili_data_dir().join("skb3menteri_holidays.json");
                    let hijri = gili_widgets::providers::prayer_calc::build_hijri_holiday_snapshot(
                        year,
                        month as i32,
                        day as i32,
                        0,
                        &holidays_path,
                    );
                    let prayer = gili_widgets::providers::prayer_calc::build_prayer_snapshot(
                        &city,
                        lat,
                        lon,
                        tz_offset_hours,
                        year,
                        month as i32,
                        day as i32,
                        hour as i32,
                        min as i32,
                        hijri.is_ramadan,
                    );
                    engine().with_hub_mut(|h| {
                        h.hijri_holidays = hijri;
                        h.prayer = prayer;
                    });
                }

                // Screen time sync from Gili's existing compute_windows_screen_time (15s cadence)
                if has_widget("screen_time")
                    && last_screen_time.elapsed() >= Duration::from_secs(15)
                {
                    last_screen_time = Instant::now();
                    let info = crate::compute_windows_screen_time();
                    engine().with_hub_mut(|h| {
                        h.screen_time.today_secs = info.active_seconds;
                        h.screen_time.uptime_secs = info.uptime_awake_seconds;
                        h.screen_time.date_key = info.date_key;
                        if h.screen_time.daily_limit_secs == 0 {
                            h.screen_time.daily_limit_secs = 8 * 3600;
                        }
                    });
                }

                // Network pollers with strict backoff
                let now = Instant::now();
                let (loc_name, loc_lat, loc_lon) = engine()
                    .with_hub_mut(|h| {
                        (
                            h.frontend
                                .custom_city_name
                                .clone()
                                .unwrap_or_else(|| "Jakarta".into()),
                            h.frontend.custom_lat.unwrap_or(-6.2088),
                            h.frontend.custom_lon.unwrap_or(106.8456),
                        )
                    })
                    .unwrap_or_else(|| ("Jakarta".into(), -6.2088, 106.8456));

                if has_widget("weather_forecast") && weather_backoff.can_run(now) {
                    let snap = fetch_open_meteo_forecast(&loc_name, loc_lat, loc_lon);
                    if snap.available {
                        weather_backoff.record_success(now);
                    } else {
                        weather_backoff.record_failure(now);
                    }
                    engine().with_hub_mut(|h| h.weather = snap);
                }

                if has_widget("air_quality") && aqi_backoff.can_run(now) {
                    let snap = fetch_open_meteo_air_quality(&loc_name, loc_lat, loc_lon);
                    if snap.available {
                        aqi_backoff.record_success(now);
                    } else {
                        aqi_backoff.record_failure(now);
                    }
                    engine().with_hub_mut(|h| h.air_quality = snap);
                }

                if has_widget("currency_gold") && currency_backoff.can_run(now) {
                    let gold = UnconfiguredGoldProvider;
                    let snap = fetch_currency_and_gold(&gold);
                    if snap.usd_to_idr.is_some() {
                        currency_backoff.record_success(now);
                    } else {
                        currency_backoff.record_failure(now);
                    }
                    engine().with_hub_mut(|h| h.currency_gold = snap);
                }

                if has_widget("site_status") && uptime_backoff.can_run(now) {
                    let sites: Vec<SiteMonitorConfig> = uptime_configs()
                        .lock()
                        .map(|g| g.clone())
                        .unwrap_or_default();
                    if !sites.is_empty() {
                        let results: Vec<_> = sites
                            .iter()
                            .take(MAX_UPTIME_SITES)
                            .map(ping_user_site)
                            .collect();
                        uptime_backoff.record_success(now);
                        engine().with_hub_mut(|h| h.uptime_sites = results);
                    }
                }

                if has_widget("github_status") && github_backoff.can_run(now) {
                    let repo = github_repo_store()
                        .lock()
                        .map(|g| g.clone())
                        .unwrap_or_default();
                    if !repo.is_empty() {
                        if let Some(tok) = read_github_pat_credential() {
                            let prev = engine()
                                .with_hub_mut(|h| h.github.clone())
                                .unwrap_or_default();
                            let next = fetch_github_repo_status(&repo, &tok, &prev);
                            if next.error.is_none() {
                                github_backoff.record_success(now);
                            } else {
                                github_backoff.record_failure(now);
                            }
                            engine().with_hub_mut(|h| h.github = next);
                        }
                    }
                }

                std::thread::sleep(Duration::from_millis(400));
            }
        })
        .ok();
}

pub fn shutdown_desktop_widgets_on_exit() {
    AUDIO_LOOP_STOP.store(true, Ordering::Relaxed);
    engine().shutdown();
}

fn spawn_storage_scan_job(root_path: Option<String>) -> Result<(), String> {
    let root = root_path
        .map(PathBuf::from)
        .filter(|p| p.exists())
        .unwrap_or_else(default_treemap_user_root);

    std::thread::Builder::new()
        .name("gili-widgets-treemap".into())
        .spawn(move || {
            let snap = scan_storage_treemap_bounded(&root, 2, 12_000);
            engine().with_hub_mut(|hub| {
                hub.storage_treemap = Some(snap);
            });
        })
        .map_err(|e| format!("Gagal memulai pemindaian penyimpanan: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_desktop_widgets_config() -> DesktopWidgetsConfig {
    engine().get_config()
}

#[tauri::command]
pub fn save_desktop_widgets_config(
    config: DesktopWidgetsConfig,
) -> Result<DesktopWidgetsConfig, String> {
    engine().save_config(config)
}

#[tauri::command]
pub fn get_desktop_widgets_catalog() -> Vec<WidgetCatalogEntry> {
    widget_catalog()
}

#[tauri::command]
pub fn toggle_desktop_widget_board(visible: Option<bool>) -> bool {
    engine().toggle_board(visible)
}

#[tauri::command]
pub fn set_desktop_widget_edit_mode(enabled: bool) {
    engine().set_edit_mode(enabled);
}

#[tauri::command]
pub fn get_desktop_widgets_runtime_metrics() -> WidgetRuntimeMetrics {
    engine().metrics()
}

#[tauri::command]
pub fn analyze_widget_wallpaper_contrast(
    style: WidgetStyleConfig,
    nx: f32,
    ny: f32,
    nw: f32,
    nh: f32,
) -> WallpaperRegionAnalysis {
    engine().analyze_style_contrast(&style, nx, ny, nw, nh)
}

#[tauri::command]
pub fn sync_frontend_widget_mirror(mirror: FrontendMirrorSnapshot) {
    engine().update_frontend_mirror(mirror);
}

#[tauri::command]
pub fn save_github_widget_token(token: String, repo: String) -> Result<(), String> {
    let clean_repo = repo.trim().trim_matches('/').to_string();
    if !clean_repo.contains('/') {
        return Err("Format repositori harus owner/repo.".to_string());
    }
    write_github_pat_credential(token.trim())?;
    if let Ok(mut g) = github_repo_store().lock() {
        *g = clean_repo.clone();
    }
    engine().with_hub_mut(|h| {
        h.github.configured = true;
        h.github.repo = clean_repo;
        h.github.error = None;
    });
    Ok(())
}

#[tauri::command]
pub fn trigger_widget_storage_scan(root_path: Option<String>) -> Result<(), String> {
    spawn_storage_scan_job(root_path)
}

#[tauri::command]
pub fn export_widget_time_tracker_csv() -> Result<String, String> {
    let csv = engine()
        .with_hub_mut(|h| h.time_tracker.export_csv(now_epoch_secs()))
        .ok_or_else(|| "Gagal membaca pelacak waktu".to_string())?;
    let out_path = gili_data_dir().join("time_tracker_export.csv");
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&out_path, csv.as_bytes()).map_err(|e| e.to_string())?;
    Ok(out_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn set_widget_expense_budget(budget_idr: i64) -> Result<(), String> {
    engine().with_hub_mut(|h| {
        h.expenses.monthly_budget_idr = budget_idr.max(0);
    });
    engine().persist_expenses()
}

#[tauri::command]
pub fn add_widget_uptime_site(name: String, url: String) -> Result<(), String> {
    let clean = validate_https_url_with_allowlist(&url, &[])?;
    let mut list = uptime_configs()
        .lock()
        .map_err(|_| "Lock situs gagal".to_string())?;
    if list.len() >= MAX_UPTIME_SITES {
        return Err(format!("Batas maksimal {} situs uptime.", MAX_UPTIME_SITES));
    }
    let cfg = SiteMonitorConfig {
        name: name.trim().to_string(),
        url: clean,
        interval_secs: MIN_UPTIME_INTERVAL_SECS,
        timeout_ms: 6000,
    };
    list.push(cfg);
    Ok(())
}

#[tauri::command]
pub fn add_widget_time_project(name: String) -> Result<(), String> {
    engine().with_hub_mut(|h| {
        h.time_tracker.projects.push(TimeProject {
            id: format!("proj_{}", now_epoch_secs()),
            name: name.trim().to_string(),
            total_seconds: 0,
            running_since_epoch: None,
        });
    });
    engine().persist_time_tracker()
}

#[tauri::command]
pub fn add_widget_shortcut(name: String, target_path: String) -> Result<(), String> {
    let p = target_path.trim().to_string();
    let kind = if p.starts_with("https://") || p.starts_with("http://") {
        "link"
    } else if std::path::Path::new(&p).is_dir() {
        "folder"
    } else {
        "app"
    };
    engine().with_hub_mut(|h| {
        h.shortcuts.push(ShortcutEntry {
            id: format!("sc_{}", now_epoch_secs()),
            label: name.trim().to_string(),
            target_path: p,
            kind: kind.into(),
        });
    });
    engine().persist_shortcuts()
}

#[tauri::command]
pub fn configure_widget_photo_folder(folder_path: String) -> Result<usize, String> {
    let trimmed = folder_path.trim().to_string();
    let count = engine()
        .with_hub_mut(|h| {
            h.photo_frame.folder_path = if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            };
            h.photo_frame.current_index = 0;
            scan_photo_folder_readonly(&mut h.photo_frame);
            h.photo_frame.photos.len()
        })
        .unwrap_or(0);
    engine().persist_photo_frame()?;
    Ok(count)
}

#[tauri::command]
pub async fn pick_widget_photos_dialog() -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(run_pick_photos_sync)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pick_widget_photo_folder_dialog() -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(run_pick_folder_sync)
        .await
        .map_err(|e| e.to_string())?
}

fn spawn_photo_picker_thread(pick_folder: bool) {
    if PHOTO_PICKER_ACTIVE.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = std::thread::Builder::new()
        .name("gili-photo-picker".into())
        .spawn(move || {
            let _reset = PickerActiveGuard;
            let _ = if pick_folder {
                run_pick_folder_inner()
            } else {
                run_pick_photos_inner()
            };
        });
}

struct PickerActiveGuard;
impl Drop for PickerActiveGuard {
    fn drop(&mut self) {
        PHOTO_PICKER_ACTIVE.store(false, Ordering::SeqCst);
    }
}

fn run_pick_photos_sync() -> Result<usize, String> {
    if PHOTO_PICKER_ACTIVE.swap(true, Ordering::SeqCst) {
        return Ok(0);
    }
    let _reset = PickerActiveGuard;
    run_pick_photos_inner()
}

fn run_pick_folder_sync() -> Result<usize, String> {
    if PHOTO_PICKER_ACTIVE.swap(true, Ordering::SeqCst) {
        return Ok(0);
    }
    let _reset = PickerActiveGuard;
    run_pick_folder_inner()
}

fn run_pick_photos_inner() -> Result<usize, String> {
    let picked = open_native_photo_dialog(false)?;
    if picked.is_empty() {
        return Ok(0);
    }
    let total = engine()
        .with_hub_mut(|h| {
            add_manual_photos(&mut h.photo_frame, picked);
            h.photo_frame.photos.len()
        })
        .unwrap_or(0);
    engine().persist_photo_frame()?;
    Ok(total)
}

fn run_pick_folder_inner() -> Result<usize, String> {
    let picked = open_native_photo_dialog(true)?;
    let Some(folder) = picked.into_iter().next() else {
        return Ok(0);
    };
    configure_widget_photo_folder(folder)
}

#[cfg(windows)]
fn open_native_photo_dialog(pick_folder: bool) -> Result<Vec<String>, String> {
    use windows::core::{w, PWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows::Win32::UI::Shell::{
        FileOpenDialog, IFileOpenDialog, FILEOPENDIALOGOPTIONS, FOS_ALLOWMULTISELECT,
        FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, FOS_PATHMUSTEXIST, FOS_PICKFOLDERS,
        SIGDN_FILESYSPATH,
    };

    struct ComStaGuard(bool);
    impl Drop for ComStaGuard {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() };
            }
        }
    }

    unsafe fn take_pwstr(pw: PWSTR) -> Option<String> {
        if pw.0.is_null() {
            return None;
        }
        let s = String::from_utf16_lossy(pw.as_wide());
        CoTaskMemFree(Some(pw.0 as *const std::ffi::c_void));
        Some(s)
    }

    unsafe {
        let co_ok = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let _guard = ComStaGuard(co_ok);
        let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
            .map_err(|e| format!("Gagal membuka dialog Windows: {e}"))?;

        let opts = dialog.GetOptions().unwrap_or(FILEOPENDIALOGOPTIONS(0));
        let mut flags = opts.0 | FOS_FORCEFILESYSTEM.0;
        if pick_folder {
            flags |= FOS_PICKFOLDERS.0 | FOS_PATHMUSTEXIST.0;
            let _ = dialog.SetTitle(w!("Pilih Folder Foto Bingkai Gili"));
        } else {
            flags |= FOS_ALLOWMULTISELECT.0 | FOS_FILEMUSTEXIST.0;
            let _ = dialog.SetTitle(w!("Pilih Foto untuk Bingkai Polaroid"));
            let filters = [COMDLG_FILTERSPEC {
                pszName: w!("Gambar (JPG, PNG, WebP, BMP)"),
                pszSpec: w!("*.jpg;*.jpeg;*.png;*.webp;*.bmp"),
            }];
            let _ = dialog.SetFileTypes(&filters);
        }
        let _ = dialog.SetOptions(FILEOPENDIALOGOPTIONS(flags));

        if dialog.Show(None).is_err() {
            return Ok(Vec::new());
        }

        let mut out = Vec::new();
        if pick_folder {
            if let Ok(item) = dialog.GetResult() {
                if let Ok(pw) = item.GetDisplayName(SIGDN_FILESYSPATH) {
                    if let Some(p) = take_pwstr(pw) {
                        out.push(p);
                    }
                }
            }
        } else if let Ok(arr) = dialog.GetResults() {
            let count = arr.GetCount().unwrap_or(0);
            for i in 0..count {
                if let Ok(item) = arr.GetItemAt(i) {
                    if let Ok(pw) = item.GetDisplayName(SIGDN_FILESYSPATH) {
                        if let Some(p) = take_pwstr(pw) {
                            out.push(p);
                        }
                    }
                }
            }
        }
        Ok(out)
    }
}

#[cfg(not(windows))]
fn open_native_photo_dialog(_pick_folder: bool) -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

fn launch_widget_shortcut(raw: &str) {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return;
    }
    if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        let _ = tauri_plugin_opener::open_url(trimmed, None::<&str>);
        return;
    }
    let _ = tauri_plugin_opener::open_path(trimmed, None::<&str>);
}

fn open_widget_shelf_file(raw_path: &str, name: &str) {
    let trimmed = raw_path.trim();
    if !trimmed.is_empty() {
        let p = std::path::Path::new(trimmed);
        if p.exists() {
            if tauri_plugin_opener::open_path(p, None::<&str>).is_ok() {
                return;
            }
            let _ = tauri_plugin_opener::reveal_item_in_dir(p);
            return;
        }
    }
    let dir = crate::shelf_server::get_shelf_received_dir();
    if !name.trim().is_empty() {
        let candidate = dir.join(name.trim());
        if candidate.exists() {
            let _ = tauri_plugin_opener::open_path(candidate, None::<&str>);
            return;
        }
    }
    if dir.exists() {
        let _ = tauri_plugin_opener::open_path(dir, None::<&str>);
    }
}

fn trigger_immediate_network_refresh(act: &str) {
    let act_owned = act.to_string();
    std::thread::spawn(move || match act_owned.as_str() {
        "refresh_weather" | "refresh_air_quality" => {
            let (city, lat, lon) = engine()
                .with_hub_mut(|h| {
                    let lat = h.frontend.custom_lat.unwrap_or(-6.2088);
                    let lon = h.frontend.custom_lon.unwrap_or(106.8456);
                    let city = h
                        .frontend
                        .custom_city_name
                        .as_deref()
                        .filter(|s| !s.trim().is_empty())
                        .unwrap_or("Jakarta")
                        .to_string();
                    (city, lat, lon)
                })
                .unwrap_or_else(|| ("Jakarta".to_string(), -6.2088, 106.8456));
            if act_owned == "refresh_weather" {
                let w = fetch_open_meteo_forecast(&city, lat, lon);
                if w.available {
                    engine().with_hub_mut(|h| h.weather = w);
                }
            } else {
                let a = fetch_open_meteo_air_quality(&city, lat, lon);
                if a.available {
                    engine().with_hub_mut(|h| h.air_quality = a);
                }
            }
        }
        "refresh_currency" => {
            let c = fetch_currency_and_gold(&UnconfiguredGoldProvider);
            engine().with_hub_mut(|h| h.currency_gold = c);
        }
        "refresh_github" => {
            let repo = github_repo_store()
                .lock()
                .map(|r| r.clone())
                .unwrap_or_default();
            if let Some(token) = read_github_pat_credential() {
                let prev = engine()
                    .with_hub_mut(|h| h.github.clone())
                    .unwrap_or_default();
                let next = fetch_github_repo_status(&repo, &token, &prev);
                engine().with_hub_mut(|h| h.github = next);
            }
        }
        _ => {}
    });
}

#[cfg(windows)]
fn with_windows_master_mute(toggle: bool) -> Option<bool> {
    use windows::Win32::Foundation::BOOL;
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    unsafe {
        let co_ok = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
        let res = (|| -> Option<bool> {
            let enumerator =
                CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .ok()?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eMultimedia)
                .ok()?;
            let volume_ctrl = device
                .Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
                .ok()?;
            let cur = volume_ctrl.GetMute().ok()?.as_bool();
            if !toggle {
                return Some(cur);
            }
            let next = !cur;
            volume_ctrl
                .SetMute(BOOL::from(next), std::ptr::null())
                .ok()?;
            Some(next)
        })();
        if co_ok {
            CoUninitialize();
        }
        res
    }
}

#[cfg(not(windows))]
fn with_windows_master_mute(_toggle: bool) -> Option<bool> {
    None
}

#[tauri::command]
pub fn configure_widget_recent_folders(
    enabled: bool,
    folders: Vec<String>,
    excluded: Vec<String>,
) -> Result<(), String> {
    engine().with_hub_mut(|h| {
        h.recent_files.opt_in_enabled = enabled;
        h.recent_files.watched_folders = folders;
        h.recent_files.excluded_folders = excluded;
        scan_recent_files_metadata_only(&mut h.recent_files, 16);
    });
    engine().persist_recent_files()
}

#[tauri::command]
pub fn add_widget_countdown(title: String, target_date: String) -> Result<(), String> {
    if parse_iso_ymd(&target_date).is_none() {
        return Err("Format tanggal harus YYYY-MM-DD (contoh: 2026-12-31).".to_string());
    }
    engine().with_hub_mut(|h| {
        h.countdowns.insert(
            0,
            CountdownMoment {
                id: format!("cd_{}", now_epoch_secs()),
                title: title.trim().to_string(),
                target_date: target_date.trim().to_string(),
                start_date: None,
            },
        );
    });
    engine().persist_countdowns()
}

#[tauri::command]
pub fn add_widget_snippet(label: String, content: String) -> Result<(), String> {
    if label.trim().is_empty() || content.trim().is_empty() {
        return Err("Label dan isi snippet tidak boleh kosong.".to_string());
    }
    engine().with_hub_mut(|h| {
        h.snippets.insert(
            0,
            QuickSnippetItem {
                id: format!("sn_{}", now_epoch_secs()),
                label: label.trim().to_string(),
                content,
            },
        );
    });
    engine().persist_snippets()
}

#[tauri::command]
pub fn add_widget_world_clock(
    city: String,
    code: String,
    utc_offset_hours: f32,
) -> Result<(), String> {
    let mins = (utc_offset_hours.clamp(-12.0, 14.0) * 60.0).round() as i32;
    engine().with_hub_mut(|h| {
        h.world_clocks.push(WorldClockZone {
            id: format!("wc_{}", now_epoch_secs()),
            city: city.trim().to_string(),
            code: code.trim().to_uppercase(),
            utc_offset_minutes: mins,
        });
        if h.world_clocks.len() > 6 {
            h.world_clocks.remove(0);
        }
    });
    engine().persist_world_clocks()
}
