import type {
  AiConversation,
  AiChatMessage,
  AiProviderId,
  AutoCleanupDays,
} from "../components/ui/aichat/AiChatTypes";
import { t } from "./i18n";

const CONVERSATIONS_KEY = "island_ai_conversations_v1";
const ACTIVE_CONV_ID_KEY = "island_ai_active_conv_id_v1";
const AUTO_CLEANUP_KEY = "island_ai_auto_cleanup_days_v1";

export function getAutoCleanupDays(): AutoCleanupDays {
  try {
    const raw = localStorage.getItem(AUTO_CLEANUP_KEY);
    if (!raw) return 0;
    const num = Number(raw);
    if (num === 3 || num === 7 || num === 30) return num;
  } catch {}
  return 0;
}

export function setAutoCleanupDays(days: AutoCleanupDays): void {
  try {
    localStorage.setItem(AUTO_CLEANUP_KEY, String(days));
  } catch {}
  if (days > 0) {
    pruneInactiveConversations(days);
  }
}

function loadRawConversations(): AiConversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (c) => c && typeof c.id === "string" && Array.isArray(c.messages)
    );

    // Auto-backfill identity for existing messages that lack locked provider/modelId
    let hasModified = false;
    for (const conv of valid) {
      for (const msg of conv.messages) {
        if (msg.role === "assistant") {
          if (!msg.provider || !msg.modelId) {
            // Detect if content carries DeepSeek's thinking/preamble style or mentions deepseek
            const textLower = (msg.content || "").toLowerCase();
            const isDeepSeekClue =
              textLower.includes("deepseek") ||
              textLower.startsWith("we need answer in indonesian");

            if (isDeepSeekClue) {
              msg.provider = "deepseek";
              msg.modelId = msg.modelId || "deepseek-chat";
              msg.modelName = msg.modelName || "DeepSeek";
            } else {
              if (!msg.provider && conv.providerId) {
                msg.provider = conv.providerId;
              }
              if (!msg.modelId && conv.modelId) {
                msg.modelId = conv.modelId;
              }
            }
            hasModified = true;
          }
        }
      }
    }

    if (hasModified) {
      try {
        localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(valid));
      } catch {}
    }

    return valid;
  } catch {
    return [];
  }
}

export function sanitizeConversationsForStorage(conversations: AiConversation[]): AiConversation[] {
  return conversations.map((conv) => ({
    ...conv,
    messages: conv.messages.map((msg) => {
      if (!msg.context?.imageDataUrl) return msg;
      const { imageDataUrl: _omitted, ...restContext } = msg.context;
      return {
        ...msg,
        context: {
          ...restContext,
          previewText: restContext.previewText || "[Gambar terlampir]",
        },
      };
    }),
  }));
}

function saveRawConversations(conversations: AiConversation[]): void {
  const sanitized = sanitizeConversationsForStorage(conversations);
  for (let limit = sanitized.length; limit >= 1; limit--) {
    try {
      const slice = limit === sanitized.length ? sanitized : sanitized.slice(0, limit);
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(slice));
      return;
    } catch (err) {
      if (limit === 1) {
        console.warn("Gagal menyimpan riwayat percakapan:", err);
      }
    }
  }
  if (sanitized.length === 0) {
    try {
      localStorage.setItem(CONVERSATIONS_KEY, "[]");
    } catch {}
  }
}

export function pruneInactiveConversations(explicitDays?: AutoCleanupDays): number {
  const days = explicitDays !== undefined ? explicitDays : getAutoCleanupDays();
  if (days <= 0) return 0;

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const list = loadRawConversations();
  const kept = list.filter((conv) => conv.updatedAt >= cutoff);
  const deletedCount = list.length - kept.length;

  if (deletedCount > 0) {
    saveRawConversations(kept);
    const activeId = getActiveConversationId();
    if (activeId && !kept.some((c) => c.id === activeId)) {
      setActiveConversationId(kept[0]?.id || null);
    }
  }

  return deletedCount;
}

