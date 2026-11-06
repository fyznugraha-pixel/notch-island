use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::SystemTime;
use tauri::{AppHandle, Emitter, Manager};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct MediaPayload {
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub thumbnail: Option<String>,
    pub duration: f64,
    pub position: f64,
    pub is_playing: bool,
    pub playback_type: i32,
    pub app_id: Option<String>,
    pub web_source: Option<String>,
    pub is_browser: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct LyricLinePayload {
    pub time: f64,
    pub text: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct LyricsPayload {
    pub artist: String,
    pub title: String,
    // "loading" | "synced" | "plain" | "not_found" | "instrumental" | "empty"
    pub state: String,
    pub synced: bool,
    pub lines: Vec<LyricLinePayload>,
    pub plain_lyrics: Option<String>,
    pub provider: String,
    pub provider_name: String,
    pub offset: f64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct CachedLyricsEntry {
    pub artist: String,
    pub title: String,
    pub state: String,
    pub synced: bool,
    pub lines: Vec<LyricLinePayload>,
    pub plain_lyrics: Option<String>,
    pub provider: String,
    pub provider_name: String,
    pub cached_at_secs: u64,
}

static CURRENT_MEDIA: OnceLock<Arc<Mutex<MediaPayload>>> = OnceLock::new();
static CURRENT_LYRICS: OnceLock<Arc<Mutex<Option<LyricsPayload>>>> = OnceLock::new();
static OFFSETS_CACHE: OnceLock<Arc<Mutex<HashMap<String, f64>>>> = OnceLock::new();
static OFFSETS_LOADED: OnceLock<Arc<Mutex<bool>>> = OnceLock::new();

fn get_media_store() -> &'static Arc<Mutex<MediaPayload>> {
    CURRENT_MEDIA.get_or_init(|| Arc::new(Mutex::new(MediaPayload::default())))
}

fn get_lyrics_store() -> &'static Arc<Mutex<Option<LyricsPayload>>> {
    CURRENT_LYRICS.get_or_init(|| Arc::new(Mutex::new(None)))
}

fn get_offsets_store() -> &'static Arc<Mutex<HashMap<String, f64>>> {
    OFFSETS_CACHE.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn get_offsets_loaded_flag() -> &'static Arc<Mutex<bool>> {
    OFFSETS_LOADED.get_or_init(|| Arc::new(Mutex::new(false)))
}

pub fn normalize_track_key(artist: &str, title: &str) -> String {
    let a = artist.trim().to_lowercase();
    let t = title.trim().to_lowercase();
    if a.is_empty() {
        t
    } else {
        format!("{} - {}", a, t)
    }
}

fn track_key_to_filename(key: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in key.bytes() {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    let safe_prefix: String = key
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .take(20)
        .collect();
    format!("{}_{:016x}.json", safe_prefix, hash)
}

fn get_gili_app_dir(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = app.path().app_data_dir() {
        return dir;
    }
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(base).join("com.faiz.gili")
}

fn get_lyrics_cache_dir(app: &AppHandle) -> PathBuf {
    let dir = get_gili_app_dir(app).join("lyrics_cache");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn get_lyrics_offsets_path(app: &AppHandle) -> PathBuf {
    let base = get_gili_app_dir(app);
    let _ = fs::create_dir_all(&base);
    base.join("lyrics_offsets.json")
}

fn ensure_offsets_loaded(app: &AppHandle) {
    let flag_arc = get_offsets_loaded_flag();
    let mut flag = flag_arc.lock().unwrap();
    if *flag {
        return;
    }
    let path = get_lyrics_offsets_path(app);
    let mut map: HashMap<String, f64> = HashMap::new();
    if path.exists() {
        if let Ok(mut file) = File::open(&path) {
            let mut content = String::new();
            if file.read_to_string(&mut content).is_ok() {
                if let Ok(parsed) = serde_json::from_str::<HashMap<String, f64>>(&content) {
                    map = parsed;
                }
            }
        }
    }
    let offsets_arc = get_offsets_store();
    let mut offsets = offsets_arc.lock().unwrap();
    *offsets = map;
    *flag = true;
}

pub fn get_song_offset(app: &AppHandle, artist: &str, title: &str) -> f64 {
    ensure_offsets_loaded(app);
    let key = normalize_track_key(artist, title);
    let offsets_arc = get_offsets_store();
    let offsets = offsets_arc.lock().unwrap();
    offsets.get(&key).copied().unwrap_or(0.0)
}

pub fn set_song_offset(app: &AppHandle, artist: &str, title: &str, offset: f64) -> Result<(), String> {
    ensure_offsets_loaded(app);
    let key = normalize_track_key(artist, title);
    let offsets_arc = get_offsets_store();
    {
        let mut offsets = offsets_arc.lock().unwrap();
        offsets.insert(key.clone(), offset);
        let path = get_lyrics_offsets_path(app);
        if let Ok(json_str) = serde_json::to_string_pretty(&*offsets) {
            let _ = fs::write(path, json_str);
        }
    }

    // Update in-memory lyrics state if currently playing this track
    let lyrics_arc = get_lyrics_store();
    let mut guard = lyrics_arc.lock().unwrap();
    if let Some(ref mut cur) = *guard {
        if normalize_track_key(&cur.artist, &cur.title) == key {
            cur.offset = offset;
            let _ = app.emit("lyrics:update", cur.clone());
        }
    }

    Ok(())
}

const MAX_CACHE_ENTRIES: usize = 1000;
const MAX_CACHE_SIZE_BYTES: u64 = 25 * 1024 * 1024; // 25 MB

fn enforce_cache_limits(cache_dir: &PathBuf) {
    let Ok(entries) = fs::read_dir(cache_dir) else { return };
    let mut files = Vec::new();
    let mut total_size: u64 = 0;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Ok(meta) = path.metadata() {
                let size = meta.len();
                total_size += size;
                let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                files.push((path, modified, size));
            }
        }
    }

    if files.len() <= MAX_CACHE_ENTRIES && total_size <= MAX_CACHE_SIZE_BYTES {
        return;
    }

    // Sort by modified ascending (oldest first)
    files.sort_by_key(|(_, modified, _)| *modified);

    for (path, _, size) in files {
        if total_size <= (MAX_CACHE_SIZE_BYTES * 4 / 5) && fs::read_dir(cache_dir).map(|e| e.count()).unwrap_or(0) <= (MAX_CACHE_ENTRIES * 4 / 5) {
            break;
        }
        let _ = fs::remove_file(path);
        total_size = total_size.saturating_sub(size);
    }
}

