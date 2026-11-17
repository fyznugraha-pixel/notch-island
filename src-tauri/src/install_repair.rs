//! Keeps autostart and shortcuts pointed at the installed exe, so a reboot or relaunch
//! never falls back to a stale copy of Gili left over from an older install.

#[cfg(windows)]
use std::borrow::Cow;
#[cfg(windows)]
use std::path::{Path, PathBuf};

#[cfg(windows)]
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(windows)]
const STARTUP_APPROVED_RUN_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
#[cfg(windows)]
const AUTOSTART_VALUE_NAME: &str = "Gili";
#[cfg(windows)]
const MSIX_FALLBACK_AUMID: &str = "GiliIsland.GiliNotch_3m9x7k79pjczc!GILI";

#[cfg(windows)]
fn install_dirs() -> Vec<PathBuf> {
    ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"]
        .iter()
        .filter_map(|var| std::env::var(var).ok())
        .map(|base| PathBuf::from(base).join("Gili"))
        .collect()
}

/// Only an exe living in a real install dir or MSIX package path may auto-repair
/// startup entries, so a portable/dev copy does not hijack an installed binary.
#[cfg(windows)]
fn is_installed_exe(exe: &Path) -> bool {
    let path_lower = exe.to_string_lossy().to_ascii_lowercase();
    if path_lower.contains("\\windowsapps\\")
        || path_lower.ends_with("\\local appdata\\gili\\gili.exe")
    {
        return true;
    }
    let Some(parent) = exe.parent() else { return false };
    let parent_str = parent.to_string_lossy();
    install_dirs()
        .iter()
        .any(|dir| dir.to_string_lossy().eq_ignore_ascii_case(&parent_str))
}

#[cfg(windows)]
fn read_desired_autostart_from_disk() -> bool {
    let Some(appdata) = std::env::var_os("APPDATA") else {
        return true;
    };
    let settings_path = PathBuf::from(appdata)
        .join("com.faiz.notch")
        .join("settings.json");
    let Ok(raw) = std::fs::read_to_string(&settings_path) else {
        return true;
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return true;
    };
    parsed
        .get("opt_autostart")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

#[cfg(windows)]
pub fn append_startup_log(line: &str) {
    use std::io::Write;
    let Ok(base) = std::env::var("LOCALAPPDATA") else { return };
    let dir = PathBuf::from(base).join("Gili");
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("startup.log"))
    {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(file, "[{}] {}", secs, line);
    }
}

#[cfg(windows)]
fn startup_shortcut_path() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    Some(
        PathBuf::from(appdata)
            .join(r"Microsoft\Windows\Start Menu\Programs\Startup")
            .join("Gili.lnk"),
    )
}

#[cfg(windows)]
fn msix_aumid_marker_path() -> Option<PathBuf> {
    let local_appdata = std::env::var_os("LOCALAPPDATA")?;
    Some(PathBuf::from(local_appdata).join("Gili").join("msix_startup_aumid.txt"))
}

#[cfg(windows)]
fn remove_startup_shortcut() {
    if let Some(lnk) = startup_shortcut_path() {
        if lnk.exists() {
            let _ = std::fs::remove_file(&lnk);
        }
    }
    if let Some(marker) = msix_aumid_marker_path() {
        if marker.exists() {
            let _ = std::fs::remove_file(&marker);
        }
    }
}

