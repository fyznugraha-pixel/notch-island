import React from "react";

export interface MiniPlayerBackgroundProps {
  thumbnail?: string | null;
  tintColor?: string;
  theme?: "solid" | "liquid";
}

export const MiniPlayerBackground: React.FC<MiniPlayerBackgroundProps> = ({
  thumbnail,
  tintColor,
  theme = "solid",
}) => {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none select-none overflow-hidden rounded-[inherit] -z-10"
    >
      {/* Base deep background */}
      <div
        className="absolute inset-0 transition-colors duration-500"
        style={{
          background:
            theme === "solid"
              ? `linear-gradient(135deg, ${tintColor ? tintColor + "66" : "#241820"} 0%, #0c0c10 100%)`
              : "rgba(16, 16, 22, 0.75)",
        }}
      />

      {/* Blurred Album Artwork Layer */}
      {thumbnail && (
        <div className="absolute -inset-10 overflow-hidden">
          <img
            src={thumbnail}
            alt=""
            className="w-full h-full object-cover scale-125 filter blur-[40px] saturate-[180%] brightness-[0.45] transition-all duration-700 ease-out"
          />
        </div>
      )}

      {/* Subtle tint overlay to blend artwork with extracted dominant color */}
      {tintColor && thumbnail && (
        <div
          className="absolute inset-0 mix-blend-color opacity-30 transition-colors duration-700"
          style={{ backgroundColor: tintColor }}
        />
      )}

      {/* Vignette & Contrast Overlay for maximum lyrics legibility */}
      <div
        className="absolute inset-0"
        style={{
          background: thumbnail
            ? "radial-gradient(ellipse at 50% 20%, rgba(0, 0, 0, 0.2) 0%, rgba(8, 8, 12, 0.65) 60%, rgba(6, 6, 8, 0.88) 100%)"
            : undefined,
        }}
      />

      {/* Subtle top ambient sheen */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] via-transparent to-black/35" />
    </div>
  );
};
