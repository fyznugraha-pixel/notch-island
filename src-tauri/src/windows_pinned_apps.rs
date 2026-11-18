use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};
use windows::core::{w, Interface, HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, ERROR_SUCCESS, FILETIME, HWND, MAX_PATH};
use windows::Win32::System::Com::{
    CoCreateInstance, CLSCTX_ALL, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    COINIT_DISABLE_OLE1DDE, IPersistFile, STGM_READ,
};
use windows::Win32::System::ProcessStatus::EnumProcesses;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Shell::{
    ApplicationActivationManager, IApplicationActivationManager, IShellLinkW, ShellExecuteW,
    ShellLink, SHGetFileInfoW, AO_NONE, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON,
    SHGFI_SYSICONINDEX,
};
use windows::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, DestroyIcon, DrawIconEx, GetIconInfo, ASFW_ANY, DI_NORMAL, HICON,
    ICONINFO, SW_SHOWNORMAL,
};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetDIBits, GetObjectW,
    ReleaseDC, SelectObject, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    HBITMAP, HGDIOBJ,
};

#[link(name = "shell32")]
extern "system" {
    fn SHGetImageList(
        iimagelist: i32,
        riid: *const windows::core::GUID,
        ppvobj: *mut *mut std::ffi::c_void,
    ) -> i32;
}

#[link(name = "comctl32")]
extern "system" {
    fn ImageList_GetIcon(himl: *mut std::ffi::c_void, i: i32, flags: u32) -> HICON;
}

#[link(name = "user32")]
extern "system" {
    fn PrivateExtractIconsW(
        lpszfile: *const u16,
        niconindex: i32,
        cxicon: i32,
        cyicon: i32,
        phicon: *mut HICON,
        piconid: *mut u32,
        nicons: u32,
        flags: u32,
    ) -> u32;
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct WindowsPinnedApp {
    pub id: String,
    pub name: String,
    pub target_path: String,
    pub arguments: String,
    pub icon_base64: Option<String>,
    pub icon_type: Option<String>,
    pub lnk_path: String,
}

fn is_calculator_descriptor(lower_n: &str, lower_t: &str) -> bool {
    lower_n.contains("calc")
        || lower_n.contains("kalkulator")
        || lower_t.contains("windowscalculator")
        || lower_t.contains("calculatorapp")
        || lower_t.ends_with("\\calc.exe")
        || lower_t == "calc.exe"
}

fn is_vscode_descriptor(lower_n: &str, lower_t: &str) -> bool {
    let has_code_word = |s: &str| {
        s.split(|c: char| !c.is_ascii_alphanumeric())
            .any(|tok| tok == "code")
    };
    lower_n.contains("vscode")
        || lower_n.contains("visual studio code")
        || lower_n.contains("code - insiders")
        || has_code_word(lower_n)
        || lower_t.contains("vscode")
        || lower_t.contains("visual studio code")
        || lower_t.ends_with("\\code.exe")
        || lower_t == "code.exe"
        || lower_t.ends_with("\\code - insiders.exe")
        || lower_t == "code - insiders.exe"
}

fn is_terminal_descriptor(lower_n: &str, lower_t: &str) -> bool {
    lower_n.contains("terminal")
        || lower_t.contains("windowsterminal")
        || lower_t.ends_with("\\cmd.exe")
        || lower_t == "cmd.exe"
        || lower_t.contains("powershell")
        || lower_t.ends_with("\\pwsh.exe")
        || lower_t == "pwsh.exe"
}

fn is_settings_descriptor(lower_n: &str, lower_t: &str) -> bool {
    lower_n.contains("settings")
        || lower_n.contains("pengaturan")
        || lower_n.contains("setelan")
        || lower_t.contains("systemsettings")
}

/// Identifies well-known icon type for vector theme support
pub(crate) fn detect_icon_type(name: &str, target: &str) -> Option<String> {
    let lower_n = name.to_lowercase();
    let lower_t = target.to_lowercase();
    if lower_n.contains("chrome") || lower_t.contains("chrome") {
        Some("browser".into())
    } else if lower_n.contains("brave") || lower_t.contains("brave") {
        Some("brave".into())
    } else if lower_n.contains("explorer") || lower_t.contains("explorer") {
        Some("folder".into())
    } else if is_vscode_descriptor(&lower_n, &lower_t) {
        Some("code".into())
    } else if is_terminal_descriptor(&lower_n, &lower_t) {
        Some("terminal".into())
    } else if is_settings_descriptor(&lower_n, &lower_t) {
        Some("settings".into())
    } else if lower_n.contains("spotify") || lower_t.contains("spotify") {
        Some("spotify".into())
    } else if lower_n.contains("discord") || lower_t.contains("discord") {
        Some("discord".into())
    } else if lower_n.contains("whatsapp") || lower_t.contains("whatsapp") {
        Some("whatsapp".into())
    } else if is_calculator_descriptor(&lower_n, &lower_t) {
        Some("calculator".into())
    } else {
        None
    }
}

/// Normalizes application ID for matching with running window processes
pub(crate) fn detect_app_id(name: &str, target: &str) -> String {
    let lower_n = name.to_lowercase();
    let lower_t = target.to_lowercase();
    if lower_n.contains("chrome") || lower_t.contains("chrome") {
        "chrome".into()
    } else if lower_n.contains("brave") || lower_t.contains("brave") {
        "brave".into()
    } else if lower_n.contains("explorer") || lower_t.contains("explorer") {
        "explorer".into()
    } else if is_vscode_descriptor(&lower_n, &lower_t) {
        "vscode".into()
    } else if is_terminal_descriptor(&lower_n, &lower_t) {
        "terminal".into()
    } else if is_settings_descriptor(&lower_n, &lower_t) {
        "settings".into()
    } else if lower_n.contains("spotify") || lower_t.contains("spotify") {
        "spotify".into()
    } else if lower_n.contains("netflix") || lower_t.contains("netflix") {
        "netflix".into()
    } else if lower_n.contains("discord") || lower_t.contains("discord") {
        "discord".into()
    } else if lower_n.contains("whatsapp") || lower_t.contains("whatsapp") {
        "whatsapp".into()
    } else if is_calculator_descriptor(&lower_n, &lower_t) {
        "calculator".into()
    } else {
        // Avoid treating UWP PackageFamilyName dots (e.g. Microsoft.App_hash) as file extensions.
        let is_file_path = lower_t.contains('\\')
            || lower_t.contains('/')
            || lower_t.ends_with(".exe")
            || lower_t.ends_with(".lnk");
        let base = if is_file_path {
            Path::new(&lower_t)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&lower_n)
        } else if !lower_n.trim().is_empty() {
            lower_n.trim()
        } else {
            lower_t
                .split('_')
                .next()
                .and_then(|prefix| prefix.split('.').last())
                .unwrap_or(&lower_t)
        };
        base.replace(' ', "_")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum TaskbandEntry {
    LnkFileName(String),
    UwpAumid(String),
}

/// Parses HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband ("Favorites" binary)
/// to extract the exact taskbar order of both .lnk shortcuts and UWP / Microsoft Store apps.
fn parse_taskband_favorites() -> Vec<TaskbandEntry> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(key) = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Taskband") else {
        return Vec::new();
    };
    let Ok(raw_val) = key.get_raw_value("Favorites") else {
        return Vec::new();
    };
    let bytes = &raw_val.bytes;
    if bytes.len() < 8 {
        return Vec::new();
    }

    let mut found_with_pos: Vec<(usize, TaskbandEntry)> = Vec::new();

    for parity in [0usize, 1usize] {
        let mut idx = parity;
        let mut current_chars: Vec<u16> = Vec::new();
        let mut start_pos = idx;

        while idx + 1 < bytes.len() {
            let ch = u16::from_le_bytes([bytes[idx], bytes[idx + 1]]);
            let is_printable = (0x20..=0x7E).contains(&ch);
            if is_printable {
                if current_chars.is_empty() {
                    start_pos = idx;
                }
                current_chars.push(ch);
            } else {
                if current_chars.len() >= 5 {
                    let s = String::from_utf16_lossy(&current_chars);
                    classify_taskband_token(start_pos, &s, &mut found_with_pos);
                }
                current_chars.clear();
            }
            idx += 2;
        }
        if current_chars.len() >= 5 {
            let s = String::from_utf16_lossy(&current_chars);
            classify_taskband_token(start_pos, &s, &mut found_with_pos);
        }
    }

    found_with_pos.sort_by_key(|(pos, _)| *pos);

    let pfns_with_full_aumid: std::collections::HashSet<String> = found_with_pos
        .iter()
        .filter_map(|(_, entry)| match entry {
            TaskbandEntry::UwpAumid(aumid) => aumid
                .split_once('!')
                .map(|(pfn, _)| pfn.to_lowercase()),
            _ => None,
        })
        .collect();

    let mut ordered = Vec::new();
    let mut seen_keys = std::collections::HashSet::new();

    for (_, entry) in found_with_pos {
        if let TaskbandEntry::UwpAumid(ref aumid) = entry {
            if !aumid.contains('!') && pfns_with_full_aumid.contains(&aumid.to_lowercase()) {
                continue;
            }
        }
        let dedup_key = match &entry {
            TaskbandEntry::LnkFileName(name) => format!("lnk:{}", name.to_lowercase()),
            TaskbandEntry::UwpAumid(aumid) => format!("uwp:{}", aumid.to_lowercase()),
        };
        if seen_keys.insert(dedup_key) {
            ordered.push(entry);
        }
    }

    ordered
}

