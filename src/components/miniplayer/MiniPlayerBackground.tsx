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
      {/* 1. Base deep foundation matching NotchSurface baseFill */}
      <div
        className="absolute inset-0 transition-colors duration-500"
        style={{
          background: theme === "liquid" ? "rgba(10, 10, 14, 0.72)" : "#050508",
        }}
      />

      {/* 2. Dynamic Blurred Album Artwork Layer matching Notch ambient blur (34px blur, 185% saturation, 0.50 opacity) */}
      {thumbnail && (
        <div className="absolute -inset-8 overflow-hidden pointer-events-none">
          <img
            src={thumbnail}
            alt=""
            className="w-full h-full object-cover scale-135 filter blur-[34px] saturate-[185%] opacity-50 transition-opacity duration-500 ease-out"
          />
        </div>
      )}

      {/* 3. Ambient Dominant Tint Bloom (soft radial glow matching Now Playing card) */}
      {tintColor && (
        <div
          className="absolute inset-0 transition-opacity duration-700"
          style={{
            background: `radial-gradient(ellipse at 25% 15%, ${tintColor}55 0%, ${tintColor}22 45%, transparent 75%)`,
          }}
        />
      )}

      {/* 4. Balanced soft readability gradient (keeps lyrics legible without crushing the vibrant artwork) */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/55" />

      {/* 5. Top Glass Specular Lustre & 1px Optical Glint matching Notch Surface */}
      <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/[0.08] via-white/[0.02] to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
    </div>
  );
};
