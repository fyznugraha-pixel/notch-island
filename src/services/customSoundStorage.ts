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
const cachedBuffers = new Map<string, ArrayBuffer>();

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

function getAudioMimeType(fileName: string, mime?: string): string {
  if (mime && mime.startsWith("audio/")) return mime;
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    default:
      return "audio/mpeg";
  }
}

export async function saveCustomSoundFromBuffer(
  fileName: string,
  arrayBuffer: ArrayBuffer,
  mimeType?: string
): Promise<CustomSoundRecord> {
  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const rawName = fileName.replace(/\.[^/.]+$/, "").trim();
  const cleanName = rawName.slice(0, 32) || "Custom Audio";
  const resolvedMime = getAudioMimeType(fileName, mimeType);

  const record: CustomSoundRecord = {
    id,
    name: cleanName,
    fileName,
    mimeType: resolvedMime,
    size: arrayBuffer.byteLength,
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

  const blob = new Blob([arrayBuffer], { type: resolvedMime });
  const objectUrl = URL.createObjectURL(blob);
  cachedObjectUrls.set(id, objectUrl);
  cachedBuffers.set(id, arrayBuffer.slice(0));

  return record;
}

export async function saveCustomSound(file: File): Promise<CustomSoundRecord> {
  const arrayBuffer = await file.arrayBuffer();
  return saveCustomSoundFromBuffer(file.name, arrayBuffer, file.type);
}

export async function deleteCustomSound(id: string): Promise<void> {
  cachedBuffers.delete(id);
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

async function getCustomSoundRecord(id: string): Promise<CustomSoundRecord | null> {
  const db = await openDB();
  return new Promise<CustomSoundRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve((req.result as CustomSoundRecord) || null);
    req.onerror = () => reject(req.error);
  });
}

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return Uint8Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)).buffer;
}

export async function getCustomSoundBuffer(id: string): Promise<ArrayBuffer | null> {
  const cached = cachedBuffers.get(id);
  if (cached) return cached.slice(0);

  try {
    const record = await getCustomSoundRecord(id);
    if (!record || !record.data) return null;
    const raw = toArrayBuffer(record.data);
    cachedBuffers.set(id, raw.slice(0));
    return raw.slice(0);
  } catch (err) {
    console.debug("Failed to read custom sound buffer:", err);
    return null;
  }
}

export async function ensureCustomSoundAudioUrl(id: string): Promise<string | null> {
  const cached = cachedObjectUrls.get(id);
  if (cached) return cached;

  try {
    const record = await getCustomSoundRecord(id);
    if (!record || !record.data) return null;

    const raw = toArrayBuffer(record.data);
    cachedBuffers.set(id, raw.slice(0));
    const mime = getAudioMimeType(record.fileName || "", record.mimeType);
    const blob = new Blob([raw], { type: mime });
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
    getCustomSoundBuffer(soundId).catch(() => {});
  }
}
