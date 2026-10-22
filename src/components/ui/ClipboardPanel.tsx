import React, { useState, useMemo } from "react";
import { Search, Trash2, Copy, Check, Clipboard, X, Link2, FileText } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { t, getLanguage } from "../../services/i18n";

export interface ClipboardItem {
  id: string;
  text: string;
  timestamp: number;
}

export interface ClipboardPanelProps {
  items: ClipboardItem[];
  onCopyItem: (item: ClipboardItem) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return t("clipboard_just_now");
  if (diffSec < 60) return t("clipboard_ago_s", { s: diffSec });
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t("clipboard_ago_m", { m: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t("clipboard_ago_h", { h: diffHour });
  const date = new Date(timestamp);
  const locale = getLanguage() === "id" ? "id-ID" : "en-US";
  return `${date.toLocaleDateString(locale, { month: "short", day: "numeric" })}`;
}

export const ClipboardPanel = React.memo<ClipboardPanelProps>(({
  items,
  onCopyItem,
  onDeleteItem,
  onClearAll,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => item.text.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const handleCopy = (item: ClipboardItem) => {
    onCopyItem(item);
    setCopiedId(item.id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === item.id ? null : prev));
    }, 1500);
  };

  return (
    <div className="flex flex-col w-full h-full min-h-0 px-2.5 select-none overflow-hidden pb-1">
      {/* Top Search & Actions Bar (iOS Spotlight Style) */}
      <div className="flex items-center gap-2 mb-2 px-0.5 shrink-0">
        <div className="relative flex-1 flex items-center bg-[#1c1c1e]/90 border border-white/10 rounded-2xl px-3 py-1.5 focus-within:border-[#0a84ff]/60 focus-within:ring-2 focus-within:ring-[#0a84ff]/20 transition-all shadow-sm">
          <Search size={13} className="text-white/40 shrink-0 mr-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("clipboard_search_placeholder")}
            className="w-full bg-transparent text-[11.5px] text-white placeholder-white/30 outline-none leading-none font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            >
              <X size={10} />
            </button>
          )}
        </div>

        {items.length > 0 && (
          <Tooltip content={t("clipboard_clear")} side="left">
            <button
              onClick={onClearAll}
              className="h-[29px] px-2.5 bg-red-500/10 hover:bg-red-500/20 text-[#ff453a] border border-red-500/20 rounded-xl flex items-center gap-1.5 text-[11px] font-semibold transition-all shrink-0 cursor-pointer active:scale-95 shadow-sm"
            >
              <Trash2 size={11} />
              <span>{t("clipboard_clear_btn")}</span>
            </button>
          </Tooltip>
        )}
      </div>

      {/* Clipboard History List (iOS Inset Grouped cards) */}
      <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1.5 pr-0.5 min-h-0">
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-4">
            <div className="w-12 h-12 rounded-[18px] bg-white/5 border border-white/10 flex items-center justify-center text-white/30 mb-2.5 shadow-inner">
              <Clipboard size={22} />
            </div>
            <p className="text-[12.5px] font-semibold text-white/80">{t("clipboard_no_history")}</p>
            <p className="text-[11px] text-white/40 mt-1 max-w-[220px] leading-relaxed">
              {t("clipboard_no_history_sub")}
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
            <p className="text-xs text-white/50 font-medium">{t("clipboard_no_results")}</p>
            <p className="text-[10px] text-white/30 mt-0.5">{t("clipboard_no_results_sub")}</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isCopied = copiedId === item.id;
            const isUrl = /^https?:\/\//i.test(item.text.trim());

            return (
              <div
                key={item.id}
                onClick={() => handleCopy(item)}
                className={`group relative flex flex-col rounded-2xl p-2.5 border transition-all cursor-pointer ${
                  isCopied
                    ? "border-[#0a84ff]/50 bg-[#0a84ff]/15 shadow-[0_0_16px_rgba(10,132,255,0.2)]"
                    : "bg-[#1c1c1e]/85 border-white/5 hover:border-white/15 hover:bg-[#252528]/90 shadow-sm"
                }`}
              >
                {/* Item Meta Header */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[9.5px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        isUrl
                          ? "bg-[#0a84ff]/20 text-[#0a84ff]"
                          : "bg-white/10 text-white/60"
                      }`}
                    >
                      {isUrl ? <Link2 size={10} /> : <FileText size={10} />}
                      {isUrl ? "Link" : t("clipboard_chars", { count: item.text.length })}
                    </span>
                    <span className="text-[10px] text-white/35 font-medium tabular-nums">
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {isCopied && (
                      <span className="text-[10px] text-[#34c759] font-bold flex items-center gap-1 pr-1 animate-pulse">
                        <Check size={11} strokeWidth={2.5} />
                        Copied
                      </span>
                    )}
                    <Tooltip content={t("clipboard_copy_tip")} side="top">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(item);
                        }}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                          isCopied 
                            ? "bg-[#34c759]/20 text-[#34c759]" 
                            : "text-white/40 hover:text-white hover:bg-white/15"
                        }`}
                      >
                        {isCopied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} />}
                      </button>
                    </Tooltip>
                    <Tooltip content={t("clipboard_delete_tip")} side="top">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteItem(item.id);
                        }}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white/30 hover:text-[#ff453a] hover:bg-red-500/15 transition-colors cursor-pointer opacity-60 group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    </Tooltip>
                  </div>
                </div>

                {/* Text Content */}
                <div className="text-[11.5px] text-white/80 line-clamp-2 break-words font-sans leading-snug group-hover:text-white transition-colors">
                  {item.text}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
