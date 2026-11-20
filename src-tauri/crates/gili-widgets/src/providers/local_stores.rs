use crate::config::gili_data_dir;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

// ---- 1. Sticky Notes ----
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StickyChecklistItem {
    pub id: String,
    pub text: String,
    pub checked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StickyNote {
    pub id: String,
    pub title: String,
    pub content: String,
    pub color: String,
    pub is_checklist: bool,
    pub checklist: Vec<StickyChecklistItem>,
    pub updated_at: u64,
}

// ---- 2. Mini Kanban (3 Columns) ----
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanCard {
    pub id: String,
    pub title: String,
    pub tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct KanbanBoard {
    pub todo: Vec<KanbanCard>,
    pub doing: Vec<KanbanCard>,
    pub done: Vec<KanbanCard>,
}

impl KanbanBoard {
    pub fn move_card(&mut self, card_id: &str, to_col: &str) -> bool {
        let mut found: Option<KanbanCard> = None;
        for col in [&mut self.todo, &mut self.doing, &mut self.done] {
            if let Some(pos) = col.iter().position(|c| c.id == card_id) {
                found = Some(col.remove(pos));
                break;
            }
        }
        let Some(card) = found else {
            return false;
        };
        match to_col {
            "todo" => self.todo.push(card),
            "doing" => self.doing.push(card),
            "done" => self.done.push(card),
            _ => self.todo.push(card),
        }
        true
    }
}

// ---- 3. Project Time Tracker + CSV Export ----
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeProject {
    pub id: String,
    pub name: String,
    pub total_seconds: u64,
    pub running_since_epoch: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TimeTrackerState {
    pub projects: Vec<TimeProject>,
}

impl TimeTrackerState {
    pub fn toggle_project(&mut self, project_id: &str, now_epoch: u64) {
        for p in &mut self.projects {
            if p.id == project_id {
                if let Some(started) = p.running_since_epoch.take() {
                    p.total_seconds = p.total_seconds.saturating_add(now_epoch.saturating_sub(started));
                } else {
                    p.running_since_epoch = Some(now_epoch);
                }
            } else if let Some(started) = p.running_since_epoch.take() {
                p.total_seconds = p.total_seconds.saturating_add(now_epoch.saturating_sub(started));
            }
        }
    }

    pub fn export_csv(&self, now_epoch: u64) -> String {
        let mut out = String::from("project_id,project_name,total_seconds,formatted_hms\n");
        for p in &self.projects {
            let live_secs = p.total_seconds
                + p.running_since_epoch
                    .map(|s| now_epoch.saturating_sub(s))
                    .unwrap_or(0);
            let h = live_secs / 3600;
            let m = (live_secs % 3600) / 60;
            let s = live_secs % 60;
            let escaped = p.name.replace('"', "\"\"");
            out.push_str(&format!(
                "\"{}\",\"{}\",{},\"{:02}:{:02}:{:02}\"\n",
                p.id, escaped, live_secs, h, m, s
            ));
        }
        out
    }
}

// ---- 4. DPAPI-Encrypted Local Expense Ledger ----
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpenseItem {
    pub id: String,
    pub label: String,
    pub amount_idr: i64,
    pub category: String,
    pub timestamp_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExpenseLedger {
    pub monthly_budget_idr: i64,
    pub entries: Vec<ExpenseItem>,
}

impl ExpenseLedger {
    pub fn total_spent(&self) -> i64 {
        self.entries.iter().map(|e| e.amount_idr.max(0)).sum()
    }

    pub fn budget_ratio(&self) -> f32 {
        if self.monthly_budget_idr <= 0 {
            return 0.0;
        }
        (self.total_spent() as f32 / self.monthly_budget_idr as f32).clamp(0.0, 1.0)
    }
}

#[cfg(windows)]
pub fn dpapi_protect(plaintext: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::LocalFree;
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: plaintext.len() as u32,
        pbData: plaintext.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(
            &in_blob,
            windows::core::PCWSTR::null(),
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|e| format!("DPAPI enkripsi gagal: {e}"))?;
        let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
        let result = slice.to_vec();
        let _ = LocalFree(windows::Win32::Foundation::HLOCAL(out_blob.pbData as *mut _));
        Ok(result)
    }
}

#[cfg(windows)]
pub fn dpapi_unprotect(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::LocalFree;
    use windows::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: ciphertext.len() as u32,
        pbData: ciphertext.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(
            &in_blob,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|e| format!("DPAPI dekripsi gagal: {e}"))?;
        let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
        let result = slice.to_vec();
        let _ = LocalFree(windows::Win32::Foundation::HLOCAL(out_blob.pbData as *mut _));
        Ok(result)
    }
}

#[cfg(not(windows))]
pub fn dpapi_protect(plaintext: &[u8]) -> Result<Vec<u8>, String> {
    Ok(plaintext.to_vec())
}

#[cfg(not(windows))]
pub fn dpapi_unprotect(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    Ok(ciphertext.to_vec())
}

pub fn save_expenses_encrypted(path: &Path, ledger: &ExpenseLedger) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Gagal buat folder: {e}"))?;
    }
    let json = serde_json::to_vec(ledger).map_err(|e| format!("Serialisasi gagal: {e}"))?;
    let cipher = dpapi_protect(&json)?;
    let tmp = path.with_extension("dpapi.tmp");
    fs::write(&tmp, &cipher).map_err(|e| format!("Gagal tulis file: {e}"))?;
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    fs::rename(&tmp, path).map_err(|e| format!("Gagal rename file: {e}"))?;
    Ok(())
}

