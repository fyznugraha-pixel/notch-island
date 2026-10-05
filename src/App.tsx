import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { load } from "@tauri-apps/plugin-store";
import { motion, AnimatePresence } from "framer-motion";
import { Music, Play, Pause, SkipBack, SkipForward, Image as ImageIcon, Zap, Volume2, Sun, Wifi, WifiOff, Lock, Power, RotateCcw, Moon, Settings as SettingsIcon, Film, Scissors, Bluetooth } from "lucide-react";
import "./App.css";

import { MediaPayload, NotifPayload } from "./types";
import { NotifIcon, getWeatherIcon } from "./components/ui/NotifIcon";
import { AudioVisualizer } from "./components/ui/AudioVisualizer";
import { ScrollingText } from "./components/ui/ScrollingText";
import { getTextWidth } from "./utils/text";

export default function App() {
  const [media, setMedia] = useState<MediaPayload | null>(null);
  const [notif, setNotif] = useState<NotifPayload | null>(null);
  const currentNotifRef = useRef<NotifPayload | null>(null);
  
  useEffect(() => {
    currentNotifRef.current = notif;
  }, [notif]);

  const showNotif = (newNotif: NotifPayload) => {
    if (newNotif.icon === "volume" && !optVolumeRef.current) return;
    if (newNotif.icon === "clipboard" && !optClipboardRef.current) return;

    const active = currentNotifRef.current;
    if (active?.icon === "sun" || active?.icon === "moon") {
      setNotifQueue(q => {
        const filtered = q.filter(n => n.icon !== newNotif.icon);
        return [...filtered, newNotif];
      });
    } else {
      setNotifQueue([]);
      setNotif(newNotif);
    }
  };

  const [isExpanded, setIsExpanded] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [mediaProgress, setMediaProgress] = useState({ position: 0, duration: 0 });
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const isAdjustingVolumeRef = useRef(false);
  
  const collapseTimerRef = useRef<number | null>(null);



  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (media && !isPlaying) {
      timeout = setTimeout(() => {
        setMedia(null);
        setIsExpanded(false);
      }, 5000);
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [media, isPlaying]);

  const [notifQueue, setNotifQueue] = useState<NotifPayload[]>([]);
  const [battery, setBattery] = useState<{ is_charging: boolean, percent: number } | null>(null);
  const [time, setTime] = useState<Date>(new Date());
  const [weather, setWeather] = useState<{ temp: string, code: number } | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isQuickControl, setIsQuickControl] = useState(false);
  const isQuickControlRef = useRef(isQuickControl);
  useEffect(() => { isQuickControlRef.current = isQuickControl; }, [isQuickControl]);
  const [isSettings, setIsSettings] = useState(false);
  const [wifiName, setWifiName] = useState("Loading...");
  const [btName, setBtName] = useState("Loading...");
  const [displayLevel, setDisplayLevel] = useState(85);
  const [soundLevel, setSoundLevel] = useState(60);
  const [store, setStore] = useState<any>(null);
  const [isAutostart, setIsAutostart] = useState(false);
  const [showGreeting, setShowGreeting] = useState(true);
  const [isBooting, setIsBooting] = useState(true);

  const resetCollapseTimer = () => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    if (isExpanded || isQuickControl || isSettings) {
      collapseTimerRef.current = window.setTimeout(() => {
        setIsExpanded(false);
        setIsQuickControl(false);
        setIsSettings(false);
      }, 3000);
    }
  };

  useEffect(() => {
    resetCollapseTimer();
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, [isExpanded, isQuickControl, isSettings]);
  
  const [optVolume, setOptVolume] = useState(true);
  const [optClipboard, setOptClipboard] = useState(true);
  const [optMedia, setOptMedia] = useState(true);
  const [optPosition, setOptPosition] = useState<"top"|"bottom">("top");
  const [optOpacity, setOptOpacity] = useState<number>(1.0);
  const [optAnimSpeed, setOptAnimSpeed] = useState<"snappy"|"smooth"|"bouncy">("smooth");
  const [optAccent, setOptAccent] = useState<"default"|"pink"|"blue"|"green">("default");
  const [optNotifTime, setOptNotifTime] = useState<number>(5);
  
  const optVolumeRef = useRef(optVolume);
  useEffect(() => { optVolumeRef.current = optVolume; }, [optVolume]);
  const optClipboardRef = useRef(optClipboard);
  useEffect(() => { optClipboardRef.current = optClipboard; }, [optClipboard]);
  const optNotifTimeRef = useRef(optNotifTime);
  useEffect(() => { optNotifTimeRef.current = optNotifTime; }, [optNotifTime]);
  const lastMediaPayloadRef = useRef<MediaPayload | null>(null);
  const optMediaRef = useRef(optMedia);
  useEffect(() => {
    optMediaRef.current = optMedia;
    if (!optMedia) {
      setMedia(null);
      setIsExpanded(false);
    } else {
      if (lastMediaPayloadRef.current && (lastMediaPayloadRef.current.title || lastMediaPayloadRef.current.artist)) {
        setMedia(lastMediaPayloadRef.current);
        setIsPlaying(lastMediaPayloadRef.current.is_playing);
      }
    }
  }, [optMedia]);

  
  const quickControlTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const setupAutostart = async () => {
      try {
        if (!(await isEnabled())) await enable();
      } catch (e) {
        console.error("Failed to enable autostart", e);
      }
    };
    setupAutostart();

    const setupShortcut = async () => {
      try {
        await unregisterAll();
      } catch (e) {}

      const shortcuts = ["CommandOrControl+Shift+D", "Alt+Shift+H", "CommandOrControl+Alt+H", "CommandOrControl+Shift+X", "F9"];
      for (const sc of shortcuts) {
        try {
          await register(sc, (event) => {
            if (event.state === "Pressed") {
              setIsHidden(prev => !prev);
            }
          });
        } catch (err) {
          console.error("Failed to register shortcut:", sc, err);
        }
      }
    };
    setupShortcut();

    const initSettings = async () => {
      invoke<[string, string]>("get_system_info").then(res => {
        setWifiName(res[0]);
        setBtName(res[1]);
      }).catch(console.error);
      invoke<number>("get_master_volume").then(v => setSoundLevel(Math.round(v * 100))).catch(console.error);
      invoke<number>("get_brightness").then(b => setDisplayLevel(b)).catch(console.error);

      try {
        const s = await load('settings.json', { autoSave: true });
        setStore(s);
        
        const greet = await s.get('show_greeting');
        if (greet !== null) setShowGreeting(greet as boolean);
        const v = await s.get('opt_volume'); if (v !== null) setOptVolume(v as boolean);
        const c = await s.get('opt_clipboard'); if (c !== null) setOptClipboard(c as boolean);
        const m = await s.get('opt_media'); if (m !== null) setOptMedia(m as boolean);
        const p = await s.get('opt_position'); if (p !== null) setOptPosition(p as string as any);
        const o = await s.get('opt_opacity'); if (o !== null) setOptOpacity(o as number);
        const a = await s.get('opt_anim_speed'); if (a !== null) setOptAnimSpeed(a as string as any);
        const acc = await s.get('opt_accent'); if (acc !== null) setOptAccent(acc as string as any);
        const nt = await s.get('opt_notif_time'); if (nt !== null) setOptNotifTime(nt as number);
        
        const auto = await isEnabled();
        setIsAutostart(auto);
      } catch (e) {
        console.error("Failed to init store", e);
      }
    };
    initSettings();

    const bootGreeting = async () => {
      try {
        const s = await load('settings.json', { autoSave: true });
        const greet = await s.get('show_greeting');
        if (greet === false) {
          setIsBooting(false);
          return;
        }
        
        const username = await invoke<string>("get_username");
        const hour = new Date().getHours();
        const isNight = hour >= 18 || hour < 5;
        const greeting = isNight ? "Good evening" : "Welcome back";
        
        showNotif({
          title: `Hi ${username},`,
          body: `${greeting}!`,
          icon: isNight ? "moon" : "sun"
        });
      } catch (e) {
        console.error("Failed to get username", e);
      } finally {
        setIsBooting(false);
      }
    };
    bootGreeting();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const locRes = await fetch("https://get.geojs.io/v1/ip/geo.json");
        const locData = await locRes.json();
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${locData.latitude}&longitude=${locData.longitude}&current_weather=true`);
        const weatherData = await weatherRes.json();
        setWeather({
          temp: `${Math.round(weatherData.current_weather.temperature)}\u00B0`,
          code: weatherData.current_weather.weathercode
        });
      } catch (e) {
        console.error("Weather fetch failed:", e);
      }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 1000 * 60 * 30);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    invoke<[boolean, number]>("get_battery_status")
      .then(res => {
        if (res) setBattery({ is_charging: res[0], percent: res[1] });
      })
      .catch(console.error);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unlistenMedia = listen<MediaPayload>("media-update", (event) => {
      lastMediaPayloadRef.current = event.payload;
      if (event.payload.position !== undefined && event.payload.duration !== undefined) {
        setMediaProgress({ position: event.payload.position, duration: event.payload.duration });
      }
      if (!optMediaRef.current) {
        setMedia(null);
        return;
      }
      if (event.payload.title || event.payload.artist) {
        setMedia(event.payload);
        setIsPlaying(event.payload.is_playing);
      } else {
        setMedia(null);
        setIsExpanded(false);
      }
    });

    const unlistenProgress = listen<{position: number, duration: number}>("media-progress", (event) => {
      setMediaProgress(event.payload);
    });

    const unlistenBattery = listen<{is_charging: boolean, percent: number}>("battery-update", (event) => {
      setBattery((prev) => {

        if (prev && prev.is_charging !== event.payload.is_charging) {
          if (event.payload.is_charging) {
            showNotif({ title: "Charging", body: `${event.payload.percent}%`, icon: "battery" });
          } else {
            showNotif({ title: "On Battery", body: `${event.payload.percent}% remaining`, icon: "battery" });
          }
        }
        return event.payload;
      });
    });

    const unlistenVolume = listen<{level: number}>("volume-update", (event) => {
      if (isQuickControlRef.current || isAdjustingVolumeRef.current) return;
      const vol = Math.round(event.payload.level * 100);
      showNotif({ title: "Volume", body: `${vol}%`, icon: "volume" });
    });

    const unlistenClipboard = listen("clipboard-update", () => {
      showNotif({ title: "Copied to Clipboard", body: "", icon: "clipboard" });
    });

    const unlistenCaps = listen<{is_on: boolean}>("caps-update", (event) => {
      showNotif({ title: event.payload.is_on ? "Caps Lock: ON" : "Caps Lock: OFF", body: "", icon: "capslock" });
    });

    const unlistenRealNotif = listen<{app_name: string, title: string, body: string}>("real-notif", (event) => {
      const appName = event.payload.app_name || "Notification";
      const lower = appName.toLowerCase();
      let iconType = "bell";
      if (lower.includes("whatsapp")) iconType = "whatsapp";
      else if (lower.includes("telegram")) iconType = "telegram";
      else if (lower.includes("discord")) iconType = "discord";
      else if (lower.includes("mail") || lower.includes("outlook")) iconType = "mail";
      else if (lower.includes("instagram")) iconType = "instagram";
      else if (lower.includes("x") || lower.includes("x")) iconType = "x";
      else if (lower.includes("youtube")) iconType = "youtube";
      else if (lower.includes("slack") || lower.includes("teams")) iconType = "slack";
      
      const combinedBody = String(event.payload.title ? (event.payload.body ? `${event.payload.title} - ${event.payload.body}` : event.payload.title) : event.payload.body || '').trim();
      
      showNotif({ title: appName, body: combinedBody, icon: iconType });
    });

    return () => {
      unlistenMedia.then((f) => f());
      unlistenProgress.then((f) => f());
      unlistenBattery.then((f) => f());
      unlistenVolume.then((f) => f());
      unlistenClipboard.then((f) => f());
      unlistenCaps.then((f) => f());
      unlistenRealNotif.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!notif && notifQueue.length > 0) {
      let nextNotif = notifQueue[0];
      if (nextNotif.icon === "volume" && !optVolumeRef.current) {
        setNotifQueue(q => q.slice(1));
        return;
      }
      if (nextNotif.icon === "clipboard" && !optClipboardRef.current) {
        setNotifQueue(q => q.slice(1));
        return;
      }
      setNotif(nextNotif);
      setNotifQueue(q => q.slice(1));
    } else if (notif) {
      let duration = optNotifTimeRef.current * 1000;
      if (notif.icon === "clipboard") duration = 1000;
      if (notif.icon === "sun" || notif.icon === "moon") duration = 5000;
      
      const timer = setTimeout(() => {
        setNotif(null);      }, duration);
      return () => clearTimeout(timer);
    }
  }, [notif, notifQueue]);

  const handleNotifClick = async () => {
    const active = notif;
    setNotif(null);    if (!active) return;
    
    const title = active.title.toLowerCase();
    
    let url = "";
    if (title.includes("whatsapp")) url = "whatsapp://";
    else if (title.includes("telegram")) url = "tg://";
    else if (title.includes("discord")) url = "discord://";
    else if (title.includes("spotify")) url = "spotify://";
    else if (title.includes("slack")) url = "slack://";
    else if (title.includes("teams")) url = "msteams://";
    else if (title.includes("zoom")) url = "zoommtg://";
    else if (title.includes("line")) url = "line://";
    else if (title.includes("mail") || title.includes("outlook")) url = "mailto:";
    else if (title.includes("instagram")) url = "https://instagram.com";
    else if (title.includes("x") || title.includes("x")) url = "https://x.com";
    else if (title.includes("facebook")) url = "https://facebook.com";
    else if (title.includes("youtube")) url = "https://youtube.com";

    if (url) {
      try {
        await invoke("plugin:opener|open", { path: url });
      } catch (e) {
        console.error("Failed to open app:", e);
        window.location.href = url;
      }
    }
  };

  const handleMediaControl = async (action: string) => {
    try {
      await invoke("smtc_action", { action });
      if (action === "toggle") setIsPlaying(!isPlaying);
    } catch (e) {
      console.error(e);
    }
  };



  const isSingleLine = notif && (!notif.body || notif.body.trim() === "");
  const isSmallNotif = notif?.icon === "battery" || notif?.icon === "volume" || notif?.icon === "capslock";
  const isMediumNotif = notif?.title === "On Battery" || notif?.icon === "clipboard" || isSingleLine;

  const getDynamicWidth = () => {
    if (media && isExpanded) {
      const titleWidth = getTextWidth(media.title || "", "bold 18px Inter, sans-serif");
      const artistWidth = getTextWidth(media.artist || "", "14px Inter, sans-serif");
      const maxTextWidth = Math.max(titleWidth, artistWidth);
      const topRowWidth = 48 + 56 + 16 + maxTextWidth + 16;
      const bottomRowWidth = 248;
      return Math.min(330, Math.max(bottomRowWidth, Math.ceil(topRowWidth)));
    }
    
    if (media && !notif && !isExpanded) {
      const titleWidth = getTextWidth(media.title || "", "bold 14px Inter, sans-serif");
      const artistWidth = getTextWidth(media.artist || "", "11px Inter, sans-serif");
      const maxTextWidth = Math.max(titleWidth, artistWidth);
      return Math.min(260, Math.ceil(16 + 32 + 8 + 24 + maxTextWidth + 8)); 
    }
    
    if (notif && !isSmallNotif && !isMediumNotif && !media) {
      const titleWidth = getTextWidth(notif.title || "", "bold 14px Inter, sans-serif");
      const bodyWidth = getTextWidth(notif.body || "", "14px Inter, sans-serif");
      const maxTextWidth = Math.max(titleWidth, bodyWidth);
      return Math.min(260, Math.ceil(32 + 32 + 12 + maxTextWidth + 4));
    }
    
    if (notif && media && !isSmallNotif) {
      const mediaTitle = getTextWidth(media.title || "", "bold 14px Inter, sans-serif");
      const mediaArtist = getTextWidth(media.artist || "", "11px Inter, sans-serif");
      const notifTitle = getTextWidth(notif.title || "", "bold 14px Inter, sans-serif");
      const notifBody = notif.body ? getTextWidth(notif.body, "14px Inter, sans-serif") : 0;
      
      const maxMedia = Math.max(mediaTitle, mediaArtist) + 32 + 32 + 12; 
      const maxNotif = Math.max(notifTitle, notifBody) + 32 + 32 + 12;
      return Math.min(260, Math.max(maxMedia, maxNotif) + 16);
    }
    
    if (notif) {
      const titleWidth = getTextWidth(notif.title || "", "bold 14px Inter, sans-serif");
      const bodyWidth = notif.body ? getTextWidth(notif.body, "14px Inter, sans-serif") : 0;
      
      let baseWidth = 32 + 32 + 12;
      if (notif.body) baseWidth += 8;

      if (notif.icon === "clipboard") return 215;
      
      return Math.min(260, Math.ceil(baseWidth + titleWidth + bodyWidth + 8));
    }

    return 350;
  };
  const dynamicWidth = React.useMemo(() => getDynamicWidth(), [media, notif, isExpanded, isSmallNotif, isMediumNotif]);
  let variant = "idle";
  if (isBooting) {
    variant = "hidden";
  } else if (notif && media) {
    variant = isSmallNotif ? "notif_small_media" : "notif_media";
  } else if (notif) {
    if (notif.icon === "volume") variant = "notif_volume";
    else if (notif.icon === "clipboard") variant = "notif_clipboard";
    else if (isMediumNotif) variant = "notif_medium";
    else if (isSmallNotif) variant = "notif_small";
    else variant = "notif";
  } else if (isSettings) {
    variant = "settings";
  } else if (isQuickControl) {
    variant = "quick_control";
  } else if (media && isExpanded) {
    variant = "media_expanded";
  } else if (media) {
    variant = "media";
  }

  if (isHidden) {
    variant = "hidden";
  }

  const isBot = optPosition === 'bottom';
  const radius = (r: string) => isBot ? `${r} ${r} 0px 0px` : `0px 0px ${r} ${r}`;
  const startY = isBot ? 20 : -20;
  
  const variants = {
    initialState: { width: 0, height: 0, y: startY, opacity: 0, borderRadius: radius("16px") },
    hidden: { width: 0, height: 0, y: startY, opacity: 0, scale: 0.8, borderRadius: radius("16px") },
    idle: { width: 172, height: 32, y: 0, opacity: 1, borderRadius: radius("12px") },
    media: { width: dynamicWidth, height: 48, y: 0, opacity: 1, borderRadius: radius("16px") },
    media_expanded: { width: dynamicWidth, height: 200, y: 0, opacity: 1, borderRadius: radius("24px") },
    notif: { width: dynamicWidth, height: 80, y: 0, opacity: 1, borderRadius: radius("20px") },
    notif_media: { width: dynamicWidth, height: 124, y: 0, opacity: 1, borderRadius: radius("20px") },
    notif_small: { width: dynamicWidth, height: 48, y: 0, opacity: 1, borderRadius: radius("16px") },
    notif_volume: { width: dynamicWidth, height: 48, y: 0, opacity: 1, borderRadius: radius("16px") },
    notif_clipboard: { width: dynamicWidth, height: 48, y: 0, opacity: 1, borderRadius: radius("16px") },
    notif_medium: { width: dynamicWidth, height: 48, y: 0, opacity: 1, borderRadius: radius("16px") },
    notif_small_media: { width: dynamicWidth, height: 96, y: 0, opacity: 1, borderRadius: radius("20px") },
    quick_control: { width: 280, height: 310, y: 0, opacity: 1, borderRadius: radius("24px") },
    settings: { width: 340, height: 500, y: 0, opacity: 1, borderRadius: radius("24px") },
  };

  let smoothSpring: any = { type: "spring", stiffness: 350, damping: 25, mass: 0.9 }; // Apple-like smooth
  if (optAnimSpeed === "snappy") smoothSpring = { type: "spring", stiffness: 500, damping: 35, mass: 1 };
  if (optAnimSpeed === "bouncy") smoothSpring = { type: "spring", stiffness: 280, damping: 15, mass: 0.8 };
  const fadeTransition: any = { duration: 0.2, ease: "easeOut" };

  useEffect(() => {
    const currentSize = variants[variant as keyof typeof variants];
    invoke("update_pill_size", { 
      width: currentSize.width, 
      height: currentSize.height,
      isBottom: optPosition === "bottom"
    }).catch(console.error);
  }, [variant, optPosition]);
  
  useEffect(() => {
    invoke("set_window_position", { isBottom: optPosition === "bottom" }).catch(console.error);
  }, [optPosition]);



  return (
    <div className={`w-screen h-screen flex justify-center bg-transparent pointer-events-none ${optPosition === 'bottom' ? 'items-end' : 'items-start'}`}>
      <motion.div
        layout
        initial="initialState"
        animate={variant}
        variants={variants}
        transition={smoothSpring}
        onMouseMove={resetCollapseTimer}
        onMouseEnter={() => {
          if (media) setIsExpanded(true);
          else if (!notif && !isSettings) {
            setIsQuickControl(true);
            invoke<[string, string]>("get_system_info").then(res => {
              setWifiName(res[0]);
              setBtName(res[1]);
            }).catch(console.error);
            invoke<number>("get_master_volume").then(v => setSoundLevel(Math.round(v * 100))).catch(console.error);
            invoke<number>("get_brightness").then(b => setDisplayLevel(b)).catch(console.error);
          }
          else if (!notif && !isSettings) setIsQuickControl(true);
        }}
        onMouseLeave={() => {
          setIsExpanded(false);
          if (!isSettings) setIsQuickControl(false);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (notif) {
            setNotif(null);
          } else if (isQuickControl || isSettings) {
            setIsQuickControl(false);
            setIsSettings(false);
          } else {
            setIsExpanded(false);
            setIsQuickControl(true);
            invoke<[string, string]>("get_system_info").then(res => {
              setWifiName(res[0]);
              setBtName(res[1]);
            }).catch(console.error);
            invoke<number>("get_master_volume").then(v => setSoundLevel(Math.round(v * 100))).catch(console.error);
            invoke<number>("get_brightness").then(b => setDisplayLevel(b)).catch(console.error);
          }
        }}
        className={`shadow-[0_8px_32px_rgba(0,0,0,0.6)] ring-1 ring-white/10 overflow-hidden text-white ${isHidden ? "pointer-events-none" : "pointer-events-auto"} relative shrink-0 ${optOpacity === 1.0 ? "bg-black" : optOpacity === 0.8 ? "bg-black/80 backdrop-blur-xl" : "bg-black/60 backdrop-blur-2xl"}`}
      >
        {/* Premium Noise Overlay for elegant glassmorphism */}
        <div className="bg-noise absolute inset-0 z-0 rounded-[inherit] pointer-events-none"></div>
        <AnimatePresence mode="wait">
{variant === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={fadeTransition}
              className="absolute inset-0 flex items-center justify-center gap-2 cursor-pointer hover:bg-white/5 transition-colors"
              onClick={() => setIsQuickControl(true)}
            >
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-bold text-green-400">
                  {battery ? `${battery.percent}%` : '--%'}
                </span>
                <Zap size={10} className={battery?.is_charging ? "text-green-400" : "text-neutral-500"} />
                {isOnline ? (
                  <Wifi size={10} className="text-white ml-0.5" />
                ) : (
                  <WifiOff size={10} className="text-neutral-500 ml-0.5" />
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {weather && (
                  <div className="flex items-center gap-1">
                    {getWeatherIcon(weather.code)}
                    <span className="text-[10px] font-bold text-neutral-300">{weather.temp}</span>
                  </div>
                )}
                <div className="text-[10px] font-bold text-neutral-300">
                  {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </motion.div>
          )}

          {variant === "quick_control" && (
            <motion.div
              key="quick_control"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={fadeTransition}
              className="absolute inset-0 flex flex-col p-4 pb-6 gap-2"
              onMouseEnter={() => {
                if (quickControlTimerRef.current) clearTimeout(quickControlTimerRef.current);
              }}
              onMouseLeave={() => {
                quickControlTimerRef.current = setTimeout(() => setIsQuickControl(false), 2000);
              }}
            >
              <div className="flex justify-between items-center px-1 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>
                  <span className="text-[11px] font-bold text-white tracking-widest uppercase opacity-90">Control Center</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-neutral-300">
                    {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); setIsSettings(true); }} className="text-neutral-400 hover:text-white transition-colors">
                    <SettingsIcon size={14} />
                  </button>
                </div>
              </div>

                <div className="flex gap-2">
                  <div onClick={(e) => { e.stopPropagation(); invoke("system_power_action", { action: "lock" }); setIsQuickControl(false); }} className="flex-1 min-w-0 h-12 bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-2xl flex items-center justify-center cursor-pointer transition-colors border border-white/5 shadow-sm">
                    <Lock size={18} className="text-neutral-300" />
                  </div>
                  <div onClick={(e) => { e.stopPropagation(); invoke("system_power_action", { action: "sleep" }); setIsQuickControl(false); }} className="flex-1 min-w-0 h-12 bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-2xl flex items-center justify-center cursor-pointer transition-colors border border-white/5 shadow-sm">
                    <Moon size={18} className="text-neutral-300" />
                  </div>
                  <div onClick={(e) => { e.stopPropagation(); invoke("system_power_action", { action: "restart" }); setIsQuickControl(false); }} className="flex-1 min-w-0 h-12 bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-2xl flex items-center justify-center cursor-pointer transition-colors border border-white/5 shadow-sm">
                    <RotateCcw size={18} className="text-neutral-300" />
                  </div>
                  <div onClick={(e) => { e.stopPropagation(); invoke("system_power_action", { action: "shutdown" }); setIsQuickControl(false); }} className="flex-1 min-w-0 h-12 bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-2xl flex items-center justify-center cursor-pointer transition-colors border border-white/5 shadow-sm">
                    <Power size={18} className="text-neutral-300" />
                  </div>
                </div>

                <div className="flex gap-2">
                  <div onClick={(e) => { e.stopPropagation(); invoke("system_power_action", { action: "wifi" }); setIsQuickControl(false); }} className="flex-1 min-w-0 h-12 bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-2xl flex items-center px-3 gap-3 cursor-pointer transition-colors border border-white/5 shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.2)] shrink-0">
                      <Wifi size={16} className="text-blue-400" />
                    </div>
                    <div className="flex flex-col justify-center overflow-hidden">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-white leading-tight">Wi-Fi</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.6)]"></div>
                      </div>
                      <ScrollingText text={wifiName} className="text-[9px] text-neutral-400 mt-0.5 font-medium" />
                    </div>
                  </div>
                  <div onClick={(e) => { e.stopPropagation(); invoke("system_power_action", { action: "bluetooth" }); setIsQuickControl(false); }} className="flex-1 min-w-0 h-12 bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-2xl flex items-center px-3 gap-3 cursor-pointer transition-colors border border-white/5 shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                      <Bluetooth size={16} className="text-indigo-400" />
                    </div>
                    <div className="flex flex-col justify-center overflow-hidden">
                      <span className="text-[11px] font-semibold text-white leading-tight">Bluetooth</span>
                      <ScrollingText text={btName} className="text-[9px] text-neutral-400 mt-0.5 font-medium" />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div onClick={(e) => { e.stopPropagation(); invoke("system_power_action", { action: "screenshot" }); setIsQuickControl(false); }} className="flex-1 min-w-0 h-12 bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-2xl flex items-center px-3 cursor-pointer transition-colors border border-white/5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                        <Scissors size={16} className="text-purple-400" />
                      </div>
                      <span className="text-[11px] font-semibold text-white">Screenshot</span>
                    </div>
                  </div>
                  <div onClick={(e) => { e.stopPropagation(); invoke("system_power_action", { action: "settings" }); setIsQuickControl(false); }} className="flex-1 min-w-0 h-12 bg-[#1c1c1e] hover:bg-[#2c2c2e] rounded-2xl flex items-center px-3 cursor-pointer transition-colors border border-white/5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center shrink-0">
                        <SettingsIcon size={16} className="text-sky-400" />
                      </div>
                      <span className="text-[11px] font-semibold text-white">Settings</span>
                    </div>
                  </div>
                </div>
                
              <div className="flex flex-col gap-1.5 px-1 mb-2">
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-neutral-400">
                      <Sun size={14} />
                      <span className="text-[11px] font-medium">Display</span>
                    </div>
                    <span className="text-[11px] text-neutral-500 font-medium">{displayLevel}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={displayLevel} onChange={(e) => { const v = Number(e.target.value); setDisplayLevel(v); invoke("set_brightness", { level: v }); }} className="w-full h-1.5 bg-neutral-800 rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all" style={{ background: `linear-gradient(to right, white ${displayLevel}%, #262626 ${displayLevel}%)` }} />
                </div>
                
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-neutral-400">
                      <Volume2 size={14} />
                      <span className="text-[11px] font-medium">Sound</span>
                    </div>
                    <span className="text-[11px] text-neutral-500 font-medium">{soundLevel}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={soundLevel} onChange={(e) => { const v = Number(e.target.value); setSoundLevel(v); invoke("set_master_volume", { level: v / 100.0 }); }} className="w-full h-1.5 bg-neutral-800 rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all" style={{ background: `linear-gradient(to right, white ${soundLevel}%, #262626 ${soundLevel}%)` }} />
                </div>
              </div>
              
              
            </motion.div>
          )}


                      {variant === "settings" && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={fadeTransition}
                className="absolute inset-0 flex flex-col p-5 cursor-default"
                onClick={() => setIsSettings(false)}
                onMouseEnter={() => {
                  if (quickControlTimerRef.current) clearTimeout(quickControlTimerRef.current);
                }}
                onMouseLeave={() => {
                  quickControlTimerRef.current = setTimeout(() => { setIsQuickControl(false); setIsSettings(false); }, 3000) as unknown as number;
                }}
              >
                <div className="flex justify-between items-center px-1 mb-4">
                  <span className="text-[14px] font-extrabold text-white tracking-wide uppercase opacity-90">Preferences</span>
                  
                </div>
                
                <div className="flex flex-col gap-4 px-1 overflow-y-auto no-scrollbar pb-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-pink-400 uppercase tracking-widest">General</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[13px] font-medium text-neutral-200">Run on Startup</span>
                      <button onClick={async (e) => { e.stopPropagation(); try { if (isAutostart) await disable(); else await enable(); setIsAutostart(!isAutostart); } catch(e) {} }} className={`w-9 h-5 rounded-full relative transition-colors ${isAutostart ? 'bg-green-500' : 'bg-neutral-600'}`}><div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isAutostart ? 'translate-x-4' : 'translate-x-0'}`} /></button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[13px] font-medium text-neutral-200">Boot Greeting</span>
                      <button onClick={async (e) => { e.stopPropagation(); const next = !showGreeting; setShowGreeting(next); if (store) await store.set('show_greeting', next); }} className={`w-9 h-5 rounded-full relative transition-colors ${showGreeting ? 'bg-green-500' : 'bg-neutral-600'}`}><div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${showGreeting ? 'translate-x-4' : 'translate-x-0'}`} /></button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[13px] font-medium text-neutral-200">Notif Duration</span>
                      <div className="flex bg-white/10 rounded-lg p-1 gap-1">
                        <button onClick={async (e) => { e.stopPropagation(); setOptNotifTime(3); if (store) await store.set('opt_notif_time', 3); }} className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors ${optNotifTime === 3 ? 'bg-white text-black' : 'text-neutral-400'}`}>3s</button>
                        <button onClick={async (e) => { e.stopPropagation(); setOptNotifTime(5); if (store) await store.set('opt_notif_time', 5); }} className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors ${optNotifTime === 5 ? 'bg-white text-black' : 'text-neutral-400'}`}>5s</button>
                        <button onClick={async (e) => { e.stopPropagation(); setOptNotifTime(7); if (store) await store.set('opt_notif_time', 7); }} className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors ${optNotifTime === 7 ? 'bg-white text-black' : 'text-neutral-400'}`}>7s</button>
                      </div>
                    </div>
                  </div>

                  <div className="w-full h-[1px] bg-white/10 my-1"></div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-blue-400 uppercase tracking-widest">Appearance</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[13px] font-medium text-neutral-200">Position</span>
                      <div className="flex bg-white/10 rounded-lg p-1 gap-1">
                         <button onClick={async (e) => { e.stopPropagation(); setOptPosition('top'); if (store) await store.set('opt_position', 'top'); }} className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors ${optPosition === 'top' ? 'bg-white text-black' : 'text-neutral-400'}`}>Top</button>
                         <button onClick={async (e) => { e.stopPropagation(); setOptPosition('bottom'); if (store) await store.set('opt_position', 'bottom'); }} className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors ${optPosition === 'bottom' ? 'bg-white text-black' : 'text-neutral-400'}`}>Bottom</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[13px] font-medium text-neutral-200">Transparency</span>
                      <div className="flex bg-white/10 rounded-lg p-1 gap-1">
                         <button onClick={async (e) => { e.stopPropagation(); setOptOpacity(1.0); if (store) await store.set('opt_opacity', 1.0); }} className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors ${optOpacity === 1.0 ? 'bg-white text-black' : 'text-neutral-400'}`}>Solid</button>
                         <button onClick={async (e) => { e.stopPropagation(); setOptOpacity(0.8); if (store) await store.set('opt_opacity', 0.8); }} className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors ${optOpacity === 0.8 ? 'bg-white text-black' : 'text-neutral-400'}`}>Glass</button>
                         <button onClick={async (e) => { e.stopPropagation(); setOptOpacity(0.5); if (store) await store.set('opt_opacity', 0.5); }} className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors ${optOpacity === 0.5 ? 'bg-white text-black' : 'text-neutral-400'}`}>Clear</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[13px] font-medium text-neutral-200">Animation Speed</span>
                      <div className="flex bg-white/10 rounded-lg p-1 gap-1">
                         <button onClick={async (e) => { e.stopPropagation(); setOptAnimSpeed('snappy'); if (store) await store.set('opt_anim_speed', 'snappy'); }} className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors ${optAnimSpeed === 'snappy' ? 'bg-white text-black' : 'text-neutral-400'}`}>Snappy</button>
                         <button onClick={async (e) => { e.stopPropagation(); setOptAnimSpeed('smooth'); if (store) await store.set('opt_anim_speed', 'smooth'); }} className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors ${optAnimSpeed === 'smooth' ? 'bg-white text-black' : 'text-neutral-400'}`}>Smooth</button>
                         <button onClick={async (e) => { e.stopPropagation(); setOptAnimSpeed('bouncy'); if (store) await store.set('opt_anim_speed', 'bouncy'); }} className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors ${optAnimSpeed === 'bouncy' ? 'bg-white text-black' : 'text-neutral-400'}`}>Bouncy</button>
                      </div>
                    </div>
                  </div>

                  <div className="w-full h-[1px] bg-white/10 my-1"></div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-green-400 uppercase tracking-widest">Modules</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[13px] font-medium text-neutral-200">Volume Monitor</span>
                      <button onClick={async (e) => { e.stopPropagation(); const next = !optVolume; setOptVolume(next); if (store) await store.set('opt_volume', next); }} className={`w-9 h-5 rounded-full relative transition-colors ${optVolume ? 'bg-green-500' : 'bg-neutral-600'}`}><div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${optVolume ? 'translate-x-4' : 'translate-x-0'}`} /></button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[13px] font-medium text-neutral-200">Clipboard Monitor</span>
                      <button onClick={async (e) => { e.stopPropagation(); const next = !optClipboard; setOptClipboard(next); if (store) await store.set('opt_clipboard', next); }} className={`w-9 h-5 rounded-full relative transition-colors ${optClipboard ? 'bg-green-500' : 'bg-neutral-600'}`}><div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${optClipboard ? 'translate-x-4' : 'translate-x-0'}`} /></button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[13px] font-medium text-neutral-200">Media Player</span>
                      <button onClick={async (e) => { e.stopPropagation(); const next = !optMedia; setOptMedia(next); if (store) await store.set('opt_media', next); }} className={`w-9 h-5 rounded-full relative transition-colors ${optMedia ? 'bg-green-500' : 'bg-neutral-600'}`}><div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${optMedia ? 'translate-x-4' : 'translate-x-0'}`} /></button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          
          {variant === "media" && (
            <motion.div
              key="media"
              onClick={() => setIsExpanded(true)}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={fadeTransition}
              className="absolute inset-0 flex items-center justify-between gap-2 px-2 cursor-pointer"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-8 h-8 bg-neutral-800 rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                    {media!.thumbnail ? (
                      <img src={media!.thumbnail} alt="Album Art" className="w-full h-full object-cover" />
                    ) : media!.playback_type === 2 ? (
                      <Film size={20} className="text-blue-400" />
                    ) : (
                      <Music size={20} className="text-pink-400" />
                    )}
                  </div>
                <div className="flex flex-col justify-center overflow-hidden whitespace-nowrap flex-1 min-w-0">
                  <ScrollingText text={media!.title} className="text-sm font-semibold leading-tight" />
                  <ScrollingText text={media!.artist} className="text-[11px] text-neutral-400 leading-tight" />
                </div>
              </div>
              <AudioVisualizer isPlaying={isPlaying} onToggle={() => handleMediaControl("toggle")} optAccent={optAccent} />
            </motion.div>
          )}

          {variant === "media_expanded" && (
            <motion.div
              key="media_expanded"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={fadeTransition}
              className="absolute inset-0 flex flex-col px-4 py-4 justify-between cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-neutral-800/50 rounded-xl flex items-center justify-center shrink-0 overflow-hidden shadow-lg border border-white/10">
                  {media!.thumbnail ? (
                    <img src={media!.thumbnail} alt="Album Art" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon size={24} className="text-white/50" />
                  )}
                </div>
                <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                  <ScrollingText text={media!.title} className="text-[17px] font-semibold text-white tracking-tight leading-tight" />
                  <ScrollingText text={media!.artist} className="text-[13px] font-medium text-white/60 mt-0.5 leading-tight" />
                </div>
                {isPlaying && (
                  <div className="flex items-center shrink-0 pr-1">
                    <AudioVisualizer isPlaying={true} onToggle={() => handleMediaControl("toggle")} optAccent={optAccent} />
                  </div>
                )}
              </div>
              
              {/* Playback Controls & Progress */}
              <div className="flex flex-col gap-3 mt-1 cursor-default" onClick={(e) => e.stopPropagation()}>
                {/* Real progress bar (interactive) */}
                <div 
                  className="w-full h-3 group flex items-center cursor-pointer relative"
                  onPointerDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                    setIsSeeking(true);
                    setSeekValue(percent);
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (isSeeking && e.currentTarget.hasPointerCapture(e.pointerId)) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                      setSeekValue(percent);
                    }
                  }}
                  onPointerUp={async (e) => {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    if (isSeeking && mediaProgress.duration > 0) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                      const newPos = (percent / 100) * mediaProgress.duration;
                      await invoke("smtc_seek", { positionSec: newPos });
                      setMediaProgress(prev => ({ ...prev, position: newPos }));
                      setIsSeeking(false);
                    }
                  }}
                  onPointerLeave={async (e) => {
                    // Only trigger if we aren't capturing the pointer (i.e. not actively dragging)
                    if (isSeeking && mediaProgress.duration > 0 && !e.currentTarget.hasPointerCapture(e.pointerId)) {
                      const newPos = (seekValue / 100) * mediaProgress.duration;
                      await invoke("smtc_seek", { positionSec: newPos });
                      setMediaProgress(prev => ({ ...prev, position: newPos }));
                      setIsSeeking(false);
                    }
                  }}
                >
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden flex relative pointer-events-none">
                    {mediaProgress.duration > 0 ? (
                      <div 
                        className={`h-full bg-white/70 rounded-full transition-all ${isSeeking ? 'duration-75 ease-out' : 'duration-1000 ease-linear'}`}
                        style={{ width: `${Math.min(100, Math.max(0, isSeeking ? seekValue : (mediaProgress.position / mediaProgress.duration) * 100))}%` }}
                      />
                    ) : (
                      <div className="h-full w-1/3 bg-white/30 rounded-full" />
                    )}
                  </div>
                  {/* Thumb */}
                  {mediaProgress.duration > 0 && (
                    <div 
                      className="absolute h-2.5 w-2.5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-all pointer-events-none"
                      style={{ 
                        left: `calc(${Math.min(100, Math.max(0, isSeeking ? seekValue : (mediaProgress.position / mediaProgress.duration) * 100))}% - 5px)`,
                        transitionDuration: isSeeking ? '75ms' : '1000ms',
                        transitionTimingFunction: isSeeking ? 'ease-out' : 'linear'
                      }} 
                    />
                  )}
                </div>

                <div className="flex items-center justify-center gap-8">
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); handleMediaControl("prev"); }} className="w-10 h-10 flex items-center justify-center rounded-full transition-all shrink-0 text-white/60 hover:text-white hover:bg-white/10">
                    <SkipBack size={22} fill="currentColor" />
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={(e) => { e.stopPropagation(); handleMediaControl("toggle"); }} className="w-12 h-12 flex items-center justify-center bg-white text-black rounded-full shrink-0">
                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); handleMediaControl("next"); }} className="w-10 h-10 flex items-center justify-center rounded-full transition-all shrink-0 text-white/60 hover:text-white hover:bg-white/10">
                    <SkipForward size={22} fill="currentColor" />
                  </motion.button>
                </div>

                {/* Volume Slider */}
                <div className="flex items-center gap-3 mt-1.5 w-full cursor-default" onClick={(e) => e.stopPropagation()}>
                  <Volume2 size={16} className="text-white/50 shrink-0" />
                  <div 
                    className="flex-1 h-4 group flex items-center cursor-pointer relative"
                    onPointerDown={(e) => {
                      isAdjustingVolumeRef.current = true;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                      setSoundLevel(Math.round(percent));
                      invoke("set_master_volume", { level: percent / 100.0 });
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                        setSoundLevel(Math.round(percent));
                        invoke("set_master_volume", { level: percent / 100.0 });
                      }
                    }}
                    onPointerUp={(e) => {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                      setTimeout(() => { isAdjustingVolumeRef.current = false; }, 500);
                    }}
                  >
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden flex relative pointer-events-none">
                      <div 
                        className="h-full bg-white/70 rounded-full"
                        style={{ width: `${soundLevel}%` }}
                      />
                    </div>
                    {/* Thumb */}
                    <div 
                      className="absolute h-2.5 w-2.5 bg-white rounded-full opacity-0 group-hover:opacity-100 pointer-events-none shadow-md"
                      style={{ left: `calc(${soundLevel}% - 5px)` }} 
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {(variant === "notif" || variant === "notif_small" || variant === "notif_medium" || variant === "notif_volume" || variant === "notif_clipboard") && (
            <motion.div
              key="notif"
              onClick={handleNotifClick}
              initial={{ opacity: 0, y: isBot ? -10 : 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: isBot ? 10 : -10, scale: 0.95 }}
              transition={fadeTransition}
              className={`absolute inset-0 flex items-center gap-2 px-4 cursor-pointer justify-center`}
            >
              <NotifIcon type={notif!.icon} />
              <div className={(variant === "notif_small" || variant === "notif_medium" || variant === "notif_volume" || variant === "notif_clipboard") ? "flex items-center gap-2 overflow-hidden" : "flex flex-col justify-center overflow-hidden"}>
                <span className="text-sm font-bold leading-tight truncate shrink-0">{notif!.title}</span>
                {notif!.body && (
                  <AnimatePresence mode="popLayout">
                    <motion.div 
                      key={notif!.body}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.1 }}
                      className="min-w-0 flex items-center"
                    >
                      <span className={`text-sm leading-tight truncate ${(variant === "notif_small" || variant === "notif_medium" || variant === "notif_volume" || variant === "notif_clipboard") ? 'text-green-400 font-semibold' : 'text-neutral-300'}`}>
                        {notif!.body}
                      </span>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          )}

          {variant === "notif_media" && (
            <motion.div
              key="notif_media"
              onClick={handleNotifClick}
              initial={{ opacity: 0, y: isBot ? -10 : 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: isBot ? 10 : -10, scale: 0.95 }}
              transition={fadeTransition}
              className={`absolute inset-0 flex flex-col justify-center px-4 cursor-pointer gap-2`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-8 h-8 bg-neutral-800 rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                    {media!.thumbnail ? (
                      <img src={media!.thumbnail} alt="Album Art" className="w-full h-full object-cover" />
                    ) : media!.playback_type === 2 ? (
                      <Film size={20} className="text-blue-400" />
                    ) : (
                      <Music size={20} className="text-pink-400" />
                    )}
                  </div>
                <div className="flex flex-col justify-center overflow-hidden whitespace-nowrap flex-1 min-w-0">
                  <ScrollingText text={media!.title} className="text-sm font-semibold leading-tight" />
                  <ScrollingText text={media!.artist} className="text-[11px] text-neutral-400 leading-tight" />
                </div>
              </div>
              <div className="h-[1px] w-full bg-white/10" />
              <div className="flex items-center gap-2">
                <NotifIcon type={notif!.icon} />
                <div className="flex flex-col justify-center overflow-hidden">
                  <span className="text-sm font-bold leading-tight truncate shrink-0">{notif!.title}</span>
                  {notif!.body && <span className="text-sm truncate text-neutral-300 leading-snug">{notif!.body}</span>}
                </div>
              </div>
            </motion.div>
          )}

          {variant === "notif_small_media" && (
            <motion.div
              key="notif_small_media"
              onClick={handleNotifClick}
              initial={{ opacity: 0, y: isBot ? -10 : 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: isBot ? 10 : -10, scale: 0.95 }}
              transition={fadeTransition}
              className={`absolute inset-0 flex flex-col justify-center px-4 cursor-pointer gap-2`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-8 h-8 bg-neutral-800 rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                    {media!.thumbnail ? (
                      <img src={media!.thumbnail} alt="Album Art" className="w-full h-full object-cover" />
                    ) : media!.playback_type === 2 ? (
                      <Film size={20} className="text-blue-400" />
                    ) : (
                      <Music size={20} className="text-pink-400" />
                    )}
                  </div>
                <div className="flex flex-col justify-center overflow-hidden whitespace-nowrap flex-1 min-w-0">
                  <ScrollingText text={media!.title} className="text-sm font-semibold leading-tight" />
                  <ScrollingText text={media!.artist} className="text-[11px] text-neutral-400 leading-tight" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <NotifIcon type={notif!.icon} />
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-sm font-bold leading-tight truncate shrink-0">{notif!.title}</span>
                  {notif!.body && <span className="text-sm truncate text-green-400 font-semibold">{notif!.body}</span>}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
