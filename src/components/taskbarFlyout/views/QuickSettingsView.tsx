import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
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
  Radio,
  BellOff,
  Cast,
  Camera,
  Monitor,
  Activity,
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
  toggleHotspotState,
} from "../../../services/connectivityService";
import type {
  QuickTogglesState,
  AccessibilityState,
} from "../../../services/taskbarLaunchService";
import { useTaskbarLang, tx } from "../../../services/taskbarI18n";
import { Tooltip } from "../../ui/Tooltip";
import type { MediaPayload } from "../../../types";
import { MediaThumbnail } from "../../ui/MediaThumbnail";
import {
  mergeMediaPayloadPreservingThumbnail,
  prefetchArtwork,
} from "../../../services/artworkService";
import { getMediaBranding } from "../../../utils/playerBranding";

type AccessibilityFeatureKey =
  | "magnifier"
  | "colorfilter"
  | "narrator"
  | "monoaudio"
  | "livecaptions";

const ACCESSIBILITY_STATE_KEY: Record<AccessibilityFeatureKey, keyof AccessibilityState> = {
  magnifier: "magnifier",
  colorfilter: "colorFilter",
  narrator: "narrator",
  monoaudio: "monoAudio",
  livecaptions: "liveCaptions",
};

interface QuickSettingsViewProps {
  onClose?: () => void;
  onSwitchToVolumeMixer?: () => void;
}

interface MediaState {
  title: string;
  artist: string;
  app: string;
  is_playing: boolean;
  position: number;
  duration: number;
  payload: MediaPayload;
}

