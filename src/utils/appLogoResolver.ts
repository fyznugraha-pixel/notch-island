/**
 * Utility to resolve application logos and brand styling for notifications
 * Uses assets from /logo/ and /gili-icons/
 */

export interface AppLogoInfo {
  name: string;
  logoUrl?: string;
  color: string;
  bgBoxClass: string;
  fallbackGlyph?: string;
}

const KNOWN_LOGOS: Record<string, { logoUrl: string; color: string; bgBoxClass: string }> = {
  // Messaging & Social
  whatsapp: { logoUrl: "/logo/whatsapp.svg", color: "#25D366", bgBoxClass: "bg-[#25D366]/15 text-[#25D366]" },
  "whatsapp web": { logoUrl: "/logo/whatsapp.svg", color: "#25D366", bgBoxClass: "bg-[#25D366]/15 text-[#25D366]" },
  telegram: { logoUrl: "/logo/telegram.svg", color: "#229ED9", bgBoxClass: "bg-[#229ED9]/15 text-[#229ED9]" },
  discord: { logoUrl: "/logo/discord.webp", color: "#5865F2", bgBoxClass: "bg-[#5865F2]/15 text-[#5865F2]" },
  instagram: { logoUrl: "/logo/Instagram_icon.png", color: "#E1306C", bgBoxClass: "bg-[#E1306C]/15 text-[#E1306C]" },
  threads: { logoUrl: "/logo/threads.png", color: "#FFFFFF", bgBoxClass: "bg-white/10 text-white" },
  tiktok: { logoUrl: "/logo/tiktok.webp", color: "#FE2C55", bgBoxClass: "bg-[#FE2C55]/15 text-[#FE2C55]" },
  x: { logoUrl: "/logo/x.webp", color: "#FFFFFF", bgBoxClass: "bg-white/10 text-white" },
  twitter: { logoUrl: "/logo/x.webp", color: "#1DA1F2", bgBoxClass: "bg-[#1DA1F2]/15 text-[#1DA1F2]" },
  reddit: { logoUrl: "/logo/reddit.png", color: "#FF4500", bgBoxClass: "bg-[#FF4500]/15 text-[#FF4500]" },
  bitchord: { logoUrl: "/logo/bitchord.png", color: "#7289DA", bgBoxClass: "bg-[#7289DA]/15 text-[#7289DA]" },

  // Web Browsers
  chrome: { logoUrl: "/logo/chrome.png", color: "#4285F4", bgBoxClass: "bg-[#4285F4]/15 text-[#4285F4]" },
  "google chrome": { logoUrl: "/logo/chrome.png", color: "#4285F4", bgBoxClass: "bg-[#4285F4]/15 text-[#4285F4]" },
  edge: { logoUrl: "/logo/edge.png", color: "#0078D7", bgBoxClass: "bg-[#0078D7]/15 text-[#0078D7]" },
  "microsoft edge": { logoUrl: "/logo/edge.png", color: "#0078D7", bgBoxClass: "bg-[#0078D7]/15 text-[#0078D7]" },
  brave: { logoUrl: "/logo/brave.png", color: "#FB542B", bgBoxClass: "bg-[#FB542B]/15 text-[#FB542B]" },
  firefox: { logoUrl: "/logo/firefox.png", color: "#FF7139", bgBoxClass: "bg-[#FF7139]/15 text-[#FF7139]" },
  "mozilla firefox": { logoUrl: "/logo/firefox.png", color: "#FF7139", bgBoxClass: "bg-[#FF7139]/15 text-[#FF7139]" },

  // Streaming & Media
  spotify: { logoUrl: "/logo/spotify.png", color: "#1DB954", bgBoxClass: "bg-[#1DB954]/15 text-[#1DB954]" },
  youtube: { logoUrl: "/logo/youtube.png", color: "#FF0000", bgBoxClass: "bg-[#FF0000]/15 text-[#FF0000]" },
  "youtube-music": { logoUrl: "/logo/youtube-music.png", color: "#FF0000", bgBoxClass: "bg-[#FF0000]/15 text-[#FF0000]" },
  "youtube music": { logoUrl: "/logo/youtube-music.png", color: "#FF0000", bgBoxClass: "bg-[#FF0000]/15 text-[#FF0000]" },
  netflix: { logoUrl: "/logo/Netflix_icon.svg.webp", color: "#E50914", bgBoxClass: "bg-[#E50914]/15 text-[#E50914]" },
  "apple-music": { logoUrl: "/logo/apple-music.png", color: "#FA243C", bgBoxClass: "bg-[#FA243C]/15 text-[#FA243C]" },
  "apple music": { logoUrl: "/logo/apple-music.png", color: "#FA243C", bgBoxClass: "bg-[#FA243C]/15 text-[#FA243C]" },
  "amazon-music": { logoUrl: "/logo/amazon-music.png", color: "#25D1DA", bgBoxClass: "bg-[#25D1DA]/15 text-[#25D1DA]" },
  "amazon music": { logoUrl: "/logo/amazon-music.png", color: "#25D1DA", bgBoxClass: "bg-[#25D1DA]/15 text-[#25D1DA]" },
  tidal: { logoUrl: "/logo/tidal.png", color: "#000000", bgBoxClass: "bg-white/15 text-white" },
  deezer: { logoUrl: "/logo/deezer.png", color: "#FEAA2D", bgBoxClass: "bg-[#FEAA2D]/15 text-[#FEAA2D]" },
  soundcloud: { logoUrl: "/logo/soundcloud.png", color: "#FF5500", bgBoxClass: "bg-[#FF5500]/15 text-[#FF5500]" },
  qobuz: { logoUrl: "/logo/qobuz.png", color: "#00A2E8", bgBoxClass: "bg-[#00A2E8]/15 text-[#00A2E8]" },
  bandcamp: { logoUrl: "/logo/bandcamp.png", color: "#629AA9", bgBoxClass: "bg-[#629AA9]/15 text-[#629AA9]" },
  spotube: { logoUrl: "/logo/spotube.png", color: "#34C759", bgBoxClass: "bg-[#34C759]/15 text-[#34C759]" },
  cider: { logoUrl: "/logo/cider.png", color: "#FA243C", bgBoxClass: "bg-[#FA243C]/15 text-[#FA243C]" },
  jellyfin: { logoUrl: "/logo/jellyfin.png", color: "#AA5CC3", bgBoxClass: "bg-[#AA5CC3]/15 text-[#AA5CC3]" },
  plex: { logoUrl: "/logo/plex.png", color: "#E5A00D", bgBoxClass: "bg-[#E5A00D]/15 text-[#E5A00D]" },
  plexamp: { logoUrl: "/logo/plexamp.png", color: "#E5A00D", bgBoxClass: "bg-[#E5A00D]/15 text-[#E5A00D]" },
  roon: { logoUrl: "/logo/roon.png", color: "#8E8E93", bgBoxClass: "bg-white/10 text-white" },

  // Desktop Players
  vlc: { logoUrl: "/logo/vlc.png", color: "#FF8800", bgBoxClass: "bg-[#FF8800]/15 text-[#FF8800]" },
  itunes: { logoUrl: "/logo/itunes.png", color: "#EA4CC0", bgBoxClass: "bg-[#EA4CC0]/15 text-[#EA4CC0]" },
  winamp: { logoUrl: "/logo/winamp.png", color: "#FF9900", bgBoxClass: "bg-[#FF9900]/15 text-[#FF9900]" },
  "windows-media-player": { logoUrl: "/logo/windows-media-player.png", color: "#0078D7", bgBoxClass: "bg-[#0078D7]/15 text-[#0078D7]" },
  "windows media player": { logoUrl: "/logo/windows-media-player.png", color: "#0078D7", bgBoxClass: "bg-[#0078D7]/15 text-[#0078D7]" },
  potplayer: { logoUrl: "/logo/potplayer.png", color: "#F6C500", bgBoxClass: "bg-[#F6C500]/15 text-[#F6C500]" },
  foobar2000: { logoUrl: "/logo/foobar2000.png", color: "#8E8E93", bgBoxClass: "bg-white/10 text-white" },
  musicbee: { logoUrl: "/logo/musicbee.png", color: "#F38220", bgBoxClass: "bg-[#F38220]/15 text-[#F38220]" },
  aimp: { logoUrl: "/logo/aimp.png", color: "#3072B4", bgBoxClass: "bg-[#3072B4]/15 text-[#3072B4]" },
  clementine: { logoUrl: "/logo/clementine.png", color: "#F89406", bgBoxClass: "bg-[#F89406]/15 text-[#F89406]" },
  dopamine: { logoUrl: "/logo/dopamine.png", color: "#00A2E8", bgBoxClass: "bg-[#00A2E8]/15 text-[#00A2E8]" },
  feishin: { logoUrl: "/logo/feishin.png", color: "#007ACC", bgBoxClass: "bg-[#007ACC]/15 text-[#007ACC]" },
  moosync: { logoUrl: "/logo/moosync.png", color: "#7B68EE", bgBoxClass: "bg-[#7B68EE]/15 text-[#7B68EE]" },
  audacious: { logoUrl: "/logo/audacious.png", color: "#4682B4", bgBoxClass: "bg-[#4682B4]/15 text-[#4682B4]" },
  mediamonkey: { logoUrl: "/logo/mediamonkey.png", color: "#D4A373", bgBoxClass: "bg-[#D4A373]/15 text-[#D4A373]" },

  // Gili Island / System
  gili: { logoUrl: "/gili-icons/app-icon/png/gili-app-icon-64.png", color: "#3882F6", bgBoxClass: "bg-[#3882F6]/15 text-[#3882F6]" },
  island: { logoUrl: "/gili-icons/app-icon/png/gili-app-icon-64.png", color: "#3882F6", bgBoxClass: "bg-[#3882F6]/15 text-[#3882F6]" },
  sistem: { logoUrl: "/gili-icons/app-icon/png/gili-app-icon-64.png", color: "#3882F6", bgBoxClass: "bg-[#3882F6]/15 text-[#3882F6]" },
  system: { logoUrl: "/gili-icons/app-icon/png/gili-app-icon-64.png", color: "#3882F6", bgBoxClass: "bg-[#3882F6]/15 text-[#3882F6]" },
};

