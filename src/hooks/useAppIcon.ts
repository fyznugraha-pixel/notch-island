import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// Shared across mounts so the mixer's 2.5s poll never re-requests an icon it already has.
const MAX_ICON_CACHE_ENTRIES = 150;
const iconByPath = new Map<string, string | null>();
const pendingByPath = new Map<string, Promise<string | null>>();

function getCachedIcon(exePath: string): string | null | undefined {
  if (!iconByPath.has(exePath)) return undefined;
  const cached = iconByPath.get(exePath) ?? null;
  iconByPath.delete(exePath);
  iconByPath.set(exePath, cached);
  return cached;
}

function setCachedIcon(exePath: string, dataUrl: string | null): void {
  if (iconByPath.has(exePath)) {
    iconByPath.delete(exePath);
  } else if (iconByPath.size >= MAX_ICON_CACHE_ENTRIES) {
    const oldestKey = iconByPath.keys().next().value;
    if (oldestKey !== undefined) {
      iconByPath.delete(oldestKey);
    }
  }
  iconByPath.set(exePath, dataUrl);
}

function loadAppIcon(exePath: string): Promise<string | null> {
  const pending = pendingByPath.get(exePath);
  if (pending) return pending;

  const request = invoke<string | null>("get_app_icon", { path: exePath })
    .catch(() => null)
    .then((dataUrl) => {
      setCachedIcon(exePath, dataUrl ?? null);
      pendingByPath.delete(exePath);
      return dataUrl ?? null;
    });
  pendingByPath.set(exePath, request);
  return request;
}

export function useAppIcon(exePath?: string | null): string | null {
  const [iconUrl, setIconUrl] = useState<string | null>(() =>
    exePath ? iconByPath.get(exePath) ?? null : null
  );

  useEffect(() => {
    if (!exePath) {
      setIconUrl(null);
      return;
    }
    if (iconByPath.has(exePath)) {
      setIconUrl(getCachedIcon(exePath) ?? null);
      return;
    }
    let isActive = true;
    loadAppIcon(exePath).then((dataUrl) => {
      if (isActive) setIconUrl(dataUrl);
    });
    return () => {
      isActive = false;
    };
  }, [exePath]);

  return iconUrl;
}

