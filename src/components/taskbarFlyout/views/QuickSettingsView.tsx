import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Wifi,
  WifiOff,
  Bluetooth,
  Plane,
  Moon,
  Leaf,
  Accessibility,
  Sun,
  Volume2,
  VolumeX,
  Volume1,
  SlidersHorizontal,
  Settings,
  Pencil,
  ChevronRight,
  ChevronLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Music,
  Lock,
  RotateCw,
  ExternalLink,
  Loader2,
  BatteryCharging,
} from "lucide-react";
import {
  fetchWifiStatus,
  toggleWifiState,
  connectToWifi,
  connectToWifiWithPassword,
  WifiStatus,
  BluetoothStatus,
  fetchBluetoothStatus,
  toggleBluetoothState,
} from "../../../services/connectivityService";

interface QuickSettingsViewProps {
  onClose?: () => void;
  onSwitchToVolumeMixer?: () => void;
}

interface MediaState {
  title: string;
  artist: string;
  app: string;
  album_art?: string;
  is_playing: boolean;
  position: number;
  duration: number;
}

interface SystemPowerInfo {
  is_charging: boolean;
  percent: number;
  seconds_remaining?: number | null;
}

export const QuickSettingsView: React.FC<QuickSettingsViewProps> = ({
  onClose,
  onSwitchToVolumeMixer,
}) => {
  // Navigation: null = main view, "wifi" | "bluetooth" | "accessibility" = subviews
  const [activeSubmenu, setActiveSubmenu] = useState<
    null | "wifi" | "bluetooth" | "accessibility"
  >(null);

  // 1. Wi-Fi State
  const [wifiStatus, setWifiStatus] = useState<WifiStatus>({
    enabled: true,
    connected_ssid: "",
    networks: [],
  });
  const [isScanningWifi, setIsScanningWifi] = useState(false);
  const [connectingSsid, setConnectingSsid] = useState<string | null>(null);
  const [passwordSsid, setPasswordSsid] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");

  // 2. Bluetooth State
  const [btStatus, setBtStatus] = useState<BluetoothStatus>({
    enabled: false,
    connected_name: "",
    devices: [],
  });

  // 3. Quick Action Toggles
  const [isAirplaneMode, setIsAirplaneMode] = useState(false);
  const [isBatterySaver, setIsBatterySaver] = useState(false);
  const [isNightLight, setIsNightLight] = useState(false);

  // 4. Media State
  const [mediaInfo, setMediaInfo] = useState<MediaState | null>(null);

  // 5. Sliders State
  const [brightness, setBrightness] = useState<number>(64);
  const [volume, setVolume] = useState<number>(50);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // 6. Battery / Power State
  const [powerInfo, setPowerInfo] = useState<SystemPowerInfo | null>(null);

  const brightnessSliderRef = useRef<HTMLDivElement>(null);
  const volumeSliderRef = useRef<HTMLDivElement>(null);
  const isDraggingBrightnessRef = useRef(false);
  const isDraggingVolumeRef = useRef(false);

  // Fetch initial statuses
  const loadSystemStatuses = useCallback(async () => {
    try {
      // Wi-Fi
      fetchWifiStatus()
        .then((data) => setWifiStatus(data))
        .catch(() => {});

      // Bluetooth
      fetchBluetoothStatus()
        .then((data) => setBtStatus(data))
        .catch(() => {});

      // Brightness
      invoke<number>("get_brightness")
        .then((val) => {
          if (typeof val === "number" && !isNaN(val)) {
            setBrightness(Math.max(0, Math.min(100, Math.round(val))));
          }
        })
        .catch(() => {});

      // Volume & Mute
      invoke<number>("get_master_volume")
        .then((vol) => {
          if (typeof vol === "number") {
            setVolume(Math.max(0, Math.min(100, Math.round(vol * 100))));
          }
        })
        .catch(() => {});

      invoke<boolean>("get_master_mute")
        .then((m) => setIsMuted(!!m))
        .catch(() => {});

      // Battery Power Info
      invoke<SystemPowerInfo | null>("get_system_power_info")
        .then((info) => {
          if (info) setPowerInfo(info);
        })
        .catch(() => {});
    } catch {}
  }, []);

  useEffect(() => {
    loadSystemStatuses();

    // Listen to real-time events
    const unlistenVol = listen<{ volume: number; muted: boolean }>(
      "master-volume-changed",
      (event) => {
        if (!isDraggingVolumeRef.current && event.payload) {
          setVolume(Math.round(event.payload.volume * 100));
          setIsMuted(event.payload.muted);
        }
      }
    );

    const unlistenBright = listen<number>("brightness-update", (event) => {
      if (!isDraggingBrightnessRef.current && typeof event.payload === "number") {
        setBrightness(Math.max(0, Math.min(100, Math.round(event.payload))));
      }
    });

    const unlistenMedia = listen<{
      title: string;
      artist: string;
      app: string;
      thumbnail?: string;
      is_playing: boolean;
      position?: number;
      duration?: number;
    }>("media-update", (event) => {
      if (event.payload && event.payload.title) {
        setMediaInfo({
          title: event.payload.title,
          artist: event.payload.artist || "",
          app: event.payload.app || "Media",
          album_art: event.payload.thumbnail,
          is_playing: event.payload.is_playing,
          position: event.payload.position || 0,
          duration: event.payload.duration || 100,
        });
      } else {
        setMediaInfo(null);
      }
    });

    const unlistenMediaProg = listen<{ position: number; duration: number }>(
      "media-progress",
      (event) => {
        if (event.payload) {
          setMediaInfo((prev) =>
            prev
              ? {
                  ...prev,
                  position: event.payload.position,
                  duration: event.payload.duration || prev.duration,
                }
              : null
          );
        }
      }
    );

    return () => {
      unlistenVol.then((fn) => fn());
      unlistenBright.then((fn) => fn());
      unlistenMedia.then((fn) => fn());
      unlistenMediaProg.then((fn) => fn());
    };
  }, [loadSystemStatuses]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeSubmenu) {
          e.preventDefault();
          setActiveSubmenu(null);
        } else if (onClose) {
          e.preventDefault();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSubmenu, onClose]);

  // Wi-Fi Toggles & Connect
  const handleToggleWifi = async () => {
    const nextState = !wifiStatus.enabled;
    setWifiStatus((prev) => ({ ...prev, enabled: nextState }));
    try {
      await toggleWifiState(nextState);
      const updated = await fetchWifiStatus();
      setWifiStatus(updated);
    } catch {}
  };

  const handleScanWifi = async () => {
    setIsScanningWifi(true);
    try {
      const updated = await fetchWifiStatus();
      setWifiStatus(updated);
    } finally {
      setIsScanningWifi(false);
    }
  };

  const handleConnectWifi = async (ssid: string, isSecure: boolean) => {
    if (isSecure && !wifiStatus.networks.find((n) => n.ssid === ssid)?.is_saved) {
      setPasswordSsid(ssid);
      setPasswordInput("");
      return;
    }
    setConnectingSsid(ssid);
    try {
      await connectToWifi(ssid);
      const updated = await fetchWifiStatus();
      setWifiStatus(updated);
    } catch {
      invoke("system_power_action", { action: "wifi" }).catch(() => {});
    } finally {
      setConnectingSsid(null);
    }
  };

  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordSsid || !passwordInput.trim()) return;
    setConnectingSsid(passwordSsid);
    try {
      await connectToWifiWithPassword(passwordSsid, passwordInput.trim());
      setPasswordSsid(null);
      setPasswordInput("");
      const updated = await fetchWifiStatus();
      setWifiStatus(updated);
    } catch {
      invoke("system_power_action", { action: "wifi" }).catch(() => {});
    } finally {
      setConnectingSsid(null);
    }
  };

  // Bluetooth Toggles
  const handleToggleBluetooth = async () => {
    const nextState = !btStatus.enabled;
    setBtStatus((prev) => ({ ...prev, enabled: nextState }));
    try {
      await toggleBluetoothState(nextState);
      const updated = await fetchBluetoothStatus();
      setBtStatus(updated);
    } catch {}
  };

  // Airplane Mode
  const handleToggleAirplane = () => {
    setIsAirplaneMode((prev) => !prev);
    invoke("system_power_action", { action: "airplane" }).catch(() => {});
  };

  // Battery Saver
  const handleToggleBatterySaver = () => {
    setIsBatterySaver((prev) => !prev);
    invoke("system_power_action", { action: "batterysaver" }).catch(() => {});
  };

  // Night Light
  const handleToggleNightLight = () => {
    setIsNightLight((prev) => !prev);
    invoke("system_power_action", { action: "nightlight" }).catch(() => {});
  };

  // Media Controls
  const handleMediaPlayPause = () => {
    invoke("smtc_action", { action: "toggle" }).catch(() => {});
    setMediaInfo((prev) => (prev ? { ...prev, is_playing: !prev.is_playing } : null));
  };

  const handleMediaPrev = () => {
    invoke("smtc_action", { action: "prev" }).catch(() => {});
  };

  const handleMediaNext = () => {
    invoke("smtc_action", { action: "next" }).catch(() => {});
  };

  // Brightness Pointer / Slider Handler
  const updateBrightnessFromClientX = (clientX: number) => {
    const el = brightnessSliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const level = Math.round(ratio * 100);
    setBrightness(level);
    invoke("set_brightness", { level }).catch(() => {});
  };

  const handleBrightnessPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingBrightnessRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateBrightnessFromClientX(e.clientX);
  };

  const handleBrightnessPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingBrightnessRef.current) {
      updateBrightnessFromClientX(e.clientX);
    }
  };

  const handleBrightnessPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingBrightnessRef.current) {
      isDraggingBrightnessRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Master Volume Pointer / Slider Handler
  const updateVolumeFromClientX = (clientX: number) => {
    const el = volumeSliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const level = Math.round(ratio * 100);
    setVolume(level);
    if (isMuted && ratio > 0) {
      setIsMuted(false);
      invoke("set_master_mute", { muted: false }).catch(() => {});
    }
    invoke("set_master_volume", { level: ratio }).catch(() => {});
  };

  const handleVolumePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingVolumeRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateVolumeFromClientX(e.clientX);
  };

  const handleVolumePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingVolumeRef.current) {
      updateVolumeFromClientX(e.clientX);
    }
  };

  const handleVolumePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingVolumeRef.current) {
      isDraggingVolumeRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    invoke("set_master_mute", { muted: nextMuted }).catch(() => {});
  };

  // Keyboard adjustment for sliders
  const handleBrightnessKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(0, brightness - 5);
      setBrightness(next);
      invoke("set_brightness", { level: next }).catch(() => {});
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(100, brightness + 5);
      setBrightness(next);
      invoke("set_brightness", { level: next }).catch(() => {});
    }
  };

  const handleVolumeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(0, volume - 5);
      setVolume(next);
      invoke("set_master_volume", { level: next / 100 }).catch(() => {});
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(100, volume + 5);
      setVolume(next);
      invoke("set_master_volume", { level: next / 100 }).catch(() => {});
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      handleToggleMute();
    }
  };

  // Open settings
  const handleOpenSettings = () => {
    invoke("system_power_action", { action: "settings" }).catch(() => {});
  };

  const handleOpenQuickSettingsEdit = () => {
    invoke("system_power_action", { action: "quicksettings_edit" }).catch(() => {});
  };

  // ==========================================
  // SUBVIEWS: Wi-Fi, Bluetooth, Accessibility
  // ==========================================
  if (activeSubmenu === "wifi") {
    return (
      <div className="flex flex-col w-full h-full text-[var(--taskbar-text)]">
        {/* Header */}
        <div className="flex items-center gap-3 h-10 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubmenu(null)}
            aria-label="Kembali ke Pengaturan Cepat"
            className="w-8 h-8 rounded-full gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-white"
          >
            <ChevronLeft size={16} strokeWidth={2.2} />
          </button>
          <span className="flex-1 text-[15px] font-semibold tracking-tight">
            Wi-Fi
          </span>
          <button
            type="button"
            onClick={handleScanWifi}
            disabled={isScanningWifi}
            aria-label="Pindai ulang jaringan"
            className="w-8 h-8 rounded-full gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-white"
          >
            <RotateCw
              size={14}
              className={isScanningWifi ? "animate-spin" : ""}
            />
          </button>
        </div>

        {/* Radio toggle */}
        <div className="flex items-center justify-between p-3 rounded-[14px] gili-flyout-card my-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <Wifi size={18} className="text-[var(--taskbar-accent)]" />
            <span className="text-[13px] font-medium">Wi-Fi</span>
          </div>
          <button
            type="button"
            onClick={handleToggleWifi}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 cursor-pointer border-0 ${
              wifiStatus.enabled
                ? "bg-[var(--taskbar-accent)]"
                : "bg-white/20"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                wifiStatus.enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Password input modal if connecting to new secure network */}
        {passwordSsid && (
          <form
            onSubmit={handleSubmitPassword}
            className="p-3 rounded-[14px] gili-flyout-card mb-2 flex flex-col gap-2 shrink-0"
          >
            <span className="text-[12px] font-semibold">
              Masukkan kata sandi untuk {passwordSsid}
            </span>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Kata sandi jaringan"
              autoFocus
              className="h-8 px-2.5 rounded-[8px] bg-black/40 border border-white/20 text-white text-[12px] outline-none focus:border-[var(--taskbar-accent)]"
            />
            <div className="flex justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={() => setPasswordSsid(null)}
                className="px-2.5 py-1 rounded-[6px] gili-flyout-chip text-[11.5px] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={connectingSsid === passwordSsid}
                className="px-3 py-1 rounded-[6px] bg-[var(--taskbar-accent)] text-white text-[11.5px] font-medium cursor-pointer flex items-center gap-1.5"
              >
                {connectingSsid === passwordSsid && (
                  <Loader2 size={12} className="animate-spin" />
                )}
                Sambungkan
              </button>
            </div>
          </form>
        )}

        {/* Network list */}
        <div className="flex-1 overflow-y-auto pr-0.5 space-y-1">
          {!wifiStatus.enabled ? (
            <div className="h-32 flex flex-col items-center justify-center text-[12px] text-[var(--taskbar-text-muted)] gap-2">
              <WifiOff size={24} className="opacity-40" />
              <span>Wi-Fi dimatikan</span>
            </div>
          ) : wifiStatus.networks.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-[12px] text-[var(--taskbar-text-muted)]">
              {isScanningWifi ? "Memindai jaringan..." : "Tidak ada jaringan ditemukan"}
            </div>
          ) : (
            wifiStatus.networks.map((net) => {
              const isCurrent = net.is_connected || net.ssid === wifiStatus.connected_ssid;
              const isConnecting = connectingSsid === net.ssid;
              return (
                <div
                  key={net.ssid}
                  className={`h-11 px-3 rounded-[12px] flex items-center justify-between text-[13px] transition-colors ${
                    isCurrent
                      ? "bg-[var(--taskbar-item-selected)] text-white font-medium"
                      : "gili-flyout-item text-[var(--taskbar-text-2)] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Wifi size={16} className={isCurrent ? "text-[var(--taskbar-accent)]" : "opacity-70"} />
                    <span className="truncate">{net.ssid}</span>
                    {net.is_secure && (
                      <Lock size={12} className="opacity-50 shrink-0" />
                    )}
                  </div>
                  {isCurrent ? (
                    <span className="text-[11px] text-[var(--taskbar-status-green)] font-medium">
                      Terhubung
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isConnecting}
                      onClick={() => handleConnectWifi(net.ssid, net.is_secure)}
                      className="px-2.5 py-1 rounded-[8px] gili-flyout-chip text-[11px] font-medium cursor-pointer text-white flex items-center gap-1"
                    >
                      {isConnecting && <Loader2 size={11} className="animate-spin" />}
                      Sambung
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Link */}
        <div className="h-10 border-t border-[var(--taskbar-separator)] mt-2 pt-2 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => invoke("system_power_action", { action: "wifi" })}
            className="text-[12px] text-[var(--taskbar-accent)] hover:underline flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0"
          >
            Pengaturan Wi-Fi lainnya
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
    );
  }

  if (activeSubmenu === "bluetooth") {
    return (
      <div className="flex flex-col w-full h-full text-[var(--taskbar-text)]">
        {/* Header */}
        <div className="flex items-center gap-3 h-10 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubmenu(null)}
            aria-label="Kembali ke Pengaturan Cepat"
            className="w-8 h-8 rounded-full gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-white"
          >
            <ChevronLeft size={16} strokeWidth={2.2} />
          </button>
          <span className="flex-1 text-[15px] font-semibold tracking-tight">
            Bluetooth
          </span>
        </div>

        {/* Radio toggle */}
        <div className="flex items-center justify-between p-3 rounded-[14px] gili-flyout-card my-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <Bluetooth size={18} className="text-[var(--taskbar-accent)]" />
            <span className="text-[13px] font-medium">Bluetooth</span>
          </div>
          <button
            type="button"
            onClick={handleToggleBluetooth}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 cursor-pointer border-0 ${
              btStatus.enabled
                ? "bg-[var(--taskbar-accent)]"
                : "bg-white/20"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                btStatus.enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Devices list */}
        <div className="flex-1 overflow-y-auto pr-0.5 space-y-1">
          {!btStatus.enabled ? (
            <div className="h-32 flex flex-col items-center justify-center text-[12px] text-[var(--taskbar-text-muted)] gap-2">
              <Bluetooth size={24} className="opacity-40" />
              <span>Bluetooth dimatikan</span>
            </div>
          ) : btStatus.devices.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-[12px] text-[var(--taskbar-text-muted)]">
              Tidak ada perangkat Bluetooth ditemukan
            </div>
          ) : (
            btStatus.devices.map((device) => (
              <div
                key={device.name}
                className={`h-11 px-3 rounded-[12px] flex items-center justify-between text-[13px] ${
                  device.is_connected
                    ? "bg-[var(--taskbar-item-selected)] text-white font-medium"
                    : "gili-flyout-item text-[var(--taskbar-text-2)]"
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Bluetooth size={16} className={device.is_connected ? "text-[var(--taskbar-accent)]" : "opacity-70"} />
                  <span className="truncate">{device.name}</span>
                </div>
                <span className="text-[11px] opacity-75">
                  {device.is_connected ? "Terhubung" : "Berpasangan"}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer Link */}
        <div className="h-10 border-t border-[var(--taskbar-separator)] mt-2 pt-2 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => invoke("system_power_action", { action: "bluetooth" })}
            className="text-[12px] text-[var(--taskbar-accent)] hover:underline flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0"
          >
            Pengaturan Bluetooth lainnya
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
    );
  }

  if (activeSubmenu === "accessibility") {
    return (
      <div className="flex flex-col w-full h-full text-[var(--taskbar-text)]">
        {/* Header */}
        <div className="flex items-center gap-3 h-10 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubmenu(null)}
            aria-label="Kembali ke Pengaturan Cepat"
            className="w-8 h-8 rounded-full gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-white"
          >
            <ChevronLeft size={16} strokeWidth={2.2} />
          </button>
          <span className="flex-1 text-[15px] font-semibold tracking-tight">
            Aksesibilitas
          </span>
        </div>

        <div className="flex-1 overflow-y-auto pr-0.5 space-y-2 mt-2">
          {[
            { label: "Kaca pembesar", desc: "Perbesar tampilan layar", action: "accessibility" },
            { label: "Narator", desc: "Pembaca layar bersuara", action: "accessibility" },
            { label: "Filter warna", desc: "Membantu penglihatan warna", action: "accessibility" },
            { label: "Audio mono", desc: "Gabungkan saluran suara kiri dan kanan", action: "accessibility" },
            { label: "Teks langsung", desc: "Tampilkan teks otomatis saat audio diputar", action: "accessibility" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => invoke("system_power_action", { action: item.action })}
              className="w-full h-12 px-3 rounded-[12px] gili-flyout-item flex items-center justify-between text-left cursor-pointer border-0"
            >
              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-[var(--taskbar-text)]">
                  {item.label}
                </span>
                <span className="text-[11px] text-[var(--taskbar-text-muted)]">
                  {item.desc}
                </span>
              </div>
              <ChevronRight size={15} className="text-[var(--taskbar-text-muted)]" />
            </button>
          ))}
        </div>

        <div className="h-10 border-t border-[var(--taskbar-separator)] mt-2 pt-2 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => invoke("system_power_action", { action: "accessibility" })}
            className="text-[12px] text-[var(--taskbar-accent)] hover:underline flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0"
          >
            Pengaturan aksesibilitas lainnya
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // MAIN VIEW (Board 90 & 94)
  // ==========================================
  return (
    <div className="flex flex-col w-full h-full text-[var(--taskbar-text)]">
      {/* 1. Top Card: Media Player (Spotify / Windows Media) */}
      {mediaInfo ? (
        <div className="rounded-[16px] gili-flyout-card p-3 flex flex-col shrink-0 mb-3 border border-[var(--taskbar-card-border)]">
          {/* App badge */}
          <div className="flex items-center gap-2 text-[11.5px] text-[var(--taskbar-text-2)] font-medium">
            <span className="w-5 h-5 rounded-full gili-flyout-chip flex items-center justify-center shrink-0">
              <Music size={11} strokeWidth={2} />
            </span>
            <span>{mediaInfo.app}</span>
          </div>

          {/* Title, Artist, Album Art */}
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] font-semibold tracking-tight truncate text-[var(--taskbar-text)]">
                {mediaInfo.title}
              </div>
              <div className="text-[12px] text-[var(--taskbar-text-2)] truncate mt-0.5">
                {mediaInfo.artist || "Artis tidak diketahui"}
              </div>
            </div>
            {mediaInfo.album_art ? (
              <img
                src={mediaInfo.album_art}
                alt="Album art"
                className="w-[56px] h-[56px] rounded-[12px] object-cover shrink-0 border border-[var(--taskbar-card-border)]"
              />
            ) : (
              <span className="w-[56px] h-[56px] rounded-[12px] gili-flyout-chip flex items-center justify-center shrink-0 border border-[var(--taskbar-card-border)]">
                <Music size={22} className="opacity-40" />
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div
            role="img"
            aria-label="Progres media"
            className="h-1 rounded-[2px] bg-white/20 mt-2.5 overflow-hidden"
          >
            <div
              style={{
                width: `${
                  mediaInfo.duration > 0
                    ? Math.min(100, (mediaInfo.position / mediaInfo.duration) * 100)
                    : 35
                }%`,
              }}
              className="h-full rounded-[2px] bg-[#e4e4e7]"
            />
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-2.5 mt-2">
            <button
              type="button"
              onClick={handleMediaPrev}
              aria-label="Sebelumnya"
              className="w-10 h-10 rounded-[12px] bg-transparent text-[#e4e4e7] flex items-center justify-center p-0 border-0 cursor-pointer hover:bg-white/10 active:scale-95"
            >
              <SkipBack size={17} fill="currentColor" />
            </button>
            <button
              type="button"
              onClick={handleMediaPlayPause}
              aria-label={mediaInfo.is_playing ? "Jeda" : "Putar"}
              className="w-11 h-11 rounded-[15px] bg-white text-[#0b0b0e] flex items-center justify-center p-0 border-0 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
            >
              {mediaInfo.is_playing ? (
                <Pause size={17} fill="currentColor" />
              ) : (
                <Play size={17} fill="currentColor" className="translate-x-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={handleMediaNext}
              aria-label="Berikutnya"
              className="w-10 h-10 rounded-[12px] bg-transparent text-[#e4e4e7] flex items-center justify-center p-0 border-0 cursor-pointer hover:bg-white/10 active:scale-95"
            >
              <SkipForward size={17} fill="currentColor" />
            </button>
          </div>
        </div>
      ) : null}

      {/* 2. Quick Action Toggles (Grid 2 cols x 3 rows) */}
      <div className="grid grid-cols-2 gap-2 shrink-0">
        {/* Tile 1: Wi-Fi */}
        <div
          className={`h-[64px] rounded-[16px] border flex items-center px-3 text-left transition-colors ${
            wifiStatus.enabled
              ? "border-[rgba(56,130,246,0.55)] bg-[rgba(56,130,246,0.22)] text-white"
              : "border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] text-[var(--taskbar-text)]"
          }`}
        >
          <button
            type="button"
            onClick={handleToggleWifi}
            aria-label={`Toggle Wi-Fi (${wifiStatus.enabled ? "Aktif" : "Mati"})`}
            className="flex-1 min-w-0 flex items-center gap-2.5 bg-transparent border-0 p-0 text-left cursor-pointer"
          >
            <Wifi
              size={19}
              className={wifiStatus.enabled ? "text-[#a9cbff]" : "text-[var(--taskbar-text-2)]"}
            />
            <div className="flex flex-col truncate">
              <span className="text-[12.5px] font-semibold truncate text-[var(--taskbar-text)]">
                Wi-Fi
              </span>
              <span
                className={`text-[11px] truncate ${
                  wifiStatus.enabled ? "text-[#a9cbff]" : "text-[var(--taskbar-text-muted)]"
                }`}
              >
                {wifiStatus.enabled
                  ? wifiStatus.connected_ssid || "Aktif"
                  : "Mati"}
              </span>
            </div>
          </button>
          <div className="w-[1px] h-[22px] bg-white/20 mx-1.5 shrink-0" />
          <button
            type="button"
            onClick={() => setActiveSubmenu("wifi")}
            aria-label="Buka daftar jaringan Wi-Fi"
            className="w-6 h-8 flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer text-white/70 hover:text-white"
          >
            <ChevronRight size={16} strokeWidth={2.2} />
          </button>
        </div>

        {/* Tile 2: Bluetooth */}
        <div
          className={`h-[64px] rounded-[16px] border flex items-center px-3 text-left transition-colors ${
            btStatus.enabled
              ? "border-[rgba(56,130,246,0.55)] bg-[rgba(56,130,246,0.22)] text-white"
              : "border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] text-[var(--taskbar-text)]"
          }`}
        >
          <button
            type="button"
            onClick={handleToggleBluetooth}
            aria-label={`Toggle Bluetooth (${btStatus.enabled ? "Aktif" : "Mati"})`}
            className="flex-1 min-w-0 flex items-center gap-2.5 bg-transparent border-0 p-0 text-left cursor-pointer"
          >
            <Bluetooth
              size={19}
              className={btStatus.enabled ? "text-[#a9cbff]" : "text-[var(--taskbar-text-2)]"}
            />
            <div className="flex flex-col truncate">
              <span className="text-[12.5px] font-semibold truncate text-[var(--taskbar-text)]">
                Bluetooth
              </span>
              <span
                className={`text-[11px] truncate ${
                  btStatus.enabled ? "text-[#a9cbff]" : "text-[var(--taskbar-text-muted)]"
                }`}
              >
                {btStatus.enabled
                  ? btStatus.connected_name || "Aktif"
                  : "Mati"}
              </span>
            </div>
          </button>
          <div className="w-[1px] h-[22px] bg-white/20 mx-1.5 shrink-0" />
          <button
            type="button"
            onClick={() => setActiveSubmenu("bluetooth")}
            aria-label="Buka daftar perangkat Bluetooth"
            className="w-6 h-8 flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer text-white/70 hover:text-white"
          >
            <ChevronRight size={16} strokeWidth={2.2} />
          </button>
        </div>

        {/* Tile 3: Mode pesawat */}
        <button
          type="button"
          onClick={handleToggleAirplane}
          className={`h-[64px] rounded-[16px] border flex items-center gap-2.5 px-3 text-left cursor-pointer transition-colors ${
            isAirplaneMode
              ? "border-[rgba(56,130,246,0.55)] bg-[rgba(56,130,246,0.22)] text-white"
              : "border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] text-[var(--taskbar-text)]"
          }`}
        >
          <Plane
            size={19}
            className={isAirplaneMode ? "text-[#a9cbff]" : "text-[var(--taskbar-text-2)]"}
          />
          <div className="flex flex-col truncate">
            <span className="text-[12.5px] font-semibold truncate text-[var(--taskbar-text)]">
              Mode pesawat
            </span>
            <span
              className={`text-[11px] truncate ${
                isAirplaneMode ? "text-[#a9cbff]" : "text-[var(--taskbar-text-muted)]"
              }`}
            >
              {isAirplaneMode ? "Aktif" : "Mati"}
            </span>
          </div>
        </button>

        {/* Tile 4: Aksesibilitas */}
        <div className="h-[64px] rounded-[16px] border border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] flex items-center px-3 text-left">
          <button
            type="button"
            onClick={() => setActiveSubmenu("accessibility")}
            className="flex-1 min-w-0 flex items-center gap-2.5 bg-transparent border-0 p-0 text-left cursor-pointer"
          >
            <Accessibility size={19} className="text-[var(--taskbar-text-2)]" />
            <div className="flex flex-col truncate">
              <span className="text-[12.5px] font-semibold truncate text-[var(--taskbar-text)]">
                Aksesibilitas
              </span>
              <span className="text-[11px] truncate text-[var(--taskbar-text-muted)]">
                Atur
              </span>
            </div>
          </button>
          <div className="w-[1px] h-[22px] bg-white/20 mx-1.5 shrink-0" />
          <button
            type="button"
            onClick={() => setActiveSubmenu("accessibility")}
            aria-label="Buka sub-menu Aksesibilitas"
            className="w-6 h-8 flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer text-white/70 hover:text-white"
          >
            <ChevronRight size={16} strokeWidth={2.2} />
          </button>
        </div>

        {/* Tile 5: Penghemat daya */}
        <button
          type="button"
          onClick={handleToggleBatterySaver}
          className={`h-[64px] rounded-[16px] border flex items-center gap-2.5 px-3 text-left cursor-pointer transition-colors ${
            isBatterySaver
              ? "border-[rgba(56,130,246,0.55)] bg-[rgba(56,130,246,0.22)] text-white"
              : "border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] text-[var(--taskbar-text)]"
          }`}
        >
          <Leaf
            size={19}
            className={isBatterySaver ? "text-[#a9cbff]" : "text-[var(--taskbar-text-2)]"}
          />
          <div className="flex flex-col truncate">
            <span className="text-[12.5px] font-semibold truncate text-[var(--taskbar-text)]">
              Penghemat daya
            </span>
            <span
              className={`text-[11px] truncate ${
                isBatterySaver ? "text-[#a9cbff]" : "text-[var(--taskbar-text-muted)]"
              }`}
            >
              {isBatterySaver ? "Aktif" : "Mati"}
            </span>
          </div>
        </button>

        {/* Tile 6: Lampu malam */}
        <button
          type="button"
          onClick={handleToggleNightLight}
          className={`h-[64px] rounded-[16px] border flex items-center gap-2.5 px-3 text-left cursor-pointer transition-colors ${
            isNightLight
              ? "border-[rgba(56,130,246,0.55)] bg-[rgba(56,130,246,0.22)] text-white"
              : "border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] text-[var(--taskbar-text)]"
          }`}
        >
          <Moon
            size={19}
            className={isNightLight ? "text-[#a9cbff]" : "text-[var(--taskbar-text-2)]"}
          />
          <div className="flex flex-col truncate">
            <span className="text-[12.5px] font-semibold truncate text-[var(--taskbar-text)]">
              Lampu malam
            </span>
            <span
              className={`text-[11px] truncate ${
                isNightLight ? "text-[#a9cbff]" : "text-[var(--taskbar-text-muted)]"
              }`}
            >
              {isNightLight ? "Aktif" : "Mati"}
            </span>
          </div>
        </button>
      </div>

      {/* 3. Sliders Section */}
      <div className="flex flex-col gap-2.5 mt-3 shrink-0">
        {/* Brightness Slider */}
        <div className="flex items-center gap-2.5">
          <div
            ref={brightnessSliderRef}
            role="slider"
            aria-label="Kecerahan layar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={brightness}
            tabIndex={0}
            onKeyDown={handleBrightnessKeyDown}
            onPointerDown={handleBrightnessPointerDown}
            onPointerMove={handleBrightnessPointerMove}
            onPointerUp={handleBrightnessPointerUp}
            className="flex-1 h-10 rounded-[13px] bg-[var(--taskbar-card-muted)] relative overflow-hidden cursor-ew-resize select-none border border-[var(--taskbar-card-border)] outline-none focus:ring-1 focus:ring-[var(--taskbar-accent)]"
          >
            <div
              style={{ width: `${brightness}%` }}
              className="h-full bg-[#e4e4e7] flex items-center pl-3 box-border text-[#0b0b0e]"
            >
              <Sun size={16} strokeWidth={2} />
            </div>
          </div>
          <span className="w-[34px] text-[12px] text-[var(--taskbar-text-2)] font-mono tabular-nums text-right shrink-0">
            {brightness}%
          </span>
          <span className="w-10 shrink-0" />
        </div>

        {/* Master Volume Slider */}
        <div className="flex items-center gap-2.5">
          <div
            ref={volumeSliderRef}
            role="slider"
            aria-label="Volume utama"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={isMuted ? 0 : volume}
            tabIndex={0}
            onKeyDown={handleVolumeKeyDown}
            onPointerDown={handleVolumePointerDown}
            onPointerMove={handleVolumePointerMove}
            onPointerUp={handleVolumePointerUp}
            className="flex-1 h-10 rounded-[13px] bg-[var(--taskbar-card-muted)] relative overflow-hidden cursor-ew-resize select-none border border-[var(--taskbar-card-border)] outline-none focus:ring-1 focus:ring-[var(--taskbar-accent)]"
          >
            <div
              style={{ width: `${isMuted ? 0 : volume}%` }}
              className="h-full bg-[#e4e4e7] flex items-center pl-3 box-border text-[#0b0b0e]"
            >
              {isMuted || volume === 0 ? (
                <VolumeX size={16} strokeWidth={2} />
              ) : volume < 50 ? (
                <Volume1 size={16} strokeWidth={2} />
              ) : (
                <Volume2 size={16} strokeWidth={2} />
              )}
            </div>
          </div>
          <span className="w-[34px] text-[12px] text-[var(--taskbar-text-2)] font-mono tabular-nums text-right shrink-0">
            {isMuted ? "0%" : `${volume}%`}
          </span>
          {/* Switch to Sound Output Mixer (Window 1) */}
          <button
            type="button"
            onClick={onSwitchToVolumeMixer}
            aria-label="Buka mixer output suara"
            className="w-10 h-10 rounded-[12px] gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-white shrink-0"
          >
            <SlidersHorizontal size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* 4. Bottom Footer */}
      <div className="h-12 border-t border-[var(--taskbar-separator)] mt-3.5 -mx-3.5 -mb-3.5 px-3.5 flex items-center justify-between shrink-0">
        {/* Battery Info */}
        <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--taskbar-status-green)]">
          <svg
            width="22"
            height="11"
            viewBox="0 0 22 11"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="0.5"
              y="0.5"
              width="18"
              height="10"
              rx="3"
              stroke="currentColor"
            />
            <rect
              x="2"
              y="2"
              width={Math.max(2, Math.min(15, ((powerInfo?.percent ?? 100) / 100) * 15))}
              height="7"
              rx="1.8"
              fill="currentColor"
            />
            <rect
              x="19.5"
              y="3.5"
              width="2"
              height="4"
              rx="1"
              fill="currentColor"
            />
          </svg>
          <span>{powerInfo?.percent ?? 100}%</span>
          {powerInfo?.is_charging && (
            <BatteryCharging size={14} className="text-[var(--taskbar-status-green)]" />
          )}
        </div>

        {/* Pagination Dots */}
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--taskbar-accent)]" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* Actions: Settings Gear & Edit */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleOpenQuickSettingsEdit}
            aria-label="Edit pengaturan cepat"
            className="w-[34px] h-[34px] rounded-[11px] gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-white"
          >
            <Pencil size={15} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={handleOpenSettings}
            aria-label="Buka Pengaturan Windows"
            className="w-[34px] h-[34px] rounded-[11px] gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-white"
          >
            <Settings size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
};
