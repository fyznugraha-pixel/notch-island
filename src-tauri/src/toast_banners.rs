use winreg::enums::*;
use winreg::RegKey;

const APP_SETTINGS_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings";
const BACKUP_PATH: &str = "Software\\Gili\\ToastBannerBackup";
const ACTIVE_MARKER: &str = "__active";
const ABSENT: &str = "absent";

// Hides the Windows popup banner per app but keeps toasts flowing into the Action Center,
// which is where UserNotificationListener reads them from to show on Gili.
fn suppress_banners(hkcu: &RegKey) -> Result<(), String> {
    let apps = hkcu
        .open_subkey_with_flags(APP_SETTINGS_PATH, KEY_READ)
        .map_err(|e| e.to_string())?;
    let (backup, _) = hkcu.create_subkey(BACKUP_PATH).map_err(|e| e.to_string())?;

    for app_id in apps.enum_keys().flatten() {
        let Ok(app_key) = hkcu.open_subkey_with_flags(
            format!("{}\\{}", APP_SETTINGS_PATH, app_id),
            KEY_READ | KEY_SET_VALUE,
        ) else {
            continue;
        };
        let has_backup = if backup.get_value::<String, _>(&app_id).is_ok() {
            true
        } else {
            let previous = match app_key.get_value::<u32, _>("ShowBanner") {
                Ok(v) => v.to_string(),
                Err(_) => ABSENT.to_string(),
            };
            backup.set_value(&app_id, &previous).is_ok()
        };
        if has_backup {
            let _ = app_key.set_value("ShowBanner", &0u32);
        }
    }

    backup.set_value(ACTIVE_MARKER, &"1").map_err(|e| e.to_string())
}

fn restore_banners(hkcu: &RegKey) {
    let Ok(backup) = hkcu.open_subkey_with_flags(BACKUP_PATH, KEY_READ | KEY_SET_VALUE) else {
        return;
    };
    let mut all_restored = true;
    let entries: Vec<String> = backup
        .enum_values()
        .flatten()
        .map(|(app_id, _)| app_id)
        .collect();

    for app_id in entries {
        if app_id == ACTIVE_MARKER {
            continue;
        }
        let previous = match backup.get_value::<String, _>(&app_id) {
            Ok(val) => val,
            Err(_) => {
                all_restored = false;
                continue;
            }
        };
        let app_key = match hkcu.open_subkey_with_flags(
            format!("{}\\{}", APP_SETTINGS_PATH, app_id),
            KEY_SET_VALUE,
        ) {
            Ok(k) => k,
            Err(err) => {
                if err.kind() == std::io::ErrorKind::NotFound {
                    let _ = backup.delete_value(&app_id);
                } else {
                    all_restored = false;
                }
                continue;
            }
        };
        let restored = if previous == ABSENT {
            match app_key.delete_value("ShowBanner") {
                Ok(()) => true,
                Err(err) => err.kind() == std::io::ErrorKind::NotFound,
            }
        } else if let Ok(v) = previous.parse::<u32>() {
            app_key.set_value("ShowBanner", &v).is_ok()
        } else {
            false
        };

        if restored {
            let _ = backup.delete_value(&app_id);
        } else {
            all_restored = false;
        }
    }

    if all_restored {
        let _ = hkcu.delete_subkey_all(BACKUP_PATH);
    }
}

pub fn restore_banners_on_exit() {
    if get_windows_banners_hidden() {
        restore_banners(&RegKey::predef(HKEY_CURRENT_USER));
    }
}

pub fn check_and_recover_banners_on_startup() {
    restore_banners_on_exit();
}

#[tauri::command]
pub fn set_windows_banners_hidden(hidden: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if hidden {
        suppress_banners(&hkcu)
    } else {
        restore_banners(&hkcu);
        Ok(())
    }
}

#[tauri::command]
pub fn get_windows_banners_hidden() -> bool {
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(BACKUP_PATH)
        .and_then(|key| key.get_value::<String, _>(ACTIVE_MARKER))
        .is_ok()
}
