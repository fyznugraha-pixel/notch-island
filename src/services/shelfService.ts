import { load, Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { StashedFile } from "../components/ui/DropShelfPanel";

const STORAGE_KEY = "island_drop_shelf";
const STORE_FILENAME = "shelf.json";

let storeInstance: Store | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export interface FilePreview {
  sizeFormatted: string;
  thumbnail?: string;
}

// In-memory cache for previews (thumbnails & formatted sizes) so they survive tab switches without re-fetching
const previewCache = new Map<string, FilePreview>();
const inFlightRequests = new Set<string>();

export function getCachedPreview(id: string): FilePreview | undefined {
  return previewCache.get(id);
}

export function clearShelfPreviewCache(): void {
  previewCache.clear();
  inFlightRequests.clear();
  pendingQueue = [];
}

type BatchCallback = (updates: Record<string, FilePreview>) => void;

let pendingQueue: StashedFile[] = [];
let activeWorkers = 0;
const MAX_CONCURRENT_PREVIEWS = 3;
const subscribers = new Set<BatchCallback>();
let pendingBatch: Record<string, FilePreview> = {};
let batchFlushTimer: ReturnType<typeof setTimeout> | null = null;

function flushBatch() {
  if (batchFlushTimer) {
    clearTimeout(batchFlushTimer);
    batchFlushTimer = null;
  }
  if (Object.keys(pendingBatch).length === 0) return;
  const batchToEmit = { ...pendingBatch };
  pendingBatch = {};
  subscribers.forEach((cb) => {
    try {
      cb(batchToEmit);
    } catch (e) {
      console.error("Error in shelf preview batch subscriber:", e);
    }
  });
}

function scheduleFlush() {
  if (!batchFlushTimer) {
    batchFlushTimer = setTimeout(() => {
      batchFlushTimer = null;
      flushBatch();
    }, 120);
  }
}

function processQueue() {
  while (pendingQueue.length > 0 && activeWorkers < MAX_CONCURRENT_PREVIEWS) {
    const file = pendingQueue.shift();
    if (!file) break;

    if (previewCache.has(file.id)) {
      continue;
    }

    activeWorkers++;
    inFlightRequests.add(file.id);

    invoke<{ size_formatted: string; thumbnail?: string }>("get_file_preview", { path: file.path })
      .then((res) => {
        const preview: FilePreview = {
          sizeFormatted: res?.size_formatted || "--",
          thumbnail: res?.thumbnail || undefined,
        };
        previewCache.set(file.id, preview);
        pendingBatch[file.id] = preview;
        scheduleFlush();
      })
      .catch(() => {
        const fallback: FilePreview = {
          sizeFormatted: file.sizeFormatted || "--",
        };
        previewCache.set(file.id, fallback);
        pendingBatch[file.id] = fallback;
        scheduleFlush();
      })
      .finally(() => {
        inFlightRequests.delete(file.id);
        activeWorkers--;
        if (pendingQueue.length === 0 && activeWorkers === 0) {
          flushBatch();
        } else {
          processQueue();
        }
      });
  }
}

export function queueFilePreviews(
  files: StashedFile[],
  onBatchUpdate?: BatchCallback
): () => void {
  if (onBatchUpdate) {
    subscribers.add(onBatchUpdate);
  }

  // Pre-seed cache with any files that already have sizeFormatted or thumbnail
  for (const f of files) {
    if (f.thumbnail || f.sizeFormatted) {
      if (!previewCache.has(f.id)) {
        previewCache.set(f.id, {
          sizeFormatted: f.sizeFormatted || "--",
          thumbnail: f.thumbnail,
        });
      }
    }
  }

  const isImageExt = (ext: string) =>
    ["png", "jpg", "jpeg", "webp", "gif", "bmp", "ico", "svg"].includes(
      ext.toLowerCase().replace(/^\./, "")
    );

  const needed = files.filter((f) => {
    if (inFlightRequests.has(f.id)) return false;
    const cached = previewCache.get(f.id);
    if (!cached) return true;
    if (isImageExt(f.ext) && !cached.thumbnail) return true;
    return false;
  });

  if (needed.length > 0) {
    for (const item of needed) {
      if (!pendingQueue.some((q) => q.id === item.id)) {
        pendingQueue.push(item);
      }
    }
    processQueue();
  }

  return () => {
    if (onBatchUpdate) {
      subscribers.delete(onBatchUpdate);
    }
  };
}

let storeInitPromise: Promise<Store | null> | null = null;

async function getShelfStore(): Promise<Store | null> {
  // Deduplicate concurrent initialization: two parallel callers must share ONE
  // load() promise, otherwise two Store instances write shelf.json interleaved.
  if (!storeInstance && !storeInitPromise) {
    storeInitPromise = load(STORE_FILENAME, { autoSave: true })
      .then((s) => {
        storeInstance = s;
        return s;
      })
      .catch((err) => {
        console.error("Failed to load shelf store file:", err);
        return null;
      })
      .finally(() => {
        storeInitPromise = null;
      });
  }
  if (storeInstance) return storeInstance;
  return storeInitPromise;
}

export function getInitialShelfFiles(): StashedFile[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : []
  } catch {
    return [];
  }
}

/** Timestamp (ms) of the most recent persistShelfFiles call — used to detect
 *  whether a slow async load was superseded by a fresher user action. */
let lastPersistAt = 0;

export async function loadPersistedShelfFiles(): Promise<StashedFile[]> {
  const startedAt = lastPersistAt;
  try {
    const store = await getShelfStore();
    let storeData: StashedFile[] | null = null;
    if (store) {
      const saved = await store.get<StashedFile[]>("files");
      if (Array.isArray(saved)) storeData = saved;
    }

    let localData: StashedFile[] | null = null;
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed)) localData = parsed;
    }

    // Prefer whichever side is NON-EMPTY. If both have content, pick the one with
    // the newest item timestamp (localStorage is written synchronously on every
    // persist; the store can lag behind by up to its 300ms debounce).
    const newest = (arr: StashedFile[] | null) =>
      arr && arr.length > 0 ? Math.max(...arr.map((f) => f.addedAt || 0)) : -1;
    const storeNewest = newest(storeData);
    const localNewest = newest(localData);

    let result: StashedFile[] = [];
    if (storeNewest >= 0 && storeNewest >= localNewest) {
      result = storeData!;
    } else if (localNewest >= 0) {
      result = localData!;
      if (store) {
        const clean = localData!.map(({ thumbnail, ...rest }: StashedFile) => rest);
        await store.set("files", clean);
        await store.save();
      }
    }

    // If a persist happened while we were awaiting storage, that in-memory
    // result is newer than anything just read from disk — signal the caller.
    if (lastPersistAt !== startedAt) {
      return result;
    }
    return result;
  } catch (err) {
    console.error("Failed to load persisted shelf files:", err);
  }
  return [];
}

export async function persistShelfFiles(files: StashedFile[], immediate = false): Promise<void> {
  lastPersistAt = Date.now();
  const cleanFiles = files.map(({ thumbnail, ...rest }) => rest);

  try {
    if (cleanFiles.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanFiles));
    }
  } catch (err) {
    console.warn("localStorage sync warning:", err);
  }

  const flushToDisk = async () => {
    try {
      const store = await getShelfStore();
      if (store) {
        await store.set("files", cleanFiles);
        await store.save();
      }
    } catch (err) {
      console.error("Failed to save shelf store to disk:", err);
    }
  };

  if (immediate) {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    await flushToDisk();
  } else {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(flushToDisk, 300);
  }
}
