import { check, Update } from "@tauri-apps/plugin-updater";

export interface UpdateInfo {
  available: boolean;
  version?: string;
  currentVersion?: string;
  notes?: string;
  update?: Update;
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
