import React, { useRef, useState, useEffect } from "react";
import { NavbarConfig } from "../../../types/navbar";
import { NavbarDock } from "../../navbar/NavbarDock";

interface NavbarLivePreviewProps {
  config: NavbarConfig;
  isLightMode?: boolean;
}

export const NavbarLivePreview: React.FC<NavbarLivePreviewProps> = ({
  config,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dockWrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.82);

  const shapeLabel = config.shape === "anchored" ? "Anchored" : "Floating";
  const positionLabel =
    config.position === "bottom"
      ? "Bottom"
      : config.position === "top"
      ? "Top"
      : config.position === "left"
      ? "Left"
      : "Right";

  // Automatically scale the preview dock so it never clips horizontally or vertically
  useEffect(() => {
    const container = containerRef.current;
    const dockWrap = dockWrapRef.current;
    if (!container || !dockWrap) return;

    const updateScale = () => {
      const availW = container.clientWidth - 32;
      const dockW = dockWrap.scrollWidth || dockWrap.offsetWidth || 400;
      if (dockW > 0 && availW > 0) {
        const fitScale = Math.min(0.85, availW / dockW);
        setScale(Math.max(0.45, Number(fitScale.toFixed(2))));
      }
    };

    updateScale();
    const obs = new ResizeObserver(updateScale);
    obs.observe(container);
    obs.observe(dockWrap);
    return () => obs.disconnect();
  }, [config]);

  // In preview mode, keep custom modules compact as specified in Artboard 86 so the preview stays clean
  const previewConfig: NavbarConfig = {
    ...config,
    position: "bottom",
  };

  return (
    <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2 bg-[#090b10]/95 backdrop-blur-md">
      <div
        ref={containerRef}
        style={{
          background:
            "radial-gradient(ellipse at 50% 120%, #173a7a 0%, #0e1320 60%, #0b0e17 100%)",
        }}
        className="relative w-full h-[132px] rounded-[14px] border border-[#1c2130] overflow-hidden flex items-end justify-center select-none shadow-lg"
      >
        {/* Subtle Desktop Window Mockup (Artboard 83 & 86) */}
        <div
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 top-[14px] w-[300px] h-[64px] rounded-t-[10px] bg-[#151821] border border-[#20242f] border-b-0 pointer-events-none"
        >
          <div className="flex gap-1 px-2.5 py-2">
            <span className="w-[5px] h-[5px] rounded-full bg-[#2a2f3d]" />
            <span className="w-[5px] h-[5px] rounded-full bg-[#2a2f3d]" />
            <span className="w-[5px] h-[5px] rounded-full bg-[#2a2f3d]" />
          </div>
          <div className="px-3.5 py-0.5 flex flex-col gap-[7px]">
            <div className="h-1 w-[60%] rounded bg-[#1d212c]" />
            <div className="h-1 w-[80%] rounded bg-[#1d212c]" />
          </div>
        </div>

        {/* Top-Left LIVE PREVIEW Badge */}
        <span className="absolute left-3 top-2.5 text-[10px] font-semibold tracking-[0.14em] text-[#8db8ff] inline-flex items-center gap-1.5 z-10">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              config.enabled ? "bg-[#22c55e]" : "bg-zinc-500"
            }`}
          />
          LIVE PREVIEW
        </span>

        {/* Top-Right Status Summary */}
        <span className="absolute right-3 top-2.5 text-[10px] font-medium text-[#8a8fa0] z-10">
          {shapeLabel} · {positionLabel} · {config.cornerRadius}px
        </span>

        {/* Scaled Dock Container */}
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "bottom center",
            marginBottom: config.shape === "anchored" ? "0px" : "10px",
          }}
          className="relative z-10 flex justify-center"
        >
          <div ref={dockWrapRef} className="w-max shrink-0">
            <NavbarDock config={previewConfig} isPreview={true} />
          </div>
        </div>
      </div>
    </div>
  );
};
