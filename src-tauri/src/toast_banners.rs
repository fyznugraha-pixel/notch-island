use winreg::enums::*;
use winreg::RegKey;

const APP_SETTINGS_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings";
const BACKUP_PATH: &str = "Software\\Gili\\ToastBannerBackup";
const PREF_PATH: &str = "Software\\Gili\\Preferences";
const PREF_VALUE_NAME: &str = "HideWindowsBanners";
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StartupBannerAction {
    Suppress,
    RestoreOrphanBackup,
    Noop,
}

fn decide_startup_banner_action(
    pref_enabled: bool,
    has_active_backup: bool,
) -> StartupBannerAction {
    if pref_enabled {
        StartupBannerAction::Suppress
    } else if has_active_backup {
        StartupBannerAction::RestoreOrphanBackup
    } else {
        StartupBannerAction::Noop
    }
}

fn is_suppression_active(hkcu: &RegKey) -> bool {
    hkcu.open_subkey(BACKUP_PATH)
        .and_then(|key| key.get_value::<String, _>(ACTIVE_MARKER))
        .is_ok()
}

fn read_hide_banners_pref(hkcu: &RegKey) -> bool {
    hkcu.open_subkey(PREF_PATH)
        .and_then(|key| key.get_value::<u32, _>(PREF_VALUE_NAME))
        .ok()
        == Some(1)
}

fn write_hide_banners_pref(hkcu: &RegKey, enabled: bool) {
    if let Ok((key, _)) = hkcu.create_subkey(PREF_PATH) {
        let val = if enabled { 1u32 } else { 0u32 };
        let _ = key.set_value(PREF_VALUE_NAME, &val);
    }
}

pub fn restore_banners_on_exit() {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if is_suppression_active(&hkcu) {
        restore_banners(&hkcu);
    }
}

pub fn check_and_recover_banners_on_startup() {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match decide_startup_banner_action(read_hide_banners_pref(&hkcu), is_suppression_active(&hkcu)) {
        StartupBannerAction::Suppress => {
            let _ = suppress_banners(&hkcu);
        }
        StartupBannerAction::RestoreOrphanBackup => {
            restore_banners(&hkcu);
        }
        StartupBannerAction::Noop => {}
    }
}

#[tauri::command]
pub fn set_windows_banners_hidden(hidden: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if hidden {
        suppress_banners(&hkcu)?;
        write_hide_banners_pref(&hkcu, true);
        Ok(())
    } else {
        write_hide_banners_pref(&hkcu, false);
        restore_banners(&hkcu);
        Ok(())
    }
}

#[tauri::command]
pub fn get_windows_banners_hidden() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    read_hide_banners_pref(&hkcu) || is_suppression_active(&hkcu)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_banner_decision_respects_persisted_pref_and_orphan_backups() {
        assert_eq!(
            decide_startup_banner_action(true, false),
            StartupBannerAction::Suppress
        );
        assert_eq!(
            decide_startup_banner_action(true, true),
            StartupBannerAction::Suppress
        );
        assert_eq!(
            decide_startup_banner_action(false, true),
            StartupBannerAction::RestoreOrphanBackup
        );
        assert_eq!(
            decide_startup_banner_action(false, false),
            StartupBannerAction::Noop
        );
    }
}