pub fn load_expenses_encrypted(path: &Path) -> ExpenseLedger {
    let Ok(cipher) = fs::read(path) else {
        return ExpenseLedger::default();
    };
    let Ok(plain) = dpapi_unprotect(&cipher) else {
        return ExpenseLedger::default();
    };
    serde_json::from_slice(&plain).unwrap_or_default()
}

// ---- 5. Habit Streak Backward-Compatible Migration ----
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HabitHeatmapStore {
    pub title: String,
    pub count: u32,
    pub last_checked_date: Option<String>,
    #[serde(default)]
    pub history: BTreeMap<String, u32>,
}

pub fn migrate_legacy_streak(raw: serde_json::Value) -> HabitHeatmapStore {
    let title = raw
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Fokus Harian")
        .to_string();
    let count = raw.get("count").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let last_checked_date = raw
        .get("lastCheckedDate")
        .or_else(|| raw.get("last_checked_date"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mut history: BTreeMap<String, u32> = raw
        .get("history")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    if history.is_empty() {
        if let Some(ref d) = last_checked_date {
            if count > 0 {
                history.insert(d.clone(), 1);
            }
        }
    }

    HabitHeatmapStore {
        title,
        count,
        last_checked_date,
        history,
    }
}

// ---- 6. Shortcuts + Recent Files (Opt-in Metadata Only) + Photo Slideshow ----
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutEntry {
    pub id: String,
    pub label: String,
    pub target_path: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RecentFileEntry {
    pub name: String,
    pub path: String,
    pub modified_epoch_secs: u64,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RecentFilesState {
    pub opt_in_enabled: bool,
    pub watched_folders: Vec<String>,
    pub excluded_folders: Vec<String>,
    pub files: Vec<RecentFileEntry>,
}

/// Scans opt-in folders using metadata only; never reads file contents.
pub fn scan_recent_files_metadata_only(state: &mut RecentFilesState, limit: usize) {
    if !state.opt_in_enabled {
        state.files.clear();
        return;
    }
    let excluded_lower: Vec<String> = state
        .excluded_folders
        .iter()
        .map(|s| s.to_lowercase())
        .collect();
    let mut found = Vec::new();
    for folder in &state.watched_folders {
        let Ok(rd) = fs::read_dir(folder) else {
            continue;
        };
        for entry in rd.flatten().take(200) {
            let p = entry.path();
            let p_str = p.to_string_lossy().to_string();
            let p_low = p_str.to_lowercase();
            if excluded_lower.iter().any(|ex| !ex.is_empty() && p_low.starts_with(ex)) {
                continue;
            }
            let Ok(meta) = fs::symlink_metadata(&p) else {
                continue;
            };
            if !meta.is_file() {
                continue;
            }
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            found.push(RecentFileEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: p_str,
                modified_epoch_secs: modified,
                size_bytes: meta.len(),
            });
        }
    }
    found.sort_by(|a, b| b.modified_epoch_secs.cmp(&a.modified_epoch_secs));
    found.truncate(limit.max(1));
    state.files = found;
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PhotoSlideshowState {
    pub folder_path: Option<String>,
    pub interval_secs: u32,
    pub photos: Vec<String>,
    pub current_index: usize,
    pub polaroid_caption: String,
}

pub fn scan_photo_folder_readonly(state: &mut PhotoSlideshowState) {
    let Some(ref folder) = state.folder_path else {
        state.photos.clear();
        return;
    };
    let mut list = Vec::new();
    if let Ok(rd) = fs::read_dir(folder) {
        for e in rd.flatten().take(400) {
            let p = e.path();
            let ext = p
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.to_ascii_lowercase())
                .unwrap_or_default();
            if matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "bmp") {
                list.push(p.to_string_lossy().to_string());
            }
        }
    }
    list.sort();
    state.photos = list;
    if state.current_index >= state.photos.len() {
        state.current_index = 0;
    }
}

/// Reads JPEG EXIF Orientation tag (0x0112) without external crates, returning 1..=8.
pub fn read_jpeg_exif_orientation(path: &Path) -> u16 {
    let Ok(bytes) = fs::read(path) else {
        return 1;
    };
    if bytes.len() < 16 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return 1;
    }
    let mut i = 2usize;
    while i + 4 < bytes.len() {
        if bytes[i] != 0xFF {
            break;
        }
        let marker = bytes[i + 1];
        let seg_len = u16::from_be_bytes([bytes[i + 2], bytes[i + 3]]) as usize;
        if seg_len < 2 || i + 2 + seg_len > bytes.len() {
            break;
        }
        if marker == 0xE1 && seg_len > 14 && &bytes[i + 4..i + 10] == b"Exif\0\0" {
            let tiff = &bytes[i + 10..i + 2 + seg_len];
            if tiff.len() < 14 {
                return 1;
            }
            let le = &tiff[0..2] == b"II";
            let r16 = |off: usize| -> u16 {
                if le {
                    u16::from_le_bytes([tiff[off], tiff[off + 1]])
                } else {
                    u16::from_be_bytes([tiff[off], tiff[off + 1]])
                }
            };
            let r32 = |off: usize| -> u32 {
                if le {
                    u32::from_le_bytes([tiff[off], tiff[off + 1], tiff[off + 2], tiff[off + 3]])
                } else {
                    u32::from_be_bytes([tiff[off], tiff[off + 1], tiff[off + 2], tiff[off + 3]])
                }
            };
            let ifd0 = r32(4) as usize;
            if ifd0 + 2 <= tiff.len() {
                let entries = r16(ifd0) as usize;
                for e in 0..entries {
                    let off = ifd0 + 2 + e * 12;
                    if off + 12 > tiff.len() {
                        break;
                    }
                    if r16(off) == 0x0112 {
                        let val = r16(off + 8);
                        if (1..=8).contains(&val) {
                            return val;
                        }
                    }
                }
            }
            break;
        }
        i += 2 + seg_len;
    }
    1
}

pub fn expenses_dpapi_path() -> PathBuf {
    gili_data_dir().join("desktop_widgets_expenses.dpapi")
}

pub fn local_widget_store_path(name: &str) -> PathBuf {
    gili_data_dir().join(format!("desktop_widgets_{name}.json"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CountdownMoment {
    pub id: String,
    pub title: String,
    pub target_date: String,
    pub start_date: Option<String>,
}

pub fn parse_iso_ymd(s: &str) -> Option<(i32, i32, i32)> {
    let mut sp = s.trim().split('-');
    let y = sp.next()?.parse::<i32>().ok()?;
    let m = sp.next()?.parse::<i32>().ok()?;
    let d = sp.next()?.parse::<i32>().ok()?;
    if (1..=12).contains(&m) && (1..=31).contains(&d) {
        Some((y, m, d))
    } else {
        None
    }
}

pub fn countdown_days_diff(
    cur_y: i32,
    cur_m: i32,
    cur_d: i32,
    target_iso: &str,
) -> Option<i64> {
    let (ty, tm, td) = parse_iso_ymd(target_iso)?;
    let jd_now = crate::providers::prayer_calc::julian_day(cur_y, cur_m, cur_d).floor() as i64;
    let jd_target = crate::providers::prayer_calc::julian_day(ty, tm, td).floor() as i64;
    Some(jd_target - jd_now)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickSnippetItem {
    pub id: String,
    pub label: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldClockZone {
    pub id: String,
    pub city: String,
    pub code: String,
    pub utc_offset_minutes: i32,
}

pub fn default_world_clocks() -> Vec<WorldClockZone> {
    vec![
        WorldClockZone {
            id: "wib".into(),
            city: "Jakarta".into(),
            code: "WIB".into(),
            utc_offset_minutes: 7 * 60,
        },
        WorldClockZone {
            id: "jst".into(),
            city: "Tokyo".into(),
            code: "JST".into(),
            utc_offset_minutes: 9 * 60,
        },
        WorldClockZone {
            id: "gmt".into(),
            city: "London".into(),
            code: "UTC".into(),
            utc_offset_minutes: 0,
        },
        WorldClockZone {
            id: "est".into(),
            city: "New York".into(),
            code: "EST".into(),
            utc_offset_minutes: -5 * 60,
        },
    ]
}

#[cfg(windows)]
pub fn copy_text_to_clipboard_silently(text: &str) -> Result<(), String> {
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    const CF_UNICODETEXT: u32 = 13;

    let utf16: Vec<u16> = text.encode_utf16().chain(Some(0)).collect();
    let byte_len = utf16.len() * 2;
    unsafe {
        OpenClipboard(None).map_err(|_| "Gagal membuka clipboard".to_string())?;
        let _ = EmptyClipboard();
        let hmem = GlobalAlloc(GMEM_MOVEABLE, byte_len).map_err(|_| {
            let _ = CloseClipboard();
            "Alokasi clipboard gagal".to_string()
        })?;
        let ptr = GlobalLock(hmem) as *mut u16;
        if !ptr.is_null() {
            std::ptr::copy_nonoverlapping(utf16.as_ptr(), ptr, utf16.len());
            let _ = GlobalUnlock(hmem);
            let _ = SetClipboardData(CF_UNICODETEXT, HANDLE(hmem.0));
        }
        let _ = CloseClipboard();
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn copy_text_to_clipboard_silently(_text: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dpapi_roundtrip_protects_expense_ledger() {
        let dir = std::env::temp_dir().join("gili_widgets_dpapi_test");
        let file = dir.join("expenses.dpapi");
        let ledger = ExpenseLedger {
            monthly_budget_idr: 2_500_000,
            entries: vec![ExpenseItem {
                id: "e1".into(),
                label: "Makan siang".into(),
                amount_idr: 35_000,
                category: "Makan".into(),
                timestamp_secs: 1_700_000_000,
            }],
        };
        save_expenses_encrypted(&file, &ledger).expect("DPAPI save must work");
        let raw_bytes = fs::read(&file).unwrap();
        assert!(!String::from_utf8_lossy(&raw_bytes).contains("Makan siang"));
        let loaded = load_expenses_encrypted(&file);
        assert_eq!(loaded.total_spent(), 35_000);
        assert_eq!(loaded.monthly_budget_idr, 2_500_000);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn migrates_legacy_streak_without_losing_count() {
        let legacy = serde_json::json!({
            "title": "Membaca",
            "count": 5,
            "lastCheckedDate": "2026-11-20"
        });
        let migrated = migrate_legacy_streak(legacy);
        assert_eq!(migrated.title, "Membaca");
        assert_eq!(migrated.count, 5);
        assert_eq!(migrated.history.get("2026-11-20"), Some(&1));
    }

    #[test]
    fn time_tracker_csv_export_formats_correctly() {
        let mut tracker = TimeTrackerState {
            projects: vec![TimeProject {
                id: "p1".into(),
                name: "Riset Gili".into(),
                total_seconds: 3665,
                running_since_epoch: None,
            }],
        };
        tracker.toggle_project("p1", 1000);
        let csv = tracker.export_csv(1060);
        assert!(csv.contains("\"p1\",\"Riset Gili\",3725,\"01:02:05\""));
    }
}
