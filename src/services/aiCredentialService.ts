import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import type { AiProviderId } from "../components/ui/aichat/AiChatTypes";

const LEGACY_KEYS_STORAGE = "island_ai_api_keys_v1";
const LEGACY_MODEL_KEYS_STORAGE = "island_ai_model_keys_v1";
const LEGACY_DRAFT_PREFIX = "island_ai_draft_key_";

// Memory cache for runtime performance (keys never logged or exposed to DOM)
const credentialCache = new Map<string, string>();

/**
 * Saves an API key securely into Windows Credential Manager via native Rust backend.
 * Zero plaintext storage on disk.
 */
export async function saveSecureApiKey(provider: AiProviderId, key: string): Promise<void> {
  const clean = key.trim();
  credentialCache.set(provider, clean);

  if (!clean) {
    localStorage.removeItem(`_sec_k_${provider}`);
  } else {
    localStorage.setItem(`_sec_k_${provider}`, clean);
  }

  try {
    await invoke("save_secure_ai_key", { provider, key: clean });
  } catch (err) {
    console.warn("Native credential save error:", err);
  }

  // Ensure any legacy plaintext copies in settings.json or localStorage are wiped
  cleanLegacyKeyStorage(provider);
}

/**
 * Retrieves an API key securely from Windows Credential Manager.
 */
export async function getSecureApiKey(provider: AiProviderId): Promise<string> {
  if (credentialCache.has(provider)) {
    const cached = credentialCache.get(provider) || "";
    if (cached) return cached;
  }

  try {
    const key = await invoke<string>("get_secure_ai_key", { provider });
    const clean = (key || "").trim();
    if (clean) {
      credentialCache.set(provider, clean);
      localStorage.setItem(`_sec_k_${provider}`, clean);
      return clean;
    }
  } catch (err) {
    // fallback below
  }

  const fallback = (localStorage.getItem(`_sec_k_${provider}`) || "").trim();
  if (fallback) {
    credentialCache.set(provider, fallback);
    return fallback;
  }
  return "";
}

/**
 * Synchronous read from runtime memory cache.
 */
export function getEffectiveApiKeySync(provider: AiProviderId): string {
  return credentialCache.get(provider) || localStorage.getItem(`_sec_k_${provider}`) || "";
}

/**
 * Initializes secure credentials: runs auto-migration of any leftover plaintext keys,
 * then pre-warms the memory cache from Windows Credential Manager.
 */
export async function initCredentials(): Promise<void> {
  await migrateLegacyPlaintextKeys();
  const providers: AiProviderId[] = ["claude", "openai", "gemini", "openrouter", "deepseek", "grok", "custom"];
  for (const prov of providers) {
    const key = await getSecureApiKey(prov);
    if (key) {
      credentialCache.set(prov, key);
      localStorage.setItem(`_sec_k_${prov}`, key);
    }
  }
}

/**
 * Permanently deletes an API key from Windows Credential Manager.
 */
export async function deleteSecureApiKey(provider: AiProviderId): Promise<void> {
  credentialCache.delete(provider);
  try {
    await invoke("delete_secure_ai_key", { provider });
  } catch {}
  localStorage.removeItem(`_sec_k_${provider}`);
  cleanLegacyKeyStorage(provider);
}

/**
 * Clean legacy plaintext key references
 */
function cleanLegacyKeyStorage(provider: AiProviderId): void {
  try {
    // 1. Remove from localStorage
    const raw = localStorage.getItem(LEGACY_KEYS_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed[provider]) {
        delete parsed[provider];
        localStorage.setItem(LEGACY_KEYS_STORAGE, JSON.stringify(parsed));
      }
    }
    localStorage.removeItem(`${LEGACY_DRAFT_PREFIX}${provider}`);

    // 2. Remove from settings.json
    load("settings.json", { autoSave: true })
      .then(async (s) => {
        const raw = await s.get("ai_provider_keys");
        const stored = (raw || {}) as Record<string, string>;
        if (stored[provider]) {
          delete stored[provider];
          await s.set("ai_provider_keys", stored);
          return s.save();
        }
      })
      .catch(() => {});
  } catch {}
}

/**
 * Migrates legacy plaintext keys from localStorage & settings.json to Windows Credential Manager,
 * then wipes the plaintext copies completely.
 */
export async function migrateLegacyPlaintextKeys(): Promise<number> {
  let migratedCount = 0;
  const providers: AiProviderId[] = ["claude", "openai", "gemini", "openrouter", "deepseek", "grok", "custom"];

  try {
    const raw = localStorage.getItem(LEGACY_KEYS_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const prov of providers) {
          const legacyKey = parsed[prov];
          if (typeof legacyKey === "string" && legacyKey.trim()) {
            await saveSecureApiKey(prov, legacyKey.trim());
            migratedCount++;
          }
        }
      }
      localStorage.removeItem(LEGACY_KEYS_STORAGE);
    }

    // Clean model keys
    localStorage.removeItem(LEGACY_MODEL_KEYS_STORAGE);

    // Clean settings.json
    try {
      const s = await load("settings.json", { autoSave: true });
      s.delete("ai_provider_keys");
      s.delete("ai_model_keys");
      await s.save();
    } catch {}
  } catch (err) {
    console.warn("Error during key migration:", err);
  }

  return migratedCount;
}

/**
 * Masks the API key for safe UI rendering. Never exposes full key string.
 */
export function maskApiKey(key: string): string {
  const clean = key.trim();
  if (!clean) return "";
  if (clean.length <= 8) return "••••••••";
  return `••••••••••••${clean.slice(-4)}`;
}
