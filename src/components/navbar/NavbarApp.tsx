import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence } from "framer-motion";
import { NavbarConfig, DEFAULT_NAVBAR_CONFIG } from "../../types/navbar";
import { loadNavbarConfig } from "../../services/navbarConfigService";
import { NavbarDock } from "./NavbarDock";
import { NavbarControlCenterFlyout } from "./popovers/NavbarControlCenterFlyout";
import { NavbarNotificationsFlyout } from "./popovers/NavbarNotificationsFlyout";
import { NavbarCalendarFlyout } from "./popovers/NavbarCalendarFlyout";
import { NavbarStartLauncherFlyout } from "./popovers/NavbarStartLauncherFlyout";

type ActiveFlyoutType = "control_center" | "notifications" | "calendar" | "start" | null;

export const NavbarApp: React.FC = () => {
  const [config, setConfig] = useState<NavbarConfig>(DEFAULT_NAVBAR_CONFIG);
  const [isDockVisible, setIsDockVisible] = useState(true);
  const [activeFlyout, setActiveFlyout] = useState<ActiveFlyoutType>(null);
  const [isPreviewShowing, setIsPreviewShowing] = useState(false);

  const dockRef = useRef<HTMLDivElement>(null);
  const lastSyncRef = useRef<{ w: number; h: number; overhead: number }>({
    w: 0,
    h: 0,
    overhead: 0,
  });
  const autoHideTimerRef = useRef<number | null>(null);

  // 1. Initial config load
  useEffect(() => {
    loadNavbarConfig().then((cfg) => {
      setConfig(cfg);
    });

    const unlistenPromise = listen<NavbarConfig>("navbar_config_updated", (event) => {
      if (event.payload) {
        setConfig(event.payload);
      }
    });

    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  // 2. Report measured bounds to Rust for window centering & positioning
  const syncBounds = useCallback(
    async (width: number, height: number, overhead: number, extraWidth: number) => {
      if (width <= 0 || height <= 0) return;
      if (
        Math.abs(width - lastSyncRef.current.w) < 2 &&
        Math.abs(height - lastSyncRef.current.h) < 2 &&
        Math.abs(overhead - lastSyncRef.current.overhead) < 2
      ) {
        return;
      }
      lastSyncRef.current = { w: width, h: height, overhead };

      try {
        await invoke("sync_navbar_bounds", {
          width: Math.ceil(width),
          height: Math.ceil(height),
          position: config.position || "bottom",
          distanceFromEdge: config.shape === "anchored" ? 0 : (config.distanceFromEdge ?? 14),
          isAnchored: config.shape === "anchored",
          overhead,
          extraWidth,
        });
      } catch (err) {
        console.error("Failed to sync navbar bounds:", err);
      }
    },
    [config.position, config.shape, config.distanceFromEdge]
  );

  // 3. Dynamic sizing calculation depending on whether flyouts or previews are open
  const getOverheadAndExtra = useCallback(() => {
    if (activeFlyout !== null) {
      return { overhead: 420, extraWidth: 340 };
    }
    if (isPreviewShowing) {
      return { overhead: 220, extraWidth: 220 };
    }
    return { overhead: 42, extraWidth: 80 };
  }, [activeFlyout, isPreviewShowing]);

  // 4. ResizeObserver to track dynamic dock content changes
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      const { overhead, extraWidth } = getOverheadAndExtra();
      const elWidth = el.offsetWidth || el.getBoundingClientRect().width;
      const elHeight = el.offsetHeight || el.getBoundingClientRect().height;
      const isAnchored = config.shape === "anchored";
      const bottomOffset = isAnchored ? 0 : (config.distanceFromEdge ?? 14);
      syncBounds(elWidth, elHeight + bottomOffset, overhead, extraWidth);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [config.shape, config.distanceFromEdge, getOverheadAndExtra, syncBounds]);

  // Trigger sync immediately when flyout or preview state changes
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const { overhead, extraWidth } = getOverheadAndExtra();
    const elWidth = el.offsetWidth || el.getBoundingClientRect().width;
    const elHeight = el.offsetHeight || el.getBoundingClientRect().height;
    const isAnchored = config.shape === "anchored";
    const bottomOffset = isAnchored ? 0 : (config.distanceFromEdge ?? 14);
    syncBounds(elWidth, elHeight + bottomOffset, overhead, extraWidth);
  }, [activeFlyout, isPreviewShowing, config.shape, config.distanceFromEdge, getOverheadAndExtra, syncBounds]);

  // 5. Power state pacing & Auto-Hide handling
  const handleMouseEnter = () => {
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    setIsDockVisible(true);
    invoke("set_metrics_power_state", { state: "Active" }).catch(() => {});
  };

  const handleMouseLeave = () => {
    if (config.autoHide && !activeFlyout) {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = window.setTimeout(() => {
        setIsDockVisible(false);
      }, 400);
    }
    invoke("set_metrics_power_state", { state: "Idle" }).catch(() => {});
  };

  const shouldSlideDown = config.autoHide && !isDockVisible && !activeFlyout;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="fixed inset-0 w-screen h-screen flex items-end justify-center select-none overflow-visible bg-transparent pointer-events-none"
    >
      {/* Auto-hide trigger edge hotzone at screen bottom */}
      {config.autoHide && (
        <div
          onMouseEnter={handleMouseEnter}
          className="absolute bottom-0 left-0 right-0 h-2 bg-transparent pointer-events-auto z-10"
        />
      )}

      <div
        className={`relative pointer-events-auto transition-transform duration-200 ease-out ${
          shouldSlideDown ? "translate-y-[calc(100%+20px)]" : "translate-y-0"
        }`}
      >
        {/* Custom Popovers / Flyouts */}
        <AnimatePresence>
          {activeFlyout === "control_center" && (
            <NavbarControlCenterFlyout
              onClose={() => setActiveFlyout(null)}
              accentColor={config.accent}
            />
          )}
          {activeFlyout === "notifications" && (
            <NavbarNotificationsFlyout
              onClose={() => setActiveFlyout(null)}
            />
          )}
          {activeFlyout === "calendar" && (
            <NavbarCalendarFlyout
              onClose={() => setActiveFlyout(null)}
              accentColor={config.accent}
            />
          )}
          {activeFlyout === "start" && (
            <NavbarStartLauncherFlyout
              onClose={() => setActiveFlyout(null)}
              accentColor={config.accent}
            />
          )}
        </AnimatePresence>

        <NavbarDock
          ref={dockRef}
          config={config}
          onStartClick={() =>
            setActiveFlyout((prev) => (prev === "start" ? null : "start"))
          }
          onControlCenterClick={() =>
            setActiveFlyout((prev) => (prev === "control_center" ? null : "control_center"))
          }
          onNotificationsClick={() =>
            setActiveFlyout((prev) => (prev === "notifications" ? null : "notifications"))
          }
          onClockClick={() =>
            setActiveFlyout((prev) => (prev === "calendar" ? null : "calendar"))
          }
          onPreviewStateChange={(isShowing) => setIsPreviewShowing(isShowing)}
        />
      </div>
    </div>
  );
};