fn classify_taskband_token(
    start_pos: usize,
    raw: &str,
    out: &mut Vec<(usize, TaskbandEntry)>,
) {
    let trimmed = raw.trim();
    // 1. Check for .lnk filename
    let lower = trimmed.to_lowercase();
    if let Some(lnk_end) = lower.find(".lnk") {
        let slice = &trimmed[..lnk_end + 4];
        let fname = slice
            .rsplit(|c| c == '\\' || c == '/')
            .next()
            .unwrap_or(slice)
            .trim();
        // Avoid short 8.3 DOS names like GOOGLE~1.LNK when full Unicode name follows right after
        if !fname.contains('~') && fname.len() > 4 {
            out.push((start_pos, TaskbandEntry::LnkFileName(fname.to_string())));
            return;
        }
    }

    // 2. Check for UWP AUMID pattern: <PackageFamilyName>_<PublisherHash>!<AppId>
    // or bare <PackageName>_<PublisherHash> (e.g. hosted Store PWAs in Taskband)
    if trimmed.contains('_') && !trimmed.contains('\\') && !trimmed.contains('/') {
        for token in trimmed.split(|c: char| {
            !c.is_ascii_alphanumeric() && c != '.' && c != '_' && c != '-' && c != '!'
        }) {
            if let Some((pfn, app_id)) = token.split_once('!') {
                if let Some((pkg_name, pub_id)) = pfn.rsplit_once('_') {
                    if !pkg_name.is_empty()
                        && !pkg_name.contains('_')
                        && (10..=16).contains(&pub_id.len())
                        && pub_id.chars().all(|c| c.is_ascii_alphanumeric())
                        && !app_id.is_empty()
                    {
                        out.push((start_pos, TaskbandEntry::UwpAumid(format!("{}!{}", pfn, app_id))));
                        return;
                    }
                }
            } else if let Some((pkg_name, pub_id)) = token.rsplit_once('_') {
                if !pkg_name.is_empty()
                    && !pkg_name.contains('_')
                    && pkg_name.contains('.')
                    && !pkg_name.starts_with('.')
                    && !pkg_name.ends_with('.')
                    && !pkg_name.contains("..")
                    && !pkg_name.chars().all(|c| c.is_ascii_digit() || c == '.')
                    && pub_id.len() == 13
                    && pub_id.chars().all(|c| c.is_ascii_alphanumeric())
                {
                    out.push((start_pos, TaskbandEntry::UwpAumid(token.to_string())));
                    return;
                }
            }
        }
    }
}

fn extract_xml_attr(tag: &str, attr_name: &str) -> Option<String> {
    let lower_tag = tag.to_ascii_lowercase();
    let needle = format!("{}=", attr_name.to_ascii_lowercase());
    let mut search_from = 0;

    while let Some(rel_idx) = lower_tag[search_from..].find(&needle) {
        let idx = search_from + rel_idx;
        let prev_is_ws = idx > 0
            && tag.as_bytes()[idx - 1].is_ascii_whitespace();
        if prev_is_ws {
            let after_eq = tag[idx + needle.len()..].trim_start();
            if let Some(quote) = after_eq.chars().next().filter(|c| *c == '"' || *c == '\'') {
                let value_rest = &after_eq[1..];
                if let Some(end_q) = value_rest.find(quote) {
                    return Some(value_rest[..end_q].trim().to_string());
                }
            }
        }
        search_from = idx + needle.len();
    }
    None
}

fn parse_appx_manifest_xml(
    xml: &str,
    preferred_app_id: Option<&str>,
    preferred_exe_name: Option<&str>,
) -> Option<(String, Option<String>, bool)> {
    let lower_xml = xml.to_ascii_lowercase();
    let mut entries: Vec<(String, Option<String>, bool)> = Vec::new();
    let mut cursor = 0;

    while let Some(rel) = lower_xml[cursor..].find("<application") {
        let start = cursor + rel;
        let after_name = start + "<application".len();
        let Some(&next_byte) = xml.as_bytes().get(after_name) else {
            break;
        };
        if !next_byte.is_ascii_whitespace() {
            cursor = after_name;
            continue;
        }

        let mut in_quote: Option<u8> = None;
        let mut tag_end = None;
        for (off, &b) in xml.as_bytes()[after_name..].iter().enumerate() {
            match in_quote {
                Some(q) if b == q => in_quote = None,
                Some(_) => {}
                None if b == b'"' || b == b'\'' => in_quote = Some(b),
                None if b == b'>' => {
                    tag_end = Some(after_name + off + 1);
                    break;
                }
                None => {}
            }
        }
        let Some(end_idx) = tag_end else {
            break;
        };
        let tag = &xml[start..end_idx];
        cursor = end_idx;

        let Some(app_id) = extract_xml_attr(tag, "Id").filter(|s| !s.is_empty()) else {
            continue;
        };
        let executable = extract_xml_attr(tag, "Executable").filter(|s| !s.is_empty());
        let entry_point = extract_xml_attr(tag, "EntryPoint");
        let lower_tag = tag.to_ascii_lowercase();
        let is_full_trust = entry_point
            .as_deref()
            .is_some_and(|e| e.eq_ignore_ascii_case("Windows.FullTrustApplication"))
            || lower_tag.contains("trustlevel=\"mediumil\"")
            || lower_tag.contains("runtimebehavior=\"win32app\"");

        entries.push((app_id, executable, is_full_trust));
    }

    if entries.is_empty() {
        return None;
    }

    if let Some(pref_id) = preferred_app_id.map(str::trim).filter(|s| !s.is_empty()) {
        if let Some(matched) = entries
            .iter()
            .find(|(id, _, _)| id.eq_ignore_ascii_case(pref_id))
        {
            return Some(matched.clone());
        }
    }

    if let Some(pref_exe) = preferred_exe_name.map(str::trim).filter(|s| !s.is_empty()) {
        if let Some(matched) = entries.iter().find(|(_, exe_opt, _)| {
            exe_opt
                .as_deref()
                .and_then(|e| e.rsplit(|c| c == '\\' || c == '/').next())
                .is_some_and(|fname| fname.eq_ignore_ascii_case(pref_exe))
        }) {
            return Some(matched.clone());
        }
    }

    entries.into_iter().next()
}

pub(crate) fn parse_appx_manifest_app_info(
    package_root: &Path,
    preferred_app_id: Option<&str>,
    preferred_exe_name: Option<&str>,
) -> Option<(String, Option<String>, bool)> {
    let manifest_path = package_root.join("AppxManifest.xml");
    let xml = std::fs::read_to_string(manifest_path).ok()?;
    let (app_id, exe_rel, is_full_trust) =
        parse_appx_manifest_xml(&xml, preferred_app_id, preferred_exe_name)?;
    let resolved_exe = exe_rel.and_then(|rel| {
        let full = package_root.join(rel);
        full.is_file().then(|| full.to_string_lossy().to_string())
    });
    Some((app_id, resolved_exe, is_full_trust))
}

/// Resolves a UWP AppUserModelId (e.g. "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify")
/// into a WindowsPinnedApp with its high-res 256x256 PNG asset and shell:AppsFolder launch path.
fn resolve_uwp_pinned_app(aumid: &str) -> Option<WindowsPinnedApp> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let (pfn, app_suffix) = aumid.split_once('!').unwrap_or((aumid, ""));
    let (pkg_prefix, publisher_id) = pfn.rsplit_once('_')?;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let pkgs_path = "Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages";
    let mut package_root = String::new();
    let mut display_name = String::new();

    if let Ok(pkgs_key) = hkcu.open_subkey(pkgs_path) {
        let prefix_match = format!("{}_", pkg_prefix.to_lowercase());
        let suffix_match = format!("__{}", publisher_id.to_lowercase());

        for sub_name in pkgs_key.enum_keys().flatten() {
            let sub_lower = sub_name.to_lowercase();
            if sub_lower.starts_with(&prefix_match) && sub_lower.ends_with(&suffix_match) {
                if let Ok(sub_key) = pkgs_key.open_subkey(&sub_name) {
                    if let Ok(root) = sub_key.get_value::<String, _>("PackageRootFolder") {
                        package_root = root;
                    }
                    if let Ok(dn) = sub_key.get_value::<String, _>("DisplayName") {
                        let dn_lower = dn.to_lowercase();
                        if !dn.starts_with("@{")
                            && !dn_lower.starts_with("ms-resource:")
                            && !dn_lower.contains("ms-resource")
                        {
                            display_name = dn;
                        }
                    }
                    break;
                }
            }
        }
    }

    let manifest_info = (!package_root.is_empty()).then(|| {
        parse_appx_manifest_app_info(
            Path::new(&package_root),
            (!app_suffix.is_empty()).then_some(app_suffix),
            None,
        )
    }).flatten();

    let resolved_app_id = manifest_info
        .as_ref()
        .map(|(id, _, _)| id.clone())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            if app_suffix.is_empty() {
                "App".to_string()
            } else {
                app_suffix.to_string()
            }
        });
    let full_aumid = format!("{}!{}", pfn, resolved_app_id);

    let friendly_name = if !display_name.is_empty() {
        display_name
    } else {
        let lower_pfn = pfn.to_lowercase();
        if lower_pfn.contains("spotify") {
            "Spotify".to_string()
        } else if lower_pfn.contains("netflix") {
            "Netflix".to_string()
        } else if lower_pfn.contains("whatsapp") {
            "WhatsApp".to_string()
        } else if lower_pfn.contains("windowsterminal") {
            "Terminal".to_string()
        } else if lower_pfn.contains("calculator") {
            "Calculator".to_string()
        } else if lower_pfn.contains("windowsnotepad") {
            "Notepad".to_string()
        } else if lower_pfn.contains("windowsstore") {
            "Microsoft Store".to_string()
        } else if lower_pfn.contains("windowsalarms") {
            "Clock".to_string()
        } else if lower_pfn.contains("screensketch") {
            "Snipping Tool".to_string()
        } else if lower_pfn.contains("zunemusic") {
            "Media Player".to_string()
        } else if lower_pfn.contains("windows.photos") {
            "Photos".to_string()
        } else if lower_pfn.contains("mspaint") || lower_pfn.contains("microsoft.paint") {
            "Paint".to_string()
        } else {
            pkg_prefix
                .split('.')
                .last()
                .filter(|s| !s.is_empty())
                .unwrap_or(&resolved_app_id)
                .to_string()
        }
    };

    let target_path = manifest_info
        .and_then(|(_, exe_opt, _)| exe_opt)
        .unwrap_or_else(|| package_root.clone());
    let detect_hint = if target_path.to_lowercase().ends_with(".exe") {
        target_path.as_str()
    } else {
        pfn
    };
    let id = detect_app_id(&friendly_name, detect_hint);
    let icon_type = detect_icon_type(&friendly_name, detect_hint);
    let shell_launch = format!("shell:AppsFolder\\{}", full_aumid);

    let icon_base64 = if !package_root.is_empty() {
        let exe_for_icon = if target_path.to_lowercase().ends_with(".exe") {
            PathBuf::from(&target_path)
        } else {
            Path::new(&package_root).join("app.exe")
        };
        get_cached_or_extract_icon(&exe_for_icon.to_string_lossy())
            .or_else(|| get_cached_or_extract_icon(&package_root))
    } else {
        None
    };

    Some(WindowsPinnedApp {
        id,
        name: friendly_name,
        target_path,
        arguments: String::new(),
        icon_base64,
        icon_type,
        lnk_path: shell_launch,
    })
}

