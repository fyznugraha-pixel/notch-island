import { streamAiRequest, isAbortError } from "./aiHttp";
import { streamChatCompletion, estimateTextTokens, recordTokenUsage } from "./aiChatService";
import { calculateEstimatedCostIdr } from "./aiRouterService";
import { updateConversationMessages } from "./aiConversationService";
import { parseAndExecuteGiliActions, stripActionBlocksForDisplay } from "./aiNotchTools";
import { describeGiliFreeError } from "./giliFreeService";
import type {
  AiChatMessage,
  AiModelConfig,
  AiProviderId,
  ResponseLengthMode,
  RouterTier,
} from "../components/ui/aichat/AiChatTypes";

// Suppress unused import lint while keeping module dependency explicit if stream helper swaps
void streamAiRequest;

export interface ActiveAiStreamInfo {
  conversationId: string;
  modelId: string;
  modelName: string;
  provider: AiProviderId;
  startedAt: number;
  hasReasoning: boolean;
  hasContent: boolean;
  contentLength: number;
  source: "panel" | "quick_card";
}

export interface LiveConversationStreamState {
  messages: AiChatMessage[];
  streamingTokens: number;
  isStreaming: boolean;
}

export interface StartBackgroundStreamParams {
  conversationId: string;
  source: "panel" | "quick_card";
  provider: AiProviderId;
  apiKey: string;
  model: AiModelConfig;
  updatedMessages: AiChatMessage[];
  assistantMsgId: string;
  lengthMode: ResponseLengthMode;
  historyWindowSize: number;
  useGiliFree: boolean;
  targetTier?: RouterTier;
  isAutoRouted: boolean;
  estCostIdr?: number;
}

interface InternalStreamJob {
  conversationId: string;
  source: "panel" | "quick_card";
  controller: AbortController;
  provider: AiProviderId;
  model: AiModelConfig;
  useGiliFree: boolean;
  targetTier?: RouterTier;
  lengthMode: ResponseLengthMode;
  isAutoRouted: boolean;
  estCostIdr?: number;
  assistantMsgId: string;
  baseMessages: AiChatMessage[];
  currentMessages: AiChatMessage[];
  accumulated: string;
  accumulatedReasoning: string;
  streamingTokens: number;
  isTruncated: boolean;
  startedAt: number;
  lastSavedAt: number;
}

const activeJobs = new Map<string, InternalStreamJob>();
const completedTokenDeltas = new Map<string, number>();
const completedMessagesCache = new Map<string, AiChatMessage[]>();
const listeners = new Set<() => void>();

function cacheConversationMessages(conversationId: string, msgs: AiChatMessage[]): void {
  completedMessagesCache.delete(conversationId);
  completedMessagesCache.set(conversationId, msgs);
  if (completedMessagesCache.size > 20) {
    const oldestKey = completedMessagesCache.keys().next().value;
    if (oldestKey) completedMessagesCache.delete(oldestKey);
  }
}

export function getCompletedConversationMessages(
  conversationId: string | null | undefined
): AiChatMessage[] | null {
  if (!conversationId) return null;
  return completedMessagesCache.get(conversationId) ?? null;
}

let cachedStreamList: ActiveAiStreamInfo[] = [];
let cachedAnyActive = false;
let chunkEmitTimer: number | null = null;

function rebuildSnapshots(): void {
  const nextList: ActiveAiStreamInfo[] = [];
  for (const job of activeJobs.values()) {
    nextList.push({
      conversationId: job.conversationId,
      modelId: job.model.id,
      modelName: job.model.name,
      provider: job.provider,
      startedAt: job.startedAt,
      hasReasoning: job.accumulatedReasoning.length > 0,
      hasContent: job.accumulated.length > 0,
      contentLength: job.accumulated.length,
      source: job.source,
    });
  }
  cachedStreamList = nextList;
  cachedAnyActive = nextList.length > 0;
}

function emitImmediate(): void {
  if (chunkEmitTimer !== null) {
    window.clearTimeout(chunkEmitTimer);
    chunkEmitTimer = null;
  }
  rebuildSnapshots();
  for (const listener of listeners) {
    try {
      listener();
    } catch {}
  }
}

function scheduleChunkEmit(): void {
  if (chunkEmitTimer !== null) return;
  chunkEmitTimer = window.setTimeout(() => {
    chunkEmitTimer = null;
    rebuildSnapshots();
    for (const listener of listeners) {
      try {
        listener();
      } catch {}
    }
  }, 45);
}

