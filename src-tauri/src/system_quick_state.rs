use std::ffi::c_void;

use serde::Serialize;
use windows::core::{s, w, IUnknown, Interface, GUID, HRESULT};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

const CLOUDSTORE_NIGHT_LIGHT_SUBKEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultAccount\\Current\\default$windows.data.bluelightreduction.bluelightreductionstate\\windows.data.bluelightreduction.bluelightreductionstate";
const WNF_PO_ENERGY_SAVER_SETTING: u64 = 0x41c6_013d_a3bc_2875;
const WNF_PO_ENERGY_SAVER_OVERRIDE: u64 = 0x41c6_013d_a3bc_3075;

const CLSID_RADIO_MANAGEMENT_API: GUID = GUID::from_u128(0x581333f6_28db_41be_bc7a_ff201f12f3f6);
const IID_IRADIO_MANAGER: GUID = GUID::from_u128(0xdb3afbfb_08e6_46c6_aa70_bf9a34c30ab7);

type NtQueryWnfStateDataFn = unsafe extern "system" fn(
    state_name: *const u64,
    type_id: *const c_void,
    explicit_scope: *const c_void,
    change_stamp: *mut u32,
    buffer: *mut c_void,
    buffer_size: *mut u32,
) -> i32;

type NtUpdateWnfStateDataFn = unsafe extern "system" fn(
    state_name: *const u64,
    buffer: *const c_void,
    length: u32,
    type_id: *const c_void,
    explicit_scope: *const c_void,
    matching_change_stamp: u32,
    check_stamp: u32,
) -> i32;

#[repr(C)]
struct RadioManagerVtbl {
    query_interface:
        unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> HRESULT,
    add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
    release: unsafe extern "system" fn(*mut c_void) -> u32,
    is_rm_supported: unsafe extern "system" fn(*mut c_void, *mut u32) -> HRESULT,
    get_ui_radio_instances: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> HRESULT,
    get_system_radio_state:
        unsafe extern "system" fn(*mut c_void, *mut i32, *mut i32, *mut u32) -> HRESULT,
    set_system_radio_state: unsafe extern "system" fn(*mut c_void, i32) -> HRESULT,
}

#[repr(C)]
struct RadioManagerRaw {
    vtbl: *const RadioManagerVtbl,
}

struct RadioManagerGuard(*mut RadioManagerRaw);

impl Drop for RadioManagerGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                let release = (*(*self.0).vtbl).release;
                release(self.0 as *mut c_void);
            }
        }
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct QuickTogglesState {
    pub airplane_mode: bool,
    pub battery_saver: bool,
    pub night_light: bool,
    pub hotspot_enabled: bool,
    pub dnd_enabled: bool,
}

pub(crate) fn query_wnf_state_bytes(state_name: u64) -> Option<Vec<u8>> {
    unsafe {
        let ntdll = GetModuleHandleW(w!("ntdll.dll")).ok()?;
        let proc = GetProcAddress(ntdll, s!("NtQueryWnfStateData"))?;
        let query_fn: NtQueryWnfStateDataFn = std::mem::transmute(proc);

        let mut stamp: u32 = 0;
        let mut size: u32 = 64;
        let mut buf = vec![0u8; size as usize];
        let mut status = query_fn(
            &state_name,
            std::ptr::null(),
            std::ptr::null(),
            &mut stamp,
            buf.as_mut_ptr() as *mut c_void,
            &mut size,
        );

        // Retry once if payload exceeds initial 64-byte stack guess (STATUS_BUFFER_TOO_SMALL).
        if status == 0xC0000023u32 as i32 && size > buf.len() as u32 && size <= 4096 {
            buf.resize(size as usize, 0);
            status = query_fn(
                &state_name,
                std::ptr::null(),
                std::ptr::null(),
                &mut stamp,
                buf.as_mut_ptr() as *mut c_void,
                &mut size,
            );
        }

        if status >= 0 {
            buf.truncate((size as usize).min(buf.len()));
            Some(buf)
        } else {
            None
        }
    }
}

