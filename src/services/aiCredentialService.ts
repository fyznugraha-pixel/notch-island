import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import type { AiProviderId } from "../components/ui/aichat/AiChatTypes";

const LEGACY_KEYS_STORAGE = "island_ai_api_keys_v1";
const LEGACY_MODEL_KEYS_STORAGE = "island_ai_model_keys_v1";
const LEGACY_DRAFT_PREFIX = "island_ai_draft_key_";
const LEGACY_SEC_FALLBACK_PREFIX = "_sec_k_";
const AI_PROVIDERS: AiProviderId[] = [
  "claude",
  "openai",
  "gemini",
  "openrouter",
  "deepseek",
  "grok",
  "custom",
];

// Memory caches keep keys fast synchronously without keeping plaintext copies on disk.
const credentialCache = new Map<string, string>();
const modelKeyCache = new Map<string, string>();
const dirtyProviders = new Set<string>();
const dirtyModels = new Set<string>();

let initPromise: Promise<void> | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);
}

export async function saveSecureApiKey(provider: AiProviderId, key: string): Promise<void> {
  const clean = key.trim();
  dirtyProviders.add(provider);

  if (!clean) {
    credentialCache.delete(provider);
  } else {
    credentialCache.set(provider, clean);
  }

  localStorage.removeItem(`${LEGACY_SEC_FALLBACK_PREFIX}${provider}`);

  try {
    await invoke("save_secure_ai_key", { provider, key: clean });
  } catch (err) {
    console.warn("Native credential save error:", err);
  }

  cleanLegacyKeyStorage(provider);
}

export async function getSecureApiKey(provider: AiProviderId): Promise<string> {
  const cached = credentialCache.get(provider);
  if (cached) return cached;

  try {
    const key = await invoke<string>("get_secure_ai_key", { provider });
    const clean = (key || "").trim();
    if (clean && !dirtyProviders.has(provider)) {
      credentialCache.set(provider, clean);
      return clean;
    }
    if (clean) return clean;
  } catch {
    // Tauri backend unavailable outside desktop shell
  }

  return "";
}

export function getEffectiveApiKeySync(provider: AiProviderId): string {
  return credentialCache.get(provider) || "";
}

export async function saveSecureModelKey(modelId: string, key: string): Promise<void> {
  const cleanId = modelId.trim();
  if (!cleanId) return;
  const clean = key.trim();
  dirtyModels.add(cleanId);

  if (!clean) {
    modelKeyCache.delete(cleanId);
  } else {
    modelKeyCache.set(cleanId, clean);
  }

  try {
    await invoke("save_secure_ai_model_key", { modelId: cleanId, key: clean });
  } catch (err) {
    console.warn("Native model credential save error:", err);
  }
}

export async function deleteSecureModelKey(modelId: string): Promise<void> {
  const cleanId = modelId.trim();
  if (!cleanId) return;
  dirtyModels.add(cleanId);
  modelKeyCache.delete(cleanId);

  try {
    await invoke("delete_secure_ai_model_key", { modelId: cleanId });
  } catch {}
}

export function getSecureModelKeySync(modelId: string): string {
  return modelKeyCache.get(modelId.trim()) || "";
}

export function getAllSecureModelKeysSync(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [modelId, key] of modelKeyCache.entries()) {
    if (key) out[modelId] = key;
  }
  return out;
}

export function initCredentials(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await migrateLegacyPlaintextKeys();

    for (const prov of AI_PROVIDERS) {
      if (dirtyProviders.has(prov)) continue;
      const key = await getSecureApiKey(prov);
      if (key && !dirtyProviders.has(prov)) {
        credentialCache.set(prov, key);
      }
    }

    try {
      const modelKeys = await invoke<Record<string, string>>("get_all_secure_ai_model_keys");
      if (modelKeys && typeof modelKeys === "object") {
        for (const [modelId, rawKey] of Object.entries(modelKeys)) {
          const clean = (rawKey || "").trim();
          if (clean && !dirtyModels.has(modelId)) {
            modelKeyCache.set(modelId, clean);
          }
        }
      }
    } catch {
      // Non-Tauri environment
    }
  })().catch((err) => {
    initPromise = null;
    throw err;
  });

  return initPromise;
}

export async function deleteSecureApiKey(provider: AiProviderId): Promise<void> {
  dirtyProviders.add(provider);
  credentialCache.delete(provider);
  try {
    await invoke("delete_secure_ai_key", { provider });
  } catch {}
  localStorage.removeItem(`${LEGACY_SEC_FALLBACK_PREFIX}${provider}`);
  cleanLegacyKeyStorage(provider);
}

