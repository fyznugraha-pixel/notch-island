import React, { useEffect, useState } from "react";
import { Globe, AppWindow } from "lucide-react";
import { useAppIcon } from "../../hooks/useAppIcon";
import { normalizeIconUrl } from "../navbar/groups/macosIconMap";

const getFallbackIcon = (name: string, size: number) => {
  const lower = name.toLowerCase();
  const imgStyle = { width: size, height: size };

  if (lower.includes("discord")) {
    return <img src="/logo/discord.webp" alt="Discord" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("spotify")) {
    return <img src="/logo/spotify.png" alt="Spotify" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("apple") || lower.includes("itunes")) {
    return <img src="/logo/apple-music.png" alt="Apple Music" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("netflix")) {
    return <img src="/logo/Netflix_icon.svg.webp" alt="Netflix" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("tiktok")) {
    return <img src="/logo/tiktok.webp" alt="TikTok" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("instagram")) {
    return <img src="/logo/Instagram_icon.png" alt="Instagram" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("threads")) {
    return <img src="/logo/threads.png" alt="Threads" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("vlc")) {
    return <img src="/logo/vlc.png" alt="VLC" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("wmplayer") || lower.includes("zune")) {
    return <img src="/logo/windows-media-player.png" alt="WMP" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("chrome")) {
    return <img src="/logo/chrome.png" alt="Chrome" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("brave")) {
    return <img src="/logo/brave.png" alt="Brave" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("edge")) {
    return <img src="/logo/edge.png" alt="Microsoft Edge" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("firefox")) {
    return <img src="/logo/firefox.png" alt="Firefox" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("whatsapp")) {
    return <img src="/logo/whatsapp.svg" alt="WhatsApp" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("telegram")) {
    return <img src="/logo/telegram.svg" alt="Telegram" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("youtube")) {
    const src = lower.includes("music") ? "/logo/youtube-music.png" : "/logo/youtube.png";
    return <img src={src} alt="YouTube" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("gili")) {
    return <img src="/logo/LOGO-GILI.png" alt="Gili" style={imgStyle} className="object-contain" draggable={false} />;
  }
  if (lower.includes("opera") || lower.includes("arc") || lower.includes("vivaldi")) {
    return <Globe size={Math.max(13, size - 2)} className="text-[#0a84ff]" />;
  }
  return <AppWindow size={Math.max(13, size - 2)} className="text-neutral-300" />;
};

interface MixerAppIconProps {
  name: string;
  exePath?: string | null;
  icon?: string | null;
  size?: number;
  className?: string;
}

export const MixerAppIcon: React.FC<MixerAppIconProps> = ({
  name,
  exePath,
  icon,
  size = 20,
  className = "",
}) => {
  const inlineIconUrl = normalizeIconUrl(icon);
  const extractedIconUrl = useAppIcon(inlineIconUrl ? null : exePath);
  const resolvedSrc = inlineIconUrl ?? extractedIconUrl;
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [resolvedSrc]);

  if (!resolvedSrc || imgFailed) {
    return getFallbackIcon(name, size);
  }
  return (
    <img
      src={resolvedSrc}
      alt={name}
      draggable={false}
      style={{ width: size, height: size }}
      className={`object-contain ${className}`.trim()}
      onError={() => setImgFailed(true)}
    />
  );
};

