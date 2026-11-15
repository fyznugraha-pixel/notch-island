import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const TASKBAR_PRO_PRODUCT_ID = "gili_taskbar_pro";

export interface TaskbarProStatus {
  isPackagedMsix: boolean;
  hasPro: boolean;
  isLocked: boolean;
  source: "nsis_free" | "ms_store_active" | "ms_store_locked" | string;
  offerToken: string;
  storeId: string | null;
  productTitle: string | null;
  formattedPrice: string | null;
  checking: boolean;
  lastError: string | null;
}

export interface TaskbarProPurchaseOutcome {
  status: "succeeded" | "already_purchased" | "cancelled" | "not_required" | "error" | string;
  message: string;
  licenseStatus: TaskbarProStatus;
}

export const DEFAULT_TASKBAR_PRO_STATUS: TaskbarProStatus = {
  isPackagedMsix: false,
  hasPro: false,
  isLocked: false,
  source: "checking",
  offerToken: TASKBAR_PRO_PRODUCT_ID,
  storeId: null,
  productTitle: null,
  formattedPrice: null,
  checking: true,
  lastError: null,
};

const SYNC_CHANNEL_NAME = "gili_taskbar_pro_sync_channel";
let syncChannel: BroadcastChannel | null = null;

function getSyncChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!syncChannel) {
    try {
      syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    } catch {}
  }
  return syncChannel;
}

function broadcastLocal(status: TaskbarProStatus): void {
  try {
    getSyncChannel()?.postMessage(status);
  } catch {}
}

export async function getTaskbarProStatus(): Promise<TaskbarProStatus> {
  try {
    return await invoke<TaskbarProStatus>("get_taskbar_pro_status");
  } catch {
    return {
      ...DEFAULT_TASKBAR_PRO_STATUS,
      hasPro: true,
      isLocked: false,
      checking: false,
      source: "fallback",
    };
  }
}

export async function refreshTaskbarProLicense(): Promise<TaskbarProStatus> {
  const status = await invoke<TaskbarProStatus>("refresh_taskbar_pro_license");
  broadcastLocal(status);
  return status;
}

export async function purchaseTaskbarPro(): Promise<TaskbarProPurchaseOutcome> {
  const outcome = await invoke<TaskbarProPurchaseOutcome>("purchase_taskbar_pro");
  if (outcome?.licenseStatus) {
    broadcastLocal(outcome.licenseStatus);
  }
  return outcome;
}

export function subscribeTaskbarProStatus(
  onStatusChange: (status: TaskbarProStatus) => void
): () => void {
  let active = true;
  const unlistenFns: (() => void)[] = [];

  const ch = getSyncChannel();
  if (ch) {
    const handler = (event: MessageEvent<TaskbarProStatus>) => {
      if (active && event.data && typeof event.data === "object") {
        onStatusChange(event.data);
      }
    };
    ch.addEventListener("message", handler);
    unlistenFns.push(() => ch.removeEventListener("message", handler));
  }

  const promiseUnlisten = listen<TaskbarProStatus>(
    "taskbar-pro-status-changed",
    (event) => {
      if (active && event.payload) {
        onStatusChange(event.payload);
      }
    }
  );
  promiseUnlisten
    .then((fn) => {
      if (active) {
        unlistenFns.push(fn);
      } else {
        fn();
      }
    })
    .catch(() => {});

  return () => {
    active = false;
    unlistenFns.forEach((fn) => fn());
  };
}
