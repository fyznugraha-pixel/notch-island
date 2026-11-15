use crate::windows_pinned_apps::{
    detect_app_id, detect_icon_type, get_cached_icon_only, get_cached_or_extract_icon,
    hbitmap_to_base64, insert_cached_icon, resolve_shortcut_with_options, WindowsPinnedApp,
};
use crate::ComGuard;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use windows::core::{GUID, PCWSTR};
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::DeleteObject;
use windows::Win32::System::Com::{CoTaskMemFree, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::{
    BHID_EnumItems, FOLDERID_AppsFolder, FOLDERID_CommonPrograms, FOLDERID_Desktop,
    FOLDERID_Programs, FOLDERID_PublicDesktop, IEnumShellItems, IShellItem,
    IShellItemImageFactory, KF_FLAG_DEFAULT, SHCreateItemFromParsingName, SHGetKnownFolderItem,
    SHGetKnownFolderPath, SIGDN, SIGDN_FILESYSPATH, SIGDN_NORMALDISPLAY,
    SIGDN_PARENTRELATIVEPARSING, SIIGBF, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
};

pub(crate) fn should_skip_shortcut(name: &str) -> bool {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.starts_with("@{") || trimmed.starts_with("ms-resource:") {
        return true;
    }
    let lower = trimmed.to_lowercase();
    lower.contains("uninstall")
        || lower.contains("uninst")
        || lower.contains("readme")
        || lower.contains("release notes")
        || lower.contains("documentation")
        || lower.contains("manual")
        || lower.ends_with(" help")
        || lower == "help"
}

unsafe fn shell_item_display_name(item: &IShellItem, sigdn: SIGDN) -> Option<String> {
    let pwstr = item.GetDisplayName(sigdn).ok()?;
    if pwstr.is_null() {
        return None;
    }
    let text = pwstr.to_string().ok();
    CoTaskMemFree(Some(pwstr.0 as *const _));
    text.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

unsafe fn get_known_folder_path(folder_id: &GUID) -> Option<PathBuf> {
    let pwstr = SHGetKnownFolderPath(folder_id, KF_FLAG_DEFAULT, None).ok()?;
    if pwstr.is_null() {
        return None;
    }
    let path = pwstr.to_string().ok();
    CoTaskMemFree(Some(pwstr.0 as *const _));
    path.map(PathBuf::from).filter(|p| p.is_dir())
}

fn expand_env_vars(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after_start = &rest[start + 1..];
        if let Some(end) = after_start.find('%') {
            let var_name = &after_start[..end];
            if let Ok(val) = std::env::var(var_name) {
                out.push_str(&val);
            } else {
                out.push('%');
                out.push_str(var_name);
                out.push('%');
            }
            rest = &after_start[end + 1..];
        } else {
            out.push_str(&rest[start..]);
            rest = "";
            break;
        }
    }
    out.push_str(rest);
    out
}

fn parse_url_shortcut_fields(url_path: &Path) -> Option<(String, Option<String>)> {
    let content = std::fs::read_to_string(url_path).ok()?;
    let mut url = None;
    let mut icon_file = None;
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed
            .strip_prefix("URL=")
            .or_else(|| trimmed.strip_prefix("url="))
        {
            let clean = rest.trim();
            if !clean.is_empty() {
                url = Some(clean.to_string());
            }
        } else if let Some(rest) = trimmed
            .strip_prefix("IconFile=")
            .or_else(|| trimmed.strip_prefix("iconfile="))
        {
            let clean = expand_env_vars(rest.trim().trim_matches('"'));
            if !clean.is_empty() {
                icon_file = Some(clean);
            }
        }
    }
    url.map(|u| (u, icon_file))
}

fn is_vendor_web_link(name: &str, url: &str) -> bool {
    let lower_url = url.to_lowercase();
    if !(lower_url.starts_with("http://") || lower_url.starts_with("https://")) {
        return false;
    }
    let lower_name = name.to_lowercase();
    lower_name.contains("website")
        || lower_name.contains("homepage")
        || lower_name.contains("home page")
        || lower_name.contains("online")
        || lower_name.contains("support")
        || lower_name.contains("forum")
        || lower_name.contains("donate")
        || lower_name.contains("faq")
}

