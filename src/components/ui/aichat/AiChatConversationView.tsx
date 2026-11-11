import React, { useEffect, useRef, useState } from "react";
import {
  Clipboard,
  AppWindow,
  Copy,
  Check,
  AlertTriangle,
  RotateCw,
  Image as ImageIcon,
  Loader2,
  Zap,
  ChevronDown,
  ChevronRight,
  Brain,
  Pencil,
} from "lucide-react";
import { Tooltip } from "../Tooltip";
import { AiBrandLogo, detectAiBrand } from "./AiBrandLogos";
import { AiNotchActionCard } from "./AiNotchActionCard";
import type { AiChatMessage, AiProviderId, AiModelConfig } from "./AiChatTypes";

interface AiChatConversationViewProps {
  messages: AiChatMessage[];
  isStreaming?: boolean;
  streamingTokens?: number;
  activeProvider?: AiProviderId;
  activeModel?: AiModelConfig;
  onRetryLast?: () => void;
  onOpenSettings?: () => void;
  onEscalateMessage?: (message: AiChatMessage) => void;
  onContinueMessage?: (message: AiChatMessage) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onPopulateInput?: (content: string) => void;
  accentColor?: string;
}

function resolveModelProvider(
  messageProvider?: AiProviderId,
  messageModelId?: string,
  messageModelName?: string,
  messageContent?: string,
  fallbackProvider?: AiProviderId,
  fallbackModelId?: string,
  fallbackModelName?: string
): string {
  // 1. If message itself has locked modelId or modelName, detect brand from it
  const brand = detectAiBrand(
    `${messageModelId || ""} ${messageModelName || ""}`,
    messageProvider && messageProvider !== "openrouter" && messageProvider !== "custom"
      ? messageProvider
      : undefined
  );
  if (brand && brand !== "custom") return brand;

  // 2. If message has explicit provider (not openrouter generic or custom proxy), return it
  if (messageProvider && messageProvider !== "openrouter" && messageProvider !== "custom") {
    return messageProvider;
  }

  // 3. DeepSeek signature reasoning preamble detection from content
  const contentLower = (messageContent || "").toLowerCase();
  if (
    contentLower.startsWith("we need answer in indonesian") ||
    contentLower.includes("deepseek")
  ) {
    return "deepseek";
  }

  // 4. Fallback only if message has no locked identity
  const fallbackBrand = detectAiBrand(
    `${fallbackModelId || ""} ${fallbackModelName || ""}`,
    fallbackProvider
  );
  if (fallbackBrand && fallbackBrand !== "custom") return fallbackBrand;

  return fallbackProvider || "claude";
}

const AiThinkingAccordion: React.FC<{
  reasoning: string;
  isStreaming?: boolean;
}> = ({ reasoning, isStreaming }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-2 max-w-full">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-[12px] bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 text-[11.5px] text-[#a1a1aa] hover:text-white transition-all cursor-pointer select-none"
      >
        <Brain size={12} className={isStreaming ? "text-purple-400 animate-pulse" : "text-purple-400"} />
        <span className="font-medium">
          {isStreaming ? "Sedang menalar..." : "Proses berpikir"}
        </span>
        {isOpen ? (
          <ChevronDown size={12} strokeWidth={2} />
        ) : (
          <ChevronRight size={12} strokeWidth={2} />
        )}
      </button>

      {isOpen && (
        <div
          data-no-swipe="true"
          className="mt-1.5 p-3 rounded-[14px] bg-black/40 border border-white/10 text-[12px] leading-relaxed text-[#a1a1aa] font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto select-text shadow-inner"
        >
          {reasoning}
        </div>
      )}
    </div>
  );
};

