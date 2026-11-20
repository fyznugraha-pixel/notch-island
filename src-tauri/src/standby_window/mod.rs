pub mod idle_watcher;
pub mod window_ops;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct StandbyConfig {
    pub activation_mode: String,
    pub target_monitor_id: Option<String>,
    pub idle_minutes: u32,
    pub exit_on_mouse_move: bool,
    pub pause_during_fullscreen: bool,
    pub always_on_top: bool,
    pub active_screen: String,
    pub left_widget: String,
    pub right_widget: String,
    pub clock_style: String,
    pub clock_accent: String,
    pub use_24h: bool,
    pub show_seconds: bool,
    pub night_mode: String,
    pub burn_in_protection: bool,
}

impl Default for StandbyConfig {
    fn default() -> Self {
        Self {
            activation_mode: "off".to_string(),
            target_monitor_id: None,
            idle_minutes: 5,
            exit_on_mouse_move: true,
            pause_during_fullscreen: true,
            always_on_top: true,
            active_screen: "widgets".to_string(),
            left_widget: "clock_analog".to_string(),
            right_widget: "weather_prayer".to_string(),
            clock_style: "bold_duo".to_string(),
            clock_accent: "#f5f5f7".to_string(),
            use_24h: true,
            show_seconds: true,
            night_mode: "auto".to_string(),
            burn_in_protection: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct StandbyLaunchContext {
    pub trigger: String,
    pub close_on_activity: bool,
    pub monitor_id: Option<String>,
    pub is_secondary_monitor: bool,
}

impl Default for StandbyLaunchContext {
    fn default() -> Self {
        Self {
            trigger: "manual".to_string(),
            close_on_activity: false,
            monitor_id: None,
            is_secondary_monitor: false,
        }
    }
}

static CONFIG_CACHE: OnceLock<Mutex<StandbyConfig>> = OnceLock::new();
static LAUNCH_CONTEXT: OnceLock<Mutex<StandbyLaunchContext>> = OnceLock::new();
static LAST_CONFIG_OVERRIDE_MS: AtomicU64 = AtomicU64::new(0);
pub(crate) static SECONDARY_USER_DISMISSED: AtomicBool = AtomicBool::new(false);
pub(crate) static STANDBY_OPEN: AtomicBool = AtomicBool::new(false);
pub(crate) static STANDBY_CLOSING: AtomicBool = AtomicBool::new(false);
pub(crate) static STANDBY_BUSY: AtomicBool = AtomicBool::new(false);
pub(crate) static OPENED_INPUT_TIME: AtomicU32 = AtomicU32::new(0);
pub(crate) static OPENED_MONOTONIC_MS: AtomicU64 = AtomicU64::new(0);
pub(crate) static LAST_DISMISS_MONOTONIC_MS: AtomicU64 = AtomicU64::new(0);
pub(crate) static LAST_DISMISS_INPUT_TIME: AtomicU32 = AtomicU32::new(0);

pub(crate) fn config_store() -> &'static Mutex<StandbyConfig> {
    CONFIG_CACHE.get_or_init(|| Mutex::new(load_config_from_disk()))
}

pub(crate) fn context_store() -> &'static Mutex<StandbyLaunchContext> {
    LAUNCH_CONTEXT.get_or_init(|| Mutex::new(StandbyLaunchContext::default()))
}

pub fn normalize_config(mut cfg: StandbyConfig) -> StandbyConfig {
    cfg.activation_mode = match cfg.activation_mode.as_str() {
        "auto_idle" | "secondary_permanent" | "off" => cfg.activation_mode,
        _ => "off".to_string(),
    };
    cfg.target_monitor_id = cfg
        .target_monitor_id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("auto"));
    cfg.idle_minutes = cfg.idle_minutes.clamp(1, 120);
    cfg.active_screen = match cfg.active_screen.as_str() {
        "widgets" | "clock" | "media" | "weather" => cfg.active_screen,
        _ => "widgets".to_string(),
    };
    cfg.left_widget = match cfg.left_widget.as_str() {
        "clock_analog" | "clock_digital" | "pomodoro" | "todo" => cfg.left_widget,
        _ => "clock_analog".to_string(),
    };
    cfg.right_widget = match cfg.right_widget.as_str() {
        "weather_prayer" | "media" | "calendar" | "hydration" | "system" => cfg.right_widget,
        _ => "weather_prayer".to_string(),
    };
    cfg.clock_style = match cfg.clock_style.as_str() {
        "bold_duo" | "editorial_serif" | "minimal_mono" | "analog_rail" => cfg.clock_style,
        _ => "bold_duo".to_string(),
    };
    cfg.night_mode = match cfg.night_mode.as_str() {
        "off" | "auto" | "always" => cfg.night_mode,
        _ => "auto".to_string(),
    };
    if !is_valid_hex(&cfg.clock_accent) {
        cfg.clock_accent = "#f5f5f7".to_string();
    }
    cfg
}

fn is_valid_hex(val: &str) -> bool {
    let s = val.trim();
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn config_file_path() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(base).join("com.faiz.gili").join("standby_config.json")
}