#[cfg(windows)]
fn clear_startup_approved_disabled() {
    use winreg::enums::*;
    use winreg::{RegKey, RegValue};

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(approved_key) =
        hkcu.open_subkey_with_flags(STARTUP_APPROVED_RUN_KEY, KEY_READ | KEY_SET_VALUE)
    else {
        return;
    };
    let Ok(raw) = approved_key.get_raw_value(AUTOSTART_VALUE_NAME) else {
        return;
    };
    // Odd first byte (e.g. 0x03) marks the entry disabled in Task Manager Startup.
    if raw.bytes.first().copied().unwrap_or(0) % 2 == 1 {
        let enabled_val = RegValue {
            bytes: Cow::Borrowed(&[2u8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
            vtype: REG_BINARY,
        };
        if approved_key
            .set_raw_value(AUTOSTART_VALUE_NAME, &enabled_val)
            .is_ok()
        {
            append_startup_log("autostart StartupApproved disabled flag cleared");
        }
    }
}

#[cfg(windows)]
fn current_msix_aumid() -> String {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS};
    use windows::Win32::Storage::Packaging::Appx::GetCurrentApplicationUserModelId;

    unsafe {
        let mut length: u32 = 0;
        let err = GetCurrentApplicationUserModelId(&mut length, PWSTR::null());
        if err == ERROR_INSUFFICIENT_BUFFER && length > 0 {
            let mut buf = vec![0u16; length as usize];
            let err2 = GetCurrentApplicationUserModelId(&mut length, PWSTR(buf.as_mut_ptr()));
            if err2 == ERROR_SUCCESS {
                let aumid = String::from_utf16_lossy(&buf)
                    .trim_end_matches('\0')
                    .to_string();
                if !aumid.is_empty() {
                    return aumid;
                }
            }
        }
    }
    MSIX_FALLBACK_AUMID.to_string()
}

#[cfg(windows)]
fn ensure_msix_startup_shortcut(aumid: &str, icon_exe: Option<&Path>) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let Some(lnk_path) = startup_shortcut_path() else {
        return;
    };
    if lnk_path.exists() {
        if let Some(marker) = msix_aumid_marker_path() {
            if let Ok(saved) = std::fs::read_to_string(&marker) {
                if saved.trim() == aumid {
                    return;
                }
            }
        }
    }

    if let Some(parent) = lnk_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());
    let explorer_exe = PathBuf::from(system_root).join("explorer.exe");
    let args = format!("shell:AppsFolder\\{}", aumid);
    let icon_loc = icon_exe
        .map(|p| format!("{},0", p.display()))
        .unwrap_or_else(|| format!("{},0", explorer_exe.display()));

    let script = "$w = New-Object -ComObject WScript.Shell; \
        $s = $w.CreateShortcut($env:GILI_LNK_PATH); \
        $s.TargetPath = $env:GILI_TARGET_EXE; \
        $s.Arguments = $env:GILI_ARGS; \
        $s.IconLocation = $env:GILI_ICON_LOC; \
        $s.Save()";

    if let Ok(out) = std::process::Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
        .env("GILI_LNK_PATH", &lnk_path)
        .env("GILI_TARGET_EXE", &explorer_exe)
        .env("GILI_ARGS", &args)
        .env("GILI_ICON_LOC", &icon_loc)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        if out.status.success() {
            if let Some(marker) = msix_aumid_marker_path() {
                if let Some(dir) = marker.parent() {
                    let _ = std::fs::create_dir_all(dir);
                }
                let _ = std::fs::write(marker, aumid);
            }
        }
    }
}

#[cfg(windows)]
fn set_run_autostart_value(expected_value: &str) {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu
        .open_subkey_with_flags(RUN_KEY, KEY_READ | KEY_SET_VALUE)
        .ok()
        .or_else(|| hkcu.create_subkey(RUN_KEY).ok().map(|(k, _)| k));
    let Some(run_key) = run_key else {
        return;
    };

    let current = run_key.get_value::<String, _>(AUTOSTART_VALUE_NAME).ok();
    if current
        .as_deref()
        .is_some_and(|c| c.trim().eq_ignore_ascii_case(expected_value))
    {
        return;
    }

    append_startup_log(&format!(
        "autostart synced: '{}' -> '{}'",
        current.as_deref().unwrap_or("<missing>").trim(),
        expected_value
    ));
    let _ = run_key.set_value(AUTOSTART_VALUE_NAME, &expected_value);
}

#[cfg(windows)]
fn check_msix_startup_task_state() -> Option<bool> {
    use windows::ApplicationModel::{StartupTask, StartupTaskState};
    use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};

    struct RoGuard(bool);
    impl Drop for RoGuard {
        fn drop(&mut self) {
            if self.0 {
                unsafe { RoUninitialize() };
            }
        }
    }

    let ro_ok = unsafe { RoInitialize(RO_INIT_MULTITHREADED).is_ok() };
    let _ro_guard = RoGuard(ro_ok);

    let Ok(tasks) = StartupTask::GetForCurrentPackageAsync().and_then(|op| op.get()) else {
        return None;
    };
    let mut saw_task = false;
    for task in &tasks {
        saw_task = true;
        if let Ok(state) = task.State() {
            if matches!(
                state,
                StartupTaskState::Enabled | StartupTaskState::EnabledByPolicy
            ) {
                return Some(true);
            }
        }
    }
    saw_task.then_some(false)
}

