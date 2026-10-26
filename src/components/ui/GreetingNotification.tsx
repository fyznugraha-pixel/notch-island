import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { iosSpring } from "../../utils/iosMotion";
import { ScrollingText } from "./ScrollingText";
import { NotifPayload } from "../../types";

interface GreetingNotificationProps {
  notif: NotifPayload;
  isLightMode?: boolean;
  onClick?: (e?: React.MouseEvent) => void;
  isBot?: boolean;
  greetingStage?: "compact" | "expanded";
}

export const GreetingNotification: React.FC<GreetingNotificationProps> = ({
  notif,
  isLightMode = false,
  onClick,
  isBot = false,
  greetingStage = "expanded",
}) => {
  const isNight = notif.icon === "moon";

  const salutation = useMemo(() => {
    if (!notif.body) return isNight ? "Good Evening" : "Good Day";
    return notif.body.replace(/[!.,]/g, "").trim();
  }, [notif.body, isNight]);

  const welcomeTitle = useMemo(() => {
    return notif.title || "Welcome back";
  }, [notif.title]);

  const userName = useMemo(() => {
    return welcomeTitle.replace(/^Hi,\s*/i, "").trim() || welcomeTitle;
  }, [welcomeTitle]);

  const isCompact = greetingStage === "compact";

  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, y: isBot ? -8 : 8, scale: 0.94, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none", transform: "none" } }}
      exit={{ opacity: 0, y: isBot ? 8 : -8, scale: 0.94, filter: "blur(6px)" }}
      transition={iosSpring.snappy}
      className={`absolute inset-0 z-40 flex items-center select-none cursor-pointer group transition-all duration-300 ${
        isCompact ? "justify-center px-0" : "justify-start gap-3 px-3.5"
      }`}
    >
      {/* Gili Logo Animation - smoothly glides from center to left on stage 2 */}
      <motion.div
        layout
        className="relative w-[50px] h-[50px] rounded-full overflow-hidden shrink-0 flex items-center justify-center transition-transform group-hover:scale-105"
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={iosSpring.bouncy}
      >
        <video
          key={isLightMode ? "greeting-light" : "greeting-dark"}
          src={isLightMode ? "/gili-greating-light.mp4" : "/logo-greating.mp4"}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="w-full h-full object-cover rounded-full pointer-events-none select-none"
        />
      </motion.div>

      {/* Greeting Salutation & Name underneath - enters on stage 2 */}
      <AnimatePresence>
        {!isCompact && (
          <motion.div
            key="greeting-text"
            initial={{ opacity: 0, x: -16, filter: "blur(4px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: -10, filter: "blur(4px)" }}
            transition={{ duration: 0.35, ease: "easeOut", delay: 0.08 }}
            className="flex flex-col justify-center shrink-0 min-w-max pr-2"
          >
            <span
              className={`text-[10px] font-bold tracking-[0.08em] uppercase leading-none mb-1 whitespace-nowrap ${
                isNight
                  ? isLightMode ? "text-indigo-600" : "text-indigo-400"
                  : isLightMode ? "text-amber-600" : "text-amber-400"
              }`}
            >
              {salutation}
            </span>

            <ScrollingText
              text={userName}
              className={`text-[13.5px] font-bold tracking-tight leading-none whitespace-nowrap ${
                isLightMode ? "text-[#1d1d1f]" : "text-white"
              }`}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
