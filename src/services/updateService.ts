import { invoke } from "@tauri-apps/api/core";
import { check, Update } from "@tauri-apps/plugin-updater";
import { getTaskbarProStatus } from "./taskbarProService";

export interface UpdateInfo {
  available: boolean;
  storeManaged?: boolean;
  version?: string;
  currentVersion?: string;
  notes?: string;
  update?: Update;
}

export async function isStoreManagedApp(): Promise<boolean> {
  const status = await getTaskbarProStatus();
  return Boolean(status.isPackagedMsix || status.source === "ipc_error");
}

export async function openMicrosoftStoreUpdates(): Promise<void> {
  await invoke("open_microsoft_store_updates");
}

export type UpdateStatus = 
  | "idle"
  | "checking"
  | "available"
  | "up_to_date"
  | "downloading"
  | "installing"
  | "error";

export async function checkForAppUpdate(): Promise<UpdateInfo> {
  if (await isStoreManagedApp()) {
    return { available: false, storeManaged: true };
  }
  try {
    const update = await check();
    if (!update) {
      return { available: false };
    }

    return {
      available: true,
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body,
      update,
    };
  } catch (error: any) {
    const errorMsg = String(error?.message || error || "");
    // If GitHub release endpoint returned 404, no releases have been published yet on GitHub repository
    if (errorMsg.includes("404") || errorMsg.toLowerCase().includes("not found")) {
      return { available: false };
    }
    console.warn("Failed to check for updates:", error);
    throw error;
  }
}

export async function downloadAndInstallAppUpdate(
  update: Update,
  onProgress?: (percent: number) => void
): Promise<void> {
  if (await isStoreManagedApp()) {
    throw new Error("Updates for Microsoft Store builds are managed through Microsoft Store.");
  }
  let totalLength = 0;
  let downloadedBytes = 0;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      totalLength = event.data.contentLength ?? 0;
      onProgress?.(0);
    } else if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
      if (totalLength > 0) {
        const percent = Math.min(100, Math.round((downloadedBytes / totalLength) * 100));
        onProgress?.(percent);
      }
    } else if (event.event === "Finished") {
      onProgress?.(100);
    }
  });
}
