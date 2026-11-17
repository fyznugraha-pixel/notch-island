import { AI_MODELS } from "./aiChatService";
import { aiFetch } from "./aiHttp";
import type { AiProviderId, AiModelConfig } from "../components/ui/aichat/AiChatTypes";

// v1 stored a hardcoded fallback list even for unverified keys; v2 holds only verified models.
const REGISTERED_MODELS_STORAGE = "island_ai_registered_models_v2";
const CUSTOM_MODELS_STORAGE = "island_ai_custom_models_v1";
const UNAVAILABLE_MODELS_STORAGE = "island_ai_unavailable_models_v1";
const ACTIVE_MODEL_STORAGE = "island_ai_active_model_v1";

export type ModelVerifyResult =
  | { ok: true; models: AiModelConfig[] }
  | { ok: false; reason: string };

interface RemoteModel {
  id: string;
  displayName?: string;
  description?: string;
  inputCostPer1M?: number;
  outputCostPer1M?: number;
}

let unavailableCache: Set<string> | null = null;

function normalizeModelId(id: string): string {
  return id.trim().replace(/^models\//i, "");
}

function unavailableEntryKey(provider: AiProviderId, modelId: string): string {
  return `${provider}:${normalizeModelId(modelId).toLowerCase()}`;
}

function getUnavailableSet(): Set<string> {
  if (unavailableCache) return unavailableCache;
  const loaded = new Set<string>();
  try {
    const raw = localStorage.getItem(UNAVAILABLE_MODELS_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === "string" && item) loaded.add(item);
        }
      }
    }
  } catch {}
  unavailableCache = loaded;
  return unavailableCache;
}

function persistUnavailableSet(set: Set<string>): void {
  try {
    localStorage.setItem(UNAVAILABLE_MODELS_STORAGE, JSON.stringify([...set]));
  } catch {}
}

export function markModelUnavailable(provider: AiProviderId, modelId: string): void {
  const clean = normalizeModelId(modelId);
  if (!clean) return;
  const set = getUnavailableSet();
  const key = unavailableEntryKey(provider, clean);
  if (!set.has(key)) {
    set.add(key);
    persistUnavailableSet(set);
  }
}

export function isModelUnavailable(provider: AiProviderId, modelId: string): boolean {
  const clean = normalizeModelId(modelId);
  if (!clean) return false;
  return getUnavailableSet().has(unavailableEntryKey(provider, clean));
}

export function clearModelUnavailable(provider: AiProviderId, modelId?: string): void {
  const set = getUnavailableSet();
  if (modelId) {
    if (set.delete(unavailableEntryKey(provider, modelId))) {
      persistUnavailableSet(set);
    }
    return;
  }
  const prefix = `${provider}:`;
  let changed = false;
  for (const key of [...set]) {
    if (key.startsWith(prefix)) {
      set.delete(key);
      changed = true;
    }
  }
  if (changed) persistUnavailableSet(set);
}

function parseModelVersionScore(id: string): number {
  const lower = normalizeModelId(id).toLowerCase();
  const geminiMatch = lower.match(/gemini-(\d+)(?:\.(\d+))?/);
  if (geminiMatch) {
    return Number(geminiMatch[1]) * 100 + Number(geminiMatch[2] || 0);
  }
  const claudeRoleMatch = lower.match(/claude-(?:sonnet|opus|haiku)-(\d+)(?:-(\d+))?/);
  if (claudeRoleMatch) {
    const minor = claudeRoleMatch[2] && claudeRoleMatch[2].length <= 2 ? Number(claudeRoleMatch[2]) : 0;
    return Number(claudeRoleMatch[1]) * 100 + minor;
  }
  const claudeVerMatch = lower.match(/claude-(\d+)(?:[.-](\d+))?/);
  if (claudeVerMatch) {
    const minor = claudeVerMatch[2] && claudeVerMatch[2].length <= 2 ? Number(claudeVerMatch[2]) : 0;
    return Number(claudeVerMatch[1]) * 100 + minor;
  }
  const gptMatch = lower.match(/gpt-(\d+)(?:\.(\d+))?(o)?/);
  if (gptMatch) {
    const base = Number(gptMatch[1]) * 100 + Number(gptMatch[2] || 0);
    return gptMatch[3] ? base + 0.5 : base;
  }
  const oMatch = lower.match(/(?:^|\/)o(\d+)(?:-|$)/);
  if (oMatch) {
    return Number(oMatch[1]) * 100;
  }
  const grokMatch = lower.match(/grok-(\d+)(?:\.(\d+))?/);
  if (grokMatch) {
    return Number(grokMatch[1]) * 100 + Number(grokMatch[2] || 0);
  }
  if (lower.includes("deepseek-r1") || lower.includes("deepseek-reasoner")) return 310;
  if (lower.includes("deepseek-v3") || lower.includes("deepseek-chat")) return 300;
  if (lower.includes("flash-latest") || lower.includes("pro-latest")) return 190;
  return 0;
}

