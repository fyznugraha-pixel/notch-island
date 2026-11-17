import React, { useState, useRef, useEffect, useLayoutEffect, useId } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { motion } from "framer-motion";
import { NavbarConfig } from "../../types/navbar";
import { saveNavbarConfig } from "../../services/navbarConfigService";
import { useNotchTheme } from "../../hooks/useNotchTheme";
import {
  buildNotchPath,
  buildNotchOutlinePath,
  getNotchSurfaceMetrics,
} from "../../utils/notchGeometry";
import { StartSearchGroup } from "./groups/StartSearchGroup";
import { PinnedAppsGroup } from "./groups/PinnedAppsGroup";
import { SystemTrayGroup } from "./groups/SystemTrayGroup";
import { getNavbarModuleComponent } from "../../modules/moduleComponents";
import {
  registerNavbarPopup,
  unregisterNavbarPopup,
} from "../../services/navbarPopupService";

const NavbarModuleUnifiedPreview = React.lazy(() =>
  import("../../modules/components/NavbarModuleUnifiedPreview").then((m) => ({
    default: m.NavbarModuleUnifiedPreview,
  }))
);
import { FrostedGlassOverlay } from "../ui/FrostedGlassOverlay";
import {
  computeCalibratedGlassPalette,
  PRESET_LIQUID_GLASS,
} from "../../utils/frostedGlass";

export interface NavbarSurfaceThemeInfo {
  isLight: boolean;
  isTranslucent: boolean;
  opacityPct: number;
}

