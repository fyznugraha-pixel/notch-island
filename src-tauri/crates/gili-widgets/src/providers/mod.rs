pub mod audio_fft;
pub mod ical_provider;
pub mod local_stores;
pub mod network_providers;
pub mod prayer_calc;
pub mod system_data;

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MediaSnapshot {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub thumbnail_path_or_data: Option<String>,
    pub position_sec: f64,
    pub duration_sec: f64,
    pub is_playing: bool,
    pub active_lyric_line: String,
    pub next_lyric_line: String,
    pub lyrics_lines: Vec<String>,
    pub lyrics_state: String,
}

impl MediaSnapshot {
    pub fn visibly_eq(&self, other: &Self) -> bool {
        self.title == other.title
            && self.artist == other.artist
            && self.album == other.album
            && self.thumbnail_path_or_data == other.thumbnail_path_or_data
            && self.is_playing == other.is_playing
            && self.active_lyric_line == other.active_lyric_line
            && self.next_lyric_line == other.next_lyric_line
            && self.lyrics_lines == other.lyrics_lines
            && self.lyrics_state == other.lyrics_state
            && (self.duration_sec.round() as i64) == (other.duration_sec.round() as i64)
            && (self.position_sec.floor() as i64) == (other.position_sec.floor() as i64)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct AgendaItem {
    pub id: String,
    pub title: String,
    pub time: String,
    pub date_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ClassScheduleItem {
    pub id: String,
    pub subject: String,
    pub room: String,
    pub time: String,
    /// 0 = Minggu .. 6 = Sabtu (optional for backward compatibility with daily v1 list)
    pub day: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct TodoSnapshotItem {
    pub id: String,
    pub text: String,
    pub completed: bool,
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ShelfFileSnapshot {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size_formatted: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct QuoteSnapshot {
    pub text: String,
    pub author: String,
    pub custom_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct AiQuickAskSnapshot {
    pub configured: bool,
    pub active_model_label: String,
    pub last_prompt: String,
    pub last_response: String,
    pub is_streaming: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct FrontendMirrorSnapshot {
    pub events: Vec<AgendaItem>,
    pub classes: Vec<ClassScheduleItem>,
    pub todos: Vec<TodoSnapshotItem>,
    pub shelf_files: Vec<ShelfFileSnapshot>,
    /// Mirrors the Notch Mini Note store so the desktop widget shows the same notes.
    #[serde(default)]
    pub mini_notes: Vec<local_stores::StickyNote>,
    pub quote: QuoteSnapshot,
    pub ai_quick: AiQuickAskSnapshot,
    pub habit_title: String,
    pub habit_count: u32,
    pub habit_last_checked: Option<String>,
    pub habit_history: BTreeMap<String, u32>,
    pub custom_city_name: Option<String>,
    pub custom_lat: Option<f64>,
    pub custom_lon: Option<f64>,
    #[serde(default)]
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScreenTimeSnapshot {
    pub today_secs: u64,
    pub uptime_secs: u64,
    pub daily_limit_secs: u64,
    pub date_key: String,
    pub active_processes_count: usize,
}

#[derive(Debug, Clone, Default)]
pub struct WidgetDataHub {
    pub system: system_data::SystemPerfSnapshot,
    pub top_processes: Vec<system_data::ProcessUsageItem>,
    pub quick_controls: system_data::QuickControlsSnapshot,
    pub storage_treemap: Option<system_data::StorageTreemapSnapshot>,
    pub screen_time: ScreenTimeSnapshot,
    pub media: MediaSnapshot,
    pub weather: network_providers::WeatherForecastSnapshot,
    pub air_quality: network_providers::AirQualitySnapshot,
    pub uptime_sites: Vec<network_providers::SiteStatusSnapshot>,
    pub github: network_providers::GitHubStatusSnapshot,
    pub ical_calendar: ical_provider::IcalFeedSnapshot,
    pub currency_gold: network_providers::CurrencyGoldSnapshot,
    pub football: network_providers::FootballScoreSnapshot,
    pub prayer: prayer_calc::PrayerDaySnapshot,
    pub hijri_holidays: prayer_calc::HijriHolidaySnapshot,
    pub audio_bands: [f32; 16],
    pub frontend: FrontendMirrorSnapshot,
    pub notes: Vec<local_stores::StickyNote>,
    pub kanban: local_stores::KanbanBoard,
    pub time_tracker: local_stores::TimeTrackerState,
    pub expenses: local_stores::ExpenseLedger,
    pub shortcuts: Vec<local_stores::ShortcutEntry>,
    pub recent_files: local_stores::RecentFilesState,
    pub photo_frame: local_stores::PhotoSlideshowState,
    pub countdowns: Vec<local_stores::CountdownMoment>,
    pub snippets: Vec<local_stores::QuickSnippetItem>,
    pub world_clocks: Vec<local_stores::WorldClockZone>,
    pub mascot_poke_count: u64,
}