pub fn get_disk_cached_lyrics(app: &AppHandle, artist: &str, title: &str) -> Option<LyricsPayload> {
    let key = normalize_track_key(artist, title);
    if key.is_empty() {
        return None;
    }
    let filename = track_key_to_filename(&key);
    let path = get_lyrics_cache_dir(app).join(filename);
    if !path.exists() {
        return None;
    }

    let content = fs::read_to_string(&path).ok()?;
    let entry: CachedLyricsEntry = serde_json::from_str(&content).ok()?;
    let offset = get_song_offset(app, artist, title);

    Some(LyricsPayload {
        artist: entry.artist,
        title: entry.title,
        state: entry.state,
        synced: entry.synced,
        lines: entry.lines,
        plain_lyrics: entry.plain_lyrics,
        provider: entry.provider,
        provider_name: entry.provider_name,
        offset,
    })
}

pub fn save_disk_cached_lyrics(app: &AppHandle, payload: &LyricsPayload) -> Result<(), String> {
    let key = normalize_track_key(&payload.artist, &payload.title);
    if key.is_empty() {
        return Ok(());
    }

    let cache_dir = get_lyrics_cache_dir(app);
    let filename = track_key_to_filename(&key);
    let path = cache_dir.join(filename);

    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let entry = CachedLyricsEntry {
        artist: payload.artist.clone(),
        title: payload.title.clone(),
        state: payload.state.clone(),
        synced: payload.synced,
        lines: payload.lines.clone(),
        plain_lyrics: payload.plain_lyrics.clone(),
        provider: payload.provider.clone(),
        provider_name: payload.provider_name.clone(),
        cached_at_secs: now_secs,
    };

    let serialized = serde_json::to_string(&entry).map_err(|e| e.to_string())?;
    fs::write(&path, serialized).map_err(|e| e.to_string())?;

    enforce_cache_limits(&cache_dir);
    Ok(())
}

