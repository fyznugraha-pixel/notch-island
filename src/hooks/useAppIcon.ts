import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// Shared across mounts so the mixer's 2.5s poll never re-requests an icon it already has.
const iconByPath = new Map<string, string | null>();
const pendingByPath = new Map<string, Promise<string | null>>();

function loadAppIcon(exePath: string): Promise<string | null> {
  const pending = pendingByPath.get(exePath);
  if (pending) return pending;

  const request = invoke<string | null>("get_app_icon", { path: exePath })
    .catch(() => null)
    .then((dataUrl) => {
      iconByPath.set(exePath, dataUrl ?? null);
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
      setIconUrl(iconByPath.get(exePath) ?? null);
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

