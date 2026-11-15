use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct StorageDriveInfo {
    pub letter: String,
    pub free_gb: f32,
    pub total_gb: f32,
    pub used_pct: u8,
}

#[derive(Debug, Clone, Serialize)]
pub struct VirtualDesktopState {
    pub current: usize,
    pub count: usize,
    pub names: Vec<String>,
    pub supported: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct VpnStatus {
    pub connected: bool,
    pub name: Option<String>,
}

pub(crate) fn format_guid_le_bytes(chunk: &[u8]) -> Option<String> {
    if chunk.len() != 16 {
        return None;
    }
    let d1 = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
    let d2 = u16::from_le_bytes([chunk[4], chunk[5]]);
    let d3 = u16::from_le_bytes([chunk[6], chunk[7]]);
    Some(format!(
        "{{{:08X}-{:04X}-{:04X}-{:02X}{:02X}-{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}}}",
        d1, d2, d3, chunk[8], chunk[9], chunk[10], chunk[11], chunk[12], chunk[13], chunk[14], chunk[15]
    ))
}

pub(crate) fn is_vpn_interface(if_type: u32, desc: &str) -> bool {
    let lower = desc.to_lowercase();
    if lower.contains("virtualbox")
        || lower.contains("vmware")
        || lower.contains("hyper-v")
        || lower.contains("vethernet")
        || lower.contains("loopback")
        || lower.contains("teredo")
        || lower.contains("isatap")
        || lower.contains("6to4")
        || lower.contains("ip-https")
    {
        return false;
    }
    if if_type == 23 || if_type == 131 {
        return true;
    }
    const VPN_KEYWORDS: &[&str] = &[
        "wireguard",
        "wintun",
        "openvpn",
        "tap-windows",
        "tailscale",
        "zerotier",
        "cloudflare",
        "warp",
        "nordlynx",
        "proton",
        "mullvad",
        "cisco",
        "anyconnect",
        "fortinet",
        "pulsesecure",
        "globalprotect",
        "wan miniport (ikev2)",
        "wan miniport (l2tp)",
        "wan miniport (sstp)",
        "wan miniport (pptp)",
    ];
    VPN_KEYWORDS.iter().any(|k| lower.contains(k))
}

#[tauri::command]
pub fn get_storage_drives() -> Vec<StorageDriveInfo> {
    #[cfg(windows)]
    {
        use windows::core::PCWSTR;
        use windows::Win32::Storage::FileSystem::{
            GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDriveStringsW,
        };

        let mut buf = [0u16; 260];
        let len = unsafe { GetLogicalDriveStringsW(Some(&mut buf)) } as usize;
        if len == 0 || len > buf.len() {
            return Vec::new();
        }

        let mut drives = Vec::new();
        let mut idx = 0;
        while idx < len {
            let end = buf[idx..len].iter().position(|&c| c == 0).unwrap_or(0);
            if end == 0 {
                break;
            }
            let root = &buf[idx..idx + end + 1];
            idx += end + 1;

            // 3 == DRIVE_FIXED
            let drive_type = unsafe { GetDriveTypeW(PCWSTR(root.as_ptr())) };
            if drive_type != 3 {
                continue;
            }

            let mut free_avail = 0u64;
            let mut total_bytes = 0u64;
            if unsafe {
                GetDiskFreeSpaceExW(
                    PCWSTR(root.as_ptr()),
                    Some(&mut free_avail),
                    Some(&mut total_bytes),
                    None,
                )
            }
            .is_ok()
                && total_bytes > 0
            {
                let gb_div = 1024.0 * 1024.0 * 1024.0;
                let total_gb = ((total_bytes as f64 / gb_div) * 10.0).round() as f32 / 10.0;
                let free_gb = ((free_avail as f64 / gb_div) * 10.0).round() as f32 / 10.0;
                let used_pct =
                    (((total_bytes - free_avail) as f64 / total_bytes as f64) * 100.0)
                        .round()
                        .clamp(0.0, 100.0) as u8;
                let label = String::from_utf16_lossy(&root[..end])
                    .trim_end_matches('\\')
                    .to_string();
                drives.push(StorageDriveInfo {
                    letter: label,
                    free_gb,
                    total_gb,
                    used_pct,
                });
            }
        }
        drives
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

#[tauri::command]
pub fn get_virtual_desktop_state() -> VirtualDesktopState {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let Ok(vd_key) = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VirtualDesktops") else {
            return VirtualDesktopState {
                current: 1,
                count: 1,
                names: vec!["Desktop 1".to_string()],
                supported: false,
            };
        };

        let ids_raw: Vec<u8> = vd_key
            .get_raw_value("VirtualDesktopIDs")
            .map(|v| v.bytes.to_vec())
            .unwrap_or_default();
        let cur_raw: Vec<u8> = vd_key
            .get_raw_value("CurrentVirtualDesktop")
            .map(|v| v.bytes.to_vec())
            .unwrap_or_default();

        if ids_raw.len() < 16 || ids_raw.len() % 16 != 0 {
            return VirtualDesktopState {
                current: 1,
                count: 1,
                names: vec!["Desktop 1".to_string()],
                supported: false,
            };
        }

        let chunks: Vec<&[u8]> = ids_raw.chunks_exact(16).collect();
        let count = chunks.len().max(1);
        let current = if cur_raw.len() == 16 {
            chunks
                .iter()
                .position(|c| *c == cur_raw.as_slice())
                .map(|idx| idx + 1)
                .unwrap_or(1)
        } else {
            1
        };

        let desktops_sub = vd_key.open_subkey("Desktops").ok();
        let names = chunks
            .iter()
            .enumerate()
            .map(|(i, chunk)| {
                if let (Some(sub), Some(guid)) = (desktops_sub.as_ref(), format_guid_le_bytes(chunk)) {
                    if let Ok(entry) = sub.open_subkey(&guid) {
                        if let Ok(custom) = entry.get_value::<String, _>("Name") {
                            let trimmed = custom.trim();
                            if !trimmed.is_empty() {
                                return trimmed.to_string();
                            }
                        }
                    }
                }
                format!("Desktop {}", i + 1)
            })
            .collect();

        VirtualDesktopState {
            current,
            count,
            names,
            supported: true,
        }
    }
    #[cfg(not(windows))]
    {
        VirtualDesktopState {
            current: 1,
            count: 1,
            names: vec!["Desktop 1".to_string()],
            supported: false,
        }
    }
}

#[tauri::command]
pub async fn switch_to_virtual_desktop(target_index: usize) -> VirtualDesktopState {
    tauri::async_runtime::spawn_blocking(move || {
        let state = get_virtual_desktop_state();
        if !state.supported || state.count <= 1 {
            return state;
        }
        let clamped = target_index.clamp(1, state.count);
        let delta = clamped as isize - state.current as isize;
        let dir = if delta < 0 { "prev" } else { "next" };
        let steps = delta.unsigned_abs().min(12);
        for _ in 0..steps {
            crate::navbar_window::switch_virtual_desktop(dir.to_string());
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        std::thread::sleep(std::time::Duration::from_millis(60));
        get_virtual_desktop_state()
    })
    .await
    .unwrap_or_else(|_| get_virtual_desktop_state())
}

#[tauri::command]
pub fn get_vpn_status() -> VpnStatus {
    #[cfg(windows)]
    {
        use windows::Win32::NetworkManagement::IpHelper::{
            FreeMibTable, GetIfTable2, MIB_IF_ROW2, MIB_IF_TABLE2,
        };
        use windows::Win32::NetworkManagement::Ndis::IfOperStatusUp;

        unsafe {
            let mut table_ptr: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
            if GetIfTable2(&mut table_ptr).is_ok() && !table_ptr.is_null() {
                let count = (*table_ptr).NumEntries as usize;
                let rows: &[MIB_IF_ROW2] =
                    std::slice::from_raw_parts((*table_ptr).Table.as_ptr(), count);

                let mut found: Option<String> = None;
                for row in rows {
                    let is_filter = (row.InterfaceAndOperStatusFlags._bitfield & 0x02) != 0;
                    if is_filter || row.OperStatus != IfOperStatusUp {
                        continue;
                    }
                    let desc_len = row
                        .Description
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(row.Description.len());
                    let desc = String::from_utf16_lossy(&row.Description[..desc_len])
                        .trim()
                        .to_string();
                    if is_vpn_interface(row.Type, &desc) {
                        found = Some(desc);
                        break;
                    }
                }
                FreeMibTable(table_ptr as *const _);
                return VpnStatus {
                    connected: found.is_some(),
                    name: found,
                };
            }
        }
    }
    VpnStatus {
        connected: false,
        name: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_guid_formatting_and_vpn_filter() {
        let bytes: [u8; 16] = [
            0x34, 0x12, 0x00, 0x00, 0x78, 0x56, 0xab, 0x90, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66,
            0x77, 0x88,
        ];
        assert_eq!(
            format_guid_le_bytes(&bytes).as_deref(),
            Some("{00001234-5678-90AB-1122-334455667788}")
        );
        assert!(is_vpn_interface(53, "WireGuard Tunnel"));
        assert!(!is_vpn_interface(6, "VirtualBox Host-Only Ethernet Adapter"));
        assert!(!get_storage_drives().is_empty(), "Expected at least one fixed drive");
    }
}
