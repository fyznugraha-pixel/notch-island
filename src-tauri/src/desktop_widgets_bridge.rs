use gili_widgets::config::{gili_data_dir, DesktopWidgetsConfig, WidgetStyleConfig};
use gili_widgets::contrast::WallpaperRegionAnalysis;
use gili_widgets::d2d_host::{WidgetHostEvent, WidgetRuntimeMetrics};
use gili_widgets::providers::audio_fft::WasapiLoopbackStream;
use gili_widgets::providers::ical_provider::{
    fetch_ical_feed, validate_ical_url, IcalFeedSnapshot, ICAL_CRED_TARGET,
};
use gili_widgets::providers::local_stores::{
    add_manual_photos, copy_text_to_clipboard_silently, parse_iso_ymd, scan_photo_folder_readonly,
    scan_recent_files_metadata_only, step_photo_index, CountdownMoment, ExpenseItem, ExpenseLedger,
    KanbanBoard, KanbanCard, QuickSnippetItem, ShortcutEntry, TimeProject, WorldClockZone,
};
use gili_widgets::providers::network_providers::{
    fetch_currency_and_gold, fetch_github_repo_status, fetch_open_meteo_air_quality,
    fetch_open_meteo_forecast, ping_user_site, validate_https_url_with_allowlist, BackoffState,
    PublicGoldProvider, SiteMonitorConfig, GITHUB_CRED_TARGET, MAX_UPTIME_SITES,
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
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

static ENGINE: OnceLock<DesktopWidgetEngine> = OnceLock::new();
static BRIDGE_APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static UPTIME_CONFIGS: OnceLock<Mutex<Vec<SiteMonitorConfig>>> = OnceLock::new();
static GITHUB_REPO: OnceLock<Mutex<String>> = OnceLock::new();
static PENDING_WIDGET_PROVIDER: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static PENDING_GALLERY_MONITOR: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static PENDING_CUSTOMIZER_SLOT: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static PHOTO_PICKER_ACTIVE: AtomicBool = AtomicBool::new(false);
static AUDIO_LOOP_STOP: AtomicBool = AtomicBool::new(false);
static WEATHER_FORCE_REFRESH: AtomicBool = AtomicBool::new(false);
static UPTIME_FORCE_REFRESH: AtomicBool = AtomicBool::new(false);
static GITHUB_FORCE_REFRESH: AtomicBool = AtomicBool::new(false);
// Taskbar visualizer keeps a short lease alive instead of a mount/unmount flag, so a
// navbar webview that reloads or crashes can never leave WASAPI capture running.
static TASKBAR_SPECTRUM_LEASE_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
const TASKBAR_SPECTRUM_LEASE_MS: u64 = 2_500;

pub fn engine() -> &'static DesktopWidgetEngine {
    ENGINE.get_or_init(DesktopWidgetEngine::new)
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn taskbar_spectrum_wanted() -> bool {
    TASKBAR_SPECTRUM_LEASE_UNTIL_MS.load(Ordering::Relaxed) > now_epoch_ms()
        && crate::store_license::can_use_taskbar()
        && !crate::standby_window::is_deep_eco_active()
}

fn emit_taskbar_spectrum(bands: &[f32; 16]) {
    let Some(app) = BRIDGE_APP_HANDLE.get() else {
        return;
    };
    for label in app.webview_windows().into_keys() {
        if crate::navbar_window::is_navbar_window_label(&label) {
            let _ = app.emit_to(label.as_str(), "taskbar-audio-spectrum", bands);
        }
    }
}

#[tauri::command]
pub fn renew_taskbar_spectrum_lease() {
    TASKBAR_SPECTRUM_LEASE_UNTIL_MS.store(
        now_epoch_ms() + TASKBAR_SPECTRUM_LEASE_MS,
        Ordering::Relaxed,
    );
}

fn emit_widgets_data_updated(kind: &str) {
    if let Some(app) = BRIDGE_APP_HANDLE.get() {
        let _ = app.emit("desktop-widgets-data-updated", kind);
    }
}

fn uptime_store_path() -> PathBuf {
    gili_data_dir().join("desktop_uptime_sites.json")
}

fn github_repo_store_path() -> PathBuf {
    gili_data_dir().join("desktop_github_repo.json")
}

fn uptime_configs() -> &'static Mutex<Vec<SiteMonitorConfig>> {
    UPTIME_CONFIGS.get_or_init(|| {
        let saved = std::fs::read_to_string(uptime_store_path())
            .ok()
            .and_then(|s| serde_json::from_str::<Vec<SiteMonitorConfig>>(&s).ok())
            .unwrap_or_default();
        Mutex::new(saved)
    })
}

fn github_repo_store() -> &'static Mutex<String> {
    GITHUB_REPO.get_or_init(|| {
        let saved = std::fs::read_to_string(github_repo_store_path())
            .ok()
            .and_then(|s| serde_json::from_str::<String>(&s).ok())
            .unwrap_or_default();
        Mutex::new(saved)
    })
}

fn persist_uptime_configs(list: &[SiteMonitorConfig]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    gili_widgets::config::atomic_write_file(&uptime_store_path(), json.as_bytes())
}

fn persist_github_repo(repo: &str) -> Result<(), String> {
    let json = serde_json::to_string_pretty(repo).map_err(|e| e.to_string())?;
    gili_widgets::config::atomic_write_file(&github_repo_store_path(), json.as_bytes())
}

fn pending_widget_provider() -> &'static Mutex<Option<String>> {
    PENDING_WIDGET_PROVIDER.get_or_init(|| Mutex::new(None))
}

fn pending_gallery_monitor() -> &'static Mutex<Option<String>> {
    PENDING_GALLERY_MONITOR.get_or_init(|| Mutex::new(None))
}

