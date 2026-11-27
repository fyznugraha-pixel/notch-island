use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const CONFIG_SCHEMA_VERSION: u32 = 3;
pub const GRID_SMALL_DP: f32 = 160.0;
pub const GRID_MEDIUM_W_DP: f32 = 336.0;
pub const GRID_LARGE_DP: f32 = 336.0;
pub const GRID_GAP_DP: f32 = 8.0;
pub const CARD_RADIUS_DP: f32 = 26.0;
pub const CARD_CORNER_SMOOTHING: f32 = 0.65;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum WidgetSize {
    Small,
    Medium,
    Large,
}

impl WidgetSize {
    pub fn dimensions_dp(self, grid_scale: f32) -> (f32, f32) {
        let s = sanitize_grid_scale(grid_scale);
        match self {
            WidgetSize::Small => (GRID_SMALL_DP * s, GRID_SMALL_DP * s),
            WidgetSize::Medium => (GRID_MEDIUM_W_DP * s, GRID_SMALL_DP * s),
            WidgetSize::Large => (GRID_LARGE_DP * s, GRID_LARGE_DP * s),
        }
    }

    pub fn grid_span(self) -> (i32, i32) {
        match self {
            WidgetSize::Small => (1, 1),
            WidgetSize::Medium => (2, 1),
            WidgetSize::Large => (2, 2),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundMode {
    None,
    SubtleTint,
    Glass,
    Solid,
}

impl Default for BackgroundMode {
    fn default() -> Self {
        BackgroundMode::None
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DisplayMode {
    DesktopAttached,
    WidgetBoard,
}

impl Default for DisplayMode {
    fn default() -> Self {
        DisplayMode::DesktopAttached
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct RgbaColor {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: f32,
}

impl RgbaColor {
    pub const fn new(r: u8, g: u8, b: u8, a: f32) -> Self {
        Self { r, g, b, a }
    }

    pub fn from_hex(hex: &str, alpha: f32) -> Option<Self> {
        let clean = hex.trim().trim_start_matches('#');
        if !clean.is_ascii() {
            return None;
        }
        if clean.len() == 6 {
            let r = u8::from_str_radix(&clean[0..2], 16).ok()?;
            let g = u8::from_str_radix(&clean[2..4], 16).ok()?;
            let b = u8::from_str_radix(&clean[4..6], 16).ok()?;
            Some(Self {
                r,
                g,
                b,
                a: alpha.clamp(0.0, 1.0),
            })
        } else if clean.len() == 8 {
            let r = u8::from_str_radix(&clean[0..2], 16).ok()?;
            let g = u8::from_str_radix(&clean[2..4], 16).ok()?;
            let b = u8::from_str_radix(&clean[4..6], 16).ok()?;
            let a = u8::from_str_radix(&clean[6..8], 16).ok()? as f32 / 255.0;
            Some(Self { r, g, b, a })
        } else {
            None
        }
    }

    pub fn to_hex(self) -> String {
        format!("#{:02X}{:02X}{:02X}", self.r, self.g, self.b)
    }

    pub fn with_alpha(self, a: f32) -> Self {
        Self {
            a: a.clamp(0.0, 1.0),
            ..self
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum ColorRoleSource {
    AutoContrast,
    WallpaperDominant,
    Custom { color: RgbaColor },
}

impl Default for ColorRoleSource {
    fn default() -> Self {
        ColorRoleSource::AutoContrast
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct WidgetStyleConfig {
    pub background_mode: BackgroundMode,
    pub tint_opacity: f32,
    pub text_primary: ColorRoleSource,
    pub text_secondary: ColorRoleSource,
    pub accent: ColorRoleSource,
    pub card_color: ColorRoleSource,
    pub shadow_color: RgbaColor,
    pub shadow_enabled: bool,
    pub halo_enabled: bool,
    pub font_family: String,
    pub font_weight: u16,
    pub text_scale: f32,
}

impl Default for WidgetStyleConfig {
    fn default() -> Self {
        Self {
            background_mode: BackgroundMode::Glass,
            tint_opacity: 0.20,
            text_primary: ColorRoleSource::AutoContrast,
            text_secondary: ColorRoleSource::AutoContrast,
            accent: ColorRoleSource::AutoContrast,
            card_color: ColorRoleSource::Custom {
                color: RgbaColor::new(0x16, 0x18, 0x20, 0.88),
            },
            shadow_color: RgbaColor::new(0, 0, 0, 0.55),
            shadow_enabled: true,
            halo_enabled: false,
            font_family: "Segoe UI Variable".to_string(),
            font_weight: 500,
            text_scale: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ColorPreset {
    pub id: String,
    pub name: String,
    pub style: WidgetStyleConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct WidgetInstance {
    pub instance_id: String,
    pub widget_type: String,
    pub style_override: Option<WidgetStyleConfig>,
    pub settings: serde_json::Value,
}

impl Default for WidgetInstance {
    fn default() -> Self {
        Self {
            instance_id: String::new(),
            widget_type: "styled_clock".to_string(),
            style_override: None,
            settings: serde_json::Value::Object(serde_json::Map::new()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct WidgetStackSlot {
    pub slot_id: String,
    pub monitor_id: String,
    pub size: WidgetSize,
    pub grid_col: i32,
    pub grid_row: i32,
    /// Optional free desktop placement (DIP, magnetically aligned to 16dp) set when user drags directly.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pos_x: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pos_y: Option<f32>,
    pub active_index: usize,
    pub auto_rotate_minutes: u32,
    pub widgets: Vec<WidgetInstance>,
}

impl Default for WidgetStackSlot {
    fn default() -> Self {
        Self {
            slot_id: String::new(),
            monitor_id: "primary".to_string(),
            size: WidgetSize::Medium,
            grid_col: 0,
            grid_row: 0,
            pos_x: None,
            pos_y: None,
            active_index: 0,
            auto_rotate_minutes: 0,
            widgets: Vec::new(),
        }
    }
}

impl WidgetStackSlot {
    pub fn active_widget(&self) -> Option<&WidgetInstance> {
        if self.widgets.is_empty() {
            None
        } else {
            self.widgets.get(self.active_index % self.widgets.len())
        }
    }

    pub fn step_stack(&mut self, delta: isize) {
        if self.widgets.len() <= 1 {
            return;
        }
        let len = self.widgets.len() as isize;
        let next = (self.active_index as isize + delta).rem_euclid(len);
        self.active_index = next as usize;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct DesktopWidgetsConfig {
    pub schema_version: u32,
    pub enabled: bool,
    pub display_mode: DisplayMode,
    pub board_hotkey: String,
    pub grid_scale: f32,
    pub positions_locked: bool,
    pub auto_pause_fullscreen: bool,
    pub auto_pause_power_saver: bool,
    pub global_theme: WidgetStyleConfig,
    pub presets: Vec<ColorPreset>,
    pub recent_colors: Vec<String>,
    pub slots: Vec<WidgetStackSlot>,
}

impl Default for DesktopWidgetsConfig {
    fn default() -> Self {
        Self {
            schema_version: CONFIG_SCHEMA_VERSION,
            enabled: false,
            display_mode: DisplayMode::DesktopAttached,
            board_hotkey: "Control+Alt+W".to_string(),
            grid_scale: 1.0,
            positions_locked: false,
            auto_pause_fullscreen: true,
            auto_pause_power_saver: true,
            global_theme: WidgetStyleConfig::default(),
            presets: default_presets(),
            recent_colors: vec![
                "#FFFFFF".into(),
                "#F5F5F7".into(),
                "#3882F6".into(),
                "#34C3A0".into(),
                "#EC4899".into(),
                "#FBBF24".into(),
                "#F87171".into(),
            ],
            slots: default_starter_slots(),
        }
    }
}

pub fn default_presets() -> Vec<ColorPreset> {
    vec![
        ColorPreset {
            id: "frosted_dark".into(),
            name: "Kaca Gelap (Default)".into(),
            style: WidgetStyleConfig::default(),
        },
        ColorPreset {
            id: "frosted_light".into(),
            name: "Kaca Terang".into(),
            style: WidgetStyleConfig {
                background_mode: BackgroundMode::Glass,
                card_color: ColorRoleSource::Custom {
                    color: RgbaColor::new(0xF4, 0xF6, 0xFA, 0.90),
                },
                text_primary: ColorRoleSource::Custom {
                    color: RgbaColor::new(0x11, 0x13, 0x18, 0.96),
                },
                text_secondary: ColorRoleSource::Custom {
                    color: RgbaColor::new(0x11, 0x13, 0x18, 0.68),
                },
                accent: ColorRoleSource::AutoContrast,
                shadow_enabled: false,
                ..WidgetStyleConfig::default()
            },
        },
        ColorPreset {
            id: "monochrome_white".into(),
            name: "Putih Murni (Kaca)".into(),
            style: WidgetStyleConfig {
                background_mode: BackgroundMode::Glass,
                text_primary: ColorRoleSource::Custom {
                    color: RgbaColor::new(0xFF, 0xFF, 0xFF, 1.0),
                },
                text_secondary: ColorRoleSource::Custom {
                    color: RgbaColor::new(0xFF, 0xFF, 0xFF, 0.80),
                },
                accent: ColorRoleSource::Custom {
                    color: RgbaColor::new(0xFF, 0xFF, 0xFF, 1.0),
                },
                ..WidgetStyleConfig::default()
            },
        },
        ColorPreset {
            id: "oled_clear".into(),
            name: "Bening Tanpa Kartu".into(),
            style: WidgetStyleConfig {
                background_mode: BackgroundMode::None,
                ..WidgetStyleConfig::default()
            },
        },
        ColorPreset {
            id: "graphite_solid".into(),
            name: "Grafit Solid".into(),
            style: WidgetStyleConfig {
                background_mode: BackgroundMode::Solid,
                text_primary: ColorRoleSource::Custom {
                    color: RgbaColor::new(0xF5, 0xF5, 0xF7, 1.0),
                },
                text_secondary: ColorRoleSource::Custom {
                    color: RgbaColor::new(0xA8, 0xA8, 0xB3, 1.0),
                },
                card_color: ColorRoleSource::Custom {
                    color: RgbaColor::new(0x16, 0x17, 0x1D, 1.0),
                },
                shadow_enabled: false,
                ..WidgetStyleConfig::default()
            },
        },
    ]
}

pub fn default_starter_slots() -> Vec<WidgetStackSlot> {
    vec![
        WidgetStackSlot {
            slot_id: "slot_clock".into(),
            monitor_id: "primary".into(),
            size: WidgetSize::Medium,
            grid_col: 0,
            grid_row: 0,
            pos_x: None,
            pos_y: None,
            active_index: 0,
            auto_rotate_minutes: 0,
            widgets: vec![WidgetInstance {
                instance_id: "w_clock_1".into(),
                widget_type: "styled_clock".into(),
                style_override: None,
                settings: serde_json::json!({ "clock_style": "minimal_digital", "show_seconds": false }),
            }],
        },
        WidgetStackSlot {
            slot_id: "slot_sys".into(),
            monitor_id: "primary".into(),
            size: WidgetSize::Medium,
            grid_col: 0,
            grid_row: 1,
            pos_x: None,
            pos_y: None,
            active_index: 0,
            auto_rotate_minutes: 0,
            widgets: vec![WidgetInstance {
                instance_id: "w_sys_1".into(),
                widget_type: "system_performance".into(),
                style_override: None,
                settings: serde_json::json!({}),
            }],
        },
        WidgetStackSlot {
            slot_id: "slot_media".into(),
            monitor_id: "primary".into(),
            size: WidgetSize::Medium,
            grid_col: 0,
            grid_row: 2,
            pos_x: None,
            pos_y: None,
            active_index: 0,
            auto_rotate_minutes: 0,
            widgets: vec![WidgetInstance {
                instance_id: "w_media_1".into(),
                widget_type: "now_playing".into(),
                style_override: None,
                settings: serde_json::json!({ "show_lyrics": true }),
            }],
        },
    ]
}

pub fn sanitize_grid_scale(scale: f32) -> f32 {
    if !scale.is_finite() {
        return 1.0;
    }
    if scale <= 0.92 {
        0.85
    } else if scale >= 1.10 {
        1.2
    } else {
        1.0
    }
}

pub fn normalize_style(mut s: WidgetStyleConfig) -> WidgetStyleConfig {
    s.tint_opacity = if s.tint_opacity.is_finite() {
        s.tint_opacity.clamp(0.10, 0.25)
    } else {
        0.18
    };
    s.font_weight = s.font_weight.clamp(300, 900);
    s.text_scale = if s.text_scale.is_finite() {
        s.text_scale.clamp(0.85, 1.40)
    } else {
        1.0
    };
    if s.font_family.trim().is_empty() {
        s.font_family = "Segoe UI Variable".to_string();
    }
    s
}

pub fn normalize_config(mut cfg: DesktopWidgetsConfig) -> DesktopWidgetsConfig {
    cfg.schema_version = CONFIG_SCHEMA_VERSION;
    cfg.grid_scale = sanitize_grid_scale(cfg.grid_scale);
    cfg.global_theme = normalize_style(cfg.global_theme);
    if cfg.board_hotkey.trim().is_empty() {
        cfg.board_hotkey = "Control+Alt+W".to_string();
    }
    if cfg.presets.is_empty() {
        cfg.presets = default_presets();
    } else {
        for p in &mut cfg.presets {
            p.style = normalize_style(p.style.clone());
        }
        for builtin in default_presets() {
            if !cfg.presets.iter().any(|p| p.id == builtin.id) {
                cfg.presets.push(builtin);
            }
        }
    }
    cfg.recent_colors.truncate(16);
    cfg.slots.retain(|slot| !slot.widgets.is_empty());
    for slot in &mut cfg.slots {
        if slot.monitor_id.trim().is_empty() {
            slot.monitor_id = "primary".to_string();
        }
        slot.grid_col = slot.grid_col.max(0);
        slot.grid_row = slot.grid_row.max(0);
        if slot.active_index >= slot.widgets.len() {
            slot.active_index = 0;
        }
        for w in &mut slot.widgets {
            if let Some(ov) = w.style_override.take() {
                w.style_override = Some(normalize_style(ov));
            }
        }
    }
    cfg
}

fn strip_legacy_default_blue(style: &mut WidgetStyleConfig) {
    let legacy_blue = RgbaColor::new(0x38, 0x82, 0xF6, 1.0);
    if matches!(style.accent, ColorRoleSource::Custom { color } if color == legacy_blue) {
        style.accent = ColorRoleSource::AutoContrast;
    }
}

pub fn migrate_config_value(raw: serde_json::Value) -> DesktopWidgetsConfig {
    let version = raw
        .get("schema_version")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    let mut parsed: DesktopWidgetsConfig = serde_json::from_value(raw).unwrap_or_default();
    if version < 2 {
        strip_legacy_default_blue(&mut parsed.global_theme);
        for p in &mut parsed.presets {
            if matches!(p.id.as_str(), "oled_clear" | "frosted_glass" | "graphite_solid") {
                strip_legacy_default_blue(&mut p.style);
            }
        }
        for slot in &mut parsed.slots {
            for w in &mut slot.widgets {
                if let Some(ov) = w.style_override.as_mut() {
                    strip_legacy_default_blue(ov);
                }
            }
        }
    }
    if version < 3 && parsed.global_theme.background_mode == BackgroundMode::None {
        parsed.global_theme.background_mode = BackgroundMode::Glass;
    }
    normalize_config(parsed)
}

pub fn gili_data_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(base).join("com.faiz.gili")
}

pub fn config_path() -> PathBuf {
    gili_data_dir().join("desktop_widgets_v1.json")
}

pub fn load_config_from(path: &Path) -> DesktopWidgetsConfig {
    let Ok(raw) = fs::read_to_string(path) else {
        return DesktopWidgetsConfig::default();
    };
    match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(val) => migrate_config_value(val),
        Err(_) => DesktopWidgetsConfig::default(),
    }
}

/// Atomically writes bytes to `path` via a unique temp file + `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`
/// so concurrent writers or power loss never delete the destination file before replacement succeeds.
pub fn atomic_write_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{Mutex, OnceLock};

    static WRITE_SEQ: AtomicU64 = AtomicU64::new(1);
    static WRITE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    let _guard = WRITE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }
    let seq = WRITE_SEQ.fetch_add(1, Ordering::Relaxed);
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("gili_store");
    let tmp = path.with_file_name(format!("{file_name}.{}.{seq}.tmp", std::process::id()));
    fs::write(&tmp, bytes).map_err(|e| format!("Failed to write temp file: {e}"))?;

    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        };
        let src = HSTRING::from(tmp.as_os_str());
        let dst = HSTRING::from(path.as_os_str());
        if let Err(e) = unsafe {
            MoveFileExW(&src, &dst, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)
        } {
            let _ = fs::remove_file(&tmp);
            return Err(format!("Failed to replace file atomically: {e}"));
        }
    }

    #[cfg(not(windows))]
    {
        if let Err(e) = fs::rename(&tmp, path) {
            let _ = fs::remove_file(&tmp);
            return Err(format!("Failed to replace file atomically: {e}"));
        }
    }
    Ok(())
}

/// Atomic persistence via temp file + atomic replace so power loss never corrupts user settings.
pub fn save_config_atomic(path: &Path, cfg: &DesktopWidgetsConfig) -> Result<(), String> {
    let clean = normalize_config(cfg.clone());
    let json = serde_json::to_string_pretty(&clean)
        .map_err(|e| format!("Failed to serialize configuration: {e}"))?;
    atomic_write_file(path, json.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_legacy_v0_and_clamps_invalid_values() {
        let legacy = serde_json::json!({
            "enabled": true,
            "grid_scale": 2.5,
            "global_theme": {
                "background_mode": "subtle_tint",
                "tint_opacity": 0.99,
                "font_weight": 50,
                "text_scale": 3.0,
                "font_family": ""
            },
            "slots": [
                {
                    "slot_id": "s1",
                    "size": "small",
                    "grid_col": -4,
                    "grid_row": -2,
                    "active_index": 99,
                    "widgets": [
                        { "instance_id": "w1", "widget_type": "styled_clock" }
                    ]
                },
                {
                    "slot_id": "empty_slot",
                    "size": "small",
                    "widgets": []
                }
            ]
        });

        let cfg = migrate_config_value(legacy);
        assert_eq!(cfg.schema_version, CONFIG_SCHEMA_VERSION);
        assert_eq!(cfg.grid_scale, 1.2);
        assert!((cfg.global_theme.tint_opacity - 0.25).abs() < 1e-5);
        assert_eq!(cfg.global_theme.font_weight, 300);
        assert!((cfg.global_theme.text_scale - 1.40).abs() < 1e-5);
        assert_eq!(cfg.global_theme.font_family, "Segoe UI Variable");
        assert_eq!(cfg.slots.len(), 1);
        assert_eq!(cfg.slots[0].grid_col, 0);
        assert_eq!(cfg.slots[0].active_index, 0);
    }

    #[test]
    fn atomic_save_and_reload_roundtrip() {
        let dir = std::env::temp_dir().join("gili_widgets_cfg_test");
        let file = dir.join("desktop_widgets_v1.json");
        let mut cfg = DesktopWidgetsConfig::default();
        cfg.enabled = true;
        cfg.grid_scale = 0.85;
        save_config_atomic(&file, &cfg).expect("atomic save must succeed");
        let loaded = load_config_from(&file);
        assert!(loaded.enabled);
        assert_eq!(loaded.grid_scale, 0.85);
        assert_eq!(loaded.slots.len(), cfg.slots.len());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn stack_cycles_cleanly_forward_and_backward() {
        let mut slot = WidgetStackSlot {
            widgets: vec![
                WidgetInstance { instance_id: "a".into(), ..Default::default() },
                WidgetInstance { instance_id: "b".into(), ..Default::default() },
                WidgetInstance { instance_id: "c".into(), ..Default::default() },
            ],
            ..Default::default()
        };
        slot.step_stack(1);
        assert_eq!(slot.active_index, 1);
        slot.step_stack(-2);
        assert_eq!(slot.active_index, 2);
    }
}
