import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { NavbarConfig, DEFAULT_NAVBAR_CONFIG } from "../../types/navbar";
import { loadNavbarConfig } from "../../services/navbarConfigService";
import { NavbarDock } from "./NavbarDock";

export const NavbarApp: React.FC = () => {
  const [config, setConfig] = useState<NavbarConfig>(DEFAULT_NAVBAR_CONFIG);
  const [isDockVisible, setIsDockVisible] = useState(true);
  const dockRef = useRef<HTMLDivElement>(null);
  const lastSyncSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
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
    async (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      if (
        Math.abs(width - lastSyncSizeRef.current.w) < 2 &&
        Math.abs(height - lastSyncSizeRef.current.h) < 2
      ) {
        return;
      }
      lastSyncSizeRef.current = { w: width, h: height };

      try {
        await invoke("sync_navbar_bounds", {
          width: Math.ceil(width),
          height: Math.ceil(height),
          position: config.position || "bottom",
          distanceFromEdge: config.shape === "anchored" ? 0 : (config.distanceFromEdge ?? 14),
        });
      } catch (err) {
        console.error("Failed to sync navbar bounds:", err);
      }
    },
    [config.position, config.shape, config.distanceFromEdge]
  );

  // 3. ResizeObserver to track dynamic dock content changes (modules added/removed)
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Total physical height includes bottom offset and wings if anchored
        const isAnchored = config.shape === "anchored";
        const bottomOffset = isAnchored ? 0 : (config.distanceFromEdge ?? 14);
        syncBounds(width + (isAnchored ? 32 : 0), height + bottomOffset);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [config.shape, config.distanceFromEdge, syncBounds]);

  // 4. Power state pacing & Auto-Hide handling
  const handleMouseEnter = () => {
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    setIsDockVisible(true);
    invoke("set_metrics_power_state", { state: "Active" }).catch(() => {});
  };

  const handleMouseLeave = () => {
    if (config.autoHide) {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = window.setTimeout(() => {
        setIsDockVisible(false);
      }, 400);
    }
    invoke("set_metrics_power_state", { state: "Idle" }).catch(() => {});
  };

  // Handlers for Control Center / Notifications / Clock triggers
  const handleControlCenterClick = async () => {
    try {
      await invoke("trigger_windows_search");
    } catch {}
  };

  const handleNotificationsClick = async () => {
    try {
      await invoke("trigger_start_menu");
    } catch {}
  };

  const shouldSlideDown = config.autoHide && !isDockVisible;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="fixed inset-0 w-screen h-screen flex items-end justify-center select-none overflow-hidden bg-transparent pointer-events-none"
    >
      {/* Auto-hide trigger edge hotzone at screen bottom */}
      {config.autoHide && (
        <div
          onMouseEnter={handleMouseEnter}
          className="absolute bottom-0 left-0 right-0 h-2 bg-transparent pointer-events-auto z-10"
        />
      )}

      <div
        className={`pointer-events-auto transition-transform duration-200 ease-out ${
          shouldSlideDown ? "translate-y-[calc(100%+20px)]" : "translate-y-0"
        }`}
      >
        <NavbarDock
          ref={dockRef}
          config={config}
          onControlCenterClick={handleControlCenterClick}
          onNotificationsClick={handleNotificationsClick}
        />
      </div>
    </div>
  );
};