#[tauri::command]
pub fn take_pending_widget_gallery_monitor() -> Option<String> {
    pending_gallery_monitor()
        .lock()
        .ok()
        .and_then(|mut g| g.take())
}

fn pending_customizer_slot() -> &'static Mutex<Option<String>> {
    PENDING_CUSTOMIZER_SLOT.get_or_init(|| Mutex::new(None))
}

#[tauri::command]
pub fn take_pending_widget_customizer_slot() -> Option<String> {
    pending_customizer_slot()
        .lock()
        .ok()
        .and_then(|mut g| g.take())
}

fn local_tz_offset_minutes() -> i32 {
    (gili_widgets::widgets::local_utc_offset_hours() * 60.0).round() as i32
}

fn settings_provider_for_widget(widget_type: &str) -> Option<&'static str> {
    match widget_type {
        "calendar_agenda" => Some("ical_calendar"),
        "mini_kanban" => Some("mini_kanban"),
        "countdown_moment" => Some("countdown"),
        "quick_snippets" => Some("snippets"),
        "time_tracker" => Some("time_tracker"),
        "shortcuts_grid" => Some("shortcuts"),
        "world_clock" => Some("world_clock"),
        "quick_expense" => Some("expense"),
        "photo_frame" | "recent_files" | "storage_treemap" => Some("folders"),
        "site_status" => Some("uptime"),
        "github_status" => Some("github"),
        _ => None,
    }
}

fn is_notch_integrated_widget(widget_type: &str, action_id: Option<&str>) -> bool {
    matches!(
        action_id,
        Some(
            "open_ai_settings"
                | "open_ai_chat"
                | "open_media"
                | "open_todo"
                | "open_shelf"
                | "open_quick_note"
        )
    ) || matches!(
        widget_type,
        "now_playing"
            | "audio_visualizer"
            | "todo_groups"
            | "drop_zone"
            | "prayer_times"
            | "system_performance"
            | "top_processes"
            | "quick_controls"
            | "ai_quick_ask"
            | "sticky_notes"
    )
}

fn open_settings_at_widget_provider(app: &AppHandle, provider_id: Option<&str>) {
    if let Ok(mut guard) = pending_widget_provider().lock() {
        *guard = provider_id.map(|s| s.to_string());
    }
    crate::show_or_create_settings_window(app, Some("widgets".to_string()));
    if let (Some(pid), Some(win)) = (provider_id, app.get_webview_window("settings")) {
        let _ = win.emit("desktop-widgets-focus-provider", pid);
    }
}

#[tauri::command]
pub fn take_pending_widget_provider() -> Option<String> {
    pending_widget_provider()
        .lock()
        .ok()
        .and_then(|mut g| g.take())
}

