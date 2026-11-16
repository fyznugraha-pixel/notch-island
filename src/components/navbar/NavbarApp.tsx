import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import {
  availableMonitors,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";
import { NavbarConfig } from "../../types/navbar";
import {
  getCachedNavbarConfigSync,
  loadNavbarConfig,
  subscribeToNavbarConfig,
} from "../../services/navbarConfigService";
import {
  getTaskbarProStatus,
  subscribeTaskbarProStatus,
} from "../../services/taskbarProService";
import { NavbarDock, NavbarSurfaceThemeInfo } from "./NavbarDock";

function applyNavbarActivation(cfg: NavbarConfig, isProLocked: boolean) {
  if (isProLocked || !cfg.enabled) {
    invoke("close_navbar_window").catch(() => {});
    invoke("set_windows_taskbar_visible", { visible: true }).catch(() => {});
    return;
  }

  invoke("open_navbar_window").catch(() => {});
  invoke("set_windows_taskbar_visible", {
    visible: !cfg.hideWindowsTaskbar,
  }).catch(() => {});
}

export const NavbarApp: React.FC = () => {
  const [config, setConfig] = useState<NavbarConfig>(() =>
    getCachedNavbarConfigSync()
  );
  const [isDockVisible, setIsDockVisible] = useState(true);
  const [isFullscreenCovered, setIsFullscreenCovered] = useState(false);
  const [isWindowCoveringDock, setIsWindowCoveringDock] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [isLightSurface, setIsLightSurface] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("light", isLightSurface);
    document.documentElement.setAttribute(
      "data-taskbar-light",
      isLightSurface ? "true" : "false"
    );
  }, [isLightSurface]);
  const [resolvedSurfaceTheme, setResolvedSurfaceTheme] = useState<{
    isTranslucent: boolean;
    opacityPct: number;
  } | null>(null);
  const handleSurfaceThemeChange = useCallback((info: NavbarSurfaceThemeInfo) => {
    setIsLightSurface((prev) => (prev === info.isLight ? prev : info.isLight));
    setResolvedSurfaceTheme((prev) =>
      prev &&
      prev.isTranslucent === info.isTranslucent &&
      prev.opacityPct === info.opacityPct
        ? prev
        : { isTranslucent: info.isTranslucent, opacityPct: info.opacityPct }
    );
  }, []);
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);

  const dockRef = useRef<HTMLDivElement>(null);
  const hasTriggeredEntranceRef = useRef(false);
  const isCursorInDockRef = useRef(false);
  const isWindowCoveringDockRef = useRef(false);
  const isFlyoutOpenRef = useRef(false);
  const autoHideEnabledRef = useRef(!!config.autoHide);
  const autoHideModeRef = useRef<"normal" | "maxsize">(
    config.autoHideMode || "normal",
  );
  const monitorBoundsRef = useRef<{ w: number; h: number }>({
    w: window.screen.availWidth || 1280,
    h: window.screen.availHeight || 800,
  });
  const measureAndSyncRef = useRef<((force?: boolean) => void) | null>(null);
  const lastSyncRef = useRef<{
    w: number;
    h: number;
    overhead: number;
    pos: string;
    mon: string;
    isAnchored: boolean;
    dist: number;
    style: string;
    opacity: number;
    cornerRadius: number;
    isLightSurface: boolean;
  }>({
    w: 0,
    h: 0,
    overhead: 0,
    pos: "",
    mon: "",
    isAnchored: false,
    dist: 0,
    style: "",
    opacity: -1,
    cornerRadius: -1,
    isLightSurface: false,
  });
  const autoHideTimerRef = useRef<number | null>(null);
  const isProLockedRef = useRef(true);
  const latestConfigRef = useRef<NavbarConfig | null>(null);

  // 1. Initial config load & live sync
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      loadNavbarConfig(),
      getTaskbarProStatus().catch(() => null),
    ]).then(([cfg, proStatus]) => {
      if (cancelled) return;
      if (proStatus) {
        isProLockedRef.current = proStatus.isLocked;
      }
      const activeCfg = latestConfigRef.current ?? cfg;
      latestConfigRef.current = activeCfg;
      setConfig(activeCfg);
      if (proStatus !== null) {
        applyNavbarActivation(activeCfg, proStatus.isLocked);
      }
      if (proStatus && !proStatus.isLocked && activeCfg.enabled) {
        requestAnimationFrame(() => {
          measureAndSyncRef.current?.(true);
        });
      }
    });

    const handleConfigUpdate = (payload: NavbarConfig) => {
      latestConfigRef.current = payload;
      setConfig(payload);
      applyNavbarActivation(payload, isProLockedRef.current);
      requestAnimationFrame(() => {
        measureAndSyncRef.current?.(true);
      });
    };

    const unsubscribePro = subscribeTaskbarProStatus((status) => {
      isProLockedRef.current = status.isLocked;
      if (!latestConfigRef.current) return;
      applyNavbarActivation(latestConfigRef.current, status.isLocked);
      if (!status.isLocked && latestConfigRef.current.enabled) {
        requestAnimationFrame(() => {
          measureAndSyncRef.current?.(true);
        });
      }
    });

    const unsubscribeBroadcast = subscribeToNavbarConfig(handleConfigUpdate);

    const unlistenPromise1 = listen<NavbarConfig>("navbar_config_updated", (event) => {
      if (event.payload) handleConfigUpdate(event.payload);
    });

    const unlistenPromise2 = listen<NavbarConfig>("gili-navbar-config-sync", (event) => {
      if (event.payload) handleConfigUpdate(event.payload);
    });

    const unlistenSyncBounds = listen("navbar-request-sync-bounds", () => {
      requestAnimationFrame(() => {
        measureAndSyncRef.current?.(true);
      });
    });

    return () => {
      cancelled = true;
      unsubscribePro();
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
    autoHideEnabledRef.current = !!config.autoHide;
    autoHideModeRef.current = config.autoHideMode || "normal";
  }, [config.autoHide, config.autoHideMode]);

  const clearAutoHideTimer = useCallback(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  }, []);

  const AUTO_HIDE_IDLE_DELAY_MS = 1000;

  const scheduleAutoHideIfIdle = useCallback(
    (delayMs = AUTO_HIDE_IDLE_DELAY_MS) => {
      clearAutoHideTimer();
      const enqueueHideCheck = (waitMs: number) => {
        if (
          !autoHideEnabledRef.current ||
          isFlyoutOpenRef.current ||
          isCursorInDockRef.current
        ) {
          return;
        }
        const wantsHide =
          autoHideModeRef.current === "maxsize" ||
          isWindowCoveringDockRef.current;
        if (!wantsHide) {
          setIsDockVisible(true);
          return;
        }
        autoHideTimerRef.current = window.setTimeout(() => {
          autoHideTimerRef.current = null;
          if (
            !autoHideEnabledRef.current ||
            isCursorInDockRef.current ||
            isFlyoutOpenRef.current
          ) {
            return;
          }
          const stillNeedsHide =
            autoHideModeRef.current === "maxsize" ||
            isWindowCoveringDockRef.current;
          if (!stillNeedsHide) {
            setIsDockVisible(true);
            return;
          }
          // Wait for closing preview cards or module popovers to finish their unmount animation.
          if (document.querySelector("[data-module-popover]")) {
            enqueueHideCheck(220);
            return;
          }
          setIsDockVisible(false);
        }, waitMs);
      };
      enqueueHideCheck(delayMs);
    },
    [clearAutoHideTimer],
  );

  useEffect(() => {
    invoke<boolean>("check_navbar_window_overlap")
      .then((val) => {
        setIsWindowCoveringDock(!!val);
        isWindowCoveringDockRef.current = !!val;
      })
      .catch(() => { });

    const unlistenHit = listen<boolean>("navbar-cursor-hit", (event) => {
      const hit = !!event.payload;
      isCursorInDockRef.current = hit;
      if (hit) {
        clearAutoHideTimer();
        setIsDockVisible(true);
        invoke("set_metrics_power_state", { state: "Active" }).catch(() => { });
      } else {
        if (!config.autoHide) {
          clearAutoHideTimer();
          setIsDockVisible(true);
        } else if (!isFlyoutOpenRef.current) {
          const mode = config.autoHideMode || "normal";
          if (mode === "maxsize" || isWindowCoveringDockRef.current) {
            scheduleAutoHideIfIdle(AUTO_HIDE_IDLE_DELAY_MS);
          } else {
            clearAutoHideTimer();
            setIsDockVisible(true);
          }
        }
        invoke("set_metrics_power_state", { state: "Idle" }).catch(() => { });
      }
    });

    const unlistenFullscreen = listen<boolean>("navbar-fullscreen-state", (event) => {
      setIsFullscreenCovered(!!event.payload);
    });

    const unlistenOverlap = listen<boolean>("navbar-window-overlap-state", (event) => {
      const isCovered = !!event.payload;
      setIsWindowCoveringDock(isCovered);
      isWindowCoveringDockRef.current = isCovered;
    });

    const unlistenFlyoutState = listen<{ isOpen?: boolean }>(
      "taskbar-flyout-state-changed",
      (event) => {
        const nextOpen = Boolean(event.payload?.isOpen);
        isFlyoutOpenRef.current = nextOpen;
        setIsFlyoutOpen(nextOpen);
        if (nextOpen) {
          clearAutoHideTimer();
          setIsDockVisible(true);
        }
      },
    );

    return () => {
      unlistenHit.then((fn) => fn());
      unlistenFullscreen.then((fn) => fn());
      unlistenOverlap.then((fn) => fn());
      unlistenFlyoutState.then((fn) => fn());
    };
  }, [config.autoHide, config.autoHideMode, clearAutoHideTimer, scheduleAutoHideIfIdle]);

  // Keep dock visible during open overlays/exposed desktop; otherwise auto-hide smoothly
  useEffect(() => {
    if (!config.autoHide || isFlyoutOpen) {
      clearAutoHideTimer();
      setIsDockVisible(true);
      return;
    }
    const mode = config.autoHideMode || "normal";
    const wantsHide = mode === "maxsize" || isWindowCoveringDock;
    if (!wantsHide) {
      clearAutoHideTimer();
      setIsDockVisible(true);
      return;
    }
    if (!isCursorInDockRef.current) {
      scheduleAutoHideIfIdle(AUTO_HIDE_IDLE_DELAY_MS);
    }
  }, [
    config.autoHide,
    config.autoHideMode,
    isWindowCoveringDock,
    isFlyoutOpen,
    clearAutoHideTimer,
    scheduleAutoHideIfIdle,
  ]);

  // Keep Rust informed of auto-hide state so hit-testing switches to 2px bezel edge when hidden
  const isEffectiveAutoHide =
    config.autoHide &&
    ((config.autoHideMode || "normal") === "maxsize" || isWindowCoveringDock);
  const shouldSlideOut = !hasEntered || (isEffectiveAutoHide && !isDockVisible);

  useEffect(() => {
    invoke("set_navbar_auto_hide_state", {
      autoHide: !!isEffectiveAutoHide,
      isHidden: isEffectiveAutoHide && !isDockVisible,
      autoHideEnabled: !!config.autoHide,
    }).catch(() => { });
  }, [config.autoHide, isEffectiveAutoHide, isDockVisible]);

  useEffect(() => {
    invoke("set_navbar_backdrop_hidden", {
      hidden: !config.enabled || shouldSlideOut || isFullscreenCovered,
    }).catch(() => { });
  }, [config.enabled, shouldSlideOut, isFullscreenCovered]);

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
        style: "",
        opacity: -1,
        cornerRadius: -1,
        isLightSurface: false,
      };
      hasTriggeredEntranceRef.current = false;
      setHasEntered(false);
    }
  }, [config.enabled]);

  // Resolve target monitor logical bounds via Tauri instead of primary window.screen
  useEffect(() => {
    if (!config.enabled) return;
    let active = true;
    const resolveMonitor = async () => {
      try {
        const targetId = config.monitorId || "primary";
        const monitors = await availableMonitors();
        let chosen: Monitor | null = null;
        if (targetId && targetId !== "primary") {
          chosen =
            monitors.find((m, idx) => {
              const name = m.name || "";
              return (
                name === targetId ||
                `monitor-${idx}` === targetId ||
                `DISPLAY${idx + 1}` === targetId ||
                name.endsWith(targetId)
              );
            }) ?? null;
        }
        if (!chosen) {
          chosen = (await primaryMonitor()) ?? monitors[0] ?? null;
        }
        if (active && chosen) {
          const sf = chosen.scaleFactor || 1;
          monitorBoundsRef.current = {
            w: Math.round(chosen.size.width / sf),
            h: Math.round(chosen.size.height / sf),
          };
          measureAndSyncRef.current?.(true);
        }
      } catch {}
    };
    void resolveMonitor();
    return () => {
      active = false;
    };
  }, [config.monitorId, config.enabled]);

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
      const styleVal = resolvedSurfaceTheme
        ? resolvedSurfaceTheme.isTranslucent
          ? "liquid"
          : "solid"
        : config.style || "solid";
      const opacityVal = resolvedSurfaceTheme
        ? resolvedSurfaceTheme.opacityPct
        : config.opacity ?? 100;
      const radiusVal = config.cornerRadius ?? 15;

      const isPositionOrMonitorChange =
        pos !== lastSyncRef.current.pos || mon !== lastSyncRef.current.mon;
      const isSizeSignificant =
        Math.abs(width - lastSyncRef.current.w) >= 1 ||
        Math.abs(height - lastSyncRef.current.h) >= 1 ||
        Math.abs(overhead - lastSyncRef.current.overhead) >= 8;
      const isAnchoredChange = isAnchoredBool !== lastSyncRef.current.isAnchored;
      const isDistChange = currentDist !== lastSyncRef.current.dist;
      const isLookChange =
        styleVal !== lastSyncRef.current.style ||
        opacityVal !== lastSyncRef.current.opacity ||
        radiusVal !== lastSyncRef.current.cornerRadius ||
        isLightSurface !== lastSyncRef.current.isLightSurface;

      if (
        force ||
        isPositionOrMonitorChange ||
        isSizeSignificant ||
        isAnchoredChange ||
        isDistChange ||
        isLookChange
      ) {
        lastSyncRef.current = {
          w: width,
          h: height,
          overhead,
          pos,
          mon,
          isAnchored: isAnchoredBool,
          dist: currentDist,
          style: styleVal,
          opacity: opacityVal,
          cornerRadius: radiusVal,
          isLightSurface,
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
            style: styleVal,
            opacity: opacityVal,
            cornerRadius: radiusVal,
            isLightSurface,
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
    [
      config.position,
      config.shape,
      config.distanceFromEdge,
      config.monitorId,
      config.enabled,
      config.style,
      config.opacity,
      config.cornerRadius,
      isLightSurface,
      resolvedSurfaceTheme,
    ]
  );

  const [viewportScale, setViewportScale] = useState(1);

  const measureAndSync = useCallback(
    (force = false) => {
      const el = dockRef.current;
      if (!el || !config.enabled) return;

      const hasOpenFlyout = !!document.querySelector(
        ".navbar-preview-dark, [data-calc-module-root] .navbar-preview-dark, [data-module-popover], [data-app-context-menu], [data-navbar-flyout]"
      );
      if (hasOpenFlyout && !force) {
        return;
      }

      const naturalW = el.offsetWidth || el.getBoundingClientRect().width;
      const naturalH = el.offsetHeight || el.getBoundingClientRect().height;
      if (naturalW <= 0 || naturalH <= 0) return;

      const maxScreenW = Math.max(600, monitorBoundsRef.current.w - 48);
      const maxScreenH = Math.max(400, monitorBoundsRef.current.h - 48);
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
      const fullSpan = Math.max(
        1200,
        isVert ? monitorBoundsRef.current.h : monitorBoundsRef.current.w,
      );
      void syncBounds(effectiveW, effectiveH, isVert ? 420 : 380, fullSpan, force);
    },
    [config.enabled, config.position, syncBounds]
  );

  useEffect(() => {
    measureAndSyncRef.current = measureAndSync;
  }, [measureAndSync]);

  // 4. ResizeObserver tracks dynamic dock content changes without recreating on color/toggle updates
  useEffect(() => {
    const el = dockRef.current;
    if (!el || !config.enabled) return;

    let rafId: number | null = null;
    const scheduleMeasure = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        measureAndSyncRef.current?.();
      });
    };

    const observer = new ResizeObserver(() => {
      scheduleMeasure();
    });
    observer.observe(el);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [config.enabled]);

  // Sync immediately when layout or look config changes
  useEffect(() => {
    measureAndSync(true);
  }, [
    measureAndSync,
    config.shape,
    config.distanceFromEdge,
    config.style,
    config.opacity,
    config.cornerRadius,
    config.iconSize,
    config.iconSpacing,
    isLightSurface,
    resolvedSurfaceTheme,
  ]);

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

  // Triggers: Dismiss open module popovers then dispatch to Gili Flyout or native Windows
  const dispatchFlyoutTrigger = (
    useGili: boolean | undefined,
    selector: string,
    target: string,
    nativeCommand: string,
    fallbackSelector?: string,
  ) => {
    emit("navbar-dismiss-popovers").catch(() => {});
    if (useGili) {
      const rect =
        getTriggerRect(selector) ||
        (fallbackSelector ? getTriggerRect(fallbackSelector) : undefined);
      invoke("toggle_taskbar_flyout", {
        payload: {
          target,
          trigger_rect: rect,
          position: config.position || "bottom",
          theme: config.style === "liquid" ? "liquid" : "solid",
        },
      }).catch(() => {});
    } else {
      invoke(nativeCommand).catch(() => {});
    }
  };

  const handleStartClick = () =>
    dispatchFlyoutTrigger(
      config.useGiliStart,
      '[data-flyout-trigger="start"]',
      "start",
      "trigger_start_menu",
    );

  const handleSearchClick = () =>
    dispatchFlyoutTrigger(
      config.useGiliSearch,
      '[data-flyout-trigger="search"]',
      "search",
      "trigger_windows_search",
    );

  const handleControlCenterClick = () =>
    dispatchFlyoutTrigger(
      config.useGiliQuickSettings,
      '[data-flyout-trigger="control_center"]',
      "quickSettings",
      "trigger_quick_settings",
    );

  const handleVolumeClick = () =>
    dispatchFlyoutTrigger(
      config.useGiliVolumeOutput,
      '[data-flyout-trigger="volume"]',
      "volume",
      "trigger_volume_flyout",
      '[data-flyout-trigger="control_center"]',
    );

  const handleNotificationsClick = () =>
    dispatchFlyoutTrigger(
      config.useGiliNotificationsCalendar,
      '[data-flyout-trigger="notifications"]',
      "notificationsCalendar",
      "trigger_notification_center",
    );

  const handleClockClick = () =>
    dispatchFlyoutTrigger(
      config.useGiliNotificationsCalendar,
      '[data-flyout-trigger="calendar"]',
      "notificationsCalendar",
      "trigger_notification_center",
    );

  const handleTrayClick = () =>
    dispatchFlyoutTrigger(
      Boolean(config.useGiliTray) || Boolean(config.hideWindowsTaskbar),
      '[data-flyout-trigger="tray"]',
      "tray",
      "trigger_hidden_tray",
    );

  const handlePreviewStateChange = useCallback((_isShowing: boolean) => {
    // WindowPreviewCard registers its exact bounding rect via navbarPopupService.
  }, []);

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
      className={`fixed inset-0 w-full h-full select-none overflow-visible bg-transparent pointer-events-none transition-opacity duration-200 ${isFullscreenCovered ? "opacity-0" : "opacity-100"
        }`}
    >
      <div
        style={{
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className={`absolute ${positionContainerClass} w-max h-max shrink-0 pointer-events-auto transition-[transform,opacity] duration-500`}
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
            isHidden={shouldSlideOut || isFullscreenCovered}
            onStartClick={handleStartClick}
            onSearchClick={handleSearchClick}
            onControlCenterClick={handleControlCenterClick}
            onNotificationsClick={handleNotificationsClick}
            onClockClick={handleClockClick}
            onVolumeClick={handleVolumeClick}
            onTrayClick={handleTrayClick}
            onPreviewStateChange={handlePreviewStateChange}
            onLightSurfaceChange={setIsLightSurface}
            onSurfaceThemeChange={handleSurfaceThemeChange}
          />
        </div>
      </div>
    </div>
  );
};