function formatStreamError(err: unknown, useGiliFree: boolean): string {
  let errorMsg = err instanceof Error ? err.message : String(err || "Failed to process AI response.");
  if (useGiliFree) {
    errorMsg = describeGiliFreeError(errorMsg);
  }
  if (typeof errorMsg === "string" && errorMsg.includes("HTTP ")) {
    try {
      const jsonPart = errorMsg.replace(/^HTTP \d+:\s*/, "").trim();
      const parsed = JSON.parse(jsonPart);
      if (parsed?.error?.message) return parsed.error.message;
      if (parsed?.message) return parsed.message;
    } catch {}
  }
  return errorMsg;
}

function buildSnapshotMessages(
  job: InternalStreamJob,
  contentValue: string,
  extraFields: Partial<AiChatMessage> = {}
): AiChatMessage[] {
  return job.baseMessages.map((msg) =>
    msg.id === job.assistantMsgId
      ? {
          ...msg,
          content: contentValue,
          reasoning: job.accumulatedReasoning || undefined,
          ...extraFields,
        }
      : msg
  );
}

export function getActiveAiStreams(): ActiveAiStreamInfo[] {
  return cachedStreamList;
}

export function getActiveAiStreamForConversation(
  conversationId: string | null | undefined
): ActiveAiStreamInfo | null {
  if (!conversationId) return null;
  return cachedStreamList.find((s) => s.conversationId === conversationId) || null;
}

export function isAnyAiStreamActive(): boolean {
  return cachedAnyActive;
}