fn collect_shortcut_files(dir: &Path, depth: usize, max_depth: usize, out: &mut Vec<PathBuf>) {
    if depth > max_depth || !dir.is_dir() {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_shortcut_files(&path, depth + 1, max_depth, out);
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if ext.eq_ignore_ascii_case("lnk") || ext.eq_ignore_ascii_case("url") {
                out.push(path);
            }
        }
    }
}

fn resolve_url_shortcut(path: &Path) -> Option<WindowsPinnedApp> {
    let name = path.file_stem()?.to_str()?.trim().to_string();
    if should_skip_shortcut(&name) {
        return None;
    }
    let (url, icon_file) = parse_url_shortcut_fields(path)?;
    if is_vendor_web_link(&name, &url) {
        return None;
    }
    let lnk_path = path.to_string_lossy().to_string();
    let icon_base64 = get_cached_icon_only(&lnk_path)
        .or_else(|| icon_file.as_deref().and_then(get_cached_icon_only));
    Some(WindowsPinnedApp {
        id: detect_app_id(&name, &url),
        name: name.clone(),
        target_path: String::new(),
        arguments: String::new(),
        icon_base64,
        icon_type: detect_icon_type(&name, &url),
        lnk_path,
    })
}

fn collect_apps_folder_items() -> Vec<WindowsPinnedApp> {
    let mut apps = Vec::new();
    unsafe {
        let _com = ComGuard::init(COINIT_APARTMENTTHREADED);
        let Ok(folder): windows::core::Result<IShellItem> =
            SHGetKnownFolderItem(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None)
        else {
            return apps;
        };
        let Ok(enum_items): windows::core::Result<IEnumShellItems> =
            folder.BindToHandler(None, &BHID_EnumItems)
        else {
            return apps;
        };

        let mut slot: [Option<IShellItem>; 1] = [None];
        let mut fetched = 0u32;
        while enum_items.Next(&mut slot, Some(&mut fetched)).is_ok() && fetched > 0 {
            fetched = 0;
            let Some(item) = slot[0].take() else {
                continue;
            };
            let Some(name) = shell_item_display_name(&item, SIGDN_NORMALDISPLAY) else {
                continue;
            };
            if should_skip_shortcut(&name) {
                continue;
            }
            let Some(parsing) = shell_item_display_name(&item, SIGDN_PARENTRELATIVEPARSING) else {
                continue;
            };
            let lnk_path = format!("shell:AppsFolder\\{}", parsing);
            let fs_path = shell_item_display_name(&item, SIGDN_FILESYSPATH)
                .filter(|p| Path::new(p).exists())
                .unwrap_or_default();

            let icon_base64 = get_cached_icon_only(&lnk_path).or_else(|| {
                (!fs_path.is_empty())
                    .then(|| get_cached_icon_only(&fs_path))
                    .flatten()
            });

            apps.push(WindowsPinnedApp {
                id: detect_app_id(&name, if fs_path.is_empty() { &parsing } else { &fs_path }),
                icon_type: detect_icon_type(
                    &name,
                    if fs_path.is_empty() { &parsing } else { &fs_path },
                ),
                name,
                target_path: fs_path,
                arguments: String::new(),
                icon_base64,
                lnk_path,
            });
        }
    }
    apps
}

