use std::process::Command;
use serde::{Deserialize, Serialize};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WifiNetwork {
    pub ssid: String,
    pub signal: u32,
    pub is_connected: bool,
    pub is_secure: bool,
    pub is_saved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WifiStatus {
    pub enabled: bool,
    pub connected_ssid: String,
    pub networks: Vec<WifiNetwork>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BluetoothDeviceItem {
    pub name: String,
    pub is_connected: bool,
    pub battery: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BluetoothStatus {
    pub enabled: bool,
    pub connected_name: String,
    pub devices: Vec<BluetoothDeviceItem>,
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
fn set_radio_state(kind: windows::Devices::Radios::RadioKind, enable: bool) -> Result<bool, String> {
    use windows::Devices::Radios::{Radio, RadioState};

    let op = Radio::GetRadiosAsync().map_err(|e| e.to_string())?;
    let radios = op.get().map_err(|e| e.to_string())?;

    for radio in radios {
        if let Ok(k) = radio.Kind() {
            if k == kind {
                let target = if enable { RadioState::On } else { RadioState::Off };
                let set_op = radio.SetStateAsync(target).map_err(|e| e.to_string())?;
                let _ = set_op.get().map_err(|e| e.to_string())?;
                return Ok(enable);
            }
        }
    }
    Err("Radio device not found".to_string())
}

#[cfg(windows)]
fn get_radio_state(kind: windows::Devices::Radios::RadioKind) -> Option<bool> {
    use windows::Devices::Radios::{Radio, RadioState};

    let op = Radio::GetRadiosAsync().ok()?;
    let radios = op.get().ok()?;

    for radio in radios {
        if let Ok(k) = radio.Kind() {
            if k == kind {
                return radio.State().ok().map(|s| s == RadioState::On);
            }
        }
    }
    None
}

// ======================== WI-FI ========================

#[tauri::command]
pub async fn get_wifi_status() -> Result<WifiStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(windows)]
        {
            use windows::Devices::Radios::RadioKind;

            let enabled = get_radio_state(RadioKind::WiFi).unwrap_or(true);

            // Get connected SSID from netsh interfaces
            let mut connected_ssid = String::new();
            if let Ok(output) = Command::new("netsh")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["wlan", "show", "interfaces"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("SSID") && !trimmed.starts_with("BSSID") && trimmed.contains(':') {
                        if let Some((_, val)) = trimmed.split_once(':') {
                            let s = val.trim();
                            if !s.is_empty() {
                                connected_ssid = s.to_string();
                                break;
                            }
                        }
                    }
                }
            }

            // Get saved profiles
            let mut saved_profiles = std::collections::HashSet::new();
            if let Ok(output) = Command::new("netsh")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["wlan", "show", "profiles"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if trimmed.contains(':') && (trimmed.starts_with("All User Profile") || trimmed.starts_with("User Profile")) {
                        if let Some((_, val)) = trimmed.split_once(':') {
                            let profile = val.trim();
                            if !profile.is_empty() {
                                saved_profiles.insert(profile.to_string());
                            }
                        }
                    }
                }
            }

            // Get visible networks
            let mut networks: Vec<WifiNetwork> = Vec::new();
            if enabled {
                if let Ok(output) = Command::new("netsh")
                    .creation_flags(CREATE_NO_WINDOW)
                    .args(["wlan", "show", "networks"])
                    .output()
                {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let mut current_ssid = String::new();
                    let mut is_secure = true;

                    for line in stdout.lines() {
                        let trimmed = line.trim();
                        if trimmed.starts_with("SSID") && trimmed.contains(':') {
                            // Save previous network
                            if !current_ssid.is_empty() && !networks.iter().any(|n| n.ssid == current_ssid) {
                                let is_connected = current_ssid == connected_ssid;
                                let is_saved = saved_profiles.contains(&current_ssid);
                                networks.push(WifiNetwork {
                                    ssid: current_ssid.clone(),
                                    signal: if is_connected { 85 } else { 70 },
                                    is_connected,
                                    is_secure,
                                    is_saved,
                                });
                            }
                            current_ssid.clear();
                            is_secure = true;

                            if let Some((_, val)) = trimmed.split_once(':') {
                                current_ssid = val.trim().to_string();
                            }
                        } else if trimmed.starts_with("Authentication") && trimmed.contains(':') {
                            if let Some((_, val)) = trimmed.split_once(':') {
                                if val.trim().to_lowercase().contains("open") {
                                    is_secure = false;
                                }
                            }
                        }
                    }

                    if !current_ssid.is_empty() && !networks.iter().any(|n| n.ssid == current_ssid) {
                        let is_connected = current_ssid == connected_ssid;
                        let is_saved = saved_profiles.contains(&current_ssid);
                        networks.push(WifiNetwork {
                            ssid: current_ssid,
                            signal: if is_connected { 85 } else { 70 },
                            is_connected,
                            is_secure,
                            is_saved,
                        });
                    }
                }
            }

            // If connected network is not in networks list, insert at top
            if !connected_ssid.is_empty() && !networks.iter().any(|n| n.ssid == connected_ssid) {
                networks.insert(
                    0,
                    WifiNetwork {
                        ssid: connected_ssid.clone(),
                        signal: 85,
                        is_connected: true,
                        is_secure: true,
                        is_saved: true,
                    },
                );
            }

            // Sort: connected first, then saved, then others
            networks.sort_by(|a, b| {
                if a.is_connected != b.is_connected {
                    return b.is_connected.cmp(&a.is_connected);
                }
                if a.is_saved != b.is_saved {
                    return b.is_saved.cmp(&a.is_saved);
                }
                a.ssid.to_lowercase().cmp(&b.ssid.to_lowercase())
            });

            Ok(WifiStatus {
                enabled,
                connected_ssid,
                networks,
            })
        }
        #[cfg(not(windows))]
        {
            Ok(WifiStatus {
                enabled: false,
                connected_ssid: String::new(),
                networks: Vec::new(),
            })
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn toggle_wifi(enable: bool) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            use windows::Devices::Radios::RadioKind;
            set_radio_state(RadioKind::WiFi, enable)
        }
        #[cfg(not(windows))]
        {
            Err("Unsupported platform".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn connect_wifi(ssid: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let output = Command::new("netsh")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["wlan", "connect", &format!("name={}", ssid)])
                .output()
                .map_err(|e| e.to_string())?;

            if output.status.success() {
                Ok(())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).to_string())
            }
        }
        #[cfg(not(windows))]
        {
            Err("Unsupported platform".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn disconnect_wifi() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let output = Command::new("netsh")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["wlan", "disconnect"])
                .output()
                .map_err(|e| e.to_string())?;

            if output.status.success() {
                Ok(())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).to_string())
            }
        }
        #[cfg(not(windows))]
        {
            Err("Unsupported platform".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

// ======================== BLUETOOTH ========================

#[tauri::command]
pub async fn get_bluetooth_status() -> Result<BluetoothStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(windows)]
        {
            use windows::core::GUID;
            use windows::Devices::Radios::RadioKind;
            use windows::Win32::Devices::DeviceAndDriverInstallation::{
                SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW,
                SetupDiGetDevicePropertyW, SetupDiGetDeviceRegistryPropertyW, DIGCF_PRESENT,
                SPDRP_FRIENDLYNAME, SP_DEVINFO_DATA,
            };
            use windows::Win32::Devices::Properties::{DEVPROPKEY, DEVPROPTYPE};

            let enabled = get_radio_state(RadioKind::Bluetooth).unwrap_or(false);

            let bt_class_guid = GUID::from_values(
                0xe0cbf06c,
                0xcd8b,
                0x4647,
                [0xbb, 0x8a, 0x26, 0x3b, 0x43, 0xf0, 0xf9, 0x74],
            );
            let devpkey_is_connected = DEVPROPKEY {
                fmtid: GUID::from_values(
                    0x83da6326,
                    0x97a6,
                    0x4088,
                    [0x94, 0x53, 0xa1, 0x92, 0x3f, 0x57, 0x3b, 0x29],
                ),
                pid: 15,
            };
            let devpkey_bt_battery = DEVPROPKEY {
                fmtid: GUID::from_values(
                    0x1032a323,
                    0xa72c,
                    0x4ba9,
                    [0xa7, 0xae, 0xa5, 0x04, 0xb6, 0x79, 0xb6, 0xa1],
                ),
                pid: 1,
            };

            let mut devices: Vec<BluetoothDeviceItem> = Vec::new();

            unsafe {
                if let Ok(dev_info) = SetupDiGetClassDevsW(Some(&bt_class_guid), None, None, DIGCF_PRESENT) {
                    if !dev_info.is_invalid() {
                        let mut index = 0;
                        loop {
                            let mut dev_data = SP_DEVINFO_DATA {
                                cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
                                ..Default::default()
                            };
                            if SetupDiEnumDeviceInfo(dev_info, index, &mut dev_data).is_err() {
                                break;
                            }
                            index += 1;

                            let mut name_buf = [0u8; 512];
                            if SetupDiGetDeviceRegistryPropertyW(
                                dev_info,
                                &dev_data,
                                SPDRP_FRIENDLYNAME,
                                None,
                                Some(&mut name_buf),
                                None,
                            )
                            .is_err()
                            {
                                continue;
                            }

                            let u16_slice = std::slice::from_raw_parts(
                                name_buf.as_ptr() as *const u16,
                                name_buf.len() / 2,
                            );
                            let len = u16_slice.iter().position(|&c| c == 0).unwrap_or(u16_slice.len());
                            let friendly_name = String::from_utf16_lossy(&u16_slice[..len]).trim().to_string();
                            if friendly_name.is_empty() {
                                continue;
                            }

                            let lower = friendly_name.to_lowercase();
                            if lower.contains("adapter")
                                || lower.contains("enumerator")
                                || lower.contains("microsoft")
                                || lower.contains("rfcomm")
                                || lower.contains("generic bluetooth")
                                || lower.contains("wireless bluetooth")
                                || lower.contains("avrcp")
                            {
                                continue;
                            }

                            let mut prop_type = DEVPROPTYPE::default();
                            let mut bat_buf = [0u8; 4];
                            let battery = if SetupDiGetDevicePropertyW(
                                dev_info,
                                &dev_data,
                                &devpkey_bt_battery,
                                &mut prop_type,
                                Some(&mut bat_buf),
                                None,
                                0,
                            )
                            .is_ok()
                            {
                                let pct = bat_buf[0];
                                if pct > 0 && pct <= 100 {
                                    Some(pct)
                                } else {
                                    None
                                }
                            } else {
                                None
                            };

                            let mut conn_buf = [0u8; 4];
                            let is_connected = SetupDiGetDevicePropertyW(
                                dev_info,
                                &dev_data,
                                &devpkey_is_connected,
                                &mut prop_type,
                                Some(&mut conn_buf),
                                None,
                                0,
                            )
                            .is_ok()
                                && conn_buf[0] != 0;

                            if !devices.iter().any(|d| d.name == friendly_name) {
                                devices.push(BluetoothDeviceItem {
                                    name: friendly_name,
                                    is_connected,
                                    battery,
                                });
                            }
                        }
                        let _ = SetupDiDestroyDeviceInfoList(dev_info);
                    }
                }
            }

            // Sort: connected first, then alphabetical
            devices.sort_by(|a, b| {
                if a.is_connected != b.is_connected {
                    return b.is_connected.cmp(&a.is_connected);
                }
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            });

            let connected_name = devices
                .iter()
                .find(|d| d.is_connected)
                .map(|d| {
                    if let Some(pct) = d.battery {
                        format!("{} ({}%)", d.name, pct)
                    } else {
                        d.name.clone()
                    }
                })
                .unwrap_or_else(|| if enabled { "Not Connected".to_string() } else { "Off".to_string() });

            Ok(BluetoothStatus {
                enabled,
                connected_name,
                devices,
            })
        }
        #[cfg(not(windows))]
        {
            Ok(BluetoothStatus {
                enabled: false,
                connected_name: String::new(),
                devices: Vec::new(),
            })
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn toggle_bluetooth(enable: bool) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            use windows::Devices::Radios::RadioKind;
            set_radio_state(RadioKind::Bluetooth, enable)
        }
        #[cfg(not(windows))]
        {
            Err("Unsupported platform".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