pub(crate) fn update_wnf_state_u32(state_name: u64, value: u32) -> Result<(), String> {
    unsafe {
        let ntdll = GetModuleHandleW(w!("ntdll.dll"))
            .map_err(|e| format!("Failed to locate ntdll.dll: {e:?}"))?;
        let proc = GetProcAddress(ntdll, s!("NtUpdateWnfStateData"))
            .ok_or_else(|| "NtUpdateWnfStateData export unavailable".to_string())?;
        let update_fn: NtUpdateWnfStateDataFn = std::mem::transmute(proc);

        let payload = value.to_le_bytes();
        let status = update_fn(
            &state_name,
            payload.as_ptr() as *const c_void,
            payload.len() as u32,
            std::ptr::null(),
            std::ptr::null(),
            0,
            0,
        );
        if status >= 0 {
            Ok(())
        } else {
            Err(format!(
                "NtUpdateWnfStateData failed with status 0x{:08X}",
                status as u32
            ))
        }
    }
}

fn read_airplane_mode() -> bool {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) =
        hklm.open_subkey("SYSTEM\\CurrentControlSet\\Control\\RadioManagement\\SystemRadioState")
    {
        if let Ok(val) = key.get_value::<u32, _>("") {
            return val == 1;
        }
    }
    false
}

fn read_battery_saver() -> bool {
    let mut sps = SYSTEM_POWER_STATUS::default();
    let flag_active =
        unsafe { GetSystemPowerStatus(&mut sps).is_ok() } && sps.SystemStatusFlag != 0;
    if flag_active {
        return true;
    }
    let setting_on = query_wnf_state_bytes(WNF_PO_ENERGY_SAVER_SETTING)
        .and_then(|bytes| bytes.first().copied())
        == Some(1);
    let override_on = query_wnf_state_bytes(WNF_PO_ENERGY_SAVER_OVERRIDE)
        .and_then(|bytes| bytes.first().copied())
        == Some(1);
    setting_on || override_on
}

pub(crate) fn parse_night_light_bytes(bytes: &[u8]) -> bool {
    if bytes.len() > 20 && bytes[18] == 0x15 {
        return true;
    }
    bytes.windows(4).any(|w| w == [0x15, 0x10, 0x00, 0x43])
}

fn bump_cloudstore_timestamp(bytes: &mut [u8]) {
    if bytes.len() < 15 {
        return;
    }
    // Preserve LEB128 continuation bits (bit 7) across bytes 10..15 while advancing timestamp.
    for byte in &mut bytes[10..15] {
        let low = *byte & 0x7F;
        if low < 0x7F {
            *byte = (*byte & 0x80) | (low + 1);
            break;
        }
        *byte &= 0x80;
    }
}

pub(crate) fn transform_night_light_cloudstore_bytes(
    data: &[u8],
    enable: bool,
) -> Option<Vec<u8>> {
    if data.len() < 23 || (data[18] != 0x13 && data[18] != 0x15) {
        return None;
    }

    let currently_on = data[18] == 0x15;
    if enable == currently_on {
        return Some(data.to_vec());
    }

    let mut out = data.to_vec();
    if enable {
        out[18] = 0x15;
        // CloudStore inner property bag begins with [43 42 01 00] at 19..23; active flag [10 00] goes after it at 23.
        let insert_idx = if out[19..23] == [0x43, 0x42, 0x01, 0x00] {
            23
        } else {
            19
        };
        out.splice(insert_idx..insert_idx, [0x10, 0x00]);
    } else {
        if out.len() < 25 {
            return None;
        }
        out[18] = 0x13;
        if out[23..25] == [0x10, 0x00] {
            out.drain(23..25);
        } else if out[19..21] == [0x10, 0x00] {
            out.drain(19..21);
        } else {
            return None;
        }
    }

    bump_cloudstore_timestamp(&mut out);
    Some(out)
}

fn read_night_light() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey(CLOUDSTORE_NIGHT_LIGHT_SUBKEY) {
        if let Ok(raw) = key.get_raw_value("Data") {
            return parse_night_light_bytes(&raw.bytes);
        }
    }
    false
}

pub fn open_windows_uri(target: &str) {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return;
    }
    let lower = trimmed.to_lowercase();
    if matches!(
        lower.as_str(),
        "calculator" | "calculator:" | "calculatorapp" | "calc"
    ) {
        if crate::windows_pinned_apps::shell_execute_open("calculator:", "", None)
            || crate::windows_pinned_apps::shell_execute_open("calc.exe", "", None)
        {
            return;
        }
    } else if let Some(proto) = crate::windows_pinned_apps::resolve_protocol_for_app(trimmed, "") {
        if crate::windows_pinned_apps::shell_execute_open(proto, "", None) {
            return;
        }
    }
    if crate::windows_pinned_apps::shell_execute_open(trimmed, "", None) {
        return;
    }
    let target_path = std::path::Path::new(trimmed);
    let is_windowsapps_dir = lower.contains("\\windowsapps") && target_path.is_dir();
    if (target_path.exists() && !is_windowsapps_dir)
        || (lower.starts_with("shell:") && !lower.starts_with("shell:appsfolder\\"))
    {
        let _ = std::process::Command::new("explorer.exe").arg(trimmed).spawn();
    }
}

