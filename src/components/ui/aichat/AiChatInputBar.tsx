import React, { useRef, useEffect, useState } from "react";
import {
  Plus,
  Image as ImageIcon,
  AppWindow,
  Clipboard,
  ChevronDown,
  Check,
  ArrowUp,
  Square,
  SlidersHorizontal,
} from "lucide-react";
import { Tooltip } from "../Tooltip";
import { t } from "../../../services/i18n";
import { readRasterImageFileForVision } from "../../../utils/imageUtils";
import type { ResponseLengthMode } from "./AiChatTypes";

interface ResponseLengthItem {
  id: ResponseLengthMode;
  label: string;
  sub: string;
}

const getResponseLengthOptions = (): ResponseLengthItem[] => [
  { id: "compact", label: t("aichat_mode_compact"), sub: t("aichat_mode_compact_sub") },
  { id: "normal", label: t("aichat_mode_normal"), sub: t("aichat_mode_normal_sub") },
  { id: "detailed", label: t("aichat_mode_detailed"), sub: t("aichat_mode_detailed_sub") },
];

interface AiChatInputBarProps {
  inputPrompt: string;
  onChangePrompt: (val: string) => void;
  onSend: () => void;
  onStopStreaming?: () => void;
  isStreaming?: boolean;
  onAttachImage?: () => void;
  onAttachImageContext?: (dataUrl: string, fileName?: string, fileSize?: number) => void;
  onReadWindow?: () => void;
  onAttachClipboard?: () => void;
  sessionTokens?: number;
  placeholder?: string;
  hasActiveContext?: boolean;
  accentColor?: string;
  responseLength?: ResponseLengthMode;
  onChangeResponseLength?: (mode: ResponseLengthMode) => void;
}