function getModelStabilityScore(id: string): number {
  const lower = id.toLowerCase();
  if (/(?:^|[-_])(exp|experimental)(?:$|[-_])/.test(lower)) return 1;
  if (/preview/.test(lower)) return 2;
  if (/-\d{3,4}(?:-\d{2})?$|-latest$/.test(lower)) return 3;
  return 4;
}

export function isSpecializedNonChatModel(id: string): boolean {
  return /(tts|native-audio|image-generation|embedding|robotics|aqa|realtime|transcribe)/i.test(id);
}

function getVariantOrderRank(id: string): number {
  const lower = id.toLowerCase();
  if (lower.includes("flash-lite") || lower.includes("flash-8b") || lower.includes("nano")) return 1;
  if (lower.includes("flash")) return 4;
  if (lower.includes("pro")) return 3;
  if (lower.includes("ultra")) return 2;
  return 2;
}

export function compareModelsNewestFirst(a: { id: string }, b: { id: string }): number {
  const specDiff = Number(isSpecializedNonChatModel(a.id)) - Number(isSpecializedNonChatModel(b.id));
  if (specDiff !== 0) return specDiff;

  const verDiff = parseModelVersionScore(b.id) - parseModelVersionScore(a.id);
  if (verDiff !== 0) return verDiff;

  const stabDiff = getModelStabilityScore(b.id) - getModelStabilityScore(a.id);
  if (stabDiff !== 0) return stabDiff;

  const roleDiff = getVariantOrderRank(b.id) - getVariantOrderRank(a.id);
  if (roleDiff !== 0) return roleDiff;

  return a.id.length - b.id.length || a.id.localeCompare(b.id);
}