export const AiChatConversationView: React.FC<AiChatConversationViewProps> = ({
  messages,
  isStreaming = false,
  streamingTokens = 0,
  activeProvider,
  activeModel,
  onRetryLast,
  onOpenSettings,
  onEscalateMessage,
  onContinueMessage,
  onEditMessage,
  onPopulateInput,
  accentColor = "#3882F6",
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>("");
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming, streamingTokens]);

  useEffect(() => {
    if (editingId && editTextareaRef.current) {
      editTextareaRef.current.focus();
      const len = editTextareaRef.current.value.length;
      editTextareaRef.current.setSelectionRange(len, len);
    }
  }, [editingId]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleStartEdit = (msg: AiChatMessage) => {
    if (isStreaming) return;
    setEditingId(msg.id);
    setEditDraft(msg.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const handleSaveEdit = (messageId: string) => {
    const clean = editDraft.trim();
    if (!clean || isStreaming) return;
    if (onEditMessage) {
      onEditMessage(messageId, clean);
    }
    setEditingId(null);
    setEditDraft("");
  };

  return (
    <div
      data-scrollable="true"
      data-no-swipe="true"
      className="relative grow min-h-0 mt-3 flex flex-col justify-start gap-3.5 overflow-y-auto no-scrollbar pr-1 select-text"
    >
      {/* Top subtle fade gradient */}
      <div
        aria-hidden="true"
        className="sticky top-0 left-0 right-0 h-4 bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none"
      />

      {messages.map((message, idx) => {
        const isUser = message.role === "user";
        const isLastAssistant =
          !isUser && idx === messages.length - 1;

        if (isUser) {
          const isCurrentlyEditing = editingId === message.id;

          return (
            <div
              key={message.id}
              className="self-end max-w-[460px] flex flex-col items-end gap-1.5 shrink-0 group"
            >
              {/* Context Badge if attached */}
              {message.context && (
                <div className="flex items-center gap-1.5 h-[22px] px-2.5 rounded-full border border-white/10 bg-white/[0.05] text-[11px] text-[#a1a1aa]">
                  {message.context.type === "clipboard" ? (
                    <Clipboard size={11} strokeWidth={2} />
                  ) : message.context.type === "image" ? (
                    <ImageIcon size={11} strokeWidth={2} />
                  ) : (
                    <AppWindow size={11} strokeWidth={2} />
                  )}
                  <span className="truncate max-w-[240px]">
                    {message.context.title ||
                      (message.context.type === "clipboard"
                        ? `Clipboard · ${message.context.characterCount || 0} karakter`
                        : message.context.type === "image"
                        ? "Gambar terlampir"
                        : "Jendela aktif")}
                  </span>
                </div>
              )}

              {/* Attached Image Thumbnail */}
              {message.context?.imageDataUrl && (
                <img
                  src={message.context.imageDataUrl}
                  alt="Lampiran pengguna"
                  className="max-h-24 max-w-[200px] rounded-xl object-cover border border-white/15 shadow-sm"
                />
              )}

              {/* User Bubble or Inline Editor */}
              {isCurrentlyEditing ? (
                <div
                  data-no-swipe="true"
                  className="w-full min-w-[300px] max-w-[460px] p-3 rounded-[20px] bg-[#0c121e]/95 border border-blue-500/60 shadow-[0_8px_30px_rgba(56,130,246,0.2)] flex flex-col gap-2 shrink-0 select-text"
                >
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-semibold text-blue-400">
                      Edit Prompt
                    </span>
                    <span className="text-[10px] text-[#71717a]">
                      Enter: kirim ulang · Shift+Enter: baris baru · Esc: batal
                    </span>
                  </div>
                  <textarea
                    ref={editTextareaRef}
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSaveEdit(message.id);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        handleCancelEdit();
                      }
                    }}
                    rows={Math.min(6, Math.max(2, editDraft.split("\n").length))}
                    className="w-full bg-black/40 border border-white/12 rounded-[12px] p-2.5 text-[13px] text-white leading-relaxed resize-none focus:outline-none focus:border-blue-500/80 font-sans select-text no-scrollbar"
                    placeholder="Tulis prompt..."
                  />
                  <div className="flex items-center justify-between pt-0.5">
                    {onPopulateInput ? (
                      <button
                        type="button"
                        onClick={() => {
                          onPopulateInput(editDraft);
                          handleCancelEdit();
                        }}
                        title="Pindahkan teks prompt ini ke kolom input bawah"
                        className="h-7 px-2.5 rounded-full border border-white/10 hover:border-white/20 bg-white/[0.04] hover:bg-white/[0.08] text-[#a1a1aa] hover:text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                      >
                        <span>Ke bar input</span>
                      </button>
                    ) : <div />}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="h-7 px-3 rounded-full border border-white/10 hover:border-white/20 bg-white/[0.05] hover:bg-white/[0.1] text-[#a1a1aa] hover:text-white text-[11px] font-medium cursor-pointer transition-all active:scale-95"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={!editDraft.trim() || isStreaming}
                        onClick={() => handleSaveEdit(message.id)}
                        style={{
                          background: editDraft.trim() && !isStreaming ? accentColor : "rgba(255,255,255,0.1)",
                        }}
                        className="h-7 px-3.5 rounded-full text-[11px] font-semibold text-white disabled:text-white/40 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-95 shadow-sm"
                      >
                        Kirim ulang
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    data-no-swipe="true"
                    style={{
                      borderRadius: "20px 20px 6px 20px",
                      borderColor: "rgba(56,130,246,0.45)",
                      backgroundColor: "rgba(56,130,246,0.32)",
                    }}
                    className="px-4 py-2.5 border text-white text-[13.5px] leading-relaxed shadow-sm break-words whitespace-pre-wrap max-w-full select-text"
                  >
                    {message.content}
                  </div>

                  {/* Action row under user bubble: Copy & Edit */}
                  <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 group-hover:opacity-100 transition-opacity pr-0.5">
                    <Tooltip content={copiedId === message.id ? "Tersalin!" : "Salin prompt"}>
                      <button
                        type="button"
                        aria-label="Salin prompt"
                        onClick={() => handleCopy(message.id, message.content)}
                        className="w-[22px] h-[22px] rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.1] text-[#a1a1aa] hover:text-white flex items-center justify-center p-0 cursor-pointer active:scale-95 transition-all"
                      >
                        {copiedId === message.id ? (
                          <Check size={11} strokeWidth={2.4} className="text-emerald-400" />
                        ) : (
                          <Copy size={11} strokeWidth={2} />
                        )}
                      </button>
                    </Tooltip>
                    {!isStreaming && onEditMessage && (
                      <Tooltip content="Edit prompt">
                        <button
                          type="button"
                          aria-label="Edit prompt"
                          onClick={() => handleStartEdit(message)}
                          className="w-[22px] h-[22px] rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.1] text-[#a1a1aa] hover:text-white flex items-center justify-center p-0 cursor-pointer active:scale-95 transition-all"
                        >
                          <Pencil size={11} strokeWidth={2} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        }

        // Assistant Message or Error Alert
        if (message.error) {
          return (
            <div
              key={message.id}
              role="alert"
              className="flex gap-3 items-start max-w-[540px] p-3.5 rounded-[22px] bg-red-950/30 border border-red-500/35 shadow-[0_0_30px_rgba(255,107,90,0.12)] shrink-0"
            >
              <div className="w-8 h-8 rounded-xl bg-red-500/20 text-[#ff9b8f] flex items-center justify-center shrink-0">
                <AlertTriangle size={17} strokeWidth={2} />
              </div>
              <div className="min-w-0 grow">
                <div className="text-[13.5px] font-semibold text-[#ffb1a7]">
                  {message.error.includes("401")
                    ? "API key ditolak (401)"
                    : "Gagal menghubungkan ke AI"}
                </div>
                <div className="text-[12px] leading-relaxed text-[#d4d4d8] mt-0.5">
                  {message.error.includes("401")
                    ? "Penyedia tidak menerima key ini. Mungkin sudah dicabut atau salah salin. Pesanmu belum terkirim."
                    : message.error}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    style={{ background: accentColor }}
                    className="h-8 px-4 rounded-full text-black text-[12.5px] font-semibold cursor-pointer active:scale-95 shadow-sm"
                  >
                    Ganti API key
                  </button>
                  {onRetryLast && (
                    <button
                      type="button"
                      onClick={onRetryLast}
                      className="h-8 px-3.5 rounded-full border border-white/12 bg-white/[0.06] hover:bg-white/[0.12] text-[#e4e4e7] text-[12.5px] font-medium flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                    >
                      <RotateCw size={12} strokeWidth={2.2} />
                      Coba lagi
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        }

        const isCurrentlyStreaming = isLastAssistant && isStreaming;
        const isWaitingFirstToken =
          isCurrentlyStreaming && !message.content && !message.reasoning;
        const displayTokens = isCurrentlyStreaming
          ? streamingTokens
          : message.tokens || Math.max(1, Math.round(message.content.length / 4));

        const isMsgLocked = Boolean(message.provider || message.modelId);
        const msgProvider = resolveModelProvider(
          message.provider,
          message.modelId,
          message.modelName,
          message.content,
          isMsgLocked ? undefined : activeProvider,
          isMsgLocked ? undefined : activeModel?.id,
          isMsgLocked ? undefined : activeModel?.name
        );

        return (
          <div key={message.id} className="flex gap-2.5 items-start shrink-0">
            {/* AI Avatar with Model/Provider Brand Logo */}
            <Tooltip
              content={
                message.modelName ||
                (message.modelId ? message.modelId.split("/").pop() : undefined) ||
                msgProvider.toUpperCase()
              }
              side="right"
            >
              <div className="w-7 h-7 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5 overflow-hidden shadow-sm cursor-default">
                <AiBrandLogo provider={msgProvider} size={28} withContainer />
              </div>
            </Tooltip>

            <div className="min-w-0 grow">
              {/* Optional Collapsible Thinking Process */}
              {message.reasoning && (
                <AiThinkingAccordion
                  reasoning={message.reasoning}
                  isStreaming={isCurrentlyStreaming && !message.content}
                />
              )}

              {/* If waiting for first token, show animated thinking indicator */}
              {isWaitingFirstToken ? (
                <div className="flex items-center gap-2 h-8 px-3 rounded-[14px] bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[12.5px] font-medium w-fit animate-pulse">
                  <Loader2
                    size={13}
                    className="text-blue-400 animate-spin"
                  />
                  <span>Sedang berpikir...</span>
                  <span className="flex gap-1 items-center ml-0.5">
                    <span
                      className="w-1 h-1 rounded-full bg-blue-400 animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="w-1 h-1 rounded-full bg-blue-400 animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="w-1 h-1 rounded-full bg-blue-400 animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </span>
                </div>
              ) : message.content ? (
                <div
                  data-no-swipe="true"
                  className="text-[13.5px] leading-relaxed text-[#f4f4f5] break-words whitespace-pre-wrap select-text"
                >
                  {message.content}
                  {isCurrentlyStreaming && (
                    <span
                      aria-hidden="true"
                      style={{
                        background: accentColor,
                        boxShadow: `0 0 8px ${accentColor}`,
                      }}
                      className="inline-block w-[2px] h-4 ml-0.5 align-[-3px] rounded-sm animate-pulse"
                    />
                  )}
                </div>
              ) : null}

              {/* Optional Gili Notch Actions Executed by AI */}
              {message.notchActions && message.notchActions.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-2">
                  {message.notchActions.map((action, idx) => (
                    <AiNotchActionCard key={idx} action={action} />
                  ))}
                </div>
              )}

              {/* Token status badge & Copy button */}
              <div className="flex items-center gap-2 mt-2">
                <div
                  role="status"
                  className="inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full border border-white/10 bg-white/[0.05] text-[11px] text-[#a1a1aa] tabular-nums"
                >
                  <span
                    style={{
                      background: accentColor,
                      boxShadow: `0 0 8px ${accentColor}`,
                    }}
                    className={`w-1.5 h-1.5 rounded-full ${
                      isCurrentlyStreaming ? "animate-ping" : ""
                    }`}
                  />
                  <span>
                    {isWaitingFirstToken
                      ? "Menghubungkan ke model..."
                      : isCurrentlyStreaming
                      ? "Sedang menulis · "
                      : ""}
                    {!isWaitingFirstToken &&
                      `${displayTokens.toLocaleString("id-ID")} token`}
                  </span>
                </div>

                {/* Router Tier & Cost Badge (Protocol A1/A3) */}
                {message.tier && (
                  <Tooltip
                    content={`Model dipilih otomatis berdasarkan kesulitan (${message.tier === "T0" ? "Ringan & Cepat" : message.tier === "T1" ? "Standar" : "Kuat / Penalaran"}). Perkiraan biaya dihitung dari jumlah token.`}
                  >
                    <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-full border border-blue-500/30 bg-blue-500/10 text-[10.5px] font-medium text-blue-300">
                      <span>{message.tier}</span>
                      <span aria-hidden="true">·</span>
                      <span>{message.lengthMode === "compact" ? "Ringkas" : message.lengthMode === "detailed" ? "Lengkap" : "Normal"}</span>
                      {typeof message.estimatedCostIdr === "number" && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>~Rp {message.estimatedCostIdr.toLocaleString("id-ID")}</span>
                        </>
                      )}
                    </span>
                  </Tooltip>
                )}

                {/* Tombol Jawab Lebih Teliti */}
                {!isCurrentlyStreaming && message.content && onEscalateMessage && (
                  <Tooltip content="Jawab ulang dengan model yang lebih kuat">
                    <button
                      type="button"
                      onClick={() => onEscalateMessage(message)}
                      className="inline-flex items-center gap-1 h-[22px] px-2 rounded-full border border-white/10 hover:border-white/20 bg-white/[0.04] hover:bg-white/[0.08] text-[10.5px] font-medium text-[#c4c4cc] hover:text-white cursor-pointer active:scale-95 transition-all"
                    >
                      <Zap size={10} className="text-amber-400" />
                      <span>Jawab lebih teliti</span>
                    </button>
                  </Tooltip>
                )}

                {/* Penanda Pemotongan & Tombol Lanjutkan (Protocol A4) */}
                {!isCurrentlyStreaming && message.isTruncated && onContinueMessage && (
                  <Tooltip content="Jawaban terhenti batas panjang. Klik untuk melanjutkan.">
                    <button
                      type="button"
                      onClick={() => onContinueMessage(message)}
                      className="inline-flex items-center gap-1 h-[22px] px-2 rounded-full border border-amber-500/40 bg-amber-500/15 text-[10.5px] font-semibold text-amber-300 hover:bg-amber-500/25 cursor-pointer active:scale-95 transition-all"
                    >
                      <span>Lanjutkan</span>
                    </button>
                  </Tooltip>
                )}

                {!isCurrentlyStreaming && message.content && (
                  <Tooltip
                    content={
                      copiedId === message.id ? "Tersalin!" : "Salin jawaban"
                    }
                  >
                    <button
                      type="button"
                      aria-label="Salin jawaban"
                      onClick={() => handleCopy(message.id, message.content)}
                      className="w-[22px] h-[22px] rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.1] text-[#a1a1aa] hover:text-white flex items-center justify-center p-0 cursor-pointer active:scale-95 transition-all"
                    >
                      {copiedId === message.id ? (
                        <Check
                          size={11}
                          strokeWidth={2.4}
                          className="text-emerald-400"
                        />
                      ) : (
                        <Copy size={11} strokeWidth={2} />
                      )}
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div ref={bottomRef} className="h-1 shrink-0" />
    </div>
  );
};

