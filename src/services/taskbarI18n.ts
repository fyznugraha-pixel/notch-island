import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { getLanguage, setLanguage, type Language } from "./languageStore";

export type DockPosition = "top" | "bottom" | "left" | "right";

export function tx(lang: Language, en: string, id: string): string {
  return lang === "id" ? id : en;
}

export function dateLocale(lang: Language): string {
  return lang === "id" ? "id-ID" : "en-US";
}

export function getNavbarTooltipSide(position?: DockPosition): DockPosition {
  switch (position) {
    case "top":
      return "bottom";
    case "left":
      return "right";
    case "right":
      return "left";
    case "bottom":
    default:
      return "top";
  }
}

export function useTaskbarLang(): Language {
  const [lang, setLang] = useState<Language>(() => getLanguage());

  useEffect(() => {
    let active = true;

    const syncFromStorage = () => {
      const next = getLanguage();
      if (active) setLang(next);
    };

    const handleLangEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<Language>).detail;
      if (detail === "en" || detail === "id") {
        if (active) setLang(detail);
      } else {
        syncFromStorage();
      }
    };

    const handleStorage = (ev: StorageEvent) => {
      if (ev.key === "island_language" && (ev.newValue === "en" || ev.newValue === "id")) {
        setLanguage(ev.newValue, false);
        if (active) setLang(ev.newValue);
      }
    };

    window.addEventListener("island_language_changed", handleLangEvent);
    window.addEventListener("storage", handleStorage);

    let unlistenSync: (() => void) | undefined;
    listen<{ type?: string; key?: string; value?: unknown }>("gili-settings-sync", (event) => {
      const p = event.payload;
      if (!p) return;
      if (p.type === "setting_key" && p.key === "opt_language") {
        if (p.value === "en" || p.value === "id") {
          setLanguage(p.value, false);
          if (active) setLang(p.value);
        }
      }
    })
      .then((unsub) => {
        if (!active) unsub();
        else unlistenSync = unsub;
      })
      .catch(() => {});

    load("settings.json")
      .then((store) => store.get<string>("opt_language"))
      .then((stored) => {
        if (active && (stored === "en" || stored === "id") && stored !== getLanguage()) {
          setLanguage(stored, false);
          setLang(stored);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      window.removeEventListener("island_language_changed", handleLangEvent);
      window.removeEventListener("storage", handleStorage);
      if (unlistenSync) unlistenSync();
    };
  }, []);

  return lang;
}