function getAllCustomModelsMap(): Record<string, AiModelConfig[]> {
  try {
    const raw = localStorage.getItem(CUSTOM_MODELS_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {}
  return {};
}

function getSavedCustomModels(provider: AiProviderId): AiModelConfig[] {
  const map = getAllCustomModelsMap();
  const list = map[provider];
  return Array.isArray(list) ? list : [];
}

function saveCustomModels(provider: AiProviderId, models: AiModelConfig[]): void {
  try {
    const map = getAllCustomModelsMap();
    map[provider] = models;
    localStorage.setItem(CUSTOM_MODELS_STORAGE, JSON.stringify(map));
  } catch {}
}

function storageKey(provider: AiProviderId): string {
  return `${REGISTERED_MODELS_STORAGE}_${provider}`;
}

export function getRegisteredModels(provider: AiProviderId): AiModelConfig[] {
  try {
    const raw = localStorage.getItem(storageKey(provider));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function clearRegisteredModels(provider: AiProviderId): void {
  localStorage.removeItem(storageKey(provider));
  clearModelUnavailable(provider);
}

export function registerCustomModel(
  provider: AiProviderId,
  modelId: string,
  displayName?: string
): AiModelConfig {
  const normalizedId = normalizeModelId(modelId);
  if (!normalizedId) {
    throw new Error("Model ID cannot be empty");
  }

  const config = toModelConfig(provider, {
    id: normalizedId,
    displayName: displayName?.trim() || undefined,
  });

  const customModels = getSavedCustomModels(provider).filter(
    (m) => normalizeModelId(m.id).toLowerCase() !== normalizedId.toLowerCase()
  );
  customModels.unshift(config);
  saveCustomModels(provider, customModels);

  clearModelUnavailable(provider, normalizedId);

  const existing = getRegisteredModels(provider).filter(
    (m) => normalizeModelId(m.id).toLowerCase() !== normalizedId.toLowerCase()
  );
  const merged = provider === "gemini" ? [config, ...existing].sort(compareModelsNewestFirst) : [config, ...existing];
  localStorage.setItem(storageKey(provider), JSON.stringify(merged));
  saveActiveModel(provider, config.id);
  return config;
}

// Before any key is verified there is no registered model, so the first catalog entry
// only acts as a placeholder; the UI gates on getRegisteredModels() being non-empty.
export function loadActiveModel(provider: AiProviderId): AiModelConfig {
  const registered = getRegisteredModels(provider);
  const savedId = localStorage.getItem(`${ACTIVE_MODEL_STORAGE}_${provider}`);
  const normalizedSaved = savedId ? normalizeModelId(savedId).toLowerCase() : "";
  const savedMatch = normalizedSaved
    ? registered.find((m) => normalizeModelId(m.id).toLowerCase() === normalizedSaved)
    : undefined;
  const firstHealthy = registered.find(
    (m) => !isModelUnavailable(provider, m.id) && !isSpecializedNonChatModel(m.id)
  );
  return (
    savedMatch ||
    firstHealthy ||
    registered[0] ||
    AI_MODELS.find((m) => m.provider === provider) ||
    AI_MODELS[0]
  );
}

export function saveActiveModel(provider: AiProviderId, modelId: string): void {
  localStorage.setItem(`${ACTIVE_MODEL_STORAGE}_${provider}`, modelId);
}

function guessTier(id: string): AiModelConfig["tier"] {
  const lower = id.toLowerCase();
  if (/(haiku|mini|flash|nano|lite|fast)/.test(lower)) return "Fast";
  if (/(opus|pro|reasoner|o1|o3|o4|ultra)/.test(lower)) return "Max";
  return "Medium";
}

function formatDisplayName(id: string): string {
  const clean = id.replace(/-token$/, "");
  return clean
    .split("-")
    .map((word) => {
      if (/^v\d/i.test(word)) return word.toUpperCase();
      if (/^(ai|gpt|api)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function resolveFallbackPricing(
  id: string,
  tier: AiModelConfig["tier"]
): { inputCostPer1M: number; outputCostPer1M: number } {
  const lower = id.toLowerCase();

  if (lower.includes(":free") || lower === "gili-free") {
    return { inputCostPer1M: 0, outputCostPer1M: 0 };
  }
  // OpenAI families
  if (lower.includes("gpt-4.1-nano") || lower.includes("gpt-4o-mini")) {
    return { inputCostPer1M: 0.15, outputCostPer1M: 0.6 };
  }
  if (lower.includes("gpt-4.1-mini")) {
    return { inputCostPer1M: 0.4, outputCostPer1M: 1.6 };
  }
  if (lower.includes("gpt-4.1")) {
    return { inputCostPer1M: 2.0, outputCostPer1M: 8.0 };
  }
  if (lower.includes("gpt-4o")) {
    return { inputCostPer1M: 2.5, outputCostPer1M: 10.0 };
  }
  if (lower.includes("o3-mini") || lower.includes("o4-mini") || lower.includes("o1-mini")) {
    return { inputCostPer1M: 1.1, outputCostPer1M: 4.4 };
  }
  if (/\b(o1|o3)\b/.test(lower)) {
    return { inputCostPer1M: 10.0, outputCostPer1M: 40.0 };
  }
  // Anthropic Claude families
  if (lower.includes("haiku")) {
    return { inputCostPer1M: 0.8, outputCostPer1M: 4.0 };
  }
  if (lower.includes("sonnet")) {
    return { inputCostPer1M: 3.0, outputCostPer1M: 15.0 };
  }
  if (lower.includes("opus")) {
    return { inputCostPer1M: 15.0, outputCostPer1M: 75.0 };
  }
  // Google Gemini families
  if (lower.includes("flash-lite") || lower.includes("flash-8b")) {
    return { inputCostPer1M: 0.075, outputCostPer1M: 0.3 };
  }
  if (lower.includes("gemini") && lower.includes("flash")) {
    return { inputCostPer1M: 0.15, outputCostPer1M: 0.6 };
  }
  if (lower.includes("gemini") && lower.includes("pro")) {
    return { inputCostPer1M: 1.25, outputCostPer1M: 10.0 };
  }
  // DeepSeek families
  if (lower.includes("deepseek") && (lower.includes("reasoner") || lower.includes("r1"))) {
    return { inputCostPer1M: 0.55, outputCostPer1M: 2.19 };
  }
  if (lower.includes("deepseek")) {
    return { inputCostPer1M: 0.27, outputCostPer1M: 1.1 };
  }
  // xAI Grok families
  if (lower.includes("grok-3-mini")) {
    return { inputCostPer1M: 0.3, outputCostPer1M: 0.5 };
  }
  if (lower.includes("grok")) {
    return { inputCostPer1M: 3.0, outputCostPer1M: 15.0 };
  }
  // Qwen / GLM / Kimi / Mistral / Gemma
  if (lower.includes("qwen") || lower.includes("glm") || lower.includes("kimi") || lower.includes("moonshot")) {
    return tier === "Fast"
      ? { inputCostPer1M: 0.15, outputCostPer1M: 0.6 }
      : { inputCostPer1M: 0.6, outputCostPer1M: 2.4 };
  }
  if (lower.includes("gemma") || lower.includes("ministral") || lower.includes("devstral")) {
    return { inputCostPer1M: 0.15, outputCostPer1M: 0.6 };
  }

  return {
    inputCostPer1M: tier === "Fast" ? 0.25 : tier === "Max" ? 3.0 : 1.0,
    outputCostPer1M: tier === "Fast" ? 1.0 : tier === "Max" ? 15.0 : 4.0,
  };
}

// Known catalog entries keep their pricing; remote pricing overrides when provided by API.
export function toModelConfig(provider: AiProviderId, remote: RemoteModel): AiModelConfig {
  const lowerRemote = remote.id.toLowerCase();
  const normalizedRemoteSegment = (lowerRemote.split("/").pop() || lowerRemote).replace(
    /-(latest|\d{8})$/,
    ""
  );
  const baseRemote = lowerRemote.replace(/-(latest|\d{8})$/, "");
  const hasRemotePricing =
    typeof remote.inputCostPer1M === "number" &&
    Number.isFinite(remote.inputCostPer1M) &&
    typeof remote.outputCostPer1M === "number" &&
    Number.isFinite(remote.outputCostPer1M);

  const candidates = AI_MODELS.filter((m) => provider === "custom" || m.provider === provider);
  const known =
    candidates.find((m) => m.id.toLowerCase() === lowerRemote) ||
    candidates.find((m) => {
      const baseKnown = m.id.toLowerCase().replace(/-(latest|\d{8})$/, "");
      return baseKnown === baseRemote || baseKnown === normalizedRemoteSegment;
    }) ||
    [...candidates]
      .filter((m) => {
        const baseKnown = m.id.toLowerCase().replace(/-(latest|\d{8})$/, "");
        return baseRemote.includes(baseKnown);
      })
      .sort((a, b) => b.id.length - a.id.length)[0] ||
    [...candidates]
      .filter((m) => {
        const baseKnown = m.id.toLowerCase().replace(/-(latest|\d{8})$/, "");
        return baseKnown.startsWith(`${baseRemote}-`);
      })
      .sort((a, b) => a.id.length - b.id.length)[0];
  if (known) {
    return {
      ...known,
      id: remote.id,
      name: remote.displayName || known.name,
      provider,
      inputCostPer1M: hasRemotePricing ? remote.inputCostPer1M! : known.inputCostPer1M,
      outputCostPer1M: hasRemotePricing ? remote.outputCostPer1M! : known.outputCostPer1M,
    };
  }
  const tier = guessTier(remote.id);
  const fallback = resolveFallbackPricing(remote.id, tier);
  return {
    id: remote.id,
    name: remote.displayName || formatDisplayName(remote.id),
    provider,
    description: remote.description || "Tersedia untuk API key ini",
    tier,
    inputCostPer1M: hasRemotePricing ? remote.inputCostPer1M! : fallback.inputCostPer1M,
    outputCostPer1M: hasRemotePricing ? remote.outputCostPer1M! : fallback.outputCostPer1M,
  };
}

export function resolveModelsEndpoint(baseUrl: string): string {
  let clean = baseUrl.trim().replace(/\/+$/, "");
  if (clean.endsWith("/models")) {
    return clean;
  }
  if (clean.endsWith("/chat/completions")) {
    clean = clean.replace(/\/chat\/completions$/, "");
  }
  if (clean.endsWith("/v1") || /\/openai$/i.test(clean)) {
    return `${clean}/models`;
  }
  return `${clean}/v1/models`;
}

async function requestJson(url: string, headers: Record<string, string>): Promise<any> {
  const res = await aiFetch(url, { headers });
  if (res.status === 401 || res.status === 403) {
    let msg = "API key ditolak oleh penyedia";
    try {
      const errBody = await res.json();
      if (errBody?.message) msg = `Penyedia menolak key: ${errBody.message}`;
      else if (errBody?.error?.message) msg = `Penyedia menolak key: ${errBody.error.message}`;
    } catch {}
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (!res.ok) {
    let msg = `Penyedia membalas status ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.message) msg = errBody.message;
      else if (errBody?.error?.message) msg = errBody.error.message;
    } catch {}
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function listClaudeModels(key: string, customBaseUrl?: string): Promise<RemoteModel[]> {
  const baseUrl = customBaseUrl?.trim();

  // If user provided a custom base URL
  if (baseUrl) {
    const modelsUrl = resolveModelsEndpoint(baseUrl);
    const claudeFilter = (id: string) => id.toLowerCase().includes("claude");
    let items = await listOpenAiCompatibleModels(modelsUrl, key, claudeFilter);
    if (items.length === 0) {
      items = await listOpenAiCompatibleModels(modelsUrl, key);
    }
    if (items.length > 0) return items;

    return AI_MODELS.filter((m) => m.provider === "claude").map((m) => ({
      id: m.id,
      displayName: m.name,
      description: m.description,
    }));
  }

  // Official Anthropic API
  try {
    const json = await requestJson("https://api.anthropic.com/v1/models?limit=100", {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    const items = (json.data || []).map((m: { id: string; display_name?: string }) => ({
      id: m.id,
      displayName: m.display_name,
    }));
    if (items.length > 0) return items;
  } catch (err: any) {
    if (err?.message?.includes("menolak key") || err?.message?.includes("ditolak")) throw err;
    // Fallback: verify via messages call if /models is unsupported
    const testRes = await aiFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    if (testRes.status === 401 || testRes.status === 403) {
      throw new Error("API key ditolak oleh penyedia (Anthropic)");
    }
    if (testRes.status === 200 || testRes.status === 400) {
      return AI_MODELS.filter((m) => m.provider === "claude").map((m) => ({
        id: m.id,
        displayName: m.name,
        description: m.description,
      }));
    }
    throw new Error(`Penyedia membalas status ${testRes.status}`);
  }
  return AI_MODELS.filter((m) => m.provider === "claude").map((m) => ({
    id: m.id,
    displayName: m.name,
    description: m.description,
  }));
}

function normalizeGeminiModelsUrl(baseUrl: string): string {
  const clean = baseUrl.trim().replace(/\/+$/, "");
  if (clean.endsWith("/models")) return clean;
  if (clean.endsWith("/v1beta") || clean.endsWith("/v1")) return `${clean}/models`;
  return `${clean}/v1beta/models`;
}

function mergeGeminiBaselineModels(items: RemoteModel[]): RemoteModel[] {
  const seen = new Set<string>();
  const merged: RemoteModel[] = [];

  for (const item of items) {
    const id = normalizeModelId(item.id);
    const key = id.toLowerCase();
    if (!id || seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...item, id });
  }

  for (const m of AI_MODELS) {
    if (m.provider !== "gemini" || !/gemini-3\.(5|8)/i.test(m.id)) continue;
    const id = normalizeModelId(m.id);
    const key = id.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({
        id,
        displayName: m.name,
        description: m.description,
        inputCostPer1M: m.inputCostPer1M,
        outputCostPer1M: m.outputCostPer1M,
      });
    }
  }

  const healthy = merged.filter((m) => !isModelUnavailable("gemini", m.id));
  const finalPool = healthy.length > 0 ? healthy : merged;
  return finalPool.sort(compareModelsNewestFirst);
}

function mapNativeGeminiModels(models: unknown): RemoteModel[] {
  if (!Array.isArray(models)) return [];
  const seen = new Set<string>();
  const mapped: RemoteModel[] = [];

  for (const item of models as Array<{ name?: string; displayName?: string; description?: string; supportedGenerationMethods?: string[] }>) {
    if (!item?.name || !item.name.toLowerCase().includes("gemini")) continue;
    const methods = item.supportedGenerationMethods;
    if (methods && !methods.includes("generateContent") && !methods.includes("streamGenerateContent")) {
      continue;
    }
    const id = normalizeModelId(item.name);
    const key = id.toLowerCase();
    if (!id || seen.has(key)) continue;
    seen.add(key);
    mapped.push({
      id,
      displayName: item.displayName,
      description: item.description,
    });
  }

  return mapped.sort(compareModelsNewestFirst);
}

async function listGeminiModels(key: string, customBaseUrl?: string): Promise<RemoteModel[]> {
  const baseUrl = customBaseUrl?.trim();
  if (baseUrl) {
    const clean = baseUrl.replace(/\/+$/, "");
    const isOpenAiCompat = /\/openai(\/|$)/i.test(clean);
    const isNativeGeminiBase =
      !isOpenAiCompat &&
      (clean.includes("googleapis.com") || /\/v1beta(\/models)?$/i.test(clean));
    if (!isNativeGeminiBase) {
      const modelsUrl = resolveModelsEndpoint(baseUrl);
      const geminiFilter = (id: string) => id.toLowerCase().includes("gemini");
      try {
        let items = await listOpenAiCompatibleModels(modelsUrl, key, geminiFilter);
        if (items.length === 0) {
          items = await listOpenAiCompatibleModels(modelsUrl, key);
        }
        if (items.length > 0) return items.sort(compareModelsNewestFirst);
        if (isOpenAiCompat) return [];
      } catch (err: any) {
        if (isOpenAiCompat || err?.status === 401 || err?.status === 403 || err?.message?.includes("menolak key")) {
          throw err;
        }
      }
    }

    const json = await requestJson(
      `${normalizeGeminiModelsUrl(baseUrl)}?key=${encodeURIComponent(key)}`,
      { "x-goog-api-key": key }
    );
    if (Array.isArray(json?.models)) {
      const native = mapNativeGeminiModels(json.models);
      return isNativeGeminiBase ? mergeGeminiBaselineModels(native) : native;
    }
    if (Array.isArray(json?.data)) {
      const dataModels = json.data
        .filter((m: { id?: string }) => m && typeof m.id === "string")
        .map((m: { id: string; name?: string; description?: string }) => ({
          id: normalizeModelId(m.id),
          displayName: m.name,
          description: m.description,
        }))
        .sort(compareModelsNewestFirst);
      return isNativeGeminiBase ? mergeGeminiBaselineModels(dataModels) : dataModels;
    }
    return isNativeGeminiBase ? mergeGeminiBaselineModels([]) : [];
  }

  const json = await requestJson(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    { "x-goog-api-key": key }
  );
  return mergeGeminiBaselineModels(mapNativeGeminiModels(json?.models));
}

async function listOpenAiCompatibleModels(
  url: string,
  key: string,
  keepId: (id: string) => boolean = () => true
): Promise<RemoteModel[]> {
  let json: any;
  try {
    json = await requestJson(url, { Authorization: `Bearer ${key}` });
  } catch (err: any) {
    if (err?.status === 404 || err?.message?.includes("404")) {
      const altUrl = url.includes("/v1/models")
        ? url.replace("/v1/models", "/models")
        : url.replace("/models", "/v1/models");
      if (altUrl !== url) {
        try {
          json = await requestJson(altUrl, { Authorization: `Bearer ${key}` });
        } catch {
          throw err;
        }
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const data = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  return data
    .filter((m: { id?: string }) => m && typeof m.id === "string" && keepId(m.id))
    .map((m: { id: string; name?: string; description?: string; pricing?: { prompt?: string | number; completion?: string | number } }) => {
      let inputCostPer1M: number | undefined;
      let outputCostPer1M: number | undefined;
      if (m.pricing && m.pricing.prompt !== undefined && m.pricing.completion !== undefined) {
        const promptPerToken = Number(m.pricing.prompt);
        const completionPerToken = Number(m.pricing.completion);
        if (Number.isFinite(promptPerToken) && promptPerToken >= 0 && Number.isFinite(completionPerToken) && completionPerToken >= 0) {
          // OpenRouter & compatible gateways report per-token USD (e.g. "0.000003"), or per-1M if > 0.01
          inputCostPer1M = promptPerToken <= 0.01 ? promptPerToken * 1_000_000 : promptPerToken;
          outputCostPer1M = completionPerToken <= 0.01 ? completionPerToken * 1_000_000 : completionPerToken;
        }
      }
      return {
        id: m.id,
        displayName: m.name,
        description: m.description,
        inputCostPer1M,
        outputCostPer1M,
      };
    });
}

const isOpenAiChatModel = (id: string) =>
  /^(gpt-|o1|o3|o4|chatgpt)/i.test(id) &&
  !/(realtime|audio|transcribe|tts|image|embedding|search)/i.test(id);

async function listRemoteModels(
  provider: AiProviderId,
  key: string,
  customBaseUrl?: string
): Promise<RemoteModel[]> {
  const effectiveBase = customBaseUrl?.trim();

  switch (provider) {
    case "claude":
      return listClaudeModels(key, customBaseUrl);
    case "gemini":
      return listGeminiModels(key, customBaseUrl);
    case "openai": {
      const url = effectiveBase
        ? resolveModelsEndpoint(effectiveBase)
        : "https://api.openai.com/v1/models";
      let models = await listOpenAiCompatibleModels(url, key, isOpenAiChatModel);
      if (models.length === 0 && effectiveBase) {
        models = await listOpenAiCompatibleModels(url, key);
      }
      return models;
    }
    case "deepseek": {
      const url = effectiveBase
        ? resolveModelsEndpoint(effectiveBase)
        : "https://api.deepseek.com/models";
      const deepseekFilter = (id: string) => id.toLowerCase().includes("deepseek");
      let models = await listOpenAiCompatibleModels(url, key, deepseekFilter);
      if (models.length === 0) {
        models = await listOpenAiCompatibleModels(url, key);
      }
      return models;
    }
    case "grok": {
      const url = effectiveBase
        ? resolveModelsEndpoint(effectiveBase)
        : "https://api.x.ai/v1/models";
      const grokFilter = (id: string) => id.toLowerCase().includes("grok");
      let models = await listOpenAiCompatibleModels(url, key, grokFilter);
      if (models.length === 0) {
        models = await listOpenAiCompatibleModels(url, key);
      }
      return models;
    }
    case "openrouter": {
      const url = effectiveBase
        ? resolveModelsEndpoint(effectiveBase)
        : "https://openrouter.ai/api/v1/models";
      return listOpenAiCompatibleModels(url, key);
    }
    case "custom": {
      const url = effectiveBase
        ? resolveModelsEndpoint(effectiveBase)
        : "https://api.openai.com/v1/models";
      // Return ALL models available on this proxy endpoint without brand filtering
      return listOpenAiCompatibleModels(url, key);
    }
  }
}

// Verifies the key against the provider and stores exactly the models it can access.
export async function verifyAndRegisterModels(
  provider: AiProviderId,
  apiKey: string,
  customBaseUrl?: string
): Promise<ModelVerifyResult> {
  const key = apiKey.trim();
  if (!key) return { ok: false, reason: "API key masih kosong" };

  try {
    const customModels = getSavedCustomModels(provider);
    let remote: RemoteModel[] = [];
    try {
      remote = await listRemoteModels(provider, key, customBaseUrl);
    } catch (err: any) {
      const status = err?.status;
      const msg = err instanceof Error ? err.message : String(err || "");
      const isAuthOrBadKey =
        status === 400 ||
        status === 401 ||
        status === 403 ||
        /api key|menolak key|ditolak|invalid|unauthorized|permission/i.test(msg);
      if (isAuthOrBadKey || customModels.length === 0) {
        throw err;
      }
    }

    if (remote.length === 0 && customModels.length === 0) {
      return { ok: false, reason: "Key valid, tapi tidak ada model yang bisa dipakai" };
    }

    const dedup = new Map<string, AiModelConfig>();
    for (const m of remote) {
      const cfg = toModelConfig(provider, m);
      dedup.set(normalizeModelId(cfg.id).toLowerCase(), cfg);
    }
    for (const custom of customModels) {
      const k = normalizeModelId(custom.id).toLowerCase();
      if (!dedup.has(k)) dedup.set(k, custom);
    }

    const models = [...dedup.values()];
    if (provider === "gemini") {
      models.sort(compareModelsNewestFirst);
    }
    localStorage.setItem(storageKey(provider), JSON.stringify(models));
    return { ok: true, models };
  } catch (err) {
    const reason =
      err instanceof TypeError
        ? "Tidak bisa menghubungi penyedia (cek koneksi / proxy)"
        : err instanceof Error
          ? err.message
          : "Gagal memverifikasi key";
    return { ok: false, reason };
  }
}