fn collect_registry_app_paths() -> Vec<WindowsPinnedApp> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let mut apps = Vec::new();
    let subkey_path = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths";
    for root in [
        RegKey::predef(HKEY_CURRENT_USER),
        RegKey::predef(HKEY_LOCAL_MACHINE),
    ] {
        let Ok(app_paths_key) = root.open_subkey(subkey_path) else {
            continue;
        };
        for key_name in app_paths_key.enum_keys().flatten() {
            let Ok(entry_key) = app_paths_key.open_subkey(&key_name) else {
                continue;
            };
            let Ok(raw_exe) = entry_key.get_value::<String, _>("") else {
                continue;
            };
            let cleaned = expand_env_vars(raw_exe.trim().trim_matches('"'));
            let cleaned_lower = cleaned.to_lowercase();
            // Store/MSIX packages are already indexed with localized names and icons via AppsFolder.
            if cleaned.is_empty()
                || cleaned_lower.contains("\\windowsapps\\")
                || !Path::new(&cleaned).is_file()
            {
                continue;
            }
            let exe_path = Path::new(&cleaned);
            let stem = Path::new(&key_name)
                .file_stem()
                .and_then(|s| s.to_str())
                .or_else(|| exe_path.file_stem().and_then(|s| s.to_str()))
                .unwrap_or(&key_name)
                .trim();
            if should_skip_shortcut(stem) {
                continue;
            }
            apps.push(WindowsPinnedApp {
                id: detect_app_id(stem, &cleaned),
                name: stem.to_string(),
                target_path: cleaned.clone(),
                arguments: String::new(),
                icon_base64: get_cached_icon_only(&cleaned),
                icon_type: detect_icon_type(stem, &cleaned),
                lnk_path: String::new(),
            });
        }
    }
    apps
}

fn collect_common_windows_utilities() -> Vec<WindowsPinnedApp> {
    let win_dir = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
    let sys32 = PathBuf::from(&win_dir).join("System32");
    let candidates = [
        ("Control Panel", sys32.join("control.exe")),
        ("Command Prompt", sys32.join("cmd.exe")),
        ("Registry Editor", PathBuf::from(&win_dir).join("regedit.exe")),
        ("Task Manager", sys32.join("Taskmgr.exe")),
        ("Resource Monitor", sys32.join("resmon.exe")),
        ("DirectX Diagnostic Tool", sys32.join("dxdiag.exe")),
        ("System Information", sys32.join("msinfo32.exe")),
        ("Services", sys32.join("services.msc")),
        ("Device Manager", sys32.join("devmgmt.msc")),
    ];

    candidates
        .into_iter()
        .filter_map(|(display_name, path)| {
            if !path.is_file() {
                return None;
            }
            let target = path.to_string_lossy().to_string();
            Some(WindowsPinnedApp {
                id: detect_app_id(display_name, &target),
                name: display_name.to_string(),
                target_path: target.clone(),
                arguments: String::new(),
                icon_base64: get_cached_icon_only(&target),
                icon_type: detect_icon_type(display_name, &target),
                lnk_path: String::new(),
            })
        })
        .collect()
}

fn push_or_merge_app(
    apps: &mut Vec<WindowsPinnedApp>,
    name_to_idx: &mut HashMap<String, usize>,
    seen_targets: &mut HashSet<String>,
    candidate: WindowsPinnedApp,
) {
    let name_key = candidate.name.trim().to_lowercase();
    if name_key.is_empty() {
        return;
    }
    let target_key = candidate.target_path.trim().to_lowercase();

    if let Some(&idx) = name_to_idx.get(&name_key) {
        let existing = &mut apps[idx];
        if existing.target_path.is_empty() && !candidate.target_path.is_empty() {
            existing.target_path = candidate.target_path;
            if !target_key.is_empty() {
                seen_targets.insert(target_key);
            }
        }
        if existing.lnk_path.is_empty() && !candidate.lnk_path.is_empty() {
            existing.lnk_path = candidate.lnk_path;
        }
        if existing.icon_base64.is_none() && candidate.icon_base64.is_some() {
            existing.icon_base64 = candidate.icon_base64;
        }
        return;
    }

    if !target_key.is_empty() && !seen_targets.insert(target_key) {
        return;
    }

    let idx = apps.len();
    name_to_idx.insert(name_key, idx);
    apps.push(candidate);
}

