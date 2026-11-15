use crate::windows_app_indexer::{collect_all_installed_apps, resolve_batch_app_icons};
use crate::windows_pinned_apps::{
    get_cached_icon_only, get_cached_or_extract_icon, resolve_shortcut, WindowsPinnedApp,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Instant, UNIX_EPOCH};

const START_APPS_CACHE_TTL_SECS: u64 = 120;

static START_APPS_CACHE: OnceLock<Mutex<Option<(Instant, Vec<WindowsPinnedApp>)>>> = OnceLock::new();

#[derive(Serialize, Clone, Debug)]
pub struct RecentFileItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub lnk_path: String,
    pub folder: String,
    pub modified_ts: u64,
    pub icon_base64: Option<String>,
    pub kind: String,
}

#[derive(Deserialize)]
pub struct StartAppIconRequest {
    pub key: String,
    pub lnk_path: String,
    pub target_path: String,
}

fn hydrate_cached_icons(apps: &mut [WindowsPinnedApp]) {
    for app in apps {
        if app.icon_base64.is_some() {
            continue;
        }
        let cached = (!app.lnk_path.is_empty())
            .then(|| get_cached_icon_only(&app.lnk_path))
            .flatten()
            .or_else(|| {
                (!app.target_path.is_empty())
                    .then(|| get_cached_icon_only(&app.target_path))
                    .flatten()
            });
        if cached.is_some() {
            app.icon_base64 = cached;
        }
    }
}

pub fn warm_start_apps_index() {
    let mut apps = collect_all_installed_apps();
    let warm_batch: Vec<(String, String, String)> = apps
        .iter()
        .take(40)
        .filter(|a| a.icon_base64.is_none())
        .map(|a| (a.id.clone(), a.lnk_path.clone(), a.target_path.clone()))
        .collect();
    if !warm_batch.is_empty() {
        let _ = resolve_batch_app_icons(warm_batch);
        hydrate_cached_icons(&mut apps);
    }

    let cache = START_APPS_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = cache.lock() {
        *guard = Some((Instant::now(), apps));
    }
}

#[tauri::command]
pub async fn get_start_menu_apps() -> Vec<WindowsPinnedApp> {
    let cache = START_APPS_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some((cached_at, apps)) = guard.as_ref() {
            if cached_at.elapsed().as_secs() < START_APPS_CACHE_TTL_SECS {
                let mut hydrated = apps.clone();
                hydrate_cached_icons(&mut hydrated);
                return hydrated;
            }
        }
    }

    let mut apps = tauri::async_runtime::spawn_blocking(collect_all_installed_apps)
        .await
        .unwrap_or_default();

    hydrate_cached_icons(&mut apps);
    if let Ok(mut guard) = cache.lock() {
        *guard = Some((Instant::now(), apps.clone()));
    }
    apps
}

#[tauri::command]
pub async fn get_start_app_icons(requests: Vec<StartAppIconRequest>) -> HashMap<String, String> {
    if requests.is_empty() {
        return HashMap::new();
    }
    let items: Vec<(String, String, String)> = requests
        .into_iter()
        .take(40)
        .map(|r| (r.key, r.lnk_path, r.target_path))
        .collect();

    tauri::async_runtime::spawn_blocking(move || resolve_batch_app_icons(items))
        .await
        .unwrap_or_default()
}

fn detect_file_kind(path: &Path) -> String {
    if path.is_dir() {
        return "folder".to_string();
    }
    match path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "pdf" => "pdf",
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "svg" | "bmp" => "image",
        "ts" | "tsx" | "js" | "jsx" | "rs" | "py" | "json" | "toml" | "yaml" | "yml" | "md"
        | "html" | "css" => "code",
        "doc" | "docx" | "txt" | "rtf" | "xlsx" | "csv" | "pptx" | "fig" => "doc",
        _ => "file",
    }
    .to_string()
}

#[tauri::command]
pub async fn get_recent_files(limit: Option<usize>) -> Vec<RecentFileItem> {
    let max_items = limit.unwrap_or(10).clamp(1, 30);

    tauri::async_runtime::spawn_blocking(move || {
        let Ok(appdata) = std::env::var("APPDATA") else {
            return Vec::new();
        };
        let recent_dir = PathBuf::from(appdata).join("Microsoft\\Windows\\Recent");
        let Ok(entries) = std::fs::read_dir(&recent_dir) else {
            return Vec::new();
        };

        let mut lnk_candidates: Vec<(u64, PathBuf)> = entries
            .flatten()
            .filter_map(|entry| {
                let path = entry.path();
                if path
                    .extension()
                    .and_then(|s| s.to_str())
                    .is_none_or(|e| !e.eq_ignore_ascii_case("lnk"))
                {
                    return None;
                }
                let ts = entry
                    .metadata()
                    .ok()?
                    .modified()
                    .ok()?
                    .duration_since(UNIX_EPOCH)
                    .ok()?
                    .as_secs();
                Some((ts, path))
            })
            .collect();

        lnk_candidates.sort_by(|a, b| b.0.cmp(&a.0));

        let mut items = Vec::new();
        let mut seen_targets = HashSet::new();

        for (ts, lnk_path) in lnk_candidates.into_iter().take(45) {
            if items.len() >= max_items {
                break;
            }
            let Some(resolved) = resolve_shortcut(&lnk_path) else {
                continue;
            };
            let target = resolved.target_path.trim().to_string();
            let target_path = Path::new(&target);
            if target.is_empty() || !target_path.exists() {
                continue;
            }
            let lower_target = target.to_lowercase();
            if lower_target.ends_with(".tmp")
                || lower_target.ends_with("desktop.ini")
                || !seen_targets.insert(lower_target)
            {
                continue;
            }

            let display_name = target_path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or(&resolved.name)
                .to_string();
            let folder = target_path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|s| s.to_str())
                .unwrap_or("Komputer")
                .to_string();

            items.push(RecentFileItem {
                id: format!("recent-{}", items.len()),
                name: display_name,
                path: target.clone(),
                lnk_path: resolved.lnk_path,
                folder,
                modified_ts: ts,
                icon_base64: resolved
                    .icon_base64
                    .or_else(|| get_cached_or_extract_icon(&target)),
                kind: detect_file_kind(target_path),
            });
        }

        items
    })
    .await
    .unwrap_or_default()
}