export function getConversations(): AiConversation[] {
  pruneInactiveConversations();
  const list = loadRawConversations();
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversationById(id: string): AiConversation | null {
  const list = getConversations();
  return list.find((c) => c.id === id) || null;
}

export function getActiveConversationId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CONV_ID_KEY) || null;
  } catch {
    return null;
  }
}

export function setActiveConversationId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_CONV_ID_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_CONV_ID_KEY);
    }
  } catch {}
}

export function generateTitleFromPrompt(prompt: string): string {
  const clean = prompt.replace(/[\r\n\t]+/g, " ").trim();
  if (!clean) return t("aichat_new_chat");
  if (clean.length <= 36) return clean;
  return `${clean.slice(0, 36).trim()}...`;
}

export function createConversation(
  providerId: AiProviderId,
  modelId: string,
  initialTitle?: string
): AiConversation {
  const list = loadRawConversations();

  // If there is already an empty conversation at the top, reuse it
  const existingEmpty = list.find((c) => c.messages.length === 0);
  if (existingEmpty) {
    existingEmpty.providerId = providerId;
    existingEmpty.modelId = modelId;
    existingEmpty.updatedAt = Date.now();
    if (initialTitle) existingEmpty.title = initialTitle;
    saveRawConversations(list);
    setActiveConversationId(existingEmpty.id);
    return existingEmpty;
  }

  const newConv: AiConversation = {
    id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: initialTitle || t("aichat_new_chat"),
    modelId,
    providerId,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalTokens: 0,
  };

  const updated = [newConv, ...list];
  saveRawConversations(updated);
  setActiveConversationId(newConv.id);
  return newConv;
}

export function getOrCreateActiveConversation(
  providerId: AiProviderId,
  modelId: string
): AiConversation {
  pruneInactiveConversations();
  const activeId = getActiveConversationId();
  if (activeId) {
    const existing = getConversationById(activeId);
    if (existing) return existing;
  }

  const list = getConversations();
  if (list.length > 0) {
    setActiveConversationId(list[0].id);
    return list[0];
  }

  return createConversation(providerId, modelId);
}

export function saveConversation(conv: AiConversation): void {
  const list = loadRawConversations();
  const idx = list.findIndex((c) => c.id === conv.id);
  if (idx >= 0) {
    list[idx] = { ...conv, updatedAt: Date.now() };
  } else {
    list.unshift({ ...conv, updatedAt: Date.now() });
  }
  saveRawConversations(list);
}

export function updateConversationMessages(
  id: string,
  messages: AiChatMessage[],
  totalTokens?: number
): void {
  const list = loadRawConversations();
  const conv = list.find((c) => c.id === id);
  if (!conv) return;

  conv.messages = messages;
  conv.updatedAt = Date.now();
  if (typeof totalTokens === "number" && Number.isFinite(totalTokens)) {
    conv.totalTokens = (conv.totalTokens || 0) + Math.max(0, Math.round(totalTokens));
  }

  // Update title from first user prompt if still default
  if (
    !conv.title ||
    conv.title === "Percakapan Baru" ||
    conv.title === "New Conversation" ||
    conv.title === t("aichat_new_chat")
  ) {
    const firstUserMsg = messages.find((m) => m.role === "user");
    if (firstUserMsg && firstUserMsg.content.trim()) {
      conv.title = generateTitleFromPrompt(firstUserMsg.content);
    }
  }

  saveRawConversations(list);
}

export function deleteConversation(id: string): void {
  const list = loadRawConversations();
  const filtered = list.filter((c) => c.id !== id);
  saveRawConversations(filtered);

  const activeId = getActiveConversationId();
  if (activeId === id) {
    setActiveConversationId(filtered[0]?.id || null);
  }
}

export function clearAllConversations(): void {
  saveRawConversations([]);
  setActiveConversationId(null);
}

