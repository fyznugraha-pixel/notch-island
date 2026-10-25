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

#[cfg(windows)]
mod wlan_ffi {
    #![allow(non_snake_case, dead_code)]
    use std::ffi::c_void;

    #[repr(C)]
    pub struct WLAN_INTERFACE_INFO {
        pub InterfaceGuid: windows::core::GUID,
        pub strInterfaceDescription: [u16; 256],
        pub isState: u32,
    }

    #[repr(C)]
    pub struct WLAN_INTERFACE_INFO_LIST {
        pub dwNumberOfItems: u32,
        pub dwIndex: u32,
        pub InterfaceInfo: [WLAN_INTERFACE_INFO; 1],
    }

    #[link(name = "wlanapi")]
    extern "system" {
        pub fn WlanOpenHandle(
            dwClientVersion: u32,
            pReserved: *const c_void,
            pdwNegotiatedVersion: *mut u32,
            phClientHandle: *mut u32,
        ) -> u32;

        pub fn WlanCloseHandle(
            hClientHandle: u32,
            pReserved: *const c_void,
        ) -> u32;

        pub fn WlanEnumInterfaces(
            hClientHandle: u32,
            pReserved: *const c_void,
            ppInterfaceList: *mut *mut WLAN_INTERFACE_INFO_LIST,
        ) -> u32;

        pub fn WlanScan(
            hClientHandle: u32,
            pInterfaceGuid: *const windows::core::GUID,
            pDot11Ssid: *const c_void,
            pIeData: *const c_void,
            pReserved: *const c_void,
        ) -> u32;

        pub fn WlanFreeMemory(pMemory: *mut c_void);
    }
}

/// Trigger background scan without blocking the caller thread
#[cfg(windows)]
fn trigger_background_scan() {
    std::thread::spawn(|| {
        use std::ptr;
        let mut ver = 0u32;
        let mut handle = 0u32;
        if unsafe { wlan_ffi::WlanOpenHandle(2, ptr::null(), &mut ver, &mut handle) } == 0 {
            let mut iface_list: *mut wlan_ffi::WLAN_INTERFACE_INFO_LIST = ptr::null_mut();
            if unsafe { wlan_ffi::WlanEnumInterfaces(handle, ptr::null(), &mut iface_list) } == 0 && !iface_list.is_null() {
                let count = unsafe { (*iface_list).dwNumberOfItems };
                if count > 0 {
                    let guid = unsafe { (*iface_list).InterfaceInfo[0].InterfaceGuid };
                    unsafe {
                        wlan_ffi::WlanScan(handle, &guid, ptr::null(), ptr::null(), ptr::null());
                    }
                }
                unsafe {
                    wlan_ffi::WlanFreeMemory(iface_list as *mut _);
                }
            }
            unsafe {
                wlan_ffi::WlanCloseHandle(handle, ptr::null());
            }
        }
    });
}

