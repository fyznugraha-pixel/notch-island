import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCachedNavbarConfigSync } from "../../services/navbarConfigService";

interface FlyoutStatePayload {
  isOpen: boolean;
  target: string;
  theme?: "solid" | "liquid";
  width?: number;
  height?: number;
}

export const TaskbarFlyoutApp: React.FC = () => {
  const [target, setTarget] = useState<string>("volume");
  const [theme, setTheme] = useState<"solid" | "liquid">(() => {
    const cfg = getCachedNavbarConfigSync();
    return cfg.style === "liquid" ? "liquid" : "solid";
  });

  useEffect(() => {
    // 1. Esc key dismiss handler
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        invoke("close_taskbar_flyout").catch(() => {});
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // 2. Listen to state changes from Rust window manager
    const unlisten = listen<FlyoutStatePayload>(
      "taskbar-flyout-state-changed",
      (event) => {
        if (event.payload) {
          if (event.payload.target) {
            setTarget(event.payload.target);
          }
          if (event.payload.theme) {
            setTheme(event.payload.theme);
          }
        }
      }
    );

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div
      data-taskbar-theme={theme}
      className="w-screen h-screen overflow-hidden bg-transparent flex flex-col select-none p-1.5"
    >
      <div
        role="dialog"
        aria-label={`Gili ${target}`}
        className="gili-flyout-container w-full h-full flex flex-col relative"
      >
        {/* Placeholder / foundation view for FASE 0 — each window will mount here */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="gili-flyout-card p-5 flex flex-col items-center gap-2 max-w-xs">
            <span className="text-[13px] font-semibold text-[var(--taskbar-text)]">
              Gili Flyout ({target})
            </span>
            <span className="text-[11px] text-[var(--taskbar-text-2)]">
              Tema aktif: <strong className="capitalize">{theme}</strong>
            </span>
            <button
              type="button"
              onClick={() => invoke("close_taskbar_flyout")}
              className="gili-flyout-chip px-3 py-1.5 rounded-lg text-[11px] font-medium mt-2 cursor-pointer text-[var(--taskbar-text)]"
            >
              Tutup (Esc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
