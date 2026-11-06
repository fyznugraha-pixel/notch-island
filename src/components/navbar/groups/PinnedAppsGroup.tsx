import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { Tooltip } from "../../ui/Tooltip";
import { WindowPreviewCard, WindowPreviewItem } from "../WindowPreviewCard";
import { AnimatePresence, motion } from "framer-motion";
import { NavbarIconTheme, NavbarPosition } from "../../../types/navbar";
import { hexToRgba } from "../../../services/navbarConfigService";
import { renderAppIcon, normalizeIconUrl } from "./appIcons";
import { useWindowsPinnedApps } from "../../../hooks/useWindowsPinnedApps";
import { matchesAppId, getRunningAppMeta } from "./pinnedAppsHelpers";
import { AppContextMenu } from "./AppContextMenu";

export interface NavbarAppItem {
  id: string;
  name: string;
  activeTitle?: string;
  icon?: string;
  iconType?:
    | "folder"
    | "browser"
    | "code"
    | "terminal"
    | "settings"
    | "spotify"
    | "discord"
    | "whatsapp"
    | "brave";
  isRunning: boolean;
  isActive: boolean;
  hwnd?: number;
  windows?: WindowPreviewItem[];
  targetPath?: string;
  arguments?: string;
  lnkPath?: string;
}

interface RunningWindowInfo {
  hwnd: number;
  title: string;
  process_name: string;
  is_active: boolean;
  is_minimized: boolean;
  icon_base64?: string;
}

interface PinnedAppsGroupProps {
  apps?: NavbarAppItem[];
  iconSize?: number;
  iconTheme?: NavbarIconTheme;
  position?: NavbarPosition;
  magnifyOnHover?: boolean;
  windowPreviews?: boolean;
  showAppLabels?: boolean;
  accentColor?: string;
  isPreview?: boolean;
  showRunningApps?: boolean;
  onAppClick?: (app: NavbarAppItem, forceNewInstance?: boolean) => void;
  onPreviewStateChange?: (isShowing: boolean) => void;
}

const APP_ORDER_KEY = "gili_navbar_app_order_v1";
const APP_UNPINNED_KEY = "gili_navbar_unpinned_ids_v1";
const APP_EXTRA_PINNED_KEY = "gili_navbar_extra_pinned_v1";

const DEFAULT_PINNED_APPS: NavbarAppItem[] = [
  {
    id: "chrome",
    name: "Google Chrome",
    iconType: "browser",
    isRunning: false,
    isActive: false,
  },
  {
    id: "spotify",
    name: "Spotify",
    iconType: "spotify",
    isRunning: false,
    isActive: false,
  },
  {
    id: "explorer",
    name: "File Explorer",
    iconType: "folder",
    isRunning: false,
    isActive: false,
  },
  {
    id: "brave",
    name: "Brave",
    iconType: "brave",
    isRunning: false,
    isActive: false,
  },
];

