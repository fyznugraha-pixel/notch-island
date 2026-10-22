

import React, { useMemo } from "react";

export const WeatherAnimation = React.memo(({ weatherCode }: { weatherCode: number | null }) => {
  if (weatherCode === null) return null;

  const isRain = weatherCode >= 51 && weatherCode <= 67;
  const isSnow = weatherCode >= 71 && weatherCode <= 82;
  const isThunder = weatherCode >= 95;

  if (!isRain && !isSnow && !isThunder) return null;

  // Generate 5 static particles per weather type
  const particles = useMemo(() => {
    return Array.from({ length: 5 }).map((_, i) => ({
      id: i,
      left: `${(i * 18 + 10)}%`,
      delay: `${(i * 0.4).toFixed(1)}s`,
      duration: `${isSnow ? (2.2 + i * 0.2).toFixed(1) : (0.8 + i * 0.1).toFixed(1)}s`,
      size: isSnow ? 5 : 2,
    }));
  }, [isSnow]);

  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-[inherit]">
      {isThunder && (
        <div className="absolute inset-0 bg-white/20 mix-blend-overlay animate-lightning" />
      )}
      
      {particles.map((p) => (
        <div
          key={p.id}
          className={`absolute top-[-10px] rounded-full ${isRain ? 'bg-blue-300/60 animate-rain' : 'bg-white/80 animate-snow'}`}
          style={{
            left: p.left,
            width: isRain ? '2px' : `${p.size}px`,
            height: isRain ? `${p.size * 4}px` : `${p.size}px`,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </div>
  );
});

