use std::path::PathBuf;

#[cfg(windows)]
pub fn run_legacy_migration() {
    // 1. Terminate legacy notch.exe if still active
    terminate_legacy_notch();

    // 2. Remove legacy registry autostart and uninstall entries
    cleanup_legacy_registry();

    // 3. Migrate Desktop and Start Menu shortcuts from Notch to Gili
    migrate_shortcuts();

    // 4. Remove obsolete Notch app data folder (%LOCALAPPDATA%\Notch)
    cleanup_legacy_directory();
}

#[cfg(not(windows))]
pub fn run_legacy_migration() {}

#[cfg(windows)]
fn has_legacy_notch_artifacts() -> bool {
    use winreg::enums::*;
    use winreg::RegKey;

    let has_local_dir = std::env::var("LOCALAPPDATA")
        .ok()
        .filter(|s| !s.is_empty())
        .is_some_and(|base| PathBuf::from(base).join("Notch").exists());
    if has_local_dir {
        return true;
    }

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let has_run_notch = hkcu
        .open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", KEY_READ)
        .and_then(|k| k.get_raw_value("Notch"))
        .is_ok();
    if has_run_notch {
        return true;
    }

    hkcu.open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Notch",
        KEY_READ,
    )
    .is_ok()
}

#[cfg(windows)]
fn terminate_legacy_notch() {
    if !has_legacy_notch_artifacts() {
        return;
    }

    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/IM", "notch.exe"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

#[cfg(windows)]
fn cleanup_legacy_registry() {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // Remove legacy autostart
    if let Ok(run_key) = hkcu.open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Run",
        KEY_SET_VALUE | KEY_READ,
    ) {
        let _ = run_key.delete_value("Notch");
        let _ = run_key.delete_value("island");
    }

    // Remove legacy Add/Remove Programs entry
    if let Ok(uninstall_key) = hkcu.open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        KEY_ALL_ACCESS,
    ) {
        let _ = uninstall_key.delete_subkey_all("Notch");
    }
}

#[cfg(windows)]
fn create_gili_shortcut(lnk_path: &std::path::Path, target_exe: &std::path::Path) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // Bind paths via env vars so `-Command` does not evaluate paths as script tokens.
    let script = "$w = New-Object -ComObject WScript.Shell; \
        $s = $w.CreateShortcut($env:GILI_LNK_PATH); \
        $s.TargetPath = $env:GILI_TARGET_EXE; \
        $s.IconLocation = ($env:GILI_TARGET_EXE + ',0'); \
        $s.Save()";
    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
        .env("GILI_LNK_PATH", lnk_path)
        .env("GILI_TARGET_EXE", target_exe)
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

#[cfg(windows)]
fn legacy_notch_dir(local_appdata: &str) -> Option<PathBuf> {
    if local_appdata.is_empty() {
        return None;
    }
    Some(PathBuf::from(local_appdata).join("Notch"))
}

#[cfg(windows)]
fn plan_stale_shortcut_removals(user_profile: &str, app_data: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if !user_profile.is_empty() {
        paths.push(PathBuf::from(user_profile).join("Desktop").join("Notch.lnk"));
    }
    if !app_data.is_empty() {
        let programs_dir = PathBuf::from(app_data).join(r"Microsoft\Windows\Start Menu\Programs");
        paths.push(programs_dir.join("Notch.lnk"));
        let startup_dir = programs_dir.join("Startup");
        for stale in ["Notch.lnk", "island.lnk", "island - Shortcut.lnk"] {
            paths.push(startup_dir.join(stale));
        }
    }
    paths
}

#[cfg(windows)]
fn remove_existing_files(paths: &[PathBuf]) {
    for path in paths {
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }
}

#[cfg(windows)]
fn migrate_shortcuts() {
    let current_exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(_) => return,
    };

    // Skip creating permanent shortcuts in debug/dev builds
    if cfg!(debug_assertions) {
        return;
    }

    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    let app_data = std::env::var("APPDATA").unwrap_or_default();

    if user_profile.is_empty() && app_data.is_empty() {
        return;
    }

    let is_msix = crate::store_license::is_packaged_msix();

    remove_existing_files(&plan_stale_shortcut_removals(&user_profile, &app_data));

    if !user_profile.is_empty() {
        let desktop_gili = PathBuf::from(&user_profile).join("Desktop").join("Gili.lnk");
        if !is_msix && !desktop_gili.exists() {
            create_gili_shortcut(&desktop_gili, &current_exe);
        }
    }

    if !app_data.is_empty() {
        let start_gili = PathBuf::from(&app_data)
            .join(r"Microsoft\Windows\Start Menu\Programs")
            .join("Gili.lnk");
        if !is_msix && !start_gili.exists() {
            create_gili_shortcut(&start_gili, &current_exe);
        }
    }
}

#[cfg(windows)]
fn cleanup_legacy_directory() {
    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    if let Some(notch_dir) = legacy_notch_dir(&local_appdata) {
        if notch_dir.exists() {
            let _ = std::fs::remove_dir_all(&notch_dir);
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!(
            "gili_migration_test_{}_{}_{}",
            label,
            std::process::id(),
            nanos
        ))
    }

    #[test]
    fn test_legacy_notch_dir_and_stale_shortcut_plan() {
        assert_eq!(legacy_notch_dir(""), None);
        assert_eq!(
            legacy_notch_dir(r"C:\Users\demo\AppData\Local"),
            Some(PathBuf::from(r"C:\Users\demo\AppData\Local\Notch"))
        );

        assert!(plan_stale_shortcut_removals("", "").is_empty());

        let only_profile = plan_stale_shortcut_removals(r"C:\Users\demo", "");
        assert_eq!(
            only_profile,
            vec![PathBuf::from(r"C:\Users\demo\Desktop\Notch.lnk")]
        );

        let full = plan_stale_shortcut_removals(r"C:\Users\demo", r"C:\Users\demo\AppData\Roaming");
        assert_eq!(
            full,
            vec![
                PathBuf::from(r"C:\Users\demo\Desktop\Notch.lnk"),
                PathBuf::from(
                    r"C:\Users\demo\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Notch.lnk"
                ),
                PathBuf::from(
                    r"C:\Users\demo\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\Notch.lnk"
                ),
                PathBuf::from(
                    r"C:\Users\demo\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\island.lnk"
                ),
                PathBuf::from(
                    r"C:\Users\demo\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\island - Shortcut.lnk"
                ),
            ]
        );
    }

    #[test]
    fn test_remove_existing_files_only_removes_stale_targets_in_sandbox() {
        let sandbox = unique_temp_dir("shortcuts");
        let desktop = sandbox.join("Desktop");
        let startup = sandbox.join(r"Microsoft\Windows\Start Menu\Programs\Startup");
        std::fs::create_dir_all(&desktop).unwrap();
        std::fs::create_dir_all(&startup).unwrap();

        let stale_desktop = desktop.join("Notch.lnk");
        let keep_gili = desktop.join("Gili.lnk");
        let stale_startup = startup.join("island - Shortcut.lnk");
        std::fs::write(&stale_desktop, b"stale").unwrap();
        std::fs::write(&keep_gili, b"keep").unwrap();
        std::fs::write(&stale_startup, b"stale").unwrap();

        let planned = plan_stale_shortcut_removals(
            sandbox.to_str().unwrap(),
            sandbox.to_str().unwrap(),
        );
        remove_existing_files(&planned);

        assert!(!stale_desktop.exists());
        assert!(!stale_startup.exists());
        assert!(keep_gili.exists());

        let _ = std::fs::remove_dir_all(&sandbox);
    }
}