interface NavbarDockProps {
  config: NavbarConfig;
  extraModules?: React.ReactNode;
  isPreview?: boolean;
  isHidden?: boolean;
  onStartClick?: () => void;
  onSearchClick?: () => void;
  onControlCenterClick?: () => void;
  onNotificationsClick?: () => void;
  onClockClick?: () => void;
  onVolumeClick?: (e: React.MouseEvent) => void;
  onTrayClick?: () => void;
  onPreviewStateChange?: (isShowing: boolean) => void;
  onLightSurfaceChange?: (isLight: boolean) => void;
  onSurfaceThemeChange?: (info: NavbarSurfaceThemeInfo) => void;
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
      isHidden = false,
      onStartClick,
      onSearchClick,
      onControlCenterClick,
      onNotificationsClick,
      onClockClick,
      onVolumeClick,
      onTrayClick,
      onPreviewStateChange,
      onLightSurfaceChange,
      onSurfaceThemeChange,
    },
    ref
  ) => {
    const isAnchored = config.shape === "anchored";
    const effectiveHidden = Boolean(isHidden && !isPreview);
    const pos = config.position || "bottom";
    const isTop = pos === "top";
    const isLeft = pos === "left";
    const isRight = pos === "right";
    const isVertical = isLeft || isRight;

    const dockThickness = Math.max(36, Math.min(64, config.taskbarHeight || 48));
    const slotSize = Math.max(24, dockThickness - 8); // 40px when taskbarHeight = 48px
    const iconSize = config.iconSize || 40;
    const moduleSize = slotSize;
    const isDenseDock = moduleSize < 36;
    const dockCssVars = {
      "--navbar-icon-size": `${slotSize}px`,
      "--navbar-mod-size": `${moduleSize}px`,
      "--navbar-dock-thickness": `${dockThickness}px`,
      "--navbar-mod-px": moduleSize < 30 ? "6px" : isDenseDock ? "8px" : "12px",
      "--navbar-mod-gap": moduleSize < 30 ? "4px" : isDenseDock ? "6px" : "8px",
      "--navbar-mod-title": moduleSize < 30 ? "9.5px" : isDenseDock ? "10.5px" : "11px",
      "--navbar-mod-sub": moduleSize < 30 ? "8px" : isDenseDock ? "9px" : "9.5px",
    } as React.CSSProperties;
    const radius = config.cornerRadius ?? 15;
    const accentColor = config.accent || "#3882F6";
    const {
      notchMode,
      notchOpacity,
      notchBlur,
      notchIsTranslucent,
    } = useNotchTheme();

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
          void registerNavbarPopup("drag:module", null);
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
          void unregisterNavbarPopup("drag:module");
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
        void unregisterNavbarPopup("drag:module");
      };
    }, [isPreview]);

    // Background, Blur & Opacity Calculation (Notch-calibrated)
    const isLiquid = config.style === "liquid";
    const isSolid = config.style === "solid";
    const isFollowNotch =
      config.style === "followNotch" || config.background === "followNotch";
    const manualAlpha = Math.max(0.15, Math.min(1, (config.opacity ?? 100) / 100));
    const effectiveAlpha = isFollowNotch ? notchOpacity : manualAlpha;
    const manualBlur = isLiquid
      ? (config.blur ?? PRESET_LIQUID_GLASS.blur)
      : manualAlpha < 0.98
      ? 36
      : 0;
    const effectiveBlur = isFollowNotch ? notchBlur : manualBlur;
    const isTranslucent = isFollowNotch
      ? notchIsTranslucent
      : isLiquid || manualAlpha < 0.98;

    const customColor =
      !isFollowNotch && config.background === "custom"
        ? config.customColor || "#0f172a"
        : null;
    const edgeGap = isAnchored ? 0 : config.distanceFromEdge ?? 14;

    const isHexLight = (hex: string) => {
      const clean = hex.replace("#", "");
      if (clean.length !== 6) return false;
      const r = parseInt(clean.slice(0, 2), 16);
      const g = parseInt(clean.slice(2, 4), 16);
      const b = parseInt(clean.slice(4, 6), 16);
      return (r * 299 + g * 587 + b * 114) / 1000 > 165;
    };

    const isLightSurface = isFollowNotch
      ? notchMode === "light"
      : customColor
      ? isHexLight(customColor)
      : false;

    const useConcaveEars = isAnchored;

    const glassPalette = computeCalibratedGlassPalette({
      opacity: effectiveAlpha,
      blur: effectiveBlur,
      isLight: isLightSurface,
      customColor,
      isTranslucent,
      isSolidOverride: !isTranslucent,
    });

    useEffect(() => {
      onLightSurfaceChange?.(isLightSurface);
      onSurfaceThemeChange?.({
        isLight: isLightSurface,
        isTranslucent: glassPalette.isTranslucent,
        opacityPct: Math.round(glassPalette.effectiveOpacity * 100),
      });
    }, [
      isLightSurface,
      glassPalette.isTranslucent,
      glassPalette.effectiveOpacity,
      onLightSurfaceChange,
      onSurfaceThemeChange,
    ]);

    const effectiveRadiusPx = useConcaveEars
      ? radius
      : isAnchored
      ? radius <= 1
        ? 0
        : Math.min(radius, 8)
      : radius;
    const borderRadiusValue = `${radius}px`;
    const anchoredGlassRadius = radius <= 1 ? "0px" : `${Math.min(radius, 8)}px`;
    const surfaceRadius = useConcaveEars
      ? undefined
      : isAnchored
      ? anchoredGlassRadius
      : borderRadiusValue;
    const useNativeAcrylic =
      glassPalette.isTranslucent && Math.round(glassPalette.effectiveBlur) > 1;
    // Concave ears across all Anchored modes (solid, liquid glass, follow-notch & custom opacity)
    const earRadius = useConcaveEars
      ? Math.max(28, Math.min(40, Math.round(dockThickness * 0.58 + (radius - 10) * 0.4)))
      : 0;

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
    }, [
      config.modules,
      config.taskbarHeight,
      config.iconSize,
      config.shape,
      config.position,
      config.style,
      config.opacity,
      config.blur,
      effectiveAlpha,
      effectiveBlur,
    ]);

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

    const acrylicSyncedOnceRef = useRef(false);
    useEffect(() => {
      if (isPreview) return;
      const el = localDockRef.current;
      if (!el) return;

      let active = true;
      let rafId = 0;

      const syncNow = () => {
        if (!active || !localDockRef.current) return;
        const shouldEnable = !isHidden && useNativeAcrylic;
        if (!shouldEnable) {
          if (acrylicSyncedOnceRef.current) {
            acrylicSyncedOnceRef.current = false;
            invoke("sync_notch_acrylic", {
              enabled: false,
              containerLeft: 0,
              containerTop: 0,
              width: 0,
              height: 0,
              earRadius: 0,
              bottomRadius: 0,
              topRadius: 0,
              isIsland: true,
              position: pos,
              dpr: window.devicePixelRatio || 1,
              blurStrength: 0,
              opacity: 1,
              isLight: false,
            }).catch(() => {});
          }
          return;
        }

        const rect = localDockRef.current.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) return;
        const scaleX = currentW > 0 ? rect.width / currentW : 1;
        const scaledR = effectiveRadiusPx * scaleX;
        const earScaled = useConcaveEars ? Math.round(earRadius * scaleX) : 0;
        acrylicSyncedOnceRef.current = true;
        invoke("sync_notch_acrylic", {
          enabled: true,
          containerLeft: rect.left,
          containerTop: rect.top,
          width: rect.width,
          height: rect.height,
          earRadius: earScaled,
          bottomRadius: scaledR,
          topRadius: scaledR,
          isIsland: !isAnchored,
          position: pos,
          dpr: window.devicePixelRatio || 1,
          blurStrength: Math.round(glassPalette.effectiveBlur),
          opacity: glassPalette.effectiveOpacity,
          isLight: isLightSurface,
        }).catch(() => {});
      };

      syncNow();
      if (!isHidden && useNativeAcrylic) {
        const start = performance.now();
        const glide = () => {
          if (!active) return;
          syncNow();
          if (performance.now() - start < 560) {
            rafId = requestAnimationFrame(glide);
          }
        };
        rafId = requestAnimationFrame(glide);
      }

      const ro = new ResizeObserver(syncNow);
      ro.observe(el);
      window.addEventListener("resize", syncNow);
      return () => {
        active = false;
        cancelAnimationFrame(rafId);
        ro.disconnect();
        window.removeEventListener("resize", syncNow);
      };
    }, [
      isPreview,
      isHidden,
      useNativeAcrylic,
      useConcaveEars,
      isAnchored,
      earRadius,
      pos,
      effectiveRadiusPx,
      currentW,
      dockDim.h,
      config.taskbarHeight,
      glassPalette.effectiveBlur,
      glassPalette.effectiveOpacity,
      isLightSurface,
      config.distanceFromEdge,
      config.shape,
      config.position,
    ]);

    useEffect(() => {
      if (isPreview) return;
      return () => {
        if (acrylicSyncedOnceRef.current) {
          acrylicSyncedOnceRef.current = false;
          invoke("sync_notch_acrylic", {
            enabled: false,
            containerLeft: 0,
            containerTop: 0,
            width: 0,
            height: 0,
            earRadius: 0,
            bottomRadius: 0,
            topRadius: 0,
            isIsland: true,
            position: "bottom",
            dpr: 1,
            blurStrength: 0,
            opacity: 1,
            isLight: false,
          }).catch(() => {});
        }
      };
    }, [isPreview]);

    const pathParams = {
      width: currentW,
      height: currentH,
      earRadius,
      bottomRadius: radius,
      isIsland: false,
      isBottom: pos === "bottom",
      position: pos as any,
    };
    const surfaceMetrics = useConcaveEars ? getNotchSurfaceMetrics(pathParams) : null;
    const fillPath = useConcaveEars ? buildNotchPath(pathParams) : "";
    const outlinePath = useConcaveEars ? buildNotchOutlinePath(pathParams) : "";

    const dockStyle: React.CSSProperties = {
      width: isVertical ? `${dockThickness}px` : undefined,
      height: isVertical ? undefined : `${dockThickness}px`,
      background: useConcaveEars ? "transparent" : glassPalette.backgroundFill,
      backdropFilter:
        !useConcaveEars && isPreview
          ? glassPalette.previewBackdropFilter
          : undefined,
      WebkitBackdropFilter:
        !useConcaveEars && isPreview
          ? glassPalette.previewBackdropFilter
          : undefined,
      borderRadius: surfaceRadius,
      marginBottom: !isVertical && !isTop ? `${edgeGap}px` : "0px",
      marginTop: !isVertical && isTop ? `${edgeGap}px` : "0px",
      marginLeft: isLeft ? `${edgeGap}px` : "0px",
      marginRight: isRight ? `${edgeGap}px` : "0px",
      paddingLeft: isVertical ? "0px" : isAnchored ? "10px" : "14px",
      paddingRight: isVertical ? "0px" : isAnchored ? "10px" : "14px",
      paddingTop: isVertical ? (isAnchored ? "10px" : "14px") : "0px",
      paddingBottom: isVertical ? (isAnchored ? "10px" : "14px") : "0px",
      boxShadow: useConcaveEars
        ? undefined
        : isAnchored
        ? undefined
        : isLightSurface
        ? "0 12px 30px rgba(0,0,0,0.18)"
        : "0 14px 34px rgba(0,0,0,0.42)",
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
            ? `w-[min(20px,calc(var(--navbar-mod-size,40px)-6px))] h-[1px] ${isLightSurface ? "bg-black/15" : "bg-white/10"} my-1.5 shrink-0 select-none pointer-events-none`
            : `w-[1px] h-[min(20px,calc(var(--navbar-mod-size,40px)-6px))] ${isLightSurface ? "bg-black/15" : "bg-white/10"} mx-1.5 shrink-0 select-none pointer-events-none`
        }
      />
    );

    const hasModule = (id: string) =>
      config.modules.some((m) => m.id === id && m.enabled);

    const handleAppClick = async (
      app: any,
      forceNewInstance = false,
      anchorRect?: {
        x: number;
        y: number;
        width: number;
        height: number;
        position: string;
      },
    ) => {
      emit("navbar-dismiss-popovers").catch(() => {});
      if (!forceNewInstance) {
        const candidateHwnds = Array.from(
          new Set(
            [
              app.hwnd,
              ...((Array.isArray(app.windows) ? app.windows : []).map((w: any) => w?.hwnd)),
            ].filter((h): h is number => typeof h === "number" && h > 0),
          ),
        );
        for (const candidateHwnd of candidateHwnds) {
          try {
            const activated = await invoke<boolean>("activate_or_toggle_window", {
              hwnd: candidateHwnd,
              anchorRect,
            });
            if (activated) {
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("gili_sync_running_windows"));
              }, 180);
              return;
            }
          } catch {}
        }
      }

      if (anchorRect) {
        invoke("set_dock_action_anchor", { anchor: anchorRect }).catch(() => {});
      }

      if (app.lnkPath || app.targetPath) {
        try {
          await invoke("launch_pinned_app", {
            lnkPath: app.lnkPath || "",
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
            await invoke("trigger_file_explorer", { anchorRect });
            break;
          case "chrome":
            await invoke("launch_target", { target: "chrome", anchorRect });
            break;
          case "brave":
            await invoke("launch_target", { target: "brave", anchorRect });
            break;
          case "vscode":
            await invoke("launch_target", { target: "code", anchorRect });
            break;
          case "terminal":
            await invoke("launch_target", { target: "wt", anchorRect });
            break;
          case "settings":
            await invoke("launch_target", { target: "ms-settings:", anchorRect });
            break;
          case "gili":
            await invoke("open_settings_window", { section: null, anchorRect });
            break;
          case "spotify":
            await invoke("launch_target", { target: "spotify", anchorRect });
            break;
          case "discord":
            await invoke("launch_target", { target: "discord", anchorRect });
            break;
          case "telegram":
            await invoke("launch_target", { target: "tg://", anchorRect });
            break;
          case "whatsapp":
            await invoke("launch_target", { target: "whatsapp://", anchorRect });
            break;
          case "slack":
            await invoke("launch_target", { target: "slack://", anchorRect });
            break;
          case "calculator":
          case "calculatorapp":
            await invoke("launch_target", { target: "calculator:", anchorRect });
            break;
          default:
            await invoke("launch_target", {
              target: app.targetPath || app.id,
              anchorRect,
            });
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

      if (rect.width > 0 && rect.height > 0) {
        invoke("set_dock_action_anchor", {
          anchor: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            position: pos,
          },
        }).catch(() => {});
      }

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
          layout={Boolean(draggingModuleId) && !isDraggingThis ? "position" : false}
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
            isVertical ? "w-full min-w-0 max-w-full justify-center" : ""
          } ${
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
            className={`flex items-center shrink-0 ${
              isVertical ? "w-full min-w-0 max-w-full justify-center" : ""
            }`}
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
            iconSize={slotSize}
            accentColor={accentColor}
            isVertical={isVertical}
            position={pos}
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
            isHidden={effectiveHidden}
            slotSize={slotSize}
            iconSize={iconSize}
            iconTheme={config.iconTheme || "fluent"}
            position={pos}
            magnifyOnHover={config.magnify}
            windowPreviews={config.windowPreviews}
            showAppLabels={config.appLabels}
            accentColor={config.accent}
            isLightSurface={isLightSurface}
            showPinnedApps={hasModule("pinnedApps")}
            showRunningApps={hasModule("runningApps")}
            onPreviewStateChange={onPreviewStateChange}
            onAppClick={handleAppClick}
          />
        );
      }

      if (
        m.id === "hiddenTray" ||
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
            position={pos}
            isHidden={effectiveHidden}
            isPreview={isPreview}
            onControlCenterClick={onControlCenterClick}
            onNotificationsClick={onNotificationsClick}
            onClockClick={onClockClick}
            onVolumeClick={onVolumeClick}
            onTrayClick={onTrayClick}
          />
        );
      }

      const Component = getNavbarModuleComponent(m.id);
      if (Component) {
        return wrapDraggableModule(
          m.id,
          <React.Suspense key={m.id} fallback={null}>
            <Component
              view={isVertical ? "compact" : m.view}
              config={config}
              isHidden={effectiveHidden}
              isPreview={isPreview}
            />
          </React.Suspense>
        );
      }

      return wrapDraggableModule(
        m.id,
        <React.Suspense key={m.id} fallback={null}>
          <NavbarModuleUnifiedPreview
            moduleId={m.id}
            variant={!isVertical && m.view === "full" ? "pill" : "compact"}
            className="gili-mod-unified cursor-pointer hover:opacity-90 transition-opacity"
          />
        </React.Suspense>
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
        data-gili-navbar-dock="true"
        data-dock-dense={isDenseDock ? "true" : undefined}
        style={{ ...dockStyle, ...dockCssVars }}
        className={`relative inline-flex ${
          isVertical ? "flex-col" : "flex-row"
        } items-center ${
          isLightSurface ? "navbar-surface-light text-zinc-900" : "text-white"
        } select-none whitespace-nowrap box-border overflow-visible ${spacingClass}`}
      >
        {/* Unified Anchored Surface for all styles (ears + flat bezel join) */}
        {useConcaveEars && surfaceMetrics && (
          <div
            aria-hidden="true"
            className="absolute pointer-events-none select-none z-0 overflow-visible"
            style={{
              left: `${surfaceMetrics.offsetLeft}px`,
              top: `${surfaceMetrics.offsetTop}px`,
              width: `${surfaceMetrics.totalW}px`,
              height: `${surfaceMetrics.totalH}px`,
              filter: isTranslucent
                ? undefined
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

            <div
              className="absolute inset-0 pointer-events-none overflow-hidden"
              style={{
                clipPath: `url(#${clipId})`,
                WebkitClipPath: `url(#${clipId})`,
                background: glassPalette.backgroundFill,
                backdropFilter: isPreview
                  ? glassPalette.previewBackdropFilter
                  : undefined,
                WebkitBackdropFilter: isPreview
                  ? glassPalette.previewBackdropFilter
                  : undefined,
              }}
            >
              {glassPalette.isTranslucent && (
                <FrostedGlassOverlay
                  palette={glassPalette}
                  isLight={isLightSurface}
                  borderRadius={0}
                  position={
                    pos === "top"
                      ? "top"
                      : pos === "left"
                      ? "left"
                      : pos === "right"
                      ? "right"
                      : "bottom"
                  }
                  showBevelBorder={false}
                />
              )}
            </div>

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
                  glassPalette.isTranslucent
                    ? isLightSurface
                      ? "rgba(255,255,255,0.52)"
                      : "rgba(255,255,255,0.20)"
                    : isLightSurface
                    ? "rgba(0,0,0,0.08)"
                    : "rgba(255,255,255,0.08)"
                }
                strokeWidth="1"
              />
            </svg>
          </div>
        )}

        {/* Notch-calibrated frosted diffusion, "buram kasar" grain, specular & bevel border */}
        {!useConcaveEars && (
          <FrostedGlassOverlay
            palette={glassPalette}
            isLight={isLightSurface}
            borderRadius={surfaceRadius ?? 0}
            position={pos === "top" ? "top" : "bottom"}
            showBevelBorder={!isSolid || !isAnchored}
            solidBorderColor={
              isLightSurface ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.08)"
            }
          />
        )}

        {/* Dock modules & items */}
        <div
          className={`relative z-[2] flex ${
            isVertical ? "flex-col w-full min-w-0 max-w-full" : "flex-row"
          } items-center ${spacingClass}`}
        >
          {nonEmptyGroups.map((groupNodes, gIdx) => (
            <React.Fragment key={`grp-${gIdx}`}>
              {gIdx > 0 && <Separator />}
              <div
                className={`flex ${
                  isVertical ? "flex-col w-full min-w-0 max-w-full" : "flex-row"
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