#[tauri::command]
pub async fn get_quick_toggles_state() -> QuickTogglesState {
    let hotspot_enabled = crate::connectivity::get_hotspot_status()
        .await
        .unwrap_or(false);

    tauri::async_runtime::spawn_blocking(move || QuickTogglesState {
        airplane_mode: read_airplane_mode(),
        battery_saver: read_battery_saver(),
        night_light: read_night_light(),
        hotspot_enabled,
        dnd_enabled: crate::windows_dnd::get_windows_dnd(),
    })
    .await
    .unwrap_or(QuickTogglesState {
        airplane_mode: false,
        battery_saver: false,
        night_light: false,
        hotspot_enabled,
        dnd_enabled: false,
    })
}

fn set_airplane_mode_com(enable: Option<bool>) -> Result<bool, String> {
    unsafe {
        let init_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let should_uninit = init_hr.is_ok();

        let result = (|| -> Result<bool, String> {
            let unk: IUnknown = CoCreateInstance(&CLSID_RADIO_MANAGEMENT_API, None, CLSCTX_ALL)
                .map_err(|e| format!("Failed to instantiate RadioManagementAPI: {e:?}"))?;

            let mut rm_ptr: *mut c_void = std::ptr::null_mut();
            let qi_hr = unk.query(&IID_IRADIO_MANAGER, &mut rm_ptr);
            if qi_hr.is_err() || rm_ptr.is_null() {
                return Err(format!("IRadioManager QueryInterface failed: {qi_hr:?}"));
            }
            let guard = RadioManagerGuard(rm_ptr as *mut RadioManagerRaw);
            let vtbl = &*(*guard.0).vtbl;

            let mut supported: u32 = 0;
            let sup_hr = (vtbl.is_rm_supported)(guard.0 as *mut c_void, &mut supported);
            if sup_hr.is_err() || supported == 0 {
                return Err("System radio management is unavailable on this device".to_string());
            }

            // IRadioManager::GetSystemRadioState returns sys_enabled == 1 when radios are ON (Airplane OFF).
            let mut radios_enabled: i32 = 1;
            let mut param2: i32 = 0;
            let mut reason: u32 = 0;
            let get_hr = (vtbl.get_system_radio_state)(
                guard.0 as *mut c_void,
                &mut radios_enabled,
                &mut param2,
                &mut reason,
            );
            let current_airplane_on = if get_hr.is_ok() {
                radios_enabled == 0
            } else {
                read_airplane_mode()
            };

            let target_airplane_on = enable.unwrap_or(!current_airplane_on);
            let target_radios_enabled = if target_airplane_on { 0 } else { 1 };
            let set_hr = (vtbl.set_system_radio_state)(guard.0 as *mut c_void, target_radios_enabled);
            if set_hr.is_err() {
                return Err(format!("SetSystemRadioState failed: {set_hr:?}"));
            }

            let mut updated_radios_enabled: i32 = target_radios_enabled;
            let verify_hr = (vtbl.get_system_radio_state)(
                guard.0 as *mut c_void,
                &mut updated_radios_enabled,
                &mut param2,
                &mut reason,
            );
            if verify_hr.is_ok() {
                Ok(updated_radios_enabled == 0)
            } else {
                Ok(target_airplane_on)
            }
        })();

        if should_uninit {
            CoUninitialize();
        }
        result
    }
}

#[tauri::command]
pub async fn toggle_airplane_mode(enable: Option<bool>) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || set_airplane_mode_com(enable))
        .await
        .map_err(|e| format!("Airplane mode task failed: {e}"))?
}

#[tauri::command]
pub async fn toggle_battery_saver(enable: Option<bool>) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let current = read_battery_saver();
        let target = enable.unwrap_or(!current);
        let payload = if target { 1u32 } else { 2u32 };
        update_wnf_state_u32(WNF_PO_ENERGY_SAVER_OVERRIDE, payload)?;
        Ok(target)
    })
    .await
    .map_err(|e| format!("Battery saver task failed: {e}"))?
}