pub(crate) fn collect_all_installed_apps() -> Vec<WindowsPinnedApp> {
    let mut apps = Vec::new();
    let mut name_to_idx = HashMap::new();
    let mut seen_targets = HashSet::new();

    for app in collect_apps_folder_items() {
        push_or_merge_app(&mut apps, &mut name_to_idx, &mut seen_targets, app);
    }

    let mut shortcut_roots: Vec<(PathBuf, usize)> = Vec::new();
    unsafe {
        let _com = ComGuard::init(COINIT_APARTMENTTHREADED);
        if let Some(p) = get_known_folder_path(&FOLDERID_Programs) {
            shortcut_roots.push((p, 6));
        }
        if let Some(p) = get_known_folder_path(&FOLDERID_CommonPrograms) {
            shortcut_roots.push((p, 6));
        }
        if let Some(p) = get_known_folder_path(&FOLDERID_Desktop) {
            shortcut_roots.push((p, 1));
        }
        if let Some(p) = get_known_folder_path(&FOLDERID_PublicDesktop) {
            shortcut_roots.push((p, 1));
        }
    }
    if shortcut_roots.is_empty() {
        if let Ok(appdata) = std::env::var("APPDATA") {
            shortcut_roots.push((
                PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs"),
                6,
            ));
        }
        if let Ok(program_data) = std::env::var("ProgramData") {
            shortcut_roots.push((
                PathBuf::from(program_data).join("Microsoft\\Windows\\Start Menu\\Programs"),
                6,
            ));
        }
    }

    let mut shortcut_files = Vec::new();
    for (dir, max_depth) in shortcut_roots {
        collect_shortcut_files(&dir, 0, max_depth, &mut shortcut_files);
    }

    for path in shortcut_files {
        let is_url = path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("url"));
        let resolved = if is_url {
            resolve_url_shortcut(&path)
        } else {
            resolve_shortcut_with_options(&path, false)
        };
        if let Some(app) = resolved {
            if should_skip_shortcut(&app.name) {
                continue;
            }
            let target_lower = app.target_path.to_lowercase();
            if target_lower.ends_with(".exe")
                && !target_lower.contains("\\installer\\")
                && !Path::new(&app.target_path).exists()
            {
                continue;
            }
            if !app.target_path.is_empty() || !app.lnk_path.is_empty() {
                push_or_merge_app(&mut apps, &mut name_to_idx, &mut seen_targets, app);
            }
        }
    }

    for app in collect_registry_app_paths() {
        push_or_merge_app(&mut apps, &mut name_to_idx, &mut seen_targets, app);
    }

    for app in collect_common_windows_utilities() {
        push_or_merge_app(&mut apps, &mut name_to_idx, &mut seen_targets, app);
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

unsafe fn extract_shell_item_icon(parsing_path: &str) -> Option<String> {
    let wide: Vec<u16> = parsing_path
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let factory: IShellItemImageFactory =
        SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None).ok()?;

    let size = SIZE { cx: 64, cy: 64 };
    let hbm = factory
        .GetImage(size, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK)
        .or_else(|_| factory.GetImage(size, SIIGBF_ICONONLY))
        .or_else(|_| factory.GetImage(size, SIIGBF(0)))
        .ok()?;
    let result = hbitmap_to_base64(hbm);
    let _ = DeleteObject(hbm);
    result
}

pub(crate) fn resolve_single_app_icon(lnk_path: &str, target_path: &str) -> Option<String> {
    let cache_key = if !lnk_path.is_empty() {
        lnk_path
    } else {
        target_path
    };
    if cache_key.is_empty() {
        return None;
    }
    if let Some(cached) = get_cached_icon_only(cache_key) {
        return Some(cached);
    }

    let extracted = if lnk_path.starts_with("shell:") {
        if !target_path.is_empty() && Path::new(target_path).exists() {
            get_cached_or_extract_icon(target_path)
                .or_else(|| unsafe { extract_shell_item_icon(lnk_path) })
        } else {
            unsafe { extract_shell_item_icon(lnk_path) }
        }
    } else if lnk_path.to_lowercase().ends_with(".url") {
        let from_url_icon = parse_url_shortcut_fields(Path::new(lnk_path))
            .and_then(|(_, icon)| icon)
            .and_then(|icon_path| {
                Path::new(&icon_path)
                    .exists()
                    .then(|| get_cached_or_extract_icon(&icon_path))
                    .flatten()
            });
        from_url_icon
            .or_else(|| unsafe { extract_shell_item_icon(lnk_path) })
            .or_else(|| get_cached_or_extract_icon(lnk_path))
    } else if !target_path.is_empty() && Path::new(target_path).exists() {
        get_cached_or_extract_icon(target_path).or_else(|| {
            (!lnk_path.is_empty())
                .then(|| get_cached_or_extract_icon(lnk_path))
                .flatten()
        })
    } else if !lnk_path.is_empty() {
        get_cached_or_extract_icon(lnk_path)
    } else {
        None
    };

    if let Some(ref b64) = extracted {
        insert_cached_icon(cache_key, b64.clone());
    }
    extracted
}

