import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { NavbarConfig } from "../../types/navbar";
import {
  getCachedNavbarConfigSync,
  loadNavbarConfig,
  subscribeToNavbarConfig,
} from "../../services/navbarConfigService";
import { NavbarDock } from "./NavbarDock";

export const NavbarApp: React.FC = () => {
  const [config, setConfig] = useState<NavbarConfig>(() =>
    getCachedNavbarConfigSync()
  );
  const [isDockVisible, setIsDockVisible] = useState(true);
  const [isDockSlidOut, setIsDockSlidOut] = useState(false);
  const [isFullscreenCovered, setIsFullscreenCovered] = useState(false);
  const [isWindowCoveringDock, setIsWindowCoveringDock] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);

  const dockRef = useRef<HTMLDivElement>(null);
  const hasTriggeredEntranceRef = useRef(false);
  const isCursorInDockRef = useRef(false);
  const isWindowCoveringDockRef = useRef(false);
  const isEffectiveAutoHideRef = useRef(false);
  const isPopupOpenRef = useRef(false);
  const lastSyncRef = useRef<{
    w: number;
    h: number;
    overhead: number;
    pos: string;
    mon: string;
    isAnchored: boolean;
    dist: number;
  }>({
    w: 0,
    h: 0,
    overhead: 0,
    pos: "",
    mon: "",
    isAnchored: false,
    dist: 0,
  });
  const autoHideTimerRef = useRef<number | null>(null);
  const revealedAtRef = useRef<number>(0);

  const isEffectiveAutoHide = Boolean(
    config.autoHide &&
    (config.autoHideMode === "maxsize" ? isWindowCoveringDock : true)
  );
  isEffectiveAutoHideRef.current = isEffectiveAutoHide;

  const cancelHideAndShow = useCallback(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
    revealedAtRef.current = Date.now();
    setIsDockVisible(true);
    setIsDockSlidOut(false);
  }, []);

  const scheduleHide = useCallback((delayMs = 800) => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
    }

    // Guarantee a comfortable grace period after the dock reveals (at least 1400ms)
    // so moving cursor from the edge to dock icons never causes premature hiding.
    const elapsedSinceReveal = Date.now() - (revealedAtRef.current || 0);
    const minGraceRemaining = Math.max(0, 1400 - elapsedSinceReveal);
    const effectiveDelay = Math.max(delayMs, 800, minGraceRemaining);

    autoHideTimerRef.current = window.setTimeout(() => {
      const hasOpenFlyout =
        isPopupOpenRef.current ||
        Boolean(
          document.querySelector(
            ".navbar-preview-dark, [data-calc-module-root] .navbar-preview-dark, [data-module-popover], [data-gili-flyout-open]"
          )
        );
      if (hasOpenFlyout) {
        scheduleHide(600);
        return;
      }
      if (isCursorInDockRef.current) {
        return;
      }
      setIsDockVisible(false);
    }, effectiveDelay);
  }, []);

  // 1. Initial config load & live sync
  useEffect(() => {
    loadNavbarConfig().then((cfg) => {
      setConfig(cfg);
      if (!cfg.enabled) {
        invoke("close_navbar_window").catch(() => { });
        invoke("set_windows_taskbar_visible", { visible: true }).catch(() => { });
      } else {
        invoke("open_navbar_window").catch(() => { });
        if (cfg.hideWindowsTaskbar) {
          invoke("set_windows_taskbar_visible", { visible: false }).catch(() => { });
        }
      }
    });

    const handleConfigUpdate = (payload: NavbarConfig) => {
      setConfig(payload);
      if (!payload.enabled) {
        invoke("close_navbar_window").catch(() => { });
        invoke("set_windows_taskbar_visible", { visible: true }).catch(() => { });
      } else {
        invoke("open_navbar_window").catch(() => { });
        if (payload.hideWindowsTaskbar) {
          invoke("set_windows_taskbar_visible", { visible: false }).catch(() => { });
        } else {
          invoke("set_windows_taskbar_visible", { visible: true }).catch(() => { });
        }
      }
      // Force instant bounds sync with updated shape/margins
      requestAnimationFrame(() => {
        if (dockRef.current) {
          const naturalW = dockRef.current.offsetWidth || dockRef.current.getBoundingClientRect().width;
          const naturalH = dockRef.current.offsetHeight || dockRef.current.getBoundingClientRect().height;
          if (naturalW > 0 && naturalH > 0) {
            syncBounds(naturalW, naturalH, 380, 420, true);
          }
        }
      });
    };

    const unsubscribeBroadcast = subscribeToNavbarConfig(handleConfigUpdate);

    const unlistenPromise1 = listen<NavbarConfig>("navbar_config_updated", (event) => {
      if (event.payload) handleConfigUpdate(event.payload);
    });

    const unlistenPromise2 = listen<NavbarConfig>("gili-navbar-config-sync", (event) => {
      if (event.payload) handleConfigUpdate(event.payload);
    });

    const unlistenSyncBounds = listen("navbar-request-sync-bounds", () => {
      if (dockRef.current) {
        const naturalW = dockRef.current.offsetWidth || dockRef.current.getBoundingClientRect().width;
        const naturalH = dockRef.current.offsetHeight || dockRef.current.getBoundingClientRect().height;
        if (naturalW > 0 && naturalH > 0) {
          syncBounds(naturalW, naturalH, 380, 420, true);
        }
      }
    });

    return () => {
      unsubscribeBroadcast();
      unlistenPromise1.then((fn) => fn());
      unlistenPromise2.then((fn) => fn());
      unlistenSyncBounds.then((fn) => fn());
    };
  }, []);

  // 2. Listen to native Rust cursor hit, fullscreen, and window overlap events
  useEffect(() => {
    isWindowCoveringDockRef.current = isWindowCoveringDock;
  }, [isWindowCoveringDock]);

  useEffect(() => {
    invoke<boolean>("check_navbar_window_overlap")
      .then((val) => {
        const isCovered = Boolean(val);
        setIsWindowCoveringDock(isCovered);
        isWindowCoveringDockRef.current = isCovered;
      })
      .catch(() => { });

    const unlistenHit = listen<boolean>("navbar-cursor-hit", (event) => {
      const hit = Boolean(event.payload);
      isCursorInDockRef.current = hit;
      if (hit) {
        cancelHideAndShow();
        invoke("set_metrics_power_state", { state: "Active" }).catch(() => { });
      } else {
        if (isEffectiveAutoHideRef.current) {
          scheduleHide(800);
        } else {
          cancelHideAndShow();
        }
        invoke("set_metrics_power_state", { state: "Idle" }).catch(() => { });
      }
    });

    const unlistenFullscreen = listen<boolean>("navbar-fullscreen-state", (event) => {
      setIsFullscreenCovered(Boolean(event.payload));
    });

    const unlistenOverlap = listen<boolean>("navbar-window-overlap-state", (event) => {
      const isCovered = Boolean(event.payload);
      setIsWindowCoveringDock(isCovered);
      isWindowCoveringDockRef.current = isCovered;
    });

    return () => {
      unlistenHit.then((fn) => fn());
      unlistenFullscreen.then((fn) => fn());
      unlistenOverlap.then((fn) => fn());
    };
  }, [cancelHideAndShow, scheduleHide]);

  // Synchronize auto-hide state changes
  useEffect(() => {
    if (!isEffectiveAutoHide) {
      cancelHideAndShow();
    } else if (!isCursorInDockRef.current) {
      scheduleHide(800);
    }
  }, [isEffectiveAutoHide, cancelHideAndShow, scheduleHide]);

  // Handle slide-out completion and notify Rust
  const shouldSlideOut = !hasEntered || (isEffectiveAutoHide && !isDockVisible);

  useEffect(() => {
    if (isEffectiveAutoHide && !isDockVisible) {
      // Delay deactivation of DWM glass backdrop until the 500ms slide-out animation finishes (~420ms)
      const timer = window.setTimeout(() => {
        setIsDockSlidOut(true);
        invoke("set_navbar_auto_hide_state", {
          autoHide: true,
          isHidden: true,
        }).catch(() => { });
      }, 420);
      return () => clearTimeout(timer);
    } else {
      setIsDockSlidOut(false);
      invoke("set_navbar_auto_hide_state", {
        autoHide: Boolean(isEffectiveAutoHide),
        isHidden: false,
      }).catch(() => { });
    }
  }, [isEffectiveAutoHide, isDockVisible]);

  // Reset cached sync state whenever navbar is disabled so next enable always forces a sync
  useEffect(() => {
    if (!config.enabled) {
      lastSyncRef.current = {
        w: 0,
        h: 0,
        overhead: 0,
        pos: "",
        mon: "",
        isAnchored: false,
        dist: 0,
      };
      hasTriggeredEntranceRef.current = false;
      setHasEntered(false);
    }
  }, [config.enabled]);

  // 3. Report measured bounds to Rust for window centering & hit-test geometry
  const syncBounds = useCallback(
    async (
      width: number,
      height: number,
      overhead: number,
      extraWidth: number,
      force = false
    ) => {
      if (!config.enabled || width <= 0 || height <= 0) return;
      const pos = config.position || "bottom";
      const mon = config.monitorId || "primary";
      const isAnchoredBool = config.shape === "anchored";
      const currentDist = isAnchoredBool ? 0 : config.distanceFromEdge ?? 14;

      const isPositionOrMonitorChange =
        pos !== lastSyncRef.current.pos || mon !== lastSyncRef.current.mon;
      const isSizeSignificant =
        Math.abs(width - lastSyncRef.current.w) >= 12 ||
        Math.abs(height - lastSyncRef.current.h) >= 8 ||
        Math.abs(overhead - lastSyncRef.current.overhead) >= 8;
      const isAnchoredChange = isAnchoredBool !== lastSyncRef.current.isAnchored;
      const isDistChange = currentDist !== lastSyncRef.current.dist;

      if (force || isPositionOrMonitorChange || isSizeSignificant || isAnchoredChange || isDistChange) {
        lastSyncRef.current = {
          w: width,
          h: height,
          overhead,
          pos,
          mon,
          isAnchored: isAnchoredBool,
          dist: currentDist,
        };
        try {
          await invoke("sync_navbar_bounds", {
            width: Math.ceil(width),
            height: Math.ceil(height),
            position: pos,
            distanceFromEdge: currentDist,
            isAnchored: isAnchoredBool,
            overhead,
            extraWidth,
            monitorId: mon,
            autoHide: Boolean(isEffectiveAutoHideRef.current),
          });
          window.dispatchEvent(new Event("navbar-bounds-synced"));
          requestAnimationFrame(() => {
            window.dispatchEvent(new Event("navbar-bounds-synced"));
          });
        } catch (err) {
          console.error("Failed to sync navbar bounds:", err);
        }
      }

      if (!hasTriggeredEntranceRef.current) {
        hasTriggeredEntranceRef.current = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setHasEntered(true);
          });
        });
      }
    },
    [config.position, config.shape, config.distanceFromEdge, config.monitorId, config.enabled]
  );

  const [viewportScale, setViewportScale] = useState(1);

  // 4. ResizeObserver + MutationObserver to track dynamic dock content changes & auto-scale if exceeding monitor width
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;

    let debounceTimer: number | null = null;

    const measureAndSync = (force = false) => {
      if (!config.enabled) return;
      // While any popover/flyout is currently open, DO NOT move or resize the OS window!
      // The OS window has 420px of extraWidth headroom, comfortably fitting pill changes.
      // Moving the OS window via SetWindowPos while a user is clicking inside an open popover
      // causes the popover to bounce and shake across the desktop.
      const hasOpenFlyout = !!document.querySelector(
        ".navbar-preview-dark, [data-calc-module-root] .navbar-preview-dark, [data-module-popover]"
      );
      if (hasOpenFlyout && !force) {
        window.dispatchEvent(new Event("navbar-bounds-synced"));
        return;
      }

      // Use offset dimensions or bounding rect so absolute floating popups never contaminate dock size
      const naturalW = el.offsetWidth || el.getBoundingClientRect().width;
      const naturalH = el.offsetHeight || el.getBoundingClientRect().height;
      if (naturalW <= 0 || naturalH <= 0) return;

      const maxScreenW = Math.max(600, window.screen.availWidth - 48);
      const maxScreenH = Math.max(400, window.screen.availHeight - 48);
      const isVert = config.position === "left" || config.position === "right";

      let nextScale = 1;
      if (!isVert && naturalW > maxScreenW) {
        nextScale = Math.max(0.65, Number((maxScreenW / naturalW).toFixed(3)));
      } else if (isVert && naturalH > maxScreenH) {
        nextScale = Math.max(0.65, Number((maxScreenH / naturalH).toFixed(3)));
      }
      setViewportScale((prev) =>
        Math.abs(prev - nextScale) > 0.005 ? nextScale : prev
      );

      const effectiveW = Math.ceil(naturalW * nextScale);
      const effectiveH = Math.ceil(naturalH * nextScale);
      syncBounds(effectiveW, effectiveH, 380, 420, force);
    };

    const scheduleMeasure = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        measureAndSync();
      }, 32);
    };

    measureAndSync(true);
    const observer = new ResizeObserver(() => {
      scheduleMeasure();
    });
    observer.observe(el);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      observer.disconnect();
    };
  }, [config, syncBounds]);

  const getTriggerRect = (selector: string) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.left,
      y: r.top,
      width: r.width,
      height: r.height,
    };
  };

  // Triggers: Dispatches to Gili System Flyout if enabled, else delegates to native Windows
  const handleStartClick = () => {
    cancelHideAndShow();
    if (config.useGiliStart) {
      const rect = getTriggerRect('[data-flyout-trigger="start"]');
      invoke("toggle_taskbar_flyout", {
        payload: {
          target: "start",
          trigger_rect: rect,
          position: config.position || "bottom",
          theme: config.style === "liquid" ? "liquid" : "solid",
        },
      }).catch(() => { });
    } else {
      invoke("trigger_start_menu").catch(() => { });
    }
  };

  const handleSearchClick = () => {
    cancelHideAndShow();
    if (config.useGiliSearch) {
      const rect = getTriggerRect('[data-flyout-trigger="search"]');
      invoke("toggle_taskbar_flyout", {
        payload: {
          target: "search",
          trigger_rect: rect,
          position: config.position || "bottom",
          theme: config.style === "liquid" ? "liquid" : "solid",
        },
      }).catch(() => { });
    } else {
      invoke("trigger_windows_search").catch(() => { });
    }
  };

  const handleControlCenterClick = () => {
    cancelHideAndShow();
    if (config.useGiliQuickSettings) {
      const rect = getTriggerRect('[data-flyout-trigger="control_center"]');
      invoke("toggle_taskbar_flyout", {
        payload: {
          target: "quickSettings",
          trigger_rect: rect,
          position: config.position || "bottom",
          theme: config.style === "liquid" ? "liquid" : "solid",
        },
      }).catch(() => { });
    } else {
      invoke("trigger_quick_settings").catch(() => { });
    }
  };

  const handleVolumeClick = () => {
    cancelHideAndShow();
    if (config.useGiliVolumeOutput) {
      const rect =
        getTriggerRect('[data-flyout-trigger="volume"]') ||
        getTriggerRect('[data-flyout-trigger="control_center"]');
      invoke("toggle_taskbar_flyout", {
        payload: {
          target: "volume",
          trigger_rect: rect,
          position: config.position || "bottom",
          theme: config.style === "liquid" ? "liquid" : "solid",
        },
      }).catch(() => { });
    } else {
      invoke("trigger_volume_flyout").catch(() => { });
    }
  };

  const handleNotificationsClick = () => {
    cancelHideAndShow();
    if (config.useGiliNotificationsCalendar) {
      const rect = getTriggerRect('[data-flyout-trigger="notifications"]');
      invoke("toggle_taskbar_flyout", {
        payload: {
          target: "notificationsCalendar",
          trigger_rect: rect,
          position: config.position || "bottom",
          theme: config.style === "liquid" ? "liquid" : "solid",
        },
      }).catch(() => { });
    } else {
      invoke("trigger_notification_center").catch(() => { });
    }
  };

  const handleClockClick = () => {
    cancelHideAndShow();
    if (config.useGiliNotificationsCalendar) {
      const rect = getTriggerRect('[data-flyout-trigger="calendar"]');
      invoke("toggle_taskbar_flyout", {
        payload: {
          target: "notificationsCalendar",
          trigger_rect: rect,
          position: config.position || "bottom",
          theme: config.style === "liquid" ? "liquid" : "solid",
        },
      }).catch(() => { });
    } else {
      invoke("trigger_notification_center").catch(() => { });
    }
  };

  const handlePreviewStateChange = useCallback((isShowing: boolean) => {
    isPopupOpenRef.current = isShowing;
    invoke("set_navbar_popup_open", { open: isShowing }).catch(() => { });
    if (isShowing) {
      cancelHideAndShow();
    }
  }, [cancelHideAndShow]);

  const pos = config.position || "bottom";
  const positionContainerClass =
    pos === "top"
      ? `top-0 left-1/2 -translate-x-1/2 ${shouldSlideOut
        ? "-translate-y-[calc(100%+24px)] opacity-0"
        : "translate-y-0 opacity-100"
      }`
      : pos === "left"
        ? `left-0 top-1/2 -translate-y-1/2 ${shouldSlideOut
          ? "-translate-x-[calc(100%+24px)] opacity-0"
          : "translate-x-0 opacity-100"
        }`
        : pos === "right"
          ? `right-0 top-1/2 -translate-y-1/2 ${shouldSlideOut
            ? "translate-x-[calc(100%+24px)] opacity-0"
            : "translate-x-0 opacity-100"
          }`
          : `bottom-0 left-1/2 -translate-x-1/2 ${shouldSlideOut
            ? "translate-y-[calc(100%+24px)] opacity-0"
            : "translate-y-0 opacity-100"
          }`;

  if (!config.enabled) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 w-full h-full select-none overflow-visible bg-transparent pointer-events-none transition-opacity duration-200 ${isFullscreenCovered && !isDockVisible ? "opacity-0" : "opacity-100"
        }`}
    >
      <div
        style={{
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className={`absolute ${positionContainerClass} w-max h-max shrink-0 pointer-events-auto transition-[transform,opacity] duration-500`}
        onMouseEnter={() => {
          isCursorInDockRef.current = true;
          cancelHideAndShow();
        }}
        onMouseLeave={() => {
          isCursorInDockRef.current = false;
          if (isEffectiveAutoHideRef.current) {
            scheduleHide(800);
          }
        }}
      >
        <div
          style={
            viewportScale < 1
              ? {
                transform: `scale(${viewportScale})`,
                transformOrigin:
                  pos === "top"
                    ? "top center"
                    : pos === "left"
                      ? "center left"
                      : pos === "right"
                        ? "center right"
                        : "bottom center",
              }
              : undefined
          }
        >
          <NavbarDock
            ref={dockRef}
            config={config}
            isHidden={isDockSlidOut || isFullscreenCovered}
            onStartClick={handleStartClick}
            onSearchClick={handleSearchClick}
            onControlCenterClick={handleControlCenterClick}
            onNotificationsClick={handleNotificationsClick}
            onClockClick={handleClockClick}
            onVolumeClick={handleVolumeClick}
            onPreviewStateChange={handlePreviewStateChange}
          />
        </div>
      </div>
    </div>
  );
};
