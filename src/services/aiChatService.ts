import { streamAiRequest } from "./aiHttp";
import {
  saveSecureApiKey,
  getEffectiveApiKeySync,
  maskApiKey as maskKeySecure,
} from "./aiCredentialService";
import {
  getLengthSystemInstruction,
  getSafetyMaxTokens,
} from "./aiRouterService";
import { getNotchSystemInstruction } from "./aiNotchTools";
import { getGiliFreeEndpoint, getInstallId } from "./giliFreeService";
import type {
  AiProviderId,
  AiModelConfig,
  AiChatMessage,
  AiUsageStats,
  AiTokenDailyUsage,
  ResponseLengthMode,
} from "../components/ui/aichat/AiChatTypes";

export const AI_MODELS: AiModelConfig[] = [
  // Claude
  {
    id: "claude-3-7-sonnet-20250219",
    name: "Claude Sonnet 3.7",
    provider: "claude",
    description: "Hybrid reasoning, high-speed intelligent coding",
    tier: "Max",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
  },
  {
    id: "claude-3-5-sonnet-latest",
    name: "Claude Sonnet 3.5",
    provider: "claude",
    description: "Daily driver, fast but still smart",
    tier: "Medium",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
  },
  {
    id: "claude-3-5-haiku-latest",
    name: "Claude Haiku 3.5",
    provider: "claude",
    description: "Fastest replies, super hemat",
    tier: "Fast",
    inputCostPer1M: 0.8,
    outputCostPer1M: 4.0,
  },
  {
    id: "claude-3-opus-latest",
    name: "Claude Opus 3",
    provider: "claude",
    description: "Deep analytical thinking and nuance",
    tier: "Max",
    inputCostPer1M: 15.0,
    outputCostPer1M: 75.0,
  },

  // OpenAI
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "Versatile flagship model from OpenAI",
    tier: "Medium",
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Lightweight, ultra-fast and cost efficient",
    tier: "Fast",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  {
    id: "o3-mini",
    name: "OpenAI o3-mini",
    provider: "openai",
    description: "Advanced reasoning for math and code",
    tier: "Max",
    inputCostPer1M: 1.1,
    outputCostPer1M: 4.4,
  },

  // Gemini
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "gemini",
    description: "Next-gen multimodal, near instant speed",
    tier: "Fast",
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "gemini",
    description: "Massive 2M context window for large docs",
    tier: "Max",
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
  },

  // OpenRouter
  {
    id: "openrouter/auto",
    name: "OpenRouter Auto",
    provider: "openrouter",
    description: "Automatically routes to best available model",
    tier: "Medium",
    inputCostPer1M: 1.5,
    outputCostPer1M: 6.0,
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "OpenRouter Claude 3.5",
    provider: "openrouter",
    description: "Claude 3.5 Sonnet served via OpenRouter",
    tier: "Medium",
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
  },

  // DeepSeek
  {
    id: "deepseek-chat",
    name: "DeepSeek V3",
    provider: "deepseek",
    description: "Exceptional intelligence at low cost",
    tier: "Medium",
    inputCostPer1M: 0.27,
    outputCostPer1M: 1.1,
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek R1",
    provider: "deepseek",
    description: "Open reasoning model with chain-of-thought",
    tier: "Max",
    inputCostPer1M: 0.55,
    outputCostPer1M: 2.19,
  },

  // Grok
  {
    id: "grok-2-latest",
    name: "Grok 2",
    provider: "grok",
    description: "Latest reasoning and real-time knowledge from xAI",
    tier: "Medium",
    inputCostPer1M: 2.0,
    outputCostPer1M: 10.0,
  },
];

const KEYS_STORAGE = "island_ai_api_keys_v1";
const MODEL_KEYS_STORAGE = "island_ai_model_keys_v1";
const ACTIVE_PROVIDER_STORAGE = "island_ai_active_provider_v1";
const BASE_URLS_STORAGE = "island_ai_base_urls_v1";
const USAGE_STORAGE = "island_ai_usage_stats_v1";

