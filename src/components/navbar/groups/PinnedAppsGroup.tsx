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
import { getRunningAppMeta, isBrowserPwaShortcut, matchesPinnedApp } from "./pinnedAppsHelpers";
import {
  registerNavbarPopup,
  unregisterNavbarPopup,
} from "../../../services/navbarPopupService";
import { AppContextMenu } from "./AppContextMenu";
import {
  useTaskbarLang,
  tx,
  getNavbarTooltipSide,
} from "../../../services/taskbarI18n";
import { useNavbarLightMode } from "../navbarThemeUtils";

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
    | "brave"
    | "calculator";
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
  exe_path?: string;
  is_active: boolean;
  is_minimized: boolean;
  icon_base64?: string;
}

function areRunningWindowsEqual(
  prev: RunningWindowInfo[],
  next: RunningWindowInfo[]
): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (
      a.hwnd !== b.hwnd ||
      a.title !== b.title ||
      a.process_name !== b.process_name ||
      a.exe_path !== b.exe_path ||
      a.is_active !== b.is_active ||
      a.is_minimized !== b.is_minimized ||
      a.icon_base64 !== b.icon_base64
    ) {
      return false;
    }
  }
  return true;
}

interface PinnedAppsGroupProps {
  apps?: NavbarAppItem[];
  slotSize?: number;
  iconSize?: number;
  iconTheme?: NavbarIconTheme;
  position?: NavbarPosition;
  magnifyOnHover?: boolean;
  windowPreviews?: boolean;
  showAppLabels?: boolean;
  accentColor?: string;
  isLightSurface?: boolean;
  isPreview?: boolean;
  isHidden?: boolean;
  showPinnedApps?: boolean;
  showRunningApps?: boolean;
  onAppClick?: (
    app: NavbarAppItem,
    forceNewInstance?: boolean,
    anchorRect?: DockAnchorRect,
  ) => void;
  onPreviewStateChange?: (isShowing: boolean) => void;
}

export interface DockAnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
  position: NavbarPosition;
}

const APP_ORDER_KEY = "gili_navbar_app_order_v1";
const APP_UNPINNED_KEY = "gili_navbar_unpinned_ids_v1";
const APP_EXTRA_PINNED_KEY = "gili_navbar_extra_pinned_v1";

