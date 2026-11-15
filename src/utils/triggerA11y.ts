import React from "react";

export const TRIGGER_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3882F6] focus-visible:ring-offset-1 focus-visible:ring-offset-transparent";

export function makeTriggerA11yProps(
  onActivate: () => void,
  label: string,
  expanded?: boolean
): React.HTMLAttributes<HTMLDivElement> {
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    "aria-expanded": expanded,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