fn write_night_light_registry(enable: Option<bool>) -> Result<bool, String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_BINARY};
    use winreg::{RegKey, RegValue};

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey_with_flags(CLOUDSTORE_NIGHT_LIGHT_SUBKEY, KEY_READ | KEY_WRITE)
        .map_err(|e| format!("Failed to open CloudStore Night Light key: {e}"))?;

    let raw = key
        .get_raw_value("Data")
        .map_err(|e| format!("Failed to read Night Light Data value: {e}"))?;
    let current = parse_night_light_bytes(&raw.bytes);
    let target = enable.unwrap_or(!current);
    let updated_bytes = transform_night_light_cloudstore_bytes(&raw.bytes, target)
        .ok_or_else(|| "Unsupported Night Light CloudStore payload layout".to_string())?;

    let val = RegValue {
        bytes: updated_bytes.into(),
        vtype: REG_BINARY,
    };
    key.set_raw_value("Data", &val)
        .map_err(|e| format!("Failed to write Night Light Data value: {e}"))?;
    Ok(target)
}

#[tauri::command]
pub async fn toggle_night_light(enable: Option<bool>) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || write_night_light_registry(enable))
        .await
        .map_err(|e| format!("Night Light task failed: {e}"))?
}

fn accessibility_feature_uri(feature: &str) -> &'static str {
    match feature {
        "magnifier" => "ms-settings:easeofaccess-magnifier",
        "narrator" => "ms-settings:easeofaccess-narrator",
        "colorfilter" => "ms-settings:easeofaccess-colorfilter",
        "audio" => "ms-settings:easeofaccess-audio",
        "captions" => "ms-settings:easeofaccess-closedcaptioning",
        _ => "ms-settings:easeofaccess-display",
    }
}

#[tauri::command]
pub fn open_accessibility_feature(feature: String) {
    open_windows_uri(accessibility_feature_uri(&feature));
}

#[cfg(test)]
mod tests {
    use super::{
        accessibility_feature_uri, bump_cloudstore_timestamp, parse_night_light_bytes,
        transform_night_light_cloudstore_bytes,
    };

    #[test]
    fn parses_cloudstore_night_light_off_and_on() {
        let off = [
            0x43, 0x42, 0x01, 0x00, 0x0A, 0x02, 0x01, 0x00, 0x2A, 0x06, 0xC8, 0xB3, 0xA2, 0xD6,
            0x06, 0x2A, 0x2B, 0x0E, 0x13, 0x43, 0x42, 0x01, 0x00,
        ];
        let on = [
            0x43, 0x42, 0x01, 0x00, 0x0A, 0x02, 0x01, 0x00, 0x2A, 0x06, 0xC8, 0xB3, 0xA2, 0xD6,
            0x06, 0x2A, 0x2B, 0x0E, 0x15, 0x10, 0x00, 0x43, 0x42, 0x01, 0x00,
        ];
        assert!(!parse_night_light_bytes(&off));
        assert!(parse_night_light_bytes(&on));
        assert!(!parse_night_light_bytes(&[]));
    }

    #[test]
    fn transforms_night_light_cloudstore_payload_roundtrip() {
        let off = [
            0x43, 0x42, 0x01, 0x00, 0x0A, 0x02, 0x01, 0x00, 0x2A, 0x06, 0xCE, 0xB3, 0xA2, 0xD6,
            0x06, 0x2A, 0x2B, 0x0E, 0x13, 0x43, 0x42, 0x01, 0x00, 0xD0, 0x0A, 0x02, 0xC6, 0x14,
        ];
        let turned_on = transform_night_light_cloudstore_bytes(&off, true).unwrap();
        assert_eq!(turned_on.len(), off.len() + 2);
        assert_eq!(turned_on[18], 0x15);
        assert_eq!(&turned_on[19..25], &[0x43, 0x42, 0x01, 0x00, 0x10, 0x00]);
        assert_eq!(turned_on[10], 0xCF);
        assert!(parse_night_light_bytes(&turned_on));

        let turned_off = transform_night_light_cloudstore_bytes(&turned_on, false).unwrap();
        assert_eq!(turned_off.len(), off.len());
        assert_eq!(turned_off[18], 0x13);
        assert_eq!(&turned_off[19..23], &[0x43, 0x42, 0x01, 0x00]);
        assert_eq!(turned_off[10], 0xD0);
        assert!(!parse_night_light_bytes(&turned_off));

        assert!(transform_night_light_cloudstore_bytes(&[0x43, 0x42], true).is_none());
    }