export function loadSavedBaseUrls(): Record<AiProviderId, string> {
  try {
    const raw = localStorage.getItem(BASE_URLS_STORAGE);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    claude: "",
    openai: "",
    gemini: "",
    openrouter: "",
    deepseek: "",
    grok: "",
    custom: "",
  };
}

export function saveBaseUrl(provider: AiProviderId, url: string): void {
  const map = loadSavedBaseUrls();
  map[provider] = url.trim();
  localStorage.setItem(BASE_URLS_STORAGE, JSON.stringify(map));
}

export function loadSavedApiKeys(): Record<AiProviderId, string> {
  const result: Record<AiProviderId, string> = {
    claude: getEffectiveApiKeySync("claude"),
    openai: getEffectiveApiKeySync("openai"),
    gemini: getEffectiveApiKeySync("gemini"),
    openrouter: getEffectiveApiKeySync("openrouter"),
    deepseek: getEffectiveApiKeySync("deepseek"),
    grok: getEffectiveApiKeySync("grok"),
    custom: getEffectiveApiKeySync("custom"),
  };
  try {
    const raw = localStorage.getItem(KEYS_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const k of Object.keys(result) as AiProviderId[]) {
        if (!result[k] && parsed[k]) {
          result[k] = parsed[k];
        }
      }
    }
  } catch {}
  return result;
}

export function loadSavedModelKeys(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MODEL_KEYS_STORAGE);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveApiKey(provider: AiProviderId, key: string): void {
  saveSecureApiKey(provider, key);
}

export function saveModelKey(modelId: string, key: string): void {
  const modelKeys = loadSavedModelKeys();
  const clean = key.trim();
  if (!clean) {
    delete modelKeys[modelId];
  } else {
    modelKeys[modelId] = clean;
  }
  localStorage.setItem(MODEL_KEYS_STORAGE, JSON.stringify(modelKeys));
}

export function removeModelKey(modelId: string): void {
  saveModelKey(modelId, "");
}

export function getEffectiveApiKey(provider: AiProviderId, modelId?: string): string {
  if (modelId) {
    const modelKeys = loadSavedModelKeys();
    if (modelKeys[modelId]) {
      return modelKeys[modelId];
    }
  }
  const secureKey = getEffectiveApiKeySync(provider);
  if (secureKey) return secureKey;

  const providerKeys = loadSavedApiKeys();
  return providerKeys[provider] || "";
}

export function maskApiKey(key: string): string {
  return maskKeySecure(key);
}

export function loadActiveProvider(): AiProviderId {
  const allProviders: AiProviderId[] = [
    "claude",
    "openai",
    "gemini",
    "openrouter",
    "deepseek",
    "grok",
    "custom",
  ];
  try {
    const saved = localStorage.getItem(ACTIVE_PROVIDER_STORAGE) as AiProviderId;
    if (saved && allProviders.includes(saved)) {
      // If the saved provider actually has verified models or a key, keep it
      const hasModels = localStorage.getItem(`island_ai_registered_models_v2_${saved}`);
      const hasKey = getEffectiveApiKeySync(saved);
      if (hasModels || hasKey) {
        return saved;
      }
    }

    // Check if any other provider already has verified registered models
    for (const prov of allProviders) {
      const reg = localStorage.getItem(`island_ai_registered_models_v2_${prov}`);
      if (reg) {
        try {
          const parsed = JSON.parse(reg);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return prov;
          }
        } catch {}
      }
    }

    if (saved && allProviders.includes(saved)) {
      return saved;
    }
  } catch {}
  return "openai";
}

export function saveActiveProvider(provider: AiProviderId): void {
  localStorage.setItem(ACTIVE_PROVIDER_STORAGE, provider);
}

export function isApiKeyFormatValid(provider: AiProviderId, key: string): boolean {
  const clean = key.trim();
  if (!clean) return false;
  const customBase = loadSavedBaseUrls()[provider]?.trim();
  if (customBase || clean.startsWith("gk-")) return clean.length >= 6;
  switch (provider) {
    case "custom":
      return clean.length >= 6;
    case "claude":
      return clean.startsWith("sk-ant-") && clean.length > 20;
    case "openai":
      return (clean.startsWith("sk-") || clean.startsWith("sk-proj-")) && clean.length > 15;
    case "gemini":
      return clean.startsWith("AIza") && clean.length > 25;
    case "openrouter":
      return clean.startsWith("sk-or-") && clean.length > 20;
    case "deepseek":
      return clean.startsWith("sk-") && clean.length > 15;
    case "grok":
      return clean.startsWith("xai-") && clean.length > 15;
    default:
      return clean.length >= 6;
  }
}