function normalizeSavedPinnedApp(app: NavbarAppItem): NavbarAppItem {
  const lowerId = (app.id || "").toLowerCase();
  const combinedPath = `${app.targetPath || ""} ${app.lnkPath || ""}`.toLowerCase();
  if (
    lowerId === "calculatorapp" ||
    lowerId === "calculator" ||
    combinedPath.includes("calculatorapp.exe") ||
    combinedPath.includes("windowscalculator")
  ) {
    return {
      ...app,
      id: "calculator",
      iconType: app.iconType || "calculator",
    };
  }
  return app;
}

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
  slotSize,
  iconSize = 40,
  iconTheme = "fluent",
  position = "bottom",
  magnifyOnHover = false,
  windowPreviews = true,
  showAppLabels = false,
  accentColor = "#0a84ff",
  isLightSurface = false,
  isPreview = false,
  isHidden = false,
  showPinnedApps = true,
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
  const windowIconCacheRef = useRef<Map<number, string>>(new Map());
  const runningAppOrderRef = useRef<string[]>([]);
  const windowOrderRef = useRef<number[]>([]);

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
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeSavedPinnedApp) : [];
    } catch {
      return [];
    }
  });

  const [draggingAppId, setDraggingAppId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const innerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const positionRef = useRef<NavbarPosition>(position);
  positionRef.current = position;

  const getAppAnchorRect = (appId: string): DockAnchorRect | undefined => {
    const el = slotRefs.current.get(appId) ?? innerRefs.current.get(appId);
    if (!el) return undefined;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      position: positionRef.current,
    };
  };

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

  const effectiveSlotSize = Math.max(24, slotSize ?? iconSize);
  const maxArtworkPx = Math.max(16, effectiveSlotSize - 6);
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
      if (ev.payload.extra) {
        setExtraPinnedApps(ev.payload.extra.map(normalizeSavedPinnedApp));
      }
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
    if (isHidden) return;
    let isCancelled = false;
    const syncWindows = async () => {
      try {
        const cache = windowIconCacheRef.current;
        const windows = await invoke<RunningWindowInfo[]>("get_running_windows", {
          knownHwnds: Array.from(cache.keys()),
        });
        if (!isCancelled && windows) {
          const activeHwnds = new Set<number>();
          for (const w of windows) {
            activeHwnds.add(w.hwnd);
            if (w.icon_base64) {
              cache.set(w.hwnd, w.icon_base64);
            } else {
              const cachedIcon = cache.get(w.hwnd);
              if (cachedIcon) {
                w.icon_base64 = cachedIcon;
              }
            }
          }
          for (const cachedHwnd of cache.keys()) {
            if (!activeHwnds.has(cachedHwnd)) {
              cache.delete(cachedHwnd);
            }
          }
          setRunningWindows((prev) =>
            areRunningWindowsEqual(prev, windows) ? prev : windows
          );
        }
      } catch {}
    };

    if (isPreview) {
      syncWindows();
      return () => {
        isCancelled = true;
      };
    }

    syncWindows();
    const interval = setInterval(syncWindows, 1200);
    const handleFastSync = () => {
      syncWindows();
    };
    window.addEventListener("gili_sync_running_windows", handleFastSync);
    return () => {
      isCancelled = true;
      clearInterval(interval);
      window.removeEventListener("gili_sync_running_windows", handleFastSync);
    };
  }, [isPreview, isHidden]);

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
    const normalized = normalizeSavedPinnedApp(a);
    if (!unpinnedIds.includes(normalized.id) && !mergedPinnedMap.has(normalized.id)) {
      mergedPinnedMap.set(normalized.id, normalized);
    }
  });
  const basePinnedApps = Array.from(mergedPinnedMap.values());

  // Preserve stable first-seen window ordering regardless of Win32 Z-order changes
  const liveHwndSet = new Set(runningWindows.map((w) => w.hwnd));
  const nextWindowOrder = windowOrderRef.current.filter((h) => liveHwndSet.has(h));
  for (const w of runningWindows) {
    if (!nextWindowOrder.includes(w.hwnd)) {
      nextWindowOrder.push(w.hwnd);
    }
  }
  windowOrderRef.current = nextWindowOrder;
  const windowOrderIndex = new Map<number, number>();
  nextWindowOrder.forEach((h, idx) => windowOrderIndex.set(h, idx));
  const sortByWindowOrder = <T extends { hwnd: number }>(items: T[]) =>
    [...items].sort(
      (a, b) => (windowOrderIndex.get(a.hwnd) ?? 0) - (windowOrderIndex.get(b.hwnd) ?? 0)
    );

  // 2. Match pinned apps with live running windows
  const matchedHwnds = new Set<number>();
  const pwaClaimedHwnds = new Set<number>();
  basePinnedApps.forEach((app) => {
    if (!isBrowserPwaShortcut(app)) return;
    runningWindows.forEach((w) => {
      if (matchesPinnedApp(app, w)) {
        pwaClaimedHwnds.add(w.hwnd);
      }
    });
  });

  const livePinnedApps: NavbarAppItem[] = basePinnedApps.map((app) => {
    const isPwa = isBrowserPwaShortcut(app);
    const allMatches = runningWindows.filter((w) => {
      if (!isPwa && pwaClaimedHwnds.has(w.hwnd)) return false;
      return matchesPinnedApp(app, w);
    });

    allMatches.forEach((w) => matchedHwnds.add(w.hwnd));

    const isRunning = allMatches.length > 0;
    const activeWin = allMatches.find((w) => w.is_active);
    const isActive = activeWin !== undefined;
    const hwnd =
      activeWin?.hwnd ??
      allMatches.find((w) => !w.is_minimized)?.hwnd ??
      allMatches[0]?.hwnd;
    const activeTitle = activeWin?.title || allMatches[0]?.title || app.name;
    const orderedMatches = sortByWindowOrder(allMatches);
    const rawLive = app.icon || orderedMatches.find((w) => w.icon_base64)?.icon_base64;
    const liveIcon = normalizeIconUrl(rawLive);

    const windowsList: WindowPreviewItem[] = isRunning
      ? orderedMatches.map((w) => ({
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
  if (showRunningApps) {
    const processGroupMap = new Map<string, RunningWindowInfo[]>();

    runningWindows.forEach((w) => {
      if (matchedHwnds.has(w.hwnd)) return;
      const isAlreadyPinned = basePinnedApps.some((pinned) => matchesPinnedApp(pinned, w));
      if (isAlreadyPinned) return;

      const p = w.process_name.toLowerCase();
      const existing = processGroupMap.get(p) || [];
      existing.push(w);
      processGroupMap.set(p, existing);
    });

    processGroupMap.forEach((windows, procKey) => {
      const orderedWindows = sortByWindowOrder(windows);
      const meta = getRunningAppMeta(procKey, orderedWindows[0]?.title || procKey);
      if (basePinnedApps.some((p) => p.id === meta.id)) return;

      const activeWin = windows.find((w) => w.is_active);
      const isActive = activeWin !== undefined;
      const hwnd =
        activeWin?.hwnd ??
        windows.find((w) => !w.is_minimized)?.hwnd ??
        windows[0]?.hwnd;
      const rawAppIcon = orderedWindows.find((w) => w.icon_base64)?.icon_base64 || undefined;
      const appIcon = normalizeIconUrl(rawAppIcon);

      unpinnedRunningApps.push({
        id: meta.id,
        name: meta.name,
        activeTitle: activeWin?.title || windows[0]?.title || meta.name,
        icon: appIcon,
        iconType: meta.iconType,
        targetPath: orderedWindows.find((w) => w.exe_path)?.exe_path || undefined,
        isRunning: true,
        isActive,
        hwnd,
        windows: orderedWindows.map((w) => ({
          id: `win-${w.hwnd}`,
          hwnd: w.hwnd,
          title: w.title || meta.name,
          icon: normalizeIconUrl(w.icon_base64) || appIcon,
          isMinimized: w.is_minimized,
        })),
      });
    });

    // Lock running app slots by first-seen order so activating or minimizing never shifts positions
    const activeUnpinnedIds = new Set(unpinnedRunningApps.map((a) => a.id));
    const nextRunningAppOrder = runningAppOrderRef.current.filter((id) =>
      activeUnpinnedIds.has(id)
    );
    for (const a of unpinnedRunningApps) {
      if (!nextRunningAppOrder.includes(a.id)) {
        nextRunningAppOrder.push(a.id);
      }
    }
    runningAppOrderRef.current = nextRunningAppOrder;
    unpinnedRunningApps.sort(
      (a, b) => nextRunningAppOrder.indexOf(a.id) - nextRunningAppOrder.indexOf(b.id)
    );
  }

  const visiblePinnedApps = showPinnedApps
    ? livePinnedApps
    : showRunningApps
    ? livePinnedApps.filter((app) => app.isRunning)
    : [];

  const combinedApps = [...visiblePinnedApps, ...unpinnedRunningApps];

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
      if (!drag.hasMoved && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        drag.hasMoved = true;
        setDraggingAppId(drag.id);
        setHoveredAppId(null);
        setHoveredSlotId(null);
        setHoveredIndex(null);
        setContextMenuAppId(null);
        void registerNavbarPopup("drag:pinned", null);
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
        const dragW = dragSlotEl ? dragSlotEl.offsetWidth : effectiveSlotSize;
        const dragH = dragSlotEl ? dragSlotEl.offsetHeight : effectiveSlotSize;

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
        void unregisterNavbarPopup("drag:pinned");
      } else {
        setContextMenuAppId(null);
        onAppClick?.(drag.app, drag.shiftKey, getAppAnchorRect(drag.id));
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
      void unregisterNavbarPopup("drag:pinned");
    };
  }, [onAppClick, effectiveSlotSize]);

  const handlePointerDown = (e: React.PointerEvent, app: NavbarAppItem) => {
    if (isPreview || e.button !== 0) return;
    e.stopPropagation();
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (hoveredAppId) {
      setHoveredAppId(null);
      onPreviewStateChange?.(false);
    }
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

  const lang = useTaskbarLang();
  const isLightMode = useNavbarLightMode();
  const tooltipSide = getNavbarTooltipSide(position);

  if (liveApps.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      data-pinned-apps-group
      className={`relative flex ${
        isVertical ? "flex-col w-full min-w-0 max-w-full" : "flex-row"
      } items-center gap-1 shrink-0`}
    >
      <AnimatePresence initial={false}>
      {liveApps.map((app, idx) => {
        const isPinned = basePinnedApps.some((p) => p.id === app.id);
        const showLabelPill =
          showAppLabels && !isVertical && (app.isRunning || app.isActive);
        const btnStyle: React.CSSProperties = {
          height: `${effectiveSlotSize}px`,
          width: showLabelPill ? "auto" : `${effectiveSlotSize}px`,
          paddingLeft: showLabelPill ? "8px" : undefined,
          paddingRight: showLabelPill ? "10px" : undefined,
        };

        const isHoveredThis = hoveredSlotId === app.id && !draggingAppId;
        let hoverScale = isHoveredThis ? 1.08 : 1;
        let hoverLiftX = 0;
        let hoverLiftY = 0;
        if (isHoveredThis) {
          if (position === "top") hoverLiftY = 2;
          else if (position === "left") hoverLiftX = 2;
          else if (position === "right") hoverLiftX = -2;
          else hoverLiftY = -2.5;
        }

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
            layout={Boolean(draggingAppId) && !isDraggingThis ? "position" : false}
            initial={
              isVertical
                ? { height: 0, opacity: 0, scale: 0.6 }
                : { width: 0, opacity: 0, scale: 0.6 }
            }
            animate={
              isVertical
                ? { height: effectiveSlotSize, opacity: 1, scale: 1 }
                : { width: showLabelPill ? "auto" : effectiveSlotSize, opacity: 1, scale: 1 }
            }
            exit={
              isVertical
                ? {
                    height: 0,
                    opacity: 0,
                    scale: 0.6,
                    marginTop: -2,
                    marginBottom: -2,
                    pointerEvents: "none",
                  }
                : {
                    width: 0,
                    opacity: 0,
                    scale: 0.6,
                    marginLeft: -2,
                    marginRight: -2,
                    pointerEvents: "none",
                  }
            }
            transition={
              draggingAppId
                ? { type: "spring", stiffness: 460, damping: 36, mass: 0.7 }
                : { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const }
            }
            key={app.id}
            ref={(el) => {
              if (el) slotRefs.current.set(app.id, el);
              else slotRefs.current.delete(app.id);
            }}
            onMouseEnter={() => handleMouseEnter(app, idx)}
            onMouseLeave={handleMouseLeave}
            className={`relative flex items-center justify-center shrink-0 ${isDraggingThis ? "z-40" : "z-10"}`}
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
                    const anchorRect = getAppAnchorRect(app.id);
                    setHoveredAppId(null);
                    onPreviewStateChange?.(false);
                    if (hwnd) {
                      invoke("activate_or_toggle_window", { hwnd, anchorRect })
                        .then(() => {
                          window.dispatchEvent(new CustomEvent("gili_sync_running_windows"));
                        })
                        .catch(() => {});
                    } else {
                      onAppClick?.(app, false, anchorRect);
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
              side={tooltipSide}
              delay={120}
              content={
                isShowingPreview || isShowingContextMenu || isDraggingThis ? null : (
                  <div className="flex items-center gap-1.5 font-medium text-[11.5px]">
                    <span className="truncate max-w-[200px]">
                      {app.activeTitle || app.name}
                    </span>
                    {app.isActive && (
                      <span
                        className={`text-[9.5px] px-1 py-0.2 rounded font-semibold shrink-0 ${
                          isLightMode
                            ? "bg-black/10 text-zinc-900"
                            : "bg-white/20 text-white"
                        }`}
                      >
                        {tx(lang, "Active", "Aktif")}
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
                    !isDraggingThis &&
                    (hoverScale !== 1 || hoverLiftX !== 0 || hoverLiftY !== 0)
                      ? `translate3d(${hoverLiftX}px, ${hoverLiftY}px, 0) scale(${hoverScale})`
                      : undefined,
                }}
                className={`relative rounded-[12px] flex items-center justify-center gap-2 p-0 cursor-grab active:cursor-grabbing active:scale-95 shrink-0 select-none ${
                  position === "top"
                    ? "origin-top"
                    : position === "left"
                    ? "origin-left"
                    : position === "right"
                    ? "origin-right"
                    : "origin-bottom"
                } ${
                  app.isActive
                    ? "bg-white/[0.09] text-white"
                    : "text-white/65 hover:text-white"
                } ${isDraggingThis ? "opacity-95 shadow-xl" : ""}`}
              >
                {renderAppIcon(app, iconTheme, iconSize, accentColor, isLightSurface, maxArtworkPx)}

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
      </AnimatePresence>
    </div>
  );
};