export const AiChatInputBar: React.FC<AiChatInputBarProps> = ({
  inputPrompt,
  onChangePrompt,
  onSend,
  onStopStreaming,
  isStreaming = false,
  onAttachImage,
  onAttachImageContext,
  onReadWindow,
  onAttachClipboard,
  sessionTokens = 0,
  placeholder,
  hasActiveContext = false,
  accentColor = "#3882F6",
  responseLength = "normal",
  onChangeResponseLength,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAttachOpen, setIsAttachOpen] = useState(false);
  const [isLengthOpen, setIsLengthOpen] = useState(false);
  const attachContainerRef = useRef<HTMLDivElement>(null);
  const lengthContainerRef = useRef<HTMLDivElement>(null);

  const lengthOptions = getResponseLengthOptions();
  const currentLengthOption =
    lengthOptions.find((o) => o.id === responseLength) || lengthOptions[1];
  const effectivePlaceholder = placeholder || t("aichat_input_placeholder_simple");

  useEffect(() => {
    // Focus automatically when not streaming
    if (!isStreaming) {
      inputRef.current?.focus();
    }
  }, [isStreaming]);

  useEffect(() => {
    if (!isAttachOpen && !isLengthOpen) return;

    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (isAttachOpen) {
        if (target.closest('[data-dropdown-trigger="ai-input-attach"]')) return;
        if (attachContainerRef.current && !attachContainerRef.current.contains(target)) {
          setIsAttachOpen(false);
        }
      }

      if (isLengthOpen) {
        if (target.closest('[data-dropdown-trigger="ai-input-length"]')) return;
        if (lengthContainerRef.current && !lengthContainerRef.current.contains(target)) {
          setIsLengthOpen(false);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsAttachOpen(false);
        setIsLengthOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAttachOpen, isLengthOpen]);

  const canSend = Boolean(inputPrompt.trim() || hasActiveContext);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && canSend) {
        onSend();
      }
    } else if (e.key === "Escape" && isStreaming && onStopStreaming) {
      e.preventDefault();
      onStopStreaming();
    }
  };

  const attachImageFile = async (file: File) => {
    const dataUrl = await readRasterImageFileForVision(file);
    if (dataUrl && onAttachImageContext) {
      onAttachImageContext(dataUrl, file.name || "Screenshot", Math.round(dataUrl.length * 0.75));
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    // Check if an image is in the clipboard (e.g. from screenshot or copied image)
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            void attachImageFile(file);
          }
          return;
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        void attachImageFile(file);
      }
    }
  };

  // Image/context-only messages without text can still be submitted.

  return (
    <div className="flex flex-col shrink-0 select-none w-full">
      {/* Floating capsule */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={handleDrop}
        className="flex items-center gap-2 h-12 rounded-[24px] border border-white/[0.14] bg-white/[0.06] pl-4 pr-1.5 transition-all shadow-[0_0_24px_rgba(56,130,246,0.14)] focus-within:border-blue-500/60"
        style={{
          boxShadow: `0 0 24px rgba(56,130,246,0.16)`,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputPrompt}
          onChange={(e) => onChangePrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onContextMenu={(e) => e.stopPropagation()}
          placeholder={effectivePlaceholder}
          aria-label={t("aichat_aria_message")}
          style={{ userSelect: "text" }}
          className="grow min-w-0 bg-transparent border-0 outline-none text-white text-[13.5px] placeholder-[#a1a1aa] font-sans select-text"
        />

        {/^\/(ringkas|lengkap|normal)/i.test(inputPrompt) && (
          <span className="h-5 px-2 rounded-full bg-blue-500/20 text-blue-300 text-[10.5px] font-semibold flex items-center shrink-0">
            {/^\/ringkas/i.test(inputPrompt)
              ? t("aichat_badge_compact")
              : /^\/lengkap/i.test(inputPrompt)
              ? t("aichat_badge_detailed")
              : t("aichat_badge_normal")}
          </span>
        )}

        {/* Response Length Style Dropdown */}
        <div ref={lengthContainerRef} className="relative shrink-0">
          <Tooltip content={t("aichat_tooltip_response_length")} side="top">
            <button
              type="button"
              data-dropdown-trigger="ai-input-length"
              aria-label={t("aichat_aria_select_length")}
              onClick={() => {
                setIsAttachOpen(false);
                setIsLengthOpen((prev) => !prev);
              }}
              className={`h-[34px] px-2.5 rounded-[17px] border-0 flex items-center gap-1.5 shrink-0 cursor-pointer transition-all active:scale-95 ${
                isLengthOpen
                  ? "bg-white/[0.18] text-white"
                  : "bg-white/[0.08] hover:bg-white/[0.14] text-[#e4e4e7]"
              }`}
            >
              <SlidersHorizontal size={13} className="text-[#a1a1aa]" />
              <span className="text-[12px] font-medium text-[#f4f4f5]">
                {currentLengthOption.label}
              </span>
              <ChevronDown
                size={12}
                className={`text-[#a1a1aa] transition-transform duration-200 ${
                  isLengthOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </Tooltip>

          {/* Response Length Menu (Opens Upward) */}
          {isLengthOpen && (
            <div
              data-scrollable="true"
              data-no-swipe="true"
              className="absolute right-0 bottom-full mb-2 z-40 w-52 p-1.5 rounded-[18px] bg-[#121217]/98 backdrop-blur-2xl border border-white/14 shadow-[0_12px_36px_rgba(0,0,0,0.7)] flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150 select-none"
            >
              <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider text-[#71717a] uppercase">
                {t("aichat_response_style_header")}
              </div>

              {lengthOptions.map((opt) => {
                const isSelected = (responseLength || "normal") === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setIsLengthOpen(false);
                      onChangeResponseLength?.(opt.id);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-[12px] transition-colors cursor-pointer text-left ${
                      isSelected
                        ? "bg-blue-600/25 text-white"
                        : "hover:bg-white/[0.08] text-[#d4d4d8]"
                    }`}
                  >
                    <div className="flex flex-col min-w-0 grow pr-2">
                      <span className={`text-[12.5px] ${isSelected ? "font-semibold text-white" : "font-medium"}`}>
                        {opt.label}
                      </span>
                      <span className="text-[10px] text-[#a1a1aa] leading-tight mt-0.5">
                        {opt.sub}
                      </span>
                    </div>
                    {isSelected && (
                      <Check size={14} strokeWidth={2.8} className="text-blue-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Attachment Dropdown Trigger (+) */}
        <div ref={attachContainerRef} className="relative shrink-0">
          <Tooltip content={t("aichat_tooltip_attach_content")} side="top">
            <button
              type="button"
              data-dropdown-trigger="ai-input-attach"
              aria-label={t("aichat_aria_attach_menu")}
              onClick={() => {
                setIsLengthOpen(false);
                setIsAttachOpen((prev) => !prev);
              }}
              className={`w-[34px] h-[34px] rounded-[17px] border-0 flex items-center justify-center p-0 shrink-0 cursor-pointer transition-all active:scale-95 ${
                hasActiveContext
                  ? "bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.6)]"
                  : isAttachOpen
                  ? "bg-white/[0.18] text-white"
                  : "bg-white/[0.08] hover:bg-white/[0.14] text-[#e4e4e7]"
              }`}
            >
              <Plus
                size={18}
                strokeWidth={2.4}
                className={`transition-transform duration-200 ${
                  isAttachOpen ? "rotate-45" : ""
                }`}
              />
            </button>
          </Tooltip>

          {/* Attachment Menu (Opens Upward) */}
          {isAttachOpen && (
            <div
              data-scrollable="true"
              data-no-swipe="true"
              className="absolute right-0 bottom-full mb-2 z-40 w-56 p-1.5 rounded-[18px] bg-[#121217]/98 backdrop-blur-2xl border border-white/14 shadow-[0_12px_36px_rgba(0,0,0,0.7)] flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150 select-none"
            >
              <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider text-[#71717a] uppercase">
                {t("aichat_attach_header")}
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsAttachOpen(false);
                  onAttachImage?.();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[12px] hover:bg-white/[0.08] transition-colors cursor-pointer text-left group"
              >
                <div className="w-7 h-7 rounded-[9px] bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <ImageIcon size={15} strokeWidth={2.2} />
                </div>
                <div className="flex flex-col min-w-0 grow">
                  <span className="text-[12.5px] font-medium text-white leading-tight">
                    {t("aichat_attach_image")}
                  </span>
                  <span className="text-[10px] text-[#a1a1aa] leading-tight mt-0.5">
                    {t("aichat_attach_image_desc")}
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAttachOpen(false);
                  onReadWindow?.();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[12px] hover:bg-white/[0.08] transition-colors cursor-pointer text-left group"
              >
                <div className="w-7 h-7 rounded-[9px] bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <AppWindow size={15} strokeWidth={2.2} />
                </div>
                <div className="flex flex-col min-w-0 grow">
                  <span className="text-[12.5px] font-medium text-white leading-tight">
                    {t("aichat_attach_window")}
                  </span>
                  <span className="text-[10px] text-[#a1a1aa] leading-tight mt-0.5">
                    {t("aichat_attach_window_desc")}
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAttachOpen(false);
                  onAttachClipboard?.();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[12px] hover:bg-white/[0.08] transition-colors cursor-pointer text-left group"
              >
                <div className="w-7 h-7 rounded-[9px] bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Clipboard size={15} strokeWidth={2.2} />
                </div>
                <div className="flex flex-col min-w-0 grow">
                  <span className="text-[12.5px] font-medium text-white leading-tight">
                    {t("aichat_attach_clipboard")}
                  </span>
                  <span className="text-[10px] text-[#a1a1aa] leading-tight mt-0.5">
                    {t("aichat_attach_clipboard_desc")}
                  </span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Send or Stop button */}
        {isStreaming ? (
          <Tooltip content={t("aichat_tooltip_stop_esc")} side="top">
            <button
              type="button"
              aria-label={t("aichat_tooltip_stop")}
              onClick={onStopStreaming}
              className="w-[34px] h-[34px] rounded-[17px] border-0 bg-[#f4f4f5] text-black hover:bg-white flex items-center justify-center p-0 shrink-0 cursor-pointer transition-all shadow-md active:scale-95"
            >
              <Square size={12} fill="currentColor" strokeWidth={0} />
            </button>
          </Tooltip>
        ) : (
          <Tooltip content={canSend ? t("aichat_tooltip_send_enter") : t("aichat_tooltip_type_first")} side="top">
            <button
              type="button"
              disabled={!canSend}
              aria-label={t("aichat_tooltip_send")}
              onClick={onSend}
              style={{
                backgroundColor: canSend ? accentColor : "rgba(255,255,255,0.08)",
                color: canSend ? "#000000" : "#7a7a86",
              }}
              className={`w-[34px] h-[34px] rounded-[17px] border-0 flex items-center justify-center p-0 shrink-0 transition-all ${
                canSend ? "cursor-pointer active:scale-95 shadow-md font-bold" : "cursor-default"
              }`}
            >
              <ArrowUp size={16} strokeWidth={2.4} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Helper Line */}
      <div className="flex justify-center items-center gap-3 h-3.5 mt-1.5 text-[11px] text-[#a1a1aa] tabular-nums select-none">
        {isStreaming ? (
          <>
            <span>{t("aichat_helper_esc_stop")}</span>
            <span aria-hidden="true">·</span>
            <span className="text-blue-400 font-medium animate-pulse">
              {t("aichat_helper_thinking")}
            </span>
            <span aria-hidden="true">·</span>
            <span>{t("aichat_helper_session_tokens", { count: sessionTokens.toLocaleString() })}</span>
          </>
        ) : (
          <>
            <span>{t("aichat_helper_enter_send")}</span>
            <span aria-hidden="true">·</span>
            <span>{t("aichat_helper_paste_hint")}</span>
            <span aria-hidden="true">·</span>
            {sessionTokens > 0 ? (
              <span>{t("aichat_helper_session_tokens", { count: sessionTokens.toLocaleString() })}</span>
            ) : (
              <span>{t("aichat_helper_paste_or_drag")}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AiChatInputBar;
