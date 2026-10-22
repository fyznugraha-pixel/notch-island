import { useState, useEffect } from "react";
import { Film, Music } from "lucide-react";
import { WhatsAppIcon } from "./WhatsAppIcon";

import { MediaPayload } from "../../types";
import {
  getBrandedMediaType,
  getResolvedArtworkUrl,
  fetchHighResArtwork,
  subscribeArtworkUpdates,
} from "../../services/artworkService";

export function useResolvedThumbnail(media: MediaPayload | null | undefined): string | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    return subscribeArtworkUpdates(() => {
      setTick((t) => t + 1);
    });
  }, []);

  return getResolvedArtworkUrl(media, false);
}

export const MediaThumbnail = ({
  media,
  size = "normal",
}: {
  media: MediaPayload;
  size?: "normal" | "large";
}) => {
  const [thumbError, setThumbError] = useState(false);
  const [, setTick] = useState(0);
  const isLarge = size === "large";
  const iconSize = isLarge ? 28 : 20;

  useEffect(() => {
    setThumbError(false);
  }, [media.thumbnail, media.title, media.artist]);

  // Subscribe to background artwork resolution events
  useEffect(() => {
    return subscribeArtworkUpdates(() => {
      setTick((t) => t + 1);
    });
  }, []);

  // Proactively fetch high-res artwork for music tracks
  useEffect(() => {
    if (!media.title || media.title.trim() === "") return;
    fetchHighResArtwork(media);
  }, [media.title, media.artist, media.app_id]);

  const brandedType = getBrandedMediaType(media);

  if (brandedType === "whatsapp") {
    return <WhatsAppIcon size={iconSize} />;
  }

  if (brandedType === "netflix") {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <img src="/logo/Netflix_icon.svg.webp" alt="Netflix" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (brandedType === "tiktok") {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <img src="/logo/tiktok.webp" alt="TikTok" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (brandedType === "instagram") {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <img src="/logo/Instagram_icon.png" alt="Instagram" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (brandedType === "threads") {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <img src="/logo/threads.png" alt="Threads" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (brandedType === "x") {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <img src="/logo/x.webp" alt="X" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (brandedType === "discord") {
    return (
      <div className="w-full h-full bg-[#5865F2] flex items-center justify-center">
        <img src="/logo/discord.webp" alt="Discord" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (brandedType === "reddit") {
    return (
      <div className="w-full h-full bg-[#FF4500] flex items-center justify-center">
        <img src="/logo/reddit.png" alt="Reddit" className="w-full h-full object-cover" />
      </div>
    );
  }

  const currentThumb = getResolvedArtworkUrl(media, thumbError);

  if (currentThumb) {
    return (
      <img
        key={currentThumb}
        src={currentThumb}
        alt="Album Art"
        className="w-full h-full object-cover"
        onError={() => setThumbError(true)}
      />
    );
  }

  // Fallbacks for specific media players when no cover art is found
  const appId = (media.app_id || "").toLowerCase();
  const artist = (media.artist || "").toLowerCase();
  const isVLC = appId.includes("vlc") || artist.includes("vlc");
  const isWMP =
    appId.includes("wmplayer") ||
    appId.includes("zune") ||
    artist.includes("windows media player") ||
    artist.includes("media player");

  if (isVLC) {
    return (
      <div className="w-full h-full bg-[#E57E24] flex items-center justify-center">
        <img src="/logo/vlc.png" alt="VLC" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (isWMP) {
    return (
      <div className="w-full h-full bg-neutral-900 flex items-center justify-center p-1">
        <img src="/logo/windows-media-player.png" alt="Windows Media Player" className="w-full h-full object-contain" />
      </div>
    );
  }

  if (media.playback_type === 2) {
    return <Film size={iconSize} className="text-blue-400" />;
  }

  return <Music size={iconSize} className="text-sky-400 [html.light_&]:text-sky-600" />;
};
