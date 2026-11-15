import { useEffect, useState } from "react";
import type { DockPosition } from "../../services/taskbarI18n";

function readDocumentLightMode(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.documentElement.classList.contains("light") ||
    document.documentElement.getAttribute("data-taskbar-light") === "true"
  );
}

/**
 * Tracks whether the navbar window is currently in Light Mode, reacting to
 * root `light` / `data-taskbar-light` mutations unless explicitly overridden.
 */
export function useNavbarLightMode(propLightMode?: boolean): boolean {
  const [docLight, setDocLight] = useState<boolean>(readDocumentLightMode);

  useEffect(() => {
    if (typeof propLightMode === "boolean" || typeof document === "undefined") {
      return;
    }

    const sync = () => setDocLight(readDocumentLightMode());
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-taskbar-light"],
    });

    return () => observer.disconnect();
  }, [propLightMode]);

  return typeof propLightMode === "boolean" ? propLightMode : docLight;
}

export function getInlineFlyoutPositionClass(
  position: DockPosition = "bottom",
  horizontalAlignClass = "right-4",
  verticalAlignClass = "bottom-4"
): string {
  switch (position) {
    case "top":
      return `top-full mt-3.5 ${horizontalAlignClass}`;
    case "left":
      return `left-full ml-3.5 ${verticalAlignClass}`;
    case "right":
      return `right-full mr-3.5 ${verticalAlignClass}`;
    case "bottom":
    default:
      return `bottom-full mb-3.5 ${horizontalAlignClass}`;
  }
}

export function getInlineFlyoutMotionOffset(position: DockPosition = "bottom") {
  switch (position) {
    case "top":
      return { opacity: 0, y: -12, scale: 0.96 };
    case "left":
      return { opacity: 0, x: -12, scale: 0.96 };
    case "right":
      return { opacity: 0, x: 12, scale: 0.96 };
    case "bottom":
    default:
      return { opacity: 0, y: 12, scale: 0.96 };
  }
}
