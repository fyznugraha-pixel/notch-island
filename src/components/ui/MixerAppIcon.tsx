import React from "react";
import { Globe, AppWindow } from "lucide-react";
import { useAppIcon } from "../../hooks/useAppIcon";

const getFallbackIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("discord")) {
    return <img src="/logo/discord.webp" alt="Discord" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("spotify")) {
    return <img src="/logo/spotify.png" alt="Spotify" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("apple") || lower.includes("itunes")) {
    return <img src="/logo/apple-music.png" alt="Apple Music" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("netflix")) {
    return <img src="/logo/Netflix_icon.svg.webp" alt="Netflix" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("tiktok")) {
    return <img src="/logo/tiktok.webp" alt="TikTok" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("instagram")) {
    return <img src="/logo/Instagram_icon.png" alt="Instagram" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("threads")) {
    return <img src="/logo/threads.png" alt="Threads" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("vlc")) {
    return <img src="/logo/vlc.png" alt="VLC" className="w-4 h-4 object-contain" />;
  }
  if (lower.includes("wmplayer") || lower.includes("zune")) {
    return <img src="/logo/windows-media-player.png" alt="WMP" className="w-4 h-4 object-contain" />;
  }
  if (
    lower.includes("edge") ||
    lower.includes("chrome") ||
    lower.includes("firefox") ||
    lower.includes("brave") ||
    lower.includes("opera") ||
    lower.includes("arc")
  ) {
    return <Globe size={16} className="text-[#0a84ff]" />;
  }
  return <AppWindow size={16} className="text-neutral-300" />;
};

interface MixerAppIconProps {
  name: string;
  exePath?: string | null;
}

export const MixerAppIcon: React.FC<MixerAppIconProps> = ({ name, exePath }) => {
  const iconUrl = useAppIcon(exePath);
  if (!iconUrl) return getFallbackIcon(name);
  return <img src={iconUrl} alt={name} draggable={false} className="w-[20px] h-[20px] object-contain" />;
};

