use std::process::Command;

fn main() {
    let mut wifi_name = "Off".to_string();
    if let Ok(output) = Command::new("netsh").args(["wlan", "show", "interfaces"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.trim().starts_with("SSID") {
                let parts: Vec<&str> = line.split(':').collect();
                if parts.len() > 1 {
                    wifi_name = parts[1].trim().to_string();
                    break;
                }
            }
        }
    }
    
    let mut bt_name = "On".to_string();
    let ps_cmd = "Get-PnpDevice -Class Bluetooth | Where-Object { $_.Status -eq 'OK' -and $_.FriendlyName -notmatch 'Adapter|Enumerator|Microsoft|Support' } | Select-Object -ExpandProperty FriendlyName -First 1";
    if let Ok(output) = Command::new("powershell").args(["-NoProfile", "-Command", ps_cmd]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !stdout.is_empty() {
            bt_name = stdout;
        }
    }
    
    println!("Wifi: {}", wifi_name);
    println!("BT: {}", bt_name);
}