/// Attempts to read a lossless 256x256 PNG asset directly from a UWP / MSIX package directory
fn extract_uwp_package_png(exe_path: &str) -> Option<String> {
    let path_obj = Path::new(exe_path);
    let mut candidate_roots = Vec::new();
    let mut curr = path_obj.parent();
    for _ in 0..3 {
        if let Some(dir) = curr {
            let dir_name = dir
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_lowercase();
            if dir_name == "windowsapps"
                || dir_name == "systemapps"
                || dir_name == "windows"
                || dir_name == "program files"
                || dir_name == "system32"
            {
                break;
            }
            candidate_roots.push(dir.to_path_buf());
            curr = dir.parent();
        } else {
            break;
        }
    }

    let mut best_file: Option<(i32, PathBuf)> = None;

    for root in candidate_roots {
        let subdirs = [
            root.join("Assets"),
            root.join("assets"),
            root.join("Images"),
            root.join("images"),
            root.clone(),
        ];

        for subdir in subdirs {
            let Ok(entries) = std::fs::read_dir(&subdir) else {
                continue;
            };
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.eq_ignore_ascii_case("png"))
                    != Some(true)
                {
                    continue;
                }
                let fname = p
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                // Skip high-contrast, wide tiles, splash screens, or badges
                if fname.contains("contrast-")
                    || fname.contains("splashscreen")
                    || fname.contains("wide")
                    || fname.contains("badge")
                    || fname.contains("large")
                {
                    continue;
                }

                let is_app_logo = fname.contains("applist")
                    || fname.contains("square44x44")
                    || fname.starts_with("logo.")
                    || fname.contains("storelogo");
                if !is_app_logo {
                    continue;
                }

                let mut score = 10;
                if fname.contains("targetsize-64")
                    || fname.contains("targetsize-72")
                    || fname.contains("targetsize-80")
                    || fname.contains("targetsize-96")
                {
                    score += 550;
                } else if fname.contains("targetsize-48") || fname.contains("targetsize-60") {
                    score += 450;
                } else if fname.contains("scale-200") {
                    score += 350;
                } else if fname.contains("targetsize-256") {
                    score += 200;
                } else if fname.contains("scale-400") {
                    score += 180;
                }

                if fname.contains("altform-unplated") {
                    score += 80;
                } else if fname.contains("lightunplated") {
                    score += 40;
                }

                if best_file.as_ref().map_or(true, |(best_s, _)| score > *best_s) {
                    best_file = Some((score, p));
                }
            }
        }
    }

    let (_, winning_path) = best_file?;
    let bytes = std::fs::read(winning_path).ok()?;
    if let Ok(decoded) = image::load_from_memory(&bytes) {
        if decoded.width() > 64 || decoded.height() > 64 {
            if let Some(resized) = encode_rgba_icon_base64(&decoded.to_rgba8()) {
                return Some(resized);
            }
        }
    }
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:image/png;base64,{}", b64))
}

fn encode_rgba_icon_base64(img: &image::RgbaImage) -> Option<String> {
    let resized_owned;
    let target = if img.width() > 64 || img.height() > 64 {
        resized_owned =
            image::imageops::resize(img, 64, 64, image::imageops::FilterType::Triangle);
        &resized_owned
    } else {
        img
    };
    let mut png_bytes = std::io::Cursor::new(Vec::new());
    if target
        .write_to(&mut png_bytes, image::ImageFormat::Png)
        .is_err()
    {
        return None;
    }
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(png_bytes.into_inner());
    Some(format!("data:image/png;base64,{}", b64))
}

unsafe fn read_32bit_hbitmap_rgba(
    hbm: HBITMAP,
    require_32bpp: bool,
    unpremultiply_pargb: bool,
) -> Option<(u32, u32, Vec<u8>)> {
    if hbm.is_invalid() {
        return None;
    }

    let mut bmp = BITMAP::default();
    if GetObjectW(
        HGDIOBJ(hbm.0),
        std::mem::size_of::<BITMAP>() as i32,
        Some(&mut bmp as *mut _ as *mut _),
    ) <= 0
    {
        return None;
    }

    let native_w = bmp.bmWidth;
    let native_h = bmp.bmHeight;
    if native_w <= 0 || native_h <= 0 {
        return None;
    }
    if require_32bpp && bmp.bmBitsPixel != 32 {
        return None;
    }

    let hdc_screen = GetDC(HWND(std::ptr::null_mut()));
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: native_w,
            biHeight: -native_h,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };

    let mut raw_buf = vec![0u8; (native_w * native_h * 4) as usize];
    let lines = GetDIBits(
        hdc_screen,
        hbm,
        0,
        native_h as u32,
        Some(raw_buf.as_mut_ptr() as *mut _),
        &mut bmi,
        DIB_RGB_COLORS,
    );
    let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);

    if lines <= 0 {
        return None;
    }

    let mut max_alpha = 0u8;
    let mut max_x = 0i32;
    let mut max_y = 0i32;
    let mut has_exceeding_rgb = false;
    let mut has_partial_alpha = false;

    for y in 0..native_h {
        for x in 0..native_w {
            let idx = ((y * native_w + x) * 4) as usize;
            let b = raw_buf[idx];
            let g = raw_buf[idx + 1];
            let r = raw_buf[idx + 2];
            let a = raw_buf[idx + 3];
            raw_buf[idx] = r;
            raw_buf[idx + 2] = b;
            if a > max_alpha {
                max_alpha = a;
            }
            if r > a || g > a || b > a {
                has_exceeding_rgb = true;
            } else if a > 0 && a < 255 {
                has_partial_alpha = true;
            }
            if a > 8 {
                if x > max_x {
                    max_x = x;
                }
                if y > max_y {
                    max_y = y;
                }
            }
        }
    }

    if max_alpha == 0 {
        return None;
    }

    if unpremultiply_pargb && !has_exceeding_rgb && has_partial_alpha {
        for px in raw_buf.chunks_exact_mut(4) {
            let a = px[3];
            if a > 0 && a < 255 {
                let a16 = a as u16;
                px[0] = (((px[0] as u16) * 255 + (a16 / 2)) / a16).min(255) as u8;
                px[1] = (((px[1] as u16) * 255 + (a16 / 2)) / a16).min(255) as u8;
                px[2] = (((px[2] as u16) * 255 + (a16 / 2)) / a16).min(255) as u8;
            }
        }
    }

    // If SHIL_JUMBO (256x256) placed a legacy 48x48 icon in the top-left corner,
    // crop to that active quadrant so the icon isn't tiny in a 256x256 canvas.
    if native_w == 256 && native_h == 256 && max_x < 64 && max_y < 64 && max_x >= 15 {
        let crop_size = if max_x <= 32 && max_y <= 32 { 32i32 } else { 48i32 };
        let mut cropped = vec![0u8; (crop_size * crop_size * 4) as usize];
        for cy in 0..crop_size {
            let src_start = ((cy * native_w) * 4) as usize;
            let dst_start = ((cy * crop_size) * 4) as usize;
            let row_bytes = (crop_size * 4) as usize;
            cropped[dst_start..dst_start + row_bytes]
                .copy_from_slice(&raw_buf[src_start..src_start + row_bytes]);
        }
        return Some((crop_size as u32, crop_size as u32, cropped));
    }

    Some((native_w as u32, native_h as u32, raw_buf))
}

/// Converts a 32-bit HBITMAP (e.g. from IShellItemImageFactory) to a 64x64 PNG data URL.
pub(crate) unsafe fn hbitmap_to_base64(hbm: HBITMAP) -> Option<String> {
    let (w, h, rgba) = read_32bit_hbitmap_rgba(hbm, false, true)?;
    let img = image::RgbaImage::from_raw(w, h, rgba)?;
    encode_rgba_icon_base64(&img)
}

