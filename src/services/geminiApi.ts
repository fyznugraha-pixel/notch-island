import { streamAiRequest, isAbortError } from "./aiHttp";
import {
  compareModelsNewestFirst,
  getRegisteredModels,
  isModelUnavailable,
  isSpecializedNonChatModel,
  markModelUnavailable,
  registerCustomModel,
  saveActiveModel,
  toModelConfig,
} from "./aiModelRegistry";
import { loadRouterConfig, saveRouterConfig } from "./aiRouterService";
import { getLanguage } from "./i18n";
import type { AiChatMessage, AiModelConfig } from "../components/ui/aichat/AiChatTypes";

export type GeminiApiMode = "auto" | "interactions" | "generateContent";

export interface GeminiStreamOptions {
  apiKey: string;
  model: AiModelConfig;
  messages: AiChatMessage[];
  systemInstruction: string;
  safetyMaxTokens: number;
  customBase?: string;
  signal?: AbortSignal;
  onText: (text: string) => void;
  onReasoning: (thought: string) => void;
  onTruncated?: () => void;
}

export interface GeminiStreamResult {
  apiInputTokens: number;
  apiOutputTokens: number;
  rawOutputText: string;
  rawReasoningText: string;
}

const GEMINI_API_MODE_KEY = "island_gemini_api_mode_v1";
const interactionCache = new Map<string, string>();

export function getGeminiApiMode(): GeminiApiMode {
  try {
    const raw = localStorage.getItem(GEMINI_API_MODE_KEY);
    if (raw === "auto" || raw === "interactions" || raw === "generateContent") return raw;
  } catch {}
  return "auto";
}

export function setGeminiApiMode(mode: GeminiApiMode): void {
  try {
    localStorage.setItem(GEMINI_API_MODE_KEY, mode);
  } catch {}
}