    #[test]
    fn parses_night_light_length_boundary_and_pattern_fallback() {
        let mut exact_20 = vec![0u8; 20];
        exact_20[18] = 0x15;
        assert!(!parse_night_light_bytes(&exact_20));

        let mut len_21 = vec![0u8; 21];
        len_21[18] = 0x15;
        assert!(parse_night_light_bytes(&len_21));

        let pattern_only = [0x01, 0x02, 0x15, 0x10, 0x00, 0x43, 0x99];
        assert!(parse_night_light_bytes(&pattern_only));
    }

    #[test]
    fn bumps_cloudstore_leb128_timestamp_and_handles_rollover() {
        let mut short = [1u8; 14];
        bump_cloudstore_timestamp(&mut short);
        assert_eq!(short, [1u8; 14]);

        let mut normal = vec![0u8; 16];
        normal[10] = 0x2A;
        bump_cloudstore_timestamp(&mut normal);
        assert_eq!(normal[10], 0x2B);

        // Low 7 bits full (0x7F) with continuation bit 7 set -> resets to 0x80 and carries into byte 11
        let mut carry = vec![0u8; 16];
        carry[10] = 0xFF;
        carry[11] = 0x81;
        bump_cloudstore_timestamp(&mut carry);
        assert_eq!(carry[10], 0x80);
        assert_eq!(carry[11], 0x82);
    }

    #[test]
    fn transforms_night_light_idempotent_alternate_layout_and_invalid_inputs() {
        let mut off_alt = vec![0u8; 24];
        off_alt[10] = 0x10;
        off_alt[18] = 0x13;
        off_alt[19..23].copy_from_slice(&[0x01, 0x02, 0x03, 0x04]);

        // Already disabled -> returns exact clone without timestamp bump
        assert_eq!(
            transform_night_light_cloudstore_bytes(&off_alt, false),
            Some(off_alt.clone())
        );

        let on_alt = transform_night_light_cloudstore_bytes(&off_alt, true).unwrap();
        assert_eq!(on_alt.len(), off_alt.len() + 2);
        assert_eq!(on_alt[18], 0x15);
        assert_eq!(&on_alt[19..21], &[0x10, 0x00]);
        assert_eq!(on_alt[10], 0x11);

        // Already enabled -> returns exact clone
        assert_eq!(
            transform_night_light_cloudstore_bytes(&on_alt, true),
            Some(on_alt.clone())
        );

        let off_again = transform_night_light_cloudstore_bytes(&on_alt, false).unwrap();
        assert_eq!(off_again.len(), off_alt.len());
        assert_eq!(off_again[18], 0x13);
        assert_eq!(&off_again[19..23], &[0x01, 0x02, 0x03, 0x04]);
        assert_eq!(off_again[10], 0x12);

        // Invalid marker byte
        let mut bad_marker = vec![0u8; 26];
        bad_marker[18] = 0x14;
        assert!(transform_night_light_cloudstore_bytes(&bad_marker, true).is_none());

        // Disabling payload shorter than 25 bytes or missing [0x10, 0x00] marker
        let mut short_on = vec![0u8; 24];
        short_on[18] = 0x15;
        assert!(transform_night_light_cloudstore_bytes(&short_on, false).is_none());

        let mut missing_flag_on = vec![0u8; 26];
        missing_flag_on[18] = 0x15;
        assert!(transform_night_light_cloudstore_bytes(&missing_flag_on, false).is_none());
    }

    #[test]
    fn maps_accessibility_features_to_ms_settings_uris() {
        assert_eq!(
            accessibility_feature_uri("magnifier"),
            "ms-settings:easeofaccess-magnifier"
        );
        assert_eq!(
            accessibility_feature_uri("narrator"),
            "ms-settings:easeofaccess-narrator"
        );
        assert_eq!(
            accessibility_feature_uri("colorfilter"),
            "ms-settings:easeofaccess-colorfilter"
        );
        assert_eq!(
            accessibility_feature_uri("audio"),
            "ms-settings:easeofaccess-audio"
        );
        assert_eq!(
            accessibility_feature_uri("captions"),
            "ms-settings:easeofaccess-closedcaptioning"
        );
        assert_eq!(
            accessibility_feature_uri("display"),
            "ms-settings:easeofaccess-display"
        );
        assert_eq!(
            accessibility_feature_uri("unknown"),
            "ms-settings:easeofaccess-display"
        );
    }
}
