import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";

export type NotchIdleColorMode = "dark" | "light";

function resolveThemeMode(raw: string | null | undefined): NotchIdleColorMode {
  if (raw === "light") return "light";
  if (raw === "auto") {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
  }
  return "dark";
}

export function useNotchTheme(): {
  notchMode: NotchIdleColorMode;
  notchBgHex: string;
  notchLabel: string;
} {
  const [rawTheme, setRawTheme] = useState<string>(() => {
    try {
      return localStorage.getItem("island_theme") || "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    let isMounted = true;

    load("settings.json", { autoSave: true })
      .then(async (s) => {
        const saved = await s.get<string>("opt_theme");
        if (isMounted && (saved === "dark" || saved === "light" || saved === "auto")) {
          setRawTheme(saved);
        }
      })
      .catch(() => {});

    const unlistenPromise = listen<any>("gili-settings-sync", (event) => {
      const payload = event.payload;
      if (payload?.type === "setting_key" && payload?.key === "opt_theme") {
        setRawTheme(String(payload.value || "dark"));
      }
    });

    const onStorage = (e: StorageEvent) => {
      if (e.key === "island_theme" && e.newValue) {
        setRawTheme(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      isMounted = false;
      window.removeEventListener("storage", onStorage);
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  const notchMode = resolveThemeMode(rawTheme);
  const notchBgHex = notchMode === "light" ? "#f4f4f6" : "#000000";
  const notchLabel = notchMode === "light" ? "Putih (Terang)" : "Hitam (Gelap)";

  return { notchMode, notchBgHex, notchLabel };
}

