import { useRef, useState, useEffect } from "react";

export interface ScrollingTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  speed?: number;
  pauseSeconds?: number;
}

export const ScrollingText = ({
  text,
  className = "",
  style,
  speed = 28,
  pauseSeconds = 1.8,
}: ScrollingTextProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowPx, setOverflowPx] = useState(0);
  const animId = useRef(Math.random().toString(36).substring(2, 7)).current;

  useEffect(() => {
    if (!containerRef.current || !textRef.current) return;

    const checkScroll = () => {
      const container = containerRef.current;
      const span = textRef.current;
      if (!container || !span) return;

      const prevTransform = span.style.transform;
      const prevMaxWidth = span.style.maxWidth;
      span.style.transform = "none";
      span.style.maxWidth = "none";
      span.style.transition = "none";
      void span.offsetWidth;

      const overflow = span.scrollWidth - container.clientWidth;
      setOverflowPx(overflow > 3 ? overflow : 0);

      span.style.transform = prevTransform;
      span.style.maxWidth = prevMaxWidth;
    };

    const ro = new ResizeObserver(checkScroll);
    ro.observe(containerRef.current);
    ro.observe(textRef.current);
    const timer = setTimeout(checkScroll, 120);

    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, [text, className]);

  const shouldScroll = overflowPx > 0;
  const scrollDur = shouldScroll ? Math.max(2.2, Math.min(8.5, overflowPx / speed)) : 0;
  const totalCycle = pauseSeconds + scrollDur + pauseSeconds + scrollDur + 0.8;

  const p1 = ((pauseSeconds / totalCycle) * 100).toFixed(1);
  const p2 = (((pauseSeconds + scrollDur) / totalCycle) * 100).toFixed(1);
  const p3 = (((pauseSeconds + scrollDur + pauseSeconds) / totalCycle) * 100).toFixed(1);
  const p4 = (((pauseSeconds + 2 * scrollDur + pauseSeconds) / totalCycle) * 100).toFixed(1);

  const animName = `marquee-pp-${animId}-${Math.round(overflowPx)}`;

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden whitespace-nowrap py-[1px] group/marquee ${className}`}
      style={{
        ...style,
        maskImage: shouldScroll
          ? "linear-gradient(to right, transparent 0%, black 8px, black calc(100% - 8px), transparent 100%)"
          : undefined,
        WebkitMaskImage: shouldScroll
          ? "linear-gradient(to right, transparent 0%, black 8px, black calc(100% - 8px), transparent 100%)"
          : undefined,
      }}
    >
      {shouldScroll && (
        <style
          dangerouslySetInnerHTML={{
            __html: `
          @keyframes ${animName} {
            0%, ${p1}% { transform: translateX(0px); }
            ${p2}%, ${p3}% { transform: translateX(-${overflowPx}px); }
            ${p4}%, 100% { transform: translateX(0px); }
          }
        `,
          }}
        />
      )}
      <span
        ref={textRef}
        className={shouldScroll ? "group-hover/marquee:[animation-play-state:paused]" : ""}
        style={
          shouldScroll
            ? {
                display: "inline-block",
                animation: `${animName} ${totalCycle}s ease-in-out infinite`,
                willChange: "transform",
                lineHeight: "1.3",
              }
            : {
                display: "inline-block",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                lineHeight: "1.3",
              }
        }
      >
        {text}
      </span>
    </div>
  );
};