fn now_epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(windows)]
fn write_generic_credential(target: &str, username: &str, secret: &str) -> Result<(), String> {
    use windows::core::PWSTR;
    use windows::Win32::Security::Credentials::{
        CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    let mut target_w: Vec<u16> = target.encode_utf16().chain(Some(0)).collect();
    let mut user_w: Vec<u16> = username.encode_utf16().chain(Some(0)).collect();
    let blob = secret.as_bytes();
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
fn read_generic_credential(target: &str) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::Security::Credentials::{
        CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
    };
    let target_w: Vec<u16> = target.encode_utf16().chain(Some(0)).collect();
    let mut ptr: *mut CREDENTIALW = std::ptr::null_mut();
    let ok =
        unsafe { CredReadW(PCWSTR(target_w.as_ptr()), CRED_TYPE_GENERIC, 0, &mut ptr).is_ok() };
    if !ok || ptr.is_null() {
        return None;
    }
    let secret = unsafe {
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
    secret
}

#[cfg(windows)]
fn delete_generic_credential(target: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};
    let target_w: Vec<u16> = target.encode_utf16().chain(Some(0)).collect();
    let _ = unsafe { CredDeleteW(PCWSTR(target_w.as_ptr()), CRED_TYPE_GENERIC, 0) };
    Ok(())
}

#[cfg(not(windows))]
fn write_generic_credential(_target: &str, _username: &str, _secret: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
fn read_generic_credential(_target: &str) -> Option<String> {
    None
}

#[cfg(not(windows))]
fn delete_generic_credential(_target: &str) -> Result<(), String> {
    Ok(())
}

fn write_github_pat_credential(token: &str) -> Result<(), String> {
    write_generic_credential(GITHUB_CRED_TARGET, "gili_widget_github", token)
}

fn read_github_pat_credential() -> Option<String> {
    read_generic_credential(GITHUB_CRED_TARGET)
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
    let _ = BRIDGE_APP_HANDLE.set(app.clone());
    let eng = engine();
    let app_ev = app.clone();

    // Hydrate persisted GitHub repo config on startup if PAT is present
    let saved_repo = github_repo_store()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    if !saved_repo.is_empty() && read_github_pat_credential().is_some() {
        eng.with_hub_mut(|h| {
            h.github.configured = true;
            h.github.repo = saved_repo;
        });
    }

    eng.set_event_handler(move |ev| match ev {
        WidgetHostEvent::ConfigMutated { config } => {
            // Persist directly to disk without re-locking engine().shared (host thread already updated it).
            let _ = gili_widgets::config::save_config_atomic(
                &gili_widgets::config::config_path(),
                &config,
            );
            let _ = app_ev.emit("desktop-widgets-config-changed", ());
        }
        WidgetHostEvent::OpenGallery { monitor_id } => {
            let resolved = monitor_id.unwrap_or_else(|| "primary".to_string());
            if let Ok(mut g) = pending_gallery_monitor().lock() {
                *g = Some(resolved.clone());
            }
            crate::show_or_create_settings_window(&app_ev, Some("widgets".to_string()));
            let _ = app_ev.emit("desktop-widgets-open-gallery", resolved);
        }
        WidgetHostEvent::OpenCustomizer { slot_id } => {
            if let Ok(mut g) = pending_customizer_slot().lock() {
                *g = Some(slot_id.clone());
            }
            crate::show_or_create_settings_window(&app_ev, Some("widgets".to_string()));
            let _ = app_ev.emit("desktop-widgets-open-customizer", slot_id);
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
                        emit_widgets_data_updated("kanban");
                        return;
                    }
                } else if let Some(card_id) = act.strip_prefix("kanban_delete:") {
                    engine().with_hub_mut(|hub| {
                        hub.kanban.remove_card(card_id);
                    });
                    let _ = engine().persist_kanban();
                    emit_widgets_data_updated("kanban");
                    return;
                } else if let Some(pid) = act.strip_prefix("time_toggle:") {
                    let now = now_epoch_secs();
                    engine().with_hub_mut(|hub| {
                        hub.time_tracker.toggle_project(pid, now);
                    });
                    let _ = engine().persist_time_tracker();
                    return;
                } else if let Some(sid) = act.strip_prefix("copy_snippet:") {
                    let content_opt = engine()
                        .with_hub_read(|hub| {
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
                } else if act == "storage_pick_folder" {
                    spawn_storage_folder_picker_thread();
                    return;
                } else if act == "open_widget_settings" || act == "open_settings" {
                    open_settings_at_widget_provider(
                        &app_ev,
                        settings_provider_for_widget(&widget_type),
                    );
                    return;
                } else if act == "open_class_schedule" || act == "open_streak" {
                    crate::show_or_create_settings_window(&app_ev, Some("navbar".to_string()));
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
                    open_settings_at_widget_provider(&app_ev, Some("folders"));
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
                        .with_hub_read(|h| {
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
                        .with_hub_read(|h| {
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
                    || act == "refresh_ical"
                {
                    trigger_immediate_network_refresh(act);
                    return;
                }
            }
            if let Some(provider_id) = settings_provider_for_widget(&widget_type) {
                open_settings_at_widget_provider(&app_ev, Some(provider_id));
                return;
            }
            if is_notch_integrated_widget(&widget_type, action_id.as_deref()) {
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
        }
        WidgetHostEvent::TextInputSubmitted {
            slot_id,
            widget_type,
            title,
            text,
        } => match widget_type.as_str() {
            "paper_sticky_note" => {
                let mut cfg = engine().get_config();
                if let Some(slot) = cfg.slots.iter_mut().find(|s| s.slot_id == slot_id) {
                    let idx = slot.active_index % slot.widgets.len().max(1);
                    if let Some(w) = slot.widgets.get_mut(idx) {
                        if !w.settings.is_object() {
                            w.settings = serde_json::json!({});
                        }
                        if let Some(t) = title {
                            w.settings["title"] = serde_json::json!(t.trim());
                        }
                        w.settings["text"] = serde_json::json!(text.trim_end());
                    }
                }
                if let Ok(saved) = engine().save_config(cfg) {
                    let _ = app_ev.emit("desktop-widgets-config-changed", &saved);
                }
                emit_widgets_data_updated("sticky_note");
            }
            "sticky_notes" => {
                let note_text = text.trim();
                if !note_text.is_empty() {
                    let _ = app_ev.emit(
                        "desktop-widget-mini-note-add",
                        serde_json::json!({ "text": note_text }),
                    );
                }
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
                // Run SendMessageTimeoutW(HWND_BROADCAST) off the Direct2D wnd_proc thread to prevent input stalls
                std::thread::spawn(|| {
                    let cur = read_windows_dark_mode();
                    let _ = set_windows_dark_mode(!cur);
                    engine().with_hub_mut(|hub| {
                        hub.quick_controls.dark_mode_enabled = !cur;
                    });
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
    if eng.get_config().enabled && crate::store_license::can_use_pro_bundle() {
        eng.start_host_if_needed();
    }

    // Dedicated real-time WASAPI loopback FFT capture thread (~30 Hz active, 250ms silent backoff).
    // Shared by the desktop Audio Visualizer widget and the taskbar Visualizer module.
    std::thread::Builder::new()
        .name("gili-widgets-audio".into())
        .spawn(move || {
            let mut stream: Option<WasapiLoopbackStream> = None;
            let mut last_pushed = [0.0f32; 16];
            let mut last_open_attempt = Instant::now() - Duration::from_secs(5);
            let mut consecutive_silent: u32 = 0;
            let mut widget_has_bands = false;
            let mut taskbar_synced = false;

            while !AUDIO_LOOP_STOP.load(Ordering::Relaxed) {
                let widget_active = crate::store_license::can_use_pro_bundle()
                    && engine().should_poll_audio_visualizer();
                let taskbar_active = taskbar_spectrum_wanted();

                if !widget_active && widget_has_bands {
                    engine().update_audio_bands([0.0; 16]);
                    widget_has_bands = false;
                }
                if !taskbar_active {
                    taskbar_synced = false;
                }

                if !widget_active && !taskbar_active {
                    stream = None;
                    consecutive_silent = 0;
                    last_pushed = [0.0; 16];
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
                        if is_all_zero {
                            consecutive_silent = consecutive_silent.saturating_add(1);
                        } else {
                            consecutive_silent = 0;
                        }
                        let changed = next
                            .iter()
                            .zip(last_pushed.iter())
                            .any(|(a, b)| (a - b).abs() > 0.004);
                        let should_push = changed || (was_non_zero && is_all_zero);
                        if should_push {
                            last_pushed = next;
                            if widget_active {
                                engine().update_audio_bands(next);
                                widget_has_bands = true;
                            }
                        }
                        if taskbar_active && (should_push || !taskbar_synced) {
                            emit_taskbar_spectrum(&next);
                            taskbar_synced = true;
                        }
                    }
                    Err(()) => {
                        stream = None;
                        consecutive_silent = 0;
                        last_open_attempt = Instant::now();
                    }
                }

                let sleep_ms = if consecutive_silent >= 45 { 250 } else { 33 };
                std::thread::sleep(Duration::from_millis(sleep_ms));
            }
        })
        .ok();

    // Local/fast feeder thread (media, system metrics, slideshow, recent files, prayer, screen time)
    // Network HTTP calls live on a separate thread so slow/offline requests never stall media or slideshow.
    std::thread::Builder::new()
        .name("gili-widgets-feeder".into())
        .spawn(move || {
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
                if crate::standby_window::is_deep_eco_active() {
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
                let cfg = engine().get_config();
                let met = engine().metrics();
                if !crate::store_license::can_use_pro_bundle() || (!cfg.enabled && !met.board_visible) {
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

                // System performance & top processes (3.5s cadence when mounted; GPU every 15s ONLY when system_performance is mounted)
                if (has_widget("system_performance")
                    || has_widget("top_processes")
                    || has_widget("quick_controls")
                    || has_widget("screen_time"))
                    && last_sys.elapsed() >= Duration::from_millis(3500)
                {
                    last_sys = Instant::now();
                    let net_m = crate::shared_sampler::SharedSampler::global().get_fresh_or_cached();
                    if has_widget("system_performance")
                        && last_gpu.elapsed() >= Duration::from_secs(15)
                    {
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
                        // Passive Wi-Fi radio read avoids active WlanScan ping spikes
                        qc_wifi = crate::connectivity::is_wifi_radio_enabled_passive();
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
                        .with_hub_read(|h| {
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

                // Refresh recent files metadata OUTSIDE hub mutex so disk I/O never stalls Direct2D
                if has_widget("recent_files")
                    && last_recent_scan.elapsed() >= Duration::from_secs(30)
                {
                    last_recent_scan = Instant::now();
                    let snapshot_opt = engine().with_hub_read(|h| {
                        if h.recent_files.opt_in_enabled && !h.recent_files.watched_folders.is_empty()
                        {
                            Some(h.recent_files.clone())
                        } else {
                            None
                        }
                    }).flatten();
                    if let Some(mut local_recent) = snapshot_opt {
                        scan_recent_files_metadata_only(&mut local_recent, 16);
                        engine().with_hub_mut(|h| {
                            if h.recent_files.watched_folders == local_recent.watched_folders
                                && h.recent_files.excluded_folders == local_recent.excluded_folders
                            {
                                h.recent_files.files = local_recent.files;
                            }
                        });
                    }
                }

                // Refresh prayer countdown & Hijri date every 30s
                if (has_widget("prayer_times") || has_widget("hijri_holidays"))
                    && last_prayer_refresh.elapsed() >= Duration::from_secs(30)
                {
                    last_prayer_refresh = Instant::now();
                    let (city, lat, lon) = engine()
                        .with_hub_read(|h| {
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

                std::thread::sleep(Duration::from_millis(900));
            }
        })
        .ok();

    // Dedicated network polling thread so offline/slow HTTP requests never block local media/metrics/slideshow
    std::thread::Builder::new()
        .name("gili-widgets-net".into())
        .spawn(move || {
            let mut weather_backoff = BackoffState::new(900, 3600);
            let mut aqi_backoff = BackoffState::new(900, 3600);
            let mut currency_backoff = BackoffState::new(3600, 14400);
            let mut uptime_backoff = BackoffState::new(MIN_UPTIME_INTERVAL_SECS, 600);
            let mut github_backoff = BackoffState::new(180, 1800);
            let mut ical_backoff = BackoffState::new(600, 3600);

            loop {
                if crate::standby_window::is_deep_eco_active() {
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
                let cfg = engine().get_config();
                let met = engine().metrics();
                if !crate::store_license::can_use_pro_bundle() || (!cfg.enabled && !met.board_visible) {
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

                if WEATHER_FORCE_REFRESH.swap(false, Ordering::SeqCst) {
                    weather_backoff = BackoffState::new(900, 3600);
                    aqi_backoff = BackoffState::new(900, 3600);
                }
                if UPTIME_FORCE_REFRESH.swap(false, Ordering::SeqCst) {
                    uptime_backoff = BackoffState::new(MIN_UPTIME_INTERVAL_SECS, 600);
                }
                if GITHUB_FORCE_REFRESH.swap(false, Ordering::SeqCst) {
                    github_backoff = BackoffState::new(180, 1800);
                }

                let now = Instant::now();
                let need_weather = has_widget("weather_forecast") && weather_backoff.can_run(now);
                let need_aqi = has_widget("air_quality") && aqi_backoff.can_run(now);
                let (loc_name, loc_lat, loc_lon) = if need_weather || need_aqi {
                    engine()
                        .with_hub_read(|h| {
                            (
                                h.frontend
                                    .custom_city_name
                                    .clone()
                                    .unwrap_or_else(|| "Jakarta".into()),
                                h.frontend.custom_lat.unwrap_or(-6.2088),
                                h.frontend.custom_lon.unwrap_or(106.8456),
                            )
                        })
                        .unwrap_or_else(|| ("Jakarta".into(), -6.2088, 106.8456))
                } else {
                    (String::new(), 0.0, 0.0)
                };

                if need_weather {
                    let snap = fetch_open_meteo_forecast(&loc_name, loc_lat, loc_lon);
                    if snap.available {
                        weather_backoff.record_success(now);
                        engine().with_hub_mut(|h| h.weather = snap);
                    } else {
                        weather_backoff.record_failure(now);
                        engine().with_hub_mut(|h| {
                            if !h.weather.available {
                                h.weather = snap;
                            }
                        });
                    }
                }

                if need_aqi {
                    let snap = fetch_open_meteo_air_quality(&loc_name, loc_lat, loc_lon);
                    if snap.available {
                        aqi_backoff.record_success(now);
                        engine().with_hub_mut(|h| h.air_quality = snap);
                    } else {
                        aqi_backoff.record_failure(now);
                        engine().with_hub_mut(|h| {
                            if !h.air_quality.available {
                                h.air_quality = snap;
                            }
                        });
                    }
                }

                if has_widget("currency_gold") && currency_backoff.can_run(now) {
                    let gold = PublicGoldProvider;
                    let snap = fetch_currency_and_gold(&gold);
                    let has_fx = snap.usd_to_idr.is_some();
                    let has_any = has_fx
                        || snap.gold_usd_per_oz.is_some()
                        || snap.gold_idr_per_gram.is_some();
                    if has_fx {
                        currency_backoff.record_success(now);
                    } else {
                        currency_backoff.record_failure(now);
                    }
                    engine().with_hub_mut(|h| {
                        if has_any || h.currency_gold.usd_to_idr.is_none() {
                            h.currency_gold = snap;
                        }
                    });
                }

                if has_widget("calendar_agenda") && ical_backoff.can_run(now) {
                    if let Some(url) = read_generic_credential(ICAL_CRED_TARGET) {
                        let (year, month, day, _, _, _, _) =
                            gili_widgets::widgets::local_datetime_parts();
                        let tz_mins = local_tz_offset_minutes();
                        match fetch_ical_feed(&url, (year, month, day), tz_mins) {
                            Ok(snap) => {
                                ical_backoff.record_success(now);
                                engine().with_hub_mut(|h| h.ical_calendar = snap);
                            }
                            Err(err) => {
                                ical_backoff.record_failure(now);
                                engine().with_hub_mut(|h| {
                                    h.ical_calendar.configured = true;
                                    h.ical_calendar.error = Some(err);
                                });
                            }
                        }
                    }
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
                                .with_hub_read(|h| h.github.clone())
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

                std::thread::sleep(Duration::from_millis(1200));
            }
        })
        .ok();
}

pub fn shutdown_desktop_widgets_on_exit() {
    AUDIO_LOOP_STOP.store(true, Ordering::Relaxed);
    engine().shutdown();
}

pub fn reconcile_pro_entitlement() {
    if crate::store_license::can_use_pro_bundle() {
        if engine().get_config().enabled {
            engine().start_host_if_needed();
        }
    } else {
        engine().shutdown();
    }
}

fn spawn_storage_scan_job(root_path: Option<String>) -> Result<String, String> {
    let root = match root_path {
        Some(raw) => {
            let trimmed = raw.trim().to_string();
            if trimmed.is_empty() {
                default_treemap_user_root()
            } else {
                let candidate = PathBuf::from(&trimmed);
                if !candidate.exists() || !candidate.is_dir() {
                    return Err(format!("Folder tidak ditemukan: {trimmed}"));
                }
                candidate
            }
        }
        None => engine()
            .with_hub_read(|h| {
                h.storage_treemap
                    .as_ref()
                    .map(|s| PathBuf::from(&s.root_path))
                    .filter(|p| !p.as_os_str().is_empty() && p.is_dir())
            })
            .flatten()
            .unwrap_or_else(default_treemap_user_root),
    };

    let root_str = root.to_string_lossy().to_string();
    engine().with_hub_mut(|hub| {
        match hub.storage_treemap.as_mut() {
            Some(existing) if existing.root_path.eq_ignore_ascii_case(&root_str) => {
                existing.scanning = true;
            }
            _ => {
                hub.storage_treemap = Some(
                    gili_widgets::providers::system_data::StorageTreemapSnapshot {
                        root_path: root_str.clone(),
                        total_scanned_bytes: 0,
                        items: Vec::new(),
                        scanning: true,
                        updated_epoch_secs: 0,
                    },
                );
            }
        }
    });

    std::thread::Builder::new()
        .name("gili-widgets-treemap".into())
        .spawn(move || {
            let snap = scan_storage_treemap_bounded(&root, 3, 25_000);
            engine().with_hub_mut(|hub| {
                hub.storage_treemap = Some(snap);
            });
            let _ = engine().persist_storage_treemap();
            emit_widgets_data_updated("storage");
        })
        .map_err(|e| format!("Failed to start storage scan: {e}"))?;
    Ok(root_str)
}

#[tauri::command]
pub fn get_desktop_widgets_config() -> DesktopWidgetsConfig {
    engine().get_config()
}

#[tauri::command]
pub fn save_desktop_widgets_config(
    mut config: DesktopWidgetsConfig,
) -> Result<DesktopWidgetsConfig, String> {
    if !crate::store_license::can_use_pro_bundle() {
        config.enabled = false;
    }
    engine().save_config(config)
}

#[tauri::command]
pub fn get_desktop_widgets_catalog() -> Vec<WidgetCatalogEntry> {
    widget_catalog()
}

#[tauri::command]
pub fn toggle_desktop_widget_board(visible: Option<bool>) -> bool {
    if !crate::store_license::can_use_pro_bundle() {
        return false;
    }
    engine().toggle_board(visible)
}

#[tauri::command]
pub fn set_desktop_widget_edit_mode(enabled: bool) {
    if !crate::store_license::can_use_pro_bundle() {
        return;
    }
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
    if engine().update_frontend_mirror(mirror) {
        WEATHER_FORCE_REFRESH.store(true, Ordering::SeqCst);
    }
}

#[derive(serde::Serialize)]
pub struct WidgetIcalStatusDto {
    pub configured: bool,
    pub synced_count: usize,
    pub updated_label: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn save_widget_ical_url(url: String) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_url = validate_ical_url(&url)?;
        let (year, month, day, _, _, _, _) = gili_widgets::widgets::local_datetime_parts();
        let tz_mins = local_tz_offset_minutes();
        let snap = fetch_ical_feed(&clean_url, (year, month, day), tz_mins)?;
        let count = snap.synced_count;
        write_generic_credential(ICAL_CRED_TARGET, "gili_widget_ical", &clean_url)?;
        engine().with_hub_mut(|h| {
            h.ical_calendar = snap;
        });
        Ok(count)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn clear_widget_ical_url() -> Result<(), String> {
    delete_generic_credential(ICAL_CRED_TARGET)?;
    engine().with_hub_mut(|h| {
        h.ical_calendar = IcalFeedSnapshot::default();
    });
    Ok(())
}

#[tauri::command]
pub fn get_widget_ical_status() -> WidgetIcalStatusDto {
    let has_cred = read_generic_credential(ICAL_CRED_TARGET).is_some();
    let snap = engine()
        .with_hub_read(|h| h.ical_calendar.clone())
        .unwrap_or_default();
    WidgetIcalStatusDto {
        configured: snap.configured || has_cred,
        synced_count: snap.synced_count,
        updated_label: snap.updated_label,
        error: snap.error,
    }
}

#[tauri::command]
pub fn save_github_widget_token(token: String, repo: String) -> Result<(), String> {
    let clean_repo = repo.trim().trim_matches('/').to_string();
    if !clean_repo.contains('/') {
        return Err("Format repositori harus owner/repo.".to_string());
    }
    write_github_pat_credential(token.trim())?;
    persist_github_repo(&clean_repo)?;
    if let Ok(mut g) = github_repo_store().lock() {
        *g = clean_repo.clone();
    }
    engine().with_hub_mut(|h| {
        h.github.configured = true;
        h.github.repo = clean_repo;
        h.github.etag = None;
        h.github.open_prs = 0;
        h.github.open_issues = 0;
        h.github.latest_action_name.clear();
        h.github.latest_action_conclusion.clear();
        h.github.error = None;
    });
    GITHUB_FORCE_REFRESH.store(true, Ordering::SeqCst);
    trigger_immediate_network_refresh("refresh_github");
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct WidgetStorageFolderStatus {
    pub root_path: String,
    pub is_custom: bool,
    pub total_scanned_bytes: u64,
    pub item_count: usize,
    pub scanning: bool,
}

#[tauri::command]
pub fn get_widget_storage_status() -> WidgetStorageFolderStatus {
    let default_root = default_treemap_user_root().to_string_lossy().to_string();
    engine()
        .with_hub_read(|h| match &h.storage_treemap {
            Some(tm) if !tm.root_path.trim().is_empty() => WidgetStorageFolderStatus {
                root_path: tm.root_path.clone(),
                is_custom: !tm.root_path.eq_ignore_ascii_case(&default_root),
                total_scanned_bytes: tm.total_scanned_bytes,
                item_count: tm.items.len(),
                scanning: tm.scanning,
            },
            _ => WidgetStorageFolderStatus {
                root_path: default_root.clone(),
                is_custom: false,
                total_scanned_bytes: 0,
                item_count: 0,
                scanning: false,
            },
        })
        .unwrap_or(WidgetStorageFolderStatus {
            root_path: default_root,
            is_custom: false,
            total_scanned_bytes: 0,
            item_count: 0,
            scanning: false,
        })
}

#[tauri::command]
pub fn trigger_widget_storage_scan(root_path: Option<String>) -> Result<String, String> {
    spawn_storage_scan_job(root_path)
}

#[tauri::command]
pub async fn pick_widget_storage_folder_dialog() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(run_pick_storage_folder_sync)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn export_widget_time_tracker_csv() -> Result<String, String> {
    let csv = engine()
        .with_hub_read(|h| h.time_tracker.export_csv(now_epoch_secs()))
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
pub fn get_widget_expenses() -> ExpenseLedger {
    engine()
        .with_hub_read(|h| h.expenses.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn add_widget_expense(
    label: String,
    amount_idr: i64,
    category: Option<String>,
) -> Result<ExpenseLedger, String> {
    let clean = label.trim().to_string();
    if clean.is_empty() {
        return Err("Nama pengeluaran tidak boleh kosong.".to_string());
    }
    if amount_idr <= 0 {
        return Err("Nominal pengeluaran harus lebih dari 0.".to_string());
    }
    let cat = category
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Harian".to_string());
    let ledger = engine()
        .with_hub_mut(|h| {
            let now = now_epoch_secs();
            h.expenses.entries.insert(
                0,
                ExpenseItem {
                    id: format!("e_{}_{}", now, h.expenses.entries.len()),
                    label: clean,
                    amount_idr,
                    category: cat,
                    timestamp_secs: now,
                },
            );
            h.expenses.clone()
        })
        .ok_or_else(|| "Gagal menyimpan pengeluaran".to_string())?;
    engine().persist_expenses()?;
    Ok(ledger)
}

#[tauri::command]
pub fn delete_widget_expense(entry_id: String) -> Result<ExpenseLedger, String> {
    let ledger = engine()
        .with_hub_mut(|h| {
            h.expenses.entries.retain(|e| e.id != entry_id);
            h.expenses.clone()
        })
        .ok_or_else(|| "Gagal menghapus pengeluaran".to_string())?;
    engine().persist_expenses()?;
    Ok(ledger)
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
    let snapshot = list.clone();
    drop(list);
    persist_uptime_configs(&snapshot)?;
    UPTIME_FORCE_REFRESH.store(true, Ordering::SeqCst);
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

#[derive(Debug, Clone, serde::Serialize)]
pub struct WidgetPhotoFolderStatus {
    pub folder_path: Option<String>,
    pub photo_count: usize,
}

#[tauri::command]
pub fn get_widget_photo_folder_status() -> WidgetPhotoFolderStatus {
    engine()
        .with_hub_read(|h| WidgetPhotoFolderStatus {
            folder_path: h.photo_frame.folder_path.clone(),
            photo_count: h.photo_frame.photos.len(),
        })
        .unwrap_or(WidgetPhotoFolderStatus {
            folder_path: None,
            photo_count: 0,
        })
}

#[tauri::command]
pub fn configure_widget_photo_folder(folder_path: String) -> Result<usize, String> {
    let trimmed = folder_path.trim().to_string();
    // Scan folder on a local copy outside engine().shared lock so Direct2D never stalls on slow disks
    let mut next_state = engine()
        .with_hub_read(|h| h.photo_frame.clone())
        .unwrap_or_default();
    next_state.manual_photos.clear();
    next_state.folder_path = if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    };
    next_state.current_index = 0;
    scan_photo_folder_readonly(&mut next_state);
    let count = next_state.photos.len();
    engine().with_hub_mut(|h| {
        h.photo_frame = next_state;
    });
    engine().persist_photo_frame()?;
    emit_widgets_data_updated("photo_folder");
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

fn spawn_storage_folder_picker_thread() {
    if PHOTO_PICKER_ACTIVE.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = std::thread::Builder::new()
        .name("gili-storage-picker".into())
        .spawn(move || {
            let _reset = PickerActiveGuard;
            let _ = run_pick_storage_folder_inner();
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

fn run_pick_storage_folder_sync() -> Result<Option<String>, String> {
    if PHOTO_PICKER_ACTIVE.swap(true, Ordering::SeqCst) {
        return Ok(None);
    }
    let _reset = PickerActiveGuard;
    run_pick_storage_folder_inner()
}

fn run_pick_photos_inner() -> Result<usize, String> {
    let title = if engine().is_english() {
        "Pick Photos for Polaroid Frame"
    } else {
        "Pilih Foto untuk Bingkai Polaroid"
    };
    let picked = open_native_file_dialog(false, title)?;
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
    emit_widgets_data_updated("photo_folder");
    Ok(total)
}

fn run_pick_folder_inner() -> Result<usize, String> {
    let title = if engine().is_english() {
        "Pick Photo Folder for Gili Polaroid"
    } else {
        "Pilih Folder Foto Bingkai Gili"
    };
    let picked = open_native_file_dialog(true, title)?;
    let Some(folder) = picked.into_iter().next() else {
        return Ok(0);
    };
    configure_widget_photo_folder(folder)
}

fn run_pick_storage_folder_inner() -> Result<Option<String>, String> {
    let title = if engine().is_english() {
        "Pick Folder for Gili Storage Map"
    } else {
        "Pilih Folder Peta Penyimpanan Gili"
    };
    let picked = open_native_file_dialog(true, title)?;
    let Some(folder) = picked.into_iter().next() else {
        return Ok(None);
    };
    let scanned_root = spawn_storage_scan_job(Some(folder))?;
    emit_widgets_data_updated("storage");
    Ok(Some(scanned_root))
}

#[cfg(windows)]
fn open_native_file_dialog(pick_folder: bool, title: &str) -> Result<Vec<String>, String> {
    use windows::core::{w, HSTRING, PWSTR};
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
        let title_h = HSTRING::from(title);
        if pick_folder {
            flags |= FOS_PICKFOLDERS.0 | FOS_PATHMUSTEXIST.0;
            let _ = dialog.SetTitle(&title_h);
        } else {
            flags |= FOS_ALLOWMULTISELECT.0 | FOS_FILEMUSTEXIST.0;
            let _ = dialog.SetTitle(&title_h);
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
fn open_native_file_dialog(_pick_folder: bool, _title: &str) -> Result<Vec<String>, String> {
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
                .with_hub_read(|h| {
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
                engine().with_hub_mut(|h| {
                    if w.available || !h.weather.available {
                        h.weather = w;
                    }
                });
            } else {
                let a = fetch_open_meteo_air_quality(&city, lat, lon);
                engine().with_hub_mut(|h| {
                    if a.available || !h.air_quality.available {
                        h.air_quality = a;
                    }
                });
            }
        }
        "refresh_currency" => {
            let c = fetch_currency_and_gold(&PublicGoldProvider);
            let has_any = c.usd_to_idr.is_some()
                || c.gold_usd_per_oz.is_some()
                || c.gold_idr_per_gram.is_some();
            engine().with_hub_mut(|h| {
                if has_any || h.currency_gold.usd_to_idr.is_none() {
                    h.currency_gold = c;
                }
            });
        }
        "refresh_ical" => {
            if let Some(url) = read_generic_credential(ICAL_CRED_TARGET) {
                let (year, month, day, _, _, _, _) = gili_widgets::widgets::local_datetime_parts();
                let tz_mins = local_tz_offset_minutes();
                match fetch_ical_feed(&url, (year, month, day), tz_mins) {
                    Ok(snap) => {
                        engine().with_hub_mut(|h| h.ical_calendar = snap);
                    }
                    Err(err) => {
                        engine().with_hub_mut(|h| {
                            h.ical_calendar.configured = true;
                            h.ical_calendar.error = Some(err);
                        });
                    }
                }
            }
        }
        "refresh_github" => {
            let repo = github_repo_store()
                .lock()
                .map(|r| r.clone())
                .unwrap_or_default();
            if let Some(token) = read_github_pat_credential() {
                let prev = engine()
                    .with_hub_read(|h| h.github.clone())
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
    // Scan outside hub mutex so slow folders don't block Direct2D rendering
    let mut next_recent = engine()
        .with_hub_read(|h| h.recent_files.clone())
        .unwrap_or_default();
    next_recent.opt_in_enabled = enabled;
    next_recent.watched_folders = folders;
    next_recent.excluded_folders = excluded;
    scan_recent_files_metadata_only(&mut next_recent, 16);
    engine().with_hub_mut(|h| {
        h.recent_files = next_recent;
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
pub fn get_widget_kanban_board() -> KanbanBoard {
    engine()
        .with_hub_read(|h| h.kanban.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn add_widget_kanban_card(
    title: String,
    column: Option<String>,
) -> Result<KanbanBoard, String> {
    let clean = title.trim().to_string();
    if clean.is_empty() {
        return Err("Judul kartu Kanban tidak boleh kosong.".to_string());
    }
    let col = column.unwrap_or_else(|| "todo".to_string());
    let board = engine()
        .with_hub_mut(|h| {
            let id = format!(
                "k_{}_{}",
                now_epoch_secs(),
                h.kanban.todo.len() + h.kanban.doing.len() + h.kanban.done.len()
            );
            h.kanban.add_card(id, clean, &col);
            h.kanban.clone()
        })
        .ok_or_else(|| "Gagal memperbarui Kanban".to_string())?;
    engine().persist_kanban()?;
    Ok(board)
}

#[tauri::command]
pub fn move_widget_kanban_card(card_id: String, to_column: String) -> Result<KanbanBoard, String> {
    let board = engine()
        .with_hub_mut(|h| {
            h.kanban.move_card(&card_id, &to_column);
            h.kanban.clone()
        })
        .ok_or_else(|| "Gagal memindahkan kartu Kanban".to_string())?;
    engine().persist_kanban()?;
    Ok(board)
}

#[tauri::command]
pub fn delete_widget_kanban_card(card_id: String) -> Result<KanbanBoard, String> {
    let board = engine()
        .with_hub_mut(|h| {
            h.kanban.remove_card(&card_id);
            h.kanban.clone()
        })
        .ok_or_else(|| "Gagal menghapus kartu Kanban".to_string())?;
    engine().persist_kanban()?;
    Ok(board)
}

#[tauri::command]
pub fn add_widget_world_clock(
    city: String,
    code: String,
    utc_offset_hours: f32,
) -> Result<(), String> {
    let mins = (utc_offset_hours.clamp(-12.0, 14.0) * 60.0).round() as i32;
    engine().with_hub_mut(|h| {
        // Insert at front so newly added city immediately appears in the 4-zone widget
        h.world_clocks.insert(
            0,
            WorldClockZone {
                id: format!("wc_{}", now_epoch_secs()),
                city: city.trim().to_string(),
                code: code.trim().to_uppercase(),
                utc_offset_minutes: mins,
            },
        );
        if h.world_clocks.len() > 6 {
            h.world_clocks.truncate(6);
        }
    });
    engine().persist_world_clocks()
}

#[cfg(test)]
mod click_routing_tests {
    use super::{is_notch_integrated_widget, settings_provider_for_widget};

    #[test]
    fn settings_input_widgets_route_to_exact_provider_and_not_notch() {
        let cases = [
            ("calendar_agenda", "ical_calendar"),
            ("mini_kanban", "mini_kanban"),
            ("countdown_moment", "countdown"),
            ("quick_snippets", "snippets"),
            ("time_tracker", "time_tracker"),
            ("shortcuts_grid", "shortcuts"),
            ("world_clock", "world_clock"),
            ("quick_expense", "expense"),
            ("photo_frame", "folders"),
            ("recent_files", "folders"),
            ("storage_treemap", "folders"),
            ("site_status", "uptime"),
            ("github_status", "github"),
        ];
        for (widget_type, expected_provider) in cases {
            assert_eq!(
                settings_provider_for_widget(widget_type),
                Some(expected_provider),
                "wrong settings provider for {widget_type}"
            );
            assert!(
                !is_notch_integrated_widget(widget_type, None),
                "{widget_type} must not open Notch on body click"
            );
        }
    }

    #[test]
    fn only_truly_integrated_widgets_route_to_notch() {
        let notch_widgets = [
            "now_playing",
            "audio_visualizer",
            "todo_groups",
            "drop_zone",
            "prayer_times",
            "system_performance",
            "top_processes",
            "quick_controls",
            "ai_quick_ask",
            "sticky_notes",
        ];
        for widget_type in notch_widgets {
            assert_eq!(
                settings_provider_for_widget(widget_type),
                None,
                "{widget_type} should not map to settings provider"
            );
            assert!(
                is_notch_integrated_widget(widget_type, None),
                "{widget_type} should open integrated Notch module"
            );
        }
        for act in [
            "open_ai_settings",
            "open_ai_chat",
            "open_media",
            "open_todo",
            "open_shelf",
            "open_quick_note",
        ] {
            assert!(is_notch_integrated_widget("custom", Some(act)));
        }
    }

    #[test]
    fn display_only_and_self_contained_widgets_have_no_click_fallback() {
        let passive_widgets = [
            "styled_clock",
            "weather_forecast",
            "air_quality",
            "currency_gold",
            "hijri_holidays",
            "quote_poster",
            "live_mascot",
            "football_scores",
            "class_schedule",
            "habit_heatmap",
            "screen_time",
        ];
        for widget_type in passive_widgets {
            assert_eq!(
                settings_provider_for_widget(widget_type),
                None,
                "{widget_type} must not route to Settings"
            );
            assert!(
                !is_notch_integrated_widget(widget_type, None),
                "{widget_type} must not open Notch"
            );
        }
    }
}
