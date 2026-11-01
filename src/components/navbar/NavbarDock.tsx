import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { NavbarConfig } from "../../types/navbar";
import { StartSearchGroup } from "./groups/StartSearchGroup";
import { PinnedAppsGroup } from "./groups/PinnedAppsGroup";
import { SystemTrayGroup } from "./groups/SystemTrayGroup";
import { getNavbarModuleById } from "../../modules/registry";
import { NavbarModuleUnifiedPreview } from "../../modules/components/NavbarModuleUnifiedPreview";

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
            onAppClick={async (app) => {
              try {
                switch (app.id) {
                  case "explorer":
                    await invoke("trigger_file_explorer");
                    break;
                  case "chrome":
                    await invoke("launch_target", { target: "chrome" });
                    break;
                  case "vscode":
                    await invoke("launch_target", { target: "code" });
                    break;
                  case "terminal":
                    await invoke("launch_target", { target: "wt" });
                    break;
                  case "settings":
                    await invoke("launch_target", { target: "ms-settings:" });
                    break;
                  default:
                    await invoke("launch_target", { target: app.id });
                    break;
                }
              } catch (err) {
                console.error("Failed to launch app:", err);
              }
            }}
          />
        )}

        {/* Dynamic Catalog Modules Slot */}
        {(() => {
          const customModules = config.modules.filter(
            (m) =>
              m.enabled &&
              ![
                "startSearch",
                "pinnedApps",
                "runningApps",
                "systemIcons",
                "notifications",
                "clockDate",
              ].includes(m.id)
          );

          if (!customModules.length && !extraModules) return null;

          return (
            <>
              <Separator />
              <div className="flex items-center gap-1.5 shrink-0">
                {customModules.map((m) => {
                  const def = getNavbarModuleById(m.id);
                  if (!def) return null;
                  const Component = def.component;
                  return Component ? (
                    <Component key={m.id} view={m.view} config={config} />
                  ) : (
                    <NavbarModuleUnifiedPreview
                      key={m.id}
                      moduleId={m.id}
                      variant={m.view === "full" ? "pill" : "compact"}
                      className="cursor-pointer hover:opacity-90 transition-opacity"
                    />
                  );
                })}
                {extraModules}
              </div>
            </>
          );
        })()}

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