/// Converts an HICON to a crystal-clear native-resolution (up to 256x256) base64 PNG data URL.
/// Reads raw 32-bit BGRA pixels directly from ICONINFO.hbmColor to avoid GDI nearest-neighbor stretching.
pub unsafe fn hicon_to_base64(hicon: HICON) -> Option<String> {
    if hicon.is_invalid() {
        return None;
    }

    let mut icon_info = ICONINFO::default();
    let mut native_w = 48i32;
    let mut native_h = 48i32;
    let mut direct_rgba: Option<(u32, u32, Vec<u8>)> = None;

    if GetIconInfo(hicon, &mut icon_info).is_ok() {
        if !icon_info.hbmColor.is_invalid() {
            if let Some((w, h, rgba)) = read_32bit_hbitmap_rgba(icon_info.hbmColor, true, false) {
                native_w = w as i32;
                native_h = h as i32;
                direct_rgba = Some((w, h, rgba));
            }
            let _ = DeleteObject(icon_info.hbmColor);
        }
        if !icon_info.hbmMask.is_invalid() {
            let _ = DeleteObject(icon_info.hbmMask);
        }
    }

    let (final_w, final_h, buffer) = if let Some(rgba_tuple) = direct_rgba {
        rgba_tuple
    } else {
        let width = native_w.clamp(32, 256);
        let height = native_h.clamp(32, 256);

        let hdc_screen = GetDC(HWND(std::ptr::null_mut()));
        let hdc_mem = CreateCompatibleDC(hdc_screen);

        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
        let hbm = CreateDIBSection(hdc_mem, &bmi, DIB_RGB_COLORS, &mut bits, None, 0).ok()?;
        let old_bm = SelectObject(hdc_mem, hbm);

        let _ = DrawIconEx(hdc_mem, 0, 0, hicon, width, height, 0, None, DI_NORMAL);

        let mut buf = vec![0u8; (width * height * 4) as usize];
        if !bits.is_null() {
            std::ptr::copy_nonoverlapping(bits as *const u8, buf.as_mut_ptr(), buf.len());
        }

        let _ = SelectObject(hdc_mem, old_bm);
        let _ = DeleteObject(hbm);
        let _ = DeleteDC(hdc_mem);
        let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);

        for pixel in buf.chunks_exact_mut(4) {
            let b = pixel[0];
            let r = pixel[2];
            pixel[0] = r;
            pixel[2] = b;
        }
        (width as u32, height as u32, buf)
    };

    let img = image::RgbaImage::from_raw(final_w, final_h, buffer)?;
    encode_rgba_icon_base64(&img)
}

/// Extracts native 64x64 (or 48x48 fallback) icon from file / executable / shortcut on disk
pub unsafe fn extract_native_icon_from_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }

    // 1. Check for lossless UWP / MSIX package PNG assets first (WhatsApp, Windows Settings, Store apps)
    if let Some(uwp_png) = extract_uwp_package_png(path) {
        return Some(uwp_png);
    }

    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let lower_path = path.to_lowercase();
    let is_lnk = lower_path.ends_with(".lnk");
    let is_explorer = lower_path.ends_with("explorer.exe");

    // 2. For direct executables/icons (except explorer.exe whose index 0 is legacy),
    // try PrivateExtractIconsW at 64x64 to avoid retaining 256x256 textures.
    if !is_lnk && !is_explorer && Path::new(path).exists() {
        let mut hicon = HICON::default();
        let mut icon_id = 0u32;
        let extracted = PrivateExtractIconsW(
            wide.as_ptr(),
            0,
            64,
            64,
            &mut hicon,
            &mut icon_id,
            1,
            0,
        );
        if extracted > 0 && !hicon.is_invalid() {
            let b64 = hicon_to_base64(hicon);
            let _ = DestroyIcon(hicon);
            if b64.is_some() {
                return b64;
            }
        }
    }

    // 3. Query system image list index via SHGetFileInfoW(SHGFI_SYSICONINDEX)
    let mut shfi = SHFILEINFOW::default();
    let res = SHGetFileInfoW(
        PCWSTR(wide.as_ptr()),
        windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES(0),
        Some(&mut shfi),
        std::mem::size_of::<SHFILEINFOW>() as u32,
        SHGFI_SYSICONINDEX,
    );

    // Note: iIcon == 2 is the generic blank executable icon in Windows Shell
    if res != 0 && shfi.iIcon > 0 && shfi.iIcon != 2 {
        let iid_imagelist = windows::core::GUID::from_u128(0x46eb5926_582e_4017_9fdf_e8998daa0950);
        // Prefer SHIL_EXTRALARGE (2 = 48x48), fall back to SHIL_JUMBO (4 = 256x256, downscaled to 64x64)
        for shil in [2i32, 4i32] {
            let mut himl: *mut std::ffi::c_void = std::ptr::null_mut();
            if SHGetImageList(shil, &iid_imagelist, &mut himl) == 0 && !himl.is_null() {
                let hicon = ImageList_GetIcon(himl, shfi.iIcon, 0x00000001 /* ILD_TRANSPARENT */);
                if !hicon.is_invalid() {
                    let b64 = hicon_to_base64(hicon);
                    let _ = DestroyIcon(hicon);
                    if b64.is_some() {
                        return b64;
                    }
                }
            }
        }
    }

    // 4. Final fallback: standard SHGFI_ICON | SHGFI_LARGEICON
    let mut shfi_fallback = SHFILEINFOW::default();
    let res_fb = SHGetFileInfoW(
        PCWSTR(wide.as_ptr()),
        windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES(0),
        Some(&mut shfi_fallback),
        std::mem::size_of::<SHFILEINFOW>() as u32,
        SHGFI_ICON | SHGFI_LARGEICON,
    );

    if res_fb != 0 && !shfi_fallback.hIcon.is_invalid() && shfi_fallback.iIcon != 2 {
        let b64 = hicon_to_base64(shfi_fallback.hIcon);
        let _ = DestroyIcon(shfi_fallback.hIcon);
        b64
    } else {
        None
    }
}

const MAX_PINNED_ICON_CACHE_ENTRIES: usize = 512;

struct BoundedPinnedIconCache {
    map: HashMap<String, Option<String>>,
    order: VecDeque<String>,
}

impl BoundedPinnedIconCache {
    fn new() -> Self {
        Self {
            map: HashMap::new(),
            order: VecDeque::new(),
        }
    }

    fn get(&self, key: &str) -> Option<&Option<String>> {
        self.map.get(key)
    }

    fn insert(&mut self, key: String, val: Option<String>) {
        if !self.map.contains_key(&key) {
            while self.order.len() >= MAX_PINNED_ICON_CACHE_ENTRIES {
                if let Some(oldest) = self.order.pop_front() {
                    self.map.remove(&oldest);
                } else {
                    break;
                }
            }
            self.order.push_back(key.clone());
        }
        self.map.insert(key, val);
    }
}

static ICON_CACHE: OnceLock<Mutex<BoundedPinnedIconCache>> = OnceLock::new();

/// Returns an already-cached icon without performing disk/GDI extraction.
pub(crate) fn get_cached_icon_only(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    let cache = ICON_CACHE.get_or_init(|| Mutex::new(BoundedPinnedIconCache::new()));
    cache.lock().ok()?.get(path).and_then(|v| v.clone())
}

/// Inserts a pre-extracted icon into the shared icon cache.
pub(crate) fn insert_cached_icon(key: &str, b64: String) {
    if key.is_empty() {
        return;
    }
    let cache = ICON_CACHE.get_or_init(|| Mutex::new(BoundedPinnedIconCache::new()));
    if let Ok(mut guard) = cache.lock() {
        guard.insert(key.to_string(), Some(b64));
    }
}

/// Cached helper to avoid redundant icon extraction (including negative hits) on fast polling cycles
pub fn get_cached_or_extract_icon(path: &str) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    let cache = ICON_CACHE.get_or_init(|| Mutex::new(BoundedPinnedIconCache::new()));
    if let Ok(guard) = cache.lock() {
        if let Some(cached) = guard.get(path) {
            return cached.clone();
        }
    }
    let extracted = unsafe { extract_native_icon_from_path(path) };
    if let Ok(mut guard) = cache.lock() {
        guard.insert(path.to_string(), extracted.clone());
    }
    extracted
}

/// Fallback extractor that reads HICON directly from a running window HWND
pub unsafe fn extract_native_icon_from_hwnd(hwnd: HWND) -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassLongPtrW, SendMessageW, GCLP_HICON, ICON_BIG, ICON_SMALL2, WM_GETICON,
    };
    use windows::Win32::Foundation::{LPARAM, WPARAM};

    let res_big = SendMessageW(hwnd, WM_GETICON, WPARAM(ICON_BIG as usize), LPARAM(0));
    if res_big.0 != 0 {
        let hicon = HICON(res_big.0 as *mut _);
        if let Some(b64) = hicon_to_base64(hicon) {
            let _ = DestroyIcon(hicon);
            return Some(b64);
        }
    }

    let res_small = SendMessageW(hwnd, WM_GETICON, WPARAM(ICON_SMALL2 as usize), LPARAM(0));
    if res_small.0 != 0 {
        let hicon = HICON(res_small.0 as *mut _);
        if let Some(b64) = hicon_to_base64(hicon) {
            let _ = DestroyIcon(hicon);
            return Some(b64);
        }
    }

    let class_icon = GetClassLongPtrW(hwnd, GCLP_HICON);
    if class_icon != 0 {
        let hicon = HICON(class_icon as *mut _);
        if let Some(b64) = hicon_to_base64(hicon) {
            return Some(b64);
        }
    }

    None
}

/// Resolves a single .lnk file to WindowsPinnedApp with native icon
pub(crate) fn resolve_shortcut(lnk_path: &Path) -> Option<WindowsPinnedApp> {
    resolve_shortcut_with_options(lnk_path, true)
}

