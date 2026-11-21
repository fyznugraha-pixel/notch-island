use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use serde::{Deserialize, Serialize};

static WLAN_PROFILE_SEQ: AtomicU64 = AtomicU64::new(0);

#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub fn is_ethernet_connected() -> bool {
    use windows::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetIfTable2, MIB_IF_TABLE2};
    use windows::Win32::NetworkManagement::Ndis::IfOperStatusUp;

    const IF_TYPE_ETHERNET_CSMACD: u32 = 6;
    const HARDWARE_INTERFACE: u8 = 0x01;
    const FILTER_INTERFACE: u8 = 0x02;
    const NOT_MEDIA_CONNECTED: u8 = 0x10;

    let mut connected = false;
    unsafe {
        let mut table_ptr: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
        if GetIfTable2(&mut table_ptr).is_ok() && !table_ptr.is_null() {
            let count = (*table_ptr).NumEntries as usize;
            let rows = std::slice::from_raw_parts((*table_ptr).Table.as_ptr(), count);
            connected = rows.iter().any(|row| {
                let flags = row.InterfaceAndOperStatusFlags._bitfield;
                row.Type == IF_TYPE_ETHERNET_CSMACD
                    && row.OperStatus == IfOperStatusUp
                    && flags & HARDWARE_INTERFACE != 0
                    && flags & (FILTER_INTERFACE | NOT_MEDIA_CONNECTED) == 0
            });
            FreeMibTable(table_ptr as *const _);
        }
    }
    connected
}

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
    use windows::Win32::Foundation::HANDLE;

    pub const WLAN_AVAILABLE_NETWORK_CONNECTED: u32 = 0x0000_0001;
    pub const WLAN_AVAILABLE_NETWORK_HAS_PROFILE: u32 = 0x0000_0002;
    pub const WLAN_INTERFACE_STATE_CONNECTED: u32 = 1;
    pub const WLAN_INTF_OPCODE_RADIO_STATE: u32 = 4;
    pub const WLAN_INTF_OPCODE_CURRENT_CONNECTION: u32 = 7;
    pub const DOT11_RADIO_STATE_OFF: u32 = 2;

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct DOT11_SSID {
        pub uSSIDLength: u32,
        pub ucSSID: [u8; 32],
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
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

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct WLAN_AVAILABLE_NETWORK {
        pub strProfileName: [u16; 256],
        pub dot11Ssid: DOT11_SSID,
        pub dot11BssType: u32,
        pub uNumberOfBssids: u32,
        pub bNetworkConnectable: i32,
        pub wlanNotConnectableReason: u32,
        pub uNumberOfPhyTypes: u32,
        pub dot11PhyTypes: [u32; 8],
        pub bMorePhyTypes: i32,
        pub wlanSignalQuality: u32,
        pub bSecurityEnabled: i32,
        pub dot11DefaultAuthAlgorithm: u32,
        pub dot11DefaultCipherAlgorithm: u32,
        pub dwFlags: u32,
        pub dwReserved: u32,
    }

    #[repr(C)]
    pub struct WLAN_AVAILABLE_NETWORK_LIST {
        pub dwNumberOfItems: u32,
        pub dwIndex: u32,
        pub Network: [WLAN_AVAILABLE_NETWORK; 1],
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct WLAN_ASSOCIATION_ATTRIBUTES {
        pub dot11Ssid: DOT11_SSID,
        pub dot11BssType: u32,
        pub dot11Bssid: [u8; 6],
        pub dot11PhyType: u32,
        pub uDot11PhyIndex: u32,
        pub wlanSignalQuality: u32,
        pub ulRxRate: u32,
        pub ulTxRate: u32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct WLAN_SECURITY_ATTRIBUTES {
        pub bSecurityEnabled: i32,
        pub bOneXEnabled: i32,
        pub dot11AuthAlgorithm: u32,
        pub dot11CipherAlgorithm: u32,
    }

    #[repr(C)]
    pub struct WLAN_CONNECTION_ATTRIBUTES {
        pub isState: u32,
        pub wlanConnectionMode: u32,
        pub strProfileName: [u16; 256],
        pub wlanAssociationAttributes: WLAN_ASSOCIATION_ATTRIBUTES,
        pub wlanSecurityAttributes: WLAN_SECURITY_ATTRIBUTES,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct WLAN_PHY_RADIO_STATE {
        pub dwPhyIndex: u32,
        pub dot11SoftwareRadioState: u32,
        pub dot11HardwareRadioState: u32,
    }

    #[repr(C)]
    pub struct WLAN_RADIO_STATE {
        pub dwNumberOfPhys: u32,
        pub PhyRadioState: [WLAN_PHY_RADIO_STATE; 64],
    }

    #[link(name = "wlanapi")]
    extern "system" {
        pub fn WlanOpenHandle(
            dwClientVersion: u32,
            pReserved: *const c_void,
            pdwNegotiatedVersion: *mut u32,
            phClientHandle: *mut HANDLE,
        ) -> u32;

        pub fn WlanCloseHandle(
            hClientHandle: HANDLE,
            pReserved: *const c_void,
        ) -> u32;

        pub fn WlanEnumInterfaces(
            hClientHandle: HANDLE,
            pReserved: *const c_void,
            ppInterfaceList: *mut *mut WLAN_INTERFACE_INFO_LIST,
        ) -> u32;

        pub fn WlanGetAvailableNetworkList(
            hClientHandle: HANDLE,
            pInterfaceGuid: *const windows::core::GUID,
            dwFlags: u32,
            pReserved: *const c_void,
            ppAvailableNetworkList: *mut *mut WLAN_AVAILABLE_NETWORK_LIST,
        ) -> u32;

        pub fn WlanQueryInterface(
            hClientHandle: HANDLE,
            pInterfaceGuid: *const windows::core::GUID,
            OpCode: u32,
            pReserved: *const c_void,
            pdwDataSize: *mut u32,
            ppData: *mut *mut c_void,
            pWlanOpcodeValueType: *mut u32,
        ) -> u32;

        pub fn WlanScan(
            hClientHandle: HANDLE,
            pInterfaceGuid: *const windows::core::GUID,
            pDot11Ssid: *const c_void,
            pIeData: *const c_void,
            pReserved: *const c_void,
        ) -> u32;

        pub fn WlanFreeMemory(pMemory: *mut c_void);
    }

    pub fn decode_ssid(ssid: &DOT11_SSID) -> String {
        let len = (ssid.uSSIDLength as usize).min(32);
        String::from_utf8_lossy(&ssid.ucSSID[..len]).to_string()
    }
}

#[cfg(windows)]
fn format_command_error(output: &std::process::Output, fallback: &str) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{} ({})", stdout, stderr),
        (false, true) => stdout,
        (true, false) => stderr,
        (true, true) => fallback.to_string(),
    }
}

#[cfg(windows)]
struct NativeWifiSnapshot {
    has_adapter: bool,
    any_radio_on: Option<bool>,
    connected_ssid: String,
    networks: Vec<(WifiNetwork, u32, u32)>,
}

#[cfg(windows)]
fn query_native_wifi_snapshot() -> Option<NativeWifiSnapshot> {
    use std::collections::HashMap;
    use std::ptr;
    use wlan_ffi::*;

    let mut ver = 0u32;
    let mut handle = windows::Win32::Foundation::HANDLE::default();
    if unsafe { WlanOpenHandle(2, ptr::null(), &mut ver, &mut handle) } != 0 {
        return None;
    }

    struct HandleGuard(windows::Win32::Foundation::HANDLE);
    impl Drop for HandleGuard {
        fn drop(&mut self) {
            unsafe {
                WlanCloseHandle(self.0, std::ptr::null());
            }
        }
    }
    let _guard = HandleGuard(handle);

    let mut iface_list_ptr: *mut WLAN_INTERFACE_INFO_LIST = ptr::null_mut();
    if unsafe { WlanEnumInterfaces(handle, ptr::null(), &mut iface_list_ptr) } != 0
        || iface_list_ptr.is_null()
    {
        return None;
    }

    let iface_count = unsafe { (*iface_list_ptr).dwNumberOfItems as usize };
    let ifaces: Vec<WLAN_INTERFACE_INFO> = if iface_count > 0 {
        unsafe {
            std::slice::from_raw_parts((*iface_list_ptr).InterfaceInfo.as_ptr(), iface_count)
                .to_vec()
        }
    } else {
        Vec::new()
    };
    unsafe { WlanFreeMemory(iface_list_ptr as *mut _) };

    if ifaces.is_empty() {
        return Some(NativeWifiSnapshot {
            has_adapter: false,
            any_radio_on: Some(false),
            connected_ssid: String::new(),
            networks: Vec::new(),
        });
    }

    let mut connected_ssid = String::new();
    let mut saw_radio_state = false;
    let mut any_radio_on = false;
    let mut by_ssid: HashMap<String, (WifiNetwork, u32, u32)> = HashMap::new();

    for iface in &ifaces {
        let mut data_size = 0u32;
        let mut radio_ptr: *mut std::ffi::c_void = ptr::null_mut();
        if unsafe {
            WlanQueryInterface(
                handle,
                &iface.InterfaceGuid,
                WLAN_INTF_OPCODE_RADIO_STATE,
                ptr::null(),
                &mut data_size,
                &mut radio_ptr,
                ptr::null_mut(),
            )
        } == 0
            && !radio_ptr.is_null()
        {
            if (data_size as usize) >= std::mem::size_of::<u32>() {
                let rs = unsafe { &*(radio_ptr as *const WLAN_RADIO_STATE) };
                let phy_count = (rs.dwNumberOfPhys as usize).min(64);
                for phy in &rs.PhyRadioState[..phy_count] {
                    saw_radio_state = true;
                    if phy.dot11SoftwareRadioState != DOT11_RADIO_STATE_OFF
                        && phy.dot11HardwareRadioState != DOT11_RADIO_STATE_OFF
                    {
                        any_radio_on = true;
                    }
                }
            }
            unsafe { WlanFreeMemory(radio_ptr) };
        }

        if connected_ssid.is_empty() && iface.isState == WLAN_INTERFACE_STATE_CONNECTED {
            let mut conn_size = 0u32;
            let mut conn_ptr: *mut std::ffi::c_void = ptr::null_mut();
            if unsafe {
                WlanQueryInterface(
                    handle,
                    &iface.InterfaceGuid,
                    WLAN_INTF_OPCODE_CURRENT_CONNECTION,
                    ptr::null(),
                    &mut conn_size,
                    &mut conn_ptr,
                    ptr::null_mut(),
                )
            } == 0
                && !conn_ptr.is_null()
            {
                if (conn_size as usize) >= std::mem::size_of::<WLAN_CONNECTION_ATTRIBUTES>() {
                    let conn = unsafe { &*(conn_ptr as *const WLAN_CONNECTION_ATTRIBUTES) };
                    if conn.isState == WLAN_INTERFACE_STATE_CONNECTED {
                        let s = decode_ssid(&conn.wlanAssociationAttributes.dot11Ssid);
                        if !s.is_empty() {
                            connected_ssid = s;
                        }
                    }
                }
                unsafe { WlanFreeMemory(conn_ptr) };
            }
        }

        let mut net_list_ptr: *mut WLAN_AVAILABLE_NETWORK_LIST = ptr::null_mut();
        if unsafe {
            WlanGetAvailableNetworkList(handle, &iface.InterfaceGuid, 0, ptr::null(), &mut net_list_ptr)
        } == 0
            && !net_list_ptr.is_null()
        {
            let net_count = unsafe { (*net_list_ptr).dwNumberOfItems as usize };
            let slice = if net_count > 0 {
                unsafe {
                    std::slice::from_raw_parts((*net_list_ptr).Network.as_ptr(), net_count)
                }
            } else {
                &[]
            };
            for net in slice {
                let ssid = decode_ssid(&net.dot11Ssid);
                if ssid.is_empty() {
                    continue;
                }
                let is_connected = (net.dwFlags & WLAN_AVAILABLE_NETWORK_CONNECTED) != 0
                    || ssid == connected_ssid;
                let is_saved = (net.dwFlags & WLAN_AVAILABLE_NETWORK_HAS_PROFILE) != 0;
                let is_secure = net.bSecurityEnabled != 0;
                let signal = net.wlanSignalQuality.min(100);
                let auth = net.dot11DefaultAuthAlgorithm;
                let cipher = net.dot11DefaultCipherAlgorithm;

                if is_connected && connected_ssid.is_empty() {
                    connected_ssid = ssid.clone();
                }

                by_ssid
                    .entry(ssid.clone())
                    .and_modify(|entry| {
                        if signal > entry.0.signal {
                            entry.0.signal = signal;
                        }
                        entry.0.is_connected |= is_connected;
                        entry.0.is_saved |= is_saved;
                        if is_saved || entry.1 == 0 {
                            entry.1 = auth;
                            entry.2 = cipher;
                        }
                    })
                    .or_insert((
                        WifiNetwork {
                            ssid,
                            signal,
                            is_connected,
                            is_secure,
                            is_saved,
                        },
                        auth,
                        cipher,
                    ));
            }
            unsafe { WlanFreeMemory(net_list_ptr as *mut _) };
        }
    }

    Some(NativeWifiSnapshot {
        has_adapter: true,
        any_radio_on: if saw_radio_state { Some(any_radio_on) } else { None },
        connected_ssid,
        networks: by_ssid.into_values().collect(),
    })
}

fn escape_wlan_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn resolve_profile_auth_cipher(
    has_password: bool,
    detected_auth: Option<u32>,
    detected_cipher: Option<u32>,
) -> (&'static str, &'static str) {
    if !has_password {
        if detected_auth == Some(10) {
            return ("OWE", "AES");
        }
        return ("open", "none");
    }
    match detected_auth {
        Some(9) => ("WPA3SAE", "AES"),
        Some(4) => {
            let enc = if detected_cipher == Some(2) { "TKIP" } else { "AES" };
            ("WPAPSK", enc)
        }
        _ => {
            let enc = if detected_cipher == Some(2) { "TKIP" } else { "AES" };
            ("WPA2PSK", enc)
        }
    }
}

fn build_wlan_profile_xml(
    ssid: &str,
    password: Option<&str>,
    detected_auth: Option<u32>,
    detected_cipher: Option<u32>,
) -> String {
    let safe_ssid = escape_wlan_xml(ssid);
    let (auth_str, enc_str) =
        resolve_profile_auth_cipher(password.is_some(), detected_auth, detected_cipher);

    let shared_key_xml = match password {
        Some(pass) => {
            let safe_pass = escape_wlan_xml(pass);
            format!(
                "\n            <sharedKey>\n                <keyType>passPhrase</keyType>\n                <protected>false</protected>\n                <keyMaterial>{safe_pass}</keyMaterial>\n            </sharedKey>"
            )
        }
        None => String::new(),
    };

    format!(
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
                <authentication>{auth_str}</authentication>
                <encryption>{enc_str}</encryption>
                <useOneX>false</useOneX>
            </authEncryption>{shared_key_xml}
        </security>
    </MSM>
</WLANProfile>"#
    )
}

/// Trigger background scan without blocking the caller thread
#[cfg(windows)]
fn trigger_background_scan() {
    std::thread::spawn(|| {
        use std::ptr;
        let mut ver = 0u32;
        let mut handle = windows::Win32::Foundation::HANDLE::default();
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

/// Passive Wi-Fi radio state check for background pollers (never triggers an active WlanScan).
pub fn is_wifi_radio_enabled_passive() -> Option<bool> {
    #[cfg(windows)]
    {
        use windows::Devices::Radios::RadioKind;
        if let Some(native) = query_native_wifi_snapshot() {
            if !native.connected_ssid.is_empty() {
                return Some(true);
            }
            if let Some(phy_on) = native.any_radio_on {
                return Some(phy_on);
            }
            if let Some(state) = get_radio_state(RadioKind::WiFi) {
                return Some(state);
            }
            return Some(native.has_adapter);
        }
        return get_radio_state(RadioKind::WiFi);
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[tauri::command]
pub async fn get_wifi_status() -> Result<WifiStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(windows)]
        {
            use windows::Devices::Radios::RadioKind;

            // Trigger active scan in background for subsequent updates
            trigger_background_scan();

            // Prefer locale-independent Native Wifi API, falling back to netsh if needed.
            if let Some(native) = query_native_wifi_snapshot() {
                let radio_state = get_radio_state(RadioKind::WiFi);
                let enabled = if !native.connected_ssid.is_empty() {
                    true
                } else if let Some(phy_on) = native.any_radio_on {
                    phy_on
                } else if let Some(state) = radio_state {
                    state
                } else {
                    native.has_adapter
                };

                let connected_ssid = native.connected_ssid;
                let mut networks: Vec<WifiNetwork> = native
                    .networks
                    .into_iter()
                    .map(|(mut net, _, _)| {
                        if !connected_ssid.is_empty() && net.ssid == connected_ssid {
                            net.is_connected = true;
                        }
                        net
                    })
                    .collect();

                if !connected_ssid.is_empty()
                    && !networks.iter().any(|n| n.ssid == connected_ssid)
                {
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

                networks.sort_by(|a, b| {
                    b.is_connected
                        .cmp(&a.is_connected)
                        .then_with(|| b.is_saved.cmp(&a.is_saved))
                        .then_with(|| b.signal.cmp(&a.signal))
                });

                return Ok(WifiStatus {
                    enabled,
                    connected_ssid,
                    networks,
                });
            }

            let mut connected_ssid = String::new();
            let mut has_adapter = false;
            let mut radio_explicit_off = false;

            // 1. Check interfaces (fallback)
            if let Ok(output) = Command::new("netsh")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["wlan", "show", "interfaces"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut current_state_connected = false;
                let mut pending_ssid = String::new();
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("Name") && trimmed.contains(':') {
                        has_adapter = true;
                        current_state_connected = false;
                        pending_ssid.clear();
                    } else if trimmed.starts_with("Radio status") {
                        let lower = trimmed.to_lowercase();
                        if lower.contains("software off") || lower.contains("hardware off") {
                            radio_explicit_off = true;
                        }
                    } else if trimmed.starts_with("State") && trimmed.contains(':') {
                        if let Some((_, val)) = trimmed.split_once(':') {
                            let st = val.trim().to_ascii_lowercase();
                            current_state_connected = matches!(st.as_str(), "connected" | "terhubung");
                            if current_state_connected && !pending_ssid.is_empty() && connected_ssid.is_empty() {
                                connected_ssid = pending_ssid.clone();
                            }
                        }
                    } else if trimmed.starts_with("SSID") && !trimmed.starts_with("BSSID") && trimmed.contains(':') {
                        if let Some((_, val)) = trimmed.split_once(':') {
                            let s = val.trim();
                            if !s.is_empty() {
                                pending_ssid = s.to_string();
                                if current_state_connected && connected_ssid.is_empty() {
                                    connected_ssid = pending_ssid.clone();
                                }
                            }
                        }
                    }
                }
            }

            // Radio state: if connected or radio is on
            let radio_state = get_radio_state(RadioKind::WiFi);
            let enabled = if !connected_ssid.is_empty() {
                true
            } else if radio_explicit_off {
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

#[cfg(windows)]
fn verify_ssid_associated(ssid: &str) -> bool {
    for _ in 0..24 {
        std::thread::sleep(std::time::Duration::from_millis(250));
        if let Some(snap) = query_native_wifi_snapshot() {
            if snap.connected_ssid == ssid
                || snap
                    .networks
                    .iter()
                    .any(|(n, _, _)| n.ssid == ssid && n.is_connected)
            {
                return true;
            }
            continue;
        }
        if let Ok(output) = Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["wlan", "show", "interfaces"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut current_state: Option<String> = None;
            let mut current_ssid: Option<String> = None;
            for line in stdout.lines() {
                let trimmed = line.trim();
                if let Some((key, val)) = trimmed.split_once(':') {
                    let k = key.trim();
                    let v = val.trim();
                    if k.eq_ignore_ascii_case("Name") {
                        current_state = None;
                        current_ssid = None;
                    } else if k.eq_ignore_ascii_case("State") {
                        current_state = Some(v.to_ascii_lowercase());
                    } else if k.eq_ignore_ascii_case("SSID") && !k.eq_ignore_ascii_case("BSSID") {
                        current_ssid = Some(v.to_string());
                    }
                    if current_ssid.as_deref() == Some(ssid)
                        && matches!(current_state.as_deref(), Some("connected" | "terhubung"))
                    {
                        return true;
                    }
                }
            }
        }
    }
    false
}

#[cfg(windows)]
fn add_temporary_profile_and_connect(
    ssid: &str,
    password: Option<&str>,
    verify_connection: bool,
) -> Result<(), String> {
    let (detected_auth, detected_cipher) = query_native_wifi_snapshot()
        .and_then(|snap| {
            snap.networks
                .into_iter()
                .find(|(n, _, _)| n.ssid == ssid)
                .map(|(_, auth, cipher)| (Some(auth), Some(cipher)))
        })
        .unwrap_or((None, None));

    let profile_xml = build_wlan_profile_xml(ssid, password, detected_auth, detected_cipher);
    let seq = WLAN_PROFILE_SEQ.fetch_add(1, Ordering::Relaxed);
    let temp_file = std::env::temp_dir().join(format!(
        "wlan_prof_{}_{}.xml",
        std::process::id(),
        seq
    ));
    std::fs::write(&temp_file, profile_xml).map_err(|e| e.to_string())?;

    let add_output = Command::new("netsh")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["wlan", "add", "profile", &format!("filename={}", temp_file.display()), "user=current"])
        .output();
    let _ = std::fs::remove_file(&temp_file);

    let add_output = add_output.map_err(|e| e.to_string())?;
    if !add_output.status.success() {
        return Err(format_command_error(&add_output, "Failed to add Wi-Fi profile"));
    }

    let connect_output = Command::new("netsh")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["wlan", "connect", &format!("name={}", ssid)])
        .output()
        .map_err(|e| e.to_string())?;

    if !connect_output.status.success() {
        let _ = Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["wlan", "delete", "profile", &format!("name={}", ssid)])
            .output();
        return Err(format_command_error(&connect_output, "Failed to connect to Wi-Fi"));
    }

    if verify_connection && !verify_ssid_associated(ssid) {
        let _ = Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["wlan", "delete", "profile", &format!("name={}", ssid)])
            .output();
        return Err(format!("Failed to connect to '{}'", ssid));
    }

    Ok(())
}

#[tauri::command]
pub async fn connect_wifi(ssid: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let needs_open_profile = query_native_wifi_snapshot()
                .and_then(|snap| {
                    snap.networks
                        .into_iter()
                        .find(|(n, _, _)| n.ssid == ssid)
                        .map(|(n, _, _)| !n.is_saved && !n.is_secure)
                })
                .unwrap_or(false);

            if needs_open_profile {
                return add_temporary_profile_and_connect(&ssid, None, true);
            }

            let output = Command::new("netsh")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["wlan", "connect", &format!("name={}", ssid)])
                .output()
                .map_err(|e| e.to_string())?;

            if output.status.success() {
                Ok(())
            } else {
                // Retry with a generated open WLAN profile when the target open AP is not yet saved.
                let is_open_ap = query_native_wifi_snapshot()
                    .and_then(|snap| {
                        snap.networks
                            .into_iter()
                            .find(|(n, _, _)| n.ssid == ssid)
                            .map(|(n, _, _)| !n.is_secure)
                    })
                    .unwrap_or(false);
                if is_open_ap {
                    add_temporary_profile_and_connect(&ssid, None, true)
                } else {
                    Err(format_command_error(&output, "Failed to connect to Wi-Fi"))
                }
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
            add_temporary_profile_and_connect(&ssid, Some(&password), true)
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
                Err(format_command_error(&output, "Failed to disconnect Wi-Fi"))
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

                            let u16_words: Vec<u16> = name_buf
                                .chunks_exact(2)
                                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                                .take_while(|&w| w != 0)
                                .collect();
                            let friendly_name = String::from_utf16_lossy(&u16_words).trim().to_string();
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::ExitStatus;

    #[cfg(windows)]
    fn exit_status_code(code: u32) -> ExitStatus {
        use std::os::windows::process::ExitStatusExt;
        ExitStatus::from_raw(code)
    }

    #[test]
    fn test_build_wlan_profile_xml_auth_cipher_and_escaping() {
        let open_xml = build_wlan_profile_xml("Cafe & <Free>", None, Some(1), None);
        assert!(open_xml.contains("<name>Cafe &amp; &lt;Free&gt;</name>"));
        assert!(open_xml.contains("<authentication>open</authentication>"));
        assert!(open_xml.contains("<encryption>none</encryption>"));
        assert!(!open_xml.contains("<sharedKey>"));

        let wpa3_xml = build_wlan_profile_xml("HomeNet", Some("p@ss&word"), Some(9), None);
        assert!(wpa3_xml.contains("<authentication>WPA3SAE</authentication>"));
        assert!(wpa3_xml.contains("<encryption>AES</encryption>"));
        assert!(wpa3_xml.contains("<keyMaterial>p@ss&amp;word</keyMaterial>"));

        let legacy_xml = build_wlan_profile_xml("OldRouter", Some("secret"), Some(4), Some(2));
        assert!(legacy_xml.contains("<authentication>WPAPSK</authentication>"));
        assert!(legacy_xml.contains("<encryption>TKIP</encryption>"));
    }

    #[cfg(windows)]
    #[test]
    fn test_format_command_error_uses_stdout_when_stderr_empty() {
        let out = std::process::Output {
            status: exit_status_code(1),
            stdout: b"Profil nirkabel tidak ditemukan.".to_vec(),
            stderr: Vec::new(),
        };
        assert_eq!(
            format_command_error(&out, "fallback"),
            "Profil nirkabel tidak ditemukan."
        );

        let empty_out = std::process::Output {
            status: exit_status_code(1),
            stdout: Vec::new(),
            stderr: Vec::new(),
        };
        assert_eq!(format_command_error(&empty_out, "fallback"), "fallback");
    }
}
