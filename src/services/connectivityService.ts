import { invoke } from "@tauri-apps/api/core";

export interface WifiNetwork {
  ssid: string;
  signal: number;
  is_connected: boolean;
  is_secure: boolean;
  is_saved: boolean;
}

export interface WifiStatus {
  enabled: boolean;
  connected_ssid: string;
  networks: WifiNetwork[];
}

export interface BluetoothDeviceItem {
  name: string;
  is_connected: boolean;
  battery: number | null;
}

export interface BluetoothStatus {
  enabled: boolean;
  connected_name: string;
  devices: BluetoothDeviceItem[];
}

export async function fetchWifiStatus(): Promise<WifiStatus> {
  try {
    return await invoke<WifiStatus>("get_wifi_status");
  } catch (err) {
    console.error("Failed to get Wi-Fi status:", err);
    return {
      enabled: false,
      connected_ssid: "",
      networks: [],
    };
  }
}

export async function toggleWifiState(enable: boolean): Promise<boolean> {
  try {
    return await invoke<boolean>("toggle_wifi", { enable });
  } catch (err) {
    console.error("Failed to toggle Wi-Fi:", err);
    throw err;
  }
}

export async function connectToWifi(ssid: string): Promise<void> {
  try {
    await invoke("connect_wifi", { ssid });
  } catch (err) {
    console.error(`Failed to connect to Wi-Fi "${ssid}":`, err);
    throw err;
  }
}

export async function disconnectFromWifi(): Promise<void> {
  try {
    await invoke("disconnect_wifi");
  } catch (err) {
    console.error("Failed to disconnect Wi-Fi:", err);
    throw err;
  }
}

export async function fetchBluetoothStatus(): Promise<BluetoothStatus> {
  try {
    return await invoke<BluetoothStatus>("get_bluetooth_status");
  } catch (err) {
    console.error("Failed to get Bluetooth status:", err);
    return {
      enabled: false,
      connected_name: "Off",
      devices: [],
    };
  }
}

export async function toggleBluetoothState(enable: boolean): Promise<boolean> {
  try {
    return await invoke<boolean>("toggle_bluetooth", { enable });
  } catch (err) {
    console.error("Failed to toggle Bluetooth:", err);
    throw err;
  }
}
