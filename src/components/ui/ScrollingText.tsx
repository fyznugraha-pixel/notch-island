import { useRef, useState, useEffect } from "react";

export const ScrollingText = ({ text, className }: { text: string, className?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowPx, setOverflowPx] = useState(0);

  useEffect(() => {
    if (!containerRef.current || !textRef.current) return;

    const checkScroll = () => {
      const container = containerRef.current;
      const span = textRef.current;
      if (!container || !span) return;

      // Temporarily reset any transform so we get the raw natural width
      const prevTransform = span.style.transform;
      span.style.transform = 'none';
      span.style.transition = 'none';
      // Force layout
      void span.offsetWidth;

      const overflow = span.scrollWidth - container.clientWidth;
      setOverflowPx(overflow > 2 ? overflow : 0);

      span.style.transform = prevTransform;
    };

    const ro = new ResizeObserver(checkScroll);
    ro.observe(containerRef.current);
    ro.observe(textRef.current);
    // Small delay so Framer Motion layout animation finishes first
    const timer = setTimeout(checkScroll, 100);

    return () => { ro.disconnect(); clearTimeout(timer); };
  }, [text]);

  const shouldScroll = overflowPx > 0;
  // scroll duration proportional to overflow, range 2-6s
  const scrollDur = shouldScroll ? Math.max(2, Math.min(6, overflowPx / 25)) : 0;
  // total cycle: 2s pause → scroll → 2s pause (handled via keyframe percentages)
  const totalCycle = 2 + scrollDur + 2;
  const scrollStartPct = (2 / totalCycle * 100).toFixed(1);
  const scrollEndPct = ((2 + scrollDur) / totalCycle * 100).toFixed(1);

  return (
    <div ref={containerRef} className={`overflow-hidden whitespace-nowrap ${className}`}>
      {shouldScroll && (
        <style>{`
          @keyframes marquee-pause-scroll-${Math.round(overflowPx)} {
            0%, ${scrollStartPct}% { transform: translateX(0px); }
            ${scrollEndPct}%, 100% { transform: translateX(-${overflowPx}px); }
          }
        `}</style>
      )}
      <span
        ref={textRef}
        style={shouldScroll ? {
          display: 'inline-block',
          animation: `marquee-pause-scroll-${Math.round(overflowPx)} ${totalCycle}s ease-in-out infinite`,
          willChange: 'transform',
        } : {
          display: 'inline-block',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </div>
  );
};