pub(crate) fn resolve_batch_app_icons(
    items: Vec<(String, String, String)>,
) -> HashMap<String, String> {
    let mut results = HashMap::new();
    let _com = ComGuard::init(COINIT_APARTMENTTHREADED);
    for (key, lnk_path, target_path) in items {
        if let Some(icon) = resolve_single_app_icon(&lnk_path, &target_path) {
            results.insert(key, icon);
        }
    }
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_uninstall_and_manifest_junk_only() {
        assert!(should_skip_shortcut("Uninstall Gili"));
        assert!(should_skip_shortcut("ReadMe"));
        assert!(should_skip_shortcut("ms-resource:DisplayName"));
        assert!(should_skip_shortcut("@{pkg!app}"));
        assert!(!should_skip_shortcut("Visual Studio Code"));
        assert!(!should_skip_shortcut("Calculator"));
    }

    #[test]
    fn merges_target_path_without_duplicating_same_app_name() {
        let mut apps = Vec::new();
        let mut by_name = HashMap::new();
        let mut seen_targets = HashSet::new();

        push_or_merge_app(
            &mut apps,
            &mut by_name,
            &mut seen_targets,
            WindowsPinnedApp {
                id: "vscode".into(),
                name: "Visual Studio Code".into(),
                target_path: String::new(),
                arguments: String::new(),
                icon_base64: None,
                icon_type: Some("code".into()),
                lnk_path: "shell:AppsFolder\\Microsoft.VisualStudioCode".into(),
            },
        );
        push_or_merge_app(
            &mut apps,
            &mut by_name,
            &mut seen_targets,
            WindowsPinnedApp {
                id: "vscode".into(),
                name: "Visual Studio Code".into(),
                target_path: "C:\\Program Files\\Microsoft VS Code\\Code.exe".into(),
                arguments: String::new(),
                icon_base64: None,
                icon_type: Some("code".into()),
                lnk_path: "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\VS Code.lnk"
                    .into(),
            },
        );

        assert_eq!(apps.len(), 1);
        assert_eq!(
            apps[0].target_path,
            "C:\\Program Files\\Microsoft VS Code\\Code.exe"
        );
        assert_eq!(
            apps[0].lnk_path,
            "shell:AppsFolder\\Microsoft.VisualStudioCode"
        );
    }

    #[test]
    fn filters_vendor_websites_but_keeps_game_url_protocols() {
        assert!(is_vendor_web_link("7-Zip Website", "https://www.7-zip.org/"));
        assert!(!is_vendor_web_link("Counter-Strike 2", "steam://rungameid/730"));
        assert!(!is_vendor_web_link("Gmail", "https://mail.google.com"));
    }

    #[test]
    fn expands_windows_env_vars_and_preserves_unknown() {
        std::env::set_var("GILI_TEST_APP_ROOT", "D:\\Apps");
        assert_eq!(
            expand_env_vars("%GILI_TEST_APP_ROOT%\\tool.exe"),
            "D:\\Apps\\tool.exe"
        );
        assert_eq!(
            expand_env_vars("%UNKNOWN_GILI_VAR%\\app.exe"),
            "%UNKNOWN_GILI_VAR%\\app.exe"
        );
        std::env::remove_var("GILI_TEST_APP_ROOT");
    }
}
