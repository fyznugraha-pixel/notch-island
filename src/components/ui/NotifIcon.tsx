import { Sun, Cloud, CloudRain, CloudLightning, Snowflake, Bell, Zap, Moon, Volume2, Clipboard, Type, Mail } from "lucide-react";
import { SiWhatsapp, SiTelegram, SiDiscord, SiInstagram, SiYoutube, SiX } from "@icons-pack/react-simple-icons";

export function getWeatherIcon(code: number) {
  if (code === 0 || code === 1) return <Sun size={10} className="text-yellow-400" />;
  if (code === 2 || code === 3 || code === 45 || code === 48) return <Cloud size={10} className="text-gray-300" />;
  if (code >= 51 && code <= 67) return <CloudRain size={10} className="text-blue-400" />;
  if (code >= 71 && code <= 82) return <Snowflake size={10} className="text-white" />;
  if (code >= 95) return <CloudLightning size={10} className="text-purple-400" />;
  return <Sun size={10} className="text-yellow-400" />;
}

export const NotifIcon = ({ type }: { type?: string }) => {
  if (type === "whatsapp") return <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-[#25D366]/20 rounded-full"><SiWhatsapp size={16} color="#25D366" /></div>;
  if (type === "telegram") return <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-[#26A5E4]/20 rounded-full"><SiTelegram size={16} color="#26A5E4" /></div>;
  if (type === "discord") return <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-[#5865F2]/20 rounded-full"><SiDiscord size={16} color="#5865F2" /></div>;
  if (type === "mail") return <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-red-500/20 rounded-full"><Mail size={16} className="text-red-400" /></div>;
  if (type === "instagram") return <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-[#E4405F]/20 rounded-full"><SiInstagram size={16} color="#E4405F" /></div>;
  if (type === "youtube") return <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-[#FF0000]/20 rounded-full"><SiYoutube size={16} color="#FF0000" /></div>;
  if (type === "x") return <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-white/20 rounded-full"><SiX size={14} color="#FFFFFF" /></div>;
  if (type === "slack") return <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-[#4A154B]/20 rounded-full"><Mail size={16} className="text-purple-400" /></div>;
  if (type === "battery") {
    return (
      <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-green-500/20 rounded-full">
        <Zap size={16} className="text-green-400" />
      </div>
    );
  }
  if (type === "sun") {
    return (
      <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-yellow-500/20 rounded-full">
        <Sun size={16} className="text-yellow-400" />
      </div>
    );
  }
  if (type === "moon") {
    return (
      <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-indigo-500/20 rounded-full">
        <Moon size={16} className="text-indigo-400" />
      </div>
    );
  }
  if (type === "volume") {
    return (
      <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-gray-500/20 rounded-full">
        <Volume2 size={16} className="text-gray-300" />
      </div>
    );
  }
  if (type === "clipboard") {
    return (
      <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-blue-500/20 rounded-full">
        <Clipboard size={16} className="text-blue-400" />
      </div>
    );
  }
  if (type === "capslock") {
    return (
      <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-purple-500/20 rounded-full">
        <Type size={16} className="text-purple-400" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-blue-500/20 rounded-full">
      <Bell size={16} className="text-blue-400" />
    </div>
  );
};