const stripModels = (id: string) => id.trim().replace(/^models\//i, "");

function resolveV1BetaBase(customBase?: string): string {
  const clean = (customBase?.trim() || "https://generativelanguage.googleapis.com/v1beta")
    .replace(/\/+$/, "")
    .replace(/\/(models|interactions)$/i, "");
  return clean.endsWith("/v1beta") ? clean : `${clean}/v1beta`;
}

function formatMessageText(m: AiChatMessage): string {
  const base = m.content || "";
  if (!m.context?.previewText) return base;
  const title = m.context.title || m.context.type;
  return getLanguage() === "en"
    ? `[User's Active Window/Screen Context]:\nHere is the text and content read directly from window "${title}":\n"""\n${m.context.previewText}\n"""\n\nUser Instruction: ${base}`
    : `[Konteks Jendela/Layar yang Sedang Dibuka Pengguna]:\nBerikut adalah teks dan isi yang terbaca langsung dari jendela "${title}":\n"""\n${m.context.previewText}\n"""\n\nInstruksi Pengguna: ${base}`;
}

function buildPriorTranscript(prior: AiChatMessage[]): string {
  return prior
    .filter((m) => m.role !== "system" && !(m.role === "assistant" && m.error && !m.content.trim()))
    .map((m) => {
      const body = formatMessageText(m).trim();
      if (!body) return "";
      const clipped = body.length > 1600 ? `${body.slice(0, 1600)}...` : body;
      return `${m.role === "assistant" ? "Assistant" : "User"}: ${clipped}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

const cacheKey = (apiKey: string, modelId: string, msgId?: string) =>
  msgId ? `${apiKey.slice(-6)}::${stripModels(modelId).toLowerCase()}::${msgId}` : null;

function parseHttpError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err || "");
  const m = raw.match(/^HTTP\s+(\d{3}):\s*([\s\S]*)$/);
  if (!m) return { status: 0, message: raw };
  let message = m[2].trim();
  try {
    const parsed = JSON.parse(message);
    message = String(parsed?.error?.message || parsed?.message || message);
  } catch {}
  return { status: Number(m[1]) || 0, message };
}

const isAuthErr = (s: number, msg: string) =>
  s === 401 || s === 403 || /api key not valid|invalid api key|permission_denied|unauthenticated/i.test(msg);

const isUnavailableErr = (s: number, msg: string) =>
  /no longer available|not available to new users|has been retired|deprecated|not found for api version/i.test(msg) ||
  (s === 404 && /models?\//i.test(msg));

const shouldFallbackFromInteractions = (s: number, msg: string) =>
  !isAuthErr(s, msg) &&
  !isUnavailableErr(s, msg) &&
  (s === 404 || s === 405 || s === 501 ||
    (s === 400 && /unknown field|unknown name|interactions|unsupported|invalid json payload|previous_interaction_id/i.test(msg)));

function parseSuggestedModel(msg: string): string | null {
  const m = msg.match(/(?:update(?:\s+your\s+code)?\s+to\s+use|switch\s+to|use)\s+(?:models\/)?(gemini-[a-z0-9._-]+)/i);
  return m?.[1] ? stripModels(m[1]) : null;
}

async function streamGeminiSse(
  url: string,
  apiKey: string,
  body: unknown,
  signal: AbortSignal | undefined,
  onEvent: (parsed: any, sseEvent: string) => void
): Promise<void> {
  let sseEvent = "";
  let streamError: string | null = null;
  await streamAiRequest({
    url,
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal,
    onChunk: (line) => {
      if (line.startsWith("event:")) {
        sseEvent = line.slice(6).trim();
        return;
      }
      if (!line.trim()) {
        sseEvent = "";
        return;
      }
      if (!line.startsWith("data:")) return;
      const dataStr = line.slice(5).trim();
      if (!dataStr || dataStr === "[DONE]") return;
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.error?.message || sseEvent === "error") {
          streamError = String(parsed.error?.message || parsed.message || "Gemini stream error");
          return;
        }
        onEvent(parsed, sseEvent);
      } catch {}
    },
  });
  if (streamError) throw new Error(streamError);
}

async function runInteractionsStream(opts: GeminiStreamOptions, modelId: string, allowRetryPrev = true): Promise<GeminiStreamResult> {
  const cleanModel = stripModels(modelId);
  const nonSystem = opts.messages.filter((m) => m.role !== "system");
  const currentMsg = nonSystem[nonSystem.length - 1];
  const prior = nonSystem.slice(0, -1);

  let prevId: string | undefined;
  if (prior.length >= 2) {
    const prevAst = prior[prior.length - 1];
    const prevUsr = prior[prior.length - 2];
    if (prevAst.role === "assistant" && !prevAst.error && prevAst.content.trim() && prevUsr.role === "user") {
      const k = cacheKey(opts.apiKey, cleanModel, prevUsr.id);
      if (k) prevId = interactionCache.get(k);
    }
  }

  const transcript = !prevId && prior.length > 0 ? buildPriorTranscript(prior) : "";
  const system_instruction = transcript
    ? `[Previous conversation context]\n${transcript}\n\n[System Instructions]\n${opts.systemInstruction}`
    : opts.systemInstruction;

  const currentText = currentMsg ? formatMessageText(currentMsg) : "";
  const imgMatch = currentMsg?.context?.imageDataUrl?.match(/^data:([^;]+);base64,(.+)$/);
  const input = imgMatch
    ? [
        { type: "text", text: currentText || (getLanguage() === "en" ? "Explain this image." : "Jelaskan gambar ini.") },
        { type: "image", data: imgMatch[2], mime_type: imgMatch[1] },
      ]
    : currentText;

  let capturedId: string | null = null;
  let apiInputTokens = 0;
  let apiOutputTokens = 0;
  let rawOutputText = "";
  let rawReasoningText = "";
  let sawText = false;
  let sawThought = false;

  const emitText = (t: string) => { rawOutputText += t; opts.onText(t); };
  const emitThought = (t: string) => { rawReasoningText += t; opts.onReasoning(t); };

  try {
    await streamGeminiSse(
      `${resolveV1BetaBase(opts.customBase)}/interactions`,
      opts.apiKey,
      {
        model: cleanModel,
        input,
        system_instruction,
        generation_config: { max_output_tokens: opts.safetyMaxTokens },
        stream: true,
        ...(prevId ? { previous_interaction_id: prevId } : {}),
      },
      opts.signal,
      (parsed, sseEvent) => {
        const type = String(parsed.event_type || parsed.type || sseEvent || "");
        if (parsed.interaction?.id) capturedId = String(parsed.interaction.id);
        else if (type === "interaction.created" && parsed.id) capturedId = String(parsed.id);

        if (type === "content.delta" || type === "step.delta") {
          const d = parsed.delta;
          if (d?.type === "thought" || d?.type === "thinking") {
            const thought = String(d.thought || d.text || "");
            if (thought) { sawThought = true; emitThought(thought); }
          } else if (d && typeof d.text === "string" && d.text) {
            sawText = true;
            emitText(d.text);
          }
        } else if (type === "interaction.completed") {
          const inter = parsed.interaction || parsed;
          if (inter.id) capturedId = String(inter.id);
          const u = inter.usage || parsed.usage;
          if (u) {
            apiInputTokens = Number(u.total_input_tokens ?? u.input_tokens) || apiInputTokens;
            apiOutputTokens = Number(u.total_output_tokens ?? u.output_tokens) || apiOutputTokens;
          }
          for (const out of Array.isArray(inter.outputs) ? inter.outputs : []) {
            if (!sawThought && (out?.type === "thought" || out?.type === "thinking") && (out.thought || out.text)) {
              emitThought(String(out.thought || out.text));
            } else if (!sawText && (out?.type === "text" || !out?.type) && typeof out?.text === "string") {
              emitText(out.text);
            }
          }
          const finish = inter.stop_reason || inter.finish_reason || inter.status;
          if (finish === "max_tokens" || finish === "MAX_TOKENS" || finish === "incomplete") opts.onTruncated?.();
        }
      }
    );
  } catch (err) {
    if (prevId && allowRetryPrev && !rawOutputText && !rawReasoningText) {
      const { status, message } = parseHttpError(err);
      if ((status === 400 || status === 404) && /previous_interaction_id|interaction/i.test(message)) {
        const prevKey = cacheKey(opts.apiKey, cleanModel, prior[prior.length - 2]?.id);
        if (prevKey) interactionCache.delete(prevKey);
        return runInteractionsStream(opts, modelId, false);
      }
    }
    throw err;
  }

  if (capturedId && currentMsg && rawOutputText.trim()) {
    const nextKey = cacheKey(opts.apiKey, cleanModel, currentMsg.id);
    if (nextKey) interactionCache.set(nextKey, capturedId);
  }
  return { apiInputTokens, apiOutputTokens, rawOutputText, rawReasoningText };
}

async function runGenerateContentStream(opts: GeminiStreamOptions, modelId: string, useQueryKey = false): Promise<GeminiStreamResult> {
  const cleanModel = stripModels(modelId);
  const query = useQueryKey ? `&key=${encodeURIComponent(opts.apiKey)}` : "";
  const url = `${resolveV1BetaBase(opts.customBase)}/models/${encodeURIComponent(cleanModel)}:streamGenerateContent?alt=sse${query}`;
  const isEn = getLanguage() === "en";
  const contents = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const parts: Array<Record<string, unknown>> = [];
      const img = m.context?.imageDataUrl?.match(/^data:([^;]+);base64,(.+)$/);
      if (img) parts.push({ inline_data: { mime_type: img[1], data: img[2] } });
      parts.push({ text: formatMessageText(m) || (isEn ? "Explain this image." : "Jelaskan gambar ini.") });
      return { role: m.role === "assistant" ? "model" : "user", parts };
    });

  let apiInputTokens = 0;
  let apiOutputTokens = 0;
  let rawOutputText = "";
  let rawReasoningText = "";
  try {
    await streamGeminiSse(
      url,
      opts.apiKey,
      { contents, system_instruction: { parts: [{ text: opts.systemInstruction }] }, generationConfig: { maxOutputTokens: opts.safetyMaxTokens } },
      opts.signal,
      (parsed) => {
        if (parsed.usageMetadata) {
          apiInputTokens = Number(parsed.usageMetadata.promptTokenCount) || apiInputTokens;
          const outTok = (Number(parsed.usageMetadata.candidatesTokenCount) || 0) + (Number(parsed.usageMetadata.thoughtsTokenCount) || 0);
          if (outTok > 0) apiOutputTokens = outTok;
        }
        for (const part of Array.isArray(parsed.candidates?.[0]?.content?.parts) ? parsed.candidates[0].content.parts : []) {
          if (!part?.text) continue;
          if (part.thought) { rawReasoningText += part.text; opts.onReasoning(part.text); }
          else { rawOutputText += part.text; opts.onText(part.text); }
        }
        const finish = parsed.candidates?.[0]?.finishReason || parsed.candidates?.[0]?.finish_reason;
        if (finish === "MAX_TOKENS") opts.onTruncated?.();
      }
    );
  } catch (err) {
    if (!useQueryKey && !rawOutputText && !rawReasoningText) {
      const { status, message } = parseHttpError(err);
      if ((status === 400 || status === 401 || status === 403) && /api.?key/i.test(message)) {
        return runGenerateContentStream(opts, modelId, true);
      }
    }
    throw err;
  }
  return { apiInputTokens, apiOutputTokens, rawOutputText, rawReasoningText };
}

function pickReplacementModel(failingId: string, errorMessage: string): string | null {
  const cleanFailing = stripModels(failingId).toLowerCase();
  const healthy = getRegisteredModels("gemini").filter(
    (m) => stripModels(m.id).toLowerCase() !== cleanFailing && !isModelUnavailable("gemini", m.id) && !isSpecializedNonChatModel(m.id)
  );
  const suggested = parseSuggestedModel(errorMessage);
  if (suggested && suggested.toLowerCase() !== cleanFailing && !isModelUnavailable("gemini", suggested)) {
    const match = healthy.find((m) => stripModels(m.id).toLowerCase() === suggested.toLowerCase());
    return match ? match.id : toModelConfig("gemini", { id: suggested }).id;
  }
  return healthy.length > 0 ? [...healthy].sort(compareModelsNewestFirst)[0].id : null;
}

export async function streamGeminiChat(opts: GeminiStreamOptions): Promise<GeminiStreamResult> {
  const mode = getGeminiApiMode();
  const startInteractions = mode === "interactions" || (mode === "auto" && (!opts.customBase || opts.customBase.includes("googleapis.com")));
  const tried = new Set<string>();
  let targetModelId = stripModels(opts.model.id);

  const runForModel = async (modelId: string): Promise<GeminiStreamResult> => {
    try {
      return startInteractions ? await runInteractionsStream(opts, modelId) : await runGenerateContentStream(opts, modelId);
    } catch (err) {
      if (isAbortError(err) || opts.signal?.aborted) throw err;
      const { status, message } = parseHttpError(err);
      if (mode === "auto") {
        if (startInteractions && shouldFallbackFromInteractions(status, message)) {
          return runGenerateContentStream(opts, modelId);
        }
        if (!startInteractions && !isUnavailableErr(status, message) && /interactions api|use the interactions/i.test(message)) {
          return runInteractionsStream(opts, modelId);
        }
      }
      throw err;
    }
  };

  while (true) {
    tried.add(targetModelId.toLowerCase());
    try {
      return await runForModel(targetModelId);
    } catch (err) {
      if (isAbortError(err) || opts.signal?.aborted) throw err;
      const { status, message } = parseHttpError(err);
      if (!isUnavailableErr(status, message)) throw err;
      markModelUnavailable("gemini", targetModelId);
      const nextId = pickReplacementModel(targetModelId, message);
      if (nextId && !tried.has(nextId.toLowerCase()) && tried.size < 3) {
        const registered = registerCustomModel("gemini", nextId);
        saveActiveModel("gemini", registered.id);
        const routerCfg = loadRouterConfig();
        if (
          routerCfg.selectedMode !== "auto" &&
          stripModels(routerCfg.selectedMode).toLowerCase() === targetModelId.toLowerCase()
        ) {
          saveRouterConfig({ ...routerCfg, selectedMode: registered.id });
        }
        targetModelId = stripModels(registered.id);
        continue;
      }
      const suggested = parseSuggestedModel(message);
      const isEn = getLanguage() === "en";
      throw new Error(
        suggested
          ? isEn
            ? `Model "${targetModelId}" is unavailable for this API key. Try "${suggested}" or enter a model ID manually in Settings / Model selector.`
            : `Model "${targetModelId}" tidak tersedia untuk API key ini. Gunakan "${suggested}" atau masukkan ID model manual di Pengaturan / Pemilih Model.`
          : isEn
            ? `Model "${targetModelId}" is unavailable for this API key. Switch to Auto or enter a newer Gemini model ID manually.`
            : `Model "${targetModelId}" tidak tersedia untuk API key ini. Gunakan mode Auto atau masukkan ID model Gemini terbaru secara manual.`
      );
    }
  }
}
