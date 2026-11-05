use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use serde_json::json;

static LOGGER_LOCK: Mutex<()> = Mutex::new(());

fn get_log_file_path() -> Option<PathBuf> {
    let base = std::env::var_os("APPDATA")
        .or_else(|| std::env::var_os("LOCALAPPDATA"))?;
    let dir = PathBuf::from(base).join("com.faiz.gili").join("logs");
    let _ = create_dir_all(&dir);
    Some(dir.join("taskbar_flyouts.log"))
}

pub fn log_taskbar_event(
    window: &str,
    event: &str,
    status: &str,
    details: Option<serde_json::Value>,
) {
    let _guard = LOGGER_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    let Some(path) = get_log_file_path() else {
        return;
    };

    // Check size and rotate if > 2MB
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > 2 * 1024 * 1024 {
            let backup = path.with_extension("log.old");
            let _ = std::fs::rename(&path, backup);
        }
    }

    let now = chrono_now_iso();
    let entry = json!({
        "timestamp": now,
        "window": window,
        "event": event,
        "status": status,
        "details": details.unwrap_or_else(|| json!({}))
    });

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "{}", entry);
    }
}

fn chrono_now_iso() -> String {
    // Generates a simple UTC ISO-8601 timestamp without requiring external chrono crate
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let millis = dur.subsec_millis();

    let days = secs / 86400;
    let rem_secs = secs % 86400;
    let hours = rem_secs / 3600;
    let mins = (rem_secs % 3600) / 60;
    let seconds = rem_secs % 60;

    // Approximate civil date from unix day count (since Jan 1 1970)
    let (year, month, day) = days_to_ymd(days as i64);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hours, mins, seconds, millis
    )
}

fn days_to_ymd(days: i64) -> (i64, u32, u32) {
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

#[tauri::command]
pub fn get_taskbar_flyout_logs(limit: Option<usize>) -> Vec<String> {
    let _guard = LOGGER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let Some(path) = get_log_file_path() else {
        return Vec::new();
    };

    let Ok(content) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };

    let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let max = limit.unwrap_or(100);
    if lines.len() > max {
        lines[lines.len() - max..].to_vec()
    } else {
        lines
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_iso_timestamp_format() {
        let ts = chrono_now_iso();
        assert!(ts.contains('T'));
        assert!(ts.ends_with('Z'));
        assert_eq!(ts.len(), 24);
    }

    #[test]
    fn test_days_to_ymd_calculation() {
        // Unix epoch day 0: 1970-01-01
        let (y, m, d) = days_to_ymd(0);
        assert_eq!((y, m, d), (1970, 1, 1));

        // 2026-11-06 is day 20763
        let (y2, m2, d2) = days_to_ymd(20763);
        assert_eq!((y2, m2, d2), (2026, 11, 6));
    }
}