export function subscribeAiBackgroundStreams(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLiveConversationStreamState(
  conversationId: string | null | undefined
): LiveConversationStreamState | null {
  if (!conversationId) return null;
  const job = activeJobs.get(conversationId);
  if (!job) return null;
  return {
    messages: job.currentMessages,
    streamingTokens: job.streamingTokens,
    isStreaming: true,
  };
}

export function consumeCompletedTokenDelta(conversationId: string | null | undefined): number {
  if (!conversationId) return 0;
  const delta = completedTokenDeltas.get(conversationId) || 0;
  if (delta > 0) {
    completedTokenDeltas.delete(conversationId);
  }
  return delta;
}

export function stopBackgroundAiStream(conversationId?: string): void {
  if (conversationId) {
    const job = activeJobs.get(conversationId);
    if (!job) return;
    job.controller.abort();
    const partialMessages = buildSnapshotMessages(
      job,
      stripActionBlocksForDisplay(job.accumulated) || job.accumulated
    );
    job.currentMessages = partialMessages;
    cacheConversationMessages(conversationId, partialMessages);
    updateConversationMessages(conversationId, partialMessages);
    activeJobs.delete(conversationId);
    emitImmediate();
    return;
  }

  for (const [convId, job] of activeJobs.entries()) {
    job.controller.abort();
    const partialMessages = buildSnapshotMessages(
      job,
      stripActionBlocksForDisplay(job.accumulated) || job.accumulated
    );
    cacheConversationMessages(convId, partialMessages);
    updateConversationMessages(convId, partialMessages);
  }
  activeJobs.clear();
  emitImmediate();
}

export function startBackgroundAiChatStream(params: StartBackgroundStreamParams): void {
  const {
    conversationId,
    source,
    provider,
    apiKey,
    model,
    updatedMessages,
    assistantMsgId,
    lengthMode,
    historyWindowSize,
    useGiliFree,
    targetTier,
    isAutoRouted,
    estCostIdr,
  } = params;

  if (activeJobs.has(conversationId)) return;

  const initialAssistantMessage: AiChatMessage = {
    id: assistantMsgId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    provider,
    modelId: model.id,
    modelName: model.name,
    tier: targetTier,
    lengthMode,
    isAutoRouted,
    estimatedCostIdr: estCostIdr,
  };

  const baseMessages = [...updatedMessages, initialAssistantMessage];
  cacheConversationMessages(conversationId, baseMessages);
  updateConversationMessages(conversationId, baseMessages);

  const controller = new AbortController();
  const job: InternalStreamJob = {
    conversationId,
    source,
    controller,
    provider,
    model,
    useGiliFree,
    targetTier,
    lengthMode,
    isAutoRouted,
    estCostIdr,
    assistantMsgId,
    baseMessages,
    currentMessages: baseMessages,
    accumulated: "",
    accumulatedReasoning: "",
    streamingTokens: 0,
    isTruncated: false,
    startedAt: Date.now(),
    lastSavedAt: Date.now(),
  };

  activeJobs.set(conversationId, job);
  emitImmediate();

  const persistProgress = (force: boolean) => {
    cacheConversationMessages(conversationId, job.currentMessages);
    const now = Date.now();
    if (!force && now - job.lastSavedAt < 350) return;
    job.lastSavedAt = now;
    updateConversationMessages(conversationId, job.currentMessages);
  };

  void (async () => {
    try {
      const result = await streamChatCompletion({
        provider,
        apiKey,
        model,
        messages: updatedMessages,
        lengthMode,
        historyWindowSize,
        useGiliFree,
        signal: controller.signal,
        onTruncated: () => {
          job.isTruncated = true;
        },
        onReasoningChunk: (reasoningChunk: string) => {
          if (controller.signal.aborted) return;
          const isFirst = job.accumulatedReasoning.length === 0 && job.accumulated.length === 0;
          job.accumulatedReasoning += reasoningChunk;
          job.streamingTokens = estimateTextTokens(job.accumulated + job.accumulatedReasoning);
          job.currentMessages = buildSnapshotMessages(
            job,
            stripActionBlocksForDisplay(job.accumulated) || job.accumulated
          );
          persistProgress(isFirst);
          if (isFirst) {
            emitImmediate();
          } else {
            scheduleChunkEmit();
          }
        },
        onChunk: (chunk: string) => {
          if (controller.signal.aborted) return;
          const isFirst = job.accumulated.length === 0;
          job.accumulated += chunk;
          job.streamingTokens = estimateTextTokens(job.accumulated + job.accumulatedReasoning);
          const displayContent = stripActionBlocksForDisplay(job.accumulated);
          job.currentMessages = buildSnapshotMessages(job, displayContent);
          persistProgress(isFirst);
          if (isFirst) {
            emitImmediate();
          } else {
            scheduleChunkEmit();
          }
        },
      });

      if (controller.signal.aborted) {
        const partialMessages = buildSnapshotMessages(
          job,
          stripActionBlocksForDisplay(job.accumulated) || job.accumulated
        );
        cacheConversationMessages(conversationId, partialMessages);
        updateConversationMessages(conversationId, partialMessages);
        return;
      }

      const totalTokens = result.inputTokens + result.outputTokens;
      const actualCostIdr =
        model.id === "gili-free" || useGiliFree
          ? undefined
          : calculateEstimatedCostIdr(model, result.inputTokens, result.outputTokens);

      const { cleanText, results: executedActions } = await parseAndExecuteGiliActions(
        job.accumulated
      );

      if (controller.signal.aborted) {
        const partialMessages = buildSnapshotMessages(
          job,
          stripActionBlocksForDisplay(job.accumulated) || job.accumulated
        );
        cacheConversationMessages(conversationId, partialMessages);
        updateConversationMessages(conversationId, partialMessages);
        return;
      }

      const finalMessages = buildSnapshotMessages(job, cleanText || job.accumulated, {
        tokens: result.outputTokens,
        provider,
        modelId: model.id,
        modelName: model.name,
        tier: targetTier,
        lengthMode,
        isAutoRouted,
        estimatedCostIdr: actualCostIdr,
        isTruncated: job.isTruncated,
        notchActions: executedActions.length > 0 ? executedActions : undefined,
      });

      cacheConversationMessages(conversationId, finalMessages);
      updateConversationMessages(conversationId, finalMessages, totalTokens);
      recordTokenUsage(model, result.inputTokens, result.outputTokens);
      completedTokenDeltas.set(
        conversationId,
        (completedTokenDeltas.get(conversationId) || 0) + totalTokens
      );
    } catch (err: unknown) {
      if (isAbortError(err) || controller.signal.aborted) {
        const partialMessages = buildSnapshotMessages(
          job,
          stripActionBlocksForDisplay(job.accumulated) || job.accumulated
        );
        cacheConversationMessages(conversationId, partialMessages);
        updateConversationMessages(conversationId, partialMessages);
      } else {
        const partialContent = stripActionBlocksForDisplay(job.accumulated) || job.accumulated;
        const errorMsg = formatStreamError(err, useGiliFree);
        const errorMessages = buildSnapshotMessages(job, partialContent, {
          error: errorMsg,
          provider,
          modelId: model.id,
          modelName: model.name,
          tier: targetTier,
          lengthMode,
          isAutoRouted,
          estimatedCostIdr: estCostIdr,
        });
        cacheConversationMessages(conversationId, errorMessages);
        updateConversationMessages(conversationId, errorMessages);
      }
    } finally {
      if (activeJobs.get(conversationId) === job) {
        activeJobs.delete(conversationId);
      }
      emitImmediate();
    }
  })();
}
