#![allow(non_snake_case)]

use windows::Win32::Media::Audio::{
    eRender, eMultimedia, eConsole, eCommunications,
    IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
};
use windows::Win32::UI::Shell::PropertiesSystem::PROPERTYKEY;
use windows::core::{PCWSTR, GUID};

const PKEY_DEVICE_FRIENDLY_NAME: PROPERTYKEY = PROPERTYKEY {
    fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
    pid: 14,
};

const PKEY_DEVICE_DESC: PROPERTYKEY = PROPERTYKEY {
    fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
    pid: 2,
};

const CLSID_POLICY_CONFIG: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

#[windows_core::interface("f8679f50-850a-41cf-9c72-430f290290c8")]
unsafe trait IPolicyConfig: windows_core::IUnknown {
    unsafe fn GetMixFormat(&self) -> windows::core::HRESULT;
    unsafe fn GetDeviceFormat(&self) -> windows::core::HRESULT;
    unsafe fn ResetDeviceFormat(&self) -> windows::core::HRESULT;
    unsafe fn SetDeviceFormat(&self) -> windows::core::HRESULT;
    unsafe fn GetProcessingPeriod(&self) -> windows::core::HRESULT;
    unsafe fn SetProcessingPeriod(&self) -> windows::core::HRESULT;
    unsafe fn GetShareMode(&self) -> windows::core::HRESULT;
    unsafe fn SetShareMode(&self) -> windows::core::HRESULT;
    unsafe fn GetPropertyValue(&self) -> windows::core::HRESULT;
    unsafe fn SetPropertyValue(&self) -> windows::core::HRESULT;
    unsafe fn SetDefaultEndpoint(&self, wsz_device_id: PCWSTR, role: windows::Win32::Media::Audio::ERole) -> windows::core::HRESULT;
    unsafe fn SetEndpointVisibility(&self) -> windows::core::HRESULT;
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AudioEndpointInfo {
    pub id: String,
    pub name: String,
    pub desc: String,
    pub is_default: bool,
    pub device_type: String, // "speaker", "headphones", "bluetooth", "display", "other"
}

pub fn list_audio_endpoints() -> Vec<AudioEndpointInfo> {
    let mut result = Vec::new();
    let _com = crate::ComGuard::init(COINIT_MULTITHREADED);

    unsafe {
        let Ok(enumerator) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) else {
            return result;
        };

        let mut default_id = String::new();
        if let Ok(default_device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
            if let Ok(id_ptr) = default_device.GetId() {
                if !id_ptr.is_null() {
                    let mut len = 0;
                    while *id_ptr.0.add(len) != 0 {
                        len += 1;
                    }
                    default_id = String::from_utf16_lossy(std::slice::from_raw_parts(id_ptr.0, len));
                }
                CoTaskMemFree(Some(id_ptr.0 as *const _));
            }
        }

        let Ok(collection) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) else {
            return result;
        };

        let count = collection.GetCount().unwrap_or(0);
        for i in 0..count {
            let Ok(device) = collection.Item(i) else {
                continue;
            };

            let mut device_id = String::new();
            if let Ok(id_ptr) = device.GetId() {
                if !id_ptr.is_null() {
                    let mut len = 0;
                    while *id_ptr.0.add(len) != 0 {
                        len += 1;
                    }
                    device_id = String::from_utf16_lossy(std::slice::from_raw_parts(id_ptr.0, len));
                }
                CoTaskMemFree(Some(id_ptr.0 as *const _));
            }

            if device_id.is_empty() {
                continue;
            }

            let mut friendly_name = String::new();
            let mut desc = String::new();

            if let Ok(props) = device.OpenPropertyStore(STGM_READ) {
                if let Ok(val) = props.GetValue(&PKEY_DEVICE_FRIENDLY_NAME) {
                    friendly_name = val.to_string();
                }
                if let Ok(val) = props.GetValue(&PKEY_DEVICE_DESC) {
                    desc = val.to_string();
                }
            }

            if friendly_name.is_empty() {
                friendly_name = if !desc.is_empty() {
                    desc.clone()
                } else {
                    format!("Audio Device {}", i + 1)
                };
            }

            let is_default = !default_id.is_empty() && device_id == default_id;
            let name_lower = friendly_name.to_lowercase();
            let desc_lower = desc.to_lowercase();

            let device_type = if name_lower.contains("headphone")
                || name_lower.contains("headset")
                || name_lower.contains("earphone")
                || name_lower.contains("airpods")
                || name_lower.contains("wh-1000")
                || name_lower.contains("buds")
                || desc_lower.contains("headphone")
            {
                "headphones".to_string()
            } else if name_lower.contains("dell")
                || name_lower.contains("hdmi")
                || name_lower.contains("display")
                || name_lower.contains("tv")
                || name_lower.contains("monitor")
                || desc_lower.contains("hdmi")
                || desc_lower.contains("displayport")
            {
                "display".to_string()
            } else if name_lower.contains("bluetooth") || desc_lower.contains("bluetooth") {
                "bluetooth".to_string()
            } else {
                "speaker".to_string()
            };

            result.push(AudioEndpointInfo {
                id: device_id,
                name: friendly_name,
                desc,
                is_default,
                device_type,
            });
        }
    }

    result
}

