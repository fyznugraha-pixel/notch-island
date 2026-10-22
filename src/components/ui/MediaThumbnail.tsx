import { useState, useEffect } from "react";
import { Film, Music } from "lucide-react";
import { WhatsAppIcon } from "./WhatsAppIcon";

import { MediaPayload } from "../../types";
import { cleanTitle, cleanArtist } from "../../services/lyricsService";

const artworkCache = new Map<string, string | null>();
const artworkListeners = new Set<() => void>();

function setArtworkCache(key: string, value: string | null) {
  if (artworkCache.size >= 50 && !artworkCache.has(key)) {
    const oldestKey = artworkCache.keys().next().value;
    if (oldestKey !== undefined) {
      artworkCache.delete(oldestKey);
    }
  }
  artworkCache.set(key, value);
}

function notifyArtworkListeners() {
  artworkListeners.forEach((fn) => fn());
}

export function useResolvedThumbnail(media: MediaPayload | null | undefined): string | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    artworkListeners.add(listener);
    return () => {
      artworkListeners.delete(listener);
    };
  }, []);
  if (!media) return null;
  if (media.thumbnail) return media.thumbnail;
  const cacheKey = `${media.artist || ""} - ${media.title || ""}`.trim().toLowerCase();
  return cacheKey ? (artworkCache.get(cacheKey) ?? null) : null;
}

export const MediaThumbnail = ({
  media,
  size = "normal",
}: {
  media: MediaPayload;
  size?: "normal" | "large";
}) => {
  const [thumbError, setThumbError] = useState(false);
  const [fallbackEntry, setFallbackEntry] = useState<{ key: string; url: string } | null>(null);
  const isLarge = size === "large";
  const iconSize = isLarge ? 28 : 20;

  const title = (media.title || "").toLowerCase();
  const artist = (media.artist || "").toLowerCase();
  const cacheKey = `${media.artist || ""} - ${media.title || ""}`.trim().toLowerCase();

  useEffect(() => {
    setThumbError(false);
  }, [media.thumbnail, media.title, media.artist]);

  const isWhatsApp = title.includes("whatsapp") || artist.includes("whatsapp");
  const isNetflix = title.includes("netflix") || artist.includes("netflix");
  const isTikTok = title.includes("tiktok") || title.includes("tik tok") || artist.includes("tiktok") || artist.includes("tik tok");
  const isInstagram = title.includes("instagram") || artist.includes("instagram");
  const isThreads = title.includes("threads") || artist.includes("threads");
  const isX = title.includes("twitter") || artist.includes("twitter") || artist === "x" || title.endsWith(" / x") || title.endsWith(" | x") || title.includes("on x:") || title.includes("on x ");
  const isDiscord = title.includes("discord") || artist.includes("discord");
  const isReddit = title.includes("reddit") || artist.includes("reddit") || title.includes("r/");
  const isVLC = title.includes("vlc") || artist.includes("vlc");
  const isWMP = title.includes("windows media player") || artist.includes("windows media player") || title.includes("media player") || artist.includes("media player");

  // If no SMTC thumbnail is provided or it failed to load, automatically fetch high-res cover art from iTunes CDN
  useEffect(() => {
    if (!cacheKey || !media.title || media.title.trim() === "") {
      setFallbackEntry(null);
      return;
    }

    if (media.thumbnail && !thumbError) {
      setFallbackEntry(null);
      return;
    }

    if (artworkCache.has(cacheKey)) {
      const cached = artworkCache.get(cacheKey);
      setFallbackEntry(cached ? { key: cacheKey, url: cached } : null);
      return;
    }

    // Skip apps that have dedicated branded icons
    if (
      title.includes("whatsapp") ||
      title.includes("netflix") ||
      title.includes("tiktok") ||
      title.includes("instagram") ||
      title.includes("threads") ||
      title.includes("twitter") ||
      artist === "x" ||
      title.includes("discord") ||
      title.includes("reddit") ||
      title.includes("vlc") ||
      title.includes("windows media player")
    ) {
      setFallbackEntry(null);
      return;
    }

    let isMounted = true;
    const cleanedArtist = cleanArtist(media.artist || "");
    const query = `${cleanedArtist ? cleanedArtist + " " : ""}${cleanTitle(media.title)}`;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;

    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted) return;
        const item = data?.results?.[0];
        if (item?.artworkUrl100) {
          const highRes = item.artworkUrl100.replace("100x100bb", "600x600bb");
          setArtworkCache(cacheKey, highRes);
          notifyArtworkListeners();
          setFallbackEntry({ key: cacheKey, url: highRes });
        } else {
          if (data && data.resultCount === 0) {
            setArtworkCache(cacheKey, null);
          }
          setFallbackEntry(null);
        }
      })
      .catch(() => {
        if (isMounted) setFallbackEntry(null);
      });

    return () => {
      isMounted = false;
    };
  }, [cacheKey, media.thumbnail, media.title, media.artist, thumbError, title, artist]);

  if (isWhatsApp) {
    return <WhatsAppIcon size={iconSize} />;
  }

  if (isNetflix) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <img src="/logo/Netflix_icon.svg.webp" alt="Netflix" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (isTikTok) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <img src="/logo/tiktok.webp" alt="TikTok" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (isInstagram) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <img src="/logo/Instagram_icon.png" alt="Instagram" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (isThreads) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <img src="/logo/threads.png" alt="Threads" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (isX) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <img src="/logo/x.webp" alt="X" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (isDiscord) {
    return (
      <div className="w-full h-full bg-[#5865F2] flex items-center justify-center">
        <img src="/logo/discord.webp" alt="Discord" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (isReddit) {
    return (
      <div className="w-full h-full bg-[#FF4500] flex items-center justify-center">
        <img src="/logo/reddit.png" alt="Reddit" className="w-full h-full object-cover" />
      </div>
    );
  }

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

  const cachedArtwork = cacheKey ? artworkCache.get(cacheKey) : null;
  const activeFallback = (fallbackEntry?.key === cacheKey ? fallbackEntry.url : null) || cachedArtwork || null;
  const currentThumb = (media.thumbnail && !thumbError)
    ? media.thumbnail
    : activeFallback;

  if (currentThumb) {
    return (
      <img
        key={currentThumb}
        src={currentThumb}
        alt="Album Art"
        className="w-full h-full object-cover"
        onError={() => {
          if (currentThumb === media.thumbnail) {
            setThumbError(true);
          } else {
            if (cacheKey) artworkCache.set(cacheKey, null);
            setFallbackEntry(null);
          }
        }}
      />
    );
  }

  if (media.playback_type === 2) {
    return <Film size={iconSize} className="text-blue-400" />;
  }

  return <Music size={iconSize} className="text-sky-400 [html.light_&]:text-sky-600" />;
};
