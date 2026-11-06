import React, { useState, useRef, useEffect, useLayoutEffect, useId } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { NavbarConfig } from "../../types/navbar";
import { hexToRgba, saveNavbarConfig } from "../../services/navbarConfigService";
import { useNotchTheme } from "../../hooks/useNotchTheme";
import {
  buildNotchPath,
  buildNotchOutlinePath,
  getNotchSurfaceMetrics,
} from "../../utils/notchGeometry";
import { StartSearchGroup } from "./groups/StartSearchGroup";
import { PinnedAppsGroup } from "./groups/PinnedAppsGroup";
import { SystemTrayGroup } from "./groups/SystemTrayGroup";
import { getNavbarModuleById } from "../../modules/registry";
import { NavbarModuleUnifiedPreview } from "../../modules/components/NavbarModuleUnifiedPreview";

interface NavbarDockProps {
  config: NavbarConfig;
  extraModules?: React.ReactNode;
  isPreview?: boolean;
  onStartClick?: () => void;
  onSearchClick?: () => void;
  onControlCenterClick?: () => void;
  onNotificationsClick?: () => void;
  onClockClick?: () => void;
  onVolumeClick?: (e: React.MouseEvent) => void;
  onPreviewStateChange?: (isShowing: boolean) => void;
}