pub fn set_default_endpoint(id: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    let _com = crate::ComGuard::init(COINIT_MULTITHREADED);

    unsafe {
        let policy_config_res: Result<IPolicyConfig, _> = CoCreateInstance(&CLSID_POLICY_CONFIG, None, CLSCTX_ALL);
        match policy_config_res {
            Ok(policy_config) => {
                let id_wide: Vec<u16> = OsStr::new(id).encode_wide().chain(std::iter::once(0)).collect();
                let pcwstr = PCWSTR(id_wide.as_ptr());

                // Set default for Multimedia, Console, and Communications
                policy_config
                    .SetDefaultEndpoint(pcwstr, eMultimedia)
                    .ok()
                    .map_err(|e| format!("Failed to set eMultimedia endpoint: {}", e))?;
                policy_config
                    .SetDefaultEndpoint(pcwstr, eConsole)
                    .ok()
                    .map_err(|e| format!("Failed to set eConsole endpoint: {}", e))?;
                policy_config
                    .SetDefaultEndpoint(pcwstr, eCommunications)
                    .ok()
                    .map_err(|e| format!("Failed to set eCommunications endpoint: {}", e))?;
                Ok(())
            }
            Err(err) => {
                // Fallback to ms-settings:sound if IPolicyConfig fails on this Windows build
                let _ = std::process::Command::new("explorer").arg("ms-settings:sound").spawn();
                Err(format!("IPolicyConfig failed, falling back to ms-settings:sound: {}", err))
            }
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SpatialAudioInfo {
    pub format_name: String,
    pub is_enabled: bool,
    pub supported: bool,
}

fn resolve_spatial_format_name(clsid: &str) -> String {
    let trimmed = clsid.trim();
    if trimmed.eq_ignore_ascii_case("{B53D940C-B846-4831-9F76-D102B9B725A0}") {
        return "Windows Sonic untuk Headphone".to_string();
    }

    use winreg::enums::HKEY_CLASSES_ROOT;
    use winreg::RegKey;
    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);
    if let Ok(key) = hkcr.open_subkey(format!("CLSID\\{}", trimmed)) {
        if let Ok(name) = key.get_value::<String, _>("") {
            if !name.trim().is_empty() {
                return name;
            }
        }
    }
    "Spatial Sound Aktif".to_string()
}

pub fn get_spatial_audio_info() -> SpatialAudioInfo {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const SPATIAL_ENCODER_KEY: &str = "{9c119480-ddc2-4954-a150-5bd240d454ad},1";
    const ZERO_GUID: &str = "{00000000-0000-0000-0000-000000000000}";

    let _com = crate::ComGuard::init(COINIT_MULTITHREADED);
    let endpoint_guid = unsafe {
        CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
            .ok()
            .and_then(|e| e.GetDefaultAudioEndpoint(eRender, eMultimedia).ok())
            .and_then(|dev| {
                let id_ptr = dev.GetId().ok()?;
                let id = id_ptr.to_string().unwrap_or_default();
                CoTaskMemFree(Some(id_ptr.0 as *const std::ffi::c_void));
                id.rsplit('.').next().map(str::to_string)
            })
    };

    if let Some(guid) = endpoint_guid {
        let rel_path = format!(
            "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render\\{}\\FxProperties",
            guid
        );
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let val = hkcu
            .open_subkey(&rel_path)
            .ok()
            .and_then(|k| k.get_value::<String, _>(SPATIAL_ENCODER_KEY).ok())
            .or_else(|| {
                hklm.open_subkey(&rel_path)
                    .ok()
                    .and_then(|k| k.get_value::<String, _>(SPATIAL_ENCODER_KEY).ok())
            });

        if let Some(clsid) = val {
            let trimmed = clsid.trim();
            if !trimmed.is_empty() && trimmed != ZERO_GUID {
                return SpatialAudioInfo {
                    format_name: resolve_spatial_format_name(trimmed),
                    is_enabled: true,
                    supported: true,
                };
            }
        }
    }

    SpatialAudioInfo {
        format_name: "Mati".to_string(),
        is_enabled: false,
        supported: true,
    }
}

pub fn open_sound_settings_page(page: Option<&str>) {
    let target = match page {
        Some("mixer") | Some("apps-volume") => "ms-settings:apps-volume",
        _ => "ms-settings:sound",
    };
    let _ = std::process::Command::new("explorer").arg(target).spawn();
}
