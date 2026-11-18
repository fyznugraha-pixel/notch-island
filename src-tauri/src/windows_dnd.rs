use winreg::enums::*;
use winreg::RegKey;

// WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED
const WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED: u64 = 0x0D83063EA3BF1C75;
const NOTIF_SETTINGS_PATH: &str =
    "Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings";
const FOCUS_ASSIST_PATH: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\FocusAssist";
const DND_BACKUP_PATH: &str = "Software\\Gili\\DndBackup";
const ACTIVE_MARKER: &str = "__active";
const ABSENT: &str = "absent";

#[link(name = "ntdll")]
extern "system" {
    fn NtQueryWnfStateData(
        state_name: *const u64,
        type_id: *const std::ffi::c_void,
        explicit_scope: *const std::ffi::c_void,
        change_stamp: *mut u32,
        buffer: *mut u8,
        buffer_size: *mut u32,
    ) -> i32;

    fn NtUpdateWnfStateData(
        state_name: *const u64,
        buffer: *const u8,
        length: u32,
        type_id: *const std::ffi::c_void,
        explicit_scope: *const std::ffi::c_void,
        matching_change_stamp: u32,
        check_stamp: u32,
    ) -> i32;
}

fn query_current_wnf_profile() -> Option<u32> {
    let mut buffer = [0u8; 4];
    let mut buffer_size: u32 = 4;
    let mut change_stamp: u32 = 0;

    unsafe {
        let status = NtQueryWnfStateData(
            &WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED,
            std::ptr::null(),
            std::ptr::null(),
            &mut change_stamp,
            buffer.as_mut_ptr(),
            &mut buffer_size,
        );
        if status == 0 && buffer_size >= 1 {
            return Some(u32::from_le_bytes(buffer));
        }
    }
    None
}

fn read_u32_or_absent(key: &Result<RegKey, std::io::Error>, name: &str) -> String {
    match key {
        Ok(k) => match k.get_value::<u32, _>(name) {
            Ok(v) => v.to_string(),
            Err(_) => ABSENT.to_string(),
        },
        Err(_) => ABSENT.to_string(),
    }
}

fn backup_original_dnd_state(hkcu: &RegKey) {
    let Ok((backup, _)) = hkcu.create_subkey(DND_BACKUP_PATH) else {
        return;
    };
    // Preserve the very first pre-Gili snapshot if DND is enabled repeatedly.
    if backup.get_value::<String, _>(ACTIVE_MARKER).ok().as_deref() == Some("1") {
        return;
    }

    let wnf_val = match query_current_wnf_profile() {
        Some(p) => p.to_string(),
        None => ABSENT.to_string(),
    };
    let notif_key = hkcu.open_subkey_with_flags(NOTIF_SETTINGS_PATH, KEY_READ);
    let toasts_val = read_u32_or_absent(&notif_key, "NOC_GLOBAL_SETTING_TOASTS_ENABLED");

    let focus_key = hkcu.open_subkey_with_flags(FOCUS_ASSIST_PATH, KEY_READ);
    let qh_active_val = read_u32_or_absent(&focus_key, "QuietHoursActive");
    let qh_enabled_val = read_u32_or_absent(&focus_key, "QuietHoursEnabled");

    if backup.set_value("wnf_profile", &wnf_val).is_ok()
        && backup
            .set_value("NOC_GLOBAL_SETTING_TOASTS_ENABLED", &toasts_val)
            .is_ok()
        && backup.set_value("QuietHoursActive", &qh_active_val).is_ok()
        && backup.set_value("QuietHoursEnabled", &qh_enabled_val).is_ok()
    {
        let _ = backup.set_value(ACTIVE_MARKER, &"1");
    }
}

fn restore_reg_u32_or_absent(key: &RegKey, name: &str, saved: &str, fallback_delete_val: Option<u32>) {
    if saved == ABSENT {
        if let Err(err) = key.delete_value(name) {
            if err.kind() != std::io::ErrorKind::NotFound {
                if let Some(fallback) = fallback_delete_val {
                    let _ = key.set_value(name, &fallback);
                }
            }
        }
    } else if let Ok(v) = saved.parse::<u32>() {
        let _ = key.set_value(name, &v);
    }
}