/// Resolves a single .lnk file to WindowsPinnedApp, optionally skipping slow GDI/disk icon extraction.
pub(crate) fn resolve_shortcut_with_options(
    lnk_path: &Path,
    extract_icon: bool,
) -> Option<WindowsPinnedApp> {
    let _com = crate::ComGuard::init(COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    unsafe {
        let shell_link: IShellLinkW =
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let persist_file: IPersistFile = shell_link.cast().ok()?;

        let wide_path: Vec<u16> = lnk_path
            .to_string_lossy()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        if persist_file
            .Load(PCWSTR(wide_path.as_ptr()), STGM_READ)
            .is_err()
        {
            return None;
        }

        let mut target_buf = [0u16; MAX_PATH as usize];
        let _ = shell_link.GetPath(&mut target_buf, std::ptr::null_mut(), 0);
        let mut target_path = String::from_utf16_lossy(&target_buf)
            .trim_matches('\0')
            .to_string();

        let mut args_buf = [0u16; 1024];
        let _ = shell_link.GetArguments(&mut args_buf);
        let arguments = String::from_utf16_lossy(&args_buf)
            .trim_matches('\0')
            .to_string();

        let name = lnk_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("App")
            .to_string();

        let icon_type = detect_icon_type(&name, &target_path);
        let id = detect_app_id(&name, &target_path);

        // Fallback for explorer if target path is empty in shell link
        if (id == "explorer" || name.to_lowercase().contains("explorer")) && target_path.is_empty() {
            target_path = "C:\\Windows\\explorer.exe".to_string();
        }

        let lnk_str = lnk_path.to_string_lossy().to_string();
        let icon_lookup = |path: &str| {
            if extract_icon {
                get_cached_or_extract_icon(path)
            } else {
                get_cached_icon_only(path)
            }
        };

        // For File Explorer shortcut, extract from .lnk first so Windows 11 modern folder icon is used
        let icon_base64 = if id == "explorer" {
            icon_lookup(&lnk_str).or_else(|| icon_lookup(&target_path))
        } else if !target_path.is_empty() && Path::new(&target_path).exists() {
            icon_lookup(&target_path).or_else(|| icon_lookup(&lnk_str))
        } else {
            icon_lookup(&lnk_str)
        };

        Some(WindowsPinnedApp {
            id,
            name,
            target_path,
            arguments,
            icon_base64,
            icon_type,
            lnk_path: lnk_str,
        })
    }
}

struct PinnedAppsCache {
    dir_mtime: Option<SystemTime>,
    taskband_write_time: Option<u64>,
    apps: Vec<WindowsPinnedApp>,
}

static PINNED_APPS_CACHE: OnceLock<Mutex<Option<PinnedAppsCache>>> = OnceLock::new();

fn get_taskband_last_write_time() -> Option<u64> {
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryInfoKeyW, HKEY, HKEY_CURRENT_USER, KEY_READ,
    };
    unsafe {
        let mut hkey = HKEY::default();
        let open_err = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Taskband"),
            0,
            KEY_READ,
            &mut hkey,
        );
        if open_err != ERROR_SUCCESS {
            return None;
        }
        let mut ft = FILETIME::default();
        let query_err = RegQueryInfoKeyW(
            hkey,
            PWSTR::null(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(&mut ft),
        );
        let _ = RegCloseKey(hkey);
        if query_err == ERROR_SUCCESS {
            Some(((ft.dwHighDateTime as u64) << 32) | (ft.dwLowDateTime as u64))
        } else {
            None
        }
    }
}

fn pinned_apps_dir_and_fingerprint() -> Option<(PathBuf, Option<SystemTime>, Option<u64>)> {
    let appdata = std::env::var("APPDATA").ok()?;
    let pinned_dir = PathBuf::from(appdata)
        .join("Microsoft")
        .join("Internet Explorer")
        .join("Quick Launch")
        .join("User Pinned")
        .join("TaskBar");
    let dir_mtime = std::fs::metadata(&pinned_dir).and_then(|m| m.modified()).ok();
    let taskband_write_time = get_taskband_last_write_time();
    Some((pinned_dir, dir_mtime, taskband_write_time))
}

fn has_pinned_apps_source_changed(
    last_state: &mut Option<(Option<SystemTime>, Option<u64>)>,
) -> bool {
    let Some((_, dir_mtime, taskband_write_time)) = pinned_apps_dir_and_fingerprint() else {
        return false;
    };
    let next = (dir_mtime, taskband_write_time);
    if last_state.as_ref() == Some(&next) {
        return false;
    }
    *last_state = Some(next);
    true
}

/// Retrieves list of pinned apps from Windows Taskbar in exact user order
/// (combines HKCU\...\Explorer\Taskband Favorites order + UWP apps + User Pinned\TaskBar .lnk files)
pub fn get_taskbar_pinned_apps() -> Vec<WindowsPinnedApp> {
    let Some((pinned_dir, dir_mtime, taskband_write_time)) = pinned_apps_dir_and_fingerprint() else {
        return Vec::new();
    };

    let cache_mutex = PINNED_APPS_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache_mutex.lock() {
        if let Some(cached) = guard.as_ref() {
            if cached.dir_mtime == dir_mtime && cached.taskband_write_time == taskband_write_time {
                return cached.apps.clone();
            }
        }
    }

    let mut lnk_map: HashMap<String, PathBuf> = HashMap::new();
    if pinned_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&pinned_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("lnk")) == Some(true) {
                    if let Some(fname) = path.file_name().and_then(|n| n.to_str()) {
                        lnk_map.insert(fname.to_lowercase(), path);
                    }
                }
            }
        }
    }

    let mut apps = Vec::new();
    let mut used_ids = std::collections::HashSet::new();

    // 1. Follow exact order from Windows Taskband registry Favorites
    for item in parse_taskband_favorites() {
        match item {
            TaskbandEntry::LnkFileName(fname) => {
                let key = fname.to_lowercase();
                if let Some(path) = lnk_map.remove(&key) {
                    if let Some(app) = resolve_shortcut(&path) {
                        if used_ids.insert(app.id.clone()) {
                            apps.push(app);
                        }
                    }
                }
            }
            TaskbandEntry::UwpAumid(aumid) => {
                if let Some(app) = resolve_uwp_pinned_app(&aumid) {
                    if used_ids.insert(app.id.clone()) {
                        apps.push(app);
                    }
                }
            }
        }
    }

    // 2. Append any remaining .lnk files in User Pinned\TaskBar not listed in Taskband binary
    let mut remaining: Vec<PathBuf> = lnk_map.into_values().collect();
    remaining.sort();
    for path in remaining {
        if let Some(app) = resolve_shortcut(&path) {
            if used_ids.insert(app.id.clone()) {
                apps.push(app);
            }
        }
    }

    if let Ok(mut guard) = cache_mutex.lock() {
        *guard = Some(PinnedAppsCache {
            dir_mtime,
            taskband_write_time,
            apps: apps.clone(),
        });
    }

    apps
}

static WATCHER_RUNNING: AtomicBool = AtomicBool::new(false);

/// Starts background watcher thread to auto-sync Windows Taskbar pinned apps to frontend
pub fn start_pinned_apps_watcher(app_handle: AppHandle) {
    if WATCHER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(move || {
        let mut last_apps: Vec<WindowsPinnedApp> = Vec::new();
        let mut last_source_state: Option<(Option<SystemTime>, Option<u64>)> = None;

        loop {
            std::thread::sleep(Duration::from_millis(1500));

            if !has_pinned_apps_source_changed(&mut last_source_state) {
                continue;
            }

            let current_apps = get_taskbar_pinned_apps();
            if current_apps != last_apps {
                last_apps = current_apps.clone();
                let _ = app_handle.emit("gili://windows-pinned-apps-updated", &current_apps);
            }
        }
    });
}

#[tauri::command]
pub fn get_windows_pinned_apps() -> Vec<WindowsPinnedApp> {
    get_taskbar_pinned_apps()
}

#[tauri::command]
pub async fn launch_pinned_app(
    lnk_path: String,
    target_path: String,
    arguments: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        launch_pinned_app_sync(lnk_path, target_path, arguments)
    })
    .await
    .map_err(|e| format!("Launch task failed: {e}"))?
}

fn is_valid_aumid_chars(trimmed: &str) -> bool {
    !trimmed.is_empty()
        && !trimmed.contains("..")
        && trimmed.chars().all(|c| {
            c.is_alphanumeric()
                || matches!(
                    c,
                    '.' | '_' | '-' | '!' | ' ' | '{' | '}' | '\\' | ':' | '(' | ')' | '&' | ',' | '+' | '@'
                )
        })
}

pub(crate) fn is_safe_url_target(raw: &str) -> bool {
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.starts_with("\\\\")
        || trimmed.chars().any(|c| c.is_control())
    {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    const BLOCKED_SCHEMES: &[&str] = &[
        "ms-msdt:",
        "search-ms:",
        "javascript:",
        "vbscript:",
        "jscript:",
        "file:",
        "data:",
        "blob:",
    ];
    if BLOCKED_SCHEMES.iter().any(|s| lower.starts_with(s)) {
        return false;
    }
    lower.starts_with("https://")
        || lower.starts_with("http://")
        || lower.starts_with("ms-settings:")
        || lower.starts_with("ms-windows-store:")
        || lower.starts_with("mailto:")
        || lower.starts_with("shell:appsfolder\\")
        || trimmed
            .split_once(':')
            .is_some_and(|(scheme, rest)| {
                !scheme.is_empty()
                    && scheme.len() <= 32
                    && scheme
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
                    && rest.starts_with("//")
            })
}

fn is_allowed_shortcut_or_exe_path(raw: &str, allow_url_scheme: bool) -> bool {
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.starts_with("\\\\")
        || trimmed.chars().any(|c| c.is_control())
    {
        return false;
    }
    if trimmed.to_ascii_lowercase().starts_with("shell:appsfolder\\") {
        let aumid = &trimmed["shell:AppsFolder\\".len()..];
        return is_valid_aumid_chars(aumid);
    }
    let path = Path::new(trimmed);
    if path.is_file() {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        return matches!(ext.as_str(), "lnk" | "url" | "exe");
    }
    allow_url_scheme && is_safe_url_target(trimmed)
}

fn parse_cli_arguments(raw: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut token_started = false;
    let mut chars = raw.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' => {
                in_quotes = !in_quotes;
                token_started = true;
            }
            '\\' if chars.peek() == Some(&'"') => {
                if let Some(q) = chars.next() {
                    current.push(q);
                    token_started = true;
                }
            }
            c if c.is_whitespace() && !in_quotes => {
                if token_started {
                    args.push(std::mem::take(&mut current));
                    token_started = false;
                }
            }
            c => {
                current.push(c);
                token_started = true;
            }
        }
    }
    if token_started {
        args.push(current);
    }
    args
}

