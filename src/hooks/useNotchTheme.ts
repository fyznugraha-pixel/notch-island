import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import {
  getDefaultBlurForOpacity,
  resolveNotchThemeMode,
} from "../utils/frostedGlass";

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

function readStoredNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface NotchThemeInfo {
  notchMode: NotchIdleColorMode;
  notchBgHex: string;
  notchLabel: string;
  notchOpacity: number;
  notchBlur: number;
  notchGlassMode: "solid" | "glass" | "clear";
  notchIsTranslucent: boolean;
}

export function useNotchTheme(): NotchThemeInfo {
  const [rawTheme, setRawTheme] = useState<string>(() => {
    try {
      return localStorage.getItem("island_theme") || "dark";
    } catch {
      return "dark";
    }
  });

  const [notchOpacity, setNotchOpacity] = useState<number>(
    () => readStoredNumber("island_opacity") ?? 1.0
  );
  const [rawBlur, setRawBlur] = useState<number | null>(() =>
    readStoredNumber("island_blur")
  );

  useEffect(() => {
    let isMounted = true;

    load("settings.json", { autoSave: true })
      .then(async (s) => {
        const [savedTheme, savedOpacity, savedBlur] = await Promise.all([
          s.get<string>("opt_theme"),
          s.get<number>("opt_opacity"),
          s.get<number>("opt_blur"),
        ]);
        if (!isMounted) return;
        if (savedTheme === "dark" || savedTheme === "light" || savedTheme === "auto") {
          setRawTheme(savedTheme);
        }
        if (typeof savedOpacity === "number" && Number.isFinite(savedOpacity)) {
          setNotchOpacity(savedOpacity);
        }
        if (typeof savedBlur === "number" && Number.isFinite(savedBlur)) {
          setRawBlur(savedBlur);
        }
      })
      .catch(() => {});

    const unlistenPromise = listen<any>("gili-settings-sync", (event) => {
      const payload = event.payload;
      if (payload?.type !== "setting_key") return;
      if (payload.key === "opt_theme") {
        setRawTheme(String(payload.value || "dark"));
      } else if (payload.key === "opt_opacity") {
        const num = Number(payload.value);
        if (Number.isFinite(num)) setNotchOpacity(num);
      } else if (payload.key === "opt_blur") {
        const num = Number(payload.value);
        if (Number.isFinite(num)) setRawBlur(num);
      }
    });

    const onStorage = (e: StorageEvent) => {
      if (!e.newValue) return;
      if (e.key === "island_theme") {
        setRawTheme(e.newValue);
      } else if (e.key === "island_opacity") {
        const num = Number(e.newValue);
        if (Number.isFinite(num)) setNotchOpacity(num);
      } else if (e.key === "island_blur") {
        const num = Number(e.newValue);
        if (Number.isFinite(num)) setRawBlur(num);
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
  const notchBlur = rawBlur !== null ? rawBlur : getDefaultBlurForOpacity(notchOpacity);
  const notchGlassMode = resolveNotchThemeMode(notchOpacity, notchBlur);
  const notchIsTranslucent = notchGlassMode !== "solid";

  return {
    notchMode,
    notchBgHex,
    notchLabel,
    notchOpacity,
    notchBlur,
    notchGlassMode,
    notchIsTranslucent,
  };
}