export const PinnedAppsGroup: React.FC<PinnedAppsGroupProps> = ({
  apps = DEFAULT_PINNED_APPS,
  iconSize = 40,
  iconTheme = "fluent",
  position = "bottom",
  magnifyOnHover = false,
  windowPreviews = true,
  showAppLabels = false,
  accentColor = "#0a84ff",
  isPreview = false,
  showRunningApps = true,
  onAppClick,
  onPreviewStateChange,
}) => {
  const [hoveredAppId, setHoveredAppId] = useState<string | null>(null);
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [contextMenuAppId, setContextMenuAppId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const [runningWindows, setRunningWindows] = useState<RunningWindowInfo[]>([]);

  const [customOrder, setCustomOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(APP_ORDER_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [unpinnedIds, setUnpinnedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(APP_UNPINNED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [extraPinnedApps, setExtraPinnedApps] = useState<NavbarAppItem[]>(() => {
    try {
      const raw = localStorage.getItem(APP_EXTRA_PINNED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [draggingAppId, setDraggingAppId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const innerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const dragSessionRef = useRef<{
    id: string;
    app: NavbarAppItem;
    startX: number;
    startY: number;
    pointerX: number;
    pointerY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    hasMoved: boolean;
    shiftKey: boolean;
    lastSwapAt: number;
  } | null>(null);

  const latestStateRef = useRef<{
    liveApps: NavbarAppItem[];
    unpinnedIds: string[];
    extraPinnedApps: NavbarAppItem[];
    isVertical: boolean;
  }>({
    liveApps: [],
    unpinnedIds: [],
    extraPinnedApps: [],
    isVertical: false,
  });

  const isVertical = position === "left" || position === "right";
  const { pinnedApps: windowsPinnedApps } = useWindowsPinnedApps(true);

  useEffect(() => {
    const unlistenPromise = listen<{
      order?: string[];
      unpinned?: string[];
      extra?: NavbarAppItem[];
    }>("gili-navbar-apps-sync", (ev) => {
      if (ev.payload.order) setCustomOrder(ev.payload.order);
      if (ev.payload.unpinned) setUnpinnedIds(ev.payload.unpinned);
      if (ev.payload.extra) setExtraPinnedApps(ev.payload.extra);
    });
    return () => {
      unlistenPromise.then((u) => u());
    };
  }, []);

  const broadcastAppsState = (
    nextOrder: string[],
    nextUnpinned: string[],
    nextExtra: NavbarAppItem[]
  ) => {
    try {
      localStorage.setItem(APP_ORDER_KEY, JSON.stringify(nextOrder));
      localStorage.setItem(APP_UNPINNED_KEY, JSON.stringify(nextUnpinned));
      localStorage.setItem(APP_EXTRA_PINNED_KEY, JSON.stringify(nextExtra));
    } catch {}
    emit("gili-navbar-apps-sync", {
      order: nextOrder,
      unpinned: nextUnpinned,
      extra: nextExtra,
    }).catch(() => {});
  };

  useEffect(() => {
    if (isPreview) return;
    let isCancelled = false;
    const syncWindows = async () => {
      try {
        const windows = await invoke<RunningWindowInfo[]>("get_running_windows");
        if (!isCancelled && windows) {
          setRunningWindows(windows);
        }
      } catch {}
    };

    syncWindows();
    const interval = setInterval(syncWindows, 800);
    const handleFastSync = () => {
      syncWindows();
    };
    window.addEventListener("gili_sync_running_windows", handleFastSync);
    return () => {
      isCancelled = true;
      clearInterval(interval);
      window.removeEventListener("gili_sync_running_windows", handleFastSync);
    };
  }, [isPreview]);

  // 1. Base pinned apps from Windows Taskband + extra user-pinned apps, minus unpinned
  const rawBasePinned: NavbarAppItem[] =
    windowsPinnedApps.length > 0
      ? windowsPinnedApps.map((wpa) => ({
          id: wpa.id,
          name: wpa.name,
          icon: normalizeIconUrl(wpa.icon_base64),
          iconType: (wpa.icon_type as any) || undefined,
          targetPath: wpa.target_path,
          arguments: wpa.arguments,
          lnkPath: wpa.lnk_path,
          isRunning: false,
          isActive: false,
        }))
      : apps;

  const mergedPinnedMap = new Map<string, NavbarAppItem>();
  rawBasePinned.forEach((a) => {
    if (!unpinnedIds.includes(a.id)) mergedPinnedMap.set(a.id, a);
  });
  extraPinnedApps.forEach((a) => {
    if (!unpinnedIds.includes(a.id) && !mergedPinnedMap.has(a.id)) {
      mergedPinnedMap.set(a.id, a);
    }
  });
  const basePinnedApps = Array.from(mergedPinnedMap.values());

  // 2. Match pinned apps with live running windows
  const matchedHwnds = new Set<number>();
  const livePinnedApps: NavbarAppItem[] = basePinnedApps.map((app) => {
    const allMatches = runningWindows.filter((w) => {
      const p = w.process_name.toLowerCase();
      if (app.targetPath && p && app.targetPath.toLowerCase().includes(p)) {
        return true;
      }
      return matchesAppId(app.id, p, w.title);
    });

    allMatches.forEach((w) => matchedHwnds.add(w.hwnd));

    if (isPreview) {
      const isDemoActive =
        app.id === "chrome" || app.name.toLowerCase().includes("chrome");
      const isDemoRunning =
        isDemoActive ||
        app.id === "explorer" ||
        app.id === "spotify" ||
        app.name.toLowerCase().includes("explorer");
      return {
        ...app,
        isRunning: isDemoRunning,
        isActive: isDemoActive,
      };
    }

    const isRunning = allMatches.length > 0;
    const activeWin = allMatches.find((w) => w.is_active);
    const isActive = activeWin !== undefined;
    const hwnd = activeWin ? activeWin.hwnd : allMatches[0]?.hwnd;
    const activeTitle = activeWin?.title || allMatches[0]?.title || app.name;
    const rawLive = app.icon || allMatches.find((w) => w.icon_base64)?.icon_base64;
    const liveIcon = normalizeIconUrl(rawLive);

    const windowsList: WindowPreviewItem[] = isRunning
      ? allMatches.map((w) => ({
          id: `win-${w.hwnd}`,
          hwnd: w.hwnd,
          title: w.title || app.name,
          icon: normalizeIconUrl(w.icon_base64) || liveIcon,
          isMinimized: w.is_minimized,
        }))
      : app.windows || [];

    return {
      ...app,
      icon: liveIcon,
      activeTitle,
      isRunning,
      isActive,
      hwnd,
      windows: windowsList,
    };
  });

  // 3. Collect unpinned running applications
  const unpinnedRunningApps: NavbarAppItem[] = [];
  if (showRunningApps && !isPreview) {
    const processGroupMap = new Map<string, RunningWindowInfo[]>();

    runningWindows.forEach((w) => {
      if (matchedHwnds.has(w.hwnd)) return;
      const p = w.process_name.toLowerCase();
      const isAlreadyPinned = basePinnedApps.some(
        (pinned) =>
          matchesAppId(pinned.id, p, w.title) ||
          (pinned.targetPath && pinned.targetPath.toLowerCase().includes(p))
      );
      if (isAlreadyPinned) return;

      const existing = processGroupMap.get(p) || [];
      existing.push(w);
      processGroupMap.set(p, existing);
    });

    processGroupMap.forEach((windows, procKey) => {
      const meta = getRunningAppMeta(procKey, windows[0]?.title || procKey);
      if (basePinnedApps.some((p) => p.id === meta.id)) return;

      const activeWin = windows.find((w) => w.is_active);
      const isActive = activeWin !== undefined;
      const hwnd = activeWin ? activeWin.hwnd : windows[0]?.hwnd;
      const rawAppIcon = windows.find((w) => w.icon_base64)?.icon_base64 || undefined;
      const appIcon = normalizeIconUrl(rawAppIcon);

      unpinnedRunningApps.push({
        id: meta.id,
        name: meta.name,
        activeTitle: activeWin?.title || windows[0]?.title || meta.name,
        icon: appIcon,
        iconType: meta.iconType,
        isRunning: true,
        isActive,
        hwnd,
        windows: windows.map((w) => ({
          id: `win-${w.hwnd}`,
          hwnd: w.hwnd,
          title: w.title || meta.name,
          icon: normalizeIconUrl(w.icon_base64) || appIcon,
          isMinimized: w.is_minimized,
        })),
      });
    });
  }

  const combinedApps = [...livePinnedApps, ...unpinnedRunningApps];

  // Apply custom user drag order if any
  const liveApps = [...combinedApps].sort((a, b) => {
    const idxA = customOrder.indexOf(a.id);
    const idxB = customOrder.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return 0;
  });

  latestStateRef.current = {
    liveApps,
    unpinnedIds,
    extraPinnedApps,
    isVertical,
  };

  const applyDraggedButtonTransform = () => {
    const drag = dragSessionRef.current;
    if (!drag || !drag.hasMoved) return;
    const container = containerRef.current;
    const slotEl = slotRefs.current.get(drag.id);
    const innerEl = innerRefs.current.get(drag.id);
    if (!container || !slotEl || !innerEl) return;

    const cRect = container.getBoundingClientRect();
    const naturalLeft = cRect.left + slotEl.offsetLeft;
    const naturalTop = cRect.top + slotEl.offsetTop;

    const dx = latestStateRef.current.isVertical
      ? 0
      : drag.pointerX - drag.grabOffsetX - naturalLeft;
    const dy = latestStateRef.current.isVertical
      ? drag.pointerY - drag.grabOffsetY - naturalTop
      : 0;

    innerEl.style.transition = "none";
    innerEl.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.08)`;
  };

  // Keep dragged button locked under cursor right after a swap re-orders the DOM
  useLayoutEffect(() => {
    if (draggingAppId) {
      applyDraggedButtonTransform();
    }
  }, [customOrder, draggingAppId]);

  // Window-level drag tracking with layout-neutral offsetLeft/offsetWidth (zero oscillation)
  useEffect(() => {
    const handleWinPointerMove = (e: PointerEvent) => {
      const drag = dragSessionRef.current;
      if (!drag) return;

      drag.pointerX = e.clientX;
      drag.pointerY = e.clientY;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.hasMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        drag.hasMoved = true;
        setDraggingAppId(drag.id);
        setHoveredAppId(null);
        setHoveredSlotId(null);
        setHoveredIndex(null);
        setContextMenuAppId(null);
        invoke("set_navbar_popup_open", { open: true }).catch(() => {});
      }

      if (drag.hasMoved) {
        applyDraggedButtonTransform();

        const now = performance.now();
        if (now - drag.lastSwapAt < 75) return;

        const container = containerRef.current;
        if (!container) return;
        const cRect = container.getBoundingClientRect();

        const {
          liveApps: curApps,
          unpinnedIds: curUnpinned,
          extraPinnedApps: curExtra,
          isVertical: vert,
        } = latestStateRef.current;

        const currentIds = curApps.map((a) => a.id);
        const fromIdx = currentIds.indexOf(drag.id);
        if (fromIdx === -1) return;

        const dragSlotEl = slotRefs.current.get(drag.id);
        const dragW = dragSlotEl ? dragSlotEl.offsetWidth : iconSize;
        const dragH = dragSlotEl ? dragSlotEl.offsetHeight : iconSize;

        for (let i = 0; i < curApps.length; i++) {
          if (i === fromIdx) continue;
          const targetId = curApps[i].id;
          const el = slotRefs.current.get(targetId);
          if (!el) continue;

          // Use un-transformed layout coordinates so Framer Motion spring animations never cause oscillation
          const slotLeft = cRect.left + el.offsetLeft;
          const slotTop = cRect.top + el.offsetTop;
          const slotW = el.offsetWidth;
          const slotH = el.offsetHeight;
          const slotRight = slotLeft + slotW;
          const slotBottom = slotTop + slotH;

          // Width-compensated swap thresholds prevent wide+narrow items from oscillating
          const rightThreshold = Math.max(slotLeft + slotW * 0.5, slotRight - dragW * 0.5) + 3;
          const leftThreshold = Math.min(slotLeft + slotW * 0.5, slotLeft + dragW * 0.5) - 3;
          const downThreshold = Math.max(slotTop + slotH * 0.5, slotBottom - dragH * 0.5) + 3;
          const upThreshold = Math.min(slotTop + slotH * 0.5, slotTop + dragH * 0.5) - 3;

          const shouldSwap = vert
            ? (fromIdx < i && e.clientY > downThreshold) ||
              (fromIdx > i && e.clientY < upThreshold)
            : (fromIdx < i && e.clientX > rightThreshold) ||
              (fromIdx > i && e.clientX < leftThreshold);

          if (shouldSwap) {
            drag.lastSwapAt = now;
            const nextOrder = [...currentIds];
            const [moved] = nextOrder.splice(fromIdx, 1);
            nextOrder.splice(i, 0, moved);
            setCustomOrder(nextOrder);
            broadcastAppsState(nextOrder, curUnpinned, curExtra);
            break;
          }
        }
      }
    };

    const handleWinPointerUp = () => {
      const drag = dragSessionRef.current;
      if (!drag) return;
      const innerEl = innerRefs.current.get(drag.id);
      if (innerEl) {
        innerEl.style.transition = "";
        innerEl.style.transform = "";
      }
      dragSessionRef.current = null;

      if (drag.hasMoved) {
        invoke("set_navbar_popup_open", { open: false }).catch(() => {});
      } else {
        setContextMenuAppId(null);
        onAppClick?.(drag.app, drag.shiftKey);
      }
      setDraggingAppId(null);
    };

    window.addEventListener("pointermove", handleWinPointerMove);
    window.addEventListener("pointerup", handleWinPointerUp);
    window.addEventListener("pointercancel", handleWinPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleWinPointerMove);
      window.removeEventListener("pointerup", handleWinPointerUp);
      window.removeEventListener("pointercancel", handleWinPointerUp);
    };
  }, [onAppClick, iconSize]);

  const handlePointerDown = (e: React.PointerEvent, app: NavbarAppItem) => {
    if (isPreview || e.button !== 0) return;
    e.stopPropagation();
    const slotEl = slotRefs.current.get(app.id);
    const rect = slotEl
      ? slotEl.getBoundingClientRect()
      : (e.currentTarget as HTMLElement).getBoundingClientRect();

    dragSessionRef.current = {
      id: app.id,
      app,
      startX: e.clientX,
      startY: e.clientY,
      pointerX: e.clientX,
      pointerY: e.clientY,
      grabOffsetX: e.clientX - rect.left,
      grabOffsetY: e.clientY - rect.top,
      hasMoved: false,
      shiftKey: e.shiftKey,
      lastSwapAt: 0,
    };
  };

  const handleTogglePin = (app: NavbarAppItem, currentlyPinned: boolean) => {
    if (currentlyPinned) {
      const nextUnpinned = Array.from(new Set([...unpinnedIds, app.id]));
      const nextExtra = extraPinnedApps.filter((a) => a.id !== app.id);
      setUnpinnedIds(nextUnpinned);
      setExtraPinnedApps(nextExtra);
      broadcastAppsState(customOrder, nextUnpinned, nextExtra);
    } else {
      const nextUnpinned = unpinnedIds.filter((id) => id !== app.id);
      const cleanApp: NavbarAppItem = {
        id: app.id,
        name: app.name,
        icon: app.icon,
        iconType: app.iconType,
        targetPath: app.targetPath,
        arguments: app.arguments,
        lnkPath: app.lnkPath,
        isRunning: false,
        isActive: false,
      };
      const nextExtra = [
        ...extraPinnedApps.filter((a) => a.id !== app.id),
        cleanApp,
      ];
      setUnpinnedIds(nextUnpinned);
      setExtraPinnedApps(nextExtra);
      broadcastAppsState(customOrder, nextUnpinned, nextExtra);
    }
  };

  const handleMouseEnter = (app: NavbarAppItem, idx: number) => {
    if (draggingAppId || contextMenuAppId) return;
    setHoveredSlotId(app.id);
    setHoveredIndex(idx);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (windowPreviews && app.isRunning && (app.windows?.length ?? 0) > 0 && !isPreview) {
      if (hoveredAppId === app.id) return;
      const delay = hoveredAppId ? 45 : 150;
      hoverTimeoutRef.current = window.setTimeout(() => {
        setHoveredAppId(app.id);
        onPreviewStateChange?.(true);
      }, delay);
    } else if (hoveredAppId && hoveredAppId !== app.id) {
      setHoveredAppId(null);
      onPreviewStateChange?.(false);
    }
  };

  const handleMouseLeave = () => {
    setHoveredSlotId(null);
    setHoveredIndex(null);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredAppId(null);
      onPreviewStateChange?.(false);
    }, 220);
  };

  const cancelLeaveTimer = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  return (
    <div
      ref={containerRef}
      data-pinned-apps-group
      className={`relative flex ${
        isVertical ? "flex-col" : "flex-row"
      } items-center gap-1 shrink-0`}
    >
      {liveApps.map((app, idx) => {
        const isPinned = basePinnedApps.some((p) => p.id === app.id);
        const showLabelPill =
          showAppLabels && !isVertical && (app.isRunning || app.isActive);
        const btnStyle: React.CSSProperties = {
          height: `${iconSize}px`,
          width: showLabelPill ? "auto" : `${iconSize}px`,
          paddingLeft: showLabelPill ? "8px" : undefined,
          paddingRight: showLabelPill ? "10px" : undefined,
        };

        const isHoveredThis = hoveredSlotId === app.id && !draggingAppId;
        let hoverScale = isHoveredThis ? 1.08 : 1;
        let hoverLiftY = isHoveredThis ? (position === "top" ? 2 : -2.5) : 0;

        if (magnifyOnHover && hoveredIndex !== null && !isVertical && !draggingAppId) {
          const dist = Math.abs(hoveredIndex - idx);
          if (dist === 0) {
            hoverScale = 1.22;
            hoverLiftY = position === "top" ? 3.5 : -4.5;
          } else if (dist === 1) {
            hoverScale = 1.1;
            hoverLiftY = position === "top" ? 1.5 : -2;
          } else if (dist === 2) {
            hoverScale = 1.03;
            hoverLiftY = position === "top" ? 0.5 : -0.8;
          }
        }

        const isShowingPreview =
          hoveredAppId === app.id && !contextMenuAppId && !draggingAppId;
        const isShowingContextMenu = contextMenuAppId === app.id;
        const isDraggingThis = draggingAppId === app.id;

        return (
          <motion.div
            layout={!isDraggingThis ? "position" : false}
            transition={{ type: "spring", stiffness: 460, damping: 36, mass: 0.7 }}
            key={app.id}
            ref={(el) => {
              if (el) slotRefs.current.set(app.id, el);
              else slotRefs.current.delete(app.id);
            }}
            onMouseEnter={() => handleMouseEnter(app, idx)}
            onMouseLeave={handleMouseLeave}
            className={`relative ${isDraggingThis ? "z-40" : "z-10"}`}
          >
            {/* Shared Fluid Hover Highlight Pill */}
            {isHoveredThis && (
              <motion.span
                layoutId="navbar-app-hover-pill"
                transition={{
                  type: "spring",
                  stiffness: 440,
                  damping: 34,
                  mass: 0.6,
                }}
                className="absolute inset-0 rounded-[12px] bg-white/[0.09] pointer-events-none"
              />
            )}

            {/* Right-Click Context Menu */}
            {isShowingContextMenu && (
              <AppContextMenu
                app={app}
                isPinned={isPinned}
                position={position}
                onNewWindow={() => onAppClick?.(app, true)}
                onTogglePin={() => handleTogglePin(app, isPinned)}
                onCloseAllWindows={() => {
                  const targetHwnds = (app.windows || [])
                    .map((w) => w.hwnd)
                    .concat(app.hwnd ? [app.hwnd] : []);
                  const closedSet = new Set(targetHwnds);
                  targetHwnds.forEach((h) => {
                    if (h) {
                      invoke("close_window_by_hwnd", { hwnd: h }).catch(() => {});
                    }
                  });
                  setRunningWindows((prev) => prev.filter((w) => !closedSet.has(w.hwnd)));
                }}
                onCloseMenu={() => setContextMenuAppId(null)}
              />
            )}

            {/* Window Preview Dialog */}
            <AnimatePresence>
              {isShowingPreview && app.windows && app.windows.length > 0 && (
                <WindowPreviewCard
                  appName={app.name}
                  windows={app.windows}
                  position={position}
                  accentColor={accentColor}
                  onMouseEnter={cancelLeaveTimer}
                  onMouseLeave={handleMouseLeave}
                  onSelectWindow={(_winId, hwnd) => {
                    setHoveredAppId(null);
                    onPreviewStateChange?.(false);
                    if (hwnd) {
                      invoke("activate_or_toggle_window", { hwnd })
                        .then(() => {
                          window.dispatchEvent(new CustomEvent("gili_sync_running_windows"));
                        })
                        .catch(() => {});
                    } else {
                      onAppClick?.(app, false);
                    }
                  }}
                  onCloseWindow={(winId, hwnd) => {
                    if (hwnd) {
                      invoke("close_window_by_hwnd", { hwnd }).catch(() => {});
                      setRunningWindows((prev) => prev.filter((w) => w.hwnd !== hwnd));
                    }
                    app.windows = app.windows?.filter((w) => w.id !== winId);
                    if (!app.windows || app.windows.length === 0) {
                      setHoveredAppId(null);
                      onPreviewStateChange?.(false);
                    }
                  }}
                />
              )}
            </AnimatePresence>

            <Tooltip
              side={position === "top" ? "bottom" : "top"}
              delay={120}
              content={
                isShowingPreview || isShowingContextMenu || isDraggingThis ? null : (
                  <div className="flex items-center gap-1.5 font-medium text-[11.5px]">
                    <span className="truncate max-w-[200px]">
                      {app.activeTitle || app.name}
                    </span>
                    {app.isActive && (
                      <span className="text-[9.5px] px-1 py-0.2 rounded bg-white/20 font-semibold text-white shrink-0">
                        Aktif
                      </span>
                    )}
                  </div>
                )
              }
            >
              <button
                ref={(el) => {
                  if (el) innerRefs.current.set(app.id, el);
                  else innerRefs.current.delete(app.id);
                }}
                type="button"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onPointerDown={(e) => handlePointerDown(e, app)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onAppClick?.(app, true);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setHoveredAppId(null);
                  setContextMenuAppId((prev) => (prev === app.id ? null : app.id));
                }}
                aria-label={app.name}
                style={{
                  ...btnStyle,
                  touchAction: "none",
                  transition: isDraggingThis
                    ? "none"
                    : "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease, color 180ms ease",
                  transform:
                    !isDraggingThis && (hoverScale !== 1 || hoverLiftY !== 0)
                      ? `translate3d(0, ${hoverLiftY}px, 0) scale(${hoverScale})`
                      : undefined,
                }}
                className={`relative rounded-[12px] flex items-center justify-center gap-2 p-0 cursor-grab active:cursor-grabbing active:scale-95 shrink-0 select-none ${
                  position === "top" ? "origin-top" : "origin-bottom"
                } ${
                  app.isActive
                    ? "bg-white/[0.09] text-white"
                    : "text-white/65 hover:text-white"
                } ${isDraggingThis ? "opacity-95 shadow-xl" : ""}`}
              >
                {renderAppIcon(app, iconTheme, iconSize)}

                {showLabelPill && (
                  <span className="text-[11px] font-medium text-white/90 truncate max-w-[68px] pointer-events-none select-none">
                    {app.name}
                  </span>
                )}

                {/* Indicator: Active 14x3px bar with vibrant accent glow */}
                {app.isActive && (
                  <span
                    style={{
                      backgroundColor: accentColor,
                      boxShadow: `0 0 10px ${accentColor}, 0 0 4px ${accentColor}`,
                    }}
                    className={
                      isVertical
                        ? `absolute top-1/2 -translate-y-1/2 ${
                            position === "right" ? "right-[2px]" : "left-[2px]"
                          } w-[3px] h-[14px] rounded-[2px] pointer-events-none transition-all duration-200`
                        : `absolute left-1/2 -translate-x-1/2 ${
                            position === "top" ? "top-[2px]" : "bottom-[2px]"
                          } w-[14px] h-[3px] rounded-[2px] pointer-events-none transition-all duration-200`
                    }
                  />
                )}

                {/* Indicator: Running dot 4x4px with accent glow */}
                {app.isRunning && !app.isActive && (
                  <span
                    style={{
                      backgroundColor: hexToRgba(accentColor, 0.75),
                      boxShadow: `0 0 4px ${hexToRgba(accentColor, 0.4)}`,
                    }}
                    className={
                      isVertical
                        ? `absolute top-1/2 -translate-y-1/2 ${
                            position === "right" ? "right-[3px]" : "left-[3px]"
                          } w-[4px] h-[4px] rounded-full pointer-events-none transition-all duration-200`
                        : `absolute left-1/2 -translate-x-1/2 ${
                            position === "top" ? "top-[3px]" : "bottom-[3px]"
                          } w-[4px] h-[4px] rounded-full pointer-events-none transition-all duration-200`
                    }
                  />
                )}
              </button>
            </Tooltip>
          </motion.div>
        );
      })}
    </div>
  );
};
