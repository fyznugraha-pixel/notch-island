import React from "react";

export interface MiniPlayerEqualizerProps {
  isPlaying: boolean;
}

const EQ_BARS = [
  { height: 13, duration: "0.68s", delay: "0s" },
  { height: 19, duration: "0.54s", delay: "0.16s" },
  { height: 22, duration: "0.78s", delay: "0.07s" },
  { height: 17, duration: "0.61s", delay: "0.24s" },
  { height: 12, duration: "0.72s", delay: "0.11s" },
] as const;

export const MiniPlayerEqualizer: React.FC<MiniPlayerEqualizerProps> = ({
  isPlaying,
}) => {
  return (
    <div
      role="img"
      aria-label={isPlaying ? "Sedang memutar" : "Dijeda"}
      className="w-[20px] h-[22px] flex items-center justify-between shrink-0 pointer-events-none"
    >
      {EQ_BARS.map((bar, idx) => (
        <span
          key={idx}
          style={{
            height: `${bar.height}px`,
            transformOrigin: "center",
            willChange: "transform",
            animation: isPlaying
              ? `eqPulse ${bar.duration} ease-in-out ${bar.delay} infinite`
              : "none",
            transform: isPlaying ? undefined : "scaleY(0.24)",
            transition: "transform 220ms ease-out",
          }}
          className="w-[2.8px] rounded-full bg-[#3B9DF8]"
        />
      ))}
    </div>
  );
};
