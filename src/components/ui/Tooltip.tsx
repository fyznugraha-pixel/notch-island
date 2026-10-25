import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

export interface TooltipProps {
  content: string | React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  delay?: number;
  className?: string;
  wrapperClassName?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  side = "top",
  align = "center",
  delay = 300,
  className = "",
  wrapperClassName = "",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  const calculateCoords = () => {
    if (!triggerRef.current) return null;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tipNode = tooltipRef.current;
    const tipWidth = tipNode ? tipNode.offsetWidth : 70;
    const tipHeight = tipNode ? tipNode.offsetHeight : 26;

    let currentSide = side;
    let top = 0;
    let left = 0;

    // Auto-flip vertical if not enough space
    if (currentSide === "top" && triggerRect.top - tipHeight - 8 < 6) {
      currentSide = "bottom";
    } else if (currentSide === "bottom" && triggerRect.bottom + tipHeight + 8 > window.innerHeight - 6) {
      currentSide = "top";
    }

    // Auto-flip horizontal if not enough space
    if (currentSide === "left" && triggerRect.left - tipWidth - 8 < 6) {
      currentSide = "right";
    } else if (currentSide === "right" && triggerRect.right + tipWidth + 8 > window.innerWidth - 6) {
      currentSide = "left";
    }

    if (currentSide === "top") {
      top = triggerRect.top - tipHeight - 8;
      if (align === "start") {
        left = triggerRect.left;
      } else if (align === "end") {
        left = triggerRect.right - tipWidth;
      } else {
        left = triggerRect.left + (triggerRect.width - tipWidth) / 2;
      }
    } else if (currentSide === "bottom") {
      top = triggerRect.bottom + 8;
      if (align === "start") {
        left = triggerRect.left;
      } else if (align === "end") {
        left = triggerRect.right - tipWidth;
      } else {
        left = triggerRect.left + (triggerRect.width - tipWidth) / 2;
      }
    } else if (currentSide === "left") {
      left = triggerRect.left - tipWidth - 8;
      if (align === "start") {
        top = triggerRect.top;
      } else if (align === "end") {
        top = triggerRect.bottom - tipHeight;
      } else {
        top = triggerRect.top + (triggerRect.height - tipHeight) / 2;
      }
    } else {
      // right
      left = triggerRect.right + 8;
      if (align === "start") {
        top = triggerRect.top;
      } else if (align === "end") {
        top = triggerRect.bottom - tipHeight;
      } else {
        top = triggerRect.top + (triggerRect.height - tipHeight) / 2;
      }
    }

    // Viewport boundary clamping (guarantees tooltip is never clipped by window edges)
    const padding = 6;
    const maxLeft = Math.max(padding, window.innerWidth - tipWidth - padding);
    const maxTop = Math.max(padding, window.innerHeight - tipHeight - padding);

    return {
      top: Math.max(padding, Math.min(maxTop, top)),
      left: Math.max(padding, Math.min(maxLeft, left)),
    };
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      const initialCoords = calculateCoords();
      if (initialCoords) setCoords(initialCoords);
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isVisible) return;
    const fresh = calculateCoords();
    if (fresh) setCoords(fresh);

    const handleUpdate = () => {
      const updated = calculateCoords();
      if (updated) setCoords(updated);
    };

    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);

    return () => {
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
    };
  }, [isVisible, content, side, align]);

  const offsetMotion = {
    top: { initial: { opacity: 0, y: 4, scale: 0.95 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 2, scale: 0.95 } },
    bottom: { initial: { opacity: 0, y: -4, scale: 0.95 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -2, scale: 0.95 } },
    left: { initial: { opacity: 0, x: 4, scale: 0.95 }, animate: { opacity: 1, x: 0, scale: 1 }, exit: { opacity: 0, x: 2, scale: 0.95 } },
    right: { initial: { opacity: 0, x: -4, scale: 0.95 }, animate: { opacity: 1, x: 0, scale: 1 }, exit: { opacity: 0, x: 2, scale: 0.95 } },
  }[side];

  const isLightMode =
    typeof document !== "undefined" && document.documentElement.classList.contains("light");

  return (
    <div
      ref={triggerRef}
      className={`relative inline-flex items-center justify-center ${wrapperClassName}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isVisible && content && coords && (
              <div
                ref={tooltipRef}
                style={{
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                  zIndex: 99999,
                  pointerEvents: "none",
                }}
              >
                <motion.div
                  initial={offsetMotion.initial}
                  animate={offsetMotion.animate}
                  exit={offsetMotion.exit}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-none select-none"
                >
                  <div
                    className={`px-2.5 py-1 rounded-[8px] text-[11px] font-medium whitespace-nowrap leading-tight tracking-tight select-none flex items-center gap-1.5 ${
                      isLightMode
                        ? "bg-white/95 text-[#1d1d1f] border border-black/10 shadow-[0_8px_24px_rgba(0,0,0,0.12)] ring-1 ring-black/5"
                        : "bg-[#18181b] border border-white/10 text-white/95 shadow-[0_8px_24px_rgba(0,0,0,0.7)] ring-1 ring-white/5"
                    } ${className}`}
                  >
                    {content}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};

