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
fn terminate_legacy_notch() {
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
fn migrate_shortcuts() {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

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

    let desktop_notch = PathBuf::from(&user_profile).join("Desktop").join("Notch.lnk");
    let desktop_gili = PathBuf::from(&user_profile).join("Desktop").join("Gili.lnk");

    let start_notch = PathBuf::from(&app_data)
        .join(r"Microsoft\Windows\Start Menu\Programs")
        .join("Notch.lnk");
    let start_gili = PathBuf::from(&app_data)
        .join(r"Microsoft\Windows\Start Menu\Programs")
        .join("Gili.lnk");

    // Remove legacy Desktop Notch shortcut
    if desktop_notch.exists() {
        let _ = std::fs::remove_file(&desktop_notch);
    }

    // Remove legacy Start Menu Notch shortcut
    if start_notch.exists() {
        let _ = std::fs::remove_file(&start_notch);
    }

    let target_path_str = current_exe.to_string_lossy().replace('\'', "''");

    // Ensure Desktop shortcut for Gili exists
    if !desktop_gili.exists() {
        let lnk_str = desktop_gili.to_string_lossy().replace('\'', "''");
        let script = format!(
            "$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut('{lnk_str}'); $s.TargetPath = '{target_path_str}'; $s.IconLocation = '{target_path_str},0'; $s.Save()"
        );
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }

    // Ensure Start Menu shortcut for Gili exists
    if !start_gili.exists() {
        let lnk_str = start_gili.to_string_lossy().replace('\'', "''");
        let script = format!(
            "$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut('{lnk_str}'); $s.TargetPath = '{target_path_str}'; $s.IconLocation = '{target_path_str},0'; $s.Save()"
        );
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
}

#[cfg(windows)]
fn cleanup_legacy_directory() {
    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    if local_appdata.is_empty() {
        return;
    }

    let notch_dir = PathBuf::from(local_appdata).join("Notch");
    if notch_dir.exists() {
        let _ = std::fs::remove_dir_all(&notch_dir);
    }
}