pub(crate) fn activate_aumid(aumid: &str) -> bool {
    let trimmed = aumid.trim();
    if !is_valid_aumid_chars(trimmed) {
        return false;
    }
    let _com = crate::ComGuard::init(COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    unsafe {
        let _ = AllowSetForegroundWindow(ASFW_ANY);
        let Ok(mgr) = CoCreateInstance::<_, IApplicationActivationManager>(
            &ApplicationActivationManager,
            None,
            CLSCTX_ALL,
        ) else {
            return false;
        };
        let app_id = HSTRING::from(trimmed);
        mgr.ActivateApplication(&app_id, PCWSTR::null(), AO_NONE)
            .is_ok()
    }
}

pub(crate) fn shell_execute_open(target: &str, args: &str, working_dir: Option<&str>) -> bool {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return false;
    }
    let _com = crate::ComGuard::init(COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    let op_wide: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();
    let target_wide: Vec<u16> = trimmed.encode_utf16().chain(std::iter::once(0)).collect();
    let args_wide: Vec<u16> = args.encode_utf16().chain(std::iter::once(0)).collect();
    let dir_wide: Option<Vec<u16>> = working_dir
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.encode_utf16().chain(std::iter::once(0)).collect());
    let args_ptr = if args.trim().is_empty() {
        PCWSTR::null()
    } else {
        PCWSTR(args_wide.as_ptr())
    };
    let dir_ptr = match dir_wide.as_ref() {
        Some(d) => PCWSTR(d.as_ptr()),
        None => PCWSTR::null(),
    };
    unsafe {
        let _ = AllowSetForegroundWindow(ASFW_ANY);
        let hinstance = ShellExecuteW(
            HWND(std::ptr::null_mut()),
            PCWSTR(op_wide.as_ptr()),
            PCWSTR(target_wide.as_ptr()),
            args_ptr,
            dir_ptr,
            SW_SHOWNORMAL,
        );
        hinstance.0 as usize > 32
    }
}

pub(crate) fn resolve_protocol_for_app(app_name: &str, aumid: &str) -> Option<&'static str> {
    let combined = format!("{} {}", app_name, aumid).to_lowercase();
    let has_word = |needle: &str| {
        combined
            .split(|c: char| !c.is_ascii_alphanumeric())
            .any(|tok| tok == needle)
    };

    if combined.contains("whatsapp") {
        Some("whatsapp://")
    } else if combined.contains("telegram") || has_word("tg") {
        Some("tg://")
    } else if combined.contains("discord") {
        Some("discord://")
    } else if combined.contains("spotify") {
        Some("spotify://")
    } else if combined.contains("slack") {
        Some("slack://")
    } else if combined.contains("msteams") || combined.contains("microsoft teams") || has_word("teams") {
        Some("msteams://")
    } else if combined.contains("zoom") {
        Some("zoommtg://")
    } else if has_word("line") {
        Some("line://")
    } else if combined.contains("steam") {
        Some("steam://")
    } else if combined.contains("vscode") || combined.contains("visual studio code") {
        Some("vscode://")
    } else if combined.contains("outlook") {
        Some("mailto:")
    } else if combined.contains("windowscalculator")
        || combined.contains("calculatorapp")
        || has_word("calculator")
        || has_word("kalkulator")
        || has_word("calc")
    {
        Some("calculator:")
    } else {
        None
    }
}

fn extract_pfn_from_pkg_dir_name(pkg_dir_name: &str) -> Option<String> {
    if let Some((before_pub, pub_id)) = pkg_dir_name.rsplit_once("__") {
        let (pkg_prefix, _) = before_pub.split_once('_')?;
        if !pkg_prefix.is_empty() && !pub_id.is_empty() {
            return Some(format!("{}_{}", pkg_prefix, pub_id));
        }
    }
    if let Some((pkg_prefix, pub_id)) = pkg_dir_name.rsplit_once('_') {
        if !pkg_prefix.is_empty()
            && !pkg_prefix.contains('_')
            && pub_id.len() == 13
            && pub_id.chars().all(|c| c.is_ascii_alphanumeric())
        {
            return Some(format!("{}_{}", pkg_prefix, pub_id));
        }
    }
    None
}

fn resolve_uwp_package_from_exe_path(path: &str) -> Option<(String, bool)> {
    let path_obj = Path::new(path);
    let exe_file_name = path_obj
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("exe"))
        .then(|| path_obj.file_name().and_then(|s| s.to_str()))
        .flatten();

    let mut curr = if path_obj.is_dir() {
        Some(path_obj)
    } else {
        path_obj.parent()
    };
    for _ in 0..4 {
        let Some(dir) = curr else { break };
        if dir.join("AppxManifest.xml").is_file() {
            let pkg_dir_name = dir.file_name().and_then(|s| s.to_str())?;
            if let Some(pfn) = extract_pfn_from_pkg_dir_name(pkg_dir_name) {
                let manifest = parse_appx_manifest_app_info(dir, None, exe_file_name);
                let (app_id, is_full_trust) = manifest
                    .map(|(id, _, ft)| (id, ft))
                    .unwrap_or_else(|| ("App".to_string(), false));
                return Some((format!("{}!{}", pfn, app_id), is_full_trust));
            }
        }
        curr = dir.parent();
    }

    let lower = path.to_lowercase();
    for marker in ["\\windowsapps\\", "\\systemapps\\"] {
        if let Some(idx) = lower.find(marker) {
            let rest = path.get(idx + marker.len()..)?;
            let pkg_dir_name = rest.split(|c| c == '\\' || c == '/').next()?.trim();
            if let Some(pfn) = extract_pfn_from_pkg_dir_name(pkg_dir_name) {
                return Some((format!("{}!App", pfn), false));
            }
        }
    }
    None
}

fn try_launch_squirrel_app(target_path: &str, arguments: &str) -> bool {
    let path_obj = Path::new(target_path);
    let Some(exe_name) = path_obj.file_name().and_then(|s| s.to_str()) else {
        return false;
    };
    for ancestor in path_obj.ancestors() {
        let Some(dir_name) = ancestor.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if dir_name.to_ascii_lowercase().starts_with("app-") {
            if let Some(base_dir) = ancestor.parent() {
                let update_exe = base_dir.join("Update.exe");
                if update_exe.is_file() {
                    let mut cmd = std::process::Command::new(&update_exe);
                    cmd.current_dir(base_dir)
                        .args(["--processStart", exe_name]);
                    if !arguments.trim().is_empty() {
                        cmd.args(["--process-start-args", arguments]);
                    }
                    if cmd.spawn().is_ok() {
                        return true;
                    }
                }
            }
        }
    }
    false
}

pub(crate) fn find_running_user_app_exe(target_name: &str, target_aumid: &str) -> Option<String> {
    let combined = format!("{} {}", target_name, target_aumid).to_lowercase();
    let tokens: Vec<&str> = combined
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|tok| {
            tok.len() >= 4
                && !matches!(
                    *tok,
                    "windows" | "microsoft" | "desktop" | "system" | "application" | "apps"
                )
        })
        .collect();
    if tokens.is_empty() {
        return None;
    }

    let mut pids = vec![0u32; 1024];
    let mut bytes_returned = 0u32;
    let _ = unsafe {
        EnumProcesses(
            pids.as_mut_ptr(),
            (pids.len() * std::mem::size_of::<u32>()) as u32,
            &mut bytes_returned,
        )
    };
    let count = (bytes_returned as usize / std::mem::size_of::<u32>()).min(pids.len());

    for &pid in &pids[..count] {
        if pid <= 4 {
            continue;
        }
        let Ok(handle) =
            (unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) })
        else {
            continue;
        };
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = unsafe {
            QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_FORMAT(0),
                PWSTR(buf.as_mut_ptr()),
                &mut len,
            )
        }
        .is_ok();
        let _ = unsafe { CloseHandle(handle) };
        if !ok || len == 0 {
            continue;
        }

        let full_path = String::from_utf16_lossy(&buf[..len as usize]);
        let lower_path = full_path.to_lowercase();
        if lower_path.contains("\\windows\\") || lower_path.contains("\\windowsapps\\") {
            continue;
        }

        let Some(stem) = Path::new(&lower_path).file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if stem.len() < 4
            || matches!(
                stem,
                "explorer"
                    | "svchost"
                    | "applicationframehost"
                    | "msedgewebview2"
                    | "gili"
                    | "notch"
                    | "runtimebroker"
            )
        {
            continue;
        }
        if tokens.iter().any(|tok| stem == *tok || stem.contains(tok) || tok.contains(stem)) {
            return Some(full_path);
        }
    }
    None
}

