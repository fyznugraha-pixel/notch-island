import React from "react";
import { NavbarConfig } from "../../types/navbar";
import { StartSearchGroup } from "./groups/StartSearchGroup";
import { PinnedAppsGroup } from "./groups/PinnedAppsGroup";
import { SystemTrayGroup } from "./groups/SystemTrayGroup";

interface NavbarDockProps {
  config: NavbarConfig;
  extraModules?: React.ReactNode;
  onControlCenterClick?: () => void;
  onNotificationsClick?: () => void;
  onClockClick?: () => void;
}

export const NavbarDock = React.forwardRef<HTMLDivElement, NavbarDockProps>(
  (
    {
      config,
      extraModules,
      onControlCenterClick,
      onNotificationsClick,
      onClockClick,
    },
    ref
  ) => {
    const isAnchored = config.shape === "anchored";
    const iconSize = config.iconSize || 40;
    const dockHeight = iconSize + 8; // 48px when iconSize = 40px
    const radius = config.cornerRadius ?? 15;

    // Tint background calculation
    const alpha = (config.opacity ?? 100) / 100;
    let bgColor = `rgba(0, 0, 0, ${alpha})`;
    if (config.background === "custom" && config.customColor) {
      bgColor = config.customColor;
    } else if (config.background === "followNotch") {
      bgColor = `rgba(18, 18, 22, ${alpha})`;
    }

    // Styles for Anchored vs Floating
    const dockStyle: React.CSSProperties = {
      height: `${dockHeight}px`,
      background: config.style === "liquid" ? undefined : bgColor,
      borderRadius: isAnchored
        ? `${radius}px ${radius}px 0 0`
        : `${radius}px`,
      bottom: isAnchored ? "0px" : `${config.distanceFromEdge ?? 14}px`,
      boxShadow: isAnchored
        ? "inset 0 1px 0 rgba(255,255,255,0.07)"
        : "inset 0 1px 0 rgba(255,255,255,0.07), 0 14px 34px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.09)",
    };

    // Spacing between groups
    const spacingClass =
      config.iconSpacing === "roomy"
        ? "gap-2"
        : config.iconSpacing === "normal"
        ? "gap-1"
        : "gap-0.5";

    // Separator component
    const Separator = () => (
      <span
        aria-hidden="true"
        className="w-[1px] h-[20px] bg-white/10 mx-1.5 shrink-0 select-none pointer-events-none"
      />
    );

    // Module enable checks
    const hasModule = (id: string) =>
      config.modules.some((m) => m.id === id && m.enabled);

    return (
      <div
        ref={ref}
        style={dockStyle}
        className={`relative inline-flex items-center px-2 text-white select-none whitespace-nowrap transition-all duration-150 box-border ${
          config.style === "liquid"
            ? "backdrop-blur-2xl bg-black/40 border border-white/15"
            : ""
        } ${spacingClass}`}
      >
        {/* Anchored Left & Right Inverted Wing Curves (Artboard 72) */}
        {isAnchored && (
          <>
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                bottom: 0,
                left: "-15px",
                width: "15px",
                height: "15px",
                background: `radial-gradient(circle at 0 0, transparent 14px, ${bgColor} 15px)`,
                pointerEvents: "none",
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                bottom: 0,
                right: "-15px",
                width: "15px",
                height: "15px",
                background: `radial-gradient(circle at 100% 0, transparent 14px, ${bgColor} 15px)`,
                pointerEvents: "none",
              }}
            />
          </>
        )}

        {/* Grup 1: Start & Search */}
        {hasModule("startSearch") && (
          <>
            <StartSearchGroup iconSize={iconSize} />
            <Separator />
          </>
        )}

        {/* Grup 2: Apps (Pinned & Running) */}
        {(hasModule("pinnedApps") || hasModule("runningApps")) && (
          <PinnedAppsGroup
            iconSize={iconSize}
            magnifyOnHover={config.magnify}
            windowPreviews={config.windowPreviews}
            accentColor={config.accent}
          />
        )}

        {/* Extra Active Modules Slot (Catalog) */}
        {extraModules && (
          <>
            <Separator />
            <div className="flex items-center gap-1 shrink-0">
              {extraModules}
            </div>
          </>
        )}

        {/* Grup 3: System Icons, Notifications, Clock/Date */}
        {(hasModule("systemIcons") ||
          hasModule("notifications") ||
          hasModule("clockDate")) && (
          <>
            <Separator />
            <SystemTrayGroup
              accentColor={config.accent}
              use24HourClock={config.clock24h}
              onControlCenterClick={onControlCenterClick}
              onNotificationsClick={onNotificationsClick}
              onClockClick={onClockClick}
            />
          </>
        )}
      </div>
    );
  }
);

NavbarDock.displayName = "NavbarDock";