export function createEmptyUsageStats(): AiUsageStats {
  const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const now = new Date();
  const history: AiTokenDailyUsage[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayLabel = dayNames[d.getDay()];
    history.push({
      date: dateStr,
      dayLabel,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  }

  return {
    todayTokens: 0,
    sevenDaysTokens: 0,
    thirtyDaysTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    dailyHistory: history,
    modelBreakdown: {},
    estimatedCostIdr: 0,
    monthlyLimitIdr: 0, // 0 = Tanpa Batas (Default)
  };
}

export function loadUsageStats(): AiUsageStats {
  try {
    const raw = localStorage.getItem(USAGE_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Purge stale dummy test data if detected
      const isLegacyDummy =
        parsed.sevenDaysTokens === 18450 ||
        parsed.thirtyDaysTokens === 48320 ||
        (Array.isArray(parsed.dailyHistory) &&
          parsed.dailyHistory.some((h: any) => h.totalTokens === 2240));

      if (isLegacyDummy) {
        const fresh = createEmptyUsageStats();
        localStorage.setItem(USAGE_STORAGE, JSON.stringify(fresh));
        return fresh;
      }

      // If user had old hardcoded default 50000 without custom choice, reset to 0 (Tanpa Batas)
      const hasCustomized = localStorage.getItem("island_ai_limit_customized_v1");
      if (!hasCustomized && (parsed.monthlyLimitIdr === 50000 || typeof parsed.monthlyLimitIdr !== "number")) {
        parsed.monthlyLimitIdr = 0;
        localStorage.setItem(USAGE_STORAGE, JSON.stringify(parsed));
      }

      return parsed;
    }
  } catch {}

  return createEmptyUsageStats();
}

export function saveMonthlyLimit(limitIdr: number): AiUsageStats {
  const stats = loadUsageStats();
  stats.monthlyLimitIdr = Math.max(0, Math.round(limitIdr));
  localStorage.setItem("island_ai_limit_customized_v1", "true");
  localStorage.setItem(USAGE_STORAGE, JSON.stringify(stats));
  return stats;
}

export function resetUsageStats(): AiUsageStats {
  const fresh = createEmptyUsageStats();
  localStorage.setItem(USAGE_STORAGE, JSON.stringify(fresh));
  return fresh;
}

export function recordTokenUsage(model: AiModelConfig, inputTokens: number, outputTokens: number): void {
  const stats = loadUsageStats();
  const total = inputTokens + outputTokens;
  stats.todayTokens += total;
  stats.sevenDaysTokens += total;
  stats.thirtyDaysTokens += total;
  stats.totalInputTokens += inputTokens;
  stats.totalOutputTokens += outputTokens;

  // Approximate USD to IDR at 16,000
  const costUsd =
    (inputTokens / 1_000_000) * model.inputCostPer1M +
    (outputTokens / 1_000_000) * model.outputCostPer1M;
  stats.estimatedCostIdr += Math.max(1, Math.round(costUsd * 16000));

  const modelKey = model.name;
  stats.modelBreakdown[modelKey] = (stats.modelBreakdown[modelKey] || 0) + total;

  // Update today in dailyHistory
  const todayStr = new Date().toISOString().slice(0, 10);
  const existingDay = stats.dailyHistory.find((d) => d.date === todayStr);
  if (existingDay) {
    existingDay.inputTokens += inputTokens;
    existingDay.outputTokens += outputTokens;
    existingDay.totalTokens += total;
  } else {
    const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    stats.dailyHistory.push({
      date: todayStr,
      dayLabel: dayNames[new Date().getDay()],
      inputTokens,
      outputTokens,
      totalTokens: total,
    });
    if (stats.dailyHistory.length > 7) {
      stats.dailyHistory.shift();
    }
  }

  localStorage.setItem(USAGE_STORAGE, JSON.stringify(stats));
}

export interface StreamChatOptions {
  provider: AiProviderId;
  apiKey: string;
  model: AiModelConfig;
  messages: AiChatMessage[];
  onChunk: (chunk: string) => void;
  onReasoningChunk?: (chunk: string) => void;
  onTruncated?: () => void;
  signal?: AbortSignal;
  lengthMode?: ResponseLengthMode;
  historyWindowSize?: number;
  useGiliFree?: boolean;
}

/**
 * Stateful stream parser that cleanly separates reasoning tokens (from <think>...</think>
 * or API reasoning_content) from clean user-facing content tokens.
 */
export class StreamContentFilter {
  private inThinkTag = false;
  private buffer = "";
  private onContent: (chunk: string) => void;
  private onReasoning?: (chunk: string) => void;

  constructor(
    onContent: (chunk: string) => void,
    onReasoning?: (chunk: string) => void
  ) {
    this.onContent = onContent;
    this.onReasoning = onReasoning;
  }

  handleReasoning(reasoningChunk: string) {
    if (reasoningChunk && this.onReasoning) {
      this.onReasoning(reasoningChunk);
    }
  }

  handleContent(rawChunk: string) {
    if (!rawChunk) return;
    this.buffer += rawChunk;

    while (this.buffer.length > 0) {
      if (this.inThinkTag) {
        const closeIdx = this.buffer.indexOf("</think>");
        if (closeIdx !== -1) {
          const thinkText = this.buffer.slice(0, closeIdx);
          if (thinkText && this.onReasoning) {
            this.onReasoning(thinkText);
          }
          this.buffer = this.buffer.slice(closeIdx + 8);
          this.inThinkTag = false;
        } else {
          // Keep a small tail in case </think> is split across incoming chunks
          if (this.buffer.length > 8) {
            const safeLen = this.buffer.length - 8;
            const thinkPart = this.buffer.slice(0, safeLen);
            if (thinkPart && this.onReasoning) {
              this.onReasoning(thinkPart);
            }
            this.buffer = this.buffer.slice(safeLen);
          }
          break;
        }
      } else {
        const openIdx = this.buffer.indexOf("<think>");
        if (openIdx !== -1) {
          const normalText = this.buffer.slice(0, openIdx);
          if (normalText) {
            this.onContent(normalText);
          }
          this.buffer = this.buffer.slice(openIdx + 7);
          this.inThinkTag = true;
        } else {
          // Check for partial opening tag at the end of the buffer
          const partials = ["<", "<t", "<th", "<thi", "<thin", "<think"];
          const endsWithPartial = partials.some((tag) => this.buffer.endsWith(tag));
          if (endsWithPartial) {
            const lastLt = this.buffer.lastIndexOf("<");
            const normalText = this.buffer.slice(0, lastLt);
            if (normalText) {
              this.onContent(normalText);
            }
            this.buffer = this.buffer.slice(lastLt);
            break;
          } else {
            this.onContent(this.buffer);
            this.buffer = "";
            break;
          }
        }
      }
    }
  }

  flush() {
    if (this.buffer) {
      if (this.inThinkTag && this.onReasoning) {
        this.onReasoning(this.buffer);
      } else if (!this.inThinkTag) {
        this.onContent(this.buffer);
      }
      this.buffer = "";
    }
  }
}

export async function streamChatCompletion({
  provider,
  apiKey,
  model,
  messages,
  onChunk,
  onReasoningChunk,
  onTruncated,
  signal,
  lengthMode = "normal",
  historyWindowSize = 8,
  useGiliFree = false,
}: StreamChatOptions): Promise<{ inputTokens: number; outputTokens: number }> {
  const customBase = useGiliFree ? "" : loadSavedBaseUrls()[provider]?.trim();
  const lengthInstruction = getLengthSystemInstruction(lengthMode);
  const safetyMaxTokens = getSafetyMaxTokens(lengthMode);

  const filter = new StreamContentFilter(onChunk, onReasoningChunk);

  const notchInstruction = getNotchSystemInstruction();

  const systemInstruction = `You are a helpful, smart, and concise AI assistant embedded inside Gili desktop notch on Windows.
Always respond directly to the user in Indonesian unless the user explicitly requests another language.
Never output meta-instructions, internal monologue, planning notes, translation preambles, or scratchpads. Begin immediately with your response to the user.
${lengthInstruction}
${notchInstruction}`;

  // Sliding window to prevent token explosion on long chats (Protocol A1/A3)
  const windowedMessages =
    messages.length > historyWindowSize ? messages.slice(-historyWindowSize) : messages;

  let endpoint = "https://api.openai.com/v1/chat/completions";
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const isAnthropicNative =
    !useGiliFree &&
    provider === "claude" &&
    (!customBase || customBase.includes("anthropic.com") || customBase.endsWith("/messages"));

  if (isAnthropicNative) {
    endpoint = customBase
      ? customBase.endsWith("/messages")
        ? customBase
        : `${customBase.replace(/\/+$/, "")}/v1/messages`
      : "https://api.anthropic.com/v1/messages";
    headers = {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    };

    const claudeMessages = windowedMessages
      .filter((m) => m.role !== "system")
      .map((m) => {
        let text = m.content;
        if (m.context?.previewText) {
          text = `[Konteks Jendela/Layar yang Sedang Dibuka Pengguna]:\nBerikut adalah teks dan isi yang terbaca langsung dari jendela "${m.context.title || m.context.type}":\n"""\n${m.context.previewText}\n"""\n\nInstruksi Pengguna: ${text}`;
        }

        if (m.role === "user" && m.context?.imageDataUrl) {
          const match = m.context.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            return {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: match[1],
                    data: match[2],
                  },
                },
                {
                  type: "text",
                  text: text || "Jelaskan gambar ini.",
                },
              ],
            };
          }
        }
        return { role: m.role, content: text };
      });

    let outputTokens = 0;
    await streamAiRequest({
      url: endpoint,
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model.id,
        messages: claudeMessages,
        system: systemInstruction,
        max_tokens: safetyMaxTokens,
        stream: true,
      }),
      signal,
      onChunk: (line) => {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6).trim();
          if (dataStr === "[DONE]") return;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.type === "content_block_delta") {
              if (parsed.delta?.text) {
                filter.handleContent(parsed.delta.text);
                outputTokens += Math.max(1, Math.round(parsed.delta.text.length / 4));
              } else if (parsed.delta?.thinking) {
                filter.handleReasoning(parsed.delta.thinking);
              }
            } else if (
              parsed.type === "message_delta" &&
              parsed.delta?.stop_reason === "max_tokens"
            ) {
              if (onTruncated) onTruncated();
            }
          } catch {}
        }
      },
    });
    filter.flush();

    const inputTokens = Math.round(
      windowedMessages.reduce((acc, m) => acc + m.content.length, 0) / 4
    );
    return { inputTokens, outputTokens };
  }

  if (provider === "gemini" && !useGiliFree) {
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const geminiContents = windowedMessages.map((m) => {
      const parts: any[] = [];
      if (m.context?.imageDataUrl) {
        const match = m.context.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inline_data: {
              mime_type: match[1],
              data: match[2],
            },
          });
        }
      }
      let text = m.content;
      if (m.context?.previewText) {
        text = `[Konteks Jendela/Layar yang Sedang Dibuka Pengguna]:\nBerikut adalah teks dan isi yang terbaca langsung dari jendela "${m.context.title || m.context.type}":\n"""\n${m.context.previewText}\n"""\n\nInstruksi Pengguna: ${text}`;
      }
      parts.push({ text: text || "Jelaskan gambar ini." });
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts,
      };
    });

    let outputTokens = 0;
    await streamAiRequest({
      url: endpoint,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: geminiContents,
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        generationConfig: {
          maxOutputTokens: safetyMaxTokens,
        },
      }),
      signal,
      onChunk: (line) => {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6).trim();
          try {
            const parsed = JSON.parse(dataStr);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              filter.handleContent(text);
              outputTokens += Math.max(1, Math.round(text.length / 4));
            }
            const finishReason =
              parsed.candidates?.[0]?.finishReason ||
              parsed.candidates?.[0]?.finish_reason;
            if (finishReason === "MAX_TOKENS" && onTruncated) {
              onTruncated();
            }
          } catch {}
        }
      },
    });
    filter.flush();

    const inputTokens = Math.round(
      windowedMessages.reduce((acc, m) => acc + m.content.length, 0) / 4
    );
    return { inputTokens, outputTokens };
  }

  // OpenAI-compatible providers: Gili Free proxy, custom Base URL, OpenAI, OpenRouter, DeepSeek, Grok, Custom
  if (useGiliFree) {
    endpoint = `${getGiliFreeEndpoint()}/v1/chat/completions`;
    headers = {
      "Content-Type": "application/json",
      "X-Gili-Install-Id": getInstallId(),
    };
  } else if (customBase) {
    let clean = customBase.replace(/\/+$/, "");
    if (clean.endsWith("/chat/completions")) {
      endpoint = clean;
    } else if (clean.endsWith("/models")) {
      clean = clean.replace(/\/models$/, "");
      endpoint = clean.endsWith("/v1") ? `${clean}/chat/completions` : `${clean}/v1/chat/completions`;
    } else if (clean.endsWith("/v1")) {
      endpoint = `${clean}/chat/completions`;
    } else {
      endpoint = `${clean}/v1/chat/completions`;
    }
  } else if (provider === "custom") {
    endpoint = "https://api.openai.com/v1/chat/completions";
  } else if (provider === "deepseek") {
    endpoint = "https://api.deepseek.com/chat/completions";
  } else if (provider === "grok") {
    endpoint = "https://api.x.ai/v1/chat/completions";
  } else if (provider === "openrouter") {
    endpoint = "https://openrouter.ai/api/v1/chat/completions";
  }

  const openaiMessages: any[] = [
    {
      role: "system",
      content: systemInstruction,
    },
    ...windowedMessages.map((m) => {
      let text = m.content;
      if (m.context?.previewText) {
        text = `[Konteks Jendela/Layar yang Sedang Dibuka Pengguna]:\nBerikut adalah teks dan isi yang terbaca langsung dari jendela "${m.context.title || m.context.type}":\n"""\n${m.context.previewText}\n"""\n\nInstruksi Pengguna: ${text}`;
      }
      if (m.context?.imageDataUrl && provider === "deepseek") {
        text += "\n[Catatan: Pengguna melampirkan tangkapan layar jendela. Analisis berdasarkan judul dan teks jendela di atas]";
      }

      // Support image data URL for OpenAI, OpenRouter, and multimodal models
      if (
        m.role === "user" &&
        m.context?.imageDataUrl &&
        (useGiliFree || provider === "openai" || provider === "openrouter" || provider === "custom" || customBase)
      ) {
        return {
          role: "user",
          content: [
            { type: "text", text: text || "Jelaskan gambar ini." },
            {
              type: "image_url",
              image_url: { url: m.context.imageDataUrl },
            },
          ],
        };
      }

      return { role: m.role, content: text };
    }),
  ];

  let outputTokens = 0;
  await streamAiRequest({
    url: endpoint,
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model.id,
      messages: openaiMessages,
      stream: true,
      max_tokens: safetyMaxTokens,
    }),
    signal,
    onChunk: (line) => {
      if (line.startsWith("data: ")) {
        const dataStr = line.slice(6).trim();
        if (dataStr === "[DONE]") return;
        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices?.[0]?.delta;
          const reasoning = delta?.reasoning_content || delta?.reasoning;
          const content = delta?.content;

          if (reasoning) {
            filter.handleReasoning(reasoning);
          }
          if (content) {
            filter.handleContent(content);
            outputTokens += Math.max(1, Math.round(content.length / 4));
          }
          const finishReason = parsed.choices?.[0]?.finish_reason;
          if (finishReason === "length" && onTruncated) {
            onTruncated();
          }
        } catch {}
      }
    },
  });
  filter.flush();

  const inputTokens = Math.round(
    windowedMessages.reduce((acc, m) => acc + m.content.length, 0) / 4
  );
  return { inputTokens, outputTokens };
}