fn launch_pinned_app_sync(
    lnk_path: String,
    target_path: String,
    arguments: String,
) -> Result<(), String> {
    let _com = crate::ComGuard::init(COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);

    let trimmed_lnk = lnk_path.trim();
    if !trimmed_lnk.is_empty() {
        if !is_allowed_shortcut_or_exe_path(trimmed_lnk, true) {
            return Err("Blocked unsafe shortcut or URI target".into());
        }
        let lower_lnk = trimmed_lnk.to_lowercase();
        if let Some(aumid) = lower_lnk
            .strip_prefix("shell:appsfolder\\")
            .and_then(|_| trimmed_lnk.get("shell:AppsFolder\\".len()..))
        {
            if activate_aumid(aumid) {
                return Ok(());
            }
            if let Some(proto) = resolve_protocol_for_app("", aumid) {
                if shell_execute_open(proto, "", None) {
                    return Ok(());
                }
            }
            if shell_execute_open(trimmed_lnk, "", None) {
                return Ok(());
            }
        } else if shell_execute_open(trimmed_lnk, "", None) {
            return Ok(());
        }
    }

    let trimmed_target = target_path.trim();
    if !trimmed_target.is_empty() {
        if !is_allowed_shortcut_or_exe_path(trimmed_target, false) {
            return Err("Blocked unsafe executable target".into());
        }
        let lower_target = trimmed_target.to_lowercase();
        if lower_target.contains("\\windowsapps\\") || lower_target.contains("\\systemapps\\") {
            if let Some((derived_aumid, is_full_trust)) =
                resolve_uwp_package_from_exe_path(trimmed_target)
            {
                if activate_aumid(&derived_aumid) {
                    return Ok(());
                }
                if let Some(proto) = resolve_protocol_for_app(trimmed_target, &derived_aumid) {
                    if shell_execute_open(proto, "", None) {
                        return Ok(());
                    }
                }
                if !is_full_trust {
                    if derived_aumid.contains('!')
                        && std::process::Command::new("explorer.exe")
                            .arg(format!("shell:AppsFolder\\{}", derived_aumid))
                            .spawn()
                            .is_ok()
                    {
                        return Ok(());
                    }
                    return Err("Gagal membuka aplikasi UWP".into());
                }
            } else if let Some(proto) = resolve_protocol_for_app(trimmed_target, trimmed_lnk) {
                if shell_execute_open(proto, "", None) {
                    return Ok(());
                }
            }
        }

        if Path::new(trimmed_target).is_file() {
            let parent_dir = Path::new(trimmed_target).parent().and_then(|p| p.to_str());
            if shell_execute_open(trimmed_target, &arguments, parent_dir) {
                return Ok(());
            }

            let mut cmd = std::process::Command::new(trimmed_target);
            if let Some(dir) = parent_dir.filter(|s| !s.is_empty()) {
                cmd.current_dir(dir);
            }
            let parsed_args = parse_cli_arguments(&arguments);
            if !parsed_args.is_empty() {
                cmd.args(parsed_args);
            }
            if cmd.spawn().is_ok() {
                return Ok(());
            }
        } else if lower_target.contains("\\app-")
            && try_launch_squirrel_app(trimmed_target, &arguments)
        {
            return Ok(());
        }
    }

    if let Some(proto) = resolve_protocol_for_app(&target_path, trimmed_lnk) {
        if shell_execute_open(proto, "", None) {
            return Ok(());
        }
    }

    Err("Gagal membuka aplikasi".into())
}

