import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export function useSystemTextScale(): number {
  const [scale, setScale] = useState<number>(() => {
    try {
      const follow = localStorage.getItem("gili_follow_system_text_scale") !== "false";
      if (!follow) return 1.0;
      const cached = localStorage.getItem("gili_system_text_scale");
      if (cached) {
        const val = parseFloat(cached);
        if (!isNaN(val) && val >= 1.0) {
          return Math.min(1.5, val);
        }
      }
    } catch {}
    return 1.0;
  });

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const follow = localStorage.getItem("gili_follow_system_text_scale") !== "false";
    if (!follow) {
      setScale(1.0);
      return;
    }

    invoke<number>("get_system_text_scale_factor")
      .then((rawScale) => {
        const clamped = Math.min(1.5, Math.max(1.0, rawScale || 1.0));
        setScale(clamped);
        try {
          localStorage.setItem("gili_system_text_scale", String(clamped));
        } catch {}
      })
      .catch(() => {});

    listen<number>("system:text-scale-changed", (event) => {
      const isFollowing = localStorage.getItem("gili_follow_system_text_scale") !== "false";
      if (!isFollowing) {
        setScale(1.0);
        return;
      }
      const rawScale = event.payload;
      const clamped = Math.min(1.5, Math.max(1.0, rawScale || 1.0));
      setScale(clamped);
      try {
        localStorage.setItem("gili_system_text_scale", String(clamped));
      } catch {}
    }).then((un) => {
      unlisten = un;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return scale;
}