#[tauri::command]
pub async fn get_wifi_status() -> Result<WifiStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(windows)]
        {
            use windows::Devices::Radios::RadioKind;

            // Trigger active scan in background for subsequent updates
            trigger_background_scan();

            let mut connected_ssid = String::new();
            let mut has_adapter = false;
            let mut software_radio_off = false;

            // 1. Check interfaces
            if let Ok(output) = Command::new("netsh")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["wlan", "show", "interfaces"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("Name") && trimmed.contains(':') {
                        has_adapter = true;
                    } else if trimmed.starts_with("Radio status") {
                        if trimmed.to_lowercase().contains("software off") {
                            software_radio_off = true;
                        }
                    } else if trimmed.starts_with("SSID") && !trimmed.starts_with("BSSID") && trimmed.contains(':') {
                        if let Some((_, val)) = trimmed.split_once(':') {
                            let s = val.trim();
                            if !s.is_empty() {
                                connected_ssid = s.to_string();
                            }
                        }
                    }
                }
            }

            // Radio state: if connected or radio is on
            let radio_state = get_radio_state(RadioKind::WiFi);
            let enabled = if !connected_ssid.is_empty() {
                true
            } else if software_radio_off {
                false
            } else if let Some(state) = radio_state {
                state
            } else {
                has_adapter
            };

            // 2. Get saved profiles
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

            // 3. Get visible networks with signal strength using mode=bssid
            let mut networks: Vec<WifiNetwork> = Vec::new();
            if enabled {
                if let Ok(output) = Command::new("netsh")
                    .creation_flags(CREATE_NO_WINDOW)
                    .args(["wlan", "show", "networks", "mode=bssid"])
                    .output()
                {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let mut current_ssid = String::new();
                    let mut current_secure = true;
                    let mut max_signal = 0u32;

                    for line in stdout.lines() {
                        let trimmed = line.trim();

                        if trimmed.starts_with("SSID") && trimmed.contains(':') && !trimmed.starts_with("BSSID") {
                            // Save previous SSID
                            if !current_ssid.is_empty() {
                                let is_connected = current_ssid == connected_ssid;
                                let is_saved = saved_profiles.contains(&current_ssid);
                                let final_signal = if is_connected && max_signal == 0 { 85 } else { max_signal };

                                if let Some(existing) = networks.iter_mut().find(|n| n.ssid == current_ssid) {
                                    if final_signal > existing.signal {
                                        existing.signal = final_signal;
                                    }
                                } else {
                                    networks.push(WifiNetwork {
                                        ssid: current_ssid.clone(),
                                        signal: final_signal,
                                        is_connected,
                                        is_secure: current_secure,
                                        is_saved,
                                    });
                                }
                            }

                            current_ssid.clear();
                            current_secure = true;
                            max_signal = 0;

                            if let Some((_, val)) = trimmed.split_once(':') {
                                current_ssid = val.trim().to_string();
                            }
                        } else if trimmed.starts_with("Authentication") && trimmed.contains(':') {
                            if let Some((_, val)) = trimmed.split_once(':') {
                                if val.trim().to_lowercase().contains("open") {
                                    current_secure = false;
                                }
                            }
                        } else if trimmed.starts_with("Signal") && trimmed.contains(':') {
                            if let Some((_, val)) = trimmed.split_once(':') {
                                let num_str = val.trim().trim_end_matches('%').trim();
                                if let Ok(sig) = num_str.parse::<u32>() {
                                    if sig > max_signal {
                                        max_signal = sig;
                                    }
                                }
                            }
                        }
                    }

                    // Push last item
                    if !current_ssid.is_empty() {
                        let is_connected = current_ssid == connected_ssid;
                        let is_saved = saved_profiles.contains(&current_ssid);
                        let final_signal = if is_connected && max_signal == 0 { 85 } else { max_signal };

                        if let Some(existing) = networks.iter_mut().find(|n| n.ssid == current_ssid) {
                            if final_signal > existing.signal {
                                existing.signal = final_signal;
                            }
                        } else {
                            networks.push(WifiNetwork {
                                ssid: current_ssid,
                                signal: final_signal,
                                is_connected,
                                is_secure: current_secure,
                                is_saved,
                            });
                        }
                    }
                }
            }

            // Ensure connected network is always at the top
            if !connected_ssid.is_empty() {
                if let Some(pos) = networks.iter().position(|n| n.ssid == connected_ssid) {
                    networks[pos].is_connected = true;
                } else {
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
            }

            // Sort: connected first, then saved, then by signal strength descending
            networks.sort_by(|a, b| {
                if a.is_connected != b.is_connected {
                    return b.is_connected.cmp(&a.is_connected);
                }
                if a.is_saved != b.is_saved {
                    return b.is_saved.cmp(&a.is_saved);
                }
                b.signal.cmp(&a.signal)
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
pub async fn connect_wifi_with_password(ssid: String, password: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let escape_xml = |s: &str| -> String {
                s.replace('&', "&amp;")
                    .replace('<', "&lt;")
                    .replace('>', "&gt;")
                    .replace('"', "&quot;")
                    .replace('\'', "&apos;")
            };

            let safe_ssid = escape_xml(&ssid);
            let safe_pass = escape_xml(&password);

            let profile_xml = format!(
r#"<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>{safe_ssid}</name>
    <SSIDConfig>
        <SSID>
            <name>{safe_ssid}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>{safe_pass}</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
</WLANProfile>"#
            );

            let temp_file = std::env::temp_dir().join(format!("wlan_prof_{}.xml", std::process::id()));
            std::fs::write(&temp_file, profile_xml).map_err(|e| e.to_string())?;

            let add_output = Command::new("netsh")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["wlan", "add", "profile", &format!("filename={}", temp_file.display()), "user=current"])
                .output();

            let _ = std::fs::remove_file(&temp_file);

            let add_output = add_output.map_err(|e| e.to_string())?;
            if !add_output.status.success() {
                return Err(String::from_utf8_lossy(&add_output.stderr).to_string());
            }

            let connect_output = Command::new("netsh")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["wlan", "connect", &format!("name={}", ssid)])
                .output()
                .map_err(|e| e.to_string())?;

            if !connect_output.status.success() {
                return Err(String::from_utf8_lossy(&connect_output.stderr).to_string());
            }

            // Check connection up to 3 seconds
            for _ in 0..12 {
                std::thread::sleep(std::time::Duration::from_millis(250));
                if let Ok(output) = Command::new("netsh")
                    .creation_flags(CREATE_NO_WINDOW)
                    .args(["wlan", "show", "interfaces"])
                    .output()
                {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    if stdout.contains(&format!("SSID                   : {}", ssid)) {
                        return Ok(());
                    }
                }
            }

            Ok(())
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

#[tauri::command]
pub async fn get_hotspot_status() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(windows)]
        {
            use windows::Networking::Connectivity::NetworkInformation;
            use windows::Networking::NetworkOperators::{
                NetworkOperatorTetheringManager, TetheringOperationalState,
            };

            let profile = match NetworkInformation::GetInternetConnectionProfile() {
                Ok(p) => p,
                Err(_) => {
                    let profiles = NetworkInformation::GetConnectionProfiles()
                        .map_err(|e| format!("Tidak dapat membaca profil jaringan: {}", e))?;
                    profiles.GetAt(0)
                        .map_err(|e| format!("Tidak ada profil jaringan aktif: {}", e))?
                }
            };

            let manager = NetworkOperatorTetheringManager::CreateFromConnectionProfile(&profile)
                .map_err(|e| format!("Gagal inisialisasi tethering: {}", e))?;
            let state = manager.TetheringOperationalState()
                .map_err(|e| format!("Gagal membaca status tethering: {}", e))?;

            Ok(state == TetheringOperationalState::On)
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
pub async fn toggle_hotspot(enable: bool) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            use windows::Networking::Connectivity::NetworkInformation;
            use windows::Networking::NetworkOperators::{
                NetworkOperatorTetheringManager, TetheringOperationalState,
                TetheringOperationStatus,
            };

            let profile = match NetworkInformation::GetInternetConnectionProfile() {
                Ok(p) => p,
                Err(_) => {
                    let profiles = NetworkInformation::GetConnectionProfiles()
                        .map_err(|_| "Tidak ada profil koneksi internet/jaringan aktif untuk dibagikan".to_string())?;
                    profiles.GetAt(0)
                        .map_err(|_| "Tidak ada profil koneksi internet/jaringan aktif untuk dibagikan".to_string())?
                }
            };

            let manager = NetworkOperatorTetheringManager::CreateFromConnectionProfile(&profile)
                .map_err(|e| format!("Gagal inisialisasi manajer Hotspot: {}", e))?;

            let current_state = manager.TetheringOperationalState()
                .map_err(|e| format!("Gagal membaca status Hotspot: {}", e))?;

            let is_on = current_state == TetheringOperationalState::On;

            if enable {
                if !is_on {
                    let op = manager.StartTetheringAsync()
                        .map_err(|e| format!("Gagal memulai Hotspot: {}", e))?;
                    let result = op.get()
                        .map_err(|e| format!("Gagal mengaktifkan Hotspot: {}", e))?;
                    let status = result.Status()
                        .map_err(|e| format!("Gagal membaca status hasil: {}", e))?;

                    if status != TetheringOperationStatus::Success && status != TetheringOperationStatus::AlreadyOn {
                        let err_msg = match status {
                            TetheringOperationStatus::WiFiDeviceOff => "Wi-Fi perangkat dalam keadaan nonaktif. Nyalakan Wi-Fi terlebih dahulu.",
                            TetheringOperationStatus::MobileBroadbandDeviceOff => "Perangkat mobile broadband nonaktif.",
                            TetheringOperationStatus::NetworkLimitedConnectivity => "Koneksi jaringan terbatas, tidak dapat membagikan internet.",
                            _ => "Gagal mengaktifkan Mobile Hotspot Windows.",
                        };
                        return Err(err_msg.to_string());
                    }
                }
                Ok(true)
            } else {
                if is_on {
                    let op = manager.StopTetheringAsync()
                        .map_err(|e| format!("Gagal mematikan Hotspot: {}", e))?;
                    let result = op.get()
                        .map_err(|e| format!("Gagal menonaktifkan Hotspot: {}", e))?;
                    let status = result.Status()
                        .map_err(|e| format!("Gagal membaca status hasil: {}", e))?;

                    if status != TetheringOperationStatus::Success {
                        return Err("Gagal menonaktifkan Mobile Hotspot Windows.".to_string());
                    }
                }
                Ok(false)
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
