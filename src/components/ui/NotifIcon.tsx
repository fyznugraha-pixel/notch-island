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
  MessageSquare,
  Monitor,
} from "lucide-react";
import { resolveAppLogo } from "../../utils/appLogoResolver";

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

export function getNotifBoxStyle(type?: string, appName?: string): string {
  const logoInfo = resolveAppLogo(appName, type);
  return logoInfo.bgBoxClass;
}

export const NotifGlyph: React.FC<{
  type?: string;
  appName?: string;
  size?: number;
  isUrl?: boolean;
}> = ({ type, appName, size = 20, isUrl = false }) => {
  const logoInfo = resolveAppLogo(appName, type);

  // If a brand logo is available from /logo/ or /gili-icons/, prioritize rendering it
  if (logoInfo.logoUrl) {
    return (
      <img
        src={logoInfo.logoUrl}
        alt={logoInfo.name}
        style={{ width: size, height: size }}
        className="object-contain drop-shadow-sm"
        loading="lazy"
      />
    );
  }

  // Fallback to system / utility glyphs
  const glyph = logoInfo.fallbackGlyph || type;

  if (glyph === "clipboard") {
    return isUrl ? <Link2 size={size} strokeWidth={2} /> : <Clipboard size={size} strokeWidth={2} />;
  }
  if (glyph === "usb") return <Usb size={size} strokeWidth={2} />;
  if (glyph === "headphones") return <Headphones size={size} strokeWidth={2} />;
  if (glyph === "bluetooth") return <Bluetooth size={size} strokeWidth={2} />;
  if (glyph === "wifi") return <Wifi size={size} strokeWidth={2} />;
  if (glyph === "coffee") return <Coffee size={size} strokeWidth={2.1} />;
  if (glyph === "heart") return <Heart size={size} strokeWidth={2.1} />;
  if (glyph === "battery") return <Zap size={size} strokeWidth={2.1} />;
  if (glyph === "volume") return <Volume2 size={size} strokeWidth={2.1} />;
  if (glyph === "sun" || glyph === "brightness") return <Sun size={size} strokeWidth={2.1} />;
  if (glyph === "moon") return <Moon size={size} strokeWidth={2.1} />;
  if (glyph === "update") return <ArrowUpCircle size={size} strokeWidth={2.1} />;
  if (glyph === "capslock") return <Type size={size} strokeWidth={2.1} />;
  if (glyph === "message") return <MessageSquare size={size} strokeWidth={2} />;
  if (glyph === "mail") return <Mail size={size} strokeWidth={2} />;
  if (glyph === "monitor") return <Monitor size={size} strokeWidth={2} />;

  return <Bell size={size} strokeWidth={2} />;
};

export const NotifIcon: React.FC<{
  type?: string;
  appName?: string;
  size?: number;
  boxClassName?: string;
  isUrl?: boolean;
}> = ({ type, appName, size = 18, boxClassName = "w-8 h-8 rounded-[10px]", isUrl = false }) => {
  const logoInfo = resolveAppLogo(appName, type);

  return (
    <div
      className={`flex items-center justify-center shrink-0 ${boxClassName} ${logoInfo.bgBoxClass}`}
    >
      <NotifGlyph type={type} appName={appName} size={size} isUrl={isUrl} />
    </div>
  );
};
