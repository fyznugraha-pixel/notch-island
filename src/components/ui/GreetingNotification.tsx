import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { iosSpring } from "../../utils/iosMotion";
import { ScrollingText } from "./ScrollingText";
import { NotifPayload } from "../../types";

interface GreetingNotificationProps {
  notif: NotifPayload;
  isLightMode?: boolean;
  onClick?: (e?: React.MouseEvent) => void;
  isBot?: boolean;
}

export const GreetingNotification: React.FC<GreetingNotificationProps> = ({
  notif,
  isLightMode = false,
  onClick,
  isBot = false,
}) => {
  const isNight = notif.icon === "moon";

  const timeString = useMemo(() => {
    try {
      const now = new Date();
      return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch {
      return "";
    }
  }, []);

  const salutation = useMemo(() => {
    if (!notif.body) return isNight ? "Good Evening" : "Good Day";
    return notif.body.replace(/[!.,]/g, "").trim();
  }, [notif.body, isNight]);

  const welcomeTitle = useMemo(() => {
    return notif.title || "Welcome back";
  }, [notif.title]);

  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, y: isBot ? -8 : 8, scale: 0.94, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none", transform: "none" } }}
      exit={{ opacity: 0, y: isBot ? 8 : -8, scale: 0.94, filter: "blur(6px)" }}
      transition={iosSpring.snappy}
      className="absolute inset-0 z-40 flex items-center justify-between px-3.5 select-none cursor-pointer group"
    >
      {/* Left: Glowing Ambient Icon Badge */}
      <div className="flex items-center gap-3 min-w-0">
        <motion.div
          className="relative shrink-0"
          initial={{ scale: 0.6, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={iosSpring.bouncy}
        >
          {/* Subtle Ambient Radial Glow with breathing animation */}
          <motion.div
            animate={{
              scale: [0.95, 1.22, 0.95],
              opacity: isNight ? [0.45, 0.75, 0.45] : [0.55, 0.95, 0.55],
            }}
            transition={{
              duration: 2.6,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className={`absolute -inset-1 rounded-full blur-md transition-opacity group-hover:opacity-100 ${
              isNight
                ? "bg-gradient-to-r from-indigo-500/40 to-purple-500/30"
                : "bg-gradient-to-r from-amber-500/50 via-orange-500/40 to-yellow-400/30"
            }`}
          />

          {/* Frosted Glass Badge Capsule (wadahnya mengambang & bergerak dinamis) */}
          <motion.div
            animate={{
              y: [-1.5, 1.5, -1.5],
              scale: [1, 1.04, 1],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className={`relative w-8 h-8 rounded-full flex items-center justify-center border shadow-sm transition-transform group-hover:scale-110 group-active:scale-95 ${
              isNight
                ? "bg-gradient-to-br from-indigo-500/30 via-purple-600/20 to-sky-600/10 border-indigo-400/40 dark:border-indigo-400/30 shadow-[0_0_12px_rgba(99,102,241,0.35)]"
                : "bg-gradient-to-br from-amber-400/35 via-orange-500/25 to-yellow-500/15 border-amber-300/50 dark:border-amber-400/35 shadow-[0_0_14px_rgba(251,191,36,0.4)]"
            }`}
          >
            {/* Specular Rim Light */}
            <div className="absolute inset-x-1.5 top-0.5 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent rounded-full" />

            {isNight ? (
              <motion.div
                animate={{
                  rotate: [-8, 8, -8],
                  scale: [1, 1.08, 1],
                }}
                transition={{
                  duration: 3.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="relative flex items-center justify-center text-indigo-400 dark:text-indigo-300"
              >
                <Moon size={16} strokeWidth={2.4} />
                <motion.span
                  animate={{ scale: [0.8, 1.4, 0.8], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-indigo-200 dark:bg-white shadow-[0_0_6px_#ffffff]"
                />
              </motion.div>
            ) : (
              <motion.div
                animate={{
                  rotate: 360,
                  scale: [1, 1.08, 0.96, 1],
                }}
                transition={{
                  rotate: {
                    duration: 10,
                    repeat: Infinity,
                    ease: "linear",
                  },
                  scale: {
                    duration: 2.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                }}
                className="relative flex items-center justify-center text-amber-500 dark:text-amber-300"
              >
                <Sun size={17} strokeWidth={2.4} />
              </motion.div>
            )}
          </motion.div>
        </motion.div>

        {/* Center: Greeting Salutation & Personalized Name */}
        <div className="flex flex-col justify-center min-w-0 pr-1">
          <div className="flex items-center gap-1.5 leading-none mb-0.5">
            <span
              className={`text-[9.5px] font-bold tracking-[0.1em] uppercase ${
                isNight
                  ? isLightMode ? "text-indigo-600" : "text-indigo-400"
                  : isLightMode ? "text-amber-600" : "text-amber-400"
              }`}
            >
              {salutation}
            </span>
          </div>

          <ScrollingText
            text={welcomeTitle}
            className={`text-[13px] font-semibold tracking-tight leading-tight ${
              isLightMode ? "text-[#1d1d1f]" : "text-white"
            }`}
          />
        </div>
      </div>

      {/* Right: iOS Trailing Status Pill (Clock & Status Dot) */}
      {timeString && (
        <div
          className={`shrink-0 ml-2 px-2.5 py-1 rounded-full flex items-center gap-1.5 border backdrop-blur-md transition-colors ${
            isLightMode
              ? "bg-black/[0.04] border-black/[0.08] text-neutral-600"
              : "bg-white/[0.08] border-white/10 text-neutral-300"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full animate-pulse ${
              isNight
                ? "bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.8)]"
                : "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]"
            }`}
          />
          <span className="text-[11px] font-mono font-medium tracking-tight leading-none">
            {timeString}
          </span>
        </div>
      )}
    </motion.div>
  );
};
