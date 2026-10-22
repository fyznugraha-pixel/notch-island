import { Sun, Cloud, CloudRain, CloudLightning, Snowflake, Bell, Zap, Volume2, Clipboard, Type, Mail, Usb, Headphones, ArrowUpCircle } from "lucide-react";
import { SiWhatsapp, SiTelegram, SiYoutube } from "@icons-pack/react-simple-icons";

export function getWeatherIcon(code: number) {
  if (code === 0 || code === 1) return <Sun size={10} className="text-[#ff9500] shrink-0" />;
  if (code === 2 || code === 3 || code === 45 || code === 48) return <Cloud size={10} className="text-gray-400 shrink-0" />;
  if (code >= 51 && code <= 67) return <CloudRain size={10} className="text-blue-400 shrink-0" />;
  if (code >= 71 && code <= 82) return <Snowflake size={10} className="text-sky-300 shrink-0" />;
  if (code >= 95) return <CloudLightning size={10} className="text-purple-400 shrink-0" />;
  return <Sun size={10} className="text-[#ff9500] shrink-0" />;
}

export const NotifIcon = ({ type }: { type?: string }) => {
  if (type === "usb") {
    return (
      <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-teal-500/20 rounded-full">
        <Usb size={16} className="text-teal-400" />
      </div>
    );
  }
  if (type === "headphones") {
    return (
      <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-indigo-500/20 rounded-full">
        <Headphones size={16} className="text-indigo-400" />
      </div>
    );
  }
  if (type === "whatsapp") return <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-[#25D366]/20 rounded-full"><SiWhatsapp size={16} color="#25D366" /></div>;
  if (type === "telegram") return <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-[#26A5E4]/20 rounded-full"><SiTelegram size={16} color="#26A5E4" /></div>;
  if (type === "discord") return (
    <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-[#5865F2]/20 p-1">
      <img src="/logo/discord.webp" alt="Discord" className="w-full h-full object-contain" />
    </div>
  );
  if (type === "mail") return <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-red-500/20 rounded-full"><Mail size={16} className="text-red-400" /></div>;
  if (type === "instagram") return (
    <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-[#E4405F]/20 p-1">
      <img src="/logo/Instagram_icon.png" alt="Instagram" className="w-full h-full object-contain" />
    </div>
  );
  if (type === "threads") return (
    <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-black/40 p-1">
      <img src="/logo/threads.png" alt="Threads" className="w-full h-full object-contain" />
    </div>
  );
  if (type === "tiktok") return (
    <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-black/40 p-1">
      <img src="/logo/tiktok.webp" alt="TikTok" className="w-full h-full object-contain" />
    </div>
  );
  if (type === "netflix") return (
    <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-black p-1">
      <img src="/logo/Netflix_icon.svg.webp" alt="Netflix" className="w-full h-full object-contain" />
    </div>
  );
  if (type === "reddit") return (
    <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-[#FF4500]/20 p-1">
      <img src="/logo/reddit.png" alt="Reddit" className="w-full h-full object-contain" />
    </div>
  );
  if (type === "vlc") return (
    <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-[#E57E24]/20 p-1">
      <img src="/logo/vlc.png" alt="VLC" className="w-full h-full object-contain" />
    </div>
  );
  if (type === "windows-media-player") return (
    <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-white/10 p-1">
      <img src="/logo/windows-media-player.png" alt="Windows Media Player" className="w-full h-full object-contain" />
    </div>
  );
  if (type === "youtube") return <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-[#FF0000]/20 rounded-full"><SiYoutube size={16} color="#FF0000" /></div>;
  if (type === "x" || type === "twitter") return (
    <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-black/40 p-1.5">
      <img src="/logo/x.webp" alt="X" className="w-full h-full object-contain" />
    </div>
  );
  if (type === "slack") return <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-[#4A154B]/20 rounded-full"><Mail size={16} className="text-purple-400" /></div>;
  if (type === "battery") {
    return (
      <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-green-500/20 rounded-full">
        <Zap size={16} className="text-green-400" />
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
  if (type === "sun" || type === "brightness") {
    return (
      <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-amber-500/20 rounded-full">
        <Sun size={16} className="text-amber-400" />
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
  if (type === "update") {
    return (
      <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-blue-500/20 rounded-full">
        <ArrowUpCircle size={16} className="text-[#0a84ff]" />
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
