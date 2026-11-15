import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface WindowsPinnedAppItem {
  id: string;
  name: string;
  target_path: string;
  arguments: string;
  icon_base64?: string | null;
  icon_type?: string | null;
  lnk_path: string;
}

export function useWindowsPinnedApps(enabled: boolean = true) {
  const [pinnedApps, setPinnedApps] = useState<WindowsPinnedAppItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    // 1. Initial fetch from Rust backend
    invoke<WindowsPinnedAppItem[]>("get_windows_pinned_apps")
      .then((apps) => {
        if (isMounted && apps) {
          setPinnedApps(apps);
        }
      })
      .catch((err) => {
        console.error("Failed to load Windows pinned apps:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    // 2. Real-time background sync from Windows Taskbar folder watcher
    const unlistenPromise = listen<WindowsPinnedAppItem[]>(
      "gili://windows-pinned-apps-updated",
      (event) => {
        if (isMounted && event.payload) {
          setPinnedApps(event.payload);
        }
      }
    );

    return () => {
      isMounted = false;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [enabled]);

  return { pinnedApps, isLoading };
}