function cleanLegacyKeyStorage(provider: AiProviderId): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEYS_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed[provider]) {
        delete parsed[provider];
        localStorage.setItem(LEGACY_KEYS_STORAGE, JSON.stringify(parsed));
      }
    }
    localStorage.removeItem(`${LEGACY_DRAFT_PREFIX}${provider}`);

    load("settings.json", { autoSave: true })
      .then(async (s) => {
        const storedRaw = await s.get("ai_provider_keys");
        const stored = (storedRaw || {}) as Record<string, string>;
        if (stored[provider]) {
          delete stored[provider];
          await s.set("ai_provider_keys", stored);
          return s.save();
        }
      })
      .catch(() => {});
  } catch {}
}

function sweepPlaintextSecFallbacks(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LEGACY_SEC_FALLBACK_PREFIX)) {
      keysToRemove.push(k);
    }
  }
  for (const k of keysToRemove) {
    localStorage.removeItem(k);
  }
}

export async function migrateLegacyPlaintextKeys(): Promise<number> {
  let migratedCount = 0;
  const nativeReady = isTauriRuntime();

  try {
    const rawProviders = localStorage.getItem(LEGACY_KEYS_STORAGE);
    if (rawProviders) {
      const parsed = JSON.parse(rawProviders);
      if (parsed && typeof parsed === "object") {
        for (const prov of AI_PROVIDERS) {
          const legacyKey = parsed[prov];
          if (typeof legacyKey === "string" && legacyKey.trim()) {
            await saveSecureApiKey(prov, legacyKey.trim());
            migratedCount++;
          }
        }
      }
      if (nativeReady) {
        localStorage.removeItem(LEGACY_KEYS_STORAGE);
      }
    }

    // Migrate old _sec_k_<provider> entries into Credential Manager before removing them.
    for (const prov of AI_PROVIDERS) {
      const fallbackKey = (localStorage.getItem(`${LEGACY_SEC_FALLBACK_PREFIX}${prov}`) || "").trim();
      if (fallbackKey) {
        const existingNative = nativeReady
          ? await invoke<string>("get_secure_ai_key", { provider: prov }).catch(() => "")
          : "";
        if (!existingNative.trim() && !dirtyProviders.has(prov)) {
          await saveSecureApiKey(prov, fallbackKey);
          migratedCount++;
        } else if (!dirtyProviders.has(prov)) {
          credentialCache.set(prov, existingNative.trim() || fallbackKey);
        }
      }
    }
    if (nativeReady) {
      sweepPlaintextSecFallbacks();
    }

    // Migrate per-model keys BEFORE removing LEGACY_MODEL_KEYS_STORAGE.
    const rawModels = localStorage.getItem(LEGACY_MODEL_KEYS_STORAGE);
    if (rawModels) {
      const parsedModels = JSON.parse(rawModels);
      if (parsedModels && typeof parsedModels === "object") {
        for (const [modelId, rawKey] of Object.entries(parsedModels)) {
          if (typeof rawKey === "string" && rawKey.trim() && !dirtyModels.has(modelId)) {
            await saveSecureModelKey(modelId, rawKey.trim());
            migratedCount++;
          }
        }
      }
      if (nativeReady) {
        localStorage.removeItem(LEGACY_MODEL_KEYS_STORAGE);
      }
    }

    if (nativeReady) {
      try {
        const s = await load("settings.json", { autoSave: true });
        const storedProviderKeys = await s.get<Record<string, string>>("ai_provider_keys");
        if (storedProviderKeys && typeof storedProviderKeys === "object") {
          for (const prov of AI_PROVIDERS) {
            const legacyKey = storedProviderKeys[prov];
            if (typeof legacyKey === "string" && legacyKey.trim()) {
              const existingNative = await invoke<string>("get_secure_ai_key", { provider: prov }).catch(() => "");
              if (!existingNative.trim() && !dirtyProviders.has(prov)) {
                await saveSecureApiKey(prov, legacyKey.trim());
                migratedCount++;
              }
            }
          }
        }
        const storedModelKeys = await s.get<Record<string, string>>("ai_model_keys");
        if (storedModelKeys && typeof storedModelKeys === "object") {
          for (const [modelId, legacyKey] of Object.entries(storedModelKeys)) {
            if (typeof legacyKey === "string" && legacyKey.trim() && !dirtyModels.has(modelId)) {
              await saveSecureModelKey(modelId, legacyKey.trim());
              migratedCount++;
            }
          }
        }
        s.delete("ai_provider_keys");
        s.delete("ai_model_keys");
        await s.save();
      } catch {}
    }
  } catch (err) {
    console.warn("Error during key migration:", err);
  }

  return migratedCount;
}

export function maskApiKey(key: string): string {
  const clean = key.trim();
  if (!clean) return "";
  if (clean.length <= 8) return "••••••••";
  return `••••••••••••${clean.slice(-4)}`;
}
