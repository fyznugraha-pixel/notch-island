import React, { useEffect, useState } from "react";

interface IdleMascotProps {
  idleHeight?: number;
  notchColor?: string | null;
  isLightMode?: boolean;
  loop?: boolean;
}

// Module-level timestamp to preserve schedule even across tab opens/closes
let lastPlayedTimestamp = 0;

export const IdleMascot: React.FC<IdleMascotProps> = ({
  idleHeight = 32,
  notchColor,
  isLightMode = false,
  loop = false,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(loop);

  useEffect(() => {
    if (loop) {
      setIsPlaying(true);
      return;
    }

    let playTimer: NodeJS.Timeout;
    let intervalTimer: NodeJS.Timeout;

    const triggerAnimation = () => {
      setIsPlaying(true);
      playTimer = setTimeout(() => {
        setIsPlaying(false);
      }, 9200); // 9s keyframe animation + 200ms buffer
    };

    const now = Date.now();
    const timeSinceLastPlay = now - lastPlayedTimestamp;
    // Initial delay: 1.5s if not played recently (>5min) or on first load, otherwise wait remaining duration
    const initialDelay =
      lastPlayedTimestamp === 0 || timeSinceLastPlay >= 300000
        ? 1500
        : Math.max(1500, 300000 - timeSinceLastPlay);

    const initialTimer = setTimeout(() => {
      lastPlayedTimestamp = Date.now();
      triggerAnimation();

      // Recurring schedule: every 5 minutes (300,000 ms)
      intervalTimer = setInterval(() => {
        lastPlayedTimestamp = Date.now();
        triggerAnimation();
      }, 300000);
    }, initialDelay);

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(playTimer);
      clearInterval(intervalTimer);
    };
  }, [loop]);

  if (!isPlaying) {
    return null;
  }

  const scale = idleHeight / 44;
  const iterationCount = loop ? "infinite" : "1";
  const innerNotchColor = notchColor || (isLightMode ? "#1a1a1f" : "#0B0F14");

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden flex items-end justify-center select-none"
      style={{ borderRadius: "inherit" }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes gili-lh {
          0%, 27% { transform: translateY(16px) rotate(0); }
          31% { transform: translateY(-2px) rotate(-4deg); }
          34% { transform: translateY(0) rotate(0); }
          42% { transform: translateY(0) rotate(-5deg); }
          44% { transform: translateY(0) rotate(2deg); }
          46% { transform: translateY(0) rotate(-4deg); }
          48%, 78% { transform: translateY(0) rotate(0); }
          80% { transform: translate(-1px, -2px) rotate(-14deg); }
          83%, 86% { transform: translateY(0) rotate(0); }
          90%, 100% { transform: translateY(16px) rotate(6deg); }
        }
        @keyframes gili-rh {
          0%, 32% { transform: translateY(16px) rotate(0); }
          36% { transform: translateY(-2px) rotate(4deg); }
          39% { transform: translateY(0) rotate(0); }
          43% { transform: translateY(0) rotate(5deg); }
          45% { transform: translateY(0) rotate(-2deg); }
          47% { transform: translateY(0) rotate(4deg); }
          49%, 78% { transform: translateY(0) rotate(0); }
          80% { transform: translate(-1px, -2px) rotate(14deg); }
          83%, 86% { transform: translateY(0) rotate(0); }
          91%, 100% { transform: translateY(16px) rotate(-6deg); }
        }
        @keyframes gili-hd {
          0%, 48% { transform: translateY(24px) scale(1, 1); }
          52% { transform: translateY(16px); }
          54% { transform: translateY(17px); }
          58% { transform: translateY(7px); }
          60% { transform: translateY(8px); }
          64%, 78% { transform: translateY(0) scale(1, 1); }
          79.5% { transform: translateY(-3px) scale(0.95, 1.1); }
          81% { transform: translateY(1px) scale(1.07, 0.93); }
          83%, 86% { transform: translateY(0) scale(1, 1); }
          90%, 100% { transform: translateY(24px) scale(1, 1); }
        }
        @keyframes gili-ew {
          0%, 79% { transform: scale(1, 1); }
          80.5%, 86% { transform: scale(1.3, 1.25); }
          89%, 100% { transform: scale(1, 1); }
        }
        @keyframes gili-ey {
          0%, 62% { transform: translateX(0); }
          65%, 68% { transform: translateX(-5.5px); }
          70%, 73% { transform: translateX(5.5px); }
          75%, 100% { transform: translateX(0); }
        }
        @keyframes gili-bl {
          0%, 66.4% { transform: scaleY(1); }
          67% { transform: scaleY(0.1); }
          67.6%, 72% { transform: scaleY(1); }
          72.5% { transform: scaleY(0.1); }
          73.1%, 100% { transform: scaleY(1); }
        }
        @keyframes gili-ex {
          0%, 79.4% { opacity: 0; transform: translateY(9px) scale(0) rotate(-14deg); }
          80.6% { opacity: 1; transform: translateY(0) scale(1.18) rotate(6deg); }
          82% { opacity: 1; transform: translateY(1px) scale(0.94) rotate(-4deg); }
          83.2% { opacity: 1; transform: translateY(0) scale(1.04) rotate(2deg); }
          84.4%, 86.2% { opacity: 1; transform: translateY(0) scale(1) rotate(0); }
          89%, 100% { opacity: 0; transform: translateY(-5px) scale(0.55) rotate(0); }
        }
        @keyframes gili-sh {
          0%, 79.5% { opacity: 0; transform: scale(0.55); }
          80.3% { opacity: 1; transform: scale(1); }
          81.6% { opacity: 1; transform: scale(1.12); }
          84%, 100% { opacity: 0; transform: scale(1.4); }
        }
        @keyframes gili-sd {
          0%, 81.2% { opacity: 0; transform: translate(0, -5px) scale(0.5); }
          82.6% { opacity: 1; transform: translate(0, 0) scale(1); }
          84.6% { opacity: 1; transform: translate(1px, 2px) scale(1); }
          86.4% { opacity: 1; transform: translate(1px, 6px) scale(1); }
          88.6%, 100% { opacity: 0; transform: translate(1px, 10px) scale(0.8); }
        }
        .gili-ex, .gili-sh, .gili-sd {
          opacity: 0;
          animation-duration: 9s;
          animation-iteration-count: ${iterationCount};
          animation-timing-function: cubic-bezier(.3, .7, .3, 1);
          animation-fill-mode: forwards;
        }
        .gili-ex { animation-name: gili-ex; transform-origin: 50% 100%; }
        .gili-sh { animation-name: gili-sh; transform-origin: 50% 70%; }
        .gili-sd { animation-name: gili-sd; }
        .gili-hd { transform-origin: 50% 100%; }
        .gili-lh, .gili-rh, .gili-hd, .gili-ey, .gili-bl, .gili-ew {
          animation-duration: 9s;
          animation-iteration-count: ${iterationCount};
          animation-timing-function: cubic-bezier(.3, .7, .3, 1);
          animation-fill-mode: forwards;
        }
        .gili-ew { animation-name: gili-ew; }
        .gili-lh { animation-name: gili-lh; }
        .gili-rh { animation-name: gili-rh; }
        .gili-hd { animation-name: gili-hd; }
        .gili-ey { animation-name: gili-ey; }
        .gili-bl { animation-name: gili-bl; }
        @media (prefers-reduced-motion: reduce) {
          .gili-ex, .gili-sh, .gili-sd { animation: none; opacity: 0; }
          .gili-lh, .gili-rh { animation: none; transform: translateY(0); }
          .gili-hd { animation: none; transform: translateY(0); }
          .gili-ey, .gili-bl, .gili-ew { animation: none; }
        }
      `}</style>

      <div
        style={{
          position: "relative",
          width: 200,
          height: 44,
          transform: `scale(${scale})`,
          transformOrigin: "bottom center",
          flexShrink: 0,
        }}
      >
        {/* Head */}
        <div className="gili-hd" style={{ position: "absolute", left: 78, top: 23 }}>
          <svg
            width="44"
            height="22"
            viewBox="8 26 104 52"
            style={{ display: "block", overflow: "visible" }}
          >
            {/* Mascot dome body */}
            <path d="M8 76A52 50 0 0 1 112 76Z" fill="#2F7BFF" />
            {/* Inner notch cutout on forehead */}
            <path
              d="M38 30.7A52 50 0 0 1 82 30.7V44A14 14 0 0 1 68 58H52A14 14 0 0 1 38 44Z"
              fill={innerNotchColor}
            />
            {/* Eyes */}
            <g className="gili-ey">
              <g className="gili-ew" style={{ transformOrigin: "51px 42px" }}>
                <rect
                  className="gili-bl"
                  x="48"
                  y="36"
                  width="6"
                  height="12"
                  rx="3"
                  fill="#7FE3FF"
                  style={{ transformOrigin: "51px 42px" }}
                />
              </g>
              <g className="gili-ew" style={{ transformOrigin: "69px 42px" }}>
                <rect
                  className="gili-bl"
                  x="66"
                  y="36"
                  width="6"
                  height="12"
                  rx="3"
                  fill="#7FE3FF"
                  style={{ transformOrigin: "69px 42px" }}
                />
              </g>
            </g>
          </svg>
        </div>

        {/* Alert & Sweat drop effects */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 200,
            height: 44,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          {/* Exclamation mark */}
          <svg
            className="gili-ex"
            width="10"
            height="15"
            viewBox="0 0 12 18"
            style={{
              position: "absolute",
              left: 81,
              top: 10,
              display: "block",
              overflow: "visible",
              filter: "drop-shadow(0 0 3px rgba(255,184,77,.55))",
            }}
          >
            <path d="M3.6 1.2h4.8l-.7 9.4H4.3z" fill="#FFB84D" />
            <rect x="3.6" y="1" width="4.8" height="10" rx="2.4" fill="#FFB84D" />
            <circle cx="6" cy="15.2" r="2.4" fill="#FFB84D" />
          </svg>
          {/* Sweat drop */}
          <svg
            className="gili-sd"
            width="8"
            height="12"
            viewBox="0 0 8 12"
            style={{
              position: "absolute",
              left: 115,
              top: 12,
              display: "block",
              overflow: "visible",
            }}
          >
            <path d="M4 0C4 0 0 5 0 7.6A4 4 0 0 0 8 7.6C8 5 4 0 4 0Z" fill="#7FE3FF" />
          </svg>
        </div>

        {/* Hands */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 200,
            height: 44,
            overflow: "hidden",
          }}
        >
          <div
            className="gili-lh"
            style={{ position: "absolute", left: 60, top: 32, transformOrigin: "50% 100%" }}
          >
            <svg
              width="14"
              height="12"
              viewBox="0 0 14 12"
              style={{ display: "block", overflow: "visible" }}
            >
              <rect x="1" y="5" width="12" height="7" rx="3" fill="#EDEFF8" />
              <circle cx="3.2" cy="5.2" r="2.1" fill="#EDEFF8" />
              <circle cx="7" cy="3.7" r="2.2" fill="#EDEFF8" />
              <circle cx="10.8" cy="5.2" r="2.1" fill="#EDEFF8" />
            </svg>
          </div>
          <div
            className="gili-rh"
            style={{ position: "absolute", left: 126, top: 32, transformOrigin: "50% 100%" }}
          >
            <svg
              width="14"
              height="12"
              viewBox="0 0 14 12"
              style={{ display: "block", overflow: "visible" }}
            >
              <rect x="1" y="5" width="12" height="7" rx="3" fill="#EDEFF8" />
              <circle cx="3.2" cy="5.2" r="2.1" fill="#EDEFF8" />
              <circle cx="7" cy="3.7" r="2.2" fill="#EDEFF8" />
              <circle cx="10.8" cy="5.2" r="2.1" fill="#EDEFF8" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