#[cfg(windows)]
fn sync_msix_startup_task(enabled: bool) {
    use windows::ApplicationModel::{StartupTask, StartupTaskState};
    use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};

    struct RoGuard(bool);
    impl Drop for RoGuard {
        fn drop(&mut self) {
            if self.0 {
                unsafe { RoUninitialize() };
            }
        }
    }

    let ro_ok = unsafe { RoInitialize(RO_INIT_MULTITHREADED).is_ok() };
    let _ro_guard = RoGuard(ro_ok);

    let Ok(tasks) = StartupTask::GetForCurrentPackageAsync().and_then(|op| op.get()) else {
        return;
    };

    let mut count = 0usize;
    for task in &tasks {
        count += 1;
        let Ok(state) = task.State() else {
            continue;
        };
        if enabled {
            if state == StartupTaskState::Disabled {
                let _ = task.RequestEnableAsync().and_then(|op| op.get());
            }
        } else if state == StartupTaskState::Enabled {
            let _ = task.Disable();
        }
    }
    if count == 0 {
        append_startup_log("msix StartupTask extension not present in active package manifest");
    }
}

#[cfg(windows)]
fn is_startup_approved_disabled() -> bool {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(approved_key) = hkcu.open_subkey_with_flags(STARTUP_APPROVED_RUN_KEY, KEY_READ) else {
        return false;
    };
    approved_key
        .get_raw_value(AUTOSTART_VALUE_NAME)
        .ok()
        .is_some_and(|raw| raw.bytes.first().copied().unwrap_or(0) % 2 == 1)
}

#[cfg(windows)]
fn get_autostart_state_inner() -> bool {
    use winreg::enums::*;
    use winreg::RegKey;

    if crate::store_license::is_packaged_msix() {
        if let Some(enabled) = check_msix_startup_task_state() {
            return enabled;
        }
        if startup_shortcut_path().is_some_and(|p| p.exists()) {
            return true;
        }
    }

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let has_run = hkcu
        .open_subkey_with_flags(RUN_KEY, KEY_READ)
        .and_then(|k| k.get_raw_value(AUTOSTART_VALUE_NAME))
        .is_ok();
    has_run && !is_startup_approved_disabled()
}

#[cfg(not(windows))]
fn get_autostart_state_inner() -> bool {
    false
}

#[cfg(windows)]
fn sync_autostart_registration_inner(enabled: bool, allow_dev_fallback: bool) {
    use winreg::enums::*;
    use winreg::RegKey;

    let is_msix = crate::store_license::is_packaged_msix();

    if !enabled {
        if is_msix {
            sync_msix_startup_task(false);
        }
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(run_key) = hkcu.open_subkey_with_flags(RUN_KEY, KEY_READ | KEY_SET_VALUE) {
            if run_key.get_raw_value(AUTOSTART_VALUE_NAME).is_ok() {
                let _ = run_key.delete_value(AUTOSTART_VALUE_NAME);
                append_startup_log("autostart disabled: removed HKCU Run\\Gili");
            }
        }
        remove_startup_shortcut();
        return;
    }

    clear_startup_approved_disabled();

    let current_exe = std::env::current_exe().ok();
    if is_msix {
        sync_msix_startup_task(true);
        let aumid = current_msix_aumid();
        let expected_value = format!("explorer.exe shell:AppsFolder\\{}", aumid);
        set_run_autostart_value(&expected_value);
        ensure_msix_startup_shortcut(&aumid, current_exe.as_deref());
        return;
    }

    let target_exe = current_exe
        .as_ref()
        .filter(|p| is_installed_exe(p))
        .cloned()
        .or_else(|| {
            std::env::var("LOCALAPPDATA")
                .ok()
                .map(|base| PathBuf::from(base).join("Gili").join("gili.exe"))
                .filter(|p| p.exists())
        })
        .or_else(|| if allow_dev_fallback { current_exe } else { None });

    if let Some(exe_path) = target_exe {
        let expected_value = format!("\"{}\"", exe_path.display());
        set_run_autostart_value(&expected_value);
    }
    remove_startup_shortcut();
}

#[cfg(windows)]
pub fn sync_autostart_registration(enabled: bool) {
    sync_autostart_registration_inner(enabled, true);
}

#[cfg(not(windows))]
pub fn sync_autostart_registration(_enabled: bool) {}