/**
 * Resolves application logo URL and visual attributes based on appName or icon type
 */
export function resolveAppLogo(appName?: string, type?: string): AppLogoInfo {
  const normName = (appName || "").trim().toLowerCase();
  const normType = (type || "").trim().toLowerCase();

  // 1. Direct match on appName
  if (normName && KNOWN_LOGOS[normName]) {
    const item = KNOWN_LOGOS[normName];
    return {
      name: appName || "App",
      logoUrl: item.logoUrl,
      color: item.color,
      bgBoxClass: item.bgBoxClass,
      fallbackGlyph: normType || "bell",
    };
  }

  // 2. Direct match on type
  if (normType && KNOWN_LOGOS[normType]) {
    const item = KNOWN_LOGOS[normType];
    return {
      name: appName || type || "App",
      logoUrl: item.logoUrl,
      color: item.color,
      bgBoxClass: item.bgBoxClass,
      fallbackGlyph: normType,
    };
  }

  // 3. Keyword / partial matching in appName
  const haystack = `${normName} ${normType}`;

  if (haystack.includes("whatsapp") || haystack.includes("wa web")) {
    const item = KNOWN_LOGOS.whatsapp;
    return { name: appName || "WhatsApp", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "message" };
  }
  if (haystack.includes("telegram")) {
    const item = KNOWN_LOGOS.telegram;
    return { name: appName || "Telegram", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "message" };
  }
  if (haystack.includes("discord")) {
    const item = KNOWN_LOGOS.discord;
    return { name: appName || "Discord", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "message" };
  }
  if (haystack.includes("chrome")) {
    const item = KNOWN_LOGOS.chrome;
    return { name: appName || "Google Chrome", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "bell" };
  }
  if (haystack.includes("edge")) {
    const item = KNOWN_LOGOS.edge;
    return { name: appName || "Microsoft Edge", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "bell" };
  }
  if (haystack.includes("brave")) {
    const item = KNOWN_LOGOS.brave;
    return { name: appName || "Brave", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "bell" };
  }
  if (haystack.includes("firefox")) {
    const item = KNOWN_LOGOS.firefox;
    return { name: appName || "Firefox", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "bell" };
  }
  if (haystack.includes("spotify")) {
    const item = KNOWN_LOGOS.spotify;
    return { name: appName || "Spotify", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "bell" };
  }
  if (haystack.includes("youtube")) {
    const isYtMusic = haystack.includes("music");
    const item = isYtMusic ? KNOWN_LOGOS["youtube-music"] : KNOWN_LOGOS.youtube;
    return { name: appName || (isYtMusic ? "YouTube Music" : "YouTube"), logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "bell" };
  }
  if (haystack.includes("instagram")) {
    const item = KNOWN_LOGOS.instagram;
    return { name: appName || "Instagram", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "message" };
  }
  if (haystack.includes("tiktok")) {
    const item = KNOWN_LOGOS.tiktok;
    return { name: appName || "TikTok", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "bell" };
  }
  if (haystack.includes("reddit")) {
    const item = KNOWN_LOGOS.reddit;
    return { name: appName || "Reddit", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "message" };
  }
  if (haystack.includes("netflix")) {
    const item = KNOWN_LOGOS.netflix;
    return { name: appName || "Netflix", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "bell" };
  }
  if (haystack.includes("apple music") || haystack.includes("itunes")) {
    const item = KNOWN_LOGOS["apple-music"];
    return { name: appName || "Apple Music", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "bell" };
  }
  if (haystack.includes("gili") || haystack.includes("island") || haystack.includes("notch") || haystack.includes("sistem") || haystack.includes("system")) {
    const item = KNOWN_LOGOS.gili;
    return { name: appName || "Gili Island", logoUrl: item.logoUrl, color: item.color, bgBoxClass: item.bgBoxClass, fallbackGlyph: "bell" };
  }

  // 4. Fallback system icons (clipboard, battery, volume, reminder, etc.)
  if (normType === "clipboard") {
    return { name: appName || "Clipboard", color: "#0A84FF", bgBoxClass: "bg-[#0A84FF]/15 text-[#0A84FF]", fallbackGlyph: "clipboard" };
  }
  if (normType === "battery") {
    return { name: appName || "Battery", color: "#34C759", bgBoxClass: "bg-[#34C759]/15 text-[#34C759]", fallbackGlyph: "battery" };
  }
  if (normType === "volume") {
    return { name: appName || "Volume", color: "#0A84FF", bgBoxClass: "bg-[#0A84FF]/15 text-[#0A84FF]", fallbackGlyph: "volume" };
  }
  if (normType === "sun" || normType === "brightness") {
    return { name: appName || "Brightness", color: "#FF9500", bgBoxClass: "bg-[#FF9500]/15 text-[#FF9500]", fallbackGlyph: "sun" };
  }
  if (normType === "reminder" || normName.includes("pengingat") || normName.includes("todo") || normName.includes("reminder") || normName.includes("pomodoro")) {
    return { name: appName || "Pengingat", color: "#FF9F0A", bgBoxClass: "bg-[#FF9F0A]/15 text-[#FF9F0A]", fallbackGlyph: "reminder" };
  }

  // Default fallback
  return {
    name: appName || "Notifikasi",
    color: "#3882F6",
    bgBoxClass: "bg-[#3882F6]/15 text-[#8db8ff]",
    fallbackGlyph: normType || "bell",
  };
}