pub fn on_media_state_changed(
    app: &AppHandle,
    title: &str,
    artist: &str,
    is_playing: bool,
    thumbnail: Option<String>,
    playback_type: i32,
    position: f64,
    duration: f64,
    is_browser: bool,
    app_id: Option<String>,
    web_source: Option<String>,
) {
    let new_media = MediaPayload {
        title: title.to_string(),
        artist: artist.to_string(),
        album: None,
        thumbnail: thumbnail.clone(),
        duration,
        position,
        is_playing,
        playback_type,
        app_id: app_id.clone(),
        web_source: web_source.clone(),
        is_browser,
    };

    let mut track_changed = false;
    {
        let media_arc = get_media_store();
        let mut guard = media_arc.lock().unwrap();
        if normalize_track_key(&guard.artist, &guard.title) != normalize_track_key(artist, title) {
            track_changed = true;
        }
        *guard = new_media.clone();
    }

    // Broadcast standard event media:update + backwards compat media-update
    let _ = app.emit("media:update", new_media.clone());
    let _ = app.emit("media-update", new_media);

    if track_changed {
        if title.trim().is_empty() {
            let empty_payload = LyricsPayload {
                artist: String::new(),
                title: String::new(),
                state: "empty".to_string(),
                synced: false,
                lines: Vec::new(),
                plain_lyrics: None,
                provider: String::new(),
                provider_name: String::new(),
                offset: 0.0,
            };
            let lyrics_arc = get_lyrics_store();
            let mut guard = lyrics_arc.lock().unwrap();
            *guard = Some(empty_payload.clone());
            let _ = app.emit("lyrics:update", empty_payload);
        } else {
            // Check disk cache first
            if let Some(cached) = get_disk_cached_lyrics(app, artist, title) {
                let lyrics_arc = get_lyrics_store();
                let mut guard = lyrics_arc.lock().unwrap();
                *guard = Some(cached.clone());
                let _ = app.emit("lyrics:update", cached);
            } else {
                // Not in cache, emit loading state so coordinator fetches it
                let offset = get_song_offset(app, artist, title);
                let loading_payload = LyricsPayload {
                    artist: artist.to_string(),
                    title: title.to_string(),
                    state: "loading".to_string(),
                    synced: false,
                    lines: Vec::new(),
                    plain_lyrics: None,
                    provider: String::new(),
                    provider_name: String::new(),
                    offset,
                };
                let lyrics_arc = get_lyrics_store();
                let mut guard = lyrics_arc.lock().unwrap();
                *guard = Some(loading_payload.clone());
                let _ = app.emit("lyrics:update", loading_payload);
            }
        }
    }
}

pub fn on_media_progress(app: &AppHandle, position: f64, duration: f64) {
    {
        let media_arc = get_media_store();
        let mut guard = media_arc.lock().unwrap();
        guard.position = position;
        guard.duration = duration;
    }

    #[derive(serde::Serialize, Clone)]
    struct ProgressPayload {
        position: f64,
        duration: f64,
    }

    let payload = ProgressPayload { position, duration };
    let _ = app.emit("media:progress", payload.clone());
    let _ = app.emit("media-progress", payload);
}

// --- Tauri Commands ---

#[tauri::command]
pub fn get_current_media() -> MediaPayload {
    let media_arc = get_media_store();
    let guard = media_arc.lock().unwrap();
    guard.clone()
}

#[tauri::command]
pub fn get_current_lyrics() -> Option<LyricsPayload> {
    let lyrics_arc = get_lyrics_store();
    let guard = lyrics_arc.lock().unwrap();
    guard.clone()
}

#[tauri::command]
pub fn get_lyrics_offset(app: AppHandle, artist: String, title: String) -> f64 {
    get_song_offset(&app, &artist, &title)
}

#[tauri::command]
pub fn set_lyrics_offset(app: AppHandle, artist: String, title: String, offset: f64) -> Result<(), String> {
    set_song_offset(&app, &artist, &title, offset)?;
    {
        let lyrics_arc = get_lyrics_store();
        let mut guard = lyrics_arc.lock().unwrap();
        if let Some(ref mut payload) = *guard {
            if payload.artist.eq_ignore_ascii_case(&artist) && payload.title.eq_ignore_ascii_case(&title) {
                payload.offset = offset;
                let clone = payload.clone();
                drop(guard);
                let _ = app.emit("lyrics:update", clone);
            }
        }
    }
    let _ = app.emit("lyrics:offset-changed", offset);
    Ok(())
}

#[tauri::command]
pub fn store_lyrics_result(app: AppHandle, mut payload: LyricsPayload) -> Result<(), String> {
    // Ensure per-song offset is attached from persistent store
    payload.offset = get_song_offset(&app, &payload.artist, &payload.title);

    // Save to disk cache
    let _ = save_disk_cached_lyrics(&app, &payload);

    // Update in-memory store
    {
        let lyrics_arc = get_lyrics_store();
        let mut guard = lyrics_arc.lock().unwrap();
        *guard = Some(payload.clone());
    }

    // Broadcast lyrics:update to all windows
    let _ = app.emit("lyrics:update", payload);
    Ok(())
}

#[tauri::command]
pub fn broadcast_lyrics_loading(app: AppHandle, artist: String, title: String) -> Result<(), String> {
    let offset = get_song_offset(&app, &artist, &title);
    let payload = LyricsPayload {
        artist,
        title,
        state: "loading".to_string(),
        synced: false,
        lines: Vec::new(),
        plain_lyrics: None,
        provider: String::new(),
        provider_name: String::new(),
        offset,
    };
    {
        let lyrics_arc = get_lyrics_store();
        let mut guard = lyrics_arc.lock().unwrap();
        *guard = Some(payload.clone());
    }
    let _ = app.emit("lyrics:update", payload);
    Ok(())
}

#[tauri::command]
pub fn clear_lyrics_disk_cache(app: AppHandle) -> Result<(), String> {
    let dir = get_lyrics_cache_dir(&app);
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(())
}
