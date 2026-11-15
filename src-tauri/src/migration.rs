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

    if !user_profile.is_empty() {
        let desktop_dir = PathBuf::from(&user_profile).join("Desktop");
        let desktop_notch = desktop_dir.join("Notch.lnk");
        let desktop_gili = desktop_dir.join("Gili.lnk");

        if desktop_notch.exists() {
            let _ = std::fs::remove_file(&desktop_notch);
        }
        if !desktop_gili.exists() {
            create_gili_shortcut(&desktop_gili, &current_exe);
        }
    }

    if !app_data.is_empty() {
        let programs_dir = PathBuf::from(&app_data).join(r"Microsoft\Windows\Start Menu\Programs");
        let start_notch = programs_dir.join("Notch.lnk");
        let start_gili = programs_dir.join("Gili.lnk");

        if start_notch.exists() {
            let _ = std::fs::remove_file(&start_notch);
        }
        if !start_gili.exists() {
            create_gili_shortcut(&start_gili, &current_exe);
        }
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
