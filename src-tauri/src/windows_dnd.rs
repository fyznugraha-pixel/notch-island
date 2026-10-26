use winreg::enums::*;
use winreg::RegKey;

// WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED
const WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED: u64 = 0x0D83063EA3BF1C75;

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

/// Sets Windows native Do Not Disturb / Focus Assist state.
/// When enabled:
/// 1. Broadcasts WNF state 0x0D83063EA3BF1C75 (1 = Priority Only / DND) to Windows Shell.
/// 2. Suppresses Windows toast notification banners via NOC_GLOBAL_SETTING_TOASTS_ENABLED = 0.
/// 3. Updates FocusAssist registry keys for system-wide compatibility.
#[tauri::command]
pub fn set_windows_dnd(enabled: bool) -> Result<(), String> {
    // 1. WNF State update
    let payload: [u8; 4] = if enabled { [1, 0, 0, 0] } else { [0, 0, 0, 0] };
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
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok((key, _)) = hkcu.create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings") {
        let val: u32 = if enabled { 0 } else { 1 };
        let _ = key.set_value("NOC_GLOBAL_SETTING_TOASTS_ENABLED", &val);
    }

    // 3. Update legacy FocusAssist registry keys for Windows 10/11 compatibility
    if let Ok((key, _)) = hkcu.create_subkey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\FocusAssist") {
        let val: u32 = if enabled { 1 } else { 0 };
        let _ = key.set_value("QuietHoursActive", &val);
        let _ = key.set_value("QuietHoursEnabled", &val);
    }

    Ok(())
}

/// Reads the current Windows native Do Not Disturb / Focus Assist state.
#[tauri::command]
pub fn get_windows_dnd() -> bool {
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
        if status == 0 && buffer[0] > 0 {
            return true;
        }
    }

    // Fallback: check registry
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings") {
        if let Ok(val) = key.get_value::<u32, _>("NOC_GLOBAL_SETTING_TOASTS_ENABLED") {
            if val == 0 {
                return true;
            }
        }
    }
    false
}
