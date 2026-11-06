//! Keeps autostart and shortcuts pointed at the installed exe, so a reboot or relaunch
//! never falls back to a stale copy of Gili left over from an older install.

#[cfg(windows)]
use std::path::{Path, PathBuf};

#[cfg(windows)]
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(windows)]
const AUTOSTART_VALUE_NAME: &str = "Gili";

#[cfg(windows)]
fn install_dirs() -> Vec<PathBuf> {
    ["LOCALAPPDATA", "ProgramFiles"]
        .iter()
        .filter_map(|var| std::env::var(var).ok())
        .map(|base| PathBuf::from(base).join("Gili"))
        .collect()
}

/// Only an exe living in a real install dir may rewrite autostart/shortcuts,
/// otherwise a portable copy (e.g. in Downloads) would hijack them.
#[cfg(windows)]
fn is_installed_exe(exe: &Path) -> bool {
    let Some(parent) = exe.parent() else { return false };
    install_dirs().iter().any(|dir| dir.as_path() == parent)
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
fn repair_autostart(exe: &Path) {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(run_key) = hkcu.open_subkey_with_flags(RUN_KEY, KEY_READ | KEY_SET_VALUE) else {
        return;
    };
    // Missing value means the user turned autostart off — leave it alone.
    let Ok(current) = run_key.get_value::<String, _>(AUTOSTART_VALUE_NAME) else {
        return;
    };

    let exe_str = exe.to_string_lossy().to_string();
    let registered = current.trim().trim_matches('"').trim();
    if registered.eq_ignore_ascii_case(&exe_str) {
        return;
    }

    append_startup_log(&format!("autostart repaired: '{}' -> '{}'", registered, exe_str));
    let _ = run_key.set_value(AUTOSTART_VALUE_NAME, &format!("{} ", exe_str));
}

#[cfg(windows)]
fn repair_shortcuts(exe: &Path) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    let app_data = std::env::var("APPDATA").unwrap_or_default();

    let shortcuts = [
        PathBuf::from(&user_profile).join("Desktop").join("Gili.lnk"),
        PathBuf::from(&app_data)
            .join(r"Microsoft\Windows\Start Menu\Programs")
            .join("Gili.lnk"),
    ];
    let existing: Vec<String> = shortcuts
        .iter()
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    if existing.is_empty() {
        return;
    }

    // Paths go in as $args so nothing is interpolated into the script text.
    let script = "$w = New-Object -ComObject WScript.Shell; \
        foreach ($p in $args[1..($args.Length-1)]) { \
            $s = $w.CreateShortcut($p); \
            if ($s.TargetPath -ne $args[0]) { $s.TargetPath = $args[0]; $s.IconLocation = $args[0] + ',0'; $s.Save() } \
        }";

    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
        .arg(exe.to_string_lossy().to_string())
        .args(&existing)
        .creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.output();
}

/// Runs off the main thread: the PowerShell shortcut check is slow and must not delay startup.
#[cfg(windows)]
pub fn spawn_install_repair() {
    let Ok(exe) = std::env::current_exe() else { return };
    append_startup_log(&format!("start v{} from '{}'", env!("CARGO_PKG_VERSION"), exe.display()));

    if cfg!(debug_assertions) || !is_installed_exe(&exe) {
        return;
    }
    std::thread::spawn(move || {
        repair_autostart(&exe);
        repair_shortcuts(&exe);
    });
}

#[cfg(not(windows))]
pub fn spawn_install_repair() {}

#[cfg(not(windows))]
pub fn append_startup_log(_line: &str) {}