#[cfg(test)]
mod tests {
    use super::{
        classify_taskband_token, detect_app_id, detect_icon_type, extract_pfn_from_pkg_dir_name,
        is_allowed_shortcut_or_exe_path, is_safe_url_target, is_valid_aumid_chars,
        parse_appx_manifest_xml, parse_cli_arguments, resolve_protocol_for_app,
        resolve_uwp_package_from_exe_path, try_launch_squirrel_app, TaskbandEntry,
    };
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(label: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!(
            "gili_pinned_apps_test_{}_{}_{}",
            label,
            std::process::id(),
            nanos
        ))
    }

    #[test]
    fn test_resolve_protocol_for_app_variants() {
        assert_eq!(
            resolve_protocol_for_app("Telegram Desktop", ""),
            Some("tg://")
        );
        assert_eq!(
            resolve_protocol_for_app(
                "",
                "TelegramMessengerLLP.TelegramDesktop_t4vj0pshhgkwm!Telegram.TelegramDesktop.Store"
            ),
            Some("tg://")
        );
        assert_eq!(resolve_protocol_for_app("tg", ""), Some("tg://"));
        assert_eq!(
            resolve_protocol_for_app("Discord", "com.squirrel.Discord.Discord"),
            Some("discord://")
        );
        assert_eq!(resolve_protocol_for_app("Settings", ""), None);
        assert_eq!(resolve_protocol_for_app("Google Chrome", "Chrome._crx_abc"), None);
    }

    #[test]
    fn test_calculator_detection_and_uwp_aumid_derivation() {
        assert_eq!(
            detect_app_id("Calculator", "Microsoft.WindowsCalculator_8wekyb3d8bbwe"),
            "calculator"
        );
        assert_eq!(
            detect_app_id("WindowsCalculator", "Microsoft.WindowsCalculator_8wekyb3d8bbwe"),
            "calculator"
        );
        assert_eq!(
            detect_icon_type("WindowsCalculator", "Microsoft.WindowsCalculator_8wekyb3d8bbwe"),
            Some("calculator".to_string())
        );
        assert_eq!(
            detect_app_id("Calculator", "C:\\Windows\\System32\\calc.exe"),
            "calculator"
        );
        assert_eq!(
            detect_icon_type("Calculator", "C:\\Windows\\System32\\calc.exe"),
            Some("calculator".to_string())
        );
        assert_eq!(
            resolve_protocol_for_app(
                "C:\\Program Files\\WindowsApps\\Microsoft.WindowsCalculator_11.2607.0.0_x64__8wekyb3d8bbwe\\CalculatorApp.exe",
                ""
            ),
            Some("calculator:")
        );
        assert_eq!(
            resolve_protocol_for_app("", "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"),
            Some("calculator:")
        );
        assert_eq!(
            resolve_uwp_package_from_exe_path(
                "C:\\Program Files\\WindowsApps\\Microsoft.WindowsCalculator_11.2607.0.0_x64__8wekyb3d8bbwe\\CalculatorApp.exe"
            ),
            Some(("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App".to_string(), false))
        );
        assert_eq!(
            detect_app_id("Photos", "Microsoft.Windows.Photos_8wekyb3d8bbwe"),
            "photos"
        );
    }

    #[test]
    fn test_parse_appx_manifest_xml_variants() {
        let calc_xml = r#"
            <Package>
              <Applications>
                <Application Id="App" Executable="CalculatorApp.exe" EntryPoint="Calculator.App" />
              </Applications>
            </Package>
        "#;
        assert_eq!(
            parse_appx_manifest_xml(calc_xml, None, Some("CalculatorApp.exe")),
            Some(("App".to_string(), Some("CalculatorApp.exe".to_string()), false))
        );

        let zunemusic_xml = r#"
            <Package>
              <Applications>
                <Application Id="Microsoft.ZuneMusic" Executable="Microsoft.Media.Player.exe" EntryPoint="Microsoft.Entertainment.Music.App" />
              </Applications>
            </Package>
        "#;
        assert_eq!(
            parse_appx_manifest_xml(zunemusic_xml, None, Some("Microsoft.Media.Player.exe")),
            Some((
                "Microsoft.ZuneMusic".to_string(),
                Some("Microsoft.Media.Player.exe".to_string()),
                false
            ))
        );

        let notepad_xml = r#"
            <Package>
              <Applications>
                <Application Id="App" Executable="Notepad\Notepad.exe" EntryPoint="Windows.FullTrustApplication" />
              </Applications>
            </Package>
        "#;
        assert_eq!(
            parse_appx_manifest_xml(notepad_xml, None, Some("Notepad.exe")),
            Some((
                "App".to_string(),
                Some("Notepad\\Notepad.exe".to_string()),
                true
            ))
        );

        let store_xml = r#"
            <Package>
              <Applications>
                <Application Id="App" Executable="WinStore.App.exe" EntryPoint="WinStore.App" />
                <Application Id="StoreDesktopExtension" Executable="StoreDesktopExtension.exe" EntryPoint="Windows.FullTrustApplication" />
                <Application Id="StoreCLI" Executable="store.exe" EntryPoint="Windows.FullTrustApplication" />
              </Applications>
            </Package>
        "#;
        assert_eq!(
            parse_appx_manifest_xml(store_xml, None, Some("WinStore.App.exe")),
            Some(("App".to_string(), Some("WinStore.App.exe".to_string()), false))
        );
        assert_eq!(
            parse_appx_manifest_xml(store_xml, Some("StoreCLI"), None),
            Some(("StoreCLI".to_string(), Some("store.exe".to_string()), true))
        );

        let netflix_xml = r#"
            <Package>
              <Applications>
                <Application Id="Netflix.App" uap10:HostId="PWA" uap10:Parameters="--app-id=abc" />
              </Applications>
            </Package>
        "#;
        assert_eq!(
            parse_appx_manifest_xml(netflix_xml, None, None),
            Some(("Netflix.App".to_string(), None, false))
        );
    }

    #[test]
    fn test_detect_app_id_and_icon_type_coverage() {
        assert_eq!(detect_icon_type("Google Chrome", r"C:\Program Files\Google\Chrome\chrome.exe"), Some("browser".into()));
        assert_eq!(detect_icon_type("Brave", r"C:\Program Files\Brave\brave.exe"), Some("brave".into()));
        assert_eq!(detect_icon_type("File Explorer", r"C:\Windows\explorer.exe"), Some("folder".into()));
        assert_eq!(detect_icon_type("Visual Studio Code", r"C:\Users\u\AppData\Local\Programs\Microsoft VS Code\Code.exe"), Some("code".into()));
        assert_eq!(detect_icon_type("Codec Pro", r"C:\Users\coder\App\MyTool.exe"), None);
        assert_eq!(detect_icon_type("Windows Terminal", ""), Some("terminal".into()));
        assert_eq!(detect_icon_type("Command Prompt", r"C:\Windows\System32\cmd.exe"), Some("terminal".into()));
        assert_eq!(detect_icon_type("PowerShell", r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"), Some("terminal".into()));
        assert_eq!(detect_icon_type("Settings", ""), Some("settings".into()));
        assert_eq!(detect_icon_type("Pengaturan", "SystemSettings.exe"), Some("settings".into()));
        assert_eq!(detect_icon_type("Spotify", ""), Some("spotify".into()));
        assert_eq!(detect_icon_type("Discord", ""), Some("discord".into()));
        assert_eq!(detect_icon_type("WhatsApp", ""), Some("whatsapp".into()));
        assert_eq!(detect_icon_type("Kalkulator", ""), Some("calculator".into()));
        assert_eq!(detect_icon_type("Notepad", r"C:\Windows\System32\notepad.exe"), None);

        assert_eq!(detect_app_id("Google Chrome", ""), "chrome");
        assert_eq!(detect_app_id("Brave", ""), "brave");
        assert_eq!(detect_app_id("File Explorer", ""), "explorer");
        assert_eq!(detect_app_id("Visual Studio Code", ""), "vscode");
        assert_eq!(detect_app_id("Codec Pro", r"C:\Users\coder\App\MyTool.exe"), "mytool");
        assert_eq!(detect_app_id("Terminal", "Microsoft.WindowsTerminal_8wekyb3d8bbwe"), "terminal");
        assert_eq!(detect_app_id("Command Prompt", r"C:\Windows\System32\cmd.exe"), "terminal");
        assert_eq!(detect_app_id("PowerShell", r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"), "terminal");
        assert_eq!(detect_app_id("Settings", "SystemSettings.exe"), "settings");
        assert_eq!(detect_app_id("Spotify", ""), "spotify");
        assert_eq!(detect_app_id("Netflix", "4DF9E0F8.Netflix_mcm4njqhnhss8"), "netflix");
        assert_eq!(detect_app_id("Discord", ""), "discord");
        assert_eq!(detect_app_id("WhatsApp", ""), "whatsapp");
        assert_eq!(detect_app_id("Kalkulator", ""), "calculator");
        assert_eq!(detect_app_id("My Custom Tool", r"C:\Tools\Custom Tool.exe"), "custom_tool");
        assert_eq!(detect_app_id("My Store App", "Publisher.MyStoreApp_1234567890abc"), "my_store_app");
        assert_eq!(detect_app_id("", "Microsoft.WindowsNotepad_8wekyb3d8bbwe"), "windowsnotepad");
        assert_eq!(detect_app_id("", r"C:\Program Files\Vendor\My App.lnk"), "my_app");
    }

    #[test]
    fn test_extract_pfn_from_pkg_dir_name() {
        assert_eq!(
            extract_pfn_from_pkg_dir_name("Microsoft.WindowsCalculator_11.2607.0.0_x64__8wekyb3d8bbwe"),
            Some("Microsoft.WindowsCalculator_8wekyb3d8bbwe".to_string())
        );
        assert_eq!(
            extract_pfn_from_pkg_dir_name("4DF9E0F8.Netflix_7.0.0.0_neutral__mcm4njqhnhss8"),
            Some("4DF9E0F8.Netflix_mcm4njqhnhss8".to_string())
        );
        assert_eq!(
            extract_pfn_from_pkg_dir_name("Microsoft.Windows.Search_cw5n1h2txyewy"),
            Some("Microsoft.Windows.Search_cw5n1h2txyewy".to_string())
        );
        assert_eq!(
            extract_pfn_from_pkg_dir_name("Microsoft.Windows.StartMenuExperienceHost_cw5n1h2txyewy"),
            Some("Microsoft.Windows.StartMenuExperienceHost_cw5n1h2txyewy".to_string())
        );

        assert_eq!(extract_pfn_from_pkg_dir_name(""), None);
        assert_eq!(extract_pfn_from_pkg_dir_name("plainname"), None);
        assert_eq!(extract_pfn_from_pkg_dir_name("_1.0_x64__8wekyb3d8bbwe"), None);
        assert_eq!(extract_pfn_from_pkg_dir_name("Pkg_1.0_x64__"), None);
        assert_eq!(extract_pfn_from_pkg_dir_name("Foo_Bar_cw5n1h2txyewy"), None);
        assert_eq!(extract_pfn_from_pkg_dir_name("Microsoft.Foo_short"), None);
    }

    #[test]
    fn test_classify_taskband_token_variants() {
        let mut out = Vec::new();
        classify_taskband_token(
            12,
            r"C:\Users\demo\AppData\Roaming\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Visual Studio Code.lnk",
            &mut out,
        );
        assert_eq!(
            out,
            vec![(12, TaskbandEntry::LnkFileName("Visual Studio Code.lnk".to_string()))]
        );

        let mut lnk_case = Vec::new();
        classify_taskband_token(24, "  Spotify.LNK  ", &mut lnk_case);
        assert_eq!(
            lnk_case,
            vec![(24, TaskbandEntry::LnkFileName("Spotify.LNK".to_string()))]
        );

        // 8.3 DOS short names and bare ".lnk" must be excluded
        let mut short_names = Vec::new();
        classify_taskband_token(0, r"C:\Users\demo\TASKBA~1\GOOGLE~1.LNK", &mut short_names);
        classify_taskband_token(4, ".lnk", &mut short_names);
        assert!(short_names.is_empty());

        // Full PFN!AppId and bare PFN (hosted Store PWAs)
        let mut uwp = Vec::new();
        classify_taskband_token(40, "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App", &mut uwp);
        classify_taskband_token(80, "4DF9E0F8.Netflix_mcm4njqhnhss8", &mut uwp);
        assert_eq!(
            uwp,
            vec![
                (40, TaskbandEntry::UwpAumid("Microsoft.WindowsTerminal_8wekyb3d8bbwe!App".to_string())),
                (80, TaskbandEntry::UwpAumid("4DF9E0F8.Netflix_mcm4njqhnhss8".to_string())),
            ]
        );

        // PackageFullName (_neutral__ / _x64__), paths, numeric-only prefixes, and invalid dot patterns must be rejected
        let mut rejected = Vec::new();
        for bad in [
            "4DF9E0F8.Netflix_7.0.0.0_neutral__mcm4njqhnhss8",
            "Microsoft.WindowsCalculator_11.2607.0.0_x64__8wekyb3d8bbwe",
            "Microsoft.WindowsCalculator_11.2607.0.0_x64__8wekyb3d8bbwe!App",
            r"C:\Program Files\4DF9E0F8.Netflix_mcm4njqhnhss8",
            "1.2.3.4_abcdefghijklm",
            "NoDot_abcdefghijklm",
            ".LeadingDot_abcdefghijklm",
            "TrailingDot._abcdefghijklm",
            "Two..Dots_abcdefghijklm",
        ] {
            classify_taskband_token(0, bad, &mut rejected);
        }
        assert!(rejected.is_empty());
    }

    #[test]
    fn test_resolve_uwp_package_from_exe_path_systemapps_windowsapps_and_manifest() {
        assert_eq!(
            resolve_uwp_package_from_exe_path(
                r"C:\Windows\SystemApps\Microsoft.Windows.Search_cw5n1h2txyewy\SearchApp.exe"
            ),
            Some(("Microsoft.Windows.Search_cw5n1h2txyewy!App".to_string(), false))
        );
        assert_eq!(
            resolve_uwp_package_from_exe_path(
                r"C:\Program Files\WindowsApps\4DF9E0F8.Netflix_7.0.0.0_neutral__mcm4njqhnhss8\Netflix.exe"
            ),
            Some(("4DF9E0F8.Netflix_mcm4njqhnhss8!App".to_string(), false))
        );
        assert_eq!(
            resolve_uwp_package_from_exe_path(r"C:\Program Files\Mozilla Firefox\firefox.exe"),
            None
        );

        let sandbox = unique_temp_dir("uwp_manifest");
        let pkg_dir = sandbox.join("Microsoft.WindowsNotepad_11.2400.0.0_x64__8wekyb3d8bbwe");
        let exe_dir = pkg_dir.join("Notepad");
        std::fs::create_dir_all(&exe_dir).unwrap();
        let exe_path = exe_dir.join("Notepad.exe");
        std::fs::write(&exe_path, b"").unwrap();
        std::fs::write(
            pkg_dir.join("AppxManifest.xml"),
            r#"<Package><Applications><Application Id="App" Executable="Notepad\Notepad.exe" EntryPoint="Windows.FullTrustApplication" /></Applications></Package>"#,
        )
        .unwrap();

        assert_eq!(
            resolve_uwp_package_from_exe_path(exe_path.to_str().unwrap()),
            Some(("Microsoft.WindowsNotepad_8wekyb3d8bbwe!App".to_string(), true))
        );

        let _ = std::fs::remove_dir_all(&sandbox);
    }

    #[test]
    fn test_try_launch_squirrel_app_non_matching_returns_false() {
        assert!(!try_launch_squirrel_app("", ""));
        assert!(!try_launch_squirrel_app(r"C:\Program Files\Notepad++\notepad++.exe", ""));
        assert!(!try_launch_squirrel_app(
            r"C:\Users\nobody\AppData\Local\Discord\app-1.0.9999\Discord.exe",
            "--minimized"
        ));

        let sandbox = unique_temp_dir("squirrel");
        let exe_dir = sandbox.join("app-1.0.0");
        std::fs::create_dir_all(&exe_dir).unwrap();
        let fake_exe = exe_dir.join("Demo.exe");
        std::fs::write(&fake_exe, b"").unwrap();

        // Missing Update.exe must return false cleanly without spawning
        assert!(!try_launch_squirrel_app(fake_exe.to_str().unwrap(), ""));

        let _ = std::fs::remove_dir_all(&sandbox);
    }

    #[test]
    fn test_aumid_url_path_and_cli_args_sanitization() {
        assert!(is_valid_aumid_chars(
            "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\notepad.exe"
        ));
        assert!(is_valid_aumid_chars("Microsoft.WindowsStore_8wekyb3d8bbwe!App"));
        assert!(!is_valid_aumid_chars("bad;calc.exe"));
        assert!(!is_valid_aumid_chars("bad|pipe"));
        assert!(!is_valid_aumid_chars("bad\nnewline"));

        assert!(is_safe_url_target("https://example.com/docs"));
        assert!(!is_safe_url_target("javascript:alert(1)"));
        assert!(!is_safe_url_target("\\\\evil-server\\share\\payload.exe"));

        assert!(is_allowed_shortcut_or_exe_path(
            "shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
            false
        ));
        assert!(!is_allowed_shortcut_or_exe_path("\\\\evil\\share\\run.exe", true));
        assert!(!is_allowed_shortcut_or_exe_path("", true));

        assert_eq!(
            parse_cli_arguments(r#"--profile="Profile 1" --disable-gpu "C:\My App\cfg.json""#),
            vec![
                "--profile=Profile 1".to_string(),
                "--disable-gpu".to_string(),
                r"C:\My App\cfg.json".to_string(),
            ]
        );
    }
}
