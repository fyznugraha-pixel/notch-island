import React from "react";
import {
  Sun,
  Moon,
  Cloud,
  CloudRain,
  CloudLightning,
  Snowflake,
  Bell,
  Zap,
  Volume2,
  Clipboard,
  Link2,
  Type,
  Mail,
  Usb,
  Headphones,
  ArrowUpCircle,
  Wifi,
  Bluetooth,
  Coffee,
  Heart,
} from "lucide-react";
import { SiWhatsapp, SiTelegram, SiYoutube } from "@icons-pack/react-simple-icons";

export function getWeatherIcon(code: number) {
  if (code === 0 || code === 1) return <Sun size={10} className="text-[#ff9500] shrink-0" />;
  if (code === 2 || code === 3 || code === 45 || code === 48) return <Cloud size={10} className="text-gray-400 shrink-0" />;
  // WMO 80-82 adalah Rain Showers (hujan lebat / deras tropis), bukan salju
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain size={10} className="text-blue-400 shrink-0" />;
  // WMO 71-77, 85, 86 adalah Salju sebenarnya
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <Snowflake size={10} className="text-sky-300 shrink-0" />;
  if (code >= 95) return <CloudLightning size={10} className="text-purple-400 shrink-0" />;
  return <Sun size={10} className="text-[#ff9500] shrink-0" />;
}

export function getNotifBoxStyle(type?: string): string {
  switch (type) {
    case "whatsapp":
      return "bg-[#34c3a0]/18 text-[#5eead4]";
    case "discord":
    case "capslock":
    case "slack":
      return "bg-[#a78bfa]/18 text-[#c4b5fd]";
    case "battery":
      return "bg-[#34c759]/18 text-[#34c759]";
    case "sun":
    case "brightness":
      return "bg-[#fbbf24]/18 text-[#fbbf24]";
    case "usb":
      return "bg-[#5eead4]/18 text-[#5eead4]";
    case "coffee":
      return "bg-[#ff9500]/18 text-[#ff9500]";
    case "heart":
      return "bg-[#ff2d55]/18 text-[#ff2d55]";
    case "spotify":
      return "bg-[#1db954]/18 text-[#1db954]";
    case "apple-music":
      return "bg-[#fa243c]/18 text-[#fa243c]";
    case "youtube-music":
      return "bg-[#ff0000]/18 text-[#ff0000]";
    case "youtube":
    case "netflix":
      return "bg-[#ff8a7a]/18 text-[#ff9b8f]";
    case "mail":
    case "telegram":
    case "clipboard":
    case "volume":
    case "bluetooth":
    case "headphones":
    case "wifi":
    case "update":
    default:
      return "bg-[#3882F6]/18 text-[#8db8ff]";
  }
}

export const NotifGlyph: React.FC<{
  type?: string;
  size?: number;
  isUrl?: boolean;
}> = ({ type, size = 20, isUrl = false }) => {
  if (type === "clipboard") {
    return isUrl ? <Link2 size={size} strokeWidth={2} /> : <Clipboard size={size} strokeWidth={2} />;
  }
  if (type === "usb") return <Usb size={size} strokeWidth={2} />;
  if (type === "headphones") return <Headphones size={size} strokeWidth={2} />;
  if (type === "bluetooth") return <Bluetooth size={size} strokeWidth={2} />;
  if (type === "wifi") return <Wifi size={size} strokeWidth={2} />;
  if (type === "coffee") return <Coffee size={size} strokeWidth={2.1} />;
  if (type === "heart") return <Heart size={size} strokeWidth={2.1} />;
  if (type === "spotify") {
    return <img src="/logo/spotify.png" alt="Spotify" style={{ width: size, height: size }} className="object-contain" />;
  }
  if (type === "apple-music") {
    return <img src="/logo/apple-music.png" alt="Apple Music" style={{ width: size, height: size }} className="object-contain" />;
  }
  if (type === "youtube-music") {
    return <img src="/logo/youtube-music.png" alt="YouTube Music" style={{ width: size, height: size }} className="object-contain" />;
  }
  if (type === "whatsapp") return <SiWhatsapp size={size} color="#5eead4" />;
  if (type === "telegram") return <SiTelegram size={size} color="#38bdf8" />;
  if (type === "youtube") return <SiYoutube size={size} color="#ff8a7a" />;
  if (type === "discord") {
    return <img src="/logo/discord.webp" alt="Discord" style={{ width: size, height: size }} className="object-contain" />;
  }
  if (type === "mail") return <Mail size={size} strokeWidth={2} />;
  if (type === "instagram") {
    return <img src="/logo/Instagram_icon.png" alt="Instagram" style={{ width: size, height: size }} className="object-contain" />;
  }
  if (type === "threads") {
    return <img src="/logo/threads.png" alt="Threads" style={{ width: size, height: size }} className="object-contain" />;
  }
  if (type === "tiktok") {
    return <img src="/logo/tiktok.webp" alt="TikTok" style={{ width: size, height: size }} className="object-contain" />;
  }
  if (type === "netflix") {
    return <img src="/logo/Netflix_icon.svg.webp" alt="Netflix" style={{ width: size, height: size }} className="object-contain" />;
  }
  if (type === "reddit") {
    return <img src="/logo/reddit.png" alt="Reddit" style={{ width: size, height: size }} className="object-contain" />;
  }
  if (type === "vlc") {
    return <img src="/logo/vlc.png" alt="VLC" style={{ width: size, height: size }} className="object-contain" />;
  }
  if (type === "windows-media-player") {
    return <img src="/logo/windows-media-player.png" alt="Windows Media Player" style={{ width: size, height: size }} className="object-contain" />;
  }
  if (type === "x" || type === "twitter") {
    return <img src="/logo/x.webp" alt="X" style={{ width: size - 2, height: size - 2 }} className="object-contain" />;
  }
  if (type === "slack") return <Mail size={size} strokeWidth={2} />;
  if (type === "battery") return <Zap size={size} strokeWidth={2.1} />;
  if (type === "volume") return <Volume2 size={size} strokeWidth={2.1} />;
  if (type === "sun" || type === "brightness") return <Sun size={size} strokeWidth={2.1} />;
  if (type === "moon") return <Moon size={size} strokeWidth={2.1} />;
  if (type === "update") return <ArrowUpCircle size={size} strokeWidth={2.1} />;
  if (type === "capslock") return <Type size={size} strokeWidth={2.1} />;
  return <Bell size={size} strokeWidth={2} />;
};

export const NotifIcon: React.FC<{
  type?: string;
  size?: number;
  boxClassName?: string;
  isUrl?: boolean;
}> = ({ type, size = 18, boxClassName = "w-8 h-8 rounded-[10px]", isUrl = false }) => {
  return (
    <div
      className={`flex items-center justify-center shrink-0 ${boxClassName} ${getNotifBoxStyle(
        type
      )}`}
    >
      <NotifGlyph type={type} size={size} isUrl={isUrl} />
    </div>
  );
};
