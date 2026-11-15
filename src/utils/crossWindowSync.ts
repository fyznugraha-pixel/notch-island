const WINDOW_ORIGIN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function emitCrossWindowEvent<T = unknown>(eventName: string, detail?: T): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(eventName, detail !== undefined ? { detail } : undefined));
  if (!hasTauriRuntime()) return;

  import("@tauri-apps/api/core")
    .then(({ invoke }) =>
      invoke("broadcast_settings_sync", {
        payload: {
          type: "app_event",
          event: eventName,
          detail: detail === undefined ? null : detail,
          senderId: WINDOW_ORIGIN_ID,
        },
      })
    )
    .catch(() => {});
}

export function listenCrossWindowEvent<T = unknown>(
  eventName: string,
  handler: (detail: T | undefined, fromRemote: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const localListener = (e: Event) => {
    const custom = e as CustomEvent<T>;
    handler(custom.detail, false);
  };
  window.addEventListener(eventName, localListener);

  let disposed = false;
  let unlistenTauri: (() => void) | null = null;

  if (hasTauriRuntime()) {
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<any>("gili-settings-sync", (event) => {
          const payload = event.payload;
          if (
            !disposed &&
            payload &&
            payload.type === "app_event" &&
            payload.event === eventName &&
            payload.senderId !== WINDOW_ORIGIN_ID
          ) {
            handler(payload.detail ?? undefined, true);
          }
        })
      )
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlistenTauri = fn;
        }
      })
      .catch(() => {});
  }

  return () => {
    disposed = true;
    window.removeEventListener(eventName, localListener);
    if (unlistenTauri) unlistenTauri();
  };
}
