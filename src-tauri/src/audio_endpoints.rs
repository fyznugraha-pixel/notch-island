#![allow(non_snake_case)]

use windows::Win32::Media::Audio::{
    eRender, eMultimedia, eConsole, eCommunications,
    IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
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

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
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

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let policy_config: IPolicyConfig = CoCreateInstance(&CLSID_POLICY_CONFIG, None, CLSCTX_ALL)
            .map_err(|e| format!("Failed to create IPolicyConfig: {}", e))?;

        let id_wide: Vec<u16> = OsStr::new(id).encode_wide().chain(std::iter::once(0)).collect();
        let pcwstr = PCWSTR(id_wide.as_ptr());

        // Set default for Multimedia, Console, and Communications
        let _ = policy_config.SetDefaultEndpoint(pcwstr, eMultimedia);
        let _ = policy_config.SetDefaultEndpoint(pcwstr, eConsole);
        let _ = policy_config.SetDefaultEndpoint(pcwstr, eCommunications);
    }

    Ok(())
}
