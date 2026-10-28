import { useState, useEffect } from "react";
import { Film, Music } from "lucide-react";
import { WhatsAppIcon } from "./WhatsAppIcon";

import { MediaPayload } from "../../types";
import {
  getBrandedMediaType,
  getResolvedArtworkUrl,
  fetchHighResArtwork,
  subscribeArtworkUpdates,
  invalidateCachedArtwork,
  getArtworkCacheKey,
  markArtworkUrlFailed,
  isArtworkUrlFailed,
} from "../../services/artworkService";
import { getMediaBranding } from "../../utils/playerBranding";

export function useResolvedThumbnail(media: MediaPayload | null | undefined): string | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    return subscribeArtworkUpdates(() => {
      setTick((t) => t + 1);
    });
  }, []);

  return getResolvedArtworkUrl(media, false);
}

function renderPlayerFallback(media: MediaPayload, iconSize: number) {
  const branding = getMediaBranding(media);

  if (branding.imageSrc) {
    return (
      <div
        className="w-full h-full flex items-center justify-center p-2 select-none"
        style={{ backgroundColor: branding.color }}
      >
        <img
          src={branding.imageSrc}
          alt={branding.name}
          className="w-full h-full object-contain select-none pointer-events-none"
        />
      </div>
    );
  }

  if (media.playback_type === 2) {
    return (
      <div className="w-full h-full bg-neutral-900 flex items-center justify-center select-none">
        <Film size={iconSize} className="text-blue-400" />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-neutral-800/80 flex items-center justify-center select-none">
      <Music size={iconSize} className="text-sky-400 [html.light_&]:text-sky-600" />
    </div>
  );
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
  }, [media.title, media.artist, media.app_id, thumbError]);

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

  if (currentThumb && !isArtworkUrlFailed(currentThumb)) {
    return (
      <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
        <img
          key={currentThumb}
          src={currentThumb}
          alt={media.title || "Album Art"}
          className="w-full h-full object-cover select-none pointer-events-none"
          onError={() => {
            if (currentThumb === media.thumbnail) {
              setThumbError(true);
            } else {
              markArtworkUrlFailed(currentThumb);
              const key = getArtworkCacheKey(media);
              invalidateCachedArtwork(key);
            }
          }}
        />
      </div>
    );
  }

  return renderPlayerFallback(media, iconSize);
};