function buildQuickSettingsMediaState(
  prev: MediaState | null,
  incoming: MediaPayload
): MediaState {
  const merged = mergeMediaPayloadPreservingThumbnail(prev?.payload ?? null, incoming);
  prefetchArtwork(merged);
  const branding = getMediaBranding(merged);
  return {
    title: merged.title,
    artist: merged.artist || "",
    app: merged.web_source || branding.name || "Media",
    is_playing: !!merged.is_playing,
    position: merged.position || 0,
    duration: merged.duration || 100,
    payload: merged,
  };
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
  const lang = useTaskbarLang();
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

  // 3. Quick Action Toggles (synced with Windows)
  const [tilePage, setTilePage] = useState<0 | 1>(0);
  const [isAirplaneMode, setIsAirplaneMode] = useState(false);
  const [isBatterySaver, setIsBatterySaver] = useState(false);
  const [isNightLight, setIsNightLight] = useState(false);
  const [isHotspot, setIsHotspot] = useState(false);
  const [isDnd, setIsDnd] = useState(false);
  const [accessibilityState, setAccessibilityState] = useState<AccessibilityState>({
    magnifier: false,
    colorFilter: false,
    narrator: false,
    monoAudio: false,
    liveCaptions: false,
  });

  // 4. Media State
  const [mediaInfo, setMediaInfo] = useState<MediaState | null>(null);
  const hasLiveMediaUpdateRef = useRef(false);

  // 5. Sliders State
  const [brightness, setBrightness] = useState<number>(64);
  const [volume, setVolume] = useState<number>(50);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // 6. Battery / Power State
  const [powerInfo, setPowerInfo] = useState<SystemPowerInfo | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastFlyoutHeightRef = useRef<number>(0);
  const brightnessSliderRef = useRef<HTMLDivElement>(null);
  const volumeSliderRef = useRef<HTMLDivElement>(null);
  const isDraggingBrightnessRef = useRef(false);
  const isDraggingVolumeRef = useRef(false);

  const reportFlyoutHeight = useCallback((nextHeight: number) => {
    const rounded = Math.ceil(nextHeight);
    if (Math.abs(rounded - lastFlyoutHeightRef.current) < 2) return;
    lastFlyoutHeightRef.current = rounded;
    invoke("resize_taskbar_flyout", { height: rounded }).catch(() => {});
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId: number | null = null;
    const syncContentHeight = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const node = containerRef.current;
        if (!node) return;
        // 28px accounts for TaskbarFlyoutApp wrapper vertical padding (p-3.5)
        const contentHeight = Math.max(
          node.getBoundingClientRect().height,
          node.scrollHeight
        );
        const measured = Math.ceil(contentHeight + 28);
        if (measured > 100) {
          reportFlyoutHeight(measured);
        }
      });
    };

    syncContentHeight();
    if (typeof ResizeObserver === "undefined") {
      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
      };
    }
    const observer = new ResizeObserver(syncContentHeight);
    observer.observe(el);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [
    activeSubmenu,
    mediaInfo,
    tilePage,
    wifiStatus.enabled,
    wifiStatus.networks.length,
    passwordSsid,
    btStatus.enabled,
    btStatus.devices.length,
    reportFlyoutHeight,
  ]);

  const refreshQuickToggles = useCallback(() => {
    invoke<QuickTogglesState>("get_quick_toggles_state")
      .then((qs) => {
        setIsAirplaneMode(!!qs.airplane_mode);
        setIsBatterySaver(!!qs.battery_saver);
        setIsNightLight(!!qs.night_light);
        setIsHotspot(!!qs.hotspot_enabled);
        setIsDnd(!!qs.dnd_enabled);
      })
      .catch(() => {});
  }, []);

  const refreshAccessibilityState = useCallback(() => {
    invoke<AccessibilityState>("get_accessibility_state")
      .then((state) => {
        if (state) setAccessibilityState(state);
      })
      .catch(() => {});
  }, []);

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

      // Real Windows quick toggle states (Airplane, Battery Saver, Night Light, Hotspot, DND)
      refreshQuickToggles();
      refreshAccessibilityState();

      // Initial active SMTC media snapshot
      invoke<MediaPayload | null>("get_current_media_state")
        .then((m) => {
          if (hasLiveMediaUpdateRef.current) return;
          if (m && m.title) {
            setMediaInfo((prev) => buildQuickSettingsMediaState(prev, m));
          } else {
            setMediaInfo(null);
          }
        })
        .catch(() => {});
    } catch {}
  }, [refreshQuickToggles, refreshAccessibilityState]);

  useEffect(() => {
    if (activeSubmenu === "accessibility") {
      refreshAccessibilityState();
    }
  }, [activeSubmenu, refreshAccessibilityState]);

  useEffect(() => {
    loadSystemStatuses();

    const handleWindowFocus = () => {
      loadSystemStatuses();
    };
    window.addEventListener("focus", handleWindowFocus);

    const unlistenFlyout = listen<{ isOpen?: boolean; target?: string }>(
      "taskbar-flyout-state-changed",
      (ev) => {
        if (ev.payload?.isOpen && ev.payload?.target === "quickSettings") {
          loadSystemStatuses();
        }
      }
    );

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

    const unlistenMedia = listen<MediaPayload>("media-update", (event) => {
      hasLiveMediaUpdateRef.current = true;
      const incoming = event.payload;
      if (incoming && incoming.title) {
        setMediaInfo((prev) => buildQuickSettingsMediaState(prev, incoming));
      } else {
        setMediaInfo(null);
      }
    });

    unlistenMedia
      .then(() => {
        invoke("request_media_resync").catch(() => {});
      })
      .catch(() => {});

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
      window.removeEventListener("focus", handleWindowFocus);
      unlistenFlyout.then((fn) => fn());
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

  // Airplane Mode / Battery Saver / Night Light (direct system toggles without closing flyout)
  const handleToggleAirplane = async () => {
    const next = !isAirplaneMode;
    setIsAirplaneMode(next);
    try {
      const actual = await invoke<boolean>("toggle_airplane_mode", { enable: next });
      setIsAirplaneMode(Boolean(actual));
    } catch {
      // Revert cleanly from backend state below
    } finally {
      refreshQuickToggles();
    }
  };

  const handleToggleBatterySaver = async () => {
    const next = !isBatterySaver;
    setIsBatterySaver(next);
    try {
      const actual = await invoke<boolean>("toggle_battery_saver", { enable: next });
      setIsBatterySaver(Boolean(actual));
    } catch {
      // Revert cleanly from backend state below
    } finally {
      refreshQuickToggles();
    }
  };

  const handleToggleNightLight = async () => {
    const next = !isNightLight;
    setIsNightLight(next);
    try {
      const actual = await invoke<boolean>("toggle_night_light", { enable: next });
      setIsNightLight(Boolean(actual));
    } catch {
      // Revert cleanly from backend state below
    } finally {
      refreshQuickToggles();
    }
  };

  const handleToggleAccessibilityFeature = async (feature: AccessibilityFeatureKey) => {
    const key = ACCESSIBILITY_STATE_KEY[feature];
    const next = !accessibilityState[key];
    setAccessibilityState((prev) => ({ ...prev, [key]: next }));
    try {
      const actual = await invoke<boolean>("toggle_accessibility_feature", {
        feature,
        enable: next,
      });
      setAccessibilityState((prev) => ({ ...prev, [key]: Boolean(actual) }));
    } catch {
      // Revert cleanly from backend state below
    } finally {
      refreshAccessibilityState();
    }
  };

  const handleToggleHotspot = async () => {
    const next = !isHotspot;
    setIsHotspot(next);
    try {
      const actual = await toggleHotspotState(next);
      setIsHotspot(actual);
    } catch {
      invoke("system_power_action", { action: "hotspot" }).catch(() => {});
    }
  };

  const handleToggleDnd = () => {
    const next = !isDnd;
    setIsDnd(next);
    invoke("set_windows_dnd", { enabled: next }).catch(() => {});
  };

  // Media Controls
  const handleMediaPlayPause = () => {
    invoke("smtc_action", { action: "toggle" }).catch(() => {});
    setMediaInfo((prev) =>
      prev
        ? {
            ...prev,
            is_playing: !prev.is_playing,
            payload: { ...prev.payload, is_playing: !prev.is_playing },
          }
        : null
    );
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
      invoke("set_master_mute", { mute: false }).catch(() => {});
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
    invoke("set_master_mute", { mute: nextMuted }).catch(() => {});
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
      if (isMuted && next > 0) {
        setIsMuted(false);
        invoke("set_master_mute", { mute: false }).catch(() => {});
      }
      invoke("set_master_volume", { level: next / 100 }).catch(() => {});
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      handleToggleMute();
    }
  };

  // Open settings
  const handleOpenSettings = () => {
    invoke("system_power_action", { action: "settings" }).catch(() => {});
    onClose?.();
  };

  const handleOpenQuickSettingsEdit = () => {
    invoke("system_power_action", { action: "quicksettings_edit" }).catch(() => {});
    onClose?.();
  };

  // ==========================================
  // SUBVIEWS: Wi-Fi, Bluetooth, Accessibility
  // ==========================================
  if (activeSubmenu === "wifi") {
    return (
      <div
        ref={containerRef}
        className="flex flex-col w-full text-[var(--taskbar-text)]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 h-10 shrink-0">
          <Tooltip
            content={tx(lang, "Back to Quick Settings", "Kembali ke Pengaturan Cepat")}
            allowFlip
          >
            <button
              type="button"
              onClick={() => setActiveSubmenu(null)}
              aria-label={tx(lang, "Back to Quick Settings", "Kembali ke Pengaturan Cepat")}
              className="w-8 h-8 rounded-full gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)]"
            >
              <ChevronLeft size={16} strokeWidth={2.2} />
            </button>
          </Tooltip>
          <span className="flex-1 text-[15px] font-semibold tracking-tight">
            Wi-Fi
          </span>
          <Tooltip
            content={tx(lang, "Rescan networks", "Pindai ulang jaringan")}
            allowFlip
          >
            <button
              type="button"
              onClick={handleScanWifi}
              disabled={isScanningWifi}
              aria-label={tx(lang, "Rescan networks", "Pindai ulang jaringan")}
              className="w-8 h-8 rounded-full gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] disabled:opacity-50"
            >
              <RotateCw
                size={14}
                className={isScanningWifi ? "animate-spin" : ""}
              />
            </button>
          </Tooltip>
        </div>

        {/* Radio toggle */}
        <div className="flex items-center justify-between p-3 rounded-[14px] gili-flyout-card my-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <Wifi size={18} className="text-[var(--taskbar-accent)]" />
            <span className="text-[13px] font-medium">Wi-Fi</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={wifiStatus.enabled}
            aria-label="Wi-Fi"
            onClick={handleToggleWifi}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 cursor-pointer border ${
              wifiStatus.enabled
                ? "bg-[var(--taskbar-accent)] border-transparent"
                : "bg-[var(--taskbar-switch-off)] border-[var(--taskbar-border)]"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-[var(--taskbar-switch-thumb)] shadow-sm transition-transform ${
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
            <span className="text-[12px] font-semibold text-[var(--taskbar-text)]">
              {tx(
                lang,
                `Enter password for ${passwordSsid}`,
                `Masukkan kata sandi untuk ${passwordSsid}`
              )}
            </span>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder={tx(lang, "Network password", "Kata sandi jaringan")}
              autoFocus
              className="h-8 px-2.5 rounded-[8px] bg-[var(--taskbar-control-bg)] border border-[var(--taskbar-border)] text-[var(--taskbar-text)] placeholder:text-[var(--taskbar-text-muted)] text-[12px] outline-none focus:border-[var(--taskbar-accent)]"
            />
            <div className="flex justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={() => setPasswordSsid(null)}
                className="px-2.5 py-1 rounded-[6px] gili-flyout-chip text-[11.5px] cursor-pointer text-[var(--taskbar-text)]"
              >
                {tx(lang, "Cancel", "Batal")}
              </button>
              <button
                type="submit"
                disabled={connectingSsid === passwordSsid}
                className="px-3 py-1 rounded-[6px] bg-[var(--taskbar-accent)] hover:bg-[var(--taskbar-accent-hover)] text-[var(--taskbar-accent-text)] text-[11.5px] font-medium cursor-pointer flex items-center gap-1.5 border-0"
              >
                {connectingSsid === passwordSsid && (
                  <Loader2 size={12} className="animate-spin" />
                )}
                {tx(lang, "Connect", "Sambungkan")}
              </button>
            </div>
          </form>
        )}

        {/* Network list */}
        <div className="max-h-[300px] overflow-y-auto pr-0.5 space-y-1">
          {!wifiStatus.enabled ? (
            <div className="py-8 flex flex-col items-center justify-center text-[12px] text-[var(--taskbar-text-muted)] gap-2">
              <WifiOff size={24} className="opacity-50" />
              <span>{tx(lang, "Wi-Fi is turned off", "Wi-Fi dimatikan")}</span>
            </div>
          ) : wifiStatus.networks.length === 0 ? (
            <div className="py-8 flex items-center justify-center text-[12px] text-[var(--taskbar-text-muted)]">
              {isScanningWifi
                ? tx(lang, "Scanning networks...", "Memindai jaringan...")
                : tx(lang, "No networks found", "Tidak ada jaringan ditemukan")}
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
                      ? "bg-[var(--taskbar-item-selected)] text-[var(--taskbar-text)] font-medium"
                      : "gili-flyout-item text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Wifi
                      size={16}
                      className={
                        isCurrent
                          ? "text-[var(--taskbar-accent)]"
                          : "text-[var(--taskbar-text-muted)]"
                      }
                    />
                    <span className="truncate">{net.ssid}</span>
                    {net.is_secure && (
                      <Lock size={12} className="text-[var(--taskbar-text-muted)] shrink-0" />
                    )}
                  </div>
                  {isCurrent ? (
                    <span className="text-[11px] text-[var(--taskbar-status-green)] font-medium">
                      {tx(lang, "Connected", "Terhubung")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isConnecting}
                      onClick={() => handleConnectWifi(net.ssid, net.is_secure)}
                      className="px-2.5 py-1 rounded-[8px] gili-flyout-chip text-[11px] font-medium cursor-pointer text-[var(--taskbar-text)] flex items-center gap-1"
                    >
                      {isConnecting && <Loader2 size={11} className="animate-spin" />}
                      {tx(lang, "Connect", "Sambung")}
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
            onClick={() => invoke("system_power_action", { action: "wifi" }).catch(() => {})}
            className="text-[12px] text-[var(--taskbar-link)] hover:underline flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0"
          >
            {tx(lang, "More Wi-Fi settings", "Pengaturan Wi-Fi lainnya")}
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
    );
  }

  if (activeSubmenu === "bluetooth") {
    return (
      <div
        ref={containerRef}
        className="flex flex-col w-full text-[var(--taskbar-text)]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 h-10 shrink-0">
          <Tooltip
            content={tx(lang, "Back to Quick Settings", "Kembali ke Pengaturan Cepat")}
            allowFlip
          >
            <button
              type="button"
              onClick={() => setActiveSubmenu(null)}
              aria-label={tx(lang, "Back to Quick Settings", "Kembali ke Pengaturan Cepat")}
              className="w-8 h-8 rounded-full gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)]"
            >
              <ChevronLeft size={16} strokeWidth={2.2} />
            </button>
          </Tooltip>
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
            role="switch"
            aria-checked={btStatus.enabled}
            aria-label="Bluetooth"
            onClick={handleToggleBluetooth}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 cursor-pointer border ${
              btStatus.enabled
                ? "bg-[var(--taskbar-accent)] border-transparent"
                : "bg-[var(--taskbar-switch-off)] border-[var(--taskbar-border)]"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-[var(--taskbar-switch-thumb)] shadow-sm transition-transform ${
                btStatus.enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Devices list */}
        <div className="max-h-[300px] overflow-y-auto pr-0.5 space-y-1">
          {!btStatus.enabled ? (
            <div className="py-8 flex flex-col items-center justify-center text-[12px] text-[var(--taskbar-text-muted)] gap-2">
              <Bluetooth size={24} className="opacity-50" />
              <span>{tx(lang, "Bluetooth is turned off", "Bluetooth dimatikan")}</span>
            </div>
          ) : btStatus.devices.length === 0 ? (
            <div className="py-8 flex items-center justify-center text-[12px] text-[var(--taskbar-text-muted)]">
              {tx(lang, "No Bluetooth devices found", "Tidak ada perangkat Bluetooth ditemukan")}
            </div>
          ) : (
            btStatus.devices.map((device) => (
              <div
                key={device.name}
                className={`h-11 px-3 rounded-[12px] flex items-center justify-between text-[13px] ${
                  device.is_connected
                    ? "bg-[var(--taskbar-item-selected)] text-[var(--taskbar-text)] font-medium"
                    : "gili-flyout-item text-[var(--taskbar-text-2)]"
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Bluetooth
                    size={16}
                    className={
                      device.is_connected
                        ? "text-[var(--taskbar-accent)]"
                        : "text-[var(--taskbar-text-muted)]"
                    }
                  />
                  <span className="truncate">{device.name}</span>
                </div>
                <span
                  className={`text-[11px] font-medium ${
                    device.is_connected
                      ? "text-[var(--taskbar-status-green)]"
                      : "text-[var(--taskbar-text-muted)]"
                  }`}
                >
                  {device.is_connected
                    ? tx(lang, "Connected", "Terhubung")
                    : tx(lang, "Paired", "Berpasangan")}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer Link */}
        <div className="h-10 border-t border-[var(--taskbar-separator)] mt-2 pt-2 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => invoke("system_power_action", { action: "bluetooth" }).catch(() => {})}
            className="text-[12px] text-[var(--taskbar-link)] hover:underline flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0"
          >
            {tx(lang, "More Bluetooth settings", "Pengaturan Bluetooth lainnya")}
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
    );
  }

  if (activeSubmenu === "accessibility") {
    const accessibilityItems: Array<{
      label: string;
      desc: string;
      feature: AccessibilityFeatureKey;
      checked: boolean;
    }> = [
      {
        label: tx(lang, "Magnifier", "Kaca pembesar"),
        desc: tx(lang, "Zoom in on parts of your screen", "Perbesar tampilan layar"),
        feature: "magnifier",
        checked: accessibilityState.magnifier,
      },
      {
        label: tx(lang, "Color filters", "Filter warna"),
        desc: tx(lang, "Make screen colors easier to see", "Membantu penglihatan warna"),
        feature: "colorfilter",
        checked: accessibilityState.colorFilter,
      },
      {
        label: tx(lang, "Narrator", "Narator"),
        desc: tx(lang, "Screen reader that reads text aloud", "Pembaca layar bersuara"),
        feature: "narrator",
        checked: accessibilityState.narrator,
      },
      {
        label: tx(lang, "Mono audio", "Audio mono"),
        desc: tx(lang, "Combine left and right audio channels", "Gabungkan saluran suara kiri dan kanan"),
        feature: "monoaudio",
        checked: accessibilityState.monoAudio,
      },
      {
        label: tx(lang, "Live captions", "Teks langsung"),
        desc: tx(lang, "Show automatic captions for spoken audio", "Tampilkan teks otomatis saat audio diputar"),
        feature: "livecaptions",
        checked: accessibilityState.liveCaptions,
      },
    ];

    return (
      <div
        ref={containerRef}
        className="flex flex-col w-full text-[var(--taskbar-text)]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 h-10 shrink-0">
          <Tooltip
            content={tx(lang, "Back to Quick Settings", "Kembali ke Pengaturan Cepat")}
            allowFlip
          >
            <button
              type="button"
              onClick={() => setActiveSubmenu(null)}
              aria-label={tx(lang, "Back to Quick Settings", "Kembali ke Pengaturan Cepat")}
              className="w-8 h-8 rounded-full gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)]"
            >
              <ChevronLeft size={16} strokeWidth={2.2} />
            </button>
          </Tooltip>
          <span className="flex-1 text-[15px] font-semibold tracking-tight">
            {tx(lang, "Accessibility", "Aksesibilitas")}
          </span>
        </div>

        <div className="max-h-[340px] overflow-y-auto pr-0.5 space-y-1.5 mt-2">
          {accessibilityItems.map((item) => (
            <button
              key={item.feature}
              type="button"
              role="switch"
              aria-checked={item.checked}
              onClick={() => handleToggleAccessibilityFeature(item.feature)}
              className="w-full min-h-[50px] px-3 py-2 rounded-[12px] gili-flyout-item flex items-center justify-between gap-3 text-left cursor-pointer border-0 bg-transparent"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-medium text-[var(--taskbar-text)] truncate">
                  {item.label}
                </span>
                <span className="text-[11px] text-[var(--taskbar-text-muted)] truncate">
                  {item.desc}
                </span>
              </div>
              <span
                aria-hidden="true"
                className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 shrink-0 border ${
                  item.checked
                    ? "bg-[var(--taskbar-accent)] border-transparent"
                    : "bg-[var(--taskbar-switch-off)] border-[var(--taskbar-border)]"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full bg-[var(--taskbar-switch-thumb)] shadow-sm transition-transform ${
                    item.checked ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </span>
            </button>
          ))}
        </div>

        <div className="h-10 border-t border-[var(--taskbar-separator)] mt-2 pt-2 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => invoke("system_power_action", { action: "accessibility" }).catch(() => {})}
            className="text-[12px] text-[var(--taskbar-link)] hover:underline flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0"
          >
            {tx(lang, "More accessibility settings", "Pengaturan aksesibilitas lainnya")}
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
    );
  }

  const activeAccessibilityCount = Object.values(accessibilityState).filter(Boolean).length;

  // ==========================================
  // MAIN VIEW (Board 90 & 94)
  // ==========================================
  return (
    <div ref={containerRef} className="flex flex-col w-full text-[var(--taskbar-text)]">
      {/* 1. Top Card: Media Player (Spotify / Windows Media) */}
      {mediaInfo ? (
        <div className="rounded-[16px] gili-flyout-card p-2.5 flex flex-col shrink-0 mb-2.5 border border-[var(--taskbar-card-border)]">
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
                {mediaInfo.artist || tx(lang, "Unknown artist", "Artis tidak diketahui")}
              </div>
            </div>
            <div className="w-[50px] h-[50px] rounded-[12px] overflow-hidden shrink-0 border border-[var(--taskbar-card-border)]">
              <MediaThumbnail media={mediaInfo.payload} size="normal" />
            </div>
          </div>

          {/* Progress bar */}
          <div
            role="img"
            aria-label={tx(lang, "Media progress", "Progres media")}
            className="h-1 rounded-[2px] bg-[var(--taskbar-separator)] mt-2 overflow-hidden"
          >
            <div
              style={{
                width: `${
                  mediaInfo.duration > 0
                    ? Math.min(100, (mediaInfo.position / mediaInfo.duration) * 100)
                    : 35
                }%`,
              }}
              className="h-full rounded-[2px] bg-[var(--taskbar-accent)]"
            />
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-2.5 mt-2">
            <Tooltip content={tx(lang, "Previous", "Sebelumnya")} allowFlip>
              <button
                type="button"
                onClick={handleMediaPrev}
                aria-label={tx(lang, "Previous", "Sebelumnya")}
                className="w-10 h-10 rounded-[12px] bg-transparent text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] hover:bg-[var(--taskbar-item-hover)] flex items-center justify-center p-0 border-0 cursor-pointer active:scale-95 transition-colors"
              >
                <SkipBack size={17} fill="currentColor" />
              </button>
            </Tooltip>
            <Tooltip
              content={
                mediaInfo.is_playing
                  ? tx(lang, "Pause", "Jeda")
                  : tx(lang, "Play", "Putar")
              }
              allowFlip
            >
              <button
                type="button"
                onClick={handleMediaPlayPause}
                aria-label={
                  mediaInfo.is_playing
                    ? tx(lang, "Pause", "Jeda")
                    : tx(lang, "Play", "Putar")
                }
                className="w-11 h-11 rounded-[15px] bg-[var(--taskbar-accent)] hover:bg-[var(--taskbar-accent-hover)] text-[var(--taskbar-accent-text)] flex items-center justify-center p-0 border-0 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
              >
                {mediaInfo.is_playing ? (
                  <Pause size={17} fill="currentColor" />
                ) : (
                  <Play size={17} fill="currentColor" className="translate-x-0.5" />
                )}
              </button>
            </Tooltip>
            <Tooltip content={tx(lang, "Next", "Berikutnya")} allowFlip>
              <button
                type="button"
                onClick={handleMediaNext}
                aria-label={tx(lang, "Next", "Berikutnya")}
                className="w-10 h-10 rounded-[12px] bg-transparent text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)] hover:bg-[var(--taskbar-item-hover)] flex items-center justify-center p-0 border-0 cursor-pointer active:scale-95 transition-colors"
              >
                <SkipForward size={17} fill="currentColor" />
              </button>
            </Tooltip>
          </div>
        </div>
      ) : null}

      {/* 2. Quick Action Toggles (Grid 2 cols x 3 rows, Page 1 & Page 2) */}
      {tilePage === 0 ? (
      <div className="grid grid-cols-2 gap-2 shrink-0">
        {/* Tile 1: Wi-Fi */}
        <div
          className={`h-[60px] rounded-[16px] border flex items-center px-3 text-left transition-colors ${
            wifiStatus.enabled
              ? "border-[var(--taskbar-tile-active-border)] bg-[var(--taskbar-tile-active-bg)] hover:bg-[var(--taskbar-tile-active-hover)] text-[var(--taskbar-tile-active-text)]"
              : "border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] hover:bg-[var(--taskbar-item-hover)] text-[var(--taskbar-text)]"
          }`}
        >
          <button
            type="button"
            aria-pressed={wifiStatus.enabled}
            onClick={handleToggleWifi}
            aria-label={tx(
              lang,
              `Toggle Wi-Fi (${wifiStatus.enabled ? "On" : "Off"})`,
              `Toggle Wi-Fi (${wifiStatus.enabled ? "Aktif" : "Mati"})`
            )}
            className="flex-1 min-w-0 flex items-center gap-2.5 bg-transparent border-0 p-0 text-left cursor-pointer"
          >
            <Wifi
              size={19}
              className={
                wifiStatus.enabled
                  ? "text-[var(--taskbar-tile-active-subtext)]"
                  : "text-[var(--taskbar-text-2)]"
              }
            />
            <div className="flex flex-col truncate">
              <span
                className={`text-[12.5px] font-semibold truncate ${
                  wifiStatus.enabled
                    ? "text-[var(--taskbar-tile-active-text)]"
                    : "text-[var(--taskbar-text)]"
                }`}
              >
                Wi-Fi
              </span>
              <span
                className={`text-[11px] truncate ${
                  wifiStatus.enabled
                    ? "text-[var(--taskbar-tile-active-subtext)]"
                    : "text-[var(--taskbar-text-muted)]"
                }`}
              >
                {wifiStatus.enabled
                  ? wifiStatus.connected_ssid || tx(lang, "On", "Aktif")
                  : tx(lang, "Off", "Mati")}
              </span>
            </div>
          </button>
          <div className="w-[1px] h-[22px] bg-[var(--taskbar-separator)] mx-1.5 shrink-0" />
          <Tooltip
            content={tx(lang, "Manage Wi-Fi connections", "Buka daftar jaringan Wi-Fi")}
            allowFlip
            wrapperClassName="shrink-0"
          >
            <button
              type="button"
              onClick={() => setActiveSubmenu("wifi")}
              aria-label={tx(lang, "Open Wi-Fi network list", "Buka daftar jaringan Wi-Fi")}
              className={`w-6 h-8 flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer ${
                wifiStatus.enabled
                  ? "text-[var(--taskbar-tile-active-subtext)] hover:text-[var(--taskbar-tile-active-text)]"
                  : "text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)]"
              }`}
            >
              <ChevronRight size={16} strokeWidth={2.2} />
            </button>
          </Tooltip>
        </div>

        {/* Tile 2: Bluetooth */}
        <div
          className={`h-[60px] rounded-[16px] border flex items-center px-3 text-left transition-colors ${
            btStatus.enabled
              ? "border-[var(--taskbar-tile-active-border)] bg-[var(--taskbar-tile-active-bg)] hover:bg-[var(--taskbar-tile-active-hover)] text-[var(--taskbar-tile-active-text)]"
              : "border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] hover:bg-[var(--taskbar-item-hover)] text-[var(--taskbar-text)]"
          }`}
        >
          <button
            type="button"
            aria-pressed={btStatus.enabled}
            onClick={handleToggleBluetooth}
            aria-label={tx(
              lang,
              `Toggle Bluetooth (${btStatus.enabled ? "On" : "Off"})`,
              `Toggle Bluetooth (${btStatus.enabled ? "Aktif" : "Mati"})`
            )}
            className="flex-1 min-w-0 flex items-center gap-2.5 bg-transparent border-0 p-0 text-left cursor-pointer"
          >
            <Bluetooth
              size={19}
              className={
                btStatus.enabled
                  ? "text-[var(--taskbar-tile-active-subtext)]"
                  : "text-[var(--taskbar-text-2)]"
              }
            />
            <div className="flex flex-col truncate">
              <span
                className={`text-[12.5px] font-semibold truncate ${
                  btStatus.enabled
                    ? "text-[var(--taskbar-tile-active-text)]"
                    : "text-[var(--taskbar-text)]"
                }`}
              >
                Bluetooth
              </span>
              <span
                className={`text-[11px] truncate ${
                  btStatus.enabled
                    ? "text-[var(--taskbar-tile-active-subtext)]"
                    : "text-[var(--taskbar-text-muted)]"
                }`}
              >
                {btStatus.enabled
                  ? btStatus.connected_name || tx(lang, "On", "Aktif")
                  : tx(lang, "Off", "Mati")}
              </span>
            </div>
          </button>
          <div className="w-[1px] h-[22px] bg-[var(--taskbar-separator)] mx-1.5 shrink-0" />
          <Tooltip
            content={tx(lang, "Manage Bluetooth devices", "Buka daftar perangkat Bluetooth")}
            allowFlip
            wrapperClassName="shrink-0"
          >
            <button
              type="button"
              onClick={() => setActiveSubmenu("bluetooth")}
              aria-label={tx(lang, "Open Bluetooth device list", "Buka daftar perangkat Bluetooth")}
              className={`w-6 h-8 flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer ${
                btStatus.enabled
                  ? "text-[var(--taskbar-tile-active-subtext)] hover:text-[var(--taskbar-tile-active-text)]"
                  : "text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)]"
              }`}
            >
              <ChevronRight size={16} strokeWidth={2.2} />
            </button>
          </Tooltip>
        </div>

        {/* Tile 3: Airplane mode */}
        <button
          type="button"
          aria-pressed={isAirplaneMode}
          onClick={handleToggleAirplane}
          className={`h-[60px] rounded-[16px] border flex items-center gap-2.5 px-3 text-left cursor-pointer transition-colors ${
            isAirplaneMode
              ? "border-[var(--taskbar-tile-active-border)] bg-[var(--taskbar-tile-active-bg)] hover:bg-[var(--taskbar-tile-active-hover)] text-[var(--taskbar-tile-active-text)]"
              : "border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] hover:bg-[var(--taskbar-item-hover)] text-[var(--taskbar-text)]"
          }`}
        >
          <Plane
            size={19}
            className={
              isAirplaneMode
                ? "text-[var(--taskbar-tile-active-subtext)]"
                : "text-[var(--taskbar-text-2)]"
            }
          />
          <div className="flex flex-col truncate">
            <span
              className={`text-[12.5px] font-semibold truncate ${
                isAirplaneMode
                  ? "text-[var(--taskbar-tile-active-text)]"
                  : "text-[var(--taskbar-text)]"
              }`}
            >
              {tx(lang, "Airplane mode", "Mode pesawat")}
            </span>
            <span
              className={`text-[11px] truncate ${
                isAirplaneMode
                  ? "text-[var(--taskbar-tile-active-subtext)]"
                  : "text-[var(--taskbar-text-muted)]"
              }`}
            >
              {isAirplaneMode ? tx(lang, "On", "Aktif") : tx(lang, "Off", "Mati")}
            </span>
          </div>
        </button>

        {/* Tile 4: Accessibility */}
        <div
          className={`h-[60px] rounded-[16px] border flex items-center px-3 text-left transition-colors ${
            activeAccessibilityCount > 0
              ? "border-[var(--taskbar-tile-active-border)] bg-[var(--taskbar-tile-active-bg)] hover:bg-[var(--taskbar-tile-active-hover)] text-[var(--taskbar-tile-active-text)]"
              : "border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] hover:bg-[var(--taskbar-item-hover)] text-[var(--taskbar-text)]"
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveSubmenu("accessibility")}
            className="flex-1 min-w-0 flex items-center gap-2.5 bg-transparent border-0 p-0 text-left cursor-pointer"
          >
            <Accessibility
              size={19}
              className={
                activeAccessibilityCount > 0
                  ? "text-[var(--taskbar-tile-active-subtext)]"
                  : "text-[var(--taskbar-text-2)]"
              }
            />
            <div className="flex flex-col truncate">
              <span
                className={`text-[12.5px] font-semibold truncate ${
                  activeAccessibilityCount > 0
                    ? "text-[var(--taskbar-tile-active-text)]"
                    : "text-[var(--taskbar-text)]"
                }`}
              >
                {tx(lang, "Accessibility", "Aksesibilitas")}
              </span>
              <span
                className={`text-[11px] truncate ${
                  activeAccessibilityCount > 0
                    ? "text-[var(--taskbar-tile-active-subtext)]"
                    : "text-[var(--taskbar-text-muted)]"
                }`}
              >
                {activeAccessibilityCount > 0
                  ? tx(
                      lang,
                      `${activeAccessibilityCount} active`,
                      `${activeAccessibilityCount} aktif`
                    )
                  : tx(lang, "Configure", "Atur")}
              </span>
            </div>
          </button>
          <div className="w-[1px] h-[22px] bg-[var(--taskbar-separator)] mx-1.5 shrink-0" />
          <Tooltip
            content={tx(lang, "Open Accessibility menu", "Buka sub-menu Aksesibilitas")}
            allowFlip
            wrapperClassName="shrink-0"
          >
            <button
              type="button"
              onClick={() => setActiveSubmenu("accessibility")}
              aria-label={tx(lang, "Open Accessibility menu", "Buka sub-menu Aksesibilitas")}
              className={`w-6 h-8 flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer ${
                activeAccessibilityCount > 0
                  ? "text-[var(--taskbar-tile-active-subtext)] hover:text-[var(--taskbar-tile-active-text)]"
                  : "text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)]"
              }`}
            >
              <ChevronRight size={16} strokeWidth={2.2} />
            </button>
          </Tooltip>
        </div>

        {/* Tile 5: Energy saver */}
        <button
          type="button"
          aria-pressed={isBatterySaver}
          onClick={handleToggleBatterySaver}
          className={`h-[60px] rounded-[16px] border flex items-center gap-2.5 px-3 text-left cursor-pointer transition-colors ${
            isBatterySaver
              ? "border-[var(--taskbar-tile-active-border)] bg-[var(--taskbar-tile-active-bg)] hover:bg-[var(--taskbar-tile-active-hover)] text-[var(--taskbar-tile-active-text)]"
              : "border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] hover:bg-[var(--taskbar-item-hover)] text-[var(--taskbar-text)]"
          }`}
        >
          <Leaf
            size={19}
            className={
              isBatterySaver
                ? "text-[var(--taskbar-tile-active-subtext)]"
                : "text-[var(--taskbar-text-2)]"
            }
          />
          <div className="flex flex-col truncate">
            <span
              className={`text-[12.5px] font-semibold truncate ${
                isBatterySaver
                  ? "text-[var(--taskbar-tile-active-text)]"
                  : "text-[var(--taskbar-text)]"
              }`}
            >
              {tx(lang, "Energy saver", "Penghemat daya")}
            </span>
            <span
              className={`text-[11px] truncate ${
                isBatterySaver
                  ? "text-[var(--taskbar-tile-active-subtext)]"
                  : "text-[var(--taskbar-text-muted)]"
              }`}
            >
              {isBatterySaver ? tx(lang, "On", "Aktif") : tx(lang, "Off", "Mati")}
            </span>
          </div>
        </button>

        {/* Tile 6: Night light */}
        <button
          type="button"
          aria-pressed={isNightLight}
          onClick={handleToggleNightLight}
          className={`h-[60px] rounded-[16px] border flex items-center gap-2.5 px-3 text-left cursor-pointer transition-colors ${
            isNightLight
              ? "border-[var(--taskbar-tile-active-border)] bg-[var(--taskbar-tile-active-bg)] hover:bg-[var(--taskbar-tile-active-hover)] text-[var(--taskbar-tile-active-text)]"
              : "border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] hover:bg-[var(--taskbar-item-hover)] text-[var(--taskbar-text)]"
          }`}
        >
          <Moon
            size={19}
            className={
              isNightLight
                ? "text-[var(--taskbar-tile-active-subtext)]"
                : "text-[var(--taskbar-text-2)]"
            }
          />
          <div className="flex flex-col truncate">
            <span
              className={`text-[12.5px] font-semibold truncate ${
                isNightLight
                  ? "text-[var(--taskbar-tile-active-text)]"
                  : "text-[var(--taskbar-text)]"
              }`}
            >
              {tx(lang, "Night light", "Lampu malam")}
            </span>
            <span
              className={`text-[11px] truncate ${
                isNightLight
                  ? "text-[var(--taskbar-tile-active-subtext)]"
                  : "text-[var(--taskbar-text-muted)]"
              }`}
            >
              {isNightLight ? tx(lang, "On", "Aktif") : tx(lang, "Off", "Mati")}
            </span>
          </div>
        </button>
      </div>
      ) : (
      <div className="grid grid-cols-2 gap-2 shrink-0">
        {/* Mobile Hotspot */}
        <button
          type="button"
          aria-pressed={isHotspot}
          onClick={handleToggleHotspot}
          className={`h-[60px] rounded-[16px] border flex items-center gap-2.5 px-3 text-left cursor-pointer transition-colors ${
            isHotspot
              ? "border-[var(--taskbar-tile-active-border)] bg-[var(--taskbar-tile-active-bg)] hover:bg-[var(--taskbar-tile-active-hover)] text-[var(--taskbar-tile-active-text)]"
              : "border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] hover:bg-[var(--taskbar-item-hover)] text-[var(--taskbar-text)]"
          }`}
        >
          <Radio
            size={19}
            className={
              isHotspot
                ? "text-[var(--taskbar-tile-active-subtext)]"
                : "text-[var(--taskbar-text-2)]"
            }
          />
          <div className="flex flex-col truncate">
            <span
              className={`text-[12.5px] font-semibold truncate ${
                isHotspot
                  ? "text-[var(--taskbar-tile-active-text)]"
                  : "text-[var(--taskbar-text)]"
              }`}
            >
              Hotspot
            </span>
            <span
              className={`text-[11px] truncate ${
                isHotspot
                  ? "text-[var(--taskbar-tile-active-subtext)]"
                  : "text-[var(--taskbar-text-muted)]"
              }`}
            >
              {isHotspot ? tx(lang, "On", "Aktif") : tx(lang, "Off", "Mati")}
            </span>
          </div>
        </button>

        {/* Do Not Disturb */}
        <button
          type="button"
          aria-pressed={isDnd}
          onClick={handleToggleDnd}
          className={`h-[60px] rounded-[16px] border flex items-center gap-2.5 px-3 text-left cursor-pointer transition-colors ${
            isDnd
              ? "border-[var(--taskbar-tile-active-border)] bg-[var(--taskbar-tile-active-bg)] hover:bg-[var(--taskbar-tile-active-hover)] text-[var(--taskbar-tile-active-text)]"
              : "border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] hover:bg-[var(--taskbar-item-hover)] text-[var(--taskbar-text)]"
          }`}
        >
          <BellOff
            size={19}
            className={
              isDnd
                ? "text-[var(--taskbar-tile-active-subtext)]"
                : "text-[var(--taskbar-text-2)]"
            }
          />
          <div className="flex flex-col truncate">
            <span
              className={`text-[12.5px] font-semibold truncate ${
                isDnd
                  ? "text-[var(--taskbar-tile-active-text)]"
                  : "text-[var(--taskbar-text)]"
              }`}
            >
              {tx(lang, "Do not disturb", "Jangan Ganggu")}
            </span>
            <span
              className={`text-[11px] truncate ${
                isDnd
                  ? "text-[var(--taskbar-tile-active-subtext)]"
                  : "text-[var(--taskbar-text-muted)]"
              }`}
            >
              {isDnd ? tx(lang, "On", "Aktif") : tx(lang, "Off", "Mati")}
            </span>
          </div>
        </button>

        {/* Project Screen */}
        <button
          type="button"
          onClick={() => {
            invoke("system_power_action", { action: "project" }).catch(() => {});
            onClose?.();
          }}
          className="h-[60px] rounded-[16px] border border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] text-[var(--taskbar-text)] flex items-center gap-2.5 px-3 text-left cursor-pointer hover:bg-[var(--taskbar-item-hover)] transition-colors"
        >
          <Cast size={19} className="text-[var(--taskbar-text-2)]" />
          <div className="flex flex-col truncate">
            <span className="text-[12.5px] font-semibold truncate">
              {tx(lang, "Project", "Proyeksi")}
            </span>
            <span className="text-[11px] truncate text-[var(--taskbar-text-muted)]">
              {tx(lang, "External display", "Layar eksternal")}
            </span>
          </div>
        </button>

        {/* Screenshot */}
        <button
          type="button"
          onClick={() => {
            invoke("system_power_action", { action: "screenshot" }).catch(() => {});
            onClose?.();
          }}
          className="h-[60px] rounded-[16px] border border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] text-[var(--taskbar-text)] flex items-center gap-2.5 px-3 text-left cursor-pointer hover:bg-[var(--taskbar-item-hover)] transition-colors"
        >
          <Camera size={19} className="text-[var(--taskbar-text-2)]" />
          <div className="flex flex-col truncate">
            <span className="text-[12.5px] font-semibold truncate">
              {tx(lang, "Screenshot", "Cuplikan Layar")}
            </span>
            <span className="text-[11px] truncate text-[var(--taskbar-text-muted)]">
              Snipping Tool
            </span>
          </div>
        </button>

        {/* Display */}
        <button
          type="button"
          onClick={() => {
            invoke("launch_target", { target: "ms-settings:display" }).catch(() => {});
            onClose?.();
          }}
          className="h-[60px] rounded-[16px] border border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] text-[var(--taskbar-text)] flex items-center gap-2.5 px-3 text-left cursor-pointer hover:bg-[var(--taskbar-item-hover)] transition-colors"
        >
          <Monitor size={19} className="text-[var(--taskbar-text-2)]" />
          <div className="flex flex-col truncate">
            <span className="text-[12.5px] font-semibold truncate">
              {tx(lang, "Display", "Layar")}
            </span>
            <span className="text-[11px] truncate text-[var(--taskbar-text-muted)]">
              {tx(lang, "Resolution & scale", "Resolusi & skala")}
            </span>
          </div>
        </button>

        {/* Task Manager */}
        <button
          type="button"
          onClick={() => {
            invoke("trigger_task_manager").catch(() => {});
            onClose?.();
          }}
          className="h-[60px] rounded-[16px] border border-[var(--taskbar-card-border)] bg-[var(--taskbar-control-bg)] text-[var(--taskbar-text)] flex items-center gap-2.5 px-3 text-left cursor-pointer hover:bg-[var(--taskbar-item-hover)] transition-colors"
        >
          <Activity size={19} className="text-[var(--taskbar-text-2)]" />
          <div className="flex flex-col truncate">
            <span className="text-[12.5px] font-semibold truncate">Task Manager</span>
            <span className="text-[11px] truncate text-[var(--taskbar-text-muted)]">
              {tx(lang, "Process monitor", "Monitor proses")}
            </span>
          </div>
        </button>
      </div>
      )}

      {/* 3. Sliders Section */}
      <div className="flex flex-col gap-2 mt-2.5 shrink-0">
        {/* Brightness Slider */}
        <div className="flex items-center gap-2.5">
          <div
            ref={brightnessSliderRef}
            role="slider"
            aria-label={tx(lang, "Screen brightness", "Kecerahan layar")}
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
              className="h-full bg-[var(--taskbar-slider-fill)] transition-[width] duration-75"
            />
            <span
              className={`pointer-events-none absolute inset-y-0 left-3 flex items-center ${
                brightness < 14
                  ? "text-[var(--taskbar-text)]"
                  : "text-[var(--taskbar-accent-text)]"
              }`}
            >
              <Sun size={16} strokeWidth={2} />
            </span>
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
            aria-label={tx(lang, "Master volume", "Volume utama")}
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
              className="h-full bg-[var(--taskbar-slider-fill)] transition-[width] duration-75"
            />
            <span
              className={`pointer-events-none absolute inset-y-0 left-3 flex items-center ${
                isMuted || volume < 14
                  ? "text-[var(--taskbar-text)]"
                  : "text-[var(--taskbar-accent-text)]"
              }`}
            >
              {isMuted || volume === 0 ? (
                <VolumeX size={16} strokeWidth={2} />
              ) : volume < 50 ? (
                <Volume1 size={16} strokeWidth={2} />
              ) : (
                <Volume2 size={16} strokeWidth={2} />
              )}
            </span>
          </div>
          <span className="w-[34px] text-[12px] text-[var(--taskbar-text-2)] font-mono tabular-nums text-right shrink-0">
            {isMuted ? "0%" : `${volume}%`}
          </span>
          {/* Switch to Sound Output Mixer (Window 1) */}
          <Tooltip
            content={tx(lang, "Open sound output mixer", "Buka mixer output suara")}
            allowFlip
            wrapperClassName="shrink-0"
          >
            <button
              type="button"
              onClick={onSwitchToVolumeMixer}
              aria-label={tx(lang, "Open sound output mixer", "Buka mixer output suara")}
              className="w-10 h-10 rounded-[12px] gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)]"
            >
              <SlidersHorizontal size={16} strokeWidth={1.8} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 4. Bottom Footer */}
      <div className="h-11 border-t border-[var(--taskbar-separator)] mt-3 pt-1.5 -mx-3.5 -mb-1 px-3.5 flex items-center justify-between shrink-0">
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

        {/* Interactive Page Switcher */}
        <div
          className="flex items-center gap-1.5"
          role="tablist"
          aria-label={tx(lang, "Quick settings pages", "Halaman Kontrol Cepat")}
        >
          <Tooltip
            content={tx(lang, "Page 1: Connectivity & Display", "Halaman 1: Koneksi & Layar")}
            allowFlip
          >
            <button
              type="button"
              role="tab"
              aria-selected={tilePage === 0}
              aria-label={tx(lang, "Page 1: Connectivity & Display", "Halaman 1: Koneksi & Layar")}
              onClick={() => setTilePage(0)}
              className={`h-2 rounded-full transition-all cursor-pointer border-0 p-0 ${
                tilePage === 0
                  ? "w-4 bg-[var(--taskbar-accent)]"
                  : "w-2 bg-[var(--taskbar-switch-off)] hover:bg-[var(--taskbar-text-muted)]"
              }`}
            />
          </Tooltip>
          <Tooltip
            content={tx(lang, "Page 2: System Tools", "Halaman 2: Alat Sistem")}
            allowFlip
          >
            <button
              type="button"
              role="tab"
              aria-selected={tilePage === 1}
              aria-label={tx(lang, "Page 2: System Tools", "Halaman 2: Alat Sistem")}
              onClick={() => setTilePage(1)}
              className={`h-2 rounded-full transition-all cursor-pointer border-0 p-0 ${
                tilePage === 1
                  ? "w-4 bg-[var(--taskbar-accent)]"
                  : "w-2 bg-[var(--taskbar-switch-off)] hover:bg-[var(--taskbar-text-muted)]"
              }`}
            />
          </Tooltip>
        </div>

        {/* Actions: Settings Gear & Edit */}
        <div className="flex items-center gap-1.5">
          <Tooltip
            content={tx(lang, "Edit quick settings", "Edit pengaturan cepat")}
            allowFlip
          >
            <button
              type="button"
              onClick={handleOpenQuickSettingsEdit}
              aria-label={tx(lang, "Edit quick settings", "Edit pengaturan cepat")}
              className="w-[34px] h-[34px] rounded-[11px] gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)]"
            >
              <Pencil size={15} strokeWidth={1.8} />
            </button>
          </Tooltip>
          <Tooltip
            content={tx(lang, "Open Windows Settings", "Buka Pengaturan Windows")}
            allowFlip
          >
            <button
              type="button"
              onClick={handleOpenSettings}
              aria-label={tx(lang, "Open Windows Settings", "Buka Pengaturan Windows")}
              className="w-[34px] h-[34px] rounded-[11px] gili-flyout-chip flex items-center justify-center p-0 cursor-pointer text-[var(--taskbar-text-2)] hover:text-[var(--taskbar-text)]"
            >
              <Settings size={16} strokeWidth={1.8} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