fn load_config_from_disk() -> StandbyConfig {
    let path = config_file_path();
    let Ok(raw) = fs::read_to_string(path) else {
        return StandbyConfig::default();
    };
    serde_json::from_str::<StandbyConfig>(&raw)
        .map(normalize_config)
        .unwrap_or_default()
}

fn persist_config_to_disk(cfg: &StandbyConfig) {
    let path = config_file_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(cfg) {
        let _ = fs::write(path, json);
    }
}

pub fn get_config_snapshot() -> StandbyConfig {
    config_store()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

pub fn start_standby_watcher(app: AppHandle) {
    idle_watcher::start(app);
}

pub fn on_display_topology_changed(app: &AppHandle) {
    window_ops::reconcile_on_display_change(app);
}

pub fn destroy_standby_on_exit(app: &AppHandle) {
    window_ops::destroy_standby_window(app);
}

pub(crate) fn note_manual_dismiss_cooldown() {
    LAST_CONFIG_OVERRIDE_MS.store(window_ops::now_monotonic_ms(), Ordering::SeqCst);
}

pub(crate) fn in_recent_manual_dismiss_cooldown() -> bool {
    let prev = LAST_CONFIG_OVERRIDE_MS.load(Ordering::SeqCst);
    prev > 0 && window_ops::now_monotonic_ms().saturating_sub(prev) < 2500
}

#[tauri::command]
pub fn get_standby_config() -> StandbyConfig {
    get_config_snapshot()
}

#[tauri::command]
pub fn save_standby_config(app: AppHandle, config: StandbyConfig) -> StandbyConfig {
    let clean = normalize_config(config);
    if clean.activation_mode == "secondary_permanent" {
        SECONDARY_USER_DISMISSED.store(false, Ordering::SeqCst);
    }
    if let Ok(mut guard) = config_store().lock() {
        *guard = clean.clone();
    }
    persist_config_to_disk(&clean);
    let _ = app.emit("standby:config-updated", &clean);
    window_ops::reconcile_after_config_change(&app, &clean);
    clean
}

#[tauri::command]
pub fn open_standby_window(app: AppHandle, trigger: Option<String>) {
    let trig = trigger.unwrap_or_else(|| "manual".to_string());
    SECONDARY_USER_DISMISSED.store(false, Ordering::SeqCst);
    window_ops::open_standby_internal(&app, &trig);
}

#[tauri::command]
pub fn close_standby_window(app: AppHandle) {
    if context_store()
        .lock()
        .map(|g| g.trigger == "secondary_permanent")
        .unwrap_or(false)
    {
        SECONDARY_USER_DISMISSED.store(true, Ordering::SeqCst);
    }
    note_manual_dismiss_cooldown();
    window_ops::request_smooth_close_standby(&app);
}

#[tauri::command]
pub fn notify_standby_ready(app: AppHandle) {
    window_ops::reveal_standby_window(&app);
}

#[tauri::command]
pub fn toggle_standby_window(app: AppHandle) {
    if is_standby_open() {
        close_standby_window(app);
    } else {
        SECONDARY_USER_DISMISSED.store(false, Ordering::SeqCst);
        let cfg = get_config_snapshot();
        let trigger = if cfg.activation_mode == "secondary_permanent" {
            "secondary_permanent"
        } else {
            "manual"
        };
        window_ops::open_standby_internal(&app, trigger);
    }
}

#[tauri::command]
pub fn is_standby_open() -> bool {
    STANDBY_OPEN.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn get_standby_launch_context() -> StandbyLaunchContext {
    context_store()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_config_clamps_idle_and_sanitizes_fields() {
        let cfg = StandbyConfig {
            activation_mode: "bogus".into(),
            target_monitor_id: Some(" auto ".into()),
            idle_minutes: 0,
            active_screen: "bad".into(),
            left_widget: "unknown".into(),
            right_widget: "unknown".into(),
            clock_style: "unknown".into(),
            clock_accent: "red".into(),
            night_mode: "invalid".into(),
            ..Default::default()
        };
        let norm = normalize_config(cfg);
        assert_eq!(norm.activation_mode, "off");
        assert_eq!(norm.target_monitor_id, None);
        assert_eq!(norm.idle_minutes, 1);
        assert_eq!(norm.active_screen, "widgets");
        assert_eq!(norm.left_widget, "clock_analog");
        assert_eq!(norm.right_widget, "weather_prayer");
        assert_eq!(norm.clock_style, "bold_duo");
        assert_eq!(norm.clock_accent, "#f5f5f7");
        assert_eq!(norm.night_mode, "auto");
    }

    #[test]
    fn normalize_config_preserves_valid_settings() {
        let cfg = StandbyConfig {
            activation_mode: "secondary_permanent".into(),
            target_monitor_id: Some(r"\\.\DISPLAY2".into()),
            idle_minutes: 15,
            exit_on_mouse_move: false,
            pause_during_fullscreen: true,
            always_on_top: false,
            active_screen: "media".into(),
            left_widget: "pomodoro".into(),
            right_widget: "calendar".into(),
            clock_style: "editorial_serif".into(),
            clock_accent: "#ff9f0a".into(),
            use_24h: false,
            show_seconds: false,
            night_mode: "always".into(),
            burn_in_protection: true,
        };
        let norm = normalize_config(cfg.clone());
        assert_eq!(norm, cfg);
    }
}
