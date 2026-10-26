export interface CustomSoundRecord {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  size: number;
  data: ArrayBuffer;
  createdAt: number;
}

const DB_NAME = "gili_custom_sounds_db";
const DB_VERSION = 1;
const STORE_NAME = "sounds";

const cachedObjectUrls = new Map<string, string>();

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not available"));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllCustomSounds(): Promise<CustomSoundRecord[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const results = (req.result || []) as CustomSoundRecord[];
        results.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.debug("Failed to retrieve custom sounds:", err);
    return [];
  }
}

export async function saveCustomSound(file: File): Promise<CustomSoundRecord> {
  const arrayBuffer = await file.arrayBuffer();
  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const rawName = file.name.replace(/\.[^/.]+$/, "").trim();
  const cleanName = rawName.slice(0, 32) || "Custom Audio";

  const record: CustomSoundRecord = {
    id,
    name: cleanName,
    fileName: file.name,
    mimeType: file.type || "audio/mpeg",
    size: file.size,
    data: arrayBuffer,
    createdAt: Date.now(),
  };

  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  const blob = new Blob([arrayBuffer], { type: record.mimeType });
  const objectUrl = URL.createObjectURL(blob);
  cachedObjectUrls.set(id, objectUrl);

  return record;
}

export async function deleteCustomSound(id: string): Promise<void> {
  const existingUrl = cachedObjectUrls.get(id);
  if (existingUrl) {
    URL.revokeObjectURL(existingUrl);
    cachedObjectUrls.delete(id);
  }

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.debug("Failed to delete custom sound record:", err);
  }
}

export async function ensureCustomSoundAudioUrl(id: string): Promise<string | null> {
  const cached = cachedObjectUrls.get(id);
  if (cached) return cached;

  try {
    const db = await openDB();
    const record = await new Promise<CustomSoundRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as CustomSoundRecord) || null);
      req.onerror = () => reject(req.error);
    });

    if (!record || !record.data) return null;

    const blob = new Blob([record.data], { type: record.mimeType || "audio/mpeg" });
    const objectUrl = URL.createObjectURL(blob);
    cachedObjectUrls.set(id, objectUrl);
    return objectUrl;
  } catch (err) {
    console.debug("Failed to create audio URL for custom sound:", err);
    return null;
  }
}

export function preloadActiveCustomSound(soundId: string): void {
  if (soundId.startsWith("custom_")) {
    ensureCustomSoundAudioUrl(soundId).catch(() => {});
  }
}