#[tauri::command]
pub async fn get_autostart_state() -> bool {
    tauri::async_runtime::spawn_blocking(get_autostart_state_inner)
        .await
        .unwrap_or(false)
}

#[tauri::command]
pub async fn sync_autostart_state(enabled: bool) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        sync_autostart_registration(enabled);
        get_autostart_state_inner()
    })
    .await
    .unwrap_or(enabled)
}

#[cfg(windows)]
fn repair_shortcuts(exe: &Path) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    let app_data = std::env::var("APPDATA").unwrap_or_default();

    let mut candidates = Vec::new();
    if !user_profile.is_empty() {
        candidates.push(PathBuf::from(&user_profile).join("Desktop").join("Gili.lnk"));
    }
    if !app_data.is_empty() {
        candidates.push(
            PathBuf::from(&app_data)
                .join(r"Microsoft\Windows\Start Menu\Programs")
                .join("Gili.lnk"),
        );
    }
    let existing: Vec<PathBuf> = candidates.into_iter().filter(|p| p.exists()).collect();
    if existing.is_empty() {
        return;
    }

    // Pass paths through environment variables because PowerShell `-Command` joins
    // extra CLI tokens into script source text instead of populating `$args`.
    let script = "$w = New-Object -ComObject WScript.Shell; \
        for ($i = 0; $i -lt [int]$env:GILI_LNK_COUNT; $i++) { \
            $p = [Environment]::GetEnvironmentVariable(\"GILI_LNK_$i\"); \
            if ($p) { \
                $s = $w.CreateShortcut($p); \
                if ($s.TargetPath -ne $env:GILI_TARGET_EXE) { \
                    $s.TargetPath = $env:GILI_TARGET_EXE; \
                    $s.IconLocation = ($env:GILI_TARGET_EXE + ',0'); \
                    $s.Save(); \
                } \
            } \
        }";

    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
        .env("GILI_TARGET_EXE", exe)
        .env("GILI_LNK_COUNT", existing.len().to_string())
        .creation_flags(CREATE_NO_WINDOW);
    for (idx, path) in existing.iter().enumerate() {
        cmd.env(format!("GILI_LNK_{}", idx), path);
    }
    let _ = cmd.output();
}

/// Runs off the main thread so registry/shortcut checks and legacy migration never block startup.
#[cfg(windows)]
pub fn spawn_install_repair() {
    let Ok(exe) = std::env::current_exe() else { return };
    append_startup_log(&format!("start v{} from '{}'", env!("CARGO_PKG_VERSION"), exe.display()));

    let is_installed = is_installed_exe(&exe) || crate::store_license::is_packaged_msix();
    std::thread::spawn(move || {
        if !cfg!(debug_assertions) && is_installed {
            let want_autostart = read_desired_autostart_from_disk();
            sync_autostart_registration_inner(want_autostart, false);
            if !crate::store_license::is_packaged_msix() {
                repair_shortcuts(&exe);
            }
        }
        crate::migration::run_legacy_migration();
    });
}

#[cfg(not(windows))]
pub fn spawn_install_repair() {}

#[cfg(not(windows))]
pub fn append_startup_log(_line: &str) {}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn test_is_installed_exe_detection() {
        assert!(is_installed_exe(Path::new(
            r"C:\Program Files\WindowsApps\GiliIsland.GiliNotch_5.1.1.0_x64__3m9x7k79pjczc\gili.exe"
        )));
        assert!(is_installed_exe(Path::new(
            r"c:\program files\windowsapps\gili\gili.exe"
        )));
        assert!(is_installed_exe(Path::new(
            r"C:\Users\tester\Local AppData\Gili\gili.exe"
        )));

        let local_appdata = std::env::var("LOCALAPPDATA")
            .expect("LOCALAPPDATA env var should be set on Windows");
        let installed_local = PathBuf::from(local_appdata).join("Gili").join("gili.exe");
        assert!(is_installed_exe(&installed_local));

        assert!(!is_installed_exe(Path::new(
            r"D:\kerjaan\projek-ndiri\island\src-tauri\target\debug\gili.exe"
        )));
        assert!(!is_installed_exe(Path::new(
            r"D:\Portable\Gili\gili.exe"
        )));
    }

    #[test]
    fn test_current_msix_aumid_unpackaged_fallback() {
        assert_eq!(current_msix_aumid(), MSIX_FALLBACK_AUMID);
    }
}

