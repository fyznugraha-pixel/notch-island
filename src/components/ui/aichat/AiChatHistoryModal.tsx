import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  Plus,
  Trash2,
  Clock,
  MessageSquare,
  Check,
} from "lucide-react";
import { Tooltip } from "../Tooltip";
import { t } from "../../../services/i18n";
import {
  getConversations,
  deleteConversation,
  clearAllConversations,
  getAutoCleanupDays,
  setAutoCleanupDays,
  pruneInactiveConversations,
} from "../../../services/aiConversationService";
import type { AiConversation, AutoCleanupDays } from "./AiChatTypes";

interface AiChatHistoryModalProps {
  activeConversationId: string | null;
  onSelectConversation: (conv: AiConversation) => void;
  onNewConversation: () => void;
  onBack: () => void;
  accentColor?: string;
}

const getCleanupOptions = (): { days: AutoCleanupDays; label: string }[] => [
  { days: 3, label: t("aichat_history_days_3") },
  { days: 7, label: t("aichat_history_days_7") },
  { days: 30, label: t("aichat_history_days_30") },
  { days: 0, label: t("aichat_history_days_never") },
];

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t("aichat_time_just_now");
  if (minutes < 60) return t("aichat_time_minutes_ago", { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("aichat_time_hours_ago", { hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("aichat_time_yesterday");
  if (days < 7) return t("aichat_time_days_ago", { days });
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return t("aichat_time_weeks_ago", { weeks });
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export const AiChatHistoryModal: React.FC<AiChatHistoryModalProps> = ({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onBack,
  accentColor = "#3882F6",
}) => {
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [cleanupDays, setCleanupDaysState] = useState<AutoCleanupDays>(getAutoCleanupDays);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  const refreshList = () => {
    const list = getConversations();
    setConversations(list);
  };

  useEffect(() => {
    refreshList();
  }, []);

  const handleCleanupChange = (days: AutoCleanupDays) => {
    setAutoCleanupDays(days);
    setCleanupDaysState(days);
    const cleanupOptions = getCleanupOptions();
    const pruned = pruneInactiveConversations(days);
    refreshList();
    if (days > 0) {
      const label = cleanupOptions.find((o) => o.days === days)?.label || `${days}d`;
      setFeedbackNotice(
        pruned > 0
          ? t("aichat_history_auto_prune_notice_cleared", { label, pruned })
          : t("aichat_history_auto_prune_notice_active", { label })
      );
    } else {
      setFeedbackNotice(t("aichat_history_auto_prune_disabled"));
    }
    setTimeout(() => setFeedbackNotice(null), 3000);
  };

  const handleDeleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteConversation(id);
    setConfirmDeleteId(null);
    refreshList();
  };

  const handleClearAll = () => {
    clearAllConversations();
    setIsConfirmingClearAll(false);
    refreshList();
    setFeedbackNotice(t("aichat_history_clear_all_done"));
    setTimeout(() => setFeedbackNotice(null), 2500);
  };

  return (
    <div className="grow flex flex-col justify-between w-full h-full select-none pt-2 overflow-hidden text-white">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          aria-label={t("aichat_history_back_tooltip")}
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-[#17171c] hover:bg-[#23232a] active:scale-95 text-[#e4e4e7] flex items-center justify-center p-0 cursor-pointer transition-all"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        <div className="flex items-center gap-2 grow">
          <Clock size={17} style={{ color: accentColor }} />
          <div className="text-[17px] font-semibold tracking-[-0.02em] text-white">
            {t("aichat_history_title")}
          </div>
          <span className="text-[11px] font-medium text-[#71717a] px-2 py-0.5 rounded-full bg-white/[0.06]">
            {t("aichat_history_session_count", { count: conversations.length })}
          </span>
        </div>

        {/* Start New Conversation Button */}
        <Tooltip content={t("aichat_history_new_chat_tooltip")} side="bottom">
          <button
            type="button"
            aria-label={t("aichat_history_new_chat_tooltip")}
            onClick={onNewConversation}
            className="h-8 px-3 rounded-[14px] border border-blue-500/30 bg-blue-500/15 hover:bg-blue-500/25 active:scale-95 text-blue-400 text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Plus size={14} strokeWidth={2.4} />
            <span>{t("aichat_history_new_chat")}</span>
          </button>
        </Tooltip>
      </div>

      {/* Auto-Cleanup Settings Bar */}
      <div className="mt-3 px-3 py-2.5 rounded-[16px] bg-white/[0.04] border border-white/10 shrink-0 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-[0.04em] text-[#a1a1aa] uppercase">
            {t("aichat_history_auto_prune_header")}
          </span>
          {feedbackNotice && (
            <span className="text-[11px] font-medium text-blue-400 animate-in fade-in">
              {feedbackNotice}
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1.5 pt-0.5">
          {getCleanupOptions().map((opt) => {
            const isSelected = cleanupDays === opt.days;
            return (
              <button
                key={opt.days}
                type="button"
                onClick={() => handleCleanupChange(opt.days)}
                style={
                  isSelected
                    ? {
                        backgroundColor: "rgba(56,130,246,0.25)",
                        borderColor: "rgba(56,130,246,0.5)",
                        color: "#93c5fd",
                      }
                    : undefined
                }
                className={`h-7 px-2 text-[11px] font-medium rounded-[10px] border flex items-center justify-center gap-1 transition-all active:scale-95 hover:text-white cursor-pointer ${
                  isSelected
                    ? ""
                    : "bg-white/[0.03] border-white/[0.08] text-[#a1a1aa]"
                }`}
              >
                {isSelected && <Check size={11} strokeWidth={2.5} />}
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation List */}
      <div className="mt-2.5 grow min-h-0 overflow-y-auto settings-scroll pr-1 flex flex-col gap-1.5">
        {conversations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-2 text-[#71717a]">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-[#a1a1aa]">
              <MessageSquare size={22} strokeWidth={1.7} />
            </div>
            <div className="text-[14px] font-medium text-white">
              {t("aichat_history_empty")}
            </div>
            <div className="text-[12px] text-[#71717a] max-w-[280px]">
              {t("aichat_history_empty_desc")}
            </div>
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isConfirming = confirmDeleteId === conv.id;
            const lastMessage = conv.messages[conv.messages.length - 1];
            const previewSnippet = lastMessage
              ? lastMessage.content.replace(/[\r\n\t]+/g, " ").trim()
              : t("aichat_history_no_messages");

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv)}
                style={
                  isActive
                    ? {
                        backgroundColor: "rgba(56,130,246,0.18)",
                        borderColor: "rgba(56,130,246,0.42)",
                      }
                    : undefined
                }
                className={`group relative flex items-center justify-between p-2.5 rounded-[16px] border hover:border-white/20 hover:bg-white/[0.06] transition-all cursor-pointer select-none ${
                  isActive ? "" : "bg-white/[0.03] border-white/[0.07]"
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0 grow pr-2">
                  <div
                    className={`mt-0.5 w-7 h-7 rounded-[10px] shrink-0 flex items-center justify-center ${
                      isActive
                        ? "bg-blue-500/25 text-blue-400 border border-blue-500/40"
                        : "bg-white/[0.05] text-[#a1a1aa] border border-white/10"
                    }`}
                  >
                    <MessageSquare size={13} strokeWidth={2} />
                  </div>

                  <div className="flex flex-col min-w-0 grow">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-white truncate max-w-[320px]">
                        {conv.title || t("aichat_history_default_title")}
                      </span>
                      {isActive && (
                        <span className="text-[9.5px] font-semibold px-1.5 py-0.2 rounded-full bg-blue-500/25 text-blue-300 border border-blue-500/40">
                          {t("aichat_history_active_badge")}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-[#71717a] truncate max-w-[360px] mt-0.5">
                      {previewSnippet}
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-[10px] text-[#a1a1aa]">
                      <span className="uppercase tracking-wider font-semibold text-[#60a5fa]">
                        {conv.providerId}
                      </span>
                      <span>•</span>
                      <span>{t("aichat_history_message_count", { count: conv.messages.length })}</span>
                      <span>•</span>
                      <span>{formatRelativeTime(conv.updatedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Action: Delete / Confirm Delete */}
                <div className="shrink-0 flex items-center pl-2">
                  {isConfirming ? (
                    <div
                      className="flex items-center gap-1.5 animate-in fade-in"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleDeleteItem(e, conv.id)}
                        className="h-6 px-2 rounded-md bg-red-600/80 hover:bg-red-500 text-white text-[10.5px] font-medium cursor-pointer transition-all"
                      >
                        {t("action_delete")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="h-6 px-2 rounded-md bg-white/10 hover:bg-white/15 text-[#e4e4e7] text-[10.5px] font-medium cursor-pointer transition-all"
                      >
                        {t("action_cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={t("aichat_history_delete_tooltip")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(conv.id);
                      }}
                      className="w-7 h-7 rounded-[8px] opacity-60 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 text-[#a1a1aa] flex items-center justify-center cursor-pointer transition-all"
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Bar */}
      <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between shrink-0">
        {conversations.length > 0 ? (
          isConfirmingClearAll ? (
            <div className="flex items-center gap-2 animate-in fade-in">
              <span className="text-[11px] text-red-400 font-medium">
                {t("aichat_history_clear_all_confirm")}
              </span>
              <button
                type="button"
                onClick={handleClearAll}
                className="h-6 px-2.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold cursor-pointer transition-all"
              >
                {t("aichat_history_clear_all_yes")}
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingClearAll(false)}
                className="h-6 px-2 rounded-md bg-white/10 hover:bg-white/15 text-[#e4e4e7] text-[11px] font-medium cursor-pointer transition-all"
              >
                {t("action_cancel")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirmingClearAll(true)}
              className="text-[11.5px] font-medium text-[#71717a] hover:text-red-400 flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Trash2 size={13} />
              <span>{t("aichat_history_clear_all_btn")}</span>
            </button>
          )
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={onBack}
          className="h-7 px-3.5 rounded-[12px] bg-white/[0.08] hover:bg-white/[0.14] active:scale-95 text-[#e4e4e7] text-[12px] font-medium cursor-pointer transition-all ml-auto"
        >
          {t("action_close")}
        </button>
      </div>
    </div>
  );
};

export default AiChatHistoryModal;