function getOffsetRelativeToDock(
  el: HTMLElement,
  dockEl: HTMLElement | null
): { left: number; top: number } {
  let left = 0;
  let top = 0;
  let cur: HTMLElement | null = el;
  while (cur && cur !== dockEl) {
    left += cur.offsetLeft;
    top += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return { left, top };
}

export const NavbarDock = React.forwardRef<HTMLDivElement, NavbarDockProps>(
  (
    {
      config,
      extraModules,
      isPreview,
      onStartClick,
      onSearchClick,
      onControlCenterClick,
      onNotificationsClick,
      onClockClick,
      onVolumeClick,
      onPreviewStateChange,
    },
    ref
  ) => {
    const isAnchored = config.shape === "anchored";
    const pos = config.position || "bottom";
    const isTop = pos === "top";
    const isLeft = pos === "left";
    const isRight = pos === "right";
    const isVertical = isLeft || isRight;

    const iconSize = config.iconSize || 40;
    const dockThickness = iconSize + 8; // 48px when iconSize = 40px
    const radius = config.cornerRadius ?? 15;
    const accentColor = config.accent || "#3882F6";
    const { notchBgHex, notchMode } = useNotchTheme();

    const [desktopLuminance, setDesktopLuminance] = useState<number>(0);

    useEffect(() => {
      if (isPreview) return;
      let active = true;

      const checkDesktopLuminance = async () => {
        try {
          const lum = await invoke<number>("get_desktop_luminance");
          if (active && typeof lum === "number" && !isNaN(lum)) {
            setDesktopLuminance(lum);
          }
        } catch {}
      };

      checkDesktopLuminance();
      const interval = setInterval(checkDesktopLuminance, 1200);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [isPreview, config.position, config.distanceFromEdge, config.shape]);

    const localDockRef = useRef<HTMLDivElement | null>(null);
    const setCombinedRef = (node: HTMLDivElement | null) => {
      localDockRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    };

    const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
    const modDragRef = useRef<{
      id: string;
      startX: number;
      startY: number;
      pointerX: number;
      pointerY: number;
      grabOffsetX: number;
      grabOffsetY: number;
      hasMoved: boolean;
      lastSwapAt: number;
    } | null>(null);
    const justFinishedModDragRef = useRef(false);
    const modSlotRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const modInnerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const latestConfigRef = useRef<{ config: NavbarConfig; isVertical: boolean }>({
      config,
      isVertical,
    });
    latestConfigRef.current = { config, isVertical };

    const applyDraggedModuleTransform = () => {
      const drag = modDragRef.current;
      if (!drag || !drag.hasMoved) return;
      const dockEl = localDockRef.current;
      const slotEl = modSlotRefs.current.get(drag.id);
      const innerEl = modInnerRefs.current.get(drag.id);
      if (!dockEl || !slotEl || !innerEl) return;

      const dockRect = dockEl.getBoundingClientRect();
      const rel = getOffsetRelativeToDock(slotEl, dockEl);
      const naturalLeft = dockRect.left + rel.left;
      const naturalTop = dockRect.top + rel.top;

      const dx = latestConfigRef.current.isVertical
        ? 0
        : drag.pointerX - drag.grabOffsetX - naturalLeft;
      const dy = latestConfigRef.current.isVertical
        ? drag.pointerY - drag.grabOffsetY - naturalTop
        : 0;

      innerEl.style.transition = "none";
      innerEl.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.05)`;
    };

    useLayoutEffect(() => {
      if (draggingModuleId) {
        applyDraggedModuleTransform();
      }
    }, [config.modules, draggingModuleId]);

    useEffect(() => {
      if (isPreview) return;

      const handleWinPointerMove = (e: PointerEvent) => {
        const drag = modDragRef.current;
        if (!drag) return;

        drag.pointerX = e.clientX;
        drag.pointerY = e.clientY;

        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (!drag.hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
          drag.hasMoved = true;
          setDraggingModuleId(drag.id);
          invoke("set_navbar_popup_open", { open: true }).catch(() => {});
        }

        if (drag.hasMoved) {
          applyDraggedModuleTransform();

          const now = performance.now();
          if (now - drag.lastSwapAt < 90) return;

          const dockEl = localDockRef.current;
          if (!dockEl) return;
          const dockRect = dockEl.getBoundingClientRect();

          const { config: curCfg, isVertical: vert } = latestConfigRef.current;

          const slotEntries: {
            id: string;
            left: number;
            top: number;
            width: number;
            height: number;
          }[] = [];

          modSlotRefs.current.forEach((el, id) => {
            const rel = getOffsetRelativeToDock(el, dockEl);
            slotEntries.push({
              id,
              left: dockRect.left + rel.left,
              top: dockRect.top + rel.top,
              width: el.offsetWidth,
              height: el.offsetHeight,
            });
          });

          slotEntries.sort((a, b) => (vert ? a.top - b.top : a.left - b.left));

          const fromSlotIdx = slotEntries.findIndex((s) => s.id === drag.id);
          if (fromSlotIdx === -1) return;

          const dragSlot = slotEntries[fromSlotIdx];
          const dragW = dragSlot.width;
          const dragH = dragSlot.height;

          for (let i = 0; i < slotEntries.length; i++) {
            if (i === fromSlotIdx) continue;
            const target = slotEntries[i];
            const slotLeft = target.left;
            const slotTop = target.top;
            const slotW = target.width;
            const slotH = target.height;
            const slotRight = slotLeft + slotW;
            const slotBottom = slotTop + slotH;

            // Width-compensated threshold prevents wide slots (e.g. PinnedAppsGroup) from oscillating with narrow modules
            const rightThreshold =
              Math.max(slotLeft + slotW * 0.5, slotRight - dragW * 0.5) + 4;
            const leftThreshold =
              Math.min(slotLeft + slotW * 0.5, slotLeft + dragW * 0.5) - 4;
            const downThreshold =
              Math.max(slotTop + slotH * 0.5, slotBottom - dragH * 0.5) + 4;
            const upThreshold =
              Math.min(slotTop + slotH * 0.5, slotTop + dragH * 0.5) - 4;

            const shouldSwap = vert
              ? (fromSlotIdx < i && e.clientY > downThreshold) ||
                (fromSlotIdx > i && e.clientY < upThreshold)
              : (fromSlotIdx < i && e.clientX > rightThreshold) ||
                (fromSlotIdx > i && e.clientX < leftThreshold);

            if (shouldSwap) {
              drag.lastSwapAt = now;
              const getIdsForSlot = (slotId: string): string[] => {
                if (slotId === "pinnedApps" || slotId === "runningApps") {
                  return ["pinnedApps", "runningApps"];
                }
                return [slotId];
              };

              const movingIds = getIdsForSlot(drag.id);
              const targetIds = getIdsForSlot(target.id);
              const nextModules = curCfg.modules.map((m) => ({ ...m }));

              const targetRep = nextModules.find((m) =>
                targetIds.includes(m.id)
              );
              if (targetRep) {
                const targetGroup = targetRep.group;
                const extracted = nextModules
                  .filter((m) => movingIds.includes(m.id))
                  .map((m) => ({ ...m, group: targetGroup }));
                const remaining = nextModules.filter(
                  (m) => !movingIds.includes(m.id)
                );

                const targetIndices = remaining
                  .map((m, idx) => (targetIds.includes(m.id) ? idx : -1))
                  .filter((idx) => idx !== -1);

                if (targetIndices.length > 0) {
                  const insertAt =
                    fromSlotIdx < i
                      ? targetIndices[targetIndices.length - 1] + 1
                      : targetIndices[0];
                  remaining.splice(insertAt, 0, ...extracted);
                  saveNavbarConfig({ ...curCfg, modules: remaining }).catch(
                    () => {}
                  );
                }
              }
              break;
            }
          }
        }
      };

      const handleWinPointerUp = () => {
        const drag = modDragRef.current;
        if (!drag) return;
        const innerEl = modInnerRefs.current.get(drag.id);
        if (innerEl) {
          innerEl.style.transition = "";
          innerEl.style.transform = "";
        }
        modDragRef.current = null;

        if (drag.hasMoved) {
          justFinishedModDragRef.current = true;
          window.setTimeout(() => {
            justFinishedModDragRef.current = false;
          }, 120);
          invoke("set_navbar_popup_open", { open: false }).catch(() => {});
        }
        setDraggingModuleId(null);
      };

      window.addEventListener("pointermove", handleWinPointerMove);
      window.addEventListener("pointerup", handleWinPointerUp);
      window.addEventListener("pointercancel", handleWinPointerUp);
      return () => {
        window.removeEventListener("pointermove", handleWinPointerMove);
        window.removeEventListener("pointerup", handleWinPointerUp);
        window.removeEventListener("pointercancel", handleWinPointerUp);
      };
    }, [isPreview]);

    // Background & Opacity Calculation
    const isLiquid = config.style === "liquid";
    const isSolid = config.style === "solid";
    const alpha = Math.max(0.1, Math.min(1, (config.opacity ?? 100) / 100));
    const isFollowNotch =
      config.style === "followNotch" || config.background === "followNotch";
    let baseHex = "#000000";
    if (isFollowNotch) {
      baseHex = notchBgHex;
    } else if (config.background === "custom" && config.customColor) {
      baseHex = config.customColor;
    } else {
      baseHex = "#000000";
    }
    const bgColor = hexToRgba(baseHex, alpha);
    const edgeGap = isAnchored ? 0 : config.distanceFromEdge ?? 14;

    const isHexLight = (hex: string) => {
      const clean = hex.replace("#", "");
      if (clean.length !== 6) return false;
      const r = parseInt(clean.slice(0, 2), 16);
      const g = parseInt(clean.slice(2, 4), 16);
      const b = parseInt(clean.slice(4, 6), 16);
      return (r * 299 + g * 587 + b * 114) / 1000 > 165;
    };

    const isTranslucent = isLiquid || alpha < 0.98;
    const isLightSurface = isTranslucent
      ? desktopLuminance >= 0.32 ||
        (isLiquid && desktopLuminance >= 0.28) ||
        (notchMode === "light" && isFollowNotch && desktopLuminance >= 0.25) ||
        (isHexLight(baseHex) && alpha >= 0.4)
      : isHexLight(baseHex);

    // Real desktop wallpaper capture behind dock for Liquid Glass mode
    const [desktopBackdropUrl, setDesktopBackdropUrl] = useState<string | null>(null);

    useEffect(() => {
      if (!isLiquid || isPreview) {
        setDesktopBackdropUrl(null);
        return;
      }

      let isMounted = true;
      invoke<string | null>("get_cached_desktop_backdrop")
        .then((cached) => {
          if (isMounted && cached) setDesktopBackdropUrl(cached);
        })
        .catch(() => {});

      const captureDockBackdrop = async () => {
        try {
          const el = localDockRef.current;
          let clientRect: { x: number; y: number; width: number; height: number } | undefined;
          if (el) {
            const rect = el.getBoundingClientRect();
            const pad = isAnchored ? 40 : 8;
            clientRect = {
              x: Math.max(0, rect.left - (isVertical ? 0 : pad)),
              y: Math.max(0, rect.top - (isVertical ? pad : 0)),
              width: rect.width + (isVertical ? 0 : pad * 2),
              height: rect.height + (isVertical ? pad * 2 : 0),
            };
          }
          const dataUrl = await invoke<string>("capture_desktop_backdrop", {
            windowLabel: "navbar",
            clientRect,
            blurSigma: 13.0,
          });
          if (isMounted && dataUrl) {
            setDesktopBackdropUrl(dataUrl);
          }
        } catch {
          // Graceful fallback
        }
      };

      captureDockBackdrop();
      const interval = setInterval(captureDockBackdrop, 1500);
      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }, [isLiquid, isAnchored, isVertical, isPreview, config.position]);

    const borderRadiusValue = `${radius}px`;

    const rawClipId = useId();
    const clipId = `dock_unified_clip_${rawClipId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    const [dockDim, setDockDim] = useState<{ w: number; h: number }>({
      w: 0,
      h: 0,
    });

    useLayoutEffect(() => {
      const el = localDockRef.current;
      if (!el) return;
      const measure = () => {
        const w = Math.round(el.offsetWidth || el.getBoundingClientRect().width);
        const h = Math.round(el.offsetHeight || el.getBoundingClientRect().height);
        if (w > 0 && h > 0) {
          setDockDim((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
        }
      };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }, [config.modules, config.iconSize, config.shape, config.position]);

    const currentW =
      dockDim.w > 0
        ? dockDim.w
        : isVertical
        ? dockThickness
        : 560;
    const currentH =
      dockDim.h > 0
        ? dockDim.h
        : isVertical
        ? 560
        : dockThickness;

    // Prominent, generous concave ears for anchored mode (luxurious fluid scoop)
    const earRadius = Math.max(
      28,
      Math.min(40, Math.round(dockThickness * 0.58 + (radius - 10) * 0.4))
    );
    const pathParams = {
      width: currentW,
      height: currentH,
      earRadius: isAnchored ? earRadius : 0,
      bottomRadius: radius,
      isIsland: false,
      isBottom: pos === "bottom",
      position: pos as any,
    };
    const surfaceMetrics = getNotchSurfaceMetrics(pathParams);
    const fillPath = buildNotchPath(pathParams);
    const outlinePath = buildNotchOutlinePath(pathParams);

    const liquidDarkBg = `linear-gradient(180deg, rgba(255,255,255,${(0.20 * alpha).toFixed(3)}) 0%, rgba(255,255,255,${(0.07 * alpha).toFixed(3)}) 50%, rgba(255,255,255,${(0.10 * alpha).toFixed(3)}) 100%), rgba(22,16,72,${(0.50 * alpha).toFixed(3)})`;
    const liquidLightBg = `linear-gradient(180deg, rgba(255,255,255,${(0.65 * alpha).toFixed(3)}) 0%, rgba(255,255,255,${(0.25 * alpha).toFixed(3)}) 50%, rgba(255,255,255,${(0.40 * alpha).toFixed(3)}) 100%), rgba(240,244,255,${(0.50 * alpha).toFixed(3)})`;

    const surfaceBackground = isLiquid
      ? isLightSurface
        ? liquidLightBg
        : liquidDarkBg
      : isSolid
      ? isLightSurface
        ? `rgba(255, 255, 255, ${alpha})`
        : `rgba(0, 0, 0, ${alpha})`
      : bgColor;

    const surfaceBackdropFilter = isLiquid
      ? "blur(26px) saturate(175%) brightness(1.05)"
      : alpha < 0.99
      ? "blur(20px) saturate(160%)"
      : undefined;

    // Neutral clean borders without accent color stroke (in anchored mode background & blur is on unified surface)
    const dockStyle: React.CSSProperties = {
      width: isVertical ? `${dockThickness}px` : undefined,
      height: isVertical ? undefined : `${dockThickness}px`,
      background: isAnchored || isLiquid ? "transparent" : surfaceBackground,
      backdropFilter: isAnchored ? undefined : surfaceBackdropFilter,
      WebkitBackdropFilter: isAnchored ? undefined : surfaceBackdropFilter,
      borderRadius: isAnchored ? undefined : borderRadiusValue,
      marginBottom: !isVertical && !isTop ? `${edgeGap}px` : "0px",
      marginTop: !isVertical && isTop ? `${edgeGap}px` : "0px",
      marginLeft: isLeft ? `${edgeGap}px` : "0px",
      marginRight: isRight ? `${edgeGap}px` : "0px",
      paddingLeft: isVertical ? "0px" : isAnchored ? "10px" : "14px",
      paddingRight: isVertical ? "0px" : isAnchored ? "10px" : "14px",
      paddingTop: isVertical ? (isAnchored ? "10px" : "14px") : "0px",
      paddingBottom: isVertical ? (isAnchored ? "10px" : "14px") : "0px",
      boxShadow: isAnchored
        ? undefined
        : isLiquid
        ? isLightSurface
          ? "inset 0 1px 0 rgba(255,255,255,.85), inset 0 -1px 0 rgba(0,0,0,.04), inset 0 0 0 1px rgba(255,255,255,.45), 0 20px 48px rgba(0,0,0,.14), 0 2px 8px rgba(0,0,0,.06)"
          : "inset 0 1px 0 rgba(255,255,255,.55), inset 0 -1px 0 rgba(255,255,255,.12), inset 0 0 0 1px rgba(255,255,255,.22), 0 28px 64px rgba(12,10,60,.45), 0 2px 8px rgba(0,0,0,.16)"
        : isLightSurface
        ? "inset 0 1px 0 rgba(255,255,255,0.7), 0 14px 34px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.08)"
        : "inset 0 1px 0 rgba(255,255,255,0.08), 0 14px 34px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
      transition:
        "margin 0.35s cubic-bezier(0.22, 1, 0.36, 1), padding 0.35s cubic-bezier(0.22, 1, 0.36, 1), background 0.25s ease, box-shadow 0.25s ease",
    };

    const spacingClass =
      config.iconSpacing === "roomy"
        ? "gap-2"
        : config.iconSpacing === "normal"
        ? "gap-1"
        : "gap-0.5";

    const Separator = () => (
      <span
        aria-hidden="true"
        className={
          isVertical
            ? "w-[20px] h-[1px] bg-white/10 my-1.5 shrink-0 select-none pointer-events-none"
            : "w-[1px] h-[20px] bg-white/10 mx-1.5 shrink-0 select-none pointer-events-none"
        }
      />
    );

    const hasModule = (id: string) =>
      config.modules.some((m) => m.id === id && m.enabled);

    const handleAppClick = async (app: any, forceNewInstance = false) => {
      if (!forceNewInstance && app.hwnd) {
        try {
          await invoke("activate_or_toggle_window", { hwnd: app.hwnd });
          window.dispatchEvent(new CustomEvent("gili_sync_running_windows"));
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("gili_sync_running_windows"));
          }, 60);
          return;
        } catch {}
      }

      if (app.lnkPath) {
        try {
          await invoke("launch_pinned_app", {
            lnkPath: app.lnkPath,
            targetPath: app.targetPath || "",
            arguments: app.arguments || "",
          });
          return;
        } catch (err) {
          console.error("Failed to launch pinned app via shortcut:", err);
        }
      }

      try {
        switch (app.id) {
          case "explorer":
            await invoke("trigger_file_explorer");
            break;
          case "chrome":
            await invoke("launch_target", { target: "chrome" });
            break;
          case "brave":
            await invoke("launch_target", { target: "brave" });
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
          case "gili":
            await invoke("open_settings_window", { section: null });
            break;
          case "spotify":
            await invoke("launch_target", { target: "spotify" });
            break;
          case "discord":
            await invoke("launch_target", { target: "discord" });
            break;
          default:
            await invoke("launch_target", { target: app.id });
            break;
        }
      } catch (err) {
        console.error("Failed to launch app:", err);
      }
    };

    const handleModulePointerDown = (e: React.PointerEvent, modId: string) => {
      if (isPreview || e.button !== 0) return;
      if (modId === "pinnedApps" || modId === "runningApps") return;
      const slotEl = modSlotRefs.current.get(modId);
      const rect = slotEl
        ? slotEl.getBoundingClientRect()
        : (e.currentTarget as HTMLElement).getBoundingClientRect();

      modDragRef.current = {
        id: modId,
        startX: e.clientX,
        startY: e.clientY,
        pointerX: e.clientX,
        pointerY: e.clientY,
        grabOffsetX: e.clientX - rect.left,
        grabOffsetY: e.clientY - rect.top,
        hasMoved: false,
        lastSwapAt: 0,
      };
    };

    // Build ordered groups respecting config.modules order & group assignment
    const renderedCoreApps = { done: false };

    const wrapDraggableModule = (
      slotId: string,
      node: React.ReactNode
    ): React.ReactNode => {
      if (!node) return null;
      const isDraggingThis = draggingModuleId === slotId;
      return (
        <motion.div
          layout={!isDraggingThis ? "position" : false}
          transition={{ type: "spring", stiffness: 380, damping: 34, mass: 0.6 }}
          key={`mod-slot-${slotId}`}
          ref={(el) => {
            if (el) modSlotRefs.current.set(slotId, el);
            else modSlotRefs.current.delete(slotId);
          }}
          onDragStart={(e) => e.preventDefault()}
          onPointerDown={(e) => handleModulePointerDown(e, slotId)}
          onClickCapture={(e) => {
            if (draggingModuleId === slotId || justFinishedModDragRef.current) {
              e.stopPropagation();
              e.preventDefault();
            }
          }}
          className={`flex items-center shrink-0 select-none ${
            slotId !== "pinnedApps" && slotId !== "runningApps"
              ? "cursor-grab active:cursor-grabbing"
              : ""
          } ${isDraggingThis ? "z-40" : "z-10"}`}
        >
          <div
            ref={(el) => {
              if (el) modInnerRefs.current.set(slotId, el);
              else modInnerRefs.current.delete(slotId);
            }}
            className="flex items-center shrink-0"
          >
            {node}
          </div>
        </motion.div>
      );
    };

    const renderModuleNode = (
      m: NavbarConfig["modules"][number]
    ): React.ReactNode => {
      if (!m.enabled) return null;

      if (m.id === "startSearch") {
        return wrapDraggableModule(
          m.id,
          <StartSearchGroup
            key="startSearch"
            iconSize={iconSize}
            accentColor={accentColor}
            isVertical={isVertical}
            onStartClick={onStartClick}
            onSearchClick={onSearchClick}
          />
        );
      }

      if (m.id === "pinnedApps" || m.id === "runningApps") {
        if (renderedCoreApps.done) return null;
        renderedCoreApps.done = true;
        return wrapDraggableModule(
          m.id,
          <PinnedAppsGroup
            key="pinnedAppsGroup"
            isPreview={isPreview}
            iconSize={iconSize}
            iconTheme={config.iconTheme || "fluent"}
            position={pos}
            magnifyOnHover={config.magnify}
            windowPreviews={config.windowPreviews}
            showAppLabels={config.appLabels}
            accentColor={config.accent}
            showRunningApps={hasModule("runningApps")}
            onPreviewStateChange={onPreviewStateChange}
            onAppClick={handleAppClick}
          />
        );
      }

      if (
        m.id === "systemIcons" ||
        m.id === "notifications" ||
        m.id === "clockDate"
      ) {
        return wrapDraggableModule(
          m.id,
          <SystemTrayGroup
            key={m.id}
            accentColor={config.accent}
            use24HourClock={config.clock24h}
            singleItem={m.id}
            isVertical={isVertical}
            onControlCenterClick={onControlCenterClick}
            onNotificationsClick={onNotificationsClick}
            onClockClick={onClockClick}
            onVolumeClick={onVolumeClick}
          />
        );
      }

      const def = getNavbarModuleById(m.id);
      if (def?.component) {
        const Component = def.component;
        return wrapDraggableModule(
          m.id,
          <Component
            key={m.id}
            view={isVertical ? "compact" : m.view}
            config={config}
          />
        );
      }

      return wrapDraggableModule(
        m.id,
        <NavbarModuleUnifiedPreview
          key={m.id}
          moduleId={m.id}
          variant={!isVertical && m.view === "full" ? "pill" : "compact"}
          className="cursor-pointer hover:opacity-90 transition-opacity"
        />
      );
    };

    const group1Nodes = config.modules
      .filter((m) => (m.group || 1) === 1 && m.enabled)
      .map(renderModuleNode)
      .filter(Boolean);

    const group2Nodes = config.modules
      .filter((m) => (m.group || 2) === 2 && m.enabled)
      .map(renderModuleNode)
      .filter(Boolean);

    if (extraModules) {
      group2Nodes.push(
        <React.Fragment key="extra">{extraModules}</React.Fragment>
      );
    }

    const group3Nodes = config.modules
      .filter((m) => (m.group || 3) === 3 && m.enabled)
      .map(renderModuleNode)
      .filter(Boolean);

    const nonEmptyGroups = [group1Nodes, group2Nodes, group3Nodes].filter(
      (g) => g.length > 0
    );

    return (
      <div
        ref={setCombinedRef}
        style={dockStyle}
        className={`relative inline-flex ${
          isVertical ? "flex-col" : "flex-row"
        } items-center ${
          isLightSurface ? "navbar-surface-light text-zinc-900" : "text-white"
        } select-none whitespace-nowrap box-border overflow-visible ${spacingClass}`}
      >
        {/* Unified Anchored Surface (continuous dock body + both ears into 1 SVG clip & surface) */}
        {isAnchored && surfaceMetrics && (
          <div
            aria-hidden="true"
            className="absolute pointer-events-none select-none z-0 overflow-visible"
            style={{
              left: `${surfaceMetrics.offsetLeft}px`,
              top: `${surfaceMetrics.offsetTop}px`,
              width: `${surfaceMetrics.totalW}px`,
              height: `${surfaceMetrics.totalH}px`,
              filter: isLiquid
                ? isLightSurface
                  ? "drop-shadow(0 10px 22px rgba(0,0,0,0.14))"
                  : "drop-shadow(0 14px 30px rgba(0,0,0,0.32))"
                : isLightSurface
                ? "drop-shadow(0 6px 18px rgba(0,0,0,0.12))"
                : "drop-shadow(0 12px 28px rgba(0,0,0,0.45))",
            }}
          >
            <svg
              className="absolute inset-0 w-full h-full block overflow-visible"
              viewBox={`0 0 ${surfaceMetrics.totalW} ${surfaceMetrics.totalH}`}
              preserveAspectRatio="none"
              shapeRendering="geometricPrecision"
            >
              <defs>
                <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                  <path d={fillPath} />
                </clipPath>
              </defs>
            </svg>

            {/* Unified Clipped Surface (body + both ears) */}
            <div
              className="absolute inset-0 pointer-events-none overflow-hidden"
              style={{
                clipPath: `url(#${clipId})`,
                WebkitClipPath: `url(#${clipId})`,
                background: isLiquid ? undefined : surfaceBackground,
              }}
            >
              {isLiquid && desktopBackdropUrl && (
                <img
                  src={desktopBackdropUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                  style={{
                    filter: "blur(26px) saturate(175%) brightness(1.05)",
                    transform: "scale(1.08)",
                  }}
                />
              )}
              {isLiquid && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: surfaceBackground,
                  }}
                />
              )}
            </div>

            {/* Seamless Perimeter Outline following dock and ears */}
            <svg
              className="absolute inset-0 w-full h-full block overflow-visible"
              viewBox={`0 0 ${surfaceMetrics.totalW} ${surfaceMetrics.totalH}`}
              preserveAspectRatio="none"
              shapeRendering="geometricPrecision"
            >
              <path
                d={outlinePath}
                fill="none"
                stroke={
                  isLiquid
                    ? isLightSurface
                      ? "rgba(255,255,255,0.65)"
                      : "rgba(255,255,255,0.22)"
                    : isLightSurface
                    ? "rgba(0,0,0,0.08)"
                    : "rgba(255,255,255,0.08)"
                }
                strokeWidth="1"
              />
            </svg>
          </div>
        )}

        {/* Real captured desktop wallpaper behind dock in Floating mode */}
        {!isAnchored && isLiquid && desktopBackdropUrl && (
          <div className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none z-0">
            <img
              src={desktopBackdropUrl}
              alt=""
              className="w-full h-full object-cover pointer-events-none select-none"
              style={{
                filter: "blur(26px) saturate(175%) brightness(1.05)",
                transform: "scale(1.08)",
              }}
            />
          </div>
        )}

        {/* Liquid Glass Specular Reflection Highlight for Floating mode */}
        {!isAnchored && isLiquid && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
              pointerEvents: "none",
              zIndex: 0,
              background: surfaceBackground,
            }}
          />
        )}

        {/* Dock modules & items */}
        <div
          className={`relative z-[1] flex ${
            isVertical ? "flex-col" : "flex-row"
          } items-center ${spacingClass}`}
        >
          {nonEmptyGroups.map((groupNodes, gIdx) => (
            <React.Fragment key={`grp-${gIdx}`}>
              {gIdx > 0 && <Separator />}
              <div
                className={`flex ${
                  isVertical ? "flex-col" : "flex-row"
                } items-center gap-1 shrink-0`}
              >
                {groupNodes}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }
);

NavbarDock.displayName = "NavbarDock";