pub fn restore_windows_dnd_from_backup() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(backup) = hkcu.open_subkey_with_flags(DND_BACKUP_PATH, KEY_READ) else {
        return false;
    };
    if backup.get_value::<String, _>(ACTIVE_MARKER).ok().as_deref() != Some("1") {
        return false;
    }

    let wnf_saved = backup
        .get_value::<String, _>("wnf_profile")
        .unwrap_or_else(|_| ABSENT.to_string());
    let wnf_profile = if wnf_saved == ABSENT {
        0u32
    } else {
        wnf_saved.parse::<u32>().unwrap_or(0u32)
    };
    let payload = wnf_profile.to_le_bytes();
    unsafe {
        let _ = NtUpdateWnfStateData(
            &WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED,
            payload.as_ptr(),
            4,
            std::ptr::null(),
            std::ptr::null(),
            0,
            0,
        );
    }

    let toasts_saved = backup
        .get_value::<String, _>("NOC_GLOBAL_SETTING_TOASTS_ENABLED")
        .unwrap_or_else(|_| ABSENT.to_string());
    if let Ok(key) = hkcu.open_subkey_with_flags(NOTIF_SETTINGS_PATH, KEY_SET_VALUE) {
        restore_reg_u32_or_absent(&key, "NOC_GLOBAL_SETTING_TOASTS_ENABLED", &toasts_saved, Some(1));
    }

    let qh_active_saved = backup
        .get_value::<String, _>("QuietHoursActive")
        .unwrap_or_else(|_| ABSENT.to_string());
    let qh_enabled_saved = backup
        .get_value::<String, _>("QuietHoursEnabled")
        .unwrap_or_else(|_| ABSENT.to_string());
    if let Ok(key) = hkcu.open_subkey_with_flags(FOCUS_ASSIST_PATH, KEY_SET_VALUE) {
        restore_reg_u32_or_absent(&key, "QuietHoursActive", &qh_active_saved, None);
        restore_reg_u32_or_absent(&key, "QuietHoursEnabled", &qh_enabled_saved, None);
    }

    let _ = hkcu.delete_subkey_all(DND_BACKUP_PATH);
    true
}

/// Sets Windows native Do Not Disturb / Focus Assist state.
/// When enabled:
/// 1. Backups the user's pre-existing WNF profile & registry values.
/// 2. Broadcasts WNF state 0x0D83063EA3BF1C75 (1 = Priority Only / DND) to Windows Shell.
/// 3. Suppresses Windows toast notification banners via NOC_GLOBAL_SETTING_TOASTS_ENABLED = 0.
/// 4. Updates FocusAssist registry keys for system-wide compatibility.
#[tauri::command]
pub fn set_windows_dnd(enabled: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    if !enabled {
        if restore_windows_dnd_from_backup() {
            return Ok(());
        }
        let payload: [u8; 4] = [0, 0, 0, 0];
        unsafe {
            let _ = NtUpdateWnfStateData(
                &WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED,
                payload.as_ptr(),
                4,
                std::ptr::null(),
                std::ptr::null(),
                0,
                0,
            );
        }
        if let Ok((key, _)) = hkcu.create_subkey(NOTIF_SETTINGS_PATH) {
            let _ = key.set_value("NOC_GLOBAL_SETTING_TOASTS_ENABLED", &1u32);
        }
        if let Ok((key, _)) = hkcu.create_subkey(FOCUS_ASSIST_PATH) {
            let _ = key.set_value("QuietHoursActive", &0u32);
            let _ = key.set_value("QuietHoursEnabled", &0u32);
        }
        return Ok(());
    }

    backup_original_dnd_state(&hkcu);

    // 1. WNF State update
    let payload: [u8; 4] = [1, 0, 0, 0];
    unsafe {
        let _ = NtUpdateWnfStateData(
            &WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED,
            payload.as_ptr(),
            4,
            std::ptr::null(),
            std::ptr::null(),
            0,
            0,
        );
    }

    // 2. Suppress Windows native toast banners across the entire OS
    if let Ok((key, _)) = hkcu.create_subkey(NOTIF_SETTINGS_PATH) {
        let _ = key.set_value("NOC_GLOBAL_SETTING_TOASTS_ENABLED", &0u32);
    }

    // 3. Update legacy FocusAssist registry keys for Windows 10/11 compatibility
    if let Ok((key, _)) = hkcu.create_subkey(FOCUS_ASSIST_PATH) {
        let _ = key.set_value("QuietHoursActive", &1u32);
        let _ = key.set_value("QuietHoursEnabled", &1u32);
    }

    Ok(())
}

pub fn restore_windows_dnd_on_exit() {
    let _ = restore_windows_dnd_from_backup();
}

pub fn check_and_recover_dnd_on_startup() {
    let _ = restore_windows_dnd_from_backup();
}

/// Reads the current Windows native Do Not Disturb / Focus Assist state.
#[tauri::command]
pub fn get_windows_dnd() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Some(profile) = query_current_wnf_profile() {
        if (profile & 0xFF) > 0 {
            return true;
        }
        let has_gili_backup = hkcu
            .open_subkey(DND_BACKUP_PATH)
            .and_then(|k| k.get_value::<String, _>(ACTIVE_MARKER))
            .ok()
            .as_deref()
            == Some("1");
        if has_gili_backup {
            if let Ok(key) = hkcu.open_subkey(NOTIF_SETTINGS_PATH) {
                if let Ok(val) = key.get_value::<u32, _>("NOC_GLOBAL_SETTING_TOASTS_ENABLED") {
                    if val == 0 {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Fallback if WNF query fails: check registry
    if let Ok(key) = hkcu.open_subkey(NOTIF_SETTINGS_PATH) {
        if let Ok(val) = key.get_value::<u32, _>("NOC_GLOBAL_SETTING_TOASTS_ENABLED") {
            if val == 0 {
                return true;
            }
        }
    }
    false
}
