import { useEffect, useId, useRef, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface PopupHitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const activeFocusIds = new Set<string>();

export async function registerNavbarPopup(
  id: string,
  rect: PopupHitRect | null
): Promise<void> {
  await invoke("register_navbar_popup", { id, rect }).catch(() => {});
}

export async function unregisterNavbarPopup(id: string): Promise<void> {
  await invoke("unregister_navbar_popup", { id }).catch(() => {});
}

export async function acquireNavbarFocus(id: string): Promise<void> {
  const wasEmpty = activeFocusIds.size === 0;
  activeFocusIds.add(id);
  if (wasEmpty) {
    await invoke("set_navbar_focusable", { focusable: true }).catch(() => {});
  }
}

export async function releaseNavbarFocus(id: string): Promise<void> {
  if (!activeFocusIds.delete(id)) return;
  if (activeFocusIds.size === 0) {
    await invoke("set_navbar_focusable", { focusable: false }).catch(() => {});
  }
}

export interface UseNavbarPopupHitOptions {
  idPrefix: string;
  open: boolean;
  elementRef: RefObject<HTMLElement | null>;
  focusable?: boolean;
  onDismiss?: () => void;
}

export function useNavbarPopupHit({
  idPrefix,
  open,
  elementRef,
  focusable = false,
  onDismiss,
}: UseNavbarPopupHitOptions): void {
  const instanceId = useId();
  const registryId = `${idPrefix}:${instanceId}`;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;

    const attachObserverIfNeeded = (el: HTMLElement) => {
      if (!observer && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(syncRect);
        observer.observe(el);
      }
    };

    const syncRect = () => {
      if (cancelled) return;
      const el = elementRef.current;
      if (!el) return;
      attachObserverIfNeeded(el);
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      void registerNavbarPopup(registryId, {
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
      });
    };

    syncRect();
    const rafId = requestAnimationFrame(syncRect);
    const settleTimer = window.setTimeout(syncRect, 180);
    window.addEventListener("resize", syncRect);

    if (focusable) {
      void acquireNavbarFocus(registryId);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      clearTimeout(settleTimer);
      observer?.disconnect();
      window.removeEventListener("resize", syncRect);
      void unregisterNavbarPopup(registryId);
      if (focusable) {
        void releaseNavbarFocus(registryId);
      }
    };
  }, [open, registryId, elementRef, focusable]);

  useEffect(() => {
    if (!open || !onDismissRef.current) return;

    let active = true;
    let unlisten: (() => void) | undefined;

    void listen("navbar-dismiss-popovers", () => {
      if (active) onDismissRef.current?.();
    })
      .then((fn) => {
        if (active) {
          unlisten = fn;
        } else {
          fn();
        }
      })
      .catch(() => {});

    const handleBlur = () => {
      onDismissRef.current?.();
    };
    window.addEventListener("blur", handleBlur);

    return () => {
      active = false;
      unlisten?.();
      window.removeEventListener("blur", handleBlur);
    };
  }, [open]);
}
